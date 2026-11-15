// Small procedural props for the story: the Radio Operator's desk (a vault facility, 2 x 1 cells, front +z, origin at
// the footprint centre, floor y 0), the Grove Keeper's camp by the mangrove water, and the Keepers' root-cellar cache.
// Primitive-built in the shared bright materials (render/shading mat()), a few dozen triangles each.
import * as THREE from "three";
import { mat } from "../render/shading";

const box = (w: number, h: number, d: number, color: string, x = 0, y = 0, z = 0, parent?: THREE.Object3D) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color)); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent?.add(m); return m;
};
const glow = (color: string, k = 1.8) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), toneMapped: false });

/** the radio desk: a scuffed office desk, a big valve radio with dials and a whip antenna, a mic on a stand, a stool */
export function radioDeskModel(): THREE.Group {
  const g = new THREE.Group(); g.name = "fac_radio";
  box(1.7, 0.08, 0.62, "#7a5434", 0, 0.78, 0.12, g); // top
  for (const x of [-0.78, 0.78]) box(0.08, 0.76, 0.56, "#5e3f26", x, 0.38, 0.12, g);
  box(1.5, 0.5, 0.04, "#6a482c", 0, 0.5, 0.4, g); // modesty panel
  const radio = box(0.8, 0.42, 0.34, "#3a4a3a", -0.2, 1.03, 0.02, g); radio.name = "radio_set";
  box(0.66, 0.2, 0.02, "#d8c48a", -0.2, 1.08, 0.2, g); // dial window
  const needle = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.16, 0.01), mat("#d9493a")); needle.position.set(-0.28, 1.08, 0.215); needle.name = "radio_needle"; g.add(needle);
  for (const x of [-0.45, 0.05]) { const k = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 12), mat("#c29a5b")); k.rotation.x = Math.PI / 2; k.position.set(x, 0.92, 0.2); g.add(k); }
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), glow("#ffb648")); lamp.position.set(0.12, 1.2, 0.2); lamp.name = "radio_lamp"; g.add(lamp);
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.9, 4), mat("#c9ccd6")); ant.position.set(0.12, 1.66, -0.05); ant.rotation.z = -0.18; g.add(ant);
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.03, 0.22, 6), mat("#2a2a2e")); stand.position.set(0.48, 0.93, 0.12); g.add(stand);
  const mic = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.06, 4, 8), mat("#c9ccd6")); mic.position.set(0.48, 1.09, 0.14); g.add(mic);
  box(0.26, 0.04, 0.2, "#f3ead6", 0.48, 0.83, -0.04, g); // log pad
  const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 14), mat("#8a2f3a")); stool.position.set(0, 0.52, -0.35); g.add(stool);
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.5, 6), mat("#2a2a2e")); leg.position.set(0, 0.26, -0.35); g.add(leg);
  return g;
}
/** the Keeper's camp: a woven mat, a low trade table, seed-pod lanterns on poles, a basket of carvings */
export function keeperCampModel(): THREE.Group {
  const g = new THREE.Group(); g.name = "keeper_camp";
  const matDisc = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.03, 20), mat("#c9b06a", { rough: 0.95 })); matDisc.position.y = 0.02; matDisc.receiveShadow = true; g.add(matDisc);
  for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.035, 0.12), mat(i % 2 ? "#a88a4a" : "#d8c48a")); s.position.set(0, 0.03, -0.75 + i * 0.3); g.add(s); }
  box(1.2, 0.08, 0.55, "#7a5a34", 0.2, 0.42, 0.75, g); for (const x of [-0.3, 0.7]) box(0.08, 0.4, 0.45, "#5e4426", x, 0.2, 0.75, g); // trade table
  for (const [x, c] of [[-0.1, "#e8b84a"], [0.25, "#b97a3a"], [0.55, "#9bc45a"]] as const) { const p = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), mat(c)); p.scale.set(0.8, 1.2, 0.8); p.position.set(x, 0.56, 0.75); g.add(p); }
  for (const [x, z] of [[-1.5, -0.9], [1.6, -0.6], [-1.2, 1.3]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.9, 6), mat("#6a5234")); pole.position.set(x, 0.95, z); pole.castShadow = true; g.add(pole);
    const arm = box(0.4, 0.04, 0.04, "#6a5234", x + 0.18, 1.85, z, g); void arm;
    const pod = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), glow("#9dffb0")); pod.scale.set(0.85, 1.25, 0.85); pod.position.set(x + 0.34, 1.62, z); pod.name = "keeper_pod"; g.add(pod);
  }
  const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.24, 0.3, 12), mat("#b8954a")); basket.position.set(-0.9, 0.17, 0.5); basket.castShadow = true; g.add(basket);
  return g;
}
/** the root cellar: a woven lid set into the roots, with two lantern pods to mark it once you know where to look */
export function cellarModel(): THREE.Group {
  const g = new THREE.Group(); g.name = "keeper_cellar";
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.66, 0.16, 14), mat("#8a6a3a")); lid.position.y = 0.08; lid.castShadow = lid.receiveShadow = true; g.add(lid);
  for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.03, 0.1), mat("#c9b06a")); s.position.set(0, 0.17, -0.3 + i * 0.2); s.rotation.y = 0.2; g.add(s); }
  for (const x of [-0.75, 0.75]) { const pod = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), glow("#9dffb0")); pod.position.set(x, 0.3, 0.2); g.add(pod); }
  return g;
}
