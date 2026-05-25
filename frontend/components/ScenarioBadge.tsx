"use client";

import type { ScenarioType } from "@/lib/types";
import { SCENARIO_LABELS, SCENARIO_COLORS, SCENARIO_ICONS } from "@/lib/types";

interface ScenarioBadgeProps {
  scenarioType?: ScenarioType;
  size?: "xs" | "sm";
}

export default function ScenarioBadge({ scenarioType, size = "xs" }: ScenarioBadgeProps) {
  if (!scenarioType) return null;

  const label = SCENARIO_LABELS[scenarioType] ?? scenarioType;
  const colorClass = SCENARIO_COLORS[scenarioType] ?? "text-neutral-400 bg-neutral-900/40 border-neutral-700/40";
  const icon = SCENARIO_ICONS[scenarioType] ?? "·";

  const sizeClass = size === "sm"
    ? "px-2 py-0.5 text-[11px]"
    : "px-1.5 py-0.5 text-[10px]";

  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-bold border ${sizeClass} ${colorClass}`}>
      <span className="font-mono leading-none">{icon}</span>
      {label}
    </span>
  );
}
