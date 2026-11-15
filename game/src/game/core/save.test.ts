import { DEFAULT_LOOK } from "../actors/look";
import { KINGPIN } from "../combat/weapons";
import { load, migrate, reset, save, retainKeys } from "./save";
import { CATALOG, STARTERS, build, canBuild, checkPlace, craft, defOf, legacyBase, move, packUp, stashCapacity } from "../home/facilities";
import { canDeploy, cancelDeploy, deploy, pickEntry, settleDeploy, ENTRY_POINTS } from "./deployment";
import { itemType } from "../loot/instances";
import "../loot/equipment.test";
import "../loot/equipment-actions.test";
import "../loot/search.test";
import "../ai/boss.test";

let checks = 0;
function assert(ok: boolean, message: string): asserts ok {
  checks++;
  if (!ok) throw new Error(message);
}
function equal(actual: unknown, expected: unknown, message: string) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), message);
}

const data = new Map<string, string>();
const storage = {
  getItem: (key: string) => data.get(key) ?? null,
  setItem: (key: string, value: string) => { data.set(key, value); },
  removeItem: (key: string) => { data.delete(key); },
};
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });

const fresh = load();
retainKeys(fresh, ["radio_key", "vine_key", "radio_key", "banana"]);
save(fresh);
equal(load().keys, ["radio_key", "vine_key"], "all extracted key kinds persist once, not ordinary loot");
reset();
assert(fresh.v === 1 && fresh.money === 0 && fresh.raids === 0, "missing storage returns defaults");
assert(Number.isFinite(Date.parse(fresh.createdAt)), "creation date is valid");
equal(fresh.look, DEFAULT_LOOK, "brand default look");
fresh.look.tie.color = "#000000";
assert(load().look.tie.color === DEFAULT_LOOK.tie.color, "fresh nested defaults are not shared");
assert(itemType(fresh.gear.head!) === "bowler" && itemType(fresh.gear.face!) === "shades" && fresh.satchel === null, "default gear and no satchel");
assert(itemType(fresh.gear.body!) === "suit" && fresh.gear.ears === null && fresh.locker.length === 0, "bound starter worn, not duplicated in locker");
data.set("bv_g1", "{bad json");
assert(load().money === 0, "corrupt JSON recovers");
for (const raw of [null, undefined, 2, false, "bad", [], { v: 999, money: 100 }]) {
  assert(migrate(raw).money === 0, "invalid root/future version recovers");
}
const partial = migrate({ v: 0, money: 42, raids: 2, look: { eyes: { style: "monocle" }, fur: "#aabbcc" } });
assert(partial.money === 42 && partial.raids === 2 && partial.look.eyes.style === "round", "older partial save migrates (monocle is gear now, eyes fall back to round)");
assert(partial.look.eyes.spacing === 1 && partial.look.fur === "#aabbcc", "nested partials merge independently");
const bad = migrate({
  money: "30", raids: -1, ammo: NaN, lookDone: "true", createdAt: "nonsense",
  upgrades: { mag: 1, pack: 900, heart: 0.5 }, keys: ["vine_key", null, 3, "vine_key"], trophies: false,
  reserved: ["vine_rope"], salMovedIn: true, fixtures: ["lamp"],
  look: { headSize: Infinity, ears: { style: "triangle", size: 8 }, brows: { style: "thin", tilt: -0.5 }, tie: { style: "bowtie", color: "red" }, tail: { curl: 2 } },
  gear: { head: "crown", face: "nope", back: "satchel" }, locker: ["crown", 5], satchel: { items: ["golden", 3], x: 4, z: "x" },
  stats: { bonkOuts: -5, extracts: 3, best: "9" },
  order: { id: "sal", progress: { vine_rope: 2, old_gear: "3", bad: -2 }, done: "yes" },
});
equal([bad.money, bad.raids, bad.ammo, bad.lookDone], [0, 0, KINGPIN.startAmmo, false], "reject wrong scalar types/ranges");
equal(bad.upgrades, { mag: 1, pack: 0, heart: 0 }, "upgrade levels validated");
equal(bad.keys, ["vine_key"], "mixed arrays sanitized and deduplicated");
equal(bad.trophies, [], "wrong list type defaults");
equal(bad.reserved, ["vine_rope"], "valid sibling list retained");
assert(bad.look.headSize === DEFAULT_LOOK.headSize && bad.look.ears.size === DEFAULT_LOOK.ears.size, "invalid look numbers default");
assert(bad.look.ears.style === DEFAULT_LOOK.ears.style && bad.look.tie.color === DEFAULT_LOOK.tie.color, "invalid enum/color defaults");
assert(bad.look.tie.style === "bowtie" && bad.look.brows.tilt === -0.5 && bad.look.brows.style === "thin", "valid look siblings survive");
assert(bad.gear.head === "crown" && bad.gear.face === "shades" && !bad.locker.includes("crown") && bad.satchel === null, "legacy ownership list transfers worn piece, not duplicates");
const wardrobe = migrate({ wardrobe: ["bowler", "shades", "satchel", "hardhat", "crown"], gear: { head: "crown" } });
assert(wardrobe.gear.head === "crown" && wardrobe.locker.includes("hardhat") && wardrobe.locker.includes("bowler"), "wardrobe ids migrate to owned instances");
const interim = migrate({ locker: ["bowler", "shades", "satchel", "crown"], gear: { head: "crown", face: "shades", body: null, back: "satchel", ears: null } });
assert(interim.gear.body === "suit" && interim.gear.head === "crown" && !interim.locker.includes("crown") && interim.locker.includes("bowler"), "five-slot interim id ownership migrates without cloning worn finds");
const reservedGear = migrate({ reserved: ["hardhat#25", "banana", "banana"] });
assert(reservedGear.locker.includes("hardhat#25") && reservedGear.reserved.length === 2, "legacy stash equipment migrates into locker without losing duplicate supplies");
const instances = migrate({ gear: { head: "hardhat#999", face: "goggles#-4", body: "cap", ears: "walkman#nope" }, locker: ["hardhat#50", "hardhat#50", "__proto__", "hardhat#x", "crown#-2"], satchel: { items: ["hardhat#-8", "hardhat#bad", "banana", "banana"], x: 1, z: 2 } });
equal(instances.locker, ["hardhat#50", "hardhat#50", "crown#0", "bowler", "shades"], "locker preserves duplicate instances and rejects corrupt strings");
assert(instances.gear.head === "hardhat" && instances.gear.face === "goggles#0" && instances.gear.body === "suit" && instances.gear.ears === null, "gear condition clamps and slot validation");
equal(instances.satchel?.items, ["hardhat#0", "banana", "banana"], "satchel keeps multiplicity and sanitizes equipment");
equal(migrate(instances), instances, "instance migration is idempotent");
equal(bad.stats, { bonkOuts: 0, extracts: 3, best: 0 }, "stats validated field by field");
equal(bad.order, { id: "sal", progress: { vine_rope: 2 }, done: false }, "order progress sanitized");
assert(migrate({ order: { id: false } }).order === null, "invalid order id rejected");
assert(migrate({ money: Infinity }).money === 0, "infinite money rejected");
assert(migrate({ raids: Number.MAX_SAFE_INTEGER + 1 }).raids === 0, "unsafe counters rejected");
equal(migrate({ keys: { 0: "vine_key" } }).keys, [], "array-like objects rejected");
save(partial);
equal(load(), partial, "save round-trip");
assert(data.has("bv_g1"), "correct versioned key");
const clean = reset();
assert(clean.money === 0 && clean.raids === 0 && load().createdAt === clean.createdAt, "reset persists a fresh save");
const protectedProgress = migrate(JSON.parse('{"order":{"id":"safe","progress":{"__proto__":2,"constructor":3},"done":true}}'));
assert(protectedProgress.order?.progress["__proto__"] === 2, "progress keys do not mutate prototypes");
const hostile = new Proxy({}, { get() { throw new Error("hostile getter"); } });
assert(migrate(hostile).v === 1, "hostile raw input cannot throw");
Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("SecurityError"); } });
assert(load().money === 0, "blocked storage read cannot throw");
save(partial);
assert(reset().money === 0, "blocked storage reset cannot throw");
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { ...storage, setItem() { throw new Error("QuotaExceededError"); } } });
save(partial);
assert(load().v === 1, "quota errors cannot throw");
Reflect.deleteProperty(globalThis, "localStorage");
assert(load().v === 1, "Node without storage recovers");
save(partial);
assert(reset().v === 1, "Node without storage resets");
{ // creator extras (look.x) survive migration and are sanitized
  const withX = migrate({ v: 1, look: { ...DEFAULT_LOOK, x: { build: 0.5, jacket: "vest", pocketSquare: true, colors: { shirt: "#AABBCC", eyes: "nope" } } } });
  const x = (withX.look as unknown as { x?: { build?: number; jacket?: string; pocketSquare?: boolean; colors?: Record<string, string> } }).x;
  assert(x?.build === 0.5 && x.jacket === "vest" && x.pocketSquare === true, "look.x survives migration");
  assert(x?.colors?.shirt === "#aabbcc" && x.colors.eyes === undefined, "look.x colours are sanitized");
  const bad = migrate({ v: 1, look: { ...DEFAULT_LOOK, x: { build: 9, jacket: "cape" } } });
  const bx = (bad.look as unknown as { x?: { build?: number; jacket?: string } }).x;
  assert(bx?.build === 1 && bx.jacket === "two", "look.x out-of-range values clamp to safe defaults");
}
{ // gun attachments (G1.5 row 36): old saves fold their extended mag into the magazine slot, once
  const fresh = migrate(null);
  equal(fresh.gun, { sight: null, muzzle: null, mag: null, laser: null }, "a fresh save has a bare Kingpin");
  const vaultMag = migrate({ v: 1, fixtures: ["extended_mag", "open:wall_1"], locker: ["hardhat"] });
  assert(vaultMag.gun.mag === "att_mag_ext" && !vaultMag.fixtures.includes("extended_mag") && vaultMag.fixtures.includes("open:wall_1"), "an old vault extended mag becomes the fitted magazine attachment");
  assert(!vaultMag.locker.includes("att_mag_ext"), "the migrated mag is not duplicated into the locker");
  const boughtMag = migrate({ v: 1, upgrades: { mag: 1, pack: 0, heart: 0 } });
  assert(boughtMag.gun.mag === "att_mag_ext" && boughtMag.upgrades.mag === 1, "a bought extended mag becomes the fitted magazine attachment and the bench stays done");
  const noMag = migrate({ v: 1, upgrades: { mag: 0, pack: 1, heart: 0 } });
  assert(noMag.gun.mag === null, "no extended mag, nothing fitted");
  // a current save that has taken its mag off keeps it off (the grant only applies to saves from before attachments)
  const takenOff = migrate({ v: 1, upgrades: { mag: 1, pack: 0, heart: 0 }, gun: { sight: "att_sight_2x", muzzle: null, mag: null, laser: null }, locker: ["att_mag_ext"] });
  assert(takenOff.gun.mag === null && takenOff.gun.sight === "att_sight_2x" && takenOff.locker.filter((i) => i === "att_mag_ext").length === 1, "a removed mag stays in the locker, never re-granted");
  const badGun = migrate({ v: 1, gun: { sight: "att_muzzle_supp", muzzle: "att_muzzle_supp", mag: 5, laser: "__proto__", extra: "att_laser" } });
  equal(badGun.gun, { sight: null, muzzle: "att_muzzle_supp", mag: null, laser: null }, "wrong-slot, unknown and non-string attachments are dropped");
  const oldItems = migrate({ v: 1, reserved: ["extended_mag", "banana", "att_laser"], satchel: { items: ["extended_mag", "att_sight_holo"], x: 1, z: 2 }, locker: ["att_laser", "nope"] });
  assert(oldItems.locker.includes("att_mag_ext") && oldItems.locker.filter((i) => i === "att_laser").length === 2 && !oldItems.locker.includes("nope"), "attachments in the stash move to the locker; the locker keeps attachment ids");
  equal(oldItems.reserved, ["banana"], "the Fence's stash keeps only sellable loot");
  equal(oldItems.satchel?.items, ["att_mag_ext", "att_sight_holo"], "a dropped satchel keeps its attachments");
  equal(migrate(vaultMag), vaultMag, "attachment migration is idempotent");
  equal(migrate(takenOff), takenOff, "a current save round-trips unchanged");
}
const cash = (save: { money: number }) => save.money; // read through a call: TS would narrow save.money to the last asserted literal
{ // the buildable vault (G1.5 row 17): new saves start empty; a save from before the vault keeps the old room's stations
  const blank = migrate(null);
  equal(blank.base, { v: 1, next: 1, items: [], tokens: {} }, "a new vault starts empty");
  const old = migrate({ v: 1, raids: 4, money: 120, salMovedIn: true, upgrades: { mag: 1, pack: 0, heart: 0 }, trophies: ["golden_banana"] });
  equal(old.base.items.map((item) => item.def), ["fence", "bench", "sal", "trophy"], "an old save keeps the Fence, the bench, Sal's board and the trophies");
  assert(old.salMovedIn && old.upgrades.mag === 1 && old.money === 120, "the old save's progress is untouched");
  assert(old.base.items.every((item) => checkPlace({ ...old.base, items: old.base.items.filter((other) => other.uid !== item.uid) }, defOf(item.def)!, item.x, item.z, item.r).ok), "the migrated stations stand in valid, reachable spots");
  equal(migrate(JSON.parse(JSON.stringify(old))).base, old.base, "a migrated layout round-trips");
  assert(migrate({ v: 1, base: { v: 1, next: 1, items: [], tokens: {} } }).base.items.length === 0, "an empty saved vault stays empty (not re-seeded)");
  const legacy = legacyBase();
  // bad layouts: unknown ids dropped, overlaps and out-of-bounds go back into storage as tokens (never lost)
  const messy = migrate({ v: 1, base: { v: 1, next: 9, tokens: { press: 1, nope: 3, med: -2 }, items: [
    { uid: 1, def: "fence", x: -13, z: -12, r: 0 }, { uid: 2, def: "bench", x: -12, z: -12, r: 0 }, { uid: 3, def: "sal", x: 99, z: 0, r: 0 },
    { uid: 4, def: "unicorn", x: 0, z: 0, r: 0 }, { uid: 1, def: "plant", x: 10, z: 10, r: 7 }, { uid: 5, def: "plant", x: 12, z: 10, r: 1 }] } });
  equal(messy.base.items.map((item) => item.def), ["fence", "plant"], "only valid placements stay built");
  equal(messy.base.tokens, { press: 1, bench: 1, sal: 1, plant: 1 }, "overlapping and out-of-bounds facilities go into storage");
  assert(messy.base.next > Math.max(...messy.base.items.map((item) => item.uid)), "the uid counter stays ahead");
  void legacy;
  // the build transaction: a token pays first, otherwise money, exactly once; moving is free; packing up returns a token
  const s = migrate(null); s.money = 100;
  assert(!build(s, "fence", -1, -9, 0).ok && cash(s) === 100 && s.base.items.length === 0, "blocked placement charges nothing (the pod's landing spot)");
  assert(build(s, "sal", 4, -4, 0).ok && cash(s) === 70, "Sal's desk costs 30");
  assert(!canBuild(s, "sal").ok, "max count 1");
  assert(!canBuild(s, "press").ok && canBuild(s, "press").reason.includes("Generator"), "the press needs the generator");
  const uid = s.base.items[0].uid;
  assert(move(s, uid, 4, 2, 1).ok && cash(s) === 70 && s.base.items[0].r === 1, "moving is free");
  assert(packUp(s, uid).ok && s.base.tokens.sal === 1 && cash(s) === 70 && !s.base.items.length, "packing up returns one token, no money");
  assert(canBuild(s, "sal").free && build(s, "sal", 4, 2, 0).ok && cash(s) === 70 && !s.base.tokens.sal, "placing from storage is free and uses the token");
  s.money = 0; assert(!canBuild(s, "trophy").ok && !build(s, "trophy", 8, 2, 0).ok && cash(s) === 0, "can't build what you can't afford");
  assert(CATALOG.filter((def) => def.station === "sell" || def.station === "bench").every((def) => def.cost === 0), "the stations a new vault needs are free");
  // walkway rule: walling in a station is refused
  const w = migrate(null); w.money = 999;
  assert(build(w, "fence", -6, 0, 0).ok, "fence placed");
  assert(checkPlace(w.base, defOf("stash")!, -6, 2, 0).ok, "a station needs only part of its front row free");
  assert(!checkPlace(w.base, defOf("desk")!, -6, 2, 0).ok && checkPlace(w.base, defOf("desk")!, -6, 2, 0).reason.includes("Fence"), "covering a station's whole front row is refused");
  // stash capacity and crafting: atomic, inputs from the stash
  const c = migrate(null); c.money = 999; c.reserved = ["vine_rope", "banana", "banana", "spring"];
  assert(!craft(c, "bandage"), "no kiosk, no craft");
  build(c, "med", 4, 4, 0); assert(craft(c, "bandage") && c.reserved.filter((inst) => itemType(inst) === "bandage").length === 2 && !c.reserved.includes("vine_rope"), "a vine rope makes two bandages");
  build(c, "press", 8, 4, 0);
  assert(!c.base.items.some((item) => item.def === "press"), "the press can't be built without power");
  build(c, "generator", 12, 4, 0); build(c, "press", 8, 4, 0); const ammo = c.ammo;
  assert(craft(c, "rounds8") && c.ammo === ammo + 8 && !c.reserved.includes("spring"), "a spring presses 8 rounds");
  assert(stashCapacity(c) === 24 && (build(c, "stash", -6, 6, 0), stashCapacity(c)) === 36, "a safe-deposit wall adds 12 slots");
  c.reserved = Array(36).fill("banana"); c.locker = []; assert(!craft(c, "smoothie") || c.reserved.length <= 36, "crafting respects the stash");
  assert(STARTERS.every((starter) => !CATALOG.some((def) => def.id === (starter.id as string))), "starters are not buildable");
}
{ // deploying (G1.5 row 33): the plantation road opens after one return; the fare is paid once
  const d = migrate(null); d.money = 50; let writes = 0; const write = () => { writes++; }, count = () => writes;
  assert(canDeploy("beach", d).ok && !canDeploy("plantation", d).ok, "only the beach is open at first");
  d.stats.extracts = 1; assert(canDeploy("plantation", d).ok, "one return opens the plantation road");
  const first = deploy("plantation", d, write), second = deploy("plantation", d, write);
  assert(first.ok && !second.ok && cash(d) === 30 && count() === 1, "a second confirm while one is on its way pays nothing");
  cancelDeploy(d, write); assert(cash(d) === 50 && count() === 2 && canDeploy("plantation", d).ok, "a failed load refunds the fare");
  assert(deploy("plantation", d, write).ok && cash(d) === 30, "paid again on a fresh confirm"); settleDeploy();
  d.money = 10; assert(!canDeploy("plantation", d).ok && canDeploy("beach", d).ok, "can't afford the fare; the beach is free");
  // spawns: walkable, 12 u clear of enemies, explicit fallbacks
  const open = () => true, beach = ENTRY_POINTS.filter((e) => e.group === "beach");
  assert(beach.length === 3 && ENTRY_POINTS.filter((e) => e.group === "plantation-road").length >= 2, "3 beach candidates, inland ones from the roads");
  const crowd = beach.slice(0, 2).map((e) => ({ x: e.x + 3, z: e.z }));
  for (let seed = 0; seed < 20; seed++) { const pick = pickEntry("beach", crowd, open, seed); assert(pick.entry.id === beach[2].id && !pick.fallback && pick.clearance >= 12, "enemies within 12 u rule a candidate out"); }
  const all = pickEntry("beach", beach.map((e) => ({ x: e.x + 1, z: e.z })), open, 1); assert(all.fallback === "crowded", "every candidate crowded: explicit fallback");
  const none = pickEntry("plantation-road", [], () => false, 1); assert(none.fallback === "start", "nothing walkable: explicit fallback to the hatch START");
  equal(pickEntry("beach", [], open, 7).entry.id, pickEntry("beach", [], open, 7).entry.id, "the pick is seeded per raid");
}
console.log(`Save self-test: PASS (${checks} checks; migration, corrupt data, nested types, storage failures, reset)`);
