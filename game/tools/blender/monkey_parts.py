"""The Bananaville monkey: every swappable part as a subdivision-surface mesh (see build_monkey.py).

Original design from the Shorts cast (BRAND.md): big round orange-brown head, peach heart-shaped face, big round
ears, chibi body. Slot naming: <slot>_<style>; the runtime merges one style per slot into a single skinned mesh.
"""
import math
from mathutils import Vector, Matrix
from bv_common import (M, V, REG, qsphere, ell, ring, loft, tube, plate, disc_plate, blob_on, frame_at, Surf, bvh_of,
                       build, smooth, lerp, tight, sgn)

# ---------------------------------------------------------------- design constants (Blender metres)
HC = V(0, 0.02, 1.40)                  # head centre (lowered 0.055 into the collar: Moo, "the head is floating")
HR = (0.53, 0.47, 0.46)               # head radii: x, forward, up
FACE_Z = -0.03                        # face plate centre, relative to HC.z
EYE = (0.152, 0.055)                  # eye centre (x, z rel HC)
BROW_Z, MUZ_Z, MOUTH_Z, NOSE_Z = 0.208, -0.165, -0.245, -0.105
EYE_SPACING = 0.15                    # morph range: +-15% of EYE x

# skeleton joints
J = dict(
    hips=V(0, 0, 0.50), spine=V(0, 0, 0.62), chest=V(0, 0, 0.78), neck=V(0, 0, 0.98), head=V(0, 0, 1.04),
    shoulder=V(0.275, 0, 0.925), elbow=V(0.425, 0.005, 0.70), wrist=V(0.53, 0.03, 0.48), fist=V(0.568, 0.042, 0.395),
    hip=V(0.145, 0, 0.46), knee=V(0.15, 0.012, 0.27), ankle=V(0.155, 0, 0.10), toe=V(0.165, 0.25, 0.035),
    ear=V(0.50, -0.03, 1.42), ear_tip=V(0.76, -0.05, 1.45),
)
TAIL = [V(0, -0.24, 0.445), V(0, -0.40, 0.41), V(0, -0.56, 0.405), V(0, -0.71, 0.47), V(0, -0.82, 0.60), V(0, -0.85, 0.78), V(0, -0.80, 0.93)]
HEAD_TOP = V(0, 0.02, HC.z + 0.46)


def head_pt(d):
    """head surface from a unit direction (Blender axes): a soft mochi shape, fuller cheeks, flatter chin"""
    low = smooth(0.15, -0.7, d.z)
    return HC + Vector((d.x * HR[0] * (1 + 0.075 * low), d.y * HR[1] * (1 + 0.03 * low * (d.y < 0)), d.z * HR[2] * (1 - 0.06 * low)))


def head_cage(n=4):
    return qsphere(n, "fur").xf(head_pt)


def neck(n=3):
    """a short fur neck from inside the collar up into the head, so no air shows between head and shoulders from any angle"""
    return qsphere(n, "fur").xf(lambda d: V(0, 0.005, 1.0) + Vector((d.x * 0.17, d.y * 0.15, d.z * 0.15)))


# ---------------------------------------------------------------- face plate
def _face_sdf(x, z):
    def circ(cx, cz, r):
        return math.hypot(x - cx, z - cz) - r

    def elli(cx, cz, rx, rz):
        k = math.hypot((x - cx) / rx, (z - cz) / rz)
        return (k - 1) * min(rx, rz)
    a, b, c = circ(0.165, 0.125, 0.205), circ(-0.165, 0.125, 0.205), elli(0, -0.09, 0.335, 0.205)

    def smin(p, q, k=0.075):
        h = max(k - abs(p - q), 0) / k
        return min(p, q) - h * h * k * 0.25
    return smin(smin(a, b, 0.05), c)


def face_r(th):
    lo, hi = 0.02, 0.7
    for _ in range(26):
        mid = (lo + hi) / 2
        if _face_sdf(mid * math.cos(th), mid * math.sin(th)) < 0:
            lo = mid
        else:
            hi = mid
    return lo


def face_plate(surf, n=14):
    cz = HC.z + FACE_Z

    def lift(x, z, rr):
        mz = HC.z + MUZ_Z
        return 0.016 + 0.082 * math.exp(-((x / 0.2) ** 2 + ((z - mz) / 0.125) ** 2))
    rows = [0, 0.17, 0.34, 0.51, 0.67, 0.81, 0.93, 1.0]
    return disc_plate(surf, 0, cz, face_r, n, lift, "face", sink=0.012, rows=rows)


# ---------------------------------------------------------------- eyes, lids, brows, mouth
EYE_STYLES = {
    #          ru     rv     rn     pupil highlight(s): (du, dv, r)
    "round":   (0.047, 0.066, 0.028, [(0.015, 0.026, 0.017)]),
    "sleepy":  (0.052, 0.062, 0.028, [(0.015, 0.004, 0.014)]),
    "sparkle": (0.064, 0.082, 0.034, [(0.02, 0.03, 0.025), (-0.022, -0.03, 0.013)]),
    "beady":   (0.032, 0.036, 0.022, [(0.009, 0.011, 0.01)]),
}
LID_OPEN = {"round": 0.06, "sleepy": 0.52, "sparkle": 0.05, "beady": 0.05}


def eyes(surf, style, dx=0.0):
    ru, rv, rn, hl = EYE_STYLES[style]
    m = M()
    for sx in (1, -1):
        x, z = sx * (EYE[0] + dx), HC.z + EYE[1]
        m.add(blob_on(surf, x, z, ru, rv, rn, 3, "pupil", 0.3))
        p, u, v, n = frame_at(surf, x, z)
        for du, dv, r in hl:
            c = p + u * du + v * dv
            # highlight sits on the eye dome
            k = max(0.0, 1 - (du / ru) ** 2 - (dv / rv) ** 2) ** 0.5
            c = c + n * (rn * (k - 0.3) + r * 0.25)
            m.add(qsphere(2, "white").xf(lambda q, c=c, r=r: c + u * (q.x * r) + v * (q.z * r) + n * (-q.y * r * 0.5)))
    return m


def lids(surf, style, closed, dx=0.0, nu=6, nv=4):
    """upper eyelids as patches on a shell just over the eye; closed 0..1 slides the lash edge down"""
    ru, rv, rn, _ = EYE_STYLES[style]
    m = M()
    f = lerp(LID_OPEN[style], 1.04, closed)
    k = lerp(1.16 if style == "sleepy" else 0.78, 1.16, closed)      # open lids hide inside the eye
    for sx in (1, -1):
        x, z = sx * (EYE[0] + dx), HC.z + EYE[1]
        p, u, v, n = frame_at(surf, x, z)
        c0 = p - n * (rn * 0.3)
        g = []
        for j in range(nv + 1):
            row = []
            for i in range(nu + 1):
                a = lerp(-1.0, 1.0, i / nu)                       # across the eye
                # latitude: from just behind the top edge down to the lash line
                lat = lerp(1.08, 1.0 - 2.0 * f, j / nv)             # 1 = top, -1 = bottom (in v)
                w = math.sqrt(max(0.0, 1 - min(1.0, abs(lat)) ** 2))
                vv = max(-1.0, min(1.0, lat))
                uu = a * max(w, 0.18) * 1.02
                nn = math.sqrt(max(0.0, 1 - min(1.0, uu * uu + vv * vv)))
                q = c0 + u * (uu * ru * k) + v * (vv * rv * k + (lat - vv) * rv) + n * (nn * rn * k + 0.004 * closed)
                row.append(len(m.v))
                m.v.append(q)
            g.append(row)
        for j in range(nv):
            for i in range(nu):
                fc = (g[j][i], g[j + 1][i], g[j + 1][i + 1], g[j][i + 1])
                m.f.append(fc if sx > 0 else fc)
                m.r.append(REG["dark"] if j == nv - 1 else REG["face"])
        # winding check against n
        base = len(m.f) - nu * nv
        a, b, c = [m.v[i] for i in m.f[base][:3]]
        if (b - a).cross(c - a).dot(n) < 0:
            for t in range(base, len(m.f)):
                m.f[t] = tuple(reversed(m.f[t]))
    return m


BROW_STYLES = {"bold": (0.088, 0.026, 0.022), "thin": (0.082, 0.013, 0.014), "bushy": (0.092, 0.036, 0.028)}


def brows(surf, style, tilt=0.0, dx=0.0):
    """tilt in radians: + = inner end down (scheming), - = inner end up (worried)"""
    m = M()
    if style == "none":
        return m
    ru, rv, rn = BROW_STYLES[style]
    for sx in (1, -1):
        x, z = sx * (EYE[0] + 0.004 + dx), HC.z + BROW_Z
        rot = sx * (0.16 + tilt)
        if style == "bushy":
            for k, (o, s) in enumerate(((-0.6, 0.8), (0.0, 1.0), (0.6, 0.72))):
                ox = x + sx * o * ru * 0.62 * math.cos(rot)
                oz = z + o * ru * 0.62 * math.sin(rot) * sx
                m.add(blob_on(surf, ox, oz, ru * 0.5, rv * s, rn * s, 2, "dark", 0.3, rot))
        else:
            m.add(blob_on(surf, x, z, ru, rv, rn, 2, "dark", 0.3, rot))
    return m


def _line(surf, pts, r, reg="dark", m=4, taper=True):
    """thin tube laid on the surface through (x, z) points"""
    path = []
    for x, z in pts:
        p, n = surf.at(x, z)
        path.append(p + n * (r * 0.25))
    rad = [r * (0.35 + 0.65 * math.sin(math.pi * i / (len(pts) - 1)) ** 0.6) if taper else r for i in range(len(pts))]
    return tube(path, rad, m, reg, up=Vector((0, -1, 0)))


def mouth(surf, style):
    z0, m = HC.z + MOUTH_Z, M()
    if style in ("smile", "toothy"):
        w, sag = 0.105, 0.04
        m.add(_line(surf, [(w * t, z0 + sag * (t * t) - sag * 0.4) for t in [i / 4 - 1 for i in range(9)]], 0.0125))
        if style == "toothy":
            for sx in (1, -1):
                m.add(blob_on(surf, sx * 0.026, z0 - sag * 0.4 - 0.03, 0.023, 0.03, 0.012, 2, "white", 0.2))
    elif style == "smirk":
        w = 0.1
        m.add(_line(surf, [(w * t, z0 - 0.01 + 0.03 * max(0, t) ** 1.5 + 0.012 * t) for t in [i / 4 - 1 for i in range(9)]], 0.0125))
    elif style == "grin":
        def rfn(th):
            c, s = math.cos(th), math.sin(th)
            return 0.118 * (1 - 0.62 * max(0.0, s)) * (1 - 0.3 * abs(s) * (s < 0))
        m.add(disc_plate(surf, 0, z0 + 0.012, rfn, 4, lambda x, z, rr: 0.006, "mouth", sink=0.004))
        m.add(plate(surf, [(-0.078, z0 + 0.0), (0.078, z0 + 0.0), (0.086, z0 + 0.026), (-0.086, z0 + 0.026)], 4, 2, 0.011, "white", sink=0.002, edge=0.2))
        m.add(blob_on(surf, 0, z0 - 0.03, 0.045, 0.022, 0.012, 2, "tongue", 0.3))
    elif style == "whistle":
        ring_pts = [(0.03 * math.cos(a), z0 + 0.012 + 0.032 * math.sin(a)) for a in [2 * math.pi * i / 10 for i in range(10)]]
        ring_pts.append(ring_pts[0])
        m.add(_line(surf, ring_pts, 0.013, "face", 4, taper=False))
        m.add(blob_on(surf, 0, z0 + 0.012, 0.022, 0.024, 0.01, 2, "mouth", 0.5))
    return m


def nostrils(surf):
    m = M()
    for sx in (1, -1):
        m.add(blob_on(surf, sx * 0.034, HC.z + NOSE_Z, 0.016, 0.02, 0.012, 2, "dark", 0.45))
    return m


def tuft():
    """scrappy hair tuft for wild monkeys"""
    m = M()
    for a, ln, tilt in ((0.0, 0.2, -0.25), (0.9, 0.15, 0.5), (-0.9, 0.16, -0.75)):
        base = HEAD_TOP + V(0.05 * math.sin(a * 2), -0.02, -0.03)
        tip = base + V(math.sin(tilt) * ln, -0.06, math.cos(tilt) * ln)
        mid = (base + tip) / 2 + V(math.sin(tilt) * 0.03, 0.03, 0)
        m.add(tube([base, (base + mid) / 2, mid, (mid + tip) / 2 + V(math.sin(tilt) * 0.01, 0.01, 0), tip], [0.05, 0.05, 0.042, 0.03, 0.012], 5, "fur2", up=Vector((0, -1, 0))))
    return m


# ---------------------------------------------------------------- ears
def ear(style):
    """left ear (+X); mirrored by the caller"""
    c = V(0.585, -0.035, HC.z + 0.025)
    R = Matrix.Rotation(math.radians(-12), 3, "Z")       # turn the ear face a little outward
    r_plane, thick = 0.215, 0.07

    def shape(q):
        x, y, z = q.x, q.y, q.z            # unit sphere: x lateral, y depth, z up
        if style == "pointy":
            k = max(0.0, x * 0.75 + z * 0.66)
            x, z = x * (1 + 0.35 * k * k), z * (1 + 0.55 * k * k)
        elif style == "floppy":
            x, z = x * 1.12, z * 1.22
        # dish the front
        front = max(0.0, -y)
        rim = math.hypot(x, z)
        yy = y * thick + (0.05 * front * smooth(1.0, 0.45, rim))
        p = Vector((x * r_plane, yy, z * r_plane))
        if style == "floppy":                 # fold the outer half down and forward
            b = smooth(0.25, 1.0, p.x / r_plane)
            ang = -1.15 * b
            px, pz = p.x - 0.07, p.z - 0.02
            p = Vector((0.07 + px * math.cos(ang) - pz * math.sin(ang) * 0.4, p.y - 0.05 * b, 0.02 + pz * (1 - 0.15 * b) + px * math.sin(ang)))
        return c + R @ p
    return qsphere(5, "fur").xf(shape)


def ear_inner(ear_ob, style):
    surf = Surf(bvh_of([ear_ob]), Vector((0.21, 1, 0)))
    c = ear_ob.matrix_world @ (sum((v.co for v in ear_ob.data.vertices), Vector()) / len(ear_ob.data.vertices))
    cx, cz = c.dot(surf.ux), c.dot(surf.uz)
    if style == "pointy":
        rfn = lambda th: 0.118 * (1 + 0.5 * max(0.0, math.cos(th - 0.72)) ** 3)
        cx, cz = cx + 0.012, cz + 0.012
    elif style == "floppy":
        rfn = lambda th: 0.105 * (1 + 0.25 * max(0.0, math.cos(th + 0.9)) ** 2)
        cx, cz = cx + 0.0, cz - 0.03
    else:
        rfn = lambda th: 0.128
    return disc_plate(surf, cx + 0.012, cz, rfn, 4, lambda x, z, rr: 0.004, "ear", sink=0.006, rows=[0, 0.62, 1.0])


# ---------------------------------------------------------------- body
def torso_profile(kind):
    """rows of (z, rx, rf, f_centre, region of the band BELOW this ring)"""
    if kind == "suit":
        return [(0.385, 0.17, 0.15, 0.0, None), (0.44, 0.265, 0.225, 0.0, "pants"), (0.492, 0.3, 0.255, 0.0, "pants"),
                (0.497, 0.338, 0.288, 0.004, "suit2"), (0.526, 0.354, 0.302, 0.008, "suit"), (0.60, 0.35, 0.303, 0.014, "suit"),
                (0.70, 0.325, 0.286, 0.014, "suit"), (0.80, 0.285, 0.256, 0.01, "suit"), (0.89, 0.24, 0.22, 0.005, "suit"),
                (0.955, 0.185, 0.178, 0.0, "suit"), (1.0, 0.125, 0.125, 0.0, "suit")]
    if kind == "tee":
        rows = [(0.385, 0.17, 0.15, 0.0, None), (0.44, 0.265, 0.225, 0.0, "pants"), (0.492, 0.3, 0.255, 0.0, "pants"),
                (0.497, 0.325, 0.278, 0.004, "stripeB")]
        zs = [0.545, 0.615, 0.685, 0.755, 0.825, 0.895, 0.955]
        for i, z in enumerate(zs):
            t = (z - 0.5) / 0.5
            rx = lerp(0.342, 0.15, smooth(0.0, 1.0, t) ** 1.25) + 0.012 * math.sin(math.pi * t)
            rows.append((z, rx, rx * 0.87, 0.012 * (1 - t), "stripeA" if i % 2 == 0 else "stripeB"))
        rows.append((1.0, 0.125, 0.125, 0.0, "fur"))
        return rows
    # fur: a plain pear
    return [(0.385, 0.17, 0.15, 0.0, None), (0.44, 0.27, 0.23, 0.0, "fur"), (0.51, 0.325, 0.28, 0.006, "fur"),
            (0.60, 0.345, 0.3, 0.014, "fur"), (0.70, 0.322, 0.284, 0.014, "fur"), (0.80, 0.282, 0.254, 0.01, "fur"),
            (0.89, 0.238, 0.218, 0.005, "fur"), (0.955, 0.185, 0.178, 0.0, "fur"), (1.0, 0.125, 0.125, 0.0, "fur")]


def torso(kind, m=None):
    m = m or (10 if kind == "suit" else 8)
    rows = torso_profile(kind)
    X, Y = Vector((1, 0, 0)), Vector((0, 1, 0))
    rings = [ring(V(0, fc, z), X, Y, rx, rf, m, 2.35) for z, rx, rf, fc, _ in rows]
    return loft(rings, [r[4] for r in rows[1:]], V(0, 0, 0.35), V(0, 0, 1.035))


def arm(kind):
    """left arm from inside the torso to the cuff"""
    S, E, W = J["shoulder"], J["elbow"], J["wrist"]
    d2 = (W - E).normalized()
    path = [V(0.19, 0, 0.925), S + V(0.006, 0, -0.012), E, W - d2 * 0.035, W + d2 * 0.012]
    if kind in ("suit", "vest"):                      # vest = shirt sleeves
        cloth = "suit" if kind == "suit" else "shirt"
        rad = [0.075, 0.104, 0.097, 0.104, 0.114] if kind == "suit" else [0.075, 0.1, 0.092, 0.098, 0.108]
        regs = [cloth] * 4
        m = tube(path, rad, 6, regs=regs, up=Vector((0, -1, 0)), cap0=True, cap1=False)
        # recessed shirt cuff + end cap (the last ring sits before the start-cap vertex)
        base = (len(path) - 1) * 6
        last = m.v[base:base + 6]
        cc = W + d2 * 0.012
        inner = [cc + (p - cc) * 0.8 + d2 * 0.004 for p in last]
        inner2 = [cc + (p - cc) * 0.74 + d2 * 0.03 for p in last]
        for rr, reg in ((inner, "suit2" if kind == "suit" else "shirt"), (inner2, "shirt")):
            st = len(m.v)
            m.v += rr
            for k in range(6):
                m.f.append((base + k, base + (k + 1) % 6, st + (k + 1) % 6, st + k))
                m.r.append(REG[reg])
            base = st
        ci = len(m.v)
        m.v.append(cc + d2 * 0.045)
        for k in range(6):
            m.f.append((base + k, base + (k + 1) % 6, ci))
            m.r.append(REG["shirt"])
        return m
    if kind == "tee":
        path = [path[0], path[1], lerp(S, E, 0.62), lerp(S, E, 0.7), W - d2 * 0.035, W + d2 * 0.012]
        rad = [0.075, 0.108, 0.112, 0.09, 0.084, 0.082]
        regs = ["stripeA", "stripeB", "fur", "fur", "fur"]
        return tube(path, rad, 6, regs=regs, up=Vector((0, -1, 0)))
    rad = [0.072, 0.098, 0.09, 0.085, 0.082]
    return tube(path, rad, 6, "fur", up=Vector((0, -1, 0)))


def hand():
    """left fist: a soft mitten with a thumb; the grip channel runs along the forward axis"""
    W, F = J["wrist"], J["fist"]
    d = (F - W).normalized()
    fw = (V(0, 1, 0) - d * V(0, 1, 0).dot(d)).normalized()      # thumb side
    side = d.cross(fw)
    m = qsphere(4, "face").xf(lambda q: F + d * (q.z * 0.112) + fw * (q.y * -0.102) + side * (q.x * 0.088) * (1 + 0.12 * q.z))
    tc = F + fw * 0.09 + d * -0.024 + side * -0.022
    m.add(qsphere(2, "face").xf(lambda q: tc + d * (q.z * 0.055) + fw * (q.y * -0.044) + side * (q.x * 0.042)))
    return m


def leg(kind):
    H, K, A = J["hip"], J["knee"], J["ankle"]
    path = [H + V(0, 0, 0.03), K + V(0, -0.006, 0.02), A + V(0, 0, 0.02), A + V(0, 0, -0.008)]
    if kind == "fur":
        return tube(path, [0.1, 0.1, 0.09, 0.086], 6, "fur", up=Vector((0, -1, 0)))
    reg = "pants"
    m = tube(path, [0.1, 0.104, 0.106, 0.114], 6, reg, up=Vector((0, -1, 0)), cap1=False)
    base = (len(path) - 1) * 6
    last = m.v[base:base + 6]
    cc = A + V(0, 0, -0.008)
    inner = [cc + (p - cc) * 0.72 + V(0, 0, 0.006) for p in last]
    st = len(m.v)
    m.v += inner
    for k in range(6):
        m.f.append((base + k, base + (k + 1) % 6, st + (k + 1) % 6, st + k))
        m.r.append(REG["sole"])
    ci = len(m.v)
    m.v.append(cc + V(0, 0, 0.01))
    for k in range(6):
        m.f.append((st + k, st + (k + 1) % 6, ci))
        m.r.append(REG["sole"])
    return m


def foot(style):
    A = J["ankle"]
    if style == "round":
        c = V(A.x + 0.008, 0.075, 0.0755)

        def sh(q):
            z = q.z * 0.092
            z = z if z > -0.07 else -0.07 - (-(z + 0.07)) * 0.25
            toe = max(0.0, -q.y)
            return c + Vector((q.x * 0.138 * (1 + 0.1 * toe), q.y * 0.205, z + 0.018 * toe * toe))
        return qsphere(4, "feet").xf(sh)
    c = V(A.x + 0.006, 0.08, 0.064)

    def sh2(q):
        z = q.z * 0.086
        toe = max(0.0, -q.y)
        z = z if z > -0.058 else -0.058 - (-(z + 0.058)) * 0.2
        z = z * (1 - 0.3 * toe) + 0.0
        return c + Vector((q.x * 0.122 * (1 - 0.08 * toe), q.y * 0.215, z))
    m = qsphere(4, "feet").xf(sh2)
    m.reg_where("sole", lambda p: p.z < 0.04)
    # heel block
    m.add(ell(2, V(A.x + 0.006, -0.085, 0.03), (0.085, 0.06, 0.03), "sole"))
    return m


def tail(m=8):
    """final-resolution tube (no subdivision): the curve is resampled with Catmull-Rom"""
    ctl = [TAIL[0] + V(0, 0.07, 0.01)] + TAIL
    crad = [0.058, 0.064, 0.062, 0.06, 0.057, 0.054, 0.05, 0.04]
    path, rad = [], []
    for i in range(len(ctl) - 1):
        p0, p1, p2, p3 = ctl[max(0, i - 1)], ctl[i], ctl[i + 1], ctl[min(len(ctl) - 1, i + 2)]
        for t in ((0.0, 0.5) if i > 0 else (0.0,)):
            path.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
            rad.append(lerp(crad[i], crad[i + 1], t))
    path.append(ctl[-1])
    rad.append(crad[-1])
    return tube(path, rad, m, "fur", up=Vector((1, 0, 0)))


def belly(surf):
    """lighter belly patch for the unclothed monkey"""
    return disc_plate(surf, 0, 0.66, lambda th: 0.2 * (1 + 0.16 * abs(math.sin(th))), 6, lambda x, z, rr: 0.016, "face", sink=0.014, rows=[0, 0.5, 0.94, 1.0])


JACKETS = ("two", "double", "vest", "open")


def _collar(surf):
    return plate(surf, [(0.02, 0.9), (0.1, 0.925), (0.104, 0.972), (0.034, 0.978)], 3, 3, 0.027, "shirt", edge=0.18).both()


def _buttons(surf, pts, r=0.019):
    m = M()
    for x, z in pts:
        m.add(blob_on(surf, x, z, r, r, r * 0.75, 2, "gold", 0.25))
    return m


def front(surf, style):
    """the suit front as a swappable part: two-button jacket, double-breasted jacket, vest over shirt, open jacket"""
    m = M()
    if style == "two":
        m.add(plate(surf, [(-0.016, 0.66), (0.016, 0.66), (0.112, 0.965), (-0.112, 0.965)], 4, 5, 0.007, "shirt", edge=0.1))
        m.add(plate(surf, [(0.006, 0.628), (0.07, 0.606), (0.168, 0.925), (0.092, 0.972)], 3, 6, 0.017, "suit2", edge=0.14,
                    bow=lambda s, t: (0.03 * math.sin(math.pi * t) * (s - 0.2), 0)).both())
        m.add(_buttons(surf, [(0.0, 0.592), (0.0, 0.545)]))
    elif style == "double":
        m.add(plate(surf, [(-0.014, 0.75), (0.014, 0.75), (0.105, 0.965), (-0.105, 0.965)], 4, 4, 0.007, "shirt", edge=0.1))
        # peak lapels, short and wide
        m.add(plate(surf, [(0.004, 0.724), (0.1, 0.7), (0.19, 0.9), (0.086, 0.972)], 3, 5, 0.018, "suit2", edge=0.14,
                    bow=lambda s, t: (0.035 * math.sin(math.pi * t) * (s - 0.1), 0.02 * s * t)).both())
        # the wrap-over panel: its free edge runs down the character's left
        m.add(plate(surf, [(-0.2, 0.538), (0.135, 0.538), (0.118, 0.722), (-0.19, 0.708)], 5, 4, 0.011, "suit", edge=0.08))
        m.add(_buttons(surf, [(sx * 0.082, z) for z in (0.682, 0.622, 0.562) for sx in (1, -1)], 0.018))
    elif style == "vest":
        m.add(plate(surf, [(-0.018, 0.69), (0.018, 0.69), (0.118, 0.965), (-0.118, 0.965)], 4, 5, 0.007, "shirt", edge=0.1))
        # piped edge of the V neck
        m.add(plate(surf, [(0.008, 0.668), (0.05, 0.662), (0.158, 0.94), (0.112, 0.968)], 2, 6, 0.014, "suit2", edge=0.2).both())
        m.add(_buttons(surf, [(0.0, 0.63), (0.0, 0.585), (0.0, 0.54)], 0.016))
    elif style == "open":
        m.add(plate(surf, [(-0.1, 0.536), (0.1, 0.536), (0.118, 0.965), (-0.118, 0.965)], 5, 6, 0.007, "shirt", edge=0.08))
        m.add(plate(surf, [(0.082, 0.534), (0.168, 0.534), (0.182, 0.915), (0.098, 0.972)], 3, 7, 0.02, "suit2", edge=0.14,
                    bow=lambda s, t: (0.022 * math.sin(math.pi * t) * (s - 0.3), 0)).both())
        m.add(plate(surf, [(-0.096, 0.541), (0.096, 0.541), (0.096, 0.578), (-0.096, 0.578)], 4, 2, 0.021, "dark", edge=0.12, sink=-0.012))        # belt
        m.add(blob_on(surf, 0.0, 0.559, 0.03, 0.024, 0.016, 2, "gold", 0.2))
    m.add(_collar(surf))
    return m


def square(surf):
    """pocket square on the character's left chest (a toggle in the creator)"""
    return plate(surf, [(0.168, 0.79), (0.238, 0.785), (0.24, 0.83), (0.174, 0.82)], 3, 3, 0.022, "square", edge=0.22)


def build_morph(co, kind):
    """target of the 'build' shape key at +1 (chubby); the game also drives it negative for slim.
    kind: torso | arm | leg. Wrists, ankles and the neck stay put so hands, feet, head and sockets still fit."""
    z = co.z
    if kind == "arm":
        k = smooth(0.95, 0.72, z) * smooth(0.46, 0.62, z)
        return Vector((co.x + sgn(co.x) * 0.055 * k, co.y, co.z))
    if kind == "leg":
        k = smooth(0.12, 0.3, z)
        cx = sgn(co.x) * J["hip"].x
        return Vector((cx + (co.x - cx) * (1 + 0.1 * k) + sgn(co.x) * 0.014 * k, co.y * (1 + 0.1 * k), co.z))
    k = smooth(0.36, 0.56, z) * (1 - smooth(0.66, 0.98, z))
    return Vector((co.x * (1 + 0.18 * k), co.y * (1 + 0.18 * k) - 0.022 * k * (co.y < 0), co.z))


def tie(surf, style):
    m = M()
    if style == "tie":
        def bow(s, t):
            w = lerp(0.006, 0.052, smooth(0.0, 0.3, t)) if t < 0.3 else lerp(0.052, 0.024, (t - 0.3) / 0.7)
            return ((s - 0.5) * 2 * (w - 0.05), 0)
        m.add(plate(surf, [(-0.05, 0.665), (0.05, 0.665), (0.05, 0.915), (-0.05, 0.915)], 4, 8, 0.026, "tie", edge=0.14, bow=bow, sink=-0.012))
        m.add(blob_on(surf, 0, 0.918, 0.038, 0.032, 0.036, 2, "tie", 0.1))
    elif style == "bowtie":
        for sx in (1, -1):
            p, u, v, n = frame_at(surf, sx * 0.066, 0.915)
            m.add(qsphere(3, "tie").xf(lambda q, p=p, u=u, v=v, n=n, sx=sx:
                                      p + n * 0.026 + u * (q.x * 0.066) + v * (q.z * 0.05 * (0.45 + 0.55 * abs(q.x * sx + 0.25))) + n * (-q.y * 0.02)))
        m.add(blob_on(surf, 0, 0.915, 0.03, 0.034, 0.036, 2, "tie", 0.0))
    return m


# ---------------------------------------------------------------- weights
def w_head(co):
    return {"head": 1.0}


def w_neck(co):
    k = smooth(0.93, 1.1, co.z)
    return {"chest": 0.35 * (1 - k), "neck": 0.65 * (1 - k) + 0.4 * k, "head": 0.6 * k}


def w_torso(co):
    h = 1 - smooth(0.45, 0.63, co.z)
    c = smooth(0.66, 0.86, co.z)
    return {"hips": h, "chest": c, "spine": max(0.0, 1 - h - c)}


def w_ear(co):
    k = smooth(0.47, 0.62, abs(co.x))
    return {"ear_L" if co.x > 0 else "ear_R": k, "head": 1 - k}


def side(name, co):
    return name + ("_L" if co.x > 0 else "_R")


def mirror_co(co):
    return Vector((abs(co.x), co.y, co.z))
