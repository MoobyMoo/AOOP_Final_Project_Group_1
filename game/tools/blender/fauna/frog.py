"""The tree frog: chunky, green, orange-eyed. 11 bones, clips idle and hop.

`hop` is one in-place jump: the arc (up to HOP_H) is baked on the body bone and the game slides the frog along the
ground while it is airborne (AIR[0]..AIR[1] of the clip). It starts and ends on the first frame of `idle`.
"""
import math

from mathutils import Vector

from fauna_lib import V, qsphere, ell, tube, ftube, disc, smooth, bump, pulse, lerp, Animal, Rig, bake_clips, S_, TAU, UP

HOP_H, AIR = 0.42, (0.24, 0.78)
SHOULDER, WRIST = V(0.15, 0.13, 0.13), V(0.2, 0.275, 0.03)
HIP, KNEE, ANKLE, TOES = V(0.13, -0.14, 0.12), V(0.3, 0.03, 0.12), V(0.27, -0.17, 0.05), V(0.33, 0.05, 0.02)
THROAT = V(0, 0.19, 0.09)


def body_pt(q):
    f = -q.y
    front = max(0.0, f)
    z = q.z * (0.15 if q.z > 0 else 0.13) + 0.165 + 0.06 * front - 0.02 * max(0.0, -f)
    return V(q.x * 0.21 * (1 + 0.1 * front - 0.12 * max(0.0, q.z)), f * 0.25, max(z, 0.035))


def build():
    a = Animal("frog")
    body = qsphere(4, "f_green").xf(body_pt)
    body.reg_where("f_belly", lambda c: c.z < 0.115 + 0.09 * max(0.0, -c.y / 0.25))
    body.reg_where("f_green2", lambda c: c.z > 0.27 and abs(c.x) < 0.12 and -0.16 < -c.y < 0.02)        # a darker saddle on the back

    def w_body(co):
        k = smooth(0.15, 0.0, (co - THROAT).length) * 0.85
        return {"body": 1 - k, "throat": k}
    a.add(body, w_body)
    a.add(tube([V(-0.185, 0.1, 0.168), V(-0.115, 0.215, 0.188), V(0, 0.262, 0.196), V(0.115, 0.215, 0.188), V(0.185, 0.1, 0.168)], [0.008, 0.012, 0.013, 0.012, 0.008], 3, "dark"),
          "body")                                                                                       # the wide mouth
    ec = V(0.118, 0.125, 0.325)
    out = Vector((0.55, -0.8, 0.22)).normalized()
    eye = ell(2, ec, (0.082, 0.082, 0.082), "f_eye")
    eye.add(disc(ec + out * 0.08, out, 0.046, 0.012, flat=0.5, up=UP))                                   # a horizontal pupil
    a.both(eye, "body")
    arm = tube([SHOULDER, V(0.235, 0.175, 0.085), WRIST], [0.05, 0.043, 0.036], 4, "f_green")
    arm.add(ell(1, V(0.205, 0.305, 0.022), (0.07, 0.06, 0.02), "f_toe"))
    a.both(arm, "arm_L")
    a.both(tube([HIP, KNEE], [0.085, 0.06], 4, "f_green"), "thigh_L")
    a.both(tube([KNEE, ANKLE], [0.055, 0.042], 4, "f_green"), "shin_L")
    foot = ftube([ANKLE, TOES], [0.036, 0.05], 4, "f_green", flat=0.45)
    foot.add(ell(1, TOES + V(0.005, 0.03, 0), (0.075, 0.055, 0.018), "f_toe"))
    a.both(foot, "foot_L")
    bones = [("root", None, V(0, 0, 0), V(0, 0, 0.1), False), ("body", "root", V(0, -0.12, 0.13), V(0, 0.14, 0.2), True),
             ("throat", "body", THROAT, THROAT + V(0, 0.06, -0.04), True)]
    for s, f in (("_L", lambda v: v), ("_R", lambda v: Vector((-v.x, v.y, v.z)))):
        bones += [("arm" + s, "body", f(SHOULDER), f(WRIST), True), ("thigh" + s, "body", f(HIP), f(KNEE), True),
                  ("shin" + s, "thigh" + s, f(KNEE), f(ANKLE), True), ("foot" + s, "shin" + s, f(ANKLE), f(TOES), True)]
    a.finish(bones, ao_dist=0.12, ao_strength=1.0)
    rig = Rig(a)
    bake_clips(a, rig, clips(rig))
    a.notes = {"hop": "apex %.2f m, baked on the body bone; airborne from %.2f to %.2f of the clip: move the frog along the ground only then" % (HOP_H, AIR[0], AIR[1])}
    return a


def clips(rig):
    def idle(t):
        p = TAU * t
        croak = bump(t, 0.14, 0.2) + bump(t, 0.36, 0.2) + bump(t, 0.58, 0.2)
        return {"loc:body": (0, 0, 0.006 * S_(p)), "body": (-1.6 * S_(p), 3 * S_(p - 0.7), 0),
                "loc:throat": (0, 0.03 * croak, -0.035 * croak), "arm_L": (2 * S_(p), 0, 0), "arm_R": (2 * S_(p), 0, 0)}

    def legs(ext, splay=0.0):
        """ext 0 = folded (rest), 1 = kicked straight out behind; splay opens the knees"""
        out = {}
        for s, sx in (("L", 1), ("R", -1)):
            out["thigh_" + s] = (16 * ext, sx * (104 * ext + 14 * splay), 0)
            out["shin_" + s] = (-10 * ext, sx * -128 * ext, 0)
            out["foot_" + s] = (-6 * ext, sx * 176 * ext, 0)
        return out

    def hop(t):
        u = min(1.0, max(0.0, (t - AIR[0]) / (AIR[1] - AIR[0])))
        z = HOP_H * 4 * u * (1 - u)
        crouch = bump(t, 0.13, 0.26)
        land = bump(t, AIR[1] + 0.05, 0.2)
        ext = pulse(t, 0.14, 0.27, 0.46, 0.72)
        reach = pulse(t, 0.5, 0.66, 0.78, 0.9)
        sweep = pulse(t, 0.18, 0.3, 0.44, 0.6)
        pitch = -9 * crouch - 26 * pulse(t, 0.16, 0.28, 0.36, 0.52) + 15 * pulse(t, 0.5, 0.62, 0.68, 0.78) - 3 * land
        arm = (58 * sweep - 34 * reach, 0, 0)
        return {"loc:body": (0, 0, z - 0.04 * crouch - 0.022 * land), "body": (pitch, 0, 0), "arm_L": arm, "arm_R": arm,
                **legs(ext, 0.5 * crouch + 0.6 * land)}

    return {"idle": (60, True, idle), "hop": (24, False, rig.bridge(hop, start=idle(0.0), end=idle(0.0), w0=0.1, w1=0.12))}
