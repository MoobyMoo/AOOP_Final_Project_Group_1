// What the M map and the minimap show, gathered from the world (read only) in one place:
// the frames of the two levels, the demo edge and the locked routes north, labels, exits, level links and the boss.
// No regular enemies and no loot (Duckov's map never shows them: research/duckov-map FINDINGS 3).
import { ROUTE_LOCKS, BOSS_ARENA, DEMO, DEMO_BORDER, inDemo as worldInDemo, portalOpen } from "../world/map/grove";
import { CLEARINGS, PORTALS, ZIPLINES, UNDER_X } from "../world/layout";
import { exits } from "../world/props";
import { inPoly, type Pt } from "../world/map/types";
import { bossMarkers } from "../ai/enemies";
import type { MapFrame } from "./mapbake";

export type Level = "surface" | "under";
export const levelOf = (x: number): Level => (x > UNDER_X ? "under" : "surface");

/** the demo slice (G1.5 brief, "Demo scope"): Exile Beach to the Old Plantation, with a strip of the closed north.
 *  The frame only bounds the bake: the map is cut to the island's shape (mapshape.ts), so it leaves room around the
 *  outline for the sea sliver, the torn north edge and the drop shadow */
export const SURFACE: MapFrame = { minX: -114, maxX: 112, minZ: -24, maxZ: 126 };
/** the grotto sub-level: its own image, never drawn beside the surface (the level toggle picks one) */
export const UNDER: MapFrame = { minX: 132, maxX: 206, minZ: -40, maxZ: 78 };
export const frameOf = (l: Level) => (l === "surface" ? SURFACE : UNDER);

// ---------------------------------------------------------------- the demo border and the locked routes (world/map/grove.ts)
export type RouteLock = { id: string; x: number; z: number; label: string; note: string };
/** the route locks on a level. A lock whose far side is underground (the cove cave-in) is shown on both levels: at its
 *  mouth on the surface and at the far end of the fallen-in way down, in the grotto */
export function routeLocks(l: Level): RouteLock[] {
  const out: RouteLock[] = [];
  for (const k of ROUTE_LOCKS) {
    if (levelOf(k.x) === l) out.push({ id: k.id, x: k.x, z: k.z, label: k.label, note: k.note });
    else if (levelOf(k.beyond[0]) === l) out.push({ id: k.id + "-far", x: k.beyond[0], z: k.beyond[1], label: k.label, note: k.note });
  }
  return out;
}
/** the demo border west to east (grove DEMO_BORDER, the line the seal and the locks sit on), run out past both sides of
 *  the island so the closed side covers the shore and the tree wall too. Empty with ?north (the whole island is open) */
export function demoEdge(): Pt[] {
  if (!DEMO || DEMO_BORDER.length < 2) return [];
  const a = DEMO_BORDER[0], b = DEMO_BORDER[DEMO_BORDER.length - 1];
  return [[-140, a[1]], ...DEMO_BORDER, [140, b[1]]];
}
/** the closed north as a polygon (the border, closed off over the top of the frame); null when nothing is closed */
export function closedPoly(): Pt[] | null { const e = demoEdge(); return e.length ? [...e, [e[e.length - 1][0], -400], [e[0][0], -400]] : null; }
/** inside the demo slice: the world's own test (the grotto is out while the demo is on: its two ways in are shut) */
export const inDemo = (x: number, z: number) => worldInDemo(x, z);
/** the grotto is closed for the whole demo: the map still shows it, washed out like the closed north */
export const underClosed = DEMO;

// ---------------------------------------------------------------- markers
export type MarkKind = "exit" | "boat" | "link" | "zip" | "lock" | "pin" | "boss" | "danger" | "down";
export type Mark = { id: string; kind: MarkKind; x: number; z: number; label: string; r?: number };
const EXIT_NAMES: Record<string, string> = { hatch: "Hatch home", raft: "Raft", tunnel: "Smuggler Tunnel", boat: "Cove boat" };
/** labels for the areas on a level (the closed north and the closed grotto are not labelled; the shrine is a secret) */
export function areaLabels(l: Level) {
  return CLEARINGS.filter((c) => levelOf(c.x) === l && c.id !== "shrine" && c.name !== "???" && inDemo(c.x, c.z)).map((c) => ({ id: c.id, name: c.name, x: c.x, z: c.z }));
}
/** every marker on a level right now. Cheap: called when the map opens and a few times a second for the boss */
export function marks(l: Level, pins: { x: number; z: number }[]): Mark[] {
  const f = frameOf(l), on = (x: number, z: number) => levelOf(x) === l && x >= f.minX && x <= f.maxX && z >= f.minZ && z <= f.maxZ;
  const out: Mark[] = [];
  for (const e of exits) if (e.open && on(e.x, e.z) && inDemo(e.x, e.z)) out.push({ id: "exit-" + e.id, kind: e.id === "boat" ? "boat" : "exit", x: e.x, z: e.z, label: EXIT_NAMES[e.id] ?? "Extract" });
  for (const p of PORTALS) for (const [q, other] of [[p.a, p.b], [p.b, p.a]] as const) {
    if (!portalOpen(p.id) || !on(q.x, q.z) || !inDemo(q.x, q.z) || !inDemo(other.x, other.z) || (p.oneWay && q === p.b)) continue;
    out.push({ id: "link-" + p.id + (q === p.a ? "a" : "b"), kind: "link", x: q.x, z: q.z, label: levelOf(other.x) === "under" ? "Way down" : "Way up" });
  }
  for (const z of ZIPLINES) if (on(z.from.x, z.from.z) && inDemo(z.from.x, z.from.z)) out.push({ id: "zip-" + z.id, kind: "zip", x: z.from.x, z: z.from.z, label: "Zipline" });
  for (const k of routeLocks(l)) if (on(k.x, k.z)) out.push({ id: "lock-" + k.id, kind: "lock", x: k.x, z: k.z, label: k.label });
  // the boss: the foreman's loading yard (BOSS_ARENA) as the danger area until he is spotted, then the moving "?"
  const live = bossMarkers();
  for (const b of live) {
    const area = b.kind === "danger-area", x = area ? BOSS_ARENA.x : b.x, z = area ? BOSS_ARENA.z : b.z;
    if (!on(x, z)) continue;
    const kind: MarkKind = b.kind === "defeated" ? "down" : b.kind === "boss" ? "boss" : "danger";
    out.push({ id: "boss-" + b.id, kind, x, z, label: area ? BOSS_ARENA.label : b.label, r: area ? BOSS_ARENA.radius : undefined });
  }
  if (!live.length && on(BOSS_ARENA.x, BOSS_ARENA.z)) out.push({ id: "boss-" + BOSS_ARENA.id, kind: "danger", x: BOSS_ARENA.x, z: BOSS_ARENA.z, label: BOSS_ARENA.label, r: BOSS_ARENA.radius });
  pins.forEach((p, i) => { if (on(p.x, p.z)) out.push({ id: "pin-" + i, kind: "pin", x: p.x, z: p.z, label: "Your pin" }); });
  return out;
}
