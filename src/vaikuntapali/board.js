// Pure rules and geometry for Vaikuntapali (వైకుంఠపాళి), the 132-square
// Paramapada Sopanam board. Kept free of three.js so the rules can be tested
// on their own.

export const COLS = 11
export const ROWS = 12
export const TOTAL = COLS * ROWS // 132

/**
 * Where a square sits on the grid.
 *
 * The board snakes back and forth: square 1 is the bottom-left, the bottom
 * row runs left to right to 11, the row above runs right to left from 12 to
 * 22, and so on, so 132 ends up at the top-left.
 */
export function squareToCell(n) {
  const i = n - 1
  const row = Math.floor(i / COLS)
  const within = i % COLS
  const col = row % 2 === 0 ? within : COLS - 1 - within
  return { col, row }
}

/** Board-space centre of a square, with the board centred on the origin. */
export function squareToPos(n, tile = 1) {
  const { col, row } = squareToCell(n)
  return {
    x: (col - (COLS - 1) / 2) * tile,
    z: -(row - (ROWS - 1) / 2) * tile,
  }
}

/** Ladders lift you: bottom square -> top square. */
export const LADDERS = {
  2: 23,
  8: 31,
  20: 38,
  27: 50,
  34: 55,
  41: 79,
  47: 68,
  52: 103,
  62: 96,
  72: 106,
  85: 110,
  91: 117,
  120: 131,
}

/** Snakes swallow you: head square -> tail square. */
export const SNAKES = {
  17: 4,
  21: 9,
  43: 25,
  56: 33,
  59: 22,
  73: 51,
  77: 46,
  92: 64,
  99: 69,
  102: 76,
  109: 87,
  116: 94,
  121: 100,
  128: 105,
  130: 108,
}

/**
 * Square names from the traditional board. Only the ones legible on the
 * printed sheet are filled in — the rest deliberately stay unlabelled rather
 * than invent devotional names that are not there.
 */
export const NAMES = {
  4: 'వేదము',
  10: 'పంది',
  17: 'రాక్షసము',
  21: 'పిల్లి',
  26: 'పరధనము',
  30: 'నిష్ఠ',
  39: 'గోలోకము',
  41: 'యాగము',
  43: 'నరకగుండము',
  50: 'పాతాళలోకము',
  52: 'యోగము',
  56: 'గాడిద',
  61: 'సుందరలోకము',
  65: 'చిత్తశుద్ధి',
  72: 'సిద్ధపదము',
  73: 'గుంటనక్క',
  77: 'చిరుత',
  83: 'బ్రహ్మలోకము',
  88: 'వైరాగ్యము',
  95: 'గుడ్లగూబ',
  104: 'మొసలి',
  105: 'మహాలోకము',
  111: 'వామనావతారము',
  121: 'అహంకారము',
  126: 'ఉత్తరద్వారము',
  129: 'మాయాశక్తి',
  132: 'పరాశక్తి',
}

export const isLadder = (n) => Object.prototype.hasOwnProperty.call(LADDERS, n)
export const isSnake = (n) => Object.prototype.hasOwnProperty.call(SNAKES, n)

/** 1..6, with `rand` injectable so tests are deterministic. */
export function rollDie(rand = Math.random) {
  return 1 + Math.floor(rand() * 6)
}

/**
 * Work out a whole turn from one square.
 *
 * Landing on 132 has to be exact — the classic rule. Overshooting means the
 * token does not move at all, so the last stretch is a genuine wait for the
 * right number rather than a formality.
 *
 * Returns the walk as a list of squares plus the snake or ladder that the
 * landing square triggered, which is everything the animation needs.
 */
export function resolveMove(from, roll) {
  const target = from + roll
  if (target > TOTAL) {
    return { from, walk: [], landed: from, jump: null, won: false, blocked: true }
  }

  const walk = []
  for (let s = from + 1; s <= target; s++) walk.push(s)

  let jump = null
  if (isLadder(target)) jump = { type: 'ladder', from: target, to: LADDERS[target] }
  else if (isSnake(target)) jump = { type: 'snake', from: target, to: SNAKES[target] }

  const landed = jump ? jump.to : target
  return { from, walk, landed, jump, won: landed === TOTAL, blocked: false }
}

/**
 * A six earns another turn, but three in a row burns the turn instead — the
 * usual guard against one player rolling forever.
 */
export function turnAfter(roll, sixesInARow) {
  if (roll !== 6) return { again: false, sixes: 0 }
  const sixes = sixesInARow + 1
  return { again: sixes < 3, sixes: sixes < 3 ? sixes : 0, burned: sixes >= 3 }
}

/** Squares a snake or ladder occupies, for checking the board is well formed. */
export function boardProblems() {
  const problems = []
  for (const [k, v] of Object.entries(LADDERS)) {
    const n = Number(k)
    if (v <= n) problems.push(`ladder ${n} does not go up (${v})`)
    if (isSnake(n)) problems.push(`square ${n} is both a ladder foot and a snake head`)
    if (v > TOTAL) problems.push(`ladder ${n} leaves the board (${v})`)
    if (v === TOTAL) problems.push(`ladder ${n} wins outright, which skips the exact-roll rule`)
  }
  for (const [k, v] of Object.entries(SNAKES)) {
    const n = Number(k)
    if (v >= n) problems.push(`snake ${n} does not go down (${v})`)
    if (v < 1) problems.push(`snake ${n} leaves the board (${v})`)
  }
  // A ladder that lands on a snake head (or vice versa) would chain forever.
  for (const v of Object.values(LADDERS)) {
    if (isSnake(v)) problems.push(`ladder lands on snake head ${v}`)
  }
  for (const v of Object.values(SNAKES)) {
    if (isLadder(v)) problems.push(`snake lands on ladder foot ${v}`)
  }
  return problems
}
