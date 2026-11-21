import { initializeApp } from "firebase/app"
import { connectAuthEmulator, getAuth, GoogleAuthProvider } from "firebase/auth"
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore"
import { connectStorageEmulator, getStorage } from "firebase/storage"

const env = import.meta.env

export const firebaseConfigured = Boolean(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID)

export const app = initializeApp({
  // Placeholder key keeps the SDK from throwing before .env.local exists; the login page explains what to set.
  apiKey: env.VITE_FIREBASE_API_KEY || "not-configured",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? "demo-exalto",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  appId: env.VITE_FIREBASE_APP_ID,
})

export const auth = getAuth(app)
export const db = getFirestore(app)
export const storage = getStorage(app)
export const googleProvider = new GoogleAuthProvider()

export const usingEmulators = env.VITE_USE_EMULATORS === "true"

if (usingEmulators) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true })
  connectFirestoreEmulator(db, "127.0.0.1", 8080)
  connectStorageEmulator(storage, "127.0.0.1", 9199)
}
