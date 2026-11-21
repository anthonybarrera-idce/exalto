import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
  type DocumentData,
} from "firebase/firestore"
import { useEffect, useState } from "react"

import { auth, db } from "@/lib/firebase"
import type { AuditEntry, Hymn, HymnStatus } from "@/lib/types"

const hymnsCol = collection(db, "hymns")

function toHymn(id: string, d: DocumentData): Hymn {
  return {
    id,
    number: d.number ?? null,
    label: d.label,
    title: d.title ?? "",
    hymnalId: d.hymnalId ?? "idc-himnario",
    language: d.language ?? "es",
    author: d.author ?? "",
    tags: d.tags ?? [],
    lyrics: d.lyrics ?? [],
    repeatChorus: d.repeatChorus ?? false,
    status: d.status ?? "draft",
    recordingCount: d.recordingCount ?? 0,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    updatedBy: d.updatedBy,
  }
}

type Live<T> = { data: T; loading: boolean; error: Error | null }

export function useHymns(): Live<Hymn[]> {
  const [state, setState] = useState<Live<Hymn[]>>({ data: [], loading: true, error: null })
  useEffect(
    () =>
      onSnapshot(
        query(hymnsCol, orderBy("title")),
        (snap) => setState({ data: snap.docs.map((d) => toHymn(d.id, d.data())), loading: false, error: null }),
        (error) => setState((s) => ({ ...s, loading: false, error })),
      ),
    [],
  )
  return state
}

export function useHymn(id: string | undefined): Live<Hymn | null> {
  const [state, setState] = useState<Live<Hymn | null>>({ data: null, loading: Boolean(id), error: null })
  useEffect(() => {
    if (!id) return
    return onSnapshot(
      doc(hymnsCol, id),
      (snap) => setState({ data: snap.exists() ? toHymn(snap.id, snap.data()) : null, loading: false, error: null }),
      (error) => setState((s) => ({ ...s, loading: false, error })),
    )
  }, [id])
  return state
}

export function useAuditLog(max = 20): Live<AuditEntry[]> {
  const [state, setState] = useState<Live<AuditEntry[]>>({ data: [], loading: true, error: null })
  useEffect(
    () =>
      onSnapshot(
        query(collection(db, "auditLog"), orderBy("at", "desc"), limit(max)),
        (snap) =>
          setState({
            data: snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AuditEntry, "id">) })),
            loading: false,
            error: null,
          }),
        (error) => setState((s) => ({ ...s, loading: false, error })),
      ),
    [max],
  )
  return state
}

/** Every admin write goes through a batch that also appends an audit log entry. */
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

export type HymnInput = Omit<Hymn, "id" | "createdAt" | "updatedAt" | "updatedBy" | "recordingCount">

export async function saveHymn(id: string | null, input: HymnInput): Promise<string> {
  const ref = id ? doc(hymnsCol, id) : doc(hymnsCol)
  const label = `${input.number != null ? `Hymn ${input.number} ` : ""}"${input.title}"`
  const { batch, uid } = batchWithAudit(id ? "Edited hymn" : "Created hymn", label)
  batch.set(
    ref,
    {
      ...input,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
      ...(id ? {} : { createdAt: serverTimestamp(), recordingCount: 0 }),
    },
    { merge: true },
  )
  await batch.commit()
  return ref.id
}

export async function setHymnStatus(hymn: Hymn, status: HymnStatus) {
  const { batch, uid } = batchWithAudit(`Set status to ${status}`, `"${hymn.title}"`)
  batch.update(doc(hymnsCol, hymn.id), { status, updatedAt: serverTimestamp(), updatedBy: uid })
  await batch.commit()
}

export async function deleteHymn(hymn: Hymn) {
  const { batch } = batchWithAudit("Deleted hymn", `"${hymn.title}"`)
  batch.delete(doc(hymnsCol, hymn.id))
  await batch.commit()
}
