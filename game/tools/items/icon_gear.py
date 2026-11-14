"""Stage the G1-23 loot gear (the rig meshes in tools/blender/build/wearables.blend) as icon models for render.py.

  blender -b --factory-startup --python tools/blender/build_wearables.py                      # writes wearables.blend
  blender -b tools/blender/build/wearables.blend --python-exit-code 1 --python tools/items/icon_gear.py
  blender -b spikes/items/gear_icons.blend --python-exit-code 1 --python tools/items/render.py -- --only <ids>
  python3 tools/items/compose.py

The icons show the very meshes the monkey wears, so an icon can never drift from the piece it stands for. Each
keeps its own baked colours (the "Col" attribute: palette region colour x AO) and its matte / gloss materials; this
script only tags it for render.py (kind, icon_rot, icon_fill), turns it to a good angle and records it in
spikes/items/stats.json. The suit icon is a kit model (models_wear.py), not one of these.
"""
import json
import os

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
# id -> (name, icon_rot in degrees, icon_fill). Names mirror WEARABLES in src/game/actors/wearables.ts.
GEAR = {
    "pot_helmet": ("Cooking Pot", (-8, 0, -22), 0.86), "coconut_helmet": ("Coconut Helmet", (-6, 0, 20), 0.8), "warden_helmet": ("Warden's Riot Helmet", (-12, 0, -16), 0.82),
    "snorkel": ("Snorkel Mask", (0, 0, 12), 0.84),
    "leaf_vest": ("Banana-Leaf Vest", (0, 0, 10), 0.84), "life_jacket": ("Ferry Life Jacket", (0, 0, 10), 0.84), "peel_jacket": ("Peel Gang Padded Jacket", (0, 0, 10), 0.84),
    "bamboo_plate": ("Bamboo Plate Vest", (0, 0, 10), 0.84), "coconut_cuirass": ("Coconut Cuirass", (0, 0, 10), 0.84), "warden_vest": ("Warden's Kevlar", (0, 0, 10), 0.84),
    "sack": ("Loot Sack", (0, 0, 165), 0.84), "walkman": ("Walkman Headphones", (0, 0, 16), 0.86), "radio_headset": ("Radio Headset", (0, 0, 16), 0.86),
}
for o in list(bpy.context.scene.objects):
    if o.name not in GEAR:
        bpy.data.objects.remove(o, do_unlink=True)
sp = os.path.join(ROOT, "spikes", "items", "stats.json")
stats = json.load(open(sp)) if os.path.exists(sp) else {}
for ident, (name, rot, fill) in GEAR.items():
    ob = bpy.context.scene.objects[ident]
    ob.rotation_mode = "XYZ"
    ob["item_name"], ob["kind"], ob["icon_rot"], ob["icon_fill"] = name, "wearable", list(rot), fill
    d = ob.dimensions
    stats[ident] = {"name": name, "kind": "wearable", "tris": sum(len(p.vertices) - 2 for p in ob.data.polygons), "materials": len(ob.data.materials),
                    "dims_m": [round(v, 3) for v in d]}
    print("@@ staged %-16s %5d tris" % (ident, stats[ident]["tris"]))
os.makedirs(os.path.dirname(sp), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, "spikes", "items", "gear_icons.blend"))
json.dump(stats, open(sp, "w"), indent=1)
