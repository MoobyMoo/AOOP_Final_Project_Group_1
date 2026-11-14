// The Kingpin .45: the Businessman's sidearm (fictional; no real make or model).
// The model and its fire/reload motion are authored in Blender by tools/blender/kingpin/build_kingpin.py and shipped as
// public/models/kingpin45.glb: nodes body > { frame, slide, hammer, trigger, mag, mag_ext, muzzle, eject }, clips "fire"
// and "reload" baked at 100 fps. Grip at the origin, barrel along +z, ejection port on +x (the handR side).
// preloadKingpin() loads the file once (await it at boot); createKingpin() is synchronous after that.
// Two draw calls per gun: frame + slide + hammer + trigger are merged into one rigidly skinned mesh (one bone per
// moving part) and the magazine is its own mesh (it swaps geometry and dissolves when dropped).
// GunView.pose() samples the clips by normalised time, so it is still a pure function of {fireT, reloadT} and gameplay
// owns the clock. No allocation after createKingpin(). GunFx is pooled (no allocation after createGunFx).
// FX sources: research/look/FINDINGS.md VFX row (punchy flash, ejected brass, bright tracers, directional impact
// bursts) and research/duckov-re/CODE_FINDINGS.md 2.5 (flash-class feedback fades in 56-125 ms).
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { GunView, GunFx } from "../contracts";
import { patch, surf, TOON } from "../render/shading";

const BRASS = "#f0b548";
const KINGPIN_URL = `${import.meta.env.BASE_URL}models/kingpin45.glb`;

// ------------------------------------------------------------------------------------------------ geometry helpers (brass)
/** paint a geometry one colour (vertex colours), non-indexed, no uv, so every part merges into one buffer */
function tint(g: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  const gg = g.index ? g.toNonIndexed() : g; gg.deleteAttribute("uv");
  const c = new THREE.Color(hex), n = gg.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  gg.setAttribute("color", new THREE.BufferAttribute(arr, 3)); return gg;
}
/** cylinder along z */
function rod(hex: string, r: number, len: number, x: number, y: number, z: number, seg = 12): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, len, seg); g.rotateX(Math.PI / 2); g.translate(x, y, z); return tint(g, hex);
}
const merged = (parts: THREE.BufferGeometry[]) => { const g = mergeGeometries(parts, false)!; for (const p of parts) p.dispose(); g.computeBoundingSphere(); return g; };

// ------------------------------------------------------------------------------------------------ material
/** A small studio sky for the gun's metal to reflect (the stage has no environment map, and metal with nothing to
 *  reflect goes black). Equirect, linear. It is built for contrast, not for light: a bright warm horizon over a cool
 *  zenith, dark ground below (the dark band is what makes a facet read as metal), a soft key where the stage sun sits
 *  (elevation 50, azimuth 160) and a cool fill opposite. The renderer prefilters it on first use. */
let ENV: THREE.DataTexture | null = null;
function studioEnv(): THREE.DataTexture {
  if (ENV) return ENV;
  const W = 64, H = 32, px = new Uint16Array(W * H * 4), d = new THREE.Vector3();
  const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(40), THREE.MathUtils.degToRad(160));
  const fill = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(62), THREE.MathUtils.degToRad(340));
  const hor = [0.95, 0.90, 0.80], zen = [0.22, 0.32, 0.60], sand = [0.26, 0.21, 0.14], nadir = [0.06, 0.05, 0.04];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const el = ((j + 0.5) / H - 0.5) * Math.PI, az = ((i + 0.5) / W - 0.5) * 2 * Math.PI, sy = Math.sin(el);
    d.set(Math.cos(el) * Math.cos(az), sy, Math.cos(el) * Math.sin(az));
    const from = sy >= 0 ? hor : sand, to = sy >= 0 ? zen : nadir, k = Math.pow(Math.abs(sy), sy >= 0 ? 0.5 : 0.4);
    const key = 5 * Math.exp(-Math.pow(Math.acos(Math.min(1, d.dot(sun))) / 0.38, 2)), cool = 1.2 * Math.exp(-Math.pow(Math.acos(Math.min(1, d.dot(fill))) / 0.6, 2));
    const o = (j * W + i) * 4;
    px[o] = THREE.DataUtils.toHalfFloat(from[0] + (to[0] - from[0]) * k + key + cool * 0.7);
    px[o + 1] = THREE.DataUtils.toHalfFloat(from[1] + (to[1] - from[1]) * k + key * 0.86 + cool * 0.85);
    px[o + 2] = THREE.DataUtils.toHalfFloat(from[2] + (to[2] - from[2]) * k + key * 0.62 + cool);
    px[o + 3] = THREE.DataUtils.toHalfFloat(1);
  }
  ENV = new THREE.DataTexture(px, W, H, THREE.RGBAFormat, THREE.HalfFloatType);
  ENV.mapping = THREE.EquirectangularReflectionMapping; ENV.colorSpace = THREE.LinearSRGBColorSpace;
  ENV.minFilter = ENV.magFilter = THREE.LinearFilter; ENV.needsUpdate = true;
  return ENV;
}
const ENV_I = 1;

/** Gun material in the shared look (rim light + canopy cookie from patch()), plus a little self-fill so the gold and
 *  ivory stay warm when the sun is behind the gun (the monkeys do the same with emissive).
 *  With `pbr` (the Kingpin): base colour and metal/roughness from the model's palette texture, ambient occlusion in the
 *  vertex colours, and the studio sky to reflect. Without (the brass): vertex colours only.
 *  Fading parts (the dropped magazine, old brass) dissolve with a screen-door dither, so they stay opaque: no sorting,
 *  no blending state, same program for every gun. "uniform": one fade per material; "attr": one per instance. */
function gunMat(rough: number, fade: "none" | "uniform" | "attr" = "none", pbr?: { map: THREE.Texture; orm: THREE.Texture }) {
  const p: THREE.MeshStandardMaterialParameters = { color: "#ffffff", vertexColors: true, roughness: rough, metalness: 0 };
  if (pbr) {
    p.map = pbr.map;
    if (!TOON) { p.roughnessMap = p.metalnessMap = pbr.orm; p.roughness = p.metalness = 1; p.envMap = studioEnv(); p.envMapIntensity = ENV_I; }
  }
  const m = patch(surf(p), { rim: pbr ? 0.55 : 0.9 });
  const base = m.onBeforeCompile, key = m.customProgramCacheKey, uFade = { value: 1 }, fill = pbr ? "0.12" : "0.2";
  m.userData.uFade = uFade;
  m.onBeforeCompile = (sh, r) => {
    base.call(m, sh, r);
    sh.fragmentShader = sh.fragmentShader.replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * ${fill};`);
    if (fade === "none") return;
    const DITHER = "\n  if (kpFade < 0.999 && kpFade < fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))))) discard;";
    if (fade === "attr") {
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float iFade;\nvarying float kpFade;").replace("#include <begin_vertex>", "#include <begin_vertex>\n  kpFade = iFade;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying float kpFade;");
    } else { sh.uniforms.kpFade = uFade; sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform float kpFade;"); }
    sh.fragmentShader = sh.fragmentShader.replace("#include <color_fragment>", "#include <color_fragment>" + DITHER);
  };
  m.customProgramCacheKey = () => key.call(m) + "|kp-" + fade + fill;
  return m;
}

const sstep = (x: number) => { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); };
const seg = (t: number, a: number, b: number) => { const x = (t - a) / (b - a); return x < 0 ? 0 : x > 1 ? 1 : x; };

// ------------------------------------------------------------------------------------------------ the asset
const PARTS = ["body", "slide", "hammer", "trigger", "mag"];   // the animated nodes, in table order
const SLIDE = 1, NP = PARTS.length, S7 = 7;            // per sample: px py pz qx qy qz qw
const SKIN = ["frame", "slide", "hammer", "trigger"];          // merged into the skinned body; bone i moves part i
/** a clip resampled to a uniform table: data[(part * n + i) * 7] */
type Clip = { n: number; has: boolean[]; data: Float32Array };
type Asset = {
  body: THREE.BufferGeometry; mag: THREE.BufferGeometry; magExt: THREE.BufferGeometry; sphere: THREE.Sphere;
  rest: Float32Array; restInv: THREE.Quaternion[]; boneInv: THREE.Matrix4[]; fire: Clip; reload: Clip;
  muzzle: THREE.Vector3; eject: THREE.Vector3; map: THREE.Texture; orm: THREE.Texture;
  /** reloadT: the old magazine dissolves over [0], [1]; the new one appears over [2], [3] */ magFade: number[]; slideMin: number;
};
let ASSET: Asset | null = null, loading: Promise<void> | null = null, bodyMat: THREE.Material | null = null;

function table(clip: THREE.AnimationClip, rest: Float32Array): Clip {
  const n = Math.round(clip.duration * 100) + 1, data = new Float32Array(NP * n * S7), has = PARTS.map(() => false);
  for (let p = 0; p < NP; p++) for (let i = 0; i < n; i++) data.set(rest.subarray(p * S7, p * S7 + S7), (p * n + i) * S7);
  for (const tr of clip.tracks) {
    const dot = tr.name.lastIndexOf("."), p = PARTS.indexOf(tr.name.slice(0, dot)), prop = tr.name.slice(dot + 1);
    if (p < 0 || (prop !== "position" && prop !== "quaternion")) continue;
    has[p] = true;
    const off = prop === "position" ? 0 : 3, len = prop === "position" ? 3 : 4, T = tr.times, V = tr.values;
    for (let i = 0, j = 0; i < n; i++) {   // the keys are dense (one per baked frame), so linear between them is exact enough for both
      const t = clip.duration * i / (n - 1);
      while (j < T.length - 2 && T[j + 1] < t) j++;
      const j1 = Math.min(j + 1, T.length - 1), f = T[j1] > T[j] ? Math.min(1, Math.max(0, (t - T[j]) / (T[j1] - T[j]))) : 0;
      for (let k = 0; k < len; k++) data[(p * n + i) * S7 + off + k] = V[j * len + k] + (V[j1 * len + k] - V[j * len + k]) * f;
    }
  }
  for (let i = 0; i < NP * n; i++) {       // renormalise the rotations
    const o = i * S7 + 3, l = Math.hypot(data[o], data[o + 1], data[o + 2], data[o + 3]) || 1;
    for (let k = 0; k < 4; k++) data[o + k] /= l;
  }
  return { n, has, data };
}
/** table lookup at normalised time t: lerp the position, nlerp the rotation along the short way */
function sample(c: Clip, p: number, t: number, out: Float32Array) {
  const x = (t <= 0 ? 0 : t >= 1 ? 1 : t) * (c.n - 1), i = Math.min(c.n - 2, x | 0), f = x - i, o = (p * c.n + i) * S7, d = c.data;
  for (let k = 0; k < 3; k++) out[k] = d[o + k] + (d[o + S7 + k] - d[o + k]) * f;
  const sg = d[o + 3] * d[o + 10] + d[o + 4] * d[o + 11] + d[o + 5] * d[o + 12] + d[o + 6] * d[o + 13] < 0 ? -1 : 1;
  let l = 0;
  for (let k = 3; k < 7; k++) { out[k] = d[o + k] + (sg * d[o + S7 + k] - d[o + k]) * f; l += out[k] * out[k]; }
  l = 1 / Math.sqrt(l); for (let k = 3; k < 7; k++) out[k] *= l;
}

async function load(): Promise<void> {
  const gltf = await new GLTFLoader().loadAsync(KINGPIN_URL);
  const node = (name: string) => { const o = gltf.scene.getObjectByName(name); if (!o) throw new Error(`kingpin45.glb: no node "${name}"`); return o; };
  const mesh = (name: string) => { const o = node(name) as THREE.Mesh; if (!o.isMesh) throw new Error(`kingpin45.glb: "${name}" is not a mesh`); return o; };
  const clip = (name: string) => { const c = gltf.animations.find((a) => a.name === name); if (!c) throw new Error(`kingpin45.glb: no clip "${name}"`); return c; };
  const rest = new Float32Array(NP * S7), restInv: THREE.Quaternion[] = [];
  PARTS.forEach((name, p) => { const o = node(name); o.position.toArray(rest, p * S7); o.quaternion.toArray(rest, p * S7 + 3); restInv.push(o.quaternion.clone().invert()); });
  // the rigid parts, each brought into body space at rest and tagged with its bone
  const boneInv: THREE.Matrix4[] = [];
  const body = mergeGeometries(SKIN.map((name, bone) => {
    const o = mesh(name), g = o.geometry.clone(); o.updateMatrix(); g.applyMatrix4(o.matrix); boneInv.push(o.matrix.clone().invert());
    const n = g.attributes.position.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = bone; sw[i * 4] = 1; }
    g.setAttribute("skinIndex", new THREE.BufferAttribute(si, 4)); g.setAttribute("skinWeight", new THREE.BufferAttribute(sw, 4));
    return g;
  }), false);
  if (!body) throw new Error("kingpin45.glb: the body parts do not merge (attribute sets differ)");
  body.computeBoundingSphere();
  const sphere = body.boundingSphere!.clone(); sphere.radius += 0.25;               // room for the slide, hammer and recoil
  const src = mesh("frame").material as THREE.MeshStandardMaterial, map = src.map, orm = src.metalnessMap;
  if (!map || !orm) throw new Error("kingpin45.glb: palette textures missing");
  for (const t of [map, orm]) { t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; } // flat palette cells: no filtering across them
  const extras = node("kingpin45").userData as { magFade?: number[]; slideTravel?: number };
  ASSET = {
    body, mag: mesh("mag").geometry, magExt: mesh("mag_ext").geometry, sphere, rest, restInv, boneInv,
    fire: table(clip("fire"), rest), reload: table(clip("reload"), rest),
    muzzle: node("muzzle").position.clone(), eject: node("eject").position.clone(), map, orm,
    magFade: extras.magFade ?? [0.27, 0.42, 0.45, 0.5], slideMin: rest[SLIDE * S7 + 2] - (extras.slideTravel ?? 0.13),
  };
}
/** Load the Kingpin's GLB (once). Await this at boot, before the first createKingpin(). */
export function preloadKingpin(): Promise<void> { return (loading ??= load()); }

const IDENT = new THREE.Matrix4(), _a = new Float32Array(S7), _b = new Float32Array(S7), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();

export function createKingpin(): GunView {
  if (!ASSET) throw new Error("createKingpin(): await preloadKingpin() first");
  const A = ASSET;
  bodyMat ??= gunMat(0.4, "none", A);
  const root = new THREE.Group(); root.name = "kingpin45";
  const body = new THREE.Group(); body.name = "body"; root.add(body);            // recoil + reload motion live here, never on root
  const bones = SKIN.map((name) => { const b = new THREE.Bone(); b.name = name; body.add(b); return b; });
  const skin = new THREE.SkinnedMesh(A.body, bodyMat); skin.name = "kingpinBody"; skin.castShadow = true; skin.receiveShadow = true;
  body.add(skin); skin.bind(new THREE.Skeleton(bones, A.boneInv), IDENT); skin.boundingSphere = A.sphere;
  const magMat = gunMat(0.4, "uniform", A), magFade = magMat.userData.uFade as { value: number }; // per gun: the dropped magazine dissolves
  const mag = new THREE.Mesh(A.mag, magMat); mag.name = "mag"; mag.castShadow = true; mag.receiveShadow = true; body.add(mag);
  const muzzle = new THREE.Object3D(); muzzle.name = "muzzle"; muzzle.position.copy(A.muzzle); body.add(muzzle);
  const eject = new THREE.Object3D(); eject.name = "eject"; eject.position.copy(A.eject); body.add(eject);
  const target: THREE.Object3D[] = [body, bones[1], bones[2], bones[3], mag];      // PARTS order
  const view: GunView = {
    root, muzzle, eject,
    setVariant(v) { mag.geometry = v.extMag ? A.magExt : A.mag; },
    pose(s) {
      const f = s.fireT, r = s.reloadT, firing = f >= 0 && f < 1, reloading = r >= 0 && r <= 1, rest = A.rest;
      for (let p = 0; p < NP; p++) {
        const o = p * S7, t = target[p];
        if (reloading && A.reload.has[p]) sample(A.reload, p, r, _a); else for (let k = 0; k < S7; k++) _a[k] = rest[o + k];
        t.position.set(_a[0], _a[1], _a[2]); t.quaternion.set(_a[3], _a[4], _a[5], _a[6]);
        if (firing && A.fire.has[p]) {   // the shot rides on top as its difference from rest (so alone it is exactly the fire clip)
          sample(A.fire, p, f, _b);
          t.position.x += _b[0] - rest[o]; t.position.y += _b[1] - rest[o + 1]; t.position.z += _b[2] - rest[o + 2];
          t.quaternion.multiply(_q.copy(A.restInv[p]).multiply(_q2.set(_b[3], _b[4], _b[5], _b[6])));
        }
      }
      const sl = target[SLIDE]; if (sl.position.z < A.slideMin) sl.position.z = A.slideMin; // a shot during the rack can't push it past its stop
      let alpha = 1;
      if (reloading) { const m = A.magFade; alpha = r < m[0] ? 1 : r < m[1] ? 1 - sstep(seg(r, m[0], m[1])) : r < m[2] ? 0 : sstep(seg(r, m[2], m[3])); }
      magFade.value = alpha; mag.visible = alpha > 0.01; mag.castShadow = alpha > 0.5;
    },
  };
  view.pose({ fireT: 1, reloadT: -1 });
  return view;
}

// ================================================================================================ FX
// Two draw calls for everything: one instanced sprite batch (flash, tongue, tracer, stars, dust, splinters; additive
// and alpha-blended in the same batch through premultiplied output) and one instanced brass pool. Plus one PointLight
// that stays in the scene at intensity 0 so the light count never changes (no shader recompiles on a shot).
const SPRITES = 160, SHELLS = 24;
const GLOW = 0, STAR = 1, BURST = 2, PUFF = 3, CHIP = 4, STREAK = 5, FLAME = 6;        // sprite shapes
const FREE = 1, TRACER = 2;                                                           // particle behaviours
const FLASH_T = 0.055, TRACER_T = 0.06, LIGHT_T = 0.075, LIGHT_I = 30;
const SHELL_LIE = 3, SHELL_FADE = 0.45, GROUND = 0.05, GRAV = 16;

const SPRITE_VERT = /* glsl */ `
attribute vec3 iPos; attribute vec3 iAxis; attribute vec4 iShape; attribute vec4 iColor; attribute vec2 iMisc;
varying vec2 vUv; varying vec4 vCol; varying float vShape; varying float vAdd;
void main() {
  vUv = position.xy; vCol = iColor; vShape = iShape.w; vAdd = iMisc.x;
  vec4 mv = viewMatrix * vec4(iPos, 1.0);
  if (dot(iAxis, iAxis) > 1e-8) {               // stretched along a world axis, facing the camera around it
    vec3 ax = (viewMatrix * vec4(iAxis, 0.0)).xyz;
    vec3 sd = cross(ax, mv.xyz + ax * 0.5); sd /= max(length(sd), 1e-5);
    mv.xyz += ax * (position.y * 0.5 + 0.5) + sd * position.x * iShape.x;
  } else {                                      // camera-facing, rolled
    float c = cos(iShape.z), s = sin(iShape.z); vec2 q = position.xy * iShape.xy;
    mv.xy += vec2(q.x * c - q.y * s, q.x * s + q.y * c);
  }
  mv.xyz *= 1.0 - iMisc.y / max(length(mv.xyz), 1.0);   // pull toward the eye so sprites don't sink into what they hit
  gl_Position = projectionMatrix * mv;
}`;
const SPRITE_FRAG = /* glsl */ `
varying vec2 vUv; varying vec4 vCol; varying float vShape; varying float vAdd;
float star5(vec2 p, float r, float rf) {
  const vec2 k1 = vec2(0.809016994375, -0.587785252292); const vec2 k2 = vec2(-k1.x, k1.y);
  p.x = abs(p.x); p -= 2.0 * max(dot(k1, p), 0.0) * k1; p -= 2.0 * max(dot(k2, p), 0.0) * k2; p.x = abs(p.x); p.y -= r;
  vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0); float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}
void main() {
  vec2 p = vUv; float r = length(p), a = 0.0, core = 0.0; int sh = int(vShape + 0.5);
  if (sh == 0) { a = pow(clamp(1.0 - r, 0.0, 1.0), 2.0); core = a * a; }
  else if (sh == 1) { float d = star5(p, 0.96, 0.46), w = fwidth(d); a = 1.0 - smoothstep(-w, w, d); }
  else if (sh == 2) {
    float t = atan(p.y, p.x) / 6.2831853 * 8.0, m = abs(fract(t + 0.5) - 0.5) * 2.0, id = floor(t + 0.5);
    float len = 0.62 + 0.38 * fract(sin(id * 12.9898 + 4.1) * 43758.5453);
    float rb = mix(0.2, len, pow(1.0 - m, 2.6)), d = r - rb, w = fwidth(d);
    a = 1.0 - smoothstep(-w, w, d); core = 1.0 - smoothstep(0.08, 0.5, r);
  }
  else if (sh == 3) { a = 1.0 - smoothstep(0.8, 1.0, r); }
  else if (sh == 4) { a = 1.0; }
  else if (sh == 5) {
    float v = p.y * 0.5 + 0.5, w = mix(0.3, 1.0, v), x = abs(p.x) / w;
    a = (1.0 - smoothstep(0.25, 1.0, x)) * smoothstep(0.0, 0.04, v) * (1.0 - smoothstep(0.96, 1.0, v)); core = 1.0 - smoothstep(0.0, 0.45, x);
  }
  else {
    float v = p.y * 0.5 + 0.5, w = 2.0 * pow(v, 0.35) * pow(1.0 - v, 0.8), d = abs(p.x) - w, e = fwidth(d);
    a = 1.0 - smoothstep(-e, e, d); core = (1.0 - smoothstep(0.0, 0.7, abs(p.x) / max(w, 1e-3))) * (1.0 - v);
  }
  a *= vCol.a; if (a < 0.004) discard;
  vec3 col = mix(vCol.rgb, vec3(max(vCol.r, max(vCol.g, vCol.b))) * 1.15, core * 0.85);
  gl_FragColor = vec4(col * a, a * (1.0 - vAdd));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export type KingpinFx = GunFx & { /** live numbers for the review page */ stats(): { drawCalls: number; sprites: number; shells: number; triangles: number } };

export function createGunFx(scene: THREE.Scene): KingpinFx {
  // ---- sprite batch
  const sg = new THREE.InstancedBufferGeometry();
  sg.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  sg.setIndex([0, 1, 2, 0, 2, 3]);
  const iattr = (name: string, size: number) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(SPRITES * size), size); a.setUsage(THREE.DynamicDrawUsage); sg.setAttribute(name, a); return a; };
  const aPos = iattr("iPos", 3), aAxis = iattr("iAxis", 3), aShape = iattr("iShape", 4), aColor = iattr("iColor", 4), aMisc = iattr("iMisc", 2);
  sg.instanceCount = 0;
  const sprites = new THREE.Mesh(sg, new THREE.ShaderMaterial({
    vertexShader: SPRITE_VERT, fragmentShader: SPRITE_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  }));
  sprites.frustumCulled = false; sprites.renderOrder = 20; sprites.name = "kingpinFxSprites"; scene.add(sprites);
  // ---- particle state (struct of arrays; a ring allocator overwrites the oldest when full)
  const F = () => new Float32Array(SPRITES);
  const kind = new Uint8Array(SPRITES), shape = new Uint8Array(SPRITES);
  const age = F(), life = F(), px = F(), py = F(), pz = F(), vx = F(), vy = F(), vz = F(), sx = F(), sy = F(), grow = F(), rot = F(), spin = F();
  const cr = F(), cg = F(), cb = F(), al = F(), fadeAt = F(), add = F(), grav = F(), drag = F(), pull = F();
  let next = 0, seed = 0x2f6e2b1;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const rr = (a: number, b: number) => a + (b - a) * rnd();
  const col = (hex: string, boost = 1) => new THREE.Color(hex).multiplyScalar(boost);
  const C = { // linear working colours; boosts above 1 are what the bloom pass picks up
    flash: col("#ffb347", 5), flashCore: col("#fff1c2", 7), tracer: col("#ffd76a", 5.5), light: new THREE.Color("#ffc170"),
    starHot: col("#fffbe6", 2.6), starGold: col("#ffc81e", 1.5), starOrange: col("#ff9a1f", 1.15), spark: col("#ffe2a8", 4),
    dustA: col("#c9a468"), dustB: col("#9a7245"), dustC: col("#dcbf8a"), chipA: col("#6e4a28"), chipB: col("#b98f58"),
  };
  function emit(k: number, sh: number, x: number, y: number, z: number, wx: number, wy: number, wz: number, w: number, h: number, g: number, lifeS: number, c: THREE.Color, a: number, additive: number, fade: number, gravity = 0, dragK = 0, r0 = 0, sp = 0, pl = 0.35) {
    const i = next; next = (next + 1) % SPRITES;
    kind[i] = k; shape[i] = sh; age[i] = 0; life[i] = lifeS; px[i] = x; py[i] = y; pz[i] = z; vx[i] = wx; vy[i] = wy; vz[i] = wz;
    sx[i] = w; sy[i] = h; grow[i] = g; rot[i] = r0; spin[i] = sp; cr[i] = c.r; cg[i] = c.g; cb[i] = c.b; al[i] = a; fadeAt[i] = fade; add[i] = additive; grav[i] = gravity; drag[i] = dragK; pull[i] = pl;
  }
  // ---- brass pool
  const shellGeo = (() => {
    const parts = [rod(BRASS, 0.036, 0.125, 0, 0, 0, 8), rod("#c98a2c", 0.041, 0.018, 0, 0, -0.062, 8)]; // oversized so it reads from 40 u
    return merged(parts);
  })();
  const shellFade = new THREE.InstancedBufferAttribute(new Float32Array(SHELLS).fill(1), 1); shellFade.setUsage(THREE.DynamicDrawUsage); shellGeo.setAttribute("iFade", shellFade);
  const shellMat = gunMat(0.3, "attr");
  const shells = new THREE.InstancedMesh(shellGeo, shellMat, SHELLS);
  shells.instanceMatrix.setUsage(THREE.DynamicDrawUsage); shells.frustumCulled = false; shells.name = "kingpinFxShells"; shells.count = 0; scene.add(shells);
  const sT = new Float32Array(SHELLS).fill(-1), sP = new Float32Array(SHELLS * 3), sV = new Float32Array(SHELLS * 3), sAx = new Float32Array(SHELLS * 3);
  const sAng = new Float32Array(SHELLS), sSpin = new Float32Array(SHELLS), sYaw = new Float32Array(SHELLS), sState = new Uint8Array(SHELLS); // 0 flying, 1 bounced, 2 lying
  let sNext = 0;
  // ---- light
  const light = new THREE.PointLight(C.light, 0, 7, 2); light.name = "kingpinFxLight"; scene.add(light);
  let lightT = 1;
  // ---- scratch
  const m0 = new THREE.Vector3(), dir = new THREE.Vector3(), e0 = new THREE.Vector3(), right = new THREE.Vector3(), back = new THREE.Vector3(), n = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3();
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), ax = new THREE.Vector3(), pos = new THREE.Vector3(), scl = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  let liveSprites = 0, liveShells = 0;

  function write() {
    let c = 0;
    for (let i = 0; i < SPRITES; i++) {
      if (!kind[i]) continue;
      const k = Math.min(1, age[i] / life[i]), e = 1 - (1 - k) * (1 - k), s = 1 + (grow[i] - 1) * e;
      let a = al[i] * (k <= fadeAt[i] ? 1 : 1 - sstep((k - fadeAt[i]) / (1 - fadeAt[i])));
      const o3 = c * 3, o4 = c * 4;
      if (kind[i] === TRACER) { // the streak: head races to the hit point, tail follows it in
        const head = Math.min(1, 0.4 + 0.6 * age[i] / 0.012), tail = seg(age[i], 0.012, TRACER_T), len = Math.max(0, head - tail);
        aPos.array[o3] = px[i] + vx[i] * tail; aPos.array[o3 + 1] = py[i] + vy[i] * tail; aPos.array[o3 + 2] = pz[i] + vz[i] * tail;
        aAxis.array[o3] = vx[i] * len; aAxis.array[o3 + 1] = vy[i] * len; aAxis.array[o3 + 2] = vz[i] * len;
        aShape.array[o4] = sx[i]; a = al[i];
      } else {
        aPos.array[o3] = px[i]; aPos.array[o3 + 1] = py[i]; aPos.array[o3 + 2] = pz[i];
        if (shape[i] === FLAME) { aAxis.array[o3] = vx[i] * s; aAxis.array[o3 + 1] = vy[i] * s; aAxis.array[o3 + 2] = vz[i] * s; aShape.array[o4] = sx[i] * s; }
        else { aAxis.array[o3] = aAxis.array[o3 + 1] = aAxis.array[o3 + 2] = 0; aShape.array[o4] = sx[i] * s; }
      }
      aShape.array[o4 + 1] = sy[i] * s; aShape.array[o4 + 2] = rot[i]; aShape.array[o4 + 3] = shape[i];
      aColor.array[o4] = cr[i]; aColor.array[o4 + 1] = cg[i]; aColor.array[o4 + 2] = cb[i]; aColor.array[o4 + 3] = a;
      aMisc.array[c * 2] = add[i]; aMisc.array[c * 2 + 1] = pull[i];
      c++;
    }
    liveSprites = sg.instanceCount = c; sprites.visible = c > 0;
    aPos.needsUpdate = aAxis.needsUpdate = aShape.needsUpdate = aColor.needsUpdate = aMisc.needsUpdate = true;
    let sc = 0;
    for (let i = 0; i < SHELLS; i++) {
      if (sT[i] < 0) continue;
      const o = i * 3;
      if (sState[i] === 2) { q.setFromAxisAngle(UP, sYaw[i]); }
      else { q.setFromAxisAngle(ax.set(sAx[o], sAx[o + 1], sAx[o + 2]), sAng[i]); q2.setFromAxisAngle(UP, sYaw[i]); q.multiply(q2); }
      shells.setMatrixAt(sc, mtx.compose(pos.set(sP[o], sP[o + 1], sP[o + 2]), q, scl.set(1, 1, 1)));
      shellFade.array[sc] = sState[i] === 2 ? 1 - sstep((sT[i] - SHELL_LIE) / SHELL_FADE) : 1;
      sc++;
    }
    liveShells = shells.count = sc; shells.visible = sc > 0;
    shells.instanceMatrix.needsUpdate = true; shellFade.needsUpdate = true;
  }

  return {
    fire(muzzle, eject, to, hit) {
      muzzle.updateWorldMatrix(true, false); eject.updateWorldMatrix(true, false);
      const me = muzzle.matrixWorld.elements, ee = eject.matrixWorld.elements;
      m0.set(me[12], me[13], me[14]); dir.set(me[8], me[9], me[10]).normalize();
      // ---- muzzle flash: soft glow + rolled star burst + a tongue along the barrel; ~3 frames
      const roll = rnd() * 6.283, big = rr(0.9, 1.15);
      emit(FREE, GLOW, m0.x, m0.y, m0.z, 0, 0, 0, 0.9 * big, 0.9 * big, 1.25, FLASH_T, C.flash, 0.45, 1, 0.2, 0, 0, 0, 0, 0.6);
      emit(FREE, FLAME, m0.x - dir.x * 0.05, m0.y - dir.y * 0.05, m0.z - dir.z * 0.05, dir.x * 0.95 * big, dir.y * 0.95 * big, dir.z * 0.95 * big, 0.17 * big, 1, 1.3, FLASH_T, C.flash, 1, 1, 0.45, 0, 0, 0, 0, 0.6);
      emit(FREE, BURST, m0.x + dir.x * 0.1, m0.y + dir.y * 0.1, m0.z + dir.z * 0.1, 0, 0, 0, 0.5 * big, 0.5 * big, 1.35, FLASH_T, C.flashCore, 1, 1, 0.45, 0, 0, roll, rr(-6, 6), 0.7);
      light.position.copy(m0).addScaledVector(dir, 0.35); light.position.y += 0.35; lightT = 0; light.intensity = LIGHT_I;
      // ---- tracer
      t1.copy(to).sub(m0); const dist = t1.length();
      if (dist > 0.6) { t2.copy(m0).addScaledVector(dir, 0.3); t1.copy(to).sub(t2); emit(TRACER, STREAK, t2.x, t2.y, t2.z, t1.x, t1.y, t1.z, 0.07, 1, 1, TRACER_T, C.tracer, 1, 1, 1, 0, 0, 0, 0, 0.2); }
      // ---- brass: out of the port to the gun's +x, up and a little back
      const o = sNext * 3; sNext = (sNext + 1) % SHELLS; const si = o / 3;
      e0.set(ee[12], ee[13], ee[14]); right.set(ee[0], ee[1], ee[2]).normalize(); back.set(-ee[8], -ee[9], -ee[10]).normalize();
      sP[o] = e0.x; sP[o + 1] = e0.y; sP[o + 2] = e0.z;
      const vr = rr(1.7, 2.6), vu = rr(2.6, 3.6), vb = rr(0.2, 0.9);
      sV[o] = right.x * vr + back.x * vb; sV[o + 1] = right.y * vr + back.y * vb + vu; sV[o + 2] = right.z * vr + back.z * vb;
      ax.set(rr(-1, 1), rr(-0.3, 0.3), rr(-1, 1)).normalize(); sAx[o] = ax.x; sAx[o + 1] = ax.y; sAx[o + 2] = ax.z;
      sAng[si] = rnd() * 6.283; sSpin[si] = rr(18, 30) * (rnd() < 0.5 ? -1 : 1); sYaw[si] = Math.atan2(dir.x, dir.z) + rr(-0.5, 0.5); sT[si] = 0; sState[si] = 0;
      // ---- impact, thrown back along the shot
      if (hit !== "none") {
        n.copy(dir).negate(); right.crossVectors(UP, n); if (right.lengthSq() < 1e-6) right.set(1, 0, 0); right.normalize();
        if (hit === "enemy") { // cartoon pop: a gold star, a white-hot star on top, four little stars flying off. No blood, ever.
          const r0 = rr(-0.5, 0.5);
          emit(FREE, STAR, to.x, to.y, to.z, 0, 0, 0, 0.34, 0.34, 2.4, 0.17, C.starOrange, 1, 0, 0.55, 0, 0, r0, 3, 0.75);
          emit(FREE, STAR, to.x, to.y, to.z, 0, 0, 0, 0.23, 0.23, 2.3, 0.15, C.starHot, 1, 0, 0.5, 0, 0, r0 + 0.63, 3, 0.8);
          for (let i = 0; i < 4; i++) {
            const side = (i - 1.5) * rr(1.0, 1.7), back2 = rr(0.6, 2.2), up = rr(2.6, 4.4), sz = rr(0.17, 0.24);
            emit(FREE, STAR, to.x, to.y, to.z, right.x * side + n.x * back2, up, right.z * side + n.z * back2, sz, sz, 0.75, rr(0.36, 0.46), i % 2 ? C.starHot : C.starGold, 1, 0, 0.7, 11, 0.6, rnd() * 6, rr(-9, 9), 0.8);
          }
        } else { // wall: a spark, tan dust rolling back off the surface, a few splinters
          emit(FREE, GLOW, to.x, to.y, to.z, 0, 0, 0, 0.4, 0.4, 1.4, 0.05, C.spark, 0.9, 1, 0.3, 0, 0, 0, 0, 0.5);
          for (let i = 0; i < 5; i++) {
            const side = (i - 2) * 0.75 + rr(-0.4, 0.4), sp = rr(1.1, 2.6), sz = rr(0.13, 0.19);
            emit(FREE, PUFF, to.x + n.x * 0.1, to.y + rr(-0.08, 0.08), to.z + n.z * 0.1, n.x * sp + right.x * side, rr(0.3, 1.3), n.z * sp + right.z * side, sz, sz, rr(1.9, 2.5), rr(0.42, 0.6), i % 3 === 0 ? C.dustC : i % 3 === 1 ? C.dustA : C.dustB, 0.95, 0, 0.45, -0.6, 4.2, 0, 0, 0.45);
          }
          for (let i = 0; i < 4; i++) {
            const side = rr(-2.2, 2.2), sp = rr(1.6, 3.8);
            emit(FREE, CHIP, to.x + n.x * 0.1, to.y, to.z + n.z * 0.1, n.x * sp + right.x * side, rr(1.8, 3.6), n.z * sp + right.z * side, 0.034, rr(0.09, 0.15), 1, rr(0.34, 0.44), i % 2 ? C.chipA : C.chipB, 1, 0, 0.75, 14, 0.4, rnd() * 6, rr(-16, 16), 0.45);
          }
        }
      }
      write();
    },
    update(dt) {
      for (let i = 0; i < SPRITES; i++) {
        if (!kind[i]) continue;
        age[i] += dt; if (age[i] >= life[i]) { kind[i] = 0; continue; }
        if (kind[i] !== FREE || shape[i] === FLAME) continue;
        const d = Math.exp(-drag[i] * dt);
        vy[i] -= grav[i] * dt; vx[i] *= d; vy[i] *= d; vz[i] *= d;
        px[i] += vx[i] * dt; py[i] += vy[i] * dt; pz[i] += vz[i] * dt; rot[i] += spin[i] * dt;
      }
      if (lightT < 1) { lightT = Math.min(1, lightT + dt / LIGHT_T); const k = 1 - lightT; light.intensity = LIGHT_I * k * k; }
      for (let i = 0; i < SHELLS; i++) {
        if (sT[i] < 0) continue;
        const o = i * 3;
        if (sState[i] === 2) { sT[i] += dt; if (sT[i] > SHELL_LIE + SHELL_FADE) sT[i] = -1; continue; }
        sV[o + 1] -= GRAV * dt; sP[o] += sV[o] * dt; sP[o + 1] += sV[o + 1] * dt; sP[o + 2] += sV[o + 2] * dt; sAng[i] += sSpin[i] * dt;
        if (sP[o + 1] <= GROUND && sV[o + 1] < 0) {
          sP[o + 1] = GROUND;
          if (sState[i] === 0) { sState[i] = 1; sV[o + 1] *= -0.38; sV[o] *= 0.5; sV[o + 2] *= 0.5; sSpin[i] *= 0.6; } // the one bounce
          else { sState[i] = 2; sT[i] = 0; }                                                                            // then it lies there
        }
      }
      write();
    },
    stats: () => ({ drawCalls: (liveSprites > 0 ? 1 : 0) + (liveShells > 0 ? 1 : 0), sprites: liveSprites, shells: liveShells, triangles: liveSprites * 2 + liveShells * (shellGeo.attributes.position.count / 3) }),
  };
}
