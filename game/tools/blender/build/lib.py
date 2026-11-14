"""Bananaville structures + landmarks kit: shared build library (Blender 5.2, headless).

Every asset is authored as Python. Geometry is built from a few primitives (chamfered boxes, lathes, tubes,
prisms, lofts, convex-hull rocks, flat decals), coloured per face corner, then ambient occlusion is ray-baked
into the colour attribute "Col" (exported as glTF COLOR_0, linear). No UVs and no image textures.

Authoring space is Blender's: x = east, y = north (away from the camera), z = up, 1 unit = 1 m. An asset's FRONT
faces -y, which the glTF exporter turns into three.js +z (yaw 0 faces +z in the game).

Node layout per asset in the GLB (three.js reads userData from the glTF extras):
  <asset>                 empty, extras {asset, footprint, blocksMove, blocksShot, tall, glow, tris}
    <asset>__matte        static mesh, extras {kind:"static", mat:"matte"}     (also __foliage, __emissive)
    <asset>__<part>       mesh with its origin on the pivot, extras {kind:"part", part:"<part>", mat}
    <asset>__<point>      empty, extras {kind:"point", part:"<point>"}
"""
import bpy, bmesh, math, random, json, os, sys, time
from itertools import product
from math import sin, cos, pi, radians, sqrt, atan2
from mathutils import Vector, Matrix, Euler
from mathutils.bvhtree import BVHTree
from mathutils.geometry import tessellate_polygon

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OUT_GLB = os.path.join(ROOT, "public", "models", "build")
OUT_BLEND = os.path.join(HERE, "blend")
OUT_RENDER = os.path.join(ROOT, "spikes", "build")


# ------------------------------------------------------------------ colour (authored in sRGB, stored linear)
def C(h):
    if isinstance(h, str):
        h = h.lstrip("#")
        return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    return tuple(h)


def mix(a, b, t):
    a, b = C(a), C(b)
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def shade(c, k):
    return tuple(min(1.0, max(0.0, x * k)) for x in C(c))


def s2l(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


# ------------------------------------------------------------------ transforms
def T(x=0.0, y=0.0, z=0.0, rx=0.0, ry=0.0, rz=0.0, s=1.0, sy=None, sz=None):
    """translate * rotate (XYZ euler, degrees) * scale"""
    m = Matrix.Translation((x, y, z)) @ Euler((radians(rx), radians(ry), radians(rz)), "XYZ").to_matrix().to_4x4()
    if s != 1.0 or sy is not None or sz is not None:
        m = m @ Matrix.Diagonal((s, s if sy is None else sy, s if sz is None else sz, 1.0))
    return m


def along(p0, p1, roll=0.0):
    """matrix whose local +z runs from p0 to p1, origin at p0"""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    q = d.to_track_quat("Z", "Y")
    return Matrix.Translation(p0) @ q.to_matrix().to_4x4() @ Matrix.Rotation(radians(roll), 4, "Z")


# ------------------------------------------------------------------ primitives -> (verts, faces, tags)
# tags: 0 main surface, 1 bevel (gets the edge highlight), 2 cap / end grain
def _orient_convex(V, F, c=(0, 0, 0)):
    c = Vector(c)
    out = []
    for f in F:
        a, b, d = Vector(V[f[0]]), Vector(V[f[1]]), Vector(V[f[2]])
        n = (b - a).cross(d - a)
        cen = sum((Vector(V[i]) for i in f), Vector()) / len(f)
        out.append(list(f) if n.dot(cen - c) >= 0 else list(reversed(f)))
    return out


def p_box(sx, sy, sz, b=0.03, taper=None):
    """chamfered box, centred on x/y, sitting on z=0. taper=(tx,ty) scales the top."""
    hx, hy, hz = sx / 2, sy / 2, sz / 2
    b = min(b, hx * 0.7, hy * 0.7, hz * 0.7)
    V, F, G = [], [], []
    if b < 1e-5:
        ix = {}
        for a, c, d in product((-1, 1), repeat=3):
            ix[(a, c, d)] = len(V); V.append((a * hx, c * hy, d * hz))
        for a in (-1, 1):
            F.append([ix[(a, -1, -1)], ix[(a, 1, -1)], ix[(a, 1, 1)], ix[(a, -1, 1)]])
            F.append([ix[(-1, a, -1)], ix[(1, a, -1)], ix[(1, a, 1)], ix[(-1, a, 1)]])
            F.append([ix[(-1, -1, a)], ix[(1, -1, a)], ix[(1, 1, a)], ix[(-1, 1, a)]])
        G = [0] * 6
    else:
        ix = {}
        for a, c, d in product((-1, 1), repeat=3):
            ix[(a, c, d, 0)] = len(V); V.append((a * hx, c * (hy - b), d * (hz - b)))
            ix[(a, c, d, 1)] = len(V); V.append((a * (hx - b), c * hy, d * (hz - b)))
            ix[(a, c, d, 2)] = len(V); V.append((a * (hx - b), c * (hy - b), d * hz))
        for a in (-1, 1):
            F.append([ix[(a, -1, -1, 0)], ix[(a, 1, -1, 0)], ix[(a, 1, 1, 0)], ix[(a, -1, 1, 0)]])
            F.append([ix[(-1, a, -1, 1)], ix[(1, a, -1, 1)], ix[(1, a, 1, 1)], ix[(-1, a, 1, 1)]])
            F.append([ix[(-1, -1, a, 2)], ix[(1, -1, a, 2)], ix[(1, 1, a, 2)], ix[(-1, 1, a, 2)]])
        G = [0] * 6
        for a, c in product((-1, 1), repeat=2):
            F.append([ix[(a, c, -1, 0)], ix[(a, c, -1, 1)], ix[(a, c, 1, 1)], ix[(a, c, 1, 0)]])
            F.append([ix[(a, -1, c, 0)], ix[(a, -1, c, 2)], ix[(a, 1, c, 2)], ix[(a, 1, c, 0)]])
            F.append([ix[(-1, a, c, 1)], ix[(-1, a, c, 2)], ix[(1, a, c, 2)], ix[(1, a, c, 1)]])
        G += [1] * 12
        for a, c, d in product((-1, 1), repeat=3):
            F.append([ix[(a, c, d, 0)], ix[(a, c, d, 1)], ix[(a, c, d, 2)]])
        G += [1] * 8
    F = _orient_convex(V, F)
    out = []
    for x, y, z in V:
        z += hz
        if taper:
            t = z / sz
            x *= 1 + (taper[0] - 1) * t
            y *= 1 + (taper[1] - 1) * t
        out.append((x, y, z))
    return out, F, G


def p_lathe(profile, n=12, cap0=True, cap1=True, tags=None, arc=360.0):
    """revolve (r, z) points (bottom to top) about z. r==0 at an end makes a pole; otherwise the end is capped."""
    V, F, G = [], [], []
    rings = []
    full = arc >= 359.9
    cnt = n if full else n + 1
    for r, z in profile:
        if r < 1e-6:
            rings.append([len(V)]); V.append((0.0, 0.0, z))
        else:
            ring = []
            for k in range(cnt):
                a = radians(arc) * k / n
                ring.append(len(V)); V.append((r * cos(a), r * sin(a), z))
            rings.append(ring)
    segs = n if full else n
    for i in range(len(rings) - 1):
        lo, hi = rings[i], rings[i + 1]
        tg = tags[i] if tags else 0
        for k in range(segs):
            k2 = (k + 1) % cnt if full else k + 1
            if len(lo) == 1 and len(hi) == 1:
                continue
            if len(lo) == 1:
                F.append([lo[0], hi[k2], hi[k]]); G.append(tg)
            elif len(hi) == 1:
                F.append([lo[k], lo[k2], hi[0]]); G.append(tg)
            else:
                F.append([lo[k], lo[k2], hi[k2], hi[k]]); G.append(tg)
    if cap0 and len(rings[0]) > 1:
        c = len(V); V.append((0.0, 0.0, profile[0][1]))
        for k in range(segs):
            k2 = (k + 1) % cnt if full else k + 1
            F.append([c, rings[0][k2], rings[0][k]]); G.append(2)
    if cap1 and len(rings[-1]) > 1:
        c = len(V); V.append((0.0, 0.0, profile[-1][1]))
        for k in range(segs):
            k2 = (k + 1) % cnt if full else k + 1
            F.append([c, rings[-1][k], rings[-1][k2]]); G.append(2)
    return V, F, G


def p_cyl(r, h, n=12, r2=None, b=0.03):
    r2 = r if r2 is None else r2
    b = min(b, r * 0.6, r2 * 0.6, h * 0.45)
    if b < 1e-5:
        return p_lathe([(r, 0), (r2, h)], n)
    return p_lathe([(r - b, 0), (r, b), (r2, h - b), (r2 - b, h)], n, tags=[1, 0, 1])


def p_sphere(r, n=12, m=6, z0=-1.0, z1=1.0):
    """sphere (or a slice of it between z0..z1 in unit heights), centred at the origin"""
    a0, a1 = math.asin(max(-1, min(1, z0))), math.asin(max(-1, min(1, z1)))
    prof = []
    for i in range(m + 1):
        a = a0 + (a1 - a0) * i / m
        rr = r * cos(a)
        prof.append((0.0 if rr < 1e-5 else rr, r * sin(a)))
    return p_lathe(prof, n)


def p_tube(path, r, n=6, caps=True, closed=False):
    """sweep a circle of radius r (number, or one per point) along a polyline"""
    P = [Vector(p) for p in path]
    m = len(P)
    rs = r if isinstance(r, (list, tuple)) else [r] * m
    tang = []
    for i in range(m):
        if closed:
            t = P[(i + 1) % m] - P[i - 1]
        else:
            t = (P[min(i + 1, m - 1)] - P[max(i - 1, 0)])
        tang.append(t.normalized())
    up = Vector((0, 0, 1)) if abs(tang[0].z) < 0.9 else Vector((1, 0, 0))
    nx = tang[0].cross(up).normalized()
    V, F, G, rings = [], [], [], []
    for i in range(m):
        if i > 0:
            ax = tang[i - 1].cross(tang[i])
            if ax.length > 1e-6:
                ang = tang[i - 1].angle(tang[i])
                nx = Matrix.Rotation(ang, 3, ax.normalized()) @ nx
        nx = (nx - tang[i] * nx.dot(tang[i])).normalized()
        ny = tang[i].cross(nx)
        ring = []
        for k in range(n):
            a = 2 * pi * k / n
            ring.append(len(V)); V.append(tuple(P[i] + (nx * cos(a) + ny * sin(a)) * rs[i]))
        rings.append(ring)
    last = m if closed else m - 1
    for i in range(last):
        lo, hi = rings[i], rings[(i + 1) % m]
        for k in range(n):
            k2 = (k + 1) % n
            F.append([lo[k], lo[k2], hi[k2], hi[k]]); G.append(0)
    if caps and not closed:
        c = len(V); V.append(tuple(P[0]))
        for k in range(n):
            F.append([c, rings[0][(k + 1) % n], rings[0][k]]); G.append(2)
        c = len(V); V.append(tuple(P[-1]))
        for k in range(n):
            F.append([c, rings[-1][k], rings[-1][(k + 1) % n]]); G.append(2)
    return V, F, G


def _inset(poly, d):
    n = len(poly)
    out = []
    for i in range(n):
        p0, p, p1 = Vector(poly[i - 1]), Vector(poly[i]), Vector(poly[(i + 1) % n])
        e0, e1 = (p - p0).normalized(), (p1 - p).normalized()
        n0, n1 = Vector((-e0.y, e0.x)), Vector((-e1.y, e1.x))  # left normals = inward for CCW
        bis = n0 + n1
        if bis.length < 1e-6:
            bis = n0
        bis.normalize()
        k = d / max(0.35, bis.dot(n0))
        out.append((p.x + bis.x * k, p.y + bis.y * k))
    return out


def _area2(poly):
    return sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1] for i in range(len(poly)))


def p_prism(poly, h, b=0.0, z0=0.0):
    """extrude a simple 2D polygon (x, y) from z0 to z0+h, optional chamfer b on the top/bottom rims"""
    poly = [tuple(p[:2]) for p in poly]
    if _area2(poly) < 0:
        poly = poly[::-1]
    n = len(poly)
    V, F, G = [], [], []
    layers = [(poly, z0), (poly, z0 + h)] if b < 1e-5 else [(_inset(poly, b), z0), (poly, z0 + b), (poly, z0 + h - b), (_inset(poly, b), z0 + h)]
    rings = []
    for pl, z in layers:
        rings.append([len(V) + i for i in range(n)])
        V += [(x, y, z) for x, y in pl]
    for i in range(len(rings) - 1):
        tg = 0 if (b < 1e-5 or i == 1) else 1
        for k in range(n):
            k2 = (k + 1) % n
            F.append([rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]]); G.append(tg)
    tris = tessellate_polygon([[Vector((x, y, 0)) for x, y in layers[0][0]]])
    for a, c, d in tris:
        pa, pc, pd = (Vector(layers[0][0][i]) for i in (a, c, d))
        ccw = (pc - pa).cross(pd - pa) > 0
        t = (a, c, d) if ccw else (a, d, c)
        F.append([rings[0][t[0]], rings[0][t[2]], rings[0][t[1]]]); G.append(2)
        F.append([rings[-1][t[0]], rings[-1][t[1]], rings[-1][t[2]]]); G.append(2)
    return V, F, G


def p_loft(rings, cap0=True, cap1=True, closed=True):
    """skin a list of rings (each the same number of 3D points)"""
    V, F, G, idx = [], [], [], []
    for ring in rings:
        idx.append([len(V) + i for i in range(len(ring))])
        V += [tuple(p) for p in ring]
    n = len(rings[0])
    kk = n if closed else n - 1
    for i in range(len(rings) - 1):
        for k in range(kk):
            k2 = (k + 1) % n
            F.append([idx[i][k], idx[i][k2], idx[i + 1][k2], idx[i + 1][k]]); G.append(0)
    for flag, ri, rev in ((cap0, 0, True), (cap1, -1, False)):
        if flag and closed:
            cen = sum((Vector(p) for p in rings[ri]), Vector()) / n
            c = len(V); V.append(tuple(cen))
            for k in range(n):
                k2 = (k + 1) % n
                F.append([c, idx[ri][k2], idx[ri][k]] if rev else [c, idx[ri][k], idx[ri][k2]]); G.append(2)
    return V, F, G


def p_hull(points, bevel=0.0):
    """convex hull of points, optionally with every edge chamfered (faceted stylised rock / debris chunk)"""
    bm = bmesh.new()
    for p in points:
        bm.verts.new(p)
    res = bmesh.ops.convex_hull(bm, input=bm.verts[:])
    junk = [v for v in bm.verts if not v.link_faces]
    if junk:
        bmesh.ops.delete(bm, geom=junk, context="VERTS")
    bmesh.ops.dissolve_limit(bm, angle_limit=radians(4), verts=bm.verts[:], edges=bm.edges[:])
    tags = None
    if bevel > 1e-5:
        r = bmesh.ops.bevel(bm, geom=bm.edges[:] + bm.verts[:], offset=bevel, offset_type="OFFSET", segments=1, profile=0.5, affect="EDGES", clamp_overlap=True)
        newf = set(r["faces"])
        bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
        tags = [1 if f in newf else 0 for f in bm.faces]
    else:
        bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    bmesh.ops.dissolve_degenerate(bm, dist=1e-4, edges=bm.edges[:])
    bm.verts.index_update()
    V = [tuple(v.co) for v in bm.verts]
    F = [[v.index for v in f.verts] for f in bm.faces]
    G = tags if tags and len(tags) == len(F) else [0] * len(F)
    bm.free()
    return V, F, G


def p_sheet(grid, thick=0.03):
    """a thin solid sheet through a rows x cols grid of 3D points (cloth, tarps, flags, sails)"""
    R, K = len(grid), len(grid[0])
    P = [[Vector(p) for p in row] for row in grid]
    N = [[None] * K for _ in range(R)]
    for i in range(R):
        for k in range(K):
            du = P[min(i + 1, R - 1)][k] - P[max(i - 1, 0)][k]
            dv = P[i][min(k + 1, K - 1)] - P[i][max(k - 1, 0)]
            nn = du.cross(dv)
            N[i][k] = nn.normalized() if nn.length > 1e-9 else Vector((0, 0, 1))
    V, F, G = [], [], []
    top = [[0] * K for _ in range(R)]; bot = [[0] * K for _ in range(R)]
    for i in range(R):
        for k in range(K):
            top[i][k] = len(V); V.append(tuple(P[i][k] + N[i][k] * thick * 0.5))
            bot[i][k] = len(V); V.append(tuple(P[i][k] - N[i][k] * thick * 0.5))
    for i in range(R - 1):
        for k in range(K - 1):
            F.append([top[i][k], top[i + 1][k], top[i + 1][k + 1], top[i][k + 1]]); G.append(0)
            F.append([bot[i][k], bot[i][k + 1], bot[i + 1][k + 1], bot[i + 1][k]]); G.append(0)
    for k in range(K - 1):
        F.append([top[0][k], top[0][k + 1], bot[0][k + 1], bot[0][k]]); G.append(1)
        F.append([top[R - 1][k + 1], top[R - 1][k], bot[R - 1][k], bot[R - 1][k + 1]]); G.append(1)
    for i in range(R - 1):
        F.append([top[i + 1][0], top[i][0], bot[i][0], bot[i + 1][0]]); G.append(1)
        F.append([top[i][K - 1], top[i + 1][K - 1], bot[i + 1][K - 1], bot[i][K - 1]]); G.append(1)
    return V, F, G


def p_strip(pts, w, closed=False, taper=None):
    """flat ribbon of width w along a 2D polyline (z = 0, facing +z); taper=(w0,w1) scales the width end to end"""
    P = [Vector(p[:2]) for p in pts]
    m = len(P)
    L, Rr = [], []
    for i in range(m):
        if closed:
            a, b = P[i - 1], P[(i + 1) % m]
        else:
            a, b = P[max(i - 1, 0)], P[min(i + 1, m - 1)]
        d0 = (P[i] - a).normalized() if (P[i] - a).length > 1e-9 else (b - P[i]).normalized()
        d1 = (b - P[i]).normalized() if (b - P[i]).length > 1e-9 else d0
        n0, n1 = Vector((-d0.y, d0.x)), Vector((-d1.y, d1.x))
        bis = (n0 + n1)
        bis = bis.normalized() if bis.length > 1e-6 else n0
        hw = w / 2
        if taper:
            hw *= taper[0] + (taper[1] - taper[0]) * i / max(1, m - 1)
        k = hw / max(0.5, bis.dot(n0))
        L.append(P[i] + bis * k); Rr.append(P[i] - bis * k)
    V = [(p.x, p.y, 0.0) for p in L] + [(p.x, p.y, 0.0) for p in Rr]
    F = []
    for i in range(m if closed else m - 1):
        j = (i + 1) % m
        F.append([m + i, m + j, j, i])
    return V, F, [0] * len(F)


def p_poly(pts):
    """flat polygon in the z = 0 plane facing +z"""
    pts = [tuple(p[:2]) for p in pts]
    if _area2(pts) < 0:
        pts = pts[::-1]
    V = [(x, y, 0.0) for x, y in pts]
    F = []
    for a, c, d in tessellate_polygon([[Vector(v) for v in V]]):
        pa, pc, pd = Vector(pts[a]), Vector(pts[c]), Vector(pts[d])
        F.append([a, c, d] if (pc - pa).cross(pd - pa) > 0 else [a, d, c])
    return V, F, [0] * len(F)


def circle(r, n=16, a0=0.0, a1=360.0, cx=0.0, cy=0.0, ry=None):
    ry = r if ry is None else ry
    full = abs(a1 - a0) >= 359.9
    cnt = n if full else n + 1
    return [(cx + r * cos(radians(a0 + (a1 - a0) * k / n)), cy + ry * sin(radians(a0 + (a1 - a0) * k / n))) for k in range(cnt)]


# ------------------------------------------------------------------ stroke font (original; painted stencil letters)
GLYPHS = {
    "A": [[(0, 0), (0, 4), (2, 6), (4, 4), (4, 0)], [(0, 2.4), (4, 2.4)]],
    "B": [[(0, 0), (0, 6), (3, 6), (4, 5), (4, 4), (3, 3), (0.62, 3)], [(3, 3), (4, 2), (4, 1), (3, 0), (0, 0)]],
    "C": [[(4, 5), (3, 6), (1, 6), (0, 5), (0, 1), (1, 0), (3, 0), (4, 1)]],
    "D": [[(0, 0), (0, 6), (2.6, 6), (4, 4.6), (4, 1.4), (2.6, 0), (0, 0)]],
    "E": [[(4, 6), (0, 6), (0, 0), (4, 0)], [(0, 3), (3, 3)]],
    "F": [[(4, 6), (0, 6), (0, 0)], [(0, 3), (3, 3)]],
    "G": [[(4, 5), (3, 6), (1, 6), (0, 5), (0, 1), (1, 0), (3, 0), (4, 1), (4, 3), (2.2, 3)]],
    "H": [[(0, 0), (0, 6)], [(4, 0), (4, 6)], [(0, 3), (4, 3)]],
    "I": [[(2, 0), (2, 6)]],
    "J": [[(4, 6), (4, 1), (3, 0), (1, 0), (0, 1)]],
    "K": [[(0, 0), (0, 6)], [(4, 6), (0, 3), (4, 0)]],
    "L": [[(0, 6), (0, 0), (4, 0)]],
    "M": [[(0, 0), (0, 6), (2, 3), (4, 6), (4, 0)]],
    "N": [[(0, 0), (0, 6), (4, 0), (4, 6)]],
    "O": [[(1, 0), (0, 1), (0, 5), (1, 6), (3, 6), (4, 5), (4, 1), (3, 0), (1, 0)]],
    "P": [[(0, 0), (0, 6), (3, 6), (4, 5), (4, 4), (3, 3), (0.62, 3)]],
    "Q": [[(1, 0), (0, 1), (0, 5), (1, 6), (3, 6), (4, 5), (4, 1), (3, 0), (1, 0)], [(2.5, 1.6), (4.2, -0.2)]],
    "R": [[(0, 0), (0, 6), (3, 6), (4, 5), (4, 4), (3, 3), (0.62, 3)], [(2, 3), (4, 0)]],
    "S": [[(4, 5), (3, 6), (1, 6), (0, 5), (0, 4), (1, 3), (3, 3), (4, 2), (4, 1), (3, 0), (1, 0), (0, 1)]],
    "T": [[(0, 6), (4, 6)], [(2, 6), (2, 0)]],
    "U": [[(0, 6), (0, 1), (1, 0), (3, 0), (4, 1), (4, 6)]],
    "V": [[(0, 6), (2, 0), (4, 6)]],
    "W": [[(0, 6), (1, 0), (2, 4), (3, 0), (4, 6)]],
    "X": [[(0, 0), (4, 6)], [(0, 6), (4, 0)]],
    "Y": [[(0, 6), (2, 3), (4, 6)], [(2, 3), (2, 0)]],
    "Z": [[(0, 6), (4, 6), (0, 0), (4, 0)]],
    "0": [[(1, 0), (0, 1), (0, 5), (1, 6), (3, 6), (4, 5), (4, 1), (3, 0), (1, 0)]],
    "1": [[(1, 5), (2, 6), (2, 0)]],
    "4": [[(3, 0), (3, 6), (0, 2)], [(0, 2), (4, 2)]],
    "5": [[(4, 6), (0, 6), (0, 3.4), (3, 3.4), (4, 2.4), (4, 1), (3, 0), (0, 0)]],
    "$": [[(4, 5), (3, 6), (1, 6), (0, 5), (0, 4), (1, 3), (3, 3), (4, 2), (4, 1), (3, 0), (1, 0), (0, 1)], [(2, -0.8), (2, 6.8)]],
    "!": [[(2, 6), (2, 2)], [(2, 0.7), (2, 0)]],
    "-": [[(0.6, 3), (3.4, 3)]],
    ".": [[(2, 0.6), (2, 0)]],
    " ": [],
}
GLYPH_W = {"I": 1.2, "1": 2.6, "!": 1.2, ".": 1.2, " ": 2.4, "-": 4}


def text_paths(s, h=1.0, gap=0.28, center=True):
    """polylines (lists of (x, y)) for a string; letter height h, in the xy plane starting at x = 0 (or centred)"""
    k = h / 6.0
    out, x = [], 0.0
    for ch in s.upper():
        w = GLYPH_W.get(ch, 4)
        off = 0.0 if w >= 4 or ch == " " else (4 - w) / 2
        for st in GLYPHS.get(ch, []):
            out.append([((px - off) * k + x, py * k) for px, py in st])
        x += (w + gap * 6) * k
    width = x - gap * 6 * k
    if center:
        out = [[(px - width / 2, py) for px, py in st] for st in out]
    return out, width


# ------------------------------------------------------------------ geometry accumulator
class Geo:
    """accumulates welded primitives with per-corner normals and colours (authoring space)"""

    def __init__(self, rng, mat="matte"):
        self.P, self.F, self.N, self.Col, self.rng, self.mat = [], [], [], [], rng, mat
        self.stack = [Matrix.Identity(4)]
        self.decal_n = 0

    # --- transform stack
    class _Ctx:
        def __init__(s, g, m): s.g, s.m = g, m
        def __enter__(s): s.g.stack.append(s.g.stack[-1] @ s.m); return s.g
        def __exit__(s, *a): s.g.stack.pop()

    def at(self, m):
        return Geo._Ctx(self, m)

    @property
    def tris(self):
        return sum(len(f) - 2 for f in self.F)

    def absorb(self, other):
        """append another Geo's faces (used to bake debris chunks back into an intact wall)"""
        b = len(self.P)
        self.P += other.P
        self.F += [[b + i for i in f] for f in other.F]
        self.N += other.N
        self.Col += other.Col
        return self

    def centroid(self):
        n = max(1, len(self.P))
        return Vector((sum(p[0] for p in self.P) / n, sum(p[1] for p in self.P) / n, sum(p[2] for p in self.P) / n))

    # --- the one place geometry enters
    def emit(self, prim, col, M=None, smooth=60.0, jit=0.05, grad=None, hl=1.1, cap=None, flat=False, warp=None):
        V, F, G = prim
        if warp:
            V = [tuple(warp(Vector(v))) for v in V]
        m = self.stack[-1] @ M if M is not None else self.stack[-1]
        W = [m @ Vector(v) for v in V]
        if m.determinant() < 0:
            F = [list(reversed(f)) for f in F]
        # closed solids: make sure they face outward
        ecount = {}
        for f in F:
            for i in range(len(f)):
                e = (min(f[i], f[i - 1]), max(f[i], f[i - 1]))
                ecount[e] = ecount.get(e, 0) + 1
        if ecount and all(c == 2 for c in ecount.values()):
            vol = 0.0
            for f in F:
                for i in range(1, len(f) - 1):
                    vol += W[f[0]].dot(W[f[i]].cross(W[f[i + 1]]))
            if vol < 0:
                F = [list(reversed(f)) for f in F]
        if CHECK:
            import traceback
            de = {}
            for f in F:
                for i in range(len(f)):
                    de[(f[i - 1], f[i])] = de.get((f[i - 1], f[i]), 0) + 1
            bad = sum(1 for c in de.values() if c > 1)
            fr = next((x for x in reversed(traceback.extract_stack()) if os.path.basename(x.filename) not in ("lib.py", "kit.py")), None)
            if bad and fr:
                print(f"[check] {bad} doubly-wound edges from {os.path.basename(fr.filename)}:{fr.lineno}")
        fn, fa = [], []
        for f in F:
            n = Vector()
            for i in range(1, len(f) - 1):
                n += (W[f[i]] - W[f[0]]).cross(W[f[i + 1]] - W[f[0]])
            a = n.length / 2
            fn.append(n.normalized() if a > 1e-12 else Vector((0, 0, 1))); fa.append(a)
            if CHECK and a < 1e-9:
                import traceback
                fr = next((x for x in reversed(traceback.extract_stack()) if os.path.basename(x.filename) not in ("lib.py", "kit.py")), None)
                print(f"[check] degenerate face from {os.path.basename(fr.filename)}:{fr.lineno}")
        # corner normals: per vertex, cluster faces around the biggest ones (weighted normals: big faces stay flat)
        cn = [[None] * len(f) for f in F]
        if flat:
            for fi, f in enumerate(F):
                cn[fi] = [fn[fi]] * len(f)
        else:
            vf = {}
            for fi, f in enumerate(F):
                for ci, vi in enumerate(f):
                    vf.setdefault(vi, []).append((fi, ci))
            cth = cos(radians(smooth))
            for vi, lst in vf.items():
                lst.sort(key=lambda t: -fa[t[0]])
                clusters = []
                for fi, ci in lst:
                    for cl in clusters:
                        if fn[cl[0]].dot(fn[fi]) >= cth:
                            cl[1].append((fi, ci)); break
                    else:
                        clusters.append([fi, [(fi, ci)]])
                for seed, members in clusters:
                    amax = fa[seed]
                    n = Vector()
                    for fi, ci in members:
                        n += fn[fi] * ((fa[fi] / amax) ** 2 if amax > 0 else 1)
                    n = n.normalized() if n.length > 1e-9 else fn[seed]
                    for fi, ci in members:
                        cn[fi][ci] = n
        # colours
        j = 1 + self.rng.uniform(-jit, jit)
        hue = self.rng.uniform(-jit, jit) * 0.35
        zs = [v[2] for v in V]
        z0, z1 = (min(zs), max(zs)) if zs else (0, 1)
        base = len(self.P)
        self.P += [tuple(w) for w in W]
        for fi, f in enumerate(F):
            if callable(col):
                cen = sum((Vector(V[i]) for i in f), Vector()) / len(f)
                c = C(col(cen, G[fi]))
            elif isinstance(col, dict):
                c = C(col.get(G[fi], col[0]))
            else:
                c = C(col)
            if G[fi] == 1 and not isinstance(col, dict):
                c = shade(c, hl)
            if G[fi] == 2 and cap is not None and not isinstance(col, dict):
                c = C(cap)
            c = (c[0] * (j + hue), c[1] * j, c[2] * (j - hue))
            cols = []
            for vi in f:
                k = 1.0
                if grad:
                    t = (V[vi][2] - z0) / (z1 - z0) if z1 > z0 else 0
                    k = grad[0] + (grad[1] - grad[0]) * t
                cols.append((min(1, max(0, c[0] * k)), min(1, max(0, c[1] * k)), min(1, max(0, c[2] * k))))
            self.F.append([base + i for i in f]); self.N.append([tuple(n) for n in cn[fi]]); self.Col.append(cols)
        return self

    # --- solids ("at" is the centre of the base; rot in degrees)
    def box(self, sx, sy, sz, at=(0, 0, 0), rot=(0, 0, 0), col="#888888", b=0.03, taper=None, **kw):
        return self.emit(p_box(sx, sy, sz, b, taper), col, T(*at, *rot), **kw)

    def cyl(self, r, h, at=(0, 0, 0), rot=(0, 0, 0), col="#888888", n=12, r2=None, b=0.03, **kw):
        return self.emit(p_cyl(r, h, n, r2, b), col, T(*at, *rot), **kw)

    def lathe(self, profile, at=(0, 0, 0), rot=(0, 0, 0), col="#888888", n=12, s=(1, 1, 1), **kw):
        pk = {k: kw.pop(k) for k in ("cap0", "cap1", "tags", "arc") if k in kw}
        return self.emit(p_lathe(profile, n, **pk), col, T(*at, *rot) @ Matrix.Diagonal((*s, 1)), **kw)

    def ball(self, r, at=(0, 0, 0), rot=(0, 0, 0), col="#888888", n=12, m=6, s=(1, 1, 1), z0=-1.0, z1=1.0, **kw):
        return self.emit(p_sphere(r, n, m, z0, z1), col, T(*at, *rot) @ Matrix.Diagonal((*s, 1)), **kw)

    def tube(self, path, r, col="#888888", n=6, caps=True, closed=False, **kw):
        return self.emit(p_tube(path, r, n, caps, closed), col, None, **kw)

    def prism(self, poly, h, at=(0, 0, 0), rot=(0, 0, 0), col="#888888", b=0.0, **kw):
        return self.emit(p_prism(poly, h, b), col, T(*at, *rot), **kw)

    def loft(self, rings, col="#888888", cap0=True, cap1=True, closed=True, **kw):
        return self.emit(p_loft(rings, cap0, cap1, closed), col, None, **kw)

    def rock(self, sx, sy, sz, at=(0, 0, 0), rot=(0, 0, 0), col="#888888", n=14, b=0.05, seed=None, flatbase=True, **kw):
        r = random.Random(seed if seed is not None else self.rng.random())
        pts = []
        for _ in range(n):
            v = Vector((r.gauss(0, 1), r.gauss(0, 1), r.gauss(0, 1))).normalized()
            k = r.uniform(0.82, 1.0)
            z = v.z * k
            if flatbase:
                z = max(z, -0.25)
            pts.append((v.x * k * sx / 2, v.y * k * sy / 2, (z + (0.25 if flatbase else 1)) * sz / (1.25 if flatbase else 2)))
        kw.setdefault("smooth", 35)
        return self.emit(p_hull(pts, b), col, T(*at, *rot), **kw)

    def sheet(self, grid, col="#888888", thick=0.03, **kw):
        return self.emit(p_sheet(grid, thick), col, None, **kw)

    def beam(self, p0, p1, w, d, col="#888888", b=0.02, roll=0.0, ext=0.0, **kw):
        """box of section w x d running from p0 to p1 (ext lengthens both ends)"""
        p0, p1 = Vector(p0), Vector(p1)
        dv = (p1 - p0).normalized()
        p0, p1 = p0 - dv * ext, p1 + dv * ext
        return self.emit(p_box(w, d, (p1 - p0).length, b), col, along(p0, p1, roll), **kw)

    def pole(self, p0, p1, r, col="#888888", n=8, r2=None, b=0.015, **kw):
        p0, p1 = Vector(p0), Vector(p1)
        return self.emit(p_cyl(r, (p1 - p0).length, n, r2, b), col, along(p0, p1), **kw)

    # --- flat painted details. M places the local xy plane (facing local +z) on the surface; each call is lifted a
    #     little more than the previous one so stacked paint never z-fights.
    def _lift(self, lift):
        """lift=None: automatic (6 mm, stepped 1.5 mm per call). A number is used exactly."""
        self.decal_n += 1
        return T(0, 0, 0.006 + 0.0015 * (self.decal_n % 5) if lift is None else lift)

    def decal(self, prim, M, col, lift=None, **kw):
        kw.setdefault("jit", 0.0)
        return self.emit(prim, col, M @ self._lift(lift), flat=True, **kw)

    def paint_poly(self, pts, M, col, **kw):
        return self.decal(p_poly(pts), M, col, **kw)

    def paint_line(self, pts, w, M, col, closed=False, taper=None, **kw):
        return self.decal(p_strip(pts, w, closed, taper), M, col, **kw)

    def paint_text(self, s, h, M, col, w=None, **kw):
        paths, width = text_paths(s, h)
        for p in paths:
            closed = len(p) > 2 and p[0] == p[-1]
            self.paint_line(p[:-1] if closed else p, w or h * 0.17, M, col, closed=closed, **kw)
        return width

    def paint_x(self, size, M, col="#ffcf6a", w=None, lift=None):
        """the kit's "you can break this" mark: a rough warm X"""
        w = w or size * 0.16
        h = size / 2
        self.paint_line([(-h, -h * 0.92), (-h * 0.3, -h * 0.25), (h * 0.35, h * 0.3), (h, h * 0.95)], w, M, col, taper=(0.75, 1.15), lift=lift)
        self.paint_line([(-h * 0.95, h), (-h * 0.25, h * 0.3), (h * 0.3, -h * 0.32), (h * 0.92, -h)], w, M, col, taper=(1.15, 0.7), lift=None if lift is None else lift + 0.002)

    def paint_crack(self, pts, w, M, col="#2e2219"):
        self.paint_line(pts, w, M, col, taper=(1.0, 0.15))


# ------------------------------------------------------------------ assets
MATS = {}


def material(name):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    att = nt.nodes.new("ShaderNodeVertexColor")
    att.layer_name = "Col"
    nt.links.new(att.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.85
    if name == "emissive":
        nt.links.new(att.outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = 3.0
    if name == "foliage":
        m.use_backface_culling = False
    MATS[name] = m
    return m


ASSETS = []     # every Asset built in this process, in order


class Asset:
    def __init__(self, name, group, footprint=0.5, blocksMove=False, blocksShot=False, tall=False, seed=None, glow=1.8,
                 ground=True, wall=None, ao_dist=1.4, ao_min=0.42, ao_self=True, note=""):
        self.name, self.group = name, group
        self.meta = dict(asset=name, footprint=footprint, blocksMove=blocksMove, blocksShot=blocksShot, tall=tall, glow=glow)
        self.rng = random.Random(seed if seed is not None else hash_str(name))
        self.static, self.parts, self.points = {}, {}, {}
        self.ground, self.wall, self.ao_dist, self.ao_min, self.ao_self, self.note = ground, wall, ao_dist, ao_min, ao_self, note
        self.objects = []
        ASSETS.append(self)

    def mesh(self, mat="matte"):
        if mat not in self.static:
            self.static[mat] = Geo(self.rng, mat)
        return self.static[mat]

    def part(self, name, pivot=(0, 0, 0), mat="matte", parent=None):
        """a separate node whose origin sits on `pivot` (asset space). Geometry is still authored in asset space."""
        key = name if mat == "matte" or name not in self.parts else f"{name}_{mat}"
        if key not in self.parts:
            g = Geo(self.rng, mat)
            g.pivot, g.part, g.parent = Vector(pivot), name, (parent if key == name else name)
            self.parts[key] = g
        return self.parts[key]

    def point(self, name, pos):
        self.points[name] = Vector(pos)

    def chunk(self, mat="matte"):
        """a loose Geo sharing this asset's rng; turn it into a part with adopt() or merge it with Geo.absorb()"""
        return Geo(self.rng, mat)

    def adopt(self, name, geo, pivot=None):
        geo.pivot, geo.part, geo.parent = Vector(pivot) if pivot is not None else geo.centroid(), name, None
        self.parts[name] = geo
        return geo

    def geos(self):
        return list(self.static.values()) + list(self.parts.values())

    @property
    def tris(self):
        return sum(g.tris for g in self.geos())

    def triangles(self):
        V, Tr = [], []
        for g in self.geos():
            if g.mat == "emissive" and not getattr(g, "occlude", False):
                continue
            b = len(V)
            V += g.P
            for f in g.F:
                for i in range(1, len(f) - 1):
                    Tr.append((b + f[0], b + f[i], b + f[i + 1]))
        return V, Tr


def hash_str(s):
    h = 2166136261
    for ch in s:
        h = ((h ^ ord(ch)) * 16777619) & 0xFFFFFFFF
    return h


_AO_DIRS = None
CHECK = os.environ.get("BUILD_CHECK") == "1"
SIDE_BOOST = 0.8


def _ao_dirs(n=20):
    global _AO_DIRS
    if _AO_DIRS is None:
        r = random.Random(7)
        d = []
        for i in range(n):
            u, v = (i + r.random()) / n, r.random()
            ph, ct = 2 * pi * v, sqrt(1 - u)
            st = sqrt(u)
            d.append((st * cos(ph), st * sin(ph), ct))
        _AO_DIRS = d
    return _AO_DIRS


def bake_ao(asset, extra=None):
    """ray-cast ambient occlusion per face corner, multiplied into the colours (stored linear)"""
    V, Tr = ([], []) if not asset.ao_self else asset.triangles()
    V, Tr = list(V), list(Tr)
    if extra:
        b = len(V); V += extra[0]; Tr += [(b + a, b + c, b + d) for a, c, d in extra[1]]
    if asset.ground:
        b = len(V); s = 60.0
        V += [(-s, -s, 0.0), (s, -s, 0.0), (s, s, 0.0), (-s, s, 0.0)]; Tr += [(b, b + 1, b + 2), (b, b + 2, b + 3)]
    if asset.wall is not None:   # a wall plane at y = wall, facing -y (for wall-mounted pieces)
        b = len(V); s, y = 60.0, asset.wall
        V += [(-s, y, -s), (s, y, -s), (s, y, s), (-s, y, s)]; Tr += [(b, b + 1, b + 2), (b, b + 2, b + 3)]
    bvh = BVHTree.FromPolygons([Vector(v) for v in V], Tr, epsilon=0.0) if Tr else None
    dirs = _ao_dirs()
    D = asset.ao_dist
    tint = (0.42, 0.35, 0.37)
    for g in asset.geos():
        cache = {}
        newc = []
        for fi, f in enumerate(g.F):
            cen = sum((Vector(g.P[i]) for i in f), Vector()) / len(f)
            row = []
            for ci, vi in enumerate(f):
                c = g.Col[fi][ci]
                lin = (s2l(c[0]), s2l(c[1]), s2l(c[2]))
                if g.mat == "emissive" or bvh is None:
                    row.append(lin); continue
                n = g.N[fi][ci]
                key = (vi, round(n[0], 1), round(n[1], 1), round(n[2], 1))
                a = cache.get(key)
                if a is None:
                    nv = Vector(n)
                    p = Vector(g.P[vi])
                    p = p + (cen - p) * 0.12 + nv * 0.012
                    t1 = nv.cross(Vector((0, 0, 1)) if abs(nv.z) < 0.9 else Vector((1, 0, 0))).normalized()
                    t2 = nv.cross(t1)
                    occ = 0.0
                    for dx, dy, dz in dirs:
                        d = t1 * dx + t2 * dy + nv * dz
                        hit = bvh.ray_cast(p, d, D)
                        if hit[0] is not None:
                            occ += (1 - hit[3] / D) ** 0.7
                    a = 1 - occ / len(dirs)
                    a = a ** 1.25
                    a = asset.ao_min + (1 - asset.ao_min) * a
                    # The camera never orbits and the sun sits behind the set, so every wall the player sees is in
                    # shade. Bake an "equator" ambient term into the sides so they keep their local colour.
                    k = min(1.0, max(0.0, (0.95 - n[2]) / 0.45))
                    a *= 1.0 + SIDE_BOOST * k * k * (3 - 2 * k)
                    cache[key] = a
                row.append(tuple(min(1.0, lin[i] * (tint[i] + (1 - tint[i]) * min(a, 1.0)) * max(1.0, a)) for i in range(3)))
            newc.append(row)
        g.Lin = newc


def to_blender(asset, coll):
    root = bpy.data.objects.new(asset.name, None)
    root.empty_display_size = 0.3
    coll.objects.link(root)
    for k, v in asset.meta.items():
        root[k] = v
    root["tris"] = asset.tris
    asset.root = root
    made = {}

    def make(g, name, kind, part=None):
        me = bpy.data.meshes.new(name)
        piv = getattr(g, "pivot", Vector())
        me.from_pydata([tuple(Vector(p) - piv) for p in g.P], [], g.F)
        me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
        ca = me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
        flat = []
        for row in g.Lin:
            for c in row:
                flat += [c[0], c[1], c[2], 1.0]
        ca.data.foreach_set("color", flat)
        me.color_attributes.active_color = ca
        me.color_attributes.render_color_index = 0
        me.normals_split_custom_set([n for row in g.N for n in row])
        me.materials.append(material(g.mat))
        me.validate(clean_customdata=False)
        ob = bpy.data.objects.new(name, me)
        coll.objects.link(ob)
        ob.parent = root
        ob.location = piv
        ob["kind"], ob["mat"] = kind, g.mat
        if part:
            ob["part"] = part
        asset.objects.append(ob)
        return ob

    for mat, g in asset.static.items():
        if g.F:
            make(g, f"{asset.name}__{mat}", "static")
    for key, g in asset.parts.items():
        if not g.F:
            continue
        ob = make(g, f"{asset.name}__{key}", "part", g.part if key == g.part else key)
        made[key] = ob
    for key, g in asset.parts.items():      # same-part extra materials ride along as children of the main node
        if g.parent and g.parent in made and key in made:
            ch, par = made[key], made[g.parent]
            ch.parent = par
            ch.location = g.pivot - asset.parts[g.parent].pivot
            if key != g.part:
                ch["kind"] = "partmesh"
    for name, pos in asset.points.items():
        e = bpy.data.objects.new(f"{asset.name}__{name}", None)
        e.empty_display_size = 0.15
        coll.objects.link(e)
        e.parent = root
        e.location = pos
        e["kind"], e["part"] = "point", name
    return root


def finish_all(assets, shared_occluders=False):
    """bake AO and create the Blender objects. shared_occluders: every asset in the list also occludes the others
    (the bunker set, authored in room space) unless it sets .fixture = True."""
    extra = None
    if shared_occluders:
        V, Tr = [], []
        for a in assets:
            if getattr(a, "fixture", False):
                continue
            v, t = a.triangles(); b = len(V); V += v; Tr += [(b + i, b + j, b + k) for i, j, k in t]
        extra = (V, Tr)
    coll = bpy.context.scene.collection
    t0 = time.time()
    for a in assets:
        if shared_occluders:
            a.ao_self = getattr(a, "fixture", False)
        bake_ao(a, extra)
        to_blender(a, coll)
    print(f"[build] baked + created {len(assets)} assets in {time.time() - t0:.1f}s")


def export_glb(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_yup=True, export_apply=False, export_extras=True,
                              export_vertex_color="ACTIVE", export_all_vertex_colors=False, export_active_vertex_color_when_no_material=True,
                              export_texcoords=False, export_normals=True, export_tangents=False, export_materials="EXPORT",
                              export_animations=False, export_skins=False, export_morph=False, export_cameras=False, export_lights=False)
    return os.path.getsize(path)


# ------------------------------------------------------------------ review renders (Eevee, the gameplay camera)
def review_render(path, assets, cols=6, cell=3.2, res=(2400, 1350), dist=40.0, ground="#c9b383", focus=None, layout=True, sun_el=50.0):
    """lay the assets out on a grid (or leave them in place) and render from pitch 55 / yaw -30 / FOV 24"""
    sc = bpy.context.scene
    placed = []
    if layout:
        x = z = 0.0
        rowd = 0.0
        row = []
        rows = []
        for a in assets:
            w = max(cell, getattr(a, "cellw", cell))
            if row and (len(row) >= cols):
                rows.append((row, rowd)); row, rowd, x = [], 0.0, 0.0
            row.append((a, x + w / 2)); x += w; rowd = max(rowd, getattr(a, "celld", cell))
        if row:
            rows.append((row, rowd))
        y = 0.0
        width = max(sum(max(cell, getattr(a, "cellw", cell)) for a, _ in r) for r, _ in rows)
        for r, d in rows:
            for a, cx in r:
                a.gx, a.gy = cx - width / 2, -(y + d / 2)
                placed.append(a)
            y += d
        depth = y
        for a in placed:      # rows run along the screen: screen-right = (0.866, -0.5), screen-away = (0.5, 0.866) on the ground
            gx, gy = a.gx, a.gy + depth / 2
            a.root.location = (gx * 0.866 + gy * 0.5, -gx * 0.5 + gy * 0.866, 0)
    me = bpy.data.meshes.new("review_ground")
    s = 80
    me.from_pydata([(-s, -s, 0), (s, -s, 0), (s, s, 0), (-s, s, 0)], [], [(0, 1, 2, 3)])
    gm = bpy.data.materials.new("review_ground")
    bs = next(n for n in gm.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bs.inputs["Base Color"].default_value = (*[s2l(c) for c in C(ground)], 1)
    bs.inputs["Roughness"].default_value = 0.95
    me.materials.append(gm)
    gob = bpy.data.objects.new("review_ground", me)
    sc.collection.objects.link(gob)
    gob.location.z = -0.002
    sun = bpy.data.lights.new("review_sun", "SUN")
    sun.energy = 4.2; sun.color = (1.0, 0.88, 0.69); sun.angle = radians(3)
    so = bpy.data.objects.new("review_sun", sun); sc.collection.objects.link(so)
    # three.js stage: sun from azimuth 160 deg (spherical theta), elevation sun_el; convert to Blender axes
    th, el = radians(160), radians(sun_el)
    d3 = Vector((cos(el) * sin(th), sin(el), cos(el) * cos(th)))            # three (x, y, z)
    db = Vector((d3.x, -d3.z, d3.y))                                       # blender (x, y, z)
    so.rotation_euler = db.to_track_quat("Z", "Y").to_euler()
    w = bpy.data.worlds.new("review_world"); sc.world = w
    bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.62, 0.72, 1.0, 1); bg.inputs["Strength"].default_value = 0.75
    cam = bpy.data.cameras.new("review_cam"); cam.sensor_fit = "VERTICAL"; cam.angle_y = radians(24); cam.clip_start = 1; cam.clip_end = 300
    co = bpy.data.objects.new("review_cam", cam); sc.collection.objects.link(co); sc.camera = co
    f = Vector(focus) if focus else Vector((0, 0, 0.6))
    pitch, yaw = radians(55), radians(-30)
    off3 = Vector((dist * cos(pitch) * sin(yaw), dist * sin(pitch), dist * cos(pitch) * cos(yaw)))
    co.location = f + Vector((off3.x, -off3.z, off3.y))
    co.rotation_euler = (f - co.location).to_track_quat("-Z", "Y").to_euler()
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.film_transparent = False
    try:
        sc.view_settings.view_transform = "Standard"
    except TypeError:
        pass
    try:
        sc.eevee.use_shadows = True
        sc.eevee.taa_render_samples = 32
    except Exception:
        pass
    sc.render.filepath = path
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.render.render(write_still=True)
    for o in (gob, so, co):
        bpy.data.objects.remove(o)
    if layout:
        for a in placed:
            a.root.location = (0, 0, 0)
    return path
