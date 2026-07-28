import ThemePicker from './ThemePicker.jsx'
import './home.css'

const APPS = [
  {
    href: '#/journal',
    icon: '📈',
    title: 'Trading Journal',
    desc: 'Log trades, track P&L, and analyze your performance.',
    accent: 'green',
  },
  {
    href: '#/sudoku',
    icon: '🔢',
    title: 'Sudoku',
    desc: 'Classic 9×9 puzzles with notes, hints, and a timer.',
    accent: 'blue',
  },
  {
    href: '#/exam',
    icon: '🎓',
    title: 'Exam Prep',
    desc: 'AP Vidyut AEE — practice MCQs, timed mock tests, and track progress.',
    accent: 'green',
  },
  {
    href: '#/chart',
    icon: '📊',
    title: 'NIFTY Chart',
    desc: '10 years of NIFTY 50 candles — zoom, pan, and switch timeframes.',
    accent: 'blue',
  },
]

export default function Home() {
  return (
    <div className="home">
      <div className="home-top">
        <ThemePicker />
      </div>
      <header className="home-header">
        <h1>My Apps</h1>
        <p>A little collection — tap one to play.</p>
      </header>

      <div className="home-grid">
        {APPS.map((app) => (
          <a key={app.href} href={app.href} className={`home-card accent-${app.accent}`}>
            <span className="home-icon">{app.icon}</span>
            <span className="home-title">{app.title}</span>
            <span className="home-desc">{app.desc}</span>
            <span className="home-open">Open →</span>
          </a>
        ))}
      </div>

      <footer className="home-footer">Built with React · runs entirely in your browser</footer>
    </div>
  )
}
