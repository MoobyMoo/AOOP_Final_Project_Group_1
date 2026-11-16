import { migrate, commitSave, load } from "../core/save";
import { beginRaid, checkpointRaid, identifySave, settleRaid, validateOwnership, ownedItems } from "../core/settlement";
import { instanceId, own, itemType, withCount } from "./instances";
import { fmtInst, parseInst, wear } from "./equipment";
import { itemDef, mulberry32 } from "./tables";
import { fitsInPack, packStacks } from "./pack";
import { EXIT_DEFS, exitCondition, advanceExit, exitCosts } from "../world/extraction";
import { G } from "../core/state";
import { bindLootApi, lootHook } from "./lootables";
import { createSearch, advanceSearch, take } from "./search";
import { ATT_SLOTS, attachmentDef } from "./attachments";
import { CALIBER_IDS, gunOf, noRounds, type Rounds } from "../combat/guns";
import { craft, stashCapacity, stashUsed } from "../home/facilities";
import { deploy, cancelDeploy, settleDeploy, destOf } from "../core/deployment";
import { qs, accept, questStatus } from "../core/quests";
import { payQuest } from "../core/settlement";

let checks = 0;
function assert(ok: unknown, message: string): asserts ok { checks++; if (!ok) throw new Error(message); }
const ids = (items: string[]) => items.map(instanceId).sort().join(",");
const data = new Map<string, string>();
const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
const { fit, unfit, GUN } = await import("../combat/gunstats");
const { placeGun, takeGun, swapSlots, switchTo, equipFound, heldRounds, drawing, DRAW_TIME } = await import("../combat/arsenal");
const { startReload, updateReload, cancelReload } = await import("../combat/reload");
const { GUN_DEF } = await import("../combat/gunstats");
const g = () => G as typeof G; // read through a call so TS does not narrow to the literals just assigned
const total = (r: Rounds) => CALIBER_IDS.reduce((a, c) => a + r[c], 0);

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

{
  const home = identifySave(migrate(null));
  const bananas = ["banana", "banana"].map(own);
  const otherHelmet = own("hardhat#72");
  const pack = [bananas[0], helmet, bananas[1], otherHelmet];
  assert(packStacks(pack).map(stack => stack.length).join() === "2,1,1", "duplicates use one slot while equipment retains its own condition");
  assert(fitsInPack(pack, 3, "banana") && !fitsInPack(pack, 3, "coconut"), "a full pack accepts more of an existing stack");
  const raid = beginRaid(home, "stacked-pouch", pack, home.gear);
  const record = settleRaid(raid, "bonked", 1).settlements!.at(-1)!;
  assert(ids(record.kept) === ids(bananas) && ids(record.lost) === ids([helmet, otherHelmet]), "the cheek pouch protects the whole stack and conserves each item identity");
}

// THE PROPERTY TEST: 150 seeded raids x 100 random operations over the pack, the ground, worn gear, both gun slots
// (pick up, slot, unslot, swap, draw), attachments on either gun, ammo stacks of every caliber, reloads and shots.
// Every step checkpoints through the journal (it throws on an item vanishing or a round appearing without a source,
// per caliber); every raid settles by extraction, quit or bonk and must conserve identities and rounds.
const GUN_LOOT = ["peel_sprayer", "contraband_carbine", "coconut_cracker", "long_ledger", "hostile_takeover", "pocket_change"];
const PARTS = ["att_mag_ext", "att_mag_quick", "att_laser", "att_sight_2x", "att_grip_steady", "att_stock_crate", "att_muzzle_supp"];
const STACKS = ["ammo45", "ammo_rifle", "ammo_shell", "ammo_sniper"];
for (let seed = 1; seed <= 150; seed++) {
  const random = mulberry32(seed), initial = load();
  initial.activeRaid = undefined; initial.settlements = [];
  initial.ammo = { ammo45: 24, ammo_rifle: 30, ammo_shell: 6, ammo_sniper: 0 };
  if (seed % 4 === 0) initial.guns[1] = { inst: own("bootleg_rifle"), atts: { sight: null, muzzle: null, mag: null, laser: null, grip: null, stock: own("att_stock_padded") } };
  const before = ownedItems(initial), pack: string[] = [], ground: string[] = [], consumed: string[] = [];
  let gear = { ...initial.gear };
  let current = beginRaid(initial, `property-${seed}`, pack, gear);
  const minted: string[] = [], pick = <T,>(list: T[]) => list[Math.floor(random() * list.length)];
  G.save = current; G.scene = "raid"; G.alive = true; G.reloadT = -1; G.meleeT = -1; G.rollT = -1; G.useItem = null; G.equipping = null;
  G.reserve = { ...current.ammo }; G.loaded = [0, 0]; G.slot = current.guns[0] ? 0 : 1;
  for (let step = 0; step < 100; step++) {
    G.save = current; // the journal hands back a fresh save each checkpoint; the arsenal reads through G.save
    const choice = Math.floor(random() * 14), held = total(heldRounds());
    if (choice === 0 && pack.length < 8) { const inst = own(pick(["hardhat#38", "banana", "bandage", ...PARTS, ...GUN_LOOT, ...STACKS])); minted.push(inst); pack.push(inst); }
    if (choice === 1 && pack.length) ground.push(pack.splice(Math.floor(random() * pack.length), 1)[0]);
    if (choice === 2 && ground.length && pack.length < 8) pack.push(ground.pop()!);
    if (choice === 3) { const index = pack.findIndex(inst => itemType(inst) === "bandage"); if (index >= 0) consumed.push(pack.splice(index, 1)[0]); }
    if (choice === 4) { const index = pack.findIndex(inst => itemType(inst) === "hardhat"); if (index >= 0) { const old = gear.head; gear.head = pack.splice(index, 1)[0]; if (old) { if (itemType(old) === "bowler") current.locker.push(old); else pack.push(old); } } }
    if (choice === 5) { const index = pack.findIndex(inst => !!attachmentDef(inst)); const k = pick([0, 1] as const); if (index >= 0 && gunOf(G.save.guns[k]?.inst)?.slots.includes(attachmentDef(pack[index])!.slot)) { const result = fit(pack.splice(index, 1)[0], k); if (result.ok && result.old) pack.push(result.old); } }
    if (choice === 6 && pack.length < 8) { const k = pick([0, 1] as const); const inst = unfit(pick([...ATT_SLOTS]), k); if (inst) pack.push(inst); }
    if (choice === 7) { const index = pack.findIndex(inst => !!gunOf(inst)); if (index >= 0) { const inst = pack[index]; if (equipFound(inst) >= 0) pack.splice(index, 1); } } // pickup / slot from the pack
    if (choice === 8) { const k = pick([0, 1] as const), gs = G.save.guns[k]; if (gs && gs.inst !== G.save.boundWeapons?.kingpin) { const n = Object.values(gs.atts).filter(Boolean).length; if (pack.length + 1 + n <= 8) { const out = takeGun(k)!; pack.push(out.inst, ...out.atts); } } }
    if (choice === 9) swapSlots();
    if (choice === 10) switchTo(G.slot === 0 ? 1 : 0);
    if (choice === 11 && GUN.armed) { if (startReload(GUN_DEF)) { if (random() < 0.3) { updateReload(G.reloadTime * 0.5); cancelReload(); } else for (let t = 0; t < 40 && G.reloadT >= 0; t++) updateReload(0.25); } }
    if (choice === 12 && GUN.armed && G.mag > 0) G.mag -= 1 + Math.floor(random() * Math.min(G.mag, 3)); // shots fired: these rounds are spent
    if (choice === 13) { const index = pack.findIndex(inst => itemDef(inst).kind === "ammo"); if (index >= 0) { const inst = pack.splice(index, 1)[0], cal = itemType(inst) as keyof Rounds; G.reserve[cal] += itemDef(inst).stack ?? 8; consumed.push(inst); } }
    if (choice !== 12 && choice !== 13 && choice !== 0) assert(total(heldRounds()) === held, `seed ${seed} step ${step}: moving guns, parts and reloading never changes the rounds held`);
    for (const k of [0, 1] as const) { const def = gunOf(G.save.guns[k]?.inst); if (def) for (const [slot, a] of Object.entries(G.save.guns[k]!.atts)) if (a) assert(def.slots.includes(slot as never), `seed ${seed}: a part only sits in a slot its gun has`); }
    current = checkpointRaid(current, { pack, gear, guns: G.save.guns, world: ground, consumed, x: 4, z: 5, ammo: heldRounds(), elapsed: step });
    validateOwnership(current);
  }
  const reason = seed % 3 === 0 ? "quit" : seed % 3 === 1 ? "bonked" : "hatch";
  const result = settleRaid(current, reason, 2);
  const record = result.settlements!.at(-1)!;
  for (const c of CALIBER_IDS) assert(record.rounds.before[c] === record.rounds.after[c] + record.rounds.spent[c] + record.rounds.abandoned[c], `round ledger seed ${seed} ${c}`);
  const kingpin = current.boundWeapons!.kingpin, slotted = current.activeRaid!.guns ?? current.guns;
  const fittedParts = slotted.flatMap(gs => gs ? Object.values(gs.atts).filter((inst): inst is string => !!inst) : []);
  const unboundGuns = slotted.flatMap(gs => gs && gs.inst !== kingpin ? [gs.inst] : []);
  if (reason === "hatch") assert(fittedParts.every(inst => result.guns.some(gs => gs && Object.values(gs.atts).includes(inst))) && unboundGuns.every(inst => result.guns.some(gs => gs?.inst === inst)), `extraction keeps guns in their slots with their parts, seed ${seed}`);
  else {
    assert([...fittedParts, ...unboundGuns].every(inst => result.satchel?.items.includes(inst)), `bonk: unbound guns and every part go to the satchel, seed ${seed}`);
    assert(result.guns.every(gs => !gs || (gs.inst === kingpin && Object.values(gs.atts).every(a => !a))), `bonk: only the bare Kingpin stays slotted, seed ${seed}`);
    assert(result.guns.some(gs => gs?.inst === kingpin), `bonk: the Kingpin is in a slot afterwards, seed ${seed}`);
  }
  assert(ids([...ownedItems(result), ...record.consumed, ...record.abandoned]) === ids([...before, ...minted]), `conservation seed ${seed}`);
  assert(JSON.stringify(settleRaid(result, reason, 2)) === JSON.stringify(result), `idempotent seed ${seed}`);
  commitSave(result);
  assert(ids(ownedItems(load())) === ids(ownedItems(result)), `settled reload seed ${seed}`);
}
{ // calibers, switching and the draw (POLISH_FINDINGS 17)
  const home = commitSave(migrate(null)); home.ammo = { ammo45: 5, ammo_rifle: 40, ammo_shell: 7, ammo_sniper: 0 };
  home.guns[1] = { inst: own("contraband_carbine"), atts: { sight: null, muzzle: null, mag: null, laser: null, grip: null, stock: null } };
  G.save = beginRaid(home, "calibers", [], home.gear); G.scene = "raid"; G.alive = true; G.reloadT = -1; G.meleeT = -1; G.rollT = -1; G.useItem = null; G.equipping = null;
  G.reserve = { ...G.save.ammo }; G.loaded = [0, 0]; G.slot = 0; GUN.armed = true;
  assert(G.ammo === 5, "the Kingpin's reserve is the .45 count");
  assert(switchTo(1) && g().slot === 1 && drawing() && g().ammo === 40, "drawing the carbine shows the rifle reserve, and the draw is on");
  G.drawT = DRAW_TIME; assert(!drawing(), "after 0.15 s the gun is live");
  assert(startReload(GUN_DEF), "the carbine reloads");
  for (let t = 0; t < 20 && G.reloadT >= 0; t++) updateReload(0.25);
  assert(G.loaded[1] === 30 && G.reserve.ammo_rifle === 10 && G.reserve.ammo45 === 5, "reload draws only rifle rounds (caliber matching)");
  G.loaded[1] = 2; assert(startReload(GUN_DEF), "a top-up starts"); updateReload(1);
  assert(switchTo(0) && G.reloadT < 0 && G.loaded[1] === 2 && G.reserve.ammo_rifle === 10, "switching cancels a full-mag reload: nothing went in, nothing lost");
  assert(G.loaded[0] === 0 && G.mag === 0 && startReload(GUN_DEF), "each gun keeps its own magazine; the Kingpin reloads from .45");
  for (let t = 0; t < 20 && G.reloadT >= 0; t++) updateReload(0.25);
  assert(g().loaded[0] === 5 && g().reserve.ammo45 === 0 && g().reserve.ammo_rifle === 10, "five .45 rounds were all the .45 there was");
  G.meleeT = 0; assert(!switchTo(1), "a swing blocks the switch (Duckov CanEditInventory)"); G.meleeT = -1;
  const pump = own("coconut_cracker"); takeGun(1); assert(equipFound(pump) === 1, "a found gun takes the first empty slot");
  assert(equipFound(own("pipe_dream")) === -1, "both full: the pickup goes to the pack");
  switchTo(1); G.drawT = 1; assert(startReload(GUN_DEF), "the pump loads shell by shell");
  updateReload(0.85); const shells = G.loaded[1];
  assert(switchTo(0) && G.loaded[1] === shells && shells === 2 && G.reserve.ammo_shell === 5, "a switch keeps the shells already inserted (single-round mode)");
}
{ // death with two guns: the carbine and every part go to the satchel; the Kingpin stays, bare
  const home = commitSave(migrate(null));
  const carbine = own("contraband_carbine"), grip = own("att_grip_steady"), sight = own("att_sight_holo");
  home.guns[0]!.atts.sight = sight; home.guns[1] = { inst: carbine, atts: { sight: null, muzzle: null, mag: null, laser: null, grip, stock: null } };
  const dead = settleRaid(beginRaid(home, "two-gun-death", [], home.gear), "bonked", 2);
  assert([carbine, grip, sight].every(i => dead.satchel?.items.includes(i)) && dead.guns[0]?.inst === home.boundWeapons!.kingpin && !dead.guns[0]!.atts.sight && dead.guns[1] === null, "bonk-out: unbound guns and all attachments to the satchel, the Kingpin bound");
  const racked = commitSave(migrate(null)); racked.guns = [null, { inst: own("peel_sprayer"), atts: { sight: null, muzzle: null, mag: null, laser: null, grip: null, stock: null } }];
  const back = settleRaid(beginRaid(racked, "racked-death", [], racked.gear), "bonked", 2);
  assert(back.guns[0]?.inst === racked.boundWeapons!.kingpin && back.guns[1] === null, "with the Kingpin on the rack, a bonk-out hands it back into gun 1");
  const kept = settleRaid(beginRaid(home, "two-gun-extract", [], home.gear), "hatch", 2);
  assert(kept.guns[1]?.inst === carbine && kept.guns[1]!.atts.grip === grip && kept.guns[0]!.atts.sight === sight, "extraction keeps both guns, slotted, with their parts");
}
const full = beginRaid(load(), "full", Array.from({ length: 8 }, () => own("banana")), load().gear);
const attachmentSave = commitSave(migrate(null)); attachmentSave.ammo = { ...noRounds(), ammo45: 19 }; attachmentSave.guns[0]!.atts.mag = own("att_mag_ext");
G.save = beginRaid(attachmentSave, "magazine-spill", [], attachmentSave.gear); G.scene = "raid"; G.alive = true; G.reloadT = -1; G.slot = 0; G.reserve = noRounds(); G.loaded = [0, 0]; G.mag = 12; G.ammo = 7;
const magazine = unfit("mag", 0);
assert(G.mag === 8 && G.ammo === 11 && magazine === attachmentSave.guns[0]!.atts.mag, "smaller magazine returns four loaded rounds without changing the attachment id");
G.save.guns[0]!.atts.mag = magazine;
const attachmentDeath = settleRaid(checkpointRaid(G.save, { pack: [], guns: G.save.guns, gear: G.save.gear, world: [], consumed: [], x: 1, z: 2, ammo: { ...noRounds(), ammo45: 19 }, elapsed: 1 }), "bonked", 2);
assert(attachmentDeath.satchel?.items.includes(magazine!) && !attachmentDeath.guns[0]!.atts.mag, "bonk detaches magazine into recoverable satchel even with an empty pack");
const attachmentRetry = beginRaid(attachmentDeath, "attachment-recovery", [], attachmentDeath.gear);
const attachmentRecovered = settleRaid(checkpointRaid({ ...attachmentRetry, satchel: null }, { pack: [magazine!], guns: attachmentRetry.guns, gear: attachmentRetry.gear, world: [], consumed: [], x: 1, z: 2, ammo: { ...noRounds(), ammo45: 19 }, elapsed: 1 }), "hatch", 2);
assert(attachmentRecovered.locker.filter(inst => inst === magazine).length === 1 && !attachmentRecovered.satchel, "attachment recovery retains the exact instance once in the locker");
const { sellEquip } = await import("./equipment-actions");
G.scene = "bunker"; G.save = structuredClone(attachmentRecovered);
const saleBefore = ownedItems(G.save), saleMoney = G.save.money, soldIndex = G.save.locker.indexOf(magazine!);
assert(sellEquip(soldIndex) === itemDef(magazine!).value && G.save.money === saleMoney + itemDef(magazine!).value && ids(ownedItems(G.save)) === ids(saleBefore.filter(inst => inst !== magazine)), "explicit sale removes exactly one attachment identity and credits its value");
const reloadGun = beginRaid(attachmentSave, "fitted-reload", [], attachmentSave.gear); commitSave(reloadGun);
const reloadedGun = load();
assert(!reloadedGun.guns[0]!.atts.mag && reloadedGun.satchel?.items.includes(attachmentSave.guns[0]!.atts.mag!), "reload detaches the same fitted attachment into a single satchel");
const settled = settleRaid(full, "hatch", 2);
assert(ownedItems(settled).length === ownedItems(full).length, "full home storage keeps extraction overflow owned");
const lostOnReload = own("spring");
const recovery = beginRaid(settled, "reload", [own("banana"), own("coconut"), own("banana"), lostOnReload], settled.gear);
commitSave(recovery);
const recovered = load();
assert(!recovered.activeRaid && recovered.satchel?.items.length === 1 && recovered.satchel.items[0] === lostOnReload, "forced reload protects the first two stacks and preserves the third in the corpse");
assert(JSON.stringify(load()) === JSON.stringify(recovered), "reloading recovered settlement cannot repeat it");
const corpse = recovered.satchel!;
const retry = beginRaid(recovered, "corpse-recovery", [], recovered.gear);
const reclaimed = checkpointRaid({ ...retry, satchel: null }, { pack: [...corpse.items], gear: retry.activeRaid!.gear, world: [], consumed: [], x: corpse.x, z: corpse.z, ammo: retry.ammo, elapsed: 1 });
const safe = settleRaid(reclaimed, "hatch", 2);
assert(corpse.items.every(inst => ownedItems(safe).includes(inst)) && !safe.satchel, "recovered corpse transfers exactly once to owned storage");
const secondDeath = settleRaid(beginRaid(recovered, "second-death", [], recovered.gear), "bonked", 2);
assert(corpse.items.every(inst => secondDeath.settlements!.at(-1)!.abandoned.includes(inst)), "second death explicitly records expiration of the previous corpse");
let missingRejected = false;
try { checkpointRaid(retry, { pack: [], world: [], consumed: [], x: 0, z: 0, ammo: noRounds(), elapsed: 1, gear: { ...retry.activeRaid!.gear, head: null } }); } catch { missingRejected = true; }
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
  const original = [...home.reserved], money = home.money, rounds = home.ammo.ammo45;
  assert(craft(home, "bandage") && craft(home, "smoothie") && craft(home, "rounds8"), "crafting resolves identified inputs");
  assert(home.money === money && home.ammo.ammo45 === rounds + 8 && home.reserved.every(inst => !!instanceId(inst)), "craft outputs own identities and conserve currency and explicit ammunition output");
  assert(!home.reserved.some(inst => original.includes(inst)) && home.reserved.length === 3, "crafting consumes each input identity once and mints exact outputs");
  const unchanged = JSON.stringify(home); assert(!craft(home, "rounds8") && JSON.stringify(home) === unchanged, "missing crafting inputs change nothing");
  home.stats.extracts = 1; qs(home).unlocks.push("dest:plantation"); // the road map job's unlock (core/quests.ts)
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
  const home = commitSave(migrate(null)); home.money = 100; home.stats.extracts = 1; qs(home).unlocks.push("dest:plantation");
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
{ // job payouts (G1.5 row 40): pay exactly once through the ledger, at home and to a raid NPC
  const home = commitSave(migrate(null)); home.money = 10;
  assert(qs(home).active.length === 0 && questStatus(home, "sal_roadmap") === "available", "Sal's first job (the road map) is on offer on a new save");
  assert(questStatus(home, "sal_office") === "locked" && !accept(home, "sal_office"), "a job with unfinished prerequisites can't be taken");
  assert(accept(home, "sal_roadmap") && !accept(home, "sal_roadmap") && questStatus(home, "sal_roadmap") === "active", "accepting is once; the job is active");
  assert(payQuest(home, "sal_roadmap") === null, "an unfinished job pays nothing");
  const map = own("road_map"), spare = own("banana"); home.reserved.push(map, spare);
  assert(questStatus(home, "sal_roadmap") === "ready", "the road map in the stash makes the job ready");
  const before = ids(ownedItems(home)), paid = payQuest(home, "sal_roadmap");
  assert(!!paid && paid.record.consumed.length === 1 && instanceId(paid.record.consumed[0]) === instanceId(map), "the turn-in consumes the exact road map instance");
  const after = paid!.save;
  assert(after.money === 30 && qs(after).unlocks.includes("dest:plantation") && qs(after).done.includes("sal_roadmap") && !qs(after).active.includes("sal_roadmap"), "money and the plantation unlock pay once");
  assert(!after.reserved.some(inst => instanceId(inst) === instanceId(map)) && after.reserved.some(inst => instanceId(inst) === instanceId(spare)), "only the job's item leaves the stash");
  assert(ids([...ownedItems(after), ...paid!.record.consumed]) === before, "the ledger balances: before = after + consumed");
  assert(qs(after).ledger.length === 1 && qs(after).ledger[0].quest === "sal_roadmap", "one ledger record per paid job");
  assert(payQuest(after, "sal_roadmap") === null && home.money === 10, "a second turn-in pays nothing; the input save is untouched");
  const reloaded = load(); void reloaded;
  commitSave(after); const back = load();
  assert(qs(back).ledger.length === 1 && back.money === 30 && payQuest(back, "sal_roadmap") === null, "a reload keeps the record and still refuses a second payout");
  // an item reward arrives with an owned identity through delivery (stash full: it waits safely, nothing is lost)
  const flare = structuredClone(back); qs(flare).done.push("sal_office", "sal_supplies", "radio_static"); flare.base.items.push({ uid: 9, def: "radio", x: 0, z: 0, r: 0 });
  assert(accept(flare, "radio_flare"), "the flare job is on offer once the radio desk is built");
  qs(flare).notes.push("note_pirate_iou"); flare.reserved.push(own("spring"), own("spring"), own("scrap_tin"));
  flare.reserved.push(...Array.from({ length: stashCapacity(flare) - stashUsed(flare) }, () => own("coconut")));
  const fp = payQuest(flare, "radio_flare");
  assert(!!fp && fp.record.granted.length === 1 && itemType(fp.record.granted[0]) === "cove_flare", "the flare reward is a newly owned instance");
  assert([...fp!.save.reserved, ...(fp!.save.delivery ?? [])].some(inst => instanceId(inst) === instanceId(fp!.record.granted[0])), "the reward is owned (stash or delivery)");
  validateOwnership(fp!.save);
  // a raid NPC's job (the Grove Keeper): from the live pack, into activeRaid.consumed; the reward joins the pack
  const base = commitSave(migrate(null)), raid = beginRaid(base, "keeper-raid", [], base.gear);
  accept(raid, "keeper_lanterns");
  const pots = [own("honey_pot"), own("honey_pot")], pack = [...pots, own("banana")];
  assert(questStatus(raid, "keeper_lanterns", pack) === "ready" && payQuest(raid, "keeper_lanterns") === null, "a raid job is only paid with the live pack");
  const kp = payQuest(raid, "keeper_lanterns", { pack, slots: 8 });
  assert(!!kp && kp.pack!.length === 2 && kp.pack!.some(inst => itemType(inst) === "keeper_carving") && !kp.pack!.some(inst => itemType(inst) === "honey_pot"), "the honey leaves the pack, the carving joins it");
  assert(kp!.save.activeRaid!.consumed.filter(inst => pots.includes(inst)).length === 2 && qs(kp!.save).unlocks.includes("secret:root-cellar"), "the consumed honey is in the raid ledger; the secret unlocks");
  const cp = checkpointRaid(kp!.save, { pack: kp!.pack!, gear: kp!.save.activeRaid!.gear, guns: kp!.save.guns, world: [], consumed: kp!.save.activeRaid!.consumed, x: 0, z: 0, ammo: kp!.save.ammo, elapsed: 5 });
  const settled = settleRaid(cp, "hatch", 2);
  assert(settled.reserved.some(inst => itemType(inst) === "keeper_carving") && settled.trophies.includes("keeper_carving"), "the raid settlement brings the carving home (and onto the trophy wall)");
  assert(payQuest(settled, "keeper_lanterns", { pack: [], slots: 8 }) === null, "a paid raid job can't be paid again");
}
console.log(`Settlement self-test: PASS (${checks} checks; 150 seeds × 100 operations, migration, reload, capacity, delivery, crafting, fares, atomic failure, extraction, job payouts)`);
await import("./economy.test"); // Progression v0.2: factory, wagers, Double or Nothing, lockboxes (all conserved)
