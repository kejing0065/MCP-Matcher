"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getDashboard } from "@/lib/api";
import type { MatchResult, MatchGroup, DashboardResponse } from "@/lib/types";
import PendingQueue from "@/components/PendingQueue";
import CaseDetail from "@/components/CaseDetail";
import GroupDetail from "@/components/GroupDetail";
import Toast from "@/components/Toast";
import { subscribeUpload, type UploadProgress } from "@/lib/uploadStore";

// ─── Selector type: either single case or a group ────────────────────────────

type ActiveItem =
  | { kind: "case"; data: MatchResult }
  | { kind: "group"; data: MatchGroup };

function ReviewContent() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [active, setActive] = useState<ActiveItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [upload, setUpload] = useState<UploadProgress | null>(null);

  useEffect(() => subscribeUpload(setUpload), []);

  const load = useCallback(async (selectId?: string, selectGroupId?: string) => {
    try {
      const d = await getDashboard();
      setData(d);

      setActive((prev) => {
        // Explicit group navigation
        if (selectGroupId && d.groups) {
          const g = d.groups.find((g) => g.id === selectGroupId);
          if (g) return { kind: "group", data: g };
        }
        // Explicit case navigation
        if (selectId) {
          const r = d.results.find((r) => r.id === selectId);
          if (r) return { kind: "case", data: r };
        }
        // Keep existing selection refreshed
        if (prev?.kind === "case") {
          const refreshed = d.results.find((r) => r.id === prev.data.id);
          if (refreshed) return { kind: "case", data: refreshed };
        }
        if (prev?.kind === "group" && d.groups) {
          const refreshed = d.groups.find((g) => g.id === prev.data.id);
          if (refreshed) return { kind: "group", data: refreshed };
        }

        // Default: first pending case (status review/exception/partial, no decision)
        const pending = d.results.filter(
          (r) => ["review", "exception", "partial"].includes(r.status) && !r.human_decision
        );
        // Also check groups without decision
        const pendingGroups = (d.groups ?? []).filter((g) => !g.human_decision);

        if (pending.length > 0) return { kind: "case", data: pending[0] };
        if (pendingGroups.length > 0) return { kind: "group", data: pendingGroups[0] };
        return null;
      });
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = searchParams.get("id");
    const gid = searchParams.get("group");
    load(id ?? undefined, gid ?? undefined);
  }, [searchParams, load]);

  // Selective polling when processing uploads or unclassified items
  useEffect(() => {
    const pendingList = (data?.results ?? []).filter(
      (r) => ["review", "exception", "partial"].includes(r.status) && !r.human_decision
    );
    const hasBackgroundUpload = upload && upload.phase !== "done" && upload.phase !== "error";
    const hasProcessing = pendingList.some((r) => !r.exception_explanation);

    if (hasBackgroundUpload || hasProcessing) {
      const iv = setInterval(() => load(), 5000);
      return () => clearInterval(iv);
    }
  }, [data, upload, load]);

  // Auto-refresh when upload finishes
  useEffect(() => {
    if (upload?.phase === "done") {
      if (upload.groupId) {
        load(undefined, upload.groupId);
      } else if (upload.matchResultId) {
        load(upload.matchResultId);
      } else {
        load();
      }
    }
  }, [upload, load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-56px)] bg-[#0d1117]">
        <div className="text-center">
          <span className="w-6 h-6 border-2 border-neutral-700 border-t-blue-500 rounded-full animate-spin block mx-auto mb-3" />
          <p className="text-xs text-neutral-500 font-medium">Loading cases…</p>
        </div>
      </div>
    );
  }

  // Separate pending single-results and pending groups
  const pending = (data?.results ?? []).filter(
    (r) => ["review", "exception", "partial"].includes(r.status) && !r.human_decision
  );
  pending.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const pendingGroups = (data?.groups ?? []).filter((g) => !g.human_decision);

  const todayStr = new Date().toISOString().split("T")[0];
  const autoMatched = (data?.results ?? []).filter((r) => {
    const isToday = r.created_at?.startsWith(todayStr);
    return r.status === "matched" && !r.human_decision && isToday;
  });

  const activeResultId = active?.kind === "case" ? active.data.id : undefined;
  const activeGroupId = active?.kind === "group" ? active.data.id : undefined;
  const isUploading = upload && upload.phase !== "done" && upload.phase !== "error";
  const detailUpload = isUploading ? null : upload;

  return (
    <div className="min-h-[calc(100vh-56px)] bg-[#0d1117] px-6 py-6">
      <div className="max-w-6xl mx-auto flex gap-[14px] items-start">
        {/* Left Column */}
        <PendingQueue
          pending={pending}
          pendingGroups={pendingGroups}
          activeResultId={activeResultId}
          activeGroupId={activeGroupId}
          onSelectCase={(r) => setActive({ kind: "case", data: r })}
          onSelectGroup={(g) => setActive({ kind: "group", data: g })}
          allResults={data?.results ?? []}
          autoMatched={autoMatched}
          upload={upload}
          // Legacy props for compatibility
          active={active?.kind === "case" ? active.data : null}
          onSelect={(r) => setActive({ kind: "case", data: r })}
        />

        {/* Right Column */}
        <main className="flex-1 min-w-0">
          {active?.kind === "case" ? (
            <CaseDetail key={active.data.id} result={active.data} onDecision={load} upload={detailUpload} />
          ) : active?.kind === "group" ? (
            <GroupDetail key={active.data.id} group={active.data} onDecision={load} upload={detailUpload} />
          ) : (
            <div className="flex flex-col items-center justify-center py-20 rounded-lg border border-[#30363d] bg-[#161b22] text-center select-none shadow-sm">
              <span className="text-3xl mb-3 text-neutral-500">✓</span>
              <h3 className="text-[15px] font-semibold text-white">All cases reviewed</h3>
              <p className="text-[12px] text-neutral-400 mt-1">No pending cases remaining.</p>
            </div>
          )}
        </main>
      </div>
      <Toast />
    </div>
  );
}

export default function ReviewPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-[calc(100vh-56px)] bg-[#0d1117]">
          <span className="w-5 h-5 border-2 border-neutral-700 border-t-blue-500 rounded-full animate-spin" />
        </div>
      }
    >
      <ReviewContent />
    </Suspense>
  );
}
