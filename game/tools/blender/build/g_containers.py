"""Typed loot containers (G1.5 row 27): weapon crate, food basket, ammo tin, scrap/parts bin, medical case.

Each type is told apart at the gameplay camera (pitch 55, about 40 u) by silhouette first and colour second, before it
is opened:  weapon = long low slate-blue case, yellow chevrons   food = round straw basket, leaf-thatch cone lid
            ammo = small upright olive tin on a pallet, wire handle   parts = teal steel bin, a rusty cog leaning on its corner
            medical = flat cream case, coral lid, leaf cross
Every one has a contact base (skids, feet or a foot ring), a hinged `lid` part (pivot on the back top edge, axis x:
closed 0, open = CRATE_LID_OPEN) with the type's pictogram on top, where the camera sees it, contents that only show
once the lid is up, and a `mark` point above the lid for the interaction marker. Budget 600-1,800 tris each.
"""
from kit import *

G = "containers"
SLATE, SLATE_D, SLATE_L = "#3b5273", "#2a3b55", "#4d6890"
STRAW = ["#d9b566", "#c9a252", "#e3c47a"]
STRAW_D = "#9a7636"
TEAL, TEAL_D = "#3f9a94", "#2c716e"
CASE, CASE_D = "#ece5d3", "#c9bfa6"
CORAL, CORAL_D = "#de4a36", "#b23426"
LEAFMARK = "#3f9a4a"
BRASS = "#d9a53a"
INSIDE = "#221a16"


def _hinges(g, xs, y, z, r=0.036, L=0.17, col=STEEL_D):
    for x in xs:
        g.cyl(r, L, (x - L / 2, y, z), (0, 90, 0), col=col, n=6, b=0.008)


def _shell(g, w, d, h, z0, t, col, **kw):
    """four wall panels: an open box you can look into once the lid is up (the dark interior block closes it)"""
    kw.setdefault("grad", (0.86, 1.04))
    kw.setdefault("jit", 0.03)
    for s in (-1, 1):
        g.box(w, t, h, (0, s * (d / 2 - t / 2), z0), col=col, b=0.025, **kw)
        g.box(t, d - 2 * t + 0.02, h, (s * (w / 2 - t / 2), 0, z0), col=col, b=0.025, **kw)


# ---------------------------------------------------------------- pictograms (local xy, about s wide)
def icon_pistol(g, M, s=1.0, col=BANANA):
    k = s          # three convex pieces (slide, raked grip, trigger guard) that only share edges
    g.paint_poly([(-0.5 * k, 0.11 * k), (0.5 * k, 0.11 * k), (0.5 * k, 0.32 * k), (-0.5 * k, 0.32 * k)], M, col)
    g.paint_poly([(-0.5 * k, -0.36 * k), (-0.27 * k, -0.36 * k), (-0.2 * k, 0.11 * k), (-0.43 * k, 0.11 * k)], M, col, lift=0.006)
    g.paint_poly([(-0.21 * k, 0.01 * k), (-0.02 * k, 0.01 * k), (-0.02 * k, 0.11 * k), (-0.195 * k, 0.11 * k)], M, col, lift=0.006)


def icon_rounds(g, M, s=1.0, col=BANANA, n=3):
    for i in range(n):
        x = (i - (n - 1) / 2) * 0.3 * s
        g.paint_poly([(x - 0.1 * s, -0.36 * s), (x + 0.1 * s, -0.36 * s), (x + 0.1 * s, 0.1 * s), (x, 0.38 * s), (x - 0.1 * s, 0.1 * s)], M, col)


def gear_outline(r0, r1, teeth=8):
    pts = []
    for i in range(teeth):
        a = 2 * pi * i / teeth
        da, db = 2 * pi / teeth * 0.2, 2 * pi / teeth * 0.3
        for rr, aa in ((r1, a - da), (r1, a + da), (r0, a + db), (r0, a + 2 * pi / teeth - db)):
            pts.append((rr * cos(aa), rr * sin(aa)))
    return pts


def icon_gear(g, M, s=1.0, col=CREAM, hole=SLATE_D):
    g.paint_poly(gear_outline(0.36 * s, 0.5 * s), M, col)
    g.paint_poly(circle(0.15 * s, 10), M, hole)


def icon_leafcross(g, M, s=1.0, col=LEAFMARK, disc=CASE):
    g.paint_poly(circle(0.5 * s, 14), M, disc)
    leaf = [(0, 0.05), (0.09, 0.15), (0.13, 0.27), (0.08, 0.37), (0, 0.44), (-0.08, 0.37), (-0.13, 0.27), (-0.09, 0.15)]
    for k in range(4):
        c, sn = cos(k * pi / 2), sin(k * pi / 2)
        g.paint_poly([((x * c - y * sn) * s, (x * sn + y * c) * s) for x, y in leaf], M, col)
    g.paint_poly(circle(0.07 * s, 8), M, col, lift=0.0135)      # above every leaf (auto lifts cycle through 5 steps)


def coconut(g, at, r=0.17, rz=0.0, eyes=True):
    g.ball(r, (at[0], at[1], at[2] + r * 0.9), (0, 0, rz), col="#6e4a2c", n=8, m=4, s=(1, 1, 0.9), jit=0.05, smooth=80)
    for k in range(3 if eyes else 0):   # the three eyes
        a = radians(rz + 120 * k)
        g.ball(r * 0.13, (at[0] + cos(a) * r * 0.24, at[1] + sin(a) * r * 0.24, at[2] + r * 1.72), col="#3a2616", n=5, m=2, jit=0)


def hand(g, at, rot=(0, 0, 0), s=1.0, k=4):
    """a hand of bananas, lighter than kit.bunch (4-sided, 6 rings): side by side, joined at the stalk"""
    L = 0.5 * s
    with g.at(T(*at, *rot)):
        for i in range(k):
            o = i - (k - 1) / 2
            pts, rs = [], []
            for j in range(6):
                t = j / 5
                an = (t - 0.5) * 1.9
                pts.append((sin(an) * L * 0.5, 0, (1 - cos(an)) * L * 0.5))
                rs.append(0.068 * s * (0.3 + 0.7 * sin(pi * (0.06 + 0.88 * t)) ** 0.6))
            g.emit(p_tube(pts, rs, 4), lambda c, tg: BANANA_D if abs(c.x) > L * 0.36 else BANANA, T(0.02 * abs(o) * s, o * 0.108 * s, 0.015 * abs(o) * s, o * 9, 0, o * 7), jit=0.04)
        g.box(0.13 * s, 0.11 * k * s * 0.8, 0.12 * s, (-0.2 * s, 0, 0.04 * s), (0, -35, 0), col="#6a5226", b=0.0)


# ---------------------------------------------------------------- weapon crate
def cont_weapon(name, seed, w=1.95, d=0.8, h=0.58):
    a = Asset(name, G, footprint=0.95, blocksMove=True, blocksShot=True, seed=seed)
    g = a.mesh()
    t, z0 = 0.07, 0.07
    for sx in (-1, 1):                                    # contact base: two skids
        g.box(0.2, d + 0.08, 0.1, (sx * w * 0.3, 0, 0), col=pick(a.rng, WOOD_D), b=0.025)
    g.box(w - 0.16, d - 0.16, 0.34, (0, 0, z0 + 0.03), col=INSIDE, b=0.0, jit=0)
    for i in range(5):                                    # packing straw and two wrapped guns
        g.box(a.rng.uniform(0.3, 0.6), 0.07, 0.045, (a.rng.uniform(-0.6, 0.6), a.rng.uniform(-0.2, 0.2), z0 + 0.37), (a.rng.uniform(-6, 6), a.rng.uniform(-6, 6), a.rng.uniform(0, 180)), col=pick(a.rng, STRAW), b=0.0)
    for x, rz in ((-0.42, 8), (0.42, 186)):
        with g.at(T(x, 0.02, z0 + 0.4, 0, 0, rz)):
            g.box(0.62, 0.13, 0.085, (0.04, 0.05, 0), col="#2c2a31", b=0.025, jit=0.02)
            g.box(0.17, 0.25, 0.07, (-0.2, -0.11, 0.006), (0, 0, 10), col="#6e4a2c", b=0.025, jit=0.02)
            g.box(0.12, 0.1, 0.075, (0.32, 0.05, 0.008), col=STEEL_L, b=0.02, jit=0.02)
    _shell(g, w, d, h - z0, z0, t, SLATE)
    g.box(w + 0.07, d + 0.07, 0.13, (0, 0, z0 - 0.02), col=SLATE_D, b=0.03)                  # plinth band
    for s in (-1, 1):                                     # top frame rails
        g.box(w + 0.07, 0.06, 0.12, (0, s * d / 2, h - 0.15), col=SLATE_D, b=0.025)
        g.box(0.055, d + 0.05, 0.11, (s * w / 2, 0, h - 0.145), col=SLATE_D, b=0.02)
    for sx in (-1, 1):
        for sy in (-1, 1):                                # steel corners
            g.box(0.17, 0.17, 0.2, (sx * (w / 2 - 0.03), sy * (d / 2 - 0.03), h - 0.21), col=STEEL_D, b=0.03)
        x = sx * (w / 2 + 0.03)                           # rope handles on the ends
        rope(g, [(x, -0.19, h * 0.62), (x + sx * 0.1, -0.1, h * 0.42), (x + sx * 0.1, 0.1, h * 0.42), (x, 0.19, h * 0.62)], 0.034, seg=2)
        for y in (-0.19, 0.19):
            g.box(0.05, 0.1, 0.1, (x - sx * 0.012, y, h * 0.56), col=STEEL_D, b=0.015)
    for F_, sy in ((FRONT, -1), (BACK, 1)):               # yellow hazard chevrons front and back
        m = F_(0, sy * (d / 2 + 0.001), h * 0.44)
        for i in range(5):
            x = -0.52 + i * 0.26
            g.paint_poly([(x - 0.1, -0.1), (x + 0.02, -0.1), (x + 0.12, 0.1), (x, 0.1)], m, BANANA)
    _hinges(g, (-w * 0.3, w * 0.3), d / 2 + 0.035, h - 0.035)
    lid = a.part("lid", (0, d / 2, h - 0.02))
    lid.box(w + 0.07, d + 0.07, 0.11, (0, 0, h - 0.02), col=SLATE, b=0.035, jit=0.03)
    lid.box(w - 0.26, d - 0.24, 0.035, (0, 0, h + 0.085), col=SLATE_L, b=0.015)
    for x in (-w * 0.32, w * 0.32):
        lid.box(0.14, 0.05, 0.2, (x, -d / 2 - 0.05, h - 0.1), col=STEEL_L, b=0.02)
    zt = h + 0.121
    icon_pistol(lid, TOP(-0.36, 0.01, zt), 0.56)
    for i in range(3):
        x = 0.16 + i * 0.2
        lid.paint_poly([(x - 0.1, -0.17), (x + 0.0, -0.17), (x + 0.13, 0.17), (x + 0.03, 0.17)], TOP(0.1, 0, zt), BANANA)
    a.point("mark", (0, 0, h + 0.5))
    return a


# ---------------------------------------------------------------- food basket
HUSK = ["#7d5433", "#6b4629", "#8a5f3a"]


def cont_food(name, seed, R=0.56, h=0.66):
    a = Asset(name, G, footprint=0.62, blocksMove=True, seed=seed)
    g = a.mesh()
    n = 16
    g.lathe([(R * 0.7, 0), (R * 0.8, 0.035), (R * 0.8, 0.085), (R * 0.72, 0.11)], col=STRAW_D, n=n, cap1=False, smooth=50)   # foot ring

    def weave(c, tg):
        seg = int((atan2(c.y, c.x) % (2 * pi)) / (2 * pi) * n)
        return STRAW[(seg + int(c.z / 0.105)) % 2 * 2] if tg != 2 else STRAW_D
    prof = [(R * 0.74, 0.07)] + [(R * (0.82 + 0.2 * sin(pi * (0.08 + 0.5 * i / 5))), 0.07 + (h - 0.07) * i / 5) for i in range(1, 6)]
    g.lathe(prof, col=weave, n=n, cap1=False, grad=(0.84, 1.05), smooth=40, jit=0.02)
    rim = [(cos(2 * pi * k / n) * R * 1.0, sin(2 * pi * k / n) * R * 1.0, h + 0.005) for k in range(n)]
    g.tube(rim, 0.05, STRAW_D, n=5, closed=True, jit=0.02)
    g.cyl(R * 0.95, 0.05, (0, 0, h - 0.13), col=INSIDE, n=n, b=0.0, jit=0)                   # what you see past the rim
    g.emit(p_lathe([(R * 1.0, 0.3), (R * 1.035, 0.33), (R * 1.035, 0.43), (R * 1.0, 0.46)], n, cap0=False, cap1=False), CREAM, None, jit=0.02)   # cloth band
    icon_banana(g, T(0, -R * 1.035 * cos(pi / n) - 0.001, 0.325, 90, 0, 0), 0.2, "#7a5a2a")
    for sx in (-1, 1):                                                                      # rope loop handles
        x = sx * R * 0.99
        rope(g, [(x, -0.16, h - 0.1), (x + sx * 0.13, -0.1, h - 0.22), (x + sx * 0.13, 0.1, h - 0.22), (x, 0.16, h - 0.1)], 0.036, seg=2)
    # contents: coconuts and bananas heaped up into the hollow of the lid
    coconut(g, (-0.2, 0.1, h - 0.12), 0.19, 20, eyes=False)
    coconut(g, (0.2, 0.16, h - 0.13), 0.17, 150, eyes=False)
    hand(g, (0.04, -0.2, h - 0.03), (8, -6, 28), 0.9, 3)
    g.box(0.34, 0.26, 0.05, (-0.02, 0.0, h - 0.09), (0, 0, 30), col=LEAF[0], b=0.0)
    coconut(g, (-R * 1.04, -R * 0.66, 0), 0.19, 70)       # beside it: a loose coconut
    _hinges(g, (0,), R * 1.0, h + 0.0, r=0.04, L=0.2, col=STRAW_D)
    # lid: a coconut-husk dome with a hand of bananas lashed on top. Dark against sand, yellow against grass. It is a
    # closed solid, so the heap inside stays hidden until it lifts
    lid = a.part("lid", (0, R * 1.0, h + 0.01))
    lp = [(R * 0.9, h - 0.005), (R * 1.03, h + 0.02), (R * 1.01, h + 0.07), (R * 0.74, h + 0.2), (R * 0.4, h + 0.285), (0.0, h + 0.31)]
    lid.lathe(lp, col=lambda c, tg: HUSK[(int((atan2(c.y, c.x) % (2 * pi)) / (2 * pi) * n) + (1 if c.z > h + 0.14 else 0)) % 2], n=n, grad=(0.9, 1.1), smooth=35, jit=0.03)
    lid.lathe([(R * 1.035, h + 0.012), (R * 1.065, h + 0.04), (R * 1.03, h + 0.075)], col=STRAW[2], n=n, cap0=False, cap1=False)
    hand(lid, (0.05, -0.02, h + 0.235), (0, -8, 200), 1.25, 4)
    rope(lid, [(-0.2, -0.16, h + 0.2), (-0.06, -0.02, h + 0.325), (0.02, 0.16, h + 0.22)], 0.03, seg=2)
    a.point("mark", (0, 0, h + 0.8))
    return a


# ---------------------------------------------------------------- ammo tin
def cont_ammo(name, seed, w=0.98, d=0.52, h=0.6):
    a = Asset(name, G, footprint=0.55, blocksMove=True, seed=seed)
    g = a.mesh()
    z0, t = 0.1, 0.055
    for sx in (-1, 0, 1):                                 # contact base: a short pallet
        g.box(0.13, d + 0.3, 0.075, (sx * (w / 2 + 0.02), 0, 0), col=pick(a.rng, WOOD_D), b=0.02)
    for i in range(4):
        y = (i - 1.5) * (d + 0.24) / 4
        plank(g, (-w / 2 - 0.13, y, 0.085), (w / 2 + 0.13, y, 0.085), 0.045, 0.17, pal=WOOD_PALE, roll=90, wob=0.004)
    g.box(w - 0.1, d - 0.1, 0.3, (0, 0, z0 + 0.03), col=INSIDE, b=0.0, jit=0)
    for row, y in enumerate((-0.085, 0.085)):             # two rows of rounds, tips up
        for i in range(7):
            x = -0.36 + i * 0.118 + (0.03 if row % 2 else 0)
            g.emit(p_lathe([(0.046, 0), (0.046, 0.085), (0.0, 0.15)], 6), BRASS, T(x, y, z0 + 0.3), jit=0.04, hl=1.2)
    _shell(g, w, d, h - z0 - 0.12, z0, t, OLIVE)
    for sy in (-1, 1):                                    # pressed panels and the yellow band
        g.box(w - 0.24, 0.03, h * 0.36, (0, sy * (d / 2 - 0.005), z0 + 0.07), col=shade(OLIVE, 1.12), b=0.012)
    g.box(w + 0.03, d + 0.03, 0.07, (0, 0, z0 - 0.012), col=shade(OLIVE, 0.78), b=0.02)
    for F_, sy in ((FRONT, -1), (BACK, 1)):
        m = F_(0, sy * (d / 2 + 0.011), z0 + 0.07 + h * 0.18)
        g.paint_poly([(-0.34, -0.09), (-0.06, -0.09), (-0.06, 0.09), (-0.34, 0.09)], m, BANANA)
        icon_rounds(g, m @ T(0.18, 0, 0), 0.22)
    _hinges(g, (-w * 0.28, w * 0.28), d / 2 + 0.03, h - 0.125, r=0.032, L=0.15)
    lid = a.part("lid", (0, d / 2, h - 0.12))
    lid.box(w + 0.05, d + 0.05, 0.125, (0, 0, h - 0.125), col=OLIVE, b=0.04, jit=0.02, grad=(0.92, 1.06))
    lid.box(w - 0.2, d - 0.16, 0.025, (0, 0, h - 0.008), col=shade(OLIVE, 1.12), b=0.01)
    lid.box(0.13, 0.05, 0.22, (0, -d / 2 - 0.045, h - 0.24), col=STEEL_L, b=0.02)           # front latch
    for sx in (-1, 1):                                    # wire carry handle
        lid.box(0.06, 0.07, 0.1, (sx * 0.2, 0, h + 0.005), col=STEEL_D, b=0.0)
    lid.beam((-0.25, 0, h + 0.115), (0.25, 0, h + 0.115), 0.065, 0.055, STEEL_L, b=0.02)
    zt = h + 0.018
    for sx in (-1, 1):                                    # wide yellow end stripes: the colour cue from above
        lid.paint_poly([(sx * 0.3 - 0.085, -0.17), (sx * 0.3 + 0.085, -0.17), (sx * 0.3 + 0.085, 0.17), (sx * 0.3 - 0.085, 0.17)], TOP(0, 0, zt), BANANA)
    a.point("mark", (0, 0, h + 0.55))
    return a


# ---------------------------------------------------------------- scrap / parts bin
def cont_parts(name, seed, w=1.16, d=0.9, h=0.74):
    a = Asset(name, G, footprint=0.8, blocksMove=True, blocksShot=True, seed=seed)
    g, r = a.mesh(), a.rng
    z0, t = 0.09, 0.06
    for sx in (-1, 1):                                    # contact base: four squat feet
        for sy in (-1, 1):
            g.cyl(0.11, 0.11, (sx * (w / 2 - 0.13), sy * (d / 2 - 0.13), 0), col=IRON, n=6, b=0.02)
    g.box(w - 0.12, d - 0.12, 0.42, (0, 0, z0 + 0.03), col=INSIDE, b=0.0, jit=0)
    # contents: a heap of cogs, a pipe and bolts
    zc = z0 + 0.45
    g.prism(gear_outline(0.17, 0.23, 8), 0.06, (-0.25, 0.08, zc), (8, 0, 20), col=RUST[2])
    g.prism(gear_outline(0.12, 0.165, 7), 0.055, (0.12, -0.14, zc + 0.01), (-6, 6, 50), col=STEEL_L)
    g.pole((0.05, 0.2, zc + 0.05), (0.42, 0.16, zc + 0.07), 0.05, STEEL, n=5, b=0.0)
    for i in range(3):
        g.cyl(0.045, 0.05, (r.uniform(-0.38, 0.38), r.uniform(-0.28, 0.28), zc - 0.005), (r.uniform(-20, 20), r.uniform(-20, 20), 0), col=pick(r, [STEEL_D, RUST[0], BRASS]), n=5, b=0.0)
    _shell(g, w, d, h - z0 - 0.02, z0, t, TEAL)
    g.box(w + 0.04, d + 0.04, 0.09, (0, 0, z0 - 0.015), col=TEAL_D, b=0.025)
    for s in (-1, 1):                                     # top rim band + vertical ribs
        g.box(w + 0.06, 0.06, 0.1, (0, s * d / 2, h - 0.14), col=STEEL_D, b=0.025)
        g.box(0.055, d + 0.04, 0.095, (s * w / 2, 0, h - 0.137), col=STEEL_D, b=0.02)
        for x in (-w * 0.25, w * 0.25):
            g.box(0.08, 0.035, h - z0 - 0.2, (x, s * (d / 2 + 0.003), z0 + 0.05), col=TEAL_D, b=0.0)
    m = FRONT(0, -d / 2 - 0.001, z0 + 0.3)
    icon_gear(g, m @ T(0.0, 0, 0), 0.34, CREAM, TEAL_D)
    for (x, y, s) in ((0.44, -0.12, 1.0), (-0.4, 0.12, 0.8)):   # rust blooms on the paint
        g.paint_poly([(x - 0.07 * s, y - 0.09 * s), (x + 0.05 * s, y - 0.12 * s), (x + 0.09 * s, y + 0.01 * s), (x + 0.01 * s, y + 0.1 * s), (x - 0.08 * s, y + 0.05 * s)], m, RUST[1])
    # leaning on the front corner: a big rusty cog, the silhouette cue (it stands clear of the lid's swing)
    with g.at(T(-w / 2 + 0.2, -d / 2 - 0.4, 0.0, -30, 0, -22) @ T(0, 0, 0.43, 90, 0, 0)):
        g.prism(gear_outline(0.29, 0.39, 9), 0.11, (0, 0, -0.055), col=RUST[0], b=0.02, jit=0.03, hl=1.15)
        g.cyl(0.14, 0.17, (0, 0, -0.085), col=RUST[3], n=8, b=0.02)
        g.paint_poly(circle(0.06, 8), T(0, 0, 0.086), IRON)
    g.pole((w / 2 - 0.6, -d / 2 - 0.085, 0.07), (w / 2 + 0.06, -d / 2 - 0.1, 0.07), 0.07, RUST[2], n=8, cap=IRON)
    _hinges(g, (-w * 0.3, w * 0.3), d / 2 + 0.035, h - 0.03)
    lid = a.part("lid", (0, d / 2, h - 0.02))
    lid.box(w + 0.07, d + 0.07, 0.09, (0, 0, h - 0.02), col=TEAL, b=0.03, jit=0.03)
    lid.box(w - 0.16, d - 0.16, 0.03, (0, 0, h + 0.066), col=STEEL, b=0.012, jit=0.02)       # checker-plate inset
    for sx in (-1, 1):
        lid.box(0.07, 0.07, 0.08, (sx * 0.2, -d / 2 + 0.16, h + 0.09), col=STEEL_D, b=0.0)
    lid.beam((-0.26, -d / 2 + 0.16, h + 0.185), (0.26, -d / 2 + 0.16, h + 0.185), 0.065, 0.055, STEEL_L, b=0.02)
    lid.box(0.16, 0.05, 0.18, (0, -d / 2 - 0.05, h - 0.1), col=STEEL_L, b=0.02)
    icon_gear(lid, TOP(0, 0.1, h + 0.097), 0.5, TEAL, STEEL_D)
    a.point("mark", (0, 0, h + 0.6))
    return a


# ---------------------------------------------------------------- medical case
def cont_medical(name, seed, w=1.0, d=0.66, h=0.52):
    a = Asset(name, G, footprint=0.62, blocksMove=True, seed=seed)
    g = a.mesh()
    z0, t, hb = 0.07, 0.06, 0.3                           # hb = height of the lower shell
    for sx in (-1, 1):                                    # contact base: four rubber feet under a plinth band
        for sy in (-1, 1):
            g.cyl(0.085, 0.09, (sx * (w / 2 - 0.14), sy * (d / 2 - 0.12), 0), col="#3a3438", n=6, b=0.02)
    g.box(w - 0.12, d - 0.12, hb - 0.06, (0, 0, z0 + 0.03), col=INSIDE, b=0.0, jit=0)
    zc = z0 + hb - 0.035
    for x, y, rz in ((-0.3, 0.1, 0), (-0.3, -0.12, 0), (-0.08, -0.02, 90)):                  # bandage rolls
        g.cyl(0.075, 0.16, (x, y, zc + 0.075), (90, 0, rz), col="#f4efe2", n=8, b=0.02, cap="#d9d2c0")
    for x, y, c in ((0.18, 0.1, "#8a5a2a"), (0.33, -0.08, LEAFMARK)):                        # two bottles
        g.cyl(0.07, 0.105, (x, y, zc), col=c, n=8, b=0.02)
        g.cyl(0.045, 0.045, (x, y, zc + 0.095), col=CASE, n=6, b=0.01)
    g.box(0.24, 0.17, 0.05, (0.12, -0.14, zc), (0, 0, 14), col=CORAL, b=0.015)
    _shell(g, w, d, hb, z0, t, CASE, grad=(0.9, 1.03))
    g.box(w + 0.03, d + 0.03, 0.065, (0, 0, z0 - 0.012), col=CASE_D, b=0.02)
    g.box(w + 0.025, 0.05, 0.05, (0, -d / 2 + 0.012, z0 + hb - 0.06), col=STEEL_L, b=0.015)   # seam band, front
    m = FRONT(0, -d / 2 - 0.001, z0 + hb * 0.42)
    for sx in (-1, 1):
        g.paint_poly([(sx * 0.3 - 0.11, -0.035), (sx * 0.3 + 0.11, -0.035), (sx * 0.3 + 0.11, 0.035), (sx * 0.3 - 0.11, 0.035)], m, CORAL)
    _hinges(g, (-w * 0.3, w * 0.3), d / 2 + 0.03, z0 + hb - 0.01, r=0.032, L=0.15, col=STEEL_L)
    lid = a.part("lid", (0, d / 2, z0 + hb - 0.01))
    zl = z0 + hb - 0.012
    lid.box(w + 0.045, d + 0.045, h - zl, (0, 0, zl), col=CORAL, b=0.06, jit=0.02, grad=(0.9, 1.05))
    lid.box(w + 0.055, d + 0.055, 0.05, (0, 0, zl + 0.005), col=CORAL_D, b=0.015)
    for x in (-w * 0.3, w * 0.3):                                                            # latches
        lid.box(0.12, 0.045, 0.15, (x, -d / 2 - 0.035, zl - 0.07), col=STEEL_L, b=0.018)
    for sx in (-1, 1):                                                                       # carry handle on the front edge
        lid.box(0.055, 0.09, 0.06, (sx * 0.13, -d / 2 - 0.06, zl + 0.065), col=STEEL_D, b=0.0)
    lid.beam((-0.17, -d / 2 - 0.11, zl + 0.095), (0.17, -d / 2 - 0.11, zl + 0.095), 0.055, 0.05, "#3a3438", b=0.018)
    icon_leafcross(lid, TOP(0, 0.01, h + 0.001), 0.5)
    a.point("mark", (0, 0, h + 0.55))
    return a

# ================================================================ G2 containers: lunchbox, toolbox, wall medicine cabinet, safe, junk heap, supply sack
# Same contract as the five above: a `lid` part whose origin is its hinge (axis x, closed 0, open = CRATE_LID_OPEN), a
# `mark` point, origin on the ground, front at -y. Under 1,200 tris each. Told apart from above by silhouette first:
#   lunchbox = small yellow tin under a barrel-vault lid   toolbox = long orange box, gabled lid, tube handle
#   medcabinet = cream box high on a wall, coral lift-up door with the leaf cross   safe = squat iron cube, brass dial on top
#   trash = a rubbish mound with a tyre and a dented bin lid   sack = a fat tied canvas sack with rust stripes
LUNCH, LUNCH_D = "#f0c33a", "#b98a26"
TOOL, TOOL_D = "#e5782a", "#b0551d"
SAFE, SAFE_D, SAFE_L = "#4b5560", "#333a43", "#6f7d89"
RUBBER = "#3a3438"
DIRT = ["#5d4c3e", "#66543f", "#514236"]


def _vault(g, x0, x1, y, z, ry, rz, col, n=8):
    """a barrel vault along x (closed solid): half-ellipse section ry deep, rz high, sitting on z"""
    xs = [x0, x0 * 0.36, x1 * 0.36, x1]
    rings = [[(x, y + ry * cos(pi * k / n), z + rz * sin(pi * k / n)) for k in range(n + 1)] for x in xs]
    g.loft(rings, col=col, smooth=50, jit=0.02)


def icon_wrench(g, M, s=1.0, col=CREAM, hole=TOOL_D):
    """painted spanner lying along local x: an open jaw at +x, a ring at -x"""
    g.paint_poly([(-0.3 * s, -0.055 * s), (0.3 * s, -0.055 * s), (0.3 * s, 0.055 * s), (-0.3 * s, 0.055 * s)], M, col)
    g.paint_poly([(0.24 * s, -0.15 * s), (0.5 * s, -0.15 * s), (0.5 * s, -0.06 * s), (0.37 * s, -0.06 * s), (0.37 * s, 0.06 * s), (0.5 * s, 0.06 * s), (0.5 * s, 0.15 * s), (0.24 * s, 0.15 * s)], M, col)
    g.paint_poly(circle(0.15 * s, 10, cx=-0.38 * s), M, col)
    g.paint_poly(circle(0.07 * s, 8, cx=-0.38 * s), M, hole)


# ---------------------------------------------------------------- lunchbox
def cont_lunchbox(name, seed, w=0.8, d=0.48, hb=0.33):
    a = Asset(name, G, footprint=0.45, blocksMove=True, seed=seed)
    g = a.mesh()
    z0, t = 0.05, 0.045
    zt = z0 + hb                                          # top of the tin
    for sx in (-1, 1):                                    # contact base: two rubber skids
        g.box(0.12, d - 0.04, 0.07, (sx * (w / 2 - 0.15), 0, 0), col=RUBBER, b=0.02)
    g.box(w - 0.08, d - 0.08, hb - 0.1, (0, 0, z0 + 0.02), col=INSIDE, b=0.0, jit=0)
    zc = z0 + hb - 0.08                                   # lunch: a sandwich, a banana, an apple, a flask
    g.prism([(-0.15, -0.12), (0.15, -0.12), (-0.15, 0.14)], 0.085, (-0.2, -0.02, zc), (0, 0, 8), col={0: "#b98a52", 2: "#ecdcae"})
    g.box(0.2, 0.2, 0.02, (-0.22, -0.03, zc + 0.03), (0, 0, 30), col=LEAF[1], b=0.0)
    banana(g, (0.02, 0.1, zc + 0.02), (0, 0, 20), 0.62)
    g.ball(0.075, (0.08, -0.1, zc + 0.07), col=RED, n=6, m=4, jit=0.03)
    g.cyl(0.062, 0.2, (0.17, 0.02, zc + 0.062), (90, 0, 12), col=TEAL, n=6, b=0.012)
    g.cyl(0.05, 0.05, (0.212, -0.176, zc + 0.062), (90, 0, 12), col=STEEL_L, n=6, b=0.01)
    _shell(g, w, d, hb, z0, t, LUNCH, grad=(0.86, 1.04))
    g.box(w + 0.03, d + 0.03, 0.06, (0, 0, z0 - 0.012), col=LUNCH_D, b=0.02)
    m = FRONT(0, -d / 2 - 0.001, z0 + hb * 0.5)           # cream label, banana sticker
    g.paint_poly([(-0.2, -0.1), (0.2, -0.1), (0.2, 0.1), (-0.2, 0.1)], m, CREAM)
    icon_banana(g, m @ T(0, -0.055, 0), 0.2, "#7a5a2a")
    _hinges(g, (-w * 0.27, w * 0.27), d / 2 + 0.026, zt - 0.005, r=0.028, L=0.13, col=STEEL_L)
    lid = a.part("lid", (0, d / 2, zt))
    lid.box(w + 0.04, d + 0.04, 0.06, (0, 0, zt - 0.012), col=LUNCH_D, b=0.02, jit=0.02)   # rolled rim
    _vault(lid, -w / 2 - 0.004, w / 2 + 0.004, 0, zt + 0.04, d / 2 + 0.004, 0.2, lambda c, tg: CREAM if abs(c.x) < w * 0.17 else LUNCH)
    for sx in (-1, 1):                                    # carry handle on the crown
        lid.box(0.05, 0.07, 0.085, (sx * 0.17, 0, zt + 0.225), col=STEEL_D, b=0.0)
    lid.beam((-0.21, 0, zt + 0.335), (0.21, 0, zt + 0.335), 0.06, 0.05, RUBBER, b=0.018)
    for sx in (-1, 1):                                    # front latches
        lid.box(0.1, 0.04, 0.16, (sx * 0.24, -d / 2 - 0.036, zt - 0.11), col=STEEL_L, b=0.015)
    a.point("mark", (0, 0, zt + 0.85))
    return a


# ---------------------------------------------------------------- toolbox
def cont_toolbox(name, seed, w=1.2, d=0.54, hb=0.36):
    a = Asset(name, G, footprint=0.62, blocksMove=True, seed=seed)
    g = a.mesh()
    z0, t = 0.05, 0.05
    zt = z0 + hb
    for sx in (-1, 1):                                    # contact base: two iron skids
        g.box(0.14, d + 0.03, 0.07, (sx * (w / 2 - 0.22), 0, 0), col=IRON, b=0.02)
    g.box(w - 0.09, d - 0.09, hb - 0.12, (0, 0, z0 + 0.02), col=INSIDE, b=0.0, jit=0)
    zc = z0 + hb - 0.1                                    # the top tray and its tools
    g.box(w - 0.11, d - 0.11, 0.025, (0, 0, zc - 0.02), col=STEEL_D, b=0.0, jit=0.02)
    with g.at(T(-0.24, 0.08, zc + 0.004, 0, 0, -8)):      # spanner
        g.box(0.44, 0.05, 0.03, (0, 0, 0), col=STEEL_L, b=0.0)
        g.prism([(0.0, -0.075), (0.13, -0.075), (0.13, -0.03), (0.06, -0.03), (0.06, 0.03), (0.13, 0.03), (0.13, 0.075), (0.0, 0.075)], 0.036, (0.2, 0, -0.003), col=STEEL_L)
        g.cyl(0.07, 0.04, (-0.24, 0, -0.005), col=STEEL_L, n=8, b=0.0)
    with g.at(T(0.2, 0.07, zc + 0.004, 0, 0, 14)):        # hammer
        g.pole((-0.2, 0, 0.03), (0.2, 0, 0.03), 0.028, pick(a.rng, WOOD), n=5, b=0.0)
        g.box(0.085, 0.22, 0.085, (0.2, 0, -0.012), col=IRON, b=0.02)
    with g.at(T(0.0, -0.12, zc + 0.004, 0, 0, 3)):        # screwdriver
        g.pole((-0.3, 0, 0.03), (-0.1, 0, 0.03), 0.036, BANANA, n=6, b=0.01)
        g.pole((-0.1, 0, 0.03), (0.22, 0, 0.03), 0.014, STEEL_L, n=4, b=0.0)
    g.box(0.16, 0.12, 0.07, (0.4, -0.11, zc), (0, 0, -10), col=RUST[1], b=0.015)   # a tin of nails
    _shell(g, w, d, hb, z0, t, TOOL, grad=(0.86, 1.04))
    g.box(w + 0.03, d + 0.03, 0.07, (0, 0, z0 - 0.012), col=TOOL_D, b=0.02)
    for sx in (-1, 1):                                    # iron corner straps and end handles
        for sy in (-1, 1):
            g.box(0.1, 0.1, hb - 0.05, (sx * (w / 2 - 0.022), sy * (d / 2 - 0.022), z0 + 0.03), col=IRON, b=0.025)
        g.box(0.04, 0.22, 0.05, (sx * (w / 2 + 0.02), 0, z0 + hb * 0.55), col=STEEL_L, b=0.012)
    m = FRONT(0, -d / 2 - 0.001, z0 + hb * 0.5)
    icon_wrench(g, m, 0.46, CREAM, TOOL_D)
    _hinges(g, (-w * 0.3, w * 0.3), d / 2 + 0.03, zt - 0.005, r=0.032, L=0.16)
    lid = a.part("lid", (0, d / 2, zt))
    hy, e, ridge, zr = d / 2 + 0.025, 0.07, 0.11, 0.21    # gabled lid: eave height, half ridge width, ridge height
    lid.prism([(-hy, 0), (hy, 0), (hy, e), (ridge, zr), (-ridge, zr), (-hy, e)], w + 0.05, (-(w + 0.05) / 2, 0, zt - 0.006), (90, 0, 90), col=TOOL, b=0.022, jit=0.02, grad=(0.92, 1.06))
    sl = degrees(atan2(zr - e, hy - ridge))               # the front slope carries the pictogram, facing the camera
    icon_wrench(lid, T(0, -(hy + ridge) / 2, zt - 0.006 + (e + zr) / 2, sl, 0, 0), 0.6, CREAM, TOOL_D)
    for sx in (-1, 1):                                    # tube handle on the ridge
        lid.box(0.06, 0.09, 0.11, (sx * 0.34, 0, zt + zr - 0.02), col=STEEL_D, b=0.0)
    lid.pole((-0.42, 0, zt + zr + 0.1), (0.42, 0, zt + zr + 0.1), 0.036, STEEL_L, n=6)
    for sx in (-1, 1):                                    # latches
        lid.box(0.11, 0.045, 0.17, (sx * 0.34, -d / 2 - 0.042, zt - 0.1), col=STEEL_L, b=0.018)
    a.point("mark", (0, 0, zt + zr + 0.6))
    return a


# ---------------------------------------------------------------- wall medicine cabinet
def cont_medcabinet(name, seed, w=0.86, d=0.3, h=0.74, zm=0.82):
    """Wall-mounted: authored against the wall plane y = 0 (the origin is on that plane, at the foot of the wall), the
    box hangs zm above the ground and stands d + 0.05 proud. The door is the `lid`: hinged along its top edge, so the
    standard open (rotation.x 0 -> CRATE_LID_OPEN) lifts it up and out like a hatch."""
    a = Asset(name, G, footprint=0.3, blocksMove=False, seed=seed, ground=False, wall=0.0, ao_dist=0.9)
    a.meta["wallMount"], a.meta["mountZ"] = True, zm
    g = a.mesh()
    t, yb = 0.045, -0.05                                  # wall thickness; yb = front of the backing board
    yf = yb - d                                           # front rim of the box
    g.box(w + 0.22, 0.05, h + 0.24, (0, yb / 2, zm - 0.12), col=pick(a.rng, WOOD_D), b=0.02, jit=0.04)   # backing board
    for sx in (-1, 1):                                    # two bolts hold the board to the wall
        for sz in (0, 1):
            g.cyl(0.03, 0.03, (sx * (w / 2 + 0.065), yb + 0.01, zm - 0.07 + sz * (h + 0.14)), (90, 0, 0), col=STEEL_L, n=6, b=0.008)
    g.box(w - 2 * t + 0.02, t, h - 2 * t + 0.02, (0, yb - t / 2, zm + t - 0.01), col=CASE_D, b=0.0, jit=0)   # back panel
    for sx in (-1, 1):
        g.box(t, d, h, (sx * (w / 2 - t / 2), yb - d / 2, zm), col=CASE, b=0.02, grad=(0.9, 1.03))
    for z in (zm, zm + h - t):
        g.box(w - 2 * t + 0.02, d, t, (0, yb - d / 2, z), col=CASE, b=0.02)
    g.box(w - 2 * t + 0.006, d - 0.06 - t + 0.01, 0.03, (0, yb - t + 0.01 - (d - 0.06 - t + 0.01) / 2, zm + h * 0.47), col=CASE_D, b=0.0)   # shelf
    z1, z2 = zm + t, zm + h * 0.47 + 0.03                 # the two shelves' floors
    yc = yb - d * 0.52
    for x, c in ((-0.27, "#8a5a2a"), (-0.1, LEAFMARK)):   # bottom shelf: two bottles, two bandage rolls
        g.cyl(0.065, 0.16, (x, yc, z1), col=c, n=6, b=0.02)
        g.cyl(0.04, 0.05, (x, yc, z1 + 0.15), col=CASE, n=6, b=0.01)
    for x in (0.1, 0.26):
        g.cyl(0.07, 0.15, (x, yc + 0.075, z1 + 0.07), (90, 0, 0), col="#f4efe2", n=8, b=0.02, cap="#d9d2c0")
    g.box(0.3, 0.16, 0.14, (-0.17, yc, z2), col=CORAL, b=0.02)                                 # top shelf: a first-aid pack, a jar
    g.paint_poly([(-0.035, -0.012), (0.035, -0.012), (0.035, 0.012), (-0.035, 0.012)], FRONT(-0.17, yc - 0.081, z2 + 0.07), CASE)
    g.paint_poly([(-0.012, -0.035), (0.012, -0.035), (0.012, 0.035), (-0.012, 0.035)], FRONT(-0.17, yc - 0.081, z2 + 0.07), CASE)
    g.cyl(0.075, 0.17, (0.17, yc, z2), col="#f4efe2", n=6, b=0.02)
    g.cyl(0.08, 0.04, (0.17, yc, z2 + 0.16), col=CORAL_D, n=6, b=0.012)
    g.paint_poly([(-w / 2 + 0.06, -d / 2 + 0.05), (w / 2 - 0.06, -d / 2 + 0.05), (w / 2 - 0.06, d / 2 - 0.05), (-w / 2 + 0.06, d / 2 - 0.05)], TOP(0, yb - d / 2, zm + h), CORAL)   # the colour cue from above
    _hinges(g, (-w * 0.3, w * 0.3), yf + 0.005, zm + h + 0.012, r=0.028, L=0.14, col=STEEL_L)
    lid = a.part("lid", (0, yf, zm + h))
    lid.box(w + 0.03, 0.05, h + 0.02, (0, yf - 0.025, zm - 0.01), col=CORAL, b=0.02, jit=0.02, grad=(0.92, 1.05))
    mf = FRONT(0, yf - 0.051, zm + h * 0.5)
    lid.paint_line([(-w / 2 + 0.07, -h / 2 + 0.06), (w / 2 - 0.07, -h / 2 + 0.06), (w / 2 - 0.07, h / 2 - 0.06), (-w / 2 + 0.07, h / 2 - 0.06)], 0.03, mf, CASE, closed=True)
    icon_leafcross(lid, mf, 0.44)
    lid.box(0.26, 0.05, 0.045, (0, yf - 0.085, zm + 0.035), col=STEEL_L, b=0.015)               # pull handle on the bottom edge
    for sx in (-1, 1):
        lid.box(0.035, 0.05, 0.03, (sx * 0.1, yf - 0.06, zm + 0.0425), col=STEEL_D, b=0.0)
    a.point("mark", (0, yb - d / 2, zm + h + 0.55))
    return a


# ---------------------------------------------------------------- safe
def cont_safe(name, seed, w=0.92, d=0.86, h=0.8):
    """A squat floor safe. The small dial door is on top, where the camera sees it, and hinges at its back edge."""
    a = Asset(name, G, footprint=0.7, blocksMove=True, blocksShot=True, seed=seed)
    g = a.mesh()
    z0, t = 0.08, 0.12
    ow, od, tf = 0.5, 0.46, 0.09                          # door opening, top plate thickness
    for sx in (-1, 1):                                    # contact base: four squat feet
        for sy in (-1, 1):
            g.cyl(0.11, 0.1, (sx * (w / 2 - 0.15), sy * (d / 2 - 0.15), 0), col=IRON, n=6, b=0.0)
    g.box(w - 0.2, d - 0.2, h - z0 - 0.24, (0, 0, z0 + 0.04), col=INSIDE, b=0.0, jit=0)
    zc = h - 0.2                                          # the takings: gold bars and a wad of notes
    for x, y, rz, dz in ((-0.1, 0.07, 6, 0), (-0.08, -0.09, -4, 0), (-0.09, 0.0, 14, 0.07)):
        g.box(0.27, 0.13, 0.075, (x, y, zc + dz), (0, 0, rz), col=GOLD, b=0.0, taper=(0.86, 0.72), jit=0.05, grad=(0.8, 1.12))
    g.box(0.15, 0.26, 0.08, (0.15, 0.0, zc), (0, 0, -8), col="#6f9f58", b=0.0)
    g.box(0.156, 0.07, 0.084, (0.15, 0.0, zc - 0.001), (0, 0, -8), col=CREAM, b=0.0)
    _shell(g, w, d, h - z0 - tf + 0.02, z0, t, SAFE, grad=(0.8, 1.05))
    g.box(w + 0.05, d + 0.05, 0.13, (0, 0, z0 - 0.02), col=SAFE_D, b=0.035)                     # plinth band
    for sy in (-1, 1):                                    # top plate: four slabs round the opening
        g.box(w + 0.03, (d - od) / 2 + 0.025, tf, (0, sy * (od / 2 + (d - od) / 4 + 0.0025), h - tf), col=SAFE, b=0.03, jit=0.02)
    for sx in (-1, 1):
        g.box((w - ow) / 2 + 0.015, od + 0.03, tf, (sx * (ow / 2 + (w - ow) / 4 + 0.0075), 0, h - tf), col=SAFE, b=0.03, jit=0.02)
    for sx in (-1, 1):                                    # riveted corner straps, front and back
        for sy in (-1, 1):
            g.box(0.13, 0.03, h - z0 - 0.16, (sx * (w / 2 - 0.1), sy * (d / 2 + 0.006), z0 + 0.09), col=SAFE_D, b=0.0)
        rivets(g, [(sx * (w / 2 - 0.1), -d / 2 - 0.036, z0 + 0.17), (sx * (w / 2 - 0.1), -d / 2 - 0.036, h - 0.17)], 0.034, STEEL_L)
    m = FRONT(0, -d / 2 - 0.001, z0 + (h - z0) * 0.5)      # brass maker's plate
    g.paint_poly([(-0.17, -0.1), (0.17, -0.1), (0.17, 0.1), (-0.17, 0.1)], m, BRASS)
    icon_banana(g, m @ T(0, -0.06, 0), 0.2, SAFE_D)
    yh = od / 2 + 0.065                                   # hinge line: the back edge of the door
    _hinges(g, (-0.17, 0.17), yh + 0.02, h + 0.035, r=0.046, L=0.15, col=SAFE_D)
    lid = a.part("lid", (0, yh, h))
    lid.box(ow + 0.13, od + 0.13, 0.085, (0, 0, h - 0.004), col=SAFE_L, b=0.03, jit=0.02, grad=(0.9, 1.06))
    lid.box(ow - 0.04, od - 0.04, 0.07, (0, 0, h - 0.07), col=STEEL_D, b=0.012)               # the plug: a thick door
    zd = h + 0.08
    lid.cyl(0.13, 0.05, (-0.1, -0.02, zd), col=BRASS, n=8, b=0.014, hl=1.25)                 # combination dial
    lid.cyl(0.05, 0.045, (-0.1, -0.02, zd + 0.048), col=GOLD_L, n=6, b=0.012)
    for k in range(8):
        an = radians(k * 45 + 22.5)
        lid.paint_line([(cos(an) * 0.068, sin(an) * 0.068), (cos(an) * 0.112, sin(an) * 0.112)], 0.02, TOP(-0.1, -0.02, zd + 0.05), SAFE_D, lift=0.004)
    lid.cyl(0.05, 0.07, (0.17, -0.02, zd), col=STEEL_L, n=6, b=0.012)                         # three-spoke handle
    for k in range(3):
        an = radians(90 + k * 120)
        px, py = 0.17 + cos(an) * 0.125, -0.02 + sin(an) * 0.125
        lid.pole((0.17, -0.02, zd + 0.045), (px, py, zd + 0.045), 0.018, STEEL_L, n=4, b=0.0)
        lid.ball(0.034, (px, py, zd + 0.045), col=BRASS, n=4, m=2, jit=0.02)
    a.point("mark", (0, 0, h + 0.65))
    return a


# ---------------------------------------------------------------- junk heap
def cont_trash(name, seed):
    """A rubbish mound. It has no hinged lid: its `lid` part is the loose top layer (a dented bin lid) lying over the
    pocket where the finds are, so the standard open tosses it back off the heap. That is the rummage."""
    a = Asset(name, G, footprint=0.85, blocksMove=True, seed=seed)
    g, r = a.mesh(), a.rng
    g.rock(1.9, 1.7, 0.66, (0, 0.03, -0.012), col=DIRT[0], n=18, b=0.05, seed=31, grad=(0.82, 1.06))     # the mound
    g.rock(1.0, 0.9, 0.5, (-0.3, 0.2, 0.12), (0, 0, 40), col=DIRT[1], n=12, b=0.04, seed=12)
    g.rock(1.0, 0.9, 0.42, (0.4, -0.2, -0.01), (0, 0, 10), col=DIRT[2], n=12, b=0.04, seed=5)
    with g.at(T(-0.56, -0.4, 0.31, 62, 8, -28)):                                             # a bald tyre leaning on it
        g.lathe([(0.17, 0.0), (0.25, -0.085), (0.35, 0.0), (0.25, 0.085), (0.17, 0.0)], col="#2b2a2e", n=9, cap0=False, cap1=False, smooth=70, jit=0.03)
    plank(g, (0.2, -0.7, 0.03), (0.66, -0.12, 0.44), 0.17, 0.045, pal=WOOD_GREY)             # broken crate boards
    plank(g, (0.48, -0.66, 0.03), (0.8, 0.05, 0.3), 0.15, 0.045, pal=WOOD_GREY, roll=25)
    plank(g, (-0.3, 0.72, 0.03), (0.35, 0.5, 0.42), 0.16, 0.045, pal=WOOD_D, roll=-20)
    g.box(0.44, 0.34, 0.26, (0.5, 0.42, 0.12), (10, -14, 28), col="#b79b6b", b=0.02, jit=0.04)   # a crushed carton
    g.pole((-0.86, 0.3, 0.05), (-0.2, 0.55, 0.5), 0.05, RUST[2], n=6, cap=IRON)                # a bent pipe
    for x, y, z, rx, rz, c in ((-0.05, -0.6, 0.075, 80, 30, STEEL_L), (0.1, -0.5, 0.26, 20, 0, RUST[0])):   # tins
        g.cyl(0.07, 0.17, (x, y, z), (rx, 0, rz), col=c, n=6, b=0.0, cap=STEEL_D)
    g.lathe([(0.055, 0.0), (0.06, 0.15), (0.022, 0.21), (0.022, 0.27)], (-0.34, -0.6, 0.12), (60, 0, -50), col="#3f7f4a", n=6, hl=1.2)   # a bottle
    with g.at(T(0.02, -0.4, 0.5, 0, 0, 20)):                                                  # a banana peel
        for k in range(3):
            an = radians(k * 120 + 30)
            g.tube([(0, 0, 0.05), (cos(an) * 0.09, sin(an) * 0.09, 0.04), (cos(an) * 0.19, sin(an) * 0.19, -0.03), (cos(an) * 0.23, sin(an) * 0.23, -0.1)], [0.04, 0.05, 0.04, 0.012], BANANA, n=3, jit=0.05)
        g.box(0.045, 0.045, 0.1, (0, 0, 0.02), (14, 10, 0), col=BANANA_D, b=0.0)
    with g.at(T(-0.52, 0.34, 0.5, 6, -12, 150)):                                              # a fish bone
        g.pole((-0.16, 0, 0), (0.16, 0, 0), 0.014, PAPER, n=4, b=0.0)
        for k in range(3):
            g.beam((-0.08 + k * 0.08, -0.06, 0), (-0.08 + k * 0.08, 0.06, 0), 0.02, 0.016, PAPER, b=0.0)
        g.prism([(0.14, -0.065), (0.27, 0.0), (0.14, 0.065)], 0.02, (0, 0, -0.01), col=PAPER)
        g.prism([(-0.25, -0.06), (-0.15, 0.0), (-0.25, 0.06)], 0.02, (0, 0, -0.01), col=PAPER)
    zp = 0.56                                                                                 # the pocket under the lid
    g.cyl(0.3, 0.05, (0.05, 0.02, zp - 0.04), col=INSIDE, n=10, b=0.0, jit=0)
    g.cyl(0.075, 0.13, (-0.06, 0.06, zp), (8, 6, 0), col=BRASS, n=6, b=0.012, hl=1.2)
    g.box(0.2, 0.14, 0.09, (0.14, -0.05, zp), (0, 0, 24), col=TEAL, b=0.015)
    g.paint_poly([(-0.06, -0.035), (0.06, -0.035), (0.06, 0.035), (-0.06, 0.035)], T(0.14, -0.05, zp + 0.09, 0, 0, 24), CREAM)
    tilt = T(0.05, 0.02, zp + 0.1, -9, 5, 0)
    hinge = tilt @ Vector((0, 0.37, 0.0))
    lid = a.part("lid", tuple(hinge))
    with lid.at(tilt):                                                                        # the dented bin lid
        lid.lathe([(0.37, 0.0), (0.4, 0.03), (0.31, 0.075), (0.12, 0.105), (0.0, 0.11)], col=STEEL, n=10, cap=STEEL_D, smooth=50, jit=0.04, grad=(0.9, 1.08))
        lid.box(0.05, 0.05, 0.05, (-0.08, 0, 0.095), col=STEEL_D, b=0.0)
        lid.box(0.05, 0.05, 0.05, (0.08, 0, 0.095), col=STEEL_D, b=0.0)
        lid.beam((-0.12, 0, 0.16), (0.12, 0, 0.16), 0.055, 0.045, STEEL_D, b=0.015)
        lid.paint_poly([(-0.11, -0.08), (-0.02, -0.11), (0.04, -0.03), (-0.04, 0.03), (-0.12, 0.0)], T(0.2, 0.12, 0.062, -14, 14, 0), RUST[1])
    a.point("mark", (0.05, 0.02, zp + 0.75))
    return a


# ---------------------------------------------------------------- supply sack
def cont_sack(name, seed, R=0.5, h=0.84):
    """A fat tied supply sack. The `lid` is its gathered neck, hinged at the back of the mouth: it flops back."""
    a = Asset(name, G, footprint=0.55, blocksMove=True, seed=seed)
    g = a.mesh()
    n, col = 12, CANVAS[1]

    def warp(v):
        k = 1 + 0.06 * sin(v.z * 8 + v.x * 5) + 0.04 * sin(v.y * 9)
        return Vector((v.x * k, v.y * k * 0.84, v.z + 0.03 * sin(v.x * 6)))
    prof = [(0.0, 0.0), (R * 0.62, 0.02), (R * 0.94, 0.16), (R * 1.0, 0.4), (R * 0.9, 0.62), (R * 0.7, 0.78), (R * 0.6, h)]
    g.emit(p_lathe(prof, n, cap1=False), col, None, warp=warp, grad=(0.8, 1.06), smooth=70)
    for z in (0.5, 0.6):                                  # two rust stripes woven round it
        k = lambda zz: R * (1.0 - 0.1 * (zz - 0.4) / 0.22) + 0.011     # noqa: E731
        g.emit(p_lathe([(k(z), z), (k(z + 0.045), z + 0.045)], n, cap0=False, cap1=False), RUST[0], None, warp=warp, jit=0.03)
    for sx in (-1, 1):                                    # stencilled "this way up" arrows
        icon_arrow(g, T(sx * 0.12, -R * 0.84 + 0.004, 0.3, 86, 0, 0) @ T(rz=90), 0.2, "#6b5335")
    g.emit(p_tube([(cos(2 * pi * k / n) * R * 0.6, sin(2 * pi * k / n) * R * 0.6, h) for k in range(n)], 0.035, 5, closed=True), CANVAS_D, None, warp=warp, jit=0.03)   # rolled mouth
    g.emit(p_cyl(R * 0.56, 0.04, n, b=0.0), INSIDE, T(0, 0, h - 0.11), warp=warp, jit=0)
    g.cyl(0.085, 0.2, (-0.1, 0.06, h - 0.13), (6, 8, 0), col=STEEL_L, n=6, b=0.012, cap=STEEL_D)        # what is inside: tins, a coconut, bananas
    g.paint_poly([(-0.06, -0.05), (0.06, -0.05), (0.06, 0.05), (-0.06, 0.05)], T(-0.1, -0.026, h - 0.03, 96, 8, 0), RED)
    g.cyl(0.075, 0.16, (0.1, 0.1, h - 0.11), (-8, 0, 0), col=OLIVE, n=6, b=0.012, cap=STEEL_D)
    coconut(g, (0.09, -0.09, h - 0.19), 0.12, 40, eyes=False)
    banana(g, (-0.05, -0.12, h - 0.03), (0, 0, 160), 0.55)
    lid = a.part("lid", (0, R * 0.47, h))
    lid.emit(p_lathe([(R * 0.57, h - 0.012), (R * 0.63, h + 0.03), (R * 0.56, h + 0.1), (R * 0.36, h + 0.22), (R * 0.22, h + 0.31), (R * 0.18, h + 0.35)], n, cap1=False), col, None, warp=warp,
             grad=(0.9, 1.06), smooth=70, cap=CANVAS_D)
    lid.emit(p_lathe([(0.095, h + 0.325), (0.125, h + 0.352), (0.095, h + 0.38)], 8, cap0=False, cap1=False), ROPE, None, warp=warp)
    lid.emit(p_lathe([(0.085, h + 0.365), (0.2, h + 0.47), (0.22, h + 0.55), (0.0, h + 0.52)], 8, cap0=False), shade(col, 1.06), None,
             warp=lambda v: Vector((v.x, v.y * 0.7, v.z + 0.03 * sin(v.x * 20))), smooth=70)
    rope(lid, [(0.1, -0.06, h + 0.35), (0.2, -0.16, h + 0.27), (0.22, -0.2, h + 0.14)], 0.022, seg=2, n=4)
    rope(lid, [(-0.02, -0.11, h + 0.35), (-0.1, -0.2, h + 0.24), (-0.09, -0.24, h + 0.1)], 0.022, seg=2, n=4)
    a.point("mark", (0, 0, h + 1.1))
    return a



def build():
    cont_weapon("cont_weapon", 21)
    cont_food("cont_food", 22)
    cont_ammo("cont_ammo", 23)
    cont_parts("cont_parts", 24)
    cont_medical("cont_medical", 25)
    cont_lunchbox("cont_lunchbox", 26)
    cont_toolbox("cont_toolbox", 27)
    cont_medcabinet("cont_medcabinet", 28)
    cont_safe("cont_safe", 29)
    cont_trash("cont_trash", 30)
    cont_sack("cont_sack", 31)


REVIEW = dict(cols=6, cell=3.0, dist=26)
