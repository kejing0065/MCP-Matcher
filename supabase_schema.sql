-- Global Treasury Agent — Supabase Schema
-- Run this in the Supabase SQL Editor

create table invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text,
  customer text,
  amount numeric,
  currency text,
  invoice_date date,
  expected_myr numeric,
  fx_rate numeric,
  fx_date date,
  created_at timestamptz default now()
);

create table bank_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_date date,
  description text,
  parsed_customer text,
  parsed_reference text,
  credit_amount numeric,
  created_at timestamptz default now()
);

create table match_results (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references invoices(id),
  bank_transaction_id uuid references bank_transactions(id),
  confidence numeric,
  status text,
  variance numeric,
  variance_pct numeric,
  reason text,
  exception_type text,
  exception_explanation text,
  severity text,
  recommended_action text,
  requires_human_review boolean,
  suggested_execution_action text,
  human_decision text,
  human_decision_at timestamptz,
  approval_status text,
  reviewed_by text,
  reviewed_at timestamptz,
  review_reason text,
  case_status text,
  execution_action text,
  execution_status text,
  execution_result text,
  follow_up_channel text,
  follow_up_message text,
  follow_up_status text,
  follow_up_sent_at timestamptz,
  created_at timestamptz default now()
);

-- invoice_id is nullable: allows logging early steps before a match_result exists
create table agent_logs (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references invoices(id),
  match_result_id uuid references match_results(id),
  action text,
  detail text,
  created_at timestamptz default now()
);
