"""Asset QA gate (blender-asset-qa qa_check.py, profile "game") for the Kingpin's attachments, off and on the gun.

  blender -b tools/blender/kingpin/kingpin45.blend --python-exit-code 1 -P tools/blender/kingpin/qa_attachments.py -- [--skill-dir DIR] [--shots DIR]

Three passes: the bare gun (the baseline), each attachment on its own (normals, floating parts, z-fighting, degenerate
faces, applied scale), and each attachment fitted on its socket together with the gun's parts, where every z-fight,
back-to-back contact or floating part that involves the attachment is an error. qa_check only calls an island floating
when it touches no other island, so a whole piece hanging clear of the gun would pass it: the fitted pass therefore
also requires the piece's surface to cut the gun's (seated()), and proves that check by moving each piece 0.3 off. UV checks are off on purpose: the UV
channel is a palette lookup, not a texture layout. --shots also writes a random-colour and a wireframe sheet per piece.
Exits non-zero on any error.
"""
import bpy, json, os, sys
from mathutils import Matrix
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def arg(name, default): return argv[argv.index(name) + 1] if name in argv else default
sys.path.insert(0, arg("--skill-dir", os.path.expanduser("~/.agents/skills/blender-asset-qa/scripts")))
import qa_check  # noqa: E402

FIT = {"att_sight_holo": "socket_sight", "att_sight_2x": "socket_sight", "att_muzzle_comp": "socket_muzzle", "att_muzzle_supp": "socket_muzzle",
       "att_mag_ext": "socket_mag", "att_laser": "socket_rail"}
GUN = ["frame", "slide", "hammer", "trigger", "mag"]
sc, O = bpy.context.scene, bpy.data.objects
with bpy.data.libraries.load(os.path.join(HERE, "attachments.blend")) as (src, dst):
    dst.objects = [n for n in src.objects if n in FIT]
for ob in dst.objects:
    sc.collection.objects.link(ob)
bpy.context.view_layer.update()

failed = []
def report(label, res, errors=None, names=()):
    errors = res["errors"] if errors is None else errors
    tris = sum(res["objects"][n]["tris"] for n in names) if names else sum(o["tris"] for o in res["objects"].values())
    print(f"@@ {'PASS' if not errors else 'FAIL'} {label:46s} tris {tris:5d}  errors {json.dumps(errors)}  warnings {json.dumps(res['warnings'])}")
    if errors: failed.append(label)

base = qa_check.run(objects=GUN, profile="game", uv=False)
report("kingpin45 (bare gun, baseline)", base)

for name in FIT:                                        # 1: off the gun, at the origin as it ships
    ob = O[name]
    for k in ("location", "rotation_euler"):
        if any(abs(v) > 1e-6 for v in getattr(ob, k)): failed.append(name); print("@@ FAIL", name, k, "not at the identity")
    res = qa_check.run(objects=[name], profile="game", uv=False)
    res["warnings"] = [w for w in res["warnings"] if "not resting on ground plane" not in w]   # the origin is the mount point, not the ground
    report(name + " alone", res)

def involves(entry, name):
    return name in json.dumps(entry)
def tree(names):
    verts, polys = [], []
    for n in names:
        ob, base = O[n], len(verts)
        verts += [ob.matrix_world @ v.co for v in ob.data.vertices]
        polys += [[base + i for i in p.vertices] for p in ob.data.polygons]
    return BVHTree.FromPolygons(verts, polys, epsilon=0.0)
GUN_TREE = tree(GUN)
def seated(name):
    """triangle pairs where the piece's surface cuts the gun's: none = it hangs clear of the gun"""
    return len(tree([name]).overlap(GUN_TREE))
for name, socket in FIT.items():                        # 2: on its socket with an identity transform, as the game fits it
    ob = O[name]
    ob.parent = O[socket]; ob.matrix_parent_inverse = Matrix.Identity(4); ob.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()
    res = qa_check.run(objects=GUN + [name], profile="game", uv=False)
    errs = [f"{kind}: {e}" for kind in ("zfighting", "back_to_back", "floating") for e in res[kind] if involves(e, name)]
    errs += [e for e in res["errors"] if name in e and e not in base["errors"]]
    cuts = seated(name)
    if not cuts: errs.append("not seated: the piece does not touch the gun")
    ob.matrix_basis = Matrix.Translation((0.3, 0.3, 0.3)); bpy.context.view_layer.update()
    if seated(name): errs.append("seated() self-test: still 'touching' when moved 0.3 off the gun")
    ob.matrix_basis = Matrix.Identity(4)
    res["warnings"] = [w for w in res["warnings"] if w not in base["warnings"] and "not resting on ground plane" not in w]
    report(f"{name} on {socket} ({cuts} cuts)", res, errs, [name])
    ob.parent = None; ob.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()

shots = arg("--shots", "")
if shots:
    import review_shots  # noqa: E402
    os.makedirs(shots, exist_ok=True)
    for name in FIT:
        for mode in ("random", "wire"):
            review_shots.run(objects=[name], out=os.path.join(shots, f"{name}_{mode}.png"), views=["three_quarter", "back"], mode=mode, res=384)
    print("@@ review shots in", shots)
print(f"@@ QA gate: {'PASS' if not failed else 'FAILED: ' + str(failed)}")
if failed:
    sys.exit(1)
