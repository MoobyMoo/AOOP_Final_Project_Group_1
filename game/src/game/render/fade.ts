// Occlusion fade for building roofs and upper walls (Duckov OcclusionFadeObject/Trigger, our implementation):
// an ordered-dither discard driven by one uniform per building. Opaque and depth-writing like the hero cutout in
// cutout.ts (no sorting, no blending); the shadow pass is untouched, so a faded roof still shades its room.
import * as THREE from "three";

const BAYER = /* glsl */ `
float fd_bayer4(vec2 p) { ivec2 i = ivec2(mod(p, 4.0)); int k = i.x + i.y * 4;
  int b[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5); return (float(b[k]) + 0.5) / 16.0; }`;
/** a copy of an already-patched kit material that dither-fades with `fade` (0 = solid, 1 = gone) */
export function fadeMaterial<T extends THREE.Material>(base: T, fade: { value: number }): T {
  const m = base.clone() as T, prev = base.onBeforeCompile.bind(base), key = base.customProgramCacheKey?.bind(base);
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r); sh.uniforms.uFade = fade;
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform float uFade;\n${BAYER}`)
      .replace("void main() {", `void main() {\n  if (uFade > 0.004 && fd_bayer4(gl_FragCoord.xy) < uFade) discard;`);
  };
  m.customProgramCacheKey = () => (key ? key() : "") + "fade";
  return m;
}
