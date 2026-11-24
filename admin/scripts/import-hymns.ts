/**
 * Import hymns produced by Hymn Studio's deck converter (`hymn_processor.cli deck`).
 * Reads its hymns.json (or one hymn.json) and writes each hymn as a draft so an editor
 * can review lyrics before publishing. Re-running overwrites the same docs (id = <hymnalId>-<slug>).
 *
 *   npm run import-hymns -- ../services/hymn-studio/storage/decks/hymns.json [--dry-run]
 *
 * Uses the same credentials/emulator env vars as scripts/set-role.ts.
 */
import { readFileSync } from "node:fs"
import { applicationDefault, initializeApp } from "firebase-admin/app"
import { FieldValue, getFirestore } from "firebase-admin/firestore"

import type { LyricSection } from "../src/lib/types.ts"

const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith("--"))
const dryRun = args.includes("--dry-run")
if (!file) {
  console.error("Usage: npm run import-hymns -- <hymns.json|hymn.json> [--dry-run]")
  process.exit(1)
}

type Converted = {
  id: string
  title: string
  hymnalId: string
  language: "es" | "en"
  author: string
  tags: string[]
  lyrics: LyricSection[]
  repeatChorus: boolean
  number?: number | null
}

const parsed = JSON.parse(readFileSync(file, "utf8")) as Converted | Converted[]
const rows = (Array.isArray(parsed) ? parsed : [parsed]).map((h) => ({
  id: `${h.hymnalId}-${h.id}`,
  data: {
    number: h.number ?? null,
    title: h.title.trim(),
    hymnalId: h.hymnalId,
    language: h.language,
    author: h.author ?? "",
    tags: h.tags ?? [],
    lyrics: h.lyrics,
    repeatChorus: h.repeatChorus ?? false,
    status: "draft",
    recordingCount: 0,
  },
}))

console.log(`Parsed ${rows.length} hymn(s): ${rows.map((r) => r.data.title).join(", ")}`)
if (dryRun) {
  console.log(JSON.stringify(rows, null, 2))
  process.exit(0)
}

const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.VITE_FIREBASE_PROJECT_ID ?? "demo-exalto"
initializeApp(process.env.FIRESTORE_EMULATOR_HOST ? { projectId } : { credential: applicationDefault(), projectId })
const db = getFirestore()
db.settings({ preferRest: true })

for (let i = 0; i < rows.length; i += 400) {
  const batch = db.batch()
  for (const r of rows.slice(i, i + 400)) {
    batch.set(db.collection("hymns").doc(r.id), { ...r.data, updatedAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(), updatedBy: "import" }, { merge: true })
  }
  await batch.commit()
}
await db.collection("auditLog").add({ actorUid: "import-script", actorName: "Import script", action: `Imported ${rows.length} hymns`, target: "from slide decks", at: FieldValue.serverTimestamp() })
console.log(`Imported ${rows.length} hymn(s) into ${projectId} as drafts.`)
