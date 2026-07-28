import { useEffect, useState } from 'react'
import Home from './Home.jsx'
import JournalApp from './App.jsx'
import SudokuApp from './sudoku/SudokuApp.jsx'
import ExamApp from './exam/ExamApp.jsx'
import NiftyChart from './chart/NiftyChart.jsx'
import OrbPractice from './practice/OrbPractice.jsx'

// Tiny hash-based router — works cleanly on GitHub Pages project subpaths
// (only the URL fragment changes, never the path) with no extra dependencies.
function currentRoute() {
  return window.location.hash.replace(/^#\/?/, '') || 'home'
}

function useHashRoute() {
  const [route, setRoute] = useState(currentRoute)
  useEffect(() => {
    const onHash = () => setRoute(currentRoute())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return route
}

export default function Root() {
  const route = useHashRoute()
  if (route === 'journal') return <JournalApp />
  if (route === 'sudoku') return <SudokuApp />
  if (route === 'exam') return <ExamApp />
  if (route === 'chart') return <NiftyChart />
  if (route === 'orb') return <OrbPractice />
  return <Home />
}
