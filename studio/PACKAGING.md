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
- Notarizing (`dist:mac:signed`): `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, or
  `APPLE_KEYCHAIN_PROFILE` for a profile saved with `xcrun notarytool store-credentials`.
- `build/entitlements.mac.plist` allows Electron's JIT and lets the bundled converter load its own
  libraries under the hardened runtime.

### Notarizing and stapling (Mac)

`dist:mac:signed` turns off electron-builder's own notarizing and uses two hooks instead:
`scripts/notarize.cjs` notarizes the signed `.app` before the `.dmg` and `.zip` are made, and
`scripts/notarize-dmg.cjs` notarizes the finished `.dmg`. Each then **staples** the ticket to the
file, so Gatekeeper can check it without going online. The build stops at once if no notarizing
credentials are set.

Easiest: save the credentials in your keychain once (it asks for the app-specific password), then
name the profile when you build:

```bash
xcrun notarytool store-credentials hymn-studio --apple-id "<your Apple ID>" --team-id 25UVZGH7FC
APPLE_KEYCHAIN_PROFILE=hymn-studio npm run dist:mac:signed
```

- **Stapling needs a direct connection to Apple** (`api.apple-cloudkit.com`). Networks that inspect
  TLS, such as a work laptop's web filter, break it with `Error 68` or "Missing required
  extension". Notarizing itself usually still works there.
- If stapling fails, the build **keeps going** and prints the commands to run later. A failed
  notarization still stops the build.
- **Notarized but not stapled is fine for online users.** Gatekeeper asks Apple on first launch and
  the app opens normally. Only a Mac that's offline on first launch would be blocked.
- **To staple later**, on a home or other direct network (no new upload or password needed):

  ```bash
  xcrun stapler staple "release/mac-arm64/Exalto Hymn Studio.app"
  xcrun stapler staple "release/Exalto Hymn Studio-0.1.0-arm64.dmg"
  ```

  The `.zip` was made from the unstapled app; rebuild it (or the whole build) on that network if
  you ship the `.zip`.
- **To check:** `xcrun stapler validate "<file>"` says whether a ticket is stapled, and
  `spctl -a -vvv -t exec "<app>"` shows `source=Notarized Developer ID` once Apple has notarized it.
  `xcrun notarytool history --keychain-profile <profile>` lists past submissions.

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
