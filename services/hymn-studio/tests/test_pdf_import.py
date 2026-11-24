"""PDF import: scanned sheet music pages and typed-lyrics pages."""

from pathlib import Path

import pytest
from PIL import Image

from hymn_processor.deck_batch import pdf_slides
from hymn_processor.lyrics_deck import is_lyrics_deck, parse_lyrics_deck

PAGES = Path(__file__).resolve().parent.parent / "samples" / "shape_notes"


def text_pdf(path: Path, pages: list[list[str]]):
    """A tiny PDF with real text (Helvetica, WinAnsi), one list of lines per page."""
    objs, kids = [], []

    def add(body: bytes) -> int:
        objs.append(body)
        return len(objs)

    font = add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
    pages_id = len(objs) + 1 + 2 * len(pages)
    for lines in pages:
        ops = ["BT /F1 18 Tf 72 740 Td 24 TL"]
        for l in lines:
            esc = l.encode("cp1252").replace(b"\\", b"\\\\").replace(b"(", b"\\(").replace(b")", b"\\)")
            ops.append("(" + esc.decode("latin-1") + ") Tj T*")
        ops.append("ET")
        stream = "\n".join(ops).encode("latin-1")
        content = add(b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream")
        kids.append(add(b"<< /Type /Page /Parent %d 0 R /MediaBox [0 0 612 792] /Contents %d 0 R /Resources << /Font << /F1 %d 0 R >> >> >>" % (pages_id, content, font)))
    assert add(b"<< /Type /Pages /Kids [%s] /Count %d >>" % (b" ".join(b"%d 0 R" % k for k in kids), len(kids))) == pages_id
    catalog = add(b"<< /Type /Catalog /Pages %d 0 R >>" % pages_id)
    out, offsets = bytearray(b"%PDF-1.4\n"), []
    for i, body in enumerate(objs, start=1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i + body + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1) + b"".join(b"%010d 00000 n \n" % o for o in offsets)
    out += b"trailer\n<< /Size %d /Root %d 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, catalog, xref)
    path.write_bytes(bytes(out))


def test_typed_lyrics_pdf(tmp_path):
    pdf = tmp_path / "te-exaltare.pdf"
    text_pdf(pdf, [["34 N.V.", "Te Exaltaré", "I", "Te exaltaré, mi Dios, mi Rey,", "y para siempre."],
                   ["Coro", "Grande es Jehová y", "digno de suprema alabanza;"]])
    slides = pdf_slides(pdf)
    assert is_lyrics_deck(slides)
    p = parse_lyrics_deck(slides)
    assert (p["title"], p["number"]) == ("Te Exaltaré", "34")
    assert [s["type"] for s in p["sections"]] == ["verse", "chorus"]


@pytest.mark.skipif(not (PAGES / "page1.png").exists(), reason="sample pages not present")
def test_scanned_music_pdf(tmp_path):
    pdf = tmp_path / "tu_eres_mi_canto_senor.pdf"
    imgs = [Image.open(PAGES / f"page{i}.png").convert("RGB") for i in range(1, 5)]
    imgs[0].save(pdf, save_all=True, append_images=imgs[1:])
    slides = pdf_slides(pdf)
    assert len(slides) == 4 and all(s.image for s in slides)
    assert not is_lyrics_deck(slides)
    assert slides[0].heading == "Tu Eres Mi Canto Senor 1"
