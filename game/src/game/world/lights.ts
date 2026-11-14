// A small pool of warm point lights (Duckov SodaPointLight, our implementation). The map has dozens of lamps;
// the renderer only ever carries POOL lights, moved each frame to the nearest lamps that are switched on.
// The pool lights never leave the scene (intensity 0 when idle), so the light count, and with it every compiled
// shader, stays constant.
import * as THREE from "three";

export type Lamp = { pos: THREE.Vector3; color: string; power: number; range: number; on: () => boolean };
const POOL = 4, lamps: Lamp[] = [], pool: { light: THREE.PointLight; lamp: Lamp | null }[] = [];
export function addLamp(l: Lamp) { lamps.push(l); return l; }
export function initLightPool(scene: THREE.Scene) {
  for (const p of pool) scene.add(p.light);
  while (pool.length < POOL) { const light = new THREE.PointLight("#ffc27a", 0, 10, 1.5); light.name = "lamp"; scene.add(light); pool.push({ light, lamp: null }); }
}
const near: { l: Lamp; d: number }[] = [];
/** move the pool to the lamps nearest the player that are on; fade intensity so hand-overs don't pop */
export function updateLightPool(dt: number, at: THREE.Vector3) {
  near.length = 0;
  for (const l of lamps) { const d = Math.hypot(l.pos.x - at.x, l.pos.z - at.z); if (d < 18 && l.on()) near.push({ l, d }); }
  near.sort((a, b) => a.d - b.d); near.length = Math.min(near.length, POOL);
  for (const p of pool) if (p.lamp && !near.some((q) => q.l === p.lamp)) { p.light.intensity *= Math.exp(-dt * 10); if (p.light.intensity < 0.05) { p.lamp = null; p.light.intensity = 0; } }
  for (const q of near) {
    let slot = pool.find((p) => p.lamp === q.l); if (!slot) { slot = pool.find((p) => !p.lamp); if (!slot) continue; slot.lamp = q.l; slot.light.position.copy(q.l.pos); slot.light.color.set(q.l.color); slot.light.distance = q.l.range; slot.light.intensity = 0; }
    const want = q.l.power * (1 - THREE.MathUtils.smoothstep(q.d, 11, 18));
    slot.light.intensity += (want - slot.light.intensity) * Math.min(1, dt * 6);
  }
}
export const lampCount = () => lamps.length;
