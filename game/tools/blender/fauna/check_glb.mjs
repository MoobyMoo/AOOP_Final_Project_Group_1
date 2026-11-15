// three.js load check for the wildlife and the G2 containers (the same GLTFLoader the game uses, run in node).
//
//   node tools/blender/fauna/check_glb.mjs
//
// fauna.glb: every `fauna_<id>` root resolves with one skinned mesh under it, every bone and clip name in
// tools/blender/fauna/manifest.json resolves, every clip track binds to a bone of its own animal, and an
// AnimationMixer on a clone of the root actually moves the skeleton. containers.glb: the five old containers are
// still there, and each new `cont_<type>` has the `lid` part, the `mark` point and the static mesh kit_build.ts reads.
// Exits non-zero on the first failure.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";

globalThis.self ??= globalThis;
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const load = (file) => new Promise((ok, bad) => {
  const b = readFileSync(ROOT + "public/models/" + file);
  new GLTFLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), "", ok, bad);
});
const fail = (msg) => { console.error("FAIL", msg); process.exit(1); };
const tris = (o) => { let n = 0; o.traverse((m) => { if (m.isMesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; }); return n; };

// ---------------------------------------------------------------- fauna.glb
const man = JSON.parse(readFileSync(ROOT + "tools/blender/fauna/manifest.json", "utf8"));
const fauna = await load("fauna.glb");
const clipNames = fauna.animations.map((a) => a.name);
const want = Object.values(man.animals).flatMap((a) => Object.keys(a.clips));
if (clipNames.slice().sort().join() !== want.slice().sort().join()) fail(`fauna.glb: clips are ${clipNames}, expected ${want}`);
console.log(`fauna.glb      ok  ${fauna.scene.children.length} roots, ${fauna.animations.length} clips, ${tris(fauna.scene)} tris`);
for (const [id, a] of Object.entries(man.animals)) {
  const root = fauna.scene.getObjectByName(a.root) ?? fail(`fauna.glb: no node "${a.root}"`);
  if (root.parent !== fauna.scene) fail(`${a.root}: not a root node`);
  if (root.position.length() > 1e-6 || Math.abs(root.scale.x - 1) > 1e-6 || Math.abs(Math.abs(root.quaternion.w) - 1) > 1e-6) fail(`${a.root}: not at the identity`);
  const skinned = []; root.traverse((o) => { if (o.isSkinnedMesh) skinned.push(o); });
  if (skinned.length !== 1 || skinned[0].name !== a.mesh) fail(`${a.root}: skinned meshes ${skinned.map((s) => s.name)}`);
  const mesh = skinned[0], g = mesh.geometry;
  for (const at of ["position", "normal", "color", "skinIndex", "skinWeight"]) if (!g.attributes[at]) fail(`${a.mesh}: no ${at}`);
  if (!mesh.material.vertexColors || mesh.material.name !== "MAT_Fauna") fail(`${a.mesh}: material "${mesh.material.name}" does not use the vertex colours`);
  const n = tris(root);
  if (n !== a.tris || n > a.budget) fail(`${a.mesh}: ${n} tris (manifest ${a.tris}, budget ${a.budget})`);
  const bones = mesh.skeleton.bones.map((b) => b.name);
  for (const b of a.bones) if (!root.getObjectByName(b)?.isBone) fail(`${a.root}: no bone "${b}"`);
  const strays = bones.filter((b) => !b.startsWith(id + "_"));
  if (strays.length) fail(`${a.root}: bones without the "${id}_" prefix: ${strays}`);
  // every clip of this animal binds only to this animal's bones, and plays on a clone
  const clone = SkeletonUtils.clone(root), mixer = new THREE.AnimationMixer(clone);
  const rows = [];
  for (const [cname, c] of Object.entries(a.clips)) {
    const clip = THREE.AnimationClip.findByName(fauna.animations, cname) ?? fail(`fauna.glb: no clip "${cname}"`);
    if (Math.abs(clip.duration - c.seconds) > 1e-3) fail(`${cname}: ${clip.duration} s, manifest says ${c.seconds}`);
    for (const t of clip.tracks) { const node = t.name.split(".")[0]; if (!a.bones.includes(node)) fail(`${cname}: track "${t.name}" is not on a ${id} bone`); }
    const posed = new Set(clip.tracks.filter((t) => t.name.endsWith(".quaternion")).map((t) => t.name.split(".")[0]));
    const deform = a.bones.filter((b) => b !== id + "_root");
    const miss = deform.filter((b) => !posed.has(b));
    if (miss.length) fail(`${cname}: no rotation track for ${miss}`);
    mixer.stopAllAction(); const act = mixer.clipAction(clip); act.play(); mixer.setTime(clip.duration * 0.5); clone.updateMatrixWorld(true);
    if (act.getEffectiveWeight() !== 1) fail(`${cname}: did not play`);
    const first = clip.tracks[0].values, seam = c.loop ? clip.tracks.every((t) => { const k = t.getValueSize(), v = t.values; let d = 0; for (let i = 0; i < k; i++) d = Math.max(d, Math.abs(Math.abs(v[i]) - Math.abs(v[v.length - k + i]))); return d < 1e-3; }) : null;
    if (c.loop && !seam) fail(`${cname}: a loop whose last key differs from its first`);
    void first;
    rows.push(`${cname} ${c.seconds.toFixed(2)} s${c.loop ? " loop" : ""}`);
  }
  const box = new THREE.Box3().setFromObject(root);
  console.log(`  ${a.root.padEnd(13)} ${String(n).padStart(4)} tris  ${String(bones.length).padStart(2)} bones  box y ${box.min.y.toFixed(2)} .. ${box.max.y.toFixed(2)}  ${rows.join(", ")}`);
}

// the levels the game relies on, measured on the skinned mesh in three.js (they must match chain_check.py in Blender)
const span = (id, clipName, frac) => {
  const a = man.animals[id], clone = SkeletonUtils.clone(fauna.scene.getObjectByName(a.root)), mixer = new THREE.AnimationMixer(clone);
  const clip = THREE.AnimationClip.findByName(fauna.animations, clipName);
  mixer.clipAction(clip).play(); mixer.setTime(Math.min(clip.duration * frac, clip.duration - 1e-4)); clone.updateMatrixWorld(true);
  let mesh; clone.traverse((o) => { if (o.isSkinnedMesh) mesh = o; });
  mesh.skeleton.update();
  const v = new THREE.Vector3(); let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < mesh.geometry.attributes.position.count; i++) { mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld); lo = Math.min(lo, v.y); hi = Math.max(hi, v.y); }
  return [lo, hi];
};
for (const [id, clip, frac, what, test] of [
  ["crab", "crab_burrow", 1, "all under the sand", (lo, hi) => hi < 0],
  ["frog", "frog_hop", 0.5, "airborne at the apex", (lo) => lo > 0.25],
  ["boar", "boar_death", 1, "lies on the ground", (lo, hi) => lo > -0.04 && hi < 1.2],
  ["croc", "croc_lurk", 0, "eyes and scutes above the water line", (lo, hi) => hi > 0.06 && hi < 0.2],
  ["croc", "croc_bite", 0, "surfaced", (lo, hi) => hi > 0.25 && hi < 0.4],
  ["croc", "croc_retreat", 1, "all under the water line", (lo, hi) => hi < -0.05],
]) {
  const [lo, hi] = span(id, clip, frac);
  if (!test(lo, hi)) fail(`${clip} at ${frac}: skinned y ${lo.toFixed(3)} .. ${hi.toFixed(3)}, expected ${what}`);
  console.log(`  level ${clip.padEnd(13)} at ${frac}: skinned y ${lo.toFixed(3).padStart(6)} .. ${hi.toFixed(3).padStart(6)}  ${what}`);
}

// ---------------------------------------------------------------- containers.glb
const cont = await load("build/containers.glb");
const OLD = ["cont_weapon", "cont_food", "cont_ammo", "cont_parts", "cont_medical"], NEW = ["cont_lunchbox", "cont_toolbox", "cont_medcabinet", "cont_safe", "cont_trash", "cont_sack"];
console.log(`containers.glb ok  ${cont.scene.children.length} roots`);
cont.scene.updateMatrixWorld(true);
for (const name of [...OLD, ...NEW]) {
  const root = cont.scene.children.find((c) => c.userData.asset === name) ?? fail(`containers.glb: no asset "${name}"`);
  if (root.name !== name) fail(`${name}: node is named "${root.name}"`);
  const kids = Object.fromEntries(root.children.map((c) => [c.userData.kind === "static" ? "static" : c.userData.part, c]));
  const lid = kids.lid ?? fail(`${name}: no "lid" part`), mark = kids.mark ?? fail(`${name}: no "mark" point`);
  if (!kids.static?.isMesh || !lid.isMesh) fail(`${name}: static or lid is not a mesh`);
  if (lid.userData.kind !== "part" || mark.userData.kind !== "point") fail(`${name}: lid / mark kinds are ${lid.userData.kind} / ${mark.userData.kind}`);
  if (Math.abs(Math.abs(lid.quaternion.w) - 1) > 1e-6) fail(`${name}: the lid is rotated at rest (kit_build sets rotation.x from 0)`);
  for (const m of [kids.static, lid]) if (!m.geometry.attributes.color) fail(`${name}: no COLOR_0 on ${m.name}`);
  const n = tris(root);
  if (NEW.includes(name) && n >= 1200) fail(`${name}: ${n} tris`);
  if (n !== root.userData.tris) fail(`${name}: ${n} tris, extras say ${root.userData.tris}`);
  // open it the way kit_build does and make sure the lid really leaves its closed place
  const closed = new THREE.Box3().setFromObject(lid).getCenter(new THREE.Vector3());
  lid.rotation.x = -1.9; cont.scene.updateMatrixWorld(true);
  const open = new THREE.Box3().setFromObject(lid).getCenter(new THREE.Vector3());
  lid.rotation.x = 0; cont.scene.updateMatrixWorld(true);
  if (open.distanceTo(closed) < 0.1) fail(`${name}: opening the lid does not move it`);
  const box = new THREE.Box3().setFromObject(root), r2 = (v) => v.toArray().map((x) => +x.toFixed(2));
  console.log(`  ${name.padEnd(16)} ${String(n).padStart(4)} tris  hinge ${JSON.stringify(r2(lid.position))}  mark ${JSON.stringify(r2(mark.position))}  box ${JSON.stringify(r2(box.min))} .. ${JSON.stringify(r2(box.max))}${root.userData.wallMount ? "  wall-mounted, mountZ " + root.userData.mountZ : ""}`);
}
console.log(`all good: 5 animals, ${fauna.animations.length} clips, 11 containers`);
