import { GoogleAuthProvider, onIdTokenChanged, signInWithCredential, signOut as fbSignOut, type User } from "firebase/auth"
import { doc, onSnapshot } from "firebase/firestore"
import { httpsCallable } from "firebase/functions"
import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { auth, db, firebaseConfigured, functions, usingEmulators } from "@/lib/firebase"
import { studio } from "@/lib/studio"

export type Role = "owner" | "admin" | "editor" | "moderator" | null
/**
 * Whether this person may use Studio:
 * - "loading": restoring a saved sign-in
 * - "signed-out"
 * - "checking": signed in, reading the access list
 * - "allowed": owner/admin/editor, or on the admin's Studio access list
 * - "denied": signed in but not on the list
 * - "offline": couldn't check (no saved answer and no connection)
 * - "unconfigured": this build has no Firebase settings (local development only)
 */
export type Access = "loading" | "signed-out" | "checking" | "allowed" | "denied" | "offline" | "unconfigured"

type Ctx = {
  user: User | null
  role: Role
  access: Access
  canUpload: boolean
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  refreshRole: () => Promise<void>
}
const AuthContext = createContext<Ctx>(null!)

/** Firebase sign-in with the same Google accounts and admin roles as the admin web app. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = firebaseConfigured || usingEmulators
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState<Role>(null)
  const [ready, setReady] = useState(false)
  const [listed, setListed] = useState<boolean | "offline" | null>(null)

  useEffect(
    () =>
      onIdTokenChanged(auth, async (u) => {
        setUser(u)
        let r = u ? (await u.getIdTokenResult()).claims.role : null
        // Someone invited to the team by email (admin → Settings) gets their role the first time they sign in.
        if (u && !r) {
          const accepted = await httpsCallable<void, { role: string | null }>(functions, "acceptInvite")().catch(() => null)
          if (accepted?.data.role) r = (await u.getIdTokenResult(true)).claims.role
        }
        setRole(r === "owner" || r === "admin" || r === "editor" || r === "moderator" ? r : null)
        setReady(true)
      }),
    [],
  )

  // Watch this person's entry on the access list, so removing them in the admin locks Studio at once.
  // The answer is cached on disk, so Studio still opens offline for someone already allowed.
  const email = user?.email?.toLowerCase()
  useEffect(() => {
    setListed(null)
    if (!email) return
    return onSnapshot(
      doc(db, "studioAccess", email),
      (snap) => setListed(snap.exists()),
      () => setListed((l) => (l === true ? true : "offline")),
    )
  }, [email])

  const signIn = async () => {
    // The auth emulator accepts a made-up Google identity; production goes through the browser.
    const idToken = usingEmulators
      ? JSON.stringify({ sub: "studio-dev", email: "studio-dev@example.com", email_verified: true, name: "Studio Dev" })
      : await studio.googleSignIn()
    await signInWithCredential(auth, GoogleAuthProvider.credential(idToken))
  }

  const staff = role === "owner" || role === "admin" || role === "editor"
  const access: Access = !configured
    ? "unconfigured"
    : !ready
      ? "loading"
      : !user
        ? "signed-out"
        : staff || listed === true
          ? "allowed"
          : listed === null
            ? "checking"
            : listed === "offline"
              ? "offline"
              : "denied"

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        access,
        canUpload: staff,
        signIn,
        signOut: () => fbSignOut(auth),
        refreshRole: async () => void (await auth.currentUser?.getIdToken(true)),
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
export const useAuth = () => useContext(AuthContext)
