// Map v3 data types (G1-22). A map is placed kit instances + zones + roads + a boundary + gameplay sockets.
// Zones and roads never decide walkability: open ground is the default and placed things block you.
import type { Placed } from "../../contracts";

export type Ground = "grass" | "sand" | "dirt" | "stone" | "cave" | "plank" | "mud";
export type Pt = [number, number];
/** what the world edge is made of along a boundary edge: sea / river (water, shots pass), cliff (rock), jungle (dense foliage on a berm) */
export type EdgeKind = "coast" | "river" | "cliff" | "jungle";
/** scatter rule set used inside a zone (dress.ts BIOMES) */
export type Biome = "beach" | "jungle" | "yard" | "farm" | "swamp" | "ruin" | "crash" | "hollow" | "falls" | "cave";
/** named area: id/name for banners and the map, ground paint, scatter biome. flat = no terrain undulation (built places) */
export type Zone = { id: string; name: string; pts: Pt[]; ground: Ground; biome: Biome; under?: boolean; flat?: boolean; label?: Pt; water?: number };
/** painted path (ground type only). raise = lift the terrain to this height along it (causeways through the swamp) */
export type Road = { id: string; pts: Pt[]; w: number; ground: Ground; raise?: number; /** bounds padded by the width (filled in by the map file) */ bb: [number, number, number, number] };
/** the walkable outline: the overworld polygon (each vertex names the edge that starts there) and cave shapes */
export type Shape =
  | { t: "poly"; pts: [number, number, EdgeKind][]; under?: boolean }
  | { t: "ellipse"; x: number; z: number; rx: number; rz: number; under?: boolean }
  | { t: "capsule"; pts: Pt[]; w: number; under?: boolean };
export type Wall = { id: string; pts: Pt[]; kind: "palisade" | "stone" | "hull" | "rock" | "fence"; breakable?: { hp: number; persist: boolean; reveals: string } };
export type Portal = { id: string; a: { x: number; z: number }; b: { x: number; z: number }; label: string; oneWay?: boolean };
export type CrateSocket = { x: number; z: number; tier: "wood" | "green" | "gold"; fixed?: "key" | "vault" | "sleeper" | "secret" | "radio"; y?: number; in?: string };
export type SpawnKind = "wild" | "bandit" | "brute" | "sleeper";
export type Spawn = { kind: SpawnKind; x: number; z: number; group?: string; tag?: "lemon"; /** an item this one carries and drops when bonked (a key) */ carry?: string };
export type { Placed };
/** a point, possibly with extra fields after x and z */
export type PtLike = readonly [number, number, ...unknown[]];

export function segDist(x: number, z: number, ax: number, az: number, bx: number, bz: number) {
  const abx = bx - ax, abz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * abx + (z - az) * abz) / (abx * abx + abz * abz || 1)));
  return Math.hypot(x - ax - abx * t, z - az - abz * t);
}
export function polyDist(pts: readonly PtLike[], x: number, z: number) { let d = 1e9; for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, segDist(x, z, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1])); return d; }
export function inPoly(pts: readonly PtLike[], x: number, z: number) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const xi = pts[i][0], zi = pts[i][1], xj = pts[j][0], zj = pts[j][1]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; }
  return c;
}
/** signed distance to a closed polygon: > 0 inside */
export function polySigned(pts: readonly PtLike[], x: number, z: number) {
  let d = 1e9; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) d = Math.min(d, segDist(x, z, pts[j][0], pts[j][1], pts[i][0], pts[i][1]));
  return inPoly(pts, x, z) ? d : -d;
}
/** local (piece space) -> world for a placed instance: rotation.y = yaw, uniform scale s */
export function toWorld(p: { x: number; z: number; yaw?: number; s?: number }, lx: number, lz: number): Pt {
  const c = Math.cos(p.yaw ?? 0), s = Math.sin(p.yaw ?? 0), k = p.s ?? 1;
  return [p.x + (lx * c + lz * s) * k, p.z + (-lx * s + lz * c) * k];
}
