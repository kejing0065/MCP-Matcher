"use client";

import { useState } from "react";
import type { MatchResult } from "@/lib/types";
import { updateDecision } from "@/lib/api";
import { showToast } from "./Toast";
import ConfidenceBreakdown from "./ConfidenceBreakdown";
import ScenarioBadge from "./ScenarioBadge";
import type { UploadProgress } from "@/lib/uploadStore";

interface CaseDetailProps {
  result: MatchResult;
  onDecision: () => void;
  upload?: UploadProgress | null;
}

function getConfColors(score: number) {
  if (score >= 85) return "text-green-500 bg-green-950/40 border-green-800/40";
  if (score >= 60) return "text-amber-500 bg-amber-950/40 border-amber-800/40";
  return "text-red-500 bg-red-950/40 border-red-800/40";
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-baseline py-2.5 text-[12px] border-b border-[#21262d]/50 last:border-b-0">
      <span className="text-neutral-500 shrink-0">{label}</span>
      <span className="text-neutral-200 font-semibold text-right max-w-[62%] break-words">
        {value ?? "-"}
      </span>
    </div>
  );
}

function formatAmount(value?: number | null) {
  if (value == null || Number.isNaN(value)) return "-";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function breakdownSummary(breakdown?: MatchResult["score_breakdown"]) {
  if (!breakdown) return null;
  const scores = [
    { label: "amount", value: breakdown.amount_score },
    { label: "date", value: breakdown.date_score },
    { label: "reference", value: breakdown.reference_score },
  ];
  const sorted = [...scores].sort((a, b) => b.value - a.value);
  const strongest = sorted[0];
  const weakest = sorted[sorted.length - 1];
  return `Confidence is ${breakdown.confidence.toFixed(2)}% (amount ${breakdown.amount_score.toFixed(2)}%, date ${breakdown.date_score.toFixed(2)}%, reference ${breakdown.reference_score.toFixed(2)}%), strongest on ${strongest.label} and weakest on ${weakest.label}.`;
}

function buildSuggestion(result: MatchResult, tolerance: number) {
  const inv = result.invoice;
  const tx = result.bank_transaction;
  const confidence = result.confidence ?? 0;
  const variance = result.variance ?? 0;
  const expected = inv?.expected_myr ?? 0;
  const absVariance = Math.abs(variance);
  const withinTolerance = expected > 0 && absVariance <= tolerance;
  const amountScore = result.score_breakdown?.amount_score;
  const dateScore = result.score_breakdown?.date_score;
  const refScore = result.score_breakdown?.reference_score;

  const amountNote = withinTolerance
    ? "Amount variance is within the FX tolerance band."
    : "Amount variance exceeds the FX tolerance band; verify the FX date or partial payment.";

  const refNote =
    refScore != null && refScore < 60
      ? "Reference match is weak; confirm invoice reference or payer name."
      : "Reference match looks consistent with the invoice.";

  const dateNote =
    dateScore != null && dateScore < 60
      ? "Transaction date is far from the invoice date; confirm payment timing."
      : "Transaction date aligns with the invoice window.";

  const decisionNote =
    confidence >= 85
      ? "Recommendation: approve if no external issues are flagged."
      : confidence >= 60
        ? "Recommendation: verify reference and amount before approving."
        : "Recommendation: hold for manual review and request supporting evidence.";

  const contextNote =
    inv && tx
      ? `Expected MYR ${formatAmount(inv.expected_myr)} vs received MYR ${formatAmount(tx.credit_amount)}.`
      : "";

  return `Suggestion: ${contextNote} ${amountNote} ${refNote} ${dateNote} ${decisionNote}`.trim();
}

function InfoGrid({ result }: { result: MatchResult }) {
  const items: [string, React.ReactNode, boolean?][] = [
    ["Exception type", result.exception_type],
    ["Severity", result.severity],
    ["Reason", result.reason, true],
    ["Recommended action", result.recommended_action, true],
    ["Suggested execution", result.suggested_execution_action],
    [
      "Human review",
      result.requires_human_review ? "Required" : "Not required",
    ],
  ];

  return (
    <div className="rounded-md p-3.5 bg-[#0d1117] border border-[#30363d] grid grid-cols-2 gap-x-5 gap-y-3">
      {items.map(([label, value, wide]) => (
        <div key={label} className={wide ? "col-span-2" : ""}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
            {label}
          </p>
          <p className="text-[12px] text-neutral-200 mt-1 leading-relaxed">
            {value ?? "-"}
          </p>
        </div>
      ))}
    </div>
  );
}

export default function CaseDetail({
  result,
  onDecision,
  upload,
}: CaseDetailProps) {
  const [busy, setBusy] = useState(false);
  const [btnLoading, setBtnLoading] = useState<"approved" | "rejected" | null>(
    null,
  );
  const [reviewedBy, setReviewedBy] = useState(result.reviewed_by ?? "");
  const [reviewReason, setReviewReason] = useState(result.review_reason ?? "");

  const isUploading =
    upload && upload.phase !== "done" && upload.phase !== "error";

  // Show loading state during analysis
  if (isUploading) {
    return (
      <div className="flex flex-col gap-4 p-5 rounded-lg border border-[#30363d] bg-[#161b22] text-left text-[13px] animate-fade-up">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-[15px] font-semibold text-white tracking-tight">
                Analyzing...
              </h2>
              <span className="w-3.5 h-3.5 border-2 border-neutral-700 border-t-blue-500 rounded-full animate-spin" />
            </div>
            <p className="text-[12px] text-neutral-400 mt-0.5">
              AI is processing your files
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {upload.invoiceName && (
            <div className="text-[12px] text-neutral-300">
              <p className="text-neutral-500 mb-1">
                File: {upload.invoiceName}
              </p>
            </div>
          )}
          {upload.phase && (
            <div className="text-[12px] text-neutral-300">
              <p className="text-neutral-500 mb-1">Phase:</p>
              <p>
                {upload.phase === "extracting" &&
                  "🔍 Extracting data from documents..."}
                {upload.phase === "parsing" && "📄 Parsing bank statement..."}
                {upload.phase === "reconciling" &&
                  "⚙️ Matching invoices with transactions..."}
              </p>
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-[#21262d] text-center">
          <p className="text-[11px] text-neutral-500">
            Please wait while AI analyzes your submission
          </p>
        </div>
      </div>
    );
  }

  const inv = result.invoice;
  const tx = result.bank_transaction;
  const confidence = result.confidence ?? 0;
  const variance = result.variance ?? 0;
  const tolerance = (inv?.expected_myr ?? 0) * 0.02;
  const rangeMin = (inv?.expected_myr ?? 0) - tolerance;
  const rangeMax = (inv?.expected_myr ?? 0) + tolerance;
  const scoreSummary = breakdownSummary(result.score_breakdown);
  const agentExplanation = result.exception_explanation;
  const suggestion = buildSuggestion(result, tolerance);

  const decide = async (decision: "approved" | "rejected") => {
    setBusy(true);
    setBtnLoading(decision);
    try {
      await updateDecision(
        result.id,
        decision,
        reviewedBy || "Reviewer",
        reviewReason,
      );
      showToast({
        type: decision === "approved" ? "success" : "error",
        message:
          decision === "approved"
            ? "Case approved and execution updated"
            : "Case rejected and execution skipped",
      });
      onDecision();
    } catch {
      showToast({ type: "error", message: "Error saving decision" });
    } finally {
      setBusy(false);
      setBtnLoading(null);
    }
  };

  const maskText = (s?: string) =>
    s ? s.replace(/\b\d{10,16}\b/g, "**********") : "-";
  const isPartial = result.status === "partial" || result.is_partial;
  const isDuplicate = result.scenario_type === "s6_duplicate";

  return (
    <div className="flex flex-col gap-4 p-5 rounded-lg border border-[#30363d] bg-[#161b22] text-left animate-fade-up text-[13px]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-[15px] font-semibold text-white tracking-tight">
              {inv?.invoice_no ?? "INV-????"}
            </h2>
            {result.scenario_type && (
              <ScenarioBadge scenarioType={result.scenario_type} />
            )}
          </div>
          <p className="text-[12px] text-neutral-400 mt-0.5">
            {inv?.customer ?? "Unknown"} / {inv?.invoice_date ?? "-"}
          </p>
        </div>
        <span
          className={`px-2.5 py-0.5 rounded-full text-[13px] font-bold font-mono border ${getConfColors(confidence)} shrink-0`}
        >
          {Math.round(confidence)}% conf
        </span>
      </div>

      {isDuplicate && (
        <div className="rounded-md p-2.5 bg-red-950/30 border border-red-800/50 text-[11px] text-red-300 font-medium">
          <span className="font-bold text-red-400">Possible Duplicate: </span>
          This transaction may already be claimed by another invoice. Verify
          before approving.
        </div>
      )}

      {isPartial && (
        <div className="rounded-md p-2.5 bg-amber-950/30 border border-amber-800/50 text-[11px] text-amber-300">
          <span className="font-bold text-amber-400">Partial Payment: </span>
          Outstanding MYR {(result.remaining_amount_myr ?? 0).toFixed(2)}
        </div>
      )}

      <div className="grid grid-cols-2 gap-[14px]">
        <div className="p-3.5 rounded-md border border-[#30363d] bg-[#0d1117]">
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
            Invoice
          </p>
          <Field label="Customer" value={inv?.customer} />
          <Field
            label="Amount"
            value={
              inv?.amount != null
                ? `${inv.currency} ${formatAmount(inv.amount)}`
                : "-"
            }
          />
          <Field
            label="Expected MYR"
            value={
              <span className="text-blue-500 font-bold">
                MYR {formatAmount(inv?.expected_myr)}
              </span>
            }
          />
          <Field label="Invoice date" value={inv?.invoice_date} />
          <Field
            label="Reference"
            value={inv?.payment_reference ?? inv?.invoice_no}
          />
        </div>

        <div className="p-3.5 rounded-md border border-[#30363d] bg-[#0d1117]">
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
            Bank Transaction
          </p>
          <Field
            label="Description"
            value={
              <span className="text-[11px] leading-tight break-all font-mono">
                {maskText(tx?.description)}
              </span>
            }
          />
          <Field label="Parsed customer" value={tx?.parsed_customer || "-"} />
          <Field
            label="Received MYR"
            value={
              <span className="text-green-500 font-bold">
                MYR {formatAmount(tx?.credit_amount)}
              </span>
            }
          />
          <Field label="Transaction date" value={tx?.transaction_date} />
          <Field
            label="Variance"
            value={
              <span
                className={`font-bold ${variance >= 0 ? "text-green-500" : "text-red-500"}`}
              >
                {variance >= 0 ? "+" : ""}MYR {formatAmount(variance)}
              </span>
            }
          />
        </div>
      </div>

      {inv?.fx_rate && (
        <div className="rounded-md p-3.5 bg-blue-950/20 border border-blue-900/50">
          <p className="text-[10px] font-bold uppercase tracking-wider text-blue-400 mb-2">
            FX calculation
          </p>
          <div className="flex flex-wrap items-center gap-2 font-mono text-[12px] text-neutral-200">
            <span>
              {inv.currency} {formatAmount(inv.amount)}
            </span>
            <span>x</span>
            <span>{inv.fx_rate.toFixed(4)}</span>
            <span>=</span>
            <span>MYR {formatAmount(inv.expected_myr)}</span>
            <span>+/-2%</span>
            <span>
              {formatAmount(rangeMin)} - {formatAmount(rangeMax)}
            </span>
          </div>
        </div>
      )}

      {result.score_breakdown && (
        <div className="border-t border-[#21262d]/50 pt-3">
          <ConfidenceBreakdown breakdown={result.score_breakdown} />
        </div>
      )}

      {(agentExplanation || suggestion || scoreSummary) && (
        <div className="rounded-md p-3 bg-amber-950/20 border border-amber-900/50">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-1.5">
            <span aria-hidden>🤖</span>
            <span>Agent explanation</span>
          </div>
          <p className="text-[12px] text-neutral-300 leading-relaxed">
            {agentExplanation ?? ""}
          </p>
          {(scoreSummary || suggestion) && (
            <p className="text-[12px] text-neutral-300 leading-relaxed mt-2">
              {scoreSummary ? `${scoreSummary} ` : ""}
              {suggestion}
            </p>
          )}
        </div>
      )}

      <InfoGrid result={result} />

      <div className="border-t border-[#21262d]/50 pt-4">
        {!result.human_decision ? (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5 text-[11px] font-semibold text-neutral-400">
                Reviewer
                <input
                  value={reviewedBy}
                  onChange={(e) => setReviewedBy(e.target.value)}
                  placeholder="Your name"
                  className="rounded-md border border-[#30363d] bg-[#0d1117] px-3 py-2 text-[12px] text-white outline-none focus:border-blue-500"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-[11px] font-semibold text-neutral-400">
                Review reason
                <input
                  value={reviewReason}
                  onChange={(e) => setReviewReason(e.target.value)}
                  placeholder="Why approve or reject?"
                  className="rounded-md border border-[#30363d] bg-[#0d1117] px-3 py-2 text-[12px] text-white outline-none focus:border-blue-500"
                />
              </label>
            </div>
            <div className="flex gap-2">
              <button
                disabled={busy}
                onClick={() => decide("approved")}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-[13px] font-semibold bg-green-600 hover:bg-green-500 text-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {btnLoading === "approved" ? "Approving..." : "Approve"}
              </button>
              <button
                disabled={busy}
                onClick={() => decide("rejected")}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-[13px] font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {btnLoading === "rejected" ? "Rejecting..." : "Reject"}
              </button>
            </div>
          </div>
        ) : (
          <div
            className={`rounded-lg py-2.5 text-center text-[13px] font-bold border ${
              result.human_decision === "approved"
                ? "bg-green-950/20 border-green-800/40 text-green-500"
                : "bg-red-950/20 border-red-800/40 text-red-500"
            }`}
          >
            {result.human_decision === "approved"
              ? "Approved Case"
              : "Rejected / Flagged"}
          </div>
        )}
      </div>
    </div>
  );
}
