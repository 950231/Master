import { useEffect, useRef, useState } from 'react'
import './theme.css'

export const THEMES = [
  { id: 'midnight', name: 'Midnight', bg: '#0b1120', accent: '#38bdf8' },
  { id: 'slate', name: 'Slate', bg: '#0f1115', accent: '#818cf8' },
  { id: 'ocean', name: 'Ocean', bg: '#04181c', accent: '#2dd4bf' },
  { id: 'grape', name: 'Grape', bg: '#160f24', accent: '#c084fc' },
  { id: 'light', name: 'Light', bg: '#eef2f7', accent: '#2563eb' },
]

const STORAGE_KEY = 'app.theme'

export function applyStoredTheme() {
  let id = 'midnight'
  try {
    id = localStorage.getItem(STORAGE_KEY) || 'midnight'
  } catch {
    // ignore
  }
  document.documentElement.dataset.theme = id
}

export default function ThemePicker() {
  const [open, setOpen] = useState(false)
  const [theme, setTheme] = useState(
    () => document.documentElement.dataset.theme || 'midnight',
  )
  const ref = useRef(null)

  useEffect(() => {
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  function pick(id) {
    document.documentElement.dataset.theme = id
    try {
      localStorage.setItem(STORAGE_KEY, id)
    } catch {
      // ignore
    }
    setTheme(id)
    setOpen(false)
  }

  const current = THEMES.find((t) => t.id === theme) || THEMES[0]

  return (
    <div className="theme-picker" ref={ref}>
      <button
        className="theme-btn"
        onClick={() => setOpen((o) => !o)}
        title="Change theme"
        aria-label="Change theme"
      >
        <span className="theme-swatch" style={{ background: current.bg }}>
          <i style={{ background: current.accent }} />
        </span>
        <span className="theme-btn-label">Theme</span>
      </button>

      {open && (
        <div className="theme-menu">
          {THEMES.map((t) => (
            <button
              key={t.id}
              className={`theme-item ${t.id === theme ? 'active' : ''}`}
              onClick={() => pick(t.id)}
            >
              <span className="theme-swatch" style={{ background: t.bg }}>
                <i style={{ background: t.accent }} />
              </span>
              {t.name}
              {t.id === theme && <span className="theme-check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
