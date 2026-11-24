"""Typed-lyrics decks (no sheet music)."""

from hymn_processor.lyrics_deck import admin_text, is_lyrics_deck, parse_lyrics_deck
from hymn_processor.slides import SlidePage


def slide(i, *paras):
    return SlidePage(index=i, heading=paras[0] if paras else "", image=None, paragraphs=list(paras))


DECK = [
    slide(1, "34 N.V.", "Te Exaltaré", "I", "Te exaltaré, mi Dios, mi Rey,", "y para siempre."),
    slide(2, "Coro I", "", "Grande es Jehová y", "Cada día te bendeciré", "."),
    slide(3, "II", "Generación a generación celebrarán tus obras,"),
    slide(4, "Coro I", "", "Grande es Jehová y", "Cada día te bendeciré."),
    slide(5),
]


def test_detects_lyrics_deck():
    assert is_lyrics_deck(DECK)
    assert not is_lyrics_deck([SlidePage(index=1, heading="x", image=b"png", paragraphs=["a", "b", "c", "d"])])


def test_parses_number_title_and_sections():
    p = parse_lyrics_deck(DECK)
    assert (p["title"], p["number"], p["hymnal_code"]) == ("Te Exaltaré", "34", "N.V.")
    assert [s["type"] for s in p["sections"]] == ["verse", "chorus", "verse"]  # repeated chorus kept once
    assert p["repeat_chorus"] is True
    assert p["sections"][1]["lines"] == ["Grande es Jehová y", "Cada día te bendeciré."]  # lone "." joined
    assert admin_text(p["sections"]).startswith("I\nTe exaltaré, mi Dios, mi Rey,")
