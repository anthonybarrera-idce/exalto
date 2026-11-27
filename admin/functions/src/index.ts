/**
 * Admin actions that need the Admin SDK (Firebase Auth custom claims, account deletion, team invites).
 * Called from the admin site and Hymn Studio via httpsCallable. Deploy: `npm --prefix functions run deploy`.
 *
 * Roles: owner > admin > editor / moderator (the auth claim `role`); composer and listener live on the profile.
 * - Only OWNER_EMAIL (the church's main account) can ever hold the owner role.
 * - Owners and admins manage the team: change roles, invite admins by email, delete accounts.
 *   Nobody but an owner can change or delete an owner.
 */
import { initializeApp } from "firebase-admin/app"
import { getAuth, type DecodedIdToken } from "firebase-admin/auth"
import { FieldValue, getFirestore } from "firebase-admin/firestore"
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https"

initializeApp()
const db = getFirestore()

const ROLES = ["listener", "composer", "moderator", "editor", "admin", "owner"] as const
type Role = (typeof ROLES)[number]
const ADMIN_ROLES: Role[] = ["moderator", "editor", "admin", "owner"]
/** Roles that can be given by email invite (Team page and Studio access). */
const INVITE_ROLES: Role[] = ["composer", "moderator", "editor", "admin"]

// The church's main account: the only account that may be owner, and nobody can demote or delete it.
const OWNER_EMAIL = "anthonybarrera@iglesiadecristoenelgin.com"
const PROTECTED_EMAILS = [OWNER_EMAIL]

/** Every callable: one region, and at most 5 instances so a flood of rejected calls can't run up a bill. */
const CALL_OPTIONS = { region: "us-central1", maxInstances: 5 }

const normalizeEmail = (e: string) => e.trim().toLowerCase()
const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

async function refuseIfProtected(uid: string, action: string) {
  const email = (await getAuth().getUser(uid).catch(() => null))?.email?.toLowerCase()
  if (email && PROTECTED_EMAILS.includes(email)) {
    throw new HttpsError("failed-precondition", `${email} always keeps full access, so you can't ${action} it.`)
  }
}

/** Owners and admins manage the team. */
function requireManager(req: CallableRequest) {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.")
  const role = req.auth.token.role
  if (role !== "owner" && role !== "admin") throw new HttpsError("permission-denied", "Only owners and admins can do this.")
  return req.auth
}

/** Admins can't touch an owner; only an owner can. */
async function refuseIfOwnerTarget(caller: { token: DecodedIdToken }, uid: string, action: string) {
  if (caller.token.role === "owner") return
  const target = await getAuth().getUser(uid).catch(() => null)
  if (target?.customClaims?.role === "owner") throw new HttpsError("permission-denied", `Only an owner can ${action} an owner.`)
}

const actorName = (caller: { uid: string; token: DecodedIdToken }) => (caller.token.name as string) ?? caller.token.email ?? caller.uid

async function audit(actorUid: string, name: string, action: string, target: string) {
  await db.collection("auditLog").add({ actorUid, actorName: name, action, target, at: FieldValue.serverTimestamp() })
}

/** Writes the role to the auth claim (admin roles only) and the profile. Keeps an existing composer flag. */
async function applyRole(uid: string, role: Role) {
  const auth = getAuth()
  const user = await auth.getUser(uid)
  if (role === "owner" && user.email?.toLowerCase() !== OWNER_EMAIL) {
    throw new HttpsError("failed-precondition", "Only the church account can be owner.")
  }
  const claims = { ...(user.customClaims ?? {}) }
  // Only admin roles live in the auth claim; listener/composer are app-level and stored on the profile.
  if (ADMIN_ROLES.includes(role)) claims.role = role
  else delete claims.role
  claims.composer = role === "composer" || claims.composer === true
  await auth.setCustomUserClaims(uid, claims)
  const profile = db.collection("users").doc(uid)
  await profile.set({ role, roleUpdatedAt: FieldValue.serverTimestamp() }, { merge: true })
  return (await profile.get()).get("handle") as string | undefined
}

export const setUserRole = onCall(CALL_OPTIONS, async (req) => {
  const caller = requireManager(req)
  const { uid, role } = (req.data ?? {}) as { uid?: string; role?: Role }
  if (!uid || !role || !ROLES.includes(role)) throw new HttpsError("invalid-argument", "Expected { uid, role }.")
  if (uid === caller.uid) throw new HttpsError("failed-precondition", "You can't change your own role.")
  if (role === "owner" && caller.token.role !== "owner") throw new HttpsError("permission-denied", "Only an owner can make someone an owner.")
  if (role !== "owner") await refuseIfProtected(uid, "lower the role of")
  await refuseIfOwnerTarget(caller, uid, "change the role of")

  const handle = await applyRole(uid, role)
  await audit(caller.uid, actorName(caller), `Set role to ${role}`, `@${handle ?? uid}`)
  return { ok: true }
})

export const deleteUser = onCall(CALL_OPTIONS, async (req) => {
  const caller = requireManager(req)
  const { uid } = (req.data ?? {}) as { uid?: string }
  if (!uid) throw new HttpsError("invalid-argument", "Expected { uid }.")
  if (uid === caller.uid) throw new HttpsError("failed-precondition", "You can't delete your own account here.")
  await refuseIfProtected(uid, "delete")
  await refuseIfOwnerTarget(caller, uid, "delete")

  const profile = db.collection("users").doc(uid)
  const handle = (await profile.get()).get("handle") ?? uid
  await getAuth().deleteUser(uid).catch((e: { code?: string }) => {
    if (e.code !== "auth/user-not-found") throw e
  })
  await profile.delete()
  await audit(caller.uid, actorName(caller), "Deleted account", `@${handle}`)
  return { ok: true }
})

/**
 * Invites someone to the Exalto team by Google email (`members/{email}`). If they already have an account the
 * role applies now; otherwise it applies the first time they sign in to the admin or Hymn Studio (acceptInvite).
 */
export const inviteMember = onCall(CALL_OPTIONS, async (req) => {
  const caller = requireManager(req)
  const { email: raw, role } = (req.data ?? {}) as { email?: string; role?: Role }
  const email = normalizeEmail(raw ?? "")
  if (!isEmail(email)) throw new HttpsError("invalid-argument", "Enter a valid email address.")
  if (!role || !INVITE_ROLES.includes(role)) throw new HttpsError("invalid-argument", `You can invite people as: ${INVITE_ROLES.join(", ")}.`)
  if (PROTECTED_EMAILS.includes(email)) throw new HttpsError("failed-precondition", `${email} is the church account and is always owner.`)
  if (email === caller.token.email?.toLowerCase()) throw new HttpsError("failed-precondition", "You can't invite yourself.")

  const existing = await getAuth().getUserByEmail(email).catch(() => null)
  if (existing) await refuseIfOwnerTarget(caller, existing.uid, "change the role of")
  const member = db.collection("members").doc(email)
  await member.set({
    email,
    role,
    status: existing ? "active" : "invited",
    invitedBy: caller.uid,
    invitedByName: actorName(caller),
    invitedAt: FieldValue.serverTimestamp(),
    ...(existing ? { uid: existing.uid, acceptedAt: FieldValue.serverTimestamp() } : {}),
  })
  if (existing) await applyRole(existing.uid, role)
  await audit(caller.uid, actorName(caller), `Invited as ${role}`, email)
  return { ok: true, status: existing ? "active" : "invited" }
})

/** Cancels an invite that hasn't been used yet. People already on the team are changed with setUserRole. */
export const revokeInvite = onCall(CALL_OPTIONS, async (req) => {
  const caller = requireManager(req)
  const email = normalizeEmail(((req.data ?? {}) as { email?: string }).email ?? "")
  if (!isEmail(email)) throw new HttpsError("invalid-argument", "Expected { email }.")
  const member = db.collection("members").doc(email)
  const snap = await member.get()
  if (!snap.exists || snap.get("status") !== "invited") throw new HttpsError("failed-precondition", "There's no pending invite for that email.")
  await member.delete()
  await audit(caller.uid, actorName(caller), "Cancelled invite", email)
  return { ok: true }
})

/** Called by the admin and Studio after sign-in: applies a pending invite for the caller's verified email. */
export const acceptInvite = onCall(CALL_OPTIONS, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.")
  const email = req.auth.token.email?.toLowerCase()
  if (!email || req.auth.token.email_verified !== true) return { role: null }
  const member = db.collection("members").doc(email)
  const snap = await member.get()
  if (!snap.exists || snap.get("status") !== "invited") return { role: null }
  const role = snap.get("role") as Role
  if (!INVITE_ROLES.includes(role)) return { role: null }
  await applyRole(req.auth.uid, role)
  await member.update({ status: "active", uid: req.auth.uid, acceptedAt: FieldValue.serverTimestamp() })
  await audit(req.auth.uid, (req.auth.token.name as string) ?? email, `Joined the team as ${role}`, email)
  return { role }
})
