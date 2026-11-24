"""Compact practice data for the Exalto mobile app (practice.json).

The phone draws a simple grand staff and plays notes one by one from this file, without a
MusicXML renderer. It is built from transcription.json, the same source as the MusicXML, so
measures, pickups and page-split measures line up with the score and the practice audio
(beat 0 is the first note heard, pickup included).

Shape (version 1). All beats are quarter notes; seconds = beat * 60 / tempo.

{
  "schema": "exalto.practice", "version": 1,
  "title": str,
  "key": {"fifths": -3, "mode": "major", "name": "E♭ major"},
  "time": {"beats": 4, "beatType": 4},
  "tempo": 130,                     # quarter notes per minute at 100% speed
  "measureCount": int, "totalBeats": float, "pickupBeats": float,
  "verses": int,                    # lyric lines under the notes (1 = verse 1 only)
  "staves": [{"id": "treble", "clef": "G", "voices": ["soprano", "alto"], "bottomLine": "E4",
              "keyAccidentals": [{"step": "B", "alter": -1, "y": 4}, ...]}, {"id": "bass", ...}],
  "measures": [{"n": 1, "start": 0, "beats": 2, "pickup": true, "system": 0, "weight": 2}, ...],
  "systems": [{"measures": [1, 4]}, ...],   # the source score's line breaks (first, last)
  "voices": {
    "soprano": {"staff": 0, "stem": "up", "range": [63, 72], "notes": [Note, ...]}, ...
  }
}

Note: {"id": "s0", "m": 1, "start": 0, "dur": 1,          # measure number, beats
       "midi": 63, "pitch": "Eb4", "name": "E♭4",          # (rests: "rest": true, no pitch)
       "y": 2, "acc": "b" | "#" | "n" | null,              # staff step from the bottom line; accidental to draw
       "type": "quarter", "dots": 0, "beam": "begin" | "continue" | "end" | null,
       "tie": "start" | "stop" | "continue" | null,
       "lyrics": [{"verse": 1, "text": "Por", "syllabic": "begin"}]}   # omitted when empty
"""

from __future__ import annotations

import json
import math
import re
from fractions import Fraction
from pathlib import Path

from .deck_batch import VOICES, _bar_length, join_split_measures

SCHEMA = "exalto.practice"
VERSION = 1
FILE_NAME = "practice.json"

_STEPS = "CDEFGAB"
_PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
_ALTER = {"": 0, "n": 0, "#": 1, "##": 2, "x": 2, "b": -1, "bb": -2, "-": -1, "--": -2}
_PITCH_RE = re.compile(r"^([A-Ga-g])(##|bb|--|#|b|n|x|-)?(\d)$")
_SIGN = {-2: "𝄫", -1: "♭", 0: "", 1: "♯", 2: "𝄪"}
_ACC = {-2: "bb", -1: "b", 0: "n", 1: "#", 2: "##"}
_KEYS = {0: "C", 1: "G", 2: "D", 3: "A", 4: "E", 5: "B", 6: "F♯", 7: "C♯",
         -1: "F", -2: "B♭", -3: "E♭", -4: "A♭", -5: "D♭", -6: "G♭", -7: "C♭"}
_SHARP_ORDER, _FLAT_ORDER = "FCGDAEB", "BEADGCF"
# Where key-signature accidentals sit on the treble staff (steps above the bottom line E4);
# the bass staff uses the same shapes two steps lower.
_TREBLE_SHARP_Y = {"F": 8, "C": 5, "G": 9, "D": 6, "A": 3, "E": 7, "B": 4}
_TREBLE_FLAT_Y = {"B": 4, "E": 7, "A": 3, "D": 6, "G": 2, "C": 5, "F": 1}
STAVES = (
    {"id": "treble", "clef": "G", "voices": ["soprano", "alto"], "bottomLine": "E4"},
    {"id": "bass", "clef": "F", "voices": ["tenor", "bass"], "bottomLine": "G2"},
)
_BOTTOM = {0: 4 * 7 + 2, 1: 2 * 7 + 4}  # diatonic index of E4 and G2
_STAFF_OF = {"soprano": 0, "alto": 0, "tenor": 1, "bass": 1}
_STEM = {"soprano": "up", "alto": "down", "tenor": "up", "bass": "down"}
_PREFIX = {"soprano": "s", "alto": "a", "tenor": "t", "bass": "b"}


def parse_pitch(p: str) -> tuple[str, int, int] | None:
    """'Eb4' -> ('E', -1, 4); 'REST' or unreadable -> None."""
    m = _PITCH_RE.match((p or "").strip())
    if not m:
        return None
    return m.group(1).upper(), _ALTER[m.group(2) or ""], int(m.group(3))


def midi_of(step: str, alter: int, octave: int) -> int:
    return 12 * (octave + 1) + _PC[step] + alter


def display_name(step: str, alter: int, octave: int) -> str:
    return f"{step}{_SIGN[alter]}{octave}"


def key_alter(step: str, fifths: int) -> int:
    if fifths > 0 and step in _SHARP_ORDER[:fifths]:
        return 1
    if fifths < 0 and step in _FLAT_ORDER[:-fifths]:
        return -1
    return 0


def key_accidentals(fifths: int, staff: int) -> list[dict]:
    order, ys, alter = (_SHARP_ORDER, _TREBLE_SHARP_Y, 1) if fifths > 0 else (_FLAT_ORDER, _TREBLE_FLAT_Y, -1)
    shift = 0 if staff == 0 else -2
    return [{"step": s, "alter": alter, "y": ys[s] + shift} for s in order[:abs(fifths)]]


def note_type(dur: float) -> dict:
    """Notehead type, dots and tuplet for a duration in quarter notes."""
    from music21 import duration

    q = Fraction(dur).limit_denominator(12)
    d = duration.Duration(quarterLength=q)
    out = {"type": d.type if d.type != "complex" else "quarter", "dots": d.dots}
    if d.tuplets:
        t = d.tuplets[0]
        out["tuplet"] = f"{t.numberNotesActual}:{t.numberNotesNormal}"
    return out


def _len(m: dict) -> float:
    return max((sum(float(n.get("dur") or 0) for n in m.get(v, [])) for v in VOICES), default=0.0)


def _systems(pages: list[dict]) -> list[int]:
    """System (line) index of each source measure: a new line on each page and wherever the
    measure boxes jump back left. Without boxes, four measures to a line."""
    out, sys_i, count = [], -1, 0
    for p in pages:
        prev_x = None
        for m in p.get("measures", []):
            box = m.get("box")
            if box:
                if prev_x is None or box[0] < prev_x:
                    sys_i += 1
                prev_x = box[0]
            else:
                if prev_x is None or count % 4 == 0:
                    sys_i += 1
                prev_x = -1
                count += 1
            out.append(max(sys_i, 0))
    return out


def build_practice(pages: list[dict], extra_verses: list[list[dict]] | None = None,
                   title: str = "", bpm: float | None = None) -> dict:
    extra_verses = extra_verses or []
    first = pages[0] if pages else {}
    fifths = int(first.get("key_fifths") or 0)
    ts = str(first.get("time_signature") or "4/4")
    num, den = (int(x) for x in ts.split("/"))
    bar = _bar_length(ts)
    tempo = float(bpm or first.get("tempo_bpm") or 80)

    src_systems = _systems(pages)
    raw = [m for p in pages for m in p.get("measures", [])]
    # Tag each source measure with its line before joining split measures.
    tagged = [{**m, "_sys": s} for m, s in zip(raw, src_systems)]
    measures = join_split_measures(tagged, bar)
    extra = [join_split_measures([m for p in v for m in p.get("measures", [])], bar) for v in extra_verses]

    # Systems renumbered from 0 in order.
    sys_ids: dict[int, int] = {}
    for m in measures:
        sys_ids.setdefault(m.get("_sys", 0), len(sys_ids))

    compound = den == 8 and num % 3 == 0 and num > 3
    group = 1.5 if compound else 4 / den if den > 4 else 1.0

    out_measures, voices = [], {v: [] for v in VOICES}
    start = 0.0
    for mi, meas in enumerate(measures):
        n = mi + 1
        length = _len(meas) or bar
        onsets: set[float] = set()
        # Lyric syllables per soprano onset (all verses), shared with the other voices.
        sop_lyrics: dict[float, list[dict]] = {}
        per_voice: dict[str, list[dict]] = {}
        for v in VOICES:
            notes, t = [], 0.0
            for j, item in enumerate(meas.get(v, [])):
                dur = float(item.get("dur") or 0)
                if dur <= 0:
                    continue
                note = {"id": "", "m": n, "start": round(start + t, 4), "dur": round(dur, 4)}
                pp = parse_pitch(str(item.get("pitch", "REST")))
                if pp is None:
                    note["rest"] = True
                else:
                    step, alter, octave = pp
                    note.update(midi=midi_of(step, alter, octave), pitch=f"{step}{_ACC[alter] if alter else ''}{octave}",
                                name=display_name(step, alter, octave),
                                y=octave * 7 + _STEPS.index(step) - _BOTTOM[_STAFF_OF[v]], _step=step, _alter=alter, _oct=octave)
                note.update(note_type(dur))
                tie = item.get("tie")
                note["tie"] = tie if tie in ("start", "stop", "continue") else None
                if v == "soprano" and "rest" not in note:
                    lyr = []
                    for verse_no, src in [(1, item)] + [
                        (k, ex[mi]["soprano"][j]) for k, ex in enumerate(extra, start=2)
                        if mi < len(ex) and j < len(ex[mi].get("soprano", []))
                    ]:
                        text = (src.get("syllable") or src.get("lyric") or "").strip().strip("-_").strip()
                        if text:
                            syl = src.get("syllabic") if src.get("syllabic") in ("single", "begin", "middle", "end") else "single"
                            lyr.append({"verse": verse_no, "text": text, "syllabic": syl})
                    if lyr:
                        sop_lyrics[round(t, 4)] = lyr
                notes.append((round(t, 4), note))
                onsets.add(round(t, 4))
                t += dur
            per_voice[v] = notes

        for v in VOICES:
            for t, note in per_voice[v]:
                lyr = sop_lyrics.get(t)
                if lyr and "rest" not in note and note["tie"] not in ("stop", "continue"):
                    note["lyrics"] = lyr

        # Accidentals to draw: per staff and measure, starting from the key signature.
        for staff in (0, 1):
            seen: dict[tuple[str, int], int] = {}
            staff_notes = sorted(
                (nt for v in VOICES if _STAFF_OF[v] == staff for _, nt in per_voice[v]),
                key=lambda nt: nt["start"],
            )
            for nt in staff_notes:
                if "rest" in nt:
                    continue
                k = (nt["_step"], nt["_oct"])
                current = seen.get(k, key_alter(nt["_step"], fifths))
                if nt["tie"] in ("stop", "continue"):
                    nt["acc"] = None
                elif nt["_alter"] != current:
                    nt["acc"] = _ACC[nt["_alter"]]
                else:
                    nt["acc"] = None
                seen[k] = nt["_alter"]

        # Beams: eighths and shorter within one beat (dotted quarter in compound time).
        for v in VOICES:
            notes = [nt for _, nt in per_voice[v]]
            for nt in notes:
                nt["beam"] = None
            run: list[dict] = []

            def close(run_: list[dict]) -> None:
                if len(run_) >= 2:
                    run_[0]["beam"] = "begin"
                    for x in run_[1:-1]:
                        x["beam"] = "continue"
                    run_[-1]["beam"] = "end"

            for nt in notes:
                beamable = "rest" not in nt and nt["type"] in ("eighth", "16th", "32nd")
                g = math.floor((nt["start"] - start) / group + 1e-6)
                if run and (not beamable or math.floor((run[0]["start"] - start) / group + 1e-6) != g):
                    close(run)
                    run = []
                if beamable:
                    run.append(nt)
            close(run)

        for v in VOICES:
            for _, nt in per_voice[v]:
                nt["id"] = f"{_PREFIX[v]}{len(voices[v])}"
                for k in ("_step", "_alter", "_oct"):
                    nt.pop(k, None)
                if "rest" in nt:
                    nt.pop("acc", None)
                voices[v].append(nt)

        out_measures.append({
            "n": n,
            "start": round(start, 4),
            "beats": round(length, 4),
            "pickup": bool(mi == 0 and (meas.get("pickup") or length < bar - 1e-6)),
            "system": sys_ids.get(meas.get("_sys", 0), 0),
            "weight": max(1, len(onsets)),
        })
        start += length

    systems: list[dict] = []
    for m in out_measures:
        if not systems or systems[-1]["_id"] != m["system"]:
            systems.append({"_id": m["system"], "measures": [m["n"], m["n"]]})
        else:
            systems[-1]["measures"][1] = m["n"]
    for s in systems:
        s.pop("_id")

    voice_out = {}
    for v in VOICES:
        pitched = [nt["midi"] for nt in voices[v] if "rest" not in nt]
        voice_out[v] = {
            "staff": _STAFF_OF[v],
            "stem": _STEM[v],
            "range": [min(pitched), max(pitched)] if pitched else None,
            "notes": voices[v],
        }

    verses = max([1] + [l["verse"] for nt in voices["soprano"] for l in nt.get("lyrics", [])])
    return {
        "schema": SCHEMA,
        "version": VERSION,
        "title": title,
        "key": {"fifths": fifths, "mode": "major", "name": f"{_KEYS.get(fifths, 'C')} major"},
        "time": {"beats": num, "beatType": den},
        "tempo": round(tempo, 2),
        "measureCount": len(out_measures),
        "totalBeats": round(start, 4),
        "pickupBeats": out_measures[0]["beats"] if out_measures and out_measures[0]["pickup"] else 0,
        "verses": verses,
        "staves": [{**s, "keyAccidentals": key_accidentals(fifths, i)} for i, s in enumerate(STAVES)],
        "measures": out_measures,
        "systems": systems,
        "voices": voice_out,
    }


def dumps(data: dict) -> str:
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"))


def write_practice(hymn_dir: str | Path) -> Path | None:
    """Write practice.json next to a hymn's transcription.json. Returns None for hymns with no
    music (typed-lyrics decks)."""
    d = Path(hymn_dir)
    tfile = d / "transcription.json"
    if not tfile.exists():
        return None
    review = json.loads((d / "review.json").read_text()) if (d / "review.json").exists() else {}
    t = json.loads(tfile.read_text())
    pages = t.get("pages") or []
    if review.get("kind") == "lyrics" or not any(p.get("measures") for p in pages):
        return None
    bpm = pages[0].get("tempo_bpm") or review.get("bpm")
    data = build_practice(pages, t.get("extra_verses") or [], title=review.get("title") or "", bpm=bpm)
    out = d / FILE_NAME
    out.write_text(dumps(data))
    return out
