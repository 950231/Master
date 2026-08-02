// Pure game logic for Nokia-style Snake, kept separate from rendering so the
// rules can be tested directly.

export const DIRS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

/** True when two directions are exact opposites (an illegal 180° turn). */
export function isOpposite(a, b) {
  const A = DIRS[a]
  const B = DIRS[b]
  if (!A || !B) return false
  return A.x + B.x === 0 && A.y + B.y === 0
}

const key = (p) => `${p.x},${p.y}`

/**
 * Place food on a free cell. `rand` is injectable so tests are deterministic.
 * Returns null when the board is completely full (a perfect game).
 */
export function spawnFood(snake, cols, rows, walls = [], rand = Math.random) {
  const taken = new Set([...snake.map(key), ...walls.map(key)])
  const free = []
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const p = { x, y }
      if (!taken.has(key(p))) free.push(p)
    }
  }
  if (!free.length) return null
  return free[Math.floor(rand() * free.length)]
}

export function createGame(cols, rows, opts = {}) {
  const { walls = [], rand = Math.random } = opts
  const mid = { x: Math.floor(cols / 2), y: Math.floor(rows / 2) }
  // Start as a 3-cell snake heading right.
  const snake = [mid, { x: mid.x - 1, y: mid.y }, { x: mid.x - 2, y: mid.y }]
  return {
    snake,
    dir: 'right',
    food: spawnFood(snake, cols, rows, walls, rand),
    score: 0,
    alive: true,
    ate: false,
  }
}

/**
 * Advance the game one tick.
 *
 * `wrap` sends the snake through the edges instead of killing it — the classic
 * Nokia rule is walls kill, which is the default.
 */
export function step(state, cols, rows, opts = {}) {
  const { wrap = false, walls = [], rand = Math.random, ghost = false } = opts
  if (!state.alive) return state

  const d = DIRS[state.dir]
  let head = { x: state.snake[0].x + d.x, y: state.snake[0].y + d.y }

  if (wrap) {
    head = { x: (head.x + cols) % cols, y: (head.y + rows) % rows }
  } else if (head.x < 0 || head.y < 0 || head.x >= cols || head.y >= rows) {
    return { ...state, alive: false, ate: false }
  }

  if (walls.some((w) => w.x === head.x && w.y === head.y)) {
    return { ...state, alive: false, ate: false }
  }

  const ate = state.food && head.x === state.food.x && head.y === state.food.y

  // The tail cell is vacated this tick, so moving into it is legal unless the
  // snake is growing.
  const body = ate ? state.snake : state.snake.slice(0, -1)
  if (!ghost && body.some((s) => s.x === head.x && s.y === head.y)) {
    return { ...state, alive: false, ate: false }
  }

  const snake = [head, ...body]
  return {
    ...state,
    snake,
    score: ate ? state.score + 1 : state.score,
    food: ate ? spawnFood(snake, cols, rows, walls, rand) : state.food,
    ate: !!ate,
  }
}

/** Tick interval in ms — speeds up as the score climbs, with a floor. */
export function tickMs(score, base = 140, floor = 55) {
  return Math.max(floor, base - Math.floor(score / 3) * 8)
}

/** Level shown on the display, one per 5 points. */
export const levelOf = (score) => Math.floor(score / 5) + 1

/** A few Nokia-ish wall layouts for the maze modes. */
export function mazeWalls(id, cols, rows) {
  const w = []
  if (id === 'box') {
    const m = 3
    for (let x = m; x < cols - m; x++) {
      if (x < cols / 2 - 2 || x > cols / 2 + 1) {
        w.push({ x, y: m }, { x, y: rows - 1 - m })
      }
    }
    for (let y = m; y < rows - m; y++) {
      if (y < rows / 2 - 2 || y > rows / 2 + 1) {
        w.push({ x: m, y }, { x: cols - 1 - m, y })
      }
    }
  } else if (id === 'tunnel') {
    const y1 = Math.floor(rows / 3)
    const y2 = Math.floor((rows * 2) / 3)
    for (let x = 2; x < cols - 2; x++) {
      if (x < cols / 2 - 3 || x > cols / 2 + 2) w.push({ x, y: y1 }, { x, y: y2 })
    }
  }
  return w
}

/** Power-ups that can appear alongside food. */
export const POWERS = {
  ghost: { icon: '👻', label: 'GHOST', ms: 6000, color: '#a855f7' },
  slow: { icon: '🐌', label: 'SLOW-MO', ms: 6000, color: '#38bdf8' },
  double: { icon: '✦', label: 'x2 SCORE', ms: 8000, color: '#fbbf24' },
  shrink: { icon: '✂', label: 'SHRINK', ms: 0, color: '#34d399' },
}
export const POWER_IDS = Object.keys(POWERS)

/** Pick a free cell for a power-up, avoiding the snake, walls and the food. */
export function spawnPower(snake, cols, rows, walls, food, rand = Math.random) {
  const blocked = [...snake, ...walls]
  if (food) blocked.push(food)
  const cell = spawnFood(blocked, cols, rows, [], rand)
  if (!cell) return null
  return { ...cell, kind: POWER_IDS[Math.floor(rand() * POWER_IDS.length)] }
}

/**
 * Score for one pellet given the active combo and any x2 power-up.
 * Combo climbs when pellets are eaten in quick succession.
 */
export function pelletScore(combo, doubled) {
  return Math.max(1, combo) * (doubled ? 2 : 1)
}
