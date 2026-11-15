// Ground decals (G1 council fix round 1, F2 items 1 and 2): contact darkening under props and along wall bases,
// scorch, worn soil, stains and ruts. Every decal is a few flat triangles whose vertex colour says how much of each
// channel it takes from whatever is under it (0 = no change), blended after the opaque pass. All of them merge into
// one mesh per 48 u tile, so a whole place costs one or two draw calls however many props stand in it.
// Why this and not a dark transparent card: it keeps the hue of sand, dirt, grass and floorboards, each channel can
// drop by its own amount (a tint), and there is no alpha to sort.
import * as THREE from "three";

const TILE = 48, LIFT = 0.035;
type Acc = { pos: number[]; col: number[] };
const tiles = new Map<string, Acc>();
/** multiplier at full strength for plain contact shade (cool, like the sky-lit shadows) */
// Measured on the camp frame: a sun shadow multiplies lit dirt by about (0.13, 0.22, 0.21) in linear light. The red
// channel of sunlit ground sits above 1 before tone mapping, so a neutral multiplier only turns it orange; red has to
// drop furthest for a shade that reads as shade.
export const SHADE: RGB = [0.16, 0.25, 0.28];
export type RGB = [number, number, number];
let heightAt: (x: number, z: number) => number = () => 0;
/** the surface decals lie on: the terrain, or a building floor where one covers it */
export function setDecalSurface(h: (x: number, z: number) => number) { heightAt = h; }

const acc = (x: number, z: number) => { const k = `${Math.floor(x / TILE)},${Math.floor(z / TILE)}`; return tiles.get(k) ?? tiles.set(k, { pos: [], col: [] }).get(k)!; };
type V = { x: number; z: number; m: number };
function tri(a: Acc, p: V, q: V, r: V, t: RGB, y?: number) {
  for (const v of [p, q, r]) { a.pos.push(v.x, y ?? NaN, v.z); a.col.push((1 - t[0]) * v.m, (1 - t[1]) * v.m, (1 - t[2]) * v.m); }
}
const hash = (a: number, b: number) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

export type BlobOpts = {
  /** half extents; rz defaults to rx */ rx: number; rz?: number; yaw?: number;
  /** 0..1 strength at the core */ k?: number; tint?: RGB;
  /** 2 = ellipse, 4 = rounded box */ pow?: number;
  /** share of the radius that stays at full strength before it fades (0..0.9) */ core?: number;
  /** 0..1 ragged outline (stains, scorch) */ wob?: number; seed?: number;
  /** fixed height instead of the surface under each vertex (decks, roofs) */ y?: number;
};
/** a soft-edged patch: full strength in the core, fading to nothing at the rim */
export function blob(x: number, z: number, o: BlobOpts) {
  const rx = o.rx, rz = o.rz ?? rx, k = o.k ?? 0.6, t = o.tint ?? SHADE, pw = o.pow ?? 2, core = o.core ?? 0.45, wob = o.wob ?? 0, sd = o.seed ?? x * 3.1 + z * 7.7;
  const n = Math.max(10, Math.min(28, Math.round(Math.max(rx, rz) * 7))), c = Math.cos(o.yaw ?? 0), s = Math.sin(o.yaw ?? 0), a = acc(x, z);
  const rings = Math.max(2, Math.ceil(Math.max(rx, rz) * (1 - core) / 0.9));
  const at = (i: number, f: number, m: number): V => {
    const th = (i / n) * Math.PI * 2, ct = Math.cos(th), st = Math.sin(th);
    const r = Math.pow(Math.pow(Math.abs(ct), pw) + Math.pow(Math.abs(st), pw), -1 / pw) * (1 + wob * (hash(i % n + sd, 3.3) - 0.5) * 1.4 * f);
    const lx = ct * r * rx * f, lz = st * r * rz * f;
    return { x: x + lx * c + lz * s, z: z - lx * s + lz * c, m };
  };
  const mid: V = { x, z, m: k };
  for (let i = 0; i < n; i++) {
    tri(a, mid, at(i + 1, core, k), at(i, core, k), t, o.y);
    for (let q = 0; q < rings; q++) {
      const f0 = core + ((1 - core) * q) / rings, f1 = core + ((1 - core) * (q + 1)) / rings, m0 = k * fall(q / rings), m1 = k * fall((q + 1) / rings);
      const p0 = at(i, f0, m0), p1 = at(i + 1, f0, m0), p2 = at(i + 1, f1, m1), p3 = at(i, f1, m1);
      tri(a, p0, p1, p2, t, o.y); tri(a, p0, p2, p3, t, o.y);
    }
  }
}
/** rim falloff: quick at first, a long soft tail (reads as a shadow, not a disc) */
const fall = (u: number) => Math.pow(1 - u, 1.25);

export type StripOpts = { /** half width of the whole strip */ hw: number; /** half width that stays at full strength */ core?: number; k?: number; tint?: RGB; y?: number; /** 0..1: break the line up along its length (ruts, footpaths) */ gaps?: number; seed?: number; /** round the two ends off */ caps?: boolean };
/** a soft band along a polyline: full strength down the middle, fading out to both sides (wall bases, ruts, paths) */
export function strip(pts: readonly (readonly [number, number])[], o: StripOpts) {
  const hw = o.hw, core = Math.min(o.core ?? 0, hw * 0.9), k = o.k ?? 0.5, t = o.tint ?? SHADE, sd = o.seed ?? 1;
  // resample so no span is longer than 1 u: the strip then follows the ground and the gaps have somewhere to fall
  const P: [number, number][] = [];
  for (let i = 0; i < pts.length - 1; i++) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az))); for (let q = 0; q < n; q++) P.push([ax + ((bx - ax) * q) / n, az + ((bz - az) * q) / n]); }
  P.push([pts[pts.length - 1][0], pts[pts.length - 1][1]]);
  const rows: V[][] = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / l, nz = (b[0] - a[0]) / l;
    let m = k; if (o.gaps) m *= THREE.MathUtils.smoothstep(hash(Math.floor(i / 2) + sd, 1.7) + 0.35 * Math.sin(i * 0.9 + sd), o.gaps - 0.15, o.gaps + 0.25);
    if (o.caps !== false && !o.gaps) m *= i === 0 || i === P.length - 1 ? 0.55 : 1;
    const [x, z] = P[i], row: V[] = [{ x: x - nx * hw, z: z - nz * hw, m: 0 }];
    if (core > 0) row.push({ x: x - nx * core, z: z - nz * core, m }, { x: x + nx * core, z: z + nz * core, m }); else row.push({ x, z, m });
    row.push({ x: x + nx * hw, z: z + nz * hw, m: 0 }); rows.push(row);
  }
  for (let i = 0; i < rows.length - 1; i++) { const r0 = rows[i], r1 = rows[i + 1], a = acc(r0[1].x, r0[1].z); for (let q = 0; q < r0.length - 1; q++) { tri(a, r0[q], r0[q + 1], r1[q + 1], t, o.y); tri(a, r0[q], r1[q + 1], r1[q], t, o.y); } }
  if (o.caps !== false && !o.gaps) for (const e of [0, P.length - 1]) blob(P[e][0], P[e][1], { rx: hw, k: k * 0.55, tint: t, core: Math.min(0.8, core / hw), y: o.y });
}

let MAT: THREE.Material | null = null;
function material() {
  return (MAT ??= new THREE.MeshBasicMaterial({
    vertexColors: true, fog: false, toneMapped: false, transparent: true, depthWrite: false,
    // out = FLOOR * s + dst * (1 - s), s = the vertex colour (how much of each channel the decal takes away). Against
    // sunlit ground that is the tint as a plain multiplier; in shade and indoors, where the ground is already near FLOOR,
    // the same decal takes about half as much. A pure multiply went black under trees and inside the buildings.
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ConstantColorFactor, blendDst: THREE.OneMinusSrcColorFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor /* the frame keeps its alpha */, blendColor: new THREE.Color().setRGB(0.06, 0.05, 0.045, THREE.LinearSRGBColorSpace),
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide,
  }));
}
function mesh(a: Acc) {
  const g = new THREE.BufferGeometry(), pos = new Float32Array(a.pos);
  for (let i = 0; i < pos.length; i += 3) pos[i + 1] = (Number.isNaN(pos[i + 1]) ? heightAt(pos[i], pos[i + 2]) : pos[i + 1]) + LIFT; // heights resolve at flush: the surface (floors) is known by then
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const c8 = new Uint8Array(a.col.length); for (let i = 0; i < c8.length; i++) c8[i] = Math.round(Math.max(0, Math.min(1, a.col[i])) * 255);
  g.setAttribute("color", new THREE.BufferAttribute(c8, 3, true));
  g.computeBoundingSphere(); g.computeBoundingBox();
  const m = new THREE.Mesh(g, material()); m.name = "decals"; m.renderOrder = 1; m.matrixAutoUpdate = false; return m;
}
/** merge everything collected so far into one mesh per tile and add them to the scene */
export function flushDecals(scene: THREE.Scene) {
  let meshes = 0, tris = 0;
  for (const [, a] of tiles) { if (!a.pos.length) continue; scene.add(mesh(a)); meshes++; tris += a.pos.length / 9; }
  tiles.clear(); return { meshes, tris };
}
/** a small standalone decal mesh for things that change per raid (the loot crates): build() calls blob() / strip() */
export function dynamicDecals(build: () => void): THREE.Mesh | null {
  const keep = new Map(tiles); tiles.clear(); build();
  const all: Acc = { pos: [], col: [] }; for (const [, a] of tiles) { all.pos.push(...a.pos); all.col.push(...a.col); }
  tiles.clear(); for (const [k, v] of keep) tiles.set(k, v);
  return all.pos.length ? mesh(all) : null;
}
