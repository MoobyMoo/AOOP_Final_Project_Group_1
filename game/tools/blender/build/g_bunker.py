"""The bunker under Exile Beach (home base). Everything is authored in ROOM space: x -8..8, y -5..5 (Blender y =
-game z, so the back wall is at y = +5), floor at z 0. The camera looks from the south-west, so the back (north)
and east walls stand full height and the south and west walls are cut down to a low section.
AO is baked with the whole room as occluder (SHARED_AO); the four upgrade fixtures are separate assets that do
not occlude the room, because they are hidden until bought."""
from kit import *

G = "bunker"
SHARED_AO = True
WALL_H = 3.4
EARTH_D = "#5c4735"


def A(name, seed, fixture=False, **kw):
    a = Asset(name, G, seed=seed, ao_dist=1.6, **kw)
    a.fixture = fixture
    return a


def small_crate(g, at, s=0.7, rz=0.0, pal=WOOD, h=None):
    h = h or s * 0.8
    with g.at(T(*at, 0, 0, rz)):
        g.box(s, s, h, col=pick(g.rng, pal), b=0.03, grad=(0.86, 1.04))
        for z in (0.03, h - 0.13):
            for sy in (-1, 1):
                g.box(s + 0.06, 0.05, 0.1, (0, sy * s / 2, z), col=pick(g.rng, WOOD_D), b=0.02)
                g.box(0.04, s + 0.02, 0.09, (sy * s / 2, 0, z + 0.005), col=pick(g.rng, WOOD_D), b=0.015)


def room(name, seed):
    a = A(name, seed, footprint=8)
    g, r = a.mesh(), a.rng
    # ---- floor: boards running east-west over dark earth
    g.box(16.6, 10.6, 0.06, (0, 0, -0.1), col="#4a3828", b=0, jit=0)
    rows = 22
    pw = 10.3 / rows
    for i in range(rows):
        y = -5.15 + pw * (i + 0.5)
        x = -8.2
        while x < 8.2:
            x1 = min(8.2, x + r.uniform(1.5, 2.8))
            if x1 > 7.6:
                x1 = 8.2
            g.box(x1 - x - 0.035, pw - 0.035, 0.07, ((x + x1) / 2, y, -0.07), col=pick(r, ["#9a8468", "#8f7a60", "#a48e72", "#94806a"]), b=0.0, jit=0.05)
            x = x1
    # a worn rug in the middle
    g.box(4.6, 2.9, 0.035, (0.2, -0.4, 0.0), (0, 0, 2), col="#7f3a31", b=0.01, jit=0)
    m = TOP(0.2, -0.4, 0.036) @ T(rz=2)
    g.paint_line([(-2.05, -1.2), (2.05, -1.2), (2.05, 1.2), (-2.05, 1.2)], 0.12, m, "#b8954c", closed=True)
    g.paint_line([(-1.7, -0.9), (1.7, -0.9), (1.7, 0.9), (-1.7, 0.9)], 0.05, m, "#5f2a24", closed=True)
    icon_banana(g, m @ T(0, -0.42, 0), 1.3, "#b8954c")

    # ---- back (north) and east walls: plank lining between posts, earth above, sand on top
    def lined_wall(p0, p1, posts):
        p0, p1 = Vector((p0[0], p0[1], 0)), Vector((p1[0], p1[1], 0))
        d = (p1 - p0).normalized()
        nrm = Vector((d.y, -d.x, 0))                    # into the room
        L = (p1 - p0).length
        rows_ = 6
        ph = 2.55 / rows_
        for i in range(rows_):
            z = 0.06 + ph * (i + 0.5)
            for k in range(len(posts) - 1):
                a0, a1 = p0 + d * (posts[k] + 0.12), p0 + d * (posts[k + 1] - 0.12)
                a0.z = a1.z = z
                plank(g, a0, a1, ph - 0.03, 0.09, pal=["#a08258", "#96784f", "#aa8c62", "#8f7149"], roll=90, wob=0.006, b=0.022)
        for t in posts:
            c = p0 + d * t + nrm * 0.1
            g.box(0.26, 0.26, WALL_H - 0.02, (c.x, c.y, 0), col=pick(r, WOOD_D), b=0.035, jit=0.05, grad=(0.86, 1.05))
        a0, a1 = p0 + nrm * 0.1, p1 + nrm * 0.1
        a0.z = a1.z = WALL_H - 0.12
        g.beam(a0, a1, 0.3 if abs(d.x) > 0.5 else 0.27, 0.3 if abs(d.x) > 0.5 else 0.27, pick(r, WOOD_D), b=0.04, ext=0.1 if abs(d.x) > 0.5 else -0.2)                 # top plate
        # packed earth between the lining and the top plate, and the earth mass behind / on top
        e0, e1 = p0 - nrm * 0.08, p1 - nrm * 0.08
        e0.z = e1.z = 2.62
        g.beam(e0 + Vector((0, 0, 0.33)), e1 + Vector((0, 0, 0.33)), 0.2, 0.66, EARTH_D, b=0.03, jit=0.03)
        for k in range(int(L / 1.1)):
            c = p0 + d * (0.5 + k * 1.1 + r.uniform(-0.2, 0.2)) + nrm * 0.03
            g.rock(r.uniform(0.25, 0.5), 0.3, r.uniform(0.18, 0.3), (c.x, c.y, r.uniform(2.75, 3.05)), (0, 0, r.uniform(0, 360)), col=pick(r, ["#8d8478", "#7d6a52", "#9a9080"]), n=8, b=0.03, seed=r.random(), flatbase=False)
        m0, m1 = p0 - nrm * 0.62, p1 - nrm * 0.62
        ns = abs(d.x) > 0.5                                  # the north wall owns the corner: the east wall butts into it
        g.beam(Vector((m0.x, m0.y, 1.85 if ns else 1.84)), Vector((m1.x, m1.y, 1.85 if ns else 1.84)), 1.0, 3.9 if ns else 3.88, pick(r, EARTH), b=0.1, ext=0.5 if ns else -0.3, jit=0.03, grad=(0.9, 1.0))
        g.beam(Vector((m0.x, m0.y, 3.9 if ns else 3.89)), Vector((m1.x, m1.y, 3.9 if ns else 3.89)), 1.06, 0.26 if ns else 0.24, SAND, b=0.08, ext=0.53 if ns else -0.3, jit=0.02)
    lined_wall((-8.1, 5.1), (8.1, 5.1), [0.1, 2.1, 6.1, 8.1, 10.1, 12.1, 14.1, 16.1])      # no post at x = -4: the fence's window is there
    lined_wall((8.1, 5.1), (8.1, -5.1), [0.5, 2.8, 5.2, 7.6, 10.0])
    # ---- cut-away south and west walls: a low section showing boards, earth and sand
    for (p0, p1) in (((-8.1, -5.1), (8.1, -5.1)), ((-8.1, -5.1), (-8.1, 5.1))):
        p0, p1 = Vector((p0[0], p0[1], 0)), Vector((p1[0], p1[1], 0))
        d = (p1 - p0).normalized()
        if abs(d.x) > 0.5:
            out = Vector((0, -1, 0))
        else:
            out = Vector((-1, 0, 0))
        c0, c1 = p0 + out * 0.42, p1 + out * 0.42
        sw = abs(d.x) > 0.5
        g.beam(Vector((c0.x, c0.y, 0.14)), Vector((c1.x, c1.y, 0.14)), 0.9, 0.5 if sw else 0.47, pick(r, EARTH), b=0.08, ext=0.45 if sw else -0.4, jit=0.03)
        i0, i1 = p0 - out * 0.06, p1 - out * 0.06
        g.beam(Vector((i0.x, i0.y, 0.215)), Vector((i1.x, i1.y, 0.215)), 0.1, 0.42 if sw else 0.4, "#a08258", b=0.025, jit=0.04, ext=0 if sw else -0.1)
        for k in range(int((p1 - p0).length / 2.0) + 1):
            c = p0 + d * min((p1 - p0).length - (0.5 if not sw else 0.1), k * 2.0 + (0.1 if sw else 0.6)) - out * 0.02
            g.box(0.26, 0.26, 0.62 if sw else 0.6, (c.x, c.y, 0.002), col=pick(r, WOOD_D), b=0.04)
    # ---- pipes, a vent and a fuse panel on the east wall
    g.tube([(7.86, 4.6, 2.3), (7.86, 1.2, 2.3), (7.86, 1.2, 0.1)], 0.07, STEEL_D, n=6)
    g.tube([(7.84, 4.6, 2.05), (7.84, -0.2, 2.05)], 0.045, RUST[1], n=6)
    g.box(0.1, 0.9, 0.6, (7.9, -3.4, 1.9), col=STEEL_D, b=0.03)
    for i in range(4):
        g.box(0.03, 0.7, 0.05, (7.84, -3.4, 2.0 + i * 0.12), col="#22262a", b=0, jit=0)
    # stash in the north-east corner (Sal's corner later) and by the cot
    small_crate(g, (7.3, 4.3, 0), 0.9, 8)
    small_crate(g, (7.35, 4.3, 0.72), 0.62, -14, WOOD_PALE)
    for (x, y) in ((6.5, 4.5), (5.72, 4.4)):
        g.lathe([(0.3, 0), (0.34, 0.04), (0.37, 0.45), (0.34, 0.86), (0.3, 0.9)], (x, y, 0), col=pick(r, WOOD), n=10, smooth=40, grad=(0.86, 1.05))
        g.emit(p_lathe([(0.36, -0.04), (0.385, 0.0), (0.36, 0.04)], 10, cap0=False, cap1=False), STEEL_D, T(x, y, 0.25))
        g.emit(p_lathe([(0.36, -0.04), (0.385, 0.0), (0.36, 0.04)], 10, cap0=False, cap1=False), STEEL_D, T(x, y, 0.65))
    for (x, y, rz) in ((-7.3, 4.4, 20), (-7.45, 3.7, -15)):
        g.box(0.8, 0.5, 0.3, (x, y, 0), (0, 0, rz), col="#b99a66", b=0.11, jit=0.05)
    g.box(0.8, 0.5, 0.3, (-7.35, 4.1, 0.27), (0, 0, 60), col="#ad8d5a", b=0.11)
    a.point("sal", (6.6, 2.4, 0))
    a.point("spawn", (0, -2.4, 0))
    return a


def sell_counter(name, seed, x=-4.5, y=4.1):
    """the fence: a shady hatch in the back wall, a counter, a bell (its own node), a scale, a WE BUY board"""
    a = A(name, seed, footprint=1.6, blocksMove=True, glow=2.0)
    g, r = a.mesh(), a.rng
    with g.at(T(x, y, 0)):
        g.box(3.0, 0.95, 0.95, (0, 0.1, 0), col=pick(r, WOOD), b=0.04, grad=(0.86, 1.04))
        for i in range(5):
            g.box(0.56, 0.05, 0.8, (-1.2 + i * 0.6, -0.39, 0.07), col=pick(r, WOOD_D), b=0.02, jit=0.06)
        g.box(3.3, 1.42, 0.12, (0, 0.13, 0.95), col=pick(r, WOOD_D), b=0.035)
        # the window: a dark hole in the wall with a frame, bars and a half-raised shutter
        g.box(2.5, 0.1, 1.5, (0, 0.9, 1.1), col="#17120f", b=0, jit=0)
        for sx in (-1, 1):
            g.box(0.2, 0.22, 1.7, (sx * 1.33, 0.8, 1.02), col=pick(r, WOOD_D), b=0.035)
        g.box(2.9, 0.26, 0.2, (0, 0.8, 2.62), col=pick(r, WOOD_D), b=0.035)
        for i in range(4):
            g.box(2.46, 0.09, 0.15, (0, 0.74, 2.42 - i * 0.16), (10, 0, 0), col=pick(r, [STEEL_D, "#59666b"]), b=0.02)
        for i in range(5):
            g.pole((-1.0 + i * 0.5, 0.74, 1.07), (-1.0 + i * 0.5, 0.74, 1.85), 0.03, IRON, n=5, b=0)
        # the fence himself: a silhouette with two eyes in the dark
        g.ball(0.42, (0.25, 0.72, 1.5), col="#2a2220", n=9, m=5, s=(1, 0.3, 1.05), jit=0)
        g.box(1.1, 0.14, 0.5, (0.25, 0.72, 1.06), col="#2a2220", b=0.06, jit=0)
        # scale + coins + ledger on the counter
        g.cyl(0.16, 0.05, (-0.95, 0.0, 1.07), col=GOLD_D, n=8, b=0.012)
        g.pole((-0.95, 0, 1.1), (-0.95, 0, 1.55), 0.025, GOLD_D, n=5)
        g.pole((-1.3, 0, 1.52), (-0.6, 0, 1.52), 0.022, GOLD_D, n=5)
        for sx in (-1, 1):
            g.lathe([(0.0, 0.0), (0.14, 0.03), (0.17, 0.07)], (-0.95 + sx * 0.33, 0, 1.3 + sx * 0.03), col=GOLD, n=8, cap1=False)
            g.pole((-0.95 + sx * 0.33, 0, 1.3 + sx * 0.03), (-0.95 + sx * 0.33, 0, 1.52), 0.014, IRON, n=4, b=0)
        bunch(g, (-1.27, 0, 1.36), (0, 0, 60), 0.6, 3)
        for i in range(4):
            g.cyl(0.07, 0.025, (0.5 + (i % 2) * 0.03, -0.42 + i * 0.01, 1.07 + i * 0.024), col=GOLD, n=7, b=0.006, hl=1.2)
        g.box(0.5, 0.36, 0.05, (0.0, -0.1, 1.07), (0, 0, -12), col="#7a2d27", b=0.015)
        g.box(0.44, 0.3, 0.02, (0.0, -0.1, 1.12), (0, 0, -12), col=PAPER, b=0.0)
        # WE BUY board above: banana -> coin
        g.box(1.9, 0.07, 0.56, (0, 0.72, 2.78), col=CREAM, b=0.025, jit=0.02)
        m = FRONT(0, 0.683, 3.06)
        icon_banana(g, m @ T(-0.55, -0.2, 0), 0.44, BANANA_D)
        icon_arrow(g, m @ T(0, 0, 0), 0.4, "#2a2622")
        g.paint_poly(circle(0.17, 12, cx=0.56), m, GOLD_D)
        g.paint_text("$", 0.2, m @ T(0.56, -0.1, 0), CREAM, w=0.045)
    em = a.mesh("emissive")
    for sx in (-1, 1):
        em.ball(0.05, (x + 0.25 + sx * 0.14, y + 0.6, 1.58), col="#fff1a8", n=6, m=3, jit=0)
    bell = a.part("bell", (x + 0.95, y - 0.05, 1.07))
    bell.lathe([(0.2, 0.0), (0.21, 0.03), (0.17, 0.1), (0.08, 0.17), (0.0, 0.18)], (x + 0.95, y - 0.05, 1.07), col=GOLD, n=10, hl=1.2, jit=0)
    bell.cyl(0.03, 0.06, (x + 0.95, y - 0.05, 1.24), col=GOLD_D, n=6, b=0.008)
    a.point("counter", (x, y - 0.4, 1.1))
    return a


def workbench(name, seed, x=0.5, y=4.4):
    a = A(name, seed, footprint=1.4, blocksMove=True, glow=2.2)
    g, r = a.mesh(), a.rng
    with g.at(T(x, y, 0)):
        for i in range(3):
            g.box(2.7, 0.36, 0.1, (0, -0.37 + i * 0.37, 0.94), col=pick(r, WOOD), b=0.025, jit=0.06)
        for sx in (-1, 1):
            for sy in (-1, 1):
                g.box(0.16, 0.16, 0.95, (sx * 1.2, sy * 0.4, 0), col=pick(r, WOOD_D), b=0.03)
        g.box(2.5, 0.9, 0.07, (0, 0, 0.26), col=pick(r, WOOD_D), b=0.02)
        small_crate(g, (-0.7, 0.0, 0.33), 0.55, 6, WOOD_PALE, 0.4)
        g.box(0.6, 0.4, 0.3, (0.6, 0.0, 0.33), col=OLIVE, b=0.04)
        # vise
        g.box(0.36, 0.3, 0.14, (-0.85, -0.25, 1.04), col=STEEL_D, b=0.03)
        g.box(0.12, 0.34, 0.26, (-0.95, -0.25, 1.16), col=STEEL, b=0.03)
        g.box(0.12, 0.34, 0.26, (-0.72, -0.25, 1.16), col=STEEL, b=0.03)
        g.pole((-1.1, -0.25, 1.27), (-0.6, -0.25, 1.27), 0.028, STEEL_L, n=5)
        g.pole((-1.08, -0.38, 1.27), (-1.08, -0.12, 1.27), 0.022, STEEL_L, n=4)
        # work in progress: a gun-shaped lump, a mag, some rounds, an oil can
        g.emit(p_prism([(-0.3, 0.0), (0.3, 0.0), (0.3, 0.12), (-0.1, 0.12), (-0.12, 0.3), (-0.26, 0.3)], 0.07, 0.015), "#3d4146", T(0.15, -0.25, 1.05, 0, 0, 20), jit=0.02)
        g.box(0.1, 0.22, 0.05, (0.62, -0.3, 1.04), (0, 0, -30), col=STEEL_D, b=0.012)
        for i in range(4):
            g.cyl(0.03, 0.12, (0.42 + i * 0.08, 0.14, 1.04), col=GOLD, n=6, b=0.008, hl=1.2)
        g.lathe([(0.09, 0), (0.1, 0.14), (0.03, 0.2), (0.02, 0.32), (0.0, 0.32)], (1.1, 0.2, 1.04), col=RED, n=8)
        # pegboard + tools
        g.box(2.3, 0.07, 1.25, (-0.1, 0.442, 1.25), col="#b89a6a", b=0.02, jit=0.03)
        P = lambda px, pz, poly, col, rz=0, dy=0.0: g.emit(p_prism(poly, 0.06), col, T(px, 0.39 - dy, pz, 90, 0, 0) @ T(rz=rz), jit=0.03)
        P(-0.95, 1.9, [(-0.2, 0.08), (0.2, 0.08), (0.2, 0.3), (-0.2, 0.3)], STEEL)          # hammer
        P(-0.95, 1.6, [(-0.05, -0.3), (0.05, -0.3), (0.05, 0.4), (-0.05, 0.4)], WOOD_D[0], 0, 0.006)
        P(-0.45, 1.85, [(-0.05, -0.42), (0.05, -0.42), (0.05, 0.1), (0.16, 0.16), (0.16, 0.34), (0.06, 0.26), (-0.06, 0.26), (-0.16, 0.34), (-0.16, 0.16), (-0.05, 0.1)], STEEL_L)   # wrench
        P(0.25, 1.95, [(-0.5, -0.12), (0.4, -0.2), (0.4, 0.12), (-0.5, 0.06)], STEEL_L, -8)                                                       # saw blade
        P(0.75, 1.9, [(-0.1, -0.2), (0.14, -0.2), (0.14, 0.16), (-0.1, 0.16)], WOOD_D[1], -8, 0.006)
        P(0.25, 1.48, [(-0.04, -0.14), (0.04, -0.14), (0.04, 0.2), (0.0, 0.3), (-0.04, 0.2)], RED, 0, 0.012)                                              # screwdriver
        P(0.55, 1.48, [(-0.04, -0.14), (0.04, -0.14), (0.04, 0.2), (0.0, 0.3), (-0.04, 0.2)], BANANA, 0, 0.012)
        P(-0.1, 1.5, [(-0.14, -0.14), (0.14, -0.14), (0.14, 0.14), (-0.14, 0.14)], OLIVE)
        # desk lamp
        g.cyl(0.13, 0.04, (1.15, -0.2, 1.04), col=IRON, n=8, b=0.01)
        g.pole((1.15, -0.2, 1.06), (1.15, -0.05, 1.5), 0.022, IRON, n=5)
        g.pole((1.15, -0.05, 1.5), (0.85, -0.2, 1.7), 0.022, IRON, n=5)
        g.lathe([(0.17, 0.0), (0.05, 0.16), (0.0, 0.17)], (0.85, -0.2, 1.56), (0, 20, 0), col=OLIVE, n=8, cap0=True)
    em = a.mesh("emissive")
    em.ball(0.07, (x + 0.83, y - 0.2, 1.6), col=BULB, n=6, m=3, jit=0)
    a.point("light", (x + 0.8, y - 0.25, 1.5))
    return a


def pinboard(name, seed, x=4.6, y=4.81):
    a = A(name, seed, footprint=0.3)
    g, r = a.mesh(), a.rng
    with g.at(T(x, y, 0)):
        g.box(2.5, 0.08, 1.7, (0, 0, 1.15), col="#b8905e", b=0.02, jit=0.03)
        for (bx, bz, sx, sz, th) in [(0, 1.1, 2.72, 0.1, 0.13), (0, 2.8, 2.72, 0.1, 0.13), (-1.25, 1.17, 0.1, 1.66, 0.11), (1.25, 1.17, 0.1, 1.66, 0.11)]:
            g.box(sx, th, sz, (bx, -0.01, bz), col=pick(r, WOOD_D), b=0.025)
        notes = [(-0.8, 2.3, 0.5, 0.62, PAPER, -4), (-0.15, 2.4, 0.46, 0.5, "#ffe0a0", 5), (0.6, 2.25, 0.62, 0.8, PAPER, 2), (-0.75, 1.6, 0.56, 0.44, "#ffd0c0", 7), (0.0, 1.7, 0.44, 0.56, "#d8ecc8", -6), (0.75, 1.5, 0.4, 0.4, "#ffe0a0", -9)]
        for i, (nx, nz, w, h, col, rz) in enumerate(notes):
            m = FRONT(nx, -0.044 - 0.0025 * i, nz, rz)
            g.emit(p_box(w, h, 0.012, 0.0), col, m @ T(0, 0, -0.002), jit=0.02)
            for k in range(3 if i != 2 else 0):
                g.paint_line([(-w * 0.36, h * 0.2 - k * h * 0.2), (w * (0.36 - 0.12 * (k == 2)), h * 0.2 - k * h * 0.2)], 0.035, m, "#8f8676", lift=0.014)
            g.emit(p_sphere(0.04, 6, 2, z0=0, z1=1), RED if i % 2 else "#3f8f9a", m @ T(0, h * 0.42, 0.012), jit=0)
        # the big job: a wanted-style sheet with a silhouette and a banana price
        m = FRONT(0.6, -0.061, 2.25, 2)
        g.paint_poly(circle(0.13, 10, cy=0.14), m, "#4a3a2c", lift=0.006)
        g.paint_poly([(-0.2, -0.16), (0.2, -0.16), (0.14, 0.06), (-0.14, 0.06)], m, "#4a3a2c", lift=0.0085)
        # red string between three pins
        g.tube([(-0.75, -0.07, 1.8), (0.0, -0.075, 1.95), (0.6, -0.08, 2.58)], 0.014, RED, n=4)
    a.point("read", (x, y - 0.6, 1.6))
    return a


def mirror(name, seed, x=-6.6, y=-0.35):
    """character creator station: a standing mirror facing south, a stool, a hat stand. The glass is its own node."""
    a = A(name, seed, footprint=0.7, blocksMove=True)
    g, r = a.mesh(), a.rng
    with g.at(T(x, y, 0, 0, 0, -8)):
        g.box(1.5, 0.14, 2.5, (0, 0, 0.16), (-5, 0, 0), col=GOLD_D, b=0.05, jit=0.02)
        g.box(1.26, 0.1, 2.22, (0, -0.045, 0.3), (-5, 0, 0), col="#3a2a20", b=0.0, jit=0)
        for sx in (-1, 1):
            g.box(0.16, 0.9, 0.14, (sx * 0.62, 0.2, 0), col=WOOD_D[0], b=0.03)
            g.beam((sx * 0.62, 0.55, 0.08), (sx * 0.62, 0.12, 1.5), 0.08, 0.08, WOOD_D[1], b=0.02)
        g.ball(0.16, (0, 0.19, 2.7), col=GOLD, n=8, m=4, s=(1.6, 0.6, 1), hl=1.2)
    gl = a.part("glass", (x, y, 1.45))
    with gl.at(T(x, y, 0, 0, 0, -8)):
        gl.emit(p_box(1.22, 2.18, 0.03, 0.0), "#bfe3f5", T(0, 0.0, 1.42, 85, 0, 0), jit=0, grad=(1, 1))
        mm = T(0, 0.0, 1.42, 85, 0, 0) @ T(0, 0, 0.03)
        gl.paint_poly([(-0.5, 0.3), (-0.3, 0.3), (0.1, 0.95), (-0.1, 0.95)], mm, "#eefaff", lift=0.006)
        gl.paint_poly([(-0.2, 0.2), (-0.12, 0.2), (0.28, 0.85), (0.2, 0.85)], mm, "#eefaff", lift=0.006)
    # hat stand with a bowler and a tie
    hx, hy = x + 1.25, y + 0.25
    g.cyl(0.26, 0.06, (hx, hy, 0), col=WOOD_D[0], n=9, b=0.015)
    g.pole((hx, hy, 0.05), (hx, hy, 1.9), 0.04, WOOD_D[1], n=6)
    for k in range(3):
        ang = radians(k * 120 + 30)
        g.pole((hx, hy, 1.7), (hx + cos(ang) * 0.3, hy + sin(ang) * 0.3, 1.86), 0.025, WOOD_D[1], n=5)
    g.lathe([(0.34, 0.0), (0.35, 0.03), (0.22, 0.05), (0.23, 0.2), (0.14, 0.3), (0.0, 0.31)], (hx, hy, 1.9), col="#2c2a33", n=10, smooth=50)
    g.emit(p_lathe([(0.232, 0.06), (0.24, 0.12)], 10, cap0=False, cap1=False), "#ffb02a", T(hx, hy, 1.9), jit=0)
    g.box(0.1, 0.04, 0.62, (hx + 0.26, hy + 0.15, 1.25), (0, 0, 30), col=RED, b=0.012, taper=(0.6, 1))
    # stool
    sx_, sy_ = x - 0.1, y - 1.2
    g.cyl(0.3, 0.1, (sx_, sy_, 0.42), col=RED_D, n=10, b=0.03)
    for k in range(3):
        ang = radians(k * 120)
        g.pole((sx_ + cos(ang) * 0.22, sy_ + sin(ang) * 0.22, 0), (sx_ + cos(ang) * 0.14, sy_ + sin(ang) * 0.14, 0.43), 0.03, WOOD_D[0], n=5)
    a.point("stand", (x + 0.3, y - 1.25, 0))
    return a


def bunker_ladder(name, seed, x=0.0, y=-4.7):
    """ladder to the hatch: rises into a steel shaft collar with daylight in it"""
    a = A(name, seed, footprint=0.5, tall=True, glow=2.0)
    g, r = a.mesh(), a.rng
    ladder(g, (x, y + 0.35, 0), (x, y, 4.42), 0.7, 0.4, col=WOOD[1], r=0.055, rr=0.04)
    # the shaft: a cut section of steel pipe behind the ladder, open toward the camera, daylight inside
    g.emit(p_lathe([(0.78, 3.0), (0.86, 3.05), (0.86, 4.45), (0.78, 4.5), (0.72, 4.45), (0.72, 3.05)], 12, cap0=False, cap1=False, arc=180), STEEL_D, T(x, y + 0.1, 0), smooth=50)
    for k in range(5):
        ang = radians(18 + k * 36)
        g.emit(p_sphere(0.05, 5, 2, z0=0, z1=1), STEEL_L, along((x + cos(ang) * 0.86, y + 0.1 + sin(ang) * 0.86, 3.3), (x + cos(ang) * 3, y + 0.1 + sin(ang) * 3, 3.3)))
    # G1 council: the lit lining made the shaft read as a lamp shade. It is a dark hole now: near-black up the pipe,
    # a little cool sky caught on the lip, and the lamp point hangs BELOW the mouth so the light falls on the ladder,
    # the mat and the floor instead of filling the pipe.
    g.emit(p_lathe([(0.707, 4.4), (0.707, 3.1)], 12, cap0=False, cap1=False, arc=180), lambda c, tg: mix("#0e0c0b", "#2c3136", max(0.0, (3.55 - c.z) / 0.45) ** 1.5), T(x, y + 0.1, 0), jit=0, smooth=80)
    g.emit(p_lathe([(0.72, 4.43), (0.0, 4.43)], 12, cap0=False, cap1=False, arc=180), "#0b0a09", T(x, y + 0.1, 0), jit=0)      # the dark above
    g.box(1.0, 0.7, 0.04, (x, y + 0.9, 0.0), col="#6b7a4f", b=0.012)       # mat
    a.point("light", (x, y + 0.55, 2.55))
    a.point("climb", (x, y + 0.7, 0))
    return a


def cot(name, seed, x=-6.6, y=-3.8):
    a = A(name, seed, footprint=1.0, blocksMove=True)
    g, r = a.mesh(), a.rng
    with g.at(T(x, y, 0)):
        for sx in (-1, 1):
            for sy in (-1, 1):
                g.beam((sx * 0.86, sy * 0.36, 0), (sx * 0.72, -sy * 0.36, 0.5), 0.07, 0.07, WOOD_D[0], b=0.015)
        for sy in (-1, 1):
            g.pole((-1.0, sy * 0.42, 0.44), (1.0, sy * 0.42, 0.44), 0.045, WOOD[0], n=6)
        g.box(1.96, 0.8, 0.08, (0, 0, 0.41), col=KHAKI[0], b=0.03, jit=0.02)
        g.box(1.2, 0.86, 0.1, (0.36, 0, 0.47), col="#9b4a3a", b=0.04, jit=0.02)
        g.box(0.2, 0.88, 0.11, (-0.24, 0, 0.475), col=CREAM, b=0.04)
        g.box(0.46, 0.62, 0.16, (-0.72, 0, 0.47), col=CREAM, b=0.07, jit=0.02)
        # suitcase under it, slippers
        g.box(0.8, 0.5, 0.26, (0.2, -0.1, 0.02), (0, 0, 4), col="#8a5a34", b=0.05)
        for sx in (-1, 1):
            g.box(0.08, 0.52, 0.28, (0.2 + sx * 0.25, -0.1, 0.015), (0, 0, 4), col="#6a4226", b=0.015)
        for i in range(2):
            g.box(0.16, 0.34, 0.09, (-0.5 + i * 0.22, -0.72, 0), (0, 0, 8 - i * 14), col=RED_D, b=0.035)
    return a


def crate_desk(name, seed, x=-6.6, y=2.6):
    """the Businessman's desk: a door on two crates, ledger, abacus, banker's lamp, a tiny safe"""
    a = A(name, seed, footprint=1.2, blocksMove=True, glow=2.2)
    g, r = a.mesh(), a.rng
    with g.at(T(x, y, 0, 0, 0, 90)):
        small_crate(g, (-0.8, 0, 0), 0.8, 3, WOOD, 0.82)
        small_crate(g, (0.8, 0, 0), 0.8, -4, WOOD, 0.82)
        g.box(2.5, 1.05, 0.1, (0, 0, 0.83), col=pick(r, WOOD_PALE), b=0.03)
        g.box(0.62, 0.44, 0.06, (-0.2, -0.1, 0.93), (0, 0, 8), col="#3f6a4a", b=0.015)                 # ledger
        g.box(0.56, 0.38, 0.02, (-0.2, -0.1, 0.99), (0, 0, 8), col=PAPER, b=0.0)
        for k in range(3):
            g.paint_line([(-0.2, 0.1 - k * 0.09), (0.2, 0.1 - k * 0.09)], 0.03, TOP(-0.2, -0.1, 1.011) @ T(rz=8), "#8f8676")
        # abacus
        g.box(0.5, 0.06, 0.4, (0.6, 0.25, 0.93), col=WOOD_D[0], b=0.015)
        for k in range(3):
            for i in range(4):
                g.ball(0.045, (0.42 + i * 0.1 + (0.06 if (i + k) % 2 else 0), 0.21, 1.03 + k * 0.1), col=[RED, BANANA, "#3f8f9a"][k], n=6, m=3, jit=0)
        # banker's lamp
        g.cyl(0.12, 0.04, (-0.95, 0.25, 0.93), col=GOLD_D, n=8, b=0.01)
        g.pole((-0.95, 0.25, 0.95), (-0.95, 0.25, 1.3), 0.022, GOLD_D, n=5)
        g.box(0.5, 0.2, 0.13, (-0.95, 0.25, 1.24), col="#3f7a4a", b=0.055, jit=0.02)
        bunch(g, (0.75, -0.25, 1.0), (0, 0, -30), 0.75, 4)
        # chair: a small crate with a cushion
        small_crate(g, (0.0, -1.0, 0), 0.6, 10, WOOD_PALE, 0.5)
        g.box(0.56, 0.56, 0.1, (0, -1.0, 0.5), (0, 0, 10), col=RED_D, b=0.04)
        # safe beside the desk
        g.box(0.8, 0.7, 0.95, (1.75, 0.15, 0), col="#4d555b", b=0.05, grad=(0.86, 1.04))
        g.box(0.62, 0.06, 0.72, (1.75, -0.22, 0.12), col="#59666b", b=0.025)
        g.emit(p_lathe([(0.0, 0.0), (0.14, 0.0), (0.14, 0.05), (0.0, 0.07)], 10), GOLD, T(1.75, -0.25, 0.5, 90, 0, 0))
        g.box(0.06, 0.05, 0.22, (1.98, -0.27, 0.4), col=GOLD_D, b=0.015)
    em = a.mesh("emissive")
    em.ball(0.05, (x - 0.2, y - 0.95, 1.24), col=BULB, n=6, m=3, jit=0)
    a.point("light", (x - 0.2, y - 0.95, 1.2))
    return a


def trophy_shelf(name, seed, x=7.72, y=-1.4):
    a = A(name, seed, footprint=0.5, blocksMove=True)
    g, r = a.mesh(), a.rng
    for sy in (-1, 1):
        g.box(0.5, 0.1, 2.6, (x, y + sy * 1.2, 0), col=pick(r, WOOD_D), b=0.025)
    g.box(0.08, 2.4, 2.5, (x + 0.2, y, 0.05), col=pick(r, WOOD_D), b=0.0)
    for i, z in enumerate((0.3, 1.0, 1.7, 2.4)):
        g.box(0.52, 2.44, 0.08, (x, y, z), col=pick(r, WOOD), b=0.02, jit=0.05)
        if i < 3:
            for k in range(3):
                a.point(f"slot{i * 3 + k}", (x - 0.06, y + (k - 1) * 0.72, z + 0.1))
    g.box(0.56, 2.5, 0.12, (x, y, 2.55), col=GOLD_D, b=0.03)
    g.paint_poly([(-0.9, -0.018), (0.9, -0.018), (0.9, 0.018), (-0.9, 0.018)], LEFT(x - 0.28, y, 2.61), GOLD)
    return a


def string_lights(name, seed):
    """a cable of warm bulbs across the room (bulbs are one emissive node)"""
    a = A(name, seed, footprint=0.1, glow=2.4)
    g = a.mesh()
    y = 1.0
    g.box(0.24, 0.24, 3.7, (-8.0, y, 0.006), col=WOOD_D[1], b=0.04)
    pts = []
    for k in range(25):
        t = k / 24
        pts.append((-7.95 + 16.0 * t, y, 3.55 - 0.42 * 4 * t * (1 - t) - 0.05 * sin(t * 30)))
    g.tube(pts, 0.022, "#2a2622", n=4)
    bl = a.part("bulbs", (0, y, 3.2), "emissive")
    for i in range(8):
        t = (i + 0.5) / 8
        x, z = -7.95 + 15.9 * t, 3.55 - 0.42 * 4 * t * (1 - t)
        g.cyl(0.04, 0.08, (x, y, z - 0.1), col=IRON, n=5, b=0.008)
        bl.ball(0.095, (x, y, z - 0.19), col=BULB, n=7, m=4, s=(1, 1, 1.2), jit=0)
        a.point(f"light{i}", (x, y, z - 0.25))
    return a


# ------------------------------------------------------------------ the four upgrade fixtures
def fx_gun_rack(name, seed, x=2.6, y=4.85, z=1.75):
    """Extended Mag: a gun rack on the back wall"""
    a = A(name, seed, True, footprint=0.2)
    g, r = a.mesh(), a.rng
    g.box(1.9, 0.08, 1.25, (x, y - 0.02, z), col=pick(r, WOOD_D), b=0.025)
    for zz in (z + 0.18, z + 0.66, z + 1.08):
        for sx in (-1, 1):
            g.box(0.1, 0.24, 0.1, (x + sx * 0.55, y - 0.16, zz - 0.1), col=IRON, b=0.02)
    P = lambda px, pz, poly, col, rz=0, th=0.09, dy=0.0: g.emit(p_prism(poly, th, 0.02), col, T(px, y - 0.14 - dy, pz, 90, 0, 0) @ T(rz=rz), jit=0.03)
    gun = "#3d4146"
    # a long gun, a pistol, and the extended mag itself in banana yellow so it reads
    P(x, z + 1.12, [(-0.85, -0.09), (-0.2, -0.09), (-0.16, -0.2), (0.0, -0.2), (0.02, -0.09), (0.85, -0.06), (0.85, 0.05), (-0.3, 0.07), (-0.5, 0.0), (-0.85, 0.06)], gun)
    P(x - 0.62, z + 1.1, [(-0.24, -0.16), (0.02, -0.07), (0.02, 0.07), (-0.24, 0.1)], WOOD_D[0], 0, 0.1, 0.006)
    P(x - 0.05, z + 0.68, [(-0.45, -0.07), (0.3, -0.07), (0.3, 0.08), (-0.45, 0.08)], gun)
    P(x + 0.2, z + 0.5, [(-0.08, -0.2), (0.08, -0.2), (0.12, 0.12), (-0.06, 0.12)], WOOD_D[1], -12, 0.1, 0.006)
    P(x + 0.3, z + 0.36, [(-0.07, -0.26), (0.07, -0.26), (0.09, 0.18), (-0.06, 0.18)], BANANA, 6, 0.1)
    for i in range(5):
        g.cyl(0.035, 0.14, (x + 0.46 + i * 0.09, y - 0.2, z + 0.1), col=GOLD, n=6, b=0.008, hl=1.2)
    g.box(0.7, 0.26, 0.05, (x + 0.52, y - 0.16, z + 0.05), col=WOOD_D[1], b=0.012)
    return a


def fx_pack_hook(name, seed, x=-2.0, y=4.66, z=2.3):
    """Bigger Pack: a big backpack hanging on a hook"""
    a = A(name, seed, True, footprint=0.2)
    g, r = a.mesh(), a.rng
    g.box(0.5, 0.08, 0.5, (x, y + 0.17, z + 0.1), col=WOOD_D[0], b=0.02)
    g.tube([(x, y + 0.14, z + 0.45), (x, y - 0.06, z + 0.45), (x, y - 0.1, z + 0.32)], 0.035, IRON, n=5)
    pk = "#8a5a34"
    g.box(1.0, 0.5, 1.15, (x, y - 0.1, z - 1.05), col=pk, b=0.14, taper=(0.9, 0.86), grad=(0.86, 1.05), jit=0.02)
    g.box(1.04, 0.3, 0.42, (x, y - 0.26, z - 0.3), (-8, 0, 0), col=shade(pk, 1.12), b=0.08)                 # flap
    g.box(0.6, 0.2, 0.45, (x, y - 0.38, z - 0.95), col=shade(pk, 0.86), b=0.06)                              # front pocket
    for sx in (-1, 1):
        g.box(0.09, 0.05, 0.5, (x + sx * 0.28, y - 0.41, z - 0.42), (-6, 0, 0), col="#6a4226", b=0.015)
        g.box(0.12, 0.06, 0.09, (x + sx * 0.28, y - 0.45, z - 0.36), col=GOLD, b=0.02, hl=1.2)
        g.box(0.26, 0.3, 0.5, (x + sx * 0.6, y - 0.1, z - 0.95), col=shade(pk, 0.92), b=0.08)                 # side pockets
    g.pole((x - 0.5, y - 0.1, z + 0.2), (x + 0.5, y - 0.1, z + 0.2), 0.14, KHAKI[0], n=8, b=0.04)            # bedroll on top
    g.tube([(x - 0.2, y - 0.05, z + 0.02), (x, y - 0.1, z + 0.36), (x + 0.2, y - 0.05, z + 0.02)], 0.035, "#6a4226", n=5)
    banana(g, (x + 0.62, y - 0.18, z - 0.42), (0, -80, 0), 0.9)
    return a


def fx_breakfast(name, seed, x=4.8, y=-2.4):
    """Banana Breakfast (+HP): a table laid with bananas, toast and a coffee pot"""
    a = A(name, seed, True, footprint=0.9, blocksMove=True)
    g, r = a.mesh(), a.rng
    with g.at(T(x, y, 0, 0, 0, 12)):
        g.box(1.7, 1.1, 0.09, (0, 0, 0.78), col=pick(r, WOOD), b=0.03)
        for sx in (-1, 1):
            for sy in (-1, 1):
                g.box(0.11, 0.11, 0.8, (sx * 0.72, sy * 0.42, 0), col=pick(r, WOOD_D), b=0.025)
        g.box(1.2, 0.8, 0.02, (0, 0, 0.87), col=RED, b=0.0, jit=0)                                       # checked cloth
        for i in range(4):
            for k in range(3):
                if (i + k) % 2 == 0:
                    g.paint_poly([(-0.15, -0.13), (0.15, -0.13), (0.15, 0.13), (-0.15, 0.13)], TOP(-0.45 + i * 0.3, -0.27 + k * 0.27, 0.891), CREAM)
        g.lathe([(0.0, 0.0), (0.2, 0.01), (0.3, 0.05), (0.0, 0.03)], (-0.2, 0.05, 0.9), col=CREAM, n=10)
        bunch(g, (-0.2, 0.05, 1.0), (0, 0, 30), 0.95, 5)
        bunch(g, (-0.15, 0.1, 1.12), (0, 0, 150), 0.85, 4)
        g.lathe([(0.11, 0.0), (0.14, 0.04), (0.15, 0.2), (0.1, 0.3), (0.06, 0.34), (0.0, 0.34)], (0.5, 0.2, 0.9), col="#59666b", n=9, smooth=50)   # coffee pot
        g.tube([(0.64, 0.2, 1.14), (0.76, 0.2, 1.1), (0.74, 0.2, 0.98), (0.64, 0.2, 0.96)], 0.022, IRON, n=4)
        g.tube([(0.37, 0.2, 1.05), (0.28, 0.2, 1.16)], [0.035, 0.022], "#59666b", n=5)
        for (cx, cy) in ((0.42, -0.25), (-0.62, -0.28)):
            g.lathe([(0.06, 0.0), (0.08, 0.1), (0.065, 0.1), (0.05, 0.02)], (cx, cy, 0.9), col=CREAM, n=7, cap1=False)
        g.box(0.2, 0.2, 0.04, (0.1, -0.28, 0.9), (0, 0, 20), col="#d9a85a", b=0.012)
        g.box(0.2, 0.2, 0.04, (0.14, -0.26, 0.94), (0, 0, -15), col="#c9954a", b=0.012)
        for (sx_, sy_, rz) in ((0, -0.95, 5), (0, 0.95, -8)):
            g.cyl(0.26, 0.09, (sx_, sy_, 0.42), col=pick(r, WOOD_PALE), n=9, b=0.025)
            for k in range(3):
                ang = radians(k * 120 + rz)
                g.pole((sx_ + cos(ang) * 0.2, sy_ + sin(ang) * 0.2, 0), (sx_ + cos(ang) * 0.13, sy_ + sin(ang) * 0.13, 0.43), 0.03, WOOD_D[0], n=5)
    return a


def fx_neon(name, seed, x=-1.6, y=4.83, z=3.05):
    """BANANA BANK in neon tube on a dark board (reward for Sal's job)"""
    a = A(name, seed, True, footprint=0.2, glow=2.6)
    g = a.mesh()
    g.box(3.7, 0.08, 0.9, (x, y - 0.0, z - 0.45), col="#2a2630", b=0.03, jit=0)
    for sx in (-1, 1):
        g.box(0.1, 0.16, 0.1, (x + sx * 1.6, y + 0.04, z + 0.42), col=IRON, b=0.02)
    em = a.mesh("emissive")
    paths, w = text_paths("BANANA BANK", 0.36)
    k = 3.1 / w
    for p in paths:
        closed = len(p) > 2 and p[0] == p[-1]
        pts = [(x + px * k, y - 0.085, z - 0.2 + py * k) for px, py in (p[:-1] if closed else p)]
        em.emit(p_tube(pts, 0.03, 4, True, closed), NEON, None, jit=0)
    # a neon banana at each end
    for sx in (-1, 1):
        pts = [(x + sx * 1.68 + cos(radians(200 + i * 20)) * 0.17 * sx, y - 0.085, z - 0.02 + sin(radians(200 + i * 20)) * 0.26 + 0.1) for i in range(8)]
        em.emit(p_tube(pts, 0.028, 4), "#ff9a5a", None, jit=0)
    a.point("light", (x, y - 0.5, z))
    return a


def build():
    room("bunker_room", 111)
    sell_counter("bunker_counter", 112)
    workbench("bunker_workbench", 113)
    pinboard("bunker_pinboard", 114)
    mirror("bunker_mirror", 115)
    bunker_ladder("bunker_ladder", 116)
    cot("bunker_cot", 117)
    crate_desk("bunker_desk", 118)
    trophy_shelf("bunker_shelf", 119)
    string_lights("bunker_lights", 120)
    fx_gun_rack("bunker_fx_mag", 121)
    fx_pack_hook("bunker_fx_pack", 122)
    fx_breakfast("bunker_fx_heart", 123)
    fx_neon("bunker_fx_neon", 124)


REVIEW = dict(layout=False, dist=26, focus=(0, 0.8, 0.5), ground="#3a2e26")
