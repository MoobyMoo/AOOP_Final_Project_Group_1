// What a bullet hit (G1.5 row 03): dirt, wood, metal, foliage or stone, so the impact effect and sound match the
// surface. Duckov has no shared material switch here (POLISH_FINDINGS 4: each obstacle picks its own FX), so ours is a
// lookup over data the world already has, read-only: breakable gates carry a material, per-raid crates are wood, the
// placed kit pieces are classified by kind, buildings by type, and the island edge by its edge kind (jungle = foliage,
// cliff/cave = stone). The spatial hash is built once, lazily, on the first impact.
import type { Placed } from "../contracts";
import { G } from "../core/state";
import { PLACED, WALLS } from "../world/map/grove";
import { scattered } from "../world/world";
import { collidersFor } from "../world/map/colliders";
import { houseFootprints } from "../world/buildings";
import { wallAt, edgeDist } from "../world/grid";
import { segDist } from "../world/map/types";

export type Surface = "dirt" | "wood" | "metal" | "foliage" | "stone";

const KIND: Record<string, Surface> = {
  palm: "wood", palmlean: "wood", tree: "wood", treefar: "wood", mangrove: "wood", giant: "wood", roots: "wood", log: "wood", stump: "wood",
  rockm: "stone", rockl: "stone", boulders: "stone", caverock: "stone", stalagmite: "stone", crystal: "stone",
  bush: "foliage", fern: "foliage", bigleaf: "foliage", banana: "foliage", reeds: "foliage", vine_door: "foliage", portal_roots: "wood",
  tent_a: "dirt", tent_b: "dirt", tarp: "wood", campfire: "stone", lantern_post: "wood", fence_a: "wood", fence_b: "wood", gate: "wood",
  watchtower: "wood", well: "stone", log_bench: "wood", log_bench_b: "wood", signpost_a: "wood", signpost_raft: "wood", signpost_key: "wood",
  sandbags: "dirt", crate_stack: "wood", dummy_seated: "wood", washing_line: "wood", lean_to: "wood", dock_piles: "wood",
  barrel_wood: "wood", barrel_rust: "metal", barrel_teal: "metal", sack_pile: "dirt", banana_stash: "foliage",
  crate_wood: "wood", crate_wood_b: "wood", crate_green: "wood", crate_gold: "metal",
  rubble_pile: "stone", rubble_pile_rock: "stone", wall_palisade_post: "wood",
  pillar_a: "stone", pillar_b: "stone", pillar_c: "stone", ruin_wall_broken: "stone", ruin_arch: "stone",
  vault: "metal", vault_plinth: "stone", fusebox: "metal", statue: "stone",
  ferry: "metal", bomber: "metal", vat: "metal", tractor: "metal", lemon_stand: "wood",
  zip_tower: "wood", hatch: "metal", supply_gondola: "metal", portal_cave: "stone", portal_cave_dark: "stone", waterfall: "stone",
};
const WALL_MAT: Record<string, Surface> = { palisade: "wood", stone: "stone", hull: "metal", rock: "stone", fence: "wood", wood: "wood" };
const BUILDING: Record<string, Surface> = { cellblock: "stone", farmhouse: "wood", barn: "wood", guard_hut: "wood", boathouse: "wood", radio_shack: "metal" };

type Item = { x: number; z: number; r: number; s: Surface };
const CELL = 8;
let hash: Map<number, Item[]> | null = null, houses: (Item & { hx: number; hz: number })[] = [];
const key = (cx: number, cz: number) => (cx + 512) * 4096 + (cz + 512);

function radiusOf(p: Placed) {
  const cs = collidersFor(p.k, p.o) ?? [], s = p.s ?? 1; let r = 0;
  for (const c of cs) r = Math.max(r, c.t === "circle" ? Math.hypot(c.x, c.z) + c.r : c.t === "box" ? Math.hypot(c.x, c.z) + Math.hypot(c.w, c.d) / 2 : Math.max(Math.hypot(c.ax, c.az), Math.hypot(c.bx, c.bz)) + c.thick / 2);
  return r * s;
}
function ensure() {
  if (hash) return hash;
  hash = new Map();
  const add = (it: Item) => {
    for (let cz = Math.floor((it.z - it.r) / CELL); cz <= Math.floor((it.z + it.r) / CELL); cz++)
      for (let cx = Math.floor((it.x - it.r) / CELL); cx <= Math.floor((it.x + it.r) / CELL); cx++) { const k = key(cx, cz); let a = hash!.get(k); if (!a) hash!.set(k, (a = [])); a.push(it); }
  };
  for (const p of [...PLACED, ...scattered]) {
    if (p.k.startsWith("building:")) continue;
    const s = p.k.startsWith("wall:") ? WALL_MAT[p.k.slice(5)] : KIND[p.k];
    if (!s) continue;
    const r = p.k.startsWith("wall:") ? Number(p.o?.len ?? 2.5) / 2 + 0.6 : radiusOf(p);
    if (r > 0) add({ x: p.x, z: p.z, r, s });
  }
  houses = [];
  const fp = houseFootprints(), bs = PLACED.filter((p) => p.k.startsWith("building:"));
  bs.forEach((p, i) => { const f = fp[i]; if (f) houses.push({ x: f.x, z: f.z, r: 0, hx: f.hx + 0.6, hz: f.hz + 0.6, s: BUILDING[p.k.slice(9)] ?? "wood" }); });
  return hash;
}

const edge = { kind: "jungle" as string };
/** the surface at a bullet's stopping point (x, z) */
export function surfaceAt(x: number, z: number): Surface {
  const g = wallAt(x, z); if (g?.mat) return WALL_MAT[g.mat] ?? "wood";
  for (const c of G.crates) if (c.kind !== "body" && Math.abs(c.x - x) < 1.3 && Math.abs(c.z - z) < 1.3) return c.tier === "gold" ? "metal" : "wood";
  for (const w of WALLS) if (segDist(x, z, w.pts[0][0], w.pts[0][1], w.pts[1][0], w.pts[1][1]) < 1) return WALL_MAT[w.kind] ?? "stone";
  const h = ensure();
  let best: Item | null = null, bd = 0.6;   // a piece whose collider edge is within 0.6 u of the stop point
  for (const it of h.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? []) { const d = Math.hypot(x - it.x, z - it.z) - it.r; if (d < bd) { bd = d; best = it; } }
  if (best) return best.s;
  for (const b of houses) if (Math.abs(x - b.x) < b.hx && Math.abs(z - b.z) < b.hz) return b.s;
  if (edgeDist(x, z, edge as { kind: never }) < 0.5) return edge.kind === "jungle" ? "foliage" : edge.kind === "cliff" || edge.kind === "cave" ? "stone" : "dirt";
  return "dirt";
}
