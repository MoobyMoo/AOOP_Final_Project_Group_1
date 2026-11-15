// What the M map and the minimap show, gathered from the world (read only) in one place:
// the frames of the two levels, the demo edge and the locked routes north, labels, exits, level links and the boss.
// No regular enemies and no loot (Duckov's map never shows them: research/duckov-map FINDINGS 3).
import * as grove from "../world/map/grove";
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

// ---------------------------------------------------------------- the locked routes north
export type RouteLock = { id: string; x: number; z: number; label: string };
/** The world worker owns the route locks (world/map). The map reads them from grove.ts under any of these export
 *  names: an array of { id, x, z, label?|name?|kind? }, or a function returning one. Until that lands it falls back to
 *  the brief's three locks on the roads that leave the demo slice (plus the farm road east to the colony). */
const LOCK_EXPORTS = ["ROUTE_LOCKS", "LOCKED_ROUTES", "ROUTES_CLOSED", "routeLocks"];
const FALLBACK_LOCKS: RouteLock[] = [
  { id: "camp-north", x: -66, z: -4, label: "Peel Gang barricade" },
  { id: "ridge-road", x: -1.5, z: -6, label: "Rockslide" },
  { id: "farm-east", x: 44, z: 6, label: "Barricade" },
  { id: "boardwalk", x: 68, z: 20, label: "Collapsed bridge" },
];
export function routeLocks(): RouteLock[] {
  const ns = grove as unknown as Record<string, unknown>;
  for (const k of LOCK_EXPORTS) {
    let v = ns[k]; if (typeof v === "function") v = (v as () => unknown)();
    if (!Array.isArray(v) || !v.length) continue;
    const out: RouteLock[] = [];
    for (const q of v as Record<string, unknown>[]) {
      const x = Number(q.x ?? (q.at as Pt | undefined)?.[0]), z = Number(q.z ?? (q.at as Pt | undefined)?.[1]);
      if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
      const kind = String(q.kind ?? ""), label = String(q.label ?? q.name ?? (kind ? kind[0].toUpperCase() + kind.slice(1).replace(/[-_]/g, " ") : "Route closed"));
      out.push({ id: String(q.id ?? `${x},${z}`), x, z, label });
    }
    if (out.length) return out;
  }
  return FALLBACK_LOCKS;
}
const EDGE_EXPORT = "DEMO_EDGE";
/** the edge of the demo slice, west to east: north of it is closed. grove.ts may export DEMO_EDGE (Pt[]) to override */
export function demoEdge(): Pt[] {
  const e = (grove as unknown as Record<string, unknown>)[EDGE_EXPORT]; // looked up by name: the export may not exist yet
  if (Array.isArray(e) && e.length > 1) return e as Pt[];
  return [[-130, -2], [-66, -2], [-30, -3], [-2, -3], [26, 1], [42, 8], [50, 20], [90, 24], [130, 24]];
}
/** the closed north as a polygon (the edge, closed off over the top of the frame) */
export function closedPoly(): Pt[] { const e = demoEdge(); return [...e, [e[e.length - 1][0], -400], [e[0][0], -400]]; }
export const inDemo = (x: number, z: number) => levelOf(x) === "under" || !inPoly(closedPoly(), x, z);

// ---------------------------------------------------------------- markers
/** captures only (?dev, window.__map.dev): stand-in markers for things another worker has not landed yet */
export const devMarks: Mark[] = [];
export type MarkKind = "exit" | "link" | "zip" | "lock" | "pin" | "boss" | "danger" | "down";
export type Mark = { id: string; kind: MarkKind; x: number; z: number; label: string; r?: number };
const EXIT_NAMES: Record<string, string> = { hatch: "Hatch home", raft: "Raft", tunnel: "Smuggler Tunnel", boat: "Cove boat", cove: "Cove boat", coveboat: "Cove boat", "cove-boat": "Cove boat" };
/** labels for the areas on a level (the closed north is not labelled; the shrine is a secret) */
export function areaLabels(l: Level) {
  return CLEARINGS.filter((c) => levelOf(c.x) === l && c.id !== "shrine" && c.name !== "???" && inDemo(c.x, c.z)).map((c) => ({ id: c.id, name: c.name, x: c.x, z: c.z }));
}
/** every marker on a level right now. Cheap: called when the map opens and a few times a second for the boss */
export function marks(l: Level, pins: { x: number; z: number }[]): Mark[] {
  const f = frameOf(l), on = (x: number, z: number) => levelOf(x) === l && x >= f.minX && x <= f.maxX && z >= f.minZ && z <= f.maxZ;
  const out: Mark[] = [];
  for (const e of exits) if (e.open && on(e.x, e.z) && inDemo(e.x, e.z)) out.push({ id: "exit-" + e.id, kind: "exit", x: e.x, z: e.z, label: EXIT_NAMES[e.id] ?? "Extract" });
  for (const p of PORTALS) for (const [q, other] of [[p.a, p.b], [p.b, p.a]] as const) {
    if (!on(q.x, q.z) || !inDemo(q.x, q.z) || (p.oneWay && q === p.b)) continue;
    if (levelOf(other.x) === "surface" && !inDemo(other.x, other.z)) continue; // a way out into the closed north is not offered
    out.push({ id: "link-" + p.id + (q === p.a ? "a" : "b"), kind: "link", x: q.x, z: q.z, label: levelOf(other.x) === "under" ? "Way down" : "Way up" });
  }
  for (const z of ZIPLINES) if (on(z.from.x, z.from.z) && inDemo(z.from.x, z.from.z)) out.push({ id: "zip-" + z.id, kind: "zip", x: z.from.x, z: z.from.z, label: "Zipline" });
  if (l === "surface") for (const k of routeLocks()) if (on(k.x, k.z)) out.push({ id: "lock-" + k.id, kind: "lock", x: k.x, z: k.z, label: k.label });
  for (const b of bossMarkers()) {
    if (!on(b.x, b.z)) continue;
    const kind: MarkKind = b.kind === "defeated" ? "down" : b.kind === "boss" ? "boss" : "danger";
    out.push({ id: "boss-" + b.id, kind, x: b.x, z: b.z, label: b.label, r: b.radius });
  }
  for (const k of devMarks) if (on(k.x, k.z)) out.push(k);
  pins.forEach((p, i) => { if (on(p.x, p.z)) out.push({ id: "pin-" + i, kind: "pin", x: p.x, z: p.z, label: "Your pin" }); });
  return out;
}
