"use client";

import { useState } from "react";
import type { MatchResult } from "@/lib/types";
import { updateDecision } from "@/lib/api";
import { showToast } from "./Toast";
import ConfidenceBreakdown from "./ConfidenceBreakdown";
import AuditTrail from "./AuditTrail";

interface CaseDetailProps {
  result: MatchResult | null;
  onDecision: () => void;
}

export default function CaseDetail({ result, onDecision }: CaseDetailProps) {
  const [loading, setLoading] = useState(false);
  const [showAuditTrail, setShowAuditTrail] = useState(false);

  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center py-20 rounded-lg border border-[#30363d] bg-[#161b22] text-center shadow-sm">
        <span className="text-4xl mb-4 text-emerald-500">✓</span>
        <h3 className="text-lg font-medium text-white mb-2">All cases reviewed</h3>
        <p className="text-sm text-neutral-400">No pending cases remaining.</p>
      </div>
    );
  }

  const invoice = result.invoice;
  const tx = result.bank_transaction;
  const isProcessing = result.status !== "matched" && !result.exception_explanation;
  const variance = result.variance || 0;
  const tolerance = (invoice?.expected_myr || 0) * 0.02;

  const handleDecision = async (decision: "approved" | "rejected") => {
    setLoading(true);
    try {
      await updateDecision(result.id, decision);
      showToast({ type: "success", message: decision === "approved" ? "Case approved" : "Case rejected" });
      onDecision();
    } catch (error) {
      showToast({ type: "error", message: "Error — please try again" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-6 shadow-xl flex flex-col gap-6 w-full text-white">
      <div className="flex justify-between items-start gap-4 pb-4 border-b border-[#30363d]">
        <div>
          <h2 className="text-xl font-semibold mb-1">{invoice?.invoice_no || "INV-????"}</h2>
          <p className="text-sm text-neutral-400">{invoice?.customer} • {invoice?.invoice_date}</p>
        </div>
        <div className={`px-3 py-1 rounded-full text-sm font-bold font-mono tracking-wider ${
          (result.confidence || 0) >= 85 ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : 
          (result.confidence || 0) >= 60 ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : 
          "bg-red-500/10 text-red-400 border border-red-500/20"
        }`}>
          {Math.round(result.confidence || 0)}%
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-4 flex flex-col gap-3">
          <div className="text-xs uppercase tracking-widest text-neutral-500 font-bold mb-1">📄 Invoice</div>
          <div className="flex justify-between items-center text-sm border-b border-[#21262d] pb-2">
            <span className="text-neutral-400">Customer</span>
            <span className="font-medium">{invoice?.customer || "—"}</span>
          </div>
          <div className="flex justify-between items-center text-sm border-b border-[#21262d] pb-2">
            <span className="text-neutral-400">Amount</span>
            <span className="font-mono text-neutral-300">{invoice?.currency} {invoice?.amount?.toFixed(2) || "—"}</span>
          </div>
          <div className="flex justify-between items-center text-sm border-b border-[#21262d] pb-2">
            <span className="text-neutral-400">Expected MYR</span>
            <span className="font-mono font-bold text-blue-400">{invoice?.expected_myr?.toFixed(2) || "—"}</span>
          </div>
          <div className="flex justify-between items-center text-sm border-b border-[#21262d] pb-2">
            <span className="text-neutral-400">Date</span>
            <span className="font-mono text-neutral-300">{invoice?.invoice_date || "—"}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-neutral-400">Reference</span>
            <span className="text-neutral-300 max-w-[60%] truncate text-right">{invoice?.payment_reference || "—"}</span>
          </div>
        </div>

        <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-4 flex flex-col gap-3">
          <div className="text-xs uppercase tracking-widest text-neutral-500 font-bold mb-1">🏦 Bank Transaction</div>
          <div className="flex justify-between items-center text-sm border-b border-[#21262d] pb-2">
            <span className="text-neutral-400">Description</span>
            <span className="text-neutral-300 max-w-[60%] truncate text-right">{tx?.description || "—"}</span>
          </div>
          <div className="flex justify-between items-center text-sm border-b border-[#21262d] pb-2">
            <span className="text-neutral-400">Parsed Customer</span>
            <span className="font-medium text-neutral-300">{tx?.parsed_customer || "—"}</span>
          </div>
          <div className="flex justify-between items-center text-sm border-b border-[#21262d] pb-2">
            <span className="text-neutral-400">Received MYR</span>
            <span className="font-mono font-bold text-emerald-400">{tx?.credit_amount?.toFixed(2) || "—"}</span>
          </div>
          <div className="flex justify-between items-center text-sm border-b border-[#21262d] pb-2">
            <span className="text-neutral-400">Date</span>
            <span className="font-mono text-neutral-300">{tx?.transaction_date || "—"}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-neutral-400">Variance</span>
            <span className={`font-mono font-bold ${variance >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {variance >= 0 ? "+" : ""}MYR {variance.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4 flex flex-col gap-3">
         <div className="text-xs uppercase tracking-widest text-blue-400 font-bold">
            💵 FX Calculation ({invoice?.fx_date})
         </div>
         <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="bg-[#161b22] px-2 py-1 rounded font-mono border border-blue-500/20 text-neutral-300">{invoice?.currency} {invoice?.amount?.toFixed(2)}</span>
            <span className="text-neutral-500">×</span>
            <span className="bg-[#161b22] px-2 py-1 rounded font-mono border border-blue-500/20 text-neutral-300">{invoice?.fx_rate?.toFixed(4)}</span>
            <span className="text-neutral-500">=</span>
            <span className="bg-[#161b22] px-2 py-1 rounded font-mono border border-blue-500/20 font-bold text-white">MYR {invoice?.expected_myr?.toFixed(2)}</span>
            <span className="text-neutral-500 text-xs ml-2">±2% Tolerance (${((invoice?.expected_myr || 0) - tolerance).toFixed(2)} - ${((invoice?.expected_myr || 0) + tolerance).toFixed(2)})</span>
         </div>
      </div>

      {isProcessing ? (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 animate-pulse">
           <div className="text-xs uppercase tracking-widest text-amber-400 font-bold mb-2">🤖 Agent Analysis</div>
           <div className="h-4 bg-amber-500/20 rounded w-3/4 mb-2"></div>
           <div className="h-4 bg-amber-500/20 rounded w-1/2"></div>
        </div>
      ) : result.exception_explanation ? (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
           <div className="text-xs uppercase tracking-widest text-amber-400 font-bold mb-2">🤖 Agent Analysis</div>
           <p className="text-sm text-amber-100 leading-relaxed">{result.exception_explanation}</p>
        </div>
      ) : result.reason && (
        <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-4">
          <div className="text-xs uppercase tracking-widest text-neutral-400 font-bold mb-2">Match Reason</div>
          <p className="text-sm text-neutral-300 leading-relaxed">{result.reason}</p>
        </div>
      )}

      <ConfidenceBreakdown breakdown={result.score_breakdown} />

      <div className="flex gap-4 pt-4 border-t border-[#30363d]">
        <button
          onClick={() => handleDecision("approved")}
          disabled={loading}
          className="flex-1 py-3 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? <span className="animate-spin text-xl leading-none">↻</span> : <span>✓</span>}
          {loading ? "Approving..." : "Approve Match"}
        </button>
        <button
          onClick={() => handleDecision("rejected")}
          disabled={loading}
          className="flex-1 py-3 px-4 rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? <span className="animate-spin text-xl leading-none">↻</span> : <span>✕</span>}
          {loading ? "Rejecting..." : "Reject / Flag"}
        </button>
      </div>
      
      <button 
        onClick={() => setShowAuditTrail(!showAuditTrail)}
        className="w-full py-2 text-sm text-blue-400 hover:text-blue-300 transition-colors font-medium mt-2"
      >
        {showAuditTrail ? "Hide Audit Trail" : "View Audit Trail"}
      </button>

      {showAuditTrail && (
        <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-4">
          <AuditTrail logs={[]} humanDecision={result.human_decision as any} />
        </div>
      )}
    </div>
  );
}