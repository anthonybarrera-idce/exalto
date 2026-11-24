"""Decks whose slides are typed lyrics (no sheet music): read them straight into Exalto lyrics.

Typical layout, as used by Spanish hymn slide decks:
    slide 1:  "34 N.V."  (number and hymnal abbreviation),  "Te Exaltaré"  (title),  "I",  verse lines…
    then:     "Coro I" / "Coro",  chorus lines…   "II",  verse lines…   (the chorus slide repeats)
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from .slides import SlidePage

ROMAN = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6, "VII": 7, "VIII": 8, "IX": 9, "X": 10}
NUMBER_LINE = re.compile(r"^(?P<num>\d{1,4}[A-Za-z]?)\s*(?P<code>[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑ.\s]{0,12})?$")
CHORUS = re.compile(r"^(coro|chorus|estribillo)\b\.?\s*(?P<n>[IVX]+|\d+)?$", re.I)


def is_lyrics_deck(pages: list[SlidePage]) -> bool:
    """No slide carries a picture, and the slides have real text."""
    return not any(p.image for p in pages) and sum(len([x for x in p.paragraphs if x]) for p in pages) >= 4


def parse_lyrics_deck(pages: list[SlidePage]) -> dict:
    """Title, suggested number/hymnal code and lyric sections from typed-lyrics slides."""
    number = code = title = None
    sections: list[dict] = []
    cur: dict | None = None
    choruses: dict[str, dict] = {}
    order: list[str] = []  # how the slides were sung, e.g. I, Coro, II, Coro

    def push():
        nonlocal cur
        if cur and cur["lines"]:
            key = f"{cur['type']}:{cur.get('number') or ''}"
            if cur["type"] == "chorus":
                if key in choruses:  # repeated chorus slide: keep the first, longest copy
                    if len(" ".join(cur["lines"])) > len(" ".join(choruses[key]["lines"])):
                        choruses[key]["lines"] = cur["lines"]
                else:
                    choruses[key] = cur
                    sections.append(cur)
            else:
                sections.append(cur)
            order.append(key)
        cur = None

    for pi, page in enumerate(pages):
        lines = [l for l in page.paragraphs if l.strip()]
        for li, line in enumerate(lines):
            text = line.strip()
            if pi == 0 and number is None and title is None and li == 0 and (m := NUMBER_LINE.match(text)):
                number, code = m.group("num"), (m.group("code") or "").strip() or None
                continue
            if pi == 0 and title is None and cur is None and text.upper().strip(".") not in ROMAN:
                title = text
                continue
            if text.upper().strip(".") in ROMAN:
                push()
                cur = {"type": "verse", "number": ROMAN[text.upper().strip(".")], "lines": []}
                continue
            if m := CHORUS.match(text):
                push()
                n = m.group("n")
                cur = {"type": "chorus", "lines": []}
                if n:
                    cur["number"] = ROMAN.get(n.upper(), int(n) if n.isdigit() else None)
                continue
            if cur is None:
                cur = {"type": "verse", "number": len([s for s in sections if s["type"] == "verse"]) + 1, "lines": []}
            # A paragraph that is only punctuation belongs to the line before it.
            if re.fullmatch(r"[.,;:!?¡¿]+", text) and cur["lines"]:
                cur["lines"][-1] = cur["lines"][-1].rstrip() + text
            else:
                cur["lines"].append(text)
        push()  # sections end with their slide
    for s in sections:  # "Coro I" when there's a single chorus is just "Coro"
        if s["type"] == "chorus" and len(choruses) == 1:
            s.pop("number", None)
    repeat = sum(1 for k in order if k.startswith("chorus")) > 1
    return {"title": title or "Untitled", "number": number, "hymnal_code": code, "sections": sections, "repeat_chorus": repeat}


def admin_text(sections: list[dict]) -> str:
    roman = {v: k for k, v in ROMAN.items()}
    out = []
    for s in sections:
        head = "Coro" if s["type"] == "chorus" else roman.get(s.get("number") or 0, "")
        out.append("\n".join([head, *s["lines"]]))
    return "\n\n".join(out) + "\n"


def write_lyrics_hymn(parsed: dict, out_dir: Path, slug: str, hymnal_id: str, language: str) -> dict:
    """hymn.json, lyrics.txt and review.json for a lyrics-only hymn (no score or audio)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    num = parsed["number"]
    number = int(re.match(r"\d+", num).group()) if num else None
    hymn = {
        "id": slug,
        "title": parsed["title"],
        "number": number,
        "label": num if num and not num.isdigit() else None,
        "hymnalId": hymnal_id,
        "language": language,
        "author": "",
        "tags": [],
        "lyrics": parsed["sections"],
        "repeatChorus": parsed["repeat_chorus"],
        "status": "draft",
        "recordingCount": 0,
        "source": {"hymnalCode": parsed["hymnal_code"]},
    }
    (out_dir / "hymn.json").write_text(json.dumps(hymn, ensure_ascii=False, indent=2))
    (out_dir / "lyrics.txt").write_text(admin_text(parsed["sections"]))
    warnings = []
    if parsed["hymnal_code"]:
        warnings.append(f"Slides say hymn {num} of “{parsed['hymnal_code']}”. Pick the matching hymnal in Details.")
    review = {
        "kind": "lyrics",
        "title": parsed["title"],
        "bpm": None,
        "measures": 0,
        "key_fifths": 0,
        "time_signature": None,
        "corrections": [],
        "flagged": [],
        "warnings": warnings,
        "files": {"hymn_json": "hymn.json", "lyrics_txt": "lyrics.txt"},
    }
    (out_dir / "review.json").write_text(json.dumps(review, ensure_ascii=False, indent=2))
    (out_dir / "transcription.json").write_text(json.dumps({"pages": [], "extra_verses": []}))
    return hymn
