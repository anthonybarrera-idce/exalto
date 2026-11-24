/**
 * Owner-only admin actions that need the Admin SDK (Firebase Auth custom claims, account deletion).
 * Called from the admin site via httpsCallable. Deploy: `npm --prefix functions run deploy`.
 */
import { initializeApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { FieldValue, getFirestore } from "firebase-admin/firestore"
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https"

initializeApp()
const db = getFirestore()

const ROLES = ["listener", "composer", "moderator", "editor", "owner"] as const
type Role = (typeof ROLES)[number]
const ADMIN_ROLES: Role[] = ["moderator", "editor", "owner"]

// The church's main account keeps full access: nobody can demote or delete it from the admin.
const PROTECTED_EMAILS = ["anthonybarrera@iglesiadecristoenelgin.com"]

async function refuseIfProtected(uid: string, action: string) {
  const email = (await getAuth().getUser(uid).catch(() => null))?.email?.toLowerCase()
  if (email && PROTECTED_EMAILS.includes(email)) {
    throw new HttpsError("failed-precondition", `${email} always keeps full access, so you can't ${action} it.`)
  }
}

function requireOwner(req: CallableRequest) {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.")
  if (req.auth.token.role !== "owner") throw new HttpsError("permission-denied", "Only the owner can do this.")
  return req.auth
}

async function audit(actorUid: string, actorName: string, action: string, target: string) {
  await db.collection("auditLog").add({ actorUid, actorName, action, target, at: FieldValue.serverTimestamp() })
}

export const setUserRole = onCall({ region: "us-central1" }, async (req) => {
  const caller = requireOwner(req)
  const { uid, role } = (req.data ?? {}) as { uid?: string; role?: Role }
  if (!uid || !role || !ROLES.includes(role)) throw new HttpsError("invalid-argument", "Expected { uid, role }.")
  if (uid === caller.uid && role !== "owner") throw new HttpsError("failed-precondition", "You can't remove your own owner role.")
  if (role !== "owner") await refuseIfProtected(uid, "lower the role of")

  const auth = getAuth()
  const user = await auth.getUser(uid)
  const claims = { ...(user.customClaims ?? {}) }
  // Only admin roles live in the auth claim; listener/composer are app-level and stored on the profile.
  if (ADMIN_ROLES.includes(role)) claims.role = role
  else delete claims.role
  claims.composer = role === "composer" || claims.composer === true
  await auth.setCustomUserClaims(uid, claims)

  const profile = db.collection("users").doc(uid)
  await profile.set({ role, roleUpdatedAt: FieldValue.serverTimestamp() }, { merge: true })
  const snap = await profile.get()
  await audit(caller.uid, (caller.token.name as string) ?? caller.uid, `Set role to ${role}`, `@${snap.get("handle") ?? uid}`)
  return { ok: true }
})

export const deleteUser = onCall({ region: "us-central1" }, async (req) => {
  const caller = requireOwner(req)
  const { uid } = (req.data ?? {}) as { uid?: string }
  if (!uid) throw new HttpsError("invalid-argument", "Expected { uid }.")
  if (uid === caller.uid) throw new HttpsError("failed-precondition", "You can't delete your own account here.")
  await refuseIfProtected(uid, "delete")

  const profile = db.collection("users").doc(uid)
  const handle = (await profile.get()).get("handle") ?? uid
  await getAuth().deleteUser(uid).catch((e: { code?: string }) => {
    if (e.code !== "auth/user-not-found") throw e
  })
  await profile.delete()
  await audit(caller.uid, (caller.token.name as string) ?? caller.uid, "Deleted account", `@${handle}`)
  return { ok: true }
})
