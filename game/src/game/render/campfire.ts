// Campfire flames at runtime (G1 council: "the campfire has a distinct core", "more than one flame cone and some ember
// sparks"). The kit's campfire() ships one pale emissive cone as parts.flame; in daylight it sat at the same value as
// the sunlit sand and vanished. Here every placed flame gets a layered cartoon fire instead:
//   - three nested teardrops per tongue: deep orange, amber, white-hot core. The two outer layers are drawn as back
//     faces only, so from any camera angle they show as rings around the layer inside them (the inverted-hull trick the
//     ink outline in shading.ts uses), and the core is the only part bright enough for the bloom pass to pick up;
//   - one main tongue and two smaller leaning ones, each flickering on its own phase;
//   - embers: one Points draw call for every fire on the map, animated in the vertex shader (no per-frame CPU work).
// The new meshes are children of parts.flame, so the scale flicker props.ts already applies still drives them.
// Unlit and outside the shadow pass. Colours are linear; values above 1 are what blooms.
import * as THREE from "three";
import { placedParts } from "../world/dress";

const EMBERS = 12;
const col = (r: number, g: number, b: number) => new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);
const layer = (c: THREE.Color, side: THREE.Side) => new THREE.MeshBasicMaterial({ color: c, side, toneMapped: false, fog: false });
let MATS: THREE.MeshBasicMaterial[] | null = null, GEO: THREE.LatheGeometry | null = null;
/** teardrop: unit height, unit widest radius, base at the origin */
function teardrop() {
  const prof: [number, number][] = [[0, 0], [0.62, 0.05], [0.95, 0.18], [1, 0.31], [0.84, 0.5], [0.52, 0.7], [0.22, 0.88], [0, 1]];
  return new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 9);
}
type Tongue = { o: THREE.Object3D; h: number; lean: number; yaw: number; ph: number };
const tongues: Tongue[] = [], seen = new WeakSet<THREE.Object3D>();
let embers: THREE.Points | null = null, emberPos: number[] = [], emberSeed: number[] = [], emberSize: number[] = [], scanned = -1;
const box = new THREE.Box3(), size = new THREE.Vector3(), ws = new THREE.Vector3(), wp = new THREE.Vector3(), buf = new THREE.Vector2();

function dress(flame: THREE.Object3D, scene: THREE.Scene) {
  MATS ??= [layer(col(1.0, 0.2, 0.03), THREE.BackSide), layer(col(1.3, 0.6, 0.07), THREE.BackSide), layer(col(3.0, 2.5, 1.3), THREE.FrontSide)];
  GEO ??= teardrop();
  flame.updateWorldMatrix(true, true); box.setFromObject(flame).getSize(size); flame.getWorldScale(ws); flame.getWorldPosition(wp);
  const H = Math.max(0.5, size.y / ws.y) * 1.25, R = Math.max(0.16, Math.max(size.x, size.z) / 2 / ws.x) * 1.1, y0 = (box.min.y - wp.y) / ws.y;
  flame.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.visible = false; });   // the kit's single cone
  const seed = tongues.length * 1.7;
  for (const [i, t] of ([[0, 0, 1, 1, 0], [0.55, 0.42, 0.62, 0.6, 0.6], [0.5, 0.4, 0.5, 0.55, 3.9]] as const).entries()) {
    const [off, lean, hs, rs, yaw] = t, g = new THREE.Group();
    g.position.set(Math.sin(yaw) * off * R, y0, Math.cos(yaw) * off * R);
    for (const [k, w, hh] of [[0, 1, 1], [1, 0.72, 0.8], [2, 0.42, 0.56]] as const) {
      const m = new THREE.Mesh(GEO, MATS[k]); m.scale.set(R * rs * w, H * hs * hh, R * rs * w); m.position.y = k * 0.02 * H; m.renderOrder = 2 + k; g.add(m);
    }
    flame.add(g); tongues.push({ o: g, h: 1, lean, yaw, ph: seed + i * 2.3 });
  }
  for (let i = 0; i < EMBERS; i++) {
    emberPos.push(wp.x, wp.y + y0 * ws.y, wp.z); emberSeed.push(Math.random(), Math.random(), Math.random(), Math.random()); emberSize.push(H * ws.y);
  }
  if (embers) { embers.removeFromParent(); embers.geometry.dispose(); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(emberPos, 3)); g.setAttribute("aSeed", new THREE.Float32BufferAttribute(emberSeed, 4)); g.setAttribute("aSize", new THREE.Float32BufferAttribute(emberSize, 1));
  embers = new THREE.Points(g, emberMat()); embers.frustumCulled = false; embers.renderOrder = 19; embers.name = "embers"; scene.add(embers);
}
const EU = { uTime: { value: 0 }, uPx: { value: 6 } };
let EMAT: THREE.ShaderMaterial | null = null;
function emberMat() {
  return (EMAT ??= new THREE.ShaderMaterial({
    uniforms: EU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
    vertexShader: /* glsl */ `
attribute vec4 aSeed; attribute float aSize; uniform float uTime; uniform float uPx; varying float vK;
void main() {
  float life = 1.0 + aSeed.w * 0.9, k = fract(uTime / life + aSeed.x);
  float a = aSeed.y * 6.2831853 + k * 2.4 * (aSeed.z - 0.5), rad = (0.1 + aSeed.z * 0.22 + k * 0.5) * aSize;
  vec3 p = position + vec3(cos(a) * rad + sin(uTime * 2.3 + aSeed.y * 21.0) * 0.1 * k, (0.45 + k * (1.5 + aSeed.w * 1.3)) * aSize, sin(a) * rad);
  vK = k; gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  gl_PointSize = uPx * (0.55 + aSeed.w * 0.45) * (1.0 - k * k * 0.75);
}`,
    fragmentShader: /* glsl */ `
varying float vK;
void main() {
  vec2 q = abs(gl_PointCoord - 0.5); float d = q.x + q.y;                 // a little diamond
  float a = (1.0 - smoothstep(0.34, 0.5, d)) * smoothstep(0.0, 0.06, vK) * (1.0 - smoothstep(0.7, 1.0, vK));
  if (a < 0.01) discard;
  gl_FragColor = vec4(mix(vec3(3.2, 2.4, 0.9), vec3(1.7, 0.42, 0.05), smoothstep(0.0, 0.7, vK)) * a, a);
}`,
  }));
}
/** call once per render frame: dresses any campfire flames placed since the last call, then animates them */
export function updateCampfires(time: number, scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
  if (scanned !== placedParts.size) {
    scanned = placedParts.size;
    for (const parts of placedParts.values()) if (parts.flame && !seen.has(parts.flame)) { seen.add(parts.flame); dress(parts.flame, scene); }
  }
  if (embers && embers.parent !== scene) scene.add(embers);
  for (const t of tongues) {
    const a = Math.sin(time * 9.1 + t.ph) * 0.5 + Math.sin(time * 15.7 + t.ph * 1.9) * 0.5;     // -1..1, never periodic to the eye
    t.o.scale.set(1 - a * 0.06, 1 + a * 0.13, 1 - a * 0.06);
    t.o.rotation.set(Math.cos(t.yaw) * t.lean + Math.sin(time * 6.3 + t.ph) * 0.09, 0, -Math.sin(t.yaw) * t.lean + Math.cos(time * 7.4 + t.ph) * 0.09);
  }
  EU.uTime.value = time; EU.uPx.value = 6.5 * renderer.getDrawingBufferSize(buf).y / 900;
}
