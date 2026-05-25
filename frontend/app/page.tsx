"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Toast, { showToast } from "@/components/Toast";
import { setUploadProgress } from "@/lib/uploadStore";
import type { ScenarioType } from "@/lib/types";

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

    let scenarioType: ScenarioType | undefined;
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
      scenarioType = data.scenario_type;
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
      scenarioType = data.scenario_type;
    }

    setUploadProgress({
      phase: "done",
      invoiceNames,
      invoiceCount: invoices.length,
      invoicesExtracted: invoices.length,
      matchResultId,
      groupId,
      scenarioType,
    });

    const scenarioLabels: Record<string, string> = {
      s1_one_to_one: "Standard match",
      s2_split: "Split payment detected",
      s3_consolidated: "Consolidated payment detected",
      s4_complex: "Complex batch detected",
      s5_partial: "Partial payment detected",
      s6_duplicate: "Duplicate payment flagged",
      s8_bank_fee: "Bank fee deduction detected",
    };
    const label = scenarioType ? (scenarioLabels[scenarioType] ?? "Reconciliation complete") : "Reconciliation complete";
    showToast({ type: "success", message: `✓ ${label}` });
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
      if (dropped.length > 0) onFiles(dropped);
    },
    [accept, onFiles],
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
                Supports multiple files for split / consolidated scenarios
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
            onFiles(Array.from(e.target.files));
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

// ─── Scenario hint helper ─────────────────────────────────────────────────────

function ScenarioHint({ invoiceCount }: { invoiceCount: number }) {
  if (invoiceCount === 0) return null;

  const hints: { scenario: string; when: string; color: string }[] = [
    { scenario: "Standard (S1)", when: "1 invoice + matching transactions", color: "text-neutral-400" },
    { scenario: "Split (S2)", when: "1 invoice + multiple partial payments", color: "text-blue-400" },
    { scenario: "Consolidated (S3)", when: "Multiple invoices + 1 combined payment", color: "text-purple-400" },
    { scenario: "Complex (S4)", when: "Multiple invoices + multiple transactions", color: "text-indigo-400" },
  ];

  const hint = invoiceCount === 1 ? hints[0] : hints[2];

  return (
    <div className="rounded-md p-3 bg-[#0d1117] border border-[#21262d] text-[11px]">
      <p className="text-neutral-500 font-medium mb-1">Scenario detection</p>
      <p className="text-neutral-400">
        With <span className="font-bold text-white">{invoiceCount}</span> invoice{invoiceCount !== 1 ? "s" : ""},
        the system will detect:{" "}
        <span className={`font-semibold ${hint.color}`}>{hint.scenario}</span>
        {invoiceCount > 1 && (
          <span className="text-neutral-500"> or complex batch</span>
        )}.
      </p>
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
    <div className="min-h-[calc(100vh-56px)] bg-[#0d1117] flex items-center justify-center p-6 select-none">
      <div className="w-full max-w-[520px] rounded-lg border border-[#30363d] p-6 bg-[#161b22] shadow-sm flex flex-col gap-5 text-left animate-fade-up">
        {/* Title */}
        <div>
          <h2 className="text-[15px] font-semibold text-white">
            Upload Reconciliation Batch
          </h2>
          <p className="text-[12px] text-neutral-400 mt-1">
            Upload one or more invoices and a bank statement CSV.
            The system will automatically detect the matching scenario.
          </p>
        </div>

        {/* Scenario hint */}
        <ScenarioHint invoiceCount={invoices.length} />

        {/* Upload zones */}
        <div className="flex flex-col gap-4">
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

        {/* Scenario badges row */}
        {ready && invoices.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: "Split", color: "text-blue-400 border-blue-800/40 bg-blue-950/20" },
              { label: "Consolidated", color: "text-purple-400 border-purple-800/40 bg-purple-950/20" },
              { label: "Complex", color: "text-indigo-400 border-indigo-800/40 bg-indigo-950/20" },
              { label: "Partial", color: "text-amber-400 border-amber-800/40 bg-amber-950/20" },
              { label: "Duplicate detection", color: "text-red-400 border-red-800/40 bg-red-950/20" },
            ].map((b) => (
              <span
                key={b.label}
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${b.color}`}
              >
                {b.label}
              </span>
            ))}
          </div>
        )}

        {/* Submit button */}
        <button
          disabled={!ready}
          onClick={submit}
          className={`w-full py-2.5 rounded-lg text-[13px] font-semibold transition-colors border border-transparent ${
            ready
              ? "bg-blue-600 hover:bg-blue-500 text-white cursor-pointer"
              : "bg-[#21262d] text-neutral-500 cursor-not-allowed"
          }`}
        >
          {invoices.length > 1
            ? `Start Multi-Invoice Reconciliation (${invoices.length} invoices)`
            : "Start Reconciliation"}
        </button>

        {/* Info note */}
        <p className="text-[11px] text-neutral-600 text-center">
          Reconciliation runs in the background. You will be taken to the review board immediately.
        </p>
      </div>
      <Toast />
    </div>
  );
}
