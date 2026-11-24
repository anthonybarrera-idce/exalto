import type { LyricSection } from "./studio"

const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 }

/** Same rules as the admin editor's Text tab: "I", "II" start verses, "Coro" starts the chorus. */
export function parseLyrics(body: string): LyricSection[] {
  const out: LyricSection[] = []
  let cur: LyricSection | null = null
  let verse = 0
  const push = () => cur && cur.lines.length && out.push(cur)
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const r = line.replace(".", "")
    if (ROMAN[r]) {
      push()
      verse = ROMAN[r]
      cur = { type: "verse", number: verse, lines: [] }
    } else if (/^(coro|chorus)\b/i.test(line)) {
      push()
      cur = { type: "chorus", lines: [] }
    } else {
      if (!cur) cur = { type: "verse", number: ++verse, lines: [] }
      cur.lines.push(line)
    }
  }
  push()
  return out
}
