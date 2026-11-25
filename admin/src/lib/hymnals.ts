import { collection, doc, onSnapshot, serverTimestamp } from "firebase/firestore"
import { useSyncExternalStore } from "react"

import { db } from "@/lib/firebase"
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

export type HymnalInput = Omit<Hymnal, "id">

export async function saveHymnal(id: string, input: HymnalInput, isNew: boolean) {
  const { batch, uid } = batchWithAudit(isNew ? "Created hymnal" : "Edited hymnal", input.name)
  batch.set(
    doc(db, "hymnals", id),
    { ...input, updatedAt: serverTimestamp(), updatedBy: uid, ...(isNew ? { createdAt: serverTimestamp() } : {}) },
    { merge: true },
  )
  await batch.commit()
}

/** Only for hymnals with no hymns and that aren't built in; owners and admins only (firestore.rules). */
export async function deleteHymnal(h: Hymnal) {
  const { batch } = batchWithAudit("Deleted hymnal", h.name)
  batch.delete(doc(db, "hymnals", h.id))
  await batch.commit()
}
