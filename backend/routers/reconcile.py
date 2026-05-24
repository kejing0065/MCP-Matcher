from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException

from db.supabase_client import get_supabase
from models.schemas import ReconcileRequest, DecisionRequest
from services import fx, chutes, matcher

router = APIRouter()


# ─── Helper: log an action to agent_logs ─────────────────────────────────────

def _log(db, action: str, detail: str, invoice_id: str = None, match_result_id: str = None):
    entry = {
        "action": action,
        "detail": detail,
    }
    if invoice_id:
        entry["invoice_id"] = invoice_id
    if match_result_id:
        entry["match_result_id"] = match_result_id
    db.table("agent_logs").insert(entry).execute()


# ─── POST /reconcile ──────────────────────────────────────────────────────────

@router.post("")
async def reconcile(req: ReconcileRequest):
    """
    Full orchestration pipeline:
    1. Fetch invoice
    2. FX convert using invoice_date (not today)
    3. Parse ALL bank descriptions (sequential — must finish before matching)
    4. Match transaction (pure Python scoring)
    5. Classify exception if status is review/exception
    6. Log every step
    """
    db = get_supabase()
    invoice_id = req.invoice_id

    # ── Step 1: Fetch invoice ────────────────────────────────────────────────
    inv_result = db.table("invoices").select("*").eq("id", invoice_id).execute()
    if not inv_result.data:
        raise HTTPException(status_code=404, detail=f"Invoice {invoice_id} not found")
    invoice = inv_result.data[0]
    _log(db, "fetch_invoice", f"Fetched invoice {invoice.get('invoice_no')}", invoice_id=invoice_id)

    # ── Step 2: FX conversion using invoice_date ─────────────────────────────
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

    # Update invoice with FX data (fx_source column may not exist — omit it)
    db.table("invoices").update({
        "expected_myr": expected_myr,
        "fx_rate": rate,
        "fx_date": fx_date,
    }).eq("id", invoice_id).execute()

    invoice["expected_myr"] = expected_myr
    invoice["fx_rate"] = rate
    invoice["fx_date"] = fx_date
    invoice["fx_source"] = fx_source  # in-memory only

    _log(
        db,
        "fx_convert",
        f"{currency} {amount} → MYR {expected_myr} @ {rate} on {fx_date} ({fx_source})",
        invoice_id=invoice_id,
    )

    # ── Step 3: Parse ALL bank descriptions (sequential, before matching) ────
    tx_result = (
        db.table("bank_transactions")
        .select("*")
        .in_("id", req.bank_transaction_ids)
        .execute()
    )
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

            _log(
                db,
                "parse_description",
                f"tx {tx['id']}: customer={parsed.get('customer_name')} ref={parsed.get('invoice_reference')}",
                invoice_id=invoice_id,
            )
        except Exception as e:
            _log(
                db,
                "parse_description_error",
                f"tx {tx['id']} failed: {e}",
                invoice_id=invoice_id,
            )
            # Continue — don't abort reconciliation on LLM parse failure

    # ── Step 4: Match (pure Python) ──────────────────────────────────────────
    best = matcher.best_match(invoice, bank_txs)
    best_tx = best["transaction"]

    match_insert = {
        "invoice_id": invoice_id,
        "bank_transaction_id": best_tx["id"],
        "confidence": best["confidence"],
        "status": best["status"],
        "variance": best["variance"],
        "variance_pct": best["variance_pct"],
        "reason": best["reason"],
    }
    match_result = db.table("match_results").insert(match_insert).execute()
    if not match_result.data:
        raise HTTPException(status_code=500, detail="Failed to save match result")

    match_id = match_result.data[0]["id"]

    _log(
        db,
        "match",
        f"confidence={best['confidence']} status={best['status']} variance={best['variance']}",
        invoice_id=invoice_id,
        match_result_id=match_id,
    )

    # ── Step 5: Classify exception if needed ─────────────────────────────────
    exception_type = None
    exception_explanation = None

    if best["status"] in ("review", "exception"):
        try:
            classification = await chutes.classify_exception(invoice, best_tx, {
                **match_insert,
                "id": match_id,
            })
            exception_type = classification["exception_type"]
            exception_explanation = classification["exception_explanation"]

            db.table("match_results").update({
                "exception_type": exception_type,
                "exception_explanation": exception_explanation,
            }).eq("id", match_id).execute()

            _log(
                db,
                "classify_exception",
                f"type={exception_type}",
                invoice_id=invoice_id,
                match_result_id=match_id,
            )
        except Exception as e:
            _log(
                db,
                "classify_exception_error",
                str(e),
                invoice_id=invoice_id,
                match_result_id=match_id,
            )

    return {
        "invoice_id": invoice_id,
        "match_result_id": match_id,
        "status": best["status"],
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
    }


# ─── PATCH /results/{match_result_id}/decision ───────────────────────────────

@router.patch("/results/{match_result_id}/decision")
async def update_decision(match_result_id: str, req: DecisionRequest):
    """Record human approve/reject decision on a match result."""
    if req.decision not in ("approved", "rejected"):
        raise HTTPException(status_code=422, detail="decision must be 'approved' or 'rejected'")

    db = get_supabase()
    result = (
        db.table("match_results")
        .update({"human_decision": req.decision})
        .eq("id", match_result_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Match result not found")

    return result.data[0]


# ─── GET /dashboard ───────────────────────────────────────────────────────────

@router.get("/dashboard")
async def dashboard():
    """Return summary stats and all match results with related invoice and transaction data."""
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
        
        # Dynamically compute score breakdown on the fly
        if inv and tx:
            try:
                scored = matcher.score_match(inv, tx)
                r["score_breakdown"] = scored.get("score_breakdown")
            except Exception:
                r["score_breakdown"] = None
        else:
            r["score_breakdown"] = None

        enriched.append(r)

    # Stats
    total_invoices = len(db.table("invoices").select("id").execute().data or [])
    auto_matched = sum(1 for r in match_results if r.get("status") == "matched")
    needs_review = sum(1 for r in match_results if r.get("status") == "review")
    exceptions = sum(1 for r in match_results if r.get("status") == "exception")
    total_variance = sum(
        (r.get("variance") or 0) for r in match_results if r.get("status") == "matched"
    )

    return {
        "stats": {
            "total_invoices": total_invoices,
            "auto_matched": auto_matched,
            "needs_review": needs_review,
            "exceptions": exceptions,
            "total_variance_myr": round(total_variance, 4),
        },
        "results": enriched,
    }


# ─── POST /auto-match ─────────────────────────────────────────────────────────

@router.post("/auto-match")
async def auto_match_all():
    """
    Automatically match all unmatched invoices to bank transactions.
    For each invoice without a match result, perform full reconciliation.
    """
    db = get_supabase()
    
    # Get all invoices without match results
    all_invoices = db.table("invoices").select("id").execute().data or []
    existing_matches = db.table("match_results").select("invoice_id").execute().data or []
    matched_invoice_ids = {m["invoice_id"] for m in existing_matches}
    
    unmatched_invoices = [inv for inv in all_invoices if inv["id"] not in matched_invoice_ids]
    
    if not unmatched_invoices:
        return {"message": "All invoices already matched", "matches_created": 0}
    
    # Get all bank transactions
    all_txs = db.table("bank_transactions").select("id").execute().data or []
    if not all_txs:
        return {"message": "No bank transactions available for matching", "matches_created": 0}
    
    bank_tx_ids = [tx["id"] for tx in all_txs]
    
    matches_created = 0
    
    for invoice in unmatched_invoices:
        try:
            # Call reconcile for this invoice with all bank transactions
            from models.schemas import ReconcileRequest
            req = ReconcileRequest(invoice_id=invoice["id"], bank_transaction_ids=bank_tx_ids)
            await reconcile(req)
            matches_created += 1
        except Exception as e:
            _log(
                db, 
                "auto_match_error", 
                f"Failed to auto-match invoice {invoice['id']}: {str(e)}",
                invoice_id=invoice["id"]
            )
            continue
    
    return {
        "message": f"Auto-matching complete",
        "matches_created": matches_created,
        "unmatched_invoices": len(unmatched_invoices)
    }


# ─── GET /reconcile/agent-logs/{match_result_id} ─────────────────────────────

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

