// Geometry and rendering for the cobra body.
//
// The old snake was a plain round-capped stroke, which is why eating looked
// like the head bumping a ball. A real snake swallows: the prey goes in at
// the mouth and travels down the body as a visible lump. That needs a body
// whose width varies along its length, which a stroke cannot do — so the
// body is built as an outline and filled.

/**
 * Split the chain of body points into runs of physically adjacent points,
 * and tag every point with how far it is from the head.
 *
 * Wrapping through an edge teleports the drawn position, so the body has to
 * be drawn as separate runs — but the *creature* is still continuous, so the
 * arc length keeps counting across the seam. A lump being swallowed must
 * carry on down the body while it is wrapped, not restart.
 */
export function buildSpine(points, cell) {
  const runs = []
  let run = []
  let s = 0

  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    if (i === 0) {
      run.push({ x: p.x, y: p.y, s: 0 })
      continue
    }
    const q = points[i - 1]
    const d = Math.hypot(p.x - q.x, p.y - q.y)
    // Anything much longer than a cell is a wrap, not real travel.
    const wrapped = d > cell * 1.6
    s += wrapped ? cell : d
    if (wrapped) {
      if (run.length) runs.push(run)
      run = [{ x: p.x, y: p.y, s }]
    } else {
      run.push({ x: p.x, y: p.y, s })
    }
  }
  if (run.length) runs.push(run)
  return { runs, total: s }
}

/** Resample a run at a fixed step so the outline stays smooth. */
export function resample(run, step) {
  if (run.length < 2) return run.slice()
  const out = [run[0]]
  for (let i = 1; i < run.length; i++) {
    const a = run[i - 1]
    const b = run[i]
    const d = Math.hypot(b.x - a.x, b.y - a.y)
    const n = Math.max(1, Math.round(d / step))
    for (let k = 1; k <= n; k++) {
      const t = k / n
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, s: a.s + (b.s - a.s) * t })
    }
  }
  return out
}

/** Round off the corners so the body bends instead of hinging. */
export function smooth(pts, passes = 2) {
  let cur = pts
  for (let p = 0; p < passes; p++) {
    const next = cur.map((pt, i) => {
      if (i === 0 || i === cur.length - 1) return pt
      const a = cur[i - 1]
      const b = cur[i + 1]
      return { x: (a.x + pt.x * 2 + b.x) / 4, y: (a.y + pt.y * 2 + b.y) / 4, s: pt.s }
    })
    cur = next
  }
  return cur
}

/**
 * Half-width of the body at arc distance `s`.
 *
 * Three things stack: the natural taper from neck to tail, the cobra's hood
 * just behind the head, and a bulge for every meal still being swallowed.
 */
export function halfWidth(s, opts) {
  const { base, total, boluses, cell, hood = true } = opts
  const t = total > 0 ? Math.min(1, s / total) : 0
  let w = base * (0.62 + 0.38 * Math.pow(1 - t, 0.7))

  if (hood) {
    // A bell centred a little behind the head, fading out down the neck.
    const k = Math.exp(-Math.pow((s - cell * 0.85) / (cell * 0.78), 2))
    w += base * 0.95 * k
  }

  for (const b of boluses) {
    const sigma = cell * 0.4
    const k = Math.exp(-Math.pow((s - b.d) / sigma, 2))
    w += base * 0.9 * k * (b.size ?? 1)
  }
  return w
}

/** Advance every swallowed lump toward the tail; drop the ones that arrive. */
export function stepBoluses(boluses, dt, total, seconds = 1.5) {
  const speed = total > 0 ? total / seconds : 0
  const out = []
  for (const b of boluses) {
    const d = b.d + speed * dt
    // Shrink over the last stretch so it leaves rather than vanishing.
    const remain = total > 0 ? 1 - d / total : 1
    if (d <= total) out.push({ ...b, d, size: Math.max(0, Math.min(1, remain * 3)) })
  }
  return out
}

/** Outline one run, given a half-width function. */
export function outline(pts, hw) {
  const left = []
  const right = []
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const a = pts[Math.max(0, i - 1)]
    const b = pts[Math.min(pts.length - 1, i + 1)]
    let tx = b.x - a.x
    let ty = b.y - a.y
    const l = Math.hypot(tx, ty) || 1
    tx /= l
    ty /= l
    const w = hw(p.s)
    left.push({ x: p.x - ty * w, y: p.y + tx * w })
    right.push({ x: p.x + ty * w, y: p.y - tx * w })
  }
  return { left, right }
}

/* ------------------------------------------------------------- rendering */

function pathOutline(ctx, left, right) {
  ctx.beginPath()
  ctx.moveTo(left[0].x, left[0].y)
  for (let i = 1; i < left.length; i++) ctx.lineTo(left[i].x, left[i].y)
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y)
  ctx.closePath()
}

/**
 * Draw the whole creature: banded body, hood, head, eyes, fangs and tongue.
 * `dir` is the unit heading of the head, used to orient the face.
 */
export function drawCobra(ctx, spine, opts) {
  const { cell, base, boluses, skin, dir, anim, ghost } = opts
  const step = Math.max(2, cell / 5)
  const hw = (s) => halfWidth(s, { base, total: spine.total, boluses, cell, hood: skin.hood })

  ctx.save()
  ctx.globalAlpha = ghost ? 0.5 : 1
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  for (const raw of spine.runs) {
    const pts = smooth(resample(raw, step), skin.smooth ? 2 : 0)
    if (pts.length < 2) {
      // A single cell of body still needs to show, e.g. a stub of tail.
      const p = pts[0]
      if (!p) continue
      ctx.beginPath()
      ctx.arc(p.x, p.y, hw(p.s), 0, Math.PI * 2)
      ctx.fillStyle = skin.body[1]
      ctx.fill()
      continue
    }
    const { left, right } = outline(pts, hw)

    if (skin.glow) {
      ctx.shadowBlur = 16
      ctx.shadowColor = skin.body[1]
    }
    pathOutline(ctx, left, right)
    const a = pts[0]
    const b = pts[pts.length - 1]
    const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y)
    grad.addColorStop(0, skin.body[0])
    grad.addColorStop(0.5, skin.body[1])
    grad.addColorStop(1, skin.body[2])
    ctx.fillStyle = grad
    ctx.fill()
    ctx.shadowBlur = 0

    if (skin.scales) {
      // Cross-bands, clipped to the body so they follow its edge exactly.
      ctx.save()
      pathOutline(ctx, left, right)
      ctx.clip()
      ctx.strokeStyle = skin.band
      ctx.lineWidth = Math.max(1, cell * 0.05)
      const gap = Math.max(4, cell * 0.3)
      for (let i = 0; i < pts.length; i++) {
        if (pts[i].s % gap > gap / 2) continue
        ctx.beginPath()
        ctx.moveTo(left[i].x, left[i].y)
        ctx.lineTo(right[i].x, right[i].y)
        ctx.stroke()
      }
      // Belly sheen down the middle.
      ctx.globalAlpha = 0.25
      ctx.beginPath()
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = base * 0.5
      ctx.stroke()
      ctx.restore()
    }

    ctx.strokeStyle = skin.edge
    ctx.lineWidth = Math.max(1, cell * 0.045)
    pathOutline(ctx, left, right)
    ctx.stroke()
  }

  drawHead(ctx, spine, { cell, base, skin, dir, anim })
  ctx.restore()
}

function drawHead(ctx, spine, { cell, base, skin, dir, anim }) {
  const first = spine.runs[0]?.[0]
  if (!first) return
  const ang = Math.atan2(dir.y, dir.x)
  const hl = base * 1.9
  const hw = base * 1.25

  ctx.save()
  ctx.translate(first.x, first.y)
  ctx.rotate(ang)

  if (skin.glow) {
    ctx.shadowBlur = 14
    ctx.shadowColor = skin.head
  }
  // A wedge: broad at the jaw, blunt at the snout.
  ctx.beginPath()
  ctx.moveTo(-hl * 0.5, -hw * 0.72)
  ctx.quadraticCurveTo(hl * 0.55, -hw, hl, 0)
  ctx.quadraticCurveTo(hl * 0.55, hw, -hl * 0.5, hw * 0.72)
  ctx.quadraticCurveTo(-hl * 0.85, 0, -hl * 0.5, -hw * 0.72)
  ctx.closePath()
  ctx.fillStyle = skin.head
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.strokeStyle = skin.edge
  ctx.lineWidth = Math.max(1, cell * 0.045)
  ctx.stroke()

  if (skin.fangs) {
    // Tongue, flicking on a slow cycle rather than constantly.
    const flick = Math.sin(anim / 260)
    if (flick > 0.55) {
      const len = hl * (0.55 + flick * 0.5)
      ctx.strokeStyle = '#f43f5e'
      ctx.lineWidth = Math.max(1, cell * 0.05)
      ctx.beginPath()
      ctx.moveTo(hl * 0.9, 0)
      ctx.lineTo(hl * 0.9 + len, 0)
      ctx.moveTo(hl * 0.9 + len, 0)
      ctx.lineTo(hl * 0.9 + len * 1.35, -hw * 0.35)
      ctx.moveTo(hl * 0.9 + len, 0)
      ctx.lineTo(hl * 0.9 + len * 1.35, hw * 0.35)
      ctx.stroke()
    }
    ctx.fillStyle = '#fff7ed'
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(hl * 0.62, s * hw * 0.34)
      ctx.lineTo(hl * 0.9, s * hw * 0.1)
      ctx.lineTo(hl * 0.58, s * hw * 0.06)
      ctx.closePath()
      ctx.fill()
    }
  }

  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.ellipse(hl * 0.18, s * hw * 0.46, base * 0.3, base * 0.26, 0, 0, Math.PI * 2)
    ctx.fillStyle = skin.eye
    ctx.fill()
    ctx.strokeStyle = skin.edge
    ctx.lineWidth = Math.max(1, cell * 0.03)
    ctx.stroke()
    // Vertical slit, which is what makes it read as a snake and not a toy.
    ctx.beginPath()
    ctx.ellipse(hl * 0.2, s * hw * 0.46, base * 0.07, base * 0.19, 0, 0, Math.PI * 2)
    ctx.fillStyle = '#0b0b0b'
    ctx.fill()
  }
  ctx.restore()
}

export const COBRA_SKINS = {
  neon: {
    body: ['#34d399', '#22d3ee', '#7c3aed'],
    head: '#5eead4',
    band: 'rgba(2,20,30,0.45)',
    edge: 'rgba(3,12,20,0.75)',
    eye: '#fde047',
    glow: true,
    scales: true,
    hood: true,
    fangs: true,
    smooth: true,
  },
  retro: {
    body: ['#1b2410', '#1b2410', '#1b2410'],
    head: '#1b2410',
    band: 'rgba(169,182,101,0.5)',
    edge: 'rgba(27,36,16,0.9)',
    eye: '#a9b665',
    glow: false,
    scales: false,
    hood: false,
    fangs: false,
    smooth: false,
  },
}
