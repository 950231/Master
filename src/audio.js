// Shared sound for all the apps.
//
// Everything here is synthesised with the Web Audio API rather than loaded
// from files: a dozen sound effects would otherwise be a few hundred
// kilobytes of downloads, and these are all short enough that generating them
// costs nothing.

const KEY = 'app.sound.v1'

let ctx = null
let master = null
let noise = null
let muted = read()

function read() {
  try {
    const v = localStorage.getItem(KEY)
    return v === null ? false : v === 'off'
  } catch {
    return false
  }
}

function write() {
  try {
    localStorage.setItem(KEY, muted ? 'off' : 'on')
  } catch {
    /* ignore */
  }
}

/**
 * Browsers refuse to start audio outside a user gesture, and iOS additionally
 * suspends the context when the tab is backgrounded — so this is safe to call
 * on every tap, and does nothing once things are running.
 */
export function unlock() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return
      ctx = new AC()
      master = ctx.createGain()
      master.gain.value = 0.9
      master.connect(ctx.destination)

      // One second of white noise, reused for every hiss and crunch.
      const len = Math.floor(ctx.sampleRate)
      noise = ctx.createBuffer(1, len, ctx.sampleRate)
      const data = noise.getChannelData(0)
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    }
    if (ctx.state === 'suspended') ctx.resume()
  } catch {
    /* audio unavailable — the apps stay silent and keep working */
  }
}

export const isMuted = () => muted
export function setMuted(v) {
  muted = !!v
  write()
  if (!muted) unlock()
}
export function toggleMuted() {
  setMuted(!muted)
  return muted
}

const now = () => (ctx ? ctx.currentTime : 0)
const ready = () => !muted && ctx && ctx.state === 'running'

/** A single shaped tone. */
function tone({ type = 'sine', from, to = from, t0 = 0, dur = 0.12, gain = 0.2, curve = 'exp' }) {
  if (!ready()) return
  const t = now() + t0
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(from, t)
  if (to !== from) {
    if (curve === 'exp') osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur)
    else osc.frequency.linearRampToValueAtTime(to, t + dur)
  }
  // A tiny attack avoids the click you get from starting at full gain.
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.012, dur * 0.2))
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(g).connect(master)
  osc.start(t)
  osc.stop(t + dur + 0.02)
}

/** A burst of filtered noise — used for hisses, crunches and thuds. */
function hiss({ t0 = 0, dur = 0.3, gain = 0.2, from = 3000, to = 600, q = 1.2, type = 'bandpass' }) {
  if (!ready()) return
  const t = now() + t0
  const src = ctx.createBufferSource()
  src.buffer = noise
  src.loop = true
  const f = ctx.createBiquadFilter()
  f.type = type
  f.frequency.setValueAtTime(from, t)
  f.frequency.exponentialRampToValueAtTime(Math.max(60, to), t + dur)
  f.Q.value = q
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.02, dur * 0.2))
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(f).connect(g).connect(master)
  src.start(t)
  src.stop(t + dur + 0.02)
}

/** Equal-tempered step from a base frequency, for melodic runs. */
const step = (base, semitones) => base * Math.pow(2, semitones / 12)

export const SOUNDS = {
  /** Snake takes an egg. Pitch climbs with the combo so a streak is audible. */
  eat(combo = 1) {
    const base = step(440, Math.min(24, (combo - 1) * 2))
    tone({ type: 'triangle', from: base, to: base * 1.5, dur: 0.1, gain: 0.22 })
    hiss({ dur: 0.06, gain: 0.1, from: 2600, to: 900 })
  },

  /** The lump going down: a low, wet gulp. */
  swallow() {
    tone({ type: 'sine', from: 190, to: 85, dur: 0.22, gain: 0.16 })
    hiss({ t0: 0.02, dur: 0.16, gain: 0.05, from: 700, to: 200, type: 'lowpass' })
  },

  /** Power-up: a quick rising arpeggio. */
  power() {
    ;[0, 4, 7, 12].forEach((s, i) =>
      tone({ type: 'square', from: step(520, s), dur: 0.09, gain: 0.13, t0: i * 0.05 }),
    )
  },

  /** Death: the cobra hisses, then the tone falls away. */
  die() {
    hiss({ dur: 0.7, gain: 0.26, from: 5200, to: 400, q: 0.8 })
    tone({ type: 'sawtooth', from: 320, to: 55, dur: 0.65, gain: 0.16 })
  },

  /** Steering — deliberately almost inaudible, it fires constantly. */
  turn() {
    tone({ type: 'sine', from: 900, dur: 0.03, gain: 0.035 })
  },

  /** Sudoku: a digit goes in. */
  place() {
    tone({ type: 'sine', from: 680, to: 880, dur: 0.07, gain: 0.16 })
  },

  /** A wrong digit. */
  wrong() {
    tone({ type: 'square', from: 165, to: 120, dur: 0.2, gain: 0.15 })
    tone({ type: 'square', from: 110, to: 82, dur: 0.22, gain: 0.1, t0: 0.02 })
  },

  /** A row, column or box completed. */
  unit() {
    ;[0, 5, 9].forEach((s, i) =>
      tone({ type: 'triangle', from: step(660, s), dur: 0.16, gain: 0.15, t0: i * 0.06 }),
    )
  },

  /** Finishing a whole puzzle, or any big win. */
  win() {
    ;[0, 4, 7, 12, 16].forEach((s, i) =>
      tone({ type: 'triangle', from: step(523, s), dur: 0.34, gain: 0.17, t0: i * 0.1 }),
    )
    hiss({ t0: 0.45, dur: 0.5, gain: 0.06, from: 6000, to: 2000 })
  },

  /** A button or menu tap. */
  tap() {
    tone({ type: 'sine', from: 520, dur: 0.05, gain: 0.1 })
  },
}

/** Play by name, ignoring anything unknown so callers never need to guard. */
export function play(name, ...args) {
  const fn = SOUNDS[name]
  if (fn && ready()) {
    try {
      fn(...args)
    } catch {
      /* never let a sound break the game */
    }
  }
}
