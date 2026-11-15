"""The vault's facilities, part 2 (see g_vault.py and vault_fac.py): the four stations with people in them."""
from vault_fac import *


def crate_c(g, at, s=0.6, h=None, rz=0.0, pal=WOOD, icon=False):
    """a contraband crate: slats, corner battens, a banana stencil"""
    h = h or s * 0.85
    with g.at(T(*at, 0, 0, rz)):
        g.box(s, s, h, col=pick(g.rng, pal), b=0.025, grad=(0.86, 1.04))
        for z in (0.03, h - 0.12):
            g.box(s + 0.05, s + 0.05, 0.09, (0, 0, z), col=pick(g.rng, WOOD_D), b=0.0)
        if icon:
            icon_banana(g, FRONT(0, -s / 2 - 0.001, h * 0.3), s * 0.42, "#3a2a1c")


# ---------------------------------------------------------------- the Fence's teller window (4 x 2)
def fence(name, seed):
    """a teller's booth: a mahogany counter with a green marble top, a brass grille, and behind it the Fence: a hat, a
    shadow and two eyes. Scales (a banana against coins), the bell (its own node), a WE BUY board, a red runner."""
    a = F(name, seed, 4, 2, glow=2.0, tall=True)
    g, b, em = a.mesh(), a.mesh("gloss"), a.mesh("emissive")
    g.box(3.7, 1.74, 0.02, (0, -0.05, 0), col=LEATHER, b=0.0, jit=0.02)                               # the runner
    g.paint_line([(-1.72, -0.74), (1.72, -0.74), (1.72, 0.74), (-1.72, 0.74)], 0.05, TOP(0, -0.05, 0.02), BRASS_D, closed=True, lift=0.004)
    # the booth
    g.box(3.8, 0.5, 1.0, (0, 0.7, 0.01), col=MAHOG[2], b=0.03, grad=(0.86, 1.04))
    for sx in (-1, 1):
        g.box(0.56, 0.5, 1.24, (sx * 1.62, 0.7, 1.0), col=MAHOG[0], b=0.03)
        g.box(0.36, 0.03, 0.9, (sx * 1.62, 0.445, 1.16), col=shade(MAHOG[0], 1.12), b=0.012)
    g.box(3.9, 0.56, 0.22, (0, 0.7, 2.22), col=MAHOG_D, b=0.04)
    g.box(2.72, 0.3, 1.26, (0, 0.78, 0.98), col="#17120f", b=0.0, jit=0)                              # the dark behind the grille
    # the Fence
    g.box(1.0, 0.12, 0.46, (0.42, 0.57, 1.02), col="#2a2220", b=0.05, jit=0)
    g.ball(0.36, (0.42, 0.57, 1.58), col="#2a2220", n=9, m=5, s=(1, 0.3, 1.0), jit=0)
    g.lathe([(0.46, 0.0), (0.46, 0.03), (0.3, 0.05), (0.27, 0.22), (0.2, 0.26), (0.0, 0.26)], (0.42, 0.57, 1.8), col="#3a302c", n=10, s=(1, 0.32, 1), jit=0, smooth=50)
    for sx in (-1, 1):
        em.ball(0.05, (0.42 + sx * 0.13, 0.46, 1.62), col="#fff1a8", n=6, m=3, jit=0)
    # the grille: brass bars, an arch to pass things through
    for k in range(9):
        x = -1.2 + k * 0.3
        low = 1.62 if k in (1, 2) else 1.04
        b.pole((x, 0.44, low), (x, 0.44, 2.22), 0.026, BRASS, n=5, b=0)
    b.tube([(-0.75 + cos(radians(t)) * 0.3, 0.44, 1.36 + sin(radians(t)) * 0.3) for t in (180, 150, 120, 90, 60, 30, 0)], 0.03, BRASS_L, n=5, jit=0.02)
    for x in (-1.05, -0.45):
        b.pole((x, 0.44, 1.04), (x, 0.44, 1.36), 0.03, BRASS_L, n=5, b=0)
    b.box(2.76, 0.07, 0.07, (0, 0.44, 1.02), col=BRASS_D, b=0.015)
    # WE BUY: a banana for a coin
    g.box(2.1, 0.035, 0.19, (0, 0.415, 2.235), col=CREAM, b=0.012, jit=0.02)
    M = FRONT(0, 0.396, 2.33)
    g.paint_text("WE BUY", 0.11, M @ T(-0.42, -0.055, 0), MAHOG_D, w=0.024)
    icon_banana(g, M @ T(0.32, -0.085, 0), 0.19, BANANA_D)
    icon_arrow(g, M @ T(0.56, 0, 0), 0.16, MAHOG_D)
    g.paint_poly(circle(0.065, 10, cx=0.8), M, GOLD_D, lift=0.004)
    # the counter
    g.box(3.7, 0.84, 0.98, (0, 0.0, 0.02), col=MAHOG[1], b=0.035, grad=(0.86, 1.04))
    for k in range(4):
        g.box(0.74, 0.03, 0.6, (-1.32 + k * 0.88, -0.425, 0.2), col=shade(MAHOG[1], 1.12), b=0.02, jit=0.04)
    g.box(3.82, 0.98, 0.07, (0, -0.02, 1.0), col=MARBLE_G, b=0.025)
    b.box(3.84, 0.03, 0.05, (0, -0.44, 0.955), col=BRASS_D, b=0.0)
    b.lathe([(0.0, 0.0), (0.17, 0.01), (0.2, 0.03), (0.17, 0.04)], (-0.75, 0.22, 1.07), col=BRASS, n=10, cap1=False)     # pass tray
    # scales: a banana against a stack of coins (the banana wins)
    sx0 = -1.42
    b.cyl(0.15, 0.05, (sx0, -0.1, 1.07), col=BRASS_D, n=8, b=0.012)
    b.pole((sx0, -0.1, 1.1), (sx0, -0.1, 1.62), 0.024, BRASS, n=5, b=0)
    b.ball(0.04, (sx0, -0.1, 1.64), col=BRASS_L, n=6, m=4)
    b.pole((sx0 - 0.34, -0.1, 1.52), (sx0 + 0.34, -0.1, 1.62), 0.02, BRASS, n=5, b=0)
    for sx, dz in ((-1, 1.52), (1, 1.62)):
        px = sx0 + sx * 0.33
        b.lathe([(0.0, 0.0), (0.13, 0.025), (0.16, 0.06)], (px, -0.1, dz - 0.26), col=BRASS_L, n=8, cap1=False)
        b.pole((px, -0.1, dz - 0.25), (px, -0.1, dz), 0.012, BRASS_D, n=4, b=0)
    banana(g, (sx0 - 0.33, -0.1, 1.31), (0, 0, 30), 0.52)
    coin_stack(g, (sx0 + 0.33, -0.1, 1.385), 3, 0.05)
    # the bell, a ledger, coins, a banker's lamp
    bell = a.part("bell", (0.95, -0.15, 1.07), "gloss")
    bell.lathe([(0.19, 0.0), (0.2, 0.03), (0.16, 0.1), (0.08, 0.16), (0.0, 0.17)], (0.95, -0.15, 1.07), col=BRASS_L, n=10, jit=0)
    bell.cyl(0.03, 0.05, (0.95, -0.15, 1.23), col=BRASS_D, n=6, b=0.008)
    g.box(0.5, 0.36, 0.05, (0.2, -0.16, 1.07), (0, 0, -10), col=GREENB, b=0.015)
    g.box(0.44, 0.3, 0.02, (0.2, -0.16, 1.12), (0, 0, -10), col=PAPER, b=0.0)
    for k in range(3):
        g.paint_line([(-0.14, 0.07 - k * 0.07), (0.14 - 0.06 * (k == 2), 0.07 - k * 0.07)], 0.022, TOP(0.2, -0.16, 1.141) @ T(rz=-10), "#8f8676", lift=0.003)
    coin_stack(g, (-0.32, -0.3, 1.07), 5)
    coin_stack(g, (-0.2, -0.22, 1.07), 3)
    lamp_banker(g, em, (1.52, 0.12, 1.07), -18, 1.0)
    # what came in today: a crate, a sack
    crate_c(g, (1.5, -0.68, 0.02), 0.52, 0.44, 12, WOOD, True)
    g.box(0.5, 0.36, 0.42, (-1.52, -0.7, 0.02), (0, 0, -14), col="#b99a66", b=0.13, jit=0.04, taper=(0.72, 0.8))
    a.point("counter", (0, -0.45, 1.1))
    return a


# ---------------------------------------------------------------- back-office workbench (3 x 2)
def bench(name, seed):
    """a mahogany bench with a vise and a pegboard. The three upgrades are separate nodes, hidden until bought, each
    with its outline painted on the board or the bench: fx_mag (a magazine rack, the long magazine in banana yellow),
    fx_pack (a pack on a hook), fx_heart (the Banana Breakfast: a tray with a bunch, toast and a coffee pot)."""
    a = F(name, seed, 3, 2, glow=2.0)
    g, b, em = a.mesh(), a.mesh("gloss"), a.mesh("emissive")
    r = a.rng
    for sx in (-1, 1):
        for sy in (-1, 1):
            g.box(0.15, 0.15, 0.9, (sx * 1.2, 0.3 + sy * 0.36, 0), col=MAHOG_D, b=0.03)
    for i in range(2):
        g.box(2.72, 0.485, 0.1, (0, 0.06 + i * 0.48, 0.88), col=pick(r, MAHOG + [MAHOG_L]), b=0.022, jit=0.05)
    g.box(2.46, 0.84, 0.06, (0, 0.3, 0.2), col=MAHOG_D, b=0.0)
    g.box(0.86, 0.8, 0.34, (-0.7, 0.3, 0.55), col=MAHOG[0], b=0.025)                                  # drawers
    for k in range(2):
        g.box(0.36, 0.03, 0.24, (-0.9 + k * 0.4, -0.105, 0.6), col=shade(MAHOG[0], 1.12), b=0.012)
        banana_handle(b, (-0.9 + k * 0.4, -0.12, 0.72), (0, 0, 0), 0.7)
    g.box(0.56, 0.34, 0.26, (0.55, 0.3, 0.26), col=RED_D, b=0.035)                                    # toolbox
    b.box(0.2, 0.04, 0.04, (0.55, 0.3, 0.52), col=BRASS_D, b=0.01)
    crate_c(g, (-0.6, 0.32, 0.26), 0.4, 0.24, 6, WOOD_PALE)
    # pegboard
    for sx in (-1, 1):
        g.box(0.1, 0.1, 2.34, (sx * 1.3, 0.88, 0), col=MAHOG_D, b=0.0)
    g.box(2.5, 0.06, 1.3, (0, 0.88, 1.0), col=PEG, b=0.015, jit=0.02)
    g.box(2.76, 0.14, 0.09, (0, 0.88, 2.3), col=MAHOG[1], b=0.0)
    P = lambda px, pz, poly, col, rz=0, dy=0.0: g.emit(p_prism(poly, 0.05), col, T(px, 0.85 - dy, pz, 90, 0, 0) @ T(rz=rz), jit=0.03)
    P(-0.32, 1.9, [(-0.17, 0.06), (0.17, 0.06), (0.17, 0.24), (-0.17, 0.24)], STEELB)                    # hammer
    P(-0.32, 1.62, [(-0.04, -0.26), (0.04, -0.26), (0.04, 0.36), (-0.04, 0.36)], MAHOG_L, 0, 0.005)
    P(0.02, 1.82, [(-0.045, -0.38), (0.045, -0.38), (0.045, 0.08), (0.14, 0.14), (0.14, 0.3), (0.05, 0.22), (-0.05, 0.22), (-0.14, 0.3), (-0.14, 0.14), (-0.045, 0.08)], STEELB_L)   # wrench
    P(0.3, 1.5, [(-0.035, -0.12), (0.035, -0.12), (0.035, 0.18), (0.0, 0.27), (-0.035, 0.18)], RED, 0, 0.01)
    P(0.3, 1.95, [(-0.035, -0.12), (0.035, -0.12), (0.035, 0.18), (0.0, 0.27), (-0.035, 0.18)], BANANA, 0, 0.01)
    P(-0.02, 1.2, [(-0.42, -0.1), (0.34, -0.16), (0.34, 0.1), (-0.42, 0.05)], STEELB_L, -4)              # saw
    P(0.38, 1.18, [(-0.08, -0.16), (0.11, -0.16), (0.11, 0.13), (-0.08, 0.13)], MAHOG_L, -4, 0.005)
    # where the upgrades go: an outline of each on the board (a shadow board)
    out = shade(PEG, 0.8)
    g.paint_line([(-0.27, -0.36), (0.27, -0.36), (0.3, 0.2), (0.16, 0.36), (-0.16, 0.36), (-0.3, 0.2)], 0.022, FRONT(-0.88, 0.85, 1.58), out, closed=True, lift=0.004)
    g.paint_line([(-0.26, -0.34), (0.26, -0.34), (0.26, 0.34), (-0.26, 0.34)], 0.022, FRONT(0.88, 0.85, 1.6), out, closed=True, lift=0.004)
    b.tube([(-0.88, 0.85, 2.05), (-0.88, 0.74, 2.05), (-0.88, 0.71, 2.12)], 0.022, BRASS_D, n=4)       # the pack's hook
    g.paint_line([(-0.3, -0.2), (0.3, -0.2), (0.3, 0.2), (-0.3, 0.2)], 0.02, TOP(0.78, 0.08, 0.98), shade(MAHOG_L, 0.78), closed=True, lift=0.004)
    # on the bench: a vise, a pistol in pieces, rounds, an oil can, the lamp
    g.box(0.34, 0.28, 0.13, (-1.02, -0.02, 0.98), col=CAST, b=0.03)
    for dx in (-0.1, 0.12):
        g.box(0.1, 0.32, 0.24, (-1.02 + dx, -0.02, 1.09), col=STEELB, b=0.03)
    g.pole((-1.26, -0.02, 1.2), (-0.78, -0.02, 1.2), 0.026, STEELB_L, n=5, b=0)
    g.pole((-1.24, -0.14, 1.2), (-1.24, 0.1, 1.2), 0.02, STEELB_L, n=4, b=0)
    g.emit(p_prism([(-0.28, 0.0), (0.28, 0.0), (0.28, 0.11), (-0.09, 0.11), (-0.11, 0.28), (-0.24, 0.28)], 0.06, 0.012), "#3d4146", T(-0.25, 0.12, 0.985, 0, 0, 18), jit=0.02)
    g.box(0.34, 0.07, 0.035, (-0.1, 0.42, 0.98), (0, 0, -24), col=STEELB, b=0.01)
    for i in range(4):
        g.cyl(0.028, 0.11, (0.18 + i * 0.075, 0.42, 0.98), col=GOLD, n=5, b=0.0, cap=GOLD_L)
    g.lathe([(0.08, 0), (0.09, 0.13), (0.03, 0.18), (0.018, 0.3), (0.0, 0.3)], (-0.62, 0.52, 0.98), col=RED, n=7, smooth=40)
    lamp_banker(g, em, (1.12, 0.6, 0.98), -20, 1.0)
    # ---- Extended Mag: a rack on the board with a pistol frame and the long magazine
    fm = a.part("fx_mag", (0.88, 0.84, 1.6)); fm.ghost = True
    fm.box(0.56, 0.04, 0.72, (0.88, 0.835, 1.24), col=MAHOG_D, b=0.012)
    Q = lambda px, pz, poly, col, rz=0, dy=0.0: fm.emit(p_prism(poly, 0.06, 0.012), col, T(px, 0.815 - dy, pz, 90, 0, 0) @ T(rz=rz), jit=0.03)
    Q(0.84, 1.76, [(-0.2, -0.19), (-0.1, -0.19), (-0.08, -0.05), (0.22, -0.05), (0.22, 0.07), (-0.22, 0.07), (-0.22, -0.05)], "#3d4146")
    Q(1.0, 1.44, [(-0.055, -0.2), (0.055, -0.2), (0.07, 0.2), (-0.045, 0.2)], BANANA, 8)
    Q(0.78, 1.4, [(-0.05, -0.11), (0.05, -0.11), (0.06, 0.11), (-0.04, 0.11)], STEELB, -6)
    fm.box(0.5, 0.1, 0.03, (0.88, 0.8, 1.25), col=MAHOG_L, b=0.008)
    for i in range(4):
        fm.cyl(0.026, 0.1, (0.72 + i * 0.075, 0.79, 1.28), col=GOLD, n=5, b=0.0, cap=GOLD_L)
    # ---- Bigger Pack: a pack on the hook
    fp = a.part("fx_pack", (-0.88, 0.76, 1.56)); fp.ghost = True
    pk = "#8a5a34"
    fp.box(0.56, 0.3, 0.68, (-0.88, 0.69, 1.22), col=pk, b=0.1, taper=(0.9, 0.86), grad=(0.86, 1.05), jit=0.02)
    fp.box(0.58, 0.2, 0.26, (-0.88, 0.6, 1.64), (-8, 0, 0), col=shade(pk, 1.14), b=0.06)
    fp.box(0.34, 0.12, 0.26, (-0.88, 0.52, 1.28), col=shade(pk, 0.86), b=0.04)
    for sx in (-1, 1):
        fp.box(0.06, 0.03, 0.3, (-0.88 + sx * 0.17, 0.5, 1.58), (-6, 0, 0), col="#6a4226", b=0.01)
        fp.box(0.16, 0.2, 0.3, (-0.88 + sx * 0.35, 0.69, 1.28), col=shade(pk, 0.92), b=0.05)
    fb = a.part("fx_pack", (-0.88, 0.76, 1.56), "gloss"); fb.ghost = True
    for sx in (-1, 1):
        fb.box(0.08, 0.04, 0.06, (-0.88 + sx * 0.17, 0.485, 1.62), col=BRASS_L, b=0.012)
    fp.pole((-1.18, 0.69, 1.98), (-0.58, 0.69, 1.98), 0.09, KHAKI[0], n=7, b=0.03)
    fp.tube([(-0.99, 0.72, 1.86), (-0.88, 0.72, 2.1), (-0.77, 0.72, 1.86)], 0.024, "#6a4226", n=4)
    banana(fp, (-0.52, 0.62, 1.52), (0, -80, 0), 0.6)
    # ---- Banana Breakfast: a tray on the bench
    fh = a.part("fx_heart", (0.78, 0.08, 0.98)); fh.ghost = True
    fh.box(0.62, 0.42, 0.03, (0.78, 0.08, 0.98), col=MAHOG_L, b=0.01)
    for sx in (-1, 1):
        fh.box(0.03, 0.4, 0.06, (0.78 + sx * 0.3, 0.08, 0.984), col=MAHOG_D, b=0.0)
    fh.lathe([(0.0, 0.0), (0.07, 0.0), (0.16, 0.034), (0.0, 0.012)], (0.66, 0.1, 1.01), col=CREAM, n=9)
    bunch(fh, (0.66, 0.1, 1.07), (0, 0, 35), 0.62, 3)
    fh.lathe([(0.065, 0.0), (0.085, 0.03), (0.09, 0.13), (0.06, 0.2), (0.035, 0.22), (0.0, 0.22)], (0.95, 0.16, 1.01), col=STEELB, n=8, smooth=50)
    fh.tube([(1.03, 0.16, 1.17), (1.1, 0.16, 1.14), (1.09, 0.16, 1.07), (1.03, 0.16, 1.05)], 0.014, CAST, n=4)
    fh.tube([(0.87, 0.16, 1.1), (0.81, 0.16, 1.17)], [0.024, 0.014], STEELB, n=4)
    fh.lathe([(0.04, 0.0), (0.055, 0.07), (0.045, 0.07), (0.033, 0.015)], (0.9, -0.04, 1.01), col=CREAM, n=7, cap1=False)
    fh.box(0.13, 0.13, 0.03, (0.72, -0.07, 1.01), (0, 0, 20), col="#d9a85a", b=0.01)
    fh.box(0.13, 0.13, 0.03, (0.75, -0.06, 1.035), (0, 0, -14), col="#c9954a", b=0.01)
    a.point("light", (1.0, 0.3, 1.5))
    return a


# ---------------------------------------------------------------- Sal's corner desk (3 x 2)
def sal(name, seed):
    """a smuggler's desk: a plank top on two crates, a field radio, a storm lantern, his wares; behind where he stands
    (the middle is left clear for him) a corkboard with the island on it; contraband either side. `neon` is the
    BANANA BANK sign he hangs once he has moved in."""
    a = F(name, seed, 3, 2, glow=2.6, tall=True)
    g, b, em = a.mesh(), a.mesh("gloss"), a.mesh("emissive")
    r = a.rng
    crate_c(g, (-0.82, -0.52, 0), 0.62, 0.72, 4, WOOD, True)
    crate_c(g, (0.82, -0.52, 0), 0.62, 0.72, -5, WOOD)
    for i in range(3):
        g.box(2.56, 0.27, 0.08, (0, -0.79 + i * 0.27, 0.72), col=pick(r, WOOD_PALE), b=0.02, jit=0.05)
    # the radio
    g.box(0.46, 0.24, 0.3, (-0.88, -0.44, 0.8), (0, 0, 8), col=OLIVE, b=0.03)
    Mr = T(-0.88, -0.44, 0.8, 0, 0, 8) @ FRONT(0, -0.121, 0)
    g.paint_poly(circle(0.085, 8, cx=-0.09, cy=0.15), Mr, "#2a2622", lift=0.004)
    for k in range(2):
        g.paint_poly(circle(0.03, 6, cx=0.1, cy=0.09 + k * 0.11), Mr, BRASS_L, lift=0.004)
    g.pole((-0.7, -0.38, 1.08), (-0.6, -0.34, 1.7), 0.012, STEELB_L, n=3, b=0)
    # the lantern
    g.cyl(0.085, 0.05, (0.98, -0.42, 0.8), col=CAST, n=7, b=0.012)
    em.lathe([(0.06, 0.0), (0.085, 0.07), (0.06, 0.16), (0.0, 0.16)], (0.98, -0.42, 0.85), col="#ffc66a", n=7, jit=0, cap0=False)
    g.lathe([(0.075, 0.0), (0.03, 0.05), (0.0, 0.055)], (0.98, -0.42, 1.01), col=CAST, n=7)
    g.tube([(0.9, -0.42, 0.84), (0.87, -0.42, 1.0), (0.98, -0.42, 1.14), (1.09, -0.42, 1.0), (1.06, -0.42, 0.84)], 0.01, CAST, n=3)
    # his wares: an open tin of rounds, bandage rolls, a smoothie; a clipboard; a coin tin
    g.box(0.36, 0.24, 0.16, (0.38, -0.62, 0.8), (0, 0, -10), col=OLIVE, b=0.025)
    for k in range(4):
        g.cyl(0.026, 0.07, (0.3 + (k % 2) * 0.09, -0.66 + (k // 2) * 0.08, 0.95), col=GOLD, n=5, b=0.0, cap=GOLD_L)
    for (x, y) in ((0.02, -0.38), (0.15, -0.36)):
        g.cyl(0.06, 0.1, (x, y, 0.8), col=PAPER, n=7, b=0.012)
        g.cyl(0.064, 0.03, (x, y, 0.835), col=LEAFMARK, n=7, b=0.0, jit=0.02)
    g.lathe([(0.06, 0.0), (0.065, 0.14), (0.04, 0.18), (0.04, 0.21), (0.0, 0.21)], (0.56, -0.34, 0.8), col="#f0d46a", n=7, smooth=40, cap0=False)
    g.box(0.34, 0.44, 0.025, (-0.3, -0.56, 0.8), (0, 0, 14), col=MAHOG_L, b=0.008)
    g.box(0.29, 0.37, 0.012, (-0.3, -0.57, 0.823), (0, 0, 14), col=PAPER, b=0.0)
    for k in range(3):
        g.paint_line([(-0.1, 0.09 - k * 0.07), (0.1 - 0.05 * (k == 2), 0.09 - k * 0.07)], 0.02, TOP(-0.3, -0.57, 0.836) @ T(rz=14), "#8f8676", lift=0.003)
    b.box(0.1, 0.03, 0.03, (-0.33, -0.39, 0.826), (0, 0, 14), col=BRASS_D, b=0.008)
    coin_stack(g, (0.7, -0.72, 0.8), 4)
    # corkboard on two posts
    for sx in (-1, 1):
        g.box(0.09, 0.09, 2.08, (sx * 1.14, 0.9, 0), col=pick(r, WOOD_D), b=0.02)
    g.box(2.3, 0.06, 1.1, (0, 0.9, 0.96), col="#b8905e", b=0.015, jit=0.03)
    for (bx, bz, sx_, sz_) in ((0, 0.93, 2.18, 0.07), (0, 2.03, 2.18, 0.07)):
        g.box(sx_, 0.08, sz_, (bx, 0.895, bz), col=pick(r, WOOD_D), b=0.015)
    # the island, in ink and paint, with a red X
    Mi = FRONT(-0.5, 0.869, 1.5)
    g.paint_poly([(-0.44, -0.36), (0.44, -0.36), (0.44, 0.36), (-0.44, 0.36)], Mi, "#9ed0d8", lift=0.003)
    g.paint_poly([(-0.3, -0.12), (-0.2, 0.12), (0.02, 0.22), (0.26, 0.14), (0.32, -0.06), (0.16, -0.22), (-0.1, -0.24)], Mi, "#e0c48c", lift=0.006)
    g.paint_poly([(-0.14, -0.06), (-0.06, 0.1), (0.12, 0.12), (0.2, -0.02), (0.06, -0.14)], Mi, "#6f9a48", lift=0.009)
    g.paint_x(0.1, Mi @ T(0.1, 0.02, 0), RED, lift=0.012)
    notes = [(0.35, 1.72, 0.36, 0.42, PAPER, -5), (0.82, 1.62, 0.34, 0.3, "#ffe0a0", 6), (0.4, 1.24, 0.3, 0.3, "#ffd0c0", 4), (0.82, 1.22, 0.32, 0.36, "#d8ecc8", -7)]
    for i, (nx, nz, w, h, col, rz) in enumerate(notes):
        m = FRONT(nx, 0.868 - 0.002 * i, nz, rz)
        g.emit(p_box(w, h, 0.01, 0.0), col, m @ T(0, 0, -0.002), jit=0.02)
        for k in range(2):
            g.paint_line([(-w * 0.34, h * 0.14 - k * h * 0.24), (w * (0.34 - 0.14 * k), h * 0.14 - k * h * 0.24)], 0.028, m, "#8f8676", lift=0.012)
        g.emit(p_sphere(0.032, 6, 2, z0=0, z1=1), RED if i % 2 else "#3f8f9a", m @ T(0, h * 0.4, 0.01), jit=0)
    g.tube([(-0.4, 0.846, 1.52), (0.35, 0.842, 1.9)], 0.011, RED, n=3)
    g.tube([(0.35, 0.837, 1.9), (0.82, 0.835, 1.38)], 0.011, RED, n=3)
    # contraband: crates one side, a barrel and a sack the other
    crate_c(g, (-1.12, 0.38, 0), 0.6, 0.5, -6, WOOD, True)
    crate_c(g, (-1.14, 0.4, 0.5), 0.44, 0.36, 12, WOOD_PALE)
    g.lathe([(0.24, 0), (0.28, 0.04), (0.31, 0.4), (0.28, 0.76), (0.24, 0.8)], (1.14, 0.4, 0), col=pick(r, WOOD), n=10, smooth=40, grad=(0.86, 1.05))
    for z in (0.2, 0.6):
        g.emit(p_lathe([(0.298, -0.035), (0.318, 0.0), (0.298, 0.035)], 10, cap0=False, cap1=False), STEELB, T(1.14, 0.4, z), jit=0.02)
    g.box(0.44, 0.3, 0.34, (1.12, 0.4, 0.78), (0, 0, 24), col="#b99a66", b=0.11, jit=0.04, taper=(0.75, 0.8))
    # ---- the neon
    nb = a.part("neon", (0, 0.88, 2.26)); nb.ghost = True
    nb.box(2.5, 0.05, 0.36, (0, 0.9, 2.08), col="#2a2630", b=0.02, jit=0)
    ne = a.part("neon", (0, 0.88, 2.26), "emissive"); ne.ghost = True
    paths, w = text_paths("BANANA BANK", 0.36)
    k = 2.02 / w
    run = 0
    for p in paths:
        cuts = [0]                                           # a three-sided tube folds over itself at a sharp bend
        for j in range(1, len(p) - 1):
            d0, d1 = Vector(p[j]) - Vector(p[j - 1]), Vector(p[j + 1]) - Vector(p[j])
            if d0.length > 1e-6 and d1.length > 1e-6 and d0.angle(d1) > radians(50):
                cuts.append(j)
        cuts.append(len(p) - 1)
        for q in range(len(cuts) - 1):
            pts = [(px * k, 0.852 - 0.003 * (run % 3), 2.16 + py * k) for px, py in p[cuts[q]:cuts[q + 1] + 1]]
            ne.emit(p_tube(pts, 0.022, 3, True, False), NEON, None, jit=0)
            run += 1
    for sx in (-1, 1):
        pts = [(sx * 1.14 + cos(radians(200 + i * 23)) * 0.075 * sx, 0.852, 2.23 + sin(radians(200 + i * 23)) * 0.12 + 0.05) for i in range(7)]
        ne.emit(p_tube(pts, 0.02, 3), "#ff9a5a", None, jit=0)
    a.point("light", (0, 0.4, 2.2))
    a.point("sal", (0.1, 0.3, 0))
    return a


# ---------------------------------------------------------------- manager's desk (4 x 2)
def desk(name, seed):
    """the manager's corner, on an oxblood rug: a pedestal desk with a green leather top, the lamp, a telephone, a
    golden banana for a paperweight; a studded leather chair, a hat stand with a bowler and an umbrella, a globe."""
    a = F(name, seed, 4, 2, glow=2.0)
    g, b, em = a.mesh(), a.mesh("gloss"), a.mesh("emissive")
    r = a.rng
    g.box(3.74, 1.84, 0.02, (0, 0, 0), col=LEATHER, b=0.0, jit=0.02)
    g.paint_line([(-1.74, -0.8), (1.74, -0.8), (1.74, 0.8), (-1.74, 0.8)], 0.05, TOP(0, 0, 0.02), BRASS_D, closed=True, lift=0.004)
    g.paint_line([(-1.6, -0.66), (1.6, -0.66), (1.6, 0.66), (-1.6, 0.66)], 0.022, TOP(0, 0, 0.02), LEATHER_D, closed=True, lift=0.006)
    dy = -0.28
    for sx in (-1, 1):
        g.box(0.74, 0.84, 0.7, (sx * 0.98, dy, 0.07), col=MAHOG[0], b=0.03, grad=(0.86, 1.04))
        g.box(0.8, 0.9, 0.07, (sx * 0.98, dy, 0.02), col=MAHOG_D, b=0.02)
        g.box(0.56, 0.03, 0.5, (sx * 0.98, dy - 0.425, 0.17), col=shade(MAHOG[0], 1.12), b=0.02, jit=0.03)
    g.box(1.24, 0.06, 0.52, (0, dy - 0.36, 0.25), col=MAHOG[2], b=0.015)
    crest(b, (0, dy - 0.39, 0.52), r=0.15, n=10)
    g.box(3.04, 1.08, 0.08, (0, dy, 0.77), col=MAHOG_D, b=0.03)
    g.box(2.5, 0.72, 0.016, (0, dy, 0.846), col=GREENB, b=0.0, jit=0.02)
    for sx in (-1, 1):
        for sy in (-1, 1):
            b.box(0.14, 0.14, 0.03, (sx * 1.455, dy + sy * 0.475, 0.83), col=BRASS, b=0.0)
    lamp_banker(g, em, (-1.08, dy + 0.18, 0.862), 16, 1.05)
    # nameplate
    b.emit(p_extrude_x([(-0.05, 0.0), (0.05, 0.0), (0.0, 0.11)], -0.32, 0.32), BRASS, T(0.0, dy - 0.42, 0.862), jit=0.02, flat=True)
    g.paint_text("MANAGER", 0.055, T(0.0, dy - 0.42, 0.862) @ T(0, -0.0376, 0.0273, 65.56, 0, 0), MAHOG_D, w=0.013)
    # telephone
    g.box(0.3, 0.26, 0.1, (1.08, dy + 0.12, 0.862), (0, 0, -14), col="#26242a", b=0.035, taper=(0.8, 0.8))
    with g.at(T(1.08, dy + 0.12, 0.962, 0, 0, -14)), b.at(T(1.08, dy + 0.12, 0.962, 0, 0, -14)):
        g.pole((-0.17, 0.05, 0.05), (0.17, 0.05, 0.05), 0.03, "#26242a", n=5, b=0.008)
        for sx in (-1, 1):
            g.cyl(0.05, 0.05, (sx * 0.17, 0.05, 0.0), col="#26242a", n=6, b=0.012)
        b.emit(p_lathe([(0.075, 0.0), (0.075, 0.012), (0.0, 0.016)], 8, cap0=False), BRASS, T(0, -0.085, 0.01, 55, 0, 0), jit=0.02)
    # ledgers, a blotter with a letter, a pen, a mug, the golden banana
    books(g, (0.52, dy + 0.2, 0.862), 3, 12)
    g.box(0.56, 0.4, 0.012, (-0.1, dy - 0.1, 0.8625), (0, 0, 4), col=PAPER, b=0.0)
    for k in range(4):
        g.paint_line([(-0.2, 0.12 - k * 0.07), (0.2 - 0.09 * (k == 3), 0.12 - k * 0.07)], 0.02, TOP(-0.1, dy - 0.1, 0.875) @ T(rz=4), "#8f8676", lift=0.003)
    g.pole((0.26, dy - 0.2, 0.875), (0.4, dy - 0.02, 0.875), 0.012, INK, n=4, b=0, cap=BRASS_L)
    g.lathe([(0.05, 0.0), (0.06, 0.1), (0.05, 0.1), (0.04, 0.02)], (-0.58, dy + 0.24, 0.862), col=CREAM, n=7, cap1=False)
    g.box(0.2, 0.14, 0.06, (0.72, dy - 0.26, 0.862), col=MAHOG[1], b=0.015)
    banana(b, (0.72, dy - 0.26, 0.942), (0, 0, 15), 0.56, col=GOLD)
    coin_stack(g, (-0.66, dy - 0.3, 0.862), 4)
    # the chair, turned a little
    C = T(0.12, 0.52, 0, 0, 0, 14)
    with g.at(C), b.at(C):
        b.cyl(0.3, 0.04, (0, 0, 0.02), col=BRASS_D, n=10, b=0.012)
        b.pole((0, 0, 0.05), (0, 0, 0.42), 0.045, BRASS, n=6, b=0)
        g.box(0.7, 0.66, 0.16, (0, 0, 0.4), col=LEATHER, b=0.06)
        g.box(0.72, 0.16, 0.98, (0, 0.3, 0.5), (-7, 0, 0), col=LEATHER, b=0.07, taper=(0.82, 1.0), grad=(0.9, 1.06))
        for sx in (-1, 1):
            g.box(0.1, 0.5, 0.1, (sx * 0.36, 0.02, 0.68), col=MAHOG_D, b=0.03)
            g.box(0.08, 0.08, 0.2, (sx * 0.36, -0.18, 0.5), col=MAHOG_D, b=0.02)
        with b.at(T(0, 0.3, 0.5, -7, 0, 0)):                      # tufting studs on the back
            for (sx_, sz_) in ((-0.16, 0.3), (0.16, 0.3), (0, 0.45), (-0.16, 0.6), (0.16, 0.6), (0, 0.75)):
                stud(b, (sx_ * (1 - 0.14 * sz_), -0.08, sz_), (0, -1, 0), r=0.032, col=BRASS_L)
    # hat stand: a bowler, an umbrella with a banana handle
    hx, hy = -1.66, 0.56
    g.cyl(0.24, 0.05, (hx, hy, 0.02), col=MAHOG_D, n=9, b=0.015)
    g.pole((hx, hy, 0.06), (hx, hy, 1.86), 0.035, MAHOG[0], n=6, b=0)
    for k in range(3):
        ang = radians(k * 120 + 200)
        b.pole((hx, hy, 1.62), (hx + cos(ang) * 0.24, hy + sin(ang) * 0.24, 1.76), 0.02, BRASS, n=4, b=0)
    g.lathe([(0.27, 0.0), (0.28, 0.025), (0.17, 0.04), (0.18, 0.16), (0.1, 0.23), (0.0, 0.24)], (hx, hy, 1.85), col="#2c2a33", n=10, smooth=50)
    g.emit(p_lathe([(0.178, 0.05), (0.185, 0.1)], 10, cap0=False, cap1=False), "#ffb02a", T(hx, hy, 1.85), jit=0)
    ux, uy = hx + cos(radians(320)) * 0.24, hy + sin(radians(320)) * 0.24
    g.pole((ux, uy, 1.7), (ux + 0.04, uy - 0.02, 0.62), 0.05, "#26242a", n=6, r2=0.015, b=0)
    banana(g, (ux, uy, 1.76), (90, 0, 40), 0.42)
    # a globe on a brass stand
    gx, gy = 1.64, 0.52
    b.cyl(0.2, 0.04, (gx, gy, 0.02), col=BRASS_D, n=8, b=0.012)
    b.pole((gx, gy, 0.05), (gx, gy, 0.78), 0.03, BRASS, n=5, b=0)
    def land(c, t):
        v = sin(c.x * 9 + 1.3) * sin(c.y * 8 + 0.4) + 0.6 * sin(c.z * 11 + 2.0) * sin(c.x * 5)
        return "#7fa858" if v > 0.28 else "#3f8f9a"
    g.emit(p_sphere(0.27, 10, 6), land, T(gx, gy, 1.08, 0, 18, 0), jit=0.02, smooth=70)
    b.emit(p_tube([(cos(radians(t)) * 0.3, 0, sin(radians(t)) * 0.3) for t in range(-100, 101, 25)], 0.018, 4), BRASS, T(gx, gy, 1.08, 0, 18, 0), jit=0.02)
    # waste basket, front right
    g.lathe([(0.13, 0.0), (0.18, 0.34), (0.165, 0.34), (0.12, 0.03)], (1.56, -0.66, 0.02), col="#b99a66", n=8, cap1=False)
    for (dx, dy_, dz) in ((0, 0, 0.22), (0.05, 0.04, 0.3), (-0.3, -0.06, 0.0)):
        g.rock(0.13, 0.12, 0.1, (1.56 + dx, -0.66 + dy_, 0.02 + dz), col=PAPER, n=8, b=0.012, seed=r.random(), flatbase=False)
    a.point("light", (-1.08, dy, 1.3))
    return a
