import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { generatePuzzle, findConflicts, isSolved } from './sudoku.js'
import './sudoku.css'

const STORAGE_KEY = 'sudoku.game.v1'
const DIFFICULTIES = ['easy', 'medium', 'hard']

function newGameState(difficulty) {
  const { puzzle, solution } = generatePuzzle(difficulty)
  return {
    difficulty,
    puzzle, // starting clues (0 = blank) — never changes
    solution,
    board: puzzle.slice(), // current values
    notes: Array.from({ length: 81 }, () => []), // pencil marks per cell
    seconds: 0,
    mistakes: 0,
    won: false,
  }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const g = JSON.parse(raw)
    if (!Array.isArray(g.board) || g.board.length !== 81) return null
    return g
  } catch {
    return null
  }
}

function formatTime(total) {
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function SudokuApp() {
  const [game, setGame] = useState(() => loadGame() || newGameState('easy'))
  const [selected, setSelected] = useState(null)
  const [notesMode, setNotesMode] = useState(false)

  const { board, puzzle, solution, notes, difficulty, seconds, mistakes, won } =
    game

  // Persist after every change.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(game))
    } catch {
      // ignore storage failures
    }
  }, [game])

  // Timer ticks once per second while the puzzle is unsolved.
  useEffect(() => {
    if (won) return
    const id = setInterval(() => {
      setGame((g) => (g.won ? g : { ...g, seconds: g.seconds + 1 }))
    }, 1000)
    return () => clearInterval(id)
  }, [won])

  const conflicts = useMemo(() => findConflicts(board), [board])

  const startNewGame = useCallback((diff) => {
    setSelected(null)
    setNotesMode(false)
    setGame(newGameState(diff))
  }, [])

  const placeValue = useCallback(
    (value) => {
      if (selected == null || won) return
      if (puzzle[selected] !== 0) return // given clue, locked

      setGame((g) => {
        const board = g.board.slice()
        const notes = g.notes.map((n) => n.slice())

        if (notesMode && value !== 0) {
          const cell = notes[selected]
          const at = cell.indexOf(value)
          if (at === -1) cell.push(value)
          else cell.splice(at, 1)
          return { ...g, notes }
        }

        // Placing (or erasing) a real value clears this cell's notes.
        const prev = board[selected]
        board[selected] = value
        notes[selected] = []

        let mistakes = g.mistakes
        if (value !== 0 && value !== g.solution[selected] && value !== prev) {
          mistakes += 1
        }

        const won = isSolved(board)
        return { ...g, board, notes, mistakes, won }
      })
    },
    [selected, notesMode, puzzle, won],
  )

  const erase = useCallback(() => placeValue(0), [placeValue])

  const useHint = useCallback(() => {
    if (selected == null || won) return
    if (puzzle[selected] !== 0 || board[selected] === solution[selected]) return
    setGame((g) => {
      const board = g.board.slice()
      const notes = g.notes.map((n) => n.slice())
      board[selected] = g.solution[selected]
      notes[selected] = []
      return { ...g, board, notes, won: isSolved(board) }
    })
  }, [selected, won, puzzle, board, solution])

  // Keyboard support (numbers, delete, arrows).
  const boardRef = useRef(null)
  useEffect(() => {
    function onKey(e) {
      if (e.key >= '1' && e.key <= '9') {
        placeValue(Number(e.key))
      } else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
        erase()
      } else if (selected != null && e.key.startsWith('Arrow')) {
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

  // How many of each digit remain to be placed (for keypad counters).
  const remaining = useMemo(() => {
    const counts = new Array(10).fill(9)
    for (const v of board) if (v) counts[v] -= 1
    return counts
  }, [board])

  return (
    <div className="sudoku-app">
      <header className="sk-header">
        <a href="#/" className="back-link">
          ← Apps
        </a>
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

      <div className="sk-status">
        <span>⏱ {formatTime(seconds)}</span>
        <span className={mistakes > 0 ? 'sk-mistakes' : ''}>
          ✕ {mistakes} mistake{mistakes === 1 ? '' : 's'}
        </span>
        <button className="sk-new" onClick={() => startNewGame(difficulty)}>
          ↻ New
        </button>
      </div>

      <div className="sk-board" ref={boardRef}>
        {board.map((value, i) => {
          const given = puzzle[i] !== 0
          const isConflict = conflicts.has(i)
          const isSel = selected === i
          const sameVal =
            selectedValue !== 0 && value === selectedValue && !isSel
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
            col % 3 === 2 && col !== 8 ? 'edge-right' : '',
            row % 3 === 2 && row !== 8 ? 'edge-bottom' : '',
          ]
            .filter(Boolean)
            .join(' ')

          return (
            <button key={i} className={cls} onClick={() => setSelected(i)}>
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
      </div>

      <div className="sk-keypad">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button
            key={n}
            className="sk-key"
            onClick={() => placeValue(n)}
            disabled={remaining[n] <= 0}
          >
            <span className="sk-key-num">{n}</span>
            <span className="sk-key-left">{Math.max(0, remaining[n])}</span>
          </button>
        ))}
      </div>

      {won && (
        <div className="sk-win" onClick={() => startNewGame(difficulty)}>
          <div className="sk-win-card" onClick={(e) => e.stopPropagation()}>
            <div className="sk-win-emoji">🎉</div>
            <h2>Solved!</h2>
            <p>
              {difficulty[0].toUpperCase() + difficulty.slice(1)} · {formatTime(seconds)} ·{' '}
              {mistakes} mistake{mistakes === 1 ? '' : 's'}
            </p>
            <div className="sk-win-actions">
              <button className="sk-key primary" onClick={() => startNewGame(difficulty)}>
                Play again
              </button>
              <a className="sk-tool" href="#/">
                Back to apps
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
