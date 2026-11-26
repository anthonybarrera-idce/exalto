/**
 * Applying AI spellcheck suggestions on the Lyrics page: to the lyric blocks, and to the syllables
 * on the soprano notes. The syllable rule mirrors services/hymn-studio/hymn_processor/lyrics_fix.py
 * (correct_page / syllabify): a fixed word replaces its syllables on the notes only when it still
 * has the same number of syllables, so notes and words stay lined up.
 */
import type { LyricSection, Note, Page } from "@/lib/studio"

export type AiSuggestion = { line: number; original: string; suggestion: string; reason: string }
/** A suggestion as shown for review, with the line it was found on (to find it again after edits). */
export type ReviewItem = AiSuggestion & { id: number; lineText: string }

/** Every lyric line in order, as sent to the AI, with where it lives in the blocks. */
export function flattenLines(sections: LyricSection[]) {
  const lines: string[] = []
  const at: [number, number][] = []
  sections.forEach((s, si) => s.lines.forEach((l, li) => (lines.push(l), at.push([si, li]))))
  return { lines, at }
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const wordRe = (w: string) => new RegExp(`(?<![\\p{L}\\p{M}])${escapeRe(w)}(?![\\p{L}\\p{M}])`, "u")

/**
 * Replace the suggestion's word in its line. Looks at the same line first, then a line with the same
 * text (blocks may have moved since the check). Returns null if the word isn't there anymore.
 */
export function applyToSections(sections: LyricSection[], item: ReviewItem): LyricSection[] | null {
  const { lines, at } = flattenLines(sections)
  const re = wordRe(item.original)
  let idx = item.line < lines.length && re.test(lines[item.line]) ? item.line : lines.findIndex((l) => l === item.lineText)
  if (idx < 0 || !re.test(lines[idx])) idx = lines.findIndex((l) => re.test(l))
  if (idx < 0) return null
  const [si, li] = at[idx]
  return sections.map((s, i) =>
    i !== si ? s : { ...s, lines: s.lines.map((l, j) => (j === li ? l.replace(re, item.suggestion) : l)) },
  )
}

// ---- syllables (Spanish rules, same as lyrics_fix.syllabify)
const VOWELS = new Set("aeiouáéíóúü")
const STRONG = new Set("aeoáéíóú")
const INSEPARABLE = new Set(["bl", "br", "cl", "cr", "dr", "fl", "fr", "gl", "gr", "pl", "pr", "tr", "ch", "ll", "rr", "qu", "gu"])

export function syllabify(word: string): string[] {
  const low = word.toLowerCase()
  const groups: [number, number][] = []
  let i = 0
  while (i < low.length) {
    const silentU = low[i] === "u" && i > 0 && "qg".includes(low[i - 1]) && i + 1 < low.length && "eiéí".includes(low[i + 1])
    if (VOWELS.has(low[i]) && !silentU) {
      let j = i + 1
      while (j < low.length && VOWELS.has(low[j])) {
        const a = low[j - 1]
        const b = low[j]
        if ((STRONG.has(a) && STRONG.has(b)) || "íú".includes(b) || "íú".includes(a)) break
        j++
      }
      groups.push([i, j])
      i = j
    } else i++
  }
  if (groups.length <= 1) return [word]
  const cuts: number[] = []
  for (let g = 0; g + 1 < groups.length; g++) {
    const e1 = groups[g][1]
    const s2 = groups[g + 1][0]
    const cons = low.slice(e1, s2)
    const n = cons.length
    cuts.push(n <= 1 ? e1 : n === 2 ? (INSEPARABLE.has(cons) ? e1 : e1 + 1) : INSEPARABLE.has(cons.slice(-2)) ? s2 - 2 : s2 - 1)
  }
  const parts: string[] = []
  let last = 0
  for (const c of cuts) (parts.push(word.slice(last, c)), (last = c))
  parts.push(word.slice(last))
  return parts.filter(Boolean)
}

const matchCase = (src: string, out: string) =>
  src.length > 1 && src === src.toUpperCase() && src !== src.toLowerCase()
    ? out.toUpperCase()
    : src[0] && src[0] !== src[0].toLowerCase()
      ? out[0].toUpperCase() + out.slice(1)
      : out

/**
 * Put accepted word fixes onto the soprano syllables. Returns new pages and how many words changed
 * (0 = leave the score alone). Words whose syllable count would change are skipped.
 */
export function applyToNotes(pages: Page[], fixes: { original: string; suggestion: string }[]): { pages: Page[]; changed: number } {
  const next: Page[] = JSON.parse(JSON.stringify(pages))
  const notes: Note[] = next.flatMap((p) => p.measures.flatMap((m) => m.soprano.filter((n) => n.syllable)))
  const byWord = new Map(fixes.map((f) => [f.original.normalize("NFC").toLowerCase(), f.suggestion.normalize("NFC")]))
  let changed = 0
  let i = 0
  while (i < notes.length) {
    let j = i
    while (["begin", "middle"].includes(notes[j].syllabic ?? "") && j + 1 < notes.length && ["middle", "end"].includes(notes[j + 1].syllabic ?? "")) j++
    const group = notes.slice(i, j + 1)
    i = j + 1
    const first = group[0].syllabic ?? "single"
    const complete = (group.length === 1 && first === "single") || (first === "begin" && group[group.length - 1].syllabic === "end")
    if (!complete) continue // a syllable was lost; don't guess the word
    const raw = group.map((n) => n.syllable).join("")
    const m = /^([¡¿"“(]*)(.*?)([.,;:!?"”)]*)$/u.exec(raw)
    if (!m) continue
    const [, pre, word, post] = m
    const fix = byWord.get(word.normalize("NFC").toLowerCase())
    if (!fix) continue
    const parts = matchCase(word, fix).split(" ")
    const sylls = parts.map((p) => syllabify(p))
    const flat = sylls.flat()
    if (flat.length !== group.length) continue
    // Syllabic marks follow the new words (a run-together word that splits gets its own start and end).
    const kinds = sylls.flatMap((s) => (s.length === 1 ? ["single"] : s.map((_, k) => (k === 0 ? "begin" : k === s.length - 1 ? "end" : "middle"))))
    flat[0] = pre + flat[0]
    flat[flat.length - 1] += post
    group.forEach((n, k) => {
      n.syllable = flat[k]
      n.syllabic = kinds[k] as Note["syllabic"]
    })
    changed++
  }
  return { pages: next, changed }
}
