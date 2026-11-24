/** Pitch and duration helpers for editing transcribed notes ("Eb4", "F#3", "REST"). */
import type { Measure, Note, Page } from "@/lib/studio"

export const VOICES = ["soprano", "alto", "tenor", "bass"] as const
export type Voice = (typeof VOICES)[number]

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"] as const
const SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const ACC: Record<string, number> = { "": 0, n: 0, "#": 1, "##": 2, b: -1, bb: -2 }
const SHARP_ORDER = "FCGDAEB"

export type Parsed = { letter: string; acc: string; octave: number }

export const isRest = (p: string) => p.toUpperCase() === "REST"

export function parsePitch(p: string): Parsed | null {
  const m = /^([A-G])(##|bb|#|b|n)?(-?\d)$/.exec(p.trim())
  return m ? { letter: m[1], acc: m[2] === "n" ? "" : (m[2] ?? ""), octave: Number(m[3]) } : null
}

export const formatPitch = ({ letter, acc, octave }: Parsed) => `${letter}${acc}${octave}`

/** Accept what people type: "eb4", "E♭4", "f#3", "Bb 3". */
export function normalizePitch(raw: string): string | null {
  const s = raw.trim().replace(/\s+/g, "").replace(/♭/g, "b").replace(/♯/g, "#").replace(/♮/g, "")
  if (/^rest$/i.test(s)) return "REST"
  const p = parsePitch(s.charAt(0).toUpperCase() + s.slice(1))
  return p ? formatPitch(p) : null
}

export function midi(p: string): number | null {
  const x = parsePitch(p)
  return x ? 12 * (x.octave + 1) + SEMI[x.letter] + ACC[x.acc] : null
}

export const frequency = (p: string) => {
  const m = midi(p)
  return m == null ? null : 440 * 2 ** ((m - 69) / 12)
}

/** "E♭4" for display. */
export const pretty = (p: string) => (isRest(p) ? "Rest" : p.replace("##", "𝄪").replace("bb", "𝄫").replace("#", "♯").replace(/(?<=[A-G])b/, "♭"))

/** The accidental the key signature gives a letter. */
export function keyAcc(letter: string, fifths: number): string {
  if (fifths > 0 && SHARP_ORDER.slice(0, fifths).includes(letter)) return "#"
  if (fifths < 0 && [...SHARP_ORDER].reverse().join("").slice(0, -fifths).includes(letter)) return "b"
  return ""
}

/** One scale step up/down, following the key signature (E♭ major: E♭ → F → G → A♭). */
export function stepPitch(p: string, dir: 1 | -1, fifths: number): string {
  const x = parsePitch(p)
  if (!x) return p
  let i = LETTERS.indexOf(x.letter as (typeof LETTERS)[number]) + dir
  let octave = x.octave
  if (i > 6) (i = 0), octave++
  if (i < 0) (i = 6), octave--
  const letter = LETTERS[i]
  return formatPitch({ letter, acc: keyAcc(letter, fifths), octave })
}

export const octavePitch = (p: string, dir: 1 | -1) => {
  const x = parsePitch(p)
  return x ? formatPitch({ ...x, octave: x.octave + dir }) : p
}

export const setAccidental = (p: string, acc: "" | "#" | "b") => {
  const x = parsePitch(p)
  return x ? formatPitch({ ...x, acc }) : p
}

/** Note lengths in quarter-note beats. */
export const DURATIONS: { dur: number; label: string; short: string }[] = [
  { dur: 4, label: "Whole", short: "1" },
  { dur: 3, label: "Dotted half", short: "½." },
  { dur: 2, label: "Half", short: "½" },
  { dur: 1.5, label: "Dotted quarter", short: "¼." },
  { dur: 1, label: "Quarter", short: "¼" },
  { dur: 0.75, label: "Dotted eighth", short: "⅛." },
  { dur: 0.5, label: "Eighth", short: "⅛" },
  { dur: 1 / 3, label: "Triplet eighth", short: "⅛³" },
  { dur: 0.25, label: "Sixteenth", short: "1/16" },
]
export const durLabel = (d: number) => DURATIONS.find((x) => Math.abs(x.dur - d) < 0.01)?.label ?? `${+d.toFixed(3)} beats`
export const durShort = (d: number) => DURATIONS.find((x) => Math.abs(x.dur - d) < 0.01)?.short ?? `${+d.toFixed(2)}`

export const beats = (notes: Note[]) => notes.reduce((a, n) => a + n.dur, 0)
export const barLength = (ts: string) => {
  const [n, d] = ts.split("/").map(Number)
  return n && d ? (n * 4) / d : 4
}
export const near = (a: number, b: number) => Math.abs(a - b) < 1e-3

/** A measure as seen by the reader: one or two stored pieces (a measure cut by a page/system break). */
export type Piece = { pi: number; mi: number }
export type Bar = { pieces: Piece[]; page: number }

/** Group stored measures into real ones, the same way the converter rejoins split measures. */
export function groupBars(pages: Page[], bar: number): Bar[] {
  const raw: (Piece & { m: Measure })[] = pages.flatMap((p, pi) => p.measures.map((m, mi) => ({ pi, mi, m })))
  const out: Bar[] = []
  for (const r of raw) {
    const prev = out[out.length - 1]
    const len = beats(r.m.soprano)
    if (prev && prev.pieces.length === 1) {
      const pm = pages[prev.pieces[0].pi].measures[prev.pieces[0].mi]
      const pl = beats(pm.soprano)
      const firstPickup = out.length === 1 && pm.pickup
      if (pl > 0 && pl < bar && len > 0 && len < bar && near(pl + len, bar) && !firstPickup) {
        prev.pieces.push({ pi: r.pi, mi: r.mi })
        continue
      }
    }
    out.push({ pieces: [{ pi: r.pi, mi: r.mi }], page: r.pi })
  }
  return out
}

/** Does every voice of each bar fill the meter? (A short first bar and a last bar completing it are fine.) */
export function barStatus(pages: Page[], bars: Bar[], bar: number): boolean[] {
  const len = (b: Bar, v: Voice) => b.pieces.reduce((a, { pi, mi }) => a + beats(pages[pi].measures[mi][v]), 0)
  const first = bars[0] ? len(bars[0], "soprano") : bar
  return bars.map((b, i) => {
    if (i === 0 && first < bar) return true
    if (i === bars.length - 1 && i > 0 && near(first + len(b, "soprano"), bar)) return true
    return VOICES.every((v) => near(len(b, v), bar) || len(b, v) === 0)
  })
}
