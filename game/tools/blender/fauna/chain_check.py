"""Fauna clip contracts the generic clip gate cannot see (run on tools/blender/build/fauna.blend):

- chains: a one-shot must start / end on the exact pose its neighbour starts on (takeoff -> fly, land -> perch_idle, ...)
- levels: where the mesh sits against the ground or the water line (y = 0 in the game) at the frames the game relies on
Exits 1 on any failure.
"""
import math
import sys

import bpy

sc = bpy.context.scene
fail = 0


def rig(ident):
    arm = bpy.data.objects["fauna_" + ident]
    ad = arm.animation_data
    for tr in ad.nla_tracks:
        tr.mute = True
    return arm, {tr.name: tr.strips[0].action for tr in ad.nla_tracks}


def at(arm, act, where):
    """set the armature to the first (0) or last (1) frame of a clip, or a 0..1 fraction of it"""
    ad = arm.animation_data
    ad.action = act
    if ad.action_slot is None:
        ad.action_slot = next(iter(ad.action_suitable_slots), None)
    f0, f1 = act.frame_range
    sc.frame_set(int(round(f0 + (f1 - f0) * where)))


def pose(arm):
    return {pb.name: pb.matrix.copy() for pb in arm.pose.bones}


def span(ident):
    """(lowest, highest) z of the deformed mesh at the current frame"""
    ob = bpy.data.objects[ident + "_mesh"]
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = ev.to_mesh()
    zs = [(ev.matrix_world @ v.co).z for v in me.vertices]
    ev.to_mesh_clear()
    return min(zs), max(zs)


def same(ident, a, wa, b, wb, tol_deg=0.5, tol_m=0.002):
    global fail
    arm, clips = rig(ident)
    at(arm, clips[f"{ident}_{a}"], wa)
    pa = pose(arm)
    at(arm, clips[f"{ident}_{b}"], wb)
    pb = pose(arm)
    worst_r = max(math.degrees(pa[k].to_quaternion().rotation_difference(pb[k].to_quaternion()).angle) for k in pa)
    worst_r = min(worst_r, 360 - worst_r)
    worst_t = max((pa[k].translation - pb[k].translation).length for k in pa)
    ok = worst_r <= tol_deg and worst_t <= tol_m
    fail += not ok
    print(f"@@ chain {ident}_{a}[{'end' if wa else 'start'}] = {ident}_{b}[{'end' if wb else 'start'}]   worst {worst_r:.2f} deg, {worst_t * 1000:.1f} mm   {'ok' if ok else 'FAIL'}")
    arm.animation_data.action = None


def level(ident, clip, where, what, test):
    global fail
    arm, clips = rig(ident)
    at(arm, clips[f"{ident}_{clip}"], where)
    lo, hi = span(ident)
    ok = test(lo, hi)
    fail += not ok
    print(f"@@ level {ident}_{clip} at {where:.2f}: mesh z {lo:+.3f} .. {hi:+.3f}   {what}   {'ok' if ok else 'FAIL'}")
    arm.animation_data.action = None


same("crab", "burrow", 0, "idle", 0)
same("parrot", "takeoff", 0, "perch_idle", 0)
same("parrot", "takeoff", 1, "fly", 0)
same("parrot", "land", 0, "fly", 0)
same("parrot", "land", 1, "perch_idle", 0)
same("frog", "hop", 0, "idle", 0)
same("frog", "hop", 1, "idle", 0)
same("boar", "hit", 0, "idle", 0)
same("boar", "hit", 1, "idle", 0)
same("boar", "death", 0, "idle", 0)
same("croc", "surface", 0, "lurk", 0)
same("croc", "surface", 1, "bite", 0)
same("croc", "bite", 1, "bite", 0)
same("croc", "retreat", 0, "bite", 0)
same("croc", "death", 0, "bite", 0)

level("crab", "idle", 0, "stands on the sand", lambda lo, hi: -0.012 <= lo <= 0.012)
level("crab", "burrow", 0.7, "only the eyes show", lambda lo, hi: 0.03 < hi < 0.2)
level("crab", "burrow", 1, "all under the sand", lambda lo, hi: hi < 0)
level("frog", "idle", 0, "sits on the ground", lambda lo, hi: -0.012 <= lo <= 0.02)
level("frog", "hop", 0.5, "airborne at the apex", lambda lo, hi: lo > 0.25)
level("parrot", "perch_idle", 0, "feet on the perch point", lambda lo, hi: -0.01 <= lo <= 0.02)
level("boar", "idle", 0, "hooves on the ground", lambda lo, hi: -0.03 <= lo <= 0.012)
level("boar", "death", 1, "lies on the ground", lambda lo, hi: -0.04 <= lo <= 0.06 and hi < 1.2)
level("croc", "lurk", 0, "eyes, nostrils and scutes above the water line, the rest under", lambda lo, hi: 0.06 < hi < 0.2)
level("croc", "bite", 0, "surfaced: back and head out", lambda lo, hi: 0.25 < hi < 0.4)
level("croc", "retreat", 1, "all under the water line", lambda lo, hi: hi < -0.05)
level("croc", "death", 1, "floats belly-up, legs in the air", lambda lo, hi: 0.2 < hi < 0.7 and lo > -0.6)
print(f"@@ fauna contracts: {'ok' if not fail else str(fail) + ' FAILED'}")
sys.exit(1 if fail else 0)
