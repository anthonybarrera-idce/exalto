/**
 * Seed example users into the Firestore EMULATOR only, to preview the Users screen.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run seed-users
 */
import { initializeApp } from "firebase-admin/app"
import { Timestamp, getFirestore } from "firebase-admin/firestore"

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("Refusing to run: set FIRESTORE_EMULATOR_HOST. This script only writes example data to the emulator.")
  process.exit(1)
}

initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID ?? "demo-exalto" })
const db = getFirestore()

const daysAgo = (d: number) => Timestamp.fromMillis(Date.now() - d * 86_400_000)
const EXAMPLES = [
  ["example-composer-1", "Example Composer", "example_composer", "composer", "active", "Example Church A", 12, 200, 0.1],
  ["example-composer-2", "Example Choir", "example_choir", "composer", "active", "Example Church B", 22, 220, 1],
  ["example-listener-1", "Example Listener One", "listener_one", "listener", "active", "Example Church A", 0, 40, 0.2],
  ["example-listener-2", "Example Listener Two", "listener_two", "listener", "active", "", 0, 10, 3],
  ["example-warned", "Example Warned", "warned_example", "listener", "warned", "", 0, 90, 5],
  ["example-suspended", "Example Suspended", "spam_example", "listener", "suspended", "", 0, 7, 2],
  ["example-moderator", "Example Moderator", "mod_example", "moderator", "active", "Example Church A", 0, 180, 0.05],
  ["example-editor", "Example Editor", "editor_example", "editor", "active", "Example Church A", 0, 150, 1],
] as const

const batch = db.batch()
for (const [id, displayName, handle, role, status, church, uploadCount, joined, active] of EXAMPLES) {
  batch.set(db.collection("users").doc(id), {
    displayName, handle, role, status, church, uploadCount,
    createdAt: daysAgo(joined), lastActiveAt: daysAgo(active),
  })
}
await batch.commit()
console.log(`Seeded ${EXAMPLES.length} example users into the emulator.`)
