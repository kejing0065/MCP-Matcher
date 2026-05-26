"use client";

import { useState } from "react";
import type { MatchResult, MatchGroup } from "@/lib/types";
import { SCENARIO_LABELS, SCENARIO_ICONS, SCENARIO_COLORS } from "@/lib/types";

interface PendingQueueProps {
  pending: MatchResult[];
  pendingGroups?: MatchGroup[];
  activeResultId?: string;
  activeGroupId?: string;
  onSelectCase: (result: MatchResult) => void;
  onSelectGroup: (group: MatchGroup) => void;
  allResults?: MatchResult[];
  autoMatched: MatchResult[];
  upload?: { phase: string; invoiceName?: string; invoiceNames?: string[]; invoiceCount?: number } | null;
  // legacy compatibility
  active?: MatchResult | null;
  onSelect?: (result: MatchResult) => void;
}

function confBadge(conf: number) {
  if (conf >= 85) return "bg-green-950/50 text-green-400 border-green-800/40";
  if (conf >= 60) return "bg-amber-950/50 text-amber-400 border-amber-800/40";
  return "bg-red-950/50 text-red-400 border-red-800/40";
}

function statusDot(status: string) {
  if (status === "matched") return "bg-green-500";
  if (status === "review") return "bg-amber-500";
  if (status === "partial") return "bg-amber-400";
  if (status === "exception") return "bg-red-500";
  return "bg-neutral-500";
}

export default function PendingQueue({
  pending,
  pendingGroups = [],
  activeResultId,
  activeGroupId,
  onSelectCase,
  onSelectGroup,
  allResults,
  autoMatched,
  upload,
  // legacy compat
  active,
  onSelect,
}: PendingQueueProps) {
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(new Set());

  const isUploading = upload && upload.phase !== "done" && upload.phase !== "error";

  // Get all invoice IDs that are in groups
  const groupedInvoiceIds = new Set<string>();
  pendingGroups.forEach((group) => {
    group.invoices?.forEach((inv) => {
      if (inv.id) groupedInvoiceIds.add(inv.id);
    });
  });

  // Filter out individual pending cases that are already in groups
  const filteredPending = pending.filter((result) => {
    return !result.invoice?.id || !groupedInvoiceIds.has(result.invoice.id);
  });

  // Create a map of invoice ID to MatchResult for grouped invoices
  const invoiceToResult = new Map<string, MatchResult>();
  const invoiceNoToResult = new Map<string, MatchResult>();
  (allResults ?? pending).forEach((result) => {
    if (result.invoice?.id && groupedInvoiceIds.has(result.invoice.id)) {
      invoiceToResult.set(result.invoice.id, result);
    }
    if (result.invoice?.invoice_no) {
      invoiceNoToResult.set(result.invoice.invoice_no, result);
    }
  });
  pendingGroups.forEach((group) => {
    group.match_results?.forEach((result) => {
      if (result.invoice_id) {
        invoiceToResult.set(result.invoice_id, result as MatchResult);
      }
      const invoiceNo = result.invoice?.invoice_no;
      if (invoiceNo) {
        invoiceNoToResult.set(invoiceNo, result as MatchResult);
      }
    });
  });

  const toggleGroupExpand = (groupId: string) => {
    const newExpanded = new Set(expandedGroupIds);
    if (newExpanded.has(groupId)) {
      newExpanded.delete(groupId);
    } else {
      newExpanded.add(groupId);
    }
    setExpandedGroupIds(newExpanded);
  };

  const totalPending = filteredPending.length + pendingGroups.length;

  return (
    <div className="flex flex-col gap-5 w-[280px] shrink-0">
      {/* ─── PENDING QUEUE ─── */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold mb-2">
          Pending Review — {totalPending} item{totalPending !== 1 ? "s" : ""}
        </div>

        <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden divide-y divide-[#30363d] shadow-sm">
          {/* Background upload indicator */}
          {isUploading && (
            <div className="w-full text-left p-3.5 flex items-center gap-3 border-l-2 bg-blue-950/20 border-l-blue-500">
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-semibold text-white flex items-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-neutral-700 border-t-blue-500 rounded-full animate-spin shrink-0" />
                  <span className="truncate">
                    {upload.phase === "extracting" && (upload.invoiceCount && upload.invoiceCount > 1
                      ? `Extracting invoices (${upload.invoiceCount})`
                      : `Extracting ${upload.invoiceName ?? "invoice"}`
                    )}
                    {upload.phase === "parsing" && "Parsing bank CSV"}
                    {upload.phase === "reconciling" && "Running reconciliation engine"}
                  </span>
                </div>
                <div className="text-[11px] text-blue-400/80 mt-1">
                  {upload.phase === "extracting" && "Groq vision OCR"}
                  {upload.phase === "parsing" && "Detecting credits…"}
                  {upload.phase === "reconciling" && "Detecting scenarios…"}
                </div>
              </div>
            </div>
          )}

          {totalPending === 0 && !isUploading ? (
            <div className="p-6 text-center">
              <div className="text-[12px] text-neutral-400">No pending cases</div>
            </div>
          ) : (
            <>
              {/* ─ Single-result cases ─ */}
              {filteredPending.map((result) => {
                const isActive = (activeResultId ?? active?.id) === result.id;
                const isProcessing = !result.exception_explanation && result.status !== "matched";
                const inv = result.invoice;
                const conf = result.confidence ?? 0;

                return (
                  <button
                    key={result.id}
                    onClick={() => {
                      if (!isProcessing) {
                        onSelectCase(result);
                        onSelect?.(result);
                      }
                    }}
                    disabled={isProcessing}
                    className={`w-full text-left p-3.5 flex items-center gap-3 transition-colors border-l-2 ${
                      isActive && !isUploading
                        ? "bg-[#0d1117] border-l-blue-500"
                        : "border-l-transparent hover:bg-[#21262d]/60"
                    } ${isProcessing ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
                  >
                    {/* Status dot */}
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot(result.status)}`} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[12px] font-semibold text-white truncate">
                          {inv?.invoice_no ?? "INV-????"}
                        </span>
                        {result.scenario_type && result.scenario_type !== "s1_one_to_one" && (
                          <span className={`inline-flex items-center gap-0.5 px-1.5 py-0 rounded-full text-[9px] font-bold border ${SCENARIO_COLORS[result.scenario_type]}`}>
                            <span className="font-mono">{SCENARIO_ICONS[result.scenario_type]}</span>
                            {SCENARIO_LABELS[result.scenario_type]}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-neutral-500 truncate">
                        {inv?.customer ?? "Unknown"}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[11px] text-neutral-400 font-mono">
                        {inv?.currency} {inv?.amount?.toFixed(2) ?? "—"}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold font-mono border ${confBadge(conf)}`}>
                        {Math.round(conf)}%
                      </span>
                    </div>
                  </button>
                );
              })}

              {/* ─ Group cases ─ */}
              {pendingGroups.map((group) => {
                const isActive = activeGroupId === group.id;
                const isExpanded = expandedGroupIds.has(group.id);
                const invNames = group.invoices?.map((i) => i.invoice_no).filter(Boolean).join(", ") ?? "Multiple invoices";
                const conf = group.confidence ?? 0;

                return (
                  <div key={group.id}>
                    <div
                      className={`w-full text-left p-3.5 flex items-center gap-3 transition-colors border-l-2 ${
                        isActive && !isUploading
                          ? "bg-[#0d1117] border-l-purple-500"
                          : "border-l-transparent hover:bg-[#21262d]/60"
                      }`}
                    >
                      {/* Expand/Collapse arrow button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleGroupExpand(group.id);
                        }}
                        className="p-1 hover:bg-[#30363d] rounded transition-colors shrink-0"
                        title="Expand/collapse invoices"
                      >
                        <span className={`text-neutral-400 transition-transform inline-block ${isExpanded ? "rotate-180" : ""}`}>
                          ▼
                        </span>
                      </button>

                      {/* Status dot */}
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot(group.status ?? "review")}`} />

                      {/* Group info - clickable to show detail */}
                      <button
                        onClick={() => onSelectGroup(group)}
                        className="flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
                      >
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[12px] font-semibold text-white truncate">
                            {group.invoices && group.invoices.length > 1
                              ? `Group (${group.invoices.length} invoices)`
                              : invNames}
                          </span>
                          {group.scenario_type && (
                            <span className={`inline-flex items-center gap-0.5 px-1.5 py-0 rounded-full text-[9px] font-bold border ${SCENARIO_COLORS[group.scenario_type]}`}>
                              <span className="font-mono">{SCENARIO_ICONS[group.scenario_type]}</span>
                              {SCENARIO_LABELS[group.scenario_type]}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-neutral-500 truncate">
                          {group.invoices?.map((i) => i.customer).filter(Boolean).join(", ") ?? "—"}
                        </div>
                      </button>

                      {/* Stats - clickable to show detail */}
                      <button
                        onClick={() => onSelectGroup(group)}
                        className="flex flex-col items-end gap-1 shrink-0 hover:opacity-80 transition-opacity"
                      >
                        <span className="text-[11px] text-neutral-400 font-mono">
                          {(group.coverage_pct ?? 0).toFixed(0)}% paid
                        </span>
                        <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold font-mono border ${confBadge(conf)}`}>
                          {Math.round(conf)}%
                        </span>
                      </button>
                    </div>

                    {/* ─ Individual invoices dropdown ─ */}
                    {isExpanded && group.invoices && group.invoices.length > 0 && (
                      <div className="bg-[#0d1117]/60 border-l-2 border-l-purple-500/40 divide-y divide-[#30363d]">
                        {group.invoices.map((inv, idx) => {
                          const matchResult = inv.id
                            ? invoiceToResult.get(inv.id)
                            : inv.invoice_no
                            ? invoiceNoToResult.get(inv.invoice_no)
                            : undefined;
                          
                          return (
                            <button
                              key={inv.id ?? idx}
                              onClick={() => {
                                if (matchResult) {
                                  onSelectCase(matchResult);
                                  onSelect?.(matchResult);
                                }
                              }}
                              disabled={!matchResult}
                              className={`w-full p-3 pl-10 text-left transition-colors hover:bg-[#21262d]/40 disabled:opacity-50 disabled:cursor-not-allowed ${
                                activeResultId === matchResult?.id ? "bg-[#21262d]/60" : ""
                              }`}
                            >
                              <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                <span className="text-[11px] font-medium text-neutral-300 truncate">
                                  {inv.invoice_no ?? "INV-????"}
                                </span>
                              </div>
                              <div className="text-[10px] text-neutral-500 truncate">
                                {inv.customer ?? "Unknown"}
                              </div>
                              <div className="text-[10px] text-neutral-600 mt-1">
                                {inv.currency} {inv.amount?.toFixed(2) ?? "—"}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>

      {/*
      ─── AUTO-MATCHED TODAY ───
      {autoMatched.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-green-500/70 font-bold mb-2 flex items-center gap-2">
            Auto-Matched Today
            <span className="bg-green-950/40 text-green-400 py-0.5 px-1.5 rounded-full text-[9px] border border-green-800/40">
              {autoMatched.length}
            </span>
          </div>

          <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden divide-y divide-[#30363d] shadow-sm opacity-80">
            {autoMatched.map((result) => {
              const isActive = (activeResultId ?? active?.id) === result.id && !isUploading;
              const inv = result.invoice;

              return (
                <button
                  key={result.id}
                  onClick={() => { onSelectCase(result); onSelect?.(result); }}
                  className={`w-full text-left p-3 flex items-center gap-3 transition-colors border-l-2 ${
                    isActive ? "bg-[#0d1117] border-l-blue-500" : "border-l-transparent hover:bg-[#21262d]/60"
                  } cursor-pointer`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium text-white truncate">{inv?.invoice_no ?? "INV-????"}</div>
                    <div className="text-[11px] text-neutral-500 truncate">{inv?.customer ?? "Unknown"}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {result.scenario_type && result.scenario_type !== "s1_one_to_one" && (
                      <span className={`inline-flex items-center gap-0.5 px-1.5 py-0 rounded-full text-[9px] font-bold border ${SCENARIO_COLORS[result.scenario_type]}`}>
                        {SCENARIO_ICONS[result.scenario_type]}
                      </span>
                    )}
                    <span className="text-green-500 text-[11px]">✓</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
      */}
    </div>
  );
}
