// Raid loot in the world: crates, typed containers and knocked-out bodies you search with E, and items lying on the
// ground as their own models that you pick up with E (G1.5 rows 04+, 18, 27).
//  - Search (POLISH_FINDINGS 1; Sol's loot/search.ts): a container opens after its own delay, then reveals one item at a
//    time (1 s, 1.5 s rare, 2 s epic, times the gear's search factor). Walking away pauses it; coming back resumes the same
//    session. Bodies hold what the enemy wore and carried (loot/bodies.ts), searched the same way.
//  - E opens the shared looting screen (ui/lootview.ts openLoot, UI v3) on the lootable's session: it reveals one item at
//    a time only while it is open and keeps the items list and the session in step. The bot can't use a screen: with
//    G.bot set the world runs the same session itself and tosses each revealed item onto the ground for it to pick up.
//  - Ground items (loot/ground.ts): Duckov's toss when something is dropped, at rest when it is placed, E to pick up the
//    selected one (the nearest within reach, drawn with a warm rim). A full pack never deletes loot: the find stays on
//    the ground and E swaps it for your cheapest loose item (rule 20).
import * as THREE from "three";
import { G, V, flat, type Crate, type Pickup, type Enemy } from "../core/state";
import { itemDef, rollCrate, isUseful, type LootContext } from "./tables";
import { bodySearch } from './bodies';
import { CONTAINERS, rollContainer, demoContainerType, type ContainerType } from './containers';
import { createSearch, advanceSearch, take, type SearchSession } from './search';
import { lootPriority } from './bot-priority';
export { bodyContents, bodySearch } from './bodies';
export { advanceSearch, take, takeAll } from './search';
import { equipDef, gearStats, isEquip } from "./equipment";
import { collectEquipment, equipFromPack } from "./equipment-actions";
import { PLACED, START, UNDER_X } from "../world/layout";
import { inDemo } from "../world/map/grove";
import { selectSockets, selectContainers } from "./sockets";
import { groundHeight } from "../world/terrain";
import { block, walkable, los } from "../world/grid";
import { crate as crateKit, container as containerKit, satchel as satchelKit, CRATE_LID_OPEN } from "../world/kit_build";
import * as K from "../world/kit_build";
import { mergePieces } from "../world/kitutil";
import { sfx } from "../core/audio";
import { floatText, popIn } from "../../fx";
import { hud } from "../ui/hud";
import { KINGPIN } from "../combat/weapons";
import { CALIBERS, isCaliber, type Caliber } from "../combat/guns";
import { equipFound, freeGunSlot } from "../combat/arsenal";
import { TIERS, tierAtLeast } from "./tiers";
import { makeNoise } from "../combat/combat";
import { takeModel, releaseModel, throwVelocity, stepThrow, poseModel, PICK_REACH, hullResolution } from "./ground";
import { openLoot, closeLoot, lootOpen, type LootTarget } from "../ui/hud";
import { lootTarget } from "../ui/lootview";
import { own, itemType, withCount, stackCount } from "./instances";
import { pickupSucceeded, pickupBlocked } from "../ui/pickupfeed";
import { fitsInPack, packStacks } from "./pack";
import { consumeInstance } from "../core/raid-journal";
import { storyExtras, storyForced } from "../story/raid";

export const containerType = (crate: Crate) => crate.type;
/** tier colours (loot/tiers.ts): the float text, item icons' rims, ground beams */
export const RAR_COLOR: Record<string, string> = Object.fromEntries(Object.values(TIERS).map(t => [t.key, t.color]));
/** a generic crate's opening delay by tier (the old whole-crate search times, now just the lid) */
const OPEN: Record<string, number> = { wood: 0.5, green: 0.9, gold: 1.4 };
/** type colours for the readability mark (kit_build container(): slate-blue weapon, straw food, olive ammo, teal parts, coral medical) */
const TYPE_COLOR: Record<ContainerType, string> = { weapon: "#7fa6ff", food: "#ffd36a", ammo: "#c8d96a", parts: "#6fe0d2", medical: "#ff8f7a", lunchbox: "#ffd36a", toolbox: "#6fe0d2", medcabinet: "#ff8f7a", safe: "#f0c45a", trash: "#b7a98a", sack: "#e3c48a", jacket: "#d9b37a" };
export { itemDef };
export const worth = (id: string) => { const d = itemDef(id); return d.kind === "key" ? 999 : d.value; };
export const sortPack = () => G.pack.sort((a, b) => worth(b) - worth(a));
export const packValue = () => G.pack.reduce((a, id) => a + itemDef(id).value, 0);

let nid = 1;
const marks: { c: Crate; m: THREE.Object3D; y: number }[] = [];
let markGeo: THREE.BufferGeometry | null = null;
const markMats = new Map<string, THREE.Material>();
/** the readability mark over a container (parts.mark): a small chevron in its type colour, near you and while unsearched */
function addMark(c: Crate, at: THREE.Vector3, color: string) {
  markGeo ??= new THREE.ConeGeometry(0.16, 0.3, 4).rotateX(Math.PI);
  const mat = markMats.get(color) ?? markMats.set(color, new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true, opacity: 0.92, depthWrite: false })).get(color)!;
  const m = new THREE.Mesh(markGeo, mat); m.position.copy(at); m.renderOrder = 9; m.visible = false; G.stage.scene.add(m); marks.push({ c, m, y: at.y });
}
export function setupCrates() {
  for (const c of G.crates) if (c.kind !== "body") c.obj.removeFromParent(); G.crates = [];
  for (const p of G.pickups) releaseModel(p.obj, p.key ?? ""); G.pickups = [];
  for (const k of marks) k.m.removeFromParent(); marks.length = 0;
  searching = null; selected = null;
  hullResolution(G.stage.renderer.domElement.clientWidth || 1920, G.stage.renderer.domElement.clientHeight || 1080);
  // generic crates: the fixed rewards (the watchtower key crate in the demo) and, with the north open, its tiered sockets
  for (const s of selectSockets(G.rng)) {
    const b = crateKit(s.tier, { variant: nid }), obj = mergePieces(b.pieces); obj.add(b.parts.root); obj.userData.lid = b.parts.lid;
    const host = s.in ? PLACED.find((p) => p.id === s.in) : undefined;
    obj.position.set(s.x, groundHeight(s.x, s.z) + (s.y ?? 0), s.z); obj.rotation.y = host ? (host.yaw ?? 0) + (Math.floor(G.rng() * 2) * Math.PI) : G.rng() * 6.28;
    G.stage.scene.add(obj); block(s.x, s.z, 0.6, true);
    const type = !s.fixed ? demoContainerType(s) : undefined;
    G.crates.push({ id: nid++, x: s.x, z: s.z, tier: s.tier, fixed: s.fixed, obj, opened: false, search: 0, items: null, kind: "crate", type, label: s.fixed === "key" ? "the gang's strongbox" : `${s.tier} crate`, r: 0.6 });
  }
  // typed containers (G1.5-27): their own models, lids and readability marks
  for (const s of selectContainers(G.rng, storyForced())) {
    const b = containerKit(s.type), obj = mergePieces(b.pieces); obj.add(b.parts.root); obj.userData.lid = b.parts.lid;
    const host = s.in ? PLACED.find((p) => p.id === s.in) : undefined;
    obj.position.set(s.x, groundHeight(s.x, s.z) + (s.y ?? 0), s.z); obj.rotation.y = s.yaw ?? (host ? (host.yaw ?? 0) + (Math.floor(G.rng() * 2) * Math.PI) : G.rng() * 6.28);
    G.stage.scene.add(obj);
    const box = new THREE.Box3().setFromObject(obj), r = Math.max(0.45, Math.min(0.75, Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * 0.42));
    if (!s.wall) block(s.x, s.z, r, true); // a wall cabinet hangs above the floor: nothing to walk into
    const c: Crate = { id: nid++, x: s.x, z: s.z, tier: s.type === "weapon" ? "green" : "wood", obj, opened: false, search: 0, items: null, kind: "container", type: s.type, label: CONTAINERS[s.type].label, socket: s.id, note: s.note[0].toUpperCase() + s.note.slice(1), r };
    G.crates.push(c);
    obj.updateMatrixWorld(true); const at = (b.parts.mark ?? b.parts.root).getWorldPosition(new THREE.Vector3()); at.y += 0.25;
    if (!b.parts.mark) at.y = box.max.y + 0.35; // a stand-in without a mark point: over its top
    addMark(c, at, TYPE_COLOR[s.type]);
  }
  looseItems();
  // your satchel from the last bonk-out: recoverable once (Duckov corpse rule, CODE_FINDINGS 4.2)
  const sat = G.save.satchel;
  if (sat) {
    const obj = mergePieces(satchelKit().pieces);
    obj.position.set(sat.x, groundHeight(sat.x, sat.z), sat.z); G.stage.scene.add(obj);
    const c: Crate = { id: nid++, x: sat.x, z: sat.z, tier: "wood", fixed: "satchel", obj, opened: false, search: 0, items: [...sat.items], kind: "crate", label: "your satchel", r: 0.4 };
    G.crates.push(c); addMark(c, new THREE.Vector3(sat.x, groundHeight(sat.x, sat.z) + 1.0, sat.z), "#ffd84a");
  }
}

// ---------------------------------------------------------------- search sessions (one per lootable, kept all raid)
/** the lootable's search, created on first open: a container rolls its pool once, a crate its tier table, a body is
 *  frozen at the knockout (loot/bodies.ts) */
export function sessionOf(c: Crate): SearchSession | null {
  if (c.session !== undefined && c.session !== null) return c.session;
  const factor = gearStats(G.gear).search;
  if (c.kind === "body") c.session = c.enemy ? bodySearch(c.enemy) : null;
  else {
    const ctx = G.lootCtx as LootContext;
    let items: string[];
    if (c.fixed === "satchel") items = [...(c.items ?? [])];
    else if (c.kind === "container" && c.type) items = rollContainer(c.type, G.rng, ctx);
    else { ctx.fixed = c.fixed as LootContext["fixed"]; ctx.ownsExtendedMag = [...G.save.guns.map(g => g?.atts.mag), ...G.save.locker, ...G.pack].some(inst => inst && itemType(inst) === "att_mag_ext"); ctx.containerType = c.type; items = rollCrate(c.tier, ctx, G.rng); ctx.fixed = undefined; ctx.containerType = undefined; }
    items = items.map(own);
    if (c.kind === "container" && c.socket) items.push(...storyExtras(c.socket)); // a lore note or a job item hidden in this one (story/raid.ts)
    c.items = items;
    c.session = createSearch(items, { openSeconds: c.kind === "container" && c.type ? CONTAINERS[c.type].openSeconds : OPEN[c.tier], searchFactor: factor });
  }
  return c.session ?? null;
}
/** everything revealed and taken (or nothing in it) */
const emptied = (c: Crate) => !!c.session && c.session.slots.every((s) => s.taken);

let searching: Crate | null = null;
export const currentSearch = () => searching;
/** the nearest thing to search within reach (bodies a little closer: you crouch over them) */
export function nearestCrate(r = 1.9) { let best: Crate | null = null, bd = r; for (const c of G.crates) { if (c.opened) continue; const d = flat(c, G.pp) - (c.kind === "body" ? 0.3 : 0); if (d < bd) { bd = d; best = c; } } return best; }
/** what the looting screen calls a container (the lead's names, by type) */
export const CONTAINER_NAME: Record<ContainerType, string> = { weapon: "Weapon crate", food: "Food box", ammo: "Ammo tin", parts: "Material crate", medical: "Medical box", lunchbox: "Lunchbox", toolbox: "Toolbox", medcabinet: "Medicine cabinet", safe: "Safe", trash: "Junk heap", sack: "Supply sack", jacket: "Hanging jacket" };
const BODY_NAME: Record<Enemy["kind"], string> = { wild: "Wild monkey", bandit: "Peel Gang bandit", brute: "Plantation brute", sleeper: "The Sleeper" };
/** the screen's view of a lootable: the live items list and its session (they stay in step: the screen splices both) */
function lootTargetOf(c: Crate, s: SearchSession): LootTarget {
  if (c.kind === "body") c.items = s.slots.filter((q) => !q.taken).map((q) => q.item);
  c.items ??= s.slots.filter((q) => !q.taken).map((q) => q.item);
  const name = c.fixed === "story" ? c.label ?? "Cache" : c.kind === "body" ? (c.enemy?.tag === "plantation-foreman" ? "Foreman Knucklebark" : c.enemy?.fauna ? { boar: "Boar", croc: "Crocodile" }[c.enemy.fauna] : BODY_NAME[c.enemy?.kind ?? "bandit"]) : c.kind === "container" && c.type ? CONTAINER_NAME[c.type] : c.fixed === "satchel" ? "Your satchel" : c.fixed === "supply" ? "Supply gondola" : c.fixed === "key" ? "Gang strongbox" : `${c.tier[0].toUpperCase()}${c.tier.slice(1)} crate`;
  const sub = c.kind === "body" ? (c.enemy?.fauna ? "Out cold" : "Knocked out") : c.note;
  return { name, sub, kind: c.kind === "body" ? "body" : "container", items: c.items, search: s,
    near: () => G.alive && G.rollT < 0 && flat(c, G.pp) < 2.2,
    onClose: () => { if (searching === c) searching = null; if (emptied(c)) c.opened = true; } };
}
/** start (or resume) searching a lootable: opens the looting screen on it (the bot: the world runs the search). Returns its session */
export function beginSearch(c: Crate) {
  const s = sessionOf(c);
  if (!c.started) {
    if (c.kind === 'body') for (const slot of s?.slots ?? []) {
      if (isUseful(slot.item, G.lootCtx)) G.lootCtx.usefulFound++;
      const definition = itemDef(slot.item);
      if (definition.kind === 'ammo') G.lootCtx.ammoFound += definition.stack ?? 1;
    }
    c.started = true; G.log.crates++; if (G.log.firstCrate < 0) G.log.firstCrate = G.raidT;
    if (c.kind !== "body") { sfx("crate"); squashOpen(c); makeNoise(V(c.x, c.z), { wood: 3, green: 6, gold: 10 }[c.tier], "loot"); }
    if (c.fixed === "satchel") hud.toast("Your satchel. Take what fits; the rest stays here.");
  }
  if (!s || !s.slots.length) { c.opened = true; floatText(c.kind === "body" ? "pockets empty" : "empty... 🕸️", V(c.x, c.z, 1.6), "#8a7d6a", 22); return s; }
  searching = c;
  if (!G.bot) openLoot(lootTargetOf(c, s)); else sfx("crateTick");
  return s;
}
export function endSearch() { if (searching && lootOpen() && lootTarget()) closeLoot(); searching = null; hud.search(null, 0); }

/** the supply balloon's gondola is a container too (gold-tier contents, searched in the looting screen like any other) */
export function addSupplyCrate(x: number, z: number, obj: THREE.Object3D) {
  const c: Crate = { id: nid++, x, z, tier: "gold", fixed: "supply", obj, opened: false, search: 0, items: null, kind: "crate", label: "supply gondola", note: "Crashed bandit supply balloon", r: 1.1 };
  G.crates.push(c); addMark(c, new THREE.Vector3(x, groundHeight(x, z) + 1.9, z), "#ff7a5a"); return c;
}

// ---------------------------------------------------------------- bodies (row 18)
/** a knocked-out enemy becomes a searchable body where it fell (it stays down with its stars, ai/enemies.ts) */
export function dropLoot(e: Enemy) {
  const session = bodySearch(e);
  const name = e.tag === "plantation-foreman" ? "the foreman" : { wild: "the wild monkey", bandit: "the bandit", brute: "the brute", sleeper: "the Sleeper" }[e.kind];
  const c: Crate = { id: nid++, x: e.p.x, z: e.p.z, tier: "wood", fixed: "body", obj: e.rig.root, opened: !session || !session.slots.length, search: 0, items: null, kind: "body", enemy: e, session, label: name, r: 0.5 };
  G.crates.push(c);
}

// ---------------------------------------------------------------- per sim step
let selected: Pickup | null = null;
export const selectedPickup = () => selected;
/** pickups within r of the player, nearest first (for the lead's nearby-items list) */
export const nearbyPickups = (r = 3) => G.pickups.filter((p) => p.landed && flat(p.p, G.pp) < r).sort((a, b) => flat(a.p, G.pp) - flat(b.p, G.pp));
export function updateLoot(dt: number) {
  // pickups: the toss, then rest
  for (const p of G.pickups) { p.t += dt; if (p.land !== undefined) p.land += dt; if (p.v) stepThrow(p, dt); }
  // what E does here: the selected pickup if it is the nearer thing, else the nearest lootable
  selected = null; let sd = PICK_REACH;
  for (const p of G.pickups) { if (!p.landed || p.t < 0.25) continue; const d = flat(p.p, G.pp); if (d < sd) { sd = d; selected = p; } }
  const near = nearestCrate();
  const pickFirst = !!selected && (!near || sd < flat(near, G.pp) - 0.35 || !!searching);
  if (G.alive && !G.zipping) {
    if (pickFirst && selected) {
      const d = itemDef(selected.item);
      if (!searching) hud.prompt(`E · Pick up ${d.name}${selected.n && d.kind === "ammo" ? ` (${selected.n})` : ""}`);
      if (G.intent.interact && collect(selected)) { const i = G.pickups.indexOf(selected); if (i >= 0) G.pickups.splice(i, 1); releaseModel(selected.obj, selected.key ?? ""); selected = null; }
    } else if (near && !searching) {
      hud.prompt(`E · ${near.kind === "body" ? "Search" : near.started ? "Search" : "Open"} ${near.label ?? "crate"}`);
      if (G.intent.interact) beginSearch(near);
    }
  }
  // the search itself. Items live in the container (Duckov's InteractableLootbox + LootView; Moo: "we see the item menu
  // with them in there"): nothing ever spills out. The looting screen runs the search and the taking (ui/lootview.ts).
  // The bot can't use a screen, so for it the world runs the same session and does what "Take searched" does: each
  // revealed item goes straight into the pack, a better find swaps with the cheapest loose item (which goes back into
  // the container), and what doesn't fit stays inside.
  if (searching && !G.bot) { if (!lootOpen()) searching = null; else if (emptied(searching)) searching.opened = true; }
  else if (searching) {
    const c = searching, s = c.session;
    if (flat(c, G.pp) > 2.2 || G.rollT >= 0 || !G.alive || !s) endSearch();
    else {
      const shown = advanceSearch(s, dt);
      c.search = s.duration > 0 ? s.elapsed / s.duration : 1;
      hud.search(c, c.search);
      if (shown.length) sfx("crateTick");
      for (let i = 0; i < s.slots.length; i++) {
        const slot = s.slots[i]; if (!slot.revealed || slot.taken) continue;
        const item = slot.item, d = itemDef(item);
        if (!fits(item)) { // a full pack: swap the cheapest loose item into the container if this one is worth more
          if (equipDef(item)?.bound) continue;
          const cheapest = cheapestLoot(); if (!cheapest || !(priority(cheapest) < priority(item))) continue;
          G.pack.splice(G.pack.indexOf(cheapest), 1); s.slots.push({ item: cheapest, revealAt: 0, revealed: true, taken: false }); c.items?.push(cheapest); G.log.swaps++;
        }
        take(s, i); const k = c.items?.indexOf(item) ?? -1; if (k >= 0) c.items!.splice(k, 1);
        if (!giveItem(item, d.kind === "ammo" ? d.stack : undefined)) { slot.taken = false; c.items?.push(item); continue; }
        if (tierAtLeast(d.rarity, "rare")) sfx("rare"); // Executive (q4) and up: loot/tiers.ts
      }
      // searched out, or fully revealed with only what it can't carry left: done with this one
      if (emptied(c) || s.elapsed >= s.duration && s.slots.every((q) => q.taken || !fits(q.item))) { c.opened = true; endSearch(); }
    }
  }
  for (const k of marks) {
    const d = flat(k.c, G.pp), on = !k.c.opened && d < 9 && d > 0.6;
    k.m.visible = on; if (on) { k.m.position.y = k.y + Math.sin(G.time * 2.6 + k.c.id) * 0.06; k.m.rotation.y += dt * 1.2; }
  }
}
/** per render frame: pose every ground item */
export function renderLoot(dt: number) {
  for (const p of G.pickups) poseModel(p.obj, p.p, p.land, p === selected, dt);
}
/** the lid swings open on its hinge (with a small overshoot) and the box gives a squash pop */
function squashOpen(c: Crate) {
  const o = c.obj, lid = o.userData.lid as THREE.Object3D | undefined; let k = 0;
  const f = () => { k += 0.045; const e = 1 - Math.pow(1 - Math.min(1, k), 3), pop = Math.sin(Math.min(1, k * 1.6) * Math.PI);
    if (lid) lid.rotation.x = CRATE_LID_OPEN * (e + Math.sin(e * Math.PI) * 0.12); o.scale.set(1 + pop * 0.08, 1 - pop * 0.1, 1 + pop * 0.08);
    if (k < 1) requestAnimationFrame(f); else { o.scale.set(1, 1, 1); if (lid) lid.rotation.x = CRATE_LID_OPEN; } }; f();
}
/** kept for callers that mark a moment (no rarity beams in the world, POLISH_FINDINGS 13) */
export function beam(_at: THREE.Vector3, _color: string) { /* retired: a find is told by its model, the sound and the screen */ }

// ---------------------------------------------------------------- ground items
function makePickup(item: string, x: number, y: number, z: number, n?: number): Pickup {
  item = own(item);
  if (n !== undefined && itemDef(item).kind === "ammo") item = withCount(item, n);
  const { obj, key } = takeModel(item);
  obj.rotation.y = G.rng() * Math.PI * 2; G.stage.scene.add(obj);
  const p: Pickup = { id: nid++, item, p: new THREE.Vector3(x, y, z), obj, vy: 0, landed: false, t: 0, n, key };
  G.pickups.push(p); return p;
}
/** drop an item with Duckov's toss: aim = world yaw it flies along (+-22.5 deg), 1.5-3 u/s out and 2.5 up, no spin */
export function dropItem(item: string, from: THREE.Vector3, aim: number, n?: number) {
  const y = Math.max(from.y, groundHeight(from.x, from.z) + 0.3);
  const p = makePickup(item, from.x, y, from.z, n); p.v = throwVelocity(aim, G.rng); return p;
}
/** place an item at rest (procedural loot: the supply drop, a spawn): random yaw, on open ground you can walk to */
export function placeItem(item: string, x: number, z: number, n?: number, y = groundHeight(x, z)) {
  const p = makePickup(item, x, y, z, n); p.landed = true; p.land = 1; popIn(p.obj); return p;
}
/** loose finds lying on things (the population pass; Duckov's loose-loot spawners): a seeded handful each raid on the
 *  tops of crates, barrels, benches and sack piles in the slice. Each sits on the top it is on (a ray down onto the drawn
 *  piece), so nothing floats */
const LOOSE_ON = new Set(["crate_wood", "crate_wood_b", "crate_green", "barrel_wood", "barrel_rust", "barrel_teal", "log_bench", "log_bench_b", "sack_pile"]);
const LOOSE_POOL: Record<string, number> = { banana: 4, coconut: 3, bandage: 3, scrap_tin: 3, vine_rope: 2, spring: 2, ammo45: 2, plank: 1, honey_pot: 1, smoothie: 1, banana_notes: 1 };
export const LOOSE_PER_RAID = 12;
/** the height of a piece's top above its origin (its model's bounds; the world chunks keep no CPU copy to ray-cast) */
const tops = new Map<string, number>();
const topOf = (k: string) => { let t = tops.get(k); if (t === undefined) { const box = new THREE.Box3(); for (const q of K.asset(k).pieces) { q.geo.computeBoundingBox(); box.union(q.geo.boundingBox!); } t = box.max.y; tops.set(k, t); } return t; };
function looseItems() {
  const spots = PLACED.filter((p) => LOOSE_ON.has(p.k) && inDemo(p.x, p.z) && p.x < UNDER_X && Math.hypot(p.x - START.x, p.z - START.z) > 20);
  const total = Object.values(LOOSE_POOL).reduce((a, b) => a + b, 0), pick = () => { let r = G.rng() * total; for (const [id, w] of Object.entries(LOOSE_POOL)) { r -= w; if (r < 0) return id; } return "banana"; };
  for (let n = 0; n < LOOSE_PER_RAID && spots.length; n++) {
    const p = spots.splice(Math.floor(G.rng() * spots.length), 1)[0], ox = (G.rng() - 0.5) * 0.25, oz = (G.rng() - 0.5) * 0.25;
    // on level ground only: a prop settled onto a slope tilts its top (dress.ts settle)
    if (Math.abs(groundHeight(p.x + 0.6, p.z) - groundHeight(p.x - 0.6, p.z)) + Math.abs(groundHeight(p.x, p.z + 0.6) - groundHeight(p.x, p.z - 0.6)) > 0.06) { n--; continue; }
    placeItem(pick(), p.x + ox, p.z + oz, undefined, groundHeight(p.x, p.z) - 0.04 + topOf(p.k) * (p.s ?? 1) - 0.025);
  }
}
/** the old entry point: k of n items around a point. Placed at rest on open ground in reach of the point */
export function spawnPickup(id: string, from: THREE.Vector3, k = 0, n = 1, n2?: number) {
  // dropped by you (the loot screen's Drop: from your own position): Duckov's toss along your aim, not a placement
  if (n === 1 && k === 0 && G.scene === "raid" && flat(from, G.pp) < 0.3) return dropItem(id, from.clone().setY(G.pp.y + 1), G.aimYaw, n2);
  let a = (k / Math.max(1, n)) * Math.PI * 2 + G.rng(), r = 1.2 + G.rng() * 0.5, tx = from.x, tz = from.z;
  for (let t = 0; t < 12; t++) { tx = from.x + Math.cos(a) * r; tz = from.z + Math.sin(a) * r; if (walkable(tx, tz) && los(from.x, from.z, tx, tz)) break; a += 2.4; if (t % 3 === 2) r = Math.max(0.9, r - 0.2); if (t === 11) { tx = G.pp.x; tz = G.pp.z; } }
  return placeItem(id, tx, tz, n2);
}
/** can this item go into the pack (or onto you) right now. The lead's looting screen asks before take() */
let botHealingReserve = 0;
export function setBotHealingReserve(healing: number) { botHealingReserve = Math.max(0, healing); }
const priority = (item: string) => G.bot && botHealingReserve > 0 ? lootPriority(item, G.pack, botHealingReserve) : worth(item);
function cheapestLoot() {
  let cheapest: string | undefined;
  // Exchanging one item must actually free a slot.
  for (const [item, next] of packStacks(G.pack)) {
    if (next || item === G.useItem?.id || item === G.equipping?.inst) continue;
    if (!cheapest || priority(item) < priority(cheapest)) cheapest = item;
  }
  return cheapest;
}
export function fits(item: string) {
  const d = itemDef(item);
  if (equipDef(item)?.bound) return false;
  if (d.kind === "ammo") return true;
  if (d.kind === "gun" && freeGunSlot() >= 0) return true; // Duckov TryPlug: an empty gun slot first, then the pack
  return fitsInPack(G.pack, G.packSlots, item);
}
/** put an item into the pack / the gun / the ammo pouch. Returns false if it did not fit (the caller keeps it) */
export function giveItem(item: string, n?: number): boolean {
  if (G.scene === "raid" && !G.alive) return false;
  item = own(item);
  const d = itemDef(item);
  if (equipDef(item)?.bound) return false;
  // rounds go to their own caliber's reserve (Duckov matches caliber strings; a .45 never loads a rifle)
  if (d.kind === "ammo") { const cal = itemType(item), k = n ?? stackCount(item, d.stack ?? 8); if (isCaliber(cal)) G.reserve[cal] += k; consumeInstance(item); sfx("pick"); floatText(`+${k} ${CALIBERS[cal as Caliber]?.short ?? ""} rounds`, G.pp.clone().setY(2.4), "#ffcf6a", 20); hud.ammo(); pickupSucceeded(item, k, "Rounds added to reserve"); return true; }
  // a gun goes into the first empty gun slot, empty of rounds; with both full it packs like loot (never swaps the one in hand)
  if (d.kind === "gun" && equipFound(item) >= 0) { sfx("pick"); hud.ammo(); floatText(`${d.name}`, G.pp.clone().setY(2.4), RAR_COLOR[d.rarity], 22); const slot = G.save.guns.findIndex(g => g?.inst === item) + 1; pickupSucceeded(item, 1, `Gun slot ${slot} · Press ${slot} to draw`); return true; }
  // gun attachments pack like loot; Duckov never fits a part on pickup (Tab, then drag it onto the Kingpin)
  if (!fitsInPack(G.pack, G.packSlots, item)) return false;
  if (isEquip(item)) { const result = collectEquipment(item); if (result !== "full") { sortPack(); sfx("pick"); hud.pack(); pickupSucceeded(item, 1, result === "equipping" ? "Putting on equipment" : "Added to pack"); return true; } }
  G.pack.push(item); sortPack(); sfx("pick"); hud.pack();
  floatText(`${d.icon} ${d.name}`, G.pp.clone().setY(2.4), RAR_COLOR[d.rarity], 20);
  pickupSucceeded(item, 1, d.kind === "attachment" ? "Added to pack · Tab to fit onto a gun" : d.kind === "gun" ? "Both gun slots full · Stored in pack" : "Added to pack");
  if (itemType(item) === "vine_key") hud.toast("The Vine Key! Get it home: the key opens the vault door from your next raid");
  return true;
}
/** E on a ground item. Returns true if it was taken */
function collect(p: Pickup): boolean {
  if (giveItem(p.item, p.n)) return true;
  if (equipDef(p.item)?.bound) { pickupBlocked(p.item); return false; }
  if (packStacks(G.pack).length >= G.packSlots) {
    // a full pack: swap for the cheapest loose item, which is tossed out where you stand
    const cheapest = cheapestLoot();
    if (cheapest && priority(cheapest) < priority(p.item)) {
      G.pack.splice(G.pack.indexOf(cheapest), 1); dropItem(cheapest, G.pp.clone().setY(G.pp.y + 1), G.aimYaw); G.pack.push(p.item);
      const equipment = equipDef(p.item); if (equipment && !G.gear[equipment.slot]) equipFromPack(G.pack.length - 1);
      sortPack(); G.log.swaps++; sfx("pick"); hud.pack(); pickupSucceeded(p.item, 1, `Picked up · Dropped ${itemDef(cheapest).name} to make room`); return true;
    }
    pickupBlocked(p.item);
  }
  return false;
}

// the looting screen's hook (loot/lootables.ts)
import { bindLootApi } from "./lootables";
bindLootApi({
  session: sessionOf, begin: beginSearch, end: endSearch, current: currentSearch, nearest: () => nearestCrate(), fits, give: giveItem, take,
  nearby: (r) => nearbyPickups(r).map((p) => ({ item: p.item, x: p.p.x, z: p.p.z, id: p.id })),
});
