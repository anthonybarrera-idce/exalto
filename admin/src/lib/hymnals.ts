import { collection, deleteField, doc, onSnapshot, serverTimestamp } from "firebase/firestore"
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage"
import { useSyncExternalStore } from "react"

import { auth, db, storage } from "@/lib/firebase"
import { batchWithAudit } from "@/lib/hymns"
import type { Hymnal } from "@/lib/types"

/**
 * Hymnals live in Firestore (`hymnals/{id}`), read by the admin, Hymn Studio and the mobile app.
 * These built-in ones are the defaults: a doc with the same id overrides them, and they still show
 * when there's no doc yet, so nothing breaks before anyone edits a hymnal.
 */
export const DEFAULT_HYMNALS: Hymnal[] = [
  { id: "idc-himnario", name: "IDC Himnario", shortName: "Himnario", color: "#1A6B9A", kind: "official", visible: true, offline: true, order: 0 },
  { id: "canticos-espirituales", name: "Cánticos Espirituales", shortName: "Cánticos", color: "#7A3E1E", kind: "official", visible: true, offline: true, order: 1 },
  { id: "community", name: "Community", shortName: "Community", color: "#4A2E6B", kind: "community", visible: true, offline: false, order: 2 },
]
export const isBuiltIn = (id: string) => DEFAULT_HYMNALS.some((h) => h.id === id)

let current: Hymnal[] = DEFAULT_HYMNALS
const listeners = new Set<() => void>()
let unsubscribe: (() => void) | null = null

function merge(docs: Hymnal[]) {
  const byId = new Map(DEFAULT_HYMNALS.map((h) => [h.id, h]))
  for (const d of docs) byId.set(d.id, { ...byId.get(d.id), ...d })
  return [...byId.values()].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  unsubscribe ??= onSnapshot(collection(db, "hymnals"), (snap) => {
    current = merge(
      snap.docs.map((d) => {
        const x = d.data()
        const base = DEFAULT_HYMNALS.find((h) => h.id === d.id)
        return {
          id: d.id,
          name: x.name ?? base?.name ?? d.id,
          shortName: x.shortName || base?.shortName || x.name || d.id,
          color: x.color || base?.color || "#4A2E6B",
          kind: x.kind === "official" ? "official" : "community",
          visible: x.visible !== false,
          offline: x.offline === true,
          order: typeof x.order === "number" ? x.order : (base?.order ?? 99),
          ...(typeof x.thumbnailUrl === "string" && x.thumbnailUrl ? { thumbnailUrl: x.thumbnailUrl } : {}),
        } satisfies Hymnal
      }),
    )
    listeners.forEach((l) => l())
  })
  return () => {
    listeners.delete(listener)
  }
}

/** Live list of hymnals (defaults until Firestore answers), in display order. */
export function useHymnals(): Hymnal[] {
  return useSyncExternalStore(subscribe, () => current)
}

export function hymnalName(id: string) {
  return current.find((h) => h.id === id)?.name ?? id
}

export function isOfficial(id: string) {
  return current.find((h) => h.id === id)?.kind === "official"
}

/** A url-safe id from a name: "Himnos de Gloria" → "himnos-de-gloria". */
export function hymnalIdFrom(name: string) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
}

/** The thumbnail is set with setHymnalThumbnail / removeHymnalThumbnail, not the form. */
export type HymnalInput = Omit<Hymnal, "id" | "thumbnailUrl">

export async function saveHymnal(id: string, input: HymnalInput, isNew: boolean) {
  const { batch, uid } = batchWithAudit(isNew ? "Created hymnal" : "Edited hymnal", input.name)
  // Who made it: the app shows this name under the hymnal (Google name only, never an email).
  const name = auth.currentUser?.displayName?.trim().slice(0, 80)
  const creator = isNew ? { createdBy: uid, ...(name ? { createdByName: name } : {}) } : {}
  batch.set(
    doc(db, "hymnals", id),
    { ...input, ...creator, updatedAt: serverTimestamp(), updatedBy: uid, ...(isNew ? { createdAt: serverTimestamp() } : {}) },
    { merge: true },
  )
  await batch.commit()
}

/** Only for hymnals with no hymns and that aren't built in; owners and admins only (firestore.rules). */
export async function deleteHymnal(h: Hymnal) {
  // Its thumbnail file too (before the doc: a composer's delete permission is checked against it).
  await deleteOldThumbnail(h.id, h.thumbnailUrl).catch(() => {})
  const { batch } = batchWithAudit("Deleted hymnal", h.name)
  batch.delete(doc(db, "hymnals", h.id))
  await batch.commit()
}

const THUMB_SIZE = 512
const THUMB_EXTS = ["webp", "jpg", "png"] as const

/** Center-crops to a square and scales to 512 px (WebP, or JPEG where the browser can't encode WebP). */
async function squareThumbnail(file: File): Promise<{ blob: Blob; ext: "webp" | "jpg" }> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.")
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("That image couldn't be read. Try a JPG, PNG or WebP.")
  })
  const side = Math.min(bitmap.width, bitmap.height)
  const out = Math.min(THUMB_SIZE, side)
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = out
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("This browser can't resize images.")
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, out, out)
  bitmap.close()
  const encode = (type: string) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, 0.86))
  const webp = await encode("image/webp")
  if (webp?.type === "image/webp") return { blob: webp, ext: "webp" }
  const jpg = await encode("image/jpeg")
  if (!jpg) throw new Error("Couldn't encode the image.")
  return { blob: jpg, ext: "jpg" }
}

/** Deletes the file the previous URL points at when its format differs from the one kept (no blind 404s). */
async function deleteOldThumbnail(hymnalId: string, oldUrl: string | undefined, keep?: string) {
  const m = oldUrl && /thumbnail\.(webp|jpg|png)(?:\?|$)/.exec(decodeURIComponent(oldUrl))
  const ext = m ? (m[1] as (typeof THUMB_EXTS)[number]) : null
  if (!ext || ext === keep) return
  await deleteObject(ref(storage, `hymnals/${hymnalId}/thumbnail.${ext}`)).catch((err: { code?: string }) => {
    if (err?.code !== "storage/object-not-found") throw err
  })
}

/** Uploads a square thumbnail to `hymnals/{id}/thumbnail.*` and stores its download URL on the hymnal. */
export async function setHymnalThumbnail(id: string, hymnalName: string, file: File) {
  const oldUrl = current.find((h) => h.id === id)?.thumbnailUrl
  const { blob, ext } = await squareThumbnail(file)
  const fileRef = ref(storage, `hymnals/${id}/thumbnail.${ext}`)
  await uploadBytes(fileRef, blob, { contentType: blob.type, cacheControl: "public, max-age=31536000" })
  const url = await getDownloadURL(fileRef)
  const { batch, uid } = batchWithAudit("Set hymnal thumbnail", hymnalName)
  batch.set(doc(db, "hymnals", id), { ...docBase(id), thumbnailUrl: url, updatedAt: serverTimestamp(), updatedBy: uid }, { merge: true })
  await batch.commit()
  await deleteOldThumbnail(id, oldUrl, ext).catch(() => {})
}

export async function removeHymnalThumbnail(id: string, hymnalName: string) {
  const oldUrl = current.find((h) => h.id === id)?.thumbnailUrl
  const { batch, uid } = batchWithAudit("Removed hymnal thumbnail", hymnalName)
  batch.set(doc(db, "hymnals", id), { ...docBase(id), thumbnailUrl: deleteField(), updatedAt: serverTimestamp(), updatedBy: uid }, { merge: true })
  await batch.commit()
  await deleteOldThumbnail(id, oldUrl)
}

/** The rules check the whole doc, so a built-in hymnal with no doc yet gets its defaults written too. */
function docBase(id: string): HymnalInput {
  const h = current.find((x) => x.id === id)
  if (!h) throw new Error("Save the hymnal before adding a thumbnail.")
  const { id: _id, thumbnailUrl: _t, ...rest } = h
  return rest
}
