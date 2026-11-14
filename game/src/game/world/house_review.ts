// Review page for the house kit: house.html?view=prefab|all|modules|plantation|colony|landing|selftest
// Same Stage as the game (pitch 55, yaw -30, FOV 24, dist 40; sun elevation 50).
//   id=<prefab>   roof=0 (hide roof + upper: the faded state)   fade=smart (hide roof + only the camera-side uppers)
//   open=1 (doors open)   col=1 (collider + interior outlines)   lights=0 (no lamp lights)   ry=<deg> (turn the building)   broken=1   merge=1 (mergeUpper)
//   dist=N  fx/fz = focus   t=<cookie time>   names=a,b (modules)   page=N cols=N rows=N cell=N
import * as THREE from "three";
import { Stage } from "../render/stage";
import { mat, U } from "../render/shading";
import { mergePieces } from "./kitutil";
import type { KitPiece, Collider } from "../contracts";
import { createRig, preloadCharacters } from "../actors/rig";
import { DEFAULT_LOOK } from "../actors/look";
import * as H from "./kit_house";
import * as K from "./kit_build";
import { preloadNature, NATURE } from "./kit_nature";

const QS = new URLSearchParams(location.search);
const view = QS.get("view") ?? "prefab";
const stage = new Stage(document.getElementById("game") as HTMLCanvasElement, "#d9cfa8");
const scene = stage.scene;
if (QS.has("nofog")) scene.fog = null;
stage.sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - Number(QS.get("sunel") ?? 50)), THREE.MathUtils.degToRad(Number(QS.get("sunaz") ?? 160)));
U.uTime.value = Number(QS.get("t") ?? -400);
const ROOF = QS.get("roof") !== "0", SMART = QS.get("fade") === "smart", OPEN = QS.has("open"), COL = QS.has("col"), LIGHTS = QS.get("lights") !== "0", BROKEN = QS.has("broken");

const pieces: KitPiece[] = [];
const M = (x = 0, z = 0, yaw = 0, y = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(1, 1, 1));
function put(b: H.Built | K.Built, x = 0, z = 0, yaw = 0, y = 0) {
  const m = M(x, z, yaw, y);
  for (const p of b.pieces) pieces.push({ ...p, geo: p.geo.clone().applyMatrix4(m) });
  b.parts.root.applyMatrix4(m); scene.add(b.parts.root);
  return b;
}
let seed = 7;
const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
function nat(type: keyof typeof NATURE, x: number, z: number, s = 1, yaw = rng() * 6.28) {
  const m = M(x, z, yaw);
  for (const p of NATURE[type](rng, s)) pieces.push({ ...p, geo: p.geo.clone().applyMatrix4(m) });
}
function ground(color: string, size = 200) {
  const g = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat(color, { rough: 0.95, rim: 0 }));
  g.rotation.x = -Math.PI / 2; g.receiveShadow = true; scene.add(g); return g;
}
/** a soft-edged patch of other ground (dirt road, trodden yard, water) */
function patch(color: string, pts: [number, number][], y = 0.012, opacity = 1) {
  const sh = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const m = mat(color, { rough: 0.95, rim: 0 }); if (opacity < 1) { m.transparent = true; m.opacity = opacity; }
  const g = new THREE.Mesh(new THREE.ShapeGeometry(sh), m);
  g.rotation.x = -Math.PI / 2; g.position.y = y; g.receiveShadow = true; scene.add(g);
}
const blob = (cx: number, cz: number, rx: number, rz: number, n = 14, j = 0.18): [number, number][] => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2, k = 1 + (rng() - 0.5) * 2 * j; return [cx + Math.cos(a) * rx * k, cz + Math.sin(a) * rz * k]; });
function monkey(x: number, z: number, yaw = 0.6) {
  try {
    const rig = createRig("monkey", DEFAULT_LOOK); rig.root.position.set(x, 0.08, z); rig.root.rotation.y = yaw;
    rig.pose({ time: 0, speed: 0, moveYaw: yaw, faceYaw: yaw, action: "idle", actionT: 0, armed: "none", flash: 0 });
    rig.root.traverse((o) => { o.castShadow = true; }); scene.add(rig.root);
  } catch { const c = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 1.1, 6, 12), mat("#3f6fb0")); c.position.set(x, 1, z); c.castShadow = true; scene.add(c); }
}
const right = new THREE.Vector3(Math.cos(stage.cam.yaw), 0, -Math.sin(stage.cam.yaw)), away = new THREE.Vector3(-Math.sin(stage.cam.yaw), 0, -Math.cos(stage.cam.yaw));
const cam = (r: number, a: number) => right.clone().multiplyScalar(r).addScaledVector(away, a);
const focus = new THREE.Vector3(Number(QS.get("fx") ?? 0), 0.6, Number(QS.get("fz") ?? 0));
let label = "";

// ---------------------------------------------------------------- collider + interior outlines
const COLC = { wall: "#ff3b30", low: "#ffcc00", bars: "#3d8bff", door: "#34c759", brk: "#ff7ad9", room: "#35e0e0" };
function outline(pts: [number, number][], color: string, y: number, fill = 0.28) {
  const v = pts.map(([x, z]) => new THREE.Vector3(x, y, z));
  const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(v), new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true }));
  line.renderOrder = 20; scene.add(line);
  if (fill > 0 && pts.length === 4) {
    const g = new THREE.BufferGeometry().setFromPoints([v[0], v[1], v[2], v[0], v[2], v[3]]);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: fill, depthTest: false, side: THREE.DoubleSide })); m.renderOrder = 19; scene.add(m);
  }
}
function drawColliders(cols: Collider[], y = 0.2) {
  for (const c of cols) {
    const color = c.id?.startsWith("brk") ? COLC.brk : c.id ? COLC.door : c.low ? COLC.low : c.shot ? COLC.wall : COLC.bars;
    if (c.t === "seg") {
      const dx = c.bx - c.ax, dz = c.bz - c.az, l = Math.hypot(dx, dz) || 1, nx = (-dz / l) * c.thick / 2, nz = (dx / l) * c.thick / 2;
      outline([[c.ax + nx, c.az + nz], [c.bx + nx, c.bz + nz], [c.bx - nx, c.bz - nz], [c.ax - nx, c.az - nz]], color, y, 0.45);
    } else if (c.t === "box") {
      const k = Math.cos(c.yaw ?? 0), n = Math.sin(c.yaw ?? 0);
      outline(([[-1, -1], [1, -1], [1, 1], [-1, 1]] as [number, number][]).map(([sx, sz]) => { const lx = (sx * c.w) / 2, lz = (sz * c.d) / 2; return [c.x + lx * k + lz * n, c.z - lx * n + lz * k] as [number, number]; }), color, y, 0.3);
    } else outline(Array.from({ length: 20 }, (_, i) => [c.x + Math.cos((i / 20) * 6.283) * c.r, c.z + Math.sin((i / 20) * 6.283) * c.r] as [number, number]), color, y, 0);
  }
}
const legend = () => `<span style="font-size:12px">${Object.entries({ "wall: move+shot": COLC.wall, "window / furniture: low cover": COLC.low, "bars: move only": COLC.bars, "door (id)": COLC.door, "breakable (id)": COLC.brk, "interior volume": COLC.room }).map(([k, c]) => `<i style="display:inline-block;width:10px;height:10px;background:${c};margin:0 4px 0 10px"></i>${k}`).join("")}</span>`;

// ---------------------------------------------------------------- one building, posed by the page flags
type Opt = { roof?: boolean; open?: boolean; col?: boolean; lights?: boolean; smart?: boolean; broken?: boolean };
function house(id: string, x = 0, z = 0, yaw = 0, o: Opt = {}) {
  const roof = o.roof ?? ROOF, open = o.open ?? OPEN, col = o.col ?? COL, smart = o.smart ?? SMART;
  const b = H.building(id, { open, mergeUpper: !smart && QS.has("merge") });
  put(b, x, z, yaw, 0);
  if (!roof || smart) {
    if (b.parts.roof) b.parts.roof.visible = false;
    if (!smart) { if (b.parts.upper) b.parts.upper.visible = false; }
    else for (const k of Object.keys(b.parts)) if (/^upper_/.test(k)) {
      // keep a wall's upper part when its outside faces away from the camera (so you look at its inner face)
      const side = k.slice(6), n = ({ s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] } as Record<string, number[]>)[side];
      if (!n) { b.parts[k].visible = false; continue; }
      const wx = n[0] * Math.cos(yaw) + n[1] * Math.sin(yaw), wz = -n[0] * Math.sin(yaw) + n[1] * Math.cos(yaw);
      b.parts[k].visible = wx * away.x + wz * away.z > 0.2;
    }
    if (o.lights ?? LIGHTS) for (const k of b.lights) { const l = new THREE.PointLight("#ffc27a", 14, 7, 1.6); b.parts[k].add(l); }
  }
  if (o.broken ?? BROKEN) for (const br of b.breakables) {
    b.parts[br.intact].visible = false; b.parts[br.debris].visible = b.parts[br.remains].visible = true;
    b.parts[br.debris].children.forEach((c, i) => {
      const r = (n: number) => (Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1;
      c.position.x += r(1) * 0.9; c.position.z += -(1.0 + Math.abs(r(2)) * 1.6); c.position.y = Math.max(0.2, c.position.y * 0.35 + Math.abs(r(3)) * 0.5);
      c.rotation.set(r(4) * 2.4, r(5) * 2.4, r(6) * 2.4);
    });
  }
  if (col) {
    drawColliders(H.placeColliders(b.colliders, x, z, yaw));
    const k = Math.cos(yaw), n = Math.sin(yaw);
    for (const r of b.interiors) outline(([[-1, -1], [1, -1], [1, 1], [-1, 1]] as [number, number][]).map(([sx, sz]) => { const lx = r.x + (sx * r.w) / 2 - sx * 0.2, lz = r.z + (sz * r.d) / 2 - sz * 0.2; return [x + lx * k + lz * n, z - lx * n + lz * k] as [number, number]; }), COLC.room, 0.26, 0.1);
  }
  return b;
}

function prefab() {
  const id = QS.get("id") ?? "guard_hut", yaw = THREE.MathUtils.degToRad(Number(QS.get("ry") ?? 0));
  ground(QS.get("ground") ?? "#a8a565");
  patch("#c2a476", blob(0, 0, 12, 9), 0.01);
  const b = house(id, 0, 0, yaw);
  if (!QS.has("dist")) stage.cam.dist = Math.max(30, Math.min(52, 22 + Math.max(b.size.w, b.size.d) * 1.9));
  if (!QS.has("nomonkey")) { monkey(b.size.x - b.size.w / 2 - 1.6, b.size.z + b.size.d / 2 + 1.4, 2.4); if (!ROOF || SMART) monkey(b.interiors[0].x + 0.3, b.interiors[0].z + 0.6, 0.6); }
  if (!QS.has("fx")) focus.set(b.size.x, 0.8, b.size.z);
  label = `${b.name} · ${b.tris} tris · ${b.doors.length} doors · ${b.colliders.length} colliders · ${b.lights.length} lights` + (COL ? "<br>" + legend() : "");
}
/** the same prefab four ways in one frame: roof on, faded, doors open, colliders */
function states() {
  const id = QS.get("id") ?? "guard_hut";
  ground("#a8a565"); scene.fog = null;
  const probe = H.building(id), w = Math.max(probe.size.w, 6) + 5.5, d = Math.max(probe.size.d, 6) + 5.5;
  const at = [cam(-w / 2, d * 0.62), cam(w / 2, d * 0.62), cam(-w / 2, -d * 0.62), cam(w / 2, -d * 0.62)];
  house(id, at[0].x, at[0].z, 0, { roof: true, open: false, col: false });
  house(id, at[1].x, at[1].z, 0, { roof: false, open: false, col: false });
  house(id, at[2].x, at[2].z, 0, { roof: false, open: true, col: false, smart: true });
  house(id, at[3].x, at[3].z, 0, { roof: false, open: true, col: true });
  for (const p of at) monkey(p.x - probe.size.w / 2 - 1.3, p.z + probe.size.d / 2 + 1.2, 2.4);
  if (!QS.has("dist")) stage.cam.dist = 40 + Math.max(w, d) * 2.6;
  label = `${probe.name}: roof on · roof + upper hidden · smart fade + doors open · colliders<br>` + legend();
}
function all() {
  ground("#a8a565"); scene.fog = null;
  const spots: [string, number, number][] = [["guard_hut", -17, 9], ["radio_shack", -8, 13], ["boathouse", 2, 13], ["farmhouse", -9, -4], ["barn", 9, -3], ["cellblock", 21, 13]];
  for (const [id, r, a] of spots) { const p = cam(r, a); house(id, p.x, p.z, 0); monkey(p.x - 1, p.z + 6.5, 2.6); }
  if (!QS.has("dist")) stage.cam.dist = 96;
  label = "all six prefabs";
}
function modules() {
  ground("#c9b384");
  let names = H.houseModuleNames();
  const only = QS.get("names"), grp = QS.get("group");
  if (only) names = only.split(",");
  else if (grp) names = names.filter((n) => n.startsWith(grp));
  const cell = Number(QS.get("cell") ?? 3.6), cols = Number(QS.get("cols") ?? 8), rows = Number(QS.get("rows") ?? 4), page = Number(QS.get("page") ?? 0);
  const slice = names.slice(page * cols * rows, (page + 1) * cols * rows);
  slice.forEach((n, i) => {
    const c = i % cols, r = Math.floor(i / cols), p = cam((c - (cols - 1) / 2) * cell, ((rows - 1) / 2 - r) * cell * 1.25);
    const b = H.houseModule(n, { open: OPEN }); put(b, p.x, p.z);
    if (!ROOF) { if (b.parts.roof) b.parts.roof.visible = false; if (b.parts.upper) b.parts.upper.visible = false; }
    if (COL) drawColliders(H.placeColliders(b.colliders, p.x, p.z));
  });
  monkey(cam((-(cols - 1) / 2 - 0.8) * cell, 0).x, cam((-(cols - 1) / 2 - 0.8) * cell, 0).z);
  label = `modules · page ${page} · ${slice.length}/${names.length}: ${slice.join(", ")}`;
}

// ---------------------------------------------------------------- composed places (the Duckov comparison frames)
const yawOf = (ax: number, az: number, bx: number, bz: number) => Math.atan2(bx - ax, bz - az);
const wall = (kind: K.WallKind, ax: number, az: number, bx: number, bz: number) => put(K.wallSection(kind, { length: Math.hypot(bx - ax, bz - az) }), (ax + bx) / 2, (az + bz) / 2, yawOf(ax, az, bx, bz));
function fenceRun(ax: number, az: number, bx: number, bz: number) {
  const l = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(l / 2.5)), yaw = Math.atan2(-(bz - az), bx - ax);
  for (let i = 0; i < n; i++) put(K.fence(i), ax + ((bx - ax) * (i + 0.5)) / n, az + ((bz - az) * (i + 0.5)) / n, yaw);
}
function plantation() {
  ground("#9aa35c"); label = "Old Plantation: farmhouse + barn";
  patch("#c0a070", [[-30, 9], [-8, 8.2], [4, 9.5], [30, 8], [30, 12.5], [5, 13.4], [-9, 12.3], [-30, 13]]);
  patch("#b8996c", blob(-6, 4.5, 6.5, 4.2)); patch("#b8996c", blob(9.5, 2, 6, 6.5));
  house("farmhouse", -7, -2.5, 0);
  house("barn", 10, -6, 0);
  put(K.tractor(), 3.2, 4.2, 0.9);
  fenceRun(-15, 7, -2.5, 7); fenceRun(1, 7.2, 4.8, 7.2); fenceRun(-15.2, 7, -15.2, -5.5);
  put(K.well(), -13, 3.4, 0.3); put(K.signpost("a"), -1, 8.4, 0.2);
  put(K.crate("wood"), 5.4, 0.8, 0.3); put(K.barrel(0), 15.4, 1.2); put(K.barrel(1), 16.2, 0.5); put(K.sack(true), 14.8, 2.4, 0.5); put(K.crate("green"), -11.6, 5.2, -0.2);
  for (const [x, z, s] of [[-17, -8, 1.1], [-19, 1, 1], [18, -13, 1.15], [0.5, -9.5, 1], [19, 5, 1.05]] as const) nat("palm", x, z, s);
  for (const [x, z] of [[-12.5, -7.5], [-10, -8.4], [-4.5, -7.8], [2.6, -7], [4.4, -11], [16.5, -10], [17.5, -2.5], [-17.5, 4]] as const) nat("banana", x, z, 1 + rng() * 0.3);
  for (const [x, z] of [[-16, 9], [-3.5, 6.2], [6.5, 7.4], [16, 6.5], [1.8, -3.4], [-14.2, -3], [3.5, -13], [19.5, -6.5]] as const) nat("bush", x, z, 0.8 + rng() * 0.5);
  for (const [x, z] of [[-13.5, 6.2], [0.4, 5.6], [7.5, 5.8], [-1.6, -0.6], [15.8, 3.6], [-9, 9.2], [5.6, 10.6], [-17, -3.5], [14, 7.6]] as const) nat(rng() < 0.5 ? "fern" : "flowers", x, z, 0.9 + rng() * 0.4);
  for (const [x, z] of [[-2, 10.6], [12, 9.6], [-12, 11.4], [17.5, 11]] as const) nat("rockS", x, z, 1);
  monkey(-4.5, 5.6, 2.8); monkey(7.6, 2.4, 0.6);
  if (!ROOF || SMART) { monkey(-9.2, -2.2, 0.8); monkey(10.6, -5.2, 2.2); }
  if (!QS.has("fx")) focus.set(1.5, 0.8, -1);
  if (!QS.has("dist")) stage.cam.dist = 46;
}
function colony() {
  ground("#a9a26a"); label = "Penal Colony: cellblock + guard hut";
  patch("#b9a27c", blob(1, 3, 17, 9.5, 18, 0.1)); patch("#c5b08a", [[-30, 7.6], [30, 6.6], [30, 10.4], [-30, 11.2]]);
  house("cellblock", 2, -3.5, 0);
  house("guard_hut", -13, 3.2, 0);
  wall("stone", -16.8, -8, -16.8, -1.5); wall("stone", -16.8, -8, -7.5, -8);
  wall("stone", 11.5, -8, 20, -8); wall("stone", 20, -8, 20, 4);
  put(K.watchtower(), 15.5, 4.5, 0.2); put(K.lantern(true), -8.6, 6.2, 0.4); put(K.lantern(true), 10.8, 6.4, 0.4);
  put(K.crate("green"), -9.6, -0.8, 0.3); put(K.barrel(1), -8.2, -1.6); put(K.barrel(2), -9, -2.5); put(K.crate("wood"), 12.2, -1.2, 0.2); put(K.sack(true), 12.6, 1.2, 0.3);
  put(K.rubblePile(), 13.4, -5.6, 0.4); put(K.signpost("key"), -6.4, 6.4, 0.3);
  for (const [x, z, s] of [[-20, -4, 1.1], [-19, 8.5, 1], [22.5, -3, 1.1], [7, -11.5, 1.15], [-9, -11, 1]] as const) nat("palm", x, z, s);
  for (const [x, z] of [[-18.2, 2], [-10.6, 8.6], [5.5, 6.2], [13.5, 8.2], [21.5, 6], [-3, -9.4], [16.8, -10]] as const) nat("bush", x, z, 0.8 + rng() * 0.4);
  for (const [x, z] of [[-11, 6.4], [-5.8, 2.6], [0.6, 5.4], [8.6, 4.2], [18, 7.4], [-15, 7.8], [3.8, 9.6]] as const) nat(rng() < 0.6 ? "fern" : "beachGrass", x, z, 0.9 + rng() * 0.3);
  for (const [x, z] of [[-4.5, 8.8], [9.8, 9.4], [-17.6, 5.4]] as const) nat("rockM", x, z, 0.9);
  monkey(-2.8, 3.4, 2.7); monkey(-10.4, 4.6, 1.2);
  if (!ROOF || SMART) { monkey(0, -5.4, 0.8); monkey(8.2, -2, 2.2); }
  if (!QS.has("fx")) focus.set(1, 0.8, -1);
  if (!QS.has("dist")) stage.cam.dist = 48;
}
function landing() {
  ground("#c9b27c"); label = "Raft landing: boathouse + radio shack";
  // the sea in front (toward the camera), the boathouse on its stilts over the edge
  patch("#3f93a8", [[-40, 4.2], [-12, 3.4], [-2, 4.6], [8, 3.6], [40, 4.4], [40, 40], [-40, 40]], 0.02);
  patch("#7fc4c8", [[-40, 3.6], [-12, 2.8], [-2, 4.0], [8, 3.0], [40, 3.8], [40, 4.6], [8, 3.8], [-2, 4.8], [-12, 3.6], [-40, 4.4]], 0.03);
  patch("#9aa35c", blob(-3, -10, 26, 6.5, 20, 0.12), 0.011);
  house("boathouse", 1, 0.5, 0);
  house("radio_shack", -11, -5.5, 0);
  put(K.raft(), 8.4, 7.4, 0.5); put(K.signpost("raft"), -3.6, 1.6, 0.4);
  put(K.crate("wood"), -5.4, -1.4, 0.2); put(K.barrel(2), -6.6, -0.6); put(K.crate("green"), 7.2, -2.4, -0.3);
  for (const [x, z, s] of [[-17, -9, 1.1], [-6, -10.5, 1], [9.5, -8, 1.15], [15, -3, 1]] as const) nat("palm", x, z, s);
  nat("leaningPalm", -14.5, 1.2, 1, 2.4); nat("leaningPalm", 12.5, 1.6, 1, 0.8);
  for (const [x, z] of [[-8.4, -9], [-15, -3], [5.6, -6.4], [12.4, -6.2], [-2.6, -8]] as const) nat("bush", x, z, 0.8 + rng() * 0.4);
  for (const [x, z] of [[-9, 1.6], [-4.4, 2.4], [6.4, 2.2], [11, 2.4], [-13, 2.6], [14.6, 2]] as const) nat(rng() < 0.5 ? "beachGrass" : "driftwood", x, z, 1);
  for (const [x, z] of [[-7, 3], [9, 3.2], [-1.5, 3.4]] as const) nat("shells", x, z, 1);
  monkey(-4.4, -3.2, 2.2); monkey(-9.6, -2.4, 0.8);
  if (!ROOF || SMART) { monkey(1.4, -0.8, 0.6); monkey(-11, -5.6, 2.4); }
  if (!QS.has("fx")) focus.set(-3, 0.8, -1);
  if (!QS.has("dist")) stage.cam.dist = 44;
}
/** call every builder once and report what came back (window.selftest; used by the scripted check) */
function selftest() {
  ground("#c9b384");
  const out: Record<string, { pieces: number; tris: number; parts: string[]; colliders: number; bad: string[] }> = {};
  const check = (name: string, b: H.Built, cols: Collider[], extra: string[] = []) => {
    let tris = 0; const bad = [...extra];
    for (const p of b.pieces) { const a = p.geo.attributes; tris += a.position.count / 3; if (!a.normal || !a.color || a.color.itemSize !== 3 || p.geo.index) bad.push("piece attributes"); for (let i = 0; i < a.position.array.length; i++) if (!Number.isFinite(a.position.array[i])) { bad.push("NaN"); break; } }
    b.parts.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; });
    for (const c of cols) { const v = c.t === "seg" ? [c.ax, c.az, c.bx, c.bz, c.thick] : c.t === "box" ? [c.x, c.z, c.w, c.d] : [c.x, c.z, c.r]; if (v.some((n) => !Number.isFinite(n)) || typeof c.move !== "boolean" || typeof c.shot !== "boolean") bad.push("collider"); }
    out[name] = { pieces: b.pieces.length, tris: Math.round(tris), parts: Object.keys(b.parts).filter((k) => k !== "root"), colliders: cols.length, bad };
  };
  for (const id of H.HOUSE_IDS) {
    const b = H.building(id, { open: true }), bad: string[] = [];
    if (!b.parts.roof) bad.push("no roof"); if (!b.parts.upper) bad.push("no upper"); if (!b.interiors.length) bad.push("no interior"); if (!b.lights.length) bad.push("no lights");
    for (const d of b.doors) { if (!b.parts[d.leaf]) bad.push(`door ${d.id}: no leaf`); if (!b.colliders.some((c) => c.id === d.id)) bad.push(`door ${d.id}: no collider`); }
    for (const l of b.lights) if (!b.parts[l]) bad.push(`light ${l}`);
    for (const br of b.breakables) { if (!b.parts[br.intact] || !b.parts[br.debris] || !b.parts[br.remains]) bad.push(`breakable ${br.id}`); if (!b.colliders.some((c) => c.id === br.id)) bad.push(`breakable ${br.id}: no collider`); }
    if (H.collidersFor(`building:${id}`).length !== b.colliders.length) bad.push("collidersFor");
    check(`building(${id})`, b, b.colliders, bad);
  }
  for (const n of H.houseModuleNames()) { const m = H.houseModule(n, { open: true }); check(`houseModule(${n})`, m, m.colliders, H.collidersFor(`house:${n}`).length !== m.colliders.length ? ["collidersFor"] : []); }
  const defs = Object.fromEntries(H.HOUSE_IDS.map((id) => { const b = H.building(id); return [id, { tris: b.tris, doors: b.doors.map((d) => `${d.id}${d.breakable ? " (breakable)" : ""}${d.locked ? ` (locked: ${d.locked})` : ""}`), breakables: b.breakables.map((x) => x.id), lights: b.lights.length, interiors: b.interiors.length, colliders: b.colliders.length, size: b.size }]; }));
  (window as unknown as { selftest: unknown }).selftest = { builders: Object.keys(out).length, assets: H.houseAssetNames().length, bad: Object.entries(out).filter(([, v]) => v.bad.length || (!v.pieces && !v.parts.length)).map(([k, v]) => `${k}: ${v.bad.join(", ")}`), defs, out };
  label = `selftest: ${Object.keys(out).length} builders`;
}

async function main() {
  await Promise.all([H.preloadHouse(), K.preloadBuild(), preloadNature(), preloadCharacters().catch(() => undefined)]);
  ({ prefab, states, all, modules, plantation, colony, landing, selftest } as Record<string, () => void>)[view]?.();
  scene.add(mergePieces(pieces));
  let tris = 0; scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.geometry && o.visible) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; });
  document.getElementById("tag")!.innerHTML = `<b>${view}</b> ${label}`;
  document.getElementById("nav")!.innerHTML = [...H.HOUSE_IDS.map((id) => `<a href="?view=states&id=${id}">${id}</a>`), ...["all", "modules", "plantation", "colony", "landing"].map((v) => `<a href="?view=${v}">${v}</a>`)].join("");
  void tris;
  let t = 0;
  const loop = () => { t += 1 / 60; stage.place(focus, 1 / 60, t); stage.render(1 / 60); (window as unknown as { calls: number }).calls = stage.renderer.info.render.calls; requestAnimationFrame(loop); };
  loop();
}
main();
