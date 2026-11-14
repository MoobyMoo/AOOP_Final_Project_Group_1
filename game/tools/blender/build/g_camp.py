"""Peel Gang camp: tents, tarp lean-to, bedrolls, campfire, lanterns, stick fence + gate, watchtower, well, log
bench, signposts."""
from kit import *

G = "camp"


def tent_bell(name, seed, R=1.8, H=2.55):
    """six-panel bell tent: panels sag between the poles, dark hem, guy ropes, a dark doorway on the front panel"""
    a = Asset(name, G, footprint=1.7, blocksMove=True, blocksShot=True, tall=True, seed=seed, ao_dist=2.0)
    g, r = a.mesh(), a.rng
    panel_col = [pick(r, CANVAS) for _ in range(6)]
    prof = [(0.0, 1.0, 1.0), (0.17, 0.99, 1.0), (0.8, 0.9, 0.95), (1.55, 0.5, 0.92), (2.2, 0.15, 0.97), (H, 0.05, 1.0)]
    rings = []
    for z, k, sag in prof:
        ring = []
        for i in range(12):
            ang = radians(i * 30)
            rad = R * k if i % 2 == 0 else R * k * cos(radians(30)) * sag
            ring.append((cos(ang) * rad, sin(ang) * rad, z))
        rings.append(ring)

    def col(c, tg):
        if c.z < 0.17:
            return CANVAS_D
        if c.z > 2.2:
            return "#a08c62"
        return panel_col[int(((atan2(c.y, c.x) % (2 * pi)) / (pi / 3))) % 6]
    g.loft(rings, col, cap0=True, smooth=28, grad=(0.92, 1.06), jit=0.0)
    g.cyl(0.07, 0.42, (0, 0, H - 0.06), col=pick(r, WOOD_D), n=6, b=0.02)
    g.ball(0.1, (0, 0, H + 0.38), col=RED, n=8, m=4)
    # doorway on the front panel (facing -y): a dark wedge with rolled flaps
    p0, p1 = Vector((0, -R * 0.866, 0.0)), Vector((0, -R * 0.5 * 0.866 * 0.92, 1.55))
    up = (p1 - p0).normalized()
    nrm = Vector((1, 0, 0)).cross(up)
    if nrm.y > 0:
        nrm = -nrm
    m = Matrix((Vector((1, 0, 0)), up, nrm)).transposed().to_4x4()
    m.translation = p0
    g.emit(p_prism([(-0.52, 0.0), (0.52, 0.0), (0.12, 1.42), (-0.12, 1.42)], 0.2), "#2a2019", m @ T(0, 0.02, -0.1), jit=0)
    for sx in (-1, 1):       # the flaps, tied back flat against the panel
        g.emit(p_prism([(sx * 0.5, 0.0), (sx * 0.13, 1.44), (sx * 0.62, 1.0), (sx * 1.0, 0.04)], 0.06), pick(r, CANVAS), m @ T(0, 0, 0.1), jit=0.03)
        g.emit(p_sphere(0.07, 6, 3), ROPE, m @ T(sx * 0.72, 0.7, 0.19), jit=0)
    # guy ropes + pegs from every pole
    for i in range(6):
        ang = radians(i * 60)
        top = Vector((cos(ang) * R * 0.9, sin(ang) * R * 0.9, 0.8))
        peg = Vector((cos(ang) * (R + 0.85), sin(ang) * (R + 0.85), 0.04))
        g.tube([top, peg], 0.03, ROPE, n=4)
        g.beam(peg + Vector((0, 0, -0.06)), peg + Vector((cos(ang) * 0.08, sin(ang) * 0.08, 0.26)), 0.1, 0.1, pick(r, WOOD_D), b=0.015)
    return a


def tent_ridge(name, seed, L=2.9, W=2.3, H=1.75):
    """low ridge tent, open at the front (-y): two sagging slopes over a ridge pole"""
    a = Asset(name, G, footprint=1.5, blocksMove=True, blocksShot=True, tall=False, seed=seed, ao_dist=2.0)
    g, r = a.mesh(), a.rng
    c1, c2 = pick(r, CANVAS), "#a9b08a"
    for sx in (-1, 1):
        grid = []
        for i in range(5):       # along the length (y)
            y = -L / 2 + L * i / 4
            row = []
            for k in range(4):   # ridge -> ground
                t = k / 3
                sag = 0.1 * sin(pi * t) * (0.5 + 0.5 * sin(pi * i / 4))
                row.append((sx * (0.03 + (W / 2) * t), y, H - (H - 0.03) * t - sag))
            grid.append(row if sx > 0 else row)
        if sx < 0:
            grid = grid[::-1]
        g.sheet(grid, lambda c, tg: CANVAS_D if c.z < 0.28 else (c1 if sx > 0 else shade(c1, 0.94)), 0.04, smooth=50, jit=0.02)
    g.sheet([[(-W / 2 * (1 - k / 3 * 0.9) * 0.97, L / 2 - 0.07, 0.02 + (H - 0.12) * k / 3), (W / 2 * (1 - k / 3 * 0.9) * 0.97, L / 2 - 0.07, 0.02 + (H - 0.12) * k / 3)] for k in range(4)], shade(c1, 0.8), 0.04)   # back wall
    g.box(W * 0.8, L * 0.86, 0.05, (0, 0, 0.0), col="#6b5d44", b=0.01)                        # groundsheet (dark inside)
    for y in (-L / 2 - 0.05, L / 2 + 0.05):
        g.pole((0, y, 0), (0, y, H + 0.18), 0.055, pick(r, WOOD_D), n=6)
    g.pole((0, -L / 2 - 0.2, H + 0.03), (0, L / 2 + 0.2, H + 0.03), 0.045, pick(r, WOOD_D), n=6)
    for sx in (-1, 1):
        for y in (-L / 2 + 0.1, 0, L / 2 - 0.1):
            peg = Vector((sx * (W / 2 + 0.55), y, 0.03))
            g.tube([(sx * W / 2 * 0.72, y, H * 0.3), peg], 0.02, ROPE, n=4)
            g.beam(peg + Vector((0, 0, -0.05)), peg + Vector((sx * 0.07, 0, 0.2)), 0.06, 0.06, pick(r, WOOD_D), b=0.012)
    # a bedroll peeking out
    g.pole((-0.35, -L / 2 + 0.5, 0.21), (0.45, -L / 2 + 0.5, 0.21), 0.18, KHAKI[0], n=9, b=0.04)
    return a


def tarp_leanto(name, seed, W=3.4, D=2.8):
    a = Asset(name, G, footprint=1.5, blocksMove=False, tall=False, seed=seed, ao_dist=2.4)
    g, r = a.mesh(), a.rng
    hb, hf = 2.3, 1.2
    stripes = ["#8a9463", "#b5ab7c", "#7f8c5c", "#b5ab7c", "#8a9463", "#a59d72"]
    grid = []
    for i in range(9):
        x = -W / 2 + W * i / 8
        row = []
        for k in range(7):
            t = k / 6
            sag = 0.34 * sin(pi * t) * sin(pi * i / 8) + 0.05 * sin(i * 2.4) * sin(pi * t)
            row.append((x, D / 2 - D * t, hb - (hb - hf) * t - sag))
        grid.append(row)
    g.sheet(grid, lambda c, tg: shade(stripes[int((c.x + W / 2) / W * 5.999)], 0.8 if abs(c.y) > D / 2 - 0.24 else 1.0), 0.05, smooth=50, jit=0.02)
    for sx in (-1, 1):
        g.pole((sx * (W / 2 - 0.06), D / 2 - 0.06, 0), (sx * (W / 2 - 0.06), D / 2 - 0.06, hb + 0.28), 0.095, pick(r, WOOD_D), n=7, cap=ENDGRAIN)
        g.pole((sx * (W / 2 - 0.06), -D / 2 + 0.06, 0), (sx * (W / 2 - 0.06), -D / 2 + 0.06, hf + 0.26), 0.085, pick(r, WOOD_D), n=7, cap=ENDGRAIN)
        lashing(g, (sx * (W / 2 - 0.06), D / 2 - 0.06, hb - 0.02), (0, 0, 1), 0.095)
        lashing(g, (sx * (W / 2 - 0.06), -D / 2 + 0.06, hf - 0.02), (0, 0, 1), 0.085)
        for (py, pz, ty) in ((-D / 2 - 0.6, hf + 0.1, -D / 2 + 0.06), (D / 2 + 0.85, hb + 0.1, D / 2 - 0.06)):
            peg = Vector((sx * (W / 2 + 0.7), py, 0.03))
            g.tube([(sx * (W / 2 - 0.06), ty, pz), peg], 0.03, ROPE, n=4)
            g.beam(peg + Vector((0, 0, -0.05)), peg + Vector((sx * 0.06, 0, 0.26)), 0.1, 0.1, pick(r, WOOD_D), b=0.015)
    g.pole((-W / 2 - 0.15, D / 2 - 0.06, hb + 0.08), (W / 2 + 0.15, D / 2 - 0.06, hb + 0.08), 0.06, pick(r, WOOD_D), n=6, cap=ENDGRAIN)
    return a


def bedroll(g, at=(0, 0, 0), rz=0.0, laid=False, k=0):
    """khaki bedroll with two dark straps (rolled), or laid out with a rolled pillow end"""
    c = KHAKI[k % 2]
    with g.at(T(*at, 0, 0, rz)):
        if not laid:
            g.pole((-0.55, 0, 0.21), (0.55, 0, 0.21), 0.21, c, n=10, b=0.05, cap=shade(c, 0.8))
            for x in (-0.3, 0.3):
                g.emit(p_lathe([(0.212, -0.045), (0.232, -0.03), (0.232, 0.03), (0.212, 0.045)], 10, cap0=False, cap1=False), "#4a3a28", T(x, 0, 0.21, 0, 90, 0), jit=0.02)
                g.box(0.07, 0.05, 0.07, (x, -0.225, 0.2), col=GOLD_D, b=0.012)
        else:
            g.box(0.86, 1.9, 0.07, (0, 0, 0), col=c, b=0.03, jit=0.02)
            g.box(0.9, 0.95, 0.09, (0, -0.42, 0.03), (0, 0, 0), col=pick(g.rng, ["#9b6a4a", "#8f7d55"]), b=0.035)   # blanket
            g.box(0.9, 0.16, 0.1, (0, 0.06, 0.035), col=CREAM, b=0.035)
            g.pole((-0.36, 0.78, 0.15), (0.36, 0.78, 0.15), 0.14, shade(c, 1.08), n=9, b=0.04)
            for x in (-0.2, 0.2):
                g.emit(p_lathe([(0.142, -0.035), (0.16, -0.02), (0.16, 0.02), (0.142, 0.035)], 9, cap0=False, cap1=False), "#4a3a28", T(x, 0.78, 0.15, 0, 90, 0), jit=0.02)


def bedroll_asset(name, seed, laid):
    a = Asset(name, G, footprint=0.5, seed=seed)
    bedroll(a.mesh(), laid=laid, k=seed)
    return a


def campfire(name, seed):
    a = Asset(name, G, footprint=0.8, blocksMove=True, seed=seed, glow=2.2)
    g, r = a.mesh(), a.rng
    g.cyl(0.86, 0.035, (0, 0, 0), col="#3a302a", n=12, b=0.0)       # ash bed
    for i in range(9):
        ang = radians(i * 40 + r.uniform(-6, 6))
        s = r.uniform(0.3, 0.42)
        g.rock(s, s * 0.85, s * 0.72, (cos(ang) * 0.72, sin(ang) * 0.72, -0.03), (0, 0, r.uniform(0, 360)), col=pick(r, ["#8d8478", "#9a9080", "#7d756b"]), n=10, b=0.045, seed=r.random())
    for i in range(5):
        ang = radians(i * 72 + 20)
        log(g, (cos(ang) * 0.5, sin(ang) * 0.5, 0.09), (-cos(ang) * 0.12, -sin(ang) * 0.12, 0.34), 0.085, col=pick(r, ["#4a3426", "#3d2b20", "#57402c"]), n=7, cut="#2a1f18")
    em = a.mesh("emissive")
    for i in range(6):
        ang = radians(i * 60 + 10)
        em.rock(0.14, 0.12, 0.09, (cos(ang) * 0.2, sin(ang) * 0.2, 0.008 + 0.003 * i), col=FLAME[2], n=7, b=0.0, seed=i)
    fl = a.part("flame", (0, 0, 0.12), "emissive")
    for (x, y, s, c) in [(0, 0, 1.0, FLAME[2]), (0.13, -0.05, 0.72, FLAME[1]), (-0.08, 0.05, 0.6, FLAME[1]), (0.0, -0.03, 0.42, FLAME[0])]:
        prof = [(0.0, 0.0), (0.2 * s, 0.1 * s), (0.25 * s, 0.3 * s), (0.17 * s, 0.6 * s), (0.07 * s, 0.9 * s), (0.0, 1.12 * s)]
        fl.lathe(prof, (x, y, 0.1 + 0.013 * s), col=c, n=7, jit=0, warp=lambda v: Vector((v.x + 0.05 * sin(v.z * 5), v.y + 0.04 * cos(v.z * 4), v.z)))
    a.point("light", (0, 0, 0.7))
    # a cooking stick with a banana
    g.pole((0.95, -0.2, 0), (0.42, -0.08, 0.72), 0.03, pick(r, WOOD_D), n=5)
    banana(g, (0.4, -0.08, 0.7), (0, 60, 10), 0.8, col="#e0a53a")
    return a


def lantern_body(g, em, at=(0, 0, 0), s=1.0):
    with g.at(T(*at, s=s)), em.at(T(*at, s=s)):
        g.cyl(0.17, 0.07, (0, 0, 0), col=IRON, n=8, b=0.02)
        g.cyl(0.19, 0.05, (0, 0, 0.36), col=IRON, n=8, b=0.015)
        g.lathe([(0.19, 0.41), (0.12, 0.5), (0.05, 0.56), (0.05, 0.6), (0.0, 0.6)], col=IRON, n=8, cap0=False)
        for i in range(4):
            ang = radians(45 + i * 90)
            g.pole((cos(ang) * 0.15, sin(ang) * 0.15, 0.06), (cos(ang) * 0.15, sin(ang) * 0.15, 0.38), 0.016, IRON, n=4, b=0)
        em.cyl(0.115, 0.3, (0, 0, 0.065), col=BULB, n=8, b=0.02, jit=0)
        g.emit(p_tube([(-0.12, 0, 0.47), (-0.14, 0, 0.72), (0, 0, 0.82), (0.14, 0, 0.72), (0.12, 0, 0.47)], 0.02, 4), IRON)


def lantern(name, seed, post=False):
    a = Asset(name, G, footprint=0.3, seed=seed, glow=2.4, tall=post)
    g, em = a.mesh(), a.mesh("emissive")
    if not post:
        lantern_body(g, em)
        a.point("light", (0, 0, 0.25))
    else:
        r = a.rng
        g.pole((0, 0, 0), (0.04, 0, 2.5), 0.075, pick(r, WOOD_D), n=7, r2=0.06)
        g.beam((0.02, 0, 2.3), (0.02, -0.72, 2.42), 0.07, 0.07, pick(r, WOOD_D), b=0.015)
        g.beam((0.02, 0, 1.92), (0.02, -0.4, 2.33), 0.05, 0.05, pick(r, WOOD_D), b=0.012)
        lashing(g, (0.03, 0, 2.3), (0, 0, 1), 0.068)
        g.pole((0.02, -0.6, 2.42), (0.02, -0.6, 2.18), 0.012, ROPE, n=4, b=0)
        lantern_body(g, em, (0.02, -0.6, 1.4))
        a.point("light", (0.02, -0.6, 1.65))
        rubble(g, 3, 0, 0, 0.2, 0.14, 0.22, ["#8d8478", "#9a9080"], seed=seed)
    return a


def fence(name, seed, L=2.5, broken=False):
    """stick fence section along x, centred; uneven sticks lashed to two rails"""
    a = Asset(name, G, footprint=0.4, blocksMove=True, blocksShot=False, seed=seed)
    g, r = a.mesh(), a.rng
    for sx in (-1, 1):
        g.pole((sx * (L / 2 - 0.08), 0, -0.05), (sx * (L / 2 - 0.08) + r.uniform(-0.03, 0.03), r.uniform(-0.03, 0.03), 1.35), 0.11, pick(r, WOOD_D), n=7, r2=0.09, cap=ENDGRAIN)
    for z in (0.42, 0.98):
        g.pole((-L / 2, 0.07, z + r.uniform(-0.03, 0.03)), (L / 2, 0.09, z + r.uniform(-0.03, 0.03)), 0.062, pick(r, WOOD), n=6, cap=ENDGRAIN)
        for sx in (-1, 1):
            lashing(g, (sx * (L / 2 - 0.08), 0.02, z), (0, 0, 1), 0.105, turns=2)
    n = 7
    for i in range(n):
        x = -L / 2 + 0.3 + (L - 0.6) * i / (n - 1) + r.uniform(-0.03, 0.03)
        h = r.uniform(1.0, 1.32)
        if broken and i in (3,):
            h = r.uniform(0.45, 0.6)
        g.pole((x, -0.03, -0.03), (x + r.uniform(-0.05, 0.05), -0.03, h), 0.065, pick(r, WOOD + WOOD_PALE), n=6, r2=0.048, cap=ENDGRAIN)
    if broken:
        g.pole((-L / 2 + 0.3 + (L - 0.6) * 3 / 6, -0.03, 0.1), (0.75, -0.62, 0.05), 0.06, pick(r, WOOD), n=6, cap=ENDGRAIN)      # the snapped stick, still leaning on the fence foot
    return a


def gate(name, seed, L=2.4):
    a = Asset(name, G, footprint=0.4, blocksMove=False, seed=seed, tall=True)
    g, r = a.mesh(), a.rng
    for sx in (-1, 1):
        g.pole((sx * (L / 2 + 0.1), 0, -0.05), (sx * (L / 2 + 0.1), 0, 2.5), 0.11, pick(r, WOOD_D), n=8, r2=0.09, cap=ENDGRAIN)
    g.pole((-L / 2 - 0.4, 0, 2.3), (L / 2 + 0.4, 0, 2.36), 0.09, pick(r, WOOD_D), n=8, cap=ENDGRAIN)
    for sx in (-1, 1):
        lashing(g, (sx * (L / 2 + 0.1), 0, 2.26), (0, 0, 1), 0.105)
    # a painted banana-skull board over the gate: the Peel Gang mark
    g.box(1.3, 0.08, 0.72, (0, -0.12, 1.5), col=pick(r, WOOD_PALE), b=0.025)
    icon_banana(g, FRONT(0, -0.161, 1.66), 0.8, RED)
    for sx in (-1, 1):
        g.pole((sx * 0.5, -0.1, 2.18), (sx * 0.5, -0.1, 2.34), 0.03, ROPE, n=4, b=0)
    leaf = a.part("leaf", (-L / 2, 0, 0))
    for z in (0.35, 0.95):
        leaf.pole((-L / 2 + 0.02, -0.02, z), (L / 2 - 0.12, -0.02, z), 0.06, pick(r, WOOD), n=6, cap=ENDGRAIN)
    leaf.pole((-L / 2 + 0.1, -0.02, 0.3), (L / 2 - 0.2, -0.02, 1.0), 0.055, pick(r, WOOD), n=6, cap=ENDGRAIN)
    for i in range(7):
        x = -L / 2 + 0.16 + (L - 0.44) * i / 6
        leaf.pole((x, -0.09, 0.08), (x, -0.09, r.uniform(1.05, 1.3)), 0.062, pick(r, WOOD + WOOD_PALE), n=6, r2=0.046, cap=ENDGRAIN)
    return a


def watchtower(name, seed):
    """bandit lookout: four splayed log legs, braces, a 2.9 u platform 3 u up with a rail, half roof, ladder on the front"""
    a = Asset(name, G, footprint=1.7, blocksMove=True, blocksShot=False, tall=True, seed=seed, ao_dist=2.2)
    g, r = a.mesh(), a.rng
    PH, hw, sp = 3.0, 1.25, 0.32
    legs = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            b0, b1 = Vector((sx * (hw + sp), sy * (hw + sp), -0.1)), Vector((sx * hw, sy * hw, PH + 1.25 if sy > 0 else PH + 1.0))
            log(g, b0, b1, 0.165, r2=0.13, n=8, col=pick(r, WOOD_D))
            legs.append((sx, sy, b0, b1))
    def onleg(sx, sy, z):
        t = (z + 0.1) / (PH + 1.1)
        return Vector((sx * (hw + sp * (1 - t)), sy * (hw + sp * (1 - t)), z))
    for z0, z1 in ((0.35, 1.5), (1.6, 2.75)):       # X braces on the back and sides
        for (ax, ay, bx, by) in ((-1, 1, 1, 1), (-1, -1, -1, 1), (1, -1, 1, 1)):
            plank(g, onleg(ax, ay, z0), onleg(bx, by, z1), 0.15, 0.07, pal=WOOD)
            plank(g, onleg(ax, ay, z1), onleg(bx, by, z0), 0.15, 0.07, pal=WOOD)
    for sy in (-1, 1):                              # platform beams + deck
        log(g, (-hw - 0.35, sy * hw * 0.92, PH - 0.12), (hw + 0.35, sy * hw * 0.92, PH - 0.12), 0.09, n=7, col=pick(r, WOOD_D))
    n = 7
    pw = (2 * hw + 0.5) / n
    for i in range(n):
        x = -hw - 0.25 + pw * (i + 0.5)
        plank(g, (x, -hw - 0.3, PH), (x, hw + 0.3, PH), pw - 0.03, 0.07, wob=0.012, pal=WOOD + WOOD_PALE)
    for (ax, ay, bx, by) in ((-1, 1, 1, 1), (-1, -1, -1, 1), (1, -1, 1, 1)):   # rail on three sides (front open for the ladder)
        for z in (PH + 0.45, PH + 0.85):
            g.pole(onleg(ax, ay, z), onleg(bx, by, z), 0.06, pick(r, WOOD), n=6, cap=ENDGRAIN)
    for sx in (-1, 1):
        g.pole(onleg(sx, -1, PH + 0.85), onleg(sx, -1, PH + 0.85) + Vector((-sx * 0.55, 0, 0)), 0.06, pick(r, WOOD), n=6, cap=ENDGRAIN)
    # a narrow tarp awning along the back rail only: the deck stays open so the key crate reads from above
    grid = [[(-hw - 0.4 + (2 * hw + 0.8) * i / 4, hw + 0.42 - 1.0 * k / 2, PH + 1.62 - 0.34 * k / 2 - 0.08 * sin(pi * i / 4)) for k in range(3)] for i in range(5)]
    g.sheet(grid, lambda c, tg: shade("#9aa46e", 0.78) if c.y < hw - 0.38 else "#9aa46e", 0.05, smooth=50)
    for sx in (-1, 1):
        g.pole((sx * (hw - 0.02), hw - 0.5, PH + 0.04), (sx * (hw - 0.02), hw - 0.5, PH + 1.34), 0.055, pick(r, WOOD_D), n=6)
    g.pole((-hw - 0.35, hw - 0.5, PH + 1.3), (hw + 0.35, hw - 0.5, PH + 1.3), 0.05, pick(r, WOOD_D), n=6)
    # ladder up the front, a little to the left
    ladder(g, (-0.35, -hw - sp - 0.75, 0), (-0.35, -hw - 0.3, PH + 0.5), 0.7, 0.4)
    # dressing: a red rag flag, a lantern hook, a look-out stool
    g.pole((hw, hw, PH + 1.2), (hw + 0.05, hw, PH + 2.2), 0.03, pick(r, WOOD_D), n=5)
    fl = a.part("flag", (hw + 0.04, hw, PH + 2.0))
    fl.sheet([[(hw + 0.05 + 0.3 * i, hw + 0.03 * sin(i * 1.4), PH + 2.15 - 0.2 * k - 0.04 * i * k) for k in range(3)] for i in range(4)], RED, 0.025)
    a.point("crate", (0.25, -0.35, PH + 0.07))
    a.point("lookout", (-0.5, 0.4, PH + 0.07))
    return a


def well(name, seed):
    """stone-ring well with a little roof, a crank and a bucket; the shaft is a dark hole you jump into"""
    a = Asset(name, G, footprint=1.25, blocksMove=False, blocksShot=False, tall=True, seed=seed, ao_dist=1.6)
    g, r = a.mesh(), a.rng
    R = 1.2
    for course in range(2):
        n = 10
        for i in range(n):
            ang = 2 * pi * (i + 0.5 * course) / n
            stone_block(g, 0.8, 0.4, 0.4, (cos(ang) * R, sin(ang) * R, course * 0.37 - 0.03), (0, 0, degrees(ang) + 90), b=0.08, chip=3)
    # the dark shaft: an inner wall and a black bottom that reads as depth
    g.emit(p_lathe([(R - 0.17, 0.74), (R - 0.2, 0.4), (R - 0.3, 0.06)], 14, cap0=False, cap1=False), lambda c, tg: mix("#0e0a08", "#4a3f33", max(0, (c.z - 0.2) / 0.55)), None, jit=0, smooth=80, flat=False)
    dk = a.part("dark", (0, 0, 0.07), "emissive")
    dk.emit(p_lathe([(0.0, 0.07), (R - 0.3, 0.07)], 14, cap0=False, cap1=False), "#070504", None, jit=0)
    moss_pad(g, 0.5, 0.3, (-0.85, -0.82, 0.69), rz=40)
    for sx in (-1, 1):
        g.pole((sx * (R + 0.02), 0, 0.1), (sx * (R + 0.02), 0, 3.3), 0.1, pick(r, WOOD_D), n=7, cap=ENDGRAIN)
    for sy in (-1, 1):          # a small shingle cap, high enough that the camera sees the hole under it
        for i in range(2):
            t = (i + 0.5) / 2
            y, z = sy * (0.05 + 0.46 * t), 3.62 - 0.3 * t
            plank(g, (-R - 0.3, y, z), (R + 0.3, y, z), 0.26, 0.06, roll=sy * -33, wob=0.012, pal=WOOD_GREY)
    g.pole((-R - 0.36, 0, 3.66), (R + 0.36, 0, 3.66), 0.065, pick(r, WOOD_D), n=6, cap=ENDGRAIN)
    for sx in (-1, 1):
        for sy in (-1, 1):
            g.beam((sx * (R + 0.02), 0, 3.58), (sx * (R + 0.02), sy * 0.5, 3.28), 0.08, 0.08, pick(r, WOOD_D), b=0.015)
    # windlass + crank
    g.pole((-R - 0.08, 0, 1.75), (R + 0.3, 0, 1.75), 0.075, pick(r, WOOD), n=8, cap=ENDGRAIN)
    g.pole((R + 0.3, 0, 1.75), (R + 0.3, 0.0, 1.45), 0.03, IRON, n=5)
    g.pole((R + 0.28, 0, 1.45), (R + 0.52, 0, 1.45), 0.035, IRON, n=5)
    for i in range(3):
        g.emit(p_lathe([(0.076, 0), (0.105, 0.03), (0.076, 0.06)], 7, cap0=False, cap1=False), ROPE, T(-0.09 + i * 0.058, 0, 1.75, 0, 90, 0), jit=0.04)
    bk = a.part("bucket", (0.05, 0, 1.68))
    bk.pole((0.05, 0, 1.68), (0.05, 0, 1.22), 0.02, ROPE, n=4, b=0)
    bk.lathe([(0.15, 0.82), (0.2, 1.1), (0.17, 1.1), (0.13, 0.86)], (0.05, 0, 0), col=pick(r, WOOD), n=9, cap0=True, cap1=False)
    bk.emit(p_lathe([(0.185, 0), (0.2, 0.02), (0.185, 0.04)], 9, cap0=False, cap1=False), IRON, T(0.05, 0, 0.94))
    bk.emit(p_tube([(-0.14, 0, 1.08), (-0.08, 0, 1.2), (0.05, 0, 1.24), (0.18, 0, 1.2), (0.24, 0, 1.08)], 0.014, 4), IRON)
    a.point("drop", (0, 0, 0.1))
    return a


def log_bench(name, seed, L=2.1):
    a = Asset(name, G, footprint=0.7, blocksMove=True, seed=seed)
    g, r = a.mesh(), a.rng
    bark = pick(r, WOOD_D)
    # half log: lathe arc 180 with a flat cut top
    g.emit(p_lathe([(0.0, 0), (0.27, 0.0), (0.3, 0.04), (0.3, L - 0.04), (0.27, L), (0.0, L)], 9, cap0=False, cap1=False, arc=180), bark, T(-L / 2, 0, 0.5, 0, 90, 0) @ T(rz=-90), jit=0.03, cap=ENDGRAIN)
    g.box(L - 0.02, 0.58, 0.05, (0, 0, 0.47), col="#b3925f", b=0.015, jit=0.03)
    for sx in (-1, 1):
        log(g, (sx * (L / 2 - 0.38), 0, -0.04), (sx * (L / 2 - 0.38), 0, 0.3), 0.24, n=9, col=bark)
    return a


def sign_board(g, M, w=1.5, h=0.62, col=None, point=1, icon=None, icol=None, k=1.45):
    """an arrow board (pointing local +x if point=1, -x if -1) with a painted icon; M places its centre, facing local -y"""
    col = col or pick(g.rng, WOOD_PALE)
    tip = 0.42
    poly = [(-w / 2, -h / 2), (w / 2 - tip, -h / 2), (w / 2, 0), (w / 2 - tip, h / 2), (-w / 2, h / 2), (-w / 2 + 0.1, 0)]
    if point < 0:
        poly = [(-x, y) for x, y in poly]
    with g.at(M):
        g.emit(p_prism(poly, 0.09, 0.02), col, T(0, 0.045, 0, 90, 0, 0), jit=0.05)
        m = FRONT(-0.1 * point, -0.046, 0) @ Matrix.Diagonal((k, k, 1, 1))
        if icon == "banana":
            icon_banana(g, m @ T(0, -0.2, 0), 0.42, icol or "#7a5a1e")
        elif icon == "raft":
            c = icol or "#2f6f8a"
            g.paint_poly([(-0.26, -0.1), (0.26, -0.1), (0.2, -0.02), (-0.2, -0.02)], m, "#6b4a2b")
            g.paint_line([(0.0, -0.02), (0.0, 0.16)], 0.03, m, "#6b4a2b")
            g.paint_poly([(0.02, 0.15), (0.16, 0.1), (0.02, 0.05)], m, RED)
            g.paint_line([(-0.3, -0.15), (-0.2, -0.12), (-0.1, -0.15), (0.0, -0.12), (0.1, -0.15), (0.2, -0.12), (0.3, -0.15)], 0.03, m, c)
        elif icon == "hatch":
            g.paint_line(circle(0.12, 10), 0.04, m, icol or "#4d555b", closed=True)
            g.paint_line([(-0.12, 0), (0.12, 0)], 0.035, m, icol or "#4d555b")
            g.paint_line([(0, -0.12), (0, 0.12)], 0.035, m, icol or "#4d555b")
        elif icon == "danger":
            g.paint_x(0.26, m, RED_D, w=0.055)
        elif icon == "key":
            c = icol or GOLD_D
            g.paint_line(circle(0.07, 8, cx=-0.14), 0.04, m, c, closed=True)
            g.paint_line([(-0.07, 0), (0.2, 0), (0.2, -0.08)], 0.04, m, c)
            g.paint_line([(0.1, 0), (0.1, -0.07)], 0.04, m, c)


def signpost(name, seed, boards):
    a = Asset(name, G, footprint=0.3, blocksMove=True, seed=seed, tall=True)
    g, r = a.mesh(), a.rng
    g.pole((0, 0, -0.05), (0.03, 0.0, 2.75), 0.11, pick(r, WOOD_D), n=7, r2=0.09, cap=ENDGRAIN)
    rubble(g, 4, 0, 0, 0.28, 0.18, 0.3, ["#8d8478", "#9a9080", "#a59a88"], seed=seed + 5)
    z = 2.25
    for i, (icon, point, tilt) in enumerate(boards):
        sign_board(g, T(0.2 * point, -0.13, z, 0, tilt, 0), point=point, icon=icon)
        rivets(g, [(0.02, -0.225, z + 0.1), (0.02, -0.225, z - 0.1)], 0.035, IRON)
        z -= 0.72
    return a


def build():
    tent_bell("tent_a", 21)
    tent_ridge("tent_b", 22)
    tarp_leanto("tarp", 23)
    bedroll_asset("bedroll_a", 0, False)
    bedroll_asset("bedroll_b", 1, True)
    campfire("campfire", 26)
    lantern("lantern", 27)
    lantern("lantern_post", 28, post=True)
    fence("fence_a", 29)
    fence("fence_b", 30, broken=True)
    gate("gate", 31)
    watchtower("watchtower", 32)
    well("well", 33)
    log_bench("log_bench", 34)
    log_bench("log_bench_b", 35, L=1.4)
    signpost("signpost_a", 36, [("banana", 1, -4), ("hatch", -1, 5)])
    signpost("signpost_raft", 37, [("raft", 1, 3), ("danger", -1, -6)])
    signpost("signpost_key", 38, [("key", 1, 0)])


REVIEW = dict(cols=6, cell=4.6, dist=40)
