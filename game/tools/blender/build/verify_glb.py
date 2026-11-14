"""Fresh-import check: load every exported GLB into an empty Blender and compare against the manifest.
  blender -b --factory-startup --python tools/blender/build/verify_glb.py"""
import bpy, json, os, sys
here = os.path.dirname(os.path.abspath(__file__))
man = json.load(open(os.path.join(here, "..", "..", "..", "public", "models", "build", "manifest.json")))
ok = True
for group, g in man["groups"].items():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)
    path = os.path.join(here, "..", "..", "..", "public", "models", "build", group + ".glb")
    bpy.ops.import_scene.gltf(filepath=path)
    roots = {o.name: o for o in bpy.data.objects if o.parent is None and "asset" in o}
    bad = []
    for name, a in g["assets"].items():
        r = roots.get(name)
        if r is None:
            bad.append(f"{name}: missing"); continue
        meshes = [c for c in r.children_recursive if c.type == "MESH"]
        tris = sum(sum(len(p.vertices) - 2 for p in m.data.polygons) for m in meshes)
        nocol = [m.name for m in meshes if not m.data.color_attributes]
        parts = {c.get("part") for c in r.children_recursive if c.get("kind") in ("part", "point")}
        want = set(a["parts"]) | set(a["points"])
        if tris != a["tris"]:
            bad.append(f"{name}: {tris} tris, manifest says {a['tris']}")
        if nocol:
            bad.append(f"{name}: no COLOR_0 on {nocol}")
        if not want <= parts:
            bad.append(f"{name}: missing nodes {sorted(want - parts)}")
    print(f"[verify] {group}: {len(g['assets'])} assets, {os.path.getsize(path) / 1024:.0f} KB, {'OK' if not bad else 'PROBLEMS'}")
    for b in bad:
        print("   ", b)
    ok = ok and not bad
sys.exit(0 if ok else 1)
