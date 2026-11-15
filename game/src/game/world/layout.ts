// The raid map's public names. Map v3 (G1-22) moved the data to world/map/grove.ts (placements, zones, roads, the
// outline, sockets); this file keeps the v2 export names so combat, AI, loot, HUD and the bot keep working.
// CLEARINGS is now derived from the zones (name, centre and rough radius): zones are labels and ground paint, they
// no longer decide where you can walk.
import { ZONES } from "./map/grove";
export type { Ground, Wall, Portal, CrateSocket, SpawnKind, Spawn, Zone, Road } from "./map/types";
export { PLACED, ZONES, ROADS, SHAPES, WALLS, DOOR, PORTALS, ZIPLINES, POI, LANDMARKS, CRATES, SPAWNS, GROUP_RINGS, SUPPLY_DROPS, BOUNDS, SEA_Z, RIVER_Z, UNDER_X, START } from "./map/grove";
import type { Ground } from "./map/types";
export { BOSS_ENCOUNTER } from './map/grove';

export type Clearing = { id: string; name: string; x: number; z: number; rx: number; rz: number; ground: Ground; under?: boolean };
export const CLEARINGS: Clearing[] = ZONES.map((z) => {
  const xs = z.pts.map((p) => p[0]), zs = z.pts.map((p) => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  return { id: z.id, name: z.name, x: z.label?.[0] ?? (x0 + x1) / 2, z: z.label?.[1] ?? (z0 + z1) / 2, rx: (x1 - x0) / 2, rz: (z1 - z0) / 2, ground: z.ground, under: z.under };
});
