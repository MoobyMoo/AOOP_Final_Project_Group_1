"""Build the Bananaville gorilla (brute + the Sleeper): parts, armature, weights, AO, clips, GLB.

Original design: a chunky toy gorilla in a knuckle stance (bind pose), barrel chest, huge forearms, small head
with a crest and a heavy brow. The Sleeper adds a pinstripe waistcoat, a sleep mask pushed up on the forehead and
a pocket-watch chain, and is scaled up at runtime.
Run: blender -b --factory-startup --python tools/blender/build_gorilla.py -- [--sheet out.png] [--poses dir clip:n,...]
"""
import os
import sys
import math
import json
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bv_common as C  # noqa: E402
import bv_anim as A  # noqa: E402
from bv_common import V, M, qsphere, ell, ring, loft, tube, plate, disc_plate, blob_on, frame_at, smooth, lerp  # noqa: E402

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ROOT = os.path.dirname(os.path.dirname(HERE))
C.clean_scene()
PARTS, WFN = {}, {}
S_, C_ = math.sin, math.cos
TAU = math.tau


def mx(v):
    return Vector((-v.x, v.y, v.z))


def assemble(name, pieces, weld=False):
    ob = C.assemble(name, pieces, WFN, weld)
    PARTS[name] = ob
    return ob


def lr(fn_left):
    def fn(co):
        if co.x >= 0:
            return fn_left(co)
        return {k.replace("_L", "_R"): w for k, w in fn_left(mx(co)).items()}
    return fn


# ---------------------------------------------------------------- joints (x left, forward, up)
J = dict(hips=V(0, -0.38, 1.05), spine=V(0, -0.16, 1.42), chest=V(0, 0.1, 1.8), neck=V(0, 0.3, 2.16), head=V(0, 0.4, 2.3), head_top=V(0, 0.48, 2.84),
         clav=V(0.3, 0.2, 2.1), shoulder=V(0.8, 0.26, 2.06), elbow=V(1.06, 0.6, 1.2), wrist=V(0.96, 0.98, 0.42), fist=V(0.95, 1.06, 0.2),
         hip=V(0.42, -0.45, 0.95), knee=V(0.58, -0.2, 0.52), ankle=V(0.52, -0.42, 0.16), toe=V(0.56, 0.02, 0.06))
HC = V(0, 0.5, 2.42)


def torso():
    path = [V(0, -0.5, 0.86), V(0, -0.42, 1.02), V(0, -0.22, 1.36), V(0, 0.06, 1.78), V(0, 0.24, 2.1), V(0, 0.36, 2.3), V(0, 0.42, 2.42)]
    rad = [0.42, 0.62, 0.8, 0.92, 0.8, 0.5, 0.34]
    return tube(path, rad, 14, "fur", flat=0.74)


def arm():
    S, E, W = J["shoulder"], J["elbow"], J["wrist"]
    path = [V(0.56, 0.24, 2.1), S + V(0.02, 0, -0.02), lerp(S, E, 0.5) + V(0.03, 0, 0), E, lerp(E, W, 0.55), W]
    return tube(path, [0.26, 0.34, 0.31, 0.29, 0.31, 0.25], 10, "fur", up=Vector((0, -1, 0)))


def fist():
    c = J["fist"] + V(0, 0.02, -0.02)
    m = qsphere(4, "skin").xf(lambda q: c + Vector((q.x * 0.27, q.y * 0.3, max(q.z * 0.26, -0.2) + 0.02)))
    for i in range(4):                                   # knuckles
        m.add(ell(2, c + V(-0.19 + i * 0.127, 0.25, 0.1), (0.07, 0.07, 0.075), "skin"))
    m.add(ell(2, c + V(-0.25, 0.06, 0.02), (0.085, 0.13, 0.09), "skin"))     # thumb (inner side)
    return m


def leg():
    H, K, A_ = J["hip"], J["knee"], J["ankle"]
    path = [H + V(-0.06, 0, 0.08), lerp(H, K, 0.5) + V(0.02, 0, 0), K, lerp(K, A_, 0.6), A_ + V(0, 0, 0.02)]
    return tube(path, [0.3, 0.33, 0.27, 0.22, 0.2], 8, "fur", up=Vector((0, -1, 0)))


def foot():
    c = V(J["ankle"].x + 0.02, -0.22, 0.11)
    return qsphere(4, "skin").xf(lambda q: c + Vector((q.x * 0.22 * (1 + 0.15 * max(0.0, -q.y)), q.y * 0.34, max(q.z * 0.13, -0.1) + 0.0)))


def head_pt(d):
    crest = max(0.0, d.z) ** 2 * max(0.0, 1 - (d.x / 0.75) ** 2)
    back = max(0.0, d.y)
    return HC + Vector((d.x * 0.43 * (1 + 0.06 * smooth(0.3, -0.6, d.z)), d.y * 0.44 * (1 + 0.1 * back), d.z * (0.44 + 0.16 * crest)))


def head():
    return qsphere(4, "fur").xf(head_pt)


def ear():
    c = V(0.45, 0.42, 2.44)
    return qsphere(3, "skin").xf(lambda q: c + Vector((q.x * 0.1, q.y * 0.05, q.z * 0.12)))


def muzzle():
    c = V(0, 0.84, 2.27)
    return qsphere(3, "skin2").xf(lambda q: c + Vector((q.x * 0.31, q.y * 0.2, q.z * 0.215 - 0.03 * q.x * q.x)))


def face_r(th):
    c, s = abs(math.cos(th)), math.sin(th)
    return 0.34 * (1 + 0.1 * c) * (1 - 0.2 * max(0.0, s) ** 2 * (1 - c))


# ---------------------------------------------------------------- build parts
w_arm = lr(C.chain_weights([J["shoulder"], J["elbow"], J["wrist"], J["fist"] + (J["fist"] - J["wrist"]) * 2], ["upperarm_L", "forearm_L", "hand_L"], 0.5))
w_leg = lr(C.chain_weights([J["hip"], J["knee"], J["ankle"], J["ankle"] + V(0, 0, -0.2)], ["thigh_L", "shin_L", "foot_L"], 0.5))
w_torso = C.chain_weights([J["hips"] + V(0, -0.2, -0.35), J["spine"], J["chest"], J["neck"], J["head"], J["head"] + V(0, 0.1, 0.3)], ["hips", "spine", "chest", "neck", "head"], 0.7)
w_hand = lr(lambda co: {"hand_L": 1.0})
w_foot = lr(lambda co: {"foot_L": 1.0})
w_head = lambda co: {"head": 1.0}  # noqa: E731

head_ob = C.build("_h", head(), 1)
muz_ob = C.build("_m", muzzle(), 1)
surfH = C.Surf(C.bvh_of([head_ob]))
fplate = disc_plate(surfH, 0, HC.z + 0.0, face_r, 10, lambda x, z, rr: 0.026, "skin2", sink=0.014, rows=[0, 0.25, 0.5, 0.75, 0.95, 1.0])
fp_ob = C.build("_f", fplate, 0)
surfF = C.Surf(C.bvh_of([head_ob, muz_ob, fp_ob]))
torso_ob = C.build("_t", torso(), 1)
surfT = C.Surf(C.bvh_of([torso_ob]))
surfB = C.Surf(C.bvh_of([torso_ob]), Vector((0, -1, 0)))        # from behind
EYE = (0.17, HC.z + 0.1)

brow = M()
bpts = []
for i in range(9):
    x = -0.34 + 0.085 * i
    p, n = surfF.at(x, HC.z + 0.215 - 0.05 * (abs(x) / 0.34) ** 2)
    bpts.append(p + n * 0.035)
brow.add(tube(bpts, [0.05, 0.075, 0.085, 0.085, 0.08, 0.085, 0.085, 0.075, 0.05], 6, "fur", up=Vector((0, -1, 0))))
nost = M()
for sx in (1, -1):
    nost.add(blob_on(surfF, sx * 0.075, 2.345, 0.045, 0.036, 0.03, 2, "nail", 0.45, sx * 0.4))
mouth = M()
mp = []
for i in range(9):
    t = i / 4 - 1
    p, n = surfF.at(0.2 * t, 2.2 - 0.035 * t * t)
    mp.append(p + n * 0.006)
mouth.add(tube(mp, [0.008 + 0.014 * math.sin(math.pi * i / 8) ** 0.6 for i in range(9)], 4, "nail", up=Vector((0, -1, 0))))
chest_p = disc_plate(surfT, 0, 1.72, lambda th: 0.5 * (1 + 0.12 * abs(math.cos(th))) * (1 - 0.14 * max(0.0, -math.sin(th))), 8,
                     lambda x, z, rr: 0.03, "skin2", sink=0.016, rows=[0, 0.3, 0.6, 0.94, 1.0])
chest_p.reg_where("skin", lambda p: abs(p.x) < 0.035 and 1.5 < p.z < 2.02)        # sternum line
saddle = disc_plate(surfB, 0, 1.75, lambda th: 0.55 * (1 + 0.2 * abs(math.cos(th))), 6, lambda x, z, rr: 0.026, "fur2", sink=0.016, rows=[0, 0.5, 0.94, 1.0])

assemble("body", [(torso(), 1, w_torso), (arm().both(), 1, w_arm), (fist().both(), 0, w_hand), (leg().both(), 1, w_leg), (foot().both(), 0, w_foot),
                  (head(), 1, w_head), (muzzle(), 1, w_head), (fplate, 0, w_head), (ear().both(), 0, w_head), (brow, 0, w_head), (nost, 0, w_head),
                  (mouth, 0, w_head), (chest_p, 0, w_torso), (saddle, 0, w_torso)])


def eyes(closed):
    m = M()
    for sx in (1, -1):
        x, z = sx * EYE[0], EYE[1]
        m.add(blob_on(surfF, x, z, 0.05, 0.05, 0.03, 3, "pupil", 0.3))
        p, u, v, n = frame_at(surfF, x, z)
        m.add(qsphere(2, "white").xf(lambda q, p=p, u=u, v=v, n=n: p + u * 0.016 + v * 0.02 + n * 0.022 + u * (q.x * 0.014) + v * (q.z * 0.014) + n * (-q.y * 0.007)))
        # lid: a skin dome that grows over the eye (hidden inside it when open)
        k = lerp(0.7, 1.2, closed)
        c0 = p - n * 0.012
        m.add(qsphere(2, "skin2").xf(lambda q, c0=c0, u=u, v=v, n=n, k=k: c0 + u * (q.x * 0.05 * k) + v * (q.z * 0.05 * k) + n * (max(-q.y, -0.3) * 0.032 * k)))
    return m


face = assemble("face", [(eyes(0.0), 0, w_head)])
tmp = C.assemble("_tmpkey", [(eyes(1.0), 0, w_head)])
C.add_shape_key(face, "blink", tmp)
bpy.data.objects.remove(tmp)

# ---- the Sleeper's outfit
vest = M()
path = [V(0, -0.36, 1.12), V(0, -0.22, 1.36), V(0, -0.02, 1.66), V(0, 0.12, 1.9)]
rad = [0.72, 0.83, 0.93, 0.9]
NSEG = 20
rings = []
for i, (pc, r) in enumerate(zip(path, rad)):
    t = (path[min(len(path) - 1, i + 1)] - path[max(0, i - 1)]).normalized()
    u = Vector((1, 0, 0))
    v = t.cross(u)
    pts = []
    for k in range(NSEG):
        for d in (-0.085, 0.045):                       # a wide cloth panel, then a thin pinstripe
            a = TAU * (k + 0.25 + d) / NSEG + math.pi / 2
            pts.append(pc + u * (r * 1.035 * C_(a)) + v * (r * 0.74 * 1.05 * S_(a)))
    rings.append(pts)
vest = loft(rings, "vest")
n2 = NSEG * 2
for i in range(len(vest.f)):
    if i % n2 % 2 == 0:
        vest.r[i] = C.REG["vest2"]
vest = C._orient(vest, lambda c: Vector((c.x, c.y, 0)))
# hems (rolled edges), shoulder straps, buttons
hem = M()
for pc, r in ((path[0], rad[0]), (path[-1], rad[-1])):
    t = (path[1] - path[0]).normalized() if pc is path[0] else (path[-1] - path[-2]).normalized()
    v = t.cross(Vector((1, 0, 0)))
    pts = [pc + Vector((1, 0, 0)) * (r * 1.04 * C_(TAU * k / 20)) + v * (r * 0.74 * 1.055 * S_(TAU * k / 20)) for k in range(20)]
    hem.add(tube(pts + [pts[0]], [0.06] * 21, 4, "vest", up=t, cap0=False, cap1=False))
straps = M()
for sx in (1, -1):
    pts = [V(sx * 0.42, 0.74, 1.86), V(sx * 0.46, 0.66, 2.12), V(sx * 0.48, 0.32, 2.36), V(sx * 0.46, -0.1, 2.24), V(sx * 0.42, -0.42, 1.92)]
    straps.add(tube(pts, [0.12] * 5, 4, "vest", up=Vector((1, 0, 0)), flat=0.28))
btn = M()
for z in (1.3, 1.5, 1.7):
    p, n = surfT.at(0, z)
    btn.add(ell(2, p + n * 0.06, (0.05, 0.035, 0.05), "gold"))
w_vest = w_torso
assemble("vest", [(vest, 0, w_vest), (hem, 0, w_vest), (straps, 0, w_vest), (btn, 0, w_vest)], True)

mask = M()
for sx in (1, -1):
    mask.add(blob_on(surfF, sx * 0.15, HC.z + 0.37, 0.14, 0.09, 0.05, 3, "mask", 0.2, sx * 0.12))
mask.add(blob_on(surfF, 0, HC.z + 0.36, 0.06, 0.05, 0.04, 2, "mask", 0.2))
band = []
for i in range(14):
    a = TAU * i / 14
    d = Vector((S_(a), -C_(a), 0))
    o = Vector((0, HC.y, HC.z + 0.36 + 0.06 * C_(a))) + d * 3
    loc, _n, _i, _d = C.bvh_of([head_ob]).ray_cast(o, -d)
    band.append(loc + d * 0.015)
mask.add(tube(band + [band[0]], [0.03] * 15, 4, "pink", up=Vector((0, 0, 1)), flat=0.4, cap0=False, cap1=False))
assemble("sleepmask", [(mask, 0, w_head)], True)

ch = M()
p0, n0 = surfT.at(0.02, 1.5)
p1, n1 = surfT.at(0.55, 1.42)
pts = [lerp(p0 + n0 * 0.07, p1 + n1 * 0.07, t) + Vector((0, -0.06 * math.sin(math.pi * t), -0.2 * math.sin(math.pi * t))) for t in [i / 8 for i in range(9)]]
ch.add(tube(pts, [0.022] * 9, 4, "chain", up=Vector((0, -1, 0))))
ch.add(ell(3, p1 + n1 * 0.06 + Vector((0, 0, -0.05)), (0.09, 0.035, 0.09), "chain"))
ch.add(C.rbox(p1 + n1 * 0.03 + Vector((0.01, 0, -0.1)), (0.14, 0.03, 0.07), 0.02, "vest2", 2))
assemble("chain", [(ch, 0, w_torso)])

for o in (head_ob, muz_ob, fp_ob, torso_ob):
    bpy.data.objects.remove(o)

# ---------------------------------------------------------------- armature
FWD, UP = Vector((0, -1, 0)), Vector((0, 0, 1))
bones = [("root", None, V(0, 0, 0), V(0, 0, 0.3), FWD, False), ("hips", "root", J["hips"], J["spine"], FWD, True), ("spine", "hips", J["spine"], J["chest"], FWD, True),
         ("chest", "spine", J["chest"], J["neck"], FWD, True), ("neck", "chest", J["neck"], J["head"], FWD, True), ("head", "neck", J["head"], J["head_top"], FWD, True)]
fistd = (J["fist"] - J["wrist"]).normalized()
thumbd = (V(0, 1, 0) - fistd * V(0, 1, 0).dot(fistd)).normalized()
for s, f in (("_L", lambda v: v), ("_R", mx)):
    bones += [("shoulder" + s, "chest", f(J["clav"]), f(J["shoulder"] + V(-0.06, 0, 0)), FWD, True),
              ("upperarm" + s, "shoulder" + s, f(J["shoulder"]), f(J["elbow"]), FWD, True), ("forearm" + s, "upperarm" + s, f(J["elbow"]), f(J["wrist"]), FWD, True),
              ("hand" + s, "forearm" + s, f(J["wrist"]), f(J["wrist"] + fistd * 0.4), FWD, True),
              ("thigh" + s, "hips", f(J["hip"]), f(J["knee"]), FWD, True), ("shin" + s, "thigh" + s, f(J["knee"]), f(J["ankle"]), FWD, True),
              ("foot" + s, "shin" + s, f(J["ankle"]), f(J["toe"]), UP, True),
              ("sk_hand" + s, "hand" + s, f(J["fist"]), f(J["fist"] + thumbd * 0.2), f(fistd), False)]
fm = surfF.at(0, EYE[1])[0] if False else V(0, 0.95, EYE[1])
bones += [("sk_head", "head", J["head_top"], J["head_top"] + V(0, 0, 0.2), FWD, False), ("sk_face", "head", fm, fm + V(0, 0, 0.2), FWD, False),
          ("sk_back", "chest", V(0, -0.55, 1.95), V(0, -0.55, 2.15), FWD, False)]
arm_ob = C.make_armature("GorillaRig", bones)
for name, ob in PARTS.items():
    piece = ob.data.attributes["piece"].data
    groups = {}
    for v in ob.data.vertices:
        w = {k: x for k, x in WFN[piece[v.index].value](v.co).items() if x > 1e-4}
        w = dict(sorted(w.items(), key=lambda kv: -kv[1])[:4])
        tot = sum(w.values())
        for k, x in w.items():
            g = groups.get(k) or groups.setdefault(k, ob.vertex_groups.new(name=k))
            g.add([v.index], x / tot, "REPLACE")
    C.skin_to(ob, arm_ob)
for name, ob in PARTS.items():
    occ = [PARTS["body"], PARTS["face"]] + ([ob] if name not in ("body", "face") else [])
    C.bake_ao([ob], occ, samples=24, dist=0.7, strength=1.1)
    C.write_uv_and_col(ob, {"fur": "#4f4a58", "fur2": "#5f5a6a", "skin": "#3d3946", "skin2": "#7d7888"})
print("@@TRIS", json.dumps({n: C.tris(o) for n, o in PARTS.items()}))

# ---------------------------------------------------------------- clips
CFG = dict(hips="hips", axial=["spine", "chest", "neck", "head"], pairs=["shoulder"],
           arms=[("L", "shoulder_L", "upperarm_L", "forearm_L", "hand_L"), ("R", "shoulder_R", "upperarm_R", "forearm_R", "hand_R")],
           legs=[("L", "thigh_L", "shin_L", "foot_L"), ("R", "thigh_R", "shin_R", "foot_R")], tail=[])
solver = A.Solver(arm_ob, CFG)
B = solver.base
WR = (0.96, 0.98, 0.42)          # wrist rest
AN = (0.52, -0.42, 0.16)         # ankle rest
for s, sx in (("L", 1), ("R", -1)):
    B["elbow_" + s] = (sx * 1.0, -0.4, 0.3)
    B["knee_" + s] = (sx * 0.5, 1, 0.3)


def hands(lx=0.0, lf=0.0, lz=0.0, rx=0.0, rf=0.0, rz=0.0):
    return {"hand_L": (WR[0] + lx, WR[1] + lf, WR[2] + lz), "hand_R": (-WR[0] + rx, WR[1] + rf, WR[2] + rz)}


def feet(lf=0.0, lz=0.0, rf=0.0, rz=0.0):
    return {"foot_L": (AN[0], AN[1] + lf, AN[2] + lz), "foot_R": (-AN[0], AN[1] + rf, AN[2] + rz)}


def idle(t):
    p = t * TAU
    return {"hips": (0.02 * S_(p - 1), 0, -0.02 + 0.02 * S_(p)), "hips_rot": (0, 0, 1.2 * S_(p - 1)), "spine": (1.5 * S_(p), 0, 0), "chest": (2.2 * S_(p + 0.4), 0, 0),
            "neck": (-1.5 * S_(p + 0.6), 3 * S_(p * 1 - 0.8), 0), "head": (-2 * S_(p + 0.8), 5 * S_(p - 0.8), 1.5 * S_(p)),
            "shoulder_L": (3 * S_(p + 0.4), 0), "shoulder_R": (3 * S_(p + 0.4), 0), **hands(), **feet()}


def walk(t):
    p = t * TAU
    sp = {}
    for s, sx, ph in (("L", 1, p), ("R", -1, p + math.pi)):
        sw = max(0.0, -S_(ph))                      # fist swing
        sp["hand_" + s] = (sx * WR[0], WR[1] + 0.32 * C_(ph), WR[2] + 0.34 * sw ** 0.8)
        ph2 = ph + math.pi                          # opposite foot moves with this fist
        sw2 = max(0.0, -S_(ph2))
        k = "R" if s == "L" else "L"
        sp["foot_" + k] = (-sx * AN[0], AN[1] + 0.26 * C_(ph2), AN[2] + 0.2 * sw2 ** 0.8)
        sp["foot_%s_rot" % k] = (18 * sw2 * (1 if C_(ph2) < 0 else -0.5), 0)
        sp["shoulder_" + s] = (6 * sw, 8 * C_(ph))
    sp.update({"hips": (0.05 * S_(p), 0, -0.03 + 0.05 * abs(S_(p + 0.3))), "hips_rot": (2, 4 * S_(p), 4 * S_(p)), "spine": (2, -3 * S_(p), -3 * S_(p)),
               "chest": (2, -5 * S_(p), -4 * S_(p + 0.3)), "neck": (-2, 3 * S_(p), 2 * S_(p)), "head": (-3 + 2 * abs(S_(p)), 3 * S_(p), 3 * S_(p))})
    return sp


def charge(t):
    """gallop: both fists reach and slam, then the hind legs gather under the body"""
    p = t * TAU
    a = S_(p)
    c = C_(p)
    fr = max(0.0, a)                                 # fists in the air
    hd = max(0.0, -a)                                # hind legs in the air
    return {"hips": (0, 0.05 * c, 0.05 + 0.22 * hd - 0.1 * fr), "hips_rot": (10 + 16 * c, 0, 0), "spine": (6 + 8 * c, 0, 0), "chest": (4 + 6 * c, 0, 0),
            "neck": (-8 - 8 * c, 0, 0), "head": (-10 - 8 * c, 0, 0), "shoulder_L": (10 * fr, 14 * c), "shoulder_R": (10 * fr, 14 * c),
            **hands(0, 0.5 * c, 0.6 * fr, 0, 0.42 * C_(p - 0.35), 0.6 * max(0.0, S_(p - 0.35))),
            **feet(0.42 * C_(p + 2.6), 0.4 * max(0.0, S_(p + 2.6 + math.pi)), 0.36 * C_(p + 2.95), 0.4 * max(0.0, S_(p + 2.95 + math.pi))),
            "foot_L_rot": (30 * hd, 0), "foot_R_rot": (30 * hd, 0)}


UPP = {"hips": (0, -0.34, 0.42), "hips_rot": (-48, 0, 0), "spine": (-12, 0, 0), "chest": (-14, 0, 0), "neck": (14, 0, 0), "head": (22, 0, 0),
       "shoulder_L": (38, -10), "shoulder_R": (38, -10),
       "hand_L": (0.62, 0.05, 3.72), "hand_R": (-0.62, 0.05, 3.72), "hand_L_dir": (-0.2, 0.1, 1), "hand_R_dir": (0.2, 0.1, 1), "hand_L_up": (0, 1, 0), "hand_R_up": (0, 1, 0),
       "elbow_L": (1, -0.3, 0.2), "elbow_R": (-1, -0.3, 0.2), "foot_L": (0.56, -0.38, 0.16), "foot_R": (-0.56, -0.38, 0.16)}
ANT = {"hips": (0, 0.0, -0.16), "hips_rot": (8, 0, 0), "spine": (8, 0, 0), "chest": (8, 0, 0), "head": (6, 0, 0), **hands(0, -0.1, 0, 0, -0.1, 0), **feet()}
HIT = {"hips": (0, 0.2, -0.2), "hips_rot": (16, 0, 0), "spine": (14, 0, 0), "chest": (14, 0, 0), "neck": (-12, 0, 0), "head": (-14, 0, 0), "shoulder_L": (-6, 20), "shoulder_R": (-6, 20),
       "hand_L": (0.5, 1.5, 0.3), "hand_R": (-0.5, 1.5, 0.3), "hand_L_dir": (0, 0.6, -0.8), "hand_R_dir": (0, 0.6, -0.8), "elbow_L": (1, 0, 0.4), "elbow_R": (-1, 0, 0.4), **feet()}


def _puff(k):
    return {**UPP, "chest": (-14 - 6 * k, 0, 0), "hand_L": (0.62 + 0.1 * k, 0.05, 3.72), "hand_R": (-0.62 - 0.1 * k, 0.05, 3.72)}


# windup: the game plays 0 -> 0.6 (rear up, chest puff, fists overhead) and can hold any point of it
windup = A.spline([(0.0, {**hands(), **feet()}), (0.14, ANT), (0.42, UPP), (0.5, _puff(1)), (0.56, _puff(0.2)), (0.62, _puff(1)), (0.8, _puff(0.3)), (1.0, _puff(1))], B)
# slam: 0 -> 0.5 mirrors the windup peak, fists come down 0.5 -> 0.6, impact at 0.6, then a heavy recover
slam = A.spline([(0.0, _puff(1)), (0.48, _puff(1)), (0.6, HIT), (0.66, {**HIT, "hips": (0, 0.2, -0.26), "head": (-8, 0, 0)}), (0.76, {**HIT, "hips": (0, 0.16, -0.16)}),
                 (1.0, {**hands(), **feet()})], B)


def stunned(t):
    p = t * TAU
    return {"hips": (0.06 * S_(p), -0.25, -0.5), "hips_rot": (-30 + 4 * C_(p), 0, 5 * S_(p)), "spine": (4 + 6 * C_(p), 0, 7 * S_(p)), "chest": (6 + 6 * C_(p - 0.4), 0, 7 * S_(p - 0.4)),
            "neck": (8 + 8 * C_(p - 0.9), 8 * S_(p), 10 * S_(p - 0.9)), "head": (10 + 10 * C_(p - 1.3), 10 * S_(p - 0.6), 14 * S_(p - 1.3)),
            "hand_L": (1.2 + 0.05 * S_(p), 0.25, 0.3), "hand_R": (-1.2 + 0.05 * S_(p), 0.25, 0.3), "hand_L_dir": (0.5, 0.5, -0.7), "hand_R_dir": (-0.5, 0.5, -0.7),
            "elbow_L": (1, -0.6, 0.2), "elbow_R": (-1, -0.6, 0.2), "foot_L": (0.62, 0.42, 0.18), "foot_R": (-0.62, 0.42, 0.18), "foot_L_rot": (-50, 20), "foot_R_rot": (-50, -20),
            "knee_L": (0.9, 1, 0.8), "knee_R": (-0.9, 1, 0.8), "shoulder_L": (-8, 0), "shoulder_R": (-8, 0)}


def sleep(t):
    p = t * TAU
    b = S_(p)
    return {"hips": (0, -0.2, -0.56 + 0.02 * b), "hips_rot": (20, 0, 0), "spine": (16 + 2 * b, 0, 0), "chest": (14 + 3 * b, 0, 0), "neck": (14, 12, 0), "head": (16 - 1.5 * b, 20, 14),
            "hand_L": (0.5, 1.12, 0.26), "hand_R": (-0.36, 1.3, 0.24), "hand_L_dir": (-0.8, 0.5, -0.2), "hand_R_dir": (0.8, 0.5, -0.2), "elbow_L": (1, 0.2, 0.2), "elbow_R": (-1, 0.2, 0.2),
            "foot_L": (0.66, -0.3, 0.2), "foot_R": (-0.66, -0.3, 0.2), "knee_L": (1, 0.8, 0.5), "knee_R": (-1, 0.8, 0.5), "foot_L_rot": (0, 30), "foot_R_rot": (0, -30),
            "shoulder_L": (4 + 2 * b, 10), "shoulder_R": (4 + 2 * b, 10)}


hurt = A.spline([(0.0, {**hands(), **feet()}), (0.2, {"hips": (0, -0.12, -0.06), "hips_rot": (-8, 0, 3), "spine": (-8, 0, 3), "chest": (-10, 5, 0), "neck": (8, 0, 0), "head": (14, -8, 6),
                                                    "shoulder_L": (16, -6), "shoulder_R": (16, -6), **hands(0.05, -0.2, 0.5, 0.0, -0.1, 0.1), **feet()}),
                 (0.55, {"hips": (0, 0.02, -0.04), "spine": (4, 0, 0), "chest": (4, 0, 0), "head": (-4, 0, 0), **hands(), **feet()}), (1.0, {**hands(), **feet()})], B)


def defeat(t):
    k = A.spline([
        (0.0, {"hand_L": (0.96, 0.98, 0.42), "hand_R": (-0.96, 0.98, 0.42)}),
        (0.2, {"spine": (-10, 0, 6), "chest": (-12, 0, 6), "head": (-16, 0, 10), "hand_L": (1.3, 0.5, 2.6), "hand_R": (-1.3, 0.5, 2.4), "hand_L_dir": (0.6, 0.2, 0.7), "hand_R_dir": (-0.6, 0.2, 0.7), "shoulder_L": (30, 0), "shoulder_R": (30, 0)}),
        (0.45, {"spine": (-14, 0, -6), "chest": (-14, 0, -6), "head": (-20, 0, -12), "hand_L": (1.4, 0.4, 2.9), "hand_R": (-1.4, 0.4, 2.9), "hand_L_dir": (0.6, 0.2, 0.7), "hand_R_dir": (-0.6, 0.2, 0.7), "shoulder_L": (34, 0), "shoulder_R": (34, 0)}),
        (0.72, {"spine": (-4, 0, 0), "chest": (-2, 0, 0), "neck": (8, 0, 0), "head": (12, 0, 0), "hand_L": (1.6, 0.3, 2.0), "hand_R": (-1.6, 0.3, 2.0), "hand_L_dir": (1, 0, 0.2), "hand_R_dir": (-1, 0, 0.2),
                "foot_L": (0.6, 0.3, 0.6), "foot_R": (-0.6, 0.2, 0.5), "knee_L": (0.8, 1, 0.6), "knee_R": (-0.8, 1, 0.6)}),
        (0.86, {"hand_L": (1.7, 0.2, 1.7), "hand_R": (-1.7, 0.2, 1.7), "hand_L_dir": (1, 0, 0), "hand_R_dir": (-1, 0, 0), "head": (-6, 8, 0),
                "foot_L": (0.62, 0.5, 0.9), "foot_R": (-0.62, 0.4, 0.7), "knee_L": (0.8, 1, 0.6), "knee_R": (-0.8, 1, 0.6)}),
        (1.0, {"hand_L": (1.7, 0.2, 1.6), "hand_R": (-1.7, 0.2, 1.6), "hand_L_dir": (1, 0, 0), "hand_R_dir": (-1, 0, 0), "head": (0, 10, 0),
               "foot_L": (0.64, 0.4, 0.62), "foot_R": (-0.64, 0.34, 0.56), "knee_L": (0.8, 1, 0.6), "knee_R": (-0.8, 1, 0.6)}),
    ], B)(t)
    lie = min(1.0, max(0.0, (t - 0.42) / 0.26)) ** 1.5
    bounce = 0.0 if t < 0.7 else 0.12 * abs(S_((t - 0.7) / 0.3 * TAU)) * (1 - (t - 0.7) / 0.3)
    wob = S_(t * 22) * (1 - lie)
    k["hips"] = (0.05 * wob, -0.3 * lie - 0.1 * min(1.0, t / 0.4), 0.3 * S_(min(1.0, t / 0.42) * math.pi) * (1 - lie) - 0.52 * lie + bounce)
    k["hips_rot"] = (-40 * min(1.0, t / 0.42) * (1 - lie) - 112 * lie, 0, 6 * wob)
    return k


CLIPS = {"idle": (78, True, idle, "arm"), "walk": (30, True, walk, "arm"), "charge": (15, True, charge, "arm"), "windup": (27, False, windup, "arm"),
         "slam": (18, False, slam, "arm"), "stunned": (48, True, stunned, "arm"), "sleep": (96, True, sleep, "arm"), "hurt": (12, False, hurt, "arm"),
         "defeat": (40, False, defeat, "hips")}
acts = [A.bake_clip(solver, n, fr, fn, sp, sp, lp) for n, (fr, lp, fn, sp) in CLIPS.items()]
A.stash(arm_ob, acts)
bpy.context.scene.render.fps = A.FPS

if "--sheet" in ARGS or "--poses" in ARGS:
    C.setup_studio()
    arm_ob.hide_render = True
if "--sheet" in ARGS:
    out = ARGS[ARGS.index("--sheet") + 1]
    C.render_views(out, (0, 0.2, 1.5), 13, C.TURN, res=(520, 520))
    for n in ("vest", "sleepmask", "chain"):
        PARTS[n].hide_render = True
    C.render_views(out.replace(".png", "_brute.png"), (0, 0.2, 1.5), 13, C.TURN[:2], res=(520, 520))
    for n in ("vest", "sleepmask", "chain"):
        PARTS[n].hide_render = False
if "--poses" in ARGS:
    out = ARGS[ARGS.index("--poses") + 1]
    for spec in ARGS[ARGS.index("--poses") + 2].split(","):
        clip, n = spec.split(":")
        fr, lp = CLIPS[clip][0], CLIPS[clip][1]
        A.solo(arm_ob, clip)
        C.render_strip(os.path.join(out, "gpose_%s.png" % clip), (0, 0.3, 1.6), 17, 40, 22, [round(i * fr / (int(n) - (0 if lp else 1))) for i in range(int(n))], res=(330, 330))
A.unmute(arm_ob)
for n, o in PARTS.items():
    o.name = o.data.name = "p_" + n
os.makedirs(os.path.join(HERE, "build"), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "build", "gorilla.blend"))
path = os.path.join(ROOT, "public", "models", "gorilla.glb")
C.export_glb(path, [arm_ob] + list(PARTS.values()))
print("@@GLB", path, os.path.getsize(path))
