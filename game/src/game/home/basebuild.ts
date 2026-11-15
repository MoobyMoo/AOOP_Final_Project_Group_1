// The vault you build in (G1.5 row 17): the room shell and a 3D model per facility, both from the vault kit
// (home/vaultkit.ts, public/models/build/vault.glb), and build mode: catalog cards, a ghost that snaps to the 1 m grid
// (green fits, red blocked, the cells shown under it), R rotates, a click pays and places; click a built facility to
// move it (free) or pack it up into storage (Duckov's return: placing it again is free). Rules live in facilities.ts.
import * as THREE from "three";
import { G } from "../core/state";
import { mat } from "../render/shading";
import { sfx } from "../core/audio";
import { save } from "../core/save";
import { burst, floatText, popIn, squash } from "../../fx";
import {
  AREA, CATALOG, STARTERS, anchorAt, build, canBuild, cellsOf, centreOf, checkPlace, defOf, frontRow, move, packUp, rotFoot, tokens, builtCount,
  type FacilityDef, type Item,
} from "./facilities";
import { buildShell, sconce, vaultModel, SCONCES_N, SCONCES_E } from "./vaultkit";

// ---------------------------------------------------------------- models
/** facility id -> vault kit asset (the "blueprints" starter is fac_blueprint; the rest are fac_<id>) */
const MODEL: Record<string, string> = { blueprints: "fac_blueprint" };
/** nodes that stay hidden until something is bought (home/bunker.ts refreshFixtures shows them) */
const HIDDEN = ["fx_mag", "fx_pack", "fx_heart", "neon"];
/** moving parts: [node, rotation axis, radians per second, runs only with the generator built] */
const SPIN: [string, "x" | "z", number, boolean][] = [["press_wheel", "x", 2.6, true], ["gen_wheel", "z", -5.2, false]];
type Spinner = { o: THREE.Object3D; axis: "x" | "z"; speed: number; power: boolean };

/** one facility's model: origin at its footprint centre (rotation 0), front +z, floor y 0, inside w x d.
 *  Named nodes: fx_mag, fx_pack, fx_heart (bench) and neon (Sal) are the visible upgrades home/bunker.ts toggles;
 *  slot0..8 (trophy wall) are the shelf points; press_wheel and gen_wheel turn (animateFacilities). */
export function facilityModel(id: string): THREE.Group {
  const g = new THREE.Group(); g.name = `fac_${id}`;
  try {
    const m = vaultModel(MODEL[id] ?? `fac_${id}`); g.add(m);
    for (const n of HIDDEN) { const f = m.getObjectByName(n); if (f) f.visible = false; }
    const spin: Spinner[] = [];
    for (const [n, axis, speed, power] of SPIN) { const o = m.getObjectByName(n); if (o) spin.push({ o, axis, speed, power }); }
    if (spin.length) g.userData.spin = spin;
    const lamp = m.getObjectByName("gen_lamp"); if (lamp) g.userData.lamp = lamp;
  } catch (e) { console.warn(`facility model ${id}: vault kit missing, blockout`, e); }
  if (!g.children.length) {
    const d = defOf(id) ?? STARTERS.find((s) => s.id === id) ?? { w: 1, d: 1 };
    const m = new THREE.Mesh(new THREE.BoxGeometry(d.w - 0.2, 1, d.d - 0.2), mat("#8a7a64")); m.position.y = 0.5; m.castShadow = m.receiveShadow = true; g.add(m);
  }
  return g;
}
/** flywheels and the generator's lamp (home/bunker.ts calls this every frame with the built facilities) */
export function animateFacilities(objects: Iterable<THREE.Object3D>, dt: number, time: number, powered: boolean) {
  for (const o of objects) {
    const spin = o.userData.spin as Spinner[] | undefined;
    if (spin) for (const s of spin) if (!s.power || powered) s.o.rotation[s.axis] += s.speed * dt;
    const lamp = o.userData.lamp as THREE.Object3D | undefined;
    if (lamp) lamp.scale.setScalar(1 + 0.07 * Math.sin(time * 9));
  }
}

// ---------------------------------------------------------------- the room shell
export const LAMPS: THREE.PointLight[] = [];
/** the vault: a 33 x 25 m marble floor (one square = one build cell), panelled walls on the back and east sides (the
 *  camera side is cut away: a kerb marks it), the round vault door, sconces on the pilasters. All of it is the vault
 *  kit's shell pieces, placed by vaultkit.ts shellLayout(). */
export function buildVault(scene: THREE.Scene) {
  try { scene.add(buildShell()); }
  catch (e) { // the kit did not load: a plain floor, so the base still works
    console.warn("vault shell: kit missing, blockout floor", e);
    const W = AREA.maxX - AREA.minX + 1, D = AREA.maxZ - AREA.minZ + 1;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mat("#c9b490", { rim: 0, cookie: false })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  }
  // wall sconces and their lights, in two banks: the generator switches on the second
  const lamp = (at: THREE.Vector3, bank: number, bulb: THREE.Object3D, power = 24, reach = 16, decay = 1.3, color = "#ffcf94") => {
    const l = new THREE.PointLight(color, power, reach, decay); l.position.copy(at); l.userData.bank = bank; l.userData.bulb = bulb; scene.add(l); LAMPS.push(l);
  };
  for (const [list, q] of [[SCONCES_N, 0], [SCONCES_E, -1]] as const) for (const [along, bank] of list) {
    try { const s = sconce(along, q); scene.add(s.obj); lamp(s.light, bank, s.bulb); }
    catch { lamp(q ? new THREE.Vector3(AREA.maxX - 0.7, 3.6, along) : new THREE.Vector3(along, 3.6, AREA.minZ + 0.7), bank, new THREE.Object3D()); }
  }
  // unseen fill lights over the middle of the floor (the ceiling is out of frame)
  for (const [x, z, bank] of [[-6, 2, 0], [6, 2, 1], [-13, 6, 0], [-13, -4, 1]] as const) lamp(new THREE.Vector3(x, 5, z), bank, new THREE.Object3D(), 30, 20, 1.2, "#ffd6a8");
}

// ---------------------------------------------------------------- build mode
type Mode = "off" | "browse" | "place" | "move";
type Host = {
  scene: THREE.Scene; objects: Map<number, THREE.Object3D>;
  sync(): void;            // rebuild facility objects from the save
  money(): void;           // refresh the money chip
  exit(): void;            // build mode closed (restore the walk HUD)
};
let host: Host | null = null, mode: Mode = "off", pick: FacilityDef | null = null, rot = 0, moving: Item | null = null, selected: Item | null = null;
let ghost: THREE.Object3D | null = null, ghostId = "", tiles: THREE.InstancedMesh | null = null, grid: THREE.LineSegments | null = null, ui: HTMLDivElement | null = null;
let cursor = { x: 0, z: 0, ok: false, reason: "" }, camFocus = new THREE.Vector3(0, 0, -1), lastHover = -1;
const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
export const buildOpen = () => mode !== "off";
export const buildState = () => ({ mode, pick: pick?.id ?? null, rot, selected: selected?.uid ?? null, moving: moving?.uid ?? null, cursor: { ...cursor } });

export function openBuild(h: Host) {
  host = h; mode = "browse"; pick = null; moving = null; selected = null; rot = 0; lastHover = -1;
  // centre the floor in the part of the screen right of the blueprint cards: shift the focus 4 u to screen-left
  const yaw = G.stage.cam.yaw; camFocus.set(-4 * Math.cos(yaw), 0, -1 + 4 * Math.sin(yaw));
  grid ??= gridLines(); if (!grid.parent) h.scene.add(grid); grid.visible = true;
  tiles ??= tileMesh(); if (!tiles.parent) h.scene.add(tiles); tiles.count = 0;
  ui?.remove(); ui = document.createElement("div"); ui.className = "bld3"; document.getElementById("ui")!.appendChild(ui);
  render(); sfx("ui");
}
export function closeBuild() {
  if (mode === "off") return;
  cancelPick(); mode = "off"; selected = null;
  if (grid) grid.visible = false; if (tiles) tiles.count = 0;
  ui?.remove(); ui = null; host?.exit(); sfx("ui");
}
function cancelPick() {
  if (moving) { const o = host?.objects.get(moving.uid); if (o) o.visible = true; }
  moving = null; pick = null; setGhost(null);
}
function setGhost(id: string | null) {
  if (ghostId === id) return;
  ghost?.removeFromParent(); ghost = null; ghostId = id ?? "";
  if (!id || !host) return;
  ghost = facilityModel(id); ghost.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.material = GHOST; m.castShadow = false; m.receiveShadow = false; m.renderOrder = 3; } }); host.scene.add(ghost);
}
const GHOST = new THREE.MeshBasicMaterial({ color: "#7dff8a", transparent: true, opacity: 0.42, depthWrite: false });
function gridLines() {
  const pts: number[] = [], x0 = AREA.minX - 0.5, x1 = AREA.maxX + 0.5, z0 = AREA.minZ - 0.5, z1 = AREA.maxZ + 0.5;
  for (let x = x0; x <= x1 + 1e-6; x++) pts.push(x, 0.02, z0, x, 0.02, z1);
  for (let z = z0; z <= z1 + 1e-6; z++) pts.push(x0, 0.02, z, x1, 0.02, z);
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: "#e2bf82", transparent: true, opacity: 0.45, depthWrite: false })); l.renderOrder = 1; return l;
}
function tileMesh() {
  const t = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.9, 0.9).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }), 64);
  t.renderOrder = 2; t.frustumCulled = false; t.count = 0; return t;
}
const C_OK = new THREE.Color("#55d16a"), C_BAD = new THREE.Color("#ff5b4a"), C_FRONT = new THREE.Color("#ffd27a"), C_SEL = new THREE.Color("#45a8e6");
function paintTiles(list: { x: number; z: number; c: THREE.Color }[]) {
  if (!tiles) return; const m = new THREE.Matrix4();
  tiles.count = Math.min(64, list.length);
  for (let i = 0; i < tiles.count; i++) { m.makeTranslation(list[i].x, 0.03, list[i].z); tiles.setMatrixAt(i, m); tiles.setColorAt(i, list[i].c); }
  tiles.instanceMatrix.needsUpdate = true; if (tiles.instanceColor) tiles.instanceColor.needsUpdate = true;
}

/** start placing a catalog entry (a card click or the test hook) */
export function choose(id: string) {
  if (!host || mode === "off") return false;
  const def = defOf(id); if (!def) return false;
  const can = canBuild(G.save, id);
  if (!can.ok) { sfx("nope"); flash(can.reason); return false; }
  cancelPick(); selected = null; pick = def; mode = "place"; rot = 0; setGhost(id); sfx("ui"); render(); return true;
}
export function startMove(uid = selected?.uid) {
  const it = G.save.base.items.find((i) => i.uid === uid); if (!it || !host) return false;
  cancelPick(); moving = it; pick = defOf(it.def)!; rot = it.r; mode = "move"; selected = null;
  host.objects.get(it.uid)!.visible = false; setGhost(it.def); sfx("ui"); render(); return true;
}
export function packSelected(uid = selected?.uid) {
  const it = G.save.base.items.find((i) => i.uid === uid); if (!it || !host) return false;
  const name = defOf(it.def)!.name, at = centreOf(defOf(it.def)!, it.x, it.z, it.r);
  if (!packUp(G.save, it.uid).ok) return false;
  save(G.save); host.sync(); selected = null; mode = "browse"; sfx("pick");
  burst(new THREE.Vector3(at.x, 0.6, at.z), 16, "#e2bf82", 0.8); floatText(`${name}: packed into storage`, new THREE.Vector3(at.x, 2.4, at.z), "#fff3c4", 22);
  render(); return true;
}
/** the cell under the mouse (or under the given world point) */
function aim(): { x: number; z: number } | null {
  const m = G.input.mouse; ray.setFromCamera(new THREE.Vector2(m.x, m.y), G.stage.camera);
  return ray.ray.intersectPlane(plane, hit) ? { x: hit.x, z: hit.z } : null;
}
function uidAt(x: number, z: number) {
  const cx = Math.round(x), cz = Math.round(z);
  return G.save.base.items.find((it) => { const d = defOf(it.def); return d && cellsOf(d, it.x, it.z, it.r).some(([a, b]) => a === cx && b === cz); });
}

export function stepBuild(dt: number) {
  if (!host || mode === "off") return;
  const i = G.intent;
  // camera: WASD pans over the floor (Duckov BuilderView camera speed 10)
  const mv = new THREE.Vector3(i.move.x, 0, i.move.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), G.stage.cam.yaw);
  camFocus.addScaledVector(mv, dt * 10); camFocus.x = THREE.MathUtils.clamp(camFocus.x, AREA.minX, AREA.maxX); camFocus.z = THREE.MathUtils.clamp(camFocus.z, AREA.minZ, AREA.maxZ);
  if (i.esc) { if (mode === "place" || mode === "move") { cancelPick(); mode = "browse"; render(); sfx("ui"); } else if (selected) { selected = null; render(); } else closeBuild(); return; }
  const p = aim();
  if (mode === "place" || mode === "move") {
    if (i.reload) { rot = (rot + 1) & 3; sfx("whirr"); }
    if (!p || !pick) { if (ghost) ghost.visible = false; paintTiles([]); return; }
    const a = anchorAt(pick, rot, p.x, p.z), chk = checkPlace(G.save.base, pick, a.x, a.z, rot, moving?.uid), c = centreOf(pick, a.x, a.z, rot);
    cursor = { x: a.x, z: a.z, ok: chk.ok, reason: chk.reason };
    if (ghost) { ghost.visible = true; ghost.position.set(c.x, 0.02, c.z); ghost.rotation.y = (rot * Math.PI) / 2; GHOST.color.copy(chk.ok ? C_OK : C_BAD); }
    paintTiles([...chk.cells.map((q) => ({ x: q.x, z: q.z, c: q.ok ? C_OK : C_BAD })), ...frontRow(pick, a.x, a.z, rot).filter(([x, z]) => !pick!.decor && x >= AREA.minX && x <= AREA.maxX && z >= AREA.minZ && z <= AREA.maxZ).map(([x, z]) => ({ x, z, c: C_FRONT }))]);
    hud();
    if (i.firePressed) confirmAt(a.x, a.z, rot);
    return;
  }
  // browse: hover a built facility, click to select it
  const over = p ? uidAt(p.x, p.z) : undefined, sel = selected ?? over;
  if ((sel?.uid ?? -1) !== lastHover) { lastHover = sel?.uid ?? -1; const d = sel && defOf(sel.def); paintTiles(d && sel ? cellsOf(d, sel.x, sel.z, sel.r).map(([x, z]) => ({ x, z, c: C_SEL })) : []); }
  if (i.firePressed) { selected = over ?? null; lastHover = -2; if (over) sfx("ui"); render(); }
}
/** place the picked entry (or the moved facility) with its min-corner cell at (x, z) */
export function confirmAt(x: number, z: number, r = rot) {
  if (!host || !pick) return false;
  const def = pick, at = centreOf(def, x, z, r);
  if (mode === "move" && moving) {
    const res = move(G.save, moving.uid, x, z, r);
    if (!res.ok) { sfx("nope"); flash(res.reason); return false; }
    const uid = moving.uid; moving = null; save(G.save); host.sync(); const o = host.objects.get(uid); if (o) squash(o, 0.18, 0.28);
    sfx("thunk"); pick = null; setGhost(null); mode = "browse"; selected = null; lastHover = -2; render(); return true;
  }
  const res = build(G.save, def.id, x, z, r);
  if (!res.ok) { sfx("nope"); flash(res.reason); return false; }
  save(G.save); host.sync(); host.money();
  const o = host.objects.get(res.item.uid); if (o) popIn(o);
  burst(new THREE.Vector3(at.x, 0.4, at.z), 22, "#ffd84a", 1); G.stage.trauma = 0.15; sfx(res.paid ? "buy" : "thunk");
  floatText(res.usedToken ? `${def.name}: from storage` : res.paid ? `${def.name}: −🍌 ${res.paid}` : `${def.name}: built`, new THREE.Vector3(at.x, 2.6, at.z), "#fff3c4", 24);
  pick = null; setGhost(null); mode = "browse"; lastHover = -2; render(); return true;
}
/** the build camera: Duckov's builder view sits high over the lot (ours: the whole vault in frame) */
export function placeBuildCamera(dt: number) {
  const d = G.stage.cam.dist; G.stage.cam.dist = 50; G.stage.setFov(); G.stage.place(camFocus, dt, G.time); G.stage.cam.dist = d;
}

// ---------------------------------------------------------------- the build UI (ui3)
const BRK = `<i class="brk tl"></i><i class="brk tr"></i><i class="brk bl"></i><i class="brk br"></i>`;
function cardHtml(def: FacilityDef) {
  const can = canBuild(G.save, def.id), stock = tokens(G.save, def.id), n = builtCount(G.save.base, def.id);
  const price = can.free ? `<span class="bfree">In storage ×${stock}</span>` : def.cost ? `🍌 ${def.cost}` : `<span class="bfree">Free</span>`;
  const cls = can.ok ? "" : n >= def.maxCount ? " built" : can.reason.startsWith("Needs 🍌") ? " poor" : " locked";
  return `<button class="bcard${cls}${pick?.id === def.id ? " on" : ""}" data-b="${def.id}" aria-label="${def.name}">
    <span class="bt"><b>${def.name}</b><span class="bp num">${price}</span></span>
    <small>${def.does}</small>
    <span class="bf"><span class="num">${def.w}×${def.d}</span>${def.decor ? "<span>Decor</span>" : ""}<span class="bs">${can.ok ? (def.maxCount > 1 ? `${n} of ${def.maxCount} built` : "Ready to place") : can.reason}</span></span></button>`;
}
function render() {
  if (!ui) return;
  // Duckov's selection panel: entries you can take first, the ones you can't afford or haven't unlocked at the end
  const order = [...CATALOG].sort((a, b) => Number(!canBuild(G.save, a.id).ok) - Number(!canBuild(G.save, b.id).ok));
  const sel = selected && defOf(selected.def);
  ui.innerHTML = `<div class="bld3-cat">${BRK}<header><h2>Blueprints</h2><small class="num">🍌 ${G.save.money}</small></header><div class="tie"></div>
      <div class="bcards">${order.map(cardHtml).join("")}</div></div>
    <div class="bld3-hud${mode === "browse" && !sel ? " idle" : ""}"></div>
    <div class="bld3-keys">${mode === "place" || mode === "move" ? `<span><kbd>Click</kbd>${mode === "move" ? "Move here (free)" : "Build here"}</span><span><kbd>R</kbd>Rotate</span><span><kbd>Esc</kbd>Cancel</span>` : `<span><kbd>Click</kbd>a card, or a built facility</span>${sel ? `<span><kbd>M</kbd>Move</span><span><kbd>X</kbd>Pack up</span>` : ""}<span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>Look around</span><span><kbd>B</kbd> or <kbd>Esc</kbd>Done</span>`}</div>`;
  ui.querySelectorAll<HTMLButtonElement>("[data-b]").forEach((b) => (b.onclick = () => choose(b.dataset.b!)));
  hud();
}
let flashMsg = "", flashT = 0;
function flash(msg: string) { flashMsg = msg; flashT = performance.now(); hud(); }
function hud() {
  const el = ui?.querySelector<HTMLDivElement>(".bld3-hud"); if (!el) return;
  const recent = performance.now() - flashT < 1800 ? flashMsg : "";
  const sel = selected && defOf(selected.def);
  let html = "";
  if ((mode === "place" || mode === "move") && pick) {
    const can = canBuild(G.save, pick.id), cost = mode === "move" ? "Moving is free" : can.free ? "From storage: free" : pick.cost ? `Costs 🍌 ${pick.cost}` : "Free";
    html = `<b>${pick.name}</b><span class="num">${cost}</span><em class="${cursor.ok ? "ok" : "bad"}">${cursor.ok ? "Fits" : cursor.reason || "Point at the floor"}</em>`;
  } else if (sel && selected) html = `<b>${sel.name}</b><span>${sel.does}</span><span class="bact"><button data-h="move">Move</button><button data-h="pack" class="ghost">Pack up</button></span><em class="dim">Packing up keeps it in storage. Placing it again is free; the bananas aren't refunded.</em>`;
  else html = `<span>Pick a blueprint, then click the floor. Built things can be moved or packed up.</span>`;
  if (recent) html += `<em class="bad flash">${recent}</em>`;
  if (el.dataset.h !== html) { el.dataset.h = html; el.innerHTML = BRK + html; el.querySelector<HTMLButtonElement>('[data-h="move"]')?.addEventListener("click", () => startMove()); el.querySelector<HTMLButtonElement>('[data-h="pack"]')?.addEventListener("click", () => packSelected()); }
}
// M moves and X / Delete packs up the selected facility (keys the shared Intent doesn't carry)
addEventListener("keydown", (e) => {
  if (mode !== "browse" || !selected || G.scene !== "bunker") return;
  const k = e.key.toLowerCase();
  if (k === "m") startMove(); else if (k === "x" || k === "delete") packSelected();
});
export const buildDebug = () => ({ ...buildState(), rotFoot, ghost: !!ghost?.visible });
