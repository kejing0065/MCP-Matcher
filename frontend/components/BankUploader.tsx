"use client";

import { useRef, useState } from "react";
import type { BankTransaction } from "@/lib/types";

interface Props {
  onParsed: (transactionIds: string[], transactions: BankTransaction[]) => void;
}

export default function BankUploader({ onParsed }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle",
  );
  const [count, setCount] = useState(0);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [errorMsg, setErrorMsg] = useState("");

  const handleFile = async (file: File) => {
    if (!file.name.endsWith(".csv")) {
      setStatus("error");
      setErrorMsg("Only CSV files are supported for bank statements.");
      return;
    }

    setStatus("loading");
    setErrorMsg("");

    const form = new FormData();
    form.append("file", file);

    try {
      const API_BASE =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${API_BASE}/tools/parse-bank-csv`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "CSV parse failed");
      }
      const data = await res.json();
      setCount(data.count);
      setTransactions(data.transactions);
      setStatus("done");
      onParsed(
        data.transactions.map((t: BankTransaction) => t.id),
        data.transactions,
      );
    } catch (e: unknown) {
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : "Upload failed");
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  // Mask potential account numbers (10-16 digit sequences)
  const maskDesc = (desc: string) =>
    desc.replace(/\b\d{10,16}\b/g, "••••••••••");

  return (
    <div>
      <div
        className={`upload-zone ${dragging ? "dragging" : ""} ${status === "done" ? "upload-success" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          style={{ display: "none" }}
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />

        {status === "loading" ? (
          <div className="loading-row" style={{ justifyContent: "center" }}>
            <div className="spinner" />
            <span>Parsing bank statement…</span>
          </div>
        ) : status === "done" ? (
          <>
            <div className="upload-icon">🏦</div>
            <div className="upload-label">
              {count} credit transactions found
            </div>
            <div className="upload-hint">
              Bank statement parsed successfully
            </div>
          </>
        ) : (
          <>
            <div className="upload-icon">📊</div>
            <div className="upload-label">Upload Bank Statement</div>
            <div className="upload-hint">CSV format · Drag & drop or click</div>
          </>
        )}
      </div>

      {status === "error" && (
        <div className="alert alert-error" style={{ marginTop: "0.75rem" }}>
          ⚠ {errorMsg}
        </div>
      )}

      {transactions.length > 0 && (
        <div className="card fade-up" style={{ marginTop: "1rem" }}>
          <div className="card-title">Parsed Transactions ({count})</div>
          <div
            style={{
              marginTop: "0.75rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.4rem",
              maxHeight: "220px",
              overflowY: "auto",
            }}
          >
            {transactions.map((tx) => (
              <div
                key={tx.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0.5rem 0.75rem",
                  background: "var(--bg-secondary)",
                  borderRadius: "6px",
                  gap: "1rem",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "0.78rem",
                      color: "var(--text-muted)",
                      marginBottom: "0.1rem",
                    }}
                  >
                    {tx.transaction_date}
                  </div>
                  <div
                    style={{
                      fontSize: "0.82rem",
                      color: "var(--text-secondary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {maskDesc(tx.description)}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: "0.9rem",
                    fontWeight: 700,
                    color: "var(--green)",
                    flexShrink: 0,
                  }}
                >
                  +{tx.credit_amount.toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
