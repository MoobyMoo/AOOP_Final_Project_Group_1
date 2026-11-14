// Toon shading + inverted-hull ink outlines for code-built props, the same look as the Shorts' painted world.
import * as THREE from "three";

const grad = (() => {
  const d = new Uint8Array([90, 170, 255]);
  const t = new THREE.DataTexture(d, 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();
const inkMat = new THREE.MeshBasicMaterial({ color: 0x2a1a12, side: THREE.BackSide });
const mats = new Map<string, THREE.MeshToonMaterial>();

export function toonMat(color: string) {
  let m = mats.get(color);
  if (!m) { m = new THREE.MeshToonMaterial({ color, gradientMap: grad }); mats.set(color, m); }
  return m;
}

/** mesh + a slightly larger back-face shell drawn in ink */
export function inked(geo: THREE.BufferGeometry, color: string, outline = 0.04) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(geo, toonMat(color));
  m.castShadow = true; m.receiveShadow = true;
  g.add(m);
  geo.computeBoundingBox();
  const s = geo.boundingBox!.getSize(new THREE.Vector3());
  const hull = new THREE.Mesh(geo, inkMat);
  hull.scale.set(1 + outline / Math.max(s.x, 0.05) * 2, 1 + outline / Math.max(s.y, 0.05) * 2, 1 + outline / Math.max(s.z, 0.05) * 2);
  g.add(hull);
  return g;
}

export const box = (w: number, h: number, d: number, color: string, x = 0, y = 0, z = 0) => {
  const g = inked(new THREE.BoxGeometry(w, h, d), color);
  g.position.set(x, y + h / 2, z);
  return g;
};
export const cyl = (rt: number, rb: number, h: number, color: string, x = 0, y = 0, z = 0, seg = 14) => {
  const g = inked(new THREE.CylinderGeometry(rt, rb, h, seg), color);
  g.position.set(x, y + h / 2, z);
  return g;
};
export const ball = (r: number, color: string, x = 0, y = 0, z = 0) => {
  const g = inked(new THREE.SphereGeometry(r, 16, 12), color, 0.03);
  g.position.set(x, y, z);
  return g;
};
