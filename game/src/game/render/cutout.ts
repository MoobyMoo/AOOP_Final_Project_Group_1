// See-through for tall chunks (foliage, wall stubs, cliffs) on Duckov's mechanism, rebuilt from the recovered masked
// shader (research/duckov-re/POLISH_FINDINGS.md section 10, SodaLit_Mask2 compiled instructions) + per-object selection:
//  - WHICH pieces: Duckov swaps the material only on objects whose trigger the camera->player / camera->aim checkers
//    enter. Ours does the same per piece (G1.5 glitch hunt): every tall chunk piece carries aObj = its base x, z, top y
//    and reach (dress.ts), and a piece is affected only if it stands taller than the target, sits between the camera
//    and the target on the ground plan and reaches up into the sight line there. Low plants beside the hero stay whole.
//  - HOW: an opaque ORDERED 4x4 dither with Duckov's matrix (16 coverage levels): surviving pixels stay fully opaque and
//    normally shaded, so it reads as partial opacity at distance. No translucency, no silhouette pass, shadows untouched.
//  - WHERE on the piece: a height term. Kept below the player's feet + 0.25, coverage falls to 0 over 2 u (gone by
//    feet + 2.25). The angular cone (0.95/0.96, ~16-18 deg half-angle) spans our whole frame at this camera.
import * as THREE from "three";

/** Duckov serialized values: StartFadeHeight = playerY + 0.25, HeightFadeRange = 2 */
export const START_ABOVE_FEET = 0.25, HEIGHT_FADE = 2.0;
export const CUT = {
  uHeroPx: { value: new THREE.Vector2(-9999, -9999) }, uHeroDepth: { value: 0.5 },
  uAimPx: { value: new THREE.Vector2(-9999, -9999) }, uAimDepth: { value: 0.5 },
  uFeetY: { value: 0 }, uCutOn: { value: 1 },
  uHeroW: { value: new THREE.Vector3(0, -999, 0) }, uAimW: { value: new THREE.Vector3(0, -999, 0) }, // targets in world space
};
/** aObj is stored as Int16: x and z at 1/50 u, top and reach at 1/500 u (dress.ts writes it with these scales) */
export const OBJ_SCALE = [50, 50, 500, 500] as const;
/** interleaved gradient noise in [0, 1): used by the building fade */
export const IGN = /* glsl */ `
#ifndef CUT_IGN
#define CUT_IGN
float cut_ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
#endif`;
const CUTGLSL = /* glsl */ `
float cut_ordered(vec2 frag) {                                   // Duckov's row-major matrix 1..16, as thresholds /16
  int x = int(mod(floor(frag.x), 4.0)), y = int(mod(floor(frag.y), 4.0)), i = y * 4 + x;
  float m[16] = float[16](1.,9.,3.,11., 13.,5.,15.,7., 4.,12.,2.,10., 16.,8.,14.,6.);
  return m[i] / 16.0;
}
// is this piece an occluder of target T: taller than T (the chest), between the camera and T on the ground plan
// (its reach may overhang T from just behind), within its reach + 0.9 u of the sight line, and up into the sight line
bool cut_occl(vec3 T) {
  if (T.y < -500.0) return false;
  if (vObj.w < 0.01) return true;                                // no piece data (review pages): treat as an occluder
  if (vObj.z < T.y + 0.1) return false;                          // lower than about 1.2 u: never cut
  vec2 c = cameraPosition.xz, ct = T.xz - c; float len = max(length(ct), 1e-3); vec2 dir = ct / len;
  float along = dot(vObj.xy - c, dir);
  if (along > len + vObj.w) return false;                        // behind the target
  float a = clamp(along, 0.0, len), lat = length(c + dir * a - vObj.xy);
  if (lat > vObj.w + 0.9) return false;                          // off to the side of the sight line
  float los = mix(cameraPosition.y, T.y, clamp(along + vObj.w, 0.0, len) / len); // sight-line height over the piece's edge nearest T
  return vObj.z > los - 0.6;
}`;
/** wrap an already-patched material's onBeforeCompile with the cutout */
export function withCutout<T extends THREE.Material>(m: T): T {
  const prev = m.onBeforeCompile.bind(m), key = m.customProgramCacheKey?.bind(m);
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r); Object.assign(sh.uniforms, CUT);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec4 aObj;\nvarying vec4 vObj;\nvarying vec3 vCutW;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n  vObj = aObj / vec4(${OBJ_SCALE.map((v) => v.toFixed(1)).join(", ")});\n  vCutW = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform vec2 uHeroPx; uniform float uHeroDepth; uniform vec2 uAimPx; uniform float uAimDepth; uniform float uFeetY; uniform float uCutOn; uniform vec3 uHeroW; uniform vec3 uAimW;\nvarying vec4 vObj;\nvarying vec3 vCutW;\n${IGN}\n${CUTGLSL}`)
      .replace("void main() {", `void main() {
  if (uCutOn > 0.5 && (cut_occl(uHeroW) || cut_occl(uAimW))) {
    float coverage = min(1.0, (1.0 - clamp((vCutW.y - (uFeetY + ${START_ABOVE_FEET.toFixed(2)})) / ${HEIGHT_FADE.toFixed(2)}, 0.0, 1.0)) * 1.00001);
    if (coverage < cut_ordered(gl_FragCoord.xy)) discard;
  }`);
  };
  m.customProgramCacheKey = () => (key ? key() : "") + "cut6";
  return m;
}
const v = new THREE.Vector3(), size = new THREE.Vector2();
/** call once per frame with the hero's chest position, the aim point and the hero's feet height */
export function updateCutout(cam: THREE.Camera, hero: THREE.Vector3, renderer: THREE.WebGLRenderer, aim?: THREE.Vector3, feetY = hero.y - 1.1) {
  renderer.getDrawingBufferSize(size);
  CUT.uHeroW.value.copy(hero);
  if (aim) CUT.uAimW.value.copy(aim).setY(aim.y + 1.0); else CUT.uAimW.value.set(0, -999, 0);
  v.copy(hero).project(cam);
  CUT.uHeroPx.value.set((v.x * 0.5 + 0.5) * size.x, (v.y * 0.5 + 0.5) * size.y); CUT.uHeroDepth.value = v.z * 0.5 + 0.5;
  if (aim) { v.copy(aim).setY(aim.y + 1.0).project(cam); CUT.uAimPx.value.set((v.x * 0.5 + 0.5) * size.x, (v.y * 0.5 + 0.5) * size.y); CUT.uAimDepth.value = v.z * 0.5 + 0.5; }
  else CUT.uAimPx.value.set(-9999, -9999);
  CUT.uFeetY.value = feetY;
}
