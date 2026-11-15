"""Kingpin .45 attachments: six bolt-on pieces, our own designs, built entirely by this script.

  blender -b --factory-startup --python-exit-code 1 -P tools/blender/kingpin/build_attachments.py

Writes public/models/attachments.glb (the game asset) and tools/blender/kingpin/attachments.blend (source of record
for renders and QA). Prints one line of metrics as `@@JSON@@{...}`.

One root node per attachment, origin at its mount point and axes the gun's (x right, y up, z along the bore), so a
piece dropped on its socket in kingpin45.glb with an identity transform is fitted:

  att_sight_holo, att_sight_2x     -> socket_sight   (rides the slide)
  att_muzzle_comp, att_muzzle_supp -> socket_muzzle  (rides the body; `muzzle` property = the new flash point)
  att_mag_ext                      -> socket_mag     (rides the magazine; sits under the standard magazine)
  att_laser                        -> socket_rail    (rides the body; `emit` property = where the beam leaves)

Each part below is written in the gun's frame at its real place on the gun, then moved to its socket by build().
Shading is the Kingpin's (kp_common.py): the same palette texture and material, ambient occlusion in COLOR_0. The
reflex sight's dot and the laser's emitter are separate emissive materials, `sight_dot` and `laser_emit`.
"""
import bpy, json, os, sys
from math import radians
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import kp_common as K
from kp_common import M, RAKE, BORE_Y, SOCKETS, outline, prism, lathe, box, bevel, bevel_all, cut, mirror_x, move, join, bake_ao

ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OUT_GLB = os.path.join(ROOT, "public", "models", "attachments.glb")
OUT_BLEND = os.path.join(HERE, "attachments.blend")
TRI_BUDGET, TRI_BUDGET_ALL = 1500, 6000
FLASH_LEAD = 0.033                       # the gun's own `muzzle` node sits this far ahead of the barrel's crown

scene = K.reset()

SIGHT, MUZZLE, MAG, RAIL = (Vector(SOCKETS[n][0]) for n in ("socket_sight", "socket_muzzle", "socket_mag", "socket_rail"))
TOP = SIGHT.y                            # top of the slide
def mag_front(y): return 0.040 + RAKE * (y + 0.3)
def mag_back(y): return -0.190 + RAKE * (y + 0.3)

def build(name, socket, parts, **props):
    """join the parts, move them from the gun frame into the socket's, and tag the node"""
    for ob in parts: move(ob, lambda c: c - socket)
    ob = join(name, parts)
    for k, v in props.items(): ob[k] = v
    return ob

def rim(w, seg=1):
    """bevel the rims of a prism extruded along z or x (the edges lying in its two caps)"""
    return lambda axis: (lambda a, b, ang: w if abs(getattr(a, axis) - getattr(b, axis)) < 1e-5 and ang > radians(40) else 0)

def slide_mount(parts, z0, z1, zb, hw=0.058):
    """what both sights stand on: a base plate sunk into the top of the slide, two claws over its chamfers and a gold
    cross-bolt through them"""
    parts.append(bevel_all(box("base", (-hw, TOP - 0.005, z0), (hw, TOP + 0.026, z1), M.graphite), 0.006))
    for sx in (-1, 1):
        parts.append(bevel_all(box("claw", (sx * 0.066 - 0.013, TOP - 0.032, zb - 0.045), (sx * 0.066 + 0.013, TOP + 0.020, zb + 0.045), M.graphite), 0.005))
    parts.append(lathe("bolt", [(-0.089, 0), (-0.089, 0.0105), (-0.085, 0.0145), (0.085, 0.0145), (0.089, 0.0105), (0.089, 0)], zb, TOP - 0.004, "x", 8, [M.gold] * 5))

# ================================================================================================ sights
def build_holo():
    """compact open reflex: a low housing at the back, an arched window at the front, a tinted lens and a lit dot"""
    parts, z = [], SIGHT.z
    slide_mount(parts, z - 0.125, z + 0.105, z - 0.012)
    parts.append(bevel_all(box("housing", (-0.052, TOP + 0.020, z - 0.125), (0.052, TOP + 0.064, z - 0.038), M.gunmetal), 0.007))
    parts.append(lathe("cap", [(TOP + 0.055, 0), (TOP + 0.055, 0.025), (TOP + 0.071, 0.025), (TOP + 0.076, 0.020), (TOP + 0.076, 0)], 0, z - 0.082, "y", 8, [M.gold] * 4))
    # the window: a thin arch across the bore, cut through. Thin on purpose: the raid camera looks down at 55 degrees,
    # and a deep hood would hide the glass and the dot behind its own roof.
    hood = prism("hood", outline([(-0.072, TOP + 0.018), (0.072, TOP + 0.018), (0.072, TOP + 0.174, 0.036), (-0.072, TOP + 0.174, 0.036)], 3), z + 0.056, z + 0.094, "z", M.gunmetal)
    bevel(hood, rim(0.007)("z"))
    cut(hood, prism("window", outline([(-0.049, TOP + 0.046), (0.049, TOP + 0.046), (0.049, TOP + 0.150, 0.022), (-0.049, TOP + 0.150, 0.022)], 2), z + 0.03, z + 0.12, "z", M.dark))
    parts.append(hood)
    parts.append(box("lens", (-0.053, TOP + 0.042, z + 0.067), (0.053, TOP + 0.154, z + 0.083), M.lens))
    parts.append(lathe("dot", [(z + 0.061, 0), (z + 0.061, 0.013), (z + 0.089, 0.013), (z + 0.089, 0)], 0, TOP + 0.098, "z", 8, [M.sight_dot] * 3))   # through the lens: lit from both ends
    # cheeks: a wedge each side from the housing up to the window
    cheek = prism("cheek", [(z - 0.046, TOP + 0.022), (z + 0.064, TOP + 0.022), (z + 0.064, TOP + 0.130), (z - 0.046, TOP + 0.060)], 0.054, 0.068, "x", M.gunmetal)   # inner face buried in the hood wall, clear of the window
    parts += [cheek, mirror_x(cheek, "cheek_l")]
    return build("att_sight_holo", SIGHT, parts)

def build_2x():
    """short 2x tube scope: a flared objective, a fat eyepiece, two gold rings on pedestals, two turrets"""
    parts, z, ty = [], SIGHT.z, TOP + 0.120          # ty: the tube's axis
    slide_mount(parts, z - 0.135, z + 0.085, z - 0.025, 0.048)
    for zc in (z - 0.098, z + 0.042):
        parts.append(bevel_all(box("pedestal", (-0.029, TOP + 0.018, zc - 0.025), (0.029, ty - 0.035, zc + 0.025), M.gunmetal), 0.005))
        parts.append(lathe("ring", [(zc - 0.021, 0), (zc - 0.021, 0.058), (zc - 0.015, 0.065), (zc + 0.015, 0.065), (zc + 0.021, 0.058), (zc + 0.021, 0)], 0, ty, "z", 12, [M.gold] * 5))
    G, D, L = M.gunmetal, M.dark, M.lens
    parts.append(lathe("tube", [(z - 0.240, 0), (z - 0.240, 0.048), (z - 0.250, 0.049), (z - 0.250, 0.058), (z - 0.243, 0.065), (z - 0.186, 0.065), (z - 0.166, 0.047),
                                (z + 0.076, 0.047), (z + 0.106, 0.069), (z + 0.178, 0.069), (z + 0.186, 0.061), (z + 0.186, 0.055), (z + 0.174, 0.054), (z + 0.174, 0)],
                       0, ty, "z", 12, [L, D, G, G, G, G, G, G, G, G, G, D, L]))
    zt = z - 0.028
    parts.append(lathe("turret_top", [(ty + 0.030, 0), (ty + 0.030, 0.030), (ty + 0.070, 0.030), (ty + 0.078, 0.024), (ty + 0.078, 0)], 0, zt, "y", 8, [G, G, M.gold, M.gold]))
    parts.append(lathe("turret_side", [(0.030, 0), (0.030, 0.028), (0.078, 0.028), (0.086, 0.022), (0.086, 0)], zt, ty, "x", 8, [G, G, M.gold, M.gold]))
    return build("att_sight_2x", SIGHT, parts)

# ================================================================================================ muzzle devices
def lock_collar(z):
    """the gold nut both muzzle devices screw down against; it swallows the barrel's crown"""
    return lathe("collar", [(z - 0.019, 0), (z - 0.019, 0.055), (z - 0.012, 0.062), (z + 0.012, 0.062), (z + 0.012, 0)], 0, BORE_Y, "z", 12, [M.gold] * 4)

def build_comp():
    """slotted compensator: a steel block the section of the slide, three slots across the top, two ports a side"""
    z, y, tip = MUZZLE.z, BORE_Y, 0.215
    parts = [lock_collar(z)]
    blk = prism("block", outline([(-0.088, y - 0.078, 0.022), (0.088, y - 0.078, 0.022), (0.088, y + 0.084, 0.032), (-0.088, y + 0.084, 0.032)], 2), z + 0.004, z + tip, "z", M.steel)
    bevel(blk, rim(0.009)("z"))
    for zc in (0.053, 0.105, 0.157):                                # slots across the top
        cut(blk, box("slot", (-0.056, y + 0.048, z + zc - 0.014), (0.056, y + 0.13, z + zc + 0.014), M.dark))
    for sx in (-1, 1):                                              # ports in each flank
        for zc in (0.079, 0.143):
            cut(blk, box("port", (min(sx * 0.058, sx * 0.13), y - 0.030, z + zc - 0.021), (max(sx * 0.058, sx * 0.13), y + 0.026, z + zc + 0.021), M.dark))
    cut(blk, lathe("bore", [(z + tip - 0.034, 0), (z + tip - 0.034, 0.034), (z + tip + 0.03, 0.034), (z + tip + 0.03, 0)], 0, y, "z", 12, [M.dark] * 3))
    parts.append(blk)
    return build("att_muzzle_comp", MUZZLE, parts, muzzle=[0.0, 0.0, round(tip + FLASH_LEAD, 4)])

def build_supp():
    """fat suppressor can: three dark cooling grooves at the back, a raised gold band at the front, a recessed bore"""
    z, tip, R = MUZZLE.z, 0.480, 0.100
    C, D, Au = M.graphite, M.dark, M.gold
    prof = [(0.006, 0), (0.006, R - 0.022), (0.024, R), (0.062, R)]
    mats = [C, C, C]
    for g in (0.062, 0.108, 0.154):                                 # groove: wall, floor, wall, then the land after it
        prof += [(g + 0.004, R - 0.011), (g + 0.019, R - 0.011), (g + 0.023, R), (g + 0.046, R)]
        mats += [D, D, D, C]
    prof += [(0.380, R), (0.384, R + 0.007), (0.426, R + 0.007), (0.430, R), (0.460, R), (tip, R - 0.018), (tip, 0.042), (tip - 0.032, 0.038), (tip - 0.032, 0)]
    mats += [C, Au, Au, Au, C, C, D, D, D]
    can = lathe("can", [(z + a, r) for a, r in prof], 0, BORE_Y, "z", 16, mats)
    return build("att_muzzle_supp", MUZZLE, [lock_collar(z), can], muzzle=[0.0, 0.0, round(tip + FLASH_LEAD, 4)])

# ================================================================================================ magazine
def build_mag_ext():
    """magazine extension: a sleeve that swallows the standard magazine's baseplate, a length of magazine body with
    witness holes, and the banana baseplate. It hangs under the standard magazine (it does not replace it)."""
    parts = []
    sleeve = prism("sleeve", outline([(-0.252, -0.330, 0.014), (0.104, -0.330, 0.014), (0.098, -0.398, 0.018), (-0.256, -0.398, 0.018)], 2), -0.099, 0.099, "x", M.gunmetal)
    parts.append(bevel(sleeve, lambda a, b, ang: 0.010 if abs(a.x - b.x) < 1e-5 else 0, 2))
    y0, y1 = -0.385, -0.500
    body = prism("ext_body", [(mag_front(y0), y0), (mag_front(y1), y1), (mag_back(y1), y1), (mag_back(y0), y0)], -0.05, 0.05, "x", M.steel)
    parts.append(bevel(body, lambda a, b, ang: 0.008 if ang > radians(30) and abs(a.x - b.x) < 1e-5 and abs(a.y - b.y) > 0.08 else 0))
    for sx in (-1, 1):                                              # witness holes
        for y in (-0.424, -0.464):
            zc = (mag_front(y) + mag_back(y)) / 2 - 0.02
            parts.append(box("witness", (sx * 0.0505 - 0.003, y - 0.0085, zc - 0.014), (sx * 0.0505 + 0.003, y + 0.0085, zc + 0.014), M.dark))
    plate = prism("plate", outline([(-0.268, -0.492, 0.022), (0.090, -0.492, 0.022), (0.078, -0.580, 0.03), (-0.274, -0.580, 0.03)], 2), -0.099, 0.099, "x", M.banana)
    parts.append(bevel(plate, lambda a, b, ang: 0.016 if abs(a.x - b.x) < 1e-5 else 0, 2))
    return build("att_mag_ext", MAG, parts)

# ================================================================================================ rail
def build_laser():
    """under-rail laser module: a clamp over the rail lugs, a chunky body, a gold emitter bezel and the lit emitter"""
    parts, ey, ez = [], 0.016, 0.700                                # the emitter's axis and its front face
    parts.append(bevel_all(box("clamp", (-0.084, 0.066, 0.425), (0.084, 0.120, 0.596), M.graphite), 0.007))
    parts.append(bevel_all(box("body", (-0.090, -0.046, 0.432), (0.090, 0.078, 0.622), M.gunmetal), 0.012))
    parts.append(lathe("bolt", [(-0.098, 0), (-0.098, 0.0105), (-0.094, 0.0145), (0.094, 0.0145), (0.098, 0.0105), (0.098, 0)], 0.510, 0.096, "x", 8, [M.gold] * 5))
    parts.append(lathe("bezel", [(0.600, 0), (0.600, 0.046), (ez - 0.008, 0.046), (ez, 0.038), (ez, 0.028), (ez - 0.020, 0.026), (ez - 0.020, 0)], 0, ey, "z", 12,
                       [M.gold, M.gold, M.gold, M.gold, M.dark, M.dark]))
    parts.append(lathe("emitter", [(ez - 0.026, 0), (ez - 0.026, 0.017), (ez - 0.010, 0.017), (ez - 0.006, 0.012), (ez - 0.006, 0)], 0, ey, "z", 8, [M.laser_emit] * 4))
    for sx in (-1, 1):                                              # a red switch pad on each flank
        parts.append(bevel_all(box("switch", (min(sx * 0.084, sx * 0.101), -0.020, 0.452), (max(sx * 0.084, sx * 0.101), 0.046, 0.560), M.red), 0.005))
    return build("att_laser", RAIL, parts, emit=[0.0, round(ey - RAIL.y, 4), round(ez - RAIL.z, 4)])

NODES = [build_holo(), build_2x(), build_comp(), build_supp(), build_mag_ext(), build_laser()]
for ob in NODES: bake_ao(ob, [ob])                                  # seen off the gun too: self-occlusion only
K.finish(NODES)

# ================================================================================================ save + export
tris = {ob.name: sum(len(p.vertices) - 2 for p in ob.data.polygons) for ob in NODES}
over = [n for n, t in tris.items() if t >= TRI_BUDGET]
if over or sum(tris.values()) >= TRI_BUDGET_ALL:
    sys.exit(f"triangle budget: {tris} (each under {TRI_BUDGET}, all under {TRI_BUDGET_ALL})")
os.makedirs(os.path.dirname(OUT_GLB), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND, compress=True)
bpy.ops.export_scene.gltf(
    filepath=OUT_GLB, export_format="GLB", export_yup=True, export_apply=True, export_extras=True,
    export_texcoords=True, export_normals=True, export_tangents=False, export_vertex_color="ACTIVE", export_all_vertex_colors=False,
    export_cameras=False, export_lights=False, export_skins=False, export_morph=False, export_animations=False, export_image_format="AUTO")

def bounds(ob):
    pts = [(v.co.x, v.co.z, -v.co.y) for v in ob.data.vertices]     # Blender -> the gun's frame
    return [[round(f(p[i] for p in pts), 4) for i in range(3)] for f in (min, max)]
print("@@JSON@@" + json.dumps({
    "glb": OUT_GLB, "glb_bytes": os.path.getsize(OUT_GLB), "blend": OUT_BLEND, "tris": tris, "tris_total": sum(tris.values()),
    "verts": {ob.name: len(ob.data.vertices) for ob in NODES},
    "materials": {ob.name: [m.name for m in ob.data.materials] for ob in NODES},
    "bounds": {ob.name: bounds(ob) for ob in NODES}, "props": {ob.name: {k: list(ob[k]) for k in ob.keys()} for ob in NODES},
}))
