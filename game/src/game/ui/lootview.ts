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
import { HEALS, KINGPIN } from "../combat/weapons";
import { cancelReload } from "../combat/reload";
import { carriedWeight } from "../actors/player";
import { sfx } from "../core/audio";
import { save } from "../core/save";
import { carryLimit, condition, gearSummary, SLOT_NAME } from "./equipui";
import { iconHtml } from "./itemicon";
import { iconUrl } from "./icons";
import { itemCopy } from "./itemcopy";
import type { AttSlot, WearSlot } from "../contracts";
import { ATT_SLOTS, SLOT_LABEL, attachmentDef, isAttachment, statLines } from "../loot/attachments";
import { GUN, fit, unfit } from "../combat/gunstats";

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
export const lootHooks = { changed: () => {} };

type Src = { z: "pack"; i: number } | { z: "slot"; s: WearSlot } | { z: "fixed"; s: "gun" | "case" } | { z: "them"; i: number } | { z: "att"; s: AttSlot };
type Entry = { item: string; revealed: boolean; idx: number; slot?: SearchSlot };
const EQ_ORDER: (WearSlot | "gun" | "case")[] = ["gun", "case", "head", "body", "face", "ears", "back"];
/** gun attachment slots (G1.5 row 36): what each is for, shown on an empty slot */
const ATT_TIP: Record<AttSlot, string> = { sight: "Sights and scopes: aim zoom when you aim (right mouse).", muzzle: "Compensators cut recoil; a suppressor keeps your shots quiet.", mag: "Magazines: more rounds before you reload.", laser: "Lasers tighten your shots from the hip." };
const EQ_TIP: Record<WearSlot, string> = { head: "Hats and helmets. Head armor stops critical hits.", face: "Glasses and masks.", body: "Vests and jackets. Body armor cuts damage.", back: "Bags. More pack slots and carry weight.", ears: "Headphones. Hear footsteps through walls." };
const BRK = `<i class="brk tl"></i><i class="brk tr"></i><i class="brk bl"></i><i class="brk br"></i>`;
const counts = new WeakMap<SearchSlot, number>();
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
  if (target.search) return target.search.slots.map((slot, idx) => ({ item: slot.item, revealed: slot.revealed, idx, slot, taken: slot.taken })).filter((e) => !e.taken);
  return target.items.map((item, idx) => ({ item, revealed: true, idx }));
}
const stackOf = (e: Entry) => { const d = itemDef(e.item); return d.kind === "ammo" ? (e.slot ? counts.get(e.slot) ?? d.stack ?? 8 : d.stack ?? 8) : 0; };
function itemAt(src: Src | null): string | null {
  if (!src) return null;
  if (src.z === "pack") return (home() ? undefined : G.pack[src.i]) ?? null;
  if (src.z === "slot") return gear()[src.s] ?? null;
  if (src.z === "fixed") return src.s === "gun" ? "kingpin" : "briefcase";
  if (src.z === "att") return G.save.gun[src.s];
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
function changed() { lootHooks.changed(); render(); }
function removeEntry(e: Entry) {
  if (!target) return;
  if (e.slot && target.search) take(target.search, e.idx);
  const k = e.slot ? target.items.indexOf(e.item) : e.idx; if (k >= 0) target.items.splice(k, 1);
}
const packFull = () => G.pack.length >= G.packSlots;
/** take a revealed item from the target into the pack (or straight into the ammo pouch / onto the gun) */
function takeFrom(i: number, opts: { half?: boolean; wear?: boolean; quiet?: boolean } = {}): boolean {
  const e = entries()[i]; if (!e || !target) return false;
  if (!e.revealed) { if (!opts.quiet) say("Still searching that one", true); return false; }
  if (home()) { // the locker: taking a piece means wearing it (or fitting it)
    if (isAttachment(e.item)) return fitFrom({ z: "them", i });
    if (!equipFromLocker(e.idx)) { say("That can't be worn", true); return false; }
    G.rig?.setGear?.(G.save.gear); save(G.save); sfx("ui"); say(`Wearing the ${itemDef(e.item).name}`); sel = null; changed(); return true;
  }
  const d = itemDef(e.item);
  if (d.kind === "ammo") {
    const n = stackOf(e), k = opts.half && n > 1 ? Math.floor(n / 2) : n;
    G.ammo += k; if (e.slot && k < n) counts.set(e.slot, n - k); else removeEntry(e);
    sfx("pick"); say(`+${k} rounds for the Kingpin`); changed(); return true;
  }
  if (d.kind === "attachment" && opts.wear) return fitFrom({ z: "them", i }); // "Take and fit"; a plain take packs it (Duckov never fits from a container)
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
  if (!target || home()) return false;
  const inst = G.pack[i]; if (!inst) return false;
  if (G.equipping?.inst === inst) { say("You're putting that on", true); return false; }
  G.pack.splice(i, 1); target.items.push(inst);
  if (target.search) target.search.slots.push({ item: inst, revealAt: 0, revealed: true, taken: false });
  sfx("pick"); say(`Put the ${itemDef(inst).name} in the ${target.name.toLowerCase()}`); sel = null; changed(); return true;
}
export function useHeal(id: string): boolean {
  if (G.scene !== "raid" || !G.alive) return false;
  if (!HEALS[id] || !G.pack.includes(id)) { say("You don't have one", true); return false; }
  if (G.useItem) { say("You're already using something", true); return false; }
  if (G.equipping) { say("Finish changing gear first", true); return false; }
  if (G.hp >= G.maxHp) { say("You're already at full health", true); return false; }
  G.useItem = { id, t: 0, time: HEALS[id].time }; cancelReload(); sfx("ui"); say(`Using the ${itemDef(id).name}…`); changed(); return true;
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
function fitFrom(src: Src): boolean {
  const id = itemAt(src), a = attachmentDef(id); if (!id || !a) { say("That doesn't go on the Kingpin", true); return false; }
  if (src.z === "them") {
    const e = entries()[src.i]; if (!e || !e.revealed) { say("Still searching that one", true); return false; }
    removeEntry(e); const r = fit(id);
    if (r.ok && r.old) { if (home()) G.save.locker.push(r.old); else if (!packFull()) G.pack.push(r.old); else putBack(r.old); }
  } else if (src.z === "pack") {
    if (G.equipping?.inst === id) return false;
    G.pack.splice(src.i, 1); const r = fit(id);
    if (r.ok && r.old) G.pack.splice(src.i, 0, r.old); // swap in place
  } else return false;
  if (home()) save(G.save);
  sfx("rare", 0.6); say(`${a.name} fitted. ${statLines(id).map((l) => l.text).join(", ")}`); sel = { z: "att", s: a.slot }; changed(); return true;
}
/** put an item into the open container (raid) */
function putBack(inst: string) { if (!target) return; target.items.push(inst); if (target.search) target.search.slots.push({ item: inst, revealAt: 0, revealed: true, taken: false }); }
function unfitTo(slot: AttSlot, where: "pack" | "them"): boolean {
  const id = G.save.gun[slot]; if (!id) return false;
  if (home()) { unfit(slot); G.save.locker.push(id); save(G.save); say(`Put the ${attName(id)} in the locker`); }
  else if (where === "them" && target) { unfit(slot); putBack(id); say(`Left the ${attName(id)} in the ${target.name.toLowerCase()}`); }
  else { if (packFull()) { say("No room in your pack", true); return false; } unfit(slot); G.pack.push(id); say(`Took the ${attName(id)} off the Kingpin`); }
  sfx("ui"); sel = null; changed(); return true;
}
function dropFromPack(i: number) {
  const inst = G.pack[i]; if (!inst || home()) return;
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
  if (src.z === "fixed") return void say(src.s === "gun" ? "Your Kingpin never leaves your hand. Drag sights, muzzles, mags and lasers onto it." : "Your briefcase. Swing it with V.");
  if (src.z === "att") return void unfitTo(src.s, "pack");
  const inst = G.pack[src.i]; if (!inst) return;
  if (isAttachment(inst)) return void fitFrom(src);
  if (target) return void putInto(src.i);
  if (isEquip(inst)) return void wearFromPack(src.i);
  if (HEALS[inst]) return void useHeal(inst);
  const cp = itemCopy(inst); say(`${cp.name}: ${cp.does[0] ?? cp.use}`);
}
function drop(src: Src, dst: Src | { z: "themGrid" } | { z: "packGrid" }, ctrl: boolean) {
  if (dst.z === "att" || (dst.z === "fixed" && dst.s === "gun")) return void fitFrom(src);
  if (src.z === "att") return void unfitTo(src.s, dst.z === "them" || dst.z === "themGrid" ? "them" : "pack");
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
  if (dst.z === "att") { const a = attachmentDef(itemAt(src)); return !!a && a.slot === dst.s && src.z !== "att"; }
  if (dst.z === "fixed") return dst.s === "gun" && !!attachmentDef(itemAt(src)) && src.z !== "att";
  if (src.z === "att") return (dst.z === "pack" || dst.z === "packGrid") ? !home() : (dst.z === "them" || dst.z === "themGrid") && !!target;
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
function eqHtml(s: WearSlot | "gun" | "case") {
  const k = (s === "gun" || s === "case" ? "fixed:" : "slot:") + s, isSel = sel && key(sel) === k ? " sel" : "";
  if (s === "gun") return `<button class="e3${isSel}" style="--rar:var(--rar-common)" data-src="${k}" data-tip="Your Kingpin .45. Loaded / reserve rounds. Drop attachments on it.">${ATT_SLOTS.some((q) => G.save.gun[q]) ? `<span class="pips">${ATT_SLOTS.map((q) => `<i class="${G.save.gun[q] ? "on" : ""}"></i>`).join("")}</span>` : ""}<img src="${iconUrl("kingpin")}" alt="Kingpin" draggable="false">${home() ? "" : `<span class="q">${G.mag}/${G.ammo}</span>`}<span class="lab">Gun</span></button>`;
  if (s === "case") return `<button class="e3${isSel}" style="--rar:var(--rar-common)" data-src="${k}" data-tip="Your briefcase: the V swing"><span class="emo">💼</span><span class="lab">Briefcase</span></button>`;
  const inst = gear()[s], d = equipDef(inst), busy = G.equipping?.slot === s;
  const c = inst ? condition(inst) : null, dur = c === null ? "" : `<span class="dur ${c <= 0 ? "broken" : c < 0.35 ? "low" : ""}"><i style="width:${Math.max(4, c * 100)}%"></i></span>`;
  return `<button class="e3${inst ? "" : " empty"}${isSel}${busy ? " busy" : ""}" style="--rar:${d ? `var(--rar-${d.rarity})` : "transparent"}" data-src="${k}" data-tip="${esc(SLOT_NAME[s] + ": " + (inst ? itemDef(inst).name : EQ_TIP[s]))}">${inst ? iconHtml(inst, 50) : ""}${d?.bound ? `<span class="lock" aria-label="yours for good">★</span>` : ""}${dur}<span class="lab">${SLOT_NAME[s]}</span></button>`;
}
/** one gun attachment slot (G1.5 row 36): drop an attachment here, double-click or drag it off to remove */
function attHtml(slot: AttSlot) {
  const k = "att:" + slot, id = G.save.gun[slot], a = attachmentDef(id), isSel = sel && key(sel) === k ? " sel" : "";
  return `<button class="e3 a3${id ? "" : " empty"}${isSel}" style="--rar:${a ? `var(--rar-${a.rarity})` : "transparent"}" data-src="${k}" data-tip="${esc(SLOT_LABEL[slot] + ": " + (a ? a.name : ATT_TIP[slot]))}">${id ? iconHtml(id, 40) : ""}<span class="lab">${SLOT_LABEL[slot]}</span></button>`;
}
const zoomText = () => `×${GUN.adsDist.toFixed(2).replace(/0$/, "")}`;
function weightHtml() {
  const w = carriedWeight(), lim = carryLimit(), r = w / lim;
  const band = r > 1 ? "over" : r > 0.75 ? "heavy" : r <= 0.25 ? "light" : "normal";
  const word = { light: "light, a little faster", normal: "normal", heavy: "heavy, slower and louder", over: "overloaded, you crawl" }[band];
  return `<div class="lv-weight ${band}" data-tip="Carry weight. Past 75% you slow down; past 100% you crawl."><div class="row"><span>Load</span><span><span class="num">${w.toFixed(1)} of ${lim} kg</span>, <span class="state">${word}</span></span></div>
    <div class="track"><i style="width:${Math.min(100, r * 100).toFixed(1)}%"></i><b style="left:25%"></b><b style="left:75%"></b></div></div>`;
}
function leftHtml() {
  const g = gearSummary(gear());
  let body = `<div class="lv-sect">Wearing <span class="note num">armor ${g.body} body, ${g.head} head</span></div><div class="lv-eq">${EQ_ORDER.map(eqHtml).join("")}</div>
    <div class="lv-sect">Kingpin slots <span class="note num" data-tip="Magazine size and aim zoom with what's fitted">${GUN.mag} rounds, aim zoom ${zoomText()}</span></div><div class="lv-eq lv-att">${ATT_SLOTS.map(attHtml).join("")}</div>`;
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
  if (src.z === "att" && !inst) return `<div class="tag3 blank"><span class="hole"></span><p class="lead">${SLOT_LABEL[src.s]} slot</p><p class="blurb">${ATT_TIP[src.s]}</p><ol><li><kbd>Drag</kbd>An attachment onto this slot or onto the gun</li><li><kbd>Double-click</kbd>An attachment in your pack to fit it</li></ol></div>`;
  if (src.z === "fixed") {
    const gun = src.s === "gun";
    return `<div class="tag3" style="--rar:var(--rar-common)"><span class="hole"></span>${gun ? `<img class="big" src="${iconUrl("kingpin")}" alt="">` : `<div class="bigemo">💼</div>`}
      <h3>${gun ? "Kingpin .45" : "Briefcase"}</h3><div class="rar">Yours for good</div><p class="blurb">${itemCopy(gun ? "kingpin" : "briefcase").blurb}</p>
      <ul class="facts">${gun ? `<li><span>Loaded</span><span class="num">${G.mag} of ${G.magSize}</span></li><li><span data-tip="Rounds you carry for reloads">Reserve</span><span class="num">${G.ammo} rounds</span></li><li><span>Damage</span><span class="num">${KINGPIN.damage} a shot</span></li><li><span data-tip="How far the view leans toward your aim when you aim (right mouse). Sights raise it.">Aim zoom</span><span class="num">${zoomText()}</span></li>${ATT_SLOTS.filter((q) => G.save.gun[q]).map((q) => `<li><span>${SLOT_LABEL[q]}</span><span>${esc(attName(G.save.gun[q]!))}</span></li>`).join("")}`
        : `<li><span>Swing</span><span>V</span></li><li><span>Best when</span><span>you're out of rounds</span></li>`}</ul></div>`;
  }
  const d = itemDef(inst), cp = itemCopy(inst), e = equipDef(inst), c = e ? condition(inst) : null;
  const worn = e && src.z !== "slot" ? gear()[e.slot] : null;
  const facts: string[] = [];
  const att = attachmentDef(inst);
  if (d.kind !== "ammo" && d.kind !== "key") facts.push(`<li><span data-tip="What the Fence pays for it at home">Worth</span><span class="num">${e?.bound ? "Not for sale" : `🍌 ${d.value}`}</span></li>`);
  if (d.kind === "ammo" && src.z === "them") { const en = entries()[src.i]; facts.push(`<li><span>In this stack</span><span class="num">${en ? stackOf(en) : d.stack} rounds</span></li>`); }
  facts.push(`<li><span data-tip="Past 75% of your carry limit you slow down">Weight</span><span class="num">${(d.weight ?? 0).toFixed(1)} kg</span></li>`);
  if (e) facts.push(`<li><span>Slot</span><span>${SLOT_NAME[e.slot]}</span></li>`);
  if (att) { facts.push(`<li><span>Fits</span><span>Kingpin ${SLOT_LABEL[att.slot].toLowerCase()}</span></li>`); const on = G.save.gun[att.slot]; if (on && src.z !== "att") facts.push(`<li><span>On your Kingpin</span><span>${esc(attName(on))}</span></li>`); }
  if (c !== null) facts.push(`<li><span data-tip="Armor wears down as it takes hits. Repair it at the workbench.">Condition</span><span class="num"><span class="cond"><i style="width:${Math.max(3, c * 100)}%;${c < 0.35 ? "background:var(--a-warn)" : ""}"></i></span>${Math.round(c * 100)}%</span></li>`);
  if (worn && worn !== inst) facts.push(`<li><span>You're wearing</span><span>${esc(itemDef(worn).name)}</span></li>`);
  if (src.z === "pack" && src.i < G.pouchSlots) facts.push(`<li><span data-tip="The first slots of your pack. Kept even if you get bonked.">Cheek pouch</span><span>Safe if bonked</span></li>`);
  if (G.lootCtx?.orderNeeds?.includes(inst.split("#")[0])) facts.push(`<li><span>Order</span><span>Smuggler Sal wants this</span></li>`);
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
    if (HEALS[inst]) acts.push(btn("use", "Use it", !target, "Or press its quick key, or Q"));
    if (target) acts.push(btn("primary", "Leave it here", true, `Puts it in the ${esc(target.name.toLowerCase())}. Double-click does the same.`));
    acts.push(btn("drop", "Drop"));
  } else if (src.z === "slot") {
    if (!(e?.bound && !home())) acts.push(btn("primary", home() ? "Put in locker" : "Take it off", false, "Double-click does the same"));
  }
  const how = src.z === "att" ? "Double-click it, or drag it off the slot, to take it off." : src.z === "them" && !home() ? (att ? "Drag it onto the Kingpin to fit it, or into your pack." : "Double-click to take it, or drag it into your pack.") : cp.use ? cp.use + "." : "";
  return `<div class="tag3" style="--rar:var(--rar-${d.rarity})"><span class="hole"></span>${iconHtml(inst, 200).replace('class="ico"', 'class="ico big"')}
    <h3>${esc(d.name)}</h3><div class="rar">${esc(cp.rarityLine)}</div>${cp.blurb ? `<p class="blurb">${esc(cp.blurb)}</p>` : ""}
    ${cp.lines?.length ? `<ul class="does stats">${cp.lines.map((l) => `<li class="${l.good ? "up" : "down"}">${esc(l.text)}</li>`).join("")}</ul>` : cp.does.length ? `<ul class="does">${cp.does.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}<ul class="facts">${facts.join("")}</ul>
    ${acts.length ? `<div class="acts">${acts.join("")}</div>` : ""}${how ? `<p class="how">${esc(how)}</p>` : ""}</div>`.replace('<span class="emo"', '<span class="emo bigemo"');
}
const keysHtml = () => home()
  ? `<span><kbd>Click</kbd>Read the tag</span><span><kbd>Double-click</kbd>Wear or store</span><span><kbd>Drag</kbd>Move</span><span><kbd>R</kbd>Sort</span><span><kbd>Esc</kbd>Close</span>`
  : `<span><kbd>Click</kbd>Read the tag</span><span><kbd>Double-click</kbd>${target ? "Take or put back" : "Wear or use"}</span><span><kbd>Drag</kbd>Move</span><span><kbd>Ctrl</kbd>Split rounds</span><span><kbd>R</kbd>Sort</span><span><kbd>${target ? "E" : "Tab"}</kbd>Close</span>`;

// ---------------------------------------------------------------- render (only on change)
function sigs() {
  const g = gear(), q = G.equipping;
  const left = [home() ? G.save.money : G.pack.join(","), Object.values(g ?? {}).join(","), Object.values(G.save.gun).join(","), q ? q.slot : "", G.mag, G.ammo, G.packSlots, home() ? G.save.reserved.length : carriedWeight().toFixed(1), sel ? key(sel) : ""].join("|");
  const them = target ? entries().map((e) => e.item + (e.revealed ? "+" : "?") + (e.slot ? counts.get(e.slot) ?? "" : "")).join(",") + "|" + (sel ? key(sel) : "") : "";
  return { left, them };
}
function render() {
  if (!root) return;
  const s = sigs(), focus = (document.activeElement as HTMLElement | null)?.dataset?.src;
  if (s.left !== sigLeft) { sigLeft = s.left; (root.querySelector(".lv-me") as HTMLElement).innerHTML = leftHtml(); }
  const them = root.querySelector(".lv-them") as HTMLElement;
  if (s.them !== sigThem) { sigThem = s.them; them.innerHTML = themHtml(); popped.clear(); }
  const disp = target ? "" : "none"; if (them.style.display !== disp) them.style.display = disp;
  renderTag();
  if (focus) (root.querySelector(`[data-src="${focus}"]`) as HTMLElement | null)?.focus({ preventScroll: true });
}
let tagKey = "";
function renderTag() {
  if (!root) return;
  const src = sel ?? hover, inst = itemAt(src), en = src?.z === "them" ? entries()[src.i] : undefined;
  const k = (src ? key(src) : "") + "|" + (inst ?? "") + "|" + (target?.name ?? "") + "|" + G.mag + "/" + G.ammo + "|" + (en ? stackOf(en) : "") + "|" + (src?.z === "slot" || src?.z === "pack" ? (gear() ? Object.values(gear()).join() : "") : "") + "|" + Object.values(G.save.gun).join();
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
      for (const f of fresh) { popped.add(f); const r = itemDef(f.item).rarity; sfx(r === "rare" || r === "epic" ? "rare" : "crateTick", r === "rare" || r === "epic" ? 0.5 : 1); }
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
    else if (a === "wear") { if (src.z === "pack") { if (isAttachment(G.pack[src.i])) fitFrom(src); else wearFromPack(src.i); } else if (src.z === "them") takeFrom(src.i, { wear: true }); }
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
    const inst = itemAt(press.src); if (!inst || press.src.z === "fixed") { press = null; return; }
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
export const lootDebug = () => ({ open: !!root, target: target?.name ?? null, them: entries().map((e) => (e.revealed ? e.item : "?")), sel: sel ? key(sel) : null, gun: { ...G.save.gun } });
void parseInst;
