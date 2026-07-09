// Pure helpers for computing per-trade and aggregate trading statistics.

/**
 * Gross P&L for a single trade, respecting direction.
 * Long:  (exit - entry) * quantity
 * Short: (entry - exit) * quantity
 * Fees are subtracted to give net P&L.
 */
export function tradePnl(trade) {
  const entry = Number(trade.entryPrice)
  const exit = Number(trade.exitPrice)
  const qty = Number(trade.quantity)
  const fees = Number(trade.fees) || 0

  if (!isFinite(entry) || !isFinite(exit) || !isFinite(qty)) return 0

  const direction = trade.direction === 'short' ? -1 : 1
  const gross = (exit - entry) * qty * direction
  return gross - fees
}

/** Return on the position as a percentage of the capital committed at entry. */
export function tradeReturnPct(trade) {
  const entry = Number(trade.entryPrice)
  const qty = Number(trade.quantity)
  const capital = Math.abs(entry * qty)
  if (!capital) return 0
  return (tradePnl(trade) / capital) * 100
}

export function isWin(trade) {
  return tradePnl(trade) > 0
}

/** Chronological sort key: prefer exit date, fall back to entry date. */
function tradeDate(trade) {
  const d = trade.exitDate || trade.entryDate
  return d ? new Date(d).getTime() : 0
}

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatCurrency(value) {
  const num = Number(value) || 0
  return currency.format(num)
}

export function formatPct(value) {
  const num = Number(value) || 0
  return `${num >= 0 ? '' : ''}${num.toFixed(2)}%`
}

/**
 * Aggregate metrics across a list of trades.
 * Returns net P&L, win rate, profit factor, average win/loss,
 * best/worst trades and an equity curve (cumulative P&L).
 */
export function computeStats(trades) {
  const closed = trades.filter(
    (t) => t.exitPrice !== '' && t.exitPrice != null,
  )

  const sorted = [...closed].sort((a, b) => tradeDate(a) - tradeDate(b))

  let netPnl = 0
  let grossProfit = 0
  let grossLoss = 0
  let wins = 0
  let losses = 0
  let best = null
  let worst = null

  const equityCurve = []
  let cumulative = 0

  for (const trade of sorted) {
    const pnl = tradePnl(trade)
    netPnl += pnl
    cumulative += pnl
    equityCurve.push({
      label: trade.symbol || '—',
      date: trade.exitDate || trade.entryDate || '',
      pnl,
      equity: Number(cumulative.toFixed(2)),
    })

    if (pnl > 0) {
      wins += 1
      grossProfit += pnl
    } else if (pnl < 0) {
      losses += 1
      grossLoss += Math.abs(pnl)
    }

    if (best === null || pnl > tradePnl(best)) best = trade
    if (worst === null || pnl < tradePnl(worst)) worst = trade
  }

  const totalClosed = closed.length
  const decided = wins + losses
  const winRate = decided ? (wins / decided) * 100 : 0
  const avgWin = wins ? grossProfit / wins : 0
  const avgLoss = losses ? grossLoss / losses : 0
  const profitFactor = grossLoss ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0
  const expectancy = decided ? netPnl / decided : 0

  return {
    totalTrades: trades.length,
    closedTrades: totalClosed,
    openTrades: trades.length - totalClosed,
    netPnl,
    grossProfit,
    grossLoss,
    wins,
    losses,
    winRate,
    avgWin,
    avgLoss,
    profitFactor,
    expectancy,
    best,
    worst,
    equityCurve,
  }
}
