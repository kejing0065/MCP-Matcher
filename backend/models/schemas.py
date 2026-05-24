from pydantic import BaseModel
from typing import Optional, List
from datetime import date


# ─── Tool 1: Extract Document ────────────────────────────────────────────────

class ExtractedInvoice(BaseModel):
    id: str
    invoice_no: Optional[str] = None
    customer: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    invoice_date: Optional[str] = None
    due_date: Optional[str] = None
    payment_reference: Optional[str] = None


# ─── Tool 2: Bank CSV ─────────────────────────────────────────────────────────

class BankTransaction(BaseModel):
    id: str
    transaction_date: str
    description: str
    credit_amount: float


class ParseBankCSVResponse(BaseModel):
    transactions: List[BankTransaction]
    count: int


# ─── Tool 3: Convert Currency ─────────────────────────────────────────────────

class ConvertCurrencyRequest(BaseModel):
    amount: float
    from_currency: str
    to_currency: str
    date: str  # YYYY-MM-DD


class ConvertCurrencyResponse(BaseModel):
    original_amount: float
    from_currency: str
    converted_amount: float
    to_currency: str
    rate_used: float
    date_used: str
    tolerance_min: float
    tolerance_max: float


# ─── Tool 4: Parse Bank Description ──────────────────────────────────────────

class ParseDescriptionRequest(BaseModel):
    description: str
    bank_transaction_id: Optional[str] = None


class ParseDescriptionResponse(BaseModel):
    customer_name: Optional[str] = None
    invoice_reference: Optional[str] = None


# ─── Tool 5: Match Transaction ────────────────────────────────────────────────

class MatchRequest(BaseModel):
    invoice_id: str
    bank_transaction_ids: List[str]


class ScoreBreakdown(BaseModel):
    amount_score: float
    date_score: float
    reference_score: float
    confidence: float


class MatchResponse(BaseModel):
    match_result_id: str
    invoice_id: str
    bank_transaction_id: str
    confidence: float
    status: str  # matched | review | exception
    variance: float
    variance_pct: float
    score_breakdown: ScoreBreakdown
    reason: str


# ─── Tool 6: Classify Exception ───────────────────────────────────────────────

class ClassifyExceptionRequest(BaseModel):
    match_result_id: str


class ClassifyExceptionResponse(BaseModel):
    exception_type: str
    exception_explanation: str


# ─── Reconcile ────────────────────────────────────────────────────────────────

class ReconcileRequest(BaseModel):
    invoice_id: str
    bank_transaction_ids: List[str]


class ReconcileResponse(BaseModel):
    invoice_id: str
    match_result_id: str
    status: str
    confidence: float
    variance: float
    variance_pct: float
    exception_type: Optional[str] = None
    exception_explanation: Optional[str] = None
    fx_rate: float
    fx_date: str
    expected_myr: float
    score_breakdown: Optional[ScoreBreakdown] = None


# ─── Human Decision ───────────────────────────────────────────────────────────

class DecisionRequest(BaseModel):
    decision: str  # "approved" | "rejected"


# ─── Dashboard ────────────────────────────────────────────────────────────────

class DashboardStats(BaseModel):
    total_invoices: int
    auto_matched: int
    needs_review: int
    exceptions: int
    total_variance_myr: float


class MatchResultDetail(BaseModel):
    id: str
    invoice_id: Optional[str] = None
    bank_transaction_id: Optional[str] = None
    confidence: Optional[float] = None
    status: Optional[str] = None
    variance: Optional[float] = None
    variance_pct: Optional[float] = None
    reason: Optional[str] = None
    exception_type: Optional[str] = None
    exception_explanation: Optional[str] = None
    human_decision: Optional[str] = None
    created_at: Optional[str] = None
    invoice: Optional[dict] = None
    bank_transaction: Optional[dict] = None


class DashboardResponse(BaseModel):
    stats: DashboardStats
    results: List[MatchResultDetail]
