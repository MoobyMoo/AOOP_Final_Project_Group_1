// Enterable buildings at runtime (G1_BRIEF "Map v3" rule 3; mechanisms from the Duckov census: OcclusionFade,
// DarkRoomFade, SodaPointLight, Door). A building is a BuildingDef (contracts.ts) placed by the map:
//   - floors, lower walls and furniture are static and go into the world chunks;
//   - parts.roof and parts.upper dither-fade when the player is inside an interior volume, or when the building
//     stands between the camera and the player;
//   - inside, the daylight drops (dark-room tint) and the building's lamps come on through the light pool;
//   - doors are gates in the grid: E/F opens and closes them, boarded ones break, locked ones need their key.
// The lead swaps the import below for "./kit_house" when W2's Blender kit lands; nothing else here depends on the stub.
import * as THREE from "three";
import { preloadHouse, building } from "./kit_house_stub";
import type { BuildingDef, Placed } from "../contracts";
import { G } from "../core/state";
import { PLACED } from "./map/grove";
import { toWorld } from "./map/types";
import type { Footprint } from "./map/scatter";
import { groundHeight } from "./terrain";
import { addPieces, objects } from "./dress";
import { kitMaterial } from "./kitutil";
import { fadeMaterial } from "../render/fade";
import { addLamp } from "./lights";
import { gate, setGate } from "./grid";
import { sfx } from "../core/audio";
import { burst } from "../../fx";

export { preloadHouse };
type Door = { id: string; gateId: string; leaf: THREE.Object3D; closed: number; open: number; k: number; locked?: string; breakable: boolean; startOpen: boolean };
export type House = {
  id: string; kind: string; p: Placed; def: BuildingDef; y: number; fade: { value: number }; want: number;
  /** local half extents and height of the whole building (occlusion test) */
  hx: number; hz: number; h: number; doors: Door[]; root: THREE.Object3D;
};
export const houses: House[] = [];
const defs = new Map<string, BuildingDef>();
/** the BuildingDef of a placed building (built once: the grid, the scatter and the scene all read the same one) */
export function houseDef(p: Placed): BuildingDef { let d = defs.get(p.id!); if (!d) { d = building(p.k.slice(9), p.o); defs.set(p.id!, d); } return d; }
const placedHouses = () => PLACED.filter((p) => p.k.startsWith("building:"));
function extents(def: BuildingDef) {
  let hx = 1, hz = 1, h = 2.5;
  for (const i of def.interiors) { hx = Math.max(hx, Math.abs(i.x) + i.w / 2); hz = Math.max(hz, Math.abs(i.z) + i.d / 2); h = Math.max(h, i.h); }
  return { hx, hz, h };
}
/** world-space footprints (axis aligned after the quarter turn), for scatter and grass to keep off the floors */
export function houseFootprints(): Footprint[] {
  return placedHouses().map((p) => { const e = extents(houseDef(p)), quarter = Math.abs(Math.sin(p.yaw ?? 0)) > 0.5; return { x: p.x, z: p.z, hx: quarter ? e.hz : e.hx, hz: quarter ? e.hx : e.hz }; });
}
/** add every building to the world: static pieces into the chunk store, fading and moving parts into the scene */
export function buildHouses(scene: THREE.Scene) {
  for (const p of placedHouses()) {
    const def = houseDef(p), y = groundHeight(p.x, p.z) + 0.02, yaw = p.yaw ?? 0, e = extents(def), fade = { value: 0 };
    addPieces(def.pieces, p.x, p.z, yaw, 1, y);
    const root = def.parts.root; root.position.set(p.x, y, p.z); root.rotation.y = yaw; scene.add(root); root.updateMatrixWorld(true);
    // roof + upper walls share one fade uniform per building; one material clone per kit material class
    const mats = new Map<THREE.Material, THREE.Material>();
    for (const key of ["roof", "upper"]) def.parts[key]?.traverse((o) => {
      const m = o as THREE.Mesh; if (!m.isMesh) return; const src = m.material as THREE.Material;
      if (src === kitMaterial("emissive")) return;
      m.material = mats.get(src) ?? mats.set(src, fadeMaterial(src, fade)).get(src)!;
    });
    const allOpen = p.o?.open === true, open = new Set<string>(Array.isArray(p.o?.open) ? (p.o.open as string[]) : []);
    const doors: Door[] = def.doors.map((d) => {
      const leaf = def.parts[d.leaf];
      return { id: d.id, gateId: `${p.id}:${d.id}`, leaf, closed: leaf.rotation.y, open: d.open, k: 0, locked: d.locked, breakable: !!d.breakable, startOpen: !d.locked && !d.breakable && (allOpen || open.has(d.id)) };
    });
    const h: House = { id: p.id!, kind: p.k.slice(9), p, def, y, fade, want: 0, ...e, doors, root };
    for (const key of def.lights) { // lamps: on only while the player is in or next to this building
      const pos = def.parts[key].getWorldPosition(new THREE.Vector3());
      addLamp({ pos, color: "#ffc27a", power: 16, range: 9, on: () => h.want > 0 || nearHouse(h, 5) });
    }
    houses.push(h);
    // countable objects (G1-21): the building itself, each door, each window and each piece of furniture
    objects.push({ x: p.x, z: p.z, k: p.k, big: true });
    for (const c of def.colliders) { if (c.t !== "box" || !(c.id !== undefined || c.low)) continue; const [wx, wz] = toWorld(p, c.x, c.z); objects.push({ x: wx, z: wz, k: c.id !== undefined ? "door" : "furniture", big: true }); }
  }
}
const lp = new THREE.Vector3(), lc = new THREE.Vector3();
function toLocal(h: House, v: THREE.Vector3, out: THREE.Vector3) {
  const dx = v.x - h.p.x, dz = v.z - h.p.z, c = Math.cos(h.p.yaw ?? 0), s = Math.sin(h.p.yaw ?? 0);
  return out.set(dx * c - dz * s, v.y - h.y, dx * s + dz * c);
}
function nearHouse(h: House, pad: number) { toLocal(h, G.pp, lp); return Math.abs(lp.x) < h.hx + pad && Math.abs(lp.z) < h.hz + pad; }
/** is a world point inside one of a building's interior volumes */
export function insideHouse(h: House, v: THREE.Vector3, pad = 0.1) {
  toLocal(h, v, lp);
  for (const i of h.def.interiors) if (Math.abs(lp.x - i.x) < i.w / 2 + pad && Math.abs(lp.z - i.z) < i.d / 2 + pad) return true;
  return false;
}
/** does the segment camera -> point pass through the building's box (slab test in its local space) */
function occludes(h: House, cam: THREE.Vector3, pt: THREE.Vector3) {
  toLocal(h, cam, lc); toLocal(h, pt, lp);
  const d = lp.clone().sub(lc), lo = [-h.hx - 0.4, 0, -h.hz - 0.4], hi = [h.hx + 0.4, h.h + 1.6, h.hz + 0.4], o = [lc.x, lc.y, lc.z], dir = [d.x, d.y, d.z];
  let t0 = 0, t1 = 0.97; // stop just short of the player: standing against the wall outside is not "behind"
  for (let a = 0; a < 3; a++) {
    if (Math.abs(dir[a]) < 1e-6) { if (o[a] < lo[a] || o[a] > hi[a]) return false; continue; }
    let ta = (lo[a] - o[a]) / dir[a], tb = (hi[a] - o[a]) / dir[a]; if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) return false;
  }
  return true;
}
/** how dark the daylight is right now (0 = outside, 1 = deep inside a room) */
export let darkK = 0;
let base: { sun: number; hemi: number } | null = null;
const chest = new THREE.Vector3();
export function resetHouses() {
  for (const h of houses) { h.fade.value = 0; h.want = 0; for (const d of h.doors) { d.k = d.startOpen ? 1 : 0; d.leaf.visible = true; d.leaf.rotation.y = d.startOpen ? d.open : d.closed; setGate(d.gateId, d.startOpen); } }
  darkK = 0;
}
/** per render frame: roof/upper fade, dark-room tint, door swing */
export function updateHouses(dt: number, under = false) {
  const st = G.stage; base ??= { sun: st.sun.intensity, hemi: st.hemi.intensity };
  chest.copy(G.pp).setY(G.pp.y + 1.1);
  let inside = false;
  for (const h of houses) {
    const d = Math.hypot(G.pp.x - h.p.x, G.pp.z - h.p.z);
    let want = 0;
    if (d < 40) { const inn = insideHouse(h, G.pp, 0.25); inside ||= inn; want = inn || occludes(h, st.camera.position, chest) ? 1 : 0; }
    h.want = want;
    h.fade.value += (want - h.fade.value) * Math.min(1, dt * 7); if (Math.abs(want - h.fade.value) < 0.01) h.fade.value = want;
    const hide = h.fade.value > 0.985; if (h.def.parts.roof) h.def.parts.roof.visible = !hide; if (h.def.parts.upper) h.def.parts.upper.visible = !hide;
    for (const dr of h.doors) { const g = gate(dr.gateId), to = g?.open ? 1 : 0; if (dr.k !== to) { dr.k += Math.sign(to - dr.k) * Math.min(Math.abs(to - dr.k), dt * 4.5); dr.leaf.rotation.y = dr.closed + (dr.open - dr.closed) * (dr.k * dr.k * (3 - 2 * dr.k)); } }
  }
  darkK += ((under ? 1.45 : inside ? 1 : 0) - darkK) * Math.min(1, dt * 4); // the grotto is darker still: only its lamps and the cave mouth light it
  st.sun.intensity = base.sun * (1 - 0.5 * darkK); st.hemi.intensity = base.hemi * (1 - 0.3 * darkK);
}
const doorOf = (gateId: string) => { for (const h of houses) for (const d of h.doors) if (d.gateId === gateId) return d; return null; };
/** E/F on a door: returns the prompt/toast text when it can't move, "" when it did */
export function useDoor(gateId: string): string {
  const d = doorOf(gateId), g = gate(gateId); if (!d || !g) return "";
  if (!g.open && d.breakable) return "Boarded up. Break it with the briefcase (V)";
  if (!g.open && d.locked && !G.pack.includes(d.locked) && !G.save.keys.includes(d.locked)) { sfx("nope"); return "Locked. It needs the Vine Key"; }
  if (g.open) { // don't shut a door on anyone standing in it
    if (Math.hypot(G.pp.x - g.x, G.pp.z - g.z) < 0.95 || G.enemies.some((e) => !e.down && Math.hypot(e.p.x - g.x, e.p.z - g.z) < 1.1)) return "Something is in the doorway";
  }
  setGate(gateId, !g.open); sfx("door"); return "";
}
/** a boarded door gave way: drop the leaf, throw splinters */
export function breakDoorVisual(gateId: string) {
  const d = doorOf(gateId), g = gate(gateId); if (!d || !g) return;
  d.leaf.visible = false; const at = new THREE.Vector3(g.x, groundHeight(g.x, g.z) + 1.1, g.z); burst(at, 22, "#b08a5a", 1.3); burst(at, 8, "#e8dcc0", 0.9);
}
/** the prompt for a door in reach */
export function doorPrompt(gateId: string) {
  const d = doorOf(gateId), g = gate(gateId); if (!d || !g) return "";
  if (g.open) return "E · Close the door";
  if (d.breakable) return "Boarded up: break it (V)";
  if (d.locked && !G.pack.includes(d.locked) && !G.save.keys.includes(d.locked)) return "🔒 Locked: needs the Vine Key";
  return d.locked ? "E · Unlock the door" : "E · Open the door";
}
void toWorld;
