import io
import pandas as pd
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse

from db.supabase_client import get_supabase
from models.schemas import (
    ConvertCurrencyRequest, ConvertCurrencyResponse,
    ParseDescriptionRequest, ParseDescriptionResponse,
    MatchRequest, MatchResponse, ScoreBreakdown,
    ClassifyExceptionRequest, ClassifyExceptionResponse,
)
from services import fx, gemini, chutes, matcher, ocr_extractor, groq_extractor

router = APIRouter()


# ─── Tool 1: POST /tools/extract-document ────────────────────────────────────

@router.post("/extract-document")
async def extract_document(file: UploadFile = File(...)):
    """
    Accept image (jpg/png) or PDF. Use Groq Llama vision to extract invoice fields.
    Saves to invoices table and returns extracted fields + invoice id.
    """
    try:
        file_bytes = await file.read()
        filename = file.filename or "upload"

        try:
            extracted = await groq_extractor.extract_invoice(file_bytes, filename)
            extraction_method = "groq"
        except ValueError as e:
            raise HTTPException(status_code=422, detail=f"Extraction error: {str(e)}")
        except RuntimeError as e:
            raise HTTPException(status_code=503, detail=f"Service error: {str(e)}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Unexpected error during extraction: {str(e)}")

        # Save to Supabase invoices table
        try:
            db = get_supabase()
            insert_data = {
                "invoice_no": extracted.get("invoice_no"),
                "customer": extracted.get("customer"),
                "amount": extracted.get("amount"),
                "currency": extracted.get("currency"),
                "invoice_date": extracted.get("invoice_date"),
            }
            # Remove None values so Supabase uses column defaults
            insert_data = {k: v for k, v in insert_data.items() if v is not None}

            result = db.table("invoices").insert(insert_data).execute()
            if not result.data:
                raise HTTPException(status_code=500, detail="Failed to save invoice to database")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Database save error: {str(e)}")

        invoice_id = result.data[0]["id"]

        return {
            "id": invoice_id,
            "extraction_method": extraction_method,
            **extracted,
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing document: {str(e)}")


# ─── Tool 2: POST /tools/parse-bank-csv ──────────────────────────────────────

# Column name aliases — handles common bank export variations
_DATE_COLS = ["date", "transaction date", "txn date", "value date", "posting date"]
_DESC_COLS = ["description", "particulars", "narration", "details", "transaction description"]
_CREDIT_COLS = ["credit", "deposits", "amount in", "credit amount", "cr amount", "cr"]
_DEBIT_COLS = ["debit", "withdrawals", "amount out", "debit amount", "dr amount", "dr"]


def _find_col(df_cols: list[str], aliases: list[str]) -> str | None:
    lower_cols = {c.lower().strip(): c for c in df_cols}
    for alias in aliases:
        if alias in lower_cols:
            return lower_cols[alias]
    return None


@router.post("/parse-bank-csv")
async def parse_bank_csv(file: UploadFile = File(...)):
    """
    Parse a bank statement CSV. Filters for credit (incoming) rows only.
    Saves each row to bank_transactions table.
    Returns list of saved transactions.
    """
    content = await file.read()
    try:
        # Check if the first line is an opening balance and skip if so
        first_line = content.splitlines()[0].decode('utf-8', errors='ignore').lower()
        if 'opening balance' in first_line:
            df = pd.read_csv(io.BytesIO(content), skiprows=1)
        else:
            df = pd.read_csv(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not parse CSV: {e}")

    cols = list(df.columns)

    date_col = _find_col(cols, _DATE_COLS)
    desc_col = _find_col(cols, _DESC_COLS)
    credit_col = _find_col(cols, _CREDIT_COLS)

    if not date_col or not desc_col or not credit_col:
        raise HTTPException(
            status_code=422,
            detail=f"Could not identify required columns (date, description, credit) in: {cols}",
        )

    df = df.rename(columns={
        date_col: "date",
        desc_col: "description",
        credit_col: "credit",
    })

    # Convert credit to numeric, coerce errors to NaN
    df["credit"] = pd.to_numeric(df["credit"], errors="coerce")

    # Drop opening balance rows by description (case-insensitive)
    df = df[~df["description"].fillna("").str.strip().str.lower().eq("opening balance")]

    # Only keep incoming (credit > 0)
    df = df[df["credit"] > 0].dropna(subset=["credit"])

    if df.empty:
        return {"transactions": [], "count": 0}

    db = get_supabase()
    saved = []

    for _, row in df.iterrows():
        # Normalise date to YYYY-MM-DD
        try:
            txn_date = pd.to_datetime(row["date"]).strftime("%Y-%m-%d")
        except Exception:
            txn_date = str(row["date"])

        desc = str(row["description"]).strip() if pd.notna(row["description"]) else ""

        insert_data = {
            "transaction_date": txn_date,
            "description": desc,
            "credit_amount": float(row["credit"]),
        }
        result = db.table("bank_transactions").insert(insert_data).execute()
        if result.data:
            saved.append({
                "id": result.data[0]["id"],
                "transaction_date": txn_date,
                "description": desc,
                "credit_amount": float(row["credit"]),
            })

    return {"transactions": saved, "count": len(saved)}


# ─── Tool 3: POST /tools/convert-currency ────────────────────────────────────

@router.post("/convert-currency", response_model=ConvertCurrencyResponse)
async def convert_currency(req: ConvertCurrencyRequest):
    """
    Convert amount from_currency → to_currency using historical FX rate on req.date.
    Always uses payment date from invoice, never today's date.
    """
    try:
        result = await fx.convert(req.amount, req.from_currency, req.to_currency, req.date)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return result


# ─── Tool 4: POST /tools/parse-bank-description ──────────────────────────────

@router.post("/parse-bank-description", response_model=ParseDescriptionResponse)
async def parse_bank_description(req: ParseDescriptionRequest):
    """
    Use DeepSeek-V3 via Chutes API to extract customer name and invoice reference
    from a Malaysian bank transaction description. Updates the DB row if id provided.
    """
    try:
        parsed = await chutes.parse_bank_description(req.description)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Chutes API error: {e}")

    # Update bank_transactions row if id provided
    if req.bank_transaction_id:
        db = get_supabase()
        update_data = {}
        if parsed.get("customer_name"):
            update_data["parsed_customer"] = parsed["customer_name"]
        if parsed.get("invoice_reference"):
            update_data["parsed_reference"] = parsed["invoice_reference"]
        if update_data:
            db.table("bank_transactions").update(update_data).eq(
                "id", req.bank_transaction_id
            ).execute()

    return parsed


# ─── Tool 5: POST /tools/match-transaction ───────────────────────────────────

@router.post("/match-transaction")
async def match_transaction(req: MatchRequest):
    """
    Pure Python scoring — no LLM.
    Scores all provided bank transactions against the invoice and returns best match.
    """
    db = get_supabase()

    # Fetch invoice
    inv_result = db.table("invoices").select("*").eq("id", req.invoice_id).execute()
    if not inv_result.data:
        raise HTTPException(status_code=404, detail=f"Invoice {req.invoice_id} not found")
    invoice = inv_result.data[0]

    if not invoice.get("expected_myr"):
        raise HTTPException(
            status_code=422,
            detail="Invoice expected_myr is not set. Run convert-currency first.",
        )

    # Fetch all requested bank transactions
    tx_result = (
        db.table("bank_transactions")
        .select("*")
        .in_("id", req.bank_transaction_ids)
        .execute()
    )
    if not tx_result.data:
        raise HTTPException(status_code=404, detail="No matching bank transactions found")

    bank_txs = tx_result.data

    # Score and pick best
    best = matcher.best_match(invoice, bank_txs)
    best_tx = best["transaction"]

    # Save match result to DB
    match_insert = {
        "invoice_id": req.invoice_id,
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

    return {
        "match_result_id": match_id,
        "invoice_id": req.invoice_id,
        "bank_transaction_id": best_tx["id"],
        "confidence": best["confidence"],
        "status": best["status"],
        "variance": best["variance"],
        "variance_pct": best["variance_pct"],
        "reason": best["reason"],
        "score_breakdown": best["score_breakdown"],
    }


# ─── Tool 6: POST /tools/classify-exception ──────────────────────────────────

@router.post("/classify-exception", response_model=ClassifyExceptionResponse)
async def classify_exception(req: ClassifyExceptionRequest):
    """
    Called only for review/exception matches.
    Uses DeepSeek to explain why the match failed and classify exception type.
    Updates match_results row.
    """
    db = get_supabase()

    match_result = (
        db.table("match_results").select("*").eq("id", req.match_result_id).execute()
    )
    if not match_result.data:
        raise HTTPException(status_code=404, detail="Match result not found")
    match = match_result.data[0]

    invoice_result = db.table("invoices").select("*").eq("id", match["invoice_id"]).execute()
    tx_result = (
        db.table("bank_transactions")
        .select("*")
        .eq("id", match["bank_transaction_id"])
        .execute()
    )

    if not invoice_result.data or not tx_result.data:
        raise HTTPException(status_code=404, detail="Invoice or transaction not found")

    invoice = invoice_result.data[0]
    bank_tx = tx_result.data[0]

    classification = matcher.classify_single_match_exception(invoice, bank_tx, match)

    # Update match_results row
    db.table("match_results").update({
        "exception_type": classification["exception_type"],
        "exception_explanation": classification["reason"],
        "severity": classification["severity"],
        "recommended_action": classification["recommended_action"],
        "requires_human_review": classification["requires_human_review"],
        "suggested_execution_action": classification["suggested_execution_action"],
    }).eq("id", req.match_result_id).execute()

    return {
        "exception_type": classification["exception_type"],
        "exception_explanation": classification["reason"],
    }
