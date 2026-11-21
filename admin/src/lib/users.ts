import { collection, doc, onSnapshot, orderBy, query, serverTimestamp } from "firebase/firestore"
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

// Role changes and deletion touch Firebase Auth, so they run in Cloud Functions (admin/functions), owner only.
const functions = getFunctions(app, "us-central1")
if (usingEmulators) connectFunctionsEmulator(functions, "127.0.0.1", 5001)

export async function setUserRole(user: AppUser, role: UserRole) {
  await httpsCallable(functions, "setUserRole")({ uid: user.id, role })
}

export async function deleteUserAccount(user: AppUser) {
  await httpsCallable(functions, "deleteUser")({ uid: user.id })
}
