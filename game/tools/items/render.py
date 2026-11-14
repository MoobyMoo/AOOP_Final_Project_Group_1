"""Render the icon passes for every model in the library .blend (same camera and lights for all).

  blender -b spikes/items/items.blend --python-exit-code 1 --python tools/items/render.py -- [--only id,id] [--res 512] [--samples 128]

Writes spikes/items/raw/<id>_obj.png (model, transparent) and <id>_shadow.png (contact shadow alpha).
tools/items/compose.py turns those into public/icons and the review sheets.
"""
import math
import os
import sys

import bpy
from mathutils import Euler, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def arg(name, default):
    return argv[argv.index(name) + 1] if name in argv else default


ONLY = set(arg("--only", "").split(",")) - {""}
RES = int(arg("--res", 512))
SAMPLES = int(arg("--samples", 128))
RAW = os.path.join(ROOT, "spikes", "items", "raw")
os.makedirs(RAW, exist_ok=True)

# ---- the one camera: orthographic 3/4 view, 30 degrees down, 28 degrees off the front
CAM_AZ, CAM_EL, CAM_DIST = math.radians(28), math.radians(30), 6.0
FILL_MIN, FILL_MAX = 0.68, 0.88          # share of the frame the longest side takes (small -> big items)
SIZE_MIN, SIZE_MAX = 0.11, 0.50          # metres mapped onto that range (log scale)

scene = bpy.context.scene
scene.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
gpu = False
for backend in ("OPTIX", "CUDA", "HIP", "ONEAPI", "METAL"):
    try:
        prefs.compute_device_type = backend
        prefs.get_devices()
        devs = [d for d in prefs.devices if d.type == backend]
        if devs:
            for d in prefs.devices:
                d.use = d.type == backend
            gpu = True
            break
    except TypeError:
        pass
scene.cycles.device = "GPU" if gpu else "CPU"
print("@@ cycles device:", backend if gpu else "CPU")
scene.cycles.samples = SAMPLES
scene.cycles.use_adaptive_sampling = True
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 4
scene.render.film_transparent = True
scene.render.resolution_x = scene.render.resolution_y = RES
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.image_settings.color_depth = "8"
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "None"
scene.view_settings.exposure = 0.0
scene.view_settings.gamma = 1.0

rig = bpy.data.collections.new("IconRig")
scene.collection.children.link(rig)

cam_data = bpy.data.cameras.new("IconCam")
cam_data.type = "ORTHO"
cam_data.ortho_scale = 1.0
cam_data.clip_start, cam_data.clip_end = 0.1, 50
cam = bpy.data.objects.new("IconCam", cam_data)
rig.objects.link(cam)
view_dir = Vector((math.sin(CAM_AZ) * math.cos(CAM_EL), -math.cos(CAM_AZ) * math.cos(CAM_EL), math.sin(CAM_EL)))
cam.rotation_euler = view_dir.to_track_quat("Z", "Y").to_euler()
scene.camera = cam
right = Vector((math.cos(CAM_AZ), math.sin(CAM_AZ), 0.0))
up = view_dir.cross(right).normalized()
if up.z < 0:
    up = -up


def area(name, loc, size, energy, color):
    data = bpy.data.lights.new(name, "AREA")
    data.shape = "DISK"
    data.size = size
    data.energy = energy
    data.color = color
    ob = bpy.data.objects.new(name, data)
    ob.location = loc
    ob.rotation_euler = Vector(loc).to_track_quat("Z", "Y").to_euler()   # aim at the origin
    rig.objects.link(ob)
    return ob


key = area("Key", (-1.9, -2.3, 3.1), 2.0, 350, (1.0, 0.96, 0.88))
fill = area("Fill", (3.2, -1.6, 0.9), 3.5, 60, (0.8, 0.88, 1.0))
rim = area("Rim", (1.5, 2.9, 2.3), 1.6, 460, (1.0, 0.97, 0.92))
top = area("ShadowTop", (0.0, 0.0, 4.0), 3.0, 300, (1.0, 1.0, 1.0))

world = bpy.data.worlds.new("IconWorld")
scene.world = world
nt = world.node_tree
bg = next(n for n in nt.nodes if n.type == "BACKGROUND")
tc = nt.nodes.new("ShaderNodeTexCoord")
sep = nt.nodes.new("ShaderNodeSeparateXYZ")
rampn = nt.nodes.new("ShaderNodeValToRGB")
mp = nt.nodes.new("ShaderNodeMapRange")
nt.links.new(tc.outputs["Generated"], sep.inputs[0])
nt.links.new(sep.outputs["Z"], mp.inputs["Value"])
mp.inputs["From Min"].default_value = -1.0
mp.inputs["From Max"].default_value = 1.0
nt.links.new(mp.outputs["Result"], rampn.inputs["Fac"])
cr = rampn.color_ramp
cr.elements[0].position, cr.elements[0].color = 0.0, (0.16, 0.13, 0.12, 1)
cr.elements[1].position, cr.elements[1].color = 1.0, (0.62, 0.72, 0.9, 1)
mid = cr.elements.new(0.52)
mid.color = (0.95, 0.93, 0.88, 1)
nt.links.new(rampn.outputs["Color"], bg.inputs["Color"])
bg.inputs["Strength"].default_value = 0.42

pm = bpy.data.meshes.new("ShadowCatcher")
pm.from_pydata([(-20, -20, 0), (20, -20, 0), (20, 20, 0), (-20, 20, 0)], [], [(0, 1, 2, 3)])
plane = bpy.data.objects.new("ShadowCatcher", pm)
plane.is_shadow_catcher = True
rig.objects.link(plane)

models = [o for o in scene.objects if o.type == "MESH" and "kind" in o.keys()]
for o in models:
    o.hide_render = True

for ob in models:
    if ONLY and ob.name not in ONLY:
        continue
    rot = Euler([math.radians(a) for a in ob["icon_rot"]], "XYZ")
    rm = rot.to_matrix()
    pts = [rm @ v.co for v in ob.data.vertices]
    us = [p.dot(right) for p in pts]
    vs = [p.dot(up) for p in pts]
    w, h = max(us) - min(us), max(vs) - min(vs)
    size = max(ob.dimensions)
    k = (math.log(size) - math.log(SIZE_MIN)) / (math.log(SIZE_MAX) - math.log(SIZE_MIN))
    fill_frac = ob.get("icon_fill", FILL_MIN + (FILL_MAX - FILL_MIN) * max(0.0, min(1.0, k)))
    s = fill_frac / max(w, h)
    zmin = min(p.z for p in pts)
    ob.rotation_euler = rot
    ob.scale = (s, s, s)
    ob.location = (0, 0, -zmin * s)
    cu = (max(us) + min(us)) / 2 * s
    cv = (max(vs) + min(vs)) / 2 * s + (-zmin * s) * up.z
    cam.location = right * cu + up * (cv - 0.012) + view_dir * CAM_DIST
    ob.hide_render = False
    # pass 1: the model
    plane.hide_render = True
    ob.visible_camera = True
    for l in (key, fill, rim):
        l.hide_render = False
    top.hide_render = True
    scene.render.filepath = os.path.join(RAW, ob.name + "_obj.png")
    bpy.ops.render.render(write_still=True)
    # pass 2: contact shadow only (soft top light + sky on a shadow catcher)
    plane.hide_render = False
    ob.visible_camera = False
    for l in (key, fill, rim):
        l.hide_render = True
    top.hide_render = False
    scene.render.filepath = os.path.join(RAW, ob.name + "_shadow.png")
    bpy.ops.render.render(write_still=True)
    ob.hide_render = True
    ob.visible_camera = True
    ob.rotation_euler = (0, 0, 0)
    ob.scale = (1, 1, 1)
    ob.location = (0, 0, 0)
    print(f"@@ rendered {ob.name}  fill {fill_frac:.2f}")
