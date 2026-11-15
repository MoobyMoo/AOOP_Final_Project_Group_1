// Property tests for the Progression v0.2 economy (run by npm run test:settlement, after its localStorage stub). Every
// operation runs on real saves through Sol's settlement and is checked two ways:
//   items   owned identities before - what left + what arrived = owned identities after (no item made or lost)
//   bananas money after - money before = the sum of the ledger entries the operation wrote (nothing bypasses it)
// and net worth (lifetime earned) never goes down.
import type { SaveV1 } from "../contracts";
import { commitSave, migrate } from "../core/save";
import { beginRaid, checkpointRaid, ownedItems, settleRaid, validateOwnership, claimDelivery } from "../core/settlement";
import { instanceId, itemType, own } from "./instances";
import { mulberry32, itemDef } from "./tables";
import { LINES, MAX_BATCHES, collectLine, lineRate, lineState, runLines, upgradeLine, feedable } from "../home/factory";
import { STAKES, WAGERS, haulOffer, payoutFor, placeWager, rollDouble, winChance, landed } from "../core/gamble";
import { LOCKBOXES, canOpen, openLockbox, PRIZES } from "./lockbox";
import { ledgerMark, movedSince, credit, freshEcon, lifetime, title } from "../core/wallet";
import { marketPrice, marketMovers, refreshMarket } from "./market";
import { titleIndex } from "../core/networth";
import { build, canBuild } from "../home/facilities";

let checks = 0;
function assert(ok: unknown, message: string): asserts ok { checks++; if (!ok) throw new Error(message); }
const ids = (items: readonly string[]) => items.map(instanceId).sort().join(",");
const runEntries = (s: SaveV1, mark: number) => (s.econ?.ledger ?? []).filter((e) => e.seq >= mark);
/** the two conservation checks around one operation */
function conserved(before: SaveV1, after: SaveV1, mark: number, what: string) {
  assert(after.money - before.money === movedSince(after, mark), `${what}: bananas moved = ledger entries`);
  const entries = runEntries(after, mark), gone = entries.flatMap((e) => e.in ?? []), came = entries.flatMap((e) => e.out ?? []);
  const goneIds = new Set(gone.map(instanceId)), wasOwned = new Set(ownedItems(before).map(instanceId));
  const expected = [...ownedItems(before).filter((i) => !goneIds.has(instanceId(i))), ...came.filter((i) => !wasOwned.has(instanceId(i)))];
  assert(ids(expected) === ids(ownedItems(after)), `${what}: items before - left + arrived = after`);
  assert(lifetime(after) >= lifetime(before) && title(after) >= title(before), `${what}: net worth never goes down`);
  validateOwnership(after);
}
const home = (): SaveV1 => { const s = commitSave(migrate(null)); s.econ = freshEcon(); refreshMarket(s); return s; };
const place = (s: SaveV1, def: string, x: number, z: number) => { s.base.items.push({ uid: s.base.next++, def, x, z, r: 0 }); };

// ---------------------------------------------------------------- factory: 200 seeds of random stashes, lines, tiers, raids, collections
let batchesRun = 0, collected = 0;
const INPUTS = ["banana", "coconut", "old_gear", "spring", "scrap_tin", "paper", "ink", "honey_pot"];
for (let seed = 1; seed <= 200; seed++) {
  const rng = mulberry32(seed * 7919);
  let s = home();
  s.money = 0; credit(s, "sale", 2000 + Math.floor(rng() * 4000)); // seed some net worth and money through the ledger
  place(s, "stash", -16, 10); place(s, "stash", -12, 10); place(s, "generator", 6, 8); place(s, "press", 9, 8);
  LINES.forEach((l, i) => { if (rng() < 0.75) place(s, l.id, -16 + i * 5, 4); });
  for (const l of LINES) { const t = 1 + Math.floor(rng() * 3); lineState(s, l.id).tier = t; if (rng() < 0.2) lineState(s, l.id).staff = 1 + rng() * 3; }
  for (const id of INPUTS) for (let k = Math.floor(rng() * 9); k > 0; k--) s.reserved.push(own(id));
  s = commitSave(s);
  for (let raid = 0; raid < 6; raid++) {
    // a raid: deploy, maybe pick up a banana, come home (bonked or quit, so the exit rules don't matter here)
    const outbound = beginRaid(s, `f-${seed}-${raid}`, [], s.gear);
    const pack = rng() < 0.5 ? [own("banana"), own("coconut")] : [];
    const cp = checkpointRaid(outbound, { pack, gear: outbound.activeRaid!.gear, guns: outbound.guns, world: [], consumed: [], x: 0, z: 0, ammo: outbound.ammo, elapsed: 30 });
    const mark = ledgerMark(cp), feeds = Object.fromEntries(LINES.map((l) => [l.id, feedable(cp, l)]));
    const settled = settleRaid(cp, rng() < 0.5 ? "bonked" : "quit", 2);
    const rec = settled.settlements!.at(-1)!;
    // the settlement balances on its own (Sol's ledger); then each run entry: inputs left the stash, outputs are on a tray
    const runs = runEntries(settled, mark).filter((e) => e.k === "run");
    for (const e of runs) {
      const def = LINES.find((l) => e.note?.startsWith(l.id + " "))!, batches = Number(/x(\d+)/.exec(e.note!)![1]);
      assert(batches >= 1 && batches <= Math.min(MAX_BATCHES, lineRate(lineState(settled, def.id))), "a run makes at most the line's rate (and never past the cap)");
      assert((e.in ?? []).length === batches * Object.values(def.inputs).reduce((a, b) => a + b, 0), "a run consumes exactly its inputs");
      assert((e.out ?? []).length === batches * Object.values(def.out).reduce((a, b) => a + b, 0), "a run makes exactly its outputs");
      assert((e.in ?? []).every((i) => !ownedItems(settled).includes(i)) && (e.out ?? []).every((i) => lineState(settled, def.id).tray.includes(i)), "inputs are gone; outputs wait on the tray");
      assert(feeds[def.id] >= 0, "feed counted"); batchesRun += batches;
    }
    const runIn = new Set(runs.flatMap((e) => e.in ?? []).map(instanceId)), runOut = runs.flatMap((e) => e.out ?? []);
    assert(ids([...rec.after.filter((i) => !runIn.has(instanceId(i))), ...runOut]) === ids(ownedItems(settled)), "settlement after - run inputs + run outputs = owned");
    assert(settled.money - cp.money === movedSince(settled, mark), "a raid's bananas all go through the ledger");
    assert(settleRaid(settled, "quit", 2) === settled && runLines(settled, rec.id).length === 0, "a raid runs each line once");
    s = commitSave(settled);
    if (rng() < 0.6) for (const l of LINES) { // collect some trays (built or not)
      const before = structuredClone(s), m = ledgerMark(s);
      const got = collectLine(s, l.id, claimDelivery);
      conserved(before, s, m, `collect ${l.id}`);
      assert(s.money - before.money === got.cash, "collected cash lands in the wallet");
      if (l.rounds) assert(s.ammo[l.rounds.caliber] - before.ammo[l.rounds.caliber] === got.rounds, "collected rounds land in the loose ammo");
      assert(lineState(s, l.id).tray.length === 0 && lineState(s, l.id).cash === 0, "the tray is empty after collecting"); collected += got.items.length + got.cash;
    }
    if (rng() < 0.3) { const l = LINES[Math.floor(rng() * LINES.length)]; const before = structuredClone(s), m = ledgerMark(s); const ok = upgradeLine(s, l.id); conserved(before, s, m, "line upgrade"); assert(ok ? s.money < before.money : s.money === before.money, "an upgrade pays only when it happens"); }
  }
}
assert(batchesRun > 300 && collected > 300, `the factory property test exercised real runs (${batchesRun} batches, ${collected} collected)`);
{ // the hard rule: no inputs, no output, however many raids
  let s = home(); place(s, "generator", 6, 8); place(s, "press", 9, 8); LINES.forEach((l, i) => { place(s, l.id, -16 + i * 5, 4); lineState(s, l.id).tier = 3; });
  for (let r = 0; r < 40; r++) { s = settleRaid(beginRaid(s, `dry-${r}`, [], s.gear), "quit", 2); for (const l of LINES) collectLine(s, l.id, claimDelivery); }
  assert(LINES.every((l) => lineState(s, l.id).tray.length === 0) && s.money === 0 && !s.reserved.length, "zero raided inputs make nothing");
}
{ // net-worth gates on the blueprint desk
  const s = home(); s.money = 0; credit(s, "sale", 300);
  assert(!canBuild(s, "ripen").ok && /Associate/.test(canBuild(s, "ripen").reason), "the ripening room needs Associate");
  credit(s, "sale", 400); assert(title(s) === 1 && canBuild(s, "ripen").ok, "Associate opens it");
  const m = ledgerMark(s), before = structuredClone(s), r = build(s, "ripen", 3, 3, 0);
  assert(r.ok && s.money === before.money - 150 && movedSince(s, m) === -150, "building pays its cost through the ledger");
  assert(!canBuild(s, "scrappress").ok && !canBuild(s, "coupon").ok, "the scrap press and coupon press wait for higher titles (and their prerequisites)");
}

// ---------------------------------------------------------------- Sal's wagers: 300 seeds of bets, outcomes and stakes
for (let seed = 1; seed <= 300; seed++) {
  const rng = mulberry32(seed * 104729);
  const s = home(); credit(s, "sale", Math.floor(rng() * 300));
  const w = WAGERS[Math.floor(rng() * WAGERS.length)], stake = STAKES[Math.floor(rng() * STAKES.length)];
  const placed = placeWager(s, w.id, stake);
  assert(placed.ok === s.money >= stake, "a wager is placed only if you can cover it");
  if (!placed.ok) continue;
  if (rng() < 0.15) s.money -= 0; // (the wallet stays as it is: placing moves nothing)
  const m0 = ledgerMark(s), money0 = s.money;
  const raid = beginRaid(s, `w-${seed}`, [], s.gear);
  assert(raid.money === money0 - stake && movedSince(raid, m0) === -stake && raid.econ!.wager?.state === "riding" && raid.econ!.wager.raid === `w-${seed}`, "the stake leaves on launch, bound to the raid");
  const extract = rng() < 0.7, rich = rng() < 0.5, rifle = rng() < 0.4, boss = rng() < 0.4;
  const pack = [...(rich ? [own("golden_banana"), own("golden_banana"), own("golden_banana"), own("golden_banana")] : [own("coconut")]), ...(rifle ? [own("bootleg_rifle")] : [])];
  const cp = checkpointRaid(raid, { pack, gear: raid.activeRaid!.gear, guns: raid.guns, world: [], consumed: [], x: 0, z: 0, ammo: raid.ammo, elapsed: 400 });
  if (boss) cp.activeRaid!.feats = ["ko:boss"];
  const m1 = ledgerMark(cp), settled = settleRaid(cp, extract ? "hatch" : "bonked", 2), rec = settled.settlements!.at(-1)!;
  const won = extract && (w.id === "haul300" ? rec.value >= 300 : w.id === "foreman" ? boss : rifle);
  const pay = won ? payoutFor(w, stake) : 0;
  assert(settled.econ!.lastWager?.won === won && settled.econ!.lastWager.paid === pay && settled.econ!.wager === null, `the wager is judged once and correctly (${w.id})`);
  assert(settled.money - cp.money === movedSince(settled, m1) && movedSince(settled, m1) === pay + (rec.bonus ?? 0), "a payout goes through the ledger");
  assert(settleRaid(settled, "hatch", 2) === settled, "a settled raid can't pay a wager twice");
  validateOwnership(settled);
}
{ // a bet the wallet can't cover at launch is called off, nothing paid
  const s = home(); credit(s, "sale", 60); placeWager(s, "haul300", 50); s.money = 10;
  const raid = beginRaid(s, "broke", [], s.gear);
  assert(raid.econ!.wager === null && raid.money === 10, "an uncovered bet is called off at launch");
}

// ---------------------------------------------------------------- Double or Nothing: 400 seeds
let wins = 0, rolls = 0;
for (let seed = 1; seed <= 400; seed++) {
  const rng = mulberry32(seed * 15485863);
  const s = home(), valuables = Array.from({ length: 1 + Math.floor(rng() * 5) }, () => own(["golden_banana", "brass_compass", "sunset_mango", "coconut", "banana_notes"][Math.floor(rng() * 5)]));
  const raid = beginRaid(s, `d-${seed}`, [], s.gear);
  const bonk = rng() < 0.15;
  const cp = checkpointRaid(raid, { pack: [...valuables, own("spring")], gear: raid.activeRaid!.gear, guns: raid.guns, world: [], consumed: [], x: 0, z: 0, ammo: raid.ammo, elapsed: 300 });
  const settled = commitSave(settleRaid(cp, bonk ? "bonked" : "hatch", 2)), id = `d-${seed}`, offer = haulOffer(settled, id);
  if (bonk) { assert(offer === null, "a bonk-out can't be rolled"); continue; }
  assert(!!offer && offer.items.length === valuables.length && offer.sold === valuables.reduce((a, i) => a + marketPrice(settled, i), 0), "the Fence offers the haul's valuables at today's prices (not the spring)");
  const game = rng() < 0.5 ? "coin" : "wheel", pick = game === "coin" ? (rng() < 0.5 ? "heads" : "tails") : (rng() < 0.5 ? "red" : "black");
  const stake = Math.max(1, Math.floor(offer!.cap * [0.25, 0.5, 1][Math.floor(rng() * 3)])), u = rng();
  assert(rollDouble(settled, id, offer!.cap + 1, game, pick, u) === null, "a stake above the haul's sale bananas is refused");
  const frozen = JSON.stringify(settled), m = ledgerMark(settled);
  const res = rollDouble(settled, id, stake, game, pick, u);
  assert(!!res && JSON.stringify(settled) === frozen, "a roll works on a copy");
  const after = res!.save, won = landed(game, pick, u).side === pick;
  assert(res!.result.won === won && after.money === settled.money + offer!.sold - stake + (won ? 2 * stake : 0), "sold + stake + payout balance");
  conserved(settled, after, m, "Double or Nothing");
  assert(!after.reserved.some((i) => offer!.items.includes(i)) && after.reserved.some((i) => itemType(i) === "spring"), "only the valuables were sold; the spring stays");
  assert(rollDouble(after, id, 1, game, pick, 0.1) === null && haulOffer(after, id)!.rolled, "one roll per raid");
  rolls++; if (won) wins++;
}
assert(Math.abs(wins / rolls - (winChance("coin") + winChance("wheel")) / 2) < 0.08, "the roll's win rate matches the odds shown");

// ---------------------------------------------------------------- lockboxes: 400 seeds
for (let seed = 1; seed <= 400; seed++) {
  const rng = mulberry32(seed * 2654435761);
  const s = home(); credit(s, "sale", Math.floor(rng() * 200));
  const box = own(LOCKBOXES[Math.floor(rng() * LOCKBOXES.length)].id); s.reserved.push(box);
  if (rng() < 0.2) s.reserved.push(...Array.from({ length: 40 }, () => own("plank"))); // a full stash: the prize waits in delivery
  const fee = LOCKBOXES.find((b) => b.id === itemType(box))!.fee, can = canOpen(s, box), frozen = JSON.stringify(s), m = ledgerMark(s);
  const res = openLockbox(s, box, rng(), rng());
  assert(JSON.stringify(s) === frozen, "opening works on a copy");
  if (s.money < fee) { assert(!can.ok && res === null, "a box you can't pay for stays shut"); continue; }
  assert(!!res && res.save.money === s.money - fee, "the fee is paid once");
  conserved(s, res!.save, m, "lockbox");
  assert(!ownedItems(res!.save).includes(box) && ownedItems(res!.save).includes(res!.prize), "the box is consumed; the prize is owned");
  assert(Object.values(PRIZES).flat().some((p) => p.id === itemType(res!.prize)), "the prize comes from the printed pools");
  assert(openLockbox(res!.save, box, 0.5, 0.5) === null, "a box opens once");
}
{ const s = home(); credit(s, "sale", 500); const box = own("lockbox_rare"); s.reserved.push(box); const raid = beginRaid(s, "lb-raid", [], s.gear); assert(openLockbox(raid, box, 0.1, 0.1) === null, "lockboxes open at home only"); }

// ---------------------------------------------------------------- the market, migration of net worth
{
  const s = home(); s.raids = 7; refreshMarket(s);
  const movers = marketMovers(s); assert(movers.length === 6 && movers.every((m) => m.price === Math.max(1, Math.round(m.base * m.factor))), "six movers with today's price");
  const id = movers[0].id; assert(marketPrice(s, own(id)) === movers[0].price && marketPrice(s, own("lockbox_fine")) === 0, "the price API: movers at today's price, lockboxes worth nothing");
  const again = structuredClone(s); refreshMarket(again); assert(JSON.stringify(again.econ!.market) === JSON.stringify(s.econ!.market), "the board holds until the next raid");
  const old = migrate({ v: 1, money: 2500, raids: 9 });
  assert(old.econ!.lifetime === 2500 && titleIndex(2500) === 2 && old.econ!.reviewed === 2, "an old save starts at the net worth it holds, its title already reviewed");
  assert(itemDef("lockbox_epic").kind === "lockbox" && itemDef("paper").value > 0, "new item defs");
}
console.log(`Economy self-test: PASS (${checks} checks; factory runs and collections, wagers, Double or Nothing, lockboxes, market, net worth; items and bananas conserved)`);
