// Opening Range Breakout (ORB) engine for the "first 5-minute candle" strategy.
//
// The classic rule on NSE: the 09:15–09:20 candle defines the opening range.
// A break above its high is a long, a break below its low is a short; the stop
// sits at the opposite end of the range and the target is an R multiple of it.
// Everything is squared off at the close.
//
// All functions here are pure so the behaviour can be tested directly.

/** Split a columnar {t,o,h,l,c} series into per-day slices of bar indices. */
export function groupByDay(data) {
  const days = []
  let cur = null
  for (let i = 0; i < data.count; i++) {
    // IST calendar day for this bar.
    const key = Math.floor((data.t[i] + 5.5 * 3600) / 86400)
    if (!cur || cur.key !== key) {
      cur = { key, from: i, to: i }
      days.push(cur)
    } else {
      cur.to = i
    }
  }
  return days
}

/** Bars of one day pulled out of the columnar series. */
export function dayBars(data, day) {
  const bars = []
  for (let i = day.from; i <= day.to; i++) {
    bars.push({ i, t: data.t[i], o: data.o[i], h: data.h[i], l: data.l[i], c: data.c[i] })
  }
  return bars
}

/** High/low of the first `n` candles of the session. */
export function openingRange(bars, n = 1) {
  if (!bars.length) return null
  const use = bars.slice(0, Math.max(1, n))
  let high = -Infinity
  let low = Infinity
  for (const b of use) {
    if (b.h > high) high = b.h
    if (b.l < low) low = b.l
  }
  return { high, low, width: high - low, bars: use.length }
}

/**
 * Walk the bars after entry and decide how the trade ended.
 *
 * When a single candle trades through both the stop and the target we cannot
 * tell from OHLC which came first, so we assume the stop — the pessimistic
 * reading, which keeps practice stats honest rather than flattering.
 */
export function resolveTrade(bars, entryIdx, side, entry, sl, target) {
  const dir = side === 'long' ? 1 : -1
  for (let k = entryIdx + 1; k < bars.length; k++) {
    const b = bars[k]
    const hitSl = side === 'long' ? b.l <= sl : b.h >= sl
    const hitTp = target != null && (side === 'long' ? b.h >= target : b.l <= target)
    if (hitSl) return { exitIdx: k, exit: sl, reason: 'sl' }
    if (hitTp) return { exitIdx: k, exit: target, reason: 'target' }
  }
  const last = bars[bars.length - 1]
  return { exitIdx: bars.length - 1, exit: last.c, reason: 'eod' }
}

/** Points and R multiple for a completed trade. */
export function tradeResult(side, entry, exit, sl) {
  const dir = side === 'long' ? 1 : -1
  const points = (exit - entry) * dir
  const risk = Math.abs(entry - sl)
  return { points, r: risk ? points / risk : 0, risk }
}

/**
 * Mechanical backtest of one session.
 * Enters on the first candle that trades beyond the opening range, filling at
 * the range level itself (or the open when the candle gaps past it).
 */
export function backtestDay(bars, opts = {}) {
  const { orBars = 1, rMultiple = 1, allowShort = true, allowLong = true } = opts
  const or = openingRange(bars, orBars)
  if (!or || !isFinite(or.width) || or.width <= 0) return null

  for (let k = or.bars; k < bars.length; k++) {
    const b = bars[k]
    const brokeUp = allowLong && b.h > or.high
    const brokeDown = allowShort && b.l < or.low
    if (!brokeUp && !brokeDown) continue

    // If a candle pierces both sides, take whichever the open was nearer to.
    let side
    if (brokeUp && brokeDown) side = b.o - or.low < or.high - b.o ? 'short' : 'long'
    else side = brokeUp ? 'long' : 'short'

    const level = side === 'long' ? or.high : or.low
    const entry = side === 'long' ? Math.max(level, b.o) : Math.min(level, b.o)
    const sl = side === 'long' ? or.low : or.high
    const risk = Math.abs(entry - sl)
    if (!risk) return null
    const target =
      rMultiple > 0
        ? side === 'long'
          ? entry + risk * rMultiple
          : entry - risk * rMultiple
        : null

    const res = resolveTrade(bars, k, side, entry, sl, target)
    const { points, r } = tradeResult(side, entry, res.exit, sl)
    return {
      side,
      entryIdx: k,
      entry,
      sl,
      target,
      exitIdx: res.exitIdx,
      exit: res.exit,
      reason: res.reason,
      points,
      r,
      or,
    }
  }
  return null // range never broke
}

/** Aggregate stats over a list of completed trades. */
export function summarize(trades) {
  const n = trades.length
  if (!n) {
    return { n: 0, wins: 0, losses: 0, winRate: 0, totalR: 0, avgR: 0, points: 0, expectancy: 0, maxDD: 0, longs: 0, shorts: 0 }
  }
  let wins = 0
  let losses = 0
  let totalR = 0
  let points = 0
  let longs = 0
  let peak = 0
  let equity = 0
  let maxDD = 0
  for (const t of trades) {
    if (t.r > 0) wins++
    else if (t.r < 0) losses++
    totalR += t.r
    points += t.points
    if (t.side === 'long') longs++
    equity += t.r
    peak = Math.max(peak, equity)
    maxDD = Math.min(maxDD, equity - peak)
  }
  return {
    n,
    wins,
    losses,
    winRate: (wins / n) * 100,
    totalR,
    avgR: totalR / n,
    points,
    expectancy: totalR / n,
    maxDD,
    longs,
    shorts: n - longs,
  }
}
