// Ground for the raid map: one vertex-coloured heightfield per region (overworld, grotto) built from layout shapes,
// plus sea and river water. Colours follow the L3 council re-grade (olive/teal greens, bright dirt, cool shade).
import * as THREE from "three";
import { CLEARINGS, TRAILS, VAULT_TRAIL, SEA_Z, RIVER_Z, type Ground } from "./layout";
import { openness, trailDist, areaAt } from "./grid";
import { fbm } from "./noise";
import { patch } from "../render/shading";

export const GROUND_C: Record<Ground | "jungle" | "wet", THREE.Color> = {
  grass: new THREE.Color("#86a64e"), sand: new THREE.Color("#ecd39c"), dirt: new THREE.Color("#d9ae74"), stone: new THREE.Color("#c4ab84"),
  cave: new THREE.Color("#6f6458"), plank: new THREE.Color("#a98a5c"), jungle: new THREE.Color("#5e7d3e"), wet: new THREE.Color("#b89c6a"),
};
const G2 = { grassDry: new THREE.Color("#9aa85c"), grassMoist: new THREE.Color("#6f8a48"), worn: new THREE.Color("#a99262"), dirtD: new THREE.Color("#c99a62") };

export function groundHeight(x: number, z: number) {
  const o = openness(x, z);
  const rise = THREE.MathUtils.smoothstep(-o, 0, 6) * 1.6;   // the jungle wall sits on a soft berm
  const und = (fbm(x * 0.07, z * 0.07) - 0.5) * 0.7;
  const wet = (z > SEA_Z - 3 ? -(z - (SEA_Z - 3)) * 0.25 : 0) + (z < RIVER_Z + 3 && x < 90 ? -(RIVER_Z + 3 - z) * 0.25 : 0);
  return rise + und * THREE.MathUtils.smoothstep(o, 0.5, 4) * 0.6 + Math.max(-1.2, wet);
}
/** the ground type under a point: nearest clearing's ground, trails override with dirt (or their own ground) */
function groundType(x: number, z: number): { g: Ground; k: number } {
  let best: Ground = "grass", bk = 0;
  for (const t of [...TRAILS, VAULT_TRAIL]) { const d = trailDist(t, x, z), k = 1 - THREE.MathUtils.smoothstep(d, t.w * 0.32, t.w * 0.62); if (k > bk) { bk = k; best = t.ground ?? "dirt"; } }
  const a = areaAt(x, z), c = CLEARINGS.find((q) => q.id === a);
  if (c && c.ground !== "grass") { const e = Math.hypot((x - c.x) / c.rx, (z - c.z) / c.rz), k = 1 - THREE.MathUtils.smoothstep(e, 0.55, 1.0); if (k > bk * 0.9) return { g: c.ground, k: Math.max(k, bk) }; }
  return { g: best, k: bk };
}
export function groundColor(x: number, z: number, out = new THREE.Color()) {
  const n = fbm(x * 0.06, z * 0.06), m = fbm(x * 0.45 + 9, z * 0.45);
  out.copy(G2.grassMoist).lerp(G2.grassDry, THREE.MathUtils.smoothstep(n, 0.35, 0.7)).lerp(G2.worn, THREE.MathUtils.smoothstep(m, 0.62, 0.82) * 0.5);
  const o = openness(x, z); out.lerp(GROUND_C.jungle, THREE.MathUtils.smoothstep(-o, -0.5, 3));
  const { g, k } = groundType(x, z);
  if (k > 0 && g !== "grass") { const gc = g === "dirt" ? GROUND_C.dirt.clone().lerp(G2.dirtD, m) : GROUND_C[g]; out.lerp(gc, k); }
  if (x > 90) out.copy(GROUND_C.cave).lerp(new THREE.Color("#7d7062"), m * 0.6);
  if (z > SEA_Z - 4 && x < 90) out.lerp(GROUND_C.wet, THREE.MathUtils.smoothstep(z, SEA_Z - 4, SEA_Z));
  return out;
}
function field(minX: number, maxX: number, minZ: number, maxZ: number, step: number) {
  const nx = Math.round((maxX - minX) / step), nz = Math.round((maxZ - minZ) / step);
  const g = new THREE.PlaneGeometry(maxX - minX, maxZ - minZ, nx, nz); g.rotateX(-Math.PI / 2); g.translate((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
  const pos = g.attributes.position as THREE.BufferAttribute, col = new Float32Array(pos.count * 3), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i); pos.setY(i, groundHeight(x, z)); groundColor(x, z, c); col.set([c.r, c.g, c.b], i * 3); }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
  const m = new THREE.Mesh(g, patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), { rim: 0 }));
  m.receiveShadow = true; return m;
}
export function buildTerrain(scene: THREE.Scene) {
  const over = field(-90, 90, -100, 100, 0.6), grotto = field(92, 150, -40, 60, 0.6);
  (grotto.material as THREE.MeshStandardMaterial).onBeforeCompile = (over.material as THREE.MeshStandardMaterial).onBeforeCompile;
  scene.add(over, grotto);
  const water = (w: number, d: number, x: number, z: number, color: string) => {
    const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, patch(new THREE.MeshStandardMaterial({ color, roughness: 0.15, transparent: true, opacity: 0.9 }), { rim: 0, water: true }));
    m.position.set(x, -0.3, z); m.receiveShadow = true; scene.add(m); return m;
  };
  water(220, 40, 0, SEA_Z + 18, "#3a9bb0"); water(220, 40, 0, RIVER_Z - 19, "#2f8296");
  { // the waterfall pool and the grotto's underground stream
    water(14, 9, 35, -31, "#3a9bb0").position.y = -0.15;
  }
  return { over, grotto };
}
