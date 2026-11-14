"""Bananaville character pipeline: shared helpers (Blender 5.2, headless).

Conventions
- Blender space: +X = character's left, -Y = forward, +Z = up. The glTF exporter turns that into three.js
  x left, y up, +z forward (yaw 0 faces +z, as contracts.ts wants).
- V(x, f, z) builds a point from (left, forward, up).
- Parts are low cages (lofts, cube-spheres, surface plates) that get Catmull-Clark subdivision applied.
- Colour is not baked: every face carries a REGION id and every vertex an AO value. They travel to the GLB in
  the UV channel (u = (region + 0.5) / 32, v = ao); the runtime turns them into vertex colours from the Look.
"""
import math
import bmesh
import bpy
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

REGIONS = ["fur", "face", "suit", "pants", "tie", "feet", "shirt", "dark", "white", "pupil", "gold", "mouth",
           "tongue", "suit2", "stripeA", "stripeB", "sole", "prop", "prop2", "fur2", "skin", "metal", "red",
           "cloth", "chain", "mask", "hat", "band", "lens", "leather", "leather2", "banana", "green", "blue", "pink",
           "yellow", "khaki", "wood", "wood2", "glass", "skin2", "vest", "vest2", "nail", "ear", "square"]
REG = {n: i for i, n in enumerate(REGIONS)}
NREG = 48
# preview palette (Blender turnarounds only; the game sets these from MonkeyLook)
PALETTE = {
    "fur": "#e07a32", "face": "#f6c896", "suit": "#4d4848", "pants": "#3a3838", "tie": "#f46a10", "feet": "#c4612a",
    "shirt": "#fff6e6", "dark": "#3a2420", "white": "#ffffff", "pupil": "#1c1416", "gold": "#e8b84a",
    "mouth": "#5a1f24", "tongue": "#e8707a", "suit2": "#403c3c", "stripeA": "#f3eadb", "stripeB": "#2f2a36",
    "sole": "#2a2024", "prop": "#a8875a", "prop2": "#6e5334", "fur2": "#b85e24", "skin": "#4a4652",
    "metal": "#c9ccd6", "red": "#d9493a", "cloth": "#3a3d4c", "chain": "#e8c860", "mask": "#7a4ea0",
    "hat": "#343036", "band": "#f46a10", "lens": "#15131a", "leather": "#8a5a34", "leather2": "#6a4226", "banana": "#ffd84a",
    "green": "#5a9a4a", "blue": "#3a6ad1", "pink": "#ff6aa0", "yellow": "#ffc93a", "khaki": "#cdbd8c", "wood": "#b98a52",
    "wood2": "#8f6638", "glass": "#bfe6f2", "skin2": "#6a6674", "vest": "#4a4458", "vest2": "#d9d2c4", "nail": "#2c2a33",
    "ear": "#f0a468", "square": "#f6f2ea",
}


def V(x, f, z):
    return Vector((x, -f, z))


def srgb(hexs):
    h = hexs.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c]


def sgn(v):
    return (v > 0) - (v < 0)


def smooth(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a))) if b != a else float(x >= b)
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    return a + (b - a) * t


# ------------------------------------------------------------------ mesh accumulator
class M:
    """verts + faces + region id per face"""

    def __init__(self):
        self.v, self.f, self.r = [], [], []

    def add(self, o):
        off = len(self.v)
        self.v += [p.copy() for p in o.v]
        self.f += [tuple(i + off for i in f) for f in o.f]
        self.r += list(o.r)
        return self

    def xf(self, fn):
        self.v = [fn(p) for p in self.v]
        return self

    def mat(self, m):
        self.v = [m @ p for p in self.v]
        return self

    def move(self, d):
        return self.xf(lambda p: p + d)

    def mirror(self):
        m = M()
        m.v = [Vector((-p.x, p.y, p.z)) for p in self.v]
        m.f = [tuple(reversed(f)) for f in self.f]
        m.r = list(self.r)
        return m

    def both(self):
        """self plus its mirror across X"""
        return M().add(self).add(self.mirror())

    def flip(self):
        self.f = [tuple(reversed(f)) for f in self.f]
        return self

    def reg(self, r):
        self.r = [REG[r] if isinstance(r, str) else r] * len(self.f)
        return self

    def reg_where(self, r, fn):
        rid = REG[r]
        for i, f in enumerate(self.f):
            c = sum((self.v[k] for k in f), Vector()) / len(f)
            if fn(c):
                self.r[i] = rid
        return self

    def centroid(self):
        return sum(self.v, Vector()) / len(self.v)


_CUBE = [((1, 0, 0), (0, 1, 0), (0, 0, 1)), ((-1, 0, 0), (0, 0, 1), (0, 1, 0)), ((0, 1, 0), (0, 0, 1), (1, 0, 0)),
         ((0, -1, 0), (1, 0, 0), (0, 0, 1)), ((0, 0, 1), (1, 0, 0), (0, 1, 0)), ((0, 0, -1), (0, 1, 0), (1, 0, 0))]


def qsphere(n, reg="fur"):
    """unit sphere as a cube-sphere: all quads, even spread (the right base for smooth toy blobs)"""
    m, key = M(), {}

    def vid(p):
        k = (round(p.x, 5), round(p.y, 5), round(p.z, 5))
        if k not in key:
            key[k] = len(m.v)
            m.v.append(p)
        return key[k]
    for nrm, u, v in _CUBE:
        N, U, W = Vector(nrm), Vector(u), Vector(v)
        g = [[vid((N + U * math.tan((i / n * 2 - 1) * math.pi / 4) + W * math.tan((j / n * 2 - 1) * math.pi / 4)).normalized())
              for j in range(n + 1)] for i in range(n + 1)]
        for i in range(n):
            for j in range(n):
                m.f.append((g[i][j], g[i + 1][j], g[i + 1][j + 1], g[i][j + 1]))
    return m.reg(reg)


def ell(n, c, r, reg="fur", rot=None):
    """ellipsoid: centre c, radii r = (rx, ry, rz) in Blender axes, optional rotation matrix"""
    m = qsphere(n, reg)
    R = rot.to_3x3() if rot is not None else Matrix.Identity(3)
    return m.xf(lambda p: c + R @ Vector((p.x * r[0], p.y * r[1], p.z * r[2])))


def ring(c, u, v, ru, rv, m, p=2.0, phase=0.0):
    """superellipse ring around centre c in the plane (u, v)"""
    e, out = 2.0 / p, []
    for k in range(m):
        t = 2 * math.pi * (k + phase) / m
        cs, sn = math.cos(t), math.sin(t)
        out.append(c + u * (ru * sgn(cs) * abs(cs) ** e) + v * (rv * sgn(sn) * abs(sn) ** e))
    return out


def loft(rings, regs="fur", cap0=None, cap1=None):
    """quads between consecutive rings; regs = one region or a list per band; caps = centre points (fans)"""
    m, n = M(), len(rings[0])
    for r in rings:
        m.v += [p.copy() for p in r]
    for i in range(len(rings) - 1):
        rg = regs[i] if isinstance(regs, (list, tuple)) else regs
        for k in range(n):
            m.f.append((i * n + k, i * n + (k + 1) % n, (i + 1) * n + (k + 1) % n, (i + 1) * n + k))
            m.r.append(REG[rg])
    for cap, base, rg in ((cap0, 0, 0), (cap1, (len(rings) - 1) * n, -1)):
        if cap is None:
            continue
        ci = len(m.v)
        m.v.append(cap.copy())
        rr = regs[rg] if isinstance(regs, (list, tuple)) else regs
        for k in range(n):
            a, b = base + k, base + (k + 1) % n
            m.f.append((b, a, ci) if base == 0 else (a, b, ci))
            m.r.append(REG[rr])
    return m


def tube(path, radii, m=6, reg="fur", up=Vector((0, 0, 1)), flat=1.0, cap0=True, cap1=True, regs=None):
    """round tube along a polyline (parallel-transported frames); flat squashes the second axis"""
    rings, prev_u = [], None
    for i, p in enumerate(path):
        a = path[max(0, i - 1)]
        b = path[min(len(path) - 1, i + 1)]
        t = (b - a).normalized()
        u = (prev_u if prev_u is not None else up.cross(t))
        u = (u - t * u.dot(t))
        if u.length < 1e-5:
            u = Vector((1, 0, 0)).cross(t)
        u.normalize()
        v = t.cross(u)
        prev_u = u
        rings.append(ring(p, u, v, radii[i], radii[i] * flat, m))
    return loft(rings, regs or reg, path[0] - (path[1] - path[0]).normalized() * radii[0] * 0.6 if cap0 else None,
                path[-1] + (path[-1] - path[-2]).normalized() * radii[-1] * 0.6 if cap1 else None)


def tight(i, n, e):
    """grid parameter with narrow border cells: 0, e, ..., 1-e, 1"""
    if i == 0:
        return 0.0
    if i == n:
        return 1.0
    return e + (1 - 2 * e) * (i - 1) / (n - 2) if n > 2 else 0.5


def bvh_of(objs_or_m):
    """BVH of an M or of built objects (world space)"""
    if isinstance(objs_or_m, M):
        return BVHTree.FromPolygons([tuple(p) for p in objs_or_m.v], objs_or_m.f)
    vs, fs = [], []
    for ob in objs_or_m:
        off = len(vs)
        vs += [tuple(ob.matrix_world @ v.co) for v in ob.data.vertices]
        fs += [tuple(i + off for i in p.vertices) for p in ob.data.polygons]
    return BVHTree.FromPolygons(vs, fs)


class Surf:
    """front-projected surface lookup on a BVH: (x, z) -> point + outward normal; dirv = ray travel direction"""

    def __init__(self, bvh, dirv=Vector((0, 1, 0)), far=3.0):
        self.bvh, self.d, self.far = bvh, dirv.normalized(), far
        up = Vector((0, 0, 1))
        self.ux = up.cross(self.d).normalized() if abs(self.d.z) < 0.9 else Vector((1, 0, 0))
        self.ux = -self.ux if self.ux.x < 0 else self.ux
        self.uz = self.d.cross(self.ux)
        self.uz = -self.uz if self.uz.z < 0 else self.uz

    def at(self, x, z):
        o = self.ux * x + self.uz * z - self.d * self.far
        loc, nrm, _i, _d = self.bvh.ray_cast(o, self.d)
        if loc is None:
            raise ValueError("surface miss at %.3f %.3f" % (x, z))
        if nrm.dot(self.d) > 0:
            nrm = -nrm
        return loc, nrm


def _orient(m, hint_fn):
    """make an open plate face outward (hint_fn(centroid) = outward direction)"""
    bad = 0
    for f in m.f:
        a, b, c = m.v[f[0]], m.v[f[1]], m.v[f[2]]
        nrm = (b - a).cross(c - a)
        bad += 1 if nrm.dot(hint_fn((a + b + c) / 3)) < 0 else -1
    if bad > 0:
        m.flip()
    return m


def plate(surf, corners, n, mm, lift, reg, sink=0.006, edge=0.12, bow=None, lift_fn=None):
    """raised panel laid on a surface: corners = 4 (x, z) points [bl, br, tr, tl]; the border row sinks into
    the base so there is no gap and no coplanar overlap; bow(s, t) -> (dx, dz) curves the outline"""
    m, g = M(), []
    bl, br, tr, tl = [Vector((c[0], c[1])) for c in corners]
    for j in range(mm + 1):
        row = []
        for i in range(n + 1):
            s, t = tight(i, n, edge), tight(j, mm, edge)
            q = (bl * (1 - s) + br * s) * (1 - t) + (tl * (1 - s) + tr * s) * t
            if bow:
                d = bow(s, t)
                q = q + Vector((d[0], d[1]))
            loc, nrm = surf.at(q.x, q.y)
            border = i in (0, n) or j in (0, mm)
            h = -sink if border else (lift_fn(s, t) if lift_fn else lift)
            row.append(len(m.v))
            m.v.append(loc + nrm * h)
        g.append(row)
    for j in range(mm):
        for i in range(n):
            m.f.append((g[j][i], g[j][i + 1], g[j + 1][i + 1], g[j + 1][i]))
    m.reg(reg)
    return _orient(m, lambda c: -surf.d)


def disc_plate(surf, cx, cz, rfn, n, lift_fn, reg, sink=0.008, rows=None):
    """raised panel with a free outline r(theta) around (cx, cz), concentric square grid (all quads)"""
    m, g = M(), []
    for j in range(n + 1):
        row = []
        for i in range(n + 1):
            a, b = i / n * 2 - 1, j / n * 2 - 1
            if abs(a) < 1e-9 and abs(b) < 1e-9:
                r, ph = 0.0, 0.0
            elif abs(a) > abs(b):
                r, ph = a, math.pi / 4 * (b / a)
            else:
                r, ph = b, math.pi / 2 - math.pi / 4 * (a / b)
            x, z = r * math.cos(ph), r * math.sin(ph)
            rho = math.hypot(x, z)
            th = math.atan2(z, x)
            k = round(rho * (n / 2))            # ring index 0..n/2
            rr = rows[k] if rows else rho
            R = rfn(th) * rr
            px, pz = cx + R * math.cos(th), cz + R * math.sin(th)
            loc, nrm = surf.at(px, pz)
            h = -sink if k == n // 2 else lift_fn(px, pz, rr)
            row.append(len(m.v))
            m.v.append(loc + nrm * h)
        g.append(row)
    for j in range(n):
        for i in range(n):
            m.f.append((g[j][i], g[j][i + 1], g[j + 1][i + 1], g[j + 1][i]))
    m.reg(reg)
    return _orient(m, lambda c: -surf.d)


def frame_at(surf, x, z):
    """point + tangent frame (u lateral, v up, n out) on a surface"""
    p, n = surf.at(x, z)
    u = Vector((0, 0, 1)).cross(n)
    u = u.normalized() if u.length > 1e-5 else Vector((1, 0, 0))
    if u.x < 0:
        u = -u
    v = n.cross(u).normalized()
    if v.z < 0:
        v = -v
    return p, u, v, n


def blob_on(surf, x, z, ru, rv, rn, n=3, reg="dark", sinkf=0.35, rot=0.0):
    """ellipsoid sitting on a surface (partly sunk), axes follow the surface frame"""
    p, u, v, nn = frame_at(surf, x, z)
    if rot:
        c, s = math.cos(rot), math.sin(rot)
        u, v = u * c + v * s, v * c - u * s
    m = qsphere(n, reg)
    return m.xf(lambda q: p - nn * (rn * sinkf) + u * (q.x * ru) + v * (q.z * rv) + nn * (-q.y * rn))


# ------------------------------------------------------------------ Blender objects
def clean_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = "METRIC"
    return sc


def preview_material(name="bv_matte", rough=0.62):
    mat = bpy.data.materials.get(name)
    if mat:
        return mat
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    if nt is None:
        mat.use_nodes = True
        nt = mat.node_tree
    bsdf = next(nd for nd in nt.nodes if nd.type == "BSDF_PRINCIPLED")
    at = nt.nodes.new("ShaderNodeVertexColor")
    at.layer_name = "Col"
    nt.links.new(at.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = rough
    return mat


def build(name, m, levels=1, coll=None, mat="bv_matte", rough=0.62):
    """M -> subdivided, smooth-shaded mesh object with a face attribute 'reg'"""
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(p) for p in m.v], [], m.f)
    me.validate()
    for i, p in enumerate(me.polygons):
        p.material_index = 0
    at = me.attributes.new("reg", "INT", "FACE")
    at.data.foreach_set("value", m.r)
    bm = bmesh.new()
    bm.from_mesh(me)
    # closed islands: recalc outward; open plates keep their authored winding
    seen, faces = set(), list(bm.faces)
    for f0 in faces:
        if f0 in seen:
            continue
        comp, stack, closed = [], [f0], True
        seen.add(f0)
        while stack:
            f = stack.pop()
            comp.append(f)
            for e in f.edges:
                if len(e.link_faces) != 2:
                    closed = False
                for g in e.link_faces:
                    if g not in seen:
                        seen.add(g)
                        stack.append(g)
        if closed:
            bmesh.ops.recalc_face_normals(bm, faces=comp)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    (coll or bpy.context.scene.collection).objects.link(ob)
    if levels:
        md = ob.modifiers.new("ss", "SUBSURF")
        md.levels = md.render_levels = levels
        md.subdivision_type = "CATMULL_CLARK"
        md.boundary_smooth = "PRESERVE_CORNERS"
        dg = bpy.context.evaluated_depsgraph_get()
        me2 = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
        ob.modifiers.clear()
        ob.data = me2
        bpy.data.meshes.remove(me)
        me2.name = name
        me = me2
    me.shade_smooth()
    me.materials.append(preview_material(mat, rough))
    return ob


def assemble(name, pieces, wfn=None, weld=False):
    """pieces: [(M, subdiv levels, weight fn or None, gloss?)] -> one object; face attr 'reg', point attr 'piece'
    (index into wfn, a dict the caller owns), material slot 1 = gloss"""
    vs, fs, rg, pc, mi = [], [], [], [], []
    for piece in pieces:
        m, lv, wf = piece[0], piece[1], piece[2]
        gloss = len(piece) > 3 and piece[3]
        if not m.v:
            continue
        ob = build("_tmp", m, lv)
        me = ob.data
        off = len(vs)
        pid = 0
        if wfn is not None:
            pid = len(wfn)
            wfn[pid] = wf
        vs += [tuple(v.co) for v in me.vertices]
        fs += [tuple(i + off for i in p.vertices) for p in me.polygons]
        rg += [a.value for a in me.attributes["reg"].data]
        mi += [1 if gloss else 0] * len(me.polygons)
        pc += [pid] * len(me.vertices)
        bpy.data.objects.remove(ob)
        bpy.data.meshes.remove(me)
    me = bpy.data.meshes.new(name)
    me.from_pydata(vs, [], fs)
    me.attributes.new("reg", "INT", "FACE").data.foreach_set("value", rg)
    me.attributes.new("piece", "INT", "POINT").data.foreach_set("value", pc)
    me.attributes.new("gloss", "INT", "FACE").data.foreach_set("value", mi)
    if weld:                                    # close loft seams (coincident rings) so islands are connected
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        bm.to_mesh(me)
        bm.free()
        mi = [a.value for a in me.attributes["gloss"].data]
    me.shade_smooth()
    me.materials.append(preview_material())
    if any(mi):
        me.materials.append(preview_material("bv_gloss", 0.18))
        me.polygons.foreach_set("material_index", mi)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def lathe(profile, m=10, sy=1.0, p=2.0):
    """revolve a profile [(radius, z, region of the band below)] around Z; sy squashes depth; closed by fans
    when the end radii are small"""
    Xa, Ya = Vector((1, 0, 0)), Vector((0, 1, 0))
    rings = [ring(Vector((0, 0, z)), Xa, Ya, r, r * sy, m, p) for r, z, _ in profile]
    regs = [q[2] for q in profile[1:]]
    return loft(rings, regs, Vector((0, 0, profile[0][1])) if profile[0][0] < 0.08 else None,
                Vector((0, 0, profile[-1][1])) if profile[-1][0] < 0.08 else None)


def box(c, half, reg="prop", n=3, gamma=0.45, rot=None):
    """box cage with edge loops near the corners (subdivide it once for a soft bevelled box), all quads"""
    m = qsphere(n, reg)
    R = rot.to_3x3() if rot is not None else Matrix.Identity(3)

    def sh(q):
        k = max(abs(q.x), abs(q.y), abs(q.z))
        b = q / k
        w = [sgn(v) * abs(v) ** gamma if abs(v) < 0.999 else v for v in b]
        return c + R @ Vector((w[0] * half[0], w[1] * half[1], w[2] * half[2]))
    return m.xf(sh)


def rbox(c, half, r=0.03, reg="prop", n=3, rot=None):
    """chamfered box at final resolution: loops sit where the corner rounding starts (r in metres)"""
    m = qsphere(n, reg)
    R = rot.to_3x3() if rot is not None else Matrix.Identity(3)

    def sh(q):
        k = max(abs(q.x), abs(q.y), abs(q.z))
        b = q / k
        out = []
        dv = []
        for v, h in zip(b, half):
            rr = min(r, h * 0.95)
            t = (h - rr)
            w = v * h if abs(v) > 0.999 else (sgn(v) * t if abs(v) > 1e-6 and n == 3 else v * t)
            inner = max(-t, min(t, w))
            out.append(inner)
            dv.append((w - inner) / rr if rr > 0 else 0.0)
        d = Vector(dv)
        if d.length > 1e-6:
            d.normalize()
        return c + R @ Vector((out[0] + d.x * min(r, half[0] * 0.95), out[1] + d.y * min(r, half[1] * 0.95), out[2] + d.z * min(r, half[2] * 0.95)))
    return m.xf(sh)


def tris(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


_HEMI = None


def _hemi(n):
    global _HEMI
    if _HEMI is None or len(_HEMI) != n:
        _HEMI, g = [], math.pi * (3 - math.sqrt(5))
        for i in range(n):
            z = math.sqrt((i + 0.5) / n)          # cosine weighted
            r = math.sqrt(1 - z * z)
            _HEMI.append((r * math.cos(g * i), r * math.sin(g * i), z))
    return _HEMI


def bake_ao(targets, occluders, samples=28, dist=0.32, strength=1.0):
    """per-vertex ambient occlusion -> point attribute 'ao' (1 = open, 0 = buried)"""
    bvh = bvh_of(occluders)
    for ob in targets:
        me = ob.data
        vals = []
        for v in me.vertices:
            n = v.normal
            t = n.orthogonal().normalized()
            b = n.cross(t)
            o = v.co + n * 0.006
            occ = 0.0
            for hx, hy, hz in _hemi(samples):
                d = t * hx + b * hy + n * hz
                hit = bvh.ray_cast(o, d, dist)
                if hit[0] is not None:
                    occ += 1.0 - (hit[3] / dist) ** 2
            vals.append(max(0.0, 1.0 - strength * occ / samples))
        # one smoothing pass over edges
        acc, cnt = list(vals), [1] * len(vals)
        for e in me.edges:
            a, b2 = e.vertices
            acc[a] += vals[b2]
            cnt[a] += 1
            acc[b2] += vals[a]
            cnt[b2] += 1
        vals = [a / c for a, c in zip(acc, cnt)]
        at = me.attributes.get("ao") or me.attributes.new("ao", "FLOAT", "POINT")
        at.data.foreach_set("value", vals)


AO_TINT = (0.42, 0.34, 0.40)
NO_AO = {REG["white"]}


def write_uv_and_col(ob, palette=None):
    """UV = (region, ao) for the game; colour attribute 'Col' for Blender previews"""
    me, pal = ob.data, dict(PALETTE)
    pal.update(palette or {})
    lin = [srgb(pal.get(n, "#ff00ff")) for n in REGIONS]
    reg = me.attributes["reg"].data
    ao = me.attributes["ao"].data if me.attributes.get("ao") else None
    uv = me.uv_layers.get("UVMap") or me.uv_layers.new(name="UVMap")
    col = me.color_attributes.get("Col") or me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    for p in me.polygons:
        r = reg[p.index].value
        for li in p.loop_indices:
            a = ao[me.loops[li].vertex_index].value if ao and r not in NO_AO else 1.0
            uv.data[li].uv = ((r + 0.5) / NREG, a)
            k = a * a * (3 - 2 * a)
            c = lin[r]
            col.data[li].color = (c[0] * lerp(AO_TINT[0], 1, k), c[1] * lerp(AO_TINT[1], 1, k), c[2] * lerp(AO_TINT[2], 1, k), 1)
    me.color_attributes.active_color = col
    me.color_attributes.render_color_index = list(me.color_attributes).index(col)


def set_weights(ob, fn):
    """fn(co) -> {bone: weight}; normalised, max 4 influences"""
    groups = {}
    for v in ob.data.vertices:
        w = {k: x for k, x in fn(v.co).items() if x > 1e-4}
        w = dict(sorted(w.items(), key=lambda kv: -kv[1])[:4])
        tot = sum(w.values())
        for k, x in w.items():
            g = groups.get(k) or groups.setdefault(k, ob.vertex_groups.new(name=k))
            g.add([v.index], x / tot, "REPLACE")


def chain_weights(joints, names, blend=0.35):
    """weights along a bone chain: joints = points [j0..jn], names = bones for each segment (n). Smooth blends
    of width `blend` (fraction of the shorter neighbour segment) across every joint."""
    segs = [(joints[i], joints[i + 1]) for i in range(len(names))]

    def fn(co):
        best, bi, bt = 1e9, 0, 0.0
        for i, (a, b) in enumerate(segs):
            ab = b - a
            t = (co - a).dot(ab) / ab.length_squared
            tc = min(1, max(0, t))
            d = (a + ab * tc - co).length
            if d < best:
                best, bi, bt = d, i, t
        w = {names[bi]: 1.0}
        ln = (segs[bi][1] - segs[bi][0]).length
        if bi > 0:
            wd = blend * min(ln, (segs[bi - 1][1] - segs[bi - 1][0]).length)
            k = 0.5 * (1 - smooth(0, 1, bt * ln / wd)) if wd > 0 else 0
            if k > 0:
                w[names[bi - 1]] = w.get(names[bi - 1], 0) + k
                w[names[bi]] -= k
        if bi < len(segs) - 1:
            wd = blend * min(ln, (segs[bi + 1][1] - segs[bi + 1][0]).length)
            k = 0.5 * (1 - smooth(0, 1, (1 - bt) * ln / wd)) if wd > 0 else 0
            if k > 0:
                w[names[bi + 1]] = w.get(names[bi + 1], 0) + k
                w[names[bi]] -= k
        return w
    return fn


def add_shape_key(ob, name, target_ob=None, fn=None):
    """shape key from a same-topology object, or from fn(co) -> co"""
    if not ob.data.shape_keys:
        ob.shape_key_add(name="Basis", from_mix=False)
    sk = ob.shape_key_add(name=name, from_mix=False)
    for i, v in enumerate(ob.data.vertices):
        sk.data[i].co = target_ob.data.vertices[i].co if target_ob else fn(v.co)
    sk.value = 0
    return sk


def make_armature(name, bones, coll=None):
    """bones: list of (name, parent, head, tail, roll_axis, deform)"""
    arm = bpy.data.armatures.new(name)
    ob = bpy.data.objects.new(name, arm)
    (coll or bpy.context.scene.collection).objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")
    for bn, parent, head, tail, roll, _deform in bones:
        eb = arm.edit_bones.new(bn)
        eb.head, eb.tail = head, tail
        eb.align_roll(roll)
        if parent:
            eb.parent = arm.edit_bones[parent]
            eb.use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")
    for bn, _p, _h, _t, _r, deform in bones:
        arm.bones[bn].use_deform = deform
    arm.display_type = "STICK"
    return ob


def skin_to(ob, arm_ob):
    ob.parent = arm_ob
    md = ob.modifiers.new("Armature", "ARMATURE")
    md.object = arm_ob


def export_glb(path, objs, anim=True):
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for o in objs:
        o.hide_set(False)
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True, export_yup=True, export_apply=False,
        export_normals=True, export_tangents=False, export_materials="EXPORT", export_vertex_color="NONE",
        export_texcoords=True, export_skins=True, export_all_influences=False, export_influence_nb=4,
        export_morph=True, export_morph_normal=True, export_animations=anim, export_animation_mode="NLA_TRACKS",
        export_force_sampling=True, export_frame_step=1, export_optimize_animation_size=True,
        export_optimize_animation_keep_anim_armature=True, export_def_bones=False, export_extras=True,
        export_rest_position_armature=True, export_anim_slide_to_zero=True, export_image_format="NONE")


# ------------------------------------------------------------------ review renders
def _look_at(ob, target):
    d = (Vector(target) - ob.location)
    ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def setup_studio(bg=(0.80, 0.76, 0.66)):
    sc = bpy.context.scene
    try:
        sc.render.engine = "BLENDER_EEVEE"
    except TypeError:
        pass
    w = bpy.data.worlds.new("studio")
    sc.world = w
    if w.node_tree is None:
        w.use_nodes = True
    bgn = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
    bgn.inputs["Color"].default_value = (*bg, 1)
    bgn.inputs["Strength"].default_value = 0.55
    for nm, loc, energy, color in (("key", (2.5, -3.5, 5.0), 3.2, (1, 0.93, 0.82)), ("rim", (-3.0, 3.5, 3.0), 1.6, (0.75, 0.85, 1.0))):
        l = bpy.data.lights.new(nm, "SUN")
        l.energy, l.color = energy, color
        l.angle = 0.25
        lo = bpy.data.objects.new(nm, l)
        lo.location = loc
        sc.collection.objects.link(lo)
        _look_at(lo, (0, 0, 1))
    cam = bpy.data.cameras.new("cam")
    cam.lens = 85
    co = bpy.data.objects.new("cam", cam)
    sc.collection.objects.link(co)
    sc.camera = co
    try:
        sc.view_settings.view_transform = "Standard"
    except TypeError:
        pass
    sc.render.film_transparent = False
    return co


def render_views(path, center, dist, views, res=(560, 640), frame=None):
    """render views [(name, azimuth_deg, elevation_deg)] and stitch a sheet with ImageMagick montage"""
    import os
    import subprocess
    import tempfile
    sc = bpy.context.scene
    cam = sc.camera
    if frame is not None:
        sc.frame_set(frame)
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.image_settings.file_format = "PNG"
    tmp, files = tempfile.mkdtemp(prefix="bv_"), []
    for nm, az, el in views:
        a, e = math.radians(az), math.radians(el)
        cam.location = Vector(center) + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist
        _look_at(cam, center)
        sc.render.filepath = os.path.join(tmp, nm + ".png")
        bpy.ops.render.render(write_still=True)
        files.append(sc.render.filepath)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    subprocess.run(["montage", *files, "-tile", "%dx" % min(len(files), 4), "-geometry", "+2+2", "-background", "#222", path], check=True)
    for f in files:
        os.remove(f)
    os.rmdir(tmp)
    return path


TURN = [("front", 0, 8), ("three_quarter", 35, 14), ("side", 90, 8), ("back", 180, 10)]


def render_strip(path, center, dist, az, el, frames, res=(360, 420), cols=8):
    """one view, many frames -> contact strip (motion review)"""
    import os
    import subprocess
    import tempfile
    sc = bpy.context.scene
    cam = sc.camera
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.image_settings.file_format = "PNG"
    a, e = math.radians(az), math.radians(el)
    cam.location = Vector(center) + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist
    _look_at(cam, center)
    tmp, files = tempfile.mkdtemp(prefix="bv_"), []
    for f in frames:
        sc.frame_set(int(f))
        sc.render.filepath = os.path.join(tmp, "f%03d.png" % len(files))
        bpy.ops.render.render(write_still=True)
        files.append(sc.render.filepath)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    subprocess.run(["montage", *files, "-tile", "%dx" % min(len(files), cols), "-geometry", "+1+1", "-background", "#222", path], check=True)
    for f in files:
        os.remove(f)
    os.rmdir(tmp)
