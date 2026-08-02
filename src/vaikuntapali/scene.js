// three.js builders for the Vaikuntapali board. Everything here is geometry
// and materials — the game rules live in board.js and the turn flow lives in
// the component.

import * as THREE from 'three'
import { COLS, ROWS, TOTAL, squareToPos, NAMES, LADDERS, SNAKES } from './board.js'

export const TILE = 1

/* ------------------------------------------------------------------ board */

/**
 * The printed sheet is drawn once into a canvas and used as a single texture.
 * 132 separate meshes would cost 132 draw calls for something that never
 * changes, and a texture also lets the Telugu square names render with the
 * device's own font.
 */
export function boardTexture() {
  const px = 170 // per square
  const c = document.createElement('canvas')
  c.width = COLS * px
  c.height = ROWS * px
  const g = c.getContext('2d')

  const warm = ['#fde68a', '#fecaca', '#bbf7d0', '#bfdbfe', '#ddd6fe', '#fed7aa']

  for (let n = 1; n <= TOTAL; n++) {
    const i = n - 1
    const row = Math.floor(i / COLS)
    const within = i % COLS
    const col = row % 2 === 0 ? within : COLS - 1 - within
    const x = col * px
    // Canvas y grows downward while the board's row 0 is the bottom row.
    const y = (ROWS - 1 - row) * px

    g.fillStyle = warm[(row + col) % warm.length]
    g.fillRect(x, y, px, px)

    if (n === TOTAL) {
      const grad = g.createLinearGradient(x, y, x + px, y + px)
      grad.addColorStop(0, '#fbbf24')
      grad.addColorStop(1, '#f59e0b')
      g.fillStyle = grad
      g.fillRect(x, y, px, px)
    }

    g.strokeStyle = 'rgba(120,53,15,0.55)'
    g.lineWidth = 3
    g.strokeRect(x + 1.5, y + 1.5, px - 3, px - 3)

    // A tinted corner flags squares that start a snake or a ladder, so the
    // board reads correctly even before the 3D pieces are noticed.
    if (LADDERS[n]) {
      g.fillStyle = 'rgba(21,128,61,0.30)'
      g.beginPath()
      g.moveTo(x + px, y + px)
      g.lineTo(x + px - 52, y + px)
      g.lineTo(x + px, y + px - 52)
      g.fill()
    } else if (SNAKES[n]) {
      g.fillStyle = 'rgba(190,18,60,0.30)'
      g.beginPath()
      g.moveTo(x + px, y + px)
      g.lineTo(x + px - 52, y + px)
      g.lineTo(x + px, y + px - 52)
      g.fill()
    }

    g.fillStyle = '#431407'
    g.font = `800 ${n === TOTAL ? 54 : 44}px system-ui, sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(String(n), x + px / 2, y + px / 2 - (NAMES[n] ? 14 : 0))

    if (NAMES[n]) {
      g.fillStyle = 'rgba(67,20,7,0.85)'
      g.font = '500 21px system-ui, sans-serif'
      const name = NAMES[n]
      // Squeeze rather than clip: these names matter more than the layout.
      const w = g.measureText(name).width
      const max = px - 14
      g.save()
      if (w > max) {
        g.translate(x + px / 2, y + px / 2 + 34)
        g.scale(max / w, 1)
        g.fillText(name, 0, 0)
      } else {
        g.fillText(name, x + px / 2, y + px / 2 + 34)
      }
      g.restore()
    }
  }

  const tex = new THREE.CanvasTexture(c)
  tex.anisotropy = 8
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function buildBoard() {
  const group = new THREE.Group()

  const top = new THREE.Mesh(
    new THREE.BoxGeometry(COLS * TILE, 0.35, ROWS * TILE),
    [
      new THREE.MeshStandardMaterial({ color: '#92400e', roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: '#92400e', roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ map: boardTexture(), roughness: 0.75 }),
      new THREE.MeshStandardMaterial({ color: '#78350f', roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: '#92400e', roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: '#92400e', roughness: 0.9 }),
    ],
  )
  top.position.y = -0.175
  top.receiveShadow = true
  group.add(top)

  // Raised rim, so the board reads as a physical object rather than a decal.
  const rim = new THREE.Mesh(
    new THREE.BoxGeometry(COLS * TILE + 0.7, 0.5, ROWS * TILE + 0.7),
    new THREE.MeshStandardMaterial({ color: '#7c2d12', roughness: 0.7 }),
  )
  rim.position.y = -0.42
  rim.receiveShadow = true
  group.add(rim)

  return group
}

/* ------------------------------------------------------------------ snake */

function snakeSkin(base, belly) {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 128
  const g = c.getContext('2d')
  g.fillStyle = base
  g.fillRect(0, 0, 128, 128)
  // Diamond scales.
  g.fillStyle = belly
  for (let y = 0; y < 128; y += 16) {
    for (let x = 0; x < 128; x += 16) {
      g.beginPath()
      g.moveTo(x + 8, y)
      g.lineTo(x + 16, y + 8)
      g.lineTo(x + 8, y + 16)
      g.lineTo(x, y + 8)
      g.closePath()
      g.fill()
    }
  }
  g.strokeStyle = 'rgba(0,0,0,0.18)'
  g.lineWidth = 2
  for (let y = 0; y < 128; y += 16) {
    g.beginPath()
    g.moveTo(0, y)
    g.lineTo(128, y)
    g.stroke()
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/**
 * A snake running from its head square down to its tail square.
 *
 * The body is a tube swept along a curve that arcs between the two squares.
 * It is tapered on the CPU at build time, and slithers in the vertex shader:
 * rebuilding the tube every frame would be far too expensive for a dozen
 * snakes, but a sine displacement along the curve costs nothing.
 */
export function buildSnake(headSq, tailSq, opts = {}) {
  const {
    base = '#16a34a',
    belly = '#65a30d',
    radius = 0.13,
    lift = 0.2,
    seed = 0,
  } = opts

  const a = squareToPos(headSq, TILE)
  const b = squareToPos(tailSq, TILE)

  // Control points that bow the body sideways so it never reads as a
  // straight pipe between two squares.
  const pts = []
  const steps = 7
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = a.x + (b.x - a.x) * t
    const z = a.z + (b.z - a.z) * t
    const bow = Math.sin(t * Math.PI * 1.6 + seed) * 0.8 * Math.sin(t * Math.PI)
    const perpX = -(b.z - a.z)
    const perpZ = b.x - a.x
    const len = Math.hypot(perpX, perpZ) || 1
    pts.push(
      new THREE.Vector3(
        x + (perpX / len) * bow,
        lift + Math.sin(t * Math.PI) * 0.14,
        z + (perpZ / len) * bow,
      ),
    )
  }

  const curve = new THREE.CatmullRomCurve3(pts)
  const tubular = 140
  const radial = 12
  const geo = new THREE.TubeGeometry(curve, tubular, radius, radial, false)

  // Taper: fat behind the head, thin at the tail tip.
  const pos = geo.attributes.position
  const nor = geo.attributes.normal
  const uv = geo.attributes.uv
  const along = new Float32Array(pos.count)
  const binorm = new Float32Array(pos.count * 3)
  const frames = curve.computeFrenetFrames(tubular, false)

  for (let i = 0; i < pos.count; i++) {
    const t = uv.getX(i) // 0 at the head end, 1 at the tail end
    along[i] = t
    const taper = 0.45 + 0.85 * Math.pow(1 - t, 0.65)
    const nx = nor.getX(i)
    const ny = nor.getY(i)
    const nz = nor.getZ(i)
    // Pull the surface back toward the axis by the taper factor.
    pos.setXYZ(
      i,
      pos.getX(i) - nx * radius * (1 - taper),
      pos.getY(i) - ny * radius * (1 - taper),
      pos.getZ(i) - nz * radius * (1 - taper),
    )
    const f = frames.binormals[Math.min(tubular, Math.round(t * tubular))]
    binorm[i * 3] = f.x
    binorm[i * 3 + 1] = f.y
    binorm[i * 3 + 2] = f.z
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  geo.setAttribute('aAlong', new THREE.BufferAttribute(along, 1))
  geo.setAttribute('aBinormal', new THREE.BufferAttribute(binorm, 3))

  const tex = snakeSkin(base, belly)
  tex.repeat.set(14, 2)
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, metalness: 0.12 })
  const uniforms = { uTime: { value: 0 }, uAmp: { value: 0.16 } }
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime
    sh.uniforms.uAmp = uniforms.uAmp
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         attribute float aAlong;
         attribute vec3 aBinormal;
         uniform float uTime;
         uniform float uAmp;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         // Waves travel from head to tail, fading out at the head so the
         // snake looks anchored where it bites the board.
         float wave = sin(aAlong * 9.0 - uTime * 2.4);
         transformed += aBinormal * wave * uAmp * smoothstep(0.0, 0.35, aAlong);`,
      )
  }

  const body = new THREE.Mesh(geo, mat)
  body.castShadow = true

  const group = new THREE.Group()
  group.add(body)

  // Head, sitting on its square and facing along the body.
  const headMat = new THREE.MeshStandardMaterial({ color: base, roughness: 0.4 })
  const head = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.35, 20, 16), headMat)
  head.scale.set(1.15, 0.8, 1.45)
  const p0 = curve.getPoint(0)
  const p1 = curve.getPoint(0.05)
  head.position.copy(p0)
  head.lookAt(p1)
  head.castShadow = true
  group.add(head)

  const eyeGeo = new THREE.SphereGeometry(radius * 0.3, 10, 8)
  const eyeMat = new THREE.MeshStandardMaterial({ color: '#fde047', emissive: '#a16207' })
  const pupilMat = new THREE.MeshBasicMaterial({ color: '#111' })
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat)
    eye.position.set(s * radius * 0.62, radius * 0.5, radius * 0.5)
    head.add(eye)
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.14, 8, 6), pupilMat)
    pupil.position.set(s * radius * 0.72, radius * 0.55, radius * 0.72)
    head.add(pupil)
  }

  const tongue = new THREE.Mesh(
    new THREE.ConeGeometry(radius * 0.13, radius * 1.5, 6),
    new THREE.MeshStandardMaterial({ color: '#ef4444' }),
  )
  tongue.rotation.x = Math.PI / 2
  tongue.position.set(0, 0, radius * 1.5)
  head.add(tongue)

  group.userData = { uniforms, curve, tongue, kind: 'snake', from: headSq, to: tailSq }
  return group
}

/* ----------------------------------------------------------------- ladder */

export function buildLadder(fromSq, toSq, opts = {}) {
  const { wood = '#a16207', rail = 0.075 } = opts
  const a = squareToPos(fromSq, TILE)
  const b = squareToPos(toSq, TILE)

  const start = new THREE.Vector3(a.x, 0.06, a.z)
  const end = new THREE.Vector3(b.x, 0.06, b.z)
  const dir = new THREE.Vector3().subVectors(end, start)
  const len = dir.length()
  // Sideways offset for the two rails, in the board plane.
  const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize().multiplyScalar(0.24)

  const group = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: wood, roughness: 0.62, metalness: 0.15 })

  const railGeo = new THREE.CylinderGeometry(rail, rail, len, 10)
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(railGeo, mat)
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5)
    m.position.copy(mid).addScaledVector(side, s)
    m.position.y = 0.34
    // Cylinders are built along Y, so aim that axis down the ladder.
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())
    m.castShadow = true
    group.add(m)
  }

  const rungs = Math.max(3, Math.round(len / 0.62))
  const rungGeo = new THREE.CylinderGeometry(rail * 0.8, rail * 0.8, 0.48, 8)
  const rungMat = new THREE.MeshStandardMaterial({ color: '#facc15', roughness: 0.5, metalness: 0.3 })
  for (let i = 1; i < rungs; i++) {
    const t = i / rungs
    const p = new THREE.Vector3().lerpVectors(start, end, t)
    const m = new THREE.Mesh(rungGeo, rungMat)
    m.position.set(p.x, 0.34, p.z)
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), side.clone().normalize())
    m.castShadow = true
    group.add(m)
  }

  group.userData = { kind: 'ladder', from: fromSq, to: toSq }
  return group
}

/* ------------------------------------------------------------------ pawn */

/**
 * A small stylised person. Built from primitives with named joints so the
 * component can pose it — walking, climbing a ladder or sliding down a snake.
 */
export function buildPawn(color, accent = '#fde68a') {
  const g = new THREE.Group()
  const skin = new THREE.MeshStandardMaterial({ color: '#c98a5e', roughness: 0.75 })
  const cloth = new THREE.MeshStandardMaterial({ color, roughness: 0.6 })
  const trim = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.5, metalness: 0.35 })

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.2, 6, 14), cloth)
  torso.position.y = 0.42
  torso.castShadow = true
  g.add(torso)

  const sash = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.028, 8, 20), trim)
  sash.position.y = 0.34
  sash.rotation.x = Math.PI / 2
  g.add(sash)

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 20, 16), skin)
  head.position.y = 0.68
  head.castShadow = true
  g.add(head)

  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.55),
    new THREE.MeshStandardMaterial({ color: '#1c1917', roughness: 0.85 }),
  )
  hair.position.y = 0.695
  g.add(hair)

  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.019, 8, 8),
      new THREE.MeshBasicMaterial({ color: '#1c1917' }),
    )
    eye.position.set(s * 0.042, 0.7, 0.1)
    g.add(eye)
  }

  const limbGeo = new THREE.CapsuleGeometry(0.038, 0.17, 4, 8)
  const joints = {}
  for (const [name, x, y] of [
    ['armL', -0.16, 0.52],
    ['armR', 0.16, 0.52],
    ['legL', -0.07, 0.22],
    ['legR', 0.07, 0.22],
  ]) {
    // Pivot at the shoulder or hip so a rotation swings the limb properly.
    const pivot = new THREE.Group()
    pivot.position.set(x, y, 0)
    const limb = new THREE.Mesh(limbGeo, name.startsWith('arm') ? skin : cloth)
    limb.position.y = -0.11
    limb.castShadow = true
    pivot.add(limb)
    g.add(pivot)
    joints[name] = pivot
  }

  g.userData = { joints, color }
  return g
}

/* ------------------------------------------------------------------ dice */

function pipTexture(n, fg = '#1c1917', bg = '#fffbeb') {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  g.fillStyle = bg
  g.fillRect(0, 0, 128, 128)
  g.fillStyle = fg
  const P = 32
  const M = 64
  const Q = 96
  const spots = {
    1: [[M, M]],
    2: [[P, P], [Q, Q]],
    3: [[P, P], [M, M], [Q, Q]],
    4: [[P, P], [Q, P], [P, Q], [Q, Q]],
    5: [[P, P], [Q, P], [M, M], [P, Q], [Q, Q]],
    6: [[P, P], [Q, P], [P, M], [Q, M], [P, Q], [Q, Q]],
  }[n]
  for (const [x, y] of spots) {
    g.beginPath()
    g.arc(x, y, 12, 0, Math.PI * 2)
    g.fill()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export function buildDie(size = 0.62) {
  // BoxGeometry material order is +X, -X, +Y, -Y, +Z, -Z. Opposite faces of a
  // real die sum to seven, which this ordering preserves.
  const faces = [3, 4, 1, 6, 2, 5]
  const mats = faces.map((n) => new THREE.MeshStandardMaterial({ map: pipTexture(n), roughness: 0.35 }))
  const m = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), mats)
  m.castShadow = true
  m.userData = { faces }
  return m
}

/**
 * Rotation that leaves `value` pointing up. Used to settle the die on the
 * number that was actually rolled, so the animation never contradicts the
 * result.
 */
export function dieRotationFor(value) {
  const q = {
    1: [0, 0, Math.PI / 2],
    2: [Math.PI / 2, 0, 0],
    3: [0, 0, 0],
    4: [Math.PI, 0, 0],
    5: [-Math.PI / 2, 0, 0],
    6: [0, 0, -Math.PI / 2],
  }[value] || [0, 0, 0]
  return new THREE.Euler(q[0], q[1], q[2])
}

/* ------------------------------------------------------- snake/ladder set */

export const SNAKE_SKINS = [
  { base: '#16a34a', belly: '#bef264' },
  { base: '#7c3aed', belly: '#c4b5fd' },
  { base: '#dc2626', belly: '#fca5a5' },
  { base: '#0891b2', belly: '#a5f3fc' },
  { base: '#ca8a04', belly: '#fde68a' },
  { base: '#db2777', belly: '#fbcfe8' },
  { base: '#4d7c0f', belly: '#d9f99d' },
]

export const LADDER_WOODS = ['#a16207', '#b45309', '#92400e', '#a3620d']
