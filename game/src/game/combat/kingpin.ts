// STUB (lead): a box pistol + minimal tracer, replaced by Fable B's Kingpin .45 model and FX.
import * as THREE from "three";
import type { GunView, GunFx } from "../contracts";
export function createKingpin(): GunView {
  const root = new THREE.Group(), body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.6), new THREE.MeshStandardMaterial({ color: "#2a2a30" }));
  body.position.z = 0.25; root.add(body);
  const muzzle = new THREE.Object3D(); muzzle.position.z = 0.6; root.add(muzzle);
  const eject = new THREE.Object3D(); eject.position.set(0.08, 0.08, 0.25); root.add(eject);
  return { root, muzzle, eject, setVariant() {}, pose(s) { body.position.z = 0.25 - Math.max(0, 1 - s.fireT * 4) * 0.08; } };
}
export function createGunFx(scene: THREE.Scene): GunFx {
  const lines: { m: THREE.Line; t: number }[] = [], a = new THREE.Vector3();
  return {
    fire(muzzle, _eject, to) {
      muzzle.getWorldPosition(a);
      const m = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a.clone(), to.clone()]), new THREE.LineBasicMaterial({ color: "#fff3a0" }));
      scene.add(m); lines.push({ m, t: 0.06 });
    },
    update(dt) { for (let i = lines.length - 1; i >= 0; i--) if ((lines[i].t -= dt) <= 0) { scene.remove(lines[i].m); lines[i].m.geometry.dispose(); lines.splice(i, 1); } },
  };
}
