// Crates (search by standing at them: press E to start, keep within reach), pickups that pop out with a rarity
// beam and are collected by walking over them, the 8-slot pack whose best N items sit safe in the cheek pouch.
// A full pack never deletes loot: the find stays on the ground and E swaps it for your cheapest loose item (rule 20).
import * as THREE from "three";
import { G, V, flat, type Crate, type Pickup, type Enemy } from "../core/state";
import { itemDef, rollCrate, type LootContext } from "./tables";
import { bodySearch } from './bodies';
import { demoContainerType, type ContainerType } from './containers';
export { bodyContents, bodySearch } from './bodies';
export { advanceSearch, take, takeAll } from './search';
const crateTypes = new WeakMap<Crate, ContainerType>();
export const containerType = (crate: Crate) => crateTypes.get(crate);
import { equipDef, gearStats, isEquip } from "./equipment";
import { collectEquipment, equipFromPack } from "./equipment-actions";
import { PLACED } from "../world/layout";
import { selectSockets } from "./sockets";
import { groundHeight } from "../world/terrain";
import { block, walkable, los } from "../world/grid";
import { crate as crateKit, satchel as satchelKit, CRATE_LID_OPEN } from "../world/kit_build";
import { mergePieces } from "../world/kitutil";
import { sfx } from "../core/audio";
import { sting } from "../core/music";
import { burst, floatText, popIn } from "../../fx";
import { hud } from "../ui/hud";
import { KINGPIN } from "../combat/weapons";
import { makeNoise } from "../combat/combat";

export const RAR_COLOR: Record<string, string> = { common: "#f3ead6", uncommon: "#6ad16a", rare: "#4aa8ff", epic: "#c77dff" };
const SEARCH: Record<string, number> = { wood: 0.5, green: 0.9, gold: 1.4 };
export { itemDef };
export const worth = (id: string) => { const d = itemDef(id); return d.kind === "key" ? 999 : d.value; };
export const sortPack = () => G.pack.sort((a, b) => worth(b) - worth(a));
export const packValue = () => G.pack.reduce((a, id) => a + itemDef(id).value, 0);

let nid = 1;
export function setupCrates() {
  for (const c of G.crates) c.obj.removeFromParent(); G.crates = [];
  for (const p of G.pickups) p.obj.removeFromParent(); G.pickups = [];
  const list = selectSockets(G.rng);
  for (const s of list) {
    // the kit crate: static body merged into one mesh, the lid is its own node (hinge on the back edge)
    const b = crateKit(s.tier, { variant: nid }), obj = mergePieces(b.pieces); obj.add(b.parts.root); obj.userData.lid = b.parts.lid;
    // a crate inside a building squares up with its walls; outdoors it sits at any angle
    const host = s.in ? PLACED.find((p) => p.id === s.in) : undefined;
    obj.position.set(s.x, groundHeight(s.x, s.z) + (s.y ?? 0), s.z); obj.rotation.y = host ? (host.yaw ?? 0) + (Math.floor(G.rng() * 2) * Math.PI) : G.rng() * 6.28;
    G.stage.scene.add(obj); block(s.x, s.z, 0.6, true);
    const crate: Crate = { id: nid++, x: s.x, z: s.z, tier: s.tier, fixed: s.fixed, obj, opened: false, search: 0, items: null };
    if (!s.fixed) crateTypes.set(crate, demoContainerType(s));
    G.crates.push(crate);
  }
  // your satchel from the last bonk-out: recoverable once (Duckov corpse rule, CODE_FINDINGS 4.2)
  const sat = G.save.satchel;
  if (sat) {
    const obj = mergePieces(satchelKit().pieces);
    const flag = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5, 4), new THREE.MeshBasicMaterial({ color: "#ffd84a" })); flag.position.y = 1.0; flag.rotation.x = Math.PI; obj.add(flag);
    obj.position.set(sat.x, groundHeight(sat.x, sat.z), sat.z); G.stage.scene.add(obj); beam(new THREE.Vector3(sat.x, 0, sat.z), "#ffd84a");
    G.crates.push({ id: nid++, x: sat.x, z: sat.z, tier: "wood", fixed: "satchel", obj, opened: false, search: 0, items: [...sat.items] });
  }
}
let searching: Crate | null = null;
export const currentSearch = () => searching;
export function nearestCrate(r = 1.9) { let best: Crate | null = null, bd = r; for (const c of G.crates) { if (c.opened) continue; const d = flat(c, G.pp); if (d < bd) { bd = d; best = c; } } return best; }

export function updateLoot(dt: number) {
  // searching
  const near = nearestCrate();
  if (G.intent.interact && near && !searching) { searching = near; sfx("crateTick"); }
  if (searching) {
    if (flat(searching, G.pp) > 2.2 || G.rollT >= 0 || !G.alive) { searching.search = 0; searching = null; hud.search(null, 0); }
    else {
      const searchTime = SEARCH[searching.tier] * gearStats(G.gear).search;
      searching.search += dt / searchTime; hud.search(searching, searching.search);
      if (Math.floor(searching.search * 6) !== Math.floor((searching.search - dt / searchTime) * 6)) sfx("crateTick");
      if (searching.search >= 1) { openCrate(searching); searching = null; hud.search(null, 0); }
    }
  }
  // pickups: arc out, land, bob; collected by walking over
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const p = G.pickups[i]; p.t += dt;
    if (!p.landed) { p.vy -= 22 * dt; p.obj.position.y += p.vy * dt; const gy = groundHeight(p.obj.position.x, p.obj.position.z) + 0.35; if (p.obj.position.y <= gy) { p.obj.position.y = gy; p.landed = true; sfx("pop", 0.5); } }
    else p.obj.position.y = groundHeight(p.obj.position.x, p.obj.position.z) + 0.45 + Math.sin(p.t * 3 + p.id) * 0.08;
    p.obj.position.x += (p.p.x - p.obj.position.x) * Math.min(1, dt * 6); p.obj.position.z += (p.p.z - p.obj.position.z) * Math.min(1, dt * 6);
    if (p.landed && p.t > 0.35 && G.alive && flat(p.obj.position, G.pp) < 1.1) { if (collect(p)) { p.obj.removeFromParent(); G.pickups.splice(i, 1); } }
  }
}
function openCrate(c: Crate) {
  c.opened = true; G.log.crates++; if (G.log.firstCrate < 0) G.log.firstCrate = G.raidT; 
  const ctx = G.lootCtx as LootContext; ctx.fixed = c.fixed as LootContext["fixed"]; ctx.ownsExtendedMag = G.save.upgrades.mag > 0 || G.save.fixtures.includes("extended_mag");
  ctx.containerType = containerType(c);
  let items = c.fixed === "satchel" ? [...(c.items ?? [])] : rollCrate(c.tier, ctx, G.rng); ctx.fixed = undefined; ctx.containerType = undefined;
  if (c.fixed === "satchel") { G.save.satchel = null; hud.toast("You got your satchel back!"); }
  c.items = items;
  sfx("crate"); squashOpen(c);
  makeNoise(V(c.x, c.z), { wood: 3, green: 6, gold: 10 }[c.tier], "loot");
  if (!items.length) { floatText("empty... 🕸️", V(c.x, c.z, 1.6), "#8a7d6a", 22); return; }
  const best = items.reduce((a, b) => (rank(itemDef(b).rarity) > rank(itemDef(a).rarity) ? b : a));
  const br = itemDef(best).rarity;
  if (br === "rare" || br === "epic") { sfx("rare"); sting("stingRare"); beam(V(c.x, c.z), RAR_COLOR[br]); G.stage.trauma = Math.min(1, G.stage.trauma + 0.15); }
  items.forEach((id, k) => spawnPickup(id, V(c.x, c.z, 0.8), k, items.length));
}
const rank = (r: string) => ["common", "uncommon", "rare", "epic"].indexOf(r);
/** the lid swings open on its hinge (with a small overshoot) and the box gives a squash pop */
function squashOpen(c: Crate) {
  const o = c.obj, lid = o.userData.lid as THREE.Object3D | undefined; let k = 0;
  const f = () => { k += 0.045; const e = 1 - Math.pow(1 - Math.min(1, k), 3), pop = Math.sin(Math.min(1, k * 1.6) * Math.PI);
    if (lid) lid.rotation.x = CRATE_LID_OPEN * (e + Math.sin(e * Math.PI) * 0.12); o.scale.set(1 + pop * 0.12, 1 - pop * 0.14, 1 + pop * 0.12);
    if (k < 1) requestAnimationFrame(f); else { o.scale.set(1, 1, 1); if (lid) lid.rotation.x = CRATE_LID_OPEN; } }; f();
}
export function beam(at: THREE.Vector3, color: string) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 7, 16, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.6), transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  m.position.set(at.x, groundHeight(at.x, at.z) + 3.5, at.z); G.stage.scene.add(m); let k = 0; const f = () => { k += 0.012; (m.material as THREE.MeshBasicMaterial).opacity = 0.35 * (1 - k); if (k < 1) requestAnimationFrame(f); else m.removeFromParent(); }; f();
}
const texCache = new Map<string, THREE.Texture>();
function iconTex(icon: string, color: string) {
  const key = icon + color; let t = texCache.get(key); if (t) return t;
  const c = document.createElement("canvas"); c.width = c.height = 128; const x = c.getContext("2d")!;
  x.fillStyle = "#fffaf0"; x.strokeStyle = color; x.lineWidth = 12; x.beginPath(); x.arc(64, 64, 50, 0, 7); x.fill(); x.stroke();
  x.font = "62px serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(icon, 64, 70);
  t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; texCache.set(key, t); return t;
}
export function spawnPickup(id: string, from: THREE.Vector3, k = 0, n = 1, n2?: number) {
  const d = itemDef(id), s = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTex(d.icon, RAR_COLOR[d.rarity]), depthTest: true }));
  s.scale.setScalar(d.rarity === "epic" ? 0.95 : 0.75); s.renderOrder = 8;
  // land on open ground you can walk to from here: never inside a wall or on the far side of one (pacing report issue 3)
  let a = (k / Math.max(1, n)) * Math.PI * 2 + G.rng(), r = 1.2 + G.rng() * 0.5, tx = from.x, tz = from.z;
  for (let t = 0; t < 12; t++) { tx = from.x + Math.cos(a) * r; tz = from.z + Math.sin(a) * r; if (walkable(tx, tz) && los(from.x, from.z, tx, tz)) break; a += 2.4; if (t % 3 === 2) r = Math.max(0.9, r - 0.2); if (t === 11) { tx = G.pp.x; tz = G.pp.z; } }
  s.position.copy(from); G.stage.scene.add(s); popIn(s);
  const p: Pickup = { id: nid++, item: id, p: V(tx, tz), obj: s, vy: 6 + G.rng() * 2, landed: false, t: 0, n: n2 };
  G.pickups.push(p); return p;
}
/** returns true if the pickup was taken */
function collect(p: Pickup): boolean {
  const d = itemDef(p.item);
  if (equipDef(p.item)?.bound) return false;
  if (d.kind === "ammo") { const n = p.n ?? d.stack ?? 8; G.ammo += n; sfx("pick"); floatText(`+${n} rounds`, G.pp.clone().setY(2.4), "#ffcf6a", 20); hud.ammo(); return true; }
  if (isEquip(p.item) && G.pack.length < G.packSlots) {
    const result = collectEquipment(p.item);
    if (result !== "full") { sortPack(); sfx("pick"); hud.pack(); return true; }
  }
  if (d.kind === "attachment") { if (!G.save.fixtures.includes("extended_mag")) G.save.fixtures.push("extended_mag"); G.magSize = KINGPIN.extMag; G.gun.setVariant({ extMag: true }); sfx("rare"); hud.banner("Kingpin Extended Mag: 12 rounds a mag!"); hud.ammo(); return true; }
  if (G.pack.length >= G.packSlots) {
    if (G.intent.interact) { sortPack(); const cheapest = G.pack[G.pack.length - 1]; if (worth(cheapest) < worth(p.item)) { G.pack.pop(); spawnPickup(cheapest, G.pp.clone().setY(1), 0, 1); G.pack.push(p.item); const equipment = equipDef(p.item); if (equipment && !G.gear[equipment.slot]) equipFromPack(G.pack.length - 1); sortPack(); G.log.swaps++; sfx("pick"); hud.pack(); return true; } }
    hud.prompt(`E · Pack full: swap for your ${itemDef(G.pack[G.pack.length - 1]).name}`); return false;
  }
  G.pack.push(p.item); sortPack(); sfx("pick"); hud.pack();
  floatText(`${d.icon} ${d.name}`, G.pp.clone().setY(2.4), RAR_COLOR[d.rarity] === "#f3ead6" ? "#fff8ec" : RAR_COLOR[d.rarity], 20);
  if (p.item === "vine_key") hud.toast("The Vine Key! Get it home: the key opens the vault door from your next raid");
  return true;
}
export function dropLoot(e: Enemy) {
  bodySearch(e);
}
void burst;
