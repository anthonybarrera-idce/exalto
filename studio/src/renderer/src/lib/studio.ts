import type { StudioApi } from "../../../preload"

declare global {
  interface Window {
    studio: StudioApi
  }
}
export const studio = window.studio

export type Box = [number, number, number, number]
export type Note = { pitch: string; dur: number; box?: Box; tie?: "start" | "stop" | "continue" | null; syllable?: string | null; syllabic?: "single" | "begin" | "middle" | "end" | null }
export type Measure = { soprano: Note[]; alto: Note[]; tenor: Note[]; bass: Note[]; pickup?: boolean; box?: Box }
export type Head = { x0: number; y0: number; x1: number; y1: number; pitch: string; ok: boolean; staff: number }
export type Page = { measures: Measure[]; heads?: Head[]; size?: [number, number]; key_fifths?: number; time_signature?: string; tempo_bpm?: number; lyric_lines?: string[] }
export type Review = {
  /** "lyrics" for typed-lyrics decks (no score or audio) */
  kind?: "lyrics"
  title: string
  bpm: number
  measures: number
  key_fifths: number
  time_signature: string
  corrections: { from: string; to: string }[]
  flagged: { page: number; x: number; y: number; pitch: string }[]
  warnings: string[]
  files: Record<string, string>
}
export type HymnSummary = Review & { slug: string; updatedAt: number }
export type LyricSection = { type: "verse" | "chorus" | "bridge"; number?: number; lines: string[] }
export type HymnDetail = {
  slug: string
  review: Review
  hymn: HymnDoc
  transcription: { pages: Page[] }
  lyricsText: string
  files: { name: string; size: number }[]
}

export const asset = (slug: string, file: string) => `studio://files/${encodeURIComponent(slug)}/${file}`

export const KEY_NAMES: Record<number, string> = {
  0: "C major", 1: "G major", 2: "D major", 3: "A major", 4: "E major", 5: "B major", 6: "F♯ major",
  "-1": "F major", "-2": "B♭ major", "-3": "E♭ major", "-4": "A♭ major", "-5": "D♭ major", "-6": "G♭ major",
}

export type HymnDoc = {
  title: string
  hymnalId: string
  number: number | null
  label?: string | null
  author: string
  language: "es" | "en"
  tags: string[]
  repeatChorus: boolean
  lyrics: LyricSection[]
  source?: { hymnalCode?: string | null }
}

/** Hymnals now live in Firestore, shared with the admin and the app (lib/hymnals.ts). */
export { hymnalName } from "@/lib/hymnals"
