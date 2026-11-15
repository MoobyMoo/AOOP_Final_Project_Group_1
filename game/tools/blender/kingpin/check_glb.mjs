// three.js load check for the Kingpin and its attachments (the same GLTFLoader the game uses, run in node).
//
//   node tools/blender/kingpin/check_glb.mjs
//
// Confirms that kingpin45.glb still has every node, mesh, clip and texture src/game/combat/kingpin.ts reads, that the
// four sockets resolve under `body` with the gun's own axes, that every att_* node in attachments.glb resolves at the
// identity with the attributes the gun's material needs, and that each piece, added to its socket untouched, lands on
// the gun. Exits non-zero on the first failure.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// node has no image decoder; the loader only needs the textures to exist, so hand it blank bitmaps
globalThis.self ??= globalThis;
globalThis.createImageBitmap ??= async () => ({ width: 32, height: 32, close() {} });

const MODELS = fileURLToPath(new URL("../../../public/models/", import.meta.url));
const load = (file) => new Promise((ok, bad) => {
  const b = readFileSync(MODELS + file);
  new GLTFLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), "", ok, bad);
});
const fail = (msg) => { console.error("FAIL", msg); process.exit(1); };
const near = (a, b, eps = 1e-5) => Math.abs(a - b) < eps;
const r4 = (v) => v.toArray().map((x) => +x.toFixed(4));
const tris = (o) => { let n = 0; o.traverse((m) => { if (m.isMesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; }); return n; };

const SOCKETS = { socket_sight: "slide", socket_muzzle: "body", socket_mag: "mag", socket_rail: "body" };
const FIT = { att_sight_holo: "socket_sight", att_sight_2x: "socket_sight", att_muzzle_comp: "socket_muzzle", att_muzzle_supp: "socket_muzzle", att_mag_ext: "socket_mag", att_laser: "socket_rail" };
const EMISSIVE = { att_sight_holo: "sight_dot", att_laser: "laser_emit" };

// ---- the gun: everything kingpin.ts reads, then the sockets
const gun = await load("kingpin45.glb");
const node = (name) => gun.scene.getObjectByName(name) ?? fail(`kingpin45.glb: no node "${name}"`);
for (const n of ["kingpin45", "body", "muzzle", "eject"]) node(n);
for (const n of ["frame", "slide", "hammer", "trigger", "mag", "mag_ext"]) if (!node(n).isMesh) fail(`kingpin45.glb: "${n}" is not a mesh`);
for (const c of ["fire", "reload"]) if (!gun.animations.find((a) => a.name === c)) fail(`kingpin45.glb: no clip "${c}"`);
const gm = node("frame").material;
if (!gm.map || !gm.metalnessMap) fail("kingpin45.glb: palette textures missing");
if (!near(node("kingpin45").scale.x, 1) || !near(node("body").scale.x, 1)) fail("kingpin45.glb: root or body scale is not 1");
console.log(`kingpin45.glb   ok  nodes, 6 meshes (${tris(gun.scene)} tris), clips fire + reload, palette map + orm, extras ${JSON.stringify(node("kingpin45").userData)}`);
for (const [name, rides] of Object.entries(SOCKETS)) {
  const s = node(name);
  if (s.parent !== node("body")) fail(`${name}: parent is "${s.parent?.name}", expected "body"`);
  if (s.isMesh || s.children.length) fail(`${name}: not a bare empty`);
  if (!near(s.quaternion.w, 1) || !near(s.scale.x, 1) || !near(s.scale.y, 1) || !near(s.scale.z, 1)) fail(`${name}: rotated or scaled (its axes must be the gun's)`);
  if (s.userData.rides !== rides) fail(`${name}: rides "${s.userData.rides}", expected "${rides}"`);
  if (rides !== "body" && (node(rides).position.length() > 1e-6 || !near(node(rides).quaternion.w, 1))) fail(`${name}: "${rides}" does not rest at the identity, so the socket point would not hold under it`);
  console.log(`  ${name.padEnd(14)} position ${JSON.stringify(r4(s.position)).padEnd(24)} rotation identity  rides ${rides}`);
}

// ---- the attachments
const att = await load("attachments.glb");
const top = att.scene.children.map((c) => c.name).sort();
if (top.join() !== Object.keys(FIT).sort().join()) fail(`attachments.glb: root nodes are ${top}`);
gun.scene.updateMatrixWorld(true);
const gunBox = new THREE.Box3();
for (const n of ["frame", "slide", "mag"]) gunBox.expandByObject(node(n));
let total = 0;
console.log(`attachments.glb ok  root nodes ${top.join(", ")}`);
for (const [name, socket] of Object.entries(FIT)) {
  const a = att.scene.getObjectByName(name) ?? fail(`attachments.glb: no node "${name}"`);
  if (a.position.length() > 1e-6 || !near(a.quaternion.w, 1) || !near(a.scale.x, 1)) fail(`${name}: not at the identity`);
  const meshes = []; a.traverse((m) => { if (m.isMesh) meshes.push(m); });
  if (!meshes.length) fail(`${name}: no mesh`);
  for (const m of meshes) for (const at of ["position", "normal", "uv", "color"]) if (!m.geometry.attributes[at]) fail(`${name}: primitive "${m.material.name}" has no ${at}`);
  const mats = meshes.map((m) => m.material.name);
  if (!meshes.some((m) => m.material.name === "MAT_Kingpin" && m.material.map && m.material.metalnessMap)) fail(`${name}: no MAT_Kingpin primitive with the palette textures`);
  const em = EMISSIVE[name];
  if (em) {
    const m = meshes.find((x) => x.material.name === em)?.material ?? fail(`${name}: no material "${em}"`);
    if (!(m.emissive.r > 0.5 && m.emissiveIntensity > 1)) fail(`${name}: "${em}" is not emissive red`);
  } else if (mats.length !== 1) fail(`${name}: materials ${mats}`);
  const n = tris(a); total += n;
  if (n >= 1500) fail(`${name}: ${n} tris`);
  // fit: add it to the socket untouched, as the game will
  const fitted = a.clone(); node(socket).add(fitted); gun.scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(fitted); node(socket).remove(fitted);
  if (!box.intersectsBox(gunBox)) fail(`${name}: on ${socket} it does not reach the gun`);
  console.log(`  ${name.padEnd(16)} ${String(n).padStart(4)} tris  materials ${mats.join(" + ").padEnd(24)} on ${socket.padEnd(13)} gun-space box ${JSON.stringify(r4(box.min))} .. ${JSON.stringify(r4(box.max))}  extras ${JSON.stringify(a.userData)}`);
}
if (total >= 6000) fail(`attachments.glb: ${total} tris in total`);
console.log(`all good: 4 sockets, 6 attachments, ${total} tris in total`);
