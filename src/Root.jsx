import { useEffect, useState } from 'react'
import Home from './Home.jsx'
import SudokuApp from './sudoku/SudokuApp.jsx'
import NiftyChart from './chart/NiftyChart.jsx'
import SnakeGame from './snake/SnakeGame.jsx'
import VaikuntapaliApp from './vp/VaikuntapaliApp.jsx'

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
  if (route === 'sudoku') return <SudokuApp />
  if (route === 'chart') return <NiftyChart />
  if (route === 'snake') return <SnakeGame />
  if (route === 'vp') return <VaikuntapaliApp />
  return <Home />
}
