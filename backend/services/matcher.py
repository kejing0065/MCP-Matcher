"""
matcher.py — Scenario-Aware Reconciliation Matching Engine

Supports 8 real-world reconciliation scenarios:
  S1: 1 invoice ↔ 1 transaction (standard)
  S2: 1 invoice ↔ N transactions (split payment)
  S3: N invoices ↔ 1 transaction (consolidated payment)
  S4: N invoices ↔ M transactions (complex batch)
  S5: Partial payment (invoice underpaid)
  S6: Duplicate payment (transaction already claimed)
  S7: Unmatched surplus (no invoice for transaction)
  S8: Bank fee deduction (SWIFT/TT fee causes shortfall)
"""
from datetime import datetime
from itertools import combinations
from typing import Optional
from rapidfuzz import fuzz

# ─── Tolerance constants ──────────────────────────────────────────────────────

AMOUNT_TOLERANCE_PCT    = 2.0    # ±2% for auto-match
AMOUNT_REVIEW_PCT       = 10.0   # up to ±10% goes to review
BANK_FEE_MAX_MYR        = 100.0  # max bank fee deduction before it's flagged as something else
PARTIAL_MIN_COVERAGE    = 0.30   # at least 30% must be covered to count as "partial" not "exception"
DUPLICATE_AMOUNT_TOL    = 0.01   # MYR tolerance to flag same amount as possible duplicate


# ─── Individual scoring functions (used by all scenarios) ────────────────────

def _amount_score(expected_myr: float, received: float) -> float:
    """Score 0–100 based on how close received is to expected (40% weight)."""
    if expected_myr == 0:
        return 0.0

    diff_pct = abs(expected_myr - received) / expected_myr * 100
    if diff_pct <= 2:
        score = 100.0
    elif diff_pct <= 5:
        score = 80.0
    elif diff_pct <= 10:
        score = 50.0
    else:
        score = 0.0

    # Receiving more than expected means customer overpaid — slightly favourable
    if received > expected_myr:
        score = min(100.0, score + 20.0)

    return score


def _date_score(invoice_date: str, transaction_date: str) -> float:
    """Score 0–100 based on days between invoice date and transaction date (30% weight)."""
    try:
        inv = datetime.strptime(invoice_date, "%Y-%m-%d").date()
        txn = datetime.strptime(transaction_date, "%Y-%m-%d").date()
        days_diff = abs((inv - txn).days)
    except (ValueError, TypeError):
        return 0.0

    if days_diff <= 1:
        return 100.0
    elif days_diff <= 3:
        return 80.0
    elif days_diff <= 7:
        return 50.0
    elif days_diff <= 30:
        return 20.0
    else:
        return 0.0


def _reference_score(
    invoice_customer: Optional[str],
    invoice_no: Optional[str],
    parsed_customer: Optional[str],
    parsed_reference: Optional[str],
) -> float:
    """Score 0–100 using fuzzy matching on customer name and invoice reference (30% weight)."""
    scores = []

    if invoice_customer and parsed_customer:
        scores.append(fuzz.token_set_ratio(invoice_customer.lower(), parsed_customer.lower()))

    if invoice_no and parsed_reference:
        inv_ref = invoice_no.lower().replace("-", "").replace(" ", "")
        parsed_ref = parsed_reference.lower().replace("-", "").replace(" ", "")
        scores.append(fuzz.ratio(inv_ref, parsed_ref))

    if not scores:
        return 0.0

    return float(max(scores))


def score_match(invoice: dict, bank_tx: dict) -> dict:
    """
    Pure Python scoring for 1-to-1 matching. Returns confidence, status,
    variance, variance_pct, and full score breakdown.
    """
    expected_myr = invoice.get("expected_myr") or 0.0
    received = bank_tx.get("credit_amount") or 0.0

    a_score = _amount_score(expected_myr, received)
    d_score = _date_score(
        invoice.get("invoice_date", ""),
        bank_tx.get("transaction_date", ""),
    )
    r_score = _reference_score(
        invoice.get("customer"),
        invoice.get("invoice_no"),
        bank_tx.get("parsed_customer"),
        bank_tx.get("parsed_reference"),
    )

    confidence = (a_score * 0.4) + (d_score * 0.3) + (r_score * 0.3)

    if confidence >= 85:
        status = "matched"
    elif confidence >= 60:
        status = "review"
    else:
        status = "exception"

    variance = received - expected_myr
    variance_pct = (variance / expected_myr * 100) if expected_myr != 0 else 0.0

    reason_parts = []
    if a_score < 80:
        reason_parts.append(f"amount variance {abs(variance_pct):.1f}%")
    if d_score < 80:
        reason_parts.append("date mismatch")
    if r_score < 60:
        reason_parts.append("weak reference match")
    reason = "; ".join(reason_parts) if reason_parts else "all scores within threshold"

    return {
        "confidence": round(confidence, 2),
        "status": status,
        "variance": round(variance, 4),
        "variance_pct": round(variance_pct, 4),
        "reason": reason,
        "score_breakdown": {
            "amount_score": a_score,
            "date_score": d_score,
            "reference_score": r_score,
            "confidence": round(confidence, 2),
        },
    }


def best_match(invoice: dict, bank_transactions: list) -> dict:
    """Score all transactions against the invoice and return the highest-confidence match."""
    if not bank_transactions:
        raise ValueError("No bank transactions provided to match against")

    scored = [(tx, score_match(invoice, tx)) for tx in bank_transactions]
    scored.sort(key=lambda x: x[1]["confidence"], reverse=True)
    best_tx, best_score = scored[0]

    return {"transaction": best_tx, **best_score}


def filter_transactions_for_invoice(
    invoice: dict,
    bank_transactions: list,
    min_ref_score: float = 70.0,
    amount_tolerance_pct: float = 10.0,
) -> list:
    """
    Return a narrowed set of transactions likely related to a single invoice.
    Uses fuzzy reference score first, then falls back to amount proximity.
    """
    expected = invoice.get("expected_myr") or 0.0
    invoice_no = invoice.get("invoice_no")
    customer = invoice.get("customer")

    if not bank_transactions:
        return []

    # 1) Reference-based filter
    ref_hits = []
    for tx in bank_transactions:
        score = _reference_score(
            customer,
            invoice_no,
            tx.get("parsed_customer"),
            tx.get("parsed_reference"),
        )
        if score >= min_ref_score:
            ref_hits.append(tx)

    if ref_hits:
        return ref_hits

    # 2) Amount-proximity fallback
    if expected <= 0:
        return bank_transactions

    amount_hits = []
    for tx in bank_transactions:
        received = tx.get("credit_amount") or 0.0
        diff_pct = abs(expected - received) / expected * 100
        if diff_pct <= amount_tolerance_pct:
            amount_hits.append(tx)

    return amount_hits or bank_transactions


# ─── Duplicate Detection ──────────────────────────────────────────────────────

def detect_duplicate(
    bank_tx: dict,
    claimed_tx_ids: set,
) -> bool:
    """
    Returns True if this bank transaction has already been claimed
    by another match result (full database history).
    """
    return str(bank_tx.get("id")) in claimed_tx_ids


# ─── Partial Payment Detection ────────────────────────────────────────────────

def detect_partial(
    expected_myr: float,
    received_myr: float,
) -> dict:
    """
    Returns partial payment metadata: coverage %, remaining balance, and
    whether this qualifies as a partial payment vs a full exception.
    """
    if expected_myr == 0:
        return {"is_partial": False, "coverage_pct": 0.0, "remaining_myr": 0.0}

    coverage_pct = min(received_myr / expected_myr * 100, 100.0)
    remaining_myr = max(expected_myr - received_myr, 0.0)
    is_partial = received_myr < expected_myr and coverage_pct >= (PARTIAL_MIN_COVERAGE * 100)

    return {
        "is_partial": is_partial,
        "coverage_pct": round(coverage_pct, 2),
        "remaining_myr": round(remaining_myr, 4),
    }


# ─── Bank Fee Detection ───────────────────────────────────────────────────────

def detect_bank_fee(
    expected_myr: float,
    received_myr: float,
) -> dict:
    """
    Detects if the shortfall between expected and received looks like a bank fee.
    Bank fees for Malaysian telegraphic transfers are typically MYR 10–80.
    """
    shortfall = expected_myr - received_myr
    is_likely_fee = 0 < shortfall <= BANK_FEE_MAX_MYR and received_myr < expected_myr
    return {
        "is_likely_bank_fee": is_likely_fee,
        "fee_amount_myr": round(shortfall, 4) if is_likely_fee else 0.0,
    }


# ─── Scenario Detection ───────────────────────────────────────────────────────

def detect_scenario(
    invoices: list,
    bank_transactions: list,
    claimed_tx_ids: set = None,
) -> str:
    """
    Given N invoices and M bank transactions, determine the most likely scenario type.
    Returns a scenario code string.
    """
    if claimed_tx_ids is None:
        claimed_tx_ids = set()

    n_inv = len(invoices)
    n_tx = len(bank_transactions)

    # Check for duplicate (already-claimed transactions)
    all_claimed = all(detect_duplicate(tx, claimed_tx_ids) for tx in bank_transactions)
    any_claimed = any(detect_duplicate(tx, claimed_tx_ids) for tx in bank_transactions)
    if any_claimed:
        return "s6_duplicate"

    # Single invoice scenarios
    if n_inv == 1:
        invoice = invoices[0]
        expected = invoice.get("expected_myr") or 0.0
        total_received = sum(tx.get("credit_amount") or 0.0 for tx in bank_transactions)

        if n_tx == 1:
            tx = bank_transactions[0]
            received = tx.get("credit_amount") or 0.0
            variance_pct = abs(expected - received) / expected * 100 if expected > 0 else 100

            # Check for bank fee scenario
            fee_info = detect_bank_fee(expected, received)
            if fee_info["is_likely_bank_fee"]:
                return "s8_bank_fee"

            # Check for partial
            partial_info = detect_partial(expected, received)
            if received < expected * 0.98 and partial_info["is_partial"]:
                return "s5_partial"

            return "s1_one_to_one"

        else:
            # Multiple transactions for one invoice
            if total_received >= expected * 0.95:
                return "s2_split"
            elif total_received >= expected * PARTIAL_MIN_COVERAGE:
                return "s5_partial"
            else:
                return "s5_partial"

    # Multiple invoice scenarios
    if n_inv > 1:
        total_expected = sum((inv.get("expected_myr") or 0.0) for inv in invoices)
        total_received = sum((tx.get("credit_amount") or 0.0) for tx in bank_transactions)

        if n_tx == 1:
            return "s3_consolidated"
        else:
            # Check if it looks like a complex batch
            return "s4_complex"

    # Fallback
    return "s1_one_to_one"


# ─── Grouped Amount Scoring ───────────────────────────────────────────────────

def _best_reference_score_for_group(invoices: list, bank_transactions: list) -> float:
    """
    For group matches, find the best reference match between any invoice and any transaction.
    """
    best = 0.0
    for inv in invoices:
        for tx in bank_transactions:
            s = _reference_score(
                inv.get("customer"),
                inv.get("invoice_no"),
                tx.get("parsed_customer"),
                tx.get("parsed_reference"),
            )
            if s > best:
                best = s
    return best


def _earliest_date(records: list, date_key: str) -> str:
    """Return the earliest date string from a list of records."""
    dates = []
    for r in records:
        d = r.get(date_key)
        if d:
            try:
                dates.append(datetime.strptime(str(d)[:10], "%Y-%m-%d"))
            except ValueError:
                pass
    if not dates:
        return ""
    return min(dates).strftime("%Y-%m-%d")


def _average_date_score(invoices: list, bank_transactions: list) -> float:
    """Average date score between invoice dates and transaction dates."""
    if not invoices or not bank_transactions:
        return 0.0

    earliest_inv = _earliest_date(invoices, "invoice_date")
    earliest_tx = _earliest_date(bank_transactions, "transaction_date")

    if not earliest_inv or not earliest_tx:
        return 50.0  # neutral if we can't determine

    return _date_score(earliest_inv, earliest_tx)


# ─── Group Matching ───────────────────────────────────────────────────────────

def group_match(
    invoices: list,
    bank_transactions: list,
    claimed_tx_ids: set = None,
) -> dict:
    """
    Multi-way matching for all scenarios. Returns a group match result dict
    including scenario_type, combined confidence, coverage, variance, and reason.

    This is the main entry point for multi-scenario reconciliation.
    """
    if claimed_tx_ids is None:
        claimed_tx_ids = set()

    scenario = detect_scenario(invoices, bank_transactions, claimed_tx_ids)

    total_expected_myr = sum((inv.get("expected_myr") or 0.0) for inv in invoices)
    total_received_myr = sum((tx.get("credit_amount") or 0.0) for tx in bank_transactions)
    total_variance_myr = total_received_myr - total_expected_myr
    coverage_pct = (total_received_myr / total_expected_myr * 100) if total_expected_myr > 0 else 0.0

    # Compute component scores
    a_score = _amount_score(total_expected_myr, total_received_myr)
    d_score = _average_date_score(invoices, bank_transactions)
    r_score = _best_reference_score_for_group(invoices, bank_transactions)

    confidence = (a_score * 0.4) + (d_score * 0.3) + (r_score * 0.3)

    # Adjust confidence based on scenario
    if scenario == "s6_duplicate":
        confidence = max(0.0, confidence - 40.0)  # penalise duplicates heavily
    elif scenario == "s5_partial":
        confidence = min(confidence, 70.0)  # partial can only go to review at best
    elif scenario == "s8_bank_fee":
        confidence = min(confidence + 10.0, 100.0)  # bank fees are expected, don't penalise too hard

    # Determine overall status
    if scenario == "s6_duplicate":
        status = "exception"
    elif scenario in ("s1_one_to_one", "s2_split", "s3_consolidated", "s4_complex"):
        if confidence >= 85 and abs(total_variance_myr) / max(total_expected_myr, 1) * 100 <= 2:
            status = "matched"
        elif confidence >= 60:
            status = "review"
        else:
            status = "exception"
    elif scenario == "s5_partial":
        status = "partial"
    elif scenario == "s8_bank_fee":
        status = "review" if confidence < 85 else "matched"
    else:
        status = "exception"

    # Partial payment detail
    partial_info = detect_partial(total_expected_myr, total_received_myr)
    bank_fee_info = detect_bank_fee(total_expected_myr, total_received_myr)

    # Build reason
    reason_parts = []
    if a_score < 80:
        reason_parts.append(f"amount variance {abs(total_variance_myr):.2f} MYR ({abs(total_variance_myr / max(total_expected_myr, 1) * 100):.1f}%)")
    if d_score < 80:
        reason_parts.append("date mismatch between invoice and payment")
    if r_score < 60:
        reason_parts.append("weak customer/reference match")
    if scenario == "s6_duplicate":
        reason_parts.append("duplicate — transaction already claimed")
    if scenario == "s5_partial":
        reason_parts.append(f"partial payment ({coverage_pct:.1f}% covered, MYR {partial_info['remaining_myr']:.2f} outstanding)")
    if scenario == "s8_bank_fee":
        reason_parts.append(f"possible bank fee deduction of MYR {bank_fee_info['fee_amount_myr']:.2f}")
    reason = "; ".join(reason_parts) if reason_parts else "all scores within threshold"

    return {
        "scenario_type": scenario,
        "status": status,
        "confidence": round(confidence, 2),
        "total_expected_myr": round(total_expected_myr, 4),
        "total_received_myr": round(total_received_myr, 4),
        "total_variance_myr": round(total_variance_myr, 4),
        "coverage_pct": round(coverage_pct, 2),
        "is_partial": partial_info["is_partial"],
        "remaining_amount_myr": partial_info["remaining_myr"],
        "is_likely_bank_fee": bank_fee_info["is_likely_bank_fee"],
        "fee_amount_myr": bank_fee_info["fee_amount_myr"],
        "reason": reason,
        "score_breakdown": {
            "amount_score": round(a_score, 2),
            "date_score": round(d_score, 2),
            "reference_score": round(r_score, 2),
            "confidence": round(confidence, 2),
        },
    }


# ─── Optimal Subset Finding (for S3 / S4) ────────────────────────────────────

def find_best_invoice_subset_for_transaction(
    invoices: list,
    bank_tx: dict,
    tolerance_pct: float = 5.0,
) -> Optional[list]:
    """
    For S3 (consolidated): find the subset of invoices whose combined expected_myr
    best matches a single bank transaction amount.

    Returns the best-matching invoice subset or None if no good match found.
    Bounded to combinations of up to 5 invoices to avoid exponential blowup.
    """
    received = bank_tx.get("credit_amount") or 0.0
    if received <= 0:
        return None

    best_subset = None
    best_diff = float("inf")

    max_combo_size = min(len(invoices), 5)  # cap at 5 to prevent O(2^N) blowup

    for r in range(1, max_combo_size + 1):
        for subset in combinations(invoices, r):
            total_expected = sum((inv.get("expected_myr") or 0.0) for inv in subset)
            if total_expected == 0:
                continue
            diff_pct = abs(received - total_expected) / total_expected * 100
            if diff_pct <= tolerance_pct and diff_pct < best_diff:
                best_diff = diff_pct
                best_subset = list(subset)

    return best_subset


def find_best_transaction_subset_for_invoice(
    invoice: dict,
    bank_transactions: list,
    tolerance_pct: float = 5.0,
) -> Optional[list]:
    """
    For S2 (split): find the subset of transactions whose combined credit_amount
    best matches one invoice's expected_myr.

    Returns the best-matching transaction subset or None if no good match found.
    Bounded to combinations of up to 5 transactions.
    """
    expected = invoice.get("expected_myr") or 0.0
    if expected <= 0:
        return None

    best_subset = None
    best_diff = float("inf")

    max_combo_size = min(len(bank_transactions), 5)

    for r in range(1, max_combo_size + 1):
        for subset in combinations(bank_transactions, r):
            total_received = sum((tx.get("credit_amount") or 0.0) for tx in subset)
            if total_received == 0:
                continue
            diff_pct = abs(expected - total_received) / expected * 100
            if diff_pct <= tolerance_pct and diff_pct < best_diff:
                best_diff = diff_pct
                best_subset = list(subset)

    return best_subset


def find_best_transaction_subset_for_group(
    total_expected_myr: float,
    bank_transactions: list,
    tolerance_pct: float = 5.0,
) -> Optional[list]:
    """
    For S4 (complex): find the subset of transactions whose combined credit_amount
    best matches the group's total expected MYR.
    """
    expected = total_expected_myr or 0.0
    if expected <= 0:
        return None

    best_subset = None
    best_diff = float("inf")

    max_combo_size = min(len(bank_transactions), 5)

    for r in range(1, max_combo_size + 1):
        for subset in combinations(bank_transactions, r):
            total_received = sum((tx.get("credit_amount") or 0.0) for tx in subset)
            if total_received == 0:
                continue
            diff_pct = abs(expected - total_received) / expected * 100
            if diff_pct <= tolerance_pct and diff_pct < best_diff:
                best_diff = diff_pct
                best_subset = list(subset)

    return best_subset
