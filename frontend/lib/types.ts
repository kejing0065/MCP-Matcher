export interface ScoreBreakdown {
  amount_score: number;
  date_score: number;
  reference_score: number;
  confidence: number;
}

export type ScenarioType =
  | "s1_one_to_one"
  | "s2_split"
  | "s3_consolidated"
  | "s4_complex"
  | "s5_partial"
  | "s6_duplicate"
  | "s7_unmatched"
  | "s8_bank_fee";

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
  status: "matched" | "review" | "exception" | "partial";
  confidence: number;
  variance: number;
  variance_pct: number;
  reason?: string;
  exception_type?: string;
  exception_explanation?: string | null;
  human_decision?: "approved" | "rejected" | "partial" | null;
  human_decision_at?: string;
  created_at: string;
  updated_at?: string;
  // Multi-scenario fields
  scenario_type?: ScenarioType;
  match_group_id?: string;
  paid_amount_myr?: number;
  remaining_amount_myr?: number;
  is_partial?: boolean;
  // Enriched relations
  invoice?: Invoice;
  bank_transaction?: BankTransaction;
  score_breakdown?: ScoreBreakdown;
}

export interface MatchGroup {
  id: string;
  scenario_type: ScenarioType;
  invoice_ids?: string[];
  bank_transaction_ids?: string[];
  total_expected_myr?: number;
  total_received_myr?: number;
  total_variance_myr?: number;
  coverage_pct?: number;
  remaining_amount_myr?: number;
  status?: "matched" | "review" | "exception" | "partial";
  confidence?: number;
  exception_type?: string;
  exception_explanation?: string;
  human_decision?: "approved" | "rejected" | "partial" | null;
  human_decision_at?: string;
  created_at?: string;
  // Enriched relations
  invoices?: Invoice[];
  bank_transactions?: BankTransaction[];
  match_results?: MatchResult[];
}

export interface DashboardStats {
  total_invoices: number;
  auto_matched: number;
  needs_review: number;
  exceptions: number;
  partial_payments: number;
  duplicates: number;
  total_variance_myr: number;
}

export interface DashboardResponse {
  stats: DashboardStats;
  results: MatchResult[];
  groups?: MatchGroup[];
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
  human_decision: "approved" | "rejected" | "partial";
  updated_at: string;
}

export interface ReconcileResponse {
  invoice_id?: string;
  match_result_id?: string;
  reason?: string;
  score_breakdown?: ScoreBreakdown;
  exception_explanation?: string;
  scenario_type?: ScenarioType;
  is_partial?: boolean;
  remaining_amount_myr?: number;
  coverage_pct?: number;
}

export interface MultiReconcileResponse {
  group_id: string;
  scenario_type: ScenarioType;
  invoice_ids: string[];
  bank_transaction_ids: string[];
  status: string;
  confidence: number;
  total_expected_myr: number;
  total_received_myr: number;
  total_variance_myr: number;
  coverage_pct: number;
  is_partial: boolean;
  remaining_amount_myr: number;
  exception_type?: string;
  exception_explanation?: string;
  match_result_ids: string[];
}

export interface ToastProps {
  type: "success" | "error" | "info";
  message: string;
  duration?: number;
}

// Scenario display helpers
export const SCENARIO_LABELS: Record<string, string> = {
  s1_one_to_one: "Standard",
  s2_split: "Split Payment",
  s3_consolidated: "Consolidated",
  s4_complex: "Complex Batch",
  s5_partial: "Partial",
  s6_duplicate: "Duplicate",
  s7_unmatched: "Unmatched",
  s8_bank_fee: "Bank Fee",
};

export const SCENARIO_COLORS: Record<string, string> = {
  s1_one_to_one: "text-neutral-400 bg-neutral-900/40 border-neutral-700/40",
  s2_split: "text-blue-400 bg-blue-950/40 border-blue-800/40",
  s3_consolidated: "text-purple-400 bg-purple-950/40 border-purple-800/40",
  s4_complex: "text-indigo-400 bg-indigo-950/40 border-indigo-800/40",
  s5_partial: "text-amber-400 bg-amber-950/40 border-amber-800/40",
  s6_duplicate: "text-red-400 bg-red-950/40 border-red-800/40",
  s7_unmatched: "text-orange-400 bg-orange-950/40 border-orange-800/40",
  s8_bank_fee: "text-yellow-400 bg-yellow-950/40 border-yellow-800/40",
};

export const SCENARIO_ICONS: Record<string, string> = {
  s1_one_to_one: "→",
  s2_split: "⑂",
  s3_consolidated: "⊕",
  s4_complex: "⊗",
  s5_partial: "◑",
  s6_duplicate: "⊘",
  s7_unmatched: "?",
  s8_bank_fee: "₣",
};
