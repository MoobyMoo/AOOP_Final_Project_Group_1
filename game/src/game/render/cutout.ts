// See-through for tall chunks (foliage, wall stubs, cliffs) on Duckov's mechanism, rebuilt from the recovered masked
// shader (research/duckov-re/POLISH_FINDINGS.md section 10: SodaLit_Mask2 compiled instructions):
//  - opaque ORDERED 4x4 dither, 16 coverage levels: surviving pixels stay fully opaque and normally shaded, so it
//    reads as partial opacity at distance; no translucency, no silhouette pass; shadows are untouched
//  - a HEIGHT term: geometry below the player's feet + 0.25 is always kept, then coverage falls to 0 over 2 u
//    (fully gone at feet + 2.25). Low plants and props never vanish.
//  - only occluders of the hero or the aim point are affected. Duckov picks them per object with trigger volumes
//    along the camera ray; our tall chunks are merged, so the weight is per fragment: occluders nearer the camera than
//    the target and within SEL_IN..SEL_OUT world units of it on screen, with a soft falloff (no visible seam).
// The angular cone (thresholds 0.95/0.96, ~16-18 deg half-angle) spans our whole frame at this camera, so it is
// subsumed by the selection weight.
import * as THREE from "three";

/** Duckov serialized values: StartFadeHeight = playerY + 0.25, HeightFadeRange = 2 */
export const START_ABOVE_FEET = 0.25, HEIGHT_FADE = 2.0;
/** occluder selection round the hero / aim point, world units at the target's depth (ours: stands in for triggers) */
export const SEL_IN = 2.6, SEL_OUT = 4.2;
export const CUT = {
  uHeroPx: { value: new THREE.Vector2(-9999, -9999) }, uHeroDepth: { value: 0.5 },
  uAimPx: { value: new THREE.Vector2(-9999, -9999) }, uAimDepth: { value: 0.5 },
  uPxPerU: { value: 50 }, uFeetY: { value: 0 }, uCutOn: { value: 1 },
};
/** interleaved gradient noise in [0, 1): used by the building fade */
export const IGN = /* glsl */ `
#ifndef CUT_IGN
#define CUT_IGN
float cut_ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
#endif`;
/** Duckov's ordered matrix (row-major 1..16) as thresholds /16 */
const ORDERED = /* glsl */ `
float cut_ordered(vec2 frag) {
  int x = int(mod(floor(frag.x), 4.0)), y = int(mod(floor(frag.y), 4.0)), i = y * 4 + x;
  float m[16] = float[16](1.,9.,3.,11., 13.,5.,15.,7., 4.,12.,2.,10., 16.,8.,14.,6.);
  return m[i] / 16.0;
}
float cut_sel(vec2 frag, vec2 c, float depth) {
  if (gl_FragCoord.z >= depth - 0.0002) return 0.0;                     // behind the target: never cut
  float d = length(frag - c) / uPxPerU;                                  // world units at the target's depth
  return 1.0 - smoothstep(${SEL_IN.toFixed(2)}, ${SEL_OUT.toFixed(2)}, d);
}`;
/** wrap an already-patched material's onBeforeCompile with the cutout */
export function withCutout<T extends THREE.Material>(m: T): T {
  const prev = m.onBeforeCompile.bind(m), key = m.customProgramCacheKey?.bind(m);
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r); Object.assign(sh.uniforms, CUT);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vCutY;")
      .replace("#include <project_vertex>", `#include <project_vertex>
  { vec4 cw = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    cw = instanceMatrix * cw;
  #endif
    vCutY = (modelMatrix * cw).y; }`);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying float vCutY;\nuniform vec2 uHeroPx; uniform float uHeroDepth; uniform vec2 uAimPx; uniform float uAimDepth; uniform float uPxPerU; uniform float uFeetY; uniform float uCutOn;\n${IGN}\n${ORDERED}`)
      .replace("void main() {", `void main() {
  if (uCutOn > 0.5) {
    float sel = max(cut_sel(gl_FragCoord.xy, uHeroPx, uHeroDepth), cut_sel(gl_FragCoord.xy, uAimPx, uAimDepth));
    float heightKeep = 1.0 - clamp((vCutY - (uFeetY + ${START_ABOVE_FEET.toFixed(2)})) / ${HEIGHT_FADE.toFixed(2)}, 0.0, 1.0);
    float coverage = min(1.0, mix(1.0, heightKeep, sel) * 1.00001);
    if (coverage < cut_ordered(gl_FragCoord.xy)) discard;
  }`);
  };
  m.customProgramCacheKey = () => (key ? key() : "") + "cut4";
  return m;
}
const v = new THREE.Vector3(), size = new THREE.Vector2(), camPos = new THREE.Vector3();
/** call once per frame with the hero's chest position, his feet height and the aim point (omit aim: hero only) */
export function updateCutout(cam: THREE.Camera, hero: THREE.Vector3, renderer: THREE.WebGLRenderer, aim?: THREE.Vector3, feetY = hero.y - 1.1) {
  renderer.getDrawingBufferSize(size);
  v.copy(hero).project(cam);
  CUT.uHeroPx.value.set((v.x * 0.5 + 0.5) * size.x, (v.y * 0.5 + 0.5) * size.y); CUT.uHeroDepth.value = v.z * 0.5 + 0.5;
  if (aim) { v.copy(aim).setY(aim.y + 1.0).project(cam); CUT.uAimPx.value.set((v.x * 0.5 + 0.5) * size.x, (v.y * 0.5 + 0.5) * size.y); CUT.uAimDepth.value = v.z * 0.5 + 0.5; }
  else CUT.uAimPx.value.set(-9999, -9999);
  const pc = cam as THREE.PerspectiveCamera, dist = camPos.setFromMatrixPosition(cam.matrixWorld).distanceTo(hero);
  CUT.uPxPerU.value = size.y / (2 * dist * Math.tan(THREE.MathUtils.degToRad((pc.fov ?? 24) / 2)));
  CUT.uFeetY.value = feetY;
}
