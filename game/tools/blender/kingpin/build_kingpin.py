"""Kingpin .45: the Businessman's sidearm. Fictional pistol, original design, built entirely by this script.

  blender -b --factory-startup --python-exit-code 1 -P tools/blender/kingpin/build_kingpin.py

Writes public/models/kingpin45.glb (the game asset) and tools/blender/kingpin/kingpin45.blend (editable source of
record for renders and QA). Prints one line of metrics as `@@JSON@@{...}`.

Authoring frame = the game's GunView frame: x right (ejection port side), y up, z forward along the barrel, the grip
at the origin. Everything below is written in that frame and rotated into Blender's (x, -z, y) when the parts are
joined, so the glTF exporter's +Y-up conversion lands it back exactly where the game expects it.

Nodes: kingpin45 > body > { frame, slide, hammer, trigger, mag, mag_ext, muzzle, eject, socket_sight, socket_muzzle,
socket_mag, socket_rail }.
Sockets: unrotated empties (same axes as the gun: +z along the bore, +y up) where tools/blender/kingpin/
build_attachments.py's pieces mount. Each carries a `rides` property naming the part it should follow in motion.
Clips: "fire" (0.22 s) and "reload" (1.2 s), baked at 100 fps from the motion functions at the bottom; the game
samples them by normalised time (fireT, reloadT), so gameplay still owns the clock.
Shading: one material. Base colour and metal/roughness come from a 32 px palette texture (one cell per surface kind),
COLOR_0 carries ray-cast ambient occlusion per vertex. The modelling kit, palette and material live in kp_common.py.
"""
import bpy, bmesh, json, math, os, sys
from math import radians, sin, cos, tan, acos, atan2, pi
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import kp_common as K
from kp_common import (M, MR, RAKE, BORE_Y, SOCKETS, g2b, mk, outline, prism, loft, lathe, add_box, box, bevel, bevel_all, cut, mirror_x, move, join,
                       bake_ao, empty)

ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OUT_GLB = os.path.join(ROOT, "public", "models", "kingpin45.glb")
OUT_BLEND = os.path.join(HERE, "kingpin45.blend")

# ------------------------------------------------------------------------------------------------ named constants
FPS = 100
FIRE_S, RELOAD_S = 0.22, 1.2             # src/game/combat/weapons.ts: interval, reload
SLIDE_TRAVEL = 0.13
HAMMER_COCK = radians(44)                # the hammer rests cocked; this is how far back from "down"
MUZZLE = (0.0, BORE_Y, 0.74)
EJECT = (0.115, 0.40, 0.17)
HAMMER_PIVOT = (0.0, 0.196, -0.312)
TRIGGER_PIVOT = (0.0, 0.135, 0.252)
MAG_FADE = [0.27, 0.42, 0.45, 0.50]      # reloadT: old magazine fades out over [0], [1]; the new one fades in over [2], [3]

scene = K.reset(FPS)
COLL = scene.collection

# ================================================================================================ the model
SLIDE_HW, FRAME_HW = 0.095, 0.095      # flush flanks: the seam is two small bevels, no ledge to shadow the frame

def build_slide():
    parts = []
    # --- body: a faceted shell lofted along the barrel; a gold inlay runs down the spine and along each flank
    def ring(z):
        R = [(SLIDE_HW, 0.215), (SLIDE_HW, 0.250), (SLIDE_HW, 0.266), (SLIDE_HW, 0.345), (0.050, 0.415), (0.014, 0.415)]
        return [(x, y, z) for x, y in R + [(-x, y) for x, y in reversed(R)]]
    # stations fence in the serrations and the port, so the cuts re-triangulate only their own panels
    ST = [-0.295, -0.277, -0.104, 0.080, 0.260, 0.447, 0.543, 0.61, 0.665]
    def mat(i, j):
        if j == 5 and 2 <= i <= 5: return M.gold                    # spine inlay, rear serrations to front sight
        if j in (1, 9) and 2 <= i <= 6: return M.gold               # flank pinstripes
        return M.gunmetal
    body = loft("slide_body", [ring(z) for z in ST], mat)
    def w(a, b, ang):
        if ang < radians(12): return 0
        d = b - a
        y = (a.y + b.y) / 2
        if abs(d.z) > 0.9 * d.length:
            if y < 0.23: return 0.004
            return 0.009 if y > 0.30 else 0
        if abs(d.z) < 1e-5:
            if a.z < -0.29: return 0.012
            if a.z > 0.66: return 0.007
        return 0
    bevel(body, w)
    # --- cocking serrations: slanted grooves cut into both flanks, rear and front
    bm = bmesh.new()
    sl = 0.2
    for sx in (-1, 1):
        for i in range(6):
            z = -0.258 + i * 0.027
            add_box(bm, (sx * 0.095, 0.302, z), (0.008, 0, 0), (0, 0.031 * cos(sl), 0.031 * sin(sl)), (0, -0.0065 * sin(sl), 0.0065 * cos(sl)), M.groove)
        for i in range(3):
            z = 0.468 + i * 0.027
            add_box(bm, (sx * 0.095, 0.302, z), (0.008, 0, 0), (0, 0.031 * cos(sl), 0.031 * sin(sl)), (0, -0.0065 * sin(sl), 0.0065 * cos(sl)), M.groove)
    cut(body, mk("serr_cut", bm))
    # --- ejection port: top right, beside the spine inlay
    cut(body, box("port_cut", (0.022, 0.325, 0.088), (0.13, 0.45, 0.252), M.dark))
    parts.append(body)
    # --- rear sight: a U notch block with two dots, ramped at the front
    rs = prism("rear_sight", [(-0.062, 0.408), (0.062, 0.408), (0.062, 0.455), (0.02, 0.455), (0.02, 0.431), (-0.02, 0.431), (-0.02, 0.455), (-0.062, 0.455)], -0.270, -0.212, "z", M.dark)
    move(rs, lambda c: Vector((c.x, c.y, c.z - 0.022)) if c.z > -0.22 and c.y > 0.44 else c)
    parts.append(bevel_all(rs, 0.004))
    for sx in (-1, 1):
        parts.append(box("dot", (sx * 0.041 - 0.009, 0.4385, -0.2725), (sx * 0.041 + 0.009, 0.4495, -0.268), M.white))
    # --- front sight: gold ramp
    fs = prism("front_sight", [(0.548, 0.410), (0.624, 0.410), (0.624, 0.440), (0.613, 0.452), (0.592, 0.452), (0.548, 0.424)], -0.017, 0.017, "x", M.gold)
    parts.append(bevel_all(fs, 0.0035))
    # --- muzzle bushing (gold crown around the barrel) and the recoil-spring plug under it
    parts.append(lathe("bushing", [(0.645, 0), (0.645, 0.062), (0.679, 0.062), (0.686, 0.055), (0.686, 0.0475), (0.676, 0.0475), (0.676, 0)], 0, BORE_Y, "z", 12,
                       [M.gold, M.gold, M.gold, M.gold, M.gold, M.dark]))
    parts.append(lathe("plug", [(0.655, 0), (0.655, 0.0165), (0.6705, 0.0165), (0.673, 0.013), (0.673, 0)], 0, 0.2355, "z", 8, [M.dark, M.dark, M.dark, M.groove]))
    # --- firing-pin plate on the rear face
    parts.append(lathe("pin_plate", [(-0.285, 0), (-0.285, 0.021), (-0.2985, 0.021), (-0.2985, 0)], 0, BORE_Y, "z", 8, [M.dark, M.dark, M.groove]))
    return join("slide", parts)

def strap_front(y): return 0.066 + (y + 0.262) * 0.14
def strap_back(y): return -0.207 + (y + 0.24) * 0.158
def mag_front(y): return 0.040 + RAKE * (y + 0.3)
def mag_back(y): return -0.190 + RAKE * (y + 0.3)

def build_frame():
    parts = []
    # --- the frame: one side profile, extruded, with the grip rounded far more than the dust cover
    # two rules keep the side face's inner outline from folding over itself when it is bevelled:
    # a convex fillet's radius stays above the bevel width beside it, and the width only changes at a sharp corner
    # (the two ends of the deck). So the frame is one soft width all round, against the slide's crisp chamfers.
    FR = [(-0.335, 0.218), (0.615, 0.218), (0.615, 0.168, 0.026), (0.585, 0.128, 0.022),
          (strap_front(0.128), 0.128, 0.032), (strap_front(-0.300), -0.300, 0.03), (-0.226, -0.300, 0.03),
          (-0.196, -0.10, 0.2), (-0.162, 0.045, 0.085, 4), (-0.362, 0.150, 0.024), (-0.372, 0.200, 0.024)]
    fr = prism("frame_slab", outline(FR, 2), -FRAME_HW, FRAME_HW, "x", M.graphite)
    def w(a, b, ang):
        if abs(a.x - b.x) > 1e-5: return 0                          # rungs: the profile's own fillets round these
        if min(a.y, b.y) > 0.2179 and min(a.z, b.z) > -0.336: return 0.004   # the seam under the slide
        return 0.018
    bevel(fr, w, 2)
    # a support loop round each side face keeps the vertex AO under the slide and round the panels local
    bm = bmesh.new(); bm.from_mesh(fr.data)
    caps = [f for f in bm.faces if len(f.verts) > 8 and abs(abs(f.normal.x) - 1) < 1e-4]
    bmesh.ops.inset_individual(bm, faces=caps, thickness=0.009, use_even_offset=True)
    bm.to_mesh(fr.data); bm.free()
    # magazine well
    cut(fr, prism("well_cut", [(mag_front(-0.33) + 0.006, -0.33), (mag_front(-0.15) + 0.006, -0.15), (mag_back(-0.15) - 0.006, -0.15), (mag_back(-0.33) - 0.006, -0.33)], -0.056, 0.056, "x", M.dark))
    parts.append(fr)
    # --- accessory rail under the dust cover: three lugs on a recessed bar
    parts.append(box("rail_bar", (-0.05, 0.104, 0.40), (0.05, 0.135, 0.588), M.graphite))
    LUG = [(-0.052, 0.14), (0.052, 0.14), (0.066, 0.113), (0.066, 0.104), (0.053, 0.089), (-0.053, 0.089), (-0.066, 0.104), (-0.066, 0.113)]
    for z in (0.405, 0.472, 0.539):
        parts.append(prism("rail_lug", LUG, z, z + 0.045, "z", M.graphite))
    # --- trigger guard: a rounded strap swept from the dust cover round to the front strap
    path = [(0.392, 0.170), (0.389, 0.080), (0.384, -0.096, 0.062), (0.145, -0.096), (0.078, -0.096)]
    scale = [1.7, 1.0, 1.0, 1.0, 1.6]                               # strap thickness along the path
    pts, scl = [], []
    for i, p in enumerate(path):                                    # open polyline with one fillet
        if len(p) < 3: pts.append(Vector(p[:2])); scl.append(scale[i]); continue
        p0, p1, p2 = Vector(path[i - 1][:2]), Vector(p[:2]), Vector(path[i + 1][:2])
        u0, u2 = (p0 - p1).normalized(), (p2 - p1).normalized()
        phi = acos(u0.dot(u2)); t = p[2] / tan(phi / 2)
        a, c = p1 + u0 * t, p1 + (u0 + u2).normalized() * (p[2] / sin(phi / 2))
        a0 = atan2(a.y - c.y, a.x - c.x); b = p1 + u2 * t; a1 = atan2(b.y - c.y, b.x - c.x)
        da = (a1 - a0 + pi) % (2 * pi) - pi
        for j in range(6): pts.append(Vector((c.x + p[2] * cos(a0 + da * j / 5), c.y + p[2] * sin(a0 + da * j / 5)))); scl.append(1.0)
    SEC = [(0.036, -0.020), (0.048, -0.008), (0.048, 0.008), (0.036, 0.020), (-0.036, 0.020), (-0.048, 0.008), (-0.048, -0.008), (-0.036, -0.020)]
    rings = []
    for i, p in enumerate(pts):
        tan_ = ((pts[min(i + 1, len(pts) - 1)] - p).normalized() + (p - pts[max(i - 1, 0)]).normalized()).normalized() if 0 < i < len(pts) - 1 else (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        nrm = Vector((-tan_.y, tan_.x))                             # in the (z, y) plane
        rings.append([(sx, p.y + nrm.y * sn * scl[i], p.x + nrm.x * sn * scl[i]) for sx, sn in SEC])
    parts.append(loft("guard", rings, lambda i, j: M.graphite))
    # --- grip panels: ivory, pillowed, with slanted grooves and the banana medallion
    PAD = [(strap_front(0.04) - 0.036, 0.04, 0.03), (strap_front(-0.252) - 0.031, -0.252, 0.03), (strap_back(-0.252) + 0.031, -0.252, 0.03), (strap_back(0.04) + 0.036, 0.04, 0.03)]
    X0, X1 = FRAME_HW - 0.006, FRAME_HW + 0.013
    pad = prism("pad", outline(PAD, 2), X0, X1, "x", M.ivory)
    bevel(pad, lambda a, b, ang: 0.008 if abs(a.x - X1) < 1e-5 and abs(b.x - X1) < 1e-5 else 0, 2)
    # grooves: lines at 32 degrees, clipped to the panel's flat
    poly = [Vector(p[:2]) for p in PAD]
    cen = sum(poly, Vector((0, 0))) / 4
    lines = []
    for i in range(4):
        a, b = poly[i], poly[(i + 1) % 4]
        n = Vector((-(b - a).y, (b - a).x)).normalized()
        if n.dot(cen - a) < 0: n = -n
        lines.append((a + n * 0.021, n))
    d = Vector((cos(radians(32)), sin(radians(32)))); nn = Vector((-d.y, d.x))
    bm = bmesh.new()
    for k in range(-6, 7):
        p = cen + nn * (k * 0.029)
        t0, t1 = -1.0, 1.0
        for q, n in lines:
            den, num = d.dot(n), (q - p).dot(n)
            if abs(den) < 1e-9:
                if num > 0: t0, t1 = 1, -1
            elif den > 0: t0 = max(t0, num / den)
            else: t1 = min(t1, num / den)
        if t1 - t0 < 0.03: continue
        mid, half = p + d * ((t0 + t1) / 2), (t1 - t0) / 2
        add_box(bm, (X1 + 0.004, mid.y, mid.x), (0.009, 0, 0), (0, d.y * half, d.x * half), (0, nn.y * 0.0042, nn.x * 0.0042), M.ivorycut)
    cut(pad, mk("pad_cut", bm))
    MC = (-0.050, -0.098)                                           # medallion centre (z, y)
    med = lathe("medallion", [(X1 - 0.007, 0), (X1 - 0.007, 0.047), (X1 + 0.0065, 0.047), (X1 + 0.010, 0.043), (X1 + 0.010, 0.0375), (X1 + 0.0055, 0.0355), (X1 + 0.0055, 0)], MC[0], MC[1], "x", 12,
                [M.gold, M.gold, M.gold, M.gold, M.gold, M.enamel], 0.0)   # turned so no facet lies along a groove wall
    # the banana: a fat arc that tapers to a tip at one end and carries a stub of stem at the other
    Rc, half, N, tilt = 0.040, radians(42), 6, radians(-26)
    def centre(s):
        a = -half + 2 * half * s
        return Vector((Rc * sin(a), 0.036 - Rc * cos(a))), Vector((cos(a), sin(a)))
    thick = lambda s: 0.0045 + 0.0135 * sin(pi * s ** 0.8) ** 0.6
    lo, hi = [], []
    for i in range(N + 1):
        p, t = centre(i / N); n = Vector((-t.y, t.x))
        lo.append(p - n * thick(i / N) / 2); hi.append(p + n * thick(i / N) / 2)
    p, t = centre(1); n = Vector((-t.y, t.x))
    stem = [p + t * 0.008 - n * 0.0028, p + t * 0.008 + n * 0.0028]
    ban = [(MC[0] + q.x * cos(tilt) - q.y * sin(tilt), MC[1] + q.x * sin(tilt) + q.y * cos(tilt)) for q in lo + stem + hi[::-1]]
    banana = prism("banana", ban, X1 + 0.004, X1 + 0.0105, "x", M.gold)
    for ob in (pad, med, banana):
        parts += [ob, mirror_x(ob, ob.name + "_l")]
    # --- controls: safety (gold), slide stop (dark), magazine button (gold), pins
    saf = prism("safety", [(-0.272, 0.206), (-0.205, 0.206), (-0.168, 0.193), (-0.168, 0.180), (-0.272, 0.176)], -FRAME_HW - 0.014, -FRAME_HW + 0.01, "x", M.gold)
    parts.append(bevel_all(saf, 0.004))
    stop = prism("slide_stop", [(0.10, 0.208), (0.275, 0.208), (0.283, 0.193), (0.268, 0.180), (0.19, 0.184), (0.10, 0.184)], -FRAME_HW - 0.0125, -FRAME_HW + 0.01, "x", M.dark)
    parts.append(bevel_all(stop, 0.004))
    parts.append(lathe("mag_button", [(-FRAME_HW + 0.02, 0), (-FRAME_HW + 0.02, 0.017), (-FRAME_HW - 0.010, 0.017), (-FRAME_HW - 0.0135, 0.0135), (-FRAME_HW - 0.0135, 0)], 0.072, 0.088, "x", 10, [M.gold] * 4))
    for sx in (-1, 1):
        for z, y, r, m in ((0.335, 0.172, 0.011, M.dark), (-0.236, 0.132, 0.011, M.dark)) + (((0.255, 0.194, 0.013, M.steel),) if sx > 0 else ()):
            parts.append(lathe("pin", [(sx * (FRAME_HW - 0.02), 0), (sx * (FRAME_HW - 0.02), r), (sx * (FRAME_HW + 0.0035), r), (sx * (FRAME_HW + 0.0035), 0)], z, y, "x", 6, [m] * 3))
    # --- barrel (fixed), crowned muzzle with a dark bore; chamber hood that fills the port; recoil guide rod
    parts.append(lathe("barrel", [(0.20, 0), (0.20, 0.042), (0.60, 0.042), (0.699, 0.042), (0.707, 0.035), (0.707, 0.0245), (0.68, 0.0225), (0.68, 0)], 0, BORE_Y, "z", 12,
                       [M.steel, M.steel, M.steel, M.steel, M.steel, M.dark, M.dark]))
    hood = prism("hood", [(0.016, 0.4045), (0.046, 0.4045), (0.0855, 0.343), (0.0855, 0.30), (0.016, 0.30)], 0.0905, 0.2495, "z", M.steel)
    parts.append(bevel_all(hood, 0.004))
    parts.append(lathe("guide_rod", [(0.30, 0), (0.30, 0.0115), (0.668, 0.0115), (0.668, 0)], 0, 0.2355, "z", 8, [M.steel] * 3))
    return join("frame", parts)

def build_mag(ext):
    parts = []
    bottom = -0.47 if ext else -0.31
    body = prism("mag_body", [(mag_front(0.095), 0.095), (mag_front(bottom), bottom), (mag_back(bottom), bottom), (mag_back(0.095), 0.095)], -0.05, 0.05, "x", M.steel)
    parts.append(bevel(body, lambda a, b, ang: 0.008 if ang > radians(30) and abs(a.x - b.x) < 1e-5 and abs(a.y - b.y) > 0.1 else 0))
    # the top round: brass case, copper bullet
    parts.append(lathe("case", [(-0.105, 0), (-0.105, 0.030), (0.03, 0.030), (0.03, 0)], 0, 0.102, "z", 8, [M.brass] * 3))
    parts.append(lathe("bullet", [(0.02, 0), (0.02, 0.0285), (0.052, 0.0265), (0.078, 0.015), (0.086, 0)], 0, 0.102, "z", 8, [M.copper] * 4))
    if not ext:
        plate = prism("plate", outline([(-0.240, -0.3035, 0.016), (0.092, -0.3035, 0.016), (0.084, -0.356, 0.018), (-0.240, -0.356, 0.018)], 2), -0.091, 0.091, "x", M.gunmetal)
        parts.append(bevel(plate, lambda a, b, ang: 0.010 if abs(a.x - b.x) < 1e-5 else 0, 2))
    else:
        for sx in (-1, 1):                                          # witness holes
            for y in (-0.362, -0.412):
                z = (mag_front(y) + mag_back(y)) / 2 - 0.02
                parts.append(box("witness", (sx * 0.0505 - 0.003, y - 0.0085, z - 0.014), (sx * 0.0505 + 0.003, y + 0.0085, z + 0.014), M.dark))
        collar = prism("collar", [(mag_front(-0.3035) + 0.013, -0.3035), (mag_front(-0.335) + 0.013, -0.335), (mag_back(-0.335) - 0.013, -0.335), (mag_back(-0.3035) - 0.013, -0.3035)], -0.063, 0.063, "x", M.gunmetal)
        parts.append(collar)
        plate = prism("plate", outline([(-0.264, -0.462, 0.022), (0.094, -0.462, 0.022), (0.082, -0.550, 0.03), (-0.270, -0.550, 0.03)], 2), -0.099, 0.099, "x", M.banana)
        parts.append(bevel(plate, lambda a, b, ang: 0.016 if abs(a.x - b.x) < 1e-5 else 0, 2))
    return join("mag_ext" if ext else "mag", parts)

def build_hammer():
    # drawn "down" (resting on the slide), then swung back to the cocked rest pose about its pivot
    P = [(0.017, -0.03), (0.017, 0.085), (0.011, 0.126), (-0.013, 0.137, 0.01), (-0.054, 0.130, 0.006), (-0.066, 0.113, 0.006), (-0.052, 0.100, 0.006), (-0.031, 0.098, 0.012), (-0.022, 0.068), (-0.024, -0.03)]
    c, s = cos(-HAMMER_COCK), sin(-HAMMER_COCK)
    prof = [(HAMMER_PIVOT[2] + dy * s + dz * c, HAMMER_PIVOT[1] + dy * c - dz * s) for dz, dy in outline(P, 2)]
    return join("hammer", [bevel(prism("hammer", prof, -0.026, 0.026, "x", M.gold), lambda a, b, ang: 0.005 if abs(a.x - b.x) < 1e-5 else 0)])

def build_trigger():
    P = [(0.232, 0.142), (0.273, 0.142), (0.269, 0.07, 0.03), (0.257, 0.012, 0.03), (0.238, -0.032, 0.01), (0.221, -0.046, 0.007), (0.213, -0.035, 0.007), (0.228, 0.002, 0.03), (0.236, 0.06, 0.03)]
    return join("trigger", [bevel(prism("trigger", outline(P, 2), -0.021, 0.021, "x", M.gold), lambda a, b, ang: 0.0055 if abs(a.x - b.x) < 1e-5 else 0)])

frame, slide, mag, mag_ext, hammer, trigger = build_frame(), build_slide(), build_mag(False), build_mag(True), build_hammer(), build_trigger()
NODES = [frame, slide, hammer, trigger, mag, mag_ext]

# ================================================================================================ ambient occlusion
RIGID = [frame, slide, hammer, trigger]
bake_ao(frame, RIGID + [mag]); bake_ao(slide, RIGID); bake_ao(hammer, RIGID); bake_ao(trigger, RIGID)
bake_ao(mag, [mag]); bake_ao(mag_ext, [mag_ext])                   # the magazines are seen out of the gun: self-occlusion only

# ================================================================================================ material + palette UVs
K.finish(NODES)

# ================================================================================================ hierarchy
root = empty("kingpin45", None)
body = empty("body", root)
for ob in NODES: ob.parent = body
for ob, piv in ((hammer, HAMMER_PIVOT), (trigger, TRIGGER_PIVOT)):   # origin at the pivot
    ob.data.transform(Matrix.Translation(-g2b(piv))); ob.location = g2b(piv)
muzzle, eject = empty("muzzle", body, MUZZLE), empty("eject", body, EJECT)
root["magFade"] = MAG_FADE
root["slideTravel"] = SLIDE_TRAVEL
for name, (at, rides) in SOCKETS.items():
    empty(name, body, at)["rides"] = rides                           # slide and mag rest at the identity, so the point holds under either parent

# ================================================================================================ motion
def sstep(x): x = min(1.0, max(0.0, x)); return x * x * (3 - 2 * x)
def seg(t, a, b): return min(1.0, max(0.0, (t - a) / (b - a)))
def rx(a): return Matrix.Rotation(a, 3, "X")
def rz(a): return Matrix.Rotation(a, 3, "Z")
MAG_AXIS = Vector((0, -1, -RAKE)).normalized()
I3 = Matrix.Identity(3)

def fire_pose(f):
    """f = fireT. Returns {node: (position, rotation)} in the game frame, relative to the node's parent."""
    # slide: fully back on the shot frame, then driven home by the spring (slow start, hard stop) by 75 ms
    back = 1.0 if f < 0.06 else 1 - seg(f, 0.06, 0.34) ** 1.8
    # muzzle climb about the grip: peaks ~11 ms in, a small dip as the slide slams home, settled by ~120 ms
    u = seg(f, 0.05, 0.55)
    k = 0.7 + 0.3 * (f / 0.05) if f < 0.05 else (1 - u) * (1 - u) * cos(u * 3.77)
    tilt, kick = k * 0.115, k * 0.04
    return {
        "body": (Vector((0, kick * 0.35, -kick)), rx(-tilt) @ rz(k * 0.035)),
        "slide": (Vector((0, 0, -SLIDE_TRAVEL * back)), I3),
        "hammer": (Vector(HAMMER_PIVOT), rx(-0.17 * back)),                       # the slide rides over it, then it settles on the sear
        "trigger": (Vector(TRIGGER_PIVOT), rx(0.30 * (1 - sstep(seg(f, 0.12, 0.45))))),
    }

def reload_pose(r):
    cant = sstep(seg(r, 0, 0.1)) * (1 - sstep(seg(r, 0.7, 0.8)))                  # tip the gun to show the magazine well
    drop = sin(pi * seg(r, 0.09, 0.19)) * 0.012                                   # the nudge as the catch lets go
    lift = sin(pi * seg(r, 0.66, 0.76)) * 0.035                                   # the seat bump
    rack = sstep(seg(r, 0.80, 0.86)) * (1 - seg(r, 0.90, 0.94) ** 1.8)            # hand racks the slide, lets it fly
    slam = sin(pi * seg(r, 0.935, 0.99)) * 0.02                                   # muzzle dips as it slams home
    body_r = rx(-cant * 0.42 - rack * 0.07 + slam) @ rz(-cant * 0.5)
    body_p = Vector((0, lift - drop + rack * 0.025 * 0.35, -rack * 0.025))
    if r < 0.1:
        mp, mr = Vector((0, 0, 0)), I3
    elif r < 0.45:                                                                # old magazine: out of the well, then falls and tumbles
        out, fall = 0.36 * sstep(seg(r, 0.1, 0.2)), seg(r, 0.14, 0.42) ** 2 * 0.6
        down = body_r.inverted() @ Vector((0, -1, 0))                             # straight down when the gun is held level
        mp, mr = MAG_AXIS * out + down * fall, rx(fall * 1.3) @ rz(fall * 0.7)
    else:                                                                         # new magazine: up from below and to the side, seats
        u = 1 - seg(r, 0.45, 0.68)
        mp, mr = MAG_AXIS * (0.62 * u ** 3 + 0.1 * u) + Vector((-0.12 * u * u, 0, 0)), rz(-0.3 * u * u)
    return {
        "body": (body_p, body_r),
        "slide": (Vector((0, 0, -SLIDE_TRAVEL * rack)), I3),
        "hammer": (Vector(HAMMER_PIVOT), rx(-0.17 * rack)),
        "mag": (mp, mr),
    }

OBJ = {"body": body, "slide": slide, "hammer": hammer, "trigger": trigger, "mag": mag}
for o in OBJ.values(): o.rotation_mode = "QUATERNION"

CLIP_START = 10
def bake(clip, fn, seconds):
    frames = round(seconds * FPS)
    poses = [fn(i / frames) for i in range(frames + 1)]
    for name in poses[0]:
        ob = OBJ[name]
        ad = ob.animation_data_create()
        act = bpy.data.actions.new(f"{clip}.{name}")
        ad.action = act
        prev = None
        for i, pose in enumerate(poses):
            p, r = pose[name]
            ob.location = g2b(p)
            q = (MR @ r @ MR.transposed()).to_quaternion()
            if prev is not None: q.make_compatible(prev)
            prev = q.copy()
            ob.rotation_quaternion = q
            ob.keyframe_insert("location", frame=CLIP_START + i); ob.keyframe_insert("rotation_quaternion", frame=CLIP_START + i)
        for fc in (cb_fc for layer in act.layers for strip in layer.strips for cb in strip.channelbags for cb_fc in cb.fcurves):
            for kp in fc.keyframe_points: kp.interpolation = "LINEAR"
        slot = ad.action_slot
        track = ad.nla_tracks.new(); track.name = clip
        st = track.strips.new(clip, CLIP_START, act)                 # clips sit clear of frame 0, which stays the rest pose
        st.action_slot = slot
        st.extrapolation = "NOTHING"
        ad.action = None
    return frames

def bake_rest():
    for name, ob in OBJ.items():
        p, r = REST[name]
        ad = ob.animation_data_create()
        act = bpy.data.actions.new(f"rest.{name}")
        ad.action = act
        ob.location = g2b(p); ob.rotation_quaternion = (MR @ r @ MR.transposed()).to_quaternion()
        ob.keyframe_insert("location", frame=0); ob.keyframe_insert("rotation_quaternion", frame=0)
        slot = ad.action_slot
        track = ad.nla_tracks.new(); track.name = "rest"
        st = track.strips.new("rest", 0, act)
        st.action_slot = slot
        st.extrapolation = "HOLD"
        ad.action = None
REST = {"body": (Vector((0, 0, 0)), I3), "slide": (Vector((0, 0, 0)), I3), "hammer": (Vector(HAMMER_PIVOT), I3), "trigger": (Vector(TRIGGER_PIVOT), I3), "mag": (Vector((0, 0, 0)), I3)}
bake_rest()                                                         # lowest track: holds everywhere
n_fire, n_reload = bake("fire", fire_pose, FIRE_S), bake("reload", reload_pose, RELOAD_S)
scene.frame_start, scene.frame_end = 0, CLIP_START + n_reload
scene.frame_set(0)

# ================================================================================================ save + export
os.makedirs(os.path.dirname(OUT_GLB), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND, compress=True)
bpy.ops.export_scene.gltf(
    filepath=OUT_GLB, export_format="GLB", export_yup=True, export_apply=True, export_extras=True,
    export_texcoords=True, export_normals=True, export_tangents=False, export_vertex_color="ACTIVE", export_all_vertex_colors=False,
    export_cameras=False, export_lights=False, export_skins=False, export_morph=False,
    export_animations=True, export_animation_mode="NLA_TRACKS", export_force_sampling=True, export_optimize_animation_size=False,
    export_frame_range=False, export_anim_slide_to_zero=True, export_image_format="AUTO")

tris = {ob.name: sum(len(p.vertices) - 2 for p in ob.data.polygons) for ob in NODES}
print("@@JSON@@" + json.dumps({
    "glb": OUT_GLB, "glb_bytes": os.path.getsize(OUT_GLB), "blend": OUT_BLEND, "tris": tris,
    "tris_standard": sum(v for k, v in tris.items() if k != "mag_ext"), "tris_extended": sum(v for k, v in tris.items() if k != "mag"),
    "verts": {ob.name: len(ob.data.vertices) for ob in NODES}, "frames": {"fire": n_fire, "reload": n_reload},
}))
