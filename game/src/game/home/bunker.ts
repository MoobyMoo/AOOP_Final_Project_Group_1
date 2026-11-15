// The vault under Exile Beach (G1.5 rows 17 and 33): a big walkable floor that starts nearly empty. You arrive in the
// Banana Express pod; the locker and mirror, the blueprint desk and the departures board are the only fixtures.
// Everything else is built (home/facilities.ts rules, home/basebuild.ts models and build mode): the Fence's window
// (sell), the workbench (upgrades, repairs), Sal's desk (his job, then his shop), the trophy wall, the first-aid kiosk
// and the ammo press (crafting), safe-deposit walls (stash), the generator (power), decor. Walk up, press E. No modal
// menus for walking around (advisor 27); stations open the ui3 ledger plates.
import { attachmentDef } from "../loot/attachments";
import { refreshGun } from "../combat/gunstats";
import * as THREE from "three";
import { G, V } from "../core/state";
import { sfx } from "../core/audio";
import { itemDef } from "../loot/raidloot";
import { createRig } from "../actors/rig";
import { createKingpin, createGunFx } from "../combat/kingpin";
import { save } from "../core/save";
import { floatText, burst, initFx, updateFx, popIn, squash, tween, easeInOut } from "../../fx";
import { U } from "../render/shading";
import { PLAYER } from "../combat/weapons";
import { iconHtml } from "../ui/itemicon";
import { PRICES as LOOT_PRICES } from "../loot/tables";
import { equipDef } from "../loot/equipment";
import { sellEquip, repairAll } from "../loot/equipment-actions";
import { repairBill } from "../ui/equipui";
import { openLoot, closeLoot, lootOpen, lootSwallowsInteract } from "../ui/lootview";
import { AREA, STARTERS, SPAWN, RECIPES, canCraft, cellsOf, centreOf, craft, defOf, has, occupancy, powered, rotFoot, stashCapacity, stashUsed, type StationId } from "./facilities";
import { buildVault, facilityModel, animateFacilities, LAMPS, openBuild, closeBuild, buildOpen, stepBuild, placeBuildCamera, choose, confirmAt, startMove, packSelected, buildState } from "./basebuild";
import { makePod, makeBoard, destinationsHtml, confirmHtml, showCurtain, POD_DOOR_OPEN, POD_GAUGE_REST, type Pod, type Board } from "./dispatch";
import { deploy, destOf, type DeployRequest } from "../core/deployment";

export const bunkerScene = new THREE.Scene();
bunkerScene.background = new THREE.Color("#1d1a17");
// prices from Sol's economy sim (loot/tables.ts PRICES; gate: a median first raid buys one upgrade, all three take 4 raids)
export const PRICES = { mag: LOOT_PRICES.upgrades.mag, pack: LOOT_PRICES.upgrades.pack, heart: LOOT_PRICES.upgrades.heart, ammo8: LOOT_PRICES.ammo8, bandage: LOOT_PRICES.bandage, smoothie: LOOT_PRICES.smoothie };
const ORDER = { id: "sal1", from: "Smuggler Sal", text: "Bring me 3 Vine Rope and 1 Old Gear. I'll move my shop in next door. No questions asked.", need: { vine_rope: 3, old_gear: 1 } as Record<string, number>, reward: "Sal moves in (ammo + heals for sale) and a neon BANANA BANK sign" };
/** a place you can press E at: a starter fixture or a built facility. rect = its footprint in world space */
export type Station = { id: StationId; x: number; z: number; label: string; rect: { x0: number; x1: number; z0: number; z1: number }; uid?: number };
export const stations: Station[] = [];

// ---------------------------------------------------------------- the room and what stands in it
let built = false, pod: Pod | null = null, board: Board | null = null, salRig: ReturnType<typeof createRig> | null = null;
const objects = new Map<number, THREE.Object3D>(), trophies = new THREE.Group();
let blocked = new Set<string>();
const rectOf = (def: { w: number; d: number }, x: number, z: number, r: number) => { const c = centreOf(def, x, z, r), f = rotFoot(def.w, def.d, r); return { x0: c.x - f.w / 2, x1: c.x + f.w / 2, z0: c.z - f.d / 2, z1: c.z + f.d / 2 }; };
function placeObj(o: THREE.Object3D, def: { w: number; d: number }, x: number, z: number, r: number) { const c = centreOf(def, x, z, r); o.position.set(c.x, 0, c.z); o.rotation.y = (r * Math.PI) / 2; }
export function buildRoom() {
  if (built) return; built = true;
  buildVault(bunkerScene); bunkerScene.add(trophies);
  for (const s of STARTERS) {
    let o: THREE.Object3D;
    if (s.id === "pod") { pod = makePod(); o = pod.root; }
    else if (s.id === "board") { board = makeBoard(); o = board.root; }
    else o = facilityModel(s.id);
    placeObj(o, s, s.x, s.z, s.r); bunkerScene.add(o);
  }
}
/** rebuild the facility objects, stations, collision cells and fixtures from the save */
function sync() {
  const items = G.save.base.items, live = new Set(items.map((i) => i.uid));
  for (const [uid, o] of objects) if (!live.has(uid)) { o.removeFromParent(); objects.delete(uid); }
  for (const it of items) {
    const def = defOf(it.def)!; let o = objects.get(it.uid);
    if (!o || o.userData.def !== it.def) { o?.removeFromParent(); o = facilityModel(it.def); o.userData.def = it.def; objects.set(it.uid, o); bunkerScene.add(o); }
    placeObj(o, def, it.x, it.z, it.r);
  }
  stations.length = 0;
  for (const s of STARTERS) { const c = centreOf(s, s.x, s.z, s.r); stations.push({ id: s.station, x: c.x, z: c.z, label: s.label, rect: rectOf(s, s.x, s.z, s.r) }); }
  for (const it of items) { const d = defOf(it.def)!; if (!d.station) continue; const c = centreOf(d, it.x, it.z, it.r); stations.push({ id: d.station, x: c.x, z: c.z, label: d.label!, rect: rectOf(d, it.x, it.z, it.r), uid: it.uid }); }
  blocked = new Set(occupancy(G.save.base).keys());
  refreshFixtures(); board?.refresh(G.save);
}
const facObj = (id: string) => { const it = G.save.base.items.find((i) => i.def === id); return it ? objects.get(it.uid) ?? null : null; };
function refreshFixtures() {
  const s = G.save, bench = facObj("bench"), sal = facObj("sal");
  const show = (o: THREE.Object3D | null, name: string, on: boolean) => { const f = o?.getObjectByName(name); if (f) f.visible = on; };
  show(bench, "fx_mag", s.upgrades.mag > 0); show(bench, "fx_pack", s.upgrades.pack > 0); show(bench, "fx_heart", s.upgrades.heart > 0); show(sal, "neon", s.salMovedIn);
  // Sal stands behind his desk once he has moved in (and the desk is built)
  if (s.salMovedIn && sal) {
    salRig ??= createRig("monkey", { kind: "bandit", seed: 77 });
    sal.updateMatrixWorld(true); salRig.root.position.copy(sal.localToWorld(new THREE.Vector3(0.1, 0, -0.3))); salRig.root.rotation.y = sal.rotation.y;
    if (!salRig.root.parent) bunkerScene.add(salRig.root);
  } else salRig?.root.removeFromParent();
  // trophies on the wall's shelf slots
  trophies.clear(); const wall = facObj("trophy");
  if (wall) {
    wall.updateMatrixWorld(true); const slots: THREE.Vector3[] = [];
    wall.traverse((o) => { if (/^slot\d$/.test(o.name)) slots.push(o.getWorldPosition(new THREE.Vector3())); });
    const fwd = new THREE.Vector3(Math.sin(wall.rotation.y), 0, Math.cos(wall.rotation.y)).multiplyScalar(0.12); // a hair in front of the shelf back
    s.trophies.forEach((t, i) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTex(itemDef(t).icon) })); sp.scale.setScalar(0.55); const at = slots[i % Math.max(1, slots.length)] ?? wall.position.clone().setY(1.2); sp.position.copy(at).add(fwd).setY(at.y + 0.3); trophies.add(sp); });
  }
  // the generator switches on the second bank of ceiling lamps
  const on = powered(s);
  for (const l of LAMPS) { const live = l.userData.bank === 0 || on; l.visible = live; (l.userData.bulb as THREE.Mesh).visible = live; }
  G.stage.hemi.intensity = on ? 1.35 : 1.15;
}
function iconTex(icon: string) { const c = document.createElement("canvas"); c.width = c.height = 96; const x = c.getContext("2d")!; x.font = "72px serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(icon, 48, 52); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }

// ---------------------------------------------------------------- the home visit
let panel: HTMLDivElement | null = null, onDeploy: (req: DeployRequest) => void = () => {}, onMirror: () => void = () => {};
const pp = new THREE.Vector3(), vel = new THREE.Vector3(); let face = 0, launching = false, lift = 0, squish = 1;
export function enterBunker(deploy: (req: DeployRequest) => void, mirror: () => void, summary?: string) {
  onDeploy = deploy; onMirror = mirror; launching = false; lift = 0; squish = 1; buildRoom();
  G.scene = "bunker"; G.stage.setScene(bunkerScene, false); bunkerScene.fog = null; initFx(bunkerScene, G.stage.camera);
  G.stage.hemi.intensity = 1.2; G.stage.sun.intensity = 2.2; G.stage.bounce.intensity = 0.5;
  if (!G.rig) { G.rig = createRig("monkey", G.save.look); G.gun = createKingpin(); G.fx = createGunFx(bunkerScene); G.rig.sockets.handR.add(G.gun.root); }
  G.rig.setLook?.(G.save.look); G.gear = { ...G.save.gear }; G.rig.setGear?.(G.save.gear); G.pack = []; bunkerScene.add(G.rig.root); G.gun.root.visible = false; // holstered at home (the raid shows it each frame)
  G.rig.root.scale.setScalar(1);
  pp.set(SPAWN.x, 0, SPAWN.z); vel.set(0, 0, 0); face = 0; G.rig.root.position.copy(pp);
  if (pod) { pod.door.rotation.y = POD_DOOR_OPEN; pod.gauge.rotation.z = POD_GAUGE_REST; }
  sync(); drawHud();
  if (summary) showPanel(summary, "result");
}
export function leaveBunker() { closeBuild(); closePanel(); squish = 1; lift = 0; G.rig?.root.scale.setScalar(1); // the raid shares the rig: undo the pod's stretch
  G.stage.hemi.intensity = Number(new URLSearchParams(location.search).get("fill") ?? 0.9); G.stage.sun.intensity = Number(new URLSearchParams(location.search).get("sun") ?? 6); G.stage.bounce.intensity = Number(new URLSearchParams(location.search).get("bounce") ?? 1.6); }
function drawHud() {
  const empty = !G.save.base.items.length;
  const ui = document.getElementById("ui")!; ui.innerHTML = `<div class="home-top"><div class="place"><b>The Vault</b><span>Under Exile Beach</span></div><span class="home-chips"><span class="home-stash num" title="Stash slots used">Stash <b>${stashUsed(G.save)}</b>/${stashCapacity(G.save)}</span><span class="home-money">🍌 <b>${G.save.money}</b></span></span></div><div class="hud-prompt" id="hp"></div>
    ${empty ? `<div class="home-tip">Your vault is empty. Press <kbd>B</kbd> or use the blueprint desk to build. The Fence's window and the workbench are free.</div>` : ""}
    <div class="home-hint"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> walk &nbsp;<kbd>E</kbd> use &nbsp;<kbd>B</kbd> build</div>`;
}
function money() { const el = document.querySelector(".home-money b"); if (el) el.textContent = String(G.save.money); const st = document.querySelector(".home-stash"); if (st) st.innerHTML = `Stash <b>${stashUsed(G.save)}</b>/${stashCapacity(G.save)}`; }
const BRK = `<i class="brk tl"></i><i class="brk tr"></i><i class="brk bl"></i><i class="brk br"></i>`;
// UI v3: every station is the same pinstripe plate as the raid screens (brass brackets, tie stripe under the title)
function showPanel(html: string, cls = "") { closePanel(); panel = document.createElement("div"); panel.className = "panel " + cls; panel.innerHTML = (cls === "result" ? html : BRK + html.replace("</header>", `</header><div class="tie"></div>`)) + `<div class="foot"><kbd>E</kbd> or <kbd>Esc</kbd> to close</div>`; document.getElementById("ui")!.appendChild(panel); panel.style.pointerEvents = "auto"; panel.querySelectorAll<HTMLButtonElement>("button[data-a]").forEach((b) => b.onclick = () => act(b.dataset.a!)); }
function closePanel() { panel?.remove(); panel = null; closeLoot(); }
function openBuildMode() {
  closePanel(); vel.set(0, 0, 0);
  openBuild({ scene: bunkerScene, objects, sync: () => { sync(); money(); }, money, exit: () => { drawHud(); } });
  document.querySelector(".home-tip")?.remove();
}
addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() !== "b" || e.repeat || G.scene !== "bunker" || G.bot || launching) return;
  if (buildOpen()) closeBuild(); else if (!panel && !lootOpen()) openBuildMode();
});
let near: Station | null = null;
const rectDist = (r: Station["rect"], p: { x: number; z: number }) => Math.hypot(Math.max(r.x0 - p.x, 0, p.x - r.x1), Math.max(r.z0 - p.z, 0, p.z - r.z1));
/** keep the player out of occupied cells and inside the vault floor (radius 0.35) */
function collide() {
  const R = 0.35;
  pp.x = THREE.MathUtils.clamp(pp.x, AREA.minX - 0.5 + R, AREA.maxX + 0.5 - R); pp.z = THREE.MathUtils.clamp(pp.z, AREA.minZ - 0.5 + R, AREA.maxZ + 0.5 - R);
  for (let pass = 0; pass < 2; pass++) for (let cx = Math.round(pp.x) - 1; cx <= Math.round(pp.x) + 1; cx++) for (let cz = Math.round(pp.z) - 1; cz <= Math.round(pp.z) + 1; cz++) {
    if (!blocked.has(`${cx},${cz}`)) continue;
    const qx = THREE.MathUtils.clamp(pp.x, cx - 0.5, cx + 0.5), qz = THREE.MathUtils.clamp(pp.z, cz - 0.5, cz + 0.5), dx = pp.x - qx, dz = pp.z - qz, d = Math.hypot(dx, dz);
    if (d >= R) continue;
    if (d > 1e-5) { pp.x = qx + (dx / d) * R; pp.z = qz + (dz / d) * R; }
    else { const ox = pp.x - cx, oz = pp.z - cz; if (Math.abs(ox) > Math.abs(oz)) pp.x = cx + Math.sign(ox || 1) * (0.5 + R); else pp.z = cz + Math.sign(oz || 1) * (0.5 + R); }
  }
}
export function stepBunker(dt: number) {
  const i = G.intent; G.time += dt; U.uTime.value = G.time;
  if (launching) return;
  if (buildOpen()) { stepBuild(dt); return; }
  if (lootOpen() || lootSwallowsInteract()) return; // the locker (ui/lootview.ts) owns Esc and E while open
  if (panel) { if (i.esc || i.interact) { closePanel(); sfx("ui"); } return; }
  const mv = new THREE.Vector3(i.move.x, 0, i.move.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), G.stage.cam.yaw);
  vel.lerp(mv.multiplyScalar(PLAYER.speed), Math.min(1, dt * 12)); pp.addScaledVector(vel, dt); collide();
  if (vel.lengthSq() > 0.1) face = Math.atan2(vel.x, vel.z);
  near = stations.reduce<Station | null>((b, s) => (rectDist(s.rect, pp) < 1.15 && (!b || rectDist(s.rect, pp) < rectDist(b.rect, pp)) ? s : b), null);
  const hp = document.getElementById("hp"); if (hp) { hp.innerHTML = near ? `<kbd>E</kbd> ${near.id === "sal" ? (G.save.salMovedIn ? "Smuggler Sal: ammo and heals" : "Sal's desk: his job") : near.label}` : ""; hp.classList.toggle("on", !!near); }
  if (near && i.interact) { sfx("ui"); open(near); }
}
export function renderBunker(dt: number) {
  G.rig.root.position.copy(pp); G.rig.root.position.y += lift; G.rig.root.rotation.y = face;
  G.rig.root.scale.set(1 / Math.sqrt(squish), squish, 1 / Math.sqrt(squish));
  G.rig.pose({ time: G.time, speed: launching ? 0 : vel.length(), moveYaw: face, faceYaw: face, action: !launching && vel.lengthSq() > 0.1 ? "run" : "idle", actionT: 0, armed: "none", flash: 0 });
  if (salRig?.root.parent) salRig.pose({ time: G.time + 3, speed: 0, moveYaw: salRig.root.rotation.y, faceYaw: Math.atan2(pp.x - salRig.root.position.x, pp.z - salRig.root.position.z), action: "idle", actionT: 0, armed: "none", flash: 0 });
  updateFx(dt); animateFacilities(objects.values(), dt, G.time, powered(G.save));
  if (buildOpen()) { placeBuildCamera(dt); return; }
  const f = (launching ? new THREE.Vector3(0, 0, -9.5) : pp.clone()).setY(0.5).add(V(0, -1.2)); const d = G.stage.cam.dist; G.stage.cam.dist = 32; G.stage.setFov(); G.stage.place(f, dt, G.time); G.stage.cam.dist = d;
}
const head = (title: string, sub = "") => `<header><h2>${title}</h2>${sub ? `<small>${sub}</small>` : ""}</header>`;
const cell = (i: string) => `<div class="cell" style="--rar:var(--rar-${itemDef(i).rarity})" title="${itemDef(i).name}">${iconHtml(i, 54)}<span class="v">${itemDef(i).value}</span></div>`;
function open(s: Station) {
  const sv = G.save;
  if (s.id === "deploy") return showPanel(destinationsHtml(sv), "dest");
  if (s.id === "blueprints") return openBuildMode();
  if (s.id === "locker") return openLocker();
  if (s.id === "trophies") return showPanel(`${head("Trophy wall", `${sv.raids} raids`)}${sv.trophies.length ? `<div class="grid">${sv.trophies.map(cell).join("")}</div>` : `<p class="dim">Nothing yet. Bring home something legendary.</p>`}
    <div class="stats" style="margin-top:12px"><div class="stat"><b>${sv.stats.extracts}</b><span>made it home</span></div><div class="stat"><b>${sv.stats.bonkOuts}</b><span>bonked</span></div><div class="stat"><b>🍌 ${sv.stats.best}</b><span>best haul</span></div></div>`);
  if (s.id === "sell") { const items = sv.reserved.filter((i) => itemDef(i).kind !== "key"); const v = items.reduce((a, i) => a + itemDef(i).value, 0);
    return showPanel(`${head("The Fence", `${items.length} items in your stash`)}<p class="quote">"I don't ask where it came from."</p>${items.length ? `<div class="grid">${items.map(cell).join("")}</div><div class="total"><span>Stash value</span><b>🍌 ${v}</b></div><div class="actions"><button data-a="sellAll">Sell everything for 🍌 ${v}</button></div>` : `<p class="dim">Your stash is empty. Go get some loot.</p>`}${gearSaleHtml()}`); }
  if (s.id === "bench") return showPanel(benchHtml());
  if (s.id === "sal") return showPanel(sv.salMovedIn ? salShopHtml() : orderHtml());
  if (s.id === "med" || s.id === "press") return showPanel(craftHtml(s.id));
  if (s.id === "stash") return showPanel(`${head("Safe-deposit wall", `${stashUsed(sv)} of ${stashCapacity(sv)} slots used`)}<p class="quote">"Every box has a key. Most of them are yours."</p>
    <div class="stats"><div class="stat"><b>${sv.reserved.length}</b><span>loot waiting</span></div><div class="stat"><b>${sv.locker.length}</b><span>gear in the locker</span></div><div class="stat"><b>${stashCapacity(sv)}</b><span>slots</span></div></div>
    <p class="dim">Crafting and Sal's shop stop when the stash is full. Each safe-deposit wall adds 12 slots.</p>`);
  if (s.id === "generator") return showPanel(`${head("Vault generator", "running")}<p class="quote">"Don't touch the red one."</p><p>It powers the ammo press and the second bank of ceiling lamps.${has(sv, "press") ? " The press is running." : " Build the Coin-Op Ammo Press to use the power."}</p>`);
}
function salShopHtml() {
  const sv = G.save;
  return `${head("Smuggler Sal", "cash only")}<p class="quote">"Ammo, bandages, smoothies."</p><div class="rows">
    <div class="row"><b>8 rounds of .45</b><small>You carry ${sv.ammo} rounds into the next raid (16 minimum).</small><button class="act" data-a="buyAmmo">🍌 ${PRICES.ammo8}</button></div>
    <div class="row"><b>Banana-leaf bandage</b><small>Heals 15, quick to use</small><button class="act" data-a="buyBandage">🍌 ${PRICES.bandage}</button></div>
    <div class="row"><b>Banana smoothie</b><small>Heals 40, slow to drink</small><button class="act" data-a="buySmoothie">🍌 ${PRICES.smoothie}</button></div></div>`;
}
function craftHtml(at: "med" | "press") {
  const sv = G.save, list = RECIPES.filter((r) => r.at === at);
  const rows = list.map((r) => {
    const can = canCraft(sv, r), need = Object.entries(r.inputs).map(([id, n]) => `${n} ${itemDef(id).name} (${sv.reserved.filter((x) => x === id).length} in stash)`).join(", ");
    const wanted = !sv.salMovedIn && Object.keys(r.inputs).some((id) => ORDER.need[id]) ? ". Sal's job needs this too" : "";
    return `<div class="row"><b>${r.out === "ammo" ? "🔸" : iconHtml(r.out, 26)} ${r.name}</b><small>From ${need}${wanted}${can.ok ? "" : `. ${can.reason}`}</small><button class="act" data-a="craft:${r.id}" ${can.ok ? "" : "disabled"}>Make</button></div>`;
  }).join("");
  return at === "med" ? `${head("First-aid kiosk", `${stashUsed(sv)}/${stashCapacity(sv)} stash`)}<p class="quote">"Wrap it tight. Drink it slow."</p><div class="rows">${rows}</div><p class="dim" style="margin-top:10px">Heals you make wait in the stash; up to three come along on the next raid.</p>`
    : `${head("Coin-op ammo press", powered(sv) ? "powered" : "no power")}<p class="quote">"Insert spring. Pull lever. Count to eight."</p><div class="rows">${rows}</div><p class="dim" style="margin-top:10px">You carry ${sv.ammo} rounds into the next raid.</p>`;
}
/** the locker (G1-23): the shared loot screen (ui/lootview.ts) with the locker as the target: what you wear on the
 *  left, stored gear on the right, the leather tag in the middle. Double-click or drag to swap. */
function openLocker() {
  closePanel();
  openLoot({ name: "Locker", items: G.save.locker, search: null, kind: "locker", sub: "Found gear comes home here", actions: [{ label: "Change your look", run: () => { closeLoot(); act("look"); } }] });
}
function gearSaleHtml() {
  const rows = G.save.locker.map((inst, i) => ({ inst, i, d: equipDef(inst), a: attachmentDef(inst) })).filter((r) => (r.d && !r.d.bound) || r.a);
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
  return `${head("Workbench", `🍌 ${G.save.money} to spend`)}<div class="rows">${row("mag", "Extended Mag", "A magazine attachment: the Kingpin holds 12 rounds instead of 8" + (G.save.gun.mag === "att_mag_ext" || G.save.locker.includes("att_mag_ext") ? ". You already have one" : ""))}${row("pack", "Bigger Pack", "2 more pack slots")}${row("heart", "Banana Breakfast", "25 more max HP")}${repairRow()}</div><p class="dim" style="margin-top:10px">🔒 Contraband Carbine arrives with the Smuggler Caves.</p>`;
}
function orderHtml() {
  const rows = Object.entries(ORDER.need).map(([k, n]) => { const have = Math.min(n, G.save.reserved.filter((i) => i === k).length); return `<div class="row"><b>${itemDef(k).icon} ${itemDef(k).name}</b><small>${have} of ${n} in your stash</small><em class="act" style="color:${have >= n ? "var(--leaf)" : "var(--dim)"}">${have >= n ? "Ready" : `${n - have} to go`}</em></div>`; }).join("");
  const ready = Object.entries(ORDER.need).every(([k, n]) => G.save.reserved.filter((i) => i === k).length >= n);
  return `${head(`${ORDER.from}'s job`)}<p class="quote">"${ORDER.text}"</p><div class="rows">${rows}</div><p class="dim" style="margin-top:10px">Reward: ${ORDER.reward}</p>${ready ? `<div class="actions"><button data-a="deliver">Deliver</button></div>` : ""}`;
}
/** where floating text rises for a facility (its object, or the spawn if it isn't built) */
const atFac = (id: string, up = 2.4) => { const o = facObj(id); return o ? o.position.clone().setY(up) : V(SPAWN.x, SPAWN.z, up); };

// ---------------------------------------------------------------- leaving: the Banana Express
/** Launch: pay once (core/deployment.ts refuses a second call while one is pending), wait 0.5 s (Duckov's
 *  MapSelectionView delay), then the pod: step in, the door swings shut, the gauge climbs, squash, whoosh up the pipe,
 *  and the curtain. onDeploy (main.ts) builds the raid behind the curtain. */
function launch(id: string, instant = false) {
  if (launching) return;
  const r = deploy(id, G.save, save);
  if (!r.ok) { sfx("nope"); floatText(r.reason, V(0, -9, 2.6), "#ffb648", 22); return; }
  launching = true; panel?.querySelectorAll("button").forEach((b) => (b.disabled = true)); closePanel(); money(); board?.refresh(G.save);
  if (r.req.paid) floatText(`Fare −🍌 ${r.req.paid}`, V(0, -9, 3), "#fff3c4", 24);
  if (instant) { onDeploy(r.req); return; }
  setTimeout(() => podSequence(r.req), 500);
}
function podSequence(req: DeployRequest) {
  const from = pp.clone(), into = new THREE.Vector3(0, 0, -11), p = pod!;
  sfx("step");
  tween(0.45, (k) => { pp.lerpVectors(from, into, easeInOut(k)); lift = Math.sin(k * Math.PI) * 0.25 + k * 0.4; face = 0; }, () => {
    sfx("door");
    tween(0.25, (k) => { p.door.rotation.y = POD_DOOR_OPEN * (1 - k); p.gauge.rotation.z = POD_GAUGE_REST - k * 1.2; });
    tween(0.35, (k) => { squish = 1 - 0.28 * Math.sin(k * Math.PI * 0.5); p.gauge.rotation.z = 0.7 - k * 2.2; }, () => {
      sfx("thunk"); sfx("dash"); squash(p.root, 0.08, 0.3); G.stage.trauma = 0.3; burst(new THREE.Vector3(0, 0.6, -11), 26, "#f3ead6", 1.2);
      tween(0.4, (k) => { squish = 0.72 + k * 0.8; lift = 0.4 + k * k * 11; }, () => {
        showCurtain(req.name, destOf(req.destinationId)?.region ?? "");
        setTimeout(() => onDeploy(req), 120);
      });
    }, 0.25);
  });
}
function act(a: string) {
  const sv = G.save;
  if (a === "deploy") return launch("beach", true);        // the pacing bot and old callers: straight to the beach
  if (a.startsWith("deploy:")) return launch(a.slice(7), true);
  if (a === "dests") return showPanel(destinationsHtml(sv), "dest");
  if (a.startsWith("dest:")) { sfx("ui"); return showPanel(confirmHtml(a.slice(5), sv), "dest confirm"); }
  if (a.startsWith("launch:")) return launch(a.slice(7));
  if (a === "look") { closePanel(); onMirror(); return; }
  if (a.startsWith("craft:")) { const ok = craft(sv, a.slice(6)); if (ok) { save(sv); sfx("buy"); money(); const r = RECIPES.find((q) => q.id === a.slice(6))!; const o = facObj(r.at); if (o) squash(o, 0.12, 0.25); floatText(`+ ${r.name}`, atFac(r.at), "#fff3c4", 24); } else sfx("nope"); open(stations.find((q) => q.id === RECIPES.find((r) => r.id === a.slice(6))?.at)!); return; }
  if (a.startsWith("sellGear:")) { const got = sellEquip(+a.slice(9)); if (got > 0) { sfx("cash"); money(); floatText(`+🍌 ${got}`, atFac("fence"), "#ffd84a", 26); } else sfx("nope"); const st = stations.find((q) => q.id === "sell"); if (st) open(st); return; }
  if (a === "repairAll") { const paid = repairAll(); if (paid > 0) { sfx("buy"); money(); floatText(`Gear repaired: 🍌 ${paid}`, atFac("bench"), "#fff3c4", 24); } else sfx("nope"); const st = stations.find((q) => q.id === "bench"); if (st) open(st); return; }
  if (a === "sellAll") {
    const items = sv.reserved.filter((i) => itemDef(i).kind !== "key"); const v = items.reduce((x, i) => x + itemDef(i).value, 0);
    sv.reserved = sv.reserved.filter((i) => itemDef(i).kind === "key");
    let shown = 0; const start = sv.money; sv.money += v; save(sv);
    const tick = () => { shown = Math.min(v, shown + Math.max(1, Math.ceil(v / 30))); const el = document.querySelector(".home-money b"); if (el) el.textContent = String(start + shown); sfx("cash"); if (shown < v) setTimeout(tick, 33); else money(); };
    tick(); closePanel(); burst(atFac("fence", 1.4), 20, "#ffd84a", 1); floatText(`+🍌 ${v}`, atFac("fence"), "#ffd84a", 30); return;
  }
  if (a.startsWith("up:")) {
    const k = a.slice(3) as "mag" | "pack" | "heart", c = PRICES[k][sv.upgrades[k]]; if (c === undefined || sv.money < c) { sfx("nope"); return; }
    sv.money -= c; sv.upgrades[k]++;
    if (k === "mag") { if (!sv.gun.mag) sv.gun.mag = "att_mag_ext"; else sv.locker.push("att_mag_ext"); refreshGun(); } // the bench builds the magazine attachment: fitted, or into the locker if a mag is on
    save(sv); sfx("buy"); money(); refreshFixtures(); closePanel();
    const f = facObj("bench")?.getObjectByName(`fx_${k}`);
    if (f) { popIn(f, 0, 0.42, f.scale.x || 1); burst(f.getWorldPosition(new THREE.Vector3()), 24, "#ffd84a", 1); }
    G.stage.trauma = 0.2;
    floatText({ mag: "Extended Mag!", pack: "Bigger Pack!", heart: "Banana Breakfast!" }[k], atFac("bench", 3), "#fff3c4", 30); return;
  }
  if (a === "deliver") {
    for (const [k, n] of Object.entries(ORDER.need)) for (let j = 0; j < n; j++) sv.reserved.splice(sv.reserved.indexOf(k), 1);
    sv.salMovedIn = true; sv.money += 40; save(sv); sfx("rare"); refreshFixtures(); closePanel(); money();
    const f = facObj("sal")?.getObjectByName("neon"); if (f) popIn(f, 0, 0.42, f.scale.x || 1); G.stage.trauma = 0.3; floatText("Sal moved in! +🍌 40", atFac("sal", 3), "#ffd84a", 30); return;
  }
  const buy = (cost: number, grow: number, f: () => void) => {
    if (sv.money < cost) { sfx("nope"); return; }
    if (grow && stashUsed(sv) + grow > stashCapacity(sv)) { sfx("nope"); floatText("Stash full", atFac("sal"), "#ffb648", 24); return; }
    sv.money -= cost; f(); save(sv); sfx("buy"); money(); const st = stations.find((s) => s.id === "sal"); if (st) open(st);
  };
  if (a === "buyAmmo") buy(PRICES.ammo8, 0, () => { sv.ammo += 8; });
  if (a === "buyBandage") buy(PRICES.bandage, 1, () => { sv.reserved.push("bandage"); });
  if (a === "buySmoothie") buy(PRICES.smoothie, 1, () => { sv.reserved.push("smoothie"); });
}
/** a cell's screen position in CSS px (tests drive the build UI with the real mouse) */
function cellToScreen(x: number, z: number) {
  G.stage.camera.updateMatrixWorld(); const v = new THREE.Vector3(x, 0, z).project(G.stage.camera);
  return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
}
export const homeApi = {
  act, open: (id: string) => { const s = stations.find((q) => q.id === id); if (s) open(s); }, panelOpen: () => !!panel || lootOpen() || buildOpen() || launching, pos: pp,
  refresh: () => { sync(); money(); }, stations: () => stations.map(({ id, x, z, uid }) => ({ id, x, z, uid })), launching: () => launching,
  build: { open: () => openBuildMode(), close: closeBuild, choose, confirmAt, startMove, packSelected, state: buildState, cellToScreen, cells: (uid: number) => { const it = G.save.base.items.find((i) => i.uid === uid); const d = it && defOf(it.def); return d && it ? cellsOf(d, it.x, it.z, it.r) : []; } },
};
