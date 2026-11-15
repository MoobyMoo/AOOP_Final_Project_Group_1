"""Bananaville nature kit: rocks, wood, beach, cave and waterfall generators. Each returns a list of Geo.
Rocks are convex hulls with big planar facets and bevelled edges, cut below ground level so they read as sunk in.
Stone is warm (L3 council); moss is a noise-broken vertex-colour tint on up-facing planes, never a cap."""
import math

import numpy as np

from nlib import (Geo, UP, TAU, V, arc, bezier, blob, clamp, fbm, frames, hull_rock, leaf, lin, mix, nz, pol, rot, rotz, sstep, tone, tube, unit)
from plants import BARK_D, BARK_L, BARK_M, FERN_L, FERN_M, LEAF_D, MOSS, bark_col, frond, jit, toes

ROCK_L, ROCK_M, ROCK_D = lin("#c6b290"), lin("#a59276"), lin("#756756")
CAVE_L, CAVE_M, CAVE_D = lin("#a89a88"), lin("#807364"), lin("#544b42")
CLIFF_L, CLIFF_M, CLIFF_D = lin("#cdbb9c"), lin("#a89678"), lin("#786a5a")
WOOD_CUT = [lin("#d9bb8c"), lin("#b8925e"), lin("#cfae7e"), lin("#a07a4c")]
DRIFT_L, DRIFT_M, DRIFT_D = lin("#cdbfa6"), lin("#a89a82"), lin("#7d705e")


def rock_col(seed, light=ROCK_L, mid=ROCK_M, dark=ROCK_D, moss=0.5, moss_c=MOSS, scale=1.0, wet=None):
    def f(p, n):
        up = float(n[2])
        c = mix(mid, light, sstep(up, 0.15, 0.9))
        c = mix(c, dark, sstep(-up, -0.35, 0.6) * 0.6)
        c = c * (1 + 0.16 * fbm(p, 2.4 / scale, seed, 2))                     # mottling
        c = tone(c, 1.0, 0.05 * nz(p, 0.9 / scale, seed + 7))                 # warm and cool patches
        c = mix(c, dark, sstep(p[2], 0.22 * scale, -0.05) * 0.45)            # darker toward the ground line
        if moss > 0:
            cover = sstep(fbm(p, 1.15 / scale, seed + 5, 2), 0.35 - moss * 0.7, 0.6 - moss * 0.5)
            m = sstep(up, 0.35, 0.8) * cover
            c = mix(c, moss_c * (0.9 + 0.2 * nz(p, 3.0 / scale, seed + 2)), m * 0.92)
        if wet is not None:
            c = mix(c, c * np.array([0.55, 0.6, 0.66]), wet(p))
        return c
    return f


def rock(rng, cls="m"):
    g = Geo("matte")
    seed = rng.u(0, 80)
    ms = rng.u(0.35, 0.85)
    if cls == "s":
        r = V(rng.u(0.38, 0.5), rng.u(0.3, 0.42), rng.u(0.3, 0.4))
        hull_rock(g, rng, r, V(0, 0, -0.02), npts=10, bevel=0.13, cut=-0.1, col=rock_col(seed, moss=ms, scale=0.5), R=rotz(rng.u(0, TAU)), subdiv=0.4, seed=seed)
    elif cls == "m":
        r = V(rng.u(0.72, 0.9), rng.u(0.6, 0.75), rng.u(0.65, 0.85))
        hull_rock(g, rng, r, V(0, 0, 0.0), npts=12, bevel=0.11, cut=-0.16, col=rock_col(seed, moss=ms, scale=0.9), R=rot(rng.vec(1), rng.u(0, 0.3)) @ rotz(rng.u(0, TAU)),
                  subdiv=0.55, rough=0.04, seed=seed)
        if rng.chance(0.5):  # a chip beside it
            a = rng.u(0, TAU)
            hull_rock(g, rng, V(0.3, 0.26, 0.26), pol(r[0] * 0.95, a, -0.02), npts=8, bevel=0.14, cut=-0.12, col=rock_col(seed + 1, moss=ms * 0.5, scale=0.4), R=rotz(a), seed=seed)
    else:
        r = V(rng.u(1.1, 1.35), rng.u(0.95, 1.15), rng.u(1.2, 1.6))
        hull_rock(g, rng, r, V(0, 0, 0.05), npts=14, bevel=0.1, cut=-0.25, col=rock_col(seed, moss=ms, scale=1.3), R=rot(rng.vec(1), rng.u(0, 0.25)) @ rotz(rng.u(0, TAU)),
                  subdiv=0.75, rough=0.05, seed=seed)
        a = rng.u(0, TAU)
        hull_rock(g, rng, V(0.62, 0.5, 0.6), pol(r[0] * 0.9, a, 0.0), npts=10, bevel=0.12, cut=-0.2, col=rock_col(seed + 1, moss=ms, scale=0.7), R=rotz(a + 0.5), subdiv=0.6, seed=seed)
    return [g]


def boulders(rng):
    g = Geo("matte")
    seed = rng.u(0, 80)
    ms = rng.u(0.35, 0.8)
    a0 = rng.u(0, TAU)
    r = V(rng.u(1.0, 1.2), rng.u(0.9, 1.05), rng.u(1.25, 1.55))
    hull_rock(g, rng, r, V(0, 0, 0.05), npts=13, bevel=0.1, cut=-0.25, col=rock_col(seed, moss=ms, scale=1.3), R=rot(rng.vec(1), rng.u(0, 0.3)), subdiv=0.95, rough=0.04, seed=seed)
    n = rng.i(2, 3)
    for k in range(n):
        a = a0 + k * TAU / n + rng.u(-0.5, 0.5)
        rr = rng.u(0.5, 0.8)
        hull_rock(g, rng, V(rr, rr * rng.u(0.75, 0.95), rr * rng.u(0.9, 1.25)), pol(r[0] * 0.75 + rr * 0.55, a, 0.0), npts=11, bevel=0.12, cut=-0.2,
                  col=rock_col(seed + k + 1, moss=ms, scale=0.8), R=rot(rng.vec(1), rng.u(0, 0.4)) @ rotz(a), subdiv=0.95, seed=seed + k)
    for k in range(rng.i(1, 2)):
        a = a0 + rng.u(0, TAU)
        hull_rock(g, rng, V(0.3, 0.26, 0.26), pol(r[0] + rng.u(0.5, 0.9), a, -0.02), npts=8, bevel=0.14, cut=-0.1, col=rock_col(seed + 9 + k, moss=ms * 0.5, scale=0.4), R=rotz(a), seed=seed)
    return [g]


def pebbles(rng, sand=False):
    g = Geo("matte")
    seed = rng.u(0, 80)
    L, M, D = (lin("#d8c8a8"), lin("#b3a184"), lin("#857662")) if sand else (ROCK_L, ROCK_M, ROCK_D)
    n = rng.i(7, 11)
    for k in range(n):
        r = rng.u(0.07, 0.17)
        c = pol(rng.u(0, 1.0) ** 0.6 * 0.95, rng.u(0, TAU), 0.03)
        hull_rock(g, rng, V(r, r * rng.u(0.7, 1.0), r * rng.u(0.6, 0.85)), c, npts=7, bevel=0.2, cut=-0.06, col=rock_col(seed + k, L, M, D, moss=0.0, scale=0.2),
                  R=rotz(rng.u(0, TAU)), seed=seed)
    return [g]


# ------------------------------------------------------------------ wood
def cut_rings(g, center, T, N, B, r, sides, phase, wob=0.04, tones=None, hollow=0.0, smooth=False, outer=None):
    """the sawn end of a log: concentric growth rings as vertex-colour bands. outer = existing ring to stitch to."""
    tones = tones or WOOD_CUT
    fr = [0.86, 0.62, 0.38, 0.17]
    prev = outer
    for j, f in enumerate(fr):
        ring = []
        for k in range(sides):
            a = TAU * k / sides
            rr = r * f * (1 + wob * math.sin(a * 3 + phase + j))
            ring.append(g.vert(center + rr * (math.cos(a) * N + math.sin(a) * B) + T * (0.004 * j), tones[j % len(tones)] * (1 + 0.05 * math.sin(a * 5 + j))))
        if prev is not None:
            for k in range(sides):
                g.quad(prev[k], prev[(k + 1) % sides], ring[(k + 1) % sides], ring[k], smooth, T)
        prev = ring
    ci = g.vert(center - T * hollow, tones[3] * (0.25 if hollow else 0.85))
    for k in range(sides):
        g.tri(prev[k], prev[(k + 1) % sides], ci, smooth, T)


def log(rng, kind=0):
    gm = Geo("matte")
    seed = rng.u(0, 80)
    L, r = rng.u(2.3, 2.9), rng.u(0.28, 0.35)
    n, sides = 6, 12
    bend = rng.u(-0.12, 0.12)
    pts = [V(-L / 2 + L * i / n, bend * math.sin(math.pi * i / n), r * 0.52 + 0.03 * math.sin(i * 1.3 + seed)) for i in range(n + 1)]
    rad = [r * (1 - 0.1 * i / n) * (1 + 0.05 * nz(V(i * 0.7, 0, 0), 1.0, seed)) for i in range(n + 1)]
    mossy = 0.75 if kind == 1 else 0.35
    bc = bark_col(BARK_D, BARK_M, BARK_L, seed, 0.2)

    def col(t, a, p):
        c = bc(t, a, p)
        m = sstep(p[2], r * 1.0, r * 1.6) * sstep(fbm(p, 1.4, seed + 3, 2), 0.3 - mossy * 0.7, 0.6 - mossy * 0.5)
        return mix(c, MOSS, m * 0.85)
    rings = tube(gm, pts, rad, sides, col, smooth=True, rmod=lambda t, a: 1 + 0.06 * nz(V(math.cos(a) * 2, math.sin(a) * 2, t * 6), 1.0, seed))
    T, N, B = frames(pts)
    cut_rings(gm, pts[0], -T[0], N[0], B[0], rad[0], sides, seed, outer=rings[0][::1], hollow=0.0)
    cut_rings(gm, pts[-1], T[-1], N[-1], B[-1], rad[-1], sides, seed + 2, outer=rings[-1], hollow=0.55 if kind == 2 else 0.0)
    # a sawn-off branch stub
    for k in range(1 if kind != 3 else 2):
        i = rng.i(1, n - 2)
        a = rng.u(0.5, 2.6)
        d = unit(V(rng.u(-0.4, 0.4), math.cos(a), abs(math.sin(a)) + 0.3))
        b0 = pts[i] + d * rad[i] * 0.5
        sp = [b0, b0 + d * 0.3, b0 + d * (0.42 + rng.u(0, 0.2))]
        rr = rng.u(0.07, 0.1)
        rs = tube(gm, sp, [rr * 1.25, rr, rr * 0.9], 7, col, smooth=True)
        Ts, Ns, Bs = frames(sp)
        cut_rings(gm, sp[-1], Ts[-1], Ns[-1], Bs[-1], rr * 0.9, 7, seed, outer=rs[-1])
    out = [gm]
    if kind in (1, 3):  # a fern sprig growing out of the rot
        gf = Geo("foliage")
        i = rng.i(1, n - 1)
        o = pts[i] + UP * rad[i] * 0.85
        nq, y0 = rng.i(3, 4), rng.u(0, TAU)
        for q in range(nq):
            frond(gf, o + pol(0.02, y0 + q * TAU / nq), y0 + q * TAU / nq + rng.u(-0.3, 0.3), rng.u(0.45, 0.7), rng.u(0.6, 1.2), rng.u(1.2, 1.9), 0.13, n=6, crach=lin("#6f8a4c"), cmid=FERN_M, ctip=FERN_L, hang=0.3, start=0.1, rng=rng)
        out.append(gf)
    return out


def stump(rng, kind=0):
    gm = Geo("matte")
    seed = rng.u(0, 80)
    H, r = rng.u(0.45, 0.7), rng.u(0.38, 0.46)
    zs = [-0.25, 0.0, 0.14, 0.34, H]
    sides = 12
    pts = [V(0, 0, z) for z in zs]
    bc = bark_col(BARK_D, BARK_M, BARK_L, seed, 0.3)

    def col(t, a, p):
        m = sstep(fbm(p, 1.8, seed + 3, 2), 0.05, 0.5) * sstep(p[2], 0.5, 0.0) * 0.6
        return mix(bc(t, a, p), MOSS, m)
    tz = toes(rng.i(4, 5), rng.u(0, 6), rng.u(0.55, 0.8), fall=4.5)
    rings = tube(gm, pts, [r * 1.05, r * 1.02, r, r * 0.96, r * 0.93], sides, col, smooth=True, rmod=tz)
    tilt = rot(rng.dir2(), rng.u(0.04, 0.16))
    if kind == 1:  # snapped: a jagged splintered top instead of a clean cut
        top = rings[-1]
        ci = gm.vert(V(0, 0, H - 0.08), WOOD_CUT[3] * 0.7)
        sp = []
        for k in range(sides):
            a = TAU * k / sides
            hh = H + (rng.u(0.1, 0.42) if k % 2 == 0 else rng.u(-0.04, 0.08))
            sp.append(gm.vert(pol(r * 0.8, a, hh), mix(WOOD_CUT[0], WOOD_CUT[1], rng.u(0, 1))))
        for k in range(sides):
            gm.quad(top[k], top[(k + 1) % sides], sp[(k + 1) % sides], sp[k], False)
            gm.tri(sp[k], sp[(k + 1) % sides], ci, False)
    else:
        cut_rings(gm, V(0, 0, H), tilt @ UP, tilt @ V(1, 0, 0), tilt @ V(0, 1, 0), r * 0.93, sides, seed, outer=rings[-1])
    out = [gm]
    if kind == 2:  # a sucker shoot with a few leaves
        gf = Geo("foliage")
        a = rng.u(0, TAU)
        b0 = pol(r * 0.9, a, 0.25)
        sp = arc(b0, a, 0.7, 1.2, 0.3, 3)
        tube(gm, sp, [0.03, 0.026, 0.022, 0.016], 3, lin("#5c6a3c"), smooth=True)
        for q in range(5):
            p = mix(sp[min(3, 1 + q // 2)], sp[min(3, 2 + q // 2)], 0.5 * (q % 2))
            d = unit(pol(1, a + q * 2.4) + UP * 0.5)
            leaf(gf, p, d, UP, rng.u(0.26, 0.36), 0.17, LEAF_D, FERN_M, FERN_L, nb=UP, bend=0.4)
        out.append(gf)
    return out


def driftwood(rng):
    g = Geo("matte")
    seed = rng.u(0, 80)
    L = rng.u(1.8, 2.6)
    yaw = rng.u(0, TAU)

    def col(t, a, p):
        s = nz(V(a * 2.0, t * 5, 0), 1.0, seed)
        return mix(mix(DRIFT_M, DRIFT_L, clamp(0.5 + s)), DRIFT_D, clamp(-s * 1.4 - 0.3) * 0.7) * mix(0.75, 1.0, sstep(p[2], -0.02, 0.15))
    p0 = pol(-L / 2, yaw, 0.02)
    p3 = pol(L / 2, yaw + rng.u(-0.2, 0.2), 0.1)
    side = pol(1, yaw + TAU / 4) * rng.u(-0.35, 0.35)
    main = bezier(p0, mix(p0, p3, 0.33) + side + UP * 0.08, mix(p0, p3, 0.66) - side * 0.5 + UP * 0.12, p3, 7)
    tube(g, main, [0.13, 0.125, 0.115, 0.105, 0.09, 0.075, 0.06, 0.04], 7, col, smooth=True, cap0=0.4, cap1="point")
    for k in range(rng.i(1, 2)):
        j = rng.i(2, 5)
        a = yaw + rng.pick([-1, 1]) * rng.u(0.5, 1.0)
        e = main[j] + pol(rng.u(0.5, 0.9), a, rng.u(0.1, 0.4))
        br = bezier(main[j], mix(main[j], e, 0.35) + UP * 0.05, mix(main[j], e, 0.7) + UP * 0.08, e, 3)
        tube(g, br, [0.07, 0.06, 0.045, 0.028], 5, col, smooth=True, cap1="point")
    return [g]


def shells(rng):
    g = Geo("matte")
    cream, pink, coral, pale = lin("#f0e2c8"), lin("#e6b4a4"), lin("#d97c50"), lin("#f6efe0")
    spots = []

    def spot(r):
        for _ in range(40):
            c = pol(rng.u(0.0, 0.85), rng.u(0, TAU))
            if all(np.linalg.norm(c - c2) > r + r2 for c2, r2 in spots):
                spots.append((c, r))
                return c
        return None
    for k in range(rng.i(2, 3)):  # scallops: a ribbed fan
        r = rng.u(0.15, 0.22)
        c = spot(r)
        if c is None:
            continue
        R = rot(rng.dir2(), rng.u(0, 0.25)) @ rotz(rng.u(0, TAU))
        base = c + V(0, 0, 0.022)
        tint = rng.pick([cream, pink, pale])
        hinge = g.vert(base + R @ V(-r * 0.15, 0, 0.012), tint * 0.85)
        mids, rims, ribs = [], [], 8
        for q in range(ribs + 1):
            a = mix(-1.25, 1.25, q / ribs)
            up = 0.012 if q % 2 else 0.0
            cc = tint * (1.0 if q % 2 else 0.86)
            mids.append(g.vert(base + R @ pol(r * 0.5, a, r * 0.24 + up), cc))
            rims.append(g.vert(base + R @ pol(r, a, 0.012 + up), mix(cc, pink, 0.25)))
        for q in range(ribs):
            g.tri(hinge, mids[q], mids[q + 1], True, UP)
            g.quad(mids[q], rims[q], rims[q + 1], mids[q + 1], True, UP)
    if True:  # a starfish
        r = rng.u(0.2, 0.26)
        c = spot(r)
        if c is not None:
            a0 = rng.u(0, TAU)
            ci = g.vert(c + V(0, 0, 0.095), coral * 1.1)
            for k in range(5):
                a = a0 + k * TAU / 5
                tip = g.vert(c + pol(r * rng.u(0.9, 1.1), a + rng.u(-0.12, 0.12), 0.034), coral * 0.85)
                ridge = g.vert(c + pol(r * 0.5, a, 0.08), coral)
                nl = g.vert(c + pol(r * 0.36, a + TAU / 10, 0.04), coral * 0.75)
                nr = g.vert(c + pol(r * 0.36, a - TAU / 10, 0.04), coral * 0.75)
                g.tri(ci, nr, ridge, True, UP)
                g.tri(ci, ridge, nl, True, UP)
                g.tri(ridge, nr, tip, True, UP)
                g.tri(ridge, tip, nl, True, UP)
    if True:  # a spiral conch lying on its side
        c = spot(0.2)
        if c is not None:
            R = rot(rng.dir2(), 1.25) @ rotz(rng.u(0, TAU))
            pts, rad = [], []
            for q in range(9):
                t = q / 8
                pts.append(c + V(0, 0, 0.11) + R @ V(0.075 * (1 - t) * math.cos(t * 7.5), 0.075 * (1 - t) * math.sin(t * 7.5), -0.1 + 0.3 * t))
                rad.append(0.085 * (1 - t) ** 0.8 + 0.012)
            tube(g, pts, rad, 6, lambda t, a, p: mix(mix(cream, pink, 0.5 + 0.5 * math.sin(a * 2)), pale, t), smooth=True, cap0=0.3, cap1="point")
    return [g]


# ------------------------------------------------------------------ cave set
def caverock(rng, kind=0):
    g = Geo("matte")
    seed = rng.u(0, 80)
    col = rock_col(seed, CAVE_L, CAVE_M, CAVE_D, moss=0.0, scale=1.0)
    lichen = rock_col(seed, CAVE_L, CAVE_M, CAVE_D, moss=0.35, moss_c=lin("#5a7a72"), scale=1.0)
    r = V(rng.u(0.75, 0.95), rng.u(0.65, 0.8), rng.u(0.85, 1.2))
    if kind == 0:   # one upright chunk + a lean-to shard
        hull_rock(g, rng, V(r[0], r[1], r[2] * 1.3), V(0, 0, 0.1), npts=11, bevel=0.08, cut=-0.25, col=lichen, R=rot(rng.vec(1), rng.u(0.05, 0.3)), subdiv=0.8, rough=0.05, seed=seed)
        a = rng.u(0, TAU)
        hull_rock(g, rng, V(0.4, 0.34, 0.7), pol(r[0] * 0.85, a, 0.0), npts=9, bevel=0.1, cut=-0.2, col=col, R=rot(pol(1, a + 1.57), -0.35), seed=seed)
    elif kind == 1:  # stacked slabs
        z = 0.1
        for k in range(3):
            rr = V(r[0] * (1 - 0.18 * k), r[1] * (1 - 0.15 * k), 0.34)
            hull_rock(g, rng, rr, V(rng.u(-0.15, 0.15), rng.u(-0.15, 0.15), z), npts=10, bevel=0.14, cut=-0.25 if k == 0 else None, col=lichen if k == 2 else col,
                      R=rot(rng.vec(1), rng.u(0, 0.18)) @ rotz(rng.u(0, TAU)), subdiv=0.8, seed=seed + k)
            z += 0.33
    elif kind == 2:  # a jagged tooth group
        for k in range(rng.i(3, 4)):
            a = k * TAU / 3.5 + rng.u(-0.4, 0.4)
            h = rng.u(0.7, 1.35) if k else 1.5
            hull_rock(g, rng, V(0.36, 0.3, h * 1.25), pol(0.42 if k else 0.0, a, 0.0), npts=9, bevel=0.1, cut=-0.25, col=col,
                      R=rot(pol(1, a + 1.57), rng.u(0.1, 0.4)) @ rotz(rng.u(0, TAU)), subdiv=0.9, seed=seed + k)
    else:            # a wide low shelf
        hull_rock(g, rng, V(r[0] * 1.2, r[1] * 1.05, 0.7), V(0, 0, 0.0), npts=13, bevel=0.1, cut=-0.25, col=lichen, R=rotz(rng.u(0, TAU)), subdiv=0.7, rough=0.05, seed=seed)
        a = rng.u(0, TAU)
        hull_rock(g, rng, V(0.42, 0.36, 0.5), pol(0.3, a, 0.55), npts=9, bevel=0.12, col=col, R=rot(rng.vec(1), 0.3), seed=seed)
    return [g]


def stalagmite(rng):
    g = Geo("matte")
    seed = rng.u(0, 80)
    n = rng.i(3, 6)
    cl, cm, cd = lin("#b8aa94"), lin("#8e8170"), lin("#5e554a")
    for k in range(n):
        h = rng.u(0.5, 1.2) if k else rng.u(1.3, 1.9)
        r = h * rng.u(0.16, 0.22) + 0.05
        c = pol(rng.u(0.25, 0.7) if k else 0.0, k * TAU / max(1, n - 1) + rng.u(-0.5, 0.5))
        lean = rng.dir2() * rng.u(0, 0.12) * h
        st = 6
        pts = [c + V(lean[0] * (i / st) ** 2, lean[1] * (i / st) ** 2, -0.15 + (h + 0.15) * i / st) for i in range(st + 1)]
        rad = [r * ((1 - i / st) ** 0.75) * (1.18 if i % 2 == 0 else 0.9) + 0.025 for i in range(st + 1)]
        rad[0] *= 1.25
        tube(g, pts, rad, 7, lambda t, a, p: mix(mix(cd, cm, sstep(t, 0, 0.4)), cl, sstep(t, 0.3, 1.0)) * (1 + 0.07 * nz(p, 4.0, seed)), smooth=True, cap1="point")
    return [g]


GLOW = [(lin("#2f9c94"), lin("#63d6c4"), lin("#d2fff2")), (lin("#3a86c8"), lin("#6ec6f0"), lin("#dcf6ff")), (lin("#6a5ad0"), lin("#a08cf4"), lin("#ece4ff")),
        (lin("#2f9c94"), lin("#7ae0b8"), lin("#e4ffe8"))]


def mushroom(rng, hue=0):
    gm, ge = Geo("matte"), Geo("emissive")
    dk, md, lt = GLOW[hue % len(GLOW)]
    n = rng.i(4, 7)
    blob(gm, V(0, 0, -0.02), V(0.2, 0.18, 0.07), 0, lin("#4a443a"), smooth=True, normals=True)
    for k in range(n):
        big = k == 0
        h = rng.u(0.32, 0.5) if big else rng.u(0.12, 0.34)
        cr = h * rng.u(0.42, 0.55) + 0.03
        c = pol(0.0 if big else rng.u(0.14, 0.42), k * 2.39996 + rng.u(-0.3, 0.3))
        lean = rng.dir2() * rng.u(0.0, 0.3) * h
        sp = [c + V(0, 0, -0.03), c + V(lean[0] * 0.4, lean[1] * 0.4, h * 0.55), c + V(lean[0], lean[1], h)]
        tube(gm, sp, [cr * 0.3, cr * 0.2, cr * 0.17], 5, lambda t, a, p: mix(lin("#8f8a78"), mix(lin("#d9d2ba"), md, 0.35), t), smooth=True)
        top = sp[-1]
        ax = unit(sp[-1] - sp[-2])
        ref = V(1, 0, 0) if abs(ax[0]) < 0.9 else V(0, 1, 0)
        n1 = unit(np.cross(ax, ref))
        n2 = np.cross(ax, n1)
        sides = 8
        apex = ge.vert(top + ax * cr * 0.62, lt, ao=0.15)
        midr, rim, under = [], [], []
        for q in range(sides):
            a = TAU * q / sides
            o = math.cos(a) * n1 + math.sin(a) * n2
            spot_ = 1.0 if (q + k) % 3 == 0 else 0.0
            midr.append(ge.vert(top + o * cr * 0.62 + ax * cr * 0.42, mix(md, lt, 0.25 + 0.6 * spot_), ao=0.15))
            rim.append(ge.vert(top + o * cr * (1 + 0.06 * math.sin(q * 2.3 + k)) - ax * cr * 0.02, mix(dk, md, 0.55), ao=0.3))
            under.append(ge.vert(top + o * cr * 0.1 - ax * cr * 0.12, dk * 0.6, ao=0.3))
        for q in range(sides):
            q2 = (q + 1) % sides
            ge.tri(apex, midr[q], midr[q2], True, ax)
            ge.quad(midr[q], rim[q], rim[q2], midr[q2], True, ax)
            ge.quad(rim[q], under[q], under[q2], rim[q2], True, -ax)
    return [gm, ge]


def prism(g, base, axis, r, h, sides, col, twist=0.0, tip=0.55, light=None):
    """a faceted crystal: unshared vertices per face with a fake light baked into the colours (the emissive class is unlit)"""
    light = unit(V(-0.4, -0.5, 0.75)) if light is None else light
    axis = unit(axis)
    ref = V(1, 0, 0) if abs(axis[0]) < 0.9 else V(0, 1, 0)
    n1 = unit(np.cross(axis, ref))
    n2 = np.cross(axis, n1)

    def P(a, rr, z):
        return base + (math.cos(a) * n1 + math.sin(a) * n2) * rr + axis * z
    apex = base + axis * (h + r * 2.2 * tip)
    for k in range(sides):
        a0, a1 = twist + TAU * k / sides, twist + TAU * (k + 1) / sides
        b0, b1, t0, t1 = P(a0, r, 0), P(a1, r, 0), P(a0, r * 0.82, h), P(a1, r * 0.82, h)
        for quad, tt in (((b0, b1, t1, t0), (0.0, 0.0, 1.0, 1.0)), ((t0, t1, apex), (1.0, 1.0, 1.25))):
            n = unit(np.cross(quad[1] - quad[0], quad[2] - quad[0]))
            sh = 0.55 + 0.6 * clamp(float(np.dot(n, light)) * 0.5 + 0.5) ** 1.5
            ids = [g.vert(p, np.clip(col(t) * sh, 0, 1), ao=0.35) for p, t in zip(quad, tt)]
            if len(ids) == 4:
                g.quad(ids[0], ids[1], ids[2], ids[3], False)
            else:
                g.tri(ids[0], ids[1], ids[2], False)


def crystal(rng, hue=0):
    gm, ge = Geo("matte"), Geo("emissive")
    seed = rng.u(0, 80)
    pal = [(lin("#5a44b8"), lin("#9a80f4"), lin("#b8f2ff")), (lin("#1f8a8a"), lin("#5ad8c8"), lin("#e0fff4")), (lin("#a03c8c"), lin("#e078c8"), lin("#ffe0f4"))][hue % 3]
    hull_rock(gm, rng, V(0.48, 0.42, 0.26), V(0, 0, 0.04), npts=10, bevel=0.14, cut=-0.12, col=rock_col(seed, CAVE_L, CAVE_M, CAVE_D, moss=0, scale=0.5), R=rotz(rng.u(0, TAU)), seed=seed)
    n = rng.i(5, 7)
    for k in range(n):
        big = k == 0
        a = k * 2.39996 + rng.u(-0.3, 0.3)
        tilt = rng.u(0.05, 0.2) if big else rng.u(0.25, 0.75)
        axis = unit(pol(math.sin(tilt), a, math.cos(tilt)))
        h = rng.u(0.75, 1.05) if big else rng.u(0.25, 0.6)
        r = h * rng.u(0.13, 0.17) + 0.03
        base = pol(0.0 if big else rng.u(0.12, 0.3), a, 0.08)
        prism(ge, base, axis, r, h, 6, lambda t: mix(mix(pal[0], pal[1], sstep(t, 0.0, 0.7)), pal[2], sstep(t, 0.75, 1.25)), twist=rng.u(0, 1))
    return [gm, ge]


def hanging_roots(rng):
    """a root curtain for the cave: one thick twisted root drops in from above (flat dark cut where it meets the ceiling),
    splits, and the strands splay into the floor; a few thin ones dangle short."""
    gm = Geo("matte")
    seed = rng.u(0, 80)
    rd, rm, rl = lin("#5a4836"), lin("#86705a"), lin("#a89070")
    topz = rng.u(3.9, 4.5)
    splitz = rng.u(2.0, 2.6)
    ph = rng.u(0, 6)
    main = [V(0.16 * math.sin(i * 1.1 + ph), 0.16 * math.cos(i * 0.9 + ph), topz - (topz - splitz + 0.25) * i / 5) for i in range(6)]

    def col(t, a2, p):
        return mix(rd, mix(rm, rl, clamp(0.5 + 1.2 * nz(V(a2 * 2.5, p[2] * 0.7, 0), 1.0, seed))), 0.35 + 0.65 * sstep(p[2], 0.0, 2.2))
    tube(gm, main, [0.5, 0.38, 0.31, 0.28, 0.26, 0.2], 8, col, smooth=True, cap0="flat", capcol=lin("#2a211a"), twist=0.2,
         rmod=lambda t, a2: 1 + (0.14 + 0.12 * (1 - sstep(t, 0.0, 0.3))) * math.sin(a2 * 3 + t * 5))
    n = rng.i(6, 8)
    for k in range(n):
        a = k * TAU / n + rng.u(-0.3, 0.3)
        ground = k < n - 2
        s0 = main[4] + pol(0.08, a)
        e = pol(rng.u(0.55, 1.35), a + rng.u(-0.4, 0.4), -0.25) if ground else pol(rng.u(0.3, 0.7), a, rng.u(0.6, 1.5))
        mid = mix(s0, e, 0.45) + pol(rng.u(0.15, 0.4), a) + UP * rng.u(0.0, 0.3)
        pts = bezier(s0, s0 + pol(0.3, a, -0.25), mid, e, 6)
        r = rng.u(0.085, 0.12) if ground else rng.u(0.04, 0.06)
        rad = [r * (1.25 - 0.4 * i / 6) * (1 + (0.7 * sstep(i / 6, 0.75, 1.0) if ground else 0)) for i in range(7)]
        tube(gm, pts, rad, 5, col, smooth=True, cap1=None if ground else "point", twist=0.15, phase=rng.u(0, 1))
        if not ground:
            for q in range(2):
                d = unit(pol(0.4, rng.u(0, TAU)) - UP)
                tube(gm, [pts[-2], pts[-2] + d * 0.2, pts[-2] + d * 0.42 - UP * 0.1], [0.02, 0.015, 0.01], 3, rm, smooth=True, cap1="point")
    for k in range(rng.i(2, 3)):  # thin aerial strands off the main root
        j = rng.i(1, 3)
        a = rng.u(0, TAU)
        L = rng.u(0.8, 1.6)
        s0 = main[j]
        vp = [s0, s0 + pol(0.35, a, -0.1), s0 + pol(0.42, a, -L * 0.55), s0 + pol(0.4 + 0.08 * math.sin(k), a, -L)]
        tube(gm, vp, [0.045, 0.04, 0.03, 0.02], 4, rm, smooth=True, cap1="point")
    return [gm]


# ------------------------------------------------------------------ waterfall: cliff, water sheet, foam
def block_rock(g, rng, center, size, seed, col, bevel=0.1, cut=None, jitter=0.12, extra=8, subdiv=1.3, rough=0.05, R=None):
    hx, hy, hz = size[0] / 2, size[1] / 2, size[2] / 2
    pts = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            for sz in (-1, 1):
                pts.append(V(sx * hx * rng.u(1 - jitter, 1), sy * hy * rng.u(1 - jitter, 1), sz * hz * rng.u(1 - jitter, 1)))
    for _ in range(extra):
        ax = rng.i(0, 2)
        p = V(rng.u(-hx, hx) * 0.7, rng.u(-hy, hy) * 0.7, rng.u(-hz, hz) * 0.7)
        p[ax] = (hx, hy, hz)[ax] * rng.pick([-1, 1]) * rng.u(1.02, 1.28)
        pts.append(p)
    hull_rock(g, rng, V(hx, hy, hz), center, bevel=bevel, cut=cut, col=col, planar=13.0, R=R, subdiv=subdiv, rough=rough, seed=seed, pts=pts)


WATER_PROFILE = [(1.95, 5.45), (1.0, 5.72), (0.72, 5.3), (0.5, 4.6), (0.15, 4.5), (-0.38, 4.44), (-0.58, 4.05), (-0.7, 3.2), (-0.8, 2.3), (-0.87, 1.4), (-0.92, 0.6), (-0.95, 0.04)]
WATER_HALF = [0.75, 0.85, 0.95, 1.1, 1.25, 1.36, 1.4, 1.42, 1.44, 1.46, 1.48, 1.5]


def cliff(rng):
    """the falls: two rock piers and a lintel over a 2.6 u wide walk-through gap; the water runs over the lintel.
    Origin = middle of the gap at ground level; the front faces -y in Blender (+z, south, in the game)."""
    gm, gf = Geo("matte"), Geo("foliage")
    seed = rng.u(0, 80)

    def wet(p):  # darker where the spray lands
        return sstep(2.6 - abs(p[0]), 0.0, 1.6) * sstep(p[1], 1.5, -0.6) * 0.5
    col = rock_col(seed, CLIFF_L, CLIFF_M, CLIFF_D, moss=0.62, scale=2.2, wet=wet)
    B = []  # (centre, size)
    for sgn in (-1, 1):
        x0 = sgn * 1.3
        B += [((x0 + sgn * 1.25, 1.6, 1.5), (2.6, 3.6, 3.6)), ((x0 + sgn * 3.4, 1.9, 1.25), (2.6, 3.2, 3.1)), ((x0 + sgn * 5.0, 2.2, 0.8), (1.9, 2.6, 2.2)),
              ((x0 + sgn * 1.5, 2.0, 4.3), (2.9, 3.0, 2.3)), ((x0 + sgn * 3.6, 2.3, 3.6), (2.4, 2.6, 2.0)), ((x0 + sgn * 2.3, 2.6, 5.9), (2.6, 2.2, 1.5)),
              ((x0 + sgn * 0.75, -0.25, 0.55), (1.3, 1.3, 1.5)), ((x0 + sgn * 2.4, -0.35, 0.35), (1.5, 1.2, 1.0))]
    B += [((0.0, 1.45, 3.85), (3.6, 3.5, 1.15)), ((0.0, 2.55, 5.05), (2.3, 1.9, 1.3))]
    for i, (c, s) in enumerate(B):
        jc = V(c[0] + rng.u(-0.12, 0.12), c[1] + rng.u(-0.12, 0.12), c[2] + rng.u(-0.08, 0.08))
        lint = i >= len(B) - 2
        block_rock(gm, rng, jc, s, seed + i, col, cut=-0.3 if jc[2] - s[2] / 2 < 0.1 else None, R=rot(rng.vec(1), rng.u(0, 0.05)) if lint else rot(rng.vec(1), rng.u(0.03, 0.17)) @ rotz(rng.u(-0.25, 0.25)),
                   subdiv=1.7, jitter=0.1 if lint else 0.24)
    for k in range(6):  # loose boulders at the foot of the piers break the block rhythm
        sgn = -1 if k % 2 else 1
        rr = rng.u(0.45, 0.85)
        hull_rock(gm, rng, V(rr, rr * rng.u(0.8, 1.0), rr * rng.u(0.9, 1.2)), V(sgn * rng.u(2.0, 6.8), rng.u(-1.3, -0.4), 0.0), npts=11, bevel=0.12, cut=-0.3, col=col,
                  R=rot(rng.vec(1), rng.u(0, 0.4)), subdiv=0.8, seed=seed + 40 + k)
    # greenery on the ledges: fern tufts and a few hanging vines
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    bvh = BVHTree.FromPolygons([tuple(p) for p in gm.v], gm.f)

    def top(x, y):  # the rock surface under (x, y), so the greenery always roots in a ledge whatever the block jitter did
        hit = bvh.ray_cast(Vector((x, y, 12.0)), Vector((0, 0, -1)))
        return None if hit[0] is None else float(hit[0][2])
    for (x, y) in [(-2.6, 0.1), (2.9, 0.25), (-4.6, 0.7), (4.9, 0.9), (-1.9, 0.9), (2.2, 1.2), (-3.3, 1.6), (3.9, 1.5), (-5.9, 1.4)]:
        x += rng.u(-0.2, 0.2)
        z = top(x, y)
        if z is None or z < 0.8:
            continue
        o = V(x, y, z - 0.07)
        nq, y0 = rng.i(3, 4), rng.u(0, TAU)
        for q in range(nq):
            frond(gf, o + pol(0.02, y0 + q * TAU / nq), y0 + q * TAU / nq + rng.u(-0.3, 0.3), rng.u(0.6, 1.0), rng.u(0.5, 1.1), rng.u(1.3, 2.0), 0.17, n=7, crach=lin("#6f8a4c"),
                  cmid=jit(rng, FERN_M), ctip=jit(rng, FERN_L), hang=0.3, start=0.1, rng=rng)
    for (x, L) in ((-2.2, 2.0), (2.5, 1.6), (-3.9, 1.5), (1.75, 1.3)):
        y = 0.25
        z = top(x, y)
        if z is None or z < 1.5:
            continue
        hit = bvh.ray_cast(Vector((x, -6.0, z - 0.25)), Vector((0, 1, 0)))   # the front face below the ledge
        yf = float(hit[0][1]) if hit[0] is not None else -0.3
        vp = [V(x, yf + 0.5, z - 0.12), V(x, yf - 0.06, z - 0.1)]
        for q in range(1, 5):
            vp.append(V(x + 0.07 * math.sin(q * 1.9 + x), yf - 0.1 - 0.03 * q, z - 0.1 - L * q / 4))
        tube(gm, vp, [0.04, 0.04, 0.035, 0.03, 0.025, 0.018], 3, lin("#4d5a34"), smooth=True, cap1="point")
        for q in range(2, 6):
            for sgn in (-1, 1):
                leaf(gf, vp[q], unit(V(sgn, -0.5, -0.5)), UP, rng.u(0.26, 0.36), 0.17, LEAF_D, FERN_M, FERN_L, nb=unit(V(0, -1, 0.6)), bend=0.5)
    return [gm, gf]


def water_sheet(rng):
    """the falling water: a subdivided ribbon following WATER_PROFILE. uv.x across (0..1), uv.y = distance along the flow in
    world units (the shader scrolls it); vertex colour = white at the lip and the base (foam), aqua in between."""
    g = Geo("matte")
    prof = [V(0, y, z) for y, z in WATER_PROFILE]
    fine, halfw = [], []
    for i in range(len(prof) - 1):  # subdivide each span once so the curve is smooth
        for k in range(2):
            fine.append(mix(prof[i], prof[i + 1], k / 2))
            halfw.append(mix(WATER_HALF[i], WATER_HALF[i + 1], k / 2))
    fine.append(prof[-1])
    halfw.append(WATER_HALF[-1])
    cols = 8
    dist, rows = 0.0, []
    aqua, white = lin("#6cc4d2"), lin("#f2fbff")
    for i, p in enumerate(fine):
        if i:
            dist += float(np.linalg.norm(fine[i] - fine[i - 1]))
        row = []
        zrel = p[2]
        foam = max(sstep(zrel, 0.9, 0.0), sstep(abs(zrel - 4.45), 0.5, 0.0) * 0.8, sstep(abs(zrel - 5.6), 0.45, 0.0) * 0.6)
        for c in range(cols + 1):
            u = c / cols
            x = (u * 2 - 1) * halfw[i]
            bulge = -0.1 * (1 - (u * 2 - 1) ** 2) * sstep(4.4 - zrel, 0.0, 1.0)   # the curtain bows forward a little
            edge = sstep(abs(u * 2 - 1), 0.55, 1.0)
            cc = mix(aqua, white, clamp(foam + edge * 0.35))
            row.append(g.vert(V(x, p[1] + bulge + 0.03 * math.sin(c * 2.1 + i * 0.7), p[2]), cc, uv=(u, 1.0 - dist)))
        rows.append(row)
    for i in range(len(rows) - 1):
        for c in range(cols):
            g.quad(rows[i][c], rows[i + 1][c], rows[i + 1][c + 1], rows[i][c + 1], True)   # faces the camera side (-y)
    return [g]


def foam(rng):
    """foam on the pool where the sheet lands: a ring mesh (uv.x = angle 0..1, uv.y = 0 centre .. 1 edge) plus bobbing
    splash clumps (uv.y = 2 + phase, so the shader can tell them apart and animate them)."""
    g = Geo("matte")
    white, aqua = lin("#f4fbff"), lin("#a8dfe6")
    c0 = V(0, -1.0, 0.07)
    seg, rings = 20, [0.0, 0.35, 0.7, 1.0]
    rows = []
    for j, rr in enumerate(rings):
        row = []
        for k in range(seg + 1):
            a = TAU * k / seg
            rx, ry = 2.5 * rr, 1.5 * rr
            w = 1 + 0.12 * math.sin(a * 3 + 1.0) * rr + 0.06 * math.sin(a * 7) * rr
            p = c0 + V(math.cos(a) * rx * w, math.sin(a) * ry * w - 0.25 * rr, 0.004 * j)
            row.append(g.vert(p, mix(white, aqua, sstep(rr, 0.2, 1.0)), n=UP, uv=(k / seg, 1.0 - rr)))
        rows.append(row)
    for j in range(len(rows) - 1):
        for k in range(seg):
            g.quad(rows[j][k], rows[j][k + 1], rows[j + 1][k + 1], rows[j + 1][k], True, UP)
    for k in range(11):  # splash clumps along the impact line
        x = mix(-1.45, 1.45, k / 10) + rng.u(-0.08, 0.08)
        c = V(x, -0.98 + rng.u(-0.14, 0.1), 0.1)
        r = rng.u(0.16, 0.27)
        ph = rng.u(0, 1)
        base = len(g.v)
        blob(g, c, V(r, r * 0.9, r * 0.75), 0, white, smooth=True, normals=True)
        for i in range(base, len(g.v)):
            g.uv.append((0.5, 1.0 - (2.0 + ph)))
    return [g]
