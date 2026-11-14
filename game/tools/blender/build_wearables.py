"""Wearables and hand props as rigid meshes in socket space -> public/models/wearables.glb (one node per id).

Socket space (see build_monkey.py): origin at the socket, Blender +Z up, -Y forward, +X the character's left.
  head socket = top of the head; face socket = on the face between the eyes; back socket = upper back;
  hand socket = fist centre, -Y along the barrel, +Z gun-up (thumb side);
  body socket = the chest joint (body armour: the runtime skins it with the torso's weights, src/game/actors/rig.ts);
  ears socket = the point between the two ears, on the head bone (headsets; "<id>_nb" = the neckband variant the
  runtime swaps in under a hat).
Run: blender -b --factory-startup --python tools/blender/build_wearables.py -- [--sheet out.png]
"""
import os
import sys
import math
import json
import bpy
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bv_common as C  # noqa: E402
import monkey_parts as P  # noqa: E402
from bv_common import V, M, lathe, box, ell, tube, plate, disc_plate, qsphere, ring, loft, smooth, lerp  # noqa: E402

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ROOT = os.path.dirname(os.path.dirname(HERE))
C.clean_scene()
OUT = {}

# reference monkey head/torso for fitting (not exported)
head_ob = C.build("_head", P.head_cage(4), 1)
surfH = C.Surf(C.bvh_of([head_ob]))
face_ob = C.build("_face", P.face_plate(surfH), 0)
torso_ob = C.build("_torso", P.torso("suit"), 1)
bvhF = C.bvh_of([head_ob, face_ob])
surfF = C.Surf(bvhF)
TOP = P.HEAD_TOP
FACE0 = surfF.at(0, P.HC.z + P.EYE[1])[0]
BACK0 = V(0, -0.255, 0.80)
HCl = P.HC - TOP                       # head centre in head-socket space


def head_r(dz):
    """head half-widths (x, forward) at a height dz below the top, with a margin"""
    k = max(0.0, 1 - ((P.HR[2] - dz) / P.HR[2]) ** 2) ** 0.5
    return P.HR[0] * k, P.HR[1] * k


def tilt(m, deg, back=0.0, down=0.0):
    """tip a hat back by sliding it around the head centre (front brim up), then nudge it"""
    R = Matrix.Rotation(math.radians(-deg), 3, "X")
    return m.xf(lambda p: HCl + R @ (p - HCl) + Vector((0, back, -down)))


def add(name, pieces):
    ob = C.assemble(name, pieces, None, True)
    OUT[name] = ob
    return ob


def around_head(z, off, n=20, a0=0.0, a1=math.tau):
    """points around the head at height z (head-socket space origin = TOP) hugging the surface + off"""
    pts = []
    for i in range(n + (0 if abs(a1 - a0 - math.tau) < 1e-6 else 1)):
        a = a0 + (a1 - a0) * i / n
        d = Vector((math.sin(a), -math.cos(a), 0))
        o = Vector((0, P.HC.y, z)) + d * 2.0
        loc, nrm, _i, _d = bvhF.ray_cast(o, -d)
        pts.append(loc + d * off)
    return pts


# ================================================================ HATS (head socket space: origin = TOP)
SY = P.HR[1] / P.HR[0]
MH = 20                                     # segments around a hat (final resolution, no subdivision)


def dome(R, z0, H, angles=(18, 38, 57, 74), reg="hat", top=True):
    out = [(R * math.cos(math.radians(a)), z0 + H * math.sin(math.radians(a)), reg) for a in angles]
    if top:
        out.append((0.03, z0 + H, reg))
    return out


def skull(cut, scale, reg, n=5, lip=None):
    """profile hugging the head from `cut` below the top up to the crown"""
    prof = []
    for i in range(n):
        dz = cut * (1 - i / n)
        rx, _ = head_r(dz)
        prof.append((rx * scale + 0.004, -P.HR[2] + (P.HR[2] - dz) * scale, reg if i else lip))
    prof.append((0.03, -P.HR[2] + P.HR[2] * scale, reg))
    return prof


def liner(prof, r_in, z_in, reg, sy=None):
    """inside of a hat, welded to the outer shell at its first ring"""
    return lathe([(prof[0][0], prof[0][1], None), (r_in, z_in, reg), (0.03, z_in + 0.06, reg)], MH, SY if sy is None else sy).flip()


def hat_bowler():
    """the brand bowler: soft black, WIDE orange band, perched and tipped back"""
    rx, _ = head_r(0.09)
    prof = [(rx + 0.105, -0.092, None), (rx + 0.135, -0.076, "hat"), (rx + 0.125, -0.06, "hat"), (rx + 0.03, -0.07, "hat"), (rx + 0.014, -0.064, "hat"),
            (rx + 0.02, -0.058, "band"), (rx + 0.016, 0.034, "band"), (rx + 0.006, 0.04, "hat")] + dome(rx + 0.004, 0.04, 0.2)
    m = lathe(prof, MH, SY).add(liner(prof, rx - 0.01, -0.08, "hat"))
    return [(tilt(m, 15, 0.0, 0.006), 0, None)]


def hat_tophat():
    rx, _ = head_r(0.1)
    prof = [(0.46, -0.1, None), (0.485, -0.086, "hat"), (0.47, -0.07, "hat"), (rx + 0.0, -0.082, "hat"), (rx - 0.012, -0.076, "hat"),
            (rx - 0.012, 0.01, "red"), (rx - 0.02, 0.016, "hat"), (rx - 0.012, 0.25, "hat"), (rx + 0.012, 0.395, "hat"), (rx + 0.016, 0.42, "hat"),
            (rx - 0.02, 0.432, "hat"), (0.03, 0.43, "hat")]
    m = lathe(prof, MH, SY).add(liner(prof, rx - 0.03, -0.09, "hat"))
    return [(tilt(m, 7, 0.0, 0.01), 0, None)]


def hat_fedora():
    rx, _ = head_r(0.11)
    prof = [(0.5, -0.118, None), (0.54, -0.1, "khaki"), (0.52, -0.082, "khaki"), (rx + 0.03, -0.092, "khaki"), (rx + 0.008, -0.084, "khaki"),
            (rx + 0.012, -0.024, "dark"), (rx + 0.002, -0.018, "khaki"), (rx - 0.02, 0.07, "khaki"), (rx - 0.035, 0.14, "khaki"), (rx * 0.74, 0.195, "khaki"),
            (rx * 0.45, 0.2, "khaki"), (0.03, 0.18, "khaki")]
    m = lathe(prof, MH, SY)

    def pinch(p):
        if p.z > 0.02:
            k = smooth(0.02, 0.2, p.z)
            front = smooth(0.0, -0.3, p.y)
            return Vector((p.x * (1 - 0.3 * k * front), p.y * (1 + 0.1 * k), p.z - 0.03 * k * max(0.0, 1 - (p.x / 0.09) ** 2)))
        r = math.hypot(p.x, p.y)
        if r > 0.4:                         # snap brim: front down, back up
            return Vector((p.x, p.y, p.z - 0.05 * (r - 0.4) / 0.14 * (-p.y / r)))
        return p
    m.add(liner(prof, rx - 0.01, -0.104, "khaki")).xf(pinch)
    return [(tilt(m, 10, 0.0, 0.012), 0, None)]


def hat_cap():
    cut = 0.3
    rx, rf = head_r(cut)
    prof = skull(cut, 1.05, "blue", 5, None)
    m = lathe(prof, MH, SY).add(liner(prof, rx * 0.9, -cut + 0.02, "blue"))
    # bill: a curved tongue out the front
    rings = []
    for t, w, dz in ((0.0, 0.33, 0.0), (0.45, 0.32, -0.012), (0.82, 0.26, -0.026), (1.0, 0.16, -0.034)):
        y0 = -(rf * 0.9 + 0.25 * t)
        rings.append([Vector((x * w, y0 + 0.12 * x * x * (1 - 0.4 * t), -cut + 0.035 + dz + 0.011 * sgn_ - 0.03 * x * x))
                      for x, sgn_ in ((-1, 0), (-0.55, 1), (0, 1), (0.55, 1), (1, 0), (0.55, -1), (0, -1), (-0.55, -1))])
    bill = loft(rings, "blue", Vector((0, -rf * 0.8, -cut + 0.035)), Vector((0, -(rf * 0.9 + 0.262), -cut - 0.002)))
    btn = ell(2, Vector((0, 0, 0.022)), (0.035, 0.035, 0.018), "white")
    badge = ell(2, Vector((0, -rf * 0.93, -0.17)), (0.07, 0.025, 0.055), "banana")
    return [(tilt(m, 5, 0.01), 0, None), (tilt(bill, 5, 0.01), 0, None), (tilt(btn, 5, 0.01), 0, None), (tilt(badge, 5, 0.01), 0, None)]


def hat_hardhat():
    cut = 0.25
    rx, rf = head_r(cut)
    prof = [(rx + 0.045, -cut - 0.01, None), (rx + 0.105, -cut + 0.0, "yellow"), (rx + 0.1, -cut + 0.018, "yellow"), (rx * 1.07 + 0.012, -cut + 0.026, "yellow")] + skull(cut - 0.04, 1.075, "yellow", 4, "yellow")
    m = lathe(prof, MH, SY).add(liner(prof, rx * 0.95, -cut + 0.03, "yellow"))
    m.xf(lambda p: Vector((p.x, p.y - 0.07 * smooth(-0.1, -0.5, p.y) * (p.z < -cut + 0.03), p.z)))
    ridge = tube([Vector((0, -0.43, -0.13)), Vector((0, -0.33, 0.045)), Vector((0, -0.12, 0.125)), Vector((0, 0.12, 0.125)), Vector((0, 0.33, 0.045)), Vector((0, 0.43, -0.13))],
                 [0.03, 0.048, 0.052, 0.052, 0.048, 0.03], 6, "yellow", up=Vector((1, 0, 0)), flat=0.5)
    return [(tilt(m, 4), 0, None), (tilt(ridge, 4), 0, None)]


def hat_pith():
    rx, _ = head_r(0.13)
    prof = [(0.5, -0.2, None), (0.535, -0.185, "khaki"), (0.5, -0.16, "khaki"), (rx + 0.04, -0.105, "khaki"), (rx + 0.02, -0.092, "khaki"),
            (rx + 0.024, -0.04, "leather"), (rx + 0.012, -0.034, "khaki")] + dome(rx + 0.01, -0.034, 0.3, (20, 42, 62, 78), "khaki")
    m = lathe(prof, MH, 1.0).add(liner(prof, rx + 0.0, -0.12, "khaki", 1.0))
    m.xf(lambda p: Vector((p.x, p.y * (1.12 if p.z < -0.1 else 1.0), p.z)))
    knob = ell(2, Vector((0, 0, 0.28)), (0.04, 0.04, 0.035), "khaki")
    return [(tilt(m, 6), 0, None), (tilt(knob, 6), 0, None)]


def hat_beanie():
    cut = 0.3
    rx, _ = head_r(cut)
    r1, _ = head_r(cut - 0.11)
    prof = [(rx + 0.02, -cut - 0.012, None), (rx + 0.055, -cut + 0.0, "pink"), (rx + 0.062, -cut + 0.05, "pink"), (r1 * 1.05 + 0.05, -cut + 0.1, "pink"),
            (r1 * 1.05 + 0.018, -cut + 0.112, "pink")] + skull(cut - 0.115, 1.055, "green", 4, "green")
    m = lathe(prof, MH, SY).add(liner(prof, rx * 0.94, -cut + 0.03, "pink"))
    pom = ell(3, Vector((0, 0, 0.085)), (0.085, 0.085, 0.08), "white")
    return [(tilt(m, 6, 0.01), 0, None), (tilt(pom, 6, 0.01), 0, None)]


def hat_crown():
    rx, _ = head_r(0.1)
    r0 = rx * 0.82
    n = 20
    rings = []
    for r, z, spike in ((r0 + 0.004, -0.085, 0), (r0 + 0.014, -0.06, 0), (r0 + 0.014, -0.0, 0), (r0 + 0.03, 0.09, 1), (r0 + 0.002, 0.09, 1), (r0 - 0.012, 0.0, 0), (r0 - 0.014, -0.085, 0)):
        pts = []
        for k in range(n):
            a = math.tau * k / n
            up = (0.11 if k % 4 == 0 else (-0.04 if k % 4 == 2 else 0.0)) * spike
            pts.append(Vector((r * math.sin(a), -r * math.cos(a) * 0.95, z + up)))
        rings.append(pts)
    rings.append(rings[0])
    pieces = [(tilt(loft(rings, "gold"), 8), 0, None, True)]
    for k in range(5):
        a = math.tau * k / 5
        g = ell(2, Vector((r0 * 1.03 * math.sin(a), -r0 * 0.98 * math.cos(a), -0.03)), (0.026, 0.026, 0.03), "red" if k % 2 == 0 else "blue")
        pieces.append((tilt(g, 8), 0, None, True))
    return pieces


# ================================================================ FACE GEAR (face socket space: subtract FACE0)
EX, EZ = P.EYE[0], P.HC.z + P.EYE[1]


def _lens(sx, rfn, lift, reg, n=4, ox=0.0, oz=0.0, dome=0.012):
    """lens disc floating in front of an eye, following the face"""
    cx, cz = sx * (EX + ox), EZ + oz
    return disc_plate(surfF, cx, cz, rfn, n, lambda x, z, rr: lift + dome * (1 - rr * rr), reg, sink=-(lift - 0.012), rows=None)


def _frame(sx, rfn, lift, reg, r=0.011, n=12, ox=0.0, oz=0.0):
    cx, cz = sx * (EX + ox), EZ + oz
    pts = []
    for k in range(n + 1):
        a = math.tau * k / n
        R = rfn(a)
        p, nn = surfF.at(cx + R * math.cos(a), cz + R * math.sin(a))
        pts.append(p + nn * lift)
    return tube(pts[:-1] + [pts[0]], [r] * (n + 1), 4, reg, up=Vector((0, -1, 0)), cap0=False, cap1=False)


def _bridge(lift, reg, z=0.012, w=0.07, r=0.011):
    pts = [surfF.at(x, EZ + z)[0] + surfF.at(x, EZ + z)[1] * lift for x in (-w, -w / 2, 0, w / 2, w)]
    return tube(pts, [r] * 5, 4, reg, up=Vector((0, 0, 1)))


def _temples(lift, reg, x0, r=0.011):
    m = M()
    for sx in (1, -1):
        p0 = surfF.at(sx * x0, EZ + 0.01)[0] + surfF.at(sx * x0, EZ + 0.01)[1] * lift
        pts = [p0] + [q for q in around_head(EZ + 0.012, 0.02, 6, sx * 0.62, sx * 1.75)]
        m.add(tube(pts, [r] * len(pts), 4, reg, up=Vector((0, 0, 1))))
    return m


def face_local(m):
    return m.move(-FACE0)


def g_shades():
    """the brand wayfarers: wide trapezoid lenses, thick black frame, lenses nearly meeting at a chunky bridge"""
    def rfn(a, sx=1):
        c, sn = math.cos(a) * sx, math.sin(a)
        w = 0.132 * (1 + 0.1 * sn) * (1 + 0.06 * max(0.0, c) * max(0.0, sn))      # wider along the top, outer corner flicks up
        return 1.0 / ((abs(c) / w) ** 4 + (abs(sn) / 0.094) ** 4) ** 0.25
    pcs = []
    for sx in (1, -1):
        r2 = (lambda a, sx=sx: rfn(a, sx))
        pcs.append((face_local(_lens(sx, r2, 0.046, "lens", 6, 0.008, -0.002, 0.016)), 0, None, True))
        pcs.append((face_local(_frame(sx, r2, 0.042, "hat", 0.021, 16, 0.008, -0.002)), 0, None))
    pcs.append((face_local(_bridge(0.048, "hat", 0.034, 0.04, 0.024)), 0, None))
    pcs.append((face_local(_temples(0.03, "hat", 0.295, 0.018)), 0, None))
    return pcs


def g_aviators():
    rfn = lambda a: 0.1 * (1 + 0.16 * max(0.0, -math.sin(a + 0.25)) - 0.1 * max(0.0, math.sin(a)))
    pcs = []
    for sx in (1, -1):
        r2 = (lambda a, sx=sx: rfn(a if sx > 0 else math.pi - a))
        pcs.append((face_local(_lens(sx, r2, 0.038, "green", 6, 0.006, -0.012)), 0, None, True))
        pcs.append((face_local(_frame(sx, r2, 0.036, "gold", 0.007, 12, 0.006, -0.012)), 0, None, True))
    pcs.append((face_local(_bridge(0.038, "gold", 0.03, 0.062, 0.007)), 0, None, True))
    pcs.append((face_local(_bridge(0.038, "gold", 0.0, 0.058, 0.006)), 0, None, True))
    pcs.append((face_local(_temples(0.03, "gold", 0.25, 0.007)), 0, None, True))
    return pcs


def g_monocle():
    rfn = lambda a: 0.088
    pcs = [(face_local(_lens(-1, rfn, 0.036, "glass", 4)), 0, None, True), (face_local(_frame(-1, rfn, 0.034, "gold", 0.012, 12)), 0, None, True)]
    # chain down to the collar side
    p0 = surfF.at(-EX - 0.085, EZ - 0.02)[0] + surfF.at(-EX - 0.085, EZ - 0.02)[1] * 0.03
    pts = [p0 + Vector((-0.02 * t, 0.02 * t, -0.36 * t + 0.1 * t * (1 - t))) for t in (0, 0.25, 0.5, 0.75, 1.0)]
    pcs.append((face_local(tube(pts, [0.008] * 5, 4, "chain", up=Vector((1, 0, 0)))), 0, None, True))
    return pcs


def g_eyepatch():
    rfn = lambda a: 0.092 * (1 + 0.12 * max(0.0, -math.sin(a)))
    pcs = [(face_local(disc_plate(surfF, EX, EZ - 0.006, rfn, 6, lambda x, z, rr: 0.03 + 0.012 * (1 - rr * rr), "dark", sink=0.0, rows=[0, 0.4, 0.75, 1.0])), 0, None)]
    band = around_head(EZ + 0.04, 0.012, 14)
    band = [p + Vector((0, 0, 0.1 * (p.x / 0.5))) for p in band]          # strap runs diagonally
    pcs.append((face_local(tube(band + [band[0]], [0.012] * (len(band) + 1), 4, "dark", up=Vector((0, 0, 1)), flat=0.5, cap0=False, cap1=False)), 0, None))
    return pcs


def g_goggles():
    def rfn(a):
        c, s = abs(math.cos(a)), abs(math.sin(a))
        return 1.0 / ((c / 0.275) ** 4 + (s / 0.118) ** 4) ** 0.25
    lens = disc_plate(surfF, 0, EZ + 0.004, rfn, 8, lambda x, z, rr: 0.066 + 0.01 * (1 - rr * rr), "band", sink=-0.04, rows=[0, 0.3, 0.6, 0.86, 1.0])
    n = 16
    pts = []
    for k in range(n):
        a = math.tau * k / n
        R = rfn(a) * 1.02
        p, nn = surfF.at(R * math.cos(a), EZ + 0.004 + R * math.sin(a))
        pts.append(p + nn * 0.04)
    frame = tube(pts + [pts[0]], [0.034] * (n + 1), 4, "white", up=Vector((0, -1, 0)), cap0=False, cap1=False)
    band = around_head(EZ + 0.01, 0.014, 12, 0.75, math.tau - 0.75)
    strap = tube(band, [0.045] * len(band), 4, "cloth", up=Vector((0, 0, 1)), flat=0.22)
    return [(face_local(lens), 0, None, True), (face_local(frame), 0, None), (face_local(strap), 0, None)]


def g_heart():
    def rfn(a):
        x, y = math.cos(a), math.sin(a)
        # heart in polar form: notch on top, point at the bottom
        return 0.1 * (1 + 0.26 * abs(x) ** 0.8 * (y > -0.2) - 0.42 * max(0.0, y) ** 6 * (abs(x) < 0.45) - 0.16 * max(0.0, -y) * abs(x) + 0.2 * max(0.0, -y) ** 5)
    pcs = []
    for sx in (1, -1):
        pcs.append((face_local(_lens(sx, rfn, 0.04, "pink", 6, 0.006, 0.0, 0.016)), 0, None, True))
        pcs.append((face_local(_frame(sx, rfn, 0.037, "red", 0.011, 14, 0.006)), 0, None, True))
    pcs.append((face_local(_bridge(0.04, "red", 0.02, 0.058, 0.011)), 0, None, True))
    pcs.append((face_local(_temples(0.03, "red", 0.26, 0.011)), 0, None, True))
    return pcs


def g_banditmask():
    """domino mask: two rings of cloth around the eyes that merge in the middle, tied at the back"""
    m = M()
    nseg, nr = 16, 3
    for sx in (1, -1):
        g = []
        for j in range(nr + 1):
            row = []
            for k in range(nseg):
                a = math.tau * k / nseg
                c, s = math.cos(a), math.sin(a)
                r_in = 0.058 * (1 + 0.25 * abs(s))
                outer = 1.0 / ((abs(c) / 0.16) ** 3 + (abs(s) / 0.122) ** 3) ** (1 / 3)
                t = j / nr
                R = lerp(r_in, outer, t)
                p, nn = surfF.at(sx * EX + R * c, EZ + 0.006 + R * s)
                h = 0.026 if 0 < j < nr else (0.0 if j == nr else 0.012)
                row.append(len(m.v))
                m.v.append(p + nn * h)
            g.append(row)
        for j in range(nr):
            for k in range(nseg):
                f = (g[j][k], g[j][(k + 1) % nseg], g[j + 1][(k + 1) % nseg], g[j + 1][k])
                m.f.append(f)
                m.r.append(C.REG["dark"])
    C._orient(m, lambda c: Vector((0, -1, 0)))
    band = around_head(EZ + 0.01, 0.01, 12, 0.7, math.tau - 0.7)
    strap = tube(band, [0.05] * len(band), 4, "dark", up=Vector((0, 0, 1)), flat=0.2)
    back = band[len(band) // 2]
    knot = ell(2, back + Vector((0, 0.03, 0)), (0.05, 0.035, 0.045), "dark")
    tails = M()
    for sx in (1, -1):
        tails.add(tube([back + Vector((0, 0.03, 0)), back + Vector((sx * 0.07, 0.08, -0.09)), back + Vector((sx * 0.1, 0.1, -0.2))], [0.03, 0.035, 0.012], 4, "dark", up=Vector((1, 0, 0)), flat=0.35))
    return [(face_local(m), 0, None), (face_local(strap), 0, None), (face_local(knot), 0, None), (face_local(tails), 0, None)]


def g_bandana():
    """Peel Gang bandana over the muzzle, knotted behind the head (enemy prop, face socket)"""
    def rfn(a):
        c, s = abs(math.cos(a)), math.sin(a)
        top = 1.0 / ((c / 0.4) ** 4 + (abs(s) / 0.15) ** 4) ** 0.25
        return top if s > 0 else top * (1 + 0.75 * (-s) ** 1.5 * (1 - c) ** 1.2)
    m = disc_plate(surfF, 0, P.HC.z - 0.13, rfn, 6, lambda x, z, rr: 0.034, "red", sink=0.004, rows=[0, 0.45, 0.86, 1.0])
    m.reg_where("white", lambda p: abs(p.x) % 0.16 < 0.035 and P.HC.z - 0.33 < p.z < P.HC.z - 0.22)
    band = around_head(P.HC.z - 0.07, 0.012, 9, 0.85, math.tau - 0.85)
    strap = tube(band, [0.06] * len(band), 4, "red", up=Vector((0, 0, 1)), flat=0.2)
    back = band[len(band) // 2]
    knot = ell(2, back + Vector((0, 0.03, 0)), (0.055, 0.04, 0.05), "red")
    return [(face_local(m), 0, None), (face_local(strap), 0, None), (face_local(knot), 0, None)]


# ================================================================ BACK GEAR (back socket space: subtract BACK0)
def back_local(m):
    return m.move(-BACK0)


bvhT = C.bvh_of([torso_ob])


def torso_at(a, z, off):
    d = Vector((math.sin(a), -math.cos(a), 0))
    o = Vector((0, 0, z)) + d * 2.0
    loc, _n, _i, _d = bvhT.ray_cast(o, -d)
    return loc + d * off


def strap(pts_az, r=0.03, reg="leather2", flat=0.3):
    pts = [torso_at(a, z, o) for a, z, o in pts_az]
    return tube(pts, [r] * len(pts), 4, reg, up=Vector((0, 0, 1)), flat=flat)


def p_satchel():
    c = V(0.04, -0.355, 0.69)
    bag = box(c, (0.19, 0.085, 0.145), "leather")
    flap = C.rbox(c + Vector((0, 0.05, 0.055)), (0.198, 0.05, 0.1), 0.035, "leather2")
    buckle = C.rbox(c + Vector((0, 0.098, -0.02)), (0.035, 0.014, 0.04), 0.01, "gold", 2)
    # shoulder strap: from the bag, over the left shoulder, across the chest to the right hip and back
    st = strap([(math.pi + 0.5, 0.78, 0.03), (math.pi + 1.05, 0.9, 0.03), (math.pi + 1.45, 0.975, 0.03), (0.75, 0.93, 0.045), (0.2, 0.83, 0.06), (-0.5, 0.7, 0.045),
                (-1.2, 0.62, 0.03), (-1.9, 0.6, 0.03), (-2.5, 0.64, 0.03)], 0.034)
    return [(back_local(bag), 1, None), (back_local(flap), 0, None), (back_local(buckle), 0, None, True), (back_local(st), 0, None)]


def _pack_straps(reg):
    st = M()
    for sx in (1, -1):
        st.add(strap([(math.pi - sx * 0.55, 0.62, 0.03), (math.pi - sx * 1.2, 0.72, 0.028), (sx * 1.15, 0.86, 0.04), (sx * 1.45, 0.975, 0.03), (math.pi - sx * 0.75, 0.96, 0.03)], 0.03, reg))
    return st


def p_bigpack():
    c = V(0, -0.43, 0.8)
    body = box(c, (0.24, 0.15, 0.27), "green")
    roll = tube([c + Vector((-0.27, 0.0, 0.32)), c + Vector((-0.14, 0.0, 0.33)), c + Vector((0.14, 0.0, 0.33)), c + Vector((0.27, 0.0, 0.32))], [0.08, 0.09, 0.09, 0.08], 8, "khaki", up=Vector((0, 0, 1)))
    pk = M()
    for sx in (1, -1):
        pk.add(C.rbox(c + Vector((sx * 0.255, 0.01, -0.1)), (0.05, 0.1, 0.12), 0.035, "khaki"))
    front = C.rbox(c + Vector((0, 0.16, -0.08)), (0.16, 0.035, 0.13), 0.03, "khaki")
    cup = tube([c + Vector((0.3, 0.1, 0.14)), c + Vector((0.3, 0.1, 0.02))], [0.045, 0.04], 6, "metal", up=Vector((1, 0, 0)))
    return [(back_local(body), 1, None), (back_local(roll), 0, None), (back_local(pk), 0, None), (back_local(front), 0, None), (back_local(cup), 0, None, True), (back_local(_pack_straps("khaki")), 0, None)]


def p_cratepack():
    c = V(0, -0.42, 0.76)
    crate = C.rbox(c, (0.25, 0.15, 0.2), 0.02, "wood")
    slats = M()
    for dz in (-0.1, 0.02, 0.14):
        slats.add(C.rbox(c + Vector((0, 0.0, dz)), (0.262, 0.162, 0.04), 0.012, "wood2", 2))
    ban = M()
    for x, a in ((-0.14, -0.5), (-0.05, -0.15), (0.05, 0.2), (0.14, 0.5)):
        b0 = c + Vector((x, 0.0, 0.2))
        pts = [b0 + Vector((math.sin(a) * 0.02 * k, -0.03 * k * (k - 3) * 0.3 - 0.02, 0.07 * k)) for k in range(5)]
        ban.add(tube(pts, [0.02, 0.04, 0.045, 0.038, 0.014], 5, "banana", up=Vector((1, 0, 0))))
    return [(back_local(crate), 0, None), (back_local(slats), 0, None), (back_local(ban), 0, None), (back_local(_pack_straps("leather2")), 0, None)]


def p_sack():
    """Peel Gang loot sack slung on the back (enemy prop, back socket)"""
    c = V(0.02, -0.45, 0.74)

    def sh(q):
        k = 1 + 0.14 * math.sin(q.x * 4 + 1) * math.sin(q.z * 3) + 0.25 * max(0.0, -q.z) ** 2
        return c + Vector((q.x * 0.24 * k, q.y * 0.19 * k, q.z * 0.25 - 0.03 * (1 - abs(q.x))))
    bag = qsphere(3, "prop").xf(sh)
    neck = tube([c + Vector((0, 0, 0.2)), c + Vector((0.0, -0.01, 0.27)), c + Vector((0.0, -0.01, 0.31)), c + Vector((0.02, -0.02, 0.37))], [0.11, 0.062, 0.062, 0.095], 6, "prop", up=Vector((1, 0, 0)))
    neck.reg_where("prop2", lambda p: abs(p.z - (c.z + 0.29)) < 0.03)                 # the rope tie
    st = strap([(math.pi - 0.4, 0.86, 0.03), (math.pi - 1.1, 0.95, 0.028), (1.2, 0.965, 0.035), (0.3, 0.8, 0.045), (-0.9, 0.64, 0.03), (-2.0, 0.6, 0.03), (-2.6, 0.66, 0.03)], 0.024, "prop2", 0.6)
    bag.reg_where("prop2", lambda p: p.y > c.y + 0.1 and abs(p.x - c.x - 0.06) < 0.09 and abs(p.z - c.z + 0.04) < 0.09)     # sewn patch
    return [(back_local(bag), 0, None), (back_local(neck), 0, None), (back_local(st), 0, None)]


# ================================================================ G1-23 LOOT GEAR
# Original pieces for the five equipment slots (head, face, body, back, ears). Style: chunky, bevelled, flat colour
# regions that read from the 55 deg / 40 u game camera.
BODY0 = V(0, 0, 0.78)                  # body socket = the chest joint
EARS0 = V(0, -0.035, 1.425)            # ears socket = between the ears
EAR_C = V(0.585, -0.035, P.HC.z + 0.025)                 # left ear centre (monkey_parts.ear)
EAR_N = Matrix.Rotation(math.radians(-12), 3, "Z") @ Vector((0, -1, 0))     # the way the left ear's dish faces


def body_local(m):
    return m.move(-BODY0)


def ears_local(m):
    return m.move(-EARS0)


def mirx(p):
    return Vector((-p.x, p.y, p.z))


def wrap(zb, zt, off, reg, na=24, nz=5, a0=0.0, a1=None, edge=0.16, aedge=0.07, sink=0.006):
    """a panel wrapped round the torso, at final resolution. a0..a1 = angle range (0 = front, pi/2 = the character's
    left, pi = back); a1 None = a closed ring. zb(a), zt(a) = bottom / top height; off(a, t, z) = lift off the suit;
    reg(a, t, z) = colour region of a cell. The border rows (and the end columns of an open panel) sink into the suit,
    which gives the slab a thick rounded edge and leaves no gap."""
    closed = a1 is None
    m, g = M(), []
    for i in range(na if closed else na + 1):
        a = a0 + math.tau * i / na if closed else lerp(a0, a1, C.tight(i, na, aedge))
        col = []
        for j in range(nz + 1):
            t = C.tight(j, nz, edge)
            z = lerp(zb(a), zt(a), t)
            border = j in (0, nz) or (not closed and i in (0, na))
            col.append(len(m.v))
            m.v.append(torso_at(a, z, -sink if border else off(a, t, z)))
        g.append(col)
    n = len(g)
    for i in range(n if closed else n - 1):
        i2 = (i + 1) % n
        for j in range(nz):
            m.f.append((g[i][j], g[i2][j], g[i2][j + 1], g[i][j + 1]))
            c = sum((m.v[k] for k in m.f[-1]), Vector()) / 4
            am = math.atan2(c.x, -c.y)
            tm = (C.tight(j, nz, edge) + C.tight(j + 1, nz, edge)) / 2
            m.r.append(C.REG[reg(am, tm, c.z)])
    return C._orient(m, lambda c: Vector((c.x, c.y, 0)))


def arm_dip(a, lo, hi, w=0.62):
    """top edge of a vest: hi on the chest and back, dipping to lo under the arms"""
    return lerp(hi, lo, smooth(w, 0.12, abs(abs(a) - math.pi / 2)))


def neck_dip(a, d, w=0.5):
    """V of a neckline at the front"""
    return d * smooth(w, 0.0, abs(a))


def side_thin(a, thick, thin=0.02, w=0.5):
    """vests are thick on the chest and back and thin under the arms, so the sleeves do not sink into them"""
    return lerp(thick, thin, smooth(w, 0.1, abs(abs(a) - math.pi / 2)))


def belt(z, off, r, reg, n=20, flat=0.55, a_phase=0.0):
    """a cord or strap right round the torso"""
    pts = [torso_at(a_phase + math.tau * k / n, z, off) for k in range(n)]
    return tube(pts + [pts[0]], [r] * (n + 1), 4, reg, up=Vector((0, 0, 1)), flat=flat, cap0=False, cap1=False)


def on_torso(a, z, off, half, r, reg, n=3, tilt=0.0):
    """a bevelled box sitting on the torso, facing out"""
    R = Matrix.Rotation(a, 3, "Z") @ Matrix.Rotation(tilt, 3, "X")
    return C.rbox(torso_at(a, z, off), half, r, reg, n, rot=R)


# our own 5-row stencil face (not a copy of any typeface)
STENCIL = {
    "W": ["#...#", "#...#", "#.#.#", "#.#.#", ".#.#."], "A": [".##.", "#..#", "####", "#..#", "#..#"], "R": ["###.", "#..#", "###.", "#.#.", "#..#"],
    "D": ["###.", "#..#", "#..#", "#..#", "###."], "E": ["####", "#...", "###.", "#...", "####"], "N": ["#..#", "##.#", "#.##", "#..#", "#..#"],
    "F": ["####", "#...", "###.", "#...", "#..."], "Y": ["#.#", "#.#", ".#.", ".#.", ".#."], "7": ["###", "..#", ".#.", ".#.", ".#."],
}


def stencil(pieces, text, z, px, lift, on, bg, back=True, a_c=None, pad=1, surf_off=0.0):
    """stencilled letters as a raised patch on a built shell (back of the torso, or the front). One quad per stencil
    pixel; the border ring sinks into the shell under it. pieces = the (M, levels...) list the patch sits on."""
    ob = C.assemble("_st", pieces, None, True)
    bvh = C.bvh_of([ob])
    rows = ["" for _ in range(5)]
    for ch in text:
        for r in range(5):
            rows[r] += STENCIL[ch][r] + "."
    rows = [r[:-1] for r in rows]
    w = len(rows[0])
    grid = ["." * (w + 2 * pad)] * pad + ["." * pad + r + "." * pad for r in rows] + ["." * (w + 2 * pad)] * pad
    nx, nz = len(grid[0]), len(grid)
    a_c = (math.pi if back else 0.0) if a_c is None else a_c
    rad = (torso_at(a_c, z, 0.0) - Vector((0, 0, z))).length
    m, g = M(), []
    for j in range(nz + 1):
        row = []
        for i in range(nx + 1):
            a = a_c + (i - nx / 2) * px / rad          # increasing angle = reading direction, seen from outside
            zz = z + (nz / 2 - j) * px
            d = Vector((math.sin(a), -math.cos(a), 0))
            loc, _n, _i, _d = bvh.ray_cast(Vector((0, 0, zz)) + d * 2.0, -d)
            if loc is None:
                raise ValueError("stencil %s runs off its shell at z=%.3f" % (text, zz))
            border = i in (0, nx) or j in (0, nz)
            row.append(len(m.v))
            m.v.append(loc + d * (-0.004 if border else lift) + d * surf_off)
        g.append(row)
    for j in range(nz):
        for i in range(nx):
            m.f.append((g[j][i], g[j + 1][i], g[j + 1][i + 1], g[j][i + 1]))
            m.r.append(C.REG[on if grid[j][i] == "#" else bg])
    bpy.data.objects.remove(ob)
    return C._orient(m, lambda c: Vector((c.x, c.y, 0)))


# ---------------------------------------------------------------- body armour (body socket space: subtract BODY0)
HEM = 0.527                              # vests reach down to the jacket hem


def leaf_blade(p, d, dn, ln, w, reg="leaf", rib="banana", curl=0.05):
    """a banana-leaf blade lying on the body: p = root, d = outward, dn = the way it points, pointed at both ends"""
    sd = d.cross(dn).normalized()
    lf = qsphere(2, reg).xf(lambda q: p + dn * ((q.z + 1) * 0.5 * ln) + sd * (q.x * w * (1 - abs(q.z) ** 1.7)) + d * (q.y * 0.022 - curl * (q.z + 1) * 0.5 * (q.z + 1) * 0.5))
    lf.reg_where(rib, lambda c: abs((c - p).dot(sd)) < w * 0.17 and (c - p).dot(d) > 0.0)
    return lf


def b_leaf_vest():
    """Banana-Leaf Vest: two greens woven in a basket check, a ragged leaf-tip hem, a V neck that keeps the tie showing,
    a collar of big leaves and a vine belt"""
    na = 24
    zt = lambda a: arm_dip(a, 0.72, 0.905) - neck_dip(a, 0.1)
    zb = lambda a: HEM - 0.012 + 0.038 * math.cos(a * na / 2)       # leaf tips
    off = lambda a, t, z: side_thin(a, 0.056, 0.026) + 0.008 * math.sin(a * na / 2) * math.sin(t * 9.0)
    weave = lambda a, t, z: "green" if (int((a % math.tau) / (math.tau / na) + 0.5) + int(t * 4.99)) % 2 == 0 else "leaf"
    m = wrap(zb, zt, off, weave, na, 5)
    leaves = M()
    for a, z, ln, w, rot in ((0.52, 0.9, 0.27, 0.1, 0.3), (-0.52, 0.9, 0.27, 0.1, -0.3), (1.05, 0.83, 0.2, 0.08, 0.75), (-1.05, 0.83, 0.2, 0.08, -0.75),
                             (math.pi - 0.5, 0.905, 0.27, 0.1, -0.3), (math.pi + 0.5, 0.905, 0.27, 0.1, 0.3), (math.pi, 0.91, 0.3, 0.1, 0.0)):
        d = Vector((math.sin(a), -math.cos(a), 0))
        u = Vector((0, 0, 1)).cross(d).normalized()
        leaves.add(leaf_blade(torso_at(a, z, 0.085), d, (Vector((0, 0, -1)) * math.cos(rot) + u * math.sin(rot)).normalized(), ln, w))
    vine = belt(0.612, 0.074, 0.026, "prop2", 20, 0.8)
    knot = ell(2, torso_at(0.0, 0.612, 0.1), (0.045, 0.035, 0.045), "prop2")
    return [(body_local(m), 0, None), (body_local(leaves), 0, None), (body_local(vine), 0, None), (body_local(knot), 0, None)]


def b_life_jacket():
    """Ferry Life Jacket: fat orange foam blocks, two black webbing straps with buckles, two front pockets, a faded
    FERRY stencil across the back. Rides high, so the tie goes under it."""
    band = lambda t: 0.17 < t < 0.3 or 0.56 < t < 0.69

    def off(a, t, z):
        seg = abs(math.sin(a * 3.0)) ** 0.35                        # grooves between the foam blocks (one down the front)
        return side_thin(a, 0.06 + 0.045 * seg, 0.034, 0.42) + (0.012 if band(t) else 0.0)
    m = wrap(lambda a: HEM + 0.008, lambda a: arm_dip(a, 0.74, 0.95, 0.55), off, lambda a, t, z: "hat" if band(t) else "band", 30, 7, edge=0.1)
    bits = M()
    for z in (0.626, 0.79):
        bits.add(on_torso(0.0, z, 0.084, (0.055, 0.024, 0.036), 0.012, "metal", 2))
    for sx in (1, -1):
        bits.add(on_torso(sx * 0.52, 0.705, 0.118, (0.074, 0.03, 0.05), 0.02, "band"))
        bits.add(on_torso(sx * 0.52, 0.742, 0.15, (0.08, 0.024, 0.02), 0.012, "red", 2))             # pocket flap
    st = stencil([(m, 0, None)], "FERRY", 0.838, 0.0185, 0.007, "khaki", "band")
    return [(body_local(m), 0, None), (body_local(bits), 0, None), (body_local(st), 0, None)]


def b_peel_jacket():
    """Peel Gang Padded Jacket: banana-yellow quilted rolls, a dark collar and zip, sewn-on patches (the gang wears
    whatever it could stitch back together)"""
    def off(a, t, z):
        return side_thin(a, 0.046 + 0.04 * abs(math.sin(t * math.pi * 4)) ** 0.55, 0.028, 0.42)

    def reg(a, t, z):
        return "prop2" if (t > 0.9 or abs(a) < 0.05) else "yellow"   # collar + zip
    m = wrap(lambda a: HEM, lambda a: arm_dip(a, 0.73, 0.93, 0.55) - neck_dip(a, 0.075, 0.42), off, reg, 28, 8, edge=0.07)
    patches = M()
    for a, z, hw, hh, rg, tw in ((0.55, 0.64, 0.085, 0.066, "prop2", 0.2), (-0.6, 0.79, 0.066, 0.056, "red", -0.25), (math.pi - 0.45, 0.67, 0.09, 0.07, "prop2", -0.15),
                                 (math.pi + 0.55, 0.85, 0.07, 0.056, "leather", 0.3), (-0.5, 0.6, 0.05, 0.04, "leather", 0.1)):
        R = Matrix.Rotation(a, 3, "Z") @ Matrix.Rotation(tw, 3, "Y")
        patches.add(C.rbox(torso_at(a, z, 0.082), (hw, 0.018, hh), 0.014, rg, 2, rot=R))
    pull = on_torso(0.0, 0.8, 0.095, (0.018, 0.012, 0.034), 0.008, "metal", 2)
    return [(body_local(m), 0, None), (body_local(patches), 0, None), (body_local(pull), 0, None)]


def b_bamboo_plate():
    """Bamboo Plate Vest: split bamboo slats side by side on a hide backing, front and back, lashed with two cords"""
    back = wrap(lambda a: HEM + 0.02, lambda a: arm_dip(a, 0.69, 0.84) - neck_dip(a, 0.05, 0.4), lambda a, t, z: side_thin(a, 0.03, 0.02), lambda a, t, z: "leather2", 20, 3)
    slats = M()
    for a_c in (0.0, math.pi):
        for k in range(-3, 4):
            a = a_c + k * 0.27
            top = (0.925 if a_c else 0.915) - 0.03 * abs(k) - (0.07 if (k == 0 and not a_c) else 0.0)
            zs = [HEM - 0.004 + 0.014 * (k % 2), 0.6, 0.675, 0.75, top - 0.04, top]
            pts = [torso_at(a, z, 0.06) for z in zs]
            sl = tube(pts, [0.038, 0.043, 0.043, 0.043, 0.043, 0.036], 5, "khaki", up=Vector((math.sin(a), -math.cos(a), 0)), flat=0.62)
            sl.reg_where("wood", lambda c, k=k: abs(((c.z + 0.035 * (k % 3)) % 0.12) - 0.06) < 0.016)       # the nodes
            slats.add(sl)
    cords = M()
    for z in (0.61, 0.79):
        cords.add(belt(z, 0.096 if z < 0.7 else 0.09, 0.024, "leather2", 20, 0.7))
    return [(body_local(back), 0, None), (body_local(slats), 0, None), (body_local(cords), 0, None)]


def shell_plate(a, z, ru, rv, h, seg=8, eyes=False):
    """one coconut half-shell on the body: a brown dome with the pale cut rim showing all round"""
    p = torso_at(a, z, 0.034)
    d = Vector((math.sin(a), -math.cos(a), 0))
    u = Vector((0, 0, 1)).cross(d).normalized()
    rings = [ring(p + d * hh, u, Vector((0, 0, 1)), ru * k, rv * k, seg) for k, hh in ((1.0, -0.034), (1.0, 0.014), (0.84, 0.03), (0.8, 0.044), (0.56, h * 0.84), (0.24, h))]
    m = loft(rings, ["vest2", "vest2", "prop2", "prop2", "prop2"], None, p + d * (h + 0.006))
    if eyes:
        for da, dz in ((0.0, 0.03), (-0.11, -0.025), (0.11, -0.025)):
            q = torso_at(a + da, z + dz, 0.034) + d * (h * 0.9 - 0.004)
            m.add(ell(2, q, (0.024, 0.016, 0.024), "nail", rot=Matrix.Rotation(a, 4, "Z")))
    return m


def b_coconut_cuirass():
    """Coconut Cuirass: big half-shells laced onto a leather harness, a chest shell over two belly shells (front and
    back), each with its white rim; the chest shell shows the three eyes"""
    har = wrap(lambda a: HEM + 0.006, lambda a: arm_dip(a, 0.7, 0.92) - neck_dip(a, 0.07, 0.4), lambda a, t, z: side_thin(a, 0.036, 0.022), lambda a, t, z: "leather2", 20, 3)
    plates = M()
    for a_c in (0.0, math.pi):
        for da, z, ru, rv, h, eyes in ((-0.36, 0.635, 0.13, 0.1, 0.075, False), (0.36, 0.635, 0.13, 0.1, 0.075, False), (-0.95, 0.66, 0.085, 0.085, 0.05, False),
                                       (0.95, 0.66, 0.085, 0.085, 0.05, False), (0.0, 0.79, 0.165, 0.115, 0.095, True)):
            plates.add(shell_plate(a_c + da, z, ru, rv, h, 10 if eyes else 8, eyes))
    lace = belt(0.71, 0.05, 0.016, "prop", 16, 0.7, 0.2)
    return [(body_local(har), 0, None), (body_local(plates), 0, None), (body_local(lace), 0, None)]


def b_warden_vest():
    """Warden's Kevlar: navy plate carrier with a high collar, a slate cummerbund, three belt pouches, a yellow name
    bar on the chest and WARDEN stencilled across the back"""
    def off(a, t, z):
        return side_thin(a, 0.066, 0.034, 0.42) + (0.012 if t > 0.86 else 0.0)

    def reg(a, t, z):
        return "cloth" if abs(abs(a) - math.pi / 2) < 0.52 or t < 0.13 else "navy"
    m = wrap(lambda a: HEM, lambda a: arm_dip(a, 0.72, 0.955, 0.5), off, reg, 24, 6, edge=0.1)
    bits = M()
    for a in (-0.5, 0.0, 0.5):
        bits.add(on_torso(a, 0.618, 0.108, (0.064, 0.036, 0.064), 0.018, "cloth", 2))
        bits.add(on_torso(a, 0.668, 0.138, (0.07, 0.03, 0.024), 0.012, "navy", 2))
        bits.add(on_torso(a, 0.652, 0.17, (0.015, 0.008, 0.015), 0.006, "banana", 2))
    bits.add(on_torso(0.3, 0.83, 0.08, (0.09, 0.012, 0.028), 0.008, "banana", 2))
    bits.add(on_torso(-0.34, 0.815, 0.086, (0.052, 0.02, 0.05), 0.014, "cloth"))                    # radio pouch
    st = stencil([(m, 0, None)], "WARDEN", 0.846, 0.0138, 0.008, "banana", "navy")
    return [(body_local(m), 0, None), (body_local(bits), 0, None), (body_local(st), 0, None)]


# ---------------------------------------------------------------- helmets (head socket space)
def hat_pot():
    """Cooking Pot: a dented steel pot worn upside down, rolled rim, long handle sticking out to the side"""
    cut = 0.25
    R = head_r(cut)[0] + 0.05
    prof = [(R + 0.014, -cut - 0.014, None), (R + 0.046, -cut + 0.004, "metal"), (R + 0.04, -cut + 0.034, "metal"), (R + 0.008, -cut + 0.044, "skin2"),
            (R + 0.004, -0.1, "skin2"), (R, 0.06, "skin2"), (R - 0.024, 0.105, "skin2"), (R - 0.07, 0.124, "skin2"), (R * 0.5, 0.128, "skin"), (0.03, 0.125, "skin")]
    m = lathe(prof, MH, 0.95).add(liner(prof, R - 0.03, -cut + 0.02, "skin", 0.95))
    m.xf(lambda p: Vector((p.x, p.y, p.z - 0.035 * math.exp(-((p.x + 0.3) ** 2 + (p.y + 0.28) ** 2) / 0.02) * (p.z > 0))))      # a dent
    ah = 2.25                                                    # handle direction: out to the character's left and back
    dirh = Vector((math.sin(ah), -math.cos(ah) * 0.95, 0.12)).normalized()
    h0 = Vector((math.sin(ah) * (R - 0.02), -math.cos(ah) * (R - 0.02) * 0.95, -cut + 0.085))
    handle = tube([h0, h0 + dirh * 0.14, h0 + dirh * 0.28, h0 + dirh * 0.5, h0 + dirh * 0.6], [0.036, 0.03, 0.04, 0.046, 0.034], 6, "hat", up=Vector((0, 0, 1)), flat=0.6)
    handle.reg_where("metal", lambda c: (c - h0).dot(dirh) < 0.15)
    lug = ell(2, Vector((-math.sin(ah) * (R + 0.01), math.cos(ah) * (R + 0.01) * 0.95, -cut + 0.1)), (0.045, 0.045, 0.034), "metal")   # the stub of the lost second handle
    return [(tilt(m, 8, 0.0, 0.0), 0, None, True), (tilt(handle, 8), 0, None, True), (tilt(lug, 8), 0, None, True)]


def hat_coconut():
    """Coconut Helmet: half a big coconut, dark husk, a rough broken edge with a thick white rim of flesh, the three
    eyes on top, a hide chin strap"""
    cut = 0.25
    rx, _ = head_r(cut)
    R, H, z0 = rx * 1.05 + 0.06, 0.45, -cut + 0.085
    prof = [(rx * 1.05, -cut - 0.01, None), (R + 0.006, -cut - 0.006, "vest2"), (R + 0.022, -cut + 0.03, "vest2"), (R + 0.012, z0, "vest2")] + \
        [(R * math.cos(math.radians(a)) ** 0.7, z0 + H * math.sin(math.radians(a)), "prop2") for a in (12, 28, 45, 62, 78)] + [(0.03, z0 + H, "prop2")]
    m = lathe(prof, MH, SY * 1.05).add(liner(prof, rx * 0.97, -cut + 0.03, "vest2"))
    m.xf(lambda p: Vector((p.x, p.y, p.z + 0.02 * math.sin(math.atan2(p.x, p.y) * 5) * smooth(z0 + 0.03, -cut - 0.01, p.z))))          # the broken edge
    eyes3 = M()
    for a in (0.0, 2.1, -2.1):
        eyes3.add(ell(2, Vector((0.095 * math.sin(a), -0.095 * math.cos(a) - 0.03, z0 + H - 0.016)), (0.046, 0.046, 0.022), "nail"))
    straps = M()
    for sx in (1, -1):
        pts = []
        for z in (TOP.z - cut + 0.04, TOP.z - 0.42, TOP.z - 0.58, TOP.z - 0.74, TOP.z - 0.86):
            d = Vector((sx * 0.955, -0.3, 0)).normalized()
            loc, _n, _i, _d = bvhF.ray_cast(Vector((0, P.HC.y, z)) + d * 2.0, -d)
            pts.append(loc + d * 0.014 - TOP)
        straps.add(tube(pts, [0.03] * len(pts), 4, "leather2", up=Vector((0, -1, 0)), flat=0.4))
    return [(tilt(m, 6), 0, None), (tilt(eyes3, 6), 0, None), (straps, 0, None)]


def hat_warden():
    """Warden's Riot Helmet: a tall prison-guard blue shell with a neck guard, a banana-yellow band, a stencilled W on
    the back, and a clear visor flipped up on the brow (so the face and any face gear stay clear)"""
    cut = 0.27
    rx, rf = head_r(cut)
    R, H, z0 = rx * 1.07 + 0.03, 0.34, -cut + 0.1
    prof = [(rx * 1.05, -cut - 0.008, None), (R - 0.006, -cut + 0.0, "navy"), (R, -cut + 0.04, "navy"), (R + 0.012, -cut + 0.052, "banana"), (R + 0.012, z0 - 0.012, "banana"), (R, z0, "navy")] + \
        [(R * math.cos(math.radians(a)), z0 + H * math.sin(math.radians(a)), "navy") for a in (16, 34, 52, 68, 80)] + [(0.03, z0 + H, "navy")]
    m = lathe(prof, MH, SY * 1.03).add(liner(prof, rx * 0.96, -cut + 0.03, "hat"))
    m.xf(lambda p: Vector((p.x, p.y + 0.07 * smooth(0.1, 0.45, p.y) * smooth(-cut + 0.1, -cut, p.z), p.z - 0.07 * smooth(0.15, 0.45, p.y) * smooth(-cut + 0.06, -cut, p.z))))  # neck guard
    # visor: a thin closed strip hinged at the temples, flipped up over the brow
    rings = []
    for k in range(11):
        a = lerp(-1.12, 1.12, k / 10)
        d = Vector((math.sin(a), -math.cos(a) * SY * 1.03, 0))
        front = math.cos(a * 1.3) ** 1.3
        lo = Vector((0, 0, -cut + 0.085 + 0.02 * (1 - front))) + d * (R + 0.02 + 0.03 * front)
        hi = lo + Vector((0, 0, 0.035 + 0.1 * front)) + d * (0.006 + 0.085 * front)
        t = (hi - lo).normalized()
        nrm = (d - t * d.dot(t)).normalized()
        rings.append([lo + nrm * 0.011, hi + nrm * 0.011, hi + t * 0.012, hi - nrm * 0.011, lo - nrm * 0.011, lo - t * 0.012])
    visor = loft(rings, "glass", sum(rings[0], Vector()) / 6, sum(rings[-1], Vector()) / 6)
    piv = M()
    for sx in (1, -1):
        piv.add(ell(2, Vector((sx * (R + 0.02) * math.sin(1.12), -(R + 0.02) * math.cos(1.12) * SY * 1.03, -cut + 0.115)), (0.04, 0.05, 0.05), "metal"))
    return [(tilt(m, 4), 0, None), (tilt(visor, 4), 0, None, True), (tilt(piv, 4), 0, None)]


def helmet_w(pieces):
    """the stencilled W on the back of the riot helmet (a raised patch, like the vest's)"""
    ob = C.assemble("_hw", [(pc[0], 0, None) for pc in pieces[:1]], None, True)
    bvh = C.bvh_of([ob])
    grid = [".......", ".#...#.", ".#...#.", ".#.#.#.", ".#.#.#.", "..#.#..", "......."]
    m, g, px = M(), [], 0.052
    for j in range(8):
        row = []
        for i in range(8):
            a = math.pi + (i - 3.5) * px / 0.47
            d = Vector((math.sin(a), -math.cos(a), 0))
            zz = -0.02 + (3.5 - j) * px * 0.82
            loc, _n, _i, _d = bvh.ray_cast(Vector((0, 0, zz)) + d * 2.0, -d)
            row.append(len(m.v))
            m.v.append(loc + d * (-0.004 if i in (0, 7) or j in (0, 7) else 0.008))
        g.append(row)
    for j in range(7):
        for i in range(7):
            m.f.append((g[j][i], g[j + 1][i], g[j + 1][i + 1], g[j][i + 1]))
            m.r.append(C.REG["banana" if grid[j][i] == "#" else "navy"])
    bpy.data.objects.remove(ob)
    return C._orient(m, lambda c: Vector((c.x, c.y, 0)))


def hat_warden_full():
    pcs = hat_warden()
    return pcs + [(helmet_w(pcs), 0, None)]


# ---------------------------------------------------------------- face: snorkel mask
def g_snorkel():
    """Snorkel Mask: one wide window in a blue rubber frame with a nose pocket, black strap, and the tube clipped to
    the strap by the left temple, orange tip standing clear of any hat brim"""
    def rfn(a):
        c, sn = abs(math.cos(a)), abs(math.sin(a))
        return 1.0 / ((c / 0.29) ** 3.2 + (sn / 0.135) ** 3.2) ** (1 / 3.2)
    cz = EZ - 0.012
    lens = disc_plate(surfF, 0, cz, rfn, 8, lambda x, z, rr: 0.07 + 0.012 * (1 - rr * rr), "glass", sink=-0.045, rows=[0, 0.3, 0.6, 0.86, 1.0])
    n = 18
    pts = []
    for k in range(n):
        a = math.tau * k / n
        R = rfn(a) * 1.03
        p, nn = surfF.at(R * math.cos(a), cz + R * math.sin(a))
        pts.append(p + nn * 0.045)
    frame = tube(pts + [pts[0]], [0.04] * (n + 1), 4, "blue", up=Vector((0, -1, 0)), cap0=False, cap1=False)
    nose = C.blob_on(surfF, 0.0, cz - 0.115, 0.075, 0.07, 0.07, 2, "blue", 0.2)
    band = around_head(EZ + 0.0, 0.014, 12, 0.8, math.tau - 0.8)
    strap = tube(band, [0.05] * len(band), 4, "hat", up=Vector((0, 0, 1)), flat=0.22)
    # the tube: from the cheek up past the temple; leans out so its top clears hat brims
    x0 = 0.55
    tpts = [Vector((x0 - 0.1, -0.3, P.HC.z - 0.2)), Vector((x0 - 0.02, -0.24, P.HC.z - 0.1)), Vector((x0 + 0.03, -0.2, P.HC.z + 0.06)), Vector((x0 + 0.075, -0.18, P.HC.z + 0.26)),
            Vector((x0 + 0.11, -0.16, P.HC.z + 0.46)), Vector((x0 + 0.13, -0.15, P.HC.z + 0.64)), Vector((x0 + 0.14, -0.15, P.HC.z + 0.72))]
    pipe = tube(tpts, [0.034, 0.036, 0.036, 0.036, 0.036, 0.04, 0.04], 6, regs=["blue", "blue", "blue", "blue", "band", "band"], up=Vector((0, -1, 0)))
    clip = ell(2, Vector((x0 + 0.0, -0.2, P.HC.z + 0.06)), (0.06, 0.05, 0.035), "hat")
    return [(face_local(lens), 0, None, True), (face_local(frame), 0, None), (face_local(nose), 0, None), (face_local(strap), 0, None), (face_local(pipe), 0, None), (face_local(clip), 0, None)]


# ---------------------------------------------------------------- ears: headsets (ears socket space)
def _cup(prof, sx=1, m=12):
    """a lathe along the ear's facing direction: profile [(radius, depth in front of the ear (negative = behind), region)]"""
    n = EAR_N if sx > 0 else mirx(EAR_N)
    c = EAR_C if sx > 0 else mirx(EAR_C)
    u = Vector((0, 0, 1)).cross(n).normalized()
    w = n.cross(u)
    mm = lathe([(r, d, rg) for r, d, rg in prof], m, 1.0)
    return mm.xf(lambda p: c + u * p.x + w * p.y + n * p.z)


def _cup_pt(sx, depth, up=0.0, side=0.0):
    """a point by an ear: depth in front of it (negative = behind), up, and side = outward from the head"""
    n = EAR_N if sx > 0 else mirx(EAR_N)
    c = EAR_C if sx > 0 else mirx(EAR_C)
    return c + n * depth + Vector((0, 0, up)) + Vector((sx * side, 0, 0))


def _over_band(r, reg, d_cap, n=11, a_end=1.22, off=0.03, flat=0.4):
    """headband over the bare head, from one front cap to the other"""
    yb = _cup_pt(1, d_cap).y
    pts = [_cup_pt(-1, d_cap, 0.0, -0.01), _cup_pt(-1, d_cap + 0.004, 0.13, -0.02)]
    for k in range(n):
        ph = lerp(-a_end, a_end, k / (n - 1))
        d = Vector((math.sin(ph), 0, math.cos(ph)))
        loc, _n, _i, _d = bvhF.ray_cast(Vector((0, yb, P.HC.z)) + d * 2.0, -d)
        pts.append(loc + d * off)
    pts += [_cup_pt(1, d_cap + 0.004, 0.13, -0.02), _cup_pt(1, d_cap, 0.0, -0.01)]
    return tube(pts, [r] * len(pts), 4, reg, up=Vector((0, -1, 0)), flat=flat)


def head_at(a, z, off):
    d = Vector((math.sin(a), -math.cos(a), 0))
    loc, _n, _i, _d = bvhF.ray_cast(Vector((0, P.HC.y, z)) + d * 2.0, -d)
    return loc + d * off


def _neck_band(r, reg, d_back, z=1.235, off=0.028, a_side=1.86, flat=0.5, n=14):
    """the same headset with the band dropped round the back of the head, from one rear shell to the other: it hugs
    the head all the way and stays clear of every hat and brim"""
    pts = [_cup_pt(1, d_back, 0.0, -0.02)]
    for k in range(n + 1):
        a = lerp(a_side, math.tau - a_side, k / n)
        pts.append(head_at(a, z + 0.165 * smooth(0.55, math.pi - a_side, abs(a - math.pi)), off))
    pts.append(_cup_pt(-1, d_back, 0.0, -0.02))
    return tube(pts, [r] * len(pts), 4, reg, up=Vector((0, 0, 1)), flat=flat)


# one lathe per ear, back to front: a small clamp plate behind the ear, an axle through it, then the foam pad and
# the driver cap in front (the ear sits between plate and pad)
WALK_CUP = [(0.02, -0.1, None), (0.06, -0.098, "hat"), (0.082, -0.08, "hat"), (0.075, -0.056, "hat"), (0.03, -0.05, "hat"), (0.03, 0.012, "hat"),
            (0.142, 0.016, "band"), (0.16, 0.042, "band"), (0.156, 0.078, "band"), (0.126, 0.094, "band"), (0.118, 0.096, "hat"),
            (0.112, 0.124, "hat"), (0.07, 0.136, "hat"), (0.064, 0.137, "metal"), (0.02, 0.142, "metal")]


def e_walkman(neck=False):
    """Walkman Headphones: fat orange foam pads under black driver caps, on a thin steel band"""
    def build():
        m = M()
        for sx in (1, -1):
            m.add(_cup(WALK_CUP, sx))
        band = _neck_band(0.022, "metal", -0.085) if neck else _over_band(0.026, "metal", 0.118)
        return [(ears_local(m), 0, None), (ears_local(band), 0, None)]
    return build


RADIO_CUP = [(0.02, -0.106, None), (0.09, -0.1, "green"), (0.12, -0.075, "green"), (0.11, -0.05, "green"), (0.03, -0.045, "green"), (0.03, 0.01, "hat"),
             (0.15, 0.014, "hat"), (0.168, 0.036, "hat"), (0.166, 0.06, "hat"), (0.15, 0.07, "green"), (0.156, 0.115, "green"),
             (0.13, 0.142, "green"), (0.06, 0.152, "green"), (0.02, 0.153, "hat")]


def e_radio(neck=False):
    """Radio Headset: olive ear cups with black cushions, a padded band, a stub aerial and a boom mic round to the mouth"""
    def build():
        m = M()
        for sx in (1, -1):
            m.add(_cup(RADIO_CUP, sx))
        band = _neck_band(0.028, "hat", -0.09) if neck else _over_band(0.036, "hat", 0.12, flat=0.45)
        b0 = _cup_pt(1, 0.135, -0.07, 0.02)
        mouth = surfF.at(0.12, P.HC.z + P.MOUTH_Z + 0.0)[0] + Vector((0, -0.09, 0))
        boom = tube([b0, b0 + Vector((-0.02, -0.1, -0.1)), lerp(b0, mouth, 0.55) + Vector((0.04, -0.1, -0.07)), mouth + Vector((0.08, -0.01, -0.01)), mouth],
                    [0.018, 0.016, 0.016, 0.016, 0.016], 4, "hat", up=Vector((0, 0, 1)))
        mic = ell(2, mouth, (0.048, 0.04, 0.04), "hat")
        a0 = _cup_pt(-1, -0.07, 0.07, 0.03)
        aerial = tube([a0, a0 + Vector((-0.03, 0.02, 0.16)), a0 + Vector((-0.07, 0.04, 0.36))], [0.016, 0.012, 0.01], 4, "metal", up=Vector((0, -1, 0)))
        tip = ell(2, a0 + Vector((-0.07, 0.04, 0.36)), (0.024, 0.024, 0.024), "red")
        return [(ears_local(m), 0, None), (ears_local(band), 0, None), (ears_local(boom), 0, None), (ears_local(mic), 0, None), (ears_local(aerial), 0, None), (ears_local(tip), 0, None)]
    return build


# ================================================================ HAND PROPS (hand socket space: -Y barrel, +Z gun-up)
def p_briefcase():
    c = Vector((0, -0.04, -0.3))
    body = C.rbox(c, (0.07, 0.3, 0.2), 0.035, "leather")
    body.reg_where("leather2", lambda p: abs(p.z - c.z) < 0.03 and abs(p.x) > 0.06)
    cl = M()
    for y in (-0.16, 0.08):
        cl.add(C.rbox(Vector((0, y, -0.105)), (0.078, 0.03, 0.026), 0.01, "gold", 2))
    handle = tube([Vector((0, -0.14, -0.1)), Vector((0, -0.13, -0.02)), Vector((0, -0.07, 0.012)), Vector((0, 0.0, 0.012)), Vector((0, 0.05, -0.02)), Vector((0, 0.06, -0.1))],
                  [0.02] * 6, 5, "dark", up=Vector((1, 0, 0)))
    return [(body, 0, None), (cl, 0, None, True), (handle, 0, None)]


def p_boomerang():
    pts = [Vector((0, 0.03, -0.07)), Vector((0, -0.02, 0.0)), Vector((0, -0.1, 0.07)), Vector((0, -0.2, 0.12)), Vector((0, -0.31, 0.14)), Vector((0, -0.42, 0.11)), Vector((0, -0.52, 0.04)), Vector((0, -0.6, -0.06))]
    rad = [0.028, 0.045, 0.056, 0.062, 0.063, 0.058, 0.046, 0.022]
    m = tube(pts, rad, 6, "banana", up=Vector((1, 0, 0)))
    m.xf(lambda p: Vector((p.x * 0.62, p.y, p.z)))
    tip = ell(2, pts[-1] + Vector((0, -0.012, -0.012)), (0.018, 0.022, 0.022), "prop2")
    stem = ell(2, pts[0] + Vector((0, 0.02, -0.02)), (0.02, 0.026, 0.03), "green")
    return [(m, 0, None), (tip, 0, None), (stem, 0, None)]


BUILD = {"bowler": hat_bowler, "tophat": hat_tophat, "fedora": hat_fedora, "cap": hat_cap, "hardhat": hat_hardhat, "pith": hat_pith,
         "beanie": hat_beanie, "crown": hat_crown, "shades": g_shades, "aviators": g_aviators, "monocle": g_monocle, "eyepatch": g_eyepatch,
         "goggles": g_goggles, "heartglasses": g_heart, "banditmask": g_banditmask, "satchel": p_satchel, "bigpack": p_bigpack,
         "cratepack": p_cratepack, "prop_briefcase": p_briefcase, "prop_boomerang": p_boomerang, "prop_sack": p_sack, "prop_bandana": g_bandana,
         # G1-23 loot gear
         "pot_helmet": hat_pot, "coconut_helmet": hat_coconut, "warden_helmet": hat_warden_full, "snorkel": g_snorkel,
         "leaf_vest": b_leaf_vest, "life_jacket": b_life_jacket, "peel_jacket": b_peel_jacket, "bamboo_plate": b_bamboo_plate,
         "coconut_cuirass": b_coconut_cuirass, "warden_vest": b_warden_vest, "sack": p_sack,
         "walkman": e_walkman(), "walkman_nb": e_walkman(True), "radio_headset": e_radio(), "radio_headset_nb": e_radio(True)}
SLOT = {"head": ("bowler", "tophat", "fedora", "cap", "hardhat", "pith", "beanie", "crown", "pot_helmet", "coconut_helmet", "warden_helmet"),
        "back": ("satchel", "bigpack", "cratepack", "prop_sack", "sack"), "hand": ("prop_briefcase", "prop_boomerang"),
        "body": ("leaf_vest", "life_jacket", "peel_jacket", "bamboo_plate", "coconut_cuirass", "warden_vest"),
        "ears": ("walkman", "walkman_nb", "radio_headset", "radio_headset_nb")}
slot_of = lambda name: next((k for k, v in SLOT.items() if name in v), "face")
only = ARGS[ARGS.index("--only") + 1].split(",") if "--only" in ARGS else list(BUILD)
for name in only:
    add(name, BUILD[name]())
for name, ob in OUT.items():
    C.bake_ao([ob], [ob], samples=20, dist=0.22, strength=0.9)
    C.write_uv_and_col(ob)
print("@@TRIS", json.dumps({n: C.tris(o) for n, o in OUT.items()}))

SOCK = {"head": TOP, "face": FACE0, "back": BACK0, "body": BODY0, "ears": EARS0}
ear_obs = []
RES = int(ARGS[ARGS.index("--res") + 1]) if "--res" in ARGS else 300
if "--sheet" in ARGS:
    out = ARGS[ARGS.index("--sheet") + 1]
    C.setup_studio()
    ear_obs = [C.build("_ears", P.ear("round").both(), 0), C.build("_arms", P.arm("suit").both(), 1)]
    # lay the wearables out on reference heads/torsos
    torso_ob.hide_render = True
    import subprocess
    files = []
    for name, ob in OUT.items():
        slot = slot_of(name)
        for o in OUT.values():
            o.hide_render = o is not ob
        ob.location = SOCK.get(slot, Vector((0, 0, 1.2)))
        head_ob.hide_render = face_ob.hide_render = slot not in ("head", "face", "ears")
        ear_obs[0].hide_render = slot not in ("head", "face", "ears")
        ear_obs[1].hide_render = slot != "body"
        torso_ob.hide_render = slot not in ("back", "body")
        ctr = {"head": (0, 0, 1.6), "face": (0, 0, 1.5), "back": (0, 0, 0.8), "hand": (0, -0.25, 1.0), "body": (0, 0, 0.76), "ears": (0, 0, 1.5)}[slot]
        az = {"head": 30, "face": 25, "back": 150, "hand": 70, "body": 25, "ears": 25}[slot]
        f = out.replace(".png", "_%s.png" % name)
        C.render_views(f, ctr, 4.2 if slot != "hand" else 3.0, [("a", az, 14), ("b", az + (150 if slot not in ("back",) else 60), 30)], res=(RES, RES))
        files.append(f)
        ob.location = (0, 0, 0)
    subprocess.run(["montage", *files, "-tile", "6x", "-geometry", "+2+2", "-background", "#222", out], check=True)
    for f in files:
        os.remove(f)

for o in [head_ob, face_ob, torso_ob] + ear_obs:
    bpy.data.objects.remove(o)
for o in OUT.values():
    o.hide_render = False
os.makedirs(os.path.join(HERE, "build"), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "build", "wearables.blend"))
path = os.path.join(ROOT, "public", "models", "wearables.glb")
C.export_glb(path, list(OUT.values()), anim=False)
print("@@GLB", path, os.path.getsize(path))
