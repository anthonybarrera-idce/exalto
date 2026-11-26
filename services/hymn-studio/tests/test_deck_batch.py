"""Tests for the slide-deck batch converter (no network: a fake transcriber stands in for Gemini)."""

import json

import music21

from hymn_processor.deck_batch import admin_text, clean_line, convert_hymn, to_m21_pitch
from hymn_processor.slides import SlidePage, google_export_url, group_hymns


def _page(i, heading, img):
    return SlidePage(index=i, heading=heading, image=img)


def _measure(syllables, pickup=False):
    sop = [{"pitch": "A4", "dur": 1.0, "tie": None, "syllable": s, "syllabic": sy} for s, sy in syllables]
    fill = lambda p: [{"pitch": p, "dur": 1.0, "tie": None} for _ in syllables]  # noqa: E731
    return {"pickup": pickup, "soprano": sop, "alto": fill("F4"), "tenor": fill("C4"), "bass": fill("Bb2")}


FAKE = {
    b"p1": {
        "title": "Canto de Prueba",
        "credits": ["Autor Uno", "Tr. Traductor Dos", "Example.com Productions"],
        "key_fifths": -1,
        "time_signature": "4/4",
        "measures": [_measure([("Tú", "single"), ("e", "begin"), ("res", "end"), ("mi", "single")])],
        "lyric_lines": ["Tú e-res mi"],
    },
    b"p2": {
        "measures": [_measure([("can", "begin"), ("to", "end"), ("Se", "begin"), ("ñor.", "end")])],
        "lyric_lines": ["can-to Se-ñor."],
    },
}


def fake_transcribe(page):
    return FAKE[page.image]


def test_google_export_url():
    url = "https://docs.google.com/presentation/d/1EfWpVMr8znM03KTcXhuIY5xTvnC9ddDq/edit?usp=sharing"
    assert google_export_url(url).endswith("/d/1EfWpVMr8znM03KTcXhuIY5xTvnC9ddDq/export/pptx")


def test_group_hymns_by_heading():
    pages = [
        _page(1, "Canto de Prueba 1", b"p1"),
        _page(2, "Canto de Prueba 1A", b"p2"),
        _page(3, "Canto de Prueba 2", b"p1"),
        _page(4, "Otro Himno 1", b"x"),
    ]
    hymns = group_hymns(pages)
    assert [h.title for h in hymns] == ["Canto de Prueba", "Otro Himno"]
    assert [v.number for v in hymns[0].verses] == [1, 2]
    assert [p.index for p in hymns[0].music_pages] == [1, 2]


def test_helpers():
    assert to_m21_pitch("Bb3") == "B-3"
    assert to_m21_pitch("F#4") == "F#4"
    assert clean_line("Tú e-res la le-tra y la_mu-sica.") == "Tú eres la letra y la musica."
    assert admin_text([{"type": "verse", "number": 1, "lines": ["a", "b"]}, {"type": "chorus", "lines": ["c"]}]) == "I\na\nb\n\nCoro\nc\n"


def test_convert_hymn_writes_piano_score_and_lyrics(tmp_path):
    hymn = group_hymns([
        _page(1, "Canto de Prueba 1", b"p1"),
        _page(2, "Canto de Prueba 1A", b"p2"),
        _page(3, "Canto de Prueba 2", b"p1"),  # same image as verse 1: no new lyrics
    ])[0]
    res = convert_hymn(hymn, fake_transcribe, tmp_path, "community", "es", log=lambda _: None)
    for key in ("piano_wav", "piano_soprano_wav", "piano_alto_wav", "piano_tenor_wav", "piano_bass_wav",
                "tone_wav", "tone_soprano_wav", "tone_bass_wav"):
        assert res.files[key].stat().st_size > 0

    assert any("Verse 2" in w for w in res.warnings)

    score = music21.converter.parse(str(res.files["musicxml"]))
    assert len(score.parts) == 2  # grand staff
    assert score.parts[0].getElementsByClass(music21.stream.Measure)[0].keySignature.sharps == -1
    sop_lyrics = [n.lyric for n in score.parts[0].recurse().notes if n.lyric]
    assert sop_lyrics[:4] == ["Tú", "e", "res", "mi"]
    assert any(p.nameWithOctave == "B-2" for p in score.parts[1].pitches)
    assert res.files["midi"].stat().st_size > 0

    assert res.files["lyrics_txt"].read_text() == "I\nTú eres mi canto Señor.\n"  # short verse: one balanced line
    doc = json.loads(res.files["hymn_json"].read_text())
    assert doc["title"] == "Canto de Prueba"
    assert doc["author"] == "Autor Uno; Tr. Traductor Dos"
    assert doc["lyrics"] == [{"type": "verse", "number": 1, "lines": ["Tú eres mi canto Señor."]}]
    assert doc["status"] == "draft"


def test_rebuild_score_uses_edited_syllables(tmp_path):
    hymn = group_hymns([_page(1, "Canto de Prueba 1", b"p1"), _page(2, "Canto de Prueba 1A", b"p2")])[0]
    res = convert_hymn(hymn, fake_transcribe, tmp_path, "community", "es", log=lambda _: None, render_audio=False)
    t = json.loads((res.out_dir / "transcription.json").read_text())
    t["pages"][0]["measures"][0]["soprano"][0]["syllable"] = "Yo"
    (res.out_dir / "transcription.json").write_text(json.dumps(t))
    from hymn_processor.deck_batch import rebuild_score

    rebuild_score(res.out_dir)
    score = music21.converter.parse(str(res.files["musicxml"]))
    assert [n.lyric for n in score.parts[0].recurse().notes if n.lyric][0] == "Yo"


def _bars(*beats):
    return [{"pickup": False, "soprano": [{"pitch": "A4", "dur": b}]} for b in beats]


def test_time_signature_printed_and_confirmed_by_the_measures():
    from hymn_processor.deck_batch import choose_time_signature

    page = {"time_signature": "3/4", "time_found": True, "measures": _bars(1, 3, 3, 3, 3, 2)}
    assert choose_time_signature([page]) == ("3/4", None)


def test_time_signature_inferred_when_none_is_printed():
    from hymn_processor.deck_batch import choose_time_signature, set_time_signature

    pages = [{"time_signature": "4/4", "time_found": False, "measures": _bars(3, 3, 3, 3)},
             {"time_signature": "4/4", "time_found": False, "measures": _bars(3, 3, 4, 2)}]
    ts, warning = choose_time_signature(pages)
    assert (ts, warning) == ("3/4", None)
    set_time_signature(pages, ts)
    assert [p["time_signature"] for p in pages] == ["3/4", "3/4"]
    assert pages[0]["measures"][0]["pickup"] is False  # a full 3/4 bar is not a pickup


def test_misread_time_signature_gives_way_to_the_measures():
    from hymn_processor.deck_batch import choose_time_signature

    page = {"time_signature": "5/4", "time_found": True, "measures": _bars(3, 3, 3, 3, 3)}
    ts, warning = choose_time_signature([page])
    assert ts == "3/4" and "5/4" in warning
    # 6/8 hymns count 3 quarter beats a bar: the printed 6/8 agrees and stays
    assert choose_time_signature([{**page, "time_signature": "6/8"}]) == ("6/8", None)


def test_time_signature_stays_when_the_measures_are_unclear():
    from hymn_processor.deck_batch import choose_time_signature

    page = {"time_signature": "4/4", "time_found": False, "measures": _bars(1, 2)}
    assert choose_time_signature([page]) == ("4/4", None)
    # other transcribers state the time signature without time_found
    assert choose_time_signature([{"time_signature": "2/2", "measures": _bars(4, 4, 4)}]) == ("2/2", None)


def test_reprocess_reads_saved_slides_again_and_keeps_studio_details(tmp_path):
    import copy

    from hymn_processor.deck_batch import reprocess_hymn

    verse2 = {"measures": [_measure([("Dios", "single"), ("es", "single"), ("a", "begin"), ("mor", "end")])],
              "lyric_lines": ["Dios es a-mor"]}
    first = {**FAKE, b"v2": verse2}
    hymn = group_hymns([_page(1, "Canto de Prueba 1", b"p1"), _page(2, "Canto de Prueba 1A", b"p2"),
                        _page(3, "Canto de Prueba 2", b"v2")])[0]
    res = convert_hymn(hymn, lambda p: copy.deepcopy(first[p.image]), tmp_path, "community", "es",
                       log=lambda _: None, render_audio=False)
    d = res.out_dir
    assert (d / "pages" / "verse2-1.png").read_bytes() == b"v2"  # verse slides are kept now

    # What someone set on Details in Studio
    doc = json.loads((d / "hymn.json").read_text())
    doc.update(title="Canto Corregido", number=42, tags=["Pascua"], hymnalId="idc-himnario")
    (d / "hymn.json").write_text(json.dumps(doc))

    # The "AI" reads the first page's lyrics differently
    ai = copy.deepcopy(first)
    ai[b"p1"]["lyric_lines"] = ["Tú e-res mi gran"]
    seen = []
    reprocess_hymn(d, "claude", transcriber=lambda p: (seen.append(p.image), copy.deepcopy(ai[p.image]))[1],
                   log=lambda _: None, render_audio=False)

    assert sorted(seen) == [b"p1", b"p2", b"v2"]  # every saved slide was read again
    new = json.loads((d / "hymn.json").read_text())
    assert (new["title"], new["number"], new["tags"], new["hymnalId"]) == ("Canto Corregido", 42, ["Pascua"], "idc-himnario")
    assert new["lyrics"][0]["lines"] == ["Tú eres mi gran canto Señor."]
    assert new["lyrics"][1]["lines"] == ["Dios es amor"]
    assert json.loads((d / "review.json").read_text())["title"] == "Canto Corregido"
    assert (d / f"{d.name}.musicxml").exists()  # same folder and file names
    assert json.loads((d / ".before-reprocess" / "hymn.json").read_text())["number"] == 42  # the earlier files are kept


def test_reprocess_keeps_lyrics_of_verses_whose_slides_were_not_saved(tmp_path):
    import copy

    from hymn_processor.deck_batch import reprocess_hymn

    verse2 = {"measures": [_measure([("Dios", "single")])], "lyric_lines": ["Dios"]}
    first = {**FAKE, b"v2": verse2}
    hymn = group_hymns([_page(1, "Canto de Prueba 1", b"p1"), _page(2, "Canto de Prueba 1A", b"p2"),
                        _page(3, "Canto de Prueba 2", b"v2")])[0]
    d = convert_hymn(hymn, lambda p: copy.deepcopy(first[p.image]), tmp_path, "community", "es",
                     log=lambda _: None, render_audio=False).out_dir
    (d / "pages" / "verse2-1.png").unlink()  # as imported before verse slides were kept
    reprocess_hymn(d, "gemini", transcriber=lambda p: copy.deepcopy(first[p.image]), log=lambda _: None, render_audio=False)
    assert json.loads((d / "hymn.json").read_text())["lyrics"][1]["lines"] == ["Dios"]


def test_chorus_slides_join_the_score_once():
    """Decks show "<Hymn> 1", "<Hymn> 1A", "CORO 1", "CORO 2", then the next verse and the chorus again."""
    from hymn_processor.slides import group_hymns

    headings = ["Canaán 1", "Canaán 1A", "CORO 1", "CORO 2", "Canaán 2", "Canaán 2A", "CORO 1", "CORO 2",
                "Canaán 3", "Canaán 3A", "CORO 1", "CORO 2"]
    pages = [_page(i, h, f"img{i}".encode()) for i, h in enumerate(headings, start=1)]
    (hymn,) = group_hymns(pages)
    assert hymn.title == "Canaán"
    assert [(v.number, [p.index for p in v.pages]) for v in hymn.verses] == [(1, [1, 2]), (2, [5, 6]), (3, [9, 10])]
    assert [p.index for p in hymn.chorus] == [3, 4]
    assert hymn.chorus_times == 3
    assert [p.index for p in hymn.music_pages] == [1, 2, 3, 4]


def test_chorus_lyrics_get_their_own_section(tmp_path):
    from hymn_processor.slides import group_hymns

    def page(syllables):
        return {"title": None, "credits": [], "key_fifths": 0, "time_signature": "4/4", "tempo_bpm": 90,
                "measures": [_measure([(s, "single") for s in syllables])], "lyric_lines": [" ".join(syllables)]}

    texts = {"V 1": ["voy", "a", "la", "tierra"], "CORO": ["allí", "no", "habrá", "llanto"], "V 2": ["florece", "para", "mí", "flor"]}
    slides = [_page(1, "V 1", b"a"), _page(2, "CORO", b"c"), _page(3, "V 2", b"b"), _page(4, "CORO", b"c")]
    (hymn,) = group_hymns(slides)
    res = convert_hymn(hymn, lambda p: page(texts[p.heading]), tmp_path, "test", "es", log=lambda *_: None,
                       render_audio=False, correct_lyrics=False)
    doc = json.loads(res.files["hymn_json"].read_text())
    assert [(s["type"], s.get("number")) for s in doc["lyrics"]] == [("verse", 1), ("chorus", None), ("verse", 2)]
    assert doc["lyrics"][1]["lines"] == ["allí no habrá llanto"]
    assert doc["repeatChorus"] is True


def _music_page(tune: str) -> dict:
    notes = [{"pitch": p, "dur": 1.0} for p in tune.split()]
    return {"measures": [{"soprano": notes, "alto": [], "tenor": [], "bass": notes}]}


def test_untitled_slides_split_into_verses_and_chorus_by_repeated_music():
    from hymn_processor.deck_batch import split_by_repeats

    A, B, C = "C4 D4 E4 F4", "G4 A4 B4 C5", "E4 E4 D4 D4"
    # Más De Jesús: verse A B, chorus C B, then verses 2-4 as A B with no chorus slides.
    assert split_by_repeats([_music_page(t) for t in (A, B, C, B, A, B, A, B, A, B)]) == (2, 2, [0, 4, 6, 8], 1)
    # A chorus shown after every verse can't be told from a 2-page verse: it stays part of it.
    assert split_by_repeats([_music_page(t) for t in (A, C, A, C)]) == (2, 0, [0, 2], 0)
    # A plain strophic hymn: one page per verse.
    assert split_by_repeats([_music_page(A)] * 3) == (1, 0, [0, 1, 2], 0)
    # One long score that never repeats stays as it is.
    assert split_by_repeats([_music_page(t) for t in (A, B, C)]) is None
    # Music coming back mid-score (A B A C) isn't a new verse.
    assert split_by_repeats([_music_page(t) for t in (A, B, A, C)]) is None
