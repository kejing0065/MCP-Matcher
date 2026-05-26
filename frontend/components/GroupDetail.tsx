"use client";

import { useState } from "react";
import type { MatchGroup } from "@/lib/types";
import { updateGroupDecision } from "@/lib/api";
import { showToast } from "./Toast";
import ScenarioBadge from "./ScenarioBadge";
import ConfidenceBreakdown from "./ConfidenceBreakdown";
import { SCENARIO_LABELS } from "@/lib/types";
import type { UploadProgress } from "@/lib/uploadStore";

interface GroupDetailProps {
  group: MatchGroup;
  onDecision: () => void;
  upload?: UploadProgress | null;
}

function CoverageBar({ pct, expected, received }: { pct: number; expected?: number; received?: number }) {
  if (expected && received && expected > 0) {
    const isOverpaid = received > expected;
    const excess = Math.max(0, received - expected);
    const missing = Math.max(0, expected - received);
    
    if (isOverpaid) {
      // Overpaid: green for expected, blue for excess
      const greenPct = (expected / received) * 100;
      const bluePct = (excess / received) * 100;
      return (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-[#21262d] rounded-full overflow-hidden flex">
            <div className="h-full bg-green-500 transition-all duration-500" style={{ width: `${greenPct}%` }} />
            <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${bluePct}%` }} />
          </div>
          <span className="text-[12px] font-mono font-bold text-neutral-200 w-10 text-right shrink-0">{pct.toFixed(1)}%</span>
        </div>
      );
    } else {
      // Underpaid: blue for received, red for missing
      const bluePct = (received / expected) * 100;
      const redPct = (missing / expected) * 100;
      return (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-[#21262d] rounded-full overflow-hidden flex">
            <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${bluePct}%` }} />
            <div className="h-full bg-red-500 transition-all duration-500" style={{ width: `${redPct}%` }} />
          </div>
          <span className="text-[12px] font-mono font-bold text-neutral-200 w-10 text-right shrink-0">{pct.toFixed(1)}%</span>
        </div>
      );
    }
  }
  
  // Fallback to single color bar if amounts not provided
  const color = pct >= 95 ? "bg-green-500" : pct >= 60 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-[#21262d] rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-[12px] font-mono font-bold text-neutral-200 w-10 text-right shrink-0">{pct.toFixed(1)}%</span>
    </div>
  );
}

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-baseline py-2 text-[12px] border-b border-[#21262d]/50 last:border-b-0">
      <span className="text-neutral-500 shrink-0">{label}</span>
      <span className="text-neutral-200 font-semibold text-right max-w-[62%] break-words">{value ?? "-"}</span>
    </div>
  );
}

function formatAmount(value?: number | null) {
  if (value == null || Number.isNaN(value)) return "-";
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function InfoGrid({ group }: { group: MatchGroup }) {
  const groupReason = group.match_results?.find((result) => result.reason)?.reason;
  const items: [string, React.ReactNode, boolean?][] = [
    ["Exception type", group.exception_type],
    ["Severity", group.severity],
    ["Reason", groupReason, true],
    ["Recommended action", group.recommended_action, true],
    ["Suggested execution", group.suggested_execution_action],
    ["Human review", group.requires_human_review ? "Required" : "Not required"],
  ];

  return (
    <div className="rounded-md p-3.5 bg-[#0d1117] border border-[#30363d] grid grid-cols-2 gap-x-5 gap-y-3">
      {items.map(([label, value, wide]) => (
        <div key={label} className={wide ? "col-span-2" : ""}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{label}</p>
          <p className="text-[12px] text-neutral-200 mt-1 leading-relaxed">{value ?? "-"}</p>
        </div>
      ))}
    </div>
  );
}

export default function GroupDetail({ group, onDecision, upload }: GroupDetailProps) {
  const [busy, setBusy] = useState(false);
  const [btnLoading, setBtnLoading] = useState<"approved" | "rejected" | null>(null);
  const [reviewedBy, setReviewedBy] = useState(group.reviewed_by ?? "");
  const [reviewReason, setReviewReason] = useState(group.review_reason ?? "");

  const invoices = group.invoices ?? [];
  const transactions = group.bank_transactions ?? [];
  const coveragePct = group.coverage_pct ?? 0;
  const groupReason = group.match_results?.find((result) => result.reason)?.reason;
  const invoiceSummary = invoices
    .map((inv) => {
      const invoiceNo = inv.invoice_no ?? "INV-????";
      const currency = inv.currency ?? "-";
      return `Invoice ${invoiceNo} is ${currency} ${formatAmount(inv.amount)}, which should land around MYR ${formatAmount(inv.expected_myr)}.`;
    })
    .join(" ");
  const transactionSummary = transactions
    .map((tx) => `A related bank transaction shows a receipt of MYR ${formatAmount(tx.credit_amount)}.`)
    .join(" ");
  const totalSummary = `In total, expected MYR ${formatAmount(group.total_expected_myr)} vs received MYR ${formatAmount(group.total_received_myr)} results in a variance of MYR ${formatAmount(group.total_variance_myr)}.`;
  const groupAgentSummary = [invoiceSummary, transactionSummary, totalSummary]
    .filter(Boolean)
    .join(" ");
  const isDuplicate = group.scenario_type === "s6_duplicate";
  const isPartial = group.scenario_type === "s5_partial" || group.status === "partial";
  const isUploading = upload && upload.phase !== "done" && upload.phase !== "error";

  // Show loading state during analysis
  if (isUploading) {
    return (
      <div className="flex flex-col gap-4 p-5 rounded-lg border border-[#30363d] bg-[#161b22] text-left text-[13px] animate-fade-up">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-[15px] font-semibold text-white tracking-tight">Analyzing...</h2>
              <span className="w-3.5 h-3.5 border-2 border-neutral-700 border-t-blue-500 rounded-full animate-spin" />
            </div>
            <p className="text-[12px] text-neutral-400 mt-0.5">AI is processing your files</p>
          </div>
        </div>

        <div className="space-y-3">
          {upload.invoiceNames && upload.invoiceNames.length > 0 && (
            <div className="text-[12px] text-neutral-300">
              <p className="text-neutral-500 mb-1">Files: {upload.invoiceNames.join(", ")}</p>
            </div>
          )}
          {upload.phase && (
            <div className="text-[12px] text-neutral-300">
              <p className="text-neutral-500 mb-1">Phase:</p>
              <p>
                {upload.phase === "extracting" && "🔍 Extracting data from documents..."}
                {upload.phase === "parsing" && "📄 Parsing bank statement..."}
                {upload.phase === "reconciling" && "⚙️ Matching invoices with transactions..."}
              </p>
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-[#21262d] text-center">
          <p className="text-[11px] text-neutral-500">Please wait while AI analyzes your submission</p>
        </div>
      </div>
    );
  }

  const decide = async (decision: "approved" | "rejected") => {
    setBusy(true);
    setBtnLoading(decision);
    try {
      await updateGroupDecision(group.id, decision, reviewedBy || "Reviewer", reviewReason);
      showToast({
        type: decision === "approved" ? "success" : "error",
        message: decision === "approved" ? "Group approved and execution updated" : "Group rejected and execution skipped",
      });
      onDecision();
    } catch {
      showToast({ type: "error", message: "Error saving decision" });
    } finally {
      setBusy(false);
      setBtnLoading(null);
    }
  };

  const confColor =
    (group.confidence ?? 0) >= 85
      ? "text-green-500 bg-green-950/40 border-green-800/40"
      : (group.confidence ?? 0) >= 60
      ? "text-amber-500 bg-amber-950/40 border-amber-800/40"
      : "text-red-500 bg-red-950/40 border-red-800/40";

  return (
    <div className="flex flex-col gap-4 p-5 rounded-lg border border-[#30363d] bg-[#161b22] text-left animate-fade-up text-[13px]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-[15px] font-semibold text-white tracking-tight">
              {invoices.length} Invoice{invoices.length !== 1 ? "s" : ""} to {transactions.length} Transaction{transactions.length !== 1 ? "s" : ""}
            </h2>
            <ScenarioBadge scenarioType={group.scenario_type} size="sm" />
          </div>
          <p className="text-[12px] text-neutral-400 mt-0.5">
            {SCENARIO_LABELS[group.scenario_type ?? ""] ?? group.scenario_type}
          </p>
        </div>
        <span className={`px-2.5 py-0.5 rounded-full text-[13px] font-bold font-mono border ${confColor} shrink-0`}>
          {Math.round(group.confidence ?? 0)}% conf
        </span>
      </div>

      {isDuplicate && (
        <div className="rounded-md p-3 bg-red-950/30 border border-red-800/50 text-[11px] text-red-300">
          <span className="font-bold text-red-400">Possible Duplicate Payment: </span>
          One or more transactions may have already been used in a previous match.
        </div>
      )}

      {isPartial && (
        <div className="rounded-md p-3 bg-amber-950/30 border border-amber-800/50 text-[11px] text-amber-300">
          <span className="font-bold text-amber-400">Partial Payment: </span>
          Only {coveragePct.toFixed(1)}% received. Outstanding MYR {(group.remaining_amount_myr ?? 0).toFixed(2)}.
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between text-[10px] uppercase tracking-wider text-neutral-500 font-bold">
          <span>Payment coverage</span>
          <span className="font-mono text-neutral-300">
            MYR {(group.total_received_myr ?? 0).toFixed(2)} / {(group.total_expected_myr ?? 0).toFixed(2)}
          </span>
        </div>
        <CoverageBar pct={coveragePct} expected={group.total_expected_myr} received={group.total_received_myr} />
      </div>

      <div className="grid grid-cols-2 gap-[14px]">
        <div className="p-3 rounded-md border border-[#30363d] bg-[#0d1117] flex flex-col gap-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Invoices ({invoices.length})</p>
          {invoices.length === 0 ? (
            <p className="text-[12px] text-neutral-600 italic">No invoices</p>
          ) : invoices.map((inv, idx) => (
            <div key={inv.id ?? idx} className={`${idx > 0 ? "border-t border-[#21262d]/50 pt-2" : ""}`}>
              <p className="text-[12px] font-semibold text-white truncate">{inv.invoice_no ?? "INV-????"}</p>
              <p className="text-[11px] text-neutral-500 truncate">{inv.customer ?? "-"}</p>
              <p className="text-[11px] font-mono text-blue-400 mt-0.5">{inv.currency} {inv.amount?.toFixed(2)} to MYR {inv.expected_myr?.toFixed(2) ?? "-"}</p>
            </div>
          ))}
        </div>

        <div className="p-3 rounded-md border border-[#30363d] bg-[#0d1117] flex flex-col gap-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Transactions ({transactions.length})</p>
          {transactions.length === 0 ? (
            <p className="text-[12px] text-neutral-600 italic">No transactions</p>
          ) : transactions.map((tx, idx) => (
            <div key={tx.id ?? idx} className={`${idx > 0 ? "border-t border-[#21262d]/50 pt-2" : ""}`}>
              <p className="text-[11px] text-neutral-400 font-mono leading-tight truncate">{(tx.description ?? "").replace(/\b\d{10,16}\b/g, "**********").slice(0, 60)}</p>
              <p className="text-[12px] font-bold font-mono text-green-400 mt-0.5">MYR {tx.credit_amount?.toFixed(2)}</p>
              <p className="text-[11px] text-neutral-600">{tx.transaction_date}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="p-3 rounded-md border border-[#30363d] bg-[#0d1117] flex flex-col">
        <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-2">Group Summary</p>
        <FieldRow label="Total Expected" value={<span className="text-blue-400 font-mono">MYR {(group.total_expected_myr ?? 0).toFixed(2)}</span>} />
        <FieldRow label="Total Received" value={<span className="text-green-400 font-mono">MYR {(group.total_received_myr ?? 0).toFixed(2)}</span>} />
        <FieldRow label="Total Variance" value={<span className={`font-mono font-bold ${(group.total_variance_myr ?? 0) >= 0 ? "text-green-500" : "text-red-500"}`}>{(group.total_variance_myr ?? 0) >= 0 ? "+" : ""}MYR {(group.total_variance_myr ?? 0).toFixed(2)}</span>} />
        {isPartial && <FieldRow label="Outstanding" value={<span className="text-amber-400 font-mono font-bold">MYR {(group.remaining_amount_myr ?? 0).toFixed(2)}</span>} />}
      </div>

      {invoices.some((inv) => inv.fx_rate) && (
        <div className="rounded-md p-3.5 bg-blue-950/20 border border-blue-900/50">
          <p className="text-[10px] font-bold uppercase tracking-wider text-blue-400 mb-3">
            FX Calculations
          </p>
          <div className="space-y-2">
            {invoices.map((inv, idx) => (
              inv.fx_rate && (
                <div key={inv.id ?? idx} className="flex items-center gap-2 font-mono text-[12px] text-neutral-200 pb-2 border-b border-blue-900/30 last:border-b-0 last:pb-0">
                  <span className="text-neutral-500 shrink-0">{inv.currency}</span>
                  <span className="font-semibold">{inv.amount?.toFixed(0)}</span>
                  <span className="text-neutral-500">×</span>
                  <span className="text-blue-300">{inv.fx_rate.toFixed(4)}</span>
                  <span className="text-neutral-500">=</span>
                  <span className="text-green-400 font-bold">{inv.expected_myr?.toFixed(2)}</span>
                  <span className="text-neutral-600 ml-auto text-[11px]">{inv.invoice_no}</span>
                </div>
              )
            ))}
          </div>
        </div>
      )}

      {group.invoice_score_breakdowns && group.invoice_score_breakdowns.length > 0 && (
        <div className="rounded-md p-3.5 bg-purple-950/20 border border-purple-900/50">
          <p className="text-[10px] font-bold uppercase tracking-wider text-purple-400 mb-3">
            Invoice Confidence Breakdown
          </p>
          <div className="space-y-4">
            {group.invoice_score_breakdowns.map((item, idx) => (
              <div key={idx} className={`${idx > 0 ? "border-t border-purple-900/30 pt-3" : ""}`}>
                <p className="text-[11px] font-semibold text-neutral-200 mb-3">{item.invoice_no ?? item.invoice_id}</p>
                {item.score_breakdown && (
                  <div className="space-y-2">
                    {/* Overall confidence bar */}
                    <div className="flex items-center gap-3 mb-2 pb-2 border-b border-purple-900/20">
                      <span className="w-14 text-[11px] font-bold text-neutral-300 shrink-0">Overall</span>
                      <div className="flex-1 h-1.5 bg-[#30363d] rounded-full overflow-hidden">
                        <div
                          className={`h-full ${
                            item.score_breakdown.confidence >= 85
                              ? "bg-green-500"
                              : item.score_breakdown.confidence >= 60
                              ? "bg-amber-500"
                              : "bg-red-500"
                          }`}
                          style={{ width: `${Math.min(item.score_breakdown.confidence, 100)}%` }}
                        />
                      </div>
                      <span className="text-neutral-300 font-mono w-9 text-right text-[11px] font-bold">{item.score_breakdown.confidence.toFixed(0)}%</span>
                    </div>
                    
                    {/* Individual scores */}
                    <div className="flex items-center gap-3">
                      <span className="w-14 text-[11px] text-neutral-400 shrink-0">Amount</span>
                      <div className="flex-1 h-1.5 bg-[#30363d] rounded-full overflow-hidden">
                        <div
                          className={`h-full ${
                            item.score_breakdown.amount_score >= 85
                              ? "bg-green-500"
                              : item.score_breakdown.amount_score >= 60
                              ? "bg-amber-500"
                              : "bg-red-500"
                          }`}
                          style={{ width: `${Math.min(item.score_breakdown.amount_score, 100)}%` }}
                        />
                      </div>
                      <span className="text-neutral-300 font-mono w-9 text-right text-[11px]">{item.score_breakdown.amount_score.toFixed(0)}%</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="w-14 text-[11px] text-neutral-400 shrink-0">Date</span>
                      <div className="flex-1 h-1.5 bg-[#30363d] rounded-full overflow-hidden">
                        <div
                          className={`h-full ${
                            item.score_breakdown.date_score >= 85
                              ? "bg-green-500"
                              : item.score_breakdown.date_score >= 60
                              ? "bg-amber-500"
                              : "bg-red-500"
                          }`}
                          style={{ width: `${Math.min(item.score_breakdown.date_score, 100)}%` }}
                        />
                      </div>
                      <span className="text-neutral-300 font-mono w-9 text-right text-[11px]">{item.score_breakdown.date_score.toFixed(0)}%</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="w-14 text-[11px] text-neutral-400 shrink-0">Reference</span>
                      <div className="flex-1 h-1.5 bg-[#30363d] rounded-full overflow-hidden">
                        <div
                          className={`h-full ${
                            item.score_breakdown.reference_score >= 85
                              ? "bg-green-500"
                              : item.score_breakdown.reference_score >= 60
                              ? "bg-amber-500"
                              : "bg-red-500"
                          }`}
                          style={{ width: `${Math.min(item.score_breakdown.reference_score, 100)}%` }}
                        />
                      </div>
                      <span className="text-neutral-300 font-mono w-9 text-right text-[11px]">{item.score_breakdown.reference_score.toFixed(0)}%</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {group.score_breakdown && (
        <div className="border-t border-[#21262d]/50 pt-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-3">Group Overall Confidence</p>
          <ConfidenceBreakdown breakdown={group.score_breakdown} />
        </div>
      )}

      {groupAgentSummary && (
        <div className="rounded-md p-3 bg-amber-950/20 border border-amber-900/50">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-1.5">
            <span aria-hidden>🤖</span>
            <span>Agent explanation</span>
          </div>
          <p className="text-[12px] text-neutral-300 leading-relaxed">
            {groupAgentSummary}
          </p>
        </div>
      )}

      <InfoGrid group={group} />

      <div className="border-t border-[#21262d]/50 pt-4">
        {!group.human_decision ? (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5 text-[11px] font-semibold text-neutral-400">
                Reviewer
                <input value={reviewedBy} onChange={(e) => setReviewedBy(e.target.value)} placeholder="Your name" className="rounded-md border border-[#30363d] bg-[#0d1117] px-3 py-2 text-[12px] text-white outline-none focus:border-blue-500" />
              </label>
              <label className="flex flex-col gap-1.5 text-[11px] font-semibold text-neutral-400">
                Review reason
                <input value={reviewReason} onChange={(e) => setReviewReason(e.target.value)} placeholder="Why approve or reject?" className="rounded-md border border-[#30363d] bg-[#0d1117] px-3 py-2 text-[12px] text-white outline-none focus:border-blue-500" />
              </label>
            </div>
            <div className="flex gap-2">
              <button disabled={busy} onClick={() => decide("approved")} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-[13px] font-semibold bg-green-600 hover:bg-green-500 text-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                {btnLoading === "approved" ? "Approving..." : "Approve Group"}
              </button>
              <button disabled={busy} onClick={() => decide("rejected")} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-[13px] font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                {btnLoading === "rejected" ? "Rejecting..." : "Reject / Flag"}
              </button>
            </div>
          </div>
        ) : (
          <div className={`rounded-lg py-2.5 text-center text-[13px] font-bold border ${
            group.human_decision === "approved"
              ? "bg-green-950/20 border-green-800/40 text-green-500"
              : "bg-red-950/20 border-red-800/40 text-red-500"
          }`}>
            {group.human_decision === "approved" ? "Group Approved" : "Group Rejected / Flagged"}
          </div>
        )}
      </div>
    </div>
  );
}
