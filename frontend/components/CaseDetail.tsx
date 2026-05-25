"use client";

import { useState } from "react";
import type { MatchResult } from "@/lib/types";
import { updateDecision } from "@/lib/api";
import { showToast } from "./Toast";
import ConfidenceBreakdown from "./ConfidenceBreakdown";
import ScenarioBadge from "./ScenarioBadge";

interface CaseDetailProps {
  result: MatchResult;
  onDecision: () => void;
}

function getConfColors(score: number) {
  if (score >= 85) return { text: "text-green-500", bg: "bg-green-950/40 border-green-800/40", border: "border-green-500/20" };
  if (score >= 60) return { text: "text-amber-500", bg: "bg-amber-950/40 border-amber-800/40", border: "border-amber-500/20" };
  return { text: "text-red-500", bg: "bg-red-950/40 border-red-800/40", border: "border-red-500/20" };
}

export default function CaseDetail({ result, onDecision }: CaseDetailProps) {
  const [busy, setBusy] = useState(false);
  const [btnLoading, setBtnLoading] = useState<"approved" | "rejected" | "partial" | null>(null);

  const inv = result.invoice;
  const tx = result.bank_transaction;
  const variance = result.variance ?? 0;
  const confidence = result.confidence ?? 0;

  const tolerance = (inv?.expected_myr ?? 0) * 0.02;
  const rangeMin = (inv?.expected_myr ?? 0) - tolerance;
  const rangeMax = (inv?.expected_myr ?? 0) + tolerance;

  const decide = async (d: "approved" | "rejected" | "partial") => {
    setBusy(true);
    setBtnLoading(d);
    try {
      await updateDecision(result.id, d);
      showToast({
        type: d === "approved" ? "success" : d === "partial" ? "info" : "error",
        message: d === "approved" ? "Case approved" : d === "partial" ? "Marked as partial — awaiting settlement" : "Case rejected",
      });
      onDecision();
    } catch {
      showToast({ type: "error", message: "Error — please try again" });
    } finally {
      setBusy(false);
      setBtnLoading(null);
    }
  };

  const maskText = (s?: string) =>
    s ? s.replace(/\b\d{10,16}\b/g, "••••••••••") : "—";

  const confTheme = getConfColors(confidence);
  const isProcessing = result.status === "review" && !result.exception_explanation;
  const isPartial = result.status === "partial" || result.is_partial;
  const isDuplicate = result.scenario_type === "s6_duplicate";

  return (
    <div className="flex flex-col gap-4 p-5 rounded-lg border border-[#30363d] bg-[#161b22] text-left animate-fade-up text-[13px]">
      {/* ─── HEADER ROW ─── */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-[15px] font-semibold text-white tracking-tight">
              {inv?.invoice_no ?? "INV-????"}
            </h2>
            {result.scenario_type && <ScenarioBadge scenarioType={result.scenario_type} />}
          </div>
          <p className="text-[12px] text-neutral-400 mt-0.5">
            {inv?.customer ?? "Unknown"} · {inv?.invoice_date ?? "—"}
          </p>
        </div>
        <span className={`px-2.5 py-0.5 rounded-full text-[13px] font-bold font-mono border ${confTheme.text} ${confTheme.bg} ${confTheme.border} shrink-0`}>
          {Math.round(confidence)}% conf
        </span>
      </div>

      {/* ─── DUPLICATE WARNING ─── */}
      {isDuplicate && (
        <div className="rounded-md p-2.5 bg-red-950/30 border border-red-800/50 flex items-start gap-2">
          <span className="text-red-500 shrink-0">⊘</span>
          <p className="text-[11px] text-red-300 font-medium">
            <span className="font-bold text-red-400">Possible Duplicate: </span>
            This transaction may already be claimed by another invoice. Verify before approving.
          </p>
        </div>
      )}

      {/* ─── PARTIAL PAYMENT WARNING ─── */}
      {isPartial && (
        <div className="rounded-md p-2.5 bg-amber-950/30 border border-amber-800/50 flex items-start gap-2">
          <span className="text-amber-500 shrink-0">◑</span>
          <div>
            <p className="text-[11px] font-bold text-amber-400">Partial Payment — Awaiting Settlement</p>
            <p className="text-[11px] text-amber-300/80 mt-0.5">
              Outstanding: <span className="font-mono font-bold">MYR {(result.remaining_amount_myr ?? 0).toFixed(2)}</span>
            </p>
          </div>
        </div>
      )}

      {/* ─── SECTION 1: COMPARISON GRID ─── */}
      <div className="grid grid-cols-2 gap-[14px]">
        {/* Invoice Column */}
        <div className="p-3.5 rounded-md border border-[#30363d] bg-[#0d1117] flex flex-col gap-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
            📄 Invoice
          </p>
          <div className="flex flex-col">
            {([
              ["Customer", inv?.customer],
              ["Amount", inv?.amount != null ? `${inv.currency} ${inv.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "—"],
              ["Expected MYR", <span key="expected" className="text-blue-500 font-bold">MYR {inv?.expected_myr?.toLocaleString(undefined, { minimumFractionDigits: 2 }) ?? "—"}</span>],
              ["Invoice date", inv?.invoice_date],
              ["Reference", inv?.payment_reference ?? inv?.invoice_no],
            ] as [string, React.ReactNode][]).map(([k, v], idx, arr) => (
              <div
                key={k}
                className={`flex justify-between items-baseline py-2.5 text-[12px] ${
                  idx === arr.length - 1 ? "" : "border-b border-[#21262d]/50"
                }`}
              >
                <span className="text-neutral-500 shrink-0">{k}</span>
                <span className="text-neutral-200 font-semibold text-right max-w-[62%] truncate">{v ?? "—"}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bank Transaction Column */}
        <div className="p-3.5 rounded-md border border-[#30363d] bg-[#0d1117] flex flex-col gap-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
            🏦 Bank Transaction
          </p>
          <div className="flex flex-col">
            {([
              ["Description", <span key="desc" className="text-[11px] leading-tight break-all font-mono">{maskText(tx?.description)}</span>],
              ["Parsed customer", tx?.parsed_customer || "—"],
              ["Received MYR", <span key="received" className="text-green-500 font-bold">MYR {tx?.credit_amount?.toLocaleString(undefined, { minimumFractionDigits: 2 }) ?? "—"}</span>],
              ["Transaction date", tx?.transaction_date],
              ["Variance", <span key="variance" className={`font-bold ${variance >= 0 ? "text-green-500" : "text-red-500"}`}>{variance >= 0 ? "+" : ""}MYR {variance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>],
            ] as [string, React.ReactNode][]).map(([k, v], idx, arr) => (
              <div
                key={k}
                className={`flex justify-between items-baseline py-2.5 text-[12px] ${
                  idx === arr.length - 1 ? "" : "border-b border-[#21262d]/50"
                }`}
              >
                <span className="text-neutral-500 shrink-0">{k}</span>
                <span className="text-neutral-200 font-semibold text-right max-w-[62%] truncate">{v ?? "—"}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── SECTION 2: FX CALCULATION BOX ─── */}
      {inv?.fx_rate && (
        <div className="rounded-md p-3.5 bg-blue-950/20 border border-blue-900/50 flex flex-col gap-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
            💵 FX calculation — rate from {inv.fx_date ?? inv.invoice_date}
          </p>
          <div className="flex flex-wrap items-center gap-2 font-mono">
            <span className="px-2 py-0.5 rounded-md bg-white border border-neutral-300 text-[12px] font-bold text-neutral-900">
              {inv.currency} {inv.amount?.toFixed(0)}
            </span>
            <span className="text-neutral-500 text-[12px] font-bold">×</span>
            <span className="px-2 py-0.5 rounded-md bg-white border border-neutral-300 text-[12px] font-bold text-neutral-900">
              {inv.fx_rate.toFixed(4)}
            </span>
            <span className="text-neutral-500 text-[12px] font-bold">=</span>
            <span className="px-2 py-0.5 rounded-md bg-white border border-neutral-300 text-[12px] font-bold text-neutral-900">
              MYR {inv.expected_myr?.toFixed(2)}
            </span>
            <span className="text-neutral-500 text-[12px] font-semibold">±2%</span>
            <span className="px-2 py-0.5 rounded-md bg-white border border-neutral-300 text-[12px] font-bold text-neutral-900">
              {rangeMin.toFixed(2)} – {rangeMax.toFixed(2)}
            </span>
          </div>
        </div>
      )}

      {/* ─── SECTION 3: CONFIDENCE BREAKDOWN ─── */}
      {result.score_breakdown && (
        <div className="border-t border-[#21262d]/50 pt-3">
          <ConfidenceBreakdown breakdown={result.score_breakdown} />
        </div>
      )}

      {/* ─── SECTION 4: AGENT EXPLANATION BOX ─── */}
      <div className="rounded-md p-3.5 bg-amber-950/20 border border-amber-900/50 flex flex-col gap-2.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
          🤖 Agent explanation
        </p>

        {isProcessing ? (
          <div className="flex flex-col gap-2 py-1.5 animate-pulse">
            <div className="h-3.5 bg-[#30363d]/50 rounded-md w-[90%]" />
            <div className="h-3.5 bg-[#30363d]/50 rounded-md w-[70%]" />
          </div>
        ) : (
          <p className="text-[12px] leading-relaxed text-neutral-300">
            {result.exception_explanation || result.reason || "Reconciliation matched successfully with high confidence."}
          </p>
        )}
      </div>

      {/* ─── SECTION 5: ACTION BUTTONS ─── */}
      <div className="border-t border-[#21262d]/50 pt-4">
        {!result.human_decision ? (
          <div className="flex gap-2">
            {/* Approve Button */}
            <button
              disabled={busy}
              onClick={() => decide("approved")}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-[13px] font-semibold bg-green-600 hover:bg-green-500 text-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {btnLoading === "approved" ? (
                <><span className="w-3.5 h-3.5 border-2 border-neutral-700 border-t-white rounded-full animate-spin" /> Approving...</>
              ) : (
                <><span>✓</span> Approve</>
              )}
            </button>

            {/* Partial Button (shown for partial or review cases) */}
            {(isPartial || result.status === "review") && (
              <button
                disabled={busy}
                onClick={() => decide("partial")}
                title="Mark as partial payment — awaiting settlement"
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-[13px] font-semibold bg-amber-700 hover:bg-amber-600 text-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {btnLoading === "partial" ? (
                  <span className="w-3.5 h-3.5 border-2 border-neutral-700 border-t-white rounded-full animate-spin" />
                ) : (
                  <><span>◑</span> Partial</>
                )}
              </button>
            )}

            {/* Reject Button */}
            <button
              disabled={busy}
              onClick={() => decide("rejected")}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-[13px] font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {btnLoading === "rejected" ? (
                <><span className="w-3.5 h-3.5 border-2 border-neutral-700 border-t-white rounded-full animate-spin" /> Rejecting...</>
              ) : (
                <><span>✕</span> Reject</>
              )}
            </button>
          </div>
        ) : (
          /* Decided State Banner */
          <div className={`rounded-lg py-2.5 text-center text-[13px] font-bold border ${
            result.human_decision === "approved"
              ? "bg-green-950/20 border-green-800/40 text-green-500"
              : result.human_decision === "partial"
              ? "bg-amber-950/20 border-amber-800/40 text-amber-500"
              : "bg-red-950/20 border-red-800/40 text-red-500"
          }`}>
            {result.human_decision === "approved" ? "✓ Approved Case"
              : result.human_decision === "partial" ? "◑ Partial — Awaiting Settlement"
              : "✕ Rejected / Flagged"}
          </div>
        )}
      </div>
    </div>
  );
}