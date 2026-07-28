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

// Replay speeds expressed as milliseconds between candles.
const SPEEDS = [
  { label: '0.25×', ms: 2000 },
  { label: '0.5×', ms: 1000 },
  { label: '1×', ms: 500 },
  { label: '2×', ms: 250 },
  { label: '5×', ms: 100 },
  { label: '10×', ms: 40 },
]

const MIN_BARS = 20
const MAX_BARS = 3000
const PAD = { l: 8, r: 68, t: 12, b: 26 }

const fmtPrice = (p) =>
  p.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

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

/** Simple moving average over closes; null until enough history. */
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

const cssVar = (name, fallback) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback

export default function NiftyChart() {
  const [tf, setTf] = useState('1d')
  const [year, setYear] = useState(null)
  const [years, setYears] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showMA, setShowMA] = useState(true)

  const [view, setView] = useState({ start: 0, count: 200 })
  const [cursor, setCursor] = useState(null)

  // Replay: `at` is the index of the last revealed candle.
  const [replay, setReplay] = useState({ active: false, at: 0, playing: false, ms: 500 })

  const canvasRef = useRef(null)
  const wrapRef = useRef(null)

  // Mirrors of state for use inside native (non-React) event listeners, which
  // would otherwise capture stale values.
  const viewRef = useRef(view)
  const dataRef = useRef(data)
  const replayRef = useRef(replay)
  useEffect(() => void (viewRef.current = view), [view])
  useEffect(() => void (dataRef.current = data), [data])
  useEffect(() => void (replayRef.current = replay), [replay])

  useEffect(() => {
    fetch(`${BASE}nifty/index.json`)
      .then((r) => r.json())
      .then((idx) => {
        setYears(idx.years || [])
        setYear((y) => y || (idx.years || []).at(-1) || null)
      })
      .catch(() => {})
  }, [])

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
        const count = Math.min(200, d.count)
        setView({ start: Math.max(0, d.count - count), count })
        setReplay((r) => ({ ...r, active: false, playing: false, at: 0 }))
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

  /** Last bar index that should be visible (replay hides the future). */
  const revealEnd = replay.active && data ? Math.min(data.count, replay.at + 1) : data?.count ?? 0

  // ---------------- drawing ----------------
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap || !data) return

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

    const start = Math.max(0, Math.floor(view.start))
    const end = Math.min(revealEnd, start + view.count)
    const drawN = end - start
    const slotN = view.count // keep bar width stable even when replay hides bars

    const grid = cssVar('--border', '#1e293b')
    const text = cssVar('--text-faint', '#64748b')
    const up = cssVar('--green', '#22c55e')
    const down = cssVar('--red', '#ef4444')
    const accent = cssVar('--accent', '#38bdf8')

    const barW = plotW / slotN
    const xOf = (i) => PAD.l + (i - start) * barW + barW / 2

    let lo = Infinity
    let hi = -Infinity
    for (let i = start; i < end; i++) {
      if (data.l[i] < lo) lo = data.l[i]
      if (data.h[i] > hi) hi = data.h[i]
      if (ma50 && ma50[i] != null) {
        lo = Math.min(lo, ma50[i])
        hi = Math.max(hi, ma50[i])
      }
    }
    if (!isFinite(lo) || !isFinite(hi)) return
    const span = hi - lo || 1
    lo -= span * 0.06
    hi += span * 0.06
    const yOf = (p) => PAD.t + ((hi - p) / (hi - lo)) * plotH

    // grid + price axis
    ctx.strokeStyle = grid
    ctx.fillStyle = text
    ctx.lineWidth = 1
    ctx.font = '11px system-ui, sans-serif'
    ctx.textBaseline = 'middle'
    for (let i = 0; i <= 6; i++) {
      const p = lo + ((hi - lo) * i) / 6
      const y = Math.round(yOf(p)) + 0.5
      ctx.beginPath()
      ctx.moveTo(PAD.l, y)
      ctx.lineTo(PAD.l + plotW, y)
      ctx.stroke()
      ctx.fillText(fmtPrice(p), PAD.l + plotW + 6, y)
    }

    // time axis — switch to clock times once the window is under ~2 days
    ctx.textBaseline = 'top'
    const spanSec = drawN > 1 ? data.t[end - 1] - data.t[start] : 0
    const intraday = tf !== '1d' && tf !== '1w'
    const useClock = intraday && spanSec < 2 * 86400
    const every = Math.max(1, Math.floor(slotN / 6))
    for (let i = start; i < end; i += every) {
      const x = xOf(i)
      const full = fmtDate(data.t[i], tf)
      const label = useClock ? (full.split(', ')[1] ?? full) : full.split(',')[0]
      const tw = ctx.measureText(label).width
      if (x - tw / 2 > PAD.l && x + tw / 2 < PAD.l + plotW) ctx.fillText(label, x - tw / 2, PAD.t + plotH + 6)
    }

    // candles
    const bodyW = Math.max(1, Math.min(barW * 0.7, 14))
    const thin = barW < 3
    for (let i = start; i < end; i++) {
      const o = data.o[i]
      const c = data.c[i]
      const col = c >= o ? up : down
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
        ctx.fillRect(x - bodyW / 2, Math.min(yo, yc), bodyW, Math.max(1, Math.abs(yc - yo)))
      }
    }

    // moving averages
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
        started ? ctx.lineTo(x, y) : (ctx.moveTo(x, y), (started = true))
      }
      ctx.stroke()
      ctx.lineWidth = 1
    }
    drawMA(ma20, accent)
    drawMA(ma50, '#f59e0b')

    // replay edge marker — the "now" line
    if (replay.active && end > start) {
      const x = xOf(end - 1) + barW / 2
      ctx.strokeStyle = accent
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.moveTo(x, PAD.t)
      ctx.lineTo(x, PAD.t + plotH)
      ctx.stroke()
      ctx.setLineDash([])
    }

    // crosshair
    if (cursor != null && cursor >= start && cursor < end) {
      const x = xOf(cursor)
      ctx.strokeStyle = text
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(x, PAD.t)
      ctx.lineTo(x, PAD.t + plotH)
      ctx.stroke()
      ctx.setLineDash([])
    }
  }, [data, view, cursor, tf, ma20, ma50, replay.active, revealEnd])

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

  // ---------------- interaction ----------------
  // Native listeners (not React synthetic) so wheel/touch can call
  // preventDefault, and refs so handlers never see stale view/data.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return

    const plotWidth = () => el.clientWidth - PAD.l - PAD.r

    const idxAt = (clientX) => {
      const d = dataRef.current
      if (!d) return null
      const rect = el.getBoundingClientRect()
      const rel = clientX - rect.left - PAD.l
      const pw = plotWidth()
      if (rel < 0 || rel > pw) return null
      const v = viewRef.current
      return Math.max(0, Math.min(d.count - 1, Math.floor(v.start + (rel / pw) * v.count)))
    }

    const clampStart = (start, count) => {
      const d = dataRef.current
      if (!d) return 0
      return Math.max(0, Math.min(Math.max(0, d.count - count), Math.round(start)))
    }

    const zoom = (factor, anchorIdx) => {
      const d = dataRef.current
      if (!d) return
      const v = viewRef.current
      const count = Math.round(
        Math.max(MIN_BARS, Math.min(MAX_BARS, Math.min(d.count, v.count * factor))),
      )
      const anchor = anchorIdx ?? v.start + v.count / 2
      const ratio = (anchor - v.start) / v.count
      setView({ start: clampStart(anchor - ratio * count, count), count })
    }

    let drag = null
    const pointers = new Map()
    let pinch = null

    const onPointerDown = (e) => {
      pointers.set(e.pointerId, e)
      if (pointers.size === 2) {
        // second finger down -> start pinch, cancel any pan
        drag = null
        const [a, b] = [...pointers.values()]
        pinch = {
          dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1,
          count: viewRef.current.count,
          anchor: idxAt((a.clientX + b.clientX) / 2),
        }
        return
      }
      if (pointers.size > 2) return
      // In replay mode a tap sets the replay position instead of panning.
      if (replayRef.current.active && e.shiftKey !== true) {
        const i = idxAt(e.clientX)
        if (i != null) setReplay((r) => ({ ...r, at: i, playing: false }))
      }
      drag = { x: e.clientX, start: viewRef.current.start, moved: false }
      // Capture can throw for synthetic/already-released pointers; a failed
      // capture just means we fall back to normal event bubbling.
      try {
        el.setPointerCapture?.(e.pointerId)
      } catch {
        /* ignore */
      }
    }

    const onPointerMove = (e) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, e)

      if (pinch && pointers.size === 2) {
        e.preventDefault()
        const d = dataRef.current
        if (!d) return
        const [a, b] = [...pointers.values()]
        const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1
        const count = Math.round(
          Math.max(MIN_BARS, Math.min(MAX_BARS, Math.min(d.count, pinch.count * (pinch.dist / dist)))),
        )
        const v = viewRef.current
        const anchor = pinch.anchor ?? v.start + v.count / 2
        const ratio = (anchor - v.start) / v.count
        setView({ start: clampStart(anchor - ratio * count, count), count })
        return
      }

      setCursor(idxAt(e.clientX))

      if (!drag) return
      e.preventDefault()
      const v = viewRef.current
      const dxBars = ((e.clientX - drag.x) / plotWidth()) * v.count
      if (Math.abs(e.clientX - drag.x) > 2) drag.moved = true
      setView({ start: clampStart(drag.start - dxBars, v.count), count: v.count })
    }

    const endPointer = (e) => {
      pointers.delete(e.pointerId)
      if (pointers.size < 2) pinch = null
      if (pointers.size === 0) drag = null
      try {
        el.releasePointerCapture?.(e.pointerId)
      } catch {
        /* ignore */
      }
    }

    const onWheel = (e) => {
      e.preventDefault()
      zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, idxAt(e.clientX))
    }

    const onLeave = () => setCursor(null)

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove, { passive: false })
    el.addEventListener('pointerup', endPointer)
    el.addEventListener('pointercancel', endPointer)
    el.addEventListener('pointerleave', onLeave)
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', endPointer)
      el.removeEventListener('pointercancel', endPointer)
      el.removeEventListener('pointerleave', onLeave)
      el.removeEventListener('wheel', onWheel)
    }
  }, [])

  const zoomBtn = (factor) => {
    if (!data) return
    const v = viewRef.current
    const count = Math.round(
      Math.max(MIN_BARS, Math.min(MAX_BARS, Math.min(data.count, v.count * factor))),
    )
    const anchor = v.start + v.count / 2
    const ratio = (anchor - v.start) / v.count
    const start = Math.max(0, Math.min(Math.max(0, data.count - count), Math.round(anchor - ratio * count)))
    setView({ start, count })
  }

  // ---------------- replay engine ----------------
  const stepReplay = useCallback(
    (delta) => {
      const d = dataRef.current
      if (!d) return
      setReplay((r) => {
        const at = Math.max(0, Math.min(d.count - 1, r.at + delta))
        return { ...r, at, playing: at >= d.count - 1 ? false : r.playing }
      })
    },
    [],
  )

  // Advance one candle per tick while playing.
  useEffect(() => {
    if (!replay.active || !replay.playing || !data) return
    const id = setInterval(() => {
      setReplay((r) => {
        if (r.at >= data.count - 1) return { ...r, playing: false }
        return { ...r, at: r.at + 1 }
      })
    }, replay.ms)
    return () => clearInterval(id)
  }, [replay.active, replay.playing, replay.ms, data])

  // Keep the replay edge in view as it advances.
  useEffect(() => {
    if (!replay.active || !data) return
    setView((v) => {
      const target = replay.at
      const rightEdge = v.start + v.count - 1
      if (target > rightEdge - 2) {
        // scroll so the newest candle sits ~75% across the viewport
        const start = Math.max(0, Math.min(data.count - v.count, Math.round(target - v.count * 0.75)))
        return start === v.start ? v : { ...v, start }
      }
      if (target < v.start) {
        return { ...v, start: Math.max(0, Math.round(target - v.count * 0.25)) }
      }
      return v
    })
  }, [replay.at, replay.active, data])

  function toggleReplay() {
    if (!data) return
    if (replay.active) {
      setReplay((r) => ({ ...r, active: false, playing: false }))
      setView((v) => ({ ...v, start: Math.max(0, data.count - v.count) }))
    } else {
      // Start a bit into the current window so there is context on the left.
      const at = Math.max(0, Math.min(data.count - 1, Math.round(view.start + view.count * 0.35)))
      setReplay((r) => ({ ...r, active: true, playing: false, at }))
    }
  }

  // Keyboard shortcuts: space = play/pause, arrows = step.
  useEffect(() => {
    if (!replay.active) return
    const onKey = (e) => {
      if (e.key === ' ') {
        e.preventDefault()
        setReplay((r) => ({ ...r, playing: !r.playing }))
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        stepReplay(1)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        stepReplay(-1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [replay.active, stepReplay])

  // ---------------- readout ----------------
  const lastVisible = revealEnd - 1
  const hovered =
    data && cursor != null && cursor <= lastVisible && cursor >= 0 ? cursor : null
  const readIdx = hovered ?? (lastVisible >= 0 ? lastVisible : null)
  const change = data && readIdx > 0 ? data.c[readIdx] - data.c[readIdx - 1] : 0
  const changePct =
    data && readIdx > 0 && data.c[readIdx - 1] ? (change / data.c[readIdx - 1]) * 100 : 0

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
          <select className="ch-year" value={year || ''} onChange={(e) => setYear(e.target.value)}>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        )}

        <button className={`ch-toggle ${showMA ? 'active' : ''}`} onClick={() => setShowMA((v) => !v)}>
          MA
        </button>
        <button className={`ch-toggle replay ${replay.active ? 'active' : ''}`} onClick={toggleReplay}>
          ⏵ Replay
        </button>
      </div>

      {replay.active && data && (
        <div className="ch-replay">
          <div className="ch-replay-controls">
            <button onClick={() => stepReplay(-1)} title="Previous candle">⏮</button>
            <button
              className="play"
              onClick={() => setReplay((r) => ({ ...r, playing: !r.playing }))}
              title="Play / pause (space)"
            >
              {replay.playing ? '⏸' : '▶'}
            </button>
            <button onClick={() => stepReplay(1)} title="Next candle">⏭</button>
          </div>

          <div className="ch-speeds">
            {SPEEDS.map((s) => (
              <button
                key={s.label}
                className={`ch-speed ${replay.ms === s.ms ? 'active' : ''}`}
                onClick={() => setReplay((r) => ({ ...r, ms: s.ms }))}
              >
                {s.label}
              </button>
            ))}
          </div>

          <input
            className="ch-scrub"
            type="range"
            min={0}
            max={Math.max(0, data.count - 1)}
            value={replay.at}
            onChange={(e) => setReplay((r) => ({ ...r, at: +e.target.value, playing: false }))}
          />
          <span className="ch-replay-pos">
            {(replay.at + 1).toLocaleString('en-IN')} / {data.count.toLocaleString('en-IN')}
          </span>
        </div>
      )}

      {data && readIdx != null && readIdx >= 0 && (
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

      <div className="ch-canvas-wrap" ref={wrapRef}>
        <canvas ref={canvasRef} />
        {loading && <div className="ch-overlay">Loading candles…</div>}
        {error && <div className="ch-overlay error">Could not load data ({error})</div>}
      </div>

      <div className="ch-footer">
        <div className="ch-zoom">
          <button onClick={() => zoomBtn(1 / 1.4)}>＋</button>
          <button onClick={() => zoomBtn(1.4)}>−</button>
          <button
            onClick={() =>
              data && setView({ start: Math.max(0, data.count - 200), count: Math.min(200, data.count) })
            }
          >
            Reset
          </button>
        </div>
        <span className="ch-hint">
          {replay.active
            ? 'Tap a candle to jump · space = play/pause · ← → step'
            : data
              ? `${data.count.toLocaleString('en-IN')} bars · drag to pan · pinch/scroll to zoom`
              : ''}
        </span>
      </div>
    </div>
  )
}
