"""Reviewer edits made in the app: key respelling, measure checks and the rebuild."""

import json
import shutil
from pathlib import Path

import pytest

from hymn_processor.deck_batch import apply_edits, flag_warnings, measure_warnings, resolve_flags, respell

DECK = Path(__file__).resolve().parent.parent / "storage" / "decks" / "porque-grande-es-jehova"


def test_respell_follows_the_corrected_key():
    assert respell("A4", -2, -3) == "Ab4"  # missed flat: A becomes A♭
    assert respell("An4", -2, -3) == "Ab4"
    assert respell("Eb4", -2, -3) == "Eb4"
    assert respell("A#4", -2, -3) == "A#4"  # its own accidental stays
    assert respell("F#4", 1, 0) == "F4"
    assert respell("REST", 0, 2) == "REST"


def test_measure_warnings_use_the_time_signature():
    m = {v: [{"pitch": "C4", "dur": 1.0}] * 3 for v in ("soprano", "alto", "tenor", "bass")}
    pages = [{"time_signature": "3/4", "measures": [m, m, m]}]
    assert measure_warnings(pages) == []
    pages[0]["time_signature"] = "4/4"
    assert measure_warnings(pages)  # 3 beats in 4/4 is wrong after the first measure


@pytest.mark.skipif(not DECK.exists(), reason="converted sample not present")
def test_apply_edits_rebuilds_and_updates_review(tmp_path):
    d = tmp_path / DECK.name
    shutil.copytree(DECK, d, ignore=shutil.ignore_patterns("*.wav", "*.m4a", "pages"))
    t = json.loads((d / "transcription.json").read_text())
    t["pages"][0]["tempo_bpm"] = 96
    t["pages"][0]["key_fifths"] = -2
    t["pages"][0]["measures"][1]["soprano"].pop()  # delete a note: measure 2 is now short
    (d / "transcription.json").write_text(json.dumps(t))
    r = apply_edits(d, respell_from=-3, audio=False)
    assert r["bpm"] == 96 and r["key_fifths"] == -2
    assert any(w.startswith("Measure 2 soprano") for w in r["warnings"])
    xml = (d / f"{d.name}.musicxml").read_text()
    assert "<fifths>-2</fifths>" in xml and "<per-minute>96" in xml
    t2 = json.loads((d / "transcription.json").read_text())
    assert all(p["key_fifths"] == -2 for p in t2["pages"])


def _flag_page(pitch: str) -> dict:
    note = {"pitch": pitch, "dur": 4.0, "box": [100, 200, 120, 215]}
    rest = {"pitch": "REST", "dur": 4.0}
    return {
        "measures": [{"soprano": [note], "alto": [rest], "tenor": [rest], "bass": [rest]}],
        "review": [{"x": 110, "y": 207, "pitch": "B3"}],
        "heads": [{"x0": 100, "y0": 200, "x1": 120, "y1": 215, "pitch": "B3", "ok": False, "staff": 0}],
    }


def test_flag_clears_once_its_note_is_changed():
    pages = [_flag_page("C4")]
    assert resolve_flags(pages) == []
    assert pages[0]["review"] == [] and pages[0]["heads"][0]["ok"] is True


def test_flag_on_a_unison_clears_when_one_voice_is_changed():
    pages = [_flag_page("B3")]
    m = pages[0]["measures"][0]
    m["alto"] = [dict(m["soprano"][0], pitch="C4")]  # same head, the reviewer fixed the alto only
    assert resolve_flags(pages) == []


def test_flag_stays_while_the_note_is_unchanged():
    pages = [_flag_page("B3")]
    flagged = resolve_flags(pages)
    assert flagged == [{"x": 110, "y": 207, "pitch": "B3", "page": 1}]
    assert pages[0]["heads"][0]["ok"] is False
    assert flag_warnings(flagged)[0].startswith("Page 1: notehead at x=110")
