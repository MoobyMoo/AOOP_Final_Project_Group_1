"""Merge manifest/<group>.json into public/models/build/manifest.json (tris per asset, GLB sizes) and print totals."""
import json, os, glob
here = os.path.dirname(os.path.abspath(__file__))
out = {"groups": {}, "total_tris": 0, "total_bytes": 0}
for f in sorted(glob.glob(os.path.join(here, "manifest", "*.json"))):
    m = json.load(open(f))
    out["groups"][m["group"]] = {"glb_bytes": m["glb_bytes"], "tris": sum(a["tris"] for a in m["assets"].values()), "assets": m["assets"]}
    out["total_tris"] += out["groups"][m["group"]]["tris"]
    out["total_bytes"] += m["glb_bytes"]
dst = os.path.join(here, "..", "..", "..", "public", "models", "build", "manifest.json")
json.dump(out, open(dst, "w"), indent=1)
print(f"[manifest] {sum(len(g['assets']) for g in out['groups'].values())} assets, {out['total_tris']} tris, {out['total_bytes'] / 1e6:.2f} MB of GLB")
