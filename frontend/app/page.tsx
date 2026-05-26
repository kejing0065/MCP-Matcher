"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Toast, { showToast } from "@/components/Toast";
import { setUploadProgress } from "@/lib/uploadStore";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ─── Background upload pipeline (multi-invoice + bank CSV) ───────────────────

async function runMultiUpload(invoices: File[], csv: File) {
  const invoiceNames = invoices.map((f) => f.name);
  setUploadProgress({
    phase: "extracting",
    invoiceName: invoices[0]?.name,
    invoiceNames,
    invoiceCount: invoices.length,
    invoicesExtracted: 0,
  });

  try {
    // Step 1 — Extract each invoice file sequentially
    const invoiceIds: string[] = [];

    for (let i = 0; i < invoices.length; i++) {
      const file = invoices[i];
      setUploadProgress({
        phase: "extracting",
        invoiceName: file.name,
        invoiceNames,
        invoiceCount: invoices.length,
        invoicesExtracted: i,
      });

      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`${API}/tools/extract-document`, {
        method: "POST",
        body: fd,
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ detail: r.statusText }));
        throw new Error(`Invoice "${file.name}": ${err.detail || r.statusText}`);
      }
      const inv = await r.json();
      if (!inv.id) throw new Error(`Invoice "${file.name}": extraction returned no ID`);
      invoiceIds.push(inv.id);
    }

    // Step 2 — Parse bank CSV
    setUploadProgress({
      phase: "parsing",
      invoiceName: csv.name,
      invoiceNames,
      invoiceCount: invoices.length,
      invoicesExtracted: invoices.length,
    });

    const fd2 = new FormData();
    fd2.append("file", csv);
    const r2 = await fetch(`${API}/tools/parse-bank-csv`, {
      method: "POST",
      body: fd2,
    });
    if (!r2.ok) {
      const err = await r2.json().catch(() => ({ detail: r2.statusText }));
      throw new Error(`Bank CSV: ${err.detail || r2.statusText}`);
    }
    const bank = await r2.json();
    const txIds: string[] = (bank.transactions || []).map((t: { id: string }) => t.id);

    if (txIds.length === 0) {
      throw new Error("No credit transactions found in the bank statement CSV.");
    }

    // Step 3 — Reconcile (use multi endpoint if >1 invoice, single if 1)
    setUploadProgress({
      phase: "reconciling",
      invoiceNames,
      invoiceCount: invoices.length,
      invoicesExtracted: invoices.length,
    });

    let matchResultId: string | undefined;
    let groupId: string | undefined;

    if (invoiceIds.length === 1) {
      // Single-invoice path (backward compat)
      const r3 = await fetch(`${API}/reconcile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_id: invoiceIds[0],
          bank_transaction_ids: txIds,
        }),
      });
      if (!r3.ok) {
        const err = await r3.json().catch(() => ({ detail: r3.statusText }));
        throw new Error(err.detail || "Reconciliation failed");
      }
      const data = await r3.json();
      matchResultId = data.match_result_id;
    } else {
      // Multi-invoice path
      const r3 = await fetch(`${API}/reconcile/multi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_ids: invoiceIds,
          bank_transaction_ids: txIds,
        }),
      });
      if (!r3.ok) {
        const err = await r3.json().catch(() => ({ detail: r3.statusText }));
        throw new Error(err.detail || "Multi-entity reconciliation failed");
      }
      const data = await r3.json();
      groupId = data.group_id;
      matchResultId = data.match_result_ids?.[0];
    }

    setUploadProgress({
      phase: "done",
      invoiceNames,
      invoiceCount: invoices.length,
      invoicesExtracted: invoices.length,
      matchResultId,
      groupId,
    });
    showToast({ type: "success", message: "✓ Reconciliation complete" });
    setTimeout(() => setUploadProgress(null), 3000);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    setUploadProgress({ phase: "error", error: msg });
    showToast({ type: "error", message: "Upload failed — see error below" });
    setTimeout(() => setUploadProgress(null), 8000);
  }
}

// ─── Drop zone component ──────────────────────────────────────────────────────

function FileDropZone({
  label,
  icon,
  accept,
  multiple,
  files,
  onFiles,
}: {
  label: string;
  icon: string;
  accept: string;
  multiple: boolean;
  files: File[];
  onFiles: (files: File[]) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const dropped = Array.from(e.dataTransfer.files).filter((f) => {
        const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
        return accept
          .split(",")
          .map((a) => a.replace(".", "").trim())
          .includes(ext);
      });
      if (dropped.length > 0) onFiles([...files, ...dropped]);
    },
    [accept, onFiles, files],
  );

  const removeFile = (idx: number) => {
    const updated = files.filter((_, i) => i !== idx);
    onFiles(updated);
  };

  const filled = files.length > 0;

  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-2">
        {label}
      </p>

      {/* Drop area */}
      <button
        type="button"
        onClick={() => ref.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`w-full rounded-md border-2 border-dashed p-5 text-center cursor-pointer transition-colors select-none ${
          dragging
            ? "border-blue-500 bg-blue-950/20"
            : filled
            ? "border-green-800/80 bg-green-950/10"
            : "border-[#30363d] bg-[#0d1117]/60 hover:border-neutral-500"
        }`}
      >
        {!filled && (
          <>
            <div className="text-2xl mb-1.5">{icon}</div>
            <div className="text-[12px] font-medium text-neutral-400">
              {multiple ? "Click or drag to add invoices" : "Click or drag to select file"}
            </div>
            {multiple && (
              <div className="text-[11px] text-neutral-600 mt-1">
                Supports multiple invoice files
              </div>
            )}
          </>
        )}
        {filled && (
          <div className="text-[12px] font-semibold text-green-500">
            ✓ {files.length} file{files.length !== 1 ? "s" : ""} ready
          </div>
        )}
      </button>

      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            const newFiles = Array.from(e.target.files);
            onFiles(multiple ? [...files, ...newFiles] : newFiles);
          }
        }}
      />

      {/* File chips */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {files.map((file, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-[#21262d] border border-[#30363d] text-neutral-300 max-w-[200px]"
            >
              <span className="truncate">{file.name}</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                className="text-neutral-500 hover:text-white flex-shrink-0 cursor-pointer"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Upload Page ─────────────────────────────────────────────────────────

export default function UploadPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<File[]>([]);
  const [csv, setCsv] = useState<File[]>([]);

  const ready = invoices.length > 0 && csv.length > 0;

  const submit = () => {
    if (!ready) return;
    runMultiUpload(invoices, csv[0]);
    router.push("/review");
  };

  return (
    <div className="min-h-[calc(100vh-56px)] bg-[#0b0f14] relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -right-20 h-80 w-80 rounded-full bg-blue-600/10 blur-[80px]" />
        <div className="absolute top-40 -left-24 h-72 w-72 rounded-full bg-emerald-500/10 blur-[90px]" />
        <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-indigo-500/10 blur-[80px]" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-6 py-10">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] items-start">
          <section className="rounded-2xl border border-[#1f2730] bg-[#0d1117]/80 p-6 lg:p-8 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-blue-300/80">
              Batch Reconciliation
              <span className="h-1 w-1 rounded-full bg-blue-400" />
              AI-Powered
            </div>
            <h2 className="mt-3 text-[26px] leading-tight font-semibold text-white">
              Upload invoices and let the matcher align every transaction.
            </h2>
            <p className="mt-3 text-[13px] text-neutral-400 max-w-[520px]">
              Drop PDF or image invoices plus a bank CSV to start. The engine will reconcile
              and prepare cases for review while you keep working.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {[
                { title: "Smart extraction", desc: "OCR + structured fields" },
                { title: "Matching engine", desc: "Automated reconciliation" },
                { title: "Live progress", desc: "Background processing" },
                { title: "Review-ready", desc: "Decisions stay audit-safe" },
              ].map((item) => (
                <div key={item.title} className="rounded-xl border border-[#1f2730] bg-[#0d1117] p-3">
                  <p className="text-[12px] font-semibold text-white">{item.title}</p>
                  <p className="text-[11px] text-neutral-500 mt-1">{item.desc}</p>
                </div>
              ))}
            </div>

            <div className="mt-6">
              <p className="text-[11px] uppercase tracking-wider text-neutral-500 font-bold mb-2">Upload flow</p>
              <div className="grid gap-2">
                {[
                  "Add one or more invoice files",
                  "Attach the bank statement CSV",
                  "Launch reconciliation and head to review",
                ].map((step, idx) => (
                  <div key={step} className="flex items-center gap-3 rounded-lg border border-[#1f2730] bg-[#0d1117]/70 p-2.5">
                    <div className="h-6 w-6 rounded-full bg-blue-500/15 text-blue-300 text-[11px] font-semibold grid place-items-center">
                      {idx + 1}
                    </div>
                    <span className="text-[12px] text-neutral-300">{step}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-[#2a303a] bg-gradient-to-b from-[#161b22] to-[#11151c] p-6 shadow-[0_18px_40px_-28px_rgba(0,0,0,0.8)]">
            <div>
              <h3 className="text-[15px] font-semibold text-white">Upload Reconciliation Batch</h3>
              <p className="text-[12px] text-neutral-400 mt-1">
                Results will appear in your pending review queue automatically.
              </p>
            </div>

            <div className="mt-4 flex flex-col gap-4">
              <FileDropZone
                label="Invoices — PDF or Image (multiple supported)"
                icon="📄"
                accept=".pdf,.png,.jpg,.jpeg"
                multiple={true}
                files={invoices}
                onFiles={setInvoices}
              />

              <FileDropZone
                label="Bank Statement — CSV"
                icon="🏦"
                accept=".csv"
                multiple={false}
                files={csv}
                onFiles={(files) => setCsv(files.slice(0, 1))}
              />
            </div>


            <button
              disabled={!ready}
              onClick={submit}
              className={`mt-5 w-full py-2.5 rounded-lg text-[13px] font-semibold transition-colors border border-transparent ${
                ready
                  ? "bg-blue-600 hover:bg-blue-500 text-white cursor-pointer"
                  : "bg-[#21262d] text-neutral-500 cursor-not-allowed"
              }`}
            >
              {invoices.length > 1
                ? `Start Multi-Invoice Reconciliation (${invoices.length} invoices)`
                : "Start Reconciliation"}
            </button>

            <p className="mt-3 text-[11px] text-neutral-500 text-center">
              Reconciliation runs in the background. You will be taken to the review board immediately.
            </p>
          </section>
        </div>
      </div>
      <Toast />
    </div>
  );
}
