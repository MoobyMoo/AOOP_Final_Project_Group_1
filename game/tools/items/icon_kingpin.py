"""Stage the Kingpin .45 (public/models/kingpin45.glb) as an icon model for render.py.

  blender -b --factory-startup --python-exit-code 1 --python tools/items/icon_kingpin.py
  blender -b spikes/items/kingpin_icon.blend --python-exit-code 1 --python tools/items/render.py -- --only kingpin
  python3 tools/items/compose.py --only kingpin

Joins the gun's meshes into one object named "kingpin" (kind=weapon) lying in profile, muzzle to screen-right, standard mag.
"""
import json
import os

import math

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, "public", "models", "kingpin45.glb"))
muzzle = bpy.context.scene.objects["muzzle"].matrix_world.translation.copy()
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH" and o.name != "mag_ext"]   # the standard mag
for o in bpy.context.scene.objects:
    o.select_set(o in meshes)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
bpy.ops.object.join()
gun = bpy.context.view_layer.objects.active
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in list(bpy.context.scene.objects):
    if o is not gun:
        bpy.data.objects.remove(o, do_unlink=True)
gun.name = "kingpin"
gun.rotation_mode = "XYZ"   # the glTF importer leaves QUATERNION mode, so render.py's rotation_euler would be ignored
d = gun.dimensions
gun["kind"] = "weapon"
c = sum((v.co for v in gun.data.vertices), muzzle * 0) / len(gun.data.vertices)
# turn the muzzle to screen-right: render.py's camera right vector sits 35 deg around z from +x (CAM_AZ)
gun["icon_rot"] = (0, 0, round(35 - math.degrees(math.atan2(muzzle.y - c.y, muzzle.x - c.x)), 1))
gun["icon_fill"] = 0.86
print("@@ kingpin dims", tuple(round(v, 3) for v in d), "rot", tuple(gun["icon_rot"]))
out = os.path.join(ROOT, "spikes", "items")
os.makedirs(out, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, "kingpin_icon.blend"))
sp = os.path.join(out, "stats.json")
stats = json.load(open(sp)) if os.path.exists(sp) else {}
stats["kingpin"] = {"name": "Kingpin .45", "kind": "weapon", "tris": sum(len(p.vertices) - 2 for p in gun.data.polygons), "materials": len(gun.data.materials), "dims_m": [round(v, 3) for v in d]}
json.dump(stats, open(sp, "w"), indent=1)
