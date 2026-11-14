"""Build the Bananaville monkey (player, wild monkeys, bandits): parts, armature, weights, AO, clips, GLB.

Run: blender -b --factory-startup --python tools/blender/build_monkey.py -- [--sheet out.png] [--no-anim]
Outputs: public/models/monkey.glb, tools/blender/build/monkey.blend
"""
import os
import sys
import json
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bv_common as C  # noqa: E402
import monkey_parts as P  # noqa: E402
from bv_common import V, M  # noqa: E402

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ROOT = os.path.dirname(os.path.dirname(HERE))
C.clean_scene()
PARTS = {}          # name -> object
WFN = {}            # piece id -> weight fn


def mx(v):
    return Vector((-v.x, v.y, v.z))


def assemble(name, pieces):
    ob = C.assemble(name, pieces, WFN)
    PARTS[name] = ob
    return ob


def lr(fn_left):
    """mirror a left-side weight fn to both sides"""
    def fn(co):
        if co.x >= 0:
            return fn_left(co)
        return {k.replace("_L", "_R"): w for k, w in fn_left(mx(co)).items()}
    return fn


J, TAIL = P.J, P.TAIL
w_arm = lr(C.chain_weights([J["shoulder"], J["elbow"], J["wrist"], J["fist"] + (J["fist"] - J["wrist"])], ["upperarm_L", "forearm_L", "hand_L"], 0.5))
w_leg = lr(C.chain_weights([J["hip"], J["knee"], J["ankle"], J["ankle"] + V(0, 0, -0.1)], ["thigh_L", "shin_L", "foot_L"], 0.5))
w_hand = lr(lambda co: {"hand_L": 1.0})
w_thumb = lr(lambda co: {"thumb_L": 1.0})
w_foot = lr(lambda co: {"foot_L": 1.0})
w_tail = C.chain_weights(TAIL, ["tail1", "tail2", "tail3", "tail4", "tail5", "tail5"], 0.6)


def w_tail_root(co):
    w = w_tail(co)
    k = C.smooth(-0.30, -0.22, -co.y * -1) if False else C.smooth(0.30, 0.22, co.y)   # near the pelvis: follow the hips
    out = {b: x * (1 - k) for b, x in w.items()}
    out["hips"] = out.get("hips", 0) + k
    return out


# ---------------------------------------------------------------- head + face
head_ob = C.build("_head", P.head_cage(4), 1)
surfH = C.Surf(C.bvh_of([head_ob]))
face_ob = C.build("_face", P.face_plate(surfH), 0)
surfF = C.Surf(C.bvh_of([head_ob, face_ob]))
bpy.data.objects.remove(head_ob)
bpy.data.objects.remove(face_ob)
assemble("head", [(P.head_cage(4), 1, P.w_head), (P.face_plate(surfH), 0, P.w_head), (P.nostrils(surfF), 0, P.w_head)])
DX = P.EYE[0] * P.EYE_SPACING
TILT = 0.42


def key(ob, name, m):
    """shape key from a same-topology variant"""
    t = assemble("_t", [(m, 0, P.w_head)])
    C.add_shape_key(ob, name, t)
    me = t.data
    bpy.data.objects.remove(t)
    bpy.data.meshes.remove(me)
    del PARTS["_t"]


for st in P.EYE_STYLES:
    key(assemble("eyes_" + st, [(P.eyes(surfF, st), 0, P.w_head)]), "eyeWide", P.eyes(surfF, st, DX))
    l = assemble("lids_" + st, [(P.lids(surfF, st, 0.0), 0, P.w_head)])
    key(l, "blink", P.lids(surfF, st, 1.0))
    key(l, "eyeWide", P.lids(surfF, st, 0.0, DX))
for st in P.BROW_STYLES:
    b = assemble("brows_" + st, [(P.brows(surfF, st), 0, P.w_head)])
    key(b, "eyeWide", P.brows(surfF, st, dx=DX))
    key(b, "browTilt", P.brows(surfF, st, tilt=TILT))
for st in ("smile", "grin", "smirk", "toothy", "whistle"):
    assemble("mouth_" + st, [(P.mouth(surfF, st), 0, P.w_head)])
assemble("tuft", [(P.tuft(), 0, P.w_head)])
for st in ("round", "pointy", "floppy"):
    tmp = C.build("_ear", P.ear(st), 0)
    inner = P.ear_inner(tmp, st)
    bpy.data.objects.remove(tmp)
    assemble("ears_" + st, [(P.ear(st).both(), 0, P.w_ear), (inner.both(), 0, P.w_ear)])

# ---------------------------------------------------------------- bodies
for kind in ("suit", "fur", "tee"):
    t_ob = C.build("_torso", P.torso(kind), 1)
    surfT = C.Surf(C.bvh_of([t_ob]))
    bpy.data.objects.remove(t_ob)
    pieces = [(P.torso(kind), 1, P.w_torso), (P.arm(kind).both(), 1, w_arm), (P.leg(kind).both(), 1, w_leg)]
    if kind == "suit":
        pieces.append((P.suit_front(surfT), 0, P.w_torso))
        for st in ("tie", "bowtie"):
            assemble("tie_" + st, [(P.tie(surfT, st), 0, P.w_torso)])
    if kind == "fur":
        pieces.append((P.belly(surfT), 0, P.w_torso))
    assemble("torso_" + kind, pieces)
hm = P.hand()
n_fist = len(C.qsphere(4).v)
fist, thumb = M(), M()
fist.v, fist.f, fist.r = hm.v[:n_fist], [f for f in hm.f if max(f) < n_fist], [r for f, r in zip(hm.f, hm.r) if max(f) < n_fist]
thumb.v = hm.v[n_fist:]
thumb.f = [tuple(i - n_fist for i in f) for f in hm.f if min(f) >= n_fist]
thumb.r = [r for f, r in zip(hm.f, hm.r) if min(f) >= n_fist]
assemble("hands", [(fist.both(), 0, w_hand), (thumb.both(), 0, w_thumb)])
for st in ("round", "shoes"):
    assemble("feet_" + st, [(P.foot(st).both(), 0, w_foot)])
assemble("tail", [(P.tail(), 0, w_tail_root)])
# ---------------------------------------------------------------- armature
FWD, UP = Vector((0, -1, 0)), Vector((0, 0, 1))
bones = [("root", None, V(0, 0, 0), V(0, 0, 0.14), FWD, False),
         ("hips", "root", J["hips"], J["spine"], FWD, True), ("spine", "hips", J["spine"], J["chest"], FWD, True),
         ("chest", "spine", J["chest"], J["neck"], FWD, True), ("neck", "chest", J["neck"], J["head"], FWD, True),
         ("head", "neck", J["head"], V(0, 0, 1.46), FWD, True)]
fistd = (J["fist"] - J["wrist"]).normalized()
thumbd = (V(0, 1, 0) - fistd * V(0, 1, 0).dot(fistd)).normalized()
for s, f in (("_L", lambda v: v), ("_R", mx)):
    bones += [("ear" + s, "head", f(J["ear"]), f(J["ear_tip"]), FWD, True),
              ("shoulder" + s, "chest", f(V(0.08, 0, 0.93)), f(V(0.255, 0, 0.93)), FWD, True),
              ("upperarm" + s, "shoulder" + s, f(J["shoulder"]), f(J["elbow"]), FWD, True),
              ("forearm" + s, "upperarm" + s, f(J["elbow"]), f(J["wrist"]), FWD, True),
              ("hand" + s, "forearm" + s, f(J["wrist"]), f(J["wrist"] + fistd * 0.17), FWD, True),
              ("thumb" + s, "hand" + s, f(J["fist"] + thumbd * 0.06), f(J["fist"] + thumbd * 0.13), f(fistd), True),
              ("thigh" + s, "hips", f(J["hip"]), f(J["knee"]), FWD, True),
              ("shin" + s, "thigh" + s, f(J["knee"]), f(J["ankle"]), FWD, True),
              ("foot" + s, "shin" + s, f(J["ankle"]), f(J["toe"]), UP, True),
              # hand socket: bone Y = thumb side (gun up), bone Z = along the fist (barrel)
              ("sk_hand" + s, "hand" + s, f(J["fist"]), f(J["fist"] + thumbd * 0.1), f(fistd), False)]
for i in range(5):
    bones.append(("tail%d" % (i + 1), "hips" if i == 0 else "tail%d" % i, TAIL[i], TAIL[i + 1], UP, True))
face_mid = surfF.at(0, P.HC.z + P.EYE[1])[0]
bones += [("sk_head", "head", P.HEAD_TOP, P.HEAD_TOP + V(0, 0, 0.1), FWD, False),
          ("sk_face", "head", face_mid, face_mid + V(0, 0, 0.1), FWD, False),
          ("sk_back", "chest", V(0, -0.255, 0.80), V(0, -0.255, 0.90), FWD, False)]
arm = C.make_armature("MonkeyRig", bones)

for name, ob in PARTS.items():
    piece = ob.data.attributes["piece"].data
    C.set_weights(ob, lambda co, ob=ob, piece=piece: {})  # placeholder to keep API simple
    for g in list(ob.vertex_groups):
        ob.vertex_groups.remove(g)
    groups = {}
    for v in ob.data.vertices:
        w = {k: x for k, x in WFN[piece[v.index].value](v.co).items() if x > 1e-4}
        w = dict(sorted(w.items(), key=lambda kv: -kv[1])[:4])
        tot = sum(w.values())
        for k, x in w.items():
            g = groups.get(k) or groups.setdefault(k, ob.vertex_groups.new(name=k))
            g.add([v.index], x / tot, "REPLACE")
    C.skin_to(ob, arm)

# ---------------------------------------------------------------- AO + colour channels
DEFAULT = ["head", "ears_round", "eyes_round", "lids_round", "brows_bold", "mouth_smile", "torso_suit", "tie_tie", "hands", "feet_round", "tail"]


def slot(n):
    return n.split("_")[0]


for name, ob in PARTS.items():
    occ = [PARTS[d] for d in DEFAULT if slot(d) != slot(name)] + [ob]
    if name.startswith("torso_") and name != "torso_suit":
        occ = [o for o in occ if not o.name.startswith("tie_")]
    C.bake_ao([ob], occ, samples=24, strength=1.15)
    C.write_uv_and_col(ob)

stats = {n: C.tris(o) for n, o in PARTS.items()}
print("@@TRIS", json.dumps(stats), "default:", sum(stats[d] for d in DEFAULT))

# ---------------------------------------------------------------- clips
import bv_anim as A  # noqa: E402
import monkey_anim as MA  # noqa: E402
solver = A.Solver(arm, MA.CFG)
acts = MA.make_clips(solver)
A.stash(arm, acts)
bpy.context.scene.render.fps = A.FPS
bpy.context.scene.frame_start, bpy.context.scene.frame_end = 0, 60

show = set(DEFAULT)
if "--show" in ARGS:
    show = set(ARGS[ARGS.index("--show") + 1].split(","))
for n, o in PARTS.items():
    o.hide_render = n not in show
    o.hide_viewport = n not in show
if "--sheet" in ARGS:
    out = ARGS[ARGS.index("--sheet") + 1]
    C.setup_studio()
    C.render_views(out, (0, 0, 1.0), 6.3, C.TURN)
    C.render_views(out.replace(".png", "_head.png"), (0, 0, 1.4), 4.6, [("front", 0, 5), ("three_quarter", 35, 12), ("top", 20, 55)], res=(640, 640))
if "--poses" in ARGS:
    out = ARGS[ARGS.index("--poses") + 1]
    if not bpy.context.scene.camera:
        C.setup_studio()
    for spec in ARGS[ARGS.index("--poses") + 2].split(","):
        clip, n = spec.split(":")
        fr = MA.CLIPS[clip][0]
        A.solo(arm, clip)
        C.render_strip(os.path.join(out, "pose_%s.png" % clip), (0, 0, 0.95), 7.5, 40, 22, [round(i * fr / (int(n) - 1)) if not MA.CLIPS[clip][1] else round(i * fr / int(n)) for i in range(int(n))])
    A.unmute(arm)

for o in PARTS.values():
    o.hide_render = o.hide_viewport = False
A.unmute(arm)
for n, o in PARTS.items():          # "p_" keeps mesh nodes from colliding with bone names (head, tail) in the glTF
    o.name = o.data.name = "p_" + n
os.makedirs(os.path.join(HERE, "build"), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "build", "monkey.blend"))
out = os.path.join(ROOT, "public", "models", "monkey.glb")
C.export_glb(out, [arm] + list(PARTS.values()))
print("@@GLB", out, os.path.getsize(out))
