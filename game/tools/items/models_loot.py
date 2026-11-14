"""The 18 loot items (ids match src/game/loot/interim.ts). Units are metres, front faces -Y, Z up."""
import math

from kit import (Model, arc_pts, ball, banana, bullet, circle_pts, helix_pts, lathe, leaf, lin, mix,
                 plate, ramp, rbox, rcyl, rrect_pts, torus, tube)

YEL, YEL_HI, YEL_LO = "#f8cc35", "#ffe169", "#e3a51f"
WOOD, WOOD_HI, WOOD_LO = "#b9824a", "#d9a366", "#8a5a30"
LEAF, LEAF_HI, LEAF_LO = "#58b548", "#8fd66a", "#2f7d32"
BRASS, GOLD, GOLD_HI, GOLD_LO = "#d9a441", "#ffc531", "#ffe08a", "#b8791a"
STEEL, STEEL_LO, GUN = "#b9c2cc", "#6f7780", "#4a505a"
RED, CREAM, CHAR = "#d8362f", "#f6efe0", "#2c2f38"


def _h(*v):
    s = math.sin(sum(x * k for x, k in zip(v, (127.1, 311.7, 74.7))) * 43758.5453)
    return s - math.floor(s)


def bunch():
    m = Model("bunch", "Banana Bunch")
    rows = (((-58, -29, 0, 29, 58), -22, 0.235, 0.031, 104, 0.0),
            ((-44, -15, 15, 44), -52, 0.215, 0.029, 96, 0.012))
    for ri, (fan, tilt, ln, r, bend, back) in enumerate(rows):
        for i, az in enumerate(fan):
            shade = mix(YEL, YEL_LO, 0.25 + 0.5 * _h(ri, i))
            b = banana(ln, r, bend, seg=6, n=8, yellow=mix(YEL, YEL_HI, 0.3 * _h(i, ri)), shade=shade)
            b.sc(1, 1, -1).rot(rx=11 * (i - 2) + 5 * ri).rot(ry=tilt + 5 * (_h(ri, i, 7) - 0.5)).at(0.012 + 0.004 * _h(i, 5, ri)).rot(rz=-90 + az).at(0, back, 0)
            m.add(b, mat="satin")
    m.add(rcyl(0.024, 0.06, 0.006, 8, r2=0.016).rot(rx=-18).at(0, 0.004, -0.012), "#6f6a2a")
    m.add(ball(0.03, 8, 5).sc(1, 1, 0.7).at(0, 0.004, -0.006), "#8a8f2a")
    m.icon_rot = (8, 0, 0)
    return m


def coconut():
    m = Model("coconut", "Coconut")
    husk, husk_lo = "#8a5a32", "#5c391e"
    whole = ball(0.105, 18, 10).sc(1, 1, 0.94)
    whole.paint(lambda p: mix(husk_lo, husk, 0.5 + 0.5 * p.z / 0.1 + 0.25 * (_h(round(p.x, 2), round(p.y, 2), round(p.z, 2)) - 0.5)))
    whole.at(-0.06, 0.01, 0.1)
    m.add(whole)
    for a in (-22, 8, -7):                      # the three "eyes"
        el = math.radians(42 if a == -7 else 20)
        e = ball(0.017, 8, 4).sc(1, 0.55, 1).rot(rx=-math.degrees(el)).at(0, -0.1 * math.cos(el), 0.094 * math.sin(el))
        m.add(e.rot(rz=a * 1.6).at(-0.06, 0.01, 0.1), "#3a2413")
    r = 0.098
    n = 6
    prof = [(r * math.sin(math.pi / 2 * i / n), -r * math.cos(math.pi / 2 * i / n)) for i in range(n + 1)]
    prof[0] = (0.0, -r)
    prof += [(r * 0.84, 0.004)] + [(r * 0.8 * math.cos(math.pi / 2 * i / 3), -r * 0.8 * math.sin(math.pi / 2 * i / 3)) for i in range(1, 4)]
    prof[-1] = (0.0, -r * 0.8)
    half = lathe(prof, 18, sharp=50)
    half.paint(lambda p: lin("#fff8ea") if p.length < r * 0.9 else mix(husk_lo, husk, 0.6))
    half.rot(rx=62).rot(rz=-24).at(0.105, -0.02, 0.092)
    m.add(half, mat="satin")
    return m


def rope():
    m = Model("rope", "Vine Rope")
    vine, vine_hi = "#4f8f35", "#79b84a"
    for i, (R, z, tx, ty, ox) in enumerate(((0.118, 0.022, 3, 0, 0.0), (0.124, 0.05, -4, 3, 0.006), (0.112, 0.078, 2, -5, -0.004))):
        t = torus(R, 0.021, 18, 6)
        t.paint_t(lambda u: mix(vine, vine_hi, 0.5 + 0.5 * math.sin(u * math.tau * 9)))
        t.rot(rx=tx, ry=ty).at(ox, 0, z)
        m.add(t)
    wrap = tube([(0.04 * math.cos(a), 0, 0.058 * math.sin(a)) for a in (math.tau * i / 12 for i in range(12))],
                0.011, 5, closed=True, up=(0, 1, 0))
    for k, dy in enumerate((-0.016, 0.0, 0.016)):
        m.add(wrap.copy().at(0, dy, 0.05).rot(rz=-90).at(0, -0.12, 0), mix("#c9a15a", "#a57c3c", k / 2))
    tail = tube([(0.118, 0, 0.078), (0.135, -0.05, 0.07), (0.17, -0.085, 0.045), (0.215, -0.09, 0.02), (0.25, -0.07, 0.014)],
                lambda t: 0.019 - 0.004 * t, 6)
    tail.paint_t(lambda u: mix(vine, vine_hi, 0.5 + 0.5 * math.sin(u * math.tau * 3)))
    m.add(tail)
    for (x, y, z, rz, s) in ((0.075, 0.085, 0.09, 50, 1.0), (-0.12, 0.03, 0.09, 165, 0.85), (0.2, -0.1, 0.03, -30, 0.8)):
        lf = leaf(0.085 * s, 0.045 * s).rot(ry=-18).rot(rz=rz).at(x, y, z)
        lf.grad(LEAF_LO, LEAF_HI, axis=2)
        m.add(lf, mat="satin")
    m.icon_rot = (38, 0, 12)
    return m


def _board(ln, w, t, seed):
    """One board as three lengthwise grain strips of different shade/height; the uneven ends are the break."""
    parts = []
    sw = w / 3
    for k in range(3):
        l = ln * (1.0 - 0.07 * _h(seed, k, 1.0))
        dx = ln * 0.035 * (_h(seed, k, 2.0) - 0.5)
        dz = (0.0, 0.0035, -0.003)[(k + int(seed)) % 3]
        p = rbox(l, sw + 0.004, t, 0.005, 1).at(dx, (k - 1) * sw, dz)
        shade = 0.15 + 0.6 * _h(seed, k, 3.0)
        p.paint(lambda v, shade=shade, l=l, dx=dx: mix("#5a3516", "#b67a3c", shade + (0.22 if v.z > dz else -0.1)
                                                   - 0.3 * max(0.0, abs(v.x - dx) / (l / 2) - 0.86) * 5))
        parts.append(p)
    return parts


def plank():
    m = Model("plank", "Plank")
    for p in _board(0.62, 0.15, 0.04, 1.0):
        m.add(p.at(0, 0, 0.022))
    for p in _board(0.5, 0.13, 0.04, 2.0):
        m.add(p.rot(rz=152).at(-0.03, 0.01, 0.06))
    for x, y, z in ((-0.26, 0.045, 0.045), (-0.26, -0.045, 0.045), (0.16, -0.062, 0.083), (0.118, -0.108, 0.083)):
        m.add(rcyl(0.011, 0.012, 0.003, 8).at(x, y, z - 0.008), STEEL, "metal")
    for x, y, z, s in ((0.08, 0.0, 0.0455, 1.0), (-0.12, 0.1, 0.0835, 0.8)):
        m.add(rcyl(0.02 * s, 0.008, 0.002, 8).sc(1.4, 1, 1).at(x, y, z - 0.006), "#4a2a12")
    m.icon_rot = (30, 0, 20)
    return m


def golden():
    m = Model("golden", "Golden Banana")
    b = banana(0.34, 0.047, 92, seg=10, n=14, yellow=GOLD, stem=GOLD_LO, tip=GOLD_LO, shade="#f0a920")
    b.cols = [mix(c, GOLD_HI, 0.35) if (v.y < 0 and v.z > 0.04) else c for c, v in zip(b.cols, b.v)]
    m.add(b.rot(rx=90).rot(rz=-46), mat="metal")
    m.icon_rot = (62, 0, 0)
    return m


def honey():
    m = Model("honey", "Honey Pot")
    hon, hon_hi = "#ffb81c", "#ffe066"
    prof = [(0, 0), (0.058, 0), (0.066, 0.008), (0.092, 0.04), (0.104, 0.075), (0.096, 0.112), (0.078, 0.138),
            (0.08, 0.15), (0.09, 0.158), (0.086, 0.168), (0.07, 0.166), (0.066, 0.15), (0, 0.15)]
    pot = lathe(prof, 20, sharp=45)

    def pot_col(p):
        if p.z >= 0.149 and math.hypot(p.x, p.y) < 0.067:
            return lin(hon_hi)
        if 0.139 < p.z:
            return lin("#b85c30")
        return mix("#9a4a26", "#d07a42", p.z / 0.14)
    pot.paint(pot_col)
    m.add(pot, mat="satin")
    m.add(lathe([(0.06, 0.004), (0.072, 0.006), (0.081, 0.018), (0.07, 0.022)], 20), "#7a3a1e")               # dark foot ring

    def outer(z):
        pts = prof[:9]
        for (r0, z0), (r1, z1) in zip(pts, pts[1:]):
            if z0 <= z <= z1:
                return r0 + (r1 - r0) * (z - z0) / max(z1 - z0, 1e-9)
        return 0.09
    for a, drop in ((-52, 0.07), (-112, 0.04), (-8, 0.045), (150, 0.05)):
        ca, sa = math.cos(math.radians(a)), math.sin(math.radians(a))
        pts = [(0.078 * ca, 0.078 * sa, 0.166)]
        k = 4
        for i in range(k + 1):
            z = 0.16 - drop * i / k
            rr = outer(z) + 0.004
            pts.append((rr * ca, rr * sa, z))
        d = tube(pts, lambda t: 0.0115 - 0.0035 * math.sin(math.pi * min(1.0, t * 1.4)) + 0.004 * t ** 3, 10, sharp=85)
        d.paint_t(lambda t: mix(hon_hi, hon, t))
        m.add(d, mat="gloss")
    m.add(torus(0.081, 0.0085, 20, 5).at(0, 0, 0.164), hon, "gloss")
    stick = tube([(0.01, 0.0, 0.14), (0.075, -0.03, 0.27)], 0.009, 6)
    m.add(stick, WOOD_HI)
    m.add(ball(0.017, 8, 5).at(0.079, -0.032, 0.278), WOOD)
    return m


def gear():
    m = Model("gear", "Old Gear")
    teeth, ro, rr = 8, 0.105, 0.08
    out = []
    for i in range(teeth):
        a = math.tau * i / teeth
        w = math.tau / teeth
        for da, r in ((-0.30, rr), (-0.17, ro), (0.17, ro), (0.30, rr)):
            out.append((r * math.cos(a + da * w), r * math.sin(a + da * w)))
    holes = [circle_pts(0.03, 12)] + [circle_pts(0.015, 8, 0.056 * math.cos(a), 0.056 * math.sin(a))
                                      for a in (math.tau * (i + 0.5) / 4 for i in range(4))]
    g = plate(out, holes, h=0.032, bevel=0.005)

    def rust(p):
        n = _h(round(p.x * 40), round(p.y * 40), round(p.z * 60))
        return mix(mix("#7b838c", "#565d66", n), "#a8552a", 0.75 if n > 0.55 else 0.12)
    g.paint(rust)
    m.add(g.at(0, 0, 0.016), mat="metal")
    hub = torus(0.041, 0.021, 14, 6).at(0, 0, 0.016)
    hub.paint(lambda p: mix("#8a929b", "#9c5a34", _h(round(p.x * 50), round(p.y * 50))))
    m.add(hub, mat="metal")
    m.icon_rot = (58, 0, 14)
    return m


def spring():
    m = Model("spring", "Spring")
    R, r, pitch, turns = 0.048, 0.0095, 0.031, 4.5
    coil = tube([(x, y, z + r) for x, y, z in helix_pts(R, pitch, turns, 12)], r, 6)
    coil.paint_t(lambda t: mix(STEEL_LO, "#dfe6ee", 0.35 + 0.65 * abs(math.sin(t * math.tau * turns * 0.5))))
    m.add(coil, mat="metal")
    m.add(torus(R, r + 0.002, 14, 6).at(0, 0, r - 0.003), "#8d96a1", "metal")
    m.add(torus(R, r + 0.002, 14, 6).at(0, 0, pitch * turns + r + 0.003), "#cfd7e0", "metal")
    m.icon_rot = (0, 22, 0)
    return m


def boomerang():
    m = Model("boomerang", "Banana Boomerang")
    a, c, b = (-0.2, -0.075), (0.0, 0.2), (0.2, -0.075)
    n = 16
    pts = []
    for i in range(n + 1):
        t = i / n
        pts.append(((1 - t) ** 2 * a[0] + 2 * t * (1 - t) * c[0] + t * t * b[0],
                    (1 - t) ** 2 * a[1] + 2 * t * (1 - t) * c[1] + t * t * b[1], 0.0))
    p = tube(pts, lambda t: 0.036 * (1 - 0.55 * abs(2 * t - 1) ** 2.2), 8, squash=(0.36, 1.0), up=(0, 0, 1), sharp=70)

    def col(t):
        i = round(t * n)
        if i in (0, n):
            return lin("#5b3d1e")
        if i in (1, n - 1):
            return mix("#5b3d1e", YEL_LO, 0.6)
        if i in (7, 8, 9):
            return lin(RED)
        if i in (6, 10):
            return lin(CREAM)
        return mix(YEL, YEL_HI, 0.3)
    p.paint_t(col)
    m.add(p.at(0, 0, 0.014), mat="satin")
    m.icon_rot = (58, 0, -22)
    return m


def mango():
    m = Model("mango", "Sunset Mango")
    b = ball(1.0, 18, 10).sc(0.078, 0.066, 0.096)

    def shape(p):
        u = p.z / 0.096
        s = 1 + 0.16 * u
        return (p.x * s - 0.022 * (1 - u) ** 2 * 0.5 + 0.012, p.y * s, p.z)
    b.warp(shape)
    b.paint(lambda p: ramp([(0, "#ffd23a"), (0.4, "#ff9a2a"), (0.72, "#ee4a4a"), (1.0, "#b53a86")],
                           0.5 + (p.z * 0.8 + p.x * 0.75) / 0.2))
    m.add(b.at(0, 0, 0.096), mat="gloss")
    m.add(rcyl(0.008, 0.03, 0.002, 6).rot(ry=14).at(0.014, 0, 0.184), "#6b4a22")
    lf = leaf(0.1, 0.05).rot(ry=-24).rot(rz=-28).at(0.016, 0, 0.202)
    lf.grad(LEAF_LO, LEAF_HI, axis=0)
    m.add(lf, mat="satin")
    m.icon_rot = (0, 8, 0)
    return m


def compass():
    m = Model("compass", "Brass Compass")
    case = rcyl(0.056, 0.024, 0.006, 18)
    case.grad(GOLD_LO, BRASS, axis=2)
    m.add(case, mat="metal")
    m.add(rcyl(0.047, 0.006, 0.001, 18).at(0, 0, 0.021), "#fbf3dc", "satin")
    m.add(torus(0.05, 0.0075, 18, 6).at(0, 0, 0.026), "#e9b955", "metal")
    for i in range(8):
        a = math.tau * i / 8
        long = i % 2 == 0
        tick = rbox(0.005, 0.014 if long else 0.008, 0.004, 0.0).at(0, 0.034 if long else 0.037, 0.0265).rot(rz=math.degrees(a))
        m.add(tick, RED if i == 0 else "#4a3a2a")
    nb = banana(0.076, 0.0085, 70, seg=6, n=6)
    lo, hi = nb.bounds()
    nb.at(-(lo.x + hi.x) / 2, 0, -(lo.z + hi.z) / 2).rot(rx=90).rot(rz=118).at(0, 0, 0.034)
    m.add(nb, mat="satin")
    m.add(ball(0.0085, 8, 5).at(0, 0, 0.036), "#e9b955", "metal")
    lid = rcyl(0.056, 0.01, 0.004, 18).at(0, -0.056, 0)
    lid.paint(lambda p: lin("#f1c56a") if p.z > 0.006 and math.hypot(p.x, p.y + 0.056) < 0.05 else lin(BRASS))
    m.add(lid.rot(rx=-108).at(0, 0.058, 0.024), mat="metal")
    m.add(tube([(-0.02, 0.059, 0.022), (0.02, 0.059, 0.022)], 0.0075, 6, cap="flat"), GOLD_LO, "metal")
    m.add(rcyl(0.008, 0.016, 0.002, 6).rot(ry=-90).at(-0.052, 0, 0.012), GOLD_LO, "metal")
    m.add(torus(0.014, 0.004, 10, 5).rot(rx=90).rot(rz=20).at(-0.078, 0, 0.012), "#e9b955", "metal")
    m.icon_rot = (28, 0, -8)
    return m


def idol():
    m = Model("idol", "Banana Idol")
    g, g_hi, g_lo, dark = "#f2b22c", "#ffd866", "#b9801c", "#5c3a0e"
    stone = rbox(0.21, 0.17, 0.05, 0.008, 1)
    stone.paint(lambda p: mix("#5e6a52", "#8a8f7a", 0.5 + p.z / 0.05 + 0.3 * (_h(round(p.x, 2), round(p.y, 2)) - 0.5)))
    m.add(stone.at(0, 0, 0.025))
    neck = rcyl(0.078, 0.04, 0.008, 12, r2=0.06)
    neck.grad(g_lo, g, axis=2)
    m.add(neck.at(0, 0, 0.048), mat="metal")
    hz = 0.17
    head = ball(0.1, 18, 9).sc(1.0, 0.92, 0.96)
    head.grad(g_lo, g, axis=2, power=0.6)
    m.add(head.at(0, 0, hz), mat="metal")
    for sx in (-1, 1):
        m.add(ball(0.04, 10, 5).sc(1.0, 0.55, 1.05).at(sx * 0.036, -0.068, hz + 0.026), g_hi, "metal")
        ear = ball(0.04, 10, 5).sc(0.45, 1.0, 1.0)
        ear.paint(lambda p: lin(g_hi) if abs(p.x) < 0.008 and p.y < 0 else lin(g))
        m.add(ear.at(sx * 0.1, -0.004, hz + 0.004), mat="metal")
        # half-closed lids, pupils sliding sideways
        m.add(tube([(sx * 0.036 - 0.021, -0.0905, hz + 0.027 + sx * 0.002), (sx * 0.036 + 0.021, -0.0905, hz + 0.027 - sx * 0.002)],
                   0.007, 5), dark, "matte")
        m.add(ball(0.0125, 8, 4).sc(1, 0.6, 0.9).at(sx * 0.036 + 0.008, -0.089, hz + 0.018), dark, "matte")
        m.add(ball(0.0055, 6, 3).sc(1, 0.6, 1).at(sx * 0.012, -0.1055, hz - 0.008), dark, "matte")
    muzzle = ball(0.06, 12, 6).sc(1.12, 0.78, 0.76)
    muzzle.grad(g, g_hi, axis=2)
    m.add(muzzle.at(0, -0.066, hz - 0.03), mat="metal")
    smirk = tube([(-0.036, -0.103, hz - 0.046), (-0.012, -0.112, hz - 0.052), (0.014, -0.111, hz - 0.048),
                  (0.036, -0.1, hz - 0.034), (0.046, -0.09, hz - 0.022)], 0.0065, 5)
    m.add(smirk, dark, "matte")
    brow = tube([(0.014, -0.094, hz + 0.05), (0.034, -0.094, hz + 0.062), (0.056, -0.084, hz + 0.056)], 0.0055, 5)
    m.add(brow, g_lo, "metal")
    m.add(tube([(-0.056, -0.085, hz + 0.047), (-0.034, -0.094, hz + 0.046), (-0.014, -0.094, hz + 0.041)], 0.0055, 5), g_lo, "metal")
    crest = banana(0.13, 0.018, 120, seg=6, n=7, yellow=g_hi, stem=g_lo, tip=g_lo)
    m.add(crest.rot(rz=90).rot(rx=-36).at(0, 0.052, hz + 0.08), mat="metal")
    return m


def smoothie():
    m = Model("smoothie", "Banana Smoothie")
    cup = lathe([(0, 0), (0.038, 0), (0.041, 0.004), (0.056, 0.15), (0, 0.15)], 20)
    cup.grad("#f3cf68", "#fdf0b8", axis=2)
    m.add(cup, mat="gloss")
    m.add(lathe([(0.042, 0.045), (0.0475, 0.047), (0.0525, 0.098), (0.049, 0.1)], 20), "#4fae3a", "satin")
    lid = lathe([(0.059, 0.148), (0.06, 0.156), (0.052, 0.17), (0.034, 0.183), (0.014, 0.188), (0, 0.188)], 20)
    lid.grad("#cfd8e0", "#f6f8fa", axis=2)
    m.add(lid, mat="gloss")
    m.add(torus(0.058, 0.005, 20, 5).at(0, 0, 0.151), "#c3ccd6", "gloss")
    n = 9
    pts = [(0.008 + 0.0015 * i, 0.0, 0.16 + 0.0155 * i) for i in range(7)]
    pts += [(0.03, 0, 0.262), (0.05, 0, 0.268), (0.072, 0, 0.268)]
    straw = tube(pts, 0.0085, 6, cap="flat")
    straw.paint_t(lambda t: lin(RED) if round(t * n) % 2 == 0 else lin("#ffffff"))
    m.add(straw, mat="satin")
    nb = banana(0.062, 0.0085, 80, seg=5, n=6)
    lo, hi = nb.bounds()
    nb.at(-(lo.x + hi.x) / 2, 0, -(lo.z + hi.z) / 2).rot(ry=-52).at(0.006, -0.0505, 0.073).rot(rz=14)
    m.add(nb, mat="satin")
    sl = rcyl(0.024, 0.009, 0.002, 10)
    sl.paint(lambda p: lin("#fff3c4") if math.hypot(p.x, p.y) < 0.018 else lin(YEL))
    m.add(sl.rot(ry=78).at(-0.055, -0.012, 0.165), mat="satin")
    m.icon_rot = (0, -6, -18)
    return m


def bandage():
    m = Model("bandage", "Banana-Leaf Bandage")
    prof = [(0, 0), (0.048, 0), (0.052, 0.004), (0.052, 0.024), (0.0525, 0.03), (0.0525, 0.04), (0.052, 0.046), (0.052, 0.066), (0.048, 0.07), (0.044, 0.07), (0.041, 0.066),
            (0.034, 0.066), (0.031, 0.07), (0.024, 0.07), (0.021, 0.066), (0.014, 0.066), (0.011, 0.058), (0, 0.058)]
    roll = lathe(prof, 20, sharp=45)

    def rc(p):
        r = math.hypot(p.x, p.y)
        if p.z > 0.06:
            return lin(LEAF_HI) if p.z > 0.068 else lin(LEAF_LO)
        if r < 0.02:
            return lin("#2c5a2a")
        if 0.028 < p.z < 0.042:
            return lin("#b4e88a")
        return mix(LEAF_LO, LEAF, 0.35 + p.z / 0.07 * 0.65)
    roll.paint(rc)
    m.add(roll, mat="satin")
    tip = [(0, -0.033), (0.07, -0.033), (0.088, -0.02), (0.1, 0.0), (0.088, 0.02), (0.07, 0.033), (0.0, 0.033)]
    tail = plate(tip, h=0.007, bevel=0.002).rot(rx=90).at(0, -0.0505, 0.035)
    tail.warp(lambda p: (p.x, p.y - 0.9 * max(0.0, p.x - 0.01) ** 1.6, p.z))
    tail.grad(LEAF, LEAF_HI, axis=0)
    m.add(tail.rot(rz=58), mat="satin")
    az = -70
    pad = rcyl(0.023, 0.007, 0.002, 12).rot(rx=90).at(0, -0.0495, 0.036)
    m.add(pad.rot(rz=az + 90), CREAM)
    arm = 0.0115
    cross = [(-arm / 2, -0.0165), (arm / 2, -0.0165), (arm / 2, -arm / 2), (0.0165, -arm / 2), (0.0165, arm / 2),
             (arm / 2, arm / 2), (arm / 2, 0.0165), (-arm / 2, 0.0165), (-arm / 2, arm / 2), (-0.0165, arm / 2),
             (-0.0165, -arm / 2), (-arm / 2, -arm / 2)]
    m.add(plate(cross, h=0.006).rot(rx=90).at(0, -0.0585, 0.036).rot(rz=az + 90), RED)
    m.icon_rot = (10, 0, 6)
    return m


def firstaid():
    m = Model("firstaid", "Jungle First-Aid Kit")
    w, d, h = 0.26, 0.11, 0.105
    body = rbox(w, d, h, 0.007, 1, rv=0.02, segv=2)
    body.grad("#dcd2b6", "#fbf5e6", axis=2)
    m.add(body.at(0, 0, h / 2), mat="satin")
    r = d / 2 + 0.003
    dome = [(-r, -0.004), (r, -0.004)] + [(r * math.cos(math.pi * i / 8), 0.008 + 0.052 * math.sin(math.pi * i / 8)) for i in range(0, 9)]
    lid = plate(dome, h=w + 0.008, bevel=0.006).rot(rx=90).rot(rz=90).at(0, 0, h)
    lid.grad("#b3261f", "#ee4a40", axis=2)
    m.add(lid, mat="gloss")
    a = 0.026
    L = 0.037
    cross = [(-a / 2, -L), (a / 2, -L), (a / 2, -a / 2), (L, -a / 2), (L, a / 2), (a / 2, a / 2), (a / 2, L),
             (-a / 2, L), (-a / 2, a / 2), (-L, a / 2), (-L, -a / 2), (-a / 2, -a / 2)]
    m.add(plate(cross, h=0.012, bevel=0.003).rot(rx=90).at(0, -d / 2 - 0.002, 0.05), RED, "gloss")
    for sx in (-1, 1):
        m.add(rbox(0.026, 0.012, 0.042, 0.003, 1).at(sx * 0.088, -d / 2 - 0.004, h - 0.002), BRASS, "metal")
        m.add(rbox(0.02, 0.016, 0.016, 0.003, 1).at(sx * 0.05, 0, h + 0.062), BRASS, "metal")
    handle = tube([(-0.05, 0, h + 0.062), (-0.05, 0, h + 0.082), (-0.036, 0, h + 0.096), (0.036, 0, h + 0.096),
                   (0.05, 0, h + 0.082), (0.05, 0, h + 0.062)], 0.0085, 6, up=(0, 1, 0))
    m.add(handle, CHAR, "satin")
    lf = leaf(0.07, 0.036, 0.006, 0.2).rot(rx=90).rot(rz=0).rot(ry=-32).at(0.068, -d / 2 - 0.003, 0.024)
    lf.grad(LEAF_LO, LEAF_HI, axis=0)
    m.add(lf, mat="satin")
    return m


def ammo():
    m = Model("ammo", ".45 Rounds")
    w, d, h = 0.12, 0.074, 0.05
    box = rbox(w, d, h, 0.004, 1)
    box.grad("#3f5a33", "#5d8046", axis=2)
    m.add(box.at(0, 0, h / 2))
    m.add(rbox(0.066, d + 0.006, 0.03, 0.002, 1).at(0, 0, 0.023), "#f2c230", "satin")
    m.add(rbox(0.03, d + 0.01, 0.012, 0.001, 1).at(0, 0, 0.023), CHAR)
    m.add(rbox(w - 0.012, d - 0.012, 0.01, 0.0, 1).at(0, 0, h - 0.002), "#22252b")
    r = 0.0098
    for ix in range(5):
        for iy in range(2):
            nose = lathe([(r, 0), (r, 0.006), (r * 0.9, 0.009), (r * 0.62, 0.02), (0, 0.026)], 6, sharp=45)
            nose.paint(lambda p: lin(BRASS) if p.z < 0.0065 else lin("#c97b4a"))
            m.add(nose.at(-0.044 + ix * 0.022, -0.013 + iy * 0.026, h - 0.003), mat="metal")
    flap = rbox(w, 0.005, 0.046, 0.002, 1).at(0, 0, 0.023)
    flap.grad("#5d8046", "#7a9c58", axis=2)
    m.add(flap.rot(rx=-24).at(0, d / 2 - 0.001, h - 0.004))
    loose = bullet(0.0105, 0.044, 8)
    m.add(loose.rot(rx=90).rot(rz=-62).at(0.03, -d / 2 - 0.006, 0.0105), mat="metal")
    m.add(bullet(0.0105, 0.044, 8).rot(rx=90).rot(rz=-118).at(0.074, -d / 2 + 0.004, 0.0105), mat="metal")
    return m


def key():
    m = Model("key", "Vine Key")
    bow = plate(circle_pts(0.056, 14), [circle_pts(0.027, 10)], h=0.024, bevel=0.005)
    bow.paint(lambda p: mix(WOOD_LO, WOOD_HI, 0.3 + 0.7 * _h(round(p.x * 30), round(p.y * 30))))
    m.add(bow.at(-0.1, 0, 0))
    shaft = rcyl(0.0135, 0.2, 0.003, 8).rot(ry=90).at(-0.052, 0, 0)
    shaft.grad(WOOD, WOOD_HI, axis=0)
    m.add(shaft)
    for x in (-0.04, -0.022):
        m.add(torus(0.016, 0.006, 10, 5).rot(ry=90).at(x, 0, 0), WOOD_LO)
    bit = [(0, 0), (0.05, 0), (0.05, -0.052), (0.036, -0.052), (0.036, -0.03), (0.024, -0.03), (0.024, -0.058),
           (0.008, -0.058), (0.008, -0.04), (0, -0.04)]
    b = plate(bit, h=0.018, bevel=0.003)
    b.grad(WOOD_LO, WOOD, axis=1)
    m.add(b.at(0.09, 0.004, 0))
    m.add(ball(0.017, 8, 5).sc(0.7, 1, 1).at(0.15, 0, 0), WOOD_LO)
    vine = tube([(z - 0.03, x, y) for x, y, z in helix_pts(0.0185, 0.034, 3.4, 10, a0=1.0)], 0.0055, 5)
    vine.paint_t(lambda t: mix("#3c8a34", "#6cc24a", 0.5 + 0.5 * math.sin(t * 40)))
    m.add(vine)
    for (x, y, rz, ry, s) in ((-0.01, 0.009, 60, -30, 1.0), (0.04, -0.009, -115, -30, 0.85), (0.075, 0.009, 40, -30, 0.75)):
        lf = leaf(0.06 * s, 0.032 * s, 0.005).rot(ry=ry).rot(rz=rz).at(x, y, 0.008)
        lf.grad(LEAF_LO, LEAF_HI, axis=2)
        m.add(lf, mat="satin")
    m.icon_rot = (62, 0, 38)
    return m


def extmag():
    m = Model("extmag", "Kingpin Extended Mag")
    h = 0.2
    shear = 0.2

    def lean(p):
        return (p.x + p.z * shear, p.y, p.z)
    body = rbox(0.062, 0.03, h + 0.012, 0.005, 1).at(0, 0, (h + 0.012) / 2 + 0.008)
    body.grad("#4d545f", "#8d96a3", axis=2)
    m.add(body.warp(lean), mat="metal")
    sleeve = rbox(0.07, 0.038, 0.06, 0.004, 1).at(0, 0, 0.0535)
    sleeve.grad(GOLD_LO, GOLD, axis=2)
    m.add(sleeve.warp(lean), mat="metal")
    m.add(rbox(0.082, 0.046, 0.022, 0.005, 1).at(0.004, 0, 0.011).warp(lean), CHAR, "satin")
    m.add(rbox(0.008, 0.034, h - 0.07, 0.002, 1).at(-0.031, 0, h / 2 + 0.05).warp(lean), "#3a4049", "metal")
    for i in range(5):
        hole = rcyl(0.0065, 0.006, 0.001, 8).rot(rx=90).at(0.008, -0.011, 0.1 + i * 0.022)
        m.add(hole.warp(lean), "#15171b")
    rnd = bullet(0.0115, 0.046, 8).rot(ry=90).at(-0.02, 0, h + 0.022)
    m.add(rnd.warp(lean), mat="metal")
    for sy in (-1, 1):
        m.add(rbox(0.044, 0.004, 0.012, 0.001, 1).at(-0.004, sy * 0.0165, h + 0.02).warp(lean), "#7a8390", "metal")
    crown = [(-0.012, -0.007), (0.012, -0.007), (0.014, 0.008), (0.007, 0.001), (0.0, 0.01), (-0.007, 0.001), (-0.014, 0.008)]
    m.add(plate([(x * 1.4, y * 1.4) for x, y in crown], h=0.005).rot(rx=90).at(0, -0.02, 0.0535).warp(lean), CHAR)
    m.icon_rot = (0, -14, 20)
    return m


ALL = [bunch, coconut, rope, plank, golden, honey, gear, spring, boomerang, mango, compass, idol, smoothie,
       bandage, firstaid, ammo, key, extmag]
