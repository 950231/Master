import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  generatePuzzle,
  findConflicts,
  isSolved,
  completedUnitKeys,
  UNIT_CELLS,
} from './sudoku.js'
import ThemePicker from '../ThemePicker.jsx'
import { unlock, cycleSound, soundLabel, play } from '../audio.js'
import './sudoku.css'

const GAME_KEY = 'sudoku.game.v1'
const PROFILE_KEY = 'sudoku.profile.v1'
const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert']
const DIFF_MULT = { easy: 1, medium: 1.5, hard: 2, expert: 3 }
const MAX_LIVES = 3
const XP_PER_LEVEL = 1000

// ---------- persistence helpers ----------
function newGameState(difficulty) {
  const { puzzle, solution } = generatePuzzle(difficulty)
  return {
    difficulty,
    puzzle,
    solution,
    board: puzzle.slice(),
    notes: Array.from({ length: 81 }, () => []),
    seconds: 0,
    mistakes: 0,
    lives: MAX_LIVES,
    score: 0,
    won: false,
    gameOver: false,
  }
}

function normalizeGame(g) {
  return {
    lives: MAX_LIVES,
    score: 0,
    gameOver: false,
    mistakes: 0,
    ...g,
    notes: Array.isArray(g.notes) ? g.notes : Array.from({ length: 81 }, () => []),
  }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(GAME_KEY)
    if (!raw) return null
    const g = JSON.parse(raw)
    if (!Array.isArray(g.board) || g.board.length !== 81) return null
    return normalizeGame(g)
  } catch {
    return null
  }
}

function loadProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    if (raw) return { xp: 0, gamesWon: 0, bestTimes: {}, ...JSON.parse(raw) }
  } catch {
    // ignore
  }
  return { xp: 0, gamesWon: 0, bestTimes: {} }
}

function levelInfo(xp) {
  const level = Math.floor(xp / XP_PER_LEVEL) + 1
  const into = xp % XP_PER_LEVEL
  return { level, into, pct: (into / XP_PER_LEVEL) * 100 }
}

function formatTime(total) {
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const UNIT_LABEL = { r: 'Row', c: 'Column', b: 'Box' }

export default function SudokuApp() {
  const [game, setGame] = useState(() => loadGame() || newGameState('easy'))
  const [profile, setProfile] = useState(loadProfile)
  const [selected, setSelected] = useState(null)
  const [notesMode, setNotesMode] = useState(false)

  // Transient visual feedback (not persisted).
  const [flash, setFlash] = useState(() => new Set())
  const [popups, setPopups] = useState([])
  const popupId = useRef(0)
  const flashTimer = useRef(null)

  const {
    board,
    puzzle,
    solution,
    notes,
    difficulty,
    seconds,
    lives,
    score,
    won,
    gameOver,
  } = game

  const finished = won || gameOver

  useEffect(() => {
    try {
      localStorage.setItem(GAME_KEY, JSON.stringify(game))
    } catch {
      // ignore
    }
  }, [game])

  useEffect(() => {
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
    } catch {
      // ignore
    }
  }, [profile])

  // Timer runs while the game is active.
  useEffect(() => {
    if (finished) return
    const id = setInterval(() => {
      setGame((g) => (g.won || g.gameOver ? g : { ...g, seconds: g.seconds + 1 }))
    }, 1000)
    return () => clearInterval(id)
  }, [finished])

  const conflicts = useMemo(() => findConflicts(board), [board])
  const [sound, setSound] = useState(soundLabel)
  const level = levelInfo(profile.xp)

  const pushPopup = useCallback((text, kind = 'score') => {
    const id = popupId.current++
    setPopups((p) => [...p, { id, text, kind }])
    setTimeout(() => setPopups((p) => p.filter((x) => x.id !== id)), 1100)
  }, [])

  const triggerFlash = useCallback((indices) => {
    setFlash(new Set(indices))
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(new Set()), 750)
  }, [])

  const startNewGame = useCallback((diff) => {
    setSelected(null)
    setNotesMode(false)
    setFlash(new Set())
    setPopups([])
    setGame(newGameState(diff))
  }, [])

  const placeValue = useCallback(
    (value) => {
      if (selected == null || finished) return
      if (puzzle[selected] !== 0) return // locked clue

      // Pencil marks.
      if (notesMode && value !== 0) {
        setGame((g) => {
          const nextNotes = g.notes.map((n) => n.slice())
          const cell = nextNotes[selected]
          const at = cell.indexOf(value)
          if (at === -1) cell.push(value)
          else cell.splice(at, 1)
          return { ...g, notes: nextNotes }
        })
        return
      }

      const prev = board[selected]
      const nextBoard = board.slice()
      const nextNotes = notes.map((n) => n.slice())
      nextBoard[selected] = value
      nextNotes[selected] = []

      const mult = DIFF_MULT[difficulty] ?? 1
      let earned = 0
      let nextLives = lives
      let nextMistakes = game.mistakes

      const wrong = value !== 0 && value !== solution[selected]

      if (wrong && value !== prev) {
        nextLives -= 1
        nextMistakes += 1
        pushPopup('−1 ♥', 'life')
        play('wrong')
      } else if (value !== 0 && !wrong) {
        // Correct placement — award points and detect completed units.
        earned += 5
        play('place')
        const before = completedUnitKeys(board)
        const after = completedUnitKeys(nextBoard)
        const newKeys = [...after].filter((k) => !before.has(k))

        if (newKeys.length > 0) {
          const cells = new Set()
          newKeys.forEach((k) => UNIT_CELLS[k].forEach((i) => cells.add(i)))
          triggerFlash(cells)

          const base = newKeys.length * 100
          const comboBonus = (newKeys.length - 1) * 100
          const unitPts = Math.round((base + comboBonus) * mult)
          earned += unitPts

          play('unit')
          if (newKeys.length > 1) {
            pushPopup(`Combo ×${newKeys.length}! +${unitPts}`, 'combo')
          } else {
            pushPopup(`${UNIT_LABEL[newKeys[0][0]]} done! +${unitPts}`, 'unit')
          }
        }
      }

      const solved = isSolved(nextBoard)
      const dead = nextLives <= 0

      let winBonus = 0
      if (solved) {
        const timeBonus = Math.max(0, 600 - seconds)
        winBonus = Math.round((500 + timeBonus) * mult)
        earned += winBonus
      }

      setGame({
        ...game,
        board: nextBoard,
        notes: nextNotes,
        lives: Math.max(0, nextLives),
        mistakes: nextMistakes,
        score: game.score + earned,
        won: solved,
        gameOver: dead && !solved,
      })

      if (earned > 0) {
        setProfile((p) => {
          const next = { ...p, xp: p.xp + earned }
          if (solved) {
            next.gamesWon = p.gamesWon + 1
            const prevBest = p.bestTimes[difficulty]
            if (prevBest == null || seconds < prevBest) {
              next.bestTimes = { ...p.bestTimes, [difficulty]: seconds }
            }
          }
          return next
        })
      }

      if (solved) {
        pushPopup(`Solved! +${winBonus}`, 'win')
        play('win')
      }
    },
    [
      selected,
      finished,
      notesMode,
      puzzle,
      board,
      notes,
      solution,
      difficulty,
      lives,
      seconds,
      game,
      pushPopup,
      triggerFlash,
    ],
  )

  const erase = useCallback(() => {
    if (selected == null || finished || puzzle[selected] !== 0) return
    setGame((g) => {
      const nextBoard = g.board.slice()
      const nextNotes = g.notes.map((n) => n.slice())
      nextBoard[selected] = 0
      nextNotes[selected] = []
      return { ...g, board: nextBoard, notes: nextNotes }
    })
  }, [selected, finished, puzzle])

  const useHint = useCallback(() => {
    if (selected == null || finished) return
    if (puzzle[selected] !== 0 || board[selected] === solution[selected]) return
    setGame((g) => {
      const nextBoard = g.board.slice()
      const nextNotes = g.notes.map((n) => n.slice())
      nextBoard[selected] = g.solution[selected]
      nextNotes[selected] = []
      const solved = isSolved(nextBoard)
      // A hint writes the digit directly rather than going through
      // placeValue, so it has to announce itself here.
      play(solved ? 'win' : 'place')
      return { ...g, board: nextBoard, notes: nextNotes, won: solved }
    })
  }, [selected, finished, puzzle, board, solution])

  // Keyboard support.
  useEffect(() => {
    function onKey(e) {
      if (e.key >= '1' && e.key <= '9') placeValue(Number(e.key))
      else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') erase()
      else if (selected != null && e.key.startsWith('Arrow')) {
        const row = Math.floor(selected / 9)
        const col = selected % 9
        let nr = row
        let nc = col
        if (e.key === 'ArrowUp') nr = Math.max(0, row - 1)
        if (e.key === 'ArrowDown') nr = Math.min(8, row + 1)
        if (e.key === 'ArrowLeft') nc = Math.max(0, col - 1)
        if (e.key === 'ArrowRight') nc = Math.min(8, col + 1)
        setSelected(nr * 9 + nc)
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [placeValue, erase, selected])

  const selectedValue = selected != null ? board[selected] : 0

  const remaining = useMemo(() => {
    const counts = new Array(10).fill(9)
    for (const v of board) if (v) counts[v] -= 1
    return counts
  }, [board])

  return (
    <div className="sudoku-app">
      <header className="sk-header">
        <div className="sk-left">
          <a href="#/" className="back-link">
            ← Apps
          </a>
          <ThemePicker />
        </div>
        <h1>Sudoku</h1>
        <div className="sk-diff">
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              className={`sk-diff-btn ${d === difficulty ? 'active' : ''}`}
              onClick={() => startNewGame(d)}
            >
              {d[0].toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>
      </header>

      {/* Level / XP progression */}
      <div className="sk-level">
        <span className="sk-level-badge">Lv {level.level}</span>
        <div className="sk-xp-bar">
          <div className="sk-xp-fill" style={{ width: `${level.pct}%` }} />
        </div>
        <span className="sk-xp-text">{level.into} / {XP_PER_LEVEL} XP</span>
      </div>

      <div className="sk-status">
        <span className="sk-hearts" aria-label={`${lives} lives`}>
          {Array.from({ length: MAX_LIVES }, (_, i) => (
            <span key={i} className={i < lives ? 'heart' : 'heart empty'}>
              {i < lives ? '❤️' : '🤍'}
            </span>
          ))}
        </span>
        <span className="sk-score">⭐ {score}</span>
        <span className="sk-timer">⏱ {formatTime(seconds)}</span>
        <button className="sk-new" onClick={() => startNewGame(difficulty)}>
          ↻ New
        </button>
      </div>

      <div className="sk-board-wrap">
        <div className="sk-board">
          {board.map((value, i) => {
            const given = puzzle[i] !== 0
            const isConflict = conflicts.has(i)
            const isSel = selected === i
            const isFlash = flash.has(i)
            const sameVal = selectedValue !== 0 && value === selectedValue && !isSel
            const row = Math.floor(i / 9)
            const col = i % 9
            const peer =
              selected != null &&
              !isSel &&
              (row === Math.floor(selected / 9) ||
                col === selected % 9 ||
                (Math.floor(row / 3) === Math.floor(selected / 9 / 3) &&
                  Math.floor(col / 3) === Math.floor((selected % 9) / 3)))

            const cls = [
              'sk-cell',
              given ? 'given' : 'entered',
              isSel ? 'selected' : '',
              peer ? 'peer' : '',
              sameVal ? 'same' : '',
              isConflict ? 'conflict' : '',
              isFlash ? 'flash' : '',
              col % 3 === 2 && col !== 8 ? 'edge-right' : '',
              row % 3 === 2 && row !== 8 ? 'edge-bottom' : '',
            ]
              .filter(Boolean)
              .join(' ')

            return (
              <button
                key={i}
                className={cls}
                onClick={() => {
                  unlock()
                  setSelected(i)
                }}
              >
                {value !== 0 ? (
                  <span className="sk-val">{value}</span>
                ) : notes[i].length ? (
                  <span className="sk-notes">
                    {Array.from({ length: 9 }, (_, n) => (
                      <span key={n} className="sk-note">
                        {notes[i].includes(n + 1) ? n + 1 : ''}
                      </span>
                    ))}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>

        {/* Floating score / combo popups */}
        <div className="sk-popups">
          {popups.map((p) => (
            <div key={p.id} className={`sk-popup ${p.kind}`}>
              {p.text}
            </div>
          ))}
        </div>
      </div>

      <div className="sk-tools">
        <button
          className={`sk-tool ${notesMode ? 'active' : ''}`}
          onClick={() => setNotesMode((v) => !v)}
        >
          ✏️ Notes{notesMode ? ' on' : ''}
        </button>
        <button className="sk-tool" onClick={erase}>
          ⌫ Erase
        </button>
        <button className="sk-tool" onClick={useHint}>
          💡 Hint
        </button>
        <button
          className={`sk-tool ${sound.on ? 'active' : ''}`}
          onClick={() => {
            unlock()
            cycleSound()
            setSound(soundLabel())
            play('tap')
          }}
          title="Arcade, Nokia or muted"
        >
          {sound.icon}
        </button>
      </div>

      <div className="sk-keypad">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button
            key={n}
            className="sk-key"
            onClick={() => placeValue(n)}
            disabled={remaining[n] <= 0 || finished}
          >
            <span className="sk-key-num">{n}</span>
            <span className="sk-key-left">{Math.max(0, remaining[n])}</span>
          </button>
        ))}
      </div>

      {won && (
        <Overlay onClose={() => startNewGame(difficulty)}>
          <Confetti />
          <div className="sk-win-emoji">🎉</div>
          <h2>Solved!</h2>
          <p>
            {difficulty[0].toUpperCase() + difficulty.slice(1)} · {formatTime(seconds)}
          </p>
          <div className="sk-win-stats">
            <div><b>+{score}</b><span>score</span></div>
            <div><b>Lv {level.level}</b><span>level</span></div>
            <div><b>{formatTime(profile.bestTimes[difficulty] ?? seconds)}</b><span>best</span></div>
          </div>
          <div className="sk-win-actions">
            <button className="sk-key primary" onClick={() => startNewGame(difficulty)}>
              Play again
            </button>
            <a className="sk-tool" href="#/">Back to apps</a>
          </div>
        </Overlay>
      )}

      {gameOver && (
        <Overlay onClose={() => startNewGame(difficulty)}>
          <div className="sk-win-emoji">💔</div>
          <h2>Out of hearts</h2>
          <p>You made {MAX_LIVES} mistakes. Try again — you've got this.</p>
          <div className="sk-win-actions">
            <button className="sk-key primary" onClick={() => startNewGame(difficulty)}>
              New game
            </button>
            <a className="sk-tool" href="#/">Back to apps</a>
          </div>
        </Overlay>
      )}
    </div>
  )
}

function Overlay({ children, onClose }) {
  return (
    <div className="sk-win" onClick={onClose}>
      <div className="sk-win-card" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

const CONFETTI_COLORS = ['#22c55e', '#38bdf8', '#f59e0b', '#ef4444', '#a855f7']
function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 44 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        dur: 1.6 + Math.random() * 1.4,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        rot: Math.random() * 360,
      })),
    [],
  )
  return (
    <div className="sk-confetti" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          style={{
            left: `${p.left}%`,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
            transform: `rotate(${p.rot}deg)`,
          }}
        />
      ))}
    </div>
  )
}
