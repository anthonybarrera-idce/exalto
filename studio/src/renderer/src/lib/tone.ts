/** A short piano-like tone in the browser (same recipe as the converter's built-in piano). */
let ctx: AudioContext | null = null

export type Sound = "piano" | "tone"

/** A sounding note. It ends by itself after `seconds` unless `hold()` keeps it going until `stop()`. */
export type HeldTone = {
  /** The written length it plays for when not held */
  seconds: number
  /** Keep sounding until stop() (capped at HOLD_CAP seconds; `onCap` runs if the cap ends it). */
  hold: (onCap?: () => void) => void
  /** Release now, smoothly. */
  stop: () => void
}

/** Longest a held note sounds before it releases by itself */
export const HOLD_CAP = 10
/** A decaying piano partial settles at this share of its attack level while held */
const PIANO_FLOOR = 0.22

export function playTone(freqs: number[], seconds: number, sound: Sound = "piano") {
  startTone(freqs, seconds, sound)
}

/** Like playTone, but returns a handle that can hold the note and release it later. */
export function startTone(freqs: number[], seconds: number, sound: Sound = "piano"): HeldTone {
  ctx ??= new AudioContext()
  const ac = ctx
  const now = ac.currentTime
  const out = ac.createGain()
  out.gain.value = 0.25 / Math.max(1, freqs.length)
  out.connect(ac.destination)
  const partials: { osc: OscillatorNode; g: GainNode; amp: number; tau: number }[] = []
  if (sound === "tone") {
    // "Just notes": a steady tone held for the whole note
    for (const f0 of freqs) {
      ;[1, 0.12].forEach((amp, k) => {
        const osc = ac.createOscillator()
        const g = ac.createGain()
        osc.frequency.value = f0 * (k + 1)
        g.gain.setValueAtTime(0, now)
        g.gain.linearRampToValueAtTime(amp, now + 0.02)
        g.gain.setValueAtTime(amp, now + Math.max(0.03, seconds - 0.04))
        g.gain.linearRampToValueAtTime(0, now + seconds + 0.04)
        osc.connect(g).connect(out)
        osc.start(now)
        osc.stop(now + seconds + 0.1)
        partials.push({ osc, g, amp, tau: 0 })
      })
    }
  } else {
    for (const f0 of freqs) {
      ;[1, 0.55, 0.3, 0.18, 0.1].forEach((amp, k) => {
        const f = f0 * (k + 1) * Math.sqrt(1 + 0.0004 * (k + 1) ** 2)
        if (f > 18000) return
        const osc = ac.createOscillator()
        const g = ac.createGain()
        osc.frequency.value = f
        const decay = (1.2 + 0.9 * (k + 1)) * (0.6 + f0 / 900)
        g.gain.setValueAtTime(0, now)
        g.gain.linearRampToValueAtTime(amp, now + 0.005)
        g.gain.setTargetAtTime(0, now + 0.005, 1 / decay)
        g.gain.setTargetAtTime(0, now + seconds, 0.08) // release
        osc.connect(g).connect(out)
        osc.start(now)
        osc.stop(now + seconds + 0.6)
        partials.push({ osc, g, amp, tau: 1 / decay })
      })
    }
  }

  let held = false
  let done = false
  let cap = 0
  const stop = () => {
    if (done) return
    done = true
    clearTimeout(cap)
    live.delete(handle)
    const t = ac.currentTime
    out.gain.cancelAndHoldAtTime(t)
    out.gain.setTargetAtTime(0, t, 0.05)
    for (const p of partials) p.osc.stop(t + 0.4)
  }
  const handle: HeldTone = {
    seconds,
    hold: (onCap) => {
      if (held || done) return
      held = true
      const t = ac.currentTime
      for (const p of partials) {
        // Drop the scheduled release and keep going: the steady tone stays put, the piano
        // keeps decaying the same way but settles on a quiet floor instead of dying out.
        p.g.gain.cancelAndHoldAtTime(t)
        if (sound === "tone") p.g.gain.linearRampToValueAtTime(p.amp, t + 0.03)
        else p.g.gain.setTargetAtTime(p.amp * PIANO_FLOOR, t, p.tau)
        p.osc.stop(t + HOLD_CAP + 1) // backstop if the timer below never runs
      }
      live.add(handle)
      cap = window.setTimeout(() => {
        stop()
        onCap?.()
      }, HOLD_CAP * 1000)
    },
    stop,
  }
  return handle
}

/** Held notes still sounding, so leaving the window never leaves one stuck. */
const live = new Set<HeldTone>()
if (typeof window !== "undefined") {
  const stopAll = () => [...live].forEach((h) => h.stop())
  window.addEventListener("blur", stopAll)
  document.addEventListener("visibilitychange", () => document.hidden && stopAll())
}
