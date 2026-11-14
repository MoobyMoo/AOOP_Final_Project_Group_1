"""House kit props: furniture and dressing drawn into a House (or exported one by one by g_house.py).

Every prop is fn(h, g, em, **kw): g = matte geo, em = emissive geo, both already moved to the prop's place (origin on
the floor, front toward -y). It returns its colliders in prop space:
  ("box", x, y, w, d, flags) · ("circle", x, y, r, flags) · ("light", x, y, z)
Cover rule: furniture below about 1.3 u is low cover (blocks walking, not shots); taller pieces block both."""
from hkit import *

LOW = dict(move=True, shot=False, low=True)
TALL = dict(move=True, shot=True, low=False)
BLANKETS = ["#7c8f8a", "#8d8a6e", "#9a7f6b", "#6f8196"]
LABELS = ["#d7402f", "#f0bd2e", "#4f9a94", "#e6dfcc", "#667f4c", "#c9772e"]


def top_boards(g, w, d, z, pal, n=3, along="x"):
    """board decals on a table top"""
    for i in range(n):
        if along == "x":
            a, b = -d / 2 + d * i / n + 0.015, -d / 2 + d * (i + 1) / n - 0.015
            g.paint_poly([(-w / 2 + 0.02, a), (w / 2 - 0.02, a), (w / 2 - 0.02, b), (-w / 2 + 0.02, b)], TOP(0, 0, z), shade(pick(g.rng, pal), g.rng.uniform(0.94, 1.05)))
        else:
            a, b = -w / 2 + w * i / n + 0.015, -w / 2 + w * (i + 1) / n - 0.015
            g.paint_poly([(a, -d / 2 + 0.02), (b, -d / 2 + 0.02), (b, d / 2 - 0.02), (a, d / 2 - 0.02)], TOP(0, 0, z), shade(pick(g.rng, pal), g.rng.uniform(0.94, 1.05)))


def lantern(h, g, em, z=0.0, light=True):
    g.cyl(0.085, 0.05, (0, 0, z), col=IRON, n=6, b=0.01)
    em.cyl(0.062, 0.17, (0, 0, z + 0.045), col=BULB, n=6, b=0.015, jit=0)
    g.cyl(0.09, 0.05, (0, 0, z + 0.2), col=IRON, n=6, r2=0.03, b=0.0)
    g.box(0.035, 0.035, 0.09, (0, 0, z + 0.24), col=IRON, b=0)
    return [("light", 0, 0, z + 0.5)] if light else []


def bunk(h, g, em, blanket=None, single=False):
    """two-level prison bunk, 1.95 x 0.92; single = an iron cot"""
    r, L, W = h.r, 1.95, 0.92
    top = 0.9 if single else 1.78
    for x in (-L / 2 + 0.04, L / 2 - 0.04):
        for y in (-W / 2 + 0.04, W / 2 - 0.04):
            g.box(0.08, 0.08, top, (x, y, 0), col=STEEL_D, b=0)
        g.box(0.05, W - 0.08, 0.06, (x, 0, top - 0.12), col=STEEL_D, b=0)
    for z in ((0.36,) if single else (0.36, 1.2)):
        g.box(L - 0.02, W - 0.02, 0.08, (0, 0, z), col=WOOD_D[0], b=0)
        g.box(L - 0.12, W - 0.1, 0.15, (0, 0, z + 0.075), col="#cdc4ad", b=0, jit=0.03)
        bl = blanket or pick(r, BLANKETS)
        g.box(1.12, W - 0.04, 0.17, (0.38, 0, z + 0.08), col=capcol(bl, 0.17, 0.8), b=0, jit=0.04)
        g.paint_poly([(0.02, -W / 2 + 0.06), (0.2, -W / 2 + 0.06), (0.2, W / 2 - 0.06), (0.02, W / 2 - 0.06)], TOP(0, 0, z + 0.25), YELLOW)
        g.box(0.4, 0.58, 0.1, (-L / 2 + 0.32, 0, z + 0.2), col=capcol("#ded6c1", 0.1, 0.8), b=0, jit=0.03)
    return [("box", 0, 0, L, W, LOW)]


def cot(h, g, em, quilt=None):
    """farmhouse bed, 2.0 x 1.1, wooden head and foot boards, patchwork quilt"""
    r, L, W = h.r, 2.0, 1.1
    wood = pick(r, WOOD_D)
    g.box(0.09, W, 0.95, (-L / 2 + 0.045, 0, 0), col=wood, b=0.025)
    g.box(0.09, W, 0.55, (L / 2 - 0.045, 0, 0), col=wood, b=0.025)
    g.box(L - 0.1, W - 0.06, 0.12, (0, 0, 0.26), col=shade(wood, 0.9), b=0)
    g.box(L - 0.2, W - 0.1, 0.16, (0, 0, 0.36), col="#d5ccb5", b=0)
    g.box(1.25, W - 0.04, 0.18, (0.32, 0, 0.37), col=quilt or "#b5533c", b=0.04)
    pal = ["#f0bd2e", "#4f9a94", "#e6dfcc", "#b5533c", "#667f4c"]
    for i in range(4):
        for j in range(3):
            if (i + j) % 2:
                x0, y0 = -0.28 + i * 0.3, -W / 2 + 0.06 + j * (W - 0.12) / 3
                g.paint_poly([(x0, y0), (x0 + 0.27, y0), (x0 + 0.27, y0 + (W - 0.12) / 3 - 0.03), (x0, y0 + (W - 0.12) / 3 - 0.03)], TOP(0, 0, 0.55), pick(r, pal))
    g.box(0.42, 0.7, 0.11, (-L / 2 + 0.36, 0, 0.5), col="#e2dac6", b=0.045)
    return [("box", 0, 0, L, W, LOW)]


def table(h, g, em, w=1.6, d=0.95, dress="meal"):
    r, z = h.r, 0.78
    g.box(w, d, 0.08, (0, 0, z - 0.08), col=SEAM, b=0.02, jit=0)
    top_boards(g, w, d, z, WOOD + WOOD_PALE[:1], 4)
    for x in (-w / 2 + 0.1, w / 2 - 0.1):
        for y in (-d / 2 + 0.1, d / 2 - 0.1):
            g.box(0.1, 0.1, z - 0.07, (x, y, 0), col=WOOD_D[1], b=0)
    for x in (-w / 2 + 0.1, w / 2 - 0.1):
        g.box(0.06, d - 0.2, 0.08, (x, 0, 0.2), col=WOOD_D[1], b=0)
    out = [("box", 0, 0, w, d, LOW)]
    if dress == "meal":
        for x, y in ((-0.42, -0.2), (0.4, 0.22)):
            g.cyl(0.15, 0.03, (x, y, z - 0.005), col="#e6dfcc", n=7, b=0)
        g.cyl(0.07, 0.14, (0.45, -0.22, z - 0.005), col="#c9772e", n=6, b=0)
        g.lathe([(0.07, 0), (0.075, 0.16), (0.03, 0.24), (0.03, 0.33)], (-0.05, 0.2, z - 0.005), col="#4f7f5a", n=5)
        banana(g, (0.05, -0.15, z + 0.05), (90, 0, 20), 1.1, n=4)
    elif dress == "cards":
        for i, (x, y, a) in enumerate(((-0.2, 0.0, 10), (0.05, 0.12, -25), (0.2, -0.1, 40), (-0.05, -0.2, 80))):
            g.paint_poly([(-0.07, -0.1), (0.07, -0.1), (0.07, 0.1), (-0.07, 0.1)], TOP(x, y, z) @ T(rz=a), "#efe3c5" if i % 2 else RED, lift=0.016 + 0.002 * i)
        g.cyl(0.07, 0.14, (0.5, 0.25, z - 0.005), col="#c9772e", n=6, b=0)
        with g.at(T(-0.52, 0.22, 0)), em.at(T(-0.52, 0.22, 0)):
            lantern(h, g, em, z - 0.005)
        out.append(("light", -0.52, 0.22, z + 0.5))
    return out


def chair(h, g, em, col=None):
    c = col or pick(h.r, WOOD_D)
    g.box(0.46, 0.46, 0.06, (0, 0, 0.44), col=pick(h.r, WOOD), b=0.015)
    for x in (-0.19, 0.19):
        g.box(0.06, 0.06, 0.45, (x, -0.19, 0), col=c, b=0)
        g.box(0.06, 0.06, 1.02, (x, 0.19, 0), col=c, b=0)
    g.box(0.32, 0.05, 0.2, (0, 0.19, 0.78), col=c, b=0)
    return []


def stool(h, g, em):
    g.cyl(0.21, 0.07, (0, 0, 0.4), col=pick(h.r, WOOD), n=7, b=0)
    for k in range(3):
        a = 2 * pi * k / 3
        g.pole((cos(a) * 0.2, sin(a) * 0.2, 0), (cos(a) * 0.1, sin(a) * 0.1, 0.42), 0.04, WOOD_D[0], n=4, b=0)
    return []


def shelf(h, g, em, w=1.4, hgt=1.9, d=0.42, stock="jars"):
    """open shelf unit, back toward +y"""
    r = h.r
    wood = pick(r, WOOD_D)
    for x in (-w / 2 + 0.03, w / 2 - 0.03):
        g.box(0.06, d, hgt, (x, 0, 0), col=wood, b=0)
    g.box(w - 0.13, 0.04, hgt - 0.04, (0, d / 2 - 0.025, 0.02), col=shade(wood, 0.82), b=0)
    levels = [0.12, 0.6, 1.08, 1.56] if hgt > 1.7 else [0.12, 0.6, 1.08]
    for z in levels + [hgt - 0.05]:
        g.box(w - 0.12, d - 0.03, 0.05, (0, -0.01, z - (0.01 if z > 1.7 else 0)), col=pick(r, WOOD), b=0)
    for z in levels:
        x = -w / 2 + 0.14
        while x < w / 2 - 0.2:
            k = r.random()
            if stock == "files" or (stock == "mixed" and k < 0.4):      # ledgers / box files
                bw = r.uniform(0.16, 0.28)
                g.box(bw, 0.26, r.uniform(0.28, 0.36), (x + bw / 2, -0.03, z + 0.045), col=pick(r, LABELS + ["#8a7d5a", "#57445a"]), b=0)
                x += bw + 0.012
            elif k < 0.5:
                rad = r.uniform(0.07, 0.1)
                g.lathe([(rad, 0), (rad, 0.2), (rad * 0.55, 0.28)], (x + rad, -0.04, z + 0.045), col=pick(r, ["#c9a56a", "#8fb5a8", "#d9903a", "#b9c48a"]), n=5)
                x += rad * 2 + 0.05
            elif k < 0.8:
                bw, bh = r.uniform(0.2, 0.32), r.uniform(0.16, 0.3)
                g.box(bw, 0.28, bh, (x + bw / 2, -0.03, z + 0.045), col=pick(r, WOOD_PALE + LABELS[:3]), b=0)
                x += bw + 0.05
            else:
                x += 0.3
    return [("box", 0, 0, w, d, TALL)]


def stove(h, g, em, pipe=3.5):
    """pot-belly stove; the flue is static and runs up through the roof, so it still reads when the roof fades"""
    g.lathe([(0.2, 0.12), (0.36, 0.24), (0.36, 0.8), (0.24, 0.9), (0.0, 0.93)], (0, 0, 0), col="#3a3a40", n=8, grad=(0.9, 1.1))
    for k in range(3):
        a = 2 * pi * (k + 0.25) / 3
        g.box(0.08, 0.08, 0.2, (cos(a) * 0.24, sin(a) * 0.24, 0), col=IRON, b=0)
    g.box(0.3, 0.12, 0.26, (0, -0.33, 0.36), col="#2c2c32", b=0.02)
    for i in range(3):
        em.paint_poly([(-0.1, -0.02), (0.1, -0.02), (0.1, 0.02), (-0.1, 0.02)], FRONT(0, -0.39, 0.43 + i * 0.065), FLAME[1 + i % 2], lift=0.006)
    g.pole((0, 0.1, 0.85), (0, 0.1, pipe), 0.1, "#4a4a52", n=6, b=0.0)
    g.cyl(0.2, 0.1, (0, 0.1, pipe), col="#3a3a40", n=7, r2=0.05, b=0.0)
    g.cyl(0.13, 0.12, (0.0, -0.05, 0.9), col=STEEL, n=6, b=0)                         # kettle
    for i, (x, zz) in enumerate(((0.53, 0.1), (0.72, 0.1), (0.62, 0.26))):          # firewood
        g.pole((x, -0.22 - 0.03 * i, zz), (x + 0.03, 0.4 - 0.03 * i, zz), 0.11, pick(h.r, WOOD_D), n=5, b=0, cap=ENDGRAIN)
    return [("circle", 0, 0, 0.42, LOW), ("box", 0.62, 0.08, 0.36, 0.7, LOW), ("light", 0, -0.5, 0.6)]


def desk(h, g, em, w=1.7, d=0.85, lamp=True):
    """pedestal desk with papers, a ledger and a green banker lamp; sit on the +y side"""
    r, z = h.r, 0.8
    wood = pick(r, ["#8a5a36", "#7d5030"])
    g.box(w, d, 0.07, (0, 0, z - 0.07), col=shade(wood, 1.12), b=0.02)
    for x in (-w / 2 + 0.26, w / 2 - 0.26):
        g.box(0.46, d - 0.1, z - 0.07, (x, 0, 0), col=wood, b=0)
        for k in range(3):
            g.paint_poly([(-0.19, 0.0), (0.19, 0.0), (0.19, 0.2), (-0.19, 0.2)], BACK(x, (d - 0.1) / 2, 0.06 + k * 0.23), shade(wood, 1.18))
            g.box(0.1, 0.04, 0.035, (x, (d - 0.1) / 2 + 0.015, 0.15 + k * 0.23), col=GOLD_D, b=0)
    g.box(w - 0.9, 0.04, 0.5, (0, -(d - 0.1) / 2 + 0.02, 0.22), col=shade(wood, 0.85), b=0)
    for i, (x, y, a) in enumerate(((-0.3, 0.05, 8), (-0.18, -0.12, -14), (0.1, 0.12, 30))):
        g.paint_poly([(-0.11, -0.15), (0.11, -0.15), (0.11, 0.15), (-0.11, 0.15)], TOP(x, y, z) @ T(rz=a), pick(r, [PAPER, "#e6dcc0", CREAM]), lift=0.006 + 0.003 * i)
    g.box(0.34, 0.26, 0.06, (0.32, 0.12, z - 0.005), (0, 0, 12), col=RED_D, b=0.012)                  # ledger
    g.paint_poly([(-0.1, -0.05), (0.1, -0.05), (0.1, 0.05), (-0.1, 0.05)], TOP(0.32, 0.12, z + 0.055) @ T(rz=12), GOLD)
    g.cyl(0.055, 0.12, (-0.62, 0.22, z - 0.005), col="#e6dfcc", n=6, b=0.01)
    out = [("box", 0, 0, w, d, LOW)]
    if lamp:
        x, y = w / 2 - 0.26, -0.18
        g.cyl(0.1, 0.03, (x, y, z - 0.005), col=GOLD_D, n=7, b=0.008)
        g.pole((x, y, z), (x, y, z + 0.3), 0.022, GOLD_D, n=5, b=0)
        em.box(0.34, 0.14, 0.09, (x, y, z + 0.28), col="#7be0a0", b=0.035, jit=0)
        out.append(("light", x, y, z + 0.55))
    return out


def cabinet(h, g, em, open_=False, col=None):
    """steel filing cabinet 0.56 x 0.62 x 1.35, drawers face -y"""
    r = h.r
    c = col or pick(r, ["#7d8f76", "#8a8f73", "#74868c"])
    g.box(0.56, 0.62, 1.35, (0, 0, 0), col=c, b=0.03, grad=(0.9, 1.04))
    for k in range(3):
        z = 0.08 + k * 0.42
        pulled = open_ and k == 2
        y = -0.31 - (0.3 if pulled else 0)
        if pulled:
            g.box(0.5, 0.34, 0.36, (0, -0.47, z), col=shade(c, 0.92), b=0.015)
            for i in range(4):
                g.box(0.4, 0.03, 0.3, (0, -0.36 - i * 0.07, z + 0.1), col=pick(r, [PAPER, "#d9c79c", "#e6dcc0"]), b=0)
        g.paint_poly([(-0.24, 0.0), (0.24, 0.0), (0.24, 0.36), (-0.24, 0.36)], FRONT(0, y - (0.02 if pulled else 0), z), shade(c, 1.12))
        g.box(0.16, 0.04, 0.04, (0, y - 0.02 - (0.02 if pulled else 0), z + 0.22), col=STEEL_L, b=0)
        g.paint_poly([(-0.07, 0.0), (0.07, 0.0), (0.07, 0.07), (-0.07, 0.07)], FRONT(0, y - (0.02 if pulled else 0), z + 0.08), PAPER, lift=0.014)
    return [("box", 0, -0.1 if open_ else 0, 0.56, 0.82 if open_ else 0.62, TALL)]


def crate(h, g, em, s=0.7, hgt=None, icon=False, pal=None):
    r = h.r
    hgt = hgt or s
    pal = pal or WOOD + WOOD_PALE[:1]
    g.box(s, s, hgt, (0, 0, 0), col=SEAM, b=0.025, jit=0)
    for F_, yy in ((FRONT, -s / 2), (BACK, s / 2), (LEFT, -s / 2), (RIGHT, s / 2)):
        m = F_(0, yy, 0) if F_ in (FRONT, BACK) else F_(yy, 0, 0)
        boards(g, m, -s / 2 + 0.03, s / 2 - 0.03, 0.03, hgt - 0.03, pal, pw=hgt / 3, seg=(9, 9), gap=0.035)
    boards(g, TOP(0, 0, hgt), -s / 2 + 0.03, s / 2 - 0.03, -s / 2 + 0.03, s / 2 - 0.03, pal, pw=s / 3, seg=(9, 9), gap=0.035)
    if icon:
        icon_banana(g, TOP(0, 0, hgt) @ T(0, -0.02, 0.012), s * 0.55, BANANA_D)
    return [("box", 0, 0, s, s, LOW)]


def crates(h, g, em, n=3):
    """a small stack: two on the floor, one on top"""
    r = h.r
    out = []
    with g.at(T(-0.38, 0, 0, 0, 0, r.uniform(-8, 8))):
        crate(h, g, em, 0.72, icon=True)
    with g.at(T(0.4, 0.05, 0, 0, 0, r.uniform(-12, 12))):
        crate(h, g, em, 0.66, hgt=0.5)
    if n > 2:
        with g.at(T(-0.3, 0.02, 0.72, 0, 0, r.uniform(10, 30))):
            crate(h, g, em, 0.56, hgt=0.42, pal=WOOD_PALE)
    return [("box", 0, 0, 1.5, 0.76, LOW)]


def barrel(h, g, em, col=None, lid=True):
    c = col or pick(h.r, ["#9a6f45", "#8a6240", "#a67a4e"])
    hoop = "#4d555b"
    g.lathe([(0.29, 0), (0.33, 0.14), (0.335, 0.22), (0.36, 0.46), (0.335, 0.7), (0.33, 0.78), (0.29, 0.92)], (0, 0, 0), n=9,
            col=lambda cen, tg: (shade(c, 1.15) if tg == 2 else hoop if (0.14 < cen.z < 0.22 or 0.7 < cen.z < 0.78) else c), grad=(0.9, 1.06))
    return [("circle", 0, 0, 0.36, LOW)]


def drum(h, g, em, col=None):
    """steel fuel drum"""
    c = col or pick(h.r, [TEAL_D, RUST[0], "#c9a13a"])
    g.lathe([(0.3, 0), (0.31, 0.3), (0.33, 0.34), (0.31, 0.38), (0.31, 0.62), (0.33, 0.66), (0.31, 0.7), (0.3, 0.98)], (0, 0, 0), n=8, col=lambda cen, tg: shade(c, 0.8) if tg == 2 else c, grad=(0.88, 1.05))
    g.cyl(0.05, 0.04, (0.14, 0.05, 0.97), col=STEEL_L, n=6, b=0)
    return [("circle", 0, 0, 0.33, LOW)]


def sack(h, g, em, col=None, lying=False):
    c = col or pick(h.r, CANVAS)
    if lying:
        g.ball(0.3, (0, 0, 0.16), s=(1.5, 0.95, 0.62), col=c, n=6, m=3, jit=0.05)
    else:
        g.lathe([(0.22, 0), (0.31, 0.2), (0.24, 0.56), (0.08, 0.64), (0.14, 0.75)], (0, 0, 0), col=lambda cen, tg: ROPE if 0.58 < cen.z < 0.66 else c, n=6, jit=0.05)
    return [("circle", 0, 0, 0.3, LOW)]


def sacks(h, g, em):
    r = h.r
    for x, y, a in ((-0.3, 0.0, 10), (0.32, 0.08, -20)):
        with g.at(T(x, y, 0, 0, 0, a)):
            sack(h, g, em)
    with g.at(T(0.0, -0.25, 0.0, 0, 0, 70)):
        sack(h, g, em, lying=True)
    return [("box", 0, -0.05, 1.25, 0.8, LOW)]


def haybale(h, g, em, n=1):
    """n = 1 one bale, 3 = two with one on top"""
    r = h.r
    def one(x, y, z, a):
        with g.at(T(x, y, z, 0, 0, a)):
            c = pick(r, STRAW)
            g.box(1.1, 0.56, 0.5, (0, 0, 0), col=c, b=0.06, jit=0.05, grad=(0.88, 1.04))
            for u in (-0.3, 0.3):
                for F_, m in ((TOP, TOP(u, 0, 0.5)), (FRONT, FRONT(u, -0.28, 0.25)), (BACK, BACK(-u, 0.28, 0.25))):
                    g.paint_line([(0, -0.18), (0, 0.18)], 0.04, m, "#8a6c30")
            for _ in range(4):
                u, v = -0.42 + (_ % 2) * 0.5 + r.uniform(0, 0.08), -0.17 + (_ // 2) * 0.2 + r.uniform(0, 0.04)
                g.paint_line([(u, v), (u + r.uniform(0.1, 0.16), v + r.uniform(-0.03, 0.03))], 0.03, TOP(0, 0, 0.5), shade(c, 0.78), lift=0.018)
    one(0, 0, 0, r.uniform(-5, 5))
    if n >= 3:
        one(0.05, 0.6, 0, r.uniform(-6, 6))
        one(0.0, 0.3, 0.49, r.uniform(-12, 12) + 0)
        return [("box", 0.02, 0.3, 1.15, 1.2, LOW)]
    return [("box", 0, 0, 1.1, 0.56, LOW)]


def radio(h, g, em):
    """the radio set on its own bench: 1.5 x 0.7"""
    r, z = h.r, 0.8
    g.box(1.5, 0.7, 0.07, (0, 0, z - 0.07), col=WOOD[1], b=0.02)
    for x in (-0.65, 0.65):
        g.box(0.1, 0.6, z - 0.07, (x, 0, 0), col=WOOD_D[0], b=0)
    g.box(1.3, 0.06, 0.1, (0, 0.2, 0.3), col=WOOD_D[0], b=0)
    g.box(0.86, 0.42, 0.52, (-0.2, 0.1, z - 0.005), col="#66754f", b=0.03, grad=(0.92, 1.05))            # the set
    g.paint_poly([(-0.38, 0.05), (0.38, 0.05), (0.38, 0.46), (-0.38, 0.46)], FRONT(-0.2, -0.11, z), "#2f352c")
    for i in range(3):
        em.cyl(0.055, 0.03, (-0.46 + i * 0.26, -0.115, z + 0.33), (90, 0, 0), col=["#ffd36a", "#8be3a0", "#ffd36a"][i], n=7, b=0, jit=0)
        g.cyl(0.04, 0.05, (-0.46 + i * 0.26, -0.115, z + 0.14), (90, 0, 0), col=STEEL_L, n=6, b=0)
    for i in range(4):
        g.paint_line([(-0.34 + 0.0, 0.0), (-0.04, 0.0)], 0.02, FRONT(0.34 - 0.2, -0.11, z + 0.1 + i * 0.045), "#8a9a70", lift=0.014)
    g.pole((-0.5, 0.2, z + 0.5), (-0.5, 0.2, z + 1.25), 0.02, STEEL_L, n=5, b=0)                          # whip aerial
    g.box(0.3, 0.2, 0.16, (0.5, 0.1, z - 0.005), col="#3d3a40", b=0.02)                                   # morse key box
    g.box(0.05, 0.2, 0.03, (0.5, 0.06, z + 0.15), col=GOLD_D, b=0)
    g.cyl(0.07, 0.05, (0.36, -0.2, z - 0.005), col="#2e2a30", n=7, b=0.01)                                # headset
    g.cyl(0.07, 0.05, (0.56, -0.2, z - 0.005), col="#2e2a30", n=7, b=0.01)
    g.box(0.24, 0.03, 0.02, (0.46, -0.2, z + 0.04), col="#2e2a30", b=0)
    return [("box", 0, 0, 1.5, 0.7, LOW), ("light", -0.2, -0.3, z + 0.7)]


def generator(h, g, em):
    """battery bank + a small generator with a cable"""
    r = h.r
    g.box(0.9, 0.5, 0.1, (0, 0, 0), col=WOOD_D[0], b=0.015)
    for i in range(3):
        g.box(0.26, 0.36, 0.34, (-0.3 + i * 0.3, 0, 0.09), col=["#3d4a52", "#44525a", "#3d4a52"][i], b=0.025)
        for sg, c in ((-1, RED), (1, "#2e2a30")):
            g.box(0.06, 0.06, 0.06, (-0.3 + i * 0.3, sg * 0.09, 0.42), col=c, b=0)
    g.tube([(-0.3, -0.09, 0.46), (-0.15, -0.14, 0.52), (0.0, -0.09, 0.46)], 0.015, RED, n=4)
    g.tube([(0.0, 0.09, 0.46), (0.15, 0.14, 0.52), (0.3, 0.09, 0.46)], 0.015, "#2e2a30", n=4)
    return [("box", 0, 0, 0.9, 0.5, LOW)]


def bucket(h, g, em, col=None):
    g.lathe([(0.13, 0), (0.18, 0.32)], (0, 0, 0), col=col or STEEL, n=6, cap1=False)
    g.cyl(0.165, 0.02, (0, 0, 0.26), col="#3c4a50", n=6, b=0)
    return []


def bench(h, g, em, w=1.6):
    g.box(w, 0.36, 0.07, (0, 0, 0.42), col=pick(h.r, WOOD), b=0.02)
    for x in (-w / 2 + 0.16, w / 2 - 0.16):
        g.box(0.08, 0.32, 0.43, (x, 0, 0), col=WOOD_D[0], b=0)
    return [("box", 0, 0, w, 0.36, LOW)]


def workbench(h, g, em, w=2.2):
    """bench with a vise and tools; back toward +y"""
    r, z, d = h.r, 0.86, 0.7
    g.box(w, d, 0.09, (0, 0, z - 0.09), col=SEAM, b=0.02, jit=0)
    top_boards(g, w, d, z, WOOD_GREY + WOOD[:1], 3)
    for x in (-w / 2 + 0.1, w / 2 - 0.1):
        for y in (-d / 2 + 0.1, d / 2 - 0.1):
            g.box(0.11, 0.11, z - 0.08, (x, y, 0), col=WOOD_D[0], b=0)
    g.box(w - 0.2, d - 0.16, 0.05, (0, 0, 0.22), col=WOOD_D[2], b=0)
    g.box(0.2, 0.22, 0.16, (-w / 2 + 0.3, -d / 2 + 0.1, z - 0.005), col=STEEL_D, b=0.02)                  # vise
    g.pole((-w / 2 + 0.3, -d / 2 - 0.12, z + 0.08), (-w / 2 + 0.3, -d / 2 + 0.05, z + 0.08), 0.025, STEEL_L, n=5, b=0)
    g.box(0.36, 0.07, 0.06, (0.1, 0.0, z - 0.005), (0, 0, 25), col=WOOD_D[1], b=0)                        # hammer
    g.box(0.1, 0.16, 0.1, (0.24, 0.07, z - 0.002), (0, 0, 25), col=STEEL_D, b=0)
    g.paint_poly([(0, 0), (0.5, 0.04), (0.5, 0.1), (0, 0.16)], TOP(0.45, -0.2, z), STEEL_L)                # saw
    g.box(0.16, 0.2, 0.05, (0.42, -0.12, z - 0.005), col=WOOD_D[0], b=0)
    g.cyl(0.11, 0.2, (-0.3, 0.15, z - 0.005), col=RUST[0], n=7, b=0.015)                                  # paint tin
    g.box(0.5, 0.34, 0.26, (w / 2 - 0.5, 0, 0.27), col=pick(r, WOOD_PALE), b=0.02)                        # box below
    return [("box", 0, 0, w, d, LOW)]


def stall(h, g, em, w=2.0, gate=False):
    """a low plank partition (barn stall side), running along x"""
    r = h.r
    for x in (-w / 2 + 0.07, w / 2 - 0.07):
        g.box(0.14, 0.14, 1.2, (x, 0, -0.04), col=WOOD_D[0], b=0.025)
    for z in (0.3, 0.62, 0.94):
        plank(g, (-w / 2 + 0.05, 0.0, z), (w / 2 - 0.05, 0.0, z), 0.07, 0.24, pal=WOOD_GREY + WOOD[:1], b=0.0, roll=0)
    return [("box", 0, 0, w, 0.2, LOW)]


def trough(h, g, em):
    g.box(1.4, 0.5, 0.36, (0, 0, 0.1), col=WOOD_D[1], b=0.03)
    g.paint_poly([(-0.62, -0.18), (0.62, -0.18), (0.62, 0.18), (-0.62, 0.18)], TOP(0, 0, 0.46), "#4f7f8a")
    for x in (-0.55, 0.55):
        g.box(0.1, 0.44, 0.12, (x, 0, 0), col=WOOD_D[0], b=0)
    return [("box", 0, 0, 1.4, 0.5, LOW)]


def ladder_lean(h, g, em, hgt=2.6):
    """a ladder leaning against the wall behind it (+y)"""
    c = pick(h.r, WOOD)
    for x in (-0.27, 0.27):
        g.beam((x, -0.6, 0.0), (x, 0.0, hgt), 0.07, 0.07, c, b=0)
    n = int(hgt / 0.42)
    for i in range(n):
        t = (i + 0.6) / n
        g.box(0.6, 0.05, 0.05, (0, -0.6 * (1 - t), hgt * t - 0.025), col=shade(c, 0.9), b=0)
    return [("box", 0, -0.3, 0.6, 0.55, LOW)]


def pitchfork(h, g, em):
    g.pole((0, -0.3, 0), (0, 0, 1.9), 0.03, WOOD[0], n=5, b=0)
    for x in (-0.09, 0, 0.09):
        g.pole((x, 0.0, 1.85), (x, 0.03, 2.25), 0.018, STEEL_D, n=4, b=0)
    g.box(0.24, 0.04, 0.04, (0, 0.0, 1.85), col=STEEL_D, b=0)
    return []


def boat(h, g, em, col=None):
    """a rowboat on two trestles, 3 u long along x, being patched up"""
    r = h.r
    c = col or TEAL
    for x in (-0.8, 0.8):
        g.box(0.12, 1.2, 0.1, (x, 0, 0.44), col=WOOD_D[0], b=0)
        for y in (-0.5, 0.5):
            g.beam((x, y * 1.15, 0), (x, y * 0.7, 0.46), 0.1, 0.1, WOOD_D[1], b=0)
    st = [(-1.5, 0.05, 0.5, 0.2), (-1.15, 0.36, 0.46, 0.08), (-0.4, 0.56, 0.42, 0.0), (0.5, 0.58, 0.42, 0.0), (1.2, 0.5, 0.44, 0.03), (1.48, 0.42, 0.46, 0.06)]
    rings = []
    for x, w, hh, lift in st:
        rings.append([(x, -w, 0.5 + hh), (x, -w * 0.82, 0.5 + hh * 0.35 + lift), (x, -w * 0.3, 0.5 + lift), (x, w * 0.3, 0.5 + lift), (x, w * 0.82, 0.5 + hh * 0.35 + lift), (x, w, 0.5 + hh)])
    g.loft(rings, lambda cen, tg: (shade(c, 0.9) if cen.z < 0.76 else "#d9cdb0") if tg == 0 else "#6a4a2e", smooth=50, jit=0.03)
    for x, w in ((-0.55, 0.52), (0.55, 0.55)):
        g.box(0.24, 2 * w, 0.05, (x, 0, 0.9), col=WOOD[1], b=0)
    g.paint_poly([(-1.05, -0.28), (-0.4, -0.46), (0.5, -0.48), (1.3, -0.4), (1.3, 0.4), (0.5, 0.48), (-0.4, 0.46), (-1.05, 0.28)], TOP(0, 0, 0.925), "#5a4028", lift=-0.012)
    g.pole((-1.2, -0.75, 0.52), (1.3, -0.68, 0.56), 0.035, WOOD_PALE[1], n=5, b=0)                        # an oar across the trestles
    g.box(0.5, 0.05, 0.16, (1.4, -0.68, 0.48), col=WOOD_PALE[1], b=0)
    return [("box", 0, 0, 3.0, 1.2, LOW)]


def buoys(h, g, em, n=3):
    r = h.r
    for i in range(n):
        x, y = (i - (n - 1) / 2) * 0.42 + r.uniform(-0.04, 0.04), r.uniform(-0.1, 0.1)
        c = pick(r, [RED, "#f08a2e", YELLOW])
        g.ball(0.2, (x, y, 0.19), col=lambda cen, tg, c=c: CREAM if abs(cen.z) < 0.07 else c, n=7, m=5, jit=0.03)
        g.cyl(0.04, 0.08, (x, y, 0.36), col=ROPE, n=5, b=0)
    return [("box", 0, 0, 0.42 * n, 0.45, LOW)]


def coil(h, g, em):
    g.lathe([(0.34, 0), (0.37, 0.07), (0.34, 0.15), (0.16, 0.16), (0.14, 0.06)], (0, 0, 0), col=ROPE, n=7, cap1=True, jit=0.04)
    g.lathe([(0.3, 0), (0.33, 0.06), (0.3, 0.12), (0.18, 0.13)], (0.02, 0.01, 0.14), col=shade(ROPE, 0.9), n=7, cap1=True)
    return []


def net_rack(h, g, em, w=2.0):
    """drying rack with a fishing net and floats; runs along x"""
    r = h.r
    for x in (-w / 2, w / 2):
        g.box(0.1, 0.1, 1.5, (x, 0, 0), col=WOOD_D[0], b=0)
    g.pole((-w / 2 - 0.1, 0, 1.42), (w / 2 + 0.1, 0, 1.42), 0.045, WOOD[0], n=6, b=0.01)
    grid = [[(-w / 2 + 0.1 + (w - 0.2) * k / 4, 0.02 + 0.1 * sin(k * 1.7), 1.4 - 1.05 * i / 2 + 0.04 * sin(k * 2.3 + i)) for k in range(5)] for i in range(3)]
    g.sheet(grid, "#5f8f86", thick=0.03, jit=0.03)
    for i in range(7):
        u = -w / 2 + 0.2 + (w - 0.4) * i / 6
        g.paint_line([(u - 0.12, 0.4), (u + 0.12, 1.36)], 0.025, FRONT(0, -0.06, 0), "#2f4f4a", lift=0.002)
        g.paint_line([(u + 0.12, 0.4), (u - 0.12, 1.36)], 0.025, FRONT(0, -0.06, 0), "#2f4f4a", lift=0.004)
    for i in range(4):
        g.ball(0.08, (-w / 2 + 0.3 + (w - 0.6) * i / 3, -0.02, 0.38), col=pick(r, [RED, CREAM, "#f08a2e"]), n=5, m=3)
    return [("box", 0, 0, w, 0.3, LOW)]


def mooring(h, g, em, rope_to=None):
    g.cyl(0.13, 0.95, (0, 0, -0.1), col=WOOD_D[0], n=6, r2=0.11, b=0.03, cap=ENDGRAIN)
    g.lathe([(0.125, 0.5), (0.16, 0.56), (0.16, 0.64), (0.12, 0.7)], (0, 0, 0), col=ROPE, n=6, cap0=False, cap1=False)
    return [("circle", 0, 0, 0.16, LOW)]


def plant(h, g, em, s=1.0):
    """a potted banana sprout"""
    r = h.r
    g.lathe([(0.16, 0), (0.24, 0.3), (0.26, 0.34), (0.2, 0.35)], (0, 0, 0), col="#b9673a", n=8)
    g.pole((0, 0, 0.3), (0.02, 0, 0.75 * s), 0.05, "#7f9a48", n=5, b=0)
    for k in range(4):
        a = 2 * pi * k / 4 + r.uniform(-0.3, 0.3)
        L = r.uniform(0.5, 0.8) * s
        d = Vector((cos(a), sin(a), 0))
        p0 = Vector((0.01, 0, (0.6 + 0.035 * k) * s))
        grid = []
        for i in range(3):
            t = i / 2
            c = p0 + d * (0.03 + L * t) + Vector((0, 0, L * (0.7 * t - 0.85 * t * t)))
            wd = 0.16 * s * sin(pi * (0.12 + 0.8 * t))
            side = Vector((-d.y, d.x, 0)) * wd
            grid.append([tuple(c - side), tuple(c + Vector((0, 0, -0.03))), tuple(c + side)])
        g.sheet(grid, pick(r, LEAF), thick=0.025, jit=0.06)
    return [("circle", 0, 0, 0.26, LOW)]


def firewood(h, g, em, w=1.3):
    r = h.r
    k = int(w / 0.24)
    for row in range(3):
        for i in range(k - row):
            x = -w / 2 + 0.13 + (i + row * 0.5) * (w - 0.26) / max(1, k - 1)
            j0, j1 = 0.011 * ((i * 3 + row * 5) % 7 - 3), 0.011 * ((i * 5 + row * 3) % 7 - 3)
            g.pole((x, -0.28 + j0, 0.11 + row * 0.165), (x, 0.28 + j1, 0.11 + row * 0.165), 0.135, pick(r, WOOD_D), n=5, b=0, cap=ENDGRAIN)
    for x in (-w / 2 + 0.03, w / 2 - 0.03):
        g.box(0.07, 0.07, 0.72, (x, 0.2, 0), col=WOOD_D[0], b=0)
    return [("box", 0, 0, w, 0.6, LOW)]


def noticeboard(h, g, em, text="NOTICE", w=1.3):
    """free-standing board on two posts, face toward -y"""
    r = h.r
    for x in (-w / 2 + 0.05, w / 2 - 0.05):
        g.box(0.09, 0.09, 1.75, (x, 0.02, 0), col=WOOD_D[0], b=0)
    g.box(w, 0.06, 0.85, (0, 0, 0.85), col="#7a5f3c", b=0.02)
    g.paint_poly([(-w / 2 + 0.06, 0.06), (w / 2 - 0.06, 0.06), (w / 2 - 0.06, 0.79), (-w / 2 + 0.06, 0.79)], FRONT(0, -0.03, 0.85), "#6a7f5a")
    for i, (x, z, a) in enumerate(((-0.34, 0.28, 5), (0.02, 0.2, -6), (0.36, 0.3, 3), (-0.2, 0.52, -3))):
        if i < 3 or w > 1.2:
            g.paint_poly([(-0.13, -0.16), (0.13, -0.16), (0.13, 0.16), (-0.13, 0.16)], FRONT(x * w / 1.3, -0.03, 0.85 + z) @ T(rz=a), pick(r, [PAPER, "#e6dcc0", "#f0d98c"]), lift=0.014 + 0.002 * i)
    g.paint_text(text, 0.13, FRONT(0, -0.038, 1.55), CREAM)
    return [("box", 0, 0, w, 0.2, LOW)]


def keyboard_(h, g, em):
    """a low key rack on a stand"""
    g.box(0.09, 0.09, 1.2, (0, 0.03, 0), col=WOOD_D[0], b=0)
    g.box(0.8, 0.05, 0.4, (0, 0, 0.75), col=WOOD_PALE[1], b=0.015)
    for i in range(5):
        x = -0.3 + i * 0.15
        g.box(0.03, 0.05, 0.03, (x, -0.04, 1.02), col=IRON, b=0)
        if i != 2:
            g.paint_poly([(-0.03, -0.14), (0.03, -0.14), (0.03, 0.0), (-0.03, 0.0)], FRONT(x, -0.025, 1.02), GOLD, lift=0.012)
    return []


def wheel(h, g, em):
    """an old cart wheel leaning on the wall behind it"""
    with g.at(T(0, 0, 0.5, 78, 0, 0)):
        g.lathe([(0.42, -0.04), (0.5, -0.05), (0.5, 0.05), (0.42, 0.04)], (0, 0, 0), col=WOOD_D[0], n=10, cap="#2e2219")
        g.cyl(0.1, 0.16, (0, 0, -0.08), col=WOOD_D[1], n=7, b=0.01)
        for k in range(3):
            g.box(0.9, 0.06, 0.11, (0, 0, -0.055), (0, 0, 60 * k), col=WOOD[0], b=0)
    return []
