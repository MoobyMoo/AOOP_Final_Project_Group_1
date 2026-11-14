"""Landmarks: the wrecked prison ferry, the crashed bomber (ep03), the burst molasses vat (ep01), the rusty tractor,
the NOTICE OF AUDIT, the waterfall arch, the message in a bottle, the lemon stand (ep02).
The gameplay camera never orbits (pitch 55, yaw -30), so only tops and the south / west faces are ever seen:
that is where the paint, names and detail go."""
from kit import *

G = "landmarks"


def strakes(g, p0, p1, z0, cols, ph=0.42, thick=0.14, seg=2.4, wob=0.002):
    """hull planking: rows of boards between p0 and p1 (xy), one colour per row from the bottom"""
    p0, p1 = Vector((p0[0], p0[1], 0)), Vector((p1[0], p1[1], 0))
    L = (p1 - p0).length
    r = g.rng
    for i, col in enumerate(cols):
        if col is None:
            continue
        z = z0 + ph * (i + 0.5)
        n = max(1, round(L / seg))
        off = r.uniform(-0.3, 0.3) if n > 1 else 0
        cuts = [0.0] + [min(L - 0.4, max(0.4, L * k / n + off)) for k in range(1, n)] + [L]
        for k in range(n):
            a, b = p0.lerp(p1, cuts[k] / L), p0.lerp(p1, cuts[k + 1] / L)
            a.z = b.z = z
            d = (b - a).normalized() * 0.012
            plank(g, a + d, b - d, ph - 0.022, thick, col=shade(col, r.uniform(0.93, 1.05)), roll=90, wob=wob, b=0.03)


def sand_drift(g, x, y, sx, sy, h, rz=0.0, col=SAND):
    g.drifts = getattr(g, "drifts", 0) + 1
    g.ball(1.0, (x, y, -0.02 - 0.005 * g.drifts), (0, 0, rz), col=col, n=10, m=3, s=(sx, sy, h), z0=0.0, z1=1.0, jit=0.02, hl=1.0, grad=(0.94, 1.04))


def porthole(g, M, r=0.24, bars=False):
    """M: plane on the wall face (local +z out)"""
    with g.at(M):
        g.emit(p_lathe([(r, 0.0), (r + 0.07, 0.02), (r + 0.07, 0.07), (r, 0.09), (r, 0.0)], 10, cap0=False, cap1=False), "#b9a25a", None, jit=0.03)
        g.emit(p_lathe([(0.0, 0.045), (r + 0.012, 0.045)], 10, cap0=False, cap1=False), "#22323a", None, jit=0)
        if bars:
            for x in (-0.1, 0.1):
                g.pole((x, -r, 0.06), (x, r, 0.06), 0.022, IRON, n=4, b=0)


def ferry(name, seed):
    """the wrecked prison ferry, half buried: an open hold you can walk into. Footprint matches WALLS hull-n/s/e:
    x -4.5..5.6 (bow east), y -3..3. The stern (x = -4) is left open for the breakable hull boards."""
    a = Asset(name, G, footprint=5.0, blocksMove=True, blocksShot=True, tall=True, seed=seed, ao_dist=2.4)
    g, r = a.mesh(), a.rng
    W, T_, RU = HULL_W, HULL_T, RUST[1]
    ncols = [RU, W, W, T_, W, W]            # north wall (2.5 high): its inner face is what the camera sees
    scols = [RU, W, T_, W]                  # south wall is lower (the wreck lists and the sand has drifted over it)
    strakes(g, (-4.5, 3.0), (4.4, 3.0), -0.1, ncols)
    strakes(g, (-4.5, -3.0), (-0.2, -3.0), -0.1, scols)
    strakes(g, (1.0, -3.0), (4.4, -3.0), -0.1, scols)
    strakes(g, (-0.2, -3.0), (1.0, -3.0), -0.1, scols[:2])           # a stove-in gap
    bcols = [RU, W, W, T_, W, W, W]
    strakes(g, (4.4, 3.0), (5.65, 0.0), -0.1, bcols)
    strakes(g, (5.65, 0.0), (4.4, -3.0), -0.1, bcols[:5])
    g.box(0.3, 0.3, 3.2, (5.62, 0, -0.1), (0, 8, 0), col=RUST[3], b=0.06)                         # stem post
    # rail caps
    plank(g, (-4.6, 3.0, 2.46), (4.5, 3.0, 2.46), 0.3, 0.1, col=shade(T_, 0.8), b=0.03)
    plank(g, (-4.6, -3.0, 1.62), (-0.25, -3.0, 1.62), 0.3, 0.1, col=shade(T_, 0.8), b=0.03)
    plank(g, (1.05, -3.0, 1.62), (4.45, -3.0, 1.62), 0.3, 0.1, col=shade(T_, 0.8), b=0.03)
    # ribs (inside faces)
    for x in (-2.6, -0.9, 0.8, 2.5, 4.2):
        g.box(0.2, 0.2, 2.5, (x, 2.84, -0.1), col=RUST[3], b=0.04, jit=0.05)
        if not (-0.5 < x < 1.2):
            g.box(0.2, 0.2, 1.66, (x, -2.84, -0.1), col=RUST[3], b=0.04, jit=0.05)
    # stern frame around the breakable opening
    for sy in (-1, 1):
        g.box(0.36, 0.5, 2.72 if sy > 0 else 1.92, (-4.32, sy * 2.78, -0.123), col=RUST[3], b=0.06)
    # deck: planks with a few missing
    rows = 12
    pw = 5.5 / rows
    for i in range(rows):
        y = -2.75 + pw * (i + 0.5)
        x = -4.2
        while x < 4.3:
            ln = r.uniform(1.6, 3.0)
            x1 = min(4.3, x + ln)
            if r.random() > 0.1 and x1 - x > 0.3:
                g.box(x1 - x - 0.03, pw - 0.035, 0.08, ((x + x1) / 2, y, 0.0), (0, 0, r.uniform(-0.4, 0.4)), col=pick(r, WOOD_GREY + WOOD_PALE), b=0.0, jit=0.06)
            x = x1
    g.box(8.7, 5.6, 0.04, (0.0, 0, -0.033), col="#5d4a36", b=0, jit=0)                             # dark under the deck
    # name on the south side, painted big: S.S. TAXMAN
    g.paint_text("TAXMAN", 0.62, FRONT(-2.45, -3.072, 0.7), "#2c3a40", w=0.12)
    # rust streaks under the rail
    for x in (-3.9, -1.0, 1.9, 3.4):
        g.paint_poly([(x - 0.07, 0.0), (x + 0.08, 0.0), (x + 0.03, -0.42), (x - 0.02, -0.55)], FRONT(0, -3.072, 1.55), RUST[2], lift=0.003)
    for x in (-3.4, -0.2, 2.4):
        g.paint_poly([(x - 0.08, 0.0), (x + 0.08, 0.0), (x + 0.03, -0.6), (x - 0.03, -0.75)], FRONT(0, 2.928, 2.35), RUST[2])
    # portholes on the north wall (inner face), one barred
    for i, x in enumerate((-3.45, 1.65, 3.35)):
        porthole(g, FRONT(x, 2.93, 1.62), bars=i == 0)
    # two prison cells against the north wall
    for x in (-3.3, -1.5, 0.3):
        g.box(0.12, 1.5, 2.1, (x, 2.15, 0.06), col="#7d8a8c", b=0.03, jit=0.04)
    g.box(3.75, 0.16, 0.26, (-1.5, 1.42, 1.92), col="#59666b", b=0.04)
    g.box(3.75, 0.14, 0.14, (-1.5, 1.42, 0.06), col="#59666b", b=0.03)
    for i in range(15):
        x = -3.18 + i * 0.24
        if 9 <= i <= 12:
            continue                                # the second cell's door stands open
        g.pole((x, 1.42, 0.12), (x, 1.42, 1.95), 0.04, IRON, n=5, b=0)
    with g.at(T(-0.25, 1.42, 0.0, 0, 0, -115)):        # the open cell door
        g.box(0.95, 0.07, 0.1, (-0.47, 0, 0.14), col="#59666b", b=0.02)
        g.box(0.95, 0.07, 0.1, (-0.47, 0, 1.82), col="#59666b", b=0.02)
        for i in range(4):
            g.pole((-0.1 - i * 0.25, 0, 0.16), (-0.1 - i * 0.25, 0, 1.86), 0.04, IRON, n=5, b=0)
    g.paint_text("01", 0.2, FRONT(-2.4, 1.338, 1.95), CREAM, w=0.05)
    g.paint_text("02", 0.2, FRONT(-0.6, 1.338, 1.95), CREAM, w=0.05)
    g.box(0.6, 1.4, 0.14, (-2.9, 2.1, 0.42), col=KHAKI[1], b=0.04)                               # a bunk
    g.box(0.6, 0.3, 0.1, (-2.9, 2.62, 0.56), col=CREAM, b=0.04)
    g.ball(0.17, (-0.9, 2.2, 0.26), col=IRON, n=8, m=4)                                          # ball and chain
    g.tube([(-0.9, 2.2, 0.3), (-0.6, 2.0, 0.14), (-0.35, 2.1, 0.12)], 0.035, STEEL_D, n=4)
    # raised bow deck with the wheelhouse and the funnel
    g.box(1.75, 5.5, 1.05, (3.62, 0, 0.02), col=shade(W, 0.9), b=0.04, grad=(0.86, 1.02))
    for i in range(6):
        y = -2.5 + i * 1.0
        g.box(1.8, 0.93, 0.07, (3.62, y, 1.07), col=pick(r, WOOD_GREY), b=0.0, jit=0.06)
    for i in range(3):                               # steps
        g.box(0.36, 1.1, 0.33 * (3 - i), (2.56 - i * 0.36 + 0.0, -1.5, 0.05), col=pick(r, WOOD_GREY), b=0.02)
    with g.at(T(3.75, 1.35, 1.12, 0, 0, 0)):          # wheelhouse (roof gone on the south side)
        g.box(1.4, 0.12, 1.5, (0, 0.85, 0), col=W, b=0.03, grad=(0.88, 1.03))
        g.box(0.12, 1.7, 1.5, (0.7, 0, 0), col=W, b=0.03, grad=(0.88, 1.03))
        g.box(0.12, 1.7, 0.7, (-0.7, 0, 0), col=W, b=0.03)
        g.box(1.4, 0.12, 0.6, (0, -0.85, 0), col=W, b=0.03)
        g.box(1.56, 1.0, 0.1, (0.0, 0.42, 1.5), (-9, 0, 0), col=T_, b=0.03)
        for sx in (-1, 1):
            g.box(0.1, 0.1, 0.84, (sx * 0.64, -0.85, 0.6), col=T_, b=0.02)
        # the wheel
        g.emit(p_lathe([(0.3, -0.03), (0.34, 0.0), (0.3, 0.03)], 10, cap0=False, cap1=False), pick(r, WOOD_D), T(-0.1, 0.3, 0.95, 0, 90, 0))
        for k in range(4):
            ang = radians(k * 45)
            g.pole((-0.1, 0.3 - cos(ang) * 0.42, 0.95 - sin(ang) * 0.42), (-0.1, 0.3 + cos(ang) * 0.42, 0.95 + sin(ang) * 0.42), 0.025, pick(r, WOOD), n=4, b=0)
        g.box(0.14, 0.14, 0.9, (0.0, 0.3, 0.0), col=pick(r, WOOD_D), b=0.03)
    with g.at(T(3.6, -1.15, 1.1, 5, -9, 0)):          # the funnel, leaning
        g.lathe([(0.66, 0.0), (0.7, 0.06), (0.62, 0.5), (0.6, 2.1), (0.64, 2.16), (0.64, 2.5), (0.52, 2.5), (0.5, 2.0)], col=lambda c, tg: ("#2b2d31" if c.z > 2.1 else (RED_D if 1.5 < c.z < 2.1 else (T_ if 1.1 < c.z < 1.5 else W))), n=12, cap0=True, cap1=False, grad=(0.9, 1.04), smooth=50)
        g.emit(p_lathe([(0.0, 2.0), (0.5, 2.0)], 12, cap0=False, cap1=False), "#15120f", None, jit=0)
    a.point("smoke", (3.75, -1.2, 3.7))
    # life ring, anchor chain, a broken mast with rope
    g.emit(p_lathe([(0.3, -0.08), (0.42, -0.08), (0.46, 0.0), (0.42, 0.08), (0.3, 0.08), (0.26, 0.0), (0.3, -0.08)], 12, cap0=False, cap1=False), lambda c, tg: RED if int((atan2(c.y, c.x) % (2 * pi)) / (pi / 4)) % 2 == 0 else CREAM, FRONT(0.1, 2.84, 1.55), jit=0, smooth=70)
    g.pole((1.2, -1.2, 0.05), (1.5, -1.5, 3.3), 0.11, pick(r, WOOD_D), n=7, r2=0.08, cap=ENDGRAIN)
    rope(g, [(1.48, -1.48, 3.1), (2.6, -2.2, 2.0), (3.3, -2.8, 1.25)], 0.03, seg=3, sag=0.2)
    g.tube([(5.3, -0.7, 2.5), (5.75, -0.9, 1.6), (5.8, -1.1, 0.6)], 0.05, STEEL_D, n=5)
    with g.at(T(5.82, -1.12, 0.1, 0, 0, 30)):         # anchor
        g.box(0.1, 0.1, 0.9, (0, 0, 0.0), col=IRON, b=0.02)
        g.box(0.7, 0.16, 0.12, (0, 0, 0.004), col=IRON, b=0.03)
        for sx in (-1, 1):
            g.box(0.12, 0.09, 0.3, (sx * 0.32, 0, 0.05), (0, sx * 25, 0), col=IRON, b=0.0)
    # sand: half buried
    sand_drift(g, -2.2, -3.6, 3.2, 1.3, 0.75, 6)
    sand_drift(g, 3.2, -3.5, 2.4, 1.1, 0.6, -8)
    sand_drift(g, 5.9, 0.6, 1.3, 2.2, 0.9, 10)
    sand_drift(g, -3.3, -1.9, 1.3, 1.3, 0.42, 0)
    sand_drift(g, 0.4, -2.7, 1.5, 0.9, 0.5, 0)
    sand_drift(g, 1.6, 3.8, 3.4, 1.0, 0.7, 4)
    return a


# ------------------------------------------------------------------ the bomber
OD, OD_L, OD_D = "#7c8866", "#98a27f", "#5d684d"


def fus_ring(x, ry, rz, zc, n=10, flat=0.0):
    ring = []
    for k in range(n):
        ang = 2 * pi * k / n
        z = sin(ang) * rz
        if z < 0:
            z *= (1 - flat)
        ring.append((x, cos(ang) * ry, zc + z))
    return ring


def wing(g, root, tip, c0, c1, t0, t1, col, sweep=0.0):
    """loft an aerofoil from root to tip (points on the leading edge); chord runs +x"""
    rings = []
    root, tip = Vector(root), Vector(tip)
    for i in range(5):
        t = i / 4
        le = root.lerp(tip, t)
        c, th = c0 + (c1 - c0) * t, t0 + (t1 - t0) * t
        prof = [(0.0, 0.0), (0.12, 0.5), (0.4, 0.62), (0.75, 0.4), (1.0, 0.0), (0.75, -0.25), (0.4, -0.38), (0.12, -0.35)]
        rings.append([(le.x + px * c + sweep * t, le.y, le.z + pz * th) for px, pz in prof])
    g.loft(rings, col, smooth=50, jit=0.02, grad=(0.82, 1.05))
    return rings


AIRFOIL_TOP = [(0.0, 0.0), (0.12, 0.5), (0.4, 0.62), (0.75, 0.4), (1.0, 0.0)]


def wing_top(root, tip, c0, c1, t0, t1):
    """z(x, y) of the top skin of a wing() with the same arguments"""
    root, tip = Vector(root), Vector(tip)

    def z(x, y):
        t = (y - root.y) / (tip.y - root.y)
        le = root.lerp(tip, t)
        u = min(1.0, max(0.0, (x - le.x) / (c0 + (c1 - c0) * t)))
        for (u0, p0), (u1, p1) in zip(AIRFOIL_TOP, AIRFOIL_TOP[1:]):
            if u <= u1:
                return le.z + (p0 + (p1 - p0) * (u - u0) / (u1 - u0)) * (t0 + (t1 - t0) * t)
        return le.z
    return z


def on_surface(zf, x, y):
    """decal plane tangent to the height field zf at (x, y)"""
    e = 0.03
    n = Vector((-(zf(x + e, y) - zf(x - e, y)) / (2 * e), -(zf(x, y + e) - zf(x, y - e)) / (2 * e), 1.0)).normalized()
    p = Vector((x, y, zf(x, y)))
    return along(p, p + n)


def bullet_holes(g, pts, z_of):
    """dark holes ringed with red chalk circles. Only ever called for the wings."""
    for (x, y, s) in pts:
        m = on_surface(z_of, x, y)
        g.paint_poly(circle(0.075 * s, 7), m, "#1a1614", lift=0.01)
        g.paint_line(circle(0.17 * s, 10), 0.045, m, RED, closed=True, lift=0.008)


def propeller(a, name, hub, axis=(-1, 0, 0), bent=False):
    p = a.part(name, hub)
    hub = Vector(hub)
    ax = Vector(axis).normalized()
    p.emit(p_lathe([(0.0, 0.0), (0.16, 0.05), (0.2, 0.22), (0.16, 0.34)], 8, cap1=True), IRON, along(hub + ax * 0.3, hub + ax * 0.3 - ax), jit=0.02)
    for k in range(3):
        ang = radians(k * 120 + 20)
        d = Vector((0, cos(ang), sin(ang)))
        tipd = d * 1.25 + (ax * -0.5 if bent and k != 1 else Vector())
        p.emit(p_box(0.3, 0.06, 1.0, 0.025, taper=(0.55, 0.7)), "#3d4146", along(hub + ax * 0.12 + d * 0.12, hub + ax * 0.12 + d * 0.12 + tipd) @ T(rz=20), jit=0.03)
        p.emit(p_box(0.17, 0.062, 0.2, 0.02), BANANA, along(hub + ax * 0.12 + d * 0.12 + tipd.normalized() * 0.92, hub + ax * 0.12 + d * 0.12 + tipd.normalized() * 2) @ T(rz=20), jit=0.0)
    return p


def bomber(name, seed):
    """ep03: a fictional twin-prop bomber, belly-landed, tail snapped off. Bullet holes ONLY on the wings.
    Nose points -x (west, toward the camera side); wings span y."""
    a = Asset(name, G, footprint=1.3, blocksMove=True, blocksShot=True, tall=False, seed=seed, ao_dist=2.4)
    g, r = a.mesh(), a.rng
    zc = 0.78
    secs = [(-4.9, 0.3, 0.36, 0.7), (-4.4, 0.62, 0.7, 0.74), (-3.4, 0.86, 0.95, 0.8), (-1.8, 0.95, 1.05, 0.82), (0.4, 0.92, 1.0, 0.8), (2.0, 0.78, 0.86, 0.8), (3.1, 0.62, 0.7, 0.82), (3.5, 0.56, 0.62, 0.84)]
    rings = [fus_ring(x, ry, rz, z, 10, 0.18) for x, ry, rz, z in secs]

    def fcol(c, tg):
        if c.x < -4.0:
            return "#9fd0d6" if c.z > 0.5 else OD_D         # glazed nose
        return OD_L if c.z < zc - 0.42 else OD
    g.loft(rings, fcol, cap0=True, cap1=True, smooth=55, jit=0.0, grad=(0.86, 1.05), cap="#2a2622")
    # nose glazing frames + cockpit canopy
    for x in (-4.42, -4.02):
        ry, rz = (0.62, 0.7) if x < -4.2 else (0.74, 0.83)
        g.tube([(x, cos(radians(k * 20)) * (ry + 0.01), 0.76 + sin(radians(k * 20)) * (rz + 0.01)) for k in range(10)], 0.035, OD_D, n=4)
    g.ball(0.62, (-2.6, 0, zc + 0.85), col="#9fd0d6", n=10, m=4, s=(1.5, 0.82, 0.6), z0=0.0, z1=1.0, jit=0.0)
    ca, cb, cc, cx0, cz0 = 0.93, 0.508, 0.372, -2.6, zc + 0.85            # the canopy ellipsoid
    for x in (-3.2, -2.6, -2.0):
        k_ = sqrt(max(0.0, 1 - ((x - cx0) / ca) ** 2))
        g.tube([(x, cos(radians(k * 22.5)) * cb * k_, cz0 + sin(radians(k * 22.5)) * cc * k_) for k in range(9)], 0.03, OD_D, n=4)
    g.tube([(cx0 + dx, 0, cz0 + cc * sqrt(max(0.0, 1 - (dx / ca) ** 2))) for dx in (-0.86, -0.6, -0.3, 0.0, 0.3, 0.6, 0.86)], 0.03, OD_D, n=4)
    # dorsal turret ring (no guns: it is a wreck)
    g.lathe([(0.42, 0.0), (0.46, 0.06), (0.4, 0.2), (0.0, 0.3)], (0.8, 0, zc + 0.92), col=OD_D, n=10)
    # wings: left = +y (north), right = -y (south, snapped: the outer half lies on the ground)
    zw = zc + 0.05
    wl = wing(g, (-1.9, 0.75, zw), (-1.2, 6.2, 0.42), 2.5, 1.3, 0.3, 0.14, OD)
    wr = wing(g, (-1.9, -0.75, zw), (-1.5, -3.5, 0.62), 2.5, 1.9, 0.3, 0.22, OD)
    with g.at(T(-1.2, -4.9, 0.14, 4, 7, -24)):
        wing(g, (0, 0.9, 0), (0.5, -1.9, 0), 1.9, 1.25, 0.22, 0.14, OD)
        zb = wing_top((0, 0.9, 0), (0.5, -1.9, 0), 1.9, 1.25, 0.22, 0.14)
        bullet_holes(g, [(0.75, 0.3, 1.0), (1.25, -0.4, 0.9), (0.7, -0.9, 1.1), (1.2, -1.45, 0.8), (1.0, -0.1, 0.8)], zb)
        mr = on_surface(zb, 1.25, -1.0)
        g.paint_poly(circle(0.27, 12), mr, "#d9ae36", lift=0.008)                 # roundel: a banana-yellow disc with a dark ring
        g.paint_line(circle(0.27, 12), 0.07, mr, "#2f3a2a", closed=True, lift=0.011)
    # jagged break on the right wing stub
    g.emit(p_prism([(0.0, -0.1), (0.5, 0.08), (0.9, -0.12), (1.4, 0.1), (1.85, -0.06), (1.85, -0.3), (0.0, -0.3)], 0.2), "#2a2622", T(-1.52, -3.5, 0.52, 0, 0, 0), jit=0)

    zl = wing_top((-1.9, 0.75, zw), (-1.2, 6.2, 0.42), 2.5, 1.3, 0.3, 0.14)
    zr = wing_top((-1.9, -0.75, zw), (-1.5, -3.5, 0.62), 2.5, 1.9, 0.3, 0.22)
    bullet_holes(g, [(-0.6, 1.7, 1.0), (0.0, 2.0, 0.8), (-0.75, 3.3, 1.1), (-0.2, 3.5, 0.9), (-0.55, 5.05, 0.9), (-0.25, 5.4, 0.8), (-0.45, 5.8, 0.7), (0.05, 1.3, 0.9), (-0.25, 2.8, 1.0), (-0.9, 2.3, 0.8)], zl)
    bullet_holes(g, [(-0.7, -1.5, 1.0), (-0.1, -1.2, 0.9), (0.2, -2.0, 1.0), (-0.9, -2.9, 0.9), (-0.3, -3.1, 1.0), (0.1, -2.7, 0.8)], zr)
    mr = on_surface(zl, -0.3, 4.3)
    g.paint_poly(circle(0.3, 12), mr, "#d9ae36", lift=0.008)
    g.paint_line(circle(0.3, 12), 0.075, mr, "#2f3a2a", closed=True, lift=0.011)
    # engines + props
    for sy, y in ((1, 2.6), (-1, -2.5)):
        zc_e = zw + (0.42 - zw) * ((abs(y) - 0.75) / 5.45) + 0.02
        g.lathe([(0.0, 0.0), (0.34, 0.12), (0.5, 0.6), (0.52, 1.5), (0.5, 1.9), (0.42, 2.0)], (y * 0 + 0.55, y, zc_e), (0, -90, 0), col=lambda c, tg: OD_D if c.z > 1.5 else OD, n=10, cap1=True, cap="#1c1a18", smooth=55, grad=(1.0, 1.0))
        propeller(a, "prop_l" if sy > 0 else "prop_r", (-1.5, y, zc_e), bent=sy < 0)
    # tail: snapped off, lying behind at an angle
    with g.at(T(5.0, 0.9, 0.0, -8, 4, -22)):
        tsec = [(-0.9, 0.56, 0.62, 0.72), (0.0, 0.48, 0.52, 0.74), (1.2, 0.34, 0.36, 0.8), (2.1, 0.16, 0.18, 0.86)]
        g.loft([fus_ring(x, ry, rz, z, 10, 0.15) for x, ry, rz, z in tsec], OD, smooth=55, jit=0.0, grad=(0.86, 1.05), cap="#2a2622")
        wing(g, (1.0, -0.1, 0.84), (1.25, -2.0, 0.84), 1.15, 0.8, 0.14, 0.1, OD)
        wing(g, (1.0, 0.1, 0.84), (1.25, 2.0, 0.84), 1.15, 0.8, 0.14, 0.1, OD)
        for sy in (-1, 1):       # twin fins
            g.emit(p_prism([(0.0, -0.42), (0.6, -0.55), (0.95, -0.2), (0.95, 0.45), (0.55, 0.8), (0.1, 0.5)], 0.1, 0.03), OD, T(1.2, sy * 1.95 + 0.07, 0.84, 90, 0, 0), jit=0.02)
            g.paint_poly([(0.3, -0.3), (0.75, -0.3), (0.75, 0.3), (0.3, 0.3)], T(1.2, sy * 1.95 - 0.03, 0.84, 90, 0, 0), "#d9ae36", lift=0.006)
            g.paint_poly([(0.3, -0.1), (0.75, -0.1), (0.75, 0.1), (0.3, 0.1)], T(1.2, sy * 1.95 - 0.03, 0.84, 90, 0, 0), "#2f3a2a", lift=0.011)
    # nose art on the south side: a grinning banana and mission tallies (painted, no holes here)
    m = FRONT(-3.25, -0.823, 0.969) @ T(rx=-16.4)             # on the fuselage facet just above the waist
    icon_banana(g, m, 0.62, BANANA)
    for i in range(5):
        g.paint_line([(0.5 + i * 0.1, -0.1), (0.5 + i * 0.1, 0.14)], 0.04, m, CREAM)
    # the furrow it ploughed + dirt piled at the nose
    for (x, y, sx, sy, h, rz) in [(-5.0, 0.2, 1.3, 1.6, 0.75, 0), (-4.2, -1.2, 1.1, 0.9, 0.5, 20), (-4.1, 1.3, 1.0, 0.9, 0.5, -20), (2.6, 0.5, 1.6, 0.8, 0.42, -18), (2.2, -0.5, 1.5, 0.8, 0.42, 14)]:
        sand_drift(g, x, y, sx, sy, h, rz, col="#7a6248")
    rubble(g, 6, -4.6, -1.6, 1.0, 0.2, 0.4, ["#6e5a44", "#806a52"], seed=seed, z=-0.0013)
    a.point("loot", (1.2, -1.6, 0.1))
    return a


# ------------------------------------------------------------------ the molasses vat
AMBER, AMBER_L, AMBER_H = "#3f1d08", "#6a3510", "#c98a3c"


def blob_outline(r0, n, seed, lobes=5, amp=0.22):
    rg = random.Random(seed)
    ph = [rg.uniform(0, 2 * pi) for _ in range(3)]
    pts = []
    for k in range(n):
        a = 2 * pi * k / n
        rr = r0 * (1 + amp * sin(lobes * a + ph[0]) + amp * 0.5 * sin((lobes + 2) * a + ph[1]) + amp * 0.3 * sin(2 * a + ph[2]))
        pts.append((cos(a) * rr, sin(a) * rr))
    return pts


def vat(name, seed):
    """ep01: a riveted tank burst open on the camera side, molasses pouring into a sticky puddle"""
    a = Asset(name, G, footprint=1.95, blocksMove=True, blocksShot=True, tall=True, seed=seed, ao_dist=2.6)
    g, r = a.mesh(), a.rng
    R, H, n = 1.85, 3.1, 18
    tank = ["#a8926c", "#9c8660", "#b39d76"]
    gap0, gap1 = 158.0, 232.0                     # the split faces west: the camera sees the split and the riveted south face
    arc = 360 - (gap1 - gap0)

    def panel(c, tg):
        if c.x * c.x + c.y * c.y < (R - 0.11) ** 2:
            return "#3a2a1c"                           # the inside of the wall
        ang = (degrees(atan2(c.y, c.x))) % 360
        return tank[(int(ang / (arc / 9)) + int(c.z / 1.0)) % 3]
    prof = [(R - 0.1, 0.2), (R, 0.26), (R, H - 0.06), (R - 0.04, H), (R - 0.14, H), (R - 0.14, 0.26)]
    g.emit(p_lathe(prof, n, cap0=False, cap1=False, arc=arc), panel, T(0, 0, 0, 0, 0, gap1), smooth=40, jit=0.0, grad=(0.84, 1.05))
    for z in (0.5, 1.5, 2.5, H - 0.12):          # hoops
        g.emit(p_lathe([(R + 0.0, z - 0.08), (R + 0.06, z - 0.06), (R + 0.06, z + 0.06), (R, z + 0.08)], n, cap0=False, cap1=False, arc=arc), RUST[3], T(0, 0, 0, 0, 0, gap1), jit=0.03)
        for k in range(n):
            ang = radians(gap1 + arc * (k + 0.5) / n)
            if z < H - 0.2:
                g.emit(p_sphere(0.05, 5, 2, z0=0.0, z1=1.0), "#c9b48a", along((cos(ang) * (R + 0.055), sin(ang) * (R + 0.055), z), (cos(ang) * 3, sin(ang) * 3, z)), jit=0.02)
    # base ring + legs
    for k in range(8):
        ang = radians(k * 45 + 22)
        stone_block(g, 0.9, 0.5, 0.32, (cos(ang) * (R - 0.2), sin(ang) * (R - 0.2), -0.04), (0, 0, degrees(ang) + 90), b=0.07)
    g.cyl(R - 0.16, 0.1, (0, 0, 0.2), col="#3a2a1c", n=n, b=0)
    # torn plates peeled outward at both edges of the split
    for ang, sgn in ((gap0, 1), (gap1, -1)):
        for i, z in enumerate((0.45, 1.3, 2.15)):
            base = Vector((cos(radians(ang)) * R, sin(radians(ang)) * R, z))
            out = Vector((cos(radians(ang + sgn * (38 + i * 14))), sin(radians(ang + sgn * (38 + i * 14))), 0))
            tip = base + out * (0.85 - i * 0.14) + Vector((0, 0, 0.1 * i))
            g.emit(p_box(0.82, 0.07, (tip - base).length, 0.02), pick(r, tank), along(base - out * 0.08, tip), jit=0.05, warp=lambda v: Vector((v.x * (1 - v.z * 0.25), v.y + v.z * v.z * 0.18, v.z)))
    # molasses: the level inside, the tongue pouring out, the puddle (its own node)
    mid = radians((gap0 + gap1) / 2)
    dx, dy = cos(mid), sin(mid)
    g.cyl(R - 0.16, 0.12, (0, 0, 0.95), col=AMBER, n=n, b=0, jit=0, cap=AMBER_L)
    px, py = -dy, dx
    rings = []
    for (d, w, z, hh) in [(R - 0.5, 1.5, 1.06, 0.2), (R + 0.0, 1.35, 0.98, 0.34), (R + 0.5, 1.25, 0.6, 0.4), (R + 0.95, 1.4, 0.2, 0.3), (R + 1.5, 1.8, 0.06, 0.12)]:
        ring = []
        for k in range(8):
            ang = 2 * pi * k / 8
            off = cos(ang) * w / 2
            ring.append((dx * d + px * off, dy * d + py * off, max(0.02, z + sin(ang) * hh)))
        rings.append(ring)
    g.loft(rings, AMBER, smooth=70, jit=0, hl=1.0, cap=AMBER)
    for (d, off, s) in [(R + 0.35, -0.2, 0.5), (R + 0.8, 0.25, 0.42)]:        # glossy streaks on the tongue
        g.ball(0.2, (dx * d + px * off, dy * d + py * off, 0.82 if d < R + 0.5 else 0.44), (0, 0, degrees(mid)), col=AMBER_H, n=6, m=3, s=(s * 2.2, 0.5, 0.35), jit=0)
    pd = a.part("puddle", (dx * 3.0, dy * 3.0, 0))
    with pd.at(T(dx * 3.0, dy * 3.0, 0.0, 0, 0, degrees(mid))):
        pd.emit(p_prism(blob_outline(2.5, 22, seed, 5, 0.16), 0.05, 0.03), {0: AMBER, 1: AMBER_L, 2: AMBER}, T(0, 0, -0.01, 0, 0, 0, 1.25, 1.0, 1.0), jit=0, smooth=70)
        for (x, y, s, rz) in [(-0.9, 0.5, 0.55, 30), (0.7, -0.7, 0.4, -20), (1.5, 0.6, 0.35, 60), (-0.3, -1.1, 0.3, 0)]:
            pd.paint_poly(blob_outline(s, 9, seed + int(x * 10), 3, 0.25), TOP(x, y, 0.04) @ T(rz=rz) @ Matrix.Diagonal((1.8, 0.55, 1, 1)), AMBER_H)
        pd.paint_line([(-2.3, 0.4), (-1.6, 1.3), (-0.4, 1.75), (1.0, 1.65), (2.2, 1.0)], 0.1, TOP(0, 0, 0.04), AMBER_L, taper=(0.3, 1.0))
    # things stuck in it
    g.cyl(0.4, 0.6, (dx * 3.9 + 0.3, dy * 3.9 - 1.2, -0.22), (62, 0, 30), col=pick(r, WOOD), n=10, b=0.03)
    # a ladder up the east side, a pipe and a valve wheel
    ladder(g, (R + 0.5, -0.9, 0), (R + 0.12, -0.75, H + 0.25), 0.6, 0.38, col=RUST[0], face=(1, -0.2, 0))
    g.tube([(-0.9, R - 0.05, 2.2), (-0.9, R + 0.45, 2.2), (-0.9, R + 0.45, 0.2)], 0.11, STEEL_D, n=7)
    g.emit(p_lathe([(0.0, -0.03), (0.2, -0.03), (0.25, 0.0), (0.2, 0.03), (0.0, 0.03)], 9, cap0=False, cap1=False), RED, T(-0.9, R + 0.62, 1.2, 90, 0, 0))
    g.pole((-0.9, R + 0.45, 1.2), (-0.9, R + 0.66, 1.2), 0.04, STEEL_D, n=5)
    # sign plate on the south-east face
    sa = radians(292)
    with g.at(T(cos(sa) * (R + 0.14), sin(sa) * (R + 0.14), 1.72, 0, 0, degrees(sa) + 90)):
        g.box(2.1, 0.07, 0.86, (0, 0, -0.43), col=CREAM, b=0.03, jit=0.02)
        g.paint_text("MOLASSES", 0.26, FRONT(0, -0.036, 0.02), "#5a2c0e", w=0.06)
        g.paint_poly([(-0.9, -0.26), (0.9, -0.26), (0.9, -0.18), (-0.9, -0.18)], FRONT(0, -0.036, 0.0), RED_D)
        rivets(g, [(sx * 0.95, -0.04, sz * 0.33) for sx in (-1, 1) for sz in (-1, 1)], 0.035, IRON)
    a.point("pour", (dx * (R + 0.4), dy * (R + 0.4), 0.9))
    return a


# ------------------------------------------------------------------ the tractor
def wheel(g, at, R, w, lugs=12, col="#34303a", hub=RUST[0], flat=0.0):
    """wheel on the local x axis at `at`"""
    with g.at(T(*at) @ T(ry=90)):
        prof = [(R * 0.55, -w / 2), (R * 0.9, -w / 2), (R, -w * 0.3), (R, w * 0.3), (R * 0.9, w / 2), (R * 0.55, w / 2)]
        g.emit(p_lathe(prof, 14, cap0=False, cap1=False), col, None, smooth=50, jit=0.03, grad=(1, 1))
        g.emit(p_lathe([(0.0, -w * 0.32), (R * 0.2, -w * 0.38), (R * 0.56, -w * 0.3), (R * 0.56, w * 0.3), (R * 0.2, w * 0.38), (0.0, w * 0.32)], 10), hub, None, smooth=50, jit=0.04)
        for k in range(lugs):
            ang = 2 * pi * k / lugs
            g.box(R * 0.2, 0.1, w * 0.9, (cos(ang) * R * 1.0, sin(ang) * R * 1.0, -w * 0.45), (0, 0, degrees(ang)), col=shade(col, 0.85), b=0.02, jit=0.03)


def tractor(name, seed):
    a = Asset(name, G, footprint=1.5, blocksMove=True, blocksShot=True, tall=False, seed=seed, ao_dist=1.8)
    g, r = a.mesh(), a.rng
    body = ["#b4553a", "#a84c33", "#bd6042"]
    # nose points -x. Rear wheels at x = +0.85
    wheel(g, (0.85, -0.92, 0.88), 0.88, 0.5, 12)
    wheel(g, (0.85, 0.92, 0.82), 0.88, 0.5, 12)
    wheel(g, (-1.25, -0.62, 0.46), 0.46, 0.26, 8, hub=RUST[2])
    with g.at(T(-1.25, 0.62, 0.36, 14, 0, 0)):
        wheel(g, (0, 0, 0.1), 0.46, 0.26, 8, hub=RUST[2])
    g.pole((-1.25, -0.7, 0.46), (-1.25, 0.7, 0.44), 0.07, IRON, n=6)
    g.pole((0.85, -0.9, 0.86), (0.85, 0.9, 0.84), 0.11, IRON, n=7)
    # chassis + hood
    g.box(2.5, 0.5, 0.36, (-0.2, 0, 0.62), col=IRON, b=0.05)
    g.box(1.75, 0.72, 0.74, (-0.72, 0, 0.92), col=pick(r, body), b=0.14, grad=(0.86, 1.05), jit=0.03)
    g.box(0.12, 0.76, 0.8, (-1.62, 0, 0.9), col=RUST[3], b=0.04)                                   # radiator
    for i in range(5):
        g.box(0.03, 0.56, 0.07, (-1.69, 0, 1.0 + i * 0.13), col="#2a2622", b=0.0, jit=0)
    g.cyl(0.07, 0.86, (-0.7, 0.2, 1.62), col=RUST[3], n=7, b=0.02)                                  # exhaust
    g.cyl(0.1, 0.16, (-0.7, 0.2, 2.44), col=RUST[2], n=7, b=0.02)
    g.cyl(0.09, 0.1, (-1.3, 0, 1.66), col=RUST[2], n=7, b=0.02)                                     # radiator cap
    # paint flaking: paler patches + rust blotches on the hood top and south side
    g.paint_poly(blob_outline(0.26, 8, 3, 3, 0.3), TOP(-0.9, -0.05, 1.661), RUST[0])
    g.paint_poly(blob_outline(0.18, 8, 4, 3, 0.3), TOP(-0.2, 0.1, 1.661), RUST[3])
    g.paint_poly(blob_outline(0.22, 8, 5, 3, 0.3), FRONT(-0.5, -0.361, 1.3), RUST[0])
    icon_banana(g, FRONT(-1.05, -0.361, 1.12), 0.4, CREAM)
    # fenders over the rear wheels, seat, steering
    for sy in (-1, 1):          # fenders: a quarter hoop over each rear wheel
        rings = []
        for k in range(5):
            ang = radians(35 + k * 27.5)
            rings.append([(0.85 - cos(ang) * 1.0, sy * 0.66, 0.86 + sin(ang) * 1.0), (0.85 - cos(ang) * 1.0, sy * 1.16, 0.86 + sin(ang) * 1.0), (0.85 - cos(ang) * 1.07, sy * 1.16, 0.86 + sin(ang) * 1.07), (0.85 - cos(ang) * 1.07, sy * 0.66, 0.86 + sin(ang) * 1.07)])
        g.loft(rings, pick(r, body), smooth=40, jit=0.03)
        g.paint_poly(blob_outline(0.16, 8, 6 + sy, 3, 0.3), TOP(0.85, sy * 0.92, 1.935), RUST[3])
    g.box(0.9, 1.3, 0.12, (0.75, 0, 0.98), col=IRON, b=0.03)
    g.pole((0.62, 0, 1.05), (0.7, 0, 1.5), 0.05, IRON, n=5)
    g.lathe([(0.0, 0.0), (0.3, 0.02), (0.36, 0.14), (0.3, 0.12), (0.0, 0.06)], (0.72, 0, 1.48), (0, 8, 0), col=RUST[2], n=9, s=(1, 1.15, 1))
    g.box(0.1, 0.6, 0.4, (0.98, 0, 1.56), (0, 12, 0), col=RUST[2], b=0.04)
    g.pole((0.12, 0, 1.3), (0.34, 0, 1.92), 0.04, IRON, n=5)
    g.emit(p_lathe([(0.26, -0.03), (0.31, 0.0), (0.26, 0.03)], 10, cap0=False, cap1=False), IRON, along((0.34, 0, 1.92), (0.5, 0, 2.4)))
    for k in range(3):
        ang = radians(k * 120)
        m = along((0.34, 0, 1.92), (0.5, 0, 2.4))
        g.pole(m @ Vector((0, 0, 0)), m @ Vector((cos(ang) * 0.28, sin(ang) * 0.28, 0)), 0.022, IRON, n=4, b=0)
    # overgrown: grass tufts and a vine over the hood
    vine(g, [(-1.55, -0.4, 0.3), (-1.3, -0.42, 1.0), (-0.9, -0.2, 1.7), (-0.4, 0.3, 1.68), (-0.1, 0.42, 1.2)], 0.045, leaves=8, ls=0.22, face=(0, -0.4, 1))
    return a


# ------------------------------------------------------------------ small ones
def audit_notice(name, seed):
    """NOTICE OF AUDIT, nailed to the giant tree: authored against the plane y = 0, facing -y, 1.2 u up the trunk"""
    a = Asset(name, G, footprint=0.2, seed=seed, ground=False, wall=0.02, ao_dist=0.6)
    g, r = a.mesh(), a.rng
    z0 = 1.25
    g.box(1.5, 0.08, 2.0, (0, -0.02, z0 - 0.1), (0, 0, 0), col=pick(r, WOOD_D), b=0.03, jit=0.04)          # backing board
    grid = [[(-0.6 + 1.2 * i / 3, -0.08 - 0.05 * ((i == 0 and k == 0) or (i == 3 and k == 3)) - 0.012 * sin(i * 2 + k), z0 + 1.7 * k / 3) for k in range(4)] for i in range(4)]
    g.sheet(grid, PAPER, 0.02, jit=0.0)
    m = FRONT(0, -0.094, z0)
    g.paint_text("NOTICE", 0.2, m @ T(0, 1.36, 0), "#2a2622", w=0.045)
    g.paint_text("OF AUDIT", 0.17, m @ T(0, 1.08, 0), RED_D, w=0.042)
    g.paint_line([(-0.48, 1.0), (0.48, 1.0)], 0.03, m, "#2a2622")
    for i in range(5):
        g.paint_line([(-0.46, 0.84 - i * 0.13), (0.46 - (0.3 if i == 4 else 0.0) - 0.07 * (i % 2), 0.84 - i * 0.13)], 0.035, m, "#8f8676")
    # the red stamp
    ms = m @ T(0.2, 0.3, 0, 0, 0, -16)
    g.paint_line(circle(0.24, 14), 0.045, ms, RED, closed=True)
    g.paint_line(circle(0.16, 12), 0.025, ms, RED, closed=True)
    g.paint_text("DUE", 0.11, ms @ T(0, -0.055, 0), RED, w=0.03)
    g.paint_line([(-0.5, 0.2), (-0.3, 0.3), (-0.2, 0.18), (-0.38, 0.14)], 0.03, m, "#3a4a7a", lift=0.015)          # a signature scrawl
    for (x, z) in ((0, 1.62), (-0.5, 0.1), (0.52, 0.06)):
        g.cyl(0.05, 0.08, (x, -0.07, z0 + z), (90, 0, 0), col=IRON, n=6, b=0.012)
    return a


def falls(name, seed):
    """a rock arch with a sheet of water you walk through; the nook behind it is open to the sky so the camera sees in"""
    a = Asset(name, G, footprint=2.6, blocksMove=False, tall=True, seed=seed, ao_dist=2.6)
    g, r = a.mesh(), a.rng
    RK = ["#8a8275", "#7d766a", "#958c7d", "#6f695f"]
    for sx in (-1, 1):       # the two piers
        g.rock(2.4, 2.2, 3.4, (sx * 2.9, 0.2, -0.3), (0, 0, r.uniform(0, 90)), col=pick(r, RK), n=16, b=0.14, seed=r.random(), grad=(0.84, 1.06))
        g.rock(2.1, 1.9, 2.6, (sx * 2.95, 0.25, 1.7), (0, 0, r.uniform(0, 90)), col=pick(r, RK), n=14, b=0.12, seed=r.random(), flatbase=False)
        g.rock(1.7, 1.6, 1.3, (sx * 3.1, -0.5, -0.2), (0, 0, r.uniform(0, 90)), col=pick(r, RK), n=12, b=0.1, seed=r.random())
    # the lintel the water pours over
    g.rock(5.6, 2.2, 1.3, (0, 0.5, 4.2), (0, 0, 4), col=RK[2], n=18, b=0.14, seed=3, flatbase=False)
    g.rock(2.6, 1.6, 0.9, (-0.6, 0.9, 5.0), (0, 0, 30), col=RK[0], n=12, b=0.1, seed=5, flatbase=False)
    # rocks ringing the nook behind (north): lower in front of it, higher at the back
    for i in range(11):
        ang = radians(12 + i * 15.6)
        rad = 4.5 + r.uniform(-0.2, 0.2)
        s = r.uniform(2.3, 2.9)
        g.rock(s, s * 0.9, s * r.uniform(1.1, 1.7), (cos(ang) * rad * 1.05, 1.0 + sin(ang) * rad * 0.8, -0.3), (0, 0, r.uniform(0, 360)), col=pick(r, RK), n=13, b=0.12, seed=r.random(), grad=(0.84, 1.06))
    vine(g, [(-2.2, -0.5, 4.3), (-2.35, -0.75, 3.5), (-2.2, -0.8, 2.7), (-2.35, -0.8, 1.9)], 0.06, leaves=7, ls=0.3)
    vine(g, [(2.25, -0.4, 4.2), (2.4, -0.7, 3.4), (2.2, -0.75, 2.8)], 0.06, leaves=5, ls=0.3)
    # the water sheet: its own node (swap the material for a translucent one, scroll or wobble it)
    w = a.part("water", (0, -0.55, 4.25), "foliage")
    cols = ["#cfeff9", "#eafcff", "#a9dcee", "#dff6fc", "#bfe6f3"]
    grid = []
    for i in range(8):
        x = -1.75 + 3.5 * i / 7
        row = []
        for k in range(9):
            t = k / 8
            row.append((x + 0.04 * sin(k * 1.7 + i), -0.55 - 0.42 * t - 0.25 * t * t + 0.05 * sin(i * 2.1), 4.25 - 4.2 * t))
        grid.append(row)
    w.sheet(grid, lambda c, tg: cols[int((c.x + 1.75) / 3.5 * 7.999) % 5], 0.05, smooth=70, jit=0.0)
    # foam at the foot (static, bright)
    for i in range(9):
        x = -1.9 + i * 0.47 + r.uniform(-0.08, 0.08)
        g.ball(r.uniform(0.24, 0.38), (x, -1.2 + r.uniform(-0.2, 0.15), -0.02 - 0.004 * i), col="#f2fbff", n=7, m=3, s=(1.2, 1.0, 0.55), z0=0.0, z1=1.0, jit=0.0, hl=1.0)
    a.point("foam", (0, -1.25, 0.2))
    a.point("nook", (0.6, 3.0, 0))
    return a


def bottle(name, seed):
    a = Asset(name, G, footprint=0.3, seed=seed)
    g, r = a.mesh(), a.rng
    sand_drift(g, 0.05, 0.05, 0.62, 0.5, 0.16)
    with g.at(T(0, 0, 0.14, 0, 62, 24)):
        g.lathe([(0.0, 0.0), (0.16, 0.02), (0.19, 0.12), (0.19, 0.5), (0.1, 0.68), (0.075, 0.72), (0.075, 0.9), (0.09, 0.92), (0.09, 0.96), (0.0, 0.96)], col=lambda c, tg: "#7fc4a8" if c.z < 0.62 else "#5aa88c", n=9, smooth=55, jit=0.0)
        g.cyl(0.065, 0.12, (0, 0, 0.95), col="#b98a55", n=7, b=0.02)
        g.emit(p_lathe([(0.192, 0.16), (0.192, 0.46)], 9, cap0=False, cap1=False, arc=150), PAPER, T(rz=200), jit=0)   # the rolled note showing through
        g.emit(p_lathe([(0.194, 0.28), (0.194, 0.33)], 9, cap0=False, cap1=False, arc=150), RED, T(rz=200), jit=0)
    a.point("note", (0, 0, 0.4))
    return a


def lemon_stand(name, seed):
    """ep02: where the invisible bandit gets his lemon juice"""
    a = Asset(name, G, footprint=0.6, blocksMove=True, seed=seed)
    g, r = a.mesh(), a.rng
    w, d, h = 1.0, 0.7, 0.42
    g.box(w - 0.04, d - 0.04, 0.06, col=pick(r, WOOD_D), b=0.02)
    for sy in (-1, 1):
        for i in range(2):
            plank(g, (-w / 2, sy * (d / 2 - 0.03), 0.12 + i * 0.17), (w / 2, sy * (d / 2 - 0.03), 0.12 + i * 0.17), 0.14, 0.05, roll=90, pal=WOOD_PALE)
            plank(g, (sy * (w / 2 - 0.03), -d / 2 + 0.03, 0.12 + i * 0.17), (sy * (w / 2 - 0.03), d / 2 - 0.03, 0.12 + i * 0.17), 0.05, 0.14, pal=WOOD_PALE)
    LEM = ["#f4e04a", "#ecd23a", "#d9dc4a"]
    for i in range(11):
        g.ball(0.12, (r.uniform(-0.33, 0.33), r.uniform(-0.2, 0.2), 0.3 + (0.14 if i > 6 else 0)), (r.uniform(0, 90), r.uniform(0, 90), 0), col=pick(r, LEM), n=7, m=4, s=(1.25, 1, 1), jit=0.03)
    g.box(w - 0.14, d - 0.14, 0.24, (0, 0, 0.05), col="#3b2c20", b=0.0, jit=0)
    # a jug of juice and two squeezed halves on a stump
    log(g, (0.95, 0.1, -0.04), (0.95, 0.1, 0.4), 0.3, n=9)
    g.lathe([(0.0, 0.0), (0.12, 0.01), (0.15, 0.1), (0.14, 0.26), (0.08, 0.34), (0.09, 0.4), (0.0, 0.4)], (0.9, 0.12, 0.4), col="#e9e6a8", n=8, smooth=55)
    for (x, y) in ((1.1, -0.05), (1.05, 0.28)):
        g.ball(0.1, (x, y, 0.4), col=LEM[0], n=7, m=2, z0=0.0, z1=1.0, s=(1, 1, 0.8), cap=CREAM)
    g.box(0.7, 0.05, 0.4, (0, -d / 2 - 0.2, 0.5), (-14, 0, 6), col=pick(r, WOOD_PALE), b=0.02)
    g.pole((0.0, -d / 2 - 0.16, 0), (0, -d / 2 - 0.18, 0.62), 0.04, pick(r, WOOD_D), n=5)
    m = T(0, -d / 2 - 0.2, 0.5, -14, 0, 6) @ FRONT(0, -0.027, 0.2)
    g.paint_poly(circle(0.11, 9, ry=0.085), m @ T(-0.18, 0, 0), LEM[0])
    g.paint_text("5", 0.2, m @ T(0.1, -0.1, 0), "#2a2622", w=0.05)
    icon_banana(g, m @ T(0.26, -0.13, 0), 0.2, BANANA_D)
    return a


def build():
    ferry("ferry", 81)
    bomber("bomber", 82)
    vat("vat", 83)
    tractor("tractor", 84)
    audit_notice("audit", 85)
    falls("falls", 86)
    bottle("bottle", 87)
    lemon_stand("lemon_stand", 88)


REVIEW = dict(cols=3, cell=14, dist=64)
