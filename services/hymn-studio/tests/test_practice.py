"""practice.json: the compact score the mobile app draws and plays note by note."""

import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

from hymn_processor.deck_batch import apply_edits, rebuild_score
from hymn_processor.practice import VERSION, build_practice, parse_pitch, write_practice

ROOT = Path(__file__).resolve().parent.parent
DECK = ROOT / "storage" / "decks" / "porque-grande-es-jehova"
V = ("soprano", "alto", "tenor", "bass")


def n(pitch, dur=1.0, **kw):
    return {"pitch": pitch, "dur": dur, **kw}


def measure(s, a=None, t=None, b=None, **kw):
    return {"soprano": s, "alto": a or [n("REST", sum(x["dur"] for x in s))], "tenor": t or [n("REST", sum(x["dur"] for x in s))],
            "bass": b or [n("REST", sum(x["dur"] for x in s))], **kw}


def test_parse_pitch():
    assert parse_pitch("Eb4") == ("E", -1, 4)
    assert parse_pitch("C#5") == ("C", 1, 5)
    assert parse_pitch("Bn3") == ("B", 0, 3)
    assert parse_pitch("REST") is None
    assert parse_pitch("") is None


def test_header_measures_and_pickup():
    pages = [{
        "key_fifths": -3, "time_signature": "4/4", "tempo_bpm": 130,
        "measures": [
            measure([n("Eb4", syllable="Por", syllabic="begin"), n("F4", syllable="que", syllabic="end")], pickup=True),
            measure([n("G4", 1.5), n("F4", 0.5), n("G4", 0.5), n("Ab4", 0.5), n("G4", 1.0)]),
        ],
    }]
    p = build_practice(pages, title="Porque Grande Es Jehová")
    assert p["schema"] == "exalto.practice" and p["version"] == VERSION
    assert p["key"] == {"fifths": -3, "mode": "major", "name": "E♭ major"}
    assert p["time"] == {"beats": 4, "beatType": 4} and p["tempo"] == 130
    assert p["measureCount"] == 2 and p["pickupBeats"] == 2 and p["totalBeats"] == 6
    assert [(m["n"], m["start"], m["beats"], m["pickup"]) for m in p["measures"]] == [(1, 0, 2, True), (2, 2, 4, False)]
    sop = p["voices"]["soprano"]["notes"]
    first = sop[0]
    assert (first["id"], first["midi"], first["pitch"], first["name"], first["start"], first["dur"]) == ("s0", 63, "Eb4", "E♭4", 0, 1)
    assert first["lyrics"] == [{"verse": 1, "text": "Por", "syllabic": "begin"}]
    assert first["y"] == 0  # E4 sits on the treble staff's bottom line
    assert first["acc"] is None  # the key signature already flats it
    assert [x["start"] for x in sop] == [0, 1, 2, 3.5, 4, 4.5, 5]
    # A♭ is in the key: no accidental drawn; the dotted quarter is a quarter with a dot.
    assert sop[5]["name"] == "A♭4" and sop[5]["acc"] is None
    assert (sop[2]["type"], sop[2]["dots"]) == ("quarter", 1)


def test_accidentals_beams_and_lyrics_shared_with_other_voices():
    pages = [{
        "key_fifths": 0, "time_signature": "4/4",
        "measures": [measure(
            [n("F#4", 0.5, syllable="a"), n("F#4", 0.5), n("F4", 1.0, syllable="b"), n("C4", 2.0, tie="start")],
            a=[n("D4", 1.0), n("D4", 1.0), n("C4", 2.0)],
            t=[n("A3", 4.0)], b=[n("D3", 4.0)],
        ), measure([n("C4", 4.0, tie="stop")])],
    }]
    p = build_practice(pages)
    sop = p["voices"]["soprano"]["notes"]
    assert [x["acc"] for x in sop] == ["#", None, "n", None, None]
    assert [x["beam"] for x in sop[:3]] == ["begin", "end", None]
    assert sop[4]["tie"] == "stop" and "lyrics" not in sop[4]
    alto = p["voices"]["alto"]["notes"]
    assert alto[0]["lyrics"][0]["text"] == "a" and alto[1]["lyrics"][0]["text"] == "b"
    assert p["voices"]["bass"]["notes"][0]["y"] == 4  # D3 is the bass staff's middle line
    assert p["voices"]["tenor"]["stem"] == "up" and p["voices"]["alto"]["stem"] == "down"
    assert p["voices"]["tenor"]["range"] == [57, 57]


def test_extra_verses_become_more_lyric_lines():
    v1 = [{"time_signature": "3/4", "measures": [measure([n("G4", syllable="Dios"), n("A4", syllable="es"), n("B4", syllable="bue")])]}]
    v2 = [{"time_signature": "3/4", "measures": [measure([n("G4", syllable="Su"), n("A4", syllable="a"), n("B4", syllable="mor")])]}]
    p = build_practice(v1, [v2])
    assert p["verses"] == 2
    assert [l["text"] for l in p["voices"]["soprano"]["notes"][0]["lyrics"]] == ["Dios", "Su"]


def test_key_signature_positions():
    p = build_practice([{"key_fifths": -3, "measures": [measure([n("C4", 4.0)])]}])
    treble, bass = p["staves"]
    assert [(a["step"], a["y"]) for a in treble["keyAccidentals"]] == [("B", 4), ("E", 7), ("A", 3)]
    assert [(a["step"], a["y"]) for a in bass["keyAccidentals"]] == [("B", 2), ("E", 5), ("A", 1)]


def test_systems_follow_the_source_line_breaks():
    box = lambda x: [x, 0, x + 50, 100]
    pages = [
        {"measures": [measure([n("C4", 4.0)], box=box(x)) for x in (100, 200, 300)] + [measure([n("C4", 4.0)], box=box(100))]},
        {"measures": [measure([n("C4", 4.0)], box=box(100))]},
    ]
    p = build_practice(pages)
    assert p["systems"] == [{"measures": [1, 3]}, {"measures": [4, 4]}, {"measures": [5, 5]}]


@pytest.mark.skipif(not DECK.exists(), reason="converted sample not present")
def test_sample_deck_matches_review(tmp_path):
    d = tmp_path / DECK.name
    shutil.copytree(DECK, d, ignore=shutil.ignore_patterns("*.wav", "*.m4a", "pages"))
    out = write_practice(d)
    p = json.loads(out.read_text())
    review = json.loads((d / "review.json").read_text())
    assert p["measureCount"] == review["measures"] and p["tempo"] == review["bpm"]
    assert p["key"]["fifths"] == review["key_fifths"]
    for v in V:
        notes = p["voices"][v]["notes"]
        assert notes and all(a["start"] <= b["start"] for a, b in zip(notes, notes[1:]))
        assert len({x["id"] for x in notes}) == len(notes)
    assert out.stat().st_size < 200_000


@pytest.mark.skipif(not DECK.exists(), reason="converted sample not present")
def test_edits_and_rebuild_rewrite_practice(tmp_path):
    d = tmp_path / DECK.name
    shutil.copytree(DECK, d, ignore=shutil.ignore_patterns("*.wav", "*.m4a", "pages"))
    t = json.loads((d / "transcription.json").read_text())
    t["pages"][0]["tempo_bpm"] = 96
    t["pages"][0]["measures"][0]["soprano"][0]["syllable"] = "POR"
    (d / "transcription.json").write_text(json.dumps(t))
    apply_edits(d, audio=False)
    p = json.loads((d / "practice.json").read_text())
    assert p["tempo"] == 96 and p["voices"]["soprano"]["notes"][0]["lyrics"][0]["text"] == "POR"

    t["pages"][0]["measures"][0]["soprano"][0]["syllable"] = "Por"
    (d / "transcription.json").write_text(json.dumps(t))
    assert "practice_json" in rebuild_score(d)
    assert json.loads((d / "practice.json").read_text())["voices"]["soprano"]["notes"][0]["lyrics"][0]["text"] == "Por"


def test_lyrics_only_hymn_is_skipped(tmp_path):
    (tmp_path / "review.json").write_text(json.dumps({"kind": "lyrics", "title": "x"}))
    (tmp_path / "transcription.json").write_text(json.dumps({"pages": []}))
    assert write_practice(tmp_path) is None


@pytest.mark.skipif(not DECK.exists(), reason="converted sample not present")
def test_cli_subcommand(tmp_path):
    d = tmp_path / DECK.name
    shutil.copytree(DECK, d, ignore=shutil.ignore_patterns("*.wav", "*.m4a", "pages"))
    r = subprocess.run([sys.executable, "-m", "hymn_processor.cli", "practice", "--dir", str(d)],
                       cwd=ROOT, env={"PYTHONPATH": str(ROOT)}, capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    assert (d / "practice.json").exists()


def test_lower_voices_keep_their_own_words():
    """Where tenor and bass have words of their own (a chorus echo), they sing those, not the soprano's."""
    pages = [{
        "key_fifths": -1, "time_signature": "4/4", "tempo_bpm": 90,
        "measures": [measure(
            [n("C5", 2.0, syllable="llí", syllabic="end"), n("C5", 2.0, syllable="no", syllabic="single")],
            a=[n("A4", 2.0), n("A4", 2.0)],
            t=[n("F3", 1.0, syllable="Se", syllabic="begin"), n("F3", 1.0, syllable="pa", syllabic="middle"),
               n("F3", 1.0, syllable="ra", syllabic="middle"), n("F3", 1.0, syllable="ción", syllabic="end")],
            b=[n("F2", 1.0, syllable="Se", syllabic="begin"), n("F2", 1.0, syllable="pa", syllabic="middle"),
               n("F2", 1.0, syllable="ra", syllabic="middle"), n("F2", 1.0, syllable="ción", syllabic="end")],
        )],
    }]
    p = build_practice(pages)
    words = lambda v: [x["lyrics"][0]["text"] for x in p["voices"][v]["notes"] if x.get("lyrics")]  # noqa: E731
    assert words("soprano") == ["llí", "no"]
    assert words("alto") == ["llí", "no"]  # follows the soprano
    assert words("tenor") == ["Se", "pa", "ra", "ción"]
    assert words("bass") == ["Se", "pa", "ra", "ción"]
    assert all("_own" not in x for v in V for x in p["voices"][v]["notes"])
