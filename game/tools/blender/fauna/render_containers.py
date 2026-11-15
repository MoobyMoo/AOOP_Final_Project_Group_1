"""Review shots of the G2 containers: each one closed and open, at the raid camera and at a low 3/4, plus a line-up
with the monkey for scale.

  blender -b tools/blender/build/blend/containers.blend --python-exit-code 1 -P tools/blender/fauna/render_containers.py -- <out dir> [tile px] [name,name]
"""
import math
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import shots  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = argv[0] if argv else "/tmp/bv_fauna/cont"
PX = int(argv[1]) if len(argv) > 1 else 520
NAMES = argv[2].split(",") if len(argv) > 2 else ["cont_lunchbox", "cont_toolbox", "cont_medcabinet", "cont_safe", "cont_trash", "cont_sack"]
LID_OPEN = -1.9                                            # kit_build.ts CRATE_LID_OPEN
roots = {o.name: o for o in bpy.data.objects if o.parent is None and o.get("asset")}


def show(only):
    for n, r in roots.items():
        for o in [r] + list(r.children_recursive):
            o.hide_render = n not in only


def lid(name, k):
    for o in roots[name].children_recursive:
        if o.get("part") == "lid":
            o.rotation_euler.x = LID_OPEN * k


shots.stage(res=(PX, PX))
for n in NAMES:
    show([n])
    r = roots[n]
    zc = 1.2 if r.get("wallMount") else 0.45
    for state, k in (("closed", 0), ("open", 1)):
        lid(n, k)
        shots.aim("raid", (0, 0.1 if k else 0, zc), 8.6)
        shots.shoot(os.path.join(OUT, f"{n}_{state}_raid.png"))
        shots.aim("q34", (0, 0, zc), 6.4)
        shots.shoot(os.path.join(OUT, f"{n}_{state}_q34.png"))
    lid(n, 0)
# line-up with the monkey: the row runs along the screen (screen-right is (0.866, -0.5) on the ground)
show(NAMES)
for i, n in enumerate(NAMES):
    gx = (i - (len(NAMES) - 2) / 2) * 2.0
    roots[n].location = (gx * 0.866, -gx * 0.5, 0)
    roots[n].rotation_euler.z = math.radians(-30)           # front to the camera
rig = shots.monkey(os.path.join(HERE, "..", "build", "monkey.blend"), (-6.2 * 0.866, 6.2 * 0.5, 0), math.radians(-30))
bpy.context.scene.frame_set(0)
bpy.context.scene.render.resolution_x, bpy.context.scene.render.resolution_y = PX * 4, int(PX * 1.1)
shots.aim("raid", (-0.75, 0.4, 0.75), 15)
shots.shoot(os.path.join(OUT, "lineup_raid.png"))
