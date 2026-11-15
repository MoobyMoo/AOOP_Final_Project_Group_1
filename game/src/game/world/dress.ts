// Builds the raid world's static scenery from the map (map v3): every placed piece (grove.ts + the rule scatter)
// becomes kit geometry, the world edge is dressed by rule (dense foliage on the berm, rock under the cliffs, cave
// rock round the grotto), and the grass is instanced. Everything is collected as KitPieces into 16 u chunks and
// merged into one mesh per (material, tall) per chunk, so the draw-call budget holds (advisor G1 items 3, 32, 37).
// Collision is not decided here: grid.ts builds it from the same placed list (map/colliders.ts).
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { KitPiece, MatId, Placed } from "../contracts";
import { bake, M, mergePieces, kitMaterial } from "./kitutil";
import { edgeDist, inside, isUnder } from "./grid";
import { groundHeight, grassColor, turfAt, POOL_Y } from "./terrain";
import { BOUNDS, UNDER_X } from "./map/grove";
import type { EdgeKind } from "./map/types";
import { withCutout } from "../render/cutout";
import { patch } from "../render/shading";
import { fbm } from "./noise";
import { naturePiece, natureTypes, waterfall } from "./kit_nature";
import * as K from "./kit_build";
import { collidersFor } from "./map/colliders";
import { toWorld } from "./map/types";
import { blob, strip, flushDecals, setDecalSurface, type RGB } from "./decals";
import { houses } from "./buildings";

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
/** the world is a few million triangles of non-indexed vertices: store normals as int8 and colours as uint8
 *  (20 bytes a vertex instead of 36) and drop the CPU copy once the GPU has it. Emissive colours go above 1, so they stay float */
function lean(g: THREE.BufferGeometry, packColor: boolean) {
  g.computeBoundingSphere(); g.computeBoundingBox();
  const n = g.attributes.normal.array as Float32Array, n8 = new Int8Array(n.length); for (let i = 0; i < n.length; i++) n8[i] = Math.round(Math.max(-1, Math.min(1, n[i])) * 127);
  g.setAttribute("normal", new THREE.BufferAttribute(n8, 3, true));
  if (packColor) { const c = g.attributes.color.array as Float32Array, c8 = new Uint8Array(c.length); for (let i = 0; i < c.length; i++) c8[i] = Math.round(Math.max(0, Math.min(1, c[i])) * 255); g.setAttribute("color", new THREE.BufferAttribute(c8, 3, true)); }
  for (const k of ["position", "normal", "color"]) (g.attributes[k] as THREE.BufferAttribute).onUpload(function (this: THREE.BufferAttribute) { (this as unknown as { array: unknown }).array = null; });
  return g;
}
/** merge every chunk into meshes and add them to the scene; returns stats */
export function flushChunks(scene: THREE.Scene) {
  let meshes = 0, tris = 0;
  for (const [, subs] of chunks) {
    const g = new THREE.Group(); g.name = "chunk";
    for (const [sub, geos] of subs) {
      const [id, tall] = sub.split("|") as [MatId, string], merged = lean(mergeGeometries(geos, false)!, id !== "emissive");
      for (const q of geos) q.dispose();
      const m = new THREE.Mesh(merged, tall === "1" ? tallMaterial(id) : kitMaterial(id));
      m.castShadow = id !== "emissive"; m.receiveShadow = id !== "emissive"; g.add(m); meshes++; tris += merged.attributes.position.count / 3;
    }
    scene.add(g);
  }
  chunks.clear();
  const dc = dressGround(scene);
  return { meshes: meshes + dc.meshes, tris: Math.round(tris) };
}

// ---------------------------------------------------------------- grounding (G1 council fix round 1, F2 item 1)
// Every solid thing gets a soft contact shade on the ground it stands on, sized from its collider (1.2x the footprint),
// and every wall a shade along its base. They are decals (decals.ts): merged per 32 u tile, no draw call per prop.
/** footprints (half extents) of dressing that has no collider */
const SOFT: Record<string, [number, number]> = {
  sack: [0.46, 0.46], lantern: [0.26, 0.26], bedroll_a: [0.9, 0.42], bedroll_b: [0.9, 0.42], satchel: [0.42, 0.34], ammo_box: [0.4, 0.28], bottle: [0.22, 0.22],
  driftwood: [0.75, 0.3], mushroom: [0.3, 0.3], audit: [0.3, 0.2], raft: [1.5, 1.7],
};
/** multipliers at full strength: trampled soil, soot, an oily stain */
export const SOIL: RGB = [0.34, 0.44, 0.38], SOOT: RGB = [0.05, 0.07, 0.08], STAIN: RGB = [0.16, 0.2, 0.19];
/** how far a contact shade reaches past a footprint of half size r: it is darkest on the contact line itself, where
 *  the PCF shadow leaves a lit collar, and fades out over about half a metre */
const reach = (r: number) => Math.min(0.95, 0.42 + r * 0.22);
function shade(x: number, z: number, hx: number, hz: number, yaw: number, pow: number, k: number) {
  const m = reach(Math.max(hx, hz)), rx = hx + m, rz = hz + m;
  blob(x, z, { rx, rz, yaw, pow, k, core: Math.min(0.9, (Math.min(hx / rx, hz / rz)) * 1.04) });
}
function contact(p: Placed) {
  const s = p.s ?? 1, yaw = p.yaw ?? 0, soft = SOFT[p.k];
  if (soft) { shade(p.x, p.z, soft[0] * s, soft[1] * s, yaw, 2.6, 0.7); return; }
  if (p.k === "pool" || p.k === "lily" || p.k === "waterfall" || p.k.startsWith("boardwalk") || p.k === "bridge") return;
  const cs = collidersFor(p.k, p.o); if (!cs) return;
  for (const c of cs) {
    if (!c.move) continue;
    if (c.t === "circle") { const [wx, wz] = toWorld(p, c.x, c.z), r = c.r * s; shade(wx, wz, r, r, 0, 2, r > 1.5 ? 0.7 : 0.82); }
    else if (c.t === "box") {
      const [wx, wz] = toWorld(p, c.x, c.z), long = Math.max(c.w, c.d) * s;
      if (p.k.startsWith("wall:")) { const h = (c.d * s) / 2, [ax, az] = toWorld(p, 0, -h), [bx, bz] = toWorld(p, 0, h), th = (c.w * s) / 2; strip([[ax, az], [bx, bz]], { hw: th + 0.75, core: th, k: p.k === "wall:fence" ? 0.5 : 0.78 }); }
      else shade(wx, wz, (c.w * s) / 2, (c.d * s) / 2, yaw + (c.yaw ?? 0), 4, long > 3 ? 0.7 : 0.82);
    } else { const [ax, az] = toWorld(p, c.ax, c.az), [bx, bz] = toWorld(p, c.bx, c.bz), th = (c.thick * s) / 2; strip([[ax, az], [bx, bz]], { hw: th + 0.8, core: th, k: 0.75 }); }
  }
  // lived-in ground: soot round a fire, trampled soil at a tent mouth and under a tarp, a stain under rusty drums
  if (p.k === "campfire") { blob(p.x, p.z, { rx: 3.1, k: 0.55, tint: SOIL, core: 0.4, wob: 0.3 }); blob(p.x, p.z, { rx: 1.7, k: 0.9, tint: SOOT, core: 0.55, wob: 0.5 }); }
  if (p.k === "tent_a" || p.k === "tent_b") { const d = p.k === "tent_a" ? 2.6 : 2.0, [mx, mz] = toWorld(p, 0, d); blob(mx, mz, { rx: p.k === "tent_a" ? 2.1 : 1.6, rz: 1.7, yaw, k: 0.75, tint: SOIL, core: 0.4, wob: 0.4 }); }
  if (p.k === "tarp" || p.k === "lean_to") blob(p.x, p.z, { rx: 3.0, rz: 2.7, yaw, k: 0.6, tint: SOIL, pow: 4, core: 0.6, wob: 0.25 });
  if (p.k === "barrel_rust") blob(p.x + 0.2, p.z + 0.15, { rx: 1.35, rz: 1.1, yaw: p.x * 3.7, k: 0.7, tint: STAIN, core: 0.45, wob: 0.6 });
  if (p.k === "well" || p.k === "vat" || p.k === "tractor") blob(p.x, p.z, { rx: p.k === "well" ? 2.8 : 3.6, k: 0.6, tint: SOIL, core: 0.5, wob: 0.3 });
}
/** building floors are 0.03 above the flattened ground: decals inside a footprint lie on the floor */
function decalSurface(x: number, z: number) {
  for (const h of houses) { const dx = x - h.p.x, dz = z - h.p.z; if (Math.abs(dx) > 14 || Math.abs(dz) > 14) continue; const c = Math.cos(h.p.yaw ?? 0), s = Math.sin(h.p.yaw ?? 0), lx = dx * c - dz * s - h.cx, lz = dx * s + dz * c - h.cz; if (Math.abs(lx) <= h.hx + 0.02 && Math.abs(lz) <= h.hz + 0.02) return h.y + 0.08 - 0.022; }
  return groundHeight(x, z);
}
/** wall bases and furniture inside and round the buildings, then merge every decal into its tile */
function dressGround(scene: THREE.Scene) {
  setDecalSurface(decalSurface);
  for (const h of houses) {
    const doorIds = new Set(h.def.doors.map((d) => d.id));
    for (const c of h.def.colliders) {
      if (c.id !== undefined && doorIds.has(c.id)) continue; // a doorway keeps its light floor
      if (c.t === "seg") { const [ax, az] = toWorld(h.p, c.ax, c.az), [bx, bz] = toWorld(h.p, c.bx, c.bz), th = Math.max(c.thick, 0.2) / 2; strip([[ax, az], [bx, bz]], { hw: th + 0.7, core: th, k: c.shot || c.low ? 0.75 : 0.5, caps: false }); }
      else if (c.t === "circle") { const [wx, wz] = toWorld(h.p, c.x, c.z); shade(wx, wz, c.r, c.r, 0, 2, 0.72); }
      else { const [wx, wz] = toWorld(h.p, c.x, c.z); shade(wx, wz, c.w / 2, c.d / 2, (h.p.yaw ?? 0) + (c.yaw ?? 0), 4, 0.72); }
    }
  }
  return flushDecals(scene);
}

// ---------------------------------------------------------------- placed pieces
/** every object that stands in the world, for the density count (G1-21) and the map screen */
export const objects: { x: number; z: number; k: string; big: boolean }[] = [];
/** kinds too small to count as a "readable object" in a gameplay frame */
const SMALL = new Set(["flowers", "litter", "pebbles", "shells", "ammo_box", "ruin_floor_a", "ruin_floor_b", "ruin_floor_c"]);
/** module length of wall runs: a run counts one object per module (a palisade section, a fence panel) */
const MODULE: Record<string, number> = { palisade: 2.5, stone: 1.85, hull: 2.5, rock: 2.1, fence: 2.5 };
/** animated / attach-point nodes of placed pieces, by the Placed id (props.ts hooks gameplay onto them) */
export const placedParts = new Map<string, Record<string, THREE.Object3D>>();
const NATURE = new Set<string>();
/** deck height of the boardwalk sections above their origin: they are sunk by this so the deck sits on the causeway */
const DECK_Y = 0.1;
/** kinds built elsewhere (interactive props, buildings) or that have no geometry */
const SKIP = new Set(["pool", "zip_tower", "zip_end", "vine_door", "ground", "light"]);
let pieceSeed = 1;
/** build one placed instance into the chunk store; nodes with moving parts go to the scene */
function buildOne(scene: THREE.Scene, p: Placed, rng: () => number) {
  if (SKIP.has(p.k) || p.k.startsWith("building:")) return;
  const s = p.s ?? 1, yaw = p.yaw ?? 0, o = p.o ?? {};
  if (p.k.startsWith("wall:")) { // one countable object per module along the run
    const len = Number(o.len ?? 2.5), n = Math.max(1, Math.round(len / (MODULE[p.k.slice(5)] ?? 2.5)));
    for (let i = 0; i < n; i++) { const t = (i + 0.5) / n - 0.5; objects.push({ x: p.x + Math.sin(yaw) * len * t, z: p.z + Math.cos(yaw) * len * t, k: p.k, big: true }); }
  } else objects.push({ x: p.x, z: p.z, k: p.k, big: !SMALL.has(p.k) && !(p.k === "rocks" && s < 0.8) });
  contact(p);
  if (NATURE.has(p.k)) {
    const y = o.water !== undefined && p.k === "lily" ? Number(o.water) - 0.03 : undefined;
    addPieces(naturePiece(p.k, rng, s, o.v !== undefined ? { variant: Number(o.v) } : {}), p.x, p.z, yaw, 1, y); return;
  }
  if (p.k === "waterfall") { const w = waterfall(); w.position.set(p.x, POOL_Y, p.z); w.rotation.y = yaw; scene.add(w); if (p.id) placedParts.set(p.id, { root: w }); return; }
  let b: K.Built;
  if (p.k.startsWith("wall:")) b = K.wallSection(p.k.slice(5) as K.WallKind, { length: Number(o.len ?? 2.5), seed: pieceSeed++ });
  else if (p.k === "gate") b = K.gate(!!o.open);
  else b = K.asset(p.k);
  const y = o.y !== undefined ? Number(o.y) : groundHeight(p.x, p.z) - (o.deck ? DECK_Y : p.k === "bridge" ? 0.72 : 0.04);
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
  /** edge pieces are in the frame too: they count as objects (G1-21) */
  const add = (ps: KitPiece[], x: number, z: number, yaw: number, k: string) => { addPieces(ps, x, z, yaw); objects.push({ x, z, k, big: true }); n++; };
  const STEP = 1.9;
  for (let gz = BOUNDS.minZ - 14; gz < BOUNDS.maxZ + 14; gz += STEP) for (let gx = BOUNDS.minX - 14; gx < BOUNDS.maxX + 6; gx += STEP) {
    const x = gx + rng() * STEP, z = gz + rng() * STEP, d = edgeDist(x, z, info), band = -d, f = rng(), yaw = rng() * 6.28;
    if (band < 0.3 || band > 16) continue;
    const kind = info.kind;
    if (kind === "cave") {
      if (band < 2.6) { if (f < 0.7) { add(N("caverock", rng, rr(0.9, 1.5) * (1 + band * 0.35)), x, z, yaw, "edge"); } else if (f < 0.85) { add(N("stalagmite", rng, rr(0.9, 1.6)), x, z, yaw, "edge"); } }
      else if (band < 7 && f < 0.16) { add(N("caverock", rng, rr(1.8, 2.8)), x, z, yaw, "edge"); }
      continue;
    }
    if (kind === "coast") { if (band < 5 && f < 0.035) { add(N(f < 0.02 ? "rockm" : "rockl", rng, rr(0.8, 1.3)), x, z, yaw, "edge"); } continue; }
    if (kind === "river") { if (band < 2.2 && f < 0.3) { add(N(f < 0.2 ? "reeds" : "rockm", rng, rr(0.9, 1.4)), x, z, yaw, "edge"); } continue; }
    const front = inside(x + 2.1, z - 3.6) || inside(x + 3.9, z - 6.7);
    if (kind === "cliff") {
      if (band < 4.2) { if (f < 0.62) { add(N(f < 0.2 ? "boulders" : "rockl", rng, (front ? rr(1.0, 1.5) : rr(1.6, 2.7)) * (f < 0.2 ? 0.8 : 1)), x, z, yaw, "edge"); } else if (f < 0.8 && !front) { add(N(f < 0.7 ? "bush" : "fern", rng, rr(1, 1.5)), x, z, yaw, "edge"); } }
      else if (f < (front ? 0.1 : 0.2)) { add(N(f < 0.06 ? "rockl" : "treefar", rng, f < 0.06 ? rr(1.6, 2.6) : rr(1.3, 1.8)), x, z, yaw, "edge"); }
      continue;
    }
    // jungle
    if (front && band < 4.2) { if (f < 0.55) { add(N(f < 0.22 ? "fern" : f < 0.4 ? "bush" : "bigleaf", rng, rr(0.8, 1.2)), x, z, yaw, "edge"); } continue; }
    if (band < 1.8) { if (f < 0.7) { add(N(f < 0.25 ? "bush" : f < 0.42 ? "fern" : f < 0.56 ? "bigleaf" : "banana", rng, rr(0.9, 1.4)), x, z, yaw, "edge"); } }
    else if (band < 6) { if (f < 0.55) { add(N(f < 0.22 ? "palm" : f < 0.44 ? "tree" : "bush", rng, f < 0.44 ? rr(0.95, 1.25) : rr(1.3, 1.8)), x, z, yaw, "edge"); } }
    else if (f < 0.13) { add(N("treefar", rng, rr(1.3, 1.9)), x, z, yaw, "edge"); }
  }
  return n;
}

// ---------------------------------------------------------------- grass: instanced tufts per chunk, root colour = ground colour, wind + push (L1 shader)
/** noGrass(x, z): true where a floor or a deck covers the ground (building footprints) */
export function buildGrass(scene: THREE.Scene, rng: () => number, tuft: THREE.BufferGeometry, noGrass: (x: number, z: number) => boolean = () => false) {
  const per = new Map<string, number[][]>();
  const W = BOUNDS.maxX - BOUNDS.minX, H = BOUNDS.maxZ - BOUNDS.minZ, samples = Math.round(W * H * 3.4);
  // Turf runs at full density right up to its edge and a fringe of smaller tufts spills 0.3 to 0.6 u onto the bare
  // ground (Duckov ref_291: a crisp grass edge with tufts over the dirt). One unit of turf mask is 2.4 u of ground.
  const SPILL = 0.24;
  for (let i = 0; i < samples; i++) {
    const x = BOUNDS.minX + rng() * W, z = BOUNDS.minZ + rng() * H; if (x > UNDER_X - 8) continue;
    const d = edgeDist(x, z); if (d < 0.4) continue;
    const t = turfAt(x, z); if (t < 0.5 - SPILL) continue;
    const rim = t < 0.72, dens = fbm(x * 0.1 + 3, z * 0.1);
    if (!rim && dens < 0.44) continue;
    if (rim && rng() > (t < 0.5 ? 0.3 + (t - 0.5 + SPILL) / SPILL * 0.5 : 0.92)) continue; // the fringe thins out as it leaves the turf
    const edgeK = THREE.MathUtils.smoothstep(d, 0.4, 2.2); if (rng() > edgeK) continue; // thin out toward the world edge
    if (noGrass(x, z) || groundHeight(x, z) < -0.06) continue; // not on floors, not under water
    const size = t < 0.5 ? 0.5 + (t - 0.5 + SPILL) / SPILL * 0.35 : rim ? 0.85 + dens * 0.5 : 0.7 + dens * 0.9;
    const key = `${Math.floor(x / CH)},${Math.floor(z / CH)}`; (per.get(key) ?? per.set(key, []).get(key)!).push([x, z, size * (0.6 + edgeK * 0.4)]);
  }
  const mat = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), { rim: 0.25, grass: true });
  const m = new THREE.Matrix4(), c = new THREE.Color(); let total = 0;
  for (const [, spots] of per) {
    const im = new THREE.InstancedMesh(tuft, mat, spots.length); im.name = "grass";
    spots.forEach(([x, z, s], i) => { m.makeScale(s, s * (0.6 + rng() * 0.8), s).setPosition(x, groundHeight(x, z), z); im.setMatrixAt(i, m); grassColor(x, z, c); c.multiplyScalar(1.04); im.setColorAt(i, c); });
    im.computeBoundingSphere(); im.receiveShadow = true; scene.add(im); total += spots.length;
  }
  return total;
}
void isUnder; void mergePieces;
