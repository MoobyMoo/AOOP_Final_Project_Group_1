// Occlusion cutout for merged tall foliage, wall stubs and cliffs, on Duckov's mechanism (decompiled
// OcclusionFadeManager / OcclusionFadeObject; serialized viewRange 4.0, viewFadeRange 1.0). Occluders between the
// camera and a point of interest get a hole cut along the view ray: a solid core of VIEW_R world units with a soft,
// blotchy noise dissolve over VIEW_FADE more. There are two holes, one round the hero and one round the aim point,
// so you see where you shoot through trees and walls. Ours is one opaque, depth-writing shader on the tall chunk
// meshes (no material swaps, no sorting), driven by uniforms set once per frame. Only fragments nearer the camera
// than the point of interest are cut, so nothing behind the hero or the cursor ever opens.
import * as THREE from "three";

/** hole radius and dissolve width in world units at the target's depth (Duckov: viewRange 4, viewFadeRange 1) */
export const VIEW_R = Number(new URLSearchParams(location.search).get("cutr") ?? 4.0), VIEW_FADE = 1.0;
export const CUT = {
  uHeroPx: { value: new THREE.Vector2(-9999, -9999) }, uHeroDepth: { value: 0.5 },
  uAimPx: { value: new THREE.Vector2(-9999, -9999) }, uAimDepth: { value: 0.5 },
  uCutR: { value: 100 }, uCutFade: { value: 30 },   // framebuffer pixels (from world units at the camera distance)
  uCutOn: { value: 1 },
};
/** interleaved gradient noise in [0, 1): shared by the cutout and the building fade */
export const IGN = /* glsl */ `
#ifndef CUT_IGN
#define CUT_IGN
float cut_ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
#endif`;
/** blotchy value noise for the dissolve edge (Duckov samples a noise texture; this is its procedural stand-in) */
const BLOT = /* glsl */ `
float cut_h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float cut_vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(cut_h(i), cut_h(i + vec2(1, 0)), f.x), mix(cut_h(i + vec2(0, 1)), cut_h(i + vec2(1, 1)), f.x), f.y); }
float cut_keep(vec2 frag, vec2 c, float depth, float r, float fade) {
  if (gl_FragCoord.z >= depth - 0.0002) return 1.0;            // behind the target: never cut
  float k = (length(frag - c) - r) / fade;                       // < 0 inside the core, 0..1 across the dissolve
  float n = 0.62 * cut_vn(frag / 14.0) + 0.38 * cut_vn(frag / 5.0);
  return k - (n - 0.5) * 0.9;                                     // blotchy edge; discard when < noise threshold
}`;
/** wrap an already-patched material's onBeforeCompile with the cutout */
export function withCutout<T extends THREE.Material>(m: T): T {
  const prev = m.onBeforeCompile.bind(m), key = m.customProgramCacheKey?.bind(m);
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r); Object.assign(sh.uniforms, CUT);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform vec2 uHeroPx; uniform float uHeroDepth; uniform vec2 uAimPx; uniform float uAimDepth; uniform float uCutR; uniform float uCutFade; uniform float uCutOn;\n${IGN}\n${BLOT}`)
      .replace("void main() {", `void main() {
  if (uCutOn > 0.5) {
    float keep = min(cut_keep(gl_FragCoord.xy, uHeroPx, uHeroDepth, uCutR, uCutFade), cut_keep(gl_FragCoord.xy, uAimPx, uAimDepth, uCutR * 0.8, uCutFade));
    if (keep < cut_ign(gl_FragCoord.xy) * 0.35) discard;
  }`);
  };
  m.customProgramCacheKey = () => (key ? key() : "") + "cut3";
  return m;
}
const v = new THREE.Vector3(), size = new THREE.Vector2(), camPos = new THREE.Vector3();
/** call once per frame with the hero's chest position and the aim point (omit aim to cut round the hero only) */
export function updateCutout(cam: THREE.Camera, hero: THREE.Vector3, renderer: THREE.WebGLRenderer, aim?: THREE.Vector3) {
  renderer.getDrawingBufferSize(size);
  v.copy(hero).project(cam);
  CUT.uHeroPx.value.set((v.x * 0.5 + 0.5) * size.x, (v.y * 0.5 + 0.5) * size.y); CUT.uHeroDepth.value = v.z * 0.5 + 0.5;
  if (aim) { v.copy(aim).setY(aim.y + 1.0).project(cam); CUT.uAimPx.value.set((v.x * 0.5 + 0.5) * size.x, (v.y * 0.5 + 0.5) * size.y); CUT.uAimDepth.value = v.z * 0.5 + 0.5; }
  else CUT.uAimPx.value.set(-9999, -9999);
  // world units -> framebuffer pixels at the hero's distance (perspective camera)
  const pc = cam as THREE.PerspectiveCamera, dist = camPos.setFromMatrixPosition(cam.matrixWorld).distanceTo(hero);
  const pxPerU = size.y / (2 * dist * Math.tan(THREE.MathUtils.degToRad((pc.fov ?? 24) / 2)));
  CUT.uCutR.value = VIEW_R * pxPerU; CUT.uCutFade.value = VIEW_FADE * pxPerU;
}
