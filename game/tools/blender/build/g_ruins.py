"""Penal Colony ruins: floor tiles, steps, drum pillars, broken wall, arch, the vine door, the Warden's Vault with
its strongbox plinth, the wired-backwards fuse box (ep04) and the secret shrine statue."""
from kit import *

G = "ruins"


def floor(name, seed, nx=4, ny=4, s=1.0, missing=()):
    a = Asset(name, G, footprint=0.1, seed=seed, ao_dist=0.6)
    g, r = a.mesh(), a.rng
    g.box(nx * s + 0.1, ny * s + 0.1, 0.06, (0, 0, -0.05), col="#7f6c52", b=0.0, jit=0)       # dark bed that shows in the joints
    for i in range(nx):
        for k in range(ny):
            if (i, k) in missing:
                continue
            x, y = (i - (nx - 1) / 2) * s, (k - (ny - 1) / 2) * s
            tilt = (r.uniform(-2.5, 2.5), r.uniform(-2.5, 2.5), r.uniform(-1.5, 1.5)) if r.random() < 0.3 else (0, 0, r.uniform(-0.8, 0.8))
            zs = -0.03 + r.uniform(0, 0.015)
            g.box(s - 0.07, s - 0.07, 0.11, (x, y, zs), tilt, col=pick(r, STONE), b=0.035, jit=0.05)
            if r.random() < 0.22 and abs(tilt[0]) < 1:
                g.paint_crack([(-0.3, 0.32), (-0.1, 0.1), (-0.16, -0.08), (0.1, -0.3)], 0.05, TOP(x, y, zs + 0.11) @ T(rz=r.uniform(0, 360)), "#7a674e")
    for (i, k) in missing:
        x, y = (i - (nx - 1) / 2) * s, (k - (ny - 1) / 2) * s
        moss_pad(g, 0.7, 0.55, (x, y, -0.01), rz=r.uniform(0, 180), h=0.07)
        rubble(g, 3, x, y, 0.3, 0.12, 0.24, STONE, seed=seed + i)
    return a


def steps(name, seed, W=2.8, n=3):
    a = Asset(name, G, footprint=1.0, seed=seed)
    g, r = a.mesh(), a.rng
    for i in range(n):
        d = 0.5
        for k in range(2):
            stone_block(g, W / 2 - 0.02, d * (n - i), 0.24, ((k - 0.5) * W / 2, (i * d) / 2, i * 0.22 - 0.03), b=0.05, chip=0.8)
    for sx in (-1, 1):
        stone_block(g, 0.5, n * 0.5 + 0.3, 0.5, (sx * (W / 2 + 0.24), 0, -0.04), b=0.08)
        stone_block(g, 0.48, 0.8, 0.45, (sx * (W / 2 + 0.24), n * 0.25 - 0.25, 0.44), b=0.08)
    return a


def drum(g, at, r=0.44, h=0.64, rot=(0, 0, 0), col=None):
    col = col or pick(g.rng, STONE)
    g.emit(p_lathe([(r - 0.06, 0), (r, 0.06), (r, h - 0.06), (r - 0.06, h)], 10, tags=[1, 0, 1]), col, T(*at, *rot) @ T(rz=g.rng.uniform(0, 36)), jit=0.05, grad=(0.9, 1.04), smooth=50)


def pillar(name, seed, kind="whole"):
    a = Asset(name, G, footprint=0.65, blocksMove=True, blocksShot=True, tall=kind != "fallen", seed=seed)
    g, r = a.mesh(), a.rng
    stone_block(g, 1.2, 1.2, 0.3, (0, 0, -0.04), b=0.07)
    stone_block(g, 1.0, 1.0, 0.2, (0, 0, 0.25), b=0.06)
    n = 4 if kind == "whole" else 2
    z = 0.44
    for i in range(n):
        drum(g, (r.uniform(-0.02, 0.02), r.uniform(-0.02, 0.02), z))
        z += 0.63
    if kind == "whole":
        drum(g, (0, 0, z), r=0.56, h=0.22)
        stone_block(g, 1.3, 1.3, 0.26, (0, 0, z + 0.2), b=0.07)
    else:
        g.rock(0.86, 0.86, 0.5, (0.02, 0, z - 0.14), col=pick(r, STONE), n=12, b=0.06, seed=seed)       # jagged break
        moss_pad(g, 0.5, 0.36, (-0.1, 0.05, z + 0.2), rz=30, h=0.06)
    if kind == "fallen":
        for i, (x, y, rz) in enumerate([(1.2, -0.5, 20), (1.84, -0.28, 26), (2.5, -0.02, 34)]):
            drum(g, (x, y, 0.4), rot=(90, 0, rz))
        rubble(g, 6, 1.2, 0.2, 0.9, 0.16, 0.36, STONE, seed=seed)
    return a


def broken_wall(name, seed, L=3.8):
    a = Asset(name, G, footprint=0.6, blocksMove=True, blocksShot=True, tall=True, seed=seed)
    g, r = a.mesh(), a.rng
    stone_run(g, (-L / 2, 0), (L / 2, 0), 5, crest=lambda row, t: row < 5.4 - t * 4.6)
    rubble(g, 7, L / 2 - 0.5, -0.6, 0.8, 0.18, 0.4, STONE, seed=seed)
    moss_pad(g, 0.6, 0.4, (-L / 2 + 0.6, 0, 2.46), rz=15, h=0.07)
    vine(g, [(-L / 2 + 0.9, -0.33, 2.45), (-L / 2 + 0.95, -0.36, 1.8), (-L / 2 + 0.8, -0.36, 1.2), (-L / 2 + 0.9, -0.36, 0.7)], leaves=6)
    return a


def arch(name, seed, W=2.4):
    a = Asset(name, G, footprint=0.6, blocksMove=False, tall=True, seed=seed, ao_dist=1.8)
    g, r = a.mesh(), a.rng
    for sx in (-1, 1):
        x = sx * (W / 2 + 0.42)
        for i in range(4):
            stone_block(g, 0.86, 0.72, 0.52, (x, 0, i * 0.52 - 0.04), b=0.08, chip=1.5)
    Rin, zc = W / 2, 2.04
    n = 9
    for i in range(n):
        if i == n - 2:
            continue                # one voussoir has dropped out
        ang = pi * (i + 0.5) / n
        g.emit(p_box(0.44, 0.7, 0.8, 0.07, taper=(1.6, 1.0)), pick(r, STONE) if i != n // 2 else STONE[3], T(0, 0, zc, 0, 90 - degrees(ang), 0) @ T(0, 0, Rin), jit=0.05)
    R = Rin + 0.8
    stone_block(g, 0.6, 0.66, 0.36, (W / 2 + 1.2, -0.7, -0.05), (0, 12, 30), b=0.08)        # the dropped one
    rubble(g, 5, W / 2 + 0.9, -0.6, 0.6, 0.16, 0.3, STONE, seed=seed)
    icon_banana(g, FRONT(0, -0.36, zc + Rin + 0.22), 0.34, "#8a765a")
    vine(g, [(-R + 0.3, -0.38, 2.9), (-R + 0.15, -0.4, 2.2), (-R + 0.3, -0.4, 1.5), (-R + 0.2, -0.4, 0.9)], leaves=6)
    return a


def vine_door(name, seed, W=3.4, H=3.0):
    """overgrown wooden door in a stone frame. The leaf is a separate node hinged on the -x jamb."""
    a = Asset(name, G, footprint=2.2, blocksMove=True, blocksShot=True, tall=True, seed=seed, ao_dist=2.0, glow=1.6)
    g, r = a.mesh(), a.rng
    for sx in (-1, 1):
        x = sx * (W / 2 + 0.45)
        for i in range(6):
            stone_block(g, 0.9, 0.9, 0.58, (x, 0, i * 0.58 - 0.04), b=0.09, chip=1.2)
        stone_block(g, 1.15, 1.1, 0.34, (x, 0, -0.06), b=0.08)
    for i in range(5):
        stone_block(g, (W + 1.9) / 5 - 0.02, 1.0, 0.62, ((i - 2) * (W + 1.9) / 5, 0, H + 0.42), b=0.09, chip=1.0)
    g.box(1.0, 1.08, 0.8, (0, 0, H + 0.36), col=STONE[3], b=0.09, jit=0.03)                            # keystone
    icon_banana(g, FRONT(0, -0.545, H + 0.5), 0.56, "#8a765a")
    stone_block(g, W + 0.1, 0.5, 0.14, (0, 0, -0.06), col=STONE_D, b=0.03)                          # sill
    # static vines over the frame
    vine(g, [(-W / 2 - 0.6, -0.5, H + 0.9), (-W / 2 - 0.75, -0.52, H + 0.2), (-W / 2 - 0.6, -0.5, 2.2), (-W / 2 - 0.72, -0.5, 1.4), (-W / 2 - 0.6, -0.5, 0.5)], 0.06, leaves=8, ls=0.26)
    vine(g, [(W / 2 + 0.3, -0.52, H + 1.0), (W / 2 + 0.55, -0.55, H + 0.1), (W / 2 + 0.7, -0.5, 2.4), (W / 2 + 0.55, -0.5, 1.7)], 0.06, leaves=6, ls=0.26)
    vine(g, [(-1.6, -0.55, H + 1.02), (-0.8, -0.58, H + 0.85), (0.2, -0.58, H + 0.98), (1.2, -0.56, H + 0.88), (1.9, -0.5, H + 1.0)], 0.07, leaves=7, ls=0.28, face=(0, -0.5, 1))
    moss_pad(g, 0.9, 0.6, (-1.5, 0.1, H + 1.03), rz=20, h=0.08)
    moss_pad(g, 0.7, 0.5, (1.7, -0.05, H + 1.035), rz=70, h=0.08)
    # the leaf
    lf = a.part("leaf", (-W / 2, 0, 0))
    n = 6
    pw = (W - 0.06) / n
    for i in range(n):
        x = -W / 2 + 0.03 + pw * (i + 0.5)
        top = H - 0.06 - 0.22 * abs((i + 0.5) / n - 0.5) * 2 * 0.6
        plank(lf, (x, 0, 0.06), (x, 0, top), pw - 0.03, 0.22, pal=["#7a5230", "#84593a", "#6f4a2c", "#8a6040"], wob=0.006, b=0.03, grad=(0.86, 1.05))
    for z in (0.55, 1.5, 2.45):
        for sy, yy in ((-1, -0.13), (1, 0.13)):
            lf.box(W - 0.1, 0.07, 0.22, (0, yy, z - 0.11), col=IRON, b=0.025, jit=0.02)
        rivets(lf, [(-W / 2 + 0.2 + i * (W - 0.4) / 6, -0.166, z) for i in range(7)], 0.04, STEEL)
    lf.box(0.62, 0.1, 0.84, (0.55, -0.16, 1.02), col=GOLD, b=0.05, hl=1.2, jit=0)                        # the big keyhole plate
    rivets(lf, [(0.55 + sx * 0.23, -0.212, 1.44 + sz * 0.33) for sx in (-1, 1) for sz in (-1, 1)], 0.035, GOLD_D)
    kh = a.part("leaf", (-W / 2, 0, 0), "emissive")
    m = FRONT(0.55, -0.212, 1.44)
    kh.paint_poly(circle(0.13, 12, cy=0.07), m, "#ffdf8a")
    kh.paint_poly([(-0.06, 0.02), (0.06, 0.02), (0.11, -0.24), (-0.11, -0.24)], m, "#ffdf8a")
    lf.box(0.16, 0.12, 0.5, (W / 2 - 0.5, -0.17, 1.2), col=IRON, b=0.03)                                 # pull handle
    vine(lf, [(-1.2, -0.14, H - 0.1), (-1.0, -0.17, 2.2), (-1.25, -0.17, 1.4), (-1.05, -0.17, 0.6), (-1.2, -0.17, 0.15)], 0.055, leaves=8, ls=0.25)
    vine(lf, [(0.2, -0.14, H - 0.05), (-0.05, -0.17, 2.5), (0.12, -0.17, 2.05)], 0.05, leaves=4, ls=0.24)
    vine(lf, [(1.3, -0.14, H - 0.2), (1.42, -0.17, 2.3), (1.22, -0.17, 1.75), (1.4, -0.17, 0.9), (1.3, -0.17, 0.4)], 0.055, leaves=7, ls=0.25)
    a.point("keyhole", (0.55, -0.3, 1.44))
    return a


def gold_stack(g, at, n=3, rz=0.0):
    with g.at(T(*at, 0, 0, rz)):
        k = 0
        for row in range(n):
            for i in range(n - row):
                g.box(0.4, 0.2, 0.13, ((i - (n - row - 1) / 2) * 0.42, 0, row * 0.13), col=GOLD, b=0.035, taper=(0.88, 0.75), jit=0.03, hl=1.2)


def plinth(g, at=(0, 0, 0), w=2.0, d=1.6):
    with g.at(T(*at)):
        stone_block(g, w, d, 0.24, (0, 0, -0.04), b=0.06)
        stone_block(g, w - 0.36, d - 0.36, 0.22, (0, 0, 0.19), col=STONE[3], b=0.06)
        g.box(w - 0.5, 0.05, 0.1, (0, -(d - 0.36) / 2 - 0.0, 0.25), col=GOLD_D, b=0.015)


def vault(name, seed):
    """the Warden's Vault: tall north + east walls (they face the camera), low broken south + west so the room reads"""
    a = Asset(name, G, footprint=4.5, tall=True, seed=seed, ao_dist=2.2, glow=2.2)
    g, r = a.mesh(), a.rng
    X, Y = 4.4, 3.4
    # floor: big slabs with a darker inlaid border
    g.box(2 * X + 0.2, 2 * Y + 0.2, 0.06, (0, 0, -0.05), col="#7f6c52", b=0, jit=0)
    for i in range(6):
        for k in range(5):
            x, y = (i - 2.5) * (2 * X / 6), (k - 2) * (2 * Y / 5)
            edge = i in (0, 5) or k in (0, 4)
            g.box(2 * X / 6 - 0.06, 2 * Y / 5 - 0.06, 0.1, (x, y, -0.03), (0, 0, r.uniform(-0.5, 0.5)), col=pick(r, ["#a88f6c", "#9c8462"] if edge else STONE), b=0.03, jit=0.04)
    stone_run(g, (-X, Y), (X, Y), 6, thick=0.7, bl=1.1, crest=lambda row, t: row < 5 or 0.12 < t < 0.9)
    stone_run(g, (X, Y - 0.36), (X, -Y), 6, thick=0.7, bl=1.1, crest=lambda row, t: row < 6 - max(0, t - 0.55) * 9)        # butts into the north wall
    stone_run(g, (X - 0.36, -Y), (0.2, -Y), 2, thick=0.7, bl=1.1, crest=lambda row, t: row < 2 - t * 1.6)
    stone_run(g, (-X, Y - 0.36), (-X, 0.8), 3, thick=0.7, bl=1.1, crest=lambda row, t: row < 3.2 - t * 3)
    for (x, y) in ((-X + 0.75, Y - 0.75), (X - 0.75, Y - 0.75), (X - 0.75, -Y + 1.2)):      # pillars at the corners
        stone_block(g, 0.95, 0.95, 0.26, (x, y, 0.05), b=0.06)
        for i in range(4):
            drum(g, (x, y, 0.3 + i * 0.63), r=0.36)
        stone_block(g, 1.0, 1.0, 0.24, (x, y, 2.82), b=0.06)
    # the warden's banner on the north wall
    g.sheet([[(-0.7 + 1.4 * i / 2, Y - 0.42 - 0.03 * (k % 2), 2.8 - 1.5 * k / 3) for k in range(4)] for i in range(3)], RED_D, 0.04)
    g.box(1.7, 0.1, 0.1, (0, Y - 0.42, 2.78), col=GOLD_D, b=0.02)
    icon_banana(g, FRONT(0, Y - 0.445, 1.9), 0.8, GOLD)
    # treasure
    gold_stack(g, (-2.6, Y - 1.0, 0.07), 3, 8)
    gold_stack(g, (2.4, Y - 0.95, 0.07), 4, -6)
    gold_stack(g, (X - 1.0, 0.3, 0.07), 3, 84)
    for (x, y, s) in [(-1.5, Y - 0.9, 0.7), (1.0, Y - 0.85, 0.55), (X - 0.95, 1.6, 0.6), (X - 1.1, -1.0, 0.5)]:
        g.ball(s * 0.8, (x, y, 0.05), col=GOLD_D, n=9, m=3, s=(1, 1, 0.55), z0=0.0, z1=1.0, jit=0.03)       # coin heaps
        for i in range(9):
            ang = r.uniform(0, 2 * pi)
            rad = s * r.uniform(0.1, 1.0)
            g.cyl(0.1, 0.035, (x + cos(ang) * rad, y + sin(ang) * rad, 0.045 + 0.42 * s * max(0, 1 - (rad / (s * 0.8)) ** 2) ** 0.5), (r.uniform(-30, 30), r.uniform(-30, 30), 0), col=pick(r, [GOLD_L, GOLD]), n=7, b=0.01, jit=0.03, hl=1.2)
    # wall torches
    em = a.mesh("emissive")
    for i, (x, y, fy) in enumerate([(-2.2, Y - 0.36, -1), (2.2, Y - 0.36, -1)]):
        g.beam((x, y, 1.9), (x, y - 0.32, 2.2), 0.08, 0.08, IRON, b=0.02)
        g.lathe([(0.06, 0), (0.13, 0.12), (0.11, 0.16)], (x, y - 0.33, 2.16), col=IRON, n=7)
        em.lathe([(0.0, 0.0), (0.1, 0.06), (0.11, 0.16), (0.05, 0.34), (0.0, 0.44)], (x, y - 0.33, 2.28), col=FLAME[1], n=6, jit=0)
        a.point(f"light{i}", (x, y - 0.4, 2.5))
    plinth(g, (1.0, 1.0, 0.07))
    a.point("crate", (1.0, 1.0, 0.5))
    return a


def plinth_asset(name, seed):
    a = Asset(name, G, footprint=1.1, blocksMove=True, seed=seed)
    plinth(a.mesh())
    a.point("crate", (0, 0, 0.42))
    return a


def fusebox(name, seed):
    """ep04: the vault's fuse box, wired backwards. Lever is a hinged node; spark point at the crossed wires."""
    a = Asset(name, G, footprint=0.5, blocksMove=True, tall=True, seed=seed, glow=2.4)
    g, r = a.mesh(), a.rng
    stone_block(g, 1.1, 0.8, 0.36, (0, 0.1, -0.04), b=0.07)
    for sx in (-1, 1):
        g.box(0.14, 0.14, 2.3, (sx * 0.4, 0.16, 0.2), col=pick(r, WOOD_D), b=0.03)
    g.box(1.1, 0.07, 0.14, (0, 0.2, 2.3), col=pick(r, WOOD_D), b=0.02)
    # cabinet
    g.box(1.06, 0.34, 1.26, (0, 0, 0.92), col="#59666b", b=0.04, grad=(0.88, 1.05), jit=0.02)
    g.box(0.9, 0.05, 1.1, (0, -0.16, 1.0), col="#262a2d", b=0.0, jit=0)                       # dark inside
    g.box(1.14, 0.42, 0.08, (0, 0, 2.16), (6, 0, 0), col=RUST[1], b=0.02)                     # rain lip
    with g.at(T(-0.53, -0.17, 0.92, 0, 0, -112)):                                             # the door, swung open
        g.box(1.0, 0.05, 1.2, (-0.5, 0, 0.012), col="#6b797e", b=0.02, jit=0.02)
        g.paint_poly([(-0.2, 0.0), (0.2, 0.0), (0.0, 0.34)], BACK(-0.5, 0.027, 0.5), BANANA)   # warning triangle
        g.paint_line([(0.0, 0.1), (0.0, 0.22)], 0.04, BACK(-0.5, 0.03, 0.5), DARK)
    for i in range(4):          # ceramic fuses
        g.cyl(0.065, 0.2, (-0.3 + i * 0.2, -0.2, 1.62), (90, 0, 0), col=CREAM, n=7, b=0.02)
        g.cyl(0.05, 0.06, (-0.3 + i * 0.2, -0.2, 1.3), (90, 0, 0), col=GOLD_D, n=6, b=0.01)
    # the gag: two fat wires crossed to the wrong terminals
    red, blu = "#d7402f", "#3f8f9a"
    g.tube([(-0.3, -0.24, 1.6), (-0.28, -0.36, 1.45), (0.24, -0.36, 1.18), (0.3, -0.24, 1.08)], 0.04, red, n=6)
    g.tube([(0.3, -0.24, 1.6), (0.28, -0.42, 1.45), (-0.24, -0.42, 1.18), (-0.3, -0.24, 1.08)], 0.04, blu, n=6)
    for x, c in ((-0.3, blu), (0.3, red)):
        g.box(0.14, 0.1, 0.12, (x, -0.2, 1.02), col=c, b=0.02, jit=0)                           # terminals painted the other colour
    # sign above: PULL + arrow down + an open door (pull to open). It closes it.
    g.box(1.0, 0.06, 0.52, (0, 0.1, 2.42), col=CREAM, b=0.02, jit=0.02)
    g.paint_text("PULL", 0.2, FRONT(-0.16, 0.069, 2.6), RED_D, w=0.045)
    icon_arrow(g, FRONT(0.34, 0.069, 2.7, -90), 0.34, RED_D)
    g.paint_line([(-0.4, 0.06), (0.06, 0.06)], 0.035, FRONT(-0.02, 0.069, 2.48), DARK)
    # lever on the right side
    g.box(0.12, 0.2, 0.34, (0.59, -0.02, 1.36), col=STEEL_D, b=0.025)
    lv = a.part("lever", (0.66, -0.02, 1.53))
    lv.pole((0.66, -0.02, 1.53), (0.66, -0.3, 1.93), 0.04, STEEL_L, n=6)
    lv.ball(0.1, (0.66, -0.33, 1.97), col=RED, n=8, m=4)
    lv.cyl(0.07, 0.1, (0.61, -0.02, 1.53), (0, 90, 0), col=STEEL, n=7, b=0.015)
    em = a.mesh("emissive")
    em.ball(0.085, (-0.34, -0.02, 2.24), col="#ff5a3c", n=7, m=3, jit=0)
    g.cyl(0.07, 0.06, (-0.34, -0.02, 2.18), col=STEEL_D, n=7, b=0.01)
    # conduit to the ground
    g.tube([(0.2, 0.0, 0.95), (0.2, 0.0, 0.5), (0.5, -0.3, 0.12), (1.0, -0.5, 0.05)], 0.06, STEEL_D, n=6)
    a.point("spark", (0.0, -0.42, 1.32))
    return a


def statue(name, seed):
    """the secret shrine: a golden chubby monkey in a bowler and shades, holding a banana aloft. Plaque: IN BANANAS WE TRUST"""
    a = Asset(name, G, footprint=0.9, blocksMove=True, blocksShot=True, tall=True, seed=seed, glow=2.0, ao_dist=1.2)
    g, r = a.mesh(), a.rng
    stone_block(g, 1.9, 1.9, 0.3, (0, 0, -0.04), b=0.07)
    stone_block(g, 1.5, 1.5, 0.7, (0, 0, 0.25), col=STONE[3], b=0.08)
    stone_block(g, 1.66, 1.66, 0.16, (0, 0, 0.93), b=0.05)
    # plaque
    g.box(1.24, 0.07, 0.5, (0, -0.76, 0.35), col="#4a3a2c", b=0.025, jit=0)
    g.paint_line([(-0.56, -0.19), (0.56, -0.19), (0.56, 0.19), (-0.56, 0.19)], 0.025, FRONT(0, -0.797, 0.6), GOLD_D, closed=True)
    g.paint_text("IN BANANAS", 0.11, FRONT(0, -0.797, 0.63), GOLD, w=0.026)
    g.paint_text("WE TRUST", 0.11, FRONT(0, -0.797, 0.46), GOLD, w=0.026)
    gd = dict(col=GOLD, hl=1.2, jit=0.02)
    z = 1.08
    # feet, chubby body, belly
    for sx in (-1, 1):
        g.ball(0.2, (sx * 0.24, -0.08, z + 0.1), s=(1, 1.4, 0.6), n=8, m=4, **gd)
    g.ball(0.52, (0, 0, z + 0.58), s=(1, 0.92, 1.02), n=12, m=7, **gd)
    g.ball(0.36, (0, -0.2, z + 0.5), s=(1, 0.7, 0.95), n=10, m=5, col=GOLD_L, jit=0.02)        # paler belly
    # tie
    g.emit(p_prism([(-0.07, 0.0), (0.07, 0.0), (0.1, -0.3), (0.0, -0.4), (-0.1, -0.3)], 0.1), GOLD_D, T(0, -0.36, z + 0.88, 90, 0, 0) @ T(rx=-10), jit=0.02)
    # head, muzzle, ears
    hz = z + 1.36
    g.ball(0.4, (0, 0, hz), s=(1.08, 0.96, 0.94), n=12, m=7, **gd)
    g.ball(0.24, (0, -0.28, hz - 0.1), s=(1.15, 0.7, 0.8), n=10, m=5, col=GOLD_L, jit=0.02)
    g.paint_line([(-0.11, 0.0), (-0.04, -0.045), (0.04, -0.045), (0.11, 0.0)], 0.03, FRONT(0, -0.44, hz - 0.14), GOLD_D)     # smirk
    for sx in (-1, 1):
        g.ball(0.17, (sx * 0.44, 0.02, hz + 0.02), s=(0.55, 1, 1), n=8, m=4, **gd)
        g.ball(0.1, (sx * 0.47, -0.02, hz + 0.02), s=(0.5, 1, 1), n=7, m=3, col=GOLD_D, jit=0.02)
    # shades: one dark bar with two lenses
    g.box(0.72, 0.1, 0.07, (0, -0.33, hz + 0.06), col="#1e1a22", b=0.02, jit=0)
    for sx in (-1, 1):
        g.box(0.3, 0.1, 0.2, (sx * 0.18, -0.345, hz - 0.06), col="#1e1a22", b=0.05, jit=0)
        g.paint_line([(-0.08, 0.04), (0.0, 0.07)], 0.028, FRONT(sx * 0.18, -0.393, hz - 0.0), "#8f8aa0")      # glint
    # bowler
    g.lathe([(0.56, 0.0), (0.57, 0.035), (0.39, 0.06), (0.39, 0.1)], (0, 0, hz + 0.26), col=GOLD, n=12, hl=1.2, jit=0.02, cap1=False)
    g.lathe([(0.39, 0.06), (0.4, 0.2), (0.36, 0.34), (0.22, 0.44), (0.0, 0.46)], (0, 0, hz + 0.26), col=GOLD, n=12, hl=1.2, jit=0.02, cap0=False)
    g.emit(p_lathe([(0.402, 0.07), (0.412, 0.1), (0.41, 0.17), (0.4, 0.19)], 12, cap0=False, cap1=False), GOLD_D, T(0, 0, hz + 0.26))
    # arms: left on the hip, right holding a banana high
    g.tube([(-0.44, 0, z + 0.86), (-0.66, -0.06, z + 0.6), (-0.5, -0.2, z + 0.42)], [0.13, 0.12, 0.11], GOLD, n=7, hl=1.2, jit=0.02)
    g.tube([(0.44, 0, z + 0.9), (0.7, -0.02, z + 1.2), (0.74, -0.05, z + 1.66)], [0.13, 0.12, 0.11], GOLD, n=7, hl=1.2, jit=0.02)
    g.ball(0.14, (0.74, -0.05, z + 1.74), n=8, m=4, **gd)
    banana(g, (0.72, -0.05, z + 2.0), (0, -70, 20), 1.5, col=GOLD_L)
    # tail curl
    g.tube([(0, 0.45, z + 0.3), (0.1, 0.72, z + 0.36), (0.3, 0.8, z + 0.62), (0.3, 0.66, z + 0.86), (0.16, 0.6, z + 0.74)], [0.08, 0.075, 0.07, 0.06, 0.05], GOLD, n=6, hl=1.2, jit=0.02)
    # offerings + candles
    em = a.mesh("emissive")
    for i, (x, y) in enumerate([(-0.78, -0.82), (0.78, -0.82), (-0.86, 0.3), (0.86, 0.3)]):
        g.cyl(0.07, 0.24 + 0.06 * (i % 2), (x, y, 0.24), col=CREAM, n=7, b=0.015)
        em.lathe([(0.0, 0.0), (0.045, 0.04), (0.035, 0.1), (0.0, 0.17)], (x, y, 0.49 + 0.06 * (i % 2)), col=FLAME[1], n=5, jit=0)
    g.lathe([(0.1, 0), (0.26, 0.1), (0.28, 0.14), (0.22, 0.1)], (0, -1.12, -0.02), col=pick(r, STONE), n=10, cap1=True)
    bunch(g, (0.02, -1.12, 0.12), (0, 0, 30), 0.85)
    a.point("glint", (0, -0.42, hz))
    return a


def build():
    floor("ruin_floor_a", 61)
    floor("ruin_floor_b", 62, missing=((0, 0), (3, 2)))
    floor("ruin_floor_c", 63, nx=3, ny=2, missing=((2, 1),))
    steps("ruin_steps", 64)
    pillar("pillar_a", 65, "whole")
    pillar("pillar_b", 66, "broken")
    pillar("pillar_c", 67, "fallen")
    broken_wall("ruin_wall_broken", 68)
    arch("ruin_arch", 69)
    vine_door("vine_door", 70)
    vault("vault", 71)
    plinth_asset("vault_plinth", 72)
    fusebox("fusebox", 73)
    statue("statue", 74)


REVIEW = dict(cols=5, cell=5.6, dist=44)
