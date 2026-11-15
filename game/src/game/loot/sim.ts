import type { BuildingDef, CrateTier } from "../contracts";
import { CRATES, SPAWNS, PORTALS, POI, START } from "../world/layout";
import manifest from "../../../public/models/build/manifest.json";
import { initGrid, flood, gates, path } from "../world/grid";
import { segDist } from "../world/map/types";
import { selectSockets, RAID_CRATES } from "./sockets";
import { CRATE_TABLES, PRICES, isUseful, itemDef, mulberry32, rollCrate, rollEnemyDrop, type LootContext } from "./tables";

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
  assert(rollCrate("wood", vault, () => 0).includes("extended_mag"), "first vault mag");
  assert(!rollCrate("gold", vault, () => 0).includes("extended_mag"), "owned vault mag is not duplicated");
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
type Route = "Hatch" | "Raft" | "Tunnel" | "Vault";
function routePlan(route: Route) {
  const keyring = route === "Vault";
  for (const gate of gates) gate.open = gate.kind === "door" && !gate.locked || gate.locked === "vine_key" && keyring;
  let reach = flood(START.x, START.z);
  const radio = CRATES.find(socket => socket.fixed === "radio")!;
  const vault = CRATES.find(socket => socket.fixed === "vault")!;
  assert(!reach(radio.x, radio.z), "radio requires lemon bandit's key");
  assert(reach(vault.x, vault.z) === keyring, "vault requires key extracted on an earlier raid");
  const camp = SPAWNS[0].find(enemy => enemy.carry === "radio_key")!;
  assert(reach(camp.x, camp.z), "radio key carrier reachable before radio door");
  const well = PORTALS.find(portal => portal.id === "camp-well")!;
  const stops: ({ x: number; z: number; teleport?: boolean; breakGate?: string })[] = route === "Raft" ? [camp, radio, POI.sleeperBed, POI.raft]
    : route === "Tunnel" ? [camp, well.a, { ...well.b, teleport: true }, { ...POI.tunnelExit, breakGate: "grotto-rubble" }]
    : route === "Vault" ? [camp, radio, vault, POI.raft] : [{ x: 10.4, z: 29 }, camp, POI.hatch];
  let from = START as { x: number; z: number };
  const available = new Set<(typeof CRATES)[number]>();
  const enemies = new Set<(typeof SPAWNS)[number][number]>();
  const stages: { sockets: typeof available; enemies: typeof enemies; radio: boolean }[] = [];
  for (const stop of stops) {
    if (stop.teleport) { from = stop; continue; }
    if (stop === radio) {
      assert(enemies.has(camp), "radio key carrier encountered before opening radio door");
      for (const gate of gates) if (gate.locked === "radio_key") gate.open = true;
    }
    if (stop.breakGate) {
      const rubble = gates.find(gate => gate.id === stop.breakGate)!;
      assert(!flood(from.x, from.z)(stop.x, stop.z), "tunnel exit locked before rubble breaks");
      assert(flood(from.x, from.z)(rubble.x, rubble.z, 2), "rubble reachable before breaking it");
      rubble.open = true;
    }
    reach = flood(from.x, from.z);
    const points = path(from.x, from.z, stop.x, stop.z);
    assert(points.length > 0, `${route}: waypoint ${stop.x},${stop.z} reachable from ${from.x},${from.z}`);
    const corridor = [from, ...points];
    const near = (point: { x: number; z: number }, radius: number) => corridor.some((next, index) => index > 0 && segDist(point.x, point.z, corridor[index - 1].x, corridor[index - 1].z, next.x, next.z) < radius);
    const stage = { sockets: new Set<(typeof CRATES)[number]>(), enemies: new Set<(typeof SPAWNS)[number][number]>(), radio: stop === radio };
    for (const socket of CRATES) if (!available.has(socket) && reach(socket.x, socket.z, socket.fixed === "key" ? 2 : 0) && near(socket, 24)) { available.add(socket); stage.sockets.add(socket); }
    for (const enemy of SPAWNS.flat()) if (!enemies.has(enemy) && reach(enemy.x, enemy.z) && near(enemy, 11)) { enemies.add(enemy); stage.enemies.add(enemy); }
    stages.push(stage);
    from = points[points.length - 1];
  }
  if (route === "Hatch") assert(!available.has(radio) && !available.has(vault), "first hatch cannot collect locked rewards");
  if (route === "Vault") assert(available.has(vault), "second-raid keyring route reaches vault reward");
  return { stages };
}
const plans = Object.fromEntries((["Hatch", "Raft", "Tunnel", "Vault"] as const).map(route => [route, routePlan(route)])) as Record<Route, ReturnType<typeof routePlan>>;

type Result = { value8: number; value10: number; rounds: number; useful: number; opened: number; longest: number };
type TierCount = Record<CrateTier, { opened: number; empty: number }>;
const counts = (): TierCount => ({ wood: { opened: 0, empty: 0 }, green: { opened: 0, empty: 0 }, gold: { opened: 0, empty: 0 } });

function raid(seed: number, route: Route, tiers: TierCount): Result {
  const rng = mulberry32(seed);
  const ctx = fresh();
  const sockets = selectSockets(rng);
  const plan = plans[route];
  const keyring = new Set(route === "Vault" ? ["vine_key"] : []);
  const carriedKeys = new Set<string>();
  assert(sockets.length === RAID_CRATES && new Set(sockets).size === RAID_CRATES, "shared distinct raid sockets");
  assert(CRATES.filter(socket => socket.fixed).every(socket => sockets.includes(socket)), "all fixed sockets spawn");
  const loot: string[] = [];
  let longest = 0;
  for (const stage of plan.stages) {
    if (stage.radio) assert(carriedKeys.has("radio_key"), "radio loot requires its carried key, not a free headset");
    ctx.fixed = undefined;
    for (const [index, enemy] of SPAWNS[seed % SPAWNS.length].entries()) {
      if (!stage.enemies.has(enemy)) continue;
      ctx.carried = [];
      ctx.enemySeed = seed ^ Math.imul(index + 1, 7);
      loot.push(...rollEnemyDrop(enemy.kind, ctx, rng));
      if (enemy.carry) { carriedKeys.add(enemy.carry); loot.push(enemy.carry); }
    }
    for (const socket of sockets) {
      if (!stage.sockets.has(socket)) continue;
      if (socket.fixed === "vault") assert(keyring.has("vine_key"), "carried Vine Key cannot open vault until next raid");
      if (socket.fixed === "radio") assert(carriedKeys.has("radio_key"), "radio crate cannot bypass its locked door");
      ctx.fixed = socket.fixed;
      const found = rollCrate(socket.tier, ctx, rng);
      for (const id of found) if (itemDef(id).kind === "key") carriedKeys.add(id);
      tiers[socket.tier].opened++;
      if (!found.length) tiers[socket.tier].empty++;
      longest = Math.max(longest, ctx.emptyStreak);
      loot.push(...found);
    }
  }
  const values = loot.filter(id => !["ammo", "key", "attachment"].includes(itemDef(id).kind))
    .map(id => itemDef(id).value).sort((left, right) => right - left);
  const sale = (slots: number) => Math.floor(values.slice(0, slots).reduce((sum, value) => sum + value, 0) * (route === "Raft" || route === "Vault" ? 1.3 : 1));
  assert(ctx.ammoFound >= Math.floor(ctx.cratesOpened / 3) * 8, `raid ${seed}: recurring ammo floor`);
  assert(ctx.usefulFound > 0, `raid ${seed}: useful find`);
  assert(longest <= 1, `raid ${seed}: no consecutive empty crates`);
  return { value8: sale(8), value10: sale(10), rounds: ctx.ammoFound, useful: ctx.usefulFound, opened: ctx.cratesOpened, longest };
}

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
function percentile(values: number[], fraction: number) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) * fraction)];
}

verifyLoot();
console.log("10,000 seeded raids per route; optimistic best 8/10 sale slots including equipment condition. No combat costs, repairs or loot loss; keys/ammo/mag excluded from sale slots. Not a combat or human-time simulation.");
console.log(`Shared ${RAID_CRATES} sockets. Hatch: plantation/camp/home, no radio key detour. Raft: lemon key → radio → hollow → landing; vault requires a previously extracted Vine Key. A* route corridors + actual building colliders/locks; no z split.`);
console.log("Route slots  Mean Median  P10  P90 Rounds Min Opened Empty W/G/G% Streak ZeroUseful%");
const results = new Map<string, Result[]>();
for (const route of ["Hatch", "Raft", "Tunnel", "Vault"] as const) {
  const tiers = counts();
  const raids = Array.from({ length: 10_000 }, (_, seed) => raid(seed, route, tiers));
  results.set(route, raids);
  for (const slots of [8, 10] as const) {
    const values = raids.map(result => slots === 8 ? result.value8 : result.value10);
    const empty = Object.values(tiers).map(tier => tier.opened ? (100 * tier.empty / tier.opened).toFixed(2) : "—").join("/");
    console.log(`${route.padEnd(5)} ${String(slots).padStart(5)} ${mean(values).toFixed(1).padStart(5)} ${String(percentile(values, 0.5)).padStart(6)} ${String(percentile(values, 0.1)).padStart(4)} ${String(percentile(values, 0.9)).padStart(4)} ${mean(raids.map(result => result.rounds)).toFixed(2).padStart(6)} ${String(Math.min(...raids.map(result => result.rounds))).padStart(3)} ${mean(raids.map(result => result.opened)).toFixed(2).padStart(6)} ${empty} ${Math.max(...raids.map(result => result.longest))} ${(100 * raids.filter(result => !result.useful).length / raids.length).toFixed(2)}`);
  }
}
const hatch = results.get("Hatch")!;
const median8 = percentile(hatch.map(result => result.value8), 0.5);
const median10 = percentile(hatch.map(result => result.value10), 0.5);
const upgrades = Object.entries(PRICES.upgrades).map(([id, prices]) => ({ id, price: prices[0] })).sort((left, right) => left.price - right.price);
let balance = 0, bought = 0, raidsToAll = 0, pack = false;
while (bought < upgrades.length && raidsToAll < 100) {
  balance += pack ? median10 : median8;
  raidsToAll++;
  while (bought < upgrades.length && balance >= upgrades[bought].price) {
    balance -= upgrades[bought].price;
    if (upgrades[bought].id === "pack") pack = true;
    bought++;
  }
}
const affordable = upgrades.filter(upgrade => upgrade.price <= median8).length;
const firstTwo = upgrades[0].price + upgrades[1].price;
const pass = affordable === 1 && median8 < firstTwo && raidsToAll === 4 && bought === 3;
console.log(`Prices: ${JSON.stringify(PRICES)}`);
console.log(`Economy gate: ${pass ? "PASS" : "FAIL"} | first hatch median ${median8}; affordable upgrades ${affordable}; all three in ${raidsToAll} median raids (pack growth included).`);
assert(pass, "economy pacing gate");
