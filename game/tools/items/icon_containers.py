"""Stage the typed loot containers (tools/blender/build/blend/containers.blend) as icon models for render.py.

  tools/blender/build/build_all.sh containers                                                  # writes containers.blend
  blender -b tools/blender/build/blend/containers.blend --python-exit-code 1 --python tools/items/icon_containers.py
  blender -b spikes/items/container_icons.blend --python-exit-code 1 --python tools/items/render.py
  python3 tools/items/compose.py
  (add `-- --only cont_safe,...` to render.py and `--only cont_safe,...` to compose.py to redo some of them)

Each container's meshes (the body and its closed lid) are joined into one object named after the asset, with the
colours it ships with (the "Col" attribute: albedo x baked AO). The icons are for the looting screen and the map
legend: a container is not an inventory item.
"""
import json
import os

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
NAMES = {"cont_weapon": ("Weapon Crate", (0, 0, 0), 0.88), "cont_food": ("Food Basket", (0, 0, 20), 0.84), "cont_ammo": ("Ammo Tin", (0, 0, 0), 0.84),
         "cont_parts": ("Parts Bin", (0, 0, 0), 0.86), "cont_medical": ("Medical Case", (0, 0, 0), 0.84),
         # G2: lunchbox, toolbox, wall medicine cabinet, safe, junk heap, supply sack
         "cont_lunchbox": ("Lunchbox", (0, 0, 0), 0.82), "cont_toolbox": ("Toolbox", (0, 0, 0), 0.86), "cont_medcabinet": ("Medicine Cabinet", (0, 0, 0), 0.82),
         "cont_safe": ("Safe", (0, 0, 0), 0.84), "cont_trash": ("Junk Heap", (0, 0, 0), 0.88), "cont_sack": ("Supply Sack", (0, 0, 0), 0.84),
         "cont_jacket": ("Hanging Jacket", (0, 0, 0), 0.86)}
sp = os.path.join(ROOT, "spikes", "items", "stats.json")
stats = json.load(open(sp)) if os.path.exists(sp) else {}
scene = bpy.context.scene
keep = []
for ident, (name, rot, fill) in NAMES.items():
    root = scene.objects[ident]
    meshes = [c for c in root.children_recursive if c.type == "MESH"]
    for o in scene.objects:
        o.select_set(o in meshes)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    root.name = ident + "_root"
    ob.name = ident
    ob.rotation_mode = "XYZ"
    ob["item_name"], ob["kind"], ob["icon_rot"], ob["icon_fill"] = name, "container", list(rot), fill
    keep.append(ob)
    stats[ident] = {"name": name, "kind": "container", "tris": sum(len(p.vertices) - 2 for p in ob.data.polygons), "materials": len(ob.data.materials),
                    "dims_m": [round(v, 3) for v in ob.dimensions]}
    print("@@ staged %-13s %5d tris" % (ident, stats[ident]["tris"]))
for o in list(scene.objects):
    if o not in keep:
        bpy.data.objects.remove(o, do_unlink=True)
os.makedirs(os.path.dirname(sp), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, "spikes", "items", "container_icons.blend"))
json.dump(stats, open(sp, "w"), indent=1)
