import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SUBJECTS, QUESTIONS, GROUPS } from './questions.js'
import ThemePicker from '../ThemePicker.jsx'
import './exam.css'

const STATS_KEY = 'exam.stats.v1'
const CUSTOM_KEY = 'exam.custom.v1'
const MOCK_SIZE = 15
const MOCK_SECONDS = 15 * 60

const subjectName = (id) => SUBJECTS.find((s) => s.id === id)?.name || id
const subjectIcon = (id) => SUBJECTS.find((s) => s.id === id)?.icon || '📄'

function shuffle(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function loadStats() {
  try {
    const raw = localStorage.getItem(STATS_KEY)
    if (raw) {
      return {
        answered: 0,
        correct: 0,
        perSubject: {},
        bestMock: null,
        bookmarks: [],
        ...JSON.parse(raw),
      }
    }
  } catch {
    // ignore
  }
  return { answered: 0, correct: 0, perSubject: {}, bestMock: null, bookmarks: [] }
}

function loadCustom() {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function formatTime(total) {
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function ExamApp() {
  const [custom, setCustom] = useState(loadCustom)
  const [stats, setStats] = useState(loadStats)
  const [view, setView] = useState({ name: 'menu' })
  const fileInput = useRef(null)

  const bank = useMemo(() => [...QUESTIONS, ...custom], [custom])

  useEffect(() => {
    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(stats))
    } catch {
      // ignore
    }
  }, [stats])

  const bookmarked = new Set(stats.bookmarks)

  const toggleBookmark = useCallback((id) => {
    setStats((s) => {
      const set = new Set(s.bookmarks)
      if (set.has(id)) set.delete(id)
      else set.add(id)
      return { ...s, bookmarks: [...set] }
    })
  }, [])

  const recordAnswer = useCallback((subject, correct) => {
    setStats((s) => {
      const per = { ...s.perSubject }
      const cur = per[subject] || { answered: 0, correct: 0 }
      per[subject] = {
        answered: cur.answered + 1,
        correct: cur.correct + (correct ? 1 : 0),
      }
      return {
        ...s,
        answered: s.answered + 1,
        correct: s.correct + (correct ? 1 : 0),
        perSubject: per,
      }
    })
  }, [])

  function importJson(event) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result))
        if (!Array.isArray(parsed)) throw new Error('not array')
        const valid = parsed.filter(
          (q) =>
            q &&
            typeof q.q === 'string' &&
            Array.isArray(q.options) &&
            q.options.length >= 2 &&
            Number.isInteger(q.answer),
        )
        if (!valid.length) throw new Error('no valid questions')
        const stamped = valid.map((q, i) => ({
          id: q.id || `custom-${Date.now()}-${i}`,
          subject: q.subject && SUBJECTS.some((s) => s.id === q.subject) ? q.subject : 'ga',
          q: q.q,
          options: q.options,
          answer: q.answer,
          explanation: q.explanation || '',
        }))
        const next = [...custom, ...stamped]
        setCustom(next)
        localStorage.setItem(CUSTOM_KEY, JSON.stringify(next))
        window.alert(`Imported ${stamped.length} question(s). Total bank: ${bank.length + stamped.length}.`)
      } catch {
        window.alert(
          'Could not import — expected a JSON array of questions like:\n' +
            '[{ "subject":"ga", "q":"...", "options":["a","b","c","d"], "answer":0, "explanation":"..." }]',
        )
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  const accuracy = stats.answered
    ? Math.round((stats.correct / stats.answered) * 100)
    : 0

  return (
    <div className="exam-app">
      <header className="ex-header">
        <div className="ex-left">
          <a href="#/" className="back-link">← Apps</a>
          <ThemePicker />
        </div>
        <h1>Exam Prep</h1>
        <div className="ex-head-spacer" />
      </header>

      {view.name === 'menu' && (
        <Menu
          stats={stats}
          accuracy={accuracy}
          bankCount={bank.length}
          onPractice={() => setView({ name: 'practiceSelect' })}
          onMock={() => setView({ name: 'mock' })}
          onBookmarks={() => setView({ name: 'bookmarks' })}
          onImport={() => fileInput.current?.click()}
        />
      )}

      {view.name === 'practiceSelect' && (
        <PracticeSelect
          bank={bank}
          onPick={(subject) => setView({ name: 'practice', subject })}
          onBack={() => setView({ name: 'menu' })}
        />
      )}

      {view.name === 'practice' && (
        <Practice
          bank={bank}
          subject={view.subject}
          bookmarked={bookmarked}
          onToggleBookmark={toggleBookmark}
          onRecord={recordAnswer}
          onExit={() => setView({ name: 'menu' })}
        />
      )}

      {view.name === 'mock' && (
        <Mock
          bank={bank}
          onFinish={(result) => {
            // Record the best score; the Mock stays mounted to show its
            // own result + review screen (exit returns to the menu).
            setStats((s) => {
              const best =
                !s.bestMock || result.score > s.bestMock.score
                  ? { score: result.score, total: result.total }
                  : s.bestMock
              return { ...s, bestMock: best }
            })
          }}
          onExit={() => setView({ name: 'menu' })}
        />
      )}

      {view.name === 'bookmarks' && (
        <Bookmarks
          bank={bank}
          bookmarked={bookmarked}
          onToggleBookmark={toggleBookmark}
          onBack={() => setView({ name: 'menu' })}
        />
      )}

      <input
        ref={fileInput}
        type="file"
        accept="application/json"
        onChange={importJson}
        hidden
      />
    </div>
  )
}

// ---------- Menu ----------
function Menu({ stats, accuracy, bankCount, onPractice, onMock, onBookmarks, onImport }) {
  return (
    <div className="ex-menu">
      <div className="ex-syllabus-note">
        🎯 AP Vidyut <b>AEE</b> — Core (Electrical, 70) + Common sections
      </div>
      <div className="ex-stats">
        <div className="ex-stat">
          <b>{stats.answered}</b>
          <span>answered</span>
        </div>
        <div className="ex-stat">
          <b>{accuracy}%</b>
          <span>accuracy</span>
        </div>
        <div className="ex-stat">
          <b>{stats.bestMock ? `${stats.bestMock.score}/${stats.bestMock.total}` : '—'}</b>
          <span>best mock</span>
        </div>
        <div className="ex-stat">
          <b>{bankCount}</b>
          <span>questions</span>
        </div>
      </div>

      <div className="ex-actions">
        <button className="ex-card primary" onClick={onPractice}>
          <span className="ex-card-icon">📚</span>
          <span className="ex-card-title">Practice by Subject</span>
          <span className="ex-card-sub">Instant feedback & explanations</span>
        </button>
        <button className="ex-card" onClick={onMock}>
          <span className="ex-card-icon">⏱️</span>
          <span className="ex-card-title">Mock Test</span>
          <span className="ex-card-sub">{MOCK_SIZE} questions · {MOCK_SECONDS / 60} min</span>
        </button>
        <button className="ex-card" onClick={onBookmarks}>
          <span className="ex-card-icon">🔖</span>
          <span className="ex-card-title">Bookmarks</span>
          <span className="ex-card-sub">{stats.bookmarks.length} saved</span>
        </button>
        <button className="ex-card" onClick={onImport}>
          <span className="ex-card-icon">⬆️</span>
          <span className="ex-card-title">Import Questions</span>
          <span className="ex-card-sub">Add your own (JSON)</span>
        </button>
      </div>
    </div>
  )
}

// ---------- Practice subject picker ----------
function PracticeSelect({ bank, onPick, onBack }) {
  const counts = useMemo(() => {
    const c = {}
    for (const q of bank) c[q.subject] = (c[q.subject] || 0) + 1
    return c
  }, [bank])

  const groupIds = [...new Set(SUBJECTS.map((s) => s.group))]

  return (
    <div className="ex-view">
      <button className="ex-back" onClick={onBack}>← Menu</button>
      <h2>Pick a subject</h2>

      <button className="ex-subject all" onClick={() => onPick('all')}>
        <span className="ex-subj-icon">🎯</span>
        <span>All Subjects (mixed)</span>
        <span className="ex-subj-count">{bank.length} Q</span>
      </button>

      {groupIds.map((g) => (
        <div key={g} className="ex-group">
          <div className="ex-group-title">{GROUPS[g] || g}</div>
          <div className="ex-subjects">
            {SUBJECTS.filter((s) => s.group === g).map((s) => (
              <button
                key={s.id}
                className="ex-subject"
                onClick={() => onPick(s.id)}
                disabled={!counts[s.id]}
              >
                <span className="ex-subj-icon">{s.icon}</span>
                <span>{s.name}</span>
                <span className="ex-subj-count">{counts[s.id] || 0} Q</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------- Practice ----------
function Practice({ bank, subject, bookmarked, onToggleBookmark, onRecord, onExit }) {
  const questions = useMemo(() => {
    const pool = subject === 'all' ? bank : bank.filter((q) => q.subject === subject)
    return shuffle(pool)
  }, [bank, subject])

  const [index, setIndex] = useState(0)
  const [picked, setPicked] = useState(null)
  const [correctCount, setCorrectCount] = useState(0)

  if (questions.length === 0) {
    return (
      <div className="ex-view">
        <button className="ex-back" onClick={onExit}>← Menu</button>
        <p className="ex-empty">No questions in this subject yet.</p>
      </div>
    )
  }

  if (index >= questions.length) {
    return (
      <div className="ex-view ex-summary">
        <div className="ex-summary-emoji">✅</div>
        <h2>Practice complete</h2>
        <p>You got <b>{correctCount}</b> of <b>{questions.length}</b> correct.</p>
        <button className="ex-primary-btn" onClick={onExit}>Back to menu</button>
      </div>
    )
  }

  const q = questions[index]
  const revealed = picked !== null

  function choose(i) {
    if (revealed) return
    setPicked(i)
    const isCorrect = i === q.answer
    if (isCorrect) setCorrectCount((c) => c + 1)
    onRecord(q.subject, isCorrect)
  }

  function next() {
    setPicked(null)
    setIndex((i) => i + 1)
  }

  return (
    <div className="ex-view">
      <div className="ex-quiz-top">
        <button className="ex-back" onClick={onExit}>← Menu</button>
        <span className="ex-progress">{index + 1} / {questions.length}</span>
        <button
          className={`ex-bookmark ${bookmarked.has(q.id) ? 'on' : ''}`}
          onClick={() => onToggleBookmark(q.id)}
          title="Bookmark"
        >
          {bookmarked.has(q.id) ? '🔖' : '🏷️'}
        </button>
      </div>

      <div className="ex-subject-tag">{subjectIcon(q.subject)} {subjectName(q.subject)}</div>
      <div className="ex-question">{q.q}</div>

      <div className="ex-options">
        {q.options.map((opt, i) => {
          let cls = 'ex-option'
          if (revealed) {
            if (i === q.answer) cls += ' correct'
            else if (i === picked) cls += ' wrong'
          }
          return (
            <button key={i} className={cls} onClick={() => choose(i)} disabled={revealed}>
              <span className="ex-opt-letter">{String.fromCharCode(65 + i)}</span>
              {opt}
            </button>
          )
        })}
      </div>

      {revealed && (
        <div className={`ex-feedback ${picked === q.answer ? 'good' : 'bad'}`}>
          <b>{picked === q.answer ? 'Correct!' : 'Not quite.'}</b>
          {q.explanation && <p>{q.explanation}</p>}
          <button className="ex-primary-btn" onClick={next}>
            {index + 1 === questions.length ? 'Finish' : 'Next question'}
          </button>
        </div>
      )}
    </div>
  )
}

// ---------- Mock test ----------
function Mock({ bank, onFinish, onExit }) {
  const questions = useMemo(() => shuffle(bank).slice(0, Math.min(MOCK_SIZE, bank.length)), [bank])
  const [answers, setAnswers] = useState(() => new Array(questions.length).fill(null))
  const [index, setIndex] = useState(0)
  const [timeLeft, setTimeLeft] = useState(MOCK_SECONDS)
  const [submitted, setSubmitted] = useState(false)

  const score = useMemo(
    () => answers.reduce((n, a, i) => n + (a === questions[i].answer ? 1 : 0), 0),
    [answers, questions],
  )

  const finish = useCallback(() => {
    setSubmitted(true)
    onFinish({ score: answers.reduce((n, a, i) => n + (a === questions[i].answer ? 1 : 0), 0), total: questions.length })
  }, [answers, questions, onFinish])

  useEffect(() => {
    if (submitted) return
    if (timeLeft <= 0) {
      finish()
      return
    }
    const id = setInterval(() => setTimeLeft((t) => t - 1), 1000)
    return () => clearInterval(id)
  }, [timeLeft, submitted, finish])

  if (questions.length === 0) {
    return (
      <div className="ex-view">
        <button className="ex-back" onClick={onExit}>← Menu</button>
        <p className="ex-empty">Not enough questions for a mock test.</p>
      </div>
    )
  }

  if (submitted) {
    const pct = Math.round((score / questions.length) * 100)
    return (
      <div className="ex-view">
        <div className="ex-summary">
          <div className="ex-summary-emoji">{pct >= 40 ? '🎉' : '📖'}</div>
          <h2>Mock complete</h2>
          <p>Score: <b>{score} / {questions.length}</b> ({pct}%)</p>
          <button className="ex-primary-btn" onClick={onExit}>Back to menu</button>
        </div>
        <h3 className="ex-review-title">Review</h3>
        <div className="ex-review">
          {questions.map((q, i) => (
            <div key={q.id} className="ex-review-item">
              <div className="ex-review-q">{i + 1}. {q.q}</div>
              {q.options.map((opt, oi) => {
                let cls = 'ex-review-opt'
                if (oi === q.answer) cls += ' correct'
                else if (oi === answers[i]) cls += ' wrong'
                return <div key={oi} className={cls}>{String.fromCharCode(65 + oi)}. {opt}</div>
              })}
              {q.explanation && <div className="ex-review-exp">{q.explanation}</div>}
            </div>
          ))}
        </div>
      </div>
    )
  }

  const q = questions[index]
  const answeredCount = answers.filter((a) => a !== null).length

  function pick(i) {
    setAnswers((a) => {
      const next = a.slice()
      next[index] = i
      return next
    })
  }

  return (
    <div className="ex-view">
      <div className="ex-mock-top">
        <button className="ex-back" onClick={onExit}>✕ Quit</button>
        <span className={`ex-timer ${timeLeft < 60 ? 'low' : ''}`}>⏱ {formatTime(timeLeft)}</span>
        <span className="ex-progress">{answeredCount}/{questions.length}</span>
      </div>

      <div className="ex-palette">
        {questions.map((_, i) => (
          <button
            key={i}
            className={`ex-pal ${i === index ? 'current' : ''} ${answers[i] !== null ? 'done' : ''}`}
            onClick={() => setIndex(i)}
          >
            {i + 1}
          </button>
        ))}
      </div>

      <div className="ex-subject-tag">{subjectIcon(q.subject)} {subjectName(q.subject)}</div>
      <div className="ex-question">{index + 1}. {q.q}</div>

      <div className="ex-options">
        {q.options.map((opt, i) => (
          <button
            key={i}
            className={`ex-option ${answers[index] === i ? 'selected' : ''}`}
            onClick={() => pick(i)}
          >
            <span className="ex-opt-letter">{String.fromCharCode(65 + i)}</span>
            {opt}
          </button>
        ))}
      </div>

      <div className="ex-mock-nav">
        <button className="ex-nav-btn" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>
          ← Prev
        </button>
        {index + 1 < questions.length ? (
          <button className="ex-nav-btn" onClick={() => setIndex((i) => i + 1)}>Next →</button>
        ) : (
          <button className="ex-primary-btn" onClick={finish}>Submit test</button>
        )}
      </div>
    </div>
  )
}

// ---------- Bookmarks ----------
function Bookmarks({ bank, bookmarked, onToggleBookmark, onBack }) {
  const items = bank.filter((q) => bookmarked.has(q.id))
  return (
    <div className="ex-view">
      <button className="ex-back" onClick={onBack}>← Menu</button>
      <h2>Bookmarked ({items.length})</h2>
      {items.length === 0 ? (
        <p className="ex-empty">No bookmarks yet. Tap 🏷️ on a question while practising.</p>
      ) : (
        <div className="ex-review">
          {items.map((q) => (
            <div key={q.id} className="ex-review-item">
              <div className="ex-review-q">
                {q.q}
                <button className="ex-bookmark on inline" onClick={() => onToggleBookmark(q.id)}>🔖</button>
              </div>
              {q.options.map((opt, oi) => (
                <div key={oi} className={`ex-review-opt ${oi === q.answer ? 'correct' : ''}`}>
                  {String.fromCharCode(65 + oi)}. {opt}
                </div>
              ))}
              {q.explanation && <div className="ex-review-exp">{q.explanation}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
