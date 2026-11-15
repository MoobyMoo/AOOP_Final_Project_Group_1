"""The Vault (home base v3): the bank vault under Exile Beach, run by monkeys in suits. Brass, mahogany, banker's
green and cream. One GLB, public/models/build/vault.glb, three families of pieces:

  vault_pod, vault_board          the Banana Express (3x3 cells) and its departures board (2x1)
  vault_floor ... vault_sconce    the room shell, modular on the 1 m build grid
  fac_<id>                        one model per facility in home/facilities.ts (vault_fac.py)

SPACE  Blender x = east, y = north, z = up; the front of every piece faces -y (three.js +z). Facilities, the pod and
       the board have their origin on the floor at the centre of their footprint. Shell pieces that run along a wall
       have their origin on the floor on the FRONT LINE (the edge of the build grid): the room is at y < 0, and
       everything the piece is made of sits at y >= 0, so nothing below 2.4 m ever reaches into a build cell.

NODES  Moving parts are separate nodes named by their part name alone (asset.bare): pod_door (pivot on its hinge),
       pod_needle (pivot on the dial's axle), pod_lamp (material lamp_emit), pod_glass, board_face, press_wheel,
       gen_wheel, gen_lamp, fx_mag / fx_pack / fx_heart, neon, bell, mirror_glass, bp_sheet, sconce_bulb, door_wheel.
       Materials: matte, gloss (polished brass and lacquer), glass, emissive; all colour is in COLOR_0.
"""
from kit import *

G = "vault"

# ---------------------------------------------------------------- palette (sRGB)
BRASS, BRASS_L, BRASS_D = "#cda55c", "#ecd08a", "#96733a"
COPPER = "#b9773f"
MAHOG = ["#74392a", "#7c402d", "#6c3426"]
MAHOG_D, MAHOG_L = "#4c2419", "#935136"
GREENB, GREENB_L, GREENB_D = "#2f5a47", "#41805f", "#1f3e31"      # banker's green
MARBLE = ["#cdbd9c", "#b8a27c"]                                    # the floor's two creams
MARBLE_G = "#356150"                                               # green marble
GROUT = "#7d6a4c"
PLASTER = "#e9dec4"
CONC, CONC_D = "#97928a", "#77726b"
LEATHER, LEATHER_D = "#7d3327", "#5b2219"
FELT = "#2d6a4c"
INK = "#2a2420"
ENAMEL, ENAMEL_D = "#31594a", "#213b32"                            # machine paint
CAST = "#3a4144"                                                   # cast iron
GLASS = "#c4ecff"
READY = "#8dffa0"


def A(name, seed, **kw):
    kw.setdefault("ao_dist", 1.2)
    a = Asset(name, G, seed=seed, **kw)
    a.bare = True
    return a


# Budget rule for this group (it is the only group built in this process): a bevel on a piece thinner than 7.5 cm, or
# on a rod thinner than 6 cm, is under a pixel at the bunker camera and costs 32 triangles a box. Drop it.
_box, _cyl = Geo.box, Geo.cyl


def _lean_box(self, sx, sy, sz, at=(0, 0, 0), rot=(0, 0, 0), col="#888888", b=0.03, taper=None, **kw):
    return _box(self, sx, sy, sz, at, rot, col, 0.0 if (min(sx, sy, sz) < 0.075 and b <= 0.02) else b, taper, **kw)


def _lean_cyl(self, r, h, at=(0, 0, 0), rot=(0, 0, 0), col="#888888", n=12, r2=None, b=0.03, **kw):
    return _cyl(self, r, h, at, rot, col, n, r2, 0.0 if (r < 0.06 and b <= 0.012) else b, **kw)


Geo.box, Geo.cyl = _lean_box, _lean_cyl
# The game's z-fight gate (src/game/dev/glitch.ts, tools/blender/build/coplanar_check.py) counts two same-facing faces
# within 2 mm as one plane. Stacked paint in this group therefore steps 2.6 mm, not the kit's 1.5 mm.
Geo.LIFT_STEP = 0.0026


# ---------------------------------------------------------------- extra primitives
def p_extrude_x(profile, x0, x1):
    """a closed solid: the (y, z) profile (counter-clockwise seen from +x) swept from x0 to x1. Tag 2 on the ends."""
    pts = [tuple(p) for p in profile]
    if sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts))) < 0:
        pts = pts[::-1]
    n = len(pts)
    V = [(x0, y, z) for y, z in pts] + [(x1, y, z) for y, z in pts]
    F = [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
    Gt = [0] * n
    for a, c, d in tessellate_polygon([[Vector((y, z, 0)) for y, z in pts]]):
        pa, pc, pd = Vector(pts[a]), Vector(pts[c]), Vector(pts[d])
        if (pc - pa).cross(pd - pa) < 0:
            c, d = d, c
        F.append([n + a, n + c, n + d]); Gt.append(2)
        F.append([a, d, c]); Gt.append(2)
    return V, F, Gt


def p_tile(sx, sy, b=0.02):
    """a floor tile seen only from above: the top face at z = 0 and four bevels falling to z = -b at its edge"""
    hx, hy = sx / 2, sy / 2
    V = [(-hx + b, -hy + b, 0), (hx - b, -hy + b, 0), (hx - b, hy - b, 0), (-hx + b, hy - b, 0),
         (-hx, -hy, -b), (hx, -hy, -b), (hx, hy, -b), (-hx, hy, -b)]
    F = [[0, 1, 2, 3], [4, 5, 1, 0], [5, 6, 2, 1], [6, 7, 3, 2], [7, 4, 0, 3]]
    return V, F, [0, 1, 1, 1, 1]


def arc_pts(r, a0, a1, n, z=0.0, cx=0.0, cy=0.0):
    return [(cx + r * cos(radians(a0 + (a1 - a0) * k / n)), cy + r * sin(radians(a0 + (a1 - a0) * k / n)), z) for k in range(n + 1)]


def ring(g, r, rr, at, rot=(0, 0, 0), col=BRASS, n=16, m=4, **kw):
    """a torus of radius r, tube radius rr, lying in the local xy plane at `at`"""
    pts = [(r * cos(2 * pi * k / n), r * sin(2 * pi * k / n), 0) for k in range(n)]
    kw.setdefault("jit", 0.02)
    g.emit(p_tube(pts, rr, m, True, True), col, T(*at, *rot), **kw)


def band(g, r, z0, z1, out=0.05, col=BRASS, n=24, at=(0, 0, 0), rot=(0, 0, 0), arc=360.0, rz=0.0, **kw):
    """a raised band round a cylinder of radius r (a lathe about local z, open toward the cylinder it sits on)"""
    kw.setdefault("jit", 0.02)
    zm0, zm1 = z0 + (z1 - z0) * 0.3, z1 - (z1 - z0) * 0.3
    g.emit(p_lathe([(r - 0.004, z0), (r + out, zm0), (r + out, zm1), (r - 0.004, z1)], n, cap0=False, cap1=False, arc=arc), col, T(*at, *rot) @ T(rz=rz), **kw)


def stud(g, at, axis=(0, 0, 1), r=0.03, col=BRASS_L, n=6):
    """a domed rivet / stud on a surface, pointing along axis"""
    ax = Vector(axis).normalized()
    p = Vector(at)
    g.emit(p_sphere(r, n, 2, z0=0.0, z1=1.0), col, along(p - ax * r * 0.15, p + ax), jit=0.02)


def banana_handle(g, at, rot=(0, 0, 0), s=1.0, col=BRASS_L, posts=True):
    """the house handle: a brass banana on two short posts. Local frame: the banana lies along x, bows toward +z (up),
    and stands off the surface along -y."""
    L = 0.3 * s
    pts, rs = [], []
    for i in range(5):
        t = i / 4
        ang = (t - 0.5) * 1.7
        pts.append((sin(ang) * L * 0.62, -0.05 * s, (cos(ang) - 0.85) * L * 0.5))
        rs.append(0.03 * s * (0.45 + 0.55 * sin(pi * (0.1 + 0.8 * t))))
    with g.at(T(*at, *rot)):
        g.emit(p_tube(pts, rs, 5), col, jit=0.02)
        if posts:
            for sx in (-1, 1):
                g.pole((sx * L * 0.3, 0.012, 0.012 * s), (sx * L * 0.3, -0.05 * s, 0.012 * s), 0.014 * s, BRASS_D, n=4, b=0)


def icon_paw(g, M, s=1.0, col=INK, lift=None):
    """the bank's crest: a monkey paw print (a palm pad, four finger pads and a thumb), about s across"""
    g.paint_poly([(x * s, y * s) for x, y in [(-0.2, -0.3), (0.2, -0.3), (0.29, -0.12), (0.22, 0.04), (0.0, 0.1), (-0.22, 0.04), (-0.29, -0.12)]], M, col, lift=lift)
    for (x, y, r) in ((-0.27, 0.25, 0.085), (-0.1, 0.36, 0.09), (0.1, 0.36, 0.09), (0.27, 0.25, 0.085), (-0.42, -0.02, 0.08)):
        g.paint_poly(circle(r * s, 7, cx=x * s, cy=y * s), M, col, lift=lift)


def crest(g, at, rot=(90, 0, 0), r=0.2, col=BRASS, ink=MAHOG_D, n=12, th=0.035):
    """a round brass medallion with the paw on it. Default: facing -y (front)."""
    M = T(*at, *rot)
    g.emit(p_lathe([(r, 0), (r, th * 0.6), (r * 0.86, th), (0.0, th)], n), col, M, jit=0.02)
    icon_paw(g, M @ T(0, 0, th), r * 1.25, ink)


def lamp_banker(g, em, at, rz=0.0, s=1.0):
    """the green banker's lamp: brass foot and stem, a green glass trough shade, a warm strip of light under it"""
    with g.at(T(*at, 0, 0, rz, s)), em.at(T(*at, 0, 0, rz, s)):
        g.cyl(0.11, 0.035, (0, 0, 0), col=BRASS, n=8, b=0.01)
        g.pole((0, 0, 0.03), (0, 0, 0.3), 0.018, BRASS_D, n=5, b=0)
        g.emit(p_extrude_x([(-0.1, 0.27), (0.07, 0.27), (0.1, 0.31), (0.03, 0.385), (-0.06, 0.385), (-0.13, 0.31)], -0.21, 0.21), GREENB_L, jit=0.02, smooth=40)
        em.box(0.34, 0.12, 0.012, (0, -0.015, 0.258), col=BULB, b=0, jit=0)


def books(g, at, n=3, rz=0.0, w=0.3, d=0.22, pal=(GREENB, LEATHER, MAHOG_L, "#3d5a7a")):
    """a small stack of ledgers"""
    z = 0.0
    with g.at(T(*at, 0, 0, rz)):
        for i in range(n):
            h = g.rng.uniform(0.045, 0.07)
            g.box(w * g.rng.uniform(0.86, 1.0), d * g.rng.uniform(0.86, 1.0), h, (g.rng.uniform(-0.015, 0.015), 0, z), (0, 0, g.rng.uniform(-7, 7)), col=pal[i % len(pal)], b=0.01)
            z += h - 0.002
    return z


def coin_stack(g, at, n=4, r=0.045, col=GOLD):
    for i in range(n):
        g.cyl(r, 0.021, (at[0] + (i % 2) * 0.008, at[1] - (i % 3) * 0.006, at[2] + i * 0.019), col=col, n=6, b=0.0, cap=GOLD_L, jit=0.05)


# ---------------------------------------------------------------- the floor (1 m build cells; a module is 2 x 2 m)
def _square(g, x, y, col, sx=1.0, sy=1.0):
    g.emit(p_tile(sx, sy, 0.018), {0: col, 1: GROUT}, T(x, y, 0), jit=0.035, flat=True)


def _vein(g, x, y, col, k=1.0):
    r = g.rng
    a = r.uniform(0, pi)
    pts, px, py = [], x - cos(a) * 0.36 * k, y - sin(a) * 0.36 * k
    for i in range(4):
        pts.append((px, py))
        a += r.uniform(-0.5, 0.5)
        px += cos(a) * 0.24 * k; py += sin(a) * 0.24 * k
    g.paint_line(pts, 0.022, TOP(0, 0, 0), col, taper=(1.0, 0.25), lift=0.004)


def floor_tile(name, seed, w=2, d=2, first=0):
    """checker of two cream marbles, one build cell per square, a green marble cabochon set in brass at the centre of
    every 2 x 2 module. The 2 x 1 half continues the same checker (the floor is an odd number of cells each way)."""
    a = A(name, seed, footprint=1.0, ground=False, ao_self=False)
    g = a.mesh()
    for i in range(w):
        for j in range(d):
            x, y = i - (w - 1) / 2, j - (d - 1) / 2
            c = MARBLE[(i + j + first) % 2]
            _square(g, x, y, c)
            if a.rng.random() < 0.75:
                _vein(g, x, y, shade(c, 0.9))
    if w == 2 and d == 2:
        g.paint_poly([(0.2, 0), (0, 0.2), (-0.2, 0), (0, -0.2)], TOP(0, 0, 0), BRASS_D, lift=0.004)
        g.paint_poly([(0.15, 0), (0, 0.15), (-0.15, 0), (0, -0.15)], TOP(0, 0, 0), MARBLE_G, lift=0.007)
    return a


def floor_border(name, seed, corner=False):
    """the band round the room: green marble with a brass inlay line on the room side (-y; the corner has two)"""
    a = A(name, seed, footprint=0.5, ground=False, ao_self=False)
    g = a.mesh()
    _square(g, 0, 0, MARBLE_G)
    _vein(g, 0.05, 0.1, shade(MARBLE_G, 1.22), 0.8)
    # the corner is the room's north-east one: the line comes in from the west and turns south
    g.paint_line([(-0.5, -0.36), (-0.36, -0.36), (-0.36, -0.5)] if corner else [(-0.5, -0.36), (0.5, -0.36)], 0.05, TOP(0, 0, 0), BRASS, lift=0.005)
    return a


def kerb(name, seed, post=False):
    """the open (camera) sides of the room: the cut edge of the floor slab with a mahogany kerb and a brass stud.
    The post is the 0.3 m newel that closes a corner or the end of a wall."""
    a = A(name, seed, footprint=0.3, ground=False)
    g, b = a.mesh(), a.mesh("gloss")
    if post:
        g.box(0.3, 0.3, 0.74, (0.15, 0.15, -0.5), col=MAHOG_D, b=0.03, grad=(0.8, 1.05))
        b.cyl(0.13, 0.04, (0.15, 0.15, 0.235), col=BRASS_D, n=8, b=0.012)
        b.ball(0.1, (0.15, 0.15, 0.35), col=BRASS_L, n=8, m=5)
        return a
    g.emit(p_extrude_x([(0.0, -0.5), (0.22, -0.5), (0.22, 0.1), (0.19, 0.13), (0.03, 0.13), (0.0, 0.1)], -0.5, 0.5), lambda c, t: MAHOG_D if c.z > -0.03 else "#2a2420", jit=0.03, smooth=30)
    b.emit(p_extrude_x([(0.05, 0.13), (0.17, 0.13), (0.17, 0.144), (0.05, 0.144)], -0.497, 0.497), BRASS_D, jit=0.02)
    stud(b, (0, 0.11, 0.14), r=0.045, col=BRASS_L, n=7)
    return a


# ---------------------------------------------------------------- walls
WALL_H, WALL_T, FACE = 3.5, 1.0, 0.12       # height, depth of the concrete, how far the plaster sits behind the front line
DADO = [(0.02, 0.0), (FACE, 0.0), (FACE, 1.2), (0.01, 1.2), (0.01, 1.14), (0.07, 1.09), (0.07, 0.22), (0.02, 0.17)]


def _dado_col(c, t):
    if t == 2:
        return MAHOG_D
    return MAHOG_D if c.z < 0.2 else MAHOG_L if c.z > 1.08 else MAHOG[0]


def wall_run(a, x0, x1, panel=True, rail=True, dado=True):
    """the wall's section from x0 to x1: concrete with green plaster on the room side, mahogany wainscot, a brass rail"""
    g, b = a.mesh(), a.mesh("gloss")
    L, cx = x1 - x0, (x0 + x1) / 2
    g.emit(p_box(L, WALL_T - FACE, WALL_H, 0.0), lambda c, t: GREENB if c.y < -(WALL_T - FACE) / 2 + 0.01 else CONC, T(cx, (WALL_T + FACE) / 2, 0), jit=0.02, grad=(0.94, 1.03), flat=True)
    if dado:
        g.emit(p_extrude_x(DADO, x0, x1), _dado_col, jit=0.03, smooth=30)
    if rail:
        b.tube([(x0, 0.05, 1.42), (x1, 0.05, 1.42)], 0.026, BRASS, n=6, jit=0.02)
        for k in range(max(1, round(L))):
            x = x0 + (k + 0.5) * L / max(1, round(L))
            b.pole((x, 0.13, 1.42), (x, 0.05, 1.42), 0.016, BRASS_D, n=4, b=0)
            b.cyl(0.035, 0.012, (x, FACE, 1.42), (90, 0, 0), col=BRASS_D, n=6, b=0.004)
    if panel:
        n = max(1, round(L / 1.0))
        for k in range(n):               # raised panels in the wainscot
            x = x0 + (k + 0.5) * L / n
            g.box(L / n - 0.2, 0.05, 0.62, (x, 0.07, 0.34), col=pick(a.rng, MAHOG), b=0.022, jit=0.04)
        M = FRONT(cx, FACE, 2.3)          # a framed field in the plaster
        g.paint_poly([(-L / 2 + 0.2, -0.72), (L / 2 - 0.2, -0.72), (L / 2 - 0.2, 0.72), (-L / 2 + 0.2, 0.72)], M, GREENB_D, lift=0.004)
        g.paint_line([(-L / 2 + 0.2, -0.72), (L / 2 - 0.2, -0.72), (L / 2 - 0.2, 0.72), (-L / 2 + 0.2, 0.72)], 0.035, M, BRASS_D, closed=True, lift=0.007)


def wall(name, seed, L=2.0, plain=False):
    """vault_wall: 2 m wide, 3.5 m tall. vault_wall_corner is the plain 1 m slice that closes the room's far corner:
    it continues the back wall one metre past the build grid, and the side wall butts into it."""
    a = A(name, seed, footprint=1.0, blocksMove=True, tall=True)
    wall_run(a, (0.0 if plain else -L / 2), (L if plain else L / 2), panel=not plain)
    return a


def pilaster(name, seed):
    """a 1 m bay: a cream marble pilaster with four ribs, a green marble plinth and a brass capital. Sconces hang here."""
    a = A(name, seed, footprint=0.5, blocksMove=True, tall=True)
    g, b = a.mesh(), a.mesh("gloss")
    wall_run(a, -0.5, 0.5, panel=False, rail=False, dado=False)
    for sx in (-1, 1):                    # the wainscot and the rail stop against the shaft
        g.emit(p_extrude_x(DADO, sx * 0.5, sx * 0.4), _dado_col, jit=0.03, smooth=30)
        b.tube([(sx * 0.5, 0.05, 1.42), (sx * 0.33, 0.05, 1.42)], 0.026, BRASS, n=6, jit=0.02)
    g.box(0.8, 0.118, 0.42, (0, 0.059, 0.004), col=MARBLE_G, b=0.025, grad=(0.85, 1.05))
    g.box(0.72, 0.035, 0.06, (0, 0.02, 0.42), col=BRASS_D, b=0.012)
    g.box(0.66, 0.11, 2.42, (0, 0.085, 0.44), col=shade(PLASTER, 0.9), b=0.0, jit=0.02, grad=(0.92, 1.03))
    for k in range(4):
        g.box(0.105, 0.05, 2.36, (-0.2325 + k * 0.155, 0.035, 0.47), col=PLASTER, b=0.014, jit=0.02, grad=(0.93, 1.03))
    b.box(0.74, 0.15, 0.24, (0, 0.075, 2.84), col=BRASS, b=0.03, taper=(1.14, 1.0), hl=1.2)
    b.cyl(0.07, 0.03, (0, 0.0, 2.96), (90, 0, 0), col=BRASS_L, n=8, b=0.008)
    g.box(0.9, 0.17, 0.1, (0, 0.07, 3.08), col=PLASTER, b=0.02)
    return a


def trim(name, seed):
    """vault_trim: 1 m of the cornice that runs along the top of the wall (cream cove, dentils, a brass bead)"""
    a = A(name, seed, footprint=0.2, ground=False, wall=FACE)
    g, b = a.mesh(), a.mesh("gloss")
    prof = [(FACE, 3.2), (FACE, 3.5), (-0.1, 3.5), (-0.1, 3.43), (-0.06, 3.4), (-0.03, 3.33), (0.04, 3.28), (0.1, 3.25), (0.1, 3.2)]
    g.emit(p_extrude_x(prof, -0.5, 0.5), PLASTER, jit=0.02, smooth=30)
    for k in range(4):
        g.box(0.13, 0.07, 0.075, (-0.375 + k * 0.25, -0.015, 3.33), col=shade(PLASTER, 0.93), b=0.0, jit=0.02)
    b.tube([(-0.497, 0.085, 3.19), (0.497, 0.085, 3.19)], 0.022, BRASS, n=5, jit=0.02)
    return a


def wall_cap(name, seed):
    """what is above the vault: the concrete roof slab's edge, packed earth, the sand of Exile Beach (1 m, cut away)"""
    a = A(name, seed, footprint=0.5, ground=False)
    g = a.mesh()
    g.emit(p_extrude_x([(0.04, 3.5), (WALL_T, 3.5), (WALL_T, 3.76), (0.04, 3.76)], -0.5, 0.5), CONC_D, jit=0.02, flat=True, grad=(0.95, 1.03))
    g.emit(p_extrude_x([(0.09, 3.76), (WALL_T, 3.76), (WALL_T, 4.3), (0.11, 4.3), (0.07, 4.02)], -0.5, 0.5), lambda c, t: EARTH[0] if c.z > 4.0 else "#5c4735", jit=0.03, smooth=30)
    g.emit(p_extrude_x([(0.05, 4.3), (WALL_T + 0.03, 4.3), (WALL_T + 0.03, 4.46), (0.09, 4.5), (0.05, 4.44)], -0.5, 0.5), "#c2a876", jit=0.02, smooth=30)
    return a


def sconce(name, seed):
    """a brass wall bracket with a tulip glass shade. Origin on the wall, the shade hangs out over the room (-y)."""
    a = A(name, seed, footprint=0.2, ground=False, wall=0.0, glow=2.2)
    b = a.mesh("gloss")
    b.emit(p_lathe([(0.15, 0.0), (0.15, 0.02), (0.11, 0.04), (0.0, 0.045)], 10), BRASS, T(0, 0, 0, 90, 0, 0), jit=0.02)
    crest_pts = [(0, -0.03, -0.02), (0, -0.14, -0.1), (0, -0.25, -0.06), (0, -0.28, 0.06)]
    b.tube(crest_pts, 0.026, BRASS_D, n=5, jit=0.02)
    b.emit(p_lathe([(0.0, 0.0), (0.06, 0.005), (0.12, 0.05), (0.135, 0.11), (0.115, 0.11), (0.05, 0.03)], 10, cap0=False, cap1=False), BRASS, T(0, -0.28, 0.05), jit=0.02)
    bulb = a.part("sconce_bulb", (0, -0.28, 0.2), "emissive")
    bulb.emit(p_lathe([(0.105, 0.1), (0.17, 0.2), (0.165, 0.32), (0.1, 0.4), (0.0, 0.42)], 10, cap0=False), BULB, T(0, -0.28, 0.05), jit=0)
    a.point("light", (0, -0.9, 0.5))
    return a


def vault_door(name, seed):
    """vault_door_round: the big round door, a 4 m bay of the back wall. It stands in a recess, so only the wheel and
    the hinge come forward to the front line. The wheel is its own node (door_wheel, axis y)."""
    a = A(name, seed, footprint=2.0, blocksMove=True, tall=True)
    g, b = a.mesh(), a.mesh("gloss")
    cz, R = 1.98, 1.46
    g.emit(p_box(4.0, 0.5, 4.5, 0.0), lambda c, t: CONC_D if c.y < -0.24 else CONC, T(0, 0.75, 0), jit=0.02, grad=(0.86, 1.02), flat=True)    # the recess's back, y 0.5 .. 1.0
    for sx in (-1, 1):                                                        # jambs
        g.box(0.2, 0.5, 4.14, (sx * 1.9, 0.27, 0), col=CONC, b=0.03, grad=(0.86, 1.03))
    g.box(4.0, 0.5, 0.42, (0, 0.27, 4.08), col=CONC, b=0.04, jit=0.02)        # lintel
    g.box(3.62, 0.44, 0.1, (0, 0.28, 0.0), col=CAST, b=0.02)                 # sill plate
    g.paint_text("VAULT", 0.2, FRONT(0, 0.02, 4.19), BRASS_L, w=0.04)
    for sx in (-1, 1):
        crest(b, (sx * 1.2, 0.02, 4.29), r=0.13, n=10)
    # the frame: a heavy steel collar round the opening
    Y = lambda y: T(0, y, cz, 90, 0, 0)                                        # local z -> -y: a lathe about the door's axis
    g.emit(p_lathe([(1.79, 0.0), (1.79, 0.3), (1.72, 0.36), (R + 0.06, 0.36), (R + 0.02, 0.3), (R + 0.02, 0.0)], 32, cap0=False, cap1=False), "#59666b", Y(0.5), jit=0.02, smooth=40)
    b.emit(p_lathe([(R + 0.09, 0.0), (R + 0.12, 0.035), (R + 0.2, 0.035), (R + 0.23, 0.0)], 24, cap0=False, cap1=False), BRASS, Y(0.142), jit=0.02)
    # the door: a stepped steel disc
    g.emit(p_lathe([(R, 0.0), (R, 0.2), (R - 0.07, 0.26), (1.08, 0.26), (1.02, 0.31), (0.0, 0.31)], 32, cap0=False), lambda c, t: "#6f7d82" if c.x * c.x + c.y * c.y > 1.05 else "#7f8d92", Y(0.47), jit=0.02, smooth=40)
    b.emit(p_lathe([(1.08, 0.0), (1.11, 0.04), (1.2, 0.04), (1.23, 0.0)], 24, cap0=False, cap1=False), BRASS, Y(0.212), jit=0.02)
    for k in range(12):                                                        # bolt heads round the rim
        ang = radians(k * 30 + 15)
        stud(b, (cos(ang) * 1.32, 0.212, cz + sin(ang) * 1.32), (0, -1, 0), r=0.07, col=BRASS_L, n=5)
    for sz in (-1, 1):                                                         # two lock bars with keeps
        g.box(2.0, 0.07, 0.15, (0, 0.14, cz + sz * 0.6 - 0.075), col=CAST, b=0.02)
        for sx in (-1, 1):
            b.box(0.15, 0.1, 0.25, (sx * 0.92, 0.135, cz + sz * 0.6 - 0.125), col=BRASS_D, b=0.025)
    for sz in (-1, 1):                                                         # hinge on the left jamb
        g.box(0.5, 0.2, 0.32, (-1.58, 0.12, cz + sz * 0.8 - 0.16), col=CAST, b=0.04)
        b.pole((-1.74, 0.1, cz + sz * 0.8 - 0.23), (-1.74, 0.1, cz + sz * 0.8 + 0.23), 0.08, BRASS_D, n=8, b=0.02)
    # the wheel: a brass ring on five banana spokes round the crest
    w = a.part("door_wheel", (0, 0.1, cz), "gloss")
    w.emit(p_lathe([(0.19, 0.0), (0.19, 0.12), (0.14, 0.16), (0.0, 0.16)], 12, cap0=False), BRASS_D, Y(0.165), jit=0.02)
    ring(w, 0.56, 0.05, (0, 0.07, cz), (90, 0, 0), BRASS, n=20, m=5)
    for k in range(5):
        with w.at(T(0, 0.07, cz, 0, k * 72, 0)):
            banana(w, (0, 0, 0.36), (0, 90, 0), 0.92, col=BRASS_L, n=5)
    icon_paw(w, Y(0.004), 0.25, MAHOG_D, lift=0.004)
    return a


# ---------------------------------------------------------------- the Banana Express
def pod(name, seed):
    """vault_pod: a brass pneumatic dispatch tube on a marble plinth (3 x 3 cells). The monkey stands on the plate at
    z 0.4. pod_door hinges on the front-left jamb (closed 0, open rotation -1.9 about the vertical); pod_needle turns
    about the dial's axle (the front-back axis); pod_lamp is the ready light, on its own material lamp_emit."""
    a = A(name, seed, footprint=1.5, blocksMove=True, tall=True, glow=2.2, ao_dist=1.6)
    g, b = a.mesh(), a.mesh("gloss")
    # plinth: green marble, two steps, a brass band, the brass standing plate
    g.lathe([(1.37, 0.0), (1.42, 0.04), (1.42, 0.19), (1.38, 0.22), (1.24, 0.22), (1.24, 0.37), (1.2, 0.4)], col=MARBLE_G, n=24, smooth=35, jit=0.02)
    band(b, 1.24, 0.25, 0.34, 0.03, BRASS)
    b.emit(p_lathe([(0.0, 0.0), (0.97, 0.0), (0.97, 0.012), (0.0, 0.012)], 24), BRASS_D, T(0, 0, 0.398), jit=0.02)
    for sx in (-1, 1):                                              # two feet on the plate: stand here
        icon_paw(g, TOP(sx * 0.2, -0.05, 0.41) @ T(rz=-sx * 8), 0.42, MAHOG_D, lift=0.004)
    b.box(0.56, 0.05, 0.13, (0, -1.425, 0.05), col=BRASS, b=0.015)            # maker's plate
    icon_paw(b, FRONT(0, -1.45, 0.115), 0.12, MAHOG_D, lift=0.004)
    # the tube: glass between brass rings, open at the front for the door (the gap is 74 degrees wide)
    gl = a.part("pod_glass", (0, 0, 0.4), "glass")
    gl.emit(p_lathe([(1.0, 0.44), (1.0, 2.76)], 20, cap0=False, cap1=False, arc=286), GLASS, T(rz=-53), jit=0, smooth=80)
    band(b, 1.0, 0.4, 0.56, 0.06, BRASS)
    band(b, 1.0, 1.5, 1.6, 0.045, BRASS, arc=286, rz=-53, n=20)
    band(b, 1.0, 2.64, 2.8, 0.06, BRASS)
    for ang in (0, 60, 120, 180, 232, 308):
        r_ = 0.028 if ang < 200 else 0.04
        b.pole((cos(radians(ang)) * 1.03, sin(radians(ang)) * 1.03, 0.5), (cos(radians(ang)) * 1.03, sin(radians(ang)) * 1.03, 2.7), r_, BRASS_D, n=5, b=0)
    # the head: a brass collar and dome, riveted
    b.emit(p_lathe([(1.06, 2.76), (1.17, 2.82), (1.17, 3.02), (1.08, 3.08), (0.97, 3.12), (0.8, 3.24), (0.6, 3.33), (0.47, 3.36)], 24), lambda c, t: BRASS if c.z < 3.06 else shade(BRASS, 0.93), jit=0.02, smooth=50, grad=(0.94, 1.06))
    for k in range(8):
        ang = radians(k * 45 + 22.5)
        stud(b, (cos(ang) * 1.17, sin(ang) * 1.17, 2.92), (cos(ang), sin(ang), 0), r=0.04, col=BRASS_L)
    # the pipe: up out of the dome, one elbow, back into the ground above the wall
    path = [(0, 0, 3.3), (0, 0, 3.46)] + [(0, 0.55 - 0.55 * cos(radians(t)), 3.46 + 0.55 * sin(radians(t))) for t in (22.5, 45, 67.5, 90)] + [(0, 1.3, 4.01), (0, 1.95, 4.01)]
    b.tube(path, 0.4, COPPER, n=10, jit=0.02, smooth=70)
    band(b, 0.4, 3.36, 3.48, 0.06, BRASS, n=12)
    band(b, 0.4, 0.0, 0.12, 0.06, BRASS, n=12, at=(0, 0.72, 4.01), rot=(-90, 0, 0))
    b.emit(p_lathe([(0.4, 0.0), (0.66, 0.0), (0.66, 0.05), (0.6, 0.09), (0.4, 0.09)], 14, cap0=False, cap1=False), BRASS, T(0, 1.6, 4.01, 90, 0, 0), jit=0.02)     # the flange on the wall
    for k in range(6):
        ang = radians(k * 60)
        stud(b, (cos(ang) * 0.58, 1.515, 4.01 + sin(ang) * 0.58), (0, -1, 0), r=0.035)
    # the name: an enamel marquee on the collar, tipped up to the camera
    S = T(0, -1.2, 2.72, -22, 0, 0)
    with g.at(S), b.at(S):
        g.box(1.74, 0.05, 0.33, (0, 0, 0.005), col=GREENB_D, b=0.0, jit=0)
        for sz in (0.0, 0.305):
            b.box(1.79, 0.07, 0.04, (0, -0.005, sz - 0.003), col=BRASS, b=0.0)
        for sx in (-1, 1):
            b.box(0.035, 0.08, 0.318, (sx * 0.885, -0.005, 0.012), col=BRASS, b=0.0)
            b.pole((sx * 0.6, 0.02, 0.17), (sx * 0.6, 0.3, 0.3), 0.022, BRASS_D, n=4, b=0)
        g.paint_text("BANANA EXPRESS", 0.125, FRONT(0, -0.026, 0.106), BRASS_L, w=0.026)
    # ready lamp over the marquee
    b.cyl(0.095, 0.1, (0, -0.86, 3.12), col=BRASS_D, n=8, b=0.02)
    lamp = a.part("pod_lamp", (0, -0.86, 3.34), "emissive")
    lamp.matname = "lamp_emit"
    lamp.ball(0.14, (0, -0.86, 3.34), col=READY, n=10, m=6, jit=0)
    # the door: a curved leaf of glass in a brass frame, hinged on the left jamb
    hx, hy = cos(radians(233)) * 1.0, sin(radians(233)) * 1.0
    door = a.part("pod_door", (hx, hy, 0.4), "gloss")
    for z in (0.62, 1.55, 2.58):
        door.tube(arc_pts(1.0, 236, 304, 6, z), 0.034, BRASS, n=5, jit=0.02)
    for ang in (236, 304):
        door.pole((cos(radians(ang)), sin(radians(ang)), 0.6), (cos(radians(ang)), sin(radians(ang)), 2.6), 0.034, BRASS, n=5, b=0)
    banana_handle(door, (cos(radians(296)) * 1.02, sin(radians(296)) * 1.02, 1.55), (0, 90, 26), 1.25)
    dg = a.part("pod_door", (hx, hy, 0.4), "glass")
    dg.emit(p_lathe([(1.0, 0.62), (1.0, 2.58)], 6, cap0=False, cap1=False, arc=68), GLASS, T(rz=236), jit=0, smooth=80)
    for z in (1.0, 2.2):                                            # hinge knuckles on the jamb
        b.pole((hx * 1.035, hy * 1.035, z - 0.09), (hx * 1.035, hy * 1.035, z + 0.09), 0.055, BRASS_L, n=6, b=0.012)
    # the pressure gauge on its own stand, front right: a cream dial, a red zone, the needle on its own node
    gx, gy, gz = 1.14, -1.04, 1.52
    g.cyl(0.17, 0.05, (gx, gy + 0.06, 0.004), col=CAST, n=10, b=0.015)
    b.pole((gx, gy + 0.06, 0.04), (gx, gy + 0.06, gz - 0.2), 0.045, BRASS_D, n=7, b=0)
    band(b, 0.045, 0.6, 0.68, 0.025, BRASS, n=7, at=(gx, gy + 0.06, 0))
    b.emit(p_lathe([(0.2, 0.0), (0.285, 0.0), (0.285, 0.1), (0.25, 0.14), (0.225, 0.14), (0.225, 0.1), (0.0, 0.1)], 16, cap0=False), lambda c, t: PAPER if c.x * c.x + c.y * c.y < 0.045 and c.z > 0.09 else BRASS, T(gx, gy + 0.12, gz, 90, 0, 0), jit=0.02, smooth=40)
    D = FRONT(gx, gy + 0.02, gz)
    for k in range(9):                                             # ticks from low (left) over the top to high (right)
        ph = radians(118 - k * 27)
        g.paint_line([(-sin(ph) * 0.15, cos(ph) * 0.15), (-sin(ph) * 0.2, cos(ph) * 0.2)], 0.018, D, INK, lift=0.004)
    g.paint_line([(-sin(radians(t)) * 0.175, cos(radians(t)) * 0.175) for t in (-44, -62, -80, -98)], 0.05, D, RED, lift=0.008)
    needle = a.part("pod_needle", (gx, gy + 0.005, gz))
    needle.emit(p_prism([(-0.02, -0.05), (0.02, -0.05), (0.012, 0.17), (0.0, 0.2), (-0.012, 0.17)], 0.012), RED_D, T(gx, gy + 0.008, gz, 90, 0, 0), jit=0)
    needle.emit(p_lathe([(0.035, 0.0), (0.035, 0.018), (0.0, 0.024)], 8, cap0=False), BRASS_D, T(gx, gy + 0.012, gz, 90, 0, 0), jit=0)
    # the fare box on the gauge stand: bananas in, monkey out
    b.box(0.3, 0.2, 0.3, (gx, gy + 0.06, 0.74), col=BRASS, b=0.03)
    g.paint_line([(-0.08, 0.0), (0.08, 0.0)], 0.03, FRONT(gx, gy - 0.04, 0.95), INK, lift=0.004)
    icon_banana(g, FRONT(gx, gy - 0.04, 0.78), 0.16, MAHOG_D)
    a.point("puff", (0, 0, 0.5))
    a.point("stand", (0, 0, 0.4))
    return a


def board(name, seed):
    """vault_board: the departures board (2 x 1 cells): a split-flap sign in a mahogany case on brass legs, leaning back
    12 degrees so it reads from the camera. board_face is the blank panel the game draws on (1.6 : 1)."""
    a = A(name, seed, footprint=1.0, blocksMove=True, glow=1.0)
    g, b = a.mesh(), a.mesh("gloss")
    for sx in (-1, 1):
        g.box(0.26, 0.74, 0.1, (sx * 0.78, 0.0, 0), col=MARBLE_G, b=0.03)
        b.cyl(0.085, 0.05, (sx * 0.78, 0.06, 0.09), col=BRASS_D, n=8, b=0.012)
        b.pole((sx * 0.78, 0.06, 0.12), (sx * 0.78, 0.12, 1.34), 0.045, BRASS, n=7, b=0)
        b.pole((sx * 0.78, -0.3, 0.1), (sx * 0.78, 0.085, 0.72), 0.026, BRASS_D, n=5, b=0)
    b.pole((-0.78, 0.08, 0.5), (0.78, 0.08, 0.5), 0.028, BRASS_D, n=5, b=0)
    S = T(0, 0.1, 1.22, -12, 0, 0)
    with g.at(S), b.at(S):
        g.box(1.9, 0.22, 1.3, (0, 0, 0), col=MAHOG[0], b=0.03, grad=(0.9, 1.05))
        g.box(1.98, 0.3, 0.09, (0, 0, 1.28), col=MAHOG_D, b=0.025)                       # cap
        for sz in (0.07, 1.165):                                                        # brass bezel
            b.box(1.72, 0.034, 0.045, (0, -0.118, sz), col=BRASS, b=0.0)
        for sx in (-1, 1):
            b.box(0.045, 0.03, 1.05, (sx * 0.8475, -0.118, 0.115), col=BRASS, b=0.0)
        # the station clock on top, and a banana finial each side
        b.emit(p_lathe([(0.24, 0.0), (0.24, 0.1), (0.2, 0.13), (0.0, 0.13)], 14, cap0=True), lambda c, t: PAPER if c.x * c.x + c.y * c.y < 0.036 and c.z > 0.1 else BRASS, T(0, 0.02, 1.58, 90, 0, 0), jit=0.02, smooth=40)
        b.box(0.14, 0.1, 0.1, (0, 0.0, 1.35), col=BRASS_D, b=0.02)
        C = FRONT(0, -0.111, 1.58)
        g.paint_line([(0, 0), (0.0, 0.14)], 0.022, C, INK, lift=0.004)
        g.paint_line([(0, 0), (0.09, 0.05)], 0.028, C, INK, lift=0.006)
        for k in range(12):
            ph = radians(k * 30)
            g.paint_line([(sin(ph) * 0.155, cos(ph) * 0.155), (sin(ph) * 0.185, cos(ph) * 0.185)], 0.014, C, INK, lift=0.004)
        for sx in (-1, 1):
            banana(b, (sx * 0.72, 0, 1.4), (0, 0, 90), 0.7, col=BRASS_L, n=5)
    face = a.part("board_face", tuple(S @ Vector((0, -0.112, 0.64))), "emissive")
    face.emit(p_box(1.62, 1.0125, 0.006, 0.0), "#15171a", S @ T(0, -0.112, 0.64, 90, 0, 0) @ T(0, 0, -0.003), jit=0, flat=True)
    a.point("light", tuple(S @ Vector((0, -0.6, 0.7))))
    return a


def build():
    import vault_fac as F
    pod("vault_pod", 201)
    board("vault_board", 202)
    floor_tile("vault_floor", 203)
    floor_tile("vault_floor_half", 204, 2, 1)
    floor_tile("vault_floor_cell", 216, 1, 1, 1)
    floor_border("vault_floor_border", 205)
    floor_border("vault_floor_corner", 206, True)
    kerb("vault_kerb", 207)
    kerb("vault_kerb_post", 208, True)
    wall("vault_wall", 209)
    wall("vault_wall_corner", 210, 1.0, True)
    pilaster("vault_pilaster", 211)
    trim("vault_trim", 212)
    wall_cap("vault_wall_cap", 213)
    vault_door("vault_door_round", 214)
    sconce("vault_sconce", 215)
    F.build_all()


REVIEW = dict(cols=6, cell=4.4, dist=58, ground="#b9a47c")
