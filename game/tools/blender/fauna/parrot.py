"""The parrot: a scarlet, yellow and blue macaw. 9 bones, clips perch_idle, takeoff, fly, land.

The bind pose has the wings spread (so the folded wings carry no baked shadow into flight); every clip is driven by
one pose function, pose(fold, flap, ...), so takeoff ends exactly on the first frame of fly and land ends on the
first frame of perch_idle. The origin is the perch point under the feet in every clip: the game moves the root.
"""
import math

from mathutils import Matrix, Vector

from fauna_lib import V, qsphere, ell, ring, loft, tube, ftube, disc, blade, smooth, bump, pulse, lerp, aa, mirror_q, Animal, Rig, bake_clips, S_, C_, TAU, X

TILT = math.radians(25)                                      # the perched body leans this far forward of upright
AX = Vector((0, -math.sin(TILT), math.cos(TILT)))            # body axis, rump to neck (Blender axes)
DOR = Vector((0, math.cos(TILT), math.sin(TILT)))            # dorsal: out of the bird's back
SH = V(0.115, 0.03, 0.47)                                    # left shoulder
SPAN = [0.0, 0.13, 0.3, 0.46, 0.64]                          # wing stations along the span; the wrist is at 0.3
LE = [0.1, 0.1, 0.085, 0.05, -0.03]                          # leading edge along the body axis
TE = [-0.15, -0.2, -0.21, -0.17, -0.1]                       # trailing edge
TH = [0.034, 0.028, 0.022, 0.014, 0.007]
RUMP = V(0, -0.1, 0.2)


def wp(s, c, n=0.0):
    """a point on the left wing: s out along the span, c along the body axis, n out of the back"""
    return SH + X * s + AX * c + DOR * n


def build():
    a = Animal("parrot")
    rot = Matrix.Rotation(TILT, 4, "X")
    body = ell(4, V(0, -0.01, 0.345), (0.14, 0.155, 0.215), "p_red", rot)
    body.reg_where("p_red2", lambda c: (c - V(0, -0.01, 0.345)).dot(DOR) > 0.09)                         # darker down the back
    a.add(body, "body")
    hc = V(0, 0.1, 0.63)
    head = qsphere(4, "p_red").xf(lambda q: hc + Vector((q.x * 0.122, q.y * 0.138, q.z * 0.122 + 0.02 * max(0.0, q.z) * max(0.0, q.y))))
    head.reg_where("p_face", lambda c: abs(c.x) > 0.07 and -(c.y - hc.y) > 0.01 and -0.07 < c.z - hc.z < 0.075)   # bare white cheeks
    a.add(head, "head")
    a.add(ftube([V(0, 0.19, 0.655), V(0, 0.285, 0.64), V(0, 0.335, 0.58), V(0, 0.325, 0.5)], [0.074, 0.066, 0.044, 0.008], 6, "p_beak", up=X, flat=0.72,
                regs=["p_beak", "p_beak", "p_beak2"], cap0=0.2), "head")                                  # the hooked upper beak
    a.add(tube([V(0, 0.19, 0.565), V(0, 0.265, 0.535), V(0, 0.3, 0.515)], [0.052, 0.042, 0.01], 5, "p_beak2"), "head")
    a.both(disc(V(0.117, 0.15, 0.655), Vector((1, -0.25, 0.1)), 0.027, 0.012), "head")                   # eyes
    wing = M_wing(0, 2, ["p_red", "p_yellow"])
    a.both(wing, "wing_L")
    tip = M_wing(2, 4, ["p_blue", "p_blue2"])
    for i, s in enumerate((0.36, 0.45, 0.54, 0.62)):                                                    # primaries, fanned out past the tip
        c0 = lerp(TE[2], TE[4], (s - 0.3) / 0.34) + 0.05
        tip.add(blade([wp(s, c0), wp(s + 0.05 + 0.03 * i, c0 - 0.15 + 0.035 * i), wp(s + 0.08 + 0.05 * i, c0 - 0.24 + 0.06 * i)], [0.05, 0.05, 0.008], 0.22, "p_blue2", up=DOR))
    a.both(tip, "wingtip_L")
    sec = M_feathers()
    a.both(sec, "wing_L")
    tail = blade([RUMP + V(0, 0.03, 0.02), V(0, -0.36, 0.1), V(0, -0.66, 0.035)], [0.07, 0.06, 0.012], 0.3, "p_red", regs=["p_red", "p_blue"])
    for sx in (-1, 1):
        tail.add(blade([RUMP + V(sx * 0.03, 0.03, 0.02), V(sx * 0.08, -0.32, 0.105), V(sx * 0.12, -0.54, 0.055)], [0.06, 0.055, 0.012], 0.3, "p_blue", regs=["p_blue", "p_blue2"]))
    a.add(tail, "tail")
    leg = ell(1, V(0.065, -0.03, 0.2), (0.06, 0.06, 0.085), "p_red")
    leg.add(ftube([V(0.065, -0.02, 0.16), V(0.065, 0.0, 0.03)], [0.026, 0.022], 4, "p_foot", cap1=0.0))
    leg.add(ell(1, V(0.065, 0.025, 0.02), (0.045, 0.075, 0.021), "p_foot"))
    a.both(leg, "legs")
    bones = [("root", None, V(0, 0, 0), V(0, 0, 0.1), False), ("body", "root", RUMP, V(0, 0.04, 0.5), True), ("head", "body", V(0, 0.05, 0.53), V(0, 0.12, 0.76), True),
             ("tail", "body", RUMP, V(0, -0.6, 0.05), True), ("legs", "body", V(0, -0.03, 0.22), V(0, 0, 0.0), True)]
    for s, f in (("_L", lambda v: v), ("_R", lambda v: Vector((-v.x, v.y, v.z)))):
        bones += [("wing" + s, "body", f(wp(0, 0)), f(wp(0.3, 0)), True), ("wingtip" + s, "wing" + s, f(wp(0.3, 0)), f(wp(0.64, 0)), True)]
    a.finish(bones, ao_dist=0.14, ao_strength=0.9)
    rig = Rig(a)
    bake_clips(a, rig, clips(rig))
    a.notes = {"origin": "the perch point under the feet, in every clip (the body sits about 0.35 m above it)", "chain": "takeoff ends on fly's first frame; land starts there and ends on perch_idle's first frame"}
    return a


def M_wing(i0, i1, regs):
    """the wing slab between two span stations: a thin lens section lofted along the span"""
    rings = []
    for i in range(i0, i1 + 1):
        s, mid = SPAN[i], (LE[i] + TE[i]) / 2
        rings.append([wp(s, LE[i]), wp(s, mid, TH[i]), wp(s, TE[i]), wp(s, mid, -TH[i])])
    return loft(rings, regs, wp(SPAN[i0] - 0.02, (LE[i0] + TE[i0]) / 2), wp(SPAN[i1] + (0.02 if i1 < 4 else 0.05), (LE[i1] + TE[i1]) / 2))


def M_feathers():
    """secondaries: short blades off the inner wing's trailing edge"""
    m = None
    for i, s in enumerate((0.07, 0.17, 0.27)):
        c0 = lerp(TE[0], TE[2], s / 0.3) + 0.05
        b = blade([wp(s, c0), wp(s + 0.01, c0 - 0.13), wp(s + 0.02, c0 - 0.2)], [0.055, 0.055, 0.01], 0.22, "p_green" if i == 0 else "p_blue", up=DOR)
        m = b if m is None else m.add(b)
    return m


def pose(fold=0.0, flap=0.0, tipflap=0.0, bp=0.0, hp=0.0, hy=0.0, hr=0.0, tail=0.0, legs=0.0, dz=0.0, df=0.0, sweep=0.0, by=0.0, br=0.0):
    """fold 1 = wings folded over the back, 0 = spread; flap = wing angle up from flat (deg); bp = body pitch down from
    the perched lean; hp, hy, hr = head pitch, yaw, tilt; tail, legs = pitch; dz, df = body offset; sweep = extra
    backward sweep of the spread wing"""
    qw = aa(AX, lerp(flap, -44.0, fold)) @ aa(DOR, lerp(sweep, 80.0, fold))
    qt = aa(DOR, 76.0 * fold) @ aa(AX, tipflap * (1 - fold))
    return {"loc:body": (0, df, dz), "body": (bp, by, br), "head": (hp, hy, hr), "tail": (tail, 0, 0), "legs": (legs, 0, 0),
            "wing_L": qw, "wing_R": mirror_q(qw), "wingtip_L": qt, "wingtip_R": mirror_q(qt)}


def clips(rig):
    def fly_args(p):
        return dict(fold=0.0, flap=6 + 40 * S_(p), tipflap=30 * S_(p - 1.0), bp=54, hp=-46, tail=-20 + 5 * S_(p + 0.5), legs=78, dz=0.03 * C_(p), sweep=6 - 6 * S_(p))

    def fly(t):
        return pose(**fly_args(TAU * t))

    def perch(t):
        p = TAU * t
        look = pulse(t, 0.2, 0.26, 0.5, 0.56)
        ruff = bump(t, 0.8, 0.16)
        return pose(fold=1 - 0.2 * ruff, flap=16 * ruff, dz=0.006 * S_(p) + 0.012 * ruff, bp=1.5 * S_(p), hp=-2 * S_(p + 0.6) + 8 * bump(t, 0.72, 0.12),
                    hy=26 * look, hr=16 * look + 3 * S_(2 * p), tail=3 * S_(p + 1) - 8 * ruff)

    def mixargs(a, b, k):
        return {key: lerp(a.get(key, 0.0), b.get(key, 0.0), k) for key in set(a) | set(b)}

    P0, F0 = dict(fold=1.0), fly_args(0.0)

    def takeoff(t):
        crouch = bump(t, 0.2, 0.36)
        spread = smooth(0.22, 0.5, t)
        up = pulse(t, 0.26, 0.5, 0.56, 0.86)                 # wings thrown up, then the first downstroke into the loop
        k = smooth(0.4, 0.95, t)
        a = mixargs(P0, F0, k)
        a.update(fold=1 - spread, flap=lerp(0, F0["flap"], k) + 62 * up, tipflap=20 * up, dz=-0.055 * crouch + lerp(0, F0["dz"], k), legs=-14 * crouch + F0["legs"] * smooth(0.45, 0.9, t),
                 bp=10 * crouch + F0["bp"] * smooth(0.34, 0.95, t), hp=-6 * crouch + F0["hp"] * smooth(0.34, 0.95, t))
        return pose(**a)

    def land(t):
        k = smooth(0.0, 0.5, t)                              # out of the flying pose
        flare = pulse(t, 0.05, 0.3, 0.5, 0.72)
        beat = S_(TAU * 3 * t) * pulse(t, 0.0, 0.1, 0.5, 0.66)
        touch = bump(t, 0.62, 0.22)
        a = mixargs(F0, P0, k)
        a.update(fold=smooth(0.56, 0.92, t), flap=lerp(F0["flap"], 0, k) + 26 * flare + 30 * beat, tipflap=24 * beat, sweep=-14 * flare,
                 bp=F0["bp"] * (1 - smooth(0.0, 0.36, t)) - 16 * flare + 5 * touch, hp=F0["hp"] * (1 - smooth(0.0, 0.4, t)) + 8 * flare,
                 legs=F0["legs"] * (1 - smooth(0.0, 0.3, t)) - 30 * pulse(t, 0.12, 0.34, 0.5, 0.64), dz=lerp(F0["dz"], 0, k) + 0.05 * flare - 0.035 * touch, tail=-20 * (1 - k) + 24 * flare)
        return pose(**a)

    return {"perch_idle": (72, True, perch), "takeoff": (18, False, rig.bridge(takeoff, start=perch(0.0), end=fly(0.0), w0=0.1, w1=0.12)), "fly": (12, True, fly),
            "land": (20, False, rig.bridge(land, start=fly(0.0), end=perch(0.0), w0=0.08, w1=0.12))}
