"""Review-render stage shared by the fauna and container sheets (Blender 5.2, headless, Eevee).

The stage is the kit's review_render look (tools/blender/build/lib.py): the game's sun (azimuth 160, elevation 50),
a sky fill, sand ground. Two cameras: `raid` is the gameplay camera (pitch 55, yaw -30, FOV 24) and `q34` a low 3/4.
"""
import math
import os

import bpy
from mathutils import Vector

SAND, WATER = (0.79, 0.70, 0.51), (0.16, 0.42, 0.44)


def _lin(c):
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


def stage(res=(640, 560), ground=SAND, samples=32, water=None):
    """water: depth of the bed under a translucent water surface at z = 0 (the crocodile's stage); None = dry ground"""
    sc = bpy.context.scene
    for n in ("shot_ground", "shot_sun", "shot_cam", "shot_water"):
        o = bpy.data.objects.get(n)
        if o:
            bpy.data.objects.remove(o)
    me = bpy.data.meshes.new("shot_ground")
    s = 80
    me.from_pydata([(-s, -s, 0), (s, -s, 0), (s, s, 0), (-s, s, 0)], [], [(0, 1, 2, 3)])
    gm = bpy.data.materials.new("shot_ground")
    bs = next(n for n in gm.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bs.inputs["Base Color"].default_value = (*_lin(ground), 1)
    bs.inputs["Roughness"].default_value = 0.95
    me.materials.append(gm)
    gob = bpy.data.objects.new("shot_ground", me)
    sc.collection.objects.link(gob)
    gob.location.z = -0.002 if water is None else -water
    if water is not None:
        wm = bpy.data.materials.new("shot_water")
        ws = next(n for n in wm.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        ws.inputs["Base Color"].default_value = (*_lin(WATER), 1)
        ws.inputs["Roughness"].default_value = 1.0
        ws.inputs["Specular IOR Level"].default_value = 0.0
        ws.inputs["Alpha"].default_value = 0.62
        try:
            wm.surface_render_method = "BLENDED"
        except Exception:
            wm.blend_method = "BLEND"
        wme = bpy.data.meshes.new("shot_water")
        wme.from_pydata([(-s, -s, 0), (s, -s, 0), (s, s, 0), (-s, s, 0)], [], [(0, 1, 2, 3)])
        wme.materials.append(wm)
        wob = bpy.data.objects.new("shot_water", wme)
        wob.visible_shadow = False
        sc.collection.objects.link(wob)
    sun = bpy.data.lights.new("shot_sun", "SUN")
    sun.energy, sun.color, sun.angle = 4.2, (1.0, 0.88, 0.69), math.radians(3)
    so = bpy.data.objects.new("shot_sun", sun)
    sc.collection.objects.link(so)
    th, el = math.radians(160), math.radians(50)
    d3 = Vector((math.cos(el) * math.sin(th), math.sin(el), math.cos(el) * math.cos(th)))
    so.rotation_euler = Vector((d3.x, -d3.z, d3.y)).to_track_quat("Z", "Y").to_euler()
    w = bpy.data.worlds.new("shot_world")
    sc.world = w
    bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.62, 0.72, 1.0, 1)
    bg.inputs["Strength"].default_value = 0.75
    cam = bpy.data.cameras.new("shot_cam")
    cam.sensor_fit = "VERTICAL"
    cam.clip_start, cam.clip_end = 0.5, 300
    co = bpy.data.objects.new("shot_cam", cam)
    sc.collection.objects.link(co)
    sc.camera = co
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.film_transparent = False
    sc.render.image_settings.file_format = "PNG"
    try:
        sc.view_settings.view_transform = "Standard"
    except TypeError:
        pass
    try:
        sc.eevee.use_shadows = True
        sc.eevee.taa_render_samples = samples
    except Exception:
        pass
    return gob


def aim(view, focus, dist):
    """view: 'raid' (pitch 55, yaw -30, FOV 24: the game camera) or 'q34' (pitch 16, yaw 38, FOV 30)"""
    cam = bpy.context.scene.camera
    pitch, yaw, fov = {"raid": (55, -30, 24), "q34": (16, 38, 30), "side": (8, 90, 30), "front": (10, 0, 30), "top": (89, 0, 24)}[view]
    cam.data.angle_y = math.radians(fov)
    p, y = math.radians(pitch), math.radians(yaw)
    off3 = Vector((dist * math.cos(p) * math.sin(y), dist * math.sin(p), dist * math.cos(p) * math.cos(y)))   # three.js axes
    f = Vector(focus)
    cam.location = f + Vector((off3.x, -off3.z, off3.y))
    cam.rotation_euler = (f - cam.location).to_track_quat("-Z", "Y").to_euler()


def shoot(path):
    sc = bpy.context.scene
    sc.render.filepath = path
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.render.render(write_still=True)
    return path


def append_objects(blend, names):
    """append objects (and their data) from another .blend; returns {name: object}"""
    with bpy.data.libraries.load(blend, link=False) as (src, dst):
        dst.objects = [n for n in src.objects if n in names]
    out = {}
    for o in dst.objects:
        bpy.context.scene.collection.objects.link(o)
        out[o.name] = o
    return out


MONKEY = ["MonkeyRig", "p_head", "p_hands", "p_tail", "p_ears_round", "p_eyes_round", "p_lids_round", "p_brows_bold", "p_mouth_smile", "p_torso_suit", "p_front_two",
          "p_tie_tie", "p_feet_round"]


def monkey(blend, at=(0, 0, 0), yaw=0.0):
    """the businessman from tools/blender/build/monkey.blend, standing in his idle pose: the scale reference (1.9 m)"""
    obs = append_objects(blend, MONKEY)
    rig = next(o for o in obs.values() if o.type == "ARMATURE")
    ad = rig.animation_data
    if ad:
        for tr in ad.nla_tracks:
            tr.mute = tr.name != "idle"
    rig.location = at
    rig.rotation_euler = (0, 0, yaw)
    rig.hide_render = True
    return rig
