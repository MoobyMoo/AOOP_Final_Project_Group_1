"""Walls: solid modules + the breakable set. One "you can break this" language everywhere: a rough warm-yellow X,
dark cracks, and paler, patched-up material. Every breakable kind has an intact module, a pre-fractured debris set
(the same chunks, one node each, origin at the chunk centroid) and the remains left standing afterwards.
Modules run along x, centred, wall thickness on y; kit_build.ts turns them to run along z and tiles them."""
from kit import *

G = "walls"
ROCK = ["#82776a", "#8c8073", "#766b5f", "#958a7c"]


def brk_marks(a, y, z, size, cracks, both=True):
    """the shared mark, on the -y face at depth y (and mirrored on +y): dark cracks plus a warm X in the emissive
    material, so it glows the same in sun and in shade"""
    g, em = a.mesh(), a.mesh("emissive")
    for F_, yy in ((FRONT, -abs(y)), (BACK, abs(y))) if both else ((FRONT, -abs(y)),):
        m = F_(0, yy, z)
        g.paint_x(size * 1.08, m, "#5a3a14", w=size * 0.25, lift=0.003)
        em.paint_x(size, m, BREAK_X, w=size * 0.17, lift=0.015)
        for c in cracks:
            g.paint_crack(c, 0.08, m)


CR_A = [[(-0.75, 0.75), (-0.62, 0.42), (-0.78, 0.18), (-0.66, -0.2), (-0.74, -0.55)], [(0.7, 0.8), (0.82, 0.5), (0.68, 0.22), (0.8, -0.1)], [(-0.66, -0.2), (-0.45, -0.32), (-0.4, -0.6)], [(0.68, 0.22), (0.5, 0.1)]]


# ------------------------------------------------------------------ palisade
def pal_log(g, x, h, r=0.2, lean=0.0, col=None):
    col = col or pick(g.rng, ["#8a6a42", "#7f5f3c", "#96734a", "#86633d"])
    g.lathe([(r * 0.9, 0.0), (r, 0.06), (r * 0.94, h - 0.34), (r * 0.5, h - 0.12), (0.0, h)], (x, 0, -0.06), (0, lean, 0), col=lambda c, tg: mix(col, ENDGRAIN, 0.55) if c.z > h - 0.3 else col, n=7, grad=(0.86, 1.06), jit=0.06)


def palisade(name, seed, L=2.5):
    a = Asset(name, G, footprint=0.5, blocksMove=True, blocksShot=True, tall=True, seed=seed)
    g, r = a.mesh(), a.rng
    n = 6
    for i in range(n):
        pal_log(g, -L / 2 + L * (i + 0.5) / n, r.uniform(2.25, 2.75), lean=r.uniform(-2, 2))
    for z in (0.7, 1.75):
        g.pole((-L / 2, 0.22, z), (L / 2, 0.22, z), 0.08, pick(r, WOOD), n=6, cap=ENDGRAIN)
        g.pole((-L / 2, -0.2, z + 0.05), (L / 2, -0.2, z + 0.05), 0.045, ROPE, n=5, b=0)
    return a


def palisade_post(name, seed):
    a = Asset(name, G, footprint=0.3, blocksMove=True, blocksShot=True, tall=True, seed=seed)
    pal_log(a.mesh(), 0, 2.9, r=0.24)
    lashing(a.mesh(), (0, 0, 2.0), (0, 0, 1), 0.23, turns=3)
    return a


def palisade_chunks(a, L=2.5):
    """boarded-up weak spot: mismatched pale planks, each snapped in two"""
    r = a.rng
    out = []
    n = 6
    for i in range(n):
        x = -L / 2 + L * (i + 0.5) / n
        w, h, t = L / n - 0.03, r.uniform(2.0, 2.45), 0.08
        zb = r.uniform(0.8, 1.5)
        col = pick(r, WOOD_PALE + WOOD_GREY)
        rot = r.uniform(-3, 3)
        j = [r.uniform(-0.09, 0.09) for _ in range(3)]
        lo = [(-w / 2, 0), (w / 2, 0), (w / 2, zb + j[0]), (0.08, zb + j[1] + 0.1), (-0.1, zb + j[1] - 0.06), (-w / 2, zb + j[2])]
        hi = [(-w / 2, zb + j[2] + 0.02), (-0.1, zb + j[1] - 0.04), (0.08, zb + j[1] + 0.12), (w / 2, zb + j[0] + 0.02), (w / 2, h), (0, h + 0.1), (-w / 2, h - 0.05)]
        for poly in (lo, hi):
            c = a.chunk()
            c.emit(p_prism(poly, t, 0.015), col, T(x, t / 2 + (0.007 if i % 2 else -0.007), -0.04, 90, 0, 0) @ T(rz=rot), jit=0.06, cap=None)
            out.append(c)
    for z, s in ((0.62, -1), (1.7, 1)):      # two battens nailed across, front and back
        for half in (-1, 1):
            c = a.chunk()
            plank(c, (half * 0.02, s * 0.064, z), (half * L / 2, s * 0.064, z + half * 0.08), 0.2, 0.06, roll=90, pal=WOOD_D)
            out.append(c)
    return out


def palisade_weak(name, seed, debris=False, L=2.5):
    a = Asset(name, G, footprint=0.5, blocksMove=not debris, blocksShot=not debris, tall=not debris, seed=seed, glow=1.0)
    chunks = palisade_chunks(a, L)
    if not debris:
        g = a.mesh()
        for c in chunks:
            g.absorb(c)
        brk_marks(a, 0.05, 1.2, 1.25, CR_A)
        rivets(g, [(x, -0.12, z) for x in (-0.9, -0.3, 0.3, 0.9) for z in (0.62,)], 0.03, IRON)
    else:
        for i, c in enumerate(chunks):
            a.adopt(f"chunk_{i}", c)
        rem = a.part("remains")
        r = a.rng
        for x in (-0.97, -0.58, 0.27, 0.99):      # splintered stumps (thinner than the planks they came from)
            w = 0.3
            rem.emit(p_prism([(-w / 2, 0), (w / 2, 0), (w / 2, r.uniform(0.15, 0.3)), (0.05, r.uniform(0.3, 0.5)), (-0.08, r.uniform(0.12, 0.25)), (-w / 2, r.uniform(0.25, 0.4))], 0.05, 0.008), pick(r, WOOD_PALE + WOOD_GREY), T(x, 0.024, -0.062, 90, 0, 0), jit=0.06)
        plank(rem, (-0.95, -0.02, 0.04), (-0.2, -0.7, 0.03), 0.3, 0.07, pal=WOOD_PALE)
    return a


# ------------------------------------------------------------------ ruin stone
def stone_courses(L, rows, thick=0.62, bh=0.5, seed=0, top=None):
    """block layout: [(x, z, len)] with staggered joints; top(i) can drop blocks for a broken crest"""
    out = []
    for row in range(rows):
        cuts = [0, L / 2, L] if row % 2 == 0 else [0, L / 4, L * 3 / 4, L]
        for i in range(len(cuts) - 1):
            if top and not top(row, i):
                continue
            out.append(((cuts[i] + cuts[i + 1]) / 2 - L / 2, row * bh, cuts[i + 1] - cuts[i]))
    return out


def stone_wall(name, seed, L=1.85, rows=5, crest=None, moss=True):
    a = Asset(name, G, footprint=0.55, blocksMove=True, blocksShot=True, tall=True, seed=seed)
    g, r = a.mesh(), a.rng
    for x, z, ln in stone_courses(L, rows, top=crest):
        stone_block(g, ln - 0.03, 0.62, 0.5 - 0.02, (x, 0, z - 0.04), b=0.075, chip=1.2)
    if moss:
        moss_pad(g, 0.7, 0.4, (r.uniform(-0.4, 0.4), 0, rows * 0.5 - 0.06 if not crest else 1.94), rz=r.uniform(0, 90))
    return a


def stone_chunks(a, L=1.85, rows=4):
    r = a.rng
    out = []
    for x, z, ln in stone_courses(L, rows):
        c = a.chunk()
        stone_block(c, ln - 0.05, 0.6, 0.47, (x + r.uniform(-0.03, 0.03), r.uniform(-0.05, 0.05), z - 0.04), (0, 0, 0), col=pick(r, ["#d3bd97", "#cdb690", "#c4ab84"]), b=0.085, chip=5)
        out.append(c)
    return out


def stone_weak(name, seed, debris=False, L=1.85):
    a = Asset(name, G, footprint=0.55, blocksMove=not debris, blocksShot=not debris, tall=not debris, seed=seed, glow=1.0)
    chunks = stone_chunks(a, L)
    if not debris:
        g = a.mesh()
        for c in chunks:
            g.absorb(c)
        brk_marks(a, 0.345, 1.0, 1.1, [[(p[0] * 0.85, p[1]) for p in c] for c in CR_A])
    else:
        for i, c in enumerate(chunks):
            a.adopt(f"chunk_{i}", c)
        rem = a.part("remains")
        stone_block(rem, 0.7, 0.6, 0.3, (-0.5, 0, -0.08), col=STONE[2], chip=4)
        stone_block(rem, 0.5, 0.55, 0.22, (0.55, 0.05, -0.06), col=STONE[1], chip=6)
        rubble(rem, 6, 0, -0.5, 0.8, 0.16, 0.34, STONE, seed=seed)
    return a


# ------------------------------------------------------------------ ship hull
def hull_wall(name, seed, L=2.5, H=2.5):
    a = Asset(name, G, footprint=0.4, blocksMove=True, blocksShot=True, tall=True, seed=seed)
    g, r = a.mesh(), a.rng
    rows = 6
    ph = H / rows
    for i in range(rows):
        col = HULL_T if i in (3,) else (RUST[1] if i == 0 else HULL_W)
        plank(g, (-L / 2, 0, ph * (i + 0.5) - 0.05), (L / 2, 0, ph * (i + 0.5) - 0.05), ph - 0.025, 0.13, col=shade(col, r.uniform(0.92, 1.04)), roll=90, wob=0.008, b=0.03)
    for x in (-L / 2 + 0.3, L / 2 - 0.3):
        g.box(0.16, 0.18, H - 0.1, (x, 0.14, -0.05), col=RUST[3], b=0.03)       # ribs on the inside
    rivets(g, [(x, -0.068, ph * (i + 0.5) - 0.05) for x in (-L / 2 + 0.3, L / 2 - 0.3) for i in range(rows)], 0.035, "#b9b3a6")
    for x in (-0.5, 0.6):      # rust streaks
        g.paint_poly([(x - 0.06, 0.0), (x + 0.07, 0.0), (x + 0.03, -0.5), (x - 0.02, -0.62)], FRONT(0, -0.066, ph * 3 - 0.07), RUST[2])
    return a


def hull_chunks(a, L=2.5, H=2.4):
    r = a.rng
    out = []
    rows = 5
    ph = H / rows
    for i in range(rows):
        z = ph * (i + 0.5) - 0.04
        cut = r.uniform(-0.5, 0.5)
        col = pick(r, WOOD_PALE + WOOD_GREY)
        for (x0, x1) in ((-L / 2, cut), (cut + 0.02, L / 2)):
            c = a.chunk()
            j = r.uniform(-0.08, 0.08)
            poly = [(x0, -ph / 2 + 0.015), (x1, -ph / 2 + 0.015), (x1 + (0.1 if x1 < L / 2 else 0), j), (x1, ph / 2 - 0.015), (x0, ph / 2 - 0.015), (x0 + (0.1 if x0 > -L / 2 else 0), j)]
            c.emit(p_prism(poly, 0.1, 0.015), col, T(0, 0.05, z, 90, 0, 0) @ T(rz=r.uniform(-1.5, 1.5)), jit=0.06)
            out.append(c)
    return out


def hull_weak(name, seed, debris=False, L=2.5):
    a = Asset(name, G, footprint=0.4, blocksMove=not debris, blocksShot=not debris, tall=not debris, seed=seed, glow=1.0)
    chunks = hull_chunks(a, L)
    if not debris:
        g = a.mesh()
        for c in chunks:
            g.absorb(c)
        for x in (-0.85, 0.85):
            plank(g, (x, -0.075, 0.1), (x + 0.1, -0.075, 2.3), 0.16, 0.05, pal=WOOD_D)
        brk_marks(a, 0.056, 1.2, 1.3, CR_A, both=True)
    else:
        for i, c in enumerate(chunks):
            a.adopt(f"chunk_{i}", c)
        rem = a.part("remains")
        r = a.rng
        for x in (-1.03, 1.03):
            rem.emit(p_prism([(-0.15, 0), (0.15, 0), (0.15, 0.3), (0.02, 0.5), (-0.15, 0.22)], 0.07, 0.008), pick(r, WOOD_GREY), T(x, 0.035, -0.062, 90, 0, 0))
        plank(rem, (-1.1, -0.02, 0.04), (-0.3, -0.75, 0.03), 0.34, 0.07, pal=WOOD_PALE)
    return a


# ------------------------------------------------------------------ rock rubble (the grotto)
def rock_chunks(a, L=2.1):
    r = a.rng
    out = []
    spots = [(-0.7, 0.05, 0.0, 1.05), (0.05, -0.1, 0.0, 1.15), (0.75, 0.1, 0.0, 1.0), (-0.35, 0.05, 0.62, 1.0), (0.42, 0.0, 0.66, 0.98), (0.02, 0.05, 1.2, 0.92), (-0.7, 0.1, 1.05, 0.72), (0.62, 0.0, 0.98, 0.82)]
    for i, (x, y, z, s) in enumerate(spots):
        c = a.chunk()
        if i == 1:      # the slab that carries the mark: a flatter face toward both sides
            c.box(1.0, 0.86, 0.82, (x, y, z - 0.05), (0, 0, 4), col=ROCK[3], b=0.16, jit=0.03, grad=(0.86, 1.05))
        else:
            c.rock(s * 1.05, s * 1.05, s * 0.9, (x, y, z - 0.08), (0, 0, r.uniform(0, 360)), col=pick(r, ROCK), n=13, b=0.08, seed=r.random(), grad=(0.84, 1.06))
        out.append(c)
    return out


def rock_weak(name, seed, debris=False, L=2.1, marks=True):
    a = Asset(name, G, footprint=0.8, blocksMove=not debris, blocksShot=not debris, tall=not debris, seed=seed, glow=1.0)
    chunks = rock_chunks(a, L)
    if not debris:
        g = a.mesh()
        for c in chunks:
            g.absorb(c)
        if marks:
            brk_marks(a, 0.392, 0.42, 0.62, [[(-0.3, 0.3), (-0.34, 0.1), (-0.28, -0.12)], [(0.3, 0.32), (0.36, 0.05)]])
    else:
        for i, c in enumerate(chunks):
            a.adopt(f"chunk_{i}", c)
        rem = a.part("remains")
        rubble(rem, 7, 0, 0, 0.9, 0.2, 0.42, ROCK, seed=seed, z=-0.012)
    return a


def rubble_pile(name, seed, pal=STONE, n=11):
    """loose rubble heap: cover, and the floor dressing next to any broken wall"""
    a = Asset(name, G, footprint=0.8, blocksMove=True, blocksShot=False, seed=seed)
    g, r = a.mesh(), a.rng
    for i in range(3):
        s = r.uniform(0.7, 1.0)
        g.rock(s, s * 0.9, s * 0.65, ((-0.3, 0.3, 0.0)[i], (0.1, -0.1, 0.28)[i], -0.06 - 0.01 * i), (0, 0, r.uniform(0, 360)), col=pick(r, pal), n=12, b=0.07, seed=r.random(), grad=(0.86, 1.05))
    rubble(g, n, 0, 0, 1.0, 0.18, 0.42, pal, seed=seed)
    return a


def build():
    palisade("wall_palisade_a", 41)
    palisade("wall_palisade_b", 42)
    palisade_post("wall_palisade_post", 43)
    palisade_weak("wall_palisade_weak", 44)
    palisade_weak("wall_palisade_debris", 44, debris=True)
    stone_wall("wall_stone_a", 45)
    stone_wall("wall_stone_b", 46, crest=lambda row, i: not (row == 4 and i >= 1) and not (row == 3 and i == 2))
    stone_weak("wall_stone_weak", 47)
    stone_weak("wall_stone_debris", 47, debris=True)
    hull_wall("wall_hull_a", 48)
    hull_weak("wall_hull_weak", 49)
    hull_weak("wall_hull_debris", 49, debris=True)
    rock_weak("wall_rock_a", 53, marks=False)
    rock_weak("wall_rock_weak", 50)
    rock_weak("wall_rock_debris", 50, debris=True)
    rubble_pile("rubble_pile", 51)
    rubble_pile("rubble_pile_rock", 52, ROCK, 9)


REVIEW = dict(cols=6, cell=4.0, dist=36)
