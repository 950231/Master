import StatCard from './StatCard.jsx'
import EquityChart from './EquityChart.jsx'
import { formatCurrency, tradePnl } from '../utils/stats.js'

function tone(value) {
  if (value > 0) return 'pos'
  if (value < 0) return 'neg'
  return 'neutral'
}

export default function Dashboard({ stats }) {
  const {
    netPnl,
    winRate,
    closedTrades,
    openTrades,
    profitFactor,
    avgWin,
    avgLoss,
    expectancy,
    best,
    worst,
    equityCurve,
  } = stats

  const pf = profitFactor === Infinity ? '∞' : profitFactor.toFixed(2)

  return (
    <section className="dashboard">
      <div className="stat-grid">
        <StatCard
          label="Net P&L"
          value={formatCurrency(netPnl)}
          tone={tone(netPnl)}
          sub={`${closedTrades} closed · ${openTrades} open`}
        />
        <StatCard
          label="Win Rate"
          value={`${winRate.toFixed(1)}%`}
          tone={winRate >= 50 ? 'pos' : 'neg'}
          sub={`${stats.wins}W / ${stats.losses}L`}
        />
        <StatCard
          label="Profit Factor"
          value={pf}
          tone={profitFactor >= 1 ? 'pos' : 'neg'}
          sub="gross win / gross loss"
        />
        <StatCard
          label="Expectancy"
          value={formatCurrency(expectancy)}
          tone={tone(expectancy)}
          sub="avg per closed trade"
        />
        <StatCard
          label="Avg Win"
          value={formatCurrency(avgWin)}
          tone="pos"
        />
        <StatCard
          label="Avg Loss"
          value={formatCurrency(-avgLoss)}
          tone="neg"
        />
        <StatCard
          label="Best Trade"
          value={best ? formatCurrency(tradePnl(best)) : '—'}
          tone="pos"
          sub={best ? best.symbol : ''}
        />
        <StatCard
          label="Worst Trade"
          value={worst ? formatCurrency(tradePnl(worst)) : '—'}
          tone="neg"
          sub={worst ? worst.symbol : ''}
        />
      </div>

      <div className="chart-panel">
        <div className="panel-title">Equity Curve</div>
        <EquityChart data={equityCurve} />
      </div>
    </section>
  )
}
