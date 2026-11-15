// Glitch hunt (G1.5-12; Moo: "no glitching for assets and stuff"). Loaded only with ?glitch=1 (main.ts), after the
// raid world is built with dress.ts's piece recorder on. run() tests the built world in code and returns findings:
//   ground   props whose bottom floats (> 0.06 u) or is buried (> 0.25 u) against the rendered ground or a floor
//   overlap  static meshes inside each other's solid volume, scatter inside buildings, on roads, in doorways
//   zfight   coplanar overlapping faces: inside each GLB, between placed pieces, floors and decals vs the terrain mesh
//   collider invisible walls (collider perimeter with no mesh near it) and walk-into meshes (mesh far outside colliders)
//   door     open leaves through walls or props, gaps round closed leaves
//   socket   crates, spawns and marks inside colliders or out of reach; enemy patrol rings in walls; stranded nav pockets
// tools/glitchcheck.mjs drives it in the built preview and writes the report. Everything here is read-only.
import * as THREE from "three";
import { pieceRec, type PieceOwner } from "../world/dress";
import { groundHeight, meshHeight, meshHeightMax } from "../world/terrain";
import { houses } from "../world/buildings";
import { debugGrid, walkable, path, gates, edgeDist, roadDist, flood } from "../world/grid";
import { PLACED, CRATES, SPAWNS, START, POI, PORTALS, ZIPLINES, SUPPLY_DROPS, UNDER_X, PIERS, PIER_Y } from "../world/map/grove";
import { collidersFor, NATURE_VARIANTS } from "../world/map/colliders";
import { toWorld } from "../world/map/types";
import * as K from "../world/kit_build";
import { natureTypes, naturePiece } from "../world/kit_nature";
import { houseAssetNames, building, houseModule, HOUSE_IDS } from "../world/kit_house";
import { G } from "../core/state";
import type { Collider } from "../contracts";
import { CUT } from "../render/cutout";

export type Sev = "bug" | "visible" | "minor";
export type Finding = { cat: string; sev: Sev; x: number; y: number; z: number; k: string; what: string; v: number; src?: string; id?: string };
const out: Finding[] = [];
const r2 = (v: number) => Math.round(v * 100) / 100;
function add(cat: string, sev: Sev, x: number, z: number, k: string, what: string, v: number, extra: Partial<Finding> = {}) {
  out.push({ cat, sev, x: r2(x), y: r2(extra.y ?? groundHeight(x, z)), z: r2(z), k, what, v: Math.round(v * 1000) / 1000, ...extra });
}

// ---------------------------------------------------------------- surfaces
/** the rendered terrain (terrain.ts meshHeight: the 0.8 u tile triangles, not the 1 u field) */
export const meshH = meshHeight;
const FLOOR_TOP = 0.08;
/** the house whose footprint covers a point (pad u), or null */
function houseAt(x: number, z: number, pad = 0) {
  for (const h of houses) { const dx = x - h.p.x, dz = z - h.p.z; if (Math.abs(dx) > 16 || Math.abs(dz) > 16) continue; const c = Math.cos(h.p.yaw ?? 0), s = Math.sin(h.p.yaw ?? 0), lx = dx * c - dz * s - h.cx, lz = dx * s + dz * c - h.cz; if (Math.abs(lx) <= h.hx + pad && Math.abs(lz) <= h.hz + pad) return h; }
  return null;
}
const onDeck = (x: number, z: number) => PIERS.some((p) => x > p.x0 - 0.45 && x < p.x1 + 0.45 && z > p.z0 - 0.3 && z < p.z1 + (p.id === "dock" ? 2.5 : 0));
/** what a thing standing at (x, z) stands on, as rendered: a floor, a pier deck or the terrain mesh */
export function surf(x: number, z: number) {
  const h = houseAt(x, z); if (h) return h.y + FLOOR_TOP;
  if (onDeck(x, z)) return groundHeight(x, z);
  return meshH(x, z);
}

// ---------------------------------------------------------------- colliders in world space (same maths as grid.ts)
type W = { circle: boolean; x: number; z: number; r: number; hx: number; hz: number; c: number; s: number; flags?: number; gate?: number; whenOpen?: boolean; tag?: string };
function wcol(c: Collider, tf: { x: number; z: number; yaw?: number; s?: number }, tag?: string): W {
  const k = tf.s ?? 1;
  if (c.t === "circle") { const [x, z] = toWorld(tf, c.x, c.z); return { circle: true, x, z, r: c.r * k, hx: 0, hz: 0, c: 1, s: 0, tag }; }
  let lx: number, lz: number, hx: number, hz: number, yaw: number;
  if (c.t === "box") { lx = c.x; lz = c.z; hx = c.w / 2; hz = c.d / 2; yaw = c.yaw ?? 0; }
  else { lx = (c.ax + c.bx) / 2; lz = (c.az + c.bz) / 2; hx = c.thick / 2; hz = Math.hypot(c.bx - c.ax, c.bz - c.az) / 2; yaw = Math.atan2(c.bx - c.ax, c.bz - c.az); }
  const [x, z] = toWorld(tf, lx, lz), wy = (tf.yaw ?? 0) + yaw;
  return { circle: false, x, z, r: Math.hypot(hx, hz) * k, hx: hx * k, hz: hz * k, c: Math.cos(wy), s: Math.sin(wy), tag };
}
function colDist(q: W, x: number, z: number) {
  const dx = x - q.x, dz = z - q.z;
  if (q.circle) return Math.hypot(dx, dz) - q.r;
  const lx = Math.abs(dx * q.c - dz * q.s) - q.hx, lz = Math.abs(dx * q.s + dz * q.c) - q.hz;
  return lx <= 0 && lz <= 0 ? Math.max(lx, lz) : Math.hypot(Math.max(lx, 0), Math.max(lz, 0));
}
/** points round a collider's outline every `step` u, pushed `off` u outward */
function perimeter(q: W, step: number, off: number): [number, number][] {
  const pts: [number, number][] = [];
  if (q.circle) { const n = Math.max(8, Math.ceil((2 * Math.PI * q.r) / step)); for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push([q.x + Math.cos(a) * (q.r + off), q.z + Math.sin(a) * (q.r + off)]); } return pts; }
  const hx = q.hx + off, hz = q.hz + off, corners: [number, number][] = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]];
  for (let e = 0; e < 4; e++) {
    const [ax, az] = corners[e], [bx, bz] = corners[(e + 1) % 4], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    for (let i = 0; i < n; i++) { const lx = ax + ((bx - ax) * i) / n, lz = az + ((bz - az) * i) / n; pts.push([q.x + lx * q.c + lz * q.s, q.z - lx * q.s + lz * q.c]); }
  }
  return pts;
}
/** a bucket index of colliders (2 u cells) */
function colIndex(list: W[]) {
  const m = new Map<number, W[]>(), key = (c: number, r: number) => (c + 2000) * 4000 + (r + 2000);
  // registered 1.2 u past each collider's reach, so a lookup finds everything within 1.2 u of the point
  for (const q of list) for (let r = Math.floor((q.z - q.r - 1.2) / 2); r <= Math.floor((q.z + q.r + 1.2) / 2); r++) for (let c = Math.floor((q.x - q.r - 1.2) / 2); c <= Math.floor((q.x + q.r + 1.2) / 2); c++) { const k = key(c, r); (m.get(k) ?? m.set(k, []).get(k)!).push(q); }
  return { near: (x: number, z: number) => m.get(key(Math.floor(x / 2), Math.floor(z / 2))) ?? [], dist(x: number, z: number, skip?: (q: W) => boolean) { let d = 9; for (const q of this.near(x, z)) { if (skip?.(q)) continue; d = Math.min(d, colDist(q, x, z)); } return d; } };
}

// ---------------------------------------------------------------- owners: every placed thing with its world triangles
type Own = { o: PieceOwner; hard: Float32Array; leaf: Float32Array; bb: number[]; base: number; cols: W[]; i: number };
const NO_GROUND = /^(lily|raft|boardwalk|bridge|dock|waterfall|pool|falls|audit)/; // (the audit notice is nailed to the giant tree)
function owners(): Own[] {
  const by = new Map<PieceOwner, { hard: number[]; leaf: number[] }>(), v = new THREE.Vector3();
  for (const r of pieceRec.list) {
    const acc = by.get(r.o) ?? by.set(r.o, { hard: [], leaf: [] }).get(r.o)!, dst = r.mat === "foliage" ? acc.leaf : acc.hard;
    const pos = r.geo.attributes.position, idx = r.geo.index, n = idx ? idx.count : pos.count;
    for (let i = 0; i < n; i++) { v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(r.m); dst.push(v.x, v.y, v.z); }
  }
  const list: Own[] = [];
  for (const [o, a] of by) {
    const bb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
    for (const arr of [a.hard, a.leaf]) for (let i = 0; i < arr.length; i += 3) for (let k = 0; k < 3; k++) { bb[k] = Math.min(bb[k], arr[i + k]); bb[k + 3] = Math.max(bb[k + 3], arr[i + k]); }
    const cols = o.src === "house" ? houses.find((h) => h.id === o.id)!.def.colliders.map((c) => wcol(c, o.p!, c.id)) : o.p ? (collidersFor(o.k, o.p.o) ?? []).map((c) => wcol(c, o.p!)) : [];
    const base = o.src === "house" ? houses.find((h) => h.id === o.id)!.y + FLOOR_TOP : surf(o.x, o.z);
    list.push({ o, hard: new Float32Array(a.hard), leaf: new Float32Array(a.leaf), bb, base, cols, i: list.length });
  }
  return list;
}
const label = (w: Own) => `${w.o.src}:${w.o.k}${w.o.id ? "#" + w.o.id : ""}@${r2(w.o.x)},${r2(w.o.z)}`;

// ---------------------------------------------------------------- 1. ground contact
/** nature kit kinds (planted below their origin on purpose: never "buried"; understory is walk-through by design) */
let NAT: Set<string> | null = null;
const isNature = (k: string) => (NAT ??= new Set(natureTypes().map((t) => t.type))).has(k);
const BURY_OK = { test: (k: string) => isNature(k) || /:edge$|^edge$/.test(k) };
function grounding(list: Own[]) {
  for (const w of list) {
    if (w.o.src === "house" || NO_GROUND.test(w.o.k) || (w.o.p?.o && ("y" in w.o.p.o || "deck" in w.o.p.o || "water" in w.o.p.o))) continue;
    const all = [w.hard, w.leaf]; let minY = 1e9;
    for (const a of all) for (let i = 1; i < a.length; i += 3) minY = Math.min(minY, a[i]);
    let lo = 1e9, hi = -1e9, n = 0, lx = 0, lz = 0, hxp = 0, hzp = 0;
    for (const a of all) for (let i = 0; i < a.length; i += 3) {
      if (a[i + 1] > minY + 0.05) continue;
      const g = a[i + 1] - surf(a[i], a[i + 2]); n++;
      if (g < lo) { lo = g; lx = a[i]; lz = a[i + 2]; }
      if (g > hi) { hi = g; hxp = a[i]; hzp = a[i + 2]; }
    }
    if (!n) continue;
    const edge = w.o.src === "edge", hard = w.hard.length > 0 && !edge, foot = Math.max(w.bb[3] - w.bb[0], w.bb[5] - w.bb[2]);
    // a thing on a slope rests on its lowest corner: floating = even the lowest foot is above the ground
    if (lo > 0.06) add("ground", edge ? "minor" : lo > 0.15 ? "visible" : "minor", w.o.x, w.o.z, w.o.k, `floats ${r2(lo)} u above the ${houseAt(w.o.x, w.o.z) ? "floor" : "ground"} (${label(w)})`, lo, { src: w.o.src, id: w.o.id });
    else if (hard && !isNature(w.o.k) && hi > 0.12 && foot > 0.5) add("ground", hi > 0.25 ? "visible" : "minor", hxp, hzp, w.o.k, `one side lifts ${r2(hi)} u off the slope (${label(w)})`, hi, { src: w.o.src, id: w.o.id });
    if (!BURY_OK.test(w.o.k) && !edge && !isNature(w.o.k)) {
      if (hi < -0.25) add("ground", "visible", w.o.x, w.o.z, w.o.k, `whole base buried ${r2(-hi)} u (${label(w)})`, -hi, { src: w.o.src, id: w.o.id });
      else if (hard && lo < -0.25) add("ground", lo < -0.4 ? "visible" : "minor", lx, lz, w.o.k, `uphill side buried ${r2(-lo)} u (${label(w)})`, -lo, { src: w.o.src, id: w.o.id });
    }
  }
  // building floors against the terrain mesh: the ground must stay under the floor everywhere in the footprint
  for (const h of houses) {
    const top = h.y + FLOOR_TOP, c = Math.cos(h.p.yaw ?? 0), s = Math.sin(h.p.yaw ?? 0); let worst = -1, wx = 0, wz = 0, gapMax = 0, gx = 0, gz = 0;
    for (let lz = -h.hz; lz <= h.hz; lz += 0.25) for (let lx = -h.hx; lx <= h.hx; lx += 0.25) {
      const ax = lx + h.cx, az = lz + h.cz, x = h.p.x + ax * c + az * s, z = h.p.z - ax * s + az * c, d = meshH(x, z) - top;
      if (d > worst) { worst = d; wx = x; wz = z; }
      if ((Math.abs(lx) > h.hx - 0.3 || Math.abs(lz) > h.hz - 0.3) && -d > gapMax) { gapMax = -d; gx = x; gz = z; }
    }
    if (worst > -0.01) add("zfight", worst > 0.01 ? "bug" : "visible", wx, wz, h.p.k, `terrain reaches the floor top of ${h.id} (${r2(worst)} u over)`, worst, { src: "house", id: h.id });
    if (gapMax > 0.2) add("ground", gapMax > 0.35 ? "visible" : "minor", gx, gz, h.p.k, `floor edge of ${h.id} stands ${r2(gapMax)} u above the terrain`, gapMax, { src: "house", id: h.id });
  }
}

// ---------------------------------------------------------------- 2. overlaps between static things
/** owner's solid volume: its colliders (any flag), else its hard mesh box shrunk to 80 % */
function solidOf(w: Own): W[] {
  if (w.cols.length) return w.cols;
  if (!w.hard.length) return [];
  const c = Math.cos(w.o.yaw), s = Math.sin(w.o.yaw); let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (let i = 0; i < w.hard.length; i += 3) { const dx = w.hard[i] - w.o.x, dz = w.hard[i + 2] - w.o.z, lx = dx * c - dz * s, lz = dx * s + dz * c; x0 = Math.min(x0, lx); x1 = Math.max(x1, lx); z0 = Math.min(z0, lz); z1 = Math.max(z1, lz); }
  return [wcol({ t: "box", x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: (x1 - x0) * 0.8, d: (z1 - z0) * 0.8, move: false, shot: false }, { x: w.o.x, z: w.o.z, yaw: w.o.yaw })];
}
const JOINT = /^(wall:|breakwall:|gate$|pillar_|ruin_wall|ruin_arch|wall_palisade_post|watchtower)/;
const FLAT = /^(litter|pebbles|shells|flowers|ruin_floor|ruin_steps|bedroll|lily|boardwalk|dock|bridge|raft|audit|beachgrass|reeds)/;
function overlaps(list: Own[]) {
  const play = list.filter((w) => w.o.src !== "edge");
  const grid = new Map<number, Own[]>(), key = (c: number, r: number) => (c + 2000) * 4000 + (r + 2000);
  for (const w of play) for (let r = Math.floor(w.bb[2] / 4); r <= Math.floor(w.bb[5] / 4); r++) for (let c = Math.floor(w.bb[0] / 4); c <= Math.floor(w.bb[3] / 4); c++) { const k = key(c, r); (grid.get(k) ?? grid.set(k, []).get(k)!).push(w); }
  const seen = new Set<number>();
  const pen = (a: Own, b: Own, vol: W[], tris: Float32Array) => {
    let depth = 0, n = 0, px = 0, pz = 0, py = 0; const yl = b.bb[1] + 0.03, yh = b.bb[4] - 0.03;
    for (let i = 0; i < tris.length; i += 3) {
      const y = tris[i + 1]; if (y < yl || y > yh || y < a.base + 0.03) continue;
      for (const q of vol) { const d = -colDist(q, tris[i], tris[i + 2]); if (d > 0.08) { n++; if (d > depth) { depth = d; px = tris[i]; pz = tris[i + 2]; py = y; } } }
    }
    return { depth, n, px, pz, py };
  };
  for (const a of play) for (let r = Math.floor(a.bb[2] / 4); r <= Math.floor(a.bb[5] / 4); r++) for (let c = Math.floor(a.bb[0] / 4); c <= Math.floor(a.bb[3] / 4); c++) for (const b of grid.get(key(c, r)) ?? []) {
    if (a === b) continue; const pk = a.i * 100000 + b.i; if (seen.has(pk)) continue; seen.add(pk);
    if (a.bb[3] < b.bb[0] || b.bb[3] < a.bb[0] || a.bb[5] < b.bb[2] || b.bb[5] < a.bb[2] || a.bb[4] < b.bb[1] || b.bb[4] < a.bb[1]) continue;
    if (FLAT.test(a.o.k) || FLAT.test(b.o.k)) continue;
    if (b.o.src === "house") continue; // houses are tested below with their walls only
    if (isNature(a.o.k) && isNature(b.o.k)) continue; // rock piles, roots in rocks, ferns at a boulder: how nature grows
    if (JOINT.test(a.o.k) && JOINT.test(b.o.k)) continue; // wall runs meeting gates, pillars and each other are joints
    const vol = solidOf(b); if (!vol.length) continue;
    if (a.hard.length && !(isNature(a.o.k) && !(collidersFor(a.o.k, a.o.p?.o) ?? []).length)) {
      const p = pen(a, b, vol, a.hard);
      if (p.n >= 2) add("overlap", p.depth > 0.2 && b.hard.length ? "visible" : "minor", p.px, p.pz, `${a.o.k}|${b.o.k}`, `${label(a)} pokes ${r2(p.depth)} u into ${label(b)}`, p.depth, { src: a.o.src, y: p.py });
    } else if (b.hard.length && !isNature(b.o.k)) { // a plant growing out of a solid thing
      if (vol.some((q) => colDist(q, a.o.x, a.o.z) < -0.1)) add("overlap", "minor", a.o.x, a.o.z, `${a.o.k}|${b.o.k}`, `${label(a)} grows out of ${label(b)}`, 0, { src: a.o.src });
    }
  }
  // things inside building walls, scatter inside buildings, solid scatter on roads, anything in a doorway
  const wallsOf = houses.map((h) => ({ h, walls: h.def.colliders.filter((c) => c.t === "seg" || (c.t === "box" && !c.low)).map((c) => wcol(c, h.p, c.id)) }));
  for (const w of play) {
    if (w.o.src === "house") continue;
    const h = houseAt(w.o.x, w.o.z, 0.2);
    if (h && w.o.src === "scatter") add("overlap", "bug", w.o.x, w.o.z, w.o.k, `scatter ${label(w)} stands inside ${h.id}`, 0, { src: w.o.src });
    for (const { h: hh, walls } of wallsOf) {
      if (Math.abs(w.o.x - hh.p.x) > 20 || Math.abs(w.o.z - hh.p.z) > 20) continue;
      let depth = 0, px = 0, pz = 0, py = 0;
      for (const tris of [w.hard, w.leaf]) for (let i = 0; i < tris.length; i += 3) { const y = tris[i + 1]; if (y < hh.y + 0.15 || y > hh.y + 2.6) continue; for (const q of walls) { const d = -colDist(q, tris[i], tris[i + 2]); if (d > depth) { depth = d; px = tris[i]; pz = tris[i + 2]; py = y; } } }
      if (depth > 0.1) add("overlap", depth > 0.25 && w.hard.length ? "visible" : "minor", px, pz, `${w.o.k}|${hh.id}`, `${label(w)} pokes ${r2(depth)} u through a wall of ${hh.id}`, depth, { src: w.o.src, y: py });
    }
    if (w.o.src === "scatter" && w.cols.some((q) => q.circle || q.hx)) { const rd = roadDist(w.o.x, w.o.z), rr = Math.max(...w.cols.map((q) => q.r)); if (rd < rr) add("overlap", "minor", w.o.x, w.o.z, w.o.k, `solid scatter ${label(w)} reaches ${r2(rr - rd)} u onto a road`, rr - rd, { src: w.o.src }); }
  }
  for (const g of gates) {
    if (g.kind !== "door") continue;
    const tx = -g.nz, tz = g.nx; // along the doorway
    for (const w of play) {
      if (w.o.src === "house" || w.o.id === g.id || Math.abs(w.o.x - g.x) > 8 || Math.abs(w.o.z - g.z) > 8 || FLAT.test(w.o.k)) continue;
      let hit = 0;
      for (const tris of [w.hard, w.leaf]) for (let i = 0; i < tris.length; i += 3) { const dx = tris[i] - g.x, dz = tris[i + 2] - g.z, along = Math.abs(dx * tx + dz * tz), across = Math.abs(dx * g.nx + dz * g.nz); if (along < g.w / 2 - 0.05 && across < 1.3 && tris[i + 1] > groundHeight(tris[i], tris[i + 2]) + 0.15 && tris[i + 1] < groundHeight(tris[i], tris[i + 2]) + 2) hit++; }
      if (hit >= 3) add("overlap", w.cols.some((q) => q.flags !== 0) && w.hard.length ? "visible" : "minor", w.o.x, w.o.z, w.o.k, `${label(w)} stands in the doorway ${g.id}`, hit, { src: w.o.src });
    }
  }
}

// ---------------------------------------------------------------- 3. coplanar faces (z-fighting)
type Tri = { a: number[]; b: number[]; c: number[]; n: number[]; d: number; area: number; bb: number[]; o: number; foliage: boolean };
function mkTri(p: Float32Array | number[], i: number, o: number, foliage: boolean): Tri | null {
  const a = [p[i], p[i + 1], p[i + 2]], b = [p[i + 3], p[i + 4], p[i + 5]], c = [p[i + 6], p[i + 7], p[i + 8]];
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz); if (l < 1e-6) return null;
  nx /= l; ny /= l; nz /= l;
  return { a, b, c, n: [nx, ny, nz], d: nx * a[0] + ny * a[1] + nz * a[2], area: l / 2, o, foliage, bb: [Math.min(a[0], b[0], c[0]), Math.min(a[1], b[1], c[1]), Math.min(a[2], b[2], c[2]), Math.max(a[0], b[0], c[0]), Math.max(a[1], b[1], c[1]), Math.max(a[2], b[2], c[2])] };
}
/** area of the overlap of two coplanar triangles (projected on the plane's dominant axis) */
function overlapArea(t: Tri, u: Tri) {
  const ax = Math.abs(t.n[0]) > Math.abs(t.n[1]) ? (Math.abs(t.n[0]) > Math.abs(t.n[2]) ? 0 : 2) : Math.abs(t.n[1]) > Math.abs(t.n[2]) ? 1 : 2;
  const i0 = ax === 0 ? 1 : 0, i1 = ax === 2 ? 1 : 2, P = (v: number[]): [number, number] => [v[i0], v[i1]];
  let poly = [P(t.a), P(t.b), P(t.c)]; const clip = [P(u.a), P(u.b), P(u.c)];
  const sa = (q: [number, number][]) => { let s = 0; for (let i = 0; i < q.length; i++) { const [x0, y0] = q[i], [x1, y1] = q[(i + 1) % q.length]; s += x0 * y1 - x1 * y0; } return s / 2; };
  if (sa(clip) < 0) clip.reverse();
  for (let e = 0; e < 3 && poly.length; e++) {
    const [ex0, ey0] = clip[e], [ex1, ey1] = clip[(e + 1) % 3], inside = (p: [number, number]) => (ex1 - ex0) * (p[1] - ey0) - (ey1 - ey0) * (p[0] - ex0) > 1e-7;
    const next: [number, number][] = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length], ip = inside(p), iq = inside(q);
      if (ip) next.push(p);
      if (ip !== iq) { const dx = q[0] - p[0], dy = q[1] - p[1], den = (ex1 - ex0) * dy - (ey1 - ey0) * dx; if (Math.abs(den) > 1e-12) { const tt = ((ex1 - ex0) * (ey0 - p[1]) - (ey1 - ey0) * (ex0 - p[0])) / den; next.push([p[0] + dx * tt, p[1] + dy * tt]); } }
    }
    poly = next;
  }
  return poly.length >= 3 ? Math.abs(sa(poly)) : 0;
}
/** coplanar overlapping pairs: same facing within dTol (or back to back when either is double-sided foliage) */
function coplanar(tris: Tri[], o: { cross: boolean; dTol?: number; minArea?: number }) {
  const dTol = o.dTol ?? 0.004, minA = o.minArea ?? 2e-4, groups = new Map<string, Tri[]>();
  for (const t of tris) {
    // canonical facing so back-to-back faces share a group: flip so the first non-zero component is positive
    const f = t.n[0] > 0.05 || (Math.abs(t.n[0]) <= 0.05 && (t.n[1] > 0.05 || (Math.abs(t.n[1]) <= 0.05 && t.n[2] > 0))) ? 1 : -1;
    const k = `${Math.round(t.n[0] * f * 25)},${Math.round(t.n[1] * f * 25)},${Math.round(t.n[2] * f * 25)}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(t);
  }
  const hits: { t: Tri; u: Tri; area: number }[] = [];
  for (const [, g] of groups) {
    if (g.length < 2) continue;
    g.sort((p, q) => p.bb[0] - q.bb[0]);
    for (let i = 0; i < g.length; i++) {
      const t = g[i];
      for (let j = i + 1; j < g.length && g[j].bb[0] <= t.bb[3] + 1e-4; j++) {
        const u = g[j]; if (o.cross ? t.o === u.o : t.o !== u.o) continue;
        if (u.bb[1] > t.bb[4] + dTol || t.bb[1] > u.bb[4] + dTol || u.bb[2] > t.bb[5] + 1e-4 || t.bb[2] > u.bb[5] + 1e-4) continue;
        const dot = t.n[0] * u.n[0] + t.n[1] * u.n[1] + t.n[2] * u.n[2];
        if (dot > 0.995) { if (Math.abs(t.d - u.d) > dTol) continue; }
        else if (dot < -0.995 && (t.foliage || u.foliage)) { if (Math.abs(t.d + u.d) > dTol) continue; }
        else continue;
        const area = overlapArea(t, u); if (area > minA && area > 0.02 * Math.min(t.area, u.area)) hits.push({ t, u, area });
      }
    }
  }
  return hits;
}
function trisOf(p: Float32Array | number[], o: number, foliage: boolean, minArea = 0, into: Tri[] = []) { for (let i = 0; i + 8 < p.length; i += 9) { const t = mkTri(p, i, o, foliage); if (t && t.area >= minArea) into.push(t); } return into; }
/** every GLB-backed asset on its own: duplicated or coplanar overlapping faces inside the model */
function assetFaces() {
  const res: { asset: string; pairs: number; area: number; at: number[] }[] = [];
  const v = new THREE.Vector3();
  const HIDDEN = /debris|remains|_c\d+$/;
  const fromObject = (root: THREE.Object3D, into: Tri[], o: number) => { root.updateMatrixWorld(true); root.traverse((c) => { const m = c as THREE.Mesh; if (!m.isMesh) return; for (let q: THREE.Object3D | null = m; q && q !== root; q = q.parent) if (HIDDEN.test(q.name) || !q.visible) return; const g = m.geometry, pos = g.attributes.position, idx = g.index, n = idx ? idx.count : pos.count, arr: number[] = []; for (let i = 0; i < n; i++) { v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m.matrixWorld); arr.push(v.x, v.y, v.z); } trisOf(arr, o, (m.material as THREE.Material).side === THREE.DoubleSide, 0, into); }); };
  const test = (name: string, pieces: { geo: THREE.BufferGeometry; mat: string }[], root?: THREE.Object3D) => {
    const tris: Tri[] = [];
    for (const p of pieces) { const g = p.geo, pos = g.attributes.position, idx = g.index, n = idx ? idx.count : pos.count, arr: number[] = []; for (let i = 0; i < n; i++) { v.fromBufferAttribute(pos, idx ? idx.getX(i) : i); arr.push(v.x, v.y, v.z); } trisOf(arr, 0, p.mat === "foliage", 0, tris); }
    if (root) fromObject(root, tris, 0);
    const hits = coplanar(tris, { cross: false, dTol: 0.002 });
    if (hits.length) { const area = hits.reduce((s, h) => s + h.area, 0), big = hits.sort((p, q) => q.area - p.area)[0]; res.push({ asset: name, pairs: hits.length, area: r2(area * 100) / 100, at: big.t.a.map((x) => r2(x)) }); }
  };
  for (const name of K.buildAssetNames()) { try { const b = K.asset(name); test("build/" + name, b.pieces, b.parts.root); } catch { /* not placeable */ } }
  const rng = () => 0.5;
  for (const t of natureTypes()) for (let i = 0; i < t.variants; i++) test(`nature/${t.type}#${i}`, naturePiece(t.type, rng, 1, { variant: i, plain: true }));
  for (const name of houseAssetNames()) { try { const b = (HOUSE_IDS as readonly string[]).includes(name) ? building(name) : houseModule(name); test("house/" + name, b.pieces, b.parts.root); } catch { /* skip */ } }
  return res;
}
/** two surfaces closer than this in depth fight or stripe under the low sun's shadow map (the lead's 0.03 u rule) */
const NEAR = 0.03;
function zfight(list: Own[], scene: THREE.Scene) {
  // a) between different placed things (hard faces of the play space)
  const tris: Tri[] = [];
  for (const w of list) { if (w.o.src === "edge") continue; trisOf(w.hard, w.i, false, 0.004, tris); trisOf(w.leaf, w.i, true, 0.004, tris); }
  const pairs = new Map<string, { t: Tri; u: Tri; area: number }>();
  for (const h of coplanar(tris, { cross: true })) { const k = h.t.o < h.u.o ? `${h.t.o}|${h.u.o}` : `${h.u.o}|${h.t.o}`, cur = pairs.get(k); if (!cur || cur.area < h.area) pairs.set(k, h); }
  /** a point with a face of the same owner above it within its footprint is inside that thing (a crate's inner floor): not seen */
  const hiddenIn = (w: Own, x: number, y: number, z: number) => { const p = w.hard; for (let i = 0; i + 8 < p.length; i += 9) {
    const ax = p[i], az = p[i + 2], bx = p[i + 3], bz = p[i + 5], cx = p[i + 6], cz = p[i + 8], d1 = (ax - x) * (bz - z) - (bx - x) * (az - z), d2 = (bx - x) * (cz - z) - (cx - x) * (bz - z), d3 = (cx - x) * (az - z) - (ax - x) * (cz - z);
    if (!((d1 > 0 && d2 > 0 && d3 > 0) || (d1 < 0 && d2 < 0 && d3 < 0))) continue; if ((p[i + 1] + p[i + 4] + p[i + 7]) / 3 > y + 0.05) return true; } return false; };
  for (const [, h] of pairs) { const a = list[h.t.o], b = list[h.u.o];
    const cen = (q: Tri) => [(q.a[0] + q.b[0] + q.c[0]) / 3, (q.a[1] + q.b[1] + q.c[1]) / 3, (q.a[2] + q.b[2] + q.c[2]) / 3];
    const [tx, ty, tz] = cen(h.t), [ux, uy, uz] = cen(h.u);
    if (Math.abs(h.t.n[1]) > 0.97 && (hiddenIn(a, tx, ty, tz) || hiddenIn(b, ux, uy, uz))) continue; // one of them is a floor inside a closed thing
    if (Math.min(h.t.bb[4], h.u.bb[4]) < meshH(tx, tz) - 0.01) continue; // the shared patch is under the ground (buried piles, stringers)
    add("zfight", h.area > 0.05 ? "visible" : "minor", h.t.a[0], h.t.a[2], `${a.o.k}|${b.o.k}`, `coplanar faces of ${label(a)} and ${label(b)} overlap (${r2(h.area * 1000) / 1000} m2, normal ${h.t.n.map((q) => r2(q)).join(",")}, y ${r2(h.t.a[1])})`, h.area, { y: h.t.a[1] }); }
  // b) up-facing faces lying on the terrain mesh (floors, decks, tops of buried things)
  for (const w of list) {
    if (w.o.src === "house" || w.o.src === "edge" || isNature(w.o.k)) continue; // (nature is planted below its origin on purpose)
    let n = 0, area = 0, at: number[] = [], worst = 1;
    const own = trisOf(w.hard, w.i, false, 0.0005);
    /** is there a face of the same thing above this point (the face is hidden inside it, e.g. a crate's inner floor) */
    const covered = (x: number, y: number, z: number) => own.some((u) => {
      if (u.bb[4] < y + 0.02 || x < u.bb[0] || x > u.bb[3] || z < u.bb[2] || z > u.bb[5] || Math.abs(u.n[1]) < 0.05) return false;
      const d = (q: number[], r: number[]) => (q[0] - x) * (r[2] - z) - (r[0] - x) * (q[2] - z), s1 = d(u.a, u.b), s2 = d(u.b, u.c), s3 = d(u.c, u.a);
      if (!((s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0))) return false;
      return (u.d - u.n[0] * x - u.n[2] * z) / u.n[1] > y + 0.02;
    });
    for (const t of own) {
      if (t.n[1] < 0.995 || t.area < 0.002) continue; // level faces only: a sloped board that runs into the ground meets it along a line, it does not fight it
      const cx = (t.a[0] + t.b[0] + t.c[0]) / 3, cy = (t.a[1] + t.b[1] + t.c[1]) / 3, cz = (t.a[2] + t.b[2] + t.c[2]) / 3;
      if (houseAt(cx, cz) || onDeck(cx, cz) || covered(cx, cy, cz)) continue;
      const pts = [[cx, cy, cz], t.a, t.b, t.c]; let close = 0, minD = 1;
      for (const p of pts) { const d = p[1] - meshH(p[0], p[2]); minD = Math.min(minD, d); if (Math.abs(d) < NEAR) close++; }
      // faces that show: within NEAR of the drawn ground at any of its points, or the ground cuts through it
      if (close >= 1 || (minD < 0 && cy - meshH(cx, cz) > -0.03)) { n++; area += t.area; if (minD < worst) { worst = minD; at = [cx, cy, cz]; } }
    }
    if (n && area > 0.03) add("zfight", area > 0.3 ? "visible" : "minor", at[0], at[2], w.o.k, `${n} up-facing faces of ${label(w)} lie on or under the terrain mesh (${r2(area)} m2, worst ${r2(worst)} u)`, area, { y: at[1], src: w.o.src });
  }
  // b2) flat sheets among the scene's own nodes (the vat's spill, set-piece plates): clearance and no shadow casting
  const skipRoots = new Set<THREE.Object3D>([G.rig?.root, ...G.enemies.map((e) => e.rig.root)].filter(Boolean) as THREE.Object3D[]);
  const bx = new THREE.Box3(), vv = new THREE.Vector3();
  const sheet = (o: THREE.Object3D) => {
    if (skipRoots.has(o) || ["chunk", "grass", "terrain", "water", "decals", "glitch-cols"].includes(o.name)) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && m.visible && m.geometry.attributes.position?.array) {
      bx.setFromObject(m); const h = bx.max.y - bx.min.y, wide = Math.max(bx.max.x - bx.min.x, bx.max.z - bx.min.z), cx = (bx.min.x + bx.max.x) / 2, cz = (bx.min.z + bx.max.z) / 2;
      if (wide > 0.4 && h <= 0.12 && h <= wide * 0.05 && bx.min.y < meshH(cx, cz) + 0.15 && !houseAt(cx, cz) && !onDeck(cx, cz)) {
        const pos = m.geometry.attributes.position; let worst = 1;
        for (let i = 0; i < pos.count; i++) { vv.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); worst = Math.min(worst, vv.y - meshHeightMax(vv.x, vv.z, 0.4)); }
        const mat = m.material as THREE.Material, overlay = mat.transparent && !mat.depthWrite;
        if (worst < NEAR && !overlay) add("zfight", "visible", cx, cz, m.name || m.parent?.name || "sheet", `flat node ${m.parent?.name ?? ""}/${m.name} lies ${r2(worst * 100) / 100} u from the drawn terrain (rule: >= ${NEAR})`, NEAR - worst, { y: bx.max.y });
        if (m.castShadow && !overlay) add("zfight", "minor", cx, cz, m.name || "sheet", `flat node ${m.parent?.name ?? ""}/${m.name} casts a shadow (a sheet on the ground stripes under a low sun)`, 0, { y: bx.max.y });
      }
    }
    for (const c of o.children) sheet(c);
  };
  for (const c of scene.children) sheet(c);
  // c) decals that dip under the terrain mesh (they lie 0.035 u up on the 1 u height field; the mesh is 0.8 u triangles)
  const cells = new Map<string, { n: number; worst: number; x: number; z: number }>();
  scene.traverse((o) => {
    const m = o as THREE.Mesh; if (!m.isMesh || m.name !== "decals") return;
    const p = m.geometry.attributes.position; if (!p.array) return;
    m.updateMatrixWorld(); const e = m.matrixWorld.elements;
    for (let i = 0; i + 2 < p.count; i += 3) {
      const V = [0, 1, 2].map((k) => [p.getX(i + k) + e[12], p.getY(i + k) + e[13], p.getZ(i + k) + e[14]]);
      for (const [u, w] of [[1 / 3, 1 / 3], [0.5, 0], [0, 0.5], [0.5, 0.5]]) {
        const x = V[0][0] + (V[1][0] - V[0][0]) * u + (V[2][0] - V[0][0]) * w, y = V[0][1] + (V[1][1] - V[0][1]) * u + (V[2][1] - V[0][1]) * w, z = V[0][2] + (V[1][2] - V[0][2]) * u + (V[2][2] - V[0][2]) * w;
        if (houseAt(x, z, 0.05) || onDeck(x, z)) continue;
        const d = y - meshH(x, z); if (d > 0.01) continue; // decals: +0.035 lift, polygon offset, no depth write; under 1 cm they fight
        const k = `${Math.floor(x / 2)},${Math.floor(z / 2)}`, c = cells.get(k) ?? cells.set(k, { n: 0, worst: 1, x, z }).get(k)!; c.n++; if (d < c.worst) { c.worst = d; c.x = x; c.z = z; }
      }
    }
  });
  // within 3 cm under the mesh the decal fights it (polygon offset -2 cannot hold it); deeper it is cut off hard-edged
  for (const [, c] of cells) if (c.n >= 3) add("zfight", c.n >= 8 ? "visible" : "minor", c.x, c.z, "decal", `ground decal ${c.worst > -0.03 ? "fights" : "is cut by"} the terrain mesh (down to ${Math.round(c.worst * 1000) / 1000} u) at ${c.n} samples`, -c.worst);
  // d) water planes flat against the terrain mesh (a wide band within 1 cm flickers)
  scene.traverse((o) => {
    const m = o as THREE.Mesh; if (!m.isMesh || m.name !== "water") return;
    const b = new THREE.Box3().setFromObject(m), wy = b.max.y; let band = 0, x0 = 0, z0 = 0;
    for (let z = Math.max(b.min.z, -144); z < Math.min(b.max.z, 144); z += 0.5) for (let x = Math.max(b.min.x, -128); x < Math.min(b.max.x, 224); x += 0.5) { const h = meshH(x, z); if (Math.abs(h - wy) < 0.01 && Math.hypot(meshH(x + 0.4, z) - meshH(x - 0.4, z), meshH(x, z + 0.4) - meshH(x, z - 0.4)) < 0.03) { band++; x0 = x; z0 = z; } }
    if (band * 0.25 > 1) add("zfight", "visible", x0, z0, "water", `water plane at y ${r2(wy)} lies flat within 1 cm of the terrain over ${band * 0.25} m2 (slope under 4 %)`, band * 0.25);
  });
}

// ---------------------------------------------------------------- 4. colliders against meshes
const OCC = 0.25;
function occupancy(list: Own[], scene: THREE.Scene) {
  const X0 = -130, Z0 = -146, NX = Math.ceil((226 - X0) / OCC), NZ = Math.ceil((146 - Z0) / OCC), occ = new Uint8Array(NX * NZ);
  const mark = (x: number, z: number) => { const c = Math.floor((x - X0) / OCC), r = Math.floor((z - Z0) / OCC); if (c >= 0 && r >= 0 && c < NX && r < NZ) occ[r * NX + c] = 1; };
  const tri = (p: ArrayLike<number>, i: number) => {
    const ya = p[i + 1], yb = p[i + 4], yc = p[i + 7], cx = (p[i] + p[i + 3] + p[i + 6]) / 3, cz = (p[i + 2] + p[i + 5] + p[i + 8]) / 3, g = groundHeight(cx, cz);
    if (Math.max(ya, yb, yc) < g + 0.12 || Math.min(ya, yb, yc) > g + 2.4) return;
    for (const [a, b] of [[0, 3], [3, 6], [6, 0]]) { const n = Math.max(1, Math.ceil(Math.hypot(p[i + b] - p[i + a], p[i + b + 2] - p[i + a + 2]) / (OCC * 0.7))); for (let k = 0; k <= n; k++) mark(p[i + a] + ((p[i + b] - p[i + a]) * k) / n, p[i + a + 2] + ((p[i + b + 2] - p[i + a + 2]) * k) / n); }
    mark(cx, cz);
  };
  for (const w of list) for (const a of [w.hard, w.leaf]) for (let i = 0; i + 8 < a.length; i += 9) tri(a, i);
  // scene objects outside the chunks: door leaves, gates, the zipline, set-piece parts, crates (not the actors)
  const skip = new Set<THREE.Object3D>([G.rig?.root, ...G.enemies.map((e) => e.rig.root)].filter(Boolean) as THREE.Object3D[]);
  const v = new THREE.Vector3(), arr: number[] = [];
  scene.updateMatrixWorld(true);
  const walk = (o: THREE.Object3D) => {
    if (skip.has(o) || !o.visible || ["chunk", "grass", "terrain", "water", "decals"].includes(o.name)) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && !(m as unknown as THREE.SkinnedMesh).isSkinnedMesh && m.geometry.attributes.position?.array) {
      const g = m.geometry, pos = g.attributes.position, idx = g.index, n = idx ? idx.count : pos.count; arr.length = 0;
      for (let i = 0; i < n; i++) { v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m.matrixWorld); arr.push(v.x, v.y, v.z); }
      for (let i = 0; i + 8 < arr.length; i += 9) tri(arr, i);
    }
    for (const c of o.children) walk(c);
  };
  for (const c of scene.children) walk(c);
  const near = (x: number, z: number, r: number) => { const c0 = Math.floor((x - r - X0) / OCC), c1 = Math.floor((x + r - X0) / OCC), r0 = Math.floor((z - r - Z0) / OCC), r1 = Math.floor((z + r - Z0) / OCC); for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) if (cc >= 0 && rr >= 0 && cc < NX && rr < NZ && occ[rr * NX + cc]) return true; return false; };
  return { near };
}
/** pieces you walk under by design: the canopy, the platform or the line is above head height or a tarp sheet */
const WALK_UNDER = /^(tarp|washing_line|watchtower|zip_tower)$/;
function colliderMismatch(list: Own[], scene: THREE.Scene) {
  const occ = occupancy(list, scene), dg = debugGrid() as unknown as { cols: W[] };
  const ownerOf = (q: W) => { for (const w of list) for (const c of w.cols) if (Math.abs(c.x - q.x) < 0.01 && Math.abs(c.z - q.z) < 0.01 && Math.abs(c.r - q.r) < 0.2) return label(w) + (c.tag ? " " + c.tag : ""); return "?"; };
  // a) invisible walls: runs of a collider's outline with nothing drawn within 0.35 u
  for (const q of dg.cols) {
    if (!(q.flags! & 1) || q.whenOpen) continue;
    if (q.gate !== undefined && q.gate >= 0) continue; // gates are doors and breakable walls: tested in doors()
    if (q.x > UNDER_X - 2 && edgeDist(q.x, q.z) < -1) continue;
    const pts = perimeter(q, 0.2, 0.05); let run = 0, best = 0, bx = 0, bz = 0, miss = 0;
    for (let k = 0; k < pts.length * 2; k++) { const [x, z] = pts[k % pts.length], hit = occ.near(x, z, 0.35); if (k < pts.length && !hit) miss++; if (hit) run = 0; else { run++; if (run > best && run <= pts.length) { best = run; bx = x; bz = z; } } }
    const len = best * 0.2;
    if (miss === pts.length) add("collider", "bug", q.x, q.z, "collider", `invisible collider: nothing drawn round a ${q.circle ? "circle r " + r2(q.r) : "box " + r2(q.hx * 2) + "x" + r2(q.hz * 2)} (${ownerOf(q)})`, q.r);
    else if (len >= 0.8) add("collider", len > 1.5 ? "visible" : "minor", bx, bz, "collider", `invisible wall: ${r2(len)} u of the outline of ${q.circle ? "circle r " + r2(q.r) : "box " + r2(q.hx * 2) + "x" + r2(q.hz * 2)} (${ownerOf(q)}) has no mesh within 0.35 u`, len);
  }
  // b) walk-into meshes: hard body (0.2-1.8 u up) more than 0.4 u outside every collider; and solid-looking props with none
  const all = colIndex(dg.cols.filter((q) => q.flags! & 1));
  for (const w of list) {
    if (w.o.src === "edge" || NO_GROUND.test(w.o.k) || WALK_UNDER.test(w.o.k)) continue;
    const cells = new Map<number, [number, number]>();
    for (let i = 0; i + 8 < w.hard.length; i += 9) {
      const p = w.hard; let lo = 1e9, hi = -1e9; for (let k = 1; k < 9; k += 3) { lo = Math.min(lo, p[i + k]); hi = Math.max(hi, p[i + k]); }
      if (hi < w.base + 0.35 || lo > w.base + 1.6) continue;
      for (let k = 0; k < 9; k += 3) { const x = p[i + k], z = p[i + k + 2]; cells.set(Math.floor(x / 0.2) * 100000 + Math.floor(z / 0.2), [x, z]); }
      const cx = (p[i] + p[i + 3] + p[i + 6]) / 3, cz = (p[i + 2] + p[i + 5] + p[i + 8]) / 3; cells.set(Math.floor(cx / 0.2) * 100000 + Math.floor(cz / 0.2), [cx, cz]);
    }
    if (!cells.size) continue;
    let worst = 0, wx = 0, wz = 0, far = 0;
    for (const [, [x, z]] of cells) { const d = all.dist(x, z); if (d > 0.4) far++; if (d > worst) { worst = d; wx = x; wz = z; } }
    const area = far * 0.04, height = w.bb[4] - w.base;
    if (!w.cols.length) { if (!isNature(w.o.k) && area > 0.25 && height > 0.7 && w.o.src !== "house") add("collider", height > 1.2 && area > 0.6 ? "visible" : "minor", w.o.x, w.o.z, w.o.k, `walk-through: ${label(w)} is ${r2(height)} u tall with no collider`, area); }
    else if (far >= 3 && worst > 0.4) add("collider", worst > 0.7 ? "visible" : "minor", wx, wz, w.o.k, `mesh of ${label(w)} reaches ${r2(worst)} u past its collider (${r2(area)} m2 you can walk into)`, worst);
  }
}

// ---------------------------------------------------------------- 5. doors
function doors() {
  const dg = debugGrid() as unknown as { cols: W[] }, idx = colIndex(dg.cols.filter((q) => q.flags! & 1 && (q.gate === undefined || q.gate < 0)));
  const v = new THREE.Vector3();
  for (const h of houses) for (const d of h.doors) {
    const g = gates.find((q) => q.id === d.gateId); if (!g) continue;
    const leaf = d.leaf, r0 = leaf.rotation.y;
    const verts = (rot: number) => { leaf.rotation.y = rot; leaf.updateMatrixWorld(true); const pts: number[][] = []; leaf.traverse((c) => { const m = c as THREE.Mesh; if (!m.isMesh) return; const pos = m.geometry.attributes.position; for (let i = 0; i < pos.count; i += 1) { v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); pts.push([v.x, v.y, v.z]); } }); return pts; };
    const open = verts(d.open), closed = verts(d.closed); leaf.rotation.y = r0; leaf.updateMatrixWorld(true);
    // open: the leaf against walls and furniture (not its own frame: skip colliders within 0.25 u of the hinge line)
    let depth = 0, at = [0, 0, 0];
    for (const p of open) { if (p[1] < h.y + 0.15 || p[1] > h.y + 2.2) continue; for (const q of idx.near(p[0], p[2])) { const dd = -colDist(q, p[0], p[2]); if (dd > depth) { depth = dd; at = p; } } }
    if (depth > 0.06) add("door", depth > 0.15 ? "visible" : "minor", at[0], at[2], h.id + ":" + d.id, `open leaf of ${d.gateId} goes ${r2(depth)} u into a wall or prop`, depth, { y: at[1] });
    // closed: the leaf should span the doorway
    const tx = -g.nz, tz = g.nx; let lo = 1e9, hi = -1e9, yl = 1e9;
    for (const p of closed) { const a = (p[0] - g.x) * tx + (p[2] - g.z) * tz; lo = Math.min(lo, a); hi = Math.max(hi, a); yl = Math.min(yl, p[1]); }
    const gap = Math.max(-g.w / 2 - lo, 0) + Math.max(hi - g.w / 2, 0), short = g.w - (hi - lo);
    if (short > 0.2) add("door", short > 0.35 ? "visible" : "minor", g.x, g.z, h.id + ":" + d.id, `closed leaf of ${d.gateId} is ${r2(short)} u narrower than its doorway`, short);
    if (gap > 0.15) add("door", "minor", g.x, g.z, h.id + ":" + d.id, `closed leaf of ${d.gateId} sticks ${r2(gap)} u past the doorway into the wall`, gap);
    const under = yl - (h.y + FLOOR_TOP);
    if (under > 0.12) add("door", "minor", g.x, g.z, h.id + ":" + d.id, `${r2(under)} u gap under the leaf of ${d.gateId}`, under);
    if (under < -0.03) add("door", "minor", g.x, g.z, h.id + ":" + d.id, `leaf of ${d.gateId} sinks ${r2(-under)} u into the floor`, -under);
  }
}

// ---------------------------------------------------------------- 6. sockets, spawns, enemies, nav
function sockets() {
  const dg = debugGrid() as unknown as { cols: W[] }, idx = colIndex(dg.cols.filter((q) => q.flags! & 1 && !q.whenOpen && (q.gate === undefined || q.gate < 0)));
  for (const g of gates) g.open = true;
  const reach = flood(START.x, START.z);
  // crates: a crate spawns at any yaw outdoors; its box reaches 0.85 u from its centre (crate_green 0.85 x 0.51 half)
  for (const c of CRATES) {
    const clear = idx.dist(c.x, c.z), need = c.in ? 0.55 : c.tier === "green" ? 0.99 : 0.85;
    if (clear < 0) add("socket", "bug", c.x, c.z, "crate", `crate socket ${c.tier}${c.fixed ? "/" + c.fixed : ""} inside a collider (${r2(clear)})`, -clear);
    else if (clear < need - 0.1) add("socket", clear < need - 0.35 ? "visible" : "minor", c.x, c.z, "crate", `crate socket ${c.tier}${c.fixed ? "/" + c.fixed : ""} has ${r2(clear)} u clear: a turned crate can poke into the next collider`, need - clear);
    if (!reach(c.x, c.z, 1)) add("socket", "bug", c.x, c.z, "crate", `crate socket ${c.tier}${c.fixed ? "/" + c.fixed : ""} unreachable from the start with every gate open`, 0);
    const gap = groundHeight(c.x, c.z) + (c.y ?? 0) - surf(c.x, c.z);
    if (Math.abs(gap) > 0.06 && !c.y) add("socket", "minor", c.x, c.z, "crate", `crate socket sits ${r2(gap)} u off the surface under it`, Math.abs(gap));
  }
  for (const c of G.crates) { // this raid's crates at their real yaw (sockets with a y stand on a platform: the tower, the vault plinth)
    const b = new THREE.Box3().setFromObject(c.obj); let depth = 0;
    const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
    for (const [px, pz] of [[b.min.x, b.min.z], [b.max.x, b.min.z], [b.min.x, b.max.z], [b.max.x, b.max.z], [cx, b.min.z], [cx, b.max.z], [b.min.x, cz], [b.max.x, cz]]) for (const q of idx.near(px, pz)) depth = Math.max(depth, -colDist(q, (px + cx * 2) / 3, (pz + cz * 2) / 3));
    if (depth > 0.08) add("socket", "visible", c.x, c.z, "crate", `spawned ${c.tier} crate ${c.id} overlaps a collider by ${r2(depth)} u`, depth);
    const sock = CRATES.find((q) => q.x === c.x && q.z === c.z); if (sock?.y) continue;
    const lift = b.min.y - surf(c.x, c.z); if (lift > 0.06 || lift < -0.2) add("socket", lift > 0.06 ? "visible" : "minor", c.x, c.z, "crate", `spawned ${c.tier} crate ${c.id} ${lift > 0 ? "floats" : "sinks"} ${r2(Math.abs(lift))} u`, Math.abs(lift));
  }
  // enemies: home on open ground, a patrol ring that is mostly walkable, a way to the player
  const seenHome = new Set<string>();
  SPAWNS.flat().forEach((s) => {
    const key = `${s.x},${s.z}`; if (seenHome.has(key)) return; seenHome.add(key);
    const rad = s.kind === "brute" ? 0.72 : 0.36, clear = idx.dist(s.x, s.z);
    if (!walkable(s.x, s.z) || clear < rad * 0.5) add("socket", "bug", s.x, s.z, s.kind, `${s.kind} spawn ${r2(s.x)},${r2(s.z)} inside a collider (${r2(clear)} u clear)`, clear);
    else if (!reach(s.x, s.z)) add("socket", "bug", s.x, s.z, s.kind, `${s.kind} spawn ${r2(s.x)},${r2(s.z)} stranded: no nav path to the start`, 0);
    if (s.kind !== "sleeper") { let ok = 0; for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, x = s.x + Math.cos(a) * 3, z = s.z + Math.sin(a) * 3; if (walkable(x, z) && path(s.x, s.z, x, z, 4000).length) ok++; } if (ok < 8) add("socket", ok < 4 ? "visible" : "minor", s.x, s.z, s.kind, `${s.kind} at ${r2(s.x)},${r2(s.z)}: only ${ok}/16 patrol points walkable (it stands still or scrapes walls)`, 16 - ok); }
  });
  const marks: [string, number, number][] = [["start", START.x, START.z], ["hatch", POI.hatch.x, POI.hatch.z], ["raft", POI.raft.x, POI.raft.z], ["tunnel", POI.tunnelExit.x, POI.tunnelExit.z], ...PORTALS.flatMap((p) => [[p.id + ":a", p.a.x, p.a.z], [p.id + ":b", p.b.x, p.b.z]] as [string, number, number][]), ...ZIPLINES.flatMap((z) => [[z.id + ":from", z.from.x, z.from.z + 3.2], [z.id + ":to", z.to.x, z.to.z]] as [string, number, number][]), ...SUPPLY_DROPS.map((q, i) => ["drop" + i, q.x, q.z] as [string, number, number])];
  for (const [n, x, z] of marks) { if (!walkable(x, z)) add("socket", "bug", x, z, n, `${n} mark is not walkable`, 0); else if (!reach(x, z)) add("socket", "bug", x, z, n, `${n} mark unreachable from the start`, 0); }
  // stranded nav pockets: open cells the start can't reach (everything open), 4+ cells big
  const dgr = debugGrid() as unknown as { cells: Uint8Array; navStatic: Uint8Array; minX: number; minZ: number }, GWd = 316, seen = new Uint8Array(dgr.cells.length);
  for (let i = 0; i < dgr.cells.length; i++) {
    if (seen[i] || dgr.cells[i] !== 1 || dgr.navStatic[i]) continue;
    const x = dgr.minX + (i % GWd) + 0.5, z = dgr.minZ + Math.floor(i / GWd) + 0.5; if (reach(x, z)) continue;
    const q = [i]; seen[i] = 1; let n = 0;
    for (let h = 0; h < q.length; h++) { const cur = q[h]; n++; for (const d of [1, -1, GWd, -GWd]) { const k = cur + d; if (k >= 0 && k < seen.length && !seen[k] && dgr.cells[k] === 1 && !dgr.navStatic[k] && !reach(dgr.minX + (k % GWd) + 0.5, dgr.minZ + Math.floor(k / GWd) + 0.5)) { seen[k] = 1; q.push(k); } } }
    if (n >= 4) add("socket", "minor", x, z, "nav", `${n}-cell nav pocket the start can't reach (an enemy pushed in there is stuck)`, n);
  }
  for (const g of gates) g.open = false;
}

// ---------------------------------------------------------------- run
export function run(o: { assets?: boolean } = {}) {
  out.length = 0;
  const t0 = performance.now(), scene = G.stage.scene, list = owners(), t1 = performance.now();
  grounding(list); const t2 = performance.now();
  overlaps(list); const t3 = performance.now();
  zfight(list, scene); const t4 = performance.now();
  colliderMismatch(list, scene); const t5 = performance.now();
  doors(); sockets(); const t6 = performance.now();
  for (const t of natureTypes()) if (NATURE_VARIANTS[t.type] !== undefined && NATURE_VARIANTS[t.type] !== t.variants) add("collider", "bug", 0, 0, t.type, `colliders.ts NATURE_V has ${NATURE_VARIANTS[t.type]} variants of ${t.type}, the GLB has ${t.variants}`, t.variants, { y: 0, src: "asset" });
  const assets = o.assets === false ? [] : assetFaces();
  for (const a of assets) add("zfight", a.area > 0.02 ? "visible" : "minor", 0, 0, a.asset, `${a.asset}: ${a.pairs} pairs of coplanar overlapping faces (${a.area} m2), e.g. near local ${a.at.join(", ")}`, a.area, { src: "asset", y: 0 });
  const ms = { owners: t1 - t0, ground: t2 - t1, overlap: t3 - t2, zfight: t4 - t3, collider: t5 - t4, doors_sockets: t6 - t5, assets: performance.now() - t6 };
  const count = (k: keyof Finding) => out.reduce((m, f) => { const v = String(f[k]); m[v] = (m[v] ?? 0) + 1; return m; }, {} as Record<string, number>);
  return { findings: out.slice(), bySev: count("sev"), byCat: count("cat"), owners: list.length, ms: Object.fromEntries(Object.entries(ms).map(([k, v]) => [k, Math.round(v)])) };
}
/** screen position of a world point in the current frame (for crops) */
export function screenOf(x: number, y: number, z: number) {
  const v = new THREE.Vector3(x, y, z).project(G.stage.camera), el = G.stage.renderer.domElement;
  return { x: Math.round((v.x * 0.5 + 0.5) * el.clientWidth), y: Math.round((-v.y * 0.5 + 0.5) * el.clientHeight), on: Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && v.z < 1 };
}
void PIER_Y;
/** draw every movement collider as a red outline 0.12 u above the ground (crops for the register) */
let overlay: THREE.LineSegments | null = null;
export function showColliders(on = true) {
  if (overlay) { overlay.removeFromParent(); overlay.geometry.dispose(); overlay = null; }
  if (!on) return;
  const dg = debugGrid() as unknown as { cols: W[] }, pos: number[] = [];
  for (const q of dg.cols) {
    if (!(q.flags! & 1)) continue;
    const pts = perimeter(q, 0.15, 0);
    for (let i = 0; i < pts.length; i++) { const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length]; pos.push(ax, groundHeight(ax, az) + 0.12, az, bx, groundHeight(bx, bz) + 0.12, bz); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  overlay = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: "#ff2050", depthTest: false, transparent: true, opacity: 0.9 })); overlay.renderOrder = 10; overlay.name = "glitch-cols";
  G.stage.scene.add(overlay);
}
/** the see-through cut round the hero and the aim point off/on (crops show the thing itself, not the hole) */
export function cutout(on: boolean) { CUT.uCutOn.value = on ? 1 : 0; }
/** footprint of nature pieces at scale 1 (hard parts, 0.15-1.8 u up): radius percentiles and the oriented extents */
export function measureNature(types: string[]) {
  const res: Record<string, unknown[]> = {};
  for (const t of natureTypes()) {
    if (!types.includes(t.type)) continue;
    res[t.type] = [];
    for (let i = 0; i < t.variants; i++) {
      const ps = naturePiece(t.type, () => 0.5, 1, { variant: i, plain: true }), rs: number[] = []; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const p of ps) { const a = p.geo.attributes.position; for (let k = 0; k < a.count; k++) y0 = Math.min(y0, a.getY(k)); }
      for (const p of ps) { if (p.mat === "foliage") continue; const a = p.geo.attributes.position; for (let k = 0; k < a.count; k++) { const x = a.getX(k), y = a.getY(k), z = a.getZ(k); y1 = Math.max(y1, y); if (y < 0.1 || y > 1.8) continue; rs.push(Math.hypot(x, z)); x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } }
      rs.sort((a, b) => a - b); const q = (f: number) => r2(rs[Math.floor(f * (rs.length - 1))] ?? 0);
      res[t.type].push({ v: i, p50: q(0.5), p90: q(0.9), max: q(1), x: [r2(x0), r2(x1)], z: [r2(z0), r2(z1)], y: [r2(y0), r2(y1)] });
    }
  }
  return res;
}
/** outline of a nature piece cut at height h (scale 1, hard parts): the farthest hit along 72 rays from the origin */
export function sliceNature(types: string[], hs = [0.15, 0.6]) {
  const res: Record<string, unknown[]> = {};
  for (const t of natureTypes()) {
    if (!types.includes(t.type)) continue; res[t.type] = [];
    for (let i = 0; i < t.variants; i++) {
      const ps = naturePiece(t.type, () => 0.5, 1, { variant: i, plain: true }), row: Record<string, unknown> = { v: i };
      for (const h of hs) {
        const segs: number[][] = [];
        for (const p of ps) { if (p.mat === "foliage") continue; const a = p.geo.attributes.position, idx = p.geo.index, n = idx ? idx.count : a.count;
          for (let k = 0; k + 2 < n; k += 3) { const V = [0, 1, 2].map((j) => { const q = idx ? idx.getX(k + j) : k + j; return [a.getX(q), a.getY(q), a.getZ(q)]; }); const pts: number[][] = [];
            for (const [u, w] of [[0, 1], [1, 2], [2, 0]]) { const A = V[u], B = V[w]; if ((A[1] - h) * (B[1] - h) < 0) { const f = (h - A[1]) / (B[1] - A[1]); pts.push([A[0] + (B[0] - A[0]) * f, A[2] + (B[2] - A[2]) * f]); } }
            if (pts.length === 2) segs.push([...pts[0], ...pts[1]]); } }
        const rs: number[] = [];
        for (let d = 0; d < 72; d++) { const a = (d / 72) * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a); let far = 0;
          for (const [x0, z0, x1, z1] of segs) { const ex = x1 - x0, ez = z1 - z0, den = dx * ez - dz * ex; if (Math.abs(den) < 1e-9) continue; const tt = (x0 * ez - z0 * ex) / den, uu = (x0 * dz - z0 * dx) / den; if (tt > 0 && uu >= 0 && uu <= 1) far = Math.max(far, tt); }
          rs.push(far); }
        const sorted = [...rs].sort((p, q) => p - q);
        row["h" + h] = { min: r2(sorted[0]), p25: r2(sorted[18]), med: r2(sorted[36]), p75: r2(sorted[54]), max: r2(sorted[71]) };
      }
      res[t.type].push(row);
    }
  }
  return res;
}
/** fit collider circles to a nature piece: cut it at height h, split the cut into separate outlines (one per rock or
 *  trunk) and give each its centre and its median radius. Used to write the per-variant table in map/colliders.ts */
export function fitNature(type: string, h = 0.15) {
  const t = natureTypes().find((q) => q.type === type); if (!t) return [];
  const out2: { v: number; circles: number[][] }[] = [];
  for (let i = 0; i < t.variants; i++) {
    const ps = naturePiece(type, () => 0.5, 1, { variant: i, plain: true }), segs: number[][] = [];
    for (const p of ps) { if (p.mat === "foliage") continue; const a = p.geo.attributes.position, idx = p.geo.index, n = idx ? idx.count : a.count;
      for (let k = 0; k + 2 < n; k += 3) { const V = [0, 1, 2].map((j) => { const q = idx ? idx.getX(k + j) : k + j; return [a.getX(q), a.getY(q), a.getZ(q)]; }); const pts: number[][] = [];
        for (const [u, w] of [[0, 1], [1, 2], [2, 0]]) { const A = V[u], B = V[w]; if ((A[1] - h) * (B[1] - h) < 0) { const f = (h - A[1]) / (B[1] - A[1]); pts.push([A[0] + (B[0] - A[0]) * f, A[2] + (B[2] - A[2]) * f]); } }
        if (pts.length === 2) segs.push([...pts[0], ...pts[1]]); } }
    // union-find on shared endpoints
    const par = segs.map((_, k) => k), find = (k: number): number => (par[k] === k ? k : (par[k] = find(par[k])));
    const key = (x: number, z: number) => `${Math.round(x * 200)},${Math.round(z * 200)}`, at = new Map<string, number>();
    segs.forEach((s, k) => { for (const [x, z] of [[s[0], s[1]], [s[2], s[3]]]) { const kk = key(x, z), o = at.get(kk); if (o === undefined) at.set(kk, k); else par[find(o)] = find(k); } });
    const groups = new Map<number, number[][]>(); segs.forEach((s, k) => { const r = find(k); (groups.get(r) ?? groups.set(r, []).get(r)!).push(s); });
    const circles: number[][] = [];
    for (const [, g] of groups) {
      let L = 0, cx = 0, cz = 0; for (const s of g) { const l = Math.hypot(s[2] - s[0], s[3] - s[1]); L += l; cx += ((s[0] + s[2]) / 2) * l; cz += ((s[1] + s[3]) / 2) * l; }
      if (L < 0.3) continue; cx /= L; cz /= L;
      const rs: number[] = [];
      for (let d = 0; d < 72; d++) { const a = (d / 72) * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a); let far = 0;
        for (const [x0, z0, x1, z1] of g) { const ax = x0 - cx, az = z0 - cz, ex = x1 - x0, ez = z1 - z0, den = dx * ez - dz * ex; if (Math.abs(den) < 1e-9) continue; const tt = (ax * ez - az * ex) / den, uu = (ax * dz - az * dx) / den; if (tt > 0 && uu >= 0 && uu <= 1) far = Math.max(far, tt); }
        if (far > 0) rs.push(far); }
      rs.sort((p, q) => p - q); if (!rs.length) continue;
      circles.push([r2(cx), r2(cz), r2(rs[Math.floor(rs.length * 0.6)]), r2(rs[rs.length - 1])]);
    }
    out2.push({ v: i, circles: circles.sort((p, q) => q[2] - p[2]) });
  }
  return out2;
}
/** flat (up-facing) faces of one build asset grouped by height: where its floors, puddles and plates sit in piece space */
export function flatFaces(name: string) {
  const b = K.asset(name), lv = new Map<number, { area: number; n: number; x0: number; x1: number; z0: number; z1: number; mat: string }>();
  for (const p of b.pieces) for (const t of trisOf(Array.from(p.geo.attributes.position.array as Float32Array), 0, false, 0)) {
    if (t.n[1] < 0.97) continue; const y = Math.round(((t.a[1] + t.b[1] + t.c[1]) / 3) * 1000) / 1000;
    const e = lv.get(y) ?? lv.set(y, { area: 0, n: 0, x0: 9, x1: -9, z0: 9, z1: -9, mat: p.mat }).get(y)!; e.area += t.area; e.n++; e.x0 = Math.min(e.x0, t.bb[0]); e.x1 = Math.max(e.x1, t.bb[3]); e.z0 = Math.min(e.z0, t.bb[2]); e.z1 = Math.max(e.z1, t.bb[5]);
  }
  return [...lv].filter(([, e]) => e.area > 0.01).sort((a, b) => a[0] - b[0]).map(([y, e]) => ({ y, area: r2(e.area), n: e.n, x: [r2(e.x0), r2(e.x1)], z: [r2(e.z0), r2(e.z1)], mat: e.mat }));
}
/** debug: the up-facing faces of one placed owner with their height over the drawn terrain at each corner */
export function ownerFlats(k: string, x: number, z: number) {
  const w = owners().find((q) => q.o.k === k && Math.abs(q.o.x - x) < 0.05 && Math.abs(q.o.z - z) < 0.05); if (!w) return null;
  return trisOf(w.hard, 0, false, 0.002).filter((t) => t.n[1] > 0.97).map((t) => [t.a, t.b, t.c].map((p) => [r2(p[0]), Math.round(p[1] * 1000) / 1000, r2(p[2]), Math.round((p[1] - meshH(p[0], p[2])) * 1000) / 1000])).filter((f) => f.some((p) => p[3] < 0.04));
}
/** debug: the cutout's occluder test (render/cutout.ts cut_occl) for the tall pieces near a point, with this frame's camera */
export function occlTest(x: number, z: number, r = 6) {
  const cam = G.stage.camera.position, T = CUT.uHeroW.value, out2: unknown[] = [];
  for (const rec of pieceRec.list) {
    if (!rec.tall || Math.hypot(rec.o.x - x, rec.o.z - z) > r) continue;
    const g = rec.geo.clone().applyMatrix4(rec.m); g.computeBoundingBox(); const b = g.boundingBox!;
    const ox = (b.min.x + b.max.x) / 2, oz = (b.min.z + b.max.z) / 2, top = b.max.y, reach = Math.max(b.max.x - ox, b.max.z - oz);
    const cx = cam.x, cz = cam.z, dx = T.x - cx, dz = T.z - cz, len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len, along = (ox - cx) * ux + (oz - cz) * uz;
    const a = Math.max(0, Math.min(len, along)), lat = Math.hypot(cx + ux * a - ox, cz + uz * a - oz), los = cam.y + (T.y - cam.y) * (Math.max(0, Math.min(len, along + reach)) / len);
    const cut = top >= T.y + 0.1 && along <= len + reach && lat <= reach + 0.9 && top > los - 0.6;
    out2.push({ cut, k: rec.o.k, x: r2(ox), z: r2(oz), top: r2(top), reach: r2(reach), along: r2(along - len), lat: r2(lat), los: r2(los), Ty: r2(T.y) });
  }
  return out2;
}
