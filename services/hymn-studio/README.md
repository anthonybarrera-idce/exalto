# Exalto Hymn Studio 🎵

An independent, 100% free and open-source service and Web Studio for extracting 4-part SATB vocal scores and lyrics from hymn sheet music, synthesizing individual acapella singing voices for each vocal part, and producing a mastered 4-part sacred acapella mix.

---

## Features

1. **Sheet Music & Lyric Extraction (OMR)**
   - Supports **MusicXML** (`.musicxml`, `.xml`), **MIDI** (`.mid`), **Digital PDFs**, and **Smartphone Photos / Scans** (`.png`, `.jpg`).
   - Extracts title, composer, key signature, meter, BPM, notes, durations, and aligned lyric syllables.
   - Built-in free local parser via `music21`, with optional Google AI Studio Gemini Flash free-tier integration for paper hymnal photos.

2. **SATB Voice Separation**
   - Automatically separates grand staff hymnal scores into 4 distinct vocal lines:
     - **Soprano (S)**: High melody line (C4–G5)
     - **Alto (A)**: Warm inner harmony (G3–D5)
     - **Tenor (T)**: Bright upper male harmony (C3–G4)
     - **Bass (B)**: Deep resonant bass foundation (E2–C4)
   - Synchronizes lyric syllables across parts.

3. **100% Free & Open-Source AI Acapella Singing Synthesis**
   - Uses acoustic source-filter formant synthesis modeled on human vocal tracts.
   - Distinct vowel formants (`/a/`, `/e/`, `/i/`, `/o/`, `/u/`) and voice profiles for each part.
   - Delayed natural vibrato (~5 Hz) and human portamento.
   - **Zero API fees and zero GPU required**.

4. **Multi-Track Stem & Sacred Acoustics Mixing**
   - Produces **5 audio deliverables**:
     - `soprano.wav`: Isolated Soprano solo acapella stem
     - `alto.wav`: Isolated Alto solo acapella stem
     - `tenor.wav`: Isolated Tenor solo acapella stem
     - `bass.wav`: Isolated Bass solo acapella stem
     - `satb_mix.wav`: Full 4-part SATB mix with stereo placement (S: 30%L, A: 30%R, T: 15%L, B: 15%R) and cathedral convolution reverb.

5. **Interactive Web Studio UI & DAW Player**
   - Drag-and-drop sheet music upload zone.
   - Live multi-stage progress tracking.
   - Interactive 5-track stem player with **Solo (S)**, **Mute (M)**, and individual volume sliders.
   - Quick rehearsal presets: *"Quartet Mix"*, *"Solo Soprano"*, *"Solo Alto"*, *"Solo Tenor"*, *"Solo Bass"*, and *"Practice Alto"* (features Alto at 100% with other 3 parts at 25% background harmony).
   - One-click downloads for all stems.

---

## Quick Start

### 1. Launch the Web Studio UI
From the repository root:
```bash
cd services/hymn-studio
./run.sh
```
Then open your browser to **http://localhost:8000**.

### 2. Run via CLI
To process a sheet music file directly from the command line:
```bash
cd services/hymn-studio
PYTHONPATH=. .venv/bin/python3 -m hymn_processor.cli process \
  --input samples/doxology.musicxml \
  --out ./storage/my_output
```

### 3. Run Automated Tests
```bash
cd services/hymn-studio
PYTHONPATH=. .venv/bin/pytest tests/ -v
```

---

## REST API Endpoints

- `GET /`: Serves the Web Studio browser interface.
- `POST /api/upload`: Uploads a sheet music file and enqueues the 4-stage pipeline.
- `POST /api/load-sample`: Immediately loads and processes the included Doxology SATB score.
- `GET /api/tasks/{task_id}`: Polls real-time progress and status.
- `GET /api/hymns/{hymn_id}/metadata`: Retrieves parsed notes, meter, and lyrics JSON.
- `GET /api/hymns/{hymn_id}/audio/{stem_name}`: Streams or downloads stem audio (`soprano`, `alto`, `tenor`, `bass`, `mix`).

---

## Slide decks → piano score, audio and lyrics (batch)

Convert hymn slide decks (Google Slides links or `.pptx`, one scanned page per slide) into a
piano MusicXML, a MIDI file, piano audio (`-piano.wav` / `.m4a`) and Exalto admin lyrics:

```bash
cd services/hymn-studio
PYTHONPATH=. .venv/bin/python -m hymn_processor.cli deck "<slides link or deck.pptx or list.txt>" --out storage/decks
```

- `--engine local` (default) is a free, offline reader for engraved 7-shape (Aikin) SATB pages
  (`hymn_processor/shape_omr.py`). Pitch comes from staff position and is cross-checked
  against each notehead's shape; mismatches are listed in `WARNINGS.txt`.
- `--engine claude` / `--engine gemini` use a vision model instead (paid / API key needed).
- `--tempo 80` sets the speed when the music doesn't print one; `--no-audio` skips audio.
- Set `FLUIDSYNTH_SOUNDFONT=/path/piano.sf2` (with `fluidsynth` installed) for a realistic piano;
  otherwise a built-in synthesizer is used.
- Lyrics are read offline with Tesseract (`brew install tesseract tesseract-lang`); hymns import as drafts so OCR typos get reviewed.
- Import lyrics into the admin: `cd admin && npm run import-hymns -- ../services/hymn-studio/storage/decks/hymns.json`.
- Debug a page: `PYTHONPATH=. .venv/bin/python scripts/omr_debug.py page.png overlay.png`.
