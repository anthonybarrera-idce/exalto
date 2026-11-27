import { collection, doc, getDoc, getDocs, query, serverTimestamp, where, writeBatch } from "firebase/firestore"
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage"
import { auth, db, storage } from "@/lib/firebase"
import { getOwnerScope } from "@/lib/library"
import { studio, type HymnDetail } from "@/lib/studio"
import { hymnNumberText } from "@/lib/hymn-number"

export const VOICES = ["soprano", "alto", "tenor", "bass"] as const
export type UploadStep = { label: string; done: boolean; progress: number }

/** Firestore id the admin import script also uses, so re-uploads update the same hymn. */
export const hymnDocId = (hymnalId: string, slug: string) => `${hymnalId}-${slug}`

/** Another hymn in the same hymnal already using this number (not this hymn's own doc). */
export async function numberTakenBy(hymnalId: string, number: number | null, slug: string) {
  if (number == null) return null
  const scope = getOwnerScope()
  const q = query(collection(db, "hymns"), where("hymnalId", "==", hymnalId), where("number", "==", number), ...(scope ? [where("ownerUid", "==", scope)] : []))
  const snap = await getDocs(q)
  const other = snap.docs.find((d) => d.id !== hymnDocId(hymnalId, slug))
  return other ? ((other.data().title as string) ?? other.id) : null
}

export async function existingHymn(hymnalId: string, slug: string) {
  const snap = await getDoc(doc(db, "hymns", hymnDocId(hymnalId, slug)))
  return snap.exists() ? (snap.data() as { status?: string; title?: string; recordingCount?: number }) : null
}

/** practice.json (see services/hymn-studio/hymn_processor/practice.py): notes the mobile app draws and plays. */
export const PRACTICE_FILE = "practice.json"

const contentTypeOf = (file: string) => {
  const ext = file.split(".").pop()
  if (ext === "m4a") return "audio/mp4"
  if (ext === "wav") return "audio/wav"
  if (ext === "json") return "application/json"
  return "application/vnd.recordare.musicxml+xml"
}

/** The converter files that go to Storage `hymns/{id}/`, in upload order (only those this hymn has). */
export function hymnFiles(detail: HymnDetail, id: string) {
  const { slug } = detail
  const names = new Set(detail.files.map((f) => f.name))
  const pick = (m4a: string) => (names.has(m4a) ? m4a : m4a.replace(/\.m4a$/, ".wav"))
  return [
    { key: "audio", file: pick(`${slug}-piano.m4a`), path: `hymns/${id}/piano`, label: "Piano · all voices" },
    ...VOICES.map((v) => ({ key: v, file: pick(`${slug}-piano-${v}.m4a`), path: `hymns/${id}/voices/${v}`, label: `Piano · ${v}` })),
    { key: "score", file: `${slug}.musicxml`, path: `hymns/${id}/score.musicxml`, label: "Score (MusicXML)" },
    { key: "practice", file: PRACTICE_FILE, path: `hymns/${id}/${PRACTICE_FILE}`, label: "Practice notes" },
  ].filter((f) => names.has(f.file))
}

/** Uploads `files` (from hymnFiles) one by one, marking steps[i] as it goes. Returns their download URLs by key. */
export async function uploadFiles(slug: string, files: ReturnType<typeof hymnFiles>, steps: UploadStep[], report: () => void) {
  const urls: Record<string, string> = {}
  let practiceVersion: number | null = null
  for (const [i, f] of files.entries()) {
    const bytes = await studio.readBinary(slug, f.file)
    const ext = f.file.split(".").pop()!
    const contentType = contentTypeOf(f.file)
    const path = f.key === "score" || f.key === "practice" ? f.path : `${f.path}.${ext}`
    if (f.key === "practice") practiceVersion = Number(JSON.parse(new TextDecoder().decode(bytes)).version) || null
    const task = uploadBytesResumable(ref(storage, path), bytes, { contentType, cacheControl: "public,max-age=86400" })
    await new Promise<void>((ok, fail) =>
      task.on(
        "state_changed",
        (s) => ((steps[i].progress = s.bytesTransferred / Math.max(1, s.totalBytes)), report()),
        fail,
        () => ok(),
      ),
    )
    urls[f.key] = await getDownloadURL(task.snapshot.ref)
    steps[i] = { ...steps[i], done: true, progress: 1 }
    report()
  }
  return { urls, practiceVersion }
}

/**
 * Uploads the piano audio, the four voice tracks, the score and the practice notes to Storage, then writes the hymn
 * (lyrics + file URLs) to Firestore with an audit-log entry, in one batch like the admin does.
 * New hymns start as drafts; an existing hymn keeps its status. A new hymn's doc is written first (as a draft,
 * with `ownerUid`), because the Storage rules let composers upload only the files of hymns they own.
 */
/** Whether a converter file is among the ones ticked on Export; a .wav and its .m4a count as the same audio. */
const isPicked = (picked: Set<string>, file: string) =>
  picked.has(file) || picked.has(file.replace(/\.wav$/, ".m4a")) || picked.has(file.replace(/\.m4a$/, ".wav"))

export async function uploadHymn(detail: HymnDetail, onStep: (steps: UploadStep[]) => void, picked?: Set<string>) {
  const user = auth.currentUser
  if (!user) throw new Error("Sign in first.")
  const { slug, hymn } = detail
  const id = hymnDocId(hymn.hymnalId, slug)
  // Only the files ticked on Export; the hymn and its lyrics are always written.
  const files = hymnFiles(detail, id).filter((f) => !picked || isPicked(picked, f.file))

  const steps: UploadStep[] = [...files.map((f) => ({ label: f.label, done: false, progress: 0 })), { label: "Hymn and lyrics", done: false, progress: 0 }]
  const report = () => onStep(steps.map((s) => ({ ...s })))
  report()

  const prev = await existingHymn(hymn.hymnalId, slug)
  const title = hymn.title || detail.review.title
  if (!prev) {
    const stub = writeBatch(db)
    stub.set(doc(db, "hymns", id), {
      title,
      hymnalId: hymn.hymnalId,
      number: hymn.number ?? null,
      language: hymn.language ?? "es",
      lyrics: [],
      status: "draft",
      ownerUid: user.uid,
      source: "hymn-studio",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
      recordingCount: 0,
    })
    await stub.commit()
  }

  const { urls, practiceVersion } = await uploadFiles(slug, files, steps, report)

  const batch = writeBatch(db)
  batch.set(doc(collection(db, "auditLog")), {
    actorUid: user.uid,
    actorName: user.displayName ?? user.email ?? user.uid,
    action: prev ? "Updated hymn from Hymn Studio" : "Uploaded hymn from Hymn Studio",
    target: `${hymnNumberText(hymn) ? `Hymn ${hymnNumberText(hymn)} ` : ""}"${title}"`,
    at: serverTimestamp(),
  })
  batch.set(
    doc(db, "hymns", id),
    {
      title,
      number: hymn.number ?? null,
      label: hymn.label ?? null,
      hymnalId: hymn.hymnalId,
      language: hymn.language ?? "es",
      author: hymn.author ?? "",
      lyrics: hymn.lyrics,
      tags: hymn.tags ?? [],
      repeatChorus: !!hymn.repeatChorus,
      // Only set file links that were uploaded now, so a lyrics-only update keeps existing audio.
      ...(urls.audio ? { audioUri: urls.audio } : {}),
      ...(VOICES.some((v) => urls[v]) ? { practiceAudio: Object.fromEntries(VOICES.filter((v) => urls[v]).map((v) => [v, urls[v]])) } : {}),
      ...(urls.score ? { scoreUrl: urls.score } : {}),
      ...(urls.practice ? { practiceData: { url: urls.practice, version: practiceVersion } } : {}),
      source: "hymn-studio",
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
      ...(prev ? {} : { ownerUid: user.uid }),
    },
    { merge: true },
  )
  await batch.commit()
  steps[steps.length - 1] = { ...steps[steps.length - 1], done: true, progress: 1 }
  report()
  return { id, created: !prev, status: prev?.status ?? "draft" }
}
