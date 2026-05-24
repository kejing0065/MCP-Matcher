"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getDashboard } from "@/lib/api";
import type { MatchResult, DashboardResponse } from "@/lib/types";
import PendingQueue from "@/components/PendingQueue";
import CaseDetail from "@/components/CaseDetail";
import Toast from "@/components/Toast";
import { subscribeUpload, type UploadProgress } from "@/lib/uploadStore";

function ReviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [active, setActive] = useState<MatchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [upload, setUpload] = useState<UploadProgress | null>(null);

  // Subscribe to background upload progress
  useEffect(() => subscribeUpload(setUpload), []);

  const load = useCallback(async (selectId?: string) => {
    try {
      const d = await getDashboard();
      setData(d);
      
      // Update selected case
      setActive((prev) => {
        if (selectId) {
          const target = d.results.find((r) => r.id === selectId);
          if (target) return target;
        }
        if (prev) {
          const refreshed = d.results.find((r) => r.id === prev.id);
          // Keep selection, update with refreshed content
          if (refreshed) return refreshed;
        }
        
        // Default select: first pending case (status is review/exception and no decision yet)
        const pendingList = d.results.filter(
          (r) => (r.status === "review" || r.status === "exception") && !r.human_decision
        );
        return pendingList[0] || null;
      });
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    const id = searchParams.get("id");
    if (id) {
      load(id);
    } else {
      load();
    }
  }, [searchParams, load]);

  // Selective polling (every 5 seconds)
  useEffect(() => {
    const pendingList = (data?.results ?? []).filter(
      (r) => (r.status === "review" || r.status === "exception") && !r.human_decision
    );
    
    // Check if there are active background uploads or database processing tasks
    const hasBackgroundUpload = upload && upload.phase !== "done" && upload.phase !== "error";
    const hasProcessing = pendingList.some((r) => !r.exception_explanation);

    if (hasBackgroundUpload || hasProcessing) {
      const iv = setInterval(() => {
        load();
      }, 5000);
      return () => clearInterval(iv);
    }
  }, [data, upload, load]);

  // Auto-refresh when background upload finishes
  useEffect(() => {
    if (upload?.phase === "done" && upload.matchResultId) {
      load(upload.matchResultId);
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

  // Filter queues
  const pending = (data?.results ?? []).filter(
    (r) => (r.status === "review" || r.status === "exception") && !r.human_decision
  );
  
  // Sort by created_at descending (newest first)
  pending.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Filter auto-matched today (status is matched, no human decision, created today)
  const todayStr = new Date().toISOString().split("T")[0];
  const autoMatched = (data?.results ?? []).filter((r) => {
    const isToday = r.created_at && r.created_at.startsWith(todayStr);
    return r.status === "matched" && !r.human_decision && isToday;
  });

  return (
    <div className="min-h-[calc(100vh-56px)] bg-[#0d1117] px-6 py-6">
      <div className="max-w-6xl mx-auto flex gap-[14px] items-start">
        {/* Left Column (260px Pending list + Auto-matched today) */}
        <PendingQueue
          pending={pending}
          active={active}
          onSelect={setActive}
          autoMatched={autoMatched}
          upload={upload}
        />

        {/* Right Column (Flex-1 Detailed View Card) */}
        <main className="flex-1 min-w-0">
          {active ? (
            <CaseDetail key={active.id} result={active} onDecision={load} />
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
