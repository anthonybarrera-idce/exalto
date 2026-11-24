"""Print what the local reader found on a page, measure by measure."""
import sys
from hymn_processor.shape_omr import ShapeNotePage, load_binary
p = ShapeNotePage(load_binary(sys.argv[1]))
d = p.read()
print("key", p.key_fifths, "warnings", p.warnings)
for i, m in enumerate(d["measures"], 1):
    for v in ("soprano", "alto", "tenor", "bass"):
        tot = sum(n["dur"] for n in m[v])
        print(f"m{i} {v:8s} {tot:4g}{'' if tot == 4 else ' !'}  " + " ".join(f'{n["pitch"]}/{n["dur"]:g}' for n in m[v]))
print("review", d["review"])
