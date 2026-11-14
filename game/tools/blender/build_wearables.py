"""Wearables and hand props as rigid meshes in socket space -> public/models/wearables.glb (one node per id).

Socket space (see build_monkey.py): origin at the socket, Blender +Z up, -Y forward, +X the character's left.
  head socket = top of the head; face socket = on the face between the eyes; back socket = upper back;
  hand socket = fist centre, -Y along the barrel, +Z gun-up (thumb side).
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
    rx, _ = head_r(0.09)
    prof = [(rx + 0.105, -0.092, None), (rx + 0.135, -0.076, "hat"), (rx + 0.125, -0.06, "hat"), (rx + 0.03, -0.07, "hat"), (rx + 0.014, -0.062, "hat"),
            (rx + 0.018, 0.0, "band"), (rx + 0.01, 0.006, "hat")] + dome(rx + 0.008, 0.006, 0.235)
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
    rfn = lambda a: 0.118 * (1 - 0.06 * abs(math.sin(a)))
    pcs = []
    for sx in (1, -1):
        pcs.append((face_local(_lens(sx, rfn, 0.046, "lens", 6, 0.0, -0.006, 0.02)), 0, None, True))
        pcs.append((face_local(_frame(sx, lambda a: rfn(a) * 0.99, 0.04, "hat", 0.02, 14, 0.0, -0.006)), 0, None))
    pcs.append((face_local(_bridge(0.046, "hat", 0.03, 0.05, 0.02)), 0, None))
    pcs.append((face_local(_temples(0.03, "hat", 0.27, 0.016)), 0, None))
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
         "cratepack": p_cratepack, "prop_briefcase": p_briefcase, "prop_boomerang": p_boomerang, "prop_sack": p_sack, "prop_bandana": g_bandana}
only = ARGS[ARGS.index("--only") + 1].split(",") if "--only" in ARGS else list(BUILD)
for name in only:
    add(name, BUILD[name]())
for name, ob in OUT.items():
    C.bake_ao([ob], [ob], samples=20, dist=0.22, strength=0.9)
    C.write_uv_and_col(ob)
print("@@TRIS", json.dumps({n: C.tris(o) for n, o in OUT.items()}))

SOCK = {"head": TOP, "face": FACE0, "back": BACK0}
if "--sheet" in ARGS:
    out = ARGS[ARGS.index("--sheet") + 1]
    C.setup_studio()
    # lay the wearables out on reference heads/torsos
    torso_ob.hide_render = True
    import subprocess
    files = []
    for name, ob in OUT.items():
        slot = "head" if name in ("bowler", "tophat", "fedora", "cap", "hardhat", "pith", "beanie", "crown") else "back" if name in ("satchel", "bigpack", "cratepack", "prop_sack") else "hand" if name in ("prop_briefcase", "prop_boomerang") else "face"
        for o in OUT.values():
            o.hide_render = o is not ob
        ob.location = SOCK.get(slot, Vector((0, 0, 1.2)))
        head_ob.hide_render = face_ob.hide_render = slot not in ("head", "face")
        torso_ob.hide_render = slot != "back"
        ctr = {"head": (0, 0, 1.6), "face": (0, 0, 1.5), "back": (0, 0, 0.8), "hand": (0, -0.25, 1.0)}[slot]
        az = {"head": 30, "face": 25, "back": 150, "hand": 70}[slot]
        f = out.replace(".png", "_%s.png" % name)
        C.render_views(f, ctr, 4.2 if slot != "hand" else 3.0, [("a", az, 14), ("b", az + (150 if slot != "back" else 60), 30)], res=(300, 300))
        files.append(f)
        ob.location = (0, 0, 0)
    subprocess.run(["montage", *files, "-tile", "6x", "-geometry", "+2+2", "-background", "#222", out], check=True)
    for f in files:
        os.remove(f)

for o in (head_ob, face_ob, torso_ob):
    bpy.data.objects.remove(o)
for o in OUT.values():
    o.hide_render = False
os.makedirs(os.path.join(HERE, "build"), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "build", "wearables.blend"))
path = os.path.join(ROOT, "public", "models", "wearables.glb")
C.export_glb(path, list(OUT.values()), anim=False)
print("@@GLB", path, os.path.getsize(path))
