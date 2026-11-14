// 1 u walk/shot grid rasterized from layout shapes: clearings + trails are open, walls block, breakable walls open
// when broken, the vine door opens with the key, props add circle blockers. Gives collision push-out, A* (8-way,
// binary heap), line of sight, and a lint that checks reachability and gating order (level-design skill: validate the
// critical path's key order, not just connectivity).
import { CLEARINGS, TRAILS, VAULT_TRAIL, BOUNDS, DOOR, CRATES, SPAWNS, POI, WALLS, PORTALS, type Trail } from "./layout";
import { fbm } from "./noise";

export const GW = BOUNDS.maxX - BOUNDS.minX, GH = BOUNDS.maxZ - BOUNDS.minZ;
const JUNGLE = 0, OPEN = 1, PROP = 2, DOORC = 3, WALL = 4, BREAK = 5;
const cells = new Uint8Array(GW * GH);
const wallOf = new Int16Array(GW * GH).fill(-1);   // index into WALLS for wall/breakable cells
const shotBlock = new Uint8Array(GW * GH);
export const state = { doorOpen: false, broken: new Set<string>() };
export const setDoorOpen = (v: boolean) => { state.doorOpen = v; };
export const breakWall = (id: string) => { state.broken.add(id); };
const ci = (x: number, z: number) => { const c = Math.floor(x - BOUNDS.minX), r = Math.floor(z - BOUNDS.minZ); return c < 0 || r < 0 || c >= GW || r >= GH ? -1 : r * GW + c; };
const cx = (c: number) => BOUNDS.minX + c + 0.5, cz = (r: number) => BOUNDS.minZ + r + 0.5;

export function segDist(x: number, z: number, ax: number, az: number, bx: number, bz: number) {
  const abx = bx - ax, abz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * abx + (z - az) * abz) / (abx * abx + abz * abz || 1)));
  return Math.hypot(x - ax - abx * t, z - az - abz * t);
}
export const trailDist = (t: Trail, x: number, z: number) => { let d = 1e9; for (let i = 0; i < t.pts.length - 1; i++) d = Math.min(d, segDist(x, z, ...t.pts[i], ...t.pts[i + 1])); return d; };
const ALL_TRAILS = [...TRAILS, VAULT_TRAIL];
/** signed openness: > 0 inside the play space (the terrain and dressing use it too) */
export function openness(x: number, z: number) {
  const wob = (fbm(x * 0.18 + 40, z * 0.18) - 0.5) * 2.2, lobe = (fbm(x * 0.07 - 13, z * 0.07 + 5) - 0.5) * 7.5; // small ragged edge + big lobes
  let o = -1e9;
  for (const c of CLEARINGS) { const e = Math.hypot((x - c.x) / c.rx, (z - c.z) / c.rz); if (e < 2) o = Math.max(o, (1 - e) * Math.min(c.rx, c.rz) + wob + (c.under || c.rx < 6 ? lobe * 0.25 : lobe)); }
  for (const t of ALL_TRAILS) o = Math.max(o, t.w / 2 - trailDist(t, x, z) + wob * 0.35);
  return o;
}
export const nearestTrailDist = (x: number, z: number) => { let d = 1e9; for (const t of ALL_TRAILS) d = Math.min(d, trailDist(t, x, z)); return d; };
/** which clearing/area a point is in (or the nearest trail's area); "" if none */
export function areaAt(x: number, z: number) { let best = "", bd = 1.15; for (const c of CLEARINGS) { const e = Math.hypot((x - c.x) / c.rx, (z - c.z) / c.rz); if (e < bd) { bd = e; best = c.id; } } return best; }
export const isUnder = (x: number) => x > 90;

for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) cells[r * GW + c] = openness(cx(c), cz(r)) > 0 ? OPEN : JUNGLE;
WALLS.forEach((w, wi) => {
  for (let k = 0; k < w.pts.length - 1; k++) {
    const [ax, az] = w.pts[k], [bx, bz] = w.pts[k + 1], len = Math.hypot(bx - ax, bz - az);
    for (let s = 0; s <= len; s += 0.25) for (const o of [-0.45, 0, 0.45]) {
      const nx = -(bz - az) / len, nz = (bx - ax) / len, x = ax + (bx - ax) * (s / len) + nx * o, z = az + (bz - az) * (s / len) + nz * o, i = ci(x, z);
      if (i >= 0) { cells[i] = w.breakable ? BREAK : WALL; wallOf[i] = wi; shotBlock[i] = 1; }
    }
  }
});
{ // the vine door: a band across the vault trail
  const dx = Math.cos(DOOR.yaw), dz = Math.sin(DOOR.yaw);
  for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) {
    const x = cx(c) - DOOR.x, z = cz(r) - DOOR.z; if (Math.abs(x) > 4 || Math.abs(z) > 4) continue;
    const along = x * dx + z * dz, across = -x * dz + z * dx;
    if (Math.abs(along) < DOOR.w / 2 + 1.5 && Math.abs(across) < 0.8 && cells[r * GW + c] === OPEN) cells[r * GW + c] = DOORC;
  }
}
export type Blocker = { x: number; z: number; r: number; shots: boolean; ram?: boolean; id?: string };
export const blockers: Blocker[] = [];
/** register a solid prop (tree, rock, crate). ram = the Sleeper stops on it */
export function block(x: number, z: number, r: number, shots = true, ram = false, id?: string) {
  const b = { x, z, r, shots, ram, id }; blockers.push(b);
  for (let gz = Math.floor(z - r - 1); gz <= z + r + 1; gz++) for (let gx = Math.floor(x - r - 1); gx <= x + r + 1; gx++) {
    const i = ci(gx + 0.5, gz + 0.5); if (i < 0) continue;
    if (Math.hypot(gx + 0.5 - x, gz + 0.5 - z) < r + 0.2) { if (cells[i] === OPEN) cells[i] = PROP; if (shots) shotBlock[i] = 1; }
  }
  return b;
}
const passable = (i: number) => {
  if (i < 0) return false; const v = cells[i];
  return v === OPEN || (v === DOORC && state.doorOpen) || (v === BREAK && state.broken.has(WALLS[wallOf[i]].id));
};
export const walkable = (x: number, z: number) => passable(ci(x, z));
/** the breakable wall id at a point, if it's still standing */
export function wallAt(x: number, z: number) { const i = ci(x, z); if (i < 0 || cells[i] !== BREAK) return null; const w = WALLS[wallOf[i]]; return state.broken.has(w.id) ? null : w; }
const solidCell = (i: number) => i < 0 || cells[i] === JUNGLE || cells[i] === WALL || (cells[i] === DOORC && !state.doorOpen) || (cells[i] === BREAK && !state.broken.has(WALLS[wallOf[i]].id));
export const isWall = (x: number, z: number) => solidCell(ci(x, z));

/** push a circle out of walls and blockers; returns true if it touched something */
export function collide(p: { x: number; z: number }, rad: number) {
  let hit = false;
  for (const b of blockers) {
    const dx = p.x - b.x, dz = p.z - b.z; if (Math.abs(dx) > 4 || Math.abs(dz) > 4) continue;
    const d = Math.hypot(dx, dz), m = rad + b.r;
    if (d < m && d > 1e-4) { p.x = b.x + (dx / d) * m; p.z = b.z + (dz / d) * m; hit = true; }
  }
  for (let it = 0; it < 3; it++) for (const [ox, oz] of DIRS8) if (isWall(p.x + ox * rad, p.z + oz * rad)) { p.x -= ox * rad * 0.2; p.z -= oz * rad * 0.2; hit = true; }
  return hit;
}
const DIRS8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.71, 0.71], [-0.71, 0.71], [0.71, -0.71], [-0.71, -0.71]];
/** distance a shot travels before a wall or shot-blocking prop (len if clear) */
export function rayShot(x: number, z: number, dx: number, dz: number, len: number) {
  for (let s = 0.3; s < len; s += 0.25) {
    const px = x + dx * s, pz = z + dz * s, i = ci(px, pz);
    if (solidCell(i)) return s;
    if (shotBlock[i] && cells[i] === PROP) for (const b of blockers) if (b.shots && Math.abs(px - b.x) < 3 && Math.hypot(px - b.x, pz - b.z) < b.r) return s;
  }
  return len;
}
export const los = (ax: number, az: number, bx: number, bz: number) => { const d = Math.hypot(bx - ax, bz - az); return d < 0.01 || rayShot(ax, az, (bx - ax) / d, (bz - az) / d, d) >= d - 0.3; };

// ---- A* with a binary heap
const gScore = new Float32Array(GW * GH), came = new Int32Array(GW * GH), stamp = new Uint32Array(GW * GH); let gen = 0;
class Heap { k: number[] = []; v: number[] = []; push(key: number, val: number) { const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val); while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; } k[i] = key; v[i] = val; }
  pop() { const k = this.k, v = this.v, top = v[0], lk = k.pop()!, lv = v.pop()!; if (k.length) { let i = 0; for (;;) { let c = 2 * i + 1; if (c >= k.length) break; if (c + 1 < k.length && k[c + 1] < k[c]) c++; if (k[c] >= lk) break; k[i] = k[c]; v[i] = v[c]; i = c; } k[i] = lk; v[i] = lv; } return top; } get size() { return this.k.length; } }
export function path(fx: number, fz: number, tx: number, tz: number, maxNodes = 30000): { x: number; z: number }[] {
  const s = ci(fx, fz), g = ci(tx, tz); if (s < 0 || g < 0 || !passable(g)) return [];
  gen++; const gc = g % GW, gr = (g / GW) | 0, H = (i: number) => { const dx = Math.abs((i % GW) - gc), dz = Math.abs(((i / GW) | 0) - gr); return dx + dz - 0.586 * Math.min(dx, dz); };
  const heap = new Heap(); stamp[s] = gen; gScore[s] = 0; came[s] = -1; heap.push(H(s), s);
  let n = 0, found = s === g;
  while (heap.size && n++ < maxNodes && !found) {
    const cur = heap.pop(), c = cur % GW, r = (cur / GW) | 0, gcur = gScore[cur];
    for (let d = 0; d < 8; d++) {
      const dc = DC[d], dr = DR[d], nc = c + dc, nr = r + dr; if (nc < 0 || nr < 0 || nc >= GW || nr >= GH) continue;
      const ni = nr * GW + nc; if (!passable(ni)) continue;
      if (dc && dr && (!passable(r * GW + nc) || !passable(nr * GW + c))) continue;
      const ng = gcur + (dc && dr ? 1.414 : 1);
      if (stamp[ni] !== gen || ng < gScore[ni]) { stamp[ni] = gen; gScore[ni] = ng; came[ni] = cur; if (ni === g) { found = true; break; } heap.push(ng + H(ni), ni); }
    }
  }
  if (!found) return [];
  const out: { x: number; z: number }[] = []; for (let k = g; k !== s && k >= 0; k = came[k]) out.push({ x: cx(k % GW), z: cz((k / GW) | 0) });
  out.reverse();
  const simp: { x: number; z: number }[] = []; let a = { x: fx, z: fz };
  for (let k = 0; k < out.length; k++) { const nxt = out[k + 1]; if (!nxt || !straight(a.x, a.z, nxt.x, nxt.z)) { simp.push(out[k]); a = out[k]; } }
  return simp;
}
const DC = [1, -1, 0, 0, 1, 1, -1, -1], DR = [0, 0, 1, -1, 1, -1, 1, -1];
function straight(ax: number, az: number, bx: number, bz: number) { const d = Math.hypot(bx - ax, bz - az); for (let s = 0; s < d; s += 0.5) { const t = s / d; if (!walkable(ax + (bx - ax) * t, az + (bz - az) * t)) return false; } return true; }

/** flood fill from a point, following portals; returns a reachability test */
function flood(x: number, z: number) {
  const seen = new Uint8Array(GW * GH), q: number[] = []; const push = (i: number) => { if (i >= 0 && !seen[i] && passable(i)) { seen[i] = 1; q.push(i); } };
  push(ci(x, z));
  for (let h = 0; h < q.length; h++) {
    const cur = q[h], c = cur % GW, r = (cur / GW) | 0;
    for (let d = 0; d < 4; d++) { const nc = c + DC[d], nr = r + DR[d]; if (nc >= 0 && nr >= 0 && nc < GW && nr < GH) push(nr * GW + nc); }
    for (const p of PORTALS) { if (cur === ci(p.a.x, p.a.z)) push(ci(p.b.x, p.b.z)); if (!p.oneWay && cur === ci(p.b.x, p.b.z)) push(ci(p.a.x, p.a.z)); }
  }
  return (px: number, pz: number) => { const i = ci(px, pz); return i >= 0 && !!seen[i]; };
}
/** reachability + gating lint; call before props are placed. Returns a list of problems (empty = pass). */
export function lint() {
  const errs: string[] = [], save = { door: state.doorOpen, broken: new Set(state.broken) };
  const H = POI.hatch;
  // 1) a fresh raid: nothing broken, door shut. The raft and the key must be reachable (no soft-lock on the critical path).
  state.doorOpen = false; state.broken.clear();
  let reach = flood(H.x, H.z);
  if (!reach(POI.raft.x, POI.raft.z)) errs.push("raft unreachable on a fresh raid");
  const key = CRATES.find((c) => c.fixed === "key")!; if (!reach(key.x, key.z)) errs.push("key crate needs the key (soft-lock)");
  for (const w of WALLS) if (w.breakable) { const [ax, az] = w.pts[0], [bx, bz] = w.pts[1], mx = (ax + bx) / 2, mz = (az + bz) / 2, l = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / l * 1.3, nz = (bx - ax) / l * 1.3;
    if (!reach(mx + nx, mz + nz) && !reach(mx - nx, mz - nz)) errs.push(`breakable ${w.id} can't be reached to break it`); }
  // 2) everything open: every crate, spawn, portal and exit reachable
  state.doorOpen = true; for (const w of WALLS) if (w.breakable) state.broken.add(w.id);
  reach = flood(H.x, H.z);
  const pts: [string, number, number][] = [["raft", POI.raft.x, POI.raft.z], ["tunnelExit", POI.tunnelExit.x, POI.tunnelExit.z],
    ...CRATES.map((c, i) => [`crate${i}(${c.x},${c.z})`, c.x, c.z] as [string, number, number]), ...SPAWNS.flat().map((s, i) => [`${s.kind}${i}(${s.x},${s.z})`, s.x, s.z] as [string, number, number]),
    ...PORTALS.flatMap((p) => [[`${p.id}.a`, p.a.x, p.a.z], [`${p.id}.b`, p.b.x, p.b.z]] as [string, number, number][])];
  for (const [name, x, z] of pts) { if (!walkable(x, z)) errs.push(`${name} not on open ground`); else if (!reach(x, z)) errs.push(`${name} unreachable`); }
  state.doorOpen = save.door; state.broken = save.broken;
  return errs;
}
export const gridInfo = () => ({ GW, GH, open: cells.reduce((a, v) => a + (v === OPEN ? 1 : 0), 0) });
