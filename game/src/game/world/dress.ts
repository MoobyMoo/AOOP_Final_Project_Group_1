// Dresses the raid map from layout shapes: a layered jungle wall along the play-space edge, understory, rocks and
// logs inside clearings, grass, canopy shadow casters. Everything is collected as KitPieces into 16 u chunks and
// merged into one mesh per (material, tall) per chunk, so the draw-call budget holds (advisor G1 items 3, 32, 37).
// Builders come from a KitSource: placeholders from the L1 kit now, Fable's kit_nature/kit_build when they land.
import * as THREE from "three";
import type { KitPiece, MatId } from "../contracts";
import { bake, M, mergePieces, kitMaterial } from "./kitutil";
import { openness, nearestTrailDist, block, areaAt, isUnder } from "./grid";
import { groundHeight, groundColor } from "./terrain";
import { CRATES, SPAWNS, POI, PORTALS, LANDMARKS, CLEARINGS, BOUNDS } from "./layout";
import { withCutout } from "../render/cutout";
import { patch } from "../render/shading";
import { fbm } from "./noise";

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
  return [...by].map(([mat, geos]) => {
    const geo = geos.length === 1 ? geos[0] : (mergeAll(geos));
    return { geo, mat, footprint: o.footprint ?? 0.4, blocksMove: !!o.blocks, blocksShot: !!o.blocks, tall: !!o.tall };
  });
}
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
const mergeAll = (geos: THREE.BufferGeometry[]) => mergeGeometries(geos, false)!;

// ---- chunk store
const CH = 16;
type Bucket = { pieces: KitPiece[] };
const chunks = new Map<string, Map<string, Bucket>>();
export function addPiece(p: KitPiece, x: number, z: number, yaw: number, s = 1, y?: number) {
  const m = M(x, y ?? groundHeight(x, z) - 0.04, z, 0, yaw, 0, s);
  const geo = p.geo.clone().applyMatrix4(m);
  const key = `${Math.floor(x / CH)},${Math.floor(z / CH)}`, sub = `${p.mat}|${p.tall ? 1 : 0}`;
  const c = chunks.get(key) ?? chunks.set(key, new Map()).get(key)!;
  (c.get(sub) ?? c.set(sub, { pieces: [] }).get(sub)!).pieces.push({ ...p, geo });
}
export function addPieces(ps: KitPiece[], x: number, z: number, yaw: number, s = 1, y?: number) {
  for (const p of ps) addPiece(p, x, z, yaw, s, y);
  const fp = Math.max(...ps.map((p) => (p.blocksMove ? p.footprint : 0))) * s;
  if (fp > 0) block(x, z, fp, ps.some((p) => p.blocksShot), ps.some((p) => p.tall && p.blocksMove));
}
const tallMats: Partial<Record<MatId, THREE.Material>> = {};
function tallMaterial(id: MatId) {
  if (!tallMats[id]) { const base = kitMaterial(id) as THREE.MeshStandardMaterial; const m = base.clone(); m.onBeforeCompile = base.onBeforeCompile; m.customProgramCacheKey = base.customProgramCacheKey; tallMats[id] = withCutout(m); }
  return tallMats[id]!;
}
/** merge every chunk into meshes and add them to the scene; returns the chunk groups (for culling stats) */
export function flushChunks(scene: THREE.Scene) {
  const groups: THREE.Group[] = [];
  for (const [, subs] of chunks) {
    const g = new THREE.Group();
    for (const [sub, b] of subs) {
      const merged = mergePieces(b.pieces);
      if (sub.endsWith("|1")) merged.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) m.material = tallMaterial(sub.split("|")[0] as MatId); });
      g.add(merged);
    }
    scene.add(g); groups.push(g);
  }
  chunks.clear(); return groups;
}

// ---- placement rules
const keepClear: { x: number; z: number; r: number }[] = [
  ...CRATES.map((c) => ({ x: c.x, z: c.z, r: 1.8 })), ...SPAWNS.flat().map((s) => ({ x: s.x, z: s.z, r: 1.5 })),
  ...PORTALS.flatMap((p) => [{ x: p.a.x, z: p.a.z, r: 2.5 }, { x: p.b.x, z: p.b.z, r: 2.5 }]), ...LANDMARKS.map((l) => ({ x: l.x, z: l.z, r: 4 })),
  { x: POI.hatch.x, z: POI.hatch.z, r: 4 }, { x: POI.raft.x, z: POI.raft.z, r: 4 }, { x: POI.tunnelExit.x, z: POI.tunnelExit.z, r: 3 },
];
export const reserve = (x: number, z: number, r: number) => keepClear.push({ x, z, r });
const free = (x: number, z: number, r = 0) => !keepClear.some((k) => Math.hypot(x - k.x, z - k.z) < k.r + r);

export function dressWorld(scene: THREE.Scene, kit: KitSource, rng: () => number) {
  const rr = (a: number, b: number) => a + rng() * (b - a);
  let wall = 0, under = 0, rocks = 0;
  // 1) the jungle wall: dense layered planting in the band just outside the play space; sparse canopy further out
  for (let i = 0; i < 26000; i++) {
    const x = rr(BOUNDS.minX, BOUNDS.maxX), z = rr(BOUNDS.minZ + 4, BOUNDS.maxZ - 6), o = openness(x, z);
    if (o > -0.8) continue;
    const und = isUnder(x);
    if (!und && (z > 72 || z < -64)) continue; // no trees in the sea or river
    const band = -o;
    // camera side (the camera sits south-south-west): planting that would hide the play space stays low
    const front = !und && (openness(x + 3, z - 5.2) > 0 || openness(x + 5.5, z - 9.5) > 0 || openness(x + 8, z - 14) > 0);
    if (front) {
      if (band > 3.2 || rng() > 0.45) continue;
      const f = rng(); addPieces(f < 0.4 ? kit.fern(rng, rr(0.8, 1.2)) : f < 0.7 ? kit.bush(rng, rr(0.6, 0.95)) : kit.bigLeaf(rng, rr(0.7, 1.0)), x, z, rr(0, 6.28)); wall++;
      continue;
    }
    if (band < 4.5) {
      if (rng() > 0.55) continue;
      const f = rng(), yaw = rr(0, 6.28);
      const ps = und ? (f < 0.6 ? kit.caveRock(rng, rr(0.8, 1.6)) : kit.mushroom(rng, rr(0.7, 1.3)))
        : band < 1.8 ? (f < 0.35 ? kit.bush(rng, rr(0.9, 1.4)) : f < 0.6 ? kit.fern(rng, rr(1, 1.5)) : f < 0.8 ? kit.bigLeaf(rng, rr(1, 1.4)) : kit.banana(rng, rr(0.9, 1.2)))
        : (f < 0.45 ? kit.palm(rng, rr(1, 1.3)) : f < 0.85 ? kit.tree(rng, rr(1.1, 1.5)) : kit.bush(rng, rr(1.3, 1.8)));
      addPieces(ps, x, z, yaw); wall++;
    } else if (band < 14 && rng() < (und ? 0.05 : 0.07)) {
      addPieces(und ? kit.caveRock(rng, rr(1.5, 2.6)) : kit.tree(rng, rr(1.4, 1.9)), x, z, rr(0, 6.28)); wall++;
    }
  }
  // 2) inside clearings: understory clusters near the edges, rocks and logs as cover, never on trails or POIs
  for (const c of CLEARINGS) {
    const n = Math.round(c.rx * c.rz * 0.09);
    for (let k = 0; k < n; k++) {
      const a = rr(0, 6.28), e = Math.sqrt(rr(0.15, 1)), x = c.x + Math.cos(a) * c.rx * e, z = c.z + Math.sin(a) * c.rz * e;
      if (openness(x, z) < 1.2 || nearestTrailDist(x, z) < 2.6 || !free(x, z, 1)) continue;
      const f = rng(), edge = e > 0.65;
      let ps: KitPiece[];
      if (c.under) ps = f < 0.5 ? kit.mushroom(rng, rr(0.6, 1.1)) : kit.caveRock(rng, rr(0.5, 1.0));
      else if (edge) ps = f < 0.3 ? kit.fern(rng, rr(0.8, 1.2)) : f < 0.55 ? kit.bigLeaf(rng, rr(0.8, 1.2)) : f < 0.75 ? kit.bush(rng, rr(0.8, 1.2)) : kit.banana(rng, rr(0.8, 1.1));
      else ps = f < 0.45 ? kit.rock(rng, rr(0.6, 1.2)) : f < 0.7 ? kit.log(rng, 1) : f < 0.85 ? kit.stump(rng, 1) : kit.palm(rng, rr(0.9, 1.1));
      addPieces(ps, x, z, rr(0, 6.28)); reserve(x, z, 1.2); under++;
      if (!edge && !c.under) rocks++;
    }
  }
  // 3) canopy shadow casters over the jungle edge (only their shadows land on the play space; trails/POIs stay sunny)
  const ghost = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  for (let i = 0; i < 0; i++) { // off: with a 35 deg sun, casters at 9-12 u land ~17 u inland
    const x = rr(-60, 60), z = rr(-60, 70), o = openness(x, z);
    if (o > 1.5 || o < -6 || nearestTrailDist(x, z) < 5) continue;
    for (const p of kit.caster(rng, rr(1.4, 2.6))) { const m = new THREE.Mesh(p.geo, ghost); m.position.set(x, rr(9, 12), z); m.castShadow = true; scene.add(m); }
  }
  return { wall, under, rocks };
}

// ---- grass: instanced tufts per chunk, root colour = ground colour, wind + push (L1 shader)
export function buildGrass(scene: THREE.Scene, rng: () => number, tuft: THREE.BufferGeometry) {
  const per = new Map<string, number[][]>();
  for (let i = 0; i < 90000; i++) {
    const x = -70 + rng() * 140, z = -64 + rng() * 136, o = openness(x, z);
    if (o < 0.3 || nearestTrailDist(x, z) < 1.9 || !free(x, z, -0.6)) continue;
    const ar = areaAt(x, z), c = CLEARINGS.find((q) => q.id === ar); if (c && c.ground !== "grass") continue;
    const dens = fbm(x * 0.1 + 3, z * 0.1); if (dens < 0.46) continue;
    const edgeK = THREE.MathUtils.smoothstep(o, 0.3, 2.2); if (rng() > edgeK) continue; // thin out toward the edges, no hard lines
    const key = `${Math.floor(x / CH)},${Math.floor(z / CH)}`; (per.get(key) ?? per.set(key, []).get(key)!).push([x, z, (0.7 + dens * 0.9) * (0.6 + edgeK * 0.4)]);
  }
  const mat = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), { rim: 0.25, grass: true });
  const m = new THREE.Matrix4(), c = new THREE.Color(); let total = 0;
  for (const [, spots] of per) {
    const im = new THREE.InstancedMesh(tuft, mat, spots.length);
    spots.forEach(([x, z, s], i) => { m.makeScale(s, s * (0.6 + rng() * 0.8), s).setPosition(x, groundHeight(x, z), z); im.setMatrixAt(i, m); groundColor(x, z, c); c.multiplyScalar(1.04); im.setColorAt(i, c); });
    im.computeBoundingSphere(); im.receiveShadow = true; scene.add(im); total += spots.length;
  }
  return total;
}
