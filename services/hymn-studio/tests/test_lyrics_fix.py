"""Offline lyric correction for OCR'd hymn text."""

from hymn_processor.lyrics_fix import correct_line, correct_page, syllabify


def test_fixes_typical_ocr_mistakes():
    assert correct_line("Gloia a tunombre tralgó.")[0] == "Gloria a tu nombre traigo."
    assert correct_line("Tú eresRey de Reyes,")[0] == "Tú eres Rey de Reyes,"
    assert correct_line("Te adoro aTí,")[0] == "Te adoro a Tí,"
    assert correct_line("Te adoro aTíGrandioso Rey,Nadie")[0] == "Te adoro a Tí Grandioso Rey, Nadie"
    assert correct_line("Tú eres la letta y la musica.")[0] == "Tú eres la letra y la música."


def test_keeps_imperatives_and_splits_joined_words():
    assert correct_line("Y temed delante deél toda la tierra,")[0] == "Y temed delante de él toda la tierra,"
    assert correct_line("adorad a Jehová")[0] == "adorad a Jehová"


def test_leaves_correct_lyrics_alone():
    line = "Por eso ahora alabo con este mi cántico"
    assert correct_line(line) == (line, [])


def test_syllabify():
    assert syllabify("melodía") == ["me", "lo", "dí", "a"]
    assert syllabify("nombre") == ["nom", "bre"]
    assert syllabify("Salvador") == ["Sal", "va", "dor"]


def test_fixes_syllables_on_notes_when_count_matches():
    notes = [{"pitch": "A4", "dur": 1, "syllable": s, "syllabic": sy}
             for s, sy in (("le", "begin"), ("tta", "end"), ("Glo", "begin"), ("ia,", "end"))]
    page = {"lyric_lines": ["la letta"], "measures": [{"soprano": notes}]}
    changes = correct_page(page)
    assert ("letta", "letra") in changes
    assert [n["syllable"] for n in notes] == ["le", "tra", "Glo", "ria,"]


def test_keeps_prefixed_verbs_and_past_tense_whole():
    from hymn_processor.lyrics_fix import correct_word

    assert correct_word("reanima") == "reanima"  # not "re anima"
    assert correct_word("trazó") == "trazó"  # past tense of trazar, not "trazo"
    assert correct_word("venció") == "venció"


def test_lowercase_letter_misread_as_capital_mid_word():
    from hymn_processor.lyrics_fix import correct_word

    assert correct_word("traZó") == "trazó"  # z/Z look alike: not "tra Zó"
    assert correct_word("eresRey") == "eres Rey"  # a real capital still marks two words
    assert correct_word("aTí") == "a Tí"
