// Raid interactions: extraction (stand still in the ring; moving or a hit resets it visibly, rule 15), portals into
// the grotto and back (E, fade), the zipline (E, ride, safe while riding), doors (E/F opens and closes; boarded ones
// break, locked ones need their key), readable easter eggs, area discovery banners, the supply drop.
import * as THREE from "three";
import { G, V, flat } from "../core/state";
import { exits, portalMarks, reads, zipAnchors } from "./props";
import { areaAt, doorNear, block } from "./grid";
import { groundHeight } from "./terrain";
import { CLEARINGS, SUPPLY_DROPS, ZIPLINES } from "./layout";
import { doorPrompt, useDoor } from "./buildings";
import { sfx } from "../core/audio";
import { hud } from "../ui/hud";
import { nearestCrate, spawnPickup, beam, RAR_COLOR } from "../loot/raidloot";
import { rollCrate } from "../loot/tables";
import * as K from "./kit_build";
import { mergePieces } from "./kitutil";

export const EXTRACT_TIME = 3;
let lastPp = new THREE.Vector3(), lastHp = 100, fading = false;
export let onExtract: (id: "hatch" | "raft" | "tunnel", bonus: number) => void = () => {};
export const setOnExtract = (f: typeof onExtract) => { onExtract = f; };
let drop: { t: number; at: { x: number; z: number; area: string }; done: boolean; smoke?: THREE.Points; gondola?: THREE.Object3D } | null = null;

export function startInteractions() {
  lastPp.copy(G.pp); lastHp = G.hp; G.extract = { id: "", t: 0 }; fading = false; for (const e of exits) e.armed = false;
  drop?.smoke?.removeFromParent(); drop?.gondola?.removeFromParent();
  const at = SUPPLY_DROPS[Math.floor(G.rng() * SUPPLY_DROPS.length)]; drop = { t: 90 + G.rng() * 60, at, done: false };
}
export function fadeTo(f: () => void) {
  let d = document.querySelector(".fade") as HTMLDivElement; if (!d) { d = document.createElement("div"); d.className = "fade"; document.body.appendChild(d); }
  fading = true; d.classList.add("on"); setTimeout(() => { f(); setTimeout(() => { d.classList.remove("on"); fading = false; }, 120); }, 380);
}
export function updateInteractions(dt: number) {
  if (!G.alive || fading) return;
  // ---- area discovery
  const a = areaAt(G.pp.x, G.pp.z);
  if (a !== G.area) { G.area = a; if (a && !G.discovered.has(a)) { G.discovered.add(a); const c = CLEARINGS.find((q) => q.id === a)!; hud.banner(c.name, c.under ? "underground" : ""); sfx("ui"); } }
  // ---- extraction
  const moved = flat(G.pp, lastPp) > 0.02 * Math.max(1, dt * 60); lastPp.copy(G.pp);
  const hit = G.hp < lastHp; lastHp = G.hp;
  let inEx: (typeof exits)[number] | null = null;
  // an exit arms once you've been more than 8 u away from it (no accidental extraction at the spawn)
  for (const e of exits) { if (!e.open) continue; const d = flat(G.pp, e); if (d > 8) e.armed = true; if (d < 1.9 && e.armed) inEx = e; e.ring.rotation.z += dt * 0.6; }
  if (inEx && !G.zipping) {
    if (G.extract.id !== inEx.id) G.extract = { id: inEx.id, t: 0 };
    if (moved || hit) { if (G.extract.t > 0.15 && hit) hud.toast("Hit! The countdown starts over"); G.extract.t = 0; }
    else { const before = G.extract.t; G.extract.t += dt; if (Math.floor(before) !== Math.floor(G.extract.t)) sfx("tick"); }
    inEx.fill.scale.setScalar(Math.max(0.01, G.extract.t / EXTRACT_TIME));
    const label = inEx.id === "raft" ? "🛶 Raft home, +30% sale" : inEx.id === "tunnel" ? "🕳️ Smuggler Tunnel home" : "🏠 Hatch home";
    hud.extract(label, Math.max(0.02, G.extract.t / EXTRACT_TIME), moved ? null : Math.max(0, EXTRACT_TIME - G.extract.t));
    if (G.extract.t >= EXTRACT_TIME) { sfx("extract"); hud.extract("", 0); const b = inEx.bonus, id = inEx.id; G.alive = false; fadeTo(() => onExtract(id, b)); }
  } else { if (G.extract.id) { for (const e of exits) e.fill.scale.setScalar(0.01); hud.extract("", 0); } G.extract = { id: "", t: 0 }; }
  // ---- E/F, nearest thing wins: crates first, then portals and the zipline, doors, things to read
  const crate = nearestCrate();
  const pm = portalMarks.find((p) => flat(G.pp, p) < 1.9);
  if (crate) { /* loot/raidloot.ts handles the search */ }
  else if (pm) {
    hud.prompt(`E · ${pm.label}`);
    if (G.intent.interact) {
      if (pm.id.startsWith("zip-")) startZip(); else { sfx("door"); fadeTo(() => { G.pp.set(pm.to.x, groundHeight(pm.to.x, pm.to.z), pm.to.z); G.vel.set(0, 0, 0); }); }
    }
  } else {
    const door = doorNear(G.pp.x, G.pp.z), rd = reads.find((r) => flat(G.pp, r) < 2.1);
    if (door) { hud.prompt(doorPrompt(door.id)); if (G.intent.interact) { const msg = useDoor(door.id); if (msg) hud.toast(msg); } }
    else if (rd) { hud.prompt(`E · ${rd.label}`); if (G.intent.interact) { hud.toast(rd.text()); sfx("ui"); } }
  }
  if (G.zipping) updateZip(dt);
  // ---- the supply drop: a bandit balloon's gondola comes down with a gold crate's worth of loot
  if (drop && !drop.done && G.raidT > drop.t) {
    drop.done = true; const p = drop.at; hud.toast(`📦 A bandit supply balloon crashed near ${CLEARINGS.find((c) => c.id === p.area)?.name}! Red smoke marks it`); sfx("notice");
    const g = K.asset("supply_gondola"), gy = groundHeight(p.x, p.z);
    const obj = mergePieces(g.pieces); obj.add(g.parts.root);
    obj.position.set(p.x - 1.6, gy, p.z - 0.6); obj.rotation.y = 0.5; G.stage.scene.add(obj); drop.gondola = obj; block(p.x - 1.6, p.z - 0.6, 1.1, false, false, "drop");
    const items = rollCrate("gold", G.lootCtx, G.rng); items.forEach((id, k) => spawnPickup(id, V(p.x, p.z, 6), k, items.length)); beam(V(p.x, p.z), RAR_COLOR.rare);
    const n = 60, pos = new Float32Array(n * 3); for (let i = 0; i < n; i++) pos.set([p.x + (G.rng() - 0.5), gy + G.rng() * 8, p.z + (G.rng() - 0.5)], i * 3);
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    drop.smoke = new THREE.Points(geo, new THREE.PointsMaterial({ color: "#ff5a3a", size: 1.4, transparent: true, opacity: 0.55, depthWrite: false })); G.stage.scene.add(drop.smoke);
  }
  if (drop?.smoke) { const p = drop.smoke.geometry.attributes.position as THREE.BufferAttribute; for (let i = 0; i < p.count; i++) { let y = p.getY(i) + dt * 1.6; if (y > groundHeight(drop.at.x, drop.at.z) + 9) y -= 9; p.setY(i, y); p.setX(i, p.getX(i) + Math.sin(y + i) * dt * 0.4); } p.needsUpdate = true; }
}
const zl = ZIPLINES[0];
const zipEnds = () => ({ a: V(zl.from.x, zl.from.z, groundHeight(zl.from.x, zl.from.z) + zl.from.h), b: V(zl.to.x, zl.to.z, groundHeight(zl.to.x, zl.to.z) + zl.to.h) });
function startZip() {
  const { a, b } = zipEnds();
  G.zipping = { t: 0, len: a.distanceTo(b) }; sfx("whirr"); hud.toast("Wheee! (enemies can't touch you on the line)");
}
function updateZip(dt: number) {
  const z = G.zipping!; z.t += dt * 16 / z.len; const k = Math.min(1, z.t);
  const { a, b } = zipEnds(), zp = zipAnchors();
  G.pp.copy(a).lerp(b, k); G.pp.y -= Math.sin(k * Math.PI) * 1.2; G.moveYaw = Math.atan2(b.x - a.x, b.z - a.z); G.vel.set(0, 0, 0);
  if (zp.handle) zp.handle.position.copy(zp.a).lerp(zp.b, k);
  if (G.rng() < 0.3) sfx("whirr", 0.3);
  if (k >= 1) { G.zipping = null; G.pp.set(b.x, groundHeight(b.x, b.z + 1.6), b.z + 1.6); sfx("step"); if (zp.handle) zp.handle.position.copy(zp.a); }
}
