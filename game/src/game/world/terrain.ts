// Ground for the raid map (map v3): painted from zones and roads, not from clearing shapes. One vertex-coloured
// heightfield cut into 32 u tiles (frustum culled), plus the sea, the river, the swamp and the waterfall pool.
// Height: gentle rolls on open ground, flat inside built places and along roads, a beach that slopes into the sea,
// a berm under the jungle edge and a rock rise under the cliffs, a causeway where a road crosses the swamp.
// Colours follow the L3 council re-grade (olive/teal greens, bright dirt, cool shade).
import * as THREE from "three";
import { ZONES, ROADS, PLACED, BOUNDS, UNDER_X, SEA_Z, RIVER_Z, LAND, PIERS, PIER_Y } from "./map/grove";
import { polySigned, segDist, inPoly, type Ground, type EdgeKind } from "./map/types";
import { edgeDist, roadDist, zoneAt } from "./grid";
import { fbm } from "./noise";
import { patch } from "../render/shading";

export const GROUND_C: Record<Ground | "jungle" | "wet" | "rock", THREE.Color> = {
  grass: new THREE.Color("#86a64e"), sand: new THREE.Color("#dcc08a"), dirt: new THREE.Color("#ceb47f"), stone: new THREE.Color("#c4ab84"),
  cave: new THREE.Color("#6f6458"), plank: new THREE.Color("#b08f62"), mud: new THREE.Color("#7c7f58"), jungle: new THREE.Color("#5e7d3e"), wet: new THREE.Color("#b89c6a"), rock: new THREE.Color("#9d8f7a"),
};
const G2 = { yard: new THREE.Color("#63803f"), loam: new THREE.Color("#6f6748"), grassDry: new THREE.Color("#9aa85c"), grassMoist: new THREE.Color("#6f8a48"), worn: new THREE.Color("#a99262"), dirtD: new THREE.Color("#bba06c"), caveL: new THREE.Color("#7d7062"), rockD: new THREE.Color("#7f7466"), deep: new THREE.Color("#5f8f86") };
const sstep = THREE.MathUtils.smoothstep;
const FLAT = ZONES.filter((z) => z.flat).map((z) => ({ z, bb: bbox(z.pts, 4) }));
const WET = ZONES.filter((z) => z.water !== undefined).map((z) => ({ z, bb: bbox(z.pts, 5) }));
const PAINT = [...ZONES].reverse().filter((z) => z.ground !== "grass" && !z.under).map((z) => ({ z, bb: bbox(z.pts, 4) })); // later = on top: first-listed zones win
const HOUSES = PLACED.filter((p) => p.k.startsWith("building:")), POOLS = PLACED.filter((p) => p.k === "pool");
function bbox(pts: [number, number][], pad: number) { const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]); return [Math.min(...xs) - pad, Math.max(...xs) + pad, Math.min(...zs) - pad, Math.max(...zs) + pad]; }
const inBB = (bb: number[], x: number, z: number) => x >= bb[0] && x <= bb[1] && z >= bb[2] && z <= bb[3];

const info = { kind: "jungle" as EdgeKind | "cave" }, rinfo = { road: null as (typeof ROADS)[number] | null };
// Pier decks are part of the walkable outline but they are not land: the river bed runs under them. Near a pier the
// terrain measures its distance to the land outline instead, so the shore, the bed and the water line pass under the deck.
const PIER_BB = [Math.min(...PIERS.map((q) => q.x0)) - 14, Math.max(...PIERS.map((q) => q.x1)) + 14, Math.min(...PIERS.map((q) => q.z0)) - 14, Math.max(...PIERS.map((q) => q.z1)) + 14];
function landDist(x: number, z: number, out: { kind: EdgeKind | "cave" }) {
  const d = edgeDist(x, z, out);
  if (x < PIER_BB[0] || x > PIER_BB[1] || z < PIER_BB[2] || z > PIER_BB[3]) return d;
  let q = 1e9, k: EdgeKind = "river";
  for (let i = 0, j = LAND.length - 1; i < LAND.length; j = i++) { const e = segDist(x, z, LAND[j][0], LAND[j][1], LAND[i][0], LAND[i][1]); if (e < q) { q = e; k = LAND[j][2]; } }
  out.kind = k; return inPoly(LAND, x, z) ? q : -q;
}
/** walk height of a pier deck at a point, or null off the decks. The main pier ramps down to the sand at its root */
function deckAt(x: number, z: number, ground: number): number | null {
  for (const p of PIERS) {
    const root = p.id === "dock" ? 2.5 : 0;
    if (x < p.x0 - 0.45 || x > p.x1 + 0.45 || z < p.z0 - 0.3 || z > p.z1 + root) continue;
    const along = root ? 1 - sstep(z, p.z1, p.z1 + root) : 1, side = 1 - sstep(Math.max(p.x0 - x, x - p.x1), 0, 0.45);
    return ground + (PIER_Y - ground) * along * side;
  }
  return null;
}
/** the authored height at a point (slow: the 1 u field below caches it) */
function rawHeight(x: number, z: number) {
  const d = landDist(x, z, info), kind = info.kind;
  if (x > UNDER_X) return d > 0 ? (fbm(x * 0.3, z * 0.3) - 0.5) * 0.16 : sstep(-d, 0, 2.6) * 3.4 + (fbm(x * 0.2, z * 0.2) - 0.5) * 0.8;
  let flat = 0;
  for (const f of FLAT) if (inBB(f.bb, x, z)) flat = Math.max(flat, sstep(polySigned(f.z.pts, x, z), -3.5, 0.5));
  for (const h of HOUSES) { const q = Math.hypot(x - h.x, z - h.z); if (q < 11) flat = Math.max(flat, 1 - sstep(q, 6.5, 11)); }
  const rd = roadDist(x, z, rinfo), road = rinfo.road;
  let h = (fbm(x * 0.045 + 7, z * 0.045) - 0.5) * 1.5 * (1 - flat) * (0.3 + 0.7 * sstep(rd, 0, 3.5));
  for (const w of WET) if (inBB(w.bb, x, z)) h -= 0.62 * sstep(polySigned(w.z.pts, x, z), -1, 4);
  for (const p of POOLS) { const r = Number(p.o?.r ?? 6), q = Math.hypot(x - p.x, z - p.z); if (q < r + 2) h -= 0.7 * (1 - sstep(q, r * 0.5, r + 1)); }
  if (road?.raise !== undefined) h = THREE.MathUtils.lerp(h, road.raise, 1 - sstep(rd, -0.2, 1.3));
  if (kind === "coast" || kind === "river") {
    const p = PIERS[0], berm = 0.2 * (1 - sstep(Math.hypot(x - (p.x0 + p.x1) / 2, z - (p.z1 + 2.2)), 1.2, 4.6)); // sand heaped against the foot of the pier ramp
    return d > 0 ? h * sstep(d, 0, 9) + 0.02 + berm * sstep(d, 0, 2) : Math.max(-1.7, d * 0.22);
  }
  if (d > 0) return h;
  return h + (kind === "cliff" ? sstep(-d, 0.2, 3.2) * 4.4 + (fbm(x * 0.21, z * 0.21) - 0.5) * 1.2 * sstep(-d, 1, 4) : sstep(-d, 0, 7) * 2.4);
}
// Water planes are flat; where the ground runs nearly level within a couple of cm of one, the two fight over a wide band
// (G1.5-12: the swamp shallows and the river bank). The ground steps 2.5 cm clear of any water level it would graze, so
// the shoreline is a clean line. A 5 cm step at the waterline is under the water's edge and changes no walk height.
const WATER_LEVELS = (x: number, z: number) => {
  const out: number[] = [];
  if (z > SEA_Z - 4 || z < RIVER_Z + 16) out.push(-0.32);
  for (const w of WET) if (inBB(w.bb, x, z)) out.push(w.z.water!);
  for (const p of POOLS) if (Math.hypot(x - p.x, z - p.z) < Number(p.o?.r ?? 6) + 1.3) out.push(POOL_Y);
  return out;
};
function clearOfWater(x: number, z: number, h: number) {
  for (const w of WATER_LEVELS(x, z)) if (Math.abs(h - w) < 0.025) h = h >= w ? w + 0.025 : w - 0.025;
  return h;
}
// ---- the 1 u height field (bilinear): what groundHeight() reads at runtime
const FX0 = BOUNDS.minX - 16, FZ0 = BOUNDS.minZ - 16, FW = BOUNDS.maxX - BOUNDS.minX + 33, FH = BOUNDS.maxZ - BOUNDS.minZ + 33;
let field: Float32Array | null = null;
function ensureField() {
  if (field) return field; field = new Float32Array(FW * FH);
  for (let r = 0; r < FH; r++) for (let c = 0; c < FW; c++) { const x = FX0 + c, z = FZ0 + r; field[r * FW + c] = x > UNDER_X ? rawHeight(x, z) : clearOfWater(x, z, rawHeight(x, z)); }
  return field;
}
/** where things stand and walk: the terrain, or a pier deck over it */
export function groundHeight(x: number, z: number) { const h = terrainHeight(x, z); return deckAt(x, z, h) ?? h; }
/** the terrain surface itself (the mesh, decals, anything that lies on the ground under a deck) */
export function terrainHeight(x: number, z: number) {
  const f = ensureField(), fx = Math.max(0, Math.min(FW - 1.001, x - FX0)), fz = Math.max(0, Math.min(FH - 1.001, z - FZ0)), c = Math.floor(fx), r = Math.floor(fz), u = fx - c, v = fz - r, i = r * FW + c;
  return (f[i] * (1 - u) + f[i + 1] * u) * (1 - v) + (f[i + FW] * (1 - u) + f[i + FW + 1] * u) * v;
}
/** the terrain surface as drawn: the tiles below are 0.8 u PlaneGeometry triangles on one lattice from (-128, -144),
 *  each cell split along its b-d diagonal (u + v = 1). terrainHeight() is the smooth 1 u field; on curved ground the two
 *  differ by a few cm, which is the whole of a decal's lift. Anything that has to lie a set distance above the ground
 *  as seen (decals, puddles, floor plates) measures from this (G1.5-12: Moo's flickering molasses puddle) */
export function meshHeight(x: number, z: number) {
  const fx = (x + 128) / 0.8, fz = (z + 144) / 0.8, c = Math.floor(fx), r = Math.floor(fz), u = fx - c, v = fz - r;
  const x0 = -128 + c * 0.8, z0 = -144 + r * 0.8, ha = terrainHeight(x0, z0), hb = terrainHeight(x0, z0 + 0.8), hc = terrainHeight(x0 + 0.8, z0 + 0.8), hd = terrainHeight(x0 + 0.8, z0);
  return u + v <= 1 ? ha + (hd - ha) * u + (hb - ha) * v : hc + (hb - hc) * (1 - u) + (hd - hc) * (1 - v);
}
/** the highest drawn terrain within r of a point (a flat sheet laid over it at this height never dips under it) */
export function meshHeightMax(x: number, z: number, r = 0.45) {
  let h = meshHeight(x, z);
  for (let a = 0; a < 6; a++) h = Math.max(h, meshHeight(x + Math.cos(a * 1.047) * r, z + Math.sin(a * 1.047) * r));
  return h;
}
const tmp = new THREE.Color();
// ---- ground paint (G1 council fix round 1, F2 item 2). The ground is two layers and a mask: the bare surface (dirt,
// sand, stone, rock), the turf, and how much turf there is. The mask is a linear ramp across each edge (0.5 on the
// edge itself), so the shader can cut a crisp, ragged turf line through it per pixel instead of the old half-metre
// airbrushed blend between vertices. A second field carries the distance from the waterline for the shore bands.
/** signed distance to the nearest sea or river edge of the outline (> 0 on land), 9 when none is near */
function coastDist(x: number, z: number, d: number) {
  if (Math.abs(d) > 9) return d > 0 ? 9 : -9; // signed even when far: +9 next to -9 under water made the shader's foam/wet/wrack contours draw staircase seams across the bay (G1 council r2)
  let q = 9;
  for (let i = 0, j = LAND.length - 1; i < LAND.length; j = i++) { const k = LAND[j][2]; if (k !== "coast" && k !== "river") continue; q = Math.min(q, segDist(x, z, LAND[j][0], LAND[j][1], LAND[i][0], LAND[i][1])); }
  return d > 0 ? Math.min(q, 9) : -Math.min(q, 9);
}
/** 0..1 across an edge: 0.5 on it, linear over 2r so the shader's threshold moves evenly */
const ramp = (sd: number, r = 1.2) => Math.max(0, Math.min(1, 0.5 + sd / (2 * r)));
export type GroundMask = { /** turf: > 0.5 is grass */ g: number; /** u inland from the outline along a coast (9 = no coast near) */ shore: number; /** how much surface mottling the bare ground takes */ fine: number };
const gm: GroundMask = { g: 1, shore: 9, fine: 1 };
const FINE: Record<Ground, number> = { grass: 1, sand: 1, dirt: 1, stone: 0.55, cave: 0.5, plank: 0.3, mud: 0.6 };
/** the authored ground at a point: the bare colour, the turf colour and the masks */
export function sampleGround(x: number, z: number, bare: THREE.Color, grass: THREE.Color, o: GroundMask = gm): GroundMask {
  const n = fbm(x * 0.06, z * 0.06), m = fbm(x * 0.45 + 9, z * 0.45), wob = (fbm(x * 0.21 + 40, z * 0.21) - 0.5) * 2.4;
  const d = landDist(x, z, info), kind = info.kind;
  o.shore = 9; o.fine = 1; o.g = 0;
  if (x > UNDER_X) {
    bare.copy(GROUND_C.cave).lerp(G2.caveL, m * 0.6);
    if (d < 0) bare.lerp(G2.rockD, sstep(-d, 0, 1.5) * 0.7).multiplyScalar(1 - sstep(-d, 1.5, 4) * 0.45); else bare.lerp(G2.caveL, (1 - sstep(roadDist(x, z), -0.6, 0.8)) * 0.5);
    grass.copy(bare); o.fine = FINE.cave; return o;
  }
  grass.copy(G2.grassMoist).lerp(G2.grassDry, sstep(n, 0.35, 0.7)).lerp(G2.worn, sstep(m, 0.62, 0.82) * 0.3);
  bare.copy(GROUND_C.dirt).lerp(G2.dirtD, m);
  let g = 1, fine = 1;
  for (const p of PAINT) {
    if (!inBB(p.bb, x, z)) continue;
    const sd = polySigned(p.z.pts, x, z) + wob; if (sd < -3.2) continue;
    const gr = p.z.ground, kc = sstep(sd, -2.8, 0.2);
    tmp.copy(GROUND_C[gr]); if (gr === "dirt") tmp.lerp(G2.dirtD, m); else if (gr === "stone") tmp.lerp(G2.worn, m * 0.35); else if (gr === "sand") tmp.lerp(G2.dirtD, sstep(m, 0.6, 0.9) * 0.25); else if (gr === "mud") tmp.lerp(G2.deep, sstep(m, 0.3, 0.8) * 0.4);
    bare.lerp(tmp, kc); fine += (FINE[gr] - fine) * kc;
    let k = ramp(sd);
    // worn yards keep islands of turf (Duckov frames: dirt and turf interleave round buildings); it grows darker and
    // moister there than the open meadow, so it parts from pale sandstone and lit dirt (Sol's "quieter grass-root colour")
    if (gr === "dirt" || gr === "stone") { k *= 1 - grassPatch(x, z); grass.lerp(G2.yard, kc * 0.75); }
    g = Math.min(g, 1 - k);
  }
  const rd = roadDist(x, z, rinfo), road = rinfo.road;
  if (road && rd < 2.4) {
    const sd = -(rd + wob * 0.2), gr = road.ground, kc = sstep(sd, -1.5, 0.1) * (gr === "sand" ? 0.6 : 1);
    tmp.copy(GROUND_C[gr]); if (gr === "dirt") tmp.lerp(G2.dirtD, m); if (gr === "plank") tmp.multiplyScalar(0.8);
    bare.lerp(tmp, kc); fine += (FINE[gr] - fine) * kc; g = Math.min(g, 1 - ramp(sd, 0.9));
  }
  if (d < 4) {
    if (kind === "coast" || kind === "river") { bare.lerp(GROUND_C.sand, sstep(-d, -3, -0.6) * 0.85).lerp(G2.deep, sstep(-d, 1.5, 5) * 0.75).multiplyScalar(1 - sstep(-d, 3, 9) * 0.45); g = Math.min(g, ramp(d - 2.0 + wob * 0.3)); }
    else if (kind === "cliff") { bare.lerp(GROUND_C.rock, sstep(-d, -1.6, 1.0)).lerp(G2.rockD, sstep(m, 0.4, 0.8) * sstep(-d, 0, 2) * 0.6); g = Math.min(g, ramp(d + 0.3 + wob * 0.25)); fine += (0.6 - fine) * sstep(-d, -1.6, 1.0); }
    else { const k = sstep(-d, -1.5, 3); grass.lerp(GROUND_C.jungle, k); bare.lerp(G2.loam, k); }
  }
  o.shore = coastDist(x, z, d); o.g = g; o.fine = fine; return o;
}
const cB = new THREE.Color(), cG = new THREE.Color();
/** the blended ground colour at a point (map screen, anything that wants one colour) */
export function groundColor(x: number, z: number, out = new THREE.Color()) { const o = sampleGround(x, z, cB, cG); return out.copy(cB).lerp(cG, sstep(o.g, 0.42, 0.58)); }
/** 0..1 mask of the grass islands inside dirt and stone yards (off the roads) */
export function grassPatch(x: number, z: number) { return sstep(fbm(x * 0.085 + 31, z * 0.085 + 17), 0.5, 0.74) * sstep(roadDist(x, z), 0.2, 2.4); }
// ---- the 1 u turf field: what the grass planting and isGrass() read (bilinear, same grid as the height field)
let turf: Float32Array | null = null;
function ensureTurf() {
  if (turf) return turf; turf = new Float32Array(FW * FH); const o: GroundMask = { g: 0, shore: 9, fine: 1 };
  for (let r = 0; r < FH; r++) for (let c = 0; c < FW; c++) turf[r * FW + c] = sampleGround(FX0 + c, FZ0 + r, cB, cG, o).g;
  return turf;
}
/** the turf mask at a point: > 0.5 is grass, 0.5 is the edge, one unit of mask is 2.4 u of ground */
export function turfAt(x: number, z: number) {
  const f = ensureTurf(), fx = Math.max(0, Math.min(FW - 1.001, x - FX0)), fz = Math.max(0, Math.min(FH - 1.001, z - FZ0)), c = Math.floor(fx), r = Math.floor(fz), u = fx - c, v = fz - r, i = r * FW + c;
  return (f[i] * (1 - u) + f[i + 1] * u) * (1 - v) + (f[i + FW] * (1 - u) + f[i + FW + 1] * u) * v;
}
/** is the ground under a point grass (tufts grow there)? */
export function isGrass(x: number, z: number) { return x < UNDER_X && turfAt(x, z) > 0.5; }
/** the turf colour at a point, whatever the mask says (grass tufts that spill onto the dirt keep it) */
export function grassColor(x: number, z: number, out = new THREE.Color()) {
  const n = fbm(x * 0.06, z * 0.06), m = fbm(x * 0.45 + 9, z * 0.45), zn = zoneAt(x, z);
  out.copy(G2.grassMoist).lerp(G2.grassDry, sstep(n, 0.35, 0.7)).lerp(G2.worn, sstep(m, 0.62, 0.82) * 0.3);
  if (zn && (zn.ground === "dirt" || zn.ground === "stone")) out.lerp(G2.yard, 0.75);
  const d = edgeDist(x, z, info); if (d < 1.5 && info.kind === "jungle") out.lerp(GROUND_C.jungle, sstep(-d, -1.5, 3));
  return out;
}

// The ground shader: runs after shading.ts's patch (it uses its world position, clock and noise).
const GROUND_GLSL = /* glsl */ `
  { vec2 wp = vWPos.xz;
    float n1 = lt_noise(wp * 0.85 + 3.0), n2 = lt_noise(wp * 3.3 + 17.0);
    // turf edge: a crisp line through the mask, pushed about by two scales of noise so it never runs ruled
    float e = vMask.x + (n1 - 0.5) * 0.3 + (n2 - 0.5) * 0.12;
    float gk = smoothstep(0.475, 0.525, e);
    vec3 bare = vColor.rgb;
    // bare ground: mid-scale mottling (plus or minus 8 percent at 3 to 5 m) and a fine grain, so no plate is one tone
    float b1 = lt_noise(wp * 0.23 + 5.0), b2 = lt_noise(wp * 0.57 + 31.0), b3 = lt_noise(wp * 4.7);
    float blot = smoothstep(0.32, 0.68, b1 * 0.62 + b2 * 0.38);
    // The swing is kept for after the lighting (gndMot, applied below): 8 percent of light is 2 percent on screen where
    // sunlit dirt sits on the tone mapper's shoulder, and far too much in shade.
    gndMot = ((blot - 0.5) * 0.26 + (b3 - 0.5) * 0.05 + (n2 - 0.5) * 0.035) * vMask.z * (1.0 - gk);
    // the soil shoulder: darker, damper earth in a narrow band under the turf edge
    float lip = smoothstep(0.31, 0.46, e) * (1.0 - gk);
    bare = mix(bare, bare * vec3(0.55, 0.58, 0.52), lip * 0.75);
    // the shore: wet sand under the lapping line, a damp margin, a wrack line of drift at the high-water mark
    float sh = vMask.y;
    if (sh < 6.0) {
      float lap = sin(uTime * 0.8 + wp.x * 0.23 + wp.y * 0.19) * 0.13;
      float sd = sh + (n1 - 0.5) * 0.8 + (n2 - 0.5) * 0.22;
      float wet = 1.0 - smoothstep(-0.5, -0.28, sd - lap);
      float damp = (1.0 - smoothstep(0.75, 1.25, sd)) * (1.0 - wet);
      bare *= mix(vec3(1.0), vec3(0.8, 0.84, 0.84), damp);
      bare = mix(bare, bare * vec3(0.5, 0.6, 0.62), wet);
      float wr = smoothstep(0.26, 0.06, abs(sd - 1.5)) * smoothstep(0.3, 0.55, lt_noise(wp * 1.4 + 7.0));
      wr = max(wr, 0.6 * smoothstep(0.16, 0.04, abs(sd - 3.3)) * smoothstep(0.45, 0.65, lt_noise(wp * 1.1 + 23.0)));
      bare = mix(bare, bare * vec3(0.42, 0.44, 0.36), wr * 0.8);
      float foam = smoothstep(0.13, 0.03, abs(sh + (n2 - 0.5) * 0.2 - lap * 1.6 + 1.22));
      bare = mix(bare, vec3(0.9, 0.93, 0.9), foam * 0.75);
    }
    vec3 turf = vGrass * (0.95 + 0.1 * smoothstep(0.35, 0.65, lt_noise(wp * 0.31 + 11.0)));
    diffuseColor.rgb *= mix(bare, turf, gk); }
`;
/** patch a ground material (after shading.ts patch()) to read the two colour layers and the masks */
function groundShader<T extends THREE.Material>(mat: T): T {
  const base = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    base.call(mat, sh, r);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute vec3 aGrass;\nattribute vec3 aMask;\nvarying vec3 vGrass;\nvarying vec3 vMask;").replace("#include <color_vertex>", "#include <color_vertex>\n  vGrass = aGrass; vMask = aMask;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vGrass;\nvarying vec3 vMask;\nfloat gndMot = 0.0;").replace("#include <color_fragment>", GROUND_GLSL)
      // after the lighting (shading.ts leaves one opaque_fragment include behind its own block): the mottling swings wider
      // the brighter the pixel, so it lands near 8 percent of displayed value in sun and in shade alike. In sun only the
      // dark half grows: the light half would push lit dirt back into clipping
      .replace("#include <opaque_fragment>", "  { float gndLum = max(outgoingLight.r, max(outgoingLight.g, outgoingLight.b)); float gndB = smoothstep(0.35, 1.3, gndLum); outgoingLight *= 1.0 + min(gndMot, 0.0) * mix(0.75, 2.9, gndB) + max(gndMot, 0.0) * mix(0.75, 0.15, gndB); }\n#include <opaque_fragment>");
  };
  mat.customProgramCacheKey = () => "ground3";
  return mat;
}

const TILE = 32, STEP = 0.8;
function tile(x0: number, z0: number, mat: THREE.Material) {
  const n = Math.round(TILE / STEP), g = new THREE.PlaneGeometry(TILE, TILE, n, n); g.rotateX(-Math.PI / 2); g.translate(x0 + TILE / 2, 0, z0 + TILE / 2);
  const pos = g.attributes.position as THREE.BufferAttribute, col = new Float32Array(pos.count * 3), gra = new Float32Array(pos.count * 3), msk = new Float32Array(pos.count * 3), c = new THREE.Color(), cg = new THREE.Color(), o: GroundMask = { g: 0, shore: 9, fine: 1 };
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i); pos.setY(i, terrainHeight(x, z)); sampleGround(x, z, c, cg, o);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; gra[i * 3] = cg.r; gra[i * 3 + 1] = cg.g; gra[i * 3 + 2] = cg.b; msk[i * 3] = o.g; msk[i * 3 + 1] = o.shore; msk[i * 3 + 2] = o.fine;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3)); g.setAttribute("aGrass", new THREE.BufferAttribute(gra, 3)); g.setAttribute("aMask", new THREE.BufferAttribute(msk, 3));
  // normals from the height field itself, so tile seams are invisible
  const nor = g.attributes.normal as THREE.BufferAttribute, e = 0.6;
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i), nx = terrainHeight(x - e, z) - terrainHeight(x + e, z), nz = terrainHeight(x, z - e) - terrainHeight(x, z + e), l = Math.hypot(nx, 2 * e, nz); nor.setXYZ(i, nx / l, (2 * e) / l, nz / l); }
  g.computeBoundingSphere(); g.computeBoundingBox();
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.name = "terrain"; return m;
}
export function buildTerrain(scene: THREE.Scene) {
  const mat = groundShader(patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), { rim: 0 }));
  const tiles: THREE.Mesh[] = [];
  for (let z = -144; z < 144; z += TILE) for (let x = -128; x < 128; x += TILE) tiles.push(tile(x, z, mat));
  for (let z = -48; z < 80; z += TILE) for (let x = 128; x < 224; x += TILE) tiles.push(tile(x, z, mat));
  scene.add(...tiles);
  // still water faces the low sun: a glossy plane throws one blinding highlight at the camera, so inland water is matte
  const water = (w: number, d: number, x: number, y: number, z: number, color: string, opacity = 0.9, rough = 0.4) => {
    const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, patch(new THREE.MeshStandardMaterial({ color, roughness: rough, transparent: true, opacity }), { rim: 0, water: true }));
    m.position.set(x, y, z); m.receiveShadow = true; m.name = "water"; scene.add(m); return m;
  };
  water(420, 90, 0, -0.32, SEA_Z + 41, "#3a9bb0", 0.8); water(420, 106, 0, -0.32, RIVER_Z - 37, "#2f8296", 0.8); // 0.9 -> 0.8: the shallows show their sand, the water deepens away from the shore // the river reaches south into the landing bay (z -98)
  for (const w of WET) { const b = w.bb; water(b[1] - b[0], b[3] - b[2], (b[0] + b[1]) / 2, w.z.water!, (b[2] + b[3]) / 2, "#4c8f84", 0.78, 0.95); }
  for (const p of POOLS) { // the waterfall pool: a disc that sits in the dip the terrain cut for it
    const r = Number(p.o?.r ?? 6) + 1.2, g = new THREE.CircleGeometry(r, 40); g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, patch(new THREE.MeshStandardMaterial({ color: "#3a9bb0", roughness: 0.95, transparent: true, opacity: 0.86 }), { rim: 0, water: true }));
    m.position.set(p.x, POOL_Y, p.z); m.receiveShadow = true; m.name = "water"; scene.add(m);
  }
  return { tiles };
}
/** water level of the waterfall pool (the falls object stands at this height so its foam sits on the water) */
export const POOL_Y = -0.2;
