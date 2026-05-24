"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Toast, { showToast } from "@/components/Toast";
import { setUploadProgress } from "@/lib/uploadStore";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function runUpload(invoice: File, csv: File) {
  setUploadProgress({ phase: "extracting", invoiceName: invoice.name });
  try {
    // Step 1 — extract invoice
    const fd1 = new FormData();
    fd1.append("file", invoice);
    const r1 = await fetch(`${API}/tools/extract-document`, {
      method: "POST",
      body: fd1,
    });
    if (!r1.ok) {
      throw new Error(
        (await r1.json().catch(() => ({ detail: r1.statusText }))).detail
      );
    }
    const inv = await r1.json();

    // Step 2 — parse bank CSV
    setUploadProgress({ phase: "parsing", invoiceName: invoice.name });
    const fd2 = new FormData();
    fd2.append("file", csv);
    const r2 = await fetch(`${API}/tools/parse-bank-csv`, {
      method: "POST",
      body: fd2,
    });
    if (!r2.ok) {
      throw new Error(
        (await r2.json().catch(() => ({ detail: r2.statusText }))).detail
      );
    }
    const bank = await r2.json();

    // Step 3 — reconcile
    setUploadProgress({ phase: "reconciling", invoiceName: invoice.name });
    const invoiceId = inv.id;
    const txIds = (bank.transactions || []).map((t: { id: string }) => t.id);
    if (!invoiceId) {
      throw new Error("Invoice extraction failed — no ID returned.");
    }
    if (txIds.length === 0) {
      throw new Error("No transactions found in the bank CSV statement.");
    }

    const r3 = await fetch(`${API}/reconcile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invoice_id: invoiceId,
        bank_transaction_ids: txIds,
      }),
    });
    if (!r3.ok) {
      throw new Error(
        (await r3.json().catch(() => ({ detail: r3.statusText }))).detail
      );
    }
    const reconcileData = await r3.json();
    const matchResultId = reconcileData.match_result_id;

    setUploadProgress({
      phase: "done",
      invoiceName: invoice.name,
      matchResultId,
    });
    showToast({ type: "success", message: "Reconciliation complete!" });
    setTimeout(() => setUploadProgress(null), 2000);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    setUploadProgress({ phase: "error", error: msg, invoiceName: invoice.name });
    showToast({ type: "error", message: "Error — please try again" });
    setTimeout(() => setUploadProgress(null), 5000);
  }
}

export default function UploadPage() {
  const router = useRouter();
  const [invoice, setInvoice] = useState<File | null>(null);
  const [csv, setCsv] = useState<File | null>(null);
  const invRef = useRef<HTMLInputElement>(null);
  const csvRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    if (!invoice || !csv) return;
    // Launch background upload store pipeline
    runUpload(invoice, csv);
    // Immediately redirect the user to the review dashboard
    router.push("/review");
  };

  return (
    <div className="min-h-[calc(100vh-56px)] bg-[#0d1117] flex items-center justify-center p-6 select-none">
      <div className="w-full max-w-[480px] rounded-lg border border-[#30363d] p-6 bg-[#161b22] shadow-sm flex flex-col gap-5 text-left animate-fade-up">
        {/* Title */}
        <div>
          <h2 className="text-[15px] font-semibold text-white">
            Upload New Reconciliation
          </h2>
          <p className="text-[12px] text-neutral-400 mt-1">
            Reconciliation will run in the background. You will be redirected to the review board automatically.
          </p>
        </div>

        {/* Form elements */}
        <div className="flex flex-col gap-4">
          {/* Invoice File Selector */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-2">
              Invoice — PDF or Image
            </p>
            <button
              onClick={() => invRef.current?.click()}
              className={`w-full rounded-md border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
                invoice
                  ? "border-green-800/80 bg-green-950/10 text-green-500"
                  : "border-[#30363d] bg-[#0d1117]/60 text-neutral-500 hover:border-neutral-500"
              }`}
            >
              {invoice ? (
                <span className="text-[12px] font-semibold truncate block">
                  ✓ {invoice.name}
                </span>
              ) : (
                <>
                  <div className="text-2xl mb-1.5">📄</div>
                  <div className="text-[12px] font-medium text-neutral-400">
                    Click to select invoice file
                  </div>
                </>
              )}
            </button>
            <input
              ref={invRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              className="hidden"
              onChange={(e) =>
                e.target.files?.[0] && setInvoice(e.target.files[0])
              }
            />
          </div>

          {/* Bank Statement Selector */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-2">
              Bank Statement — CSV
            </p>
            <button
              onClick={() => csvRef.current?.click()}
              className={`w-full rounded-md border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
                csv
                  ? "border-green-800/80 bg-green-950/10 text-green-500"
                  : "border-[#30363d] bg-[#0d1117]/60 text-neutral-500 hover:border-neutral-500"
              }`}
            >
              {csv ? (
                <span className="text-[12px] font-semibold truncate block">
                  ✓ {csv.name}
                </span>
              ) : (
                <>
                  <div className="text-2xl mb-1.5">🏦</div>
                  <div className="text-[12px] font-medium text-neutral-400">
                    Click to select bank statement CSV
                  </div>
                </>
              )}
            </button>
            <input
              ref={csvRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && setCsv(e.target.files[0])}
            />
          </div>
        </div>

        {/* Action Button */}
        <button
          disabled={!invoice || !csv}
          onClick={submit}
          className={`w-full py-2.5 rounded-lg text-[13px] font-semibold transition-colors border border-transparent ${
            invoice && csv
              ? "bg-blue-600 hover:bg-blue-500 text-white cursor-pointer"
              : "bg-[#21262d] text-neutral-500 cursor-not-allowed"
          }`}
        >
          Start Reconciliation
        </button>
      </div>
      <Toast />
    </div>
  );
}
