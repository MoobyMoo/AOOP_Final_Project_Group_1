// World kit: code-built props and foliage in the bright look (moved out of src/look/main.ts for G1).
// Every builder returns a Group/Mesh positioned at the origin; callers place it. Randomness uses the shared seeded rng.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mat, surf, patch } from "../render/shading";
import { rnd, rr, V } from "../core/rng";
import { vnoise } from "./noise";
export function jitter(g: THREE.BufferGeometry, amt: number) {
  if (g.index) g = g.toNonIndexed(); const p = g.attributes.position as THREE.BufferAttribute, map = new Map<string, THREE.Vector3>();
  for (let i = 0; i < p.count; i++) { const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`; if (!map.has(k)) map.set(k, V(rr(-amt, amt), rr(-amt, amt), rr(-amt, amt))); const o = map.get(k)!; p.setXYZ(i, p.getX(i) + o.x, p.getY(i) + o.y, p.getZ(i) + o.z); }
  g.computeVertexNormals(); return g;
}
export function withPos<T extends THREE.Object3D>(m: T, p: THREE.Vector3) { m.position.copy(p); return m; }
export const LEAF = ["#4f8f3a", "#5f9e3f", "#457f34", "#6aa845", "#3f7a33"];
export function broadTree(s = 1) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(jitter(new THREE.CylinderGeometry(0.22 * s, 0.38 * s, 3.4 * s, 7, 3), 0.05), mat("#7a5a3c", { flat: true, rim: 0.2 }));
  trunk.position.y = 1.7 * s; trunk.rotation.z = rr(-0.08, 0.08); g.add(trunk);
  const n = 4 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const r = rr(1.1, 1.7) * s, blob = new THREE.Mesh(jitter(new THREE.IcosahedronGeometry(r, 1), r * 0.12), mat(LEAF[Math.floor(rnd() * LEAF.length)], { flat: true, rim: 0.55 }));
    const a = (i / n) * Math.PI * 2 + rnd(); blob.position.set(Math.cos(a) * rr(0.6, 1.3) * s, (3.4 + rr(0, 1.2)) * s, Math.sin(a) * rr(0.6, 1.3) * s); blob.scale.y = 0.8; g.add(blob);
  }
  return g;
}
export function palm(s = 1) {
  const g = new THREE.Group(), lean = rr(-0.35, 0.35), segs = 6, h = rr(3.6, 4.6) * s;
  let top = V(0, 0, 0);
  for (let i = 0; i < segs; i++) {
    const t = i / segs, seg = new THREE.Mesh(new THREE.CylinderGeometry(0.17 * s, 0.21 * s, h / segs + 0.05, 7), mat(i % 2 ? "#8a6a45" : "#7c5e3c", { flat: true, rim: 0.2 }));
    seg.position.set(Math.sin(lean) * t * t * 1.6 * s, (t + 0.5 / segs) * h, 0); g.add(seg); top = seg.position.clone().setY((t + 1 / segs) * h);
  }
  const crown = 6 + Math.floor(rnd() * 3), tilt = rr(-0.3, 0.3);
  for (let i = 0; i < crown; i++) { // fronds: one bent, tapered leaf blade each, arching out and down
    if (rnd() < 0.12) continue; // a missing frond now and then
    const a = (i / crown) * Math.PI * 2 + rr(-0.25, 0.25), fr = new THREE.Group(); fr.position.copy(top); fr.rotation.set(0, a, tilt); g.add(fr);
    const len = rr(1.8, 2.6) * s, droop = rr(0.7, 1.4), wid = rr(0.38, 0.5) * s, segs = 8;
    const geo = new THREE.PlaneGeometry(len, wid, segs, 2); geo.rotateX(-Math.PI / 2); geo.translate(len / 2, 0, 0);
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < p.count; k++) { const x = p.getX(k), t = x / len, zz = p.getZ(k); p.setY(k, Math.sin(t * Math.PI * 0.55) * 0.35 * s - t * t * droop * s - Math.abs(zz) * 0.6); p.setZ(k, zz * (1 - t * 0.85) * (1 + Math.sin(t * 40) * 0.08)); }
    geo.computeVertexNormals();
    const leaf = new THREE.Mesh(geo, surf({ color: ["#3f7f33", "#4c8f38", "#58a03f", "#6aa845"][i % 4], roughness: 0.8, side: THREE.DoubleSide }));
    patch(leaf.material as THREE.MeshStandardMaterial, { rim: 0.6 }); leaf.castShadow = true; fr.add(leaf);
  }
  return g;
}
export function bananaPlant(s = 1) { // our jungle's signature plant: big paddle leaves on a soft stem
  const g = new THREE.Group();
  g.add(withPos(new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.18 * s, 1.4 * s, 7), mat("#7f9a44", { flat: true })), V(0, 0.7 * s, 0)));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rnd(), leaf = new THREE.Mesh(new THREE.SphereGeometry(0.5 * s, 8, 6), mat(i % 2 ? "#5aa045" : "#6cb04c", { flat: true, rim: 0.55 }));
    leaf.scale.set(1.9, 0.1, 0.55); leaf.position.set(Math.cos(a) * 0.8 * s, (1.3 + rr(-0.2, 0.3)) * s, Math.sin(a) * 0.8 * s); leaf.rotation.set(0, -a, rr(-0.5, -0.2)); g.add(leaf);
  }
  if (rnd() < 0.6) for (let k = 0; k < 5; k++) { const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.05 * s, 0.22 * s, 4, 8), mat("#f2cc3b", { rough: 0.6, rim: 0.4 })); b.position.set(0.15 * s + (k % 2) * 0.08, (1.05 - k * 0.07) * s, 0.12 * s); b.rotation.z = 0.5; g.add(b); }
  return g;
}
/** a soft lumpy blob with a dark saturated underside and a lit top (vertex colours) */
export function smoothBlob(r: number, dark: string, lit: string) {
  const g = new THREE.SphereGeometry(r, 14, 10), p = g.attributes.position as THREE.BufferAttribute, col = new Float32Array(p.count * 3);
  const cd = new THREE.Color(dark), cl = new THREE.Color(lit), c = new THREE.Color(), off = rr(0, 100);
  for (let i = 0; i < p.count; i++) {
    const v = V(p.getX(i), p.getY(i), p.getZ(i)), n = 1 + (vnoise(v.x * 2.2 + off, v.z * 2.2 + v.y * 1.7) - 0.5) * 0.28;
    v.multiplyScalar(n); p.setXYZ(i, v.x, v.y, v.z);
    c.copy(cd).lerp(cl, THREE.MathUtils.smoothstep(v.y / r, -0.6, 0.8)); col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
  return new THREE.Mesh(g, mat("#ffffff", { vc: true, rim: 0.55, rough: 0.85 }));
}
export function fern(s = 1) { // arched fronds from one root
  const g = new THREE.Group(), n = 7 + Math.floor(rnd() * 4);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.5, fr = new THREE.Group(); fr.rotation.y = a; g.add(fr);
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 5), mat(["#4c8a36", "#5c9a3f", "#3f7a30"][i % 3], { rim: 0.5 }));
    l.scale.set(1.3 * s, 0.05, 0.22 * s); l.position.set(0.6 * s, 0.35 * s, 0); l.rotation.z = -0.55; fr.add(l);
  }
  return g;
}
export function bigLeaf(s = 1) { // a few huge round leaves on tall stalks
  const g = new THREE.Group(), n = 3 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, h = rr(0.7, 1.3) * s, x = Math.cos(a) * 0.35 * s, z = Math.sin(a) * 0.35 * s;
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, h, 5), mat("#5f8a3a")); stalk.position.set(x, h / 2, z); g.add(stalk);
    const leaf = new THREE.Mesh(new THREE.CircleGeometry(0.55 * s, 14, 0.3, Math.PI * 2 - 0.6), surf({ color: ["#2f6a2c", "#3a7a32"][i % 2], roughness: 0.7, side: THREE.DoubleSide }));
    patch(leaf.material as THREE.MeshStandardMaterial, { rim: 0.5 }); leaf.position.set(x * 1.6, h + 0.05, z * 1.6); leaf.rotation.set(-Math.PI / 2 + rr(0.2, 0.6), 0, a); leaf.castShadow = true; g.add(leaf);
  }
  return g;
}
export function bush(s = 1) {
  const g = new THREE.Group(), n = 2 + Math.floor(rnd() * 2);
  for (let i = 0; i < n; i++) { const r = (i === 0 ? rr(0.85, 1.1) : rr(0.45, 0.7)) * s, b = smoothBlob(r, "#2f4a22", rnd() < 0.5 ? "#6f9a3a" : "#7aa845"); b.position.set(i === 0 ? 0 : rr(-0.9, 0.9) * s, r * 0.7, i === 0 ? 0 : rr(-0.9, 0.9) * s); b.scale.set(rr(1, 1.3), 0.8, rr(0.9, 1.2)); g.add(b); }
  return g;
}
export function rock(s = 1) { // rounded boulder with a moss blanket over the top
  const g = new THREE.Group(), r = smoothBlob(s, "#857b6a", "#c2b49c");
  r.scale.y = rr(0.5, 0.75); r.position.y = s * 0.2; g.add(r);
  const moss = smoothBlob(s * 0.8, "#4a7232", "#7aa845"); moss.scale.set(1.1, 0.18, 1.0); moss.position.set(s * 0.1, s * 0.55 * r.scale.y + s * 0.12, -s * 0.1); g.add(moss); return g;
}
export function crate(kind: "wood" | "gold" = "wood") {
  const g = new THREE.Group(), base = kind === "gold" ? "#d9a63a" : "#a8763f", trim = kind === "gold" ? "#8a5a1a" : "#6e4a28";
  g.add(withPos(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 0.8), mat(base, { rough: 0.8 })), V(0, 0.4, 0)));
  for (const y of [0.12, 0.68]) g.add(withPos(new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.1, 0.84), mat(trim)), V(0, y, 0)));
  for (const x of [-0.5, 0.5]) g.add(withPos(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.82, 0.84), mat(trim)), V(x, 0.4, 0)));
  if (kind === "gold") { // loot reads at a glance: warm glow + a light shaft
    g.add(withPos(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.06), mat("#fff1a0", { emissive: "#ffd84a", ei: 2.5, rough: 0.3 })), V(0, 0.42, 0.42)));
    const gc = document.createElement("canvas"); gc.width = 4; gc.height = 64; { const x = gc.getContext("2d")!, gr = x.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, "#000"); gr.addColorStop(1, "#fff"); x.fillStyle = gr; x.fillRect(0, 0, 4, 64); }
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 6, 16, 1, true), new THREE.MeshBasicMaterial({ color: "#ffd84a", alphaMap: new THREE.CanvasTexture(gc), transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    beam.position.y = 3; g.add(beam); beam.castShadow = false;
  }
  return g;
}
export function barrel() { const g = new THREE.Group(); g.add(withPos(new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.95, 14), mat("#8f6a43")), V(0, 0.475, 0))); for (const y of [0.18, 0.77]) g.add(withPos(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.07, 14), mat("#4a4a52", { rough: 0.5 })), V(0, y, 0))); return g; }
export function tent() {
  const g = new THREE.Group(), t = new THREE.Mesh(new THREE.ConeGeometry(2.2, 2.4, 4, 1, true), surf({ color: "#c9b48a", roughness: 0.9, side: THREE.DoubleSide, flatShading: true }));
  patch(t.material as THREE.MeshStandardMaterial, { rim: 0.3 }); t.position.y = 1.2; t.rotation.y = Math.PI / 4; t.scale.z = 1.3; g.add(t);
  const flap = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.3), mat("#2f2a30", { rough: 0.95 })); flap.position.set(0, 0.68, 1.5); flap.rotation.x = -0.5; g.add(flap);
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.1, 8), mat("#b39a72")); roll.rotation.z = Math.PI / 2; roll.position.set(0, 1.42, 1.15); g.add(roll);
  g.add(withPos(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.7, 6), mat("#6e4b2e")), V(0, 1.3, 1.55)));
  for (const [x, z] of [[-2.2, 2.4], [2.2, 2.4], [-2.2, -2.4], [2.2, -2.4]] as const) { // guy ropes to pegs
    const a = V(x * 0.55, 1.2, z * 0.55), b = V(x, 0.05, z), mid = a.clone().lerp(b, 0.5), len = a.distanceTo(b);
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, len, 4), mat("#d9c79a", { rim: 0 })); r.position.copy(mid); r.lookAt(b); r.rotateX(Math.PI / 2); g.add(r);
    g.add(withPos(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.3, 5), mat("#5a3c26")), V(x, 0.1, z)));
  }
  return g;
}
export const fireLight = new THREE.PointLight("#ff9a3c", 18, 9, 1.6);
export function campfire() {
  const g = new THREE.Group();
  for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; g.add(withPos(new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), mat("#77716a", { flat: true })), V(Math.cos(a) * 0.6, 0.12, Math.sin(a) * 0.6))); }
  for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.9, 6), mat("#5a3c26", { flat: true })); l.rotation.set(Math.PI / 2, (i / 3) * Math.PI, 0.3); l.position.y = 0.15; g.add(l); }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 7), new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffb347").multiplyScalar(3) }));
  flame.position.y = 0.55; flame.name = "flame"; g.add(flame);
  fireLight.position.set(0, 1.0, 0); g.add(fireLight);
  return g;
}
export const STONE = ["#b3a68f", "#bdb098", "#a89b84", "#c4b79f"];
export function ruinBlock(w: number, h: number, d: number) { const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * 0.12), mat(STONE[Math.floor(rnd() * 4)], { rim: 0.25, rough: 0.9 })); m.rotation.y = rr(-0.04, 0.04); return m; }
export function vine(h: number) { const pts: THREE.Vector3[] = []; for (let i = 0; i <= 6; i++) pts.push(V(Math.sin(i * 1.3) * 0.08, h - (i / 6) * h * rr(0.6, 0.95), 0)); return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.035, 5), mat("#3f7a2e", { rim: 0.3 })); }
export function rubble(n: number, spread: number) { const g = new THREE.Group(); for (let i = 0; i < n; i++) { const r = rr(0.1, 0.28), m = new THREE.Mesh(jitter(new THREE.DodecahedronGeometry(r, 0), r * 0.25), mat(STONE[i % 4], { flat: true, rim: 0.2 })); m.position.set(rr(-spread, spread), r * 0.4, rr(-spread, spread)); m.rotation.set(rr(0, 3), rr(0, 3), 0); g.add(m); } return g; }
