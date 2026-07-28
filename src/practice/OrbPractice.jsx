import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ThemePicker from '../ThemePicker.jsx'
import {
  groupByDay,
  dayBars,
  openingRange,
  resolveTrade,
  tradeResult,
  backtestDay,
  summarize,
} from './orb.js'
import './practice.css'

const BASE = import.meta.env.BASE_URL || '/'
const JOURNAL_KEY = 'orb.journal.v1'
const SETTINGS_KEY = 'orb.settings.v1'

const SPEEDS = [
  { label: 'Slow', ms: 1200 },
  { label: 'Normal', ms: 600 },
  { label: 'Fast', ms: 250 },
  { label: 'Turbo', ms: 80 },
]

const PAD = { l: 8, r: 70, t: 14, b: 26 }

const fmtPrice = (p) =>
  Number(p).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function istLabel(epochSec, withDate = false) {
  const d = new Date((epochSec + 5.5 * 3600) * 1000)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mi = String(d.getUTCMinutes()).padStart(2, '0')
  if (!withDate) return `${hh}:${mi}`
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mon = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
  return `${dd} ${mon} ${d.getUTCFullYear()}`
}

const cssVar = (n, f) =>
  getComputedStyle(document.documentElement).getPropertyValue(n).trim() || f

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

export default function OrbPractice() {
  const [years, setYears] = useState([])
  const [year, setYear] = useState(null)
  const [data, setData] = useState(null)
  const [days, setDays] = useState([])
  const [dayIdx, setDayIdx] = useState(0)
  const [loading, setLoading] = useState(true)

  const [settings, setSettings] = useState(() =>
    loadJSON(SETTINGS_KEY, { orBars: 1, rMultiple: 2, ms: 600 }),
  )
  // How many candles of the session are revealed.
  const [at, setAt] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(null) // open trade
  const [result, setResult] = useState(null) // finished trade for this day
  const [journal, setJournal] = useState(() => loadJSON(JOURNAL_KEY, []))
  const [tab, setTab] = useState('practice') // practice | stats | edge
  const [warning, setWarning] = useState(null)
  const [edge, setEdge] = useState(null)

  const canvasRef = useRef(null)
  const wrapRef = useRef(null)

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    } catch {
      /* ignore */
    }
  }, [settings])
  useEffect(() => {
    try {
      localStorage.setItem(JOURNAL_KEY, JSON.stringify(journal))
    } catch {
      /* ignore */
    }
  }, [journal])

  useEffect(() => {
    fetch(`${BASE}nifty/index.json`)
      .then((r) => r.json())
      .then((idx) => {
        const ys = idx.years || []
        setYears(ys)
        // The newest year is usually a partial one (only a few sessions so far),
        // which makes for a poor practice pool — default to the last full year.
        setYear((y) => y || ys.at(-2) || ys.at(-1) || null)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!year) return
    let cancelled = false
    setLoading(true)
    fetch(`${BASE}nifty/5m-${year}.json`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        setData(d)
        const gs = groupByDay(d).filter((g) => g.to - g.from >= 10)
        setDays(gs)
        setDayIdx(Math.floor(Math.random() * gs.length))
        setLoading(false)
      })
      .catch(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [year])

  const bars = useMemo(
    () => (data && days[dayIdx] ? dayBars(data, days[dayIdx]) : []),
    [data, days, dayIdx],
  )
  const or = useMemo(
    () => (bars.length ? openingRange(bars, settings.orBars) : null),
    [bars, settings.orBars],
  )

  // Start each session with just the opening range on screen.
  const resetDay = useCallback(() => {
    setAt(Math.max(0, settings.orBars - 1))
    setPlaying(false)
    setPosition(null)
    setResult(null)
    setWarning(null)
  }, [settings.orBars])

  useEffect(() => {
    resetDay()
  }, [dayIdx, year, resetDay])

  const revealed = Math.min(bars.length - 1, at)
  const current = bars[revealed]
  const atEnd = revealed >= bars.length - 1

  // ---- playback ----
  useEffect(() => {
    if (!playing || atEnd) return
    const id = setInterval(() => setAt((a) => a + 1), settings.ms)
    return () => clearInterval(id)
  }, [playing, atEnd, settings.ms])

  useEffect(() => {
    if (atEnd) setPlaying(false)
  }, [atEnd])

  // ---- live trade management: check the newly revealed candle ----
  useEffect(() => {
    if (!position || !current) return
    const b = current
    if (b.i === position.entryBarI) return // entry candle itself
    const hitSl = position.side === 'long' ? b.l <= position.sl : b.h >= position.sl
    const hitTp =
      position.target != null &&
      (position.side === 'long' ? b.h >= position.target : b.l <= position.target)

    let exit = null
    let reason = null
    if (hitSl) {
      exit = position.sl
      reason = 'sl'
    } else if (hitTp) {
      exit = position.target
      reason = 'target'
    } else if (revealed >= bars.length - 1) {
      exit = b.c
      reason = 'eod'
    }
    if (exit == null) return

    const { points, r } = tradeResult(position.side, position.entry, exit, position.sl)
    const trade = {
      id: `${days[dayIdx]?.key}-${Date.now()}`,
      date: istLabel(bars[0].t, true),
      side: position.side,
      entry: position.entry,
      sl: position.sl,
      target: position.target,
      exit,
      reason,
      points,
      r,
      entryTime: istLabel(bars.find((x) => x.i === position.entryBarI)?.t ?? bars[0].t),
      exitTime: istLabel(b.t),
      rMultiple: settings.rMultiple,
    }
    setPosition(null)
    setResult(trade)
    setJournal((j) => [trade, ...j].slice(0, 500))
    setPlaying(false)
  }, [revealed]) // eslint-disable-line react-hooks/exhaustive-deps

  function takeTrade(side) {
    if (!current || position || result || !or) return
    const entry = current.c
    const sl = side === 'long' ? or.low : or.high
    // The ORB stop sits at the far side of the range, so it is only a valid
    // trade once price has actually broken out — otherwise the stop would end
    // up on the wrong side of the entry and the trade would be nonsense.
    const valid = side === 'long' ? sl < entry : sl > entry
    if (!valid) {
      setWarning(
        side === 'long'
          ? `Price (${fmtPrice(entry)}) is below the OR low, so a long here would put your stop above your entry. Wait for a break above ${fmtPrice(or.high)}.`
          : `Price (${fmtPrice(entry)}) is above the OR high, so a short here would put your stop below your entry. Wait for a break below ${fmtPrice(or.low)}.`,
      )
      return
    }
    setWarning(null)
    const risk = Math.abs(entry - sl)
    if (!risk) return
    const target =
      settings.rMultiple > 0
        ? side === 'long'
          ? entry + risk * settings.rMultiple
          : entry - risk * settings.rMultiple
        : null
    setPosition({ side, entry, sl, target, entryBarI: current.i, risk })
  }

  function closeNow() {
    if (!position || !current) return
    const { points, r } = tradeResult(position.side, position.entry, current.c, position.sl)
    const trade = {
      id: `${days[dayIdx]?.key}-${Date.now()}`,
      date: istLabel(bars[0].t, true),
      side: position.side,
      entry: position.entry,
      sl: position.sl,
      target: position.target,
      exit: current.c,
      reason: 'manual',
      points,
      r,
      entryTime: istLabel(bars.find((x) => x.i === position.entryBarI)?.t ?? bars[0].t),
      exitTime: istLabel(current.t),
      rMultiple: settings.rMultiple,
    }
    setPosition(null)
    setResult(trade)
    setJournal((j) => [trade, ...j].slice(0, 500))
    setPlaying(false)
  }

  const nextDay = (delta) => {
    if (!days.length) return
    setDayIdx((i) => (i + delta + days.length) % days.length)
  }
  const randomDay = () => days.length && setDayIdx(Math.floor(Math.random() * days.length))

  // What the mechanical rule would have done — shown after your trade.
  const ruleTrade = useMemo(
    () =>
      bars.length
        ? backtestDay(bars, { orBars: settings.orBars, rMultiple: settings.rMultiple })
        : null,
    [bars, settings.orBars, settings.rMultiple],
  )

  const stats = useMemo(() => summarize(journal), [journal])

  // ---- historical edge across every session in the loaded year ----
  const runEdge = useCallback(() => {
    if (!data || !days.length) return
    const trades = []
    let noTrade = 0
    for (const d of days) {
      const b = dayBars(data, d)
      const t = backtestDay(b, { orBars: settings.orBars, rMultiple: settings.rMultiple })
      if (t) trades.push({ ...t, date: istLabel(b[0].t, true) })
      else noTrade++
    }
    setEdge({ trades, noTrade, summary: summarize(trades), year, settings: { ...settings } })
  }, [data, days, settings, year])

  // ---------------- chart ----------------
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap || !bars.length || !or) return

    const dpr = window.devicePixelRatio || 1
    const w = wrap.clientWidth
    const h = wrap.clientHeight
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = w + 'px'
      canvas.style.height = h + 'px'
    }
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    const plotW = w - PAD.l - PAD.r
    const plotH = h - PAD.t - PAD.b
    if (plotW <= 0 || plotH <= 0) return

    // Scale to the whole session so candles never jump as they appear.
    let lo = Math.min(or.low, ...bars.map((b) => b.l))
    let hi = Math.max(or.high, ...bars.map((b) => b.h))
    if (position) {
      lo = Math.min(lo, position.sl, position.target ?? position.sl)
      hi = Math.max(hi, position.sl, position.target ?? position.sl)
    }
    const span = hi - lo || 1
    lo -= span * 0.08
    hi += span * 0.08

    const n = bars.length
    const barW = plotW / n
    const xOf = (k) => PAD.l + k * barW + barW / 2
    const yOf = (p) => PAD.t + ((hi - p) / (hi - lo)) * plotH

    const grid = cssVar('--border', '#1e293b')
    const text = cssVar('--text-faint', '#64748b')
    const up = cssVar('--green', '#22c55e')
    const down = cssVar('--red', '#ef4444')
    const accent = cssVar('--accent', '#38bdf8')

    ctx.font = '11px system-ui, sans-serif'
    ctx.lineWidth = 1

    // price grid
    ctx.textBaseline = 'middle'
    for (let k = 0; k <= 5; k++) {
      const p = lo + ((hi - lo) * k) / 5
      const y = Math.round(yOf(p)) + 0.5
      ctx.strokeStyle = grid
      ctx.beginPath()
      ctx.moveTo(PAD.l, y)
      ctx.lineTo(PAD.l + plotW, y)
      ctx.stroke()
      ctx.fillStyle = text
      ctx.fillText(fmtPrice(p), PAD.l + plotW + 6, y)
    }

    // time labels every ~12 candles (each candle is 5 minutes)
    ctx.textBaseline = 'top'
    ctx.fillStyle = text
    for (let k = 0; k < n; k += Math.max(1, Math.round(12))) {
      const x = xOf(k)
      const label = istLabel(bars[k].t)
      const tw = ctx.measureText(label).width
      if (x - tw / 2 > PAD.l && x + tw / 2 < PAD.l + plotW)
        ctx.fillText(label, x - tw / 2, PAD.t + plotH + 6)
    }

    // opening range band
    const yHigh = yOf(or.high)
    const yLow = yOf(or.low)
    ctx.fillStyle = accent + '18'
    ctx.fillRect(PAD.l, yHigh, plotW, yLow - yHigh)
    ctx.strokeStyle = accent
    ctx.setLineDash([5, 4])
    for (const [p, tag] of [
      [or.high, 'OR High'],
      [or.low, 'OR Low'],
    ]) {
      const y = yOf(p)
      ctx.beginPath()
      ctx.moveTo(PAD.l, y)
      ctx.lineTo(PAD.l + plotW, y)
      ctx.stroke()
      ctx.fillStyle = accent
      ctx.textBaseline = 'bottom'
      ctx.fillText(`${tag} ${fmtPrice(p)}`, PAD.l + 4, y - 2)
    }
    ctx.setLineDash([])

    // position levels
    if (position) {
      const lines = [
        [position.entry, accent, 'Entry'],
        [position.sl, down, 'SL'],
      ]
      if (position.target != null) lines.push([position.target, up, 'Target'])
      for (const [p, col, tag] of lines) {
        const y = yOf(p)
        ctx.strokeStyle = col
        ctx.setLineDash([2, 3])
        ctx.beginPath()
        ctx.moveTo(PAD.l, y)
        ctx.lineTo(PAD.l + plotW, y)
        ctx.stroke()
        ctx.setLineDash([])
        const label = `${tag} ${fmtPrice(p)}`
        const tw = ctx.measureText(label).width
        ctx.fillStyle = col
        ctx.fillRect(PAD.l + plotW - tw - 10, y - 8, tw + 10, 16)
        ctx.fillStyle = '#04121d'
        ctx.textBaseline = 'middle'
        ctx.fillText(label, PAD.l + plotW - tw - 5, y)
      }
    }

    // candles, revealed progressively
    const bodyW = Math.max(1.5, barW * 0.62)
    for (let k = 0; k <= revealed && k < n; k++) {
      const b = bars[k]
      const col = b.c >= b.o ? up : down
      const x = xOf(k)
      ctx.strokeStyle = col
      ctx.fillStyle = col
      ctx.beginPath()
      ctx.moveTo(Math.round(x) + 0.5, yOf(b.h))
      ctx.lineTo(Math.round(x) + 0.5, yOf(b.l))
      ctx.stroke()
      const yo = yOf(b.o)
      const yc = yOf(b.c)
      ctx.fillRect(x - bodyW / 2, Math.min(yo, yc), bodyW, Math.max(1, Math.abs(yc - yo)))
      // outline the opening-range candles
      if (k < or.bars) {
        ctx.strokeStyle = accent
        ctx.lineWidth = 1.5
        ctx.strokeRect(x - bodyW / 2 - 1.5, yOf(b.h), bodyW + 3, yOf(b.l) - yOf(b.h))
        ctx.lineWidth = 1
      }
    }

    // entry marker
    if (position || result) {
      const t = position || result
      const idx = bars.findIndex((b) => b.i === (position ? position.entryBarI : -1))
      if (idx >= 0) {
        const x = xOf(idx)
        const y = yOf(t.entry)
        ctx.fillStyle = t.side === 'long' ? up : down
        ctx.beginPath()
        ctx.moveTo(x, y - (t.side === 'long' ? 12 : -12))
        ctx.lineTo(x - 6, y)
        ctx.lineTo(x + 6, y)
        ctx.closePath()
        ctx.fill()
      }
    }

    // "now" edge
    if (revealed < n - 1) {
      const x = xOf(revealed) + barW / 2
      ctx.strokeStyle = text
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.moveTo(x, PAD.t)
      ctx.lineTo(x, PAD.t + plotH)
      ctx.stroke()
      ctx.setLineDash([])
    }
  }, [bars, or, revealed, position, result])

  useEffect(() => draw(), [draw])
  useEffect(() => {
    const onResize = () => draw()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [draw])
  useEffect(() => {
    const obs = new MutationObserver(() => draw())
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [draw])

  // live P&L on the open position
  const openPnl = position && current ? tradeResult(position.side, position.entry, current.c, position.sl) : null
  const breakoutReady = or && revealed >= settings.orBars - 1
  const breakoutState =
    !or || !current
      ? 'none'
      : current.c > or.high
        ? 'long'
        : current.c < or.low
          ? 'short'
          : 'none'

  return (
    <div className="orb-app">
      <header className="orb-header">
        <div className="orb-left">
          <a href="#/" className="back-link">← Apps</a>
          <ThemePicker />
        </div>
        <h1>5-Min ORB Practice</h1>
        <div />
      </header>

      <div className="orb-tabs">
        {[
          ['practice', '🎯 Practice'],
          ['stats', '📒 My Journal'],
          ['edge', '📊 Strategy Edge'],
        ].map(([id, label]) => (
          <button
            key={id}
            className={`orb-tab ${tab === id ? 'active' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'practice' && (
        <>
          <div className="orb-daybar">
            <select value={year || ''} onChange={(e) => setYear(e.target.value)}>
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <button onClick={() => nextDay(-1)}>◀</button>
            <span className="orb-date">
              {bars.length ? istLabel(bars[0].t, true) : loading ? 'Loading…' : '—'}
            </span>
            <button onClick={() => nextDay(1)}>▶</button>
            <button className="primary" onClick={randomDay}>🎲 Random day</button>
            <span className="orb-daycount">
              {days.length ? `day ${dayIdx + 1} / ${days.length}` : ''}
            </span>
          </div>

          <div className="orb-settings">
            <label>
              Opening range
              <select
                value={settings.orBars}
                onChange={(e) => setSettings((s) => ({ ...s, orBars: +e.target.value }))}
              >
                <option value={1}>First 5 min (1 candle)</option>
                <option value={2}>First 10 min</option>
                <option value={3}>First 15 min</option>
              </select>
            </label>
            <label>
              Target
              <select
                value={settings.rMultiple}
                onChange={(e) => setSettings((s) => ({ ...s, rMultiple: +e.target.value }))}
              >
                <option value={1}>1R</option>
                <option value={1.5}>1.5R</option>
                <option value={2}>2R</option>
                <option value={3}>3R</option>
                <option value={0}>No target (ride to close)</option>
              </select>
            </label>
            <div className="orb-speeds">
              {SPEEDS.map((s) => (
                <button
                  key={s.label}
                  className={settings.ms === s.ms ? 'active' : ''}
                  onClick={() => setSettings((v) => ({ ...v, ms: s.ms }))}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {or && (
            <div className="orb-range">
              <span>OR High <b>{fmtPrice(or.high)}</b></span>
              <span>OR Low <b>{fmtPrice(or.low)}</b></span>
              <span>Width <b>{fmtPrice(or.width)}</b> pts</span>
              {current && <span className="orb-clock">🕐 {istLabel(current.t)}</span>}
              {current && <span>LTP <b>{fmtPrice(current.c)}</b></span>}
            </div>
          )}

          <div className="orb-canvas-wrap" ref={wrapRef}>
            <canvas ref={canvasRef} />
            {loading && <div className="orb-overlay">Loading session…</div>}
          </div>

          {or && current && !position && !result && (
            <div className={`orb-status ${breakoutState}`}>
              {breakoutState === 'long'
                ? `▲ Broken above OR high — a long is valid (stop ${fmtPrice(or.low)})`
                : breakoutState === 'short'
                  ? `▼ Broken below OR low — a short is valid (stop ${fmtPrice(or.high)})`
                  : '⏳ Inside the opening range — waiting for a breakout'}
            </div>
          )}

          {warning && <div className="orb-warning">⚠️ {warning}</div>}

          <div className="orb-controls">
            <button onClick={resetDay} title="Restart this session">↺</button>
            <button onClick={() => setAt((a) => Math.max(settings.orBars - 1, a - 1))}>⏮</button>
            <button className="play" onClick={() => setPlaying((p) => !p)} disabled={atEnd}>
              {playing ? '⏸ Pause' : '▶ Play'}
            </button>
            <button onClick={() => setAt((a) => a + 1)} disabled={atEnd}>⏭</button>

            <span className="orb-sep" />

            {!position && !result && (
              <>
                <button className="buy" onClick={() => takeTrade('long')} disabled={!breakoutReady}>
                  ▲ BUY
                </button>
                <button className="sell" onClick={() => takeTrade('short')} disabled={!breakoutReady}>
                  ▼ SELL
                </button>
              </>
            )}
            {position && (
              <button className="close" onClick={closeNow}>✕ Close now</button>
            )}
          </div>

          {position && openPnl && (
            <div className={`orb-position ${openPnl.points >= 0 ? 'win' : 'loss'}`}>
              <b>{position.side === 'long' ? 'LONG' : 'SHORT'}</b>
              <span>Entry {fmtPrice(position.entry)}</span>
              <span>SL {fmtPrice(position.sl)}</span>
              {position.target != null && <span>Target {fmtPrice(position.target)}</span>}
              <span className="orb-live">
                {openPnl.points >= 0 ? '+' : ''}{fmtPrice(openPnl.points)} pts ·{' '}
                {openPnl.r >= 0 ? '+' : ''}{openPnl.r.toFixed(2)}R
              </span>
            </div>
          )}

          {result && (
            <div className={`orb-result ${result.r > 0 ? 'win' : result.r < 0 ? 'loss' : ''}`}>
              <div className="orb-result-head">
                {result.r > 0 ? '✅ Winner' : result.r < 0 ? '❌ Loser' : '➖ Scratch'}
                <span className="orb-reason">
                  {result.reason === 'sl'
                    ? 'stopped out'
                    : result.reason === 'target'
                      ? 'target hit'
                      : result.reason === 'eod'
                        ? 'closed at 15:25'
                        : 'closed manually'}
                </span>
              </div>
              <div className="orb-result-body">
                <span>{result.side.toUpperCase()} {result.entryTime} → {result.exitTime}</span>
                <span>Entry {fmtPrice(result.entry)} → Exit {fmtPrice(result.exit)}</span>
                <b>{result.points >= 0 ? '+' : ''}{fmtPrice(result.points)} pts · {result.r >= 0 ? '+' : ''}{result.r.toFixed(2)}R</b>
              </div>
              {ruleTrade && (
                <div className="orb-compare">
                  📏 The mechanical rule would have gone <b>{ruleTrade.side}</b> at{' '}
                  {fmtPrice(ruleTrade.entry)} for <b>{ruleTrade.r >= 0 ? '+' : ''}{ruleTrade.r.toFixed(2)}R</b>{' '}
                  ({ruleTrade.reason === 'sl' ? 'stopped' : ruleTrade.reason === 'target' ? 'target' : 'held to close'})
                </div>
              )}
              <button className="primary" onClick={randomDay}>Next day →</button>
            </div>
          )}

          {!position && !result && !breakoutReady && (
            <div className="orb-hint">
              Watch the opening range form, then press <b>Play</b>. Hit <b>BUY</b> when price
              breaks above the OR high, or <b>SELL</b> on a break below the low. Your stop is
              placed at the other end of the range automatically.
            </div>
          )}
        </>
      )}

      {tab === 'stats' && (
        <div className="orb-panel">
          <div className="orb-stats">
            <div><b>{stats.n}</b><span>trades</span></div>
            <div><b>{stats.winRate.toFixed(0)}%</b><span>win rate</span></div>
            <div className={stats.totalR >= 0 ? 'pos' : 'neg'}>
              <b>{stats.totalR >= 0 ? '+' : ''}{stats.totalR.toFixed(1)}R</b><span>total</span>
            </div>
            <div className={stats.avgR >= 0 ? 'pos' : 'neg'}>
              <b>{stats.avgR >= 0 ? '+' : ''}{stats.avgR.toFixed(2)}R</b><span>expectancy</span>
            </div>
            <div><b>{stats.maxDD.toFixed(1)}R</b><span>max drawdown</span></div>
          </div>

          {journal.length === 0 ? (
            <p className="orb-empty">No practice trades yet — take a few in the Practice tab.</p>
          ) : (
            <>
              <div className="orb-journal-head">
                <h3>Trade history</h3>
                <button
                  onClick={() => {
                    if (window.confirm('Clear your entire practice journal?')) setJournal([])
                  }}
                >
                  Clear
                </button>
              </div>
              <div className="orb-table-wrap">
                <table className="orb-table">
                  <thead>
                    <tr>
                      <th>Date</th><th>Side</th><th>In</th><th>Out</th>
                      <th className="num">Entry</th><th className="num">Exit</th>
                      <th className="num">Pts</th><th className="num">R</th><th>Why</th>
                    </tr>
                  </thead>
                  <tbody>
                    {journal.map((t) => (
                      <tr key={t.id}>
                        <td>{t.date}</td>
                        <td><span className={`side ${t.side}`}>{t.side}</span></td>
                        <td>{t.entryTime}</td>
                        <td>{t.exitTime}</td>
                        <td className="num">{fmtPrice(t.entry)}</td>
                        <td className="num">{fmtPrice(t.exit)}</td>
                        <td className={`num ${t.points >= 0 ? 'pos' : 'neg'}`}>
                          {t.points >= 0 ? '+' : ''}{fmtPrice(t.points)}
                        </td>
                        <td className={`num ${t.r >= 0 ? 'pos' : 'neg'}`}>
                          {t.r >= 0 ? '+' : ''}{t.r.toFixed(2)}
                        </td>
                        <td>{t.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'edge' && (
        <div className="orb-panel">
          <p className="orb-lead">
            Run the mechanical rule over every session in {year} — entry at the range break,
            stop at the far side, target {settings.rMultiple || '—'}R — to see whether this
            setup actually has an edge before you trade it.
          </p>
          <button className="primary" onClick={runEdge} disabled={!days.length}>
            ▶ Backtest {days.length} sessions
          </button>

          {edge && (
            <>
              <div className="orb-stats">
                <div><b>{edge.summary.n}</b><span>trades</span></div>
                <div><b>{edge.noTrade}</b><span>no breakout</span></div>
                <div><b>{edge.summary.winRate.toFixed(0)}%</b><span>win rate</span></div>
                <div className={edge.summary.totalR >= 0 ? 'pos' : 'neg'}>
                  <b>{edge.summary.totalR >= 0 ? '+' : ''}{edge.summary.totalR.toFixed(1)}R</b><span>total</span>
                </div>
                <div className={edge.summary.avgR >= 0 ? 'pos' : 'neg'}>
                  <b>{edge.summary.avgR >= 0 ? '+' : ''}{edge.summary.avgR.toFixed(3)}R</b><span>per trade</span>
                </div>
                <div><b>{edge.summary.maxDD.toFixed(1)}R</b><span>max DD</span></div>
              </div>
              <EquityCurve trades={edge.trades} />
              <p className="orb-note">
                Fills assume the range level is available and, when a candle spans both stop
                and target, that the stop hit first. Costs and slippage are not modelled, so
                treat this as the optimistic-structure / pessimistic-fill case.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** Cumulative R curve for the backtested trades. */
function EquityCurve({ trades }) {
  const ref = useRef(null)
  useEffect(() => {
    const c = ref.current
    if (!c || !trades.length) return
    const dpr = window.devicePixelRatio || 1
    const w = c.clientWidth
    const h = 180
    c.width = w * dpr
    c.height = h * dpr
    c.style.height = h + 'px'
    const ctx = c.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    let eq = 0
    const pts = trades.map((t) => (eq += t.r))
    const lo = Math.min(0, ...pts)
    const hi = Math.max(0, ...pts)
    const span = hi - lo || 1
    const x = (i) => (i / Math.max(1, pts.length - 1)) * (w - 8) + 4
    const y = (v) => h - 12 - ((v - lo) / span) * (h - 24)

    ctx.strokeStyle = cssVar('--border', '#1e293b')
    ctx.beginPath()
    ctx.moveTo(0, y(0))
    ctx.lineTo(w, y(0))
    ctx.stroke()

    ctx.strokeStyle = pts.at(-1) >= 0 ? cssVar('--green', '#22c55e') : cssVar('--red', '#ef4444')
    ctx.lineWidth = 2
    ctx.beginPath()
    pts.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))))
    ctx.stroke()

    ctx.fillStyle = cssVar('--text-faint', '#64748b')
    ctx.font = '11px system-ui, sans-serif'
    ctx.fillText(`${hi.toFixed(1)}R`, 6, 12)
    ctx.fillText(`${lo.toFixed(1)}R`, 6, h - 4)
  }, [trades])
  return (
    <div className="orb-equity">
      <div className="orb-equity-title">Cumulative R</div>
      <canvas ref={ref} style={{ width: '100%' }} />
    </div>
  )
}
