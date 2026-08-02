import { useCallback, useEffect, useRef, useState } from 'react'
import { createGame, step, tickMs, levelOf, isOpposite, mazeWalls } from './snake.js'
import './snake.css'

const COLS = 24
const ROWS = 18
const HS_KEY = 'snake.highscores.v1'

const MODES = [
  { id: 'classic', name: 'Classic', hint: 'Walls kill you' },
  { id: 'wrap', name: 'Endless', hint: 'Pass through walls' },
  { id: 'maze', name: 'Maze', hint: 'Obstacles in the arena' },
]

// Nokia 3310 LCD palette — olive backlight with near-black pixels.
const LCD = {
  bg: '#a9b665',
  off: '#9fae5d',
  on: '#1b2410',
  dim: '#66743a',
}

function loadHighScores() {
  try {
    return { classic: 0, wrap: 0, maze: 0, ...JSON.parse(localStorage.getItem(HS_KEY) || '{}') }
  } catch {
    return { classic: 0, wrap: 0, maze: 0 }
  }
}

export default function SnakeGame() {
  const [mode, setMode] = useState('classic')
  const [game, setGame] = useState(null)
  const [phase, setPhase] = useState('menu') // menu | playing | paused | over
  const [high, setHigh] = useState(loadHighScores)

  const canvasRef = useRef(null)
  // Buffer of queued turns so quick double-taps (e.g. up then left) both land
  // on separate ticks instead of overwriting each other.
  const queueRef = useRef([])
  const gameRef = useRef(game)
  const phaseRef = useRef(phase)
  useEffect(() => void (gameRef.current = game), [game])
  useEffect(() => void (phaseRef.current = phase), [phase])

  const walls = useCallback(
    () => (mode === 'maze' ? mazeWalls('box', COLS, ROWS) : []),
    [mode],
  )

  useEffect(() => {
    try {
      localStorage.setItem(HS_KEY, JSON.stringify(high))
    } catch {
      /* ignore */
    }
  }, [high])

  const start = useCallback(() => {
    queueRef.current = []
    setGame(createGame(COLS, ROWS, { walls: walls() }))
    setPhase('playing')
  }, [walls])

  const turn = useCallback((dir) => {
    const g = gameRef.current
    if (!g || phaseRef.current !== 'playing') return
    const q = queueRef.current
    const last = q.length ? q[q.length - 1] : g.dir
    if (dir === last || isOpposite(dir, last)) return
    if (q.length < 2) q.push(dir)
  }, [])

  // ---- game loop ----
  useEffect(() => {
    if (phase !== 'playing' || !game) return
    const id = setTimeout(() => {
      setGame((g) => {
        if (!g) return g
        const q = queueRef.current
        const dir = q.length ? q.shift() : g.dir
        const next = step({ ...g, dir }, COLS, ROWS, {
          wrap: mode === 'wrap',
          walls: walls(),
        })
        if (!next.alive) {
          setPhase('over')
          setHigh((h) => (next.score > h[mode] ? { ...h, [mode]: next.score } : h))
        }
        return next
      })
    }, tickMs(game.score))
    return () => clearTimeout(id)
  }, [game, phase, mode, walls])

  // ---- input ----
  useEffect(() => {
    const keys = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
      w: 'up',
      s: 'down',
      a: 'left',
      d: 'right',
      W: 'up',
      S: 'down',
      A: 'left',
      D: 'right',
    }
    const onKey = (e) => {
      if (keys[e.key]) {
        e.preventDefault()
        turn(keys[e.key])
      } else if (e.key === ' ') {
        e.preventDefault()
        if (phaseRef.current === 'playing') setPhase('paused')
        else if (phaseRef.current === 'paused') setPhase('playing')
        else start()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [turn, start])

  // swipe on the screen
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    let s = null
    const down = (e) => (s = { x: e.clientX, y: e.clientY })
    const up = (e) => {
      if (!s) return
      const dx = e.clientX - s.x
      const dy = e.clientY - s.y
      s = null
      if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return
      turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up')
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointerup', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointerup', up)
    }
  }, [turn])

  // ---- render ----
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const cell = Math.floor(w / COLS)
    const gw = cell * COLS
    const gh = cell * ROWS
    const hud = Math.round(cell * 1.6)
    const h = gh + hud

    if (canvas.width !== Math.round(gw * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(gw * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.height = h + 'px'
    }
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // LCD background with faint "unlit pixel" grid
    ctx.fillStyle = LCD.bg
    ctx.fillRect(0, 0, gw, h)
    ctx.fillStyle = LCD.off
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        ctx.fillRect(x * cell + 1, hud + y * cell + 1, cell - 2, cell - 2)
      }
    }

    // HUD strip
    const score = game?.score ?? 0
    ctx.fillStyle = LCD.on
    ctx.font = `bold ${Math.round(cell * 0.95)}px "Courier New", monospace`
    ctx.textBaseline = 'middle'
    ctx.fillText(String(score).padStart(4, '0'), 4, hud / 2)
    const lvl = `L${levelOf(score)}`
    ctx.fillText(lvl, gw / 2 - ctx.measureText(lvl).width / 2, hud / 2)
    const hi = `HI ${high[mode]}`
    ctx.fillText(hi, gw - ctx.measureText(hi).width - 4, hud / 2)
    ctx.fillStyle = LCD.dim
    ctx.fillRect(0, hud - 2, gw, 1)

    const px = (x, y, inset = 1) =>
      ctx.fillRect(x * cell + inset, hud + y * cell + inset, cell - inset * 2, cell - inset * 2)

    // walls
    ctx.fillStyle = LCD.on
    for (const wl of walls()) {
      px(wl.x, wl.y, 2)
      ctx.fillStyle = LCD.bg
      ctx.fillRect(wl.x * cell + cell / 2 - 1, hud + wl.y * cell + cell / 2 - 1, 2, 2)
      ctx.fillStyle = LCD.on
    }

    if (game) {
      // food blinks like the original
      if (game.food && Math.floor(Date.now() / 250) % 2 === 0) {
        ctx.fillStyle = LCD.on
        px(game.food.x, game.food.y, 3)
      }
      // snake: solid blocks, head slightly fuller
      game.snake.forEach((s, i) => {
        ctx.fillStyle = LCD.on
        px(s.x, s.y, i === 0 ? 0.5 : 1.5)
      })
    }
  }, [game, high, mode, walls, phase])

  // keep the blinking food animating while idle
  useEffect(() => {
    if (phase !== 'playing') return
    const id = setInterval(() => setGame((g) => (g ? { ...g } : g)), 250)
    return () => clearInterval(id)
  }, [phase])

  const score = game?.score ?? 0

  return (
    <div className="snake-app">
      <header className="sn-header">
        <a href="#/" className="back-link">← Apps</a>
        <h1>Snake</h1>
        <div />
      </header>

      <div className="sn-phone">
        <div className="sn-brand">NOKIA</div>

        <div className="sn-screen">
          <canvas ref={canvasRef} />

          {phase !== 'playing' && (
            <div className="sn-lcd-overlay">
              {phase === 'menu' && (
                <>
                  <div className="sn-title">SNAKE II</div>
                  <div className="sn-sub">{MODES.find((m) => m.id === mode).hint}</div>
                  <button className="sn-lcd-btn" onClick={start}>PLAY</button>
                </>
              )}
              {phase === 'paused' && (
                <>
                  <div className="sn-title">PAUSED</div>
                  <button className="sn-lcd-btn" onClick={() => setPhase('playing')}>RESUME</button>
                </>
              )}
              {phase === 'over' && (
                <>
                  <div className="sn-title">GAME OVER</div>
                  <div className="sn-score">SCORE {score}</div>
                  <div className="sn-sub">
                    {score >= high[mode] && score > 0 ? 'NEW HIGH SCORE!' : `BEST ${high[mode]}`}
                  </div>
                  <button className="sn-lcd-btn" onClick={start}>PLAY AGAIN</button>
                </>
              )}
            </div>
          )}
        </div>

        {/* D-pad */}
        <div className="sn-pad">
          <button className="up" onClick={() => turn('up')} aria-label="Up">▲</button>
          <button className="left" onClick={() => turn('left')} aria-label="Left">◀</button>
          <button
            className="mid"
            onClick={() =>
              phase === 'playing' ? setPhase('paused') : phase === 'paused' ? setPhase('playing') : start()
            }
          >
            {phase === 'playing' ? '❚❚' : '▶'}
          </button>
          <button className="right" onClick={() => turn('right')} aria-label="Right">▶</button>
          <button className="down" onClick={() => turn('down')} aria-label="Down">▼</button>
        </div>
      </div>

      <div className="sn-modes">
        {MODES.map((m) => (
          <button
            key={m.id}
            className={`sn-mode ${mode === m.id ? 'active' : ''}`}
            onClick={() => {
              setMode(m.id)
              setGame(null)
              setPhase('menu')
            }}
          >
            {m.name}
            <span>best {high[m.id]}</span>
          </button>
        ))}
      </div>

      <p className="sn-hint">
        Swipe the screen, use the D-pad, or press arrow keys / WASD. Space pauses.
      </p>
    </div>
  )
}
