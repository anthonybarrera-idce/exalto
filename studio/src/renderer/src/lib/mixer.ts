/**
 * Web Audio mixer for the four practice tracks: a gain per voice, an automatic make-up gain, and a
 * limiter. Audio elements can't go above 100% volume, and the voice tracks are rendered at a shared
 * level so all four together don't clip, so a voice heard alone needs boosting here.
 */
export type Mixer = {
  connect: (key: string, el: HTMLAudioElement) => void
  set: (levels: Record<string, number>) => void
  resume: () => Promise<void>
  /** Loudest sample leaving the mixer over the last ~20 ms (0–1), for meters and checks. */
  peak: () => number
}

export function createMixer(): Mixer {
  const ctx = new AudioContext()
  const limiter = ctx.createDynamicsCompressor()
  // Acts as a limiter: only peaks near full scale are pulled down, quickly.
  limiter.threshold.value = -3
  limiter.knee.value = 2
  limiter.ratio.value = 20
  limiter.attack.value = 0.002
  limiter.release.value = 0.12
  const master = ctx.createGain()
  const meter = ctx.createAnalyser()
  meter.fftSize = 1024
  master.connect(limiter).connect(ctx.destination)
  limiter.connect(meter)
  const buf = new Float32Array(meter.fftSize)
  const gains = new Map<string, GainNode>()
  const sources = new WeakSet<HTMLAudioElement>()

  return {
    connect(key, el) {
      if (sources.has(el)) return // an element can only be connected once
      const g = gains.get(key) ?? ctx.createGain()
      gains.set(key, g)
      ctx.createMediaElementSource(el).connect(g).connect(master)
      sources.add(el)
    },
    set(levels) {
      const now = ctx.currentTime
      let audible = 0
      for (const [key, level] of Object.entries(levels)) {
        gains.get(key)?.gain.setTargetAtTime(level, now, 0.03)
        audible += level
      }
      // Tracks share one level (all four at 100% = full scale), so make up for the voices not playing:
      // one voice alone gets about 4×, two get 2×, and the limiter catches any peaks.
      const makeUp = Math.min(4, 4 / Math.max(1, audible))
      master.gain.setTargetAtTime(makeUp, now, 0.05)
    },
    resume: () => ctx.resume(),
    peak() {
      meter.getFloatTimeDomainData(buf)
      let m = 0
      for (const v of buf) m = Math.max(m, Math.abs(v))
      return m
    },
  }
}
