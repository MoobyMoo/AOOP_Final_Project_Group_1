// Interactive and animated props of the raid map, built from the structures kit (kit_build.ts): breakable wall
// sections with debris, the vine door, exits (hatch, raft, tunnel), portals into the grotto, the zipline, readable
// easter eggs, and the small motions that make set pieces alive (flames, flags, the hatch periscope).
// Built once with the world; resetProps() puts every per-raid state back at the start of a raid.
import * as THREE from "three";
import { G, V } from "../core/state";
import { WALLS, DOOR, POI, PORTALS, ZIPLINES, PLACED, UNDER_X, DEMO, COVE_BOAT, ROUTE_LOCKS, portalOpen } from "./map/grove";
import { houseModule } from "./kit_house";
import { groundHeight } from "./terrain";
import { setGate, gate } from "./grid";
import { addPieces, placedParts, contactShade, pieceRec } from "./dress";
import { dynamicDecals } from "./decals";
import { addLamp } from "./lights";
import { mergePieces } from "./kitutil";
import { breakDoorVisual } from "./buildings";
import * as K from "./kit_build";
import { burst } from "../../fx";

type Chunk = { o: THREE.Object3D; p0: THREE.Vector3; q0: THREE.Quaternion; v: THREE.Vector3; w: THREE.Vector3; rest: boolean };
type BreakWall = { id: string; parts: Record<string, THREE.Object3D>; chunks: Chunk[]; t: number; mid: THREE.Vector3 };
const walls = new Map<string, BreakWall>();
const yawOf = (a: number[], b: number[]) => Math.atan2(b[0] - a[0], b[1] - a[1]);

export type Exit = { id: "hatch" | "raft" | "tunnel" | "boat"; x: number; z: number; ring: THREE.Mesh; fill: THREE.Mesh; bonus: number; open: boolean; armed?: boolean };
export const exits: Exit[] = [];
export const portalMarks: { id: string; x: number; z: number; to: { x: number; z: number }; label: string; oneWay?: boolean }[] = [];
/** things you can read with E: the notes and gags from the Shorts (LORE.md) */
export const reads: { x: number; z: number; label: string; text: () => string }[] = [];
let vineLeaf: THREE.Object3D | null = null, vineK = 0, zipHandle: THREE.Object3D | null = null, zipA = new THREE.Vector3(), zipB = new THREE.Vector3();
const flames: THREE.Object3D[] = [], flags: THREE.Object3D[] = [];
let scope: THREE.Object3D | null = null, hatchLid: THREE.Object3D | null = null, lever: THREE.Object3D | null = null, bucket: THREE.Object3D | null = null;
export const zipAnchors = () => ({ a: zipA, b: zipB, handle: zipHandle });

export function buildProps(scene: THREE.Scene) {
  // ---- breakable wall sections: intact / debris / remains (kit_build wallSection)
  for (const w of WALLS) {
    if (!w.breakable) continue;
    const [a, b] = w.pts, len = Math.hypot(b[0] - a[0], b[1] - a[1]), mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, y = groundHeight(mx, mz) - 0.04, yaw = yawOf(a, b);
    const built = K.wallSection(w.kind as K.WallKind, { length: len, breakable: true });
    if (pieceRec.on) pieceRec.owner = { src: "prop", k: "breakwall:" + w.kind, x: mx, z: mz, yaw, s: 1, id: w.id };
    addPieces(built.pieces, mx, mz, yaw, 1, y); pieceRec.owner = null;
    built.parts.root.position.set(mx, y, mz); built.parts.root.rotation.y = yaw; scene.add(built.parts.root);
    const chunks: Chunk[] = (built.parts.debris?.children ?? []).map((o) => ({ o, p0: o.position.clone(), q0: o.quaternion.clone(), v: new THREE.Vector3(), w: new THREE.Vector3(), rest: true }));
    walls.set(w.id, { id: w.id, parts: built.parts, chunks, t: -1, mid: new THREE.Vector3(mx, y + 1, mz) });
  }
  // ---- the vine door: frame in the chunks, the leaf swings
  { const d = K.door(), y = groundHeight(DOOR.x, DOOR.z) - 0.04; if (pieceRec.on) pieceRec.owner = { src: "prop", k: "vine_door", x: DOOR.x, z: DOOR.z, yaw: DOOR.yaw, s: 1, id: "vine" }; addPieces(d.pieces, DOOR.x, DOOR.z, DOOR.yaw, 1, y); pieceRec.owner = null;
    d.parts.root.position.set(DOOR.x, y, DOOR.z); d.parts.root.rotation.y = DOOR.yaw; scene.add(d.parts.root); vineLeaf = d.parts.leaf; }
  // ---- exits: a ground ring that fills while you stand still in it
  exits.length = 0;
  const ring = (x: number, z: number, color: string) => {
    const r = new THREE.Mesh(new THREE.RingGeometry(1.75, 2, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false })); r.rotation.x = -Math.PI / 2; r.position.set(x, groundHeight(x, z) + 0.07, z); r.renderOrder = 2;
    const f = new THREE.Mesh(new THREE.CircleGeometry(1.75, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false })); f.rotation.x = -Math.PI / 2; f.position.copy(r.position); f.scale.setScalar(0.01); f.renderOrder = 2;
    scene.add(r, f); return [r, f] as const;
  };
  { const [r, f] = ring(POI.hatch.x, POI.hatch.z, "#ffe066"); exits.push({ id: "hatch", x: POI.hatch.x, z: POI.hatch.z, ring: r, fill: f, bonus: 0, open: true }); }
  { const [r, f] = ring(POI.raft.x, POI.raft.z, "#7fd4ff"); exits.push({ id: "raft", x: POI.raft.x, z: POI.raft.z, ring: r, fill: f, bonus: 0.3, open: true }); }
  { const [r, f] = ring(POI.tunnelExit.x, POI.tunnelExit.z, "#c9a0ff"); exits.push({ id: "tunnel", x: POI.tunnelExit.x, z: POI.tunnelExit.z, ring: r, fill: f, bonus: 0, open: false }); }
  // the cove boat (G1.5-13): the slice's second way home, the same ring and countdown as the others. The smugglers'
  // rowboat (the house kit's boat) lies at the waterline beside the ring
  { const [r, f] = ring(POI.coveBoat.x, POI.coveBoat.z, "#9fe6c8"); exits.push({ id: "boat", x: POI.coveBoat.x, z: POI.coveBoat.z, ring: r, fill: f, bonus: 0, open: true });
    try { const b = houseModule("boat"), q = COVE_BOAT.boat, y = groundHeight(q.x, q.z) + 0.04; if (pieceRec.on) pieceRec.owner = { src: "prop", k: "cove_boat", x: q.x, z: q.z, yaw: q.yaw, s: 1, id: "cove-boat" };
      // it lies on the shelving beach: tilt it to the slope like a loose prop (dress.ts settle), up to 12 deg
      const e = 0.9, gx = (groundHeight(q.x + e, q.z) - groundHeight(q.x - e, q.z)) / (2 * e), gz = (groundHeight(q.x, q.z + e) - groundHeight(q.x, q.z - e)) / (2 * e);
      const n = new THREE.Vector3(-gx, 1, -gz).normalize(), tq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n), ang = 2 * Math.acos(Math.min(1, tq.w)), max = (12 * Math.PI) / 180;
      addPieces(b.pieces, q.x, q.z, q.yaw, 1.25, y, ang > max ? new THREE.Quaternion().slerp(tq, max / ang) : tq); pieceRec.owner = null; contactShade(q.x, q.z, 1.4, 2.6, q.yaw, 4, 0.6); } catch (e) { console.warn("cove boat model", e); } }
  // the demo slice shuts the raft (north of the locks) and the tunnel (the grotto)
  if (DEMO) for (const e of exits) if (e.id === "raft" || e.id === "tunnel") { e.open = false; e.ring.visible = e.fill.visible = false; }
  // ---- portals (the models are placed pieces; these are the stand-here marks)
  portalMarks.length = 0;
  for (const p of PORTALS) {
    if (!portalOpen(p.id)) continue; // shut in the demo: the cave has fallen in, the well is boarded (reads below)
    portalMarks.push({ id: p.id, x: p.a.x, z: p.a.z, to: p.b, label: p.label, oneWay: p.oneWay });
    if (!p.oneWay) portalMarks.push({ id: p.id + "-back", x: p.b.x, z: p.b.z, to: p.a, label: "Climb back up" });
  }
  // ---- the zipline: tower, landing, cable and trolley from the kit
  for (const z of ZIPLINES) {
    const a = V(z.from.x, z.from.z, groundHeight(z.from.x, z.from.z)), b = V(z.to.x, z.to.z, groundHeight(z.to.x, z.to.z));
    const zl = K.zipline(a, b, { h: z.from.h, endH: z.to.h });
    scene.add(mergePieces(zl.pieces));
    scene.add(zl.parts.root); zipHandle = zl.parts.handle; zipA.copy(zl.parts.a.position); zipB.copy(zl.parts.b.position);
    portalMarks.push({ id: "zip-" + z.id, x: a.x, z: a.z + 3.2, to: { x: b.x, z: b.z }, label: "Ride the zipline to the beach", oneWay: true });
  }
  // ---- moving bits of placed set pieces, lamps for the light pool
  for (const p of PLACED) {
    const parts = p.id ? placedParts.get(p.id) : undefined;
    if (p.k === "hatch" && parts) { scope = parts.scope ?? null; hatchLid = parts.lid ?? null; }
    if (p.k === "fusebox" && parts) lever = parts.lever ?? null;
    if (p.k === "well" && parts) bucket = parts.bucket ?? null;
    if (p.k === "campfire") addLamp({ pos: new THREE.Vector3(p.x, groundHeight(p.x, p.z) + 1.0, p.z), color: "#ff9a4a", power: p.x > UNDER_X ? 26 : 7, range: 11, on: () => true }); // outdoors 14 -> 7 (F1): at 14 it washed the soot ring under the fire back to orange
    if ((p.k === "lantern" || p.k === "lantern_post") && p.x > UNDER_X) addLamp({ pos: new THREE.Vector3(p.x, groundHeight(p.x, p.z) + (p.k === "lantern" ? 0.7 : 2.2), p.z), color: "#ffd08a", power: 12, range: 9, on: () => true });
    if (p.k === "vault") for (const [lx, lz] of [[-3, -3], [3, -3]]) addLamp({ pos: new THREE.Vector3(p.x + lx, groundHeight(p.x, p.z) + 2.2, p.z + lz), color: "#ffb060", power: 14, range: 9, on: () => true });
  }
  for (const parts of placedParts.values()) { if (parts.flame) flames.push(parts.flame); if (parts.flag) flags.push(parts.flag); }
  // ---- readable gags (LORE.md easter eggs)
  const byId = (id: string) => PLACED.find((p) => p.id === id)!;
  reads.length = 0;
  { const p = byId("bottle"); reads.push({ x: p.x, z: p.z, label: "Read the note in the bottle", text: () => "“Day 40. They took my ledger. Tell my accountant I regret nothing.” — the last exile" }); }
  { const p = byId("audit"); reads.push({ x: p.x, z: p.z + 1.2, label: "Read the notice", text: () => "NOTICE OF AUDIT. Subject: one (1) Monkey Businessman. “We know where the bananas went.”" }); }
  { const p = byId("statue"); reads.push({ x: p.x + 1.6, z: p.z, label: "Read the plaque", text: () => "A golden monkey in a bowler hat. The plaque: IN BANANAS WE TRUST." }); }
  { const p = byId("vat"); reads.push({ x: p.x + 2.6, z: p.z + 2.6, label: "Look at the vat", text: () => "MOLASSES. The tank split years ago; the spill never quite dried." }); }
  { const p = byId("bomber"); reads.push({ x: p.x - 2.4, z: p.z + 3.4, label: "Look at the bomber", text: () => "Bullet holes all over the wings, none on the engines. The ones hit there never made it back." }); }
  // the demo's shut ways: read them with E (the map marks them too, ROUTE_LOCKS)
  for (const l of ROUTE_LOCKS) reads.push({ x: l.inside[0], z: l.inside[1], label: `Look at the ${l.label.toLowerCase()}`, text: () => l.note });
  if (!portalOpen("camp-well")) { const w = PORTALS.find((q) => q.id === "camp-well")!; reads.push({ x: w.a.x, z: w.a.z, label: "Look down the well", text: () => "The Peel Gang nailed planks over it. Something down there echoes." }); }
  { const p = byId("fusebox"); reads.push({ x: p.x - 1.2, z: p.z + 1.2, label: "Pull the lever (PULL TO OPEN)", text: pullLever }); }
}
let leverT = -1;
function pullLever() {
  leverT = 0;
  if (!G.save.keys.includes("vine_key")) return "PULL TO OPEN. Something clunks behind the wall. Nothing opens.";
  const open = !gate("vine")?.open; setGate("vine", open);
  return open ? "Wired backwards: you pushed it back, and the vine door opens." : "PULL TO OPEN. The vine door slams shut. Someone wired this backwards.";
}
/** start of a raid: walls back up (unless the save keeps them open), doors per the keyring, exits disarmed */
export function resetProps() {
  for (const w of walls.values()) {
    const open = !!gate(w.id)?.persist && G.save.fixtures.includes("open:" + w.id);
    w.t = -1; w.parts.intact.visible = !open; w.parts.debris.visible = false; w.parts.remains.visible = open;
    for (const c of w.chunks) { c.o.position.copy(c.p0); c.o.quaternion.copy(c.q0); c.o.visible = true; c.rest = true; }
    setGate(w.id, open);
  }
  const vine = G.save.keys.includes("vine_key"); setGate("vine", vine); vineK = vine ? 1 : 0; if (vineLeaf) vineLeaf.rotation.y = vine ? K.DOOR_OPEN : 0;
  const tunnel = !DEMO && G.save.fixtures.includes("open:grotto-rubble"); // the demo's tunnel is caved in whatever the save says
  for (const e of exits) { e.armed = false; e.fill.scale.setScalar(0.01); if (e.id === "tunnel") { e.open = tunnel; e.ring.visible = e.fill.visible = tunnel; } }
  if (hatchLid) hatchLid.rotation.x = 0; leverT = -1; if (lever) lever.rotation.x = 0;
}
/** a breakable wall (or a boarded door) just gave way */
export function breakWallVisual(id: string) {
  const w = walls.get(id); if (!w) { breakDoorVisual(id); return; }
  burst(w.mid, 26, "#b08a5a", 1.4); burst(w.mid, 10, "#e8dcc0", 1.0);
  w.parts.intact.visible = false; w.parts.debris.visible = true; w.parts.remains.visible = true; w.t = 0;
  const hit = w.parts.root.worldToLocal(G.pp.clone().setY(w.mid.y));
  for (const c of w.chunks) {
    const dir = c.p0.clone().sub(hit); dir.y = 0; const l = dir.length() || 1; dir.multiplyScalar(1 / l);
    c.v.copy(dir).multiplyScalar(2.2 + Math.random() * 3.2).setY(2.5 + Math.random() * 3.5); c.w.set((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9); c.rest = false;
  }
  if (id === "grotto-rubble") { const e = exits.find((q) => q.id === "tunnel"); if (e) { e.open = true; e.ring.visible = e.fill.visible = true; } }
}
export function openDoorVisual() { setGate("vine", true); }
const dq = new THREE.Quaternion(), ev = new THREE.Euler();
// contact shades under the loot crates: they spawn per raid, so they get one small decal mesh of their own, rebuilt
// when the crate list changes (one draw call for all of them)
let crateShade: THREE.Mesh | null = null, crateKey = "";
function shadeCrates() {
  const list = G.crates.filter((c) => c.kind !== "body"), key = list.length ? `${list.length}:${list[0].id}:${list[list.length - 1].id}` : "";
  if (key === crateKey) return; crateKey = key;
  if (crateShade) { crateShade.removeFromParent(); crateShade.geometry.dispose(); crateShade = null; }
  crateShade = dynamicDecals(() => { for (const c of list) { if (c.fixed === "satchel" || c.obj.position.y > groundHeight(c.x, c.z) + 0.2) continue; contactShade(c.x, c.z, c.kind === "container" ? (c.r ?? 0.6) * 1.3 : c.tier === "green" ? 0.85 : 0.68, c.kind === "container" ? (c.r ?? 0.6) * 0.95 : 0.5, c.obj.rotation.y, 4, 0.82); } });
  if (crateShade) G.stage.scene.add(crateShade);
}
/** per render frame */
export function updateProps(dt: number) {
  const t = G.time;
  shadeCrates();
  for (const w of walls.values()) {
    if (w.t < 0) continue; w.t += dt;
    for (const c of w.chunks) {
      if (c.rest) continue;
      c.v.y -= 16 * dt; c.o.position.addScaledVector(c.v, dt);
      c.o.quaternion.multiply(dq.setFromEuler(ev.set(c.w.x * dt, c.w.y * dt, c.w.z * dt)));
      if (c.o.position.y < 0.12) { c.o.position.y = 0.12; if (Math.abs(c.v.y) < 1.4) c.rest = true; c.v.y *= -0.3; c.v.x *= 0.5; c.v.z *= 0.5; c.w.multiplyScalar(0.4); }
    }
    if (w.t > 9) { w.parts.debris.visible = false; w.t = -1; } // the stumps stay; the loose chunks are cleared away
  }
  const open = gate("vine")?.open ? 1 : 0;
  if (vineLeaf && vineK !== open) { vineK += Math.sign(open - vineK) * Math.min(Math.abs(open - vineK), dt * 1.8); vineLeaf.rotation.y = K.DOOR_OPEN * vineK * vineK * (3 - 2 * vineK); }
  for (let i = 0; i < flames.length; i++) { const f = flames[i], k = 1 + Math.sin(t * 11 + i * 2.1) * 0.08 + Math.sin(t * 23 + i) * 0.05; f.scale.set(1 + (k - 1) * 0.5, k, 1 + (k - 1) * 0.5); }
  for (let i = 0; i < flags.length; i++) flags[i].rotation.y = Math.sin(t * 1.7 + i * 1.3) * 0.25;
  if (scope) scope.rotation.y = Math.atan2(G.pp.x - POI.hatch.x, G.pp.z - POI.hatch.z);
  if (hatchLid) { const want = G.extract.id === "hatch" && G.extract.t > 0.1 ? -1.9 : 0; hatchLid.rotation.x += (want - hatchLid.rotation.x) * Math.min(1, dt * 5); }
  if (bucket) bucket.position.y += Math.sin(t * 1.3) * 0.0006;
  if (lever && leverT >= 0) { leverT += dt; lever.rotation.x = 1.1 * Math.min(1, leverT * 6) * (leverT > 1.2 ? Math.max(0, 1 - (leverT - 1.2) * 3) : 1); if (leverT > 1.6) leverT = -1; }
}
