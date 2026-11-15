"""Bananaville nature kit: Eevee review renders, one row of variants per piece type.

  blender -b spikes/nature/nature_kit.blend --python-exit-code 1 -P tools/blender/nature/render.py -- [--types palm,tree] [--views game,low] [--out spikes/nature/blender]

"game" = the gameplay camera direction (pitch 55, yaw -30) with the game's sun (elevation 50, azimuth 160);
"low" = a lower three-quarter view with a front-left key light, to judge forms. A 1.7 u dummy stands at the left for scale. Nothing is saved back.
"""
import argparse
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
GROUND = {"default": (0.235, 0.38, 0.075), "sand": (0.83, 0.65, 0.33), "cave": (0.16, 0.13, 0.1), "water": (0.07, 0.3, 0.4)}
GROUND_OF = {"palmlean": "sand", "driftwood": "sand", "shells": "sand", "beachgrass": "sand", "caverock": "cave", "stalagmite": "cave", "mushroom": "cave",
             "crystal": "cave", "roots": "cave", "lily": "water", "reeds": "water", "mangrove": "water", "cliff": "water"}


def lin_mat(name, rgb, rough=0.95):
    m = bpy.data.materials.new(name)
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    return m


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--types", default="")
    ap.add_argument("--views", default="game,low")
    ap.add_argument("--out", default=os.path.join(ROOT, "spikes", "nature", "blender"))
    ap.add_argument("--res", default="1600x800")
    a = ap.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    sc = bpy.context.scene
    os.makedirs(a.out, exist_ok=True)
    types = {}
    for ob in bpy.data.objects:
        if ob.type == "MESH" and "type" in ob:
            types.setdefault(ob["type"], {}).setdefault(int(ob["variant"]), []).append(ob)
    want = [t for t in a.types.split(",") if t] or list(types)
    if "falls" in want or not a.types:
        want = [t for t in want if t not in ("cliff", "water", "foam", "falls")] + ["falls"]
        types["falls"] = {0: [o for t in ("cliff", "water", "foam") for o in types.get(t, {}).get(0, [])]}
    # world + sun (the game's sun: elevation 50, azimuth 160 in three's spherical convention)
    w = bpy.data.worlds.new("W")
    sc.world = w
    bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.4, 0.55, 1.0, 1)
    bg.inputs["Strength"].default_value = 0.55
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    sun.data.energy = 4.2
    sun.data.color = (1.0, 0.86, 0.66)
    sun.data.angle = math.radians(3)
    sc.collection.objects.link(sun)
    sun.rotation_euler = Vector((0.22, 0.604, 0.766)).to_track_quat("Z", "Y").to_euler()
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.data.sensor_fit = "HORIZONTAL"
    cam.data.angle = math.radians(30)
    cam.data.clip_end = 500
    gm = bpy.data.meshes.new("Ground")
    gm.from_pydata([(-200, -200, 0), (200, -200, 0), (200, 200, 0), (-200, 200, 0)], [], [(0, 1, 2, 3)])
    ground = bpy.data.objects.new("Ground", gm)
    sc.collection.objects.link(ground)
    gmats = {k: lin_mat("G_" + k, v) for k, v in GROUND.items()}
    gm.materials.append(gmats["default"])
    # scale dummy
    bpy.ops.mesh.primitive_cylinder_add(radius=0.3, depth=1.7, location=(0, 0, 0.85), vertices=16)
    dummy = bpy.context.active_object
    dummy.data.materials.append(lin_mat("Dummy", (0.05, 0.12, 0.45), 0.6))
    r = sc.render
    r.engine = "BLENDER_EEVEE"
    r.resolution_x, r.resolution_y = (int(x) for x in a.res.split("x"))
    r.resolution_percentage = 100
    r.image_settings.file_format = "PNG"
    try:
        sc.view_settings.view_transform = "Standard"
    except TypeError:
        pass
    sc.view_settings.look = "None"
    try:
        sc.eevee.use_shadows = True
        sc.eevee.use_gtao = False
    except AttributeError:
        pass
    all_obs = [o for o in bpy.data.objects if o.type == "MESH" and "type" in o]
    for t in want:
        if t not in types:
            continue
        for o in all_obs:
            o.hide_render = True
        x, xs = 0.0, []
        for v in sorted(types[t]):
            obs = types[t][v]
            lo = [min((o.matrix_world @ Vector(c))[i] for o in obs for c in o.bound_box) for i in range(3)]
            hi = [max((o.matrix_world @ Vector(c))[i] for o in obs for c in o.bound_box) for i in range(3)]
            wdt = max(hi[0] - lo[0], 0.6)
            cx = x + wdt / 2
            for o in obs:
                o.hide_render = False
                o.location = (cx - (lo[0] + hi[0]) / 2 + o.location.x, 0, 0)
            xs.append((cx, hi[2], max(hi[1] - lo[1], wdt)))
            x += wdt + max(0.5, wdt * 0.2)
        W, H = x, max(h for _, h, _ in xs)
        dummy.location = (-0.9, 0, 0.85)
        ground.location.z = {"lily": 0.04, "falls": -0.15}.get(t, 0.04 if t not in ("caster",) else -8)
        gm.materials[0] = gmats[GROUND_OF.get("cliff" if t == "falls" else t, "default")]
        bpy.context.view_layer.update()
        centre = Vector(((W - 1.2) / 2, 0, H * 0.42))
        for view in a.views.split(","):
            d = Vector((-0.287, -0.497, 0.819)) if view == "game" else Vector((-0.42, -0.84, 0.34))
            # game view: the game's back-lit sun; low view: a front-left key so the forms read
            sun.rotation_euler = (Vector((0.22, 0.604, 0.766)) if view == "game" else Vector((-0.55, -0.45, 0.7))).to_track_quat("Z", "Y").to_euler()
            span = max(W + 1.6, H * (2.6 if view == "low" else 2.2))
            dist = span / 2 / math.tan(cam.data.angle / 2) * 1.02
            cam.location = centre + d.normalized() * dist
            cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
            r.filepath = os.path.join(a.out, f"{t}_{view}.png")
            bpy.ops.render.render(write_still=True)
            print("[render]", r.filepath, flush=True)
        for v in types[t]:
            for o in types[t][v]:
                o.location = (0, 0, 0)


main()
