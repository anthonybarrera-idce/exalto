"""Hyphens touching letters in a lyric line, split words across systems, and even line wrapping."""

import shutil
from pathlib import Path

import numpy as np
import pytest
from PIL import Image, ImageDraw, ImageFont

from hymn_processor.deck_batch import balance_lines
from hymn_processor.lyrics_fix import join_broken_words
from hymn_processor.shape_omr import _find_hyphens, _line_text, _ocr_syllables, _syllables_from_chars, _touches_letter

FONTS = ["/System/Library/Fonts/Supplemental/Arial.ttf", "/Library/Fonts/Arial.ttf",
         "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "C:/Windows/Fonts/arial.ttf"]
FONT = next((f for f in FONTS if Path(f).exists()), None)
needs_font = pytest.mark.skipif(FONT is None, reason="no TrueType font to draw test lyrics")


def draw_line(parts: list[str], hyphen_touch: bool, size: int = 64) -> np.ndarray:
    """A lyric line like the slides': syllables with a hyphen bar between them (True = ink).

    With hyphen_touch the bar is drawn right into the letters on both sides, as when the slide's
    spacing is tight ("nun-cia")."""
    font = ImageFont.truetype(FONT, size)
    im = Image.new("L", (1600, int(size * 1.6)), 255)
    d = ImageDraw.Draw(im)
    x, base = 40, int(size * 0.2)
    xh_top, xh_bot = None, None
    for k, part in enumerate(parts):
        if k:
            # hyphen: a level bar half-way up the x-height
            bbox = d.textbbox((0, base), "x", font=font)
            xh_top, xh_bot = bbox[1], bbox[3]
            mid = (xh_top + xh_bot) // 2
            t = max(3, size // 14)
            w = size // 3
            gap = -2 if hyphen_touch else size // 8
            d.rectangle([x + gap, mid - t // 2, x + gap + w + (-2 * gap if hyphen_touch else 0), mid + t // 2], fill=0)
            x += w + (0 if hyphen_touch else 2 * (size // 8))
        d.text((x, base), part, font=font, fill=0)
        x = d.textbbox((x, base), part, font=font)[2]
    return np.array(im) < 128


@needs_font
def test_finds_a_hyphen_touching_letters():
    band = draw_line(["nun", "cia"], hyphen_touch=True)
    found = _find_hyphens(band)
    assert len(found) == 1
    assert _touches_letter(band, found[0])


@needs_font
def test_finds_free_hyphens_and_not_letter_strokes():
    band = draw_line(["can", "to"], hyphen_touch=False)
    assert len(_find_hyphens(band)) == 1
    # The J's hook, the bars of e/t/f and the arches of m and n aren't hyphens.
    for word in (["Jehová"], ["mente"], ["fuerte"], ["Santo"]):
        assert _find_hyphens(draw_line(word, hyphen_touch=False)) == [], word


@needs_font
@pytest.mark.skipif(shutil.which("tesseract") is None and not Path("/opt/homebrew/bin/tesseract").exists(),
                    reason="tesseract not installed")
def test_touching_hyphen_reads_as_one_word_split_in_syllables():
    for parts in (["nun", "cia"], ["cons", "tan", "te"]):
        syl = _ocr_syllables(draw_line(parts, hyphen_touch=True))
        assert [s["text"] for s in syl] == parts
        assert [s["cont"] for s in syl] == [True] * (len(parts) - 1) + [False]


def test_typographic_hyphens_from_a_pdf_split_syllables():
    chars = [("S", 0, 10), ("e", 11, 20), ("‐", 22, 28), ("ñ", 30, 40), ("o", 41, 50), ("r", 51, 58)]
    assert [(s["text"], s["cont"]) for s in _syllables_from_chars(chars)] == [("Se", True), ("ñor", False)]


def test_line_keeps_hyphen_when_word_goes_on_to_the_next_system():
    syl = [{"text": "El", "x": 0, "cont": False}, {"text": "E", "x": 1, "cont": True}, {"text": "van", "x": 2, "cont": True}]
    assert _line_text(syl) == "El Evan-"


def test_words_split_across_systems_and_pages_are_joined():
    pages = [{"lyric_lines": ["Cristo reanima tu a-"]}, {"lyric_lines": ["mor Y sigue la", "El Santo Evan-", "gelio que Cristo"]}]
    join_broken_words(pages)
    assert pages[0]["lyric_lines"] == ["Cristo reanima tu amor"]
    assert pages[1]["lyric_lines"] == ["Y sigue la", "El Santo Evangelio", "que Cristo"]


def test_balance_lines_reads_like_the_printed_hymn():
    systems = ["Iglesia de", "Cristo reanima tu", "amor Y sigue la", "senda que Cristo trazó Anuncia constante con",
               "fe y con valor, El Santo Evan", "gelio que Cristo enseñó."]
    joined = [" ".join(systems).replace("Evan gelio", "Evangelio")]
    assert balance_lines(joined) == [
        "Iglesia de Cristo reanima tu amor",
        "Y sigue la senda que Cristo trazó",
        "Anuncia constante con fe y con valor,",
        "El Santo Evangelio que Cristo enseñó.",
    ]


def test_balance_lines_starts_sentences_on_new_lines_and_keeps_short_text():
    text = ("Y temed delante de él toda la tierra, y temed delante de él toda la tierra. "
            "Porque grande es Jehová, nuestro Dios.")
    lines = balance_lines([text])
    assert lines[-1].startswith("Porque")
    assert all(len(l) <= 44 for l in lines)
    assert not any(l.split()[-1] in ("de", "la", "el", "y") for l in lines[:-1])
    assert balance_lines(["Santo, santo, santo"]) == ["Santo, santo, santo"]
    assert balance_lines([]) == []


FIXTURE = Path(__file__).resolve().parent / "fixtures" / "lyric-line-touching-hyphen.png"


@pytest.mark.skipif(shutil.which("tesseract") is None and not Path("/opt/homebrew/bin/tesseract").exists(),
                    reason="tesseract not installed")
def test_real_slide_line_with_a_hyphen_touching_nun_cia():
    # From an "Iglesia de Cristo" slide: "A - nun-cia cons-tan-te con", the "n-c" hyphen touching
    # both letters. Tesseract alone read it as "nun<c ia".
    band = np.array(Image.open(FIXTURE).convert("L")) < 128
    syl = _ocr_syllables(band)
    assert [s["text"] + ("-" if s["cont"] else "") for s in syl][:3] == ["A-", "nun-", "cia"]


def test_lone_capital_i_read_as_a_bar_is_kept():
    # Tesseract reads a sans-serif "I" on its own as "|" ("I - gle-sia").
    chars = [("|", 0, 6), ("-", 40, 55), ("g", 100, 120), ("l", 122, 126), ("e", 128, 146)]
    assert [(s["text"], s["cont"]) for s in _syllables_from_chars(chars)] == [("I", True), ("gle", False)]


def test_word_carried_over_from_the_previous_system_continues_on_its_notes():
    from hymn_processor.shape_omr import _place_syllables

    notes = [{"_x": 10.0}, {"_x": 50.0}]
    _place_syllables([{"text": "ge", "x": 10, "cont": True}, {"text": "lio", "x": 50, "cont": False}], notes, 10, carry=True)
    assert [n["syllabic"] for n in notes] == ["middle", "end"]


def test_word_carried_over_to_the_next_page_continues_on_its_notes():
    from hymn_processor.lyrics_fix import join_syllables_across_pages

    page = lambda *syl: {"measures": [{"soprano": [{"syllable": s, "syllabic": k} for s, k in syl]}]}
    pages = [page(("tu", "single"), ("a", "begin")), page(("mor", "single"), ("Y", "single"))]
    join_syllables_across_pages(pages)
    assert [n["syllabic"] for n in pages[1]["measures"][0]["soprano"]] == ["end", "single"]
