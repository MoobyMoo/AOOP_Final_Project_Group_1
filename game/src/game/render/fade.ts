// Occlusion fade for building roofs and upper walls (Duckov OcclusionFadeObject/Trigger, our implementation):
// a dither discard driven by one uniform per building. Opaque and depth-writing like the hero cutout in
// cutout.ts (no sorting, no blending); the shadow pass is untouched, so a faded roof still shades its room.
// The dither is interleaved gradient noise, not a 4x4 Bayer matrix: a frame caught mid-fade reads as grain, never as
// a checkerboard (G1 council fix 3). buildings.ts runs the fade end to end in FADE_T and it never rests in between.
import * as THREE from "three";
import { IGN } from "./cutout";

/** seconds for a roof or wall to go from solid to gone (and back) */
export const FADE_T = 0.12;
/** move a fade uniform toward 0 or 1 at a constant rate; it lands exactly on the end value */
export function stepFade(fade: { value: number }, to: number, dt: number) {
  const d = to - fade.value; if (d === 0) return;
  const s = dt / FADE_T; fade.value = Math.abs(d) <= s ? to : fade.value + Math.sign(d) * s;
}
/** a copy of an already-patched kit material that dither-fades with `fade` (0 = solid, 1 = gone) */
export function fadeMaterial<T extends THREE.Material>(base: T, fade: { value: number }): T {
  const m = base.clone() as T, prev = base.onBeforeCompile.bind(base), key = base.customProgramCacheKey?.bind(base);
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r); sh.uniforms.uFade = fade;
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform float uFade;\n${IGN}`)
      .replace("void main() {", `void main() {\n  if (uFade > 0.004 && cut_ign(gl_FragCoord.xy) < uFade) discard;`);
  };
  m.customProgramCacheKey = () => (key ? key() : "") + "fade2";
  return m;
}
