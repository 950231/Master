# Trading Journal

A fast, private trading journal built with **React + Vite**. Log every trade,
track your P&L, and analyze what's actually working — all in the browser, with
no backend and no account. Your data is stored locally in `localStorage`.

## Features

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
