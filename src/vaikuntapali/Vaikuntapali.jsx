import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import {
  COLS,
  ROWS,
  TOTAL,
  LADDERS,
  SNAKES,
  NAMES,
  squareToPos,
  rollDie,
  resolveMove,
  turnAfter,
} from './board.js'
import {
  TILE,
  buildBoard,
  buildSnake,
  buildLadder,
  buildPawn,
  buildDie,
  dieRotationFor,
  BAND_TITLE,
  BAND_DEITY,
  BAND_FOOT,
  SNAKE_SKINS,
  LADDER_WOODS,
} from './scene.js'
import './vp.css'

const PLAYERS = [
  { name: 'Player 1', color: '#ef4444', accent: '#fecaca' },
  { name: 'Player 2', color: '#3b82f6', accent: '#bfdbfe' },
  { name: 'Player 3', color: '#22c55e', accent: '#bbf7d0' },
  { name: 'Player 4', color: '#eab308', accent: '#fef08a' },
]

const SAVE = 'vaikuntapali.v1'
const ease = (t) => t * t * (3 - 2 * t)

/**
 * Where the camera should look. Pointing straight at the moving piece swings
 * the board out of frame on a 11x12 grid, so the aim only leans partway
 * toward the action and drifts back to the middle once it is over.
 */
const LEAN = 0.42

// The printed bands sit beyond the grid, so the sheet's centre is not the
// grid's centre and the camera has to allow for both.
const SHEET_DEPTH = ROWS + BAND_TITLE + BAND_DEITY + BAND_FOOT
const SHEET_Z = (-(BAND_TITLE + BAND_DEITY) + BAND_FOOT) / 2

function aim(s, x, z) {
  s.wantTarget.set(x * LEAN, 0, SHEET_Z + (z - SHEET_Z) * LEAN)
}

/**
 * How far back the camera has to sit for the whole board to fit.
 *
 * A fixed distance only ever suits one window shape — tuned for a wide
 * screen it overflows badly when the tablet is held upright, where the
 * horizontal field of view is the tight one. This derives the distance from
 * the board's extents and the current field of view, so both orientations
 * frame it properly. Tilting the camera foreshortens the depth, hence the
 * sin(polar) term.
 */
function fitDistance(camera, polar) {
  const halfW = (COLS + 1) / 2
  const halfD = (SHEET_DEPTH + 0.9) / 2
  const tanV = Math.tan(((camera.fov * Math.PI) / 180) / 2)
  const tanH = tanV * camera.aspect
  const needH = halfW / tanH
  const needV = (halfD * Math.max(0.35, Math.sin(polar))) / tanV
  // Perspective magnifies the near edge of the board more than this flat
  // estimate allows for, so the result is padded rather than taken literally.
  return Math.max(needH, needV) * 1.28
}

/** Where a pawn stands, nudged so several on one square stay visible. */
function pawnSpot(square, seat, count) {
  if (square < 1) {
    // Waiting on the printed border below the grid, where they stay in
    // frame and on the sheet instead of hanging off the corner.
    return new THREE.Vector3(-3.2 + seat * 1.5, 0, ROWS / 2 + BAND_FOOT / 2)
  }
  const p = squareToPos(square, TILE)
  if (count <= 1) return new THREE.Vector3(p.x, 0, p.z)
  const a = (seat / count) * Math.PI * 2
  return new THREE.Vector3(p.x + Math.cos(a) * 0.22, 0, p.z + Math.sin(a) * 0.22)
}

export default function Vaikuntapali() {
  const [count, setCount] = useState(2)
  const [vsCpu, setVsCpu] = useState(true)
  const [positions, setPositions] = useState([0, 0, 0, 0])
  const [turn, setTurn] = useState(0)
  const [phase, setPhase] = useState('menu') // menu | idle | busy | won
  const [die, setDie] = useState(null)
  const [msg, setMsg] = useState('')
  const [winner, setWinner] = useState(null)
  const [best, setBest] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(SAVE) || '{}')
    } catch {
      return {}
    }
  })

  const mountRef = useRef(null)
  const S = useRef({}) // three.js objects and the animation queue

  /* ------------------------------------------------------------ scene set-up */
  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#0b1120')
    scene.fog = new THREE.Fog('#0b1120', 22, 44)

    const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 200)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    // Filmic tone mapping keeps the bright printed colours from clipping to
    // flat blocks the way the default linear mapping does.
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.0
    mount.appendChild(renderer.domElement)

    // Image-based lighting. Without an environment, physical materials have
    // nothing to reflect and the snakes read as matte plastic.
    const pmrem = new THREE.PMREMGenerator(renderer)
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environmentIntensity = 0.30

    scene.add(new THREE.HemisphereLight('#cfe4ff', '#3b2a1a', 0.22))
    const sun = new THREE.DirectionalLight('#fff6e5', 1.5)
    sun.position.set(7, 15, 8)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.bias = -0.0006
    sun.shadow.normalBias = 0.02
    const d = 13
    sun.shadow.camera.left = -d
    sun.shadow.camera.right = d
    sun.shadow.camera.top = d
    sun.shadow.camera.bottom = -d
    sun.shadow.camera.far = 40
    scene.add(sun)
    const rim = new THREE.PointLight('#a855f7', 18, 40)
    rim.position.set(-9, 7, -10)
    scene.add(rim)
    const fill = new THREE.DirectionalLight('#bcd4ff', 0.22)
    fill.position.set(-8, 6, -6)
    scene.add(fill)

    // A table under the board, so it reads as an object sitting somewhere
    // rather than a slab floating in a void.
    const table = new THREE.Mesh(
      new THREE.CircleGeometry(24, 48),
      new THREE.MeshStandardMaterial({ color: '#131c33', roughness: 1 }),
    )
    table.rotation.x = -Math.PI / 2
    table.position.y = -0.68
    table.receiveShadow = true
    scene.add(table)

    scene.add(buildBoard())

    // Snakes and ladders, each with its own look.
    const snakes = new Map()
    let i = 0
    for (const [head, tail] of Object.entries(SNAKES)) {
      const skin = SNAKE_SKINS[i % SNAKE_SKINS.length]
      const span = Number(head) - tail
      const g = buildSnake(Number(head), tail, {
        ...skin,
        radius: 0.115 + Math.min(0.075, span / 620),
        seed: i * 1.7,
      })
      scene.add(g)
      snakes.set(Number(head), g)
      i++
    }
    const ladders = new Map()
    i = 0
    for (const [foot, top] of Object.entries(LADDERS)) {
      const g = buildLadder(Number(foot), top, { wood: LADDER_WOODS[i % LADDER_WOODS.length] })
      scene.add(g)
      ladders.set(Number(foot), g)
      i++
    }

    const pawns = PLAYERS.map((p) => {
      const g = buildPawn(p.color, p.accent)
      // Anatomically the pieces would be about a third of a square tall; at
      // that size they vanish against the board, so they are played up.
      g.scale.setScalar(1.9)
      scene.add(g)
      return g
    })

    const dieMesh = buildDie()
    // On the printed border rather than floating beside the board, so it is
    // inside the framed area in both orientations.
    dieMesh.position.set(4.1, 0.9, ROWS / 2 + BAND_FOOT / 2)
    scene.add(dieMesh)

    S.current = {
      scene,
      camera,
      renderer,
      snakes,
      ladders,
      pawns,
      dieMesh,
      queue: [],
      action: null,
      clock: new THREE.Clock(),
      // `zoom` is the player's pinch multiplier on top of the fitted distance.
      orbit: { az: 0, pol: 1.12, zoom: 1 },
      target: new THREE.Vector3(0, 0, SHEET_Z),
      wantTarget: new THREE.Vector3(0, 0, SHEET_Z),
      positions: [0, 0, 0, 0],
      count: 2,
      onDone: null,
    }

    // Bloom, so gilt edges and the winning square glow rather than sit flat.
    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.16, 0.7, 0.95)
    composer.addPass(bloom)
    composer.addPass(new OutputPass())
    S.current.composer = composer

    const resize = () => {
      const w = mount.clientWidth
      const h = mount.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h, false)
      composer.setSize(w, h)
      bloom.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(mount)

    /* ---- camera controls: drag to orbit, pinch or wheel to zoom ---- */
    const el = renderer.domElement
    const ptrs = new Map()
    let lastPinch = 0
    const down = (e) => {
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY })
      try {
        el.setPointerCapture(e.pointerId)
      } catch {
        /* synthetic pointer */
      }
    }
    const move = (e) => {
      const prev = ptrs.get(e.pointerId)
      if (!prev) return
      const o = S.current.orbit
      if (ptrs.size === 1) {
        o.az -= (e.clientX - prev.x) * 0.006
        o.pol = Math.min(1.45, Math.max(0.18, o.pol - (e.clientY - prev.y) * 0.005))
      }
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()]
        const dist = Math.hypot(a.x - b.x, a.y - b.y)
        if (lastPinch) o.zoom = Math.min(2.2, Math.max(0.5, o.zoom * (lastPinch / dist)))
        lastPinch = dist
      }
    }
    const up = (e) => {
      ptrs.delete(e.pointerId)
      if (ptrs.size < 2) lastPinch = 0
    }
    const wheel = (e) => {
      e.preventDefault()
      const o = S.current.orbit
      o.zoom = Math.min(2.2, Math.max(0.5, o.zoom + e.deltaY * 0.0012))
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('wheel', wheel, { passive: false })

    /* ---------------------------- render loop ---------------------------- */
    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const s = S.current
      const dt = Math.min(0.05, s.clock.getDelta())
      const now = s.clock.elapsedTime

      for (const g of s.snakes.values()) {
        g.userData.uniforms.uTime.value = now
        // Tongue flicks on an off-beat so the snakes are not in lockstep.
        const f = Math.sin(now * 3 + g.userData.from)
        g.userData.tongue.scale.z = f > 0.6 ? 1 + f : 0.15
      }

      stepAnimation(s, dt, now)

      // Idle bob for everyone who is not mid-action.
      s.pawns.forEach((p, idx) => {
        if (s.action && s.action.pawn === idx) return
        p.position.y = Math.sin(now * 2 + idx) * 0.02
        p.userData.joints.armL.rotation.x = Math.sin(now * 2 + idx) * 0.09
        p.userData.joints.armR.rotation.x = -Math.sin(now * 2 + idx) * 0.09
        p.userData.joints.legL.rotation.x = 0
        p.userData.joints.legR.rotation.x = 0
      })

      if (!s.action) {
        s.dieMesh.position.y = 0.85 + Math.sin(now * 1.7) * 0.06
        s.dieMesh.rotation.y += dt * 0.35
        // Nothing is moving, so drift back to a view of the whole sheet.
        s.wantTarget.set(0, 0, SHEET_Z)
      }

      // Camera orbits its target and eases toward whatever it should watch.
      s.target.lerp(s.wantTarget, 1 - Math.pow(0.001, dt))
      const o = s.orbit
      const dist = fitDistance(s.camera, o.pol) * o.zoom
      s.camera.position.set(
        s.target.x + Math.sin(o.az) * Math.cos(o.pol) * dist,
        s.target.y + Math.sin(o.pol) * dist,
        s.target.z + Math.cos(o.az) * Math.cos(o.pol) * dist,
      )
      s.camera.lookAt(s.target)
      s.composer.render()
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('wheel', wheel)
      composer.dispose()
      pmrem.dispose()
      renderer.dispose()
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose()
        if (o.material) {
          for (const m of [].concat(o.material)) {
            if (m.map) m.map.dispose()
            m.dispose()
          }
        }
      })
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement)
    }
  }, [])

  /* ------------------------------------------------------- animation driver */
  const stepAnimation = (s, dt, now) => {
    if (!s.action) {
      s.action = s.queue.shift() || null
      if (!s.action) return
      s.action.t = 0
    }
    const a = s.action
    a.t += dt / a.dur
    const t = Math.min(1, a.t)
    const pawn = s.pawns[a.pawn]

    if (a.kind === 'die') {
      const m = s.dieMesh
      if (t < 0.75) {
        m.position.y = 0.85 + Math.abs(Math.sin(t * 12)) * 1.5
        m.rotation.x += dt * 15
        m.rotation.y += dt * 11
        m.rotation.z += dt * 9
      } else {
        // Settle onto the face that was actually rolled.
        const e = dieRotationFor(a.value)
        const k = ease((t - 0.75) / 0.25)
        m.position.y = 0.85 + (1 - k) * 0.4
        m.rotation.x = THREE.MathUtils.lerp(m.rotation.x % (Math.PI * 2), e.x, k)
        m.rotation.y = THREE.MathUtils.lerp(m.rotation.y % (Math.PI * 2), e.y, k)
        m.rotation.z = THREE.MathUtils.lerp(m.rotation.z % (Math.PI * 2), e.z, k)
      }
    } else if (a.kind === 'hop') {
      const from = pawnSpot(a.from, a.pawn, a.seats)
      const to = pawnSpot(a.to, a.pawn, a.seats)
      pawn.position.lerpVectors(from, to, ease(t))
      pawn.position.y = Math.sin(t * Math.PI) * 0.42
      const swing = Math.sin(t * Math.PI * 2) * 0.7
      pawn.userData.joints.legL.rotation.x = swing
      pawn.userData.joints.legR.rotation.x = -swing
      pawn.userData.joints.armL.rotation.x = -swing * 0.8
      pawn.userData.joints.armR.rotation.x = swing * 0.8
      if (to.distanceTo(from) > 0.01) pawn.lookAt(to.x, 0, to.z)
      aim(s, to.x, to.z)
    } else if (a.kind === 'climb') {
      const from = pawnSpot(a.from, a.pawn, a.seats)
      const to = pawnSpot(a.to, a.pawn, a.seats)
      pawn.position.lerpVectors(from, to, ease(t))
      pawn.position.y = 0.34 + Math.sin(t * Math.PI) * 0.12
      // Hand over hand, faster than the walk cycle.
      const c = Math.sin(t * Math.PI * 10)
      pawn.userData.joints.armL.rotation.x = -1.9 + c * 0.6
      pawn.userData.joints.armR.rotation.x = -1.9 - c * 0.6
      pawn.userData.joints.legL.rotation.x = c * 0.5
      pawn.userData.joints.legR.rotation.x = -c * 0.5
      pawn.lookAt(to.x, pawn.position.y, to.z)
      aim(s, to.x, to.z)
    } else if (a.kind === 'slide') {
      // Ride the snake's own curve, so the pawn really follows the body.
      const snake = s.snakes.get(a.from)
      const p = snake ? snake.userData.curve.getPoint(ease(t)) : null
      if (p) pawn.position.set(p.x, p.y - 0.1, p.z)
      else pawn.position.lerpVectors(pawnSpot(a.from, a.pawn, a.seats), pawnSpot(a.to, a.pawn, a.seats), ease(t))
      pawn.rotation.y += dt * 9
      pawn.userData.joints.armL.rotation.x = -2.5
      pawn.userData.joints.armR.rotation.x = -2.5
      pawn.userData.joints.legL.rotation.x = 0.5
      pawn.userData.joints.legR.rotation.x = -0.5
      aim(s, pawn.position.x, pawn.position.z)
    } else if (a.kind === 'settle') {
      const to = pawnSpot(a.to, a.pawn, a.seats)
      pawn.position.lerp(to, ease(t))
      pawn.rotation.y = THREE.MathUtils.lerp(pawn.rotation.y, 0, ease(t))
    }

    if (t >= 1) {
      if (a.done) a.done()
      s.action = null
    }
  }

  /* ------------------------------------------------------------- game flow */
  const seatsOn = useCallback(
    (square, list) => list.filter((p) => p === square).length || 1,
    [],
  )

  const placeAll = useCallback((pos, n) => {
    const s = S.current
    if (!s.pawns) return
    s.pawns.forEach((p, i) => {
      p.visible = i < n
      const spot = pawnSpot(pos[i], i, n)
      p.position.copy(spot)
    })
  }, [])

  const startGame = useCallback(
    (n, cpu) => {
      setCount(n)
      setVsCpu(cpu)
      setPositions([0, 0, 0, 0])
      setTurn(0)
      setWinner(null)
      setDie(null)
      setMsg('Roll to begin — you need an exact 132 to reach పరాశక్తి.')
      setPhase('idle')
      const s = S.current
      s.count = n
      s.positions = [0, 0, 0, 0]
      s.queue = []
      s.action = null
      placeAll([0, 0, 0, 0], n)
      s.wantTarget.set(0, 0, SHEET_Z)
      s.orbit.zoom = 1
    },
    [placeAll],
  )

  const roll = useCallback(() => {
    const s = S.current
    if (phase !== 'idle') return
    setPhase('busy')

    const value = rollDie()
    setDie(value)
    const me = turn
    const from = s.positions[me]
    const res = resolveMove(from, value)
    const seats = Math.max(1, s.count)

    const q = []
    q.push({ kind: 'die', pawn: me, value, dur: 0.85, seats })

    if (res.blocked) {
      q.push({
        kind: 'settle',
        pawn: me,
        to: from,
        dur: 0.25,
        seats,
        done: () => setMsg(`${PLAYERS[me].name} rolled ${value} — too many, ${TOTAL - from} needed exactly.`),
      })
    } else {
      let prev = from
      for (const sq of res.walk) {
        const to = sq
        q.push({ kind: 'hop', pawn: me, from: prev, to, dur: 0.22, seats })
        prev = to
      }
      if (res.jump && res.jump.type === 'ladder') {
        q.push({
          kind: 'climb',
          pawn: me,
          from: res.jump.from,
          to: res.jump.to,
          dur: 1.2,
          seats,
          done: () =>
            setMsg(`🪜 ${PLAYERS[me].name} climbs ${res.jump.from} → ${res.jump.to}${NAMES[res.jump.to] ? ' · ' + NAMES[res.jump.to] : ''}`),
        })
      } else if (res.jump && res.jump.type === 'snake') {
        q.push({
          kind: 'slide',
          pawn: me,
          from: res.jump.from,
          to: res.jump.to,
          dur: 1.3,
          seats,
          done: () =>
            setMsg(`🐍 ${PLAYERS[me].name} is swallowed at ${res.jump.from}${NAMES[res.jump.from] ? ' (' + NAMES[res.jump.from] + ')' : ''} → ${res.jump.to}`),
        })
        q.push({ kind: 'settle', pawn: me, to: res.jump.to, dur: 0.3, seats })
      } else {
        q.push({
          kind: 'settle',
          pawn: me,
          to: res.landed,
          dur: 0.2,
          seats,
          done: () =>
            setMsg(`${PLAYERS[me].name} rolled ${value} → ${res.landed}${NAMES[res.landed] ? ' · ' + NAMES[res.landed] : ''}`),
        })
      }
    }

    // Everything after the last animation frame runs here.
    q[q.length - 1] = {
      ...q[q.length - 1],
      done: ((orig) => () => {
        if (orig) orig()
        s.positions[me] = res.landed
        setPositions([...s.positions])

        if (res.won) {
          setWinner(me)
          setPhase('won')
          setMsg(`🏆 ${PLAYERS[me].name} reached పరమపదము!`)
          setBest((b) => {
            const key = `p${s.count}`
            const next = { ...b, [key]: (b[key] || 0) + 1, lastWinner: PLAYERS[me].name }
            try {
              localStorage.setItem(SAVE, JSON.stringify(next))
            } catch {
              /* ignore */
            }
            return next
          })
          return
        }

        const after = turnAfter(value, s.sixes || 0)
        s.sixes = after.sixes
        if (after.burned) {
          setMsg(`${PLAYERS[me].name} rolled three sixes — turn forfeited.`)
        }
        if (after.again) {
          setPhase('idle')
        } else {
          setTurn((t) => (t + 1) % s.count)
          setPhase('idle')
        }
      })(q[q.length - 1].done),
    }

    s.queue.push(...q)
  }, [phase, turn])

  // The computer takes its own turn once the board has settled.
  useEffect(() => {
    if (phase !== 'idle' || !vsCpu || turn === 0 || winner !== null) return
    const id = setTimeout(() => roll(), 850)
    return () => clearTimeout(id)
  }, [phase, turn, vsCpu, winner, roll])

  useEffect(() => {
    if (phase !== 'menu') placeAll(positions, count)
  }, [positions, count, phase, placeAll])

  const human = !vsCpu || turn === 0
  const cur = PLAYERS[turn]

  return (
    <div className="vp">
      <header className="vp-top">
        <a href="#/" className="vp-back">←</a>
        <div className="vp-title">
          వైకుంఠపాళి<span>Paramapada Sopanam · 132</span>
        </div>
        <button className="vp-icon" onClick={() => setPhase('menu')} title="New game">⟳</button>
      </header>

      <div className="vp-stage">
        <div className="vp-canvas" ref={mountRef} />

        {phase !== 'menu' && (
          <div className="vp-players">
            {PLAYERS.slice(0, count).map((p, i) => (
              <div key={p.name} className={`vp-chip ${i === turn ? 'on' : ''}`} style={{ '--pc': p.color }}>
                <b>{vsCpu && i > 0 ? `CPU ${i}` : p.name}</b>
                <span>{positions[i] || '–'}</span>
              </div>
            ))}
          </div>
        )}

        {phase === 'menu' && (
          <div className="vp-overlay">
            <div className="vp-big">వైకుంఠపాళి</div>
            <p className="vp-sub">Climb the ladders, dodge the serpents, reach 132 exactly.</p>
            <div className="vp-choice">
              {[2, 3, 4].map((n) => (
                <button key={n} onClick={() => startGame(n, false)}>{n} players</button>
              ))}
            </div>
            <div className="vp-choice">
              <button className="vp-cta" onClick={() => startGame(2, true)}>Play vs computer</button>
            </div>
            {best.lastWinner && <p className="vp-tip">last winner · {best.lastWinner}</p>}
          </div>
        )}

        {phase === 'won' && (
          <div className="vp-overlay">
            <div className="vp-big">🏆</div>
            <div className="vp-win" style={{ color: PLAYERS[winner]?.color }}>
              {vsCpu && winner > 0 ? `CPU ${winner}` : PLAYERS[winner]?.name} wins
            </div>
            <p className="vp-sub">పరమపదము reached</p>
            <button className="vp-cta" onClick={() => startGame(count, vsCpu)}>Play again</button>
            <button className="vp-ghost" onClick={() => setPhase('menu')}>Change players</button>
          </div>
        )}
      </div>

      {phase !== 'menu' && phase !== 'won' && (
        <div className="vp-controls">
          <div className="vp-msg">{msg}</div>
          <button
            className="vp-roll"
            style={{ '--pc': cur.color }}
            onClick={roll}
            disabled={phase !== 'idle' || !human}
          >
            {phase === 'busy' ? '…' : human ? `Roll${die ? ` · ${die}` : ''}` : `CPU ${turn}…`}
          </button>
        </div>
      )}

      <p className="vp-hint">drag to orbit · pinch or scroll to zoom</p>
    </div>
  )
}
