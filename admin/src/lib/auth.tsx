import { onIdTokenChanged, signInWithPopup, signOut as fbSignOut, type User } from "firebase/auth"
import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

import { auth, googleProvider } from "@/lib/firebase"
import { acceptInvite } from "@/lib/users"
import { ADMIN_ROLES, type AdminRole } from "@/lib/types"

type AuthState = {
  user: User | null
  role: AdminRole | null
  loading: boolean
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  /** Re-fetch the ID token so a newly granted role applies without signing out. */
  refreshRole: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState<AdminRole | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(
    () =>
      onIdTokenChanged(auth, async (u) => {
        setUser(u)
        if (u) {
          let { claims } = await u.getIdTokenResult()
          // Someone invited by email gets their role the first time they sign in.
          if (!claims.role && (await acceptInvite().catch(() => null))) claims = (await u.getIdTokenResult(true)).claims
          const r = claims.role as AdminRole | undefined
          setRole(r && ADMIN_ROLES.includes(r) ? r : null)
        } else {
          setRole(null)
        }
        setLoading(false)
      }),
    [],
  )

  const value: AuthState = {
    user,
    role,
    loading,
    signIn: async () => {
      await signInWithPopup(auth, googleProvider)
    },
    signOut: () => fbSignOut(auth),
    refreshRole: async () => {
      await auth.currentUser?.getIdToken(true)
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider")
  return ctx
}

export function canEditContent(role: AdminRole | null) {
  return role === "owner" || role === "admin" || role === "editor"
}

/** Owners and admins change roles, invite people and manage Studio access. */
export function canManageTeam(role: AdminRole | null) {
  return role === "owner" || role === "admin"
}
