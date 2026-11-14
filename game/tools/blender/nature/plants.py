"""Bananaville nature kit: vegetation generators. Each returns a list of Geo (one per material class).
Sizes are for size = 1 in the game (1 u ~ 1 m); the runtime scales pieces. Greens sit toward olive/teal (L3 council)."""
import math

import numpy as np

from nlib import (Geo, Rng, UP, TAU, V, arc, bezier, blade, blob, clamp, fbm, frames, frond, leaf, lin, mix, nz, pol, rot, rotz, spray,
                  sstep, tone, tube, unit)

# ---- palette (sRGB hex -> linear). Foliage: dark teal interior, olive mid, light olive tips.
# The key light is warm (#ffe0b0), so sunlit greens shift yellow: the light tones carry extra blue (sage) to land at
# a saturation near 0.4 in the frame; the darks stay green rather than teal because the fill light is blue.
LEAF_D, LEAF_M, LEAF_L = lin("#456a4a"), lin("#638f58"), lin("#8aaa7a")
LEAF_SETS = [  # (dark, mid, light) families so neighbouring trees differ
    (lin("#456a4a"), lin("#638f58"), lin("#8aaa7a")),
    (lin("#416c52"), lin("#5c8c60"), lin("#86ac7e")),   # teal-sage
    (lin("#506a40"), lin("#76904e"), lin("#a2b072")),   # olive
    (lin("#486e46"), lin("#6c9652"), lin("#96b478")),
]
PALM_D, PALM_M, PALM_L, PALM_R = lin("#446c48"), lin("#668f54"), lin("#8aa868"), lin("#a6b474")
FERN_D, FERN_M, FERN_L = lin("#3f6a46"), lin("#5e8e5a"), lin("#90b278")
TEAL_D, TEAL_M, TEAL_L, TEAL_V = lin("#35745c"), lin("#4a9470"), lin("#62a880"), lin("#9cce9c")
BAN_D, BAN_M, BAN_L, BAN_R = lin("#4a7a3c"), lin("#6d9a4a"), lin("#8fb058"), lin("#b4c672")
BARK_D, BARK_M, BARK_L = lin("#5a4330"), lin("#8a6a48"), lin("#a98a62")
PTRUNK_A, PTRUNK_B, PTRUNK_D = lin("#a08060"), lin("#8a6c4a"), lin("#5e4832")
GBARK_D, GBARK_M, GBARK_L = lin("#4a392b"), lin("#7d6249"), lin("#a08565")
MOSS = lin("#6c7f46")
DRY = lin("#9a8a52")
BANANA, BANANA_G = lin("#f2c938"), lin("#b9b84a")
PETALS = [(lin("#f1ead8"), lin("#e2b05a")), (lin("#d9709c"), lin("#f3d9a0")), (lin("#e57a45"), lin("#7a3a2a")), (lin("#8d7ad6"), lin("#efe6c0"))]
STRAW_D, STRAW_M, STRAW_L = lin("#7d8048"), lin("#a9a660"), lin("#d2c98a")
REED_D, REED_M, REED_L = lin("#3f6a44"), lin("#64904e"), lin("#9db566")


def jit(rng, c, v=0.07, w=0.05):
    return tone(c, 1 + rng.u(-v, v), rng.u(-w, w))


# ------------------------------------------------------------------ crown clumps (trees, mangrove, giant tree)
def clump(gf, rng, center, radii, nspray, cols, size=1.0, core_level=1, top_only=-0.35, bend=0.55, lobed=True, lift=False, core=0.7, wide=1.0):
    """one leaf mass: a dark lumpy core hidden under overlapping leaf sprays that point out and down like shingles.
    The sprays overhang the core, so the outline is broken leaf tips rather than a ball."""
    cd, cm, cl = cols
    center = np.asarray(center, float)
    radii = np.asarray(radii, float)
    seed = rng.u(0, 50)
    blob(gf, center, radii * core, core_level, lambda d, p: mix(cd, mix(cd, cm, 0.8), sstep(d[2], -0.4, 0.9)), amp=0.16, freq=1.4, seed=seed,
         smooth=True, normals=True)
    rm = float((radii[0] + radii[1]) * 0.5)
    for i in range(nspray):
        z = mix(top_only, 1.0, ((i + 0.5) / nspray) ** 0.85)
        a = i * 2.39996 + rng.u(-0.45, 0.45)
        rr = math.sqrt(max(0.0, 1 - z * z))
        o = unit(np.array([rr * math.cos(a), rr * math.sin(a), z + rng.u(-0.12, 0.12)]))
        base = center + o * radii * 0.5
        if o[2] > 0.82:
            h = rng.dir2()
            d = unit(o * 0.3 + h)
        else:
            td = unit(-UP + o * o[2]) * (-1.0 if lift else 1.0)   # trees: leaves hang like shingles; bushes: they lift
            d = unit(o * rng.u(0.6, 0.95) + td * rng.u(0.35, 0.75) + rng.vec(0.18))
        L = rm * rng.u(0.58, 0.82) * size
        if rng.chance(0.14):
            L *= 1.28  # a few long ones break the outline
        W = L * rng.u(0.55, 0.78)
        h = sstep(o[2], -0.35, 0.9)
        k = rng.u(-0.1, 0.1)
        cb = mix(cd, cm, 0.25 * h)
        cmm = tone(mix(cd, cm, 0.45 + 0.55 * h), 1 + k)
        ct = tone(mix(cm, cl, 0.35 + 0.65 * h), 1 + k, rng.u(-0.04, 0.05))
        nb = unit(o + UP * 0.4)
        if lobed:
            spray(gf, base, d, o, L, W, cb, cmm, ct, fold=0.1, curl=rng.u(0.1, 0.3), nb=nb, bend=bend, rng=rng)
        else:
            leaf(gf, base, d, o, L, W * 0.8 * wide, cb, cmm, ct, fold=0.1, curl=rng.u(0.1, 0.3), nb=nb, bend=bend)


def bark_col(cd, cm, cl, seed, zref=1.0):
    def f(t, a, p):
        n = fbm(np.array([math.cos(a) * 2.0, math.sin(a) * 2.0, p[2] * 0.6]), 1.0, seed, 2)
        streak = nz(np.array([a * 3.0, 0.0, p[2] * 0.25]), 1.0, seed + 3)
        c = mix(cm, cl, clamp(0.5 + n * 0.9))
        c = mix(c, cd, clamp(streak * 1.2 - 0.25) * 0.7)
        return c * mix(0.78, 1.0, sstep(p[2], 0.0, zref))
    return f


def toes(k, phase, amp, fall=9.0, sharp=2.0):
    """radius multiplier: root toes / flare near the base of a trunk"""
    def f(t, a):
        lobe = abs(math.cos(k * (a + phase) * 0.5)) ** (2 * sharp)
        return 1 + (0.35 + amp * lobe) * math.exp(-t * fall)
    return f


# ------------------------------------------------------------------ palm
def palm(rng, lean=None, height=None):
    gm, gf = Geo("matte"), Geo("foliage")
    H = height if height else rng.u(3.9, 4.9)
    yaw = rng.u(0, TAU)
    Lx = lean if lean is not None else rng.u(0.35, 1.0)
    d = pol(1, yaw)
    steep = lean is not None
    p0 = V(0, 0, -0.2)
    if steep:  # the beach leaner: leaves the sand at a slant, then curves up
        p1 = p0 + d * Lx * 0.45 + UP * H * 0.22
        p2 = d * Lx * 0.95 + UP * H * 0.62
        p3 = d * Lx + UP * H
    else:
        p1 = p0 + UP * H * 0.36 - d * Lx * 0.28
        p2 = UP * H * 0.72 + d * Lx * 0.42
        p3 = UP * H + d * Lx
    nr = int(round(H / 0.4))
    ts, parity = [], []
    for j in range(nr):
        ts += [(j + 0.10) / nr, (j + 0.96) / nr]
        parity += [(j % 2, 0), (j % 2, 1)]

    def bez(t):
        return (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t * t * p2 + t ** 3 * p3
    pts = [bez(t) for t in ts]
    r0 = rng.u(0.21, 0.25)
    rad = [r0 * (1 - 0.32 * t) * (0.87 if par[1] == 0 else 1.07) * (1 + 0.6 * math.exp(-t * 13)) for t, par in zip(ts, parity)]
    seed = rng.u(0, 40)

    def tcol(t, a, p):
        i = min(len(parity) - 1, int(round(t * (len(parity) - 1))))
        ring, top = parity[i]
        c = PTRUNK_A if ring else PTRUNK_B
        c = mix(PTRUNK_D, c, 0.55 if top == 0 else 1.0)  # dark crease under each ring
        return c * (1 + 0.08 * nz(np.array([a, p[2], 0.0]), 2.0, seed)) * mix(0.8, 1.0, sstep(p[2], 0, 1.2))
    T = unit(p3 - p2)
    top = pts[-1]
    nring = len(pts)
    c_sh = lin("#7c8648")
    pts += [top + T * 0.16, top + T * 0.36, top + T * 0.52]     # crown shaft, lofted with the trunk
    rad += [r0 * 0.98, r0 * 0.78, r0 * 0.4]

    def tcol2(t, a, p):
        i = int(round(t * (len(pts) - 1)))
        if i < nring:
            return tcol((i / (nring - 1)), a, p)
        return mix(PTRUNK_A, c_sh, (i - nring + 1) / 3) * (1 + 0.06 * math.sin(a * 4))
    tube(gm, pts, rad, 8, tcol2, smooth=True, cap1=0.6)
    crown = top + T * 0.4
    # coconuts
    for k in range(rng.i(2, 4)):
        a = rng.u(0, TAU)
        c = top + T * 0.12 + (pol(1, a) - T * float(np.dot(pol(1, a), T))) * (r0 * 0.95) - UP * 0.05
        cc = jit(rng, lin("#6b5a36"), 0.1)
        blob(gm, c, rng.u(0.115, 0.14), 0, cc, smooth=True, normals=True)
    # fronds: unequal, a couple missing, older ones lower and darker, the odd dry one
    n = rng.i(10, 13)
    tiltv = d * (0.5 if steep else 0.25)
    for k in range(n):
        if k > 2 and rng.chance(0.1):
            continue
        u = k / (n - 1)
        fy = k * 2.39996 + rng.u(-0.35, 0.35)
        fd = pol(1, fy)
        rise = mix(1.2, -0.3, u ** 0.85) + rng.u(-0.12, 0.12) + 0.5 * float(np.dot(fd, tiltv))
        L = rng.u(2.1, 2.9) * (0.72 if u < 0.18 else 1.0) * (H / 4.4) ** 0.35
        droop = mix(1.25, 1.0, u) + rng.u(-0.15, 0.25)
        W = rng.u(0.42, 0.56)
        dry = u > 0.86 and rng.chance(0.55)
        cm = mix(PALM_L, PALM_M, sstep(u, 0.0, 0.5))
        cm = mix(cm, PALM_D, sstep(u, 0.45, 1.0) * 0.6)
        ct = mix(PALM_L, PALM_M, sstep(u, 0.2, 1.0))
        cr = PALM_R
        if dry:
            cm, ct, cr = mix(cm, DRY, 0.8), mix(ct, DRY * 0.9, 0.85), DRY
        frond(gf, crown + fd * 0.07, fy, L, rise, droop, W, n=12, crach=cr, cmid=jit(rng, cm), ctip=jit(rng, ct), hang=rng.u(0.4, 0.65),
              sweep=rng.u(0.45, 0.7), power=rng.u(1.3, 1.8), start=0.13, rng=rng, yawdrift=rng.u(-0.25, 0.25), stalk=0.035, cstalk=cr)
    return [gm, gf]


# ------------------------------------------------------------------ broadleaf tree
def tree(rng, far=False):
    gm, gf = Geo("matte"), Geo("foliage")
    cols = rng.pick(LEAF_SETS)
    H = rng.u(3.4, 4.4)
    lean = rng.dir2() * rng.u(0.1, 0.55)
    side = rng.dir2() * rng.u(0.1, 0.3)
    p0, p3 = V(0, 0, -0.25), V(lean[0], lean[1], H)
    pts = bezier(p0, p0 + UP * H * 0.35 + side, p3 - UP * H * 0.3 - side * 0.6, p3, 6)
    r0 = rng.u(0.3, 0.37)
    rad = [r0 * (1 - 0.42 * i / 6) for i in range(7)]
    seed = rng.u(0, 60)
    tube(gm, pts, rad, 9, bark_col(BARK_D, BARK_M, BARK_L, seed, 1.4), smooth=True, rmod=toes(rng.i(4, 6), rng.u(0, 6), rng.u(0.5, 0.8)))
    fork = pts[-1]
    # crown: one main mass off-centre, unequal side masses at uneven angles, a low skirt, a top knob. Never a ring of equals.
    masses = [(fork + lean * 0.4 + V(rng.u(-0.3, 0.3), rng.u(-0.3, 0.3), rng.u(1.2, 1.5)), V(rng.u(1.4, 1.7), rng.u(1.3, 1.6), rng.u(0.95, 1.15)), 46)]
    a0 = rng.u(0, TAU)
    nside = 2 if far else rng.i(3, 4)
    for k in range(nside):
        a = a0 + k * TAU / nside + rng.u(-0.5, 0.5)
        dist = rng.u(1.25, 1.85)
        r = rng.u(0.85, 1.25)
        masses.append((fork + pol(dist, a, rng.u(0.25, 1.0)), V(r, r * rng.u(0.85, 1.1), r * rng.u(0.62, 0.8)), 25 if not far else 30))
    if not far:
        for k in range(rng.i(1, 2)):
            a = a0 + rng.u(0, TAU)
            r = rng.u(0.6, 0.8)
            masses.append((fork + pol(rng.u(1.7, 2.2), a, rng.u(-0.45, 0.1)), V(r, r, r * 0.7), 12))
        if rng.chance(0.6):
            m0 = masses[0]
            masses.append((m0[0] + V(rng.u(-0.5, 0.5), rng.u(-0.5, 0.5), m0[1][2] * 0.85), V(0.75, 0.7, 0.55), 12))
    for i, (c, r, ns) in enumerate(masses):
        if far:
            r = r * 1.18
        # limb to each mass
        if True:
            b0 = fork - UP * (0.15 if i == 0 else rng.u(0.2, 0.7))
            mid = mix(b0, c, 0.5) + UP * 0.25
            bp = bezier(b0, mix(b0, mid, 0.6), mix(mid, c, 0.5), c - UP * r[2] * 0.25, 3)
            br = rad[-1] * (0.8 if i == 0 else 0.55)
            tube(gm, bp, [br, br * 0.8, br * 0.62, br * 0.45], 5, bark_col(BARK_D, BARK_M, BARK_L, seed + i, 1.0), smooth=True)
        cc = tuple(jit(rng, x, 0.06, 0.04) for x in cols)
        clump(gf, rng, c, r, ns if not far else max(18, ns - 12), cc, size=1.0 if not far else 1.12)
    return [gm, gf]


# ------------------------------------------------------------------ the giant tree (Sleeper's hollow landmark)
def giant(rng):
    gm, gf = Geo("matte"), Geo("foliage")
    cols = (lin("#3a6a4e"), lin("#588a56"), lin("#8fae64"))
    SIDES = 40
    zs = [-0.35, 0.0, 0.3, 0.7, 1.2, 1.8, 2.5, 3.3, 4.3, 5.4, 6.5, 7.5]
    HZ = 7.5
    seed = rng.u(0, 60)
    lean = rng.dir2() * rng.u(0.2, 0.5)
    pts = [V(lean[0] * (z / HZ) ** 2, lean[1] * (z / HZ) ** 2, z) for z in zs]
    step = TAU / SIDES
    ah = -math.pi / 2  # the hollow faces -y in Blender = +z (south, toward the camera) in the game
    # buttresses: two flank the hollow, the rest spread unevenly
    bang = [ah - 0.86, ah + 0.9]
    k = rng.i(4, 5)
    for i in range(k):
        bang.append(ah + 1.6 + i * (TAU - 3.2) / (k - 1) + rng.u(-0.14, 0.14))
    bang = [round(a / step) * step for a in bang]
    bamp = [rng.u(1.5, 2.2) for _ in bang]
    bz = [rng.u(2.4, 3.6) for _ in bang]
    bamp[0], bamp[1] = 1.7, 1.8

    def r0(z):
        return mix(1.5, 0.92, sstep(z, 0.0, 6.0)) + 0.5 * math.exp(-max(z, 0.0) * 1.3)

    def butt(a, z):
        b = 0.0
        for ak, amp, zk in zip(bang, bamp, bz):
            da = (a - ak + math.pi) % TAU - math.pi
            lobe = max(0.0, math.cos(da)) ** 16 if abs(da) < math.pi / 2 else 0.0
            b = max(b, amp * lobe * (1 - sstep(z, -0.3, zk)) ** 1.5)
        return b

    HH, HW, DEPTH = 2.9, 0.64, 1.45

    def hollow(a, z):
        if z > HH:
            return 0.0
        da = abs((a - ah + math.pi) % TAU - math.pi)
        hw = HW * math.sqrt(max(0.0, 1 - (max(z, 0.0) / HH) ** 2.2))
        return sstep(1 - da / max(hw, 1e-3), 0.0, 0.45) if hw > 0.02 else 0.0

    def zt(t):
        return zs[min(len(zs) - 1, int(round(t * (len(zs) - 1))))]

    def rmod(t, a):
        z = zt(t)
        r = r0(z) + butt(a, z)
        r *= 1 + 0.045 * nz(np.array([math.cos(a) * 3, math.sin(a) * 3, z * 0.5]), 1.0, seed)
        return r - DEPTH * hollow(a, z) * min(1.0, r / 1.5)

    def tcol(t, a, p):
        z = zt(t)
        b = butt(a, z)
        c = bark_col(GBARK_D, GBARK_M, GBARK_L, seed, 2.0)(t, a, p)
        c = mix(c, GBARK_L, clamp(b * 0.45))                      # lighter worn ridge along each buttress crest
        ms = sstep(fbm(p, 0.5, seed + 9, 2), -0.1, 0.45) * sstep(z, 4.2, 0.3) * 0.55
        c = mix(c, MOSS * 0.9, ms)                                 # moss creeping up the lower trunk, broken by noise
        h = hollow(a, z)
        c = mix(c, lin("#120c08"), sstep(h, 0.12, 0.5))            # the hollow is dark inside
        c = mix(c, GBARK_L * 1.15, sstep(h, 0.0, 0.08) * (1 - sstep(h, 0.08, 0.2)) * 0.8)  # callus lip
        return c
    tube(gm, pts, [1.0] * len(pts), SIDES, tcol, smooth=True, rmod=rmod)
    # surface roots running out from each buttress foot
    for ak, amp in zip(bang, bamp):
        r_s = r0(0) + amp * 0.86
        a = ak
        p = pol(r_s, a, 0.16)
        rp, L = [pol(r_s - 0.5, a, 0.42), p], rng.u(2.2, 4.2)
        for i in range(5):
            a += rng.u(-0.3, 0.3)
            p = p + pol(L / 5, a, 0) - UP * (0.045 + 0.02 * i)
            rp.append(p.copy())
        rr = [0.4, 0.34, 0.28, 0.22, 0.17, 0.12, 0.07]
        tube(gm, rp, rr, 6, lambda t, a2, p2: mix(mix(GBARK_M, GBARK_L, 0.4), MOSS, sstep(p2[2], 0.05, 0.3) * 0.45 * sstep(fbm(p2, 0.9, seed, 2), -0.2, 0.3)),
             smooth=True, cap1="point")
        if rng.chance(0.6):  # a side root
            j = rng.i(2, 3)
            a3 = a + rng.pick([-1, 1]) * rng.u(0.6, 1.0)
            q = [rp[j], rp[j] + pol(0.6, a3, -0.03), rp[j] + pol(1.3, a3 + rng.u(-0.3, 0.3), -0.1), rp[j] + pol(1.9, a3 + rng.u(-0.5, 0.5), -0.17)]
            tube(gm, q, [rr[j] * 0.7, 0.13, 0.09, 0.05], 5, mix(GBARK_M, GBARK_L, 0.35), smooth=True, cap1="point")
    # limbs and canopy masses
    fork = pts[-1]
    masses = []
    nl = rng.i(5, 6)
    a0 = rng.u(0, TAU)
    for i in range(nl):
        a = a0 + i * TAU / nl + rng.u(-0.3, 0.3)
        reach = rng.u(3.4, 5.6)
        rise = rng.u(2.0, 4.2)
        end = fork + pol(reach, a, rise)
        bp = bezier(fork - UP * 0.5, fork + pol(reach * 0.35, a, 0.3), fork + pol(reach * 0.7, a + rng.u(-0.2, 0.2), rise * 0.5), end, 5)
        tube(gm, bp, [0.56, 0.48, 0.4, 0.33, 0.26, 0.2], 8, bark_col(GBARK_D, GBARK_M, GBARK_L, seed + i, 2.0), smooth=True)
        r = rng.u(1.9, 2.5)
        masses.append((end + UP * 0.5, V(r, r * rng.u(0.85, 1.1), r * rng.u(0.6, 0.72)), 56))
        # a sub-limb with a smaller mass, and sometimes a low drooping one
        j = 3
        a2 = a + rng.pick([-1, 1]) * rng.u(0.7, 1.2)
        e2 = bp[j] + pol(rng.u(2.0, 3.0), a2, rng.u(0.6, 1.8))
        tube(gm, bezier(bp[j], mix(bp[j], e2, 0.4) + UP * 0.3, mix(bp[j], e2, 0.75) + UP * 0.2, e2, 3), [0.3, 0.24, 0.18, 0.13], 6,
             bark_col(GBARK_D, GBARK_M, GBARK_L, seed + i + 20, 2.0), smooth=True)
        r = rng.u(1.3, 1.8)
        masses.append((e2 + UP * 0.35, V(r, r, r * 0.68), 34))
    # the top
    tp = bezier(fork - UP * 0.4, fork + UP * 1.2 + lean, fork + UP * 2.6 + lean * 2, fork + UP * 3.9 + lean * 2.5, 4)
    tube(gm, tp, [0.6, 0.5, 0.4, 0.3, 0.2], 8, bark_col(GBARK_D, GBARK_M, GBARK_L, seed + 40, 2.0), smooth=True)
    masses.append((tp[-1] + UP * 0.7, V(2.6, 2.4, 1.6), 66))
    masses.append((tp[-1] + pol(2.0, rng.u(0, TAU), 1.5), V(1.5, 1.4, 1.0), 28))
    for c, r, ns in masses:
        clump(gf, rng, c, r, ns, tuple(jit(rng, x, 0.07, 0.04) for x in cols), size=0.66, top_only=-0.45)
    # lianas hanging from the limbs
    for i in range(rng.i(5, 7)):
        c, r, _ = rng.pick(masses[:nl * 2])
        s = c + pol(r[0] * rng.u(0.2, 0.7), rng.u(0, TAU), -r[2] * 0.55)
        Lv = rng.u(2.2, 4.5)
        vp = [s + UP * 0.5]
        for q in range(1, 5):
            vp.append(s + V(math.sin(q * 1.7 + i) * 0.12, math.cos(q * 1.3 + i) * 0.12, -Lv * q / 4))
        tube(gm, vp, [0.045, 0.04, 0.035, 0.03, 0.02], 3, lin("#4d5a34"), smooth=True, cap1="point")
        for q in range(1, 5):
            ld = unit(rng.dir2() - UP * 0.5)
            leaf(gf, vp[q], ld, UP, rng.u(0.32, 0.45), 0.2, cols[0], cols[1], cols[2], nb=UP, bend=0.4)
    return [gm, gf]


# ------------------------------------------------------------------ bushes
def _shoot(gm, gf, rng, base, yaw, pitch, L, nleaf, leafL, leafW, cols, bow=0.5, stem_r=0.028, curl=(0.1, 0.3), tip_flower=None, first=0.3):
    cd, cm, cl = cols
    pts = arc(base, yaw, L, pitch, bow, 3, 1.2)
    tube(gm, pts, [stem_r, stem_r * 0.85, stem_r * 0.7, stem_r * 0.5], 3, lin("#55603a"), smooth=True, phase=rng.u(0, 2))
    T, N, B = frames(pts)
    for k in range(nleaf):
        t = mix(first, 0.93, k / max(1, nleaf - 1))
        f = t * 3
        i = min(2, int(f))
        p = mix(pts[i], pts[i + 1], f - i)
        ax = unit(pts[i + 1] - pts[i])
        a = k * 2.39996 + rng.u(-0.3, 0.3)
        out = unit(math.cos(a) * N[i] + math.sin(a) * B[i])
        spread = mix(1.0, 0.7, t)                        # leaves stand out sideways from the stem, upper side to the sky
        d = unit(ax * 0.3 + out * spread + UP * 0.1)   # (a steep leaf shows its unlit underside to the top-down camera)
        if d[2] > 0.5:
            d = unit(np.array([d[0], d[1], 0.5 * math.hypot(d[0], d[1])]))
        Lk = leafL * rng.u(0.8, 1.15) * mix(1.0, 0.8, t)
        h = sstep(p[2] + d[2] * Lk, 0.1, 1.0)
        kk = rng.u(-0.09, 0.09)
        nb = unit(unit(np.array([p[0], p[1], 0.0]) + 1e-6) * 0.45 + UP)
        leaf(gf, p, d, UP, Lk, Lk * leafW, mix(cd, cm, 0.6), tone(mix(cm, cl, 0.25 + 0.45 * h), 1 + kk), tone(mix(cm, cl, 0.6 + 0.4 * h), 1 + kk),
             fold=0.1, curl=rng.u(*curl), nb=nb, bend=0.55)
    if tip_flower is not None:
        flower(gf, pts[-1], unit(pts[-1] - pts[-2]), 0.11, tip_flower[0], tip_flower[1], rng)
    return pts


def bush(rng, kind=0):
    gm, gf = Geo("matte"), Geo("foliage")
    cols = [tuple(LEAF_SETS[0]), tuple(LEAF_SETS[2]), tuple(LEAF_SETS[1]), tuple(LEAF_SETS[3]), tuple(LEAF_SETS[1])][kind]
    cols = tuple(jit(rng, c, 0.05, 0.03) for c in cols)
    cd = cols[0]
    seed = rng.u(0, 30)
    if kind == 1:  # spiky rosettes on short trunks at different heights
        heads = rng.i(3, 4)
        for h in range(heads):
            a = rng.u(0, TAU)
            off = pol(rng.u(0.0, 0.55) if h else 0.0, a)
            hh = rng.u(0.25, 0.95) if h else rng.u(0.75, 1.1)
            tp = [off * 0.4 + V(0, 0, -0.1), off * 0.8 + V(0, 0, hh * 0.5), off + V(0, 0, hh)]
            tube(gm, tp, [0.075, 0.06, 0.05], 5, lambda t, a2, p: mix(BARK_M, lin("#8a7a52"), 0.4) * mix(0.8, 1, t), smooth=True, cap1=0.5)
            n = rng.i(13, 17)
            for k in range(n):
                u = k / (n - 1)
                yaw = k * 2.39996 + rng.u(-0.2, 0.2)
                pitch = mix(1.35, -0.25, u ** 0.8) + rng.u(-0.1, 0.1)
                L = rng.u(0.6, 0.85) * mix(0.75, 1.0, sstep(u, 0, 0.4))
                d = np.array([math.cos(pitch) * math.cos(yaw), math.cos(pitch) * math.sin(yaw), math.sin(pitch)])
                kk = rng.u(-0.08, 0.08)
                leaf(gf, tp[-1] - UP * 0.03 + d * 0.015, d, UP, L, L * 0.2, cd, tone(mix(cols[0], cols[1], 0.4 + 0.6 * (1 - u)), 1 + kk), tone(mix(cols[1], cols[2], 1 - u * 0.6), 1 + kk),
                     fold=0.25, curl=mix(0.05, 0.45, u), nb=unit(d * 0.5 + UP), bend=0.35, shape=0.3)
        return [gm, gf]
    flat, tallk = kind == 3, kind == 4
    # leaf-shingled mounds of unequal size (never one ball), then shoots that break the outline
    if tallk:
        mounds = [(V(0, 0, 0.36), V(0.5, 0.46, 0.42), 26), (V(rng.u(-0.12, 0.12), rng.u(-0.12, 0.12), 0.95), V(0.4, 0.38, 0.42), 22)]
    else:
        r = rng.u(0.56, 0.68) * (1.15 if flat else 1.0)
        mounds = [(V(0, 0, 0.3 if not flat else 0.2), V(r, r * rng.u(0.82, 1.0), 0.44 if not flat else 0.3), 32)]
    a0 = rng.u(0, TAU)
    for k in range(rng.i(1, 2) + (1 if flat else 0)):
        a = a0 + k * TAU / 2.6 + rng.u(-0.4, 0.4)
        rr = rng.u(0.34, 0.46)
        mounds.append((pol(rng.u(0.5, 0.72) * (1.15 if flat else 1.0), a, rr * 0.5), V(rr, rr * rng.u(0.85, 1.05), rr * (0.8 if not flat else 0.6)), 16))
    lite = (mix(cols[0], cols[1], 0.7), mix(cols[1], cols[2], 0.45), cols[2])   # the mound is all leaf: no dark core colour
    for c, r, n in mounds:
        big = max(r) > 0.48
        clump(gf, rng, c, r, n + (4 if big else 4), lite, size=1.3 if big else 1.6, lobed=False, top_only=-0.25, core=0.72, bend=0.6, wide=1.45)
    petal = rng.pick(PETALS[:2]) if kind == 2 else None
    top = mounds[1] if tallk else mounds[0]
    ns = rng.i(5, 7)
    for k in range(ns):
        yaw = k * TAU / ns + rng.u(-0.5, 0.5)
        pitch, L = (rng.u(0.9, 1.4), rng.u(0.55, 0.95)) if tallk else ((rng.u(0.15, 0.55), rng.u(0.7, 1.0)) if flat else (rng.u(0.45, 1.25), rng.u(0.55, 0.9)))
        base = top[0] + pol(top[1][0] * 0.35, yaw, top[1][2] * 0.2)
        _shoot(gm, gf, rng, base, yaw, pitch, L, rng.i(5, 6), rng.u(0.46, 0.6), rng.u(0.52, 0.64), cols, bow=rng.u(0.2, 0.7), first=0.45,
               tip_flower=petal if (petal and rng.chance(0.75)) else None)
    return [gm, gf]


# ------------------------------------------------------------------ small plants
def fern(rng):
    gm, gf = Geo("matte"), Geo("foliage")
    blob(gm, V(0, 0, 0.02), V(0.13, 0.13, 0.1), 0, lin("#4a4630"), smooth=True, normals=True)
    n = rng.i(8, 11)
    for k in range(n):
        yaw = k * TAU / n + rng.u(-0.2, 0.2)
        L = rng.u(0.95, 1.4)
        kk = rng.u(-0.08, 0.08)
        frond(gf, pol(0.03, yaw, 0.05), yaw, L, rng.u(0.75, 1.2), rng.u(1.5, 2.1), rng.u(0.2, 0.27), n=7, crach=lin("#6f8a4c"),
              cmid=tone(FERN_M, 1 + kk), ctip=tone(FERN_L, 1 + kk, rng.u(-0.03, 0.05)), hang=0.3, sweep=0.5, power=1.6, start=0.1, rng=rng,
              yawdrift=rng.u(-0.3, 0.3), tipw=0.2)
    ny, y0 = rng.i(2, 3), rng.u(0, TAU)
    for k in range(ny):  # young upright fronds in the middle
        yaw = y0 + k * TAU / ny + rng.u(-0.3, 0.3)
        frond(gf, pol(0.02, yaw, 0.05), yaw, rng.u(0.5, 0.75), rng.u(1.3, 1.5), rng.u(0.6, 1.1), 0.14, n=5, crach=lin("#8aa45c"), cmid=FERN_L, ctip=tone(FERN_L, 1.1, 0.06),
              hang=0.25, sweep=0.5, start=0.1, rng=rng, tipw=0.25)
    return [gm, gf]


def heart(gf, base, d, up, L, W, cd, cm, cv, droop=0.25, cup=0.12, rng=None, nb=None):
    """an elephant-ear leaf: heart outline with a notch where the stalk meets it, pale midrib, drooping tip"""
    d = unit(d)
    s = unit(np.cross(up, d))
    u = unit(np.cross(d, s))
    j = (lambda k: rng.u(-k, k)) if rng else (lambda k: 0.0)

    def P(x, y):
        z = -droop * x * abs(x) + cup * abs(y) * 2 - 0.05 * (1 if x < 0 else 0)
        return base + d * (x * L) + s * (y * W) + u * (z * L)

    def Nn(x, y):
        n = unit(u + s * y * 0.9 + d * x * 0.3)
        return unit(n * 0.6 + nb * 0.4) if nb is not None else n
    out = [(-0.24, 0.17), (-0.15, 0.40), (0.10, 0.52), (0.42, 0.45), (0.74, 0.26)]
    A = gf.vert(P(0, 0), cv, Nn(0, 0))
    M1 = gf.vert(P(0.36, 0), cv, Nn(0.36, 0))
    M2 = gf.vert(P(0.70, 0), mix(cv, cm, 0.4), Nn(0.7, 0))
    TIP = gf.vert(P(1.0 + j(0.04), 0), cm, Nn(1, 0))
    for sgn in (1, -1):
        Ls = []
        for i, (x, y) in enumerate(out):
            c = mix(cd, cm, sstep(x, -0.25, 0.5)) * (1 + j(0.05))
            Ls.append(gf.vert(P(x + j(0.02), sgn * (y + j(0.025))), c, Nn(x, sgn * y)))
        for a, b, c in ((A, Ls[0], Ls[1]), (A, Ls[1], Ls[2]), (A, Ls[2], M1), (M1, Ls[2], Ls[3]), (M1, Ls[3], M2), (M2, Ls[3], Ls[4]), (M2, Ls[4], TIP)):
            gf.tri(a, b, c, True, u)


def bigleaf(rng):
    gm, gf = Geo("matte"), Geo("foliage")
    blob(gm, V(0, 0, 0.03), V(0.14, 0.14, 0.12), 0, lin("#3d4a30"), smooth=True, normals=True)
    n = rng.i(5, 7)
    for k in range(n):
        yaw = k * TAU / n + rng.u(-0.45, 0.45)
        h = rng.u(0.6, 1.25)
        reach = rng.u(0.25, 0.6)
        b0 = pol(0.05, yaw, 0.03)
        top = pol(reach, yaw, h)
        sp = bezier(b0, b0 + UP * h * 0.55, top - pol(reach * 0.5, yaw, -0.05), top, 4)
        tube(gm, sp, [0.04, 0.036, 0.03, 0.026, 0.022], 4, lambda t, a, p: mix(lin("#3f6a48"), lin("#6f9a66"), t), smooth=True, phase=rng.u(0, 1.5))
        tilt = rng.u(0.35, 0.95)
        d = unit(pol(1, yaw + rng.u(-0.3, 0.3)) * math.cos(tilt) - UP * math.sin(tilt))
        L = rng.u(0.7, 1.0)
        kk = rng.u(-0.08, 0.08)
        heart(gf, top - d * 0.02, d, unit(UP + pol(0.5, yaw)), L, L * rng.u(0.8, 0.95), tone(TEAL_D, 1 + kk), tone(mix(TEAL_M, TEAL_L, rng.u(0, 1)), 1 + kk), mix(TEAL_L, TEAL_V, 0.45),
              droop=rng.u(0.12, 0.3), cup=rng.u(0.05, 0.14), rng=rng, nb=unit(UP + pol(0.4, yaw)))
    return [gm, gf]


def banana_fruit(g, base, out, rng, L=0.21, r=0.04):
    """one banana: a 3-sided curved prism with pointed ends, hanging tip-up from the stalk"""
    pts = [base, base + out * L * 0.45 - UP * L * 0.1, base + out * L * 0.8 + UP * L * 0.18, base + out * L * 0.9 + UP * L * 0.5]

    def col(t, a, p):
        return mix(mix(BANANA_G, BANANA, sstep(t, 0.0, 0.3)), lin("#8a6a2c"), sstep(t, 0.9, 1.0) * 0.6) * (1 + 0.05 * math.sin(a * 3))
    tube(g, pts, [r * 0.6, r, r * 0.92, r * 0.45], 3, col, smooth=True, cap1="point", twist=0.3)


def banana(rng, bunch=True):
    gm, gf = Geo("matte"), Geo("foliage")
    seed = rng.u(0, 30)
    lean = rng.dir2() * rng.u(0.0, 0.18)
    zs = [-0.12, 0.25, 0.7, 1.12, 1.48]
    rs = [0.21, 0.18, 0.15, 0.125, 0.09]
    pts = [V(lean[0] * z, lean[1] * z, z) for z in zs]

    def scol(t, a, p):
        sheath = sstep(nz(np.array([a * 1.5, p[2] * 2.2, 0.0]), 1.0, seed), 0.05, 0.4)
        return mix(mix(lin("#7d8c48"), lin("#9aa858"), t), lin("#6a4f38"), sheath * (1 - t) * 0.75)
    tube(gm, pts, rs, 7, scol, smooth=True, cap1=0.5)
    top = pts[-1]
    n = rng.i(7, 9)
    for k in range(n):
        u = k / (n - 1)
        yaw = k * 2.39996 + rng.u(-0.3, 0.3)
        L = rng.u(1.25, 1.8) * mix(0.8, 1.0, sstep(u, 0, 0.3))
        sp = arc(top - UP * 0.1 + pol(0.04, yaw), yaw, L, mix(1.3, 0.35, u) + rng.u(-0.1, 0.1), mix(1.0, 1.9, u) + rng.u(-0.2, 0.2), 7, 1.5, rng.u(-0.2, 0.2))
        Wm = rng.u(0.25, 0.34)
        tears = {}
        for _ in range(rng.i(1, 3)):
            tears[rng.i(3, 6)] = (rng.u(0.3, 0.5), 1.0) if rng.chance(0.5) else (1.0, rng.u(0.3, 0.5))
        old = sstep(u, 0.6, 1.0)
        kk = rng.u(-0.07, 0.07)

        def col(t, e, old=old, kk=kk):
            c = mix(BAN_R, mix(BAN_M, BAN_L, 1 - old), abs(e) * 0.9 + 0.1 * (1 - t))
            c = mix(c, BAN_D, old * 0.45)
            c = mix(c, lin("#8a7440"), sstep(t, 0.82, 1.0) * old * 0.8)   # dry tip on old leaves
            return tone(c, 1 + kk)
        blade(gf, sp, lambda t, Wm=Wm: Wm * sstep(t, 0.06, 0.28) * (1 - 0.8 * sstep(t, 0.7, 1.0)) + 0.012, fold=-0.28, col=col, tears=tears, edge_drop=0.75,
              nb=unit(UP + pol(0.5, yaw)), bend=0.3)
    sp = arc(top - UP * 0.15, rng.u(0, TAU), 0.95, 1.45, 0.25, 4)   # the rolled spear leaf
    blade(gf, sp, lambda t: 0.07 * (1 - 0.6 * t) + 0.01, fold=0.9, col=lambda t, e: mix(BAN_L, BAN_R, 0.5 + 0.3 * t), nb=None)
    if bunch:
        a = rng.u(0, TAU)
        o = pol(1, a)
        st = bezier(top - UP * 0.2, top + o * 0.3 + UP * 0.12, top + o * 0.55 - UP * 0.25, top + o * 0.58 - UP * 0.85, 5)
        tube(gm, st, [0.04, 0.04, 0.038, 0.035, 0.03, 0.025], 4, lin("#6f7a3e"), smooth=True)
        for tier, i in enumerate((2, 3, 4)):
            c = st[i]
            nb_ = rng.i(5, 6)
            for q in range(nb_):
                aa = q * TAU / nb_ + tier * 0.6 + rng.u(-0.15, 0.15)
                banana_fruit(gm, c + pol(0.02, aa), pol(1, aa), rng, L=rng.u(0.2, 0.25), r=rng.u(0.04, 0.047))
        bud = st[-1] + UP * 0.04
        tube(gm, [bud, bud - UP * 0.1, bud - UP * 0.2], [0.03, 0.065, 0.04], 5, lambda t, a2, p: mix(lin("#7a3048"), lin("#4e2036"), t), smooth=True,
             cap1="point")
    return [gm, gf]


def flower(gf, c, axis, r, cpet, ccen, rng, petals=5):
    """a small open bloom: petals as kites around a raised centre"""
    axis = unit(axis)
    ref = np.array([1.0, 0, 0]) if abs(axis[0]) < 0.9 else np.array([0, 1.0, 0])
    n1 = unit(np.cross(axis, ref))
    n2 = np.cross(axis, n1)
    ci = gf.vert(c - axis * r * 0.14, ccen, axis, ao=0.3)
    a0 = rng.u(0, TAU)
    for k in range(petals):
        a = a0 + k * TAU / petals
        o = math.cos(a) * n1 + math.sin(a) * n2
        s = math.cos(a + TAU / 4) * n1 + math.sin(a + TAU / 4) * n2
        up = r * (0.1 if k % 2 else 0.0)
        tip = gf.vert(c + o * r + axis * (r * 0.22 + up), cpet * rng.u(0.94, 1.05), unit(axis + o * 0.4), ao=0.3)
        l = gf.vert(c + o * r * 0.55 + s * r * 0.29 + axis * (r * 0.05 + up), cpet * 0.9, unit(axis + s * 0.3), ao=0.3)
        rr = gf.vert(c + o * r * 0.55 - s * r * 0.29 + axis * (r * 0.05 + up), cpet * 0.9, unit(axis - s * 0.3), ao=0.3)
        gf.tri(ci, rr, tip, True, axis)
        gf.tri(ci, tip, l, True, axis)


def flowers(rng, kind=0):
    gm, gf = Geo("matte"), Geo("foliage")
    cpet, ccen = PETALS[kind % len(PETALS)]
    blob(gm, V(0, 0, 0.0), V(0.16, 0.16, 0.08), 0, lin("#4a4a30"), smooth=True, normals=True)
    n = rng.i(6, 9)
    for k in range(n):
        yaw = k * TAU / n + rng.u(-0.5, 0.5)
        h = rng.u(0.28, 0.6)
        reach = rng.u(0.1, 0.5)
        b0 = pol(rng.u(0.0, 0.08), yaw, 0.03)
        top = pol(reach, yaw, h)
        sp = [b0, mix(b0, top, 0.5) + UP * h * 0.15, top]
        tube(gm, sp, [0.016, 0.014, 0.012], 3, lin("#5c7a40"), smooth=True, phase=rng.u(0, 2))
        flower(gf, top, unit(UP + pol(0.5, yaw)), rng.u(0.085, 0.12), cpet, ccen, rng, 5 if kind != 3 else 6)
    for k in range(rng.i(7, 10)):  # basal leaves
        yaw = rng.u(0, TAU)
        pitch = rng.u(0.35, 0.95)
        d = np.array([math.cos(pitch) * math.cos(yaw), math.cos(pitch) * math.sin(yaw), math.sin(pitch)])
        L = rng.u(0.24, 0.4)
        leaf(gf, pol(0.03, yaw, 0.05), d, UP, L, L * 0.42, LEAF_D, jit(rng, FERN_M), jit(rng, FERN_L), curl=rng.u(0.15, 0.4), nb=UP, bend=0.4)
    return [gm, gf]


def grass_blades(g, rng, n, hmin, hmax, wmin, wmax, spread, cd, cm, cl, lean=(0.1, 0.4), segs=3, up_normals=False, white=False):
    """tapered blades from one root. `white` = the instanced grass tuft: flat blades, up normals, only a root-AO gradient
    (the game tints instances from the ground colour). Otherwise each blade is a closed 3-sided spike, so it shades
    correctly from every side under the kit's double-sided foliage material."""
    for b in range(n):
        a = rng.u(0, TAU)
        h, w = rng.u(hmin, hmax), rng.u(wmin, wmax)
        o = pol(rng.u(0, spread), rng.u(0, TAU))
        dr, sd = pol(1, a), pol(1, a + TAU / 4)
        ln = rng.u(*lean) * h
        if not white:
            pts = [o + dr * (ln * t * t) + UP * (h * (t - 0.12 * t * t) - 0.03) for t in (i / segs * 0.94 for i in range(segs + 1))]
            rad = [w * 0.62 * (1 - 0.7 * i / segs) for i in range(segs + 1)]
            tube(g, pts, rad, 3, lambda t, a2, p: mix(mix(cd, cm, sstep(t, 0, 0.5)), cl, sstep(t, 0.45, 1.0)), smooth=True, cap1="point", phase=rng.u(0, 2))
            continue
        prev = None
        for s in range(segs + 1):
            t = s / segs
            ww = w * (1 - t * 0.88)
            p = o + dr * (ln * t * t) + UP * (h * (t - 0.12 * t * t))
            v = 0.61 + t * 0.39
            c = np.array([v * 0.95, v, v * 0.85])
            nrm = unit(UP + dr * 0.3)
            if s == segs:
                cur = (g.vert(p, c, nrm),)
            else:
                cur = (g.vert(p - sd * ww, c, nrm), g.vert(p + sd * ww, c, nrm))
            if prev is not None:
                if len(cur) == 2:
                    g.quad(prev[0], prev[1], cur[1], cur[0], True)
                else:
                    g.tri(prev[0], prev[1], cur[0], True)
            prev = cur


def grass_tuft(rng):
    g = Geo("foliage")
    grass_blades(g, rng, rng.i(5, 7), 0.45, 0.85, 0.1, 0.15, 0.13, None, None, None, lean=(0.12, 0.42), segs=3, up_normals=True, white=True)
    return [g]


def beachgrass(rng):
    gm, gf = Geo("matte"), Geo("foliage")
    blob(gm, V(0, 0, -0.02), V(0.2, 0.2, 0.1), 0, lin("#b8a070"), smooth=True, normals=True)
    for c in range(rng.i(2, 3)):
        o = pol(rng.u(0, 0.22), rng.u(0, TAU)) if c else V(0, 0, 0)
        g2 = Geo("foliage")
        grass_blades(g2, rng, rng.i(6, 8), 0.55, 1.15, 0.04, 0.065, 0.07, STRAW_D, STRAW_M, STRAW_L, lean=(0.25, 0.75), segs=3)
        gf.add(g2, t=o)
    for k in range(rng.i(2, 4)):  # seed heads
        yaw = rng.u(0, TAU)
        sp = arc(pol(0.05, yaw, 0.02), yaw, rng.u(0.95, 1.3), 1.35, 0.55, 3)
        tube(gm, sp, [0.012, 0.011, 0.01, 0.009], 3, STRAW_M, smooth=True)
        T = unit(sp[-1] - sp[-2])
        tube(gm, [sp[-1] - T * 0.04, sp[-1] + T * 0.08, sp[-1] + T * 0.2], [0.004, 0.032, 0.014], 4, lin("#c9b880"), smooth=True, cap1="point")
    return [gm, gf]


def reeds(rng):
    gm, gf = Geo("matte"), Geo("foliage")
    blob(gm, V(0, 0, -0.03), V(0.26, 0.24, 0.1), 0, lin("#4a4a34"), smooth=True, normals=True)
    for c in range(3):
        o = pol(rng.u(0.05, 0.2), c * TAU / 3 + rng.u(-0.5, 0.5))
        g2 = Geo("foliage")
        grass_blades(g2, rng, rng.i(5, 7), 1.0, 1.9, 0.04, 0.07, 0.06, REED_D, REED_M, REED_L, lean=(0.05, 0.3), segs=3)
        gf.add(g2, t=o)
    for k in range(rng.i(3, 5)):  # cattails
        yaw = rng.u(0, TAU)
        h = rng.u(1.4, 2.1)
        sp = arc(pol(rng.u(0.02, 0.18), yaw, 0.0), yaw, h, 1.5, rng.u(0.05, 0.25), 3)
        tube(gm, sp, [0.02, 0.018, 0.016, 0.014], 4, REED_M, smooth=True, phase=rng.u(0, 1.5))
        T = unit(sp[-1] - sp[-2])
        tube(gm, [sp[-1] - T * 0.05, sp[-1] + T * 0.05, sp[-1] + T * 0.27, sp[-1] + T * 0.31], [0.006, 0.05, 0.05, 0.02], 6,
             lambda t, a, p: mix(lin("#6a4428"), lin("#8a5c38"), 0.5 + 0.5 * math.sin(a)), smooth=True, cap1="point")
    return [gm, gf]


def lily(rng, bloom=True):
    gf = Geo("foliage")
    n = rng.i(4, 6)
    spots = []
    for k in range(n):
        for _ in range(30):
            r = rng.u(0.28, 0.5) * (1.0 if k else 1.15)
            c = pol(rng.u(0.0, 1.0), rng.u(0, TAU))
            if all(np.linalg.norm(c - c2) > r + r2 + 0.04 for c2, r2 in spots):
                spots.append((c, r))
                break
    for i, (c, r) in enumerate(spots):
        z = 0.04
        a0, gap, seg = rng.u(0, TAU), rng.u(0.35, 0.6), 11
        kk = rng.u(-0.08, 0.08)
        cv = tone(lin("#8fb070"), 1 + kk)
        ci = gf.vert(c + V(0, 0, z + 0.03 + 0.003 * i), cv, UP, ao=0.4)
        ring = []
        for q in range(seg + 1):
            a = a0 + gap / 2 + (TAU - gap) * q / seg
            rr = r * (1 + 0.05 * math.sin(q * 2.1 + i))
            ring.append(gf.vert(c + pol(rr, a, z + 0.02 * (q % 2)), tone(mix(lin("#3f7a52"), lin("#5f9a5a"), q % 2), 1 + kk), unit(UP + pol(0.25, a)), ao=0.4))
            if q:
                gf.tri(ci, ring[-2], ring[-1], True, UP)
        if bloom and i < 2 and r > 0.3:
            pc, pcen = (lin("#f0d0dc"), lin("#e9b84a")) if i == 0 else (lin("#f4efe2"), lin("#e9b84a"))
            b = c + pol(r * 0.25, a0 + math.pi) + V(0, 0, z + 0.012)
            for ring_i, (pr, lift, cnt) in enumerate(((0.2, 0.05, 7), (0.13, 0.12, 5))):
                for q in range(cnt):
                    a = q * TAU / cnt + ring_i * 0.4
                    d = unit(pol(1, a) + UP * (0.35 + ring_i * 0.9))
                    leaf(gf, b + d * 0.012 + V(0, 0, 0.01 * ring_i), d, UP, pr, pr * 0.5, pcen, pc * 0.96, pc, fold=0.2, curl=-0.1, nb=UP, bend=0.3)
    return [gf]


def litter(rng):
    gf = Geo("foliage")
    tones = [lin("#7a6238"), lin("#8c7444"), lin("#6a5a3a"), lin("#7a5236"), lin("#74703e"), lin("#94804a")]
    n = rng.i(14, 20)
    for k in range(n):
        c = pol(rng.u(0, 1.0) ** 0.7 * 1.25, rng.u(0, TAU), rng.u(0.07, 0.11) + 0.002 * k)
        yaw = rng.u(0, TAU)
        tilt = rng.u(-0.12, 0.3)
        d = np.array([math.cos(tilt) * math.cos(yaw), math.cos(tilt) * math.sin(yaw), math.sin(tilt)])
        L = rng.u(0.22, 0.36)
        col = rng.pick(tones)
        one = Geo("foliage")
        leaf(one, c, d, unit(UP + rng.vec(0.2)), L, L * rng.u(0.45, 0.6), col * 0.8, jit(rng, col, 0.1), jit(rng, col, 0.1) * 1.1, fold=rng.u(-0.2, 0.25), curl=rng.u(-0.2, 0.3),
             nb=UP, bend=0.5)
        gf.add(one, t=V(0, 0, 0.02 + 0.0008 * k - min(p[2] for p in one.v)))
    return [gf]


# ------------------------------------------------------------------ mangrove
def mangrove(rng):
    gm, gf = Geo("matte"), Geo("foliage")
    cols = (lin("#3a6650"), lin("#588858"), lin("#8aaa68"))
    seed = rng.u(0, 50)
    mc_d, mc_m, mc_l = lin("#4a4034"), lin("#6f6250"), lin("#8f826a")
    lean = rng.dir2() * rng.u(0.1, 0.5)
    base_z = rng.u(1.2, 1.6)
    H = rng.u(3.0, 3.8)
    pts = bezier(V(0, 0, base_z - 0.5), V(0, 0, base_z + 0.5), V(lean[0] * 0.6, lean[1] * 0.6, H - 0.6), V(lean[0], lean[1], H), 5)
    tube(gm, pts, [0.2, 0.23, 0.21, 0.19, 0.17, 0.14], 7, bark_col(mc_d, mc_m, mc_l, seed, 2.0), smooth=True, cap0=0.6)
    n = rng.i(8, 11)
    for k in range(n):  # stilt roots: arch out of the trunk and down into the mud
        a = k * TAU / n + rng.u(-0.3, 0.3)
        zt = rng.u(base_z - 0.35, base_z + 0.65)
        reach = rng.u(1.0, 2.2)
        s = V(0, 0, zt) + pol(0.1, a)
        e = pol(reach, a + rng.u(-0.25, 0.25), -0.3)
        rp = bezier(s, s + pol(reach * 0.45, a, 0.35), e + UP * (zt * 0.75) - pol(reach * 0.12, a), e, 5)
        r = rng.u(0.07, 0.1)
        tube(gm, rp, [r * 1.2, r, r * 0.9, r * 0.82, r * 0.78, r * 0.7], 5, lambda t, a2, p: mix(mc_m, mc_l, 0.3 + 0.5 * nz(p, 2.0, seed)) * mix(0.7, 1.0, sstep(p[2], 0, 0.6)),
             smooth=True)
        if rng.chance(0.45):  # a secondary prop off the arch
            j = 3
            e2 = rp[j] + pol(rng.u(0.4, 0.8), a + rng.pick([-1, 1]) * rng.u(0.5, 1.1), -rp[j][2] - 0.3)
            tube(gm, bezier(rp[j], rp[j] + (e2 - rp[j]) * 0.3 + UP * 0.1, e2 + UP * 0.4, e2, 3), [r * 0.7, r * 0.6, r * 0.55, r * 0.5], 4, mc_m * 0.95, smooth=True)
    top = pts[-1]
    masses = [(top + UP * 0.55, V(1.5, 1.4, 0.78), 32)]
    a0 = rng.u(0, TAU)
    for k in range(rng.i(3, 4)):
        a = a0 + k * TAU / 3.5 + rng.u(-0.4, 0.4)
        r = rng.u(0.85, 1.15)
        c = top + pol(rng.u(1.3, 1.9), a, rng.u(-0.1, 0.45))
        masses.append((c, V(r, r, r * 0.6), 18))
        tube(gm, bezier(top - UP * 0.2, mix(top, c, 0.4) + UP * 0.15, mix(top, c, 0.8), c - UP * 0.1, 3), [0.1, 0.085, 0.07, 0.05], 4, mc_m, smooth=True)
    for c, r, ns in masses:
        clump(gf, rng, c, r, ns, tuple(jit(rng, x, 0.06, 0.03) for x in cols), size=1.15, lobed=True)
    return [gm, gf]


# ------------------------------------------------------------------ canopy shadow caster (shadow only)
def caster(rng):
    gf = Geo("foliage")
    c = lin("#3a5a3a")
    nsub = rng.i(3, 4)
    a0 = rng.u(0, TAU)
    hub = V(0, 0, 0)
    for k in range(nsub):
        a = a0 + k * TAU / nsub + rng.u(-0.5, 0.5)
        reach = rng.u(0.7, 1.5) if k else 0.25
        e = pol(reach, a, rng.u(-0.1, 0.1))
        tw = bezier(hub, mix(hub, e, 0.4) + V(0, 0, 0.05), mix(hub, e, 0.8), e, 3)
        tube(gf, tw, [0.05, 0.045, 0.04, 0.03], 3, c, smooth=True)
        R = rng.u(0.55, 0.95) if k else 0.75
        n = int(7 + R * 7)
        for q in range(n):
            if rng.chance(0.12):
                continue  # holes
            aa = q * 2.39996 + rng.u(-0.4, 0.4)
            j = rng.i(0, 2)
            d = unit(pol(1, aa) + UP * rng.u(-0.4, 0.4))
            L = R * rng.u(0.7, 1.25)
            spray(gf, mix(tw[j], tw[j + 1], rng.u(0.2, 0.75)), d, unit(UP + rng.vec(0.4)), L, L * rng.u(0.5, 0.7), c, c, c, fold=0.08, curl=rng.u(0.0, 0.2), rng=rng)
    return [gf]
