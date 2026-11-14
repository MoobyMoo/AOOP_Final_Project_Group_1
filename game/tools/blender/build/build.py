"""Build one asset group: blender -b --factory-startup --python tools/blender/build/build.py -- --group loot [--render]
Writes public/models/build/<group>.glb, tools/blender/build/blend/<group>.blend, manifest/<group>.json and
(with --render) spikes/build/blender_<group>.png at the gameplay camera."""
import sys, os, json, importlib, argparse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import lib

ap = argparse.ArgumentParser()
ap.add_argument("--group", required=True)
ap.add_argument("--render", action="store_true")
ap.add_argument("--tag", default="")
args = ap.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o)
mod = importlib.import_module("g_" + args.group)
mod.build()
assets = list(lib.ASSETS)
lib.finish_all(assets, shared_occluders=getattr(mod, "SHARED_AO", False))
size = lib.export_glb(os.path.join(lib.OUT_GLB, args.group + ".glb"))
os.makedirs(lib.OUT_BLEND, exist_ok=True)
man = {"group": args.group, "glb_bytes": size, "assets": {a.name: {"tris": a.tris, "parts": sorted(set(g.part for g in a.parts.values())), "points": sorted(a.points), **{k: v for k, v in a.meta.items() if k != "asset"}} for a in assets}}
os.makedirs(os.path.join(lib.HERE, "manifest"), exist_ok=True)
json.dump(man, open(os.path.join(lib.HERE, "manifest", args.group + ".json"), "w"), indent=1)
print(f"[build] {args.group}: {len(assets)} assets, {sum(a.tris for a in assets)} tris, glb {size / 1024:.0f} KB")
for a in assets:
    print(f"   {a.name:34s} {a.tris:6d} tris")
if args.render:
    kw = getattr(mod, "REVIEW", {})
    lib.review_render(os.path.join(lib.OUT_RENDER, f"blender_{args.group}{args.tag}.png"), assets, **kw)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(lib.OUT_BLEND, args.group + ".blend"))
