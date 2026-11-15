// The bunker under Exile Beach: a walkable 3D room, no modal menus (advisor 27). Walk up to a station and press E:
// the fence's counter (sell everything, count-up), workbench (3 upgrades, each adds a visible fixture), order board
// (Smuggler Sal's job), the mirror (character creator), trophies, and the ladder (island map → deploy).
// PLACEHOLDER room art until Fable C2's bunker set lands; station logic stays here.
import * as THREE from "three";
import { G, V, flat } from "../core/state";
import { mat } from "../render/shading";
import { sfx } from "../core/audio";
import { itemDef, RAR_COLOR } from "../loot/raidloot";
import { createRig } from "../actors/rig";
import { createKingpin, createGunFx } from "../combat/kingpin";
import { save } from "../core/save";
import { floatText, burst, initFx, updateFx, popIn } from "../../fx";
import { U } from "../render/shading";
import { PLAYER } from "../combat/weapons";
import { iconHtml } from "../ui/itemicon";
import { PRICES as LOOT_PRICES } from "../loot/tables";
import { visualGear, equipDef } from "../loot/equipment";
import { bunkerRoom, buildReady, piecesToObject } from "../world/kit_build";
import { equipFromLocker, unequip, sellEquip, repairAll } from "../loot/equipment-actions";
import { dollHtml, itemCell, detailsHtml, gearSummary, repairBill } from "../ui/equipui";
import type { WearSlot } from "../contracts";

export const bunkerScene = new THREE.Scene();
bunkerScene.background = new THREE.Color("#2a2420");
// prices from Sol's economy sim (loot/tables.ts PRICES; gate: a median first raid buys one upgrade, all three take 4 raids)
export const PRICES = { mag: LOOT_PRICES.upgrades.mag, pack: LOOT_PRICES.upgrades.pack, heart: LOOT_PRICES.upgrades.heart, ammo8: LOOT_PRICES.ammo8, bandage: LOOT_PRICES.bandage, smoothie: LOOT_PRICES.smoothie };
const ORDER = { id: "sal1", from: "Smuggler Sal", text: "Bring me 3 Vine Rope and 1 Old Gear. I'll move my shop in next door. No questions asked.", need: { vine_rope: 3, old_gear: 1 } as Record<string, number>, reward: "Sal moves in (ammo + heals for sale) and a neon BANANA BANK sign" };
type Station = { id: "sell" | "bench" | "orders" | "ladder" | "mirror" | "sal" | "trophies"; x: number; z: number; label: string; obj?: THREE.Object3D };
export const stations: Station[] = [
  { id: "sell", x: -4.5, z: -2.6, label: "The Fence: sell your haul" },
  { id: "bench", x: 0.5, z: -3.4, label: "Workbench: upgrades" },
  { id: "orders", x: 4.6, z: -2.8, label: "Order board" },
  { id: "mirror", x: -6.2, z: 1.6, label: "Mirror and locker: your look and your gear" },
  { id: "trophies", x: 6.4, z: 1.4, label: "Trophy shelf" },
  { id: "ladder", x: 0, z: 3.4, label: "Ladder: back to the island" },
];
let built = false; const fixtures = new Map<string, THREE.Object3D>(); let salRig: ReturnType<typeof createRig> | null = null;
function box(w: number, h: number, d: number, c: string, x: number, y: number, z: number, parent: THREE.Object3D = bunkerScene) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c)); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; }
export function buildRoom() {
  if (built) return; built = true;
  if (buildReady()) return buildKitRoom();
  box(16, 0.2, 10, "#8a7a64", 0, -0.1, 0); // floor
  box(16, 4, 0.4, "#7a5f44", 0, 2, -5.2); box(0.4, 4, 10, "#6e5640", -8.2, 2, 0); box(0.4, 4, 10, "#6e5640", 8.2, 2, 0); // back + side walls (front cut away)
  for (const x of [-6, -2, 2, 6]) { box(0.3, 4, 0.3, "#5a4430", x, 2, -4.9); box(0.3, 0.3, 10, "#5a4430", x, 3.9, 0); }
  // stations
  const sell = new THREE.Group(); box(3, 1.1, 1, "#9a7348", 0, 0.55, 0, sell); box(3.2, 0.12, 1.2, "#6e4b2e", 0, 1.15, 0, sell); box(2.6, 1.6, 0.15, "#3a3030", 0, 2.3, -0.4, sell); const bell = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8, 0, 6.3, 0, 1.6), mat("#ffd84a", { rough: 0.3 })); bell.position.set(0.9, 1.22, 0.2); sell.add(bell);
  sell.position.set(-4.5, 0, -4.1); bunkerScene.add(sell);
  const bench = new THREE.Group(); box(2.6, 0.15, 1.1, "#a8763f", 0, 1.0, 0, bench); for (const x of [-1.1, 1.1]) box(0.15, 1, 0.9, "#6e4b2e", x, 0.5, 0, bench); box(0.4, 0.3, 0.3, "#5a5a62", -0.8, 1.2, 0, bench); bench.position.set(0.5, 0, -4.4); bunkerScene.add(bench);
  const board = new THREE.Group(); box(2.2, 1.6, 0.1, "#b8905e", 0, 2.0, 0, board); for (let i = 0; i < 4; i++) box(0.5, 0.6, 0.02, ["#fff3d6", "#ffe0a0", "#fff3d6", "#ffd0c0"][i], -0.6 + (i % 2) * 1.0, 2.2 - Math.floor(i / 2) * 0.7, 0.06, board); board.position.set(4.6, 0, -4.95); bunkerScene.add(board);
  const mirror = new THREE.Group(); box(1.2, 2.2, 0.12, "#c9a35c", 0, 1.4, 0, mirror); const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.0), new THREE.MeshStandardMaterial({ color: "#bfe3ff", roughness: 0.05, metalness: 0.6 })); glass.position.set(0, 1.4, 0.07); mirror.add(glass); mirror.position.set(-7.9, 0, 1.6); mirror.rotation.y = Math.PI / 2; bunkerScene.add(mirror);
  const shelf = new THREE.Group(); box(0.5, 2.4, 2.2, "#7a5a3c", 0, 1.2, 0, shelf); shelf.position.set(7.9, 0, 1.4); bunkerScene.add(shelf); fixtures.set("shelf", shelf);
  const ladder = new THREE.Group(); for (const x of [-0.4, 0.4]) box(0.08, 4.2, 0.08, "#8a6a42", x, 2.1, 0, ladder); for (let y = 0.4; y < 4; y += 0.45) box(0.8, 0.06, 0.06, "#8a6a42", 0, y, 0, ladder); ladder.position.set(0, 0, 4.7); bunkerScene.add(ladder);
  box(0.9, 0.1, 2, "#6a7a5a", -6.6, 0.4, -2.6); box(1.8, 0.4, 0.9, "#9a8a6a", -6.6, 0.25, 3.8); // a crate desk and a cot
  // lights: warm bulbs on a string
  for (let i = 0; i < 7; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffd27a").multiplyScalar(2.5) })); b.position.set(-7 + i * 2.33, 3.6 - Math.sin((i / 6) * Math.PI) * 0.3, -1); bunkerScene.add(b); }
  const lamp = new THREE.PointLight("#ffc27a", 30, 16, 1.4); lamp.position.set(0, 3.4, 0); bunkerScene.add(lamp);
  // upgrade fixtures (hidden until bought)
  const rack = new THREE.Group(); box(1.4, 0.9, 0.1, "#5a4430", 0, 0, 0, rack); box(0.9, 0.15, 0.12, "#2a2a30", 0, 0.1, 0.08, rack); rack.position.set(2.3, 2.3, -4.95); fixtures.set("mag", rack);
  const hook = new THREE.Group(); const pk = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10), mat("#8a5a34")); pk.scale.set(1, 1.2, 0.7); hook.add(pk); hook.position.set(-2, 2.2, -4.7); fixtures.set("pack", hook);
  const table = new THREE.Group(); box(1.4, 0.08, 0.9, "#a8763f", 0, 0.8, 0, table); for (const [x, z] of [[-0.6, -0.35], [0.6, -0.35], [-0.6, 0.35], [0.6, 0.35]]) box(0.08, 0.8, 0.08, "#6e4b2e", x, 0.4, z, table); for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.2, 4, 8), mat("#f2cc3b")); b.position.set(-0.3 + k * 0.2, 0.9, 0); b.rotation.z = 1.4; table.add(b); } table.position.set(4.8, 0, 2.4); fixtures.set("heart", table);
  const neon = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.7), new THREE.MeshBasicMaterial({ map: neonTex(), transparent: true })); neon.position.set(-1.6, 3.0, -4.95); fixtures.set("neon", neon);
  for (const [, f] of fixtures) if (f !== shelf) { f.visible = false; bunkerScene.add(f); }
}
/** the Blender bunker (Fable C2b, kit_build.bunkerRoom): stations stand at BUNKER_SPOTS, fixtures are its hidden groups */
function buildKitRoom() {
  const b = bunkerRoom(); bunkerScene.add(piecesToObject(b.pieces, "bunker"), b.parts.root);
  for (const id of ["mag", "pack", "heart", "neon"]) fixtures.set(id, b.parts[id]);
  const shelf = new THREE.Group(); shelf.name = "shelf"; bunkerScene.add(shelf); fixtures.set("shelf", shelf);
  trophySlots = Array.from({ length: 9 }, (_, i) => b.parts[`slot${i}`]?.getWorldPosition(new THREE.Vector3())).filter((v): v is THREE.Vector3 => !!v);
  const lights = Object.keys(b.parts).filter((k) => /light/i.test(k)).slice(0, 3); // a few warm lamps; the rest is baked AO + the bulbs' glow
  for (const k of lights) { const l = new THREE.PointLight("#ffc27a", 18, 12, 1.4); b.parts[k].getWorldPosition(l.position); bunkerScene.add(l); }
  if (!lights.length) { const lamp = new THREE.PointLight("#ffc27a", 30, 16, 1.4); lamp.position.set(0, 3.4, 0); bunkerScene.add(lamp); }
}
let trophySlots: THREE.Vector3[] = [];
function neonTex() { const c = document.createElement("canvas"); c.width = 512; c.height = 112; const x = c.getContext("2d")!; x.font = "bold 70px Trebuchet MS"; x.textAlign = "center"; x.textBaseline = "middle"; x.shadowColor = "#ffd84a"; x.shadowBlur = 24; x.fillStyle = "#fff6b0"; x.fillText("BANANA BANK", 256, 58); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
function refreshFixtures() {
  const s = G.save;
  fixtures.get("mag")!.visible = s.upgrades.mag > 0; fixtures.get("pack")!.visible = s.upgrades.pack > 0; fixtures.get("heart")!.visible = s.upgrades.heart > 0; fixtures.get("neon")!.visible = s.salMovedIn;
  if (s.salMovedIn && !salRig) { salRig = createRig("monkey", { kind: "bandit", seed: 77 }); salRig.root.position.set(6.6, 0, -2.4); salRig.root.rotation.y = -0.6; bunkerScene.add(salRig.root); stations.push({ id: "sal", x: 6.2, z: -1.6, label: "Smuggler Sal: ammo and heals" }); }
  // trophies on the shelf
  const shelf = fixtures.get("shelf")!; shelf.children.filter((c) => c.name === "trophy").forEach((c) => c.removeFromParent());
  s.trophies.forEach((t, i) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTex(itemDef(t).icon) })); sp.name = "trophy"; sp.scale.setScalar(0.6);
    if (trophySlots.length) { const at = trophySlots[i % trophySlots.length]; sp.position.set(at.x, at.y + 0.3, at.z); } else sp.position.set(0.3, 0.6 + (i % 3) * 0.7, -0.7 + Math.floor(i / 3) * 0.7); shelf.add(sp); });
}
function iconTex(icon: string) { const c = document.createElement("canvas"); c.width = c.height = 96; const x = c.getContext("2d")!; x.font = "72px serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(icon, 48, 52); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }

// ---------------------------------------------------------------- the home visit
let panel: HTMLDivElement | null = null, onDeploy: () => void = () => {}, onMirror: () => void = () => {};
const pp = new THREE.Vector3(), vel = new THREE.Vector3(); let face = Math.PI;
export function enterBunker(deploy: () => void, mirror: () => void, summary?: string) {
  onDeploy = deploy; onMirror = mirror; buildRoom(); refreshFixtures();
  G.scene = "bunker"; G.stage.setScene(bunkerScene, false); bunkerScene.fog = null; initFx(bunkerScene, G.stage.camera);
  G.stage.hemi.intensity = 1.4; G.stage.sun.intensity = 2.5; G.stage.bounce.intensity = 0.5;
  if (!G.rig) { G.rig = createRig("monkey", G.save.look); G.gun = createKingpin(); G.fx = createGunFx(bunkerScene); G.rig.sockets.handR.add(G.gun.root); }
  G.rig.setLook?.(G.save.look); G.gear = { ...G.save.gear }; G.rig.setGear?.(G.save.gear); G.pack = []; bunkerScene.add(G.rig.root); G.gun.root.visible = false; // holstered at home (the raid shows it each frame)
  pp.set(0, 0, 2.4); vel.set(0, 0, 0); G.rig.root.position.copy(pp);
  const ui = document.getElementById("ui")!; ui.innerHTML = `<div class="home-top"><div class="place"><b>The Bunker</b><span>Under Exile Beach</span></div><span class="home-money">🍌 <b>${G.save.money}</b></span></div><div class="hud-prompt" id="hp"></div><div class="home-hint"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> walk &nbsp;<kbd>E</kbd> use a station</div>`;
  if (summary) showPanel(summary, "result");
}
export function leaveBunker() { closePanel(); G.stage.hemi.intensity = Number(new URLSearchParams(location.search).get("fill") ?? 0.9); G.stage.sun.intensity = Number(new URLSearchParams(location.search).get("sun") ?? 6); G.stage.bounce.intensity = Number(new URLSearchParams(location.search).get("bounce") ?? 1.6); }
function money() { const el = document.querySelector(".home-money b"); if (el) el.textContent = String(G.save.money); }
function showPanel(html: string, cls = "") { closePanel(); panel = document.createElement("div"); panel.className = "panel " + cls; panel.innerHTML = html + `<div class="foot"><kbd>E</kbd> or <kbd>Esc</kbd> to close</div>`; document.getElementById("ui")!.appendChild(panel); panel.style.pointerEvents = "auto"; panel.querySelectorAll<HTMLButtonElement>("button[data-a]").forEach((b) => b.onclick = () => act(b.dataset.a!)); }
function closePanel() { panel?.remove(); panel = null; }
let near: Station | null = null;
export function stepBunker(dt: number) {
  const i = G.intent; G.time += dt; U.uTime.value = G.time;
  if (panel) { if (i.esc || i.interact) { closePanel(); sfx("ui"); } return; }
  const mv = new THREE.Vector3(i.move.x, 0, i.move.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), G.stage.cam.yaw);
  vel.lerp(mv.multiplyScalar(PLAYER.speed), Math.min(1, dt * 12)); pp.addScaledVector(vel, dt);
  pp.x = THREE.MathUtils.clamp(pp.x, -7.4, 7.4); pp.z = THREE.MathUtils.clamp(pp.z, -3.6, 4.2);
  if (vel.lengthSq() > 0.1) face = Math.atan2(vel.x, vel.z);
  near = stations.reduce<Station | null>((b, s) => (flat(s, pp) < 1.8 && (!b || flat(s, pp) < flat(b, pp)) ? s : b), null);
  const hp = document.getElementById("hp"); if (hp) { hp.innerHTML = near ? `<kbd>E</kbd> ${near.label}` : ""; hp.classList.toggle("on", !!near); }
  if (near && i.interact) { sfx("ui"); open(near); }
}
export function renderBunker(dt: number) {
  G.rig.root.position.copy(pp); G.rig.root.rotation.y = face;
  G.rig.pose({ time: G.time, speed: vel.length(), moveYaw: face, faceYaw: face, action: vel.lengthSq() > 0.1 ? "run" : "idle", actionT: 0, armed: "none", flash: 0 });
  if (salRig) salRig.pose({ time: G.time + 3, speed: 0, moveYaw: -0.6, faceYaw: Math.atan2(pp.x - 6.6, pp.z + 2.4), action: "idle", actionT: 0, armed: "none", flash: 0 });
  updateFx(dt);
  const f = pp.clone().setY(0.5).add(V(0, -1.2)); G.stage.cam.dist = 26; G.stage.place(f, dt, G.time); G.stage.cam.dist = 40;
}
const head = (title: string, sub = "") => `<header><h2>${title}</h2>${sub ? `<small>${sub}</small>` : ""}</header>`;
const cell = (i: string) => `<div class="cell" style="--rbg:var(--r-${itemDef(i).rarity})" title="${itemDef(i).name}">${iconHtml(i, 44)}<span class="v">${itemDef(i).value}</span></div>`;
function open(s: Station) {
  const sv = G.save;
  if (s.id === "ladder") return showPanel(islandMap());
  if (s.id === "mirror") return openLocker();
  if (s.id === "trophies") return showPanel(`${head("Trophy shelf", `${sv.raids} raids`)}${sv.trophies.length ? `<div class="grid">${sv.trophies.map(cell).join("")}</div>` : `<p class="dim">Nothing yet. Bring home something legendary.</p>`}
    <div class="stats" style="margin-top:12px"><div class="stat"><b>${sv.stats.extracts}</b><span>made it home</span></div><div class="stat"><b>${sv.stats.bonkOuts}</b><span>bonked</span></div><div class="stat"><b>🍌 ${sv.stats.best}</b><span>best haul</span></div></div>`);
  if (s.id === "sell") { const items = sv.reserved.filter((i) => itemDef(i).kind !== "key"); const v = items.reduce((a, i) => a + itemDef(i).value, 0);
    return showPanel(`${head("The Fence", `${items.length} items in your stash`)}<p class="quote">"I don't ask where it came from."</p>${items.length ? `<div class="grid">${items.map(cell).join("")}</div><div class="total"><span>Stash value</span><b>🍌 ${v}</b></div><div class="actions"><button data-a="sellAll">Sell everything for 🍌 ${v}</button></div>` : `<p class="dim">Your stash is empty. Go get some loot.</p>`}${gearSaleHtml()}`); }
  if (s.id === "bench") return showPanel(benchHtml());
  if (s.id === "orders") return showPanel(orderHtml());
  if (s.id === "sal") return showPanel(`${head("Smuggler Sal", "cash only")}<p class="quote">"Ammo, bandages, smoothies."</p><div class="rows">
    <div class="row"><b>8 rounds of .45</b><small>You carry ${sv.ammo} rounds into the next raid (16 minimum).</small><button class="act" data-a="buyAmmo">🍌 ${PRICES.ammo8}</button></div>
    <div class="row"><b>Banana-leaf bandage</b><small>Heals 15, quick to use</small><button class="act" data-a="buyBandage">🍌 ${PRICES.bandage}</button></div>
    <div class="row"><b>Banana smoothie</b><small>Heals 40, slow to drink</small><button class="act" data-a="buySmoothie">🍌 ${PRICES.smoothie}</button></div></div>`);
}
/** the locker (G1-23): what you wear + the gear kept at home; click to swap. The mirror button opens the creator. */
function openLocker() {
  const sv = G.save, g = gearSummary(sv.gear);
  let cells = ""; const n = Math.max(12, Math.ceil(sv.locker.length / 6) * 6); for (let i = 0; i < n; i++) cells += itemCell(sv.locker[i], i, { src: "locker" });
  showPanel(`${head("Mirror and locker", `🛡 body ${g.body}, head ${g.head}`)}<div class="inv-body locker"><section><h4>Wearing</h4>${dollHtml(sv.gear)}</section><section><h4>Locker <small>${sv.locker.length} pieces</small></h4><div class="grid">${cells}</div></section></div>
    <div class="inv-detail">${detailsHtml(null)}</div><div class="actions"><button data-a="look">Change your look</button></div><p class="dim" style="margin-top:8px">Found gear is lost to your satchel if you get bonked. Pieces marked ★ are yours for good.</p>`, "inv");
  const p = panel!, detail = p.querySelector(".inv-detail") as HTMLElement;
  p.querySelectorAll<HTMLElement>("[data-locker]").forEach((b) => { const i = +b.dataset.locker!, inst = sv.locker[i];
    b.onmouseenter = () => { detail.innerHTML = detailsHtml(inst, "Click to wear it"); }; b.onclick = () => { if (equipFromLocker(i)) { sfx("ui"); G.rig.setGear?.(sv.gear); save(sv); openLocker(); } else sfx("nope"); }; });
  p.querySelectorAll<HTMLElement>("[data-slot]").forEach((b) => { const slot = b.dataset.slot as WearSlot, inst = sv.gear[slot];
    b.onmouseenter = () => { detail.innerHTML = detailsHtml(inst, inst ? "Click to put it in the locker" : ""); }; b.onclick = () => { if (inst && unequip(slot)) { sfx("ui"); G.rig.setGear?.(sv.gear); save(sv); openLocker(); } else sfx("nope"); }; });
}
function gearSaleHtml() {
  const rows = G.save.locker.map((inst, i) => ({ inst, i, d: equipDef(inst) })).filter((r) => r.d && !r.d.bound);
  if (!rows.length) return "";
  return `<h4 style="margin:16px 0 8px">Spare gear from your locker</h4><div class="rows">${rows.map(({ inst, i }) => { const d = itemDef(inst); return `<div class="row"><b>${iconHtml(inst, 26)} ${d.name}</b><small>${detailsLine(inst)}</small><button class="act" data-a="sellGear:${i}">🍌 ${d.value}</button></div>`; }).join("")}</div>`;
}
const detailsLine = (inst: string) => { const c = /#(\d+)/.exec(inst); return c ? `Condition ${c[1]}%: worth less when worn` : "Like new"; };
function repairRow() {
  const bill = repairBill(G.save.gear, G.save.locker);
  return `<div class="row"><b>Patch up your gear</b><small>${bill ? "Repairs every worn and stored piece to full condition" : "All your gear is in top shape"}</small>${bill ? `<button class="act" data-a="repairAll" ${G.save.money < bill ? "disabled" : ""}>🍌 ${bill}</button>` : `<em class="act">Done</em>`}</div>`;
}
function benchHtml() {
  const u = G.save.upgrades, row = (k: "mag" | "pack" | "heart", name: string, desc: string) => { const lvl = u[k], c = PRICES[k][lvl]; return `<div class="row"><b>${name}</b><small>${desc}</small>${c === undefined ? `<em class="act">Done</em>` : `<button class="act" data-a="up:${k}" ${G.save.money < c ? "disabled" : ""}>🍌 ${c}</button>`}</div>`; };
  return `${head("Workbench", `🍌 ${G.save.money} to spend`)}<div class="rows">${row("mag", "Extended Mag", "Kingpin holds 12 rounds instead of 8" + (G.save.fixtures.includes("extended_mag") ? ". You already found one in the vault" : ""))}${row("pack", "Bigger Pack", "2 more pack slots")}${row("heart", "Banana Breakfast", "25 more max HP")}${repairRow()}</div><p class="dim" style="margin-top:10px">🔒 Contraband Carbine arrives with the Smuggler Caves.</p>`;
}
function orderHtml() {
  if (G.save.salMovedIn) return `${head("Order board")}<p>Sal's job is done. New jobs arrive with new regions.</p>`;
  const rows = Object.entries(ORDER.need).map(([k, n]) => { const have = Math.min(n, G.save.reserved.filter((i) => i === k).length); return `<div class="row"><b>${itemDef(k).icon} ${itemDef(k).name}</b><small>${have} of ${n} in your stash</small><em class="act" style="color:${have >= n ? "var(--leaf)" : "var(--dim)"}">${have >= n ? "Ready" : `${n - have} to go`}</em></div>`; }).join("");
  const ready = Object.entries(ORDER.need).every(([k, n]) => G.save.reserved.filter((i) => i === k).length >= n);
  return `${head(`${ORDER.from}'s job`)}<p class="quote">"${ORDER.text}"</p><div class="rows">${rows}</div><p class="dim" style="margin-top:10px">Reward: ${ORDER.reward}</p>${ready ? `<div class="actions"><button data-a="deliver">Deliver</button></div>` : ""}`;
}
function islandMap() {
  return `${head("The island", "pick where to raid")}<div class="island">
    <div class="reg on" style="left:30%;top:58%"><b>Banana Grove</b>bandits, wild monkeys, the Sleeper<br><button data-a="deploy">Raid</button></div>
    <div class="reg off" style="left:64%;top:40%"><b>Smuggler Caves</b>🔒 later</div>
    <div class="reg off" style="left:22%;top:22%"><b>Old Prison Fortress</b>🔒 later</div>
    <div class="reg off" style="left:72%;top:13%"><b>The Volcano</b>🔒 later</div>
    <svg class="routes" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M38 62 L66 44 M36 60 L26 28 M66 44 L74 18 M28 26 L72 16"/></svg></div>`;
}
function act(a: string) {
  const sv = G.save;
  if (a === "deploy") { closePanel(); save(sv); onDeploy(); return; }
  if (a === "look") { closePanel(); onMirror(); return; }
  if (a.startsWith("sellGear:")) { const got = sellEquip(+a.slice(9)); if (got > 0) { sfx("cash"); money(); floatText(`+🍌 ${got}`, V(-4.5, -3.8, 2.4), "#ffd84a", 26); } else sfx("nope"); open(stations.find((q) => q.id === "sell")!); return; }
  if (a === "repairAll") { const paid = repairAll(); if (paid > 0) { sfx("buy"); money(); floatText(`Gear repaired: 🍌 ${paid}`, V(0.5, -3.4, 2.4), "#fff3c4", 24); } else sfx("nope"); open(stations.find((q) => q.id === "bench")!); return; }
  if (a === "sellAll") {
    const items = sv.reserved.filter((i) => itemDef(i).kind !== "key"); const v = items.reduce((x, i) => x + itemDef(i).value, 0);
    sv.reserved = sv.reserved.filter((i) => itemDef(i).kind === "key");
    let shown = 0; const start = sv.money; sv.money += v; save(sv);
    const tick = () => { shown = Math.min(v, shown + Math.max(1, Math.ceil(v / 30))); const el = document.querySelector(".home-money b"); if (el) el.textContent = String(start + shown); sfx("cash"); if (shown < v) setTimeout(tick, 33); };
    tick(); closePanel(); burst(V(-4.5, -3.8, 1.4), 20, "#ffd84a", 1); floatText(`+🍌 ${v}`, V(-4.5, -3.8, 2.4), "#ffd84a", 30); return;
  }
  if (a.startsWith("up:")) {
    const k = a.slice(3) as "mag" | "pack" | "heart", c = PRICES[k][sv.upgrades[k]]; if (c === undefined || sv.money < c) { sfx("nope"); return; }
    sv.money -= c; sv.upgrades[k]++; save(sv); sfx("buy"); money(); refreshFixtures(); closePanel();
    const f = fixtures.get(k)!; popIn(f); burst(f.getWorldPosition(new THREE.Vector3()), 24, "#ffd84a", 1); G.stage.trauma = 0.2;
    floatText({ mag: "Extended Mag!", pack: "Bigger Pack!", heart: "Banana Breakfast!" }[k], f.getWorldPosition(new THREE.Vector3()).add(V(0, 0, 1)), "#fff3c4", 30); return;
  }
  if (a === "deliver") {
    for (const [k, n] of Object.entries(ORDER.need)) for (let j = 0; j < n; j++) sv.reserved.splice(sv.reserved.indexOf(k), 1);
    sv.salMovedIn = true; sv.money += 40; save(sv); sfx("rare"); refreshFixtures(); closePanel(); money();
    const f = fixtures.get("neon")!; popIn(f); G.stage.trauma = 0.3; floatText("Sal moved in! +🍌 40", V(6, -2, 3), "#ffd84a", 30); return;
  }
  const buy = (cost: number, f: () => void) => { if (sv.money < cost) { sfx("nope"); return; } sv.money -= cost; f(); save(sv); sfx("buy"); money(); open(stations.find((s) => s.id === "sal")!); };
  if (a === "buyAmmo") buy(PRICES.ammo8, () => { sv.ammo += 8; });
  if (a === "buyBandage") buy(PRICES.bandage, () => { sv.reserved.push("bandage"); });
  if (a === "buySmoothie") buy(PRICES.smoothie, () => { sv.reserved.push("smoothie"); });
}
export const homeApi = { act, open: (id: string) => { const s = stations.find((q) => q.id === id); if (s) open(s); }, panelOpen: () => !!panel, pos: pp };
