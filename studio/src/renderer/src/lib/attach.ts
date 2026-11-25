import { doc, getDoc, serverTimestamp } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { batchWithAudit, type LibraryHymn } from "@/lib/library"
import { cleanLyrics } from "@/lib/lyric-blocks"
import type { HymnDetail, HymnDoc, HymnSummary, LyricSection } from "@/lib/studio"
import { hymnFiles, uploadFiles, VOICES, type UploadStep } from "@/lib/upload"

/**
 * Attach a score converted in Studio to a hymn that already exists in Exalto (e.g. the lyrics-only IDC Himnario
 * and Cánticos imports). Files go to Storage `hymns/{existing id}/` and only the score, audio and practice fields
 * of that doc change; title, number, hymnal, status, lyrics and everything else stay unless the user chooses
 * to replace the lyrics.
 */

/** Lower-case, no accents, no punctuation: "¡Cuán Grande És Él!" → "cuan grande es el". */
export const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

/** A hymn "has notes" once it has a score; audio and practice data come with it from Studio. */
export const hasNotes = (h: Pick<LibraryHymn, "hasScore">) => h.hasScore

/** A converted hymn that can be attached: it has a score (typed-lyrics decks don't). */
export const isAttachable = (h: Pick<HymnSummary, "kind">) => h.kind !== "lyrics"

const words = (s: string) => new Set(fold(s).split(" ").filter((w) => w.length > 1))
function titleSimilarity(a: string, b: string) {
  const fa = fold(a)
  const fb = fold(b)
  if (!fa || !fb) return 0
  if (fa === fb) return 1
  if (fa.startsWith(fb) || fb.startsWith(fa)) return 0.85
  const wa = words(a)
  const wb = words(b)
  const common = [...wa].filter((w) => wb.has(w)).length
  return common / Math.max(1, Math.max(wa.size, wb.size))
}

export type Match = { hymn: LibraryHymn; score: number; why: "number" | "title" | "both" }
type Wanted = Pick<HymnDoc, "title" | "hymnalId" | "number">

/** Best existing hymns for a converted one: same hymnal + number, then accent-insensitive title. Highest first. */
export function suggestMatches(want: Wanted, hymns: LibraryHymn[], limit = 5): Match[] {
  const out: Match[] = []
  for (const h of hymns) {
    const sameNumber = want.number != null && h.number === want.number && h.hymnalId === want.hymnalId
    const sim = titleSimilarity(want.title, h.title)
    let score = sim * 70 + (h.hymnalId === want.hymnalId ? 5 : 0)
    if (sameNumber) score += 60
    if (!sameNumber && sim < 0.5) continue
    out.push({ hymn: h, score: Math.min(100, Math.round(score)), why: sameNumber && sim >= 0.5 ? "both" : sameNumber ? "number" : "title" })
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit)
}

/** Confident enough to pre-select in bulk mode: same hymnal and number, and the titles agree. */
export const isStrongMatch = (m: Match | undefined) => !!m && m.why === "both" && m.score >= 90

/** Search box: "123" finds that number (in `hymnalId` if given), anything else matches the title, accents ignored. */
export function searchHymns(hymns: LibraryHymn[], q: string, hymnalId?: string | null, limit = 30) {
  const needle = fold(q)
  if (!needle) return []
  const asNumber = /^\d+$/.test(needle) ? Number(needle) : null
  return hymns
    .filter((h) => !hymnalId || h.hymnalId === hymnalId)
    .filter((h) => (asNumber != null ? h.number === asNumber || h.label?.toLowerCase() === needle : fold(h.title).includes(needle)))
    .sort((a, b) => a.hymnalId.localeCompare(b.hymnalId) || (a.number ?? Infinity) - (b.number ?? Infinity) || a.title.localeCompare(b.title))
    .slice(0, limit)
}

/** Reverse of suggestMatches: which converted hymns in Studio look like this existing hymn. */
export function suggestLocal(h: Pick<LibraryHymn, "title" | "number" | "hymnalId">, locals: { slug: string; hymn: Wanted }[], limit = 5) {
  return locals
    .map((l) => {
      const sameNumber = l.hymn.number != null && l.hymn.number === h.number && l.hymn.hymnalId === h.hymnalId
      const sim = titleSimilarity(l.hymn.title, h.title)
      return { slug: l.slug, score: Math.min(100, Math.round(sim * 70 + (sameNumber ? 60 : 0))), sameNumber, sim }
    })
    .filter((x) => x.sameNumber || x.sim >= 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

/** What the existing doc has now, read fresh right before showing the before/after and before writing. */
export type TargetNow = {
  id: string
  exists: boolean
  title: string
  status: string
  hasScore: boolean
  hasAudio: boolean
  voices: string[]
  hasPractice: boolean
  lyrics: LyricSection[]
}
export async function readTarget(id: string): Promise<TargetNow> {
  const snap = await getDoc(doc(db, "hymns", id))
  const d = snap.data() ?? {}
  return {
    id,
    exists: snap.exists(),
    title: d.title ?? "",
    status: d.status ?? "draft",
    hasScore: !!d.scoreUrl,
    hasAudio: !!d.audioUri,
    voices: Object.keys(d.practiceAudio ?? {}),
    hasPractice: !!d.practiceData?.url,
    lyrics: d.lyrics ?? [],
  }
}

/** Which of score / piano / voices / practice this converted hymn will add. */
export function filesToAdd(detail: HymnDetail) {
  const files = hymnFiles(detail, "_")
  const has = (k: string) => files.some((f) => f.key === k)
  return { score: has("score"), audio: has("audio"), voices: VOICES.filter(has), practice: has("practice"), count: files.length }
}

// ---- Lyrics comparison ----

export type LineDiff = { kind: "same" | "changed" | "added" | "removed"; before?: string; after?: string }
export type SectionDiff = { label: { type: LyricSection["type"]; number?: number }; lines: LineDiff[] }

const sectionKey = (s: LyricSection) => `${s.type}:${s.number ?? ""}`
const flat = (sections: LyricSection[]) => sections.map((s) => s.lines.map(fold).join("\n")).join("\n\n")

/** True when both lyrics read the same ignoring accents, case and punctuation. */
export const sameLyrics = (a: LyricSection[], b: LyricSection[]) => flat(a) === flat(b)

/** Section by section (verse 1 with verse 1, chorus with chorus), line by line. Good enough to spot real differences. */
export function diffLyrics(before: LyricSection[], after: LyricSection[]): SectionDiff[] {
  const keys: string[] = []
  for (const s of [...before, ...after]) if (!keys.includes(sectionKey(s))) keys.push(sectionKey(s))
  return keys.map((k) => {
    const b = before.find((s) => sectionKey(s) === k)
    const a = after.find((s) => sectionKey(s) === k)
    const ref = (b ?? a)!
    const n = Math.max(b?.lines.length ?? 0, a?.lines.length ?? 0)
    const lines: LineDiff[] = []
    for (let i = 0; i < n; i++) {
      const x = b?.lines[i]
      const y = a?.lines[i]
      if (x != null && y != null) lines.push({ kind: fold(x) === fold(y) ? "same" : "changed", before: x, after: y })
      else if (x != null) lines.push({ kind: "removed", before: x })
      else lines.push({ kind: "added", after: y })
    }
    return { label: { type: ref.type, number: ref.number }, lines }
  })
}

// ---- Upload ----

const describe = (t: Pick<TargetNow, "title">, h: Pick<LibraryHymn, "number" | "label">) =>
  `${h.number != null ? `Hymn ${h.label ?? h.number} ` : ""}"${t.title}"`

/**
 * Uploads this converted hymn's score, piano mix, voice tracks and practice.json to the existing hymn's folder,
 * then, in one batch with an "Added notes to hymn" audit entry, sets only those URL fields (plus the lyrics if
 * `replaceLyrics`). Uses update(), so it never creates a hymn and never touches status, title, number or hymnal.
 */
export async function attachNotes(
  detail: HymnDetail,
  target: Pick<LibraryHymn, "id" | "number" | "label">,
  opts: { replaceLyrics: boolean },
  onStep: (steps: UploadStep[]) => void,
) {
  const now = await readTarget(target.id)
  if (!now.exists) throw new Error("That hymn no longer exists in Exalto.")
  const files = hymnFiles(detail, target.id)
  if (!files.some((f) => f.key === "score")) throw new Error("This converted hymn has no score to attach.")

  const steps: UploadStep[] = [...files.map((f) => ({ label: f.label, done: false, progress: 0 })), { label: "Link to hymn", done: false, progress: 0 }]
  const report = () => onStep(steps.map((s) => ({ ...s })))
  report()
  const { urls, practiceVersion } = await uploadFiles(detail.slug, files, steps, report)

  const action = opts.replaceLyrics ? "Added notes to hymn and replaced lyrics" : "Added notes to hymn"
  const { batch, uid } = batchWithAudit(action, describe(now, target))
  batch.update(doc(db, "hymns", target.id), {
    ...(urls.audio ? { audioUri: urls.audio } : {}),
    // Dotted paths: a voice this conversion lacks keeps whatever link it had.
    ...Object.fromEntries(VOICES.filter((v) => urls[v]).map((v) => [`practiceAudio.${v}`, urls[v]])),
    ...(urls.score ? { scoreUrl: urls.score } : {}),
    ...(urls.practice ? { practiceData: { url: urls.practice, version: practiceVersion } } : {}),
    ...(opts.replaceLyrics ? { lyrics: cleanLyrics(detail.hymn.lyrics), repeatChorus: !!detail.hymn.repeatChorus } : {}),
    // Which Studio conversion these notes came from, so the library can open it again.
    studioSlug: detail.slug,
    notesAddedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  })
  await batch.commit()
  steps[steps.length - 1] = { ...steps[steps.length - 1], done: true, progress: 1 }
  report()
  return { id: target.id, status: now.status }
}
