// Ground for the raid map (map v3): painted from zones and roads, not from clearing shapes. One vertex-coloured
// heightfield cut into 32 u tiles (frustum culled), plus the sea, the river, the swamp and the waterfall pool.
// Height: gentle rolls on open ground, flat inside built places and along roads, a beach that slopes into the sea,
// a berm under the jungle edge and a rock rise under the cliffs, a causeway where a road crosses the swamp.
// Colours follow the L3 council re-grade (olive/teal greens, bright dirt, cool shade).
import * as THREE from "three";
import { ZONES, ROADS, PLACED, BOUNDS, UNDER_X, SEA_Z, RIVER_Z } from "./map/grove";
import { polySigned, type Ground, type EdgeKind } from "./map/types";
import { edgeDist, roadDist, zoneAt } from "./grid";
import { fbm } from "./noise";
import { patch } from "../render/shading";

export const GROUND_C: Record<Ground | "jungle" | "wet" | "rock", THREE.Color> = {
  grass: new THREE.Color("#86a64e"), sand: new THREE.Color("#dcc08a"), dirt: new THREE.Color("#d9ae74"), stone: new THREE.Color("#c4ab84"),
  cave: new THREE.Color("#6f6458"), plank: new THREE.Color("#b08f62"), mud: new THREE.Color("#7c7f58"), jungle: new THREE.Color("#5e7d3e"), wet: new THREE.Color("#b89c6a"), rock: new THREE.Color("#9d8f7a"),
};
const G2 = { grassDry: new THREE.Color("#9aa85c"), grassMoist: new THREE.Color("#6f8a48"), worn: new THREE.Color("#a99262"), dirtD: new THREE.Color("#c99a62"), caveL: new THREE.Color("#7d7062"), rockD: new THREE.Color("#7f7466"), deep: new THREE.Color("#5f8f86") };
const sstep = THREE.MathUtils.smoothstep;
const FLAT = ZONES.filter((z) => z.flat).map((z) => ({ z, bb: bbox(z.pts, 4) }));
const WET = ZONES.filter((z) => z.water !== undefined).map((z) => ({ z, bb: bbox(z.pts, 5) }));
const PAINT = [...ZONES].reverse().filter((z) => z.ground !== "grass" && !z.under).map((z) => ({ z, bb: bbox(z.pts, 4) })); // later = on top: first-listed zones win
const HOUSES = PLACED.filter((p) => p.k.startsWith("building:")), POOLS = PLACED.filter((p) => p.k === "pool");
function bbox(pts: [number, number][], pad: number) { const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]); return [Math.min(...xs) - pad, Math.max(...xs) + pad, Math.min(...zs) - pad, Math.max(...zs) + pad]; }
const inBB = (bb: number[], x: number, z: number) => x >= bb[0] && x <= bb[1] && z >= bb[2] && z <= bb[3];

const info = { kind: "jungle" as EdgeKind | "cave" }, rinfo = { road: null as (typeof ROADS)[number] | null };
/** the authored height at a point (slow: the 1 u field below caches it) */
function rawHeight(x: number, z: number) {
  const d = edgeDist(x, z, info), kind = info.kind;
  if (x > UNDER_X) return d > 0 ? (fbm(x * 0.3, z * 0.3) - 0.5) * 0.16 : sstep(-d, 0, 2.6) * 3.4 + (fbm(x * 0.2, z * 0.2) - 0.5) * 0.8;
  let flat = 0;
  for (const f of FLAT) if (inBB(f.bb, x, z)) flat = Math.max(flat, sstep(polySigned(f.z.pts, x, z), -3.5, 0.5));
  for (const h of HOUSES) { const q = Math.hypot(x - h.x, z - h.z); if (q < 11) flat = Math.max(flat, 1 - sstep(q, 6.5, 11)); }
  const rd = roadDist(x, z, rinfo), road = rinfo.road;
  let h = (fbm(x * 0.045 + 7, z * 0.045) - 0.5) * 1.5 * (1 - flat) * (0.3 + 0.7 * sstep(rd, 0, 3.5));
  for (const w of WET) if (inBB(w.bb, x, z)) h -= 0.62 * sstep(polySigned(w.z.pts, x, z), -1, 4);
  for (const p of POOLS) { const r = Number(p.o?.r ?? 6), q = Math.hypot(x - p.x, z - p.z); if (q < r + 2) h -= 0.7 * (1 - sstep(q, r * 0.5, r + 1)); }
  if (road?.raise !== undefined) h = THREE.MathUtils.lerp(h, road.raise, 1 - sstep(rd, -0.2, 1.3));
  if (kind === "coast" || kind === "river") return d > 0 ? h * sstep(d, 0, 9) + 0.02 : Math.max(-1.7, d * 0.22);
  if (d > 0) return h;
  return h + (kind === "cliff" ? sstep(-d, 0.2, 3.2) * 4.4 + (fbm(x * 0.21, z * 0.21) - 0.5) * 1.2 * sstep(-d, 1, 4) : sstep(-d, 0, 7) * 2.4);
}
// ---- the 1 u height field (bilinear): what groundHeight() reads at runtime
const FX0 = BOUNDS.minX - 16, FZ0 = BOUNDS.minZ - 16, FW = BOUNDS.maxX - BOUNDS.minX + 33, FH = BOUNDS.maxZ - BOUNDS.minZ + 33;
let field: Float32Array | null = null;
function ensureField() {
  if (field) return field; field = new Float32Array(FW * FH);
  for (let r = 0; r < FH; r++) for (let c = 0; c < FW; c++) field[r * FW + c] = rawHeight(FX0 + c, FZ0 + r);
  return field;
}
export function groundHeight(x: number, z: number) {
  const f = ensureField(), fx = Math.max(0, Math.min(FW - 1.001, x - FX0)), fz = Math.max(0, Math.min(FH - 1.001, z - FZ0)), c = Math.floor(fx), r = Math.floor(fz), u = fx - c, v = fz - r, i = r * FW + c;
  return (f[i] * (1 - u) + f[i + 1] * u) * (1 - v) + (f[i + FW] * (1 - u) + f[i + FW + 1] * u) * v;
}
const tmp = new THREE.Color();
export function groundColor(x: number, z: number, out = new THREE.Color()) {
  const n = fbm(x * 0.06, z * 0.06), m = fbm(x * 0.45 + 9, z * 0.45), wob = (fbm(x * 0.21 + 40, z * 0.21) - 0.5) * 2.4;
  const d = edgeDist(x, z, info), kind = info.kind;
  if (x > UNDER_X) { out.copy(GROUND_C.cave).lerp(G2.caveL, m * 0.6); if (d < 0) out.lerp(G2.rockD, sstep(-d, 0, 1.5) * 0.7).multiplyScalar(1 - sstep(-d, 1.5, 4) * 0.45); else { const rd = roadDist(x, z); out.lerp(G2.caveL, (1 - sstep(rd, -0.6, 0.8)) * 0.5); } return out; }
  out.copy(G2.grassMoist).lerp(G2.grassDry, sstep(n, 0.35, 0.7)).lerp(G2.worn, sstep(m, 0.62, 0.82) * 0.5);
  for (const p of PAINT) {
    if (!inBB(p.bb, x, z)) continue;
    const k = sstep(polySigned(p.z.pts, x, z) + wob, -1.6, 1.4); if (k <= 0) continue;
    const g = p.z.ground; tmp.copy(GROUND_C[g]); if (g === "dirt") tmp.lerp(G2.dirtD, m); else if (g === "stone") tmp.lerp(G2.worn, m * 0.35); else if (g === "sand") tmp.lerp(G2.dirtD, sstep(m, 0.6, 0.9) * 0.25); else if (g === "mud") tmp.lerp(G2.deep, sstep(m, 0.3, 0.8) * 0.4);
    out.lerp(tmp, k);
  }
  const rd = roadDist(x, z, rinfo), road = rinfo.road;
  if (road && rd < 1.2) { const k = 1 - sstep(rd + wob * 0.22, -0.5, 0.7), g = road.ground; tmp.copy(GROUND_C[g]); if (g === "dirt") tmp.lerp(G2.dirtD, m); if (g === "plank") tmp.multiplyScalar(0.8); out.lerp(tmp, k * (g === "sand" ? 0.5 : 0.92)); }
  if (d < 1.5) {
    if (kind === "coast" || kind === "river") out.lerp(GROUND_C.wet, sstep(-d, -1.5, 1.2)).lerp(G2.deep, sstep(-d, 1.5, 6) * 0.6);
    else if (kind === "cliff") out.lerp(GROUND_C.rock, sstep(-d, -0.8, 1.6)).lerp(G2.rockD, sstep(m, 0.4, 0.8) * sstep(-d, 0, 2) * 0.6);
    else out.lerp(GROUND_C.jungle, sstep(-d, -1.5, 3));
  }
  return out;
}
/** is the ground under a point grass (tufts grow there)? */
export function isGrass(x: number, z: number) { const zn = zoneAt(x, z); return !zn || zn.ground === "grass"; }

const TILE = 32, STEP = 0.8;
function tile(x0: number, z0: number, mat: THREE.Material) {
  const n = Math.round(TILE / STEP), g = new THREE.PlaneGeometry(TILE, TILE, n, n); g.rotateX(-Math.PI / 2); g.translate(x0 + TILE / 2, 0, z0 + TILE / 2);
  const pos = g.attributes.position as THREE.BufferAttribute, col = new Float32Array(pos.count * 3), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i); pos.setY(i, groundHeight(x, z)); groundColor(x, z, c); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  // normals from the height field itself, so tile seams are invisible
  const nor = g.attributes.normal as THREE.BufferAttribute, e = 0.6;
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i), nx = groundHeight(x - e, z) - groundHeight(x + e, z), nz = groundHeight(x, z - e) - groundHeight(x, z + e), l = Math.hypot(nx, 2 * e, nz); nor.setXYZ(i, nx / l, (2 * e) / l, nz / l); }
  g.computeBoundingSphere(); g.computeBoundingBox();
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.name = "terrain"; return m;
}
export function buildTerrain(scene: THREE.Scene) {
  const mat = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), { rim: 0 });
  const tiles: THREE.Mesh[] = [];
  for (let z = -144; z < 144; z += TILE) for (let x = -128; x < 128; x += TILE) tiles.push(tile(x, z, mat));
  for (let z = -48; z < 80; z += TILE) for (let x = 128; x < 224; x += TILE) tiles.push(tile(x, z, mat));
  scene.add(...tiles);
  const water = (w: number, d: number, x: number, y: number, z: number, color: string, opacity = 0.9) => {
    const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, patch(new THREE.MeshStandardMaterial({ color, roughness: 0.15, transparent: true, opacity }), { rim: 0, water: true }));
    m.position.set(x, y, z); m.receiveShadow = true; m.name = "water"; scene.add(m); return m;
  };
  water(420, 90, 0, -0.32, SEA_Z + 41, "#3a9bb0"); water(420, 90, 0, -0.32, RIVER_Z - 41, "#2f8296");
  for (const w of WET) { const b = w.bb; water(b[1] - b[0], b[3] - b[2], (b[0] + b[1]) / 2, w.z.water!, (b[2] + b[3]) / 2, "#4c8f84", 0.78); }
  for (const p of POOLS) { // the waterfall pool: a disc that sits in the dip the terrain cut for it
    const r = Number(p.o?.r ?? 6) + 1.2, g = new THREE.CircleGeometry(r, 40); g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, patch(new THREE.MeshStandardMaterial({ color: "#3a9bb0", roughness: 0.15, transparent: true, opacity: 0.86 }), { rim: 0, water: true }));
    m.position.set(p.x, POOL_Y, p.z); m.receiveShadow = true; m.name = "water"; scene.add(m);
  }
  return { tiles };
}
/** water level of the waterfall pool (the falls object stands at this height so its foam sits on the water) */
export const POOL_Y = -0.2;
