"""Run the blender-asset-qa gate (qa_check.py, profile "game") on every model in the library .blend.

  blender -b spikes/items/items.blend --python-exit-code 1 --python tools/items/qa.py -- [--skill-dir DIR]

Each model is checked on its own (its parts are islands of one mesh). UV checks are off on purpose:
the models are vertex-coloured and carry no textures, so they ship without UVs.
Writes spikes/items/qa.json and exits non-zero if any model has an error.
"""
import json
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
skill = argv[argv.index("--skill-dir") + 1] if "--skill-dir" in argv else os.path.expanduser("~/.claude/skills/blender-asset-qa/scripts")
sys.path.insert(0, skill)
import qa_check  # noqa: E402

out, failed = {}, []
for ob in sorted((o for o in bpy.context.scene.objects if o.type == "MESH" and "kind" in o.keys()), key=lambda o: o.name):
    res = qa_check.run(objects=[ob.name], profile="game", uv=False)
    m = res["objects"][ob.name]
    out[ob.name] = {"pass": res["pass"], "errors": res["errors"], "warnings": res["warnings"], "tris": m["tris"],
                    "islands": m["islands"], "ground_z": res["ground_z"]}
    if not res["pass"]:
        failed.append(ob.name)
    print(f"@@ {'PASS' if res['pass'] else 'FAIL'} {ob.name:13s} tris {m['tris']:5d} islands {m['islands']:3d} "
          f"errors {len(res['errors'])} warnings {len(res['warnings'])}")
    for e in res["errors"]:
        print("@@    ERROR  ", e)
    for w in res["warnings"]:
        print("@@    warning", w)
json.dump(out, open(os.path.join(ROOT, "spikes", "items", "qa.json"), "w"), indent=1)
print(f"@@ QA gate: {len(out) - len(failed)}/{len(out)} pass" + (f"; FAILED: {failed}" if failed else ""))

# ---- visual half of the gate: wireframe 3/4 + back view of every model (blender-asset-qa review_shots)
if "--shots" in argv:
    import review_shots  # noqa: E402
    shots = os.path.join(ROOT, "spikes", "items", "qa_shots")
    os.makedirs(shots, exist_ok=True)
    for name in sorted(out):
        review_shots.run(objects=[name], out=os.path.join(shots, name + ".png"), views=["three_quarter", "back"],
                         mode="wire", res=256)
    print("@@ review shots in", shots)
if failed:
    sys.exit(1)
