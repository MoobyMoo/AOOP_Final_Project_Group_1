"""Build the kit guns: one GLB per gun, each a Kingpin in its conventions.

  blender -b --factory-startup --python-exit-code 1 -P tools/blender/guns/build_guns.py [-- --only id,id] [--preview DIR]

Writes public/models/guns/<gunId>.glb, the editable tools/blender/build/blend/guns/<gunId>.blend (ignored by git: this
script is the source) and that gun's entry in tools/blender/guns/manifest.json (what the game code needs: nodes,
sockets, the moving part's axis and travel). --preview also renders four quick views of each gun into DIR.

In the GLB: <gunId> > body > { frame, the moving part, the magazine, any extra parts, the points, the sockets }.
Root at the firing hand's grip, +z along the bore, +y up, +x the ejection side. One material, MAT_Kingpin, with the
Kingpin's palette textures and palette UVs; COLOR_0 = tint x ambient occlusion (gk.py). Points and sockets are
unrotated empties; a socket carries `rides`, the node it follows. Parts that turn have their origin on their pivot.
"""
import bpy, json, os, sys
from math import radians, sin, cos, atan, tan
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import gk
import roster
from kp_common import join, bake_ao, empty, g2b

ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OUT_GLB = os.path.join(ROOT, "public", "models", "guns")
OUT_BLEND = os.path.join(ROOT, "tools", "blender", "build", "blend", "guns")
MANIFEST = os.path.join(HERE, "manifest.json")
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def arg(name, default): return argv[argv.index(name) + 1] if name in argv else default
ONLY = [i for i in arg("--only", "").split(",") if i] or list(roster.GUNS)
PREVIEW = arg("--preview", "")
BUDGET = {"lmg": 3500}

def tris_of(ob): return sum(len(p.vertices) - 2 for p in ob.data.polygons)

def build(gid):
    spec = roster.GUNS[gid]
    scene = gk.reset()
    g = gk.Gun(gid, spec["name"], spec["cls"], spec["tier"])
    spec["fn"](g)
    if os.environ.get("GUN_TRIS"):                                  # where the triangles go, per part
        by = {}
        for node, parts in g.nodes.items():
            for ob in parts: by[node + "/" + ob.name.split(".")[0]] = by.get(node + "/" + ob.name.split(".")[0], 0) + tris_of(ob)
        print("@@ tris", gid, " ".join(f"{k}={v}" for k, v in sorted(by.items(), key=lambda kv: -kv[1])))
    obs = {name: join(name, parts) for name, parts in g.nodes.items() if parts}
    # ambient occlusion. The frame and the moving part shade each other. A magazine is seen out of the gun, and a
    # built-in scope or a bipod can be hidden or swung away: those get their own occlusion only, and cast none.
    loose = [n for n in obs if n in g.extras.get("loose", ()) or n == g.extras.get("mag")]
    rigid = [o for n, o in obs.items() if n not in loose]
    for n, o in obs.items(): bake_ao(o, [o] if n in loose else rigid)
    for n in g.extras.get("shaded_by_frame", ()): bake_ao_again(obs[n], [obs[n], obs["frame"]])
    gk.finish(list(obs.values()))
    root = empty(gid, None); body = empty("body", root)
    for name, ob in obs.items():
        ob.parent = body
        piv = g.pivots.get(name)
        if piv: ob.data.transform(Matrix.Translation(-g2b(piv))); ob.location = g2b(piv)
    for name, at in g.points.items(): empty(name, body, at)
    for name, (at, rides) in g.sockets.items():
        if rides != "body" and rides not in obs: raise SystemExit(f"{gid}: {name} rides '{rides}', which is not a node")
        if rides in g.pivots: raise SystemExit(f"{gid}: {name} rides '{rides}', which does not rest at the identity")
        empty(name, body, at)["rides"] = rides
    tris = {n: tris_of(o) for n, o in obs.items()}
    total = sum(tris.values())
    props = {"gunId": gid, "gunName": spec["name"], "gunClass": spec["cls"], "tier": spec["tier"]}
    props.update({k: v for k, v in g.extras.items() if k not in ("loose", "shaded_by_frame")})
    for k, v in props.items(): root[k] = v
    budget = BUDGET.get(spec["cls"], 2500)
    if total >= budget and not os.environ.get("GUN_OVER"): raise SystemExit(f"{gid}: {total} tris, budget {budget}: {tris}")
    os.makedirs(OUT_GLB, exist_ok=True); os.makedirs(OUT_BLEND, exist_ok=True)
    glb = os.path.join(OUT_GLB, gid + ".glb")
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT_BLEND, gid + ".blend"), compress=True)
    bpy.ops.export_scene.gltf(
        filepath=glb, export_format="GLB", export_yup=True, export_apply=True, export_extras=True,
        export_texcoords=True, export_normals=True, export_tangents=False, export_vertex_color="ACTIVE", export_all_vertex_colors=False,
        export_cameras=False, export_lights=False, export_skins=False, export_morph=False, export_animations=False, export_image_format="AUTO")
    pts = [Vector((v.co.x, v.co.z, -v.co.y)) + Vector(g.pivots.get(n, (0, 0, 0))) for n, o in obs.items() for v in o.data.vertices]
    lo, hi = [round(min(p[i] for p in pts), 3) for i in range(3)], [round(max(p[i] for p in pts), 3) for i in range(3)]
    entry = {"name": spec["name"], "class": spec["cls"], "tier": spec["tier"], "tris": total, "tris_by_node": tris, "glb_bytes": os.path.getsize(glb),
             "bounds": [lo, hi], "length": round(hi[2] - lo[2], 3), "nodes": sorted(obs), "points": g.points,
             "sockets": {n: {"at": list(at), "rides": rides} for n, (at, rides) in g.sockets.items()}, "pivots": g.pivots,
             "extras": {k: v for k, v in props.items() if k not in ("gunId", "gunName", "gunClass", "tier")}}
    print("@@ built %-20s %-8s %-4s %5d tris  length %.2f  %s" % (gid, spec["cls"], spec["tier"], total, entry["length"], tris))
    if PREVIEW: preview(gid, obs, lo, hi)
    return entry

def bake_ao_again(ob, occluders):
    me = ob.data
    me.color_attributes.remove(me.color_attributes["Col"])
    bake_ao(ob, occluders)

# ------------------------------------------------------------------------------------------------ quick look
def preview(gid, obs, lo, hi):
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 960, 540, 100
    sc.render.image_settings.file_format = "PNG"
    try: sc.view_settings.view_transform = "Standard"
    except TypeError: pass
    sc.eevee.taa_render_samples = 16
    world = bpy.data.worlds.new("review"); sc.world = world
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.55, 0.50, 0.42, 1); bg.inputs["Strength"].default_value = 0.7
    def light(name, kind, loc, energy, color=(1, 1, 1), size=1.0):
        d = bpy.data.lights.new(name, kind); d.energy = energy; d.color = color
        if kind == "AREA": d.size = size
        if kind == "SUN": d.angle = radians(4)
        o = bpy.data.objects.new(name, d); sc.collection.objects.link(o)
        o.location = g2b(loc); o.rotation_euler = (Vector((0, 0, 0)) - o.location).to_track_quat("-Z", "Y").to_euler()
    light("key", "SUN", (-2.0, 3.0, 2.2), 2.6, (1.0, 0.93, 0.82))
    light("fill", "AREA", (2.5, 1.0, -1.5), 60, (0.75, 0.84, 1.0), 3.0)
    light("rim", "AREA", (1.0, 2.0, -2.5), 90, (1.0, 0.95, 0.85), 2.0)
    fl = bpy.data.meshes.new("floor"); fl.from_pydata([(-9, -9, 0), (9, -9, 0), (9, 9, 0), (-9, 9, 0)], [], [(0, 1, 2, 3)])
    fo = bpy.data.objects.new("floor", fl); sc.collection.objects.link(fo); fo.location = (0, 0, lo[1] - 0.05)
    fm = bpy.data.materials.new("floor")
    next(n for n in fm.node_tree.nodes if n.type == "BSDF_PRINCIPLED").inputs["Base Color"].default_value = (0.62, 0.53, 0.38, 1)
    fl.materials.append(fm)
    cd = bpy.data.cameras.new("cam"); cd.lens = 85; cd.clip_start = 0.05
    cam = bpy.data.objects.new("cam", cd); sc.collection.objects.link(cam); sc.camera = cam
    half = atan(18 / (16 / 9) / cd.lens)
    c = (Vector(lo) + Vector(hi)) / 2; r = (Vector(hi) - Vector(lo)).length / 2
    P = radians(55)
    views = {"left": (-1, 0.05, 0.0), "right": (1, 0.05, 0.0), "q34": (-2.4, 1.15, 1.9), "raid": (-0.94 * cos(P), sin(P), -0.34 * cos(P)), "rq": (1.6, 0.9, -1.8), "top": (-0.05, 1, 0.0)}
    os.makedirs(PREVIEW, exist_ok=True)
    for name, eye in views.items():
        dist = r / sin(half) / 1.45
        cam.location = g2b(c) + g2b(eye).normalized() * dist
        cam.rotation_euler = (g2b(c) - cam.location).to_track_quat("-Z", "Y").to_euler()
        sc.render.filepath = os.path.join(PREVIEW, f"{gid}_{name}.png")
        bpy.ops.render.render(write_still=True)

manifest = json.load(open(MANIFEST)) if os.path.exists(MANIFEST) else {}
for gid in ONLY:
    if gid not in roster.GUNS: raise SystemExit(f"no gun '{gid}' in the roster: {sorted(roster.GUNS)}")
    manifest[gid] = build(gid)
manifest = {k: manifest[k] for k in roster.GUNS if k in manifest}        # roster order
json.dump(manifest, open(MANIFEST, "w"), indent=1)
print("@@JSON@@" + json.dumps({k: manifest[k]["tris"] for k in ONLY}))
