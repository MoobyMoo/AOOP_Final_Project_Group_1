// Juice helpers: tweens, parabolic transfers, squash, particles, floating text.
// Rules from research/idle-arcade + research/game-feel: transfers fly on quadratic arcs (<0.22 s),
// landings squash, nothing moves linearly.
import * as THREE from "three";

type Tw = { t: number; d: number; delay: number; f: (k: number) => void; done?: () => void };
const tweens: Tw[] = [];
let scene: THREE.Scene, camera: THREE.Camera;
export function initFx(s: THREE.Scene, c: THREE.Camera) { scene = s; camera = c; }

export const backOut = (k: number) => { const s = 2.2; return 1 + (s + 1) * Math.pow(k - 1, 3) + s * Math.pow(k - 1, 2); };
export const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);
export const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

export function tween(d: number, f: (k: number) => void, done?: () => void, delay = 0) { tweens.push({ t: 0, d, delay, f, done }); }

export function updateFx(dt: number) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    if (tw.delay > 0) { tw.delay -= dt; continue; }
    tw.t += dt;
    const k = Math.min(1, tw.t / tw.d);
    tw.f(k);
    if (k >= 1) { tweens.splice(i, 1); tw.done?.(); }
  }
  for (let i = parts.length - 1; i >= 0; i--) {
    const q = parts[i]; q.life -= dt; q.v.y -= 14 * dt; q.o.position.addScaledVector(q.v, dt);
    // shrink from the particle's own size. This used to drop the size and scale by life alone, so every spark ballooned
    // to a 1 u flat-shaded sphere on its first frame: the "flat cream polygon" beside a hit brute (G1 council bug 4).
    q.o.scale.setScalar(Math.max(0.01, q.s * Math.min(1, (q.life / q.max) * 1.7)));
    if (q.life <= 0) { scene.remove(q.o); parts.splice(i, 1); }
  }
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i]; f.t += dt; f.pos.y += dt * 1.4;
    const s = f.pos.clone().project(camera);
    f.el.style.left = (s.x * 0.5 + 0.5) * innerWidth + f.dx + "px";
    f.el.style.top = (-s.y * 0.5 + 0.5) * innerHeight + f.dy + "px";
    f.el.style.opacity = String(1 - easeOut(Math.max(0, f.t - 0.55) / 0.5));
    if (f.t > 1.05) { f.el.remove(); floaters.splice(i, 1); }
  }
}

/** scale an object in from nothing with overshoot */
export function popIn(o: THREE.Object3D, delay = 0, d = 0.42, to = 1) {
  o.scale.setScalar(0.001);
  tween(d, (k) => { const s = backOut(k) * to; o.scale.set(s, Math.max(0.001, s * (k < 0.45 ? 1.2 : 1)), s); }, undefined, delay);
}
/** squash-and-stretch bounce around a base scale */
export function squash(o: THREE.Object3D, amt = 0.25, d = 0.3, base = 1) {
  tween(d, (k) => { const w = Math.sin(k * Math.PI) * amt * (1 - k * 0.6); o.scale.set(base * (1 + w), base * (1 - w), base * (1 + w)); },
    () => o.scale.setScalar(base));
}
/** fly an object along a quadratic arc from a point to a (possibly moving) target */
export function arc(o: THREE.Object3D, from: THREE.Vector3, to: () => THREE.Vector3, d = 0.2, lift = 1.2, done?: () => void) {
  const a = from.clone();
  if (!o.parent) scene.add(o);
  tween(d, (k) => {
    const b = to();
    const mid = a.clone().lerp(b, 0.5); mid.y = Math.max(a.y, b.y) + lift;
    const e = easeInOut(k);
    const p = a.clone().multiplyScalar((1 - e) * (1 - e)).addScaledVector(mid, 2 * (1 - e) * e).addScaledVector(b, e * e);
    o.position.copy(p);
  }, () => { o.position.copy(to()); done?.(); });
}

type P = { o: THREE.Object3D; v: THREE.Vector3; life: number; max: number; s: number };
const parts: P[] = [];
const partGeo = new THREE.SphereGeometry(1, 6, 4);
const partMats = new Map<string, THREE.MeshBasicMaterial>();
/** a pop of small sparks or dust. size scales the particles (1 = 0.06-0.13 u radius: sparks; 2 reads as kicked-up dust) */
export function burst(at: THREE.Vector3, n: number, color: string, power = 1, size = 1) {
  const mat = partMats.get(color) ?? partMats.set(color, new THREE.MeshBasicMaterial({ color })).get(color)!;
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(partGeo, mat);
    const s = (0.06 + Math.random() * 0.07) * size;
    m.scale.setScalar(s); m.position.copy(at); scene.add(m);
    const life = 0.5 + Math.random() * 0.4;
    parts.push({ o: m, v: new THREE.Vector3((Math.random() - 0.5) * 6 * power, (2 + Math.random() * 4) * power, (Math.random() - 0.5) * 6 * power), life, max: life, s });
  }
}

const floaters: { el: HTMLDivElement; pos: THREE.Vector3; t: number; dx: number; dy: number }[] = [];
/** rising text at a world point. dx/dy shift it in screen pixels, so a number can keep clear of whatever else is
 *  anchored at the same point (enemy health bar, alert badge) at any zoom */
export function floatText(text: string, at: THREE.Vector3, color = "#2a1a12", size = 22, dx = 0, dy = 0) {
  const el = document.createElement("div");
  el.className = "floater";
  el.textContent = text;
  el.style.color = color; el.style.fontSize = size + "px";
  document.body.appendChild(el);
  floaters.push({ el, pos: at.clone(), t: 0, dx, dy });
}
