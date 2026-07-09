import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatCurrency } from '../utils/stats.js'

function ChartTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null
  const point = payload[0].payload
  return (
    <div className="chart-tooltip">
      <div className="tt-symbol">{point.label}</div>
      {point.date && <div className="tt-date">{point.date}</div>}
      <div className={point.pnl >= 0 ? 'tone-pos' : 'tone-neg'}>
        Trade: {formatCurrency(point.pnl)}
      </div>
      <div>Equity: {formatCurrency(point.equity)}</div>
    </div>
  )
}

export default function EquityChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="chart-empty">
        No closed trades yet. Log a trade with an exit price to see your equity
        curve.
      </div>
    )
  }

  // Prepend a zero baseline so the curve starts at the origin.
  const series = [{ label: 'Start', date: '', pnl: 0, equity: 0 }, ...data]

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={series} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis
          dataKey="label"
          tick={{ fill: '#64748b', fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: '#1e293b' }}
        />
        <YAxis
          tick={{ fill: '#64748b', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `$${v}`}
          width={64}
        />
        <Tooltip content={<ChartTooltip />} />
        <ReferenceLine y={0} stroke="#475569" strokeWidth={1} />
        <Area
          type="monotone"
          dataKey="equity"
          stroke="#22c55e"
          strokeWidth={2}
          fill="url(#equityFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
