import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, where, writeBatch, type DocumentData, type Timestamp } from "firebase/firestore"
import { auth, db } from "@/lib/firebase"
import type { LyricSection } from "@/lib/studio"

/**
 * The Exalto hymn library, edited from Studio the same way the admin does (admin/src/lib/hymns.ts):
 * the same `hymns` docs and fields, and every write goes in a batch with an `auditLog` entry.
 * Firestore rules allow it for owners, admins and editors, and composers for their own hymns.
 */

/**
 * Set by AuthProvider: a composer's uid when they may only see and change their own hymns (`ownerUid`),
 * or null for owners, admins and editors, who see the whole library.
 */
let ownerScope: string | null = null
export const setOwnerScope = (uid: string | null) => void (ownerScope = uid)
export const getOwnerScope = () => ownerScope
export type HymnStatus = "draft" | "review" | "published" | "hidden"
export const STATUSES: HymnStatus[] = ["draft", "review", "published", "hidden"]

export type LibraryHymn = {
  id: string
  number: number | null
  label?: string | null
  title: string
  hymnalId: string
  language: "es" | "en"
  author: string
  tags: string[]
  lyrics: LyricSection[]
  repeatChorus: boolean
  status: HymnStatus
  hasAudio: boolean
  hasScore: boolean
  ownerUid?: string
  updatedAt?: Timestamp
}

function toHymn(id: string, d: DocumentData): LibraryHymn {
  return {
    id,
    number: d.number ?? null,
    label: d.label ?? null,
    title: d.title ?? "",
    hymnalId: d.hymnalId ?? "idc-himnario",
    language: d.language ?? "es",
    author: d.author ?? "",
    tags: d.tags ?? [],
    lyrics: d.lyrics ?? [],
    repeatChorus: d.repeatChorus ?? false,
    status: STATUSES.includes(d.status) ? d.status : "draft",
    hasAudio: !!d.audioUri,
    hasScore: !!d.scoreUrl,
    ownerUid: d.ownerUid,
    updatedAt: d.updatedAt,
  }
}

export function watchLibrary(onData: (hymns: LibraryHymn[]) => void, onError: (e: Error) => void) {
  // Composers can only query their own hymns (rules); sorted here so no composite index is needed.
  const q = ownerScope ? query(collection(db, "hymns"), where("ownerUid", "==", ownerScope)) : query(collection(db, "hymns"), orderBy("title"))
  return onSnapshot(
    q,
    (snap) => {
      const hymns = snap.docs.map((d) => toHymn(d.id, d.data()))
      onData(ownerScope ? hymns.sort((a, b) => a.title.localeCompare(b.title)) : hymns)
    },
    onError,
  )
}

const describe = (h: Pick<LibraryHymn, "number" | "label" | "title">) => `${h.number != null ? `Hymn ${h.label ?? h.number} ` : ""}"${h.title}"`

export function batchWithAudit(action: string, target: string) {
  const user = auth.currentUser
  if (!user) throw new Error("Sign in again to make changes.")
  const batch = writeBatch(db)
  batch.set(doc(collection(db, "auditLog")), {
    actorUid: user.uid,
    actorName: user.displayName ?? user.email ?? user.uid,
    action,
    target,
    at: serverTimestamp(),
  })
  return { batch, uid: user.uid }
}

export type HymnEdit = Pick<LibraryHymn, "title" | "number" | "label" | "hymnalId" | "language" | "author" | "tags" | "repeatChorus" | "status"> & {
  lyrics?: LyricSection[]
}

export async function saveLibraryHymn(h: LibraryHymn, edit: HymnEdit) {
  const { batch, uid } = batchWithAudit("Edited hymn in Hymn Studio", describe(edit))
  batch.update(doc(db, "hymns", h.id), { ...edit, updatedAt: serverTimestamp(), updatedBy: uid })
  await batch.commit()
}

export async function setLibraryStatus(h: LibraryHymn, status: HymnStatus) {
  const { batch, uid } = batchWithAudit(`Set status to ${status}`, describe(h))
  batch.update(doc(db, "hymns", h.id), { status, updatedAt: serverTimestamp(), updatedBy: uid })
  await batch.commit()
}

/** Same as the admin: removes the hymn doc. Its Storage files stay. */
export async function deleteLibraryHymn(h: LibraryHymn) {
  const { batch } = batchWithAudit("Deleted hymn", describe(h))
  batch.delete(doc(db, "hymns", h.id))
  await batch.commit()
}
