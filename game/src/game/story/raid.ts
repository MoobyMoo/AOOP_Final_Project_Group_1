// The story in a raid (G1.5 row 40): job events, the lore notes and job items in their containers, the Grove Keeper's
// camp in the mangrove, the Keepers' root cellar once you know the secret, the Radio Operator on the radio, and the
// tracker line on the HUD. core/raid.ts calls storyRaidStart() after the crates are set up and storyStep() every sim
// step; loot/raidloot.ts asks storyForced() and storyExtras() when it fills containers; ui/lootview.ts calls back
// through lootHooks when a note is read and for the job log beside your pack.
//
// Events credit jobs (core/quests.ts questEvent): entering an area (visit), a knocked-out enemy (by its id, once per
// raid; the foreman counts as the boss), a note read in the loot or Tab screen. Extraction is credited at home from
// the settlement record (main.ts storyRaidEnd), so a reload can never credit it twice.
import * as THREE from "three";
import { G, flat, type Crate } from "../core/state";
import { hud } from "../ui/hud";
import { lootHooks } from "../ui/lootview";
import { commitSave } from "../core/save";
import { sfx } from "../core/audio";
import { checkpointInventory, noteFeat } from "../core/raid-journal";
import { debit } from "../core/wallet";
import { accept, homeItems, qs, questEvent, questOf, questStatus, radioIn, track, trackedQuest, unlocked, wantedItems, wantsNote, type QuestNotice } from "../core/quests";
import { payQuest } from "../core/settlement";
import { STORY_SOCKETS, inDemo } from "../world/map/grove";
import { CLEARINGS } from "../world/layout";
import { isNote } from "../loot/storyitems";
import { itemType, own } from "../loot/instances";
import { itemDef, mulberry32 } from "../loot/tables";
import { placeItem, giveItem, sortPack } from "../loot/raidloot";
import { createSearch } from "../loot/search";
import { block } from "../world/grid";
import { groundHeight } from "../world/terrain";
import { isBoss } from "../ai/boss";
import { supplyDropIn, supplyDropArea } from "../world/interact";
import { floatText, burst } from "../../fx";
import { npcRig, NPCS, CHATTER } from "./npcs";
import { keeperCampModel, cellarModel } from "./props";
import { dialogueHtml, esc, noteTagHtml, questLogHtml, trackerHtml } from "./dialogue";

const BRK = `<i class="brk tl"></i><i class="brk tr"></i><i class="brk bl"></i><i class="brk br"></i>`;
let dest = "beach", lastArea = "", trackT = 0, dirty = false, radioT = -1, warned = false;
const koSeen = new Set<number>(), spawned = new Set<string>();
let keeper: { rig: ReturnType<typeof npcRig>; camp: THREE.Object3D; x: number; z: number; yaw: number } | null = null;
let cellar: THREE.Object3D | null = null;
let panel: HTMLDivElement | null = null;
/** the Keeper's trades this raid (bananas from your wallet; what you buy goes into your pack) */
const TRADES = [
  { item: "bandage", price: 10, n: 3, name: "Leaf wraps", small: "Bandages, wrapped by Keeper hands. Heals a little, fast" },
  { item: "smoothie", price: 30, n: 2, name: "Seed-pod tonic", small: "Thick and sweet. Heals a lot, slowly" },
  { item: "keeper_carving", price: 90, n: 1, name: "Keeper seed carving", small: "A tiny carved lantern. Epic: it goes on your trophy wall" },
];
let stock: Record<string, number> = {};

/** where this raid was deployed to (main.ts, from the departure request) */
export const setRaidDestination = (id: string) => { dest = id; };
export const raidDestination = () => dest;
export const storyPanelOpen = () => !!panel;

// ---------------------------------------------------------------- what turns up where
const ownedAnywhere = (type: string) => [...homeItems(G.save), ...(G.save.satchel?.items ?? []), ...G.pack].some((inst) => itemType(inst) === type);
/** a job item turns up while its job is on and you don't already have one; a note until you've read it */
function wanted(type: string) {
  if (isNote(type)) return !qs(G.save).notes.includes(type) && !ownedAnywhere(type);
  return wantedItems(G.save).includes(type) && !ownedAnywhere(type);
}
/** containers a job needs present this raid (loot/sockets.ts selectContainers) */
export function storyForced(): Set<string> {
  const out = new Set<string>();
  for (const s of STORY_SOCKETS.items) if (s.container && wanted(s.item) && (!isNote(s.item) || wantsNote(G.save, s.item))) out.add(s.container);
  return out;
}
/** the story items hidden in a container (once per raid each) */
export function storyExtras(socket: string): string[] {
  const out: string[] = [];
  for (const s of STORY_SOCKETS.items) if (s.container === socket && !spawned.has(s.item) && wanted(s.item)) { spawned.add(s.item); out.push(own(s.item)); }
  return out;
}

// ---------------------------------------------------------------- raid start
export function storyRaidStart() {
  koSeen.clear(); spawned.clear(); lastArea = ""; trackT = 0; dirty = false; warned = false; closePanel();
  stock = Object.fromEntries(TRADES.map((t) => [t.item, t.n]));
  for (const e of G.enemies) if (e.down) koSeen.add(e.id);
  // loose notes
  for (const s of STORY_SOCKETS.items) if (s.x !== undefined && s.z !== undefined && inDemo(s.x, s.z) && wanted(s.item)) { spawned.add(s.item); placeItem(own(s.item), s.x, s.z); }
  // the Grove Keeper's camp
  keeper?.camp.removeFromParent(); keeper?.rig.root.removeFromParent(); keeper = null;
  const k = STORY_SOCKETS.keeperCamp;
  if (inDemo(k.x, k.z)) {
    const camp = keeperCampModel(), gy = groundHeight(k.x, k.z); camp.position.set(k.x, gy, k.z); camp.rotation.y = k.yaw; camp.userData.perRaid = true; G.stage.scene.add(camp);
    const rig = npcRig("keeper"); rig.root.position.set(k.x, gy, k.z); rig.root.rotation.y = k.yaw; rig.root.userData.perRaid = true; G.stage.scene.add(rig.root);
    block(k.x, k.z, 0.5, true); // the Keeper stands their ground: you walk round, not through
    keeper = { rig, camp, x: k.x, z: k.z, yaw: k.yaw };
  }
  // the root cellar (the Keeper's secret): a cache under the great mangrove, refilled each raid
  cellar?.removeFromParent(); cellar = null;
  const c = STORY_SOCKETS.rootCellar;
  if (unlocked(G.save, "secret:root-cellar") && inDemo(c.x, c.z)) {
    const rng = mulberry32((G.seed ^ 0xce11a5) >>> 0), items: string[] = [];
    if (rng() < 0.4) items.push("golden_banana"); if (rng() < 0.6) items.push("sunset_mango"); items.push(rng() < 0.5 ? "honey_pot" : "brass_compass"); if (rng() < 0.15) items.push("keeper_carving");
    const obj = cellarModel(); obj.position.set(c.x, groundHeight(c.x, c.z), c.z); obj.rotation.y = c.yaw; obj.userData.perRaid = true; G.stage.scene.add(obj); cellar = obj;
    const owned = items.map(own), crate: Crate = { id: 88000 + G.save.raids, x: c.x, z: c.z, tier: "gold", fixed: "story", obj, opened: false, search: 0, items: owned, kind: "crate", label: "The Keepers' root cellar", note: "Under the great mangrove", r: 0.7 };
    crate.session = createSearch(owned, { openSeconds: 1.2 }); G.crates.push(crate);
  }
  // loot weighting: what your jobs want (the same order-needs nudge Sal's old order used)
  for (const id of wantedItems(G.save)) if (!G.lootCtx.orderNeeds.includes(id)) G.lootCtx.orderNeeds.push(id);
  // the Radio Operator: a hint for the tracked job a few seconds in
  radioT = radioIn(G.save) && !G.bot ? 3.5 : -1;
  buildTracker();
}

// ---------------------------------------------------------------- per sim step
export function storyStep(dt: number) {
  if (!G.alive) { closePanel(); return; }
  // visits
  if (G.area && G.area !== lastArea) { lastArea = G.area; notify(questEvent(G.save, { t: "visit", area: G.area })); }
  // knockouts (fauna don't count: no job asks for them)
  for (const e of G.enemies) if (e.down && !koSeen.has(e.id)) { koSeen.add(e.id); if (!e.fauna) { if (isBoss(e)) noteFeat("ko:boss"); notify(questEvent(G.save, { t: "ko", kind: e.kind, boss: isBoss(e) })); } }
  // the Keeper
  if (keeper) {
    const d = flat(G.pp, keeper);
    if (panel && d > 3.4) closePanel();
    else if (!panel && d < 2.1 && !G.zipping) { hud.prompt("E · Talk to the Grove Keeper"); if (G.intent.interact) openKeeper(); }
  }
  // the Radio Operator
  if (radioT > 0 && (radioT -= dt) <= 0) { const q = trackedQuest(G.save); hud.toast(`📻 <b>Dial:</b> ${esc(q?.hint ?? CHATTER[G.save.raids % CHATTER.length])}`); sfx("notice"); }
  const drop = supplyDropIn();
  if (radioIn(G.save) && !warned && drop !== null && drop < 18 && drop > 0) { warned = true; const area = CLEARINGS.find((c) => c.id === supplyDropArea())?.name ?? "the island"; hud.toast(`📻 <b>Dial:</b> Bandit balloon's losing height over ${esc(area)}. Watch for red smoke.`); sfx("notice"); }
  if (dirty) { dirty = false; try { G.save = commitSave(G.save); } catch (e) { console.warn("story save", e); } }
  if ((trackT -= dt) <= 0) { trackT = 0.25; updateTracker(); }
}
function notify(list: QuestNotice[]) {
  if (!list.length) return;
  dirty = true;
  for (const n of list) {
    if (n.ready) { const q = questOf(n.quest)!; hud.banner(`Job ready: ${n.title}`, q.turnIn === "raid" ? `Hand it over at the camp` : `Get home and see ${NPCS[q.giver].name}`); sfx("rare"); }
    else hud.toast(`◆ <b>${esc(n.title)}</b> · ${esc(n.text)}${n.need > 1 ? ` <b class="num">${n.have}/${n.need}</b>` : " ✔"}`);
  }
  trackT = 0;
}
/** a note was clicked in the loot or Tab screen (lootHooks.read) */
export function readNote(inst: string) {
  const type = itemType(inst), first = !qs(G.save).notes.includes(type);
  const list = questEvent(G.save, { t: "note", note: type });
  if (first) { dirty = true; sfx("ui"); if (!list.length && G.scene === "raid") hud.toast(`📜 Note read: <b>${esc(itemDef(type).name)}</b>. Kept in your job log.`); }
  notify(list);
  if (G.scene !== "raid" && dirty) { dirty = false; try { G.save = commitSave(G.save); } catch {} }
}
lootHooks.read = readNote;
lootHooks.note = noteTagHtml;
lootHooks.side = () => G.scene === "raid" ? `${BRK}<header class="lv-head"><h2>Jobs</h2><small>${qs(G.save).active.length} on</small></header><div class="tie"></div><div class="lv-body q3-side">${questLogHtml(G.save, { pack: G.pack })}</div>` : "";

// ---------------------------------------------------------------- the tracker line (HUD, under the minimap)
function buildTracker() {
  const layer = document.querySelector("#ui .ui-ref.h3"); if (!layer) return;
  layer.querySelector(".q3-track")?.remove();
  const el = document.createElement("div"); el.className = "q3-track raid shade"; layer.appendChild(el); updateTracker();
}
function updateTracker() {
  const el = document.querySelector<HTMLElement>("#ui .q3-track.raid"); if (!el) return;
  const html = trackerHtml(G.save, { pack: G.pack });
  if (el.innerHTML !== html) el.innerHTML = html; el.style.display = html ? "" : "none";
}

// ---------------------------------------------------------------- the Keeper's panel (raid: the world keeps moving)
function keeperExtra() {
  return `<h4>Trades <span class="q3-dim">🍌 ${G.save.money} in your wallet</span></h4><div class="rows">${TRADES.map((t) => {
    const left = stock[t.item] ?? 0;
    return `<div class="row"><b>${esc(t.name)}</b><small>${esc(t.small)}${left ? ` · ${left} left` : " · gone for now"}</small><button class="act" data-a="trade:${t.item}" ${left && G.save.money >= t.price ? "" : "disabled"}>🍌 ${t.price}</button></div>`;
  }).join("")}</div>`;
}
function openKeeper(lines?: string[]) {
  closePanel(false);
  panel = document.createElement("div"); panel.className = "panel npc raid";
  const html = dialogueHtml("keeper", G.save, { lines, items: G.pack, pack: G.pack, extra: keeperExtra() });
  panel.innerHTML = BRK + html.replace("</header>", `</header><div class="tie"></div>`) + `<div class="foot"><kbd>E</kbd> or <kbd>Esc</kbd> to close</div>`;
  panel.style.pointerEvents = "auto";
  document.getElementById("ui")!.appendChild(panel);
  panel.querySelectorAll<HTMLButtonElement>("button[data-a]").forEach((b) => (b.onclick = () => keeperAct(b.dataset.a!)));
  if (!lines) sfx("ui");
}
function closePanel(sound = true) { if (!panel) return; panel.remove(); panel = null; if (sound) sfx("ui"); }
function keeperAct(a: string) {
  const [k, verb, id] = a.split(":");
  if (k === "trade") {
    const t = TRADES.find((q) => q.item === verb); if (!t || !(stock[t.item] > 0) || G.save.money < t.price) { sfx("nope"); return; }
    if (!giveItem(own(t.item))) { sfx("nope"); hud.toast("Your pack is full"); return; }
    if (!debit(G.save, "trade", t.price, { note: t.item })) { sfx("nope"); return; } stock[t.item]--; checkpointInventory(true); G.save = commitSave(G.save);
    sfx("cash"); floatText(`−🍌 ${t.price}`, G.pp.clone().setY(2.6), "#fff3c4", 22); openKeeper(["A fair trade. The island approves."]); return;
  }
  if (k !== "q") return;
  if (verb === "accept") { if (accept(G.save, id)) { dirty = true; sfx("buy"); hud.toast(`◆ Job taken: <b>${esc(questOf(id)!.title)}</b>`); } openKeeper(); return; }
  if (verb === "track") { track(G.save, id); dirty = true; openKeeper(); return; }
  if (verb === "turnin") {
    let paid: ReturnType<typeof payQuest> = null;
    try { paid = payQuest(G.save, id, { pack: G.pack, slots: G.packSlots }); } catch (e) { console.error("job payout refused", e); }
    if (!paid || !paid.pack) { sfx("nope"); openKeeper(); return; }
    G.save = commitSave(paid.save); G.pack.length = 0; G.pack.push(...paid.pack); sortPack();
    for (const inst of paid.drop) placeItem(inst, G.pp.x + 0.8, G.pp.z + 0.8);
    checkpointInventory(true); hud.pack();
    sfx("rare"); burst(new THREE.Vector3(keeper!.x, groundHeight(keeper!.x, keeper!.z) + 1.6, keeper!.z), 24, "#9dffb0", 1);
    if (cellarHint()) hud.banner("A secret: the Keepers' root cellar", "Under the great mangrove at the east edge. It fills again each raid");
    openKeeper(questOf(id)!.done); return;
  }
}
const cellarHint = () => unlocked(G.save, "secret:root-cellar");
// E or Esc closes the Keeper's panel (capture: the settings plate must not open on the same Esc)
addEventListener("keydown", (e) => {
  if (!panel || e.repeat || (e.key !== "Escape" && e.key.toLowerCase() !== "e")) return;
  e.preventDefault(); e.stopImmediatePropagation(); closePanel();
}, true);
document.addEventListener("click", (e) => { // the job log's Track buttons in the Tab screen
  const b = (e.target as HTMLElement | null)?.closest?.(".lv [data-a^='q:track:']") as HTMLElement | null; if (!b) return;
  track(G.save, b.dataset.a!.split(":")[2]); dirty = true; trackT = 0; sfx("ui");
});
/** the raid ended: credit an extraction to the jobs that want one (main.ts, with the settlement record) */
export function storyRaidEnd(record: { id: string; reason: string }) {
  closePanel(false); keeper = null;
  if (["bonked", "quit", "reload"].includes(record.reason)) return [];
  const list = questEvent(G.save, { t: "extract", dest, raid: record.id });
  if (list.length) try { G.save = commitSave(G.save); } catch {}
  return list;
}
void questStatus;
