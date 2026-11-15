"""Which meshes and nodes differ between two GLBs, and whether it is the shape or only the baked colour.
  python3 tools/blender/build/glb_diff.py <old.glb> <new.glb>        (old may be "HEAD:public/models/build/x.glb")
A kit change should move only the pieces it means to. Baked AO reaches about 1.5 m, so a piece next to a changed one
may differ in COLOR_0 alone: those are listed apart from the ones whose positions, normals or indices changed."""
import json, struct, subprocess, sys


def load(p):
    b = subprocess.run(["git", "show", p], capture_output=True, check=True).stdout if p.startswith("HEAD:") else open(p, "rb").read()
    n = struct.unpack("<I", b[12:16])[0]
    return json.loads(b[20:20 + n]), b[20 + n + 8:]


def meshes(j, bin_):
    out = {}
    for m in j["meshes"]:
        d = {}
        for p in m["primitives"]:
            for k, ia in sorted(p["attributes"].items()) + [("indices", p.get("indices"))]:
                if ia is None:
                    continue
                acc = j["accessors"][ia]; v = j["bufferViews"][acc["bufferView"]]
                o = v.get("byteOffset", 0) + acc.get("byteOffset", 0)
                d[k] = d.get(k, b"") + bin_[o:o + v["byteLength"]]
        out[m["name"]] = d
    return out


(a, ba), (b, bb) = load(sys.argv[1]), load(sys.argv[2])
ma, mb = meshes(a, ba), meshes(b, bb)
shape, colour = [], []
for n in sorted(set(ma) | set(mb)):
    x, y = ma.get(n), mb.get(n)
    if x == y:
        continue
    if x is None or y is None or any(x.get(k) != y.get(k) for k in set(x) | set(y) if k != "COLOR_0"):
        shape.append(n + ("" if x and y else " (added)" if y else " (removed)"))
    else:
        colour.append(n)
strip = lambda n: {k: v for k, v in n.items() if k not in ("mesh", "children")}
na, nb = {n["name"]: strip(n) for n in a["nodes"]}, {n["name"]: strip(n) for n in b["nodes"]}
nodes = [n for n in sorted(set(na) | set(nb)) if na.get(n) != nb.get(n)]
print(f"{len(set(ma) | set(mb))} meshes: {len(shape)} changed shape, {len(colour)} changed baked colour only, {len(set(ma) | set(mb)) - len(shape) - len(colour)} identical")
print("  shape :", " ".join(shape) or "-")
print("  colour:", " ".join(colour) or "-")
print("  nodes :", " ".join(nodes) or "-")
