// Maps the logical 11x12 grid onto a photograph of a real board.
//
// A photo is never taken square-on: the sheet is tilted, so its grid appears
// as a general quadrilateral, not a rectangle. A plane-to-plane projective
// transform (a homography) is exactly the right tool — it is the only linear
// map that turns the unit square into an arbitrary convex quadrilateral and
// keeps straight lines straight, which is what a flat printed board needs.

/**
 * Solve a small dense linear system by Gaussian elimination with partial
 * pivoting. Only ever called with n = 8, so clarity beats cleverness.
 * Returns null when the system is singular — four collinear corners, say.
 */
function solve(A, b) {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])

  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r
    }
    if (Math.abs(M[pivot][col]) < 1e-10) return null
    ;[M[col], M[pivot]] = [M[pivot], M[col]]

    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = M[r][col] / M[col][col]
      if (!f) continue
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c]
    }
  }
  return M.map((row, i) => row[n] / row[i])
}

/**
 * Homography taking the unit square to four corners, given in the order
 * top-left, top-right, bottom-right, bottom-left.
 *
 * Returns the eight coefficients of
 *   x = (a·u + b·v + c) / (g·u + h·v + 1)
 *   y = (d·u + e·v + f) / (g·u + h·v + 1)
 * or null if the corners do not form a usable quadrilateral.
 */
export function homographyFromCorners(corners) {
  if (!corners || corners.length !== 4) return null
  const src = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ]
  const A = []
  const b = []
  for (let i = 0; i < 4; i++) {
    const [u, v] = src[i]
    const { x, y } = corners[i]
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x])
    b.push(x)
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y])
    b.push(y)
  }
  const h = solve(A, b)
  if (!h || h.some((n) => !Number.isFinite(n))) return null
  return h
}

/** Apply a homography to a point in the unit square. */
export function project(h, u, v) {
  const [a, b, c, d, e, f, g, i] = h
  const w = g * u + i * v + 1
  if (Math.abs(w) < 1e-12) return { x: NaN, y: NaN }
  return { x: (a * u + b * v + c) / w, y: (d * u + e * v + f) / w }
}

/**
 * Centre of a square in photo pixels.
 *
 * `cols`/`rows` describe the grid; row 0 is the *bottom* row of the board,
 * while the corners are given from the top, hence the flip.
 */
export function squareCentreOnPhoto(h, cell, cols, rows) {
  const u = (cell.col + 0.5) / cols
  const v = (rows - 1 - cell.row + 0.5) / rows
  return project(h, u, v)
}

/**
 * Roughly how many pixels wide one square is near a given cell, used to size
 * the pieces so they match the photo's scale.
 */
export function cellSize(h, cell, cols, rows) {
  const u = (cell.col + 0.5) / cols
  const v = (rows - 1 - cell.row + 0.5) / rows
  const a = project(h, u - 0.5 / cols, v)
  const b = project(h, u + 0.5 / cols, v)
  const c = project(h, u, v - 0.5 / rows)
  const d = project(h, u, v + 0.5 / rows)
  return Math.min(Math.hypot(b.x - a.x, b.y - a.y), Math.hypot(d.x - c.x, d.y - c.y))
}

/** True when four tapped points make a sane, non-degenerate quadrilateral. */
export function cornersUsable(corners) {
  const h = homographyFromCorners(corners)
  if (!h) return false
  // The centre must land inside the hull, which rules out bow-tie orders.
  const mid = project(h, 0.5, 0.5)
  if (!Number.isFinite(mid.x) || !Number.isFinite(mid.y)) return false
  const area = polygonArea(corners)
  return area > 1000
}

function polygonArea(pts) {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    a += p.x * q.y - q.x * p.y
  }
  return Math.abs(a) / 2
}
