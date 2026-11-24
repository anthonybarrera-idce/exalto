# Exalto Hymn Studio (desktop)

Electron + React + Tailwind v4 + shadcn/ui (same theme tokens as `admin/`), with light, dark and
system themes. It drives the Python converter in `services/hymn-studio`.

```bash
cd studio
npm install
node node_modules/electron/install.js   # only if Electron's binary didn't download
npm run dev
```

Needs `services/hymn-studio/.venv` set up (`./run.sh` there once) and, for lyrics, `brew install tesseract tesseract-lang`.

Screens: Import (decks → convert) · Review score (page overlay, measure check, flagged notes) ·
Lyrics (edit, revert corrections, save) · Practice (S/A/T/B piano, solo/mute/volume, tempo) ·
Export (save files, send to admin as a draft via `admin`'s `import-hymns`).

`STUDIO_SNAPSHOT=<dir> npm start` screenshots every screen in light and dark, then quits.

## Uploading to Exalto (Firebase)

The Export screen uploads a processed hymn: lyrics go to `hymns/<hymnalId>-<slug>` in Firestore (new hymns
as drafts, with an audit-log entry), and the piano audio, voice tracks and MusicXML go to Storage under
`hymns/<id>/`. The hymn's `audioUri` is set so the mobile app plays the piano track.

Setup, once:
1. `cp .env.example .env.local` and fill in the admin's Firebase values.
2. Google Cloud console (same project as Firebase) → APIs & Services → Credentials → Create OAuth client ID →
   "Desktop app". Put its ID and secret in `.env.local` (`MAIN_VITE_GOOGLE_CLIENT_ID/SECRET`).
3. Deploy the Storage rules: `cd ../admin && firebase deploy --only storage`.

Sign-in opens your browser for Google; you need the editor or owner role (same as the admin).
To test locally, set `VITE_USE_EMULATORS=true` and run `cd ../admin && npm run emulators` (needs Java).

## App icon

`build/icon(.png|.icns)` (light) and `build/icon-dark(.png|.icns)` are drawn from `src/renderer/src/assets/exalto-mark.svg`. While Studio runs, the Dock icon follows the macOS appearance (System Settings → Appearance). To redraw them after the mark changes: `npm run icon`.
