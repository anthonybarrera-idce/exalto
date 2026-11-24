"""Regression tests for the local shape-note reader on the sample hymn pages."""

from pathlib import Path

import pytest

from hymn_processor.deck_batch import join_split_measures
from hymn_processor.shape_omr import STEP_NAMES, ShapeNotePage, load_binary, read_page

PAGES = Path(__file__).resolve().parent.parent / "samples" / "shape_notes"
pytestmark = pytest.mark.skipif(not (PAGES / "page1.png").exists(), reason="sample pages not present")


def notes(measure, voice):
    return [f'{n["pitch"]}/{n["dur"]:g}' for n in measure[voice]]


def test_page1_first_measure_all_voices():
    m = read_page(str(PAGES / "page1.png"))["measures"][0]
    assert notes(m, "soprano") == ["A4/0.5"] * 5 + ["G4/0.5", "F4/1"]
    assert notes(m, "alto") == ["F4/0.5"] * 5 + ["D4/0.5", "C4/1"]
    assert notes(m, "tenor") == ["C4/0.5"] * 5 + ["Bb3/0.5", "A3/1"]
    assert notes(m, "bass") == ["F3/0.5"] * 6 + ["F3/1"]


def test_key_signature_and_accidental():
    d = read_page(str(PAGES / "page3.png"))
    assert d["key_fifths"] == -1
    tenor = [n["pitch"] for m in d["measures"] for n in m["tenor"]]
    assert "Eb4" in tenor  # flat sign in the measure


def test_every_measure_fills_4_4_across_pages():
    measures = [m for i in range(1, 5) for m in read_page(str(PAGES / f"page{i}.png"))["measures"]]
    joined = join_split_measures(measures, 4.0)
    assert len(joined) == 16
    for i, m in enumerate(joined, start=1):
        for v in ("soprano", "alto", "tenor", "bass"):
            assert sum(n["dur"] for n in m[v]) == 4, (i, v, notes(m, v))


def test_half_and_whole_notes():
    last = read_page(str(PAGES / "page4.png"))["measures"][-1]
    assert notes(last, "alto") == ["C4/4"]
    assert notes(last, "tenor") == ["Bb3/0.5", "A3/1.5", "A3/2"]


def test_shape_check_flags_a_misread_pitch():
    page = ShapeNotePage(load_binary(str(PAGES / "page1.png")))
    page.read()
    assert all(h.shape_ok for h in page.heads)
    # Pretend one soprano diamond (mi) was read a step lower: its shape no longer fits its degree.
    head = next(h for h in page.heads if h.staff == 0 and STEP_NAMES[h.step % 7] == "A")
    head.step -= 1
    page.check_shapes()
    assert not head.shape_ok


@pytest.mark.skipif(__import__("shutil").which("tesseract") is None, reason="tesseract not installed")
def test_lyrics_read_and_attached_to_soprano():
    d = read_page(str(PAGES / "page2.png"))
    assert d["lyric_lines"][0] == "Tú eres la melodía, Tú eres la armonía,"
    syllables = [n["syllable"] for m in d["measures"] for n in m["soprano"] if n["syllable"]]
    assert syllables[:4] == ["Tú", "e", "res", "la"]


def test_te_adoro_sharp_key_rests_and_split_measures():
    """G major (one sharp), quarter rests, seconds drawn side by side, and measures split by line breaks."""
    pages = [read_page(str(PAGES / f"te_adoro_page{i}.png")) for i in (1, 2)]
    assert all(p["key_fifths"] == 1 for p in pages)
    assert all(not p["review"] for p in pages)
    measures = join_split_measures([m for p in pages for m in p["measures"]], 4.0)
    first, *middle, last = measures
    for v in ("soprano", "alto", "tenor", "bass"):
        assert sum(n["dur"] for n in first[v]) == 1  # pickup
        assert sum(n["dur"] for n in last[v]) == 3  # completes the pickup
        for i, m in enumerate(middle, start=2):
            assert sum(n["dur"] for n in m[v]) == 4, (i, v, notes(m, v))
    pitches = [n["pitch"] for m in measures for n in m["soprano"]]
    assert "REST" in pitches and "F#4" in pitches and "F4" not in pitches


def test_notes_and_measures_know_where_they_are_on_the_page():
    d = read_page(str(PAGES / "page1.png"))
    w, h = d["size"]
    for m in d["measures"]:
        x0, y0, x1, y1 = m["box"]
        assert 0 <= x0 < x1 <= w and 0 <= y0 < y1 <= h
        for v in ("soprano", "alto", "tenor", "bass"):
            for n in m[v]:
                if n["pitch"] != "REST" or n.get("box"):
                    nx0, ny0, nx1, ny1 = n["box"]
                    assert x0 <= (nx0 + nx1) / 2 <= x1 and y0 <= (ny0 + ny1) / 2 <= y1
