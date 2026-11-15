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
import { groundHeight, terrainHeight, meshHeight, meshHeightMax, grassColor, turfAt, POOL_Y } from "./terrain";
import { BOUNDS, UNDER_X, PATHS, ROADS } from "./map/grove";
import type { EdgeKind } from "./map/types";
import { withCutout, OBJ_SCALE } from "../render/cutout";
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
/** glitch hunt (?glitch=1 only): every piece that goes into the chunks, with the thing it belongs to, so
 *  src/game/dev/glitch.ts can test bounds against the ground, the floors and each other (G1.5-12). Off in play. */
export type PieceOwner = { src: "placed" | "scatter" | "edge" | "house" | "prop"; k: string; x: number; z: number; yaw: number; s: number; id?: string; p?: Placed };
export const pieceRec = { on: typeof location !== "undefined" && /[?&]glitch\b/.test(location.search), owner: null as PieceOwner | null, list: [] as { o: PieceOwner; geo: THREE.BufferGeometry; m: THREE.Matrix4; mat: MatId; tall: boolean }[] };
/** add one piece to its chunk at a world transform (y defaults to just under the ground, so bases embed) */
export function addPiece(p: KitPiece, x: number, z: number, yaw: number, s = 1, y?: number, tilt?: THREE.Quaternion) {
  if (tilt) tmpM.compose(tv.set(x, y ?? groundHeight(x, z) - 0.04, z), tq.setFromAxisAngle(UP, yaw).premultiply(tilt), ts.setScalar(s));
  else tmpM.copy(M(x, y ?? groundHeight(x, z) - 0.04, z, 0, yaw, 0, s));
  const geo = p.geo.clone().applyMatrix4(tmpM);
  if (p.tall) tagObject(geo, x, z);
  if (pieceRec.on && pieceRec.owner) pieceRec.list.push({ o: pieceRec.owner, geo: p.geo, m: tmpM.clone(), mat: p.mat, tall: p.tall });
  const key = `${Math.floor(x / CH)},${Math.floor(z / CH)}`, sub = `${p.mat}|${p.tall ? 1 : 0}`;
  const c = chunks.get(key) ?? chunks.set(key, new Map()).get(key)!;
  (c.get(sub) ?? c.set(sub, []).get(sub)!).push(geo);
}
/** a tall piece's base, top and reach on every vertex (aObj, Int16): the see-through cuts it only when it stands in the
 *  sight line to the hero or the aim point (render/cutout.ts) */
function tagObject(geo: THREE.BufferGeometry, _x: number, _z: number) {
  // the piece's own footprint (a wall run is several modules: each is tagged at its own centre)
  geo.computeBoundingBox(); const b = geo.boundingBox!, x = (b.min.x + b.max.x) / 2, z = (b.min.z + b.max.z) / 2, reach = Math.max(b.max.x - x, b.max.z - z);
  const n = geo.attributes.position.count, a = new Int16Array(n * 4), cl = (v: number) => Math.max(-32767, Math.min(32767, Math.round(v)));
  const q = [cl(x * OBJ_SCALE[0]), cl(z * OBJ_SCALE[1]), cl(b.max.y * OBJ_SCALE[2]), cl(Math.max(0.1, reach) * OBJ_SCALE[3])];
  for (let i = 0; i < n; i++) a.set(q, i * 4);
  geo.setAttribute("aObj", new THREE.BufferAttribute(a, 4));
}
export function addPieces(ps: KitPiece[], x: number, z: number, yaw: number, s = 1, y?: number, tilt?: THREE.Quaternion) { for (const p of ps) addPiece(p, x, z, yaw, s, y, tilt); }
const tv = new THREE.Vector3(), tq = new THREE.Quaternion(), ts = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
/** small loose props settle onto the slope they stand on (up to 15 deg): flat-bottomed on a slope they lifted one side
 *  clear of the ground by up to 0.4 u (G1.5-12). Walls, fences, buildings and set pieces stay upright */
const LOOSE = /^(barrel_|crate_wood|crate_green|crate_gold|crate_stack|sack|banana_stash|log_bench|ammo_box|satchel|bottle|lantern$|bedroll|rubble_pile|sandbags|bomber_debris)/;
function settle(k: string, x: number, z: number): THREE.Quaternion | undefined {
  if (!LOOSE.test(k)) return undefined;
  const e = 0.6, gx = (meshHeight(x + e, z) - meshHeight(x - e, z)) / (2 * e), gz = (meshHeight(x, z + e) - meshHeight(x, z - e)) / (2 * e);
  if (Math.hypot(gx, gz) < 0.04) return undefined;
  const n = new THREE.Vector3(-gx, 1, -gz).normalize(), q = new THREE.Quaternion().setFromUnitVectors(UP, n), ang = 2 * Math.acos(Math.min(1, q.w)), max = (15 * Math.PI) / 180;
  return ang > max ? new THREE.Quaternion().slerp(q, max / ang) : q;
}
const tallMats: Partial<Record<MatId, THREE.Material>> = {};
function tallMaterial(id: MatId) {
  if (!tallMats[id]) { const base = kitMaterial(id) as THREE.MeshStandardMaterial; const m = base.clone(); m.onBeforeCompile = base.onBeforeCompile; m.customProgramCacheKey = base.customProgramCacheKey; tallMats[id] = withCutout(m); } // emissive too: a lantern's flame goes with its lantern (it floated on in the hole, G1.5-12)
  return tallMats[id]!;
}
/** the world is a few million triangles of non-indexed vertices: store normals as int8 and colours as uint8
 *  (20 bytes a vertex instead of 36) and drop the CPU copy once the GPU has it. Emissive colours go above 1, so they stay float */
function lean(g: THREE.BufferGeometry, packColor: boolean) {
  g.computeBoundingSphere(); g.computeBoundingBox();
  const n = g.attributes.normal.array as Float32Array, n8 = new Int8Array(n.length); for (let i = 0; i < n.length; i++) n8[i] = Math.round(Math.max(-1, Math.min(1, n[i])) * 127);
  g.setAttribute("normal", new THREE.BufferAttribute(n8, 3, true));
  if (packColor) { const c = g.attributes.color.array as Float32Array, c8 = new Uint8Array(c.length); for (let i = 0; i < c.length; i++) c8[i] = Math.round(Math.max(0, Math.min(1, c[i])) * 255); g.setAttribute("color", new THREE.BufferAttribute(c8, 3, true)); }
  for (const k of ["position", "normal", "color", "aObj"]) if (g.attributes[k]) (g.attributes[k] as THREE.BufferAttribute).onUpload(function (this: THREE.BufferAttribute) { (this as unknown as { array: unknown }).array = null; });
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
  driftwood: [0.75, 0.3], mushroom: [0.3, 0.3], audit: [0.3, 0.2], bomber_debris_a: [1.0, 0.8], bomber_debris_b: [0.9, 0.8], bomber_debris_c: [0.9, 0.8],
};
/** multipliers at full strength: trampled soil, soot, an oily stain */
export const SOIL: RGB = [0.34, 0.44, 0.38], SOOT: RGB = [0.05, 0.07, 0.08], STAIN: RGB = [0.16, 0.2, 0.19];
/** how far a contact shade reaches past a footprint of half size r: it is darkest on the contact line itself, where
 *  the PCF shadow leaves a lit collar, and fades out over about half a metre */
// contact shade reach past the footprint: ~1.15-1.35x (G1 council r2: the 2x halos read as dark rings even on the sunlit side)
const reach = (r: number) => Math.min(0.45, 0.12 + r * 0.12);
// lean each shade toward where the sun's shadow falls (stage.ts sun azimuth 160 deg: light from -z, shadows toward +z)
const SH_X = -Math.sin((160 * Math.PI) / 180), SH_Z = -Math.cos((160 * Math.PI) / 180);
/** a contact shade for a footprint of half size hx by hz (exported for per-raid props: the loot crates) */
export function contactShade(x: number, z: number, hx: number, hz: number, yaw: number, pow: number, k: number) { shade(x, z, hx, hz, yaw, pow, k); }
function shade(x: number, z: number, hx: number, hz: number, yaw: number, pow: number, k: number) {
  const m = reach(Math.max(hx, hz)), rx = hx + m, rz = hz + m;
  x += SH_X * m * 0.45; z += SH_Z * m * 0.45;
  blob(x, z, { rx, rz, yaw, pow, k, core: Math.min(0.9, (Math.min(hx / rx, hz / rz)) * 1.04) });
}
function contact(p: Placed) {
  const s = p.s ?? 1, yaw = p.yaw ?? 0, soft = SOFT[p.k];
  if (soft) { shade(p.x, p.z, soft[0] * s, soft[1] * s, yaw, 2.6, 0.7); return; }
  if (p.k === "pool" || p.k === "lily" || p.k === "waterfall" || p.k.startsWith("boardwalk") || p.k === "bridge" || p.k.startsWith("dock") || p.k === "raft") return;
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
  if (p.k === "bomber") { // churned earth under the wreck, soot where it broke its back, oil under the engines
    blob(p.x, p.z, { rx: 7.6, rz: 5.2, yaw, k: 0.5, tint: SOIL, pow: 2.6, core: 0.45, wob: 0.3 });
    const [bx, bz] = toWorld(p, 1.7, 0.5); blob(bx, bz, { rx: 2.6, rz: 2.0, yaw, k: 0.7, tint: SOOT, core: 0.35, wob: 0.55 });
    for (const lz of [-2.6, 2.5]) { const [ex, ez] = toWorld(p, -0.4, lz); blob(ex, ez, { rx: 1.6, rz: 1.3, yaw: lz, k: 0.75, tint: STAIN, core: 0.4, wob: 0.6 }); }
  }
  if (p.k === "well" || p.k === "vat" || p.k === "tractor") blob(p.x, p.z, { rx: p.k === "well" ? 2.8 : 3.6, k: 0.6, tint: SOIL, core: 0.5, wob: 0.3 });
}
/** building floors are 0.03 above the flattened ground: decals inside a footprint lie on the floor */
function decalSurface(x: number, z: number) {
  for (const h of houses) { const dx = x - h.p.x, dz = z - h.p.z; if (Math.abs(dx) > 14 || Math.abs(dz) > 14) continue; const c = Math.cos(h.p.yaw ?? 0), s = Math.sin(h.p.yaw ?? 0), lx = dx * c - dz * s - h.cx, lz = dx * s + dz * c - h.cz; if (Math.abs(lx) <= h.hx + 0.02 && Math.abs(lz) <= h.hz + 0.02) return h.y + 0.08 - 0.022; }
  const t = terrainHeight(x, z), g = groundHeight(x, z);
  if (g > t + 0.05) return g + 0.07; // on a pier the decal lies on the deck boards
  // the drawn terrain, at its highest within half a decal span: a decal triangle is up to ~1 u across and the tiles bend
  // under it, so lying on the 1 u field let humps poke through and the decal fight them (G1.5-12)
  return meshHeightMax(x, z);
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
  // worn footpaths, and wheel ruts down the dirt roads (patchy: they fade where the ground is hard)
  for (const path of PATHS) strip(path, { hw: 0.8, core: 0.32, k: 0.42, tint: SOIL, gaps: 0.26, seed: path[0][0] });
  for (const r of ROADS) {
    if (r.ground !== "dirt" || r.pts[0][0] > UNDER_X) continue;
    if (r.id === "bomber-furrow") { strip(r.pts, { hw: 2.6, core: 1.1, k: 0.55, tint: SOIL, caps: false }); for (const off of [-0.85, 0.9]) strip(offset(r.pts, off), { hw: 0.5, core: 0.16, k: 0.6, tint: SOOT, gaps: 0.22, seed: off }); continue; }
    if (r.w < 3) continue;
    for (const off of [-0.62, 0.62]) strip(offset(r.pts, off), { hw: 0.34, core: 0.1, k: 0.42, tint: SOIL, gaps: 0.42, seed: r.pts[0][0] + off });
  }
  return flushDecals(scene);
}
/** a polyline moved sideways by d */
function offset(pts: readonly (readonly [number, number])[], d: number): [number, number][] {
  return pts.map((q, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [q[0] - ((b[1] - a[1]) / l) * d, q[1] + ((b[0] - a[0]) / l) * d]; });
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
// ---------------------------------------------------------------- ground clearance (G1.5-12, Moo's flickering molasses puddle)
// Anything flat that lies on the ground (floor plates, bedrolls, ash beds, crash plates, deck boards, the vat's spill)
// was laid at the piece origin 0.04 u under the 1 u height field, so its face sat within a centimetre of the drawn
// terrain, on both sides of it: the two fought, and the low sun's shadow map striped it. Rule: such a face clears the
// highest drawn terrain under it by CLEAR (decals lie at +0.035, so a puddle covers them; a floor clears them too).
const CLEAR = 0.045;
/** up-facing faces within 0.15 u of a piece's origin: sample points (local x, y, z) per asset, built once */
const flatCache = new Map<string, number[]>();
function lowFlats(key: string | null, pieces: KitPiece[]) {
  let pts = key ? flatCache.get(key) : undefined; if (pts) return pts; pts = [];
  for (const p of pieces) {
    const a = p.geo.attributes.position, idx = p.geo.index, n = idx ? idx.count : a.count, v = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i + 2 < n; i += 3) {
      for (let k = 0; k < 3; k++) { const q = idx ? idx.getX(i + k) : i + k; v[k * 3] = a.getX(q); v[k * 3 + 1] = a.getY(q); v[k * 3 + 2] = a.getZ(q); }
      const ux = v[3] - v[0], uy = v[4] - v[1], uz = v[5] - v[2], wx = v[6] - v[0], wy = v[7] - v[1], wz = v[8] - v[2];
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, l = Math.hypot(nx, ny, nz);
      if (l < 0.006 || ny / l < 0.97 || Math.max(v[1], v[4], v[7]) > 0.2) continue; // up-facing, at least 0.003 m2, low (deck planks sit at 0.16)
      // the corners, and a grid over the face no coarser than 0.3 u, so terrain bumping up under a long plank is caught
      const n = Math.max(1, Math.ceil(Math.max(Math.hypot(ux, uz), Math.hypot(wx, wz)) / 0.3));
      for (let a = 0; a <= n; a++) for (let b = 0; a + b <= n; b++) pts.push(v[0] + (ux * a + wx * b) / n, v[1] + (uy * a + wy * b) / n, v[2] + (uz * a + wz * b) / n);
    }
  }
  if (key) flatCache.set(key, pts); return pts;
}
/** how far a piece placed at y must rise so its low flat faces clear the drawn terrain */
function clearance(pts: number[], x: number, z: number, yaw: number, s: number, y: number, tilt?: THREE.Quaternion) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(UP, yaw).premultiply(tilt ?? new THREE.Quaternion()), new THREE.Vector3(s, s, s)), v = new THREE.Vector3();
  let lift = 0;
  for (let i = 0; i < pts.length; i += 3) { v.set(pts[i], pts[i + 1], pts[i + 2]).applyMatrix4(m); lift = Math.max(lift, meshHeight(v.x, v.z) + CLEAR - (y + v.y)); }
  return lift;
}
/** flat sheets among a piece's moving parts (the vat's spill): lift each clear of the terrain and keep it out of the
 *  shadow map (a sheet a few cm up casts a shadow sliver round itself and stripes the ground under a low sun) */
function clearFlatParts(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3(), v = new THREE.Vector3();
  root.traverse((o) => {
    const m = o as THREE.Mesh; if (!m.isMesh) return;
    box.setFromObject(m); const h = box.max.y - box.min.y, wide = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
    // a sheet: low, and much wider than it is thick (the vat's spill is 6.8 x 5.6 u with 6 cm of relief)
    if (h > 0.12 || h > wide * 0.05 || box.min.y > meshHeight((box.min.x + box.max.x) / 2, (box.min.z + box.max.z) / 2) + 0.15) return;
    const pos = m.geometry.attributes.position; let need = -1e9;
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); need = Math.max(need, meshHeightMax(v.x, v.z, 0.4) + CLEAR - v.y); }
    if (need > 0) { const sy = m.parent ? m.parent.getWorldScale(v).y : 1; m.position.y += need / sy; m.updateMatrixWorld(); }
    m.castShadow = false;
  });
}
/** deck sections overlap their neighbours by a plank or two: each one rises in 4 mm steps until none of its flat faces
 *  (planks at 0.16, stringers at 0.1) lies within 8 mm of a flat face of an overlapping neighbour, so boards never fight */
const decks: { x: number; z: number; r: number; ys: number[] }[] = [];
let deckSide = 0;
function deckY(x: number, z: number, r: number, y: number, flats: number[]) {
  const lv = [...new Set(flats.filter((_, i) => i % 3 === 1).map((v) => Math.round(v * 1000) / 1000))], near = decks.filter((d) => Math.hypot(d.x - x, d.z - z) < d.r + r);
  for (let step = 0; step < 12; step++) { if (!near.some((d) => d.ys.some((q) => lv.some((l) => Math.abs(y + l - q) < 0.008)))) break; y += 0.004; }
  decks.push({ x, z, r, ys: lv.map((l) => y + l) }); return y;
}
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
    // a pinned variant (o.cv, map/colliders.ts) still draws the rng number the free pick would have, so every later piece keeps its look
    if (o.v === undefined && o.cv !== undefined) rng();
    const v = o.v ?? o.cv, ps = naturePiece(p.k, rng, s, v !== undefined ? { variant: Number(v) } : {});
    // leaf litter, shells and lily pads are flat cards: they clear the drawn ground like any floor plate (lilies float on their water)
    const y0 = y ?? groundHeight(p.x, p.z) - 0.04;
    addPieces(ps, p.x, p.z, yaw, 1, y !== undefined ? y : y0 + clearance(lowFlats(null, ps), p.x, p.z, yaw, 1, y0)); return;
  }
  if (p.k === "waterfall") { const w = waterfall(); w.position.set(p.x, POOL_Y, p.z); w.rotation.y = yaw; scene.add(w); if (p.id) placedParts.set(p.id, { root: w }); return; }
  let b: K.Built;
  if (p.k.startsWith("wall:")) b = K.wallSection(p.k.slice(5) as K.WallKind, { length: Number(o.len ?? 2.5), seed: pieceSeed++ });
  else if (p.k === "gate") b = K.gate(!!o.open);
  else b = K.asset(p.k);
  let y = o.y !== undefined ? Number(o.y) : groundHeight(p.x, p.z) - (o.deck ? DECK_Y : p.k === "bridge" ? 0.72 : 0.04);
  // o.tilt [x, z] radians: an authored lean (a collapsed span hanging into the water); o.lift: raised off the ground by this much
  const tilt = Array.isArray(o.tilt) ? new THREE.Quaternion().setFromEuler(new THREE.Euler(Number(o.tilt[0]), 0, Number(o.tilt[1]))) : o.y === undefined && !o.deck ? settle(p.k, p.x, p.z) : undefined;
  if (o.lift !== undefined) y += Number(o.lift);
  if (o.y === undefined && p.k !== "bridge") y += clearance(lowFlats(p.k.startsWith("wall:") ? null : p.k + (p.k === "gate" ? !!o.open : ""), b.pieces), p.x, p.z, yaw, s, y, tilt);
  if (o.deck && o.y === undefined) y = deckY(p.x, p.z, p.k === "boardwalk_ramp" ? 1.6 : Math.max(1.5, Number(o.len ?? 4) / 2 + 0.2), y, lowFlats(p.k, b.pieces));
  // collinear deck sections also share their side boards where they overlap: every other one sits 6 mm to the side
  const side = o.deck && p.k !== "boardwalk_ramp" ? (deckSide++ % 2 ? 0.006 : -0.006) : 0;
  addPieces(b.pieces, p.x + Math.sin(yaw) * side, p.z + Math.cos(yaw) * side, yaw, s, y, tilt); // (a section runs along its local x)
  if (b.parts.root.children.length) { b.parts.root.position.set(p.x, y, p.z); b.parts.root.quaternion.setFromAxisAngle(UP, yaw).premultiply(tilt ?? new THREE.Quaternion()); b.parts.root.scale.setScalar(s); scene.add(b.parts.root); clearFlatParts(b.parts.root); if (p.id) placedParts.set(p.id, b.parts); }
  else if (p.id) placedParts.set(p.id, b.parts);
}
export function buildPlaced(scene: THREE.Scene, list: Placed[], rng: () => number, src: "placed" | "scatter" = "placed") {
  if (!NATURE.size) for (const t of natureTypes()) NATURE.add(t.type);
  for (const p of list) { if (pieceRec.on) pieceRec.owner = { src, k: p.k, x: p.x, z: p.z, yaw: p.yaw ?? 0, s: p.s ?? 1, id: p.id, p }; buildOne(scene, p, rng); }
  pieceRec.owner = null;
}

// ---------------------------------------------------------------- the world edge (rule-dressed: visual only, it stands outside the outline)
const N = (type: string, rng: () => number, s: number) => naturePiece(type, rng, s);
/** dense foliage on the berm, rock under the cliffs, cave rock round the grotto. Camera side (the camera sits
 *  south-south-west) stays low next to the play space, so the edge never hides the hero */
export function dressEdges(rng: () => number) {
  const rr = (a: number, b: number) => a + rng() * (b - a), info = { kind: "jungle" as EdgeKind | "cave" };
  let n = 0;
  /** edge pieces are in the frame too: they count as objects (G1-21) */
  const add = (ps: KitPiece[], x: number, z: number, yaw: number, k: string) => { if (pieceRec.on) pieceRec.owner = { src: "edge", k: info.kind + ":" + k, x, z, yaw, s: 1 }; addPieces(ps, x, z, yaw); objects.push({ x, z, k, big: true }); n++; };
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
    if (kind === "river") { if (band < 2.2 && f < 0.3 && terrainHeight(x, z) > -0.5) { add(N(f < 0.2 ? "reeds" : "rockm", rng, rr(0.9, 1.4)), x, z, yaw, "edge"); } continue; }
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
  pieceRec.owner = null;
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
