import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, type Timestamp } from "firebase/firestore"
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions"
import { useEffect, useState } from "react"

import { app, db, usingEmulators } from "@/lib/firebase"
import { batchWithAudit } from "@/lib/hymns"
import type { AppUser, UserRole, UserStatus } from "@/lib/types"

const usersCol = collection(db, "users")

type Live<T> = { data: T; loading: boolean; error: Error | null }

export function useUsers(): Live<AppUser[]> {
  const [state, setState] = useState<Live<AppUser[]>>({ data: [], loading: true, error: null })
  useEffect(
    () =>
      onSnapshot(
        query(usersCol, orderBy("createdAt", "desc")),
        (snap) =>
          setState({
            data: snap.docs.map((d) => {
              const x = d.data()
              return {
                id: d.id,
                displayName: x.displayName ?? "Unnamed",
                handle: x.handle ?? "",
                photoURL: x.photoURL,
                church: x.church,
                role: x.role ?? "listener",
                status: x.status ?? "active",
                uploadCount: x.uploadCount ?? 0,
                createdAt: x.createdAt,
                lastActiveAt: x.lastActiveAt,
              }
            }),
            loading: false,
            error: null,
          }),
        (error) => setState((s) => ({ ...s, loading: false, error })),
      ),
    [],
  )
  return state
}

const STATUS_ACTION: Record<UserStatus, string> = { active: "Reactivated", warned: "Warned", suspended: "Suspended" }

export async function setUserStatus(user: AppUser, status: UserStatus) {
  const { batch, uid } = batchWithAudit(STATUS_ACTION[status], `@${user.handle || user.id}`)
  batch.update(doc(usersCol, user.id), { status, statusUpdatedAt: serverTimestamp(), statusUpdatedBy: uid })
  await batch.commit()
}

// Role changes, invites and deletion touch Firebase Auth, so they run in Cloud Functions (admin/functions), owners and admins only.
const functions = getFunctions(app, "us-central1")
if (usingEmulators) connectFunctionsEmulator(functions, "127.0.0.1", 5001)

export async function setUserRole(user: AppUser, role: UserRole) {
  await httpsCallable(functions, "setUserRole")({ uid: user.id, role })
}

export async function deleteUserAccount(user: AppUser) {
  await httpsCallable(functions, "deleteUser")({ uid: user.id })
}

/** Roles that can be given by email invite (must match INVITE_ROLES in admin/functions). */
export const INVITE_ROLES = ["admin"] as const
export type InviteRole = (typeof INVITE_ROLES)[number]

/** Team invites by Google email (`members/{email}`), written by Cloud Functions only. */
export type Member = { email: string; role: UserRole; status: "invited" | "active"; invitedByName?: string; invitedAt?: Timestamp; acceptedAt?: Timestamp }

export function useMembers(): Live<Member[]> {
  const [state, setState] = useState<Live<Member[]>>({ data: [], loading: true, error: null })
  useEffect(
    () =>
      onSnapshot(
        query(collection(db, "members"), orderBy("invitedAt", "desc")),
        (snap) => setState({ data: snap.docs.map((d) => d.data() as Member), loading: false, error: null }),
        (error) => setState((s) => ({ ...s, loading: false, error })),
      ),
    [],
  )
  return state
}

export async function inviteMember(email: string, role: InviteRole) {
  const r = await httpsCallable<{ email: string; role: InviteRole }, { status: "invited" | "active" }>(functions, "inviteMember")({ email, role })
  return r.data.status
}

export async function revokeInvite(email: string) {
  await httpsCallable(functions, "revokeInvite")({ email })
}

/** Applies a pending invite for the signed-in person's email. Returns the new role, or null. */
export async function acceptInvite() {
  const r = await httpsCallable<void, { role: string | null }>(functions, "acceptInvite")()
  return r.data.role
}
