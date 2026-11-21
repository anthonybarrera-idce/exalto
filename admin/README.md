# Exalto Admin

Web admin for the Exalto app: hymns, hymnals, composers, reports and users.
Vite + React + TypeScript + shadcn/ui, backed by Firebase (Auth, Firestore, Storage).

## Run it

```bash
npm install
cp .env.example .env.local   # fill in the Firebase web app config
npm run dev
```

Sign-in is Google. Only accounts with an admin role can get past the login page.

## Give someone admin access

Roles are Firebase Auth custom claims: `owner`, `editor` (hymns and content) or `moderator` (reports, users, requests).

```bash
GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json \
VITE_FIREBASE_PROJECT_ID=your-project \
npm run set-role -- someone@example.com owner
```

The person signs out and back in to pick up the role. Never commit the service-account key.

## Import the legacy IDC Himnos hymns

```bash
npm run import-legacy -- ../path/to/IDC-Himnos/database/himnos.js --dry-run
npm run import-legacy -- ../path/to/IDC-Himnos/database/himnos.js
```

Plain-text bodies are split into verse and chorus blocks. Hymns with no lyrics come in as drafts. Re-running updates the same documents (`idc-<number>`).

## Local emulators

Needs Java (`brew install openjdk`).

```bash
npm run emulators            # Auth, Firestore, Storage + UI at localhost:4000
npm run dev:emulated
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npm run set-role -- you@example.com owner
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run import-legacy -- …/himnos.js
```

## Deploy

```bash
npm run build
firebase deploy --only hosting,firestore:rules --project your-project
```

## Data model (Firestore)

- `hymns/{id}`: number, title, hymnalId, language, author, tags, lyrics (`{type, number?, lines[]}` like the mobile app), repeatChorus, status (`published|draft|review|hidden`), recordingCount, timestamps.
- `auditLog/{id}`: append-only record of every admin write.
- Rules: the app can read published hymns; owners and editors write content; audit entries must be attributed to the signed-in admin. See `firestore.rules`.
