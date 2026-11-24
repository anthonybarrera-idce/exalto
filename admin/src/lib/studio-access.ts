import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, type Timestamp } from "firebase/firestore"
import { useEffect, useState } from "react"

import { auth, db } from "@/lib/firebase"
import { batchWithAudit } from "@/lib/hymns"

/**
 * Who may use Hymn Studio (the desktop app). Keyed by lower-case Google email so people can be
 * added before they've ever signed in. Owners and editors can always use it; this list is for
 * everyone else. Enforced by firestore.rules (studioAccess).
 */
export type StudioAccess = { email: string; note?: string; addedByName?: string; addedAt?: Timestamp }

const col = collection(db, "studioAccess")

export const normalizeEmail = (e: string) => e.trim().toLowerCase()
export const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

export function useStudioAccess() {
  const [state, setState] = useState<{ data: StudioAccess[]; loading: boolean; error: Error | null }>({ data: [], loading: true, error: null })
  useEffect(
    () =>
      onSnapshot(
        query(col, orderBy("addedAt", "desc")),
        (snap) => setState({ data: snap.docs.map((d) => d.data() as StudioAccess), loading: false, error: null }),
        (error) => setState((s) => ({ ...s, loading: false, error })),
      ),
    [],
  )
  return state
}

export async function grantStudioAccess(rawEmail: string, note: string) {
  const email = normalizeEmail(rawEmail)
  if (!isEmail(email)) throw new Error("Enter a valid email address.")
  const me = auth.currentUser
  const { batch, uid } = batchWithAudit("Gave Hymn Studio access", email)
  batch.set(doc(col, email), {
    email,
    ...(note.trim() ? { note: note.trim() } : {}),
    addedBy: uid,
    addedByName: me?.displayName ?? me?.email ?? uid,
    addedAt: serverTimestamp(),
  })
  await batch.commit()
}

export async function revokeStudioAccess(email: string) {
  const { batch } = batchWithAudit("Removed Hymn Studio access", email)
  batch.delete(doc(col, email))
  await batch.commit()
}
