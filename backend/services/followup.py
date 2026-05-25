"""
followup.py - lightweight Telegram follow-up delivery for execution actions.

Telegram is used for the MVP because it only needs a bot token and a chat ID.
If either environment variable is missing, callers receive a skipped result
instead of failing the review workflow.
"""
import os
from typing import Optional

import httpx
from dotenv import load_dotenv

load_dotenv()

TELEGRAM_API_BASE = "https://api.telegram.org"

FOLLOW_UP_ACTIONS = {
    "REQUEST_REMAINING_BALANCE",
    "REQUEST_PAYMENT_PROOF",
    "ESCALATE_TO_MANAGER",
    "INVESTIGATE_UNKNOWN_DEPOSIT",
    "INVESTIGATE_DUPLICATE_PAYMENT",
}


def should_send_follow_up(execution_action: Optional[str]) -> bool:
    return execution_action in FOLLOW_UP_ACTIONS


def build_follow_up_message(record: dict, invoice: dict | None = None, bank_tx: dict | None = None) -> str:
    action = record.get("execution_action") or record.get("suggested_execution_action") or "NEEDS_MANUAL_REVIEW"
    invoice_no = (invoice or {}).get("invoice_no") or "Unknown invoice"
    customer = (invoice or {}).get("customer") or "Unknown customer"
    expected = (invoice or {}).get("expected_myr") or record.get("total_expected_myr")
    received = (bank_tx or {}).get("credit_amount") or record.get("paid_amount_myr") or record.get("total_received_myr")
    remaining = record.get("remaining_amount_myr")
    reason = record.get("exception_explanation") or record.get("reason") or "Review required."
    review_reason = record.get("review_reason") or "No reviewer note provided."

    lines = [
        "Global Treasury Agent follow-up",
        f"Action: {action}",
        f"Invoice: {invoice_no}",
        f"Customer: {customer}",
    ]

    if expected is not None:
        lines.append(f"Expected: MYR {float(expected):.2f}")
    if received is not None:
        lines.append(f"Received: MYR {float(received):.2f}")
    if remaining is not None and float(remaining) > 0:
        lines.append(f"Outstanding: MYR {float(remaining):.2f}")

    lines.extend([
        f"Reason: {reason}",
        f"Reviewer note: {review_reason}",
    ])

    if action == "REQUEST_REMAINING_BALANCE":
        lines.append("Requested next step: Ask customer to settle the remaining balance.")
    elif action == "REQUEST_PAYMENT_PROOF":
        lines.append("Requested next step: Ask customer to provide payment proof/remittance slip.")
    elif action == "ESCALATE_TO_MANAGER":
        lines.append("Requested next step: Manager review required before accounting update.")
    elif action == "INVESTIGATE_UNKNOWN_DEPOSIT":
        lines.append("Requested next step: Investigate deposit source before allocation.")
    elif action == "INVESTIGATE_DUPLICATE_PAYMENT":
        lines.append("Requested next step: Investigate duplicate allocation before clearing.")

    return "\n".join(lines)


async def send_telegram_message(message: str) -> dict:
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    chat_id = os.getenv("TELEGRAM_CHAT_ID")

    if not token or not chat_id:
        return {
            "sent": False,
            "status": "Skipped",
            "detail": "Telegram not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.",
        }

    url = f"{TELEGRAM_API_BASE}/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": message,
        "disable_web_page_preview": True,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
    except httpx.HTTPError as exc:
        return {
            "sent": False,
            "status": "Failed",
            "detail": f"Telegram send failed: {exc}",
        }

    return {
        "sent": True,
        "status": "Sent",
        "detail": "Telegram follow-up message sent.",
    }
