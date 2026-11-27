import { AudioContext, AudioManager, type AudioBuffer, type GainNode } from 'react-native-audio-api';

import { midiToHz, playEvents, VOICES, type PlayEvent, type PracticeData, type Voice } from '@/lib/practice';

/**
 * Plays practice notes on the phone with the native audio engine (react-native-audio-api),
 * instead of streaming the rendered audio tracks: "piano" is a synthesized piano (three strings,
 * inharmonic partials, a clean natural decay), "tone" ("Solo notas") a steady tone held for the note.
 */
/** 'grand' = recorded Salamander grand piano; 'piano' = the synthesized piano; 'choir' = sung voices; 'tone' = plain notes. */
export type Sound = 'grand' | 'piano' | 'choir' | 'tone';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function audio() {
  if (!ctx) {
    // Play through the speaker even with the silent switch on, like other music apps.
    AudioManager.setSystemOptions({ ios: { category: 'playback', mode: 'default', options: [] } });
    ctx = new AudioContext();
    master = ctx.createGain();
    // No waveshaper/limiter: it added harsh harmonics ("static") when a soloed voice was boosted.
    // Levels are staged instead so the loudest case (all four voices, or one soloed) peaks just under 1.
    master.gain.value = 1;
    master.connect(ctx.destination);
  }
  return { ctx, master: master! };
}

type Voicing = { release: (at: number) => void };

/**
 * One note peaks at about NOTE_LEVEL × 0.9. Four voices together stay just under full scale; a soloed
 * voice gets make-up gain so it plays at the same loudness as the full mix (see applyLevels).
 */
const NOTE_LEVEL = 0.26;

/*
 * Each pitch is rendered ONCE into an audio buffer (per sound), then every note is just one buffer
 * source plus one gain. Building 5-6 live oscillators per note overloaded the phone's audio engine in
 * busy passages (static, crackles) and kept the JS thread so busy that buttons stopped responding.
 */
const PIANO_SECONDS = 3.2;
const TONE_SECONDS = 4;
const CHOIR_SECONDS = 3;
const buffers = new Map<string, { buffer: AudioBuffer; loop?: boolean }>();

/** Fill `out` with a sum of decaying sines, using rotation recurrences (fast: no Math.sin per sample). */
function addPartial(out: Float32Array, rate: number, freq: number, amp: number, fastDecay: number, slowDecay: number, mix = 0.65) {
  const w = (2 * Math.PI * freq) / rate;
  if (freq >= rate / 2 - 500) return;
  const c = Math.cos(w);
  const sn = Math.sin(w);
  let x = 0; // sin
  let y = 1; // cos
  let e1 = amp * mix;
  let e2 = amp * (1 - mix);
  const d1 = Math.exp(-fastDecay / rate);
  const d2 = Math.exp(-slowDecay / rate);
  for (let i = 0; i < out.length; i++) {
    out[i] += (e1 + e2) * x;
    const nx = x * c + y * sn;
    y = y * c - x * sn;
    x = nx;
    e1 *= d1;
    e2 *= d2;
    if ((i & 4095) === 0) {
      // keep the oscillator on the unit circle (rounding drift)
      const r = 1 / Math.sqrt(x * x + y * y);
      x *= r;
      y *= r;
    }
  }
}

function normalize(data: Float32Array, peak: number) {
  let m = 0;
  for (let i = 0; i < data.length; i++) m = Math.max(m, Math.abs(data[i]));
  if (m > 0) for (let i = 0; i < data.length; i++) data[i] *= peak / m;
}

function sample(midi: number, sound: Sound) {
  const key = `${sound}:${midi}`;
  const hit = buffers.get(key);
  if (hit) return hit;
  const { ctx } = audio();
  const rate = ctx.sampleRate;
  const f0 = midiToHz(midi);
  let entry: { buffer: AudioBuffer; loop?: boolean };
  if (sound === 'piano') {
    /*
     * A clean synthesized piano, close to Hymn Studio's rendered piano but a little fuller:
     * - 3 very slightly detuned strings per note (2 in the bass), the centre one loudest
     * - up to 12 partials with string inharmonicity (partials run a little sharp, more so in the treble)
     * - the lowest 3 partials keep a short, quiet "aftersound"; higher partials just die away, so the
     *   tone mellows instead of leaving a bright tail
     * - a short, soft hammer "thump" at the start
     * Earlier versions had ±1 cent detune and a long aftersound (fast/7) on every partial: the high
     * partials kept ringing and beating against each other, which sounded like reverb after each note.
     */
    const n = Math.floor(PIANO_SECONDS * rate);
    const data = new Float32Array(n);
    const B = 0.00008 * 2 ** ((midi - 48) / 18); // inharmonicity
    // [detune in cents, weight]
    const strings = midi < 40 ? [[-0.25, 0.5], [0.25, 0.5]] : [[-0.3, 0.3], [0, 0.4], [0.35, 0.3]];
    const brightness = 0.55 + Math.min(0.35, Math.max(0, (72 - midi) / 60));
    for (const [cents, weight] of strings) {
      const f = f0 * 2 ** (cents / 1200);
      for (let k = 1; k <= 12; k++) {
        const fk = f * k * Math.sqrt(1 + B * k * k);
        if (fk > 12000) break;
        const amp = (Math.pow(brightness, k - 1) / k ** 0.6) * weight;
        const fast = (1.4 + 0.8 * k) * (0.6 + f0 / 800);
        addPartial(data, rate, fk, amp, fast, fast / 3, k <= 3 ? 0.85 : 1);
      }
    }
    // hammer thump: a few ms of soft, low-passed noise
    let lp = 0;
    const thumpLen = Math.floor(0.012 * rate);
    for (let i = 0; i < thumpLen; i++) {
      lp += 0.25 * ((Math.random() * 2 - 1) - lp);
      data[i] += lp * 0.06 * (1 - i / thumpLen);
    }
    // 2 ms attack so the start never clicks
    const att = Math.floor(0.002 * rate);
    for (let i = 0; i < att; i++) data[i] *= i / att;
    // fade the last 0.4 s so a long-held low note ends smoothly instead of clicking off
    const fade = Math.floor(0.4 * rate);
    for (let i = 0; i < fade; i++) data[n - 1 - i] *= i / fade;
    // even loudness across the keyboard, a touch fuller in the bass
    normalize(data, 0.9 * Math.min(1, 0.8 + Math.max(0, (60 - midi) / 60)));
    const buffer = ctx.createBuffer(1, n, rate);
    buffer.copyToChannel(data, 0);
    entry = { buffer };
  } else if (sound === 'choir') {
    /*
     * "Choir": four singers on an open "oh/ah" vowel, built to sound like voices rather than a buzzer:
     * - a soft, breathy source: harmonics fall off ~12 dB per octave, like a relaxed sung tone
     * - vowel resonances (formants) placed for women's voices on high notes and men's on low notes
     * - each singer has their own slight detune, vibrato speed and depth, and slow pitch drift,
     *   so the four never line up exactly (that's what makes a group sound like a group)
     * - a little breath noise, shaped by the same vowel
     * Rendered at 22.05 kHz (voices have nothing above ~5 kHz), which keeps it quick to build.
     * Every singer completes whole cycles over the buffer, so held notes loop without a seam.
     */
    const r = 22050;
    const n = Math.floor(CHOIR_SECONDS * r);
    const T = n / r;
    const data = new Float32Array(n);
    const female = midi >= 57; // ~A3 and up: alto/soprano register
    const scale = female ? 1.14 : 1;
    const formants = [
      { f: 570 * scale, bw: 90, a: 1 }, // F1 ("oh"/"ah" blend)
      { f: 940 * scale, bw: 120, a: 0.5 }, // F2
      { f: 2500 * scale, bw: 200, a: 0.18 }, // F3
      { f: 3300 * scale, bw: 260, a: 0.1 }, // F4 ("singer's ring", soft)
    ];
    // a resonance curve per formant (smooth, like a real vocal tract)
    const tract = (f: number) => formants.reduce((g, x) => g + x.a / (1 + ((f - x.f) / x.bw) ** 2), 0) + 0.03;
    const singers = [
      { cents: -7, vib: 5.1, depth: 0.0038, drift: 0.27, ph: 0.0 },
      { cents: 4, vib: 5.6, depth: 0.0046, drift: 0.19, ph: 1.7 },
      { cents: -2, vib: 4.8, depth: 0.0032, drift: 0.33, ph: 3.1 },
      { cents: 9, vib: 5.9, depth: 0.0042, drift: 0.23, ph: 4.6 },
    ];
    for (const sg of singers) {
      const cycles = Math.max(1, Math.round((f0 * 2 ** (sg.cents / 1200) * n) / r));
      const f = (cycles * r) / n;
      const kMax = Math.max(1, Math.floor(4800 / f));
      const amps = Array.from({ length: kMax + 1 }, (_, k) => (k === 0 ? 0 : tract(k * f) / k ** 1.0));
      // whole numbers of vibrato and drift cycles over the buffer, so the loop point is seamless
      const vibHz = Math.max(1, Math.round(sg.vib * T)) / T;
      const driftHz = Math.max(1, Math.round(sg.drift * T)) / T;
      const vDepth = sg.depth * f;
      const dDepth = 0.0012 * f;
      for (let i = 0; i < n; i++) {
        const t = i / r;
        const phase =
          2 * Math.PI * f * t +
          (vDepth / vibHz) * (Math.cos(sg.ph) - Math.cos(2 * Math.PI * vibHz * t + sg.ph)) +
          (dDepth / driftHz) * (Math.cos(sg.ph * 2) - Math.cos(2 * Math.PI * driftHz * t + sg.ph * 2));
        const s1 = Math.sin(phase);
        const c2 = 2 * Math.cos(phase);
        let prev = 0;
        let cur = s1;
        let v = amps[1] * s1;
        for (let k = 2; k <= kMax; k++) {
          const next = c2 * cur - prev; // sin(kφ) by recurrence
          prev = cur;
          cur = next;
          v += amps[k] * next;
        }
        // gentle loudness swell of each singer (whole cycles too)
        data[i] += v * (1 + 0.06 * Math.sin(2 * Math.PI * driftHz * t + sg.ph));
      }
    }
    // breath: noise through two band resonators near the first formants, kept very quiet
    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(data[i]));
    const breath = (fc: number, bw: number) => {
      const R = Math.exp((-Math.PI * bw) / r);
      const c = 2 * R * Math.cos((2 * Math.PI * fc) / r);
      let y1 = 0;
      let y2 = 0;
      return (x: number) => {
        const y = (1 - R) * x + c * y1 - R * R * y2;
        y2 = y1;
        y1 = y;
        return y;
      };
    };
    const b1 = breath(formants[0].f, 200);
    const b2 = breath(formants[1].f, 260);
    for (let i = 0; i < n; i++) {
      const x = Math.random() * 2 - 1;
      data[i] += peak * 0.05 * (b1(x) + 0.6 * b2(x));
    }
    normalize(data, 0.95);
    const buffer = ctx.createBuffer(1, n, r);
    buffer.copyToChannel(data, 0);
    entry = { buffer, loop: true };
  } else {
    /*
     * "Just notes": a steady, round tone. The whole buffer holds an exact whole number of cycles
     * (the pitch is nudged by under 3 cents), so it loops seamlessly with no tick at the seam.
     */
    const n = Math.floor(TONE_SECONDS * rate);
    const cycles = Math.max(1, Math.round((f0 * n) / rate));
    const w = (2 * Math.PI * cycles) / n;
    const data = new Float32Array(n);
    for (let i = 0; i < n; i++) data[i] = Math.sin(w * i) + 0.12 * Math.sin(2 * w * i) + 0.03 * Math.sin(3 * w * i);
    normalize(data, 0.95);
    const buffer = ctx.createBuffer(1, n, rate);
    buffer.copyToChannel(data, 0);
    entry = { buffer, loop: true };
  }
  buffers.set(key, entry);
  return entry;
}

/*
 * Real piano: Salamander Grand Piano by Alexander Holm (CC-BY 3.0), a Yamaha C5, one sample every
 * three notes from C2 to C6 (bundled in assets/practice/piano). Notes in between are the nearest
 * sample, pitched by at most a semitone and a half. Until they're decoded, the synthesized piano plays.
 */
const PIANO_SAMPLES: Record<number, number> = {
  36: require('../../assets/practice/piano/C2.mp3'),
  39: require('../../assets/practice/piano/Ds2.mp3'),
  42: require('../../assets/practice/piano/Fs2.mp3'),
  45: require('../../assets/practice/piano/A2.mp3'),
  48: require('../../assets/practice/piano/C3.mp3'),
  51: require('../../assets/practice/piano/Ds3.mp3'),
  54: require('../../assets/practice/piano/Fs3.mp3'),
  57: require('../../assets/practice/piano/A3.mp3'),
  60: require('../../assets/practice/piano/C4.mp3'),
  63: require('../../assets/practice/piano/Ds4.mp3'),
  66: require('../../assets/practice/piano/Fs4.mp3'),
  69: require('../../assets/practice/piano/A4.mp3'),
  72: require('../../assets/practice/piano/C5.mp3'),
  75: require('../../assets/practice/piano/Ds5.mp3'),
  78: require('../../assets/practice/piano/Fs5.mp3'),
  81: require('../../assets/practice/piano/A5.mp3'),
  84: require('../../assets/practice/piano/C6.mp3'),
};
const pianoBuffers = new Map<number, { buffer: AudioBuffer; gain: number }>();
let pianoLoad: Promise<void> | null = null;

/** Decode the recorded piano one sample at a time (decoding them all at once starved the audio thread). */
function loadPianoSamples() {
  if (pianoLoad) return pianoLoad;
  const { ctx } = audio();
  pianoLoad = (async () => {
    for (const [midi, asset] of Object.entries(PIANO_SAMPLES)) {
      try {
        const buffer = await ctx.decodeAudioData(asset);
        // Even out the samples' loudness: scale each so its peak sits at 0.9.
        const ch = buffer.getChannelData(0);
        let peak = 0;
        for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]));
        pianoBuffers.set(Number(midi), { buffer, gain: peak > 0 ? 0.9 / peak : 1 });
      } catch {}
      await new Promise((r) => setTimeout(r, 0));
    }
  })();
  return pianoLoad;
}

/** The recorded piano sample for a note, with how much to pitch it and its level; null until loaded. */
function pianoSample(midi: number) {
  let best: number | null = null;
  for (const m of pianoBuffers.keys()) if (best == null || Math.abs(m - midi) < Math.abs(best - midi)) best = m;
  if (best == null || Math.abs(best - midi) > 3) return null;
  const s = pianoBuffers.get(best)!;
  return { ...s, rate: 2 ** ((midi - best) / 12) };
}

/** Render the buffers a hymn needs a few at a time, so opening Practice doesn't freeze the screen. */
const ready = new Map<string, Promise<void>>();

/**
 * Get every sound a hymn needs ready BEFORE it plays, a pitch at a time so the screen stays responsive.
 * Building sounds in the middle of playback stalled the scheduler and caused the static when switching.
 */
function prewarm(midis: number[], sound: Sound): Promise<void> {
  const todo = [...new Set(midis)].sort((a, b) => a - b);
  const key = `${sound}:${todo.join(',')}`;
  const hit = ready.get(key);
  if (hit) return hit;
  const p = (async () => {
    if (sound === 'grand') await loadPianoSamples();
    const synth: Sound = sound === 'grand' ? 'piano' : sound; // fallback for notes outside the samples
    for (const m of todo) {
      if (sound === 'grand' && pianoSample(m)) continue;
      if (!buffers.has(`${synth}:${m}`)) {
        sample(m, synth);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  })();
  ready.set(key, p);
  return p;
}

/** One note into `out`, starting at `when` (context time). Held until release(). */
function voice(out: GainNode, midi: number, when: number, sound: Sound, level = 1): Voicing {
  const { ctx } = audio();
  const src = ctx.createBufferSource();
  const real = sound === 'grand' ? pianoSample(midi) : null;
  if (real) {
    src.buffer = real.buffer;
    src.playbackRate.value = real.rate;
    level *= real.gain;
  } else {
    const s = sample(midi, sound === 'grand' ? 'piano' : sound);
    src.buffer = s.buffer;
    if (s.loop) src.loop = true;
  }
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, when);
  env.gain.linearRampToValueAtTime(level * NOTE_LEVEL, when + (sound === 'choir' ? 0.09 : sound === 'tone' ? 0.02 : 0.002));
  src.connect(env);
  env.connect(out);
  src.onended = () => {
    try {
      src.disconnect();
      env.disconnect();
    } catch {}
  };
  src.start(when);
  let released: number | false = false;
  return {
    release(at) {
      const t = Math.max(at, ctx.currentTime);
      // A later stop (pause) may cut a scheduled release short; never extend it.
      if (released !== false && t >= released) return;
      released = t;
      env.gain.cancelScheduledValues(t);
      // The synthesized piano is damped like a real key: about 0.1–0.15 s to silence.
      const tau = sound === 'tone' ? 0.02 : sound === 'choir' ? 0.07 : sound === 'piano' ? 0.04 : 0.06;
      env.gain.setTargetAtTime(0, t, tau);
      try {
        src.stop(t + (sound === 'piano' ? 0.25 : 0.35));
      } catch {}
    },
  };
}

/** Press-and-hold a single note: sounds until release(); a quick tap can release at its written length. */
export function startNote(midi: number, sound: Sound) {
  const { ctx, master } = audio();
  ctx.resume();
  // A single tapped note plays alone, so it can be as loud as a full chord.
  const v = voice(master, midi, ctx.currentTime + 0.005, sound, 3.4);
  const started = ctx.currentTime;
  return {
    /** Stop now, or `minSeconds` after the press if that is later. */
    release(minSeconds = 0) {
      v.release(Math.max(ctx.currentTime, started + minSeconds));
    },
  };
}

const LOOKAHEAD = 0.25; // seconds of notes scheduled ahead
const TICK_MS = 40;

/** Schedules the hymn's four voices against the audio clock, a little ahead of time. */
export class PracticePlayer {
  private events: PlayEvent[];
  private voiceGain = {} as Record<Voice, GainNode>;
  private bus: GainNode;
  private sounding: { end: number; v: Voicing }[] = [];
  /** The most recent note started in each voice, so the next one can damp it. */
  private last: Partial<Record<Voice, { start: number; v: Voicing }>> = {};
  private timer: ReturnType<typeof setInterval> | null = null;
  private anchorBeat = 0;
  private anchorTime = 0;
  private next = 0; // index of the next event to schedule
  private levels: Record<Voice, number> = { soprano: 1, alto: 1, tenor: 1, bass: 1 };
  bpm: number;
  sound: Sound = 'grand';
  onEnd?: () => void;

  constructor(private data: PracticeData) {
    const { ctx, master } = audio();
    this.events = playEvents(data);
    this.bpm = data.tempo;
    this.bus = ctx.createGain();
    this.bus.connect(master);
    for (const v of VOICES) {
      this.voiceGain[v] = ctx.createGain();
      this.voiceGain[v].connect(this.bus);
    }
    this.applyLevels();
  }

  get playing() {
    return this.timer != null;
  }

  /** The beat being heard right now. */
  beat() {
    if (!this.timer) return this.anchorBeat;
    const { ctx } = audio();
    return this.anchorBeat + ((ctx.currentTime - this.anchorTime) * this.bpm) / 60;
  }

  play(fromBeat = this.anchorBeat) {
    const { ctx } = audio();
    ctx.resume();
    this.stopSounding();
    if (fromBeat >= this.data.totalBeats) fromBeat = 0;
    this.anchorBeat = fromBeat;
    this.anchorTime = ctx.currentTime + 0.06;
    this.next = this.events.findIndex((e) => e.start >= fromBeat - 1e-6);
    if (this.next < 0) this.next = this.events.length;
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  pause() {
    const b = this.beat();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.anchorBeat = b;
    this.stopSounding();
  }

  seek(beat: number) {
    if (this.playing) this.play(beat);
    else this.anchorBeat = Math.max(0, Math.min(beat, this.data.totalBeats));
  }

  setTempo(bpm: number) {
    const b = this.beat();
    const { ctx } = audio();
    this.bpm = bpm;
    if (this.playing) {
      // Re-anchor so the beat stays continuous; notes already scheduled keep their old timing.
      this.anchorBeat = b;
      this.anchorTime = ctx.currentTime;
    } else this.anchorBeat = b;
  }

  /** 0–1 per voice; changes apply to notes already sounding. */
  setLevels(levels: Record<Voice, number>) {
    this.levels = levels;
    this.applyLevels();
  }

  /** Get a sound's notes ready (resolves at once when they already are). */
  prepare(sound: Sound = this.sound) {
    return prewarm(this.events.map((e) => e.midi), sound);
  }

  /**
   * Switch sound. While playing, pause, get the new sound ready, then carry on from the same beat,
   * so nothing is built mid-playback (that caused the static). Resolves once it's playing again.
   */
  async setSound(sound: Sound) {
    if (sound === this.sound) return;
    const wasPlaying = this.playing;
    const at = this.beat();
    if (wasPlaying) this.pause();
    this.sound = sound;
    await this.prepare(sound);
    if (wasPlaying && this.sound === sound) this.play(at);
  }

  dispose() {
    this.pause();
    this.bus.disconnect();
  }

  private applyLevels() {
    const { ctx } = audio();
    const audible = VOICES.reduce((a, v) => a + this.levels[v], 0);
    // Same loudness whether four voices play or one is soloed: four notes at NOTE_LEVEL peak just under 1,
    // so one soloed voice is raised 4× (and two voices 2×). No limiter needed, so no distortion.
    const makeUp = 4 / Math.max(1, audible);
    for (const v of VOICES) this.voiceGain[v].gain.setTargetAtTime(this.levels[v], ctx.currentTime, 0.03);
    this.bus.gain.setTargetAtTime(makeUp, ctx.currentTime, 0.05);
  }

  private timeOf(beat: number) {
    return this.anchorTime + ((beat - this.anchorBeat) * 60) / this.bpm;
  }

  private tick() {
    const { ctx } = audio();
    const horizon = ctx.currentTime + LOOKAHEAD;
    while (this.next < this.events.length) {
      const e = this.events[this.next];
      const at = this.timeOf(e.start);
      if (at > horizon) break;
      this.next++;
      if (this.levels[e.voice] <= 0) continue;
      const end = this.timeOf(e.start + e.dur);
      const when = Math.max(at, ctx.currentTime);
      // Like a pianist's finger lifting: the voice's previous note is damped when its next one starts,
      // even if a tempo change or overlapping written notes would have let it ring on underneath.
      const prev = this.last[e.voice];
      if (prev && prev.start < when - 0.005) prev.v.release(when);
      const v = voice(this.voiceGain[e.voice], e.midi, when, this.sound);
      v.release(end - 0.02);
      this.last[e.voice] = { start: when, v };
      this.sounding.push({ end, v });
    }
    this.sounding = this.sounding.filter((s) => s.end > ctx.currentTime);
    if (this.beat() >= this.data.totalBeats) {
      this.pause();
      this.anchorBeat = 0;
      this.onEnd?.();
    }
  }

  private stopSounding() {
    const { ctx } = audio();
    for (const s of this.sounding) s.v.release(ctx.currentTime);
    this.sounding = [];
    this.last = {};
  }
}
