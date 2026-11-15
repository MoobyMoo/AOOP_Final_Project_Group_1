"""Bananaville nature kit: the blender-asset-qa visual check. Renders multi-angle contact sheets (one colour per part,
then wireframe) for a sample of assets with the skill's review_shots.py.

  blender -b spikes/nature/nature_kit.blend --python-exit-code 1 -P tools/blender/nature/qa_sheets.py -- [--assets palm_0,tree_0] [--out spikes/nature/qa]
"""
import argparse
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.expanduser("~/.agents/skills/blender-asset-qa/scripts"))
import review_shots  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("--assets", default="palm_0,tree_0,giant_0,bush_0,banana_0,rockl_0,log_0,mangrove_0,cliff_0,crystal_0")
ap.add_argument("--out", default=os.path.join(ROOT, "spikes", "nature", "qa"))
a = ap.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
os.makedirs(a.out, exist_ok=True)
for key in a.assets.split(","):
    names = [o.name for o in bpy.data.objects if o.type == "MESH" and o.name.startswith(key + "__")]
    if not names:
        continue
    for mode in ("random", "wire"):
        r = review_shots.run(objects=names, out=os.path.join(a.out, f"{key}_{mode}.png"), mode=mode, res=384)
        for v in r["views"]:
            os.remove(v)
        print("[qa-sheet]", r["sheet"], flush=True)
