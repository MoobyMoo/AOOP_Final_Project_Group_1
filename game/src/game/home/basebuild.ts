// The vault you build in (G1.5 row 17): the room shell, a 3D model per facility (from the structures and house
// kits, blockouts where no model exists yet), and build mode: catalog cards, a ghost that snaps to the 1 m grid
// (green fits, red blocked, the cells shown under it), R rotates, a click pays and places; click a built facility to
// move it (free) or pack it up into storage (Duckov's return: placing it again is free). Rules live in facilities.ts.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { G } from "../core/state";
import { mat, patch } from "../render/shading";
import { sfx } from "../core/audio";
import { save } from "../core/save";
import { asset, piecesToObject } from "../world/kit_build";
import { houseModule } from "../world/kit_house";
import { bake, kitMaterial } from "../world/kitutil";
import { burst, floatText, popIn, squash } from "../../fx";
import {
  AREA, CATALOG, STARTERS, anchorAt, build, canBuild, cellsOf, centreOf, checkPlace, defOf, frontRow, move, packUp, rotFoot, tokens, builtCount,
  type FacilityDef, type Item,
} from "./facilities";

// ---------------------------------------------------------------- models
/** a kit asset as one Object3D, recentred on its footprint (x/z centre of its bounds, floor at y 0), turned so its
 *  front faces +z (yaw), scaled by s. Parts stay addressable by name. */
function kit(name: string, o: { house?: boolean; yaw?: number; s?: number; x?: number; z?: number; y?: number } = {}) {
  const b = o.house ? houseModule(name) : asset(name);
  const g = new THREE.Group(); g.name = name;
  const body = piecesToObject(b.pieces, name); body.add(b.parts.root); // parts.root sits at the asset origin, same space as the pieces
  const box = new THREE.Box3().setFromObject(body), c = box.getCenter(new THREE.Vector3());
  body.position.set(-c.x, -box.min.y, -c.z);
  const turn = new THREE.Group(); turn.add(body); turn.rotation.y = o.yaw ?? 0; turn.scale.setScalar(o.s ?? 1);
  g.add(turn); g.position.set(o.x ?? 0, o.y ?? 0, o.z ?? 0);
  g.userData.parts = b.parts;
  return g;
}
const M_ = (c: string, rough = 0.8) => mat(c, { rough });
function box(w: number, h: number, d: number, c: string, x: number, y: number, z: number, parent: THREE.Object3D, rough = 0.8) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M_(c, rough)); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
}
/** the safe-deposit wall: a steel cabinet of small brass-knobbed doors (blockout, one merged mesh) */
function depositWall() {
  const geos: THREE.BufferGeometry[] = [], B = (w: number, h: number, d: number, c: string, x: number, y: number, z: number) => geos.push(bake(new THREE.BoxGeometry(w, h, d), c, new THREE.Matrix4().makeTranslation(x, y, z)));
  B(2.8, 2.3, 0.7, "#4b5558", 0, 1.15, -0.1); B(2.9, 0.12, 0.8, "#c29a5b", 0, 2.36, -0.1); B(2.9, 0.12, 0.8, "#2c3133", 0, 0.06, -0.1);
  for (let r = 0; r < 5; r++) for (let c = 0; c < 6; c++) {
    const x = -1.12 + c * 0.448, y = 0.38 + r * 0.4;
    B(0.4, 0.34, 0.04, (r + c) % 3 ? "#6a777b" : "#7c898c", x, y, 0.27);
    geos.push(bake(new THREE.SphereGeometry(0.035, 8, 6), "#e2bf82", new THREE.Matrix4().makeTranslation(x + 0.12, y, 0.31)));
  }
  const g = new THREE.Group(); const m = new THREE.Mesh(mergeAll(geos), kitMaterial("matte")); m.castShadow = m.receiveShadow = true; g.add(m); return g;
}
/** the coin-op ammo press (blockout): a cast base, two columns, a crossbeam, the ram, a flywheel and an outlet tray */
function ammoPress() {
  const g = new THREE.Group();
  box(1.5, 0.55, 1.0, "#3b4246", 0, 0.28, -0.1, g); box(1.2, 0.08, 0.8, "#c29a5b", 0, 0.59, -0.1, g, 0.35);
  for (const x of [-0.55, 0.55]) box(0.16, 1.5, 0.16, "#2e3336", x, 1.35, -0.25, g);
  box(1.35, 0.3, 0.4, "#c29a5b", 0, 2.15, -0.25, g, 0.35); box(0.3, 0.7, 0.3, "#9a7a48", 0, 1.65, -0.25, g, 0.4);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.07, 10, 28), M_("#8a6a3a", 0.4)); wheel.position.set(0.86, 1.4, -0.25); wheel.rotation.y = Math.PI / 2; wheel.castShadow = true; g.add(wheel); wheel.name = "flywheel";
  for (let i = 0; i < 4; i++) box(0.05, 0.95, 0.05, "#8a6a3a", 0.86, 1.4, -0.25, g).rotation.x = (i * Math.PI) / 4;
  box(0.6, 0.12, 0.4, "#5a4a32", 0, 0.68, 0.5, g); // outlet tray
  const a = kit("ammo_box", { s: 0.8, x: -0.45, z: 0.55, y: 0 }); g.add(a);
  return g;
}
const mergeAll = (geos: THREE.BufferGeometry[]) => mergeGeometries(geos, false)!;
function postBoard(w: number, h: number, y: number, z: number, parent: THREE.Object3D) {
  for (const x of [-w / 2 + 0.06, w / 2 - 0.06]) box(0.1, y + h, 0.1, "#5a4430", x, (y + h) / 2, z, parent);
  return box(w, h, 0.08, "#6e5640", 0, y + h / 2, z - 0.02, parent);
}

/** one facility's model: origin at its footprint centre (rotation 0), front +z, floor y 0, inside w x d.
 *  Named children are the visible upgrades home/bunker.ts toggles: fx_mag, fx_pack, fx_heart (bench), neon (Sal). */
export function facilityModel(id: string): THREE.Group {
  const g = new THREE.Group(); g.name = `fac_${id}`;
  try {
    if (id === "fence") g.add(kit("bunker_counter", { z: 0.1 }));
    else if (id === "bench") {
      g.add(kit("bunker_workbench", { z: 0.25 }));
      postBoard(2.8, 1.6, 0.9, -0.8, g);
      const mag = kit("bunker_fx_mag", { x: -0.45, y: 1.2, z: -0.66 }); mag.name = "fx_mag"; g.add(mag);
      const pack = kit("bunker_fx_pack", { x: 0.95, y: 0.95, z: -0.6, s: 0.75 }); pack.name = "fx_pack"; g.add(pack);
      const heart = kit("banana_stash", { x: 0.95, y: 1.0, z: 0.4, s: 0.55 }); heart.name = "fx_heart"; g.add(heart);
    } else if (id === "sal") {
      g.add(kit("desk", { house: true, z: 0.45 }));
      g.add(kit("shelf_files", { house: true, z: -0.78, x: -0.9, s: 0.8 }));
      g.add(kit("bunker_pinboard", { y: 1.0, z: -0.88, x: 0.55, s: 0.6 }));
      const neon = kit("bunker_fx_neon", { y: 2.55, z: -0.9, s: 0.72 }); neon.name = "neon"; g.add(neon);
    } else if (id === "trophy") g.add(kit("bunker_shelf", { yaw: Math.PI / 2, z: -0.1 }));
    else if (id === "med") {
      g.add(kit("table", { house: true, x: -0.55 }));
      g.add(kit("cont_medical", { x: -0.55, y: 1.0, s: 0.95 }));
      g.add(kit("cabinet", { house: true, x: 1.0, s: 1.15 }));
    } else if (id === "stash") g.add(depositWall());
    else if (id === "generator") {
      g.add(kit("generator", { house: true, s: 1.7, z: -0.15 }));
      g.add(kit("drum", { house: true, x: 0.62, z: 0.55, s: 0.85 }));
      box(0.12, 1.6, 0.12, "#2e3336", -0.75, 0.8, -0.7, g); box(0.12, 0.12, 0.7, "#2e3336", -0.75, 1.55, -0.35, g);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffd27a").multiplyScalar(2.4), toneMapped: false })); bulb.position.set(-0.75, 1.7, -0.7); g.add(bulb);
    } else if (id === "press") g.add(ammoPress());
    else if (id === "desk") { g.add(kit("bunker_desk", { yaw: -Math.PI / 2, z: 0.15 })); g.add(kit("chair", { house: true, z: -0.7, x: 0.4 })); }
    else if (id === "plant") g.add(kit("plant", { house: true, s: 0.72 }));
    else if (id === "locker") {
      for (const x of [-1.05, -0.4]) g.add(kit("cabinet", { house: true, x, s: 1.35 }));
      g.add(kit("bunker_mirror", { yaw: -Math.PI / 2, x: 0.75, s: 0.62 }));
    } else if (id === "blueprints") {
      g.add(kit("table", { house: true, z: 0 }));
      const sheet = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.62), new THREE.MeshStandardMaterial({ map: blueprintTex(), roughness: 0.9 })); sheet.rotation.x = -Math.PI / 2; sheet.rotation.z = 0.08; sheet.position.set(-0.05, 1.125, 0.02); g.add(sheet);
      g.add(kit("lantern", { house: true, x: 0.6, y: 1.11, z: -0.2 }));
    }
  } catch (e) { console.warn(`facility model ${id}: kit missing, blockout`, e); }
  if (!g.children.length) { const d = defOf(id) ?? STARTERS.find((s) => s.id === id) ?? { w: 1, d: 1 }; box(d.w - 0.2, 1, d.d - 0.2, "#8a7a64", 0, 0.5, 0, g); }
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
let BP: THREE.Texture | null = null;
function blueprintTex() {
  if (BP) return BP;
  const c = document.createElement("canvas"); c.width = 256; c.height = 144; const x = c.getContext("2d")!;
  x.fillStyle = "#2a5d9a"; x.fillRect(0, 0, 256, 144); x.strokeStyle = "rgba(220,235,255,.35)"; x.lineWidth = 1;
  for (let i = 0; i < 256; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 144); x.stroke(); } for (let j = 0; j < 144; j += 16) { x.beginPath(); x.moveTo(0, j); x.lineTo(256, j); x.stroke(); }
  x.strokeStyle = "#eaf3ff"; x.lineWidth = 3; x.strokeRect(30, 26, 120, 80); x.strokeRect(166, 40, 60, 52); x.beginPath(); x.moveTo(30, 66); x.lineTo(150, 66); x.stroke();
  BP = new THREE.CanvasTexture(c); BP.colorSpace = THREE.SRGBColorSpace; return BP;
}

// ---------------------------------------------------------------- the room shell
export const LAMPS: THREE.PointLight[] = [];
/** the vault: a 33 x 25 m tiled floor (one tile = one build cell), steel walls with brass trim on three sides (the
 *  camera side is cut away, as before), pillars, a big round vault door on the back wall, ceiling lamps */
export function buildVault(scene: THREE.Scene) {
  const W = AREA.maxX - AREA.minX + 1, D = AREA.maxZ - AREA.minZ + 1, x0 = AREA.minX - 0.5, x1 = AREA.maxX + 0.5, z0 = AREA.minZ - 0.5, z1 = AREA.maxZ + 0.5;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), patch(new THREE.MeshStandardMaterial({ map: floorTex(W, D), roughness: 0.75 }), { rim: 0, cookie: false }));
  floor.rotation.x = -Math.PI / 2; floor.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2); floor.receiveShadow = true; scene.add(floor);
  const geos: THREE.BufferGeometry[] = [], B = (w: number, h: number, d: number, c: string, x: number, y: number, z: number) => geos.push(bake(new THREE.BoxGeometry(w, h, d), c, new THREE.Matrix4().makeTranslation(x, y, z)));
  const H = 6.4, T = 0.5;
  B(W + 2 * T, 0.3, D + T, "#2c2621", (x0 + x1) / 2, -0.16, (z0 + z1) / 2 - T / 2); // slab under the floor edge
  // back (north) and east walls; the camera looks in from the south-west, so the south and west sides are cut away
  // (as the old bunker was) and only a brass-studded kerb marks the edge
  B(W + T, H, T, "#3e4a48", (x0 + x1) / 2 + T / 2, H / 2, z0 - T / 2);
  B(T, H, D + T, "#394543", x1 + T / 2, H / 2, (z0 + z1) / 2 - T / 2);
  B(W, 1.1, 0.08, "#2b3432", (x0 + x1) / 2, 0.55, z0 + 0.04); B(0.08, 1.1, D, "#2b3432", x1 - 0.04, 0.55, (z0 + z1) / 2);
  for (const y of [1.12, H - 0.15]) { B(W, 0.1, 0.14, "#c29a5b", (x0 + x1) / 2, y, z0 + 0.06); B(0.14, 0.1, D, "#c29a5b", x1 - 0.06, y, (z0 + z1) / 2); }
  // pilasters sunk into the walls (they never reach into a build cell)
  for (const x of [-8.5, 8.5, x1 + 0.1]) { B(0.8, H, 0.3, "#4c5a57", x, H / 2, z0 - 0.05); B(0.95, 0.22, 0.4, "#c29a5b", x, H - 0.1, z0 - 0.05); }
  for (const z of [-4, 4]) { B(0.3, H, 0.8, "#4c5a57", x1 + 0.05, H / 2, z); B(0.4, 0.22, 0.95, "#c29a5b", x1 + 0.05, H - 0.1, z); }
  B(0.18, 0.14, D + 0.3, "#2c2621", x0 - 0.09, 0.07, (z0 + z1) / 2); B(W + 0.3, 0.14, 0.18, "#2c2621", (x0 + x1) / 2, 0.07, z1 + 0.09); // kerbs
  for (let i = 0; i <= W; i += 1) B(0.06, 0.04, 0.06, "#c29a5b", x0 + i, 0.16, z1 + 0.09);
  for (let j = 0; j <= D; j += 1) B(0.06, 0.04, 0.06, "#c29a5b", x0 - 0.09, 0.16, z0 + j);
  const shell = new THREE.Mesh(mergeAll(geos), kitMaterial("matte")); shell.castShadow = false; shell.receiveShadow = true; scene.add(shell);
  // the vault door (decor): a big round steel door with a brass wheel, on the back wall west of the pod
  const door = new THREE.Group(); door.position.set(13.2, 2.9, z0 + 0.02); door.scale.setScalar(0.95);
  const dm = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 0.35, 40), M_("#6a777b", 0.45)); dm.rotation.x = Math.PI / 2; dm.position.z = 0.18; door.add(dm);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.14, 10, 40), M_("#c29a5b", 0.35)); rim.position.z = 0.2; door.add(rim);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.3, 16), M_("#c29a5b", 0.35)); hub.rotation.x = Math.PI / 2; hub.position.z = 0.45; door.add(hub);
  for (let i = 0; i < 3; i++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.1, 0.1), M_("#c29a5b", 0.35)); sp.position.z = 0.5; sp.rotation.z = (i * Math.PI) / 3; door.add(sp); }
  door.traverse((o) => { o.castShadow = false; }); scene.add(door);
  // wall sconces (brass cups with a warm bulb) and their lights, in two banks: the generator switches on the second
  const sconces: [number, number, number, number][] = [[-4.5, z0 + 0.12, 0, 0], [4.5, z0 + 0.12, 0, 0], [-13, z0 + 0.12, 0, 1], [x1 - 0.12, -8, -Math.PI / 2, 1], [x1 - 0.12, 0, -Math.PI / 2, 0], [x1 - 0.12, 8, -Math.PI / 2, 1]];
  for (const [x, z, yaw, bank] of sconces) {
    const g = new THREE.Group(); g.position.set(x, 3.3, z); g.rotation.y = yaw; scene.add(g);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.14, 0.3, 14), M_("#c29a5b", 0.35)); cup.position.set(0, 0, 0.22); g.add(cup);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.26), M_("#c29a5b", 0.35)); arm.position.set(0, -0.12, 0.1); g.add(arm);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffd8a0").multiplyScalar(2.2), toneMapped: false })); bulb.position.set(0, 0.16, 0.22); g.add(bulb);
    const l = new THREE.PointLight("#ffcf94", 24, 16, 1.3); l.position.set(x + Math.sin(yaw) * 1.2, 3.6, z + Math.cos(yaw) * 1.2); l.userData.bank = bank; l.userData.bulb = bulb; scene.add(l); LAMPS.push(l);
  }
  // two unseen fill lights over the middle of the floor (the ceiling is out of frame)
  for (const [x, z, bank] of [[-6, 2, 0], [6, 2, 1], [-13, 6, 0], [-13, -4, 1]] as const) { const l = new THREE.PointLight("#ffd6a8", 30, 20, 1.2); l.position.set(x, 5, z); l.userData.bank = bank; l.userData.bulb = new THREE.Object3D(); scene.add(l); LAMPS.push(l); }
}
/** tile floor: one 1 m tile per build cell (marble squares, brass inlay along the border) */
function floorTex(W: number, D: number) {
  const px = 48, c = document.createElement("canvas"); c.width = W * px; c.height = D * px; const x = c.getContext("2d")!;
  for (let i = 0; i < W; i++) for (let j = 0; j < D; j++) {
    const v = (i * 7919 + j * 104729) % 9, odd = (i + j) & 1;
    x.fillStyle = odd ? `rgb(${178 + v},${160 + v},${130 + v})` : `rgb(${196 + v},${180 + v},${150 + v})`; x.fillRect(i * px, j * px, px, px);
  }
  x.strokeStyle = "rgba(60,44,30,.35)"; x.lineWidth = 2; for (let i = 0; i <= W; i++) { x.beginPath(); x.moveTo(i * px, 0); x.lineTo(i * px, D * px); x.stroke(); } for (let j = 0; j <= D; j++) { x.beginPath(); x.moveTo(0, j * px); x.lineTo(W * px, j * px); x.stroke(); }
  x.strokeStyle = "#a8834c"; x.lineWidth = 6; x.strokeRect(px * 0.5, px * 0.5, (W - 1) * px, (D - 1) * px);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
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
