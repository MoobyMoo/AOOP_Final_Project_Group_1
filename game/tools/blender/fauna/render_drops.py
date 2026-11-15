"""Review shots of the animal drops (meat, hide: the item GLB models at the size the ground shows them) and of the
hanging jacket (cont_jacket, on a stand-in wall, closed and open), with the monkey for scale.

  blender -b tools/blender/build/blend/containers.blend --python-exit-code 1 -P tools/blender/fauna/render_drops.py -- <out dir> [tile px]

Needs spikes/items/items_preview.blend (tools/items/build.py -- --only meat,hide) or items.blend, and build/monkey.blend.
"""
import json
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, HERE)
import shots  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = argv[0] if argv else "/tmp/bv_fauna/drops"
PX = int(argv[1]) if len(argv) > 1 else 480
W, H = PX, int(PX * 0.86)
LID_OPEN = -1.9
MIN_SIDE, MAX_SIDE, MAX_SCALE, MIN_SCALE = 0.42, 0.78, 3.2, 1.25          # loot/ground.ts: how big a pickup is drawn

sc = bpy.context.scene
roots = {o.name: o for o in bpy.data.objects if o.parent is None and o.get("asset")}
for r in roots.values():
    for o in [r] + list(r.children_recursive):
        o.hide_render = True
lib = next(p for p in (os.path.join(ROOT, "spikes", "items", n) for n in ("items_preview.blend", "items.blend")) if os.path.exists(p))
items = shots.append_objects(lib, ["meat", "hide"])
for ob in items.values():
    ob.hide_render = True
rig = shots.monkey(os.path.join(HERE, "..", "build", "monkey.blend"))
mk = [o for o in bpy.data.objects if o.parent is rig or o is rig]
sc.frame_set(0)


def box(name, x0, x1, y0, y1, z0, z1, col):
    me = bpy.data.meshes.new(name)
    v = [(x, y, z) for z in (z0, z1) for y in (y0, y1) for x in (x0, x1)]
    me.from_pydata(v, [], [(0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)])
    m = bpy.data.materials.new(name)
    bs = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bs.inputs["Base Color"].default_value = (*shots._lin(col), 1)
    bs.inputs["Roughness"].default_value = 0.9
    me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    sc.collection.objects.link(ob)
    return ob


wall = box("shot_wall", -1.5, 1.5, 0.0, 0.14, 0.0, 2.2, (0.62, 0.47, 0.31))
shots.stage(res=(W, H))
meta = {"px_per_m": {}, "scale": {}}


def shoot(name, view, focus, dist):
    shots.aim(view, focus, dist)
    shots.shoot(os.path.join(OUT, name + ".png"))
    meta["px_per_m"][name] = H / (2 * dist * math.tan(sc.camera.data.angle_y / 2))


def monkey(on, at=(30, 30, 0)):
    for o in mk:
        o.hide_render = (not on) or o is rig
    rig.location = at


# ---- the jacket on its wall
jk = roots["cont_jacket"]
for o in [jk] + list(jk.children_recursive):
    o.hide_render = False
lid = next(o for o in jk.children_recursive if o.get("part") == "lid")
for state, k in (("closed", 0), ("open", 1)):
    lid.rotation_euler.x = LID_OPEN * k
    monkey(False)
    shoot(f"cont_jacket_{state}_raid", "raid", (0, -0.2, 1.25), 6.6)
    shoot(f"cont_jacket_{state}_q34", "q34", (0, -0.2, 1.2), 4.9)
lid.rotation_euler.x = 0
monkey(True, (1.15, -0.75, 0))
rig.rotation_euler = (0, 0, math.radians(25))
shoot("cont_jacket_scale_raid", "raid", (0.3, -0.4, 1.0), 10.5)
shoot("cont_jacket_scale_q34", "q34", (0.3, -0.4, 1.0), 7.6)
rig.rotation_euler = (0, 0, 0)
for o in [jk] + list(jk.children_recursive) + [wall]:
    o.hide_render = True

# ---- the drops, at the size ground.ts draws a pickup
for name, ob in items.items():
    side = max(ob.dimensions.x, ob.dimensions.y)
    k = min(MAX_SCALE, MAX_SIDE / side, max(MIN_SCALE, MIN_SIDE / side))
    meta["scale"][name] = round(k, 3)
    ob.scale = (k, k, k)
    ob.hide_render = False
    ob.location = (0, 0, 0)
    monkey(False)
    shoot(f"{name}_raid", "raid", (0, 0, 0.1), 3.4)
    shoot(f"{name}_q34", "q34", (0, 0, 0.1), 2.3)
    ob.location = (-0.55, 0, 0)
    monkey(True, (0.55, 0.04, 0))
    shoot(f"{name}_scale_raid", "raid", (0, 0, 0.8), 12.0)
    shoot(f"{name}_scale_q34", "q34", (0, 0, 0.8), 8.6)
    ob.hide_render = True
json.dump(meta, open(os.path.join(OUT, "shots.json"), "w"), indent=1)
