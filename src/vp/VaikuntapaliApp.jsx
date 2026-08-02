import { useCallback, useEffect, useRef, useState } from 'react'
import {
  COLS,
  ROWS,
  TOTAL,
  NAMES,
  squareToCell,
  rollDie,
  resolveMove,
  turnAfter,
} from './board.js'
import { homographyFromCorners, squareCentreOnPhoto, cellSize, cornersUsable } from './homography.js'
import { BOARD_W, BOARD_H, drawBoard, squareCentre as drawnCentre, TILE } from './draw.js'
import { shrinkImage, shrinkAvatar, loadSetup, saveSetup, clearSetup } from './store.js'
import './vp.css'

const COLOURS = ['#dc2626', '#2563eb', '#16a34a', '#d97706']
const ease = (t) => t * t * (3 - 2 * t)
const lerp = (a, b, t) => a + (b - a) * t

const CORNER_LABELS = [
  'top-left of square 132',
  'top-right of square 122',
  'bottom-right of square 11',
  'bottom-left of square 1',
]

export default function VaikuntapaliApp() {
  const [setup, setSetup] = useState(loadSetup)
  const [screen, setScreen] = useState('menu') // menu | calibrate | play
  const [count, setCount] = useState(2)
  const [vsCpu, setVsCpu] = useState(true)
  const [positions, setPositions] = useState([0, 0, 0, 0])
  const [turn, setTurn] = useState(0)
  const [phase, setPhase] = useState('idle') // idle | busy | won
  const [die, setDie] = useState(null)
  const [msg, setMsg] = useState('')
  const [winner, setWinner] = useState(null)
  const [corners, setCorners] = useState([])
  const [note, setNote] = useState('')

  const stageRef = useRef(null)
  const canvasRef = useRef(null)
  const turnRef = useRef(0)
  const G = useRef({
    fallback: null, // drawn board, used when there is no photo
    photo: null, // Image element of the player's board
    avatars: [],
    queue: [],
    action: null,
    pieces: [],
    positions: [0, 0, 0, 0],
    count: 2,
    screen: 'menu',
    die: 1,
    dieSpin: 0,
    dieLift: 0,
    confetti: [],
    last: 0,
    clock: 0,
    sixes: 0,
  })

  useEffect(() => void (turnRef.current = turn), [turn])
  useEffect(() => void (G.current.screen = screen), [screen])

  /* ------------------------------------------------- board image sources */
  useEffect(() => {
    const c = document.createElement('canvas')
    c.width = BOARD_W
    c.height = BOARD_H
    drawBoard(c.getContext('2d'))
    G.current.fallback = c
  }, [])

  useEffect(() => {
    const g = G.current
    if (!setup.photo) {
      g.photo = null
      return
    }
    const img = new Image()
    img.onload = () => {
      g.photo = img
    }
    img.src = setup.photo
  }, [setup.photo])

  useEffect(() => {
    const g = G.current
    g.avatars = (setup.avatars || []).map((src) => {
      if (!src) return null
      const img = new Image()
      img.src = src
      return img
    })
  }, [setup.avatars])

  /* --------------------------------------------------- geometry helpers */
  // When a photo is calibrated the board lives in the photo's pixel space;
  // otherwise it lives in the drawn sheet's own coordinates. Everything
  // downstream just asks for a square's centre and a square's size.
  const usingPhoto = !!(setup.photo && setup.corners && setup.corners.length === 4)
  const geom = useCallback(() => {
    if (usingPhoto) {
      const h = homographyFromCorners(setup.corners)
      if (h) {
        return {
          w: setup.photoW,
          h: setup.photoH,
          centre: (n) => squareCentreOnPhoto(h, squareToCell(n), COLS, ROWS),
          size: (n) => cellSize(h, squareToCell(n), COLS, ROWS),
        }
      }
    }
    return {
      w: BOARD_W,
      h: BOARD_H,
      centre: (n) => drawnCentre(n),
      size: () => TILE,
    }
  }, [usingPhoto, setup.corners, setup.photoW, setup.photoH])

  const spotFor = useCallback(
    (n, seat, seats) => {
      const g = geom()
      if (n < 1) {
        // Waiting off the board, lined up under the bottom-left square.
        const c = g.centre(1)
        const s = g.size(1)
        return { x: c.x - s * 0.7 + seat * s * 0.55, y: c.y + s * 1.05 }
      }
      const c = g.centre(n)
      if (seats <= 1) return c
      const s = g.size(n)
      const a = (seat / seats) * Math.PI * 2 - Math.PI / 2
      return { x: c.x + Math.cos(a) * s * 0.24, y: c.y + Math.sin(a) * s * 0.24 }
    },
    [geom],
  )

  /* --------------------------------------------------------- animation */
  const stepAnim = useCallback(
    (g, dt) => {
      g.confetti = g.confetti.filter((c) => {
        c.x += c.vx
        c.y += c.vy
        c.vy += 26 * dt
        c.r += c.vr * dt
        c.life -= dt * 0.42
        return c.life > 0
      })

      if (!g.action) {
        g.action = g.queue.shift() || null
        if (!g.action) {
          const k = 1 - Math.pow(0.002, dt)
          g.dieSpin = lerp(g.dieSpin, 0, k)
          g.dieLift = lerp(g.dieLift, 0, k)
          for (const p of g.pieces) p.lift = lerp(p.lift, 0, k)
          return
        }
        g.action.t = 0
      }

      const a = g.action
      a.t += dt / a.dur
      const t = Math.min(1, a.t)
      const p = g.pieces[a.who]
      const unit = geom().size(Math.max(1, a.to || a.from || 1))

      if (a.kind === 'die') {
        if (t < 0.72) {
          g.die = 1 + Math.floor(Math.random() * 6)
          g.dieSpin += dt * 22
          g.dieLift = Math.abs(Math.sin(t * 11)) * unit * 1.1
        } else {
          // Settle on the number actually rolled.
          g.die = a.value
          const k = ease((t - 0.72) / 0.28)
          g.dieSpin = lerp(g.dieSpin, 0, k)
          g.dieLift = lerp(g.dieLift, 0, k)
        }
      } else if (a.kind === 'hop') {
        const from = spotFor(a.from, a.who, a.seats)
        const to = spotFor(a.to, a.who, a.seats)
        p.x = lerp(from.x, to.x, ease(t))
        p.y = lerp(from.y, to.y, ease(t))
        p.lift = Math.sin(t * Math.PI) * unit * 0.5
      } else if (a.kind === 'travel') {
        // Ladders and snakes both glide along the line between the squares;
        // a ladder rises in steps, a snake drops in one swoop.
        const from = spotFor(a.from, a.who, a.seats)
        const to = spotFor(a.to, a.who, a.seats)
        const k = ease(t)
        p.x = lerp(from.x, to.x, k)
        p.y = lerp(from.y, to.y, k)
        p.lift = a.up
          ? unit * (0.15 + Math.abs(Math.sin(t * Math.PI * 8)) * 0.12)
          : unit * 0.1 * Math.sin(t * Math.PI)
        p.spin = a.up ? 0 : Math.sin(t * 14) * 0.35
      } else if (a.kind === 'settle') {
        const to = spotFor(a.to, a.who, a.seats)
        p.x = lerp(p.x, to.x, ease(t))
        p.y = lerp(p.y, to.y, ease(t))
        p.lift = lerp(p.lift, 0, ease(t))
        p.spin = lerp(p.spin || 0, 0, ease(t))
      }

      if (t >= 1) {
        if (a.done) a.done()
        g.action = null
      }
    },
    [geom, spotFor],
  )

  /* ---------------------------------------------------------- rendering */
  useEffect(() => {
    const canvas = canvasRef.current
    const stage = stageRef.current
    if (!canvas || !stage) return
    let raf = 0

    const frame = (now) => {
      raf = requestAnimationFrame(frame)
      const g = G.current
      const dt = g.last ? Math.min(0.05, (now - g.last) / 1000) : 0.016
      g.last = now
      g.clock += dt
      if (g.screen === 'play') stepAnim(g, dt)

      const src = g.photo || g.fallback
      if (!src) return
      const bw = g.photo ? g.photo.naturalWidth : BOARD_W
      const bh = g.photo ? g.photo.naturalHeight : BOARD_H

      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = stage.clientWidth
      const h = stage.clientHeight
      if (!w || !h) return
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
        canvas.style.width = w + 'px'
        canvas.style.height = h + 'px'
      }
      const ctx = canvas.getContext('2d')
      const scale = Math.min(w / bw, h / bh)
      const ox = (w - bw * scale) / 2
      const oy = (h - bh * scale) / 2
      g.view = { scale, ox, oy, bw, bh }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      ctx.save()
      ctx.translate(ox, oy)
      ctx.scale(scale, scale)
      ctx.drawImage(src, 0, 0, bw, bh)

      if (g.screen === 'calibrate') {
        drawCalibration(ctx, cornersRef.current, bw, bh)
      } else if (g.screen === 'play') {
        drawPlay(ctx, g)
      }
      ctx.restore()
    }

    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [stepAnim])

  const cornersRef = useRef([])
  useEffect(() => void (cornersRef.current = corners), [corners])

  const drawCalibration = (ctx, pts, bw, bh) => {
    const r = Math.max(bw, bh) * 0.014
    if (pts.length === 4) {
      ctx.beginPath()
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
      ctx.closePath()
      ctx.strokeStyle = 'rgba(34,197,94,0.95)'
      ctx.lineWidth = r * 0.5
      ctx.stroke()
      ctx.fillStyle = 'rgba(34,197,94,0.12)'
      ctx.fill()

      // Preview the grid the corners imply, so a bad tap is obvious.
      const h = homographyFromCorners(pts)
      if (h) {
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'
        ctx.lineWidth = r * 0.16
        for (let n = 1; n <= TOTAL; n++) {
          const c = squareCentreOnPhoto(h, squareToCell(n), COLS, ROWS)
          const s = cellSize(h, squareToCell(n), COLS, ROWS)
          ctx.beginPath()
          ctx.arc(c.x, c.y, s * 0.1, 0, Math.PI * 2)
          ctx.stroke()
        }
      }
    }
    pts.forEach((p, i) => {
      ctx.beginPath()
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
      ctx.fillStyle = '#22c55e'
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = r * 0.3
      ctx.stroke()
      ctx.fillStyle = '#fff'
      ctx.font = `800 ${r * 1.3}px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(i + 1), p.x, p.y)
    })
  }

  const drawPlay = (ctx, g) => {
    const gm = geom()
    const me = turnRef.current

    if (g.positions[me] >= 1) {
      const c = gm.centre(g.positions[me])
      const s = gm.size(g.positions[me])
      ctx.beginPath()
      ctx.arc(c.x, c.y, s * (0.46 + Math.sin(g.clock * 3) * 0.04), 0, Math.PI * 2)
      ctx.strokeStyle = COLOURS[me]
      ctx.lineWidth = s * 0.09
      ctx.globalAlpha = 0.85
      ctx.stroke()
      ctx.globalAlpha = 1
    }

    const order = g.pieces
      .map((_, i) => i)
      .filter((i) => i < g.count)
      .sort((a, b) => g.pieces[a].y - g.pieces[b].y)
    for (const i of order) drawPawn(ctx, g, i, gm)

    // Die, resting on the lower-right of the board.
    const c11 = gm.centre(11)
    const s11 = gm.size(11)
    drawDieFace(ctx, c11.x + s11 * 0.1, c11.y + s11 * 1.15 - g.dieLift, g.die, g.dieSpin, s11 * 0.85)

    for (const c of g.confetti) {
      ctx.save()
      ctx.translate(c.x, c.y)
      ctx.rotate(c.r)
      ctx.globalAlpha = Math.max(0, Math.min(1, c.life))
      ctx.fillStyle = c.colour
      ctx.fillRect(-c.s / 2, -c.s / 4, c.s, c.s / 2)
      ctx.restore()
    }
  }

  /** A player: their photo in a coloured ring, or a numbered disc. */
  const drawPawn = (ctx, g, i, gm) => {
    const p = g.pieces[i]
    if (!p) return
    const s = gm.size(Math.max(1, g.positions[i] || 1))
    const r = s * 0.32
    const img = g.avatars[i]

    ctx.save()
    ctx.globalAlpha = 0.3
    ctx.fillStyle = '#000'
    ctx.beginPath()
    ctx.ellipse(p.x, p.y + r * 0.15, r * 0.85, r * 0.3, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    ctx.save()
    ctx.translate(p.x, p.y - p.lift - r)
    if (p.spin) ctx.rotate(p.spin)

    // Little stand, so the piece sits on the square rather than floating.
    ctx.beginPath()
    ctx.moveTo(-r * 0.42, r * 0.86)
    ctx.lineTo(r * 0.42, r * 0.86)
    ctx.lineTo(r * 0.26, r * 1.24)
    ctx.lineTo(-r * 0.26, r * 1.24)
    ctx.closePath()
    ctx.fillStyle = COLOURS[i]
    ctx.fill()

    ctx.save()
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, Math.PI * 2)
    ctx.clip()
    if (img && img.complete && img.naturalWidth) {
      ctx.drawImage(img, -r, -r, r * 2, r * 2)
    } else {
      ctx.fillStyle = COLOURS[i]
      ctx.fillRect(-r, -r, r * 2, r * 2)
      ctx.fillStyle = '#fff'
      ctx.font = `800 ${r}px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(i + 1), 0, 0)
    }
    ctx.restore()

    ctx.beginPath()
    ctx.arc(0, 0, r, 0, Math.PI * 2)
    ctx.strokeStyle = COLOURS[i]
    ctx.lineWidth = r * 0.2
    ctx.stroke()
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'
    ctx.lineWidth = r * 0.07
    ctx.stroke()
    ctx.restore()
  }

  const drawDieFace = (ctx, x, y, value, spin, size) => {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(spin)
    const s = size
    ctx.save()
    ctx.globalAlpha = 0.3
    ctx.fillStyle = '#000'
    ctx.fillRect(-s / 2 + s * 0.06, -s / 2 + s * 0.1, s, s)
    ctx.restore()
    ctx.fillStyle = '#fffdf7'
    ctx.strokeStyle = '#57534e'
    ctx.lineWidth = s * 0.04
    const rr = s * 0.18
    ctx.beginPath()
    ctx.moveTo(-s / 2 + rr, -s / 2)
    ctx.arcTo(s / 2, -s / 2, s / 2, s / 2, rr)
    ctx.arcTo(s / 2, s / 2, -s / 2, s / 2, rr)
    ctx.arcTo(-s / 2, s / 2, -s / 2, -s / 2, rr)
    ctx.arcTo(-s / 2, -s / 2, s / 2, -s / 2, rr)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    const o = s * 0.26
    const spots = {
      1: [[0, 0]],
      2: [[-o, -o], [o, o]],
      3: [[-o, -o], [0, 0], [o, o]],
      4: [[-o, -o], [o, -o], [-o, o], [o, o]],
      5: [[-o, -o], [o, -o], [0, 0], [-o, o], [o, o]],
      6: [[-o, -o], [o, -o], [-o, 0], [o, 0], [-o, o], [o, o]],
    }[value] || []
    ctx.fillStyle = '#1c1917'
    for (const [px, py] of spots) {
      ctx.beginPath()
      ctx.arc(px, py, s * 0.09, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  /* -------------------------------------------------------- calibration */
  const stagePoint = (e) => {
    const g = G.current
    if (!g.view) return null
    const rect = canvasRef.current.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left - g.view.ox) / g.view.scale,
      y: (e.clientY - rect.top - g.view.oy) / g.view.scale,
    }
  }

  const onStageClick = (e) => {
    if (screen !== 'calibrate') return
    const p = stagePoint(e)
    if (!p) return
    setCorners((cs) => (cs.length >= 4 ? [p] : [...cs, p]))
  }

  const confirmCorners = () => {
    if (!cornersUsable(corners)) {
      setNote('Those four points do not form a board. Tap the grid corners in order and try again.')
      return
    }
    const next = { ...setup, corners }
    if (!saveSetup(next)) {
      setNote('Could not save — your browser storage is full.')
      return
    }
    setSetup(next)
    setNote('')
    setScreen('menu')
  }

  /* ------------------------------------------------------------- uploads */
  const onBoardPhoto = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      setNote('Preparing photo…')
      const { url, width, height } = await shrinkImage(file)
      const next = { ...setup, photo: url, photoW: width, photoH: height, corners: null }
      if (!saveSetup(next)) {
        setNote('Photo is too large to store. Try a smaller picture.')
        return
      }
      setSetup(next)
      setCorners([])
      setNote('')
      setScreen('calibrate')
    } catch (err) {
      setNote(err.message || 'Could not use that photo')
    }
  }

  const onAvatar = async (i, e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const url = await shrinkAvatar(file)
      const avatars = [...(setup.avatars || [])]
      avatars[i] = url
      const next = { ...setup, avatars }
      if (!saveSetup(next)) {
        setNote('Could not save that photo — storage is full.')
        return
      }
      setSetup(next)
      setNote('')
    } catch (err) {
      setNote(err.message || 'Could not use that photo')
    }
  }

  /* ------------------------------------------------------------ gameplay */
  const label = useCallback(
    (i) => (vsCpu && i > 0 ? `Computer ${i}` : `Player ${i + 1}`),
    [vsCpu],
  )

  const startGame = useCallback(
    (n, cpu) => {
      const g = G.current
      setCount(n)
      setVsCpu(cpu)
      setPositions([0, 0, 0, 0])
      setTurn(0)
      turnRef.current = 0
      setWinner(null)
      setDie(null)
      setPhase('idle')
      setMsg('Roll to begin — 132 must be landed on exactly.')
      g.count = n
      g.positions = [0, 0, 0, 0]
      g.queue = []
      g.action = null
      g.confetti = []
      g.sixes = 0
      g.pieces = COLOURS.map((_, i) => {
        const s = spotFor(0, i, n)
        return { x: s.x, y: s.y, lift: 0, spin: 0 }
      })
      setScreen('play')
    },
    [spotFor],
  )

  const roll = useCallback(() => {
    const g = G.current
    if (phase !== 'idle' || screen !== 'play') return
    setPhase('busy')

    const value = rollDie()
    setDie(value)
    const me = turnRef.current
    const from = g.positions[me]
    const res = resolveMove(from, value)
    const seats = g.count
    const nm = (sq) => (NAMES[sq] ? ` · ${NAMES[sq]}` : '')
    const q = [{ kind: 'die', who: me, value, dur: 0.9, seats, from }]

    if (res.blocked) {
      q.push({
        kind: 'settle', who: me, to: from, dur: 0.3, seats,
        done: () => setMsg(`${label(me)} rolled ${value} — ${TOTAL - from} needed exactly.`),
      })
    } else {
      let prev = from
      for (const sq of res.walk) {
        q.push({ kind: 'hop', who: me, from: prev, to: sq, dur: 0.22, seats })
        prev = sq
      }
      if (res.jump) {
        const up = res.jump.type === 'ladder'
        q.push({
          kind: 'travel', who: me, from: res.jump.from, to: res.jump.to, up, dur: up ? 1.1 : 1.2, seats,
          done: () =>
            setMsg(
              up
                ? `🪜 ${label(me)} climbs ${res.jump.from} → ${res.jump.to}${nm(res.jump.to)}`
                : `🐍 ${label(me)} swallowed at ${res.jump.from}${nm(res.jump.from)} → ${res.jump.to}`,
            ),
        })
        q.push({ kind: 'settle', who: me, to: res.jump.to, dur: 0.25, seats })
      } else {
        q.push({
          kind: 'settle', who: me, to: res.landed, dur: 0.2, seats,
          done: () => setMsg(`${label(me)} rolled ${value} → ${res.landed}${nm(res.landed)}`),
        })
      }
    }

    const last = q[q.length - 1]
    const prevDone = last.done
    last.done = () => {
      if (prevDone) prevDone()
      g.positions[me] = res.landed
      setPositions([...g.positions])

      if (res.won) {
        const c = geom().centre(TOTAL)
        for (let i = 0; i < 100; i++) {
          const ang = Math.random() * Math.PI * 2
          const sp = 2 + Math.random() * 8
          g.confetti.push({
            x: c.x, y: c.y,
            vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 7,
            vr: (Math.random() - 0.5) * 12, r: Math.random() * 6,
            s: 8 + Math.random() * 14, life: 1 + Math.random(),
            colour: ['#fbbf24', '#ef4444', '#22c55e', '#3b82f6', '#a855f7'][i % 5],
          })
        }
        setWinner(me)
        setPhase('won')
        setMsg(`🏆 ${label(me)} reached పరమపదము!`)
        return
      }

      const after = turnAfter(value, g.sixes)
      g.sixes = after.sixes
      if (after.burned) setMsg(`${label(me)} rolled three sixes — turn forfeited.`)
      if (!after.again) {
        const next = (me + 1) % g.count
        turnRef.current = next
        setTurn(next)
      }
      setPhase('idle')
    }

    g.queue.push(...q)
  }, [phase, screen, label, geom])

  useEffect(() => {
    if (screen !== 'play' || phase !== 'idle' || !vsCpu || turn === 0 || winner !== null) return
    const id = setTimeout(roll, 800)
    return () => clearTimeout(id)
  }, [screen, phase, turn, vsCpu, winner, roll])

  const human = !vsCpu || turn === 0
  const avatars = setup.avatars || []

  return (
    <div className="vp">
      <header className="vp-top">
        <a href="#/" className="vp-back">←</a>
        <div className="vp-title">
          వైకుంఠపాళి<span>{usingPhoto ? 'your board' : 'printed board'}</span>
        </div>
        <button className="vp-icon" onClick={() => setScreen('menu')} title="Menu">☰</button>
      </header>

      <div className="vp-stage" ref={stageRef} onClick={onStageClick}>
        <canvas ref={canvasRef} />

        {screen === 'menu' && (
          <div className="vp-overlay">
            <div className="vp-big">వైకుంఠపాళి</div>
            <p className="vp-sub">
              {usingPhoto
                ? 'Playing on your own board photo.'
                : 'Add a photo of your real board to play on it.'}
            </p>

            <div className="vp-faces">
              {[0, 1, 2, 3].map((i) => (
                <label key={i} className="vp-face" style={{ '--pc': COLOURS[i] }}>
                  {avatars[i] ? <img src={avatars[i]} alt="" /> : <span>{i + 1}</span>}
                  <input type="file" accept="image/*" onChange={(e) => onAvatar(i, e)} />
                </label>
              ))}
            </div>
            <p className="vp-tip">tap a circle to use a real photo for that player</p>

            <div className="vp-choice">
              {[2, 3, 4].map((n) => (
                <button key={n} onClick={() => startGame(n, false)}>{n} players</button>
              ))}
            </div>
            <div className="vp-choice">
              <button className="vp-cta" onClick={() => startGame(2, true)}>Play vs computer</button>
            </div>

            <div className="vp-choice vp-setup">
              <label className="vp-ghost">
                {usingPhoto ? 'Change board photo' : '📷 Use my board photo'}
                <input type="file" accept="image/*" onChange={onBoardPhoto} />
              </label>
              {setup.photo && (
                <button className="vp-ghost" onClick={() => { setCorners([]); setScreen('calibrate') }}>
                  Re-align grid
                </button>
              )}
              {(setup.photo || avatars.some(Boolean)) && (
                <button
                  className="vp-ghost"
                  onClick={() => { clearSetup(); setSetup({}); setCorners([]) }}
                >
                  Reset setup
                </button>
              )}
            </div>
            {note && <p className="vp-note">{note}</p>}
          </div>
        )}

        {screen === 'calibrate' && (
          <div className="vp-calibar">
            <b>
              {corners.length < 4
                ? `Tap the ${CORNER_LABELS[corners.length]}`
                : 'Check the dots line up with the squares'}
            </b>
            <div className="vp-calibtns">
              <button onClick={() => setCorners([])}>Start over</button>
              <button className="vp-cta" disabled={corners.length !== 4} onClick={confirmCorners}>
                Use this
              </button>
            </div>
            {note && <p className="vp-note">{note}</p>}
          </div>
        )}

        {screen === 'play' && phase === 'won' && (
          <div className="vp-overlay">
            <div className="vp-big">🏆</div>
            <div className="vp-win" style={{ color: COLOURS[winner] }}>{label(winner)} wins</div>
            <button className="vp-cta" onClick={() => startGame(count, vsCpu)}>Play again</button>
            <button className="vp-ghost" onClick={() => setScreen('menu')}>Menu</button>
          </div>
        )}
      </div>

      {screen === 'play' && phase !== 'won' && (
        <div className="vp-panel">
          <div className="vp-players">
            {COLOURS.slice(0, count).map((c, i) => (
              <div key={i} className={`vp-chip ${i === turn ? 'on' : ''}`} style={{ '--pc': c }}>
                {avatars[i] ? <img src={avatars[i]} alt="" /> : <i>{i + 1}</i>}
                <span>{positions[i] || '–'}</span>
              </div>
            ))}
          </div>
          <div className="vp-msg">{msg}</div>
          <button
            className="vp-roll"
            style={{ '--pc': COLOURS[turn] }}
            onClick={roll}
            disabled={phase !== 'idle' || !human}
          >
            {phase === 'busy' ? '…' : human ? `Roll${die ? ` · ${die}` : ''}` : 'Computer…'}
          </button>
        </div>
      )}
    </div>
  )
}
