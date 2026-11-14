"""Fresh-import check of the exported GLBs (run after build.py).

  blender -b --factory-startup --python-exit-code 1 --python tools/items/check_glb.py

For every public/models/items/<id>.glb: imports it into an empty scene and checks one mesh object,
the triangle count against spikes/items/stats.json, COLOR_0 present, no UVs, materials named MAT_Item_*,
lowest point on y=0 (glTF is Y-up) and the size in metres.
"""
import json
import os
import struct
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
stats = json.load(open(os.path.join(ROOT, "spikes", "items", "stats.json")))
bad = []
for ident, st in stats.items():
    path = os.path.join(ROOT, "public", "models", "items", ident + ".glb")
    with open(path, "rb") as f:
        magic, _ver, _len = struct.unpack("<4sII", f.read(12))
        jlen, _jtype = struct.unpack("<I4s", f.read(8))
        gltf = json.loads(f.read(jlen))
    attrs = set()
    for mesh in gltf["meshes"]:
        for prim in mesh["primitives"]:
            attrs |= set(prim["attributes"])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    tris = sum(len(p.vertices) - 2 for o in meshes for p in o.data.polygons)
    mats = sorted({m.name.split(".")[0] for o in meshes for m in o.data.materials if m})
    zmin = min((o.matrix_world @ v.co).z for o in meshes for v in o.data.vertices)
    problems = []
    if magic != b"glTF":
        problems.append("not a GLB")
    if len(meshes) != 1:
        problems.append(f"{len(meshes)} mesh objects")
    if tris != st["tris"]:
        problems.append(f"tris {tris} != built {st['tris']}")
    if "COLOR_0" not in attrs:
        problems.append("no COLOR_0")
    if any(a.startswith("TEXCOORD") for a in attrs):
        problems.append("unexpected UVs")
    if not mats or any(not m.startswith("MAT_Item_") for m in mats):
        problems.append(f"materials {mats}")
    if abs(zmin) > 1e-3:
        problems.append(f"not grounded (min {zmin:.4f})")
    if gltf.get("images") or gltf.get("textures"):
        problems.append("embedded textures")
    print(f"@@ {'ok  ' if not problems else 'FAIL'} {ident:13s} {tris:5d} tris  {len(mats)} mats  {os.path.getsize(path) / 1024:6.1f} KB  {problems or ''}")
    if problems:
        bad.append(ident)
print(f"@@ GLB fresh-import: {len(stats) - len(bad)}/{len(stats)} ok")
if bad:
    sys.exit(1)
