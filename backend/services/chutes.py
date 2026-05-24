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
short_payment, overpayment, fx_variance, late_payment, missing_reference, possible_bank_fee, unknown

Return ONLY valid JSON:
{ "exception_type": "one of the values above", "exception_explanation": "2-3 sentence explanation" }"""


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
    """Call DeepSeek to classify and explain a reconciliation exception."""
    client = get_client()

    context = f"""Invoice: {invoice.get('invoice_no')} | Customer: {invoice.get('customer')} | Amount: {invoice.get('currency')} {invoice.get('amount')} | Expected MYR: {invoice.get('expected_myr')} | FX Rate: {invoice.get('fx_rate')} on {invoice.get('fx_date')}
Bank Transaction: {bank_tx.get('description')} | Received MYR: {bank_tx.get('credit_amount')} | Date: {bank_tx.get('transaction_date')}
Match Result: Confidence {match.get('confidence')}% | Variance MYR {match.get('variance')} ({match.get('variance_pct')}%) | Status: {match.get('status')}"""

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
        valid_types = {
            "short_payment", "overpayment", "fx_variance", "late_payment",
            "missing_reference", "possible_bank_fee", "unknown"
        }
        if result.get("exception_type") not in valid_types:
            result["exception_type"] = "unknown"
        return result
    except json.JSONDecodeError:
        return {
            "exception_type": "unknown",
            "exception_explanation": "Unable to automatically classify this exception. Please review manually.",
        }
