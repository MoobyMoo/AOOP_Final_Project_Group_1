// The game's asset z-fight test without a browser: an exact port of coplanar() / assetFaces() in
// src/game/dev/glitch.ts (tools/glitchcheck.mjs, the G1.5 zero-glitch gate), run on a kit GLB's root assets.
//   node tools/blender/build/coplanar_glb.mjs public/models/build/house.glb [asset]      (with an asset: its 14 largest pairs)
// Positions are three.js axes, as glitchcheck prints them. Exit code 1 when an asset is "visible" (pairs over 0.02 m2).
// For positions in Blender axes and for authoring, use coplanar_check.py on the .blend; this one checks the shipped file.
import { readFileSync } from "node:fs";
const buf = readFileSync(process.argv[2]), jl = buf.readUInt32LE(12), json = JSON.parse(buf.subarray(20, 20 + jl).toString()), bin = buf.subarray(20 + jl + 8);
const acc = (i) => { const a = json.accessors[i], v = json.bufferViews[a.bufferView], off = (v.byteOffset ?? 0) + (a.byteOffset ?? 0), n = a.count * { SCALAR: 1, VEC3: 3 }[a.type];
  const T = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }[a.componentType]; return new T(bin.buffer.slice(bin.byteOffset + off, bin.byteOffset + off + n * T.BYTES_PER_ELEMENT)); };
const mul = (p, t) => [p[0] + t[0], p[1] + t[1], p[2] + t[2]];
function mkTri(p, i, o, foliage, name) { const a = [p[i], p[i + 1], p[i + 2]], b = [p[i + 3], p[i + 4], p[i + 5]], c = [p[i + 6], p[i + 7], p[i + 8]];
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz); if (l < 1e-6) return null; nx /= l; ny /= l; nz /= l;
  return { a, b, c, n: [nx, ny, nz], d: nx * a[0] + ny * a[1] + nz * a[2], area: l / 2, o, foliage, name, bb: [Math.min(a[0], b[0], c[0]), Math.min(a[1], b[1], c[1]), Math.min(a[2], b[2], c[2]), Math.max(a[0], b[0], c[0]), Math.max(a[1], b[1], c[1]), Math.max(a[2], b[2], c[2])] }; }
function overlapArea(t, u) { const ax = Math.abs(t.n[0]) > Math.abs(t.n[1]) ? (Math.abs(t.n[0]) > Math.abs(t.n[2]) ? 0 : 2) : Math.abs(t.n[1]) > Math.abs(t.n[2]) ? 1 : 2;
  const i0 = ax === 0 ? 1 : 0, i1 = ax === 2 ? 1 : 2, P = (v) => [v[i0], v[i1]]; let poly = [P(t.a), P(t.b), P(t.c)]; const clip = [P(u.a), P(u.b), P(u.c)];
  const sa = (q) => { let s = 0; for (let i = 0; i < q.length; i++) { const [x0, y0] = q[i], [x1, y1] = q[(i + 1) % q.length]; s += x0 * y1 - x1 * y0; } return s / 2; };
  if (sa(clip) < 0) clip.reverse();
  for (let e = 0; e < 3 && poly.length; e++) { const [ex0, ey0] = clip[e], [ex1, ey1] = clip[(e + 1) % 3], inside = (p) => (ex1 - ex0) * (p[1] - ey0) - (ey1 - ey0) * (p[0] - ex0) > 1e-7; const next = [];
    for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length], ip = inside(p), iq = inside(q); if (ip) next.push(p);
      if (ip !== iq) { const dx = q[0] - p[0], dy = q[1] - p[1], den = (ex1 - ex0) * dy - (ey1 - ey0) * dx; if (Math.abs(den) > 1e-12) { const tt = ((ex1 - ex0) * (ey0 - p[1]) - (ey1 - ey0) * (ex0 - p[0])) / den; next.push([p[0] + dx * tt, p[1] + dy * tt]); } } }
    poly = next; }
  return poly.length >= 3 ? Math.abs(sa(poly)) : 0; }
function coplanar(tris, dTol = 0.002, minA = 2e-4) { const groups = new Map();
  for (const t of tris) { const f = t.n[0] > 0.05 || (Math.abs(t.n[0]) <= 0.05 && (t.n[1] > 0.05 || (Math.abs(t.n[1]) <= 0.05 && t.n[2] > 0))) ? 1 : -1;
    const k = `${Math.round(t.n[0] * f * 25)},${Math.round(t.n[1] * f * 25)},${Math.round(t.n[2] * f * 25)}`; (groups.get(k) ?? groups.set(k, []).get(k)).push(t); }
  const hits = [];
  for (const [, g] of groups) { if (g.length < 2) continue; g.sort((p, q) => p.bb[0] - q.bb[0]);
    for (let i = 0; i < g.length; i++) { const t = g[i];
      for (let j = i + 1; j < g.length && g[j].bb[0] <= t.bb[3] + 1e-4; j++) { const u = g[j];
        if (u.bb[1] > t.bb[4] + dTol || t.bb[1] > u.bb[4] + dTol || u.bb[2] > t.bb[5] + 1e-4 || t.bb[2] > u.bb[5] + 1e-4) continue;
        const dot = t.n[0] * u.n[0] + t.n[1] * u.n[1] + t.n[2] * u.n[2];
        if (dot > 0.995) { if (Math.abs(t.d - u.d) > dTol) continue; } else if (dot < -0.995 && (t.foliage || u.foliage)) { if (Math.abs(t.d + u.d) > dTol) continue; } else continue;
        const area = overlapArea(t, u); if (area > minA && area > 0.02 * Math.min(t.area, u.area)) hits.push({ t, u, area }); } } }
  return hits; }
const roots = json.scenes[0].nodes.filter((i) => json.nodes[i].extras?.asset), want = process.argv[3];
let visible = 0;
for (const r of roots) { const name = json.nodes[r].name; if (want && name !== want) continue; const tris = [];
  const walk = (i, off) => { const n = json.nodes[i], t = mul(n.translation ?? [0, 0, 0], off); if (n.rotation && n.rotation.some((q, k) => Math.abs(q - [0, 0, 0, 1][k]) > 1e-6)) console.log("ROTATED node", n.name);
    if (n.mesh !== undefined) for (const pr of json.meshes[n.mesh].primitives) { const pos = acc(pr.attributes.POSITION), idx = pr.indices !== undefined ? acc(pr.indices) : null, cnt = idx ? idx.length : pos.length / 3, arr = [];
      for (let k = 0; k < cnt; k++) { const v = idx ? idx[k] : k; arr.push(pos[v * 3] + t[0], pos[v * 3 + 1] + t[1], pos[v * 3 + 2] + t[2]); }
      for (let k = 0; k + 8 < arr.length; k += 9) { const tr = mkTri(arr, k, 0, (n.extras?.mat ?? "matte") === "foliage", n.name); if (tr) tris.push(tr); } }
    for (const c of n.children ?? []) walk(c, t); };
  walk(r, [0, 0, 0]); const hits = coplanar(tris); if (!hits.length) continue;
  const area = hits.reduce((s, h) => s + h.area, 0); if (area > 0.02) visible++; console.log(`${area > 0.02 ? "VISIBLE" : "minor  "} ${name}: ${hits.length} pairs, ${area.toFixed(4)} m2`);
  if (want) for (const h of hits.sort((p, q) => q.area - p.area).slice(0, 14)) console.log(`   ${(h.area * 1e4).toFixed(1)} cm2 a(${h.t.a.map((x) => x.toFixed(3))}) [${(h.t.area*1e4).toFixed(0)}] u.a(${h.u.a.map((x) => x.toFixed(3))}) [${(h.u.area*1e4).toFixed(0)}] n ${h.t.n.map((x) => x.toFixed(2))} dot ${(h.t.n[0]*h.u.n[0]+h.t.n[1]*h.u.n[1]+h.t.n[2]*h.u.n[2]).toFixed(4)} gap ${(Math.abs(h.t.d - h.u.d) * 1000).toFixed(2)} ${h.t.name} / ${h.u.name}`); }
process.exit(visible ? 1 : 0);
