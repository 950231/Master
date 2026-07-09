import { useMemo, useRef, useState } from 'react'
import { useTrades } from './hooks/useTrades.js'
import { computeStats, tradePnl } from './utils/stats.js'
import { sampleTrades } from './data/sampleTrades.js'
import Dashboard from './components/Dashboard.jsx'
import FilterBar from './components/FilterBar.jsx'
import TradeForm from './components/TradeForm.jsx'
import TradeTable from './components/TradeTable.jsx'

const DEFAULT_FILTERS = {
  query: '',
  symbol: '',
  direction: '',
  result: '',
}

export default function App() {
  const { trades, addTrade, updateTrade, deleteTrade, replaceAll } = useTrades()
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [editing, setEditing] = useState(null) // trade being edited
  const [formOpen, setFormOpen] = useState(false)
  const fileInput = useRef(null)

  const symbols = useMemo(() => {
    return [...new Set(trades.map((t) => t.symbol).filter(Boolean))].sort()
  }, [trades])

  const filtered = useMemo(() => {
    const q = filters.query.trim().toLowerCase()
    return trades.filter((t) => {
      if (filters.symbol && t.symbol !== filters.symbol) return false
      if (filters.direction && t.direction !== filters.direction) return false

      const open = t.exitPrice === '' || t.exitPrice == null
      if (filters.result === 'open' && !open) return false
      if (filters.result === 'win' && (open || tradePnl(t) <= 0)) return false
      if (filters.result === 'loss' && (open || tradePnl(t) >= 0)) return false

      if (q) {
        const haystack = [t.symbol, t.strategy, t.notes]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [trades, filters])

  // Stats reflect the current filter so the dashboard follows the table.
  const stats = useMemo(() => computeStats(filtered), [filtered])

  function openNew() {
    setEditing(null)
    setFormOpen(true)
  }

  function openEdit(trade) {
    setEditing(trade)
    setFormOpen(true)
  }

  function handleSubmit(data) {
    if (editing) {
      updateTrade(editing.id, data)
    } else {
      addTrade(data)
    }
    setFormOpen(false)
    setEditing(null)
  }

  function handleDelete(trade) {
    if (window.confirm(`Delete ${trade.symbol} trade? This cannot be undone.`)) {
      deleteTrade(trade.id)
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(trades, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `trading-journal-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function importJson(event) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result))
        if (!Array.isArray(parsed)) throw new Error('not an array')
        if (
          window.confirm(
            `Import ${parsed.length} trades? This replaces your current journal.`,
          )
        ) {
          replaceAll(parsed)
        }
      } catch {
        window.alert('Could not read that file — expected a JSON array of trades.')
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  function loadSample() {
    if (
      trades.length === 0 ||
      window.confirm('Load sample trades? This replaces your current journal.')
    ) {
      replaceAll(sampleTrades)
    }
  }

  const hasFilters =
    filters.query || filters.symbol || filters.direction || filters.result

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">▲</span>
          <div>
            <h1>Trading Journal</h1>
            <p className="tagline">Log trades · track P&L · learn from every setup</p>
          </div>
        </div>
        <div className="header-actions">
          <button className="btn ghost" onClick={exportJson}>
            Export
          </button>
          <button className="btn ghost" onClick={() => fileInput.current?.click()}>
            Import
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json"
            onChange={importJson}
            hidden
          />
          <button className="btn primary" onClick={openNew}>
            + New Trade
          </button>
        </div>
      </header>

      <main className="app-main">
        {trades.length === 0 ? (
          <div className="welcome">
            <h2>Start your journal</h2>
            <p>
              Record every trade to uncover what works. Add your first trade, or
              load a sample dataset to explore the dashboard.
            </p>
            <div className="welcome-actions">
              <button className="btn primary" onClick={openNew}>
                + Add your first trade
              </button>
              <button className="btn ghost" onClick={loadSample}>
                Load sample data
              </button>
            </div>
          </div>
        ) : (
          <>
            <Dashboard stats={stats} />

            <section className="trades-section">
              <div className="section-head">
                <h2>
                  Trades{' '}
                  <span className="count">
                    {filtered.length}
                    {filtered.length !== trades.length && ` / ${trades.length}`}
                  </span>
                </h2>
              </div>

              <FilterBar
                filters={filters}
                setFilters={setFilters}
                symbols={symbols}
              />

              {hasFilters && (
                <button
                  className="clear-filters"
                  onClick={() => setFilters(DEFAULT_FILTERS)}
                >
                  Clear filters
                </button>
              )}

              <TradeTable
                trades={filtered}
                onEdit={openEdit}
                onDelete={handleDelete}
              />
            </section>
          </>
        )}
      </main>

      <footer className="app-footer">
        <span>
          {trades.length} trade{trades.length === 1 ? '' : 's'} · stored locally
          in your browser
        </span>
      </footer>

      {formOpen && (
        <TradeForm
          initial={editing}
          onSubmit={handleSubmit}
          onCancel={() => {
            setFormOpen(false)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}
