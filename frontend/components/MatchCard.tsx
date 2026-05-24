"use client";

import { useState } from "react";
import type { MatchResult } from "@/lib/types";
import { updateDecision } from "@/lib/api";

interface Props {
  result: MatchResult;
  onDecision?: (id: string, decision: "approved" | "rejected") => void;
}

function ConfidenceBar({ value }: { value: number }) {
  const color =
    value >= 85 ? "var(--green)" : value >= 60 ? "var(--amber)" : "var(--red)";

  return (
    <div className="confidence-wrap">
      <div className="confidence-bar">
        <div
          className="confidence-fill"
          style={{ width: `${Math.min(value, 100)}%`, background: color }}
        />
      </div>
      <span className="confidence-label" style={{ color }}>
        {value.toFixed(0)}%
      </span>
    </div>
  );
}

function ExceptionBadge({ type }: { type?: string }) {
  if (!type) return null;
  const labels: Record<string, string> = {
    short_payment: "Short Payment",
    overpayment: "Overpayment",
    fx_variance: "FX Variance",
    late_payment: "Late Payment",
    missing_reference: "Missing Ref",
    possible_bank_fee: "Bank Fee?",
    unknown: "Unknown",
  };
  return <span className="badge badge-amber">{labels[type] ?? type}</span>;
}

export default function MatchCard({ result, onDecision }: Props) {
  const [cardState, setCardState] = useState<"review" | "decided" | "loading">(
    result.human_decision ? "decided" : "review",
  );
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(
    (result.human_decision as "approved" | "rejected" | null) ?? null,
  );
  const [error, setError] = useState("");

  const invoice = result.invoice as Record<string, unknown> | undefined;
  const tx = result.bank_transaction as Record<string, unknown> | undefined;

  const handleDecision = async (d: "approved" | "rejected") => {
    setCardState("loading");
    setError("");
    try {
      await updateDecision(result.id, d);
      setDecision(d);
      setCardState("decided");
      onDecision?.(result.id, d);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save decision");
      setCardState("review");
    }
  };

  // Mask account numbers
  const maskText = (s?: string) =>
    s ? s.replace(/\b\d{10,16}\b/g, "••••••••••") : "—";

  return (
    <div className="review-card fade-up">
      {/* Header */}
      <div className="review-card-header">
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>
            {(invoice?.invoice_no as string) ??
              result.invoice_id?.slice(0, 8) ??
              "Invoice"}
          </span>
          <ExceptionBadge type={result.exception_type} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <ConfidenceBar value={result.confidence ?? 0} />
          {cardState === "decided" && (
            <span
              className={`badge ${decision === "approved" ? "badge-green" : "badge-red"}`}
            >
              {decision === "approved" ? "✓ Approved" : "✗ Rejected"}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="review-card-body">
        {/* Side-by-side detail */}
        <div className="review-split">
          {/* Invoice side */}
          <div>
            <div className="review-col-label">📄 Invoice</div>
            <div className="review-detail">
              <div className="review-row">
                <span className="review-key">Customer</span>
                <span className="review-val">
                  {(invoice?.customer as string) ?? "—"}
                </span>
              </div>
              <div className="review-row">
                <span className="review-key">Amount</span>
                <span className="review-val">
                  {(invoice?.currency as string) ?? ""}{" "}
                  {invoice?.amount != null
                    ? Number(invoice.amount).toFixed(2)
                    : "—"}
                </span>
              </div>
              <div className="review-row">
                <span className="review-key">Expected MYR</span>
                <span
                  className="review-val"
                  style={{ color: "var(--accent-blue)" }}
                >
                  {result.invoice && invoice?.expected_myr != null
                    ? `MYR ${Number(invoice.expected_myr).toFixed(2)}`
                    : "—"}
                </span>
              </div>
              <div className="review-row">
                <span className="review-key">FX Rate</span>
                <span className="review-val">
                  {invoice?.fx_rate != null
                    ? Number(invoice.fx_rate).toFixed(4)
                    : "—"}
                </span>
              </div>
              <div className="review-row">
                <span className="review-key">FX Date</span>
                <span className="review-val">
                  {(invoice?.fx_date as string) ?? "—"}
                </span>
              </div>
              <div className="review-row">
                <span className="review-key">FX Source</span>
                <span
                  className="review-val"
                  style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}
                >
                  {(invoice?.fx_source as string) ?? "—"}
                </span>
              </div>
              <div className="review-row">
                <span className="review-key">Invoice Date</span>
                <span className="review-val">
                  {(invoice?.invoice_date as string) ?? "—"}
                </span>
              </div>
            </div>
          </div>

          {/* Bank transaction side */}
          <div>
            <div className="review-col-label">🏦 Bank Transaction</div>
            <div className="review-detail">
              <div className="review-row">
                <span className="review-key">Description</span>
                <span
                  className="review-val"
                  style={{
                    fontSize: "0.78rem",
                    maxWidth: "200px",
                    textAlign: "right",
                  }}
                >
                  {maskText(tx?.description as string)}
                </span>
              </div>
              <div className="review-row">
                <span className="review-key">Parsed Customer</span>
                <span className="review-val">
                  {(tx?.parsed_customer as string) ?? "—"}
                </span>
              </div>
              <div className="review-row">
                <span className="review-key">Parsed Ref</span>
                <span className="review-val">
                  {(tx?.parsed_reference as string) ?? "—"}
                </span>
              </div>
              <div className="review-row">
                <span className="review-key">Received MYR</span>
                <span
                  className="review-val"
                  style={{ color: "var(--green)", fontWeight: 700 }}
                >
                  {tx?.credit_amount != null
                    ? `MYR ${Number(tx.credit_amount).toFixed(2)}`
                    : "—"}
                </span>
              </div>
              <div className="review-row">
                <span className="review-key">Variance</span>
                <span
                  className="review-val"
                  style={{
                    color:
                      (result.variance ?? 0) >= 0
                        ? "var(--green)"
                        : "var(--red)",
                  }}
                >
                  {result.variance != null
                    ? `${result.variance >= 0 ? "+" : ""}MYR ${result.variance.toFixed(2)} (${result.variance_pct?.toFixed(2)}%)`
                    : "—"}
                </span>
              </div>
              <div className="review-row">
                <span className="review-key">Txn Date</span>
                <span className="review-val">
                  {(tx?.transaction_date as string) ?? "—"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Agent explanation */}
        {result.exception_explanation && (
          <div className="explanation-box">
            <div className="explanation-label">🤖 Agent Analysis</div>
            <div className="explanation-text">
              {result.exception_explanation}
            </div>
          </div>
        )}

        {/* Score breakdown */}
        {result.reason && (
          <div style={{ marginBottom: "1rem" }}>
            <div
              style={{
                fontSize: "0.72rem",
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: "0.4rem",
              }}
            >
              Match Reason
            </div>
            <div
              style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}
            >
              {result.reason}
            </div>
          </div>
        )}

        {/* Action buttons */}
        {error && (
          <div
            className="alert alert-error"
            style={{ marginBottom: "0.75rem" }}
          >
            ⚠ {error}
          </div>
        )}

        <div className="action-row">
          {cardState === "loading" && (
            <div className="loading-row">
              <div className="spinner" />
              <span>Saving decision…</span>
            </div>
          )}

          {cardState === "review" && (
            <>
              <button
                id={`approve-${result.id}`}
                className="btn btn-green"
                onClick={() => handleDecision("approved")}
              >
                ✓ Approve Match
              </button>
              <button
                id={`reject-${result.id}`}
                className="btn btn-red"
                onClick={() => handleDecision("rejected")}
              >
                ✗ Reject / Flag
              </button>
            </>
          )}

          {cardState === "decided" && (
            <div style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
              Decision recorded —{" "}
              {decision === "approved"
                ? "✓ Match approved"
                : "✗ Flagged for follow-up"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
