/**
 * The hymn assistant's renderer side: a text summary of the open hymn for the model, and checking /
 * applying the edits it proposes. Nothing here saves: score edits go into the Review page's draft
 * (undo, discard and save as usual); lyric-line edits are saved by the panel only when accepted.
 */
import type { ChatEdit } from "../../../main/ai-chat"
import { barLength, beats, formatPitch, groupBars, isRest, midi, near, normalizePitch, parsePitch, VOICES, type Bar, type Voice } from "@/lib/notes"
import type { LyricSection, Page } from "@/lib/studio"

export type { ChatEdit }
export type ChatErrorCode = Extract<import("../../../main/ai-chat").ChatResult, { ok: false }>["code"]

/** What the assistant can see and change: the Review page's draft plus the saved lyrics. */
export type HymnState = {
  title: string
  pages: Page[]
  fifths: number
  ts: string
  bpm: number
  sections: LyricSection[]
  /** 0-based bar and, when a note is selected, its voice and position in the bar (0-based). */
  selection?: { bar: number; voice?: Voice; index?: number }
}

const MAJOR = ["G♭", "D♭", "A♭", "E♭", "B♭", "F", "C", "G", "D", "A", "E", "B", "F♯"]
export const keyLabel = (fifths: number) => `${MAJOR[fifths + 6] ?? "?"} major`

/** The notes of one voice across a bar's pieces, with where each one is stored. */
export function barNotes(pages: Page[], bar: Bar, voice: Voice) {
  return bar.pieces.flatMap(({ pi, mi }) => (pages[pi]?.measures[mi]?.[voice] ?? []).map((n, i) => ({ n, pi, mi, i })))
}

const fmtNum = (d: number) => String(+d.toFixed(3))
const sylText = (s?: string | null, syllabic?: string | null) => (s ? (syllabic === "begin" || syllabic === "middle" ? `${s}-` : s) : "")

/** The hymn as compact text: settings, each measure's voices ("pitch/beats", soprano syllables in quotes), lyrics. */
export function describeHymn(h: HymnState): string {
  const barLen = barLength(h.ts)
  const bars = groupBars(h.pages, barLen)
  const out: string[] = [
    `Title: ${h.title}`,
    `Key: ${keyLabel(h.fifths)} (fifths ${h.fifths}) · Time: ${h.ts} (${fmtNum(barLen)} quarter beats per measure) · Tempo: ${h.bpm} BPM (quarter note)`,
    `Measures: ${bars.length}`,
  ]
  if (h.selection && bars[h.selection.bar]) {
    const s = h.selection
    let line = `Composer is looking at: measure ${s.bar + 1}`
    if (s.voice != null && s.index != null) {
      const note = barNotes(h.pages, bars[s.bar], s.voice)[s.index]?.n
      if (note) line += `, ${s.voice} note ${s.index + 1} (${note.pitch}, ${fmtNum(note.dur)} beats)`
    }
    out.push(line)
  }
  out.push("", "Notes per measure (pitch/beats; soprano syllables in quotes; a trailing - means the word continues):")
  bars.forEach((b, bi) => {
    const parts = VOICES.map((v) => {
      const notes = barNotes(h.pages, b, v)
      const cells = notes.map(({ n }) => `${n.pitch}/${fmtNum(n.dur)}${v === "soprano" && n.syllable ? ` "${sylText(n.syllable, n.syllabic)}"` : ""}`)
      const total = beats(notes.map((x) => x.n))
      const flag = notes.length && !near(total, barLen) ? ` [${fmtNum(total)} beats]` : ""
      return `${v[0].toUpperCase()}: ${cells.join(" ") || "-"}${flag}`
    })
    out.push(`M${bi + 1} (page ${b.page + 1}): ${parts.join(" | ")}`)
  })
  out.push("", "Lyrics:")
  if (!h.sections.length) out.push("(none)")
  h.sections.forEach((s, si) => {
    out.push(`Section ${si + 1} (${s.type}${s.type === "verse" && s.number ? ` ${s.number}` : ""}):`)
    s.lines.forEach((l, li) => out.push(`  ${li + 1}: ${l}`))
  })
  return out.join("\n")
}

// ---- transposition by key: a diatonic step count plus a semitone count, spelled for the new key.
const LETTERS = ["C", "D", "E", "F", "G", "A", "B"]
const SEMI = [0, 2, 4, 5, 7, 9, 11]
const mod = (a: number, n: number) => ((a % n) + n) % n
const tonicLetter = (f: number) => mod(4 * f, 7)
const tonicSemi = (f: number) => mod(7 * f, 12)

export function transposeInterval(from: number, to: number, direction: "up" | "down" | "nearest" = "nearest") {
  let d = mod(tonicLetter(to) - tonicLetter(from), 7)
  let c = mod(tonicSemi(to) - tonicSemi(from), 12)
  if (d === 0 && c === 0) return { d: 0, c: 0 }
  if (d === 0 && c > 6) c -= 12 // enharmonic letter, e.g. C -> C♭: tiny shift down
  const down = direction === "down" || (direction === "nearest" && c > 6)
  if (down && d > 0) (d -= 7), (c -= 12)
  return { d, c }
}

export function transposePitch(p: string, d: number, c: number): string | null {
  if (isRest(p)) return p
  const x = parsePitch(p)
  const m = midi(p)
  if (!x || m == null) return null
  const li = LETTERS.indexOf(x.letter) + d
  const octave = x.octave + Math.floor(li / 7)
  const letter = LETTERS[mod(li, 7)]
  const acc = m + c - (12 * (octave + 1) + SEMI[mod(li, 7)])
  const accs: Record<number, string> = { [-2]: "bb", [-1]: "b", 0: "", 1: "#", 2: "##" }
  return acc in accs ? formatPitch({ letter, acc: accs[acc], octave }) : null
}

// ---- checking and applying a proposed edit against the current state.
export type Change = { label: string; before?: string; after?: string }
export type Plan =
  | { ok: true; kind: "score"; changes: Change[]; bar?: number; apply: (pages: Page[]) => void; settings?: { fifths?: number; bpm?: number } }
  | { ok: true; kind: "lyrics"; changes: Change[]; sections: LyricSection[] }
  | { ok: false; error: string }

const VOICE_SET = new Set<string>(VOICES)
const SYLLABIC = new Set(["single", "begin", "middle", "end"])

/** Check an edit against the current state and say exactly what it would change. Errors are short English for the panel to show. */
export function planEdit(e: ChatEdit, h: HymnState): Plan {
  const bars = groupBars(h.pages, barLength(h.ts))
  const target = () => {
    const bi = Number(e.measure) - 1
    if (!Number.isInteger(bi) || !bars[bi]) return { error: `There is no measure ${e.measure}` }
    if (!e.voice || !VOICE_SET.has(e.voice)) return { error: `Unknown voice "${e.voice ?? ""}"` }
    const notes = barNotes(h.pages, bars[bi], e.voice as Voice)
    const ni = Number(e.index) - 1
    if (!Number.isInteger(ni) || !notes[ni]) return { error: `Measure ${bi + 1} ${e.voice} has no note ${e.index}` }
    return { bi, voice: e.voice as Voice, ni, at: notes[ni] }
  }
  switch (e.type) {
    case "note": {
      const t = target()
      if ("error" in t) return { ok: false, error: t.error! }
      const pitch = e.pitch != null && e.pitch !== "" ? normalizePitch(e.pitch) : t.at.n.pitch
      if (!pitch) return { ok: false, error: `"${e.pitch}" is not a pitch` }
      const dur = e.dur != null ? Number(e.dur) : t.at.n.dur
      if (!(dur > 0 && dur <= 8)) return { ok: false, error: `${e.dur} is not a note length` }
      if (pitch === t.at.n.pitch && near(dur, t.at.n.dur)) return { ok: false, error: "That note already reads that way" }
      const { pi, mi, i } = t.at
      return {
        ok: true,
        kind: "score",
        bar: t.bi,
        changes: [{ label: `M${t.bi + 1} ${t.voice} note ${t.ni + 1}`, before: `${t.at.n.pitch} · ${fmtNum(t.at.n.dur)}`, after: `${pitch} · ${fmtNum(dur)}` }],
        apply: (ps) => {
          const n = ps[pi].measures[mi][t.voice][i]
          n.pitch = pitch
          n.dur = dur
        },
      }
    }
    case "syllable": {
      const t = target()
      if ("error" in t) return { ok: false, error: t.error! }
      const text = String(e.text ?? "").trim().replace(/-+$/, "")
      const syllabic = e.syllabic && SYLLABIC.has(e.syllabic) ? (e.syllabic as "single") : text ? "single" : null
      if (isRest(t.at.n.pitch) && text) return { ok: false, error: "A rest can't carry a syllable" }
      const before = sylText(t.at.n.syllable, t.at.n.syllabic) || "—"
      const after = sylText(text, syllabic) || "—"
      if (before === after) return { ok: false, error: "That syllable is already there" }
      const { pi, mi, i } = t.at
      return {
        ok: true,
        kind: "score",
        bar: t.bi,
        changes: [{ label: `M${t.bi + 1} ${t.voice} note ${t.ni + 1} syllable`, before, after }],
        apply: (ps) => {
          const n = ps[pi].measures[mi][t.voice][i]
          n.syllable = text || null
          n.syllabic = text ? syllabic : null
        },
      }
    }
    case "lyricLine": {
      const si = Number(e.section) - 1
      const li = Number(e.line) - 1
      const sec = h.sections[si]
      if (!sec) return { ok: false, error: `There is no lyric section ${e.section}` }
      if (!Number.isInteger(li) || sec.lines[li] == null) return { ok: false, error: `Section ${si + 1} has no line ${e.line}` }
      const to = String(e.to ?? "").trim()
      if (!to) return { ok: false, error: "The new line is empty" }
      if (e.from != null && e.from.trim() !== sec.lines[li].trim()) return { ok: false, error: `Line ${li + 1} of section ${si + 1} no longer reads "${e.from}"` }
      if (to === sec.lines[li]) return { ok: false, error: "That line already reads that way" }
      const sections = structuredClone(h.sections)
      sections[si].lines[li] = to
      return { ok: true, kind: "lyrics", sections, changes: [{ label: `Section ${si + 1} line ${li + 1}`, before: sec.lines[li], after: to }] }
    }
    case "transpose": {
      const toKey = Number(e.toKey)
      if (!Number.isInteger(toKey) || toKey < -6 || toKey > 6) return { ok: false, error: `${e.toKey} is not a key` }
      if (toKey === h.fifths) return { ok: false, error: `The hymn is already in ${keyLabel(toKey)}` }
      const { d, c } = transposeInterval(h.fifths, toKey, e.direction)
      let count = 0
      for (const p of h.pages) for (const m of p.measures) for (const v of VOICES) for (const n of m[v]) {
        if (transposePitch(n.pitch, d, c) == null) return { ok: false, error: `Can't spell ${n.pitch} in the new key` }
        if (!isRest(n.pitch)) count++
      }
      return {
        ok: true,
        kind: "score",
        settings: { fifths: toKey },
        changes: [{ label: `Key and ${count} notes`, before: keyLabel(h.fifths), after: `${keyLabel(toKey)} (${c > 0 ? "+" : ""}${c} semitones)` }],
        apply: (ps) => {
          for (const p of ps) for (const m of p.measures) for (const v of VOICES) for (const n of m[v]) n.pitch = transposePitch(n.pitch, d, c) ?? n.pitch
        },
      }
    }
    case "tempo": {
      const bpm = Math.round(Number(e.bpm))
      if (!(bpm >= 30 && bpm <= 240)) return { ok: false, error: `${e.bpm} BPM is out of range (30–240)` }
      if (bpm === h.bpm) return { ok: false, error: `The tempo is already ${bpm}` }
      return { ok: true, kind: "score", settings: { bpm }, changes: [{ label: "Tempo", before: `${h.bpm} BPM`, after: `${bpm} BPM` }], apply: () => {} }
    }
    default:
      return { ok: false, error: `Unknown edit "${(e as ChatEdit).type}"` }
  }
}
