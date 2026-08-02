// Shared sound for all the apps, in two selectable packs.
//
// Everything is synthesised with the Web Audio API rather than loaded from
// files: a couple of dozen effects would otherwise be a few hundred kilobytes
// of downloads, and these are all short enough to generate on the spot.
//
//   arcade — layered, detuned, with a delay send. Modern game feel.
//   nokia  — one square-wave voice at a time, hard-gated, no effects at all.
//            That monophonic limitation is the sound of those phones; it is
//            enforced rather than imitated.
//
// The Nokia motifs here are written for this app. The actual Nokia ringtone
// is a trademarked arrangement and is deliberately not reproduced.

const KEY = 'app.sound.v2'
const OLD_KEY = 'app.sound.v1'

export const PACKS = ['arcade', 'nokia']

let ctx = null
let master = null
let delayBus = null
let noise = null
let monoVoice = null // the single Nokia voice, so a new note cuts the old one

let state = read()

function read() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const v = JSON.parse(raw)
      return { pack: PACKS.includes(v.pack) ? v.pack : 'arcade', muted: !!v.muted }
    }
    // Carry over the older on/off-only setting.
    const old = localStorage.getItem(OLD_KEY)
    return { pack: 'arcade', muted: old === 'off' }
  } catch {
    return { pack: 'arcade', muted: false }
  }
}

function write() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
}

/**
 * Browsers refuse to start audio outside a user gesture, and iOS suspends the
 * context when the tab is backgrounded — so this is safe to call on every tap
 * and does nothing once things are running.
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

      // Short feedback delay, used only by the arcade pack.
      const delay = ctx.createDelay(1)
      delay.delayTime.value = 0.16
      const fb = ctx.createGain()
      fb.gain.value = 0.28
      const wet = ctx.createGain()
      wet.gain.value = 0.35
      delay.connect(fb).connect(delay)
      delay.connect(wet).connect(master)
      delayBus = delay

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

export const isMuted = () => state.muted
export const getPack = () => state.pack

export function setPack(pack) {
  if (!PACKS.includes(pack)) return
  state = { ...state, pack, muted: false }
  write()
  unlock()
}

export function setMuted(v) {
  state = { ...state, muted: !!v }
  write()
  if (!state.muted) unlock()
}

/** Cycle arcade → nokia → muted, which is one button instead of three. */
export function cycleSound() {
  if (state.muted) state = { pack: 'arcade', muted: false }
  else if (state.pack === 'arcade') state = { pack: 'nokia', muted: false }
  else state = { ...state, muted: true }
  write()
  if (!state.muted) unlock()
  return { ...state }
}

/** Label for the current setting, for the UI to show. */
export function soundLabel() {
  if (state.muted) return { icon: '🔇', text: 'MUTED', on: false }
  return state.pack === 'nokia'
    ? { icon: '📟', text: 'NOKIA', on: true }
    : { icon: '🔊', text: 'ARCADE', on: true }
}

const now = () => (ctx ? ctx.currentTime : 0)
const ready = () => !state.muted && ctx && ctx.state === 'running'
const semis = (base, n) => base * Math.pow(2, n / 12)

/* --------------------------------------------------------------- arcade */

function tone({ type = 'sine', from, to = from, t0 = 0, dur = 0.12, gain = 0.2, detune = 0, echo = false }) {
  if (!ready()) return
  const t = now() + t0
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = type
  osc.detune.value = detune
  osc.frequency.setValueAtTime(from, t)
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.012, dur * 0.2))
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(g)
  g.connect(master)
  if (echo && delayBus) g.connect(delayBus)
  osc.start(t)
  osc.stop(t + dur + 0.02)
}

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

/** Two slightly detuned voices — the thickness that makes it sound modern. */
function fat(opts) {
  tone({ ...opts, detune: -7 })
  tone({ ...opts, detune: +7, gain: (opts.gain ?? 0.2) * 0.8 })
}

/* ---------------------------------------------------------------- nokia */

/**
 * One hard-gated square-wave note. Those phones had a single voice, so a new
 * note cuts off whatever was playing — that abruptness is most of the sound.
 */
function beep(freq, dur = 0.09, gain = 0.16, t0 = 0) {
  if (!ready()) return
  const t = now() + t0
  if (monoVoice && t0 === 0) {
    try {
      monoVoice.stop(t)
    } catch {
      /* already stopped */
    }
  }
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = 'square'
  osc.frequency.setValueAtTime(freq, t)
  // Square gate: no ramps, which is what gives the blocky character.
  g.gain.setValueAtTime(gain, t)
  g.gain.setValueAtTime(0, t + dur)
  osc.connect(g).connect(master)
  osc.start(t)
  osc.stop(t + dur + 0.005)
  if (t0 === 0) monoVoice = osc
}

/** A run of monophonic notes, the only way that pack makes a melody. */
function melody(notes, base = 660, step = 0.11, gain = 0.16) {
  notes.forEach(([s, len], i) => beep(semis(base, s), (len ?? 1) * step * 0.85, gain, i * step))
}

/* --------------------------------------------------------------- packs */

const ARCADE = {
  eat(combo = 1) {
    const base = semis(440, Math.min(24, (combo - 1) * 2))
    fat({ type: 'triangle', from: base, to: base * 1.5, dur: 0.1, gain: 0.19, echo: combo > 2 })
    hiss({ dur: 0.06, gain: 0.09, from: 2600, to: 900 })
  },
  swallow() {
    tone({ type: 'sine', from: 190, to: 85, dur: 0.24, gain: 0.16 })
    hiss({ t0: 0.02, dur: 0.16, gain: 0.05, from: 700, to: 200, type: 'lowpass' })
  },
  power() {
    ;[0, 4, 7, 12].forEach((s, i) =>
      fat({ type: 'square', from: semis(520, s), dur: 0.09, gain: 0.11, t0: i * 0.05, echo: true }),
    )
  },
  die() {
    hiss({ dur: 0.75, gain: 0.26, from: 5200, to: 380, q: 0.8 })
    tone({ type: 'sawtooth', from: 320, to: 55, dur: 0.7, gain: 0.15 })
    tone({ type: 'sine', from: 90, to: 38, dur: 0.9, gain: 0.18 })
  },
  turn() {
    tone({ type: 'sine', from: 900, dur: 0.03, gain: 0.03 })
  },
  place() {
    fat({ type: 'sine', from: 680, to: 880, dur: 0.07, gain: 0.14 })
  },
  wrong() {
    tone({ type: 'square', from: 165, to: 120, dur: 0.2, gain: 0.14 })
    tone({ type: 'square', from: 110, to: 82, dur: 0.22, gain: 0.09, t0: 0.02 })
  },
  unit() {
    ;[0, 5, 9].forEach((s, i) =>
      fat({ type: 'triangle', from: semis(660, s), dur: 0.16, gain: 0.12, t0: i * 0.06, echo: true }),
    )
  },
  win() {
    ;[0, 4, 7, 12, 16].forEach((s, i) =>
      fat({ type: 'triangle', from: semis(523, s), dur: 0.34, gain: 0.14, t0: i * 0.1, echo: true }),
    )
    hiss({ t0: 0.45, dur: 0.5, gain: 0.06, from: 6000, to: 2000 })
  },
  tap() {
    tone({ type: 'sine', from: 520, dur: 0.05, gain: 0.09 })
  },
}

const NOKIA = {
  eat(combo = 1) {
    beep(semis(988, Math.min(12, (combo - 1) * 2)), 0.06, 0.17)
  },
  swallow() {
    beep(330, 0.05, 0.1, 0.07)
  },
  power() {
    melody([[0], [7]], 784, 0.08, 0.17)
  },
  die() {
    // The classic shape: three notes walking down, then a long low one.
    melody([[0], [-3], [-7], [-12, 3]], 622, 0.14, 0.18)
  },
  turn() {
    beep(1480, 0.012, 0.04)
  },
  place() {
    beep(880, 0.05, 0.14)
  },
  wrong() {
    beep(147, 0.18, 0.16)
  },
  unit() {
    melody([[0], [4], [7]], 784, 0.09, 0.16)
  },
  win() {
    melody([[0], [4], [7], [12], [7], [12, 2]], 659, 0.12, 0.17)
  },
  tap() {
    beep(1047, 0.03, 0.09)
  },
}

const BANK = { arcade: ARCADE, nokia: NOKIA }

/** Play by name, ignoring anything unknown so callers never need to guard. */
export function play(name, ...args) {
  if (!ready()) return
  const fn = BANK[state.pack]?.[name]
  if (!fn) return
  try {
    fn(...args)
  } catch {
    /* never let a sound break the game */
  }
}
