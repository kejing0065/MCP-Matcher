// ─── API base URL ─────────────────────────────────────────────────────────────
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

import type {
  DashboardResponse,
  MatchResult,
  MatchGroup,
  AgentLog,
  DecisionResponse,
  ReconcileResponse,
  MultiReconcileResponse,
} from "./types";

// ─── Dashboard ────────────────────────────────────────────────────────────────

export async function getDashboard(): Promise<DashboardResponse> {
  const res = await fetch(`${API_BASE}/reconcile/dashboard`);
  if (!res.ok) throw new Error("Failed to fetch dashboard");
  return res.json();
}

// ─── Single-entity decision ───────────────────────────────────────────────────

export async function updateDecision(
  matchResultId: string,
  decision: "approved" | "rejected" | "partial",
): Promise<DecisionResponse> {
  const res = await fetch(`${API_BASE}/reconcile/results/${matchResultId}/decision`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to update decision");
  }
  return res.json();
}

// ─── Group-level decision ─────────────────────────────────────────────────────

export async function updateGroupDecision(
  groupId: string,
  decision: "approved" | "rejected" | "partial",
): Promise<{ group_id: string; decision: string; decided_at: string }> {
  const res = await fetch(`${API_BASE}/reconcile/groups/${groupId}/decision`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to update group decision");
  }
  return res.json();
}

// ─── Match groups ─────────────────────────────────────────────────────────────

export async function getMatchGroups(): Promise<{ groups: MatchGroup[]; count: number }> {
  const res = await fetch(`${API_BASE}/reconcile/groups`);
  if (!res.ok) throw new Error("Failed to fetch match groups");
  return res.json();
}

// ─── Agent logs ───────────────────────────────────────────────────────────────

export async function getAgentLogs(matchResultId: string): Promise<AgentLog[]> {
  const res = await fetch(`${API_BASE}/reconcile/agent-logs/${matchResultId}`);
  if (!res.ok) throw new Error("Failed to fetch agent logs");
  return res.json();
}

// ─── Auto-match ───────────────────────────────────────────────────────────────

export async function autoMatch(): Promise<{
  message: string;
  matches_created: number;
  unmatched_invoices: number;
}> {
  const res = await fetch(`${API_BASE}/reconcile/auto-match`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Auto-match failed");
  }
  return res.json();
}

// ─── Single-entity reconcile ──────────────────────────────────────────────────

export async function reconcile(
  invoiceId: string,
  bankTransactionIds: string[],
): Promise<ReconcileResponse> {
  const res = await fetch(`${API_BASE}/reconcile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      invoice_id: invoiceId,
      bank_transaction_ids: bankTransactionIds,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Reconciliation failed");
  }
  return res.json();
}

// ─── Multi-entity reconcile ───────────────────────────────────────────────────

export async function reconcileMulti(
  invoiceIds: string[],
  bankTransactionIds: string[],
): Promise<MultiReconcileResponse> {
  const res = await fetch(`${API_BASE}/reconcile/multi`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      invoice_ids: invoiceIds,
      bank_transaction_ids: bankTransactionIds,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Multi-entity reconciliation failed");
  }
  return res.json();
}
