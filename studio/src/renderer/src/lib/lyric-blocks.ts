import type { LyricSection } from "@/lib/studio"

/**
 * Lyrics as ordered blocks (verse / chorus / bridge), with the same plain-text form as the admin's hymn editor
 * (admin/src/lib/lyrics.ts parseLegacyLyrics and admin/src/pages/hymn-editor.tsx toPlainText):
 * "I", "II"… on their own line start verses, "Coro" the chorus, "Puente" a bridge.
 */
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"]
const ROMAN_LINE = /^(I|II|III|IV|V|VI|VII|VIII|IX|X)\.?$/
const CHORUS = /^(coro|chorus)\b/i
const BRIDGE = /^(puente|bridge)\b/i

export function parseLyricText(body: string): LyricSection[] {
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
    if (ROMAN_LINE.test(line)) {
      push()
      verseCount = ROMAN.indexOf(line.replace(".", "")) + 1
      current = { type: "verse", number: verseCount, lines: [] }
    } else if (CHORUS.test(line)) {
      push()
      current = { type: "chorus", lines: [] }
    } else if (BRIDGE.test(line)) {
      push()
      current = { type: "bridge", lines: [] }
    } else {
      if (!current) current = { type: "verse", number: ++verseCount, lines: [] }
      current.lines.push(line)
    }
  }
  push()
  return sections
}

export function lyricsToPlainText(sections: LyricSection[]) {
  return sections
    .map((s) => `${s.type === "verse" ? (ROMAN[(s.number ?? 1) - 1] ?? s.number) : s.type === "chorus" ? "Coro" : "Puente"}\n${s.lines.join("\n")}`)
    .join("\n\n")
}

/** Renumber verses 1..n in order so labels stay correct after edits. */
export function renumber(sections: LyricSection[]): LyricSection[] {
  let n = 0
  return sections.map((s) => (s.type === "verse" ? { ...s, number: ++n } : { type: s.type, lines: s.lines }))
}

/** What gets saved: trimmed lines, no empty lines or empty blocks. */
export function cleanLyrics(sections: LyricSection[]): LyricSection[] {
  return renumber(sections.map((s) => ({ ...s, lines: s.lines.map((l) => l.trim()).filter(Boolean) })).filter((s) => s.lines.length))
}
