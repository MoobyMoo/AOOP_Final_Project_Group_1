// TEMPORARY stand-in for world/kit_house.ts (Fable W2 builds the real modules in Blender). Same exports, same
// building ids, same BuildingDef contract (contracts.ts), built from plain boxes so the map engine, the building
// runtime and the level can be finished and tested now. The lead swaps the import in world/buildings.ts.
//
// A building is an ASCII plan on the 2 u module grid (1 character = 1 u):
//   odd row, odd col  = a room cell (space, or furniture: b bunk, c crates, t table, s shelf, h hay, k stove,
//                       r boat rack, a radio desk, l ceiling lamp + light anchor)
//   even row, odd col = a wall edge running east-west; odd row, even col = a wall edge running north-south:
//                       - | wall, w window (low: you shoot through it), D outside door, d inside door,
//                       L locked door (needs the Vine Key), B boarded door (breakable), x broken wall (low), space = open
//   even row, even col = a corner post (+) or nothing
// Local space: +y up, origin at the footprint centre on the ground, front = +z (the plan's bottom row), 1 u = 1 m.
// Wall centre lines sit on integer offsets from the origin, so a building placed at half-integer world coordinates
// with yaw in quarter turns puts its walls and doorways exactly on the 1 u nav cells.
import * as THREE from "three";
import type { BuildingDef, Collider, KitPiece, MatId } from "../contracts";
import { bake, M, kitMaterial } from "./kitutil";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

type Look = { wall: string; wall2: string; trim: string; roof: string; roof2: string; floor: string; floor2: string; flat?: boolean; door: string };
type Plan = { rows: string[]; look: Look; h?: number };
const WOOD: Look = { wall: "#b98d5c", wall2: "#a67a4c", trim: "#6e4b2e", roof: "#8f5a3c", roof2: "#7c4c34", floor: "#a98a5c", floor2: "#97784e", door: "#7a5230" };
const PLANS: Record<string, Plan> = {
  guard_hut: { look: { ...WOOD, wall: "#c2a06c", roof: "#5f8a6a", roof2: "#537a5e" }, rows: [
    "+-+-+",
    "|b l|",
    "+ + +",
    "wc  |",
    "+-+D+"] },
  radio_shack: { look: { ...WOOD, wall: "#8fa3a8", wall2: "#7d9196", trim: "#4a5a60", roof: "#b8552e", roof2: "#a34a28" }, rows: [
    "+-+-+-+",
    "|s l a|",
    "+ + + +",
    "w     |",
    "+-+D+-+"] },
  boathouse: { look: { ...WOOD, wall: "#7fa7ac", wall2: "#6f979c", trim: "#e8e2d4", roof: "#8a6a45", roof2: "#7a5c3c" }, rows: [
    "+-+ +-+",
    "|  r  |",
    "+ + + +",
    "w  l  w",
    "+ + + +",
    "|    s|",
    "+ + + +",
    "|c    |",
    "+-+D+-+"] },
  farmhouse: { look: { ...WOOD, wall: "#e2d3ae", wall2: "#d2c29c", trim: "#8a5a3c", roof: "#b8552e", roof2: "#a34a28" }, rows: [
    "+-+w+-+D+w+",
    "|b  |  l  |",
    "+ + + + + +",
    "|  ld    t|",
    "+-+-+ + + +",
    "|k s|     w",
    "+ + + + + +",
    "w   d    c|",
    "+-+-+-+D+-+"] },
  barn: { look: { ...WOOD, wall: "#b0483a", wall2: "#9c3e32", trim: "#e8dcc0", roof: "#6f7a80", roof2: "#626c72" }, h: 3.6, rows: [
    "+-+-+-+-+",
    "|h h   s|",
    "+ + + + +",
    "|      h|",
    "+ + + + +",
    "w  l    D",
    "+ + + + +",
    "|h      |",
    "+ + + + +",
    "|  c   h|",
    "+-+   +-+"] },
  cellblock: { look: { wall: "#c4ab84", wall2: "#b89e78", trim: "#8f7a5a", roof: "#a89472", roof2: "#9a8666", floor: "#a8997c", floor2: "#998a6e", flat: true, door: "#5a6468" }, rows: [
    "+-+-+-+-+-+-+-+",
    "|b  |   |b  |s|",
    "+ + + + + + + +",
    "w  l|  l|  l| |",
    "+-+d+-+L+-+d+d+",
    "D  l     l    |",
    "+ + + + + + + +",
    "|c         t  B",
    "+-+w+-+D+-+w+-+"] },
};
export const HOUSE_IDS = Object.keys(PLANS);
export const preloadHouse = (): Promise<void> => Promise.resolve();

const T = 0.3, LOW = 1.15, DOORW = 1.4, DOORH = 2.15;
/** the sun sits behind the set, so every wall the camera sees is in shade: side faces carry a baked "equator" boost
 *  (the structures kit does the same, spikes/build/NOTES.md decision 2) and a little contact darkening at the ground */
function shade(g: THREE.BufferGeometry) {
  const n = g.attributes.normal as THREE.BufferAttribute, p = g.attributes.position as THREE.BufferAttribute, c = g.attributes.color.array as Float32Array;
  for (let i = 0; i < n.count; i++) { const side = Math.abs(n.getY(i)) < 0.5, k = (side ? 1.85 : 1) * (0.8 + 0.2 * Math.min(1, p.getY(i) / 0.5)); c[i * 3] *= k; c[i * 3 + 1] *= k; c[i * 3 + 2] *= k; }
  return g;
}
const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: string, yaw = 0) => shade(bake(new THREE.BoxGeometry(w, h, d), color, M(x, y, z, 0, yaw, 0)));
function meshOf(geos: THREE.BufferGeometry[], mat: MatId = "matte") {
  const m = new THREE.Mesh(geos.length === 1 ? geos[0] : mergeGeometries(geos, false)!, kitMaterial(mat)); m.castShadow = mat !== "emissive"; m.receiveShadow = mat !== "emissive"; return m;
}
const tri = (pts: number[][], color: string) => { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pts.flat(), 3)); g.computeVertexNormals(); return bake(g, color); };

/** an enterable building by id: guard_hut, cellblock, farmhouse, barn, boathouse, radio_shack */
export function building(id: string, _opts: Record<string, unknown> = {}): BuildingDef {
  const plan = PLANS[id]; if (!plan) throw new Error(`kit_house_stub: unknown building "${id}"`);
  const { rows, look: L } = plan, R = (rows.length - 1) / 2, Cn = (rows[0].length - 1) / 2, WH = plan.h ?? 2.9;
  const stat: THREE.BufferGeometry[] = [], glow: THREE.BufferGeometry[] = [], upper: THREE.BufferGeometry[] = [], roof: THREE.BufferGeometry[] = [];
  const colliders: Collider[] = [], doors: BuildingDef["doors"] = [], lights: string[] = [];
  const root = new THREE.Group(); root.name = `house_${id}`;
  const parts: Record<string, THREE.Object3D> = { root };
  const ch = (i: number, j: number) => rows[i]?.[j] ?? " ";
  // floor: one slab with a plank/tile checker
  for (let i = 1; i < rows.length; i += 2) for (let j = 1; j < rows[0].length; j += 2) stat.push(box(2, 0.1, 2, j - Cn, 0.03, i - R, ((i + j) / 2) % 2 ? L.floor : L.floor2));
  stat.push(box(Cn * 2 + 0.5, 0.14, R * 2 + 0.5, 0, -0.03, 0, L.trim));
  // wall edges
  const edge = (i: number, j: number, alongX: boolean) => {
    const c = ch(i, j); if (c === " " || c === "+") return;
    const x = j - Cn, z = i - R, yaw = alongX ? 0 : Math.PI / 2, col = ((i + j) >> 1) % 2 ? L.wall : L.wall2;
    const seg = (len: number, off: number, y0: number, y1: number, into: THREE.BufferGeometry[], color = col, thick = T) =>
      into.push(box(len, y1 - y0, thick, x + (alongX ? off : 0), (y0 + y1) / 2, z + (alongX ? 0 : off), color, yaw));
    const col2d = (len: number, off: number, shot: boolean, low = false, idc?: string): Collider => ({ t: "box", x: x + (alongX ? off : 0), z: z + (alongX ? 0 : off), w: alongX ? len : T, d: alongX ? T : len, move: true, shot, low, id: idc });
    if (c === "-" || c === "|") { seg(2, 0, 0, LOW, stat); seg(2, 0, LOW, WH, upper); seg(2.02, 0, LOW - 0.06, LOW + 0.06, stat, L.trim, T + 0.08); colliders.push(col2d(2, 0, true)); }
    else if (c === "w") { // window: sill wall below, frame + lintel above, shutters in the trim colour
      seg(2, 0, 0, LOW, stat); seg(2, 0, 2.25, WH, upper); seg(0.35, -0.825, LOW, 2.25, upper); seg(0.35, 0.825, LOW, 2.25, upper);
      seg(1.4, 0, LOW - 0.05, LOW + 0.07, stat, L.trim, T + 0.14); seg(1.4, 0, 2.2, 2.3, upper, L.trim, T + 0.1); seg(0.08, 0, LOW, 2.25, upper, L.trim, T * 0.5);
      colliders.push(col2d(2, 0, false, true));
    } else if (c === "x") { seg(2, 0, 0, 0.7, stat); seg(0.7, -0.65, 0.7, 1.5, stat, L.wall2); colliders.push(col2d(2, 0, false, true)); }
    else if ("DdLB".includes(c)) { // a door: jambs + lintel, and a hinged leaf
      const jw = (2 - DOORW) / 2, o = 1 - jw / 2, n = doors.length, key = `door_${n}`, did = `d${n}`;
      seg(jw, -o, 0, LOW, stat); seg(jw, o, 0, LOW, stat); seg(jw, -o, LOW, WH, upper); seg(jw, o, LOW, WH, upper); seg(DOORW, 0, DOORH, WH, upper);
      seg(DOORW + 0.2, 0, DOORH, DOORH + 0.12, upper, L.trim, T + 0.1);
      colliders.push(col2d(jw, -o, true), col2d(jw, o, true), col2d(DOORW, 0, true, false, did));
      const hinge = new THREE.Group(); hinge.position.set(x + (alongX ? -DOORW / 2 : 0), 0, z + (alongX ? 0 : -DOORW / 2)); hinge.rotation.y = alongX ? 0 : -Math.PI / 2;
      const leaf = new THREE.Group(); leaf.name = key; hinge.add(leaf); root.add(hinge);
      const lg = [box(DOORW - 0.06, DOORH - 0.05, 0.12, DOORW / 2, DOORH / 2, 0, c === "L" ? "#5a6468" : L.door), box(DOORW - 0.3, 0.1, 0.16, DOORW / 2, 1.5, 0, L.trim), box(DOORW - 0.3, 0.1, 0.16, DOORW / 2, 0.6, 0, L.trim)];
      if (c === "B") for (const [yy, rz] of [[0.7, 0.35], [1.5, -0.3]]) lg.push(bake(new THREE.BoxGeometry(DOORW + 0.5, 0.18, 0.1), "#c9b48a", M(DOORW / 2, yy, 0.1, 0, 0, rz)));
      leaf.add(meshOf(lg));
      if (c === "L") leaf.add(meshOf([box(0.22, 0.26, 0.2, DOORW - 0.25, 1.05, 0, "#ffd84a")], "emissive"));
      parts[key] = leaf;
      doors.push({ id: did, leaf: key, axis: "y", open: -1.5, breakable: c === "B" ? true : undefined, locked: c === "L" ? "vine_key" : undefined });
    }
  };
  for (let i = 0; i < rows.length; i++) for (let j = 0; j < rows[0].length; j++) {
    if (i % 2 === 0 && j % 2 === 1) edge(i, j, true);
    else if (i % 2 === 1 && j % 2 === 0) edge(i, j, false);
    else if (i % 2 === 0 && j % 2 === 0) { // corner post where any wall meets
      if ([ch(i, j - 1), ch(i, j + 1), ch(i - 1, j), ch(i + 1, j)].some((q) => q !== " " && q !== undefined)) {
        stat.push(box(T + 0.12, LOW, T + 0.12, j - Cn, LOW / 2, i - R, L.trim)); upper.push(box(T + 0.12, WH - LOW, T + 0.12, j - Cn, (LOW + WH) / 2, i - R, L.trim));
        colliders.push({ t: "box", x: j - Cn, z: i - R, w: T + 0.12, d: T + 0.12, move: true, shot: true });
      }
    } else { // room cell: furniture
      const c = ch(i, j), x = j - Cn, z = i - R, low = (w: number, d: number, shot = false) => colliders.push({ t: "box", x, z, w, d, move: true, shot, low: !shot });
      if (c === "b") { stat.push(box(0.95, 0.42, 1.9, x, 0.29, z, "#7a5a3c"), box(0.85, 0.16, 1.8, x, 0.56, z, "#c9b48a"), box(0.8, 0.14, 0.45, x, 0.68, z - 0.62, "#e8e2d4")); low(0.95, 1.9); }
      else if (c === "c") { stat.push(box(0.95, 0.85, 0.95, x - 0.15, 0.5, z, "#a8743f", 0.2), box(0.7, 0.6, 0.7, x + 0.35, 0.38, z + 0.5, "#8f6a3c", -0.3), box(0.6, 0.5, 0.6, x - 0.1, 1.16, z - 0.05, "#b58a52", 0.5)); low(1.3, 1.3); }
      else if (c === "t") { stat.push(box(1.5, 0.1, 0.9, x, 0.8, z, "#8a6a45"), ...[[-0.6, -0.33], [0.6, -0.33], [-0.6, 0.33], [0.6, 0.33]].map(([dx, dz]) => box(0.1, 0.75, 0.1, x + dx, 0.42, z + dz, "#6e4b2e")), box(0.3, 0.22, 0.24, x + 0.3, 0.96, z, "#c9302c")); low(1.5, 0.9); }
      else if (c === "s") { stat.push(box(1.6, 1.8, 0.5, x, 0.94, z - 0.45, "#7a5a3c"), ...[0.5, 1.0, 1.5].map((y) => box(1.5, 0.3, 0.42, x, y, z - 0.4, y === 1.0 ? "#8fa3a8" : "#c9b48a"))); colliders.push({ t: "box", x, z: z - 0.45, w: 1.6, d: 0.5, move: true, shot: true }); }
      else if (c === "h") { stat.push(box(1.3, 0.9, 1.1, x, 0.5, z, "#d9b45a", 0.15), box(1.32, 0.08, 1.12, x, 0.72, z, "#a8743f", 0.15)); low(1.3, 1.1); }
      else if (c === "k") { stat.push(box(1.0, 0.9, 0.9, x, 0.5, z - 0.3, "#4a5258"), bake(new THREE.CylinderGeometry(0.11, 0.11, 1.9, 8), "#3a4248", M(x + 0.25, 1.9, z - 0.45))); low(1.0, 0.9); }
      else if (c === "r") { stat.push(box(2.6, 0.5, 1.0, x, 0.55, z, "#3f8f9a"), box(2.3, 0.3, 0.7, x, 0.66, z, "#2f6f78"), box(0.14, 0.6, 1.2, x - 0.9, 0.3, z, "#6e4b2e"), box(0.14, 0.6, 1.2, x + 0.9, 0.3, z, "#6e4b2e")); low(2.6, 1.0); }
      else if (c === "a") { stat.push(box(1.5, 0.1, 0.8, x, 0.8, z - 0.35, "#8a6a45"), box(1.4, 0.75, 0.1, x, 0.42, z - 0.7, "#6e4b2e"), box(0.9, 0.5, 0.5, x, 1.1, z - 0.4, "#4a5a60")); glow.push(box(0.5, 0.12, 0.04, x, 1.15, z - 0.14, "#ffb347"), bake(new THREE.SphereGeometry(0.05, 6, 5), "#7dff9a", M(x + 0.34, 1.26, z - 0.14))); low(1.5, 0.8); }
      else if (c === "l") {
        const key = `light${lights.length}`, a = new THREE.Object3D(); a.name = key; a.position.set(x, WH - 0.75, z); root.add(a); parts[key] = a; lights.push(key);
        stat.push(bake(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 5), "#3a3a40", M(x, WH - 0.3, z)), bake(new THREE.ConeGeometry(0.28, 0.2, 10, 1, true), "#5a6468", M(x, WH - 0.58, z)));
        glow.push(bake(new THREE.SphereGeometry(0.11, 8, 6), "#ffd89a", M(x, WH - 0.68, z)));
      }
    }
  }
  // roof: a gable along the long side (ridge over the middle), or a flat slab with a parapet
  const OV = 0.45, hx = Cn + OV, hz = R + OV;
  if (L.flat) { roof.push(box(hx * 2, 0.22, hz * 2, 0, WH + 0.11, 0, L.roof), box(hx * 2, 0.4, 0.3, 0, WH + 0.38, -hz + 0.15, L.roof2), box(hx * 2, 0.4, 0.3, 0, WH + 0.38, hz - 0.15, L.roof2), box(0.3, 0.4, hz * 2, -hx + 0.15, WH + 0.38, 0, L.roof2), box(0.3, 0.4, hz * 2, hx - 0.15, WH + 0.38, 0, L.roof2), box(1.2, 0.5, 1.2, hx * 0.5, WH + 0.45, -hz * 0.3, L.trim)); }
  else {
    const alongX = Cn >= R, span = alongX ? hz : hx, len = (alongX ? hx : hx === 0 ? 0 : hz) * 2, rise = Math.min(1.9, span * 0.5), sl = Math.hypot(span, rise), pitch = Math.atan2(rise, span);
    for (const s of [-1, 1]) for (let k = 0; k < 2; k++) { // two courses per side so the roof is not one flat colour
      const t = (k + 0.5) / 2, off = s * span * (1 - t), y = WH + rise * t + 0.06, g = new THREE.BoxGeometry(alongX ? len : sl / 2 + 0.04, 0.16, alongX ? sl / 2 + 0.04 : len);
      roof.push(bake(g, k ? L.roof : L.roof2, alongX ? M(0, y, off, s * pitch, 0, 0) : M(off, y, 0, 0, 0, -s * pitch)));
    }
    roof.push(alongX ? box(len + 0.1, 0.2, 0.36, 0, WH + rise + 0.1, 0, L.trim) : box(0.36, 0.2, len + 0.1, 0, WH + rise + 0.1, 0, L.trim));
    for (const e of [-1, 1]) { // gable ends (both windings: the foliage-free matte material is single sided)
      const a = alongX ? [e * Cn, WH, -R] : [-Cn, WH, e * R], b = alongX ? [e * Cn, WH, R] : [Cn, WH, e * R], c = alongX ? [e * Cn, WH + rise * (R / span), 0] : [0, WH + rise * (Cn / span), e * R];
      upper.push(tri([a, b, c], L.wall2), tri([a, c, b], L.wall2));
    }
  }
  const pieces: KitPiece[] = [{ geo: mergeGeometries(stat, false)!, mat: "matte", footprint: Math.hypot(Cn, R), blocksMove: true, blocksShot: true, tall: false }];
  if (glow.length) pieces.push({ geo: mergeGeometries(glow.map((g) => { const c = g.attributes.color.array as Float32Array; for (let i = 0; i < c.length; i++) c[i] *= 1.8; return g; }), false)!, mat: "emissive", footprint: 0, blocksMove: false, blocksShot: false, tall: false });
  const up = new THREE.Group(); up.name = "upper"; up.add(meshOf(upper)); root.add(up); parts.upper = up;
  const rf = new THREE.Group(); rf.name = "roof"; rf.add(meshOf(roof)); root.add(rf); parts.roof = rf;
  return { pieces, parts, colliders, interiors: [{ x: 0, z: 0, w: Cn * 2, d: R * 2, h: WH }], doors, lights };
}
/** one loose module for one-off assembly (stub: a plain wall or floor piece) */
export function houseModule(name: string, _opts: Record<string, unknown> = {}): { pieces: KitPiece[]; colliders: Collider[] } {
  const wallish = name.startsWith("wall"), geo = wallish ? box(2, 2.9, T, 0, 1.45, 0, WOOD.wall) : box(2, 0.1, 2, 0, 0.03, 0, WOOD.floor);
  return { pieces: [{ geo, mat: "matte", footprint: 1, blocksMove: wallish, blocksShot: wallish, tall: false }], colliders: wallish ? [{ t: "box", x: 0, z: 0, w: 2, d: T, move: true, shot: true }] : [] };
}
/** footprint half-extents (x, z) of a building, for the map screen and the lint */
export function houseSize(id: string) { const p = PLANS[id]; return p ? { hx: (p.rows[0].length - 1) / 2, hz: (p.rows.length - 1) / 2 } : { hx: 2, hz: 2 }; }
