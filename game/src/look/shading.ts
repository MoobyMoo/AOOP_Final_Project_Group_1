// Shared shading for the look target (research/look/FINDINGS.md "must-have" list):
// - a shadow-free rim light from one screen direction (pops rounded shapes off the ground, like an edge light)
// - a slowly scrolling canopy light cookie on direct sunlight (dappled jungle light)
// - grass wind + player push in the vertex shader
import * as THREE from "three";

/** "toon" (default): the Shorts' cartoon look, flat bands + brown ink on everything. "soft": the round-3 council version */
export const STYLE = new URLSearchParams(location.search).get("style") ?? "bright"; // bright (Moo's pick 2026-11-15) | toon | soft
export const TOON = STYLE === "toon";
export const BRIGHT = STYLE !== "soft";
export const INK = "#2a1a12";
const toonGrad = (() => { const d = new Uint8Array([120, 120, 200, 255, 255]); const t = new THREE.DataTexture(d, 5, 1, THREE.RedFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; })();
type AnyMat = THREE.MeshStandardMaterial | THREE.MeshToonMaterial;
/** a lit surface material in the active style (toon or standard), same parameters either way */
export function surf(p: THREE.MeshStandardMaterialParameters): AnyMat {
  if (!TOON) return new THREE.MeshStandardMaterial(p);
  const { roughness, metalness, ...rest } = p; void roughness; void metalness;
  return new THREE.MeshToonMaterial({ ...(rest as THREE.MeshToonMaterialParameters), gradientMap: toonGrad });
}
export const U = {
  uTime: { value: 0 },
  uRimDir: { value: new THREE.Vector3(-0.6, 0.7, 0.3).normalize() }, // view space, updated per frame
  uRimColor: { value: new THREE.Color("#ffe7b0") },
  uPlayer: { value: new THREE.Vector3() },
};

const NOISE = /* glsl */ `
float lt_hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float lt_noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(lt_hash(i), lt_hash(i + vec2(1, 0)), u.x), mix(lt_hash(i + vec2(0, 1)), lt_hash(i + vec2(1, 1)), u.x), u.y); }
float lt_fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * lt_noise(p); p *= 2.03; a *= 0.5; } return v; }
`;

type PatchOpts = { rim?: number; cookie?: boolean; grass?: boolean; water?: boolean };
/** add rim light, canopy cookie, and optional grass wind / water sparkle to a standard material */
export function patch<T extends THREE.Material>(mat: T, o: PatchOpts = {}): T {
  const rim = (o.rim ?? 0.5) * (TOON ? 0.45 : 1), cookie = o.cookie ?? true;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, { uRim: { value: rim }, uCookieOn: { value: cookie ? 1 : 0 } });
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vWPos;\nuniform float uTime;\nuniform vec3 uPlayer;`)
      .replace("#include <project_vertex>", `#include <project_vertex>
  { vec4 wp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    wp = instanceMatrix * wp;
  #endif
    vWPos = (modelMatrix * wp).xyz; }`);
    if (o.grass) {
      sh.vertexShader = sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
  { vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
    float h = clamp(position.y / 0.9, 0.0, 1.0); h *= h;
    float w = sin(uTime * 1.7 + ip.x * 0.31 + ip.z * 0.23) * 0.13 + sin(uTime * 3.3 + ip.x * 1.7) * 0.04;
    vec2 away = ip.xz - uPlayer.xz; float d = length(away);
    vec2 push = d > 0.001 ? normalize(away) * smoothstep(1.5, 0.2, d) * 0.55 : vec2(0.0);
    transformed.x += (w * 0.8 + push.x) * h; transformed.z += (w * 0.5 + push.y) * h; transformed.y -= length(push) * h * 0.35; }`);
    }
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vWPos;\nuniform float uTime;\nuniform vec3 uRimDir;\nuniform vec3 uRimColor;\nuniform float uRim;\nuniform float uCookieOn;\n${NOISE}`)
      .replace("#include <opaque_fragment>", `
  { float ck = 1.0;
    if (uCookieOn > 0.5) { float n = lt_fbm(vWPos.xz * 0.05 + vec2(uTime * 0.012, uTime * 0.008)); ck = mix(0.35, 1.15, smoothstep(0.4, 0.6, n)); }
    outgoingLight = (reflectedLight.directDiffuse + reflectedLight.directSpecular) * ck + reflectedLight.indirectDiffuse + reflectedLight.indirectSpecular + totalEmissiveRadiance;
    vec3 vdir = normalize(vViewPosition);
    float rimF = pow(1.0 - clamp(dot(normal, vdir), 0.0, 1.0), 3.0) * clamp(dot(normal, uRimDir) * 0.8 + 0.2, 0.0, 1.0);
    outgoingLight += uRimColor * rimF * uRim * ck;
    ${o.water ? `float sp = lt_noise(vWPos.xz * 9.0 + vec2(uTime * 0.9, -uTime * 0.6)) * lt_noise(vWPos.xz * 13.0 - vec2(uTime * 0.7, uTime * 0.5));
    outgoingLight += vec3(1.6, 1.5, 1.2) * smoothstep(0.74, 0.86, sp) * 1.5;` : ""} }
#include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => `lt${rim}${cookie}${o.grass ? "g" : ""}${o.water ? "w" : ""}`;
  return mat;
}

const cache = new Map<string, AnyMat>();
/** matte stylized material (mid-high roughness, no texture noise), optionally faceted */
export function mat(color: string, o: { flat?: boolean; rough?: number; rim?: number; cookie?: boolean; emissive?: string; ei?: number; vc?: boolean } = {}) {
  const key = JSON.stringify([color, o]);
  let m = cache.get(key);
  if (!m) {
    m = patch(surf({ color, roughness: o.rough ?? 0.85, metalness: 0, flatShading: !!o.flat && !TOON, vertexColors: !!o.vc, emissive: o.emissive ?? "#000000", emissiveIntensity: o.ei ?? 1 }), { rim: o.rim, cookie: o.cookie });
    cache.set(key, m);
  }
  return m;
}

// ---------- ink: a screen-space constant-width outline shell behind every solid mesh (the Shorts' brown line) ----------
export const inkU = { uInkPx: { value: 2.2 }, uRes: { value: new THREE.Vector2(1280, 720) } };
const inkMat = (() => {
  const m = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, inkU);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uInkPx;\nuniform vec2 uRes;")
      .replace("#include <project_vertex>", `#include <project_vertex>
  { vec3 nv = normalize(normalMatrix * objectNormal);
    vec2 dir = normalize((projectionMatrix * vec4(nv, 0.0)).xy + 1e-5);
    gl_Position.xy += dir * uInkPx * 2.0 / uRes * gl_Position.w; }`);
  };
  m.customProgramCacheKey = () => "ink";
  return m;
})();
/** add an ink shell to every solid, single-sided mesh under root (skips instanced, transparent, unlit and huge meshes) */
export function inkAll(root: THREE.Object3D, skip: (m: THREE.Mesh) => boolean = () => false) {
  const list: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || m.name === "ink" || skip(m)) return;
    const mm = m.material as THREE.Material;
    if (Array.isArray(m.material) ? false : (mm.transparent || mm.side === THREE.DoubleSide || (mm as THREE.MeshBasicMaterial).isMeshBasicMaterial)) return;
    list.push(m);
  });
  for (const m of list) { const h = new THREE.Mesh(m.geometry, inkMat); h.name = "ink"; h.castShadow = false; h.receiveShadow = false; m.add(h); }
  return list.length;
}
