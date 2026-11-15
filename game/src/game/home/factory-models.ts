// Blockouts for the factory lines and the Fence's gambling props (Progression v0.2), until the Fable assets land
// (MODEL_TODO in home/factory-models.md lists them for the lead). Primitive-built in the shared bright materials,
// origin at the footprint centre, front +z, floor y 0, inside w x d, like the vault kit's facilities.
//
// Named nodes the game drives, which the final models must keep:
//   every line   conveyor (the belt, with roller_0..n that spin), hopper (the input bin), output_tray (the tray you
//                collect from) holding tray_slot0..5 (shown as the tray fills: home/bunker.ts), machine (the body)
//   ripen        ripening_racks, heat_lamp (glows)
//   bottler      bottle_line, filler_nozzle (bobs)
//   scrappress   press_ram (bobs), press_bed
//   coupon       printer_roller_0..1 (spin), coupon_stack, ink_tank
//   the Fence    roulette_wheel (spins during a red/black roll), fence_coin
import * as THREE from "three";
import { mat } from "../render/shading";
import { defOf } from "./facilities";

const box = (g: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, color: string, name?: string, o: Parameters<typeof mat>[1] = {}) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, o)); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; if (name) m.name = name; g.add(m); return m;
};
const cyl = (g: THREE.Object3D, r: number, h: number, x: number, y: number, z: number, color: string, name?: string, axis: "x" | "y" | "z" = "y", seg = 14) => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat(color)); m.position.set(x, y, z);
  if (axis === "x") m.rotation.z = Math.PI / 2; else if (axis === "z") m.rotation.x = Math.PI / 2;
  m.castShadow = m.receiveShadow = true; if (name) m.name = name; g.add(m); return m;
};
type Spin = { o: THREE.Object3D; axis: "x" | "z"; speed: number; power: boolean };

/** a production line: a steel base, a hopper at the back left, a belt across the front, the machine in the middle and
 *  the output tray at the front right */
export function lineModel(id: string): THREE.Group {
  const def = defOf(id) ?? { w: 3, d: 2 }, W = def.w - 0.15, D = def.d - 0.15;
  const g = new THREE.Group(); g.name = `fac_${id}`;
  const spin: Spin[] = [], bob: { o: THREE.Object3D; amp: number; speed: number; y: number }[] = [];
  box(g, W, 0.12, D, 0, 0.06, 0, "#7d8794", "base");
  // hopper: a funnel bin at the back left
  const hopper = new THREE.Group(); hopper.name = "hopper"; hopper.position.set(-W / 2 + 0.45, 0, -D / 2 + 0.4); g.add(hopper);
  box(hopper, 0.7, 0.7, 0.6, 0, 0.47, 0, "#8a6a3a"); box(hopper, 0.8, 0.1, 0.7, 0, 0.86, 0, "#6a4f2a");
  // the belt across the front, rollers under it
  const conveyor = new THREE.Group(); conveyor.name = "conveyor"; conveyor.position.set(-0.15, 0, D / 2 - 0.32); g.add(conveyor);
  const len = W - 0.9;
  box(conveyor, len, 0.06, 0.42, 0, 0.62, 0, "#2c2b30", "belt");
  for (const s of [-1, 1]) box(conveyor, len, 0.12, 0.05, 0, 0.6, s * 0.24, "#c29a5b");
  for (const x of [-len / 2 + 0.05, len / 2 - 0.05]) for (const z of [-0.2, 0.2]) box(conveyor, 0.06, 0.56, 0.06, x, 0.3, z, "#3a3a40");
  const nRoll = Math.max(3, Math.round(len / 0.35));
  for (let i = 0; i < nRoll; i++) { const r = cyl(conveyor, 0.045, 0.44, -len / 2 + (i + 0.5) * (len / nRoll), 0.56, 0, "#9aa0a8", `roller_${i}`, "z", 8); spin.push({ o: r, axis: "z", speed: -4, power: false }); }
  // the output tray at the front right, six slots that fill as the tray does
  const tray = new THREE.Group(); tray.name = "output_tray"; tray.position.set(W / 2 - 0.42, 0, D / 2 - 0.36); g.add(tray);
  box(tray, 0.62, 0.5, 0.52, 0, 0.25, 0, "#3a3a40"); box(tray, 0.7, 0.06, 0.6, 0, 0.53, 0, "#c29a5b"); box(tray, 0.06, 0.12, 0.6, -0.32, 0.6, 0, "#c29a5b"); box(tray, 0.06, 0.12, 0.6, 0.32, 0.6, 0, "#c29a5b");
  const slotColor = ({ ripen: "#ffd34a", bottler: "#f6a6c8", scrappress: "#9aa0a8", coupon: "#7fd36a" } as Record<string, string>)[id] ?? "#e6decd";
  for (let i = 0; i < 6; i++) { const s = box(tray, 0.16, 0.1, 0.16, -0.2 + (i % 3) * 0.2, 0.62 + Math.floor(i / 3) * 0.1, (i % 2 ? 0.1 : -0.1), slotColor, `tray_slot${i}`); s.visible = false; }
  // the machine body, per line
  const machine = new THREE.Group(); machine.name = "machine"; machine.position.set(0.1, 0, -D / 2 + 0.55); g.add(machine);
  if (id === "ripen") {
    const racks = new THREE.Group(); racks.name = "ripening_racks"; machine.add(racks);
    // open shelving (four posts, three shelves) so the bunches read from the top-down camera: green low, ripe on top
    for (const x of [-0.68, 0.68]) for (const z of [-0.3, 0.3]) box(racks, 0.07, 1.6, 0.07, x, 0.92, z, "#b07a42");
    for (const y of [0.55, 1.0, 1.45]) box(racks, 1.46, 0.05, 0.74, 0, y, 0, "#c29a5b");
    for (let i = 0; i < 12; i++) cyl(racks, 0.08, 0.32, -0.45 + (i % 3) * 0.45, 0.62 + Math.min(2, Math.floor(i / 3)) * 0.45 + (i >= 9 ? 0.0 : 0), i >= 9 ? 0.18 : -0.05 + (i % 2) * 0.2, i < 6 ? "#9acb3c" : "#ffd34a", undefined, "x", 8);
    const lamp = box(machine, 0.5, 0.12, 0.3, 0, 1.86, 0.2, "#ff9a3a", "heat_lamp", { emissive: "#ff8a2a", ei: 1.4 }); g.userData.lamp = lamp;
  } else if (id === "bottler") {
    const bl = new THREE.Group(); bl.name = "bottle_line"; machine.add(bl);
    box(bl, 1.8, 1.0, 0.7, 0, 0.62, 0, "#d7d2c8"); box(bl, 1.84, 0.1, 0.74, 0, 1.17, 0, "#f6a6c8");
    for (let i = 0; i < 5; i++) cyl(bl, 0.07, 0.26, -0.6 + i * 0.3, 1.35, 0.1, "#fbe3ee", undefined, "y", 10);
    const nozzle = cyl(machine, 0.05, 0.4, 0, 1.75, 0.1, "#9aa0a8", "filler_nozzle"); bob.push({ o: nozzle, amp: 0.08, speed: 4, y: 1.75 });
  } else if (id === "scrappress") {
    box(machine, 1.2, 0.5, 0.8, 0, 0.37, 0, "#4a4f58", "press_bed"); for (const x of [-0.5, 0.5]) box(machine, 0.14, 1.8, 0.14, x, 1.0, 0, "#3a3a40");
    box(machine, 1.2, 0.18, 0.4, 0, 1.9, 0, "#3a3a40");
    const ram = box(machine, 0.7, 0.4, 0.5, 0, 1.25, 0, "#c29a5b", "press_ram"); bob.push({ o: ram, amp: 0.22, speed: 3, y: 1.25 });
  } else if (id === "coupon") {
    box(machine, 1.5, 1.0, 0.8, 0, 0.62, 0, "#2f6b45"); box(machine, 1.54, 0.1, 0.84, 0, 1.17, 0, "#c29a5b");
    for (let i = 0; i < 2; i++) { const r = cyl(machine, 0.14, 1.3, 0, 1.36 + i * 0.26, 0.05, "#d7d2c8", `printer_roller_${i}`, "x", 12); spin.push({ o: r, axis: "x", speed: i ? 5 : -5, power: true }); }
    box(machine, 0.5, 0.3, 0.3, 0.55, 1.35, -0.25, "#7fd36a", "coupon_stack"); cyl(machine, 0.16, 0.5, -0.6, 1.45, -0.2, "#3a7dd6", "ink_tank");
  }
  g.userData.spin = spin; g.userData.bob = bob; g.userData.line = id;
  return g;
}
/** the tray's look: one slot shown per filled batch (up to six) */
export function showTray(o: THREE.Object3D, batches: number) {
  for (let i = 0; i < 6; i++) { const s = o.getObjectByName(`tray_slot${i}`); if (s) s.visible = i < batches; }
}
/** the Fence's gambling props on his counter: a little roulette wheel and a big coin, parented to his window */
export function fenceProps(): THREE.Group {
  const g = new THREE.Group(); g.name = "fence_props";
  const wheel = new THREE.Group(); wheel.name = "roulette_wheel"; wheel.position.set(1.35, 1.12, 0.35); g.add(wheel);
  cyl(wheel, 0.3, 0.06, 0, 0, 0, "#3a2a22"); const top = new THREE.Group(); top.name = "roulette_top"; wheel.add(top);
  for (let i = 0; i < 12; i++) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.02, 3, 1, false, (i / 12) * Math.PI * 2, Math.PI / 6), mat(i === 0 ? "#2f9a52" : i % 2 ? "#c8392a" : "#24222a")); m.position.y = 0.04; top.add(m); }
  cyl(top, 0.07, 0.08, 0, 0.07, 0, "#c29a5b");
  const coin = cyl(g, 0.12, 0.025, -1.35, 1.12, 0.4, "#e2bf82", "fence_coin", "y", 18); coin.rotation.x = 0.3;
  return g;
}
