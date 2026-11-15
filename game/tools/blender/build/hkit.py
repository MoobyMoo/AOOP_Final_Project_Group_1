"""House kit core: enterable modular buildings on a 2 u grid (map v3, G1-22).

A House composes floors, wall runs, corner posts, roofs and props into ONE asset whose AO is baked with the whole
building as occluder, and records the gameplay data next to the geometry (colliders, interiors, doors, lights,
breakables) as JSON in the asset's "def" extra. src/game/world/kit_house.ts turns that into a BuildingDef.

Node layout (see lib.py):
  static meshes        floor, wall bottoms up to CUT (1.1 u), door frames, cell bars, furniture: never fade
  upper_<side>         wall parts above CUT, one part per side (n/s/e/w, i = interior partitions): the runtime fades them
  roof                 every roof mesh
  door<N>              one node per door leaf, origin on the hinge (axis: three.js y)
  brk<N>_c<i>          chunks of a cracked wall (origin on the centroid), brk<N>_marks, brk<N>_remains
  light<N>             point anchors for warm interior lamps

Authoring space is Blender's (x east, y north, z up, front = -y). Gameplay data is exported in three.js local space
(x = x, z = -y, yaw = the Blender z angle). A wall run goes from A to B with the OUTSIDE on its right-hand side, so a
perimeter is listed counter-clockwise: S wall west->east, E wall south->north, N wall east->west, W wall north->south.
"""
from kit import *
import json

H, CUT = 3.0, 1.1          # wall height, height where the fading upper part starts
FLOOR = 0.08               # floor top
MOD = 2.0                  # module length
DOOR_W, DOOR_H = 1.6, 2.3
WIN_W, WIN_Z1 = 1.1, 2.25

YELLOW, YELLOW_D = "#f0bd2e", "#c28d24"            # banana yellow: door hardware and hazard marks only (things you use)
# G1 council: yellow on screen has to mean loot or interact, so building trim (cap rails, door frames, bands, barge
# boards) is a muted ochre on timber and tin, and a deep teal on the whitewashed stone.
OCHRE, OCHRE_D = "#b98d4a", "#8f6a35"
WHITE = ["#f0e6c9", "#e9dfc0", "#f4ecd2"]          # whitewash (warm, so it stays cream under the cool fill)
WHITE_IN = ["#e6dcc0", "#ddd3b6"]
DADO = ["#7fa39a", "#769a91", "#88aaa1"]           # painted institutional dado inside the cellblock
TEAL, TEAL_D, TEAL_L = "#4f9a94", "#3b7a76", "#74b5ad"
BARN_RED = ["#cc664b", "#be5b43", "#d67357", "#b1543e"]
TIN = ["#9aa4a8", "#8e999d", "#a6afb2", "#868f93"]
RUSTY = ["#a8704e", "#96634a", "#b07c5a"]             # sun-bleached rust for roof sheets
TIN_PAINT = ["#79b3aa", "#6fa8a0", "#84beb5"]
THATCH = ["#ad9454", "#a18848", "#b89f60", "#957d44"]
THATCH_D, THATCH_L = "#6f5626", "#d2b869"
PLANK_EXT = ["#c9ad82", "#bfa277", "#d2b88e", "#b4976c", "#c4a577"]
PLANK_INT = ["#dcc296", "#d3b88a", "#e2caa0"]
BOAT_EXT = ["#b9aa92", "#ae9f88", "#c4b59d", "#a2947e"]
FLOOR_WOOD = ["#b78f5e", "#ab8354", "#c19a69", "#a37b4e"]
FLOOR_STONE = ["#b9ab94", "#ad9f88", "#c3b59e", "#a39580"]
FLOOR_DIRT = ["#9a7a55", "#8f704d", "#a5855f"]
SEAM = "#3f2c1e"
STRAW = ["#d9bd5c", "#cdae4e", "#e2c96c"]

# wall styles. ext/int = board or paint palettes for the outside / inside faces
STY = {
    "plank": dict(kind="plank", th=0.26, core=SEAM, ext=PLANK_EXT, int=PLANK_INT, trim=OCHRE, post="#7a5636", vertical=False),
    "barn": dict(kind="plank", th=0.26, core="#3a261c", ext=BARN_RED, int=WOOD + WOOD_GREY[:1], trim=CREAM, post="#6e4b2e", vertical=True),
    "boat": dict(kind="plank", th=0.24, core=SEAM, ext=BOAT_EXT, int=BOAT_EXT + WOOD_PALE[:1], trim=TEAL, post="#6e5a48", vertical=True),
    "stone": dict(kind="stone", th=0.34, core=WHITE[0], ext=WHITE, int=WHITE_IN, trim=TEAL_D, post=WHITE[2]),
    "tin": dict(kind="tin", th=0.2, core="#5c6a6c", ext=TIN_PAINT, int=TIN, trim=OCHRE, post="#6e4b2e"),
}


def capcol(c, h, k=0.62):
    """colour for an unbevelled box of height h: the up-facing face darker (it is the only face in full sun)"""
    top = shade(c, k)
    return lambda cen, tg: top if cen.z > h - 1e-4 else C(c)


def side_of(n):
    return "s" if n.y < -0.5 else "n" if n.y > 0.5 else "e" if n.x > 0.5 else "w"


def frame(o, ex, ez):
    """right-handed frame with origin o, local x = ex, local z = ez, local y = ez x ex"""
    ex, ez = Vector(ex).normalized(), Vector(ez).normalized()
    ey = ez.cross(ex).normalized()
    m = Matrix.Identity(4)
    for i, v in enumerate((ex, ey, ez)):
        m[0][i], m[1][i], m[2][i] = v.x, v.y, v.z
    m[0][3], m[1][3], m[2][3] = o[0], o[1], o[2]
    return m


def boards(g, M, x0, x1, z0, z1, pal, pw=0.27, vertical=False, gap=0.03, seg=(1.2, 2.5), flip=False):
    """cover a rectangle of a face with board decals; the dark core shows through the gaps as seams.
    M is the decal plane (local x along the wall, y up); flip mirrors x (BACK faces)."""
    r = g.rng
    if flip:
        x0, x1 = -x1, -x0
    if x1 - x0 < 0.06 or z1 - z0 < 0.06:
        return
    if vertical:
        n = max(1, round((x1 - x0) / pw))
        w = (x1 - x0) / n
        for i in range(n):
            a, b = x0 + i * w + gap / 2, x0 + (i + 1) * w - gap / 2
            g.paint_poly([(a, z0 + 0.012), (b, z0 + 0.012), (b, z1 - 0.012), (a, z1 - 0.012)], M, shade(pick(r, pal), r.uniform(0.92, 1.06)))
        return
    z = math.floor(z0 / pw + 1e-6) * pw          # rows sit on one lattice so neighbouring boxes line up
    while z < z1 - 1e-6:
        a, b = max(z, z0) + gap / 2, min(z + pw, z1) - gap / 2
        if b - a > 0.05:
            x = x0
            while x < x1 - 1e-6:
                e = min(x1, x + r.uniform(*seg))
                if x1 - e < 0.6:
                    e = x1
                g.paint_poly([(x + gap / 2, a), (e - gap / 2, a), (e - gap / 2, b), (x + gap / 2, b)], M, shade(pick(r, pal), r.uniform(0.92, 1.06)))
                x = e
        z += pw


def blob(r, cx, cy, rad, n=6, sq=1.0):
    return [(cx + cos(2 * pi * k / n) * rad * r.uniform(0.6, 1.0), cy + sin(2 * pi * k / n) * rad * sq * r.uniform(0.6, 1.0)) for k in range(n)]


def chips(g, M, x0, x1, z0, z1, n, pal, rad=(0.1, 0.24), flip=False, lift=None):
    """irregular patches (whitewash flaked off the stone, rust on tin): one per slot along the wall, so none overlap"""
    r = g.rng
    if flip:
        x0, x1 = -x1, -x0
    if n < 1 or z1 - z0 < 0.2:
        return
    slot = (x1 - x0) / n
    for i in range(n):
        rd = min(r.uniform(*rad), slot / 2 - 0.02, (z1 - z0) / 1.5)
        if rd < 0.06:
            continue
        cx = x0 + slot * (i + 0.5) + r.uniform(-1, 1) * (slot / 2 - rd - 0.01)
        g.paint_poly(blob(r, cx, r.uniform(z0 + rd * 0.7, z1 - rd * 0.7), rd, 6, 0.7), M, pick(r, pal), lift=lift)


class House:
    def __init__(self, name, group, seed, single=False, footprint=3.0, **kw):
        kw.setdefault("ao_dist", 1.5)
        kw.setdefault("ao_min", 0.5)
        self.a = Asset(name, group, footprint=footprint, blocksMove=True, blocksShot=True, tall=True, seed=seed, glow=1.6, **kw)
        self.name, self.r, self.single = name, self.a.rng, single
        self.a.contact_z = FLOOR
        self.lo, self.em = self.a.mesh(), self.a.mesh("emissive")
        self.cols, self.doors, self.lights, self.rooms, self.brks, self.posts = [], [], [], [], [], set()
        self.box = [1e9, 1e9, -1e9, -1e9]
        self.stat = {}
        self.lean = False            # big prefabs: drop bevels that do not read at the game camera

    # ---------------------------------------------------------------- geos
    def up(self, side="s", mat="matte"):
        n = "upper" if self.single else f"upper_{side}"
        g = self.a.part(n)
        return g if mat == "matte" else self.a.part(n, mat=mat)

    def rf(self, mat="matte"):
        g = self.a.part("roof")
        return g if mat == "matte" else self.a.part("roof", mat=mat)

    # ---------------------------------------------------------------- gameplay data (authoring space in, three.js out)
    def _grow(self, x, y):
        b = self.box
        b[0], b[1], b[2], b[3] = min(b[0], x), min(b[1], y), max(b[2], x), max(b[3], y)

    def c_seg(self, a, b, thick=0.3, move=True, shot=True, low=False, id=None):
        c = dict(t="seg", ax=round(a[0], 3), az=round(-a[1], 3), bx=round(b[0], 3), bz=round(-b[1], 3), thick=thick, move=move, shot=shot)
        if low: c["low"] = True
        if id: c["id"] = id
        self.cols.append(c)

    def c_box(self, x, y, w, d, yaw=0.0, move=True, shot=False, low=True, id=None):
        c = dict(t="box", x=round(x, 3), z=round(-y, 3), w=round(w, 3), d=round(d, 3), move=move, shot=shot)
        if abs(yaw) > 1e-4: c["yaw"] = round(radians(yaw), 4)
        if low: c["low"] = True
        if id: c["id"] = id
        self.cols.append(c)

    def c_circle(self, x, y, rad, move=True, shot=False, low=True):
        c = dict(t="circle", x=round(x, 3), z=round(-y, 3), r=round(rad, 3), move=move, shot=shot)
        if low: c["low"] = True
        self.cols.append(c)

    def room(self, x0, y0, x1, y1, h=H):
        self.rooms.append(dict(x=(x0 + x1) / 2, z=-(y0 + y1) / 2, w=abs(x1 - x0), d=abs(y1 - y0), h=h))

    def light(self, pos):
        n = f"light{len(self.lights)}"
        self.a.point(n, pos)
        self.lights.append(n)
        return n

    def put(self, fn, x, y, rz=0.0, z=None, **kw):
        """place a prop (hprops.py) on the floor; its colliders come back in prop space"""
        z = FLOOR if z is None else z
        m = T(x, y, z, 0, 0, rz)
        t0 = self.lo.tris + self.em.tris
        with self.lo.at(m), self.em.at(m):
            out = fn(self, self.lo, self.em, **kw) or []
        self.stat[fn.__name__] = self.stat.get(fn.__name__, 0) + self.lo.tris + self.em.tris - t0
        for c in out:
            p = m @ Vector((c[1], c[2], 0))
            if c[0] == "box":
                self.c_box(p.x, p.y, c[3], c[4], rz, **c[5])
            elif c[0] == "circle":
                self.c_circle(p.x, p.y, c[3], **c[4])
            elif c[0] == "light":
                self.light(m @ Vector((c[1], c[2], c[3])))

    def finish(self, **extra):
        b = self.box
        d = dict(colliders=self.cols, interiors=self.rooms, doors=self.doors, lights=self.lights, breakables=self.brks,
                 size=dict(x=round((b[0] + b[2]) / 2, 3), z=round(-(b[1] + b[3]) / 2, 3), w=round(b[2] - b[0], 3), d=round(b[3] - b[1], 3)) if b[0] < 1e8 else None, **extra)
        self.a.meta["def"] = json.dumps(d, separators=(",", ":"))
        if os.environ.get("HOUSE_STAT") == "1":
            parts = {k: g.tris for k, g in self.a.parts.items() if g.tris}
            props = sum(self.stat.values())
            print(f"[stat] {self.name}: {self.a.tris} tris | static {self.lo.tris + self.em.tris} (props {props}, shell {self.lo.tris + self.em.tris - props}) | "
                  f"roof {sum(v for k, v in parts.items() if k.startswith('roof'))} | upper {sum(v for k, v in parts.items() if k.startswith('upper'))} | "
                  f"doors {sum(v for k, v in parts.items() if k.startswith('door'))} | brk {sum(v for k, v in parts.items() if k.startswith('brk'))}")
            print("        props: " + ", ".join(f"{k} {v}" for k, v in sorted(self.stat.items(), key=lambda t: -t[1])))
        return self.a

    # ---------------------------------------------------------------- floors
    def floor(self, x0, y0, x1, y1, kind="plank", along="x", z=FLOOR, skirt=0.0, depth=0.3):
        """one slab with board / flagstone / dirt decals on top. skirt widens it into a visible foundation."""
        g, r = self.lo, self.r
        self._grow(x0, y0); self._grow(x1, y1)
        core = {"plank": SEAM, "stone": "#6f6557", "dirt": FLOOR_DIRT[1]}[kind]
        g.box(x1 - x0 + 2 * skirt, y1 - y0 + 2 * skirt, depth + z, ((x0 + x1) / 2, (y0 + y1) / 2, -depth), col=core, b=0.04, jit=0.0)
        M = TOP(0, 0, z)
        if kind == "plank":
            if along == "x":
                boards(g, M, x0 + 0.02, x1 - 0.02, y0 + 0.02, y1 - 0.02, FLOOR_WOOD, pw=0.36, seg=(1.4, 3.2), gap=0.035)
            else:
                Mr = TOP(0, 0, z) @ T(rz=90)        # local x -> world y, local y -> world -x
                boards(g, Mr, y0 + 0.02, y1 - 0.02, -x1 + 0.02, -x0 - 0.02, FLOOR_WOOD, pw=0.36, seg=(1.4, 3.2), gap=0.035)
        elif kind == "stone":
            rows = max(1, round((y1 - y0) / 1.0))
            fh = (y1 - y0) / rows
            for j in range(rows):
                x = x0
                while x < x1 - 1e-6:
                    e = min(x1, x + r.uniform(0.95, 1.7))
                    if x1 - e < 0.45:
                        e = x1
                    g.paint_poly([(x + 0.025, y0 + j * fh + 0.025), (e - 0.025, y0 + j * fh + 0.025), (e - 0.025, y0 + (j + 1) * fh - 0.025), (x + 0.025, y0 + (j + 1) * fh - 0.025)], M, shade(pick(r, FLOOR_STONE), r.uniform(0.94, 1.05)))
                    x = e
        else:
            nx, ny = max(1, int((x1 - x0) / 2.4)), max(1, int((y1 - y0) / 2.4))       # trodden patches, one per cell
            cw, ch = (x1 - x0) / nx, (y1 - y0) / ny
            for i in range(nx):
                for j in range(ny):
                    if r.random() < 0.3:
                        continue
                    rd = r.uniform(0.5, min(cw, ch) / 2 - 0.12)
                    g.paint_poly(blob(r, x0 + cw * (i + 0.5) + r.uniform(-1, 1) * (cw / 2 - rd - 0.05), y0 + ch * (j + 0.5) + r.uniform(-1, 1) * (ch / 2 - rd - 0.05), rd, 7), M, shade(pick(r, FLOOR_DIRT), r.uniform(0.9, 1.1)))
            nx, ny = max(1, int((x1 - x0) / 0.8)), max(1, int((y1 - y0) / 0.8))       # loose straw, one per cell
            cw, ch = (x1 - x0) / nx, (y1 - y0) / ny
            for i in range(nx):
                for j in range(ny):
                    if r.random() < 0.45:
                        continue
                    x, y, a = x0 + cw * (i + 0.5), y0 + ch * (j + 0.5), r.uniform(0, pi)
                    l = r.uniform(0.12, min(cw, ch) / 2 - 0.08)
                    g.paint_line([(x - cos(a) * l, y - sin(a) * l), (x + cos(a) * l, y + sin(a) * l)], 0.04, M, pick(r, STRAW), lift=0.018)

    def rug(self, x, y, w, d, col, edge, rz=0.0, stripes=3, z=FLOOR):
        g = self.lo
        M = TOP(x, y, z) @ T(rz=rz)
        g.paint_poly([(-w / 2, -d / 2), (w / 2, -d / 2), (w / 2, d / 2), (-w / 2, d / 2)], M, edge, lift=0.016)
        g.paint_poly([(-w / 2 + 0.09, -d / 2 + 0.09), (w / 2 - 0.09, -d / 2 + 0.09), (w / 2 - 0.09, d / 2 - 0.09), (-w / 2 + 0.09, d / 2 - 0.09)], M, col, lift=0.019)
        for i in range(stripes):
            u = -w / 2 + w * (i + 1) / (stripes + 1)
            g.paint_line([(u, -d / 2 + 0.16), (u, d / 2 - 0.16)], 0.07, M, edge, lift=0.022)

    # ---------------------------------------------------------------- walls
    def post(self, x, y, style, side="s", w=None):
        key = (round(x, 2), round(y, 2))
        if key in self.posts:
            return
        self.posts.add(key)
        S = STY[style]
        w = w or S["th"] + 0.14
        if S["kind"] == "stone":      # quoin: a stone foot, whitewashed above, a little proud of the wall
            stone_block(self.lo, w + 0.08, w + 0.08, 0.51, (x, y, -0.07), col=pick(self.r, STONE), b=0.05, chip=0.4)
            self.lo.box(w, w, CUT - 0.42, (x, y, 0.44), col=pick(self.r, WHITE), b=0.04, jit=0.02)
            self.up(side).box(w, w, H - CUT + 0.01, (x, y, CUT + 0.03), col=pick(self.r, WHITE), b=0.04, jit=0.02)
        else:
            self.lo.box(w, w, CUT + 0.09, (x, y, -0.07), col=S["post"], b=0.04, grad=(0.85, 1.05))
            self.up(side).box(w, w, H - CUT + 0.03, (x, y, CUT + 0.03), col=S["post"], b=0.04)

    def _lower(self, M, a, b, S, inner):
        g, th, L, cx = self.lo, S["th"], b - a, (a + b) / 2
        Fm, Bm = FRONT(0, -th / 2, 0), BACK(0, th / 2, 0)
        with g.at(M):
            if S["kind"] == "plank":
                g.box(L - 0.012, th, CUT - 0.05 + 0.05, (cx, 0, -0.05), col=S["core"], b=0, jit=0.0)
                ext = S["int"] if inner else S["ext"]
                boards(g, Fm, a + 0.02, b - 0.02, FLOOR - 0.06, CUT - 0.1, [shade(c, 0.95) for c in ext], vertical=S["vertical"])
                boards(g, Bm, a + 0.02, b - 0.02, FLOOR, CUT - 0.1, S["int"], pw=0.34, seg=(1.8, 3.6), vertical=S["vertical"], flip=True)
                hc = 0.1 if not inner else 0.078
                g.box(L, th + 0.1, hc, (cx, 0, CUT - 0.1 if not inner else CUT - 0.09), col=capcol(S["trim"] if not inner else WOOD[2], hc), b=0, jit=0.02)
            elif S["kind"] == "stone":
                g.box(L - 0.012, th, CUT - 0.05 + 0.05, (cx, 0, -0.05), col=pick(self.r, WHITE if not inner else WHITE_IN), b=0, grad=(0.86, 1.02), jit=0.02)
                g.box(L - 0.006, th + 0.1, 0.46 if not inner else 0.44, (cx, 0, -0.06 if not inner else -0.055), col=pick(self.r, STONE), b=0.05 if not (inner or self.lean) else 0, grad=(0.86, 1.04))       # exposed stone plinth
                n = max(1, round(L / 0.9))
                for face, sgn in ((Fm, 1), (Bm, -1)):
                    yy = -(th / 2 + 0.05) if sgn > 0 else th / 2 + 0.05
                    Pm = FRONT(0, yy, 0) if sgn > 0 else BACK(0, yy, 0)
                    for i in range(1, n):
                        u = (a + L * i / n + self.r.uniform(-0.1, 0.1)) * sgn
                        g.paint_line([(u, 0.02), (u + self.r.uniform(-0.03, 0.03), 0.38)], 0.035, Pm, STONE_D, lift=0.006)
                    g.paint_line([(a * sgn + 0.05 * sgn, 0.2), (b * sgn - 0.05 * sgn, 0.2)], 0.03, Pm, STONE_D, lift=0.009)      # the bed joint 3 mm above the upright joints it crosses; both stay behind a door jamb's face (15 mm)
                if not inner:
                    g.paint_poly([(a + 0.02, 0.74), (b - 0.02, 0.74), (b - 0.02, 0.96), (a + 0.02, 0.96)], Fm, S["trim"])          # the painted band
                    chips(g, Fm, a, b, 0.42, 0.74, max(1, int(L / 1.3)), STONE[:3])
                    g.paint_poly([(-b + 0.02, 0.42), (-a - 0.02, 0.42), (-a - 0.02, 0.98), (-b + 0.02, 0.98)], Bm, pick(self.r, DADO))
                else:
                    for face, f in ((Fm, 1), (Bm, -1)):
                        u0, u1 = (a, b) if f > 0 else (-b, -a)
                        g.paint_poly([(u0 + 0.02, 0.42), (u1 - 0.02, 0.42), (u1 - 0.02, 0.98), (u0 + 0.02, 0.98)], face, pick(self.r, DADO))
                hc = 0.1 if not inner else 0.078
                g.box(L, th + 0.08, hc, (cx, 0, CUT - 0.1 if not inner else CUT - 0.09), col=capcol(STONE[3], hc, 0.74), b=0, jit=0.03)
            else:   # tin sheets on a timber frame
                g.box(L - 0.012, th, CUT - 0.05 + 0.05, (cx, 0, -0.05), col=S["core"], b=0, jit=0.0)
                boards(g, Fm, a + 0.02, b - 0.02, FLOOR + 0.05, CUT - 0.1, S["ext"], pw=0.25, vertical=True, gap=0.045)
                chips(g, Fm, a, b, FLOOR + 0.06, 0.6, max(1, int(L / 0.8)), RUST, rad=(0.1, 0.22), lift=0.016)
                boards(g, Bm, a + 0.02, b - 0.02, FLOOR, CUT - 0.1, S["int"], pw=0.5, vertical=True, flip=True)
                g.box(L - 0.006, th + 0.1, 0.16, (cx, 0, -0.04), col=S["post"], b=0)
                g.box(L, th + 0.1, 0.1, (cx, 0, CUT - 0.1), col=capcol(S["trim"], 0.1), b=0)

    def _upper(self, M, a, b, z0, z1, S, inner, side, band=True):
        g, th, L, cx = self.up(side), S["th"], b - a, (a + b) / 2
        if L < 0.03 or z1 - z0 < 0.03:
            return
        Fm, Bm = FRONT(0, -th / 2, 0), BACK(0, th / 2, 0)
        with g.at(M):
            if S["kind"] == "plank":
                g.box(L, th, z1 - z0, (cx, 0, z0), col=S["core"], b=0, jit=0.0)
                boards(g, Fm, a + 0.02, b - 0.02, z0 + 0.01, z1 - 0.01, S["int"] if inner else S["ext"], vertical=S["vertical"])
                boards(g, Bm, a + 0.02, b - 0.02, z0 + 0.01, z1 - 0.01, S["int"], pw=0.34, seg=(1.8, 3.6), vertical=S["vertical"], flip=True)
            elif S["kind"] == "stone":
                g.box(L, th, z1 - z0, (cx, 0, z0), col=pick(self.r, WHITE if not inner else WHITE_IN), b=0, jit=0.02)
                if not inner:
                    if band and z1 > H - 0.3:
                        g.paint_poly([(a + 0.02, H - 0.3), (b - 0.02, H - 0.3), (b - 0.02, H - 0.12), (a + 0.02, H - 0.12)], Fm, S["trim"])
                    chips(g, Fm, a, b, z0, min(z1, H - 0.32), int(L * (z1 - z0) / 2.6 + 0.5), STONE[:3])
            else:
                g.box(L, th, z1 - z0, (cx, 0, z0), col=S["core"], b=0, jit=0.0)
                boards(g, Fm, a + 0.02, b - 0.02, z0 + 0.01, z1 - 0.01, S["ext"], pw=0.25, vertical=True, gap=0.045)
                chips(g, Fm, a, b, max(z0, z1 - 0.6), z1, int(L / 1.1), RUST, rad=(0.08, 0.2), lift=0.016)
                boards(g, Bm, a + 0.02, b - 0.02, z0 + 0.01, z1 - 0.01, S["int"], pw=0.5, vertical=True, flip=True)

    def run(self, A, B, mods, style, side=None, inner=False, doors=None, posts=True, band=True, trim=True):
        """a wall from A to B (outside on the right). mods: one letter per 2 u module:
           p plain · w window · v small high cell window · d door · D double door (4 u) · o open bay (posts + lintel)
           b cell bars · g barred cell door · c cracked breakable section.
           doors: {module index: dict(hinge="l"|"r", swing="out"|"in", kind=..., breakable=bool, locked="key id")}"""
        A, B = Vector((A[0], A[1], 0)), Vector((B[0], B[1], 0))
        dv = B - A
        L, ang = dv.length, degrees(atan2(dv.y, dv.x))
        out = Vector((dv.y, -dv.x, 0)).normalized()
        side = "i" if inner else (side or side_of(out))
        S, M = STY[style], T(A.x, A.y, 0, rz=ang)
        th = S["th"]
        self._grow(A.x, A.y); self._grow(B.x, B.y)
        W = lambda x, y=0.0: (M @ Vector((x, y, 0)))
        toks, x = [], 0.0
        for ch in mods:
            w = 2 * MOD if ch == "D" else MOD
            toks.append((ch, x, x + w)); x += w
        assert abs(x - L) < 1e-4, f"{self.name}: run {mods} is {x} u, wall is {L} u"
        ops = []            # (x0, x1, zbot, ztop, kind, index)
        for i, (k, x0, x1) in enumerate(toks):
            c = (x0 + x1) / 2
            if k == "w": ops.append((c - WIN_W / 2, c + WIN_W / 2, CUT, WIN_Z1, k, i))
            elif k == "v": ops.append((c - 0.42, c + 0.42, 1.9, 2.5, k, i))
            elif k == "d": ops.append((c - DOOR_W / 2, c + DOOR_W / 2, 0, DOOR_H, k, i))
            elif k == "D": ops.append((c - DOOR_W, c + DOOR_W, 0, 2.6, k, i))
            elif k in "obg": ops.append((x0, x1, 0, 2.6, k, i))
            elif k == "c": ops.append((x0, x1, 0, H, k, i))

        def solid(pred):
            cuts, x = [], 0.0
            for o in sorted(ops):
                if not pred(o):
                    continue
                if o[0] - x > 1e-4:
                    cuts.append((x, o[0]))
                x = max(x, o[1])
            if L - x > 1e-4:
                cuts.append((x, L))
            return cuts

        # the corner square belongs to the post (outer walls stop short of it) or to the wall a partition butts into
        e = (th / 2 if inner else th / 2 + 0.055) if trim else 0.0
        e0, e1 = (e if t is None else t for t in (trim if isinstance(trim, (tuple, list)) else (None, None)))
        clip = lambda a, b: (max(a, e0), min(b, L - e1))
        zu = CUT - (0.012 if inner else 0.0)
        for a, b in solid(lambda o: o[2] < CUT - 1e-6):
            a2, b2 = clip(a, b)
            if b2 - a2 > 0.04:
                self._lower(M, a2, b2, S, inner)
        piers = solid(lambda o: True)
        zt_ = H - 0.004 if isinstance(trim, (tuple, list)) else H     # a partition that runs into another wall ends under that wall's top
        for a, b in piers:
            a2, b2 = clip(a, b)
            if b2 - a2 > 0.04:
                self._upper(M, a2, b2, zu, zt_, S, inner, side, band)
            self.c_seg(W(a), W(b), max(th, 0.3))
        for x0, x1, zb, zt, k, i in ops:
            if zt < H - 1e-6:
                self._upper(M, *clip(x0, x1), zt, H, S, inner, side, band)
            if zb > CUT + 1e-6:
                self._upper(M, *clip(x0, x1), zu, zb, S, inner, side, False)
            o = (doors or {}).get(i, {})
            if k == "w":
                self._window(M, x0, x1, zb, zt, S, side, inner)
                self.c_seg(W(x0), W(x1), max(th, 0.3), shot=False, low=True)      # shoot through the opening, not walk
            elif k == "v":
                self._window(M, x0, x1, zb, zt, S, side, inner, small=True)
                self.c_seg(W(x0), W(x1), max(th, 0.3))
            elif k == "d":
                self._door(M, x0, x1, S, side, o)
            elif k == "D":
                self._door(M, x0, x1, S, side, o, double=True)
            elif k == "o":
                self._bay(M, x0, x1, S, toks, i)
            elif k == "b":
                self._bars(M, x0, x1)
                self.c_seg(W(x0), W(x1), 0.2, shot=False)                          # bars: no walking, bullets and sight pass
            elif k == "g":
                self._bars(M, x0, x1, door=o)
            elif k == "c":
                self._cracked(M, x0, x1, S)
        if posts:
            for p in (A, B):
                self.post(p.x, p.y, style, side)

    def _window(self, M, x0, x1, zb, zt, S, side, inner, small=False):
        g, th, c, w = self.up(side), S["th"], (x0 + x1) / 2, x1 - x0
        tr = S["trim"]
        yb = -th / 2 - 0.02
        with g.at(M):
            if not inner:
                for x in (x0 - 0.05, x1 + 0.05):                                    # frame
                    g.box(0.11, 0.09, zt - zb + 0.02, (x, yb, zb - 0.01), col=tr, b=0, jit=0.03)
                g.box(w + 0.3, 0.1, 0.12, (c, yb, zt - 0.01), col=tr, b=0, jit=0.03)
            if S["kind"] == "stone" or small:                                       # bars
                n = 2 if small else 4
                for i in range(n):
                    g.box(0.06, 0.06, zt - zb + 0.04, (x0 + w * (i + 0.5) / n, 0, zb - 0.02), (0, 0, 45), col=IRON, b=0)
                if not small:
                    g.box(w + 0.04, 0.05, 0.05, (c, 0, (zb + zt) / 2 - 0.025), col=IRON, b=0)
            else:                                                                    # mullions
                g.box(0.06, 0.06, zt - zb + 0.02, (c, 0, zb - 0.01), col=shade(tr, 0.9), b=0)
                g.box(w + 0.02, 0.05, 0.06, (c, 0, (zb + zt) / 2 - 0.03), col=shade(tr, 0.9), b=0)
            if small:
                g.box(w + 0.24, th + 0.12, 0.08, (c, 0, zb - 0.07), col=STONE[3], b=0)
            elif not inner and S["kind"] != "stone":                                 # shutters, folded back on the wall
                sw, sh = w / 2 - 0.02, zt - zb - 0.04
                for sgn in (-1, 1):
                    x = c + sgn * (w / 2 + 0.1 + sw / 2)
                    askew = self.r.uniform(-7, 7) if self.r.random() < 0.35 else 0
                    with g.at(T(x, -th / 2 - 0.045, zb + 0.02 + sh / 2, 0, askew, 0)):
                        g.box(sw, 0.055, sh, (0, 0, -sh / 2), col=shade(tr, self.r.uniform(0.86, 1.0)), b=0)
                        for k in range(4):
                            z = -sh / 2 + sh * (k + 0.5) / 4
                            g.paint_line([(-sw / 2 + 0.05, z), (sw / 2 - 0.05, z)], 0.045, FRONT(0, -0.0275, 0), shade(tr, 0.62))
        if not small:                                                                # the sill stays when the wall fades
            with self.lo.at(M):
                self.lo.box(w + 0.34, th + 0.22, 0.08, (c, 0, CUT - 0.025), col=capcol(tr if S["kind"] != "stone" else STONE[3], 0.08, 0.7), b=0, jit=0.02)

    def _door(self, M, x0, x1, S, side, o, double=False):
        g, th, c = self.lo, S["th"], (x0 + x1) / 2
        tr = S["trim"]
        top = 2.6 if double else DOOR_H
        swing = o.get("swing", "out")
        sy = -1 if swing == "out" else 1
        with g.at(M):                                                                # the frame never fades: it marks the door
            for x in (x0 - 0.0325, x1 + 0.0325):
                g.box(0.125, th + 0.13, top + 0.065, (x, 0, -0.045), col=tr, b=0, jit=0.03)
            g.box(x1 - x0 + 0.3, th + 0.17, 0.15, (c, 0, top - 0.03), col=tr, b=0.025, jit=0.03)
            g.box(x1 - x0 - 0.01, th + 0.2, 0.06, (c, 0, FLOOR - 0.03), col=WOOD_D[0] if S["kind"] != "stone" else STONE[2], b=0)
            if side != "i":         # lantern on the frame, outside
                lx = x1 + 0.03
                g.box(0.05, 0.3, 0.05, (lx, -th / 2 - 0.21, top - 0.25), col=IRON, b=0)
                g.box(0.14, 0.14, 0.05, (lx, -th / 2 - 0.3, top - 0.3), col=IRON, b=0)
                g.box(0.14, 0.14, 0.04, (lx, -th / 2 - 0.3, top - 0.52), col=IRON, b=0)
        if side != "i":
            with self.em.at(M):
                self.em.box(0.1, 0.1, 0.19, (x1 + 0.03, -th / 2 - 0.3, top - 0.49), col=BULB, b=0, jit=0)
        kind = o.get("kind", "barn" if double else "plank")
        leaves = [("l", x0 + 0.06, x1 - 0.06)] if not double else [("l", x0 + 0.06, c - 0.015), ("r", x1 - 0.06, c + 0.015)]
        if not double and o.get("hinge", "l") == "r":
            leaves = [("r", x1 - 0.06, x0 + 0.06)]
        for j, (hs, hx, fx) in enumerate(leaves):
            n = len(self.doors)
            did = o.get("id", f"door{n}") + (("a", "b")[j] if double and o.get("id") else "")
            name = f"door{n}"
            yl = sy * th / 2
            piv = M @ Vector((hx, yl, 0))
            leaf = self.a.part(name, pivot=piv)
            lem = self.a.part(name, pivot=piv, mat="emissive") if o.get("breakable") or o.get("locked") else None
            w = abs(fx - hx)
            dirx = 1 if fx > hx else -1
            Lm = M @ T(hx, yl, 0) @ (T(rz=180) if dirx < 0 else Matrix.Identity(4))
            with leaf.at(Lm):
                if lem is not None:
                    with lem.at(Lm):
                        door_leaf(self, leaf, lem, w, top - 0.06, kind, S, o)
                else:
                    door_leaf(self, leaf, lem, w, top - 0.06, kind, S, o)
            # hinge left + swing out -> the leaf turns from +x toward -y: three.js rotation.y = -open
            ang = -1.6 if (dirx > 0) == (sy < 0) else 1.6
            a, b = M @ Vector((hx, yl, 0)), M @ Vector((fx, yl, 0))
            self.c_seg(a, b, 0.2, id=did)
            d = dict(id=did, leaf=name, axis="y", open=ang, w=round(w, 3), hinge=[round(a.x, 3), round(-a.y, 3)], kind=kind)
            if o.get("breakable"): d["breakable"] = True
            if o.get("locked"): d["locked"] = o["locked"]
            self.doors.append(d)

    def _bay(self, M, x0, x1, S, toks, i):
        """open bay: slim posts at the module lines, the lintel is the upper header"""
        g = self.lo
        if i + 1 < len(toks) and toks[i + 1][0] == "o":
            with g.at(M):
                g.box(0.2, 0.2, 2.66, (x1, 0, -0.06), col=S["post"], b=0.035, grad=(0.86, 1.04))
                for sg in (-1, 1):                                                  # knee braces
                    g.beam((x1 + sg * 0.08, 0, 2.02), (x1 + sg * 0.6, 0, 2.6), 0.1, 0.1, S["post"], b=0)

    def _bars(self, M, x0, x1, door=None):
        g, L, c = self.lo, x1 - x0, (x0 + x1) / 2
        with g.at(M):
            g.box(L, 0.24, 0.16, (c, 0, -0.04), col=STONE[2], b=0)                   # curb
            g.box(L, 0.09, 0.085, (c, 0, 2.512), col=STEEL_D, b=0.0)                 # top rail (stops under the header)
            for x in (x0, x1):
                w = M @ Vector((x, 0, 0))
                key = ("bar", round(w.x, 2), round(w.y, 2))
                if key not in self.posts:
                    self.posts.add(key)
                    g.box(0.12, 0.12, 2.645, (x, 0, -0.045), col=STEEL_D, b=0)
        if door is None:
            with g.at(M):
                g.box(L, 0.06, 0.07, (c, 0, 1.3), col=STEEL_D, b=0)
                n = int(L / 0.25)
                for i in range(1, n):
                    g.box(0.055, 0.055, 2.44, (x0 + L * i / n, 0, 0.1), (0, 0, 45), col=IRON, b=0)
            return
        n = len(self.doors)
        name, did = f"door{n}", door.get("id", f"door{n}")
        hs = door.get("hinge", "l")
        hx, fx = (x0 + 0.1, x1 - 0.1) if hs == "l" else (x1 - 0.1, x0 + 0.1)
        piv = M @ Vector((hx, 0, 0))
        leaf = self.a.part(name, pivot=piv)
        w, d = abs(fx - hx), 1 if fx > hx else -1
        with leaf.at(M @ T(hx, 0, 0) @ (T(rz=180) if d < 0 else Matrix.Identity(4))):
            for z in (0.2, 1.3, 2.4):
                leaf.box(w - 0.02, 0.07, 0.08, (w / 2, 0, z), col=STEEL, b=0)
            for x in (0.04, w - 0.04):
                leaf.box(0.08, 0.08, 2.3, (x, 0, 0.19), col=STEEL, b=0)
            k = int(w / 0.24)
            for i in range(1, k):
                leaf.box(0.05, 0.05, 2.2, (w * i / k, 0, 0.24), (0, 0, 45), col=IRON, b=0)
            leaf.box(0.2, 0.13, 0.3, (w - 0.16, 0, 1.12), col=STEEL_D, b=0)          # lock box
            leaf.box(0.07, 0.15, 0.07, (w - 0.16, 0, 1.24), col=YELLOW, b=0)
            for z in (0.5, 2.0):                                                     # hinge knuckles bite into the post
                leaf.pole((-0.03, 0, z), (-0.03, 0, z + 0.2), 0.05, STEEL_D, n=5, b=0)
        ang = -1.5 if d > 0 else 1.5                                                 # opens to the outside (corridor) side
        a, b = M @ Vector((hx, 0, 0)), M @ Vector((fx, 0, 0))
        self.c_seg(a, b, 0.2, shot=False, id=did)
        self.doors.append(dict(id=did, leaf=name, axis="y", open=ang, w=round(w, 3), hinge=[round(a.x, 3), round(-a.y, 3)], kind="bars",
                               **({"locked": door["locked"]} if door.get("locked") else {})))

    def _cracked(self, M, x0, x1, S):
        """a breakable section: pre-fractured chunks (one node each), the break marks, and what is left standing"""
        n = len(self.brks)
        key, a, r, th, L, c = f"brk{n}", self.a, self.r, S["th"], x1 - x0, (x0 + x1) / 2
        chunks = []
        if S["kind"] == "stone":
            rows = [(0.0, 0.76), (0.76, 0.74), (1.5, 0.74), (2.24, 0.76)]
            for ri, (z, bh) in enumerate(rows):
                cuts = [x0, c + r.uniform(-0.15, 0.15), x1] if ri % 2 == 0 else [x0, x0 + L * 0.3, x0 + L * 0.72, x1]
                for i in range(len(cuts) - 1):
                    ch = a.chunk()
                    with ch.at(M):
                        stone_block(ch, cuts[i + 1] - cuts[i] - 0.03, th + 0.04, bh - 0.02, ((cuts[i] + cuts[i + 1]) / 2, 0, z - 0.04),
                                    col=pick(r, ["#d6ccb4", "#cbbf9f", "#c4ab84", "#ddd5c0"]), b=0.07, chip=1.2)
                    chunks.append(ch)
            ym = th / 2 + 0.02 + 0.012
        else:
            nb = 5
            for i in range(nb):
                w, zb = L / nb - 0.03, r.uniform(0.9, 1.9)
                x = x0 + L * (i + 0.5) / nb
                col = pick(r, WOOD_PALE + WOOD_GREY)
                j = [r.uniform(-0.08, 0.08) for _ in range(3)]
                lo = [(-w / 2, 0), (w / 2, 0), (w / 2, zb + j[0]), (0.06, zb + j[1] + 0.1), (-0.08, zb + j[1] - 0.06), (-w / 2, zb + j[2])]
                hi = [(-w / 2, zb + j[2] + 0.02), (-0.08, zb + j[1] - 0.04), (0.06, zb + j[1] + 0.12), (w / 2, zb + j[0] + 0.02), (w / 2, H - 0.02), (-w / 2, H - 0.02)]
                for poly in (lo, hi):
                    ch = a.chunk()
                    with ch.at(M):
                        ch.emit(p_prism(poly, 0.09, 0.015), col, T(x, 0.045 + (0.008 if i % 2 else -0.008), -0.04, 90, 0, 0) @ T(rz=r.uniform(-2, 2)), jit=0.06)
                    chunks.append(ch)
            for z, sgn in ((0.7, -1), (2.0, 1)):
                ch = a.chunk()
                with ch.at(M):
                    plank(ch, (x0 + 0.05, sgn * 0.07, z), (x1 - 0.05, sgn * 0.07, z + 0.1), 0.2, 0.06, roll=90, pal=WOOD_D)
                chunks.append(ch)
            ym = 0.062
        for i, ch in enumerate(chunks):
            a.adopt(f"{key}_c{i}", ch)
        mk = a.part(f"{key}_marks", pivot=M @ Vector((c, 0, 0)))
        me = a.part(f"{key}_marks", pivot=M @ Vector((c, 0, 0)), mat="emissive")
        cr = [[(-0.72, 2.3), (-0.6, 1.9), (-0.76, 1.55), (-0.62, 1.1), (-0.72, 0.6)], [(0.68, 2.5), (0.8, 2.1), (0.66, 1.75), (0.78, 1.3)], [(-0.62, 1.1), (-0.42, 0.95), (-0.38, 0.55)], [(0.66, 1.75), (0.48, 1.6)]]
        with mk.at(M), me.at(M):
            for F_, yy in ((FRONT, -ym), (BACK, ym)):
                m = F_(c, yy, 0)
                mk.paint_x(1.2, m @ T(0, 1.35), "#5a3a14", w=0.3, lift=0.004)
                me.paint_x(1.1, m @ T(0, 1.35), BREAK_X, w=0.19, lift=0.016)
                for p in cr:
                    mk.paint_crack(p, 0.08, m)
        rem = a.part(f"{key}_remains", pivot=M @ Vector((c, 0, 0)))
        with rem.at(M):
            if S["kind"] == "stone":
                stone_block(rem, 0.56, th - 0.08, 0.28, (x0 + 0.42, 0, -0.085), col=STONE[2], chip=4)
                stone_block(rem, 0.46, th - 0.1, 0.2, (x1 - 0.36, 0.02, -0.075), col=STONE[1], chip=6)
                for i, (dx, dy, sz) in enumerate(((-0.3, -0.28, 0.44), (0.0, -0.36, 0.38), (0.28, -0.24, 0.34), (-0.12, -0.56, 0.32))):
                    rem.rock(sz, sz * 0.9, sz * 0.62, (c + dx, dy, -0.05 - 0.004 * i), (0, 0, 40 * i), col=pick(r, STONE), n=9, b=0, seed=n * 9 + i)
            else:
                for x in (x0 + 0.2, x1 - 0.21):
                    rem.emit(p_prism([(-0.1, 0), (0.1, 0), (0.1, 0.26), (0.03, 0.5), (-0.1, 0.2)], 0.05, 0.0), pick(r, WOOD_GREY), T(x, 0.018, -0.07, 90, 0, 0))
                plank(rem, (x0 + 0.1, -0.05, 0.05), (c + 0.2, -0.7, 0.04), 0.3, 0.07, pal=WOOD_PALE)
        a0, b0 = M @ Vector((x0, 0, 0)), M @ Vector((x1, 0, 0))
        self.c_seg(a0, b0, max(th, 0.3), id=key)
        self.brks.append(dict(id=key, chunks=len(chunks), marks=f"{key}_marks", remains=f"{key}_remains"))

    # ---------------------------------------------------------------- roofs
    def plane(self, o, ex, ez, width, length, style, inl=0.0, inr=0.0, g=None, seed=0, tiers=3, fringe=True, **kw):
        """one roof plane: origin o at an eave corner, ex along the eave, ez up the slope. inl / inr pull the top
        edge in (hips). Styles: thatch (layered, ragged eave), tin (corrugated sheets), plank (boards)."""
        g, r = g or self.rf(), self.r
        ex, ez = Vector(ex).normalized(), Vector(ez).normalized()
        if ez.cross(ex).z < 0:                       # keep the normal pointing up and out
            o, ex, inl, inr = Vector(o) + ex * width, -ex, inr, inl
        F = frame(o, ex, ez)
        ins = [0.0]
        xl = lambda v: inl * v / length + ins[0]
        xr = lambda v: width - inr * v / length - ins[0]
        with g.at(F):
            if style == "thatch":
                cols = [shade(pick(r, THATCH), 0.94 + 0.06 * j) for j in range(tiers)]
                for j in range(tiers):
                    v0 = length * (j / tiers) - (0.0 if j == 0 else 0.22)
                    v1 = length * ((j + 1) / tiers)
                    n0 = 0.07 * j + 0.02
                    ins[0] = 0.014 * j
                    col = cols[j]
                    if j == 0 and fringe:        # ragged eave: every other point hangs lower
                        k = max(3, int((xr(0) - xl(0)) / 0.8))
                        bot = []
                        for i in range(2 * k + 1):
                            u = xl(v0) + (xr(v0) - xl(v0)) * i / (2 * k)
                            bot.append((u, n0, v0 - (r.uniform(0.16, 0.3) if i % 2 else 0)))
                        topr = [(xl(v1) + (xr(v1) - xl(v1)) * i / (2 * k), n0, v1) for i in range(2 * k + 1)]
                        g.sheet([bot, topr], col, thick=0.17, grad=None, jit=0.04, smooth=30)
                    else:
                        g.sheet([[(xl(v0), n0, v0), (xr(v0), n0, v0)], [(xl(v1), n0, v1), (xr(v1), n0, v1)]], col, thick=0.17, jit=0.04)
                    Dm = T(0, n0 + 0.085, 0, -90, 0, 0)        # decal x -> u, decal y -> -v
                    last = j == tiers - 1
                    va, vb = v0 + 0.08, (v1 - 0.05) if last else (v1 - 0.22)      # the part of this tier you can see
                    U = lambda a_, v: xl(v) + 0.06 + a_ * (xr(v) - xl(v) - 0.12)
                    nb = max(2, int((xr(va) - xl(va)) / 0.9))
                    for i in range(nb):          # bundles: alternate tone stripes down the slope
                        if i % 2 == 0:
                            continue
                        a0, a1 = i / nb, (i + 1) / nb
                        g.paint_poly([(U(a0, va), -va), (U(a1, va), -va), (U(a1, vb), -vb), (U(a0, vb), -vb)], Dm, shade(col, r.uniform(0.86, 0.93)), lift=0.006)
                    if not last:                 # the next tier's shadow and its ragged edge, painted on this one
                        g.paint_poly([(U(0, vb - 0.16), -(vb - 0.16)), (U(1, vb - 0.16), -(vb - 0.16)), (U(1, vb + 0.02), -(vb + 0.02)), (U(0, vb + 0.02), -(vb + 0.02))], Dm, shade(col, 0.66), lift=0.009)
                        nt = max(3, int((xr(vb) - xl(vb)) / 0.5))
                        for i in range(nt):
                            a_ = (i + 0.5) / nt
                            hw = 0.4 / nt
                            tip = vb - r.uniform(0.14, 0.34)
                            g.paint_poly([(U(a_ - hw, vb + 0.02), -(vb + 0.02)), (U(a_ + hw, vb + 0.02), -(vb + 0.02)), (U(a_ + r.uniform(-hw, hw) * 0.5, tip), -tip)], Dm, shade(cols[j + 1], 0.97), lift=0.012)
                    ns = max(2, int((xr(va) - xl(va)) * 0.7))
                    for i in range(ns):          # loose straws, one per slot
                        v = r.uniform(va + 0.25, vb - 0.3) if vb - va > 0.75 else (va + vb) / 2
                        a_ = (i + r.uniform(0.25, 0.75)) / ns
                        l = min(r.uniform(0.3, 0.6), (vb - va) * 0.8)
                        g.paint_line([(U(a_, v), -(v - l / 2)), (U(a_, v) + r.uniform(-0.04, 0.04), -(v + l / 2))], 0.05, Dm, pick(r, [THATCH_D, THATCH_L, THATCH_D]), lift=0.015)
            elif style == "tin":
                pal = kw.get("pal", TIN + TIN + RUSTY)
                u = 0.0
                while u < width - 1e-6:
                    w = min(width - u, r.choice([1.0, 1.5, 1.5, 2.0]))
                    if width - u - w < 0.6:
                        w = width - u
                    m = max(2, round(w / 0.5)) * 2
                    amp = 0.07
                    prof = [(w * i / m, amp * (i % 2)) for i in range(m + 1)] + [(w, -0.035), (0, -0.035)]
                    ov = r.uniform(0.0, 0.14)
                    col = pick(r, pal)
                    g.emit(p_prism(prof, length + ov, 0.0), col, T(u, 0.03 + r.uniform(0, 0.012), -ov), jit=0.05, cap=shade(col, 0.6), smooth=20)
                    u += w
                for i in range(int(width / 4.5)):          # patch sheets nailed over the worst of it
                    pw_, pl = r.choice([1.0, 1.5]), min(length * 0.4, r.uniform(0.9, 1.5))
                    pu = width * (i + r.uniform(0.25, 0.75)) / max(1, int(width / 4.5)) - pw_ / 2
                    pv = r.uniform(0.25, max(0.3, length - pl - 0.5))
                    m = max(2, round(pw_ / 0.5)) * 2
                    prof = [(pw_ * k / m, 0.07 * (k % 2)) for k in range(m + 1)] + [(pw_, -0.035), (0, -0.035)]
                    pc = pick(r, RUSTY + ["#7fa39a", "#b9b3a6"])
                    g.emit(p_prism(prof, pl, 0.0), pc, T(max(0.05, min(width - pw_ - 0.05, pu)), 0.125, pv), jit=0.05, cap=shade(pc, 0.6), smooth=20)
            else:   # plank roof
                pal = kw.get("pal", WOOD_GREY + WOOD_D[:1] + WOOD[:1])
                n = max(1, round(width / 0.46))
                bw = width / n
                for i in range(n):
                    ov = r.uniform(0.0, 0.16)
                    g.box(bw - 0.03, 0.07, length + ov, ((i + 0.5) * bw, 0.035 + (0.012 if i % 2 else 0), -ov), col=pick(r, pal), b=0.0, jit=0.06, grad=(0.92, 1.05))
                if kw.get("patch", True) and width > 2.5:       # a tin sheet nailed over the leak
                    pw_, pl = 1.5, min(length * 0.5, 1.8)
                    pu, pv = r.uniform(0.3, width - pw_ - 0.3), r.uniform(0.3, length - pl - 0.3)
                    prof = [(pw_ * k / 6, 0.05 * (k % 2)) for k in range(7)] + [(pw_, -0.02), (0, -0.02)]
                    g.emit(p_prism(prof, pl, 0.0), pick(r, TIN + RUSTY[:1]), T(pu, 0.07 + 0.03, pv), jit=0.04, smooth=20)
        return F

    def roofline(self, x0, y0, x1, y1, prof, axis="x", style="tin", over=0.42, og=0.4, ends=None, trim=None, z=H, truss=False, **kw):
        """a ridged roof over the rectangle, ridge along `axis`. prof = half profile from the eave to the ridge as
        (distance from the ridge line, height above z): [(Sh, 0), (0, rise)] is a gable, three points a gambrel.
        og = gable overhang (or a pair, -end / +end), ends = wall style of the gable ends (or a pair; None = open)."""
        g, r = self.rf(), self.r
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        Lh, Sh = ((x1 - x0) / 2, (y1 - y0) / 2) if axis == "x" else ((y1 - y0) / 2, (x1 - x0) / 2)
        R = T(cx, cy, 0, rz=0 if axis == "x" else 90)        # roof space: ridge along local x
        R3 = R.to_3x3()
        og = og if isinstance(og, (tuple, list)) else (og, og)
        ends = ends if isinstance(ends, (tuple, list)) else (ends, ends)
        rise = prof[-1][1]
        tr = trim or OCHRE
        xa, xb = -(Lh + og[0]), Lh + og[1]
        for sg in (-1, 1):
            for i in range(len(prof) - 1):
                (ua, za), (ub, zb) = prof[i], prof[i + 1]
                ez = Vector((0, -sg * (ua - ub), zb - za))
                ln = ez.length
                ez.normalize()
                ext = over if i == 0 else 0.12
                dx = 0.004 * (i + (2 if sg > 0 else 0))      # this plane's station along the ridge: where two slopes (or the two pitches of a
                #                                              gambrel) cross, their boards, sheets and barge boards must not share a face plane
                o = Vector((xa + dx, sg * ua, z + za - 0.02 + (0.03 * i))) - ez * ext
                self.plane(R @ o, R3 @ Vector((1, 0, 0)), R3 @ ez, xb - xa, ln + ext + (0.06 if style != "thatch" and i == len(prof) - 2 else 0.0), style, g=g, **kw)
                for k, xg in enumerate((xa, xb)):            # barge boards on the rakes
                    with g.at(R):
                        p0 = Vector((xg + dx, sg * ua, z + za)) - ez * ext + Vector((0, 0, 0.08))
                        p1 = Vector((xg + dx, sg * ub, z + zb + 0.08))
                        g.beam(p0, p1, 0.2, 0.08, tr, b=0.0, ext=0.04, jit=0.03, roll=90)
        hf = lambda u: next((za + (zb - za) * (ua - abs(u)) / (ua - ub) for (ua, za), (ub, zb) in zip(prof, prof[1:]) if ub - 1e-9 <= abs(u) <= ua + 1e-9), 0.0)
        with g.at(R):
            zr = z + rise
            if style == "thatch":      # ridge roll + crossed sticks
                g.pole((xa - 0.1, 0, zr + 0.2), (xb + 0.1, 0, zr + 0.2), 0.24, THATCH[3], n=7, b=0.05, cap=THATCH_D)
                k = max(2, int((xb - xa) / 1.7))
                for i in range(k):
                    x = xa + (xb - xa) * (i + 0.5) / k
                    for sg in (-1, 1):
                        g.beam((x + sg * 0.05, -sg * 0.55, zr - 0.22), (x + sg * 0.05, sg * 0.3, zr + 0.62), 0.07, 0.07, pick(r, WOOD_D), b=0)
            elif style == "tin":
                g.pole((xa - 0.08, 0, zr + 0.06), (xb + 0.08, 0, zr + 0.06), 0.13, TIN[3], n=6, b=0.02, cap=shade(TIN[3], 0.6))
                nv = int((xb - xa) / 5.5)
                for i in range(nv):                      # ridge vents
                    x = xa + (xb - xa) * (i + 0.5) / nv + r.uniform(-0.4, 0.4)
                    g.box(0.5, 0.5, 0.42, (x, 0, zr - 0.08), col=TIN[1], b=0.03)
                    g.box(0.66, 0.66, 0.07, (x, 0, zr + 0.33), col=RUSTY[1], b=0.02)
            else:
                g.box(xb - xa + 0.16, 0.34, 0.1, ((xa + xb) / 2, 0, zr + 0.02), col=WOOD_D[0], b=0.03)
            for k, (sg, xg) in enumerate(((-1, -Lh), (1, Lh))):
                if not ends[k]:
                    if truss:                                 # open end: tie beam + king post + struts
                        g.box(0.16, 2 * Sh + 0.1, 0.18, (xg, 0, z - 0.02), col=WOOD_D[0], b=0.03)
                        g.box(0.14, 0.14, rise - 0.1, (xg, 0, z + 0.1), col=WOOD_D[0], b=0.0)
                        for s2 in (-1, 1):
                            g.beam((xg, s2 * Sh * 0.55, z + 0.12), (xg, 0, z + rise * 0.72), 0.1, 0.1, WOOD_D[1], b=0)
                    continue
                E = STY[ends[k]]
                poly = [(-u, h_) for u, h_ in prof] + [(u, h_) for u, h_ in reversed(prof[:-1])]
                poly = [(u * (1 + 0.02 / Sh), h_ + (0.02 if abs(u) < 1e-6 else 0)) for u, h_ in poly]
                core = E["core"] if E["kind"] != "stone" else WHITE[1]
                g.emit(p_prism(poly, E["th"], 0.0), core, T(xg, 0, z) @ T(rz=90) @ T(0, E["th"] / 2, 0, 90, 0, 0), jit=0.02)
                Fm = (RIGHT if sg > 0 else LEFT)(xg + sg * (E["th"] / 2), 0, z)
                if E["kind"] != "stone":
                    cuts = sorted(set([-Sh + 2 * Sh * i / max(1, int(2 * Sh / 0.4)) for i in range(int(2 * Sh / 0.4) + 1)] + [sgn * u for u, _ in prof for sgn in (-1, 1)]))
                    for u0, u1 in zip(cuts, cuts[1:]):
                        if u1 - u0 < 0.08:
                            continue
                        a_, b_ = u0 + 0.02, u1 - 0.02
                        h0, h1 = hf(a_) - 0.05, hf(b_) - 0.05
                        if max(h0, h1) < 0.12:
                            continue
                        g.paint_poly([(a_, 0.0), (b_, 0.0), (b_, max(0.02, h1)), (a_, max(0.02, h0))], Fm, shade(pick(r, E["ext"]), r.uniform(0.92, 1.05)))
                else:
                    g.paint_poly([(-Sh * 0.55, 0.12), (Sh * 0.55, 0.12), (Sh * 0.5, 0.3), (-Sh * 0.5, 0.3)], Fm, OCHRE)
        return R, hf

    def gable(self, x0, y0, x1, y1, axis="x", style="tin", rise=1.6, **kw):
        Sh = (y1 - y0) / 2 if axis == "x" else (x1 - x0) / 2
        return self.roofline(x0, y0, x1, y1, [(Sh, 0.0), (0.0, rise)], axis, style, **kw)

    def gambrel(self, x0, y0, x1, y1, axis="y", style="tin", rise=2.6, **kw):
        Sh = (y1 - y0) / 2 if axis == "x" else (x1 - x0) / 2
        return self.roofline(x0, y0, x1, y1, [(Sh, 0.0), (Sh * 0.56, rise * 0.66), (0.0, rise)], axis, style, **kw)

    def shed(self, x0, y0, x1, y1, style="tin", rise=0.9, over=0.45, fill="tin", z=H, **kw):
        """mono-pitch roof, low edge on the -y side; the wedge between the wall tops and the roof is filled"""
        g = self.rf()
        d = y1 - y0
        ez = Vector((0, d, rise)).normalized()
        ln = sqrt(d * d + rise * rise)
        o = Vector((x0 - over + 0.004, y0, z - 0.02)) - ez * over     # 4 mm off the module grid: a sheet edge must not land in a window jamb's plane
        self.plane(o, (1, 0, 0), ez, x1 - x0 + 2 * over, ln + 2 * over, style, g=g, **kw)
        S = STY[fill]
        th = S["th"]
        g.box(x1 - x0 + th - 0.012, th, rise - 0.004, ((x0 + x1) / 2, y1, z + 0.004), col=S["core"], b=0.0, jit=0)       # high wall (its underside clear of the wedges')
        boards(g, BACK(0, y1 + th / 2, 0), x0, x1, z, z + rise - 0.03, S["ext"], pw=0.25, vertical=True, gap=0.045, flip=True)
        boards(g, FRONT(0, y1 - th / 2, 0), x0, x1, z, z + rise - 0.03, S["int"], pw=0.5, vertical=True)
        for sg, x in ((-1, x0), (1, x1)):
            g.emit(p_prism([(y0, 0), (y1, 0), (y1, rise)], th, 0.0), S["core"], T(x, 0, z) @ T(rz=90) @ T(0, th / 2, 0, 90, 0, 0), jit=0)
            Fm = (RIGHT if sg > 0 else LEFT)(x + sg * th / 2, 0, z)
            n = int(d / 0.5)
            for i in range(n):
                a_, b_ = y0 + d * i / n + 0.025, y0 + d * (i + 1) / n - 0.025
                h0, h1 = rise * (a_ - y0) / d - 0.04, rise * (b_ - y0) / d - 0.04
                if h1 < 0.1:
                    continue
                pts = [(a_, 0.0), (b_, 0.0), (b_, h1), (a_, max(0.02, h0))]
                g.paint_poly([(u * sg, v) for u, v in pts], Fm, shade(pick(self.r, S["ext"]), self.r.uniform(0.93, 1.05)))
        return lambda y: z + rise * (y - y0) / d

    def porch(self, x0, y0, x1, y1, gap=None, style="plank", posts=2.0, pergola=True, rail=True):
        """open porch in front of the wall at y = y1: deck, posts, rail (with a gap for the steps) and open rafters"""
        g, r, S = self.lo, self.r, STY[style]
        self.floor(x0, y0, x1, y1 - S["th"] / 2 - 0.02, "plank", along="x", depth=0.2, z=FLOOR - 0.03)
        n = max(1, round((x1 - x0) / posts))
        xs = [x0 + 0.12 + (x1 - x0 - 0.24) * i / n for i in range(n + 1)]
        yp = y0 + 0.12
        for x in xs:
            g.box(0.16, 0.16, 2.42, (x, yp, 0.0), col=S["post"], b=0.03, grad=(0.88, 1.04))
        segs = [((xs[i], yp), (xs[i + 1], yp)) for i in range(n)] + [((x0 + 0.12, yp), (x0 + 0.12, y1 - 0.2)), ((x1 - 0.12, yp), (x1 - 0.12, y1 - 0.2))]
        for (ax, ay), (bx, by) in segs if rail else []:
            if gap and abs(ay - by) < 1e-6 and ax >= gap[0] - 0.3 and bx <= gap[1] + 0.3:
                continue
            dz = -0.004 if abs(ax - bx) < 1e-6 else 0.0          # side rails sit 4 mm under the front rails they meet at the corner
            g.beam((ax, ay, 0.95 + dz), (bx, by, 0.95 + dz), 0.1, 0.09, S["trim"], b=0.0, jit=0.03)
            g.beam((ax, ay, 0.42 + dz), (bx, by, 0.42 + dz), 0.07, 0.07, S["post"], b=0.0)
            L = sqrt((bx - ax) ** 2 + (by - ay) ** 2)
            k = max(2, int(L / 0.5))
            for i in range(1, k):
                px, py = ax + (bx - ax) * i / k, ay + (by - ay) * i / k
                g.box(0.06, 0.06, 0.8, (px, py, 0.14), col=WOOD_PALE[1], b=0)
            self.c_seg((ax, ay), (bx, by), 0.2, shot=False, low=True)
        if pergola:
            rf = self.rf()
            rf.box(x1 - x0 + 0.3, 0.16, 0.16, ((x0 + x1) / 2, yp, 2.4), col=S["post"], b=0.03)
            k = max(2, int((x1 - x0) / 0.62))
            for i in range(k + 1):
                x = x0 + 0.1 + (x1 - x0 - 0.2) * i / k
                rf.beam((x, y0 - 0.25, 2.56), (x, y1 - S["th"] / 2 + 0.02, 2.82), 0.09, 0.12, pick(r, WOOD_GREY + WOOD_D[:1]), b=0.0, jit=0.05)
            ya, yb = y0 - 0.25, y1 - S["th"] / 2 + 0.02
            for j in (0.33, 0.7):
                yy = y0 + (y1 - y0) * j
                rf.box(x1 - x0 + 0.2, 0.07, 0.06, ((x0 + x1) / 2, yy, 2.56 + 0.26 * (yy - ya) / (yb - ya) + 0.03), col=WOOD_PALE[2], b=0)

    def steps(self, x, y, w=1.6, n=2, rz=0.0, kind="plank"):
        """a stoop: low treads down toward local -y (the floor is only 0.08 u up, so this is a doorstep, not a stair)"""
        g = self.lo
        c = WOOD_D[1] if kind == "plank" else STONE[1]
        with g.at(T(x, y, 0, 0, 0, rz)):
            for i in range(n):
                g.box(w - 0.1 * i, 0.4, 0.06 - 0.03 * i + 0.16 - 0.005 * i, (0, -0.2 - i * 0.36, -0.16 + 0.005 * i), col=shade(c, 1.0 + 0.06 * i), b=0, jit=0.03)

    def stilts(self, pts, depth=1.9, r=0.12):
        for x, y in pts:
            self.lo.lathe([(r, -depth), (r * 0.9, FLOOR - 0.06)], (x, y, 0), col=pick(self.r, WOOD_D), n=6, cap0=False, cap1=False, grad=(0.7, 1.0))

    def chimney(self, x, y, w=0.9, d=0.6, top=5.2):
        g = self.lo
        z, i = -0.06, 0
        while z < top - 0.05:
            bh = min(0.9, top - z)
            k = 1.0 if z < 2.4 else 0.82
            stone_block(g, w * k, d * k, bh - 0.035, (x, y, z), col=pick(self.r, STONE), b=0.06, chip=0.8)
            z += bh; i += 1
        g.box(w * 0.82 + 0.14, d * 0.82 + 0.14, 0.14, (x, y, top - 0.02), col=STONE_D, b=0.03)

    def hip(self, x0, y0, x1, y1, rise=1.9, over=0.46, z=H, cap=True):
        """thatch hip roof over the rectangle"""
        g = self.rf()
        cx, cy, a, b = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2
        ra, rb = max(a - b, 0.0) + 0.12, max(b - a, 0.0) + 0.12          # ridge half extents (a small flat top closes it)
        ae, be = a + over, b + over
        z0, z1 = z - 0.16, z + rise
        corners = lambda A_, B_, zz: [Vector((cx - A_, cy - B_, zz)), Vector((cx + A_, cy - B_, zz)), Vector((cx + A_, cy + B_, zz)), Vector((cx - A_, cy + B_, zz))]
        E, Tp = corners(ae, be, z0), corners(ra, rb, z1)
        for i in range(4):
            e0, e1, t0, t1 = E[i], E[(i + 1) % 4], Tp[i], Tp[(i + 1) % 4]
            ex = (e1 - e0).normalized()
            mid_e, mid_t = (e0 + e1) / 2, (t0 + t1) / 2
            ez = (mid_t - mid_e)
            ez = (ez - ex * ez.dot(ex))
            length = ez.length
            inl = (t0 - e0).dot(ex)
            inr = (e1 - t1).dot(ex)
            self.plane(e0, ex, ez, (e1 - e0).length, length, "thatch", inl=inl, inr=inr, g=g)
        for i in range(4):          # bamboo on the hips
            g.pole(E[i] + Vector((0, 0, 0.2)), Tp[i] + Vector((0, 0, 0.3)), 0.075, pick(self.r, ["#a58a4e", "#9a7f45"]), n=6, b=0.02, cap=ENDGRAIN)
        if cap:
            g.box(2 * ra + 0.5, 2 * rb + 0.5, 0.32, (cx, cy, z1 - 0.02), col=THATCH[3], b=0.1, taper=(0.55, 0.55))
            g.pole((cx, cy, z1 + 0.2), (cx, cy, z1 + 0.75), 0.07, WOOD_D[0], n=6, b=0.02)
        return z1


def door_leaf(h, g, em, w, top, kind, S, o):
    """a leaf in hinge space: hinge at x = 0, free edge at x = w, thickness on y, bottom at z = 0.12. Both faces carry
    the braces and marks, because either can face the camera once the building is turned."""
    r, t, z0 = h.r, 0.09, 0.12
    hgt = top - z0
    yo = t / 2
    if kind == "steel":
        g.box(w, t, hgt, (w / 2, 0, z0), col=STEEL, b=0.025, jit=0.02)
        for F_, sy in ((FRONT, -1), (BACK, 1)):
            u = lambda x: x if F_ is FRONT else -x
            m = F_(0, sy * yo, z0)
            xs = sorted((u(0.08), u(w - 0.08)))
            g.paint_poly([(xs[0], 0.08), (xs[1], 0.08), (xs[1], hgt - 0.08), (xs[0], hgt - 0.08)], m, "#6d8580")
            for k in range(4):          # hazard chevrons on a band
                a0 = xs[0] + (xs[1] - xs[0]) * k / 4
                a1 = xs[0] + (xs[1] - xs[0]) * (k + 0.5) / 4
                g.paint_poly([(a0, hgt * 0.42), (a1, hgt * 0.42), (a1 + 0.12, hgt * 0.56), (a0 + 0.12, hgt * 0.56)], m, YELLOW)
            for x in xs:              # rivet heads
                for zz in (0.14, hgt * 0.3, hgt * 0.7, hgt - 0.14):
                    g.paint_poly([(x - 0.035, zz - 0.035), (x + 0.035, zz - 0.035), (x + 0.035, zz + 0.035), (x - 0.035, zz + 0.035)], m, STEEL_L, lift=0.017)
    else:
        pal = WOOD_PALE + WOOD_GREY if o.get("breakable") else (BARN_RED if kind == "barn" else WOOD + WOOD_GREY[:1])
        g.box(w, t, hgt, (w / 2, 0, z0), col=S["core"] if S["kind"] == "plank" else SEAM, b=0, jit=0.0)
        boards(g, FRONT(0, -yo, z0), 0.02, w - 0.02, 0.02, hgt - 0.02, pal, pw=0.3, vertical=True)
        boards(g, BACK(0, yo, z0), 0.02, w - 0.02, 0.02, hgt - 0.02, pal, pw=0.3, vertical=True, flip=True)
        tr = CREAM if kind == "barn" else WOOD_D[1]
        for sy in (-1, 1):             # ledges and a brace, both faces
            y = sy * (yo + 0.02)
            for z in (0.22, hgt - 0.34):
                g.box(w - 0.06, 0.05, 0.14, (w / 2, y, z0 + z), col=tr, b=0.0, jit=0.04)
            if not o.get("breakable"):
                g.beam((0.1, y + sy * 0.003, z0 + 0.36), (w - 0.1, y + sy * 0.003, z0 + hgt - 0.34), 0.05, 0.13, tr, b=0.0, jit=0.04)
            if kind == "barn" and not o.get("breakable"):      # the crossing brace lies 4 mm proud of the first, flat (a leaning one reads as coplanar)
                g.beam((w - 0.1, y + sy * 0.007, z0 + 0.36), (0.1, y + sy * 0.007, z0 + hgt - 0.34), 0.05, 0.13, tr, b=0.0, jit=0.04)
    for z in (0.35, hgt - 0.45):       # strap hinges + knuckles that bite into the jamb
        g.box(0.5, t + 0.05, 0.08, (0.22, 0, z0 + z), col=IRON, b=0.0)
        g.pole((-0.035, 0, z0 + z - 0.06), (-0.035, 0, z0 + z + 0.14), 0.05, IRON, n=5, b=0)
    g.box(0.07, t + 0.16, 0.2, (w - 0.14, 0, z0 + hgt * 0.45), col=IRON if kind != "steel" else YELLOW_D, b=0)      # handle
    if o.get("locked"):                # padlock + a glowing keyhole
        for sy in (-1, 1):
            g.box(0.24, 0.07, 0.24, (w - 0.14, sy * (yo + 0.05), z0 + hgt * 0.45 - 0.34), col=YELLOW_D, b=0.03)
            m = (FRONT if sy < 0 else BACK)(w - 0.14, sy * (yo + 0.085), z0 + hgt * 0.45 - 0.22)
            em.paint_poly([(-0.04, -0.06), (0.04, -0.06), (0.025, 0.0), (0.05, 0.05), (0, 0.08), (-0.05, 0.05), (-0.025, 0.0)], m, "#ff5a3a", lift=0.004)
    if o.get("breakable"):             # the kit's break mark
        for F_, sy in ((FRONT, -1), (BACK, 1)):
            m = F_(w / 2, sy * yo, z0 + hgt * 0.5)
            g.paint_x(0.86, m, "#5a3a14", w=0.2, lift=0.016)
            em.paint_x(0.78, m, BREAK_X, w=0.13, lift=0.0195)


def sign(g, text, at, face=FRONT, h=0.26, col=WOOD_PALE[0], ink="#3a2a1c", pad=0.14, board=True, th=0.06, rot=0.0):
    """a painted board with stencilled letters. `at` is the centre of the board face."""
    paths, width = text_paths(text, h)
    w, bh = width + 2 * pad, h + 2 * pad * 0.8
    x, y, z = at
    M = face(x, y, z) @ T(rz=rot)
    if board:
        g.emit(p_box(w, bh, th, 0.02), col, M @ T(0, 0, -th), jit=0.03)
    for p in paths:
        closed = len(p) > 2 and p[0] == p[-1]
        g.paint_line([(px, py - h / 2) for px, py in (p[:-1] if closed else p)], h * 0.17, M, ink, closed=closed)
    return w, bh
