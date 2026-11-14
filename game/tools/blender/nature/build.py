"""Bananaville nature kit: build every piece, bake AO into the vertex colours, run the QA gate, write the GLB packs.

  blender -b --factory-startup --python-exit-code 1 -P tools/blender/nature/build.py -- [--only palm,tree] [--no-qa] [--no-export]

Deterministic: every variant is seeded from "<type>:<variant>". Output:
  public/models/nature/<pack>.glb      POSITION, NORMAL, COLOR_0 only (TEXCOORD_0 on the two water meshes)
  tools/blender/nature/manifest.json   triangles and bounds per piece, QA result
  spikes/nature/nature_kit.blend       the editable scene (not committed)
Node names: <type>_<variant>__<material class>; node extras carry {type, variant, mat, tris, size}.
"""
import argparse
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.expanduser("~/.agents/skills/blender-asset-qa/scripts"))

import bpy  # noqa: E402
import numpy as np  # noqa: E402

import nlib  # noqa: E402
import plants as P  # noqa: E402
import rocks as R  # noqa: E402
from nlib import Rng, bake_ao, make_object, write_glb  # noqa: E402

# seed salts: a variant whose random leaves happened to land coplanar (z-fighting in the QA gate) gets the next seed
SALT = {"palm_3": 1, "flowers_2": 1, "caster_2": 1, "giant_0": 2, "giant_1": 2, "reeds_2": 1, "roots_1": 1}
GROUND_Z = 0.04  # the game places kit pieces 0.04 below the terrain (dress.ts addPiece), so local z = 0.04 is the ground


def reg():
    """(type, pack, [variant builders], options). options: ground = QA ground height (None: piece hangs in the air),
    budget = triangle ceiling from the brief."""
    k = lambda fn, **kw: (lambda r: fn(r, **kw))  # noqa: E731
    T = []
    T.append(("palm", "trees", [P.palm] * 4, dict(budget=3500)))
    T.append(("palmlean", "trees", [lambda r: P.palm(r, lean=r.u(2.3, 3.2), height=r.u(4.6, 5.5))] * 3, dict(budget=3500)))
    T.append(("tree", "trees", [P.tree] * 5, dict(budget=3500)))
    T.append(("treefar", "trees", [k(P.tree, far=True)] * 3, dict(budget=3500)))
    T.append(("mangrove", "trees", [P.mangrove] * 3, dict(budget=3500)))
    T.append(("caster", "trees", [P.caster] * 3, dict(budget=800, ground=None)))
    T.append(("giant", "giant", [P.giant] * 3, dict(budget=9000)))
    T.append(("bush", "plants", [k(P.bush, kind=i) for i in range(5)], dict(budget=1500)))
    T.append(("fern", "plants", [P.fern] * 4, dict(budget=800)))
    T.append(("bigleaf", "plants", [P.bigleaf] * 4, dict(budget=800)))
    T.append(("banana", "plants", [k(P.banana, bunch=b) for b in (True, True, False, True)], dict(budget=800)))
    T.append(("flowers", "plants", [k(P.flowers, kind=i) for i in range(4)], dict(budget=800)))
    T.append(("reeds", "plants", [P.reeds] * 3, dict(budget=800)))
    T.append(("lily", "plants", [k(P.lily, bloom=b) for b in (True, True, False)], dict(budget=800)))
    T.append(("beachgrass", "plants", [P.beachgrass] * 3, dict(budget=800)))
    T.append(("grass", "plants", [P.grass_tuft] * 3, dict(budget=100)))
    T.append(("litter", "plants", [P.litter] * 3, dict(budget=800)))
    T.append(("rocks", "rocks", [k(R.rock, cls="s")] * 4, dict(budget=600)))
    T.append(("rockm", "rocks", [k(R.rock, cls="m")] * 4, dict(budget=600)))
    T.append(("rockl", "rocks", [k(R.rock, cls="l")] * 4, dict(budget=600)))
    T.append(("boulders", "rocks", [R.boulders] * 3, dict(budget=600)))
    T.append(("pebbles", "rocks", [k(R.pebbles, sand=s) for s in (False, False, True)], dict(budget=600)))
    T.append(("log", "rocks", [k(R.log, kind=i) for i in range(4)], dict(budget=800)))
    T.append(("stump", "rocks", [k(R.stump, kind=i) for i in range(3)], dict(budget=800)))
    T.append(("driftwood", "rocks", [R.driftwood] * 3, dict(budget=800)))
    T.append(("shells", "rocks", [R.shells] * 3, dict(budget=800)))
    T.append(("caverock", "cave", [k(R.caverock, kind=i) for i in range(4)], dict(budget=600)))
    T.append(("stalagmite", "cave", [R.stalagmite] * 3, dict(budget=600)))
    T.append(("mushroom", "cave", [k(R.mushroom, hue=i) for i in range(4)], dict(budget=800)))
    T.append(("crystal", "cave", [k(R.crystal, hue=i) for i in range(3)], dict(budget=800)))
    T.append(("roots", "cave", [R.hanging_roots] * 3, dict(budget=1500)))
    T.append(("cliff", "waterfall", [R.cliff], dict(budget=6000, ground=-0.3, group="falls")))
    T.append(("water", "waterfall", [R.water_sheet], dict(budget=600, ground=None, uv=True, group="falls", ao=False)))
    T.append(("foam", "waterfall", [R.foam], dict(budget=600, ground=None, uv=True, group="falls", ao=False)))
    return T


def bounds(geos):
    v = np.array([p for g in geos for p in g.v])
    return v.min(0), v.max(0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--no-qa", action="store_true")
    ap.add_argument("--no-export", action="store_true")
    ap.add_argument("--blend", default=os.path.join(ROOT, "spikes", "nature", "nature_kit.blend"))
    args = ap.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    only = set(filter(None, args.only.split(",")))
    t0 = time.time()
    sc = nlib.reset_scene()
    sc.unit_settings.system = "METRIC"
    manifest = {"pieces": {}, "packs": {}, "qa": {}}
    packs, assets = {}, []
    for typ, pack, variants, opt in reg():
        if only and typ not in only:
            continue
        coll = bpy.data.collections.get(pack) or bpy.data.collections.new(pack)
        if coll.name not in sc.collection.children:
            sc.collection.children.link(coll)
        for i, fn in enumerate(variants):
            geos = [g.compact() for g in fn(Rng(f"{typ}:{i}:{SALT.get(f'{typ}_{i}', 0)}")) if g.f]
            lo, hi = bounds(geos)
            if opt.get("ao", True):
                dist = float(min(2.4, max(0.3, 0.3 * max(hi - lo))))
                for g in geos:
                    if g.mat == "foliage":
                        g.ao = [x * 0.82 for x in g.ao]   # leaves keep some light inside the mass
                bake_ao(geos, dist=dist, ground=opt.get("ground", 0.0) is not None, floor_z=GROUND_Z if "ground" not in opt else 0.0)
            names, tris = [], 0
            for g in geos:
                name = f"{typ}_{i}__{g.mat}"
                ex = {"type": typ, "variant": i, "mat": g.mat, "size": [round(float(x), 3) for x in (hi - lo)]}
                if opt.get("uv"):
                    ex["uv"] = 1
                ob = make_object(name, g, coll, ex)
                names.append(name)
                tris += g.ntris
                packs.setdefault(pack, []).append((name, ob.data, ex))
            key = f"{typ}_{i}"
            manifest["pieces"][key] = {"tris": tris, "budget": opt["budget"], "parts": {g.mat: g.ntris for g in geos}, "size": [round(float(x), 2) for x in (hi - lo)]}
            assert tris <= opt["budget"], f"{key}: {tris} tris over budget {opt['budget']}"
            assets.append((key, names, opt))
        print(f"[build] {typ}: {len(variants)} variants, tris {[manifest['pieces'][f'{typ}_{i}']['tris'] for i in range(len(variants))]}  ({time.time() - t0:.1f}s)", flush=True)

    # ---- QA gate (blender-asset-qa): each asset is checked with its parts together + the ground it stands on
    ok = True
    if not args.no_qa:
        import qa_check
        gm = bpy.data.meshes.new("QA_Ground")
        gm.from_pydata([(-30, -30, 0), (30, -30, 0), (30, 30, 0), (-30, 30, 0)], [], [(0, 1, 2), (0, 2, 3)])
        gm.materials.append(nlib.preview_material("matte"))
        gob = bpy.data.objects.new("QA_Ground", gm)
        sc.collection.objects.link(gob)
        groups = {}
        for key, names, opt in assets:
            groups.setdefault(opt.get("group", key), ([], opt))[0].extend(names)
        for key, (names, opt) in groups.items():
            gz = opt.get("ground", GROUND_Z)
            objs = list(names)
            if gz is not None:
                gob.location.z = gz
                bpy.context.view_layer.update()
                objs.append("QA_Ground")
            res = qa_check.run(objects=objs, profile="game", uv=False)
            warn = [w for w in res["warnings"] if "QA_Ground" not in w and "not resting on ground" not in w]
            manifest["qa"][key] = {"pass": res["pass"], "errors": res["errors"], "warnings": warn}
            if not res["pass"]:
                ok = False
                print(f"[qa] FAIL {key}: {res['errors']}", flush=True)
        bpy.data.objects.remove(gob)
        nwarn = sum(len(q["warnings"]) for q in manifest["qa"].values())
        print(f"[qa] {sum(q['pass'] for q in manifest['qa'].values())}/{len(manifest['qa'])} assets pass, {nwarn} warnings  ({time.time() - t0:.1f}s)", flush=True)

    if not args.no_export:
        out = os.path.join(ROOT, "public", "models", "nature")
        for pack, objs in packs.items():
            path = os.path.join(out, pack + ".glb")
            tris = write_glb(path, objs, {"kit": "bananaville-nature", "pack": pack})
            manifest["packs"][pack] = {"file": f"public/models/nature/{pack}.glb", "bytes": os.path.getsize(path), "tris": tris, "nodes": len(objs)}
            print(f"[glb] {pack}.glb  {os.path.getsize(path) / 1024:.0f} KB  {tris} tris  {len(objs)} nodes", flush=True)
        if not only:
            manifest["total_bytes"] = sum(p["bytes"] for p in manifest["packs"].values())
            manifest["blender"] = bpy.app.version_string
            with open(os.path.join(HERE, "manifest.json"), "w") as fh:
                json.dump(manifest, fh, indent=1)
    os.makedirs(os.path.dirname(args.blend), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=args.blend)
    print(f"[done] {len(assets)} assets in {time.time() - t0:.1f}s; qa {'PASS' if ok else 'FAIL'}", flush=True)
    if not ok:
        sys.exit(1)


main()
