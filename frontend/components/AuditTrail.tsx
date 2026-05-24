"use client";

import type { AgentLog } from "@/lib/types";

interface AuditTrailProps {
  logs: AgentLog[];
  humanDecision?: "approved" | "rejected" | null;
  variance?: number;
  decidedAt?: string;
}

function timeAgo(ds?: string) {
  if (!ds) return "";
  const diff = Date.now() - new Date(ds).getTime();
  const m = Math.floor(diff / 60000),
    h = Math.floor(m / 60),
    d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return "just now";
}

const ACTION_TITLES: Record<string, string> = {
  extract_document: "Invoice extracted",
  parse_bank_csv: "Bank CSV parsed",
  fx_convert: "FX rate fetched",
  parse_description: "Bank description parsed",
  match: "Match scored",
  classify_exception: "Exception classified",
};

export default function AuditTrail({
  logs,
  humanDecision,
  variance = 0,
  decidedAt,
}: AuditTrailProps) {
  // Map logs to timeline items
  const timelineItems = logs.map((log) => {
    const actionKey = log.action ?? "";
    const title =
      ACTION_TITLES[actionKey] ||
      actionKey
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");

    return {
      title,
      detail: log.detail,
      timestamp: log.created_at,
      dotColor: "bg-green-500",
      titleColor: "text-neutral-200",
    };
  });

  // Append human decision as the final item if present
  if (humanDecision) {
    const isApproved = humanDecision === "approved";
    const detailText = isApproved
      ? `Reconciliation matched within tolerance limits. Variance: ${variance >= 0 ? "+" : ""}MYR ${variance.toFixed(2)}`
      : `Match rejected by reviewer. Variance: ${variance >= 0 ? "+" : ""}MYR ${variance.toFixed(2)}`;

    timelineItems.push({
      title: isApproved ? "Approved by human" : "Rejected by human",
      detail: detailText,
      timestamp: decidedAt || logs[logs.length - 1]?.created_at, // fallback
      dotColor: isApproved ? "bg-green-500" : "bg-red-500",
      titleColor: isApproved ? "text-green-500" : "text-red-500",
    });
  }

  return (
    <div className="flex flex-col">
      {timelineItems.length === 0 ? (
        <p className="text-[12px] text-neutral-500 font-medium">
          No logs recorded yet.
        </p>
      ) : (
        timelineItems.map((item, idx) => {
          const isLast = idx === timelineItems.length - 1;
          const timeLabel = item.timestamp ? timeAgo(item.timestamp) : "";

          return (
            <div key={idx} className="flex gap-4">
              {/* Left Column: dot + line */}
              <div className="flex flex-col items-center shrink-0">
                <div
                  className={`w-2 h-2 rounded-full ${item.dotColor} mt-1.5`}
                />
                {!isLast && <div className="w-0.5 flex-1 bg-[#30363d] my-1" />}
              </div>

              {/* Right Column: content */}
              <div className="pb-5 text-left flex-1 min-w-0">
                <h4 className={`text-[13px] font-semibold ${item.titleColor}`}>
                  {item.title}
                </h4>
                {item.detail && (
                  <p className="text-[12px] text-neutral-400 leading-relaxed mt-1 wrap-break-word">
                    {item.detail}
                  </p>
                )}
                {timeLabel && (
                  <span className="text-[11px] text-neutral-500 font-medium block mt-1.5">
                    {timeLabel}
                  </span>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
