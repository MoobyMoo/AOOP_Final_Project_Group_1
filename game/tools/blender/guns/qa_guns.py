"""QA gate for the kit guns: the asset QA gate, the game's z-fight rule, and the Kingpin's attachments on every socket.

  blender -b --factory-startup --python-exit-code 1 -P tools/blender/guns/qa_guns.py -- [--only id,id] [--list 6] [--skill-dir DIR]

Per gun (from tools/blender/build/blend/guns/<id>.blend, so run build_guns.py first):
  1. blender-asset-qa qa_check.py, profile "game", on all of the gun's meshes together. UV checks are off on purpose:
     the UV channel is a palette lookup. "Not resting on the ground" is dropped: the origin is the grip.
  2. the game's coplanar rule (src/game/dev/glitch.ts, through tools/blender/build/coplanar_check.py --strict): two
     same-facing triangles within 2 mm of one plane that overlap by 2 cm2. Any pair fails, hidden or not.
  3. each of the Kingpin's attachments on the socket it mounts on, at the identity, as the game fits it: no z-fight,
     back-to-back contact or floating part that involves the piece, no coplanar pair between piece and gun, and the
     piece must cut the gun's surface (a piece hanging clear of the gun passes every other test). A gun with a
     built-in scope is tested with the scope hidden, which is how the game shows it once a sight is fitted.
Exits non-zero on any error.
"""
import bpy, json, os, sys
from mathutils import Matrix
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
BLENDS = os.path.join(ROOT, "tools", "blender", "build", "blend", "guns")
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def arg(name, default): return argv[argv.index(name) + 1] if name in argv else default
sys.path.insert(0, arg("--skill-dir", os.path.expanduser("~/.agents/skills/blender-asset-qa/scripts")))
import qa_check  # noqa: E402

# the game's coplanar rule: take the functions of coplanar_check.py, not its command line
_src = open(os.path.join(HERE, "..", "build", "coplanar_check.py")).read().split('\nif "--glb" in argv:')[0]
_argv, sys.argv = sys.argv, ["coplanar_check", "--", "--strict", "--list", arg("--list", "6")]
CP = {}
exec(compile(_src, "coplanar_check.py", "exec"), CP)
sys.argv = _argv

MANIFEST = json.load(open(os.path.join(HERE, "manifest.json")))
ONLY = [i for i in arg("--only", "").split(",") if i] or list(MANIFEST)
FIT = {"att_sight_holo": "socket_sight", "att_sight_2x": "socket_sight", "att_muzzle_comp": "socket_muzzle", "att_muzzle_supp": "socket_muzzle",
       "att_mag_ext": "socket_mag", "att_laser": "socket_rail"}
failed = []

def tree(obs):
    verts, polys = [], []
    for ob in obs:
        base = len(verts)
        verts += [ob.matrix_world @ v.co for v in ob.data.vertices]
        polys += [[base + i for i in p.vertices] for p in ob.data.polygons]
    return BVHTree.FromPolygons(verts, polys, epsilon=0.0)

def tris(obs, owner):
    """coplanar_check's triangle tuples for a list of mesh objects"""
    class R:                                                 # tris_of() walks root.children_recursive
        children_recursive = obs
    return CP["tris_of"](R, None, owner)

def line(ok, label, n_tris, errors, warnings=()):
    print(f"@@ {'PASS' if ok else 'FAIL'} {label:44s} tris {n_tris:5d}  errors {json.dumps(errors)}" + (f"  warnings {json.dumps(list(warnings))}" if warnings else ""))
    if not ok: failed.append(label)

for gid in ONLY:
    bpy.ops.wm.open_mainfile(filepath=os.path.join(BLENDS, gid + ".blend"))
    sc, O = bpy.context.scene, bpy.data.objects
    entry = MANIFEST[gid]
    gun = [o for o in O if o.type == "MESH"]
    names = [o.name for o in gun]
    # ---- 1: asset QA
    res = qa_check.run(objects=names, profile="game", uv=False)
    warns = [w for w in res["warnings"] if "not resting on ground plane" not in w]
    n = sum(o["tris"] for o in res["objects"].values())
    line(not res["errors"], f"{gid}: asset QA", n, res["errors"], warns)
    if res["zfighting"]:                                     # where: the same rule with no minimum area, 1 mm
        CP["MIN_A"] = 1e-6
        CP["report"](gid + " (asset QA's z-fights)", CP["coplanar"](tris(gun, 0), d_tol=0.001))
        CP["MIN_A"] = 2e-4
    # ---- 2: the game's coplanar rule
    hits = CP["coplanar"](tris(gun, 0))
    if hits: CP["report"](gid, hits)
    line(not hits, f"{gid}: coplanar (2 mm, strict)", n, [f"{len(hits)} pairs, {sum(h[0] for h in hits) * 1e4:.1f} cm2"] if hits else [])
    # ---- 3: attachments on the sockets
    with bpy.data.libraries.load(os.path.join(HERE, "..", "kingpin", "attachments.blend")) as (src, dst):
        dst.objects = [x for x in src.objects if x in FIT]
    for ob in dst.objects: sc.collection.objects.link(ob)
    builtin = entry["extras"].get("builtinSight")
    for att, socket in FIT.items():
        if socket not in entry["sockets"]: continue
        kind = entry["extras"].get("magKind", "box")
        if att == "att_mag_ext" and kind != "box":            # a box extension has nothing to hang from on a tube, a cylinder or loose shells
            print(f"@@ SKIP {gid}: att_mag_ext (the magazine is a {kind}; socket_mag marks where it loads, and takes its own kind of extension)"); continue
        ob = O[att]
        base = [o for o in gun if not (socket == "socket_sight" and o.name == builtin)]
        ob.parent = O[socket]; ob.matrix_parent_inverse = Matrix.Identity(4); ob.matrix_basis = Matrix.Identity(4)
        bpy.context.view_layer.update()
        r2 = qa_check.run(objects=[o.name for o in base] + [att], profile="game", uv=False)
        errs = [f"{kind}: {e}" for kind in ("zfighting", "back_to_back", "floating") for e in r2[kind] if att in json.dumps(e)]
        errs += [e for e in r2["errors"] if att in e and e not in res["errors"]]
        cross = CP["coplanar"](tris(base, 0) + tris([ob], 1), cross=True)
        if cross: CP["report"](f"{gid} + {att}", cross); errs.append(f"coplanar with the gun: {len(cross)} pairs")
        cuts = len(tree([ob]).overlap(tree(base)))
        if not cuts: errs.append("not seated: the piece does not touch the gun")
        line(not errs, f"{gid}: {att} on {socket} ({cuts} cuts)", r2["objects"][att]["tris"], errs)
        ob.parent = None; ob.matrix_basis = Matrix.Translation((0, 0, 50))
        bpy.context.view_layer.update()

print(f"@@ QA gate: {'PASS' if not failed else 'FAILED: ' + str(failed)}")
if failed: sys.exit(1)
