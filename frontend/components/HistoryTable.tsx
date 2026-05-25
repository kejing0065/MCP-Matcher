"use client";

import React, { useState, useEffect } from "react";
import type { MatchResult, AgentLog } from "@/lib/types";
import { getAgentLogs } from "@/lib/api";
import AuditTrail from "./AuditTrail";
import ScenarioBadge from "./ScenarioBadge";

interface HistoryTableProps {
  results: MatchResult[];
  activeTab: "all" | "approved" | "rejected" | "partial";
}

function timeAgo(ds?: string) {
  if (!ds) return "—";
  const diff = Date.now() - new Date(ds).getTime();
  const m = Math.floor(diff / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return "just now";
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
        <span className="text-[12px] text-neutral-500 font-medium">Loading audit logs...</span>
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

export default function HistoryTable({ results, activeTab }: HistoryTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filter based on selected tab
  const filtered = results.filter((r) => {
    if (activeTab === "approved") return r.human_decision === "approved";
    if (activeTab === "rejected") return r.human_decision === "rejected";
    if (activeTab === "partial") return r.human_decision === "partial";
    return r.human_decision != null;
  });

  if (filtered.length === 0) {
    return (
      <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-12 text-center shadow-sm">
        <div className="text-3xl mb-2 text-neutral-500">📋</div>
        <p className="text-[13px] text-neutral-400 font-semibold">No decisions yet</p>
        <p className="text-[11px] text-neutral-500 mt-1">Approved and rejected cases will appear here.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[#30363d] bg-[#161b22] overflow-hidden flex flex-col shadow-sm">
      {/* ─── COLUMN HEADER ROW ─── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#21262d] text-[10px] uppercase tracking-wider text-neutral-500 font-bold bg-[#0d1117]/50 select-none">
        <div className="w-20 shrink-0 text-left">Invoice</div>
        <div className="flex-1 text-left">Customer</div>
        <div className="w-[90px] shrink-0 text-right">Amount</div>
        <div className="w-[90px] shrink-0 text-center">Scenario</div>
        <div className="w-20 shrink-0 text-right">Variance</div>
        <div className="w-[80px] shrink-0 text-center">Decision</div>
        <div className="w-20 shrink-0 text-right">Decided</div>
      </div>

      {/* ─── HISTORY ROWS ─── */}
      <div className="flex flex-col">
        {filtered.map((result, idx) => {
          const isExpanded = expandedId === result.id;
          const isLast = idx === filtered.length - 1;
          const invoice = result.invoice;
          const variance = result.variance ?? 0;
          const ok = result.human_decision === "approved";

          return (
            <React.Fragment key={result.id}>
              {/* Row content */}
              <div
                onClick={() => setExpandedId(isExpanded ? null : result.id)}
                className={`flex items-center gap-3 px-4 py-3.5 hover:bg-[#21262d]/50 transition-colors cursor-pointer select-none ${
                  isLast && !isExpanded ? "" : "border-b border-[#21262d]/50"
                }`}
              >
                {/* Invoice */}
                <div className="w-20 shrink-0 text-[13px] font-semibold text-white truncate text-left">
                  {invoice?.invoice_no ?? "INV-????"}
                </div>

                {/* Customer */}
                <div className="flex-1 text-[12px] text-neutral-400 truncate text-left">
                  {invoice?.customer ?? "—"}
                </div>

                {/* Amount */}
                <div className="w-[90px] shrink-0 font-mono text-[12px] text-white text-right truncate">
                  {invoice?.currency} {invoice?.amount?.toFixed(0)}
                </div>

                {/* Scenario Badge */}
                <div className="w-[90px] shrink-0 flex justify-center">
                  <ScenarioBadge scenarioType={result.scenario_type} size="xs" />
                </div>

                {/* Variance */}
                <div
                  className={`w-20 shrink-0 font-mono text-[12px] text-right font-bold ${
                    variance >= 0 ? "text-green-500" : "text-red-500"
                  }`}
                >
                  {variance >= 0 ? "+" : ""}MYR {variance.toFixed(2)}
                </div>

                {/* Decision Badge */}
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
                    {result.human_decision === "approved" ? "✓ Approved"
                      : result.human_decision === "partial" ? "◑ Partial"
                      : "✕ Rejected"}
                  </span>
                </div>

                {/* Decided Relative Date */}
                <div className="w-20 shrink-0 text-right text-[11px] text-neutral-500 font-medium">
                  {timeAgo(result.human_decision_at || result.created_at)}
                </div>
              </div>

              {/* Inline Audit Trail Row */}
              {isExpanded && (
                <div className={`bg-[#0d1117]/80 p-5 px-6 border-b border-[#21262d] relative ${
                  isLast ? "rounded-b-lg border-b-0" : ""
                }`}>
                  {/* Close button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedId(null);
                    }}
                    className="absolute top-4 right-4 text-neutral-500 hover:text-white transition-colors text-xs p-1 hover:bg-[#21262d] rounded cursor-pointer"
                  >
                    ✕
                  </button>

                  {/* Header metadata */}
                  <div className="mb-4 text-left">
                    <h3 className="text-[15px] font-semibold text-white">
                      {invoice?.invoice_no} — audit trail
                    </h3>
                    <p className="text-[12px] text-neutral-400 mt-0.5 font-medium">
                      {invoice?.customer} · {invoice?.currency} {invoice?.amount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                  </div>

                  {/* Log List timeline */}
                  <div className="max-w-xl">
                    <HistoryAuditLogs
                      matchResultId={result.id}
                      humanDecision={result.human_decision}
                      variance={result.variance}
                      decidedAt={result.human_decision_at || result.created_at}
                    />
                  </div>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
