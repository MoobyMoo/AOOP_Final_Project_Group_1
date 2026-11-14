// The Kingpin .45: the Businessman's sidearm (fictional; no real make or model). Code-built, three draw calls.
// Chunky two-tone pistol: dark gunmetal slide, lighter frame, ivory grips with a gold banana, gold trigger guard,
// pinstripe and sights. Grip at the origin, barrel along +z, ejection port on +x (the handR side, away from the body).
// GunView.pose() is a pure function of {fireT, reloadT}; GunFx is pooled (no allocation after createGunFx).
// FX sources: research/look/FINDINGS.md VFX row (punchy flash, ejected brass, bright tracers, directional impact
// bursts) and research/duckov-re/CODE_FINDINGS.md 2.5 (flash-class feedback fades in 56-125 ms).
import * as THREE from "three";
import { mergeGeometries, toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { GunView, GunFx } from "../contracts";
import { patch, surf } from "../render/shading";

// ------------------------------------------------------------------------------------------------ palette
const GUNMETAL = "#2c303d", FRAME = "#525a70", DARK = "#15161c", STEEL = "#b9c0cc", GOLD = "#f5b72e", IVORY = "#f6ead0";
const BANANA = "#ffd83d", BRASS = "#f0b548", RIB = "#454b5e";

// ------------------------------------------------------------------------------------------------ geometry helpers
type P = [z: number, y: number, r?: number];
/** closed side profile in the (z, y) plane with rounded corners */
function outline(pts: P[]): THREE.Shape {
  const n = pts.length, sh = new THREE.Shape(), a: number[][] = [], b: number[][] = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    const l0 = Math.hypot(p0[0] - p1[0], p0[1] - p1[1]), l2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), r = Math.min(p1[2] ?? 0, l0 * 0.45, l2 * 0.45);
    a.push([p1[0] + (p0[0] - p1[0]) / l0 * r, p1[1] + (p0[1] - p1[1]) / l0 * r]);
    b.push([p1[0] + (p2[0] - p1[0]) / l2 * r, p1[1] + (p2[1] - p1[1]) / l2 * r]);
  }
  sh.moveTo(b[0][0], b[0][1]);
  for (let k = 1; k <= n; k++) { const i = k % n; sh.lineTo(a[i][0], a[i][1]); if ((pts[i][2] ?? 0) > 0) sh.quadraticCurveTo(pts[i][0], pts[i][1], b[i][0], b[i][1]); }
  return sh;
}
/** paint a geometry one colour (vertex colours), non-indexed, no uv, so every part merges into one buffer */
function tint(g: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  const gg = g.index ? g.toNonIndexed() : g; gg.deleteAttribute("uv");
  const c = new THREE.Color(hex), n = gg.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  gg.setAttribute("color", new THREE.BufferAttribute(arr, 3)); return gg;
}
/** a profile extruded across x (centred), with chamfered edges; `holes` cut through */
function slab(hex: string, pts: P[], width: number, bevel: number, holes: P[][] = [], crease = 0.36): THREE.BufferGeometry {
  const sh = outline(pts); for (const h of holes) sh.holes.push(outline(h));
  const depth = width - bevel * 2;
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 2, curveSegments: 5 });
  g.translate(0, 0, -depth / 2); g.rotateY(-Math.PI / 2); // shape x -> +z, extrusion -> x
  return tint(toCreasedNormals(g, crease), hex);
}
function box(hex: string, w: number, h: number, d: number, x: number, y: number, z: number, rx = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); g.translate(x, y, z); return tint(g, hex);
}
/** cylinder along z (or along x with `across`) */
function rod(hex: string, r: number, len: number, x: number, y: number, z: number, seg = 12, across = false): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, len, seg); if (across) g.rotateZ(Math.PI / 2); else g.rotateX(Math.PI / 2);
  g.translate(x, y, z); return tint(g, hex);
}
const merged = (parts: THREE.BufferGeometry[]) => { const g = mergeGeometries(parts, false)!; for (const p of parts) p.dispose(); g.computeBoundingSphere(); return g; };

// ------------------------------------------------------------------------------------------------ the model
const SLIDE_W = 0.19, FRAME_W = 0.16;
const RAKE = 0.1529;                                   // grip rake: z change per unit y
const MAG_AXIS = new THREE.Vector3(0, -1, -RAKE).normalize(); // the way a magazine leaves the grip

function slideGeo() {
  const g: THREE.BufferGeometry[] = [];
  g.push(slab(GUNMETAL, [[-0.285, 0.215, 0.012], [-0.295, 0.415, 0.045], [0.622, 0.415, 0.025], [0.665, 0.385, 0.015], [0.665, 0.235, 0.02], [0.645, 0.215]], SLIDE_W, 0.026));
  for (let i = 0; i < 6; i++) g.push(box(RIB, SLIDE_W + 0.014, 0.125, 0.013, 0, 0.317, -0.245 + i * 0.03, 0.2));  // rear cocking ribs
  g.push(box(GOLD, SLIDE_W + 0.008, 0.015, 0.5, 0, 0.257, 0.33));                                                // the pinstripe, both sides
  g.push(box(GOLD, 0.026, 0.01, 0.69, 0, 0.4165, 0.175));                                                        // and one down the spine: what the game camera sees
  g.push(box(DARK, 0.077, 0.087, 0.21, 0.0585, 0.3735, 0.175));                                                  // ejection port
  g.push(box("#98a1b2", 0.0695, 0.0815, 0.15, 0.06475, 0.37875, 0.19));                                              // polished chamber in the port
  g.push(box(DARK, 0.135, 0.036, 0.055, 0, 0.431, -0.225));                                                      // rear sight
  g.push(box(IVORY, 0.03, 0.012, 0.012, -0.04, 0.444, -0.252), box(IVORY, 0.03, 0.012, 0.012, 0.04, 0.444, -0.252));
  g.push(box(GOLD, 0.036, 0.04, 0.06, 0, 0.433, 0.578));                                                         // front sight
  g.push(rod(GOLD, 0.058, 0.024, 0, 0.315, 0.668, 14));                                                          // muzzle bushing
  return merged(g);
}
function frameGeo() {
  const g: THREE.BufferGeometry[] = [];
  g.push(slab(FRAME, [[-0.265, 0.218], [0.575, 0.218, 0.01], [0.575, 0.125, 0.035], [0.15, 0.125, 0.03], [0.085, -0.3, 0.025], [-0.215, -0.3, 0.035], [-0.15, 0.07, 0.06], [-0.325, 0.15, 0.02], [-0.315, 0.205, 0.02]], FRAME_W, 0.02));
  g.push(slab(IVORY, [[0.095, 0.04, 0.03], [0.05, -0.255, 0.03], [-0.185, -0.255, 0.03], [-0.135, 0.04, 0.03]], FRAME_W + 0.034, 0.015, [], 0.5)); // grip panels, both sides (softer shading: pillowed)
  // the gold banana set into each grip panel
  const ban: P[] = [], cz = -0.045, cy = -0.02, R = 0.105, a0 = 3.6, a1 = 5.82, tilt = -0.3, N = 10;
  const put = (ang: number, rad: number) => { const x = Math.cos(ang) * rad, y = Math.sin(ang) * rad; ban.push([cz + x * Math.cos(tilt) - y * Math.sin(tilt), cy + x * Math.sin(tilt) + y * Math.cos(tilt)]); };
  for (let i = 0; i <= N; i++) put(a0 + (a1 - a0) * i / N, R);
  put(a1 + 0.14, R - 0.004); put(a1 + 0.14, R - 0.018);                                                          // the stem
  for (let i = N; i >= 0; i--) { const t = i / N; put(a0 + (a1 - a0) * t, R - 0.015 - 0.03 * Math.pow(Math.sin(Math.PI * t), 0.4)); }
  g.push(slab(GOLD, ban, FRAME_W + 0.05, 0.005, [], 0.9));
  g.push(slab(GOLD, [[0.12, 0.14], [0.44, 0.14, 0.02], [0.44, -0.09, 0.085], [0.095, -0.09, 0.02]], 0.08, 0.015,
    [[[0.155, 0.1, 0.02], [0.39, 0.1, 0.03], [0.39, -0.045, 0.06], [0.13, -0.045, 0.02]]]));                      // trigger guard
  g.push(slab(DARK, [[0.27, 0.115], [0.305, 0.115], [0.277, 0.0, 0.012], [0.239, -0.022, 0.012], [0.253, 0.03, 0.02]], 0.038, 0.006)); // trigger
  g.push(slab(GOLD, [[-0.272, 0.2], [-0.356, 0.27, 0.02], [-0.348, 0.35, 0.025], [-0.296, 0.34, 0.015], [-0.292, 0.24, 0.01]], 0.06, 0.009)); // hammer, cocked
  g.push(rod(STEEL, 0.042, 0.55, 0, 0.315, 0.425, 12));                                                          // barrel (stays put when the slide runs back)
  const bore = new THREE.CircleGeometry(0.024, 12); bore.translate(0, 0.315, 0.7008); g.push(tint(bore, DARK));
  g.push(rod(DARK, 0.02, 0.2, 0, 0.247, 0.574, 8));                                                              // recoil rod
  g.push(box(DARK, FRAME_W + 0.014, 0.026, 0.115, 0, 0.186, 0.21));                                              // slide stop
  g.push(box(GOLD, FRAME_W + 0.014, 0.03, 0.06, 0, 0.186, -0.19));                                               // safety
  g.push(rod(GOLD, 0.018, FRAME_W + 0.018, 0, 0.078, 0.147, 10, true));                                          // magazine button
  g.push(box(DARK, 0.104, 0.006, 0.22, 0, -0.2985, -0.065));                                                     // the magazine well, seen when the mag is out
  return merged(g);
}
function magGeo(ext: boolean) {
  const g: THREE.BufferGeometry[] = [], bottom = ext ? -0.462 : -0.296, dz = (bottom + 0.296) * RAKE;
  g.push(slab(STEEL, [[0.105, 0.1], [0.045 + dz, bottom], [-0.175 + dz, bottom], [-0.115, 0.1]], 0.105, 0.008));
  g.push(rod(BRASS, 0.028, 0.125, 0, 0.108, -0.005, 8));                                                         // the top round
  if (!ext) g.push(slab(GUNMETAL, [[0.1, -0.297, 0.01], [0.09, -0.35, 0.022], [-0.235, -0.35, 0.022], [-0.225, -0.297, 0.01]], 0.168, 0.012));
  else {
    for (const y of [-0.335, -0.375, -0.415]) g.push(box(DARK, 0.109, 0.02, 0.028, 0, y, -0.125 + (y + 0.296) * RAKE)); // witness holes
    g.push(slab(BANANA, [[0.075, -0.455, 0.012], [0.062, -0.535, 0.03], [-0.265, -0.535, 0.03], [-0.252, -0.455, 0.012]], 0.185, 0.017));
  }
  return merged(g);
}

/** vertex-coloured gun material in the shared look (rim light + canopy cookie from patch()), plus a little self-fill
 *  so the gold and ivory stay warm when the sun is behind the gun (the monkeys do the same with emissive).
 *  Fading parts (the dropped magazine, old brass) dissolve with a screen-door dither, so they stay opaque: no sorting,
 *  no blending state, same program for every gun. "uniform": one fade per material; "attr": one per instance. */
function gunMat(rough: number, fade: "none" | "uniform" | "attr" = "none") {
  const m = patch(surf({ color: "#ffffff", vertexColors: true, roughness: rough, metalness: 0 }), { rim: 0.9 });
  const base = m.onBeforeCompile, key = m.customProgramCacheKey, uFade = { value: 1 };
  m.userData.uFade = uFade;
  m.onBeforeCompile = (sh, r) => {
    base.call(m, sh, r);
    sh.fragmentShader = sh.fragmentShader.replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * 0.2;");
    if (fade === "none") return;
    const DITHER = "\n  if (kpFade < 0.999 && kpFade < fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))))) discard;";
    if (fade === "attr") {
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float iFade;\nvarying float kpFade;").replace("#include <begin_vertex>", "#include <begin_vertex>\n  kpFade = iFade;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying float kpFade;");
    } else { sh.uniforms.kpFade = uFade; sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform float kpFade;"); }
    sh.fragmentShader = sh.fragmentShader.replace("#include <color_fragment>", "#include <color_fragment>" + DITHER);
  };
  m.customProgramCacheKey = () => key.call(m) + "|kp-" + fade;
  return m;
}
let bodyMat: THREE.Material | null = null, GEO: { slide: THREE.BufferGeometry; frame: THREE.BufferGeometry; mag: THREE.BufferGeometry; magExt: THREE.BufferGeometry } | null = null;

const sstep = (x: number) => { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); };
const seg = (t: number, a: number, b: number) => { const x = (t - a) / (b - a); return x < 0 ? 0 : x > 1 ? 1 : x; };
const SLIDE_TRAVEL = 0.12, _q = new THREE.Quaternion(), _down = new THREE.Vector3();

export function createKingpin(): GunView {
  GEO ??= { slide: slideGeo(), frame: frameGeo(), mag: magGeo(false), magExt: magGeo(true) };
  bodyMat ??= gunMat(0.4);
  const root = new THREE.Group(); root.name = "kingpin45";
  const body = new THREE.Group(); root.add(body);            // recoil + reload motion live here, never on root
  const mk = (g: THREE.BufferGeometry, m: THREE.Material) => { const o = new THREE.Mesh(g, m); o.castShadow = true; o.receiveShadow = true; body.add(o); return o; };
  const frame = mk(GEO.frame, bodyMat), slide = mk(GEO.slide, bodyMat);
  const magMat = gunMat(0.4, "uniform"), magFade = magMat.userData.uFade as { value: number }; // per gun: the dropped magazine dissolves
  const mag = mk(GEO.mag, magMat);
  void frame;
  const muzzle = new THREE.Object3D(); muzzle.name = "muzzle"; muzzle.position.set(0, 0.315, 0.74); body.add(muzzle);
  const eject = new THREE.Object3D(); eject.name = "eject"; eject.position.set(0.115, 0.4, 0.17); body.add(eject);
  return {
    root, muzzle, eject,
    setVariant(v) { mag.geometry = v.extMag ? GEO!.magExt : GEO!.mag; },
    pose(s) {
      const f = s.fireT, r = s.reloadT;
      let back = 0, tilt = 0, kick = 0, cant = 0, lift = 0, magOut = 0, fall = 0, alpha = 1, side = 0;
      if (f >= 0 && f < 1) {
        // slide: fully back on the shot frame, home again by 35% of the interval
        back = f < 0.06 ? 1 : 1 - sstep(seg(f, 0.06, 0.35));
        // muzzle climb: peaks ~11 ms in, settles by ~120 ms (55% of 0.22 s) with a small dip on the way back
        const u = seg(f, 0.05, 0.55), k = f < 0.05 ? 0.7 + 0.3 * (f / 0.05) : (1 - u) * (1 - u) * Math.cos(u * 3.77);
        tilt = k * 0.115; kick = k * 0.04;
      }
      if (r >= 0 && r <= 1) {
        cant = sstep(seg(r, 0, 0.1)) * (1 - sstep(seg(r, 0.7, 0.8)));       // tip the gun to show the magazine well
        if (r < 0.1) { magOut = 0; }
        else if (r < 0.45) {                                               // old magazine: slides out, falls away, fades
          magOut = 0.36 * sstep(seg(r, 0.1, 0.2)); const u = seg(r, 0.14, 0.42); fall = u * u * 0.6; // stays above the ground from hand height
          alpha = 1 - sstep(seg(r, 0.26, 0.42));
        } else {                                                           // new magazine: rises into the grip and seats
          const u = 1 - seg(r, 0.45, 0.68); magOut = 0.62 * u * u * u + 0.1 * u; side = -0.12 * u * u;
          alpha = sstep(seg(r, 0.45, 0.5));
        }
        lift = Math.sin(Math.PI * seg(r, 0.66, 0.76)) * 0.035;             // the seat bump
        const rack = sstep(seg(r, 0.8, 0.86)) * (1 - sstep(seg(r, 0.9, 0.95)));
        back = Math.max(back, rack); tilt += rack * 0.07; kick += rack * 0.025;
      }
      slide.position.z = -SLIDE_TRAVEL * back;
      body.rotation.set(-tilt - cant * 0.42, 0, -cant * 0.5);
      body.position.set(0, kick * 0.35 + lift, -kick);
      mag.position.copy(MAG_AXIS).multiplyScalar(magOut); mag.position.x += side;
      if (fall > 0) { // fall along world down, whatever way the hand holds the gun
        body.getWorldQuaternion(_q).invert(); _down.set(0, -1, 0).applyQuaternion(_q);
        mag.position.addScaledVector(_down, fall); mag.rotation.set(fall * 1.3, 0, fall * 0.7);
      } else mag.rotation.set(0, 0, 0);
      magFade.value = alpha; mag.visible = alpha > 0.01; mag.castShadow = alpha > 0.5;
    },
  };
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
