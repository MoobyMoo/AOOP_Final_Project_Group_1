"""Stage the kit guns (public/models/guns/<gunId>.glb) as icon models for render.py.

  blender -b --factory-startup --python-exit-code 1 --python tools/items/icon_guns.py [-- --only id,id]
  blender -b spikes/items/gun_icons.blend --python-exit-code 1 --python tools/items/render.py -- --only id,id
  python3 tools/items/compose.py --only id,id

One object per gun in tools/blender/guns/manifest.json, named by its gunId (kind=weapon), every node joined as it
ships: the magazine in, a built-in scope on, a bipod folded. Each lies in profile with its muzzle to screen-right, as
the Kingpin's icon does. --only restages just those guns and keeps the others already in gun_icons.blend.
"""
import json
import math
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
MANIFEST = json.load(open(os.path.join(ROOT, "tools", "blender", "guns", "manifest.json")))
ONLY = [i for i in (argv[argv.index("--only") + 1].split(",") if "--only" in argv else []) if i] or list(MANIFEST)
OUT = os.path.join(ROOT, "spikes", "items")
BLEND = os.path.join(OUT, "gun_icons.blend")

if os.path.exists(BLEND) and len(ONLY) < len(MANIFEST):
    bpy.ops.wm.open_mainfile(filepath=BLEND)
    for name in ONLY:
        if name in bpy.data.objects:
            bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
sp = os.path.join(OUT, "stats.json")
stats = json.load(open(sp)) if os.path.exists(sp) else {}
for gid in ONLY:
    before = set(scene.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, "public", "models", "guns", gid + ".glb"))
    new = [o for o in scene.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH"]
    empties = [o.name for o in new if o.type != "MESH"]          # by name: join() frees the meshes it merges
    for o in scene.objects:
        o.select_set(o in meshes)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    bpy.ops.object.join()
    gun = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for name in empties:
        bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)
    gun.name = gid
    gun.rotation_mode = "XYZ"   # the glTF importer leaves QUATERNION mode, so render.py's rotation_euler would be ignored
    for k in list(gun.keys()):
        del gun[k]
    # the glTF importer lands the bore on Blender's -Y; render.py's camera right vector sits 35 degrees round z from +x
    gun["kind"], gun["icon_rot"], gun["icon_fill"] = "weapon", (0, 0, 35 - math.degrees(math.atan2(-1, 0))), 0.94
    stats[gid] = {"name": MANIFEST[gid]["name"], "kind": "weapon", "tris": sum(len(p.vertices) - 2 for p in gun.data.polygons), "materials": len(gun.data.materials),
                  "dims_m": [round(v, 3) for v in gun.dimensions]}
    print("@@ staged %-20s %5d tris  %s" % (gid, stats[gid]["tris"], stats[gid]["dims_m"]))
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=BLEND)
json.dump(stats, open(sp, "w"), indent=1)
