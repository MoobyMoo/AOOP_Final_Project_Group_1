"""Kingpin .45: the Businessman's sidearm. Fictional pistol, original design, built entirely by this script.

  blender -b --factory-startup --python-exit-code 1 -P tools/blender/kingpin/build_kingpin.py

Writes public/models/kingpin45.glb (the game asset) and tools/blender/kingpin/kingpin45.blend (editable source of
record for renders and QA). Prints one line of metrics as `@@JSON@@{...}`.

Authoring frame = the game's GunView frame: x right (ejection port side), y up, z forward along the barrel, the grip
at the origin. Everything below is written in that frame and rotated into Blender's (x, -z, y) when the parts are
joined, so the glTF exporter's +Y-up conversion lands it back exactly where the game expects it.

Nodes: kingpin45 > body > { frame, slide, hammer, trigger, mag, mag_ext, muzzle, eject }.
Clips: "fire" (0.22 s) and "reload" (1.2 s), baked at 100 fps from the motion functions at the bottom; the game
samples them by normalised time (fireT, reloadT), so gameplay still owns the clock.
Shading: one material. Base colour and metal/roughness come from a 32 px palette texture (one cell per surface kind),
COLOR_0 carries ray-cast ambient occlusion per vertex.
"""
import bpy, bmesh, json, math, os, sys
from math import radians, sin, cos, tan, acos, atan2, pi
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OUT_GLB = os.path.join(ROOT, "public", "models", "kingpin45.glb")
OUT_BLEND = os.path.join(HERE, "kingpin45.blend")

# ------------------------------------------------------------------------------------------------ named constants
FPS = 100
FIRE_S, RELOAD_S = 0.22, 1.2             # src/game/combat/weapons.ts: interval, reload
SLIDE_TRAVEL = 0.13
HAMMER_COCK = radians(44)                # the hammer rests cocked; this is how far back from "down"
RAKE = 0.1529                            # magazine rake: z per unit y
BORE_Y = 0.315
MUZZLE = (0.0, BORE_Y, 0.74)
EJECT = (0.115, 0.40, 0.17)
HAMMER_PIVOT = (0.0, 0.196, -0.312)
TRIGGER_PIVOT = (0.0, 0.135, 0.252)
SHARP = radians(40)                      # edges steeper than this stay hard; everything else is bevelled or smooth
MAG_FADE = [0.27, 0.42, 0.45, 0.50]      # reloadT: old magazine fades out over [0], [1]; the new one fades in over [2], [3]

# palette: name, sRGB hex, metallic, roughness. Tuned in the game's stage, not in Blender: its sun is 7x with no tone
# mapping, so a sunlit dielectric shows about 2.5x its albedo (ivory is authored as a mid beige and lands on ivory),
# and metals show whatever the studio sky in kingpin.ts gives them to reflect.
PAL = [
    ("gunmetal", "#242735", 0.60, 0.42),   # slide: polished, reflects the sky
    ("graphite", "#2d303d", 0.30, 0.60),   # frame: duller, half way to a coating
    ("dark",     "#101116", 0.20, 0.75),   # port, sights, wells
    ("groove",   "#23252f", 0.80, 0.50),   # serration floors
    ("steel",    "#7b818b", 0.90, 0.46),   # barrel, chamber, magazine body
    ("gold",     "#e6a52e", 0.80, 0.40),   # accents
    ("ivory",    "#b5ac98", 0.00, 0.45),   # grip panels
    ("ivorycut", "#6f6552", 0.00, 0.70),   # grooves cut into the panels
    ("enamel",   "#141d42", 0.00, 0.20),   # medallion field
    ("banana",   "#cfa92e", 0.00, 0.40),   # extended magazine baseplate
    ("brass",    "#d9a441", 1.00, 0.30),   # the top round's case
    ("white",    "#b8b5aa", 0.00, 0.50),   # sight dots
    ("copper",   "#c8703c", 1.00, 0.34),   # the top round's bullet
]
GRID = 4
class M: pass
for _i, (_n, *_r) in enumerate(PAL): setattr(M, _n, _i)

MMAT = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))   # game (x, y, z) -> Blender (x, -z, y)
MR = MMAT.to_3x3()
def g2b(p): return Vector((p[0], -p[2], p[1]))
def b2g(v): return Vector((v.x, v.z, -v.y))

# ------------------------------------------------------------------------------------------------ scene
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = FPS
scene.unit_settings.system = "METRIC"
COLL = scene.collection
MATS = []
for name, hexc, _, _ in PAL:
    m = bpy.data.materials.new("tmp_" + name)
    c = [int(hexc[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    m.diffuse_color = (*c, 1)
    MATS.append(m)

# ------------------------------------------------------------------------------------------------ mesh helpers
def mk(name, bm):
    """bmesh -> object, outward normals, palette slots"""
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    for m in MATS: me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    COLL.objects.link(ob)
    return ob

def apply_mods(ob):
    dg = bpy.context.evaluated_depsgraph_get(); dg.update()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    old = ob.data
    ob.modifiers.clear()
    ob.data = me
    bpy.data.meshes.remove(old)
    me.name = ob.name

def outline(pts, per90=3):
    """closed polygon [(u, v, radius?)] -> [(u, v)] with circular fillets"""
    n, out = len(pts), []
    for i in range(n):
        p0, p1, p2 = Vector(pts[i - 1][:2]), Vector(pts[i][:2]), Vector(pts[(i + 1) % n][:2])
        r = pts[i][2] if len(pts[i]) > 2 else 0
        u0, u2 = p0 - p1, p2 - p1
        l0, l2 = u0.length, u2.length
        u0, u2 = u0 / l0, u2 / l2
        phi = acos(max(-1, min(1, u0.dot(u2))))
        if r <= 0 or phi > pi - 1e-3:
            out.append((p1.x, p1.y)); continue
        t = min(r / tan(phi / 2), 0.48 * min(l0, l2))
        r = t * tan(phi / 2)
        a, b = p1 + u0 * t, p1 + u2 * t
        c = p1 + (u0 + u2).normalized() * (r / sin(phi / 2))
        a0, a1 = atan2(a.y - c.y, a.x - c.x), atan2(b.y - c.y, b.x - c.x)
        da = (a1 - a0 + pi) % (2 * pi) - pi
        k = pts[i][3] if len(pts[i]) > 3 else max(1, round((pi - phi) / (pi / 2) * per90))
        for j in range(k + 1):
            ang = a0 + da * j / k
            out.append((c.x + r * cos(ang), c.y + r * sin(ang)))
    return out

def _pt(axis, a, u, v):
    # axis x: profile is (z, y), extruded across x. axis z: profile (x, y) along z. axis y: profile (x, z) along y.
    return {"x": (a, v, u), "z": (u, v, a), "y": (u, a, v)}[axis]

def prism(name, prof, a0, a1, axis, mat, cap0=None, cap1=None):
    bm = bmesh.new()
    r0 = [bm.verts.new(_pt(axis, a0, u, v)) for u, v in prof]
    r1 = [bm.verts.new(_pt(axis, a1, u, v)) for u, v in prof]
    n = len(prof)
    for i in range(n):
        bm.faces.new((r0[i], r0[(i + 1) % n], r1[(i + 1) % n], r1[i])).material_index = mat
    bm.faces.new(r0).material_index = mat if cap0 is None else cap0
    bm.faces.new(r1[::-1]).material_index = mat if cap1 is None else cap1
    return mk(name, bm)

def loft(name, rings, matfun, caps=True):
    """rings: lists of (x, y, z), same length; matfun(segment, strip) -> palette index"""
    bm = bmesh.new()
    vs = [[bm.verts.new(p) for p in ring] for ring in rings]
    n = len(rings[0])
    for i in range(len(rings) - 1):
        for j in range(n):
            bm.faces.new((vs[i][j], vs[i][(j + 1) % n], vs[i + 1][(j + 1) % n], vs[i + 1][j])).material_index = matfun(i, j)
    if caps:
        bm.faces.new(vs[0]).material_index = matfun(0, -1)
        bm.faces.new(vs[-1][::-1]).material_index = matfun(len(rings) - 2, -1)
    return mk(name, bm)

def lathe(name, prof, c0, c1, axis, seg, mats, phase=0.5):
    """prof: [(a, r)] along the axis; r == 0 is a pole. axis z: centre (x=c0, y=c1). axis x: centre (z=c0, y=c1).
    mats: one palette index per profile segment."""
    bm = bmesh.new()
    rows = []
    for a, r in prof:
        if r <= 0:
            rows.append([bm.verts.new((c0, c1, a) if axis == "z" else (a, c1, c0))])
        else:
            row = []
            for k in range(seg):
                t = 2 * pi * (k + phase) / seg
                row.append(bm.verts.new((c0 + r * cos(t), c1 + r * sin(t), a) if axis == "z" else (a, c1 + r * sin(t), c0 + r * cos(t))))
            rows.append(row)
    for i in range(len(rows) - 1):
        A, B = rows[i], rows[i + 1]
        for k in range(seg):
            k2 = (k + 1) % seg
            if len(A) == 1 and len(B) == 1: continue
            if len(A) == 1: f = bm.faces.new((A[0], B[k], B[k2]))
            elif len(B) == 1: f = bm.faces.new((A[k], A[k2], B[0]))
            else: f = bm.faces.new((A[k], A[k2], B[k2], B[k]))
            f.material_index = mats[i]
    return mk(name, bm)

def add_box(bm, o, e1, e2, e3, mat):
    """box centred on o with half-extent vectors e1, e2, e3"""
    o, e1, e2, e3 = Vector(o), Vector(e1), Vector(e2), Vector(e3)
    v = [bm.verts.new(o + e1 * a + e2 * b + e3 * c) for a in (-1, 1) for b in (-1, 1) for c in (-1, 1)]
    for q in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
        bm.faces.new([v[i] for i in q]).material_index = mat

def box(name, lo, hi, mat):
    bm = bmesh.new()
    lo, hi = Vector(lo), Vector(hi)
    h = (hi - lo) / 2
    add_box(bm, (lo + hi) / 2, (h.x, 0, 0), (0, h.y, 0), (0, 0, h.z), mat)
    return mk(name, bm)

def bevel(ob, wfun, segments=1, profile=0.5):
    """bevel with a width per edge: wfun(a, b, dihedral) -> width (0 = leave)"""
    bm = bmesh.new(); bm.from_mesh(ob.data)
    ws = [max(0.0, wfun(e.verts[0].co, e.verts[1].co, e.calc_face_angle(0.0))) for e in bm.edges]
    bm.free()
    mx = max(ws)
    if mx <= 0: return ob
    me = ob.data
    at = me.attributes.get("bevel_weight_edge") or me.attributes.new("bevel_weight_edge", "FLOAT", "EDGE")
    at.data.foreach_set("value", [w / mx for w in ws])
    md = ob.modifiers.new("bevel", "BEVEL")
    md.width, md.segments, md.limit_method, md.offset_type, md.profile = mx, segments, "WEIGHT", "OFFSET", profile
    md.use_clamp_overlap = True
    apply_mods(ob)
    return ob

def bevel_all(ob, w, segments=1, min_angle=radians(30)):
    return bevel(ob, lambda a, b, ang: w if ang > min_angle else 0, segments)

def tri_ngons(ob):
    """ear-clip the n-gons now: the boolean's own triangulation gets concave caps wrong"""
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4], ngon_method="EAR_CLIP")
    bm.to_mesh(ob.data); bm.free()
    return ob

def cut(ob, cutter):
    tri_ngons(ob)
    md = ob.modifiers.new("cut", "BOOLEAN")
    md.operation, md.object, md.solver, md.material_mode = "DIFFERENCE", cutter, "EXACT", "INDEX"
    apply_mods(ob)
    me = cutter.data
    bpy.data.objects.remove(cutter); bpy.data.meshes.remove(me)
    return ob

def mirror_x(ob, name):
    bm = bmesh.new(); bm.from_mesh(ob.data)
    for v in bm.verts: v.co.x = -v.co.x
    return mk(name, bm)

def move(ob, fn):
    for v in ob.data.vertices: v.co = fn(v.co)
    return ob

def join(name, parts):
    """merge parts into one node mesh and rotate it into Blender's frame"""
    bm = bmesh.new()
    for ob in parts: bm.from_mesh(ob.data)
    for ob in parts:
        me = ob.data
        bpy.data.objects.remove(ob); bpy.data.meshes.remove(me)
    bmesh.ops.dissolve_degenerate(bm, dist=1e-5, edges=bm.edges[:])
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4], ngon_method="EAR_CLIP")
    bmesh.ops.dissolve_degenerate(bm, dist=1e-5, edges=bm.edges[:])   # ear clipping leaves slivers on collinear points
    bmesh.ops.transform(bm, matrix=MMAT, verts=bm.verts[:])
    for f in bm.faces: f.smooth = True
    for e in bm.edges: e.smooth = len(e.link_faces) == 2 and e.calc_face_angle(0.0) < SHARP
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    for m in MATS: me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    COLL.objects.link(ob)
    md = ob.modifiers.new("wn", "WEIGHTED_NORMAL")       # face-area weighted normals: flats stay flat, bevels roll
    md.keep_sharp, md.mode, md.weight, md.thresh = True, "FACE_AREA", 50, 0.01
    apply_mods(ob)
    return ob

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
def bvh_of(obs):
    verts, polys = [], []
    for ob in obs:
        base = len(verts)
        verts += [v.co.copy() for v in ob.data.vertices]
        polys += [[base + i for i in p.vertices] for p in ob.data.polygons]
    return BVHTree.FromPolygons(verts, polys, epsilon=0.0)

def fib_dirs(n):
    out, g = [], pi * (3 - 5 ** 0.5)
    for i in range(n):
        z = 1 - 2 * (i + 0.5) / n
        r = (1 - z * z) ** 0.5
        out.append(Vector((cos(g * i) * r, sin(g * i) * r, z)))
    return out
DIRS, AO_R = fib_dirs(160), 0.11

def bake_ao(ob, occluders):
    me, tree = ob.data, bvh_of(occluders)
    col = me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    cache, vals = {}, []
    for loop, cn in zip(me.loops, me.corner_normals):
        n = cn.vector.normalized()
        key = (loop.vertex_index, round(n.x, 2), round(n.y, 2), round(n.z, 2))
        c = cache.get(key)
        if c is None:
            o = me.vertices[loop.vertex_index].co + n * 0.0025
            occ = wsum = 0.0
            for d in DIRS:
                w = d.dot(n)
                if w <= 0.08: continue
                wsum += w
                hit = tree.ray_cast(o, d, AO_R)
                if hit[0] is not None: occ += w * (1 - (hit[3] / AO_R) ** 2)
            c = cache[key] = 0.30 + 0.70 * (1 - occ / wsum) ** 1.5     # floor: crevices go dark, not black
        vals += [c, c, c, 1.0]
    col.data.foreach_set("color", vals)
    me.color_attributes.active_color = col
    me.color_attributes.render_color_index = 0

RIGID = [frame, slide, hammer, trigger]
bake_ao(frame, RIGID + [mag]); bake_ao(slide, RIGID); bake_ao(hammer, RIGID); bake_ao(trigger, RIGID)
bake_ao(mag, [mag]); bake_ao(mag_ext, [mag_ext])                   # the magazines are seen out of the gun: self-occlusion only

# ================================================================================================ material + palette UVs
def palette_image(name, fn, colorspace):
    """write the palette as a PNG by hand (no image library needed), then load and pack it"""
    import struct, zlib
    px, n = 8, GRID * 8
    rows = b""
    for y in range(n - 1, -1, -1):                                  # PNG rows run top-down, UV v runs bottom-up
        rows += b"\x00"
        for x in range(n):
            i = (y // px) * GRID + x // px
            rows += bytes(round(max(0.0, min(1.0, c)) * 255) for c in fn(PAL[i] if i < len(PAL) else PAL[0]))
    chunk = lambda tag, data: struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff)
    path = os.path.join(HERE, name + ".png")
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", n, n, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b""))
    img = bpy.data.images.load(path)
    img.name = name
    img.colorspace_settings.name = colorspace
    img.pack()
    return img
base_img = palette_image("kingpin_palette", lambda p: [int(p[1][i:i + 2], 16) / 255 for i in (1, 3, 5)], "sRGB")
orm_img = palette_image("kingpin_palette_orm", lambda p: (1.0, p[3], p[2]), "Non-Color")   # glTF: G roughness, B metallic

mat = bpy.data.materials.new("MAT_Kingpin")
mat.use_backface_culling = True
nt = mat.node_tree
bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
tb = nt.nodes.new("ShaderNodeTexImage"); tb.image = base_img; tb.interpolation = "Closest"
to = nt.nodes.new("ShaderNodeTexImage"); to.image = orm_img; to.interpolation = "Closest"
vc = nt.nodes.new("ShaderNodeVertexColor"); vc.layer_name = "Col"
mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.blend_type = "MULTIPLY"
sock = lambda node, ident, out=False: next(s for s in (node.outputs if out else node.inputs) if s.identifier == ident)
sock(mix, "Factor_Float").default_value = 1.0
nt.links.new(tb.outputs["Color"], sock(mix, "A_Color")); nt.links.new(vc.outputs["Color"], sock(mix, "B_Color"))
nt.links.new(sock(mix, "Result_Color", True), bsdf.inputs["Base Color"])
sep = nt.nodes.new("ShaderNodeSeparateColor")
nt.links.new(to.outputs["Color"], sep.inputs[0])
nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"]); nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])

UA, UB = Vector((0.37, 0.61, 0.70)).normalized(), Vector((-0.72, 0.69, -0.05)).normalized()
for ob in NODES:
    me = ob.data
    uv = me.uv_layers.new(name="UVMap")
    for poly in me.polygons:
        i = poly.material_index
        cu, cv = (i % GRID + 0.5) / GRID, (i // GRID + 0.5) / GRID
        for li in poly.loop_indices:
            # a small skewed footprint inside the cell (not one point): shared per vertex, never zero-area
            p = me.vertices[me.loops[li].vertex_index].co
            uv.data[li].uv = (cu + 0.07 * p.dot(UA), cv + 0.07 * p.dot(UB))
    me.materials.clear(); me.materials.append(mat)
    for poly in me.polygons: poly.material_index = 0
for m in MATS: bpy.data.materials.remove(m)

# ================================================================================================ hierarchy
def empty(name, parent, loc=(0, 0, 0)):
    o = bpy.data.objects.new(name, None); COLL.objects.link(o)
    o.empty_display_size = 0.05; o.parent = parent; o.location = g2b(loc)
    return o
root = empty("kingpin45", None)
body = empty("body", root)
for ob in NODES: ob.parent = body
for ob, piv in ((hammer, HAMMER_PIVOT), (trigger, TRIGGER_PIVOT)):   # origin at the pivot
    ob.data.transform(Matrix.Translation(-g2b(piv))); ob.location = g2b(piv)
muzzle, eject = empty("muzzle", body, MUZZLE), empty("eject", body, EJECT)
root["magFade"] = MAG_FADE
root["slideTravel"] = SLIDE_TRAVEL

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
