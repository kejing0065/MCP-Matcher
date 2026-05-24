"use client";

interface StatusBadgeProps {
  status:
    | "matched"
    | "review"
    | "exception"
    | "approved"
    | "rejected"
    | "processing";
  size?: "sm" | "md";
}

export default function StatusBadge({ status, size = "sm" }: StatusBadgeProps) {
  const baseClass =
    "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap";

  const statusStyles: Record<
    string,
    { bg: string; text: string; icon: string }
  > = {
    matched: {
      bg: "bg-green-950/40 border-green-800/40 border-green-500/20",
      text: "text-green-500",
      icon: "✓",
    },
    review: {
      bg: "bg-amber-950/40 border-amber-800/40 border-amber-500/20",
      text: "text-amber-500",
      icon: "⚠",
    },
    exception: {
      bg: "bg-red-950/40 border-red-800/40 border-red-500/20",
      text: "text-red-500",
      icon: "✕",
    },
    approved: {
      bg: "bg-green-950/40 border-green-800/40 border-green-500/20",
      text: "text-green-500",
      icon: "✓",
    },
    rejected: {
      bg: "bg-red-950/40 border-red-800/40 border-red-500/20",
      text: "text-red-500",
      icon: "✕",
    },
    processing: {
      bg: "bg-blue-950/40 border-blue-800/40 border-blue-500/20",
      text: "text-blue-500",
      icon: "⟳",
    },
  };

  const style = statusStyles[status] || statusStyles.matched;
  const sizeClass = size === "sm" ? "text-[10px]" : "text-xs";

  return (
    <span className={`${baseClass} ${style.bg} ${style.text} ${sizeClass}`}>
      <span
        className={status === "processing" ? "animate-spin inline-block mr-0.5" : "mr-0.5"}
      >
        {style.icon}
      </span>
      {status === "processing" ? "Processing" : status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
