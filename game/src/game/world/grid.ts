// Collision, navigation and line of sight for map v3 (G1_BRIEF "Map v3" rule 2: collision comes from pieces).
// Open ground is the default: a point is walkable when it is inside the map outline and not inside a collider.
//   - Colliders (circle / box / segment, flags move + shot + low) come from every placed piece (map/colliders.ts) and
//     from each building's BuildingDef. Movement and shots test them exactly, through a per-cell index.
//   - A 1 u nav grid is rasterized from the same colliders for A* (binary heap), flood fill and the lint.
//   - Static colliders are built once. Per-raid state lives apart and is reset every raid (pacing report issue 4):
//     gates (doors, breakable walls, the vine door) and dynamic blockers (crates, the supply drop).
// Low cover blocks walking but not shots or sight. Water outside the coast lets shots through; cliffs and jungle don't.
import type { Collider, Placed, BuildingDef } from "../contracts";
import { BOUNDS, SHAPES, ZONES, PLACED, WALLS, DOOR, PORTALS, CRATES, SPAWNS, POI, UNDER_X, ROADS, ZIPLINES, SUPPLY_DROPS, START, DEMO, inDemo, ROUTE_LOCKS, SEAL_PROBES, CONTAINER_SOCKETS, portalOpen } from "./map/grove";
import { collidersFor, RAM } from "./map/colliders";
import { inPoly, segDist, toWorld, type EdgeKind, type Zone } from "./map/types";

export { segDist };
export const GW = BOUNDS.maxX - BOUNDS.minX, GH = BOUNDS.maxZ - BOUNDS.minZ;
const VOID = 0, OPEN = 1, WATER = 2, PAD = 0.45;
const cells = new Uint8Array(GW * GH), zoneOf = new Int8Array(GW * GH).fill(-1);
const navStatic = new Uint8Array(GW * GH), navDyn = new Uint8Array(GW * GH), gateOf = new Int16Array(GW * GH).fill(-1), shotAny = new Uint8Array(GW * GH);
const cornerBlock = new Uint8Array((GW + 1) * (GH + 1));
const ci = (x: number, z: number) => { const c = Math.floor(x - BOUNDS.minX), r = Math.floor(z - BOUNDS.minZ); return c < 0 || r < 0 || c >= GW || r >= GH ? -1 : r * GW + c; };
const cx = (c: number) => BOUNDS.minX + c + 0.5, cz = (r: number) => BOUNDS.minZ + r + 0.5;
export const isUnder = (x: number) => x > UNDER_X;

// ---------------------------------------------------------------- the outline (analytic; terrain and edge dressing use it too)
const OVER = (SHAPES.find((s) => s.t === "poly") as Extract<(typeof SHAPES)[number], { t: "poly" }>).pts;
/** signed distance to the walkable outline: > 0 inside. kind = what the nearest edge is made of */
export function edgeDist(x: number, z: number, out?: { kind: EdgeKind | "cave" }): number {
  if (x < UNDER_X) {
    let d = 1e9, k: EdgeKind = "jungle";
    for (let i = 0, j = OVER.length - 1; i < OVER.length; j = i++) { const q = segDist(x, z, OVER[j][0], OVER[j][1], OVER[i][0], OVER[i][1]); if (q < d) { d = q; k = OVER[j][2]; } }
    if (out) out.kind = k;
    return inPoly(OVER, x, z) ? d : -d;
  }
  let o = -1e9; if (out) out.kind = "cave";
  for (const s of SHAPES) {
    if (s.t === "ellipse") { const e = Math.hypot((x - s.x) / s.rx, (z - s.z) / s.rz); o = Math.max(o, (1 - e) * Math.min(s.rx, s.rz)); }
    else if (s.t === "capsule") { let d = 1e9; for (let i = 0; i < s.pts.length - 1; i++) d = Math.min(d, segDist(x, z, s.pts[i][0], s.pts[i][1], s.pts[i + 1][0], s.pts[i + 1][1])); o = Math.max(o, s.w / 2 - d); }
  }
  return o;
}
export const inside = (x: number, z: number) => edgeDist(x, z) > 0;
/** which named area a point is in ("" if none) */
export function areaAt(x: number, z: number) { const i = ci(x, z); return i >= 0 && zoneOf[i] >= 0 ? ZONES[zoneOf[i]].id : ""; }
export function zoneAt(x: number, z: number): Zone | null { const i = ci(x, z); return i >= 0 && zoneOf[i] >= 0 ? ZONES[zoneOf[i]] : null; }
/** distance to the nearest painted road (1e9 if none within reach) */
export function roadDist(x: number, z: number, out?: { road: (typeof ROADS)[number] | null }) {
  let d = 1e9; if (out) out.road = null;
  for (const r of ROADS) {
    if (x < r.bb[0] || x > r.bb[1] || z < r.bb[2] || z > r.bb[3]) continue;
    for (let i = 0; i < r.pts.length - 1; i++) { const q = segDist(x, z, r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1]) - r.w / 2; if (q < d) { d = q; if (out) out.road = r; } }
  }
  return d;
}

// ---------------------------------------------------------------- colliders in world space
const MOVE = 1, SHOT = 2, RAMF = 4;
type WCol = { circle: boolean; x: number; z: number; r: number; hx: number; hz: number; c: number; s: number; flags: number; gate: number; whenOpen?: boolean };
const cols: WCol[] = [];
let cellStart = new Int32Array(GW * GH + 1), cellItems = new Int32Array(0);
/** per-raid openable things: doors, breakable walls, the vine door. A closed gate's colliders are solid */
export type Gate = {
  id: string; kind: "break" | "door"; x: number; z: number; nx: number; nz: number; w: number;
  hp?: number; persist?: boolean; reveals?: string; mat?: string; locked?: string; building?: string; open: boolean;
};
export const gates: Gate[] = [];
const gateIdx = new Map<string, number>();
export const gate = (id: string) => gates[gateIdx.get(id) ?? -1] as Gate | undefined;
function addGate(g: Gate) { gateIdx.set(g.id, gates.length); gates.push(g); return gates.length - 1; }
/** open or close a gate (door opened/closed, wall broken). Collision, A* and sight follow at once */
export function setGate(id: string, open: boolean) { const g = gate(id); if (g) g.open = open; }
export const state = { get doorOpen() { return !!gate("vine")?.open; } };
export const setDoorOpen = (v: boolean) => setGate("vine", v);
export const breakWall = (id: string) => setGate(id, true);

function addCollider(c: Collider, tf: { x: number; z: number; yaw?: number; s?: number }, gateI = -1, ram = false, whenOpen = false) {
  const k = tf.s ?? 1, flags = (c.move ? MOVE : 0) | (c.shot && !c.low ? SHOT : 0) | (ram ? RAMF : 0);
  if (!flags) return;
  if (c.t === "circle") { const [x, z] = toWorld(tf, c.x, c.z); cols.push({ circle: true, x, z, r: c.r * k, hx: 0, hz: 0, c: 1, s: 0, flags, gate: gateI, whenOpen }); return; }
  let lx: number, lz: number, hx: number, hz: number, yaw: number;
  if (c.t === "box") { lx = c.x; lz = c.z; hx = c.w / 2; hz = c.d / 2; yaw = c.yaw ?? 0; }
  else { lx = (c.ax + c.bx) / 2; lz = (c.az + c.bz) / 2; hx = c.thick / 2; hz = Math.hypot(c.bx - c.ax, c.bz - c.az) / 2; yaw = Math.atan2(c.bx - c.ax, c.bz - c.az); }
  const [x, z] = toWorld(tf, lx, lz), wy = (tf.yaw ?? 0) + yaw;
  // shots step 0.2 u: keep anything that stops them at least 0.3 thick so no bullet steps over it
  if (flags & SHOT) { hx = Math.max(hx, 0.15 / k); hz = Math.max(hz, 0.15 / k); }
  cols.push({ circle: false, x, z, r: Math.hypot(hx, hz) * k, hx: hx * k, hz: hz * k, c: Math.cos(wy), s: Math.sin(wy), flags, gate: gateI, whenOpen });
}
/** distance from a point to a collider's surface (0 or less = inside) */
function colDist(q: WCol, x: number, z: number) {
  const dx = x - q.x, dz = z - q.z;
  if (q.circle) return Math.hypot(dx, dz) - q.r;
  const lx = Math.abs(dx * q.c - dz * q.s) - q.hx, lz = Math.abs(dx * q.s + dz * q.c) - q.hz;
  return lx <= 0 && lz <= 0 ? Math.max(lx, lz) : Math.hypot(Math.max(lx, 0), Math.max(lz, 0));
}
const active = (q: WCol) => q.gate < 0 || (q.whenOpen ? gates[q.gate].open : !gates[q.gate].open); // an open door leaf is solid only while open

export type Blocker = { x: number; z: number; r: number; shots: boolean; ram?: boolean; id?: string };
/** per-raid blockers (crates, the supply drop). Cleared by resetRaidColliders() */
export const blockers: Blocker[] = [];
/** register a per-raid solid prop (a crate). Static scenery never goes through here */
export function block(x: number, z: number, r: number, shots = true, ram = false, id?: string) {
  const b = { x, z, r, shots, ram, id }; blockers.push(b);
  for (let gz = Math.floor(z - r - 1); gz <= z + r + 1; gz++) for (let gx = Math.floor(x - r - 1); gx <= x + r + 1; gx++) {
    const i = ci(gx + 0.5, gz + 0.5); if (i >= 0 && Math.hypot(gx + 0.5 - x, gz + 0.5 - z) < r + 0.2) navDyn[i]++;
  }
  return b;
}
/** start of a raid: every gate shut and unbroken, no crates. The caller then re-applies what the save keeps open */
export function resetRaidColliders() { blockers.length = 0; navDyn.fill(0); for (const g of gates) g.open = false; }

// the outline and the zones are plain data: rasterized at import, so scatter rules and the terrain can ask at once
{
  const info = { kind: "jungle" as EdgeKind | "cave" };
  for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) {
    const x = cx(c), z = cz(r), d = edgeDist(x, z, info);
    cells[r * GW + c] = d > 0 ? OPEN : info.kind === "coast" || info.kind === "river" ? WATER : VOID;
  }
  ZONES.forEach((zn, zi) => {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of zn.pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    for (let z = Math.floor(z0); z <= z1; z++) for (let x = Math.floor(x0); x <= x1; x++) { const i = ci(x + 0.5, z + 0.5); if (i >= 0 && zoneOf[i] < 0 && inPoly(zn.pts, x + 0.5, z + 0.5)) zoneOf[i] = zi; }
  });
}
let ready = false;
/** build collision and navigation from the map. houseDef gives each placed building's colliders and doors (kit_house /
 *  the stub); extra = rule-scattered pieces (map/scatter.ts) that are not in the authored list */
export function initGrid(houseDef: (p: Placed) => Pick<BuildingDef, "colliders" | "doors" | "breakables" | "parts">, extra: Placed[] = []) {
  if (ready) return; ready = true;
  // colliders: placed pieces, buildings (their doors become gates), breakable walls, the vine door
  scattered = extra.length;
  for (const p of [...PLACED, ...extra]) {
    if (p.k.startsWith("building:")) {
      const def = houseDef(p), ids = new Map<string, number>();
      // where a door or a cracked wall section stands in the world, from its collider (a box or a segment)
      const geom = (id: string) => {
        const c = def.colliders.find((q) => q.id === id); if (!c || c.t === "circle") return null;
        const [ax, az] = c.t === "seg" ? toWorld(p, c.ax, c.az) : toWorld(p, c.x - (c.w >= c.d ? c.w / 2 : 0), c.z - (c.w >= c.d ? 0 : c.d / 2));
        const [bx, bz] = c.t === "seg" ? toWorld(p, c.bx, c.bz) : toWorld(p, c.x + (c.w >= c.d ? c.w / 2 : 0), c.z + (c.w >= c.d ? 0 : c.d / 2));
        const w = Math.hypot(bx - ax, bz - az) || 1; return { x: (ax + bx) / 2, z: (az + bz) / 2, nx: -(bz - az) / w, nz: (bx - ax) / w, w };
      };
      for (const d of def.doors) { const g = geom(d.id); if (g) ids.set(d.id, addGate({ id: `${p.id}:${d.id}`, kind: "door", ...g, hp: d.breakable ? 5 : undefined, reveals: undefined, mat: "wood", locked: d.locked, building: p.id, open: false })); }
      for (const k of def.breakables ?? []) { const g = geom(k.id); if (g) ids.set(k.id, addGate({ id: `${p.id}:${k.id}`, kind: "break", ...g, hp: 8, persist: true, reveals: "A secret room!", mat: "stone", building: p.id, open: false })); }
      for (const c of def.colliders) addCollider(c, p, c.id !== undefined ? ids.get(c.id) ?? -1 : -1);
      // the swung-open leaf: a thin slab from its hinge (leaves hinge at their -x jamb, kit_build/kit_house), solid while the
      // door is open so you can't walk through the door itself (Moo: "door has no collision"). Movement only: no shots, no nav.
      for (const d of def.doors) {
        const leaf = def.parts?.[d.leaf], gi = ids.get(d.id), gd = gi !== undefined ? gates[gi] : undefined; if (!leaf?.position || gd === undefined) continue; // (the sim loads JSON defs without parts)
        const len = Math.min(gd.w, 1.8) * 0.92, ax = leaf.position.x, az = leaf.position.z, dx = Math.cos(d.open) * len, dz = -Math.sin(d.open) * len;
        // some leaves are authored mirrored (hinge on the +x jamb): the open leaf is the side whose middle sits farther from the doorway
        const far = (sx: number) => { const [mx, mz] = toWorld(p, ax + sx * dx * 0.5, az + sx * dz * 0.5); return Math.hypot(mx - gd.x, mz - gd.z); };
        const sg = far(1) >= far(-1) ? 1 : -1;
        addCollider({ t: "seg", ax, az, bx: ax + sg * dx, bz: az + sg * dz, thick: 0.14, move: true, shot: false }, p, gi, false, true);
      }
      continue;
    }
    const list = collidersFor(p.k, p.o); if (!list) { unknownKinds.add(p.k); continue; }
    for (const c of list) addCollider(c, p, -1, RAM.has(p.k));
  }
  for (const w of WALLS) {
    if (!w.breakable) continue;
    const [ax, az] = w.pts[0], [bx, bz] = w.pts[1], len = Math.hypot(bx - ax, bz - az), thick = w.kind === "rock" ? 1.1 : w.kind === "stone" ? 0.65 : 0.5;
    const g = addGate({ id: w.id, kind: "break", x: (ax + bx) / 2, z: (az + bz) / 2, nx: -(bz - az) / len, nz: (bx - ax) / len, w: len, hp: w.breakable.hp, persist: w.breakable.persist, reveals: w.breakable.reveals, mat: w.kind, open: false });
    addCollider({ t: "seg", ax, az, bx, bz, thick, move: true, shot: true }, { x: 0, z: 0 }, g);
  }
  { const g = addGate({ id: "vine", kind: "door", x: DOOR.x, z: DOOR.z, nx: Math.sin(DOOR.yaw), nz: Math.cos(DOOR.yaw), w: DOOR.w, locked: "vine_key", mat: "wood", open: false });
    addCollider({ t: "box", x: 0, z: 0, w: DOOR.w + 0.4, d: 0.6, move: true, shot: true }, DOOR, g); }
  // per-cell index + nav raster
  const count = new Int32Array(GW * GH + 1);
  const span = (q: WCol, pad: number, f: (i: number, c: number, r: number) => void) => {
    const c0 = Math.max(0, Math.floor(q.x - q.r - pad - BOUNDS.minX)), c1 = Math.min(GW - 1, Math.floor(q.x + q.r + pad - BOUNDS.minX)), r0 = Math.max(0, Math.floor(q.z - q.r - pad - BOUNDS.minZ)), r1 = Math.min(GH - 1, Math.floor(q.z + q.r + pad - BOUNDS.minZ));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) f(r * GW + c, c, r);
  };
  const touches = (q: WCol, c: number, r: number) => colDist(q, Math.max(c + BOUNDS.minX, Math.min(q.x, c + 1 + BOUNDS.minX)), Math.max(r + BOUNDS.minZ, Math.min(q.z, r + 1 + BOUNDS.minZ))) <= 0.05 || colDist(q, cx(c), cz(r)) <= 0.75;
  for (const q of cols) span(q, 0.1, (i, c, r) => { if (touches(q, c, r)) count[i + 1]++; });
  for (let i = 0; i < GW * GH; i++) count[i + 1] += count[i];
  cellStart = count.slice(); cellItems = new Int32Array(count[GW * GH]); const fill = count.slice();
  cols.forEach((q, k) => span(q, 0.1, (i, c, r) => { if (touches(q, c, r)) { cellItems[fill[i]++] = k; if (q.flags & SHOT) shotAny[i] = 1; } }));
  const mark = (q: WCol, i: number) => { if (q.gate >= 0) { if (gateOf[i] < 0) gateOf[i] = q.gate; } else navStatic[i] = 1; };
  for (const q of cols) {
    if (!(q.flags & MOVE) || q.whenOpen) continue; // open leaves push actors out but leave the nav grid alone
    span(q, PAD, (i, c, r) => { if (colDist(q, cx(c), cz(r)) < PAD) mark(q, i); });
    if (!q.circle) { // a thin wall on a cell boundary still has to be a closed line of cells
      const long = Math.max(q.hx, q.hz), ax = q.hz >= q.hx ? q.s : q.c, az = q.hz >= q.hx ? q.c : -q.s;
      for (let t = -long; t <= long; t += 0.35) { const i = ci(q.x + ax * t, q.z + az * t); if (i >= 0) mark(q, i); }
    }
    if (q.gate < 0) { // corners a diagonal step must not cut (posts, wall ends)
      const c0 = Math.floor(q.x - q.r - 0.4 - BOUNDS.minX), c1 = Math.ceil(q.x + q.r + 0.4 - BOUNDS.minX), r0 = Math.floor(q.z - q.r - 0.4 - BOUNDS.minZ), r1 = Math.ceil(q.z + q.r + 0.4 - BOUNDS.minZ);
      for (let r = Math.max(0, r0); r <= Math.min(GH, r1); r++) for (let c = Math.max(0, c0); c <= Math.min(GW, c1); c++) if (colDist(q, c + BOUNDS.minX, r + BOUNDS.minZ) < 0.35) cornerBlock[r * (GW + 1) + c] = 1;
    }
  }
  for (let i = 0; i < GW * GH; i++) if (navStatic[i]) gateOf[i] = -1;
}
const unknownKinds = new Set<string>(); let scattered = 0;

// ---------------------------------------------------------------- queries
const passable = (i: number) => i >= 0 && cells[i] === OPEN && !navStatic[i] && !navDyn[i] && (gateOf[i] < 0 || gates[gateOf[i]].open);
function blockedAt(i: number, x: number, z: number, flag: number) {
  for (let k = cellStart[i]; k < cellStart[i + 1]; k++) { const q = cols[cellItems[k]]; if (q.flags & flag && active(q) && colDist(q, x, z) <= 0) return q; }
  return null;
}
/** can a point be stood on: inside the outline and not inside anything solid */
export function walkable(x: number, z: number) {
  const i = ci(x, z); if (i < 0 || cells[i] !== OPEN) return false;
  if (blockedAt(i, x, z, MOVE)) return false;
  if (navDyn[i]) for (const b of blockers) if (Math.hypot(x - b.x, z - b.z) < b.r) return false;
  return true;
}
export const isWall = (x: number, z: number) => !walkable(x, z);
/** how far a point is from the nearest solid thing (colliders, crates, the outline), up to 3 u: socket placement checks */
export function clearance(x: number, z: number, crates = true) {
  let d = 3; const c0 = Math.floor(x - BOUNDS.minX), r0 = Math.floor(z - BOUNDS.minZ);
  for (let dr = -3; dr <= 3; dr++) for (let dc = -3; dc <= 3; dc++) {
    const c = c0 + dc, r = r0 + dr; if (c < 0 || r < 0 || c >= GW || r >= GH) continue; const k = r * GW + c;
    if (cells[k] !== OPEN) d = Math.min(d, Math.max(0, Math.hypot(Math.max(0, Math.abs(cx(c) - x) - 0.5), Math.max(0, Math.abs(cz(r) - z) - 0.5))));
    for (let n = cellStart[k]; n < cellStart[k + 1]; n++) { const q = cols[cellItems[n]]; if (q.flags & MOVE && active(q)) d = Math.min(d, colDist(q, x, z)); }
  }
  if (crates) for (const b of blockers) d = Math.min(d, Math.hypot(x - b.x, z - b.z) - b.r);
  return d;
}
/** a closed breakable thing (wall section or boarded door) at or right next to a point */
export function wallAt(x: number, z: number): Gate | null {
  const i = ci(x, z); if (i < 0) return null;
  for (let k = cellStart[i]; k < cellStart[i + 1]; k++) { const q = cols[cellItems[k]]; if (q.gate >= 0) { const g = gates[q.gate]; if (!g.open && g.hp !== undefined && colDist(q, x, z) <= 0.35) return g; } }
  return null;
}
/** a closed door (not the vine door) within reach of a point, for the interact prompt */
export function doorNear(x: number, z: number, reach = 1.7): Gate | null {
  let best: Gate | null = null, bd = reach;
  for (const g of gates) { if (g.kind !== "door" || g.id === "vine") continue; const d = Math.hypot(x - g.x, z - g.z); if (d < bd) { bd = d; best = g; } }
  return best;
}
/** something tall and solid the Sleeper would ram within r of a point */
export function ramAt(x: number, z: number, r: number) {
  const c0 = Math.floor(x - BOUNDS.minX), r0 = Math.floor(z - BOUNDS.minZ);
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    const c = c0 + dc, rr = r0 + dr; if (c < 0 || rr < 0 || c >= GW || rr >= GH) continue; const i = rr * GW + c;
    for (let k = cellStart[i]; k < cellStart[i + 1]; k++) { const q = cols[cellItems[k]]; if (q.flags & RAMF && colDist(q, x, z) < r) return true; }
  }
  return false;
}
const DIRS8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.71, 0.71], [-0.71, 0.71], [0.71, -0.71], [-0.71, -0.71]];
/** push a circle out of everything solid; returns true if it touched something */
export function collide(p: { x: number; z: number }, rad: number) {
  let hit = false;
  for (let it = 0; it < 2; it++) {
    const c0 = Math.floor(p.x - BOUNDS.minX), r0 = Math.floor(p.z - BOUNDS.minZ);
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const c = c0 + dc, r = r0 + dr; if (c < 0 || r < 0 || c >= GW || r >= GH) continue; const i = r * GW + c;
      for (let k = cellStart[i]; k < cellStart[i + 1]; k++) {
        const q = cols[cellItems[k]]; if (!(q.flags & MOVE) || !active(q)) continue;
        const dx = p.x - q.x, dz = p.z - q.z;
        if (q.circle) { const d = Math.hypot(dx, dz), m = rad + q.r; if (d < m && d > 1e-4) { p.x = q.x + (dx / d) * m; p.z = q.z + (dz / d) * m; hit = true; } continue; }
        const lx = dx * q.c - dz * q.s, lz = dx * q.s + dz * q.c, ex = Math.abs(lx) - q.hx, ez = Math.abs(lz) - q.hz;
        if (ex >= rad || ez >= rad) continue;
        let nlx = lx, nlz = lz;
        if (ex <= 0 && ez <= 0) { if (ex > ez) nlx = Math.sign(lx || 1) * (q.hx + rad); else nlz = Math.sign(lz || 1) * (q.hz + rad); } // centre inside: out through the nearest face
        else { const qx = Math.max(-q.hx, Math.min(q.hx, lx)), qz = Math.max(-q.hz, Math.min(q.hz, lz)), d = Math.hypot(lx - qx, lz - qz); if (d >= rad || d < 1e-5) continue; nlx = qx + ((lx - qx) / d) * rad; nlz = qz + ((lz - qz) / d) * rad; }
        p.x = q.x + nlx * q.c + nlz * q.s; p.z = q.z - nlx * q.s + nlz * q.c; hit = true;
      }
    }
  }
  for (const b of blockers) {
    const dx = p.x - b.x, dz = p.z - b.z; if (Math.abs(dx) > 4 || Math.abs(dz) > 4) continue;
    const d = Math.hypot(dx, dz), m = rad + b.r; if (d < m && d > 1e-4) { p.x = b.x + (dx / d) * m; p.z = b.z + (dz / d) * m; hit = true; }
  }
  // the outline itself (the berm, the cliff foot, the waterline)
  for (let it = 0; it < 3; it++) for (const [ox, oz] of DIRS8) { const i = ci(p.x + ox * rad, p.z + oz * rad); if (i < 0 || cells[i] !== OPEN) { p.x -= ox * rad * 0.2; p.z -= oz * rad * 0.2; hit = true; } }
  return hit;
}
/** distance a shot travels before something that stops shots (len if clear). Low cover and open water don't stop it */
export function rayShot(x: number, z: number, dx: number, dz: number, len: number) {
  for (let s = 0.3; s < len; s += 0.2) {
    const px = x + dx * s, pz = z + dz * s, i = ci(px, pz);
    if (i < 0 || cells[i] === VOID) return s;
    if (shotAny[i] && blockedAt(i, px, pz, SHOT)) return s;
    if (navDyn[i]) for (const b of blockers) if (b.shots && Math.hypot(px - b.x, pz - b.z) < b.r) return s;
  }
  return len;
}
export const los = (ax: number, az: number, bx: number, bz: number) => { const d = Math.hypot(bx - ax, bz - az); return d < 0.01 || rayShot(ax, az, (bx - ax) / d, (bz - az) / d, d) >= d - 0.3; };

// ---------------------------------------------------------------- A* with a binary heap
const gScore = new Float32Array(GW * GH), came = new Int32Array(GW * GH), stamp = new Uint32Array(GW * GH), settled = new Uint32Array(GW * GH); let gen = 0;
class Heap { k: number[] = []; v: number[] = []; push(key: number, val: number) { const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val); while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; } k[i] = key; v[i] = val; }
  pop() { const k = this.k, v = this.v, top = v[0], lk = k.pop()!, lv = v.pop()!; if (k.length) { let i = 0; for (;;) { let c = 2 * i + 1; if (c >= k.length) break; if (c + 1 < k.length && k[c + 1] < k[c]) c++; if (k[c] >= lk) break; k[i] = k[c]; v[i] = v[c]; i = c; } k[i] = lk; v[i] = lv; } return top; } get size() { return this.k.length; } }
const DC = [1, -1, 0, 0, 1, 1, -1, -1], DR = [0, 0, 1, -1, 1, -1, 1, -1];
/** shortest walkable route as waypoints (cell centres, string-pulled). Open doors are passable, closed ones are not */
export function path(fx: number, fz: number, tx: number, tz: number, maxNodes = 60000, allow?: (x: number, z: number) => boolean): { x: number; z: number }[] {
  if (isUnder(fx) !== isUnder(tx)) return [];
  let g = ci(tx, tz); const s = ci(fx, fz); if (s < 0 || g < 0) return [];
  if (!passable(g)) { // a blocked goal (a crate, a tree): aim for the nearest open cell within 3 u
    let best = -1, bd = 1e9; const gc0 = g % GW, gr0 = (g / GW) | 0;
    for (let dr = -3; dr <= 3; dr++) for (let dc = -3; dc <= 3; dc++) { const c = gc0 + dc, r = gr0 + dr; if (c < 0 || r < 0 || c >= GW || r >= GH) continue; const d = Math.hypot(cx(c) - tx, cz(r) - tz); if (d <= 3.2 && passable(r * GW + c) && d < bd) { bd = d; best = r * GW + c; } }
    if (best < 0) return []; g = best;
  }
  gen++; const gc = g % GW, gr = (g / GW) | 0, H = (i: number) => { const dx = Math.abs((i % GW) - gc), dz = Math.abs(((i / GW) | 0) - gr); return dx + dz - 0.586 * Math.min(dx, dz); };
  const heap = new Heap(); stamp[s] = gen; gScore[s] = 0; came[s] = -1; heap.push(H(s), s);
  let n = 0, found = s === g;
  while (heap.size && n < maxNodes && !found) {
    const cur = heap.pop(), c = cur % GW, r = (cur / GW) | 0, gcur = gScore[cur];
    if (settled[cur] === gen) continue;
    settled[cur] = gen; n++;
    for (let d = 0; d < 8; d++) {
      const dc = DC[d], dr = DR[d], nc = c + dc, nr = r + dr; if (nc < 0 || nr < 0 || nc >= GW || nr >= GH) continue;
      const ni = nr * GW + nc; if (settled[ni] === gen || !passable(ni) || allow && !allow(cx(nc), cz(nr))) continue;
      if (dc && dr && (!passable(r * GW + nc) || !passable(nr * GW + c) || cornerBlock[(r + (dr > 0 ? 1 : 0)) * (GW + 1) + c + (dc > 0 ? 1 : 0)])) continue;
      const ng = gcur + (dc && dr ? 1.414 : 1);
      if (stamp[ni] !== gen || ng < gScore[ni]) { stamp[ni] = gen; gScore[ni] = ng; came[ni] = cur; if (ni === g) { found = true; break; } heap.push(ng + H(ni), ni); }
    }
  }
  if (!found) return [];
  const out: { x: number; z: number }[] = []; for (let k = g; k !== s && k >= 0; k = came[k]) out.push({ x: cx(k % GW), z: cz((k / GW) | 0) });
  out.reverse();
  const simp: { x: number; z: number }[] = []; let a = { x: fx, z: fz };
  for (let k = 0; k < out.length; k++) { const nxt = out[k + 1]; if (!nxt || !straightWalk(a.x, a.z, nxt.x, nxt.z, allow)) { simp.push(out[k]); a = out[k]; } }
  return simp;
}
/** true if a straight walk from a to b stays on open nav cells and clear of every collider */
export function straightWalk(ax: number, az: number, bx: number, bz: number, allow?: (x: number, z: number) => boolean) {
  const d = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(d / 0.25));
  for (let k = 1; k <= n; k++) { const t = k / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t; if (!passable(ci(x, z)) || !walkable(x, z) || allow && !allow(x, z)) return false; }
  return true;
}
export function pathLength(pts: { x: number; z: number }[], fx: number, fz: number) { let l = 0, x = fx, z = fz; for (const p of pts) { l += Math.hypot(p.x - x, p.z - z); x = p.x; z = p.z; } return l; }

// ---------------------------------------------------------------- lint (level-design skill: validate the critical path's key order, not just connectivity)
/** flood fill from a point, following portals; returns a reachability test */
export function flood(x: number, z: number) {
  const seen = new Uint8Array(GW * GH), q: number[] = []; const push = (i: number) => { if (i >= 0 && !seen[i] && passable(i)) { seen[i] = 1; q.push(i); } };
  push(ci(x, z));
  for (let h = 0; h < q.length; h++) {
    const cur = q[h], c = cur % GW, r = (cur / GW) | 0;
    for (let d = 0; d < 4; d++) { const nc = c + DC[d], nr = r + DR[d]; if (nc >= 0 && nr >= 0 && nc < GW && nr < GH) push(nr * GW + nc); }
    for (const p of PORTALS) { if (!portalOpen(p.id)) continue; if (cur === ci(p.a.x, p.a.z)) push(ci(p.b.x, p.b.z)); if (!p.oneWay && cur === ci(p.b.x, p.b.z)) push(ci(p.a.x, p.a.z)); }
  }
  /** reached, or (for things that are solid themselves: crates) a cell next to it was */
  return (px: number, pz: number, near = 0) => {
    const i = ci(px, pz); if (i < 0) return false; if (seen[i]) return true;
    for (let dr = -near; dr <= near; dr++) for (let dc = -near; dc <= near; dc++) { const k = ci(px + dc, pz + dr); if (k >= 0 && seen[k]) return true; }
    return false;
  };
}
/** Exact reachability for a monkey (radius 0.45) on a 0.25 u lattice, gates as they stand now, overworld only. The nav
 *  raster pads every collider, so a gap a player can squeeze through can still read as closed on the 1 u grid: this is
 *  the check that the demo's route locks really hold (G1.5-13). Slow (a second or two): the lint runs it on request. */
export function exactReach(x0: number, z0: number, rad = 0.45, step = 0.25) {
  const W = Math.ceil((UNDER_X - BOUNDS.minX) / step), H = Math.ceil(GH / step), st = new Uint8Array(W * H); // 1 reached, 2 blocked
  const free = (x: number, z: number) => {
    const i = ci(x, z); if (i < 0 || cells[i] !== OPEN) return false;
    for (const [ox, oz] of DIRS8) { const k = ci(x + ox * rad, z + oz * rad); if (k < 0 || cells[k] !== OPEN) return false; }
    const c0 = Math.floor(x - BOUNDS.minX), r0 = Math.floor(z - BOUNDS.minZ);
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const c = c0 + dc, r = r0 + dr; if (c < 0 || r < 0 || c >= GW || r >= GH) continue; const k = r * GW + c;
      for (let n = cellStart[k]; n < cellStart[k + 1]; n++) { const q = cols[cellItems[n]]; if (q.flags & MOVE && active(q) && colDist(q, x, z) < rad) return false; }
    }
    return true;
  };
  const at = (x: number, z: number) => { const c = Math.round((x - BOUNDS.minX) / step), r = Math.round((z - BOUNDS.minZ) / step); return c < 0 || r < 0 || c >= W || r >= H ? -1 : r * W + c; };
  const q = new Int32Array(W * H), from = new Int32Array(W * H).fill(-1); let n = 0;
  const s0 = at(x0, z0); if (s0 >= 0 && free(x0, z0)) { st[s0] = 1; q[n++] = s0; }
  for (let h = 0; h < n; h++) {
    const cur = q[h], c = cur % W, r = (cur / W) | 0;
    for (let d = 0; d < 4; d++) {
      const nc = c + DC[d], nr = r + DR[d]; if (nc < 0 || nr < 0 || nc >= W || nr >= H) continue; const k = nr * W + nc; if (st[k]) continue;
      if (free(BOUNDS.minX + nc * step, BOUNDS.minZ + nr * step)) { st[k] = 1; from[k] = cur; q[n++] = k; } else st[k] = 2;
    }
  }
  /** reached within r of a point */
  const hit = (px: number, pz: number, r = 0.3) => { for (let dz = -r; dz <= r + 1e-6; dz += step) for (let dx = -r; dx <= r + 1e-6; dx += step) { const k = at(px + dx, pz + dz); if (k >= 0 && st[k] === 1) return k; } return -1; };
  const test = (px: number, pz: number, r = 0.3) => hit(px, pz, r) >= 0;
  /** the lattice route from the start to a reached point, every 2 u (debugging a leak) */
  test.route = (px: number, pz: number) => { const out: [number, number][] = []; let k = hit(px, pz, 0.6), i = 0; while (k >= 0) { if (i++ % 8 === 0) out.push([BOUNDS.minX + (k % W) * step, BOUNDS.minZ + ((k / W) | 0) * step]); k = from[k]; } return out.reverse(); };
  return test;
}
export type LintReport = { errors: string[]; warnings: string[]; stats: Record<string, number>; info?: string[] };
/** reachability + gating + pacing lint. Call after initGrid() and before crates are placed. errors empty = pass.
 *  The demo slice (G1.5-13): what lies past the route locks is parked, not broken. The lint checks the opposite there:
 *  every lock has a reachable near side and an unreachable far side, nothing parked can be reached, and (exact: true)
 *  a monkey can't squeeze past any lock or sealing line at its real radius. */
export function lintReport(o: { exact?: boolean } = {}): LintReport {
  const errors: string[] = [], warnings: string[] = [], info: string[] = [], stats: Record<string, number> = {};
  const saved = gates.map((g) => g.open), saveDyn = navDyn.slice(); navDyn.fill(0);
  const set = (f: (g: Gate) => boolean) => { for (const g of gates) g.open = f(g); };
  const live = (x: number, z: number) => inDemo(x, z); // in the demo: on this side of the locks
  for (const k of unknownKinds) errors.push(`placed kind "${k}" has no collider entry (map/colliders.ts)`);
  // 1) a fresh raid: nothing broken, locked doors shut, plain doors openable. The exits and the key must be reachable.
  set((g) => g.kind === "door" && !g.locked);
  let reach = flood(START.x, START.z);
  if (!walkable(START.x, START.z)) errors.push("the start point is not on open ground");
  if (!reach(POI.hatch.x, POI.hatch.z)) errors.push("hatch unreachable from the start");
  if (DEMO) { if (!reach(POI.coveBoat.x, POI.coveBoat.z)) errors.push("cove boat unreachable on a fresh raid"); }
  else if (!reach(POI.raft.x, POI.raft.z)) errors.push("raft unreachable on a fresh raid");
  const key = CRATES.find((c) => c.fixed === "key")!; if (!reach(key.x, key.z, 2)) errors.push("key crate needs the key (soft-lock)");
  for (const g of gates) {
    if (g.open) continue;
    if (!live(g.x, g.z)) continue; // a parked door: the north side of the locks
    const side = (k: number) => reach(g.x + g.nx * 1.6 * k, g.z + g.nz * 1.6 * k) || reach(g.x + g.nx * 2.4 * k, g.z + g.nz * 2.4 * k);
    const a = side(1), b = side(-1);
    if (!a && !b) errors.push(`${g.kind === "break" ? "breakable" : "locked/boarded door"} ${g.id} can't be reached to open it`);
    if (a && b && g.kind === "break" && !SHORTCUTS.has(g.id)) warnings.push(`breakable ${g.id} gates nothing (both sides already reachable)`);
  }
  // what must stay gated until its gate opens
  for (const [fixed, name] of [["vault", "vault crate"], ["secret", "shrine crate"]] as const) { const c = CRATES.find((q) => q.fixed === fixed)!; if (reach(c.x, c.z, 2)) errors.push(`${name} is reachable without opening its gate`); }
  if (reach(POI.tunnelExit.x, POI.tunnelExit.z)) errors.push("tunnel exit is reachable without breaking the rubble");
  // 2) everything open: every live socket on open ground and reachable; every parked one out of reach (the locks hold)
  set(() => true); reach = flood(START.x, START.z);
  type Pnt = [string, number, number, number];
  const all: Pnt[] = [["raft", POI.raft.x, POI.raft.z, 0], ["tunnelExit", POI.tunnelExit.x, POI.tunnelExit.z, 0], ["hatch", POI.hatch.x, POI.hatch.z, 0], ["coveBoat", POI.coveBoat.x, POI.coveBoat.z, 0],
    ...CRATES.map((c, i) => [`crate${i}(${c.x},${c.z})`, c.x, c.z, 2] as Pnt),
    ...CONTAINER_SOCKETS.map((c) => [`${c.type}:${c.id}(${c.x},${c.z})`, c.x, c.z, 2] as Pnt),
    ...SPAWNS.flatMap((set_, si) => set_.map((s, i) => [`${s.kind}${si}.${i}(${s.x},${s.z})`, s.x, s.z, 0] as Pnt)),
    ...PORTALS.filter((p) => portalOpen(p.id)).flatMap((p) => [[`${p.id}.a`, p.a.x, p.a.z, 0], [`${p.id}.b`, p.b.x, p.b.z, 0]] as Pnt[]),
    ...ZIPLINES.flatMap((zl) => [[`zip-${zl.id}.from`, zl.from.x, zl.from.z + 3.2, 0], [`zip-${zl.id}.to`, zl.to.x, zl.to.z + 1.6, 0]] as Pnt[]),
    ...SUPPLY_DROPS.map((d) => [`drop(${d.x},${d.z})`, d.x, d.z, 0] as Pnt)];
  let parked = 0;
  for (const [name, x, z, near] of all) {
    if (DEMO && !live(x, z)) { parked++; if (reach(x, z, near)) errors.push(`${name} is past the route locks but reachable (a leak)`); continue; }
    if (!near && !walkable(x, z)) errors.push(`${name} not on open ground`); else if (!reach(x, z, near)) errors.push(`${name} unreachable`);
  }
  stats.parked = parked;
  for (const c of [...CRATES, ...CONTAINER_SOCKETS]) { if (!live(c.x, c.z)) continue; const i = ci(c.x, c.z); if (i < 0 || cells[i] !== OPEN) errors.push(`crate (${c.x},${c.z}) is outside the map`); else if (blockedAt(i, c.x, c.z, MOVE)) warnings.push(`crate (${c.x},${c.z}) sits inside a collider`); }
  for (const g of gates) { if (!live(g.x, g.z)) continue; if (!reach(g.x + g.nx * 1.5, g.z + g.nz * 1.5, 1) || !reach(g.x - g.nx * 1.5, g.z - g.nz * 1.5, 1)) errors.push(`gate ${g.id}: one side is unreachable even when open`); }
  for (const g of gates) if (!passable(ci(g.x, g.z))) errors.push(`gate ${g.id}: its doorway cell is not passable when open (wall on a cell boundary?)`);
  // 2b) the route locks: the near side reachable, the far side not (the lead's map shows these as "route closed")
  for (const l of ROUTE_LOCKS) {
    if (!reach(l.inside[0], l.inside[1], 1)) errors.push(`route lock ${l.id}: its near side (${l.inside}) is unreachable`);
    if (reach(l.beyond[0], l.beyond[1], 1)) errors.push(`route lock ${l.id}: its far side (${l.beyond}) is reachable (the lock leaks)`);
  }
  for (const [x, z] of SEAL_PROBES) if (walkable(x, z) && reach(x, z)) errors.push(`sealing line leaks: (${x.toFixed(1)}, ${z.toFixed(1)}) is reachable`);
  if (o.exact && DEMO) { // the same at the monkey's real radius, gates open (the worst case)
    const t0 = performance.now(), ex = exactReach(START.x, START.z);
    for (const l of ROUTE_LOCKS) if (!l.under && ex(l.beyond[0], l.beyond[1], 0.6)) errors.push(`route lock ${l.id}: a monkey can squeeze past it (exact, radius 0.45)`);
    let leaks = 0; for (const [x, z] of SEAL_PROBES) if (ex(x, z)) { if (leaks++ < 6) errors.push(`sealing line leaks at the monkey's radius: (${x.toFixed(1)}, ${z.toFixed(1)})`); }
    for (const [name, x, z] of all) if (!live(x, z) && x < UNDER_X && ex(x, z, 1.5)) errors.push(`${name} is past the route locks but a monkey can reach it (exact)`);
    stats.exactMs = Math.round(performance.now() - t0);
  }
  // 3) time budget: the straight runs (walk speed 4.6 u/s, no looting, no fights)
  set((g) => g.kind === "door" && !g.locked);
  const run = (name: string, x: number, z: number, lo: number, hi: number) => {
    const p = path(START.x, START.z, x, z, 200000), l = pathLength(p, START.x, START.z); stats[name] = Math.round(l);
    if (!p.length) errors.push(`no path to ${name}`); else if (l < lo || l > hi) warnings.push(`${name} is ${Math.round(l)} u from the start (budget ${lo}-${hi} u)`);
  };
  if (DEMO) { // the slice: the cove boat a detour from the beach, the key and the foreman deep enough to cost a few minutes
    run("coveBoat", POI.coveBoat.x, POI.coveBoat.z, 70, 140); run("keyCrate", key.x, key.z, 100, 200); run("boss", POI.boss.x, POI.boss.z + 8, 35, 90); run("plantation", POI.vat.x + 3, POI.vat.z + 3, 55, 150);
  } else { run("raft", POI.raft.x, POI.raft.z, 190, 330); run("keyCrate", key.x, key.z, 100, 220); run("sleeper", POI.sleeperBed.x, POI.sleeperBed.z + 3, 130, 260); }
  const sockets = [...CRATES, ...CONTAINER_SOCKETS].filter((c) => live(c.x, c.z));
  const firstCrate = Math.min(...sockets.map((c) => Math.hypot(c.x - START.x, c.z - START.z))); stats.nearestCrate = Math.round(firstCrate);
  // 22 u: the checkpoint hut's weapon rack is 23 u out in a straight line, but behind the first guard and the gate
  if (firstCrate < 22) warnings.push(`a crate sits ${Math.round(firstCrate)} u from the start (nothing worth having next to spawn)`);
  // 4) rule 9: along every road, something to react to at least every 28 u (6 s at walk speed)
  const events: [number, number][] = [...sockets.map((c) => [c.x, c.z] as [number, number]), ...SPAWNS.flat().map((s) => [s.x, s.z] as [number, number]),
    ...PLACED.filter((p) => !SOFT.has(p.k)).map((p) => [p.x, p.z] as [number, number]), ...gates.map((g) => [g.x, g.z] as [number, number])];
  let worst = 0;
  for (const r of ROADS) {
    let gap = 0, gapMax = 0;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1], len = Math.hypot(bx - ax, bz - az);
      for (let s = 0; s < len; s += 2) { const x = ax + (bx - ax) * (s / len), z = az + (bz - az) * (s / len); if (!live(x, z)) { gap = 0; continue; } if (events.some(([ex, ez]) => Math.abs(ex - x) < 7.5 && Math.hypot(ex - x, ez - z) < 7.5)) gap = 0; else gap += 2; gapMax = Math.max(gapMax, gap); }
    }
    worst = Math.max(worst, gapMax); if (gapMax > 28) warnings.push(`road ${r.id}: ${gapMax} u with nothing on it (rule 9: 18-28 u)`);
  }
  stats.worstRoadGap = worst; stats.colliders = cols.length; stats.gates = gates.length; stats.placed = PLACED.length; stats.scattered = scattered;
  stats.openCells = cells.reduce((a, v, i) => a + (v === OPEN && !navStatic[i] ? 1 : 0), 0);
  stats.routeLocks = ROUTE_LOCKS.length; stats.sealProbes = SEAL_PROBES.length;
  if (DEMO) info.push(`demo slice: ${ROUTE_LOCKS.length} route locks (${ROUTE_LOCKS.map((l) => l.id).join(", ")}), ${parked} sockets/spawns/marks parked past them`);
  gates.forEach((g, i) => (g.open = saved[i])); navDyn.set(saveDyn);
  return { errors, warnings, stats, info };
}
/** breakables that are shortcuts between two reachable places, not gates to somewhere new */
const SHORTCUTS = new Set(["palisade"]);
/** placed kinds too small to count as "something on the road" */
const SOFT = new Set(["bush", "fern", "bigleaf", "flowers", "reeds", "lily", "beachgrass", "litter", "rocks", "pebbles", "shells", "banana", "tree", "palm", "palmlean", "mangrove", "rockl", "boulders", "boardwalk_a", "boardwalk_b"]);
export const lint = () => lintReport().errors;
export const gridInfo = () => ({ GW, GH, open: cells.reduce((a, v) => a + (v === OPEN ? 1 : 0), 0), colliders: cols.length, gates: gates.length });
/** raw data for debug overlays and the blockout dump */
export const debugGrid = () => ({ cells, navStatic, gateOf, cols, zoneOf, minX: BOUNDS.minX, minZ: BOUNDS.minZ });
