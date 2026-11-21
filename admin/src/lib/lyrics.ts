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

export function sectionLabel(s: LyricSection) {
  if (s.type === "verse") return `Verse${s.number ? ` ${s.number}` : ""}`
  return s.type === "chorus" ? "Chorus" : "Bridge"
}
