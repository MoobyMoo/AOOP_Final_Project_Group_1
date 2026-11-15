"""Monkey clips (player, wild monkeys, bandits). Timed clips are authored over a fixed frame count and played by
the game at actionT x clip duration; loops are driven by the gameplay clock. Coordinates: (x left, forward, up).
"""
import math
from bv_anim import spline, bake_clip

S, C = math.sin, math.cos
TAU = math.pi * 2

CFG = dict(
    hips="hips", axial=["spine", "chest", "neck", "head"], pairs=["ear", "shoulder"],
    arms=[("L", "shoulder_L", "upperarm_L", "forearm_L", "hand_L"), ("R", "shoulder_R", "upperarm_R", "forearm_R", "hand_R")],
    legs=[("L", "thigh_L", "shin_L", "foot_L"), ("R", "thigh_R", "shin_R", "foot_R")],
    tail=["tail1", "tail2", "tail3", "tail4", "tail5"],
)
ANKLE = (0.155, 0.0, 0.10)


def tail(fn):
    return [fn(i) for i in range(5)]


def relaxed_arms(sway=0.0, lift=0.0):
    return {"hand_L": (0.465 + sway, 0.06, 0.475 + lift), "hand_R": (-0.465 + sway, 0.06, 0.475 - lift),
            "hand_L_dir": (0.22, 0.12, -1), "hand_R_dir": (-0.22, 0.12, -1), "hand_L_up": (-0.2, 1, 0.1), "hand_R_up": (0.2, 1, 0.1),
            "elbow_L": (0.6, -0.7, -0.2), "elbow_R": (-0.6, -0.7, -0.2)}


# two-hand pistol hold; the socket puts the barrel along the right hand's fingers axis, thumb side up
AIM = {"spine": (3, 0, 0), "chest": (5, 0, 0), "shoulder_R": (4, 14), "shoulder_L": (4, 16),
       "hand_R": (-0.05, 0.42, 0.93), "hand_R_dir": (0.03, 1, 0.0), "hand_R_up": (0.1, 0, 1), "elbow_R": (-0.7, -0.2, -1),
       "hand_L": (0.078, 0.385, 0.9), "hand_L_dir": (-0.55, 0.8, 0.1), "hand_L_up": (0, 0, 1), "elbow_L": (0.7, -0.2, -1)}


def idle(t):
    p = t * TAU
    sp = relaxed_arms(0.006 * S(p - 1.0), 0.008 * S(p + 1.2))
    sp.update({"hips": (0.012 * S(p - 1.0), 0.0, -0.007 + 0.007 * S(p)), "hips_rot": (0, 0, 1.3 * S(p - 1.0)),
               "spine": (2 + 1.4 * S(p), 0, -0.8 * S(p - 1.0)), "chest": (1.6 * S(p + 0.5), 0, 0),
               "neck": (-1.0 * S(p + 0.7), 0, 0), "head": (-1.6 * S(p + 0.9), 2.0 * S(p - 0.4), 1.6 * S(p - 0.6)),
               "shoulder_L": (2.5 * S(p + 0.3), 0), "shoulder_R": (2.5 * S(p + 0.3), 0),
               "ear_L": (2.5 * S(2 * p), 0), "ear_R": (2.5 * S(2 * p + 0.8), 0),
               "tail": tail(lambda i: (3 * S(2 * p - i * 0.5), (9 + 3 * i) * S(p - i * 0.55)))})
    return sp


def _gait(t, d, A, h, duty, bob, lean, arm, twist):
    """directional gait, stride-matched: each foot is on the ground for `duty` of the cycle and travels 2A against
    the move direction d = (x, forward) while planted, so one cycle covers 2A / duty (GAIT_LEN). The rest of the
    cycle is flight: the body hops between contacts. Left foot lands at t = 0, right at t = 0.5."""
    p = t * TAU
    dx, df = d
    sp = {}
    for s, sx, off in (("L", 1, 0.0), ("R", -1, 0.5)):
        u = (t + off) % 1.0
        if u < duty:                                     # planted: slides back under the body
            k = u / duty
            along, lift, pitch = A * (1 - 2 * k), 0.0, -10 + 26 * k
        else:                                            # swing: lift, reach, come down
            v = (u - duty) / (1 - duty)
            e = v * v * (3 - 2 * v)
            along, lift = -A + 2 * A * e, h * S(math.pi * v) ** 0.9
            pitch = 34 * S(math.pi * v) * (1 - v) ** 1.5 - 14 * v * v
        sp["foot_" + s] = (sx * (ANKLE[0] - 0.012) + dx * along, df * along - 0.01, ANKLE[2] + lift)
        sp["foot_%s_rot" % s] = (pitch * (df if abs(df) > 0.3 else 0.4), 0)
        sp["knee_" + s] = (0.1 * sx + 0.5 * dx, 1, 0.25)
        a = -C((u - duty / 2) * TAU)                     # arms swing against the legs
        sp["hand_" + s] = (sx * (0.40 + 0.03 * a + 0.05 * abs(dx)), 0.05 + arm * a * df, 0.60 + 0.5 * arm * a * abs(df) + 0.05 * abs(a) + 0.06 * abs(dx))
        sp["hand_%s_dir" % s] = (sx * (0.1 + 0.3 * abs(dx)), 0.55 + 0.5 * a * df, -0.75 + 0.5 * a * abs(df))
        sp["hand_%s_up" % s] = (-sx * 0.3, 1, 0.3)
        sp["elbow_" + s] = (0.5 * sx, -1, -0.25)
        sp["shoulder_" + s] = (3 + 4 * abs(dx), 10 * a * df)
    hop = -C(2 * TAU * (t - duty / 2))                  # -1 at each mid-stance, +1 mid-flight
    sw = S(p - duty * math.pi)                            # which side carries the weight
    sp.update({"hips": (0.014 * sw - 0.02 * dx, -0.01 * df, -0.055 + 0.5 * bob * hop), "hips_rot": (lean * df, twist * sw * df, 2.5 * sw + lean * 0.6 * dx),
               "spine": (lean * 0.6 * df, -twist * 0.6 * sw * df, -1.5 * sw + lean * 0.3 * dx), "chest": (lean * 0.3 * df, -twist * 1.1 * sw * df, 0),
               "neck": (-lean * 0.5 * df - 1.0 * hop, twist * 0.5 * sw * df, 0), "head": (-lean * 0.8 * df - 1.5 * hop, twist * 0.6 * sw * df, -0.8 * sw - lean * 0.5 * dx),
               "ear_L": (-4 - 5 * hop, -4 * df), "ear_R": (-4 - 5 * hop, -4 * df),  # head nod 4.5 -> 1.5 deg, sway 1.5 -> 0.8, ears 9 -> 5 (calmer)
               "tail": tail(lambda i: (-5 * df + 5 * S(2 * p - i * 0.7), (5 + 2 * i) * S(p - 0.6 - i * 0.6) - 9 * dx))})
    return sp


# metres travelled per cycle (2A / duty): the game sets the cycle rate to speed / GAIT_LEN so feet do not slide
# bob (5th field) calmed for comfort (Moo: "shouldn't shake that aggressively... like Duckov so players don't get dizzy"):
# walk 0.035 -> 0.018, run 0.11 -> 0.045, back/strafe ~ -60%. Stride, duty and timing unchanged so feet don't slide.
GAITS = {"walk": ((0, 1), 0.16, 0.07, 0.40, 0.018, 4, 0.1, 5), "run": ((0, 1), 0.22, 0.17, 0.20, 0.045, 12, 0.2, 9),
         "runBack": ((0, -1), 0.18, 0.13, 0.22, 0.035, 7, 0.12, 6), "strafeL": ((1, 0), 0.13, 0.12, 0.22, 0.03, 7, 0.0, 0),
         "strafeR": ((-1, 0), 0.13, 0.12, 0.22, 0.03, 7, 0.0, 0)}
GAIT_LEN = {n: round(2 * g[1] / g[3], 3) for n, g in GAITS.items()}


def gait(name):
    d, A, h, duty, bob, lean, arm, twist = GAITS[name]
    return lambda t: _gait(t, d, A, h, duty, bob, lean, arm, twist)


def carry(t):
    """hand state 'briefcase': the case hangs from the right fist, forearm a little forward"""
    sp = relaxed_arms()
    sp.update({"hand_R": (-0.41, 0.2, 0.63), "hand_R_dir": (0.05, 1, -0.25), "hand_R_up": (0.1, 0.1, 1), "elbow_R": (-0.6, -0.8, -0.3), "shoulder_R": (2, 4)})
    return sp


def aim(t):
    return dict(AIM)


def _keys(base_pose, keys):
    """keys relative to a base pose dict"""
    return [(t, {**base_pose, **ov}) for t, ov in keys]


def fire(base):
    return spline(_keys(AIM, [
        (0.0, {}),
        (0.13, {"hand_R": (-0.05, 0.345, 0.99), "hand_R_dir": (0.03, 1, 0.5), "hand_L": (0.078, 0.315, 0.955), "hand_L_dir": (-0.55, 0.8, 0.5),
                "chest": (-4, 0, 0), "spine": (0, 0, 0), "neck": (-3, 0, 0), "head": (-5, 0, 0), "shoulder_R": (14, 8), "shoulder_L": (12, 10),
                "ear_L": (-10, -8), "ear_R": (-10, -8), "tail": tail(lambda i: (5 + i * 2, 0))}),
        (0.42, {"hand_R": (-0.05, 0.43, 0.922), "hand_R_dir": (0.03, 1, -0.05), "hand_L": (0.078, 0.395, 0.892), "chest": (7, 0, 0), "head": (2, 0, 0),
                "ear_L": (5, 3), "ear_R": (5, 3)}),
        (1.0, {}),
    ]), base)


def reload(base):
    low = {"hand_R": (-0.11, 0.33, 0.985), "hand_R_dir": (0.25, 0.8, 0.6), "hand_R_up": (0.75, -0.25, 0.75), "elbow_R": (-0.8, -0.3, -0.8),
           "head": (13, -5, 0), "neck": (5, 0, 0), "chest": (6, -4, 0)}
    belt = {"hand_L": (0.27, 0.13, 0.57), "hand_L_dir": (-0.2, 0.3, -1), "hand_L_up": (-0.6, 1, 0), "elbow_L": (0.8, -0.8, 0)}
    under = {"hand_L": (-0.025, 0.325, 0.83), "hand_L_dir": (-0.25, 0.35, 1), "hand_L_up": (-0.6, -0.8, 0.2), "elbow_L": (0.7, -0.3, -0.8)}
    return spline(_keys(AIM, [
        (0.0, {}),
        (0.13, {**low, "hand_L": (0.12, 0.3, 0.8), "hand_L_dir": (-0.4, 0.7, -0.3)}),
        (0.3, {**low, **belt, "spine": (5, -6, 0), "hips_rot": (0, 0, 2)}),
        (0.46, {**low, **belt, "hand_L": (0.25, 0.16, 0.6), "spine": (5, -6, 0), "hips_rot": (0, 0, 2)}),
        (0.6, {**low, **under, "hand_L": (-0.02, 0.31, 0.79)}),
        (0.66, {**low, **under, "hand_R": (-0.11, 0.33, 1.005), "hand_L": (-0.03, 0.33, 0.87), "head": (16, -5, 0)}),
        (0.76, {**low, "hand_R_up": (0.4, -0.1, 1), "hand_R_dir": (0.1, 1, 0.25), "hand_L": (-0.03, 0.44, 1.07), "hand_L_dir": (-0.8, 0.1, -0.5), "hand_L_up": (0, 1, 0.2), "elbow_L": (0.8, 0, 0.4)}),
        (0.86, {**low, "hand_R_up": (0.4, -0.1, 1), "hand_R_dir": (0.1, 1, 0.25), "hand_R": (-0.1, 0.36, 0.97), "hand_L": (-0.02, 0.33, 1.06), "hand_L_dir": (-0.8, 0.1, -0.5), "hand_L_up": (0, 1, 0.2), "elbow_L": (0.8, 0, 0.4), "chest": (2, -4, 0)}),
        (1.0, {}),
    ]), base)


def melee(base):
    """two-hand briefcase smash: wind-up over the right shoulder (0-0.22), hit ~0.3, follow-through to the left hip"""
    return spline([
        (0.0, {**AIM}),
        (0.2, {"hips": (-0.02, -0.05, -0.03), "hips_rot": (-6, -14, 0), "spine": (-8, -16, 0), "chest": (-8, -22, 0), "neck": (2, 14, 0), "head": (2, 20, 0),
               "shoulder_R": (22, -12), "shoulder_L": (14, 16),
               "hand_R": (-0.38, -0.2, 1.36), "hand_R_dir": (-0.3, -0.75, 0.6), "hand_R_up": (0.2, 0.7, 0.7), "elbow_R": (-1, -0.2, 0.3),
               "hand_L": (-0.25, -0.1, 1.3), "hand_L_dir": (-0.8, -0.5, 0.4), "hand_L_up": (0, 0, 1), "elbow_L": (0.6, 0.6, -0.5),
               "foot_R": (-0.17, -0.1, 0.1), "foot_L": (0.15, 0.1, 0.1), "tail": tail(lambda i: (8, -10)), "ear_L": (6, 5), "ear_R": (6, 5)}),
        (0.3, {"hips": (0.01, 0.1, -0.07), "hips_rot": (14, 12, 0), "spine": (16, 14, 0), "chest": (16, 18, 0), "neck": (-10, -10, 0), "head": (-12, -12, 0),
               "shoulder_R": (4, 26), "shoulder_L": (4, 14),
               "hand_R": (-0.02, 0.56, 0.74), "hand_R_dir": (0.1, 0.9, -0.5), "hand_R_up": (0.1, -0.45, -0.9), "elbow_R": (-0.8, 0, -0.6),
               "hand_L": (0.07, 0.5, 0.74), "hand_L_dir": (-0.5, 0.8, -0.3), "hand_L_up": (0, -0.3, -1), "elbow_L": (0.8, 0, -0.6),
               "foot_R": (-0.17, -0.12, 0.1), "foot_L": (0.15, 0.2, 0.1), "tail": tail(lambda i: (-12 - 2 * i, 14)), "ear_L": (-14, -10), "ear_R": (-14, -10)}),
        (0.42, {"hips": (0.03, 0.1, -0.09), "hips_rot": (16, 20, 0), "spine": (18, 18, 0), "chest": (16, 24, 0), "neck": (-10, -14, 0), "head": (-10, -16, 0),
                "shoulder_R": (0, 30), "shoulder_L": (0, 4),
                "hand_R": (0.24, 0.42, 0.5), "hand_R_dir": (0.6, 0.6, -0.5), "hand_R_up": (0.5, -0.6, -0.6), "elbow_R": (-0.8, 0, -0.5),
                "hand_L": (0.3, 0.34, 0.52), "hand_L_dir": (0.2, 0.8, -0.5), "hand_L_up": (0.4, -0.3, -0.8), "elbow_L": (1, -0.3, -0.2),
                "foot_R": (-0.17, -0.12, 0.1), "foot_L": (0.15, 0.2, 0.1), "tail": tail(lambda i: (-6, 18)), "ear_L": (4, 6), "ear_R": (4, 6)}),
        (0.66, {"hips": (0.02, 0.05, -0.05), "hips_rot": (8, 12, 0), "spine": (10, 10, 0), "chest": (9, 12, 0), "neck": (-5, -8, 0), "head": (-5, -8, 0),
                "hand_R": (0.2, 0.4, 0.58), "hand_R_dir": (0.5, 0.75, -0.3), "hand_R_up": (0.3, -0.3, 0.6), "elbow_R": (-0.8, 0, -0.5),
                "hand_L": (0.28, 0.33, 0.6), "hand_L_dir": (0.1, 0.9, -0.3), "hand_L_up": (0.2, 0, 1), "elbow_L": (1, -0.3, -0.2),
                "foot_L": (0.15, 0.1, 0.1), "foot_R": (-0.16, -0.05, 0.1)}),
        (1.0, {**AIM}),
    ], base)


def roll(solver):
    """tucked forward roll: the body turns a full circle about the centre of the tuck"""
    base = solver.base
    cz, cf = 0.26, 0.2            # tuck centre relative to the hips joint (up, forward)
    tuck = {"spine": (38, 0, 0), "chest": (32, 0, 0), "neck": (22, 0, 0), "head": (26, 0, 0),
            "hand_L": (0.2, 0.36, 0.52), "hand_R": (-0.2, 0.36, 0.52), "hand_L_dir": (-0.5, 0.5, -0.6), "hand_R_dir": (0.5, 0.5, -0.6),
            "hand_L_up": (0, 1, 0.3), "hand_R_up": (0, 1, 0.3), "elbow_L": (1, -0.2, -0.2), "elbow_R": (-1, -0.2, -0.2),
            "foot_L": (0.13, 0.22, 0.3), "foot_R": (-0.13, 0.22, 0.3), "foot_L_rot": (-20, 0), "foot_R_rot": (-20, 0),
            "knee_L": (0.3, 1, 0.6), "knee_R": (-0.3, 1, 0.6), "shoulder_L": (6, 20), "shoulder_R": (6, 20),
            "ear_L": (-12, -10), "ear_R": (-12, -10), "tail": tail(lambda i: (26, 0))}
    stand = {"foot_L": (ANKLE[0], 0.0, ANKLE[2]), "foot_R": (-ANKLE[0], 0.0, ANKLE[2]), **relaxed_arms()}
    blend = spline([(0.0, {**stand, "spine": (10, 0, 0), "chest": (8, 0, 0)}), (0.16, tuck), (0.8, tuck),
                    (1.0, {**stand, "spine": (14, 0, 0), "chest": (10, 0, 0), "head": (-6, 0, 0)})], base)

    def fn(t):
        sp = blend(t)
        e = t * t * (3 - 2 * t)
        ang = 360 * (0.12 * t + 0.88 * e)                       # eased spin, fastest mid-roll
        a = math.radians(ang)
        k = math.sin(math.pi * min(1.0, t / 0.16) / 2) if t < 0.16 else (math.sin(math.pi * (1 - t) / 0.2 / 2) if t > 0.8 else 1.0)
        # hips orbit the tuck centre, which stays at a constant height while tucked
        centre_z = 0.5 + cz + (0.82 - 0.5 - cz) * k          # a small hop keeps the big head off the ground
        hz = centre_z - (cz * C(a) - cf * S(a)) * k - cz * (1 - k) - 0.5
        hf = (cf - (cf * C(a) + cz * S(a))) * k
        sp["hips"] = (0, hf, hz)
        sp["hips_rot"] = (ang, 0, 0)
        return sp
    return fn


def hurt(base):
    return spline([
        (0.0, {**relaxed_arms()}),
        (0.18, {"hips": (0, -0.06, -0.05), "hips_rot": (-8, 0, 3), "spine": (-12, 0, 4), "chest": (-14, 6, 0), "neck": (10, 0, 0), "head": (16, -8, 6),
                "shoulder_L": (24, -6), "shoulder_R": (24, -6),
                "hand_L": (0.5, 0.2, 0.95), "hand_R": (-0.5, 0.2, 0.9), "hand_L_dir": (0.5, 0.5, 0.7), "hand_R_dir": (-0.5, 0.5, 0.7),
                "hand_L_up": (-0.5, 0.5, 0.5), "hand_R_up": (0.5, 0.5, 0.5), "elbow_L": (1, -0.3, -0.6), "elbow_R": (-1, -0.3, -0.6),
                "ear_L": (-22, -16), "ear_R": (-22, -16), "tail": tail(lambda i: (16, 0))}),
        (0.5, {"hips": (0, -0.02, -0.02), "spine": (6, 0, -2), "chest": (5, -3, 0), "head": (-6, 3, -3),
               **relaxed_arms(0, 0.03), "ear_L": (6, 4), "ear_R": (6, 4), "tail": tail(lambda i: (-6, 0))}),
        (1.0, {**relaxed_arms()}),
    ], base)


def throw(base):
    """overhead throw with the right hand: wind-up 0-0.3, release at 0.3, follow-through"""
    return spline([
        (0.0, {**relaxed_arms(), "hand_R": (-0.44, 0.1, 0.6), "hand_R_dir": (-0.2, 0.6, -0.6)}),
        (0.28, {"hips": (-0.02, -0.06, -0.03), "hips_rot": (-6, -12, 0), "spine": (-10, -14, 0), "chest": (-10, -20, 0), "neck": (4, 14, 0), "head": (4, 18, 0),
                "shoulder_R": (24, -14),
                "hand_R": (-0.42, -0.22, 1.32), "hand_R_dir": (-0.2, -0.8, 0.5), "hand_R_up": (0, 0.6, 0.8), "elbow_R": (-1, -0.4, 0.2),
                "hand_L": (0.3, 0.42, 0.95), "hand_L_dir": (0, 1, 0.2), "hand_L_up": (0, 0, 1), "elbow_L": (0.8, 0, -0.7),
                "foot_R": (-0.17, -0.12, 0.1), "foot_L": (0.15, 0.1, 0.1), "tail": tail(lambda i: (10, -8)), "ear_L": (6, 4), "ear_R": (6, 4)}),
        (0.38, {"hips": (0.0, 0.08, -0.04), "hips_rot": (10, 10, 0), "spine": (12, 12, 0), "chest": (14, 18, 0), "neck": (-8, -12, 0), "head": (-8, -14, 0),
                "shoulder_R": (14, 24),
                "hand_R": (-0.14, 0.56, 1.12), "hand_R_dir": (0.1, 1, 0.1), "hand_R_up": (0, -0.2, 1), "elbow_R": (-0.8, 0, -0.5),
                "hand_L": (0.42, -0.1, 0.62), "hand_L_dir": (0.2, -0.3, -1), "elbow_L": (0.8, -0.8, 0),
                "foot_R": (-0.17, -0.14, 0.14), "foot_R_rot": (30, 0), "foot_L": (0.15, 0.18, 0.1), "tail": tail(lambda i: (-12, 12)), "ear_L": (-14, -10), "ear_R": (-14, -10)}),
        (0.56, {"hips": (0.02, 0.08, -0.07), "hips_rot": (14, 16, 0), "spine": (16, 14, 0), "chest": (16, 20, 0), "neck": (-10, -14, 0), "head": (-8, -16, 0),
                "hand_R": (0.12, 0.45, 0.56), "hand_R_dir": (0.4, 0.6, -0.7), "hand_R_up": (0.3, -0.5, 0.5), "elbow_R": (-0.8, 0, -0.4),
                "hand_L": (0.44, -0.12, 0.66), "hand_L_dir": (0.2, -0.3, -1), "elbow_L": (0.8, -0.8, 0),
                "foot_R": (-0.17, -0.1, 0.1), "foot_L": (0.15, 0.18, 0.1), "tail": tail(lambda i: (-4, 14))}),
        (1.0, {**relaxed_arms()}),
    ], base)


def use(base):
    """drink / patch up with the left hand; the gun hand drops to low ready. Loops 0.2-0.8 while the timer runs."""
    low_r = {"hand_R": (-0.36, 0.2, 0.62), "hand_R_dir": (0.1, 0.9, -0.45), "hand_R_up": (0.2, 0.3, 1), "elbow_R": (-0.8, -0.6, -0.2), "shoulder_R": (0, 0)}

    def up(k, tilt):
        return {**low_r, "hand_L": (0.1, 0.4, 1.13 + k), "hand_L_dir": (-0.5, 0.2, 0.85), "hand_L_up": (-0.4, -0.85, 0.2), "elbow_L": (1, 0.2, -0.5),
                "shoulder_L": (16, 18), "neck": (-6 - tilt, 0, 0), "head": (-12 - tilt, 0, 3), "chest": (-3, 0, 0), "spine": (-3, 0, 0),
                "ear_L": (3 + tilt, 0), "ear_R": (3 + tilt, 0), "tail": tail(lambda i: (4 + tilt * 0.5, 0))}
    return spline([
        (0.0, {**relaxed_arms(), **low_r}), (0.16, up(0, 0)), (0.3, up(0.02, 6)), (0.42, up(0, 0)), (0.54, up(0.02, 6)),
        (0.66, up(0, 0)), (0.78, up(0.02, 6)), (0.88, up(0, 0)), (1.0, {**relaxed_arms(), **low_r}),
    ], base)


def defeat(solver):
    """cartoon bonk-out: spin on the spot, tip over backwards, flop, legs twitch. Limbs ride the hips (hips space)."""
    base = solver.base

    def limbs(arm_out, arm_up, leg_out, leg_up, knee=0.0):
        return {"hand_L": (0.3 + 0.32 * arm_out, 0.05, 0.95 + 0.35 * arm_up), "hand_R": (-0.3 - 0.32 * arm_out, 0.05, 0.95 + 0.3 * arm_up),
                "hand_L_dir": (0.8, 0.2, 0.5 * arm_up), "hand_R_dir": (-0.8, 0.2, 0.5 * arm_up), "hand_L_up": (0, 1, 0.2), "hand_R_up": (0, 1, 0.2),
                "elbow_L": (0.6, -0.6, -0.5), "elbow_R": (-0.6, -0.6, -0.5),
                "foot_L": (0.16 + 0.12 * leg_out, 0.02 + 0.28 * leg_up, 0.1 + 0.1 * leg_up + knee), "foot_R": (-0.16 - 0.12 * leg_out, 0.02 + 0.22 * leg_up, 0.1 + 0.06 * leg_up),
                "knee_L": (0.3, 1, 0.3), "knee_R": (-0.3, 1, 0.3)}
    keys = spline([
        (0.0, {**limbs(0.2, -0.9, 0, 0), "head": (0, 0, 0)}),
        (0.1, {**limbs(1, 0.5, 0.3, 0), "spine": (-8, 0, 6), "chest": (-8, 0, 6), "head": (-14, 0, 10), "ear_L": (-16, -8), "ear_R": (-16, -8)}),
        (0.3, {**limbs(1, 0.9, 0.5, 0), "spine": (-6, 0, -8), "chest": (-6, 0, -8), "head": (-10, 0, -14), "tail": tail(lambda i: (-6, 16))}),
        (0.5, {**limbs(0.9, 0.7, 0.6, 0.2), "spine": (-12, 0, 6), "chest": (-10, 0, 6), "head": (-16, 0, 12), "tail": tail(lambda i: (-6, -16))}),
        (0.7, {**limbs(1, 0.2, 1, 1.0, 0.1), "spine": (-6, 0, 0), "chest": (-4, 0, 0), "neck": (10, 0, 0), "head": (14, 0, 0), "tail": tail(lambda i: (-14, 0))}),
        (0.82, {**limbs(1, -0.2, 1, 1.4, 0.16), "spine": (4, 0, 0), "chest": (4, 0, 0), "neck": (-4, 0, 0), "head": (-8, 8, 0), "ear_L": (10, 8), "ear_R": (10, 8)}),
        (0.92, {**limbs(1, -0.3, 1, 0.8), "head": (4, -8, 0)}),
        (1.0, {**limbs(1, -0.3, 1, 0.7), "head": (0, 10, 0), "tail": tail(lambda i: (-14, 6))}),
    ], base)

    def fn(t):
        sp = keys(t)
        spin = 540 * (1 - (1 - min(1.0, t / 0.6)) ** 2.2)                    # fast then slowing
        tip = 0 if t < 0.5 else -90 * min(1.0, (t - 0.5) / 0.22) ** 1.6
        bounce = 0.0 if t < 0.72 else 0.07 * abs(S((t - 0.72) / 0.28 * math.pi * 2)) * (1 - (t - 0.72) / 0.28)
        hop = 0.1 * S(min(1.0, t / 0.5) * math.pi)
        lie = min(1.0, max(0.0, (t - 0.5) / 0.22)) ** 1.6
        sp["hips"] = (0.02 * S(t * 30) * (1 - lie), -0.18 * lie, hop * (1 - lie) + (0.3 - 0.5) * lie + bounce)
        sp["hips_rot"] = (tip, spin, 5 * S(t * 26) * (1 - lie))
        return sp
    return fn


def cheer(t):
    p = t * TAU
    b = abs(S(p))
    sp = {"hips": (0, 0, -0.03 + 0.1 * b), "hips_rot": (-3, 0, 3 * S(p)), "spine": (-5, 0, 0), "chest": (-6, 0, 0), "head": (-10, 0, 4 * S(p)),
          "shoulder_L": (26, 0), "shoulder_R": (26, 0),
          "hand_L": (0.36, 0.08, 1.32 + 0.07 * b), "hand_R": (-0.36, 0.08, 1.32 + 0.07 * S(p + 0.6) ** 2),
          "hand_L_dir": (0.2, 0.1, 1), "hand_R_dir": (-0.2, 0.1, 1), "hand_L_up": (0, 1, 0), "hand_R_up": (0, 1, 0),
          "elbow_L": (1, 0.2, -0.4), "elbow_R": (-1, 0.2, -0.4),
          "foot_L": (0.16, 0, 0.1 + 0.06 * b), "foot_R": (-0.16, 0, 0.1 + 0.06 * b), "foot_L_rot": (25 * b, 0), "foot_R_rot": (25 * b, 0),
          "ear_L": (8 * S(2 * p), 0), "ear_R": (8 * S(2 * p), 0), "tail": tail(lambda i: (10 * b, 14 * S(p - i * 0.5)))}
    return sp


# name -> (frames, loop, real seconds for one play: the game maps actionT 0..1 over the clip)
CLIPS = {"idle": (60, True, 2.0), "walk": (24, True, 0.5), "run": (24, True, 0.45), "runBack": (24, True, 0.4), "strafeL": (24, True, 0.35), "strafeR": (24, True, 0.35),
         "aim": (2, True, 1.0), "carry": (2, True, 1.0), "fire": (12, False, 0.25),
         "reload": (36, False, 1.2), "melee": (27, False, 0.45), "roll": (20, False, 0.34), "hurt": (12, False, 0.35),
         "throw": (30, False, 0.75), "use": (40, False, 1.6), "defeat": (40, False, 0.9), "cheer": (30, True, 0.9)}


def make_clips(solver):
    b = solver.base
    fns = {"idle": idle, "walk": gait("walk"), "run": gait("run"), "runBack": gait("runBack"), "strafeL": gait("strafeL"), "strafeR": gait("strafeR"),
           "aim": aim, "carry": carry, "fire": fire(b), "reload": reload(b), "melee": melee(b),
           "roll": roll(solver), "hurt": hurt(b), "throw": throw(b), "use": use(b), "defeat": defeat(solver), "cheer": cheer}
    spaces = {"roll": ("hips", "hips"), "defeat": ("hips", "hips")}
    acts = []
    for name, (frames, loop, _dur) in CLIPS.items():
        sh, sf = spaces.get(name, ("arm", "arm"))
        acts.append(bake_clip(solver, name, frames, fns[name], sh, sf, loop))
    return acts
