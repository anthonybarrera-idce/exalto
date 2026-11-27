import { collection, doc, onSnapshot, query, serverTimestamp, where, type Timestamp } from "firebase/firestore"
import { useEffect, useState } from "react"

import { db } from "@/lib/firebase"
import { batchWithAudit } from "@/lib/hymns"
import { setUserRole } from "@/lib/users"

/**
 * "Become a composer" requests from the mobile app, keyed by the requester's uid (`composerRequests/{uid}`).
 * Owners and admins approve or decline (firestore.rules lets them change only status, reviewedBy and reviewedAt);
 * moderators can read them.
 */
export type ComposerRequest = {
  uid: string
  displayName: string
  handle: string
  about: string
  sampleUrl?: string
  status: "pending" | "approved" | "declined"
  createdAt?: Timestamp
}

const col = collection(db, "composerRequests")

export function usePendingComposerRequests() {
  const [state, setState] = useState<{ data: ComposerRequest[]; loading: boolean; error: Error | null }>({ data: [], loading: true, error: null })
  useEffect(
    () =>
      // Equality-only query (no composite index needed); oldest first so requests are reviewed in order.
      onSnapshot(
        query(col, where("status", "==", "pending")),
        (snap) =>
          setState({
            data: snap.docs
              .map((d) => {
                const x = d.data()
                return {
                  uid: d.id,
                  displayName: x.displayName ?? "Unnamed",
                  handle: x.handle ?? "",
                  about: x.about ?? "",
                  sampleUrl: x.sampleUrl || undefined,
                  status: x.status,
                  createdAt: x.createdAt,
                } as ComposerRequest
              })
              .sort((a, b) => (a.createdAt?.toMillis() ?? Infinity) - (b.createdAt?.toMillis() ?? Infinity)),
            loading: false,
            error: null,
          }),
        (error) => setState((s) => ({ ...s, loading: false, error })),
      ),
    [],
  )
  return state
}

/** Only http(s) links are shown as clickable, so a request can't smuggle in a javascript: URL. */
export function safeSampleUrl(raw: string | undefined) {
  if (!raw) return null
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`)
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null
  } catch {
    return null
  }
}

const label = (r: ComposerRequest) => `@${r.handle || r.uid}`

async function review(r: ComposerRequest, status: "approved" | "declined", action: string) {
  const { batch, uid } = batchWithAudit(action, label(r))
  batch.update(doc(col, r.uid), { status, reviewedBy: uid, reviewedAt: serverTimestamp() })
  await batch.commit()
}

/** Gives the composer role (Cloud Function, which also refuses protected accounts), then marks the request approved. */
export async function approveComposerRequest(r: ComposerRequest) {
  await setUserRole({ id: r.uid }, "composer")
  await review(r, "approved", "Approved composer request")
}

export async function declineComposerRequest(r: ComposerRequest) {
  await review(r, "declined", "Declined composer request")
}
