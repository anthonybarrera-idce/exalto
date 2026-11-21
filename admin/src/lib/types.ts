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
  kind: "official" | "community"
  visible: boolean
  offline: boolean
}

/** Roles that may sign in to the admin. Set as a Firebase Auth custom claim `role`. */
export type AdminRole = "owner" | "editor" | "moderator"
export const ADMIN_ROLES: AdminRole[] = ["owner", "editor", "moderator"]

export type AuditEntry = {
  id: string
  actorUid: string
  actorName: string
  action: string
  target: string
  at?: Timestamp
}
