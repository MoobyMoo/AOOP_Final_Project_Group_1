// The nature kit: jungle, beach, mangrove, cave and waterfall pieces modelled by script in Blender
// (tools/blender/nature/, GLB packs in public/models/nature/). Vertex colours carry albedo + baked AO; no textures.
// preloadNature() loads the packs once; NATURE_KIT has the same shape as PLACEHOLDER_KIT; NATURE has every piece type.
// Sizes: a builder's `size` scales the authored piece (size 1 = the sizes the placeholder kit used, see SCALE).
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { KitPiece, MatId } from "../contracts";
import type { Builder, KitSource } from "./dress";
import { kitMaterial } from "./kitutil";
import { U } from "../render/shading";
import { withCutout } from "../render/cutout";

const PACKS = ["trees", "plants", "rocks", "cave", "giant", "waterfall"] as const;
type Part = { mat: MatId; geo: THREE.BufferGeometry };
/** type -> variant -> parts (one geometry per material class) */
const LIB = new Map<string, Part[][]>();
let loading: Promise<void> | null = null;

/** GLB primitive -> the kit layout: non-indexed, Float32 position + normal + rgb colour (what kitutil merges) */
function kitGeo(src: THREE.BufferGeometry, keepUv = false): THREE.BufferGeometry {
  const idx = src.index, pos = src.getAttribute("position"), nor = src.getAttribute("normal"), col = src.getAttribute("color"), uv = src.getAttribute("uv");
  const n = idx ? idx.count : pos.count, P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3), T = keepUv && uv ? new Float32Array(n * 2) : null;
  for (let i = 0; i < n; i++) {
    const k = idx ? idx.getX(i) : i, j = i * 3;
    P[j] = pos.getX(k); P[j + 1] = pos.getY(k); P[j + 2] = pos.getZ(k);
    const nx = nor.getX(k), ny = nor.getY(k), nz = nor.getZ(k), l = Math.hypot(nx, ny, nz) || 1;
    N[j] = nx / l; N[j + 1] = ny / l; N[j + 2] = nz / l;
    C[j] = col.getX(k); C[j + 1] = col.getY(k); C[j + 2] = col.getZ(k);
    if (T) { T[i * 2] = uv.getX(k); T[i * 2 + 1] = uv.getY(k); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(P, 3)); g.setAttribute("normal", new THREE.BufferAttribute(N, 3)); g.setAttribute("color", new THREE.BufferAttribute(C, 3));
  if (T) g.setAttribute("uv", new THREE.BufferAttribute(T, 2));
  return g;
}

/** load the GLB packs (once). Await this before building the world. */
export function preloadNature(base = `${import.meta.env.BASE_URL}models/nature/`): Promise<void> {
  loading ??= (async () => {
    const loader = new GLTFLoader();
    const files = await Promise.all(PACKS.map((p) => loader.loadAsync(`${base}${p}.glb`)));
    for (const f of files) f.scene.traverse((o) => {
      const m = o as THREE.Mesh; if (!m.isMesh) return;
      const ex = m.userData as { type?: string; variant?: number; mat?: MatId; uv?: number };
      const [name, mat] = m.name.split("__"), cut = name.lastIndexOf("_");
      const type = ex.type ?? name.slice(0, cut), variant = ex.variant ?? Number(name.slice(cut + 1));
      const vs = LIB.get(type) ?? LIB.set(type, []).get(type)!;
      (vs[variant] ??= []).push({ mat: ex.mat ?? (mat as MatId), geo: kitGeo(m.geometry, !!ex.uv) });
      m.geometry.dispose();
    });
  })();
  return loading;
}
export const natureReady = () => LIB.size > 0;
/** piece types and their variant counts (for the review page) */
export const natureTypes = () => [...LIB].map(([type, v]) => ({ type, variants: v.length }));

type Meta = { r: number; move?: boolean; shot?: boolean; tall?: boolean; tint?: number; squash?: number };
/** collision + variation per piece type. r = footprint radius at scale 1. tint = per-instance colour jitter on foliage. */
const META: Record<string, Meta> = {
  palm: { r: 0.3, move: true, shot: true, tall: true, tint: 1, squash: 0.08 }, palmlean: { r: 0.3, move: true, shot: true, tall: true, tint: 1 },
  tree: { r: 0.42, move: true, shot: true, tall: true, tint: 1, squash: 0.1 }, treefar: { r: 0.42, move: true, shot: true, tall: true, tint: 1, squash: 0.1 },
  mangrove: { r: 1.1, move: true, shot: true, tall: true, tint: 1 }, giant: { r: 2.6, move: true, shot: true, tall: true }, caster: { r: 0 },
  bush: { r: 0.8, tint: 1, squash: 0.12 }, fern: { r: 0.6, tint: 1, squash: 0.12 }, bigleaf: { r: 0.6, tint: 1, squash: 0.1 }, banana: { r: 0.22, tall: true, tint: 1, squash: 0.08 },
  flowers: { r: 0.4, tint: 0.5 }, reeds: { r: 0.4, tint: 1, squash: 0.15 }, lily: { r: 1.0, tint: 0.6 }, beachgrass: { r: 0.4, tint: 0.7, squash: 0.15 }, litter: { r: 1.0, tint: 0.8 },
  rocks: { r: 0.45, tint: 0.5 }, rockm: { r: 0.8, move: true, tint: 0.5 }, rockl: { r: 1.2, move: true, shot: true, tint: 0.5 }, boulders: { r: 1.8, move: true, shot: true, tint: 0.5 },
  pebbles: { r: 0.9, tint: 0.5 }, log: { r: 0.6, move: true, tint: 0.5 }, stump: { r: 0.5, move: true, tint: 0.5 }, driftwood: { r: 1.0, tint: 0.4 }, shells: { r: 0.8 },
  caverock: { r: 0.85, move: true, shot: true, tint: 0.4 }, stalagmite: { r: 0.6, move: true, shot: true, tint: 0.4 }, mushroom: { r: 0.4 }, crystal: { r: 0.45, move: true },
  roots: { r: 0.9, move: true, shot: true, tall: true, tint: 0.4 }, cliff: { r: 6.5, move: true, shot: true, tall: true },
};

/** copy a part scaled by (sx, sy, sx) with a small per-instance colour shift, so repeats don't look stamped */
function instance(p: Part, sx: number, sy: number, v: number, w: number): THREE.BufferGeometry {
  const g = p.geo.clone(); g.scale(sx, sy, sx);
  if (v !== 1 || w !== 0) {
    const c = (g.attributes.color as THREE.BufferAttribute).array as Float32Array, r = v * (1 + w), gg = v * (1 + w * 0.3), b = v * (1 - w);
    for (let i = 0; i < c.length; i += 3) { c[i] *= r; c[i + 1] *= gg; c[i + 2] *= b; }
  }
  return g;
}
/** build one piece of `type` at scale `s`; variant picked with the seeded rng (or forced) */
export function naturePiece(type: string, rng: () => number, s = 1, o: { variant?: number; plain?: boolean } = {}): KitPiece[] {
  const vs = LIB.get(type); if (!vs) throw new Error(`nature kit: no piece "${type}" (await preloadNature() first)`);
  const m = META[type] ?? { r: 0.4 }, parts = vs[o.variant ?? Math.min(vs.length - 1, Math.floor(rng() * vs.length))];
  const k = o.plain ? 0 : 1, sy = s * (1 + (rng() * 2 - 1) * (m.squash ?? 0) * k);
  const v = 1 + (rng() * 2 - 1) * 0.07 * (m.tint ?? 0) * k, w = (rng() * 2 - 1) * 0.05 * (m.tint ?? 0) * k;
  return parts.map((p) => ({
    geo: instance(p, s, sy, p.mat === "emissive" ? 1 : v, p.mat === "foliage" ? w : w * 0.4), mat: p.mat,
    footprint: m.r * s, blocksMove: !!m.move, blocksShot: !!m.shot, tall: !!m.tall,
  }));
}
const B = (type: string, k = 1): Builder => (rng, s) => naturePiece(type, rng, s * k);

/** how the old placeholder sizes map onto the authored pieces (authored tree: 6.5 u tall, crown radius 3) */
const SCALE = { tree: 0.84, caveRock: 1.05 };
/** drop-in replacement for PLACEHOLDER_KIT (same builders, same size ranges as dress.ts passes) */
export const NATURE_KIT: KitSource = {
  palm: B("palm"),
  // big sizes are the far canopy fill behind the jungle wall: lighter crowns there (774 vs ~2,100 triangles)
  tree: (rng, s) => naturePiece(s >= 1.4 ? "treefar" : "tree", rng, s * SCALE.tree),
  bush: B("bush", 1.1), fern: B("fern"), bigLeaf: B("bigleaf"), banana: B("banana"),
  // rock(size): < 0.8 small (step over), < 1.0 medium (blocks movement, shots pass), else large (blocks both)
  rock: (rng, s) => (s < 0.8 ? naturePiece("rocks", rng, s / 0.5) : s < 1.0 ? naturePiece("rockm", rng, s / 0.85) : naturePiece("rockl", rng, s / 1.1)).map((p) => ({ ...p, footprint: 0.85 * s })),
  log: B("log"), stump: B("stump"),
  caveRock: (rng, s) => naturePiece("caverock", rng, s * SCALE.caveRock).map((p) => ({ ...p, footprint: 0.8 * s, tall: s >= 1.4 })),
  mushroom: B("mushroom"), caster: B("caster"),
};
/** every piece type as a builder (rng, size) => KitPiece[], for the lead's hand placement (addPieces in dress.ts) */
export const NATURE = {
  palm: B("palm"), leaningPalm: B("palmlean"), tree: B("tree"), treeFar: B("treefar"), giantTree: B("giant"), mangrove: B("mangrove"), caster: B("caster"),
  bush: B("bush"), fern: B("fern"), bigLeaf: B("bigleaf"), banana: B("banana"), flowers: B("flowers"), reeds: B("reeds"), lilyPads: B("lily"),
  beachGrass: B("beachgrass"), leafLitter: B("litter"), rockS: B("rocks"), rockM: B("rockm"), rockL: B("rockl"), boulders: B("boulders"), pebbles: B("pebbles"),
  log: B("log"), stump: B("stump"), driftwood: B("driftwood"), shells: B("shells"), caveRock: B("caverock"), stalagmite: B("stalagmite"), mushroom: B("mushroom"),
  crystal: B("crystal"), hangingRoots: B("roots"), cliff: B("cliff"),
} satisfies Record<string, Builder>;

/** the grass tuft for buildGrass(): 5-7 tapered blades, both windings, up-facing normals, root-to-tip AO in the colours
 *  (the instance colour = ground colour tints it, so roots blend into the terrain) */
export function grassTuft(variant = 0): THREE.BufferGeometry {
  const vs = LIB.get("grass"); if (!vs) throw new Error("nature kit: await preloadNature() first");
  const src = vs[variant % vs.length][0].geo, n = src.attributes.position.count, g = new THREE.BufferGeometry();
  const col = (src.attributes.color.array as Float32Array).map((c) => c * 1.2); // stored 0..1; tips go a little over 1 like the L1 tuft
  g.setAttribute("position", src.attributes.position.clone()); g.setAttribute("normal", src.attributes.normal.clone()); g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const idx: number[] = []; for (let i = 0; i < n; i += 3) idx.push(i, i + 1, i + 2, i, i + 2, i + 1);
  g.setIndex(idx); return g;
}

// ---- waterfall: cliff (kit materials + hero cutout) with an animated water sheet and foam. No textures: the streaks are
// procedural and scroll along uv.y (distance along the flow in world units). Animates from U.uTime (the game clock).
const WGLSL = /* glsl */ `
float wf_hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wf_noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(wf_hash(i), wf_hash(i + vec2(1, 0)), u.x), mix(wf_hash(i + vec2(0, 1)), wf_hash(i + vec2(1, 1)), u.x), u.y); }`;
function waterMaterial(kind: "sheet" | "foam") {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.DoubleSide, depthWrite: kind === "foam" ? false : true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.uTime;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime;\nvarying vec2 vWf;")
      .replace("#include <begin_vertex>", kind === "sheet"
        ? `#include <begin_vertex>\n  vWf = uv;\n  transformed.z += sin(uv.y * 2.6 - uTime * 4.0 + uv.x * 7.0) * 0.035 * smoothstep(1.5, 3.5, uv.y);`
        : `#include <begin_vertex>\n  vWf = uv;\n  if (uv.y > 1.5) { float ph = fract(uv.y) * 37.0; float b = abs(sin(uTime * 4.2 + ph));
    transformed.y += b * 0.16 - 0.05; }`);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>\nuniform float uTime;\nvarying vec2 vWf;\n${WGLSL}`)
      .replace("#include <color_fragment>", kind === "sheet"
        ? `#include <color_fragment>
  { float a = wf_noise(vec2(vWf.x * 19.0, vWf.y * 0.55 - uTime * 1.5)), b = wf_noise(vec2(vWf.x * 47.0 + 3.0, vWf.y * 1.2 - uTime * 2.6));
    float streak = smoothstep(0.46, 0.66, a * 0.6 + b * 0.4);
    diffuseColor.rgb = mix(diffuseColor.rgb * 0.92, vec3(1.0), streak * 0.8);
    diffuseColor.a = mix(0.6, 0.96, streak); }`
        : `#include <color_fragment>
  if (vWf.y < 1.5) { float r = vWf.y, n = wf_noise(vec2(vWf.x * 30.0, r * 6.0 - uTime * 0.8));
    float rings = sin((r * 3.5 - uTime * 0.5 + n * 0.3) * 6.2832) * 0.5 + 0.5;
    float a = (1.0 - smoothstep(0.45, 1.0, r)) * smoothstep(0.5, 0.62, rings * 0.55 + n * 0.6);
    if (a < 0.2) discard; diffuseColor.a = a * 0.85; }`);
  };
  m.customProgramCacheKey = () => "nat-water-" + kind;
  return m;
}
/** the falls as one object. Origin = the middle of the 2.6 u wide walk-through gap at ground level; the sheet faces +z
 *  (south, the camera side). The cliff spans x -7.5..7.5, z -3.6..1.2, 6.7 u tall; the gap runs along z from 1 to -3.6.
 *  Children: "cliff" (matte + foliage, hero cutout), "water", "foam". Collision is the caller's (block the two piers). */
export function waterfall(): THREE.Object3D {
  const g = new THREE.Group(); g.name = "waterfall";
  const get = (t: string) => { const v = LIB.get(t); if (!v) throw new Error("nature kit: await preloadNature() first"); return v[0]; };
  for (const p of get("cliff")) {
    const base = kitMaterial(p.mat) as THREE.MeshStandardMaterial, mat = base.clone();
    mat.onBeforeCompile = base.onBeforeCompile; mat.customProgramCacheKey = base.customProgramCacheKey;
    const m = new THREE.Mesh(p.geo, withCutout(mat)); m.name = "cliff"; m.castShadow = m.receiveShadow = true; g.add(m);
  }
  const water = new THREE.Mesh(get("water")[0].geo, waterMaterial("sheet")); water.name = "water"; water.renderOrder = 2; g.add(water);
  const foam = new THREE.Mesh(get("foam")[0].geo, waterMaterial("foam")); foam.name = "foam"; foam.renderOrder = 3; g.add(foam);
  return g;
}

/** optional: gentle wind on every foliage-class kit mesh (tree crowns sway a few cm, leaves flutter). The merged chunks
 *  carry no per-vertex weight, so the sway grows with height above the ground instead. Call once, before the world's
 *  chunks are flushed (it wraps the shared foliage material from kitutil.ts; shading.ts is untouched). */
export function enableFoliageWind(strength = 1) {
  const m = kitMaterial("foliage") as THREE.MeshStandardMaterial;
  if (m.userData.natWind) return; m.userData.natWind = true;
  const prev = m.onBeforeCompile.bind(m), key = m.customProgramCacheKey?.bind(m), uWind = { value: strength };
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r); sh.uniforms.uWind = uWind;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uWind;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
  { float wy = clamp((position.y - 0.35) * 0.2, 0.0, 1.0), ph = position.x * 0.35 + position.z * 0.27;
    float sw = sin(uTime * 1.3 + ph) * 0.6 + sin(uTime * 2.9 + ph * 2.3 + position.y) * 0.25;
    float fl = sin(uTime * 5.3 + position.x * 3.1 + position.z * 2.7 + position.y * 1.9) * clamp(position.y * 0.6, 0.0, 1.0);
    transformed.x += (sw * 0.075 * wy + fl * 0.012) * uWind; transformed.z += (sw * 0.05 * wy - fl * 0.009) * uWind; transformed.y += fl * 0.008 * uWind; }`);
  };
  m.customProgramCacheKey = () => (key ? key() : "") + "wind";
  m.needsUpdate = true;
}
