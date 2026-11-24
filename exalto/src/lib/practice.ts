import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * practice.json, written by Hymn Studio (services/hymn-studio/hymn_processor/practice.py) and
 * uploaded next to the hymn's audio. All beats are quarter notes; beat 0 is the first note heard.
 */
export const PRACTICE_VERSION = 1;

export const VOICES = ['soprano', 'alto', 'tenor', 'bass'] as const;
export type Voice = (typeof VOICES)[number];

export type PracticeNote = {
  id: string;
  m: number;
  start: number;
  dur: number;
  rest?: boolean;
  midi?: number;
  pitch?: string;
  name?: string;
  /** Staff step above the bottom line (0 = bottom line, 8 = top line). */
  y?: number;
  acc?: 'b' | '#' | 'n' | 'bb' | '##' | null;
  type: string;
  dots: number;
  beam: 'begin' | 'continue' | 'end' | null;
  tie: 'start' | 'stop' | 'continue' | null;
  lyrics?: { verse: number; text: string; syllabic: 'single' | 'begin' | 'middle' | 'end' }[];
};

export type PracticeData = {
  schema: 'exalto.practice';
  version: number;
  title: string;
  key: { fifths: number; mode: string; name: string };
  time: { beats: number; beatType: number };
  tempo: number;
  measureCount: number;
  totalBeats: number;
  pickupBeats: number;
  verses: number;
  staves: { id: 'treble' | 'bass'; clef: 'G' | 'F'; voices: Voice[]; keyAccidentals: { step: string; alter: number; y: number }[] }[];
  measures: { n: number; start: number; beats: number; pickup: boolean; system: number; weight: number }[];
  systems: { measures: [number, number] }[];
  voices: Record<Voice, { staff: 0 | 1; stem: 'up' | 'down'; range: [number, number] | null; notes: PracticeNote[] }>;
};

/** A sounding note: tied notes merged into one. */
export type PlayEvent = { id: string; voice: Voice; midi: number; start: number; dur: number };

const cacheKey = (id: string, version: number) => `exalto.practice.v${version}.${id}`;

/** Fetch a hymn's practice data, keeping a copy for offline use. */
export async function loadPractice(hymnId: string, url: string, version = PRACTICE_VERSION): Promise<PracticeData> {
  const key = cacheKey(hymnId, version);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as PracticeData;
    if (data.schema !== 'exalto.practice' || data.version > PRACTICE_VERSION) throw new Error('Unsupported practice data');
    AsyncStorage.setItem(key, JSON.stringify(data)).catch(() => {});
    return data;
  } catch (e) {
    const cached = await AsyncStorage.getItem(key).catch(() => null);
    if (cached) return JSON.parse(cached) as PracticeData;
    throw e;
  }
}

export function playEvents(data: PracticeData): PlayEvent[] {
  const out: PlayEvent[] = [];
  for (const voice of VOICES) {
    let held: PlayEvent | null = null;
    for (const n of data.voices[voice].notes) {
      if (n.rest || n.midi == null) {
        held = null;
        continue;
      }
      if (held && (n.tie === 'stop' || n.tie === 'continue') && held.midi === n.midi) {
        held.dur = n.start + n.dur - held.start;
      } else {
        held = { id: n.id, voice, midi: n.midi, start: n.start, dur: n.dur };
        out.push(held);
      }
      if (n.tie !== 'start' && n.tie !== 'continue') held = null;
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

export const midiToHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** Measure number playing at a beat. */
export function measureAt(data: PracticeData, beat: number) {
  let n = 1;
  for (const m of data.measures) if (m.start <= beat + 1e-6) n = m.n;
  return n;
}
