// The Vault's own kit (Fable, vault v3): public/models/build/vault.glb, authored in tools/blender/build/g_vault.py and
// vault_fac*.py, loaded with the structures kit (world/kit_build.ts BUILD_GROUPS). This file turns its assets into
// scene objects and lays out the room shell.
//
// PIECES  vault_pod, vault_board (home/dispatch.ts); fac_<id> for every facility in facilities.ts (fac_blueprint is the
//         "blueprints" starter); the shell: vault_floor (2 x 2 m), vault_floor_half, vault_floor_cell, vault_floor_border,
//         vault_floor_corner, vault_kerb, vault_kerb_post, vault_wall (2 m), vault_pilaster (1 m), vault_wall_corner,
//         vault_trim (1 m), vault_wall_cap (1 m), vault_door_round (4 m), vault_sconce.
// SPACE   +y up, front +z. Facilities, pod and board: origin on the floor at the footprint centre. Shell pieces that run
//         along a wall: origin on the floor on the edge of the build grid, the room at +z, the piece itself at -z.
// NODES   every moving or switchable part keeps its name: pod_door, pod_needle, pod_lamp, pod_glass, board_face,
//         press_wheel, gen_wheel, gen_lamp, fx_mag, fx_pack, fx_heart, neon, bell, mirror_glass, bp_sheet, sconce_bulb,
//         door_wheel, slot0..8 (trophy points).
// MATS    matte, gloss (polished brass and lacquer), glass, emissive. The vault is indoors, so its materials leave out
//         the canopy cookie that the island's kit materials carry.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { patch } from "../render/shading";
import { asset } from "../world/kit_build";
import { kitMaterial } from "../world/kitutil";
import { AREA } from "./facilities";

const MATS = new Map<string, THREE.Material>();
export function vaultMat(id: string): THREE.Material {
  let m = MATS.get(id);
  if (m) return m;
  if (id === "emissive") m = kitMaterial("emissive");
  else if (id === "glass") m = new THREE.MeshStandardMaterial({ color: "#bfe8ff", transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.2, side: THREE.DoubleSide, depthWrite: false });
  else if (id === "gloss") m = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.12 }), { rim: 0.4, cookie: false });
  else if (id === "floor") m = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0 }), { rim: 0, cookie: false });
  else m = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 }), { rim: 0.3, cookie: false });
  m.name = id; MATS.set(id, m);
  return m;
}
const dress = (mesh: THREE.Mesh, id: string) => {
  mesh.material = vaultMat(id);
  mesh.castShadow = id !== "emissive" && id !== "glass"; mesh.receiveShadow = id !== "emissive" && id !== "glass";
  if (id === "glass") mesh.renderOrder = 2;
};
/** a vault asset as one Object3D: its static geometry merged per material, its part nodes under the same root (so
 *  getObjectByName finds them). Throws if the kit is not loaded or the asset is unknown. */
export function vaultModel(name: string): THREE.Group {
  const b = asset(name), g = new THREE.Group(); g.name = name;
  const by = new Map<string, THREE.BufferGeometry[]>();
  for (const p of b.pieces) (by.get(p.mat) ?? by.set(p.mat, []).get(p.mat)!).push(p.geo);
  for (const [id, geos] of by) { const m = new THREE.Mesh(geos.length === 1 ? geos[0] : mergeGeometries(geos, false)!); m.name = `${name}__${id}`; dress(m, id); g.add(m); }
  b.parts.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) dress(m, (o.userData.mat as string) ?? "matte"); });
  g.add(b.parts.root);
  g.userData.parts = b.parts;
  return g;
}

// ---------------------------------------------------------------- the room shell
export const X0 = AREA.minX - 0.5, X1 = AREA.maxX + 0.5, Z0 = AREA.minZ - 0.5, Z1 = AREA.maxZ + 0.5;
/** the back (north) wall from x = X0 east, and the side (east) wall from z = Z0 south: W wall 2 m, P pilaster 1 m,
 *  D the round door's 4 m bay. Each adds up to the room: 33 m and 25 m. */
const NORTH = "WWPWWPWWWPWWPDPWWW", EAST = "PWWWPWWPWWPWWWP";
const LEN = { W: 2, P: 1, D: 4 }, PIECE = { W: "vault_wall", P: "vault_pilaster", D: "vault_door_round" };
/** sconces hang on pilasters: [x or z along the wall, lamp bank] */
export const SCONCES_N: [number, number][] = [[-12, 1], [-7, 0], [5, 0], [10, 1]], SCONCES_E: [number, number][] = [[-5, 1], [0, 0], [5, 1]];
export const SCONCE_Y = 2.5;
export type Placed = { name: string; x: number; z: number; q: number; sx: number };
/** every static piece of the shell: [asset, x, z, quarter turns about y, scale along its length].
 *  tools/blender/build/vault_review.py vault_layout() is the same list (the review mock). */
export function shellLayout(): Placed[] {
  const out: Placed[] = [], put = (name: string, x: number, z: number, q = 0, sx = 1) => out.push({ name, x, z, q, sx });
  // floor: a green marble band round the room (one cell wide), a cream checker inside it. The field is 31 x 23
  // cells, so the 2 x 2 modules leave one strip of halves along the east and south sides.
  for (let x = AREA.minX; x <= AREA.maxX; x++) for (let z = AREA.minZ; z <= AREA.maxZ; z++) {
    const ex = x === AREA.minX || x === AREA.maxX, ez = z === AREA.minZ || z === AREA.maxZ;
    if (ex && ez) put("vault_floor_corner", x, z, x > 0 ? (z < 0 ? 0 : -1) : z < 0 ? 1 : 2);
    else if (ez) put("vault_floor_border", x, z, z < 0 ? 0 : 2);
    else if (ex) put("vault_floor_border", x, z, x < 0 ? 1 : -1);
  }
  for (let i = 0; i < 15; i++) {
    for (let j = 0; j < 11; j++) put("vault_floor", -14.5 + 2 * i, -10.5 + 2 * j);
    put("vault_floor_half", -14.5 + 2 * i, 11, 2);
  }
  for (let j = 0; j < 11; j++) put("vault_floor_half", 15, -10.5 + 2 * j, 1);
  put("vault_floor_cell", 15, 11);
  // walls
  let x = X0; const door: [number, number][] = [];
  for (const ch of NORTH as unknown as (keyof typeof LEN)[]) { put(PIECE[ch], x + LEN[ch] / 2, Z0); if (ch === "D") door.push([x, x + LEN[ch]]); x += LEN[ch]; }
  put("vault_wall_corner", X1, Z0);
  let z = Z0;
  for (const ch of EAST as unknown as (keyof typeof LEN)[]) { put(PIECE[ch], X1, z + LEN[ch] / 2, -1); z += LEN[ch]; }
  // cornice and the ground above the vault, 1 m modules (none over the door: its own lintel stands taller)
  for (let k = 0; k < X1 - X0 + 1; k++) {
    const cx = X0 + k + 0.5;
    if (door.some(([a, b]) => cx > a && cx < b)) continue;
    put("vault_trim", cx, Z0); put("vault_wall_cap", cx, Z0);
  }
  for (let k = 0; k < Z1 - Z0; k++) {
    const cz = Z0 + k + 0.5;
    if (k === 0) put("vault_trim", X1, cz + 0.06, -1, 0.88); else put("vault_trim", X1, cz, -1); // the first one stops short of the back wall's cornice
    put("vault_wall_cap", X1, cz, -1);
  }
  // the open (camera) sides: a kerb, and a newel where they meet
  for (let k = 0; k < X1 - X0; k++) put("vault_kerb", X0 + k + 0.5, Z1, 2);
  for (let k = 0; k < Z1 - Z0; k++) put("vault_kerb", X0, Z0 + k + 0.5, 1);
  put("vault_kerb_post", X0, Z1, 2);
  return out;
}
const placeM = (p: { x: number; z: number; q: number; sx?: number }, y = 0) => new THREE.Matrix4().compose(new THREE.Vector3(p.x, y, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (p.q * Math.PI) / 2, 0)), new THREE.Vector3(p.sx ?? 1, 1, 1));
/** the whole shell: static geometry merged into one mesh per material (the floor on its own, lower roughness), plus
 *  the door's wheel. Nothing in it casts a shadow (the camera never sees one fall), everything receives. */
export function buildShell(): THREE.Group {
  const g = new THREE.Group(); g.name = "vault_shell";
  const by = new Map<string, THREE.BufferGeometry[]>();
  for (const p of shellLayout()) {
    const b = asset(p.name, placeM(p));
    for (const pc of b.pieces) { const id = p.name.startsWith("vault_floor") && pc.mat === "matte" ? "floor" : pc.mat; (by.get(id) ?? by.set(id, []).get(id)!).push(pc.geo); }
    if (b.parts.root.children.length) { b.parts.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { dress(m, (o.userData.mat as string) ?? "matte"); m.castShadow = false; } }); g.add(b.parts.root); }
  }
  for (const [id, geos] of by) { const m = new THREE.Mesh(mergeGeometries(geos, false)!, vaultMat(id)); m.name = `vault_shell__${id}`; m.castShadow = false; m.receiveShadow = id !== "emissive"; g.add(m); }
  return g;
}
/** one wall sconce on the back wall (q 0) or the side wall (q -1); `along` is its x or z. bulb = the glass (hide it with its lamp) */
export function sconce(along: number, q: 0 | -1): { obj: THREE.Group; bulb: THREE.Object3D; light: THREE.Vector3 } {
  const obj = vaultModel("vault_sconce"), x = q ? X1 + 0.012 : along, z = q ? along : Z0 - 0.012;
  obj.position.set(x, SCONCE_Y, z); obj.rotation.y = (q * Math.PI) / 2;
  obj.traverse((o) => { o.castShadow = false; });
  return { obj, bulb: obj.getObjectByName("sconce_bulb") ?? obj, light: new THREE.Vector3(q ? x - 1.2 : x, 3.6, q ? z : z + 1.2) };
}
