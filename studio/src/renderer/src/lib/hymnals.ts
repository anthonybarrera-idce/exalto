import { collection, doc, onSnapshot, serverTimestamp } from "firebase/firestore"
import { useSyncExternalStore } from "react"
import { auth, db } from "@/lib/firebase"
import { batchWithAudit, getOwnerScope } from "@/lib/library"
import { useAuth } from "@/hooks/use-auth"

/**
 * Hymnals, shared with the admin and the mobile app (admin/src/lib/hymnals.ts): Firestore `hymnals/{id}` docs
 * override these built-in defaults, and the defaults still show when there's no doc yet.
 */
export type Hymnal = {
  id: string
  name: string
  shortName: string
  color: string
  kind: "official" | "community"
  visible: boolean
  offline: boolean
  order: number
  /** Set on hymnals a composer created; they manage only these (firestore.rules). */
  ownerUid?: string
}

export const DEFAULT_HYMNALS: Hymnal[] = [
  { id: "idc-himnario", name: "IDC Himnario", shortName: "Himnario", color: "#1A6B9A", kind: "official", visible: true, offline: true, order: 0 },
  { id: "canticos-espirituales", name: "Cánticos Espirituales", shortName: "Cánticos", color: "#7A3E1E", kind: "official", visible: true, offline: true, order: 1 },
  { id: "community", name: "Community", shortName: "Community", color: "#4A2E6B", kind: "community", visible: true, offline: false, order: 2 },
]
export const isBuiltIn = (id: string) => DEFAULT_HYMNALS.some((h) => h.id === id)

let current: Hymnal[] = DEFAULT_HYMNALS
const listeners = new Set<() => void>()
let watching = false

function merge(docs: Hymnal[]) {
  const byId = new Map(DEFAULT_HYMNALS.map((h) => [h.id, h]))
  for (const d of docs) byId.set(d.id, d)
  return [...byId.values()].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!watching) {
    watching = true
    onSnapshot(
      collection(db, "hymnals"),
      (snap) => {
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
              ...(x.ownerUid ? { ownerUid: x.ownerUid as string } : {}),
            } satisfies Hymnal
          }),
        )
        listeners.forEach((l) => l())
      },
      () => {
        watching = false
      },
    )
  }
  return () => void listeners.delete(listener)
}

/** Live list of every hymnal in display order (the defaults until Firestore answers). */
export const useAllHymnals = () => useSyncExternalStore(subscribe, () => current)

/** The hymnals this person can upload to and manage: all of them for staff, only their own for a composer. */
export function useHymnals() {
  const all = useAllHymnals()
  const { user, composer } = useAuth()
  return composer ? all.filter((h) => h.ownerUid === user?.uid) : all
}
export const hymnalName = (id: string) => current.find((h) => h.id === id)?.name ?? id

/** A url-safe id from a name: "Himnos de Gloria" → "himnos-de-gloria". */
export const hymnalIdFrom = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)

export type HymnalInput = Omit<Hymnal, "id">

export async function saveHymnal(id: string, input: HymnalInput, isNew: boolean) {
  const { batch, uid } = batchWithAudit(isNew ? "Created hymnal in Hymn Studio" : "Edited hymnal in Hymn Studio", input.name)
  // A composer's hymnals are theirs: community, not cached offline on every phone (firestore.rules).
  const own = getOwnerScope() ? { ownerUid: uid, kind: "community" as const, offline: false } : {}
  const { ownerUid: _keep, ...fields } = input
  // Who made it: the app shows this name under the hymnal (Google name only, never an email).
  const me = auth.currentUser
  const name = me?.displayName?.trim().slice(0, 80)
  const creator = isNew ? { createdBy: uid, ...(name ? { createdByName: name } : {}) } : {}
  batch.set(doc(db, "hymnals", id), { ...fields, ...own, ...creator, updatedAt: serverTimestamp(), updatedBy: uid, ...(isNew ? { createdAt: serverTimestamp() } : {}) }, { merge: true })
  await batch.commit()
}

/** Only custom hymnals with no hymns; owners and admins, or the composer who owns it (firestore.rules). */
export async function deleteHymnal(h: Hymnal) {
  const { batch } = batchWithAudit("Deleted hymnal", h.name)
  batch.delete(doc(db, "hymnals", h.id))
  await batch.commit()
}
