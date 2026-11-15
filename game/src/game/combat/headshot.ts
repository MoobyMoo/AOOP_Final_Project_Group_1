// Head targets and aim-time crit classification (G1.5 row 02). Mechanism from research/duckov-re/POLISH_FINDINGS.md
// section 3: every hostile carries a 0.42-radius sphere on its head; the mouse ray is tested against those spheres when
// the shot is fired, and a hit makes that shot critical (probability 1, else 0). It is classified at aim time, not by
// where the bullet lands. Aiming at a head also pulls the aim point half way toward the head centre (Duckov's head
// targeting applies half of the projected correction), so the 2D bullet heads for the body under the head the cursor
// is on rather than for the ground plane behind it.
// Our build: the sphere sits half way between the head bone and the top-of-head socket (the middle of our cartoon
// head, about 1.45 u up on a scale-1 monkey) and scales with the rig. No allocation per call.
import * as THREE from "three";
import { G, flat, type Enemy } from "../core/state";
import { HEAD } from "./weapons";
import { GUN } from "./gunstats";

const ray = new THREE.Ray(), ndc = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), sc = new THREE.Vector3(), hit = new THREE.Vector3();
/** the head under the cursor this frame (null if none); `point` is its centre */
export const aimHead = { enemy: null as Enemy | null, point: new THREE.Vector3(), radius: 0 };

/** world centre and radius of an enemy's head target; returns the radius */
export function headCenter(e: Enemy, out: THREE.Vector3): number {
  const top = e.rig.sockets.head, bone = (e.rig.sockets as { ears?: THREE.Object3D }).ears?.parent ?? top.parent;
  top.getWorldPosition(out);
  if (bone) { bone.getWorldPosition(a); out.add(a).multiplyScalar(0.5); }
  top.getWorldScale(sc);
  return HEAD.radius * sc.y;
}

/** test the cursor ray against every live enemy's head (nearest along the ray wins). Call once per sim step while
 *  aiming with the mouse; clears aimHead otherwise. */
export function updateAimHead(cursor: { x: number; y: number } | null): Enemy | null {
  aimHead.enemy = null;
  if (!cursor) return null;
  const cam = G.stage.camera;
  ray.origin.setFromMatrixPosition(cam.matrixWorld);
  ray.direction.copy(ndc.set(cursor.x, cursor.y, 0.5).unproject(cam)).sub(ray.origin).normalize();
  let best = Infinity;
  for (const e of G.enemies) {
    if (e.down || !e.active || flat(e.p, G.pp) > GUN.range + 2) continue;
    const r = headCenter(e, b);
    const t = ray.distanceSqToPoint(b) <= r * r ? (ray.closestPointToPoint(b, hit), hit.distanceTo(ray.origin)) : Infinity;
    if (t < best) { best = t; aimHead.enemy = e; aimHead.point.copy(b); aimHead.radius = r; }
  }
  return aimHead.enemy;
}
