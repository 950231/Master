// Sudoku engine: a grid is a flat array of 81 numbers (0 = empty).

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/** Can `val` be placed at flat index `idx` without breaking row/col/box rules? */
export function isValid(grid, idx, val) {
  const row = Math.floor(idx / 9)
  const col = idx % 9

  for (let c = 0; c < 9; c++) {
    if (grid[row * 9 + c] === val) return false
  }
  for (let r = 0; r < 9; r++) {
    if (grid[r * 9 + col] === val) return false
  }
  const br = Math.floor(row / 3) * 3
  const bc = Math.floor(col / 3) * 3
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (grid[(br + r) * 9 + (bc + c)] === val) return false
    }
  }
  return true
}

/** Fill an empty grid with a random complete solution (backtracking). */
function fillGrid(grid) {
  const idx = grid.indexOf(0)
  if (idx === -1) return true
  const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])
  for (const val of nums) {
    if (isValid(grid, idx, val)) {
      grid[idx] = val
      if (fillGrid(grid)) return true
      grid[idx] = 0
    }
  }
  return false
}

export function generateSolved() {
  const grid = new Array(81).fill(0)
  fillGrid(grid)
  return grid
}

/** Count solutions of `grid`, stopping early once `limit` is reached. */
function countSolutions(grid, limit = 2) {
  const idx = grid.indexOf(0)
  if (idx === -1) return 1
  let count = 0
  for (let val = 1; val <= 9; val++) {
    if (isValid(grid, idx, val)) {
      grid[idx] = val
      count += countSolutions(grid, limit)
      grid[idx] = 0
      if (count >= limit) break
    }
  }
  return count
}

// Approximate number of clues left in the starting puzzle per difficulty.
const GIVENS = { easy: 45, medium: 34, hard: 30, expert: 26 }

// Precomputed cell indices for all 27 units (9 rows, 9 cols, 9 boxes),
// keyed as 'r0'..'r8', 'c0'..'c8', 'b0'..'b8'.
export const UNIT_CELLS = (() => {
  const units = {}
  for (let r = 0; r < 9; r++) {
    units['r' + r] = Array.from({ length: 9 }, (_, c) => r * 9 + c)
  }
  for (let c = 0; c < 9; c++) {
    units['c' + c] = Array.from({ length: 9 }, (_, r) => r * 9 + c)
  }
  for (let b = 0; b < 9; b++) {
    const br = Math.floor(b / 3) * 3
    const bc = (b % 3) * 3
    const cells = []
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) cells.push((br + r) * 9 + (bc + c))
    }
    units['b' + b] = cells
  }
  return units
})()

/** Keys of units that are fully filled with 1–9 and no duplicates. */
export function completedUnitKeys(board) {
  const keys = new Set()
  for (const key in UNIT_CELLS) {
    const cells = UNIT_CELLS[key]
    const seen = new Set()
    let ok = true
    for (const i of cells) {
      const v = board[i]
      if (!v || seen.has(v)) {
        ok = false
        break
      }
      seen.add(v)
    }
    if (ok) keys.add(key)
  }
  return keys
}

/**
 * Build a puzzle with a single unique solution by digging holes out of a
 * full solution while re-checking uniqueness after each removal.
 * Returns { puzzle, solution }.
 */
export function generatePuzzle(difficulty = 'easy') {
  const solution = generateSolved()
  const puzzle = solution.slice()
  const targetGivens = GIVENS[difficulty] ?? 40

  let givens = 81
  const positions = shuffle([...Array(81).keys()])

  for (const pos of positions) {
    if (givens <= targetGivens) break
    if (puzzle[pos] === 0) continue

    const backup = puzzle[pos]
    puzzle[pos] = 0

    // If removing this clue makes the puzzle ambiguous, put it back.
    if (countSolutions(puzzle.slice(), 2) !== 1) {
      puzzle[pos] = backup
    } else {
      givens -= 1
    }
  }

  return { puzzle, solution }
}

/**
 * Indices whose current value duplicates another value in the same
 * row, column, or box. Empty cells (0) are never conflicts.
 */
export function findConflicts(board) {
  const conflicts = new Set()

  const check = (indices) => {
    const seen = new Map()
    for (const i of indices) {
      const v = board[i]
      if (!v) continue
      if (seen.has(v)) {
        conflicts.add(i)
        conflicts.add(seen.get(v))
      } else {
        seen.set(v, i)
      }
    }
  }

  for (let r = 0; r < 9; r++) {
    check(Array.from({ length: 9 }, (_, c) => r * 9 + c))
  }
  for (let c = 0; c < 9; c++) {
    check(Array.from({ length: 9 }, (_, r) => r * 9 + c))
  }
  for (let br = 0; br < 3; br++) {
    for (let bc = 0; bc < 3; bc++) {
      const cells = []
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          cells.push((br * 3 + r) * 9 + (bc * 3 + c))
        }
      }
      check(cells)
    }
  }

  return conflicts
}

export function isSolved(board) {
  if (board.includes(0)) return false
  return findConflicts(board).size === 0
}
