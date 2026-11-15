"""Eevee review shots of the Kingpin's attachments, alone and fitted on the gun through its sockets.

  blender -b tools/blender/kingpin/kingpin45.blend --python-exit-code 1 -P tools/blender/kingpin/render_attachments.py -- <out_dir> [res]
  python3 tools/blender/kingpin/sheet_attachments.py <out_dir> research/look/attachments

Appends every att_* object from attachments.blend and parents it to its socket empty with an identity transform, which
is exactly what the game does, so a piece that sits wrong here sits wrong in the game. Per attachment: <id>_alone.png
(3/4, gun hidden), <id>_game.png (the raid camera's 55 degree pitch, one framing for every row) and <id>_34.png (3/4,
fitted). Also bare_*.png (no attachments), two full loadouts, and shots.json (pixels per gun unit of every shot, so
the sheet can show the gameplay view at the size the raid draws it). Prints the fitted bounds as `@@JSON@@{...}`.
"""
import bpy, json, os, sys
from math import radians, sin, cos, atan, tan
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = argv[0] if argv else os.path.join(HERE, "shots")
RES = int(argv[1]) if len(argv) > 1 else 600
ASPECT = 4 / 3
os.makedirs(OUT, exist_ok=True)

FIT = {"att_sight_holo": "socket_sight", "att_sight_2x": "socket_sight", "att_muzzle_comp": "socket_muzzle", "att_muzzle_supp": "socket_muzzle",
       "att_mag_ext": "socket_mag", "att_laser": "socket_rail"}
LOADOUTS = {"loadout_a": ["att_sight_holo", "att_muzzle_supp", "att_mag_ext", "att_laser"], "loadout_b": ["att_sight_2x", "att_muzzle_comp", "att_laser"]}

sc = bpy.context.scene
with bpy.data.libraries.load(os.path.join(HERE, "attachments.blend")) as (src, dst):
    dst.objects = [n for n in src.objects if n in FIT]
O = bpy.data.objects
ATT = {}
for ob in dst.objects:
    sc.collection.objects.link(ob)
    ob.parent = O[FIT[ob.name]]
    ob.matrix_parent_inverse = Matrix.Identity(4)
    ob.matrix_basis = Matrix.Identity(4)                # identity on the socket: fitted
    ATT[ob.name] = ob
for ob in O:                                            # stills come from the rest pose, not from the NLA clips
    if ob.animation_data:
        for t in ob.animation_data.nla_tracks: t.mute = True
O["mag_ext"].hide_render = True                         # the extension hangs under the standard magazine
GUN = [O[n] for n in ("frame", "slide", "hammer", "trigger", "mag")]
bpy.context.view_layer.update()

sc.render.engine = "BLENDER_EEVEE"
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = int(RES * ASPECT), RES, 100
sc.render.image_settings.file_format = "PNG"
sc.render.film_transparent = False
try: sc.view_settings.view_transform = "Standard"
except TypeError: pass
sc.eevee.taa_render_samples = 48
world = bpy.data.worlds.new("review"); sc.world = world
bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
bg.inputs["Color"].default_value = (0.55, 0.50, 0.42, 1); bg.inputs["Strength"].default_value = 0.7

def g2b(p): return Vector((p[0], -p[2], p[1]))
def b2g(v): return Vector((v.x, v.z, -v.y))
def light(name, kind, loc, energy, color=(1, 1, 1), size=1.0):
    d = bpy.data.lights.new(name, kind); d.energy = energy; d.color = color
    if kind == "AREA": d.size = size
    if kind == "SUN": d.angle = radians(4)
    o = bpy.data.objects.new(name, d); sc.collection.objects.link(o)
    o.location = g2b(loc)
    o.rotation_euler = (Vector((0, 0, 0)) - o.location).to_track_quat("-Z", "Y").to_euler()
light("key", "SUN", (-2.0, 3.0, 2.2), 2.6, (1.0, 0.93, 0.82))
light("fill", "AREA", (2.5, 1.0, -1.5), 60, (0.75, 0.84, 1.0), 3.0)
light("rim", "AREA", (1.0, 2.0, -2.5), 90, (1.0, 0.95, 0.85), 2.0)
floor = bpy.data.meshes.new("floor")
floor.from_pydata([(-9, -9, 0), (9, -9, 0), (9, 9, 0), (-9, 9, 0)], [], [(0, 1, 2, 3)])
fo = bpy.data.objects.new("floor", floor); sc.collection.objects.link(fo)
fm = bpy.data.materials.new("floor")
next(n for n in fm.node_tree.nodes if n.type == "BSDF_PRINCIPLED").inputs["Base Color"].default_value = (0.62, 0.53, 0.38, 1)
floor.materials.append(fm)

cam_d = bpy.data.cameras.new("cam"); cam_d.lens = 85; cam_d.clip_start = 0.05
cam = bpy.data.objects.new("cam", cam_d); sc.collection.objects.link(cam); sc.camera = cam
HALF_V = atan(18 / ASPECT / cam_d.lens)                 # half the vertical field of view (36 mm sensor across)

def bounds(obs):
    """(centre, radius, lowest y) in the gun frame"""
    pts = [b2g(ob.matrix_world @ v.co) for ob in obs for v in ob.data.vertices]
    lo, hi = Vector(min(p[i] for p in pts) for i in range(3)), Vector(max(p[i] for p in pts) for i in range(3))
    c = (lo + hi) / 2
    return c, max((p - c).length for p in pts), lo.y, lo, hi

PPU = {}
def shoot(name, eye, obs, fill=0.9, floor_y=None, frame=None):
    for ob in GUN + list(ATT.values()): ob.hide_render = ob not in obs
    c, r, low, _, _ = bounds(frame or obs)
    fo.location = (0, 0, (low - 0.012) if floor_y is None else floor_y)
    dist = r / sin(HALF_V) / fill
    cam.location = g2b(c) + g2b(eye).normalized() * dist
    PPU[name] = round(RES / 2 / (dist * tan(HALF_V)), 2)                   # pixels per gun unit at the framed centre
    cam.rotation_euler = (g2b(c) - cam.location).to_track_quat("-Z", "Y").to_euler()
    sc.render.filepath = os.path.join(OUT, name + ".png")
    bpy.ops.render.render(write_still=True)
    print("WROTE", sc.render.filepath)

# the raid camera: 55 degrees down, the gun aimed to screen-right and a little away (src/game/core/raid.ts CAMERA)
P = radians(55)
GAME = (-0.94 * cos(P), sin(P), -0.34 * cos(P))
THREEQ = (-2.4, 1.15, 1.9)                              # the show side, front quarter
ALONE = {"att_mag_ext": (-2.2, 0.9, 1.8), "att_laser": (-2.0, 0.5, 2.3)}
EVERY = GUN + [ATT["att_muzzle_supp"], ATT["att_mag_ext"], ATT["att_sight_2x"]]   # one framing for all the fitted shots
FLOOR, FILL = -0.66, 1.42                                # FILL > 1: the bounding sphere is a loose fit on a long gun

report = {}
shoot("bare_game", GAME, GUN, FILL, FLOOR, EVERY)
shoot("bare_34", THREEQ, GUN, FILL, FLOOR, EVERY)
for name, ob in ATT.items():
    c, r, low, lo, hi = bounds([ob])
    report[name] = {"socket": FIT[name], "tris": sum(len(p.vertices) - 2 for p in ob.data.polygons), "min": [round(v, 4) for v in lo], "max": [round(v, 4) for v in hi]}
    shoot(name + "_alone", ALONE.get(name, THREEQ), [ob], 0.8)
    shoot(name + "_game", GAME, GUN + [ob], FILL, FLOOR, EVERY)
    shoot(name + "_34", THREEQ, GUN + [ob], FILL, FLOOR, EVERY)
for name, ids in LOADOUTS.items():
    shoot(name + "_game", GAME, GUN + [ATT[i] for i in ids], FILL, FLOOR, EVERY)
    shoot(name + "_34", THREEQ, GUN + [ATT[i] for i in ids], FILL, FLOOR, EVERY)
json.dump({"res": RES, "px_per_unit": PPU, "fitted_bounds": report}, open(os.path.join(OUT, "shots.json"), "w"), indent=1)
print("@@JSON@@" + json.dumps(report))
