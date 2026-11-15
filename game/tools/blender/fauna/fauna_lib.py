"""Bananaville wildlife: shared helpers (Blender 5.2, headless).

The animals are built the way the monkey is (tools/blender/bv_common.py): low cages of cube-spheres, lofts and tubes,
one colour zone per face, ambient occlusion per vertex. They differ in two ways:
- Colour is baked. The character palette is full (48 zones), and an animal has no Look to recolour, so the zone colour
  times the AO tint is written to the colour attribute "Col" and exported as glTF COLOR_0 (linear), the way the kit and
  the nature set ship. The numbers are the ones charmat.ts computes, so an animal shades like a monkey beside it.
- Each animal is one skinned mesh on its own small armature, `fauna_<id>`, with bones named `<id>_<bone>` (unique across
  the file, so three.js binds clips by name without renaming anything) and clips named `<id>_<clip>`.

Space: +X = the animal's left, -Y = forward, +Z = up, metres. V(x, f, z) takes (left, forward, up).

Poses are written about the armature's own axes, whatever a bone's roll:
  "<bone>": (pitch, yaw, roll) degrees      pitch + = nose down, yaw + = turn left, roll + = lean right
  "loc:<bone>": (x, forward, up) metres     offset in armature axes
  "ik:<chain>": (x, forward, up)            foot target in armature space (two-bone chains named in the rig's `ik`)
  "ikc:<chain>" + "ikk:<chain>"             the same target carried by the chain's parent bone, and the 0..1 mix toward it
"""
import math
import os
import sys

import bpy
from mathutils import Matrix, Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import bv_common as C  # noqa: E402
from bv_common import V, M, qsphere, ell, ring, loft, tube, smooth, lerp  # noqa: E402,F401

FPS = 30
TAU = math.tau
S_, C_ = math.sin, math.cos
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
FWD, UP = Vector((0, -1, 0)), Vector((0, 0, 1))

# zone colours (sRGB), appended to the character palette for this Blender process only
PAL = {
    # crab
    "c_shell": "#e4572e", "c_shell2": "#c13d22", "c_belly": "#f6cf9c", "c_claw": "#ee6a34", "c_tip": "#fbe6c4", "c_leg": "#d94a26", "c_leg2": "#9d2f1b",
    # parrot
    "p_red": "#e23a2e", "p_red2": "#b9281f", "p_yellow": "#ffd23f", "p_green": "#3fae5a", "p_blue": "#2f7fd6", "p_blue2": "#1f55a6", "p_face": "#fbf3e4",
    "p_beak": "#f3e3c0", "p_beak2": "#3a3034", "p_foot": "#6c6470",
    # frog
    "f_green": "#5cb23e", "f_green2": "#3f8f33", "f_belly": "#e6eeb0", "f_eye": "#f26a2a", "f_toe": "#f59a3a",
    # boar
    "b_hide": "#7a5238", "b_hide2": "#5c3c2a", "b_belly": "#a8825e", "b_mane": "#33221d", "b_snout": "#d99a8c", "b_tusk": "#f7efd8", "b_hoof": "#2e2420",
    "b_ear": "#c98a78",
    # crocodile
    "k_back": "#5a7d3e", "k_back2": "#3f5d30", "k_belly": "#e3d9a2", "k_eye": "#f0d43a", "k_mouth": "#c4564a", "k_tooth": "#fbf6e6", "k_claw": "#d9cfa8",
}
for _n, _h in PAL.items():
    if _n not in C.REG:
        C.REG[_n] = len(C.REGIONS)
        C.REGIONS.append(_n)
    C.PALETTE[_n] = _h


def vf(t):
    """(x, forward, up) -> Blender vector"""
    return Vector((t[0], -t[1], t[2]))


def mx(v):
    return Vector((-v.x, v.y, v.z))


def bump(t, c, w):
    """raised-cosine pulse of width w centred on c, periodic in t (0..1)"""
    d = (t - c + 0.5) % 1.0 - 0.5
    return 0.5 * (1 + C_(math.pi * d / (w / 2))) if abs(d) < w / 2 else 0.0


def pulse(t, a, b, c, d):
    """0 before a, 1 between b and c, 0 after d, smooth ramps"""
    return smooth(a, b, t) * (1 - smooth(c, d, t))


# ------------------------------------------------------------------ shapes
def spine(stations, m=10, reg="fur", p=2.3, cap0=0.5, cap1=0.5, regs=None):
    """loft along the body: stations = [(forward, up, half width, half height)], ends closed by a fan pushed out by
    cap * half height (None leaves the end open)"""
    rings = [ring(V(0, f, z), X, Z, hw, hh, m, p) for f, z, hw, hh in stations]
    (f0, z0, _w0, h0), (f1, z1, _w1, h1) = stations[0], stations[-1]
    d0 = 1 if f0 < stations[1][0] else -1
    c0 = V(0, f0 - d0 * cap0 * h0, z0) if cap0 is not None else None
    c1 = V(0, f1 + d0 * cap1 * h1, z1) if cap1 is not None else None
    return loft(rings, regs or reg, c0, c1)


def ftube(path, radii, m=6, reg="fur", up=UP, flat=1.0, regs=None, cap0=0.6, cap1=0.6):
    """bv_common.tube with a choice of end: the cap fan sits cap * radius beyond the last ring (0 = a flat end)"""
    rings, prev_u = [], None
    for i, pt in enumerate(path):
        t = (path[min(len(path) - 1, i + 1)] - path[max(0, i - 1)]).normalized()
        u = prev_u if prev_u is not None else up.cross(t)
        u = u - t * u.dot(t)
        if u.length < 1e-5:
            u = X.cross(t)
        u.normalize()
        prev_u = u
        rings.append(ring(pt, u, t.cross(u), radii[i], radii[i] * flat, m))
    return loft(rings, regs or reg, path[0] - (path[1] - path[0]).normalized() * radii[0] * cap0, path[-1] + (path[-1] - path[-2]).normalized() * radii[-1] * cap1)


def disc(c, n, r, depth=0.014, reg="pupil", m=6, flat=1.0, up=UP):
    """a small round button (pupil, nostril) centred on c, facing along n, sunk half its depth into the surface"""
    n = n.normalized()
    return ftube([c - n * depth, c + n * depth * 0.5], [r, r * 0.86], m, reg, up=up, flat=flat, cap0=0.0, cap1=0.25)


def spike(base, tip, r, m=4, reg="dark"):
    """a pointed cone from base to tip (closed)"""
    return tube([base, tip], [r, r * 0.06], m, reg)


def blade(pts, widths, thick, reg="fur", up=UP, regs=None):
    """a flat tapered feather / fin through pts: a 4-sided tube squashed to `thick` of its width"""
    return tube(pts, widths, 4, reg, up=up, flat=thick, regs=regs)


def rigid(bone):
    return lambda co: {bone: 1.0}


def lr(fn_left):
    """mirror a left-side weight function to the right side (bone names ending _L... -> _R...)"""
    def fn(co):
        if co.x >= 0:
            return fn_left(co)
        return {k.replace("_L", "_R"): w for k, w in fn_left(mx(co)).items()}
    return fn


# ------------------------------------------------------------------ one animal
class Animal:
    def __init__(self, ident):
        self.id, self.px = ident, ident + "_"
        self.pieces, self.wfn = [], {}
        self.clips = {}          # name -> (frames, loop)
        self.notes = {}

    def add(self, m, weight, levels=0):
        """m: a bv_common.M; weight: bone name (rigid) or fn(co) -> {bone: w}"""
        self.pieces.append((m, levels, rigid(weight) if isinstance(weight, str) else weight))
        return m

    def both(self, m, weight_left, levels=0):
        """a left-side piece and its mirror; weight_left names _L bones"""
        return self.add(m.both(), lr(rigid(weight_left) if isinstance(weight_left, str) else weight_left), levels)

    def finish(self, bones, ao_dist=0.25, ao_strength=1.0, sharp=42.0):
        """bones: [(name, parent, head, tail, deform)] -> (armature object, mesh object)"""
        px = self.px
        ob = C.assemble(self.id + "_mesh", self.pieces, self.wfn)
        spec = []
        for name, parent, head, tail, deform in bones:
            d = (tail - head).normalized()
            spec.append((px + name, px + parent if parent else None, head, tail, FWD if abs(d.z) > 0.8 else UP, deform))
        arm = C.make_armature("fauna_" + self.id, spec)
        arm.data.name = "fauna_" + self.id
        piece = ob.data.attributes["piece"].data
        groups = {}
        for v in ob.data.vertices:
            w = {k: x for k, x in self.wfn[piece[v.index].value](v.co).items() if x > 1e-4}
            w = dict(sorted(w.items(), key=lambda kv: -kv[1])[:4])
            tot = sum(w.values())
            for k, x in w.items():
                g = groups.get(k) or groups.setdefault(k, ob.vertex_groups.new(name=px + k))
                g.add([v.index], x / tot, "REPLACE")
        missing = sorted(set(groups) - {b[0] for b in bones})
        if missing:
            raise ValueError("%s: weights name bones that do not exist: %s" % (self.id, missing))
        C.skin_to(ob, arm)
        C.bake_ao([ob], [ob], samples=24, dist=ao_dist, strength=ao_strength)
        C.write_uv_and_col(ob)
        ob.data.uv_layers.remove(ob.data.uv_layers[0])          # colour ships in COLOR_0; the zone UVs are not exported
        for a in ("piece", "gloss"):
            ob.data.attributes.remove(ob.data.attributes[a])
        ob.data.set_sharp_from_angle(angle=math.radians(sharp))  # crisp facets where the cage folds, smooth elsewhere
        self.arm, self.ob = arm, ob
        arm["fauna"] = self.id
        return arm, ob


# ------------------------------------------------------------------ poses
def _drot(pyr):
    if isinstance(pyr, Quaternion):
        return pyr.to_matrix()
    p, y, r = (math.radians(a) for a in pyr)
    return Matrix.Rotation(y, 3, "Z") @ Matrix.Rotation(p, 3, "X") @ Matrix.Rotation(r, 3, FWD)


def aa(axis, deg):
    """rotation about an armature-space axis (a Blender vector), as a pose value"""
    return Quaternion(Vector(axis).normalized(), math.radians(deg))


def mirror_q(q):
    """the same rotation on the other side of the animal"""
    return Quaternion((q.w, q.x, -q.y, -q.z))


class Rig:
    def __init__(self, animal, ik=None):
        """ik: {chain: (upper bone, lower bone, pole direction (x, forward, up))}"""
        self.ob, self.px = animal.arm, animal.px
        n = len(self.px)
        arm = self.ob.data
        self.rest = {b.name[n:]: b.matrix_local.copy() for b in arm.bones}
        self.parent = {b.name[n:]: (b.parent.name[n:] if b.parent else None) for b in arm.bones}
        self.order = [b.name[n:] for b in arm.bones]             # parents first
        self.rel = {k: (self.rest[self.parent[k]].inverted() @ self.rest[k]) if self.parent[k] else self.rest[k].copy() for k in self.order}
        self.len = {b.name[n:]: b.length for b in arm.bones}
        self.ik = ik or {}
        self.base = {k: (0.0, 0.0, 0.0) for k in self.order}
        for k in self.order:
            self.base["loc:" + k] = (0.0, 0.0, 0.0)
        for name, (_b1, b2, _pole) in self.ik.items():
            tip = self.rest[b2] @ Vector((0, self.len[b2], 0))
            self.base["ik:" + name] = self.base["ikc:" + name] = (tip.x, -tip.y, tip.z)
            self.base["ikk:" + name] = 0.0

    def full(self, sp):
        out = dict(self.base)
        out.update(sp)
        return out

    def mix(self, a, b, k):
        """blend two poses (missing channels are the rest pose)"""
        a, b = self.full(a), self.full(b)
        out = {}
        for key, va in a.items():
            vb = b[key]
            if isinstance(va, Quaternion) or isinstance(vb, Quaternion):
                out[key] = _drot(va).to_quaternion().slerp(_drot(vb).to_quaternion(), k)
            else:
                out[key] = va + (vb - va) * k if isinstance(va, (int, float)) else tuple(x + (y - x) * k for x, y in zip(va, vb))
        return out

    def bridge(self, fn, start=None, end=None, w0=0.14, w1=0.2):
        """fn(t) eased out of `start` over the first w0 of the clip and into `end` over the last w1"""
        def out(t):
            p = self.full(fn(t))
            if start is not None and t < w0:
                p = self.mix(start, p, smooth(0.0, w0, t))
            if end is not None and t > 1 - w1:
                p = self.mix(p, end, smooth(1 - w1, 1.0, t))
            return p
        return out

    def solve(self, sp):
        """pose spec -> ({bone: (location, quaternion)}, {bone: armature-space matrix})"""
        rest, rel = self.rest, self.rel
        L, W = {}, {}
        first = {b1: name for name, (b1, _b2, _p) in self.ik.items()}
        second = {b2 for _b1, b2, _p in self.ik.values()}
        for n in self.order:
            p = self.parent[n]
            P = (W[p] @ rel[n]) if p else rel[n].copy()          # this bone, unposed, under its posed parent
            if n in second:
                continue
            if n in first:
                name = first[n]
                b1, b2, pole = self.ik[name]
                target, pv = vf(sp["ik:" + name]), vf(pole)
                k = sp["ikk:" + name]
                if k > 0 and p:
                    carry = W[p] @ rest[p].inverted()
                    target = target.lerp(carry @ vf(sp["ikc:" + name]), k)
                    pv = pv.lerp(carry.to_3x3() @ pv, k)
                S = P.translation
                l1, l2 = self.len[b1], self.len[b2]
                v = target - S
                d = max(abs(l1 - l2) + 1e-3, min(l1 + l2 - 1e-3, v.length))
                nrm = v.normalized() if v.length > 1e-6 else Vector((0, 0, -1))
                a = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
                hh = math.sqrt(max(0.0, l1 * l1 - a * a))
                pp = pv - nrm * pv.dot(nrm)
                pp = pp.normalized() if pp.length > 1e-5 else nrm.orthogonal().normalized()
                E, T = S + nrm * a + pp * hh, S + nrm * d
                R1 = P.to_3x3()
                q1 = (R1 @ Y).rotation_difference(E - S)
                ql = (R1.inverted() @ (q1.to_matrix() @ R1)).to_quaternion()
                L[b1] = (None, ql)
                W[b1] = P @ ql.to_matrix().to_4x4()
                P2 = W[b1] @ rel[b2]
                R2 = P2.to_3x3()
                q2 = (R2 @ Y).rotation_difference(T - E)
                ql2 = (R2.inverted() @ (q2.to_matrix() @ R2)).to_quaternion()
                L[b2] = (None, ql2)
                W[b2] = P2 @ ql2.to_matrix().to_4x4()
                continue
            Br = rest[n].to_3x3()
            q = (Br.inverted() @ _drot(sp[n]) @ Br).to_quaternion()
            loc = sp["loc:" + n]
            m = q.to_matrix().to_4x4()
            lv = None
            if abs(loc[0]) + abs(loc[1]) + abs(loc[2]) > 1e-9:
                lv = P.to_3x3().inverted() @ vf(loc)
                m = Matrix.Translation(lv) @ m
            L[n] = (lv, q)
            W[n] = P @ m
        return L, W

    def bake(self, name, frames, fn):
        """key every bone on every frame of a new action; fn(t 0..1) -> pose spec"""
        ob, n = self.ob, len(self.px)
        ad = ob.animation_data or ob.animation_data_create()
        act = bpy.data.actions.new(name)
        ad.action = act
        prev = {}
        for pb in ob.pose.bones:
            pb.rotation_mode = "QUATERNION"
        for f in range(frames + 1):
            L, _W = self.solve(self.full(fn(f / frames)))
            for pb in ob.pose.bones:
                loc, q = L[pb.name[n:]]
                if pb.name in prev and prev[pb.name].dot(q) < 0:
                    q = -q
                prev[pb.name] = q.copy()
                pb.rotation_quaternion = q
                pb.keyframe_insert("rotation_quaternion", frame=f)
                pb.location = loc if loc is not None else (0, 0, 0)
                pb.keyframe_insert("location", frame=f)
        act.frame_range = (0, frames)
        act.use_frame_range = True
        act.use_fake_user = True
        return act

    def stash(self, actions):
        """one muted NLA track per clip (the glTF exporter writes one animation per track name)"""
        ad = self.ob.animation_data
        ad.action = None
        for pb in self.ob.pose.bones:
            pb.location = (0, 0, 0)
            pb.rotation_quaternion = (1, 0, 0, 0)
        for act in actions:
            tr = ad.nla_tracks.new()
            tr.name = act.name
            st = tr.strips.new(act.name, 0, act)
            st.name = act.name
            tr.mute = True


def bake_clips(animal, rig, clips):
    """clips: {clip: (frames, loop, fn)} -> actions named <id>_<clip>, stashed; records frames and loop flags"""
    acts = []
    for name, (frames, loop, fn) in clips.items():
        acts.append(rig.bake(animal.px + name, frames, fn))
        animal.clips[name] = (frames, loop)
    rig.stash(acts)
    return acts


def tris(ob):
    return C.tris(ob)


def export_glb(path, objs):
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for o in objs:
        o.hide_set(False)
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True, export_yup=True, export_apply=False,
        export_normals=True, export_tangents=False, export_materials="EXPORT", export_vertex_color="ACTIVE",
        export_all_vertex_colors=False, export_active_vertex_color_when_no_material=True, export_texcoords=False,
        export_skins=True, export_all_influences=False, export_influence_nb=4, export_morph=False,
        export_animations=True, export_animation_mode="NLA_TRACKS", export_force_sampling=True, export_frame_step=1,
        export_optimize_animation_size=False, export_def_bones=False, export_extras=True,
        export_rest_position_armature=True, export_anim_slide_to_zero=True, export_image_format="NONE")
    return os.path.getsize(path)
