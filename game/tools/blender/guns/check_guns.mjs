// three.js load check for the kit guns (the same GLTFLoader the game uses, run in node).
//
//   node tools/blender/guns/check_guns.mjs [gunId ...]
//
// For every gun in tools/blender/guns/manifest.json (or the ids given): public/models/guns/<gunId>.glb loads; the root
// is <gunId> with one child `body`; every mesh node resolves with the attributes and the palette textures the gun
// material needs; the flash point, the eject point and every socket resolve under `body` as bare, unrotated empties;
// each socket's `rides` names a node that rests at the identity; the moving part and the magazine named in the root's
// extras exist; a part that turns has its origin on its pivot; the gun is under its triangle budget; and a sight and a
// muzzle device from attachments.glb, added to their sockets untouched, land on the gun. Exits non-zero on a failure.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

globalThis.self ??= globalThis;
globalThis.createImageBitmap ??= async () => ({ width: 32, height: 32, close() {} });   // node has no image decoder

const MODELS = fileURLToPath(new URL("../../../public/models/", import.meta.url));
const MANIFEST = JSON.parse(readFileSync(fileURLToPath(new URL("./manifest.json", import.meta.url)), "utf8"));
const load = (file) => new Promise((ok, bad) => {
  const b = readFileSync(MODELS + file);
  new GLTFLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), "", ok, bad);
});
let bad = 0;
const fail = (msg) => { console.error("FAIL", msg); bad++; };
const near = (a, b, eps = 1e-5) => Math.abs(a - b) < eps;
const ident = (o) => near(o.quaternion.w, 1) && near(o.scale.x, 1) && near(o.scale.y, 1) && near(o.scale.z, 1);
const r3 = (v) => v.toArray().map((x) => +x.toFixed(3));
const tris = (o) => { let n = 0; o.traverse((m) => { if (m.isMesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; }); return n; };

const att = await load("attachments.glb");
const FIT = [["att_sight_holo", "socket_sight"], ["att_sight_2x", "socket_sight"], ["att_muzzle_comp", "socket_muzzle"], ["att_muzzle_supp", "socket_muzzle"]];
const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(MANIFEST);
let total = 0;
for (const id of ids) {
  const want = MANIFEST[id];
  if (!want) { fail(`${id}: not in manifest.json`); continue; }
  const gltf = await load(`guns/${id}.glb`), before = bad;
  const node = (name) => { const o = gltf.scene.getObjectByName(name); if (!o) fail(`${id}: no node "${name}"`); return o; };
  const root = node(id), body = node("body");
  if (!root || !body) continue;
  if (gltf.scene.children.length !== 1 || gltf.scene.children[0] !== root) fail(`${id}: the scene's one root must be "${id}"`);
  if (body.parent !== root || root.children.length !== 1) fail(`${id}: "body" must be the root's only child`);
  if (!ident(root) || !ident(body) || root.position.length() > 1e-6 || body.position.length() > 1e-6) fail(`${id}: root or body is not at the identity`);
  const ud = root.userData;
  if (ud.gunId !== id || ud.gunClass !== want.class || ud.tier !== want.tier) fail(`${id}: root extras say ${ud.gunId} / ${ud.gunClass} / ${ud.tier}`);
  // ---- mesh nodes
  for (const name of want.nodes) {
    const m = node(name); if (!m) continue;
    if (!m.isMesh) { fail(`${id}: "${name}" is not a single mesh`); continue; }
    if (m.parent !== body) fail(`${id}: "${name}" is not a child of body`);
    for (const a of ["position", "normal", "uv", "color"]) if (!m.geometry.attributes[a]) fail(`${id}: "${name}" has no ${a}`);
    if (m.material.name !== "MAT_Kingpin" || !m.material.map || !m.material.metalnessMap) fail(`${id}: "${name}" is not MAT_Kingpin with the palette textures`);
    const piv = want.pivots[name];
    if (piv ? m.position.distanceTo(new THREE.Vector3(...piv)) > 1e-4 : m.position.length() > 1e-6) fail(`${id}: "${name}" origin is at ${r3(m.position)}, expected ${piv ?? "the identity"}`);
    if (!ident(m)) fail(`${id}: "${name}" is rotated or scaled`);
  }
  const meshes = []; gltf.scene.traverse((m) => { if (m.isMesh) meshes.push(m.name); });
  if (meshes.sort().join() !== [...want.nodes].sort().join()) fail(`${id}: meshes are ${meshes}, manifest says ${want.nodes}`);
  // ---- the moving part and the magazine
  for (const k of ["moving", "mag", "builtinSight"]) if (ud[k] !== undefined && !want.nodes.includes(ud[k])) fail(`${id}: extras.${k} = "${ud[k]}" is not a mesh node`);
  if (!ud.moving || !(ud.travel > 0)) fail(`${id}: extras need moving + travel`);
  if (!ud.mag) fail(`${id}: extras need mag`);
  // ---- points and sockets
  for (const name of ["muzzle_flash", "eject"]) {
    const p = node(name); if (!p) continue;
    if (p.parent !== body || p.isMesh || p.children.length || !ident(p)) fail(`${id}: "${name}" must be a bare unrotated empty under body`);
  }
  for (const need of ["socket_sight", "socket_muzzle", "socket_mag", "socket_rail"]) if (!want.sockets[need]) fail(`${id}: no ${need}`);
  for (const [name, { at, rides }] of Object.entries(want.sockets)) {
    const s = node(name); if (!s) continue;
    if (s.parent !== body || s.isMesh || s.children.length) fail(`${id}: ${name} is not a bare empty under body`);
    if (!ident(s)) fail(`${id}: ${name} is rotated or scaled (its axes must be the gun's)`);
    if (s.position.distanceTo(new THREE.Vector3(...at)) > 1e-4) fail(`${id}: ${name} is at ${r3(s.position)}, manifest says ${at}`);
    if (s.userData.rides !== rides) fail(`${id}: ${name} rides "${s.userData.rides}", manifest says "${rides}"`);
    const part = rides === "body" ? body : node(rides);
    if (part && rides !== "body" && (part.position.length() > 1e-6 || !ident(part))) fail(`${id}: ${name} rides "${rides}", which does not rest at the identity`);
  }
  const flash = node("muzzle_flash"), crown = node("socket_muzzle");
  if (flash && crown && !(near(flash.position.x, crown.position.x) && near(flash.position.y, crown.position.y) && flash.position.z > crown.position.z)) fail(`${id}: muzzle_flash is not straight ahead of socket_muzzle`);
  // ---- budget
  const n = tris(gltf.scene), budget = want.class === "lmg" ? 3500 : 2500; total += n;
  if (n !== want.tris) fail(`${id}: ${n} tris, manifest says ${want.tris}`);
  if (n >= budget) fail(`${id}: ${n} tris, budget ${budget}`);
  // ---- a sight and a muzzle device through the sockets, as the game fits them
  gltf.scene.updateMatrixWorld(true);
  const gunBox = new THREE.Box3();
  for (const name of want.nodes) if (name !== ud.builtinSight) { const m = gltf.scene.getObjectByName(name); if (m) gunBox.expandByObject(m); }
  for (const [piece, socket] of FIT) {
    const s = gltf.scene.getObjectByName(socket); if (!s) continue;
    const fitted = att.scene.getObjectByName(piece).clone(); s.add(fitted); gltf.scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(fitted); s.remove(fitted);
    if (!box.intersectsBox(gunBox)) fail(`${id}: ${piece} on ${socket} does not reach the gun`);
  }
  const sock = Object.entries(want.sockets).map(([k, v]) => `${k.replace("socket_", "")}>${v.rides}`).join(" ");
  console.log(`${bad === before ? "ok  " : "FAIL"} ${id.padEnd(20)} ${want.class.padEnd(8)} ${want.tier.padEnd(5)} ${String(n).padStart(5)} tris  moving ${String(ud.moving).padEnd(12)} travel ${ud.travel}  mag ${String(ud.mag).padEnd(8)}  sockets ${sock}  flash ${JSON.stringify(flash ? r3(flash.position) : null)}`);
}
if (bad) { console.error(`${bad} failure(s)`); process.exit(1); }
console.log(`all good: ${ids.length} guns, ${total} tris in total`);
