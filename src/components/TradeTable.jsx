import {
  formatCurrency,
  formatPct,
  tradePnl,
  tradeReturnPct,
} from '../utils/stats.js'

function StatusBadge({ trade }) {
  const open = trade.exitPrice === '' || trade.exitPrice == null
  if (open) return <span className="badge open">Open</span>
  const pnl = tradePnl(trade)
  if (pnl > 0) return <span className="badge win">Win</span>
  if (pnl < 0) return <span className="badge loss">Loss</span>
  return <span className="badge flat">Flat</span>
}

export default function TradeTable({ trades, onEdit, onDelete }) {
  if (trades.length === 0) {
    return (
      <div className="empty-state">
        <p>No trades match your filters.</p>
      </div>
    )
  }

  return (
    <div className="table-wrap">
      <table className="trade-table">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Side</th>
            <th className="num">Qty</th>
            <th className="num">Entry</th>
            <th className="num">Exit</th>
            <th className="num">P&L</th>
            <th className="num">Return</th>
            <th>Status</th>
            <th>Date</th>
            <th>Strategy</th>
            <th className="actions-col"></th>
          </tr>
        </thead>
        <tbody>
          {trades.map((trade) => {
            const open = trade.exitPrice === '' || trade.exitPrice == null
            const pnl = tradePnl(trade)
            const ret = tradeReturnPct(trade)
            const toneClass = pnl > 0 ? 'tone-pos' : pnl < 0 ? 'tone-neg' : ''
            return (
              <tr key={trade.id}>
                <td className="sym">{trade.symbol}</td>
                <td>
                  <span className={`side ${trade.direction}`}>
                    {trade.direction === 'short' ? 'Short' : 'Long'}
                  </span>
                </td>
                <td className="num">{trade.quantity}</td>
                <td className="num">{formatCurrency(trade.entryPrice)}</td>
                <td className="num">
                  {open ? '—' : formatCurrency(trade.exitPrice)}
                </td>
                <td className={`num ${toneClass}`}>
                  {open ? '—' : formatCurrency(pnl)}
                </td>
                <td className={`num ${toneClass}`}>
                  {open ? '—' : formatPct(ret)}
                </td>
                <td>
                  <StatusBadge trade={trade} />
                </td>
                <td className="date">
                  {trade.exitDate || trade.entryDate || '—'}
                </td>
                <td>
                  {trade.strategy ? (
                    <span className="tag">{trade.strategy}</span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="actions-col">
                  <button
                    className="icon-btn"
                    onClick={() => onEdit(trade)}
                    aria-label="Edit trade"
                    title="Edit"
                  >
                    ✎
                  </button>
                  <button
                    className="icon-btn danger"
                    onClick={() => onDelete(trade)}
                    aria-label="Delete trade"
                    title="Delete"
                  >
                    🗑
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
