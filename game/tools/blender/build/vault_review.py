"""Review renders of the vault kit (Eevee): every piece alone at a 3/4 view, and a mock of the assembled vault from the
bunker camera (pitch 55, yaw -30, FOV 24) with a monkey for scale.

  blender -b tools/blender/build/blend/vault.blend --python-exit-code 1 -P tools/blender/build/vault_review.py -- <out_dir> [alone|mock|all] [res] [only,names]
  python3 tools/blender/build/vault_sheet.py <out_dir> research/look/vault_v3

The mock places the pieces exactly as home/basebuild.ts does (vault_layout() below mirrors shellLayout() there), so a
seam or a gap that shows here shows in the game. The monkey comes from tools/blender/build/monkey.blend (MONKEY_BLEND
overrides the path); without it the mock renders with a 1.9 m marker post instead.
"""
import bpy, json, os, sys
from math import radians, sin, cos, pi, tan, atan
from mathutils import Vector, Matrix, Euler

HERE = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = argv[0] if argv else "/tmp/vault_shots"
MODE = argv[1] if len(argv) > 1 else "all"
RES = int(argv[2]) if len(argv) > 2 else 640
ONLY = set(argv[3].split(",")) if len(argv) > 3 else None
os.makedirs(OUT, exist_ok=True)
sc = bpy.context.scene
O = bpy.data.objects
ROOTS = {o.name: o for o in O if o.type == "EMPTY" and "asset" in o}


def s2l(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hexc(h):
    h = h.lstrip("#")
    return tuple(s2l(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1,)


# ---------------------------------------------------------------- scene
sc.render.engine = "BLENDER_EEVEE"
sc.render.image_settings.file_format = "PNG"
sc.render.film_transparent = False
try: sc.view_settings.view_transform = "Standard"
except TypeError: pass
try:
    sc.eevee.taa_render_samples = 32
    sc.eevee.use_shadows = True
except Exception: pass
world = bpy.data.worlds.new("vault_review"); sc.world = world
BG = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")


def light(name, kind, loc, energy, color=(1, 1, 1), size=1.0, aim=None):
    d = bpy.data.lights.new(name, kind); d.energy = energy; d.color = color
    if kind == "AREA": d.size = size
    if kind == "SUN": d.angle = radians(4)
    if kind == "POINT": d.shadow_soft_size = 0.3
    ob = bpy.data.objects.new(name, d); sc.collection.objects.link(ob); ob.location = loc
    if aim is not None:
        ob.rotation_euler = (Vector(aim) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    return ob


def camera(name="cam"):
    c = bpy.data.cameras.new(name); c.sensor_fit = "VERTICAL"; c.clip_start = 0.2; c.clip_end = 400
    ob = bpy.data.objects.new(name, c); sc.collection.objects.link(ob); sc.camera = ob
    return ob


def bounds(objs):
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def meshes(root):
    return [c for c in root.children_recursive if c.type == "MESH"]


def render(path, w, h):
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = w, h, 100
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


for m in bpy.data.materials:                                # the kit's emissives are tuned for the game; calm them for stills
    if m.name == "emissive" or m.name.endswith("_emit"):
        next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED").inputs["Emission Strength"].default_value = 1.15


# ---------------------------------------------------------------- each piece alone
def alone():
    BG.inputs["Color"].default_value = hexc("#4a443c"); BG.inputs["Strength"].default_value = 0.9
    cam = camera("alone_cam"); cam.data.angle_y = radians(22)
    key = light("key", "SUN", (0, 0, 10), 3.4, (1.0, 0.93, 0.8), aim=None)
    key.rotation_euler = Vector((0.45, 0.6, -0.75)).to_track_quat("-Z", "Y").to_euler()      # from the front left, above
    fill = light("fill", "SUN", (0, 0, 10), 0.9, (0.75, 0.85, 1.0))
    fill.rotation_euler = Vector((-0.8, 0.3, -0.35)).to_track_quat("-Z", "Y").to_euler()
    me = bpy.data.meshes.new("alone_ground"); s = 60
    me.from_pydata([(-s, -s, 0), (s, -s, 0), (s, s, 0), (-s, s, 0)], [], [(0, 1, 2, 3)])
    gm = bpy.data.materials.new("alone_ground")
    bs = next(n for n in gm.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bs.inputs["Base Color"].default_value = hexc("#5a5248"); bs.inputs["Roughness"].default_value = 1.0
    me.materials.append(gm)
    ground = bpy.data.objects.new("alone_ground", me); sc.collection.objects.link(ground)
    everything = [m for r in ROOTS.values() for m in meshes(r)]
    info = {}
    for name, root in sorted(ROOTS.items()):
        if ONLY and name not in ONLY:
            continue
        mine = meshes(root)
        for m in everything:
            m.hide_render = m not in mine
        lo, hi = bounds(mine)
        ground.location.z = min(0.0, lo.z) - 0.002
        c, rad = (lo + hi) / 2, max((hi - lo).length / 2, 0.05)
        d = Vector((0.62, -1.0, 0.62)).normalized()               # 3/4: from the front right, above
        dist = rad / sin(radians(22) / 2) * 1.04
        cam.location = c + d * dist
        cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
        render(os.path.join(OUT, f"alone_{name}.png"), RES, RES)
        info[name] = {"tris": int(root.get("tris", 0)), "size": [round(v, 2) for v in (hi - lo)], "nodes": sorted({c.get("part") for c in root.children_recursive if c.get("kind") in ("part", "point")})}
    for m in everything:
        m.hide_render = False
    for o in (cam, key, fill, ground):
        bpy.data.objects.remove(o)
    json.dump(info, open(os.path.join(OUT, "alone.json"), "w"), indent=1)


# ---------------------------------------------------------------- the mock vault
sys.path.insert(0, HERE)
from vault_layout import X0, X1, Z0, Z1, SCONCES_N, SCONCES_E, STARTERS, BUILT, vault_layout, centre


def instance(name, gx, gz, quarter=0.0, sx=1.0, y=0.0, coll=None):
    """a linked copy of an asset at game (x, z), turned by quarter-turns about the vertical"""
    src = ROOTS[name]
    root = bpy.data.objects.new(f"i_{name}", None)
    (coll or sc.collection).objects.link(root)
    root.location = (gx, -gz, y); root.rotation_euler = (0, 0, quarter * pi / 2); root.scale = (sx, 1, 1)

    def copy(ob, parent):
        for ch in ob.children:
            n = bpy.data.objects.new("i_" + ch.name, ch.data)
            (coll or sc.collection).objects.link(n)
            n.parent = parent; n.matrix_parent_inverse = Matrix.Identity(4)
            n.location, n.rotation_euler, n.scale = ch.location, ch.rotation_euler, ch.scale
            copy(ch, n)
    copy(src, root)
    return root


def monkey(gx, gz, yaw=0.0):
    path = os.environ.get("MONKEY_BLEND", os.path.join(HERE, "monkey.blend"))
    want = ["p_head", "p_hands", "p_tail", "p_ears_round", "p_eyes_round", "p_lids_round", "p_brows_bold", "p_mouth_smile", "p_torso_suit", "p_front_two", "p_tie_tie", "p_feet_round"]
    root = bpy.data.objects.new("mock_monkey", None); sc.collection.objects.link(root)
    root.location = (gx, -gz, 0); root.rotation_euler = (0, 0, yaw)
    if os.path.exists(path):
        with bpy.data.libraries.load(path) as (src, dst):
            dst.objects = [n for n in src.objects if n in want]
        for ob in dst.objects:
            sc.collection.objects.link(ob)
            for m in list(ob.modifiers):
                ob.modifiers.remove(m)
            ob.parent = root; ob.matrix_parent_inverse = Matrix.Identity(4)
        return root
    me = bpy.data.meshes.new("marker")
    me.from_pydata([(-0.3, -0.3, 0), (0.3, -0.3, 0), (0.3, 0.3, 0), (-0.3, 0.3, 0), (-0.3, -0.3, 1.9), (0.3, -0.3, 1.9), (0.3, 0.3, 1.9), (-0.3, 0.3, 1.9)], [], [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)])
    ob = bpy.data.objects.new("marker", me); sc.collection.objects.link(ob); ob.parent = root
    return root


def mock():
    for r in ROOTS.values():
        for m in meshes(r):
            m.hide_render = True
    BG.inputs["Color"].default_value = hexc("#1d1a17"); BG.inputs["Strength"].default_value = 1.0
    for (name, gx, gz, q, sx) in vault_layout():
        instance(name, gx, gz, q, sx)
    for x in SCONCES_N:
        instance("vault_sconce", x, Z0 - 0.012, 0, 1, 2.5)
        light("sl", "POINT", (x, -(Z0 + 1.2), 3.4), 900, (1.0, 0.81, 0.58))
    for z in SCONCES_E:
        instance("vault_sconce", X1 + 0.012, z, -1, 1, 2.5)
        light("sl", "POINT", (X1 - 1.2, -z, 3.4), 900, (1.0, 0.81, 0.58))
    for (x, z) in ((-6, 2), (6, 2), (-13, 6), (-13, -4)):
        light("fl", "POINT", (x, -z, 5), 1500, (1.0, 0.84, 0.66))
    sun = light("sun", "SUN", (0, 0, 20), 1.6, (1.0, 0.9, 0.75))
    th, el = radians(160), radians(50)
    d3 = Vector((cos(el) * sin(th), sin(el), cos(el) * cos(th)))
    sun.rotation_euler = Vector((d3.x, -d3.z, d3.y)).to_track_quat("Z", "Y").to_euler()
    amb = bpy.data.worlds.new("mock_amb")
    cam = camera("mock_cam"); cam.data.angle_y = radians(24)

    def shoot(tag, focus, dist, w=1600, h=900):
        f = Vector((focus[0], -focus[1], 0.5))
        p, y = radians(55), radians(-30)
        off = Vector((dist * cos(p) * sin(y), dist * sin(p), dist * cos(p) * cos(y)))
        cam.location = f + Vector((off.x, -off.z, off.y))
        cam.rotation_euler = (f - cam.location).to_track_quat("-Z", "Y").to_euler()
        render(os.path.join(OUT, f"mock_{tag}.png"), w, h)

    built = []
    for (name, w, d, x, z, r) in STARTERS:
        if name in ROOTS:
            cx, cz = centre(w, d, x, z, r); instance(name, cx, cz, r)
    mk = monkey(0, -8.2)
    BG.inputs["Strength"].default_value = 1.0
    world_fill = light("hemi", "SUN", (0, 0, 30), 0.55, (0.9, 0.93, 1.0))
    world_fill.rotation_euler = (0, 0, 0)
    shoot("empty_spawn", (0, -9.4), 32)
    shoot("empty_wide", (0, -2), 74)
    if MODE == "mock-empty":
        return
    for (name, w, d, x, z, r) in BUILT:
        if name in ROOTS:
            cx, cz = centre(w, d, x, z, r); built.append(instance(name, cx, cz, r))
    shoot("built_spawn", (0, -9.4), 32)
    shoot("built_wide", (0, -2), 74)
    shoot("built_west", (-10, -8.5), 32)
    shoot("built_east", (11, -7.5), 32)
    shoot("built_door", (7.5, -10), 24)


if MODE in ("alone", "all"):
    alone()
if MODE in ("mock", "mock-empty", "all"):
    mock()
print("@@DONE@@", OUT)
