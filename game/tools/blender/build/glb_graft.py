"""Replace named assets inside a kit GLB with their rebuilt versions, and leave every other asset's data untouched.

  python3 tools/blender/build/glb_graft.py <base.glb | HEAD:path> <rebuilt.glb> <out.glb> <asset> [asset ...] [--manifest tools/blender/build/manifest/<group>.json]

Why: ruins, landmarks and containers do not rebuild byte-identical (their rocks and debris follow Python's per-run
string hashing), so a full rebuild to fix one piece would quietly reshape the others. This takes the base file,
swaps in only the named root assets (their meshes, node transforms and extras) from a fresh build, and repacks the
buffer. Mesh data of every other asset is copied bit for bit: check with glb_diff.py.
With --manifest the manifest (as committed) gets the new triangle counts of the grafted assets and the new file size.
The asset's node tree must keep its node names and materials (which is the rule for a kit fix anyway).
"""
import json, struct, subprocess, sys

argv = sys.argv[1:]
manifest = None
if "--manifest" in argv:
    i = argv.index("--manifest"); manifest = argv[i + 1]; del argv[i:i + 2]
base_p, new_p, out_p, assets = argv[0], argv[1], argv[2], argv[3:]


def load(p):
    b = subprocess.run(["git", "show", p], capture_output=True, check=True).stdout if p.startswith("HEAD:") else open(p, "rb").read()
    n = struct.unpack("<I", b[12:16])[0]
    return json.loads(b[20:20 + n]), b[20 + n + 8:]


(base, bbin), (new, nbin) = load(base_p), load(new_p)
blobs = []                     # accessor index in the OUTPUT -> bytes; base accessors keep their numbers, grafted ones are appended


def acc_bytes(j, bin_, i):
    a = j["accessors"][i]; v = j["bufferViews"][a["bufferView"]]
    o = v.get("byteOffset", 0) + a.get("byteOffset", 0)
    size = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}[a["componentType"]] * {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}[a["type"]]
    assert "byteStride" not in v, "interleaved buffer views are not supported"
    return bin_[o:o + a["count"] * size], v.get("target")


out_acc = [dict(a) for a in base["accessors"]]
data = [acc_bytes(base, bbin, i) for i in range(len(base["accessors"]))]


def subtree(j, name):
    root = next(i for i in j["scenes"][0]["nodes"] if j["nodes"][i]["name"] == name)
    out, todo = {}, [root]
    while todo:
        i = todo.pop(); out[j["nodes"][i]["name"]] = i; todo += j["nodes"][i].get("children", [])
    return out


mat_of = {m["name"]: i for i, m in enumerate(base["materials"])}
for name in assets:
    bn, nn = subtree(base, name), subtree(new, name)
    assert set(bn) == set(nn), f"{name}: node names differ: {sorted(set(bn) ^ set(nn))}"
    for nname, ni in nn.items():
        src, dst = new["nodes"][ni], base["nodes"][bn[nname]]
        for k in ("translation", "rotation", "scale", "extras"):
            if k in src: dst[k] = src[k]
            else: dst.pop(k, None)
        assert ("mesh" in src) == ("mesh" in dst), f"{nname}: mesh added or removed"
        if "mesh" not in src:
            continue
        sm, dm = new["meshes"][src["mesh"]], base["meshes"][dst["mesh"]]
        prims = []
        for p in sm["primitives"]:
            q = dict(p)
            for key, ia in list(p["attributes"].items()) + ([("indices", p["indices"])] if "indices" in p else []):
                out_acc.append({k: v for k, v in new["accessors"][ia].items() if k not in ("bufferView", "byteOffset")})
                data.append(acc_bytes(new, nbin, ia))
                if key == "indices": q["indices"] = len(out_acc) - 1
                else: q.setdefault("_a", {})[key] = len(out_acc) - 1
            q["attributes"] = q.pop("_a")
            if "material" in p:
                q["material"] = mat_of[new["materials"][p["material"]]["name"]]
            prims.append(q)
        dm["primitives"] = prims
        for k in ("extras",):
            if k in sm: dm[k] = sm[k]
# repack: only accessors a mesh still uses, one buffer view each, 4-byte aligned
used = sorted({ia for m in base["meshes"] for p in m["primitives"] for ia in list(p["attributes"].values()) + ([p["indices"]] if "indices" in p else [])})
remap = {old: i for i, old in enumerate(used)}
bin_out, views, accs = bytearray(), [], []
for old in used:
    blob, target = data[old]
    while len(bin_out) % 4: bin_out.append(0)
    v = {"buffer": 0, "byteOffset": len(bin_out), "byteLength": len(blob)}
    if target: v["target"] = target
    views.append(v); bin_out += blob
    a = {k: v_ for k, v_ in out_acc[old].items() if k not in ("bufferView", "byteOffset")}; a["bufferView"] = len(views) - 1
    accs.append(a)
while len(bin_out) % 4: bin_out.append(0)
for m in base["meshes"]:
    for p in m["primitives"]:
        p["attributes"] = {k: remap[v] for k, v in p["attributes"].items()}
        if "indices" in p: p["indices"] = remap[p["indices"]]
base["accessors"], base["bufferViews"], base["buffers"] = accs, views, [{"byteLength": len(bin_out)}]
js = json.dumps(base, separators=(",", ":")).encode()
js += b" " * (-len(js) % 4)
total = 12 + 8 + len(js) + 8 + len(bin_out)
open(out_p, "wb").write(b"glTF" + struct.pack("<II", 2, total) + struct.pack("<I", len(js)) + b"JSON" + js + struct.pack("<I", len(bin_out)) + b"BIN\x00" + bytes(bin_out))
print(f"grafted {', '.join(assets)} into {out_p}: {total} bytes, {len(accs)} accessors")
if manifest:
    old = json.loads(subprocess.run(["git", "show", "HEAD:" + manifest], capture_output=True, check=True).stdout)
    fresh = json.load(open(manifest))
    for name in assets:
        old["assets"][name] = fresh["assets"][name]
    old["glb_bytes"] = total
    json.dump(old, open(manifest, "w"), indent=1)
    print(f"manifest {manifest}: {', '.join(f'{n} {old['assets'][n]['tris']} tris' for n in assets)}")
