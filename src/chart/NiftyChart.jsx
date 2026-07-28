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

const TOOLS = [
  { id: 'cursor', icon: '✛', name: 'Cursor / pan' },
  { id: 'trend', icon: '╱', name: 'Trend line' },
  { id: 'hline', icon: '─', name: 'Horizontal line' },
  { id: 'rect', icon: '▭', name: 'Rectangle' },
  { id: 'fib', icon: '≡', name: 'Fib retracement' },
]

const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]

const MIN_BARS = 20
const MAX_BARS = 3000
// Right gutter holds the price axis; bottom strip holds the time axis.
const PAD = { l: 8, r: 72, t: 12, b: 30 }

const fmtPrice = (p) =>
  p.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Bars are IST wall-clock; render them back in IST regardless of viewer TZ. */
function istParts(epochSec) {
  const d = new Date((epochSec + 5.5 * 3600) * 1000)
  return {
    dd: String(d.getUTCDate()).padStart(2, '0'),
    mon: d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }),
    yr: d.getUTCFullYear(),
    hh: String(d.getUTCHours()).padStart(2, '0'),
    mi: String(d.getUTCMinutes()).padStart(2, '0'),
    dayKey: Math.floor((epochSec + 5.5 * 3600) / 86400),
  }
}

function fmtDate(epochSec, tf) {
  const p = istParts(epochSec)
  if (tf === '1d' || tf === '1w') return `${p.dd} ${p.mon} ${p.yr}`
  return `${p.dd} ${p.mon} ${p.yr}, ${p.hh}:${p.mi}`
}

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

const uid = () => `d${Date.now()}${Math.random().toString(36).slice(2, 7)}`

export default function NiftyChart() {
  const [tf, setTf] = useState('1d')
  const [year, setYear] = useState(null)
  const [years, setYears] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showMA, setShowMA] = useState(true)

  const [view, setView] = useState({ start: 0, count: 200 })
  const [cursor, setCursor] = useState(null) // {i, price, x, y}
  // `picking` is the TradingView-style 'choose your start bar' phase.
  const [replay, setReplay] = useState({ active: false, at: 0, playing: false, ms: 500, picking: false })

  const [tool, setTool] = useState('cursor')
  const [drawings, setDrawings] = useState([])
  const [pending, setPending] = useState(null) // in-progress drawing
  const [selected, setSelected] = useState(null)

  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const scaleRef = useRef(null) // screen<->data mapping produced by draw()

  // Mirrors for native listeners, which would otherwise close over stale state.
  const viewRef = useRef(view)
  const dataRef = useRef(data)
  const replayRef = useRef(replay)
  const toolRef = useRef(tool)
  const pendingRef = useRef(pending)
  useEffect(() => void (viewRef.current = view), [view])
  useEffect(() => void (dataRef.current = data), [data])
  useEffect(() => void (replayRef.current = replay), [replay])
  useEffect(() => void (toolRef.current = tool), [tool])
  useEffect(() => void (pendingRef.current = pending), [pending])

  const storeKey = `nifty.drawings.${tf}${tf === '5m' ? '.' + year : ''}`

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
        setReplay((r) => ({ ...r, active: false, playing: false, picking: false, at: 0 }))
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

  // Drawings are stored per timeframe so they stay anchored to the right bars.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storeKey)
      setDrawings(raw ? JSON.parse(raw) : [])
    } catch {
      setDrawings([])
    }
    setSelected(null)
    setPending(null)
  }, [storeKey])

  useEffect(() => {
    try {
      localStorage.setItem(storeKey, JSON.stringify(drawings))
    } catch {
      /* storage full — keep them in memory */
    }
  }, [drawings, storeKey])

  const ma20 = useMemo(() => (data && showMA ? sma(data.c, 20) : null), [data, showMA])
  const ma50 = useMemo(() => (data && showMA ? sma(data.c, 50) : null), [data, showMA])

  const revealEnd =
    replay.active && !replay.picking && data ? Math.min(data.count, replay.at + 1) : data?.count ?? 0

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
    const slotN = view.count

    const grid = cssVar('--border', '#1e293b')
    const gridLight = cssVar('--border-light', '#263449')
    const text = cssVar('--text-faint', '#64748b')
    const textStrong = cssVar('--text', '#e2e8f0')
    const panel = cssVar('--bg-elevated', '#0f172a')
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
    const priceAt = (y) => hi - ((y - PAD.t) / plotH) * (hi - lo)
    const idxAtX = (x) => Math.round(view.start + (x - PAD.l - barW / 2) / barW)

    scaleRef.current = { start, end, barW, lo, hi, plotW, plotH, xOf, yOf, priceAt, idxAtX, w, h }

    // ---- price grid + axis ----
    ctx.font = '11px system-ui, sans-serif'
    ctx.lineWidth = 1
    ctx.textBaseline = 'middle'
    for (let i = 0; i <= 6; i++) {
      const p = lo + ((hi - lo) * i) / 6
      const y = Math.round(yOf(p)) + 0.5
      ctx.strokeStyle = grid
      ctx.beginPath()
      ctx.moveTo(PAD.l, y)
      ctx.lineTo(PAD.l + plotW, y)
      ctx.stroke()
      ctx.fillStyle = text
      ctx.fillText(fmtPrice(p), PAD.l + plotW + 8, y)
    }

    // ---- time axis: labels sized to fit, with day breaks called out ----
    const intraday = tf !== '1d' && tf !== '1w'
    const axisY = PAD.t + plotH
    ctx.strokeStyle = gridLight
    ctx.beginPath()
    ctx.moveTo(PAD.l, axisY + 0.5)
    ctx.lineTo(PAD.l + plotW, axisY + 0.5)
    ctx.stroke()

    ctx.textBaseline = 'top'
    const minGapPx = 62
    const step = Math.max(1, Math.ceil(minGapPx / barW))
    let prevDay = end > start ? istParts(data.t[Math.max(start - 1, 0)]).dayKey : null
    // Track the last drawn label so ticks can never overlap — on daily bars
    // every candle is a new day, so day breaks alone are not a safe anchor.
    let lastLabelX = -Infinity
    for (let i = start; i < end; i++) {
      const p = istParts(data.t[i])
      const newDay = p.dayKey !== prevDay
      prevDay = p.dayKey
      // Day boundaries are preferred anchors on intraday charts; otherwise
      // fall back to a regular step.
      const candidate = (intraday && newDay) || (i - start) % step === 0
      if (!candidate) continue

      const x = xOf(i)
      if (x < PAD.l + 12 || x > PAD.l + plotW - 12) continue
      if (x - lastLabelX < minGapPx) continue
      lastLabelX = x

      const label = !intraday
        ? `${p.dd} ${p.mon}`
        : newDay
          ? `${p.dd} ${p.mon}`
          : `${p.hh}:${p.mi}`

      // vertical grid line + tick
      ctx.strokeStyle = newDay && intraday ? gridLight : grid
      ctx.beginPath()
      ctx.moveTo(Math.round(x) + 0.5, PAD.t)
      ctx.lineTo(Math.round(x) + 0.5, axisY + 4)
      ctx.stroke()

      ctx.fillStyle = newDay && intraday ? textStrong : text
      const tw = ctx.measureText(label).width
      ctx.fillText(label, x - tw / 2, axisY + 7)
    }

    // ---- candles ----
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

    // ---- moving averages ----
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

    // ---- last price line + tag (TradingView-style) ----
    if (end > start) {
      const li = end - 1
      const lp = data.c[li]
      const ly = yOf(lp)
      const rising = lp >= data.o[li]
      const col = rising ? up : down
      ctx.strokeStyle = col
      ctx.setLineDash([2, 3])
      ctx.beginPath()
      ctx.moveTo(PAD.l, ly)
      ctx.lineTo(PAD.l + plotW, ly)
      ctx.stroke()
      ctx.setLineDash([])
      const label = fmtPrice(lp)
      const tw = ctx.measureText(label).width
      ctx.fillStyle = col
      ctx.fillRect(PAD.l + plotW + 2, ly - 9, tw + 12, 18)
      ctx.fillStyle = '#04121d'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, PAD.l + plotW + 8, ly)
    }

    // ---- user drawings ----
    const all = pending ? [...drawings, pending] : drawings
    for (const d of all) {
      const isSel = d.id === selected
      const color = d.color || accent
      ctx.strokeStyle = color
      ctx.lineWidth = isSel ? 2.5 : 1.5
      const x1 = xOf(d.p1.i)
      const y1 = yOf(d.p1.price)
      const x2 = d.p2 ? xOf(d.p2.i) : x1
      const y2 = d.p2 ? yOf(d.p2.price) : y1

      if (d.type === 'hline') {
        ctx.beginPath()
        ctx.moveTo(PAD.l, y1)
        ctx.lineTo(PAD.l + plotW, y1)
        ctx.stroke()
        const label = fmtPrice(d.p1.price)
        const tw = ctx.measureText(label).width
        ctx.fillStyle = color
        ctx.fillRect(PAD.l + plotW + 2, y1 - 9, tw + 12, 18)
        ctx.fillStyle = '#04121d'
        ctx.textBaseline = 'middle'
        ctx.fillText(label, PAD.l + plotW + 8, y1)
      } else if (d.type === 'trend') {
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
      } else if (d.type === 'rect') {
        ctx.fillStyle = color + '22'
        ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1))
        ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1))
      } else if (d.type === 'fib') {
        const pTop = Math.max(d.p1.price, d.p2?.price ?? d.p1.price)
        const pBot = Math.min(d.p1.price, d.p2?.price ?? d.p1.price)
        const xa = Math.min(x1, x2)
        const xb = Math.max(x1, x2)
        ctx.textBaseline = 'bottom'
        FIB_LEVELS.forEach((lv, k) => {
          const price = pTop - (pTop - pBot) * lv
          const y = yOf(price)
          ctx.strokeStyle = k === 0 || k === FIB_LEVELS.length - 1 ? color : color + 'aa'
          ctx.setLineDash(k === 0 || k === FIB_LEVELS.length - 1 ? [] : [4, 4])
          ctx.beginPath()
          ctx.moveTo(xa, y)
          ctx.lineTo(Math.max(xb, xa + 40), y)
          ctx.stroke()
          ctx.setLineDash([])
          ctx.fillStyle = color
          ctx.fillText(`${(lv * 100).toFixed(1)}%  ${fmtPrice(price)}`, xa + 4, y - 2)
        })
        ctx.textBaseline = 'middle'
      }

      if (isSel && d.p2) {
        ctx.fillStyle = color
        for (const [hx, hy] of [
          [x1, y1],
          [x2, y2],
        ]) {
          ctx.beginPath()
          ctx.arc(hx, hy, 4, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      ctx.lineWidth = 1
    }

    // ---- replay start-picker: red line that follows the cursor ----
    if (replay.active && replay.picking && cursor?.x != null) {
      const cx = Math.max(PAD.l, Math.min(PAD.l + plotW, cursor.x))
      ctx.strokeStyle = down
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(cx, PAD.t)
      ctx.lineTo(cx, PAD.t + plotH)
      ctx.stroke()
      ctx.lineWidth = 1
      const msg = 'Click to start replay here'
      ctx.font = 'bold 12px system-ui, sans-serif'
      const mw = ctx.measureText(msg).width
      const bx = Math.max(PAD.l + 4, Math.min(cx + 8, PAD.l + plotW - mw - 14))
      ctx.fillStyle = down
      ctx.fillRect(bx, PAD.t + 6, mw + 12, 22)
      ctx.fillStyle = '#fff'
      ctx.textBaseline = 'middle'
      ctx.fillText(msg, bx + 6, PAD.t + 17)
      ctx.font = '11px system-ui, sans-serif'
    }

    // ---- replay "now" marker ----
    if (replay.active && !replay.picking && end > start) {
      const x = xOf(end - 1) + barW / 2
      ctx.strokeStyle = accent
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.moveTo(x, PAD.t)
      ctx.lineTo(x, PAD.t + plotH)
      ctx.stroke()
      ctx.setLineDash([])
    }

    // ---- crosshair with axis tags ----
    if (cursor && cursor.x != null) {
      const cx = Math.max(PAD.l, Math.min(PAD.l + plotW, cursor.x))
      const cy = Math.max(PAD.t, Math.min(PAD.t + plotH, cursor.y))
      ctx.strokeStyle = text
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(cx, PAD.t)
      ctx.lineTo(cx, PAD.t + plotH)
      ctx.moveTo(PAD.l, cy)
      ctx.lineTo(PAD.l + plotW, cy)
      ctx.stroke()
      ctx.setLineDash([])

      // price tag on the right axis
      const pLabel = fmtPrice(priceAt(cy))
      const pw = ctx.measureText(pLabel).width
      ctx.fillStyle = gridLight
      ctx.fillRect(PAD.l + plotW + 2, cy - 9, pw + 12, 18)
      ctx.fillStyle = textStrong
      ctx.textBaseline = 'middle'
      ctx.fillText(pLabel, PAD.l + plotW + 8, cy)

      // time tag on the bottom axis
      if (cursor.i != null && cursor.i >= 0 && cursor.i < data.count) {
        const p = istParts(data.t[cursor.i])
        const tLabel = intraday ? `${p.dd} ${p.mon} ${p.hh}:${p.mi}` : `${p.dd} ${p.mon} ${p.yr}`
        const tw = ctx.measureText(tLabel).width
        const bx = Math.max(PAD.l, Math.min(cx - tw / 2 - 6, PAD.l + plotW - tw - 12))
        ctx.fillStyle = gridLight
        ctx.fillRect(bx, axisY + 3, tw + 12, 18)
        ctx.fillStyle = textStrong
        ctx.textBaseline = 'middle'
        ctx.fillText(tLabel, bx + 6, axisY + 12)
      }
    }
  }, [data, view, cursor, tf, ma20, ma50, replay.active, replay.picking, revealEnd, drawings, pending, selected])

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
  // Lets hit-testing read the latest drawings without re-binding listeners.
  const drawingsRef = useRef(drawings)
  useEffect(() => void (drawingsRef.current = drawings), [drawings])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return

    const local = (e) => {
      const r = el.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const plotWidth = () => el.clientWidth - PAD.l - PAD.r

    const idxAt = (clientX) => {
      const d = dataRef.current
      const s = scaleRef.current
      if (!d || !s) return null
      const r = el.getBoundingClientRect()
      const rel = clientX - r.left - PAD.l
      if (rel < 0 || rel > s.plotW) return null
      const v = viewRef.current
      return Math.max(0, Math.min(d.count - 1, Math.floor(v.start + (rel / s.plotW) * v.count)))
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

    /** Data-space point under the pointer, for creating/moving drawings. */
    const pointAt = (e) => {
      const s = scaleRef.current
      if (!s) return null
      const { x, y } = local(e)
      return { i: s.idxAtX(x), price: s.priceAt(y) }
    }

    /** Hit-test existing drawings so a tap can select one. */
    const hitTest = (e) => {
      const s = scaleRef.current
      if (!s) return null
      const { x, y } = local(e)
      const near = 7
      for (let k = drawingsRef.current.length - 1; k >= 0; k--) {
        const d = drawingsRef.current[k]
        const x1 = s.xOf(d.p1.i)
        const y1 = s.yOf(d.p1.price)
        if (d.type === 'hline') {
          if (Math.abs(y - y1) <= near) return d.id
          continue
        }
        if (!d.p2) continue
        const x2 = s.xOf(d.p2.i)
        const y2 = s.yOf(d.p2.price)
        if (d.type === 'rect' || d.type === 'fib') {
          const inX = x >= Math.min(x1, x2) - near && x <= Math.max(x1, x2) + near
          const inY = y >= Math.min(y1, y2) - near && y <= Math.max(y1, y2) + near
          if (inX && inY) return d.id
        } else if (d.type === 'trend') {
          const dx = x2 - x1
          const dy = y2 - y1
          const len2 = dx * dx + dy * dy || 1
          const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len2))
          const px = x1 + t * dx
          const py = y1 + t * dy
          if (Math.hypot(x - px, y - py) <= near) return d.id
        }
      }
      return null
    }

    let drag = null
    let drawing = null
    const pointers = new Map()
    let pinch = null

    const onPointerDown = (e) => {
      pointers.set(e.pointerId, e)
      if (pointers.size === 2) {
        drag = null
        drawing = null
        setPending(null)
        const [a, b] = [...pointers.values()]
        pinch = {
          dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1,
          count: viewRef.current.count,
          anchor: idxAt((a.clientX + b.clientX) / 2),
        }
        return
      }
      if (pointers.size > 2) return

      const activeTool = toolRef.current

      if (activeTool !== 'cursor') {
        const p = pointAt(e)
        if (!p) return
        if (activeTool === 'hline') {
          setDrawings((ds) => [...ds, { id: uid(), type: 'hline', p1: p, color: cssVar('--accent', '#38bdf8') }])
        } else {
          drawing = { id: uid(), type: activeTool, p1: p, p2: p, color: cssVar('--accent', '#38bdf8') }
          setPending(drawing)
        }
        try {
          el.setPointerCapture?.(e.pointerId)
        } catch {
          /* ignore */
        }
        return
      }

      // Picking the replay start consumes the click — afterwards clicks pan
      // normally, matching TradingView (the head only moves via the controls).
      if (replayRef.current.active && replayRef.current.picking) {
        const i = idxAt(e.clientX)
        if (i != null) setReplay((r) => ({ ...r, at: i, picking: false, playing: false }))
        return
      }

      // cursor tool: select a drawing, or pan
      const hit = hitTest(e)
      setSelected(hit)
      if (hit) return

      drag = { x: e.clientX, start: viewRef.current.start }
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

      const { x, y } = local(e)
      setCursor({ i: idxAt(e.clientX), price: scaleRef.current?.priceAt(y), x, y })

      if (drawing) {
        e.preventDefault()
        const p = pointAt(e)
        if (p) {
          drawing = { ...drawing, p2: p }
          setPending(drawing)
        }
        return
      }

      if (!drag) return
      e.preventDefault()
      const v = viewRef.current
      const dxBars = ((e.clientX - drag.x) / plotWidth()) * v.count
      setView({ start: clampStart(drag.start - dxBars, v.count), count: v.count })
    }

    const endPointer = (e) => {
      pointers.delete(e.pointerId)
      if (pointers.size < 2) pinch = null
      if (drawing) {
        const done = drawing
        drawing = null
        setPending(null)
        // Discard accidental taps that produced a zero-size shape.
        const s = scaleRef.current
        const tiny =
          s && Math.abs(s.xOf(done.p2.i) - s.xOf(done.p1.i)) < 4 &&
          Math.abs(s.yOf(done.p2.price) - s.yOf(done.p1.price)) < 4
        if (!tiny) setDrawings((ds) => [...ds, done])
      }
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
  const stepReplay = useCallback((delta) => {
    const d = dataRef.current
    if (!d) return
    setReplay((r) => {
      const at = Math.max(0, Math.min(d.count - 1, r.at + delta))
      return { ...r, at, playing: at >= d.count - 1 ? false : r.playing }
    })
  }, [])

  useEffect(() => {
    if (!replay.active || replay.picking || !replay.playing || !data) return
    const id = setInterval(() => {
      setReplay((r) => (r.at >= data.count - 1 ? { ...r, playing: false } : { ...r, at: r.at + 1 }))
    }, replay.ms)
    return () => clearInterval(id)
  }, [replay.active, replay.playing, replay.ms, data])

  useEffect(() => {
    if (!replay.active || replay.picking || !data) return
    setView((v) => {
      const target = replay.at
      const rightEdge = v.start + v.count - 1
      if (target > rightEdge - 2) {
        const start = Math.max(0, Math.min(data.count - v.count, Math.round(target - v.count * 0.75)))
        return start === v.start ? v : { ...v, start }
      }
      if (target < v.start) return { ...v, start: Math.max(0, Math.round(target - v.count * 0.25)) }
      return v
    })
  }, [replay.at, replay.active, data])

  function toggleReplay() {
    if (!data) return
    if (replay.active) {
      setReplay((r) => ({ ...r, active: false, playing: false, picking: false }))
      setView((v) => ({ ...v, start: Math.max(0, data.count - v.count) }))
    } else {
      const at = Math.max(0, Math.min(data.count - 1, Math.round(view.start + view.count * 0.35)))
      setReplay((r) => ({ ...r, active: true, playing: false, picking: true, at }))
    }
  }

  // Keyboard: space play/pause, arrows step, delete removes selection, esc cancels tool.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        e.preventDefault()
        setDrawings((ds) => ds.filter((d) => d.id !== selected))
        setSelected(null)
        return
      }
      if (e.key === 'Escape') {
        setTool('cursor')
        setSelected(null)
        return
      }
      if (!replay.active) return
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
  }, [replay.active, stepReplay, selected])

  const lastVisible = revealEnd - 1
  const hovered = data && cursor?.i != null && cursor.i <= lastVisible && cursor.i >= 0 ? cursor.i : null
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

      <div className="ch-tools">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={`ch-tool ${tool === t.id ? 'active' : ''}`}
            onClick={() => setTool(t.id)}
            title={t.name}
          >
            <span className="ch-tool-icon">{t.icon}</span>
          </button>
        ))}
        <span className="ch-tool-sep" />
        <button
          className="ch-tool"
          title="Delete selected"
          disabled={!selected}
          onClick={() => {
            setDrawings((ds) => ds.filter((d) => d.id !== selected))
            setSelected(null)
          }}
        >
          🗑
        </button>
        <button
          className="ch-tool"
          title="Clear all drawings"
          disabled={!drawings.length}
          onClick={() => {
            setDrawings([])
            setSelected(null)
          }}
        >
          Clear
        </button>
        {drawings.length > 0 && <span className="ch-tool-count">{drawings.length}</span>}
      </div>

      {replay.active && data && (
        <div className="ch-replay">
          <div className="ch-replay-controls">
            <button
              className={`pick ${replay.picking ? 'active' : ''}`}
              onClick={() => setReplay((r) => ({ ...r, picking: true, playing: false }))}
              title="Choose a new start bar"
            >
              ⊢
            </button>
            <button onClick={() => stepReplay(-1)} title="Previous candle" disabled={replay.picking}>⏮</button>
            <button
              className="play"
              onClick={() => setReplay((r) => ({ ...r, playing: !r.playing }))}
              title="Play / pause (space)"
              disabled={replay.picking}
            >
              {replay.playing ? '⏸' : '▶'}
            </button>
            <button onClick={() => stepReplay(1)} title="Next candle" disabled={replay.picking}>⏭</button>
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
            disabled={replay.picking}
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

      <div className={`ch-canvas-wrap tool-${tool}`} ref={wrapRef}>
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
          {tool !== 'cursor'
            ? `${TOOLS.find((t) => t.id === tool).name} — drag on the chart · Esc to cancel`
            : replay.active
              ? 'Tap a candle to jump · space = play/pause · ← → step'
              : data
                ? `${data.count.toLocaleString('en-IN')} bars · drag to pan · pinch/scroll to zoom`
                : ''}
        </span>
      </div>
    </div>
  )
}
