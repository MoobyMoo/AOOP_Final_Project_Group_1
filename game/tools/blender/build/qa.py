"""QA gate (blender-asset-qa skill): run qa_check on every asset of a built group.
  blender -b tools/blender/build/blend/<group>.blend --python tools/blender/build/qa.py
Profile "game". Tuning, per the skill's notes for chunky kitbash: --tol 0.02 (painted decals sit 6-14 mm proud of
their surface, on purpose, so they never z-fight) and uv checks off (this kit has no UVs: vertex colours only)."""
import sys, os, json
SK = os.path.expanduser("~/.agents/skills/blender-asset-qa/scripts")
sys.path.insert(0, SK)
import bpy
import qa_check

TOL = 0.02
DEBUG = os.environ.get("QA_DEBUG") == "1"


def zf_samples(names, eps=0.001, limit=6):
    """where the coplanar overlaps are (same test as qa_check, but reporting positions)"""
    import bmesh
    from mathutils.bvhtree import BVHTree
    verts, tris, nrm = [], [], []
    for n in names:
        ob = bpy.data.objects[n]
        bm = bmesh.new(); bm.from_mesh(ob.data); bm.transform(ob.matrix_world); bmesh.ops.triangulate(bm, faces=bm.faces[:])
        b = len(verts); verts += [v.co.copy() for v in bm.verts]
        for f in bm.faces:
            tris.append(tuple(b + v.index for v in f.verts)); nrm.append(f.normal.copy())
        bm.free()
    bvh = BVHTree.FromPolygons(verts, tris, epsilon=0.0)
    out = []
    for ti, t in enumerate(tris):
        a, b, c = (verts[i] for i in t)
        cen = (a + b + c) / 3
        hit = False
        for p in (cen, cen.lerp(a, .6), cen.lerp(b, .6), cen.lerp(c, .6)):
            for _, _, tj, _ in bvh.find_nearest_range(p, eps):
                if tj is None or tj == ti or set(t) & set(tris[tj]) or nrm[ti].dot(nrm[tj]) < 0.999:
                    continue
                a2 = verts[tris[tj][0]]
                q = p - nrm[tj] * nrm[tj].dot(p - a2)
                if qa_check._point_in_tri(q, *(verts[i] for i in tris[tj]), nrm[tj]):
                    pp = tuple(round(x, 2) for x in p)
                    if all(sum((pp[k] - o[0][k]) ** 2 for k in range(3)) > 0.02 for o in out):
                        out.append((pp, "n=" + ",".join(f"{x:.1f}" for x in nrm[ti])))
                    hit = True
                    break
            if hit:
                break
        if len(out) >= limit:
            break
    return out


group = os.path.splitext(os.path.basename(bpy.data.filepath))[0]
out = {"group": group, "assets": {}}
fails = 0
roots = sorted((o for o in bpy.data.objects if o.type == "EMPTY" and "asset" in o), key=lambda o: o.name)
meshes = lambda root: [c.name for c in root.children_recursive if c.type == "MESH"]
jobs = [(r.name, meshes(r)) for r in roots]
if group == "bunker":
    # The bunker is ONE composite asset authored in room space: furniture rests on the room's floor and hangs on its
    # walls, so the set is checked together, and each upgrade fixture is checked together with the set.
    base = [n for r in roots if "_fx_" not in r.name for n in meshes(r)]
    jobs = [("bunker_set", base)] + [(r.name + "+set", base + meshes(r)) for r in roots if "_fx_" in r.name]
for name, names in jobs:
    root = type("R", (), {"name": name})
    if not names:
        continue
    r = qa_check.run(objects=names, profile="game", eps=0.001, tol=TOL, uv=False)
    if DEBUG and r["zfighting"]:
        print(f"[qa]   z-fight samples in {root.name}: {zf_samples(names)}")
    tris = sum(m["tris"] for m in r["objects"].values())
    out["assets"][root.name] = {"pass": r["pass"], "tris": tris, "errors": r["errors"], "warnings": r["warnings"], "ground_z": r["ground_z"]}
    if not r["pass"]:
        fails += 1
        print(f"[qa] FAIL {root.name}: " + " | ".join(r["errors"][:int(os.environ.get("QA_MAX", "6"))]))
dst = os.path.join(os.path.dirname(os.path.abspath(__file__)), "qa")
os.makedirs(dst, exist_ok=True)
json.dump(out, open(os.path.join(dst, group + ".json"), "w"), indent=1)
print(f"[qa] {group}: {len(out['assets']) - fails}/{len(out['assets'])} pass")
