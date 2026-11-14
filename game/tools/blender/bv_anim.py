"""Clip authoring for the Bananaville rigs: poses are written in character terms (hip offset, spine angles,
hand and foot targets) and solved to bone rotations with FK + two-bone IK, then keyed on every frame.

Pose spec (all optional; missing channels fall back to the clip base, then to BASE):
  hips (dx, forward, dz) m     hips_rot / spine / chest / neck / head (pitch, yaw, roll) deg
      pitch + = lean forward, yaw + = turn to the character's left, roll + = lean right
  ear_L / ear_R / shoulder_L / shoulder_R (up, fwd) deg
  hand_L / hand_R (x, f, z) wrist target      hand_L_dir (fingers)   hand_L_up (thumb side)   elbow_L (pole dir)
  foot_L / foot_R (x, f, z) ankle target      foot_L_rot (toe-down pitch, yaw-left) deg       knee_L (pole dir)
  tail [(curl, sway)] * n deg
Clip-level: space_hand / space_foot = "arm" (armature space) or "hips" (carried by the posed hips).
"""
import math
import bpy
from mathutils import Vector, Matrix, Quaternion

FPS = 30
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))


def vf(t):
    """(x, forward, up) -> Blender vector"""
    return Vector((t[0], -t[1], t[2]))


def q_axial(pyr):
    """local rotation for bones whose local frame is (left, along, forward)"""
    p, y, r = (math.radians(a) for a in pyr)
    return Quaternion(Y, y) @ Quaternion(X, p) @ Quaternion(Z, r)


def swing(a, b):
    a, b = a.normalized(), b.normalized()
    return a.rotation_difference(b)


class Solver:
    def __init__(self, arm_ob, cfg):
        """cfg: dict(arms=[(side, shoulder, upper, fore, hand)], legs=[(side, thigh, shin, foot)], tail=[bones],
        axial=[bones], ears=[..], hips='hips', extra_axial=[...])"""
        self.ob, self.cfg = arm_ob, cfg
        arm = arm_ob.data
        self.rest = {b.name: b.matrix_local.copy() for b in arm.bones}
        self.parent = {b.name: (b.parent.name if b.parent else None) for b in arm.bones}
        self.order = [b.name for b in arm.bones]          # parents first
        self.rel = {n: (self.rest[self.parent[n]].inverted() @ self.rest[n]) if self.parent[n] else self.rest[n].copy() for n in self.order}
        self.len = {b.name: b.length for b in arm.bones}
        self.base = self._base()

    def _base(self):
        c, r = self.cfg, self.rest
        b = {"hips": (0, 0, 0), "hips_rot": (0, 0, 0), "tail": [(0, 0)] * len(c.get("tail", []))}
        for n in c["axial"]:
            b[n] = (0, 0, 0)
        for n in c.get("pairs", []):
            b[n + "_L"] = (0, 0)
            b[n + "_R"] = (0, 0)
        for s, _sh, up, fo, ha in c["arms"]:
            w = r[ha].translation
            d = (r[ha].to_3x3() @ Y)
            t = (r[ha].to_3x3() @ Z)
            sx = 1 if s == "L" else -1
            b["hand_" + s] = (w.x, -w.y, w.z)
            b["hand_%s_dir" % s] = (d.x, -d.y, d.z)
            b["hand_%s_up" % s] = (t.x, -t.y, t.z)
            b["elbow_" + s] = (0.5 * sx, -0.7, -0.3)
        for s, th, sh, fo in c["legs"]:
            a = r[fo].translation
            sx = 1 if s == "L" else -1
            b["foot_" + s] = (a.x, -a.y, a.z)
            b["foot_%s_rot" % s] = (0, 0)
            b["knee_" + s] = (0.12 * sx, 1, 0.1)
        return b

    # ---- solve one pose -> {bone: (loc or None, quat)}
    def solve(self, sp, space_hand="arm", space_foot="arm"):
        c, rest, rel = self.cfg, self.rest, self.rel
        L, W = {}, {}

        def fk(n):
            p = self.parent[n]
            loc, q = L.get(n, (None, Quaternion()))
            m = q.to_matrix().to_4x4()
            if loc is not None:
                m = Matrix.Translation(loc) @ m
            W[n] = (W[p] @ rel[n] if p else rel[n]) @ m
            return W[n]

        def unposed(n):
            p = self.parent[n]
            return (W[p] @ rel[n]) if p else rel[n].copy()

        hips = c["hips"]
        for n in self.order:
            if n == hips:
                break
            fk(n)
        h = sp["hips"]
        L[hips] = (Vector((h[0], h[2], h[1])), q_axial(sp["hips_rot"]))     # bone-local axes: left, up, forward
        fk(hips)
        carry = W[hips] @ rest[hips].inverted()          # rest-space -> posed-hips space
        for n in c["axial"]:
            L[n] = (None, q_axial(sp[n]))
            fk(n)
        for n in c.get("pairs", []):
            for s, sx in (("_L", 1), ("_R", -1)):
                bn = n + s
                if bn not in rest:
                    continue
                up, fw = (math.radians(a) for a in sp[bn])
                D = (Quaternion(Y, -sx * up) @ Quaternion(Z, -sx * fw)).to_matrix()
                B = unposed(bn).to_3x3()
                Br = rest[bn].to_3x3()
                # delta about armature axes, applied in the parent's posed frame
                q = (Br.inverted() @ D @ Br).to_quaternion()
                L[bn] = (None, q)
                fk(bn)

        def two_bone(b1, b2, target, pole):
            P1 = unposed(b1)
            S = P1.translation
            l1, l2 = self.len[b1], self.len[b2]
            v = target - S
            d = max(abs(l1 - l2) + 1e-3, min(l1 + l2 - 1e-3, v.length))
            n = v.normalized() if v.length > 1e-6 else Vector((0, 0, -1))
            a = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
            hh = math.sqrt(max(0.0, l1 * l1 - a * a))
            pp = pole - n * pole.dot(n)
            pp = pp.normalized() if pp.length > 1e-5 else n.orthogonal().normalized()
            E = S + n * a + pp * hh
            T = S + n * d
            R1 = P1.to_3x3()
            q1 = swing(R1 @ Y, E - S)
            L[b1] = (None, (R1.inverted() @ (q1.to_matrix() @ R1)).to_quaternion())
            fk(b1)
            P2 = unposed(b2)
            R2 = P2.to_3x3()
            q2 = swing(R2 @ Y, T - E)
            L[b2] = (None, (R2.inverted() @ (q2.to_matrix() @ R2)).to_quaternion())
            fk(b2)

        def to_world(v, space, point):
            v = vf(v)
            if space == "hips":
                return carry @ v if point else carry.to_3x3() @ v
            return v

        for s, sh, up, fo, ha in c["arms"]:
            two_bone(up, fo, to_world(sp["hand_" + s], space_hand, True), to_world(sp["elbow_" + s], space_hand, False))
            yv = to_world(sp["hand_%s_dir" % s], space_hand, False).normalized()
            zv = to_world(sp["hand_%s_up" % s], space_hand, False)
            zv = (zv - yv * zv.dot(yv))
            zv = zv.normalized() if zv.length > 1e-5 else yv.orthogonal().normalized()
            xv = yv.cross(zv)
            R = Matrix((xv, yv, zv)).transposed()
            P = unposed(ha).to_3x3()
            L[ha] = (None, (P.inverted() @ R).to_quaternion())
            fk(ha)
        for s, th, shn, fo in c["legs"]:
            two_bone(th, shn, to_world(sp["foot_" + s], space_foot, True), to_world(sp["knee_" + s], space_foot, False))
            pt, yw = (math.radians(a) for a in sp["foot_%s_rot" % s])
            R = Matrix.Rotation(yw, 3, "Z") @ Matrix.Rotation(pt, 3, "X") @ rest[fo].to_3x3()
            if space_foot == "hips":
                R = carry.to_3x3() @ R
            P = unposed(fo).to_3x3()
            L[fo] = (None, (P.inverted() @ R).to_quaternion())
            fk(fo)
        for i, bn in enumerate(c.get("tail", [])):
            cu, sw = (math.radians(a) for a in sp["tail"][i])
            L[bn] = (None, Quaternion(X, cu) @ Quaternion(Z, sw))
        for k, v in sp.items():                              # free local rotations: "rot:<bone>" = (x, y, z) deg local
            if k.startswith("rot:"):
                e = [math.radians(a) for a in v]
                L[k[4:]] = (None, Quaternion(Y, e[1]) @ Quaternion(X, e[0]) @ Quaternion(Z, e[2]))
        return L


# ---------------------------------------------------------------- interpolation
def _flat(v):
    if isinstance(v, (int, float)):
        return [float(v)]
    out = []
    for a in v:
        out += _flat(a)
    return out


def _shape(v, flat, i=0):
    if isinstance(v, (int, float)):
        return flat[i], i + 1
    out = []
    for a in v:
        r, i = _shape(a, flat, i)
        out.append(r)
    return tuple(out), i


def spline(keys, base, loop=False):
    """keys: [(t 0..1, overrides)] -> fn(t) -> full spec; Catmull-Rom through the keys per channel"""
    ks = sorted(keys, key=lambda k: k[0])
    full = []
    for t, ov in ks:
        sp = dict(base)
        sp.update(ov)
        full.append((t, sp))
    names = list(base.keys())
    flat = [(t, {n: _flat(sp[n]) for n in names}) for t, sp in full]
    n = len(flat)

    def fn(t):
        if loop:
            t = t % 1.0
        out = {}
        # segment
        i = 0
        while i < n - 1 and flat[i + 1][0] <= t:
            i += 1

        def key(j):
            if loop:
                jj = j % n
                wrap = (j - jj) // n
                return flat[jj][0] + wrap, flat[jj][1]
            jj = max(0, min(n - 1, j))
            return flat[jj][0], flat[jj][1]
        if not loop and (t <= flat[0][0] or n == 1):
            vals = flat[0][1]
            return {nm: _shape(base[nm], vals[nm])[0] for nm in names}
        if not loop and t >= flat[-1][0]:
            vals = flat[-1][1]
            return {nm: _shape(base[nm], vals[nm])[0] for nm in names}
        if loop and t < flat[0][0]:
            i = -1
        (t0, a0), (t1, a1), (t2, a2), (t3, a3) = key(i - 1), key(i), key(i + 1), key(i + 2)
        u = (t - t1) / (t2 - t1) if t2 > t1 else 0.0
        h00, h10 = 2 * u ** 3 - 3 * u ** 2 + 1, u ** 3 - 2 * u ** 2 + u
        h01, h11 = -2 * u ** 3 + 3 * u ** 2, u ** 3 - u ** 2
        for nm in names:
            res = []
            for c in range(len(a1[nm])):
                p1, p2 = a1[nm][c], a2[nm][c]
                m1 = (p2 - a0[nm][c]) / (t2 - t0) if t2 > t0 else 0.0
                m2 = (a3[nm][c] - p1) / (t3 - t1) if t3 > t1 else 0.0
                if not loop and i == 0:
                    m1 = 0.0
                if not loop and i == n - 2:
                    m2 = 0.0
                res.append(h00 * p1 + h10 * (t2 - t1) * m1 + h01 * p2 + h11 * (t2 - t1) * m2)
            out[nm] = _shape(base[nm], res)[0]
        return out
    return fn


def bake_clip(solver, name, frames, fn, space_hand="arm", space_foot="arm", loop=False):
    """fn(t 0..1) -> spec overrides merged over solver.base; keys every frame; returns the action"""
    ob = solver.ob
    ad = ob.animation_data or ob.animation_data_create()
    act = bpy.data.actions.new(name)
    ad.action = act
    prev = {}
    for pb in ob.pose.bones:
        pb.rotation_mode = "QUATERNION"
    last = frames if loop else frames
    for f in range(0, last + 1):
        t = f / frames
        sp = dict(solver.base)
        sp.update(fn(t))
        L = solver.solve(sp, space_hand, space_foot)
        for pb in ob.pose.bones:
            loc, q = L.get(pb.name, (None, Quaternion()))
            if pb.name in prev and prev[pb.name].dot(q) < 0:
                q = -q
            prev[pb.name] = q.copy()
            pb.rotation_quaternion = q
            pb.keyframe_insert("rotation_quaternion", frame=f)
            if loc is not None:
                pb.location = loc
                pb.keyframe_insert("location", frame=f)
    act.frame_range = (0, frames)
    act.use_frame_range = True
    return act


def stash(ob, actions):
    """one NLA track per action (the glTF exporter writes one animation per track)"""
    ad = ob.animation_data
    ad.action = None
    for pb in ob.pose.bones:
        pb.location = (0, 0, 0)
        pb.rotation_quaternion = (1, 0, 0, 0)
    for act in actions:
        tr = ad.nla_tracks.new()
        tr.name = act.name
        st = tr.strips.new(act.name, 0, act)
        st.name = act.name
        tr.mute = True


def solo(ob, name):
    """mute every NLA track except one (for review renders)"""
    for tr in ob.animation_data.nla_tracks:
        tr.mute = tr.name != name


def unmute(ob):
    for tr in ob.animation_data.nla_tracks:
        tr.mute = False
