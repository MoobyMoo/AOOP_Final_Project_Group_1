"""The mangrove crocodile: low and long. 13 bones, clips lurk, surface, bite, swim, retreat, death.

THE ORIGIN IS ON THE WATER LINE (y = 0 in three.js). The bind pose is the crocodile surfaced: back and head out of
the water. `lurk` hangs LURK below that, so only the eyes, the nostrils and the ridge of scutes break the surface.
Clip chain: lurk -> surface (ends on the surfaced pose) -> bite (starts and ends on it; the jaws snap shut BITE_REACH
ahead of the origin at BITE_AT of the clip) -> retreat (backs off and sinks until nothing is above the water) or death
(rolls belly-up and floats). `swim` is the travelling loop.
"""
import math

from mathutils import Vector

import bv_common as C
from fauna_lib import V, qsphere, ell, tube, ftube, disc, spike, spine, smooth, bump, pulse, lerp, lr, Animal, Rig, bake_clips, S_, C_, TAU, UP, FWD, X

LURK, SWIM = -0.15, -0.1
BITE_REACH, BITE_AT = 0.95, 0.47
BODY = [(-2.5, -0.05, 0.02, 0.05), (-2.25, -0.05, 0.06, 0.12), (-1.95, -0.06, 0.1, 0.16), (-1.65, -0.07, 0.15, 0.185), (-1.35, -0.08, 0.21, 0.205), (-1.05, -0.09, 0.28, 0.225),
        (-0.78, -0.1, 0.36, 0.245), (-0.45, -0.1, 0.43, 0.26), (-0.05, -0.1, 0.47, 0.265), (0.35, -0.09, 0.45, 0.255), (0.68, -0.07, 0.38, 0.225), (0.95, -0.04, 0.31, 0.19)]
SKULL = [(0.84, 0.0, 0.3, 0.17), (1.1, 0.02, 0.315, 0.165), (1.36, 0.02, 0.25, 0.115), (1.7, 0.005, 0.2, 0.088), (1.98, 0.005, 0.215, 0.088), (2.1, 0.0, 0.15, 0.065)]
JAW = [(0.92, -0.16, 0.27, 0.07), (1.3, -0.15, 0.225, 0.055), (1.7, -0.14, 0.18, 0.045), (1.98, -0.135, 0.19, 0.045), (2.07, -0.135, 0.125, 0.035)]
JOINTS = [V(0, -2.5, -0.05), V(0, -1.95, -0.06), V(0, -1.5, -0.075), V(0, -1.05, -0.09), V(0, -0.6, -0.1), V(0, 0.2, -0.09), V(0, 0.95, -0.04)]
F_LEG = [V(0.38, 0.5, -0.16), V(0.66, 0.54, -0.2), V(0.84, 0.72, -0.31)]
H_LEG = [V(0.4, -0.45, -0.16), V(0.7, -0.54, -0.2), V(0.88, -0.32, -0.32)]


def half_w(st, f):
    for (f0, _z0, w0, _h0), (f1, _z1, w1, _h1) in zip(st, st[1:]):
        if f0 <= f <= f1:
            return lerp(w0, w1, (f - f0) / (f1 - f0))
    return st[-1][2]


def top(st, f):
    for (f0, z0, _w0, h0), (f1, z1, _w1, h1) in zip(st, st[1:]):
        if f0 <= f <= f1:
            return lerp(z0 + h0, z1 + h1, (f - f0) / (f1 - f0))
    return st[-1][1] + st[-1][3]


def build():
    a = Animal("croc")
    w_body = C.chain_weights(JOINTS, ["tail4", "tail3", "tail2", "tail1", "body", "chest"], 0.6)
    body = spine(BODY, 12, "k_back", p=2.7, cap0=0.4, cap1=0.3)
    body.reg_where("k_back2", lambda c: c.z > -0.08 and int((-c.y + 3.0) / 0.34) % 2 == 0)              # dark bands across the back
    body.reg_where("k_belly", lambda c: c.z < -0.17)
    a.add(body, w_body)
    skull = spine(SKULL, 10, "k_back", p=2.7, cap0=0.3, cap1=0.5)
    skull.reg_where("k_mouth", lambda c: -c.y > 1.2 and c.z < -0.06)                                      # the roof of the mouth
    a.add(skull, "head")
    jaw = spine(JAW, 8, "k_back", p=2.7, cap0=0.3, cap1=0.5)
    jaw.reg_where("k_belly", lambda c: c.z < -0.15)
    jaw.reg_where("k_mouth", lambda c: c.z > -0.105 and -c.y > 1.0)
    a.add(jaw, "jaw")
    up_teeth, lo_teeth = None, None
    for i, f in enumerate((1.26, 1.42, 1.58, 1.74, 1.9, 2.02)):                                         # teeth: the upper row hangs outside the jaw
        x = half_w(SKULL, f) - 0.035
        r = 0.04 if i in (0, 4) else 0.032
        t = spike(V(x, f, -0.055), V(x + 0.012, f + 0.01, -0.2 if i in (0, 4) else -0.17), r, 3, "k_tooth")
        up_teeth = t if up_teeth is None else up_teeth.add(t)
    for f in (1.34, 1.5, 1.66, 1.82):                                                                   # the lower row shows when the mouth opens
        x = half_w(JAW, f) - 0.04
        t = spike(V(x, f, -0.12), V(x, f, -0.02), 0.028, 3, "k_tooth")
        lo_teeth = t if lo_teeth is None else lo_teeth.add(t)
    a.both(up_teeth, "head")
    a.both(lo_teeth, "jaw")
    eye = ell(2, V(0.165, 1.0, 0.185), (0.1, 0.125, 0.09), "k_back2")                                   # the eye turret
    ec = V(0.2, 1.035, 0.225)
    out = Vector((0.82, -0.5, 0.28)).normalized()
    eye.add(ell(2, ec, (0.058, 0.058, 0.058), "k_eye"))
    eye.add(disc(ec + out * 0.056, out, 0.034, 0.01, flat=0.42, up=FWD))                                 # a slit pupil
    eye.add(ftube([V(0.085, 1.13, 0.255), V(0.285, 0.95, 0.305)], [0.035, 0.05], 4, "k_back2", flat=0.5, cap0=0.4, cap1=0.4))   # the brow ridge
    a.both(eye, "head")
    a.add(ell(2, V(0, 1.99, 0.1), (0.125, 0.1, 0.075), "k_back"), "head")                                # the nostril bump
    a.both(disc(V(0.045, 2.0, 0.172), UP, 0.024, 0.008, "dark", 5), "head")
    sc = None
    for i in range(6):                                                                                  # scutes: two rows down the back, one down the tail
        f = lerp(0.74, -0.52, i / 5)
        for sx in (-1, 1):
            t = spike(V(sx * 0.15, f, top(BODY, f) - 0.035), V(sx * 0.16, f - 0.05, top(BODY, f) + 0.085), 0.075, 4, "k_back2")
            sc = t if sc is None else sc.add(t)
    for i in range(8):
        f = lerp(-0.76, -2.2, i / 7)
        sc.add(spike(V(0, f, top(BODY, f) - 0.03), V(0, f - 0.06, top(BODY, f) + lerp(0.12, 0.06, i / 7)), lerp(0.08, 0.04, i / 7), 4, "k_back2"))
    a.add(sc, w_body)
    for pts, bone in ((F_LEG, "leg_F_L"), (H_LEG, "leg_H_L")):
        leg = tube([pts[0] + V(-0.08, 0, 0.04), pts[1], pts[2]], [0.12, 0.095, 0.07], 5, "k_back")
        leg.add(ell(1, pts[2] + V(0.03, 0.05, -0.02), (0.1, 0.12, 0.035), "k_back2"))
        for k in (-1, 0, 1):
            leg.add(spike(pts[2] + V(0.06 + 0.03 * k, 0.12, -0.02), pts[2] + V(0.08 + 0.07 * k, 0.24, -0.03), 0.022, 3, "k_claw"))
        a.both(leg, bone)
    bones = [("root", None, V(0, 0, 0), V(0, 0, 0.2), False), ("body", "root", JOINTS[4], JOINTS[5], True), ("chest", "body", JOINTS[5], JOINTS[6], True),
             ("head", "chest", JOINTS[6], V(0, 2.1, 0.0), True), ("jaw", "head", V(0, 1.0, -0.11), V(0, 2.07, -0.135), True),
             ("tail1", "body", JOINTS[4], JOINTS[3], True), ("tail2", "tail1", JOINTS[3], JOINTS[2], True), ("tail3", "tail2", JOINTS[2], JOINTS[1], True),
             ("tail4", "tail3", JOINTS[1], JOINTS[0], True)]
    for s, f in (("_L", lambda v: v), ("_R", lambda v: Vector((-v.x, v.y, v.z)))):
        bones += [("leg_F" + s, "chest", f(F_LEG[0]), f(F_LEG[2]), True), ("leg_H" + s, "body", f(H_LEG[0]), f(H_LEG[2]), True)]
    a.finish(bones, ao_dist=0.3, ao_strength=1.0)
    rig = Rig(a)
    bake_clips(a, rig, clips(rig))
    a.notes = {"waterline": "the origin (y = 0) is the water line; the bind pose is surfaced, lurk hangs %.2f m lower, swim %.2f m lower" % (-LURK, -SWIM),
               "bite": "starts and ends on the surfaced pose; the jaws snap shut %.2f m ahead of the origin at %.2f of the clip" % (BITE_REACH, BITE_AT),
               "retreat": "backs off 0.7 m and ends fully under the water line", "death": "ends belly-up, floating at the water line"}
    return a


def tailwave(p, amp, lag=0.8):
    """a wave running down the tail: {tailN: (0, yaw, 0)}"""
    return {"tail%d" % (i + 1): (0, amp * (0.55 + 0.3 * i) * S_(p - lag * (i + 1)), 0) for i in range(4)}


def legs(tuck=0.0, paddle=0.0, limp=0.0):
    """tuck sweeps the legs back along the body; paddle swings them; limp lets them hang out (belly-up)"""
    out = {}
    for s, sx in (("L", 1), ("R", -1)):
        out["leg_F_" + s] = (0, sx * (62 * tuck + paddle), sx * -40 * limp)
        out["leg_H_" + s] = (0, sx * (40 * tuck - paddle), sx * -40 * limp)
    return out


def clips(rig):
    def lurk(t):
        p = TAU * t
        return {"loc:body": (0, 0, LURK + 0.012 * S_(p)), "body": (0.6 * S_(p + 0.5), 1.5 * S_(p), 0), "chest": (0, -1.0 * S_(p), 0), "head": (-3.5 + 0.8 * S_(p + 1), -0.5 * S_(p), 0),
                "jaw": (1.5, 0, 0), **tailwave(p, 7), **legs(0.25, 3 * S_(p + 1))}

    SURF = {"loc:body": (0, 0, 0), "head": (-6, 0, 0), "jaw": (5, 0, 0), **legs(0.1)}
    L0 = lurk(0.0)

    def surface(t):
        k = smooth(0.0, 0.62, t)
        over = bump(t, 0.56, 0.5)
        hiss = pulse(t, 0.3, 0.55, 0.62, 0.92)
        p = rig.mix(L0, SURF, k)
        p["loc:body"] = (0, 0.06 * over, lerp(LURK, 0, k) + 0.06 * over)
        p["head"] = (lerp(-3.5, -6, k) - 9 * hiss, 0, 0)
        p["jaw"] = (lerp(1.5, 5, k) + 16 * hiss, 0, 0)
        p.update(tailwave(TAU * 1.5 * t, 14 * (1 - k * 0.6)))
        return p

    def bite(t):
        back = pulse(t, 0.0, 0.2, 0.26, 0.4)                  # the pull back, jaws opening
        go = smooth(0.26, BITE_AT, t) * (1 - smooth(0.6, 0.96, t))
        gape = pulse(t, 0.04, 0.28, BITE_AT - 0.07, BITE_AT)
        shake = S_(TAU * 4.5 * (t - BITE_AT)) * pulse(t, BITE_AT, BITE_AT + 0.04, 0.7, 0.8)
        return {"loc:body": (0, -0.16 * back + BITE_REACH * go, 0.05 * back + 0.1 * go), "body": (-3 * back - 4 * go, 3 * shake, 0), "chest": (-4 * back - 3 * go, 4 * shake, 0),
                "head": (-6 - 20 * gape + 5 * go * (1 - gape), 7 * shake, 5 * shake), "jaw": (5 + 44 * gape - 4 * go * (1 - gape), 0, 0),
                **tailwave(TAU * 2 * t, 10 + 22 * go), **legs(0.1 + 0.5 * go, 0)}

    def swim(t):
        p = TAU * t
        return {"loc:body": (0.03 * S_(p + 0.6), 0, SWIM + 0.01 * S_(2 * p)), "body": (0, 5 * S_(p), 2 * S_(p + 0.8)), "chest": (0, -4 * S_(p - 0.3), 0), "head": (-3, -3.5 * S_(p - 0.6), 0),
                "jaw": (1.5, 0, 0), **tailwave(p, 20), **legs(0.9, 5 * S_(p))}

    def retreat(t):
        k = smooth(0.08, 1.0, t)
        return {"loc:body": (0, -0.7 * smooth(0.05, 0.9, t), -0.78 * k ** 1.3), "body": (-9 * pulse(t, 0.05, 0.4, 0.7, 1.0), 4 * S_(TAU * 1.5 * t), 0), "chest": (0, -3 * S_(TAU * 1.5 * t), 0),
                "head": (-6 + 4 * k, 0, 0), "jaw": (5 - 4 * smooth(0, 0.3, t), 0, 0), **tailwave(TAU * 1.5 * t, 22 * (1 - 0.5 * k)), **legs(0.1 + 0.6 * k, 8 * S_(TAU * 2 * t))}

    def death(t):
        thrash = pulse(t, 0.0, 0.1, 0.3, 0.46)
        roll = smooth(0.24, 0.74, t)
        limp = smooth(0.5, 0.9, t)
        bob = 0.03 * bump(t, 0.82, 0.3)
        w = TAU * 3 * t
        tw = {"tail%d" % (i + 1): (0, 34 * thrash * S_(w - 0.9 * (i + 1)) + 9 * limp * (i + 1) / 4, 0) for i in range(4)}
        return {"loc:body": (0.05 * thrash * S_(w), -0.1 * thrash, 0.08 * thrash + 0.03 * roll - bob), "body": (-5 * thrash, 6 * thrash * S_(w), 180 * roll), "chest": (-6 * thrash, -6 * thrash * S_(w), 0),
                "head": (-6 - 22 * thrash + 14 * limp, 8 * thrash * S_(w + 1), 0), "jaw": (5 + 36 * thrash + 16 * limp, 0, 0), **tw, **legs(0.1, 14 * thrash * S_(w), limp)}

    return {"lurk": (90, True, lurk), "surface": (24, False, rig.bridge(surface, start=L0, end=SURF, w0=0.06, w1=0.2)), "bite": (18, False, rig.bridge(bite, start=SURF, end=SURF, w0=0.08, w1=0.2)),
            "swim": (30, True, swim), "retreat": (30, False, rig.bridge(retreat, start=SURF, w0=0.1)), "death": (45, False, rig.bridge(death, start=SURF, w0=0.08))}
