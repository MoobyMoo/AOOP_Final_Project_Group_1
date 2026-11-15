"""Build the Bananaville wildlife: public/models/fauna.glb + tools/blender/build/fauna.blend + tools/blender/fauna/manifest.json.

  blender -b --factory-startup --python-exit-code 1 -P tools/blender/fauna/build_fauna.py [-- --only crab,frog] [--preview <dir>]

One rigged root per animal (`fauna_<id>`, an armature with one skinned mesh `<id>_mesh`), clips `<id>_<clip>` baked at
30 fps on every bone. --preview renders each clip as a strip of poses (raid camera and a low 3/4) instead of exporting.
"""
import importlib
import json
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
sys.path.insert(0, HERE)
import fauna_lib as L  # noqa: E402

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
opt = lambda k: ARGS[ARGS.index(k) + 1] if k in ARGS else None   # noqa: E731
ORDER = ["crab", "parrot", "frog", "boar", "croc"]
BUDGET = {"crab": 800, "parrot": 1200, "frog": 600, "boar": 2500, "croc": 3000}
only = opt("--only").split(",") if opt("--only") else ORDER

L.C.clean_scene()
bpy.context.scene.render.fps = L.FPS
animals = []
for i, ident in enumerate(only):
    a = importlib.import_module(ident).build()
    a.tris = L.tris(a.ob)
    a.arm["tris"] = a.tris
    a.arm["clips"] = {k: {"frames": f, "seconds": round(f / L.FPS, 4), "loop": lp} for k, (f, lp) in a.clips.items()}
    for k, v in a.notes.items():
        a.arm[k] = v
    animals.append(a)
    print("@@ %-7s %5d tris (budget %d)  %2d bones  clips %s" % (ident, a.tris, BUDGET[ident], len(a.arm.data.bones),
                                                                 ", ".join("%s %df%s" % (k, f, " loop" if lp else "") for k, (f, lp) in a.clips.items())))
    if a.tris > BUDGET[ident]:
        raise SystemExit("%s is over budget" % ident)

if opt("--preview"):
    import shots
    from mathutils import Vector
    out = opt("--preview")
    for a in animals:
        zs = [(a.ob.matrix_world @ v.co) for v in a.ob.data.vertices]
        lo, hi = Vector((min(v.x for v in zs), min(v.y for v in zs), min(v.z for v in zs))), Vector((max(v.x for v in zs), max(v.y for v in zs), max(v.z for v in zs)))
        cen, size = (lo + hi) / 2, max((hi - lo).x, (hi - lo).y, (hi - lo).z)
        for b in animals:
            b.ob.hide_render = b is not a
            b.arm.hide_render = True
        shots.stage(res=(520, 300) if a.id == "croc" else (360, 320), samples=16, water=0.9 if a.id == "croc" else None)
        if a.id == "croc":
            size *= 0.5
        import subprocess
        for view, dist in (("raid", size * 3.6), ("q34", size * 2.5), ("side", size * 2.4), ("front", size * 2.4)):
            files = []
            for clip, (frames, loop) in [("rest", (0, False))] + list(a.clips.items()):
                n = 1 if clip == "rest" else 6
                for tr in a.arm.animation_data.nla_tracks:
                    tr.mute = tr.name != a.px + clip
                for i in range(n):
                    f = round(i * frames / (n if loop else max(1, n - 1)))
                    bpy.context.scene.frame_set(f)
                    shots.aim(view, (cen.x, cen.y, cen.z), dist)
                    files.append(shots.shoot(os.path.join(out, "_t", "%s_%s_%s_%02d.png" % (a.id, view, clip, i))))
            # rest tile first, then one row of 6 per clip
            rows = [files[0]] + [None] * 5 + files[1:]
            subprocess.run(["montage", *[r or "null:" for r in rows], "-tile", "6x", "-geometry", "+1+1", "-background", "#222", os.path.join(out, "%s_%s.png" % (a.id, view))], check=True)
    sys.exit(0)

for a in animals:
    for tr in a.arm.animation_data.nla_tracks:
        tr.mute = False
bpy.data.materials["bv_matte"].name = "MAT_Fauna"            # one shared material: vertex colour (albedo x AO), roughness 0.62
os.makedirs(os.path.join(HERE, "..", "build"), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "..", "build", "fauna.blend"))
if only == ORDER:
    path = os.path.join(ROOT, "public", "models", "fauna.glb")
    size = L.export_glb(path, [o for a in animals for o in (a.arm, a.ob)])
    man = {"glb_bytes": size, "fps": L.FPS, "animals": {a.id: {"root": "fauna_" + a.id, "mesh": a.id + "_mesh", "tris": a.tris, "budget": BUDGET[a.id],
                                                              "bones": [b.name for b in a.arm.data.bones],
                                                              "clips": {a.px + k: {"frames": f, "seconds": round(f / L.FPS, 4), "loop": lp} for k, (f, lp) in a.clips.items()},
                                                              "notes": a.notes} for a in animals}}
    json.dump(man, open(os.path.join(HERE, "manifest.json"), "w"), indent=1)
    print("@@GLB", path, size)
