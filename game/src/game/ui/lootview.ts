// The shared loot / inventory screen (UI v3, G1.5 rows 05 and 24), Duckov's LootView (POLISH_FINDINGS 9):
// your equipment and pack on the left (x60-540), the leather item tag in the centre (563 wide), the container or
// body on the right (x1380-1860); 90 px cells, five columns, no gaps; equipment cells 67.5 x 90.
// - Tab with no target shows the left panel and the tag only. The bunker locker uses the same screen.
// - A target opens with a per-item search reveal (loot/search.ts timings): the cell being searched shows a ring, the
//   rest stay "?" until revealed, and searching only advances while the screen is open (Duckov: opening, searching
//   and transferring are separate). Unknown items can't be taken.
// - Double-click takes, wears, uses or puts back; drag moves between panels and onto equipment slots; Ctrl-drag (or
//   Ctrl-click) splits an ammo stack; R sorts the pack; "Take searched" takes everything revealed that fits.
// - Count, capacity and weight are shown separately; weight colour bands at 25 / 75 / 100% (Duckov WeightBarHUD).
// World API (for the world worker): openLoot({ name, items, search }) where items is the live list of what is inside
// and search is loot/search.ts createSearch(items) (or bodySearch(enemy)), or null when everything is already known.
// The view keeps items and the session in step when you take or put things. Optional: near() closes the screen when
// it returns false (walked away), onClose() runs on close, kind picks the header stripe.
import { G } from "../core/state";
import { itemDef, sortPack, spawnPickup } from "../loot/raidloot";
import { advanceSearch, take, type SearchSession, type SearchSlot } from "../loot/search";
import { equipDef, isEquip, parseInst } from "../loot/equipment";
import { collectEquipment, equipFromLocker, equipFromPack, unequip } from "../loot/equipment-actions";
import { HEALS } from "../combat/weapons";
import { cancelReload } from "../combat/reload";
import { carriedWeight } from "../actors/player";
import { sfx } from "../core/audio";
import { sting } from "../core/music";
import { save } from "../core/save";
import { carryLimit, condition, gearSummary, SLOT_NAME } from "./equipui";
import { iconHtml } from "./itemicon";
import { iconUrl } from "./icons";
import { itemCopy } from "./itemcopy";
import type { AttSlot, WearSlot } from "../contracts";
import { ATT_SLOTS, SLOT_LABEL, attachmentDef, isAttachment, statLines } from "../loot/attachments";
import { GUN, fit, unfit, statsFor } from "../combat/gunstats";
import { CALIBERS, CLASS_LABEL, gunOf, isCaliber } from "../combat/guns";
import { placeGun, takeGun, swapSlots, freeGunSlot } from "../combat/arsenal";
import { tierAtLeast, tierOf } from "../loot/tiers";
import { itemType, withCount } from "../loot/instances";
import { checkpointInventory, consumeInstance } from "../core/raid-journal";

export type LootTarget = {
  /** header title: "Ammo tin", "Peel Gang bandit" */
  name: string;
  /** the live contents; the view splices taken items out and pushes put-back items in */
  items: string[];
  /** per-item reveal (loot/search.ts); null = everything is already known */
  search: SearchSession | null;
  kind?: "container" | "body" | "locker";
  /** a second line under the title: "Knocked out", "Food basket" */
  sub?: string;
  /** false closes the screen (you walked away) */
  near?: () => boolean;
  onClose?: () => void;
  /** extra buttons for the target panel footer (the locker's "Change your look") */
  actions?: { label: string; run: () => void }[];
};
/** set by hud.ts: refresh the HUD after a transfer */
/** changed: after any move. side: the right panel's content when the screen has no target (the raid's job log,
 *  story/raid.ts). note: a lore note's paper for the tag; read: a note was clicked (read) */
export const lootHooks = { changed: () => {}, side: null as null | (() => string), note: null as null | ((type: string) => string), read: (_inst: string) => {} };

/** gun:k = gun slot k (0 = key 1); att = "k.slot" (an attachment slot on gun k) */
type Src = { z: "pack"; i: number } | { z: "slot"; s: WearSlot } | { z: "fixed"; s: "case" } | { z: "gun"; s: "0" | "1" } | { z: "them"; i: number } | { z: "att"; s: string };
type Entry = { item: string; revealed: boolean; idx: number; slot?: SearchSlot };
const EQ_ORDER: (WearSlot | "case")[] = ["case", "head", "body", "face", "ears", "back"];
const gk = (s: string): 0 | 1 => (s === "1" ? 1 : 0);
const attOf = (s: string): [0 | 1, AttSlot] => { const [k, slot] = s.split("."); return [gk(k), slot as AttSlot]; };
const isKingpin = (inst: string | null | undefined) => !!inst && inst === G.save.boundWeapons?.kingpin;
const isGun = (inst: string | null | undefined) => !!gunOf(inst);
/** gun attachment slots (G1.5 row 36): what each is for, shown on an empty slot */
const ATT_TIP: Record<AttSlot, string> = { sight: "Sights and scopes: aim zoom when you aim (right mouse).", muzzle: "Compensators cut recoil; a suppressor keeps your shots quiet.", mag: "Magazines: more rounds before you reload.", laser: "Lasers tighten your shots from the hip.", grip: "Grips: less kick, or quicker to aim.", stock: "Stocks: steadier shots and less kick." };
const EQ_TIP: Record<WearSlot, string> = { head: "Hats and helmets. Head armor stops critical hits.", face: "Glasses and masks.", body: "Vests and jackets. Body armor cuts damage.", back: "Bags. More pack slots and carry weight.", ears: "Headphones. Hear footsteps through walls." };
const BRK = `<i class="brk tl"></i><i class="brk tr"></i><i class="brk bl"></i><i class="brk br"></i>`;
const popped = new Set<SearchSlot>();

let root: HTMLDivElement | null = null, target: LootTarget | null = null, sel: Src | null = null, hover: Src | null = null;
let closedAt = -1e9, sigLeft = "", sigThem = "", msgT = 0, tipEl: HTMLDivElement | null = null;
const home = () => G.scene === "bunker";
const gear = () => (home() ? G.save.gear : G.gear);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export const lootOpen = () => !!root;
export const lootTarget = () => target;
/** true while a target is open and for 200 ms after it closes, so the E that closed it doesn't reopen it */
export const lootSwallowsInteract = () => (!!root && !!target) || performance.now() - closedAt < 200;

// ---------------------------------------------------------------- contents
function entries(): Entry[] {
  if (!target) return [];
  if (home() && target.kind === "locker") target.items = G.save.locker;
  if (target.search) return target.search.slots.map((slot, idx) => ({ item: slot.item, revealed: slot.revealed, idx, slot, taken: slot.taken })).filter((e) => !e.taken);
  return target.items.map((item, idx) => ({ item, revealed: true, idx }));
}
const stackOf = (e: Entry) => { const d = itemDef(e.item); return d.kind === "ammo" ? d.stack ?? 8 : 0; };
function itemAt(src: Src | null): string | null {
  if (!src) return null;
  if (src.z === "pack") return (home() ? undefined : G.pack[src.i]) ?? null;
  if (src.z === "slot") return gear()[src.s] ?? null;
  if (src.z === "fixed") return "briefcase";
  if (src.z === "gun") return G.save.guns[gk(src.s)]?.inst ?? null;
  if (src.z === "att") { const [k, slot] = attOf(src.s); return G.save.guns[k]?.atts[slot] ?? null; }
  const e = entries()[src.i]; return e && e.revealed ? e.item : null;
}
const same = (a: Src | null, b: Src | null) => !!a && !!b && a.z === b.z && ("i" in a ? a.i === (b as { i: number }).i : (a as { s: string }).s === (b as { s: string }).s);
const key = (s: Src) => s.z + ":" + ("i" in s ? s.i : s.s);
const parse = (k: string | undefined): Src | null => { if (!k) return null; const [z, v] = k.split(":"); return z === "pack" || z === "them" ? { z, i: +v } as Src : { z, s: v } as Src; };

// ---------------------------------------------------------------- actions
function say(t: string, bad = false) {
  if (bad) sfx("nope");
  const m = root?.querySelector(".lv-msg") as HTMLElement | null; if (!m) return;
  m.textContent = t; m.classList.toggle("bad", bad); m.style.opacity = "1"; msgT = 2.6;
}
function changed() { checkpointInventory(); lootHooks.changed(); render(); }
function removeEntry(e: Entry) {
  if (!target) return;
  if (e.slot && target.search) take(target.search, e.idx);
  const k = e.slot ? target.items.indexOf(e.item) : e.idx; if (k >= 0) target.items.splice(k, 1);
}
const packFull = () => G.pack.length >= G.packSlots;
/** take a revealed item from the target into the pack (or straight into the ammo pouch / onto the gun) */
function takeFrom(i: number, opts: { half?: boolean; wear?: boolean; quiet?: boolean } = {}): boolean {
  if (!home() && !G.alive) return false;
  const e = entries()[i]; if (!e || !target) return false;
  if (!e.revealed) { if (!opts.quiet) say("Still searching that one", true); return false; }
  if (home()) { // the locker: taking a piece means wearing it (or fitting it, or slinging a gun)
    if (isAttachment(e.item)) return fitFrom({ z: "them", i });
    if (isGun(e.item)) return gunFrom({ z: "them", i });
    if (!equipFromLocker(e.idx)) { say("That can't be worn", true); return false; }
    G.rig?.setGear?.(G.save.gear); save(G.save); sfx("ui"); say(`Wearing the ${itemDef(e.item).name}`); sel = null; changed(); return true;
  }
  const d = itemDef(e.item);
  if (d.kind === "ammo") {
    const n = stackOf(e), k = opts.half && n > 1 ? Math.floor(n / 2) : n, cal = itemType(e.item);
    if (isCaliber(cal)) G.reserve[cal] += k; // its own caliber's reserve (Duckov caliber matching)
    if (e.slot && k < n) {
      const remaining = withCount(e.item, n - k), index = target.items.indexOf(e.item);
      e.slot.item = remaining;
      if (index >= 0) target.items[index] = remaining;
    } else { removeEntry(e); consumeInstance(e.item); }
    sfx("pick"); say(`+${k} ${isCaliber(cal) ? CALIBERS[cal].name.toLowerCase() : "rounds"}`); changed(); return true;
  }
  if (d.kind === "attachment" && opts.wear) return fitFrom({ z: "them", i }); // "Take and fit"; a plain take packs it (Duckov never fits from a container)
  if (d.kind === "gun" && (opts.wear || freeGunSlot() >= 0)) return gunFrom({ z: "them", i }); // Duckov TryPlug: an empty gun slot first
  if (packFull()) { if (!opts.quiet) say("Your pack is full. Put something back or drop it first.", true); return false; }
  if (isEquip(e.item)) {
    if (equipDef(e.item)?.bound) { say("That stays with its owner", true); return false; }
    removeEntry(e); const r = collectEquipment(e.item);
    if (opts.wear && r === "packed") equipFromPack(G.pack.length - 1);
    say(r === "equipping" || opts.wear ? `Putting on the ${d.name}…` : `Took the ${d.name}`);
  } else { removeEntry(e); G.pack.push(e.item); if (!opts.quiet) say(`Took the ${d.name}`); }
  sfx("pick"); if (sel && sel.z === "them") sel = null; changed(); return true;
}
function takeAllSearched() {
  let n = 0;
  for (let guard = 0; guard < 64; guard++) {
    const list = entries(), i = list.findIndex((e) => e.revealed && (itemDef(e.item).kind === "ammo" || !packFull()));
    if (i < 0) break; if (!takeFrom(i, { quiet: true })) break; n++;
  }
  const left = entries().filter((e) => e.revealed).length;
  say(n ? (left ? `Took ${n}. Your pack is full.` : `Took ${n} item${n > 1 ? "s" : ""}`) : left ? "Your pack is full" : "Nothing searched yet", !n);
}
function putInto(i: number): boolean {
  if (!target || home() || !G.alive) return false;
  const inst = G.pack[i]; if (!inst) return false;
  if (G.equipping?.inst === inst) { say("You're putting that on", true); return false; }
  G.pack.splice(i, 1); target.items.push(inst);
  if (target.search) target.search.slots.push({ item: inst, revealAt: 0, revealed: true, taken: false });
  sfx("pick"); say(`Put the ${itemDef(inst).name} in the ${target.name.toLowerCase()}`); sel = null; changed(); return true;
}
export function useHeal(id: string): boolean {
  if (G.scene !== "raid" || !G.alive) return false;
  const inst = G.pack.find(item => item === id) ?? G.pack.find(item => itemType(item) === id);
  if (!inst || !HEALS[itemType(inst)]) { say("You don't have one", true); return false; }
  if (G.useItem) { say("You're already using something", true); return false; }
  if (G.equipping) { say("Finish changing gear first", true); return false; }
  if (G.hp >= G.maxHp) { say("You're already at full health", true); return false; }
  G.useItem = { id: inst, t: 0, time: HEALS[itemType(inst)].time }; cancelReload(); sfx("ui"); say(`Using the ${itemDef(inst).name}…`); changed(); return true;
}
function wearFromPack(i: number): boolean {
  const inst = G.pack[i]; if (!inst || !isEquip(inst)) return false;
  if (G.equipping) { say("Already changing gear", true); return false; }
  if (!equipFromPack(i)) { say(G.useItem ? "Finish healing first" : "No room in your pack for what you'd take off", true); return false; }
  sfx("ui"); say(`Putting on the ${itemDef(inst).name}…`); changed(); return true;
}
function takeOff(slot: WearSlot): boolean {
  const inst = gear()[slot]; if (!inst) return false;
  if (!home() && equipDef(inst)?.bound) { say("Your own kit stays on in a raid. Wear something over it instead.", true); return false; }
  if (!unequip(slot)) { say(home() ? "Can't take that off" : G.equipping ? "Already changing gear" : packFull() ? "No room in your pack" : "Can't take that off right now", true); return false; }
  if (home()) { G.rig?.setGear?.(G.save.gear); save(G.save); say(`Put the ${itemDef(inst).name} in the locker`); } else say(`Taking off the ${itemDef(inst).name}…`);
  sfx("ui"); sel = null; changed(); return true;
}
// ---- gun attachments: fit from the pack, a container or the locker; take off into the pack, a container or the locker
const attName = (id: string) => attachmentDef(id)?.name ?? itemDef(id).name;
/** which gun an attachment goes on: the one asked for, else the gun in hand if it has that slot, else the other */
function fitTarget(id: string, on?: 0 | 1): 0 | 1 | -1 {
  const a = attachmentDef(id); if (!a) return -1;
  const has = (k: 0 | 1) => !!gunOf(G.save.guns[k]?.inst)?.slots.includes(a.slot);
  if (on !== undefined) return has(on) ? on : -1;
  return has(G.slot) ? G.slot : has(G.slot === 0 ? 1 : 0) ? (G.slot === 0 ? 1 : 0) : -1;
}
function fitFrom(src: Src, on?: 0 | 1): boolean {
  if (!home() && !G.alive) return false;
  const id = itemAt(src), a = attachmentDef(id); if (!id || !a) { say("That isn't a gun part", true); return false; }
  const k0 = fitTarget(id, on), k = k0 as 0 | 1;
  if (k0 < 0) { say(on !== undefined && G.save.guns[on] ? `The ${gunOf(G.save.guns[on]!.inst)!.name} has no ${SLOT_LABEL[a.slot].toLowerCase()} slot` : `Neither gun has a ${SLOT_LABEL[a.slot].toLowerCase()} slot`, true); return false; }
  if (src.z === "them") {
    const e = entries()[src.i]; if (!e || !e.revealed) { say("Still searching that one", true); return false; }
    removeEntry(e); const r = fit(id, k);
    if (r.ok && r.old) { if (home()) G.save.locker.push(r.old); else if (!packFull()) G.pack.push(r.old); else putBack(r.old); }
  } else if (src.z === "pack") {
    if (G.equipping?.inst === id) return false;
    G.pack.splice(src.i, 1); const r = fit(id, k);
    if (r.ok && r.old) G.pack.splice(src.i, 0, r.old); // swap in place
  } else if (src.z === "att") { // from one gun to the other
    const [from, slot] = attOf(src.s); if (from === k) return false;
    unfit(slot, from); const r = fit(id, k);
    if (r.ok && r.old) fit(r.old, from);
  } else return false;
  if (home()) save(G.save);
  sfx("rare", 0.6); say(`${a.name} fitted on the ${gunOf(G.save.guns[k]!.inst)!.name}. ${statLines(id, gunOf(G.save.guns[k]!.inst)!.mag).map((l) => l.text).join(", ")}`); sel = { z: "att", s: `${k}.${a.slot}` }; changed(); return true;
}
// ---- guns: into a gun slot from the pack, a container or the locker; out to the pack, a container or the locker
/** room in the pack for n more items */
const packRoom = (n: number) => G.pack.length + n <= G.packSlots;
/** the gun in slot k leaves it: the Kingpin can only go on the rack at home; others go to the locker (home), the
 *  open container, or the pack, with their attachments (they come off with the gun) */
function gunOut(k: 0 | 1, where: "pack" | "them"): boolean {
  if (!home() && !G.alive) return false;
  const gs = G.save.guns[k]; if (!gs) return false;
  const name = gunOf(gs.inst)?.name ?? "gun", n = Object.values(gs.atts).filter(Boolean).length;
  if (isKingpin(gs.inst)) {
    if (!home()) { say("The Kingpin stays with you in a raid. Swap the two slots by dragging one onto the other.", true); return false; }
    if (!G.save.guns[k === 0 ? 1 : 0]) { say("Keep at least one gun in a slot", true); return false; }
  }
  if (!home() && where === "pack" && !packRoom(1 + n)) { say(`No room in your pack for the ${name}${n ? " and its parts" : ""}`, true); return false; }
  const out = takeGun(k)!;
  if (home()) { if (!isKingpin(out.inst)) G.save.locker.push(out.inst); G.save.locker.push(...out.atts); save(G.save); say(isKingpin(out.inst) ? "The Kingpin goes on the rack. Double-click an empty gun slot to take it back" : `Put the ${name} in the locker`); }
  else if (where === "them" && target) { putBack(out.inst); out.atts.forEach(putBack); say(`Left the ${name} in the ${target.name.toLowerCase()}`); }
  else { G.pack.push(out.inst, ...out.atts); say(`Slung the ${name} into your pack`); }
  sfx("ui"); sel = null; changed(); return true;
}
/** a gun into slot `on` (default: the first empty one). An occupied slot swaps: its gun goes where this one came from */
function gunFrom(src: Src, on?: 0 | 1): boolean {
  if (!home() && !G.alive) return false;
  const inst = itemAt(src); if (!inst || !isGun(inst)) { say("Only guns go in a gun slot", true); return false; }
  if (src.z === "gun") { if (on !== undefined && gk(src.s) !== on) { swapSlots(); if (home()) save(G.save); sfx("ui"); say("Swapped gun 1 and gun 2"); sel = null; changed(); return true; } return false; }
  const free = freeGunSlot(), k0 = on ?? free, k = k0 as 0 | 1;
  if (k0 < 0) { say("Both gun slots are full: drag it onto gun 1 or gun 2 to swap", true); return false; }
  if (src.z === "them") { const e = entries()[src.i]; if (!e || !e.revealed) { say("Still searching that one", true); return false; } }
  const old = G.save.guns[k];
  if (old) {
    if (isKingpin(old.inst) && !home()) { say("The Kingpin stays with you in a raid. Put this one in the other slot.", true); return false; }
    const n = Object.values(old.atts).filter(Boolean).length;
    if (!home() && src.z === "them" && !target && !packRoom(1 + n)) { say("No room for the gun you'd swap out", true); return false; }
    if (!home() && src.z === "pack" && !packRoom(n)) { say("No room in your pack for its parts", true); return false; }
  }
  // take the incoming gun from where it was
  if (src.z === "pack") G.pack.splice(src.i, 1);
  else if (src.z === "them") { const e = entries()[src.i]!; removeEntry(e); if (home()) { const j = G.save.locker.indexOf(inst); if (j >= 0) G.save.locker.splice(j, 1); } }
  else return false;
  const out = old ? takeGun(k) : null;
  placeGun(k, inst);
  if (out) {
    if (home()) { if (!isKingpin(out.inst)) G.save.locker.push(out.inst); G.save.locker.push(...out.atts); }
    else if (src.z === "them" && target) { putBack(out.inst); out.atts.forEach(putBack); }
    else G.pack.push(out.inst, ...out.atts);
  }
  if (home()) save(G.save);
  sfx("rare", 0.6); say(`${gunOf(inst)!.name} in gun ${k + 1}${out ? `; the ${gunOf(out.inst)?.name} ${home() ? (isKingpin(out.inst) ? "went on the rack" : "went to the locker") : "came off"}` : ""}. Press ${k + 1} to draw it`);
  sel = { z: "gun", s: String(k) as "0" | "1" }; changed(); return true;
}
/** home: an empty gun slot takes the Kingpin back off the rack */
function kingpinBack(k: 0 | 1): boolean {
  const kp = G.save.boundWeapons?.kingpin; if (!home() || !kp || G.save.guns[k] || G.save.guns.some((g) => g?.inst === kp)) return false;
  placeGun(k, kp); save(G.save); sfx("ui"); say(`The Kingpin is back in gun ${k + 1}`); changed(); return true;
}
/** put an item into the open container (raid) */
function putBack(inst: string) { if (!target) return; target.items.push(inst); if (target.search) target.search.slots.push({ item: inst, revealAt: 0, revealed: true, taken: false }); }
function unfitTo(s: string, where: "pack" | "them"): boolean {
  if (!home() && !G.alive) return false;
  const [k, slot] = attOf(s), id = G.save.guns[k]?.atts[slot]; if (!id) return false;
  const gname = gunOf(G.save.guns[k]?.inst)?.name ?? "gun";
  if (home()) { unfit(slot, k); G.save.locker.push(id); save(G.save); say(`Put the ${attName(id)} in the locker`); }
  else if (where === "them" && target) { unfit(slot, k); putBack(id); say(`Left the ${attName(id)} in the ${target.name.toLowerCase()}`); }
  else { if (packFull()) { say("No room in your pack", true); return false; } unfit(slot, k); G.pack.push(id); say(`Took the ${attName(id)} off the ${gname}`); }
  sfx("ui"); sel = null; changed(); return true;
}
function dropFromPack(i: number) {
  const inst = G.pack[i]; if (!inst || home() || !G.alive) return;
  if (G.equipping?.inst === inst) { say("You're putting that on", true); return; }
  G.pack.splice(i, 1); spawnPickup(inst, G.pp.clone().setY(1), 0, 1); sfx("pick"); say(`Dropped the ${itemDef(inst).name}`); sel = null; changed();
}
function reorder(a: number, b: number) {
  if (a === b || home()) return;
  if (b >= G.pack.length) { const [x] = G.pack.splice(a, 1); G.pack.push(x); } else [G.pack[a], G.pack[b]] = [G.pack[b], G.pack[a]];
  sel = null; sfx("ui"); changed();
}
function sortMine() {
  if (home()) { G.save.locker.sort((a, b) => itemDef(b).value - itemDef(a).value); save(G.save); }
  else sortPack();
  sfx("ui"); say(home() ? "Locker sorted by value" : "Pack sorted: most valuable first, so the cheek pouch keeps the best"); sel = null; changed();
}
/** double-click / Enter: the obvious thing for that item */
function primary(src: Src) {
  if (src.z === "them") return void takeFrom(src.i);
  if (src.z === "slot") return void takeOff(src.s);
  if (src.z === "fixed") return void say("Your briefcase. Swing it with V.");
  if (src.z === "gun") { const k = gk(src.s); if (!G.save.guns[k]) { if (!kingpinBack(k)) say(home() ? "An empty gun slot. Drag a gun from the locker onto it." : "An empty gun slot. Guns you pick up land here."); return; } return void gunOut(k, target ? "them" : "pack"); }
  if (src.z === "att") return void unfitTo(src.s, "pack");
  const inst = G.pack[src.i]; if (!inst) return;
  if (isAttachment(inst)) return void fitFrom(src);
  if (isGun(inst) && !target) return void gunFrom(src);
  if (target) return void putInto(src.i);
  if (isEquip(inst)) return void wearFromPack(src.i);
  if (HEALS[itemType(inst)]) return void useHeal(inst);
  const cp = itemCopy(inst); say(`${cp.name}: ${cp.does[0] ?? cp.use}`);
}
function drop(src: Src, dst: Src | { z: "themGrid" } | { z: "packGrid" }, ctrl: boolean) {
  if (dst.z === "att") return void fitFrom(src, attOf(dst.s)[0]);
  if (dst.z === "gun") return void (attachmentDef(itemAt(src)) ? fitFrom(src, gk(dst.s)) : gunFrom(src, gk(dst.s)));
  if (src.z === "att") return void unfitTo(src.s, dst.z === "them" || dst.z === "themGrid" ? "them" : "pack");
  if (src.z === "gun") return void gunOut(gk(src.s), dst.z === "them" || dst.z === "themGrid" ? "them" : "pack");
  if (dst.z === "them" || dst.z === "themGrid") {
    if (src.z === "pack") return void putInto(src.i);
    if (src.z === "slot" && home()) return void takeOff(src.s);
    return;
  }
  if (dst.z === "pack" || dst.z === "packGrid") {
    if (src.z === "them") return void takeFrom(src.i, { half: ctrl });
    if (src.z === "pack") return void reorder(src.i, dst.z === "pack" ? dst.i : G.pack.length);
    if (src.z === "slot") return void takeOff(src.s);
    return;
  }
  if (dst.z === "slot") {
    const inst = itemAt(src), d = equipDef(inst);
    if (!d) return void say("Only gear goes in that slot", true);
    if (d.slot !== dst.s) return void say(`That goes on your ${SLOT_NAME[d.slot].toLowerCase()}`, true);
    if (src.z === "pack") return void wearFromPack(src.i);
    if (src.z === "them") return void takeFrom(src.i, { wear: true });
  }
}
/** can src be dropped on the element with this data key? (drop highlighting) */
function canDrop(src: Src, k: string): boolean {
  const dst = k === "themGrid" || k === "packGrid" ? { z: k } as const : parse(k); if (!dst) return false;
  if (same(src, dst as Src)) return false;
  if (dst.z === "att") { const a = attachmentDef(itemAt(src)), [k, slot] = attOf(dst.s); return !!a && a.slot === slot && !!gunOf(G.save.guns[k]?.inst)?.slots.includes(slot) && !(src.z === "att" && attOf(src.s)[0] === k); }
  if (dst.z === "gun") { const inst = itemAt(src), k = gk(dst.s); if (attachmentDef(inst)) return src.z !== "att" && fitTarget(inst!, k) >= 0; return isGun(inst) && (src.z === "pack" || src.z === "them" || src.z === "gun"); }
  if (dst.z === "fixed") return false;
  if (src.z === "att") return (dst.z === "pack" || dst.z === "packGrid") ? !home() : (dst.z === "them" || dst.z === "themGrid") && !!target;
  if (src.z === "gun") return (dst.z === "pack" || dst.z === "packGrid") ? !home() : (dst.z === "them" || dst.z === "themGrid") && !!target;
  if (dst.z === "slot") { const d = equipDef(itemAt(src)); return !!d && d.slot === dst.s && src.z !== "slot"; }
  if (dst.z === "them" || dst.z === "themGrid") return !!target && (src.z === "pack" || (src.z === "slot" && home()));
  if (dst.z === "pack" || dst.z === "packGrid") return !home() && (src.z === "them" || src.z === "pack" || src.z === "slot");
  return false;
}

// ---------------------------------------------------------------- markup
function cellHtml(inst: string | undefined, k: string, o: { pouch?: boolean; count?: number; tip?: string } = {}) {
  const cls = ["c3", o.pouch ? "pouch" : "", sel && key(sel) === k ? "sel" : ""].join(" ");
  if (!inst) return `<div class="${cls} empty" data-drop="${k}"${o.pouch ? ` data-tip="Cheek pouch: kept even if you get bonked"` : ""}></div>`;
  const d = itemDef(inst), c = isEquip(inst) ? condition(inst) : null;
  const dur = c === null ? "" : `<span class="dur ${c <= 0 ? "broken" : c < 0.35 ? "low" : ""}"><i style="width:${Math.max(4, c * 100)}%"></i></span>`;
  return `<button class="${cls}" style="--rar:var(--rar-${d.rarity})" data-src="${k}" aria-label="${esc(d.name)}"${o.tip ? ` data-tip="${esc(o.tip)}"` : ""}>${iconHtml(inst, 66)}${o.count ? `<span class="q">${o.count}</span>` : ""}${dur}</button>`;
}
function eqHtml(s: WearSlot | "case") {
  const k = (s === "case" ? "fixed:" : "slot:") + s, isSel = sel && key(sel) === k ? " sel" : "";
  if (s === "case") return `<button class="e3${isSel}" style="--rar:var(--rar-common)" data-src="${k}" data-tip="Your briefcase: the V swing"><span class="emo">💼</span><span class="lab">Briefcase</span></button>`;
  const inst = gear()[s], d = equipDef(inst), busy = G.equipping?.slot === s;
  const c = inst ? condition(inst) : null, dur = c === null ? "" : `<span class="dur ${c <= 0 ? "broken" : c < 0.35 ? "low" : ""}"><i style="width:${Math.max(4, c * 100)}%"></i></span>`;
  return `<button class="e3${inst ? "" : " empty"}${isSel}${busy ? " busy" : ""}" style="--rar:${d ? `var(--rar-${d.rarity})` : "transparent"}" data-src="${k}" data-tip="${esc(SLOT_NAME[s] + ": " + (inst ? itemDef(inst).name : EQ_TIP[s]))}">${inst ? iconHtml(inst, 50) : ""}${d?.bound ? `<span class="lock" aria-label="yours for good">★</span>` : ""}${dur}<span class="lab">${SLOT_NAME[s]}</span></button>`;
}
/** one gun attachment slot (G1.5 row 36): drop an attachment here, double-click or drag it off to remove */
function attHtml(gun: 0 | 1, slot: AttSlot) {
  const k = `att:${gun}.${slot}`, id = G.save.guns[gun]?.atts[slot] ?? null, a = attachmentDef(id), isSel = sel && key(sel) === k ? " sel" : "";
  return `<button class="e3 a3${id ? "" : " empty"}${isSel}" style="--rar:${a ? `var(--rar-${a.rarity})` : "transparent"}" data-src="${k}" data-tip="${esc(SLOT_LABEL[slot] + ": " + (a ? a.name : ATT_TIP[slot]))}">${id ? iconHtml(id, 40) : ""}<span class="lab">${SLOT_LABEL[slot]}</span></button>`;
}
/** loaded / reserve for gun slot k (the reserve of its caliber) */
function roundsOf(k: 0 | 1) { const def = gunOf(G.save.guns[k]?.inst); if (!def) return null; return { loaded: G.loaded[k], reserve: (home() ? G.save.ammo : G.reserve)[def.caliber], cal: CALIBERS[def.caliber].short }; }
/** gun slot k: the gun card (wide cell: icon, name, tier rim, loaded / reserve) and its own attachment row */
function gunHtml(k: 0 | 1) {
  const gs = G.save.guns[k], def = gunOf(gs?.inst), key2 = `gun:${k}`, isSel = sel && key(sel) === key2 ? " sel" : "", held = !home() && G.slot === k ? " held" : "";
  if (!gs || !def) return `<div class="lv-gunrow"><button class="e3 g3 empty${isSel}" data-src="${key2}" data-tip="${esc(`Gun ${k + 1}: ${home() && !G.save.guns.some((g) => isKingpin(g?.inst)) ? "double-click to take the Kingpin off the rack, or drag a gun here" : "drag a gun here. Guns you pick up land in an empty slot."}`)}"><span class="key">${k + 1}</span><span class="lab">Gun ${k + 1}</span></button></div>`;
  const r = roundsOf(k)!, t = tierOf(def.tier), fittedN = def.slots.filter((q) => gs.atts[q]).length;
  const card = `<button class="e3 g3${isSel}${held}" style="--rar:var(--rar-${def.tier})" data-src="${key2}" data-tip="${esc(`Gun ${k + 1}: ${def.name}, ${t.name} ${CLASS_LABEL[def.cls].toLowerCase()}. ${def.trait}.`)}"><span class="key">${k + 1}</span>${iconHtml(gs.inst, 54)}<span class="nm">${esc(def.name)}</span>${home() ? `<span class="q">${r.reserve} ${r.cal}</span>` : `<span class="q">${r.loaded}/${r.reserve} <small>${r.cal}</small></span>`}${isKingpin(gs.inst) ? `<span class="lock" aria-label="yours for good">★</span>` : ""}${fittedN ? `<span class="pips">${def.slots.map((q) => `<i class="${gs.atts[q] ? "on" : ""}"></i>`).join("")}</span>` : ""}</button>`;
  return `<div class="lv-gunrow">${card}<div class="lv-att">${def.slots.map((q) => attHtml(k, q)).join("")}</div></div>`;
}
const zoomText = (d = GUN.adsDist) => `×${d.toFixed(2).replace(/0$/, "")}`;
function weightHtml() {
  const w = carriedWeight(), lim = carryLimit(), r = w / lim;
  const band = r > 1 ? "over" : r > 0.75 ? "heavy" : r <= 0.25 ? "light" : "normal";
  const word = { light: "light, a little faster", normal: "normal", heavy: "heavy, slower and louder", over: "overloaded, you crawl" }[band];
  return `<div class="lv-weight ${band}" data-tip="Carry weight. Past 75% you slow down; past 100% you crawl."><div class="row"><span>Load</span><span><span class="num">${w.toFixed(1)} of ${lim} kg</span>, <span class="state">${word}</span></span></div>
    <div class="track"><i style="width:${Math.min(100, r * 100).toFixed(1)}%"></i><b style="left:25%"></b><b style="left:75%"></b></div></div>`;
}
function leftHtml() {
  const g = gearSummary(gear());
  let body = `<div class="lv-sect">Weapons <span class="note num">1 and 2 draw, V swings</span></div><div class="lv-guns">${gunHtml(0)}${gunHtml(1)}</div>
    <div class="lv-sect">Wearing <span class="note num">armor ${g.body} body, ${g.head} head</span></div><div class="lv-eq">${EQ_ORDER.map(eqHtml).join("")}</div>`;
  if (home()) {
    const stash = G.save.reserved.length;
    body += `<div class="lv-sect">At home</div><p class="lv-empty">Gear you find comes home to this locker. ${stash ? `${stash} item${stash > 1 ? "s" : ""} wait in your stash for the Fence.` : "Your stash is empty."} Pieces marked ★ are yours for good.</p>`;
  } else {
    let cells = ""; for (let i = 0; i < G.packSlots; i++) cells += cellHtml(G.pack[i], "pack:" + i, { pouch: i < G.pouchSlots });
    body += `<div class="lv-sect">Pack <button class="b3 small" data-act="sort" data-tip="Most valuable first, so the cheek pouch keeps the best (R)">Sort <kbd>R</kbd></button></div><div class="lv-grid" data-drop="packGrid">${cells}</div>
      <p class="lv-empty" style="font-size:16px;margin-top:8px">The first ${G.pouchSlots} slots are your cheek pouch: kept even if you get bonked.</p>`;
  }
  return `${BRK}<header class="lv-head"><h2>The Businessman</h2><small class="num">${home() ? `🍌 ${G.save.money}` : `${G.pack.length} of ${G.packSlots} slots`}</small></header><div class="tie"></div>
    <div class="lv-body">${body}</div>${home() ? "" : weightHtml()}`;
}
function themHtml() {
  if (!target) return "";
  const list = entries(), shown = list.filter((e) => e.revealed).length, searching = list.length - shown;
  const n = Math.max(10, Math.ceil((list.length + 1) / 5) * 5);
  let cells = "";
  for (let i = 0; i < n; i++) {
    const e = list[i], k = "them:" + i;
    if (!e) { cells += `<div class="c3 empty" data-drop="${k}"></div>`; continue; }
    if (!e.revealed) {
      const scan = list.findIndex((q) => !q.revealed) === i;
      cells += `<div class="c3 unk${scan ? " scan" : ""}" data-tip="Still searching"><span>?</span>${scan ? `<svg class="ring" viewBox="0 0 40 40"><circle class="tr" cx="20" cy="20" r="16" pathLength="100"/><circle class="fg" cx="20" cy="20" r="16" pathLength="100" stroke-dashoffset="100"/></svg>` : ""}</div>`;
      continue;
    }
    const c = cellHtml(e.item, k, { count: stackOf(e) || undefined });
    cells += e.slot && popped.has(e.slot) ? c.replace('class="c3', 'class="c3 pop') : c;
  }
  const stripe = target.kind === "body" ? "leather" : target.kind === "locker" ? "" : "steel";
  const count = home() ? `${list.length} piece${list.length === 1 ? "" : "s"}` : searching ? `${shown} of ${list.length} found` : `${list.length} item${list.length === 1 ? "" : "s"}`;
  const takeBtn = home() ? "" : `<button class="b3 pri" data-act="takeall" ${shown ? "" : "disabled"}>Take searched${shown ? ` (${shown})` : ""}</button>`;
  const extra = (target.actions ?? []).map((a, i) => `<button class="b3" data-act="x${i}">${esc(a.label)}</button>`).join("");
  const sortBtn = home() ? `<button class="b3 small" data-act="sort">Sort <kbd>R</kbd></button>` : "";
  return `${BRK}<header class="lv-head"><h2>${esc(target.name)}</h2><small class="num">${count}</small></header><div class="tie ${stripe}"></div>
    <div class="lv-sect">${home() ? "Stored gear" : searching ? "Searching…" : list.length ? "Searched" : "Empty"}${target.sub ? `<span class="note">${esc(target.sub)}</span>` : ""}${sortBtn}</div>
    <div class="lv-body"><div class="lv-grid" data-drop="themGrid">${cells}</div>${!list.length && !home() ? `<p class="lv-empty" style="margin-top:12px">Nothing left. Drag things here to leave them behind.</p>` : ""}</div>
    <div class="lv-foot">${takeBtn}${extra}</div>`;
}
function tagHtml() {
  const src = sel ?? hover, inst = itemAt(src);
  if (!src || !inst) {
    return `<div class="tag3 blank"><span class="hole"></span><p class="lead">Click anything to read its tag.</p><ol>
      <li><kbd>Double-click</kbd>${target ? (home() ? "Wear it, or put it back in the locker" : "Take it, or put it back") : "Wear gear, or use a heal"}</li>
      <li><kbd>Drag</kbd>Move it between panels or onto a slot</li>
      ${home() ? "" : `<li><kbd>Ctrl</kbd>Hold while dragging rounds to split the stack</li><li><kbd>R</kbd>Sort your pack</li>`}</ol></div>`;
  }
  if (src.z === "gun" && !inst) return `<div class="tag3 blank"><span class="hole"></span><p class="lead">Gun ${gk(src.s) + 1}</p><p class="blurb">Either slot takes any gun. Press ${gk(src.s) + 1} to draw it; the mouse wheel flips between the two.</p><ol><li><kbd>Drag</kbd>A gun from your pack${home() ? " or the locker" : ""} onto this slot</li>${home() ? "<li><kbd>Double-click</kbd>Take the Kingpin off the rack</li>" : ""}</ol></div>`;
  if (src.z === "att" && !inst) return `<div class="tag3 blank"><span class="hole"></span><p class="lead">${SLOT_LABEL[attOf(src.s)[1]]} slot</p><p class="blurb">${ATT_TIP[attOf(src.s)[1]]}</p><ol><li><kbd>Drag</kbd>An attachment onto this slot or onto the gun</li><li><kbd>Double-click</kbd>An attachment in your pack to fit it</li></ol></div>`;
  if (src.z === "fixed") {
    return `<div class="tag3" style="--rar:var(--rar-common)"><span class="hole"></span><div class="bigemo">💼</div>
      <h3>Briefcase</h3><div class="rar">Yours for good</div><p class="blurb">${itemCopy("briefcase").blurb}</p>
      <ul class="facts"><li><span>Swing</span><span>V</span></li><li><span>Best when</span><span>you're out of rounds</span></li></ul></div>`;
  }
  if (isGun(inst)) return gunTagHtml(src, inst);
  const d = itemDef(inst), cp = itemCopy(inst), e = equipDef(inst), c = e ? condition(inst) : null;
  if (d.kind === "note" && lootHooks.note) { // a lore note: the paper itself; clicking it reads it (counts for jobs)
    if (src === sel && (src.z !== "them" || entries()[src.i]?.revealed)) lootHooks.read(inst);
    const acts = src.z === "pack" ? `<div class="acts"><button class="b3" data-act="drop">Drop</button></div>` : src.z === "them" && !home() ? `<div class="acts"><button class="b3 pri" data-act="primary">Take</button></div>` : "";
    return `<div class="tag3 note3" style="--rar:var(--rar-${d.rarity})"><span class="hole"></span>${lootHooks.note(itemType(inst))}${acts}</div>`;
  }
  const worn = e && src.z !== "slot" ? gear()[e.slot] : null;
  const facts: string[] = [];
  const att = attachmentDef(inst);
  if (d.kind !== "ammo" && d.kind !== "key") facts.push(`<li><span data-tip="What the Fence pays for it at home">Worth</span><span class="num">${e?.bound ? "Not for sale" : `🍌 ${d.value}`}</span></li>`);
  if (d.kind === "ammo" && src.z === "them") { const en = entries()[src.i]; facts.push(`<li><span>In this stack</span><span class="num">${en ? stackOf(en) : d.stack} rounds</span></li>`); }
  facts.push(`<li><span data-tip="Past 75% of your carry limit you slow down">Weight</span><span class="num">${(d.weight ?? 0).toFixed(1)} kg</span></li>`);
  if (e) facts.push(`<li><span>Slot</span><span>${SLOT_NAME[e.slot]}</span></li>`);
  if (att) {
    const fitsOn = G.save.guns.filter((g) => gunOf(g?.inst)?.slots.includes(att.slot)).map((g) => gunOf(g!.inst)!.name);
    facts.push(`<li><span>Fits</span><span>Any gun's ${SLOT_LABEL[att.slot].toLowerCase()} slot${fitsOn.length ? ` (${esc(fitsOn.join(", "))})` : ""}</span></li>`);
    for (const g of G.save.guns) { const on = g?.atts[att.slot]; if (g && on && on !== inst) facts.push(`<li><span>On your ${esc(gunOf(g.inst)!.name)}</span><span>${esc(attName(on))}</span></li>`); }
  }
  if (c !== null) facts.push(`<li><span data-tip="Armor wears down as it takes hits. Repair it at the workbench.">Condition</span><span class="num"><span class="cond"><i style="width:${Math.max(3, c * 100)}%;${c < 0.35 ? "background:var(--a-warn)" : ""}"></i></span>${Math.round(c * 100)}%</span></li>`);
  if (worn && worn !== inst) facts.push(`<li><span>You're wearing</span><span>${esc(itemDef(worn).name)}</span></li>`);
  if (src.z === "pack" && src.i < G.pouchSlots) facts.push(`<li><span data-tip="The first slots of your pack. Kept even if you get bonked.">Cheek pouch</span><span>Safe if bonked</span></li>`);
  if (G.lootCtx?.orderNeeds?.includes(itemType(inst))) facts.push(`<li><span>Order</span><span>Smuggler Sal wants this</span></li>`);
  const acts: string[] = [];
  const btn = (act: string, label: string, pri = false, tip = "") => `<button class="b3${pri ? " pri" : ""}" data-act="${act}"${tip ? ` data-tip="${esc(tip)}"` : ""}>${label}</button>`;
  if (src.z === "them") {
    if (home()) acts.push(btn("primary", "Wear it", true));
    else {
      acts.push(btn("primary", d.kind === "ammo" ? "Take the rounds" : "Take", true, "Double-click does the same"));
      if (e && !e.bound) acts.push(btn("wear", "Take and wear"));
      if (att) acts.push(btn("wear", "Take and fit"));
      if (d.kind === "ammo" && (entries()[src.i] ? stackOf(entries()[src.i]) : 0) > 1) acts.push(btn("half", "Take half", false, "Or hold Ctrl while dragging"));
    }
  } else if (src.z === "att") {
    acts.push(btn("primary", home() ? "Put in locker" : "Take it off", false, "Double-click does the same, or drag it off"));
  } else if (src.z === "pack") {
    if (e) acts.push(btn("wear", "Wear it", !target, "Takes a second; a hit interrupts it"));
    if (att) acts.push(btn("wear", "Fit it", !target, "Double-click does the same, or drag it onto the gun"));
    if (HEALS[itemType(inst)]) acts.push(btn("use", "Use it", !target, "Or press its quick key, or Q"));
    if (target) acts.push(btn("primary", "Leave it here", true, `Puts it in the ${esc(target.name.toLowerCase())}. Double-click does the same.`));
    acts.push(btn("drop", "Drop"));
  } else if (src.z === "slot") {
    if (!(e?.bound && !home())) acts.push(btn("primary", home() ? "Put in locker" : "Take it off", false, "Double-click does the same"));
  }
  const how = src.z === "att" ? "Double-click it, or drag it off the slot, to take it off." : src.z === "them" && !home() ? (att ? "Drag it onto a gun to fit it, or into your pack." : "Double-click to take it, or drag it into your pack.") : cp.use ? cp.use + "." : "";
  return `<div class="tag3" style="--rar:var(--rar-${d.rarity})"><span class="hole"></span>${iconHtml(inst, 200).replace('class="ico"', 'class="ico big"')}
    <h3>${esc(d.name)}</h3><div class="rar">${esc(cp.rarityLine)}</div>${cp.blurb ? `<p class="blurb">${esc(cp.blurb)}</p>` : ""}
    ${cp.lines?.length ? `<ul class="does stats">${cp.lines.map((l) => `<li class="${l.good ? "up" : "down"}">${esc(l.text)}</li>`).join("")}</ul>` : cp.does.length ? `<ul class="does">${cp.does.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}<ul class="facts">${facts.join("")}</ul>
    ${acts.length ? `<div class="acts">${acts.join("")}</div>` : ""}${how ? `<p class="how">${esc(how)}</p>` : ""}</div>`.replace('<span class="emo"', '<span class="emo bigemo"');
}
/** a gun's tag: tier, class, the numbers that matter (with its fitted parts), and loaded / reserve when it is slotted */
function gunTagHtml(src: Src, inst: string) {
  const def = gunOf(inst)!, t = tierOf(def.tier), cp = itemCopy(inst), k = src.z === "gun" ? gk(src.s) : -1, gs = k >= 0 ? G.save.guns[k as 0 | 1] : null;
  const st = statsFor(def, gs?.atts ?? { sight: null, muzzle: null, mag: null, laser: null, grip: null, stock: null }), r = k >= 0 ? roundsOf(k as 0 | 1) : null;
  const rate = 1 / def.interval, per = def.pellets > 1 ? ` (${def.pellets} pellets)` : "";
  const rateTxt = `${rate >= 2 ? `${Math.round(rate)} a second` : `one every ${def.interval.toFixed(2)} s`}${def.fire === "burst" ? `, bursts of ${def.burst}` : def.fire === "auto" ? ", full auto" : def.fire === "bolt" ? (def.cls === "shotgun" ? ", pump" : ", bolt") : ""}`;
  const parts = gs ? def.slots.filter((q) => gs.atts[q]).map((q) => attName(gs.atts[q]!)) : [];
  const facts = [
    r ? `<li><span data-tip="Loaded, then the reserve of its caliber: only this caliber loads it">Rounds</span><span class="num">${r.loaded} of ${home() ? st.mag : G.slot === k ? G.magSize : st.mag}, ${r.reserve} ${esc(CALIBERS[def.caliber].short.toLowerCase())} spare</span></li>` : `<li><span>Takes</span><span>${esc(CALIBERS[def.caliber].name)}</span></li>`,
    `<li><span>Damage</span><span class="num">${def.damage}${per}, ${rateTxt}</span></li>`,
    `<li><span>Magazine</span><span class="num">${st.mag}${def.reloadMode === "round" ? `, ${def.perRound} s a round` : `, ${st.reload.toFixed(1)} s reload`}</span></li>`,
    `<li><span data-tip="How far a round flies; aim zoom is how far the view leans toward your aim (right mouse)">Range, zoom</span><span class="num">${st.range.toFixed(0)} m, ${zoomText(st.adsDist)}${def.move < 1 ? `, you move at ${Math.round(st.moveSpeed * 100)}%` : ""}</span></li>`,
    `<li><span data-tip="What the Fence pays for it at home">Worth</span><span class="num">${def.bound ? "Not for sale" : `🍌 ${def.value}`}, ${def.weight.toFixed(1)} kg</span></li>`,
    parts.length ? `<li><span>Fitted</span><span>${esc(parts.join(", "))}</span></li>` : "",
  ].join("");
  const btn = (act: string, label: string, pri = false) => `<button class="b3${pri ? " pri" : ""}" data-act="${act}">${label}</button>`;
  const acts = src.z === "gun" ? (def.bound && !home() ? "" : btn("primary", home() ? (def.bound ? "Put on the rack" : "Put in locker") : target ? "Leave it here" : "Sling it in your pack"))
    : src.z === "pack" ? (target ? btn("primary", "Leave it here", true) : btn("primary", "Put in a gun slot", true)) + btn("drop", "Drop")
    : src.z === "them" ? btn("primary", home() ? "Put in a gun slot" : "Take", true) + (home() ? "" : btn("wear", "Take into a gun slot")) : "";
  return `<div class="tag3" style="--rar:var(--rar-${def.tier})"><span class="hole"></span>${iconHtml(inst, 140).replace('class="ico"', 'class="ico big"')}
    <h3>${esc(def.name)}</h3><div class="rar">${esc(`${t.name} ${CLASS_LABEL[def.cls].toLowerCase()}${def.bound ? ", yours for good" : ""}`)}</div><p class="blurb">${esc(def.blurb)}</p>
    <ul class="does"><li>${esc(def.trait)}</li></ul><ul class="facts">${facts}</ul>${acts ? `<div class="acts">${acts}</div>` : ""}</div>`.replace('<span class="emo"', '<span class="emo bigemo"');
}
const keysHtml = () => home()
  ? `<span><kbd>Click</kbd>Read the tag</span><span><kbd>Double-click</kbd>Wear or store</span><span><kbd>Drag</kbd>Move</span><span><kbd>R</kbd>Sort</span><span><kbd>Esc</kbd>Close</span>`
  : `<span><kbd>Click</kbd>Read the tag</span><span><kbd>Double-click</kbd>${target ? "Take or put back" : "Wear or use"}</span><span><kbd>Drag</kbd>Move</span><span><kbd>Ctrl</kbd>Split rounds</span><span><kbd>R</kbd>Sort</span><span><kbd>${target ? "E" : "Tab"}</kbd>Close</span>`;

// ---------------------------------------------------------------- render (only on change)
function sigs() {
  const g = gear(), q = G.equipping;
  const left = [home() ? G.save.money : G.pack.join(","), Object.values(g ?? {}).join(","), JSON.stringify(G.save.guns), q ? q.slot : "", G.loaded.join(), JSON.stringify(home() ? G.save.ammo : G.reserve), G.slot, G.packSlots, home() ? G.save.reserved.length : carriedWeight().toFixed(1), sel ? key(sel) : ""].join("|");
  const them = target ? entries().map((e) => e.item + (e.revealed ? "+" : "?")).join(",") + "|" + (sel ? key(sel) : "") : "";
  return { left, them };
}
function render() {
  if (!root) return;
  const s = sigs(), focus = (document.activeElement as HTMLElement | null)?.dataset?.src;
  if (s.left !== sigLeft) { sigLeft = s.left; (root.querySelector(".lv-me") as HTMLElement).innerHTML = leftHtml(); }
  const them = root.querySelector(".lv-them") as HTMLElement;
  if (target && s.them !== sigThem) { sigThem = s.them; them.innerHTML = themHtml(); popped.clear(); }
  if (!target && lootHooks.side) { const side = lootHooks.side(); if (side !== sigThem) { sigThem = side; them.innerHTML = side; } } // the job log beside your pack (Tab)
  const disp = target || (lootHooks.side && G.scene === "raid") ? "" : "none"; if (them.style.display !== disp) them.style.display = disp;
  renderTag();
  if (focus) (root.querySelector(`[data-src="${focus}"]`) as HTMLElement | null)?.focus({ preventScroll: true });
}
let tagKey = "";
function renderTag() {
  if (!root) return;
  const src = sel ?? hover, inst = itemAt(src), en = src?.z === "them" ? entries()[src.i] : undefined;
  const k = (src ? key(src) : "") + (src && src === sel ? "!" : "") + "|" + (inst ?? "") + "|" + (target?.name ?? "") + "|" + G.mag + "/" + G.ammo + "|" + (en ? stackOf(en) : "") + "|" + (src?.z === "slot" || src?.z === "pack" ? (gear() ? Object.values(gear()).join() : "") : "") + "|" + JSON.stringify(G.save.guns) + G.loaded.join();
  if (k === tagKey) return; tagKey = k;
  (root.querySelector(".lv-tagwrap") as HTMLElement).innerHTML = tagHtml();
}

// ---------------------------------------------------------------- open / close
export function openLoot(t: LootTarget | null) {
  const fresh = !root;
  if (root && target && target !== t) target.onClose?.();
  target = t; sel = null; hover = null; sigLeft = sigThem = tagKey = "";
  if (!root) {
    root = document.createElement("div"); root.className = "lv opening"; root.setAttribute("role", "dialog"); root.setAttribute("aria-label", t ? t.name : "Your pack");
    root.innerHTML = `<div class="dim"></div><div class="ui-ref"><section class="plate lv-panel lv-me" aria-label="You"></section><div class="ui-ref-tag lv-tagwrap" style="position:absolute"></div>
      <section class="plate lv-panel lv-them" aria-label="Container"></section><p class="lv-msg" aria-live="polite"></p><div class="lv-keys">${keysHtml()}</div></div>`;
    (document.getElementById("ui") ?? document.body).appendChild(root);
    wire(root); addEventListener("keydown", onKey, true);
    setTimeout(() => root?.classList.remove("opening"), 450);
  } else (root.querySelector(".lv-keys") as HTMLElement).innerHTML = keysHtml();
  render();
  if (fresh) sfx("ui");
  const first = root.querySelector<HTMLElement>(t ? ".lv-them [data-src]" : ".lv-me .lv-grid [data-src]") ?? root.querySelector<HTMLElement>(".lv-me .lv-grid [data-src]"); first?.focus({ preventScroll: true });
}
export function closeLoot() {
  if (!root) return;
  const t = target; root.remove(); root = null; target = null; sel = hover = null; closedAt = performance.now(); popped.clear();
  removeEventListener("keydown", onKey, true); tipEl?.classList.remove("on"); ghostEnd();
  t?.onClose?.(); sfx("ui");
}
/** Tab: toggle the screen without a target (or close whatever is open) */
export function toggleInventory(open = !root) { if (open && !root) openLoot(null); else if (!open || root) closeLoot(); }

/** per frame while open (hud.update in the raid): search reveal, the ring, range, external changes */
export function updateLoot(dt: number) {
  if (!root) return;
  if (target?.near && !target.near()) { closeLoot(); return; }
  if (G.scene === "raid" && !G.alive) { closeLoot(); return; }
  const s = target?.search;
  if (s && s.elapsed < s.duration) {
    const fresh = advanceSearch(s, dt);
    if (fresh.length) {
      for (const f of fresh) { popped.add(f); const big = tierAtLeast(itemDef(f.item).rarity, "rare"); /* Executive (q4) and up: the find sting */ sfx(big ? "rare" : "crateTick", big ? 0.5 : 1); if (big) sting("stingRare"); }
    } else {
      const slots = s.slots, i = slots.findIndex((q) => !q.revealed && !q.taken);
      if (i >= 0) {
        const prev = i > 0 ? slots[i - 1].revealAt : 0, k = Math.min(1, Math.max(0, (s.elapsed - prev) / Math.max(1e-3, slots[i].revealAt - prev)));
        const fg = root.querySelector(".c3.scan .fg") as SVGCircleElement | null; if (fg) fg.setAttribute("stroke-dashoffset", (100 * (1 - k)).toFixed(1));
      }
    }
  }
  render();
  const q = G.equipping; if (q) { const b = root.querySelector(".e3.busy") as HTMLElement | null; b?.style.setProperty("--k", (q.t / q.time).toFixed(3)); }
  if (msgT > 0) { msgT -= dt; if (msgT <= 0) (root.querySelector(".lv-msg") as HTMLElement).style.opacity = "0"; }
}

// ---------------------------------------------------------------- input: pointer drag, double-click, keys, tooltips
let press: { src: Src; x: number; y: number; el: HTMLElement; ctrl: boolean } | null = null, ghost: HTMLDivElement | null = null;
function ghostEnd() { ghost?.remove(); ghost = null; root?.querySelectorAll(".drop-ok,.dragging").forEach((n) => n.classList.remove("drop-ok", "dragging")); }
function dropKeyAt(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y) as HTMLElement | null, hit = el?.closest("[data-src],[data-drop]") as HTMLElement | null;
  return hit ? hit.dataset.src ?? hit.dataset.drop ?? null : null;
}
function wire(r: HTMLDivElement) {
  r.addEventListener("pointerdown", (e) => {
    const el = (e.target as HTMLElement).closest("[data-src]") as HTMLElement | null;
    if (e.button !== 0) return;
    if (!el) { if (!(e.target as HTMLElement).closest(".tag3,.b3")) { sel = null; renderTag(); render(); } return; }
    press = { src: parse(el.dataset.src)!, x: e.clientX, y: e.clientY, el, ctrl: e.ctrlKey };
  });
  addEventListener("pointermove", onMove);
  addEventListener("pointerup", onUp);
  r.addEventListener("dblclick", (e) => { const el = (e.target as HTMLElement).closest("[data-src]") as HTMLElement | null; if (el) primary(parse(el.dataset.src)!); });
  r.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("[data-act]") as HTMLElement | null; if (!b) return;
    const a = b.dataset.act!, src = sel ?? hover;
    if (a === "sort") return sortMine();
    if (a === "takeall") return takeAllSearched();
    if (a[0] === "x") { target?.actions?.[+a.slice(1)]?.run(); return; }
    if (!src) return;
    if (a === "primary") primary(src);
    else if (a === "wear") { if (src.z === "pack") { if (isAttachment(G.pack[src.i])) fitFrom(src); else if (isGun(G.pack[src.i])) gunFrom(src); else wearFromPack(src.i); } else if (src.z === "them") takeFrom(src.i, { wear: true }); }
    else if (a === "half" && src.z === "them") takeFrom(src.i, { half: true });
    else if (a === "use" && src.z === "pack") useHeal(G.pack[src.i]);
    else if (a === "drop" && src.z === "pack") dropFromPack(src.i);
  });
  r.addEventListener("mouseover", (e) => {
    const t = e.target as HTMLElement, cell = t.closest("[data-src]") as HTMLElement | null;
    const nh = cell ? parse(cell.dataset.src) : null;
    if (nh && !same(nh, hover)) { hover = nh; if (!sel) renderTag(); } // leaving a cell keeps its tag, so you can reach the tag's buttons
    const tipT = t.closest("[data-tip]") as HTMLElement | null;
    showTip(tipT && !(cell && !sel && cell === tipT && !cell.classList.contains("e3")) ? tipT : null);
  });
  r.addEventListener("mouseleave", () => { hover = null; if (!sel) renderTag(); showTip(null); });
  r.addEventListener("keydown", (e) => {
    const el = (e.target as HTMLElement).closest?.("[data-src]") as HTMLElement | null; if (!el) return;
    const src = parse(el.dataset.src)!;
    if (e.key === "Enter") { e.preventDefault(); primary(src); }
    else if (e.key === " ") { e.preventDefault(); sel = same(sel, src) ? null : src; render(); }
    else if (e.key.startsWith("Arrow")) {
      e.preventDefault(); const all = [...r.querySelectorAll<HTMLElement>("[data-src]")], i = all.indexOf(el);
      const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : e.key === "ArrowDown" ? 5 : -5;
      all[Math.max(0, Math.min(all.length - 1, i + step))]?.focus();
    }
  });
}
function onMove(e: PointerEvent) {
  if (!press || !root) return;
  if (!ghost && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 5) {
    const inst = itemAt(press.src); if (!inst || press.src.z === "fixed" || (press.src.z === "gun" && isKingpin(inst) && !home() && false)) { press = null; return; }
    ghost = document.createElement("div"); ghost.className = "lv-ghost"; ghost.innerHTML = iconHtml(inst, 76) + (press.ctrl || e.ctrlKey ? `<span class="q">½</span>` : "");
    document.body.appendChild(ghost); press.el.classList.add("dragging");
    for (const n of root.querySelectorAll<HTMLElement>("[data-src],[data-drop]")) { const k = n.dataset.src ?? n.dataset.drop!; if (canDrop(press.src, k)) n.classList.add("drop-ok"); }
    showTip(null);
  }
  if (ghost) ghost.style.transform = `translate(${e.clientX}px,${e.clientY}px) rotate(-6deg)`;
}
function onUp(e: PointerEvent) {
  if (!press) return;
  const p = press; press = null;
  if (ghost) {
    const k = dropKeyAt(e.clientX, e.clientY); ghostEnd();
    if (k && canDrop(p.src, k)) drop(p.src, k === "themGrid" || k === "packGrid" ? { z: k } : parse(k)!, p.ctrl || e.ctrlKey);
    else if (k !== (p.el.dataset.src ?? null)) sfx("nope", 0.5);
    return;
  }
  if (e.button !== 0) return;
  if (p.ctrl && p.src.z === "them" && itemDef(itemAt(p.src) ?? "").kind === "ammo") { takeFrom(p.src.i, { half: true }); return; }
  sel = same(sel, p.src) ? sel : p.src; render();
}
function showTip(el: HTMLElement | null) {
  if (!el) { tipEl?.classList.remove("on"); return; }
  if (!tipEl) { tipEl = document.createElement("div"); tipEl.className = "tip3"; tipEl.setAttribute("role", "tooltip"); document.body.appendChild(tipEl); }
  tipEl.textContent = el.dataset.tip!; tipEl.classList.add("on");
  const r = el.getBoundingClientRect(), tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
  const x = Math.max(8, Math.min(innerWidth - tw - 8, r.left + r.width / 2 - tw / 2)), y = r.top - th - 8 < 8 ? r.bottom + 8 : r.top - th - 8;
  tipEl.style.left = x + "px"; tipEl.style.top = y + "px";
}
function onKey(e: KeyboardEvent) {
  if (!root) return;
  const k = e.key.toLowerCase();
  if (k === "escape" || (k === "e" && target) || (k === "tab" && home())) { e.preventDefault(); e.stopPropagation(); closeLoot(); return; }
  if (k === "r" && !e.repeat) { e.stopPropagation(); sortMine(); return; }
  if (k === "control") root.classList.add("ctrl");
}
/** debug / test hooks: what the screen shows, by panel */
/** for tests: `them` lists item types (instances carry "@id") */
export const lootDebug = () => ({ open: !!root, target: target?.name ?? null, them: entries().map((e) => (e.revealed ? itemType(e.item) : "?")), sel: sel ? key(sel) : null, guns: G.save.guns.map((g) => g && { inst: g.inst, atts: { ...g.atts } }) });
void parseInst;
