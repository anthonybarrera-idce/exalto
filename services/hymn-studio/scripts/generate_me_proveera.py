"""Script to generate the complete MusicXML score for 'Me Proveerá tu Amor'."""

import music21
from music21 import stream, note, chord, meter, tempo, key, metadata

def build_me_proveera_score():
    s = stream.Score()
    s.metadata = metadata.Metadata()
    s.metadata.title = "Me Proveerá tu Amor"
    s.metadata.composer = "Luis Angel Salazar Araujo (2022)"
    s.metadata.movementName = "Salmos 23:4"

    # Part 1: Soprano & Alto (Treble Staff)
    p_treble = stream.Part()
    p_treble.id = "P1"
    p_treble.partName = "Soprano & Alto"

    # Part 2: Tenor & Bass (Bass Staff)
    p_bass = stream.Part()
    p_bass.id = "P2"
    p_bass.partName = "Tenor & Bass"

    # Global attributes
    mm = tempo.MetronomeMark(number=104)
    ks = key.KeySignature(-1) # 1 flat (Bb) -> F major / D minor
    ts = meter.TimeSignature("4/4")

    # We will build measure by measure
    # Measures 1-4: Tenor & Bass lead, Soprano & Alto rest
    def add_verse_1_bass(m_idx, lyrics_words):
        m_t = stream.Measure(number=m_idx)
        m_b = stream.Measure(number=m_idx)
        if m_idx == 1:
            m_t.append([mm, ks, ts, music21.clef.TrebleClef()])
            m_b.append([mm, ks, ts, music21.clef.BassClef()])

        # Treble has whole rest
        r = note.Rest(quarterLength=4.0)
        m_t.append(r)

        # Bass notes
        w1, w2, w3, w4 = lyrics_words
        # Note 1: 1.5 beats (dotted quarter)
        c1 = chord.Chord(["D3", "F3"], quarterLength=1.5)
        c1.lyric = w1
        # Note 2: 0.5 beats (8th)
        c2 = chord.Chord(["F3", "A3"], quarterLength=0.5)
        c2.lyric = w2
        # Note 3: 1.0 beat (quarter)
        c3 = chord.Chord(["F3", "A3"], quarterLength=1.0)
        c3.lyric = w3
        # Note 4: 1.0 beat (quarter)
        c4 = chord.Chord(["E3", "G3"], quarterLength=1.0)
        c4.lyric = w4

        m_b.append([c1, c2, c3, c4])
        return m_t, m_b

    def add_verse_1_even_bass(m_idx, lyrics_words):
        m_t = stream.Measure(number=m_idx)
        m_b = stream.Measure(number=m_idx)
        m_t.append(note.Rest(quarterLength=4.0))

        w1, w2, w3, w4 = lyrics_words
        c1 = chord.Chord(["F3", "A3"], quarterLength=1.0)
        c1.lyric = w1
        c2 = chord.Chord(["D3", "F3"], quarterLength=1.0)
        c2.lyric = w2
        c3 = chord.Chord(["E3", "G3"], quarterLength=1.0)
        c3.lyric = w3
        c4 = chord.Chord(["D3", "F3"], quarterLength=1.0)
        c4.lyric = w4

        m_b.append([c1, c2, c3, c4])
        return m_t, m_b

    # Page 1
    m1_t, m1_b = add_verse_1_bass(1, ["En", "la", "no -", "che"])
    m2_t, m2_b = add_verse_1_even_bass(2, ["más", "de -", "sier -", "ta,"])
    m3_t, m3_b = add_verse_1_bass(3, ["en", "la", "tem -", "pes -"])
    m4_t, m4_b = add_verse_1_even_bass(4, ["tad", "más", "al -", "ta,"])

    # Page 2
    m5_t, m5_b = add_verse_1_bass(5, ["En", "el", "va -", "lle"])
    m6_t, m6_b = add_verse_1_even_bass(6, ["de", "la", "muer -", "te,"])
    m7_t, m7_b = add_verse_1_bass(7, ["tu", "ca -", "ya -", "do"])
    m8_t, m8_b = add_verse_1_even_bass(8, ["me a -", "com -", "pa -", "ña"])

    for mt, mb in [(m1_t, m1_b), (m2_t, m2_b), (m3_t, m3_b), (m4_t, m4_b),
                   (m5_t, m5_b), (m6_t, m6_b), (m7_t, m7_b), (m8_t, m8_b)]:
        p_treble.append(mt)
        p_bass.append(mb)

    # Page 3 & 4: Soprano and Alto join! (Measures 9-16)
    def add_satb_verse_measure(m_idx, lyr_t, lyr_b):
        m_t = stream.Measure(number=m_idx)
        m_b = stream.Measure(number=m_idx)

        w1, w2, w3, w4 = lyr_t
        ct1 = chord.Chord(["F4", "A4"], quarterLength=1.5)
        ct1.lyric = w1
        ct2 = chord.Chord(["A4", "C5"], quarterLength=0.5)
        ct2.lyric = w2
        ct3 = chord.Chord(["A4", "C5"], quarterLength=1.0)
        ct3.lyric = w3
        ct4 = chord.Chord(["G4", "B-4"], quarterLength=1.0)
        ct4.lyric = w4

        cb1 = chord.Chord(["D3", "F3"], quarterLength=1.5)
        cb1.lyric = lyr_b[0]
        cb2 = chord.Chord(["F3", "A3"], quarterLength=0.5)
        cb2.lyric = lyr_b[1]
        cb3 = chord.Chord(["F3", "A3"], quarterLength=1.0)
        cb3.lyric = lyr_b[2]
        cb4 = chord.Chord(["E3", "G3"], quarterLength=1.0)
        cb4.lyric = lyr_b[3]

        m_t.append([ct1, ct2, ct3, ct4])
        m_b.append([cb1, cb2, cb3, cb4])
        return m_t, m_b

    def add_satb_verse_even_measure(m_idx, lyr_t, lyr_b):
        m_t = stream.Measure(number=m_idx)
        m_b = stream.Measure(number=m_idx)

        w1, w2, w3, w4 = lyr_t
        ct1 = chord.Chord(["A4", "C5"], quarterLength=1.0)
        ct1.lyric = w1
        ct2 = chord.Chord(["F4", "A4"], quarterLength=1.0)
        ct2.lyric = w2
        ct3 = chord.Chord(["G4", "B-4"], quarterLength=1.0)
        ct3.lyric = w3
        ct4 = chord.Chord(["F4", "A4"], quarterLength=1.0)
        ct4.lyric = w4

        cb1 = chord.Chord(["F3", "A3"], quarterLength=1.0)
        cb1.lyric = lyr_b[0]
        cb2 = chord.Chord(["D3", "F3"], quarterLength=1.0)
        cb2.lyric = lyr_b[1]
        cb3 = chord.Chord(["E3", "G3"], quarterLength=1.0)
        cb3.lyric = lyr_b[2]
        cb4 = chord.Chord(["D3", "F3"], quarterLength=1.0)
        cb4.lyric = lyr_b[3]

        m_t.append([ct1, ct2, ct3, ct4])
        m_b.append([cb1, cb2, cb3, cb4])
        return m_t, m_b

    m9_t, m9_b = add_satb_verse_measure(9, ["Aun -", "que es -", "té", "en"], ["Aun -", "que es -", "té", "en"])
    m10_t, m10_b = add_satb_verse_even_measure(10, ["a -", "go -", "ní -", "a,"], ["a -", "go -", "ní -", "a,"])
    m11_t, m11_b = add_satb_verse_measure(11, ["aun", "que", "no", "ten -"], ["aun", "que", "no", "ten -"])
    m12_t, m12_b = add_satb_verse_even_measure(12, ["ga e -", "ner -", "gí -", "a,"], ["ga e -", "ner -", "gí -", "a,"])
    m13_t, m13_b = add_satb_verse_measure(13, ["Nun -", "ca es -", "tá", "to -"], ["Nun -", "ca es -", "tá", "to -"])
    m14_t, m14_b = add_satb_verse_even_measure(14, ["do", "per -", "di -", "do"], ["do", "per -", "di -", "do"])
    m15_t, m15_b = add_satb_verse_measure(15, ["por -", "que", "Tú", "es -"], ["por -", "que", "Tú", "es -"])
    m16_t, m16_b = add_satb_verse_even_measure(16, ["tás", "con -", "mi -", "go."], ["tás", "con -", "mi -", "go."])

    for mt, mb in [(m9_t, m9_b), (m10_t, m10_b), (m11_t, m11_b), (m12_t, m12_b),
                   (m13_t, m13_b), (m14_t, m14_b), (m15_t, m15_b), (m16_t, m16_b)]:
        p_treble.append(mt)
        p_bass.append(mb)

    # Page 5 & 6: Precoro (Measures 17-24)
    def add_precoro_call(m_idx, lyr_t):
        m_t = stream.Measure(number=m_idx)
        m_b = stream.Measure(number=m_idx)

        ct1 = chord.Chord(["F4", "A4"], quarterLength=1.5)
        ct1.lyric = lyr_t[0]
        ct2 = chord.Chord(["G4", "B-4"], quarterLength=0.5)
        ct2.lyric = lyr_t[1]
        ct3 = chord.Chord(["F4", "A4"], quarterLength=1.0)
        ct3.lyric = lyr_t[2]
        rt = note.Rest(quarterLength=1.0)

        cb1 = chord.Chord(["D3", "F3"], quarterLength=1.5)
        cb1.lyric = lyr_t[0]
        cb2 = chord.Chord(["E-3", "G3"], quarterLength=0.5)
        cb2.lyric = lyr_t[1]
        cb3 = chord.Chord(["D3", "F3"], quarterLength=1.0)
        cb3.lyric = lyr_t[2]
        rb = note.Rest(quarterLength=1.0)

        m_t.append([ct1, ct2, ct3, rt])
        m_b.append([cb1, cb2, cb3, rb])
        return m_t, m_b

    def add_precoro_resp(m_idx, lyr_t):
        m_t = stream.Measure(number=m_idx)
        m_b = stream.Measure(number=m_idx)

        ct1 = chord.Chord(["F4", "A4"], quarterLength=1.0)
        ct1.lyric = lyr_t[0]
        ct2 = chord.Chord(["G4", "B-4"], quarterLength=1.0)
        ct2.lyric = lyr_t[1]
        ct3 = chord.Chord(["A4", "C5"], quarterLength=1.0)
        ct3.lyric = lyr_t[2]
        ct4 = chord.Chord(["B-4", "D5"], quarterLength=1.0)
        ct4.lyric = lyr_t[3]

        cb1 = chord.Chord(["D3", "F3"], quarterLength=1.0)
        cb1.lyric = lyr_t[0]
        cb2 = chord.Chord(["E3", "G3"], quarterLength=1.0)
        cb2.lyric = lyr_t[1]
        cb3 = chord.Chord(["F3", "A3"], quarterLength=1.0)
        cb3.lyric = lyr_t[2]
        cb4 = chord.Chord(["G3", "B-3"], quarterLength=1.0)
        cb4.lyric = lyr_t[3]

        m_t.append([ct1, ct2, ct3, ct4])
        m_b.append([cb1, cb2, cb3, cb4])
        return m_t, m_b

    m17_t, m17_b = add_precoro_call(17, ["Só -", "lo", "tú,"])
    m18_t, m18_b = add_precoro_resp(18, ["Tú", "me ins -", "pir -", "ras,"])
    m19_t, m19_b = add_precoro_call(19, ["Só -", "lo", "tú,"])
    m20_t, m20_b = add_precoro_resp(20, ["Tú", "me", "cui -", "das"])
    m21_t, m21_b = add_precoro_call(21, ["Aun -", "que el", "mal"])
    m22_t, m22_b = add_precoro_resp(22, ["es -", "té", "cer -", "ca,"])

    # m.23: En Jehová
    m23_t = stream.Measure(number=23)
    m23_b = stream.Measure(number=23)
    c23_t1 = chord.Chord(["A4", "C5"], quarterLength=1.5); c23_t1.lyric = "En"
    c23_t2 = chord.Chord(["A4", "C5"], quarterLength=0.5); c23_t2.lyric = "Jeho-"
    c23_t3 = chord.Chord(["A4", "C5"], quarterLength=1.0); c23_t3.lyric = "vá"
    r23_t = note.Rest(quarterLength=1.0)
    c23_b1 = chord.Chord(["F3", "A3"], quarterLength=1.5); c23_b1.lyric = "En"
    c23_b2 = chord.Chord(["F3", "A3"], quarterLength=0.5); c23_b2.lyric = "Jeho-"
    c23_b3 = chord.Chord(["F3", "A3"], quarterLength=1.0); c23_b3.lyric = "vá"
    r23_b = note.Rest(quarterLength=1.0)
    m23_t.append([c23_t1, c23_t2, c23_t3, r23_t])
    m23_b.append([c23_b1, c23_b2, c23_b3, r23_b])

    # m.24: siempre está mi fe
    m24_t = stream.Measure(number=24)
    m24_b = stream.Measure(number=24)
    c24_t1 = chord.Chord(["G4", "B-4"], quarterLength=1.0); c24_t1.lyric = "siem -"
    c24_t2 = chord.Chord(["G4", "B-4"], quarterLength=1.0); c24_t2.lyric = "pre es -"
    c24_t3 = chord.Chord(["F4", "A4"], quarterLength=1.0); c24_t3.lyric = "tá"
    c24_t4 = chord.Chord(["E4", "G4"], quarterLength=1.0); c24_t4.lyric = "mi"
    c24_b1 = chord.Chord(["E-3", "G3"], quarterLength=1.0); c24_b1.lyric = "siem -"
    c24_b2 = chord.Chord(["E-3", "G3"], quarterLength=1.0); c24_b2.lyric = "pre es -"
    c24_b3 = chord.Chord(["D3", "F3"], quarterLength=1.0); c24_b3.lyric = "tá"
    c24_b4 = chord.Chord(["C#3", "E3"], quarterLength=1.0); c24_b4.lyric = "mi"
    m24_t.append([c24_t1, c24_t2, c24_t3, c24_t4])
    m24_b.append([c24_b1, c24_b2, c24_b3, c24_b4])

    # m.25: fe (held)
    m25_t = stream.Measure(number=25)
    m25_b = stream.Measure(number=25)
    c25_t = chord.Chord(["D4", "F4"], quarterLength=4.0); c25_t.lyric = "fe."
    c25_b = chord.Chord(["D2", "D3"], quarterLength=4.0); c25_b.lyric = "fe."
    m25_t.append(c25_t)
    m25_b.append(c25_b)

    for mt, mb in [(m17_t, m17_b), (m18_t, m18_b), (m19_t, m19_b), (m20_t, m20_b),
                   (m21_t, m21_b), (m22_t, m22_b), (m23_t, m23_b), (m24_t, m24_b),
                   (m25_t, m25_b)]:
        p_treble.append(mt)
        p_bass.append(mb)

    # Pages 7-10: Coro (Chorus)
    # m.26: Coro start
    m26_t = stream.Measure(number=26)
    m26_b = stream.Measure(number=26)
    # Treble: Rest for 1.5, then "Si estás con-mi-go yo"
    rt26 = note.Rest(quarterLength=1.5)
    ct26_1 = chord.Chord(["A4", "C5"], quarterLength=0.5); ct26_1.lyric = "Si"
    ct26_2 = chord.Chord(["A4", "C5"], quarterLength=0.5); ct26_2.lyric = "es-"
    ct26_3 = chord.Chord(["A4", "C5"], quarterLength=0.5); ct26_3.lyric = "tás"
    ct26_4 = chord.Chord(["B-4", "D5"], quarterLength=0.5); ct26_4.lyric = "con-"
    ct26_5 = chord.Chord(["B-4", "D5"], quarterLength=0.5); ct26_5.lyric = "mi-"
    m26_t.append([rt26, ct26_1, ct26_2, ct26_3, ct26_4, ct26_5])

    # Bass: "Se-ñor, si tú con-mi-go vas,"
    cb26_1 = chord.Chord(["F3", "A3"], quarterLength=1.5); cb26_1.lyric = "Se-"
    cb26_2 = chord.Chord(["F3", "A3"], quarterLength=0.5); cb26_2.lyric = "ñor,"
    rb26 = note.Rest(quarterLength=0.5)
    cb26_3 = chord.Chord(["E3", "G3"], quarterLength=0.5); cb26_3.lyric = "si"
    cb26_4 = chord.Chord(["F3", "A3"], quarterLength=1.0); cb26_4.lyric = "tú"
    m26_b.append([cb26_1, cb26_2, rb26, cb26_3, cb26_4])

    # m.27: "No te-me-ré ja-más"
    m27_t = stream.Measure(number=27)
    m27_b = stream.Measure(number=27)
    ct27_1 = chord.Chord(["A4", "C5"], quarterLength=1.0); ct27_1.lyric = "go"
    ct27_2 = chord.Chord(["B-4", "D5"], quarterLength=1.0); ct27_2.lyric = "yo"
    ct27_3 = chord.Chord(["A4", "C5"], quarterLength=1.0); ct27_3.lyric = "No"
    ct27_4 = chord.Chord(["A4", "C5"], quarterLength=1.0); ct27_4.lyric = "te-"
    m27_t.append([ct27_1, ct27_2, ct27_3, ct27_4])

    cb27_1 = chord.Chord(["G3", "B-3"], quarterLength=1.0); cb27_1.lyric = "con-"
    cb27_2 = chord.Chord(["F3", "A3"], quarterLength=1.0); cb27_2.lyric = "mi-"
    cb27_3 = chord.Chord(["E3", "G3"], quarterLength=1.0); cb27_3.lyric = "go"
    cb27_4 = chord.Chord(["D3", "F3"], quarterLength=1.0); cb27_4.lyric = "vas,"
    m27_b.append([cb27_1, cb27_2, cb27_3, cb27_4])

    # m.28: "Me pro-ve-rá tu a-mor"
    m28_t = stream.Measure(number=28)
    m28_b = stream.Measure(number=28)
    ct28_1 = chord.Chord(["A4", "C5"], quarterLength=1.0); ct28_1.lyric = "me-"
    ct28_2 = chord.Chord(["B-4", "D5"], quarterLength=1.0); ct28_2.lyric = "ré"
    ct28_3 = chord.Chord(["A4", "C5"], quarterLength=1.0); ct28_3.lyric = "ja-"
    ct28_4 = chord.Chord(["F4", "A4"], quarterLength=1.0); ct28_4.lyric = "más,"
    m28_t.append([ct28_1, ct28_2, ct28_3, ct28_4])

    cb28_1 = chord.Chord(["F3", "A3"], quarterLength=1.0); cb28_1.lyric = "Se-"
    cb28_2 = chord.Chord(["E3", "G3"], quarterLength=1.0); cb28_2.lyric = "ñor,"
    cb28_3 = chord.Chord(["D3", "F3"], quarterLength=1.0); cb28_3.lyric = "no"
    cb28_4 = chord.Chord(["D3", "F3"], quarterLength=1.0); cb28_4.lyric = "te-"
    m28_b.append([cb28_1, cb28_2, cb28_3, cb28_4])

    # m.29: "Me pro-ve-rá tu a-mor"
    m29_t = stream.Measure(number=29)
    m29_b = stream.Measure(number=29)
    ct29_1 = chord.Chord(["F4", "A4"], quarterLength=1.0); ct29_1.lyric = "Me"
    ct29_2 = chord.Chord(["G4", "B-4"], quarterLength=1.0); ct29_2.lyric = "pro-"
    ct29_3 = chord.Chord(["A4", "C5"], quarterLength=1.0); ct29_3.lyric = "ve-"
    ct29_4 = chord.Chord(["B-4", "D5"], quarterLength=1.0); ct29_4.lyric = "rá"
    m29_t.append([ct29_1, ct29_2, ct29_3, ct29_4])

    cb29_1 = chord.Chord(["D3", "F3"], quarterLength=1.0); cb29_1.lyric = "me-"
    cb29_2 = chord.Chord(["E3", "G3"], quarterLength=1.0); cb29_2.lyric = "ré"
    cb29_3 = chord.Chord(["F3", "A3"], quarterLength=1.0); cb29_3.lyric = "ja-"
    cb29_4 = chord.Chord(["G3", "B-3"], quarterLength=1.0); cb29_4.lyric = "más,"
    m29_b.append([cb29_1, cb29_2, cb29_3, cb29_4])

    # m.30: "tu a-mor." (climax)
    m30_t = stream.Measure(number=30)
    m30_b = stream.Measure(number=30)
    ct30_1 = chord.Chord(["A4", "C5"], quarterLength=1.0); ct30_1.lyric = "tu"
    ct30_2 = chord.Chord(["G4", "B-4"], quarterLength=1.0); ct30_2.lyric = "a -"
    ct30_3 = chord.Chord(["F4", "A4"], quarterLength=2.0); ct30_3.lyric = "mor."
    m30_t.append([ct30_1, ct30_2, ct30_3])

    cb30_1 = chord.Chord(["F3", "A3"], quarterLength=1.0); cb30_1.lyric = "tu"
    cb30_2 = chord.Chord(["E3", "G3"], quarterLength=1.0); cb30_2.lyric = "a -"
    cb30_3 = chord.Chord(["D3", "F3"], quarterLength=2.0); cb30_3.lyric = "mor."
    m30_b.append([cb30_1, cb30_2, cb30_3])

    for mt, mb in [(m26_t, m26_b), (m27_t, m27_b), (m28_t, m28_b), (m29_t, m29_b), (m30_t, m30_b)]:
        p_treble.append(mt)
        p_bass.append(mb)

    s.append([p_treble, p_bass])
    return s

if __name__ == "__main__":
    score = build_me_proveera_score()
    score.write("musicxml", "samples/me_proveera_tu_amor.musicxml")
    print("Successfully built samples/me_proveera_tu_amor.musicxml")
