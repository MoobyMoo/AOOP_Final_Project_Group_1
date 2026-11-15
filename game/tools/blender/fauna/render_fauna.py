"""Review shots of the wildlife: every animal in its key poses, at the raid camera and at a low 3/4, the first shot of
each row with the businessman monkey beside it for scale. Also one strip of six frames per clip.

  blender -b tools/blender/build/fauna.blend --python-exit-code 1 -P tools/blender/fauna/render_fauna.py -- <out dir> [tile px]

Writes <out>/<id>_<view>_<n>.png, <out>/clip_<id>_<clip>_<n>.png and <out>/shots.json (labels, pixels per metre).
"""
import json
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import shots  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = argv[0] if argv else "/tmp/bv_fauna/shots"
PX = int(argv[1]) if len(argv) > 1 else 480
W, H = PX, int(PX * 0.82)
# (clip, fraction of the clip, label); the first entry is the scale shot with the monkey
POSES = {
    "crab": [("idle", 0.0, "idle"), ("idle", 0.25, "idle: claws snap"), ("scuttle", 0.25, "scuttle (travels to its left)"), ("flee", 0.3, "flee"), ("burrow", 0.42, "burrow"), ("burrow", 0.7, "burrow: eyes only")],
    "parrot": [("perch_idle", 0.0, "perch_idle"), ("perch_idle", 0.36, "perch_idle: head cock"), ("takeoff", 0.5, "takeoff"), ("fly", 0.25, "fly: upstroke"), ("fly", 0.75, "fly: downstroke"), ("land", 0.3, "land: flare")],
    "frog": [("idle", 0.0, "idle"), ("idle", 0.14, "idle: croak"), ("hop", 0.13, "hop: crouch"), ("hop", 0.36, "hop: launch"), ("hop", 0.52, "hop: apex"), ("hop", 0.8, "hop: landing")],
    "boar": [("idle", 0.0, "idle"), ("walk", 0.2, "walk"), ("run", 0.3, "run"), ("charge_windup", 0.2, "charge_windup: pawing"), ("charge", 0.3, "charge"), ("hit", 0.3, "hit"), ("death", 1.0, "death")],
    "croc": [("bite", 0.0, "surfaced (bind pose)"), ("lurk", 0.0, "lurk"), ("surface", 0.55, "surface"), ("bite", 0.3, "bite: gape"), ("bite", 0.47, "bite: snap"), ("swim", 0.25, "swim"), ("retreat", 0.55, "retreat"), ("death", 1.0, "death")],
}
# framing: (focus height, distance raid, distance 3/4) for the close shots, and for the scale shot
FRAME = {"crab": (0.25, 5.2, 3.6), "parrot": (0.4, 7.0, 4.8), "frog": (0.3, 4.6, 3.2), "boar": (0.7, 11.0, 7.6), "croc": (0.0, 14.0, 9.4)}
SCALE = {"crab": (0.8, 12.0, 8.6), "parrot": (0.9, 13.0, 9.0), "frog": (0.8, 12.0, 8.6), "boar": (0.9, 15.0, 10.5), "croc": (0.6, 19.0, 13.0)}
SEP = {"crab": 1.3, "parrot": 1.3, "frog": 1.2, "boar": 2.3, "croc": 3.4}      # monkey to animal, along x: clear of each other from both cameras
PERCH = 1.0                                                         # the parrot's post

sc = bpy.context.scene
arms = {o["fauna"]: o for o in bpy.data.objects if o.type == "ARMATURE" and "fauna" in o}
meshes = {k: bpy.data.objects[k + "_mesh"] for k in arms}
for a in arms.values():
    a.hide_render = True
rig = shots.monkey(os.path.join(HERE, "..", "build", "monkey.blend"))
mk = [o for o in bpy.data.objects if o.parent is rig or o is rig]


def prop(name, verts, faces, col):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    m = bpy.data.materials.new(name)
    bs = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bs.inputs["Base Color"].default_value = (*shots._lin(col), 1)
    bs.inputs["Roughness"].default_value = 0.9
    me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    sc.collection.objects.link(ob)
    return ob


def box(name, x0, x1, y0, y1, z0, z1, col):
    v = [(x, y, z) for z in (z0, z1) for y in (y0, y1) for x in (x0, x1)]
    return prop(name, v, [(0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)], col)


post = box("shot_post", -0.09, 0.09, -0.09, 0.09, 0, PERCH, (0.48, 0.33, 0.2))
bank = box("shot_bank", -1.0, 1.0, -1.0, 1.0, -1.2, 0.0, shots.SAND)


def play(ident, clip, frac):
    arm = arms[ident]
    for tr in arm.animation_data.nla_tracks:
        tr.mute = tr.name != f"{ident}_{clip}"
    act = bpy.data.actions[f"{ident}_{clip}"]
    f0, f1 = act.frame_range
    sc.frame_set(int(round(f0 + (f1 - f0) * frac)))


meta = {"px_per_m": {}, "labels": {}, "poses": {k: len(v) for k, v in POSES.items()}, "clips": {}}
for ident, poses in POSES.items():
    for k, m in meshes.items():
        m.hide_render = k != ident
    arm = arms[ident]
    wet = ident == "croc"
    shots.stage(res=(W, H), water=1.2 if wet else None)
    post.hide_render = ident != "parrot"
    bank.hide_render = not wet
    for i, (clip, frac, label) in enumerate(poses):
        play(ident, clip, frac)
        scale = i == 0
        for o in mk:
            o.hide_render = (not scale) or o is rig
        fly = ident == "parrot" and clip in ("fly", "takeoff", "land")
        lift = (PERCH + (0.5 if clip == "fly" else 0.25 if fly else 0.0)) if ident == "parrot" else 0.0
        side = SEP[ident] / 2
        arm.location = (Vector((-side, 0, 0)) if scale else Vector()) + Vector((0, 0, lift))
        post.location = (arm.location.x, arm.location.y, 0)
        rig.location = Vector((side, 0.07 * side, 0)) if scale else Vector((30, 30, 0))
        bank.location = rig.location
        rig.rotation_euler = (0, 0, 0)
        zf, dr, dq = SCALE[ident] if scale else FRAME[ident]
        focus = (0, 0, zf + (lift if not scale else 0))
        for view, dist in (("raid", dr), ("q34", dq)):
            shots.aim(view, focus, dist)
            name = f"{ident}_{view}_{i}"
            shots.shoot(os.path.join(OUT, name + ".png"))
            meta["px_per_m"][name] = H / (2 * dist * math.tan(sc.camera.data.angle_y / 2))
            meta["labels"][name] = label + (" + monkey (1.9 m)" if scale else "")
            meta.setdefault("scale", []).append(name) if scale else None
    # clip strips: six frames of every clip, 3/4 view, no monkey
    for o in mk:
        o.hide_render = True
    arm.location = (0, 0, PERCH if ident == "parrot" else 0)
    post.location = (0, 0, 0)
    sc.render.resolution_x, sc.render.resolution_y = int(W * 0.6), int(H * 0.6)
    zf, dr, dq = FRAME[ident]
    for tr in arm.animation_data.nla_tracks:
        clip = tr.name[len(ident) + 1:]
        act = bpy.data.actions[tr.name]
        loop = bool(arm["clips"][clip]["loop"])
        meta["clips"][tr.name] = {"seconds": arm["clips"][clip]["seconds"], "loop": loop}
        for n in range(6):
            play(ident, clip, n / 6 if loop else n / 5)
            shots.aim("q34", (0, 0, zf + (PERCH if ident == "parrot" else 0)), dq * (1.25 if ident in ("frog", "parrot") else 1.0))
            shots.shoot(os.path.join(OUT, f"clip_{tr.name}_{n}.png"))
    arm.location = (0, 0, 0)
json.dump(meta, open(os.path.join(OUT, "shots.json"), "w"), indent=1)
