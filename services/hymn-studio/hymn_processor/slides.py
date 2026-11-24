"""Read hymn slide decks (Google Slides links or .pptx files) into ordered page images.

Decks from HimnosenPantalla-style sources put one scanned page of sheet music
on each slide and title the slides "<Hymn title> <verse><page letter>", e.g.
"Tú Eres Mi Canto Señor 1", "... 1A", "... 2B".
"""

from __future__ import annotations

import hashlib
import re
import urllib.request
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from posixpath import normpath, dirname, join
from xml.etree import ElementTree as ET

NS = {
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
}

GOOGLE_ID = re.compile(r"/(?:presentation|file)/d/([A-Za-z0-9_-]{10,})")
# "Title 1", "Title 1A", "Title 2 B"
SLIDE_SUFFIX = re.compile(r"^(?P<title>.*?)\s+(?P<verse>\d{1,2})\s*(?P<page>[A-Za-z]?)$")


@dataclass
class SlidePage:
    index: int  # 1-based slide order
    heading: str
    image: bytes | None
    image_ext: str = "png"
    paragraphs: list[str] = field(default_factory=list)  # slide text, one entry per paragraph
    # PDF text layer, positioned in image pixels: {"ch", "font", "x0", "x1", "y0", "y1"}
    chars: list[dict] = field(default_factory=list)

    @property
    def sha(self) -> str | None:
        return hashlib.sha1(self.image).hexdigest() if self.image else None


@dataclass
class VerseSlides:
    number: int
    pages: list[SlidePage] = field(default_factory=list)


@dataclass
class DeckHymn:
    title: str
    verses: list[VerseSlides]

    @property
    def music_pages(self) -> list[SlidePage]:
        """Pages of the first verse: the full score, in order."""
        return self.verses[0].pages if self.verses else []


def is_url(value: str) -> bool:
    return value.startswith("http://") or value.startswith("https://")


def google_export_url(url: str) -> str:
    """Turn a Google Slides or Drive share link into a .pptx export link."""
    m = GOOGLE_ID.search(url)
    if not m:
        raise ValueError(f"Not a Google Slides/Drive link: {url}")
    return f"https://docs.google.com/presentation/d/{m.group(1)}/export/pptx"


def _fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "hymn-studio"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def download_deck(url: str, dest: Path) -> Path:
    """Download a shared deck (.pptx) or a PDF on Google Drive. It must be shared as 'anyone with the link'.

    Returns the saved path; its suffix (.pptx or .pdf) says which kind it is.
    """
    m = GOOGLE_ID.search(url)
    if not m:
        raise ValueError(f"Not a Google Slides/Drive link: {url}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    tries = [] if "/file/d/" in url else [f"https://docs.google.com/presentation/d/{m.group(1)}/export/pptx"]
    tries.append(f"https://drive.google.com/uc?export=download&id={m.group(1)}")
    for u in tries:
        try:
            data = _fetch(u)
        except Exception:
            continue
        if data.startswith(b"PK"):
            out = dest.with_suffix(".pptx")
        elif data.startswith(b"%PDF"):
            out = dest.with_suffix(".pdf")
        else:
            continue
        out.write_bytes(data)
        return out
    raise RuntimeError(f"Couldn't download a .pptx or PDF (is it shared as 'anyone with the link'?): {url}")


def _page_scan(page, w: float, h: float):
    """A scanned page is one picture filling the page: return it at its own resolution (no resampling)."""
    import pypdfium2 as pdfium
    import pypdfium2.raw as raw

    images = [o for o in page.get_objects() if o.type == raw.FPDF_PAGEOBJ_IMAGE]
    if len(images) != 1:
        return None
    left, bottom, right, top = images[0].get_bounds()
    if (right - left) < 0.8 * w or (top - bottom) < 0.8 * h:
        return None
    try:
        return images[0].get_bitmap(render=False).to_pil().convert("L")
    except Exception:
        return None


def _pdf_chars(tp, sx: float, sy: float, page_h: float) -> list[dict]:
    """Every character of a PDF page with its font and box, in the rendered image's pixels.

    Notation programs (Finale, Sibelius, MuseScore) export music as font glyphs and the words as
    real text, so tempo, title, lyrics, key signature and tuplet numbers can be read exactly.
    """
    import ctypes

    import pypdfium2.raw as raw

    out = []
    buf = ctypes.create_string_buffer(256)
    flags = ctypes.c_int()
    for i in range(tp.count_chars()):
        ch = tp.get_text_range(i, 1)
        if not ch.strip():
            continue
        left, bottom, right, top = tp.get_charbox(i)
        raw.FPDFText_GetFontInfo(tp.raw, i, buf, 256, ctypes.byref(flags))
        font = buf.value.decode(errors="ignore")
        out.append({"ch": ch, "font": font, "x0": left * sx, "x1": right * sx,
                    "y0": (page_h - top) * sy, "y1": (page_h - bottom) * sy})
    return out


def read_pdf(path: Path) -> list[SlidePage]:
    """Each PDF page becomes a "slide": a rendered image (for sheet music) plus its text layer (for typed lyrics)."""
    import io

    import pypdfium2 as pdfium

    doc = pdfium.PdfDocument(str(path))
    pages = []
    for i in range(len(doc)):
        page = doc[i]
        w, h = page.get_size()
        img = _page_scan(page, w, h)
        if img is None:  # vector or mixed page: draw it at the slide scans' width
            img = page.render(scale=2048 / max(w, 1)).to_pil().convert("L")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        tp = page.get_textpage()
        text = tp.get_text_range() or ""
        chars = _pdf_chars(tp, img.width / max(w, 1), img.height / max(h, 1), h)
        paras = [" ".join(l.split()) for l in text.replace("\r", "\n").split("\n")]
        pages.append(SlidePage(index=i + 1, heading=next((p for p in paras if p), ""), image=buf.getvalue(),
                               paragraphs=paras, chars=chars))
    return pages


def _rels(z: zipfile.ZipFile, part: str) -> dict[str, str]:
    rel_path = join(dirname(part), "_rels", part.rsplit("/", 1)[1] + ".rels")
    if rel_path not in z.namelist():
        return {}
    root = ET.fromstring(z.read(rel_path))
    return {
        r.get("Id"): normpath(join(dirname(part), r.get("Target")))
        for r in root.findall("rel:Relationship", NS)
    }


def read_pptx(path: Path) -> list[SlidePage]:
    """Return slides in presentation order with their heading text and largest image."""
    with zipfile.ZipFile(path) as z:
        pres = "ppt/presentation.xml"
        pres_rels = _rels(z, pres)
        root = ET.fromstring(z.read(pres))
        slide_parts = [
            pres_rels[s.get(f"{{{NS['r']}}}id")]
            for s in root.findall("p:sldIdLst/p:sldId", NS)
        ]
        pages = []
        for i, part in enumerate(slide_parts, start=1):
            xml = ET.fromstring(z.read(part))
            texts = [t.text.strip() for t in xml.iter(f"{{{NS['a']}}}t") if t.text and t.text.strip()]
            rels = _rels(z, part)
            best: tuple[int, str] | None = None
            for blip in xml.iter(f"{{{NS['a']}}}blip"):
                target = rels.get(blip.get(f"{{{NS['r']}}}embed"))
                if target and target in z.namelist():
                    size = z.getinfo(target).file_size
                    if best is None or size > best[0]:
                        best = (size, target)
            image = z.read(best[1]) if best else None
            ext = best[1].rsplit(".", 1)[-1].lower() if best else "png"
            paras = []
            for para in xml.iter(f"{{{NS['a']}}}p"):
                # A soft line break (<a:br/>) inside a paragraph starts a new line too.
                line = ""
                for el in para.iter():
                    if el.tag == f"{{{NS['a']}}}br":
                        paras.append(" ".join(line.split()))
                        line = ""
                    elif el.tag == f"{{{NS['a']}}}t":
                        line += el.text or ""
                paras.append(" ".join(line.split()))
            pages.append(SlidePage(index=i, heading=texts[0] if texts else "", image=image, image_ext=ext, paragraphs=paras))
        return pages


def group_hymns(pages: list[SlidePage]) -> list[DeckHymn]:
    """Group slides into hymns and verses using the slide headings."""
    hymns: list[DeckHymn] = []
    for page in pages:
        if not page.image:
            continue
        m = SLIDE_SUFFIX.match(page.heading)
        title = (m.group("title") if m else page.heading).strip() or "Untitled Hymn"
        verse_no = int(m.group("verse")) if m else 1
        hymn = hymns[-1] if hymns and hymns[-1].title == title else None
        if hymn is None:
            hymn = DeckHymn(title=title, verses=[])
            hymns.append(hymn)
        verse = hymn.verses[-1] if hymn.verses and hymn.verses[-1].number == verse_no else None
        if verse is None:
            verse = VerseSlides(number=verse_no)
            hymn.verses.append(verse)
        verse.pages.append(page)
    return hymns

