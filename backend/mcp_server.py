import os
import sys
import json
from pathlib import Path
from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP

# Ensure we can import from backend root
sys.path.append(str(Path(__file__).parent))

from services import fx, gemini, chutes, matcher
from db.supabase_client import get_supabase

# Load env vars
load_dotenv()

# Initialize FastMCP
mcp = FastMCP("Global Treasury Agent")

@mcp.tool()
async def list_invoices() -> str:
    """List all invoices in the Supabase database."""
    try:
        db = get_supabase()
        res = db.table("invoices").select("*").order("created_at", desc=True).execute()
        return json.dumps(res.data, indent=2)
    except Exception as e:
        return f"Error fetching invoices: {e}"

@mcp.tool()
async def list_bank_transactions() -> str:
    """List all bank transactions in the Supabase database."""
    try:
        db = get_supabase()
        res = db.table("bank_transactions").select("*").order("created_at", desc=True).execute()
        return json.dumps(res.data, indent=2)
    except Exception as e:
        return f"Error fetching bank transactions: {e}"

@mcp.tool()
async def convert_currency(amount: float, from_currency: str, to_currency: str, date: str) -> str:
    """
    Convert amount from from_currency -> to_currency using historical rate on the specified date.
    
    Args:
        amount: The float amount to convert.
        from_currency: 3-letter currency code (e.g. USD).
        to_currency: 3-letter currency code (e.g. MYR).
        date: YYYY-MM-DD format (must be the transaction/invoice date).
    """
    try:
        result = await fx.convert(amount, from_currency, to_currency, date)
        return json.dumps(result, indent=2)
    except Exception as e:
        return f"Error converting currency: {e}"

@mcp.tool()
async def parse_bank_description(description: str, bank_transaction_id: str = None) -> str:
    """
    Use DeepSeek-V3 LLM to extract customer name and invoice reference from bank description.
    Optionally updates the database if bank_transaction_id is provided.
    """
    try:
        parsed = await chutes.parse_bank_description(description)
        if bank_transaction_id and parsed:
            db = get_supabase()
            update_data = {}
            if parsed.get("customer_name"):
                update_data["parsed_customer"] = parsed["customer_name"]
            if parsed.get("invoice_reference"):
                update_data["parsed_reference"] = parsed["invoice_reference"]
            if update_data:
                db.table("bank_transactions").update(update_data).eq("id", bank_transaction_id).execute()
        return json.dumps(parsed, indent=2)
    except Exception as e:
        return f"Error parsing description: {e}"

@mcp.tool()
async def match_transaction(invoice_id: str, bank_transaction_ids: list[str]) -> str:
    """
    Score bank transactions against the invoice and record the best match (pure Python).
    """
    try:
        db = get_supabase()
        # Fetch invoice
        inv_res = db.table("invoices").select("*").eq("id", invoice_id).execute()
        if not inv_res.data:
            return f"Invoice {invoice_id} not found"
        invoice = inv_res.data[0]

        if not invoice.get("expected_myr"):
            return "Invoice expected_myr is not set. Run convert_currency first."

        # Fetch bank transactions
        tx_res = db.table("bank_transactions").select("*").in_("id", bank_transaction_ids).execute()
        if not tx_res.data:
            return "No bank transactions found for matching"
        bank_txs = tx_res.data

        # Score and pick best
        best = matcher.best_match(invoice, bank_txs)
        best_tx = best["transaction"]

        # Save match result
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
            return "Failed to save match result"
        
        match_id = match_result.data[0]["id"]
        return json.dumps({
            "match_result_id": match_id,
            "best_match": best
        }, indent=2)
    except Exception as e:
        return f"Error matching transaction: {e}"

@mcp.tool()
async def classify_exception(match_result_id: str) -> str:
    """
    Classify exception type and explain the reason for mismatched or review status matches.
    """
    try:
        db = get_supabase()
        mr_res = db.table("match_results").select("*").eq("id", match_result_id).execute()
        if not mr_res.data:
            return f"Match result {match_result_id} not found"
        match = mr_res.data[0]

        inv_res = db.table("invoices").select("*").eq("id", match["invoice_id"]).execute()
        tx_res = db.table("bank_transactions").select("*").eq("id", match["bank_transaction_id"]).execute()

        if not inv_res.data or not tx_res.data:
            return "Invoice or transaction not found"

        invoice = inv_res.data[0]
        bank_tx = tx_res.data[0]

        classification = await chutes.classify_exception(invoice, bank_tx, match)
        
        # Update match_results
        db.table("match_results").update({
            "exception_type": classification["exception_type"],
            "exception_explanation": classification["exception_explanation"],
        }).eq("id", match_result_id).execute()

        return json.dumps(classification, indent=2)
    except Exception as e:
        return f"Error classifying exception: {e}"

@mcp.tool()
async def run_reconciliation(invoice_id: str, bank_transaction_ids: list[str]) -> str:
    """
    Orchestrate full reconciliation pipeline: FX lookup, parse descriptions, match, and classify exception.
    """
    try:
        from routers.reconcile import reconcile as run_rec
        from models.schemas import ReconcileRequest
        req = ReconcileRequest(invoice_id=invoice_id, bank_transaction_ids=bank_transaction_ids)
        result = await run_rec(req)
        return json.dumps(result, indent=2)
    except Exception as e:
        return f"Error running reconciliation pipeline: {e}"

if __name__ == "__main__":
    mcp.run(transport="stdio")
