// 1 u walk/shot grid rasterized from layout shapes, plus circle blockers for trees, rocks and props.
// Gives collision push-out, A* paths (8-way), line of sight for shots and AI, and a reachability lint.
import { CLEARINGS, TRAILS, VAULT_TRAIL, BOUNDS, DOOR, CRATES, SPAWNS, POI, type Trail } from "./layout";
import { fbm } from "./noise";

const CELL = 1;
export const GW = Math.ceil((BOUNDS.maxX - BOUNDS.minX) / CELL), GH = Math.ceil((BOUNDS.maxZ - BOUNDS.minZ) / CELL);
/** 0 = jungle wall, 1 = open, 2 = blocked by a prop (blocks move; shots per shotBlock), 3 = door (open when doorOpen) */
const cells = new Uint8Array(GW * GH);
const shotBlock = new Uint8Array(GW * GH);
export let doorOpen = false;
export const setDoorOpen = (v: boolean) => { doorOpen = v; };
const ci = (x: number, z: number) => { const c = Math.floor((x - BOUNDS.minX) / CELL), r = Math.floor((z - BOUNDS.minZ) / CELL); return c < 0 || r < 0 || c >= GW || r >= GH ? -1 : r * GW + c; };
const cx = (c: number) => BOUNDS.minX + (c + 0.5) * CELL, cz = (r: number) => BOUNDS.minZ + (r + 0.5) * CELL;

export function segDist(x: number, z: number, ax: number, az: number, bx: number, bz: number) {
  const abx = bx - ax, abz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * abx + (z - az) * abz) / (abx * abx + abz * abz || 1)));
  return Math.hypot(x - ax - abx * t, z - az - abz * t);
}
export const trailDist = (t: Trail, x: number, z: number) => { let d = 1e9; for (let i = 0; i < t.pts.length - 1; i++) d = Math.min(d, segDist(x, z, ...t.pts[i], ...t.pts[i + 1])); return d; };
/** signed "openness": > 0 inside the play space; used by the terrain and dressing too */
export function openness(x: number, z: number, withVault = true) {
  const wob = (fbm(x * 0.18 + 40, z * 0.18) - 0.5) * 2.2;
  let o = -1e9;
  for (const c of CLEARINGS) { if (!withVault && c.id === "vault") continue; const e = Math.hypot((x - c.x) / c.rx, (z - c.z) / c.rz); o = Math.max(o, (1 - e) * Math.min(c.rx, c.rz) + wob); }
  for (const t of withVault ? [...TRAILS, VAULT_TRAIL] : TRAILS) o = Math.max(o, t.w / 2 - trailDist(t, x, z) + wob * 0.35);
  return o;
}
export function nearestTrailDist(x: number, z: number) { let d = 1e9; for (const t of [...TRAILS, VAULT_TRAIL]) d = Math.min(d, trailDist(t, x, z)); return d; }

for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) cells[r * GW + c] = openness(cx(c), cz(r)) > 0 ? 1 : 0;
{ // the vine door: a band across the vault trail
  const dx = Math.cos(DOOR.yaw), dz = Math.sin(DOOR.yaw);
  for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) {
    const x = cx(c) - DOOR.x, z = cz(r) - DOOR.z, along = x * dx + z * dz, across = -x * dz + z * dx;
    if (Math.abs(along) < DOOR.w / 2 + 1.5 && Math.abs(across) < 0.8 && cells[r * GW + c]) cells[r * GW + c] = 3;
  }
}
export type Blocker = { x: number; z: number; r: number; shots: boolean; ram?: boolean };
export const blockers: Blocker[] = [];
/** register a solid prop (tree, rock, crate). ram = the Sleeper stops on it */
export function block(x: number, z: number, r: number, shots = true, ram = false) {
  blockers.push({ x, z, r, shots, ram });
  for (let gz = Math.floor(z - r - 1); gz <= z + r + 1; gz++) for (let gx = Math.floor(x - r - 1); gx <= x + r + 1; gx++) {
    const i = ci(gx + 0.5, gz + 0.5); if (i < 0) continue;
    if (Math.hypot(gx + 0.5 - x, gz + 0.5 - z) < r + 0.2) { if (cells[i] === 1) cells[i] = 2; if (shots) shotBlock[i] = 1; }
  }
}
export function unblock(b: Blocker) { const k = blockers.indexOf(b); if (k >= 0) blockers.splice(k, 1); }
const open = (i: number) => i >= 0 && (cells[i] === 1 || (cells[i] === 3 && doorOpen));
export const walkable = (x: number, z: number) => open(ci(x, z));
export const isWall = (x: number, z: number) => { const i = ci(x, z); return i < 0 || cells[i] === 0 || (cells[i] === 3 && !doorOpen); };

/** push a circle out of walls and blockers; returns true if it touched something */
export function collide(p: { x: number; z: number }, rad: number) {
  let hit = false;
  for (const b of blockers) {
    const dx = p.x - b.x, dz = p.z - b.z, d = Math.hypot(dx, dz), m = rad + b.r;
    if (d < m && d > 1e-4) { p.x = b.x + (dx / d) * m; p.z = b.z + (dz / d) * m; hit = true; }
  }
  for (let it = 0; it < 2; it++) for (const [ox, oz] of [[rad, 0], [-rad, 0], [0, rad], [0, -rad], [rad * 0.7, rad * 0.7], [-rad * 0.7, rad * 0.7], [rad * 0.7, -rad * 0.7], [-rad * 0.7, -rad * 0.7]]) {
    if (isWall(p.x + ox, p.z + oz)) { p.x -= ox * 0.18; p.z -= oz * 0.18; hit = true; }
  }
  return hit;
}
/** first blocker/wall hit along a shot; returns the travel distance (or len if clear) */
export function rayShot(x: number, z: number, dx: number, dz: number, len: number) {
  for (let s = 0.3; s < len; s += 0.25) {
    const px = x + dx * s, pz = z + dz * s, i = ci(px, pz);
    if (i < 0 || cells[i] === 0 || (cells[i] === 3 && !doorOpen)) return s;
    if (shotBlock[i]) for (const b of blockers) if (b.shots && Math.hypot(px - b.x, pz - b.z) < b.r) return s;
  }
  return len;
}
export const los = (ax: number, az: number, bx: number, bz: number) => { const d = Math.hypot(bx - ax, bz - az); return rayShot(ax, az, (bx - ax) / d, (bz - az) / d, d) >= d - 0.3; };

/** A* on the grid, 8-way, no corner cutting; returns waypoints (cell centres), simplified */
export function path(fx: number, fz: number, tx: number, tz: number, maxNodes = 6000): { x: number; z: number }[] {
  const s = ci(fx, fz), g = ci(tx, tz); if (s < 0 || g < 0) return [];
  if (!open(g)) return [];
  const gc = g % GW, gr = Math.floor(g / GW), H = (i: number) => Math.hypot((i % GW) - gc, Math.floor(i / GW) - gr);
  const gs = new Map<number, number>([[s, 0]]), from = new Map<number, number>(), heap: [number, number][] = [[H(s), s]], closed = new Set<number>();
  let n = 0;
  while (heap.length && n++ < maxNodes) {
    let bi = 0; for (let k = 1; k < heap.length; k++) if (heap[k][0] < heap[bi][0]) bi = k;
    const [, cur] = heap.splice(bi, 1)[0]; if (cur === g) break; if (closed.has(cur)) continue; closed.add(cur);
    const c = cur % GW, r = Math.floor(cur / GW);
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nc = c + dc, nr = r + dr; if (nc < 0 || nr < 0 || nc >= GW || nr >= GH) continue;
      const ni = nr * GW + nc; if (!open(ni) && ni !== g) continue;
      if (dc && dr && (!open(r * GW + nc) || !open(nr * GW + c))) continue;
      const ng = gs.get(cur)! + (dc && dr ? 1.414 : 1);
      if (ng < (gs.get(ni) ?? 1e9)) { gs.set(ni, ng); from.set(ni, cur); heap.push([ng + H(ni), ni]); }
    }
  }
  if (!from.has(g) && s !== g) return [];
  const out: { x: number; z: number }[] = []; for (let k = g; k !== s; k = from.get(k)!) out.push({ x: cx(k % GW), z: cz(Math.floor(k / GW)) });
  out.reverse();
  // string-pull: drop waypoints we can walk straight past
  const simp: { x: number; z: number }[] = []; let a = { x: fx, z: fz };
  for (let k = 0; k < out.length; k++) { const nxt = out[k + 1]; if (!nxt || !straight(a.x, a.z, nxt.x, nxt.z)) { simp.push(out[k]); a = out[k]; } }
  return simp;
}
function straight(ax: number, az: number, bx: number, bz: number) { const d = Math.hypot(bx - ax, bz - az); for (let s = 0; s < d; s += 0.5) { const t = s / d; if (!walkable(ax + (bx - ax) * t, az + (bz - az) * t)) return false; } return true; }

/** reachability lint (the mapcheck for shape maps): every crate, spawn and exit must be reachable from the hatch */
export function lint() {
  const errs: string[] = [], was = doorOpen; doorOpen = true;
  const pts: [string, number, number][] = [["raft", POI.raft.x, POI.raft.z], ...CRATES.map((c, i) => [`crate${i}`, c.x, c.z] as [string, number, number]), ...SPAWNS.flat().map((s, i) => [`${s.kind}${i}`, s.x, s.z] as [string, number, number])];
  for (const [name, x, z] of pts) { if (!walkable(x, z)) { errs.push(`${name} at ${x},${z} is not on open ground`); continue; } if (path(POI.hatch.x, POI.hatch.z, x, z, 40000).length === 0) errs.push(`${name} unreachable`); }
  doorOpen = was; return errs;
}
export const gridInfo = () => ({ GW, GH, open: cells.reduce((a, v) => a + (v ? 1 : 0), 0) });
