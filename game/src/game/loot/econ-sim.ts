// npm run sim, part two: the Progression v0.2 economy (LORE.md "bananas are power"). Run from loot/sim.ts with the
// demo raid results it already rolled. Gates (each prints a line and throws on FAIL):
//   Net worth   a good first hour (10 raids, the jobs, the first factory line) reaches Manager and not Senior Manager;
//               a poor one (low hauls, 3 bonk-outs, 3 jobs) reaches Associate and not Manager
//   Factory     zero raiding makes zero; a finite stash runs dry and then makes zero; a raid's value-add is capped
//               (tier 3, unstaffed: <= 35% of a median hatch raid; the staffing ceiling: <= 45%)
//   Market      today's prices average near base; holding for the best of the next three raids gains little
//   Gambling    Double or Nothing returns < 1 per banana staked (a sink) but only slightly; betting can't farm net worth
//   Lockboxes   the printed odds are what the roll does; the average prize is worth 1.15-1.6x the fee
import type { SaveV1 } from "../contracts";
import { migrate } from "../core/save";
import { TITLES, titleIndex, titleName } from "../core/networth";
import { credit, debit, freshEcon } from "../core/wallet";
import { LINES, MAX_BATCHES, TIER_RATE, batchValueAdd, lineState, runLines, collectLine } from "../home/factory";
import { claimDelivery } from "../core/settlement";
import { MARKET_POOL, marketRoll } from "./market";
import { landed, winChance } from "../core/gamble";
import { LOCKBOXES, prizeEV, rollPrize } from "./lockbox";
import { itemDef, mulberry32 } from "./tables";
import { itemType, own } from "./instances";
import { tierQuality } from "./tiers";

function gate(ok: boolean, name: string, line: string) { console.log(`${name} gate: ${ok ? "PASS" : "FAIL"} | ${line}`); if (!ok) throw new Error(`${name} gate`); }
type Raid = { items: string[]; value8: number; value10: number };
const pct = (values: number[], f: number) => { const s = [...values].sort((a, b) => a - b); return s[Math.floor((s.length - 1) * f)]; };
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

export function econSim(demo: Map<string, Raid[]>) {
  const hatch = demo.get("hatch")!, cove = demo.get("cove")!, boss = demo.get("boss")!;
  const median = pct(hatch.map((r) => r.value8), 0.5);

  // ---------------------------------------------------------------- Factory
  console.log("Factory lines (base values; one batch):");
  for (const l of LINES) console.log(`  ${l.id}: ${Object.entries(l.inputs).map(([id, n]) => `${n} ${id}`).join(" + ")} -> ${[...Object.entries(l.out).map(([id, n]) => `${n} ${id}`), ...(l.cash ? [`${l.cash} bananas`] : []), ...(l.rounds ? [`${l.rounds.n} ${l.rounds.caliber}`] : [])].join(" + ")}; value-add ${batchValueAdd(l)}; tier rates ${TIER_RATE.join("/")} per raid; upgrades ${l.upgrade.join("/")}`);
  const tier3 = LINES.reduce((a, l) => a + TIER_RATE[2] * Math.max(0, batchValueAdd(l)), 0);
  const ceiling = LINES.reduce((a, l) => a + MAX_BATCHES * Math.max(0, batchValueAdd(l)), 0);
  // the real code: a save with every line built at tier 3, run with no raided inputs at all, then with a finite stash
  const allLines = (): SaveV1 => {
    const s = migrate(null); s.econ = freshEcon(); s.base.items = LINES.map((l, i) => ({ uid: i + 1, def: l.id, x: -16 + i * 5, z: 8, r: 0 as const }));
    s.base.items.push({ uid: 9, def: "generator", x: 6, z: 8, r: 0 }, { uid: 10, def: "press", x: 9, z: 8, r: 0 });
    for (const l of LINES) lineState(s, l.id).tier = 3;
    return s;
  };
  const value = (s: SaveV1) => s.money + [...s.reserved, ...(s.delivery ?? [])].reduce((a, i) => a + itemDef(i).value, 0);
  const runRaids = (s: SaveV1, n: number) => { const made: number[] = []; for (let r = 0; r < n; r++) { const before = value(s); runLines(s, `sim-${r}`); for (const l of LINES) collectLine(s, l.id, claimDelivery); made.push(value(s) - before); } return made; };
  const empty = allLines(), zero = runRaids(empty, 100).reduce((a, b) => a + b, 0);
  const stocked = allLines(); stocked.base.items.push({ uid: 11, def: "stash", x: 12, z: 8, r: 0 }, { uid: 12, def: "stash", x: 12, z: 10, r: 0 });
  for (const [id, n] of Object.entries({ banana: 12, coconut: 3, old_gear: 3, spring: 3, scrap_tin: 3, paper: 9, ink: 3 })) for (let k = 0; k < n; k++) stocked.reserved.push(own(id));
  const stashRuns = runRaids(stocked, 100), dry = stashRuns.slice(5).reduce((a, b) => a + b, 0), fromStash = stashRuns.reduce((a, b) => a + b, 0);
  const bound = LINES.reduce((a, l) => a + batchValueAdd(l) * 3, 0); // the stash above feeds exactly 3 batches of each line
  // realistic: tier 1 ripening room + bottling line fed by what a median-ish hatch raid brings home (upper bound: all of it)
  const real = hatch.slice(0, 2000).map((r) => { const n = (id: string) => r.items.filter((i) => itemType(i) === id).length; return Math.min(1, Math.floor(n("banana") / 2)) * batchValueAdd(LINES[0]) + Math.min(1, Math.floor(Math.max(0, n("banana") - 2) / 2), n("coconut")) * batchValueAdd(LINES[1]); });
  gate(zero === 0 && dry === 0 && fromStash <= bound && tier3 <= 0.35 * median && ceiling <= 0.45 * median, "Factory",
    `zero raiding x100 raids makes ${zero}; a finite stash makes ${fromStash} (bound ${bound}) and ${dry} after it runs dry; per-raid value-add tier 3 ${tier3} = ${(100 * tier3 / median).toFixed(0)}% of a median hatch raid (cap 35%), staffing ceiling ${ceiling} = ${(100 * ceiling / median).toFixed(0)}% (cap 45%); tier-1 ripening + bottling on a hatch haul adds ${mean(real).toFixed(1)} per raid`);

  // ---------------------------------------------------------------- Net worth (thresholds)
  // a good first hour: about 10 raids at 3-6 min plus vault time (Sol's pacing gate); hatch for three, then the cove and
  // the boss route alternate; median hauls (the pack upgrade after raid 2); every money job in the chain; the ripening
  // room bought on reaching Associate (it adds its margin each raid after). A poor hour: quarter-percentile hauls,
  // three bonk-outs (the pouch keeps ~nothing), only the first three jobs.
  const jobs = { good: 20 + 25 + 40 + 30 + 35 + 15 + 120, poor: 20 + 25 + 40 };
  const hour = (q: number, bonks: number[], jobPay: number) => {
    let life = 0, ripen = false; const at: number[] = [];
    for (let r = 1; r <= 10; r++) {
      const route = r <= 3 ? hatch : r % 2 ? boss : cove, slots = r <= 2 ? "value8" : "value10";
      if (!bonks.includes(r)) life += pct(route.map((x) => x[slots]), q) + (ripen ? batchValueAdd(LINES[0]) : 0);
      if (r === 3) life += jobPay * 0.5; if (r === 8) life += jobPay * 0.5; // jobs land through the hour
      if (!ripen && titleIndex(life) >= LINES[0].upgradeTitle[0]) ripen = true;
      at.push(titleIndex(life));
    }
    return { life: Math.round(life), title: titleIndex(life), firstAssociate: at.indexOf(1) + 1, firstManager: at.indexOf(2) + 1 };
  };
  const good = hour(0.5, [], jobs.good), poor = hour(0.25, [2, 5, 8], jobs.poor);
  console.log(`Titles: ${TITLES.map((t) => `${t.name} ${t.at}`).join(", ")}`);
  gate(good.title === 2 && poor.title === 1 && good.firstAssociate <= 3, "Net worth",
    `good first hour ${good.life} -> ${titleName(good.title)} (Associate at raid ${good.firstAssociate}, Manager at raid ${good.firstManager}); poor hour ${poor.life} -> ${titleName(poor.title)}`);
  { // projection: raids to each title on the boss route at the median, with all four lines at tier 3 fed
    const per = pct(boss.map((x) => x.value10), 0.5) + tier3; let life = 2 * 230 + 285, r = 2; const to: string[] = [];
    for (let t = 2; t < TITLES.length; t++) { while (life < TITLES[t].at && r < 5000) { life += per; r++; } to.push(`${TITLES[t].name} ~${r}`); }
    console.log(`  projection (boss-route median ${per - tier3} + factory ${tier3} per raid): ${to.join(", ")} raids`);
  }

  // ---------------------------------------------------------------- Market
  const N = 3000, fac: Record<string, number[]> = {};
  for (let sv = 0; sv < N; sv++) { const m = marketRoll("sim-save", sv); for (const id of MARKET_POOL) (fac[id] ??= []).push(m[id] ?? 1); }
  const all = Object.values(fac).flat(), avg = mean(all);
  const hold = mean(Object.values(fac).flatMap((f) => f.slice(0, N - 3).map((_, i) => Math.max(f[i], f[i + 1], f[i + 2]))));
  const moversOnly = all.filter((f) => f !== 1);
  gate(avg >= 0.98 && avg <= 1.06 && hold <= 1.15, "Market", `${MARKET_POOL.length} goods, 6 movers a raid; mean price factor ${avg.toFixed(3)} (movers ${mean(moversOnly).toFixed(3)}); holding for the best of the next 3 raids pays ${hold.toFixed(3)}x base`);

  // ---------------------------------------------------------------- Gambling
  const rng = mulberry32(4242), R = 400_000; let coinIn = 0, coinOut = 0, wheelIn = 0, wheelOut = 0;
  for (let i = 0; i < R; i++) { coinIn += 100; if (landed("coin", "heads", rng()).side === "heads") coinOut += 200; wheelIn += 100; if (landed("wheel", "red", rng()).side === "red") wheelOut += 200; }
  // betting and net worth: 2000 players, 100 raids each, staking 100 every raid; what betting adds to net worth (the wallet's high-water rule)
  const farm: number[] = [];
  for (let p = 0; p < 2000; p++) { const s = migrate(null); s.econ = freshEcon(); s.money = 1e6; for (let r = 0; r < 100; r++) { debit(s, "gambleStake", 100); if (rng() < winChance("coin")) credit(s, "gamblePay", 200); } farm.push(s.econ!.lifetime); }
  const haul300 = { hatch: mean(hatch.map((r) => +(r.value8 >= 300))), cove: mean(cove.map((r) => +(r.value8 >= 300))), boss: mean(boss.map((r) => +(r.value8 >= 300))) };
  gate(coinOut / coinIn < 1 && coinOut / coinIn > 0.96 && wheelOut / wheelIn < 1 && wheelOut / wheelIn > 0.95 && mean(farm) <= 2000, "Gambling",
    `Double or Nothing returns ${(coinOut / coinIn).toFixed(4)} per banana on the coin (${(winChance("coin") * 100).toFixed(0)}% to win), ${(wheelOut / wheelIn).toFixed(4)} on the wheel (${(winChance("wheel") * 100).toFixed(1)}%); 100 raids of all-in 100-banana flips add ${mean(farm).toFixed(0)} to net worth on average (100 raids of median hauls add ~${Math.round(median * 100)}); Sal's 300-haul wager (2x) wins ${(100 * haul300.hatch).toFixed(0)}% hatch / ${(100 * haul300.cove).toFixed(0)}% cove / ${(100 * haul300.boss).toFixed(0)}% boss (EV ${(2 * haul300.boss).toFixed(2)} per banana on the boss route)`);

  // ---------------------------------------------------------------- Lockboxes
  const rows: string[] = []; let oddsOk = true, evOk = true;
  for (const box of LOCKBOXES) {
    const r2 = mulberry32(77), counts = [0, 0, 0, 0, 0, 0, 0], M = 60_000; let worth = 0;
    for (let i = 0; i < M; i++) { const id = rollPrize(box, r2(), r2()); counts[tierQuality(itemDef(id).rarity)]++; worth += itemDef(id).value; }
    for (let q = 1; q <= 6; q++) if (Math.abs(counts[q] / M * 100 - box.odds[q - 1]) > 1.2) oddsOk = false;
    const ev = prizeEV(box), ratio = ev / box.fee; if (ratio < 1.15 || ratio > 1.6) evOk = false;
    rows.push(`${box.id} fee ${box.fee}, odds ${box.odds.join("/")}, average prize ${ev.toFixed(1)} (${ratio.toFixed(2)}x fee; rolled ${(worth / M).toFixed(1)})`);
  }
  gate(oddsOk && evOk, "Lockboxes", `printed odds match the roll within 1.2 points; ${rows.join("; ")}`);
}
