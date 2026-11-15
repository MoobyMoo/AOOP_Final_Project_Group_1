// GUN MODELS: one GunView for any gun id in GUNS (combat/guns.ts).
//   kingpin45  the authored Kingpin (combat/kingpin.ts), unchanged
//   others     public/models/guns/<id>.glb when the artist's file has landed, else a built-in placeholder
// preloadGunModels() once at boot (it also loads the Kingpin); createGunView(id) and gunPickupModel(id) are synchronous
// after it. Before the preload, or with no file, a gun shows its placeholder.
//
// GLB LAYOUT (Fable's guns kit, tools/blender/guns/manifest.json): `<gunId>` > `body` > nodes; `frame` is the fixed part.
// Grip at the origin, bore along +z, ejection on +x. Points `muzzle_flash` (the muzzle) and `eject`; empties
// socket_sight / socket_muzzle / socket_mag / socket_rail (laser) / socket_grip / socket_stock with extras.rides naming
// the part each moves with. The root's extras say what moves and how: `moving` (slide, bolt, fore_end, hammer,
// bolt_handle) runs back `travel` u along -z, or turns `swing` deg about +x (the revolver hammer), or for a bolt action
// lifts `boltLift` deg about +z on its pivot (the node origin) then runs back; `mag` names the magazine node (mag,
// box_mag, or a loading point: cylinder, shells, tube, which bob on reload and show no mag attachment); `builtinSight`
// hides while a sight is fitted. No clips: the motion is procedural from {fireT, reloadT}. The Kingpin-era names
// (`slide`/`bolt`, `mag`, `muzzle`, rides "slide"/"mag") still work. The bipod stays folded.
// HOLD: every non-pistol is two-handed; `support` (the off hand) sits on socket_grip, else on the pump fore-end (riding
// it), else under the handguard 60% of the way to the muzzle; `stockReach` = how far the frame reaches behind the grip.
//
// PLACEHOLDERS: chunky per-class silhouettes from a few rounded boxes and cylinders, vertex coloured and merged into
// three meshes (static body, slide/bolt, magazine): <= 3 draw calls, cached per id. Dark gunmetal and wood like the
// Kingpin, with one band in the gun's tier colour. Lengths (grip at the origin; the Kingpin measures 1.11 u, z -0.37 to
// 0.74): pistol 1.06 (Pocket Change 0.91), SMG 1.55 (Insider Trader's can 1.77), rifle 2.08, shotgun 2.2, sniper 2.49
// (Long Ledger 2.6), LMG 2.25. Attachments mount on the same named sockets as on the Kingpin, with its models.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { GunView, GunAtts, AttSlot } from "../contracts";
import { GUNS, GUN_IDS, type GunDef } from "./guns";
import { tierColor } from "../loot/tiers";
import { createKingpin, preloadKingpin, attachmentAsset, gunMaterial, gunMat, SOCKET_OF } from "./kingpin";

const KINGPIN_ID = "kingpin45";
const GUN_URL = (id: string) => `${import.meta.env.BASE_URL}models/guns/${id}.glb`;
export type GunModelSource = "glb" | "placeholder" | "kingpin";

// ================================================================================================ motion (both paths)
/** per-gun motion, from its class and fire mode. recoil: body kick-up (rad) at the shot; back/up: body shove (u);
 *  travel: how far the slide/bolt/pump runs back (u); slow: a bolt or pump throw instead of a blow-back;
 *  tiltX/tiltZ: the body's reload tilt (rad; the Kingpin's clip turns up and rolls left about this much); drop: how
 *  far the magazine falls (u) */
type Motion = { recoil: number; roll: number; back: number; up: number; travel: number; slow: boolean; tiltX: number; tiltZ: number; drop: number };
function motionOf(d: GunDef): Motion {
  const k = Math.min(1.5, Math.max(0.5, d.kick)), slow = d.fire === "bolt";
  const travel = d.cls === "pistol" ? 0.13 : d.cls === "sniper" ? 0.18 : d.cls === "shotgun" ? (slow ? 0.16 : 0.1) : 0.1;
  const pistol = d.cls === "pistol";
  return {
    // the Kingpin's fire clip peaks at 0.08 rad up, 0.024 rad roll, 0.028 u back, 0.01 u up (kick 1)
    recoil: 0.08 * k, roll: 0.024 * k, back: 0.028 * Math.min(2, Math.max(0.6, d.kick)), up: 0.01 * k, travel, slow,
    tiltX: pistol ? -0.38 : -0.2, tiltZ: pistol ? -0.45 : -0.38, drop: pistol ? 0.34 : 0.42,
  };
}
const sstep = (x: number) => { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); };
const seg = (t: number, a: number, b: number) => { const x = (t - a) / (b - a); return x < 0 ? 0 : x > 1 ? 1 : x; };

// ================================================================================================ placeholder kit
const BODY = 0, MOVER = 1, MAG = 2;
type Part = typeof BODY | typeof MOVER | typeof MAG;
type Sock = { slot: AttSlot; p: THREE.Vector3; rides: Part; rx: number };
type Placeholder = {
  geo: [THREE.BufferGeometry, THREE.BufferGeometry | null, THREE.BufferGeometry | null]; mover: "slide" | "bolt"; muzzle: THREE.Vector3; eject: THREE.Vector3; sockets: Sock[];
  /** the off hand (gun space, or the mover's on a pump) and the stock's reach behind the grip */ support: { pos: THREE.Vector3; onMover: boolean } | null; stockReach: number;
};

// palette: dielectric albedos (the stage sun shows a lit dielectric at about 2.5x, kp_common.py), matched by eye to the
// Kingpin's gunmetal, graphite, steel and ivory under the same light
const C = {
  gunmetal: "#2b2f3d", graphite: "#34363f", dark: "#16171d", steel: "#5b616b", walnut: "#56331b", oak: "#7a4f2a",
  poly: "#262830", olive: "#3c4629", tin: "#6f747c", rust: "#6a4b37", pipe: "#5e5a55", gold: "#a8741c", brass: "#9c7a34", bead: "#d8c9a0",
};
type Style = { metal: string; frame: string; furn: string; furn2: string; mag: string; accent: string; scale: number };

/** paint a geometry one colour (vertex colours), non-indexed, no uv, so the parts merge */
function paint(g: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  const gg = g.index ? g.toNonIndexed() : g; if (gg !== g) g.dispose(); gg.deleteAttribute("uv");
  const c = new THREE.Color(hex), n = gg.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  gg.setAttribute("color", new THREE.BufferAttribute(arr, 3)); return gg;
}

class Kit {
  parts: THREE.BufferGeometry[][] = [[], [], []];
  sockets: Sock[] = [];
  muzzle = new THREE.Vector3(); eject = new THREE.Vector3();
  constructor(readonly def: GunDef) {}
  /** a rounded box centred at (x, y, z), turned rx about x (positive = the bottom swings back) */
  box(part: Part, hex: string, w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, r = 0.03) {
    const g = new RoundedBoxGeometry(w, h, d, 1, Math.min(r, w * 0.3, h * 0.3, d * 0.3));
    if (rx) g.rotateX(rx);
    g.translate(x, y, z); this.parts[part].push(paint(g, hex));
  }
  /** a cylinder along z (or x) centred at (x, y, z); rFront != r tapers it toward +z */
  cyl(part: Part, hex: string, r: number, len: number, x: number, y: number, z: number, n = 12, axis: "z" | "x" = "z", rFront = r) {
    const g = new THREE.CylinderGeometry(rFront, r, len, n);
    if (axis === "z") g.rotateX(Math.PI / 2); else g.rotateZ(-Math.PI / 2);
    g.translate(x, y, z); this.parts[part].push(paint(g, hex));
  }
  ball(part: Part, hex: string, r: number, x: number, y: number, z: number) {
    const g = new THREE.IcosahedronGeometry(r, 1); g.translate(x, y, z); this.parts[part].push(paint(g, hex));
  }
  /** a named socket, only for a slot the gun has (rx: turned about x like the part under it, e.g. a curved mag's foot) */
  socket(slot: AttSlot, x: number, y: number, z: number, rides: Part = BODY, rx = 0) {
    if (this.def.slots.includes(slot)) this.sockets.push({ slot, p: new THREE.Vector3(x, y, z), rides, rx });
  }
  /** shared bits: a pistol grip at the origin and a trigger guard in front of it */
  grip(st: Style, h: number, rake: number, y = 0, z = -0.12) {
    this.box(BODY, st.furn, 0.165, h, 0.21, 0, y, z, rake, 0.05);
  }
  guard(st: Style, y: number, z0: number, z1: number) {
    const zc = (z0 + z1) / 2;
    this.box(BODY, st.frame, 0.045, 0.032, z1 - z0, 0, y, zc, 0, 0.012);
    this.box(BODY, st.frame, 0.045, 0.13, 0.032, 0, y + 0.06, z1, 0, 0.012);
    this.box(BODY, C.dark, 0.03, 0.09, 0.03, 0, y + 0.075, zc - 0.02, -0.25, 0.01);
  }
}

function pistol(k: Kit, st: Style) {
  const by = 0.35;
  k.box(BODY, st.frame, 0.19, 0.15, 0.8, 0, 0.215, 0.17);                    // frame / dust cover, z -0.23..0.57
  k.box(MOVER, st.metal, 0.21, 0.2, 0.98, 0, 0.37, 0.17, 0, 0.045);          // slide, z -0.32..0.66
  for (const z of [-0.26, -0.21, -0.16]) k.box(MOVER, C.dark, 0.214, 0.12, 0.022, 0, 0.385, z, 0, 0.006); // serrations
  k.box(MOVER, st.accent, 0.216, 0.206, 0.05, 0, 0.37, 0.52, 0, 0.012);      // tier band
  k.box(MOVER, C.dark, 0.04, 0.045, 0.04, 0, 0.485, 0.6, 0, 0.01);           // front sight
  k.box(MOVER, C.dark, 0.13, 0.05, 0.05, 0, 0.485, -0.27, 0, 0.012);         // rear sight
  k.cyl(BODY, C.steel, 0.058, 0.05, 0, by, 0.665);                           // barrel crown
  k.cyl(BODY, C.dark, 0.034, 0.02, 0, by, 0.685);
  k.box(BODY, st.frame, 0.17, 0.09, 0.1, 0, 0.2, -0.26, 0, 0.03);            // beavertail
  k.box(BODY, st.furn, 0.2, 0.52, 0.26, 0, -0.05, -0.12, 0.2, 0.06);         // grip
  k.box(BODY, st.frame, 0.205, 0.05, 0.27, 0, -0.05, -0.12, 0.2, 0.012);     // grip band (a panel line)
  k.guard(st, 0.005, 0.0, 0.27);
  k.box(MAG, C.steel, 0.15, 0.46, 0.2, 0, -0.07, -0.12, 0.2, 0.02);         // magazine, hidden in the grip until it drops
  k.box(MAG, st.mag, 0.205, 0.06, 0.28, 0, -0.33, -0.177, 0.2, 0.02);       // baseplate
  k.muzzle.set(0, by, 0.7); k.eject.set(0.11, 0.43, 0.15);
  k.socket("muzzle", 0, by, 0.67); k.socket("sight", 0, 0.47, 0.15, MOVER); k.socket("laser", 0, 0.14, 0.45); k.socket("mag", 0, -0.36, -0.18, MAG);
}

function smg(k: Kit, st: Style, can: boolean) {
  const by = 0.32;
  k.box(BODY, st.metal, 0.2, 0.26, 0.78, 0, by, 0.1, 0, 0.04);               // receiver, z -0.29..0.49
  k.box(BODY, st.frame, 0.14, 0.04, 0.6, 0, 0.465, 0.08, 0, 0.015);          // top cover
  if (can) {                                                                  // integral suppressor
    k.cyl(BODY, C.dark, 0.105, 0.62, 0, by, 0.78, 14);
    k.cyl(BODY, st.frame, 0.09, 0.04, 0, by, 1.1, 14);
    k.cyl(BODY, st.accent, 0.11, 0.05, 0, by, 0.58, 14);
    k.cyl(BODY, st.accent, 0.11, 0.03, 0, by, 1.0, 14);
    k.muzzle.set(0, by, 1.13);
  } else {
    k.cyl(BODY, st.frame, 0.075, 0.28, 0, by, 0.63, 8);                       // barrel shroud
    k.cyl(BODY, st.accent, 0.08, 0.04, 0, by, 0.53, 8);
    k.cyl(BODY, C.steel, 0.042, 0.09, 0, by, 0.81);
    k.box(BODY, C.dark, 0.04, 0.08, 0.04, 0, 0.42, 0.72, 0, 0.01);
    k.muzzle.set(0, by, 0.87);
  }
  k.grip(st, 0.44, 0.22, -0.01, -0.07);
  k.guard(st, 0.04, 0.0, 0.2);
  // stubby wire stock and a butt pad
  k.cyl(BODY, C.dark, 0.025, 0.36, 0, 0.4, -0.45, 8); k.cyl(BODY, C.dark, 0.025, 0.36, 0, 0.24, -0.45, 8);
  k.box(BODY, st.furn, 0.13, 0.3, 0.07, 0, 0.32, -0.64, 0, 0.03);
  // bolt: the carrier showing in the port on +x and the cocking knob on -x
  k.box(MOVER, C.steel, 0.02, 0.1, 0.2, 0.101, 0.34, 0.15, 0, 0.008);
  k.box(MOVER, C.dark, 0.07, 0.05, 0.06, -0.12, 0.38, 0.26, 0, 0.015);
  // forward magazine
  k.box(MAG, st.mag, 0.12, 0.5, 0.17, 0, -0.02, 0.32, -0.08, 0.02);
  k.box(MAG, C.dark, 0.14, 0.05, 0.19, 0, -0.27, 0.34, -0.08, 0.015);
  k.eject.set(0.11, 0.38, 0.18);
  const under = can ? 0.215 : 0.245;
  k.socket("muzzle", 0, by, 0.85); k.socket("sight", 0, 0.485, 0.05); k.socket("laser", 0, under, can ? 0.9 : 0.68);
  k.socket("grip", 0, under, can ? 0.62 : 0.56); k.socket("stock", 0, by, -0.29); k.socket("mag", 0, -0.3, 0.34, MAG);
}

function rifle(k: Kit, st: Style) {
  const by = 0.35;
  k.box(BODY, st.metal, 0.2, 0.28, 0.72, 0, 0.33, 0.04, 0, 0.04);           // receiver, z -0.32..0.40
  k.box(BODY, C.dark, 0.12, 0.035, 0.6, 0, 0.485, 0.04, 0, 0.012);           // top rail
  k.box(BODY, st.furn2, 0.2, 0.2, 0.52, 0, 0.32, 0.66, 0, 0.05);            // handguard, z 0.40..0.92
  k.box(BODY, st.accent, 0.21, 0.21, 0.04, 0, 0.32, 0.43, 0, 0.012);
  k.box(BODY, C.dark, 0.06, 0.12, 0.06, 0, 0.45, 0.95, 0, 0.015);            // front sight block
  k.cyl(BODY, C.steel, 0.042, 0.3, 0, by, 1.07);                             // barrel, to 1.22
  k.grip(st, 0.42, 0.28, 0.0, -0.13);
  k.guard(st, 0.06, -0.02, 0.2);
  k.box(BODY, st.furn, 0.16, 0.26, 0.5, 0, 0.3, -0.56, -0.06, 0.05);         // stock, z -0.81..-0.31
  k.box(BODY, C.dark, 0.17, 0.32, 0.05, 0, 0.29, -0.83, -0.06, 0.02);        // butt pad
  k.box(MOVER, C.steel, 0.05, 0.06, 0.15, 0.12, 0.38, 0.0, 0, 0.015);        // charging handle (+x)
  k.box(MOVER, C.dark, 0.015, 0.09, 0.2, 0.1, 0.33, 0.14, 0, 0.005);         // bolt in the port
  k.box(MAG, st.mag, 0.13, 0.3, 0.19, 0, 0.1, 0.25, -0.1, 0.025);           // banana-curved magazine
  k.box(MAG, st.mag, 0.13, 0.26, 0.19, 0, -0.12, 0.32, -0.38, 0.025);
  k.box(MAG, st.mag, 0.13, 0.2, 0.19, 0, -0.3, 0.42, -0.62, 0.025);
  k.box(MAG, C.dark, 0.145, 0.04, 0.2, 0, -0.385, 0.48, -0.62, 0.012);
  k.muzzle.set(0, by, 1.25); k.eject.set(0.11, 0.38, 0.1);
  k.socket("muzzle", 0, by, 1.22); k.socket("sight", 0, 0.5, 0.0); k.socket("laser", 0, 0.22, 0.82); k.socket("grip", 0, 0.22, 0.58);
  k.socket("stock", 0, 0.33, -0.32); k.socket("mag", 0, -0.4, 0.49, MAG, -0.62);
}

function shotgun(k: Kit, st: Style, kind: "pump" | "box" | "single") {
  const by = 0.38;
  if (kind === "single") {                                                    // a pipe, a nail and hope
    k.box(BODY, st.frame, 0.17, 0.24, 0.58, 0, 0.32, 0.0, 0, 0.04);           // receiver block, z -0.29..0.29
    k.cyl(BODY, st.metal, 0.072, 1.04, 0, by, 0.79, 12);
    for (const z of [0.3, 0.86, 1.27]) k.cyl(BODY, C.dark, 0.088, 0.07, 0, by, z, 8);   // pipe couplings
    k.cyl(BODY, st.accent, 0.08, 0.04, 0, by, 0.42, 12);
    k.box(BODY, st.furn2, 0.15, 0.12, 0.42, 0, 0.25, 0.55, 0, 0.04);          // fore-end plank
    k.box(BODY, C.dark, 0.05, 0.1, 0.07, 0, 0.47, -0.16, -0.5, 0.015);         // hammer
    k.muzzle.set(0, by, 1.33);
  } else {
    k.box(BODY, st.metal, 0.19, 0.26, 0.56, 0, 0.32, 0.0, 0, 0.04);           // receiver, z -0.28..0.28
    k.cyl(BODY, C.steel, 0.055, 1.02, 0, by, 0.79);                          // long barrel, to 1.30
    k.box(BODY, C.bead, 0.03, 0.03, 0.03, 0, 0.45, 1.27, 0, 0.01);
    k.muzzle.set(0, by, 1.33);
    if (kind === "pump") {
      k.cyl(BODY, C.dark, 0.045, 0.8, 0, 0.255, 0.68);                       // magazine tube
      k.cyl(BODY, C.steel, 0.05, 0.04, 0, 0.255, 1.09);
      k.box(BODY, st.accent, 0.07, 0.22, 0.05, 0, 0.32, 1.02, 0, 0.015);     // barrel clamp in the tier colour
      k.cyl(MOVER, st.furn2, 0.085, 0.38, 0, 0.27, 0.62, 8);                 // pump
      for (const z of [0.5, 0.58, 0.66, 0.74]) k.cyl(MOVER, C.dark, 0.088, 0.018, 0, 0.27, z, 8);
    } else {
      k.box(BODY, st.furn2, 0.18, 0.18, 0.5, 0, 0.3, 0.55, 0, 0.05);          // fixed handguard
      k.box(BODY, st.accent, 0.19, 0.19, 0.04, 0, 0.3, 0.31, 0, 0.012);
      k.box(MOVER, C.steel, 0.05, 0.06, 0.12, 0.115, 0.36, 0.02, 0, 0.015);  // bolt handle
      k.box(MAG, st.mag, 0.15, 0.3, 0.24, 0, 0.09, 0.33, 0, 0.03);           // box magazine, ahead of the guard
      k.box(MAG, C.dark, 0.16, 0.04, 0.25, 0, -0.06, 0.33, 0, 0.012);
    }
  }
  k.grip(st, 0.4, 0.3, 0.0, -0.13);
  k.guard(st, 0.06, -0.04, 0.15);
  k.box(BODY, st.furn, 0.17, 0.28, 0.56, 0, 0.27, -0.56, -0.08, 0.05);       // stock, z -0.84..-0.28
  k.box(BODY, C.dark, 0.18, 0.34, 0.06, 0, 0.245, -0.86, -0.08, 0.02);
  k.eject.set(0.1, 0.4, 0.05);
  k.socket("muzzle", 0, by, 1.3); k.socket("sight", 0, 0.45, 0.0); k.socket("laser", 0, 0.21, kind === "pump" ? 0.95 : 0.7);
  k.socket("grip", 0, 0.21, 0.5); k.socket("stock", 0, 0.32, -0.28); k.socket("mag", 0, -0.08, 0.33, MAG);
}

function sniper(k: Kit, st: Style, long: boolean) {
  const by = 0.36, bl = long ? 1.34 : 1.2, bz = 0.33 + bl / 2;
  k.box(BODY, st.metal, 0.17, 0.22, 0.62, 0, 0.34, 0.02, 0, 0.04);           // receiver, z -0.29..0.33
  k.box(BODY, C.dark, 0.12, 0.07, 0.46, 0, 0.48, 0.02, 0, 0.025);            // scope riser (the hump)
  for (const z of [-0.14, 0.18]) k.box(BODY, st.frame, 0.15, 0.06, 0.06, 0, 0.495, z, 0, 0.015);
  k.cyl(BODY, C.steel, 0.042, bl, 0, by, bz, 12, "z", 0.03);                 // long thin barrel, tapered
  k.cyl(BODY, C.dark, 0.042, 0.05, 0, by, 0.33 + bl - 0.025, 12);           // crown
  k.box(BODY, st.furn2, 0.16, 0.15, 0.64, 0, 0.27, 0.63, 0, 0.05);          // fore-end
  k.box(BODY, st.accent, 0.165, 0.155, 0.04, 0, 0.27, 0.9, 0, 0.012);
  k.grip(st, 0.4, 0.3, 0.02, -0.12);
  k.guard(st, 0.08, -0.03, 0.16);
  k.box(BODY, st.furn, 0.16, 0.24, 0.62, 0, 0.32, -0.6, -0.04, 0.05);        // stock, z -0.91..-0.29
  k.box(BODY, st.furn, 0.13, 0.08, 0.34, 0, 0.46, -0.6, 0, 0.03);            // cheek riser
  k.box(BODY, st.furn, 0.15, 0.18, 0.32, 0, 0.16, -0.76, 0, 0.05);           // deep butt
  k.box(BODY, C.dark, 0.17, 0.4, 0.05, 0, 0.27, -0.93, 0, 0.02);             // butt pad
  // bolt: the handle out to +x with a ball knob, and the bolt shroud behind the receiver
  k.cyl(MOVER, C.steel, 0.018, 0.16, 0.16, 0.38, -0.12, 8, "x");
  k.ball(MOVER, C.steel, 0.042, 0.25, 0.38, -0.12);
  k.cyl(MOVER, C.steel, 0.05, 0.12, 0, by, -0.31, 10);
  const mh = long ? 0.22 : 0.14;
  k.box(MAG, st.mag, 0.12, mh, 0.24, 0, 0.24 - mh / 2, 0.1, 0, 0.02);
  k.box(MAG, C.dark, 0.13, 0.035, 0.25, 0, 0.24 - mh, 0.1, 0, 0.01);
  k.muzzle.set(0, by, 0.33 + bl + 0.03); k.eject.set(0.1, 0.4, 0.1);
  k.socket("muzzle", 0, by, 0.33 + bl); k.socket("sight", 0, 0.515, 0.02); k.socket("stock", 0, 0.34, -0.29);
  k.socket("laser", 0, 0.195, 0.75); k.socket("grip", 0, 0.195, 0.55); k.socket("mag", 0, 0.22 - mh, 0.1, MAG);
}

function lmg(k: Kit, st: Style) {
  const by = 0.36;
  k.box(BODY, st.metal, 0.26, 0.34, 0.84, 0, 0.33, 0.04, 0, 0.05);           // receiver, z -0.38..0.46
  k.box(BODY, st.frame, 0.24, 0.07, 0.5, 0, 0.53, 0.06, 0, 0.025);           // feed cover
  k.cyl(BODY, st.frame, 0.09, 0.62, 0, by, 0.77, 10);                         // barrel shroud, z 0.46..1.08
  for (const z of [0.62, 0.72, 0.82, 0.92, 1.02]) k.cyl(BODY, C.dark, 0.094, 0.035, 0, by, z, 10);
  k.cyl(BODY, st.accent, 0.096, 0.05, 0, by, 0.52, 10);
  k.cyl(BODY, C.steel, 0.045, 0.24, 0, by, 1.2);                             // barrel, to 1.32
  k.box(BODY, C.dark, 0.05, 0.1, 0.05, 0, 0.47, 1.0, 0, 0.012);              // front sight
  // folded bipod under the barrel
  k.box(BODY, C.dark, 0.16, 0.05, 0.06, 0, 0.29, 1.06, 0, 0.015);
  for (const x of [-0.06, 0.06]) k.box(BODY, C.dark, 0.035, 0.035, 0.26, x, 0.29, 1.2, 0, 0.012);
  k.grip(st, 0.42, 0.25, 0.0, -0.12);
  k.guard(st, 0.05, -0.02, 0.18);
  k.box(BODY, st.furn, 0.18, 0.3, 0.48, 0, 0.3, -0.62, 0, 0.05);            // stock, z -0.86..-0.38
  k.box(BODY, C.dark, 0.19, 0.38, 0.06, 0, 0.28, -0.88, 0, 0.02);
  k.box(MOVER, C.steel, 0.08, 0.05, 0.08, 0.17, 0.38, 0.12, 0, 0.015);       // charging handle (+x)
  // ammo box under the gun and the brass belt into the feed on -x
  k.box(MAG, st.mag, 0.3, 0.32, 0.34, -0.02, 0.0, 0.25, 0, 0.035);
  k.box(MAG, C.dark, 0.31, 0.04, 0.35, -0.02, 0.12, 0.25, 0, 0.012);
  k.box(MAG, C.brass, 0.05, 0.22, 0.14, -0.15, 0.24, 0.25, 0, 0.015);
  k.muzzle.set(0, by, 1.34); k.eject.set(0.14, 0.4, 0.15);
  k.socket("muzzle", 0, by, 1.32); k.socket("sight", 0, 0.565, 0.0); k.socket("laser", 0, 0.27, 0.8); k.socket("grip", 0, 0.27, 0.6);
  k.socket("stock", 0, 0.33, -0.38); k.socket("mag", 0, -0.16, 0.25, MAG);
}

/** per-gun looks: furniture, metal and magazine colours, size (on top of the class silhouette) */
function styleOf(d: GunDef): Style {
  const accent = "#" + new THREE.Color(tierColor(d.tier)).multiplyScalar(0.62).getHexString();
  const s: Style = { metal: C.gunmetal, frame: C.graphite, furn: C.poly, furn2: C.poly, mag: C.steel, accent, scale: 1 };
  switch (d.id) {
    case "pocket_change": Object.assign(s, { metal: C.tin, frame: C.steel, furn: C.walnut, mag: C.dark, scale: 0.87 }); break;
    case "golden_parachute": Object.assign(s, { metal: C.gold, furn: C.walnut, mag: C.gold, scale: 1.04 }); break;
    case "peel_sprayer": Object.assign(s, { metal: C.tin, frame: C.steel, furn: C.poly, mag: C.steel }); break;
    case "cash_flow": Object.assign(s, { furn: "#2d4a33", mag: C.dark }); break;
    case "insider_trader": Object.assign(s, { metal: C.poly, frame: C.dark, mag: C.dark }); break;
    case "bootleg_rifle": Object.assign(s, { metal: C.steel, furn: C.walnut, furn2: C.oak, mag: C.rust }); break;
    case "contraband_carbine": Object.assign(s, { furn: C.olive, furn2: C.olive, mag: C.dark }); break;
    case "board_meeting": Object.assign(s, { furn: C.poly, furn2: C.walnut, mag: C.dark }); break;
    case "pipe_dream": Object.assign(s, { metal: C.pipe, frame: C.rust, furn: C.oak, furn2: C.oak }); break;
    case "coconut_cracker": Object.assign(s, { furn: C.walnut, furn2: C.oak }); break;
    case "the_audit": Object.assign(s, { metal: C.poly, furn: C.dark, furn2: C.poly, mag: C.dark }); break;
    case "bean_counter": Object.assign(s, { furn: C.oak, furn2: C.oak, mag: C.dark }); break;
    case "long_ledger": Object.assign(s, { furn: C.walnut, furn2: C.walnut, frame: C.brass, mag: C.dark }); break;
    case "hostile_takeover": Object.assign(s, { furn: C.poly, mag: C.olive }); break;
  }
  return s;
}

/** the bottom of the gun under the bore at z (the hand's place under a handguard): the lowest vertex of `pos` (moved by
 *  m) within 0.06 u of z and within 0.4 u under the bore; just under the bore if nothing is there */
function underBore(pos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, m: THREE.Matrix4 | null, z: number, boreY: number): number {
  const v = new THREE.Vector3(); let best = Infinity;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i); if (m) v.applyMatrix4(m);
    if (Math.abs(v.z - z) > 0.06 || Math.abs(v.x) > 0.12 || v.y > boreY || v.y < boreY - 0.4) continue;
    if (v.y < best) best = v.y;
  }
  return best === Infinity ? boreY - 0.12 : best;
}

/** where the off hand goes on a gun with no fore-grip socket and no pump: 60% of the way from the grip to the muzzle,
 *  but no further forward than 0.12 u behind the front of the handguard (the furthest point of `pos` hanging more
 *  than 0.07 u under the bore: not the bare barrel), at the bottom of the gun there */
function handguardPoint(pos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, m: THREE.Matrix4 | null, muzzle: THREE.Vector3): THREE.Vector3 {
  const v = new THREE.Vector3(); let front = 0;
  for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); if (m) v.applyMatrix4(m); if (v.y < muzzle.y - 0.07 && Math.abs(v.x) < 0.12 && v.z > front) front = v.z; }
  const z = Math.max(0.1, Math.min(muzzle.z * 0.6, front - 0.12));
  return new THREE.Vector3(0, underBore(pos, m, z, muzzle.y), z);
}

const PLACEHOLDERS = new Map<string, Placeholder>();
function placeholder(id: string): Placeholder {
  const hit = PLACEHOLDERS.get(id); if (hit) return hit;
  const d = GUNS[id], k = new Kit(d), st = styleOf(d);
  switch (d.cls) {
    case "pistol": pistol(k, st); break;
    case "smg": smg(k, st, !!d.suppressed); break;
    case "rifle": rifle(k, st); break;
    case "shotgun": shotgun(k, st, d.mag <= 1 ? "single" : d.fire === "bolt" ? "pump" : "box"); break;
    case "sniper": sniper(k, st, d.id === "long_ledger"); break;
    case "lmg": lmg(k, st); break;
  }
  const merge = (gs: THREE.BufferGeometry[]) => {
    if (!gs.length) return null;
    const g = mergeGeometries(gs, false)!; for (const p of gs) p.dispose();
    if (st.scale !== 1) g.scale(st.scale, st.scale, st.scale);
    g.computeBoundingBox(); g.computeBoundingSphere(); return g;
  };
  const s = st.scale, geo: Placeholder["geo"] = [merge(k.parts[BODY])!, merge(k.parts[MOVER]), merge(k.parts[MAG])];
  const pump = d.cls === "shotgun" && d.fire === "bolt", muzzle = k.muzzle.multiplyScalar(s), sockets = k.sockets.map((q) => ({ ...q, p: q.p.multiplyScalar(s) }));
  // the off hand: on the fore-grip socket, on the pump, or under the handguard 60% of the way to the muzzle
  const grip = sockets.find((q) => q.slot === "grip");
  const support: Placeholder["support"] = d.cls === "pistol" ? null
    : grip ? { pos: grip.p.clone(), onMover: false }
    : pump && geo[1] ? { pos: geo[1].boundingBox!.getCenter(new THREE.Vector3()), onMover: true }
    : { pos: handguardPoint(geo[0].attributes.position, null, muzzle), onMover: false };
  const p: Placeholder = {
    geo, mover: d.cls === "pistol" || pump ? "slide" : "bolt", muzzle, eject: k.eject.multiplyScalar(s), sockets,
    support, stockReach: d.cls === "pistol" ? 0 : Math.max(0, -geo[0].boundingBox!.min.z),
  };
  PLACEHOLDERS.set(id, p);
  return p;
}
let PH_MAT: THREE.Material | null = null;
const placeholderMat = () => (PH_MAT ??= gunMat(0.5, "none"));

// ================================================================================================ GLB guns
/** per-gun data in the GLB root's extras (tools/blender/guns/manifest.json "extras"): the moving part and how it moves
 *  (travel u along -z; swing deg about +x; boltLift deg about +z, then travel), the magazine node and its kind
 *  (cylinder / shells / tube: a loading point, not a detachable magazine), the built-in sight a fitted one replaces */
type GlbExtras = { moving?: string; travel?: number; swing?: number; boltLift?: number; mag?: string; magKind?: string; builtinSight?: string; bipodDeploy?: number };
/** a loaded gun GLB, prepared once: materials swapped for the gun material, sockets brought under the parts they ride,
 *  the off-hand point found. Views clone `scene` (geometry and materials shared). fadeOf: a per-view dissolving copy of
 *  a material (the magazine's). support: in scene space, or in the local space of the node `on` (the pump). */
type GlbAsset = {
  scene: THREE.Object3D; fadeOf: Map<THREE.Material, () => THREE.Material>; ex: GlbExtras;
  support: { on: string | null; pos: THREE.Vector3 } | null; stockReach: number;
};
const GLBS = new Map<string, GlbAsset>();
const MISSING = new Set<string>();
const LOADING_POINTS = ["cylinder", "shells", "tube"];

function prepGlb(id: string, scene: THREE.Object3D): GlbAsset {
  const fadeOf: GlbAsset["fadeOf"] = new Map(), made = new Map<THREE.Material, THREE.Material>();
  scene.traverse((o) => {
    const m = o as THREE.Mesh; if (!m.isMesh) return;
    m.castShadow = true; m.receiveShadow = true;
    if (!m.geometry.attributes.color) { const n = m.geometry.attributes.position.count; m.geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3)); }
    const src = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
    let mat = made.get(src);
    if (!mat) {
      const map = src.map ?? null, orm = src.metalnessMap ?? src.roughnessMap ?? null;
      if (!map && src.emissive && src.emissive.getHex() !== 0) { // a glowing part (a sight dot, an LED): unlit, like attachments.glb
        mat = new THREE.MeshBasicMaterial({ color: src.emissive.clone().multiplyScalar(Math.max(1, src.emissiveIntensity ?? 1) * 2.5), toneMapped: false });
      } else if (map && map.name === "kingpin_palette") {
        // the guns kit paints with the Kingpin's palette (COLOR_0 = tint x AO, all three channels): its own material
        mat = gunMaterial(); fadeOf.set(mat, () => gunMaterial("uniform"));
      } else {
        for (const t of [map, orm]) if (t?.image && ((t.image as { width?: number }).width ?? 999) <= 64) { t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; }
        const rough = map ? 0.4 : src.roughness ?? 0.5, pbr = map ? { map, orm } : undefined, color = map ? new THREE.Color(1, 1, 1) : src.color.clone();
        const make = (fade: "none" | "uniform") => { const g = gunMat(rough, fade, pbr) as THREE.MeshStandardMaterial; g.color.copy(color); return g; };
        mat = make("none"); fadeOf.set(mat, () => make("uniform"));
      }
      made.set(src, mat);
    }
    m.material = mat;
  });
  let ex: GlbExtras = {};
  scene.traverse((o) => { const u = o.userData as GlbExtras & { gunId?: string }; if (!ex.moving && (u.gunId || u.moving)) ex = u; });
  // sockets move under the part they ride (extras.rides names it: slide, fore_end, mag, cylinder, shells, tube, box_mag)
  scene.updateMatrixWorld(true);
  for (const name of Object.values(SOCKET_OF)) {
    const o = scene.getObjectByName(name); if (!o) continue;
    const rides = String((o.userData as { rides?: string }).rides ?? "body"), to = rides === "body" ? null : scene.getObjectByName(rides) ?? null;
    let under = false; for (let p = o.parent; p; p = p.parent) if (p === to) under = true;
    if (to && !under) to.attach(o);
  }
  // fixed points a file may lack: the muzzle at the front of the bounds on the bore line, the port on +x
  const box = new THREE.Box3().setFromObject(scene), c = box.getCenter(new THREE.Vector3());
  if (!scene.getObjectByName("muzzle_flash") && !scene.getObjectByName("muzzle")) { const o = new THREE.Object3D(); o.name = "muzzle"; o.position.set(0, c.y + (box.max.y - c.y) * 0.4, box.max.z); scene.add(o); }
  if (!scene.getObjectByName("eject")) { const o = new THREE.Object3D(); o.name = "eject"; o.position.set(box.max.x, c.y + (box.max.y - c.y) * 0.5, Math.max(box.min.z, 0.1)); scene.add(o); }
  scene.updateMatrixWorld(true);
  // the off hand and the stock, from the fixed frame
  const pistol = GUNS[id].cls === "pistol", frame = (scene.getObjectByName("frame") as THREE.Mesh | undefined) ?? null;
  const mz = (scene.getObjectByName("muzzle_flash") ?? scene.getObjectByName("muzzle")!).getWorldPosition(new THREE.Vector3());
  const gripS = scene.getObjectByName("socket_grip"), fore = ex.moving === "fore_end" ? scene.getObjectByName("fore_end") ?? null : null;
  let support: GlbAsset["support"] = null;
  if (!pistol) {
    if (gripS) support = { on: null, pos: gripS.getWorldPosition(new THREE.Vector3()) };
    else if (fore) support = { on: "fore_end", pos: fore.worldToLocal(new THREE.Box3().setFromObject(fore).getCenter(new THREE.Vector3())) };
    else support = { on: null, pos: frame?.isMesh ? handguardPoint(frame.geometry.attributes.position, frame.matrixWorld, mz) : new THREE.Vector3(0, mz.y - 0.12, mz.z * 0.6) };
  }
  const stockReach = pistol ? 0 : Math.max(0, -new THREE.Box3().setFromObject(frame ?? scene).min.z);
  scene.name = `${id}_glb`;
  return { scene, fadeOf, ex, support, stockReach };
}

async function loadGlb(id: string): Promise<THREE.Object3D | null> {
  const url = GUN_URL(id);
  let buf: ArrayBuffer;
  try {
    const res = await fetch(url);
    if (!res.ok || (res.headers.get("content-type") ?? "").includes("text/html")) return null; // 404, or a dev server's SPA fallback page
    buf = await res.arrayBuffer();
  } catch { return null; }
  if (buf.byteLength < 12 || new DataView(buf).getUint32(0, true) !== 0x46546c67) return null; // not a binary glTF ("glTF")
  try {
    return (await new GLTFLoader().parseAsync(buf, url.slice(0, url.lastIndexOf("/") + 1))).scene;
  } catch (e) {
    console.warn(`models/guns/${id}.glb did not load; using the placeholder`, e);
    return null;
  }
}

let preloading: Promise<void> | null = null;
/** Load the Kingpin and every gun GLB that exists (once). Never throws: a gun with no file (or a broken one) keeps its
 *  placeholder. One console.info lists the guns on placeholders. */
export function preloadGunModels(): Promise<void> {
  return (preloading ??= (async () => {
    const ids = GUN_IDS.filter((id) => id !== KINGPIN_ID);
    const [kp, ...got] = await Promise.allSettled([preloadKingpin(), ...ids.map(loadGlb)]);
    if (kp.status === "rejected") console.warn("preloadGunModels: the Kingpin did not load", kp.reason);
    got.forEach((r, i) => {   // prepared after the Kingpin: the guns share its palette material
      const sc = r.status === "fulfilled" ? r.value : null;
      try { if (sc) { GLBS.set(ids[i], prepGlb(ids[i], sc)); return; } } catch (e) { console.warn(`models/guns/${ids[i]}.glb: prepare failed; using the placeholder`, e); }
      MISSING.add(ids[i]);
    });
    if (MISSING.size) console.info(`gun models: placeholders for ${[...MISSING].join(", ")}`);
  })().catch((e) => { console.warn("preloadGunModels:", e); }));
}

/** where a gun's model comes from right now (for the capture tools) */
export function gunModelSource(id: string): GunModelSource {
  return id === KINGPIN_ID || !Object.hasOwn(GUNS, id) ? "kingpin" : GLBS.has(id) ? "glb" : "placeholder";
}

// ================================================================================================ views
const SLIDE = 0, SWING = 1, LIFT = 2;
type Built = {
  root: THREE.Group; body: THREE.Group; muzzle: THREE.Object3D; eject: THREE.Object3D; mounts: Partial<Record<AttSlot, THREE.Object3D>>;
  /** the moving part and how it moves: SLIDE runs back `travel`; SWING turns `swing` rad about x; LIFT (a bolt
   *  handle) turns `lift` rad about z, runs back `travel`, then reverses */
  mover: THREE.Object3D | null; kind: number; travel: number; swing: number; lift: number;
  mag: THREE.Object3D | null; /** a loading point (cylinder, shells, tube): it bobs on reload, takes no mag attachment */ loadPoint: boolean;
  /** the magazine's fade uniforms (dither dissolve); none = it just hides */ fades: { value: number }[];
  /** hidden while a sight is fitted */ builtin: THREE.Object3D | null;
  support: THREE.Object3D | null; stockReach: number;
};
function supportPoint(parent: THREE.Object3D, pos: THREE.Vector3) {
  const o = new THREE.Object3D(); o.name = "support"; o.position.copy(pos); parent.add(o); return o;
}

function buildPlaceholder(id: string, mounts: boolean): Built {
  const P = placeholder(id), mat = placeholderMat();
  const root = new THREE.Group(); root.name = id;
  const body = new THREE.Group(); body.name = "body"; root.add(body);
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, name: string) => { const o = new THREE.Mesh(g, m); o.name = name; o.castShadow = true; o.receiveShadow = true; body.add(o); return o; };
  mesh(P.geo[0], mat, `${id}_body`);
  const mover = P.geo[1] ? mesh(P.geo[1], mat, P.mover) : null;
  const fades: { value: number }[] = [];
  let magMat = mat;
  if (P.geo[2] && mounts) { magMat = gunMat(0.5, "uniform"); fades.push(magMat.userData.uFade as { value: number }); }
  const mag = P.geo[2] ? mesh(P.geo[2], magMat, "mag") : null;
  const muzzle = new THREE.Object3D(); muzzle.name = "muzzle"; muzzle.position.copy(P.muzzle); body.add(muzzle);
  const eject = new THREE.Object3D(); eject.name = "eject"; eject.position.copy(P.eject); body.add(eject);
  const m: Built["mounts"] = {};
  if (mounts) for (const s of P.sockets) {
    const g = new THREE.Group(); g.name = SOCKET_OF[s.slot]; g.position.copy(s.p); g.rotation.x = s.rx;
    (s.rides === MOVER && mover ? mover : s.rides === MAG && mag ? mag : body).add(g); m[s.slot] = g;
  }
  const support = P.support ? supportPoint(P.support.onMover && mover ? mover : body, P.support.pos) : null;
  return { root, body, mover, kind: SLIDE, travel: motionOf(GUNS[id]).travel, swing: 0, lift: 0, mag, loadPoint: false, muzzle, eject, mounts: m, fades, builtin: null, support, stockReach: P.stockReach };
}

function buildGlb(id: string, A: GlbAsset, mounts: boolean): Built {
  const root = new THREE.Group(); root.name = id;
  const body = new THREE.Group(); body.name = "body"; root.add(body);
  const scene = A.scene.clone(true); body.add(scene);
  const ex = A.ex, D2R = Math.PI / 180;
  const mover = (ex.moving ? scene.getObjectByName(ex.moving) : scene.getObjectByName("slide") ?? scene.getObjectByName("bolt")) ?? null;
  const mag = scene.getObjectByName(ex.mag ?? "mag") ?? null, loadPoint = LOADING_POINTS.includes(ex.magKind ?? ex.mag ?? "");
  const fades: { value: number }[] = [];
  if (mag && mounts && !loadPoint) {   // the magazine's materials become per-view fading copies, so a dropped one dissolves alone
    const copies = new Map<THREE.Material, THREE.Material>();
    mag.traverse((o) => {
      const m = o as THREE.Mesh; if (!m.isMesh) return;
      const src = m.material as THREE.Material, make = A.fadeOf.get(src); if (!make) return;
      let c = copies.get(src);
      if (!c) { c = make(); fades.push(c.userData.uFade as { value: number }); copies.set(src, c); }
      m.material = c;
    });
  }
  const m: Built["mounts"] = {};
  if (mounts) for (const [slot, name] of Object.entries(SOCKET_OF) as [AttSlot, string][]) {
    const o = scene.getObjectByName(name); if (!o) continue;
    const g = new THREE.Group(); g.name = `${name}_mount`; o.add(g); m[slot] = g;
  }
  const S = A.support, support = S ? supportPoint((S.on ? scene.getObjectByName(S.on) : null) ?? scene, S.pos) : null;
  return {
    root, body, mover, kind: ex.boltLift ? LIFT : ex.swing ? SWING : SLIDE,
    travel: ex.travel ?? motionOf(GUNS[id]).travel, swing: (ex.swing ?? 0) * D2R, lift: (ex.boltLift ?? 0) * D2R,
    mag, loadPoint, fades, builtin: ex.builtinSight ? scene.getObjectByName(ex.builtinSight) ?? null : null,
    muzzle: scene.getObjectByName("muzzle_flash") ?? scene.getObjectByName("muzzle")!, eject: scene.getObjectByName("eject")!, mounts: m,
    support, stockReach: A.stockReach,
  };
}

const _v = new THREE.Vector3();
function makeView(id: string, B: Built): GunView {
  const M = motionOf(GUNS[id]), { body, mover, mag, muzzle, mounts, fades } = B;
  const mz0 = mover ? mover.position.z : 0, rx0 = mover ? mover.rotation.x : 0, ry0 = mover ? mover.rotation.y : 0, rz0 = mover ? mover.rotation.z : 0;
  const magY = mag ? mag.position.y : 0, muzzleRest = muzzle.position.clone();
  const shown: Partial<Record<AttSlot, string | null>> = {};
  const laser = new THREE.Object3D(); laser.name = "laserEmit";
  let magPalette: THREE.Material | null = null;   // the Kingpin palette, fading with this gun's magazine (a mag attachment)
  const view: GunView = {
    root: B.root, muzzle, eject: B.eject, laser: null,
    hold: GUNS[id].cls === "pistol" ? "one" : "two", support: B.support, stockReach: B.stockReach,
    setVariant() { /* the extended magazine is an attachment on these guns */ },
    setAttachments(fitted: GunAtts) {
      for (const slot of Object.keys(fitted) as AttSlot[]) {
        const id2 = fitted[slot], g = mounts[slot]; if (shown[slot] === id2) continue; shown[slot] = id2;
        // a loading point (revolver cylinder, shell holder, tube) takes the mag's stats but shows no magazine
        const a = slot === "mag" && B.loadPoint ? undefined : attachmentAsset(id2);
        if (g) {
          g.clear();
          if (a) {
            const o = a.obj.clone(true);
            let pal: THREE.Material = gunMaterial();
            if (slot === "mag" && fades.length) { if (!magPalette) { magPalette = gunMaterial("uniform"); fades.push(magPalette.userData.uFade as { value: number }); } pal = magPalette; }
            o.traverse((q) => { const mm = q as THREE.Mesh; if (mm.isMesh && mm.userData.palette) mm.material = pal; });
            g.add(o);
            if (a.emit && slot === "laser") { laser.position.copy(a.emit); g.add(laser); }
          }
        }
        if (slot === "sight" && B.builtin) B.builtin.visible = !(g && a);   // a fitted sight replaces the built-in scope
        if (slot === "laser") view.laser = g && a?.emit ? laser : null;
        // a muzzle device moves the flash and tracer origin to its own tip (through world space: the socket may sit
        // anywhere in a GLB's hierarchy)
        if (slot === "muzzle") {
          if (a?.tip && g && muzzle.parent) { B.root.updateWorldMatrix(true, true); muzzle.position.copy(muzzle.parent.worldToLocal(g.localToWorld(_v.copy(a.tip)))); }
          else muzzle.position.copy(muzzleRest);
        }
      }
    },
    pose(s) {
      const f = s.fireT, r = s.reloadT, firing = f >= 0 && f < 1;
      let kick = 0, cyc = 0, lift = 0;
      if (firing) {
        if (B.kind === LIFT) {          // bolt action: kick, lift the handle, run it back, forward, down
          const a = 1 - seg(f, 0, 0.25); kick = a * a * a;
          lift = sstep(seg(f, 0.18, 0.28)) * (1 - sstep(seg(f, 0.7, 0.8)));
          cyc = sstep(seg(f, 0.28, 0.42)) * (1 - sstep(seg(f, 0.56, 0.7)));
        } else if (M.slow) { const a = 1 - seg(f, 0, 0.25); kick = a * a * a; cyc = sstep(seg(f, 0.22, 0.42)) * (1 - sstep(seg(f, 0.56, 0.8))); }   // kick, then the pump
        else { const a = 1 - seg(f, 0, 0.5); kick = a * a * a; cyc = 1 - sstep(seg(f, 0, 0.5)); }                                                   // blow-back
      }
      let tilt = 0, drop = 0, alpha = 1, bob = 0;
      if (r >= 0 && r <= 1) {
        tilt = sstep(seg(r, 0, 0.2)) * (1 - sstep(seg(r, 0.75, 1)));
        if (B.loadPoint) bob = Math.sin(Math.PI * seg(r, 0.15, 0.85));
        else if (r < 0.5) { drop = sstep(seg(r, 0.15, 0.45)); alpha = 1 - sstep(seg(r, 0.25, 0.45)); }
        else { drop = 1 - sstep(seg(r, 0.5, 0.75)); alpha = sstep(seg(r, 0.5, 0.62)); }
      }
      body.rotation.set(-M.recoil * kick + M.tiltX * tilt, 0, M.roll * kick + M.tiltZ * tilt);
      body.position.set(0, M.up * kick, -M.back * kick);
      if (mover) {
        if (B.kind === SWING) mover.rotation.set(rx0 + B.swing * cyc, ry0, rz0);
        else { mover.position.z = mz0 - B.travel * cyc; if (B.kind === LIFT) mover.rotation.set(rx0, ry0, rz0 + B.lift * lift); }
      }
      if (mag) {
        mag.position.y = magY - M.drop * drop - 0.03 * bob;
        for (let i = 0; i < fades.length; i++) fades[i].value = alpha;
        mag.visible = fades.length ? alpha > 0.01 : alpha > 0.5;
      }
    },
  };
  view.pose({ fireT: 1, reloadT: -1 });
  return view;
}

/** A GunView for any gun id: the Kingpin as authored (one-handed), the gun's GLB when it has loaded, else its
 *  placeholder. Cheap to call again (geometry and materials are shared; each view is a new small Object3D graph). */
export function createGunView(id: string): GunView {
  if (id === KINGPIN_ID || !Object.hasOwn(GUNS, id)) return Object.assign(createKingpin(), { hold: "one" as const, support: null, stockReach: 0 });
  const A = GLBS.get(id);
  return makeView(id, A ? buildGlb(id, A, true) : buildPlaceholder(id, true));
}

/** A static model of the gun for the ground and for icons: at rest, no attachments, no fading materials. */
export function gunPickupModel(id: string): THREE.Object3D {
  if (id === KINGPIN_ID || !Object.hasOwn(GUNS, id)) return createKingpin().root;
  const A = GLBS.get(id);
  return (A ? buildGlb(id, A, false) : buildPlaceholder(id, false)).root;
}
