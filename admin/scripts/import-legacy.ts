/**
 * Import hymns from the legacy IDC Himnos app (database/himnos.js) into Firestore.
 * Existing hymn numbers are overwritten, not duplicated (doc id = idc-<number>).
 *
 *   npm run import-legacy -- ../../IDC-Himnos/database/himnos.js [--dry-run]
 *
 * Uses the same credentials/emulator env vars as scripts/set-role.ts.
 */
import { readFileSync } from "node:fs"
import vm from "node:vm"
import { applicationDefault, initializeApp } from "firebase-admin/app"
import { FieldValue, getFirestore } from "firebase-admin/firestore"

import { parseLegacyLyrics } from "../src/lib/lyrics.ts"

const [file, flag] = process.argv.slice(2)
if (!file) {
  console.error("Usage: npm run import-legacy -- <path/to/himnos.js> [--dry-run]")
  process.exit(1)
}
const dryRun = flag === "--dry-run"

type Legacy = { number: string; title: string; type?: string; body?: string }
const source = readFileSync(file, "utf8").replace(/export\s+const\s+data\s*=/, "data =")
const sandbox: { data?: Legacy[] } = {}
vm.runInNewContext(source, sandbox)
const hymns = (sandbox.data ?? []).filter((h) => h.title)

const rows = hymns.map((h) => ({
  // "17B" keeps its letter: id idc-17b, number 17, label "17B".
  id: `idc-${String(h.number).trim().toLowerCase()}`,
  data: {
    number: parseInt(String(h.number), 10),
    label: String(h.number).trim().toUpperCase(),
    title: h.title.trim(),
    hymnalId: "idc-himnario",
    language: "es",
    author: "",
    tags: [],
    lyrics: parseLegacyLyrics(h.body ?? ""),
    repeatChorus: false,
    status: h.body?.trim() ? "published" : "draft",
    recordingCount: 0,
  },
}))

const empty = rows.filter((r) => r.data.lyrics.length === 0)
console.log(`Parsed ${rows.length} hymns (${empty.length} with no lyrics, imported as drafts).`)
if (dryRun) {
  console.log(JSON.stringify(rows.slice(0, 2), null, 2))
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
await db.collection("hymns").doc("idc-NaN").delete()
await db.collection("auditLog").add({ actorUid: "import-script", actorName: "Import script", action: `Imported ${rows.length} hymns`, target: "from legacy app", at: FieldValue.serverTimestamp() })
console.log(`Imported ${rows.length} hymns into ${projectId}.`)
