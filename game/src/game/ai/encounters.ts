// Rolling the slice's encounters once per raid (G1.5 population pass; SYSTEMS_PORT A05 EncounterDef). Pure: the same
// rng gives the same raid, and nothing here re-rolls when a map or a screen opens. The result is kept in G.encounters
// so the active population is observable (fps log, bot report).
import type { Spawn } from "../world/map/types";
import { ENCOUNTERS, FIXED_SPAWNS, BOSS_ENCOUNTER, START, type EncounterDef } from "../world/map/grove";

export type RolledEncounter = { id: string; count: number; spawns: (Spawn & { wake: number })[] };
function role(e: EncounterDef, rng: () => number) {
  const total = e.weightedRoles.reduce((a, [, w]) => a + w, 0); let r = rng() * total;
  for (const [k, w] of e.weightedRoles) { r -= w; if (r < 0) return k; }
  return e.weightedRoles[e.weightedRoles.length - 1][0];
}
export function rollEncounters(rng: () => number, from: { x: number; z: number } = START): RolledEncounter[] {
  const out: RolledEncounter[] = [];
  ENCOUNTERS.forEach((e, gi) => {
    if (e.conditions.some((c) => c.chance !== undefined && rng() >= c.chance)) { out.push({ id: e.id, count: 0, spawns: [] }); return; }
    const want = e.min + Math.floor(rng() * (e.max - e.min + 1));
    const pts = e.points.filter(([x, z]) => Math.hypot(x - from.x, z - from.z) >= e.exclusionRadius).map((p) => [...p] as [number, number]);
    for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; }
    const picked: [number, number][] = [];
    for (const p of pts) { if (picked.length >= want) break; if (picked.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) >= 3)) picked.push(p); }
    // staggered activation: groups wake 0.35 s apart, members 0.15 s apart, so a raid never wakes everyone in one frame
    out.push({ id: e.id, count: picked.length, spawns: picked.map(([x, z], i) => ({ kind: role(e, rng), x, z, group: e.id, wake: gi * 0.35 + i * 0.15 })) });
  });
  return out;
}
/** the demo's whole population for a raid: the boss yard, the fixed camp member, the rolled encounters */
export function demoSpawns(rng: () => number): { spawns: (Spawn & { wake: number })[]; rolled: RolledEncounter[] } {
  const rolled = rollEncounters(rng);
  return { rolled, spawns: [...BOSS_ENCOUNTER.spawns.map((s) => ({ ...s, wake: 0 })), ...FIXED_SPAWNS.map((s) => ({ ...s, wake: 0.3 })), ...rolled.flatMap((r) => r.spawns)] };
}
