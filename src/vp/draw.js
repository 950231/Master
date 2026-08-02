// All the artwork for the Vaikuntapali board, drawn with the 2D canvas API.
//
// The reference is a printed sheet, so the board is *drawn*, not modelled. It
// is rendered once at high resolution into an offscreen canvas and then blitted
// each frame, which leaves the whole frame budget for the pieces — the things
// that actually move.

import { COLS, ROWS, TOTAL, LADDERS, SNAKES, NAMES } from './board.js'
import { TITLE_ROW, ART, PALETTE } from './art.js'

/* --------------------------------------------------------------- layout */

export const TILE = 100
export const MASTHEAD = 155
export const STRIP = 88
export const FOOT = 92
export const PAD = 16 // printed border around everything

export const GRID_W = COLS * TILE
export const GRID_H = ROWS * TILE
export const BOARD_W = GRID_W + PAD * 2
export const BOARD_H = MASTHEAD + STRIP + GRID_H + FOOT + PAD * 2

/** Top-left of the grid inside the board image. */
export const GRID_X = PAD
export const GRID_Y = PAD + MASTHEAD + STRIP

/** Rectangle of a square, in board-image coordinates. */
export function squareRect(n) {
  const i = n - 1
  const row = Math.floor(i / COLS)
  const within = i % COLS
  const col = row % 2 === 0 ? within : COLS - 1 - within
  return {
    x: GRID_X + col * TILE,
    y: GRID_Y + (ROWS - 1 - row) * TILE,
    w: TILE,
    h: TILE,
  }
}

/** Centre of a square. */
export function squareCentre(n) {
  const r = squareRect(n)
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 }
}

/** Where a piece stands on a square, fanned out when several share it. */
export function standSpot(n, seat, count) {
  if (n < 1) {
    // Waiting on the printed border below the grid.
    return { x: GRID_X + TILE * (0.8 + seat * 1.1), y: GRID_Y + GRID_H + FOOT * 0.5 }
  }
  const c = squareCentre(n)
  if (count <= 1) return c
  const a = (seat / count) * Math.PI * 2 - Math.PI / 2
  return { x: c.x + Math.cos(a) * TILE * 0.22, y: c.y + Math.sin(a) * TILE * 0.22 }
}

/* ---------------------------------------------------------------- utils */

function rr(g, x, y, w, h, r) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

/** Deterministic noise, so the artwork is identical on every load. */
function rand(seed) {
  let s = seed * 9301 + 49297
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

function fitText(g, text, cx, cy, maxW) {
  const w = g.measureText(text).width
  g.save()
  g.translate(cx, cy)
  if (w > maxW) g.scale(maxW / w, 1)
  g.fillText(text, 0, 0)
  g.restore()
}

/* --------------------------------------------------------------- snakes */

/**
 * The spine of a snake as a list of points from head to tail.
 *
 * Real printed boards run their serpents in long lazy S-curves rather than
 * straight lines, so the spine is bowed by a sine that peaks in the middle
 * and dies away at both ends.
 */
export function snakeSpine(headSq, tailSq, seed = 0, steps = 96) {
  const a = squareCentre(headSq)
  const b = squareCentre(tailSq)
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const px = -dy / len
  const py = dx / len
  const rnd = rand(seed + 7)
  const amp = TILE * (0.85 + rnd() * 0.7)
  const waves = 1.5 + Math.floor(rnd() * 2)
  const phase = rnd() * Math.PI

  // The bow is clamped to the grid: a serpent that swims off the printed
  // border looks like a drawing error, not a flourish.
  const minX = GRID_X + TILE * 0.34
  const maxX = GRID_X + GRID_W - TILE * 0.34
  const minY = GRID_Y + TILE * 0.34
  const maxY = GRID_Y + GRID_H - TILE * 0.34
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

  const pts = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const bow = Math.sin(t * Math.PI * waves + phase) * amp * Math.sin(t * Math.PI)
    pts.push({
      x: clamp(a.x + dx * t + px * bow, minX, maxX),
      y: clamp(a.y + dy * t + py * bow, minY, maxY),
      t,
    })
  }
  return pts
}

/** Half-width of the body at position t, fat behind the head, fine at the tip. */
function bodyHalf(t, max) {
  if (t < 0.06) return max * (0.55 + (t / 0.06) * 0.45)
  return max * (0.35 + 0.65 * Math.pow(1 - t, 0.75))
}

/**
 * Draw one snake: tapered body, banded skin, belly ridges, and a head with
 * eyes and a forked tongue.
 */
export function drawSnake(g, spine, opts) {
  const { base, belly, dark, width = TILE * 0.3, seed = 0 } = opts
  const n = spine.length

  // Outline the body by walking the spine and offsetting perpendicular.
  const left = []
  const right = []
  for (let i = 0; i < n; i++) {
    const p = spine[i]
    const q = spine[Math.min(n - 1, i + 1)]
    const r = spine[Math.max(0, i - 1)]
    const tx = q.x - r.x
    const ty = q.y - r.y
    const l = Math.hypot(tx, ty) || 1
    const nx = -ty / l
    const ny = tx / l
    const h = bodyHalf(p.t, width)
    left.push({ x: p.x + nx * h, y: p.y + ny * h })
    right.push({ x: p.x - nx * h, y: p.y - ny * h })
  }

  const outline = () => {
    g.beginPath()
    g.moveTo(left[0].x, left[0].y)
    for (let i = 1; i < n; i++) g.lineTo(left[i].x, left[i].y)
    for (let i = n - 1; i >= 0; i--) g.lineTo(right[i].x, right[i].y)
    g.closePath()
  }

  // Soft contact shadow on the board.
  g.save()
  g.translate(TILE * 0.06, TILE * 0.09)
  outline()
  g.fillStyle = 'rgba(60,30,10,0.20)'
  g.filter = 'blur(6px)'
  g.fill()
  g.restore()

  // Body, shaded across its width so it reads as round.
  const head = spine[0]
  const tail = spine[n - 1]
  const grad = g.createLinearGradient(head.x, head.y, tail.x, tail.y)
  grad.addColorStop(0, base)
  grad.addColorStop(0.55, belly)
  grad.addColorStop(1, dark)
  outline()
  g.fillStyle = grad
  g.fill()
  g.strokeStyle = dark
  g.lineWidth = TILE * 0.035
  g.lineJoin = 'round'
  g.stroke()

  // Cross bands, spaced along the body.
  g.save()
  outline()
  g.clip()
  const rnd = rand(seed + 3)
  for (let i = 4; i < n - 2; i += 5) {
    const p = spine[i]
    const q = spine[i + 1]
    const tx = q.x - p.x
    const ty = q.y - p.y
    const l = Math.hypot(tx, ty) || 1
    const h = bodyHalf(p.t, width) * 1.4
    g.beginPath()
    g.ellipse(p.x, p.y, h * 0.42, h, Math.atan2(ty, tx) + Math.PI / 2, 0, Math.PI * 2)
    g.fillStyle = i % 10 === 4 ? dark : base
    g.globalAlpha = 0.32 + rnd() * 0.2
    g.fill()
  }
  g.globalAlpha = 1

  // Belly highlight running down the middle.
  g.beginPath()
  g.moveTo(spine[0].x, spine[0].y)
  for (let i = 1; i < n; i++) g.lineTo(spine[i].x, spine[i].y)
  g.strokeStyle = 'rgba(255,255,255,0.34)'
  g.lineWidth = width * 0.5
  g.lineCap = 'round'
  g.stroke()
  g.restore()

  drawSnakeHead(g, spine, opts)
}

function drawSnakeHead(g, spine, opts) {
  const { base, dark, width = TILE * 0.3 } = opts
  const p = spine[0]
  const q = spine[3] || spine[1]
  const ang = Math.atan2(p.y - q.y, p.x - q.x)
  const hw = width * 1.5
  const hl = width * 2.05

  g.save()
  g.translate(p.x, p.y)
  g.rotate(ang)

  // Flared jaw.
  g.beginPath()
  g.moveTo(-hl * 0.45, -hw * 0.55)
  g.quadraticCurveTo(hl * 0.55, -hw * 1.0, hl, 0)
  g.quadraticCurveTo(hl * 0.55, hw * 1.0, -hl * 0.45, hw * 0.55)
  g.quadraticCurveTo(-hl * 0.8, 0, -hl * 0.45, -hw * 0.55)
  g.closePath()
  const hg = g.createLinearGradient(0, -hw, 0, hw)
  hg.addColorStop(0, dark)
  hg.addColorStop(0.5, base)
  hg.addColorStop(1, dark)
  g.fillStyle = hg
  g.fill()
  g.strokeStyle = dark
  g.lineWidth = TILE * 0.035
  g.stroke()

  // Forked tongue.
  g.beginPath()
  g.moveTo(hl * 0.95, 0)
  g.lineTo(hl * 1.55, 0)
  g.moveTo(hl * 1.55, 0)
  g.lineTo(hl * 1.85, -hw * 0.3)
  g.moveTo(hl * 1.55, 0)
  g.lineTo(hl * 1.85, hw * 0.3)
  g.strokeStyle = '#e11d48'
  g.lineWidth = TILE * 0.035
  g.lineCap = 'round'
  g.stroke()

  for (const s of [-1, 1]) {
    g.beginPath()
    g.ellipse(hl * 0.34, s * hw * 0.42, hw * 0.3, hw * 0.26, 0, 0, Math.PI * 2)
    g.fillStyle = '#fde047'
    g.fill()
    g.strokeStyle = '#78350f'
    g.lineWidth = TILE * 0.02
    g.stroke()
    // Slit pupil.
    g.beginPath()
    g.ellipse(hl * 0.36, s * hw * 0.42, hw * 0.07, hw * 0.2, 0, 0, Math.PI * 2)
    g.fillStyle = '#111'
    g.fill()
  }
  g.restore()
}

/* -------------------------------------------------------------- ladders */

export function drawLadder(g, fromSq, toSq, seed = 0) {
  const a = squareCentre(fromSq)
  const b = squareCentre(toSq)
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const px = (-dy / len) * TILE * 0.23
  const py = (dx / len) * TILE * 0.23
  const rnd = rand(seed + 11)

  const rail = (ox, oy, shade) => {
    g.beginPath()
    g.moveTo(a.x + ox, a.y + oy)
    g.lineTo(b.x + ox, b.y + oy)
    g.strokeStyle = shade
    g.lineWidth = TILE * 0.085
    g.lineCap = 'round'
    g.stroke()
  }

  // Shadow first, then two rails with a lit and a shaded side.
  g.save()
  g.translate(TILE * 0.05, TILE * 0.08)
  rail(px, py, 'rgba(60,30,10,0.22)')
  rail(-px, -py, 'rgba(60,30,10,0.22)')
  g.restore()

  const rungs = Math.max(3, Math.round(len / (TILE * 0.62)))
  rail(px, py, '#8a4b12')
  rail(-px, -py, '#8a4b12')

  for (let i = 1; i < rungs; i++) {
    const t = i / rungs
    const x = a.x + dx * t
    const y = a.y + dy * t
    g.beginPath()
    g.moveTo(x + px, y + py)
    g.lineTo(x - px, y - py)
    g.strokeStyle = '#b45309'
    g.lineWidth = TILE * 0.062
    g.lineCap = 'round'
    g.stroke()
    g.beginPath()
    g.moveTo(x + px * 0.92, y + py * 0.92 - TILE * 0.012)
    g.lineTo(x - px * 0.92, y - py * 0.92 - TILE * 0.012)
    g.strokeStyle = `rgba(253,224,150,${0.45 + rnd() * 0.25})`
    g.lineWidth = TILE * 0.018
    g.stroke()
  }

  // Highlight along the top of each rail, so the wood looks rounded.
  const hl = (ox, oy) => {
    g.beginPath()
    g.moveTo(a.x + ox, a.y + oy - TILE * 0.018)
    g.lineTo(b.x + ox, b.y + oy - TILE * 0.018)
    g.strokeStyle = 'rgba(254,240,190,0.5)'
    g.lineWidth = TILE * 0.02
    g.stroke()
  }
  hl(px, py)
  hl(-px, -py)
}

/* ----------------------------------------------------------- the board */

/** Draw the complete printed sheet into `g` at board-image scale. */
export function drawBoard(g) {
  // Paper and printed border.
  g.fillStyle = '#fffaf0'
  g.fillRect(0, 0, BOARD_W, BOARD_H)
  const border = g.createLinearGradient(0, 0, BOARD_W, BOARD_H)
  border.addColorStop(0, '#b45309')
  border.addColorStop(0.5, '#92400e')
  border.addColorStop(1, '#b45309')
  g.fillStyle = border
  g.fillRect(0, 0, BOARD_W, BOARD_H)
  g.fillStyle = '#fffaf0'
  g.fillRect(PAD * 0.45, PAD * 0.45, BOARD_W - PAD * 0.9, BOARD_H - PAD * 0.9)

  drawMasthead(g, PAD, PAD, GRID_W, MASTHEAD)
  drawStrip(g, PAD, PAD + MASTHEAD, GRID_W, STRIP)
  drawSquares(g)
  drawFoot(g, PAD, GRID_Y + GRID_H, GRID_W, FOOT)

  // Ladders under the snakes, the way they overlap on the printed sheet.
  let i = 0
  for (const [foot, top] of Object.entries(LADDERS)) {
    drawLadder(g, Number(foot), top, i++)
  }
  i = 0
  for (const [head, tail] of Object.entries(SNAKES)) {
    const skin = SNAKE_SKINS[i % SNAKE_SKINS.length]
    const span = Number(head) - tail
    drawSnake(g, snakeSpine(Number(head), tail, i), {
      ...skin,
      width: TILE * (0.2 + Math.min(0.12, span / 700)),
      seed: i,
    })
    i++
  }
}

function drawMasthead(g, x, y, w, h) {
  const grad = g.createLinearGradient(0, y, 0, y + h)
  grad.addColorStop(0, '#fef08a')
  grad.addColorStop(0.5, '#fde047')
  grad.addColorStop(1, '#facc15')
  g.fillStyle = grad
  rr(g, x, y, w, h, 10)
  g.fill()
  g.strokeStyle = '#b45309'
  g.lineWidth = 5
  g.stroke()

  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = '#b91c1c'
  g.font = `900 ${Math.round(h * 0.5)}px system-ui, sans-serif`
  fitText(g, 'వైకుంఠపాళి', x + w / 2, y + h * 0.42, w * 0.7)
  g.fillStyle = '#7c2d12'
  g.font = `700 ${Math.round(h * 0.16)}px system-ui, sans-serif`
  fitText(g, 'పరమపద సోపానపథము', x + w / 2, y + h * 0.76, w * 0.6)

  // Rosettes in the corners, as on the printed masthead.
  for (const cx of [x + h * 0.42, x + w - h * 0.42]) {
    g.save()
    g.translate(cx, y + h / 2)
    for (let k = 0; k < 12; k++) {
      g.rotate(Math.PI / 6)
      g.beginPath()
      g.ellipse(0, -h * 0.24, h * 0.07, h * 0.15, 0, 0, Math.PI * 2)
      g.fillStyle = k % 2 ? '#f97316' : '#dc2626'
      g.fill()
    }
    g.beginPath()
    g.arc(0, 0, h * 0.13, 0, Math.PI * 2)
    g.fillStyle = '#fff7ed'
    g.fill()
    g.strokeStyle = '#b45309'
    g.lineWidth = 3
    g.stroke()
    g.restore()
  }
}

function drawStrip(g, x, y, w, h) {
  g.fillStyle = '#fde68a'
  g.fillRect(x, y, w, h)
  const cw = w / COLS
  for (let i = 0; i < COLS; i++) {
    g.fillStyle = PALETTE[i % PALETTE.length]
    rr(g, x + i * cw + 4, y + 4, cw - 8, h - 8, 8)
    g.fill()
    g.strokeStyle = '#b45309'
    g.lineWidth = 3
    g.stroke()
    const cx = x + i * cw + cw / 2
    const cy = y + h / 2
    if (i % 2) {
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.font = `${Math.round(h * 0.5)}px system-ui, "Apple Color Emoji", sans-serif`
      g.fillText('🪷', cx, cy)
    } else {
      // Drawn rather than typeset — glyph coverage for religious symbols
      // varies by device and a missing one shows as a stray box.
      g.save()
      g.translate(cx, cy)
      for (let k = 0; k < 8; k++) {
        g.rotate(Math.PI / 4)
        g.beginPath()
        g.ellipse(0, -h * 0.2, h * 0.06, h * 0.14, 0, 0, Math.PI * 2)
        g.fillStyle = k % 2 ? '#f97316' : '#dc2626'
        g.fill()
      }
      g.beginPath()
      g.arc(0, 0, h * 0.1, 0, Math.PI * 2)
      g.fillStyle = '#fff7ed'
      g.fill()
      g.strokeStyle = '#b45309'
      g.lineWidth = 2.5
      g.stroke()
      g.restore()
    }
  }
}

function drawFoot(g, x, y, w, h) {
  g.fillStyle = '#fde047'
  g.fillRect(x, y, w, h)
  g.strokeStyle = '#b45309'
  g.lineWidth = 4
  g.strokeRect(x + 2, y + 2, w - 4, h - 4)
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = `${Math.round(h * 0.6)}px system-ui, "Apple Color Emoji", sans-serif`
  const n = 11
  for (let i = 0; i < n; i++) g.fillText('🐘', x + ((i + 0.5) * w) / n, y + h * 0.55)
}

function drawSquares(g) {
  for (let n = 1; n <= TOTAL; n++) {
    const r = squareRect(n)
    const row = Math.floor((n - 1) / COLS)
    const col = Math.round((r.x - GRID_X) / TILE)

    if (n === TOTAL) {
      const grad = g.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h)
      grad.addColorStop(0, '#fde047')
      grad.addColorStop(1, '#f59e0b')
      g.fillStyle = grad
    } else {
      g.fillStyle = PALETTE[(row * 3 + col * 2) % PALETTE.length]
    }
    g.fillRect(r.x, r.y, r.w, r.h)

    g.strokeStyle = 'rgba(255,255,255,0.7)'
    g.lineWidth = 3
    g.strokeRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6)
    g.strokeStyle = '#9a3412'
    g.lineWidth = 2
    g.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2)

    g.textAlign = 'center'
    g.textBaseline = 'middle'
    if (TITLE_ROW[n]) {
      g.fillStyle = '#7f1d1d'
      g.font = `900 ${Math.round(TILE * 0.56)}px system-ui, sans-serif`
      g.fillText(TITLE_ROW[n], r.x + r.w / 2, r.y + r.h * 0.55)
    } else if (ART[n]) {
      g.font = `${Math.round(TILE * 0.44)}px system-ui, "Apple Color Emoji", sans-serif`
      g.fillText(ART[n], r.x + r.w / 2, r.y + r.h * 0.5)
    } else {
      g.save()
      g.globalAlpha = 0.18
      g.strokeStyle = '#9a3412'
      g.lineWidth = 2
      for (let k = 0; k < 6; k++) {
        g.beginPath()
        g.ellipse(
          r.x + r.w / 2, r.y + r.h * 0.5, TILE * 0.055, TILE * 0.15,
          (k * Math.PI) / 6, 0, Math.PI * 2,
        )
        g.stroke()
      }
      g.restore()
    }

    // Number badge.
    g.fillStyle = 'rgba(255,255,255,0.92)'
    rr(g, r.x + 5, r.y + 5, TILE * 0.34, TILE * 0.21, 5)
    g.fill()
    g.strokeStyle = 'rgba(154,52,18,0.5)'
    g.lineWidth = 1.5
    g.stroke()
    g.fillStyle = '#7c2d12'
    g.font = `800 ${Math.round(TILE * 0.15)}px system-ui, sans-serif`
    g.fillText(String(n), r.x + 5 + TILE * 0.17, r.y + 5 + TILE * 0.105)

    if (NAMES[n]) {
      g.fillStyle = '#5b1f0a'
      g.font = `600 ${Math.round(TILE * 0.1)}px system-ui, sans-serif`
      fitText(g, NAMES[n], r.x + r.w / 2, r.y + r.h * 0.88, r.w - 10)
    }
  }
}

/* --------------------------------------------------------------- pieces */

export const SNAKE_SKINS = [
  { base: '#22c55e', belly: '#bbf7d0', dark: '#14532d' },
  { base: '#a855f7', belly: '#e9d5ff', dark: '#4c1d95' },
  { base: '#ef4444', belly: '#fecaca', dark: '#7f1d1d' },
  { base: '#06b6d4', belly: '#cffafe', dark: '#0e4f5e' },
  { base: '#eab308', belly: '#fef08a', dark: '#713f12' },
  { base: '#ec4899', belly: '#fbcfe8', dark: '#831843' },
  { base: '#84cc16', belly: '#ecfccb', dark: '#3f6212' },
]

/**
 * A player piece: a small figure drawn flat, with an outline so it stays
 * legible against the busy board underneath.
 *
 * `pose` carries the animation state — `lift` raises it off the board,
 * `lean` tips it, `swing` drives the arms and legs.
 */
export function drawPiece(g, x, y, colour, pose = {}) {
  const { lift = 0, lean = 0, swing = 0, scale = 1, dim = false } = pose
  const S = TILE * 0.42 * scale
  const skin = '#c98a5e'
  const line = '#3b1d0c'

  // Shadow shrinks as the piece rises, which sells the hop.
  const shrink = 1 - Math.min(0.55, lift / (TILE * 1.2))
  g.save()
  g.globalAlpha = 0.26 * shrink
  g.fillStyle = '#3b1d0c'
  g.beginPath()
  g.ellipse(x, y + S * 0.1, S * 0.42 * shrink, S * 0.16 * shrink, 0, 0, Math.PI * 2)
  g.fill()
  g.restore()

  g.save()
  g.translate(x, y - lift)
  g.rotate(lean)
  if (dim) g.globalAlpha = 0.55
  g.lineJoin = 'round'
  g.lineCap = 'round'
  g.strokeStyle = line
  g.lineWidth = S * 0.075

  // Legs.
  for (const s of [-1, 1]) {
    g.beginPath()
    g.moveTo(s * S * 0.13, -S * 0.32)
    g.lineTo(s * S * 0.16 + swing * s * S * 0.2, -S * 0.02)
    g.stroke()
  }
  // Body: a wrapped garment tapering to the shoulders.
  g.beginPath()
  g.moveTo(-S * 0.26, -S * 0.3)
  g.quadraticCurveTo(-S * 0.3, -S * 0.72, 0, -S * 0.78)
  g.quadraticCurveTo(S * 0.3, -S * 0.72, S * 0.26, -S * 0.3)
  g.closePath()
  const bg = g.createLinearGradient(-S * 0.3, 0, S * 0.3, 0)
  bg.addColorStop(0, colour)
  bg.addColorStop(0.5, '#ffffff')
  bg.addColorStop(1, colour)
  g.fillStyle = colour
  g.fill()
  g.save()
  g.globalAlpha = 0.28
  g.fillStyle = bg
  g.fill()
  g.restore()
  g.stroke()

  // Arms.
  for (const s of [-1, 1]) {
    g.beginPath()
    g.moveTo(s * S * 0.24, -S * 0.66)
    g.lineTo(s * S * 0.36, -S * 0.66 + swing * -s * S * 0.22 + S * 0.16)
    g.stroke()
  }

  // Head, hair and face.
  g.beginPath()
  g.arc(0, -S * 0.98, S * 0.22, 0, Math.PI * 2)
  g.fillStyle = skin
  g.fill()
  g.stroke()
  g.beginPath()
  g.arc(0, -S * 1.02, S * 0.225, Math.PI * 1.05, Math.PI * 1.95)
  g.fillStyle = '#1c1917'
  g.fill()
  g.beginPath()
  g.arc(0, -S * 1.2, S * 0.08, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = line
  for (const s of [-1, 1]) {
    g.beginPath()
    g.arc(s * S * 0.08, -S * 0.97, S * 0.028, 0, Math.PI * 2)
    g.fill()
  }
  g.fillStyle = '#b91c1c'
  g.beginPath()
  g.arc(0, -S * 1.06, S * 0.03, 0, Math.PI * 2)
  g.fill()
  g.restore()
}

/** A die face, drawn flat with a slight tilt while it tumbles. */
export function drawDie(g, x, y, value, spin = 0, size = TILE * 0.78) {
  g.save()
  g.translate(x, y)
  g.rotate(spin)
  const s = size
  g.save()
  g.globalAlpha = 0.25
  g.fillStyle = '#3b1d0c'
  rr(g, -s / 2 + s * 0.06, -s / 2 + s * 0.12, s, s, s * 0.18)
  g.fill()
  g.restore()

  const grad = g.createLinearGradient(-s / 2, -s / 2, s / 2, s / 2)
  grad.addColorStop(0, '#ffffff')
  grad.addColorStop(1, '#e7e5e4')
  rr(g, -s / 2, -s / 2, s, s, s * 0.18)
  g.fillStyle = grad
  g.fill()
  g.strokeStyle = '#78716c'
  g.lineWidth = s * 0.035
  g.stroke()

  const o = s * 0.26
  const spots = {
    1: [[0, 0]],
    2: [[-o, -o], [o, o]],
    3: [[-o, -o], [0, 0], [o, o]],
    4: [[-o, -o], [o, -o], [-o, o], [o, o]],
    5: [[-o, -o], [o, -o], [0, 0], [-o, o], [o, o]],
    6: [[-o, -o], [o, -o], [-o, 0], [o, 0], [-o, o], [o, o]],
  }[value] || []
  g.fillStyle = '#1c1917'
  for (const [px, py] of spots) {
    g.beginPath()
    g.arc(px, py, s * 0.085, 0, Math.PI * 2)
    g.fill()
  }
  g.restore()
}
