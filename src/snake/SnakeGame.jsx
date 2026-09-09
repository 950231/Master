import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createGame,
  step,
  tickMs,
  levelOf,
  isOpposite,
  mazeWalls,
  spawnPower,
  pelletScore,
  POWERS,
} from './snake.js'
import { buildSpine, stepBoluses, drawCobra, COBRA_SKINS } from './cobra.js'
import { unlock, cycleSound, soundLabel, play } from '../audio.js'
import './snake.css'

const COLS = 22
const ROWS = 16
const HS_KEY = 'snake.highscores.v2'
const PREF_KEY = 'snake.prefs.v1'

const MODES = [
  { id: 'classic', name: 'Classic', hint: 'Walls are lethal' },
  { id: 'wrap', name: 'Endless', hint: 'Phase through the edges' },
  { id: 'maze', name: 'Maze', hint: 'Obstacles in the arena' },
]

const SPEED_OPTS = [
  { id: 'chill', name: 'Chill', icon: '🐢' },
  { id: 'classic', name: 'Classic', icon: '🎮' },
  { id: 'turbo', name: 'Turbo', icon: '⚡' },
]

// Combo window: eat again within this and the multiplier climbs.
const COMBO_MS = 2600
const POWER_EVERY = 4 // pellets between power-up spawns

const SKINS = {
  neon: {
    bg: '#080512',
    grid: 'rgba(148,120,255,0.07)',
    head: '#5eead4',
    body: ['#22d3ee', '#a855f7', '#ec4899'],
    food: '#fb7185',
    glow: true,
  },
  retro: {
    bg: '#a9b665',
    grid: 'rgba(27,36,16,0.10)',
    head: '#1b2410',
    body: ['#1b2410', '#1b2410', '#1b2410'],
    food: '#1b2410',
    glow: false,
  },
}

const loadJSON = (k, f) => {
  try {
    return { ...f, ...JSON.parse(localStorage.getItem(k) || '{}') }
  } catch {
    return f
  }
}

const buzz = (ms) => {
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* haptics unsupported */
  }
}

const lerp = (a, b, t) => a + (b - a) * t

const isFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement)

/**
 * Ask for real fullscreen so the browser chrome stops eating the arena.
 * Silently ignored where it is unsupported or blocked — hiding the in-page
 * controls already gains some room on its own, so the toggle still does
 * something either way.
 */
function setFullscreen(on) {
  const el = document.documentElement
  try {
    if (on) (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el)
    else if (isFullscreen()) (document.exitFullscreen || document.webkitExitFullscreen)?.call(document)
  } catch {
    /* not available */
  }
}

export default function SnakeGame() {
  const [mode, setMode] = useState('classic')
  const [phase, setPhase] = useState('menu') // menu | playing | paused | over
  const [high, setHigh] = useState(() => loadJSON(HS_KEY, { classic: 0, wrap: 0, maze: 0 }))
  const [prefs, setPrefs] = useState(() =>
    loadJSON(PREF_KEY, { skin: 'neon', haptics: true, zen: false, speed: 'classic' }),
  )
  // Mirrored into React state only for the HUD; the loop reads the refs.
  const [hud, setHud] = useState({ score: 0, combo: 0, powers: {}, len: 3 })
  const [sound, setSound] = useState(soundLabel)

  const canvasRef = useRef(null)
  const stageRef = useRef(null)

  // ---- mutable game state, driven by the loop ----
  const G = useRef({
    game: null,
    prev: null, // snake positions before the last tick, for interpolation
    lastTick: 0,
    dur: 140,
    queue: [],
    particles: [],
    pops: [],
    shake: 0,
    anim: 0, // animation clock, only advances while playing
    lastFrame: 0,
    combo: 0,
    lastAte: 0,
    score: 0,
    power: null, // {x,y,kind} on the board
    active: {}, // kind -> expiry timestamp
    pelletsSincePower: 0,
    boluses: [], // meals still travelling down the body
    phase: 'menu',
    mode: 'classic',
  })

  useEffect(() => void (G.current.phase = phase), [phase])
  useEffect(() => void (G.current.mode = mode), [mode])
  useEffect(() => {
    try {
      localStorage.setItem(HS_KEY, JSON.stringify(high))
    } catch {
      /* ignore */
    }
  }, [high])
  useEffect(() => {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(prefs))
    } catch {
      /* ignore */
    }
  }, [prefs])

  const wallsFor = useCallback((m) => (m === 'maze' ? mazeWalls('box', COLS, ROWS) : []), [])

  const start = useCallback(() => {
    // Browsers only allow audio to begin inside a user gesture; starting a
    // run always is one.
    unlock()
    const g = G.current
    g.game = createGame(COLS, ROWS, { walls: wallsFor(g.mode) })
    g.prev = g.game.snake
    g.queue = []
    g.particles = []
    g.pops = []
    g.combo = 0
    g.score = 0
    g.lastAte = 0
    g.power = null
    g.active = {}
    g.pelletsSincePower = 0
    g.boluses = []
    g.shake = 0
    g.dur = tickMs(0, prefs.speed)
    g.anim = 0
    g.lastFrame = 0
    g.lastTick = performance.now()
    setHud({ score: 0, combo: 0, powers: {}, len: 3 })
    setPhase('playing')
  }, [wallsFor, prefs.speed])

  const turn = useCallback(
    (dir) => {
      const g = G.current
      if (!g.game || g.phase !== 'playing') return
      const last = g.queue.length ? g.queue[g.queue.length - 1] : g.game.dir
      if (dir === last || isOpposite(dir, last)) return
      if (g.queue.length < 2) {
        g.queue.push(dir)
        if (prefs.haptics) buzz(8)
        play('turn')
      }
    },
    [prefs.haptics],
  )

  const burst = (g, x, y, color, n = 14) => {
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random()
      const sp = 0.04 + Math.random() * 0.09
      g.particles.push({
        x: x + 0.5,
        y: y + 0.5,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 1,
        color,
      })
    }
  }

  // ---------------- main loop ----------------
  useEffect(() => {
    let raf = 0
    const canvas = canvasRef.current
    if (!canvas) return

    const loop = (now) => {
      raf = requestAnimationFrame(loop)
      const g = G.current
      const skin = SKINS[prefs.skin]
      // Cosmetic animations run off `anim`, which is frozen when not playing
      // so a pause looks genuinely paused.
      const frameDt = g.lastFrame ? now - g.lastFrame : 16
      g.lastFrame = now
      if (g.phase === 'playing') g.anim += frameDt
      const anim = g.anim

      // ---- logic tick ----
      if (g.phase === 'playing' && g.game) {
        // expire finished power-ups
        for (const k of Object.keys(g.active)) {
          if (g.active[k] && now > g.active[k]) delete g.active[k]
        }
        if (g.combo && now - g.lastAte > COMBO_MS) g.combo = 0

        const slow = !!g.active.slow
        const dur = tickMs(g.game.score, prefs.speed) * (slow ? 1.7 : 1)
        g.dur = dur

        if (now - g.lastTick >= dur) {
          g.lastTick = now
          const dir = g.queue.length ? g.queue.shift() : g.game.dir
          const before = g.game.snake
          const next = step({ ...g.game, dir }, COLS, ROWS, {
            wrap: g.mode === 'wrap',
            walls: wallsFor(g.mode),
            ghost: !!g.active.ghost,
          })
          g.prev = before

          if (!next.alive) {
            g.game = next
            g.shake = 1
            burst(g, before[0].x, before[0].y, '#ef4444', 26)
            if (prefs.haptics) buzz([30, 40, 60])
            play('die')
            setPhase('over')
            setHigh((h) => (g.score > h[g.mode] ? { ...h, [g.mode]: g.score } : h))
          } else {
            const head = next.snake[0]

            if (next.ate) {
              g.combo = now - g.lastAte < COMBO_MS ? g.combo + 1 : 1
              g.lastAte = now
              const gained = pelletScore(g.combo, !!g.active.double)
              g.score += gained
              // Bank the record immediately; waiting for death loses the score
              // when a run is abandoned (e.g. switching modes).
              const m = g.mode
              setHigh((h) => (g.score > h[m] ? { ...h, [m]: g.score } : h))
              g.pelletsSincePower++
              // The pellet is swallowed: it becomes a lump that travels
              // from the mouth all the way down to the tail.
              g.boluses.push({ d: 0, size: 1 })
              burst(g, head.x, head.y, skin.food, 16)
              g.pops.push({ x: head.x, y: head.y, text: `+${gained}`, life: 1 })
              if (prefs.haptics) buzz(g.combo > 1 ? 18 : 10)
              play('eat', g.combo)
              play('swallow')

              if (!g.power && g.pelletsSincePower >= POWER_EVERY) {
                g.pelletsSincePower = 0
                g.power = spawnPower(next.snake, COLS, ROWS, wallsFor(g.mode), next.food)
              }
            }

            // power-up pickup
            if (g.power && head.x === g.power.x && head.y === g.power.y) {
              const kind = g.power.kind
              const spec = POWERS[kind]
              burst(g, head.x, head.y, spec.color, 20)
              g.pops.push({ x: head.x, y: head.y, text: spec.label, life: 1.4 })
              if (prefs.haptics) buzz([12, 30, 12])
              play('power')
              if (kind === 'shrink') {
                const keep = Math.max(3, Math.ceil(next.snake.length / 2))
                next.snake = next.snake.slice(0, keep)
              } else {
                g.active[kind] = now + spec.ms
              }
              g.power = null
            }

            g.game = next
          }

          setHud({
            score: g.score,
            combo: g.combo,
            powers: { ...g.active },
            len: g.game.snake.length,
          })
        }
      }

      // ---- particles & popups ----
      const dt = g.phase === 'playing' || g.phase === 'over' ? 1 / 60 : 0
      g.particles = g.particles.filter((p) => {
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.004
        p.life -= dt * 1.6
        return p.life > 0
      })
      g.pops = g.pops.filter((p) => {
        p.y -= 0.02
        p.life -= dt * 1.1
        return p.life > 0
      })
      if (dt) g.shake *= 0.88

      // ---- render ----
      // Size the arena from the space free in *both* axes rather than width
      // alone, so it fills a tablet screen instead of staying phone-sized.
      // The grid itself is always 22x16, so a record set on one device means
      // the same thing on another — only the cells get bigger.
      const stageEl = stageRef.current
      if (!stageEl) return
      const dpr = window.devicePixelRatio || 1
      const cell = Math.max(
        8,
        Math.floor(Math.min((stageEl.clientWidth - 4) / COLS, (stageEl.clientHeight - 4) / ROWS)),
      )
      const w = cell * COLS
      const h = cell * ROWS
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
        canvas.style.width = w + 'px'
        canvas.style.height = h + 'px'
      }
      const ctx = canvas.getContext('2d')
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const sx = (Math.random() - 0.5) * 14 * g.shake
      const sy = (Math.random() - 0.5) * 14 * g.shake

      ctx.fillStyle = skin.bg
      ctx.fillRect(0, 0, w, h)
      ctx.save()
      ctx.translate(sx, sy)

      // grid
      ctx.strokeStyle = skin.grid
      ctx.lineWidth = 1
      for (let x = 1; x < COLS; x++) {
        ctx.beginPath()
        ctx.moveTo(Math.round(x * cell) + 0.5, 0)
        ctx.lineTo(Math.round(x * cell) + 0.5, h)
        ctx.stroke()
      }
      for (let y = 1; y < ROWS; y++) {
        ctx.beginPath()
        ctx.moveTo(0, Math.round(y * cell) + 0.5)
        ctx.lineTo(w, Math.round(y * cell) + 0.5)
        ctx.stroke()
      }

      const gm = g.game
      const t = gm && g.phase === 'playing' ? Math.min(1, (now - g.lastTick) / g.dur) : 1

      // walls
      const walls = wallsFor(g.mode)
      if (walls.length) {
        ctx.fillStyle = skin.glow ? 'rgba(168,85,247,0.30)' : 'rgba(27,36,16,0.85)'
        ctx.strokeStyle = skin.glow ? '#a855f7' : '#1b2410'
        ctx.lineWidth = 1.5
        for (const wl of walls) {
          const r = cell * 0.18
          const x = wl.x * cell + 2
          const y = wl.y * cell + 2
          const s = cell - 4
          ctx.beginPath()
          ctx.roundRect(x, y, s, s, r)
          ctx.fill()
          ctx.stroke()
        }
      }

      if (gm) {
        // food — an egg, so what gets swallowed reads as prey rather than
        // an abstract dot
        if (gm.food) {
          const pulse = 0.5 + 0.5 * Math.sin(anim / 180)
          const cx = gm.food.x * cell + cell / 2
          const cy = gm.food.y * cell + cell / 2
          const r = cell * (0.24 + pulse * 0.04)
          if (skin.glow) {
            ctx.shadowBlur = 20
            ctx.shadowColor = skin.food
          }
          ctx.beginPath()
          ctx.ellipse(cx, cy, r * 0.82, r * 1.06, 0, 0, Math.PI * 2)
          ctx.fillStyle = skin.food
          ctx.fill()
          ctx.shadowBlur = 0
          if (skin.glow) {
            ctx.beginPath()
            ctx.ellipse(cx - r * 0.26, cy - r * 0.36, r * 0.24, r * 0.16, -0.5, 0, Math.PI * 2)
            ctx.fillStyle = 'rgba(255,255,255,0.75)'
            ctx.fill()
          }
        }

        // power-up
        if (g.power) {
          const spec = POWERS[g.power.kind]
          const cx = g.power.x * cell + cell / 2
          const cy = g.power.y * cell + cell / 2
          const spin = anim / 400
          ctx.save()
          ctx.translate(cx, cy)
          ctx.rotate(spin)
          if (skin.glow) {
            ctx.shadowBlur = 20
            ctx.shadowColor = spec.color
          }
          ctx.fillStyle = spec.color
          const s = cell * 0.3
          ctx.beginPath()
          ctx.roundRect(-s, -s, s * 2, s * 2, s * 0.4)
          ctx.fill()
          ctx.restore()
          ctx.shadowBlur = 0
          ctx.font = `${Math.round(cell * 0.5)}px system-ui`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(spec.icon, cx, cy + 1)
          ctx.textAlign = 'start'
        }

        // snake — interpolated between the previous and current tick
        const cur = gm.snake
        const prev = g.prev || cur
        const ghosting = !!g.active.ghost

        const pts = cur.map((c, i) => {
          const p = prev[Math.min(i, prev.length - 1)] || c
          // Don't interpolate across a wrap jump.
          const jump = Math.abs(p.x - c.x) > 1 || Math.abs(p.y - c.y) > 1
          const px = jump ? c.x : lerp(p.x, c.x, t)
          const py = jump ? c.y : lerp(p.y, c.y, t)
          return { x: px * cell + cell / 2, y: py * cell + cell / 2 }
        })

        const spine = buildSpine(pts, cell)
        // Lumps only travel while play is running, so a pause holds them.
        if (g.phase === 'playing') {
          g.boluses = stepBoluses(g.boluses, frameDt / 1000, spine.total, 1.5)
        }
        const hd = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[gm.dir] || [1, 0]
        drawCobra(ctx, spine, {
          cell,
          base: cell * 0.34,
          boluses: g.boluses,
          skin: COBRA_SKINS[prefs.skin] || COBRA_SKINS.neon,
          dir: { x: hd[0], y: hd[1] },
          anim,
          ghost: ghosting,
        })
        ctx.globalAlpha = 1
      }

      // particles
      for (const p of g.particles) {
        ctx.globalAlpha = Math.max(0, p.life)
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(p.x * cell, p.y * cell, cell * 0.11 * p.life, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      // score popups
      ctx.font = `800 ${Math.round(cell * 0.62)}px system-ui, sans-serif`
      ctx.textAlign = 'center'
      for (const p of g.pops) {
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life))
        ctx.fillStyle = skin.glow ? '#fff' : '#1b2410'
        ctx.fillText(p.text, p.x * cell + cell / 2, p.y * cell + cell / 2)
      }
      ctx.globalAlpha = 1
      ctx.textAlign = 'start'

      ctx.restore()
    }

    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [prefs.skin, prefs.haptics, prefs.speed, wallsFor])

  // ---------------- input ----------------
  useEffect(() => {
    const keys = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      w: 'up', s: 'down', a: 'left', d: 'right',
      W: 'up', S: 'down', A: 'left', D: 'right',
    }
    const onKey = (e) => {
      if (keys[e.key]) {
        e.preventDefault()
        turn(keys[e.key])
      } else if (e.key === ' ') {
        e.preventDefault()
        setPhase((p) => (p === 'playing' ? 'paused' : p === 'paused' ? 'playing' : p))
        if (G.current.phase === 'menu' || G.current.phase === 'over') start()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [turn, start])

  // Swipe anywhere in the play area — the primary control on touch. Bound to
  // the stage rather than the board so the margins around a letterboxed arena
  // still steer.
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    let s = null
    const down = (e) => (s = { x: e.clientX, y: e.clientY, t: performance.now() })
    const move = (e) => {
      if (!s) return
      const dx = e.clientX - s.x
      const dy = e.clientY - s.y
      // Fire as soon as the gesture is unambiguous, so it feels instant.
      if (Math.hypot(dx, dy) < 22) return
      turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up')
      s = { x: e.clientX, y: e.clientY, t: performance.now() }
    }
    const up = () => (s = null)
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    }
  }, [turn])

  // resume the clock so a pause doesn't fast-forward the next tick
  useEffect(() => {
    if (phase === 'playing') G.current.lastTick = performance.now()
  }, [phase])

  // Leaving fullscreen by Esc or a system gesture must bring the controls
  // back, otherwise the button is left lying about the current state.
  useEffect(() => {
    const sync = () => {
      if (!isFullscreen()) setPrefs((p) => (p.zen ? { ...p, zen: false } : p))
    }
    document.addEventListener('fullscreenchange', sync)
    document.addEventListener('webkitfullscreenchange', sync)
    return () => {
      document.removeEventListener('fullscreenchange', sync)
      document.removeEventListener('webkitfullscreenchange', sync)
    }
  }, [])

  const activePowers = Object.keys(hud.powers || {})

  return (
    <div className={`sn2 skin-${prefs.skin} ${prefs.zen ? 'zen' : ''}`}>
      <header className="sn2-top">
        <a href="#/" className="sn2-back">←</a>
        <div className="sn2-title">SNAKE<span>·XR</span></div>
        <div className="sn2-tools">
          <button
            className="sn2-icon"
            onClick={() => setPrefs((p) => ({ ...p, skin: p.skin === 'neon' ? 'retro' : 'neon' }))}
            title="Toggle skin"
          >
            {prefs.skin === 'neon' ? '◐' : '◑'}
          </button>
          <button
            className={`sn2-icon sn2-zen ${prefs.zen ? 'on' : ''}`}
            onClick={() => {
              const next = !prefs.zen
              setFullscreen(next)
              setPrefs((p) => ({ ...p, zen: next }))
            }}
            title={prefs.zen ? 'Show controls' : 'Expand arena'}
          >
            {prefs.zen ? '⤡' : '⤢'}
          </button>
        </div>
      </header>

      <div className="sn2-hud">
        <div className="sn2-stat">
          <span>SCORE</span>
          <b>{hud.score}</b>
        </div>
        <div className={`sn2-combo ${hud.combo > 1 ? 'hot' : ''}`}>
          {hud.combo > 1 ? `COMBO ×${hud.combo}` : `LV ${levelOf(hud.score)}`}
        </div>
        <div className="sn2-stat right">
          <span>BEST</span>
          <b>{high[mode]}</b>
        </div>
      </div>

      <div className="sn2-stage" ref={stageRef}>
        <div className="sn2-board">
          <canvas ref={canvasRef} />

          {activePowers.length > 0 && phase === 'playing' && (
            <div className="sn2-powers">
              {activePowers.map((k) => (
                <span key={k} style={{ '--pc': POWERS[k].color }}>
                  {POWERS[k].icon} {POWERS[k].label}
                </span>
              ))}
            </div>
          )}

          {phase !== 'playing' && (
            <div className="sn2-overlay">
              {phase === 'menu' && (
                <>
                  <div className="sn2-big">SNAKE</div>
                  <p className="sn2-hint-l">{MODES.find((m) => m.id === mode).hint}</p>
                  <button className="sn2-cta" onClick={start}>TAP TO PLAY</button>
                  <p className="sn2-tip">swipe anywhere to steer</p>
                </>
              )}
              {phase === 'paused' && (
                <>
                  <div className="sn2-big">PAUSED</div>
                  <button className="sn2-cta" onClick={() => setPhase('playing')}>RESUME</button>
                </>
              )}
              {phase === 'over' && (
                <>
                  <div className="sn2-big red">GAME OVER</div>
                  <div className="sn2-final">{hud.score}</div>
                  <p className="sn2-hint-l">
                    {hud.score >= high[mode] && hud.score > 0
                      ? '🏆 NEW RECORD'
                      : `best ${high[mode]} · length ${hud.len}`}
                  </p>
                  <button className="sn2-cta" onClick={start}>PLAY AGAIN</button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="sn2-actions">
        <button
          className="sn2-pause"
          onClick={() =>
            setPhase((p) => (p === 'playing' ? 'paused' : p === 'paused' ? 'playing' : p))
          }
          disabled={phase === 'menu' || phase === 'over'}
        >
          {phase === 'playing' ? '❚❚ PAUSE' : '▶ RESUME'}
        </button>
        <button
          className={`sn2-haptic ${sound.on ? 'on' : ''}`}
          onClick={() => {
            unlock()
            cycleSound()
            setSound(soundLabel())
            play('tap')
          }}
          title="Arcade, Nokia or muted"
        >
          {sound.icon} {sound.text}
        </button>
        <button
          className={`sn2-haptic ${prefs.haptics ? 'on' : ''}`}
          onClick={() => setPrefs((p) => ({ ...p, haptics: !p.haptics }))}
        >
          {prefs.haptics ? '📳' : '📴'}
        </button>
      </div>

      <div className="sn2-modes">
        {MODES.map((m) => (
          <button
            key={m.id}
            className={`sn2-mode ${mode === m.id ? 'active' : ''}`}
            onClick={() => {
              setMode(m.id)
              setPhase('menu')
              G.current.game = null
            }}
          >
            <b>{m.name}</b>
            <span>{high[m.id]}</span>
          </button>
        ))}
      </div>

      <div className="sn2-speed">
        <span className="sn2-speed-label">SPEED</span>
        {SPEED_OPTS.map((sp) => (
          <button
            key={sp.id}
            className={`sn2-speed-btn ${prefs.speed === sp.id ? 'active' : ''}`}
            onClick={() => {
              setPrefs((p) => ({ ...p, speed: sp.id }))
              // Changing speed resets to the menu, since the curve differs.
              setPhase('menu')
              G.current.game = null
            }}
          >
            {sp.icon} {sp.name}
          </button>
        ))}
      </div>

      <div className="sn2-legend">
        {Object.entries(POWERS).map(([k, v]) => (
          <span key={k} style={{ '--pc': v.color }}>{v.icon} {v.label}</span>
        ))}
      </div>
    </div>
  )
}
