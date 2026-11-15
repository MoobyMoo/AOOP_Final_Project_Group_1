"""The vault's facilities, part 1 (see g_vault.py): storage, display, crafting, machines, the two small starters.
Every model stands on the floor at the centre of its footprint (home/facilities.ts: w cells along x, d cells along y,
1 m each), faces -y, stays inside the footprint and under 2.45 m (the wall sconces hang above that)."""
from g_vault import *

STEELB, STEELB_L = "#59666b", "#7c898c"
CORAL = "#e2725b"
LEAFMARK = "#3f9a4a"
PEG = "#d6c39a"


def F(name, seed, w, d, **kw):
    kw.setdefault("blocksMove", True)
    a = A(name, seed, footprint=max(w, d) / 2, **kw)
    a.cells = (w, d)
    return a


def knob(b, at, axis=(0, -1, 0), r=0.035, col=BRASS_L):
    stud(b, at, axis, r=r, col=col, n=6)


def panel_door(g, b, w, h, at, col=None, handle="knob", side=1):
    """a raised-panel cabinet door on a front face (at = centre of its bottom edge, on the face)"""
    col = col or pick(g.rng, MAHOG)
    g.box(w, 0.04, h, (at[0], at[1] + 0.005, at[2]), col=col, b=0.015, jit=0.04)
    g.box(w - 0.14, 0.03, h - 0.14, (at[0], at[1] - 0.012, at[2] + 0.07), col=shade(col, 1.1), b=0.012, jit=0.03)
    if handle == "knob":
        knob(b, (at[0] + side * (w / 2 - 0.06), at[1] - 0.016, at[2] + h * 0.55))
    elif handle == "banana":
        banana_handle(b, (at[0] + side * (w / 2 - 0.075), at[1] - 0.012, at[2] + h * 0.5), (0, 90, 0), 0.9)


# ---------------------------------------------------------------- safe-deposit wall (3 x 1)
def stash(name, seed):
    """a steel cabinet of twenty numbered brass boxes in a mahogany case. Box 13 is ajar: somebody keeps a banana in it."""
    a = F(name, seed, 3, 1)
    g, b = a.mesh(), a.mesh("gloss")
    g.box(2.9, 0.84, 0.16, (0, 0.03, 0), col=MAHOG_D, b=0.03)
    g.box(2.76, 0.74, 1.9, (0, 0.06, 0.15), col=STEELB, b=0.03, grad=(0.86, 1.04))
    for sx in (-1, 1):
        g.box(0.1, 0.8, 1.94, (sx * 1.4, 0.04, 0.15), col=MAHOG[0], b=0.025, grad=(0.88, 1.04))
    g.box(2.96, 0.88, 0.13, (0, 0.03, 2.05), col=MAHOG_D, b=0.035)
    g.box(1.3, 0.12, 0.2, (0, -0.3, 2.17), col=MAHOG[1], b=0.04, taper=(0.8, 1.0))
    crest(b, (0, -0.362, 2.275), r=0.13, n=10)
    n = 0
    for row in range(4):
        for c in range(5):
            n += 1
            x, z0 = -1.08 + c * 0.54, 1.56 - row * 0.44
            if n == 13:
                g.paint_poly([(-0.23, 0.01), (0.23, 0.01), (0.23, 0.37), (-0.23, 0.37)], FRONT(x, -0.31, z0), "#1b1512", lift=0.004)
                b.emit(p_box(0.48, 0.03, 0.38, 0.0), BRASS, T(x - 0.24, -0.325, z0, 0, 0, -24) @ T(0.24, 0, 0), jit=0.03)
                banana(g, (x + 0.04, -0.3, z0 + 0.13), (0, 20, 70), 0.5)
                continue
            b.emit(p_tile(0.48, 0.38, 0.016), {0: BRASS if (row + c) % 2 else shade(BRASS, 0.93), 1: BRASS_L}, FRONT(x, -0.35, z0 + 0.19), jit=0.03, flat=True)
            g.paint_text(f"{n:02d}", 0.09, FRONT(x - 0.07, -0.351, z0 + 0.145), MAHOG_D, w=0.02)
            knob(b, (x + 0.16, -0.35, z0 + 0.19), r=0.032, col=BRASS_L)
    return a


# ---------------------------------------------------------------- trophy wall (3 x 1)
def trophy(name, seed):
    """a mahogany display case on a cupboard: three felt-backed shelves of three (slot0..8, top row first), brass
    plaques, the crest on the pediment, a velvet rope in front."""
    a = F(name, seed, 3, 1)
    g, b = a.mesh(), a.mesh("gloss")
    g.box(2.84, 0.62, 0.5, (0, 0.14, 0), col=MAHOG[0], b=0.03, grad=(0.86, 1.04))
    for sx in (-1, 1):
        panel_door(g, b, 1.24, 0.38, (sx * 0.66, -0.17, 0.07), handle="knob", side=-sx)
        g.box(0.09, 0.56, 1.84, (sx * 1.375, 0.17, 0.5), col=MAHOG[1], b=0.025, grad=(0.9, 1.04))
    g.box(2.7, 0.07, 1.8, (0, 0.415, 0.5), col=FELT, b=0.0, jit=0.02, grad=(0.9, 1.05))
    k = 0
    for row, z in enumerate((1.72, 1.12, 0.5)):
        if row < 2:
            g.box(2.68, 0.46, 0.05, (0, 0.17, z - 0.05), col=MAHOG_L, b=0.012, jit=0.03)
        for c in range(3):
            x = (c - 1) * 0.86
            a.point(f"slot{k}", (x, 0.14, z)); k += 1
            b.box(0.3, 0.02, 0.07, (x, -0.07 if row < 2 else -0.172, z - 0.075 if row < 2 else z - 0.11), col=BRASS, b=0.0)
            g.paint_poly(circle(0.17, 9), TOP(x, 0.14, z), shade(FELT, 1.3), lift=0.004)
    g.box(2.96, 0.66, 0.1, (0, 0.14, 2.3), col=MAHOG_D, b=0.03)
    crest(b, (0, -0.19, 2.25), r=0.15, n=10)
    for sx in (-1, 1):                                       # the rope
        b.cyl(0.12, 0.04, (sx * 1.3, -0.38, 0), col=BRASS_D, n=8, b=0.012)
        b.pole((sx * 1.3, -0.38, 0.03), (sx * 1.3, -0.38, 0.9), 0.03, BRASS, n=6, b=0)
        b.ball(0.06, (sx * 1.3, -0.38, 0.93), col=BRASS_L, n=7, m=4)
    rope(g, [(-1.3, -0.38, 0.84), (1.3, -0.38, 0.84)], 0.035, "#a52c22", n=5, sag=0.16, seg=8)
    return a


# ---------------------------------------------------------------- first-aid kiosk (3 x 1)
def icon_leafcross(g, M, s=1.0, col=LEAFMARK, lift=None):
    leaf = [(0, 0.05), (0.09, 0.15), (0.13, 0.27), (0.08, 0.37), (0, 0.44), (-0.08, 0.37), (-0.13, 0.27), (-0.09, 0.15)]
    for k in range(4):
        c, sn = cos(k * pi / 2), sin(k * pi / 2)
        g.paint_poly([((x * c - y * sn) * s, (x * sn + y * c) * s) for x, y in leaf], M, col, lift=lift)
    g.paint_poly(circle(0.07 * s, 8), M, col, lift=0.012)


def med(name, seed):
    """a pharmacy counter under a striped awning: the leaf cross on a round sign, a blender for the smoothies, bandage
    rolls and jars on the shelf."""
    a = F(name, seed, 3, 1)
    g, b = a.mesh(), a.mesh("gloss")
    g.box(2.7, 0.62, 0.9, (0, 0.1, 0), col=CREAM, b=0.035, grad=(0.86, 1.04))
    g.box(2.74, 0.02, 0.2, (0, -0.215, 0.62), col=CORAL, b=0.0, jit=0.02)
    icon_leafcross(g, FRONT(0, -0.228, 0.42), 0.62, LEAFMARK, lift=0.004)
    g.box(2.84, 0.74, 0.07, (0, 0.08, 0.9), col=MAHOG[0], b=0.025)
    g.box(2.7, 0.08, 1.2, (0, 0.4, 0.96), col=CREAM, b=0.02, jit=0.02)
    g.box(2.5, 0.26, 0.05, (0, 0.27, 1.5), col=MAHOG_L, b=0.012)
    for sx in (-1, 1):                                       # awning posts
        b.pole((sx * 1.32, -0.2, 0.96), (sx * 1.32, -0.3, 1.86), 0.03, BRASS, n=5, b=0)
    for k in range(9):                                       # the awning: cream and green stripes, scalloped
        x = -1.28 + k * 0.32
        col = CREAM if k % 2 else GREENB_L
        g.emit(p_extrude_x([(-0.44, 1.8), (-0.44, 1.86), (0.42, 2.2), (0.42, 2.14)], x - 0.16, x + 0.16), col, jit=0.02, flat=True)
        g.emit(p_prism([(-0.155, 0), (0.155, 0), (0.155, -0.1), (0.0, -0.17), (-0.155, -0.1)], 0.03), col, T(x, -0.425, 1.83, 90, 0, 0), jit=0.02)
    g.box(2.8, 0.1, 0.12, (0, 0.42, 2.12), col=MAHOG_D, b=0.03)
    b.emit(p_lathe([(0.3, 0.0), (0.3, 0.05), (0.26, 0.07), (0.0, 0.07)], 14, cap0=True), lambda c, t: CREAM if c.x * c.x + c.y * c.y < 0.06 and c.z > 0.06 else BRASS, T(0, 0.33, 2.08, 78, 0, 0), jit=0.02, smooth=40)
    icon_leafcross(g, T(0, 0.33, 2.08, 78, 0, 0) @ T(0, 0, 0.07), 0.52, LEAFMARK, lift=0.004)
    # on the counter: the blender, bananas, a mortar, vine rope and the first bandage
    g.cyl(0.12, 0.12, (-0.9, 0.0, 0.97), col=STEELB, n=8, b=0.02)
    g.lathe([(0.085, 0.0), (0.125, 0.3), (0.12, 0.32), (0.0, 0.32)], (-0.9, 0.0, 1.08), col="#f0d46a", n=8, smooth=40, cap0=False)
    g.cyl(0.07, 0.04, (-0.9, 0.0, 1.4), col=GREENB_D, n=7, b=0.01)
    knob(b, (-0.9, -0.12, 1.03), r=0.022, col=RED)
    bunch(g, (-0.45, -0.05, 1.03), (0, 0, -25), 0.62, 3)
    g.lathe([(0.07, 0.0), (0.13, 0.1), (0.11, 0.1), (0.05, 0.03)], (0.2, -0.02, 0.97), col=PLASTER, n=8, cap1=False)
    g.pole((0.2, -0.02, 0.985), (0.3, 0.02, 1.2), 0.02, MAHOG_L, n=4, b=0)
    for k in range(3):                                       # a coil of vine rope
        ring(g, 0.12 - k * 0.012, 0.03, (0.72, -0.02, 0.99 + k * 0.045), col=pick(g.rng, LEAF), n=9, m=4, jit=0.05)
    for (x, z) in ((1.05, 0.97), (1.19, 0.97), (1.12, 1.07)):
        g.cyl(0.07, 0.11, (x, 0.02, z), (0, 0, 0), col=PAPER, n=7, b=0.015)
        g.cyl(0.074, 0.03, (x, 0.02, z + 0.04), col=LEAFMARK, n=7, b=0.0, jit=0.02)
    # on the shelf: smoothie jars, a first-aid tin, tonic bottles
    for k, x in enumerate((-1.05, -0.83, -0.61)):
        g.lathe([(0.075, 0.0), (0.08, 0.16), (0.05, 0.2), (0.05, 0.24), (0.0, 0.24)], (x, 0.27, 1.55), col=["#f0d46a", "#f5b8c0", "#f0d46a"][k], n=7, smooth=40, cap0=False)
        g.cyl(0.055, 0.03, (x, 0.27, 1.78), col=MAHOG_D, n=6, b=0.006)
    g.box(0.42, 0.2, 0.2, (0.0, 0.27, 1.55), col=CORAL, b=0.03)
    icon_leafcross(g, FRONT(0.0, 0.168, 1.65), 0.19, CREAM, lift=0.004)
    for k, x in enumerate((0.62, 0.8, 0.98)):
        g.lathe([(0.055, 0.0), (0.06, 0.14), (0.025, 0.2), (0.025, 0.27), (0.0, 0.27)], (x, 0.27, 1.55), col=[GREENB_L, "#7a4a2a", GREENB_L][k], n=6, smooth=40, cap0=False)
    return a


# ---------------------------------------------------------------- blueprint desk (2 x 1)
def blueprint(name, seed):
    """a drafting table on two trestles. bp_sheet is the plan of the vault (its own node); a T-square, a banker's lamp,
    spare rolls in a brass bin."""
    a = F(name, seed, 2, 1, glow=2.0)
    g, b, em = a.mesh(), a.mesh("gloss"), a.mesh("emissive")
    for sx in (-1, 1):
        x = sx * 0.52 - 0.14
        g.beam((x, -0.3, 0), (x, -0.02, 0.86), 0.07, 0.09, MAHOG[0], b=0.015)
        g.beam((x, 0.38, 0), (x, 0.08, 1.02), 0.07, 0.09, MAHOG[0], b=0.015)
        g.box(0.05, 0.6, 0.06, (x, 0.04, 0.3), col=MAHOG_D, b=0.0)
    g.box(1.1, 0.06, 0.05, (-0.14, 0.04, 0.34), col=MAHOG_D, b=0.012)
    S = T(-0.14, -0.4, 0.8, 16, 0, 0)                       # the board: 16 degrees, the front edge low
    with g.at(S), b.at(S), em.at(S):
        g.box(1.5, 0.86, 0.05, (0, 0.43, 0), col=MAHOG_L, b=0.015)
        g.box(1.5, 0.04, 0.035, (0, 0.03, 0.05), col=MAHOG_D, b=0.01)                    # pencil ledge
        g.box(1.42, 0.05, 0.02, (0.0, 0.36, 0.062), (0, 0, 2), col=PEG, b=0.005)         # T-square
        g.box(0.06, 0.3, 0.026, (-0.72, 0.36, 0.06), (0, 0, 2), col=MAHOG[1], b=0.008)
        g.pole((0.3, 0.07, 0.065), (0.46, 0.07, 0.065), 0.012, BANANA, n=4, b=0)
        lamp_banker(g, em, (0.63, 0.75, 0.05), 20, 0.9)
    sh = a.part("bp_sheet", tuple(S @ Vector((0, 0.45, 0.052))))
    with sh.at(S):
        sh.box(1.18, 0.62, 0.007, (-0.08, 0.45, 0.0515), col="#2f66a8", b=0.0, jit=0)
        M = TOP(-0.08, 0.45, 0.0585)
        ink = "#e4efff"
        sh.paint_line([(-0.48, -0.22), (0.3, -0.22), (0.3, 0.22), (-0.48, 0.22)], 0.016, M, ink, closed=True, lift=0.0082)      # the vault
        for k in range(1, 5):
            sh.paint_line([(-0.48 + k * 0.156, -0.22), (-0.48 + k * 0.156, 0.22)], 0.006, M, "#8fb4e4", lift=0.003)
        for k in range(1, 3):
            sh.paint_line([(-0.48, -0.22 + k * 0.147), (0.3, -0.22 + k * 0.147)], 0.006, M, "#8fb4e4", lift=0.0056)
        sh.paint_line(circle(0.055, 8, cx=-0.09, cy=0.15), 0.012, M, ink, closed=True, lift=0.0108)                           # the pod
        sh.paint_line([(0.12, 0.24), (0.2, 0.285), (0.28, 0.24)], 0.012, M, ink, lift=0.0108)                                   # the door
        sh.paint_line([(0.36, -0.22), (0.5, -0.22)], 0.01, M, ink, lift=0.0082)
        sh.paint_line([(0.36, 0.22), (0.5, 0.22)], 0.01, M, ink, lift=0.0082)
        icon_banana(sh, M @ T(0.42, -0.01, 0), 0.1, ink)
    b.lathe([(0.13, 0.0), (0.15, 0.03), (0.16, 0.5), (0.14, 0.5), (0.13, 0.06)], (0.8, 0.26, 0), col=BRASS, n=9, cap1=False, smooth=40)
    for k, (dx, dy, col) in enumerate(((0.0, 0.03, "#2f66a8"), (-0.05, -0.04, PAPER), (0.06, -0.03, "#3b78bd"))):
        g.pole((0.8 + dx, 0.26 + dy, 0.04), (0.8 + dx * 2.2, 0.26 + dy * 2.2, 0.78 + k * 0.07), 0.04, col, n=6, b=0.0, cap=PAPER)
    return a


# ---------------------------------------------------------------- locker and mirror (3 x 1)
def locker(name, seed):
    """two staff lockers in mahogany with brass vents, number plates and banana handles, a bowler on top; next to them a
    cheval mirror in a brass frame (mirror_glass is its own node)."""
    a = F(name, seed, 3, 1)
    g, b = a.mesh(), a.mesh("gloss")
    for i, x in enumerate((-1.03, -0.27)):
        g.box(0.74, 0.64, 1.9, (x, 0.12, 0.06), col=MAHOG[i], b=0.03, grad=(0.86, 1.04))
        g.box(0.62, 0.035, 1.72, (x, -0.205, 0.14), col=shade(MAHOG[i], 1.08), b=0.015, jit=0.03)
        for k in range(4):                                   # vent
            b.box(0.36, 0.02, 0.028, (x, -0.228, 1.56 + k * 0.06), col=BRASS_D, b=0.0)
        b.emit(p_lathe([(0.085, 0.0), (0.085, 0.014), (0.07, 0.018), (0.0, 0.018)], 9, cap0=False), BRASS, T(x, -0.223, 1.36, 90, 0, 0), jit=0.02)
        g.paint_text(("07", "12")[i], 0.075, FRONT(x, -0.241, 1.323), MAHOG_D, w=0.017)
        banana_handle(b, (x + 0.2, -0.223, 0.98), (0, 90, 0), 1.0)
        for sx in (-1, 1):
            b.ball(0.045, (x + sx * 0.3, -0.2, 0.045), col=BRASS_D, n=6, m=3)
    g.box(1.54, 0.68, 0.07, (-0.65, 0.12, 0.0), col=MAHOG_D, b=0.02)          # one plinth and one cap for the pair
    g.box(1.56, 0.7, 0.07, (-0.65, 0.12, 1.94), col=MAHOG_D, b=0.025)
    # a bowler hat and a briefcase on top
    g.lathe([(0.26, 0.0), (0.27, 0.025), (0.16, 0.04), (0.17, 0.16), (0.1, 0.23), (0.0, 0.24)], (-1.03, 0.1, 2.01), col="#2c2a33", n=10, smooth=50)
    g.emit(p_lathe([(0.168, 0.05), (0.175, 0.1)], 10, cap0=False, cap1=False), "#ffb02a", T(-1.03, 0.1, 2.01), jit=0)
    g.box(0.5, 0.16, 0.34, (-0.27, 0.12, 2.01), (0, 0, 8), col=LEATHER, b=0.035)
    b.box(0.14, 0.03, 0.05, (-0.27, 0.04, 2.24), (0, 0, 8), col=BRASS_L, b=0.0)
    # the mirror
    with g.at(T(0.86, 0.12, 0, 0, 0, -6)), b.at(T(0.86, 0.12, 0, 0, 0, -6)):
        for sx in (-1, 1):
            g.box(0.1, 0.7, 0.09, (sx * 0.46, 0, 0), col=MAHOG_D, b=0.025)
            g.box(0.08, 0.09, 1.3, (sx * 0.46, 0.0, 0.07), col=MAHOG[0], b=0.02)
            knob(b, (sx * 0.51, 0, 1.15), (sx, 0, 0), r=0.05, col=BRASS_L)
        F_ = T(0, 0.0, 0.3, -7, 0, 0)
        b.emit(p_prism([(-0.4, 0), (0.4, 0), (0.4, 1.5), (0.3, 1.72), (0.12, 1.84), (-0.12, 1.84), (-0.3, 1.72), (-0.4, 1.5)], 0.08, 0.02), BRASS, F_ @ T(0, 0.04, 0, 90, 0, 0), jit=0.02)
        crest(b, tuple(F_ @ Vector((0, -0.045, 1.79))), (97, 0, -6), r=0.085, n=8, th=0.025)
    gl = a.part("mirror_glass", tuple(T(0.86, 0.12, 0, 0, 0, -6) @ Vector((0, -0.05, 1.2))))
    with gl.at(T(0.86, 0.12, 0, 0, 0, -6) @ T(0, 0.0, 0.3, -7, 0, 0)):
        M = T(0, -0.041, 0, 90, 0, 0)
        gl.emit(p_prism([(-0.33, 0.07), (0.33, 0.07), (0.33, 1.47), (0.25, 1.65), (0.1, 1.75), (-0.1, 1.75), (-0.25, 1.65), (-0.33, 1.47)], 0.012), "#bfe3f5", M, jit=0, grad=(1, 1))
        gl.paint_poly([(-0.26, 0.5), (-0.12, 0.5), (0.14, 1.2), (0.0, 1.2)], M @ T(0, 0, 0.012), "#eefaff", lift=0.004)
        gl.paint_poly([(-0.04, 0.42), (0.02, 0.42), (0.28, 1.1), (0.22, 1.1)], M @ T(0, 0, 0.012), "#eefaff", lift=0.004)
    return a


# ---------------------------------------------------------------- potted palm (1 x 1)
def plant(name, seed):
    """a palm in a footed brass planter"""
    a = F(name, seed, 1, 1, blocksMove=True)
    g, b = a.mesh(), a.mesh("gloss")
    r = a.rng
    for k in range(3):
        b.ball(0.06, (cos(k * 2.094) * 0.2, sin(k * 2.094) * 0.2, 0.045), col=BRASS_D, n=6, m=4)
    b.lathe([(0.2, 0.07), (0.3, 0.2), (0.33, 0.5), (0.36, 0.54), (0.34, 0.58), (0.29, 0.58), (0.27, 0.5)], col=BRASS, n=12, smooth=40, cap1=False)
    band(b, 0.31, 0.3, 0.38, 0.025, BRASS_L, n=12)
    g.cyl(0.285, 0.04, (0, 0, 0.5), col="#4a3828", n=12, b=0.0, jit=0.02)
    g.tube([(0, 0, 0.515), (0.03, 0.0, 0.85), (0.0, 0.02, 1.2), (-0.02, 0, 1.52)], [0.09, 0.075, 0.062, 0.05], "#8a6a44", n=6, jit=0.04)
    for k in range(3):
        band(g, 0.078 - k * 0.012, 0.0, 0.05, 0.016, "#6e5234", n=6, at=(0.02 - k * 0.012, 0.004 * k, 0.74 + k * 0.27))
    n = 8
    for k in range(n):
        ang = 2 * pi * k / n + r.uniform(-0.2, 0.2)
        L = r.uniform(0.47, 0.54) * (0.82 if k % 2 else 1.0)
        rise = 1.1 if k % 2 else 0.45
        d = Vector((cos(ang), sin(ang), 0))
        side = Vector((-d.y, d.x, 0))
        p0 = Vector((-0.02, 0, 1.44 + k * 0.011))
        grid = []
        for i in range(6):
            t = i / 5
            c = p0 + d * (0.045 + L * t) + Vector((0, 0, L * (rise * t - 0.95 * t * t) + 0.08 * t))
            wd = 0.15 * sin(pi * (0.08 + 0.9 * t)) ** 0.8
            grid.append([tuple(c - side * wd + Vector((0, 0, 0.05 * wd / 0.15))), tuple(c), tuple(c + side * wd + Vector((0, 0, 0.05 * wd / 0.15)))])
        g.sheet(grid, pick(r, LEAF), thick=0.022, jit=0.07)
    return a


# ---------------------------------------------------------------- vault generator (2 x 2)
def generator(name, seed):
    """a diesel dynamo on a skid: green engine block with a finned head and a tall exhaust, a copper dynamo, a banana
    yellow fuel drum, a switchboard with three knife switches (do not touch the red one) and the running lamp.
    gen_wheel is the flywheel (it turns about the front-back axis); gen_lamp is the lamp's glass."""
    a = F(name, seed, 2, 2, glow=2.2, tall=True)
    g, b = a.mesh(), a.mesh("gloss")
    for sy in (-1, 1):
        g.box(1.84, 0.14, 0.14, (0, 0.1 + sy * 0.42, 0), col=CAST, b=0.03)
    for sx in (-1, 1):
        g.box(0.14, 1.0, 0.1, (sx * 0.8, 0.1, 0.02), col=CAST, b=0.025)
    # engine
    g.box(0.84, 0.74, 0.74, (-0.42, 0.1, 0.13), col=ENAMEL, b=0.05, grad=(0.86, 1.05))
    for k in range(4):
        g.box(0.7, 0.8, 0.045, (-0.42, 0.1, 0.9 + k * 0.085), col=ENAMEL_D if k % 2 else ENAMEL, b=0.0, jit=0.03)
    g.box(0.56, 0.62, 0.4, (-0.42, 0.1, 0.86), col=CAST, b=0.0)                                         # the head's core, between the fins
    g.box(0.56, 0.56, 0.1, (-0.42, 0.1, 1.24), col=CAST, b=0.03)
    b.box(0.3, 0.02, 0.14, (-0.42, -0.275, 0.62), col=BRASS, b=0.008)
    icon_paw(g, FRONT(-0.42, -0.286, 0.69), 0.11, MAHOG_D, lift=0.003)
    for k in range(4):
        stud(b, (-0.72 + k * 0.2, -0.27, 0.22), (0, -1, 0), r=0.03, col=BRASS_L)
    g.tube([(-0.62, 0.3, 1.3), (-0.62, 0.3, 1.62), (-0.66, 0.34, 1.8), (-0.66, 0.34, 2.28)], 0.085, "#8a5236", n=8, jit=0.03)
    g.lathe([(0.1, 0.0), (0.13, 0.03), (0.13, 0.1), (0.1, 0.13)], (-0.66, 0.34, 1.9), col=CAST, n=8)
    g.cyl(0.14, 0.03, (-0.69, 0.34, 2.3), (0, -24, 0), col=CAST, n=8, b=0.008)
    g.box(0.24, 0.24, 0.2, (-0.2, 0.3, 1.32), col=CAST, b=0.04)                                        # air filter
    g.cyl(0.16, 0.14, (-0.2, 0.3, 1.5), col=STEELB_L, n=8, b=0.03)
    # dynamo: copper windings between two green end bells, on a cradle
    g.box(0.7, 0.5, 0.2, (0.5, 0.1, 0.13), col=CAST, b=0.04)
    g.emit(p_lathe([(0.2, 0.0), (0.31, 0.04), (0.31, 0.16), (0.27, 0.18), (0.27, 0.5), (0.31, 0.52), (0.31, 0.62), (0.2, 0.66)], 12), lambda c, t: COPPER if 0.17 < c.z < 0.51 else ENAMEL, T(0.17, 0.1, 0.6, 0, 90, 0), jit=0.02, smooth=40)
    for k in range(2):
        g.emit(p_lathe([(0.268, 0.0), (0.29, 0.03), (0.268, 0.06)], 12, cap0=False, cap1=False), shade(COPPER, 0.8), T(0.4 + k * 0.14, 0.1, 0.6, 0, 90, 0), jit=0.03)
    g.pole((0.0, 0.1, 0.6), (0.2, 0.1, 0.6), 0.06, STEELB_L, n=6, b=0)
    b.box(0.2, 0.2, 0.12, (0.5, 0.1, 0.9), col=BRASS_D, b=0.03)                                        # terminal box
    # the belt and the flywheel on the engine's front
    g.pole((-0.42, -0.26, 0.56), (-0.42, -0.47, 0.56), 0.05, STEELB_L, n=6, b=0)
    wh = a.part("gen_wheel", (-0.42, -0.4, 0.56), "gloss")
    ring(wh, 0.4, 0.05, (-0.42, -0.4, 0.56), (90, 0, 0), BRASS, n=16, m=5)
    for k in range(6):                                      # spokes run from the hub out: crossing bars would share a face plane
        ck, sk = cos(k * pi / 3), sin(k * pi / 3)
        wh.beam((-0.42 + ck * 0.085, -0.4, 0.56 + sk * 0.085), (-0.42 + ck * 0.39, -0.4, 0.56 + sk * 0.39), 0.07, 0.035, BRASS_D, b=0.0)
    wh.emit(p_lathe([(0.1, 0.0), (0.1, 0.07), (0.05, 0.1), (0.0, 0.1)], 8, cap0=True), BRASS_L, T(-0.42, -0.36, 0.56, 90, 0, 0), jit=0.02)
    wh.box(0.12, 0.05, 0.12, (-0.42, -0.4, 0.8), col=BANANA, b=0.02)                                   # counterweight
    # fuel drum on a frame over the dynamo
    for sx in (-1, 1):
        g.box(0.06, 0.5, 0.42, (0.5 + sx * 0.26, 0.26, 0.9), col=CAST, b=0.015)
    g.emit(p_lathe([(0.0, 0.0), (0.22, 0.0), (0.24, 0.03), (0.24, 0.63), (0.22, 0.66), (0.0, 0.66)], 10), BANANA, T(0.17, 0.26, 1.5, 0, 90, 0), jit=0.03, smooth=40, hl=1.05)
    for x in (0.3, 0.7):
        g.emit(p_lathe([(0.24, 0.0), (0.258, 0.02), (0.24, 0.04)], 10, cap0=False, cap1=False), BANANA_D, T(x, 0.26, 1.5, 0, 90, 0), jit=0.02)
    b.cyl(0.06, 0.06, (0.36, 0.26, 1.72), col=BRASS, n=6, b=0.015)
    icon_banana(g, LEFT(0.17, 0.26, 1.44), 0.26, MAHOG_D)
    g.tube([(0.66, 0.2, 1.3), (0.66, 0.0, 1.22), (0.1, -0.06, 1.1), (-0.1, 0.0, 1.0)], 0.022, "#2a2622", n=4, jit=0.03)
    # switchboard on a post, front right
    g.box(0.1, 0.1, 1.0, (0.66, -0.74, 0.02), col=CAST, b=0.02)
    g.box(0.36, 0.3, 0.05, (0.66, -0.74, 0), col=CAST, b=0.015)
    S = T(0.66, -0.76, 0.96, -18, 0, 0)
    with g.at(S), b.at(S):
        g.box(0.62, 0.1, 0.5, (0, 0, 0), col=MAHOG[0], b=0.025)
        b.emit(p_lathe([(0.1, 0.0), (0.1, 0.03), (0.08, 0.04), (0.0, 0.04)], 10, cap0=False), lambda c, t: PAPER if c.x * c.x + c.y * c.y < 0.0055 and c.z > 0.035 else BRASS, T(-0.16, -0.05, 0.34, 90, 0, 0), jit=0.02, smooth=40)
        g.paint_line([(0, 0), (0.05, 0.045)], 0.014, FRONT(-0.16, -0.09, 0.34), RED_D, lift=0.004)
        for k, col in enumerate((BRASS_L, BRASS_L, RED)):
            x = -0.2 + k * 0.2
            b.box(0.05, 0.03, 0.05, (x, -0.06, 0.05), col=BRASS_D, b=0.0)
            g.beam((x, -0.075, 0.075), (x, -0.16, 0.2), 0.03, 0.016, STEELB_L, b=0.0)
            g.ball(0.035, (x, -0.165, 0.21), col=col, n=6, m=4, jit=0)
        b.cyl(0.07, 0.06, (0.16, 0, 0.5), col=BRASS_D, n=8, b=0.015)
    lamp = a.part("gen_lamp", tuple(S @ Vector((0.16, 0, 0.62))), "emissive")
    lamp.ball(0.1, tuple(S @ Vector((0.16, 0, 0.63))), col="#ffd27a", n=8, m=5, s=(1, 1, 1.15), jit=0)
    # two fat cables from the terminal box, down and out along the floor to a junction box
    for k, (y1, col) in enumerate(((0.62, "#2a2622"), (0.78, RED_D))):
        g.tube([(0.56 + k * 0.08, 0.2, 0.98), (0.7 + k * 0.06, 0.4, 0.8), (0.78, 0.6 + k * 0.05, 0.2), (0.74, y1 + 0.1, 0.045), (0.4, y1 + 0.14, 0.045), (0.1, y1 + 0.1, 0.045)], 0.04, col, n=5, jit=0.03)
    g.box(0.34, 0.3, 0.2, (-0.06, 0.82, 0.004), col=CAST, b=0.035)
    b.box(0.12, 0.02, 0.07, (-0.06, 0.668, 0.08), col=BRASS, b=0.006)
    g.box(1.1, 1.5, 0.022, (-0.42, -0.14, 0.003), col="#2a2622", b=0.0, jit=0)                         # drip tray
    g.lathe([(0.07, 0.0), (0.08, 0.1), (0.025, 0.15), (0.015, 0.25), (0.0, 0.25)], (-0.76, -0.72, 0.024), col=RED, n=7, smooth=40)   # oil can
    a.point("light", tuple(S @ Vector((0.16, -0.3, 0.7))))
    return a


# ---------------------------------------------------------------- coin-op ammo press (2 x 2)
def press(name, seed):
    """a cast press in green enamel: two steel columns, a crosshead, the ram over a die of shell cases; a brass hopper
    for springs and old gears, a coin box, a long lever, the chute and a tray of finished rounds.
    press_wheel is the flywheel on the right (it turns about the left-right axis)."""
    a = F(name, seed, 2, 2, tall=True)
    g, b = a.mesh(), a.mesh("gloss")
    g.box(1.44, 1.06, 0.51, (-0.1, 0.16, 0.05), col=ENAMEL_D, b=0.06, grad=(0.86, 1.05))
    g.box(1.56, 1.18, 0.1, (-0.1, 0.16, 0), col=CAST, b=0.03)
    b.box(1.2, 0.84, 0.06, (-0.1, 0.16, 0.56), col=BRASS_D, b=0.02)
    for sx in (-1, 1):
        g.cyl(0.075, 1.3, (-0.1 + sx * 0.5, 0.26, 0.6), col=STEELB_L, n=8, b=0.0, grad=(0.9, 1.05))
        b.cyl(0.11, 0.07, (-0.1 + sx * 0.5, 0.26, 0.61), col=BRASS, n=8, b=0.02)
    g.box(1.36, 0.44, 0.32, (-0.1, 0.26, 1.8), col=ENAMEL, b=0.06)
    crest(b, (-0.1, 0.035, 1.96), r=0.12, n=10)
    g.cyl(0.14, 0.52, (-0.1, 0.26, 1.3), col=STEELB_L, n=8, b=0.02)                                    # ram
    g.box(0.5, 0.34, 0.14, (-0.1, 0.26, 1.18), col=CAST, b=0.03)
    g.box(0.66, 0.42, 0.1, (-0.1, 0.26, 0.62), col=CAST, b=0.025)                                      # die
    for k in range(5):
        g.cyl(0.036, 0.12, (-0.34 + k * 0.12, 0.2, 0.72), col=GOLD, n=5, b=0.0, cap=GOLD_L)
    # flywheel and crank on the right
    g.pole((0.58, 0.26, 1.4), (0.86, 0.26, 1.4), 0.055, STEELB_L, n=6, b=0)
    g.box(0.16, 0.3, 0.34, (0.5, 0.26, 1.23), col=ENAMEL, b=0.04)
    wh = a.part("press_wheel", (0.8, 0.26, 1.4), "gloss")
    ring(wh, 0.5, 0.06, (0.8, 0.26, 1.4), (0, 90, 0), BRASS, n=18, m=5)
    for k in range(6):                                      # six spokes from the hub: three crossing bars shared a face plane at the centre
        cy, sz = cos(k * pi / 3), sin(k * pi / 3)
        wh.beam((0.8, 0.26 + cy * 0.105, 1.4 + sz * 0.105), (0.8, 0.26 + cy * 0.49, 1.4 + sz * 0.49), 0.04, 0.08, BRASS_D, b=0.0)
    wh.emit(p_lathe([(0.12, 0.0), (0.12, 0.08), (0.06, 0.12), (0.0, 0.12)], 8, cap0=True), BRASS_L, T(0.76, 0.26, 1.4, 0, 90, 0), jit=0.02)
    wh.box(0.06, 0.16, 0.16, (0.8, 0.26, 1.7), col=BANANA, b=0.0)
    # hopper on the crosshead, with what goes in: a gear and a spring
    b.lathe([(0.1, 0.0), (0.12, 0.08), (0.3, 0.34), (0.3, 0.38), (0.26, 0.38), (0.1, 0.12)], (-0.5, 0.3, 2.1), col=BRASS, n=10, cap1=False, smooth=40)
    g.emit(p_prism([(cos(radians(k * 30)) * (0.17 if k % 2 else 0.13), sin(radians(k * 30)) * (0.17 if k % 2 else 0.13)) for k in range(12)], 0.045, 0.008), RUST[0], T(-0.46, 0.32, 2.36, 62, 20, 30), jit=0.03)
    g.tube([(-0.6 + cos(t * 1.6) * 0.045, 0.24 + sin(t * 1.6) * 0.045, 2.36 + t * 0.022) for t in range(10)], 0.012, STEELB_L, n=3, jit=0.03)
    # coin box on the left column
    b.box(0.3, 0.2, 0.42, (-0.6, 0.06, 1.02), col=BRASS, b=0.03)
    g.paint_line([(-0.07, 0), (0.07, 0)], 0.028, FRONT(-0.6, -0.04, 1.32), INK, lift=0.004)
    g.paint_poly(circle(0.065, 9), FRONT(-0.6, -0.04, 1.18), GOLD, lift=0.004)
    g.paint_text("1", 0.07, FRONT(-0.6, -0.04, 1.145), MAHOG_D, w=0.018)
    b.lathe([(0.0, 0.0), (0.07, 0.01), (0.1, 0.07)], (-0.6, -0.1, 0.98), col=BRASS_D, n=7, cap1=False)
    g.pole((-0.6, 0.16, 1.2), (-0.6, 0.26, 1.2), 0.04, CAST, n=5, b=0)
    # the lever
    g.box(0.12, 0.16, 0.2, (-0.92, 0.2, 0.5), col=CAST, b=0.03)
    g.pole((-0.92, 0.2, 0.62), (-0.98, -0.34, 1.52), 0.032, STEELB_L, n=6, b=0)
    g.ball(0.085, (-0.98, -0.345, 1.56), col=RED, n=8, m=5, jit=0)
    # chute and tray, front
    g.emit(p_extrude_x([(-0.28, 0.5), (-0.28, 0.54), (0.1, 0.72), (0.1, 0.68)], -0.28, 0.08), STEELB_L, jit=0.02, flat=True)
    g.box(0.62, 0.36, 0.05, (-0.1, -0.6, 0.3), col=MAHOG_L, b=0.012)
    for (dx, dy) in ((-0.31, 0), (0.31, 0)):
        g.box(0.04, 0.33, 0.1, (-0.1 + dx, -0.6, 0.304), col=MAHOG_D, b=0.0)
    g.box(0.57, 0.04, 0.1, (-0.1, -0.772, 0.306), col=MAHOG_D, b=0.0)
    g.box(0.5, 0.06, 0.3, (-0.1, -0.47, 0.004), col=CAST, b=0.0)
    r = a.rng
    for k in range(9):
        g.pole((-0.32 + (k % 5) * 0.11 + r.uniform(-0.02, 0.02), -0.7 + (k // 5) * 0.12, 0.372), (-0.3 + (k % 5) * 0.11, -0.58 + (k // 5) * 0.12, 0.372), 0.03, GOLD, n=5, b=0.0, cap=COPPER)
    # an open tin of rounds beside it
    g.box(0.42, 0.3, 0.26, (0.56, -0.62, 0), (0, 0, -14), col=OLIVE, b=0.03, grad=(0.86, 1.04))
    for k in range(6):
        g.cyl(0.03, 0.08, (0.46 + (k % 3) * 0.1, -0.66 + (k // 3) * 0.1 - (k % 3) * 0.025, 0.24), col=GOLD, n=5, b=0.0, cap=GOLD_L)
    return a


def build_all():
    import vault_fac2 as F2
    F2.fence("fac_fence", 221)
    F2.bench("fac_bench", 222)
    F2.sal("fac_sal", 223)
    trophy("fac_trophy", 224)
    med("fac_med", 225)
    stash("fac_stash", 226)
    generator("fac_generator", 227)
    press("fac_press", 228)
    F2.desk("fac_desk", 229)
    plant("fac_plant", 230)
    locker("fac_locker", 231)
    blueprint("fac_blueprint", 232)
