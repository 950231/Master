// Aggregates the raw NIFTY 5-minute CSV into compact per-timeframe JSON files
// under public/nifty/. Bars are stored columnar and delta-free as:
//   { tf, from, to, t: [epochSeconds...], o, h, l, c }
// Prices are rounded to 2dp; this keeps the payload small enough to fetch on
// demand instead of bundling ~10 MB of candles into the app.
//
// Usage: node scripts/build-nifty-data.mjs <path-to-csv>

import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'

const csvPath = process.argv[2]
if (!csvPath) {
  console.error('usage: node scripts/build-nifty-data.mjs <csv>')
  process.exit(1)
}

const outDir = path.join(process.cwd(), 'public', 'nifty')
fs.mkdirSync(outDir, { recursive: true })

/** Parse "YYYY-MM-DD HH:MM:SS" as IST wall-clock into epoch seconds (UTC+5:30). */
function parseIST(s) {
  const y = +s.slice(0, 4)
  const mo = +s.slice(5, 7)
  const d = +s.slice(8, 10)
  const h = +s.slice(11, 13)
  const mi = +s.slice(14, 16)
  return Date.UTC(y, mo - 1, d, h, mi) / 1000 - 5.5 * 3600
}

const bars = []
const rl = readline.createInterface({
  input: fs.createReadStream(csvPath),
  crlfDelay: Infinity,
})

let first = true
for await (const line of rl) {
  if (first) {
    first = false
    continue // header
  }
  if (!line) continue
  const [date, o, h, l, c] = line.split(',')
  bars.push({
    t: parseIST(date),
    day: date.slice(0, 10),
    o: +o,
    h: +h,
    l: +l,
    c: +c,
  })
}
bars.sort((a, b) => a.t - b.t)
console.log(`read ${bars.length} 5m bars: ${bars[0].day} -> ${bars.at(-1).day}`)

/** Group consecutive bars into buckets using a key function, OHLC-merging each. */
function aggregate(src, keyOf) {
  const out = []
  let cur = null
  let curKey = null
  for (const b of src) {
    const k = keyOf(b)
    if (k !== curKey) {
      if (cur) out.push(cur)
      cur = { t: b.t, o: b.o, h: b.h, l: b.l, c: b.c }
      curKey = k
    } else {
      cur.h = Math.max(cur.h, b.h)
      cur.l = Math.min(cur.l, b.l)
      cur.c = b.c
    }
  }
  if (cur) out.push(cur)
  return out
}

const r2 = (n) => Math.round(n * 100) / 100

function write(name, list, tf) {
  const payload = {
    tf,
    count: list.length,
    t: list.map((b) => b.t),
    o: list.map((b) => r2(b.o)),
    h: list.map((b) => r2(b.h)),
    l: list.map((b) => r2(b.l)),
    c: list.map((b) => r2(b.c)),
  }
  const file = path.join(outDir, name)
  fs.writeFileSync(file, JSON.stringify(payload))
  const kb = (fs.statSync(file).size / 1024).toFixed(0)
  console.log(`  ${name.padEnd(22)} ${String(list.length).padStart(7)} bars  ${kb} KB`)
}

// Bucket keys. 5m bars are already the base resolution.
const dayKey = (b) => b.day
const weekKey = (b) => {
  // ISO-ish week bucket: floor the epoch to 7-day periods anchored on Monday.
  const d = new Date((b.t + 5.5 * 3600) * 1000)
  const dow = (d.getUTCDay() + 6) % 7 // Mon=0
  const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow)
  return monday
}
const hourKey = (b) => b.day + ' ' + new Date((b.t + 5.5 * 3600) * 1000).getUTCHours()
const min15Key = (b) => Math.floor(b.t / 900)
const min30Key = (b) => Math.floor(b.t / 1800)

console.log('writing aggregates:')
write('1w.json', aggregate(bars, weekKey), '1w')
write('1d.json', aggregate(bars, dayKey), '1d')
write('1h.json', aggregate(bars, hourKey), '1h')
write('30m.json', aggregate(bars, min30Key), '30m')
write('15m.json', aggregate(bars, min15Key), '15m')

// 5m is large, so split it per calendar year and fetch only what is viewed.
const years = [...new Set(bars.map((b) => b.day.slice(0, 4)))].sort()
const index = { years, from: bars[0].day, to: bars.at(-1).day, total5m: bars.length }
for (const y of years) {
  write(`5m-${y}.json`, bars.filter((b) => b.day.startsWith(y)), '5m')
}
fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index))
console.log('  index.json ->', years.join(', '))
