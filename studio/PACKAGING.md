# Packaging Exalto Hymn Studio

The installers carry everything the music team needs: the app, and the hymn converter as a
standalone program (built with PyInstaller from `services/hymn-studio`). They don't need Python
or Node. Converted hymns are kept in the user's app-data folder:
- **Mac:** `~/Library/Application Support/Exalto Hymn Studio/decks`
- **Windows:** `%APPDATA%\Exalto Hymn Studio\decks`

## Before you build (once per computer)

1. **Node** 20 or newer: run `npm install` in `studio/`.
2. **The converter's Python environment:** in `services/hymn-studio`, create `.venv` and run
   `pip install -r requirements.txt pyinstaller`.
3. **Sign-in and Firebase settings** in `studio/.env.local`. They're baked into the app at build
   time, so installed copies don't need them. Never commit this file.
   - `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`,
     `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_APP_ID`
   - `MAIN_VITE_GOOGLE_CLIENT_ID`, `MAIN_VITE_GOOGLE_CLIENT_SECRET` (Google "Desktop app" OAuth
     client; it's a public client, so shipping it inside the app is expected)

PyInstaller can't cross-compile. **Build the Mac app on a Mac and the Windows app on Windows.**
A Mac build matches that Mac's chip: an Apple Silicon Mac makes an Apple Silicon (arm64) app.
For Intel Macs, build on an Intel Mac or with an Intel (x86_64) Python.

## Build

| What | Command (in `studio/`) | Output in `studio/release/` |
|---|---|---|
| Mac, unsigned (testing) | `CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist:mac` | `.dmg` and `.zip` |
| Mac, signed + notarized | `npm run dist:mac:signed` | `.dmg` and `.zip` |
| Windows | `npm run dist:win` | NSIS installer `.exe` |

`npm run converter` rebuilds only the converter (`services/hymn-studio/dist/hymn-cli`).

## Signing

Without signing, macOS says the app is from an unidentified developer (right-click → Open the first
time) and Windows SmartScreen warns. For the team, sign it. Credentials come only from
environment variables on the build computer; never put them in the repo.

**Mac** (Apple Developer Program, Developer ID Application certificate):
- Signing: the certificate in your login keychain is found automatically, or set `CSC_LINK`
  (path or base64 of the `.p12`) and `CSC_KEY_PASSWORD`.
- Notarizing (`dist:mac:signed`): `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.
- `build/entitlements.mac.plist` allows Electron's JIT and lets the bundled converter load its own
  libraries under the hardened runtime.

**Windows** (optional code-signing certificate): set `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD`.

## Tesseract (scanned slides only)

Tesseract reads lyrics from scanned slide images. PDFs with typed text and Google Slides with typed
lyrics don't need it. It isn't bundled (it's large and needs its language data). Studio looks for it
in the usual places and, if it's missing, explains how to install it in **Settings → Converter**.
- **Mac:** `brew install tesseract tesseract-lang`
- **Windows:** the UB Mannheim installer, with Spanish included
- **Elsewhere:** set `HYMN_TESSERACT` to the full path of the program

## What was verified

- **Mac (Apple Silicon), unsigned:** the app launches and shows the sign-in screen. The bundled
  converter alone converts a Finale PDF with no Python installed and a bare `PATH` (as when opened
  from Finder): tempo, key, measures, audio and `practice.json` all come out right.
- **Not verified:** signed and notarized Mac builds, Intel Mac builds, and the Windows build
  (needs a Windows PC).

## Known limits

- The installers are about 200 MB, mostly Electron plus the converter (numpy, scipy, music21).
- The converter prints a harmless music21 note about the optional matplotlib package.
- Hymns converted in development (`services/hymn-studio/storage/decks`) aren't moved
  automatically. Copy them into the app-data folder above if you want them in the installed app.
