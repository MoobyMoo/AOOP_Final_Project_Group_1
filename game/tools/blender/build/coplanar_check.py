"""The game's z-fight test, run on a built group before it ever reaches the browser.

  blender -b tools/blender/build/blend/<group>.blend --python-exit-code 1 --python tools/blender/build/coplanar_check.py [-- --list 8] [--only fac_press,fac_locker]
  blender -b tools/blender/build/blend/vault.blend --python-exit-code 1 --python tools/blender/build/coplanar_check.py -- --shell
  blender -b --factory-startup --python-exit-code 1 --python tools/blender/build/coplanar_check.py -- --glb public/models/build/house.glb

Default: every asset on its own. It is the same rule as src/game/dev/glitch.ts assetFaces() / coplanar()
(tools/glitchcheck.mjs, the G1.5 zero-glitch gate): inside one asset, two triangles that face the same way
(dot > 0.995), lie within 2 mm of the same plane and overlap by more than 2 cm2 (and more than 2 % of the smaller one)
are a z-fight, whether or not the camera can see them. An asset whose pairs add up to more than 0.02 m2 is "visible",
anything less is "minor". The blender-asset-qa gate uses 1 mm and skips some hidden pairs, so an asset can pass qa.py
and still fail here.

--shell (vault group only): the assembled room. Every shell piece, sconce, starter and a full set of facilities is
placed as the game places them (vault_layout.py), and faces of DIFFERENT pieces are tested against each other with the
game's cross-piece tolerance (4 mm). glitchcheck does not walk the base, so this is the only check of its seams.

--strict also counts wall-like faces up to 2 mm apart (the game's box pre-test lets those through; see SLACK).
Exit code 1 when any pair is found. --list N prints the N largest pairs of each failing asset (Blender coords).
"""
import os, sys, bpy, bmesh
from math import pi
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
LIST = int(argv[argv.index("--list") + 1]) if "--list" in argv else 6
ONLY = set(argv[argv.index("--only") + 1].split(",")) if "--only" in argv else None
SHELL = "--shell" in argv
MIN_A = 2e-4
# The game compares bounding boxes before planes, and only the vertical axis (three.js y, Blender z) gets the plane
# tolerance there. So it sees two floor-like faces 1.5 mm apart, but two wall-like faces must lie on one plane (or lean
# a little) to count. --strict gives every axis the tolerance: more than the gate asks, useful when authoring.
SLACK = (1, 1, 1) if "--strict" in argv else (0, 0, 1)


def tris_of(root, M=None, owner=0, label=None, into=None):
    """(a, b, c, normal, plane d, area, label, owner, bbox, foliage) for every triangle under root, in world space (or under M)"""
    out = [] if into is None else into
    for ob in root.children_recursive:
        if ob.type != "MESH":
            continue
        bm = bmesh.new(); bm.from_mesh(ob.data); bm.transform((M @ root.matrix_world.inverted() @ ob.matrix_world) if M is not None else ob.matrix_world)
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        for f in bm.faces:
            a, b, c = (v.co.copy() for v in f.verts)
            n = (b - a).cross(c - a)
            if n.length < 1e-6:
                continue
            area = n.length / 2; n.normalize()
            if M is not None and M.determinant() < 0:
                n = -n
            bb = (min(a.x, b.x, c.x), min(a.y, b.y, c.y), min(a.z, b.z, c.z), max(a.x, b.x, c.x), max(a.y, b.y, c.y), max(a.z, b.z, c.z))
            out.append((a, b, c, n, n.dot(a), area, label or ob.name, owner, bb, ob.get("mat") == "foliage"))
        bm.free()
    return out


def overlap(t, u):
    n = t[3]
    ax = max(range(3), key=lambda i: abs(n[i]))
    i0, i1 = [i for i in range(3) if i != ax]
    P = lambda v: (v[i0], v[i1])
    poly, clip = [P(t[0]), P(t[1]), P(t[2])], [P(u[0]), P(u[1]), P(u[2])]
    sa = lambda q: sum(q[i][0] * q[(i + 1) % len(q)][1] - q[(i + 1) % len(q)][0] * q[i][1] for i in range(len(q))) / 2
    if sa(clip) < 0:
        clip.reverse()
    for e in range(3):
        if not poly:
            break
        (x0, y0), (x1, y1) = clip[e], clip[(e + 1) % 3]
        inside = lambda p: (x1 - x0) * (p[1] - y0) - (y1 - y0) * (p[0] - x0) > 1e-7
        nxt = []
        for i in range(len(poly)):
            p, q = poly[i], poly[(i + 1) % len(poly)]
            ip, iq = inside(p), inside(q)
            if ip:
                nxt.append(p)
            if ip != iq:
                dx, dy = q[0] - p[0], q[1] - p[1]
                den = (x1 - x0) * dy - (y1 - y0) * dx
                if abs(den) > 1e-12:
                    tt = ((x1 - x0) * (y0 - p[1]) - (y1 - y0) * (x0 - p[0])) / den
                    nxt.append((p[0] + dx * tt, p[1] + dy * tt))
        poly = nxt
    return abs(sa(poly)) if len(poly) >= 3 else 0.0


def coplanar(tris, cross=False, d_tol=0.002):
    """pairs of same-facing triangles on one plane that overlap (and back-to-back ones when either is double-sided
    foliage, which the game draws from both sides). cross: only between different owners (else only within one)"""
    groups = {}
    for t in tris:                                   # a pair may straddle two normal buckets: file each triangle under its neighbours too
        n = t[3]
        if not (n.x > 0.05 or (abs(n.x) <= 0.05 and (n.y > 0.05 or (abs(n.y) <= 0.05 and n.z > 0)))):
            n = -n                                   # canonical facing, so back-to-back faces share a group
        k = (round(n.x * 12), round(n.y * 12), round(n.z * 12))
        for dk in ((0, 0, 0), (1, 0, 0), (0, 1, 0), (0, 0, 1)):
            f = (n.x * 12 - k[0], n.y * 12 - k[1], n.z * 12 - k[2])
            if dk == (0, 0, 0):
                groups.setdefault(k, []).append(t)
            else:
                i = dk.index(1)
                if abs(f[i]) > 0.3:
                    k2 = list(k); k2[i] += 1 if f[i] > 0 else -1
                    groups.setdefault(tuple(k2), []).append(t)
    hits, seen = [], set()
    for g in groups.values():
        if len(g) < 2:
            continue
        g.sort(key=lambda t: t[8][0])
        for i, t in enumerate(g):
            tb = t[8]
            for j in range(i + 1, len(g)):
                u = g[j]; ub = u[8]
                if ub[0] > tb[3] + SLACK[0] * d_tol + 1e-4:
                    break
                if (t[7] == u[7]) if cross else (t[7] != u[7]):
                    continue
                if ub[1] > tb[4] + SLACK[1] * d_tol + 1e-4 or tb[1] > ub[4] + SLACK[1] * d_tol + 1e-4 or ub[2] > tb[5] + SLACK[2] * d_tol + 1e-4 or tb[2] > ub[5] + SLACK[2] * d_tol + 1e-4:
                    continue
                dot = t[3].dot(u[3])
                if dot > 0.995:
                    if abs(t[4] - u[4]) > d_tol:
                        continue
                elif dot < -0.995 and (t[9] or u[9]):
                    if abs(t[4] + u[4]) > d_tol:
                        continue
                else:
                    continue
                key = (id(t), id(u)) if id(t) < id(u) else (id(u), id(t))
                if key in seen:
                    continue
                seen.add(key)
                a = overlap(t, u)
                if a > MIN_A and a > 0.02 * min(t[5], u[5]):
                    hits.append((a, t, u))
    return hits


def report(name, hits):
    area = sum(h[0] for h in hits)
    print(f"[coplanar] {'VISIBLE' if area > 0.02 else 'minor  '} {name}: {len(hits)} pairs, {area:.4f} m2")
    for a, t, u in sorted(hits, key=lambda h: -h[0])[:LIST]:
        c, c2 = (t[0] + t[1] + t[2]) / 3, (u[0] + u[1] + u[2]) / 3
        print(f"      {a * 1e4:7.1f} cm2  at ({c.x:.3f}, {c.y:.3f}, {c.z:.3f}) [{t[5] * 1e4:.0f} cm2] and ({c2.x:.3f}, {c2.y:.3f}, {c2.z:.3f}) [{u[5] * 1e4:.0f} cm2]  n ({t[3].x:.2f}, {t[3].y:.2f}, {t[3].z:.2f})  gap {min(abs(t[4] - u[4]), abs(t[4] + u[4])) * 1000:.2f} mm{"  back-to-back foliage" if t[3].dot(u[3]) < 0 else ""}  {t[6]} <-> {u[6]}")
    return area > 0.02


if "--glb" in argv:                                  # test the shipped file (float32, as the game loads it), not the .blend
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(argv[argv.index("--glb") + 1]))
bpy.context.view_layer.update()
ROOTS = {o.name: o for o in bpy.data.objects if o.type == "EMPTY" and "asset" in o}
bad = vis = 0
if SHELL:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import vault_layout as L
    placed = [(n, x, z, q, sx, 0.0) for (n, x, z, q, sx) in L.vault_layout()]
    placed += [("vault_sconce", x, L.Z0 - 0.012, 0, 1, 2.5) for x in L.SCONCES_N] + [("vault_sconce", L.X1 + 0.012, z, -1, 1, 2.5) for z in L.SCONCES_E]
    for (n, w, d, x, z, r) in L.STARTERS + L.BUILT:
        cx, cz = L.centre(w, d, x, z, r); placed.append((n, cx, cz, r, 1, 0.0))
    tris = []
    for i, (n, x, z, q, sx, y) in enumerate(placed):
        M = Matrix.Translation((x, -z, y)) @ Matrix.Rotation(q * pi / 2, 4, "Z") @ Matrix.Diagonal((sx, 1, 1, 1))
        tris_of(ROOTS[n], M, i, f"{n}@{x:g},{z:g}", tris)
    hits = coplanar(tris, cross=True, d_tol=0.004)
    if hits:
        bad = 1; vis = report(f"assembled vault ({len(placed)} pieces, {len(tris)} tris)", hits)
        kinds = {}
        for h in hits:
            k = " <-> ".join(sorted((h[1][6].split("@")[0], h[2][6].split("@")[0])))
            kinds[k] = (kinds.get(k, (0, 0))[0] + 1, kinds.get(k, (0, 0))[1] + h[0])
        for k, (n, ar) in sorted(kinds.items(), key=lambda kv: -kv[1][1]):
            print(f"      {n:4d} pairs  {ar:.4f} m2  {k}")
    print(f"[coplanar] assembled vault: {len(placed)} pieces, {len(tris)} tris, {len(hits)} cross-piece pairs")
else:
    for name in sorted(ROOTS):
        if ONLY and name not in ONLY:
            continue
        hits = coplanar(tris_of(ROOTS[name]))
        if hits:
            bad += 1; vis += report(name, hits)
    print(f"[coplanar] {len(ROOTS) - bad}/{len(ROOTS)} assets clean, {vis} visible")
sys.exit(1 if bad else 0)
