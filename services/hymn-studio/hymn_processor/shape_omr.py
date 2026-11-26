"""Local optical music recognition for engraved 7-shape (Aikin) SATB hymn pages.

No AI service is used. The page is read with classic image processing:

  1. find the 5-line staves and pair them into treble/bass systems,
  2. erase staff lines and stems so noteheads, flags and dots stand alone,
  3. find noteheads, their fill (filled = quarter or shorter, hollow = half/whole),
     stems (direction gives the voice), flags (eighths) and augmentation dots,
  4. read pitch from the head's staff position + clef + key signature,
  5. cross-check pitch against the head's SHAPE: every scale degree has its own
     shape, so heads predicted to be the same degree must look alike. Heads that
     don't match their degree's shape are flagged for review,
  6. split measures at bar lines and lay the notes out on S/A/T/B timelines.

The result uses the same page dict shape as the AI transcribers in deck_batch.py,
so the rest of the pipeline (MusicXML, MIDI, lyrics) is shared.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

STEP_NAMES = "CDEFGAB"
# Key signature order
SHARP_ORDER = "FCGDAEB"
FLAT_ORDER = "BEADGCF"


# --------------------------------------------------------------------------- data

@dataclass
class Staff:
    lines: list[float]  # y of the 5 lines, top to bottom
    clef: str  # "treble" | "bass"

    @property
    def top(self) -> float:
        return self.lines[0]

    @property
    def bottom(self) -> float:
        return self.lines[-1]

    @property
    def spacing(self) -> float:
        return (self.lines[-1] - self.lines[0]) / 4

    def step_at(self, y: float) -> int:
        """Diatonic steps above the bottom line (0 = bottom line, 1 = first space...)."""
        return int(round((self.bottom - y) / (self.spacing / 2)))

    def bottom_line_step(self) -> int:
        """Absolute diatonic index (octave*7 + letter) of the bottom line."""
        return 4 * 7 + 2 if self.clef == "treble" else 2 * 7 + 4  # E4 / G2


@dataclass
class Head:
    x0: int
    y0: int
    x1: int
    y1: int
    filled: bool
    mask: np.ndarray  # cropped binary image of the head
    staff: int = -1
    step: int = 0  # absolute diatonic index
    alter: int = 0
    stems: list["Stem"] = field(default_factory=list)
    dotted: bool = False
    shape_ok: bool = True
    rest: bool = False  # a quarter rest stored as a "head" so it takes part in voice timing
    tuplet: float = 1.0  # 2/3 inside a triplet
    rest_dur: float = 1.0  # length of a rest, in quarter notes

    @property
    def cx(self) -> float:
        return (self.x0 + self.x1) / 2

    @property
    def cy(self) -> float:
        return (self.y0 + self.y1) / 2


@dataclass
class Stem:
    x: int
    y0: int
    y1: int
    up: bool = True
    flags: int = 0
    flag_span: float = 0.0


# --------------------------------------------------------------------------- image helpers

def load_binary(path_or_bytes) -> np.ndarray:
    import io

    src = io.BytesIO(path_or_bytes) if isinstance(path_or_bytes, (bytes, bytearray)) else path_or_bytes
    return np.array(Image.open(src).convert("L")) < 128


def vertical_runs(b: np.ndarray) -> np.ndarray:
    """Length of the vertical black run each pixel belongs to."""
    out = np.zeros(b.shape, dtype=np.int32)
    padded = np.vstack([np.zeros((1, b.shape[1]), bool), b, np.zeros((1, b.shape[1]), bool)]).astype(np.int8)
    d = np.diff(padded, axis=0)
    for x in range(b.shape[1]):
        starts = np.flatnonzero(d[:, x] == 1)
        ends = np.flatnonzero(d[:, x] == -1)
        for s, e in zip(starts, ends):
            out[s:e, x] = e - s
    return out


def horizontal_runs(b: np.ndarray) -> np.ndarray:
    return vertical_runs(b.T).T


# --------------------------------------------------------------------------- page reader

def _box(h) -> list[int]:
    """A notehead's (or rest's) box on the page image."""
    return [int(h.x0), int(h.y0), int(h.x1), int(h.y1)]


class ShapeNotePage:
    def __init__(self, img: np.ndarray, chars: list[dict] | None = None):
        self.img = img
        self.chars = chars or []  # PDF text layer, when the page came from notation software
        self.exact_lyrics = False  # lyrics came from the PDF text layer, not OCR
        self.H, self.W = img.shape
        self.staves: list[Staff] = []
        self.heads: list[Head] = []
        self.stems: list[Stem] = []
        self.barlines: list[tuple[int, int]] = []  # (x, system index)
        self.warnings: list[str] = []
        self.key_fifths = 0
        self.flats: list[Head] = []  # flat signs (key signature and accidentals)

    # ---- staves
    def find_staves(self) -> None:
        rows = self.img.sum(axis=1)
        is_line = rows > 0.5 * self.W
        lbl, n = ndi.label(is_line)
        centers = [float(np.mean(np.flatnonzero(lbl == i))) for i in range(1, n + 1)]
        groups: list[list[float]] = []
        for c in centers:
            if groups and len(groups[-1]) < 5 and c - groups[-1][-1] < 40:
                groups[-1].append(c)
            else:
                groups.append([c])
        staves = [g for g in groups if len(g) == 5]
        if len(staves) % 2:
            self.warnings.append(f"Found {len(staves)} staves; expected treble/bass pairs.")
        self.staves = [Staff(lines=g, clef="treble" if i % 2 == 0 else "bass") for i, g in enumerate(staves)]
        if not self.staves:  # a page without music (e.g. typed lyrics)
            self.sp, self.staff_left, self.clef_end, self.line_t = 0.0, 0, 0.0, 1
            return
        self.sp = float(np.median([s.spacing for s in self.staves]))
        # Where the staff lines begin; the clef fills the first ~4.5 spacings after that.
        top_row = self.img[int(round(self.staves[0].lines[0])) if self.staves else 0]
        self.staff_left = int(np.argmax(top_row)) if self.staves else 0
        self.clef_end = self.staff_left + 4.5 * self.sp
        self.line_t = max(1, int(round(self.sp * 0.12)))

    # ---- erase staff lines, find stems
    def clean(self) -> None:
        sp = self.sp
        rv = vertical_runs(self.img)
        nost = self.img.copy()
        for s in self.staves:
            for ly in s.lines:
                for y in range(int(ly - self.line_t - 1), int(ly + self.line_t + 2)):
                    if 0 <= y < self.H:
                        nost[y, rv[y] <= self.line_t * 2 + 2] = False
        # ledger lines: thin horizontal strokes wider than a head
        rv2 = vertical_runs(nost)
        hr = horizontal_runs(nost)
        ledger = (rv2 <= self.line_t * 2 + 2) & (hr > 1.6 * sp) & (hr < 2.6 * sp)
        nost &= ~ledger
        self.nostaff = nost
        # stems/bar lines: long thin vertical runs
        rv3 = vertical_runs(nost)
        tall = rv3 > 1.75 * sp
        hr2 = horizontal_runs(tall)
        thin = tall & (hr2 <= max(3, int(sp * 0.2)))
        self.vertical = thin
        self.residue = nost & ~thin

    # ---- bar lines and stems from vertical strokes
    def find_vertical_strokes(self) -> None:
        sp = self.sp
        lbl, n = ndi.label(self.vertical, structure=np.ones((3, 3)))
        for i, sl in enumerate(ndi.find_objects(lbl), start=1):
            if sl is None:
                continue
            y0, y1 = sl[0].start, sl[0].stop
            x = (sl[1].start + sl[1].stop) // 2
            # A stem is a free-standing line: clear on both sides for most of its length.
            # The column where two stacked heads touch is not, and neither are short letter strokes.
            xl, xr = max(0, sl[1].start - 3), min(self.W - 1, sl[1].stop + 2)
            # (a flag on one side and a head on the other is fine; heads on BOTH sides is not)
            clear = np.mean(~self.nostaff[y0:y1, xl] | ~self.nostaff[y0:y1, xr])
            # Where a flag joins, the stem is no longer "thin": follow the ink column to its real ends.
            col = self.nostaff[:, x]
            while y0 > 0 and col[y0 - 1]:
                y0 -= 1
            while y1 < self.H and col[y1]:
                y1 += 1
            # Stems near ledger lines are shortened to ~2 spacings; letter strokes in the lyrics
            # pass this test too but are dropped later because no notehead sits near the staff.
            if clear < 0.75 or (y1 - y0) < 1.75 * sp:
                self.residue[sl] |= lbl[sl] == i
                continue
            # A bar line spans a whole staff (top line to bottom line) and no more.
            for si, s in enumerate(self.staves):
                if abs(y0 - s.top) < sp * 0.4 and abs(y1 - s.bottom) < sp * 0.4:
                    self.barlines.append((x, si // 2))
                    break
            else:
                self.stems.append(Stem(x=x, y0=y0, y1=y1))

    def confirm_barlines(self) -> None:
        """A bar line crosses both staves of the system; a stem spanning one staff exactly does not."""
        sp = self.sp
        bars = self.barlines
        keep = [(x, si) for x, si in bars
                if sum(1 for x2, s2 in bars if s2 == si and abs(x2 - x) <= 0.3 * sp) >= 2]
        for x, si in bars:
            if (x, si) not in keep:
                st = self.staves[si * 2] if True else None
                # find which staff this stroke spans to rebuild it as a stem
                for k in (si * 2, si * 2 + 1):
                    st = self.staves[k]
                    if self.vertical[int(st.top) + 2 : int(st.bottom) - 2, max(0, x - 1) : x + 2].any(axis=1).mean() > 0.9:
                        self.stems.append(Stem(x=x, y0=int(st.top) - 1, y1=int(st.bottom) + 1))
                        break
        self.barlines = keep

    # ---- noteheads
    def find_heads(self) -> None:
        sp = self.sp
        lbl, n = ndi.label(self.residue, structure=np.ones((3, 3)))
        pieces: list[tuple[slice, slice, np.ndarray]] = []
        for i, sl in enumerate(ndi.find_objects(lbl), start=1):
            if sl is None:
                continue
            h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
            if not (0.8 * sp <= w <= 1.8 * sp and 0.7 * sp <= h <= 4.4 * sp):
                continue
            mask = lbl[sl] == i
            k = max(1, int(round(h / sp)))
            if h <= 1.35 * sp:
                k = 1
            # Stacked chord heads touch vertically: cut at the narrowest rows.
            widths = mask.sum(axis=1)
            cuts = [0]
            for j in range(1, k):
                guess = int(j * h / k)
                lo, hi = max(1, guess - int(0.35 * sp)), min(h - 1, guess + int(0.35 * sp))
                cuts.append(lo + int(np.argmin(widths[lo:hi])))
            cuts.append(h)
            for a, b in zip(cuts, cuts[1:]):
                sub = mask[a:b]
                rows = np.flatnonzero(sub.any(axis=1))
                if not len(rows):
                    continue
                a2, b2 = a + rows[0], a + rows[-1] + 1
                pieces.append((slice(sl[0].start + a2, sl[0].start + b2), sl[1], mask[a2:b2]))
        for sly, slx, mask in pieces:
            sl = (sly, slx)
            h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
            if not (0.6 * sp <= h <= 1.35 * sp):
                continue
            cols = np.flatnonzero(mask.any(axis=0))
            cy = (sl[0].start + sl[0].stop) / 2
            staff = self._nearest_staff(cy)
            if staff is None:
                continue
            filled_mask = ndi.binary_fill_holes(mask)
            ink = mask.sum() / max(1, filled_mask.sum())
            if filled_mask.sum() < 0.3 * h * w:
                continue  # flags, slurs and letters are mostly empty space
            head = Head(sl[1].start + cols[0], sl[0].start, sl[1].start + cols[-1] + 1, sl[0].stop,
                        filled=ink > 0.8, mask=filled_mask, staff=staff)
            self.heads.append(head)
        self.find_hollow_heads()
        self.heads.sort(key=lambda h: (h.staff, h.cx))

    def find_hollow_heads(self) -> None:
        """Half and whole notes: find the white hole each outline encloses in the ORIGINAL image.

        Erasing staff lines can open a hollow head whose wall lies on a line, so holes are
        looked for before erasing. A line crossing a head splits its hole in two; rejoin those.
        """
        sp = self.sp
        holes = ndi.binary_fill_holes(self.img) & ~self.img
        lbl, n = ndi.label(holes)
        res_lbl, _ = ndi.label(self.residue, structure=np.ones((3, 3)))
        res_objs = ndi.find_objects(res_lbl)
        # 1. Hole pieces of head-like width; a line through a head cuts its hole in two.
        pieces = []
        for i, sl in enumerate(ndi.find_objects(lbl), start=1):
            if sl is None:
                continue
            h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
            if 0.12 * sp <= h <= 1.05 * sp and 0.35 * sp <= w <= 1.4 * sp:
                pieces.append([sl[0].start, sl[0].stop, sl[1].start, sl[1].stop, [i]])
        pieces.sort()
        groups: list[list] = []
        for b in pieces:
            for m in groups:
                overlap = min(m[3], b[3]) - max(m[2], b[2])
                if overlap > 0.5 * min(m[3] - m[2], b[3] - b[2]) and 0 <= b[0] - m[1] <= self.line_t * 2 + 2 \
                        and b[1] - m[0] <= 1.05 * sp and self._line_between(m[1], b[0], min(m[2], b[2]), max(m[3], b[3])) \
                        and min(m[3] - m[2], b[3] - b[2]) >= 0.6 * max(m[3] - m[2], b[3] - b[2]):  # halves of one head
                    m[1] = max(m[1], b[1]); m[2] = min(m[2], b[2]); m[3] = max(m[3], b[3]); m[4] += b[4]
                    break
            else:
                groups.append(list(b))

        # 2. Keep holes ringed by a thin, closed, head-sized outline.
        merged = []
        self.hollow_log = []
        for gy0, gy1, gx0, gx1, ids_ in groups:
            if not (0.15 * sp <= gy1 - gy0 <= 1.05 * sp and gx1 - gx0 >= 0.45 * sp):
                self.hollow_log.append(((gx0, gy0, gx1, gy1), 'size'))
                continue
            y0, y1 = max(0, gy0 - 12), gy1 + 12
            x0, x1 = max(0, gx0 - 12), gx1 + 12
            hole = np.isin(lbl[y0:y1, x0:x1], ids_)
            if len(ids_) > 1:  # bridge the staff line that split the hole
                hole = ndi.binary_closing(hole, structure=np.ones((self.line_t * 2 + 3, 1)))
            # Gaps between staff lines, stems and filled heads are holes too. A real hollow head
            # is ringed by its own outline, which survives line and stem removal.
            ring = ndi.binary_dilation(hole, iterations=3) & ~hole
            outer = ndi.binary_dilation(hole, iterations=9) & ~ndi.binary_dilation(hole, iterations=5)
            res = self.residue[y0:y1, x0:x1]
            if res[ring].mean() < (0.43 if len(ids_) == 1 else 0.33):
                self.hollow_log.append(((gx0, gy0, gx1, gy1), 'ring'))
                continue
            # A hollow head is a THIN outline: just outside it is white. The gap between two
            # stacked solid heads is ringed by more solid ink.
            if res[outer].mean() > 0.45:
                self.hollow_log.append(((gx0, gy0, gx1, gy1), 'outer'))
                continue
            # The outline must close the hole on both sides. Gaps fenced by stems (which are
            # erased) and slurs or staff lines have bare sides.
            cols = np.arange(ring.shape[1])
            hx0, hx1 = gx0 - x0, gx1 - x0
            third = max(2, (hx1 - hx0) // 4)
            left = ring & (cols < hx0 + third)[None, :]
            right = ring & (cols >= hx1 - third)[None, :]
            sl = (slice(gy0, gy1), slice(gx0, gx1))
            # (A flat sign's bowl is the exception: its left side is the flat's own stem.)
            if res[right].mean() < 0.12:
                self.hollow_log.append(((gx0, gy0, gx1, gy1), 'right'))
                continue
            if res[left].mean() < 0.12 and not self._flat_stem_left_of(sl):
                self.hollow_log.append(((gx0, gy0, gx1, gy1), 'left'))
                continue
            # ...and that outline is head-sized (not a clef, digit or letter cluster).
            rid = res_lbl[y0:y1, x0:x1][ring]
            rid = rid[rid > 0]
            if not len(rid):
                self.hollow_log.append(((gx0, gy0, gx1, gy1), 'noid'))
                continue
            osl = res_objs[np.bincount(rid).argmax() - 1]
            # (stacked chord heads form one taller outline, so allow ~2 heads of height)
            if (osl[0].stop - osl[0].start) > 2.6 * sp or (osl[1].stop - osl[1].start) > 1.9 * sp:
                self.hollow_log.append(((gx0, gy0, gx1, gy1), 'outline'))
                continue
            merged.append([gy0, gy1, gx0, gx1])
        pad = int(round(0.18 * sp))
        for y0, y1, x0, x1 in merged:
            y0, y1, x0, x1 = y0 - pad, y1 + pad, x0 - pad, x1 + pad
            if (y1 - y0) > 1.5 * sp:
                continue
            cy = (y0 + y1) / 2
            staff = self._nearest_staff(cy)
            if staff is None:
                continue
            # drop filled-pass fragments of this head
            self.heads = [h for h in self.heads if not (h.filled and x0 <= h.cx <= x1 and y0 <= h.cy <= y1)]
            mask = ndi.binary_fill_holes(self.img[y0:y1, x0:x1])
            if any(not h.filled and abs(h.cx - (x0 + x1) / 2) < 0.4 * sp and abs(h.cy - cy) < 0.4 * sp for h in self.heads):
                continue
            self.heads.append(Head(x0, y0, x1, y1, filled=False, mask=mask, staff=staff))

    def _line_between(self, y0: int, y1: int, x0: int, x1: int) -> bool:
        """True if a staff or ledger line (ink running past both sides of the hole) fills the gap.

        Two hollow heads that merely touch are separated by their outlines, which stop at the heads' edges.
        """
        pad = int(0.35 * self.sp)
        a, b = max(0, x0 - pad), min(self.W, x1 + pad)
        for y in range(max(0, y0 - 1), min(self.H, y1 + 2)):
            row = self.img[y, a:b]
            if row[: pad // 2].any() and row[-(pad // 2):].any() and row.mean() > 0.85:
                return True
        return False

    def _flat_stem_left_of(self, sl) -> bool:
        """A flat's stem rises from the bottom of its bowl: it ends at the bowl and goes well above it."""
        sp = self.sp
        top, bottom, left = sl[0].start, sl[0].stop, sl[1].start
        return any(
            left - 0.4 * sp <= st.x <= left + 0.3 * sp and st.y0 <= top - 0.8 * sp
            and bottom - 0.3 * sp <= st.y1 <= bottom + 0.4 * sp
            for st in self.stems
        )

    def _nearest_staff(self, y: float) -> int | None:
        best = None
        for i, s in enumerate(self.staves):
            if s.top - 4 * s.spacing <= y <= s.bottom + 4 * s.spacing:
                d = 0 if s.top <= y <= s.bottom else min(abs(y - s.top), abs(y - s.bottom))
                if best is None or d < best[0]:
                    best = (d, i)
        return best[1] if best else None

    # ---- stems, flags, dots
    def attach(self) -> None:
        sp = self.sp
        # A "bar line" with a notehead against it is really a stem (stems on both staves at the
        # same x, each exactly a staff tall, look like a bar line until the heads are known).
        keep = []
        for x, sysi in self.barlines:
            # touching: the line runs along a head's edge or through it (a nearby note doesn't count)
            on_head = [h for h in self.heads if h.staff // 2 == sysi
                       and self.staves[h.staff].top - 0.5 * sp <= h.cy <= self.staves[h.staff].bottom + 0.5 * sp
                       and min(abs(x - h.x0), abs(x - h.x1)) <= max(2, 0.12 * sp)]
            if on_head:
                for si in {h.staff for h in on_head}:
                    st = self.staves[si]
                    if not any(abs(s_.x - x) <= 2 and s_.y0 <= st.bottom and s_.y1 >= st.top for s_ in self.stems):
                        self.stems.append(Stem(x=x, y0=int(st.top) - 1, y1=int(st.bottom) + 1))
            else:
                keep.append((x, sysi))
        self.barlines = keep
        for st in self.stems:
            tol = 0.3 * sp
            # A stem meets a head at its left or right edge, never through its middle (lines through
            # the middle of stacked heads are where the heads touch).
            edge = max(3, 0.28 * sp)
            touching = [
                h for h in self.heads
                if (abs(st.x - h.x0) <= edge or abs(st.x - h.x1) <= edge) and h.y0 <= st.y1 + 3 and h.y1 >= st.y0 - 3
            ]
            if not touching:
                continue
            # The stem leaves from the head end it touches: up if the heads are at the bottom.
            lowest = max(h.cy for h in touching)
            highest = min(h.cy for h in touching)
            st.up = abs(st.y1 - lowest) < abs(st.y0 - highest)
            # Heads hang off the stem's base, never its tip (the thick root of a flag is not a head).
            if st.up:
                touching = [h for h in touching if h.cy >= st.y0 + 1.5 * sp]
            else:
                touching = [h for h in touching if h.cy <= st.y1 - 1.5 * sp]
            if not touching:
                continue
            # A double flag's body is one tall blob hanging from the stem's tip on its right; cut
            # into pieces, it can pass for filled heads. Real heads sit at the stem's base.
            mid = (st.y0 + st.y1) / 2
            flagged = [h for h in touching if h.cx > st.x and ((h.cy < mid) if st.up else (h.cy > mid)) and self._tip_blob(h, st)]
            if flagged and self._flag_roots(st, [h for h in touching if h not in flagged]) < 2:
                flagged = []
            for h in flagged:
                touching.remove(h)
                if h in self.heads:
                    self.heads.remove(h)
            if not touching:
                continue
            # One stem never carries both filled and hollow heads (quarters and halves don't
            # share a stem): a "hollow head" there is the white between a double flag's strokes.
            if any(h.filled for h in touching) and any(not h.filled and not h.rest for h in touching):
                for h in [h for h in touching if not h.filled and not h.rest]:
                    touching.remove(h)
                    if h in self.heads:
                        self.heads.remove(h)
            # Up-stems sit on a head's right side, down-stems on its left. A small hollow shape
            # with a stem rising from its LEFT edge is a flat sign, not a note.
            on_left = [h for h in touching if st.x < h.cx]
            if st.up and on_left and len(on_left) == len(touching) and all(not h.filled for h in touching):
                for h in touching:
                    self.flats.append(h)
                    self.heads.remove(h)
                continue
            for h in touching:
                h.stems.append(st)
            # Flags: residue blobs that touch the stem near its far end (slurs don't touch stems).
            tip_y = st.y0 if st.up else st.y1
            ya = max(0, int(tip_y - (0.3 if st.up else 3.2) * sp))
            yb = int(tip_y + (3.2 if st.up else 0.3) * sp)
            box = self.residue[ya:yb, max(0, st.x - 2) : int(st.x + 1.6 * sp)]
            if box.size:
                lbl_b, _ = ndi.label(box, structure=np.ones((3, 3)))
                tip_row = int(tip_y - ya)
                near_tip = lbl_b[max(0, tip_row - int(0.5 * sp)) : tip_row + int(0.5 * sp), :5]
                ids = set(np.unique(near_tip)) - {0}
                if ids:
                    rows = np.flatnonzero(np.isin(lbl_b, list(ids)).any(axis=1))
                    span = (rows[-1] - rows[0] + 1) / sp
                    st.flag_span = span
                    st.flags = 0 if span < 1.2 else 1 if span < 3.6 else 2
                # Compact fonts draw a double flag barely taller than a single one, so count the
                # flag strokes leaving the stem instead: two separate runs of ink beside it = 2.
                st.flags = max(st.flags, self._flag_roots(st, touching))

        # Dots: small round blobs just right of a head.
        lbl, n = ndi.label(self.residue)
        objs = ndi.find_objects(lbl)
        dots = []
        for sl in objs:
            if sl is None:
                continue
            h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
            if 0.15 * sp <= h <= 0.45 * sp and 0.15 * sp <= w <= 0.45 * sp:
                dots.append(((sl[1].start + sl[1].stop) / 2, (sl[0].start + sl[0].stop) / 2))
        self._count_beams()
        # A real dot never sits inside a notehead (overlapping chord heads leave dot-sized fragments).
        # Dots sit clear of every notehead, to the right of the chord; anything directly above/below a head
        # (within its width) is a fragment.
        dots = [(dx, dy) for dx, dy in dots
                if not any(h.x0 - 2 <= dx <= h.x1 + 2 and h.y0 - 0.4 * sp <= dy <= h.y1 + 0.4 * sp for h in self.heads)]
        self._dots = dots
        for h in self.heads:
            # A flag on an up-stem pushes the dot further right, past the flag.
            reach = 1.3 * sp
            for st in h.stems:
                if st.up and st.flags and st.x > h.cx:
                    reach = max(reach, st.x - h.x1 + 2.1 * sp)
            for dx, dy in dots:
                if h.x1 < dx < h.x1 + reach and abs(dy - h.cy) < 0.75 * sp:
                    h.dotted = True

    def _tip_blob(self, h: Head, st: Stem) -> bool:
        """True if `h` was cut from a tall blob (over 2.6 spacings) that starts at the stem's tip:
        a flag, not a notehead."""
        sp = self.sp
        if not hasattr(self, "_res_lbl"):
            self._res_lbl, _ = ndi.label(self.residue, structure=np.ones((3, 3)))
            self._res_objs = ndi.find_objects(self._res_lbl)
        ids = np.unique(self._res_lbl[int(h.y0) : int(h.y1), int(h.x0) : int(h.x1)])
        for i in ids[ids > 0]:
            o = self._res_objs[i - 1]
            top, bottom = o[0].start, o[0].stop
            if bottom - top <= 2.6 * sp:
                continue
            # A real head can merge with its own flag into one blob, but it's then the blob's end
            # nearest the stem's base (its bottom for an up-stem, top for a down-stem).
            if (st.up and abs(h.y1 - bottom) <= 0.3 * sp) or (not st.up and abs(h.y0 - top) <= 0.3 * sp):
                continue
            if (st.up and abs(top - st.y0) <= 0.6 * sp) or (not st.up and abs(bottom - st.y1) <= 0.6 * sp):
                return True
        return False

    def _flag_roots(self, st: Stem, heads: list[Head]) -> int:
        """Separate flag strokes leaving the stem's right side near its tip (2 for a sixteenth's
        double flag). Only counts 2 or more: a single run is left to the flag-span test."""
        sp = self.sp
        reach = int(3.2 * sp)
        ya, yb = (st.y0, st.y0 + reach) if st.up else (st.y1 - reach, st.y1)
        # stay clear of the note's own heads at the other end of the stem
        for h in heads:
            if st.up:
                yb = min(yb, int(h.y0) - 2)
            else:
                ya = max(ya, int(h.y1) + 2)
        if yb - ya < sp:
            return 0
        # (just beside the stem: further out, a flag's curl bridges the gap between the strokes)
        x0, x1 = st.x + 2, st.x + 3
        col = self.residue[max(0, ya) : yb, x0 : x1 + 1].any(axis=1)
        # Runs of ink split by gaps of 2+ rows; a flag stroke is thick where it meets the stem,
        # unlike a leftover sliver of staff or ledger line.
        lengths, cur, gap = [], 0, 0
        for on in col:
            if on:
                cur += 1
                gap = 0
            else:
                gap += 1
                if gap >= 2 and cur:
                    lengths.append(cur)
                    cur = 0
        if cur:
            lengths.append(cur)
        runs = sum(1 for n in lengths if n >= 0.25 * sp)
        return runs if runs >= 2 else 0

    def find_rests(self) -> None:
        """Quarter rests: a tall zig-zag about 2.5 spacings high and 1 wide, inside the staff, touching no stem."""
        sp = self.sp
        key_end: dict[int, float] = {}
        first_note = {}
        for h_ in self.heads:
            first_note[h_.staff] = min(first_note.get(h_.staff, 1e9), h_.x0)
        for f in self.flats:
            if f.x1 < first_note.get(f.staff, 1e9):
                key_end[f.staff] = max(key_end.get(f.staff, 0), f.x1 + 0.5 * sp)
        for kind, staff, x, _ in getattr(self, "sign_pairs", []):
            if x < first_note.get(staff, 1e9):
                key_end[staff] = max(key_end.get(staff, 0), x + 0.8 * sp)
        lbl, _ = ndi.label(self.nostaff, structure=np.ones((3, 3)))
        for i, sl in enumerate(ndi.find_objects(lbl), start=1):
            if sl is None:
                continue
            h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
            if not (2.0 * sp <= h <= 3.4 * sp and 0.55 * sp <= w <= 1.4 * sp) or sl[1].start < self.clef_end:
                continue
            cy = (sl[0].start + sl[0].stop) / 2
            staff = self._nearest_staff(cy)
            if staff is None:
                continue
            st_ = self.staves[staff]
            # Quarter rests sit centred on the staff; time-signature digits sit in its top or bottom half.
            if abs(cy - (st_.top + st_.bottom) / 2) > 0.6 * sp:
                continue
            if sl[1].start < key_end.get(staff, self.clef_end) or sl[1].start < first_note.get(staff, 0):
                continue  # key or time signature (a rest before a line's first note isn't recognised)
            if any(h_.x0 - 2 < sl[1].stop and h_.x1 + 2 > sl[1].start and h_.y0 < sl[0].stop and h_.y1 > sl[0].start for h_ in self.heads):
                continue
            mask = lbl[sl] == i
            # A rest is drawn with a thick body; a stray stem or letter is thin.
            if (mask.sum(axis=1) >= 0.3 * sp).sum() < 0.3 * h:
                continue
            if any(sl[1].start - 2 <= st.x <= sl[1].stop + 2 and st.y0 < sl[0].stop and st.y1 > sl[0].start
                   and (st.y1 - st.y0) > 1.2 * h for st in self.stems):
                continue
            self.heads.append(Head(sl[1].start, sl[0].start, sl[1].stop, sl[0].stop, filled=True,
                                   mask=mask, staff=staff, rest=True))

    def _count_beams(self) -> None:
        """Beamed eighths/sixteenths: a beam is a thick bar (≈0.35–0.75 spacing) joining stem tips.

        For each stem, count the separate thick runs crossing a column just beside it, near its
        tip; one beam = eighth, two = sixteenth. Flags already counted are kept if larger.
        """
        sp = self.sp
        thin_max = 0.25 * sp
        # Look at ink that isn't a notehead (heads are as thick as beams).
        ink = self.residue.copy()
        for h in self.heads:
            ink[max(0, h.y0 - 1) : h.y1 + 1, max(0, h.x0 - 1) : h.x1 + 1] = False
        for st in self.stems:
            if not any(st in h.stems for h in self.heads):
                continue
            tip, toward = (st.y0, 1) if st.up else (st.y1, -1)
            best = 0
            for dx in (-3, 3):  # one side or the other: end stems have the beam on one side only
                x = st.x + dx
                if not 0 <= x < self.W:
                    continue
                a, b = (tip - 0.3 * sp, tip + 2.2 * sp) if toward == 1 else (tip - 2.2 * sp, tip + 0.3 * sp)
                col = ink[max(0, int(a)) : int(b), x]
                runs, n = [], 0
                for on in np.append(col, False):
                    if on:
                        n += 1
                    elif n:
                        runs.append(n)
                        n = 0
                thick = [r for r in runs if thin_max < r <= 0.9 * sp]
                # and the bar must extend sideways (a beam, not a notehead or flag curl)
                if thick:
                    # look away from the stem, on the side being checked
                    xs = slice(max(0, x - int(0.8 * sp)), x + 1) if dx < 0 else slice(x, x + int(0.8 * sp))
                    band = ink[max(0, int(a)) : int(b), xs]
                    if band.size and (band.sum(axis=0) > thin_max).mean() > 0.8:
                        best = max(best, min(3, len(thick)))
            if best:
                st.flags = max(st.flags, best)

    def apply_triplets(self) -> None:
        """Triplets from a PDF's tuplet numbers: a plain-text "3" just above a treble staff or just
        below a bass staff marks the three nearest note groups on that staff as 2/3 length."""
        sp = self.sp
        threes = [c for c in self.chars if c["ch"] == "3" and not _is_music_font(c["font"])]
        for c in threes:
            cx, cy = (c["x0"] + c["x1"]) / 2, (c["y0"] + c["y1"]) / 2
            staff = None
            for i, st in enumerate(self.staves):
                if st.clef == "treble" and st.top - 4 * sp <= cy <= st.top:
                    staff = i
                if st.clef == "bass" and st.bottom <= cy <= st.bottom + 4 * sp:
                    staff = i
            if staff is None:
                continue
            heads = sorted((h for h in self.heads if h.staff == staff and not h.rest), key=lambda h: h.cx)
            groups: list[list[Head]] = []
            for h in heads:
                if groups and abs(h.cx - np.mean([g.cx for g in groups[-1]])) < 0.9 * sp:
                    groups[-1].append(h)
                else:
                    groups.append([h])
            if len(groups) < 3:
                continue
            i = min(range(len(groups) - 2), key=lambda k: abs(np.mean([g.cx for g in groups[k + 1]]) - cx))
            for g in groups[i : i + 3]:
                for h in g:
                    h.tuplet = 2 / 3

    def filter_heads(self) -> None:
        sp = self.sp
        first_stem = {}
        for h in self.heads:
            # The first note marks where the clef/key/time signature ends. Clef and time-signature
            # strokes can look like a stemmed hollow head, but their strokes are short (~2 spacings);
            # a half note's stem is full length, and a system may well open with one.
            if h.stems and (h.filled or any(st.y1 - st.y0 >= 2.5 * sp for st in h.stems)):
                first_stem[h.staff] = min(first_stem.get(h.staff, 1e9), h.x0)
        # A sharp or natural is two short parallel strokes; the white inside a natural, or between
        # a sharp and the staff lines, can pass for a hollow head. Drop those "heads" and free the
        # strokes, so the sign is read as an accidental instead.
        accidental = self._accidental_strokes()
        for h in self.heads:
            if h.filled or h.rest:
                continue
            on_sign = [(a, b) for a, b in accidental
                       if h.x0 - 0.8 * sp <= a.x and b.x <= h.x1 + 0.3 * sp
                       and min(a.y1, b.y1) > h.y0 and max(a.y0, b.y0) < h.y1]
            if on_sign:
                h.accidental_hole = True
                gone = {id(st) for a, b in on_sign for st in (a, b)}
                for other in self.heads:
                    other.stems = [st for st in other.stems if id(st) not in gone]
        kept = []
        for h in self.heads:
            if getattr(h, "accidental_hole", False):
                continue
            s = self.staves[h.staff]
            if h.x1 < first_stem.get(h.staff, 0) - 2 * sp:
                continue  # clef, key signature, time signature
            if h.cx < self.clef_end:
                continue
            if not (s.top - 2.6 * sp <= h.cy <= s.bottom + 2.6 * sp):
                continue  # title and lyric text (letters like "d" look like a half note)
            if h.rest or h.stems:
                kept.append(h)
            elif not h.filled and s.top - 1.6 * sp <= h.cy <= s.bottom + 1.6 * sp and h.x0 > first_stem.get(h.staff, 1e9):
                kept.append(h)  # whole note
        self.heads = kept

    # ---- pitch
    def read_key(self) -> None:
        """Key signature = flat signs before the first note of the first staff.

        Only flat keys are recognised so far (sharps aren't drawn this way); the shape
        cross-check reports when the result doesn't fit the noteheads.
        """
        first_x = {}
        for h in self.heads:
            first_x[h.staff] = min(first_x.get(h.staff, 1e9), h.x0)
        self.accidentals: list[Head] = []
        per_staff: dict[int, int] = {}
        self.flats = [f for f in self.flats if f.cx > self.clef_end]
        for f in self.flats:
            if f.x1 < first_x.get(f.staff, 1e9):
                per_staff[f.staff] = per_staff.get(f.staff, 0) + 1
            else:
                self.accidentals.append(f)
        counts = list(per_staff.values())
        self.key_fifths = -max(set(counts), key=counts.count) if counts else 0
        text_key = self._key_from_text(first_x)
        if text_key is not None:
            self.key_fifths = text_key
            self.flats = [f for f in self.flats if f.x1 >= first_x.get(f.staff, 1e9)]
        # Sharps: two short parallel strokes side by side (naturals are the same strokes, offset vertically).
        self.sign_pairs = self._stroke_pairs_or_glyphs()
        sharp_counts: dict[int, int] = {}
        if not getattr(self, "glyph_mode", False):
            self.sharp_accidentals = []
        for kind, staff, x, cy in self.sign_pairs:
            if x < first_x.get(staff, 1e9) and x > self.clef_end and kind == "sharp":
                sharp_counts[staff] = sharp_counts.get(staff, 0) + 1
            elif x >= first_x.get(staff, 1e9):
                self.sharp_accidentals.append((kind, staff, x, cy))
        if sharp_counts and not counts:
            sc = list(sharp_counts.values())
            self.key_fifths = max(set(sc), key=sc.count)

    def _accidental_strokes(self) -> list[tuple[Stem, Stem]]:
        """Pairs of short parallel strokes (sharps and naturals). Strokes on a filled head are its
        stems; ones on a hollow "head" may be a sign whose inside passed for one."""
        sp = self.sp
        stems = {id(st) for h in self.heads if h.filled and not h.rest for st in h.stems}
        short = sorted((st for st in self.stems if id(st) not in stems and 1.9 * sp <= st.y1 - st.y0 <= 3.6 * sp),
                       key=lambda st: st.x)
        pairs = []
        for i, a in enumerate(short):
            for b in short[i + 1 :]:
                if b.x - a.x > 0.7 * sp:
                    break
                if b.x - a.x >= 0.2 * sp and min(a.y1, b.y1) - max(a.y0, b.y0) > 0.3 * sp:
                    pairs.append((a, b))
        return pairs

    def _stroke_pairs(self) -> list[tuple[str, int, float, float]]:
        """("sharp" | "natural", staff, x, centre y) for each pair of free strokes 2–3.6 spacings long."""
        sp = self.sp
        attached = {id(st) for h in self.heads for st in h.stems}
        free = sorted(
            (st for st in self.stems if id(st) not in attached and 1.9 * sp <= st.y1 - st.y0 <= 3.6 * sp),
            key=lambda st: st.x,
        )
        pairs, used = [], set()
        for i, a in enumerate(free):
            if i in used:
                continue
            for j in range(i + 1, len(free)):
                b = free[j]
                if b.x - a.x > 0.7 * sp:
                    break
                if j in used or b.x - a.x < 0.2 * sp:
                    continue
                ov = min(a.y1, b.y1) - max(a.y0, b.y0)
                if ov <= 0.3 * sp:
                    continue
                cy = (max(a.y0, b.y0) + min(a.y1, b.y1)) / 2
                staff = self._nearest_staff(cy)
                if staff is None:
                    continue
                # sharp: strokes line up (left one a touch lower); natural: left one clearly higher
                kind = "sharp" if ov > 0.8 * min(a.y1 - a.y0, b.y1 - b.y0) else "natural"
                pairs.append((kind, staff, (a.x + b.x) / 2, cy))
                used.update({i, j})
                break
        return pairs

    def _key_from_text(self, first_x: dict[int, float]) -> int | None:
        """Key signature from a PDF's music-font glyphs: flats ("b") or sharps ("#") on the first
        staff between the clef and the first note. None when there's no text layer."""
        music = [c for c in self.chars if _is_music_font(c["font"])]
        if not music or not self.staves:
            return None
        s0 = self.staves[0]
        limit = first_x.get(0, self.W)
        sp = self.sp
        on_staff = [c for c in music if s0.top - sp <= (c["y0"] + c["y1"]) / 2 <= s0.bottom + sp and c["x1"] < limit]
        flats = sum(1 for c in on_staff if c["ch"] == "b")
        sharps = sum(1 for c in on_staff if c["ch"] == "#")
        return -flats if flats else sharps

    def text_meta(self) -> dict:
        """Title, credits and tempo printed as text in a PDF (empty when there's no text layer)."""
        if not self.chars or not self.staves:
            return {}
        top = self.staves[0].top
        above = [c for c in self.chars if c["y1"] < top - 0.5 * self.sp]
        meta: dict = {}
        # Tempo: "♩ = 130" (the note is a music-font glyph; the number is plain text)
        line = "".join(c["ch"] for c in sorted(above, key=lambda c: c["x0"]))
        m = re.search(r"=\s*(\d{2,3})", line)
        if m and 30 <= int(m.group(1)) <= 240:
            meta["tempo_bpm"] = int(m.group(1))
        # Title: the tallest text; credits: lines starting with Arr./Letra/Música/Words/Music/Tr.
        texty = [c for c in above if not _is_music_font(c["font"])]
        if texty:
            # the title is everything set in the font of the tallest letter
            title_font = max(texty, key=lambda c: c["y1"] - c["y0"])["font"]
            title_chars = [c for c in texty if c["font"] == title_font]
            meta["title"] = _chars_to_text(title_chars)
            rest = [c for c in texty if c not in title_chars]
            lines = _chars_to_lines(rest)
            meta["credits"] = [l for l in lines if re.match(r"(?i)(arr|letra|m[uú]sica|words|music|tr|trad|autor|compos)", l)]
        return meta

    def key_alter(self, letter: str) -> int:
        k = self.key_fifths
        if k > 0 and letter in SHARP_ORDER[:k]:
            return 1
        if k < 0 and letter in FLAT_ORDER[:-k]:
            return -1
        return 0

    def assign_pitches(self) -> None:
        sp = self.sp
        for h in self.heads:
            s = self.staves[h.staff]
            h.step = s.bottom_line_step() + s.step_at(h.cy)
            h.alter = self.key_alter(STEP_NAMES[h.step % 7])
            if h.rest:
                h.step = -100  # never matches a pitched note
        # A sharp or natural just left of a head changes that step for the rest of the measure.
        for kind, staff_i, x, cy in getattr(self, "sharp_accidentals", []):
            s = self.staves[staff_i]
            step = s.bottom_line_step() + s.step_at(cy)
            target = next((h for h in sorted(self.heads, key=lambda h: h.x0)
                           if h.staff == staff_i and h.step == step and 0 < h.x0 - x < 2.2 * sp), None)
            if target is None:
                continue
            bar_end = min([bx for bx, si in self.barlines if si == staff_i // 2 and bx > target.cx] + [self.W])
            for h in self.heads:
                if h.staff == staff_i and h.step == step and target.cx <= h.cx < bar_end:
                    h.alter = {"sharp": 1, "flat": -1}.get(kind, 0)
        # A flat sign just left of a head lowers that step for the rest of the measure.
        for f in getattr(self, "accidentals", []):
            s = self.staves[f.staff]
            # the flat's bowl sits on the note's line/space
            step = s.bottom_line_step() + s.step_at(f.cy)
            target = next((h for h in sorted(self.heads, key=lambda h: h.x0)
                           if h.staff == f.staff and h.step == step and 0 < h.x0 - f.x1 < 2.5 * sp), None)
            if target is None:
                self.warnings.append(f"Flat sign at x={int(f.cx)} has no note after it.")
                continue
            bar_end = min([x for x, si in self.barlines if si == f.staff // 2 and x > target.cx] + [self.W])
            for h in self.heads:
                if h.staff == f.staff and h.step == step and target.cx <= h.cx < bar_end:
                    h.alter = -1

    # ---- shape cross-check
    def _shape_image(self, h: Head) -> np.ndarray:
        """The head's silhouette at a fixed scale (1 spacing = 12 px), centred on a 24x18 canvas.

        Fixed scale keeps size and proportions, which tell a square (la) from an oval (sol).
        """
        mask = h.mask if h.filled else ndi.binary_fill_holes(h.mask)
        k = 12 / self.sp
        w, hgt = max(1, int(round(mask.shape[1] * k))), max(1, int(round(mask.shape[0] * k)))
        small = np.array(Image.fromarray(mask.astype(np.uint8) * 255).resize((w, hgt))) > 127
        canvas = np.zeros((18, 24), bool)
        y, x = (18 - hgt) // 2, (24 - w) // 2
        canvas[max(0, y) : max(0, y) + min(hgt, 18), max(0, x) : max(0, x) + min(w, 24)] = small[:18, :24]
        return canvas

    def check_shapes(self) -> None:
        """Heads of the same scale degree share a shape; flag the ones that don't.

        Compared per fill type (solid vs hollow), and orientation-free: the "fa" triangle
        flips with stem direction. A head is flagged when it looks unlike its own degree,
        or clearly more like another degree's shape.
        """
        tonic_letter = _tonic_letter(self.key_fifths)
        groups: dict[tuple[int, bool], list[tuple[Head, np.ndarray]]] = {}
        for h in [h for h in self.heads if not h.rest]:
            degree = (h.step - STEP_NAMES.index(tonic_letter)) % 7
            groups.setdefault((degree, bool(h.filled)), []).append((h, self._shape_image(h)))

        def iou(a, b):
            return (a & b).sum() / max(1, (a | b).sum())

        def flips(im):
            return (im, im[:, ::-1], im[::-1, :], im[::-1, ::-1])

        protos = {}
        for key, items in groups.items():
            if len(items) < 3:
                continue
            proto = items[0][1]
            for _ in range(3):  # align every head's orientation to the running prototype
                aligned = [max(flips(im), key=lambda v: iou(v, proto)) for _, im in items]
                proto = np.mean(aligned, axis=0) > 0.5
            protos[key] = proto

        for key, items in groups.items():
            for h, im in items:
                score = {k: max(iou(v, pr) for v in flips(im)) for k, pr in protos.items() if k[1] == key[1]}
                own = score.pop(key, None)
                other = max(score.values(), default=0.0)
                if own is not None:
                    h.shape_ok = not (own < 0.5 or (other > 0.7 and other > own + 0.1))
                # (too few heads of this degree on the page to say what it should look like)

    # ---- time signature
    TIME_TOPS = {2, 3, 4, 5, 6, 7, 9, 12}
    TIME_BOTTOMS = {2, 4, 8}

    def read_time_signature(self) -> str | None:
        """The printed time signature ("3/4"), or None when there is none or it can't be read.

        It is only printed on the first system, as two stacked digits between the key signature
        and the first note: the rightmost block of ink there. Erasing the staff lines cuts thin
        strokes of the digits, so line pixels next to the digit's ink are put back before OCR.
        Tesseract misreads single bold digits now and then, so several renderings vote.
        """
        if len(self.staves) < 2:
            return None
        sp = self.sp
        votes: dict[str, int] = {}
        for si in (0, 1):
            st = self.staves[si]
            first = min((h.x0 for h in self.heads if h.staff == si and not h.rest), default=None)
            if first is None:
                continue
            ya, yb = int(st.top - 0.4 * sp), int(st.bottom + 0.4 * sp) + 1
            xa, xb = int(self.clef_end), int(first - 0.3 * sp)
            if xb - xa < sp:
                continue
            band = self.nostaff[ya:yb, xa:xb]
            cols = np.flatnonzero(band.sum(axis=0) >= 2)
            if not len(cols):
                continue
            # runs of ink columns (gaps under ~0.3 spacing don't split a glyph), right to left
            runs: list[list[int]] = []
            for c in cols[::-1]:
                if runs and runs[-1][0] - c <= 0.3 * sp:
                    runs[-1][0] = c
                else:
                    runs.append([c, c])
            # The digits are the rightmost glyph-sized block, though a repeat sign or a bar
            # line may stand between them and the first note.
            for start, end in [r for r in runs if 0.6 * sp <= r[1] - r[0] + 1 <= 2.8 * sp][:2]:
                x0, x1 = xa + start - 3, xa + end + 4
                # Put back erased line pixels in columns where the digit has ink just above or
                # below the line (its strokes crossing it), not the line stubs beside the digit.
                ink = self.nostaff[ya:yb, x0:x1]
                t = self.line_t + 2
                above = np.zeros((2 * t + 1, 3), bool)
                above[t + 1 :] = True  # (dilation mirrors the structure: this reaches upward)
                below = above[::-1]
                crossing = ndi.binary_dilation(ink, structure=above) | ndi.binary_dilation(ink, structure=below)
                glyph = ink | (self.img[ya:yb, x0:x1] & crossing)
                mid = int((st.top + st.bottom) / 2) - ya
                top, bottom = glyph[:mid], glyph[mid:]
                if not top.any() or not bottom.any():
                    continue
                found = 0
                for scale in (1, 2, 3):
                    for psm in ("10", "8"):
                        a, b = _ocr_digits(top, scale, psm), _ocr_digits(bottom, scale, psm)
                        if a in self.TIME_TOPS and b in self.TIME_BOTTOMS:
                            votes[f"{a}/{b}"] = votes.get(f"{a}/{b}", 0) + 1
                            found += 1
                            if votes[f"{a}/{b}"] >= 3:
                                return f"{a}/{b}"  # settled
                if found:
                    break
        if not votes:
            return None
        best = max(votes, key=votes.get)
        # (the deck pipeline cross-checks this against the measures' lengths)
        return best if votes[best] >= 2 else None

    # ---- layout into measures and voices
    def to_page_dict(self) -> dict:
        sp = self.sp
        n_systems = len(self.staves) // 2
        measures_out: list[dict] = []
        for sys_i in range(n_systems):
            bars = sorted({x for x, s in self.barlines if s == sys_i})
            # merge bar line x's found on both staves
            merged: list[int] = []
            for x in bars:
                if not merged or x - merged[-1] > sp:
                    merged.append(x)
            edges = [0, *merged, self.W]
            for a, b in zip(edges, edges[1:]):
                m = {"pickup": False}
                any_notes = False
                for staff_i, (upper, lower) in ((sys_i * 2, ("soprano", "alto")), (sys_i * 2 + 1, ("tenor", "bass"))):
                    heads = [h for h in self.heads if h.staff == staff_i and a < h.cx < b]
                    up, low = self._split_voices(heads)
                    m[upper], m[lower] = up, low
                    any_notes |= bool(heads)
                if any_notes:
                    m["_system"] = sys_i
                    # Where the measure is on the page (both staves), for zooming to it in the app.
                    sys_heads = [h for h in self.heads if h.staff // 2 == sys_i and a < h.cx < b]
                    top, bottom = self.staves[sys_i * 2].top, self.staves[sys_i * 2 + 1].bottom
                    x0 = a if a > 0 else min(h.x0 for h in sys_heads) - 2 * sp
                    x1 = b if b < self.W else max(h.x1 for h in sys_heads) + 1.5 * sp
                    m["box"] = [int(max(0, x0)), int(max(0, top - 2.5 * sp)), int(min(self.W, x1)), int(min(self.H, bottom + 2.5 * sp))]
                    measures_out.append(m)
        time_sig = self.read_time_signature()
        if measures_out:
            num, den = (int(x) for x in (time_sig or "4/4").split("/"))
            bar = num * 4 / den
            first = measures_out[0]
            if 0 < sum(n["dur"] for n in first["soprano"]) < bar:
                first["pickup"] = True
        lyric_lines = self.read_lyrics(measures_out)
        for m in measures_out:
            m.pop("_system", None)
            for v in ("soprano", "alto", "tenor", "bass"):
                for n in m[v]:
                    n.pop("_x", None)
        meta = self.text_meta()
        return {
            "title": meta.get("title"),
            "credits": meta.get("credits", []),
            "exact_lyrics": self.exact_lyrics,
            "key_fifths": self.key_fifths,
            "time_signature": time_sig or "4/4",
            "time_found": time_sig is not None,  # False: 4/4 is only a default
            "tempo_bpm": meta.get("tempo_bpm"),
            "measures": measures_out,
            "lyric_lines": lyric_lines,
            # Words the lower voices sing on their own (also on their notes), when printed
            "lower_lyric_lines": getattr(self, "lower_lyric_lines", []),
            "review": [
                {"x": int(h.cx), "y": int(h.cy), "pitch": _pitch_name(h)}
                for h in self.heads if not h.shape_ok and not h.rest
            ],
            # Every detected notehead, for drawing an overlay on the page image.
            "heads": [
                {"x0": int(h.x0), "y0": int(h.y0), "x1": int(h.x1), "y1": int(h.y1), "pitch": _pitch_name(h),
                 "ok": bool(h.shape_ok), "staff": int(h.staff)}
                for h in self.heads if not h.rest
            ],
            "size": [int(self.W), int(self.H)],
            "key_found": True,
        }

    def _lyric_chars(self, y0: float, y1: float) -> list[dict]:
        """Lyric letters from the PDF text layer inside a band (no OCR needed)."""
        return sorted(
            (c for c in self.chars
             if not _is_music_font(c["font"]) and y0 <= (c["y0"] + c["y1"]) / 2 <= y1 and c["x0"] > self.clef_end),
            key=lambda c: c["x0"],
        )

    def read_lyrics(self, measures: list[dict]) -> list[str]:
        """OCR the lyric line under each treble staff (Tesseract, offline) and put each
        syllable on the soprano note it sits under. Returns one text line per system."""
        import shutil

        if not self.chars and not tesseract_path():
            self.warnings.append("Tesseract not installed: lyrics not read (brew install tesseract tesseract-lang).")
            return []
        sp = self.sp
        lines = []
        self.lower_lyric_lines: list[str] = []
        self._lower_carry: dict[str, bool] = {}
        carry = False  # the last syllable of the previous system continues its word ("Evan-")
        for sys_i in range(len(self.staves) // 2):
            treble, bass = self.staves[sys_i * 2], self.staves[sys_i * 2 + 1]
            # The text band: between the treble's lowest notes and the bass's highest notes.
            y0 = int(treble.bottom + 1.6 * sp)
            y1 = int(bass.top - 1.6 * sp)
            band = self.img[y0:y1, :].copy()
            band[:, : int(self.clef_end)] = False  # system bracket
            # Keep letter-sized marks only: drop slurs (wide, thin arcs) and stray stems.
            lbl, _ = ndi.label(band, structure=np.ones((3, 3)))
            for i, sl in enumerate(ndi.find_objects(lbl), start=1):
                h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
                if (w > 1.5 * sp and h < 0.6 * sp and w > 3 * h) or h > 3.5 * sp:
                    band[sl][lbl[sl] == i] = False
            # Keep only the text line itself (notes from the bass staff can poke into the band).
            rows = band.sum(axis=1) > 0
            runs, start = [], None
            for yy, on in enumerate(np.append(rows, False)):
                if on and start is None:
                    start = yy
                elif not on and start is not None:
                    runs.append((start, yy))
                    start = None
            merged_runs = []
            for a, b in runs:
                if merged_runs and a - merged_runs[-1][1] <= 0.25 * sp:
                    merged_runs[-1] = (merged_runs[-1][0], b)
                else:
                    merged_runs.append((a, b))
            if not merged_runs:
                continue
            a, b = max(merged_runs, key=lambda r: band[r[0] : r[1]].sum())
            # Two lines of words (e.g. a chorus whose lower voices sing their own words in italics,
            # printed under the main line) can touch: let Tesseract find the lines in that case.
            # (only when the words aren't typed text in a PDF's text layer)
            typed = bool(self.chars) and bool(self._lyric_chars(y0 + max(0, a - 4), y0 + b + 4))
            text_rows = [(a, b)] if typed else (_text_line_rows(band, sp) or [(a, b)])
            a, b = text_rows[0]
            full = band
            band = full[max(0, a - 4) : b + 4]
            text_chars = self._lyric_chars(y0 + max(0, a - 4), y0 + b + 4) if self.chars else []
            syl = _syllables_from_chars([(c["ch"], c["x0"], c["x1"]) for c in text_chars]) if text_chars else _ocr_syllables(band)
            if text_chars:
                self.exact_lyrics = True
            if not syl:
                continue
            lines.append(_line_text(syl))
            notes = [n for m in measures if m.get("_system") == sys_i for n in m["soprano"] if n["pitch"] != "REST"]
            _place_syllables(syl, notes, sp, carry)
            carry = syl[-1]["cont"]
            if len(text_rows) > 1:
                self._read_lower_line(full, text_rows[1], measures, sys_i, len(notes), sp)
        return lines

    def _read_lower_line(self, band: np.ndarray, rows: tuple[int, int], measures: list[dict], sys_i: int,
                         n_soprano: int, sp: float) -> None:
        """A second line of words under the first. When it has more syllables than the soprano has
        notes, it's the lower voices' own words (an echo): put it on the tenor and bass notes.
        Otherwise it's another verse printed underneath, which isn't read here."""
        a, b = rows
        syl = _ocr_syllables(band[max(0, a - 4) : b + 4])
        if not syl or len(syl) <= n_soprano:
            return
        for part in ("tenor", "bass"):
            notes = [n for m in measures if m.get("_system") == sys_i for n in m[part] if n["pitch"] != "REST"]
            if len(notes) >= 0.7 * len(syl):
                _place_syllables(syl, notes, sp, self._lower_carry.get(part, False))
                self._lower_carry[part] = syl[-1]["cont"]
        self.lower_lyric_lines.append(_line_text(syl))

    def _duration(self, h: Head, stem: Stem | None) -> float:
        if not h.filled:
            base = 2.0 if stem else 4.0
        else:
            flags = stem.flags if stem else 0
            base = 1.0 / (2 ** flags)
        return base * (1.5 if h.dotted else 1.0) * h.tuplet

    def _split_voices(self, heads: list[Head]) -> tuple[list[dict], list[dict]]:
        """Walk onsets left to right, giving each head to the upper and/or lower voice."""
        sp = self.sp
        onsets: list[list[Head]] = []
        for h in sorted(heads, key=lambda h: h.cx):
            prev = onsets[-1] if onsets else None
            # A chord note a step away, or a unison (two voices on one pitch), is drawn beside the
            # other, touching it; heads on one stem are one chord too: same onset.
            second = prev and any(
                not o.rest and not h.rest and abs(o.step - h.step) <= 1 and h.x0 <= o.x1 + 0.25 * sp for o in prev
            )
            shared_stem = prev and any(st is s2 for o in prev for st in o.stems for s2 in h.stems)
            if prev and (abs(h.cx - np.mean([o.cx for o in prev])) < 0.9 * sp or second or shared_stem):
                prev.append(h)
            else:
                onsets.append([h])
        # Dots line up to the right of the whole chord, so a displaced note's dot sits past its neighbour.
        for group in onsets:
            right = max(o.x1 for o in group)
            for o in group:
                if not o.dotted and not o.rest and any(
                    right < dx < right + 1.3 * sp and abs(dy - o.cy) < 0.75 * sp for dx, dy in getattr(self, "_dots", [])
                ):
                    o.dotted = True
        voices: dict[str, list[dict]] = {"up": [], "low": []}
        free = {"up": 0.0, "low": 0.0}
        for group in onsets:
            group.sort(key=lambda h: h.cy)  # top first
            t = min(free.values())
            due = [v for v in ("up", "low") if abs(free[v] - t) < 1e-6]
            rests = [h for h in group if h.rest]
            notes = [h for h in group if not h.rest]
            if rests and not notes:  # a rest for both voices (or for whichever is waiting)
                rd = rests[0].rest_dur * rests[0].tuplet
                for v in due:
                    voices[v].append({"pitch": "REST", "dur": rd, "tie": None, "syllable": None, "syllabic": None, "box": _box(rests[0])})
                    free[v] = t + rd
                continue
            if rests and notes:  # one voice rests while the other sings
                note = notes[0]
                v_note = "up" if any(st.up for st in note.stems) else "low"
                v_rest = "low" if v_note == "up" else "up"
                rd = rests[0].rest_dur * rests[0].tuplet
                voices[v_rest].append({"pitch": "REST", "dur": rd, "tie": None, "syllable": None, "syllabic": None, "box": _box(rests[0])})
                free[v_rest] = t + rd
                group = [note]
                due = [v_note]
            if len(group) >= 2:
                pairs = [("up", group[0]), ("low", group[-1])]
            elif len(due) == 2:
                pairs = [("up", group[0]), ("low", group[0])]
            else:
                pairs = [(due[0], group[0])]
            for v, h in pairs:
                stem = self._stem_for(h, up=(v == "up"))
                dur = self._duration(h, stem)
                # Catch up a voice that was left behind (e.g. missed head) with a rest.
                if free[v] < t - 1e-6:
                    voices[v].append({"pitch": "REST", "dur": t - free[v], "tie": None, "syllable": None, "syllabic": None})
                voices[v].append({"pitch": _pitch_name(h), "dur": dur, "tie": None, "syllable": None, "syllabic": None,
                                  "_x": float(h.cx), "box": _box(h)})
                free[v] = t + dur
        return voices["up"], voices["low"]

    def _stem_for(self, h: Head, up: bool) -> Stem | None:
        if not h.stems:
            return None
        for st in h.stems:
            if st.up == up:
                return st
        return h.stems[0]

    # ---- run all
    def read(self) -> dict:
        self.find_staves()
        if not self.staves:
            raise ValueError("No staves found on this page")
        self.clean()
        self.find_vertical_strokes()
        self.confirm_barlines()
        glyphs = self._music_glyphs()
        if glyphs["heads"]:
            # PDF from notation software: noteheads, dots, flags, rests and accidentals are font
            # characters with exact positions. Stems, beams and bar lines still come from the picture.
            self.glyph_mode = True
            self.heads = glyphs["heads"]
            self.attach()
            self._apply_glyph_marks(glyphs)
            self.read_key()
            self.heads += glyphs["rests"]
            self.assign_pitches()
            self.apply_triplets()
            # round noteheads: there are no shapes to cross-check
        else:
            self.glyph_mode = False
            self.find_heads()
            self.attach()
            self.filter_heads()
            self.read_key()
            self.find_rests()
            self.assign_pitches()
            self.apply_triplets()
            self.check_shapes()
            # Round-note scans (not shape notes) would flag almost every head: drop the check then.
            if self.heads and sum(not h.shape_ok for h in self.heads) > 0.3 * len(self.heads):
                for h in self.heads:
                    h.shape_ok = True
        return self.to_page_dict()

    # Music-font characters (Finale Maestro and similar) → what they mean
    HEAD_GLYPHS = {"œ": True, "˙": False, "w": False}  # filled?
    REST_GLYPHS = {"Œ": 1.0, "‰": 0.5, "Ó": 2.0, "∑": 4.0, "≈": 0.25}
    FLAG_GLYPHS = {"j": 1, "J": 1, "K": 2, "k": 2}

    def _music_glyphs(self) -> dict:
        sp = self.sp
        music = [c for c in self.chars if _is_music_font(c["font"])]
        heads, rests = [], []
        seen = set()
        for c in music:
            cx, cy = (c["x0"] + c["x1"]) / 2, (c["y0"] + c["y1"]) / 2
            staff = self._nearest_staff(cy)
            if staff is None:
                continue
            x0, y0, x1, y1 = int(c["x0"]), int(c["y0"]), int(round(c["x1"])), int(round(c["y1"]))
            if c["ch"] in self.HEAD_GLYPHS:
                key = (round(cx / 3), round(cy / 3))
                if key in seen:
                    continue
                seen.add(key)
                mask = self.img[max(0, y0) : y1, max(0, x0) : x1].copy()
                heads.append(Head(x0, y0, x1, y1, filled=self.HEAD_GLYPHS[c["ch"]], mask=mask, staff=staff))
            elif c["ch"] in self.REST_GLYPHS and x0 > self.clef_end:
                rests.append(Head(x0, y0, x1, y1, filled=True, mask=np.zeros((1, 1), bool), staff=staff,
                                  rest=True, rest_dur=self.REST_GLYPHS[c["ch"]]))
        return {"heads": heads, "rests": rests, "music": music}

    def _apply_glyph_marks(self, glyphs: dict) -> None:
        """Dots, flags and accidentals from music-font characters."""
        sp = self.sp
        music = glyphs["music"]
        dots = [((c["x0"] + c["x1"]) / 2, (c["y0"] + c["y1"]) / 2) for c in music if c["ch"] == "."]
        # augmentation dots sit right of a head (repeat-sign dots sit by a bar line, far from heads)
        self._dots = dots
        for h in self.heads:
            h.dotted = any(h.x1 < dx < h.x1 + 1.3 * sp and abs(dy - h.cy) < 0.75 * sp for dx, dy in dots)
        for c in music:
            n = self.FLAG_GLYPHS.get(c["ch"])
            if not n:
                continue
            fx = c["x0"]
            stem = min(self.stems, key=lambda st: abs(st.x - fx) + (0 if st.y0 - sp <= (c["y0"] + c["y1"]) / 2 <= st.y1 + sp else 1e6), default=None)
            if stem and abs(stem.x - fx) < 0.6 * sp:
                stem.flags = max(stem.flags, n)
        # in-measure accidentals: the note sits on the flat's bowl (low in its box), centre for #/♮
        first_x: dict[int, float] = {}
        for h in self.heads:
            first_x[h.staff] = min(first_x.get(h.staff, 1e9), h.x0)
        self.flats = []
        self.sharp_accidentals = []
        for c in music:
            kind = {"b": "flat", "#": "sharp", "n": "natural"}.get(c["ch"])
            if not kind:
                continue
            cy = c["y1"] - 0.55 * sp if kind == "flat" else (c["y0"] + c["y1"]) / 2
            staff = self._nearest_staff(cy)
            if staff is None or c["x1"] < first_x.get(staff, 1e9):
                continue  # key signature (read separately)
            self.sharp_accidentals.append((kind, staff, c["x1"], cy))

    def _stroke_pairs_or_glyphs(self):
        return [] if getattr(self, "glyph_mode", False) else self._stroke_pairs()


def _tonic_letter(fifths: int) -> str:
    # Major-key tonic for a given number of sharps (+) / flats (-).
    circle = ["C", "G", "D", "A", "E", "B", "F", "C"]
    flats = ["C", "F", "B", "E", "A", "D", "G", "C"]
    return circle[fifths] if fifths >= 0 else flats[-fifths]


def _pitch_name(h: Head) -> str:
    letter = STEP_NAMES[h.step % 7]
    octave = h.step // 7
    acc = {1: "#", -1: "b", 0: ""}[h.alter]
    return f"{letter}{acc}{octave}"


def read_page(image, chars: list[dict] | None = None) -> dict:
    """Read one page (path or PNG bytes) into the shared page dict; `chars` is a PDF's text layer."""
    return ShapeNotePage(load_binary(image), chars).read()


# --------------------------------------------------------------------------- lyrics (Tesseract)

def _ocr_words(band: np.ndarray) -> list[tuple[str, float]]:
    """Run Tesseract on a text band; returns (token, x centre) left to right."""
    import subprocess
    import tempfile

    if not band.any():
        return []
    with tempfile.NamedTemporaryFile(suffix=".png") as f:
        # A white margin and half scale suit Tesseract best on these large slide fonts.
        im = Image.fromarray(((~band) * 255).astype(np.uint8))
        padded = Image.new("L", (im.width + 80, im.height + 80), 255)
        padded.paste(im, (40, 40))
        padded.resize((padded.width // 2, padded.height // 2), Image.LANCZOS).save(f.name)
        out = _run_tesseract([f.name, "-", "-l", "spa", "--psm", "7", "tsv"])
    words = []
    for row in out.splitlines()[1:]:
        cols = row.split("\t")
        if len(cols) == 12 and cols[11].strip() and float(cols[10]) >= 0:
            left, width = int(cols[6]), int(cols[8])
            words.append((cols[11].strip(), (left + width / 2) * 2 - 40))
    return words


def _split_tokens(words: list[tuple[str, float]]) -> list[tuple[str, float, bool]]:
    """Break OCR words on hyphens/underscores into (syllable, x, continues_word)."""
    out = []
    for text, x in words:
        parts = [p for p in text.replace("_", " _ ").replace("-", " - ").split()]
        for i, part in enumerate(parts):
            if part == "-" and out:
                out[-1] = (out[-1][0], out[-1][1], True)
            elif part not in ("-", "_"):
                out.append((part, x, False))
    return out


def _join_syllables(tokens: list[str]) -> str:
    import re

    text = re.sub(r"\s*-\s*", "", " ".join(tokens)).replace("_", " ")
    return " ".join(text.split())


def _attach_syllables(words: list[tuple[str, float]], notes: list[dict]) -> None:
    """Give each syllable to the nearest still-free soprano note, keeping order."""
    syl = _split_tokens(words)
    i = 0
    prev_cont = False
    for text, x, cont in syl:
        # syllables are centred under their note; move forward through the notes
        best = None
        for j in range(i, len(notes)):
            d = abs(notes[j]["_x"] - x)
            if best is None or d < best[0]:
                best = (d, j)
            elif notes[j]["_x"] > x:
                break
        if best is None:
            break
        j = best[1]
        notes[j]["syllable"] = text
        notes[j]["syllabic"] = ("middle" if cont else "end") if prev_cont else ("begin" if cont else "single")
        prev_cont = cont
        i = j + 1


def _ocr_digits(glyph: np.ndarray, scale: int = 1, psm: str = "10") -> int | None:
    """One time-signature number (black-on-white mask) read by Tesseract, or None."""
    import subprocess
    import tempfile

    if not glyph.any():
        return None
    rows, cols = np.flatnonzero(glyph.any(axis=1)), np.flatnonzero(glyph.any(axis=0))
    glyph = glyph[rows[0] : rows[-1] + 1, cols[0] : cols[-1] + 1]
    im = Image.fromarray(((~glyph) * 255).astype(np.uint8))
    if scale != 1:
        im = im.resize((im.width * scale, im.height * scale), Image.LANCZOS)
    pad = 30 * scale
    padded = Image.new("L", (im.width + 2 * pad, im.height + 2 * pad), 255)
    padded.paste(im, (pad, pad))
    with tempfile.NamedTemporaryFile(suffix=".png") as f:
        padded.save(f.name)
        out = _run_tesseract([f.name, "-", "--psm", psm, "-c", "tessedit_char_whitelist=0123456789"]).strip()
    return int(out) if out.isdigit() else None


def _text_line_rows(band: np.ndarray, sp: float) -> list[tuple[int, int]]:
    """The text lines in a lyric band, top to bottom, as (top, bottom) rows: Tesseract's own line
    finding, so two lines that touch are still told apart. Specks (stray marks read as a "line")
    are dropped by how much ink their rows hold. Empty if Tesseract finds nothing."""
    import subprocess
    import tempfile

    if not band.any():
        return []
    with tempfile.NamedTemporaryFile(suffix=".png") as f:
        im = Image.fromarray(((~band) * 255).astype(np.uint8))
        padded = Image.new("L", (im.width + 80, im.height + 80), 255)
        padded.paste(im, (40, 40))
        padded.resize((padded.width // 2, padded.height // 2), Image.LANCZOS).save(f.name)
        out = subprocess.run([tesseract_path() or "tesseract", f.name, "-", "-l", "spa", "--psm", "6", "tsv"],
                             capture_output=True, text=True).stdout
    found: dict[tuple[str, str, str], list[int]] = {}
    for row in out.splitlines()[1:]:
        c = row.split("\t")
        if len(c) == 12 and c[0] == "5" and c[11].strip():
            top, h = int(c[7]) * 2 - 40, int(c[9]) * 2
            box = found.setdefault((c[2], c[3], c[4]), [10**9, 0])
            box[0], box[1] = min(box[0], top), max(box[1], top + h)
    boxes = sorted((max(0, t), min(band.shape[0], b)) for t, b in found.values() if b > t)
    if not boxes:
        return []
    ink = [int(band[t:b].sum()) for t, b in boxes]
    boxes = [(t, b) for (t, b), k in zip(boxes, ink) if k >= 0.35 * max(ink) and b - t >= 0.6 * sp]
    # Overlapping boxes (accents, descenders) split halfway, so each row belongs to one line.
    rows: list[tuple[int, int]] = []
    for t, b in boxes:
        if rows and t < rows[-1][1]:
            mid = (t + rows[-1][1]) // 2
            rows[-1] = (rows[-1][0], mid)
            t = mid
        rows.append((t, b))
    return rows


def _ocr_chars(band: np.ndarray) -> list[tuple[str, float, float]]:
    """Letters with their left/right x in band pixels, from Tesseract's per-character boxes."""
    import subprocess
    import tempfile

    if not band.any():
        return []
    with tempfile.NamedTemporaryFile(suffix=".png") as f:
        im = Image.fromarray(((~band) * 255).astype(np.uint8))
        padded = Image.new("L", (im.width + 80, im.height + 80), 255)
        padded.paste(im, (40, 40))
        padded.resize((padded.width // 2, padded.height // 2), Image.LANCZOS).save(f.name)
        out = _run_tesseract([f.name, "-", "-l", "spa", "--psm", "7", "-c", "hocr_char_boxes=1", "hocr"])
    import html

    chars = []
    for x0, x1, ch in re.findall(r"x_bboxes (\d+) \d+ (\d+) \d+;[^>]*>([^<]*)</span>", out):
        ch = html.unescape(ch)
        if ch.strip():
            chars.append((ch, int(x0) * 2 - 40, int(x1) * 2 - 40))  # back to band pixels
    return chars


HYPHENS = "-‐‑‒–—−"


def _find_hyphens(band: np.ndarray) -> list[tuple[int, int, int, int]]:
    """Hyphens in a lyric line picture, as (x0, x1, y0, y1), even when they touch a letter.

    A hyphen is a short level bar half-way up the letters next to it, with nothing above or below
    it in its columns. Tesseract misreads one that touches a letter ("nun-cia" -> "nun<c ia"), so
    these are found from the pixels instead. Letter height is measured around each candidate,
    because words on one line don't always sit on the same baseline.
    """
    if not band.any():
        return []
    rows = band.sum(axis=1)
    text_rows = np.flatnonzero(rows >= 0.25 * rows.max())
    ta, tb = int(text_rows[0]), int(text_rows[-1])
    th = tb - ta + 1
    if th < 8:
        return []
    text = band[ta : tb + 1]
    tops = np.full(band.shape[1], -1)
    bottoms = np.full(band.shape[1], -1)
    single = np.zeros(band.shape[1], dtype=bool)
    for x in range(band.shape[1]):
        ys = np.flatnonzero(text[:, x])
        if len(ys):
            tops[x], bottoms[x] = ys[0], ys[-1]
            # one solid run, thin, and no ink elsewhere in the column (stems below the text included)
            single[x] = ys[-1] - ys[0] + 1 == len(ys) and len(ys) <= 0.25 * th and band[:, x].sum() == len(ys)
    out = []
    x = 0
    n = band.shape[1]
    while x < n:
        if not single[x]:
            x += 1
            continue
        x0, cy = x, (tops[x] + bottoms[x]) / 2
        y0, y1 = tops[x], bottoms[x]
        while x < n and single[x] and abs((tops[x] + bottoms[x]) / 2 - cy) <= max(2.0, 0.06 * th):
            y0, y1 = min(y0, tops[x]), max(y1, bottoms[x])
            x += 1
        x1 = x - 1
        # A hyphen is a straight bar of even thickness (a curve, like the hook of a "J", is not).
        thick = [bottoms[c] - tops[c] + 1 for c in range(x0, x1 + 1)]
        if (y1 - y0 + 1) > np.median(thick) + 2 or max(thick) - min(thick) > 2:
            continue
        # A stroke that only turns up or down into a letter (the hook of a "J") isn't a hyphen.
        if "part" in (_side_contact(band, x0 - 1, ta + int(y0), ta + int(y1), -1), _side_contact(band, x1 + 1, ta + int(y0), ta + int(y1), 1)):
            continue
        # The letters around it: median top and bottom of nearby inked columns.
        win = [c for c in range(max(0, x0 - th), min(n, x1 + th + 1)) if (c < x0 or c > x1) and tops[c] >= 0 and not single[c]]
        if len(win) < 4:
            continue
        lt, lb = float(np.median(tops[win])), float(np.median(bottoms[win]))
        h = lb - lt
        mid = (y0 + y1) / 2
        if h > 4 and lt + 0.3 * h <= mid <= lb - 0.15 * h and 0.25 * h <= x1 - x0 + 1 <= 2.5 * h:
            out.append((x0, x1, ta + int(y0), ta + int(y1)))
    return out


def _side_contact(band: np.ndarray, x: int, y0: int, y1: int, side: int) -> str:
    """What a bar from rows y0..y1 meets in column x: "none", "letter" (a stroke crossing it,
    reaching above and below, as a hyphen touching a stem or curve does) or "part" (ink that only
    carries on up or down, as when the bar is itself part of a letter, like the hook of a "J")."""
    if not (0 <= x < band.shape[1]) or not band[max(0, y0 - 1) : y1 + 2, x].any():
        return "none"
    # Look a few pixels either side of the joint: the edge of a round letter (the "c" in "nun-cia")
    # only reaches up and down just past its tip, and a slanted one (the leg of an "A") runs on
    # under the bar.
    k = max(2, (y1 - y0 + 1) // 2)
    cols = range(max(0, x - k), min(band.shape[1], x + k + 1))
    above = band[: max(0, y0 - 2), cols].any()
    below = band[y1 + 3 :, cols].any()
    return "letter" if above and below else "part"


def _touches_letter(band: np.ndarray, hyphen: tuple[int, int, int, int]) -> bool:
    """Whether the hyphen's bar runs into a letter on its left or right."""
    x0, x1, y0, y1 = hyphen
    return "letter" in (_side_contact(band, x0 - 1, y0, y1, -1), _side_contact(band, x1 + 1, y0, y1, 1))


def _ocr_syllables(band: np.ndarray) -> list[dict]:
    """Lyric syllables from a picture of the text line (Tesseract letter positions).

    Hyphens are taken out of the picture before reading (so a hyphen touching a letter can't turn
    into a stray mark) and put back where they were, which keeps each word's syllables joined.
    """
    # Only hyphens that touch a letter need help; Tesseract reads free-standing ones fine, and
    # reshaping the whole line changes how it reads everything else.
    hyphens = [hy for hy in _find_hyphens(band) if _touches_letter(band, hy)]
    if not hyphens:
        return _syllables_from_chars(_ocr_chars(band))
    clean = band.copy()
    for x0, x1, y0, y1 in hyphens:
        clean[y0 : y1 + 1, x0 : x1 + 1] = False
    # Open a wide blank gap at each hyphen so Tesseract's letter boxes can't straddle it,
    # then map the letters back to page positions.
    gap = band.shape[0] // 2
    cuts = [(x0 + x1 + 1) // 2 for x0, x1, _, _ in hyphens]
    parts, last = [], 0
    for c in cuts:
        parts += [clean[:, last:c], np.zeros((band.shape[0], gap), dtype=bool)]
        last = c
    parts.append(clean[:, last:])
    wide = np.hstack(parts)

    def back(x: float) -> float:
        for k, c in enumerate(cuts):
            if x < c + k * gap:
                return x - k * gap
            if x < c + (k + 1) * gap:
                return float(c)
        return x - len(cuts) * gap

    chars = []
    for ch, x0, x1 in _ocr_chars(wide):
        mid = (x0 + x1) / 2
        if ch in HYPHENS and any(abs(mid - (c + k * gap + gap / 2)) < gap for k, c in enumerate(cuts)):
            continue  # this hyphen was found from the pixels already
        side = sum(1 for k, c in enumerate(cuts) if mid >= c + k * gap + gap / 2)  # hyphens to its left
        half = (x1 - x0) / 2
        m = back(mid)
        # keep each letter on its side of its hyphens
        lo = (hyphens[side - 1][1] + 1) if side else -1e9
        hi = hyphens[side][0] if side < len(hyphens) else 1e9
        m = min(max(m, lo + half), hi - half)
        chars.append((ch, m - half, m + half))
    chars += [("-", float(x0), float(x1 + 1)) for x0, x1, _, _ in hyphens]
    return _syllables_from_chars(sorted(chars, key=lambda c: (c[1] + c[2]) / 2))


def _is_music_font(font: str) -> bool:
    f = font.lower()
    return any(k in f for k in ("maestro", "petrucci", "opus", "bravura", "emmentaler", "sonata", "engraver", "jazz", "finale"))


def _chars_to_lines(chars: list[dict]) -> list[str]:
    # Group by line: letters whose boxes overlap vertically with the line's tallest letter
    # (small marks like "." and "," sit low but still inside that range).
    lines: list[list[dict]] = []
    for c in sorted(chars, key=lambda c: (c["y1"], c["x0"])):
        for line in lines:
            top, bottom = min(x["y0"] for x in line), max(x["y1"] for x in line)
            if c["y1"] > top and c["y0"] < bottom + 0.15 * (bottom - top):
                line.append(c)
                break
        else:
            lines.append([c])
    lines.sort(key=lambda l: min(x["y0"] for x in l))
    return [_chars_to_text(l) for l in lines]


def _chars_to_text(chars: list[dict]) -> str:
    """Join letters left to right, putting a space where the gap is wider than a narrow letter."""
    cs = sorted(chars, key=lambda c: c["x0"])
    if not cs:
        return ""
    widths = sorted(c["x1"] - c["x0"] for c in cs if c["ch"].isalpha()) or [8]
    w = widths[len(widths) // 2]
    out = cs[0]["ch"]
    for a, b in zip(cs, cs[1:]):
        out += (" " if b["x0"] - a["x1"] > 0.35 * w else "") + b["ch"]
    return " ".join(out.split())


def _syllables_from_chars(chars: list[tuple[str, float, float]]) -> list[dict]:
    """Split a printed lyric line into syllables using letter positions.

    A hyphen continues the word; an underscore (elision), a wide gap, a lower→upper case change
    or a comma before a letter starts a new word. Each syllable keeps its centre x.
    """
    if not chars:
        return []
    widths = sorted(x1 - x0 for c, x0, x1 in chars if c.isalpha())
    w = widths[len(widths) // 2] if widths else 16
    out: list[dict] = []
    cur: list[tuple[str, float, float]] = []

    def flush(cont: bool):
        if cur:
            text = "".join(c for c, _, _ in cur)
            out.append({"text": text, "x": (cur[0][1] + cur[-1][2]) / 2, "cont": cont})
            cur.clear()

    prev = None
    for ch, x0, x1 in chars:
        if ch == "|":
            ch = "I"  # Tesseract reads a lone capital I (sans-serif) as a bar; lyrics never have one
        if ch in HYPHENS:  # PDF text layers may use a typographic hyphen or dash
            flush(True)
            prev = None
            continue
        if ch == "_":
            flush(False)
            prev = None
            continue
        if prev is not None:
            gap = x0 - prev[2]
            camel = prev[0].isalpha() and prev[0].islower() and ch.isalpha() and ch.isupper()
            after_punct = prev[0] in ",;:.!?" and ch.isalpha()
            if gap > 0.45 * w or camel or after_punct:
                flush(False)
        cur.append((ch, x0, x1))
        prev = (ch, x0, x1)
    flush(False)
    return [s for s in out if any(c.isalpha() for c in s["text"])]


def _line_text(syl: list[dict]) -> str:
    """The line as words. A word that carries on to the next system keeps a trailing hyphen
    ("Evan-"), so it can be joined back up ("Evangelio") instead of read as two words."""
    parts = []
    for s in syl:
        parts.append(s["text"] + ("" if s["cont"] else " "))
    text = re.sub(r"\s+", " ", "".join(parts)).strip()
    return text + "-" if syl and syl[-1]["cont"] and text[-1:].isalpha() else text


def _place_syllables(syl: list[dict], notes: list[dict], sp: float, carry: bool = False) -> None:
    """Put syllables on soprano notes in order, each under the note nearest it.

    Dynamic programming: A[i][j] = best cost with syllable i sung on note j. A syllable either takes a
    later note than the previous one (notes in between are held/melisma) or shares the previous
    note: an elision like "Te_a", printed as two words under one note.
    """
    n, m = len(syl), len(notes)
    if not n or not m:
        return
    INF = float("inf")
    share = 0.6 * sp
    d = [[abs(syl[i]["x"] - notes[j]["_x"]) for j in range(m)] for i in range(n)]
    A = [[INF] * m for _ in range(n)]
    B: list[list[tuple[int, int] | None]] = [[None] * m for _ in range(n)]
    for j in range(m):
        A[0][j] = d[0][j]
    for i in range(1, n):
        best, arg = INF, -1  # min over A[i-1][k] for k < j
        for j in range(m):
            if j > 0 and A[i - 1][j - 1] < best:
                best, arg = A[i - 1][j - 1], j - 1
            new_note = best
            same_note = A[i - 1][j] + share
            if new_note <= same_note:
                A[i][j], B[i][j] = d[i][j] + new_note, (i - 1, arg)
            else:
                A[i][j], B[i][j] = d[i][j] + same_note, (i - 1, j)
    j = min(range(m), key=lambda k: A[n - 1][k])
    place = [0] * n
    for i in range(n - 1, -1, -1):
        place[i] = j
        if B[i][j]:
            j = B[i][j][1]
    groups: dict[int, list[dict]] = {}
    for i, j in enumerate(place):
        groups.setdefault(j, []).append(syl[i])
    prev_cont = carry  # a word carried over from the previous system goes on ("ge" in "Evan-gelio")
    for j in sorted(groups):
        g = groups[j]
        text = " ".join(x["text"] for x in g)  # elided words share the note
        cont = g[-1]["cont"]
        notes[j]["syllable"] = text
        notes[j]["syllabic"] = ("middle" if cont else "end") if prev_cont else ("begin" if cont else "single")
        prev_cont = cont


def tesseract_path() -> str | None:
    """Where Tesseract is. Apps opened from Finder get a bare PATH without Homebrew, so look in the
    usual install folders too (or use HYMN_TESSERACT if set)."""
    import os
    import shutil

    for c in (os.environ.get("HYMN_TESSERACT"), shutil.which("tesseract"), "/opt/homebrew/bin/tesseract",
              "/usr/local/bin/tesseract", r"C:\Program Files\Tesseract-OCR\tesseract.exe"):
        if c and os.path.isfile(c):
            return c
    return None


def _run_tesseract(args: list[str]) -> str:
    """Run Tesseract and return its text output ('' if it isn't installed). Its messages can contain
    non-text bytes in some environments, so decode leniently instead of crashing."""
    import subprocess

    exe = tesseract_path()
    if not exe:
        return ""
    return subprocess.run([exe, *args], capture_output=True, encoding="utf-8", errors="replace").stdout
