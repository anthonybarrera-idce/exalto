import { AudioContext, AudioManager, type GainNode, type OscillatorNode } from 'react-native-audio-api';

import { midiToHz, playEvents, VOICES, type PlayEvent, type PracticeData, type Voice } from '@/lib/practice';

/**
 * Plays practice notes on the phone with the native audio engine (react-native-audio-api),
 * instead of streaming the rendered audio tracks. Same recipes as Hymn Studio's lib/tone.ts:
 * "piano" is a few decaying harmonics, "tone" ("Solo notas") a steady tone held for the note.
 */
export type Sound = 'piano' | 'tone';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function audio() {
  if (!ctx) {
    // Play through the speaker even with the silent switch on, like other music apps.
    AudioManager.setSystemOptions({ ios: { category: 'playback', mode: 'default', options: [] } });
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
  }
  return { ctx, master: master! };
}

type Voicing = { release: (at: number) => void };

/** One note into `out`, starting at `when` (context time). Held until release() for the tone. */
function voice(out: GainNode, freq: number, when: number, sound: Sound, level = 1): Voicing {
  const { ctx } = audio();
  const env = ctx.createGain();
  env.gain.value = 0;
  env.connect(out);
  const oscs: OscillatorNode[] = [];
  if (sound === 'tone') {
    for (const [k, amp] of [[1, 1], [2, 0.12]] as const) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = freq * k;
      g.gain.value = amp;
      o.connect(g);
      g.connect(env);
      o.start(when);
      oscs.push(o);
    }
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(0.22 * level, when + 0.02);
  } else {
    ;[1, 0.55, 0.3, 0.18, 0.1].forEach((amp, i) => {
      const k = i + 1;
      const f = freq * k * Math.sqrt(1 + 0.0004 * k * k);
      if (f > 18000) return;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      const decay = (1.2 + 0.9 * k) * (0.6 + freq / 900);
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(amp, when + 0.005);
      g.gain.setTargetAtTime(0, when + 0.005, 1 / decay);
      o.connect(g);
      g.connect(env);
      o.start(when);
      oscs.push(o);
    });
    env.gain.setValueAtTime(0.25 * level, when);
  }
  return {
    release(at) {
      const t = Math.max(at, ctx.currentTime);
      env.gain.cancelScheduledValues(t);
      env.gain.setTargetAtTime(0, t, sound === 'tone' ? 0.02 : 0.08);
      for (const o of oscs) o.stop(t + 0.6);
    },
  };
}

/** Press-and-hold a single note: sounds until release(); a quick tap can release at its written length. */
export function startNote(midi: number, sound: Sound) {
  const { ctx, master } = audio();
  ctx.resume();
  const v = voice(master, midiToHz(midi), ctx.currentTime + 0.005, sound);
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
  private timer: ReturnType<typeof setInterval> | null = null;
  private anchorBeat = 0;
  private anchorTime = 0;
  private next = 0; // index of the next event to schedule
  private levels: Record<Voice, number> = { soprano: 1, alto: 1, tenor: 1, bass: 1 };
  bpm: number;
  sound: Sound = 'piano';
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

  setSound(sound: Sound) {
    this.sound = sound;
  }

  dispose() {
    this.pause();
    this.bus.disconnect();
  }

  private applyLevels() {
    const { ctx } = audio();
    const audible = VOICES.reduce((a, v) => a + this.levels[v], 0);
    // Make up for voices that are silent, like Studio's mixer (one voice alone ≈ 2.5×).
    const makeUp = Math.min(2.5, 2.5 / Math.max(1, audible * 0.625));
    for (const v of VOICES) this.voiceGain[v].gain.setTargetAtTime(this.levels[v], ctx.currentTime, 0.03);
    this.bus.gain.setTargetAtTime(makeUp * 0.45, ctx.currentTime, 0.05);
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
      const v = voice(this.voiceGain[e.voice], midiToHz(e.midi), Math.max(at, ctx.currentTime), this.sound);
      v.release(end - 0.02);
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
  }
}
