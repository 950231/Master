export default function FilterBar({ filters, setFilters, symbols }) {
  function update(patch) {
    setFilters((prev) => ({ ...prev, ...patch }))
  }

  return (
    <div className="filter-bar">
      <input
        type="search"
        className="search"
        placeholder="Search symbol, strategy, notes…"
        value={filters.query}
        onChange={(e) => update({ query: e.target.value })}
      />

      <select
        value={filters.symbol}
        onChange={(e) => update({ symbol: e.target.value })}
      >
        <option value="">All symbols</option>
        {symbols.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      <select
        value={filters.direction}
        onChange={(e) => update({ direction: e.target.value })}
      >
        <option value="">Any side</option>
        <option value="long">Long</option>
        <option value="short">Short</option>
      </select>

      <select
        value={filters.result}
        onChange={(e) => update({ result: e.target.value })}
      >
        <option value="">Any result</option>
        <option value="win">Wins</option>
        <option value="loss">Losses</option>
        <option value="open">Open</option>
      </select>
    </div>
  )
}
