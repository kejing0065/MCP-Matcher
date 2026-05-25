from pydantic import BaseModel
from typing import Optional, List


# ─── Tool 1: Extract Document ─────────────────────────────────────────────────

class ExtractedInvoice(BaseModel):
    id: str
    invoice_no: Optional[str] = None
    customer: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    invoice_date: Optional[str] = None
    due_date: Optional[str] = None
    payment_reference: Optional[str] = None


# ─── Tool 2: Bank CSV ──────────────────────────────────────────────────────────

class BankTransaction(BaseModel):
    id: str
    transaction_date: str
    description: str
    credit_amount: float


class ParseBankCSVResponse(BaseModel):
    transactions: List[BankTransaction]
    count: int


# ─── Tool 3: Convert Currency ──────────────────────────────────────────────────

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


# ─── Tool 4: Parse Bank Description ───────────────────────────────────────────

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
    status: str  # matched | review | exception | partial
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


# ─── Single-Entity Reconcile ──────────────────────────────────────────────────

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


# ─── Multi-Entity Reconcile (NEW) ─────────────────────────────────────────────

class MultiReconcileRequest(BaseModel):
    """
    Multi-scenario reconciliation request.
    Supports all scenarios:
      - S1: 1 invoice_id + 1 bank_transaction_id
      - S2: 1 invoice_id + multiple bank_transaction_ids (split payment)
      - S3: multiple invoice_ids + 1 bank_transaction_id (consolidated)
      - S4: multiple invoice_ids + multiple bank_transaction_ids (complex)
    """
    invoice_ids: List[str]
    bank_transaction_ids: List[str]


class MatchGroupResponse(BaseModel):
    """Response for a multi-entity match group."""
    group_id: str
    scenario_type: str
    invoice_ids: List[str]
    bank_transaction_ids: List[str]
    total_expected_myr: float
    total_received_myr: float
    total_variance_myr: float
    coverage_pct: float
    status: str  # matched | review | exception | partial
    confidence: float
    is_partial: bool
    remaining_amount_myr: float
    exception_type: Optional[str] = None
    exception_explanation: Optional[str] = None
    human_decision: Optional[str] = None
    match_result_ids: List[str]


# ─── Human Decision ───────────────────────────────────────────────────────────

class DecisionRequest(BaseModel):
    decision: str  # "approved" | "rejected" | "partial"
    reviewed_by: Optional[str] = None
    review_reason: Optional[str] = None


class GroupDecisionRequest(BaseModel):
    decision: str  # "approved" | "rejected" | "partial"
    reviewed_by: Optional[str] = None
    review_reason: Optional[str] = None


# ─── Dashboard ────────────────────────────────────────────────────────────────

class DashboardStats(BaseModel):
    total_invoices: int
    auto_matched: int
    needs_review: int
    exceptions: int
    partial_payments: int
    duplicates: int
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
    severity: Optional[str] = None
    recommended_action: Optional[str] = None
    requires_human_review: Optional[bool] = None
    suggested_execution_action: Optional[str] = None
    human_decision: Optional[str] = None
    human_decision_at: Optional[str] = None
    approval_status: Optional[str] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[str] = None
    review_reason: Optional[str] = None
    case_status: Optional[str] = None
    execution_action: Optional[str] = None
    execution_status: Optional[str] = None
    execution_result: Optional[str] = None
    follow_up_channel: Optional[str] = None
    follow_up_message: Optional[str] = None
    follow_up_status: Optional[str] = None
    follow_up_sent_at: Optional[str] = None
    created_at: Optional[str] = None
    # Multi-scenario fields
    scenario_type: Optional[str] = None
    match_group_id: Optional[str] = None
    paid_amount_myr: Optional[float] = None
    remaining_amount_myr: Optional[float] = None
    is_partial: Optional[bool] = None
    # Enriched relations
    invoice: Optional[dict] = None
    bank_transaction: Optional[dict] = None
    score_breakdown: Optional[ScoreBreakdown] = None


class MatchGroupDetail(BaseModel):
    id: str
    scenario_type: str
    invoice_ids: Optional[List[str]] = None
    bank_transaction_ids: Optional[List[str]] = None
    total_expected_myr: Optional[float] = None
    total_received_myr: Optional[float] = None
    total_variance_myr: Optional[float] = None
    coverage_pct: Optional[float] = None
    status: Optional[str] = None
    confidence: Optional[float] = None
    exception_type: Optional[str] = None
    exception_explanation: Optional[str] = None
    severity: Optional[str] = None
    recommended_action: Optional[str] = None
    requires_human_review: Optional[bool] = None
    suggested_execution_action: Optional[str] = None
    human_decision: Optional[str] = None
    human_decision_at: Optional[str] = None
    approval_status: Optional[str] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[str] = None
    review_reason: Optional[str] = None
    case_status: Optional[str] = None
    execution_action: Optional[str] = None
    execution_status: Optional[str] = None
    execution_result: Optional[str] = None
    follow_up_channel: Optional[str] = None
    follow_up_message: Optional[str] = None
    follow_up_status: Optional[str] = None
    follow_up_sent_at: Optional[str] = None
    created_at: Optional[str] = None
    # Enriched relations
    invoices: Optional[List[dict]] = None
    bank_transactions: Optional[List[dict]] = None
    match_results: Optional[List[dict]] = None


class DashboardResponse(BaseModel):
    stats: DashboardStats
    results: List[MatchResultDetail]
    groups: Optional[List[MatchGroupDetail]] = None
