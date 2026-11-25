import type { Timestamp } from "firebase/firestore"

/** Matches LyricSection in the mobile app (exalto/src/context/audio-context.tsx). */
export type LyricSection = {
  type: "verse" | "chorus" | "bridge"
  number?: number
  lines: string[]
}

export type HymnStatus = "published" | "draft" | "review" | "hidden"

export type Hymn = {
  id: string
  number: number | null
  /** Display number when it isn't a plain integer, e.g. "17B". */
  label?: string
  title: string
  hymnalId: string
  language: "es" | "en"
  author: string
  tags: string[]
  lyrics: LyricSection[]
  repeatChorus: boolean
  status: HymnStatus
  recordingCount: number
  createdAt?: Timestamp
  updatedAt?: Timestamp
  updatedBy?: string
}

export type Hymnal = {
  id: string
  name: string
  /** Shown on the mobile app's hymnal tabs. */
  shortName: string
  /** Artwork color for its hymns in the mobile app. */
  color: string
  kind: "official" | "community"
  visible: boolean
  /** Cached on the phone so it works offline. */
  offline: boolean
  /** Display order, lowest first. */
  order: number
}

/** Roles that may sign in to the admin. Set as a Firebase Auth custom claim `role`. */
export type AdminRole = "owner" | "admin" | "editor" | "moderator"
export const ADMIN_ROLES: AdminRole[] = ["owner", "admin", "editor", "moderator"]

export type AuditEntry = {
  id: string
  actorUid: string
  actorName: string
  action: string
  target: string
  at?: Timestamp
}

export type UserRole = "listener" | "composer" | AdminRole
export type UserStatus = "active" | "warned" | "suspended"

/** Profile written by the mobile app at sign-up (`users/{uid}`). `role` is mirrored from the auth claim by a Cloud Function. */
export type AppUser = {
  id: string
  displayName: string
  handle: string
  photoURL?: string
  church?: string
  role: UserRole
  status: UserStatus
  uploadCount: number
  createdAt?: Timestamp
  lastActiveAt?: Timestamp
}
