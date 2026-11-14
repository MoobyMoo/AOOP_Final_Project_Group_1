"""Eevee review renders of the Kingpin .45 from the saved .blend.

  blender -b tools/blender/kingpin/kingpin45.blend --python-exit-code 1 -P tools/blender/kingpin/render_review.py -- <out_dir> [prefix] [res] [mode]

mode: beauty (default) | ao (vertex AO only, flat white) | clay (no palette, no AO). Writes one PNG per view.
Views are named in the game's frame: left = -x (the show side), right = +x (ejection port).
"""
import bpy, os, sys
from math import radians
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = argv[0] if argv else os.path.dirname(bpy.data.filepath)
PREFIX = argv[1] if len(argv) > 1 else "v2_blender"
RES = int(argv[2]) if len(argv) > 2 else 900
MODE = argv[3] if len(argv) > 3 else "beauty"
os.makedirs(OUT, exist_ok=True)

sc = bpy.context.scene
sc.render.engine = "BLENDER_EEVEE"
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = int(RES * 16 / 9), RES, 100
sc.render.image_settings.file_format = "PNG"
sc.render.film_transparent = False
try: sc.view_settings.view_transform = "Standard"
except TypeError: pass
sc.eevee.taa_render_samples = 48

world = bpy.data.worlds.new("review"); sc.world = world
bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
bg.inputs["Color"].default_value = (0.55, 0.50, 0.42, 1); bg.inputs["Strength"].default_value = 0.7

def g2b(p): return Vector((p[0], -p[2], p[1]))
def light(name, kind, loc, energy, color=(1, 1, 1), size=1.0):
    d = bpy.data.lights.new(name, kind); d.energy = energy; d.color = color
    if kind == "AREA": d.size = size
    if kind == "SUN": d.angle = radians(4)
    o = bpy.data.objects.new(name, d); sc.collection.objects.link(o)
    o.location = g2b(loc)
    o.rotation_euler = (Vector((0, 0, 0)) - o.location).to_track_quat("-Z", "Y").to_euler()
    return o
light("key", "SUN", (-2.0, 3.0, 2.2), 2.6, (1.0, 0.93, 0.82))
light("fill", "AREA", (2.5, 1.0, -1.5), 60, (0.75, 0.84, 1.0), 3.0)
light("rim", "AREA", (1.0, 2.0, -2.5), 90, (1.0, 0.95, 0.85), 2.0)

floor = bpy.data.meshes.new("floor")
floor.from_pydata([(-6, -6, 0), (6, -6, 0), (6, 6, 0), (-6, 6, 0)], [], [(0, 1, 2, 3)])
fo = bpy.data.objects.new("floor", floor); sc.collection.objects.link(fo); fo.location = (0, 0, -0.62)
fm = bpy.data.materials.new("floor"); fm.diffuse_color = (0.6, 0.52, 0.38, 1)
next(n for n in fm.node_tree.nodes if n.type == "BSDF_PRINCIPLED").inputs["Base Color"].default_value = (0.62, 0.53, 0.38, 1)
floor.materials.append(fm)

if MODE != "beauty":
    m = bpy.data.materials["MAT_Kingpin"]; nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    for name in ("Base Color", "Roughness", "Metallic"):
        for l in list(bsdf.inputs[name].links): nt.links.remove(l)
    bsdf.inputs["Roughness"].default_value = 0.6; bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Base Color"].default_value = (0.75, 0.75, 0.75, 1)
    if MODE == "ao":
        vc = next(n for n in nt.nodes if n.type == "VERTEX_COLOR")
        nt.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])

cam_d = bpy.data.cameras.new("cam"); cam_d.lens = 85; cam_d.clip_start = 0.05
cam = bpy.data.objects.new("cam", cam_d); sc.collection.objects.link(cam); sc.camera = cam
def shoot(name, eye, target=(0, 0.06, 0.13), lens=85, dist=4.3):
    cam_d.lens = lens
    cam.location = g2b(target) + (g2b(eye) - g2b(target)).normalized() * dist
    cam.rotation_euler = (g2b(target) - cam.location).to_track_quat("-Z", "Y").to_euler()
    sc.render.filepath = os.path.join(OUT, f"{PREFIX}_{name}.png")
    bpy.ops.render.render(write_still=True)
    print("WROTE", sc.render.filepath)

O = bpy.data.objects
for ob in O:                                   # stills come from poses set here, not from the NLA clips
    if ob.animation_data:
        for t in ob.animation_data.nla_tracks: t.mute = True
O["mag_ext"].hide_render = True
views = argv[4].split(",") if len(argv) > 4 else ["left", "right", "top", "front", "rear", "fire", "magout", "ext"]
if "left" in views: shoot("left", (-2.6, 0.75, 1.0))
if "right" in views: shoot("right", (2.6, 0.9, 0.7))
if "top" in views: shoot("top", (0.5, 3.2, 0.0), (0, 0.2, 0.13))
if "front" in views: shoot("front", (-1.1, 0.75, 2.4), (0, 0.2, 0.3))
if "rear" in views: shoot("rear", (-1.2, 1.0, -2.2), (0, 0.15, 0.0))
if "side" in views: shoot("side", (-3.2, 0.1, 0.13))
if "fire" in views:
    O["slide"].location = g2b((0, 0, -0.13))
    shoot("slide_back", (2.2, 1.5, 1.2))
    O["slide"].location = (0, 0, 0)
if "magout" in views:
    O["mag"].location = g2b((-0.05, -0.42, -0.064 - 0.12))
    shoot("mag_out", (-1.6, -1.3, 1.6), (0, -0.2, 0.0))
    O["mag"].location = (0, 0, 0)
if "ext" in views:
    O["mag"].hide_render = True; O["mag_ext"].hide_render = False
    shoot("ext", (-2.6, 0.3, 1.2), (0, 0.0, 0.12))
