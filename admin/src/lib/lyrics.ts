import type { LyricSection } from "@/lib/types"

const ROMAN = /^(I|II|III|IV|V|VI|VII|VIII|IX|X)\.?$/
const CHORUS = /^(coro|chorus)\b/i
const BRIDGE = /^(puente|bridge)\b/i

const ROMAN_VALUE: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 }

/**
 * Splits the legacy IDC Himnos plain-text body into sections.
 * The old app marks verses with roman numerals on their own line ("I", "II")
 * and the chorus with "Coro".
 */
export function parseLegacyLyrics(body: string): LyricSection[] {
  const sections: LyricSection[] = []
  let current: LyricSection | null = null
  let verseCount = 0

  const push = () => {
    if (current && current.lines.length) sections.push(current)
    current = null
  }

  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    if (ROMAN.test(line)) {
      push()
      verseCount = ROMAN_VALUE[line.replace(".", "")] ?? verseCount + 1
      current = { type: "verse", number: verseCount, lines: [] }
    } else if (CHORUS.test(line)) {
      push()
      current = { type: "chorus", lines: [] }
    } else if (BRIDGE.test(line)) {
      push()
      current = { type: "bridge", lines: [] }
    } else {
      if (!current) {
        verseCount += 1
        current = { type: "verse", number: verseCount, lines: [] }
      }
      current.lines.push(line)
    }
  }
  push()
  return sections
}

/** A block from the legacy app's Realtime Database (Editor.js format). */
export type LegacyBlock = { type: string; data?: { text?: string } }

function cleanText(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim()
}

/**
 * Stanzas in the legacy database are one paragraph with no line breaks.
 * Split after , ; . ! ? when the next word starts with a capital letter,
 * which is how the hymnal starts each sung line.
 */
export function splitStanza(text: string): string[] {
  return cleanText(text)
    .split(/\n|(?<=[,;.!?:])\s+(?=[¡¿"“(]?[A-ZÁÉÍÓÚÑÜ])/u)
    .map((l) => l.trim())
    .filter(Boolean)
}

/**
 * Converts legacy blocks to sections. The first header is the title; numeric
 * headers start verses, "Coro…" headers start a chorus, and any other header
 * (e.g. "Amén.") is kept as a line so no text is lost.
 */
export function parseLegacyBlocks(blocks: LegacyBlock[]): { title: string; sections: LyricSection[] } {
  const sections: LyricSection[] = []
  let current: LyricSection | null = null
  let title = ""
  const push = () => {
    if (current && current.lines.length) sections.push(current)
    current = null
  }
  for (const b of blocks) {
    const text = cleanText(b.data?.text ?? "")
    if (!text) continue
    if (b.type === "header") {
      if (!title) {
        title = text
      } else if (/^\d+\.?$/.test(text)) {
        push()
        current = { type: "verse", number: Number.parseInt(text, 10), lines: [] }
      } else if (CHORUS.test(text)) {
        push()
        current = { type: "chorus", lines: [] }
      } else if (BRIDGE.test(text)) {
        push()
        current = { type: "bridge", lines: [] }
      } else {
        if (!current) current = { type: "verse", lines: [] }
        current.lines.push(text)
      }
    } else if (b.type === "paragraph") {
      if (!current) current = { type: "verse", lines: [] }
      current.lines.push(...splitStanza(text))
    }
  }
  push()
  return { title, sections }
}

export function sectionLabel(s: LyricSection) {
  if (s.type === "verse") return `Verse${s.number ? ` ${s.number}` : ""}`
  return s.type === "chorus" ? "Chorus" : "Bridge"
}
