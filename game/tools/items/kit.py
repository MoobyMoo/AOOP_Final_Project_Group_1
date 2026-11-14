"""Scripted modelling kit for Bananaville item and wearable models (Blender 5.2, headless).

Every model is a list of closed, chunky parts (bevelled boxes, lathes, tubes, plates) that
interpenetrate where they join. Colour lives in a per-corner colour attribute ("Color", linear),
ambient occlusion is ray-cast and multiplied into it, and four shared materials supply the
roughness/metal variety. Nothing here uses operators that need a 3D view.
"""
import math

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector
from mathutils import geometry as geo
from mathutils.bvhtree import BVHTree

TRI_BUDGET = 1500
COLOR_ATTR = "Color"
MATS = {
    #        metallic roughness
    "matte": (0.0, 0.85),
    "satin": (0.0, 0.50),
    "gloss": (0.0, 0.20),
    "metal": (1.0, 0.36),
}


# ---------------------------------------------------------------- colour
def lin(c):
    """'#rrggbb' (sRGB) -> linear rgb tuple. Tuples pass through (assumed linear)."""
    if isinstance(c, str):
        c = c.lstrip("#")
        v = [int(c[i:i + 2], 16) / 255 for i in (0, 2, 4)]
        return tuple((x / 12.92) if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in v)
    return tuple(c)


def mix(a, b, t):
    a, b = lin(a), lin(b)
    t = max(0.0, min(1.0, t))
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def ramp(stops, t):
    """stops: [(t, colour), ...] sorted by t."""
    if t <= stops[0][0]:
        return lin(stops[0][1])
    for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
        if t <= t1:
            return mix(c0, c1, (t - t0) / max(t1 - t0, 1e-9))
    return lin(stops[-1][1])


# ---------------------------------------------------------------- part
class Part:
    """Vertices + faces of one closed solid, with optional per-vertex colour and a path parameter."""

    def __init__(self, verts, faces, sharp=40.0, t=None):
        self.v = [Vector(p) for p in verts]
        self.f = [tuple(f) for f in faces]
        self.sharp = sharp
        self.t = t            # per-vertex 0..1 along a tube/lathe, when the primitive has one
        self.cols = None

    def copy(self):
        p = Part(self.v, self.f, self.sharp, list(self.t) if self.t else None)
        p.cols = list(self.cols) if self.cols else None
        return p

    # transforms (applied immediately, in call order)
    def tf(self, m):
        self.v = [m @ p for p in self.v]
        if m.determinant() < 0:
            self.f = [tuple(reversed(f)) for f in self.f]
        return self

    def at(self, x=0.0, y=0.0, z=0.0):
        return self.tf(Matrix.Translation((x, y, z)))

    def rot(self, rx=0.0, ry=0.0, rz=0.0):
        return self.tf(Euler((math.radians(rx), math.radians(ry), math.radians(rz)), "XYZ").to_matrix().to_4x4())

    def sc(self, sx, sy=None, sz=None):
        sy = sx if sy is None else sy
        sz = sx if sz is None else sz
        return self.tf(Matrix.Diagonal((sx, sy, sz, 1.0)))

    def warp(self, fn):
        self.v = [Vector(fn(p.copy())) for p in self.v]
        return self

    def mirrored(self, axis=0):
        s = [1.0, 1.0, 1.0]
        s[axis] = -1.0
        return self.copy().sc(*s)

    # colour
    def paint(self, fn):
        """fn(co) -> colour, evaluated at the current vertex positions."""
        self.cols = [lin(fn(p)) for p in self.v]
        return self

    def paint_t(self, fn):
        self.cols = [lin(fn(t)) for t in self.t]
        return self

    def grad(self, c0, c1, axis=2, power=1.0):
        lo = min(p[axis] for p in self.v)
        hi = max(p[axis] for p in self.v)
        return self.paint(lambda p: mix(c0, c1, ((p[axis] - lo) / max(hi - lo, 1e-9)) ** power))

    def bounds(self):
        lo = Vector((min(p.x for p in self.v), min(p.y for p in self.v), min(p.z for p in self.v)))
        hi = Vector((max(p.x for p in self.v), max(p.y for p in self.v), max(p.z for p in self.v)))
        return lo, hi


def _from_bm(bm, sharp=40.0):
    ng = [f for f in bm.faces if len(f.verts) > 4]
    if ng:
        bmesh.ops.triangulate(bm, faces=ng)
    bm.verts.index_update()
    part = Part([v.co.copy() for v in bm.verts], [[v.index for v in f.verts] for f in bm.faces], sharp)
    bm.free()
    return part


# ---------------------------------------------------------------- primitives
def rbox(sx, sy, sz, r=0.01, seg=2, rv=None, segv=3, sharp=40.0):
    """Box centred on the origin. r bevels every edge; rv (optional) rounds the 4 vertical edges first."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= sx
        v.co.y *= sy
        v.co.z *= sz
    if rv:
        vert_edges = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) > sz * 0.5]
        bmesh.ops.bevel(bm, geom=vert_edges, offset=rv, offset_type="OFFSET", segments=segv,
                        profile=0.5, affect="EDGES", clamp_overlap=True)
        rim = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-7]
        if r > 0:
            bmesh.ops.bevel(bm, geom=rim, offset=r, offset_type="OFFSET", segments=seg,
                            profile=0.5, affect="EDGES", clamp_overlap=True)
    elif r > 0:
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=r, offset_type="OFFSET", segments=seg,
                        profile=0.5, affect="EDGES", clamp_overlap=True)
    return _from_bm(bm, sharp)


def lathe(profile, seg=16, sharp=40.0):
    """Revolve (radius, z) points around Z. Radius-0 points become a single pole; open ends get a cap."""
    pts = [(float(r), float(z)) for r, z in profile]
    verts, rings, faces, ts = [], [], [], []
    n = len(pts)
    for i, (r, z) in enumerate(pts):
        if r <= 1e-9:
            rings.append([len(verts)])
            verts.append((0.0, 0.0, z))
            ts.append(i / (n - 1))
        else:
            ring = []
            for k in range(seg):
                a = math.tau * k / seg
                ring.append(len(verts))
                verts.append((r * math.cos(a), r * math.sin(a), z))
                ts.append(i / (n - 1))
            rings.append(ring)
    for lo, up in zip(rings, rings[1:]):
        for k in range(seg):
            k2 = (k + 1) % seg
            if len(lo) == 1 and len(up) == 1:
                continue
            if len(lo) == 1:
                faces.append((lo[0], up[k2], up[k]))
            elif len(up) == 1:
                faces.append((lo[k], lo[k2], up[0]))
            else:
                faces.append((lo[k], lo[k2], up[k2], up[k]))
    for ring, flip in ((rings[0], True), (rings[-1], False)):
        if len(ring) > 1:                      # cap an open end with a centre fan
            c = len(verts)
            z = verts[ring[0]][2]
            verts.append((0.0, 0.0, z))
            ts.append(0.0 if flip else 1.0)
            for k in range(seg):
                k2 = (k + 1) % seg
                faces.append((c, ring[k2], ring[k]) if flip else (c, ring[k], ring[k2]))
    return Part(verts, faces, sharp, ts)


def ball(r=1.0, seg=14, rings=8, sharp=60.0):
    prof = [(r * math.sin(math.pi * i / rings), -r * math.cos(math.pi * i / rings)) for i in range(rings + 1)]
    prof[0] = (0.0, -r)
    prof[-1] = (0.0, r)
    return lathe(prof, seg, sharp)


def rcyl(r, h, b=0.008, seg=16, r2=None, sharp=40.0):
    """Chamfered cylinder / cone frustum standing on z=0."""
    r2 = r if r2 is None else r2
    return lathe([(0, 0), (max(r - b, 1e-4), 0), (r, b), (r2, h - b), (max(r2 - b, 1e-4), h), (0, h)], seg, sharp)


def tube(pts, rad, seg=8, closed=False, cap="round", squash=(1.0, 1.0), up=None, sharp=60.0):
    """Sweep a (squashed) circle along a polyline with parallel-transported frames."""
    pts = [Vector(p) for p in pts]
    n = len(pts)
    rf = rad if callable(rad) else (lambda _t: rad)
    tang = []
    for i in range(n):
        a = pts[(i - 1) % n] if (closed or i > 0) else pts[i]
        b = pts[(i + 1) % n] if (closed or i < n - 1) else pts[i]
        tang.append((b - a).normalized())
    nrm = Vector(up) if up else (Vector((0, 0, 1)) if abs(tang[0].z) < 0.9 else Vector((1, 0, 0)))
    nrm = (nrm - tang[0] * nrm.dot(tang[0])).normalized()
    verts, ts, rings = [], [], []
    for i in range(n):
        if i > 0:
            nrm = tang[i - 1].rotation_difference(tang[i]) @ nrm
            nrm = (nrm - tang[i] * nrm.dot(tang[i])).normalized()
        bn = tang[i].cross(nrm)
        t = i / (n - 1) if not closed else i / n
        r = rf(t)
        ring = []
        for k in range(seg):
            a = math.tau * k / seg
            ring.append(len(verts))
            verts.append(pts[i] + (nrm * math.cos(a) * squash[0] + bn * math.sin(a) * squash[1]) * r)
            ts.append(t)
        rings.append(ring)
    faces = []
    pairs = list(zip(rings, rings[1:])) + ([(rings[-1], rings[0])] if closed else [])
    for lo, upr in pairs:
        for k in range(seg):
            k2 = (k + 1) % seg
            faces.append((lo[k], lo[k2], upr[k2], upr[k]))
    if not closed:
        for ring, i, sgn in ((rings[0], 0, -1.0), (rings[-1], n - 1, 1.0)):
            c = len(verts)
            bulge = rf(0.0 if i == 0 else 1.0) * (0.55 if cap == "round" else 0.0)
            verts.append(pts[i] + tang[i] * sgn * bulge)
            ts.append(0.0 if i == 0 else 1.0)
            for k in range(seg):
                k2 = (k + 1) % seg
                faces.append((c, ring[k2], ring[k]) if sgn < 0 else (c, ring[k], ring[k2]))
    return Part(verts, faces, sharp, ts)


def torus(R, r, seg=20, tseg=8, squash=(1.0, 1.0), sharp=60.0):
    pts = [(R * math.cos(math.tau * i / seg), R * math.sin(math.tau * i / seg), 0.0) for i in range(seg)]
    return tube(pts, r, tseg, closed=True, squash=squash, up=(0, 0, 1), sharp=sharp)


def _area2(poly):
    return sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1]
               for i in range(len(poly)))


def plate(outer, holes=(), h=0.02, bevel=0.0, sharp=40.0):
    """Extrude a 2D outline (XY, with optional holes) to thickness h centred on z=0; chamfer the rims."""
    outer = list(outer)
    if _area2(outer) < 0:
        outer.reverse()
    loops = [outer]
    for hole in holes:
        hole = list(hole)
        if _area2(hole) > 0:
            hole.reverse()
        loops.append(hole)
    coords, faces_in = [], []
    for lp in loops:
        faces_in.append(list(range(len(coords), len(coords) + len(lp))))
        coords.extend(Vector((x, y)) for x, y in lp)
    v2, _e, tris, orig_v, _oe, _of = geo.delaunay_2d_cdt(coords, [], faces_in, 3, 1e-9)
    in2out = {}
    for oi, src in enumerate(orig_v):
        for s in src:
            in2out[s] = oi
    bm = bmesh.new()
    top = [bm.verts.new((p.x, p.y, h / 2)) for p in v2]
    bot = [bm.verts.new((p.x, p.y, -h / 2)) for p in v2]
    for tri in tris:
        bm.faces.new([top[i] for i in tri])
        bm.faces.new([bot[i] for i in reversed(tri)])
    rim = []
    for lp in faces_in:
        m = len(lp)
        for k in range(m):
            a, b = in2out[lp[k]], in2out[lp[(k + 1) % m]]
            f = bm.faces.new([bot[a], bot[b], top[b], top[a]])
            for e in f.edges:
                if abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-9:
                    rim.append(e)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(set(rim)), offset=bevel, offset_type="OFFSET", segments=1,
                        profile=0.5, affect="EDGES", clamp_overlap=True)
    return _from_bm(bm, sharp)


# ---------------------------------------------------------------- outlines / paths
def circle_pts(r, n=16, cx=0.0, cy=0.0, ry=None, a0=0.0):
    ry = r if ry is None else ry
    return [(cx + r * math.cos(a0 + math.tau * i / n), cy + ry * math.sin(a0 + math.tau * i / n)) for i in range(n)]


def rrect_pts(w, h, r, nc=3, cx=0.0, cy=0.0):
    out = []
    for qx, qy, a0 in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        ox, oy = cx + qx * (w / 2 - r), cy + qy * (h / 2 - r)
        for i in range(nc + 1):
            a = math.radians(a0 + 90 * i / nc)
            out.append((ox + r * math.cos(a), oy + r * math.sin(a)))
    return out


def arc_pts(R, a0, a1, n, plane="xz", c=(0.0, 0.0, 0.0)):
    """n+1 points on a circular arc (degrees) in the given plane."""
    out = []
    for i in range(n + 1):
        a = math.radians(a0 + (a1 - a0) * i / n)
        u, w = R * math.cos(a), R * math.sin(a)
        p = {"xz": (u, 0.0, w), "xy": (u, w, 0.0), "yz": (0.0, u, w)}[plane]
        out.append((p[0] + c[0], p[1] + c[1], p[2] + c[2]))
    return out


def helix_pts(R, pitch, turns, per_turn=12, R2=None, a0=0.0):
    n = int(round(turns * per_turn))
    R2 = R if R2 is None else R2
    out = []
    for i in range(n + 1):
        t = i / n
        a = a0 + math.tau * turns * t
        rr = R + (R2 - R) * t
        out.append((rr * math.cos(a), rr * math.sin(a), pitch * turns * t))
    return out


def leaf(length=0.1, width=0.045, thick=0.007, fold=0.35):
    """Pointed leaf lying in XY, stem at the origin, tip along +X, with a folded midrib."""
    n = 5
    up = [(length * t, width / 2 * math.sin(math.pi * t) ** 0.8) for t in (i / n for i in range(1, n))]
    outline = [(0.0, 0.0)] + [(x, -y) for x, y in up] + [(length, 0.0)] + [(x, y) for x, y in reversed(up)]
    p = plate(outline, h=thick, sharp=70)
    return p.warp(lambda v: (v.x, v.y, v.z + abs(v.y) * fold - 0.6 * fold * width * (v.x / length) ** 2))


def banana(length=0.2, r=0.024, bend=95.0, seg=6, n=9, yellow="#f8cc35", stem="#7d8a2c", tip="#5b3d1e",
           shade=None):
    """One banana: an arc in the XZ plane starting at the origin (stem) and curving up/out along +X."""
    R = length / math.radians(bend)
    pts = []
    for i in range(n + 1):
        a = math.radians(bend) * i / n
        pts.append((R * math.sin(a), 0.0, R * (1 - math.cos(a))))

    def rf(t):
        return r * ramp_f([(0, 0.34), (0.07, 0.40), (0.2, 0.95), (0.5, 1.0), (0.8, 0.88), (0.93, 0.5), (1, 0.3)], t)
    p = tube(pts, rf, seg, cap="round", up=(0, 1, 0), sharp=75)
    body = shade or yellow
    p.paint_t(lambda t: ramp([(0, stem), (0.1, stem), (0.2, yellow), (0.5, yellow), (0.86, body), (0.94, tip), (1, tip)], t))
    return p


def ramp_f(stops, t):
    if t <= stops[0][0]:
        return stops[0][1]
    for (t0, v0), (t1, v1) in zip(stops, stops[1:]):
        if t <= t1:
            return v0 + (v1 - v0) * (t - t0) / max(t1 - t0, 1e-9)
    return stops[-1][1]


def bullet(r=0.012, length=0.05, seg=8, case="#d9a441", head="#c97b4a"):
    """A .45-ish round standing on z=0: brass case, rim groove, round copper nose."""
    c = length * 0.62
    prof = [(0, 0), (r, 0), (r, c * 0.08), (r * 0.86, c * 0.12), (r, c * 0.2), (r, c),
            (r * 0.93, c + 0.001), (r * 0.86, c + (length - c) * 0.45), (r * 0.5, length - 0.004), (0, length)]
    p = lathe(prof, seg, sharp=45)
    p.paint(lambda v: lin(case) if v.z <= c + 1e-6 else lin(head))
    return p


# ---------------------------------------------------------------- model
class Model:
    def __init__(self, ident, name, kind="item"):
        self.id, self.name, self.kind = ident, name, kind
        self.parts = []
        self.icon_rot = (0.0, 0.0, 0.0)   # degrees, applied only for the icon render
        self.size_class = None            # override the automatic icon fill (0..1)

    def add(self, part, color=None, mat="matte"):
        if color is not None:
            c = lin(color)
            part.cols = [c] * len(part.v)
        if part.cols is None:
            raise ValueError(f"{self.id}: part without colour")
        self.parts.append((part, mat))
        return part

    def build(self, collection):
        used = []
        for _p, m in self.parts:
            if m not in used:
                used.append(m)
        bm = bmesh.new()
        col = bm.loops.layers.float_color.new(COLOR_ATTR)
        for part, matkey in self.parts:
            tmp = bmesh.new()
            tv = [tmp.verts.new(p) for p in part.v]
            for f in part.f:
                tmp.faces.new([tv[i] for i in f])
            tmp.normal_update()
            bmesh.ops.recalc_face_normals(tmp, faces=tmp.faces[:])
            tmp.verts.index_update()
            lim = math.radians(part.sharp)
            sharp_edges = set()
            for e in tmp.edges:
                if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > lim:
                    sharp_edges.add(tuple(sorted((e.verts[0].index, e.verts[1].index))))
            nv = [bm.verts.new(v.co) for v in tmp.verts]
            mi = used.index(matkey)
            for f in tmp.faces:
                idx = [v.index for v in f.verts]
                nf = bm.faces.new([nv[i] for i in idx])
                nf.material_index = mi
                nf.smooth = True
                for lp, i in zip(nf.loops, idx):
                    c = part.cols[i]
                    lp[col] = (c[0], c[1], c[2], 1.0)
                for e, (a, b) in zip(nf.edges, zip(idx, idx[1:] + idx[:1])):
                    if tuple(sorted((a, b))) in sharp_edges:
                        e.smooth = False
            tmp.free()
        # rest on the ground, centred
        lo = Vector((min(v.co.x for v in bm.verts), min(v.co.y for v in bm.verts), min(v.co.z for v in bm.verts)))
        hi = Vector((max(v.co.x for v in bm.verts), max(v.co.y for v in bm.verts), max(v.co.z for v in bm.verts)))
        off = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
        for v in bm.verts:
            v.co -= off
        me = bpy.data.meshes.new(self.id)
        bm.to_mesh(me)
        bm.free()
        me.color_attributes.active_color = me.color_attributes[COLOR_ATTR]
        me.color_attributes.render_color_index = 0
        for key in used:
            me.materials.append(material(key))
        ob = bpy.data.objects.new(self.id, me)
        collection.objects.link(ob)
        wn = ob.modifiers.new("WeightedNormal", "WEIGHTED_NORMAL")
        wn.mode = "FACE_AREA"
        wn.weight = 50
        wn.keep_sharp = True
        ob["item_name"] = self.name
        ob["kind"] = self.kind
        ob["icon_rot"] = list(self.icon_rot)
        if self.size_class is not None:
            ob["icon_fill"] = float(self.size_class)
        bake_ao(ob)
        tris = sum(len(p.vertices) - 2 for p in me.polygons)
        if tris > TRI_BUDGET:
            raise ValueError(f"{self.id}: {tris} tris > budget {TRI_BUDGET}")
        return ob, tris


def material(key):
    name = "MAT_Item_" + key.capitalize()
    mat = bpy.data.materials.get(name)
    if mat:
        return mat
    metallic, rough = MATS[key]
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = rough
    vc = nt.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = COLOR_ATTR
    vc.location = (-300, 200)
    nt.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


# ---------------------------------------------------------------- baked AO
def _hemi(n):
    out = []
    for i in range(n):                           # cosine-weighted Fibonacci hemisphere, +Z up
        u = (i + 0.5) / n
        r = math.sqrt(u)
        a = i * 2.399963229728653
        out.append(Vector((r * math.cos(a), r * math.sin(a), math.sqrt(1 - u))))
    return out


_HEMI = _hemi(28)
AO_TINT = (0.34, 0.27, 0.40)      # occluded corners fall towards a cool plum, never to black
AO_STRENGTH = 0.85


def bake_ao(ob):
    """Ray-cast ambient occlusion per face corner and multiply it into the colour attribute."""
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    ev = ob.evaluated_get(dg)
    me_e = ev.to_mesh()
    verts = [v.co.copy() for v in me_e.vertices]
    polys = [tuple(p.vertices) for p in me_e.polygons]
    normals = [Vector(n.vector) for n in me_e.corner_normals]
    loop_v = [l.vertex_index for l in me_e.loops]
    ev.to_mesh_clear()
    bvh = BVHTree.FromPolygons(verts, polys, epsilon=0.0)
    lo = Vector((min(v.x for v in verts), min(v.y for v in verts), min(v.z for v in verts)))
    hi = Vector((max(v.x for v in verts), max(v.y for v in verts), max(v.z for v in verts)))
    maxd = (hi - lo).length * 0.30
    eps = (hi - lo).length * 0.004
    cache = {}
    attr = ob.data.color_attributes[COLOR_ATTR]
    for li, vi in enumerate(loop_v):
        n = normals[li]
        key = (vi, round(n.x, 2), round(n.y, 2), round(n.z, 2))
        occ = cache.get(key)
        if occ is None:
            t = Vector((1, 0, 0)) if abs(n.x) < 0.8 else Vector((0, 1, 0))
            t = (t - n * t.dot(n)).normalized()
            b = n.cross(t)
            org = verts[vi] + n * eps
            acc = 0.0
            for h in _HEMI:
                d = t * h.x + b * h.y + n * h.z
                hit = bvh.ray_cast(org, d, maxd)
                if hit[0] is not None:
                    acc += 1.0 - hit[3] / maxd
            occ = cache[key] = (acc / len(_HEMI)) ** 0.8
        k = min(1.0, occ * 1.35) * AO_STRENGTH
        c = attr.data[li].color
        attr.data[li].color = (c[0] * (1 - k + k * AO_TINT[0]), c[1] * (1 - k + k * AO_TINT[1]),
                               c[2] * (1 - k + k * AO_TINT[2]), 1.0)
