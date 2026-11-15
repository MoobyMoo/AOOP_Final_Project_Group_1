"""Stage the Kingpin's attachments (public/models/attachments.glb) as icon models for render.py.

  blender -b --factory-startup --python-exit-code 1 --python tools/items/icon_attachments.py
  blender -b spikes/items/attachment_icons.blend --python-exit-code 1 --python tools/items/render.py
  python3 tools/items/compose.py

One object per attachment, named by its id (the node name in the GLB), with the materials it ships with. Each is
turned so its bore runs to screen-right and a little toward the camera, which shows the lens, bore or emitter and one
flank. att_mag_ext is staged on the Kingpin's standard magazine (from kingpin45.glb, through socket_mag): on its own
the extension is a sleeve and a baseplate, and the icon has to read as a long magazine.
"""
import json
import os

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
MODELS = os.path.join(ROOT, "public", "models")
# id: (name, icon_rot z in degrees, icon_fill). The glTF importer lands the bore on Blender's -Y; render.py's camera
# sits 35 degrees round z from the front, so 80 puts the bore 45 degrees between screen-right and the camera.
ICONS = {
    "att_sight_holo": ("Reflex Sight", 62, 0.80),
    "att_sight_2x": ("2x Scope", 80, 0.88),
    "att_muzzle_comp": ("Compensator", 72, 0.78),
    "att_muzzle_supp": ("Suppressor", 84, 0.88),
    "att_mag_ext": ("Extended Magazine", 104, 0.86),
    "att_laser": ("Laser Module", 66, 0.80),
}

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS, "attachments.glb"))
bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS, "kingpin45.glb"))
O = scene.objects
missing = [i for i in ICONS if i not in O or O[i].type != "MESH"]
if missing:
    raise SystemExit(f"attachments.glb: no mesh node {missing}")


def flatten(obs):
    """join the objects into the first one, with their world transforms applied"""
    for o in O:
        o.select_set(o in obs)
    bpy.context.view_layer.objects.active = obs[0]
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    if len(obs) > 1:
        bpy.ops.object.join()
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return obs[0]


ext = O["att_mag_ext"]
ext.matrix_world = O["socket_mag"].matrix_world.copy()       # fitted: an identity transform on the socket
bpy.context.view_layer.update()
flatten([ext, O["mag"]])

sp = os.path.join(ROOT, "spikes", "items", "stats.json")
stats = json.load(open(sp)) if os.path.exists(sp) else {}
keep = []
for ident, (name, rz, fill) in ICONS.items():
    ob = flatten([O[ident]])
    ob.name = ident
    ob.rotation_mode = "XYZ"    # the glTF importer leaves QUATERNION mode, so render.py's rotation_euler would be ignored
    for k in [k for k in ob.keys() if k not in ("kind",)]:
        del ob[k]
    ob["item_name"], ob["kind"], ob["icon_rot"], ob["icon_fill"] = name, "attachment", (0, 0, rz), fill
    keep.append(ob)
    stats[ident] = {"name": name, "kind": "attachment", "tris": sum(len(p.vertices) - 2 for p in ob.data.polygons), "materials": len(ob.data.materials),
                    "dims_m": [round(v, 3) for v in ob.dimensions]}
    print("@@ staged %-16s %5d tris  %s" % (ident, stats[ident]["tris"], stats[ident]["dims_m"]))
for o in list(O):
    if o not in keep:
        bpy.data.objects.remove(o, do_unlink=True)
out = os.path.join(ROOT, "spikes", "items")
os.makedirs(out, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, "attachment_icons.blend"))
json.dump(stats, open(sp, "w"), indent=1)
