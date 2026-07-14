# My Apps

A small collection of browser apps built with **React + Vite**, hosted on
GitHub Pages. A hash-based launcher (`#/`) links to each one; everything runs
client-side with data stored locally in `localStorage`.

- **📈 Trading Journal** (`#/journal`) — log trades, track P&L, analyze performance.
- **🔢 Sudoku** (`#/sudoku`) — classic 9×9 puzzles with notes, hints, and a timer.

---

## Trading Journal

A fast, private trading journal. Log every trade, track your P&L, and analyze
what's actually working — no backend, no account.

### Features

- **Log trades** — symbol, direction (long/short), quantity, entry/exit price,
  dates, fees, strategy tag, and free-form notes.
- **Automatic P&L** — per-trade net profit/loss (fees included), percentage
  return, and win/loss/open status.
- **Performance dashboard** — Net P&L, win rate, profit factor, expectancy,
  average win/loss, and best/worst trade.
- **Equity curve** — cumulative P&L charted across your closed trades.
- **Filter & search** — by symbol, side, result, or free text; the dashboard
  metrics follow the active filter.
- **Edit & delete** any trade inline.
- **Import / export** your journal as JSON for backup or portability.
- **Sample dataset** — load demo trades to explore the app instantly.
- **Persistent** — everything is saved to your browser's local storage.

## Getting started

```bash
npm install      # install dependencies
npm run dev      # start the dev server (http://localhost:5173)
```

### Other scripts

```bash
npm run build    # production build to dist/
npm run preview  # preview the production build
```

## How P&L is calculated

For each trade:

- **Long:** `(exit − entry) × quantity − fees`
- **Short:** `(entry − exit) × quantity − fees`

Aggregate metrics (win rate, profit factor, expectancy, equity curve) are
computed only from **closed** trades — those with an exit price.

---

## Sudoku

A classic 9×9 Sudoku with three difficulty levels. Every puzzle is generated
with a **guaranteed unique solution** (holes are dug from a full solution and
uniqueness is re-verified after each removal).

### Features

- Easy / Medium / Hard (fewer clues = harder).
- On-screen number pad (touch-friendly) plus full keyboard support
  (1–9, Backspace/Delete, arrow keys).
- **Notes** (pencil marks), **Hint**, and **Erase** tools.
- Live conflict highlighting, peer/same-number highlighting, a timer, and a
  mistake counter.
- Auto-saves the current game to `localStorage`.

The engine lives in `src/sudoku/sudoku.js` (generator, solver, conflict
detection) with the UI in `src/sudoku/SudokuApp.jsx`.

## Tech stack

- [React 18](https://react.dev/) + [Vite 5](https://vitejs.dev/)
- [Recharts](https://recharts.org/) for the equity curve
- Plain CSS (dark theme), no UI framework

## Project structure

```
src/
├─ App.jsx                 # top-level state, filtering, import/export
├─ hooks/useTrades.js      # localStorage-backed CRUD store
├─ utils/stats.js          # P&L and aggregate metric calculations
├─ data/sampleTrades.js    # demo dataset
└─ components/
   ├─ Dashboard.jsx        # stat cards + equity chart
   ├─ StatCard.jsx
   ├─ EquityChart.jsx
   ├─ TradeForm.jsx        # add/edit modal
   ├─ TradeTable.jsx
   └─ FilterBar.jsx
```

## Privacy

There is no server. All trade data lives in your browser's `localStorage` and
never leaves your machine. Use **Export** to keep a JSON backup.
