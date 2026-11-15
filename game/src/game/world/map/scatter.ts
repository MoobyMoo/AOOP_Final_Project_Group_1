// Rule-based scatter inside the map (G1_BRIEF "Map v3" rule 4): each area has its hand-placed hero composition in
// grove.ts; this fills the ground around it per biome (foliage, rocks, litter), kept out of colliders, doorways,
// sockets and roads. It is pure data: the result is more Placed pieces, so their colliders go into the grid and the
// lint checks the map with them in. Seeded (mulberry32): the same world seed always grows the same island.
import type { Placed } from "../../contracts";
import { PLACED, CRATES, SPAWNS, PORTALS, POI, ZIPLINES, SUPPLY_DROPS, START, WALLS, DOOR, BOUNDS, UNDER_X, LANDMARKS } from "./grove";
import type { Biome } from "./types";
import { collidersFor, pinVariant } from "./colliders";
import { edgeDist, zoneAt, roadDist } from "../grid";
import { fbm } from "../noise";
import { mulberry32 } from "../../loot/tables";

/** [kind, weight, min scale, max scale, solid (needs clear ground and stays off roads)] */
type Row = [string, number, number, number, boolean?];
type Rule = { p: number; rows: Row[] };
const T = true;
const GLADE: Row[] = [["fern", 5, 0.8, 1.3], ["bush", 5, 0.8, 1.3], ["bigleaf", 3, 0.8, 1.2], ["flowers", 2, 0.8, 1.2], ["rocks", 3, 0.9, 1.5], ["litter", 2, 0.8, 1.2], ["banana", 2.5, 0.8, 1.1], ["rockm", 2.5, 0.8, 1.2, T], ["log", 1.6, 0.9, 1.1, T], ["stump", 1.8, 0.9, 1.1, T], ["pebbles", 1, 0.8, 1.2], ["rockl", 1, 0.9, 1.3, T], ["tree", 1.6, 0.8, 1.05, T], ["palm", 1.2, 0.9, 1.15, T]];
const GROVE: Row[] = [["tree", 3.5, 0.8, 1.1, T], ["palm", 2.5, 0.9, 1.2, T], ["bush", 6, 0.9, 1.4], ["fern", 5, 0.9, 1.4], ["bigleaf", 3, 0.9, 1.3], ["banana", 3, 0.9, 1.2], ["rockm", 1.5, 0.8, 1.2, T], ["litter", 1.5, 0.9, 1.3], ["stump", 1, 0.9, 1.1, T]];
/** what crooks leave lying about a yard: cheap, chunky, readable (cover you can crouch behind, things to loot round) */
const CLUTTER: Row[] = [["barrel_wood", 3, 1, 1, T], ["barrel_rust", 2.5, 1, 1, T], ["barrel_teal", 1.5, 1, 1, T], ["sack", 4, 0.9, 1.1], ["sack_pile", 1.6, 1, 1, T], ["log_bench_b", 1, 1, 1, T], ["stump", 1.5, 0.9, 1.1, T], ["rockm", 1.5, 0.7, 1.0, T], ["rocks", 3, 0.9, 1.3], ["lantern", 1.2, 1, 1], ["bedroll_a", 1, 1, 1], ["fern", 2, 0.7, 1], ["bush", 1.5, 0.7, 1]];
const RULES: Record<Biome, Rule> = {
  jungle: { p: 0.62, rows: [["palm", 6, 0.9, 1.25, T], ["palmlean", 2, 0.9, 1.2, T], ["fern", 5, 0.8, 1.3], ["bush", 4, 0.8, 1.2], ["bigleaf", 3, 0.8, 1.2], ["banana", 2, 0.9, 1.1], ["rocks", 2, 0.9, 1.4], ["flowers", 1.5, 0.8, 1.2], ["litter", 1.5, 0.8, 1.2], ["log", 1.4, 1, 1, T], ["rockm", 2, 0.8, 1.2, T], ["stump", 1.2, 0.9, 1.1, T]] },
  beach: { p: 0.46, rows: [["beachgrass", 6, 0.8, 1.3], ["shells", 2, 0.8, 1.2], ["driftwood", 4, 0.8, 1.4], ["pebbles", 1.5, 0.8, 1.3], ["rocks", 4, 0.9, 1.5], ["rockm", 2.4, 0.8, 1.3, T], ["rockl", 0.8, 0.9, 1.2, T], ["palm", 1.4, 0.9, 1.2, T], ["palmlean", 1.6, 0.9, 1.2, T], ["log", 0.8, 0.9, 1.1, T]] },
  yard: { p: 0.4, rows: [...CLUTTER, ["pebbles", 3, 0.7, 1.2], ["litter", 3, 0.7, 1.1]] },
  farm: { p: 0.44, rows: [...CLUTTER, ["litter", 3, 0.8, 1.2], ["pebbles", 2, 0.8, 1.2], ["flowers", 2, 0.8, 1.2], ["banana", 4, 0.8, 1.15], ["bush", 3, 0.8, 1.1], ["log", 1.2, 1, 1, T]] },
  swamp: { p: 0.55, rows: [["reeds", 7, 0.9, 1.4], ["lily", 5, 0.8, 1.3], ["fern", 2, 0.9, 1.3], ["bigleaf", 2, 0.9, 1.3], ["mangrove", 1.6, 0.85, 1.2, T], ["log", 0.8, 1, 1.1, T], ["rocks", 1, 0.8, 1.2]] },
  ruin: { p: 0.46, rows: [["pebbles", 2, 0.8, 1.3], ["rocks", 4, 0.9, 1.4], ["fern", 4, 0.8, 1.2], ["bush", 3, 0.8, 1.1], ["flowers", 1.5, 0.8, 1.1], ["rubble_pile", 3, 0.9, 1.2, T], ["rubble_pile_rock", 1.5, 0.9, 1.2, T], ["litter", 1.5, 0.8, 1.1], ["rockm", 1.5, 0.7, 1, T], ["barrel_wood", 1, 1, 1, T], ["sack", 1.5, 0.9, 1.1], ["stump", 0.8, 0.9, 1, T]] },
  crash: { p: 0.5, rows: [["litter", 2, 0.8, 1.2], ["pebbles", 1.5, 0.8, 1.3], ["rocks", 4, 0.9, 1.4], ["stump", 3, 0.9, 1.1, T], ["log", 1.6, 0.9, 1.1, T], ["fern", 3, 0.8, 1.2], ["bush", 2, 0.8, 1.1], ["rubble_pile_rock", 1.6, 0.9, 1.2, T], ["rockm", 1.5, 0.8, 1.1, T], ["barrel_rust", 1, 1, 1, T], ["sack", 1, 0.9, 1.1]] },
  hollow: { p: 0.5, rows: [["litter", 3, 0.9, 1.4], ["fern", 4, 0.9, 1.3], ["mushroom", 4, 0.9, 1.5], ["rocks", 3, 0.9, 1.4], ["stump", 2, 0.9, 1.2, T], ["bigleaf", 2.5, 0.9, 1.2], ["pebbles", 1, 0.8, 1.2], ["log", 1, 0.9, 1.1, T], ["rockm", 1.2, 0.8, 1.2, T], ["bush", 2, 0.8, 1.2]] },
  falls: { p: 0.6, rows: [["fern", 5, 0.9, 1.4], ["bigleaf", 4, 0.9, 1.3], ["flowers", 3, 0.8, 1.2], ["reeds", 2, 0.9, 1.3], ["rocks", 3, 0.9, 1.4], ["bush", 3, 0.9, 1.2], ["banana", 2, 0.9, 1.1], ["rockm", 1.6, 0.8, 1.2, T], ["stump", 0.8, 0.9, 1.1, T]] },
  cave: { p: 0.52, rows: [["mushroom", 6, 0.8, 1.5], ["pebbles", 2, 0.8, 1.3], ["stalagmite", 3, 0.7, 1.1, T], ["crystal", 2.5, 0.7, 1.1, T], ["caverock", 2, 0.6, 0.95, T], ["rocks", 3, 0.9, 1.3], ["barrel_wood", 0.6, 1, 1, T], ["sack", 1, 0.9, 1.1]] },
};
const pick = (rows: Row[], r: number) => { let t = 0; for (const q of rows) t += q[1]; let k = r * t; for (const q of rows) { k -= q[1]; if (k <= 0) return q; } return rows[rows.length - 1]; };

/** footprint of a building in world space (axis aligned after its quarter turn), so nothing grows through a floor */
export type Footprint = { x: number; z: number; hx: number; hz: number };
export function makeScatter(seed: number, houses: Footprint[]): Placed[] {
  const rng = mulberry32(seed >>> 0), out: Placed[] = [];
  const W = BOUNDS.maxX - BOUNDS.minX, H = BOUNDS.maxZ - BOUNDS.minZ, occ = new Uint8Array(W * H); // 1 = no solid scatter, 2 = nothing at all
  const stamp = (x: number, z: number, r: number, v: number) => {
    for (let gz = Math.floor(z - r); gz <= z + r; gz++) for (let gx = Math.floor(x - r); gx <= x + r; gx++) {
      const c = gx - BOUNDS.minX, q = gz - BOUNDS.minZ; if (c < 0 || q < 0 || c >= W || q >= H) continue;
      if (Math.hypot(gx + 0.5 - x, gz + 0.5 - z) <= r + 0.5) occ[q * W + c] = Math.max(occ[q * W + c], v);
    }
  };
  const at = (x: number, z: number) => { const c = Math.floor(x - BOUNDS.minX), q = Math.floor(z - BOUNDS.minZ); return c < 0 || q < 0 || c >= W || q >= H ? 2 : occ[q * W + c]; };
  // hero pieces keep their own ground; solid ones keep a walking gap round them
  for (const p of PLACED) {
    if (p.k.startsWith("building:")) continue;
    const cs = collidersFor(p.k, p.o) ?? [], s = p.s ?? 1, cy = Math.cos(p.yaw ?? 0), sy = Math.sin(p.yaw ?? 0);
    stamp(p.x, p.z, 0.7, 2);
    for (const c of cs) {
      if (c.t === "circle") stamp(p.x + (c.x * cy + c.z * sy) * s, p.z + (-c.x * sy + c.z * cy) * s, c.r * s + 0.2, 2), stamp(p.x + (c.x * cy + c.z * sy) * s, p.z + (-c.x * sy + c.z * cy) * s, c.r * s + 1.5, 1);
      else { // boxes and segments: stamp along the long axis
        const b = c.t === "box" ? { x: c.x, z: c.z, hx: c.w / 2, hz: c.d / 2, yaw: c.yaw ?? 0 } : { x: (c.ax + c.bx) / 2, z: (c.az + c.bz) / 2, hx: c.thick / 2, hz: Math.hypot(c.bx - c.ax, c.bz - c.az) / 2, yaw: Math.atan2(c.bx - c.ax, c.bz - c.az) };
        const long = Math.max(b.hx, b.hz), short = Math.min(b.hx, b.hz), ax = b.hz >= b.hx ? Math.sin(b.yaw) : Math.cos(b.yaw), az = b.hz >= b.hx ? Math.cos(b.yaw) : -Math.sin(b.yaw);
        for (let t = -long; t <= long + 0.01; t += 0.8) { const lx = b.x + ax * t, lz = b.z + az * t, wx = p.x + (lx * cy + lz * sy) * s, wz = p.z + (-lx * sy + lz * cy) * s; stamp(wx, wz, short * s + 0.3, 2); stamp(wx, wz, short * s + 1.6, 1); }
      }
    }
  }
  for (const h of houses) for (let z = h.z - h.hz - 1.2; z <= h.z + h.hz + 1.2; z += 0.9) for (let x = h.x - h.hx - 1.2; x <= h.x + h.hx + 1.2; x += 0.9) { stamp(x, z, 0.6, 2); stamp(x, z, 2.6, 1); }
  for (const c of CRATES) { stamp(c.x, c.z, 1.3, 2); stamp(c.x, c.z, 2.6, 1); }
  for (const s of SPAWNS.flat()) { stamp(s.x, s.z, 1.0, 2); stamp(s.x, s.z, 2.2, 1); }
  for (const p of PORTALS) for (const q of [p.a, p.b]) { stamp(q.x, q.z, 2.2, 2); stamp(q.x, q.z, 3.6, 1); }
  for (const q of [POI.hatch, POI.raft, POI.tunnelExit, START, ...SUPPLY_DROPS, ...ZIPLINES.flatMap((zl) => [{ x: zl.from.x, z: zl.from.z + 3 }, { x: zl.to.x, z: zl.to.z + 1.6 }])]) { stamp(q.x, q.z, 2.6, 2); stamp(q.x, q.z, 4, 1); }
  for (const l of LANDMARKS) stamp(l.x, l.z, 2.5, 1);
  for (const p of PLACED) if (p.k === "pool") stamp(p.x, p.z, Number(p.o?.r ?? 6) - 0.5, 2); // the pool keeps only its hand-placed lilies and reeds
  for (const w of WALLS) if (w.breakable) { const [a, b] = w.pts; stamp((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 2.2, 2); stamp((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 4.2, 1); }
  stamp(DOOR.x, DOOR.z, 3, 2); stamp(DOOR.x, DOOR.z, 5, 1);

  const CELL = 2.05;
  for (let gz = BOUNDS.minZ; gz < BOUNDS.maxZ; gz += CELL) for (let gx = BOUNDS.minX; gx < BOUNDS.maxX; gx += CELL) {
    const x = gx + rng() * CELL, z = gz + rng() * CELL, r1 = rng(), r2 = rng(), r3 = rng(), r4 = rng();
    const d = edgeDist(x, z); if (d < 0.9) continue;
    const o = at(x, z); if (o === 2) continue;
    const zn = zoneAt(x, z), under = x > UNDER_X;
    let rule: Rule;
    if (zn) rule = RULES[zn.biome];
    else if (under) rule = RULES.cave;
    else { const n = fbm(x * 0.055 + 3, z * 0.055 + 11); rule = n > 0.6 ? { p: 0.6 + (n - 0.6) * 1.2, rows: GROVE } : { p: 0.46, rows: GLADE }; } // groves are clumps; most of the ground between places stays open, dotted with cover
    if (r1 > rule.p) continue;
    const row = pick(rule.rows, r2), solid = !!row[4], rd = roadDist(x, z);
    if (rd < (solid ? 2.4 : 0.7)) continue;
    if (solid && (o !== 0 || d < 2.2)) continue;
    if (solid) { stamp(x, z, 0.8, 2); stamp(x, z, 1.9, 1); } // solid scatter keeps a gap from the next solid thing, so it never walls a route
    const p: Placed = { k: row[0], x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, yaw: Math.round(r3 * 628) / 100, s: Math.round((row[2] + r4 * (row[3] - row[2])) * 100) / 100 };
    if (zn?.water !== undefined && (row[0] === "lily" || row[0] === "reeds")) p.o = { water: zn.water };
    out.push(pinVariant(p));
  }
  return out;
}
