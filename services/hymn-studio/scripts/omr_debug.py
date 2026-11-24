"""Draw what the local shape-note reader detected on top of a page image."""
import sys
from PIL import Image, ImageDraw
from hymn_processor.shape_omr import ShapeNotePage, load_binary, _pitch_name

src, out = sys.argv[1], sys.argv[2]
p = ShapeNotePage(load_binary(src))
p.read()
im = Image.open(src).convert("RGB")
d = ImageDraw.Draw(im)
for st in p.stems:
    d.line([(st.x, st.y0), (st.x, st.y1)], fill=(0, 160, 255) if st.up else (255, 140, 0), width=3)
    if st.flags:
        d.text((st.x + 4, st.y0 if st.up else st.y1), f"f{st.flags}", fill=(0, 120, 0))
for x, s in p.barlines:
    d.line([(x, 0), (x, p.H)], fill=(0, 200, 0), width=1)
for h in p.heads:
    c = (220, 0, 0) if h.shape_ok else (200, 0, 200)
    d.rectangle([h.x0, h.y0, h.x1, h.y1], outline=c, width=2)
    d.text((h.x0, h.y1 + 2), _pitch_name(h) + ("." if h.dotted else "") + ("" if h.filled else "o"), fill=c)
im.save(out)
print("key", p.key_fifths, "heads", len(p.heads), "warnings", p.warnings)
