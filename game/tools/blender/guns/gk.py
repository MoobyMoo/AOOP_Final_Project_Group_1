"""The gun kit: shared parts for every Bananaville firearm after the Kingpin .45 (Blender 5.2, headless).

Built on tools/blender/kingpin/kp_common.py, so a kit gun is a Kingpin in every way the game can see: the same frame
(x right = ejection side, y up, z forward along the bore, the firing hand's grip at the origin), the same 16-cell
palette texture and MAT_Kingpin material, palette UVs, and ray-cast ambient occlusion in COLOR_0.

Colour beyond the palette. The palette has one free cell and the guns need a dozen woods, tapes and rusts. The game's
gun material multiplies the palette texel by the vertex colour, so a kit face picks a palette cell for its surface
kind (metalness, roughness) and writes a tint into COLOR_0 next to the AO: colour = cell x tint x AO. Nothing in the
palette, the texture or the game's material changes, and the Kingpin's own material shows a kit gun correctly.
TINTS lists them; M.<name> works for a tint exactly as it does for a palette cell.

Parts are written in the gun's frame at their real place and return mesh objects; roster.py hands them to a Gun,
which sorts them into the GLB's nodes. Fit rules the parts keep, so that the Kingpin's attachments mount unchanged:
  saddle() / rail_top()  the top the sight bases clamp: the Kingpin slide's section (flat 0.10 wide, chamfers out to
                         0.19 at 0.07 below), solid under the socket from 0.15 behind it to 0.12 ahead
  barrel()               ends in the Kingpin's crown (radius 0.042, chamfered), which the muzzle devices' collar swallows
  rail_under()           the Kingpin's three-lug rail, lugs at the same stations round the socket
  mag_foot()             a baseplate the magazine extension's sleeve swallows
"""
import bpy, bmesh, os, sys  # noqa
from math import radians, sin, cos, tan, acos, atan2, pi
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "kingpin"))
import kp_common as K
from kp_common import M, outline, prism, loft, lathe, box, add_box, bevel, bevel_all, cut, mirror_x, move, join, mk, lin, srgb  # noqa: F401

# ------------------------------------------------------------------------------------------------ tints
# name, the palette cell that carries it (its metalness and roughness), the colour it shows (sRGB, before lighting).
# A tint can only darken its cell, so hosts are the light cells: white (matte), ivory (satin), ivorycut (rough),
# steel and brass (metal). Authored dark, like the palette: the game's sun shows a dielectric at about 2.5x.
TINTS = [
    ("wood",     "white",    "#7a4a24"),   # mid warm furniture wood
    ("wood_lt",  "white",    "#a67c48"),   # pale crate pine
    ("wood_red", "ivorycut", "#6a3220"),   # mismatched red-brown
    ("walnut",   "ivory",    "#4d2c18"),   # premium dark walnut, oiled
    ("coconut",  "ivorycut", "#4a3220"),   # coconut shell
    ("coir",     "ivorycut", "#6b5236"),   # coconut fibre
    ("green",    "ivory",    "#1d4733"),   # banker green lacquer
    ("green_dk", "ivory",    "#12301f"),
    ("tape",     "white",    "#8a8a84"),   # grey duct tape
    ("tape_blk", "ivorycut", "#1b1b1e"),   # black electrical tape
    ("rust",     "ivorycut", "#6f3b1a"),
    ("rust_dk",  "ivorycut", "#3f2414"),
    ("bill",     "white",    "#4c7a46"),   # banknote green
    ("blued",    "steel",    "#2f3a52"),   # blued steel
    ("pipe",     "steel",    "#5d5f5e"),   # dull galvanised pipe
    ("tin",      "steel",    "#70766f"),   # tin can
    ("rubber",   "ivorycut", "#16161a"),   # butt pads, eyecups
    ("brass_dk", "brass",    "#8a6524"),   # engraved lines in brass
    ("canvas",   "ivorycut", "#5f5a3c"),   # olive canvas sling and pouches
    ("cork",     "white",    "#9a7650"),
]
NBASE = len(K.PAL) + len(K.EMIT)
TINT = {}                                 # material index -> (palette cell, (r, g, b) linear multiplier)
for _i, (_n, _host, _hex) in enumerate(TINTS):
    _cell, _t = lin(K.PAL[getattr(M, _host)][1]), lin(_hex)
    if any(t > c * 1.12 for t, c in zip(_t, _cell)): raise SystemExit(f"tint {_n}: brighter than its cell {_host}")
    setattr(M, _n, NBASE + _i)
    TINT[NBASE + _i] = (getattr(M, _host), tuple(min(1.0, t / c) for t, c in zip(_t, _cell)))

BORE = 0.33                               # the long guns' bore axis (the Kingpin's is 0.315)
FLASH_LEAD = 0.033                        # the flash point sits this far ahead of the crown, as on the Kingpin

def reset():
    scene = K.reset()
    for n, _host, hexc in TINTS:
        m = bpy.data.materials.new("tmp_" + n); m.diffuse_color = (*srgb(hexc), 1)
        K.MATS.append(m)
    return scene

def finish(nodes):
    """fold each tint into COLOR_0 (on top of the baked AO), point the face at its palette cell, then K.finish()"""
    for ob in nodes:
        me = ob.data; col = me.color_attributes["Col"]
        for poly in me.polygons:
            t = TINT.get(poly.material_index)
            if t is None: continue
            for li in poly.loop_indices:
                c = col.data[li].color
                col.data[li].color = (c[0] * t[1][0], c[1] * t[1][1], c[2] * t[1][2], 1.0)
            poly.material_index = t[0]
    return K.finish(nodes)

# ------------------------------------------------------------------------------------------------ the gun being built
class Gun:
    def __init__(self, gid, name, cls, tier):
        self.id, self.name, self.cls, self.tier = gid, name, cls, tier
        self.nodes = {"frame": []}        # node name -> parts (mesh objects in the gun frame)
        self.sockets, self.points, self.pivots, self.extras = {}, {}, {}, {}
    def add(self, node, *parts):
        out = self.nodes.setdefault(node, [])
        for p in parts: out.extend(p) if isinstance(p, (list, tuple)) else out.append(p)
        return self
    def socket(self, name, at, rides="body"): self.sockets[name] = (tuple(round(v, 4) for v in at), rides)
    def point(self, name, at): self.points[name] = tuple(round(v, 4) for v in at)
    def pivot(self, node, at): self.pivots[node] = tuple(round(v, 4) for v in at)
    def muzzle(self, at, rides="body"):
        """the crown: where muzzle devices mount, and the flash point just ahead of it"""
        self.socket("socket_muzzle", at, rides)
        self.point("muzzle_flash", (at[0], at[1], at[2] + FLASH_LEAD))

# ------------------------------------------------------------------------------------------------ 2D helpers
def fillet_open(path, per90=3):
    """open polyline [(u, v, radius?)] -> [Vector] with circular fillets at the inner points"""
    out = []
    for i, p in enumerate(path):
        p1 = Vector(p[:2])
        if len(p) < 3 or i in (0, len(path) - 1): out.append(p1); continue
        u0, u2 = Vector(path[i - 1][:2]) - p1, Vector(path[i + 1][:2]) - p1
        l0, l2 = u0.length, u2.length; u0, u2 = u0 / l0, u2 / l2
        phi = acos(max(-1, min(1, u0.dot(u2))))
        if phi > pi - 1e-3: out.append(p1); continue
        t = min(p[2] / tan(phi / 2), 0.48 * min(l0, l2)); r = t * tan(phi / 2)
        a, b, c = p1 + u0 * t, p1 + u2 * t, p1 + (u0 + u2).normalized() * (r / sin(phi / 2))
        a0, a1 = atan2(a.y - c.y, a.x - c.x), atan2(b.y - c.y, b.x - c.x)
        da = (a1 - a0 + pi) % (2 * pi) - pi
        k = max(1, round((pi - phi) / (pi / 2) * per90))
        for j in range(k + 1): out.append(Vector((c.x + r * cos(a0 + da * j / k), c.y + r * sin(a0 + da * j / k))))
    return out

def offset_open(pts, t):
    """a band of thickness t (a number, or one per point) round an open polyline -> closed polygon"""
    n, L, R = len(pts), [], []
    perp = lambda d: Vector((-d.y, d.x))
    for i, p in enumerate(pts):
        d0 = (pts[i] - pts[i - 1]).normalized() if i > 0 else None
        d1 = (pts[i + 1] - pts[i]).normalized() if i < n - 1 else None
        if d0 is None: nrm, k = perp(d1), 1.0
        elif d1 is None: nrm, k = perp(d0), 1.0
        else: nrm = (perp(d0) + perp(d1)).normalized(); k = 1 / max(0.35, nrm.dot(perp(d0)))
        h = (t[i] if isinstance(t, (list, tuple)) else t) / 2 * k
        L.append(p + nrm * h); R.append(p - nrm * h)
    return [(v.x, v.y) for v in L + R[::-1]]

def clip_poly(poly, n, d):
    """keep the part of a polygon where p . n <= d"""
    out, n = [], Vector(n)
    for i, p in enumerate(poly):
        q = poly[(i + 1) % len(poly)]
        sp, sq = Vector(p).dot(n) - d, Vector(q).dot(n) - d
        if sp <= 0: out.append(tuple(p))
        if (sp <= 0) != (sq <= 0):
            k = sp / (sp - sq); out.append((p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k))
    return out

def grow_poly(poly, d):
    """offset a polygon outward by d (mitred)"""
    area = sum(p[0] * q[1] - q[0] * p[1] for p, q in zip(poly, poly[1:] + poly[:1]))
    sgn, n, out = (1 if area > 0 else -1), len(poly), []
    for i in range(n):
        p0, p1, p2 = Vector(poly[i - 1]), Vector(poly[i]), Vector(poly[(i + 1) % n])
        e0, e1 = (p1 - p0), (p2 - p1)
        if e0.length < 1e-7 or e1.length < 1e-7: continue
        n0, n1 = Vector((e0.y, -e0.x)).normalized() * sgn, Vector((e1.y, -e1.x)).normalized() * sgn
        m = (n0 + n1)
        if m.length < 1e-6: out.append(tuple(p1 + n0 * d)); continue
        m.normalize()
        out.append(tuple(p1 + m * (d / max(0.4, m.dot(n0)))))
    return out

# ------------------------------------------------------------------------------------------------ primitives
def rim(w, seg=1):
    return lambda ob: bevel(ob, lambda a, b, ang: w if abs(a.x - b.x) < 1e-5 and ang > radians(20) else 0, seg)

def slab(name, pts, hw, mat, bev=0.012, seg=1, per90=2, cx=0.0):
    """a side profile [(z, y, radius?)] extruded across x, its two rims bevelled: receivers, stocks, grips, magazines"""
    ob = prism(name, outline(pts, per90), cx - hw, cx + hw, "x", mat)
    if bev > 0: rim(bev, seg)(ob)
    return ob

def strap(name, path, t, hw, mat, cx=0.0, per90=3, bev=0.0):
    """a band of thickness t along an open side-profile path, extruded across x: guards, handles, wire stocks, slings"""
    ob = prism(name, offset_open(fillet_open(path, per90), t), cx - hw, cx + hw, "x", mat)
    if bev > 0: rim(bev)(ob)
    return ob

def band_slab(name, pts, hw, za, zb, mat, grow=0.005, slant=0.0, bev=0.012, seg=1, per90=2, cx=0.0):
    """a wrap round a slab between two stations (za <= z - slant * y <= zb), standing `grow` proud: tape, bands, pads"""
    poly = clip_poly(clip_poly(outline(pts, per90), (1, -slant), zb), (-1, slant), -za)
    if len(poly) < 3: raise ValueError(f"{name}: the band misses the slab")
    ob = prism(name, grow_poly(poly, grow), cx - hw - grow, cx + hw + grow, "x", mat)
    if bev > 0: rim(bev, seg)(ob)
    return ob

def tube(name, prof, y, mats, seg=12, x=0.0, phase=0.5):
    """lathe along the bore: prof [(z, r)], centre (x, y)"""
    return lathe(name, prof, x, y, "z", seg, mats if isinstance(mats, (list, tuple)) else [mats] * (len(prof) - 1), phase)

def disc(name, x0, x1, z, y, r, mat, seg=8, chamfer=0.0, face=None):
    """a pin, screw head, knob or medallion: a cylinder across x from x0 (buried) to x1 (the face)"""
    s = 1 if x1 > x0 else -1
    prof = [(x0, 0), (x0, r)] + ([(x1 - s * chamfer, r), (x1, r - chamfer)] if chamfer else [(x1, r)]) + [(x1, 0)]
    mats = [mat] * (len(prof) - 2) + [mat if face is None else face]
    return lathe(name, prof, z, y, "x", seg, mats, 0.0)

def rod(name, a, b, r, mat, seg=6, r2=None):
    """a cylinder between two points"""
    a, b = Vector(a), Vector(b); d = (b - a).normalized()
    u = d.orthogonal().normalized(); v = d.cross(u)
    bm = bmesh.new()
    rings = [[bm.verts.new(p + (u * cos(2 * pi * (k + 0.5) / seg) + v * sin(2 * pi * (k + 0.5) / seg)) * rr) for k in range(seg)] for p, rr in ((a, r), (b, r if r2 is None else r2))]
    for k in range(seg):
        bm.faces.new((rings[0][k], rings[0][(k + 1) % seg], rings[1][(k + 1) % seg], rings[1][k])).material_index = mat
    bm.faces.new(rings[0]).material_index = mat; bm.faces.new(rings[1][::-1]).material_index = mat
    return mk(name, bm)

def bead(name, c, r, mat, axis="x", seg=6, squash=1.0):
    """a small ball on an axis (3 rings): sight beads, abacus beads, knobs"""
    cx, cy, cz = c
    a0, c0, c1 = {"x": (cx, cz, cy), "z": (cz, cx, cy), "y": (cy, cx, cz)}[axis]
    h = r * squash
    return lathe(name, [(a0 - h, 0), (a0 - h * 0.62, r * 0.78), (a0 + h * 0.62, r * 0.78), (a0 + h, 0)], c0, c1, axis, seg, [mat] * 3, 0.0)

def plate(name, lo, hi, mat, bev=0.004):
    ob = box(name, lo, hi, mat)
    return bevel_all(ob, bev) if bev > 0 else ob

# ------------------------------------------------------------------------------------------------ fit parts
def saddle_sec(top, drop):
    """the Kingpin slide's top section down to `drop` below the flat"""
    w = 0.05 + 0.045 * drop / 0.07
    return [(w, top - drop), (0.05, top), (-0.05, top), (-w, top - drop)]

def saddle(name, z0, z1, top, mat, drop=0.07, bev=0.006):
    """a sight base: sink it into the receiver's top; the socket goes on its flat at y = top"""
    ob = prism(name, saddle_sec(top, drop), z0, z1, "z", mat)
    if bev > 0: bevel(ob, lambda a, b, ang: bev if abs(a.z - b.z) < 1e-5 and ang > radians(20) else 0)
    return ob

def rail_top(name, z0, z1, top, zs, mat, pitch=0.066, tooth=0.040, drop=0.075, tooth_mat=None):
    """a slotted top rail from z0 to z1 with the sight socket at zs: a bar, a solid block under the sight base, and
    teeth everywhere else. Returns the parts."""
    parts = [prism(name + "_bar", saddle_sec(top - 0.016, drop), z0, z1, "z", mat)]
    b0, b1 = max(z0 + 0.004, zs - 0.150), min(z1 - 0.004, zs + 0.125)
    blk = prism(name + "_blk", saddle_sec(top, 0.052), b0, b1, "z", mat)
    parts.append(bevel(blk, lambda a, b, ang: 0.005 if abs(a.z - b.z) < 1e-5 and ang > radians(20) else 0))
    tm = mat if tooth_mat is None else tooth_mat
    def teeth(a, b):
        n = int((b - a + (pitch - tooth)) / pitch)
        if n < 1: return
        pad = (b - a - (n * pitch - (pitch - tooth))) / 2
        for i in range(n):
            z = a + pad + i * pitch
            parts.append(prism(name + "_t", saddle_sec(top, 0.046), z, z + tooth, "z", tm))
    teeth(z0 + 0.012, b0 - (pitch - tooth)); teeth(b1 + (pitch - tooth), z1 - 0.012)
    return parts

LUG = [(-0.052, 0.051), (0.052, 0.051), (0.066, 0.024), (0.066, 0.015), (0.053, 0.0), (-0.053, 0.0), (-0.066, 0.015), (-0.066, 0.024)]
def rail_under(name, zs, ys, mat):
    """the Kingpin's accessory rail with its middle lug's underside at (0, ys, zs). The gun's underside there should be
    at ys + 0.039 (the bar sinks 7 mm into it), flat and clear from zs - 0.10 to zs + 0.21 for the laser module."""
    parts = [box(name + "_bar", (-0.05, ys + 0.015, zs - 0.094), (0.05, ys + 0.046, zs + 0.094), mat)]
    for dz in (-0.089, -0.022, 0.045):
        parts.append(prism(name + "_lug", [(x, ys + y) for x, y in LUG], zs + dz, zs + dz + 0.045, "z", mat))
    return parts

def rail_stub(name, zs, ys, mat):
    """the makeshift guns' rail: the bar alone, no lugs. The laser's clamp still closes round it."""
    return box(name, (-0.05, ys + 0.015, zs - 0.094), (0.05, ys + 0.046, zs + 0.094), mat)

def stripe_facets(ob, cx, cy, seg, mat, period=2, offset=0):
    """repaint every `period`-th side facet of a lathe turned about z: a revolver's flutes, a can's ribs"""
    for p in ob.data.polygons:
        if abs(p.normal.z) > 0.3: continue
        k = int(((atan2(p.center.y - cy, p.center.x - cx) % (2 * pi)) / (2 * pi / seg))) + offset
        if k % period == 0: p.material_index = mat
    return ob

def slide_shell(name, z0, z1, y0, top, mat, inlay=M.gold, hw=0.095, stripes=True, stations=None, band=(0.035, 0.051)):
    """a pistol slide with the Kingpin's section (its flat top is a sight saddle along its whole length): a faceted
    shell lofted along the bore, an inlay down the spine and a pinstripe along each flank"""
    def ring(z):
        R = [(hw, y0), (hw, y0 + band[0]), (hw, y0 + band[1]), (hw, top - 0.07), (0.050, top), (0.014, top)]
        return [(x, y, z) for x, y in R + [(-x, y) for x, y in reversed(R)]]
    L = z1 - z0
    ST = stations or [z0, z0 + 0.018, z0 + 0.19, z0 + L * 0.42, z0 + L * 0.62, z1 - 0.22, z1 - 0.122, z1 - 0.055, z1]
    n = len(ST)
    def matf(i, j):
        if inlay is not None and j == 5 and 2 <= i <= n - 4: return inlay
        if inlay is not None and stripes and j in (1, 9) and 2 <= i <= n - 3: return inlay
        return mat
    body = loft(name, [ring(z) for z in ST], matf)
    def w(a, b, ang):
        if ang < radians(12): return 0
        d = b - a; y = (a.y + b.y) / 2
        if abs(d.z) > 0.9 * d.length:
            if y < y0 + 0.015: return 0.004
            return 0.009 if y > top - 0.115 else 0
        if abs(d.z) < 1e-5:
            if a.z < z0 + 0.005: return 0.012
            if a.z > z1 - 0.005: return 0.007
        return 0
    return bevel(body, w)

def barrel(name, z0, z1, r, y, mat=M.steel, seg=12, steps=(), x=0.0, bore=M.dark):
    """a barrel from z0 to its crown at z1. steps: [(z, r)] changes of radius on the way. Whatever its radius, it ends
    in the Kingpin's crown (r 0.042 for the last 0.05, chamfered, a dark recessed bore), so the muzzle devices fit."""
    prof, mats, rr = [(z0, 0), (z0, r)], [mat], r
    for sz, sr in steps:
        prof += [(sz, rr), (sz, sr)]; mats += [mat, mat]; rr = sr
    if rr > 0.0421:
        prof += [(z1 - 0.050, rr), (z1 - 0.050, 0.042)]; mats += [mat, mat]
    prof += [(z1 - 0.008, 0.042), (z1, 0.035), (z1, 0.0245), (z1 - 0.027, 0.0225), (z1 - 0.027, 0)]
    mats += [mat, mat, bore, bore, bore]
    return lathe(name, prof, x, y, "z", seg, mats)

def mag_foot(name, zs, ys, mat, half=0.125, hw=0.072, bev=0.008):
    """a magazine baseplate under the socket point (0, ys, zs): the top inch stays visible above the extension's sleeve"""
    ob = prism(name, outline([(zs - half, ys - 0.0035, 0.014), (zs + half, ys - 0.0035, 0.014), (zs + half - 0.008, ys - 0.056, 0.016), (zs - half, ys - 0.056, 0.016)], 1), -hw, hw, "x", mat)
    return rim(bev)(ob)

# ------------------------------------------------------------------------------------------------ shared furniture
def pistol_grip(name, mat, dz=0.0, top=0.17, hw=0.078, bev=0.022, seg=2, bottom=-0.30, rake=0.14):
    """the firing hand's grip, where the Kingpin's is: front strap z 0.06..0.12, back strap z -0.21..-0.16"""
    f = lambda y: 0.064 + (y + 0.30) * rake + dz
    b = lambda y: -0.215 + (y + 0.30) * (rake + 0.03) + dz
    return slab(name, [(f(top), top), (f(bottom), bottom, 0.03), (b(bottom), bottom, 0.04), (b(-0.02), -0.02, 0.12), (b(top) - 0.012, top)], hw, mat, bev, seg)

def grip_wrap(name, mat, y0, y1, dz=0.0, hw=0.078, rake=0.14, grow=0.006, bev=0.022, bottom=-0.30):
    """tape (or a rubber sleeve) round the pistol grip between two heights"""
    f = lambda y: 0.064 + (y + 0.30) * rake + dz
    b = lambda y: -0.215 + (y + 0.30) * (rake + 0.03) + dz
    return slab(name, [(f(y1) + grow, y1), (f(y0) + grow, y0), (b(y0) - grow, y0), (b(y1) - grow, y1)], hw + grow, mat, bev, 2 if bev > 0.015 else 1)

def trigger_guard(name, mat, z0=0.085, z1=0.40, y_top=0.19, y_bot=-0.085, t=0.022, hw=0.034, r=0.06):
    """a strap from the receiver's underside ahead of the trigger, down, and back into the grip's front strap"""
    return strap(name, [(z1, y_top), (z1 - 0.004, y_bot, r), (z0 + 0.06, y_bot), (z0, y_bot + 0.004)], t, hw, mat)

def trigger(name, mat=M.dark, z=0.25, y=0.15, hw=0.019):
    P = [(z - 0.020, y + 0.03), (z + 0.022, y + 0.03), (z + 0.018, y - 0.05, 0.03), (z + 0.004, y - 0.115, 0.012), (z - 0.016, y - 0.125, 0.008), (z - 0.022, y - 0.112, 0.008), (z - 0.012, y - 0.06, 0.03)]
    return slab(name, P, hw, mat, 0.0, 1, 1)

def sight_post(name, z, y0, h, mat=M.dark, w=0.016, base=0.07, hood=False):
    """a ramped front post standing on y0"""
    return prism(name, [(z - base * 0.75, y0 - 0.006), (z + base * 0.25, y0 - 0.006), (z + base * 0.25, y0 + h * 0.45), (z + 0.012, y0 + h), (z - 0.012, y0 + h)], -w, w, "x", mat)

def sight_notch(name, z, y0, h, mat=M.dark, w=0.055, depth=0.045, gap=0.016):
    """a U-notch rear sight standing on y0"""
    return prism(name, [(-w, y0 - 0.006), (w, y0 - 0.006), (w, y0 + h - 0.01), (w - 0.01, y0 + h), (gap, y0 + h), (gap, y0 + h * 0.45), (-gap, y0 + h * 0.45), (-gap, y0 + h), (-w + 0.01, y0 + h), (-w, y0 + h - 0.01)],
                 z - depth / 2, z + depth / 2, "z", mat)

def sling_loop(name, z, y, mat=M.steel, r=0.03, t=0.012, hw=0.012, down=True, cx=0.0):
    """a D-ring hanging from (or standing on) a point"""
    s = -1 if down else 1
    return strap(name, [(z - r, y + s * -0.006), (z - r, y + s * r * 1.5, r * 0.8), (z + r, y + s * r * 1.5, r * 0.8), (z + r, y + s * -0.006)], t, hw, mat, cx, 2)

def round_top(name, z, y, mat_case=M.brass, mat_bullet=M.copper, r=0.026, length=0.10, seg=6):
    """the top round of a magazine, nose forward"""
    return [tube(name + "_case", [(z - length * 0.55, 0), (z - length * 0.55, r), (z + length * 0.1, r), (z + length * 0.1, 0)], y, mat_case, seg),
            tube(name + "_bullet", [(z + length * 0.05, 0), (z + length * 0.05, r * 0.92), (z + length * 0.3, r * 0.8), (z + length * 0.45, 0)], y, mat_bullet, seg)]

def mag_body(name, path, depth, hw, mat, chamfer=0.012, mats=None, flat=(True, True)):
    """a magazine lofted down a side-profile path [(z, y)] of its centre line; depth = front-to-back size (a number or one
    per station). The first station is up inside the well. flat: cut the top / bottom end level instead of square to
    the path (a level bottom is what mag_foot() sits under)."""
    pts = [Vector(p) for p in path]
    rings = []
    for i, p in enumerate(pts):
        d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()      # along the path (downward)
        nrm = Vector((-d.y, d.x))                                                   # toward the front (+z) for a downward path
        if nrm.x < 0: nrm = -nrm
        if (i == 0 and flat[0]) or (i == len(pts) - 1 and flat[1]): nrm = Vector((1, 0))
        h = (depth[i] if isinstance(depth, (list, tuple)) else depth) / 2
        sec = [(hw - chamfer, h), (hw, h - chamfer), (hw, -h + chamfer), (hw - chamfer, -h), (-hw + chamfer, -h), (-hw, -h + chamfer), (-hw, h - chamfer), (-hw + chamfer, h)]
        rings.append([(x, p.y + nrm.y * s, p.x + nrm.x * s) for x, s in sec])
    return loft(name, rings, (lambda i, j: mat) if mats is None else mats)

def magazine(name, path, depth, hw, mat, foot_mat=None, foot_half=None, foot_hw=None, round_at=None, mats=None, chamfer=0.012):
    """a box magazine with its baseplate (and its top round). Returns (parts, the socket_mag point)."""
    end = path[-1]
    ys = end[1] + 0.016
    d_end = depth[-1] if isinstance(depth, (list, tuple)) else depth
    parts = [mag_body(name, path, depth, hw, mat, chamfer, mats),
             mag_foot(name + "_foot", end[0], ys, mat if foot_mat is None else foot_mat, d_end / 2 + 0.014 if foot_half is None else foot_half, hw + 0.012 if foot_hw is None else foot_hw)]
    if round_at: parts += round_top(name + "_round", round_at[0], round_at[1])
    return parts, (0.0, ys, end[0])

def banana(name, zc, yc, x0, x1, mat=M.gold, scale=1.0, tilt=-26.0, n=6):
    """the Kingpin's banana, as a raised relief between x0 and x1 centred on (zc, yc)"""
    Rc, half, tl = 0.040 * scale, radians(42), radians(tilt)
    def centre(s):
        a = -half + 2 * half * s
        return Vector((Rc * sin(a), 0.036 * scale - Rc * cos(a))), Vector((cos(a), sin(a)))
    thick = lambda s: (0.0045 + 0.0135 * sin(pi * s ** 0.8) ** 0.6) * scale
    lo, hi = [], []
    for i in range(n + 1):
        p, t = centre(i / n); nn = Vector((-t.y, t.x))
        lo.append(p - nn * thick(i / n) / 2); hi.append(p + nn * thick(i / n) / 2)
    p, t = centre(1); nn = Vector((-t.y, t.x))
    stem = [p + t * 0.008 * scale - nn * 0.0028 * scale, p + t * 0.008 * scale + nn * 0.0028 * scale]
    prof = [(zc + q.x * cos(tl) - q.y * sin(tl), yc + q.x * sin(tl) + q.y * cos(tl)) for q in lo + stem + hi[::-1]]
    return prism(name, prof, x0, x1, "x", mat)

def medallion(name, zc, yc, x_face, side=1, r=0.047, rim_mat=M.gold, field=M.enamel, sink=0.012, seg=12):
    """the Kingpin's grip medallion on a flank: a rimmed disc with a recessed field. x_face = the flank it sits on."""
    s = side
    return lathe(name, [(x_face - s * sink, 0), (x_face - s * sink, r), (x_face + s * 0.0065, r), (x_face + s * 0.010, r - 0.004), (x_face + s * 0.010, r - 0.0095), (x_face + s * 0.0055, r - 0.0115), (x_face + s * 0.0055, 0)],
                 zc, yc, "x", seg, [rim_mat] * 5 + [field], 0.0)

def arc_path(z0, y0, length, lean, curve, n=5):
    """a magazine centre line: starts at (z0, y0) heading down, leaning forward by `lean` (radians) and bending
    forward by `curve` more over its length"""
    pts, z, y = [(z0, y0)], z0, y0
    for i in range(n):
        a = lean + curve * (i + 0.5) / n
        z += sin(a) * length / n; y -= cos(a) * length / n
        pts.append((z, y))
    return pts

def port(frame_ob, z0, z1, y0, y1, x_in=0.060, side=1):
    """cut an ejection port into a receiver's flank (side +1 = the right, the ejection side)"""
    lo, hi = (x_in, y0, z0), (0.2, y1, z1)
    if side < 0: lo, hi = (-0.2, y0, z0), (-x_in, y1, z1)
    return cut(frame_ob, box("port_cut", lo, hi, M.dark))

def scope(name, zc, y, length, mats=None, r=0.047, r_obj=0.070, r_eye=0.064, seg=12, rings=(-0.14, 0.14), ring_mat=M.gold, base_y=None,
          turret=True, body=M.gunmetal, obj_len=0.16, eye_len=0.12, ring_w=0.021, ped_mat=None):
    """a telescopic sight along the bore at height y, centred on zc: objective forward, eyepiece back, two rings on
    pedestals that stand on base_y. Returns the parts."""
    z0, z1 = zc - length / 2, zc + length / 2
    G, D, L = body, M.dark, M.lens
    parts = [tube(name + "_tube", [(z0 + 0.010, 0), (z0 + 0.010, r_eye - 0.016), (z0, r_eye - 0.015), (z0, r_eye - 0.006), (z0 + 0.007, r_eye), (z0 + eye_len, r_eye), (z0 + eye_len + 0.02, r),
                                   (z1 - obj_len - 0.03, r), (z1 - obj_len, r_obj), (z1 - 0.008, r_obj), (z1, r_obj - 0.008), (z1, r_obj - 0.014), (z1 - 0.012, r_obj - 0.015), (z1 - 0.012, 0)],
                  y, [L, D, G, G, G, G, G, G, G, G, D, D, L], seg)]
    for dz in rings:
        zr = zc + dz
        parts.append(tube(name + "_ring", [(zr - ring_w, 0), (zr - ring_w, r + 0.011), (zr - ring_w + 0.006, r + 0.018), (zr + ring_w - 0.006, r + 0.018), (zr + ring_w, r + 0.011), (zr + ring_w, 0)], y, ring_mat, seg))
        if base_y is not None:
            parts.append(plate(name + "_ped", (-0.029, base_y - 0.006, zr - 0.025), (0.029, y - r + 0.012, zr + 0.025), body if ped_mat is None else ped_mat, 0.005))
    if turret:
        parts.append(lathe(name + "_tt", [(y + r - 0.017, 0), (y + r - 0.017, 0.030), (y + r + 0.023, 0.030), (y + r + 0.031, 0.024), (y + r + 0.031, 0)], 0, zc, "y", 8, [G, G, ring_mat, ring_mat]))
        parts.append(lathe(name + "_ts", [(r - 0.017, 0), (r - 0.017, 0.028), (r + 0.031, 0.028), (r + 0.039, 0.022), (r + 0.039, 0)], zc, y, "x", 8, [G, G, ring_mat, ring_mat]))
    return parts
