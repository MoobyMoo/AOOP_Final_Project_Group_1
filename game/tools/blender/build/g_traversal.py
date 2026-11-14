"""Traversal + exits: zipline tower / landing frame / handle, boardwalk sections on stilts, plank bridge, the raft,
the bunker hatch on the beach, the supply-drop gondola, and the grotto portals (cave mouth, root hole)."""
from kit import *

G = "traversal"
ROCK = ["#82776a", "#8c8073", "#766b5f", "#958a7c"]
ROCK_D = ["#5f574e", "#6a6157", "#544d45"]


def zip_tower(name, seed, PH=6.0):
    """lookout platform PH up: the high end of the zipline. Cable anchor on the mast, 2.3 above the deck."""
    a = Asset(name, G, footprint=1.3, blocksMove=True, tall=True, seed=seed, ao_dist=2.2)
    g, r = a.mesh(), a.rng
    hw, sp = 1.05, 0.5

    def onleg(sx, sy, z):
        t = z / PH
        return Vector((sx * (hw + sp * (1 - t)), sy * (hw + sp * (1 - t)), z))
    for sx in (-1, 1):
        for sy in (-1, 1):
            log(g, onleg(sx, sy, -0.1), onleg(sx, sy, PH + 0.1), 0.14, r2=0.11, n=8)
    for z0, z1 in ((0.4, 2.2), (2.3, 4.0), (4.1, 5.7)):
        for (ax, ay, bx, by) in ((-1, 1, 1, 1), (-1, -1, -1, 1), (1, -1, 1, 1), (-1, -1, 1, -1)):
            if (ay, by) == (-1, -1) and z0 < 2:
                continue                          # keep the front bay open at the bottom
            plank(g, onleg(ax, ay, z0), onleg(bx, by, z1), 0.12, 0.055, pal=WOOD)
            if (z0 > 2) or (ax != bx):
                plank(g, onleg(ax, ay, z1), onleg(bx, by, z0), 0.12, 0.055, pal=WOOD)
    for sy in (-1, 1):
        log(g, (-hw - 0.4, sy * hw * 0.9, PH - 0.12), (hw + 0.4, sy * hw * 0.9, PH - 0.12), 0.09, n=7)
    n = 6
    pw = (2 * hw + 0.6) / n
    for i in range(n):
        x = -hw - 0.3 + pw * (i + 0.5)
        plank(g, (x, -hw - 0.3, PH), (x, hw + 0.3, PH), pw - 0.03, 0.07, wob=0.012, pal=WOOD + WOOD_PALE)
    for (ax, ay, bx, by) in ((-1, 1, 1, 1), (-1, -1, -1, 1)):      # rails on the back and west; south + east open (ladder, launch)
        for z in (PH + 0.5, PH + 0.95):
            g.pole(Vector((ax * hw, ay * hw, z)), Vector((bx * hw, by * hw, z)), 0.045, pick(r, WOOD), n=6, cap=ENDGRAIN)
    for (sx, sy) in ((-1, 1), (1, 1), (-1, -1)):
        g.pole((sx * hw, sy * hw, PH), (sx * hw, sy * hw, PH + 1.05), 0.06, pick(r, WOOD_D), n=6, cap=ENDGRAIN)
    ladder(g, (-0.25, -hw - sp - 1.1, 0), (-0.25, -hw - 0.32, PH + 0.6), 0.62, 0.38)
    # the mast with the cable anchor
    log(g, (hw - 0.1, 0.0, PH), (hw - 0.1, 0.0, PH + 2.75), 0.11, r2=0.09, n=7)
    g.beam((hw - 0.1, 0, PH + 2.3), (hw + 0.55, 0, PH + 2.3), 0.1, 0.12, pick(r, WOOD_D), b=0.02)
    g.beam((hw - 0.1, 0, PH + 1.6), (hw + 0.45, 0, PH + 2.24), 0.07, 0.07, pick(r, WOOD_D), b=0.015)
    lashing(g, (hw - 0.1, 0, PH + 2.3), (0, 0, 1), 0.1)
    g.emit(p_lathe([(0.1, -0.04), (0.14, 0.0), (0.1, 0.04)], 8, cap0=False, cap1=False), IRON, T(hw + 0.5, 0, PH + 2.16, 90, 0, 0))
    g.sheet([[(hw - 0.1 + 0.02, 0.06 + 0.32 * i, PH + 2.7 - 0.22 * k - 0.03 * i * k) for k in range(3)] for i in range(4)], BANANA, 0.025)
    a.point("anchor", (hw + 0.5, 0, PH + 2.3))
    a.point("start", (hw + 0.2, 0, PH))
    return a


def zip_end(name, seed, AH=5.0):
    """landing frame: a crossed A-frame holding the low end of the cable, with a sandbag landing pad"""
    a = Asset(name, G, footprint=0.9, blocksMove=False, tall=True, seed=seed, ao_dist=1.8)
    g, r = a.mesh(), a.rng
    for sy in (-1, 1):
        log(g, (0, sy * 1.25, -0.1), (0, -sy * 0.22, AH + 0.5), 0.12, r2=0.09, n=7)
    lashing(g, (0, 0, AH - 0.08), (0, 0, 1), 0.16, turns=4)
    log(g, (0.0, 0, AH), (-1.9, 0, -0.1), 0.09, r2=0.08, n=6)       # back stay
    g.emit(p_lathe([(0.1, -0.04), (0.14, 0.0), (0.1, 0.04)], 8, cap0=False, cap1=False), IRON, T(0.12, 0, AH - 0.2, 90, 0, 0))
    # the landing platform (layout to.h = 1.2), on the tower side of the frame, with steps down
    PH, cx = 1.2, 1.25
    for sx in (-1, 1):
        for sy in (-1, 1):
            log(g, (cx + sx * 0.95, sy * 0.95, -0.1), (cx + sx * 0.95, sy * 0.95, PH + (0.75 if sx > 0 else 0.0)), 0.11, r2=0.1, n=7)
    for sy in (-1, 1):
        log(g, (cx - 1.25, sy * 0.85, PH - 0.1), (cx + 1.25, sy * 0.85, PH - 0.1), 0.08, n=6)
    for i in range(6):
        x = cx - 1.1 + 2.2 * (i + 0.5) / 6
        plank(g, (x, -1.2, PH), (x, 1.2, PH), 2.2 / 6 - 0.03, 0.07, wob=0.01, pal=WOOD + WOOD_PALE)
    g.pole((cx + 0.95, -0.95, PH + 0.65), (cx + 0.95, 0.95, PH + 0.65), 0.05, pick(r, WOOD), n=6, cap=ENDGRAIN)
    for i in range(3):
        g.box(0.9, 0.34, 0.1, (cx - 0.2, -1.36 - i * 0.32, PH - 0.1 - (i + 1) * 0.3), col=pick(r, WOOD), b=0.02)
    for sx in (-1, 1):
        g.beam((cx - 0.2 + sx * 0.42, -1.2, PH - 0.1), (cx - 0.2 + sx * 0.42, -2.36, 0.0), 0.07, 0.14, pick(r, WOOD_D), b=0.02)
    for (x, y, z, rz) in [(cx + 1.75, -0.3, 0.0, 10), (cx + 1.8, 0.4, 0.0, -8), (cx + 1.78, 0.05, 0.22, 95)]:
        g.box(0.86, 0.46, 0.26, (x, y, z), (0, 0, rz), col=pick(r, ["#b99a66", "#ad8d5a", "#c4a672"]), b=0.1, jit=0.05)
    a.point("land", (cx, 0, PH))
    g.box(0.62, 0.07, 0.42, (0.0, -0.93, 1.3), col=pick(r, WOOD_PALE), b=0.02)
    icon_banana(g, FRONT(0, -0.966, 1.37), 0.42, RED_D)
    a.point("anchor", (0.12, 0, AH - 0.2))
    return a


def zip_handle(name, seed):
    """trolley + grip. Origin = where it rides the cable; the grip hangs 0.55 below."""
    a = Asset(name, G, footprint=0.2, seed=seed, ground=False, ao_dist=0.5)
    g = a.mesh()
    h = a.part("handle", (0, 0, 0))
    h.box(0.34, 0.12, 0.2, (0, 0, -0.12), col=IRON, b=0.03)
    for sx in (-1, 1):
        h.cyl(0.075, 0.06, (sx * 0.1, 0.03, 0.02), (90, 0, 0), col=STEEL_L, n=8, b=0.012)
    h.pole((0, 0, -0.1), (0, 0, -0.55), 0.028, IRON, n=5)
    h.pole((0, -0.3, -0.55), (0, 0.3, -0.55), 0.04, WOOD_D[0], n=6)
    for sy in (-1, 1):
        h.pole((0, sy * 0.14, -0.55), (0, sy * 0.28, -0.55), 0.052, BANANA, n=6)
    g.cyl(0.02, 0.02, (0, 0, -0.02), col=IRON, n=4, b=0)          # tiny static stub so the asset has a static mesh
    return a


def boardwalk(name, seed, L=4.0, W=2.8, broken=False, ramp=False):
    """deck along x. The walk surface sits just above the ground; stilts carry on below it for hollows and water."""
    a = Asset(name, G, footprint=0.3, seed=seed, ao_dist=1.0)
    g, r = a.mesh(), a.rng
    n = int(L / 0.42)
    pw = L / n
    zt = 0.16
    for sy in (-1, 1):
        plank(g, (-L / 2, sy * (W / 2 - 0.35), zt - 0.14), (L / 2, sy * (W / 2 - 0.35), zt - 0.14), 0.16, 0.16, pal=WOOD_D)
    for i in range(n):
        x = -L / 2 + pw * (i + 0.5)
        if broken and i in (4,):
            continue
        z = zt
        tilt = 0
        ln = W + r.uniform(-0.12, 0.12)
        if broken and i == 5:
            ln, tilt = W * 0.55, 9
        if ramp:
            z = zt - 0.2 * max(0, (i - n * 0.4) / (n * 0.6)) ** 1.0
        g.box(pw - 0.035, ln, 0.08, (x, r.uniform(-0.05, 0.05) - (W - ln) / 2 * (1 if tilt else 0), z - 0.08), (tilt, 0, r.uniform(-1.5, 1.5)), col=pick(r, WOOD_GREY + ["#a8916f", "#9d8766"]), b=0.02, jit=0.05)
    for sx in ((-1, 1) if not ramp else (-1,)):
        for sy in (-1, 1):
            h = r.uniform(0.55, 0.95)
            log(g, (sx * (L / 2 - 0.3), sy * (W / 2 + 0.1), -0.9), (sx * (L / 2 - 0.3) + r.uniform(-0.04, 0.04), sy * (W / 2 + 0.1), h), 0.11, r2=0.095, n=7)
            lashing(g, (sx * (L / 2 - 0.3), sy * (W / 2 + 0.1), h - 0.2), (0, 0, 1), 0.105, turns=2)
    if not ramp and not broken:
        rope(g, [(-L / 2 + 0.3, W / 2 + 0.1, 0.6), (L / 2 - 0.3, W / 2 + 0.1, 0.6)], 0.035, sag=0.14, seg=6)
    if broken:
        plank(g, (0.25, -W / 2 + 0.25, 0.05), (0.7, -W / 2 - 0.95, 0.03), 0.38, 0.07, pal=WOOD_GREY)      # the missing plank, dropped half off the deck
    return a


def bridge(name, seed, L=5.0, W=2.2):
    """plank bridge with rope rails: planks follow a shallow sag between four corner posts"""
    a = Asset(name, G, footprint=0.3, seed=seed, ao_dist=1.0)
    g, r = a.mesh(), a.rng
    n = int(L / 0.4)
    pw = L / n
    sag = lambda x: 0.14 - 0.1 * (1 - (2 * x / L) ** 2)
    for sy in (-1, 1):
        pts = [(x, sy * (W / 2 - 0.25), sag(x) - 0.1) for x in [(-L / 2 + L * k / 8) for k in range(9)]]
        g.tube(pts, 0.05, ROPE, n=5)
    for i in range(n):
        x = -L / 2 + pw * (i + 0.5)
        if i == n // 2 + 1:
            continue
        g.box(pw - 0.05, W + r.uniform(-0.1, 0.1), 0.07, (x, r.uniform(-0.04, 0.04), sag(x) - 0.07), (r.uniform(-2, 2), 0, r.uniform(-2, 2)), col=pick(r, WOOD_GREY + ["#a8916f", "#9d8766"]), b=0.02, jit=0.05)
    for sx in (-1, 1):
        for sy in (-1, 1):
            log(g, (sx * (L / 2 + 0.05), sy * (W / 2 + 0.05), -0.7), (sx * (L / 2 + 0.05), sy * (W / 2 + 0.05), 1.25), 0.11, r2=0.09, n=7)
            lashing(g, (sx * (L / 2 + 0.05), sy * (W / 2 + 0.05), 1.0), (0, 0, 1), 0.1, turns=2)
    for sy in (-1, 1):
        rope(g, [(-L / 2 - 0.05, sy * (W / 2 + 0.05), 1.05), (L / 2 + 0.05, sy * (W / 2 + 0.05), 1.05)], 0.035, sag=0.3, seg=8)
        for k in range(1, 6):
            x = -L / 2 + L * k / 6
            t = (k / 6)
            zr = 1.05 - 0.3 * 4 * t * (1 - t)
            g.pole((x, sy * (W / 2 + 0.05), zr), (x, sy * (W / 2 - 0.2), sag(x) - 0.06), 0.02, ROPE, n=4, b=0)
    return a


def raft(name, seed):
    """the far exit: lashed logs, a mast, a red flag (its own node, pivot on the mast)"""
    a = Asset(name, G, footprint=1.5, seed=seed, ground=False, ao_dist=1.2)
    g, r = a.mesh(), a.rng
    n = 6
    for i in range(n):
        x = (i - (n - 1) / 2) * 0.44
        log(g, (x, -1.5 + r.uniform(-0.12, 0.12), 0.2), (x, 1.5 + r.uniform(-0.12, 0.12), 0.2), 0.22, r2=0.2, n=9, col=pick(r, ["#a8743f", "#9c6a38", "#b37e48"]))
    for y in (-1.05, 1.05):
        log(g, (-1.35, y, 0.44), (1.35, y, 0.44), 0.09, n=7, col=pick(r, WOOD_D))
        for i in range(n):
            lashing(g, ((i - (n - 1) / 2) * 0.44, y, 0.44), (1, 0, 0), 0.09, turns=1, rr=0.03)
    log(g, (0.5, 0.2, 0.3), (0.5, 0.2, 3.1), 0.075, r2=0.06, n=7, col=pick(r, WOOD_D))
    for (x, y) in ((-0.2, 0.2), (1.2, 0.2), (0.5, 1.1)):
        g.tube([(0.5, 0.2, 2.5), (x, y, 0.42)], 0.018, ROPE, n=4)
    fl = a.part("flag", (0.5, 0.2, 2.75), "foliage")
    fl.sheet([[(0.56 + 0.3 * i, 0.2 + 0.05 * sin(i * 1.5), 3.0 - 0.27 * k - 0.03 * i * (k - 1)) for k in range(3)] for i in range(4)], RED, 0.03)
    # cargo: a crate, a paddle, a rope coil
    g.box(0.7, 0.6, 0.5, (-0.55, -0.6, 0.4), (0, 0, 14), col=pick(r, WOOD_PALE), b=0.04)
    g.box(0.74, 0.1, 0.1, (-0.55, -0.6, 0.86), (0, 0, 14), col=pick(r, WOOD_D), b=0.02)
    g.pole((-0.9, 0.2, 0.46), (0.3, 1.25, 0.5), 0.035, pick(r, WOOD), n=5)
    g.box(0.3, 0.5, 0.05, (0.42, 1.36, 0.47), (0, 0, -48), col=pick(r, WOOD), b=0.02)
    for k in range(3):
        g.emit(p_lathe([(0.2, 0), (0.25, 0.035), (0.2, 0.07)], 9, cap0=False, cap1=False), ROPE, T(0.8, -0.8, 0.42 + k * 0.06), jit=0.04)
    a.point("board", (0, 0, 0.45))
    return a


def hatch(name, seed):
    """the bunker hatch on the beach: steel lid in a sand mound, a periscope, an OPEN FOR BUSINESS sign, a doormat"""
    a = Asset(name, G, footprint=1.0, seed=seed, ao_dist=1.2)
    g, r = a.mesh(), a.rng
    g.ball(1.0, (0, 0, -0.03), col=SAND, n=14, m=4, s=(1.75, 1.6, 0.42), z0=0.0, z1=1.0, jit=0.0, hl=1.0, grad=(0.93, 1.04))
    g.lathe([(0.95, 0.2), (1.0, 0.34), (1.0, 0.46), (0.94, 0.5), (0.78, 0.5), (0.78, 0.2)], col=STEEL_D, n=14, cap0=False, cap1=False, smooth=50)
    g.emit(p_lathe([(0.0, 0.3), (0.78, 0.3)], 14, cap0=False, cap1=False), "#14110f", None, jit=0)       # the dark shaft
    for k in range(8):
        ang = radians(k * 45 + 22.5)
        g.emit(p_sphere(0.05, 6, 2, z0=0.0, z1=1.0), STEEL_L, T(cos(ang) * 0.9, sin(ang) * 0.9, 0.495), jit=0.02)
    for sx in (-1, 1):
        g.box(0.16, 0.2, 0.2, (sx * 0.3, 0.92, 0.42), col=IRON, b=0.03)                                 # hinge knuckles
    ld = a.part("lid", (0, 0.9, 0.56))
    ld.lathe([(0.9, 0.5), (0.92, 0.56), (0.86, 0.64), (0.4, 0.7), (0.0, 0.7)], col=STEEL, n=14, cap0=True, smooth=50, grad=(0.92, 1.05))
    ld.emit(p_lathe([(0.3, -0.035), (0.37, 0.0), (0.3, 0.035)], 10, cap0=False, cap1=False), RED, T(0, 0, 0.84), jit=0)
    for k in range(3):
        ang = radians(k * 60)
        ld.pole((cos(ang) * 0.33, sin(ang) * 0.33, 0.84), (-cos(ang) * 0.33, -sin(ang) * 0.33, 0.84), 0.028, RED_D, n=4, b=0)
    ld.cyl(0.07, 0.16, (0, 0, 0.69), col=STEEL_D, n=7, b=0.015)
    for sx in (-1, 1):
        ld.box(0.14, 0.5, 0.07, (sx * 0.3, 0.7, 0.66), col=IRON, b=0.02)
    ld.paint_poly([(-0.5, -0.5), (-0.26, -0.5), (-0.26, -0.62), (-0.5, -0.62)], TOP(0, 0, 0.66), BANANA, lift=0.012)
    ld.paint_poly([(0.5, -0.5), (0.26, -0.5), (0.26, -0.62), (0.5, -0.62)], TOP(0, 0, 0.66), BANANA, lift=0.012)
    # periscope (its head is a node that can turn)
    g.cyl(0.16, 0.3, (1.15, 0.3, 0.12), col=STEEL_D, n=8, b=0.03)
    g.pole((1.15, 0.3, 0.3), (1.15, 0.3, 1.5), 0.075, STEEL, n=7)
    sc = a.part("scope", (1.15, 0.3, 1.5))
    sc.box(0.22, 0.42, 0.22, (1.15, 0.2, 1.42), col=STEEL_D, b=0.04)
    sc.cyl(0.085, 0.08, (1.15, 0.0, 1.53), (90, 0, 0), col="#9fd0d6", n=8, b=0.015)
    # the sign
    g.pole((-1.45, -0.5, 0), (-1.45, -0.5, 1.45), 0.06, pick(r, WOOD_D), n=6)
    g.box(1.2, 0.07, 0.72, (-1.45, -0.56, 0.86), (0, 0, 0), col=CREAM, b=0.025, jit=0.02)
    m = FRONT(-1.45, -0.597, 1.22)
    g.paint_text("OPEN", 0.26, m @ T(0, 0.0, 0), "#3f7a3a", w=0.06)
    g.paint_text("FOR BUSINESS", 0.085, m @ T(0, -0.16, 0), "#2a2622", w=0.02)
    icon_banana(g, m @ T(0, -0.34, 0), 0.24, BANANA_D)
    # doormat
    g.box(1.0, 0.6, 0.04, (0, -1.5, 0.01), (0, 0, 3), col="#8a5a34", b=0.012)
    g.paint_line([(-0.4, -0.2), (0.4, -0.2), (0.4, 0.2), (-0.4, 0.2)], 0.05, TOP(0, -1.5, 0.05) @ T(rz=3), CREAM, closed=True)
    a.point("enter", (0, 0, 0.5))
    return a


def supply_gondola(name, seed):
    """the crashed bandit supply balloon: a tipped wicker gondola, the deflated envelope, sandbags. kit_build.ts drops a
    gold crate on the `crate` point and red smoke on `smoke`."""
    a = Asset(name, G, footprint=1.2, blocksMove=True, seed=seed, ao_dist=1.6)
    g, r = a.mesh(), a.rng
    wick = ["#b58a4c", "#a67c42", "#c29858"]
    with g.at(T(0.9, 0.5, 0.0, 0, 22, 12)):
        for i in range(4):          # woven rows
            z = 0.06 + i * 0.26
            for sy in (-1, 1):
                g.box(1.7, 0.09, 0.24, (0, sy * 0.62, z), col=wick[i % 3], b=0.04, jit=0.05)
                g.box(0.09, 1.2, 0.24, (sy * 0.82, 0, z), col=wick[(i + 1) % 3], b=0.04, jit=0.05)
        g.box(1.66, 1.26, 0.07, (0, 0, 0.0), col=WOOD_D[0], b=0.02)
        for sx in (-1, 1):
            for sy in (-1, 1):
                g.pole((sx * 0.84, sy * 0.64, 0.0), (sx * 0.84, sy * 0.64, 1.25), 0.05, WOOD_D[0], n=6)
                rope(g, [(sx * 0.84, sy * 0.64, 1.2), (sx * 0.5 - 1.6, sy * 0.3 + 0.2, 1.7)], 0.025, seg=2)
        for sy in (-1, 1):
            g.box(0.34, 0.2, 0.42, (0.3, sy * 0.74, 0.5), col="#b99a66", b=0.08)                # sandbags hung on the sides
    # the deflated envelope, draped away to the north-west
    gores = [RED, CREAM, RED, CREAM, RED]
    grid = []
    for i in range(6):
        row = []
        for k in range(6):
            x = -3.6 + 3.6 * i / 5 + 0.2 * sin(k * 1.3)
            y = -0.6 + 3.0 * k / 5 + 0.25 * sin(i * 1.7)
            z = 0.1 + 0.42 * sin(pi * i / 5) * sin(pi * k / 5) * (1 + 0.5 * sin(i * 2.3 + k * 1.9)) + (0.5 * (i / 5) ** 3)
            row.append((x, y, max(0.05, z)))
        grid.append(row)
    g.sheet(grid, lambda c, tg: gores[int((c.y + 0.6) / 3.0 * 4.999) % 5], 0.05, smooth=65, jit=0.03)
    g.paint_poly([(-0.3, -0.25), (0.3, -0.3), (0.34, 0.25), (-0.25, 0.3)], T(-1.9, 0.6, 0.62, 0, 0, 20), "#8f7a55", lift=0.03)      # a patch
    for (x, y, z, rz) in [(1.9, 0.1, 0.19, 35), (1.95, 0.25, 0.0, -30)]:
        g.box(0.66, 0.4, 0.22, (x, y, z), (0, 0, rz), col="#b99a66", b=0.09, jit=0.05)
    a.point("crate", (0.2, -0.75, 0.0))
    a.point("smoke", (0.9, 0.5, 1.3))
    return a


def cave_mouth(name, seed, pal=ROCK):
    """a rock arch round a dark opening (the way into, or out of, the grotto)"""
    a = Asset(name, G, footprint=1.6, blocksMove=False, tall=True, seed=seed, ao_dist=2.0)
    g, r = a.mesh(), a.rng
    for i in range(7):
        ang = radians(-8 + i * 32.7)
        s = r.uniform(1.5, 1.9)
        g.rock(s, s * 1.2, s, (cos(ang) * 1.85, 0.35, max(-0.2, sin(ang) * 2.0 - 0.1 + (0.2 if 1 < i < 5 else 0))), (0, 0, r.uniform(0, 360)), col=pick(r, pal), n=13, b=0.11, seed=r.random(), flatbase=i in (0, 6), grad=(0.84, 1.06))
    for sx in (-1, 1):
        g.rock(1.5, 1.6, 1.3, (sx * 2.5, 0.9, -0.2), (0, 0, r.uniform(0, 360)), col=pick(r, pal), n=12, b=0.1, seed=r.random())
    g.rock(4.8, 2.8, 2.6, (0, 1.2, -0.2), (0, 0, 10), col=pal[2], n=18, b=0.12, seed=4)
    dk = a.part("dark", (0, 0.1, 0.9), "emissive")
    pts = [(-1.7, 0.0), (1.7, 0.0)] + [(cos(radians(k * 22.5)) * 1.7, 0.6 + sin(radians(k * 22.5)) * 1.9) for k in range(1, 8)]
    dk.emit(p_poly(pts), "#0b0807", T(0, 0.3, -0.02, 90, 0, 0), jit=0)
    rubble(g, 5, 0.0, -1.0, 1.6, 0.2, 0.4, pal, seed=seed)
    moss_pad(g, 1.0, 0.7, (-0.9, 0.3, 2.55), rz=20, h=0.1)
    vine(g, [(0.9, -0.35, 2.3), (1.05, -0.5, 1.7), (0.9, -0.5, 1.2)], 0.05, leaves=5, ls=0.26)
    a.point("enter", (0, -0.6, 0))
    return a


def root_hole(name, seed):
    """the hollow under the giant tree: thick roots arching over a dark hole"""
    a = Asset(name, G, footprint=1.4, blocksMove=False, tall=True, seed=seed, ao_dist=1.8)
    g, r = a.mesh(), a.rng
    bark = ["#6a4a30", "#5d4029", "#765438"]
    for i, (x0, x1, h, y, rad) in enumerate([(-1.8, 1.7, 2.3, 0.3, 0.3), (-1.4, 2.2, 1.7, -0.2, 0.22), (-2.3, 1.2, 1.5, 0.75, 0.24), (-0.9, 1.3, 2.75, 0.8, 0.26)]):
        pts, rs = [], []
        for k in range(9):
            t = k / 8
            pts.append((x0 + (x1 - x0) * t + 0.12 * sin(t * 9 + i), y + 0.2 * sin(t * 6 + i * 2), h * sin(pi * t) ** 0.8 - 0.1))
            rs.append(rad * (1.25 - 0.5 * sin(pi * t)))
        g.tube(pts, rs, bark[i % 3], n=7, jit=0.05)
    for (x, y, tx, ty, ln) in [(-1.9, 0.2, -3.0, -0.6, 0.2), (1.8, 0.2, 3.1, -0.5, 0.2), (2.1, -0.2, 2.6, -1.4, 0.16), (-1.75, 0.25, -2.2, -1.4, 0.18)]:
        g.tube([(x, y, 0.5), ((x + tx) / 2, (y + ty) / 2, 0.22), (tx, ty, -0.08)], [ln * 1.3, ln, ln * 0.5], pick(r, bark), n=6, jit=0.05)
    g.rock(3.4, 2.2, 3.0, (0.1, 1.9, -0.3), (0, 0, 0), col="#5d4029", n=16, b=0.14, seed=7, grad=(0.84, 1.05))     # the trunk base behind
    dk = a.part("dark", (0, 0.35, 0.7), "emissive")
    pts = [(-1.6, 0.0), (1.6, 0.0)] + [(cos(radians(k * 22.5)) * 1.6, 0.3 + sin(radians(k * 22.5)) * 1.7) for k in range(1, 8)]
    dk.emit(p_poly(pts), "#0b0807", T(0.1, 0.5, -0.02, 90, 0, 0), jit=0)
    for (x, y, z) in [(-2.6, -0.42, 0.2), (2.75, -0.35, 0.18), (2.4, -1.05, 0.12)]:       # mushrooms growing on the roots
        for k in range(3):
            g.lathe([(0.0, -0.1), (0.045, -0.08), (0.04, 0.2), (0.0, 0.22)], (x + k * 0.16, y + 0.1 * (k % 2), z), col=CREAM, n=6)
            g.ball(0.11, (x + k * 0.16, y + 0.1 * (k % 2), z + 0.16 + 0.014 * k), col=pick(r, [RED, "#e0703a"]), n=7, m=3, z0=0.0, z1=1.0, s=(1, 1, 0.7))
    moss_pad(g, 1.2, 0.7, (0.3, 1.2, 2.55), rz=10, h=0.1)
    a.point("enter", (0.1, -0.6, 0))
    return a


def build():
    zip_tower("zip_tower", 91)
    zip_end("zip_end", 92)
    zip_handle("zip_handle", 93)
    boardwalk("boardwalk_a", 94)
    boardwalk("boardwalk_b", 95, broken=True)
    boardwalk("boardwalk_ramp", 96, L=2.6, ramp=True)
    bridge("bridge", 97)
    raft("raft", 98)
    hatch("hatch", 99)
    supply_gondola("supply_gondola", 100)
    cave_mouth("portal_cave", 101)
    cave_mouth("portal_cave_dark", 102, ROCK_D)
    root_hole("portal_roots", 103)


REVIEW = dict(cols=5, cell=6.5, dist=52)
