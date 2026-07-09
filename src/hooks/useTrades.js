import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'trading-journal.trades.v1'

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function loadTrades() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Persisted collection of trades backed by localStorage.
 * Exposes CRUD helpers plus import/replace for JSON backups.
 */
export function useTrades() {
  const [trades, setTrades] = useState(loadTrades)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trades))
    } catch {
      // Storage full or unavailable — silently keep in-memory state.
    }
  }, [trades])

  const addTrade = useCallback((trade) => {
    setTrades((prev) => [{ ...trade, id: makeId() }, ...prev])
  }, [])

  const updateTrade = useCallback((id, patch) => {
    setTrades((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...patch, id } : t)),
    )
  }, [])

  const deleteTrade = useCallback((id) => {
    setTrades((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const replaceAll = useCallback((next) => {
    if (!Array.isArray(next)) return
    setTrades(
      next.map((t) => ({ ...t, id: t.id || makeId() })),
    )
  }, [])

  return { trades, addTrade, updateTrade, deleteTrade, replaceAll }
}
