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

// Short words a line shouldn't end on ("…de / la tierra" reads badly).
const WEAK_ENDS = new Set([
  "a", "al", "con", "de", "del", "el", "en", "la", "las", "lo", "los", "mi", "mis", "por", "que",
  "se", "su", "sus", "te", "tu", "tus", "un", "una", "y", "o", "me", "nos", "le", "para", "sin",
  "este", "esta", "estos", "estas", "ese", "esa", "aquel", "gran", "santo", "santa", "nuestro", "nuestra",
  "the", "of", "and", "to", "my", "thy", "in", "on", "for", "with", "his", "our", "your", "an", "this", "that",
])

/**
 * Reflow a block's words into lines of even length (at most maxLen where possible), breaking
 * after punctuation, never after a short word like "de", and starting each sentence on a new line.
 * Same rules as balance_lines in services/hymn-studio/hymn_processor/deck_batch.py.
 */
export function balanceLines(lines: string[], maxLen = 44): string[] {
  const words = lines.join(" ").split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const join = (a: number, b: number) => words.slice(a, b).join(" ")
  const total = join(0, words.length).length
  if (total <= maxLen) return [join(0, words.length)]
  const n0 = Math.max(1, Math.ceil(total / maxLen))
  let best: { score: number; out: string[] } | null = null
  for (const n of [n0, n0 + 1, n0 + 2]) {
    if (n > words.length) break
    const target = total / n
    const W = words.length
    const cost = Array.from({ length: W + 1 }, () => new Array<number>(n + 1).fill(Infinity))
    const back = Array.from({ length: W + 1 }, () => new Array<number>(n + 1).fill(0))
    cost[0][0] = 0
    for (let i = 1; i <= W; i++) {
      for (let j = i - 1; j >= 0; j--) {
        const length = join(j, i).length
        if (length > maxLen && i - j > 1) break
        let c = ((length - target) / target) ** 2 * 100
        c += 60 * words.slice(j, i - 1).filter((w) => /[.!?]$/.test(w)).length
        const last = words[i - 1]
        if (i < W) {
          if (/[.!?;:]$/.test(last)) c -= 50
          else if (last.endsWith(",")) c -= 30
          else if (WEAK_ENDS.has(last.toLowerCase().replace(/^[¡¿"“]+|[¡¿"“]+$/g, ""))) c += 40
        }
        for (let k = 1; k <= n; k++) {
          if (cost[j][k - 1] + c < cost[i][k]) {
            cost[i][k] = cost[j][k - 1] + c
            back[i][k] = j
          }
        }
      }
    }
    if (cost[W][n] === Infinity) continue
    const out: string[] = []
    let i = W
    for (let k = n; k > 0; k--) {
      const j = back[i][k]
      out.unshift(join(j, i))
      i = j
    }
    const score = cost[W][n] / n
    if (!best || score < best.score) best = { score, out }
  }
  return best ? best.out : [join(0, words.length)]
}
