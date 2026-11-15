// Enterable buildings at runtime (G1_BRIEF "Map v3" rule 3; mechanisms from the Duckov census: OcclusionFade,
// DarkRoomFade, SodaPointLight, Door, Breakable). A building is a kit_house HouseDef placed by the map:
//   - floors, wall bottoms (to 1.1 u), door frames, bars and furniture are static and go into the world chunks;
//   - the roof and the upper walls dither-fade. Inside: the roof, the camera-side walls and the partitions go, the far
//     walls stay so the room keeps its shape (W2's "smart" fade). Standing behind the building: everything fades;
//   - inside, the daylight drops (dark-room tint) and the building's lamps come on through the light pool;
//   - doors are gates in the grid: E/F opens and closes them, locked ones need their key, plank ones can be smashed;
//   - cracked wall sections are breakable gates too: intact -> flying debris + the remains.
import * as THREE from "three";
import { preloadHouse, building, type HouseDef } from "./kit_house";
import type { Placed } from "../contracts";
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
import { itemDef } from "../loot/tables";
import { sfx } from "../core/audio";
import { burst } from "../../fx";

export { preloadHouse };
type Door = { id: string; gateId: string; leaf: THREE.Object3D; closed: number; open: number; k: number; locked?: string; startOpen: boolean };
type Chunk = { o: THREE.Object3D; p0: THREE.Vector3; q0: THREE.Quaternion; v: THREE.Vector3; w: THREE.Vector3; rest: boolean };
type Crack = { gateId: string; intact: THREE.Object3D; debris: THREE.Object3D; remains: THREE.Object3D; chunks: Chunk[]; t: number };
export type House = {
  id: string; kind: string; p: Placed; def: HouseDef; y: number; near: { value: number }; far: { value: number }; want: number; inside: boolean;
  /** footprint centre and half extents in building space, wall height (occlusion test) */
  cx: number; cz: number; hx: number; hz: number; h: number; doors: Door[]; cracks: Crack[]; root: THREE.Object3D; nearParts: THREE.Object3D[]; farParts: THREE.Object3D[];
};
export const houses: House[] = [];
const defs = new Map<string, HouseDef>();
/** the HouseDef of a placed building (built once: the grid, the scatter and the scene all read the same one) */
export function houseDef(p: Placed): HouseDef { let d = defs.get(p.id!); if (!d) { d = building(p.k.slice(9)); defs.set(p.id!, d); } return d; }
const placedHouses = () => PLACED.filter((p) => p.k.startsWith("building:"));
/** world-space footprints (axis aligned after the quarter turn), for scatter, grass and the map to keep off the floors */
export function houseFootprints(): Footprint[] {
  return placedHouses().map((p) => { const s = houseDef(p).size, [x, z] = toWorld(p, s.x, s.z), quarter = Math.abs(Math.sin(p.yaw ?? 0)) > 0.5; return { x, z, hx: (quarter ? s.d : s.w) / 2, hz: (quarter ? s.w : s.d) / 2 }; });
}
/** the floor top is 0.08 above the building's origin: sink it so the floor sits just proud of the flattened ground */
const FLOOR = 0.05;
/** add every building to the world: static pieces into the chunk store, fading and moving parts into the scene */
export function buildHouses(scene: THREE.Scene) {
  for (const p of placedHouses()) {
    const def = houseDef(p), y = groundHeight(p.x, p.z) - FLOOR, yaw = p.yaw ?? 0, near = { value: 0 }, far = { value: 0 }, s = def.size;
    addPieces(def.pieces, p.x, p.z, yaw, 1, y);
    const root = def.parts.root; root.position.set(p.x, y, p.z); root.rotation.y = yaw; scene.add(root); root.updateMatrixWorld(true);
    // two fade uniforms per building: the roof + camera-side walls + partitions, and the far walls (north and east in world)
    const mats = new Map<string, THREE.Material>(), nearParts: THREE.Object3D[] = [], farParts: THREE.Object3D[] = [];
    const fadeAll = (o: THREE.Object3D | undefined, u: { value: number }, tag: string, list: THREE.Object3D[]) => {
      if (!o) return; list.push(o);
      o.traverse((c) => { const m = c as THREE.Mesh; if (!m.isMesh) return; const src = m.material as THREE.Material; if (src === kitMaterial("emissive")) return; const key = tag + src.uuid; m.material = mats.get(key) ?? mats.set(key, fadeMaterial(src, u)).get(key)!; });
    };
    fadeAll(def.parts.roof, near, "n", nearParts);
    const sides: [string, number, number][] = [["upper_s", 0, 1], ["upper_n", 0, -1], ["upper_e", 1, 0], ["upper_w", -1, 0]];
    for (const [key, lx, lz] of sides) { const [wx, wz] = toWorld({ x: 0, z: 0, yaw }, lx, lz), isFar = wz < -0.5 || wx > 0.5; fadeAll(def.parts[key], isFar ? far : near, isFar ? "f" : "n", isFar ? farParts : nearParts); }
    fadeAll(def.parts.upper_i, near, "n", nearParts);
    const openIds = new Set<string>(Array.isArray(p.o?.open) ? (p.o.open as string[]) : []), allOpen = p.o?.open === true;
    const doors: Door[] = def.doors.map((d) => { const leaf = def.parts[d.leaf]; return { id: d.id, gateId: `${p.id}:${d.id}`, leaf, closed: leaf.rotation.y, open: d.open, k: 0, locked: d.locked, startOpen: !d.locked && (allOpen || openIds.has(d.id)) }; });
    const cracks: Crack[] = (def.breakables ?? []).map((b) => {
      const debris = def.parts[b.debris], chunks: Chunk[] = (debris?.children ?? []).map((o) => ({ o, p0: o.position.clone(), q0: o.quaternion.clone(), v: new THREE.Vector3(), w: new THREE.Vector3(), rest: true }));
      return { gateId: `${p.id}:${b.id}`, intact: def.parts[b.intact], debris, remains: def.parts[b.remains], chunks, t: -1 };
    });
    const h: House = { id: p.id!, kind: p.k.slice(9), p, def, y, near, far, want: 0, inside: false, cx: s.x, cz: s.z, hx: s.w / 2, hz: s.d / 2, h: Math.max(3, ...def.interiors.map((i) => i.h)), doors, cracks, root, nearParts, farParts };
    for (const key of def.lights) { // lamps (W2: intensity 14, range 7): on only while the player is in or next to this building
      const pos = def.parts[key].getWorldPosition(new THREE.Vector3()); pos.y = Math.max(pos.y, y + 1.5);
      addLamp({ pos, color: "#ffc27a", power: 14, range: 8, on: () => h.want > 0 || nearHouse(h, 5) });
    }
    houses.push(h);
    // countable objects (G1-21): the building itself, each door, each window and each piece of furniture
    objects.push({ x: p.x, z: p.z, k: p.k, big: true });
    for (const c of def.colliders) { if (c.id === undefined && !c.low) continue; const [wx, wz] = c.t === "seg" ? toWorld(p, (c.ax + c.bx) / 2, (c.az + c.bz) / 2) : toWorld(p, c.x, c.z); objects.push({ x: wx, z: wz, k: c.id !== undefined ? "door" : c.t === "seg" ? "window" : "furniture", big: true }); }
  }
}
const lp = new THREE.Vector3(), lc = new THREE.Vector3();
function toLocal(h: House, v: THREE.Vector3, out: THREE.Vector3) {
  const dx = v.x - h.p.x, dz = v.z - h.p.z, c = Math.cos(h.p.yaw ?? 0), s = Math.sin(h.p.yaw ?? 0);
  return out.set(dx * c - dz * s, v.y - h.y, dx * s + dz * c);
}
function nearHouse(h: House, pad: number) { toLocal(h, G.pp, lp); return Math.abs(lp.x - h.cx) < h.hx + pad && Math.abs(lp.z - h.cz) < h.hz + pad; }
/** is a world point inside one of a building's interior volumes */
export function insideHouse(h: House, v: THREE.Vector3, pad = 0.1) {
  toLocal(h, v, lp);
  for (const i of h.def.interiors) if (Math.abs(lp.x - i.x) < i.w / 2 + pad && Math.abs(lp.z - i.z) < i.d / 2 + pad) return true;
  return false;
}
/** does the segment camera -> point pass through the building's box (slab test in its local space) */
function occludes(h: House, cam: THREE.Vector3, pt: THREE.Vector3) {
  toLocal(h, cam, lc); toLocal(h, pt, lp);
  const d = lp.clone().sub(lc), lo = [h.cx - h.hx - 0.3, 0, h.cz - h.hz - 0.3], hi = [h.cx + h.hx + 0.3, h.h + 1.8, h.cz + h.hz + 0.3], o = [lc.x, lc.y, lc.z], dir = [d.x, d.y, d.z];
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
/** start of a raid: doors as authored, cracked walls whole again unless the save keeps them open */
export function resetHouses() {
  for (const h of houses) {
    h.near.value = h.far.value = 0; h.want = 0; h.inside = false;
    for (const d of h.doors) { d.k = d.startOpen ? 1 : 0; d.leaf.visible = true; d.leaf.rotation.y = d.startOpen ? d.open : d.closed; setGate(d.gateId, d.startOpen); }
    for (const c of h.cracks) {
      const open = G.save.fixtures.includes("open:" + c.gateId); c.t = -1; setGate(c.gateId, open);
      if (c.intact) c.intact.visible = !open; if (c.debris) c.debris.visible = false; if (c.remains) c.remains.visible = open;
      for (const k of c.chunks) { k.o.position.copy(k.p0); k.o.quaternion.copy(k.q0); k.rest = true; }
    }
  }
  darkK = 0;
}
const dq = new THREE.Quaternion(), ev = new THREE.Euler();
const ease = (v: { value: number }, to: number, dt: number) => { v.value += (to - v.value) * Math.min(1, dt * 7); if (Math.abs(to - v.value) < 0.01) v.value = to; };
/** per render frame: roof/wall fade, dark-room tint, door swing, flying debris */
export function updateHouses(dt: number, under = false) {
  const st = G.stage; base ??= { sun: st.sun.intensity, hemi: st.hemi.intensity };
  chest.copy(G.pp).setY(G.pp.y + 1.1);
  let inside = false;
  for (const h of houses) {
    const d = Math.hypot(G.pp.x - h.p.x, G.pp.z - h.p.z);
    let inn = false, occ = false;
    if (d < 44) { inn = insideHouse(h, G.pp, 0.2); occ = !inn && occludes(h, st.camera.position, chest); inside ||= inn; }
    h.inside = inn; h.want = inn || occ ? 1 : 0;
    ease(h.near, h.want, dt); ease(h.far, occ ? 1 : 0, dt);
    for (const o of h.nearParts) o.visible = h.near.value < 0.985; for (const o of h.farParts) o.visible = h.far.value < 0.985;
    for (const dr of h.doors) { const g = gate(dr.gateId), to = g?.open ? 1 : 0; if (dr.k !== to) { dr.k += Math.sign(to - dr.k) * Math.min(Math.abs(to - dr.k), dt * 4.5); dr.leaf.rotation.y = dr.closed + (dr.open - dr.closed) * (dr.k * dr.k * (3 - 2 * dr.k)); } }
    for (const c of h.cracks) {
      if (c.t < 0) continue; c.t += dt;
      for (const k of c.chunks) {
        if (k.rest) continue;
        k.v.y -= 16 * dt; k.o.position.addScaledVector(k.v, dt); k.o.quaternion.multiply(dq.setFromEuler(ev.set(k.w.x * dt, k.w.y * dt, k.w.z * dt)));
        if (k.o.position.y < 0.14) { k.o.position.y = 0.14; if (Math.abs(k.v.y) < 1.4) k.rest = true; k.v.y *= -0.3; k.v.x *= 0.5; k.v.z *= 0.5; k.w.multiplyScalar(0.4); }
      }
      if (c.t > 9) { c.debris.visible = false; c.t = -1; }
    }
  }
  darkK += ((under ? 1.45 : inside ? 1 : 0) - darkK) * Math.min(1, dt * 4); // the grotto is darker still: only its lamps and the cave mouth light it
  st.sun.intensity = base.sun * (1 - 0.5 * darkK); st.hemi.intensity = base.hemi * (1 - 0.3 * darkK);
}
const doorOf = (gateId: string) => { for (const h of houses) for (const d of h.doors) if (d.gateId === gateId) return d; return null; };
const hasKey = (id: string) => G.pack.includes(id) || G.save.keys.includes(id);
export function openDoorForEnemy(gateId: string): boolean {
  const door = doorOf(gateId), current = gate(gateId);
  if (!door || !current || current.open || door.locked) return false;
  setGate(gateId, true); sfx("door"); return true;
}
/** E/F on a door: returns the toast text when it can't move, "" when it did */
export function useDoor(gateId: string): string {
  const d = doorOf(gateId), g = gate(gateId); if (!d || !g) return "";
  if (!g.open && d.locked && !hasKey(d.locked)) { sfx("nope"); return `Locked. It needs the ${itemDef(d.locked).name}`; }
  if (g.open && (Math.hypot(G.pp.x - g.x, G.pp.z - g.z) < 0.95 || G.enemies.some((e) => !e.down && Math.hypot(e.p.x - g.x, e.p.z - g.z) < 1.1))) return "Something is in the doorway"; // never shut a door on anyone
  setGate(gateId, !g.open); sfx("door"); return "";
}
/** a door or a cracked wall of a building gave way (combat calls this through props.breakWallVisual) */
export function breakDoorVisual(gateId: string) {
  const g = gate(gateId); if (!g) return;
  const at = new THREE.Vector3(g.x, groundHeight(g.x, g.z) + 1.1, g.z);
  const d = doorOf(gateId);
  if (d) { d.leaf.visible = false; burst(at, 22, "#b08a5a", 1.3); burst(at, 8, "#e8dcc0", 0.9); return; }
  for (const h of houses) for (const c of h.cracks) {
    if (c.gateId !== gateId) continue;
    burst(at, 26, "#b9ab94", 1.4); burst(at, 10, "#e8dcc0", 1.0);
    if (c.intact) c.intact.visible = false; if (c.remains) c.remains.visible = true; if (!c.debris) return; c.debris.visible = true; c.t = 0;
    const hit = c.debris.worldToLocal(G.pp.clone().setY(at.y));
    for (const k of c.chunks) { const dir = k.p0.clone().sub(hit); dir.y = 0; const l = dir.length() || 1; k.v.copy(dir.multiplyScalar(1 / l)).multiplyScalar(2.2 + Math.random() * 3.2).setY(2.5 + Math.random() * 3.5); k.w.set((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9); k.rest = false; }
  }
}
/** the prompt for a door in reach */
export function doorPrompt(gateId: string) {
  const d = doorOf(gateId), g = gate(gateId); if (!d || !g) return "";
  if (g.open) return "E · Close the door";
  if (d.locked && !hasKey(d.locked)) return `🔒 Locked: needs the ${itemDef(d.locked).name}`;
  return d.locked ? "E · Unlock the door" : "E · Open the door";
}
