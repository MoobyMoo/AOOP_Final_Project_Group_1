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


def build():
    cont_weapon("cont_weapon", 21)
    cont_food("cont_food", 22)
    cont_ammo("cont_ammo", 23)
    cont_parts("cont_parts", 24)
    cont_medical("cont_medical", 25)


REVIEW = dict(cols=5, cell=3.0, dist=22)
