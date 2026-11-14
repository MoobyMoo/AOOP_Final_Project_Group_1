"""Loot containers: crate tiers (wood / green / gold) with hinged lids, barrels, sacks, banana stash, ammo box, satchel."""
from kit import *

G = "loot"


def crate_wood(name, seed, w=1.25, d=0.95, h=0.82):
    a = Asset(name, G, footprint=0.7, blocksMove=True, blocksShot=True, seed=seed)
    g, r = a.mesh(), a.rng
    t, post = 0.07, 0.13
    # dark interior + straw so the gaps and the open top read
    g.box(w - 2 * t - 0.02, d - 2 * t - 0.02, h * 0.62, (0, 0, 0.05), col="#2b1f17", b=0.0, jit=0)
    for i in range(7):
        g.box(r.uniform(0.25, 0.5), 0.07, 0.05, (r.uniform(-0.35, 0.35), r.uniform(-0.25, 0.25), h * 0.62 + 0.03), (r.uniform(-8, 8), r.uniform(-8, 8), r.uniform(0, 180)), col=pick(r, ["#d9bf7a", "#c9ad68", "#e3cc8c"]), b=0.015)
    g.box(w - 0.04, d - 0.04, 0.07, (0, 0, 0.006), col=pick(r, WOOD_D), b=0.02)
    rows = 3
    ph = (h - 0.09) / rows
    for i in range(rows):
        z = 0.07 + ph * (i + 0.5)
        for sy in (-1, 1):
            plank(g, (-w / 2 + 0.03, sy * (d / 2 - t / 2), z), (w / 2 - 0.03, sy * (d / 2 - t / 2), z), ph - 0.03, t, wob=0.006, roll=90)
            plank(g, (sy * (w / 2 - t / 2), -d / 2 + 0.03, z), (sy * (w / 2 - t / 2), d / 2 - 0.03, z), t, ph - 0.03, wob=0.006)
    for sx in (-1, 1):
        for sy in (-1, 1):
            g.box(post, post, h + 0.02, (sx * (w / 2 - post / 2 + 0.035), sy * (d / 2 - post / 2 + 0.035), 0), col=pick(r, WOOD_D), b=0.03, jit=0.05, grad=(0.88, 1.05))
    # diagonal brace on the front and back (the classic crate read)
    for sy in (-1, 1):
        plank(g, (-w / 2 + post, sy * (d / 2 + 0.012), 0.14), (w / 2 - post, sy * (d / 2 + 0.012), h - 0.1), 0.045, 0.11, pal=WOOD_D, roll=0)
    rivets(g, [(sx * (w / 2 - 0.03), -d / 2 - 0.005, z) for sx in (-1, 1) for z in (0.16, h - 0.14)], 0.03, STEEL_D)
    # lid: hinged on the back top edge
    lid = a.part("lid", (0, d / 2, h + 0.01))
    n = 4
    pw = (d + 0.08) / n
    for i in range(n):
        y = -d / 2 - 0.04 + pw * (i + 0.5)
        plank(lid, (-w / 2 - 0.05, y, h + 0.045), (w / 2 + 0.05, y, h + 0.045), pw - 0.025, 0.07, wob=0.005, roll=0, pal=WOOD)
    for sx in (-1, 1):
        plank(lid, (sx * (w / 2 - 0.16), -d / 2 - 0.02, h + 0.1), (sx * (w / 2 - 0.16), d / 2 + 0.02, h + 0.1), 0.13, 0.05, pal=WOOD_D)
    return a


def crate_green(name, seed, w=1.4, d=0.9, h=0.78):
    a = Asset(name, G, footprint=0.75, blocksMove=True, blocksShot=True, seed=seed)
    g, r = a.mesh(), a.rng
    t = 0.07
    g.box(w - 0.1, d - 0.1, h * 0.6, (0, 0, 0.05), col="#221b16", b=0.0, jit=0)
    # contents: a couple of wrapped parcels and a banana bunch
    g.box(0.5, 0.36, 0.2, (-0.3, 0.05, h * 0.6), (0, 0, 12), col="#b89a68", b=0.04)
    g.box(0.4, 0.3, 0.16, (0.32, -0.1, h * 0.6), (0, 0, -20), col="#9a8458", b=0.04)
    bunch(g, (0.25, 0.2, h * 0.6 + 0.08), (0, 0, 40), 0.9)
    # painted shell: four panels + frame rails (darker), so it reads as a made thing, not a box
    for sy in (-1, 1):
        g.box(w, t, h - 0.06, (0, sy * (d / 2 - t / 2), 0.03), col=GREEN_P, b=0.025, grad=(0.86, 1.04), jit=0.03)
        g.box(t, d - 2 * t + 0.02, h - 0.06, (sy * (w / 2 - t / 2), 0, 0.03), col=GREEN_P, b=0.025, grad=(0.86, 1.04), jit=0.03)
    g.box(w - 0.02, d - 0.02, 0.06, (0, 0, 0.004), col=GREEN_PD, b=0.02)
    for z in (0.02, h - 0.14):
        for sy in (-1, 1):
            g.box(w + 0.07, 0.06, 0.12, (0, sy * (d / 2 + 0.0), z), col=GREEN_PD, b=0.025)
            g.box(0.055, d + 0.05, 0.11, (sy * (w / 2 + 0.0), 0, z + 0.005), col=GREEN_PD, b=0.02)
    for sx in (-1, 1):
        for sy in (-1, 1):   # steel corner brackets
            g.box(0.16, 0.16, 0.2, (sx * (w / 2 - 0.03), sy * (d / 2 - 0.03), h - 0.2), col=STEEL_D, b=0.03)
            g.box(0.16, 0.16, 0.16, (sx * (w / 2 - 0.03), sy * (d / 2 - 0.03), -0.006), col=STEEL_D, b=0.03)
    for sx in (-1, 1):       # rope handles on the ends
        x = sx * (w / 2 + 0.03)
        rope(g, [(x, -0.2, h * 0.62), (x + sx * 0.09, -0.1, h * 0.45), (x + sx * 0.09, 0.1, h * 0.45), (x, 0.2, h * 0.62)], 0.032, seg=2)
        for y in (-0.2, 0.2):
            g.box(0.05, 0.1, 0.1, (x - sx * 0.01, y, h * 0.58), col=STEEL_D, b=0.015)
    # stencil: banana + two bars, front and back
    for F_, sy in ((FRONT, -1), (BACK, 1)):
        m = F_(0, sy * (d / 2 + 0.001), h * 0.47)
        icon_banana(g, m @ T(-0.3, -0.16, 0) @ T(rz=-25), 0.42)
        g.paint_poly([(0.02, 0.04), (0.5, 0.04), (0.5, 0.13), (0.02, 0.13)], m, CREAM)
        g.paint_poly([(0.02, -0.12), (0.36, -0.12), (0.36, -0.03), (0.02, -0.03)], m, CREAM)
    lid = a.part("lid", (0, d / 2, h - 0.02))
    lid.box(w + 0.06, d + 0.06, 0.11, (0, 0, h - 0.02), col=GREEN_P, b=0.035, jit=0.03)
    lid.box(w - 0.3, d - 0.28, 0.035, (0, 0, h + 0.085), col=shade(GREEN_P, 1.08), b=0.015)
    for x in (-w * 0.3, w * 0.3):   # latches hang over the front
        lid.box(0.13, 0.05, 0.2, (x, -d / 2 - 0.045, h - 0.1), col=STEEL_L, b=0.02)
    icon_banana(lid, TOP(-0.24, -0.1, h + 0.121) @ T(rz=-25), 0.42)
    lid.paint_poly([(0.08, -0.12), (0.42, -0.12), (0.42, -0.04), (0.08, -0.04)], TOP(0, 0.02, h + 0.121), CREAM)
    lid.paint_poly([(0.08, 0.02), (0.3, 0.02), (0.3, 0.1), (0.08, 0.1)], TOP(0, 0.02, h + 0.121), CREAM)
    return a


def crate_gold(name, seed, w=1.3, d=0.86, h=0.56):
    a = Asset(name, G, footprint=0.72, blocksMove=True, blocksShot=True, seed=seed)
    g, r = a.mesh(), a.rng
    g.box(w - 0.12, d - 0.12, h * 0.75, (0, 0, 0.08), col="#1e1614", b=0.0, jit=0)
    # treasure: gold bars and bananas
    for i, (x, y, rz) in enumerate([(-0.3, 0.05, 10), (0.05, -0.08, -14), (0.34, 0.1, 30), (-0.1, 0.16, 80)]):
        g.box(0.36, 0.17, 0.11, (x, y, h * 0.75 + 0.06 + 0.02 * (i % 2)), (0, 0, rz), col=GOLD, b=0.035, taper=(0.86, 0.72), jit=0.03, hl=1.18)
    bunch(g, (0.2, -0.18, h * 0.75 + 0.2), (0, 0, 200), 0.9)
    for sy in (-1, 1):
        g.box(w, 0.08, h, (0, sy * (d / 2 - 0.04), 0.06), col=PLUM, b=0.03, grad=(0.85, 1.05), jit=0.02)
        g.box(0.08, d - 0.14, h, (sy * (w / 2 - 0.04), 0, 0.06), col=PLUM, b=0.03, grad=(0.85, 1.05), jit=0.02)
    g.box(w + 0.06, d + 0.06, 0.1, col=GOLD_D, b=0.03, jit=0.02)       # plinth band
    g.box(w + 0.05, d + 0.05, 0.07, (0, 0, h - 0.0), col=GOLD, b=0.025, jit=0.02)   # rim band
    for x in (-w * 0.3, w * 0.3):     # gold straps
        for sy in (-1, 1):
            g.box(0.13, 0.05, h - 0.02, (x, sy * (d / 2 + 0.005), 0.08), col=GOLD, b=0.02, jit=0.02, hl=1.2)
    for sx in (-1, 1):
        for sy in (-1, 1):
            g.box(0.15, 0.15, h + 0.035, (sx * (w / 2 - 0.035), sy * (d / 2 - 0.035), 0.05), col=GOLD, b=0.035, jit=0.02, hl=1.2)
        g.emit(p_lathe([(0.11, 0), (0.13, 0.03), (0.11, 0.06)], 10, cap0=False, cap1=False), GOLD_D, T(sx * (w / 2 - 0.02), 0, h * 0.62, 0, 90 * sx, 0))   # ring handles
    # lock plate + keyhole
    g.box(0.3, 0.07, 0.34, (0, -d / 2 - 0.03, h * 0.38), col=GOLD, b=0.035, hl=1.2, jit=0.0)
    m = FRONT(0, -d / 2 - 0.066, h * 0.38 + 0.17)
    g.paint_poly(circle(0.055, 10, cy=0.03), m, "#2a1a14")
    g.paint_poly([(-0.028, 0.02), (0.028, 0.02), (0.045, -0.09), (-0.045, -0.09)], m, "#2a1a14")
    rivets(g, [(sx * 0.105, -d / 2 - 0.066, h * 0.38 + z) for sx in (-1, 1) for z in (0.05, 0.29)], 0.022, GOLD_D)
    # domed lid
    lid = a.part("lid", (0, d / 2, h + 0.07))
    z0 = h + 0.07
    rings = []
    hw = w / 2 + 0.03
    for x in (-hw, -hw + 0.03, hw - 0.03, hw):
        ring = []
        ins = 0.03 if abs(x) > hw - 0.01 else 0.0
        for k in range(9):
            ang = pi * k / 8
            ring.append((x, -cos(ang) * (d / 2 + 0.03 - ins), z0 + sin(ang) * (0.3 - ins)))
        rings.append(ring)
    lid.loft(rings, PLUM, jit=0.02, smooth=50)
    for x in (-w * 0.3, 0, w * 0.3):
        rr = [[(x + sx * 0.07, -cos(pi * k / 8) * (d / 2 + 0.045), z0 - 0.005 + sin(pi * k / 8) * 0.32) for k in range(9)] for sx in (-1, 1)]
        lid.loft(rr, GOLD, jit=0.02, hl=1.2)
    for sx in (-1, 1):
        rr = [[(sx * (hw - 0.05) + s2 * 0.075, -cos(pi * k / 8) * (d / 2 + 0.05), z0 - 0.005 + sin(pi * k / 8) * 0.325) for k in range(9)] for s2 in (-1, 1)]
        lid.loft(rr, GOLD, jit=0.02, hl=1.2)
    lid.box(0.22, 0.06, 0.16, (0, -d / 2 - 0.05, z0 - 0.03), col=GOLD, b=0.03, hl=1.2, jit=0)     # hasp
    a.point("glint", (0, 0, h + 0.2))
    return a


def barrel(name, seed, kind="wood"):
    a = Asset(name, G, footprint=0.5, blocksMove=True, blocksShot=True, seed=seed)
    g, r = a.mesh(), a.rng
    if kind == "wood":
        R, H, n = 0.42, 1.08, 14
        staves = [pick(r, WOOD) for _ in range(n)]
        prof = [(R * 0.8, 0), (R * 0.84, 0.03)] + [(R * (0.84 + 0.16 * sin(pi * (0.05 + 0.9 * i / 6))), 0.03 + (H - 0.06) * i / 6) for i in range(1, 6)] + [(R * 0.84, H - 0.03), (R * 0.8, H)]
        g.lathe(prof, col=lambda c, tg: staves[int((atan2(c.y, c.x) % (2 * pi)) / (2 * pi) * n) % n], n=n, grad=(0.85, 1.05), cap1=False, smooth=40)
        g.cyl(R * 0.78, 0.05, (0, 0, H - 0.1), col=pick(r, WOOD_PALE), n=n, b=0.01)
        for z, k in ((0.2, 0.93), (H * 0.5, 1.012), (H - 0.2, 0.93)):
            g.emit(p_lathe([(R * k, -0.045), (R * k + 0.025, -0.03), (R * k + 0.025, 0.03), (R * k, 0.045)], n, cap0=False, cap1=False), STEEL_D, T(0, 0, z), jit=0.03)
        g.cyl(0.05, 0.05, (0.2, -0.08, H - 0.06), col=WOOD_D[0], n=6, b=0.01)
    else:   # rusty drum with a painted band
        R, H, n = 0.4, 1.12, 14
        body = RUST[0] if kind == "rust" else "#b4553a"
        prof = [(R - 0.03, 0), (R, 0.03), (R, 0.34), (R + 0.025, 0.37), (R, 0.4), (R, 0.72), (R + 0.025, 0.75), (R, 0.78), (R, H - 0.03), (R - 0.03, H)]
        g.lathe(prof, col=lambda c, tg: (HULL_T if 0.41 < c.z < 0.71 and kind == "teal" else body), n=n, grad=(0.82, 1.05), cap1=False, smooth=50)
        g.cyl(R - 0.035, 0.03, (0, 0, H - 0.07), col=shade(body, 0.8), n=n, b=0.0)
        g.cyl(0.06, 0.04, (0.18, 0.1, H - 0.05), col=STEEL_D, n=7, b=0.01)
        g.cyl(0.035, 0.04, (-0.2, -0.05, H - 0.05), col=STEEL_D, n=6, b=0.01)
        m = FRONT(0, 0, 0.56)
        for ang in (-22, 12):   # rust blotches wrapped as flat patches on two staves
            mm = T(rz=ang) @ T(0, -R * cos(pi / n) - 0.001, 0) @ m
            g.paint_poly([(-0.07, -0.1), (0.05, -0.14), (0.08, 0.02), (0.0, 0.12), (-0.08, 0.06)], mm, RUST[3])
    return a


def sack(name, seed, n=1):
    a = Asset(name, G, footprint=0.45 if n == 1 else 0.8, blocksMove=n > 1, seed=seed)
    g, r = a.mesh(), a.rng

    def one(at, rz, lean, s=1.0, icon=True):
        col = pick(r, ["#b99a66", "#ad8d5a", "#c4a672"])
        with g.at(T(*at, 0, lean, rz, s)):
            def warp(v):
                k = 1 + 0.07 * sin(v.z * 9 + v.x * 5) + 0.05 * sin(v.y * 11)
                return Vector((v.x * k, v.y * k * 0.78, v.z + 0.04 * sin(v.x * 7)))
            prof = [(0.0, 0.0), (0.26, 0.02), (0.36, 0.14), (0.39, 0.36), (0.33, 0.6), (0.2, 0.78), (0.1, 0.84)]
            g.emit(p_lathe(prof, 10, cap1=False), col, None, warp=warp, grad=(0.82, 1.06), smooth=70)
            g.emit(p_lathe([(0.1, 0.83), (0.12, 0.86), (0.1, 0.9)], 8, cap0=False, cap1=False), ROPE, None)
            g.emit(p_lathe([(0.09, 0.88), (0.17, 0.98), (0.19, 1.05), (0.0, 1.03)], 8, cap0=False), shade(col, 1.06), None, warp=lambda v: Vector((v.x, v.y * 0.6, v.z + 0.03 * sin(v.x * 20))), smooth=70)
            if icon:
                icon_banana(g, T(0, -0.315, 0.3, 82, 0, 0), 0.34, "#6b5335")
    if n == 1:
        one((0, 0, 0), a.rng.uniform(-20, 20), 4)
    else:
        one((-0.38, 0.1, 0), 15, -6)
        one((0.34, 0.12, 0), -25, 7, 0.95)
        one((0.0, -0.3, 0), 5, 0, 0.9, icon=False)
        with g.at(T(0.75, -0.55, 0.3, 80, 0, 110, 0.92)):   # one fallen over
            one((0, 0, 0), 0, 0, 1.0, icon=False)
    return a


def banana_stash(name, seed):
    a = Asset(name, G, footprint=0.6, blocksMove=True, seed=seed)
    g, r = a.mesh(), a.rng
    w, d, h = 1.1, 0.8, 0.3
    g.box(w - 0.04, d - 0.04, 0.06, (0, 0, 0.006), col=pick(r, WOOD_D), b=0.02)
    for sy in (-1, 1):
        for i in range(2):
            plank(g, (-w / 2, sy * (d / 2 - 0.03), 0.1 + i * 0.13), (w / 2, sy * (d / 2 - 0.03), 0.1 + i * 0.13), 0.11, 0.05, roll=90, pal=WOOD_PALE)
            plank(g, (sy * (w / 2 - 0.03), -d / 2 + 0.03, 0.1 + i * 0.13), (sy * (w / 2 - 0.03), d / 2 - 0.03, 0.1 + i * 0.13), 0.05, 0.11, pal=WOOD_PALE)
    for sx in (-1, 1):
        for sy in (-1, 1):
            g.box(0.09, 0.09, h, (sx * (w / 2 - 0.035), sy * (d / 2 - 0.035), 0), col=pick(r, WOOD), b=0.02)
    g.box(w - 0.14, d - 0.14, 0.12, (0, 0, 0.05), col="#3a5a2a", b=0.0)     # banana-leaf lining
    for (x, y, z, rz, s, k) in [(-0.26, -0.12, 0.22, 15, 1.1, 5), (0.24, 0.1, 0.22, 195, 1.1, 5), (0.02, 0.0, 0.4, 100, 1.05, 5)]:
        bunch(g, (x, y, z), (r.uniform(-8, 8), r.uniform(-6, 6), rz), s, k)
    return a


def ammo_box(name, seed):
    a = Asset(name, G, footprint=0.4, seed=seed)
    g = a.mesh()
    w, d, h = 0.72, 0.36, 0.42
    g.box(w, d, h, col=OLIVE, b=0.035, grad=(0.85, 1.05), jit=0.02)
    g.box(w + 0.03, d + 0.03, 0.09, (0, 0, h - 0.1), col=shade(OLIVE, 0.82), b=0.025, jit=0.02)
    g.box(w + 0.02, d + 0.02, 0.06, (0, 0, -0.006), col=shade(OLIVE, 0.8), b=0.02, jit=0.02)
    g.box(0.1, 0.05, 0.2, (0, -d / 2 - 0.03, h - 0.24), col=STEEL_L, b=0.02)
    for sx in (-1, 1):
        g.box(0.05, 0.06, 0.1, (sx * 0.15, 0, h), col=STEEL_D, b=0.015)
    g.beam((-0.2, 0, h + 0.1), (0.2, 0, h + 0.1), 0.06, 0.05, STEEL_D, b=0.02)
    m = FRONT(0, -d / 2 - 0.001, h * 0.42)
    g.paint_poly([(-0.31, -0.13), (-0.1, -0.13), (-0.1, -0.06), (-0.31, -0.06)], m, BANANA)
    for i in range(3):    # three painted rounds
        x = 0.12 + i * 0.09
        g.paint_poly([(x - 0.028, -0.13), (x + 0.028, -0.13), (x + 0.028, 0.0), (x, 0.06), (x - 0.028, 0.0)], m, BANANA)
    m = TOP(0, 0, h + 0.001)
    g.paint_poly([(-0.3, -0.1), (-0.22, -0.1), (-0.22, 0.1), (-0.3, 0.1)], m, BANANA)
    g.paint_poly([(0.22, -0.1), (0.3, -0.1), (0.3, 0.1), (0.22, 0.1)], m, BANANA)
    return a


def satchel(name, seed):
    a = Asset(name, G, footprint=0.4, seed=seed)
    g = a.mesh()
    leather, dark = "#8a5a34", "#6a4226"
    with g.at(T(0, 0, 0, -12, 0, 8)):
        g.box(0.78, 0.3, 0.5, (0, 0, 0.0), col=leather, b=0.07, taper=(0.94, 0.8), grad=(0.84, 1.05), jit=0.02)
        g.box(0.82, 0.07, 0.34, (0, -0.15, 0.22), (-5, 0, 0), col=shade(leather, 1.1), b=0.03, jit=0.02)      # flap
        g.box(0.84, 0.34, 0.08, (0, 0.0, 0.46), col=shade(leather, 1.1), b=0.03, jit=0.02)
        for x in (-0.22, 0.22):
            g.box(0.09, 0.045, 0.3, (x, -0.185, 0.17), (-5, 0, 0), col=dark, b=0.015)
            g.box(0.12, 0.05, 0.09, (x, -0.2, 0.2), (-5, 0, 0), col=GOLD, b=0.02, hl=1.2)
        g.box(0.26, 0.26, 0.16, (0.08, 0.02, 0.5), col=dark, b=0.03)                                # pocket bulge on top
        banana(g, (0.3, 0.02, 0.56), (0, -40, 70), 0.9)
    rope(g, [(-0.4, 0.05, 0.42), (-0.62, -0.25, 0.04), (-0.2, -0.55, 0.03), (0.3, -0.5, 0.03), (0.52, -0.2, 0.05), (0.4, 0.04, 0.4)], 0.035, dark, seg=3)
    return a


def build():
    crate_wood("crate_wood", 1)
    crate_wood("crate_wood_b", 2, w=1.0, d=1.0, h=0.95)
    crate_green("crate_green", 3)
    crate_gold("crate_gold", 4)
    barrel("barrel_wood", 5, "wood")
    barrel("barrel_rust", 6, "rust")
    barrel("barrel_teal", 7, "teal")
    sack("sack", 8, 1)
    sack("sack_pile", 9, 4)
    banana_stash("banana_stash", 10)
    ammo_box("ammo_box", 11)
    satchel("satchel", 12)


REVIEW = dict(cols=6, cell=2.6, dist=22)
