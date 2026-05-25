-- ============================================================
-- Global Treasury Agent — Multi-Scenario Reconciliation
-- Migration: Run this in Supabase SQL Editor
-- ============================================================

-- 1. Extend match_results with new columns
ALTER TABLE match_results
  ADD COLUMN IF NOT EXISTS scenario_type TEXT,
  ADD COLUMN IF NOT EXISTS match_group_id UUID,
  ADD COLUMN IF NOT EXISTS paid_amount_myr NUMERIC,
  ADD COLUMN IF NOT EXISTS remaining_amount_myr NUMERIC,
  ADD COLUMN IF NOT EXISTS is_partial BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS human_decision_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS severity TEXT,
  ADD COLUMN IF NOT EXISTS recommended_action TEXT,
  ADD COLUMN IF NOT EXISTS requires_human_review BOOLEAN,
  ADD COLUMN IF NOT EXISTS suggested_execution_action TEXT,
  ADD COLUMN IF NOT EXISTS approval_status TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_reason TEXT,
  ADD COLUMN IF NOT EXISTS case_status TEXT,
  ADD COLUMN IF NOT EXISTS execution_action TEXT,
  ADD COLUMN IF NOT EXISTS execution_status TEXT,
  ADD COLUMN IF NOT EXISTS execution_result TEXT,
  ADD COLUMN IF NOT EXISTS follow_up_channel TEXT,
  ADD COLUMN IF NOT EXISTS follow_up_message TEXT,
  ADD COLUMN IF NOT EXISTS follow_up_status TEXT,
  ADD COLUMN IF NOT EXISTS follow_up_sent_at TIMESTAMPTZ;

-- Add a column to invoices for tracking payment reference
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS due_date DATE;

-- 2. Create match_groups table for multi-entity groupings
CREATE TABLE IF NOT EXISTS match_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_type TEXT NOT NULL,
  invoice_ids UUID[] NOT NULL DEFAULT '{}',
  bank_transaction_ids UUID[] NOT NULL DEFAULT '{}',
  total_expected_myr NUMERIC,
  total_received_myr NUMERIC,
  total_variance_myr NUMERIC,
  coverage_pct NUMERIC,
  status TEXT,
  confidence NUMERIC,
  exception_type TEXT,
  exception_explanation TEXT,
  severity TEXT,
  recommended_action TEXT,
  requires_human_review BOOLEAN,
  suggested_execution_action TEXT,
  human_decision TEXT,
  human_decision_at TIMESTAMPTZ,
  approval_status TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  review_reason TEXT,
  case_status TEXT,
  execution_action TEXT,
  execution_status TEXT,
  execution_result TEXT,
  follow_up_channel TEXT,
  follow_up_message TEXT,
  follow_up_status TEXT,
  follow_up_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE match_groups
  ADD COLUMN IF NOT EXISTS severity TEXT,
  ADD COLUMN IF NOT EXISTS recommended_action TEXT,
  ADD COLUMN IF NOT EXISTS requires_human_review BOOLEAN,
  ADD COLUMN IF NOT EXISTS suggested_execution_action TEXT,
  ADD COLUMN IF NOT EXISTS approval_status TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_reason TEXT,
  ADD COLUMN IF NOT EXISTS case_status TEXT,
  ADD COLUMN IF NOT EXISTS execution_action TEXT,
  ADD COLUMN IF NOT EXISTS execution_status TEXT,
  ADD COLUMN IF NOT EXISTS execution_result TEXT,
  ADD COLUMN IF NOT EXISTS follow_up_channel TEXT,
  ADD COLUMN IF NOT EXISTS follow_up_message TEXT,
  ADD COLUMN IF NOT EXISTS follow_up_status TEXT,
  ADD COLUMN IF NOT EXISTS follow_up_sent_at TIMESTAMPTZ;

-- 3. Add foreign key reference from match_results → match_groups
-- (done via match_group_id UUID column added above)

-- 4. Create index for group lookups
CREATE INDEX IF NOT EXISTS idx_match_results_group_id ON match_results(match_group_id);
CREATE INDEX IF NOT EXISTS idx_match_groups_status ON match_groups(status);

-- Verify
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
