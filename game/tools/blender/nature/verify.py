"""Bananaville nature kit: fresh-import check of the exported GLB packs (run after build.py).

  blender -b --factory-startup --python-exit-code 1 -P tools/blender/nature/verify.py

Imports every pack into an empty scene with Blender's own glTF importer and compares node count, triangles, the colour
attribute and the transforms with tools/blender/nature/manifest.json. Exits non-zero on any mismatch.
"""
import json
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
man = json.load(open(os.path.join(HERE, "manifest.json")))
bad = []
for pack, info in man["packs"].items():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, info["file"]))
    obs = [o for o in bpy.data.objects if o.type == "MESH"]
    tris = sum(len(o.data.loop_triangles) or (o.data.calc_loop_triangles() or len(o.data.loop_triangles)) for o in obs)
    nocol = [o.name for o in obs if not o.data.color_attributes]
    moved = [o.name for o in obs if any(abs(s - 1) > 1e-5 for s in o.scale) or o.location.length > 1e-5]
    uv = sorted(o.name for o in obs if o.data.uv_layers)
    ok = len(obs) == info["nodes"] and tris == info["tris"] and not nocol and not moved
    print(f"[verify] {pack}: {len(obs)}/{info['nodes']} nodes, {tris}/{info['tris']} tris, colour missing {len(nocol)}, transformed {len(moved)}, uv on {uv} -> {'ok' if ok else 'MISMATCH'}", flush=True)
    if not ok:
        bad.append(pack)
if bad:
    sys.exit(1)
