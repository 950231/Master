import { useCallback, useEffect, useRef, useState } from 'react'
import { TOTAL, NAMES, SNAKES, rollDie, resolveMove, turnAfter } from './board.js'
import {
  BOARD_W,
  BOARD_H,
  TILE,
  drawBoard,
  drawPiece,
  drawDie,
  snakeSpine,
  squareCentre,
  standSpot,
} from './draw.js'
import './vp.css'

const PLAYERS = [
  { name: 'Player 1', colour: '#dc2626' },
  { name: 'Player 2', colour: '#2563eb' },
  { name: 'Player 3', colour: '#16a34a' },
  { name: 'Player 4', colour: '#d97706' },
]

const SAVE = 'vaikuntapali.v1'
const ease = (t) => t * t * (3 - 2 * t)
const lerp = (a, b, t) => a + (b - a) * t

// Each snake's spine is seeded by its position in the list. The slide
// animation has to use the same seed or the piece would ride a curve that
// is not the one painted on the board.
const SNAKE_ORDER = Object.keys(SNAKES)
const snakeSeed = (head) => SNAKE_ORDER.indexOf(String(head))

export default function Vaikuntapali() {
  const [count, setCount] = useState(2)
  const [vsCpu, setVsCpu] = useState(true)
  const [positions, setPositions] = useState([0, 0, 0, 0])
  const [turn, setTurn] = useState(0)
  const [phase, setPhase] = useState('menu') // menu | idle | busy | won
  const [die, setDie] = useState(null)
  const [msg, setMsg] = useState('')
  const [winner, setWinner] = useState(null)
  const [record, setRecord] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(SAVE) || '{}')
    } catch {
      return {}
    }
  })

  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const turnRef = useRef(0)
  const G = useRef({
    board: null, // offscreen canvas holding the printed sheet
    queue: [],
    action: null,
    pieces: [],
    positions: [0, 0, 0, 0],
    count: 2,
    phase: 'menu',
    die: 1,
    dieSpin: 0,
    dieLift: 0,
    confetti: [],
    last: 0,
    clock: 0,
    sixes: 0,
  })

  useEffect(() => void (G.current.phase = phase), [phase])
  useEffect(() => void (turnRef.current = turn), [turn])

  /* --------------------------------------------------- the printed sheet */
  useEffect(() => {
    // Drawn once into an offscreen canvas. It is artwork and never changes,
    // so redrawing it every frame would spend the whole budget on nothing.
    const c = document.createElement('canvas')
    c.width = BOARD_W
    c.height = BOARD_H
    drawBoard(c.getContext('2d'))
    const g = G.current
    g.board = c
    g.pieces = PLAYERS.map((_, i) => {
      const s = standSpot(0, i, 4)
      return { x: s.x, y: s.y, lift: 0, lean: 0, swing: 0 }
    })
  }, [])

  /* ------------------------------------------------- animation stepping */
  const step = useCallback((g, dt) => {
    g.confetti = g.confetti.filter((c) => {
      c.x += c.vx
      c.y += c.vy
      c.vy += 26 * dt
      c.r += c.vr * dt
      c.life -= dt * 0.42
      return c.life > 0 && c.y < BOARD_H + 80
    })

    if (!g.action) {
      g.action = g.queue.shift() || null
      if (!g.action) {
        const k = 1 - Math.pow(0.002, dt)
        g.dieSpin = lerp(g.dieSpin, 0, k)
        g.dieLift = lerp(g.dieLift, 0, k)
        for (const p of g.pieces) {
          p.lift = lerp(p.lift, 0, k)
          p.lean = lerp(p.lean, 0, k)
          p.swing = lerp(p.swing, 0, k)
        }
        return
      }
      g.action.t = 0
    }

    const a = g.action
    a.t += dt / a.dur
    const t = Math.min(1, a.t)
    const p = g.pieces[a.who]

    if (a.kind === 'die') {
      if (t < 0.72) {
        g.die = 1 + Math.floor(Math.random() * 6)
        g.dieSpin += dt * 22
        g.dieLift = Math.abs(Math.sin(t * 11)) * TILE * 1.1
      } else {
        // Settle on the number actually rolled, so the animation can never
        // contradict the result.
        g.die = a.value
        const k = ease((t - 0.72) / 0.28)
        g.dieSpin = lerp(g.dieSpin, 0, k)
        g.dieLift = lerp(g.dieLift, 0, k)
      }
    } else if (a.kind === 'hop') {
      const from = standSpot(a.from, a.who, a.seats)
      const to = standSpot(a.to, a.who, a.seats)
      p.x = lerp(from.x, to.x, ease(t))
      p.y = lerp(from.y, to.y, ease(t))
      p.lift = Math.sin(t * Math.PI) * TILE * 0.42
      p.swing = Math.sin(t * Math.PI * 2)
      p.lean = Math.sin(t * Math.PI) * 0.12 * (to.x >= from.x ? 1 : -1)
    } else if (a.kind === 'climb') {
      const from = standSpot(a.from, a.who, a.seats)
      const to = standSpot(a.to, a.who, a.seats)
      p.x = lerp(from.x, to.x, ease(t))
      p.y = lerp(from.y, to.y, ease(t))
      // Rung by rung, so it reads as climbing rather than gliding.
      const rung = Math.sin(t * Math.PI * 9)
      p.lift = TILE * 0.1 + Math.abs(rung) * TILE * 0.1
      p.swing = rung * 0.9
      p.lean = 0
    } else if (a.kind === 'slide') {
      // Ride the snake's own painted spine down.
      const spine = a.spine
      const i = Math.min(spine.length - 1, Math.floor(ease(t) * (spine.length - 1)))
      p.x = spine[i].x
      p.y = spine[i].y
      p.lift = TILE * 0.06
      p.lean = Math.sin(t * 18) * 0.5
      p.swing = Math.sin(t * 22) * 0.8
    } else if (a.kind === 'settle') {
      const to = standSpot(a.to, a.who, a.seats)
      p.x = lerp(p.x, to.x, ease(t))
      p.y = lerp(p.y, to.y, ease(t))
      p.lift = lerp(p.lift, 0, ease(t))
      p.lean = lerp(p.lean, 0, ease(t))
      p.swing = lerp(p.swing, 0, ease(t))
    }

    if (t >= 1) {
      if (a.done) a.done()
      g.action = null
    }
  }, [])

  /* ------------------------------------------------------------ rendering */
  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    let raf = 0

    const frame = (now) => {
      raf = requestAnimationFrame(frame)
      const g = G.current
      if (!g.board) return
      const dt = g.last ? Math.min(0.05, (now - g.last) / 1000) : 0.016
      g.last = now
      g.clock += dt
      step(g, dt)

      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = wrap.clientWidth
      const h = wrap.clientHeight
      if (!w || !h) return
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
        canvas.style.width = w + 'px'
        canvas.style.height = h + 'px'
      }

      const ctx = canvas.getContext('2d')
      const scale = Math.min(w / BOARD_W, h / BOARD_H)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      ctx.save()
      ctx.translate((w - BOARD_W * scale) / 2, (h - BOARD_H * scale) / 2)
      ctx.scale(scale, scale)

      ctx.drawImage(g.board, 0, 0)

      const me = turnRef.current
      if (g.phase !== 'menu' && g.positions[me] >= 1) {
        const c = squareCentre(g.positions[me])
        ctx.beginPath()
        ctx.arc(c.x, c.y, TILE * (0.42 + Math.sin(g.clock * 3) * 0.03), 0, Math.PI * 2)
        ctx.strokeStyle = PLAYERS[me].colour
        ctx.lineWidth = TILE * 0.055
        ctx.globalAlpha = 0.7
        ctx.stroke()
        ctx.globalAlpha = 1
      }

      // Draw back to front so nearer pieces overlap the ones behind them.
      const order = g.pieces
        .map((_, i) => i)
        .filter((i) => i < g.count)
        .sort((a, b) => g.pieces[a].y - g.pieces[b].y)
      for (const i of order) {
        const p = g.pieces[i]
        drawPiece(ctx, p.x, p.y, PLAYERS[i].colour, {
          lift: p.lift,
          lean: p.lean,
          swing: p.swing,
          dim: g.phase !== 'menu' && i !== me,
        })
      }

      if (g.phase !== 'menu') {
        drawDie(ctx, BOARD_W - TILE * 1.1, BOARD_H - TILE * 0.66 - g.dieLift, g.die, g.dieSpin)
      }

      for (const c of g.confetti) {
        ctx.save()
        ctx.translate(c.x, c.y)
        ctx.rotate(c.r)
        ctx.globalAlpha = Math.max(0, Math.min(1, c.life))
        ctx.fillStyle = c.colour
        ctx.fillRect(-c.s / 2, -c.s / 4, c.s, c.s / 2)
        ctx.restore()
      }

      ctx.restore()
    }

    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [step])

  /* ------------------------------------------------------------ game flow */
  const label = useCallback(
    (i) => (vsCpu && i > 0 ? `Computer ${i}` : PLAYERS[i].name),
    [vsCpu],
  )

  const startGame = useCallback((n, cpu) => {
    const g = G.current
    setCount(n)
    setVsCpu(cpu)
    setPositions([0, 0, 0, 0])
    setTurn(0)
    turnRef.current = 0
    setWinner(null)
    setDie(null)
    setMsg('Roll to begin — 132 must be landed on exactly.')
    setPhase('idle')
    g.count = n
    g.positions = [0, 0, 0, 0]
    g.queue = []
    g.action = null
    g.confetti = []
    g.sixes = 0
    g.pieces = PLAYERS.map((_, i) => {
      const s = standSpot(0, i, n)
      return { x: s.x, y: s.y, lift: 0, lean: 0, swing: 0 }
    })
  }, [])

  const roll = useCallback(() => {
    const g = G.current
    if (g.phase !== 'idle') return
    setPhase('busy')

    const value = rollDie()
    setDie(value)
    const me = turnRef.current
    const from = g.positions[me]
    const res = resolveMove(from, value)
    const seats = g.count
    const nameOf = (sq) => (NAMES[sq] ? ` · ${NAMES[sq]}` : '')
    const q = [{ kind: 'die', who: me, value, dur: 0.95, seats }]

    if (res.blocked) {
      q.push({
        kind: 'settle', who: me, to: from, dur: 0.3, seats,
        done: () => setMsg(`${label(me)} rolled ${value} — ${TOTAL - from} needed exactly.`),
      })
    } else {
      let prev = from
      for (const sq of res.walk) {
        q.push({ kind: 'hop', who: me, from: prev, to: sq, dur: 0.24, seats })
        prev = sq
      }
      if (res.jump?.type === 'ladder') {
        q.push({
          kind: 'climb', who: me, from: res.jump.from, to: res.jump.to, dur: 1.25, seats,
          done: () =>
            setMsg(`🪜 ${label(me)} climbs ${res.jump.from} → ${res.jump.to}${nameOf(res.jump.to)}`),
        })
      } else if (res.jump?.type === 'snake') {
        q.push({
          kind: 'slide', who: me, dur: 1.35, seats,
          spine: snakeSpine(res.jump.from, res.jump.to, snakeSeed(res.jump.from)),
          done: () =>
            setMsg(`🐍 ${label(me)} swallowed at ${res.jump.from}${nameOf(res.jump.from)} → ${res.jump.to}`),
        })
        q.push({ kind: 'settle', who: me, to: res.jump.to, dur: 0.28, seats })
      } else {
        q.push({
          kind: 'settle', who: me, to: res.landed, dur: 0.2, seats,
          done: () => setMsg(`${label(me)} rolled ${value} → ${res.landed}${nameOf(res.landed)}`),
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
        const c = squareCentre(TOTAL)
        for (let i = 0; i < 90; i++) {
          const ang = Math.random() * Math.PI * 2
          const sp = 2 + Math.random() * 7
          g.confetti.push({
            x: c.x, y: c.y,
            vx: Math.cos(ang) * sp,
            vy: Math.sin(ang) * sp - 6,
            vr: (Math.random() - 0.5) * 12,
            r: Math.random() * 6,
            s: 8 + Math.random() * 12,
            life: 1 + Math.random(),
            colour: ['#fbbf24', '#ef4444', '#22c55e', '#3b82f6', '#a855f7'][i % 5],
          })
        }
        setWinner(me)
        setPhase('won')
        setMsg(`🏆 ${label(me)} reached పరమపదము!`)
        setRecord((r) => {
          const next = { ...r, games: (r.games || 0) + 1, lastWinner: label(me) }
          try {
            localStorage.setItem(SAVE, JSON.stringify(next))
          } catch {
            /* ignore */
          }
          return next
        })
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
  }, [label])

  // The computer takes its turn once the board has settled.
  useEffect(() => {
    if (phase !== 'idle' || !vsCpu || turn === 0 || winner !== null) return
    const id = setTimeout(roll, 800)
    return () => clearTimeout(id)
  }, [phase, turn, vsCpu, winner, roll])

  const human = !vsCpu || turn === 0

  return (
    <div className="vp">
      <header className="vp-top">
        <a href="#/" className="vp-back">←</a>
        <div className="vp-title">
          వైకుంఠపాళి<span>Paramapada Sopanam · 132</span>
        </div>
        <button className="vp-icon" onClick={() => setPhase('menu')} title="New game">⟳</button>
      </header>

      <div className="vp-stage" ref={wrapRef}>
        <canvas ref={canvasRef} />

        {phase === 'menu' && (
          <div className="vp-overlay">
            <div className="vp-big">వైకుంఠపాళి</div>
            <p className="vp-sub">Climb the ladders, dodge the serpents, land on 132 exactly.</p>
            <div className="vp-choice">
              {[2, 3, 4].map((n) => (
                <button key={n} onClick={() => startGame(n, false)}>{n} players</button>
              ))}
            </div>
            <div className="vp-choice">
              <button className="vp-cta" onClick={() => startGame(2, true)}>Play vs computer</button>
            </div>
            {record.lastWinner && <p className="vp-tip">last winner · {record.lastWinner}</p>}
          </div>
        )}

        {phase === 'won' && (
          <div className="vp-overlay">
            <div className="vp-big">🏆</div>
            <div className="vp-win" style={{ color: PLAYERS[winner]?.colour }}>
              {label(winner)} wins
            </div>
            <p className="vp-sub">పరమపదము reached</p>
            <button className="vp-cta" onClick={() => startGame(count, vsCpu)}>Play again</button>
            <button className="vp-ghost" onClick={() => setPhase('menu')}>Change players</button>
          </div>
        )}
      </div>

      {phase !== 'menu' && (
        <div className="vp-panel">
          <div className="vp-players">
            {PLAYERS.slice(0, count).map((p, i) => (
              <div
                key={p.name}
                className={`vp-chip ${i === turn ? 'on' : ''}`}
                style={{ '--pc': p.colour }}
              >
                <b>{label(i)}</b>
                <span>{positions[i] || '–'}</span>
              </div>
            ))}
          </div>
          <div className="vp-msg">{msg}</div>
          {phase !== 'won' && (
            <button
              className="vp-roll"
              style={{ '--pc': PLAYERS[turn].colour }}
              onClick={roll}
              disabled={phase !== 'idle' || !human}
            >
              {phase === 'busy' ? '…' : human ? `Roll${die ? ` · ${die}` : ''}` : 'Computer…'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
