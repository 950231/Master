import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ThemePicker from '../ThemePicker.jsx'
import './chart.css'

const BASE = import.meta.env.BASE_URL || '/'

const TIMEFRAMES = [
  { id: '1w', label: '1W', file: 'nifty/1w.json' },
  { id: '1d', label: '1D', file: 'nifty/1d.json' },
  { id: '1h', label: '1H', file: 'nifty/1h.json' },
  { id: '30m', label: '30m', file: 'nifty/30m.json' },
  { id: '15m', label: '15m', file: 'nifty/15m.json' },
  { id: '5m', label: '5m', file: null }, // per-year, chosen at runtime
]

const MIN_BARS = 20
const MAX_BARS = 3000

function fmtPrice(p) {
  return p.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(epochSec, tf) {
  // Bars are IST wall-clock; render them back in IST regardless of viewer TZ.
  const d = new Date((epochSec + 5.5 * 3600) * 1000)
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mo = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
  const yr = d.getUTCFullYear()
  if (tf === '1d' || tf === '1w') return `${dd} ${mo} ${yr}`
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mi = String(d.getUTCMinutes()).padStart(2, '0')
  return `${dd} ${mo} ${yr}, ${hh}:${mi}`
}

/** Simple moving average over the close series; null until enough history. */
function sma(closes, period) {
  const out = new Array(closes.length).fill(null)
  let sum = 0
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i]
    if (i >= period) sum -= closes[i - period]
    if (i >= period - 1) out[i] = sum / period
  }
  return out
}

function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

export default function NiftyChart() {
  const [tf, setTf] = useState('1d')
  const [year, setYear] = useState(null)
  const [years, setYears] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showMA, setShowMA] = useState(true)

  // Viewport over the bar array.
  const [view, setView] = useState({ start: 0, count: 200 })
  const [cursor, setCursor] = useState(null) // hovered bar index

  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const drag = useRef(null)
  const pinch = useRef(null)

  // Discover which years exist for the 5m timeframe.
  useEffect(() => {
    fetch(`${BASE}nifty/index.json`)
      .then((r) => r.json())
      .then((idx) => {
        setYears(idx.years || [])
        setYear((y) => y || (idx.years || []).at(-1) || null)
      })
      .catch(() => {})
  }, [])

  // Load the active timeframe (5m is chunked per year).
  useEffect(() => {
    const spec = TIMEFRAMES.find((t) => t.id === tf)
    const file = spec.file || (year ? `nifty/5m-${year}.json` : null)
    if (!file) return

    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`${BASE}${file}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((d) => {
        if (cancelled) return
        setData(d)
        // Land on the most recent bars.
        const count = Math.min(200, d.count)
        setView({ start: Math.max(0, d.count - count), count })
        setLoading(false)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e.message)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [tf, year])

  const ma20 = useMemo(() => (data && showMA ? sma(data.c, 20) : null), [data, showMA])
  const ma50 = useMemo(() => (data && showMA ? sma(data.c, 50) : null), [data, showMA])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !data) return
    const wrap = wrapRef.current
    const dpr = window.devicePixelRatio || 1
    const w = wrap.clientWidth
    const h = wrap.clientHeight
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = w + 'px'
      canvas.style.height = h + 'px'
    }
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    const padL = 8
    const padR = 68
    const padT = 12
    const padB = 26
    const plotW = w - padL - padR
    const plotH = h - padT - padB
    if (plotW <= 0 || plotH <= 0) return

    const start = Math.max(0, Math.floor(view.start))
    const end = Math.min(data.count, start + view.count)
    const n = end - start
    if (n <= 0) return

    // Price range across the visible window (include MA lines so they stay on-screen).
    let lo = Infinity
    let hi = -Infinity
    for (let i = start; i < end; i++) {
      if (data.l[i] < lo) lo = data.l[i]
      if (data.h[i] > hi) hi = data.h[i]
      if (ma50 && ma50[i] != null) {
        if (ma50[i] < lo) lo = ma50[i]
        if (ma50[i] > hi) hi = ma50[i]
      }
    }
    const span = hi - lo || 1
    lo -= span * 0.06
    hi += span * 0.06

    const barW = plotW / n
    const xOf = (i) => padL + (i - start) * barW + barW / 2
    const yOf = (p) => padT + ((hi - p) / (hi - lo)) * plotH

    const grid = cssVar('--border', '#1e293b')
    const text = cssVar('--text-faint', '#64748b')
    const up = cssVar('--green', '#22c55e')
    const down = cssVar('--red', '#ef4444')
    const accent = cssVar('--accent', '#38bdf8')

    // Horizontal grid + price axis
    ctx.strokeStyle = grid
    ctx.fillStyle = text
    ctx.lineWidth = 1
    ctx.font = '11px system-ui, sans-serif'
    ctx.textBaseline = 'middle'
    const ticks = 6
    for (let i = 0; i <= ticks; i++) {
      const p = lo + ((hi - lo) * i) / ticks
      const y = Math.round(yOf(p)) + 0.5
      ctx.beginPath()
      ctx.moveTo(padL, y)
      ctx.lineTo(padL + plotW, y)
      ctx.stroke()
      ctx.fillText(fmtPrice(p), padL + plotW + 6, y)
    }

    // Time axis labels. When the visible window spans less than ~2 days on an
    // intraday timeframe, dates would all repeat — show clock times instead.
    ctx.textBaseline = 'top'
    const spanSec = data.t[end - 1] - data.t[start]
    const intraday = tf !== '1d' && tf !== '1w'
    const useClock = intraday && spanSec < 2 * 86400
    const labelEvery = Math.max(1, Math.floor(n / 6))
    for (let i = start; i < end; i += labelEvery) {
      const x = xOf(i)
      const full = fmtDate(data.t[i], tf)
      const label = useClock ? (full.split(', ')[1] ?? full) : full.split(',')[0]
      const tw = ctx.measureText(label).width
      if (x - tw / 2 > padL && x + tw / 2 < padL + plotW) {
        ctx.fillText(label, x - tw / 2, padT + plotH + 6)
      }
    }

    // Candles. Below ~3px per bar we draw a high/low line only — far faster
    // and visually cleaner than sub-pixel bodies.
    const bodyW = Math.max(1, Math.min(barW * 0.7, 14))
    const thin = barW < 3
    for (let i = start; i < end; i++) {
      const o = data.o[i]
      const c = data.c[i]
      const rising = c >= o
      const col = rising ? up : down
      const x = xOf(i)
      ctx.strokeStyle = col
      ctx.fillStyle = col
      ctx.beginPath()
      ctx.moveTo(Math.round(x) + 0.5, yOf(data.h[i]))
      ctx.lineTo(Math.round(x) + 0.5, yOf(data.l[i]))
      ctx.stroke()
      if (!thin) {
        const yo = yOf(o)
        const yc = yOf(c)
        const top = Math.min(yo, yc)
        const hgt = Math.max(1, Math.abs(yc - yo))
        ctx.fillRect(x - bodyW / 2, top, bodyW, hgt)
      }
    }

    // Moving averages
    const drawMA = (series, color) => {
      if (!series) return
      ctx.strokeStyle = color
      ctx.lineWidth = 1.5
      ctx.beginPath()
      let started = false
      for (let i = start; i < end; i++) {
        const v = series[i]
        if (v == null) continue
        const x = xOf(i)
        const y = yOf(v)
        if (!started) {
          ctx.moveTo(x, y)
          started = true
        } else ctx.lineTo(x, y)
      }
      ctx.stroke()
      ctx.lineWidth = 1
    }
    drawMA(ma20, accent)
    drawMA(ma50, '#f59e0b')

    // Crosshair
    if (cursor != null && cursor >= start && cursor < end) {
      const x = xOf(cursor)
      ctx.strokeStyle = text
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(x, padT)
      ctx.lineTo(x, padT + plotH)
      ctx.stroke()
      ctx.setLineDash([])
    }
  }, [data, view, cursor, tf, ma20, ma50])

  useEffect(() => {
    draw()
  }, [draw])

  useEffect(() => {
    const onResize = () => draw()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [draw])

  // Redraw when the theme changes (canvas colours come from CSS variables).
  useEffect(() => {
    const obs = new MutationObserver(() => draw())
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [draw])

  // ---- interaction ----
  const barIndexAt = useCallback(
    (clientX) => {
      const wrap = wrapRef.current
      if (!wrap || !data) return null
      const rect = wrap.getBoundingClientRect()
      const padL = 8
      const padR = 68
      const plotW = rect.width - padL - padR
      const rel = clientX - rect.left - padL
      if (rel < 0 || rel > plotW) return null
      const i = Math.floor(view.start + (rel / plotW) * view.count)
      return Math.max(0, Math.min(data.count - 1, i))
    },
    [data, view],
  )

  const zoomBy = useCallback(
    (factor, anchorIdx) => {
      if (!data) return
      setView((v) => {
        const count = Math.round(
          Math.max(MIN_BARS, Math.min(MAX_BARS, Math.min(data.count, v.count * factor))),
        )
        const anchor = anchorIdx ?? v.start + v.count / 2
        const ratio = (anchor - v.start) / v.count
        let start = Math.round(anchor - ratio * count)
        start = Math.max(0, Math.min(data.count - count, start))
        return { start, count }
      })
    },
    [data],
  )

  function onWheel(e) {
    if (!data) return
    e.preventDefault()
    zoomBy(e.deltaY > 0 ? 1.15 : 1 / 1.15, barIndexAt(e.clientX))
  }

  function onPointerDown(e) {
    if (e.pointerType === 'touch' && e.isPrimary === false) return
    drag.current = { x: e.clientX, start: view.start }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  function onPointerMove(e) {
    setCursor(barIndexAt(e.clientX))
    if (!drag.current || !data) return
    const wrap = wrapRef.current
    const plotW = wrap.clientWidth - 8 - 68
    const dxBars = ((e.clientX - drag.current.x) / plotW) * view.count
    let start = Math.round(drag.current.start - dxBars)
    start = Math.max(0, Math.min(data.count - view.count, start))
    setView((v) => ({ ...v, start }))
  }

  function onPointerUp() {
    drag.current = null
  }

  // Pinch-to-zoom for touch devices.
  function onTouchStart(e) {
    if (e.touches.length === 2) {
      drag.current = null
      const [a, b] = e.touches
      pinch.current = {
        dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        count: view.count,
        anchor: barIndexAt((a.clientX + b.clientX) / 2),
      }
    }
  }

  function onTouchMove(e) {
    if (e.touches.length === 2 && pinch.current && data) {
      e.preventDefault()
      const [a, b] = e.touches
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
      const factor = pinch.current.dist / (dist || 1)
      const count = Math.round(
        Math.max(MIN_BARS, Math.min(MAX_BARS, Math.min(data.count, pinch.current.count * factor))),
      )
      const anchor = pinch.current.anchor ?? view.start + view.count / 2
      setView((v) => {
        const ratio = (anchor - v.start) / v.count
        let start = Math.round(anchor - ratio * count)
        start = Math.max(0, Math.min(data.count - count, start))
        return { start, count }
      })
    }
  }

  function onTouchEnd(e) {
    if (e.touches.length < 2) pinch.current = null
  }

  const hovered = data && cursor != null && cursor < data.count ? cursor : null
  const last = data ? data.count - 1 : null
  const readIdx = hovered ?? last

  const change =
    data && readIdx != null && readIdx > 0
      ? data.c[readIdx] - data.c[readIdx - 1]
      : 0
  const changePct =
    data && readIdx != null && readIdx > 0 && data.c[readIdx - 1]
      ? (change / data.c[readIdx - 1]) * 100
      : 0

  return (
    <div className="chart-app">
      <header className="ch-header">
        <div className="ch-left">
          <a href="#/" className="back-link">← Apps</a>
          <ThemePicker />
        </div>
        <h1>NIFTY 50</h1>
        <div className="ch-head-spacer" />
      </header>

      <div className="ch-toolbar">
        <div className="ch-tfs">
          {TIMEFRAMES.map((t) => (
            <button
              key={t.id}
              className={`ch-tf ${tf === t.id ? 'active' : ''}`}
              onClick={() => setTf(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tf === '5m' && years.length > 0 && (
          <select
            className="ch-year"
            value={year || ''}
            onChange={(e) => setYear(e.target.value)}
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        )}

        <button
          className={`ch-toggle ${showMA ? 'active' : ''}`}
          onClick={() => setShowMA((v) => !v)}
        >
          MA
        </button>
      </div>

      {data && readIdx != null && (
        <div className="ch-readout">
          <span className="ch-date">{fmtDate(data.t[readIdx], tf)}</span>
          <span>O <b>{fmtPrice(data.o[readIdx])}</b></span>
          <span>H <b>{fmtPrice(data.h[readIdx])}</b></span>
          <span>L <b>{fmtPrice(data.l[readIdx])}</b></span>
          <span>C <b>{fmtPrice(data.c[readIdx])}</b></span>
          <span className={change >= 0 ? 'tone-pos' : 'tone-neg'}>
            {change >= 0 ? '+' : ''}{fmtPrice(change)} ({changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%)
          </span>
        </div>
      )}

      <div
        className="ch-canvas-wrap"
        ref={wrapRef}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          onPointerUp()
          setCursor(null)
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <canvas ref={canvasRef} />
        {loading && <div className="ch-overlay">Loading candles…</div>}
        {error && <div className="ch-overlay error">Could not load data ({error})</div>}
      </div>

      <div className="ch-footer">
        <div className="ch-zoom">
          <button onClick={() => zoomBy(1 / 1.4)}>＋</button>
          <button onClick={() => zoomBy(1.4)}>−</button>
          <button
            onClick={() =>
              data && setView({ start: Math.max(0, data.count - 200), count: Math.min(200, data.count) })
            }
          >
            Reset
          </button>
        </div>
        <span className="ch-hint">
          {data ? `${data.count.toLocaleString('en-IN')} bars · drag to pan · pinch/scroll to zoom` : ''}
        </span>
      </div>
    </div>
  )
}
