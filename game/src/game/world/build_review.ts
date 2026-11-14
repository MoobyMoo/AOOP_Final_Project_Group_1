// Review page for the structures + landmarks kit: build.html?view=lineup|camp|ruin|landmarks|bunker
// Same Stage as the game (pitch 55, yaw -30, FOV 24, dist 40; sun elevation 50). Extra params: group=<glb group>,
// names=a,b,c, page=N (lineup), dist=N, fx/fz = focus, open=1 (lids/doors/gates open), broken=1 (walls broken).
import * as THREE from "three";
import { Stage } from "../render/stage";
import { mat, U } from "../render/shading";
import { mergePieces } from "./kitutil";
import type { KitPiece } from "../contracts";
import { createRig } from "../actors/rig";
import { DEFAULT_LOOK } from "../actors/look";
import * as K from "./kit_build";

const QS = new URLSearchParams(location.search);
const view = QS.get("view") ?? "lineup";
const stage = new Stage(document.getElementById("game") as HTMLCanvasElement, view === "bunker" ? "#2a2420" : "#d9cfa8");
const scene = stage.scene;
if (QS.has("nofog")) scene.fog = null;
stage.sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - Number(QS.get("sunel") ?? 50)), THREE.MathUtils.degToRad(Number(QS.get("sunaz") ?? 160)));
if (!QS.has("dist")) stage.cam.dist = view === "bunker" ? 26 : 40;
const OPEN = QS.has("open"), BROKEN = QS.has("broken");
// the canopy light cookie is world-space noise scrolled by uTime: pick a time that puts open sun over the review set
U.uTime.value = Number(QS.get("t") ?? -400);

const pieces: KitPiece[] = [];
const M = (x = 0, z = 0, yaw = 0, y = 0, s = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(s, s, s));
/** drop a Built into the scene: static pieces go to the merged batch, parts.root is added as is */
function put(b: K.Built, x = 0, z = 0, yaw = 0, y = 0) {
  const m = M(x, z, yaw, y);
  for (const p of b.pieces) pieces.push({ ...p, geo: p.geo.clone().applyMatrix4(m) });
  b.parts.root.applyMatrix4(m); scene.add(b.parts.root);
  return b;
}
function ground(color: string, size = 160) {
  const g = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat(color, { rough: 0.95, rim: 0 }));
  g.rotation.x = -Math.PI / 2; g.receiveShadow = true; scene.add(g); return g;
}
function monkey(x: number, z: number, yaw = 0.6) {
  try {
    const rig = createRig("monkey", DEFAULT_LOOK); rig.root.position.set(x, 0, z); rig.root.rotation.y = yaw;
    rig.pose({ time: 0, speed: 0, moveYaw: yaw, faceYaw: yaw, action: "idle", actionT: 0, armed: "none", flash: 0 });
    rig.root.traverse((o) => { o.castShadow = true; }); scene.add(rig.root);
  } catch { const c = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 1.1, 6, 12), mat("#3f6fb0")); c.position.set(x, 1, z); c.castShadow = true; scene.add(c); }
}
// camera-aligned ground axes, so rows read left-to-right on screen
const right = new THREE.Vector3(Math.cos(stage.cam.yaw), 0, -Math.sin(stage.cam.yaw)), away = new THREE.Vector3(-Math.sin(stage.cam.yaw), 0, -Math.cos(stage.cam.yaw));
const focus = new THREE.Vector3(Number(QS.get("fx") ?? 0), 0.6, Number(QS.get("fz") ?? 0));
let label = "";

function lineup() {
  ground("#d8c08c");
  let names = K.buildAssetNames();
  const grp = QS.get("group"), only = QS.get("names");
  if (only) names = only.split(",");
  else if (grp) names = names.filter((n) => GROUP_OF.get(n) === grp);
  const cell = Number(QS.get("cell") ?? 3.4), cols = Number(QS.get("cols") ?? 8), rows = Number(QS.get("rows") ?? 4), page = Number(QS.get("page") ?? 0);
  const slice = names.slice(page * cols * rows, (page + 1) * cols * rows);
  slice.forEach((n, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    const p = right.clone().multiplyScalar((c - (cols - 1) / 2) * cell).addScaledVector(away, ((rows - 1) / 2 - r) * cell * 1.25);
    const b = put(K.asset(n), p.x, p.z);
    if (OPEN) openUp(b);
  });
  monkey(right.x * (-(cols - 1) / 2 - 0.8) * cell, right.z * (-(cols - 1) / 2 - 0.8) * cell);
  label = `lineup ${grp ?? "all"} · page ${page} · ${slice.length}/${names.length} assets`;
}
function openUp(b: K.Built) {
  if (b.parts.lid) b.parts.lid.rotation.x = -1.9;
  if (b.parts.leaf) b.parts.leaf.rotation.y = -1.5;
}
/** static "mid-break" pose: intact hidden, chunks thrown outward, remains shown */
function breakUp(b: K.Built, k = 1) {
  if (!b.parts.debris) return;
  b.parts.intact.visible = false; b.parts.debris.visible = b.parts.remains.visible = true;
  b.parts.debris.children.forEach((c, i) => {
    const r = (n: number) => Math.sin(i * 12.9898 + n * 78.233) * 43758.5453 % 1;
    c.position.x += (1.2 + Math.abs(r(1)) * 1.6) * k * (i % 2 ? 1 : -1); c.position.z += r(2) * 0.8 * k; c.position.y = Math.max(0.15, c.position.y * 0.45 + Math.abs(r(3)) * 0.9 * k);
    c.rotation.set(r(4) * 2.4 * k, r(5) * 2.4 * k, r(6) * 2.4 * k);
  });
}
const GROUP_OF = new Map<string, string>();
const yawOf = (ax: number, az: number, bx: number, bz: number) => Math.atan2(bx - ax, bz - az);
function wall(kind: K.WallKind, ax: number, az: number, bx: number, bz: number, breakable = false) {
  const b = put(K.wallSection(kind, { length: Math.hypot(bx - ax, bz - az), breakable }), (ax + bx) / 2, (az + bz) / 2, yawOf(ax, az, bx, bz));
  if (breakable && BROKEN) breakUp(b);
  return b;
}

function camp() {
  ground("#b89c70"); label = "Peel Gang camp";
  put(K.campfire(), 0, 0);
  put(K.logBench(0), -2.3, 0.7, 1.25); put(K.logBench(1), 1.3, 2.3, 0.15); put(K.logBench(1), 1.9, -1.6, -0.9);
  put(K.tent(0), -5.2, -4.6, 0.5); put(K.tent(1), 2.2, -6.2, 0.35);
  put(K.tarp(), 7.2, -2.6, -0.5); put(K.bedroll(1), 6.9, -2.9, 0.4); put(K.crate("wood", { variant: 1 }), 8.3, -3.4, 0.3);
  put(K.bedroll(0), -3.6, -1.6, 0.6); put(K.bedroll(0), -3.3, 2.6, -0.4);
  put(K.watchtower(), -10.5, 0.5, 0.25); put(K.crate("gold"), -10.3, 0.75, 0.3, 3.07);
  put(K.well(), -5.6, 5.6, 0.3);
  put(K.crate("wood", { open: OPEN }), 4.2, 2.0, 0.2); put(K.crate("green", { open: OPEN }), 5.9, 1.2, -0.25); put(K.barrel(0), 4.6, 3.6); put(K.barrel(1), 5.6, 3.3); put(K.sack(true), 7.0, 3.4, 0.4);
  put(K.ammoBox(), 3.4, 3.6, 0.5); put(K.bananaStash(), -2.4, -3.0, 0.2); put(K.satchel(), -0.9, 4.6, 0.7); put(K.sack(), 4.9, 0.3, 1);
  put(K.lantern(true), 3.0, -2.2, 0.4); put(K.lantern(true), -7.2, 2.8, 2.2); put(K.lantern(), -1.9, 1.9);
  put(K.signpost("a"), 9.6, 6.6, 0.3); put(K.lemonStand(), -8.0, -5.6, 0.3);
  wall("palisade", 12, -9, 12, -1.5); wall("palisade", 12, -1.5, 12, 6, true); wall("palisade", 12, 6, 12, 8.5);
  wall("palisade", -4.5, -9.5, 12, -9.5);
  for (let i = 0; i < 4; i++) put(K.fence(i), -9.5 + i * 2.5, 9.2, 0);
  const g = put(K.gate(OPEN), 2.0, 9.2); void g;
  for (let i = 0; i < 2; i++) put(K.fence(i + 1), 5.6 + i * 2.5, 9.2, 0);
  monkey(-0.4, 2.6, 2.6); monkey(8.6, 6.4, 0.4);
}
/** screen-aligned ground coords: r = right, a = away from the camera */
const cam = (r: number, a: number) => right.clone().multiplyScalar(r).addScaledVector(away, a);
const putc = (b: K.Built, r: number, a: number, yaw = 0, y = 0) => { const p = cam(r, a); return put(b, p.x, p.z, yaw, y); };
function ruin() {
  ground("#c2ad82"); label = "Penal Colony ruins · vine door · vault · shrine"; if (!QS.has("dist")) stage.cam.dist = 52;
  const f = cam(-3, -2.5);
  for (let i = 0; i < 3; i++) for (let k = 0; k < 2; k++) put(K.ruinFloor(i + k), f.x - 4 + i * 4, f.z - 2 + k * 4, (i + k) % 2 ? Math.PI / 2 : 0);
  put(K.pillar(0), f.x - 6.6, f.z - 4.6); put(K.pillar(1), f.x - 2.2, f.z - 4.8); put(K.pillar(2), f.x + 2.2, f.z - 4.9, 0.2); put(K.pillar(0), f.x + 6.8, f.z - 4.4);
  put(K.pillar(1), f.x - 6.8, f.z + 4.6); put(K.pillar(0), f.x + 6.8, f.z + 4.5);
  put(K.arch(), f.x - 0.5, f.z + 4.9, 0); put(K.ruinSteps(), f.x - 0.5, f.z + 6.6, Math.PI);
  put(K.rubblePile(), f.x + 4.6, f.z + 0.4, 0.6); put(K.crate("wood"), f.x - 3.2, f.z + 1.2, 0.3); put(K.crate("green", { open: OPEN }), f.x + 3.0, f.z - 1.4, -0.3); put(K.barrel(0), f.x - 2.0, f.z + 2.4);
  putc(K.brokenWall(), -10.5, 3.2, 0.5);
  // the vine door and the vault behind it
  const d = cam(4.2, 4.2); put(K.door(OPEN), d.x, d.z, 0);
  wall("stone", d.x - 6.3, d.z, d.x - 2.6, d.z); wall("stone", d.x + 2.6, d.z, d.x + 4.45, d.z);
  put(K.vault(), d.x + 1.2, d.z - 5.4, 0); put(K.crate("gold", { open: OPEN }), d.x + 2.2, d.z - 6.4, 0, 0.5); put(K.fusebox(), d.x + 4.2, d.z + 1.0, -0.4);
  // the cracked wall and the secret shrine behind it
  const w = cam(-10.5, -4.6);
  wall("stone", w.x, w.z - 3.7, w.x, w.z, true); wall("stone", w.x, w.z, w.x, w.z + 3.7); wall("stone", w.x, w.z - 7.4, w.x, w.z - 3.7);
  put(K.statue(), w.x - 2.6, w.z - 1.85, 0.5); put(K.ruinFloor(2), w.x - 2.6, w.z - 1.6, 0);
  monkey(f.x + 0.8, f.z + 1.6, 0.8); monkey(d.x - 0.6, d.z + 2.2, 0.2);
}
function landmarks() {
  ground("#c9b384"); label = "landmarks";
  const which = QS.get("which") ?? "all";
  if (which === "all") {
    if (!QS.has("dist")) stage.cam.dist = 86; scene.fog = null;
    put(K.ferry(), -17, -9); wall("hull", -21, -11.5, -21, -6.5, true); put(K.crate("green"), -15, -8.5, 0.3); put(K.crate("wood"), -18, -10, -0.2);
    put(K.bomber(), 6, -12, 0.3); put(K.vat(), -20, 9); put(K.tractor(), -6, 8, 0.4); put(K.falls(), 16, 8); put(K.audit(), 2, 12, 0.3); put(K.bottle(), -11, 15); put(K.lemonStand(), 5, 16);
    monkey(-22.5, -6, 1.2); monkey(-3, 11, 0.5); monkey(-16, 12.5, 0.5); monkey(15, 15, 2.6); monkey(8, -5, 0.3);
  } else {
    const b = put((K as unknown as Record<string, () => K.Built>)[which](), 0, 0, which === "bomber" ? 0.3 : which === "tractor" ? 0.4 : 0);
    if (which === "ferry") { const w = wall("hull", -4, -2.5, -4, 2.5, true); void w; put(K.crate("green"), 2, -0.5, 0.3); put(K.crate("wood"), -1, 1, -0.2); monkey(-0.5, -0.8, 0.9); }
    else monkey(which === "vat" ? -3.2 : 3.4, which === "vat" ? 3.2 : 3.0, 0.6);
    void b;
  }
}
function traversal() {
  ground("#c2b184"); label = "traversal + exits"; if (!QS.has("dist")) stage.cam.dist = 62; scene.fog = null;
  for (let i = 0; i < 3; i++) put(K.boardwalk(i === 1 ? 1 : 0), -14 + i * 4, -8); put(K.boardwalk(2), -3.3, -8);
  put(K.bridge(), -12, -2.5); put(K.raft(), -4, -2.5, 0, 0); put(K.hatch(OPEN), 3, -3); put(K.supplyDrop(), 12, -5);
  put(K.portal("cove-cave"), -13, 6); put(K.portal("hollow-roots"), -4, 6.5); put(K.portal("back"), 5, 6.5); put(K.portal("camp-well"), 12.5, 4);
  const z = K.zipline(new THREE.Vector3(14, 0, 12), new THREE.Vector3(-8, 0, 15)); pieces.push(...z.pieces); scene.add(z.parts.root);
  monkey(3, -0.6, 0.4); monkey(-13, 9.2, 0.5); monkey(-8, 17, 1.0);
}
function bunker() {
  label = "the bunker" + (QS.has("fx") ? " (all four upgrades bought)" : "");
  scene.fog = null; stage.hemi.intensity = 1.4; stage.sun.intensity = 2.5;
  const b = put(K.bunkerRoom());
  if (QS.has("fx")) for (const id of ["mag", "pack", "heart", "neon"]) b.parts[id].visible = true;
  const lamp = new THREE.PointLight("#ffc27a", 30, 16, 1.4); lamp.position.set(0, 3.4, 0); scene.add(lamp);
  if (!QS.has("fx")) focus.set(0, 0.5, -1.2); else focus.set(0, 0.5, -1.2);
  if (QS.has("fx") && !QS.has("fz")) focus.set(Number(QS.get("fx")) || 0, 0.5, -1.2);
  monkey(0, 2.4, Math.PI);
}
/** call every builder once and report what came back (window.selftest; used by the scripted check) */
function selftest() {
  ground("#c9b384");
  const out: Record<string, { pieces: number; tris: number; parts: string[]; bad: number }> = {};
  const run = (name: string, f: () => K.Built) => {
    const b = f(); let tris = 0, bad = 0;
    for (const p of b.pieces) { const a = p.geo.attributes; tris += a.position.count / 3; if (!a.normal || !a.color || a.color.itemSize !== 3 || p.geo.index) bad++; for (let i = 0; i < a.position.array.length; i++) if (!Number.isFinite(a.position.array[i])) { bad++; break; } }
    out[name] = { pieces: b.pieces.length, tris, parts: Object.keys(b.parts).filter((k) => k !== "root"), bad };
  };
  for (const t of ["wood", "green", "gold"] as const) run(`crate(${t})`, () => K.crate(t, { open: true }));
  for (const [n, f] of Object.entries({ barrel: K.barrel, sack: K.sack, bananaStash: K.bananaStash, ammoBox: K.ammoBox, satchel: K.satchel, tent: K.tent, tarp: K.tarp, bedroll: K.bedroll, campfire: K.campfire, lantern: K.lantern, fence: K.fence, gate: K.gate, watchtower: K.watchtower, well: K.well, logBench: K.logBench, signpost: K.signpost,
    rubblePile: K.rubblePile, ruinFloor: K.ruinFloor, ruinSteps: K.ruinSteps, pillar: K.pillar, brokenWall: K.brokenWall, arch: K.arch, door: K.door, vault: K.vault, plinth: K.plinth, fusebox: K.fusebox, statue: K.statue,
    ferry: K.ferry, bomber: K.bomber, vat: K.vat, tractor: K.tractor, audit: K.audit, falls: K.falls, bottle: K.bottle, lemon: K.lemon, boardwalk: K.boardwalk, bridge: K.bridge, raft: K.raft, hatch: K.hatch, supplyDrop: K.supplyDrop, bunkerRoom: K.bunkerRoom })) run(n, f as () => K.Built);
  for (const k of ["palisade", "stone", "hull", "rock", "fence"] as const) { run(`wallSection(${k})`, () => K.wallSection(k, { length: 6 })); if (k !== "fence") run(`wallSection(${k}, breakable)`, () => K.wallSection(k, { length: 6, breakable: true })); }
  for (const k of ["camp-well", "cove-cave", "hollow-roots", "back"]) run(`portal(${k})`, () => K.portal(k));
  run("zipline", () => K.zipline(new THREE.Vector3(9, 0, 6), new THREE.Vector3(15, 0, 61)));
  (window as unknown as { selftest: unknown }).selftest = { builders: Object.keys(out).length, assets: K.buildAssetNames().length, bad: Object.entries(out).filter(([, v]) => v.bad || (!v.pieces && !v.parts.length)).map(([k]) => k), out };
  label = `selftest: ${Object.keys(out).length} builders`;
}
function one() {
  ground(QS.get("ground") ?? "#c9b384");
  const name = QS.get("name") ?? "crate_wood", fn = (K as unknown as Record<string, (...a: unknown[]) => K.Built>)[name];
  const b = put(typeof fn === "function" && !K.buildAssetNames().includes(name) ? fn() : K.asset(name), 0, 0, Number(QS.get("yaw") ?? 0));
  if (OPEN) openUp(b); if (BROKEN) breakUp(b);
  if (!QS.has("nomonkey")) monkey(Number(QS.get("mx") ?? 2.2), Number(QS.get("mz") ?? 1.2), 0.5);
  label = name; if (!QS.has("dist")) stage.cam.dist = 16;
}

async function main() {
  const groups = (QS.get("groups") ?? "").split(",").filter(Boolean);
  await K.preloadBuild(undefined, groups.length ? groups : undefined);
  try { const man = await (await fetch("/models/build/manifest.json")).json(); for (const g of Object.keys(man.groups ?? {})) for (const n of Object.keys(man.groups[g].assets)) GROUP_OF.set(n, g); } catch { /* optional */ }
  ({ lineup, camp, ruin, landmarks, traversal, bunker, one, selftest } as Record<string, () => void>)[view]?.();
  scene.add(mergePieces(pieces));
  let tris = 0; scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.geometry) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; });
  document.getElementById("tag")!.innerHTML = `<b>${view}</b> ${label} · ${Math.round(tris)} tris`;
  document.getElementById("nav")!.innerHTML = ["lineup", "camp", "ruin", "landmarks", "traversal", "bunker"].map((v) => `<a href="?view=${v}">${v}</a>`).join("");
  let t = 0;
  const loop = () => { t += 1 / 60; stage.place(focus, 1 / 60, t); stage.render(1 / 60); (window as unknown as { calls: number }).calls = stage.renderer.info.render.calls; requestAnimationFrame(loop); };
  loop();
}
main();
