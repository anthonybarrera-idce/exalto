"""Batch-convert hymn slide decks into piano MusicXML and Exalto admin lyrics.

For every deck (Google Slides link or .pptx):
  1. read the slides and group them into hymns and verses by slide heading,
  2. transcribe each distinct page image (SATB notes + lyrics) with Claude vision
     (or Gemini with --engine gemini),
  3. join the pages into one piano score (grand staff: S/A on treble, T/B on bass),
  4. write the lyrics in the admin editor's text format and as hymn JSON.

Transcriptions are cached by image hash, so re-runs and repeated pages are free.
"""

from __future__ import annotations

import json
import os
import time
import re
import shutil
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from music21 import clef, instrument, key, layout, metadata, meter, note, stream, tempo, tie

from .slides import DeckHymn, SlidePage, VerseSlides, download_deck, group_hymns, is_url, read_pptx

VOICES = ("soprano", "alto", "tenor", "bass")
ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"]
GEMINI_MODELS = ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.8-flash"]

PAGE_PROMPT = """
You are transcribing one page of a 4-part SATB hymn (a scanned slide). Read every
system and measure on the page, left to right, top to bottom.

Notes:
- Noteheads may be SHAPE NOTES (triangles, squares, diamonds, ovals...). The shape
  does not change the pitch: read pitch only from the staff position, the clef and
  the key signature (apply its flats/sharps), plus any printed accidentals.
- Treble staff: stems up = soprano, stems down = alto. A notehead with stems both
  ways, or a single note where the other voice has none, belongs to both voices.
  Bass staff: stems up = tenor, stems down = bass, same rule.
- dur is in quarter notes: eighth 0.5, quarter 1, dotted quarter 1.5, half 2,
  dotted half 3, whole 4. Rests use pitch "REST".
- tie is "start", "stop", "continue" or null for tied notes (not slurs).
- Put each sung syllable on the soprano note it sits under, without hyphens or
  underscores, and give syllabic as "single", "begin", "middle" or "end".
  Melismas (slurred notes) get no syllable after the first note.
- If the first measure on the page is incomplete (a pickup), set "pickup": true.

Lyrics: "lyric_lines" holds each printed line of text as natural words (join
syllables, turn "la_mu" elisions into "la mu"), with the printed punctuation.

Header: only if printed on this page, give the title and the credits exactly as
printed (composer/author, translator). Ignore publisher or website footers.

Return only JSON:
{
  "title": "string or null",
  "credits": ["Author name", "Tr. Translator name"],
  "key_fifths": -1,
  "time_signature": "4/4",
  "tempo_bpm": null,
  "measures": [
    {"pickup": false,
     "soprano": [{"pitch": "A4", "dur": 0.5, "tie": null, "syllable": "Tú", "syllabic": "single"}],
     "alto":    [{"pitch": "F4", "dur": 0.5, "tie": null}],
     "tenor":   [{"pitch": "C4", "dur": 0.5, "tie": null}],
     "bass":    [{"pitch": "F3", "dur": 0.5, "tie": null}]}
  ],
  "lyric_lines": ["Tú eres ..."]
}
"""

Transcriber = Callable[[SlidePage], dict]


@dataclass
class HymnResult:
    title: str
    slug: str
    out_dir: Path
    files: dict[str, Path] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)


# --------------------------------------------------------------------------- helpers

def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "hymn"


def load_env_file(path: Path) -> None:
    """Load KEY=VALUE pairs from the service .env without overriding the real environment."""
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def to_m21_pitch(p: str) -> str:
    """'Bb3' -> 'B-3', 'F#4' stays."""
    m = re.fullmatch(r"\s*([A-Ga-g])(##|#|bb|b|--|-|n)?(-?\d)\s*", p)
    if not m:
        raise ValueError(f"Bad pitch: {p!r}")
    acc = (m.group(2) or "").replace("b", "-").replace("n", "")
    return f"{m.group(1).upper()}{acc}{m.group(3)}"


def clean_line(line: str) -> str:
    line = line.replace("_", " ")
    line = re.sub(r"\s*-\s*", "", line) if re.search(r"\w\s*-\s*\w", line) else line
    return re.sub(r"\s+", " ", line).strip()


def _strip_fences(text: str) -> str:
    text = text.strip()
    text = re.sub(r"^```(?:json)?", "", text).strip()
    return re.sub(r"```$", "", text).strip()


# --------------------------------------------------------------------------- transcription

def gemini_transcriber(api_key: str) -> Transcriber:
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)

    def transcribe(page: SlidePage) -> dict:
        mime = "image/jpeg" if page.image_ext in ("jpg", "jpeg") else f"image/{page.image_ext}"
        last_err: Exception | None = None
        for attempt, model in enumerate(m for _ in range(3) for m in GEMINI_MODELS):
            if attempt >= len(GEMINI_MODELS):
                time.sleep(min(30, 5 * attempt))  # back off when every model is busy (503/429)
            try:
                resp = client.models.generate_content(
                    model=model,
                    contents=[types.Part.from_bytes(data=page.image, mime_type=mime), PAGE_PROMPT],
                    config=types.GenerateContentConfig(response_mime_type="application/json", temperature=0.0),
                )
                if resp and resp.text:
                    return json.loads(_strip_fences(resp.text))
            except Exception as e:  # try the next model
                last_err = e
        raise RuntimeError(f"Gemini could not transcribe slide {page.index}: {last_err}")

    return transcribe


_NOTE = {
    "type": "object",
    "properties": {
        "pitch": {"type": "string", "description": "Scientific pitch like 'Bb3', 'F#4', or 'REST'"},
        "dur": {"type": "number", "description": "Duration in quarter notes"},
        "tie": {"anyOf": [{"type": "string", "enum": ["start", "stop", "continue"]}, {"type": "null"}]},
        "syllable": {"anyOf": [{"type": "string"}, {"type": "null"}]},
        "syllabic": {"anyOf": [{"type": "string", "enum": ["single", "begin", "middle", "end"]}, {"type": "null"}]},
    },
    "required": ["pitch", "dur", "tie", "syllable", "syllabic"],
    "additionalProperties": False,
}
_VOICE = {"type": "array", "items": _NOTE}
PAGE_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"anyOf": [{"type": "string"}, {"type": "null"}]},
        "credits": {"type": "array", "items": {"type": "string"}},
        "key_fifths": {"type": "integer"},
        "time_signature": {"type": "string"},
        "tempo_bpm": {"anyOf": [{"type": "number"}, {"type": "null"}]},
        "measures": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"pickup": {"type": "boolean"}, **{v: _VOICE for v in VOICES}},
                "required": ["pickup", *VOICES],
                "additionalProperties": False,
            },
        },
        "lyric_lines": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["title", "credits", "key_fifths", "time_signature", "tempo_bpm", "measures", "lyric_lines"],
    "additionalProperties": False,
}

CLAUDE_MODEL = "claude-opus-5-5"
CLAUDE_EXTRA = """
Work carefully, one measure at a time. For every notehead, count its position
against the five staff lines before naming the pitch (treble lines bottom→top:
E4 G4 B4 D5 F5; bass lines bottom→top: G2 B2 D3 F3 A3). Do not assume a melody
moves; repeated notes are common in hymns. Check that each voice's durations in a
measure add up to the time signature (except a pickup).
"""


def claude_transcriber(model: str = CLAUDE_MODEL) -> Transcriber:
    """Transcribe a page with Claude vision and a strict JSON schema for the output."""
    import base64

    import anthropic

    client = anthropic.Anthropic()  # ANTHROPIC_API_KEY or an `ant auth login` profile

    def transcribe(page: SlidePage) -> dict:
        mime = "image/jpeg" if page.image_ext in ("jpg", "jpeg") else f"image/{page.image_ext}"
        with client.beta.messages.stream(
            model=model,
            max_tokens=64000,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            output_config={"effort": "high", "format": {"type": "json_schema", "schema": PAGE_SCHEMA}},
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": mime,
                                                 "data": base64.standard_b64encode(page.image).decode()}},
                    {"type": "text", "text": PAGE_PROMPT + CLAUDE_EXTRA},
                ],
            }],
        ) as stream:
            msg = stream.get_final_message()
        if msg.stop_reason == "refusal":
            raise RuntimeError(f"Claude declined slide {page.index}")
        if msg.stop_reason == "max_tokens":
            raise RuntimeError(f"Claude ran out of output tokens on slide {page.index}")
        text = next(b.text for b in msg.content if b.type == "text")
        return json.loads(text)

    return transcribe


def local_transcriber() -> Transcriber:
    """Free, offline reader for engraved shape-note pages (see shape_omr.py)."""
    from .shape_omr import read_page

    def transcribe(page: SlidePage) -> dict:
        return read_page(page.image, chars=page.chars or None)

    return transcribe


def join_split_measures(measures: list[dict], bar: float) -> list[dict]:
    """A measure cut by a page or system break shows up as two short measures: rejoin them."""
    def beats(m):
        return sum(float(n.get("dur") or 0) for n in m.get("soprano", []))

    out: list[dict] = []
    for m in measures:
        if out and 0 < beats(out[-1]) < bar and 0 < beats(m) < bar and abs(beats(out[-1]) + beats(m) - bar) < 1e-6 \
                and not (len(out) == 1 and out[0].get("pickup")):
            prev = out[-1]
            for v in VOICES:
                prev[v] = prev.get(v, []) + m.get(v, [])
            continue
        out.append({**m, **{v: list(m.get(v, [])) for v in VOICES}})
    return out


def cached(transcriber: Transcriber, cache_dir: Path, use_cache: bool = True) -> Transcriber:
    cache_dir.mkdir(parents=True, exist_ok=True)

    def run(page: SlidePage) -> dict:
        f = cache_dir / f"{page.sha}.json"
        if use_cache and f.exists():
            return json.loads(f.read_text())
        data = transcriber(page)
        f.write_text(json.dumps(data, ensure_ascii=False, indent=2))
        return data

    return run


# --------------------------------------------------------------------------- score building

def _bar_length(ts: str) -> float:
    num, den = (int(x) for x in ts.split("/"))
    return num * 4 / den


def _measure_beats(m: dict) -> float:
    return sum(float(n.get("dur") or 0) for n in m.get("soprano", []))


def choose_time_signature(pages: list[dict]) -> tuple[str, str | None]:
    """The hymn's time signature: the printed one when the measures agree with it, otherwise
    what most measures add up to. Returns (time signature, warning or None).

    The local reader marks a printed one with time_found (False means 4/4 is just a default);
    other transcribers always state one.
    """
    first = pages[0] if pages else {}
    printed = str(first.get("time_signature") or "") if first.get("time_found", True) else ""
    printed = printed if re.fullmatch(r"\d+/\d+", printed) else ""
    # Most measures fill the bar; pickups, page-split halves and misreads are the minority.
    counts: dict[float, int] = {}
    measures = [m for p in pages for m in p.get("measures", [])]
    for m in measures:
        b = round(_measure_beats(m), 3)
        if b > 0:
            counts[b] = counts.get(b, 0) + 1
    common = max(counts, key=lambda b: (counts[b], b), default=None)
    clear = common is not None and counts[common] >= max(3, 0.5 * len(measures))
    if printed and (not clear or abs(_bar_length(printed) - common) < 1e-6):
        return printed, None
    if not clear:
        return printed or "4/4", None
    den = int(printed.split("/")[1]) if printed else 4
    num = common * den / 4
    if abs(num - round(num)) > 1e-6:  # e.g. 1.5 beats: count in eighths
        den, num = 8, common * 2
    inferred = f"{int(round(num))}/{den}"
    if printed:
        return inferred, (f"Time signature read as {printed}, but most measures have {common:g} beats: "
                          f"using {inferred} (check it).")
    return inferred, None


def set_time_signature(pages: list[dict], ts: str) -> None:
    """Record the hymn's time signature on every page and re-mark the opening pickup by it."""
    bar = _bar_length(ts)
    for i, pg in enumerate(pages):
        pg["time_signature"] = ts
        if i == 0 and pg.get("measures"):
            first = pg["measures"][0]
            first["pickup"] = 0 < _measure_beats(first) < bar - 1e-6


def _make_note(item: dict) -> note.GeneralNote:
    dur = float(item.get("dur") or item.get("beat_duration") or 1.0)
    pitch = str(item.get("pitch", "REST"))
    if pitch.upper() == "REST":
        return note.Rest(quarterLength=dur)
    n = note.Note(to_m21_pitch(pitch), quarterLength=dur)
    if item.get("tie") in ("start", "stop", "continue"):
        n.tie = tie.Tie(item["tie"])
    return n


def _add_lyric(n: note.GeneralNote, item: dict, number: int) -> None:
    syl = (item.get("syllable") or item.get("lyric") or "").strip().strip("-_").strip()
    if syl and isinstance(n, note.Note):
        syllabic = item.get("syllabic") if item.get("syllabic") in ("single", "begin", "middle", "end") else "single"
        n.lyrics.append(note.Lyric(text=syl, number=number, syllabic=syllabic))


def build_piano_score(title: str, credits: list[str], pages: list[dict], extra_verses: list[list[dict]]) -> stream.Score:
    """Join transcribed pages into a piano grand staff (S/A treble, T/B bass).

    extra_verses: for verses 2+, their transcribed pages; their soprano syllables are
    added as lyric lines 2, 3, ... on the matching soprano notes.
    """
    first = pages[0]
    fifths = int(first.get("key_fifths") or 0)
    ts = str(first.get("time_signature") or "4/4")
    bpm = float(first.get("tempo_bpm") or 80)

    score = stream.Score()
    score.metadata = metadata.Metadata(title=title)
    if credits:
        score.metadata.composer = "; ".join(credits)

    rh, lh = stream.PartStaff(id="RH"), stream.PartStaff(id="LH")
    rh.insert(0, instrument.Piano())
    lh.insert(0, instrument.Piano())

    bar = _bar_length(ts)
    measures = join_split_measures([m for p in pages for m in p.get("measures", [])], bar)
    extra = [join_split_measures([m for p in v for m in p.get("measures", [])], bar) for v in extra_verses]

    for i, meas in enumerate(measures, start=1):
        mr, ml = stream.Measure(number=i), stream.Measure(number=i)
        if i == 1:
            for m_, c in ((mr, clef.TrebleClef()), (ml, clef.BassClef())):
                m_.append([c, key.KeySignature(fifths), meter.TimeSignature(ts)])
            mr.insert(0, tempo.MetronomeMark(number=bpm))
        for m_, (upper, lower) in ((mr, ("soprano", "alto")), (ml, ("tenor", "bass"))):
            for vid, part in ((1, upper), (2, lower)):
                # Voices are numbered across the whole piano part (S 1, A 2, T 3, B 4): readers
                # link lyric syllables per voice number, so a shared "1" would chain the tenor's
                # words onto the soprano's and draw stray hyphens under the bass staff.
                v = stream.Voice(id=str(vid if part in ("soprano", "alto") else vid + 2))
                for j, item in enumerate(meas.get(part, [])):
                    n = _make_note(item)
                    if part == "soprano":
                        _add_lyric(n, item, 1)
                        for vn, verse_measures in enumerate(extra, start=2):
                            if i - 1 < len(verse_measures):
                                sop = verse_measures[i - 1].get("soprano", [])
                                if j < len(sop):
                                    _add_lyric(n, sop[j], vn)
                    elif part == "tenor" and (item.get("syllable") or "").strip():
                        _add_lyric(n, item, 1)  # the lower voices' own words (an echo in the chorus)
                    v.append(n)
                m_.insert(0, v)
        if i == 1 and meas.get("pickup"):
            mr.padAsAnacrusis()
            ml.padAsAnacrusis()
        rh.append(mr)
        lh.append(ml)

    rh.makeBeams(inPlace=True)
    lh.makeBeams(inPlace=True)
    score.insert(0, rh)
    score.insert(0, lh)
    score.insert(0, layout.StaffGroup([rh, lh], name="Piano", abbreviation="Pno.", symbol="brace"))
    return score


# --------------------------------------------------------------------------- lyrics

# Short words a line shouldn't end on ("…de / la tierra" reads badly).
_WEAK_ENDS = {
    "a", "al", "con", "de", "del", "el", "en", "la", "las", "lo", "los", "mi", "mis", "por", "que",
    "se", "su", "sus", "te", "tu", "tus", "un", "una", "y", "o", "me", "nos", "le", "para", "sin",
    "este", "esta", "estos", "estas", "ese", "esa", "aquel", "gran", "santo", "santa", "nuestro", "nuestra",
    "the", "of", "and", "to", "my", "thy", "in", "on", "for", "with", "his", "our", "your", "an", "this", "that",
}


def balance_lines(lines: list[str], max_len: int = 44) -> list[str]:
    """Reflow a verse's words into lines of even length, no longer than max_len where possible.

    Prefers breaking after punctuation and never after a short word like "de" or "la", so the
    lines read like the printed hymn rather than wherever the music's systems happened to end.
    The same rules run in Studio's "Even out lines" (studio/src/renderer/src/lib/lyric-blocks.ts).
    """
    words = " ".join(lines).split()
    if not words:
        return []
    total = len(" ".join(words))
    if total <= max_len:
        return [" ".join(words)]
    best: tuple[float, list[str]] | None = None
    n0 = max(1, -(-total // max_len))
    for n in (n0, n0 + 1, n0 + 2):
        if n > len(words):
            break
        target = total / n
        # cost[i][k]: best cost of words[:i] in k lines
        INF = float("inf")
        cost = [[INF] * (n + 1) for _ in range(len(words) + 1)]
        back = [[0] * (n + 1) for _ in range(len(words) + 1)]
        cost[0][0] = 0.0
        for i in range(1, len(words) + 1):
            for j in range(i - 1, -1, -1):
                length = len(" ".join(words[j:i]))
                if length > max_len and i - j > 1:
                    break
                c = ((length - target) / target) ** 2 * 100
                # A sentence ending inside a line: the next sentence should start a line.
                c += 60 * sum(1 for w in words[j : i - 1] if re.search(r"[.!?]$", w))
                last = words[i - 1]
                if i < len(words):
                    if re.search(r"[.!?;:]$", last):
                        c -= 50
                    elif last.endswith(","):
                        c -= 30
                    elif last.lower().strip("¡¿\"“") in _WEAK_ENDS:
                        c += 40
                for k in range(1, n + 1):
                    if cost[j][k - 1] + c < cost[i][k]:
                        cost[i][k], back[i][k] = cost[j][k - 1] + c, j
        if cost[len(words)][n] == INF:
            continue
        out, i = [], len(words)
        for k in range(n, 0, -1):
            j = back[i][k]
            out.append(" ".join(words[j:i]))
            i = j
        score = cost[len(words)][n] / n
        if best is None or score < best[0]:
            best = (score, out[::-1])
    return best[1] if best else [" ".join(words)]


def verse_lines(pages: list[dict]) -> list[str]:
    lines: list[str] = []
    for p in pages:
        raw = p.get("lyric_lines") or []
        if not raw:  # rebuild from soprano syllables
            words, cur = [], ""
            for m in p.get("measures", []):
                for it in m.get("soprano", []):
                    syl = (it.get("syllable") or "").strip()
                    if not syl:
                        continue
                    cur += syl
                    if it.get("syllabic") in (None, "single", "end"):
                        words.append(cur)
                        cur = ""
            raw = [" ".join(words)] if words else []
        lines.extend(clean_line(l) for l in raw if clean_line(l))
    return balance_lines(lines)


def admin_text(sections: list[dict]) -> str:
    """Plain text for the admin hymn editor's Text tab (parseLegacyLyrics format)."""
    blocks = []
    for s in sections:
        head = "Coro" if s["type"] == "chorus" else ROMAN[s["number"] - 1]
        blocks.append("\n".join([head, *s["lines"]]))
    return "\n\n".join(blocks) + "\n"


# --------------------------------------------------------------------------- pipeline

def convert_hymn(
    hymn: DeckHymn,
    transcribe: Transcriber,
    out_root: Path,
    hymnal_id: str,
    language: str,
    log: Callable[[str], None] = print,
    tempo: float = 80,
    render_audio: bool = True,
    correct_lyrics: bool = True,
    slug: str | None = None,
    keep_extra: list[list[dict]] | None = None,
) -> HymnResult:
    """Convert one hymn. `slug` keeps an existing folder's name (reprocessing); `keep_extra` adds
    verse transcriptions already made, for verses whose slide images weren't kept."""
    slug = slug or slugify(hymn.title)
    res = HymnResult(title=hymn.title, slug=slug, out_dir=out_root / slug)
    res.out_dir.mkdir(parents=True, exist_ok=True)

    music_shas = [p.sha for p in hymn.music_pages]
    log(f"  • {len(hymn.music_pages)} score pages, {len(hymn.verses)} verse group(s)")
    pages = []
    (res.out_dir / "pages").mkdir(exist_ok=True)
    # A re-run may have fewer slides (e.g. the chorus is now kept once): drop the old run's images.
    for old in (res.out_dir / "pages").iterdir():
        if re.fullmatch(r"(page\d+|verse\d+-\d+)\.\w+", old.name):
            old.unlink()
    for n, p in enumerate(hymn.music_pages, start=1):
        log(f"    transcribing slide {p.index} …")
        (res.out_dir / "pages" / f"page{n}.{p.image_ext}").write_bytes(p.image)
        pages.append(transcribe(p))

    # Only verses whose slides differ from verse 1 carry new lyrics.
    extra_pages: list[list[dict]] = []
    for v in hymn.verses[1:]:
        shas = [p.sha for p in v.pages]
        if set(shas) <= set(music_shas):
            res.warnings.append(
                f"Verse {v.number} slides are the same images as verse 1 — no separate lyrics for it in this deck."
            )
            continue
        # Keep the verse's slides too, so the hymn can be read again later (reprocess with AI).
        for k, p in enumerate(v.pages, start=1):
            (res.out_dir / "pages" / f"verse{v.number}-{k}.{p.image_ext}").write_bytes(p.image)
        extra_pages.append([transcribe(p) for p in v.pages])
    if keep_extra:
        extra_pages += keep_extra

    # Words split across systems or pages ("Evan-" / "gelio") become whole words first.
    from .lyrics_fix import join_broken_words, join_syllables_across_pages

    for group in [pages, *extra_pages]:
        join_broken_words(group)
        join_syllables_across_pages(group)

    corrections: list[dict] = []
    if correct_lyrics:
        from .lyrics_fix import correct_page

        for pg in pages + [p for v in extra_pages for p in v]:
            if pg.get("exact_lyrics"):
                continue  # typed text from the PDF itself: nothing to correct
            for old, new in correct_page(pg):
                corrections.append({"from": old, "to": new})
                res.warnings.append(f"Lyrics corrected: '{old}' → '{new}' (check it).")

    title = next((p.get("title") for p in pages if p.get("title")), None) or hymn.title
    credits = next((p.get("credits") for p in pages if p.get("credits")), []) or []
    credits = [c for c in credits if c and not re.search(r"\.com|productions", c, re.I)]

    ts, ts_warning = choose_time_signature(pages)
    if ts_warning:
        res.warnings.append(ts_warning)
    for group in [pages, *extra_pages]:
        set_time_signature(group, ts)
    bar = _bar_length(ts)
    res.warnings += measure_warnings(pages)

    bpm = float(next((p.get("tempo_bpm") for p in pages if p.get("tempo_bpm")), None) or tempo)
    pages[0]["tempo_bpm"] = bpm
    score = build_piano_score(title, credits, pages, extra_pages)
    xml_path = res.out_dir / f"{res.slug}.musicxml"
    score.write("musicxml", fp=str(xml_path))
    res.files["musicxml"] = xml_path
    mid_path = res.out_dir / f"{res.slug}.mid"
    score.write("midi", fp=str(mid_path))
    res.files["midi"] = mid_path
    if render_audio:
        from .piano_render import render

        rendered, engine_used = render(xml_path, mid_path, res.out_dir / f"{res.slug}-piano.wav", bpm=bpm)
        for name, wav in rendered.items():
            key = "piano_wav" if name == "all" else f"piano_{name}_wav"
            res.files[key] = wav
            if wav.with_suffix(".m4a").exists():
                res.files[key.replace("_wav", "_m4a")] = wav.with_suffix(".m4a")
        log(f"  • piano audio ({engine_used}): all voices + soprano, alto, tenor, bass")
        from .piano_render import render_tones

        for name, wav in render_tones(xml_path, res.out_dir, res.slug, bpm=bpm).items():
            res.files["tone_wav" if name == "all" else f"tone_{name}_wav"] = wav

    # Verse 1 is sung on the score's verse pages, the chorus on the rest; verses 2+ come from
    # their own slides (they only cover the verse part of the score).
    n_verse = len(hymn.verse_pages) if hymn.chorus else len(pages)
    sections = [{"type": "verse", "number": 1, "lines": verse_lines(pages[:n_verse])}]
    if hymn.chorus:
        sections.append({"type": "chorus", "lines": verse_lines(pages[n_verse:])})
    for n, vp in enumerate(extra_pages, start=2):
        sections.append({"type": "verse", "number": n, "lines": verse_lines(vp)})
    sections = [s for s in sections if s["lines"]]

    txt_path = res.out_dir / "lyrics.txt"
    txt_path.write_text(admin_text(sections))
    res.files["lyrics_txt"] = txt_path

    hymn_doc = {
        "id": res.slug,
        "title": title,
        "hymnalId": hymnal_id,
        "language": language,
        "author": "; ".join(credits),
        "tags": [],
        "lyrics": sections,
        "repeatChorus": hymn.chorus_times > 1,
        "status": "draft",
        "recordingCount": 0,
        # (chorusPages: how many of the score's pages are the chorus, so a re-read keeps the split)
        "source": {"slides": sorted({p.index for v in hymn.verses for p in v.pages} | {p.index for p in hymn.chorus}),
                   "chorusPages": len(hymn.chorus)},
    }
    json_path = res.out_dir / "hymn.json"
    json_path.write_text(json.dumps(hymn_doc, ensure_ascii=False, indent=2))
    res.files["hymn_json"] = json_path

    (res.out_dir / "transcription.json").write_text(
        json.dumps({"pages": pages, "extra_verses": extra_pages}, ensure_ascii=False, indent=2)
    )
    from .practice import FILE_NAME as PRACTICE_FILE, build_practice, dumps as practice_dumps

    practice_path = res.out_dir / PRACTICE_FILE  # notes for the mobile app's practice screen
    practice_path.write_text(practice_dumps(build_practice(pages, extra_pages, title=title, bpm=bpm)))
    res.files["practice_json"] = practice_path
    for pi, p in enumerate(pages, start=1):
        for r in p.get("review", []):
            res.warnings.append(f"Page {pi}: notehead at x={r['x']}, y={r['y']} ({r['pitch']}) doesn't match its shape — check it.")
    (res.out_dir / "review.json").write_text(json.dumps({
        "title": title,
        "bpm": bpm,
        "measures": len(join_split_measures([m for p in pages for m in p.get("measures", [])], bar)),
        "key_fifths": pages[0].get("key_fifths", 0),
        "time_signature": ts,
        "corrections": corrections,
        "flagged": [dict(r, page=i) for i, p in enumerate(pages, start=1) for r in p.get("review", [])],
        "warnings": res.warnings,
        "files": {k: v.name for k, v in res.files.items()},
    }, ensure_ascii=False, indent=2))
    warn = res.out_dir / "WARNINGS.txt"
    if res.warnings:
        warn.write_text("\n".join(res.warnings) + "\n")
    else:
        warn.unlink(missing_ok=True)  # don't leave an older run's warnings behind
    return res


_PAGE_IMG = re.compile(r"^(?:page(\d+)|verse(\d+)-(\d+))\.(png|jpe?g)$", re.I)
# Details people set in Studio (Details page) that a new reading must not overwrite.
_KEEP_DETAILS = ("title", "hymnalId", "number", "label", "author", "language", "tags", "repeatChorus", "status", "source")


def reprocess_hymn(
    hymn_dir: str | Path,
    engine: str,
    api_key: str | None = None,
    correct_lyrics: bool = True,
    log: Callable[[str], None] = print,
    render_audio: bool = True,
    transcriber: Transcriber | None = None,
) -> HymnResult:
    """Read an imported hymn again from its saved slide images with another reader (Claude or
    Gemini vision), keeping its folder, file names and the details set in Studio.

    The previous hymn.json, lyrics.txt, transcription.json and review.json are copied to
    .before-reprocess/ first. Verses imported before their slides were kept keep their old lyrics.
    """
    d = Path(hymn_dir)
    if not (d / "review.json").exists() or not (d / "transcription.json").exists():
        raise ValueError(f"{d} isn't an imported hymn with music")
    old_doc = json.loads((d / "hymn.json").read_text())
    old_t = json.loads((d / "transcription.json").read_text())
    old_review = json.loads((d / "review.json").read_text())

    music: list[tuple[int, Path]] = []
    verses: dict[int, list[tuple[int, Path]]] = {}
    for f in (d / "pages").iterdir() if (d / "pages").exists() else []:
        m = _PAGE_IMG.match(f.name)
        if not m:
            continue
        if m.group(1):
            music.append((int(m.group(1)), f))
        else:
            verses.setdefault(int(m.group(2)), []).append((int(m.group(3)), f))
    if not music:
        raise ValueError("No saved slide images to read again")
    page = lambda i, f: SlidePage(index=i, heading=old_doc.get("title") or d.name, image=f.read_bytes(),
                                  image_ext=f.suffix.lstrip(".").lower())
    deck_verses = [VerseSlides(1, [page(i, f) for i, f in sorted(music)])]
    for v in sorted(verses):
        deck_verses.append(VerseSlides(v, [page(100 * v + i, f) for i, f in sorted(verses[v])]))
    # Verses whose slides weren't saved (imported before that): keep their earlier reading.
    old_extra = old_t.get("extra_verses") or []
    keep = old_extra[len(verses):] if len(old_extra) > len(verses) else []

    backup = d / ".before-reprocess"
    backup.mkdir(exist_ok=True)
    for name in ("hymn.json", "lyrics.txt", "transcription.json", "review.json"):
        if (d / name).exists():
            shutil.copy2(d / name, backup / name)

    if transcriber is None:
        transcriber = make_transcriber(engine, api_key)
    transcribe = cached(transcriber, d.parent / ".cache" / engine, True)
    hymn = DeckHymn(title=old_doc.get("title") or old_review.get("title") or d.name, verses=deck_verses)
    n_chorus = int((old_doc.get("source") or {}).get("chorusPages") or 0)
    if 0 < n_chorus < len(deck_verses[0].pages):  # the score's last pages are the chorus
        hymn.chorus = deck_verses[0].pages[-n_chorus:]
        deck_verses[0].pages = deck_verses[0].pages[:-n_chorus]
        hymn.chorus_times = 2 if old_doc.get("repeatChorus") else 1
    log(f"  ♪ {hymn.title} — reading again with {engine}")
    tempo = float(old_review.get("bpm") or 80)
    res = convert_hymn(hymn, transcribe, d.parent, old_doc.get("hymnalId", "community"), old_doc.get("language", "es"),
                       log, tempo=tempo, render_audio=render_audio, correct_lyrics=correct_lyrics,
                       slug=d.name, keep_extra=keep)

    # Keep what was set in Studio; the new reading only replaces notes and lyrics.
    doc = json.loads((d / "hymn.json").read_text())
    for k in _KEEP_DETAILS:
        if k in old_doc and (old_doc[k] or k not in doc or not doc[k]):
            doc[k] = old_doc[k]
    doc["id"] = old_doc.get("id", d.name)
    (d / "hymn.json").write_text(json.dumps(doc, ensure_ascii=False, indent=2))
    review = json.loads((d / "review.json").read_text())
    review["title"] = doc["title"]
    (d / "review.json").write_text(json.dumps(review, ensure_ascii=False, indent=2))

    manifest = d.parent / "hymns.json"
    if manifest.exists():
        try:
            items = json.loads(manifest.read_text())
            if isinstance(items, list):
                items = [doc if isinstance(h, dict) and h.get("id") == doc["id"] else h for h in items]
                manifest.write_text(json.dumps(items, ensure_ascii=False, indent=2))
        except ValueError:
            pass
    for w in res.warnings:
        log(f"    ⚠ {w}")
    log(f"\nDone: {doc['title']} read again with {engine}. Earlier files are in {backup.name}/.")
    return res


def make_transcriber(engine: str, api_key: str | None = None) -> Transcriber:
    """The page reader for an engine name ("local", "claude", "gemini")."""
    load_env_file(Path(__file__).resolve().parent.parent / ".env")
    if engine == "local":
        return local_transcriber()
    if engine == "gemini":
        key_ = api_key or os.environ.get("GEMINI_API_KEY")
        if not key_:
            raise SystemExit("Set GEMINI_API_KEY (or pass --api-key) to transcribe slide images.")
        return gemini_transcriber(key_)
    has_profile = (Path.home() / ".config" / "anthropic").exists()
    if not (os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN") or has_profile):
        raise SystemExit(
            "No Anthropic credentials: add ANTHROPIC_API_KEY to services/hymn-studio/.env, "
            "export it, or run `ant auth login`."
        )
    return claude_transcriber()


def measure_warnings(pages: list[dict]) -> list[str]:
    """Every measure should fill the meter (a short opening pickup and the last measure that completes it are fine)."""
    ts = str(pages[0].get("time_signature") or "4/4") if pages else "4/4"
    bar = _bar_length(ts)
    out: list[str] = []
    joined = join_split_measures([m for p in pages for m in p.get("measures", [])], bar)
    first_len = sum(float(n.get("dur") or 0) for n in joined[0].get("soprano", [])) if joined else bar
    for mi, m in enumerate(joined, start=1):
        if mi == 1 and (m.get("pickup") or first_len < bar):
            continue
        last_len = sum(float(n.get("dur") or 0) for n in m.get("soprano", []))
        if mi == len(joined) and abs(first_len + last_len - bar) < 1e-6:
            continue  # the last measure completes the opening pickup
        for part in VOICES:
            total = sum(float(n.get("dur") or 0) for n in m.get(part, []))
            if m.get(part) and abs(total - bar) > 1e-3 and not m.get("pickup"):
                out.append(f"Measure {mi} {part}: {total:g} beats (expected {bar:g}) — check the transcription.")
    return out


_LETTERS = "FCGDAEB"  # order sharps are added; flats are added in reverse


def key_accidental(letter: str, fifths: int) -> str:
    """The accidental the key signature gives a letter: '#', 'b' or ''."""
    if fifths > 0 and letter in _LETTERS[:fifths]:
        return "#"
    if fifths < 0 and letter in _LETTERS[::-1][:-fifths]:
        return "b"
    return ""


def respell(pitch: str, old_fifths: int, new_fifths: int) -> str:
    """Re-read a note under a corrected key signature: a note that only had the old key's
    accidental takes the new key's one instead ('A4' in B♭ major becomes 'Ab4' in E♭ major).
    Notes with their own accidental (one the old key doesn't give) are left alone."""
    m = re.match(r"^([A-G])(#|b|n)?(-?\d)$", pitch)
    if not m:
        return pitch
    letter, acc, octave = m.group(1), m.group(2) or "", m.group(3)
    if acc == "n":
        acc = ""
    if acc != key_accidental(letter, old_fifths):
        return pitch
    return f"{letter}{key_accidental(letter, new_fifths)}{octave}"


def add_boxes(hymn_dir: str | Path) -> int:
    """Give a hymn converted before note/measure positions were recorded its boxes (for zooming in
    the app), without touching its notes: re-read each page image and copy positions across only
    where the measures and per-voice note counts line up. Returns how many measures got a box."""
    from .shape_omr import read_page

    d = Path(hymn_dir)
    tfile = d / "transcription.json"
    t = json.loads(tfile.read_text())
    done = 0
    for pi, pg in enumerate(t["pages"], start=1):
        img = d / "pages" / f"page{pi}.png"
        if not img.exists() or all(m.get("box") for m in pg.get("measures", [])):
            continue
        fresh = read_page(str(img)).get("measures", [])
        if len(fresh) != len(pg.get("measures", [])):
            continue
        for old, new in zip(pg["measures"], fresh):
            if new.get("box"):
                old["box"] = new["box"]
                done += 1
            for v in VOICES:
                if len(old.get(v, [])) == len(new.get(v, [])):
                    for a, b in zip(old[v], new[v]):
                        if b.get("box") and not a.get("box"):
                            a["box"] = b["box"]
    tfile.write_text(json.dumps(t, ensure_ascii=False, indent=2))
    return done


def apply_edits(hymn_dir: str | Path, respell_from: int | None = None, audio: bool = True) -> dict:
    """After a reviewer edits notes, key, time or tempo in the app (saved into transcription.json,
    with the settings on the first page): rewrite the score, recheck the measures, update
    review.json and re-render the audio."""
    d = Path(hymn_dir)
    tfile, rfile = d / "transcription.json", d / "review.json"
    t = json.loads(tfile.read_text())
    review = json.loads(rfile.read_text())
    pages = t["pages"]
    first = pages[0]
    fifths = int(first.get("key_fifths") or 0)
    ts = str(first.get("time_signature") or "4/4")
    bpm = float(first.get("tempo_bpm") or review.get("bpm") or 80)
    for pg in pages + [p for v in t.get("extra_verses", []) for p in v]:
        if respell_from is not None and respell_from != fifths:
            for m in pg.get("measures", []):
                for v in VOICES:
                    for n in m.get(v, []):
                        n["pitch"] = respell(str(n.get("pitch", "REST")), respell_from, fifths)
        pg["key_fifths"], pg["time_signature"] = fifths, ts
    first["tempo_bpm"] = bpm
    tfile.write_text(json.dumps(t, ensure_ascii=False, indent=2))
    files = rebuild_score(d)

    bar = _bar_length(ts)
    joined = join_split_measures([m for p in pages for m in p.get("measures", [])], bar)
    keep = [w for w in review.get("warnings", []) if not w.startswith("Measure ")]
    review.update(bpm=bpm, key_fifths=fifths, time_signature=ts, measures=len(joined),
                  warnings=keep + measure_warnings(pages), edited=True)
    rfile.write_text(json.dumps(review, ensure_ascii=False, indent=2))
    warn = d / "WARNINGS.txt"
    if review["warnings"]:
        warn.write_text("\n".join(review["warnings"]) + "\n")
    else:
        warn.unlink(missing_ok=True)
    if audio:
        from .piano_render import render, render_tones

        xml = files["musicxml"]
        render(xml, files["midi"], d / f"{d.name}-piano.wav", bpm=bpm)
        render_tones(xml, d, d.name, bpm=bpm)
    return review


def rebuild_score(hymn_dir: str | Path) -> dict[str, Path]:
    """Rewrite the MusicXML and MIDI from an edited transcription.json (e.g. syllables fixed in the app).

    Notes don't change, so the audio stays as it is. practice.json is rewritten too.
    """
    d = Path(hymn_dir)
    t = json.loads((d / "transcription.json").read_text())
    review = json.loads((d / "review.json").read_text())
    hymn = json.loads((d / "hymn.json").read_text())
    pages, extra = t["pages"], t.get("extra_verses", [])
    pages[0]["tempo_bpm"] = pages[0].get("tempo_bpm") or review.get("bpm", 80)
    credits = [c.strip() for c in (hymn.get("author") or "").split(";") if c.strip()]
    score = build_piano_score(review.get("title") or hymn.get("title", ""), credits, pages, extra)
    slug = d.name
    xml, mid = d / f"{slug}.musicxml", d / f"{slug}.mid"
    score.write("musicxml", fp=str(xml))
    score.write("midi", fp=str(mid))
    from .practice import write_practice

    out = {"musicxml": xml, "midi": mid}
    practice = write_practice(d)  # keep the mobile app's practice notes in step with edits
    if practice:
        out["practice_json"] = practice
    return out


def pdf_slides(path: Path) -> list[SlidePage]:
    """PDF pages as slides: pages with staves keep their image (sheet music); pages without staves
    but with typed text keep only the text (lyrics). All music pages form one hymn titled after the
    file, since PDFs have no slide titles."""
    from .shape_omr import ShapeNotePage, load_binary
    from .slides import read_pdf

    from .slides import CHORUS_HEADING, SLIDE_SUFFIX

    pages = read_pdf(path)
    # (macOS file names keep accents as separate marks: join them first, or title() reads
    # "Canaán" as two words and gives "CanaáN")
    stem = unicodedata.normalize("NFC", re.sub(r"[_-]+", " ", Path(path).stem).strip())
    title = stem if any(ch.isupper() for ch in stem) else stem.title()
    fold = lambda t: unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode().lower().split()  # noqa: E731
    for p in pages:
        sp = ShapeNotePage(load_binary(p.image))
        sp.find_staves()
        has_music = len(sp.staves) >= 2
        has_text = sum(len(x) for x in p.paragraphs if x) > 20
        if not has_music:
            p.image = None if has_text else p.image
        # PDFs exported from a slide deck keep each slide's title ("<Hymn> 2A", "CORO 1") in the
        # text layer: use it when it names this hymn or the chorus, so verses and chorus separate.
        heading = unicodedata.normalize("NFC", p.heading or "").strip()
        m = SLIDE_SUFFIX.match(heading)
        if CHORUS_HEADING.match(heading):
            p.heading = heading
        elif m and fold(m.group("title")) == fold(title):
            p.heading = f"{title} {m.group('verse')}{m.group('page')}"
        else:
            p.heading = f"{title} 1"
    return [p for p in pages if p.image or any(p.paragraphs)]


def expand_inputs(inputs: list[str]) -> list[str]:
    """Accept links, .pptx paths, or .txt files listing one link/path per line."""
    out = []
    for item in inputs:
        if not is_url(item) and item.lower().endswith(".txt") and Path(item).exists():
            out += [l.strip() for l in Path(item).read_text().splitlines() if l.strip() and not l.startswith("#")]
        else:
            out.append(item)
    return out


def run_batch(
    inputs: list[str],
    out_dir: str,
    hymnal_id: str = "community",
    language: str = "es",
    api_key: str | None = None,
    use_cache: bool = True,
    engine: str = "local",
    transcriber: Transcriber | None = None,
    log: Callable[[str], None] = print,
    tempo: float = 80,
    render_audio: bool = True,
    correct_lyrics: bool = True,
) -> list[HymnResult]:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    if transcriber is None:
        transcriber = make_transcriber(engine, api_key)
    # Cache per engine so switching engines never reuses the other one's notes.
    transcribe = cached(transcriber, out / ".cache" / engine, use_cache)

    results: list[HymnResult] = []
    failures: list[str] = []
    for n, src in enumerate(expand_inputs(inputs), start=1):
        log(f"\n[{n}] {src}")
        try:
            path = download_deck(src, out / ".decks" / f"deck_{n}.pptx") if is_url(src) else Path(src)
            from .lyrics_deck import is_lyrics_deck, parse_lyrics_deck, write_lyrics_hymn

            if path.suffix.lower() == ".pdf":
                slides = pdf_slides(path)
            else:
                slides = read_pptx(path)

            if is_lyrics_deck(slides):
                parsed = parse_lyrics_deck(slides)
                slug = slugify(parsed["title"])
                log(f"  ♪ {parsed['title']} (lyrics only)")
                write_lyrics_hymn(parsed, out / slug, slug, hymnal_id, language)
                r = HymnResult(title=parsed["title"], slug=slug, out_dir=out / slug,
                               files={"hymn_json": out / slug / "hymn.json", "lyrics_txt": out / slug / "lyrics.txt"})
                results.append(r)
                continue
            hymns = group_hymns(slides)
            if not hymns:
                raise ValueError("no slides with images or lyrics")
            for h in hymns:
                log(f"  ♪ {h.title}")
                r = convert_hymn(h, transcribe, out, hymnal_id, language, log, tempo=tempo, render_audio=render_audio,
                                 correct_lyrics=correct_lyrics)
                for w in r.warnings:
                    log(f"    ⚠ {w}")
                results.append(r)
        except Exception as e:
            failures.append(f"{src}: {e}")
            log(f"  ✗ {e}")

    manifest = [json.loads(r.files["hymn_json"].read_text()) for r in results]
    (out / "hymns.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    log(f"\nDone: {len(results)} hymn(s) → {out.resolve()}  ({len(failures)} failed)")
    for f in failures:
        log(f"  ✗ {f}")
    return results
