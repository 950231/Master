export default function StatCard({ label, value, tone = 'neutral', sub }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className={`stat-value tone-${tone}`}>{value}</div>
      {sub != null && <div className="stat-sub">{sub}</div>}
    </div>
  )
}
