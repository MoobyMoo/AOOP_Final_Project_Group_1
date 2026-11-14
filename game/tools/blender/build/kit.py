"""Shared palette and sub-builders (planks, bananas, rivets, ropes, ladders) used by every group."""
from math import sin, cos, pi, radians, degrees, sqrt, atan2
from mathutils import Vector, Matrix
from lib import *

# palette (sRGB). Warm, mid-value woods and stone; saturated colour is kept for loot, paint and emissives.
WOOD = ["#b08552", "#a57a4a", "#bb9160", "#9c7245"]
WOOD_D = ["#7a5636", "#6e4b2e", "#84603c"]
WOOD_PALE = ["#cdb083", "#c4a577", "#d6ba8e"]
WOOD_GREY = ["#9a8b74", "#8f7f6a", "#a69780"]
ENDGRAIN = "#c9aa78"
STONE = ["#c4ab84", "#b89e78", "#a88f6c", "#cdb690"]
STONE_D = "#8a765a"
MOSS = "#6f8448"
STEEL, STEEL_D, STEEL_L = "#7b868c", "#4d555b", "#9aa5aa"
IRON = "#3d3a40"
RUST = ["#a8552e", "#93482a", "#b9673a", "#7f4028"]
HULL_W, HULL_T = "#e2dccb", "#3f8f9a"
CANVAS = ["#e0cfa6", "#d6c398", "#e8d8b2"]
CANVAS_D = "#8f7a55"
KHAKI = ["#8a7d5a", "#7d6a4a"]
ROPE = "#c9a56a"
GOLD, GOLD_D, GOLD_L = "#f2c23a", "#c08a26", "#ffe07a"
BANANA, BANANA_D = "#f5cf3d", "#9a7526"
RED, RED_D = "#d7402f", "#a52c22"
CREAM = "#efe3c5"
PAPER = "#f1e7cf"
EARTH = ["#6e5640", "#63503a", "#7a6048"]
SAND = "#e0c48c"
GREEN_P, GREEN_PD = "#667f4c", "#4c6339"      # crate paint
OLIVE = "#77743f"
PLUM, PLUM_D = "#57445a", "#3f3243"
LEAF = ["#4f8f3a", "#5f9e3f", "#457f34"]
BREAK_X = "#ffc23a"
CRACK = "#2e2219"
DARK = "#1c1512"
FLAME = ["#fff0a0", "#ffc13a", "#ff8a24"]
BULB = "#ffe2a0"
NEON = "#ffe66e"


def pick(rng, lst):
    return lst[int(rng.random() * len(lst)) % len(lst)]


def plank(g, p0, p1, w, t, col=None, roll=0.0, wob=0.0, pal=WOOD, b=0.022, **kw):
    """one board from p0 to p1 (w wide, t thick); wob jitters the ends a little so rows never look ruled"""
    r = g.rng
    p0 = Vector(p0) + Vector((r.uniform(-wob, wob), r.uniform(-wob, wob), r.uniform(-wob, wob)))
    p1 = Vector(p1) + Vector((r.uniform(-wob, wob), r.uniform(-wob, wob), r.uniform(-wob, wob)))
    kw.setdefault("jit", 0.07)
    g.beam(p0, p1, w, t, col or pick(r, pal), b=b, roll=roll, **kw)


def log(g, p0, p1, r, col=None, r2=None, n=9, bark=WOOD_D, cut=ENDGRAIN, **kw):
    """a round log with pale cut ends"""
    g.pole(p0, p1, r, col or pick(g.rng, bark), n=n, r2=r2, b=min(0.03, r * 0.3), cap=cut, **kw)


def rivets(g, pts, r=0.035, col=STEEL_L, axis=(0, -1, 0)):
    """small domed rivets at pts, pointing along axis: a squat ball sunk halfway into the surface"""
    ax = Vector(axis).normalized()
    for p in pts:
        p = Vector(p)
        g.emit(p_sphere(r, 6, 3), col, along(p - ax * r * 0.25, p + ax) @ Matrix.Diagonal((1, 1, 0.8, 1)), jit=0.02)


def banana(g, at, rot=(0, 0, 0), s=1.0, col=BANANA, n=5):
    """one curved banana: a crescent in its local xz plane, both tips up, centred on `at`"""
    L = 0.5 * s
    pts, rs = [], []
    for i in range(7):
        t = i / 6
        a = (t - 0.5) * 1.9
        pts.append((sin(a) * L * 0.5, 0, (1 - cos(a)) * L * 0.5))
        rs.append(0.064 * s * (0.3 + 0.7 * sin(pi * (0.06 + 0.88 * t)) ** 0.6))
    with g.at(T(*at, *rot)):
        g.emit(p_tube(pts, rs, n), lambda c, tg: BANANA_D if abs(c.x) > L * 0.36 else col, jit=0.04)


def bunch(g, at, rot=(0, 0, 0), s=1.0, k=4):
    """a hand of bananas: side by side, all curving the same way, joined at one end"""
    with g.at(T(*at, *rot)):
        for i in range(k):
            o = i - (k - 1) / 2
            banana(g, (0.02 * abs(o) * s, o * 0.105 * s, 0.015 * abs(o) * s), (o * 9, 0, o * 7), s)
        g.box(0.13 * s, 0.11 * k * s * 0.8, 0.12 * s, (-0.2 * s, 0, 0.04 * s), (0, -35, 0), col="#6a5226", b=0.025)


def rope(g, pts, r=0.04, col=ROPE, n=5, sag=0.0, seg=6):
    """a rope through pts; sag droops each span in the middle"""
    out = []
    for i in range(len(pts) - 1):
        a, b = Vector(pts[i]), Vector(pts[i + 1])
        for k in range(seg):
            t = k / seg
            p = a.lerp(b, t)
            p.z -= sag * 4 * t * (1 - t)
            out.append(p)
    out.append(Vector(pts[-1]))
    g.tube(out, r, col, n=n, jit=0.04)


def ladder(g, p0, p1, w=0.6, rung=0.38, col=None, r=0.06, rr=0.045, face=(0, -1, 0)):
    """two rails from p0 to p1 (centre line) with rungs; `face` is roughly the side you climb from"""
    p0, p1 = Vector(p0), Vector(p1)
    d = (p1 - p0)
    side = d.cross(Vector(face)).normalized() * (w / 2)
    col = col or pick(g.rng, WOOD)
    for s in (-1, 1):
        g.pole(p0 + side * s, p1 + side * s, r, col, n=6)
    n = max(2, int(d.length / rung))
    for i in range(n):
        t = (i + 0.6) / n
        c = p0 + d * t
        g.pole(c - side * 1.12, c + side * 1.12, rr, shade(col, 0.92), n=5)


def lashing(g, p, axis, r, col=ROPE, turns=3, rr=0.03):
    """rope wrapped round a pole of radius r at p (axis = pole direction)"""
    ax = Vector(axis).normalized()
    m = along(Vector(p) - ax * (turns * rr), Vector(p) + ax)
    for i in range(turns):
        g.emit(p_lathe([(r, 0), (r + rr * 1.3, rr * 0.9), (r, rr * 1.8)], 8, cap0=False, cap1=False), col, m @ T(0, 0, i * rr * 1.8), jit=0.04)


def stone_block(g, sx, sy, sz, at, rot=(0, 0, 0), col=None, b=0.07, chip=0.0, **kw):
    """a chunky ruin block: heavy chamfer, slight size wobble"""
    r = g.rng
    col = col or pick(r, STONE)
    kw.setdefault("jit", 0.05)
    kw.setdefault("grad", (0.9, 1.04))
    g.box(sx * r.uniform(0.988, 1.0), sy * r.uniform(0.96, 1.0), sz + 0.035, at, (rot[0] + r.uniform(-1, 1) * chip, rot[1] + r.uniform(-1, 1) * chip, rot[2] + r.uniform(-2, 2) * chip), col=col, b=b, **kw)


def rubble(g, n, cx, cy, rad, smin=0.18, smax=0.45, pal=STONE, z=0.0, seed=1):
    """a connected clump of rubble: the first stone sits on (cx, cy) (put that against the parent piece), every other
    one leans on a stone already placed, so nothing floats loose"""
    r = random.Random(seed)
    placed = []
    for i in range(n):
        s = r.uniform(smin, smax)
        if not placed:
            x, y = cx, cy
        else:
            for _ in range(8):
                px, py, ps = r.choice(placed)
                a = r.uniform(0, 2 * pi)
                d = 0.22 * (ps + s)
                x, y = px + cos(a) * d, py + sin(a) * d
                if (x - cx) ** 2 + (y - cy) ** 2 <= rad * rad:
                    break
        placed.append((x, y, s))
        g.rock(s, s * r.uniform(0.8, 1.1), s * r.uniform(0.55, 0.8), (x, y, z - s * 0.1 - 0.004 * i), (0, 0, r.uniform(0, 360)), col=pick(r, pal), n=9, b=s * 0.12, seed=r.random())


def moss_pad(g, sx, sy, at, col=MOSS, h=0.08, rz=0.0):
    """a low soft moss cushion (not an olive ball: wide, flat, irregular)"""
    r = g.rng
    pts = []
    n = 9
    for k in range(n):
        a = 2 * pi * k / n
        rr = r.uniform(0.75, 1.0)
        pts.append((cos(a) * sx / 2 * rr, sin(a) * sy / 2 * rr))
    g.prism(pts, h, at, (0, 0, rz), col=col, b=h * 0.45, smooth=75, jit=0.06, hl=1.06)


def icon_banana(g, M, s=1.0, col=CREAM):
    """painted crescent banana icon, about s wide"""
    out, inn = [], []
    for i in range(9):
        a = radians(200 + i * 17.5)
        out.append((cos(a) * 0.5 * s, sin(a) * 0.5 * s + 0.28 * s))
    for i in range(9):
        a = radians(340 - i * 17.5)
        inn.append((cos(a) * 0.36 * s + 0.0, sin(a) * 0.30 * s + 0.36 * s))
    # build as quads between the outer and inner arcs (a crescent is concave, so no single polygon)
    V, F = [], []
    inn = inn[::-1]
    for i in range(9):
        V.append((out[i][0], out[i][1], 0)); V.append((inn[i][0], inn[i][1], 0))
    for i in range(8):
        F.append([2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1])
    g.decal((V, F, [0] * len(F)), M, col)


def icon_arrow(g, M, s=1.0, col=CREAM):
    g.paint_poly([(-0.5 * s, -0.11 * s), (0.08 * s, -0.11 * s), (0.08 * s, -0.3 * s), (0.5 * s, 0), (0.08 * s, 0.3 * s), (0.08 * s, 0.11 * s), (-0.5 * s, 0.11 * s)], M, col)


# decal planes: local +z = outward normal of the face, local +y = up (or north on a top face)
def FRONT(x, y, z, roll=0.0): return T(x, y, z, 90, 0, 0) @ T(rz=roll)
def BACK(x, y, z, roll=0.0): return T(x, y, z, 90, 0, 180) @ T(rz=roll)
def RIGHT(x, y, z, roll=0.0): return T(x, y, z, 90, 0, 90) @ T(rz=roll)
def LEFT(x, y, z, roll=0.0): return T(x, y, z, 90, 0, -90) @ T(rz=roll)
def TOP(x, y, z, roll=0.0): return T(x, y, z, 0, 0, roll)


def stone_run(g, p0, p1, rows, thick=0.62, bh=0.5, bl=0.95, crest=None, z0=-0.04, pal=STONE, b=0.075, chip=1.2):
    """courses of staggered blocks from p0 to p1 (xy). crest(row, t) -> False drops a block (t = 0..1 along the run)"""
    p0, p1 = Vector((p0[0], p0[1], 0)), Vector((p1[0], p1[1], 0))
    d = p1 - p0
    L = d.length
    ang = degrees(atan2(d.y, d.x))
    n = max(1, round(L / bl))
    for row in range(rows):
        cuts = [L * i / n for i in range(n + 1)]
        if row % 2 == 1 and n > 1:
            cuts = [0] + [L * (i + 0.5) / n for i in range(n)] + [L]
        for i in range(len(cuts) - 1):
            t = (cuts[i] + cuts[i + 1]) / 2 / L
            if crest and not crest(row, t):
                continue
            c = p0 + d * t
            stone_block(g, cuts[i + 1] - cuts[i] - 0.03, thick, bh - 0.02, (c.x, c.y, z0 + row * bh), (0, 0, ang), col=pick(g.rng, pal), b=b, chip=chip)


def vine(g, pts, r=0.045, col="#4d7a36", leaves=5, lcol=LEAF, ls=0.2, face=(0, -1, 0)):
    """a hanging vine through pts with a few solid leaf blades"""
    rg = g.rng
    g.tube(pts, r, col, n=5, jit=0.05)
    f = Vector(face).normalized()
    for i in range(leaves):
        t = (i + 0.5) / leaves
        k = t * (len(pts) - 1)
        a, b = Vector(pts[int(k)]), Vector(pts[min(len(pts) - 1, int(k) + 1)])
        p = a.lerp(b, k - int(k))                          # on the stem's centre line: the leaf root is buried in it
        s = ls * rg.uniform(0.8, 1.25)
        m = along(p, p + f) @ T(rz=rg.uniform(0, 360)) @ T(0, 0, r * 0.3, rg.uniform(-20, 20), rg.uniform(-30, -5), 0)
        g.emit(p_prism([(0.0, -s * 0.07), (s * 0.45, -s * 0.32), (s * 1.1, 0.0), (s * 0.45, s * 0.32), (0.0, s * 0.07)], 0.03), pick(rg, lcol), m, jit=0.07)
