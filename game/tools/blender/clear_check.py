"""Clearance gate for the boss gorilla's helmet: over every frame of every clip, no vertex on the sides of the helmet
(band, rims, horns) may sit inside an arm, a bracer or a pauldron. The windup rears up with both fists overhead right
beside the head, and the defeat flings the shoulders up against it.

  blender -b tools/blender/build/gorilla.blend --python-exit-code 1 --python tools/blender/clear_check.py [-- --min 0.0 --skip sleep]

Helmet sides = vertices of p_boss_helmet more than 0.3 m off the centre line at rest (band sides, rims, horns).
Obstacles = faces of p_body and p_boss_plates whose vertices are weighted to the clavicle, upper arm, forearm or hand.
Prints the smallest clearance per clip (m; negative = that deep inside) and exits 1 if any gated clip is below --min.
--skip lists clips that are printed but not gated. `sleep` is the Sleeper's clip: the head lies on the right forearm,
so a horned head touches that arm by design (about 5 cm).
"""
import sys

import bpy
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
LIMIT = float(argv[argv.index("--min") + 1]) if "--min" in argv else 0.0
SKIP = argv[argv.index("--skip") + 1].split(",") if "--skip" in argv else []
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
helm, obst = bpy.data.objects["p_boss_helmet"], [bpy.data.objects["p_body"], bpy.data.objects["p_boss_plates"]]
horn = [v.index for v in helm.data.vertices if abs(v.co.x) > 0.3]
ARMB = ("shoulder", "upperarm", "forearm", "hand")


def arm_faces(ob):
    names = {g.index: g.name for g in ob.vertex_groups}
    armv = set()
    for v in ob.data.vertices:
        w = sum(g.weight for g in v.groups if names[g.group].startswith(ARMB))
        if w > 0.5:
            armv.add(v.index)
    return [tuple(p.vertices) for p in ob.data.polygons if all(i in armv for i in p.vertices)]


FACES = {o.name: arm_faces(o) for o in obst}
sc, ad = bpy.context.scene, arm.animation_data
ad.action = None
fail = 0
for tr in ad.nla_tracks:
    for t2 in ad.nla_tracks:
        t2.mute = t2.name != tr.name          # (bpy wrappers are new objects each time: compare names, not identity)
    f0, f1 = (int(round(v)) for v in tr.strips[0].action.frame_range)
    worst, at = 1e9, None
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        dg = bpy.context.evaluated_depsgraph_get()
        V, F = [], []
        for o in obst:
            me = o.evaluated_get(dg).data
            b = len(V)
            V += [o.matrix_world @ v.co for v in me.vertices]
            F += [tuple(b + i for i in fc) for fc in FACES[o.name]]
        bvh = BVHTree.FromPolygons(V, F)
        hm = helm.evaluated_get(dg).data
        for i in horn:
            p = helm.matrix_world @ hm.vertices[i].co
            loc, nrm, _idx, dist = bvh.find_nearest(p)
            d = dist if (p - loc).dot(nrm) >= 0 else -dist
            if d < worst:
                worst, at = d, f
    bad = worst < LIMIT and tr.name not in SKIP
    fail += bad
    print(f"@@ {tr.name:8s} helmet clearance {worst:+.3f} m at frame {at}{'   FAIL' if bad else '   (not gated)' if tr.name in SKIP else ''}")
for t2 in ad.nla_tracks:
    t2.mute = False
print(f"@@ clearance gate: {'FAIL' if fail else 'ok'} ({len(horn)} helmet verts)")
sys.exit(1 if fail else 0)
