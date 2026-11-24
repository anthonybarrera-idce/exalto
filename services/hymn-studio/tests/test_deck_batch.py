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

    assert res.files["lyrics_txt"].read_text() == "I\nTú eres mi\ncanto Señor.\n"
    doc = json.loads(res.files["hymn_json"].read_text())
    assert doc["title"] == "Canto de Prueba"
    assert doc["author"] == "Autor Uno; Tr. Traductor Dos"
    assert doc["lyrics"] == [{"type": "verse", "number": 1, "lines": ["Tú eres mi", "canto Señor."]}]
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
