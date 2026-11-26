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

## Hymn assistant (AI chat)

On **Review score**, the right column has a **Score | Assistant** switch. The assistant answers
questions about the open hymn and proposes fixes, for example:

- "Measure 12 has the wrong note in the alto" → a note edit
- "The lyrics in verse 2 are misaligned" → syllable edits on the notes, or a corrected lyric line
- "Transpose to G" → one transpose edit (key and every note, spelled for the new key)
- "Why does the tempo sound slow?" → an answer, and a tempo edit if one helps

Each proposed edit is a card showing before → after. **Show** jumps to the measure, **Accept**
applies it, **Reject** drops it; nothing changes until you accept. Accepted score edits go into the
Review draft like a manual edit: **Undo** (⌘Z) and **Discard** take them back, and nothing is
written until you **Save**. Accepted lyric-line edits are saved to the hymn's lyrics right away and
the card offers **Undo**. Each edit is re-checked against the hymn when you accept it, so one that no
longer fits (you changed that note meanwhile) says why instead of applying.

It uses the API key saved in **Settings** (the same one as the AI spellcheck); the key stays in the
main process (`src/main/ai-chat.ts`) and only the conversation, a text summary of the hymn (notes,
syllables, lyrics, key/time/tempo, current measure) and the answer cross over. Gemini is the
default: it reads the key's model list and tries the newest Pro first, then Flash models newest
first when Google answers 503/429 or a model is retired. With only a Claude key it uses Claude Opus,
then Sonnet. No key, offline, a rejected key, rate limits and "every model is busy" each show their
own message. Model names, HTTP statuses and timings (never content or keys) go to
`<userData>/logs/ai-chat.log`.

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
