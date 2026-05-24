"use client";

import type { ScoreBreakdown } from "@/lib/types";

interface ConfidenceBreakdownProps {
  breakdown?: ScoreBreakdown;
}

function getScoreColor(score: number): string {
  if (score >= 85) return "bg-green-500";
  if (score >= 60) return "bg-amber-500";
  return "bg-red-500";
}

export default function ConfidenceBreakdown({
  breakdown,
}: ConfidenceBreakdownProps) {
  if (!breakdown) return null;

  const scores = [
    { label: "Amount", value: breakdown.amount_score ?? 0, weight: "40%" },
    { label: "Date", value: breakdown.date_score ?? 0, weight: "30%" },
    { label: "Reference", value: breakdown.reference_score ?? 0, weight: "30%" },
  ];

  return (
    <div className="space-y-3">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold">
        Confidence breakdown
      </div>

      <div className="space-y-2.5">
        {scores.map((score) => (
          <div key={score.label} className="flex items-center gap-3">
            <div className="w-[68px] text-[12px] text-neutral-400 shrink-0">{score.label}</div>
            <div className="flex-1 h-1.5 bg-[#21262d] rounded-full overflow-hidden">
              <div
                className={`h-full ${getScoreColor(score.value)} rounded-full transition-all duration-500`}
                style={{ width: `${Math.min(score.value, 100)}%` }}
              />
            </div>
            <div className="w-9 text-[12px] font-mono font-medium text-neutral-200 text-right shrink-0">
              {Math.round(score.value)}%
            </div>
          </div>
        ))}
      </div>

      <div className="text-[11px] text-neutral-500 font-medium">
        Weighted: amount 40% · date 30% · reference 30%
      </div>
    </div>
  );
}
