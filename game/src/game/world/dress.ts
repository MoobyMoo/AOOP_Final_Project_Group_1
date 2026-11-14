// Builds the raid world's static scenery from the map (map v3): every placed piece (grove.ts + the rule scatter)
// becomes kit geometry, the world edge is dressed by rule (dense foliage on the berm, rock under the cliffs, cave
// rock round the grotto), and the grass is instanced. Everything is collected as KitPieces into 16 u chunks and
// merged into one mesh per (material, tall) per chunk, so the draw-call budget holds (advisor G1 items 3, 32, 37).
// Collision is not decided here: grid.ts builds it from the same placed list (map/colliders.ts).
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { KitPiece, MatId, Placed } from "../contracts";
import { bake, M, mergePieces, kitMaterial } from "./kitutil";
import { edgeDist, inside, roadDist, isUnder } from "./grid";
import { groundHeight, groundColor, isGrass, POOL_Y } from "./terrain";
import { BOUNDS, UNDER_X } from "./map/grove";
import type { EdgeKind } from "./map/types";
import { withCutout } from "../render/cutout";
import { patch } from "../render/shading";
import { fbm } from "./noise";
import { naturePiece, natureTypes, waterfall } from "./kit_nature";
import * as K from "./kit_build";

export type Builder = (rng: () => number, s: number) => KitPiece[];
export type KitSource = { palm: Builder; tree: Builder; bush: Builder; fern: Builder; bigLeaf: Builder; banana: Builder; rock: Builder; log: Builder; stump: Builder; caveRock: Builder; mushroom: Builder; caster: Builder };

/** convert an L1 kit Group (meshes with coloured materials) into mergeable pieces */
export function groupToPieces(g: THREE.Object3D, o: { tall?: boolean; blocks?: boolean; footprint?: number } = {}): KitPiece[] {
  g.updateMatrixWorld(true);
  const by = new Map<MatId, THREE.BufferGeometry[]>();
  g.traverse((c) => {
    const m = c as THREE.Mesh; if (!m.isMesh || m.name === "ink") return;
    const mm = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
    if (mm.transparent || (mm as unknown as THREE.MeshBasicMaterial).isMeshBasicMaterial && !mm.vertexColors) return;
    const id: MatId = mm.side === THREE.DoubleSide ? "foliage" : "matte";
    const col = mm.vertexColors ? null : "#" + mm.color.getHexString();
    let geo = m.geometry;
    if (mm.vertexColors && geo.attributes.color) { const gg = (geo.index ? geo.toNonIndexed() : geo.clone()); for (const k of Object.keys(gg.attributes)) if (!["position", "normal", "color"].includes(k)) gg.deleteAttribute(k); gg.applyMatrix4(m.matrixWorld); (by.get(id) ?? by.set(id, []).get(id)!).push(gg); return; }
    geo = bake(geo, col ?? "#ffffff", m.matrixWorld, !!mm.flatShading);
    (by.get(id) ?? by.set(id, []).get(id)!).push(geo);
  });
  return [...by].map(([mat, geos]) => ({ geo: geos.length === 1 ? geos[0] : mergeGeometries(geos, false)!, mat, footprint: o.footprint ?? 0.4, blocksMove: !!o.blocks, blocksShot: !!o.blocks, tall: !!o.tall }));
}

// ---------------------------------------------------------------- chunk store
const CH = 16;
const chunks = new Map<string, Map<string, THREE.BufferGeometry[]>>();
const tmpM = new THREE.Matrix4();
/** add one piece to its chunk at a world transform (y defaults to just under the ground, so bases embed) */
export function addPiece(p: KitPiece, x: number, z: number, yaw: number, s = 1, y?: number) {
  tmpM.copy(M(x, y ?? groundHeight(x, z) - 0.04, z, 0, yaw, 0, s));
  const geo = p.geo.clone().applyMatrix4(tmpM);
  const key = `${Math.floor(x / CH)},${Math.floor(z / CH)}`, sub = `${p.mat}|${p.tall ? 1 : 0}`;
  const c = chunks.get(key) ?? chunks.set(key, new Map()).get(key)!;
  (c.get(sub) ?? c.set(sub, []).get(sub)!).push(geo);
}
export function addPieces(ps: KitPiece[], x: number, z: number, yaw: number, s = 1, y?: number) { for (const p of ps) addPiece(p, x, z, yaw, s, y); }
const tallMats: Partial<Record<MatId, THREE.Material>> = {};
function tallMaterial(id: MatId) {
  if (!tallMats[id]) { const base = kitMaterial(id) as THREE.MeshStandardMaterial; const m = base.clone(); m.onBeforeCompile = base.onBeforeCompile; m.customProgramCacheKey = base.customProgramCacheKey; tallMats[id] = id === "emissive" ? m : withCutout(m); }
  return tallMats[id]!;
}
/** merge every chunk into meshes and add them to the scene; returns stats */
export function flushChunks(scene: THREE.Scene) {
  let meshes = 0, tris = 0;
  for (const [, subs] of chunks) {
    const g = new THREE.Group(); g.name = "chunk";
    for (const [sub, geos] of subs) {
      const [id, tall] = sub.split("|") as [MatId, string], merged = mergeGeometries(geos, false)!;
      for (const q of geos) q.dispose();
      const m = new THREE.Mesh(merged, tall === "1" ? tallMaterial(id) : kitMaterial(id));
      m.castShadow = id !== "emissive"; m.receiveShadow = id !== "emissive"; g.add(m); meshes++; tris += merged.attributes.position.count / 3;
    }
    scene.add(g);
  }
  chunks.clear(); return { meshes, tris: Math.round(tris) };
}

// ---------------------------------------------------------------- placed pieces
/** every object that stands in the world, for the density count (G1-21) and the map screen */
export const objects: { x: number; z: number; k: string; big: boolean }[] = [];
/** kinds too small to count as a "readable object" in a gameplay frame */
const SMALL = new Set(["flowers", "litter", "pebbles", "shells", "rocks", "lily", "beachgrass", "mushroom", "ammo_box", "bedroll_a", "bedroll_b", "ruin_floor_a", "ruin_floor_b", "ruin_floor_c", "lantern", "satchel", "sack"]);
/** animated / attach-point nodes of placed pieces, by the Placed id (props.ts hooks gameplay onto them) */
export const placedParts = new Map<string, Record<string, THREE.Object3D>>();
const NATURE = new Set<string>();
/** deck height of the boardwalk sections above their origin: they are sunk by this so the deck sits on the causeway */
const DECK_Y = 0.52;
/** kinds built elsewhere (interactive props, buildings) or that have no geometry */
const SKIP = new Set(["pool", "zip_tower", "zip_end", "vine_door", "ground", "light"]);
let pieceSeed = 1;
/** build one placed instance into the chunk store; nodes with moving parts go to the scene */
function buildOne(scene: THREE.Scene, p: Placed, rng: () => number) {
  if (SKIP.has(p.k) || p.k.startsWith("building:")) return;
  const s = p.s ?? 1, yaw = p.yaw ?? 0, o = p.o ?? {};
  objects.push({ x: p.x, z: p.z, k: p.k, big: !SMALL.has(p.k) });
  if (NATURE.has(p.k)) {
    const y = o.water !== undefined && p.k === "lily" ? Number(o.water) - 0.03 : undefined;
    addPieces(naturePiece(p.k, rng, s, o.v !== undefined ? { variant: Number(o.v) } : {}), p.x, p.z, yaw, 1, y); return;
  }
  if (p.k === "waterfall") { const w = waterfall(); w.position.set(p.x, POOL_Y, p.z); w.rotation.y = yaw; scene.add(w); if (p.id) placedParts.set(p.id, { root: w }); return; }
  let b: K.Built;
  if (p.k.startsWith("wall:")) b = K.wallSection(p.k.slice(5) as K.WallKind, { length: Number(o.len ?? 2.5), seed: pieceSeed++ });
  else if (p.k === "gate") b = K.gate(!!o.open);
  else b = K.asset(p.k);
  const y = o.y !== undefined ? Number(o.y) : groundHeight(p.x, p.z) - (o.deck ? DECK_Y : p.k === "bridge" ? 0.42 : 0.04);
  addPieces(b.pieces, p.x, p.z, yaw, s, y);
  if (b.parts.root.children.length) { b.parts.root.position.set(p.x, y, p.z); b.parts.root.rotation.y = yaw; b.parts.root.scale.setScalar(s); scene.add(b.parts.root); if (p.id) placedParts.set(p.id, b.parts); }
  else if (p.id) placedParts.set(p.id, b.parts);
}
export function buildPlaced(scene: THREE.Scene, list: Placed[], rng: () => number) {
  if (!NATURE.size) for (const t of natureTypes()) NATURE.add(t.type);
  for (const p of list) buildOne(scene, p, rng);
}

// ---------------------------------------------------------------- the world edge (rule-dressed: visual only, it stands outside the outline)
const N = (type: string, rng: () => number, s: number) => naturePiece(type, rng, s);
/** dense foliage on the berm, rock under the cliffs, cave rock round the grotto. Camera side (the camera sits
 *  south-south-west) stays low next to the play space, so the edge never hides the hero */
export function dressEdges(rng: () => number) {
  const rr = (a: number, b: number) => a + rng() * (b - a), info = { kind: "jungle" as EdgeKind | "cave" };
  let n = 0;
  const STEP = 1.9;
  for (let gz = BOUNDS.minZ - 14; gz < BOUNDS.maxZ + 14; gz += STEP) for (let gx = BOUNDS.minX - 14; gx < BOUNDS.maxX + 6; gx += STEP) {
    const x = gx + rng() * STEP, z = gz + rng() * STEP, d = edgeDist(x, z, info), band = -d, f = rng(), yaw = rng() * 6.28;
    if (band < 0.3 || band > 16) continue;
    const kind = info.kind;
    if (kind === "cave") {
      if (band < 2.6) { if (f < 0.7) { addPieces(N("caverock", rng, rr(0.9, 1.5) * (1 + band * 0.35)), x, z, yaw); n++; } else if (f < 0.85) { addPieces(N("stalagmite", rng, rr(0.9, 1.6)), x, z, yaw); n++; } }
      else if (band < 7 && f < 0.16) { addPieces(N("caverock", rng, rr(1.8, 2.8)), x, z, yaw); n++; }
      continue;
    }
    if (kind === "coast") { if (band < 5 && f < 0.035) { addPieces(N(f < 0.02 ? "rockm" : "rockl", rng, rr(0.8, 1.3)), x, z, yaw); n++; } continue; }
    if (kind === "river") { if (band < 2.2 && f < 0.3) { addPieces(N(f < 0.2 ? "reeds" : "rockm", rng, rr(0.9, 1.4)), x, z, yaw); n++; } continue; }
    const front = inside(x + 2.1, z - 3.6) || inside(x + 3.9, z - 6.7);
    if (kind === "cliff") {
      if (band < 4.2) { if (f < 0.62) { addPieces(N(f < 0.2 ? "boulders" : "rockl", rng, (front ? rr(1.0, 1.5) : rr(1.6, 2.7)) * (f < 0.2 ? 0.8 : 1)), x, z, yaw); n++; } else if (f < 0.8 && !front) { addPieces(N(f < 0.7 ? "bush" : "fern", rng, rr(1, 1.5)), x, z, yaw); n++; } }
      else if (f < (front ? 0.1 : 0.2)) { addPieces(N(f < 0.06 ? "rockl" : "treefar", rng, f < 0.06 ? rr(1.6, 2.6) : rr(1.3, 1.8)), x, z, yaw); n++; }
      continue;
    }
    // jungle
    if (front && band < 4.2) { if (f < 0.55) { addPieces(N(f < 0.22 ? "fern" : f < 0.4 ? "bush" : "bigleaf", rng, rr(0.8, 1.2)), x, z, yaw); n++; } continue; }
    if (band < 1.8) { if (f < 0.7) { addPieces(N(f < 0.25 ? "bush" : f < 0.42 ? "fern" : f < 0.56 ? "bigleaf" : "banana", rng, rr(0.9, 1.4)), x, z, yaw); n++; } }
    else if (band < 6) { if (f < 0.55) { addPieces(N(f < 0.22 ? "palm" : f < 0.44 ? "tree" : "bush", rng, f < 0.44 ? rr(0.95, 1.25) : rr(1.3, 1.8)), x, z, yaw); n++; } }
    else if (f < 0.13) { addPieces(N("treefar", rng, rr(1.3, 1.9)), x, z, yaw); n++; }
  }
  return n;
}

// ---------------------------------------------------------------- grass: instanced tufts per chunk, root colour = ground colour, wind + push (L1 shader)
/** noGrass(x, z): true where a floor or a deck covers the ground (building footprints) */
export function buildGrass(scene: THREE.Scene, rng: () => number, tuft: THREE.BufferGeometry, noGrass: (x: number, z: number) => boolean = () => false) {
  const per = new Map<string, number[][]>();
  const W = BOUNDS.maxX - BOUNDS.minX, H = BOUNDS.maxZ - BOUNDS.minZ, samples = Math.round(W * H * 3.4);
  for (let i = 0; i < samples; i++) {
    const x = BOUNDS.minX + rng() * W, z = BOUNDS.minZ + rng() * H; if (x > UNDER_X - 8) continue;
    const d = edgeDist(x, z); if (d < 0.4 || !isGrass(x, z)) continue;
    const rd = roadDist(x, z); if (rd < 0.5) continue;
    const dens = fbm(x * 0.1 + 3, z * 0.1); if (dens < 0.44) continue;
    const edgeK = THREE.MathUtils.smoothstep(Math.min(d, rd + 0.4), 0.4, 2.2); if (rng() > edgeK) continue; // thin out toward edges and roads, no hard lines
    if (noGrass(x, z)) continue;
    const key = `${Math.floor(x / CH)},${Math.floor(z / CH)}`; (per.get(key) ?? per.set(key, []).get(key)!).push([x, z, (0.7 + dens * 0.9) * (0.6 + edgeK * 0.4)]);
  }
  const mat = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), { rim: 0.25, grass: true });
  const m = new THREE.Matrix4(), c = new THREE.Color(); let total = 0;
  for (const [, spots] of per) {
    const im = new THREE.InstancedMesh(tuft, mat, spots.length); im.name = "grass";
    spots.forEach(([x, z, s], i) => { m.makeScale(s, s * (0.6 + rng() * 0.8), s).setPosition(x, groundHeight(x, z), z); im.setMatrixAt(i, m); groundColor(x, z, c); c.multiplyScalar(1.04); im.setColorAt(i, c); });
    im.computeBoundingSphere(); im.receiveShadow = true; scene.add(im); total += spots.length;
  }
  return total;
}
void isUnder; void mergePieces;
