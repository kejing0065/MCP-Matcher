interface Props {
  total: number
  autoMatched: number
  needsReview: number
  exceptions: number
  totalVarianceMyr: number
}

export default function StatsBar({ total, autoMatched, needsReview, exceptions, totalVarianceMyr }: Props) {
  const varPositive = totalVarianceMyr >= 0

  return (
    <div className="stats-grid">
      <div className="stat-card blue">
        <div className="stat-value" style={{ color: "var(--accent-blue)" }}>{total}</div>
        <div className="stat-label">Total Processed</div>
      </div>

      <div className="stat-card green">
        <div className="stat-value" style={{ color: "var(--green)" }}>{autoMatched}</div>
        <div className="stat-label">Auto-Matched</div>
      </div>

      <div className="stat-card amber">
        <div className="stat-value" style={{ color: "var(--amber)" }}>{needsReview}</div>
        <div className="stat-label">Needs Review</div>
      </div>

      <div className="stat-card red">
        <div className="stat-value" style={{ color: varPositive ? "var(--green)" : "var(--red)" }}>
          {varPositive ? "+" : ""}MYR {Math.abs(totalVarianceMyr).toFixed(2)}
        </div>
        <div className="stat-label">Total Variance (MYR)</div>
      </div>
    </div>
  )
}
