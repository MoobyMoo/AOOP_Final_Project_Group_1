"""The wild boar: stocky, tusked, a bristly mohawk of a mane. A little comedic, clearly dangerous.
15 bones, clips idle, walk, run, charge_windup, charge, hit, death.

The legs are two-bone IK chains: every gait plants its hooves on the ground and slides them back under the body, so
a loop covers STRIDE[clip] metres per cycle with no foot slip. `charge_windup` (pawing the ground) is a loop: play it
for as long as the telegraph lasts. `hit` starts and ends on idle's first frame; `death` starts there and ends lying
on its right side with the legs stuck out stiff.
"""
import math

from mathutils import Vector

import bv_common as C
from fauna_lib import V, qsphere, ell, tube, ftube, disc, spike, spine, smooth, bump, pulse, lerp, lr, Animal, Rig, bake_clips, S_, C_, TAU, UP, FWD

STRIDE = {"walk": 0.7, "run": 1.3, "charge": 1.8}
SPINE = [(-0.88, 0.8, 0.15, 0.2), (-0.76, 0.8, 0.33, 0.36), (-0.46, 0.8, 0.43, 0.44), (-0.1, 0.8, 0.47, 0.47), (0.2, 0.84, 0.48, 0.5), (0.45, 0.86, 0.43, 0.46), (0.64, 0.84, 0.34, 0.38)]
HC = V(0, 0.86, 0.82)                                        # head centre
F_TOP, F_KNEE, F_HOOF = V(0.27, 0.38, 0.62), V(0.28, 0.4, 0.31), V(0.28, 0.4, 0.0)
H_TOP, H_KNEE, H_HOOF = V(0.26, -0.52, 0.66), V(0.27, -0.66, 0.33), V(0.27, -0.58, 0.0)
EAR0, EAR1 = V(0.2, 0.74, 1.08), V(0.38, 0.66, 1.36)
TAIL0, TAIL1 = V(0, -0.86, 0.96), V(0, -1.03, 1.14)
FEET = {"FL": (0.28, 0.4, 0.0), "FR": (-0.28, 0.4, 0.0), "HL": (0.27, -0.58, 0.0), "HR": (-0.27, -0.58, 0.0)}


def head_pt(q):
    f = -q.y
    fr = max(0.0, f)
    return HC + V(q.x * 0.33 * (1 - 0.34 * fr), f * 0.38, q.z * 0.33 * (1 - 0.28 * fr) - 0.1 * fr * fr + 0.03 * max(0.0, q.z))


def top_z(f):
    """height of the back along the spine"""
    for (f0, z0, _w0, h0), (f1, z1, _w1, h1) in zip(SPINE, SPINE[1:]):
        if f0 <= f <= f1:
            k = (f - f0) / (f1 - f0)
            return lerp(z0 + h0, z1 + h1, k)
    return 1.16


def build():
    a = Animal("boar")
    w_body = C.chain_weights([V(0, -0.95, 0.82), V(0, -0.05, 0.84), V(0, 0.5, 0.86), V(0, 1.2, 0.8)], ["hips", "chest", "head"], 0.7)
    body = spine(SPINE, 12, "b_hide", p=2.2, cap0=0.5, cap1=0.3)
    body.reg_where("b_belly", lambda c: c.z < 0.56)
    body.reg_where("b_hide2", lambda c: c.z > 1.12 and abs(c.x) < 0.24)
    a.add(body, w_body)
    head = qsphere(4, "b_hide").xf(head_pt)
    head.reg_where("b_hide2", lambda c: c.z > HC.z + 0.2 and abs(c.x) < 0.16)
    a.add(head, "head")
    a.add(ftube([V(0, 1.1, 0.74), V(0, 1.32, 0.67), V(0, 1.385, 0.655), V(0, 1.4, 0.652)], [0.2, 0.178, 0.17, 0.09], 8, "b_hide", flat=0.84, regs=["b_hide", "b_snout", "b_snout"],
                cap0=0.0, cap1=0.1), "head")                                                             # the snout and its flat pink disc
    a.both(disc(V(0.058, 1.4, 0.668), FWD, 0.034, 0.012, "dark", 5), "head")                            # nostrils
    a.add(ell(2, V(0, 1.13, 0.57), (0.17, 0.22, 0.085), "b_hide2"), "head")                              # the underbite
    a.both(ftube([V(0.13, 1.2, 0.58), V(0.215, 1.27, 0.66), V(0.255, 1.27, 0.79), V(0.23, 1.21, 0.93)], [0.052, 0.052, 0.04, 0.006], 5, "b_tusk", cap0=0.2), "head")   # tusks
    eye = ell(2, V(0.195, 1.03, 0.95), (0.06, 0.05, 0.06), "white")
    eye.add(disc(V(0.215, 1.073, 0.945), Vector((0.45, -0.88, 0.1)), 0.026, 0.01))
    eye.add(ftube([V(0.08, 1.11, 0.975), V(0.29, 0.97, 1.05)], [0.04, 0.055], 4, "b_mane", flat=0.55, cap0=0.4, cap1=0.4))     # a scowling brow
    a.both(eye, "head")
    for bx, bf, bz in ((0.3, 0.84, 0.72), (0.31, 0.72, 0.66)):                                          # cheek bristles
        a.both(spike(V(bx - 0.05, bf, bz), V(bx + 0.13, bf - 0.13, bz - 0.07), 0.07, 4, "b_mane"), "head")
    ear = ftube([EAR0 + V(-0.03, 0, -0.06), V(0.31, 0.69, 1.23), EAR1], [0.1, 0.085, 0.012], 4, "b_hide2", up=FWD, flat=0.4, cap0=0.2)
    a.both(ear, "ear_L")
    mane = None
    for i in range(10):                                                                                # the mohawk, forehead to mid-back
        f = lerp(1.0, -0.36, i / 9)
        z = (HC.z + 0.3 if f > 0.7 else top_z(f)) - 0.04
        hgt = 0.2 + 0.06 * math.sin(i * 1.9) + (0.05 if 2 <= i <= 5 else 0)
        sx = 0.035 * (-1) ** i
        sp = spike(V(sx, f, z), V(sx * 1.6, f - 0.11, z + hgt), 0.085, 4, "b_mane")
        mane = sp if mane is None else mane.add(sp)
    a.add(mane, lambda co: {"head": 1.0} if -co.y > 0.68 else w_body(co))
    w_f = lr(C.chain_weights([F_TOP, F_KNEE, F_HOOF], ["fleg_up_L", "fleg_lo_L"], 0.4))
    w_h = lr(C.chain_weights([H_TOP, H_KNEE, H_HOOF], ["hleg_up_L", "hleg_lo_L"], 0.4))
    a.both(ftube([F_TOP + V(0, 0, 0.1), F_KNEE, V(0.28, 0.4, 0.11), F_HOOF], [0.17, 0.115, 0.1, 0.115], 7, "b_hide2", regs=["b_hide", "b_hide2", "b_hoof"], cap1=0.0), w_f)
    a.both(ftube([H_TOP + V(0, 0.02, 0.1), H_KNEE, V(0.27, -0.58, 0.11), H_HOOF], [0.21, 0.115, 0.1, 0.115], 7, "b_hide2", regs=["b_hide", "b_hide2", "b_hoof"], cap1=0.0), w_h)
    tail = tube([TAIL0 + V(0, 0.06, -0.03), V(0, -0.98, 1.03), V(0, -1.04, 1.13), V(0.04, -1.0, 1.21)], [0.04, 0.034, 0.028, 0.022], 4, "b_hide2")
    tail.add(spike(V(0.04, -1.0, 1.2), V(0.1, -0.93, 1.32), 0.05, 4, "b_mane"))
    a.add(tail, "tail")
    bones = [("root", None, V(0, 0, 0), V(0, 0, 0.2), False), ("hips", "root", V(0, -0.55, 0.82), V(0, -0.05, 0.84), True), ("chest", "hips", V(0, -0.05, 0.84), V(0, 0.5, 0.86), True),
             ("head", "chest", V(0, 0.5, 0.86), V(0, 1.2, 0.74), True), ("tail", "hips", TAIL0, TAIL1, True)]
    for s, f in (("_L", lambda v: v), ("_R", lambda v: Vector((-v.x, v.y, v.z)))):
        bones += [("ear" + s, "head", f(EAR0), f(EAR1), True), ("fleg_up" + s, "chest", f(F_TOP), f(F_KNEE), True), ("fleg_lo" + s, "fleg_up" + s, f(F_KNEE), f(F_HOOF), True),
                  ("hleg_up" + s, "hips", f(H_TOP), f(H_KNEE), True), ("hleg_lo" + s, "hleg_up" + s, f(H_KNEE), f(H_HOOF), True)]
    a.finish(bones, ao_dist=0.34, ao_strength=1.0)
    rig = Rig(a, ik={"FL": ("fleg_up_L", "fleg_lo_L", (0.05, 1, 0.1)), "FR": ("fleg_up_R", "fleg_lo_R", (-0.05, 1, 0.1)),
                     "HL": ("hleg_up_L", "hleg_lo_L", (0.05, -1, 0.15)), "HR": ("hleg_up_R", "hleg_lo_R", (-0.05, -1, 0.15))})
    bake_clips(a, rig, clips(rig))
    a.notes = {"stride": {k: v for k, v in STRIDE.items()}, "stride_note": "metres one loop covers with planted hooves: speed = stride / clip seconds",
               "charge_windup": "a loop (two paws of the right fore hoof per cycle); hold it for the telegraph", "death": "ends lying on its right side"}
    return a


def gait(t, phases, stride, lift, duty):
    """planted hooves slide back under the body, then swing forward: {ik:foot: target}. A hoof is down for `duty` of
    the cycle, so it travels stride * duty on the ground: that is what makes the loop cover `stride` with no slip."""
    stride = stride * duty
    out = {}
    for name, ph in phases.items():
        x, f0, _z = FEET[name]
        u = (t + ph) % 1.0
        if u < duty:
            f, z = f0 + stride * (0.5 - u / duty), 0.0
        else:
            s = (u - duty) / (1 - duty)
            e = s * s * (3 - 2 * s)
            f, z = f0 + stride * (e - 0.5), lift * math.sin(math.pi * s) ** 0.8
        out["ik:" + name] = (x, f, z)
    return out


def clips(rig):
    def idle(t):
        p = TAU * t
        flick = bump(t, 0.3, 0.08) - bump(t, 0.36, 0.08)
        snort = bump(t, 0.62, 0.16)
        return {"loc:hips": (0, 0, -0.012 + 0.01 * S_(p)), "hips": (0.6 * S_(p), 0, 0), "chest": (1.2 * S_(p + 0.5) + 2 * snort, 0, 0),
                "head": (3 + 2.5 * S_(p + 0.9) + 9 * snort, 5 * S_(p - 0.6), 2 * S_(p)), "ear_L": (-18 * flick, 0, -6 * S_(p)), "ear_R": (-14 * bump(t, 0.8, 0.1), 0, 6 * S_(p)),
                "tail": (6 * S_(2 * p), 22 * S_(2 * p + 0.5), 0)}

    def walk(t):
        p = TAU * t
        return {"loc:hips": (0.018 * S_(p), 0, -0.055 + 0.012 * C_(2 * p)), "hips": (1.5 * S_(2 * p), 2.5 * S_(p), 3.5 * S_(p)), "chest": (-1 * S_(2 * p), -4 * S_(p), -5 * S_(p + 0.4)),
                "head": (5 + 3 * S_(2 * p + 0.6), 2 * S_(p), 2.5 * S_(p + 0.4)), "ear_L": (-6 * S_(2 * p + 1), 0, 0), "ear_R": (-6 * S_(2 * p + 1.6), 0, 0),
                "tail": (4 * S_(2 * p), 26 * S_(p + 0.6), 0), **gait(t, {"HL": 0.0, "FL": 0.25, "HR": 0.5, "FR": 0.75}, STRIDE["walk"], 0.13, 0.62)}

    def run(t):
        p = TAU * t
        return {"loc:hips": (0, 0, -0.085 + 0.04 * S_(p + 0.4)), "hips": (2 + 5 * S_(p + 2.2), 0, 2 * S_(p)), "chest": (-4 * S_(p + 2.2), 0, -2 * S_(p)),
                "head": (8 + 5 * S_(p + 0.9), 0, 0), "ear_L": (-22 + 10 * S_(p + 1.4), 0, 0), "ear_R": (-22 + 10 * S_(p + 1.8), 0, 0), "tail": (-25 + 12 * S_(p + 1), 0, 0),
                **gait(t, {"FL": 0.0, "FR": 0.12, "HL": 0.5, "HR": 0.62}, STRIDE["run"], 0.2, 0.42)}

    def charge(t):
        p = TAU * t
        return {"loc:hips": (0, 0.03 * C_(p), -0.115 + 0.05 * S_(p + 0.4)), "hips": (4 + 6 * S_(p + 2.2), 0, 0), "chest": (2 - 5 * S_(p + 2.2), 0, 0),
                "head": (20 + 6 * S_(p + 0.9), 0, 3 * S_(p)), "ear_L": (-46 + 8 * S_(p + 1.4), 0, 0), "ear_R": (-46 + 8 * S_(p + 2), 0, 0), "tail": (-48 + 10 * S_(p + 1), 0, 0),
                **gait(t, {"FL": 0.0, "FR": 0.09, "HL": 0.46, "HR": 0.55}, STRIDE["charge"], 0.27, 0.34)}

    def windup(t):
        p = TAU * t
        u = (2 * t) % 1.0                                    # two paws a cycle
        if u < 0.42:                                         # reach: the hoof lifts and swings forward
            s = smooth(0, 0.42, u)
            pf, pz = lerp(-0.2, 0.2, s), 0.2 * math.sin(math.pi * s) ** 0.7
        else:                                                # scrape: it drags back through the dirt
            s = smooth(0.42, 1.0, u)
            pf, pz = lerp(0.2, -0.2, s), 0.012 * math.sin(math.pi * s)
        x, f0, _z = FEET["FR"]
        scrape = S_(2 * p + 0.5)
        return {"loc:hips": (0.015, -0.06 + 0.035 * scrape, -0.06 + 0.012 * C_(2 * p)), "hips": (7 + 1.5 * scrape, 0, -1.5), "chest": (6 + 2 * scrape, 0, -3),
                "head": (22 - 5 * scrape, 4 * S_(p), 7 * S_(p + 0.5)), "ear_L": (-38 + 5 * S_(2 * p), 0, 0), "ear_R": (-38 + 5 * S_(2 * p + 1), 0, 0),
                "tail": (-44 + 8 * S_(4 * p), 10 * S_(2 * p), 0), "ik:FR": (x + 0.02, f0 + pf, pz)}

    I0 = idle(0.0)

    def hit(t):
        k = pulse(t, 0.0, 0.3, 0.4, 0.92)
        jolt = bump(t, 0.24, 0.44)
        return {"loc:hips": (0.03 * k, -0.14 * k, -0.012 + 0.03 * jolt - 0.03 * k), "hips": (-7 * k, -3 * k, 5 * k), "chest": (-6 * k, -4 * k, 4 * k),
                "head": (3 - 26 * k, 14 * k, 16 * k), "ear_L": (24 * jolt, 0, 0), "ear_R": (30 * jolt, 0, 0), "tail": (-40 * k, 0, 0)}

    def death(t):
        stag = pulse(t, 0.0, 0.1, 0.26, 0.4)
        fall = smooth(0.26, 0.56, t) ** 1.6
        hitg = smooth(0.52, 0.6, t)                           # on the ground
        bounce = 0.06 * bump(t, 0.66, 0.16)
        twitch = S_(TAU * 5 * t) * pulse(t, 0.6, 0.66, 0.84, 0.97)
        legs = {}
        for name, (x, f, z) in FEET.items():                 # stiff legs: carried by the body once it tips, then a last twitch
            sp = 0.1 if name[0] == "F" else -0.1
            legs["ikc:" + name] = (x * (1 + 0.25 * hitg), f + sp * hitg + 0.05 * twitch * (1 if name[1] == "L" else -1), z + 0.06 * hitg)
            legs["ikk:" + name] = smooth(0.2, 0.42, t)
            legs["ik:" + name] = (x + (0.05 if name[1] == "L" else -0.02) * stag, f, 0.0)
        return {"loc:hips": (-0.34 * fall + 0.03 * S_(TAU * 2.5 * t) * stag, -0.05 * fall, -0.012 - 0.255 * fall + bounce), "hips": (-3 * stag, 0, 90 * fall + 7 * S_(TAU * 2.5 * t) * stag - 5 * bounce / 0.06),
                "chest": (-4 * stag, 0, 4 * hitg), "head": (3 - 18 * stag + 10 * hitg, -14 * hitg, 10 * hitg + 6 * twitch), "ear_L": (20 * hitg, 0, 0), "ear_R": (-30 * stag + 26 * hitg, 0, 0),
                "tail": (-30 * stag + 34 * hitg, 0, 0), **legs}

    for nm, fn, n in (("walk", walk, 24), ("run", run, 12), ("charge", charge, 10)):
        worst = 0.0
        for f in range(n):
            sp = rig.full(fn(f / n))
            _L, W = rig.solve(sp)
            for foot, lo in (("FL", "fleg_lo_L"), ("FR", "fleg_lo_R"), ("HL", "hleg_lo_L"), ("HR", "hleg_lo_R")):
                tgt = sp["ik:" + foot]
                if tgt[2] < 1e-6:                             # planted
                    tip = W[lo] @ Vector((0, rig.len[lo], 0))
                    worst = max(worst, (tip - Vector((tgt[0], -tgt[1], tgt[2]))).length)
        print("@@ boar_%s: planted hooves miss their ground targets by at most %.1f mm" % (nm, worst * 1000))
    return {"idle": (60, True, idle), "walk": (24, True, walk), "run": (12, True, run), "charge_windup": (30, True, windup), "charge": (10, True, charge),
            "hit": (12, False, rig.bridge(hit, start=I0, end=I0, w0=0.2, w1=0.3)), "death": (36, False, rig.bridge(death, start=I0, w0=0.1))}
