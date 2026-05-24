from datetime import date, datetime
from typing import Optional
from rapidfuzz import fuzz


def _amount_score(expected_myr: float, received: float) -> float:
    """Score 0-100 based on how close received is to expected (40% weight)."""
    if expected_myr == 0:
        return 0.0
        
    score = 0.0
    diff_pct = abs(expected_myr - received) / expected_myr * 100
    if diff_pct <= 2:
        score = 100.0
    elif diff_pct <= 5:
        score = 80.0
    elif diff_pct <= 10:
        score = 50.0
    else:
        score = 0.0
        
    # User rule: If the received amount is higher than expected amount, we earn, so add 20% to amount score
    if received > expected_myr:
        score += 20.0
        
    # Cap at 100.0
    return min(100.0, score)


def _date_score(invoice_date: str, transaction_date: str) -> float:
    """Score 0-100 based on days between invoice date and transaction date (30% weight)."""
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
    else:
        return 0.0


def _reference_score(
    invoice_customer: Optional[str],
    invoice_no: Optional[str],
    parsed_customer: Optional[str],
    parsed_reference: Optional[str],
) -> float:
    """Score 0-100 using fuzzy matching on customer name and invoice reference (30% weight)."""
    scores = []

    if invoice_customer and parsed_customer:
        scores.append(fuzz.token_set_ratio(invoice_customer.lower(), parsed_customer.lower()))

    if invoice_no and parsed_reference:
        # Normalise: strip hyphens and spaces for comparison
        inv_ref = invoice_no.lower().replace("-", "").replace(" ", "")
        parsed_ref = parsed_reference.lower().replace("-", "").replace(" ", "")
        scores.append(fuzz.ratio(inv_ref, parsed_ref))

    if not scores:
        return 0.0

    return float(max(scores))


def score_match(invoice: dict, bank_tx: dict) -> dict:
    """
    Pure Python scoring — no LLM.
    Returns confidence, status, variance, variance_pct, and full score breakdown.
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


def best_match(invoice: dict, bank_transactions: list[dict]) -> dict:
    """Score all transactions against the invoice and return the highest-confidence match."""
    if not bank_transactions:
        raise ValueError("No bank transactions provided to match against")

    scored = [(tx, score_match(invoice, tx)) for tx in bank_transactions]
    scored.sort(key=lambda x: x[1]["confidence"], reverse=True)
    best_tx, best_score = scored[0]

    return {"transaction": best_tx, **best_score}
