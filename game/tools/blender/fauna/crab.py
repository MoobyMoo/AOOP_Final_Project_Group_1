"""The beach crab: a small red-orange crab with big claws. 14 bones, clips idle, scuttle, flee, burrow.

It walks sideways: `scuttle` and `flee` are in-place loops that read as travelling toward the crab's own LEFT
(+x in Blender and three.js), so the game yaws it a quarter turn off its heading.
"""
import math

from fauna_lib import V, qsphere, ell, tube, disc, smooth, bump, pulse, Animal, Rig, bake_clips, S_, C_, TAU, FWD

LEGS = [(0.03, 0.09, 0.07), (-0.07, -0.02, -0.03), (-0.16, -0.14, -0.15)]     # hip forward, knee forward, tip forward
SHOULDER, WRIST = V(0.2, 0.08, 0.2), V(0.41, 0.38, 0.27)
PIVOT, NIP = V(0.345, 0.53, 0.3), V(0.4, 0.78, 0.3)


def hip(i):
    return V(0.21 - 0.012 * i, LEGS[i][0], 0.2)


def toe(i):
    return V(0.56 - 0.02 * i, LEGS[i][2], 0.0)


def build():
    a = Animal("crab")
    shell = qsphere(4, "c_shell").xf(lambda q: V(q.x * 0.31 * (1 + 0.14 * -q.y), -q.y * 0.2, 0.225 + q.z * (0.15 if q.z > 0 else 0.095)))
    shell.reg_where("c_belly", lambda c: c.z < 0.17)
    shell.reg_where("c_shell2", lambda c: c.z > 0.33 and 0.06 < abs(c.x) < 0.2 and -0.1 < -c.y < 0.04)       # two darker blotches on the back
    a.add(shell, "body")
    a.add(tube([V(-0.075, 0.196, 0.205), V(0, 0.214, 0.172), V(0.075, 0.196, 0.205)], [0.011, 0.014, 0.011], 3, "dark"), "body")   # a small smile
    eye = tube([V(0.1, 0.13, 0.3), V(0.118, 0.17, 0.45)], [0.032, 0.026], 4, "c_shell")
    eye.add(ell(2, V(0.118, 0.182, 0.482), (0.066, 0.066, 0.066), "white"))
    eye.add(disc(V(0.118, 0.243, 0.488), FWD, 0.034))
    a.both(eye, "eye_L")
    claw = tube([SHOULDER, V(0.4, 0.23, 0.22), WRIST], [0.05, 0.058, 0.05], 5, "c_claw")
    claw.add(ell(2, V(0.41, 0.47, 0.295), (0.115, 0.145, 0.09), "c_claw"))                                   # the fat palm
    claw.add(tube([V(0.455, 0.53, 0.285), V(0.49, 0.67, 0.29), V(0.415, 0.785, 0.3)], [0.062, 0.05, 0.008], 4, "c_claw", regs=["c_claw", "c_tip"]))   # fixed finger
    a.both(claw, "claw_L")
    a.both(tube([PIVOT, V(0.325, 0.67, 0.315), V(0.39, 0.775, 0.3)], [0.05, 0.042, 0.008], 4, "c_claw", regs=["c_claw", "c_tip"]), "pincer_L")
    for i, (fh, fk, ft) in enumerate(LEGS):
        leg = tube([hip(i), V(0.4 - 0.01 * i, fk, 0.275), V(0.5 - 0.015 * i, (fk + ft) / 2, 0.15), toe(i)], [0.042, 0.05, 0.038, 0.007], 3, "c_leg",
                   regs=["c_leg", "c_leg", "c_leg2"])
        a.both(leg, "leg_L%d" % (i + 1))
    bones = [("root", None, V(0, 0, 0), V(0, 0, 0.1), False), ("body", "root", V(0, 0, 0.12), V(0, 0, 0.3), True)]
    for s, f in (("_L", lambda v: v), ("_R", lambda v: V(-v.x, -v.y, v.z))):
        bones += [("eye" + s, "body", f(V(0.1, 0.13, 0.3)), f(V(0.118, 0.182, 0.482)), True), ("claw" + s, "body", f(SHOULDER), f(WRIST), True),
                  ("pincer" + s, "claw" + s, f(PIVOT), f(NIP), True)]
        bones += [("leg%s%d" % (s, i + 1), "body", f(hip(i)), f(toe(i)), True) for i in range(3)]
    a.finish(bones, ao_dist=0.14, ao_strength=1.0)
    rig = Rig(a)
    bake_clips(a, rig, clips(rig))
    a.notes = {"travel": "scuttle and flee read as moving toward local +x (the crab's left)", "burrow": "fully under y = 0 on the last frame; only the eyes show from 0.6 to 0.8 of the clip"}
    return a


def _legs(p, lift, swing, down=4.0):
    """tripod stepping: (L1, L3, R2) against (L2, R1, R3); a leg lifts by rolling about the forward axis"""
    out = {}
    for s, sx in (("L", 1), ("R", -1)):
        for i in range(3):
            ph = p + (0 if (i % 2 == 0) == (sx > 0) else math.pi)
            out["leg_%s%d" % (s, i + 1)] = (0, sx * swing * C_(ph), sx * (lift * max(0.0, S_(ph)) - down * max(0.0, -S_(ph))))
    return out


def clips(rig):
    def idle(t):
        p = TAU * t
        snl, snr = bump(t, 0.2, 0.08) + bump(t, 0.3, 0.08), bump(t, 0.66, 0.08) + bump(t, 0.76, 0.08)
        return {"loc:body": (0, 0, 0.01 * S_(p)), "body": (1.5 * S_(p + 0.6), 0, 1.2 * S_(p)),
                "claw_L": (-5 - 5 * S_(p) - 10 * bump(t, 0.25, 0.3), 3 * S_(p + 1), 0), "claw_R": (-5 - 5 * S_(p + 2.2) - 10 * bump(t, 0.71, 0.3), -3 * S_(p + 2), 0),
                "pincer_L": (0, -(7 + 24 * snl), 0), "pincer_R": (0, 7 + 24 * snr, 0),
                "eye_L": (5 * S_(2 * p), 0, 7 * S_(p + 0.5)), "eye_R": (5 * S_(2 * p + 1.1), 0, 7 * S_(p + 1.0)),
                **{k: (v[0], v[1] * 0.2, v[2] * 0.12) for k, v in _legs(2 * p, 10, 6).items()}}

    def scuttle(t):
        p = TAU * t
        return {"loc:body": (0, 0, 0.014 * S_(2 * p)), "body": (0, 2 * S_(p), 4 + 2.5 * S_(2 * p + 0.6)),
                "claw_L": (-16 + 5 * S_(2 * p), 6, 0), "claw_R": (-22 + 5 * S_(2 * p + 1.5), -4, 0), "pincer_L": (0, -12, 0), "pincer_R": (0, 12, 0),
                "eye_L": (0, 0, 12 + 5 * S_(2 * p + 0.8)), "eye_R": (0, 0, 14 + 5 * S_(2 * p + 1.4)), **_legs(p, 20, 12)}

    def flee(t):
        p = TAU * t
        return {"loc:body": (0, 0, 0.02 + 0.026 * S_(2 * p)), "body": (-7, 3 * S_(p), 5 + 4 * S_(2 * p + 0.6)),
                "claw_L": (-58 + 16 * S_(p), 10 + 8 * C_(p), 0), "claw_R": (-58 - 16 * S_(p), -10 + 8 * C_(p), 0),
                "pincer_L": (0, -(20 + 10 * S_(2 * p)), 0), "pincer_R": (0, 20 + 10 * S_(2 * p + 1), 0),
                "eye_L": (-16, 0, 16 + 8 * S_(2 * p + 0.8)), "eye_R": (-16, 0, 18 + 8 * S_(2 * p + 1.6)), **_legs(p, 30, 16, 6)}

    def burrow(t):
        sink = 0.66 * smooth(0.14, 0.58, t) + 0.34 * smooth(0.8, 0.98, t)        # down to the eyes, a look round, then gone
        w = 5.0 * TAU * t
        k = smooth(0.04, 0.2, t)
        wig = S_(w) * k * (1 - 0.45 * t)
        tuck = smooth(0.05, 0.4, t)
        dig = k * (1 - 0.6 * sink)
        legs = {}
        for s, sx in (("L", 1), ("R", -1)):
            for i in range(3):
                legs["leg_%s%d" % (s, i + 1)] = (0, sx * 10 * dig * C_(w * 1.3 + i * 2.1), sx * (16 * dig * S_(w * 1.3 + i * 2.1) + 10 * tuck + 30 * sink))
        return {"loc:body": (0.012 * wig, 0, 0.03 * bump(t, 0.08, 0.16) - 0.6 * sink), "body": (4 * dig * S_(w * 0.5 + 1), 13 * wig, 5 * dig * C_(w)),
                "claw_L": (18 * tuck - 14 * bump(t, 0.08, 0.16), -30 * tuck, 0), "claw_R": (18 * tuck - 14 * bump(t, 0.08, 0.16), 30 * tuck, 0),
                "pincer_L": (0, -7 * (1 - tuck), 0), "pincer_R": (0, 7 * (1 - tuck), 0),
                "eye_L": (-6 * tuck, 0, 9 * wig + 16 * S_(TAU * (t - 0.6) / 0.2) * pulse(t, 0.6, 0.64, 0.76, 0.8)),
                "eye_R": (-6 * tuck, 0, 9 * wig + 16 * S_(TAU * (t - 0.6) / 0.2) * pulse(t, 0.6, 0.64, 0.76, 0.8)), **legs}

    return {"idle": (60, True, idle), "scuttle": (12, True, scuttle), "flee": (10, True, flee), "burrow": (36, False, rig.bridge(burrow, start=idle(0.0), w0=0.1))}
