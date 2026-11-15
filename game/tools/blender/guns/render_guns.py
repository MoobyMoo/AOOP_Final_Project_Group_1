"""Eevee review shots of the kit guns from the shipped GLBs: alone, fitted with attachments, and in a monkey's hand.

  blender -b --factory-startup --python-exit-code 1 -P tools/blender/guns/render_guns.py -- <out_dir> [res] [--only id,id]
  python3 tools/blender/guns/sheet_guns.py <out_dir> research/look/guns

Needs tools/blender/build/monkey.blend (run build_monkey.py first; MONKEY_BLEND=<path> points elsewhere). Per gun:
  <id>_34.png    alone, 3/4 from the show side, in the attachment sheets' studio
  <id>_fit.png   the same view with a sight and a muzzle device from attachments.glb parented to socket_sight and
                 socket_muzzle at the identity, which is exactly how the game fits them (a built-in scope is hidden)
  <id>_hand.png  in the businessman's firing hand, at the raid camera: 55 degrees down, the gun aimed to screen-right
                 and a little toward the camera, at the game's GUN_SCALE 0.65, level, at the hand socket (raid.ts)
The Kingpin .45 is shot the same way from kingpin45.blend, so the sheets can show it in its tier.
Writes shots.json: pixels per world unit of the hand shots, for the raid-size insets.
"""
import bpy, json, os, sys
from math import radians, sin, cos, atan, tan
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(HERE, "..", "fauna"))
import shots  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = argv[0]
RES = int(argv[1]) if len(argv) > 1 and argv[1].isdigit() else 480
ONLY = set(argv[argv.index("--only") + 1].split(",")) if "--only" in argv else None
ASPECT = 4 / 3
GUN_SCALE = 0.65
MANIFEST = json.load(open(os.path.join(HERE, "manifest.json")))
MONKEY_BLEND = os.environ.get("MONKEY_BLEND", os.path.join(ROOT, "tools", "blender", "build", "monkey.blend"))
# which pieces each class is shown with: both sights and both muzzle devices get used across the roster
FIT = {"pistol": ("att_sight_holo", "att_muzzle_comp"), "smg": ("att_sight_holo", "att_muzzle_supp"), "ar": ("att_sight_2x", "att_muzzle_comp"),
       "shotgun": ("att_sight_holo", "att_muzzle_comp"), "sniper": ("att_sight_2x", "att_muzzle_supp"), "lmg": ("att_sight_2x", "att_muzzle_comp")}
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
O = bpy.data.objects
sand = shots.stage((int(RES * ASPECT), RES), samples=48)               # the raid look: the game's sun, sky fill, sand
sun, cam, raid_world = O["shot_sun"], O["shot_cam"], sc.world
studio_world = bpy.data.worlds.new("studio")
bg = next(n for n in studio_world.node_tree.nodes if n.type == "BACKGROUND")
bg.inputs["Color"].default_value = (0.55, 0.50, 0.42, 1); bg.inputs["Strength"].default_value = 0.7
def g2b(p): return Vector((p[0], -p[2], p[1]))
STUDIO = []
def light(name, kind, loc, energy, color=(1, 1, 1), size=1.0):
    d = bpy.data.lights.new(name, kind); d.energy = energy; d.color = color
    if kind == "AREA": d.size = size
    if kind == "SUN": d.angle = radians(4)
    o = bpy.data.objects.new(name, d); sc.collection.objects.link(o)
    o.location = g2b(loc); o.rotation_euler = (Vector((0, 0, 0)) - o.location).to_track_quat("-Z", "Y").to_euler()
    STUDIO.append(o)
light("key", "SUN", (-2.0, 3.0, 2.2), 2.6, (1.0, 0.93, 0.82))
light("fill", "AREA", (2.5, 1.0, -1.5), 60, (0.75, 0.84, 1.0), 3.0)
light("rim", "AREA", (1.0, 2.0, -2.5), 90, (1.0, 0.95, 0.85), 2.0)
floor = bpy.data.meshes.new("floor"); floor.from_pydata([(-9, -9, 0), (9, -9, 0), (9, 9, 0), (-9, 9, 0)], [], [(0, 1, 2, 3)])
fo = bpy.data.objects.new("floor", floor); sc.collection.objects.link(fo)
fm = bpy.data.materials.new("floor")
next(n for n in fm.node_tree.nodes if n.type == "BSDF_PRINCIPLED").inputs["Base Color"].default_value = (0.62, 0.53, 0.38, 1)
floor.materials.append(fm)
def use(stage):
    studio = stage == "studio"
    sc.world = studio_world if studio else raid_world
    for o in STUDIO + [fo]: o.hide_render = not studio
    sun.hide_render = sand.hide_render = studio
    for o in MONKEY: o.hide_render = studio or o.type != "MESH"

# ---- the businessman, in his aim pose
obs = shots.append_objects(MONKEY_BLEND, shots.MONKEY)
rig = next(o for o in obs.values() if o.type == "ARMATURE")
MONKEY = list(obs.values())
frame = 1
for tr in rig.animation_data.nla_tracks:
    tr.mute = tr.name != "aim"
    if tr.name == "aim": frame = int(tr.strips[0].frame_start) + 1
sc.frame_set(frame)
bpy.context.view_layer.update()
HAND = rig.matrix_world @ rig.pose.bones["sk_hand_R"].head            # the firing hand's socket, world
print("@@ hand socket at", tuple(round(v, 3) for v in HAND))

# ---- attachments, parked off-stage; copies get parented to the sockets
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, "public", "models", "attachments.glb"))
ATT = {o.name: o for o in bpy.context.selected_objects if o.name.startswith("att_")}
for o in ATT.values(): o.hide_render = True

def meshes_under(root): return [o for o in [root] + list(root.children_recursive) if o.type == "MESH"]
def bounds(objs):
    pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
    lo, hi = Vector(min(p[i] for p in pts) for i in range(3)), Vector(max(p[i] for p in pts) for i in range(3))
    c = (lo + hi) / 2
    return c, max((p - c).length for p in pts), lo

PPU = {}
def shoot34(name, objs, fill=1.3, eye=(-2.4, 1.15, 1.9)):
    use("studio")
    c, r, lo = bounds(objs)
    fo.location = (0, 0, lo.z - 0.02)
    cam.data.sensor_fit = "AUTO"; cam.data.lens = 85; cam.data.clip_start = 0.05
    half = atan(18 / ASPECT / 85)
    dist = r / sin(half) / fill
    cam.location = c + g2b(eye).normalized() * dist
    cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
    sc.render.filepath = os.path.join(OUT, name + ".png"); bpy.ops.render.render(write_still=True)

P = radians(55)
# in the gun's frame: the camera is on the firing hand's side and a little ahead, so the monkey faces screen-right and
# slightly toward it and the gun is clear of his head (aimed the other way the head covers a short gun)
RAID_EYE = Vector((-0.95 * cos(P), sin(P), 0.30 * cos(P))).normalized()
VIEW_H = 3.1                                                                      # world units the hand shot shows, top to bottom
def shoot_hand(name):
    use("raid")
    focus = Vector((HAND.x * 0.4, HAND.y - 0.42, 0.92))
    cam.data.sensor_fit = "VERTICAL"; cam.data.clip_start = 0.5
    cam.data.angle_y = 2 * atan(VIEW_H / 2 / 40)
    cam.location = focus + g2b(RAID_EYE) * 40
    cam.rotation_euler = (focus - cam.location).to_track_quat("-Z", "Y").to_euler()
    PPU[name] = round(RES / VIEW_H, 2)
    sc.render.filepath = os.path.join(OUT, name + ".png"); bpy.ops.render.render(write_still=True)

def run(gid, cls, root, builtin=None, hide=()):
    gun = [o for o in meshes_under(root) if o.name.split(".")[0] not in hide]
    for o in meshes_under(root): o.hide_render = o not in gun
    kids = {o.name.split(".")[0]: o for o in root.children_recursive}
    root.location, root.scale = (0, 0, 0), (1, 1, 1); bpy.context.view_layer.update()
    shoot34(gid + "_34", gun)
    fitted = []
    for piece, socket in zip(FIT[cls], ("socket_sight", "socket_muzzle")):
        c = ATT[piece].copy(); sc.collection.objects.link(c)
        c.parent = kids[socket]; c.matrix_parent_inverse = Matrix.Identity(4); c.matrix_basis = Matrix.Identity(4); c.hide_render = False
        fitted.append(c)
    if builtin: kids[builtin].hide_render = True
    bpy.context.view_layer.update()
    shoot34(gid + "_fit", [o for o in gun if o.name.split(".")[0] != builtin] + fitted)
    for c in fitted: bpy.data.objects.remove(c)
    if builtin: kids[builtin].hide_render = False
    root.location, root.scale = HAND, (GUN_SCALE,) * 3; bpy.context.view_layer.update()   # level, along the aim, at the hand
    shoot_hand(gid + "_hand")

todo = [g for g in MANIFEST if not ONLY or g in ONLY]
for gid in todo:
    before = set(O)
    bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, "public", "models", "guns", gid + ".glb"))
    new = [o for o in O if o not in before]
    root = next(o for o in new if o.parent is None)
    run(gid, MANIFEST[gid]["class"], root, MANIFEST[gid]["extras"].get("builtinSight"))
    for o in new: bpy.data.objects.remove(o)
    print("@@ shot", gid)
if not ONLY or "kingpin45" in ONLY:
    with bpy.data.libraries.load(os.path.join(HERE, "..", "kingpin", "kingpin45.blend")) as (src, dst): dst.objects = list(src.objects)
    for o in dst.objects:
        sc.collection.objects.link(o)
        if o.animation_data:
            for t in o.animation_data.nla_tracks: t.mute = True
    sc.frame_set(frame); bpy.context.view_layer.update()
    run("kingpin45", "pistol", O["kingpin45"], hide=("mag_ext",))
    print("@@ shot kingpin45")
meta_path = os.path.join(OUT, "shots.json")
meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {"px_per_unit": {}}
meta["px_per_unit"].update(PPU); meta["res"] = RES; meta["view_h"] = VIEW_H
json.dump(meta, open(meta_path, "w"), indent=1)
