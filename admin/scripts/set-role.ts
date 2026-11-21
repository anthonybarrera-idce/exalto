/**
 * Give a user an admin role (or remove it) via a Firebase Auth custom claim.
 *
 *   npm run set-role -- someone@example.com owner|editor|moderator|none
 *
 * Production: set GOOGLE_APPLICATION_CREDENTIALS to a service-account key (never commit it).
 * Emulator:   set FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099.
 * The user must sign in again (or wait up to an hour) for the new role to apply.
 */
import { applicationDefault, initializeApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"

const [email, role] = process.argv.slice(2)
const ROLES = ["owner", "editor", "moderator", "none"]
if (!email || !ROLES.includes(role)) {
  console.error(`Usage: npm run set-role -- <email> <${ROLES.join("|")}>`)
  process.exit(1)
}

const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.VITE_FIREBASE_PROJECT_ID ?? "demo-exalto"
initializeApp(process.env.FIREBASE_AUTH_EMULATOR_HOST ? { projectId } : { credential: applicationDefault(), projectId })

const auth = getAuth()
const user = await auth.getUserByEmail(email)
await auth.setCustomUserClaims(user.uid, role === "none" ? { role: null } : { role })
console.log(`${email}: role ${role === "none" ? "removed" : `set to ${role}`}`)
