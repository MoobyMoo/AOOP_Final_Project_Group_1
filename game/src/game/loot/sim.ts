import type { CrateTier } from "../contracts";
import { CRATES, SPAWNS, type CrateSocket } from "../world/layout";
import { CRATE_TABLES, ITEMS, PRICES, isUseful, mulberry32, rollCrate, rollEnemyDrop, type LootContext } from "./tables";

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
    rollCrate(tier, ctx, () => 0);
    assert(rollCrate(tier, ctx, () => 0).length > 0, `${tier}: consecutive empty protection`);
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
  assert(rollEnemyDrop("sleeper", fresh(), () => 0).includes("banana_idol"), "Sleeper trophy");
  const enemyCtx = fresh();
  rollEnemyDrop("brute", enemyCtx, () => 0.5);
  assert(enemyCtx.cratesOpened === 0, "enemy rolls are not crate openings");
  const carried = ["brass_compass", "old_gear"];
  assert(carried.every(id => rollEnemyDrop("bandit", { ...fresh(), carried }, () => 0.99).includes(id)), "bandits retain carried items");
  console.log("Loot self-test: PASS (normalization, ordering, guarantees, sockets, enemy accounting)");
}

export function selectSockets(rng: () => number): CrateSocket[] {
  const fixed = CRATES.filter(socket => socket.fixed);
  const random = CRATES.filter(socket => !socket.fixed);
  for (let index = random.length - 1; index > 0; index--) {
    const other = Math.floor(rng() * (index + 1));
    [random[index], random[other]] = [random[other], random[index]];
  }
  return [...fixed, ...random.slice(0, 14 - fixed.length)].sort((left, right) => right.z - left.z || left.x - right.x);
}

type Result = { value8: number; value10: number; rounds: number; useful: number; opened: number; longest: number };
type TierCount = Record<CrateTier, { opened: number; empty: number }>;
const counts = (): TierCount => ({ wood: { opened: 0, empty: 0 }, green: { opened: 0, empty: 0 }, gold: { opened: 0, empty: 0 } });

function raid(seed: number, raft: boolean, tiers: TierCount): Result {
  const rng = mulberry32(seed);
  const ctx = fresh();
  const sockets = selectSockets(rng);
  assert(sockets.length === 14 && new Set(sockets).size === 14, "14 distinct sockets");
  assert(CRATES.filter(socket => socket.fixed).every(socket => sockets.includes(socket)), "all fixed sockets spawn");
  const loot: string[] = [];
  let longest = 0;
  for (const socket of sockets) {
    if (!raft && (socket.fixed === "vault" || socket.fixed === "sleeper" || socket.z < -20)) continue;
    ctx.fixed = socket.fixed;
    const found = rollCrate(socket.tier, ctx, rng);
    tiers[socket.tier].opened++;
    if (!found.length) tiers[socket.tier].empty++;
    longest = Math.max(longest, ctx.emptyStreak);
    loot.push(...found);
  }
  ctx.fixed = undefined;
  for (const enemy of SPAWNS[seed % SPAWNS.length]) {
    if (!raft && (enemy.kind === "sleeper" || enemy.z < -20)) continue;
    loot.push(...rollEnemyDrop(enemy.kind, ctx, rng));
  }
  const values = loot.filter(id => !["ammo", "key", "attachment"].includes(ITEMS[id].kind))
    .map(id => ITEMS[id].value).sort((left, right) => right - left);
  const sale = (slots: number) => Math.floor(values.slice(0, slots).reduce((sum, value) => sum + value, 0) * (raft ? 1.3 : 1));
  assert(ctx.ammoFound >= 8, `raid ${seed}: ammo floor`);
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
console.log("10,000 seeded raids per route; best 8/10 slot items, pouch inside capacity; ammo/key/equipped mag use no slots.");
console.log("Hatch: southern loop only (no vault, hollow, river or Sleeper). Raft: all 14 sockets + all enemies; fence +30%.");
console.log("Route slots  Mean Median  P10  P90 Rounds Min Opened Empty W/G/G% Streak ZeroUseful%");
const results = new Map<string, Result[]>();
for (const raft of [false, true]) {
  const tiers = counts();
  const raids = Array.from({ length: 10_000 }, (_, seed) => raid(seed, raft, tiers));
  const route = raft ? "Raft" : "Hatch";
  results.set(route, raids);
  for (const slots of [8, 10] as const) {
    const values = raids.map(result => slots === 8 ? result.value8 : result.value10);
    const empty = Object.values(tiers).map(tier => (100 * tier.empty / tier.opened).toFixed(2)).join("/");
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
const pass = affordable === 1 && median8 < firstTwo && raidsToAll >= 4 && bought === 3;
console.log(`Prices: ${JSON.stringify(PRICES)}`);
console.log(`Economy gate: ${pass ? "PASS" : "FAIL"} | first hatch median ${median8}; affordable upgrades ${affordable}; all three in ${raidsToAll} median raids (pack growth included).`);
assert(pass, "economy pacing gate");
