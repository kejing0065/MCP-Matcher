"""
chutes.py — DeepSeek-V3 AI service for parsing and exception classification
Enhanced to support multi-entity group reconciliation scenarios.
"""
import os
import json
import re
from openai import AsyncOpenAI
from dotenv import load_dotenv

load_dotenv()

_client: AsyncOpenAI | None = None


def get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(
            api_key=os.getenv("CHUTES_API_KEY"),
            base_url="https://llm.chutes.ai/v1",
        )
    return _client


MODEL = "deepseek-ai/DeepSeek-V3.2-TEE"

_PARSE_SYSTEM = """You are a Malaysian bank transaction parser.
Extract customer name and invoice reference from bank descriptions.
Malaysian bank descriptions often contain: IBFT, DUITNOW, IBG, TT FROM, CR,
sender names in Malay or English, invoice numbers.
Return ONLY valid JSON with no preamble:
{ "customer_name": "string or null", "invoice_reference": "string or null" }
If not found, return null for that field."""

_EXCEPTION_SYSTEM = """You are a financial reconciliation assistant for Malaysian SMEs.
Given a failed or uncertain invoice match, explain in plain English (2-3 sentences) why it
didn't auto-match and what the human reviewer should check. Be specific about the numbers.
Also classify the exception type from exactly one of these values:
short_payment, overpayment, fx_variance, late_payment, missing_reference, possible_bank_fee,
split_payment, consolidated_payment, partial_payment, duplicate_payment, unmatched_surplus, unknown

Return ONLY valid JSON:
{ "exception_type": "one of the values above", "exception_explanation": "2-3 sentence explanation" }"""

_GROUP_EXCEPTION_SYSTEM = """You are a senior financial reconciliation analyst for Malaysian SMEs.
You are reviewing a COMPLEX multi-entity payment match. The match may involve multiple invoices,
multiple bank transactions, or a combination of both.

Analyse the provided context and:
1. Explain in plain English (3-4 sentences) what happened and why the match is uncertain or exceptional.
   Be specific about the amounts, currencies, dates, and any discrepancies.
2. Classify the scenario from exactly one of these values:
   short_payment, overpayment, fx_variance, late_payment, missing_reference, possible_bank_fee,
   split_payment, consolidated_payment, partial_payment, duplicate_payment, unmatched_surplus, unknown

Return ONLY valid JSON:
{ "exception_type": "one of the values above", "exception_explanation": "3-4 sentence explanation" }"""

_VALID_EXCEPTION_TYPES = {
    "short_payment", "overpayment", "fx_variance", "late_payment",
    "missing_reference", "possible_bank_fee", "split_payment",
    "consolidated_payment", "partial_payment", "duplicate_payment",
    "unmatched_surplus", "unknown"
}


def _strip_json(text: str) -> str:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()


async def parse_bank_description(description: str) -> dict:
    """Call DeepSeek to extract customer_name and invoice_reference from a bank description."""
    client = get_client()
    response = await client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": _PARSE_SYSTEM},
            {"role": "user", "content": f"Bank description: {description}"},
        ],
        temperature=0,
        max_tokens=200,
    )
    raw = _strip_json(response.choices[0].message.content)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"customer_name": None, "invoice_reference": None}


async def classify_exception(invoice: dict, bank_tx: dict, match: dict) -> dict:
    """Call DeepSeek to classify and explain a single-entity reconciliation exception."""
    client = get_client()

    context = (
        f"Invoice: {invoice.get('invoice_no')} | Customer: {invoice.get('customer')} | "
        f"Amount: {invoice.get('currency')} {invoice.get('amount')} | "
        f"Expected MYR: {invoice.get('expected_myr')} | "
        f"FX Rate: {invoice.get('fx_rate')} on {invoice.get('fx_date')}\n"
        f"Bank Transaction: {bank_tx.get('description')} | "
        f"Received MYR: {bank_tx.get('credit_amount')} | "
        f"Date: {bank_tx.get('transaction_date')}\n"
        f"Match Result: Confidence {match.get('confidence')}% | "
        f"Variance MYR {match.get('variance')} ({match.get('variance_pct')}%) | "
        f"Status: {match.get('status')}"
    )

    response = await client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": _EXCEPTION_SYSTEM},
            {"role": "user", "content": context},
        ],
        temperature=0.2,
        max_tokens=400,
    )
    raw = _strip_json(response.choices[0].message.content)
    try:
        result = json.loads(raw)
        if result.get("exception_type") not in _VALID_EXCEPTION_TYPES:
            result["exception_type"] = "unknown"
        return result
    except json.JSONDecodeError:
        return {
            "exception_type": "unknown",
            "exception_explanation": "Unable to automatically classify this exception. Please review manually.",
        }


async def classify_group_exception(
    invoices: list,
    bank_transactions: list,
    group: dict,
) -> dict:
    """
    Call DeepSeek to classify and explain a multi-entity group reconciliation exception.
    Used for S2, S3, S4, S5, S6, S7, S8 scenarios.
    """
    client = get_client()

    # Build invoice summary
    inv_lines = []
    for inv in invoices:
        inv_lines.append(
            f"  - {inv.get('invoice_no')} | {inv.get('customer')} | "
            f"{inv.get('currency')} {inv.get('amount')} | "
            f"Expected MYR {inv.get('expected_myr')} | Date {inv.get('invoice_date')}"
        )

    # Build transaction summary
    tx_lines = []
    for tx in bank_transactions:
        tx_lines.append(
            f"  - {tx.get('description', 'N/A')[:80]} | "
            f"MYR {tx.get('credit_amount')} | Date {tx.get('transaction_date')}"
        )

    # Build group summary
    scenario_label = {
        "s1_one_to_one": "Standard 1-to-1 match",
        "s2_split": "Split payment (1 invoice, multiple transactions)",
        "s3_consolidated": "Consolidated payment (multiple invoices, 1 transaction)",
        "s4_complex": "Complex batch (multiple invoices and multiple transactions)",
        "s5_partial": "Partial payment (invoice underpaid)",
        "s6_duplicate": "Duplicate payment (transaction already used)",
        "s7_unmatched": "Unmatched surplus (no invoice found)",
        "s8_bank_fee": "Bank fee deduction scenario",
    }.get(group.get("scenario_type", ""), "Unknown scenario")

    context = (
        f"SCENARIO: {scenario_label}\n\n"
        f"INVOICES ({len(invoices)}):\n" + "\n".join(inv_lines) + "\n\n"
        f"BANK TRANSACTIONS ({len(bank_transactions)}):\n" + "\n".join(tx_lines) + "\n\n"
        f"GROUP SUMMARY:\n"
        f"  Total Expected MYR: {group.get('total_expected_myr')}\n"
        f"  Total Received MYR: {group.get('total_received_myr')}\n"
        f"  Total Variance MYR: {group.get('total_variance_myr')}\n"
        f"  Coverage: {group.get('coverage_pct')}%\n"
        f"  Confidence: {group.get('confidence')}%\n"
        f"  Status: {group.get('status')}\n"
        f"  Is Partial: {group.get('is_partial')}\n"
        f"  Remaining MYR: {group.get('remaining_amount_myr', 0)}"
    )

    response = await client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": _GROUP_EXCEPTION_SYSTEM},
            {"role": "user", "content": context},
        ],
        temperature=0.2,
        max_tokens=600,
    )
    raw = _strip_json(response.choices[0].message.content)
    try:
        result = json.loads(raw)
        if result.get("exception_type") not in _VALID_EXCEPTION_TYPES:
            result["exception_type"] = "unknown"
        return result
    except json.JSONDecodeError:
        return {
            "exception_type": "unknown",
            "exception_explanation": "Unable to automatically classify this multi-entity exception. Please review manually.",
        }
