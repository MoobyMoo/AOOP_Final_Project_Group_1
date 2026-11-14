// Placeholder KitSource wrapping the L1 look kit (src/game/world/kit.ts) until Fable's kit_nature/kit_build land.
import * as THREE from "three";
import { palm, broadTree, bush, fern, bigLeaf, bananaPlant, rock, jitter, smoothBlob } from "./kit";
import { groupToPieces, type KitSource } from "./dress";
import { mat } from "../render/shading";
import { rr, V } from "../core/rng";

const log = () => { const g = new THREE.Group(); const l = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.33, 2.6, 14), mat("#7a5434")); l.rotation.z = Math.PI / 2; l.position.y = 0.3; g.add(l); return g; };
const stump = () => { const g = new THREE.Group(); const s = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.52, 0.5, 9), mat("#7a5a3c", { flat: true })); s.position.y = 0.25; g.add(s); return g; };
const caveRock = (s: number) => { const g = new THREE.Group(); const r = new THREE.Mesh(jitter(new THREE.IcosahedronGeometry(s, 1), s * 0.25), mat("#5d554c", { flat: true })); r.scale.y = 0.8; r.position.y = s * 0.4; g.add(r); return g; };
const mushroom = (s: number) => { const g = new THREE.Group(); for (let i = 0; i < 3; i++) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * s, 0.07 * s, 0.4 * s, 6), mat("#d9cdb0")); const x = rr(-0.3, 0.3), z = rr(-0.3, 0.3); st.position.set(x, 0.2 * s, z); g.add(st); const cap = new THREE.Mesh(new THREE.SphereGeometry(0.16 * s, 8, 6, 0, 6.3, 0, 1.6), mat("#7fd6c8")); cap.position.set(x, 0.4 * s, z); g.add(cap); } return g; };
export const PLACEHOLDER_KIT: KitSource = {
  palm: (_r, s) => groupToPieces(palm(s), { tall: true, blocks: true, footprint: 0.25 * s }),
  tree: (_r, s) => groupToPieces(broadTree(s), { tall: true, blocks: true, footprint: 0.4 * s }),
  bush: (_r, s) => groupToPieces(bush(s)),
  fern: (_r, s) => groupToPieces(fern(s)),
  bigLeaf: (_r, s) => groupToPieces(bigLeaf(s)),
  banana: (_r, s) => groupToPieces(bananaPlant(s)),
  rock: (_r, s) => groupToPieces(rock(s), { blocks: s > 0.8, footprint: 0.85 * s }),
  log: () => groupToPieces(log(), { blocks: true, footprint: 0.6 }),
  stump: () => groupToPieces(stump(), { blocks: true, footprint: 0.5 }),
  caveRock: (_r, s) => groupToPieces(caveRock(s), { blocks: true, footprint: s * 0.8 }),
  mushroom: (_r, s) => groupToPieces(mushroom(s)),
  caster: (_r, s) => { const g = new THREE.Group(); for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(jitter(new THREE.IcosahedronGeometry(s * rr(0.5, 0.9), 1), s * 0.3), mat("#000")); b.position.set(rr(-s, s), 0, rr(-s, s)); b.scale.y = 0.3; g.add(b); } return groupToPieces(g); },
};
void smoothBlob; void V;
/** the L1 grass tuft: 5 tapered blades, both windings, up-facing normals */
export function grassTuft() {
  const blades: number[] = [], cols: number[] = [], idx: number[] = [];
  for (let b = 0; b < 5; b++) {
    const a = rr(0, Math.PI * 2), lean = rr(0.1, 0.35), h = rr(0.45, 0.85), w = rr(0.1, 0.15), ox = rr(-0.12, 0.12), oz = rr(-0.12, 0.12);
    const base = blades.length / 3, dir = V(Math.cos(a), 0, Math.sin(a)), side = V(-dir.z, 0, dir.x);
    for (let s = 0; s <= 3; s++) {
      const t = s / 3, ww = w * (1 - t * 0.85), y = h * t, off = lean * t * t;
      for (const sgn of [-1, 1]) { blades.push(ox + side.x * ww * sgn + dir.x * off, y, oz + side.z * ww * sgn + dir.z * off); const v = 0.74 + t * 0.46; cols.push(v * 0.95, v, v * 0.85); }
      if (s < 3) { const q = base + s * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2, q, q + 2, q + 1, q + 1, q + 2, q + 3); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(blades, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3)); g.setIndex(idx); g.computeVertexNormals();
  const n = g.attributes.normal as THREE.BufferAttribute; for (let i = 0; i < n.count; i++) n.setXYZ(i, n.getX(i) * 0.3, 1, n.getZ(i) * 0.3);
  return g;
}
