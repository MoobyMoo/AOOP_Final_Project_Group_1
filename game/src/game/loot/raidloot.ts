// Crates (search by standing at them: press E to start, keep within reach), pickups that pop out with a rarity
// beam and are collected by walking over them, the 8-slot pack whose best N items sit safe in the cheek pouch.
// A full pack never deletes loot: the find stays on the ground and E swaps it for your cheapest loose item (rule 20).
import * as THREE from "three";
import { G, V, flat, type Crate, type Pickup, type Enemy } from "../core/state";
import { ITEMS, rollCrate, rollEnemyDrop, type LootContext } from "./tables";
const WEAR_DROPS = ["tophat", "aviators", "pith", "eyepatch", "fedora", "goggles", "heartglasses", "crown", "hardhat", "beanie"];
import { CRATES } from "../world/layout";
import { groundHeight } from "../world/terrain";
import { block } from "../world/grid";
import { crate as crateModel } from "../world/kit";
import { sfx } from "../core/audio";
import { burst, floatText, popIn } from "../../fx";
import { hud } from "../ui/hud";
import { KINGPIN } from "../combat/weapons";
import { WEARABLES } from "../actors/wearables";
import { setDropWear } from "../actors/player";
setDropWear((id) => spawnPickup(id, G.pp.clone().setY(1.6), 0, 1));

export const RAR_COLOR: Record<string, string> = { common: "#f3ead6", uncommon: "#6ad16a", rare: "#4aa8ff", epic: "#c77dff" };
const SEARCH: Record<string, number> = { wood: 0.5, green: 0.9, gold: 1.4 };
export const itemDef = (id: string) => ITEMS[id] ?? (() => { const w = WEARABLES.find((q) => q.id === id); return { id, name: w?.name ?? id, icon: "🎩", rarity: w?.rarity ?? "rare", value: 0, kind: "wear" as const }; })();
export const worth = (id: string) => { const d = itemDef(id); return d.kind === "key" ? 999 : d.value; };
export const sortPack = () => G.pack.sort((a, b) => worth(b) - worth(a));
export const packValue = () => G.pack.reduce((a, id) => a + itemDef(id).value, 0);

let nid = 1;
export function setupCrates() {
  for (const c of G.crates) c.obj.removeFromParent(); G.crates = [];
  for (const p of G.pickups) p.obj.removeFromParent(); G.pickups = [];
  const optional = CRATES.filter((c) => !c.fixed), pickN = Math.min(optional.length, 18);
  const chosen = new Set<number>(); while (chosen.size < pickN) chosen.add(Math.floor(G.rng() * optional.length));
  const list = [...CRATES.filter((c) => c.fixed && (c.fixed !== "vault" || true)), ...[...chosen].map((i) => optional[i])];
  for (const s of list) {
    const obj = crateModel(s.tier === "wood" ? "wood" : "gold"); if (s.tier === "green") obj.traverse((m) => { const mm = m as THREE.Mesh; if (mm.isMesh) { mm.material = (mm.material as THREE.MeshStandardMaterial).clone(); (mm.material as THREE.MeshStandardMaterial).color.multiply(new THREE.Color("#7fb06a")); } });
    obj.position.set(s.x, groundHeight(s.x, s.z), s.z); obj.rotation.y = G.rng() * 6.28; obj.traverse((m) => { (m as THREE.Mesh).castShadow = true; });
    G.stage.scene.add(obj); block(s.x, s.z, 0.6, true);
    G.crates.push({ id: nid++, x: s.x, z: s.z, tier: s.tier, fixed: s.fixed, obj, opened: false, search: 0, items: null });
  }
  // your satchel from the last bonk-out: recoverable once (Duckov corpse rule, CODE_FINDINGS 4.2)
  const sat = G.save.satchel;
  if (sat) {
    const obj = new THREE.Group(); const bag = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 10), new THREE.MeshStandardMaterial({ color: "#8a5a34", roughness: 0.8 })); bag.scale.set(1.1, 0.75, 0.9); bag.position.y = 0.32; obj.add(bag);
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
      searching.search += dt / SEARCH[searching.tier]; hud.search(searching, searching.search);
      if (Math.floor(searching.search * 6) !== Math.floor((searching.search - dt / SEARCH[searching.tier]) * 6)) sfx("crateTick");
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
  let items = c.fixed === "satchel" ? [...(c.items ?? [])] : rollCrate(c.tier, ctx, G.rng); ctx.fixed = undefined;
  if (c.fixed === "satchel") { G.save.satchel = null; hud.toast("You got your satchel back!"); }
  if ((c.tier === "gold" && G.rng() < 0.35) || (c.tier === "green" && G.rng() < 0.08)) { const free = WEAR_DROPS.filter((w) => !G.save.locker.includes(w)); if (free.length) items.push(free[Math.floor(G.rng() * free.length)]); }
  c.items = items;
  sfx("crate"); squashOpen(c);
  if (!items.length) { floatText("empty... 🕸️", V(c.x, c.z, 1.6), "#8a7d6a", 22); return; }
  const best = items.reduce((a, b) => (rank(itemDef(b).rarity) > rank(itemDef(a).rarity) ? b : a));
  const br = itemDef(best).rarity;
  if (br === "rare" || br === "epic") { sfx("rare"); beam(V(c.x, c.z), RAR_COLOR[br]); G.stage.trauma = Math.min(1, G.stage.trauma + 0.15); }
  items.forEach((id, k) => spawnPickup(id, V(c.x, c.z, 0.8), k, items.length));
}
const rank = (r: string) => ["common", "uncommon", "rare", "epic"].indexOf(r);
function squashOpen(c: Crate) { const o = c.obj; let k = 0; const f = () => { k += 0.06; o.scale.set(1 + Math.sin(k * Math.PI) * 0.2, 1 - Math.sin(k * Math.PI) * 0.25, 1 + Math.sin(k * Math.PI) * 0.2); if (k < 1) requestAnimationFrame(f); else { o.scale.set(1, 0.55, 1); o.traverse((m) => { const mm = m as THREE.Mesh; if (mm.isMesh && !(mm.material as THREE.Material).transparent) { mm.material = (mm.material as THREE.MeshStandardMaterial).clone(); (mm.material as THREE.MeshStandardMaterial).color.multiplyScalar(0.6); } }); } }; f(); }
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
  const a = (k / Math.max(1, n)) * Math.PI * 2 + G.rng(), r = 1.2 + G.rng() * 0.5;
  s.position.copy(from); G.stage.scene.add(s); popIn(s);
  const p: Pickup = { id: nid++, item: id, p: V(from.x + Math.cos(a) * r, from.z + Math.sin(a) * r), obj: s, vy: 6 + G.rng() * 2, landed: false, t: 0, n: n2 };
  G.pickups.push(p); return p;
}
/** returns true if the pickup was taken */
function collect(p: Pickup): boolean {
  const d = itemDef(p.item);
  if (d.kind === "ammo") { const n = p.n ?? d.stack ?? 8; G.ammo += n; sfx("pick"); floatText(`+${n} rounds`, G.pp.clone().setY(2.4), "#ffcf6a", 20); hud.ammo(); return true; }
  if (d.kind === "wear") { // an exciting find you use on the spot (advisor round 1); kept even on a bonk-out
    const w = WEARABLES.find((q) => q.id === p.item); if (!G.save.locker.includes(p.item)) G.save.locker.push(p.item);
    if (w) { G.gear = { ...G.gear, [w.slot]: w.id }; G.rig.setGear?.(G.gear); }
    sfx("rare"); hud.banner(`New look: ${d.name}!`); return true;
  }
  if (d.kind === "attachment") { if (!G.save.fixtures.includes("extended_mag")) G.save.fixtures.push("extended_mag"); G.magSize = KINGPIN.extMag; G.gun.setVariant({ extMag: true }); sfx("rare"); hud.banner("Kingpin Extended Mag: 12 rounds a mag!"); hud.ammo(); return true; }
  if (G.pack.length >= G.packSlots) {
    if (G.intent.interact) { sortPack(); const cheapest = G.pack[G.pack.length - 1]; if (worth(cheapest) < worth(p.item)) { G.pack.pop(); spawnPickup(cheapest, G.pp.clone().setY(1), 0, 1); G.pack.push(p.item); sortPack(); G.log.swaps++; sfx("pick"); hud.pack(); return true; } }
    hud.prompt(`E · Pack full: swap for your ${itemDef(G.pack[G.pack.length - 1]).name}`); return false;
  }
  G.pack.push(p.item); sortPack(); sfx("pick"); hud.pack();
  floatText(`${d.icon} ${d.name}`, G.pp.clone().setY(2.4), RAR_COLOR[d.rarity] === "#f3ead6" ? "#fff8ec" : RAR_COLOR[d.rarity], 20);
  if (p.item === "vine_key") hud.toast("The Vine Key! Get it home: the key opens the vault door from your next raid");
  return true;
}
export function dropLoot(e: Enemy) {
  const items = [...e.stolen, ...e.carry.map((i) => (ITEMS[i] ? i : "boomerang")), ...rollEnemyDrop(e.kind, { ...(G.lootCtx as LootContext), carried: [] }, G.rng)]; e.stolen = []; e.carry = [];
  items.forEach((id, k) => spawnPickup(id, e.p.clone().setY(1.2), k, items.length));
  if (e.kind === "sleeper") { beam(e.p, RAR_COLOR.epic); sfx("rare"); }
}
void burst;
