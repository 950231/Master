import { useEffect, useState } from 'react'

const EMPTY = {
  symbol: '',
  direction: 'long',
  quantity: '',
  entryPrice: '',
  exitPrice: '',
  entryDate: '',
  exitDate: '',
  fees: '',
  strategy: '',
  notes: '',
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export default function TradeForm({ initial, onSubmit, onCancel }) {
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})

  useEffect(() => {
    if (initial) {
      setForm({ ...EMPTY, ...initial })
    } else {
      setForm({ ...EMPTY, entryDate: todayISO() })
    }
    setErrors({})
  }, [initial])

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function validate() {
    const e = {}
    if (!form.symbol.trim()) e.symbol = 'Required'
    if (form.quantity === '' || Number(form.quantity) <= 0)
      e.quantity = 'Enter a positive quantity'
    if (form.entryPrice === '' || Number(form.entryPrice) < 0)
      e.entryPrice = 'Enter an entry price'
    if (form.exitPrice !== '' && Number(form.exitPrice) < 0)
      e.exitPrice = 'Invalid'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (!validate()) return
    onSubmit({
      ...form,
      symbol: form.symbol.trim().toUpperCase(),
    })
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{initial ? 'Edit Trade' : 'New Trade'}</h2>
          <button className="icon-btn" onClick={onCancel} aria-label="Close">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="trade-form">
          <div className="form-row">
            <label className="field">
              <span>Symbol</span>
              <input
                type="text"
                value={form.symbol}
                onChange={(e) => set('symbol', e.target.value)}
                placeholder="AAPL"
                autoFocus
              />
              {errors.symbol && <em className="err">{errors.symbol}</em>}
            </label>

            <label className="field">
              <span>Direction</span>
              <select
                value={form.direction}
                onChange={(e) => set('direction', e.target.value)}
              >
                <option value="long">Long</option>
                <option value="short">Short</option>
              </select>
            </label>

            <label className="field">
              <span>Quantity</span>
              <input
                type="number"
                step="any"
                min="0"
                value={form.quantity}
                onChange={(e) => set('quantity', e.target.value)}
                placeholder="100"
              />
              {errors.quantity && <em className="err">{errors.quantity}</em>}
            </label>
          </div>

          <div className="form-row">
            <label className="field">
              <span>Entry Price</span>
              <input
                type="number"
                step="any"
                min="0"
                value={form.entryPrice}
                onChange={(e) => set('entryPrice', e.target.value)}
                placeholder="150.00"
              />
              {errors.entryPrice && <em className="err">{errors.entryPrice}</em>}
            </label>

            <label className="field">
              <span>Exit Price</span>
              <input
                type="number"
                step="any"
                min="0"
                value={form.exitPrice}
                onChange={(e) => set('exitPrice', e.target.value)}
                placeholder="leave blank if open"
              />
              {errors.exitPrice && <em className="err">{errors.exitPrice}</em>}
            </label>

            <label className="field">
              <span>Fees</span>
              <input
                type="number"
                step="any"
                min="0"
                value={form.fees}
                onChange={(e) => set('fees', e.target.value)}
                placeholder="0.00"
              />
            </label>
          </div>

          <div className="form-row">
            <label className="field">
              <span>Entry Date</span>
              <input
                type="date"
                value={form.entryDate}
                onChange={(e) => set('entryDate', e.target.value)}
              />
            </label>

            <label className="field">
              <span>Exit Date</span>
              <input
                type="date"
                value={form.exitDate}
                onChange={(e) => set('exitDate', e.target.value)}
              />
            </label>

            <label className="field">
              <span>Strategy / Tag</span>
              <input
                type="text"
                value={form.strategy}
                onChange={(e) => set('strategy', e.target.value)}
                placeholder="breakout"
              />
            </label>
          </div>

          <label className="field">
            <span>Notes</span>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Setup, thesis, mistakes, lessons…"
            />
          </label>

          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn primary">
              {initial ? 'Save Changes' : 'Add Trade'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
