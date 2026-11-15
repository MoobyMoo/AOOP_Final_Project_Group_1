"""Bananaville nature kit: shared mesh helpers for the Blender (5.2) generators.

Everything is built as plain triangle soup in a Geo (positions, linear vertex colours, optional bent normals),
then turned into Blender meshes, AO-baked into the vertex colours with a BVH ray caster, QA'd and written to GLB.
Blender space: +z up, ground at z = 0, 1 unit = 1 m. The GLB writer converts to glTF/three space (+y up).
Colours are authored as sRGB hex and stored linear (glTF COLOR_0 is linear; three reads it that way).
"""
import json
import math
import os
import random
import struct

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils import noise as mnoise
from mathutils.bvhtree import BVHTree

UP = np.array([0.0, 0.0, 1.0])
TAU = math.tau


# ------------------------------------------------------------------ small maths
def lin(h):
    """sRGB hex -> linear rgb"""
    h = h.lstrip("#")
    c = np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def mix(a, b, t):
    return a + (b - a) * t


def unit(v):
    n = float(np.linalg.norm(v))
    return v / n if n > 1e-12 else v


def sstep(x, a, b):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def clamp(x, a=0.0, b=1.0):
    return min(b, max(a, x))


def nz(p, f=1.0, seed=0.0):
    """Perlin noise, roughly -1..1"""
    return mnoise.noise(Vector((p[0] * f + seed * 17.31, p[1] * f - seed * 9.17, p[2] * f + seed * 3.73)))


def fbm(p, f=1.0, seed=0.0, octaves=3):
    v, a, tot = 0.0, 1.0, 0.0
    for _ in range(octaves):
        v += a * nz(p, f, seed)
        tot += a
        a *= 0.5
        f *= 2.07
    return v / tot


def rot(axis, ang):
    """3x3 rotation about a unit axis"""
    x, y, z = unit(np.asarray(axis, float))
    c, s = math.cos(ang), math.sin(ang)
    C = 1 - c
    return np.array([[c + x * x * C, x * y * C - z * s, x * z * C + y * s],
                     [y * x * C + z * s, c + y * y * C, y * z * C - x * s],
                     [z * x * C - y * s, z * y * C + x * s, c + z * z * C]])


def rotz(a):
    return rot(UP, a)


def V(*a):
    return np.array(a, float)


def pol(r, a, z=0.0):
    return np.array([r * math.cos(a), r * math.sin(a), z])


def tone(c, v=1.0, warm=0.0):
    """scale value; warm > 0 pushes toward yellow, < 0 toward teal"""
    c = np.asarray(c, float) * v
    return np.clip(c * np.array([1 + warm, 1 + warm * 0.35, 1 - warm]), 0, 1)


class Rng(random.Random):
    def u(self, a, b):
        return a + (b - a) * self.random()

    def pick(self, seq):
        return seq[int(self.random() * len(seq)) % len(seq)]

    def chance(self, p):
        return self.random() < p

    def i(self, a, b):
        return a + int(self.random() * (b - a + 1))

    def vec(self, k):
        return np.array([self.u(-k, k), self.u(-k, k), self.u(-k, k)])

    def dir2(self):
        a = self.u(0, TAU)
        return np.array([math.cos(a), math.sin(a), 0.0])


# ------------------------------------------------------------------ Geo
class Geo:
    """triangle soup with per-vertex linear colour, optional custom (bent) normal and AO weight"""

    def __init__(self, mat="matte"):
        self.mat = mat
        self.v, self.c, self.n, self.ao = [], [], [], []
        self.f, self.fs = [], []
        self.uv = None  # list of (u, v) per vertex when the piece needs UVs (water)

    def vert(self, p, c, n=None, ao=1.0, uv=None):
        self.v.append(np.asarray(p, float))
        self.c.append(np.clip(np.asarray(c, float), 0, 1))
        self.n.append(None if n is None else unit(np.asarray(n, float)))
        self.ao.append(ao)
        if uv is not None:
            if self.uv is None:
                self.uv = []
            self.uv.append(uv)
        return len(self.v) - 1

    def fn(self, a, b, c):
        return np.cross(self.v[b] - self.v[a], self.v[c] - self.v[a])

    def tri(self, a, b, c, smooth=True, ref=None):
        n = self.fn(a, b, c)
        if float(np.dot(n, n)) < 1e-14:
            return
        if ref is not None and float(np.dot(n, ref)) < 0:
            b, c = c, b
        self.f.append((a, b, c))
        self.fs.append(smooth)

    def quad(self, a, b, c, d, smooth=True, ref=None):
        self.tri(a, b, c, smooth, ref)
        self.tri(a, c, d, smooth, ref)

    def add(self, o, R=None, t=None, s=1.0):
        """append another Geo (same material class) transformed by scale s, rotation R, translation t"""
        base = len(self.v)
        for p, c, n, ao in zip(o.v, o.c, o.n, o.ao):
            q = p * s
            if R is not None:
                q = R @ q
                n = None if n is None else R @ n
            if t is not None:
                q = q + t
            self.v.append(q)
            self.c.append(c)
            self.n.append(n)
            self.ao.append(ao)
        for (a, b, c), sm in zip(o.f, o.fs):
            self.f.append((a + base, b + base, c + base))
            self.fs.append(sm)
        return base

    def compact(self):
        """drop vertices no face uses (a loose vertex is a floating part to the QA gate)"""
        used = sorted({i for f in self.f for i in f})
        if len(used) == len(self.v):
            return self
        remap = {o: n for n, o in enumerate(used)}
        self.v = [self.v[i] for i in used]
        self.c = [self.c[i] for i in used]
        self.n = [self.n[i] for i in used]
        self.ao = [self.ao[i] for i in used]
        if self.uv is not None:
            self.uv = [self.uv[i] for i in used]
        self.f = [(remap[a], remap[b], remap[c]) for a, b, c in self.f]
        return self

    @property
    def ntris(self):
        return len(self.f)


# ------------------------------------------------------------------ primitives
def frames(pts):
    """parallel-transport frames (T, N, B) along a polyline; N x B = T"""
    n = len(pts)
    T = [unit(pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]) for i in range(n)]
    ref = np.array([1.0, 0, 0]) if abs(T[0][0]) < 0.9 else np.array([0, 1.0, 0])
    N = [unit(ref - T[0] * float(np.dot(ref, T[0])))]
    for i in range(1, n):
        N.append(unit(N[-1] - T[i] * float(np.dot(N[-1], T[i]))))
    B = [np.cross(T[i], N[i]) for i in range(n)]
    return T, N, B


def tube(g, pts, rad, sides=8, col=None, smooth=True, cap0=None, cap1=None, rmod=None, twist=0.0, ao=1.0, capcol=None, phase=0.0):
    """lofted tube along pts. rad: list or float. col(t, ang, pos) or rgb. cap: None | 'flat' | 'point' | float (dome height in radii).
    rmod(t, ang) scales the radius (buttresses, toes, knots). Returns the rings of vertex indices."""
    pts = [np.asarray(p, float) for p in pts]
    n = len(pts)
    if not hasattr(rad, "__len__"):
        rad = [rad] * n
    T, N, B = frames(pts)
    rings = []
    for i in range(n):
        t = i / (n - 1)
        ring = []
        for k in range(sides):
            a = TAU * k / sides + twist * i + phase
            r = rad[i] * (rmod(t, a) if rmod else 1.0)
            p = pts[i] + r * (math.cos(a) * N[i] + math.sin(a) * B[i])
            c = col(t, a, p) if callable(col) else col
            ring.append(g.vert(p, c, ao=ao))
        rings.append(ring)
    for i in range(n - 1):
        for k in range(sides):
            a, b = rings[i][k], rings[i][(k + 1) % sides]
            c, d = rings[i + 1][(k + 1) % sides], rings[i + 1][k]
            g.quad(a, b, c, d, smooth)
    for end, cap in ((0, cap0), (n - 1, cap1)):
        if cap is None:
            continue
        sgn = -1.0 if end == 0 else 1.0
        h = 0.0 if cap == "flat" else (1.6 if cap == "point" else float(cap))
        cp = pts[end] + T[end] * sgn * rad[end] * h
        cc = capcol if capcol is not None else (col(end / (n - 1), 0.0, cp) if callable(col) else col)
        ci = g.vert(cp, cc, ao=ao)
        for k in range(sides):
            a, b = rings[end][k], rings[end][(k + 1) % sides]
            if end == 0:
                g.tri(b, a, ci, smooth and cap != "flat")
            else:
                g.tri(a, b, ci, smooth and cap != "flat")
    return rings


def arc(origin, yaw, length, rise, droop, n=8, power=1.4, yawdrift=0.0):
    """polyline that leaves origin at pitch `rise` (rad above horizontal) and bends down by `droop` rad over its length"""
    pts = [np.asarray(origin, float)]
    step = length / n
    for i in range(n):
        t = (i + 0.5) / n
        pitch = rise - droop * t ** power
        y = yaw + yawdrift * t
        pts.append(pts[-1] + step * np.array([math.cos(pitch) * math.cos(y), math.cos(pitch) * math.sin(y), math.sin(pitch)]))
    return pts


def bezier(p0, p1, p2, p3, n):
    out = []
    for i in range(n + 1):
        t = i / n
        out.append((1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t * t * p2 + t ** 3 * p3)
    return out


def leaf(g, base, d, up, L, W, cb, cm, ct, fold=0.12, curl=0.15, nb=None, bend=0.5, shape=0.42, smooth=True):
    """one leaf: a 4-triangle oval (6 vertices), edges dropped for the fold, tip curling down.
    nb = normal the shading bends toward. shape = where along the length the leaf is widest."""
    d = unit(np.asarray(d, float))
    s = np.cross(up, d)
    if float(np.dot(s, s)) < 1e-8:
        s = np.cross(np.array([1.0, 0, 0]), d)
    s = unit(s)
    u = unit(np.cross(d, s))

    def P(x, y, z):
        return base + d * (x * L) + s * (y * W) + u * (z * L)

    def Nn(extra):
        n = u + extra
        if nb is not None:
            n = unit(n) * (1 - bend) + nb * bend
        return unit(n)

    x1, x2 = shape * 0.72, min(0.86, shape + 0.3)
    i0 = g.vert(P(0, 0, 0), cb, Nn(0))
    l1 = g.vert(P(x1, 0.5, -fold * 0.7), cm, Nn(s * 0.5))
    r1 = g.vert(P(x1, -0.5, -fold * 0.7), cm, Nn(-s * 0.5))
    l2 = g.vert(P(x2, 0.44, -fold - curl * 0.4), mix(cm, ct, 0.6), Nn(s * 0.5 + d * 0.2))
    r2 = g.vert(P(x2, -0.44, -fold - curl * 0.4), mix(cm, ct, 0.6), Nn(-s * 0.5 + d * 0.2))
    it = g.vert(P(1, 0, -curl), ct, Nn(d * 0.4))
    g.tri(i0, r1, l1, smooth)
    g.tri(l1, r1, r2, smooth)
    g.tri(l1, r2, l2, smooth)
    g.tri(l2, r2, it, smooth)


def spray(g, base, d, up, L, W, cb, cm, ct, fold=0.1, curl=0.2, nb=None, bend=0.55, rng=None, smooth=True):
    """a three-lobed leaf spray (8 triangles): the shingle that tree crowns are built from. Lobes are unequal."""
    d = unit(np.asarray(d, float))
    s = np.cross(up, d)
    if float(np.dot(s, s)) < 1e-8:
        s = np.cross(np.array([1.0, 0, 0]), d)
    s = unit(s)
    u = unit(np.cross(d, s))
    j = (lambda k: rng.u(-k, k)) if rng else (lambda k: 0.0)

    def P(x, y, z):
        return base + d * (x * L) + s * (y * W) + u * (z * L)

    def Nn(extra):
        n = u + extra
        if nb is not None:
            n = unit(n) * (1 - bend) + nb * bend
        return unit(n)

    ll, lr = 0.74 + j(0.1), 0.74 + j(0.1)
    i0 = g.vert(P(0, 0, 0), cb, Nn(0))
    ml = g.vert(P(0.36 + j(0.05), 0.50, -fold), cm, Nn(s * 0.5))
    mr = g.vert(P(0.36 + j(0.05), -0.50, -fold), cm, Nn(-s * 0.5))
    ic = g.vert(P(0.50, 0, 0.03), mix(cm, ct, 0.35), Nn(0))
    tc = g.vert(P(1.0, j(0.08), -curl), ct, Nn(d * 0.4))
    tl = g.vert(P(ll, 0.52 + j(0.06), -curl * 0.8 - fold), ct, Nn(s * 0.5 + d * 0.3))
    tr = g.vert(P(lr, -0.52 + j(0.06), -curl * 0.8 - fold), ct, Nn(-s * 0.5 + d * 0.3))
    nl = g.vert(P(0.74, 0.25, -curl * 0.4), mix(cm, ct, 0.6), Nn(s * 0.2))
    nr = g.vert(P(0.74, -0.25, -curl * 0.4), mix(cm, ct, 0.6), Nn(-s * 0.2))
    for a, b, c in ((i0, mr, ic), (i0, ic, ml), (ic, mr, tr), (ic, tr, nr), (ic, nr, tc), (ic, tc, nl), (ic, nl, tl), (ic, tl, ml)):
        g.tri(a, b, c, smooth)


def frond(g, origin, yaw, L, rise, droop, W, n=10, crach=None, cmid=None, ctip=None, hang=0.45, sweep=0.55, power=1.5,
          start=0.12, rng=None, yawdrift=0.0, smooth=False, tipw=0.25, stalk=0.0, cstalk=None, web=0.5):
    """a feather frond (palm, fern): a continuous web along the curved rachis for the inner part of the width, then one
    pointed leaflet per segment, so the edge is notched but the frond still has body. Both sides hang like a roof."""
    pts = arc(origin, yaw, L, rise, droop, n, power, yawdrift)
    T, _, _ = frames(pts)
    j = (lambda k: rng.u(-k, k)) if rng else (lambda k: 0.0)
    ri, fr, ws = [], [], []
    prevS = None
    for i, p in enumerate(pts):
        t = i / n
        ri.append(g.vert(p, mix(crach, cmid, 0.2 + 0.5 * t)))
        S = np.cross(UP, T[i])
        if float(np.dot(S, S)) < 0.02:
            S = prevS if prevS is not None else np.array([-math.sin(yaw), math.cos(yaw), 0.0])
        S = unit(S)
        prevS = S
        fr.append((T[i], S, unit(np.cross(T[i], S))))
        ws.append(0.0 if t < start - 1e-6 else W * mix(0.45, 1.0, sstep(t, start, 0.36)) * mix(1.0, tipw, sstep(t, 0.5, 1.0)))
    sides = {}
    for sgn in (1.0, -1.0):
        mi = []
        for i in range(n + 1):
            Tm, S, U = fr[i]
            w = ws[i]
            if w <= 0:
                mi.append(ri[i])
            else:
                mi.append(g.vert(pts[i] + S * (sgn * w * web) - U * (hang * w * web), mix(cmid, ctip, 0.3 * sstep(i / n, 0.1, 0.9)) * (1 + j(0.04))))
        sides[sgn] = mi
        for i in range(n):
            if ws[i + 1] <= 0:
                continue
            Tm, S, U = fr[i]
            t = (i + 0.5) / n
            w = (ws[i] + ws[i + 1]) * 0.5 * (1 + j(0.14))
            mid = (pts[i] + pts[i + 1]) * 0.5
            tip = mid + S * (sgn * w) + Tm * (sweep * w * (1 + j(0.2))) - U * (hang * w * 1.15 * (1 + j(0.25)))
            ti = g.vert(tip, mix(cmid, ctip, sstep(t, 0.1, 0.95)) * (1 + j(0.05)))
            if sgn > 0:   # wound so both sides face up (+U); no per-triangle flips, so shared edges stay consistent
                g.quad(ri[i], ri[i + 1], mi[i + 1], mi[i], smooth)
                g.tri(mi[i], mi[i + 1], ti, smooth)
            else:
                g.quad(ri[i + 1], ri[i], mi[i], mi[i + 1], smooth)
                g.tri(mi[i + 1], mi[i], ti, smooth)
    Tm, S, U = fr[-1]
    ti = g.vert(pts[-1] + Tm * W * tipw * 1.5 - U * W * 0.08, ctip)   # terminal leaflet: closes the tip into a point
    g.tri(ri[-1], ti, sides[1.0][-1], smooth)
    g.tri(ri[-1], sides[-1.0][-1], ti, smooth)
    if stalk > 0:  # a real petiole for the bare first part
        k = max(2, int(round(start * n)) + 1)
        tube(g, pts[:k + 1], [stalk * (1 - 0.35 * q / k) for q in range(k + 1)], 4, cstalk if cstalk is not None else crach, smooth=True)
    return pts


def blade(g, pts, wfun, fold=0.12, col=None, tears=None, up=UP, nb=None, bend=0.4, smooth=True, edge_drop=0.0):
    """a paddle leaf along a spine: 3 vertices per station (left, midrib, right), single vertices at both ends.
    wfun(t) = half width. tears = {station index: (left scale, right scale)} pulls the edge in (torn / notched)."""
    n = len(pts) - 1
    T, _, _ = frames(pts)
    rows = []
    prevS = None
    for i, p in enumerate(pts):
        t = i / n
        S = np.cross(up, T[i])
        if float(np.dot(S, S)) < 0.02:
            S = prevS if prevS is not None else np.array([1.0, 0, 0])
        S = unit(S)
        prevS = S
        U = unit(np.cross(T[i], S))
        w = wfun(t)

        def Nn(extra, U=U):
            v = unit(U + extra)
            if nb is not None:
                v = unit(v * (1 - bend) + nb * bend)
            return v

        if i == 0 or i == n or w < 1e-4:
            rows.append((g.vert(p, col(t, 0.0), Nn(0)),))
            continue
        sl, sr = (tears or {}).get(i, (1.0, 1.0))
        drop = fold + edge_drop * t
        l = g.vert(p + S * w * sl - U * w * sl * drop, col(t, 1.0), Nn(S * 0.4))
        m = g.vert(p, col(t, 0.0), Nn(0))
        r = g.vert(p - S * w * sr - U * w * sr * drop, col(t, -1.0), Nn(-S * 0.4))
        rows.append((l, m, r))
    for i in range(n):
        a, b = rows[i], rows[i + 1]
        ref = None
        if len(a) == 1 and len(b) == 3:
            g.tri(a[0], b[1], b[0], smooth, ref)
            g.tri(a[0], b[2], b[1], smooth, ref)
        elif len(a) == 3 and len(b) == 1:
            g.tri(a[0], a[1], b[0], smooth, ref)
            g.tri(a[1], a[2], b[0], smooth, ref)
        elif len(a) == 3 and len(b) == 3:
            g.quad(a[1], b[1], b[0], a[0], smooth, ref)
            g.quad(a[2], b[2], b[1], a[1], smooth, ref)
        else:
            pass
    return rows


# icosphere (cached)
def _ico(level):
    t = (1 + 5 ** 0.5) / 2
    vs = [(-1, t, 0), (1, t, 0), (-1, -t, 0), (1, -t, 0), (0, -1, t), (0, 1, t), (0, -1, -t), (0, 1, -t), (t, 0, -1), (t, 0, 1), (-t, 0, -1), (-t, 0, 1)]
    vs = [unit(np.array(v, float)) for v in vs]
    fs = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6), (7, 1, 8),
          (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1)]
    for _ in range(level):
        cache, nf = {}, []

        def mid(a, b):
            k = (min(a, b), max(a, b))
            if k not in cache:
                vs.append(unit(vs[a] + vs[b]))
                cache[k] = len(vs) - 1
            return cache[k]
        for a, b, c in fs:
            ab, bc, ca = mid(a, b), mid(b, c), mid(c, a)
            nf += [(a, ab, ca), (b, bc, ab), (c, ca, bc), (ab, bc, ca)]
        fs = nf
    return vs, fs


_ICO = {}


def blob(g, center, radii, level=1, col=None, amp=0.0, freq=1.5, seed=0.0, smooth=True, cut=None, R=None, ao=1.0, normals=False):
    """lumpy ellipsoid. col(unit_dir, pos) or rgb. cut = drop faces whose three vertices are all below world z = cut."""
    if level not in _ICO:
        _ICO[level] = _ico(level)
    vs, fs = _ICO[level]
    center = np.asarray(center, float)
    radii = np.asarray(radii, float) if hasattr(radii, "__len__") else np.array([radii] * 3, float)
    idx, pos = [], []
    for d in vs:
        k = 1 + amp * fbm(d * 1.0 + center * 0.37, freq, seed, 2)
        p = d * radii * k
        if R is not None:
            p = R @ p
        p = p + center
        pos.append(p)
    for d, p in zip(vs, pos):
        c = col(d, p) if callable(col) else col
        idx.append(g.vert(p, c, unit(p - center) if normals else None, ao=ao))
    for a, b, c in fs:
        if cut is not None and pos[a][2] < cut and pos[b][2] < cut and pos[c][2] < cut:
            continue
        g.tri(idx[a], idx[b], idx[c], smooth)
    return idx


def hull_rock(g, rng, radii, center=(0, 0, 0), npts=12, bevel=0.1, cut=None, col=None, planar=14.0, R=None, subdiv=None, rough=0.0,
              seed=0.0, pts=None, ao=1.0):
    """chunky faceted rock: convex hull of a few points, near-coplanar faces dissolved into big planes, edges bevelled,
    optionally cut at world z = cut (open bottom, so it reads as sunk). col(pos, vertex normal) -> rgb. Flat shaded."""
    radii = np.asarray(radii, float) if hasattr(radii, "__len__") else np.array([radii] * 3, float)
    center = np.asarray(center, float)
    bm = bmesh.new()
    if pts is None:
        pts = []
        for i in range(npts):  # jittered fibonacci directions
            z = 1 - 2 * (i + 0.5) / npts
            a = i * 2.39996 + rng.u(-0.5, 0.5)
            rr = math.sqrt(max(0.0, 1 - z * z))
            d = unit(np.array([rr * math.cos(a), rr * math.sin(a), z + rng.u(-0.25, 0.25)]))
            pts.append(d * radii * rng.u(0.78, 1.0))
    for p in pts:
        bm.verts.new(tuple(p))
    res = bmesh.ops.convex_hull(bm, input=bm.verts[:])
    seen, junk = set(), []          # keep the operator's order: a Python set of BMVerts iterates in memory-address order
    for e in res.get("geom_interior", []) + res.get("geom_unused", []):
        if isinstance(e, bmesh.types.BMVert) and e.is_valid and e not in seen:
            seen.add(e)
            junk.append(e)
    if junk:
        bmesh.ops.delete(bm, geom=junk, context="VERTS")
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(planar), verts=bm.verts[:], edges=bm.edges[:])
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel * float(min(radii)), offset_type="OFFSET", segments=1, profile=0.5,
                        affect="EDGES", clamp_overlap=True)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    if subdiv:
        long_e = [e for e in bm.edges if e.calc_length() > subdiv]
        if long_e:
            bmesh.ops.subdivide_edges(bm, edges=long_e, cuts=1)
            bmesh.ops.triangulate(bm, faces=bm.faces[:])
    if rough > 0:
        for v in bm.verts:
            v.co += v.normal * (rough * float(min(radii)) * fbm(np.array(v.co), 1.3 / float(max(radii)), seed, 2))
    M = np.eye(3) if R is None else R
    for v in bm.verts:
        v.co = Vector(tuple(M @ np.array(v.co) + center))
    if cut is not None:
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=1e-5, plane_co=(0, 0, cut), plane_no=(0, 0, 1),
                               clear_inner=True)
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bmesh.ops.dissolve_degenerate(bm, dist=1e-4, edges=bm.edges[:])
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-4)
    bm.normal_update()
    bm.verts.index_update()
    # Blender's hull operator returns its geometry in memory-address order, so the same rock comes out with its
    # vertices and faces shuffled from run to run. Emit them in a canonical order so rebuilds are byte-identical.
    vs = sorted((tuple(np.round(np.array(v.co), 5)), tuple(np.round(np.array(v.normal), 4)), v.index) for v in bm.verts)
    idx = {}
    for p, n, i in vs:
        p, n = np.array(p), np.array(n)
        idx[i] = g.vert(p, col(p, n) if callable(col) else col, ao=ao)
    tris = []
    for f in bm.faces:
        t = [idx[v.index] for v in f.verts]
        k = t.index(min(t))
        tris.append(tuple(t[k:] + t[:k]))
    for a, b, c in sorted(tris):
        g.tri(a, b, c, False)
    bm.free()


# ------------------------------------------------------------------ AO bake into vertex colours
def _hemi(k=24):
    out = []
    for i in range(k):  # cosine-weighted, stratified
        u, a = (i + 0.5) / k, i * 2.39996
        r, z = math.sqrt(u), math.sqrt(1 - u)
        out.append((r * math.cos(a), r * math.sin(a), z))
    return np.array(out)


_HEMI = _hemi(24)


def vertex_normals(g):
    v = np.array(g.v)
    f = np.array(g.f, dtype=np.int64).reshape(-1, 3)
    n = np.zeros_like(v)
    if len(f):
        fn = np.cross(v[f[:, 1]] - v[f[:, 0]], v[f[:, 2]] - v[f[:, 0]])
        for k in range(3):
            np.add.at(n, f[:, k], fn)
    ln = np.linalg.norm(n, axis=1)
    ln[ln < 1e-12] = 1
    return n / ln[:, None]


SHADE = {"matte": np.array([0.50, 0.46, 0.50]), "foliage": np.array([0.58, 0.66, 0.58]), "emissive": np.array([0.45, 0.5, 0.6])}


def bake_ao(geos, dist=1.2, ground=True, strength=1.0, gamma=0.8, floor_z=0.0):
    """ray-cast ambient occlusion for one asset (all its Geos occlude each other + a ground plane), multiplied into the
    vertex colours with a cool shadow tint. Foliage is two-sided, so it is lit from the sky side."""
    allv, allf = [], []
    for g in geos:
        base = len(allv)
        allv += [tuple(p) for p in g.v]
        allf += [(a + base, b + base, c + base) for a, b, c in g.f]
    if ground:
        base, S = len(allv), 60.0
        allv += [(-S, -S, floor_z), (S, -S, floor_z), (S, S, floor_z), (-S, S, floor_z)]
        allf += [(base, base + 1, base + 2), (base, base + 2, base + 3)]
    bvh = BVHTree.FromPolygons(allv, allf, epsilon=0.0)
    for g in geos:
        if not g.v:
            continue
        vn = vertex_normals(g)
        two = g.mat == "foliage"
        tint = SHADE[g.mat]
        for i, p in enumerate(g.v):
            n = g.n[i] if g.n[i] is not None else vn[i]
            if two:
                if n[2] < -0.05:
                    n = -n
                n = unit(n + UP * 0.6)
            if p[2] < floor_z - 0.03 and ground:
                occ = 0.75
            else:
                t1 = np.cross(n, np.array([0.0, 0.0, 1.0]) if abs(n[2]) < 0.9 else np.array([1.0, 0.0, 0.0]))
                t1 = unit(t1)
                t2 = np.cross(n, t1)
                o = Vector(tuple(p + n * 0.015))
                dirs = (_HEMI @ np.array([t1, t2, n])).tolist()
                occ = 0.0
                for d in dirs:
                    hit = bvh.ray_cast(o, d, dist)
                    if hit[0] is not None:
                        occ += 1.0 - 0.6 * (hit[3] / dist)
                occ /= len(dirs)
            a = clamp(1.0 - occ) ** gamma
            k = strength * g.ao[i]
            g.c[i] = g.c[i] * mix(np.ones(3), mix(tint, np.ones(3), a), k)


# ------------------------------------------------------------------ Blender objects
def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    return bpy.context.scene


_MATS = {}


def preview_material(mat):
    if mat in _MATS:
        return _MATS[mat]
    m = bpy.data.materials.new("NAT_" + mat)
    nt = m.node_tree
    for nd in list(nt.nodes):
        nt.nodes.remove(nd)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    att = nt.nodes.new("ShaderNodeVertexColor")
    att.layer_name = "Col"
    if mat == "emissive":
        em = nt.nodes.new("ShaderNodeEmission")
        em.inputs["Strength"].default_value = 1.6
        nt.links.new(att.outputs["Color"], em.inputs["Color"])
        nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    else:
        bs = nt.nodes.new("ShaderNodeBsdfPrincipled")
        bs.inputs["Roughness"].default_value = 0.85
        nt.links.new(att.outputs["Color"], bs.inputs["Base Color"])
        nt.links.new(bs.outputs["BSDF"], out.inputs["Surface"])
    m.use_backface_culling = mat != "foliage"
    _MATS[mat] = m
    return m


def make_object(name, g, coll, extras=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(float(x) for x in p) for p in g.v], [], [tuple(f) for f in g.f])
    me.polygons.foreach_set("use_smooth", g.fs)
    ca = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    col = np.ones((len(g.v), 4), np.float32)
    col[:, :3] = np.array(g.c, np.float32)
    ca.data.foreach_set("color", col.ravel())
    if g.uv is not None:
        uvl = me.uv_layers.new(name="UVMap")
        li = np.empty(len(me.loops), np.int32)
        me.loops.foreach_get("vertex_index", li)
        uvl.data.foreach_set("uv", np.array(g.uv, np.float32)[li].ravel())
    me.update()
    if any(n is not None for n in g.n):
        nl = len(me.loops)
        cn = np.empty(nl * 3, np.float32)
        me.corner_normals.foreach_get("vector", cn)
        cn = cn.reshape(-1, 3)
        li = np.empty(nl, np.int32)
        me.loops.foreach_get("vertex_index", li)
        has = np.array([n is not None for n in g.n])
        cust = np.array([n if n is not None else (0.0, 0.0, 1.0) for n in g.n], np.float32)
        mask = has[li]
        cn[mask] = cust[li][mask]
        me.normals_split_custom_set([tuple(x) for x in cn.tolist()])
    me.materials.append(preview_material(g.mat))
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    ob["mat"] = g.mat
    for k, v in (extras or {}).items():
        ob[k] = v
    return ob


# ------------------------------------------------------------------ GLB writer (position, normal, COLOR_0 [+ TEXCOORD_0])
def mesh_arrays(me, with_uv=False):
    nl = len(me.loops)
    lt = np.empty(len(me.polygons), np.int32)
    me.polygons.foreach_get("loop_total", lt)
    assert (lt == 3).all(), me.name + ": mesh must be triangles"
    li = np.empty(nl, np.int32)
    me.loops.foreach_get("vertex_index", li)
    co = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    cn = np.empty(nl * 3, np.float32)
    me.corner_normals.foreach_get("vector", cn)
    cn = cn.reshape(-1, 3)
    col = np.empty(len(me.vertices) * 4, np.float32)
    me.color_attributes["Col"].data.foreach_get("color", col)
    col = col.reshape(-1, 4)[:, :3]
    P = co[li][:, [0, 2, 1]] * np.array([1, 1, -1], np.float32)  # blender z-up -> gltf y-up
    N = cn[:, [0, 2, 1]] * np.array([1, 1, -1], np.float32)
    ln = np.linalg.norm(N, axis=1)
    ln[ln < 1e-9] = 1
    N = N / ln[:, None]
    Nq = np.clip(np.round(N * 127), -127, 127).astype(np.int8)
    Cq = np.round(np.clip(col[li], 0, 1) * 65535).astype(np.uint16)
    P = np.ascontiguousarray(P, np.float32)
    parts = [P.view(np.uint8).reshape(nl, 12), Nq.view(np.uint8).reshape(nl, 3), np.ascontiguousarray(Cq).view(np.uint8).reshape(nl, 6)]
    UVq = None
    if with_uv and me.uv_layers:
        uv = np.empty(nl * 2, np.float32)
        me.uv_layers[0].data.foreach_get("uv", uv)
        UVq = np.ascontiguousarray(uv.reshape(-1, 2) * np.array([1, -1], np.float32) + np.array([0, 1], np.float32), np.float32)
        parts.append(UVq.view(np.uint8).reshape(nl, 8))
    key = np.concatenate(parts, axis=1)
    _, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    inv = inv.reshape(-1)
    out = {"pos": P[first], "nrm": Nq[first], "col": Cq[first], "idx": inv.astype(np.uint32)}
    if UVq is not None:
        out["uv"] = UVq[first]
    return out


def write_glb(path, objects, scene_extras=None):
    """objects: list of (name, mesh, extras dict). Writes one GLB: POSITION f32, NORMAL i8 (normalized), COLOR_0 u16 rgba."""
    buf = bytearray()
    views, accs, meshes, nodes = [], [], [], []

    def view(data, target, stride=None):
        while len(buf) % 4:
            buf.append(0)
        v = {"buffer": 0, "byteOffset": len(buf), "byteLength": len(data), "target": target}
        if stride:
            v["byteStride"] = stride
        buf.extend(data)
        views.append(v)
        return len(views) - 1

    def acc(v, ctype, count, typ, norm=False, mn=None, mx=None):
        a = {"bufferView": v, "componentType": ctype, "count": int(count), "type": typ}
        if norm:
            a["normalized"] = True
        if mn is not None:
            a["min"], a["max"] = mn, mx
        accs.append(a)
        return len(accs) - 1

    total = 0
    for name, me, extras in objects:
        A = mesh_arrays(me, with_uv=bool(extras.get("uv")))
        n = len(A["pos"])
        nq = np.zeros((n, 4), np.int8)
        nq[:, :3] = A["nrm"]
        cq = np.full((n, 4), 65535, np.uint16)
        cq[:, :3] = A["col"]
        attrs = {
            "POSITION": acc(view(A["pos"].astype("<f4").tobytes(), 34962), 5126, n, "VEC3", mn=[float(x) for x in A["pos"].min(0)], mx=[float(x) for x in A["pos"].max(0)]),
            "NORMAL": acc(view(nq.tobytes(), 34962, 4), 5120, n, "VEC3", norm=True),
            "COLOR_0": acc(view(cq.astype("<u2").tobytes(), 34962), 5123, n, "VEC4", norm=True),
        }
        if "uv" in A:
            attrs["TEXCOORD_0"] = acc(view(A["uv"].astype("<f4").tobytes(), 34962), 5126, n, "VEC2")
        if n <= 65535:
            ia = acc(view(A["idx"].astype("<u2").tobytes(), 34963), 5123, len(A["idx"]), "SCALAR")
        else:
            ia = acc(view(A["idx"].astype("<u4").tobytes(), 34963), 5125, len(A["idx"]), "SCALAR")
        meshes.append({"name": name, "primitives": [{"attributes": attrs, "indices": ia, "mode": 4}]})
        ex = dict(extras)
        ex["tris"] = len(A["idx"]) // 3
        total += ex["tris"]
        nodes.append({"name": name, "mesh": len(meshes) - 1, "extras": ex})
    while len(buf) % 4:
        buf.append(0)
    doc = {"asset": {"version": "2.0", "generator": "bananaville tools/blender/nature (Blender %s)" % bpy.app.version_string},
           "extensionsUsed": ["KHR_mesh_quantization"], "extensionsRequired": ["KHR_mesh_quantization"],
           "scene": 0, "scenes": [{"nodes": list(range(len(nodes))), "extras": scene_extras or {}}],
           "nodes": nodes, "meshes": meshes, "accessors": accs, "bufferViews": views, "buffers": [{"byteLength": len(buf)}]}
    js = json.dumps(doc, separators=(",", ":")).encode()
    while len(js) % 4:
        js += b" "
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as fh:
        fh.write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(buf)))
        fh.write(struct.pack("<II", len(js), 0x4E4F534A))
        fh.write(js)
        fh.write(struct.pack("<II", len(buf), 0x004E4942))
        fh.write(bytes(buf))
    return total
