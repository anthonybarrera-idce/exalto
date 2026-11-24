import { initializeApp } from "firebase/app"
import { connectAuthEmulator, getAuth } from "firebase/auth"
import { connectFirestoreEmulator, initializeFirestore, persistentLocalCache } from "firebase/firestore"
import { connectStorageEmulator, getStorage } from "firebase/storage"

const env = import.meta.env

/** Same Firebase project and settings as the admin app. */
export const firebaseConfigured = Boolean(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID)
export const usingEmulators = env.VITE_USE_EMULATORS === "true"

export const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY || "not-configured",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? "demo-exalto",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || `${env.VITE_FIREBASE_PROJECT_ID ?? "demo-exalto"}.appspot.com`,
  appId: env.VITE_FIREBASE_APP_ID,
})
export const auth = getAuth(app)
// Cached on disk so the access check (and the last answer) works when Studio opens offline.
export const db = initializeFirestore(app, { localCache: persistentLocalCache() })
export const storage = getStorage(app)

if (usingEmulators) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true })
  connectFirestoreEmulator(db, "127.0.0.1", 8080)
  connectStorageEmulator(storage, "127.0.0.1", 9199)
}
