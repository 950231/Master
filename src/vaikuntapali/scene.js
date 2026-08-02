// three.js builders for the Vaikuntapali board. Everything here is geometry
// and materials — the game rules live in board.js and the turn flow lives in
// the component.

import * as THREE from 'three'
import { COLS, ROWS, TOTAL, squareToPos, NAMES, LADDERS, SNAKES } from './board.js'
import { TITLE_ROW, ART, PALETTE } from './art.js'

export const TILE = 1

/** Depth of the decorative bands printed above and below the grid. */
export const BAND_TITLE = 1.5
export const BAND_DEITY = 1.0
export const BAND_FOOT = 1.0

/** Rounded rectangle path, used all over the printed artwork. */
function roundRect(g, x, y, w, h, r) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

function canvasTex(w, h, draw, repeatX = 1, repeatY = 1) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  if (repeatX !== 1 || repeatY !== 1) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(repeatX, repeatY)
  }
  return t
}

/**
 * Turn a drawn greyscale image into a normal map, so painted detail such as
 * snake scales and wood grain catches the light instead of looking flat.
 */
function normalFromHeight(w, h, draw, strength = 2.4, repeatX = 1, repeatY = 1) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')
  draw(g, w, h)
  const src = g.getImageData(0, 0, w, h)
  const out = g.createImageData(w, h)
  const at = (x, y) => src.data[((((y + h) % h) * w + ((x + w) % w)) << 2)] / 255
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength
      const len = Math.hypot(dx, dy, 1)
      const i = (y * w + x) << 2
      out.data[i] = ((-dx / len) * 0.5 + 0.5) * 255
      out.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255
      out.data[i + 2] = (1 / len) * 0.5 * 255 + 127
      out.data[i + 3] = 255
    }
  }
  g.putImageData(out, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeatX, repeatY)
  return t
}

/* ------------------------------------------------------------------ board */

/**
 * The printed sheet is drawn once into a canvas and used as a single texture.
 * 132 separate meshes would cost 132 draw calls for something that never
 * changes, and a texture also lets the Telugu square names render with the
 * device's own font.
 */
export function boardTexture() {
  const px = 190 // pixels per square
  const c = document.createElement('canvas')
  c.width = COLS * px
  c.height = ROWS * px
  const g = c.getContext('2d')

  for (let n = 1; n <= TOTAL; n++) {
    const i = n - 1
    const row = Math.floor(i / COLS)
    const within = i % COLS
    const col = row % 2 === 0 ? within : COLS - 1 - within
    const x = col * px
    // Canvas y grows downward, while row 0 is the bottom row of the board.
    const y = (ROWS - 1 - row) * px

    const wash = PALETTE[(row * 3 + col * 2) % PALETTE.length]
    g.fillStyle = n === TOTAL ? '#fcd34d' : wash
    g.fillRect(x, y, px, px)

    // Printed sheets show a fine white keyline inside a dark rule.
    g.strokeStyle = 'rgba(255,255,255,0.75)'
    g.lineWidth = 6
    g.strokeRect(x + 5, y + 5, px - 10, px - 10)
    g.strokeStyle = '#7c2d12'
    g.lineWidth = 4
    g.strokeRect(x + 2, y + 2, px - 4, px - 4)

    const letter = TITLE_ROW[n]
    if (letter) {
      // The top row carries the board's name, one letter to a square.
      g.fillStyle = '#7f1d1d'
      g.font = `900 ${Math.round(px * 0.62)}px system-ui, sans-serif`
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(letter, x + px / 2, y + px * 0.56)
    } else if (ART[n]) {
      g.font = `${Math.round(px * 0.5)}px system-ui, "Apple Color Emoji", sans-serif`
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(ART[n], x + px / 2, y + px * 0.52)
    } else {
      // A quiet lotus motif keeps unillustrated squares from looking bare.
      g.save()
      g.globalAlpha = 0.16
      g.strokeStyle = '#7c2d12'
      g.lineWidth = 3
      for (let k = 0; k < 8; k++) {
        g.beginPath()
        g.ellipse(
          x + px / 2, y + px * 0.52, px * 0.06, px * 0.16,
          (k * Math.PI) / 4, 0, Math.PI * 2,
        )
        g.stroke()
      }
      g.restore()
    }

    // Number badge, top-left as on the sheet.
    g.fillStyle = 'rgba(255,255,255,0.9)'
    roundRect(g, x + 9, y + 9, px * 0.33, px * 0.2, 7)
    g.fill()
    g.strokeStyle = 'rgba(124,45,18,0.55)'
    g.lineWidth = 2
    g.stroke()
    g.fillStyle = '#7c2d12'
    g.font = `800 ${Math.round(px * 0.15)}px system-ui, sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(String(n), x + 9 + px * 0.165, y + 9 + px * 0.1)

    if (NAMES[n]) {
      g.fillStyle = '#5b1f0a'
      g.font = `600 ${Math.round(px * 0.105)}px system-ui, sans-serif`
      const name = NAMES[n]
      const max = px - 20
      const w = g.measureText(name).width
      g.save()
      g.translate(x + px / 2, y + px * 0.88)
      if (w > max) g.scale(max / w, 1)
      g.fillText(name, 0, 0)
      g.restore()
    }

    // Green flag at a ladder foot, red at a snake head.
    if (LADDERS[n] || SNAKES[n]) {
      const up = !!LADDERS[n]
      g.fillStyle = up ? '#15803d' : '#be123c'
      g.beginPath()
      g.moveTo(x + px, y + px)
      g.lineTo(x + px - px * 0.26, y + px)
      g.lineTo(x + px, y + px - px * 0.26)
      g.fill()
      g.fillStyle = '#fff'
      g.font = `800 ${Math.round(px * 0.12)}px system-ui, sans-serif`
      g.fillText(up ? '↑' + LADDERS[n] : '↓' + SNAKES[n], x + px * 0.83, y + px * 0.92)
    }
  }

  const tex = new THREE.CanvasTexture(c)
  tex.anisotropy = 8
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** The yellow masthead printed above the grid. */
function titleBandTexture() {
  return canvasTex(2048, Math.round((2048 / COLS) * BAND_TITLE), (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, '#fde047')
    grad.addColorStop(1, '#facc15')
    g.fillStyle = grad
    g.fillRect(0, 0, w, h)
    g.strokeStyle = '#b45309'
    g.lineWidth = 10
    g.strokeRect(5, 5, w - 10, h - 10)
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillStyle = '#dc2626'
    g.font = `900 ${Math.round(h * 0.52)}px system-ui, sans-serif`
    g.fillText('వైకుంఠపాళి', w / 2, h * 0.42)
    g.fillStyle = '#7c2d12'
    g.font = `700 ${Math.round(h * 0.17)}px system-ui, sans-serif`
    g.fillText('పరమపద సోపానపథము', w / 2, h * 0.78)
  })
}

/** Framed panels above the grid, echoing the sheet's picture strip. */
function deityBandTexture() {
  return canvasTex(2048, Math.round((2048 / COLS) * BAND_DEITY), (g, w, h) => {
    g.fillStyle = '#fde68a'
    g.fillRect(0, 0, w, h)
    const n = COLS
    const cw = w / n
    for (let i = 0; i < n; i++) {
      g.fillStyle = PALETTE[i % PALETTE.length]
      roundRect(g, i * cw + 6, 6, cw - 12, h - 12, 10)
      g.fill()
      g.strokeStyle = '#b45309'
      g.lineWidth = 5
      g.stroke()
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.font = `${Math.round(h * 0.5)}px system-ui, "Apple Color Emoji", sans-serif`
      g.fillText(i % 2 ? '🪷' : '🕉', i * cw + cw / 2, h / 2)
    }
  })
}

/** The elephant frieze along the bottom of the sheet. */
function footBandTexture() {
  return canvasTex(2048, Math.round((2048 / COLS) * BAND_FOOT), (g, w, h) => {
    g.fillStyle = '#fde047'
    g.fillRect(0, 0, w, h)
    g.strokeStyle = '#b45309'
    g.lineWidth = 8
    g.strokeRect(4, 4, w - 8, h - 8)
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.font = `${Math.round(h * 0.62)}px system-ui, "Apple Color Emoji", sans-serif`
    const n = 12
    for (let i = 0; i < n; i++) g.fillText('🐘', ((i + 0.5) * w) / n, h * 0.55)
  })
}

export function buildBoard() {
  const group = new THREE.Group()

  const paper = new THREE.MeshStandardMaterial({ map: boardTexture(), roughness: 0.82 })
  const edge = new THREE.MeshStandardMaterial({ color: '#8b3a0f', roughness: 0.75 })

  const grid = new THREE.Mesh(new THREE.BoxGeometry(COLS * TILE, 0.3, ROWS * TILE), [
    edge, edge, paper, edge, edge, edge,
  ])
  grid.position.y = -0.15
  grid.receiveShadow = true
  group.add(grid)

  // Printed bands sit beyond the grid, so the playing squares keep their
  // coordinates and squareToPos stays the single source of truth.
  const bands = [
    [titleBandTexture(), BAND_TITLE, -(ROWS / 2) - BAND_DEITY - BAND_TITLE / 2],
    [deityBandTexture(), BAND_DEITY, -(ROWS / 2) - BAND_DEITY / 2],
    [footBandTexture(), BAND_FOOT, ROWS / 2 + BAND_FOOT / 2],
  ]
  for (const [map, depth, z] of bands) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(COLS * TILE, 0.3, depth), [
      edge, edge, new THREE.MeshStandardMaterial({ map, roughness: 0.82 }), edge, edge, edge,
    ])
    m.position.set(0, -0.15, z)
    m.receiveShadow = true
    group.add(m)
  }

  const totalDepth = ROWS + BAND_TITLE + BAND_DEITY + BAND_FOOT
  const zCentre = (-(BAND_TITLE + BAND_DEITY) + BAND_FOOT) / 2
  const rim = new THREE.Mesh(
    new THREE.BoxGeometry(COLS * TILE + 0.8, 0.55, totalDepth + 0.8),
    new THREE.MeshStandardMaterial({ color: '#7c2d12', roughness: 0.55, metalness: 0.15 }),
  )
  rim.position.set(0, -0.42, zCentre)
  rim.receiveShadow = true
  group.add(rim)

  group.userData = { totalDepth, zCentre }
  return group
}

/* ------------------------------------------------------------------ snake */

/** Diamond-scale pattern, drawn once and reused as colour + relief. */
function scalePattern(g, w, h, base, belly) {
  g.fillStyle = base
  g.fillRect(0, 0, w, h)
  // Overlapping rounded scales in offset rows, the way they lie on a real
  // snake, rather than isolated diamonds that read as spots when tiled.
  const s = w / 18
  const rowH = s * 0.55
  let r = 0
  for (let y = -s; y < h + s; y += rowH, r++) {
    for (let x = -s; x < w + s; x += s) {
      const off = (r % 2) * (s / 2)
      const cx = x + off + s / 2
      g.beginPath()
      g.moveTo(cx - s / 2, y)
      g.quadraticCurveTo(cx - s / 2, y + s * 0.9, cx, y + s * 0.9)
      g.quadraticCurveTo(cx + s / 2, y + s * 0.9, cx + s / 2, y)
      g.closePath()
      g.fillStyle = r % 3 === 0 ? base : belly
      g.fill()
      g.strokeStyle = 'rgba(0,0,0,0.22)'
      g.lineWidth = 1.4
      g.stroke()
    }
  }
  // Darker flank shading top and bottom, lighter belly through the middle.
  const grad = g.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0, 'rgba(0,0,0,0.42)')
  grad.addColorStop(0.5, 'rgba(255,255,255,0.20)')
  grad.addColorStop(1, 'rgba(0,0,0,0.42)')
  g.fillStyle = grad
  g.fillRect(0, 0, w, h)
}

function snakeSkin(base, belly, rx, ry) {
  return canvasTex(256, 256, (g, w, h) => scalePattern(g, w, h, base, belly), rx, ry)
}

function snakeRelief(rx, ry) {
  return normalFromHeight(
    256, 256,
    (g, w, h) => scalePattern(g, w, h, '#6e6e6e', '#d2d2d2'),
    3.0, rx, ry,
  )
}

/** Varnished wood, for the ladder rails and rungs. */
function woodPattern(g, w, h, light, dark) {
  g.fillStyle = light
  g.fillRect(0, 0, w, h)
  for (let i = 0; i < 90; i++) {
    const y = Math.random() * h
    g.strokeStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.16})`
    g.lineWidth = 0.6 + Math.random() * 2.2
    g.beginPath()
    g.moveTo(0, y)
    for (let x = 0; x <= w; x += 16) {
      g.lineTo(x, y + Math.sin((x / w) * Math.PI * 4 + i) * 3.2)
    }
    g.stroke()
  }
  const grad = g.createLinearGradient(0, 0, w, 0)
  grad.addColorStop(0, 'rgba(0,0,0,0.30)')
  grad.addColorStop(0.45, 'rgba(255,255,255,0.16)')
  grad.addColorStop(1, 'rgba(0,0,0,0.34)')
  g.fillStyle = grad
  g.fillRect(0, 0, w, h)
  g.fillStyle = dark
  g.globalAlpha = 0.12
  g.fillRect(0, 0, w, h)
  g.globalAlpha = 1
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

  // Physical material: scales read as raised relief and pick up a wet sheen
  // from the environment instead of looking like painted plastic.
  // Tile density follows the snake's actual length, otherwise a long body
  // stretches a few scales across the whole board.
  const rx = Math.max(10, Math.round(curve.getLength() * 3.2))
  const ry = 4
  const mat = new THREE.MeshPhysicalMaterial({
    map: snakeSkin(base, belly, rx, ry),
    normalMap: snakeRelief(rx, ry),
    normalScale: new THREE.Vector2(1.1, 1.1),
    roughness: 0.34,
    metalness: 0.0,
    clearcoat: 0.75,
    clearcoatRoughness: 0.28,
    sheen: 0.4,
    sheenColor: new THREE.Color(belly),
  })
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
  const headMat = new THREE.MeshPhysicalMaterial({
    color: base,
    roughness: 0.32,
    clearcoat: 0.8,
    clearcoatRoughness: 0.25,
  })
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

  const light = new THREE.Color(wood).lerp(new THREE.Color('#fde68a'), 0.35).getStyle()
  const mat = new THREE.MeshPhysicalMaterial({
    map: canvasTex(256, 256, (g, w, h) => woodPattern(g, w, h, light, wood), 1, Math.max(2, len / 2)),
    normalMap: normalFromHeight(
      256, 256,
      (g, w, h) => woodPattern(g, w, h, '#9a9a9a', '#6a6a6a'),
      1.6, 1, Math.max(2, len / 2),
    ),
    roughness: 0.5,
    clearcoat: 0.45,
    clearcoatRoughness: 0.4,
  })

  const railGeo = new THREE.CylinderGeometry(rail, rail, len, 14)
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
  const rungGeo = new THREE.CylinderGeometry(rail * 0.78, rail * 0.78, 0.48, 12)
  const rungMat = new THREE.MeshPhysicalMaterial({
    map: canvasTex(128, 128, (g, w, h) => woodPattern(g, w, h, '#e9c46a', '#b45309'), 1, 2),
    roughness: 0.44,
    clearcoat: 0.5,
  })
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

  const skin = new THREE.MeshPhysicalMaterial({
    color: '#b97a51', roughness: 0.62, clearcoat: 0.18, sheen: 0.25,
  })
  const cloth = new THREE.MeshPhysicalMaterial({
    color, roughness: 0.72, sheen: 0.6, sheenColor: new THREE.Color(accent),
  })
  const trim = new THREE.MeshStandardMaterial({
    color: accent, roughness: 0.28, metalness: 0.8,
  })
  const hairMat = new THREE.MeshStandardMaterial({ color: '#181210', roughness: 0.72 })

  const add = (mesh, x, y, z) => {
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    g.add(mesh)
    return mesh
  }

  // Torso tapering to the waist, plus a wrapped lower garment.
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.135, 0.24, 18), cloth), 0, 0.5, 0)
  add(new THREE.Mesh(new THREE.SphereGeometry(0.125, 18, 14), cloth), 0, 0.6, 0).scale.set(1, 0.75, 0.8)
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.115, 0.26, 18), cloth), 0, 0.26, 0)
  add(new THREE.Mesh(new THREE.TorusGeometry(0.142, 0.026, 10, 24), trim), 0, 0.38, 0).rotation.x = Math.PI / 2

  // Neck and head.
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.05, 0.07, 12), skin), 0, 0.665, 0)
  const head = add(new THREE.Mesh(new THREE.SphereGeometry(0.105, 24, 20), skin), 0, 0.765, 0)
  head.scale.set(0.92, 1.06, 0.95)

  const hair = add(
    new THREE.Mesh(
      new THREE.SphereGeometry(0.112, 24, 20, 0, Math.PI * 2, 0, Math.PI * 0.62),
      hairMat,
    ),
    0, 0.772, -0.006,
  )
  hair.scale.set(0.94, 1.02, 0.98)
  // Top-knot, the way the figures are drawn on the sheet.
  add(new THREE.Mesh(new THREE.SphereGeometry(0.042, 14, 12), hairMat), 0, 0.855, -0.03)

  for (const sgn of [-1, 1]) {
    const eye = add(new THREE.Mesh(new THREE.SphereGeometry(0.017, 10, 10),
      new THREE.MeshStandardMaterial({ color: '#fdfdfd', roughness: 0.25 })), sgn * 0.037, 0.775, 0.088)
    eye.scale.set(1, 0.8, 0.55)
    add(new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 8),
      new THREE.MeshBasicMaterial({ color: '#120d0a' })), sgn * 0.037, 0.774, 0.098)
  }
  // Forehead mark.
  add(new THREE.Mesh(new THREE.CircleGeometry(0.012, 12),
    new THREE.MeshBasicMaterial({ color: '#b91c1c' })), 0, 0.805, 0.098)

  const nose = add(new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.04, 8), skin), 0, 0.757, 0.098)
  nose.rotation.x = Math.PI / 2

  // Limbs hang from pivots so a rotation swings the whole limb.
  const joints = {}
  const limb = (name, x, y, upper, lower, mat, endMat, endR) => {
    const pivot = new THREE.Group()
    pivot.position.set(x, y, 0)
    const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, upper, 6, 12), mat)
    a.position.y = -upper / 2 - 0.03
    a.castShadow = true
    pivot.add(a)
    const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.031, lower, 6, 12), mat)
    b.position.y = -upper - lower / 2 - 0.07
    b.castShadow = true
    pivot.add(b)
    const end = new THREE.Mesh(new THREE.SphereGeometry(endR, 12, 10), endMat)
    end.position.y = -upper - lower - 0.11
    end.castShadow = true
    pivot.add(end)
    g.add(pivot)
    joints[name] = pivot
  }
  limb('armL', -0.145, 0.585, 0.11, 0.10, skin, skin, 0.035)
  limb('armR', 0.145, 0.585, 0.11, 0.10, skin, skin, 0.035)
  limb('legL', -0.062, 0.235, 0.11, 0.11, cloth, skin, 0.04)
  limb('legR', 0.062, 0.235, 0.11, 0.11, cloth, skin, 0.04)

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
