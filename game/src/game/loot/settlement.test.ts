import { migrate, commitSave, load } from "../core/save";
import { beginRaid, checkpointRaid, settleRaid, validateOwnership, ownedItems } from "../core/settlement";
import { instanceId, own, itemType, withCount } from "./instances";
import { fmtInst, parseInst, wear } from "./equipment";
import { itemDef, mulberry32 } from "./tables";
import { EXIT_DEFS, exitCondition, advanceExit, exitCosts } from "../world/extraction";
import { G } from "../core/state";
import { bindLootApi, lootHook } from "./lootables";
import { createSearch, advanceSearch, take } from "./search";
import { ATT_SLOTS, EMPTY_GUN, attachmentDef } from "./attachments";
import { craft, stashCapacity, stashUsed } from "../home/facilities";
import { deploy, cancelDeploy, settleDeploy, destOf } from "../core/deployment";

let checks = 0;
function assert(ok: unknown, message: string): asserts ok { checks++; if (!ok) throw new Error(message); }
const ids = (items: string[]) => items.map(instanceId).sort().join(",");
const data = new Map<string, string>();
const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
const { fit, unfit, GUN } = await import("../combat/gunstats");

const helmet = own("hardhat#38");
const ammo = own("ammo45"), half = withCount(ammo, 4);
assert(instanceId(ammo) === instanceId(half) && itemDef(half).stack === 4 && itemDef(half).weight === 0.08, "partial stack quantity, weight and identity agree");
assert(parseInst(helmet)?.dur === 38 && instanceId(wear(helmet, 5)) === instanceId(helmet), "wear preserves identity");
assert(instanceId(fmtInst(helmet)) === instanceId(helmet) && parseInst(fmtInst(helmet))?.dur === 100, "repair preserves identity");
assert(itemDef(helmet).value === 22 && itemDef(own("banana")).weight === itemDef("banana").weight, "all views agree on condition and weight");
const legacy = migrate({ reserved: ["banana", "banana"], locker: ["hardhat#38", "hardhat#38"] });
commitSave(legacy);
const upgraded = load();
assert(new Set(ownedItems(upgraded).map(instanceId)).size === ownedItems(upgraded).length, "migration distinguishes identical legacy instances");
assert(upgraded.locker.filter(inst => itemType(inst) === "hardhat").length === 2, "legacy locker migration preserves identical physical gear");
assert(ownedItems(upgraded).some(inst => itemType(inst) === "kingpin"), "the bound Kingpin has a persistent instance identity");
assert(ids(ownedItems(upgraded)) === ids(ownedItems(load())), "reload preserves migrated identities");
const unworn = structuredClone(upgraded), restored = { ...unworn.gear };
unworn.gear.body = null;
const restoredRaid = beginRaid(unworn, "restored-bound-kit", [], restored);
assert(settleRaid(restoredRaid, "hatch", 2).gear.body === restored.body, "deploy snapshot includes bound instances restored from their locker position");

for (let seed = 1; seed <= 150; seed++) {
  const random = mulberry32(seed), initial = load();
  initial.activeRaid = undefined; initial.settlements = [];
  const before = ownedItems(initial), pack: string[] = [], ground: string[] = [], consumed: string[] = [];
  let gear = { ...initial.gear };
  let current = beginRaid(initial, `property-${seed}`, pack, gear);
  const minted: string[] = [];
  for (let step = 0; step < 100; step++) {
    const choice = Math.floor(random() * 7);
    if (choice === 0 && pack.length < 8) { const inst = own(["hardhat#38", "banana", "att_mag_ext", "att_mag_quick", "att_laser", "bandage"][Math.floor(random() * 6)]); minted.push(inst); pack.push(inst); }
    if (choice === 1 && pack.length) ground.push(pack.splice(Math.floor(random() * pack.length), 1)[0]);
    if (choice === 2 && ground.length && pack.length < 8) pack.push(ground.pop()!);
    if (choice === 3) { const index = pack.findIndex(inst => itemType(inst) === "bandage"); if (index >= 0) consumed.push(pack.splice(index, 1)[0]); }
    if (choice === 4) { const index = pack.findIndex(inst => itemType(inst) === "hardhat"); if (index >= 0) { const old = gear.head; gear.head = pack.splice(index, 1)[0]; if (old) { if (itemType(old) === "bowler") current.locker.push(old); else pack.push(old); } } }
    G.save = current; G.scene = "raid"; G.alive = true; G.mag = Math.min(GUN.mag, 12); G.ammo = 12 - G.mag; G.reloadT = -1;
    if (choice === 5) { const index = pack.findIndex(inst => !!attachmentDef(inst)); if (index >= 0) { const result = fit(pack.splice(index, 1)[0]); if (result.ok && result.old) pack.push(result.old); } }
    if (choice === 6 && pack.length < 8) { const inst = unfit(ATT_SLOTS[Math.floor(random() * ATT_SLOTS.length)]); if (inst) pack.push(inst); }
    assert(G.mag + G.ammo === 12, `fit/unfit preserves loaded plus reserve seed ${seed} step ${step}`);
    current = checkpointRaid(current, { pack, gear, gun: G.save.gun, world: ground, consumed, x: 4, z: 5, ammo: 12, elapsed: step });
    validateOwnership(current);
  }
  const reason = seed % 3 === 0 ? "quit" : seed % 3 === 1 ? "bonked" : "hatch";
  const result = settleRaid(current, reason, 2);
  const record = result.settlements!.at(-1)!;
  assert(record.rounds.before === record.rounds.after + record.rounds.spent + record.rounds.abandoned, `round ledger seed ${seed}`);
  const fitted = Object.values(current.activeRaid!.gun ?? EMPTY_GUN).filter((inst): inst is string => !!inst);
  assert(reason === "hatch" ? fitted.every(inst => Object.values(result.gun).includes(inst)) : fitted.every(inst => result.satchel?.items.includes(inst)) && Object.values(result.gun).every(inst => !inst), `attachment stakes seed ${seed}`);
  assert(ids([...ownedItems(result), ...record.consumed, ...record.abandoned]) === ids([...before, ...minted]), `conservation seed ${seed}`);
  assert(JSON.stringify(settleRaid(result, reason, 2)) === JSON.stringify(result), `idempotent seed ${seed}`);
  commitSave(result);
  assert(ids(ownedItems(load())) === ids(ownedItems(result)), `settled reload seed ${seed}`);
}
const full = beginRaid(load(), "full", Array.from({ length: 8 }, () => own("banana")), load().gear);
const attachmentSave = commitSave(migrate(null)); attachmentSave.ammo = 19; attachmentSave.gun.mag = own("att_mag_ext");
G.save = beginRaid(attachmentSave, "magazine-spill", [], attachmentSave.gear); G.scene = "raid"; G.alive = true; G.reloadT = -1; G.mag = 12; G.ammo = 7;
const magazine = unfit("mag");
assert(G.mag === 8 && G.ammo === 11 && magazine === attachmentSave.gun.mag, "smaller magazine returns four loaded rounds without changing the attachment id");
G.save.gun.mag = magazine;
const attachmentDeath = settleRaid(checkpointRaid(G.save, { pack: [], gun: G.save.gun, gear: G.save.gear, world: [], consumed: [], x: 1, z: 2, ammo: 19, elapsed: 1 }), "bonked", 2);
assert(attachmentDeath.satchel?.items.includes(magazine!) && !attachmentDeath.gun.mag, "bonk detaches magazine into recoverable satchel even with an empty pack");
const attachmentRetry = beginRaid(attachmentDeath, "attachment-recovery", [], attachmentDeath.gear);
const attachmentRecovered = settleRaid(checkpointRaid({ ...attachmentRetry, satchel: null }, { pack: [magazine!], gun: attachmentRetry.gun, gear: attachmentRetry.gear, world: [], consumed: [], x: 1, z: 2, ammo: 19, elapsed: 1 }), "hatch", 2);
assert(attachmentRecovered.locker.filter(inst => inst === magazine).length === 1 && !attachmentRecovered.satchel, "attachment recovery retains the exact instance once in the locker");
const { sellEquip } = await import("./equipment-actions");
G.scene = "bunker"; G.save = structuredClone(attachmentRecovered);
const saleBefore = ownedItems(G.save), saleMoney = G.save.money, soldIndex = G.save.locker.indexOf(magazine!);
assert(sellEquip(soldIndex) === itemDef(magazine!).value && G.save.money === saleMoney + itemDef(magazine!).value && ids(ownedItems(G.save)) === ids(saleBefore.filter(inst => inst !== magazine)), "explicit sale removes exactly one attachment identity and credits its value");
const reloadGun = beginRaid(attachmentSave, "fitted-reload", [], attachmentSave.gear); commitSave(reloadGun);
const reloadedGun = load();
assert(!reloadedGun.gun.mag && reloadedGun.satchel?.items.includes(attachmentSave.gun.mag!), "reload detaches the same fitted attachment into a single satchel");
const settled = settleRaid(full, "hatch", 2);
assert(ownedItems(settled).length === ownedItems(full).length, "full home storage keeps extraction overflow owned");
const recovery = beginRaid(settled, "reload", [own("banana"), own("banana"), own("coconut")], settled.gear);
commitSave(recovery);
const recovered = load();
assert(!recovered.activeRaid && recovered.satchel?.items.length === 1, "forced reload bonks latest checkpoint and preserves corpse");
assert(JSON.stringify(load()) === JSON.stringify(recovered), "reloading recovered settlement cannot repeat it");
const corpse = recovered.satchel!;
const retry = beginRaid(recovered, "corpse-recovery", [], recovered.gear);
const reclaimed = checkpointRaid({ ...retry, satchel: null }, { pack: [...corpse.items], gear: retry.activeRaid!.gear, world: [], consumed: [], x: corpse.x, z: corpse.z, ammo: retry.ammo, elapsed: 1 });
const safe = settleRaid(reclaimed, "hatch", 2);
assert(corpse.items.every(inst => ownedItems(safe).includes(inst)) && !safe.satchel, "recovered corpse transfers exactly once to owned storage");
const secondDeath = settleRaid(beginRaid(recovered, "second-death", [], recovered.gear), "bonked", 2);
assert(corpse.items.every(inst => secondDeath.settlements!.at(-1)!.abandoned.includes(inst)), "second death explicitly records expiration of the previous corpse");
let missingRejected = false;
try { checkpointRaid(retry, { pack: [], world: [], consumed: [], x: 0, z: 0, ammo: 0, elapsed: 1, gear: { ...retry.activeRaid!.gear, head: null } }); } catch { missingRejected = true; }
assert(missingRejected, "a transfer that silently deletes an owned instance is rejected");
G.save = safe; G.scene = "raid"; G.alive = true; G.pack = [];
const session = createSearch(["banana", "banana"]); advanceSearch(session, 10);
const target = { session, items: session.slots.map(slot => slot.item), opened: false } as typeof G.crates[number];
let capacity = 0;
bindLootApi({ session: () => session, begin: () => session, end: () => {}, current: () => target, nearest: () => target, fits: () => G.pack.length < capacity, give: inst => { if (G.pack.length >= capacity) return false; G.pack.push(inst); return true; }, take, nearby: () => [] });
assert(lootHook.take(target, 0) === null && !session.slots[0].taken, "full capacity never removes source item");
capacity = 8;
const transfer = lootHook.take(target, 0);
assert(transfer === G.pack[0] && !target.items!.includes(transfer!), "loot hook moves the exact instance out of its source");
G.alive = false;
assert(lootHook.take(target, 1) === null && !session.slots[1].taken, "an open loot target cannot transfer after settlement freezes input");
G.alive = true;
const stable = storage.getItem("bv_g1");
const invalid = structuredClone(recovered); invalid.locker.push(invalid.gear.head!);
let rejected = false;
try { commitSave(invalid); } catch { rejected = true; }
assert(rejected && storage.getItem("bv_g1") === stable, "duplicate validation leaves saved bytes untouched");
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { ...storage, setItem() { throw new Error("QuotaExceededError"); } } });
rejected = false; try { commitSave(recovered); } catch { rejected = true; }
assert(rejected && storage.getItem("bv_g1") === stable, "failed atomic write keeps prior commit");
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
assert(exitCondition(EXIT_DEFS.hatch, [], 0).open, "hatch is always available");
assert(!exitCondition(EXIT_DEFS.boat, [], 0).open && exitCondition(EXIT_DEFS.boat, [own("oar")], 0).open, "boat requires owned oar");
const toll = own("oar");
assert(exitCosts({ ...EXIT_DEFS.boat, requirements: [{ kind: "item", item: "oar", consume: true }] }, [toll])[0] === toll && exitCosts(EXIT_DEFS.boat, [toll]).length === 0, "exit cost policy distinguishes consumed tolls from reusable requirements");
assert(!exitCondition({ ...EXIT_DEFS.hatch, requirements: [{ kind: "boss", flag: "boss-down" }] }, [], 10).open && exitCondition({ ...EXIT_DEFS.hatch, requirements: [{ kind: "boss", flag: "boss-down" }] }, [], 10, ["boss-down"]).open, "boss requirement reads the explicit flag");
assert(!exitCondition({ ...EXIT_DEFS.hatch, requirements: [{ kind: "timed", from: 10, until: 20 }] }, [], 9).open && exitCondition({ ...EXIT_DEFS.hatch, requirements: [{ kind: "timed", from: 10, until: 20 }] }, [], 10).open, "time window uses inclusive endpoints");
assert(advanceExit({ ...EXIT_DEFS.hatch, interruptOnDamage: true }, 2, 1, { inside: true, alive: true, open: true, damaged: true }) === 0, "exit-specific damage interruption is honored");
assert(advanceExit(EXIT_DEFS.hatch, 2, 1, { inside: true, alive: true, open: true, damaged: true }) === 3, "damage and movement within ring do not interrupt");
assert(advanceExit(EXIT_DEFS.hatch, 2, 1, { inside: false, alive: true, open: true }) === 0, "leaving resets countdown");
assert(advanceExit(EXIT_DEFS.hatch, 2, 1, { inside: true, alive: false, open: true }) === 0, "death cancels countdown");
{
  const home = commitSave(migrate(null));
  home.reserved = Array.from({ length: stashCapacity(home) - 1 }, () => own("banana"));
  const brought = [own("oar"), own("att_laser"), own("hardhat#38")];
  const arrived = settleRaid(beginRaid(home, "overflow", brought, home.gear), "hatch", 2);
  const buffer = (arrived as typeof arrived & { delivery?: string[] }).delivery ?? [];
  assert(stashUsed(arrived) === stashCapacity(arrived) && ids(buffer) === ids(brought.slice(1)), "extraction fills shared capacity then buffers every excess instance");
  commitSave(arrived);
  assert(ids(ownedItems(load())) === ids(ownedItems(arrived)), "delivery survives reload with stable identities");
  const sale = structuredClone(arrived), removed = sale.reserved.shift()!;
  sale.money += itemDef(removed).value;
  const claimed = commitSave(sale);
  assert(claimed.locker.includes(brought[1]) && stashUsed(claimed) === stashCapacity(claimed), "freeing a slot claims the first delivery without overflow");
  assert(ids(ownedItems(claimed)) === ids(ownedItems(arrived).filter(inst => inst !== removed)), "delivery claim and sale balance the identity ledger");
  assert(JSON.stringify(commitSave(claimed)) === JSON.stringify(claimed), "delivery claim is idempotent");
  claimed.base.items.push({ uid: 999, def: "stash", x: -15, z: -8, r: 0 });
  const expanded = commitSave(claimed);
  assert(expanded.locker.includes(brought[2]) && !(expanded as typeof expanded & { delivery?: string[] }).delivery?.length, "safe-deposit wall capacity releases remaining delivery");
}
{
  const home = commitSave(migrate(null)); home.money = 100; home.raids = 10;
  home.reserved = [own("vine_rope"), own("spring"), own("banana"), own("banana")];
  home.base.items.push({ uid: 1, def: "med", x: 5, z: 2, r: 0 }, { uid: 2, def: "generator", x: -15, z: 2, r: 0 }, { uid: 3, def: "press", x: 12, z: 2, r: 0 });
  const original = [...home.reserved], money = home.money, rounds = home.ammo;
  assert(craft(home, "bandage") && craft(home, "smoothie") && craft(home, "rounds8"), "crafting resolves identified inputs");
  assert(home.money === money && home.ammo === rounds + 8 && home.reserved.every(inst => !!instanceId(inst)), "craft outputs own identities and conserve currency and explicit ammunition output");
  assert(!home.reserved.some(inst => original.includes(inst)) && home.reserved.length === 3, "crafting consumes each input identity once and mints exact outputs");
  const unchanged = JSON.stringify(home); assert(!craft(home, "rounds8") && JSON.stringify(home) === unchanged, "missing crafting inputs change nothing");
  home.stats.extracts = 1;
  const fare = destOf("plantation");
  assert(!!fare, "test destination exists");
  settleDeploy(); const identity = ids(ownedItems(home)); let writes = 0;
  const write = () => { writes++; };
  assert(deploy(fare.id, home, write).ok && home.money === money - fare.cost, "deploy pays the stated fare once");
  assert(!deploy(fare.id, home, write).ok && writes === 1, "double deploy cannot charge twice");
  cancelDeploy(home, write); cancelDeploy(home, write);
  assert(home.money === money && Number(writes) === 2 && ids(ownedItems(home)) === identity, "failed load refunds once without changing owned item ids");
}
{
  const home = commitSave(migrate(null)); home.money = 100; home.stats.extracts = 1;
  const outbound = structuredClone(home);
  const request = deploy("plantation", outbound, next => {
    Object.assign(next, { deployReceipt: { id: "interrupted-load", paid: 20 } }); commitSave(next);
  });
  assert(request.ok, "paid destination starts with durable fare receipt"); settleDeploy();
  const refunded = load();
  assert(refunded.money === home.money && load().money === home.money, "reload before loadout snapshot refunds paid fare once");
  const paid = structuredClone(home);
  deploy("plantation", paid, next => { next.deployReceipt = { id: "successful-load", paid: 20 }; commitSave(next); });
  commitSave(beginRaid(paid, "paid-raid", [], paid.gear)); settleDeploy();
  const bonked = load();
  assert(bonked.money === home.money - 20 && !bonked.deployReceipt && !bonked.activeRaid, "reload after entering raid settles kit without refunding completed travel");
  assert(bonked.boundWeapons?.kingpin === home.boundWeapons?.kingpin && !bonked.satchel?.items.includes(home.boundWeapons!.kingpin), "Kingpin identity stays bound through reload and bonk-out");
  const stable = storage.getItem("bv_g1"), candidate = structuredClone(home);
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { ...storage, setItem() { throw new Error("quota"); } } });
  let rejected = false;
  try { deploy("plantation", candidate, next => { commitSave(next); }); } catch { rejected = true; }
  assert(rejected && storage.getItem("bv_g1") === stable && home.money === 100, "failed fare write leaves durable currency and caller snapshot untouched");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  assert(deploy("plantation", structuredClone(home), () => {}).ok, "failed fare write does not leave deployment stuck pending"); settleDeploy();
}
console.log(`Settlement self-test: PASS (${checks} checks; 150 seeds × 100 operations, migration, reload, capacity, delivery, crafting, fares, atomic failure, extraction)`);
