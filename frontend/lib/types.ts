export interface ScoreBreakdown {
  amount_score: number;
  date_score: number;
  reference_score: number;
  confidence: number;
}

export interface Invoice {
  id?: string;
  invoice_no?: string;
  customer?: string;
  amount?: number;
  currency?: string;
  invoice_date?: string;
  due_date?: string;
  payment_reference?: string;
  expected_myr?: number;
  fx_rate?: number;
  fx_date?: string;
  fx_source?: string;
}

export interface BankTransaction {
  id: string;
  transaction_date: string;
  description: string;
  credit_amount: number;
  parsed_customer?: string;
  parsed_reference?: string;
}

export interface MatchResult {
  id: string;
  invoice_id: string;
  bank_transaction_id: string;
  status: "matched" | "review" | "exception";
  confidence: number;
  variance: number;
  variance_pct: number;
  reason?: string;
  exception_type?: string;
  exception_explanation?: string | null;
  human_decision?: "approved" | "rejected" | null;
  human_decision_at?: string;
  created_at: string;
  updated_at?: string;
  invoice?: Invoice;
  bank_transaction?: BankTransaction;
  score_breakdown?: ScoreBreakdown;
}

export interface DashboardStats {
  total_invoices: number;
  auto_matched: number;
  needs_review: number;
  exceptions: number;
  total_variance_myr: number;
}

export interface DashboardResponse {
  stats: DashboardStats;
  results: MatchResult[];
}

export interface AgentLog {
  id?: string;
  action: string;
  detail: string;
  match_result_id?: string;
  invoice_id?: string;
  created_at?: string;
}

export interface DecisionResponse {
  id: string;
  human_decision: "approved" | "rejected";
  updated_at: string;
}

export interface ReconcileResponse {
  reason?: string;
  score_breakdown?: ScoreBreakdown;
  exception_explanation?: string;
}

export interface ToastProps {
  type: "success" | "error" | "info";
  message: string;
  duration?: number;
}
