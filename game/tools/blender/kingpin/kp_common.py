"""Shared modelling kit for the Kingpin .45 and its attachments (Blender 5.2, headless).

Both build_kingpin.py and build_attachments.py import this, so the gun and everything that bolts onto it share one
palette texture, one material setup, one bevel/normal treatment and one ambient-occlusion bake.

Authoring frame = the game's GunView frame: x right (ejection port side), y up, z forward along the barrel. Parts are
written in that frame and rotated into Blender's (x, -z, y) by join(), so the glTF exporter's +Y-up conversion lands
them back exactly where the game expects them.
Shading: one material (MAT_Kingpin). Base colour and metal/roughness come from a 32 px palette texture (one cell per
surface kind), COLOR_0 carries ray-cast ambient occlusion per vertex. Faces painted with an EMIT entry get their own
emissive material instead (a second primitive in the GLB).
"""
import bpy, bmesh, os
from math import radians, sin, cos, tan, acos, atan2, pi
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
SHARP = radians(40)                      # edges steeper than this stay hard; everything else is bevelled or smooth

# palette: name, sRGB hex, metallic, roughness. Tuned in the game's stage, not in Blender: its sun is 7x with no tone
# mapping, so a sunlit dielectric shows about 2.5x its albedo (ivory is authored as a mid beige and lands on ivory),
# and metals show whatever the studio sky in kingpin.ts gives them to reflect.
# Append only, never reorder: the cell index is baked into every mesh's UVs (16 cells, 15 used).
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
    ("lens",     "#3596a6", 0.25, 0.12),   # attachments: tinted sight glass (opaque: no sorting, no blending state)
    ("red",      "#a3201c", 0.00, 0.35),   # attachments: laser housing accents; also the fallback under the emitters
]
GRID = 4
# emissive materials (not palette cells): name, sRGB hex, emission strength. Faces painted M.<name> become their own
# primitive with a material of this name, so the game can find it, switch it and let the bloom pass pick it up.
EMIT = [
    ("laser_emit", "#ff2414", 4.0),        # the laser module's emitter dot
    ("sight_dot",  "#ff3b1c", 3.0),        # the reflex sight's aiming dot
]
class M: pass
for _i, (_n, *_r) in enumerate(PAL): setattr(M, _n, _i)
for _i, (_n, *_r) in enumerate(EMIT): setattr(M, _n, len(PAL) + _i)

# the gun's fixed points that its attachments are built round (game frame)
RAKE = 0.1529                            # magazine rake: z per unit y
BORE_Y = 0.315
# attachment sockets: name -> (point in the gun frame, the part it rides). Unrotated: a socket's axes are the gun's.
SOCKETS = {
    "socket_sight":  ((0.0, 0.415, 0.40), "slide"),     # top of the slide, between the ejection port and the front sight
    "socket_muzzle": ((0.0, BORE_Y, 0.707), "body"),    # the barrel's crown, on the bore axis
    "socket_mag":    ((0.0, -0.300, -0.075), "mag"),    # mouth of the magazine well, on the bottom of the grip
    "socket_rail":   ((0.0, 0.089, 0.494), "body"),     # underside of the accessory rail, middle lug
}

MMAT = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))   # game (x, y, z) -> Blender (x, -z, y)
MR = MMAT.to_3x3()
def g2b(p): return Vector((p[0], -p[2], p[1]))
def b2g(v): return Vector((v.x, v.z, -v.y))
def srgb(hexc): return [int(hexc[i:i + 2], 16) / 255 for i in (1, 3, 5)]
def lin(hexc): return [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb(hexc)]

# ------------------------------------------------------------------------------------------------ scene
COLL = None
MATS = []
def reset(fps=100):
    """empty scene + one throwaway material per palette entry (they carry the face's palette index until finish())"""
    global COLL
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = fps
    scene.unit_settings.system = "METRIC"
    COLL = scene.collection
    MATS.clear()
    for name, hexc, *_ in PAL + EMIT:
        m = bpy.data.materials.new("tmp_" + name)
        m.diffuse_color = (*srgb(hexc), 1)
        MATS.append(m)
    return scene

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
    axis y: centre (x=c0, z=c1). mats: one palette index per profile segment."""
    at = {"z": lambda a, u, v: (c0 + u, c1 + v, a), "x": lambda a, u, v: (a, c1 + v, c0 + u), "y": lambda a, u, v: (c0 + u, a, c1 + v)}[axis]
    bm = bmesh.new()
    rows = []
    for a, r in prof:
        if r <= 0:
            rows.append([bm.verts.new(at(a, 0, 0))])
        else:
            row = []
            for k in range(seg):
                t = 2 * pi * (k + phase) / seg
                row.append(bm.verts.new(at(a, r * cos(t), r * sin(t))))
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

UA, UB = Vector((0.37, 0.61, 0.70)).normalized(), Vector((-0.72, 0.69, -0.05)).normalized()
def finish(nodes):
    """Swap the throwaway palette materials for the real ones: MAT_Kingpin (palette textures x vertex AO) on every
    palette face, an emissive material on every EMIT face, and palette UVs on everything. Returns MAT_Kingpin."""
    base_img = palette_image("kingpin_palette", lambda p: srgb(p[1]), "sRGB")
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

    emit = {}
    def emit_mat(i):
        if i not in emit:
            name, hexc, strength = EMIT[i - len(PAL)]
            m = bpy.data.materials.new(name)
            m.use_backface_culling = True
            b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
            b.inputs["Base Color"].default_value = (*lin(hexc), 1)
            b.inputs["Emission Color"].default_value = (*lin(hexc), 1)
            b.inputs["Emission Strength"].default_value = strength
            b.inputs["Roughness"].default_value = 0.4
            emit[i] = m
        return emit[i]

    for ob in nodes:
        me = ob.data
        uv = me.uv_layers.new(name="UVMap")
        idx = [p.material_index for p in me.polygons]
        for poly in me.polygons:
            i = poly.material_index if poly.material_index < len(PAL) else M.red   # emitters: the red cell, if a palette material is ever put on them
            cu, cv = (i % GRID + 0.5) / GRID, (i // GRID + 0.5) / GRID
            for li in poly.loop_indices:
                # a small skewed footprint inside the cell (not one point): shared per vertex, never zero-area
                p = me.vertices[me.loops[li].vertex_index].co
                uv.data[li].uv = (cu + 0.07 * p.dot(UA), cv + 0.07 * p.dot(UB))
        slots = [mat] + [emit_mat(i) for i in sorted({i for i in idx if i >= len(PAL)})]
        me.materials.clear()
        for m in slots: me.materials.append(m)
        for poly, i in zip(me.polygons, idx): poly.material_index = 0 if i < len(PAL) else slots.index(emit[i])
    for m in MATS: bpy.data.materials.remove(m)
    MATS.clear()
    return mat

def empty(name, parent, loc=(0, 0, 0)):
    """an empty at a point in the game frame, unrotated: its axes are the gun's (x right, y up, z along the bore)"""
    o = bpy.data.objects.new(name, None); COLL.objects.link(o)
    o.empty_display_size = 0.05; o.parent = parent; o.location = g2b(loc)
    return o
