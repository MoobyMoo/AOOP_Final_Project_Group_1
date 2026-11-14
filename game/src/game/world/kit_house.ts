// House kit (Fable W2, map v3 / G1-22): enterable modular buildings. Geometry is authored by script in Blender 5.2
// (tools/blender/build/hkit.py, hprops.py, g_house.py, g_prefab.py), exported to public/models/build/house.glb
// (modules + props) and prefab.glb (the six buildings). Vertex colours carry albedo x baked AO; no UVs, no textures.
//
// USE
//   await preloadHouse();
//   const b = building("cellblock");                 // BuildingDef (+ breakables, size, tris), everything in local space
//   chunk.push(...b.pieces);                          // static: floor, wall bottoms (to 1.1 u), door frames, bars, furniture
//   scene.add(b.parts.root); b.parts.root.position.set(x, y, z); b.parts.root.rotation.y = yaw;
//   grid.add(placeColliders(b.colliders, x, z, yaw)); // or collidersFor("building:cellblock")
//   const m = houseModule("wall_plank_window");       // one 2 u module, for one-off assembly; m.colliders
//
// SPACE  +y up, front faces +z, origin on the ground at the footprint centre. Modules are 2 u; walls are 3 u high and
//        0.2-0.34 thick, centred on the grid line. A wall module runs along local x with its outside on +z. Doors are
//        1.6 u wide (clear 1.48), windows 1.1 u. The floor top is y = 0.08, so flatten the terrain under a building.
//
// PARTS  (all under parts.root; local transforms are in building space)
//   roof                 Group with every roof mesh (and whatever is mounted on it). Dither-fade it.
//   upper                Group with every wall part above y = 1.1: fade it with the roof and the plan reads from the
//                        55 deg camera. Its children are also parts, so a smarter fade can keep the far walls:
//                        upper_s / upper_w / upper_e / upper_n (by the wall's outward side in building space) and
//                        upper_i (interior partitions). At yaw 0 the camera sees over upper_s, upper_w and upper_i.
//   door<N>              one node per leaf, origin on the hinge. rotation.y: 0 = closed, doors[i].open = open.
//   light<N>             empty anchors for warm interior PointLights (lamps, the stove, the radio dials).
//   brk<N>               a cracked wall section, whole (hide on break). It never fades: it is the hint.
//   brk<N>_debris        hidden Group of chunk meshes, each with its origin on the chunk centroid, posed where it sat
//                        (show + fling, as kit_build's wallSection).   brk<N>_remains: hidden, show on break.
//
// COLLIDERS (contract Collider, building space)
//   walls                seg, move + shot, one per solid stretch (they stop at door and window openings)
//   windows              seg, move + low: you cannot walk through, shots and sight pass (the sill is at 1.1 u)
//   cell bars            seg, move only (shot: false, not low): bullets and sight pass between the bars
//   doors                seg along the closed leaf with id = door id. Plank / steel leaves block shots, bar doors do not.
//                        Drop or ignore the collider while the door is open.
//   cracked wall         seg, move + shot, id = breakable id (remove on break)
//   furniture            box / circle. Under about 1.3 u it is low cover; shelves and cabinets block shots too.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { KitPiece, MatId, Collider, BuildingDef } from "../contracts";
import { kitMaterial } from "./kitutil";

export const HOUSE_IDS = ["guard_hut", "cellblock", "farmhouse", "barn", "boathouse", "radio_shack"] as const;
export type HouseId = (typeof HOUSE_IDS)[number];
export const HOUSE_GROUPS = ["house", "prefab"] as const;
export type Built = { pieces: KitPiece[]; parts: Record<string, THREE.Object3D> };
export type HouseDoor = BuildingDef["doors"][number] & { w: number; hinge: [number, number]; kind: string };
/** a cracked wall section: parts[intact] is visible, parts[debris] and parts[remains] are hidden until it breaks */
export type Breakable = { id: string; intact: string; debris: string; remains: string };
export type HouseDef = BuildingDef & {
  id: string; name: string; doors: HouseDoor[]; breakables: Breakable[]; tris: number;
  /** footprint of the walls and floors in building space (centre + size); props outside the walls may stick out ~1 u */
  size: { x: number; z: number; w: number; d: number };
};
export type HouseModule = Built & { colliders: Collider[] };

type RawDef = { colliders: Collider[]; interiors: BuildingDef["interiors"]; doors: HouseDoor[]; lights: string[]; breakables: { id: string; chunks: number; marks: string; remains: string }[]; size: HouseDef["size"] | null; name?: string };
type Src = { name: string; tris: number; glow: number; def: RawDef; statics: { geo: THREE.BufferGeometry; mat: MatId }[]; nodes: THREE.Object3D[]; intact: Map<string, THREE.Group> };
const LIB = new Map<string, Src>();
let loading: Promise<void> | null = null;
const EMPTY: RawDef = { colliders: [], interiors: [], doors: [], lights: [], breakables: [], size: null };

/** position + normal + colour only, colours as float RGB (emissive is scaled by the asset's glow) */
function normalise(geo: THREE.BufferGeometry, mat: MatId, glow: number, m?: THREE.Matrix4, keepIndex = false) {
  const g = geo.index && !keepIndex ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal" && k !== "color") g.deleteAttribute(k);
  const c = g.attributes.color as THREE.BufferAttribute | undefined, n = g.attributes.position.count, col = new Float32Array(n * 3), k = mat === "emissive" ? glow : 1;
  for (let i = 0; i < n; i++) { col[i * 3] = (c ? c.getX(i) : 1) * k; col[i * 3 + 1] = (c ? c.getY(i) : 1) * k; col[i * 3 + 2] = (c ? c.getZ(i) : 1) * k; }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  if (m) g.applyMatrix4(m);
  return g;
}
const shadows = (m: THREE.Mesh, mat: MatId) => { m.castShadow = mat !== "emissive"; m.receiveShadow = mat !== "emissive"; };
function ingest(scene: THREE.Object3D) {
  scene.updateMatrixWorld(true);
  for (const root of scene.children) {
    const u = root.userData as { asset?: string; tris?: number; glow?: number; def?: string };
    if (!u.asset) continue;
    const glow = u.glow ?? 1.6, inv = root.matrixWorld.clone().invert();
    const src: Src = { name: u.asset, tris: u.tris ?? 0, glow, def: u.def ? (JSON.parse(u.def) as RawDef) : EMPTY, statics: [], nodes: [], intact: new Map() };
    for (const ch of [...root.children]) {
      const kind = ch.userData.kind as string, mat = (ch.userData.mat ?? "matte") as MatId;
      if (kind === "static") { const mesh = ch as THREE.Mesh; src.statics.push({ geo: normalise(mesh.geometry, mat, glow, inv.clone().multiply(mesh.matrixWorld)), mat }); continue; }
      ch.traverse((o) => {
        const mesh = o as THREE.Mesh; if (!mesh.isMesh) return;
        const mm = (o.userData.mat ?? "matte") as MatId;
        mesh.geometry = normalise(mesh.geometry, mm, glow, undefined, true); mesh.material = kitMaterial(mm); shadows(mesh, mm);
      });
      ch.name = (ch.userData.part as string) ?? ch.name;
      src.nodes.push(ch);
    }
    // a cracked section whole = its chunks merged into one mesh per material (built once, shared by every instance)
    for (const b of src.def.breakables) {
      const by = new Map<MatId, THREE.BufferGeometry[]>();
      for (const n of src.nodes) {
        if (!n.name.startsWith(`${b.id}_c`)) continue;
        n.updateMatrix();
        n.traverse((o) => {
          const mesh = o as THREE.Mesh; if (!mesh.isMesh) return;
          const mm = (o.userData.mat ?? "matte") as MatId, g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
          g.applyMatrix4(o === n ? n.matrix : n.matrix.clone().multiply(o.matrix));
          (by.get(mm) ?? by.set(mm, []).get(mm)!).push(g);
        });
      }
      const grp = new THREE.Group(); grp.name = b.id;
      for (const [mm, geos] of by) { const mesh = new THREE.Mesh(mergeGeometries(geos, false)!, kitMaterial(mm)); shadows(mesh, mm); grp.add(mesh); }
      src.intact.set(b.id, grp);
    }
    LIB.set(src.name, src);
  }
}
/** load the house GLBs once; resolves when building() and houseModule() are usable */
export function preloadHouse(base = `${import.meta.env.BASE_URL}models/build/`): Promise<void> {
  loading ??= (async () => {
    const loader = new GLTFLoader();
    const all = await Promise.all(HOUSE_GROUPS.map((g) => loader.loadAsync(`${base}${g}.glb`)));
    for (const gltf of all) ingest(gltf.scene);
  })();
  return loading;
}
export const houseReady = () => LIB.size > 0;
/** every asset name in the kit: the six prefabs plus the modules and props (tools/blender/build/manifest/house.json) */
export const houseAssetNames = () => [...LIB.keys()];
export const houseModuleNames = () => [...LIB.keys()].filter((n) => !(HOUSE_IDS as readonly string[]).includes(n));
export const houseTris = (name: string) => LIB.get(name)?.tris ?? 0;

const cloneCol = (c: Collider): Collider => ({ ...c });
function src(name: string): Src {
  const s = LIB.get(name);
  if (!s) throw new Error(`kit_house: unknown asset "${name}" (did preloadHouse() finish?)`);
  return s;
}
/** instantiate an asset: static pieces (placed by m) + a fresh part tree under parts.root */
function instance(s: Src, m?: THREE.Matrix4): Built {
  const pieces: KitPiece[] = s.statics.map(({ geo, mat }) => ({ geo: m ? geo.clone().applyMatrix4(m) : geo.clone(), mat, footprint: 0, blocksMove: false, blocksShot: false, tall: true }));
  const root = new THREE.Group(); root.name = s.name;
  if (m) m.decompose(root.position, root.quaternion, root.scale);
  const parts: Record<string, THREE.Object3D> = { root };
  const group = (name: string) => { const g = new THREE.Group(); g.name = name; root.add(g); parts[name] = g; return g; };
  let roof: THREE.Group | null = null, upper: THREE.Group | null = null;
  const debris = new Map<string, THREE.Group>();
  const chunkOf = (name: string) => s.def.breakables.find((b) => name.startsWith(`${b.id}_c`));
  for (const n of s.nodes) {
    const c = n.clone(true), b = chunkOf(c.name);
    if (b) { let d = debris.get(b.id); if (!d) { d = group(`${b.id}_debris`); d.visible = false; debris.set(b.id, d); } c.name = `chunk_${c.name.slice(b.id.length + 2)}`; d.add(c); continue; }
    if (c.name.startsWith("roof")) (roof ??= group("roof")).add(c);
    else if (c.name.startsWith("upper")) (upper ??= group("upper")).add(c);
    else root.add(c);
    if (c.name !== "roof" && c.name !== "upper") parts[c.name] = c;      // single-part modules name their node roof / upper
  }
  for (const b of s.def.breakables) {
    const whole = s.intact.get(b.id)!.clone(true); root.add(whole); parts[b.id] = whole;
    if (parts[b.marks]) whole.add(parts[b.marks]);
    if (parts[b.remains]) parts[b.remains].visible = false;
  }
  return { pieces, parts };
}

/** fold every mesh under g into one mesh per material (fewer draw calls; g keeps its place and name) */
function flatten(g: THREE.Object3D) {
  const by = new Map<THREE.Material, THREE.BufferGeometry[]>();
  g.updateMatrixWorld(true);
  const inv = g.matrixWorld.clone().invert();
  g.traverse((o) => {
    const m = o as THREE.Mesh; if (!m.isMesh) return;
    const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    geo.applyMatrix4(inv.clone().multiply(m.matrixWorld));
    const mat = m.material as THREE.Material; (by.get(mat) ?? by.set(mat, []).get(mat)!).push(geo);
  });
  g.clear();
  for (const [mat, geos] of by) { const m = new THREE.Mesh(geos.length === 1 ? geos[0] : mergeGeometries(geos, false)!, mat); const lit = mat !== kitMaterial("emissive"); m.castShadow = lit; m.receiveShadow = lit; g.add(m); }
}

/** An enterable building. o.m places the static pieces and parts.root (colliders, interiors and door hinges stay in
 *  building space: move them with placeColliders or your own transform). o.open poses doors open (true = all).
 *  o.mergeUpper folds the per-side upper walls into one mesh under parts.upper (5 draw calls less per building); use it
 *  when the whole upper group fades together. The upper_<side> parts are then gone. */
export function building(id: HouseId | string, o: { m?: THREE.Matrix4; open?: boolean | string[]; mergeUpper?: boolean } = {}): HouseDef {
  const s = src(id), d = s.def, b = instance(s, undefined);
  if (o.mergeUpper && b.parts.upper) { flatten(b.parts.upper); for (const k of Object.keys(b.parts)) if (k.startsWith("upper_")) delete b.parts[k]; }
  if (b.parts.roof) { flatten(b.parts.roof); for (const k of Object.keys(b.parts)) if (k.startsWith("roof_")) delete b.parts[k]; }
  if (o.m) { o.m.decompose(b.parts.root.position, b.parts.root.quaternion, b.parts.root.scale); for (const p of b.pieces) p.geo.applyMatrix4(o.m); }
  const doors = d.doors.map((x) => ({ ...x, hinge: [...x.hinge] as [number, number] }));
  for (const door of doors) if (o.open === true || (Array.isArray(o.open) && o.open.includes(door.id))) b.parts[door.leaf].rotation.y = door.open;
  return {
    id, name: d.name ?? id, pieces: b.pieces, parts: b.parts, colliders: d.colliders.map(cloneCol), interiors: d.interiors.map((r) => ({ ...r })), doors, lights: [...d.lights],
    breakables: d.breakables.map((x) => ({ id: x.id, intact: x.id, debris: `${x.id}_debris`, remains: x.remains })), size: d.size ? { ...d.size } : { x: 0, z: 0, w: 0, d: 0 }, tris: s.tris,
  };
}
/** One module or prop by name (houseModuleNames()): wall_<style>[_window|_door|_cracked], corner_<style>, floor_*,
 *  roof_*, porch, steps, and the props. Walls: lower part in pieces, parts.upper fades, parts.door0 is the leaf. */
export function houseModule(name: string, o: { m?: THREE.Matrix4; open?: boolean } = {}): HouseModule {
  const s = src(name), b = instance(s, o.m);
  if (o.open) for (const door of s.def.doors) b.parts[door.leaf].rotation.y = door.open;
  return { ...b, colliders: s.def.colliders.map(cloneCol) };
}
/** colliders of anything placeable from this kit, in its local space. k = "building:<id>", "house:<module>" or the
 *  bare asset name. o.open = door ids already open (their colliders are left out); o.broken = breakable ids gone. */
export function collidersFor(k: string, o: { open?: string[]; broken?: string[] } = {}): Collider[] {
  const name = k.replace(/^(building|house):/, ""), s = LIB.get(name);
  if (!s) return [];
  const skip = new Set([...(o.open ?? []), ...(o.broken ?? [])]);
  return s.def.colliders.filter((c) => !c.id || !skip.has(c.id)).map(cloneCol);
}
/** move local colliders to a placement (x, z, yaw as Placed; yaw is a three.js rotation.y) */
export function placeColliders(cols: Collider[], x: number, z: number, yaw = 0, s = 1): Collider[] {
  const c = Math.cos(yaw), n = Math.sin(yaw);
  const px = (lx: number, lz: number) => x + (lx * c + lz * n) * s, pz = (lx: number, lz: number) => z + (-lx * n + lz * c) * s;
  return cols.map((k) => k.t === "seg" ? { ...k, ax: px(k.ax, k.az), az: pz(k.ax, k.az), bx: px(k.bx, k.bz), bz: pz(k.bx, k.bz), thick: k.thick * s }
    : k.t === "box" ? { ...k, x: px(k.x, k.z), z: pz(k.x, k.z), w: k.w * s, d: k.d * s, yaw: (k.yaw ?? 0) + yaw }
      : { ...k, x: px(k.x, k.z), z: pz(k.x, k.z), r: k.r * s });
}
