// Render interpolation (Moo 2026-11-15: "running still has that blurry feel, the player gets dizzy"). The sim runs at a
// fixed 60 steps a second (main.ts) but the screen refreshes at whatever the monitor does: at 120-165 Hz some frames
// move the hero a whole step and others none, a judder that reads as blur at sprint speed. Standard fix (Gaffer,
// "Fix Your Timestep!"): draw every moving body between its last two sim positions by the leftover fraction of a step.
// The sim never sees an interpolated value: positions are put back right after the frame is drawn.
import * as THREE from "three";
import { G } from "./state";

const prev = new WeakMap<THREE.Vector3, THREE.Vector3>();
const held: { pos: THREE.Vector3; sim: THREE.Vector3 }[] = [];
const TELEPORT = 2.5; // a jump bigger than this in one step (spawn, portal, ?at, dev moves) snaps instead of sliding

function bodies(): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  if (G.rig) out.push(G.rig.root.position); // G.pp is this same vector
  for (const e of G.enemies) if (e.rig?.root) out.push(e.rig.root.position);
  return out;
}
/** call right before each sim step: remember where everything was */
export function interpSnap() {
  for (const pos of bodies()) { const p = prev.get(pos); if (p) p.copy(pos); else prev.set(pos, pos.clone()); }
}
/** call after the sim steps, before drawing: alpha = leftover time / step, 0..1 */
export function interpApply(alpha: number) {
  held.length = 0; const a = Math.min(1, Math.max(0, alpha));
  for (const pos of bodies()) {
    const p = prev.get(pos); if (!p || p.distanceToSquared(pos) > TELEPORT * TELEPORT) continue;
    held.push({ pos, sim: pos.clone() }); pos.lerpVectors(p, pos, a);
  }
}
/** call after drawing: the sim continues from its own positions */
export function interpRestore() { for (const h of held) h.pos.copy(h.sim); held.length = 0; }
