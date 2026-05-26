"use client";

import React, { useEffect, useState } from "react";
import type { AgentLog, MatchGroup, MatchResult } from "@/lib/types";
import { getAgentLogs } from "@/lib/api";
import AuditTrail from "./AuditTrail";
import ConfidenceBreakdown from "./ConfidenceBreakdown";
import ScenarioBadge from "./ScenarioBadge";

interface HistoryTableProps {
  results: MatchResult[];
  groups?: MatchGroup[];
  activeTab: "all" | "approved" | "rejected" | "partial";
}

function timeAgo(ds?: string) {
  if (!ds) return "—";
  const diff = Date.now() - new Date(ds).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return "just now";
}

function maskText(s?: string) {
  return s ? s.replace(/\b\d{10,16}\b/g, "**********") : "-";
}

function displayValue(value?: string | number | null) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function exceptionReason(result: MatchResult) {
  if (result.reason) return result.reason;
  if (typeof result.variance_pct === "number") {
    return `Amount variance ${result.variance_pct.toFixed(1)}%`;
  }
  return "-";
}

function confBadge(conf: number) {
  if (conf >= 85) return "text-green-500 bg-green-950/40 border-green-800/40";
  if (conf >= 60) return "text-amber-500 bg-amber-950/40 border-amber-800/40";
  return "text-red-500 bg-red-950/40 border-red-800/40";
}

function HistoryAuditLogs({
  matchResultId,
  humanDecision,
  variance,
  decidedAt,
}: {
  matchResultId: string;
  humanDecision?: "approved" | "rejected" | "partial" | null;
  variance?: number;
  decidedAt?: string;
}) {
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function fetchLogs() {
      try {
        const res = await getAgentLogs(matchResultId);
        if (active) {
          setLogs(res);
          setLoading(false);
        }
      } catch {
        if (active) setLoading(false);
      }
    }
    fetchLogs();
    return () => {
      active = false;
    };
  }, [matchResultId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4">
        <span className="w-3.5 h-3.5 border-2 border-neutral-700 border-t-blue-500 rounded-full animate-spin shrink-0" />
        <span className="text-[12px] text-neutral-500 font-medium">
          Loading audit logs...
        </span>
      </div>
    );
  }

  return (
    <AuditTrail
      logs={logs}
      humanDecision={humanDecision}
      variance={variance}
      decidedAt={decidedAt}
    />
  );
}

export default function HistoryTable({
  results,
  groups = [],
  activeTab,
}: HistoryTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [expandedView, setExpandedView] = useState<"audit" | "invoice">(
    "audit",
  );

  const filtered = results.filter((r) => {
    if (activeTab === "approved") return r.human_decision === "approved";
    if (activeTab === "rejected") return r.human_decision === "rejected";
    if (activeTab === "partial") return r.human_decision === "partial";
    return r.human_decision != null;
  });

  const filteredGroups = groups.filter((g) => {
    if (activeTab === "approved") return g.human_decision === "approved";
    if (activeTab === "rejected") return g.human_decision === "rejected";
    if (activeTab === "partial") return g.human_decision === "partial";
    return g.human_decision != null;
  });

  if (filtered.length === 0 && filteredGroups.length === 0) {
    return (
      <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-12 text-center shadow-sm">
        <div className="text-3xl mb-2 text-neutral-500">📋</div>
        <p className="text-[13px] text-neutral-400 font-semibold">
          No decisions yet
        </p>
        <p className="text-[11px] text-neutral-500 mt-1">
          Approved and rejected cases will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[#30363d] bg-[#161b22] overflow-hidden flex flex-col shadow-sm">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#21262d] text-[10px] uppercase tracking-wider text-neutral-500 font-bold bg-[#0d1117]/50 select-none">
        <div className="w-20 shrink-0 text-left">Invoice</div>
        <div className="flex-1 text-left">Customer</div>
        <div className="w-[90px] shrink-0 text-right">Amount</div>
        <div className="w-[90px] shrink-0 text-center">Scenario</div>
        <div className="w-20 shrink-0 text-right">Variance</div>
        <div className="w-[80px] shrink-0 text-center">Decision</div>
        <div className="w-20 shrink-0 text-right">Decided</div>
      </div>

      <div className="flex flex-col">
        {filteredGroups.map((group, idx) => {
          const isExpanded = expandedGroupId === group.id;
          const isLast =
            idx === filteredGroups.length - 1 && filtered.length === 0;
          const invoices = group.invoices ?? [];
          const transactions = group.bank_transactions ?? [];
          const variance = group.total_variance_myr ?? 0;
          const conf = group.confidence ?? 0;
          const expectedTotal = group.total_expected_myr;
          const receivedTotal = group.total_received_myr;
          const invoiceLabel =
            invoices.length > 1
              ? `Group (${invoices.length})`
              : (invoices[0]?.invoice_no ?? "Group");
          const customerLabel =
            invoices
              .map((inv) => inv.customer)
              .filter(Boolean)
              .join(", ") || "—";
          const amountLabel =
            group.total_received_myr != null
              ? `MYR ${group.total_received_myr.toFixed(2)}`
              : "—";

          return (
            <React.Fragment key={group.id}>
              <div
                onClick={() => {
                  if (isExpanded) {
                    setExpandedGroupId(null);
                  } else {
                    setExpandedGroupId(group.id);
                    setExpandedId(null);
                  }
                }}
                className={`flex items-center gap-3 px-4 py-3.5 hover:bg-[#21262d]/50 transition-colors cursor-pointer select-none ${
                  isLast && !isExpanded ? "" : "border-b border-[#21262d]/50"
                }`}
              >
                <div className="w-20 shrink-0 text-[13px] font-semibold text-white truncate text-left">
                  {invoiceLabel}
                </div>
                <div className="flex-1 text-[12px] text-neutral-400 truncate text-left">
                  {customerLabel}
                </div>
                <div className="w-[90px] shrink-0 font-mono text-[12px] text-white text-right truncate">
                  {amountLabel}
                </div>
                <div className="w-[90px] shrink-0 flex justify-center">
                  <ScenarioBadge scenarioType={group.scenario_type} size="xs" />
                </div>
                <div
                  className={`w-20 shrink-0 font-mono text-[12px] text-right font-bold ${variance >= 0 ? "text-green-500" : "text-red-500"}`}
                >
                  {variance >= 0 ? "+" : ""}MYR {variance.toFixed(2)}
                </div>
                <div className="w-[80px] shrink-0 flex justify-center">
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold border inline-block ${
                      group.human_decision === "approved"
                        ? "text-green-500 bg-green-950/40 border-green-800/40"
                        : group.human_decision === "partial"
                          ? "text-amber-500 bg-amber-950/40 border-amber-800/40"
                          : "text-red-500 bg-red-950/40 border-red-800/40"
                    }`}
                  >
                    {group.human_decision === "approved"
                      ? "✓ Approved"
                      : group.human_decision === "partial"
                        ? "◑ Partial"
                        : "✕ Rejected"}
                  </span>
                </div>
                <div className="w-20 shrink-0 text-right text-[11px] text-neutral-500 font-medium">
                  {timeAgo(group.human_decision_at || group.created_at)}
                </div>
              </div>

              {isExpanded && (
                <div
                  className={`bg-[#0d1117]/80 p-5 px-6 border-b border-[#21262d] relative ${
                    isLast ? "rounded-b-lg border-b-0" : ""
                  }`}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedGroupId(null);
                    }}
                    className="absolute top-4 right-4 text-neutral-500 hover:text-white transition-colors text-xs p-1 hover:bg-[#21262d] rounded cursor-pointer"
                  >
                    ✕
                  </button>

                  <div className="mb-4 text-left">
                    <h3 className="text-[15px] font-semibold text-white">
                      {invoiceLabel} — group details
                    </h3>
                    <p className="text-[12px] text-neutral-400 mt-0.5 font-medium">
                      {customerLabel}
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-3 mb-4">
                    <div className="text-[12px] text-neutral-400">
                      Expected MYR{" "}
                      <span className="text-blue-400 font-semibold">
                        {expectedTotal?.toFixed(2) ?? "-"}
                      </span>
                      {" · "}
                      Received MYR{" "}
                      <span className="text-green-400 font-semibold">
                        {receivedTotal?.toFixed(2) ?? "-"}
                      </span>
                      {" · "}
                      Coverage {displayValue(group.coverage_pct?.toFixed(1))}%
                    </div>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[12px] font-bold font-mono border ${confBadge(conf)} shrink-0`}
                    >
                      {Math.round(conf)}% conf
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-[14px]">
                    <div className="p-3.5 rounded-md border border-[#30363d] bg-[#0d1117]">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
                        Invoices
                      </p>
                      {invoices.length === 0 ? (
                        <p className="text-[12px] text-neutral-500">
                          No invoices
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {invoices.map((inv) => (
                            <div
                              key={inv.id ?? inv.invoice_no}
                              className="rounded-md border border-[#21262d]/60 bg-[#0b1118] p-3"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-[12px] text-neutral-200 font-semibold">
                                  {inv.invoice_no ?? "INV-????"}
                                </p>
                                <p className="text-[11px] text-neutral-400 font-mono">
                                  {inv.currency ?? ""}{" "}
                                  {inv.amount?.toFixed(2) ?? "—"}
                                </p>
                              </div>
                              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                                <div className="text-neutral-500">Customer</div>
                                <div className="text-neutral-200 text-right">
                                  {inv.customer ?? "—"}
                                </div>
                                <div className="text-neutral-500">
                                  Expected MYR
                                </div>
                                <div className="text-blue-400 text-right">
                                  {inv.expected_myr?.toFixed(2) ?? "—"}
                                </div>
                                <div className="text-neutral-500">
                                  Invoice date
                                </div>
                                <div className="text-neutral-200 text-right">
                                  {inv.invoice_date ?? "—"}
                                </div>
                                <div className="text-neutral-500">
                                  Reference
                                </div>
                                <div className="text-neutral-200 text-right">
                                  {inv.payment_reference ??
                                    inv.invoice_no ??
                                    "—"}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="p-3.5 rounded-md border border-[#30363d] bg-[#0d1117]">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
                        Bank transactions
                      </p>
                      {transactions.length === 0 ? (
                        <p className="text-[12px] text-neutral-500">
                          No transactions
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {transactions.map((tx) => (
                            <div key={tx.id} className="text-[12px]">
                              <p className="text-neutral-200 font-semibold">
                                MYR {tx.credit_amount?.toFixed(2) ?? "—"}
                              </p>
                              <p className="text-neutral-500">
                                {tx.transaction_date ?? "—"} ·{" "}
                                {maskText(tx.description)}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </React.Fragment>
          );
        })}

        {filtered.map((result, idx) => {
          const isExpanded = expandedId === result.id;
          const isLast = idx === filtered.length - 1;
          const invoice = result.invoice;
          const tx = result.bank_transaction;
          const variance = result.variance ?? 0;
          const conf = result.confidence ?? 0;
          const expectedMyr = invoice?.expected_myr ?? 0;
          const fxMin = expectedMyr * 0.98;
          const fxMax = expectedMyr * 1.02;
          const hasExceptionDetails =
            !!result.exception_type ||
            !!result.severity ||
            !!result.reason ||
            !!result.recommended_action ||
            !!result.suggested_execution_action ||
            (result.requires_human_review !== null &&
              result.requires_human_review !== undefined) ||
            !!result.approval_status ||
            !!result.reviewed_by ||
            !!result.reviewed_at ||
            !!result.execution_action ||
            !!result.execution_status ||
            !!result.execution_result ||
            !!result.follow_up_channel ||
            !!result.follow_up_status ||
            !!result.follow_up_sent_at ||
            !!result.follow_up_message;

          return (
            <React.Fragment key={result.id}>
              <div
                onClick={() => {
                  if (isExpanded) {
                    setExpandedId(null);
                  } else {
                    setExpandedId(result.id);
                    setExpandedView("audit");
                    setExpandedGroupId(null);
                  }
                }}
                className={`flex items-center gap-3 px-4 py-3.5 hover:bg-[#21262d]/50 transition-colors cursor-pointer select-none ${
                  isLast && !isExpanded ? "" : "border-b border-[#21262d]/50"
                }`}
              >
                <div className="w-20 shrink-0 text-[13px] font-semibold text-white truncate text-left">
                  {invoice?.invoice_no ?? "INV-????"}
                </div>
                <div className="flex-1 text-[12px] text-neutral-400 truncate text-left">
                  {invoice?.customer ?? "—"}
                </div>
                <div className="w-[90px] shrink-0 font-mono text-[12px] text-white text-right truncate">
                  {invoice?.currency} {invoice?.amount?.toFixed(0)}
                </div>
                <div className="w-[90px] shrink-0 flex justify-center">
                  <ScenarioBadge
                    scenarioType={result.scenario_type}
                    size="xs"
                  />
                </div>
                <div
                  className={`w-20 shrink-0 font-mono text-[12px] text-right font-bold ${variance >= 0 ? "text-green-500" : "text-red-500"}`}
                >
                  {variance >= 0 ? "+" : ""}MYR {variance.toFixed(2)}
                </div>
                <div className="w-[80px] shrink-0 flex justify-center">
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold border inline-block ${
                      result.human_decision === "approved"
                        ? "text-green-500 bg-green-950/40 border-green-800/40"
                        : result.human_decision === "partial"
                          ? "text-amber-500 bg-amber-950/40 border-amber-800/40"
                          : "text-red-500 bg-red-950/40 border-red-800/40"
                    }`}
                  >
                    {result.human_decision === "approved"
                      ? "✓ Approved"
                      : result.human_decision === "partial"
                        ? "◑ Partial"
                        : "✕ Rejected"}
                  </span>
                </div>
                <div className="w-20 shrink-0 text-right text-[11px] text-neutral-500 font-medium">
                  {timeAgo(result.human_decision_at || result.created_at)}
                </div>
              </div>

              {isExpanded && (
                <div
                  className={`bg-[#0d1117]/80 p-5 px-6 border-b border-[#21262d] relative ${
                    isLast ? "rounded-b-lg border-b-0" : ""
                  }`}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedId(null);
                    }}
                    className="absolute top-4 right-4 text-neutral-500 hover:text-white transition-colors text-xs p-1 hover:bg-[#21262d] rounded cursor-pointer"
                  >
                    ✕
                  </button>

                  <div className="mb-4 text-left">
                    <h3 className="text-[15px] font-semibold text-white">
                      {invoice?.invoice_no} — audit trail
                    </h3>
                    <p className="text-[12px] text-neutral-400 mt-0.5 font-medium">
                      {invoice?.customer} · {invoice?.currency}{" "}
                      {invoice?.amount?.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                      })}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 mb-4">
                    <button
                      onClick={() => setExpandedView("audit")}
                      className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                        expandedView === "audit"
                          ? "text-white bg-[#21262d] border-[#30363d]"
                          : "text-neutral-400 border-[#21262d] hover:text-white"
                      }`}
                    >
                      Audit Trail
                    </button>
                    <button
                      onClick={() => setExpandedView("invoice")}
                      className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                        expandedView === "invoice"
                          ? "text-white bg-[#21262d] border-[#30363d]"
                          : "text-neutral-400 border-[#21262d] hover:text-white"
                      }`}
                    >
                      Invoice Details
                    </button>
                  </div>

                  {expandedView === "audit" ? (
                    <div className="max-w-xl">
                      <HistoryAuditLogs
                        matchResultId={result.id}
                        humanDecision={result.human_decision}
                        variance={result.variance}
                        decidedAt={
                          result.human_decision_at || result.created_at
                        }
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-[14px] font-semibold text-white">
                              {invoice?.invoice_no ?? "INV-????"}
                            </h3>
                            {result.scenario_type && (
                              <ScenarioBadge
                                scenarioType={result.scenario_type}
                                size="sm"
                              />
                            )}
                          </div>
                          <p className="text-[12px] text-neutral-400 mt-0.5">
                            {invoice?.customer ?? "Unknown"} ·{" "}
                            {invoice?.invoice_date ?? "-"}
                          </p>
                        </div>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[12px] font-bold font-mono border ${confBadge(conf)} shrink-0`}
                        >
                          {Math.round(conf)}% conf
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-[14px]">
                        <div className="p-3.5 rounded-md border border-[#30363d] bg-[#0d1117]">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
                            Invoice
                          </p>
                          <div className="flex justify-between items-baseline py-2 text-[12px] border-b border-[#21262d]/50 last:border-b-0">
                            <span className="text-neutral-500">Customer</span>
                            <span className="text-neutral-200 font-semibold text-right max-w-[62%] break-words">
                              {invoice?.customer ?? "-"}
                            </span>
                          </div>
                          <div className="flex justify-between items-baseline py-2 text-[12px] border-b border-[#21262d]/50 last:border-b-0">
                            <span className="text-neutral-500">Amount</span>
                            <span className="text-neutral-200 font-semibold text-right max-w-[62%]">
                              {invoice?.currency}{" "}
                              {invoice?.amount?.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                              }) ?? "-"}
                            </span>
                          </div>
                          <div className="flex justify-between items-baseline py-2 text-[12px] border-b border-[#21262d]/50 last:border-b-0">
                            <span className="text-neutral-500">
                              Expected MYR
                            </span>
                            <span className="text-blue-500 font-bold">
                              MYR{" "}
                              {invoice?.expected_myr?.toLocaleString(
                                undefined,
                                { minimumFractionDigits: 2 },
                              ) ?? "-"}
                            </span>
                          </div>
                          <div className="flex justify-between items-baseline py-2 text-[12px] border-b border-[#21262d]/50 last:border-b-0">
                            <span className="text-neutral-500">
                              Invoice date
                            </span>
                            <span className="text-neutral-200 font-semibold">
                              {invoice?.invoice_date ?? "-"}
                            </span>
                          </div>
                          <div className="flex justify-between items-baseline py-2 text-[12px]">
                            <span className="text-neutral-500">Reference</span>
                            <span className="text-neutral-200 font-semibold">
                              {invoice?.payment_reference ??
                                invoice?.invoice_no ??
                                "-"}
                            </span>
                          </div>
                        </div>

                        <div className="p-3.5 rounded-md border border-[#30363d] bg-[#0d1117]">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
                            Bank Transaction
                          </p>
                          <div className="flex justify-between items-baseline py-2 text-[12px] border-b border-[#21262d]/50 last:border-b-0">
                            <span className="text-neutral-500">
                              Description
                            </span>
                            <span className="text-[11px] leading-tight break-all font-mono text-neutral-200 text-right max-w-[62%]">
                              {maskText(tx?.description)}
                            </span>
                          </div>
                          <div className="flex justify-between items-baseline py-2 text-[12px] border-b border-[#21262d]/50 last:border-b-0">
                            <span className="text-neutral-500">
                              Parsed customer
                            </span>
                            <span className="text-neutral-200 font-semibold">
                              {tx?.parsed_customer ?? "-"}
                            </span>
                          </div>
                          <div className="flex justify-between items-baseline py-2 text-[12px] border-b border-[#21262d]/50 last:border-b-0">
                            <span className="text-neutral-500">
                              Received MYR
                            </span>
                            <span className="text-green-500 font-bold">
                              MYR{" "}
                              {tx?.credit_amount?.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                              }) ?? "-"}
                            </span>
                          </div>
                          <div className="flex justify-between items-baseline py-2 text-[12px] border-b border-[#21262d]/50 last:border-b-0">
                            <span className="text-neutral-500">
                              Transaction date
                            </span>
                            <span className="text-neutral-200 font-semibold">
                              {tx?.transaction_date ?? "-"}
                            </span>
                          </div>
                          <div className="flex justify-between items-baseline py-2 text-[12px]">
                            <span className="text-neutral-500">Variance</span>
                            <span
                              className={`font-bold ${variance >= 0 ? "text-green-500" : "text-red-500"}`}
                            >
                              {variance >= 0 ? "+" : ""}MYR{" "}
                              {variance.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                              })}
                            </span>
                          </div>
                        </div>
                      </div>

                      {invoice?.fx_rate && (
                        <div className="rounded-md p-3.5 bg-blue-950/20 border border-blue-900/50">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-blue-400 mb-2">
                            FX calculation
                          </p>
                          <div className="flex flex-wrap items-center gap-2 font-mono text-[12px] text-neutral-200">
                            <span>
                              {invoice.currency} {invoice.amount?.toFixed(0)}
                            </span>
                            <span>x</span>
                            <span>{invoice.fx_rate.toFixed(4)}</span>
                            <span>=</span>
                            <span>MYR {invoice.expected_myr?.toFixed(2)}</span>
                            <span>+/-2%</span>
                            <span>
                              {fxMin.toFixed(2)} - {fxMax.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      )}

                      {result.score_breakdown && (
                        <div className="border-t border-[#21262d]/50 pt-3">
                          <ConfidenceBreakdown
                            breakdown={result.score_breakdown}
                          />
                        </div>
                      )}

                      {hasExceptionDetails && (
                        <div className="rounded-md p-3.5 border border-[#30363d] bg-[#0d1117]">
                          <div className="grid grid-cols-2 gap-x-10 gap-y-4 text-[12px]">
                            <div className="flex flex-col gap-3">
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                                  Exception type
                                </p>
                                <p className="text-neutral-200 font-semibold">
                                  {displayValue(result.exception_type)}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                                  Reason
                                </p>
                                <p className="text-neutral-200 font-semibold">
                                  {exceptionReason(result)}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                                  Recommended action
                                </p>
                                <p className="text-neutral-200 font-semibold">
                                  {displayValue(result.recommended_action)}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                                  Suggested execution
                                </p>
                                <p className="text-neutral-200 font-semibold">
                                  {displayValue(
                                    result.suggested_execution_action,
                                  )}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                                  Approval status
                                </p>
                                <p className="text-neutral-200 font-semibold">
                                  {displayValue(result.approval_status)}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                                  Reviewed at
                                </p>
                                <p className="text-neutral-200 font-semibold">
                                  {displayValue(result.reviewed_at)}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                                  Execution status
                                </p>
                                <p className="text-neutral-200 font-semibold">
                                  {displayValue(result.execution_status)}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                                  Execution result
                                </p>
                                <p className="text-neutral-200 font-semibold">
                                  {displayValue(result.execution_result)}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                                  Follow-up channel
                                </p>
                                <p className="text-neutral-200 font-semibold">
                                  {displayValue(result.follow_up_channel)}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                                  Follow-up sent at
                                </p>
                                <p className="text-neutral-200 font-semibold">
                                  {displayValue(result.follow_up_sent_at)}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                                  Follow-up message
                                </p>
                                <p className="text-neutral-200 font-semibold break-words">
                                  {displayValue(result.follow_up_message)}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-col gap-3">
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                                  Severity
                                </p>
                                <p className="text-neutral-200 font-semibold">
                                  {displayValue(result.severity)}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                                  Human review
                                </p>
                                <p className="text-neutral-200 font-semibold">
                                  {result.requires_human_review === true
                                    ? "Required"
                                    : result.requires_human_review === false
                                      ? "Not required"
                                      : "-"}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                                  Reviewed by
                                </p>
                                <p className="text-neutral-200 font-semibold">
                                  {displayValue(result.reviewed_by)}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                                  Execution action
                                </p>
                                <p className="text-neutral-200 font-semibold">
                                  {displayValue(result.execution_action)}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                                  Follow-up status
                                </p>
                                <p className="text-neutral-200 font-semibold">
                                  {displayValue(result.follow_up_status)}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
