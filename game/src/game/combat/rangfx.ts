// The bandits' banana boomerang, made readable (G1.5 row 19; research/duckov-re/POLISH_FINDINGS.md section 13: Duckov's
// projectiles read through short, wide HDR centre/glow trails, depth-tested, depth write off, unlit so they keep their
// colour on any ground). Ours, original:
// - a banana-curve boomerang 0.95 u tip to tip, 0.24 u thick: bigger than the old ring (visual only; the hit radius
//   lives in ai/enemies.ts and is unchanged), so it stays well above a 6 px silhouette at the gameplay camera
// - an unlit banana-yellow core at 2.6x (HDR: the bloom picks it up) inside a dark orange rim (a back-face shell), so
//   it separates from pale sand, mid grass and dark shadow alike
// - an orange camera-facing ribbon trail along the last 0.1 s of flight, 0.3 u wide at the head, tapering and fading
// - it still casts a shadow, which grounds it in flight
// Pooled: makeRangVisual() reuses a holder whenever the previous one has left the scene. updateRangFx() runs per
// render frame (core/raid.ts) and allocates nothing.
import * as THREE from "three";
import { G, type Rang } from "../core/state";

const TRAIL_T = 0.1, TRAIL_W = 0.3, PTS = 20, MAXR = 8;
// linear colours. The core is a warm yellow pushed to ~2.6 so the bloom and the neutral tone map keep it banana-yellow
// (a whiter core washed out to cream on the beach); the trail is orange so it still separates from pale sand.
const CORE = new THREE.Color(1.0, 0.8, 0.22).multiplyScalar(2.6), RIM = new THREE.Color("#a8400a"), TRAIL = new THREE.Color(1.0, 0.42, 0.06).multiplyScalar(2.0);

/** a curved, tapered banana lying flat in the XZ plane, centred on its bounding middle */
function bananaGeo(thick: number): THREE.BufferGeometry {
  const N = 22, M = 10, R = 0.5, span = 2.2, pos: number[] = [], idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, a = -span / 2 + span * t, cx = Math.sin(a) * R, cz = Math.cos(a) * R - R * 0.78;
    const r = thick * (0.28 + 0.72 * Math.pow(Math.sin(Math.PI * t), 0.55)), tx = Math.cos(a), tz = -Math.sin(a); // tangent
    for (let j = 0; j < M; j++) {
      const b = (j / M) * Math.PI * 2, nx = -tz, nz = tx; // ring around the tangent: (n, y)
      pos.push(cx + nx * Math.cos(b) * r, Math.sin(b) * r * 0.78, cz + nz * Math.cos(b) * r);
    }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
    const a = i * M + j, b = i * M + ((j + 1) % M), c = a + M, d = b + M; idx.push(a, c, b, b, c, d);
  }
  const cap = (i: number, flip: boolean) => { const c = pos.length / 3, base = i * M; const sx = pos.slice(base * 3, base * 3 + M * 3); let x = 0, y = 0, z = 0; for (let j = 0; j < M; j++) { x += sx[j * 3]; y += sx[j * 3 + 1]; z += sx[j * 3 + 2]; } pos.push(x / M, y / M, z / M); for (let j = 0; j < M; j++) { const p = base + j, q = base + ((j + 1) % M); if (flip) idx.push(c, q, p); else idx.push(c, p, q); } };
  cap(0, false); cap(N, true);
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
  return g;
}
let coreGeo: THREE.BufferGeometry | null = null, rimGeo: THREE.BufferGeometry | null = null, coreMat: THREE.Material | null = null, rimMat: THREE.Material | null = null;
const holders: THREE.Group[] = [];
/** the flying boomerang (ai/enemies.ts adds it to the scene, moves and spins it, and removes it) */
export function makeRangVisual(): THREE.Group {
  const free = holders.find((h) => !h.parent); if (free) { free.rotation.set(0, 0, 0); return free; }
  coreGeo ??= bananaGeo(0.12); rimGeo ??= bananaGeo(0.175);
  coreMat ??= new THREE.MeshBasicMaterial({ color: CORE, toneMapped: false });
  rimMat ??= new THREE.MeshBasicMaterial({ color: RIM, side: THREE.BackSide });
  const h = new THREE.Group(); h.name = "rang";
  const core = new THREE.Mesh(coreGeo, coreMat); core.castShadow = true;
  const rim = new THREE.Mesh(rimGeo, rimMat); rim.scale.set(1.07, 1.1, 1.07);
  h.add(core, rim); holders.push(h);
  return h;
}

// ---- trails: one ribbon geometry for every boomerang in flight (one draw call)
type Hist = { x: Float32Array; y: Float32Array; z: Float32Array; t: Float32Array; n: number; head: number; owner: Rang | null };
const hists: Hist[] = Array.from({ length: MAXR }, () => ({ x: new Float32Array(PTS), y: new Float32Array(PTS), z: new Float32Array(PTS), t: new Float32Array(PTS), n: 0, head: 0, owner: null }));
let mesh: THREE.Mesh | null = null, posA: THREE.BufferAttribute, aA: THREE.BufferAttribute, now = 0;
const cam = new THREE.Vector3(), tan = new THREE.Vector3(), side = new THREE.Vector3(), view = new THREE.Vector3();
function ensureMesh() {
  if (mesh) { if (mesh.parent !== G.stage.scene) G.stage.scene.add(mesh); return mesh; }
  const V = MAXR * PTS * 2, g = new THREE.BufferGeometry(), idx: number[] = [];
  posA = new THREE.BufferAttribute(new Float32Array(V * 3), 3); posA.setUsage(THREE.DynamicDrawUsage);
  aA = new THREE.BufferAttribute(new Float32Array(V * 2), 2); aA.setUsage(THREE.DynamicDrawUsage); // (alpha along, across -1..1)
  for (let r = 0; r < MAXR; r++) for (let i = 0; i < PTS - 1; i++) { const a = (r * PTS + i) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  g.setAttribute("position", posA); g.setAttribute("ta", aA); g.setIndex(idx);
  mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
    uniforms: { uCol: { value: TRAIL } }, transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide, toneMapped: false,
    vertexShader: "attribute vec2 ta; varying vec2 vT; void main(){ vT = ta; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "uniform vec3 uCol; varying vec2 vT; void main(){ float a = pow(vT.x, 1.3) * (1.0 - smoothstep(0.6, 1.0, abs(vT.y))); if (a < 0.003) discard; gl_FragColor = vec4(uCol, a * 0.9); }",
  }));
  mesh.frustumCulled = false; mesh.renderOrder = 7; mesh.name = "rangTrails"; G.stage.scene.add(mesh);
  return mesh;
}
/** per render frame: record each boomerang's path and rebuild the ribbons */
export function updateRangFx(dt: number) {
  now += dt;
  if (!G.rangs.length && hists.every((h) => !h.owner)) { if (mesh) mesh.visible = false; return; }
  const m = ensureMesh(); m.visible = true;
  for (const h of hists) if (h.owner && !G.rangs.includes(h.owner) && (h.n === 0 || now - h.t[(h.head + PTS - 1) % PTS] > TRAIL_T)) { h.owner = null; h.n = 0; }
  for (const r of G.rangs) {
    let h = hists.find((q) => q.owner === r);
    if (!h) { h = hists.find((q) => !q.owner); if (!h) continue; h.owner = r; h.n = 0; h.head = 0; }
    const i = h.head; h.x[i] = r.p.x; h.y[i] = r.p.y; h.z[i] = r.p.z; h.t[i] = now; h.head = (i + 1) % PTS; h.n = Math.min(PTS, h.n + 1);
  }
  cam.setFromMatrixPosition(G.stage.camera.matrixWorld);
  const P = posA.array as Float32Array, A = aA.array as Float32Array;
  hists.forEach((h, r) => {
    for (let k = 0; k < PTS; k++) { // k = 0 newest
      const o = (r * PTS + k) * 2;
      if (k >= h.n) { // unused tail: collapse onto the last real point, invisible (never stretch a strip to the origin)
        const l = k > 0 ? (r * PTS + k - 1) * 2 : o;
        for (let q = 0; q < 6; q++) P[o * 3 + q] = k > 0 ? P[l * 3 + (q % 3)] : 0;
        A[o * 2] = A[o * 2 + 2] = 0; A[o * 2 + 1] = 1; A[o * 2 + 3] = -1; continue;
      }
      const i = (h.head - 1 - k + PTS * 2) % PTS, j = (i - 1 + PTS) % PTS, prev = k + 1 < h.n ? j : i, next = k > 0 ? (i + 1) % PTS : i;
      const age = now - h.t[i], life = Math.max(0, 1 - age / TRAIL_T);
      tan.set(h.x[next] - h.x[prev], h.y[next] - h.y[prev], h.z[next] - h.z[prev]); if (tan.lengthSq() < 1e-8) tan.set(1, 0, 0);
      view.set(cam.x - h.x[i], cam.y - h.y[i], cam.z - h.z[i]); side.crossVectors(tan, view).normalize();
      const w = TRAIL_W * 0.5 * (0.35 + 0.65 * life);
      P[o * 3] = h.x[i] + side.x * w; P[o * 3 + 1] = h.y[i] + side.y * w; P[o * 3 + 2] = h.z[i] + side.z * w;
      P[o * 3 + 3] = h.x[i] - side.x * w; P[o * 3 + 4] = h.y[i] - side.y * w; P[o * 3 + 5] = h.z[i] - side.z * w;
      A[o * 2] = life; A[o * 2 + 1] = 1; A[o * 2 + 2] = life; A[o * 2 + 3] = -1;
    }
  });
  posA.needsUpdate = true; aA.needsUpdate = true;
}
/** raid end: drop every trail */
export function clearRangFx() { for (const h of hists) { h.owner = null; h.n = 0; } if (mesh) mesh.visible = false; }

/** captures only (tools/combatfeel.mjs): throw a boomerang from (x, z) along (dx, dz) that never hurts anyone; it flies
 *  out `out` u and heads back to `owner` (pick a far-away, knocked-out or harmless enemy) */
export function throwDemo(owner: Rang["owner"], x: number, z: number, dx: number, dz: number, out = 8) {
  const holder = makeRangVisual(); G.stage.scene.add(holder);
  const l = Math.hypot(dx, dz) || 1, p = owner.p.clone().set(x, 1.1, z);
  const r: Rang = { p, from: p.clone().setY(0), dir: p.clone().set(dx / l, 0, dz / l), t: 0, out, mesh: holder, owner, hitDone: true, back: false };
  G.rangs.push(r); return r;
}
