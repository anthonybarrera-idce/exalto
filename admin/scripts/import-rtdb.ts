/**
 * Import a collection from the legacy IDC Himnos Realtime Database export into a hymnal.
 *
 *   curl -o canticos.json https://<legacy-db>.firebaseio.com/canticos.json
 *   npm run import-rtdb -- canticos.json canticos-espirituales cantico [--dry-run]
 *
 * Doc ids are <prefix>-<number> (a repeated number gets -b, -c…), so re-running updates in place.
 * Uses the same credentials/emulator env vars as scripts/set-role.ts.
 */
import { readFileSync } from "node:fs"
import { applicationDefault, initializeApp } from "firebase-admin/app"
import { FieldValue, getFirestore } from "firebase-admin/firestore"

import { parseLegacyBlocks, type LegacyBlock } from "../src/lib/lyrics.ts"

const [file, hymnalId, prefix, flag] = process.argv.slice(2)
if (!file || !hymnalId || !prefix) {
  console.error("Usage: npm run import-rtdb -- <export.json> <hymnalId> <idPrefix> [--dry-run]")
  process.exit(1)
}
const dryRun = flag === "--dry-run"

type Legacy = { number?: string | number; title?: string; blocks?: LegacyBlock[] }
const raw = JSON.parse(readFileSync(file, "utf8")) as Legacy[] | Record<string, Legacy>
const items = (Array.isArray(raw) ? raw : Object.values(raw)).filter((x): x is Legacy => Boolean(x?.blocks))

const seen = new Map<string, number>()
const rows = items.map((item) => {
  const { title, sections } = parseLegacyBlocks(item.blocks ?? [])
  const label = String(item.number ?? "").trim().toUpperCase()
  const base = `${prefix}-${label.toLowerCase() || "x"}`
  const n = (seen.get(base) ?? 0) + 1
  seen.set(base, n)
  const id = n === 1 ? base : `${base}-${String.fromCharCode(96 + n)}`
  return {
    id,
    data: {
      number: Number.parseInt(label, 10) || null,
      label,
      title: (item.title ?? title).trim(),
      hymnalId,
      language: "es",
      author: "",
      tags: [],
      lyrics: sections,
      repeatChorus: false,
      status: sections.length ? "published" : "draft",
      recordingCount: 0,
    },
  }
})

const dupes = [...seen].filter(([, n]) => n > 1).map(([k]) => k)
const empty = rows.filter((r) => r.data.lyrics.length === 0)
console.log(`Parsed ${rows.length} items for ${hymnalId} (${empty.length} with no lyrics → drafts; repeated numbers: ${dupes.join(", ") || "none"}).`)
if (dryRun) {
  console.log(JSON.stringify(rows.slice(1, 3), null, 2))
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
await db.collection("auditLog").add({ actorUid: "import-script", actorName: "Import script", action: `Imported ${rows.length} items`, target: `into ${hymnalId}`, at: FieldValue.serverTimestamp() })
console.log(`Imported ${rows.length} items into ${hymnalId} on ${projectId}.`)
