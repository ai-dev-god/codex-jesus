interface StatsCardProps {
  label: string
  value: number | string
  helper?: string
}

export function StatsCard({ label, value, helper }: StatsCardProps) {
  return (
    <div className="card stats-card">
      <span className="stats-value">{value}</span>
      <span className="stats-label">{label}</span>
      {helper ? <span className="muted">{helper}</span> : null}
    </div>
  )
}
