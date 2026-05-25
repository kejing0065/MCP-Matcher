"""
reconcile.py — Multi-Scenario Reconciliation Router

Endpoints:
  POST /reconcile                        — Single-entity reconcile (S1, backward compat)
  POST /reconcile/multi                  — Multi-entity reconcile (S1–S8)
  GET  /reconcile/dashboard              — Full dashboard with stats and groups
  GET  /reconcile/groups                 — All match groups
  PATCH /reconcile/groups/{id}/decision  — Human approve/reject/partial a group
  PATCH /reconcile/results/{id}/decision — Human approve/reject a single result
  GET  /reconcile/agent-logs/{id}        — Audit trail for a match result
"""
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException

from db.supabase_client import get_supabase
from models.schemas import (
    ReconcileRequest,
    MultiReconcileRequest,
    DecisionRequest,
    GroupDecisionRequest,
)
from services import fx, chutes, matcher

router = APIRouter()


# ─── Helper: log an action to agent_logs ─────────────────────────────────────

def _log(db, action: str, detail: str, invoice_id: str = None, match_result_id: str = None):
    entry = {"action": action, "detail": detail}
    if invoice_id:
        entry["invoice_id"] = invoice_id
    if match_result_id:
        entry["match_result_id"] = match_result_id
    db.table("agent_logs").insert(entry).execute()


# ─── Helper: get all claimed transaction IDs (for duplicate detection) ────────

def _get_claimed_tx_ids(db) -> set:
    """Fetch all bank_transaction_ids already used in match_results."""
    res = db.table("match_results").select("bank_transaction_id").execute()
    return {str(r["bank_transaction_id"]) for r in (res.data or []) if r.get("bank_transaction_id")}


# ─── POST /reconcile  (single-entity, backward compatible) ───────────────────

@router.post("")
async def reconcile(req: ReconcileRequest):
    """
    Single-entity orchestration pipeline (S1 backward compat):
    1. Fetch invoice
    2. FX convert using invoice_date
    3. Parse ALL bank descriptions
    4. Match transaction (pure Python scoring)
    5. Classify exception if needed
    6. Log every step
    """
    db = get_supabase()
    invoice_id = req.invoice_id

    # Step 1 — Fetch invoice
    inv_result = db.table("invoices").select("*").eq("id", invoice_id).execute()
    if not inv_result.data:
        raise HTTPException(status_code=404, detail=f"Invoice {invoice_id} not found")
    invoice = inv_result.data[0]
    _log(db, "fetch_invoice", f"Fetched invoice {invoice.get('invoice_no')}", invoice_id=invoice_id)

    # Step 2 — FX conversion
    currency = invoice.get("currency", "USD")
    amount = invoice.get("amount", 0)
    invoice_date = invoice.get("invoice_date")

    if not invoice_date:
        raise HTTPException(status_code=422, detail="Invoice has no invoice_date for FX lookup")

    try:
        fx_result = await fx.convert(amount, currency, "MYR", invoice_date)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=f"FX API error: {e}")

    expected_myr = fx_result["converted_amount"]
    rate = fx_result["rate_used"]
    fx_date = fx_result["date_used"]
    fx_source = fx_result.get("fx_source", "FX API")

    db.table("invoices").update({
        "expected_myr": expected_myr,
        "fx_rate": rate,
        "fx_date": fx_date,
    }).eq("id", invoice_id).execute()

    invoice["expected_myr"] = expected_myr
    invoice["fx_rate"] = rate
    invoice["fx_date"] = fx_date
    invoice["fx_source"] = fx_source

    _log(db, "fx_convert", f"{currency} {amount} → MYR {expected_myr} @ {rate} on {fx_date} ({fx_source})", invoice_id=invoice_id)

    # Step 3 — Parse ALL bank descriptions
    tx_result = db.table("bank_transactions").select("*").in_("id", req.bank_transaction_ids).execute()
    if not tx_result.data:
        raise HTTPException(status_code=404, detail="No bank transactions found")

    bank_txs = tx_result.data

    for tx in bank_txs:
        try:
            parsed = await chutes.parse_bank_description(tx.get("description", ""))
            update_data = {}
            if parsed.get("customer_name"):
                update_data["parsed_customer"] = parsed["customer_name"]
            if parsed.get("invoice_reference"):
                update_data["parsed_reference"] = parsed["invoice_reference"]
            if update_data:
                db.table("bank_transactions").update(update_data).eq("id", tx["id"]).execute()
                tx.update(update_data)
            _log(db, "parse_description", f"tx {tx['id']}: customer={parsed.get('customer_name')} ref={parsed.get('invoice_reference')}", invoice_id=invoice_id)
        except Exception as e:
            _log(db, "parse_description_error", f"tx {tx['id']} failed: {e}", invoice_id=invoice_id)

    # Step 4 — Duplicate detection
    claimed_tx_ids = _get_claimed_tx_ids(db)

    # Step 5 — Filter to likely matching transactions for this invoice
    candidate_txs = matcher.filter_transactions_for_invoice(invoice, bank_txs)

    # Step 6 — Detect scenario and match
    scenario = matcher.detect_scenario([invoice], candidate_txs, claimed_tx_ids)
    best = matcher.best_match(invoice, candidate_txs)
    best_tx = best["transaction"]

    # Compute partial / bank fee info
    partial_info = matcher.detect_partial(expected_myr, best_tx.get("credit_amount") or 0.0)
    bank_fee_info = matcher.detect_bank_fee(expected_myr, best_tx.get("credit_amount") or 0.0)

    # Override status for special scenarios
    status = best["status"]
    if scenario == "s6_duplicate":
        status = "exception"
    elif scenario == "s5_partial" and status != "exception":
        status = "review"  # partial stays in review queue

    match_insert = {
        "invoice_id": invoice_id,
        "bank_transaction_id": best_tx["id"],
        "confidence": best["confidence"],
        "status": status,
        "variance": best["variance"],
        "variance_pct": best["variance_pct"],
        "reason": best["reason"],
        "scenario_type": scenario,
        "paid_amount_myr": best_tx.get("credit_amount") or 0.0,
        "remaining_amount_myr": partial_info["remaining_myr"],
        "is_partial": partial_info["is_partial"],
    }
    match_result = db.table("match_results").insert(match_insert).execute()
    if not match_result.data:
        raise HTTPException(status_code=500, detail="Failed to save match result")

    match_id = match_result.data[0]["id"]

    _log(
        db, "match",
        f"scenario={scenario} confidence={best['confidence']} status={status} variance={best['variance']}",
        invoice_id=invoice_id,
        match_result_id=match_id,
    )

    # Step 6 — Classify exception if needed
    exception_type = None
    exception_explanation = None

    if status in ("review", "exception") or scenario in ("s5_partial", "s6_duplicate", "s8_bank_fee"):
        try:
            classification = await chutes.classify_exception(invoice, best_tx, {**match_insert, "id": match_id})
            exception_type = classification["exception_type"]
            exception_explanation = classification["exception_explanation"]

            db.table("match_results").update({
                "exception_type": exception_type,
                "exception_explanation": exception_explanation,
            }).eq("id", match_id).execute()

            _log(db, "classify_exception", f"type={exception_type}", invoice_id=invoice_id, match_result_id=match_id)
        except Exception as e:
            _log(db, "classify_exception_error", str(e), invoice_id=invoice_id, match_result_id=match_id)

    return {
        "invoice_id": invoice_id,
        "match_result_id": match_id,
        "status": status,
        "scenario_type": scenario,
        "confidence": best["confidence"],
        "variance": best["variance"],
        "variance_pct": best["variance_pct"],
        "reason": best["reason"],
        "fx_rate": rate,
        "fx_date": fx_date,
        "fx_source": fx_source,
        "expected_myr": expected_myr,
        "exception_type": exception_type,
        "exception_explanation": exception_explanation,
        "score_breakdown": best["score_breakdown"],
        "is_partial": partial_info["is_partial"],
        "remaining_amount_myr": partial_info["remaining_myr"],
        "coverage_pct": partial_info["coverage_pct"],
    }


# ─── POST /reconcile/multi  (multi-entity, all scenarios) ────────────────────

@router.post("/multi")
async def reconcile_multi(req: MultiReconcileRequest):
    """
    Multi-entity reconciliation supporting all 8 scenarios.
    Accepts multiple invoice IDs and multiple bank transaction IDs.
    Creates a match_group record and individual match_results for each invoice.
    """
    db = get_supabase()

    if not req.invoice_ids:
        raise HTTPException(status_code=422, detail="At least one invoice_id is required")
    if not req.bank_transaction_ids:
        raise HTTPException(status_code=422, detail="At least one bank_transaction_id is required")

    # Step 1 — Fetch all invoices
    inv_result = db.table("invoices").select("*").in_("id", req.invoice_ids).execute()
    if not inv_result.data:
        raise HTTPException(status_code=404, detail="No invoices found")

    invoices = inv_result.data
    found_inv_ids = [inv["id"] for inv in invoices]
    _log(db, "fetch_invoices", f"Fetched {len(invoices)} invoices: {[inv.get('invoice_no') for inv in invoices]}")

    # Step 2 — FX convert each invoice
    for invoice in invoices:
        currency = invoice.get("currency", "USD")
        amount = invoice.get("amount", 0)
        invoice_date = invoice.get("invoice_date")

        if not invoice_date:
            continue  # Skip FX if no date

        if not invoice.get("expected_myr"):
            try:
                fx_result = await fx.convert(amount, currency, "MYR", invoice_date)
                expected_myr = fx_result["converted_amount"]
                rate = fx_result["rate_used"]
                fx_date_val = fx_result["date_used"]
                fx_source = fx_result.get("fx_source", "FX API")

                db.table("invoices").update({
                    "expected_myr": expected_myr,
                    "fx_rate": rate,
                    "fx_date": fx_date_val,
                }).eq("id", invoice["id"]).execute()

                invoice["expected_myr"] = expected_myr
                invoice["fx_rate"] = rate
                invoice["fx_date"] = fx_date_val
                invoice["fx_source"] = fx_source

                _log(db, "fx_convert",
                     f"{invoice.get('invoice_no')}: {currency} {amount} → MYR {expected_myr} @ {rate} on {fx_date_val} ({fx_source})",
                     invoice_id=invoice["id"])
            except RuntimeError as e:
                _log(db, "fx_convert_error", f"{invoice.get('invoice_no')}: {e}", invoice_id=invoice["id"])
                raise HTTPException(status_code=503, detail=f"FX API error for invoice {invoice.get('invoice_no')}: {e}")

    # Step 3 — Fetch and parse all bank transactions
    tx_result = db.table("bank_transactions").select("*").in_("id", req.bank_transaction_ids).execute()
    if not tx_result.data:
        raise HTTPException(status_code=404, detail="No bank transactions found")

    bank_txs = tx_result.data

    for tx in bank_txs:
        if not tx.get("parsed_customer") and not tx.get("parsed_reference"):
            try:
                parsed = await chutes.parse_bank_description(tx.get("description", ""))
                update_data = {}
                if parsed.get("customer_name"):
                    update_data["parsed_customer"] = parsed["customer_name"]
                if parsed.get("invoice_reference"):
                    update_data["parsed_reference"] = parsed["invoice_reference"]
                if update_data:
                    db.table("bank_transactions").update(update_data).eq("id", tx["id"]).execute()
                    tx.update(update_data)
                _log(db, "parse_description", f"tx {tx['id']}: customer={parsed.get('customer_name')} ref={parsed.get('invoice_reference')}")
            except Exception as e:
                _log(db, "parse_description_error", f"tx {tx['id']} failed: {e}")

    # Step 4 — Detect scenario and run group match
    claimed_tx_ids = _get_claimed_tx_ids(db)

    def _norm_ref(text: str) -> str:
        return "".join(ch for ch in (text or "").lower() if ch.isalnum())

    invoice_refs = {_norm_ref(inv.get("invoice_no", "")) for inv in invoices if inv.get("invoice_no")}
    referenced_txs = []
    if invoice_refs:
        for tx in bank_txs:
            combined = " ".join(filter(None, [tx.get("parsed_reference"), tx.get("description")]))
            combined_norm = _norm_ref(combined)
            if any(ref and ref in combined_norm for ref in invoice_refs):
                referenced_txs.append(tx)

    filtered_txs = referenced_txs if referenced_txs else bank_txs
    scenario = matcher.detect_scenario(invoices, filtered_txs, claimed_tx_ids)

    # Select the most relevant subset to avoid showing unrelated transactions
    candidate_invoices = invoices
    candidate_txs = filtered_txs

    if scenario == "s2_split" and len(invoices) == 1:
        subset = matcher.find_best_transaction_subset_for_invoice(invoices[0], bank_txs)
        if subset:
            candidate_txs = subset
    elif scenario == "s3_consolidated":
        best_tx = None
        best_subset = None
        best_diff = float("inf")
        for tx in bank_txs:
            subset = matcher.find_best_invoice_subset_for_transaction(invoices, tx)
            if not subset:
                continue
            total_expected = sum((inv.get("expected_myr") or 0.0) for inv in subset)
            received = tx.get("credit_amount") or 0.0
            if total_expected <= 0:
                continue
            diff_pct = abs(received - total_expected) / total_expected * 100
            if diff_pct < best_diff:
                best_diff = diff_pct
                best_tx = tx
                best_subset = subset
        if best_tx and best_subset:
            candidate_txs = [best_tx]
            candidate_invoices = best_subset
    elif scenario == "s4_complex":
        total_expected = sum((inv.get("expected_myr") or 0.0) for inv in invoices)
        subset = matcher.find_best_transaction_subset_for_group(total_expected, bank_txs)
        if subset:
            candidate_txs = subset

    group_result = matcher.group_match(candidate_invoices, candidate_txs, claimed_tx_ids)
    scenario = group_result["scenario_type"]
    status = group_result["status"]

    _log(db, "group_match_detected",
         f"scenario={scenario} confidence={group_result['confidence']} status={status} "
         f"coverage={group_result['coverage_pct']}% variance={group_result['total_variance_myr']}")

    # Step 5 — Classify group exception via AI if needed
    exception_type = None
    exception_explanation = None

    if status in ("review", "exception", "partial") or scenario in ("s5_partial", "s6_duplicate", "s8_bank_fee"):
        try:
            classification = await chutes.classify_group_exception(candidate_invoices, candidate_txs, group_result)
            exception_type = classification["exception_type"]
            exception_explanation = classification["exception_explanation"]
            _log(db, "classify_group_exception", f"type={exception_type}")
        except Exception as e:
            _log(db, "classify_group_exception_error", str(e))

    # Step 6 — Save match_group record
    group_insert = {
        "scenario_type": scenario,
        "invoice_ids": [inv["id"] for inv in candidate_invoices],
        "bank_transaction_ids": [tx["id"] for tx in candidate_txs],
        "total_expected_myr": group_result["total_expected_myr"],
        "total_received_myr": group_result["total_received_myr"],
        "total_variance_myr": group_result["total_variance_myr"],
        "coverage_pct": group_result["coverage_pct"],
        "status": status,
        "confidence": group_result["confidence"],
        "exception_type": exception_type,
        "exception_explanation": exception_explanation,
    }
    group_db_result = db.table("match_groups").insert(group_insert).execute()
    if not group_db_result.data:
        raise HTTPException(status_code=500, detail="Failed to save match group")

    group_id = group_db_result.data[0]["id"]
    _log(db, "match_group_created", f"match_group {group_id} created")

    # Step 7 — Create individual match_result records for each invoice
    # For S3 consolidated: all invoices linked to the single best transaction
    # For S2 split: single invoice linked to best transaction (we record the group_id for context)
    # For S4 complex / S1: best match per invoice
    match_result_ids = []

    for invoice in candidate_invoices:
        # Find best matching transaction for this invoice
        try:
            best = matcher.best_match(invoice, candidate_txs)
            best_tx = best["transaction"]
        except ValueError:
            continue

        partial_info = matcher.detect_partial(
            invoice.get("expected_myr") or 0.0,
            best_tx.get("credit_amount") or 0.0,
        )

        mr_status = "partial" if partial_info["is_partial"] and (best_tx.get("credit_amount") or 0.0) < (invoice.get("expected_myr") or 0.0) else status

        mr_insert = {
            "invoice_id": invoice["id"],
            "bank_transaction_id": best_tx["id"],
            "confidence": best["confidence"],
            "status": mr_status,
            "variance": best["variance"],
            "variance_pct": best["variance_pct"],
            "reason": best["reason"],
            "scenario_type": scenario,
            "match_group_id": group_id,
            "paid_amount_myr": best_tx.get("credit_amount") or 0.0,
            "remaining_amount_myr": partial_info["remaining_myr"],
            "is_partial": partial_info["is_partial"],
            "exception_type": exception_type,
            "exception_explanation": exception_explanation,
        }
        mr_result = db.table("match_results").insert(mr_insert).execute()
        if mr_result.data:
            match_result_ids.append(mr_result.data[0]["id"])
            _log(db, "match_result_created",
                 f"invoice {invoice.get('invoice_no')} → tx {best_tx.get('id')} confidence={best['confidence']}",
                 invoice_id=invoice["id"],
                 match_result_id=mr_result.data[0]["id"])

    return {
        "group_id": group_id,
        "scenario_type": scenario,
        "invoice_ids": [inv["id"] for inv in candidate_invoices],
        "bank_transaction_ids": [tx["id"] for tx in candidate_txs],
        "status": status,
        "confidence": group_result["confidence"],
        "total_expected_myr": group_result["total_expected_myr"],
        "total_received_myr": group_result["total_received_myr"],
        "total_variance_myr": group_result["total_variance_myr"],
        "coverage_pct": group_result["coverage_pct"],
        "is_partial": group_result["is_partial"],
        "remaining_amount_myr": group_result["remaining_amount_myr"],
        "exception_type": exception_type,
        "exception_explanation": exception_explanation,
        "match_result_ids": match_result_ids,
    }


# ─── PATCH /results/{match_result_id}/decision ───────────────────────────────

@router.patch("/results/{match_result_id}/decision")
async def update_decision(match_result_id: str, req: DecisionRequest):
    """Record human approve/reject/partial decision on a match result."""
    valid = {"approved", "rejected", "partial"}
    if req.decision not in valid:
        raise HTTPException(status_code=422, detail=f"decision must be one of: {valid}")

    db = get_supabase()
    now = datetime.now(timezone.utc).isoformat()
    result = (
        db.table("match_results")
        .update({"human_decision": req.decision, "human_decision_at": now})
        .eq("id", match_result_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Match result not found")

    return result.data[0]


# ─── PATCH /groups/{group_id}/decision ───────────────────────────────────────

@router.patch("/groups/{group_id}/decision")
async def update_group_decision(group_id: str, req: GroupDecisionRequest):
    """
    Record human decision for an entire match group.
    Also propagates the decision to all child match_results.
    """
    valid = {"approved", "rejected", "partial"}
    if req.decision not in valid:
        raise HTTPException(status_code=422, detail=f"decision must be one of: {valid}")

    db = get_supabase()
    now = datetime.now(timezone.utc).isoformat()

    # Update the group
    group_result = (
        db.table("match_groups")
        .update({"human_decision": req.decision, "human_decision_at": now})
        .eq("id", group_id)
        .execute()
    )
    if not group_result.data:
        raise HTTPException(status_code=404, detail="Match group not found")

    # Propagate to all child match_results
    db.table("match_results").update({
        "human_decision": req.decision,
        "human_decision_at": now,
    }).eq("match_group_id", group_id).execute()

    return {
        "group_id": group_id,
        "decision": req.decision,
        "decided_at": now,
    }


# ─── GET /groups ──────────────────────────────────────────────────────────────

@router.get("/groups")
async def get_groups():
    """
    Return all match groups with enriched invoice and transaction data.
    """
    db = get_supabase()

    groups_result = db.table("match_groups").select("*").order("created_at", desc=True).execute()
    groups = groups_result.data or []

    # Collect all unique invoice and transaction IDs across all groups
    all_invoice_ids = list({inv_id for g in groups for inv_id in (g.get("invoice_ids") or [])})
    all_tx_ids = list({tx_id for g in groups for tx_id in (g.get("bank_transaction_ids") or [])})

    invoices_map = {}
    txs_map = {}

    if all_invoice_ids:
        inv_data = db.table("invoices").select("*").in_("id", all_invoice_ids).execute()
        invoices_map = {r["id"]: r for r in (inv_data.data or [])}

    if all_tx_ids:
        tx_data = db.table("bank_transactions").select("*").in_("id", all_tx_ids).execute()
        txs_map = {r["id"]: r for r in (tx_data.data or [])}

    # Enrich groups
    enriched_groups = []
    for g in groups:
        g["invoices"] = [invoices_map.get(inv_id) for inv_id in (g.get("invoice_ids") or []) if inv_id in invoices_map]
        g["bank_transactions"] = [txs_map.get(tx_id) for tx_id in (g.get("bank_transaction_ids") or []) if tx_id in txs_map]

        # Fetch child match_results for this group
        mr_res = db.table("match_results").select("*").eq("match_group_id", g["id"]).execute()
        g["match_results"] = mr_res.data or []

        enriched_groups.append(g)

    return {"groups": enriched_groups, "count": len(enriched_groups)}


# ─── GET /dashboard ───────────────────────────────────────────────────────────

@router.get("/dashboard")
async def dashboard():
    """Return summary stats + all match results + all match groups."""
    db = get_supabase()

    # Fetch all match results
    mr_result = db.table("match_results").select("*").order("created_at", desc=True).execute()
    match_results = mr_result.data or []

    # Collect related IDs
    invoice_ids = list({r["invoice_id"] for r in match_results if r.get("invoice_id")})
    tx_ids = list({r["bank_transaction_id"] for r in match_results if r.get("bank_transaction_id")})

    invoices_map = {}
    txs_map = {}

    if invoice_ids:
        inv_data = db.table("invoices").select("*").in_("id", invoice_ids).execute()
        invoices_map = {r["id"]: r for r in (inv_data.data or [])}

    if tx_ids:
        tx_data = db.table("bank_transactions").select("*").in_("id", tx_ids).execute()
        txs_map = {r["id"]: r for r in (tx_data.data or [])}

    # Enrich match results
    enriched = []
    for r in match_results:
        inv = invoices_map.get(r.get("invoice_id"))
        tx = txs_map.get(r.get("bank_transaction_id"))
        r["invoice"] = inv
        r["bank_transaction"] = tx

        # Dynamically compute score breakdown
        if inv and tx:
            try:
                scored = matcher.score_match(inv, tx)
                r["score_breakdown"] = scored.get("score_breakdown")
            except Exception:
                r["score_breakdown"] = None
        else:
            r["score_breakdown"] = None

        enriched.append(r)

    # Fetch match groups
    groups_result = db.table("match_groups").select("*").order("created_at", desc=True).execute()
    groups = groups_result.data or []

    # Enrich groups with invoice/tx data
    all_group_inv_ids = list({inv_id for g in groups for inv_id in (g.get("invoice_ids") or [])})
    all_group_tx_ids = list({tx_id for g in groups for tx_id in (g.get("bank_transaction_ids") or [])})

    group_inv_map = {}
    group_tx_map = {}

    if all_group_inv_ids:
        gid = db.table("invoices").select("*").in_("id", all_group_inv_ids).execute()
        group_inv_map = {r["id"]: r for r in (gid.data or [])}
    if all_group_tx_ids:
        gtx = db.table("bank_transactions").select("*").in_("id", all_group_tx_ids).execute()
        group_tx_map = {r["id"]: r for r in (gtx.data or [])}

    enriched_groups = []
    for g in groups:
        g["invoices"] = [group_inv_map.get(i) for i in (g.get("invoice_ids") or []) if i in group_inv_map]
        g["bank_transactions"] = [group_tx_map.get(t) for t in (g.get("bank_transaction_ids") or []) if t in group_tx_map]
        enriched_groups.append(g)

    # Stats
    total_invoices = len(db.table("invoices").select("id").execute().data or [])
    auto_matched = sum(1 for r in match_results if r.get("status") == "matched")
    needs_review = sum(1 for r in match_results if r.get("status") == "review")
    exceptions = sum(1 for r in match_results if r.get("status") == "exception")
    partial_payments = sum(1 for r in match_results if r.get("status") == "partial" or r.get("is_partial"))
    duplicates = sum(1 for r in match_results if r.get("scenario_type") == "s6_duplicate")
    total_variance = sum(
        (r.get("variance") or 0) for r in match_results if r.get("status") == "matched"
    )

    return {
        "stats": {
            "total_invoices": total_invoices,
            "auto_matched": auto_matched,
            "needs_review": needs_review,
            "exceptions": exceptions,
            "partial_payments": partial_payments,
            "duplicates": duplicates,
            "total_variance_myr": round(total_variance, 4),
        },
        "results": enriched,
        "groups": enriched_groups,
    }


# ─── POST /auto-match ─────────────────────────────────────────────────────────

@router.post("/auto-match")
async def auto_match_all():
    """Automatically match all unmatched invoices to bank transactions (single-entity)."""
    db = get_supabase()

    all_invoices = db.table("invoices").select("id").execute().data or []
    existing_matches = db.table("match_results").select("invoice_id").execute().data or []
    matched_invoice_ids = {m["invoice_id"] for m in existing_matches}

    unmatched_invoices = [inv for inv in all_invoices if inv["id"] not in matched_invoice_ids]

    if not unmatched_invoices:
        return {"message": "All invoices already matched", "matches_created": 0}

    all_txs = db.table("bank_transactions").select("id").execute().data or []
    if not all_txs:
        return {"message": "No bank transactions available for matching", "matches_created": 0}

    bank_tx_ids = [tx["id"] for tx in all_txs]
    matches_created = 0

    for invoice in unmatched_invoices:
        try:
            req = ReconcileRequest(invoice_id=invoice["id"], bank_transaction_ids=bank_tx_ids)
            await reconcile(req)
            matches_created += 1
        except Exception as e:
            _log(db, "auto_match_error", f"Failed to auto-match invoice {invoice['id']}: {str(e)}", invoice_id=invoice["id"])
            continue

    return {
        "message": "Auto-matching complete",
        "matches_created": matches_created,
        "unmatched_invoices": len(unmatched_invoices),
    }


# ─── GET /agent-logs/{match_result_id} ───────────────────────────────────────

@router.get("/agent-logs/{match_result_id}")
async def get_agent_logs(match_result_id: str):
    """Retrieve audit trail logs for a specific match result."""
    db = get_supabase()
    res = (
        db.table("agent_logs")
        .select("*")
        .eq("match_result_id", match_result_id)
        .order("created_at", desc=False)
        .execute()
    )
    return res.data or []
