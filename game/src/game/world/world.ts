// Assembles the static raid world once (map v3): rule scatter -> collision grid -> terrain -> placed pieces ->
// buildings -> interactive props -> edge dressing -> merged chunks -> grass -> the light pool.
// Await preloadWorldKits() first. The same world seed always builds the same island (pacing report issue 5).
import * as THREE from "three";
import type { Placed } from "../contracts";
import { PLACED } from "./map/grove";
import { makeScatter } from "./map/scatter";
import { initGrid, lintReport, type LintReport } from "./grid";
import { buildTerrain } from "./terrain";
import { buildPlaced, dressEdges, flushChunks, buildGrass, objects } from "./dress";
import { preloadHouse, houseDef, houseFootprints, buildHouses } from "./buildings";
import { buildProps } from "./props";
import { initLightPool } from "./lights";
import { preloadNature, grassTuft, enableFoliageWind } from "./kit_nature";
import { preloadBuild } from "./kit_build";
import { mulberry32 } from "../loot/tables";

export const preloadWorldKits = () => Promise.all([preloadNature(), preloadBuild(), preloadHouse()]);
export type WorldStats = { seed: number; placed: number; scattered: number; edge: number; chunkMeshes: number; kitTris: number; grass: number; lint: LintReport; ms: number };
export let worldStats: WorldStats | null = null;
export let scattered: Placed[] = [];
export function buildWorld(scene: THREE.Scene, seed = 4242, o: { wind?: boolean } = {}): WorldStats {
  const t0 = performance.now(), rng = mulberry32((seed ^ 0x9e3779b9) >>> 0), feet = houseFootprints();
  scattered = makeScatter(seed, feet);
  initGrid(houseDef, scattered);
  const lint = lintReport();
  buildTerrain(scene);
  buildPlaced(scene, PLACED, rng); buildPlaced(scene, scattered, rng);
  buildHouses(scene); buildProps(scene);
  const edge = dressEdges(rng);
  if (o.wind !== false) enableFoliageWind();
  const ch = flushChunks(scene);
  const onFloor = (x: number, z: number) => feet.some((f) => Math.abs(x - f.x) < f.hx + 0.5 && Math.abs(z - f.z) < f.hz + 0.5);
  const grass = buildGrass(scene, rng, grassTuft(), onFloor);
  initLightPool(scene);
  worldStats = { seed, placed: PLACED.length, scattered: scattered.length, edge, chunkMeshes: ch.meshes, kitTris: ch.tris, grass, lint, ms: Math.round(performance.now() - t0) };
  return worldStats;
}
/** how many placed objects are on screen right now (G1-21 density gate): all, and the ones big enough to read */
export function countVisible(cam: THREE.Camera, extra: { x: number; z: number }[] = []) {
  const v = new THREE.Vector3(); let all = 0, big = 0; const kinds = new Map<string, number>();
  const on = (x: number, z: number) => { v.set(x, 0.5, z).project(cam); return Math.abs(v.x) < 0.98 && Math.abs(v.y) < 0.98 && v.z < 1; };
  for (const o of objects) if (on(o.x, o.z)) { all++; if (o.big) { big++; kinds.set(o.k, (kinds.get(o.k) ?? 0) + 1); } }
  for (const e of extra) if (on(e.x, e.z)) { all++; big++; }
  return { all, readable: big, kinds: kinds.size };
}
