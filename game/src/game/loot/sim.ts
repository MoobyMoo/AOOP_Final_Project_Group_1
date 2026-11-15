import type { BuildingDef } from "../contracts";
import { BOSS_ENCOUNTER } from "../world/layout";
import manifest from "../../../public/models/build/manifest.json";
import { initGrid, path, walkable } from "../world/grid";
import { CRATE_TABLES, PRICES, isUseful, itemDef, mulberry32, rollCrate, rollEnemyDrop, type LootContext } from "./tables";
import { demoRaidLoot, DEMO_ROUTES, upgradePacing } from './demo-economy';

function assert(ok: boolean, message: string): asserts ok {
  if (!ok) throw new Error(message);
}

function fresh(): LootContext {
  return { raid: 0, cratesOpened: 0, usefulFound: 0, emptyStreak: 0, ammoFound: 0, orderNeeds: [] };
}

function verifyLoot() {
  for (const tier of ["wood", "green", "gold"] as const) {
    const table = CRATE_TABLES[tier];
    assert(Math.abs(Object.values(table.items).reduce((sum, chance) => sum + chance, 0) - 1) < 1e-9, `${tier}: normalized probabilities`);
    assert(table.empty <= { wood: 0.15, green: 0.05, gold: 0 }[tier], `${tier}: empty budget`);
    assert(Object.values(table.items).every(probability => probability >= 0 && probability <= 1), `${tier}: probability ranges`);
    const before = rollCrate(tier, fresh(), mulberry32(123));
    const original = table.items;
    table.items = Object.fromEntries(Object.entries(original).reverse());
    const after = rollCrate(tier, fresh(), mulberry32(123));
    table.items = original;
    assert(JSON.stringify(before) === JSON.stringify(after), `${tier}: table-order independence`);
    const ctx = fresh();
    const first = rollCrate(tier, ctx, () => 0);
    assert(first.some(id => isUseful(id, ctx)), `${tier}: first crate useful guarantee`);
    const second = rollCrate(tier, ctx, () => 0);
    const third = rollCrate(tier, ctx, () => 0);
    assert(second.length > 0 || third.length > 0, `${tier}: consecutive empty protection`);
  }
  const guarantee = { ...fresh(), cratesOpened: 3 };
  assert(rollCrate("wood", guarantee, () => 0).some(id => isUseful(id, guarantee)), "fourth crate useful guarantee");
  const ammo = { ...fresh(), cratesOpened: 7 };
  rollCrate("wood", ammo, () => 0);
  assert(ammo.ammoFound >= 8, "eighth crate ammo floor");
  const vault = { ...fresh(), fixed: "vault" as const };
  assert(rollCrate("wood", vault, () => 0).includes("att_mag_ext"), "first vault mag");
  assert(!rollCrate("gold", vault, () => 0).includes("att_mag_ext"), "owned vault mag is not duplicated");
  assert(rollCrate("wood", { ...fresh(), fixed: "key" }, () => 0).includes("vine_key"), "fixed key");
  assert(rollCrate("gold", { ...fresh(), fixed: "vault" }, () => 0).some(id => id === "warden_vest" || id === "warden_helmet"), "vault equipment");
  assert(rollCrate("wood", { ...fresh(), fixed: "radio" }, () => 0).includes("radio_headset"), "radio shack equipment");
  assert(rollEnemyDrop("sleeper", fresh(), () => 0).includes("banana_idol"), "Sleeper trophy");
  const enemyCtx = fresh();
  rollEnemyDrop("brute", enemyCtx, () => 0.5);
  assert(enemyCtx.cratesOpened === 0, "enemy rolls are not crate openings");
  const carried = ["brass_compass", "old_gear"];
  assert(carried.every(id => rollEnemyDrop("bandit", { ...fresh(), carried }, () => 0.99).includes(id)), "bandits retain carried items");
  const supplied = { ...fresh(), ammoFound: 16, cratesOpened: 8 };
  assert(rollCrate("wood", supplied, () => 0).includes("ammo45") && supplied.ammoFound >= 24, "ammo floor continues beyond the old 16-round cap");
  const enemySupply = { ...fresh(), ammoFound: 32 };
  assert(rollEnemyDrop("wild", enemySupply, () => 0).includes("ammo45") && enemySupply.ammoFound === 40, "enemy ammo remains ammunition beyond the old cap");
  console.log("Loot self-test: PASS (normalization, ordering, guarantees, sockets, enemy accounting)");
}

const prefabs = manifest.groups.prefab.assets;
initGrid(placed => JSON.parse(prefabs[placed.k.slice(9) as keyof typeof prefabs].def) as BuildingDef);
for (const spawn of BOSS_ENCOUNTER.spawns) assert(walkable(spawn.x, spawn.z), 'boss and escorts spawn on walkable ground');
assert(path(BOSS_ENCOUNTER.x, BOSS_ENCOUNTER.z, BOSS_ENCOUNTER.retreat.x, BOSS_ENCOUNTER.retreat.z).length > 0, 'arena has an accessible retreat route');
assert(Math.hypot(BOSS_ENCOUNTER.retreat.x - BOSS_ENCOUNTER.x, BOSS_ENCOUNTER.retreat.z - BOSS_ENCOUNTER.z) > BOSS_ENCOUNTER.radius, 'retreat ends outside the leash');

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
function percentile(values: number[], fraction: number) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) * fraction)];
}

verifyLoot();
console.log('10,000 seeded demo raids per route. Proposed wave-2 route budgets; six hatch / eight cove / nine boss containers. Spawn-time body possessions included, no death roll. Optimistic best sale slots, no combat costs or survival model. Not a route/time verification.');
console.log('Route Slots Mean Median P10 P90 Rounds Min Containers');
const demoResults = new Map<string, ReturnType<typeof demoRaidLoot>[]>();
for (const route of Object.keys(DEMO_ROUTES) as (keyof typeof DEMO_ROUTES)[]) {
  const raids = Array.from({ length: 10_000 }, (_, seed) => demoRaidLoot(seed, route));
  demoResults.set(route, raids);
  for (const slots of [8, 10] as const) {
    const values = raids.map(result => slots === 8 ? result.value8 : result.value10);
    console.log(`${route} ${slots} ${mean(values).toFixed(1)} ${percentile(values, 0.5)} ${percentile(values, 0.1)} ${percentile(values, 0.9)} ${mean(raids.map(result => result.rounds)).toFixed(2)} ${Math.min(...raids.map(result => result.rounds))} ${DEMO_ROUTES[route].length}`);
  }
}
const hatch = demoResults.get('hatch')!;
const median8 = percentile(hatch.map(result => result.value8), 0.5);
const median10 = percentile(hatch.map(result => result.value10), 0.5);
const { affordable, firstTwo, raids: raidsToAll, bought } = upgradePacing(median8, median10);
const pass = affordable === 1 && median8 < firstTwo && raidsToAll === 4 && bought === 3;
console.log(`Prices: ${JSON.stringify(PRICES)}`);
console.log(`Economy gate: ${pass ? "PASS" : "FAIL"} | first hatch median ${median8}; affordable upgrades ${affordable}; all three in ${raidsToAll} median raids (pack growth included).`);
assert(pass, "economy pacing gate");
