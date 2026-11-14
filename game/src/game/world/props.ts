// Interactive and landmark props for the raid map. PLACEHOLDER visuals from the L1 kit until Fable C2's kit_build
// lands; the gameplay hooks (break, open, exits, portals, zipline) stay here.
import * as THREE from "three";
import { G, V } from "../core/state";
import { WALLS, DOOR, POI, PORTALS, ZIPLINES, LANDMARKS, CLEARINGS } from "./layout";
import { groundHeight } from "./terrain";
import { breakWall, setDoorOpen, block, state as gridState } from "./grid";
import { mat } from "../render/shading";
import { ruinBlock, rubble, vine, tent, campfire, barrel, crate, bananaPlant } from "./kit";
import { burst } from "../../fx";

const wallVis = new Map<string, THREE.Object3D>();
const yawOf = (a: [number, number], b: [number, number]) => Math.atan2(b[0] - a[0], b[1] - a[1]);
function wallSection(kind: string, a: [number, number], b: [number, number], breakable: boolean) {
  const g = new THREE.Group(), len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  g.position.set((a[0] + b[0]) / 2, groundHeight((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), (a[1] + b[1]) / 2); g.rotation.y = yawOf(a, b);
  if (kind === "palisade") for (let s = -len / 2; s <= len / 2; s += 0.32) { const h = 2.0 + Math.sin(s * 7) * 0.25; const p = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, h, 6), mat(breakable ? "#a07a48" : "#8a6a42", { flat: true })); p.position.set(0, h / 2, s); g.add(p); const tip = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.3, 6), mat("#8a6a42")); tip.position.set(0, h + 0.15, s); g.add(tip); }
  else if (kind === "stone") for (let s = -len / 2; s < len / 2; s += 0.9) for (let r = 0; r < 4; r++) { const bl = ruinBlock(0.88, 0.5, 0.6); bl.position.set(0, 0.25 + r * 0.5, s + (r % 2) * 0.3); g.add(bl); }
  else if (kind === "hull") for (let s = -len / 2; s < len / 2; s += 0.45) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.4, 0.42), mat(breakable ? "#c9b48a" : (Math.round(s * 3) % 2 ? "#e8e2d4" : "#3f8f9a"), { rough: 0.7 })); p.position.set(0, 1.2, s); p.rotation.x = (Math.random() - 0.5) * 0.08; g.add(p); }
  else if (kind === "rock") { for (let k = 0; k < 9; k++) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 + Math.random() * 0.4, 0), mat("#7a6f62", { flat: true })); r.position.set((Math.random() - 0.5) * 0.8, 0.4 + (k % 3) * 0.5, -len / 2 + (k / 9) * len); g.add(r); } }
  if (breakable) { // the "you can break this" telltale: painted cracks + a warm X
    const x = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: crackTex(), transparent: true, depthWrite: false }));
    x.position.set(-0.2, 1.1, 0); x.rotation.y = -Math.PI / 2; g.add(x); const x2 = x.clone(); x2.position.x = 0.2; x2.rotation.y = Math.PI / 2; g.add(x2);
  }
  g.traverse((m) => { (m as THREE.Mesh).castShadow = true; (m as THREE.Mesh).receiveShadow = true; });
  return g;
}
let crackT: THREE.Texture | null = null;
function crackTex() {
  if (crackT) return crackT; const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d")!;
  x.strokeStyle = "#ffcf6a"; x.lineWidth = 6; x.lineCap = "round"; x.beginPath(); x.moveTo(12, 12); x.lineTo(52, 52); x.moveTo(52, 12); x.lineTo(12, 52); x.stroke();
  x.strokeStyle = "#3a2a1a"; x.lineWidth = 2; x.beginPath(); x.moveTo(32, 4); x.lineTo(28, 20); x.lineTo(36, 30); x.lineTo(30, 44); x.stroke();
  crackT = new THREE.CanvasTexture(c); return crackT;
}
export function breakWallVisual(id: string) {
  const v = wallVis.get(id); if (!v) return; const p = v.position.clone().setY(v.position.y + 1);
  burst(p, 26, "#b08a5a", 1.4); burst(p, 10, "#e8dcc0", 1.0);
  let k = 0; const f = () => { k += 0.08; v.scale.y = Math.max(0.05, 1 - k); v.position.y -= 0.03; if (k < 1) requestAnimationFrame(f); else v.visible = false; }; f();
}
let doorObj: THREE.Group;
export function openDoorVisual() { if (!doorObj) return; let k = 0; const f = () => { k += 0.03; doorObj.children[0].rotation.y = -k * 1.6; if (k < 1) requestAnimationFrame(f); }; f(); }

export type Exit = { id: "hatch" | "raft" | "tunnel"; x: number; z: number; ring: THREE.Mesh; fill: THREE.Mesh; bonus: number; open: boolean };
export const exits: Exit[] = [];
export const portalMarks: { id: string; x: number; z: number; to: { x: number; z: number }; label: string; oneWay?: boolean }[] = [];

export function buildProps(scene: THREE.Scene) {
  // walls
  for (const w of WALLS) for (let k = 0; k < w.pts.length - 1; k++) { const s = wallSection(w.kind, w.pts[k], w.pts[k + 1], !!w.breakable); scene.add(s); if (w.breakable) wallVis.set(w.id, s); }
  // persistent openings from earlier raids
  for (const w of WALLS) if (w.breakable?.persist && G.save.fixtures.includes("open:" + w.id)) { breakWall(w.id); const v = wallVis.get(w.id); if (v) v.visible = false; }
  // the vine door
  doorObj = new THREE.Group(); doorObj.position.set(DOOR.x, groundHeight(DOOR.x, DOOR.z), DOOR.z); doorObj.rotation.y = DOOR.yaw + Math.PI / 2;
  const leaf = new THREE.Group(); leaf.position.x = -DOOR.w / 2; doorObj.add(leaf);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(DOOR.w, 2.8, 0.3), mat("#7a5230")); slab.position.set(DOOR.w / 2, 1.4, 0); leaf.add(slab);
  for (let i = 0; i < 6; i++) { const v = vine(2.6); v.position.set(0.3 + i * 0.55, 0.2, 0.2); leaf.add(v); }
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.22, 16), mat("#ffd84a", { emissive: "#ffb020", ei: 1.2 })); hole.position.set(DOOR.w / 2, 1.4, 0.17); leaf.add(hole);
  for (const s of [-1, 1]) { const post = ruinBlock(0.8, 3.4, 0.8); post.position.set(s * (DOOR.w / 2 + 0.4), 1.7, 0); doorObj.add(post); }
  const lintel = ruinBlock(DOOR.w + 1.8, 0.6, 0.9); lintel.position.y = 3.6; doorObj.add(lintel);
  scene.add(doorObj);
  const doorOpenNow = G.save.keys.includes("key"); setDoorOpen(doorOpenNow); if (doorOpenNow) leaf.rotation.y = -1.6;
  // exits
  exits.length = 0;
  const ring = (x: number, z: number, color: string) => {
    const r = new THREE.Mesh(new THREE.RingGeometry(1.75, 2, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false })); r.rotation.x = -Math.PI / 2; r.position.set(x, groundHeight(x, z) + 0.05, z); r.renderOrder = 2;
    const f = new THREE.Mesh(new THREE.CircleGeometry(1.75, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false })); f.rotation.x = -Math.PI / 2; f.position.copy(r.position); f.scale.setScalar(0.01); f.renderOrder = 2;
    scene.add(r, f); return [r, f] as const;
  };
  { const [r, f] = ring(POI.hatch.x, POI.hatch.z, "#ffe066"); exits.push({ id: "hatch", x: POI.hatch.x, z: POI.hatch.z, ring: r, fill: f, bonus: 0, open: true });
    const h = new THREE.Group(); h.position.set(POI.hatch.x, groundHeight(POI.hatch.x, POI.hatch.z), POI.hatch.z);
    const mound = new THREE.Mesh(new THREE.SphereGeometry(1.4, 20, 10, 0, 6.3, 0, 1.2), mat("#e0c48c")); mound.scale.y = 0.35; h.add(mound);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.85, 0.16, 24), mat("#6f7a80", { rough: 0.4 })); lid.position.y = 0.42; h.add(lid);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.05, 6, 18), mat("#c9302c")); wheel.rotation.x = Math.PI / 2; wheel.position.y = 0.55; h.add(wheel);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.4, 8), mat("#4a5258")); scope.position.set(1.1, 0.7, -0.3); h.add(scope);
    scene.add(h); block(POI.hatch.x + 1.1, POI.hatch.z - 0.3, 0.2, false); }
  { const [r, f] = ring(POI.raft.x, POI.raft.z, "#7fd4ff"); exits.push({ id: "raft", x: POI.raft.x, z: POI.raft.z, ring: r, fill: f, bonus: 0.3, open: true });
    const g = new THREE.Group(); g.position.set(POI.raft.x, -0.1, POI.raft.z - 2.6);
    for (let i = 0; i < 5; i++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 2.6, 10), mat("#a8743f")); l.rotation.x = Math.PI / 2; l.position.set(-0.9 + i * 0.45, 0.25, 0); g.add(l); }
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), mat("#5a3f28")); mast.position.set(0.6, 1.4, 0); g.add(mast);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), mat("#e8493a", { emissive: "#e8493a", ei: 0.3 })); (flag.material as THREE.Material).side = THREE.DoubleSide; flag.position.set(1.05, 2.25, 0); g.add(flag);
    scene.add(g); }
  { const open = G.save.fixtures.includes("open:grotto-rubble"); const [r, f] = ring(POI.tunnelExit.x, POI.tunnelExit.z, "#c9a0ff"); r.visible = f.visible = open; exits.push({ id: "tunnel", x: POI.tunnelExit.x, z: POI.tunnelExit.z, ring: r, fill: f, bonus: 0, open }); }
  // portals
  portalMarks.length = 0;
  for (const p of PORTALS) {
    portalMarks.push({ id: p.id, x: p.a.x, z: p.a.z, to: p.b, label: p.label, oneWay: p.oneWay });
    if (!p.oneWay) portalMarks.push({ id: p.id + "-back", x: p.b.x, z: p.b.z, to: p.a, label: "Climb back up" });
    const mk = (x: number, z: number, kind: string) => {
      const g = new THREE.Group(); g.position.set(x, groundHeight(x, z), z);
      if (kind === "camp-well") { const r = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.05, 0.8, 18, 1, true), mat("#9a8f80", { flat: true })); (r.material as THREE.Material).side = THREE.DoubleSide; r.position.y = 0.4; g.add(r); const hole = new THREE.Mesh(new THREE.CircleGeometry(0.95, 18), new THREE.MeshBasicMaterial({ color: "#120c08" })); hole.rotation.x = -Math.PI / 2; hole.position.y = 0.3; g.add(hole); }
      else { const arch = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.55, 8, 16, Math.PI), mat(x > 90 ? "#5d554c" : "#6f6458", { flat: true })); arch.position.y = 0.2; g.add(arch); const dark = new THREE.Mesh(new THREE.CircleGeometry(1.25, 16, 0, Math.PI), new THREE.MeshBasicMaterial({ color: "#0d0907" })); dark.position.set(0, 0.2, -0.1); g.add(dark); }
      g.traverse((m) => { (m as THREE.Mesh).castShadow = true; }); scene.add(g);
    };
    mk(p.a.x, p.a.z, p.id); mk(p.b.x, p.b.z, "back");
  }
  // zipline
  for (const z of ZIPLINES) {
    const a = V(z.from.x, z.from.z, groundHeight(z.from.x, z.from.z) + z.from.h), b = V(z.to.x, z.to.z, groundHeight(z.to.x, z.to.z) + z.to.h + 1.4);
    const plat = new THREE.Group(); plat.position.set(a.x, groundHeight(a.x, a.z), a.z);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, z.from.h, 6), mat("#6e4b2e")); leg.position.set(dx * 0.9, z.from.h / 2, dz * 0.9); plat.add(leg); }
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.2, 2.2), mat("#9a7348")); deck.position.y = z.from.h; plat.add(deck);
    const ladder = new THREE.Mesh(new THREE.BoxGeometry(0.6, z.from.h, 0.1), mat("#7a5a3c")); ladder.position.set(0, z.from.h / 2, 1.2); ladder.rotation.x = -0.15; plat.add(ladder);
    scene.add(plat); block(a.x, a.z, 1.2, false);
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, a.distanceTo(b), 4), mat("#3a3a40")); cable.position.copy(a).lerp(b, 0.5); cable.lookAt(b); cable.rotateX(Math.PI / 2); scene.add(cable);
    portalMarks.push({ id: "zip-" + z.id, x: a.x, z: a.z + 1.6, to: { x: b.x, z: b.z }, label: "Ride the zipline to the beach", oneWay: true });
  }
  // landmarks: quick stand-ins (Fable C2 replaces these)
  const camp = CLEARINGS.find((c) => c.id === "camp")!;
  scene.add(at(tent(), camp.x - 5, camp.z - 4, 0.5), at(campfire(), POI.campfire.x, POI.campfire.z, 0), at(barrel(), camp.x + 4, camp.z - 6, 0), at(barrel(), camp.x + 4.8, camp.z - 5.2, 0));
  block(camp.x - 5, camp.z - 4, 1.6); block(POI.campfire.x, POI.campfire.z, 0.8, false);
  for (const l of LANDMARKS) {
    if (l.id === "watchtower") { const g = new THREE.Group(); for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 3.2, 6), mat("#6e4b2e")); leg.position.set(dx * 1.1, 1.6, dz * 1.1); g.add(leg); } const d = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.2, 2.8), mat("#9a7348")); d.position.y = 3.2; g.add(d); const roof = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.2, 4), mat("#c9b48a")); roof.position.y = 5.2; roof.rotation.y = Math.PI / 4; g.add(roof); scene.add(at(g, l.x, l.z + 2.2, 0)); }
    else if (l.id === "vat") { const v = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.9, 3.2, 20, 1, true, 0.6, 5.2), mat("#8f7a5a", { rough: 0.5 })); (v.material as THREE.Material).side = THREE.DoubleSide; v.position.y = 1.6; const g = new THREE.Group(); g.add(v); const puddle = new THREE.Mesh(new THREE.CircleGeometry(3.4, 24), mat("#5a2f10", { rough: 0.2 })); puddle.rotation.x = -Math.PI / 2; puddle.position.set(1.2, 0.04, 1.5); g.add(puddle); scene.add(at(g, l.x, l.z, 0)); block(l.x, l.z, 1.9); }
    else if (l.id === "bomber") { const g = new THREE.Group(); const body = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.7, 9, 14), mat("#7f8a6a")); body.rotation.z = Math.PI / 2; body.rotation.y = 0.3; body.position.y = 0.8; g.add(body); const wing = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.15, 12), mat("#7f8a6a")); wing.position.y = 0.9; wing.rotation.y = 0.3; g.add(wing); scene.add(at(g, l.x, l.z, 0)); block(l.x, l.z, 1.2); block(l.x - 2.6, l.z + 0.8, 1.0); block(l.x + 2.6, l.z - 0.8, 1.0); }
    else if (l.id === "statue") { const g = new THREE.Group(); const b = new THREE.Mesh(new THREE.BoxGeometry(1, 0.8, 1), mat("#c4ab84")); b.position.y = 0.4; g.add(b); const s = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), mat("#ffd84a", { rough: 0.25, emissive: "#ffb020", ei: 0.4 })); s.position.y = 1.4; g.add(s); scene.add(at(g, l.x, l.z, 0)); block(l.x, l.z, 0.7); }
    else if (l.id === "tractor") { const g = new THREE.Group(); const b = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 2.6), mat("#b8552e")); b.position.y = 1.0; g.add(b); for (const [x, z, r] of [[-1, -0.8, 0.8], [1, -0.8, 0.8], [-0.9, 1, 0.5], [0.9, 1, 0.5]] as const) { const w = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.4, 14), mat("#2f2a30")); w.rotation.z = Math.PI / 2; w.position.set(x, r, z); g.add(w); } scene.add(at(g, l.x, l.z, 0.4)); block(l.x, l.z, 1.5); }
    else if (l.id === "falls") { const sheet = new THREE.Mesh(new THREE.PlaneGeometry(4, 6), new THREE.MeshBasicMaterial({ color: "#d8f4ff", transparent: true, opacity: 0.55, depthWrite: false })); sheet.position.set(l.x, 3, l.z - 0.6); scene.add(sheet); }
    else if (l.id === "ferry") { /* the hull walls are the ferry for now */ const fun = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 2.6, 14), mat("#e8493a")); fun.position.set(l.x + 1.5, 2.6, l.z); scene.add(fun); }
  }
  void rubble; void crate; void bananaPlant; void gridState;
}
const at = (o: THREE.Object3D, x: number, z: number, yaw: number) => { o.position.set(x, groundHeight(x, z), z); o.rotation.y = yaw; o.traverse((m) => { (m as THREE.Mesh).castShadow = true; (m as THREE.Mesh).receiveShadow = true; }); return o; };
