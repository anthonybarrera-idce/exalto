import { GoogleAuthProvider, onIdTokenChanged, signInWithCredential, signOut as fbSignOut, type User } from "firebase/auth"
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from "firebase/firestore"
import { httpsCallable } from "firebase/functions"
import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { auth, db, firebaseConfigured, functions, usingEmulators } from "@/lib/firebase"
import { setOwnerScope } from "@/lib/library"
import { studio } from "@/lib/studio"

export type Role = "owner" | "admin" | "editor" | "moderator" | null
/**
 * Whether this person may use Studio:
 * - "loading": restoring a saved sign-in
 * - "signed-out"
 * - "checking": signed in, reading the access list
 * - "allowed": owner/admin/editor, composer, or on the admin's Studio access list
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
  /** A composer without a staff role: uploads only into their own hymnals and manages only their own hymns. */
  composer: boolean
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
  const [composerClaim, setComposerClaim] = useState(false)
  const [ready, setReady] = useState(false)
  const [listed, setListed] = useState<boolean | "offline" | null>(null)

  useEffect(
    () =>
      onIdTokenChanged(auth, async (u) => {
        setUser(u)
        let claims = u ? (await u.getIdTokenResult()).claims : null
        // Someone invited to the team by email (admin → Settings) gets their role the first time they sign in.
        if (u && !claims?.role && !claims?.composer) {
          const accepted = await httpsCallable<void, { role: string | null }>(functions, "acceptInvite")().catch(() => null)
          if (accepted?.data.role) claims = (await u.getIdTokenResult(true)).claims
        }
        const r = claims?.role
        setComposerClaim(claims?.composer === true)
        setRole(r === "owner" || r === "admin" || r === "editor" || r === "moderator" ? r : null)
        setReady(true)
      }),
    [],
  )

  // Keep a profile (`users/{uid}`) so Studio users show up in the admin's Users page. People may write their own
  // profile but never role or status (firestore.rules); those stay with the admin and its Cloud Functions.
  const uid = user?.uid
  useEffect(() => {
    if (!user) return
    const ref = doc(db, "users", user.uid)
    const basics = { displayName: user.displayName ?? user.email ?? "Studio user", photoURL: user.photoURL ?? null, email: user.email?.toLowerCase() ?? null }
    getDoc(ref)
      .then((snap) =>
        snap.exists()
          ? updateDoc(ref, { email: basics.email, lastActiveAt: serverTimestamp() }) // keep a name or photo they chose
          : setDoc(ref, { ...basics, handle: "", uploadCount: 0, createdAt: serverTimestamp(), lastActiveAt: serverTimestamp() }),
      )
      .catch(() => {}) // Offline or no Firebase: try again next sign-in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid])

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
  const composer = !staff && composerClaim
  useEffect(() => setOwnerScope(composer && user ? user.uid : null), [composer, user])
  const access: Access = !configured
    ? "unconfigured"
    : !ready
      ? "loading"
      : !user
        ? "signed-out"
        : staff || composer || listed === true
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
        canUpload: staff || composer,
        composer,
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
