"""The 18 first wearables plus the suit icon (ids match src/game/actors/wearables.ts; the G1-23 loot gear icons are
staged from the rig meshes by icon_gear.py). Worn orientation: front faces -Y, Z up.

Hats are sized for a ~0.1 m head radius and have a closed underside (they are icon / ground-pickup
props, not the fitted rig meshes).
"""
import math

from kit import (Model, Part, ball, banana, circle_pts, lathe, leaf, lin, mix, plate, rbox, rcyl, rrect_pts,
                 torus, tube)

FELT, FELT_HI = "#25272f", "#434756"
GOLD, GOLD_HI, GOLD_LO = "#ffc531", "#ffe08a", "#b8791a"
RED, CREAM, CHAR = "#d8362f", "#f6efe0", "#2c2f38"
YEL = "#f8cc35"
LEAF_LO, LEAF_HI = "#2f7d32", "#8fd66a"


def band(r0, z0, r1, z1, t=0.004, seg=24):
    """A ribbon wrapped round a lathe body; both ends tuck inside it."""
    return lathe([(r0 - 0.008, z0 - 0.002), (r0 + t, z0), (r1 + t, z1), (r1 - 0.008, z1 + 0.002)], seg, sharp=50)


def dense(outline, maxlen):
    out = []
    n = len(outline)
    for i in range(n):
        a, b = outline[i], outline[(i + 1) % n]
        k = max(1, int(math.ceil(math.hypot(b[0] - a[0], b[1] - a[1]) / maxlen)))
        for j in range(k):
            out.append((a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k))
    return out


def wrap(part, R):
    """Bend a front-facing part (lying in the XZ plane at y~0) round a vertical axis at y=+R."""
    def f(p):
        a = p.x / R
        rr = R - p.y
        return (rr * math.sin(a), R - rr * math.cos(a), p.z)
    return part.warp(f)


def _arm(sx, x, z, colour_part=None, ln=0.13, w=0.007, h=0.011):
    a = rbox(w, ln, h, 0.002, 1).at(sx * x, ln / 2 - 0.004, z)
    return a.warp(lambda p: (p.x - sx * 0.06 * p.y, p.y, p.z - 3.2 * max(0.0, p.y - 0.085) ** 1.6))


# ---------------------------------------------------------------- head
def bowler():
    m = Model("bowler", "Bowler Hat")
    crown = lathe([(0.099, 0), (0.101, 0.03), (0.098, 0.07), (0.086, 0.1), (0.062, 0.122), (0.032, 0.133), (0, 0.136)], 24, sharp=60)
    crown.grad(FELT, FELT_HI, axis=2)
    m.add(crown, mat="satin")
    brim = lathe([(0.09, -0.004), (0.136, -0.004), (0.152, 0.004), (0.158, 0.018), (0.153, 0.024), (0.136, 0.01), (0.09, 0.01)], 32, sharp=75)
    brim.warp(lambda p: (p.x, p.y * 1.06, p.z + 0.022 * (p.x / 0.155) ** 2))
    brim.grad("#1d1f26", FELT_HI, axis=2)
    m.add(brim, mat="satin")
    m.add(band(0.1, 0.01, 0.1005, 0.036), "#a3283a", "satin")
    m.add(rbox(0.012, 0.03, 0.03, 0.003, 1).at(0.104, -0.02, 0.023), "#b23445", "satin")
    return m


def tophat():
    m = Model("tophat", "Top Hat")
    crown = lathe([(0.093, 0), (0.09, 0.02), (0.093, 0.15), (0.101, 0.178), (0.098, 0.185), (0, 0.185)], 24, sharp=45)
    crown.grad(FELT, FELT_HI, axis=2)
    m.add(crown, mat="satin")
    brim = lathe([(0.086, -0.004), (0.142, -0.004), (0.153, 0.004), (0.142, 0.011), (0.086, 0.009)], 32, sharp=75)
    brim.warp(lambda p: (p.x, p.y, p.z + 0.03 * (p.x / 0.15) ** 2))
    brim.grad("#1d1f26", FELT_HI, axis=2)
    m.add(brim, mat="satin")
    m.add(band(0.092, 0.012, 0.0905, 0.05), RED, "satin")
    buckle = plate(rrect_pts(0.04, 0.034, 0.006, 2), [rrect_pts(0.024, 0.018, 0.003, 1)], h=0.008, bevel=0.002)
    m.add(buckle.rot(rx=90).at(0, -0.097, 0.031), GOLD, "metal")
    return m


def fedora():
    m = Model("fedora", "Fedora")
    felt, felt_hi = "#7d6248", "#b0906a"
    crown = lathe([(0.1, 0), (0.102, 0.03), (0.099, 0.075), (0.09, 0.1), (0.062, 0.114), (0.03, 0.116), (0, 0.116)], 24, sharp=60)

    def crease(p):
        if p.z < 0.045:
            return p
        k = (p.z - 0.045) / 0.07
        front = max(0.0, -p.y / 0.1)
        return (p.x * (1 - 0.44 * k * front), p.y,
                p.z - 0.038 * k * math.exp(-(p.x / 0.034) ** 2) - 0.014 * k * front)
    crown.warp(crease)
    crown.grad(felt, felt_hi, axis=2)
    m.add(crown)
    brim = lathe([(0.09, -0.004), (0.168, -0.006), (0.18, 0.0), (0.168, 0.007), (0.09, 0.01)], 32, sharp=75)
    brim.warp(lambda p: (p.x, p.y, p.z - 0.03 * max(0.0, -p.y / 0.17) ** 2 + 0.024 * max(0.0, p.y / 0.17) ** 2
                         + 0.014 * (p.x / 0.17) ** 2))
    brim.grad("#6a523b", felt_hi, axis=2)
    m.add(brim)
    m.add(band(0.1005, 0.01, 0.1015, 0.04), "#3b2c22", "satin")
    fe = leaf(0.085, 0.03, 0.005, 0.15).rot(rx=90).rot(ry=-62).rot(rz=8).at(0.097, -0.022, 0.03)
    fe.grad("#e0a51f", "#ffe169", axis=2)
    m.add(fe, mat="satin")
    return m


def cap():
    m = Model("cap", "Cap")
    blue, blue_hi = "#2a6fb5", "#4f9be0"
    crown = lathe([(0.1, 0), (0.1, 0.03), (0.093, 0.066), (0.072, 0.093), (0.038, 0.108), (0, 0.112)], 20, sharp=60)
    crown.grad(blue, blue_hi, axis=2)
    m.add(crown)
    outer = [(0.1 * math.cos(a), -0.03 + 0.165 * math.sin(a)) for a in (math.radians(185 + 170 * i / 10) for i in range(11))]
    inner = [(0.09 * math.cos(a), 0.09 * math.sin(a)) for a in (math.radians(350 - 160 * i / 8) for i in range(9))]
    bill = plate(outer + inner, h=0.009, bevel=0.003)
    bill.warp(lambda p: (p.x, p.y, p.z + 0.008 - 0.03 * (p.x / 0.1) ** 2 - 0.16 * max(0.0, -p.y - 0.08)))
    bill.paint(lambda p: lin(YEL) if p.z > 0 else lin("#e3a51f"))
    m.add(bill, mat="satin")
    m.add(ball(0.013, 8, 4).sc(1, 1, 0.6).at(0, 0, 0.113), YEL, "satin")
    patch = rcyl(0.034, 0.008, 0.002, 12).rot(rx=90).at(0, -0.0945, 0.048)
    m.add(patch, CREAM)
    nb = banana(0.052, 0.0075, 85, seg=5, n=6)
    lo, hi = nb.bounds()
    m.add(nb.at(-(lo.x + hi.x) / 2, 0, -(lo.z + hi.z) / 2).rot(ry=-48).at(0, -0.104, 0.048), mat="satin")
    return m


def hardhat():
    m = Model("hardhat", "Hard Hat")
    y0, y1 = "#eeb313", "#ffd541"
    dome = lathe([(0.105, 0), (0.106, 0.03), (0.1, 0.07), (0.08, 0.102), (0.042, 0.121), (0, 0.126)], 20, sharp=60)
    dome.grad(y0, y1, axis=2)
    m.add(dome, mat="gloss")
    brim = lathe([(0.098, -0.004), (0.118, -0.004), (0.123, 0.002), (0.118, 0.008), (0.098, 0.012)], 20, sharp=60)
    brim.warp(lambda p: (p.x, p.y * (1 + 0.42 * max(0.0, -p.y / 0.12) ** 1.5), p.z))
    brim.grad("#d99c0c", y1, axis=2)
    m.add(brim, mat="gloss")
    for x0, f, r in ((0.0, 1.0, 0.011), (-0.046, 0.9, 0.009), (0.046, 0.9, 0.009)):
        pts = [(x0, -0.1 * f * math.cos(a), 0.02 + 0.107 * f * math.sin(a) ** 0.85)
               for a in (math.radians(14 + 152 * i / 9) for i in range(10))]
        rib = tube(pts, r, 6, up=(1, 0, 0))
        rib.grad(y0, "#fff0a0", axis=2)
        m.add(rib, mat="gloss")
    badge = plate(rrect_pts(0.044, 0.03, 0.006, 2), h=0.008, bevel=0.002).rot(rx=90).rot(rx=-12).at(0, -0.1, 0.045)
    m.add(badge, CREAM, "satin")
    m.add(rbox(0.03, 0.006, 0.008, 0.001, 1).rot(rx=-12).at(0, -0.1045, 0.045), CHAR)
    return m


def pith():
    m = Model("pith", "Pith Helmet")
    k0, k1 = "#b59c62", "#e0cf9c"
    dome = lathe([(0.1, 0), (0.104, 0.02), (0.1, 0.07), (0.086, 0.105), (0.056, 0.13), (0.022, 0.142), (0, 0.144)], 24, sharp=60)
    dome.grad(k0, k1, axis=2)
    m.add(dome)
    brim = lathe([(0.092, 0.014), (0.15, -0.02), (0.172, -0.036), (0.176, -0.031), (0.152, -0.01), (0.096, 0.026)], 32, sharp=75)
    brim.warp(lambda p: (p.x, p.y * (1.12 if p.y < 0 else 1.3), p.z))
    brim.grad("#a38a52", k1, axis=2)
    m.add(brim)
    m.add(band(0.103, 0.026, 0.1, 0.056, t=0.005), "#7a4f28", "satin")
    m.add(rcyl(0.016, 0.014, 0.004, 8).at(0, 0, 0.14), k0)
    pts = [(0, -0.099 * math.cos(a), 0.058 + 0.086 * math.sin(a)) for a in (math.radians(8 + 164 * i / 8) for i in range(9))]
    m.add(tube(pts, 0.006, 5, up=(1, 0, 0)), "#c9b47c")
    m.add(rcyl(0.02, 0.008, 0.002, 10).rot(rx=90).at(0, -0.105, 0.041), GOLD, "metal")
    return m


def beanie():
    m = Model("beanie", "Beanie")
    t0, t1 = "#1f8a7d", "#3cc0ad"
    dome = lathe([(0.1, 0.02), (0.104, 0.05), (0.1, 0.085), (0.085, 0.115), (0.052, 0.138), (0, 0.146)], 16, sharp=70)

    def knit(p):
        k = round(math.degrees(math.atan2(p.y, p.x)) / 22.5) % 2
        stripe = 0.078 < p.z < 0.092
        base = mix(t0, t1, 0.25 + 0.6 * k)
        return mix("#efe6cf", "#cfc3a6", k) if stripe else base
    dome.paint(knit)
    dome.warp(lambda p: (p.x + 0.02 * max(0.0, (p.z - 0.08) / 0.07) ** 2, p.y, p.z))
    m.add(dome)
    cuff = lathe([(0.094, -0.002), (0.112, 0.0), (0.116, 0.022), (0.112, 0.044), (0.096, 0.048)], 16, sharp=70)
    cuff.paint(lambda p: mix("#cfc3a6", "#efe6cf", (round(math.degrees(math.atan2(p.y, p.x)) / 22.5) % 2)))
    m.add(cuff)
    pom = ball(0.036, 10, 6)
    pom.warp(lambda p: p * (1 + 0.12 * math.sin(p.x * 260) * math.sin(p.y * 240 + 1) * math.sin(p.z * 250 + 2)))
    pom.grad("#c9bea2", "#f6efe0", axis=2)
    m.add(pom.at(0.02, 0, 0.168))
    return m


def crown():
    m = Model("crown", "Crown")
    N, R, t = 30, 0.095, 0.013
    hs = (1.0, 0.56, 0.24, 0.12, 0.24, 0.56)
    verts, faces = [], []
    for i in range(N):
        a = math.tau * i / N
        hh = 0.05 + 0.06 * hs[i % 6]
        fl = 1 + 0.2 * (hh / 0.11)
        ca, sa = math.cos(a), math.sin(a)
        verts += [(R * ca, R * sa, 0), (R * fl * ca, R * fl * sa, hh), ((R * fl - t) * ca, (R * fl - t) * sa, hh),
                  ((R - t) * ca, (R - t) * sa, 0)]
    for i in range(N):
        j = (i + 1) % N
        for k in range(4):
            faces.append((4 * i + k, 4 * j + k, 4 * j + (k + 1) % 4, 4 * i + (k + 1) % 4))
    ring = Part(verts, faces, sharp=38)
    ring.grad(GOLD_LO, GOLD_HI, axis=2, power=0.8)
    m.add(ring.rot(rz=-90), mat="metal")
    m.add(torus(R + 0.001, 0.0095, 20, 6).at(0, 0, 0.009), GOLD, "metal")
    gems = ("#e23a52", "#3aa0e2", "#3fc46a", "#b05ae0", "#3aa0e2")
    for i in range(5):
        a = math.tau * i / 5 - math.pi / 2
        ca, sa = math.cos(a), math.sin(a)
        rt = R * 1.2
        m.add(ball(0.0135, 8, 5).at(rt * ca, rt * sa, 0.116), GOLD_HI, "metal")
        rg = R * 1.075
        m.add(ball(0.016, 8, 5).sc(1, 1, 1.25).at(rg * ca, rg * sa, 0.04), gems[i], "gloss")
    cap_ = lathe([(0.086, 0.012), (0.084, 0.05), (0.06, 0.078), (0.026, 0.09), (0, 0.092)], 12, sharp=60)
    cap_.grad("#7d1626", "#c72c40", axis=2)
    m.add(cap_)
    return m


# ---------------------------------------------------------------- face
def _lens_pair(m, outline_fn, hole_fn, lens_fn, cx, frame_col, lens_cols, frame_h=0.013, bevel=0.0025):
    for sx in (-1, 1):
        fr = plate(outline_fn(sx), [hole_fn(sx)], h=frame_h, bevel=bevel).rot(rx=90)
        m.add(fr, frame_col, "gloss")
        ln = plate(lens_fn(sx), h=0.004).rot(rx=90)
        ln.grad(lens_cols[0], lens_cols[1], axis=2)
        m.add(ln, mat="gloss")


def shades():
    m = Model("shades", "Shades")
    fr = "#1b1d23"

    def trap(pts, sx):
        cx = sx * 0.038
        return [(cx + (x - cx) * (1 + 0.14 * y / 0.026), y) for x, y in pts]
    _lens_pair(m, lambda sx: trap(rrect_pts(0.066, 0.052, 0.015, 3, sx * 0.038), sx),
               lambda sx: trap(rrect_pts(0.05, 0.036, 0.009, 2, sx * 0.038), sx),
               lambda sx: trap(rrect_pts(0.055, 0.041, 0.01, 2, sx * 0.038), sx), 0.038, fr, ("#3f7fb0", "#12283d"))
    m.add(rbox(0.03, 0.007, 0.012, 0.002, 1).at(0, 0, 0.012), fr, "gloss")
    for sx in (-1, 1):
        m.add(_arm(sx, 0.074, 0.014, ln=0.135, w=0.008, h=0.014), fr, "gloss")
        m.add(rcyl(0.0035, 0.006, 0.001, 6).rot(rx=90).at(sx * 0.064, -0.004, 0.017), "#c9ced6", "metal")
    m.icon_rot = (0, 0, 14)
    m.size_class = 0.8
    return m


def aviators():
    m = Model("aviators", "Aviators")

    def drop(sx, s=1.0, n=14):
        out = []
        for i in range(n):
            a = math.tau * i / n
            x, y = 0.036 * math.cos(a), 0.03 * math.sin(a)
            if y < 0:
                y *= 1.22
                x += sx * 0.009 * (-math.sin(a))
            else:
                y *= 0.8
            out.append((sx * 0.042 + x * s, y * s))
        return out
    for sx in (-1, 1):
        rimp = tube([(x, y, 0.0) for x, y in drop(sx)], 0.0034, 5, closed=True, up=(0, 0, 1)).rot(rx=90)
        m.add(rimp, GOLD, "metal")
        ln = plate(drop(sx, 0.97), h=0.0035).rot(rx=90)
        ln.grad("#d59a3a", "#2f5a4a", axis=2)
        m.add(ln, mat="gloss")
        arm = tube([(sx * 0.079, 0.0, 0.012), (sx * 0.08, 0.06, 0.014), (sx * 0.077, 0.105, 0.012), (sx * 0.074, 0.13, -0.006)],
                   0.003, 5)
        m.add(arm, GOLD, "metal")
        m.add(ball(0.0055, 6, 4).at(sx * 0.011, -0.004, -0.014), "#f4e9d2", "satin")
    m.add(tube([(-0.03, 0, 0.0235), (0.03, 0, 0.0235)], 0.0032, 5, cap="flat"), GOLD, "metal")
    m.add(tube([(-0.011, 0, 0.004), (0, 0, 0.012), (0.011, 0, 0.004)], 0.0032, 5, cap="flat"), GOLD, "metal")
    m.icon_rot = (0, 0, 14)
    m.size_class = 0.8
    return m


def monocle():
    m = Model("monocle", "Monocle")
    m.add(torus(0.046, 0.0075, 18, 6).rot(rx=90), GOLD, "metal")
    ln = plate(circle_pts(0.044, 16), h=0.004).rot(rx=90)
    ln.grad("#8fd0ea", "#e4f6fd", axis=2)
    m.add(ln, mat="gloss")
    glint = plate([(-0.02, 0.004), (-0.004, 0.024), (0.004, 0.024), (-0.012, 0.004)], h=0.003).rot(rx=90).at(-0.004, -0.0025, 0)
    m.add(glint, "#ffffff", "gloss")
    m.add(torus(0.009, 0.003, 8, 5).rot(rx=90).at(0.047, 0, -0.03), GOLD_LO, "metal")
    n = 12
    path = []
    for i in range(n + 1):
        t = i / n
        path.append((0.052 + 0.1 * t, 0.0, -0.036 - 0.085 * math.sin(math.pi * t) ** 0.9 + 0.035 * t))
    m.add(tube(path, 0.0026, 4), GOLD_LO, "metal")
    for p in path[1:-1]:
        m.add(ball(0.0058, 6, 4).at(*p), GOLD, "metal")
    end = path[-1]
    m.add(torus(0.012, 0.0038, 10, 5).rot(rx=90).at(end[0] + 0.012, 0, end[2] + 0.004), GOLD, "metal")
    m.icon_rot = (0, 0, 10)
    return m


def eyepatch():
    m = Model("eyepatch", "Eyepatch")
    patch = ball(1.0, 20, 8).sc(0.062, 0.017, 0.056)
    patch.warp(lambda p: (p.x * (0.7 + 0.36 * (p.z + 0.056) / 0.112), p.y, p.z))
    patch.grad("#1c1e25", "#3d4250", axis=2)
    m.add(patch.at(0, -0.006, 0), mat="satin")
    rx_, ry_ = 0.088, 0.07
    loop = tube([(rx_ * math.sin(a), ry_ - ry_ * math.cos(a), 0.0) for a in (math.tau * i / 20 for i in range(20))],
                0.0075, 6, closed=True, squash=(1.0, 0.35), up=(0, 0, 1))
    loop.rot(ry=-26).at(0.01, 0, 0.016)
    m.add(loop, "#2a2d37", "satin")
    nb = banana(0.066, 0.0085, 85, seg=5, n=6, yellow=GOLD, stem=GOLD_LO, tip=GOLD_LO)
    lo, hi = nb.bounds()
    m.add(nb.at(-(lo.x + hi.x) / 2, 0, -(lo.z + hi.z) / 2).rot(ry=-48).at(0, -0.0245, 0.004), mat="metal")
    m.icon_rot = (0, 0, 8)
    m.size_class = 0.78
    return m


def goggles():
    m = Model("goggles", "Ski Goggles")
    R = 0.105

    def shape(w, h, r, notch):
        pts = rrect_pts(w, h, r, 3)
        out = []
        for x, y in dense(pts, 0.018):
            if y < 0:
                y += notch * math.exp(-(x / 0.022) ** 2)
            out.append((x, y))
        return out
    fr = plate(shape(0.2, 0.094, 0.036, 0.024), [shape(0.172, 0.066, 0.026, 0.02)], h=0.022, bevel=0.004).rot(rx=90)
    fr.grad("#c9d0da", "#f4f6f9", axis=2)
    m.add(wrap(fr, R), mat="gloss")
    ln = plate(shape(0.178, 0.072, 0.028, 0.02), h=0.006).rot(rx=90).at(0, -0.002, 0)
    ln.paint(lambda p: mix(mix("#ff5a8a", "#ffb02e", (p.z + 0.036) / 0.072), "#fff0c0", 0.5 * max(0.0, -p.x / 0.09)))
    m.add(wrap(ln, R), mat="gloss")
    strap = tube([(0.106 * math.sin(a), R - 0.004 - 0.112 * math.cos(a), 0.0) for a in (math.radians(58 + 244 * i / 16) for i in range(17))],
                 0.02, 6, squash=(1.0, 0.2), up=(0, 0, 1), cap="flat")
    strap.paint(lambda p: lin(YEL) if abs(p.z) < 0.008 else lin("#27336e"))
    m.add(strap, mat="satin")
    m.icon_rot = (0, 0, 16)
    m.size_class = 0.82
    return m


def heartglasses():
    m = Model("heartglasses", "Heart Glasses")

    def heart(sx, s, n=18):
        out = []
        for i in range(n):
            t = math.tau * i / n
            x = 16 * math.sin(t) ** 3
            y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t) + 2.5
            out.append((sx * 0.041 + x * s / 16, y * s / 16))
        return out
    _lens_pair(m, lambda sx: heart(sx, 0.038), lambda sx: heart(sx, 0.027), lambda sx: heart(sx, 0.03), 0.041,
               "#e0314b", ("#ffd0de", "#ff6f9c"), frame_h=0.014, bevel=0.003)
    m.add(rbox(0.024, 0.01, 0.01, 0.003, 1).at(0, 0, 0.012), "#e0314b", "gloss")
    for sx in (-1, 1):
        m.add(_arm(sx, 0.074, 0.016, ln=0.135, w=0.008, h=0.012), "#c2223b", "gloss")
    m.icon_rot = (0, 0, 14)
    m.size_class = 0.8
    return m


def banditmask():
    m = Model("banditmask", "Bandit Mask")
    R = 0.105
    half = [(0.0, 0.021), (0.03, 0.031), (0.07, 0.036), (0.106, 0.044), (0.12, 0.026), (0.102, -0.01), (0.072, -0.03),
            (0.042, -0.035), (0.02, -0.024), (0.0, -0.008)]
    outline = half + [(-x, y) for x, y in reversed(half[1:-1])]

    def eye(sx):
        out = []
        for i in range(10):
            a = math.tau * i / 10
            x, y = 0.027 * math.cos(a), 0.0155 * math.sin(a) * (1.0 if math.sin(a) > 0 else 0.8)
            c, s = math.cos(sx * 0.2), math.sin(sx * 0.2)
            out.append((sx * 0.05 + x * c - y * s, 0.004 + x * s + y * c))
        return out
    mask = plate(dense(outline, 0.016), [eye(-1), eye(1)], h=0.009, bevel=0.0025).rot(rx=90)
    mask.grad("#2b2d52", "#5c62a0", axis=2)
    m.add(wrap(mask, R), mat="satin")
    c63 = math.cos(math.radians(63))
    loop = tube([(0.105 * math.sin(a), 0.0573 + 0.058 * (c63 - math.cos(a)), 0.008) for a in (math.radians(63 + 234 * i / 14) for i in range(15))],
                0.009, 6, squash=(1.0, 0.25), up=(0, 0, 1), cap="flat")
    m.add(loop, "#34376a", "satin")
    kx, ky = 0.105 * math.sin(math.radians(132)), 0.0573 + 0.058 * (c63 - math.cos(math.radians(132)))
    m.add(ball(0.017, 8, 5).at(kx, ky, 0.008), "#454a8a", "satin")
    for dx, dy, dz in ((0.075, -0.02, -0.05), (0.05, 0.03, -0.085)):
        tail = tube([(kx, ky, 0.008), (kx + dx * 0.5, ky + dy * 0.5, 0.008 + dz * 0.3), (kx + dx, ky + dy, 0.008 + dz)],
                    lambda t: 0.009 + 0.012 * t, 6, squash=(1.0, 0.3), up=(0, 1, 0))
        tail.grad("#2b2d52", "#5c62a0", axis=2)
        m.add(tail, mat="satin")
    m.icon_rot = (0, 0, 12)
    m.size_class = 0.84
    return m


# ---------------------------------------------------------------- back
def satchel():
    m = Model("satchel", "Satchel")
    l0, l1, dark = "#96592e", "#c98450", "#6e3f20"
    body = rbox(0.25, 0.09, 0.17, 0.012, 2, rv=0.03, segv=3)
    body.grad(l0, l1, axis=2)
    m.add(body.at(0, 0, 0.085), mat="satin")
    w, h, r = 0.262, 0.12, 0.04
    fl = [(-w / 2, h / 2), (w / 2, h / 2)]
    for cx, a0 in ((w / 2 - r, 0), (-(w / 2 - r), -90)):
        for i in range(5):
            a = math.radians(a0 - 90 * i / 4)
            fl.append((cx + r * math.cos(a), -h / 2 + r + r * math.sin(a)))
    flap = plate(fl, h=0.016, bevel=0.004).rot(rx=90).at(0, -0.049, 0.118)
    flap.grad(dark, "#a5633a", axis=2)
    m.add(flap, mat="satin")
    top = rbox(0.262, 0.106, 0.018, 0.006, 1, rv=0.03, segv=2).at(0, -0.002, 0.172)
    m.add(top, "#a5633a", "satin")
    m.add(rbox(0.03, 0.012, 0.085, 0.003, 1).at(0, -0.058, 0.082), dark, "satin")
    bk = plate(rrect_pts(0.05, 0.04, 0.008, 2), [rrect_pts(0.03, 0.02, 0.004, 1)], h=0.008, bevel=0.002)
    m.add(bk.rot(rx=90).at(0, -0.064, 0.072), "#e3b04c", "metal")
    strap = tube([(0.128 * math.cos(a), 0.0, 0.14 + 0.13 * math.sin(a)) for a in (math.pi * i / 12 for i in range(13))],
                 0.013, 6, squash=(0.3, 1.0), up=(0, 1, 0), cap="flat")
    m.add(strap, dark, "satin")
    for sx in (-1, 1):
        m.add(rbox(0.012, 0.034, 0.03, 0.003, 1).at(sx * 0.126, 0, 0.14), "#e3b04c", "metal")
    return m


def bigpack():
    m = Model("bigpack", "Big Backpack")
    g0, g1, tan = "#3f6a3a", "#6c9a55", "#c9a15a"
    body = rbox(0.27, 0.17, 0.36, 0.02, 2, rv=0.05, segv=3).at(0, 0, 0.18)
    body.warp(lambda p: (p.x * (1 - 0.14 * p.z / 0.36), p.y * (1 - 0.1 * p.z / 0.36), p.z))
    body.grad(g0, g1, axis=2)
    m.add(body)
    lid = rbox(0.25, 0.18, 0.075, 0.02, 2, rv=0.05, segv=2).at(0, -0.004, 0.375)
    lid.grad("#335a30", "#57854a", axis=2)
    m.add(lid)
    pocket = rbox(0.17, 0.07, 0.14, 0.008, 1, rv=0.022, segv=2).at(0, -0.1, 0.105)
    pocket.grad("#9a7b3f", tan, axis=2)
    m.add(pocket)
    m.add(rbox(0.184, 0.078, 0.045, 0.008, 1, rv=0.024, segv=2).at(0, -0.1, 0.168), "#8a6c34")
    m.add(ball(0.011, 8, 4).sc(1, 0.6, 1).at(0, -0.139, 0.156), "#e3b04c", "metal")
    for sx in (-1, 1):
        sp = rbox(0.055, 0.1, 0.13, 0.01, 1, rv=0.022, segv=2).at(sx * 0.14, 0, 0.09)
        sp.grad("#335a30", "#57854a", axis=2)
        m.add(sp)
        st = tube([(sx * 0.07, 0.07, 0.35), (sx * 0.085, 0.13, 0.3), (sx * 0.09, 0.15, 0.2), (sx * 0.085, 0.13, 0.09), (sx * 0.075, 0.075, 0.03)],
                  0.02, 6, squash=(1.0, 0.35), up=(1, 0, 0), cap="flat")
        m.add(st, "#7a5a2c", "satin")
        m.add(rbox(0.026, 0.012, 0.11, 0.003, 1).at(sx * 0.06, -0.092, 0.37), tan, "satin")
    roll = rcyl(0.052, 0.31, 0.01, 12).rot(ry=90).at(-0.155, 0, 0.455)
    roll.paint(lambda p: lin("#e3a51f") if abs(p.x) > 0.15 else lin(YEL))
    m.add(roll, mat="satin")
    for sx in (-1, 1):
        m.add(torus(0.053, 0.007, 12, 5).rot(ry=90).at(sx * 0.085, 0, 0.455), "#7a5a2c", "satin")
    m.icon_rot = (0, 0, -6)
    return m


def cratepack():
    m = Model("cratepack", "Banana Crate Pack")
    W, D, H = 0.3, 0.2, 0.2
    shades = ("#c08a4c", "#b07a40", "#cf9a5a", "#a87238", "#c69252", "#b88446")
    k = 0
    for iz in range(3):
        z = 0.034 + iz * 0.068
        for sy in (-1, 1):
            m.add(rbox(W, 0.016, 0.056, 0.004, 1).at(0, sy * (D / 2 - 0.008), z), shades[k % 6])
            k += 1
        for sx in (-1, 1):
            m.add(rbox(0.016, D - 0.04, 0.05, 0.004, 1).at(sx * (W / 2 - 0.008), 0, z), shades[k % 6])
            k += 1
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.add(rbox(0.03, 0.03, H + 0.012, 0.005, 1).at(sx * (W / 2 - 0.006), sy * (D / 2 - 0.006), (H + 0.012) / 2), "#8a5a30")
    m.add(rbox(W - 0.024, D - 0.024, H - 0.02, 0.0, 1).at(0, 0, (H - 0.02) / 2 + 0.004), "#3a2a1c")
    lay = ((-0.07, -0.03, 0, 100), (0.0, -0.045, 8, 84), (0.075, -0.03, -6, 98), (-0.035, 0.03, 4, 92), (0.045, 0.035, -8, 88))
    for i, (x, y, rz, bend) in enumerate(lay):
        b = banana(0.19, 0.027, bend, seg=6, n=6, yellow=mix(YEL, "#ffe169", 0.25 * (i % 3)))
        lo, hi = b.bounds()
        b.at(-(lo.x + hi.x) / 2, 0, -hi.z).sc(1, 1, -1).rot(rz=90 + rz).rot(ry=4 * (i - 2)).at(x, y, H - 0.02 + 0.012 * (i % 2))
        m.add(b, mat="satin")
    for sx in (-1, 1):
        st = tube([(sx * 0.08, D / 2 - 0.004, H - 0.01), (sx * 0.085, D / 2 + 0.06, H - 0.04), (sx * 0.088, D / 2 + 0.08, H / 2),
                   (sx * 0.085, D / 2 + 0.06, 0.05), (sx * 0.08, D / 2 - 0.004, 0.02)], 0.02, 6, squash=(1.0, 0.3), up=(1, 0, 0), cap="flat")
        m.add(st, "#7a4a26", "satin")
    lf = leaf(0.11, 0.06, 0.006, 0.2).rot(rx=90).rot(ry=-20).at(-0.035, -D / 2 - 0.003, 0.092)
    lf.grad(LEAF_LO, LEAF_HI, axis=0)
    m.add(lf, mat="satin")
    m.icon_rot = (0, 0, -8)
    return m


# ---------------------------------------------------------------- body
def suit():
    """The Businessman's Suit (G1-23: the bound body piece): the charcoal jacket on a wooden hanger, white shirt,
    wide orange tie, gold buttons. Icon only: on the rig the suit is the body itself, tailored in the creator."""
    m = Model("suit", "Businessman's Suit")
    c0, c1, lap, shirt, tie = "#3f3b3b", "#5a5454", "#343030", "#f6f2ea", "#f46a10"
    body = plate([(-0.17, 0.0), (0.17, 0.0), (0.19, 0.03), (0.195, 0.3), (0.215, 0.365), (0.14, 0.42), (0.065, 0.445), (-0.065, 0.445),
                  (-0.14, 0.42), (-0.215, 0.365), (-0.195, 0.3), (-0.19, 0.03)], h=0.075, bevel=0.016).rot(rx=90)
    body.grad(c0, c1, axis=2)
    m.add(body, mat="satin")
    for sx in (-1, 1):
        sl = rbox(0.092, 0.066, 0.36, 0.014, 2, rv=0.028, segv=2).rot(ry=sx * -11).at(sx * 0.243, 0.004, 0.2)
        sl.grad(c0, c1, axis=2)
        m.add(sl, mat="satin")
        m.add(rbox(0.07, 0.05, 0.022, 0.006, 1, rv=0.02, segv=2).rot(ry=sx * -11).at(sx * 0.277, 0.004, 0.022), shirt, "satin")
        lp = plate([(sx * 0.008, 0.2), (sx * 0.085, 0.3), (sx * 0.112, 0.442), (sx * 0.06, 0.45)], h=0.018, bevel=0.004).rot(rx=90).at(0, -0.042, 0)
        m.add(lp, lap, "satin")
        m.add(rbox(0.085, 0.012, 0.02, 0.004, 1).at(sx * 0.1, -0.04, 0.115), lap, "satin")            # pocket flap
    m.add(plate([(-0.062, 0.447), (0.062, 0.447), (0.0, 0.215)], h=0.012, bevel=0.002).rot(rx=90).at(0, -0.037, 0), shirt, "satin")
    m.add(plate([(-0.02, 0.41), (0.02, 0.41), (0.036, 0.275), (0.0, 0.232), (-0.036, 0.275)], h=0.014, bevel=0.003).rot(rx=90).at(0, -0.047, 0), tie, "satin")
    m.add(rbox(0.05, 0.022, 0.04, 0.008, 1).at(0, -0.05, 0.424), tie, "satin")
    for z in (0.17, 0.115):
        m.add(ball(0.013, 10, 6).at(0.004, -0.043, z), GOLD, "metal")
    m.add(plate([(0.095, 0.3), (0.15, 0.3), (0.155, 0.325), (0.125, 0.345), (0.098, 0.325)], h=0.012, bevel=0.002).rot(rx=90).at(0, -0.042, 0), tie, "satin")   # pocket square
    hanger = tube([(-0.2, 0.0, 0.385), (-0.1, 0.0, 0.445), (0.0, 0.0, 0.468), (0.1, 0.0, 0.445), (0.2, 0.0, 0.385)], 0.017, 6, cap="round")
    m.add(hanger, "#b98a52", "satin")
    hook = tube([(0.0, 0.0, 0.46), (0.0, 0.0, 0.53), (0.012, 0.0, 0.565), (0.04, 0.0, 0.585), (0.066, 0.0, 0.565), (0.07, 0.0, 0.535)], 0.008, 6, cap="round")
    m.add(hook, "#c9ccd6", "metal")
    m.size_class = 0.88
    return m


ALL = [bowler, tophat, fedora, cap, hardhat, pith, beanie, crown, shades, aviators, monocle, eyepatch, goggles,
       heartglasses, banditmask, satchel, bigpack, cratepack, suit]
