// Look target L1: one jungle clearing at the polish bar of research/look/FINDINGS.md.
// Telephoto angled camera, soft shadows + N8AO ambient occlusion, rim light, canopy light cookie,
// warm haze, bloom, AgX tone mapping, SMAA, dense instanced grass with wind and player push,
// faceted low-poly foliage and rocks, matte props, real 3D monkeys. Keys: WASD walk, O ink outlines, P post on/off.
import * as THREE from "three";
import { EffectComposer, RenderPass, EffectPass, BloomEffect, VignetteEffect, ToneMappingEffect, ToneMappingMode, SMAAEffect, TiltShiftEffect, BrightnessContrastEffect, HueSaturationEffect } from "postprocessing";
import { N8AOPostPass } from "n8ao";
import { U, patch, mat, surf, TOON, BRIGHT, inkAll, inkU } from "./shading";
import { Monkey3D, blobTex } from "./monkey3d";
import { rnd, rr, V } from "../game/core/rng";
import { vnoise, fbm } from "../game/world/noise";
import { jitter, withPos, broadTree, palm, bananaPlant, smoothBlob, fern, bigLeaf, bush, rock, crate, barrel, tent, campfire, ruinBlock, vine, rubble, fireLight, STONE } from "../game/world/kit";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

const QS = new URLSearchParams(location.search);
type V3 = THREE.Vector3;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

// ---------- renderer ----------
const canvas = document.getElementById("game") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance", stencil: false, depth: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NoToneMapping; renderer.toneMappingExposure = Number(QS.get("exp") ?? 1.3);
const scene = new THREE.Scene();
const HAZE = new THREE.Color("#d9cfa8");
scene.background = HAZE.clone();
scene.fog = new THREE.Fog(HAZE, 48, 95);

// telephoto camera: 55 deg pitch, -30 deg yaw (the research's measured framing), FOV ~24
const camera = new THREE.PerspectiveCamera(24, 1, 1, 200);
const CAM = { pitch: THREE.MathUtils.degToRad(Number(QS.get("pitch") ?? 55)), yaw: THREE.MathUtils.degToRad(Number(QS.get("yaw") ?? -30)), dist: Number(QS.get("dist") ?? 40) };

// light: high warm sun, cool sky / warm ground ambient
const sun = new THREE.DirectionalLight("#ffe0b0", Number(QS.get("sun") ?? 7.0));
sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.radius = 3; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 90 });
const SUN_DIR = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - Number(QS.get("sunel") ?? 35)), THREE.MathUtils.degToRad(Number(QS.get("sunaz") ?? 160)));
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight("#a9c4ff", "#4a3e2e", Number(QS.get("fill") ?? 0.9)));

// ---------- terrain: muted grass, a soft dirt path, moss patches (vertex colours), gentle undulation ----------
const PATH = [V(-34, 0, 22), V(-18, 0, 12), V(-6, 0, 6), V(4, 0, 3), V(14, 0, -6), V(22, 0, -20), V(30, 0, -32)];
function pathDist(x: number, z: number) {
  let best = 1e9;
  for (let i = 0; i < PATH.length - 1; i++) {
    const a = PATH[i], b = PATH[i + 1], abx = b.x - a.x, abz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz)));
    best = Math.min(best, Math.hypot(x - a.x - abx * t, z - a.z - abz * t));
  }
  return best + (fbm(x * 0.25, z * 0.25) - 0.5) * 1.6;
}
const CAMP = V(10, 0, 9), RUIN = V(-11, 0, -7), RIVER_X = 20;
const isWater = (x: number, z: number) => x + Math.sin(z * 0.15) * 2.5 > RIVER_X && z > -14;
const C = BRIGHT ? { grassA: new THREE.Color("#7fb446"), grassB: new THREE.Color("#9cc84e"), grassC: new THREE.Color("#5f9a3c"), dirt: new THREE.Color("#e8bf7e"), dirtD: new THREE.Color("#d6a866"), moss: new THREE.Color("#6a9a44"), bank: new THREE.Color("#c9a86a"), camp: new THREE.Color("#e0b47a") } : { grassA: new THREE.Color("#6e8648"), grassB: new THREE.Color("#829654"), grassC: new THREE.Color("#566e3e"), dirt: new THREE.Color("#e0bb86"), dirtD: new THREE.Color("#c9a06c"), moss: new THREE.Color("#6a8644"), bank: new THREE.Color("#9a8458"), camp: new THREE.Color("#b8925f") };
function groundColor(x: number, z: number, out = new THREE.Color()) {
  const n = fbm(x * 0.12, z * 0.12), m = fbm(x * 0.5 + 9, z * 0.5);
  out.copy(C.grassA).lerp(C.grassB, THREE.MathUtils.smoothstep(n, 0.35, 0.75)).lerp(C.grassC, THREE.MathUtils.smoothstep(m, 0.55, 0.8) * 0.6);
  const pd = pathDist(x, z), dirt = 1 - THREE.MathUtils.smoothstep(pd, 1.3, 2.6);
  const campD = Math.hypot(x - CAMP.x, z - CAMP.z), camp = 1 - THREE.MathUtils.smoothstep(campD, 3.2, 5.5);
  out.lerp(C.dirt.clone().lerp(C.dirtD, m), Math.max(dirt, camp * 0.9));
  const ruinD = Math.hypot(x - RUIN.x, z - RUIN.z); out.lerp(C.moss, (1 - THREE.MathUtils.smoothstep(ruinD, 4, 7)) * 0.5);
  const bank = isWater(x - 2.2, z) ? 1 : 0; out.lerp(C.bank, bank * 0.8);
  return out;
}
const groundH = (x: number, z: number) => (fbm(x * 0.07, z * 0.07) - 0.5) * 0.9 * THREE.MathUtils.smoothstep(pathDist(x, z), 1, 4) - (isWater(x, z) ? 0.6 : 0);
{
  const g = new THREE.PlaneGeometry(120, 120, 240, 240); g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position as THREE.BufferAttribute, col = new Float32Array(pos.count * 3), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i); pos.setY(i, groundH(x, z)); groundColor(x, z, c); col.set([c.r, c.g, c.b], i * 3); }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
  const ground = new THREE.Mesh(g, patch(surf({ vertexColors: true, roughness: 0.95 }), { rim: 0.0 }));
  ground.receiveShadow = true; scene.add(ground);
  // river water with sun sparkle (bloom picks the sparkles up)
  const wg = new THREE.PlaneGeometry(40, 70, 1, 1); wg.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(wg, patch(surf({ color: "#2f7d92", roughness: 0.18, transparent: true, opacity: 0.92 }), { rim: 0, water: true }));
  water.position.set(RIVER_X + 19, -0.25, 22); water.receiveShadow = true; scene.add(water);
}

// ---------- grass: instanced tufts of 5 tapered blades, root colour = ground colour, wind + push ----------
function buildGrass() {
  const blades: number[] = [], cols: number[] = [], idx: number[] = [];
  for (let b = 0; b < 5; b++) {
    const a = rr(0, Math.PI * 2), lean = rr(0.1, 0.35), h = rr(0.45, 0.85), w = rr(0.1, 0.15), ox = rr(-0.12, 0.12), oz = rr(-0.12, 0.12);
    const base = blades.length / 3, dir = V(Math.cos(a), 0, Math.sin(a)), side = V(-dir.z, 0, dir.x);
    for (let s = 0; s <= 3; s++) {
      const t = s / 3, ww = w * (1 - t * 0.85), y = h * t, off = lean * t * t;
      for (const sgn of [-1, 1]) { blades.push(ox + side.x * ww * sgn + dir.x * off, y, oz + side.z * ww * sgn + dir.z * off); const v = 0.74 + t * 0.46; cols.push(v, v, v * 0.92); }
      if (s < 3) { const q = base + s * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2, q, q + 2, q + 1, q + 1, q + 2, q + 3); } // both windings: no dark back faces
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(blades, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3)); g.setIndex(idx); g.computeVertexNormals();
  // normals pointing up read as soft lit grass rather than shiny cards
  const nrm = g.attributes.normal as THREE.BufferAttribute; for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, nrm.getX(i) * 0.3, 1, nrm.getZ(i) * 0.3);
  const spots: [number, number, number][] = [];
  for (let i = 0; i < 40000 && spots.length < 13000; i++) {
    const x = rr(-46, 46), z = rr(-46, 46), pd = pathDist(x, z);
    const dc = Math.hypot(x - CAMP.x, z - CAMP.z), dr = Math.hypot(x - RUIN.x, z - (RUIN.z + 4));
    if (isWater(x - 1.5, z) || pd < 1.7 || rnd() > THREE.MathUtils.smoothstep(pd, 1.7, 3.6) || rnd() > THREE.MathUtils.smoothstep(dc, 6, 9) || rnd() > THREE.MathUtils.smoothstep(dr, 4.5, 7.5) || Math.hypot(x - RUIN.x, z - RUIN.z) < 4.2) continue;
    if (clear.some((c) => Math.hypot(x - c.x, z - c.z) < c.r)) continue; // keep a little bare ground around every prop
    const dens = fbm(x * 0.12 + 3, z * 0.12); if (dens < 0.47) continue;
    spots.push([x, z, 0.7 + dens * 0.9]);
  }
  const im = new THREE.InstancedMesh(g, patch(surf({ vertexColors: true, roughness: 0.9 }), { rim: 0.25, grass: true }), spots.length);
  const m = new THREE.Matrix4(), c = new THREE.Color();
  spots.forEach(([x, z, s], i) => { m.makeScale(s, s * rr(0.6, 1.4), s).setPosition(x, groundH(x, z), z); im.setMatrixAt(i, m); groundColor(x, z, c); c.multiplyScalar(1.05); im.setColorAt(i, c); });
  im.receiveShadow = true; scene.add(im);
}

// ---------- faceted low-poly foliage, rocks, ruins, props ----------
const tall: { o: THREE.Object3D; mats: THREE.MeshStandardMaterial[]; k: number }[] = [];
/** give a tall object its own fading materials so it can thin out when it hides the player */
function fadeable(o: THREE.Object3D) {
  const mats: THREE.MeshStandardMaterial[] = [];
  o.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) { const mm = (m.material as THREE.MeshStandardMaterial).clone(); mm.onBeforeCompile = (m.material as THREE.MeshStandardMaterial).onBeforeCompile; mm.customProgramCacheKey = (m.material as THREE.MeshStandardMaterial).customProgramCacheKey; mm.alphaHash = true; m.material = mm; mats.push(mm); } });
  tall.push({ o, mats, k: 1 }); return o;
}
const blobMat = new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false, opacity: 0.5 });
function groundBlob(x: number, z: number, r: number) { const b = new THREE.Mesh(new THREE.CircleGeometry(r, 20), blobMat); b.rotation.x = -Math.PI / 2; b.position.set(x, groundH(x, z) + 0.025, z); b.renderOrder = 1; scene.add(b); }
const clear: { x: number; z: number; r: number }[] = [];
function add(o: THREE.Object3D, x: number, z: number, y = 0) { o.position.set(x, groundH(x, z) + y - 0.03, z); scene.add(o);
  const box = new THREE.Box3().setFromObject(o), sz = box.getSize(new THREE.Vector3()); if (sz.y < 5 && sz.x < 8) { groundBlob(x, z, Math.max(sz.x, sz.z) * 0.62); clear.push({ x, z, r: Math.max(sz.x, sz.z) * 0.55 }); } o.traverse((c) => { if ((c as THREE.Mesh).isMesh) { c.castShadow = true; c.receiveShadow = true; } }); return o; }
// --- compose the clearing ---
for (let i = 0; i < 70; i++) { // dense jungle wall around the clearing
  const a = rr(0, Math.PI * 2), r = rr(25, 40), x = Math.cos(a) * r, z = Math.sin(a) * r;
  if (isWater(x, z) || pathDist(x, z) < 3) continue;
  fadeable(add(rnd() < 0.45 ? palm(rr(0.9, 1.2)) : broadTree(rr(0.9, 1.3)), x, z)).rotation.y = rr(0, 6);
}
for (let i = 0; i < 110; i++) { // understory in clusters of one family each
  const a = rr(0, Math.PI * 2), r = rr(13, 30), cx = Math.cos(a) * r, cz = Math.sin(a) * r; if (isWater(cx, cz) || pathDist(cx, cz) < 2.8) continue;
  const fam = rnd(), n = 1 + Math.floor(rnd() * 3);
  for (let k = 0; k < n; k++) { const x = cx + rr(-1.4, 1.4), z = cz + rr(-1.4, 1.4); if (pathDist(x, z) < 2.4 || Math.hypot(x - CAMP.x, z - CAMP.z) < 6.5 || Math.hypot(x - RUIN.x, z - RUIN.z) < 5) continue;
    fadeable(add(fam < 0.3 ? bush(rr(0.8, 1.3)) : fam < 0.55 ? fern(rr(0.9, 1.4)) : fam < 0.75 ? bigLeaf(rr(0.9, 1.3)) : bananaPlant(rr(0.8, 1.2)), x, z)).rotation.y = rr(0, 6); }
}
for (const [x, z, s] of [[-4, 10, 1.1], [6, -4, 0.9], [-15, 4, 1.2], [3, 14, 1], [-20, -14, 1]] as const) fadeable(add(palm(s), x, z)).rotation.y = rr(0, 6);
for (const [x, z, s] of [[-2, -6, 1], [-8, 2, 0.9], [-14, -11, 1.2], [16, 13.5, 1], [0, 10, 0.8], [-6, -14, 1]] as const) add(bananaPlant(s), x, z).rotation.y = rr(0, 6);
for (const [x, z, s] of [[-7, -3, 0.9], [7, -10, 1.3], [18, -9, 1.1], [17, 3, 0.8], [18.5, 7, 1.2], [-17, 9, 0.8], [2, -12, 0.7]] as const) add(rock(s), x, z).rotation.y = rr(0, 6);
{ // the ruin: a tiled stone platform (some tiles tilted or missing), steps, drum pillars with moss and vines, rubble
  const g = new THREE.Group();
  for (let ix = 0; ix < 6; ix++) for (let iz = 0; iz < 5; iz++) {
    if ((ix === 5 && iz === 0) || (ix === 0 && iz === 4) || (ix === 5 && iz === 3) || (ix === 2 && iz === 0)) continue; // broken edges
    const t = ruinBlock(0.96, 0.42, 0.96); t.position.set(-2.5 + ix, 0.18 + rr(-0.03, 0.03), -2 + iz); t.rotation.set(rr(-0.03, 0.03), rr(-0.05, 0.05), rr(-0.03, 0.03)); g.add(t);
  }
  for (let i = 0; i < 3; i++) { const st = ruinBlock(2.2, 0.22, 0.55); st.position.set(0, 0.1 - i * 0.03, 2.85 + i * 0.5); g.add(st); }
  for (const [x, z, n] of [[-2.4, -1.8, 4], [2.4, -1.8, 2], [-2.4, 1.6, 1], [2.4, 1.6, 3]] as const) {
    const base = ruinBlock(1.0, 0.25, 1.0); base.position.set(x, 0.52, z); g.add(base);
    for (let k = 0; k < n; k++) { const d = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.4, 0.62, 10), mat(STONE[(k + n) % 4], { rim: 0.25 })); d.position.set(x + rr(-0.04, 0.04), 0.95 + k * 0.62, z); d.rotation.y = rr(0, 1); g.add(d); }
    const topY = 0.64 + n * 0.62;
    if (n >= 3) { const capital = ruinBlock(0.95, 0.22, 0.95); capital.position.set(x, topY + 0.1, z); g.add(capital); }
    for (let q = 0; q < 2; q++) { const moss = smoothBlob(rr(0.16, 0.24), "#3d5f2a", "#6a8a44"); const a = rr(0, 6); moss.scale.set(1.4, 0.5, 1); moss.position.set(x + Math.cos(a) * 0.28, topY + (n >= 3 ? 0.2 : 0.0) - q * 0.12, z + Math.sin(a) * 0.28); g.add(moss); }
    if (n >= 2) { const v = vine(n * 0.62); v.position.set(x + 0.3, 0.4, z + 0.3); g.add(v); }
    const rb = rubble(5, 0.6); rb.position.set(x, 0.4, z + 0.5); g.add(rb);
  }
  { // a broken back wall with the stub of an arch
    for (let k = 0; k < 5; k++) for (let row = 0; row < 4 - Math.abs(k - 1); row++) { const b = ruinBlock(0.9, 0.45, 0.5); b.position.set(-2.1 + k * 0.92 + (row % 2) * 0.2, 0.62 + row * 0.46, -2.75); g.add(b); }
    const arch = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.22, 6, 10, Math.PI * 0.55), mat(STONE[2], { rim: 0.25 })); arch.position.set(0.2, 1.9, -2.75); arch.rotation.z = Math.PI * 0.2; g.add(arch);
    const v = vine(1.6); v.position.set(-1.2, 0.6, -2.45); g.add(v); const v2 = vine(1.2); v2.position.set(0.9, 0.6, -2.45); g.add(v2);
  }
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.42, 0.62, 8), mat(STONE[1], { flat: true })); drum.rotation.set(Math.PI / 2, 0.4, 0); drum.position.set(3.9, 0.38, 1.0); g.add(drum);
  const drum2 = drum.clone(); drum2.position.set(4.3, 0.38, 0.2); drum2.rotation.z = 0.9; g.add(drum2);
  const rb = rubble(10, 1.4); rb.position.set(3.6, 0, -0.4); g.add(rb);
  add(g, RUIN.x, RUIN.z, -0.04);
  add(crate("gold"), RUIN.x, RUIN.z - 0.4, 0.38);
}
{ // the bandit camp: tent, fire, log seats, crates and barrels
  add(tent(), CAMP.x + 2.2, CAMP.z - 2.6).rotation.y = -0.4;
  { const ash = new THREE.Mesh(new THREE.CircleGeometry(1.0, 18), mat("#4a4440", { rough: 1, cookie: false, rim: 0 })); ash.rotation.x = -Math.PI / 2; ash.position.set(CAMP.x, groundH(CAMP.x, CAMP.z) + 0.02, CAMP.z); ash.receiveShadow = true; scene.add(ash); }
  add(campfire(), CAMP.x, CAMP.z);
  for (const [dx, dz, r] of [[-1.9, 0.6, 0.3], [1.6, 1.6, -0.6]] as const) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 1.8, 8), mat("#6e4b2e", { flat: true })); l.rotation.set(0, r, Math.PI / 2); add(l, CAMP.x + dx, CAMP.z + dz, 0.25); }
  add(crate(), CAMP.x - 3, CAMP.z - 2.4).rotation.y = 0.3; add(crate(), CAMP.x - 3.4, CAMP.z - 1.2).rotation.y = -0.2; add(crate(), CAMP.x - 3.2, CAMP.z - 1.8, 0.8).rotation.y = 0.5;
  add(barrel(), CAMP.x + 3.4, CAMP.z + 0.6); add(barrel(), CAMP.x + 3.9, CAMP.z + 1.3);
  add(crate(), 2, 6).rotation.y = 0.8;
  const sack = (x: number, z: number) => { const m = smoothBlob(0.35, "#8a6a42", "#c9a874"); m.scale.set(1, 0.75, 0.85); return add(m, x, z, 0.24); };
  sack(CAMP.x - 2.2, CAMP.z - 3.1); sack(CAMP.x - 1.6, CAMP.z - 3.3); sack(CAMP.x + 3.1, CAMP.z + 2.1);
  const rope = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.07, 6, 18), mat("#c9a35c", { rim: 0.3 })); rope.rotation.x = Math.PI / 2; add(rope, CAMP.x + 1.2, CAMP.z - 3.4, 0.08);
  for (const [dx, dz, r] of [[-0.6, 3.0, 0.2], [0.8, 3.2, -0.3]] as const) { // rolled bedrolls with straps
    const bed = new THREE.Group(); const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.0, 12), mat(dx < 0 ? "#8a7d5a" : "#7d6a4a", { rim: 0.3 })); roll.rotation.z = Math.PI / 2; bed.add(roll);
    for (const sx of [-0.28, 0.28]) { const strap = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.02, 4, 16), mat("#4a3a28")); strap.rotation.y = Math.PI / 2; strap.position.x = sx; bed.add(strap); }
    bed.rotation.y = r; add(bed, CAMP.x + dx, CAMP.z + dz, 0.2);
  }
  { // a tarp lean-to over a stash of bananas
    const lt = new THREE.Group(); for (const x of [-0.9, 0.9]) lt.add(withPos(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.6, 6), mat("#6e4b2e", { flat: true })), V(x, 0.8, 0.5)));
    const tg = new THREE.PlaneGeometry(2.1, 1.4, 8, 6); { const p = tg.attributes.position as THREE.BufferAttribute; for (let i = 0; i < p.count; i++) p.setZ(i, -Math.sin((p.getX(i) / 2.1 + 0.5) * Math.PI) * 0.12 - Math.sin((p.getY(i) / 1.4 + 0.5) * Math.PI) * 0.08); tg.computeVertexNormals(); }
    const tarp = new THREE.Mesh(tg, surf({ color: "#c8a46a", roughness: 0.95, side: THREE.DoubleSide })); patch(tarp.material as THREE.MeshStandardMaterial, { rim: 0.2 }); tarp.position.set(0, 1.05, 0); tarp.rotation.x = -0.75; lt.add(tarp);
    const bc = crate(); bc.scale.setScalar(0.8); bc.position.set(0, 0, -0.1); lt.add(bc);
    for (let k = 0; k < 7; k++) { const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.24, 4, 8), mat("#f2cc3b", { rough: 0.55, rim: 0.5 })); b.position.set(rr(-0.35, 0.35), 0.7 + rr(0, 0.12), rr(-0.3, 0.2)); b.rotation.set(rr(0, 3), rr(0, 3), rr(0, 3)); lt.add(b); }
    add(lt, CAMP.x - 4.4, CAMP.z + 1.6).rotation.y = 1.2;
  }
  { // a lantern on a stick (warm accent)
    const l = new THREE.Group(); l.add(withPos(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.8, 6), mat("#5a3c26")), V(0, 0.9, 0)));
    l.add(withPos(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.22), mat("#ffe6a0", { emissive: "#ffb347", ei: 2.2 })), V(0.12, 1.7, 0)));
    add(l, CAMP.x + 4.2, CAMP.z - 1.8);
  }
  { // a stick fence along the camp's west side
    const f = new THREE.Group(); for (let i = 0; i < 9; i++) f.add(withPos(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, rr(1.0, 1.3), 6), mat("#7a5a3c", { flat: true })), V(i * 0.55, 0.55, rr(-0.05, 0.05))));
    for (const y of [0.45, 0.85]) { const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 4.6, 6), mat("#6e4b2e")); rail.rotation.z = Math.PI / 2; rail.position.set(2.2, y, 0); f.add(rail); }
    add(f, CAMP.x - 5.6, CAMP.z - 3.6).rotation.y = -1.25;
  }
}
{ // the trail: logs, stumps, a signpost, rock clusters at the edges
  const log = (x: number, z: number, r: number) => {
    const g = new THREE.Group(); const l = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.33, 2.6, 16), mat("#7a5434", { rim: 0.35, rough: 0.9 })); l.rotation.z = Math.PI / 2; g.add(l);
    for (const sx of [-1, 1]) { const cap = new THREE.Mesh(new THREE.CircleGeometry(0.29, 16), mat("#d9b483", { rim: 0 })); cap.position.x = sx * 1.305; cap.rotation.y = sx * Math.PI / 2; g.add(cap); }
    const moss = smoothBlob(0.32, "#4f7a34", "#7aa845"); moss.scale.set(1.6, 0.25, 0.8); moss.position.set(0.3, 0.27, 0); g.add(moss);
    g.rotation.y = r; return add(g, x, z, 0.3);
  };
  log(-9, 9.5, 0.6); log(9, -1.5, -0.4);
  const stump = (x: number, z: number) => { const st = new THREE.Group(); st.add(withPos(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.52, 0.5, 9), mat("#7a5a3c", { flat: true })), V(0, 0.25, 0))); st.add(withPos(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.02, 9), mat("#c9a874")), V(0, 0.51, 0))); return add(st, x, z); };
  stump(-12, 6.5); stump(6.5, -7.5);
  const sign = new THREE.Group(); sign.add(withPos(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.6, 6), mat("#6e4b2e")), V(0, 0.8, 0)));
  const sc = document.createElement("canvas"); sc.width = 256; sc.height = 72; { const x = sc.getContext("2d")!; x.fillStyle = "#b8905e"; x.fillRect(0, 0, 256, 72); x.fillStyle = "#5a3c22"; x.font = "bold 30px Trebuchet MS"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("CAMP ➜", 128, 38); }
  const st = new THREE.CanvasTexture(sc); st.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(new RoundedBoxGeometry(1.2, 0.34, 0.08, 2, 0.04), [mat("#a88050"), mat("#a88050"), mat("#a88050"), mat("#a88050"), patch(surf({ map: st, roughness: 0.9 }), { rim: 0.2 }), mat("#a88050")]);
  board.position.set(0.3, 1.35, 0); board.rotation.z = 0.06; sign.add(board);
  add(sign, -5.5, 4.0).rotation.y = 0.5;
  for (const [x, z] of [[-14, 11], [-1, 7.6], [8, 1.2], [12, -3.6], [17, -12]] as const) { const rb = rubble(6, 0.8); add(rb, x, z); }
}
{ // a plank bridge over the river
  const g = new THREE.Group();
  for (let i = 0; i < 12; i++) { const p = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.42), mat(i % 3 ? "#9a7348" : "#8a653d", { rough: 0.85 })); p.position.set(0, 0.12, i * 0.48); p.rotation.y = rr(-0.05, 0.05); g.add(p); }
  for (const x of [-1.3, 1.3]) for (let i = 0; i < 4; i++) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.4, 6), mat("#6e4b2e", { flat: true })); post.position.set(x, 0.2, i * 1.8); g.add(post); }
  g.rotation.y = Math.PI / 2 - 0.25; add(g, RIVER_X - 2, 9, 0.1);
}
// a loose banana bunch on the path with a rarity ring (loot readability)
{
  const g = new THREE.Group();
  const bunch = new THREE.Group(); bunch.name = "lootbob"; g.add(bunch);
  for (let k = 0; k < 4; k++) { // curved bananas fanned into a bunch
    const b = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.085, 10, 20, Math.PI * 0.75), mat("#ffd23a", { rough: 0.45, rim: 0.8, emissive: "#ffb020", ei: 0.3 }));
    b.rotation.set(Math.PI / 2 - 0.5, 0, -0.2 + k * 0.32); b.position.set(0, 0.25 + k * 0.03, 0); bunch.add(b);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.1, 6), mat("#5a3c1e")); tip.position.set(-0.32 + k * 0.02, 0.28, 0.1); bunch.add(tip);
  }
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.67, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color("#9fdcff").multiplyScalar(1.3), transparent: true, opacity: 0.6, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; g.add(ring);
  add(g, -3.5, 5.6, 0.02);
}

{
  const leafG = new THREE.CircleGeometry(0.12, 6); leafG.rotateX(-Math.PI / 2); leafG.scale(1.8, 1, 0.8);
  const pebG = new THREE.DodecahedronGeometry(0.09, 0), flG = new THREE.IcosahedronGeometry(0.07, 0);
  const L: THREE.Matrix4[] = [], P: THREE.Matrix4[] = [], F: THREE.Matrix4[] = [];
  const q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let i = 0; i < 9000; i++) {
    const x = rr(-40, 40), z = rr(-40, 40); if (isWater(x, z)) continue;
    const pd = pathDist(x, z), y = groundH(x, z);
    if (pd < 2.4 && rnd() < 0.5) L.push(new THREE.Matrix4().compose(V(x, y + 0.03, z), q.setFromEuler(e.set(0, rr(0, 6), 0)), V(rr(0.7, 1.3), 1, rr(0.7, 1.3))));
    else if (pd > 1.6 && pd < 2.6 && rnd() < 0.2) P.push(new THREE.Matrix4().compose(V(x, y + 0.03, z), q.setFromEuler(e.set(rr(0, 3), rr(0, 3), 0)), V(rr(0.6, 1.6), rr(0.5, 0.9), rr(0.6, 1.6))));
    else if (pd > 3 && rnd() < 0.04 && fbm(x * 0.3, z * 0.3) > 0.55) F.push(new THREE.Matrix4().compose(V(x, y + rr(0.35, 0.6), z), q.identity(), V(1, 1, 1)));
  }
  const put = (g: THREE.BufferGeometry, ms: THREE.Matrix4[], colors: string[], o: Parameters<typeof mat>[1] = {}) => {
    const im = new THREE.InstancedMesh(g, mat("#ffffff", { flat: true, rim: 0.2, ...o }), ms.length);
    ms.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, new THREE.Color(colors[i % colors.length])); }); im.receiveShadow = true; scene.add(im);
  };
  put(leafG, L, ["#8a7a3a", "#a08a46", "#6f7a36", "#b0904a"]); put(pebG, P, ["#a39a8a", "#8f877a", "#b5ab98"]); put(flG, F, ["#fff3d6", "#ffd84a", "#ff9ec4", "#ff6a4a"], { emissive: "#000000" });
}

{ // invisible canopy overhead: only its shadow lands on the clearing
  const ghost = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  // broken, dappled canopy edges hanging in from the jungle walls (not one big blob over the path)
  for (let i = 0; i < Number(QS.get("canopy") ?? 12); i++) {
    const a = rr(0, Math.PI * 2), d = rr(12, 22), x = Math.cos(a) * d, z = Math.sin(a) * d, r = rr(1.2, 2.4);
    if (Math.hypot(x - RUIN.x, z - RUIN.z) < 9 || Math.hypot(x - CAMP.x, z - CAMP.z) < 8 || pathDist(x, z) < 6) continue; // keep the trail and points of interest in the sun
    const blob = new THREE.Mesh(jitter(new THREE.IcosahedronGeometry(r, 1), r * 0.3), ghost);
    blob.scale.y = 0.3; blob.position.set(x, rr(9, 12), z); blob.castShadow = true; scene.add(blob);
  }
}

buildGrass();

// ---------- characters ----------
const boss = new Monkey3D({ fur: "#e07a32", face: "#f6c896", suit: "#3c5a8c", pants: "#2c3550", tie: "#ff8a2a", hat: "bowler", band: "#ffb02a", shades: true, briefcase: true, scale: 1.0, rim: 1.3 });
boss.root.position.set(-1, 0, 4.5); scene.add(boss.root);
const bandit = new Monkey3D({ fur: "#8a5a34", face: "#e6b483", suit: "#ffffff", pants: "#3a3340", hat: "bandana", hatColor: "#d9493a", mask: true, stripes: true, sack: true, scale: 0.92 });
bandit.root.position.set(CAMP.x - 1.6, 0, CAMP.z + 1.4); scene.add(bandit.root);
const bandit2 = new Monkey3D({ fur: "#7a4e2e", face: "#e0ad7d", suit: "#ffffff", pants: "#3a3340", hat: "cap", hatColor: "#3f5f9a", mask: true, stripes: true, scale: 0.92 });
bandit2.root.position.set(CAMP.x + 1.5, 0, CAMP.z - 0.8); scene.add(bandit2.root);
const ink = QS.get("ink") === "1"; for (const m of [boss, bandit, bandit2]) m.setInk(ink);
void blobTex;

if (TOON) {
  const n = inkAll(scene, (m) => { if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere(); return m.geometry.boundingSphere!.radius > 30; });
  console.log("inked meshes", n);
  for (const t of tall) { const hulls: THREE.Object3D[] = []; t.o.traverse((c) => { if (c.name === "ink") hulls.push(c); }); (t as { hulls?: THREE.Object3D[] }).hulls = hulls; }
}

// ---------- post: AO, bloom, vignette, AgX, SMAA, gentle tilt-shift ----------
const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
composer.addPass(new RenderPass(scene, camera));
const n8 = new N8AOPostPass(scene, camera, innerWidth, innerHeight);
Object.assign(n8.configuration, { aoRadius: 2.5, distanceFalloff: 1.0, intensity: 2.0, gammaCorrection: false, color: new THREE.Color("#1d1a26") });
n8.setQualityMode(QS.get("aoq") ?? "High");
if (!BRIGHT) composer.addPass(n8);
const tilt = new TiltShiftEffect({ offset: 0.0, rotation: 0, focusArea: 0.9, feather: 0.4, kernelSize: 0 });
if (BRIGHT) composer.addPass(new EffectPass(camera, new BloomEffect({ mipmapBlur: true, luminanceThreshold: 0.95, intensity: 0.4 }), new SMAAEffect()));
else {
composer.addPass(new EffectPass(camera, new BloomEffect({ mipmapBlur: true, luminanceThreshold: 0.9, luminanceSmoothing: 0.25, intensity: 0.8 }), tilt));
  composer.addPass(new EffectPass(camera, new ToneMappingEffect({ mode: ({ aces: ToneMappingMode.ACES_FILMIC, agx: ToneMappingMode.AGX, neutral: ToneMappingMode.NEUTRAL } as Record<string, ToneMappingMode>)[QS.get("tm") ?? "aces"] }), new BrightnessContrastEffect({ brightness: Number(QS.get("bright") ?? 0.0), contrast: Number(QS.get("contrast") ?? 0.05) }), new HueSaturationEffect({ saturation: Number(QS.get("sat") ?? -0.25) }), new VignetteEffect({ offset: 0.38, darkness: 0.3 }), new SMAAEffect()));
}
let post = QS.get("post") !== "0";

function resize() {
  renderer.setSize(innerWidth, innerHeight, false); composer.setSize(innerWidth, innerHeight); inkU.uRes.value.set(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.fov = camera.aspect < 1 ? 34 : 24; camera.updateProjectionMatrix();
}
addEventListener("resize", resize); resize();

// ---------- walk around (so the look is judged in motion too) ----------
const keys = new Set<string>();
addEventListener("keydown", (e) => { const k = e.key.toLowerCase(); keys.add(k); if (k === "o") { const on = !boss.root.getObjectByName("ink")!.visible; for (const m of [boss, bandit, bandit2]) m.setInk(on); } if (k === "p") post = !post; });
addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
const vel = new THREE.Vector3(); let face = 0.6, idleT = 0;
const camFocus = boss.root.position.clone(), clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  U.uTime.value = t;
  // input relative to the camera's yaw
  const fx = (keys.has("d") ? 1 : 0) - (keys.has("a") ? 1 : 0), fz = (keys.has("s") ? 1 : 0) - (keys.has("w") ? 1 : 0);
  const mv = V(fx, 0, fz); if (mv.lengthSq() > 0) mv.normalize().applyAxisAngle(V(0, 1, 0), CAM.yaw);
  vel.lerp(mv.multiplyScalar(5.6), Math.min(1, dt * 14));
  const bp = boss.root.position; bp.addScaledVector(vel, dt); bp.y = groundH(bp.x, bp.z);
  if (vel.lengthSq() > 0.05) { face = Math.atan2(vel.x, vel.z); idleT = 0; } else if ((idleT += dt) > 1.2) face = CAM.yaw * 0.6; // idle: turn toward the camera
  for (const t of tall) { // occlusion cutaway: thin out trees between the camera and the boss
    const op = t.o.position, toCam = V(Math.sin(CAM.yaw), 0, Math.cos(CAM.yaw)), rel = V(op.x - bp.x, 0, op.z - bp.z);
    const along = rel.dot(toCam), side = Math.abs(rel.x * toCam.z - rel.z * toCam.x);
    const hide = along > 0 && along < 9 && side < 3.2;
    t.k += ((hide ? 0.25 : 1) - t.k) * Math.min(1, dt * 6);
    for (const m of t.mats) m.opacity = t.k;
    for (const h of (t as { hulls?: THREE.Object3D[] }).hulls ?? []) h.visible = t.k > 0.92;
  }
  boss.update(dt, vel.length(), face);
  bandit.update(dt, 0, Math.atan2(CAMP.x - bandit.root.position.x, CAMP.z - bandit.root.position.z)); bandit.root.position.y = groundH(bandit.root.position.x, bandit.root.position.z);
  bandit2.update(dt, 0, Math.atan2(bp.x - bandit2.root.position.x, bp.z - bandit2.root.position.z)); bandit2.root.position.y = groundH(bandit2.root.position.x, bandit2.root.position.z);
  U.uPlayer.value.copy(bp);
  const lb = scene.getObjectByName("lootbob"); if (lb) { lb.position.y = 0.12 + Math.sin(t * 2.4) * 0.08; lb.rotation.y = t * 1.2; }
  const flame = scene.getObjectByName("flame"); if (flame) { flame.scale.set(1 + Math.sin(t * 13) * 0.1, 1 + Math.sin(t * 9.7) * 0.18, 1); fireLight.intensity = 16 + Math.sin(t * 11) * 3; }
  // camera: damped follow with a little lead in the walking direction
  camFocus.lerp(bp.clone().addScaledVector(vel, 0.35), Math.min(1, dt * 4));
  const off = new THREE.Vector3().setFromSphericalCoords(CAM.dist, Math.PI / 2 - CAM.pitch, CAM.yaw);
  camera.position.copy(camFocus).add(off); camera.lookAt(camFocus);
  sun.position.copy(camFocus).addScaledVector(SUN_DIR, 40); sun.target.position.copy(camFocus);
  U.uRimDir.value.set(-0.55, 0.65, 0.35).normalize();
  if (post) composer.render(dt); else renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
(window as any).__look = { boss, bandit, camera, CAM, scene, setPost: (v: boolean) => { post = v; }, setInk: (v: boolean) => { for (const m of [boss, bandit, bandit2]) m.setInk(v); } };
requestAnimationFrame(frame);
void rand; void V as unknown as V3;
