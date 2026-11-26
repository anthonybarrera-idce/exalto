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


def test_system_opening_with_a_half_note_keeps_it():
    """A system whose first notes are hollow (half notes) must not lose them as "clef/key signature".

    Iglesia de Cristo, slide 2: the top system opens with a half-note chord. Only filled heads used to
    mark where the music starts, so the half notes were dropped, the measure read as 1 beat, and
    join_split_measures glued it onto the previous page's last measure (playback skipped a bar).
    """
    d = read_page(str(PAGES / "iglesia_system_opens_with_half_note.png"))
    first = d["measures"][0]
    assert notes(first, "soprano") == ["B4/2", "E4/0.5", "D4/0.5"]
    assert notes(first, "tenor") == ["G#3/2", "G#3/1"]
    assert notes(first, "bass") == ["E3/2", "E3/1"]
    for v in ("soprano", "alto", "tenor", "bass"):
        assert sum(n["dur"] for n in first[v]) == 3, (v, notes(first, v))
    # the measure box starts at the half notes, not at the eighths
    assert first["box"][0] < 360


def test_reads_the_printed_time_signature():
    assert read_page(str(PAGES / "iglesia_page1.png"))["time_signature"] == "3/4"
    d = read_page(str(PAGES / "page1.png"))
    assert (d["time_signature"], d["time_found"]) == ("4/4", True)
    # later pages print none: 4/4 is only the default there
    assert read_page(str(PAGES / "page2.png"))["time_found"] is False


def test_unison_heads_sharp_and_natural_are_not_extra_notes():
    """Iglesia de Cristo, slide 2, lower system (3/4):
    - "zó A": the "A" is a soprano/alto unison drawn as two heads side by side on one stem;
    - a sharp beside a head left a white gap between its strokes and the staff lines;
    - the inside of a natural sign looked like a whole note.
    Each used to add beats to its measure.
    """
    measures = read_page(str(PAGES / "iglesia_unison_sharp_natural.png"))["measures"]
    zo, anuncia, constante = measures[-3:]
    assert notes(zo, "soprano") == ["B4/2", "E4/1"]
    assert notes(zo, "alto") == ["E4/2", "E4/1"]
    assert notes(anuncia, "soprano") == ["E4/1", "E4/1", "F#4/1"]
    assert notes(anuncia, "alto") == ["E4/1", "E4/1", "D#4/1"]  # the sharp is printed on the alto's D
    assert notes(constante, "soprano") == ["G4/1", "G4/1", "A4/1"]  # natural: G, not G#
    for m in (zo, anuncia, constante):
        for v in ("soprano", "alto", "tenor", "bass"):
            assert sum(n["dur"] for n in m[v]) == 3, (v, notes(m, v))


def test_double_flags_and_dots_past_a_flag():
    """A La Tierra De Canaán (Finale-style compact flags): dotted eighth + sixteenth pairs.
    The double flag is barely taller than a single one, its body used to pass for a notehead
    (and the white between its strokes for a half note), and the dot sits right of the flag.
    """
    measures = read_page(str(PAGES / "canaan_double_flags.png"))["measures"]
    do_el, alma, vivira = measures
    assert notes(do_el, "soprano") == ["C5/0.75", "Bb4/0.25"]
    assert notes(do_el, "alto") == ["F4/0.75", "E4/0.25"]
    assert notes(do_el, "tenor") == ["C4/0.75", "C4/0.25"]
    assert notes(do_el, "bass") == ["A3/0.75", "G3/0.25"]
    assert notes(alma, "soprano") == ["A4/3", "G4/0.75", "A4/0.25"]
    for v in ("soprano", "alto", "tenor", "bass"):
        assert sum(n["dur"] for n in alma[v]) == 4, (v, notes(alma, v))
        assert sum(n["dur"] for n in vivira[v]) == 3


def test_chorus_with_a_second_line_for_the_lower_voices():
    """A La Tierra De Canaán, chorus: under "A-llí no ha-brá" the lower voices sing their own words
    in italics ("Se-pa-ra-ción a-llí no ha-brá"). The two lines touch; they used to be read as one
    garbled line. The second goes on the tenor and bass notes."""
    d = read_page(str(PAGES / "canaan_chorus_two_lines.png"))
    assert "habrá" in d["lyric_lines"][0] and "Se" not in d["lyric_lines"][0]
    lower = d["lower_lyric_lines"][0]
    assert lower.startswith("Se") and "habrá" in lower
    tenor = [n["syllable"] for m in d["measures"] for n in m["tenor"] if n.get("syllable")]
    assert tenor[:2] == ["Se", "pa"]
    assert len(tenor) > len([n for m in d["measures"] for n in m["soprano"] if n.get("syllable")])
