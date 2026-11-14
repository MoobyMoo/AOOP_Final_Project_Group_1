// Occlusion cutout for merged tall foliage (advisor G1 item 37; L3 council fix 2): instead of fading cloned
// per-object materials (ghosting, sort smear, 2,000+ draw calls), tall chunk meshes use one shader that
// dither-discards fragments inside a screen circle around the hero when they are nearer the camera than the hero.
// Opaque, depth-writing, no sorting. Driven by two uniforms updated once per frame.
import * as THREE from "three";

export const CUT = {
  uHeroPx: { value: new THREE.Vector2(-999, -999) }, // hero centre in framebuffer pixels
  uHeroR: { value: 150 },                            // radius in framebuffer pixels
  uHeroDepth: { value: 0.5 },                        // hero view depth (gl_FragCoord.z of the hero centre)
  uCutOn: { value: 1 },
};
const BAYER = /* glsl */ `
float bayer4(vec2 p) { ivec2 i = ivec2(mod(p, 4.0)); int k = i.x + i.y * 4;
  int b[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5); return (float(b[k]) + 0.5) / 16.0; }`;
/** wrap an already-patched material's onBeforeCompile with the cutout */
export function withCutout<T extends THREE.Material>(m: T): T {
  const prev = m.onBeforeCompile.bind(m), key = m.customProgramCacheKey?.bind(m);
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r); Object.assign(sh.uniforms, CUT);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform vec2 uHeroPx; uniform float uHeroR; uniform float uHeroDepth; uniform float uCutOn;\n${BAYER}`)
      .replace("void main() {", `void main() {
  if (uCutOn > 0.5 && gl_FragCoord.z < uHeroDepth - 0.0002) {
    float d = length(gl_FragCoord.xy - uHeroPx) / uHeroR;
    float keep = smoothstep(0.55, 1.0, d) * 0.85 + 0.15;
    if (bayer4(gl_FragCoord.xy) > keep) discard;
  }`);
  };
  m.customProgramCacheKey = () => (key ? key() : "") + "cut";
  return m;
}
const v = new THREE.Vector3();
/** call once per frame with the hero's chest position */
export function updateCutout(cam: THREE.Camera, hero: THREE.Vector3, renderer: THREE.WebGLRenderer) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  v.copy(hero).project(cam);
  CUT.uHeroPx.value.set((v.x * 0.5 + 0.5) * size.x, (v.y * 0.5 + 0.5) * size.y);
  CUT.uHeroDepth.value = v.z * 0.5 + 0.5;
  CUT.uHeroR.value = size.y * 0.16;
}
