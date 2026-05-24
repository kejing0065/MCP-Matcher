"use client"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts"

interface Props {
  matched: number
  review: number
  exceptions: number
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border-light)",
        borderRadius: "8px",
        padding: "0.75rem 1rem",
        fontSize: "0.85rem",
      }}>
        <p style={{ color: "var(--text-secondary)", marginBottom: "0.4rem", fontWeight: 600 }}>{label}</p>
        {payload.map((entry) => (
          <p key={entry.name} style={{ color: entry.color, fontWeight: 700 }}>
            {entry.name}: {entry.value}
          </p>
        ))}
      </div>
    )
  }
  return null
}

export default function ReconcileChart({ matched, review, exceptions }: Props) {
  const data = [
    { name: "Results", Matched: matched, "Needs Review": review, Exceptions: exceptions },
  ]

  return (
    <div className="chart-section">
      <div className="chart-title">Reconciliation Overview</div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="name" tick={{ fill: "var(--text-muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fill: "var(--text-muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--bg-card-hover)" }} />
          <Legend
            wrapperStyle={{ paddingTop: "1rem", fontSize: "0.82rem", color: "var(--text-secondary)" }}
          />
          <Bar dataKey="Matched" fill="#22c55e" radius={[6, 6, 0, 0]} maxBarSize={80} />
          <Bar dataKey="Needs Review" fill="#f59e0b" radius={[6, 6, 0, 0]} maxBarSize={80} />
          <Bar dataKey="Exceptions" fill="#ef4444" radius={[6, 6, 0, 0]} maxBarSize={80} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
