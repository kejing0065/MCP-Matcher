"use client";

import { useEffect, useState, useCallback } from "react";
import { getDashboard } from "@/lib/api";
import type { MatchResult, MatchGroup, DashboardResponse } from "@/lib/types";
import Toast from "@/components/Toast";
import HistoryTable from "@/components/HistoryTable";
import { SCENARIO_LABELS } from "@/lib/types";

type Tab = "all" | "approved" | "rejected" | "partial";

export default function HistoryPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const d = await getDashboard();
      setData(d);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(() => load(), 8000);
    return () => clearInterval(iv);
  }, [load]);

  const decided = (data?.results ?? []).filter((r) => r.human_decision != null);
  const approved = decided.filter((r) => r.human_decision === "approved");
  const rejected = decided.filter((r) => r.human_decision === "rejected");
  const partial = decided.filter((r) => r.human_decision === "partial");

  const exportCSV = () => {
    if (!decided.length) return;
    const h = [
      "Invoice",
      "Customer",
      "Amount",
      "Currency",
      "Variance MYR",
      "Scenario",
      "Decision",
      "Date",
    ];
    const body = decided.map((r) => [
      r.invoice?.invoice_no ?? "—",
      r.invoice?.customer ?? "—",
      r.invoice?.amount?.toFixed(2) ?? "—",
      r.invoice?.currency ?? "—",
      r.variance?.toFixed(2) ?? "—",
      SCENARIO_LABELS[r.scenario_type ?? ""] ?? "Standard",
      r.human_decision ?? "—",
      (r.human_decision_at || r.created_at) ?? "—",
    ]);
    const csv = [h, ...body]
      .map((row) =>
        row.map((c) => (String(c).includes(",") ? `"${c}"` : c)).join(",")
      )
      .join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8;" })
    );
    a.download = `reconciliation-history-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-56px)] bg-[#0d1117]">
        <div className="text-center">
          <span className="w-6 h-6 border-2 border-neutral-700 border-t-blue-500 rounded-full animate-spin block mx-auto mb-3" />
          <p className="text-xs text-neutral-500 font-medium font-sans">
            Loading history…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-56px)] bg-[#0d1117] px-6 py-8">
      <div className="max-w-5xl mx-auto flex flex-col">
        {/* Header row */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-[15px] font-semibold text-white tracking-tight">
            Decision history
          </h1>
          <button
            className="px-4 py-2 rounded-xl text-xs font-bold border border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-600 transition-colors cursor-pointer disabled:opacity-40"
            onClick={exportCSV}
            disabled={!decided.length}
          >
            ↓ Export CSV
          </button>
        </div>

        {/* Tab row */}
        <div className="flex items-center gap-2 mb-6 select-none">
          {([
            { id: "all", label: "All", count: decided.length },
            { id: "approved", label: "Approved", count: approved.length },
            { id: "rejected", label: "Rejected", count: rejected.length },
            { id: "partial", label: "Partial", count: partial.length },
          ] as { id: Tab; label: string; count: number }[]).map((t) => (
            <button
              key={t.id}
              className={`px-4 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                tab === t.id
                  ? "border-neutral-200 text-white bg-neutral-800/40"
                  : "border-neutral-800 text-neutral-500 hover:border-neutral-700 hover:text-neutral-300"
              }`}
              onClick={() => setTab(t.id)}
            >
              {t.label} ({t.count})
            </button>
          ))}
        </div>

        {/* History table component */}
        <div className="w-full">
          <HistoryTable results={decided} activeTab={tab} />
        </div>
      </div>
      <Toast />
    </div>
  );
}
