// The arrival (LORE.md "Story in the demo": the prison ferry dumps the Businessman on Exile Beach with his suit and
// briefcase; he finds the hatch and the empty vault below). Plays once per save, after the character creator, before
// the first visit to the vault. About 14 s, five captions; Esc or a click skips it. Runs in the raid scene (built at
// boot) with no enemies or crates in it: only the world, the wrecked ferry and the Businessman.
import * as THREE from "three";
import { G } from "../core/state";
import { save } from "../core/save";
import { sfx } from "../core/audio";
import { qs } from "../core/quests";
import { raidScene } from "../core/raid";
import { standHeight } from "../world/terrain";
import { burst, initFx, updateFx } from "../../fx";
import { esc } from "./dialogue";

type Shot = { dur: number; caption: string; cam: { pitch: number; yaw: number; dist: number }; focus: (k: number) => THREE.Vector3; rig?: (k: number, t: number) => { x: number; z: number; y?: number; yaw: number; action: "idle" | "run" | "roll" | "hurt"; at?: number; speed?: number } };
const V = (x: number, z: number, y = 0) => new THREE.Vector3(x, y, z);
const lerp = THREE.MathUtils.lerp, ease = (k: number) => k * k * (3 - 2 * k);
/** the ferry wreck sits at x 58-72 on the beach; the hatch at (-8, 102) */
const SHOTS: Shot[] = [
  { dur: 3.4, caption: "The Island. A prison with palm trees.", cam: { pitch: 34, yaw: -18, dist: 62 }, focus: (k) => V(lerp(52, 40, k), lerp(96, 92, k)) },
  { dur: 3.6, caption: "Convicted: tax fraud, 312 counts. Sentence: life. No appeal. No accountant.", cam: { pitch: 38, yaw: -26, dist: 36 },
    focus: (k) => V(lerp(60, 54, k), 101.5),
    rig: (k) => k < 0.35 ? { x: 59, z: 101.6, y: 1.1, yaw: -Math.PI / 2, action: "idle" } : k < 0.7 ? (() => { const q = (k - 0.35) / 0.35; return { x: lerp(59, 52, q), z: lerp(101.6, 102.4, q), y: 1.1 * (1 - q) + Math.sin(q * Math.PI) * 2.2, yaw: -Math.PI / 2, action: "roll" as const, at: q }; })() : { x: 52, z: 102.4, yaw: -Math.PI * 0.6, action: "hurt", at: Math.min(1, (k - 0.7) / 0.3) } },
  { dur: 3.4, caption: "The ferry kept the bail money. He kept the suit, the briefcase and the nerve.", cam: { pitch: 42, yaw: -30, dist: 26 },
    focus: (k) => V(lerp(10, 2, k), 102.5), rig: (k) => ({ x: lerp(12, 1, ease(k)), z: lerp(103.4, 102.2, k), yaw: -Math.PI / 2 - 0.1, action: "run", speed: 3.6 }) },
  { dur: 3.2, caption: "Every empire starts with a hole in the ground.", cam: { pitch: 50, yaw: -30, dist: 22 },
    focus: () => V(-6, 101.5), rig: (k) => k < 0.6 ? { x: lerp(1, -6.6, ease(k / 0.6)), z: lerp(102.2, 101.6, k / 0.6), yaw: -Math.PI / 2, action: "run", speed: 3.4 } : { x: -6.6, z: 101.6, yaw: -Math.PI / 2 - 0.4, action: "idle" } },
  { dur: 2.4, caption: "Under the sand: an empty vault. Prime real estate.", cam: { pitch: 62, yaw: -30, dist: 18 }, focus: () => V(-7.6, 101.8), rig: (k) => ({ x: lerp(-6.6, -8, k), z: lerp(101.6, 102, k), y: -k * 1.6, yaw: Math.PI, action: "idle" }) },
];
export const INTRO_SECONDS = SHOTS.reduce((a, s) => a + s.dur, 0);

let running = false;
export const introRunning = () => running;
/** play the arrival; done() runs once it ends or is skipped. Marks the save first, so it plays once even if you close
 *  the tab halfway. */
export function playIntro(done: () => void) {
  if (running) return;
  running = true; qs(G.save).intro = true; save(G.save);
  const prevScene = G.scene; G.scene = "summary"; void prevScene;
  G.stage.setScene(raidScene); initFx(raidScene, G.stage.camera);
  // the wide establishing shots sit further out than the raid camera: thin the haze while the intro plays
  const fog = raidScene.fog, kept = fog instanceof THREE.Fog ? [fog.near, fog.far] : fog instanceof THREE.FogExp2 ? [fog.density] : null;
  if (fog instanceof THREE.Fog) { fog.near *= 2.4; fog.far *= 2.4; } else if (fog instanceof THREE.FogExp2) fog.density *= 0.4;
  const restoreFog = () => { if (fog instanceof THREE.Fog && kept) { fog.near = kept[0]; fog.far = kept[1]; } else if (fog instanceof THREE.FogExp2 && kept) fog.density = kept[0]; };
  const QS = new URLSearchParams(location.search);
  G.stage.hemi.intensity = Number(QS.get("fill") ?? 0.9); G.stage.sun.intensity = Number(QS.get("sun") ?? 6); G.stage.bounce.intensity = Number(QS.get("bounce") ?? 1.6);
  G.rig.setLook?.(G.save.look); G.rig.setGear?.(G.save.gear); G.rig.root.scale.setScalar(1); G.gun.root.visible = false; raidScene.add(G.rig.root);
  const ui = document.getElementById("ui")!; ui.innerHTML = "";
  const el = document.createElement("div"); el.className = "intro3";
  el.innerHTML = `<i class="bar top"></i><i class="bar bot"></i><div class="cap plate"><i class="brk tl"></i><i class="brk tr"></i><i class="brk bl"></i><i class="brk br"></i><p></p><div class="tie"></div></div><span class="skip"><kbd>Esc</kbd> or click to skip</span><div class="blk"></div>`;
  ui.appendChild(el); requestAnimationFrame(() => el.classList.add("on"));
  const cap = el.querySelector("p")!, blk = el.querySelector<HTMLElement>(".blk")!;
  let t = 0, shot = -1, last = performance.now(), landed = false, ended = false;
  const finish = () => {
    if (ended) return; ended = true; removeEventListener("keydown", onKey, true); el.removeEventListener("pointerdown", onClick);
    blk.classList.add("on");
    setTimeout(() => { el.remove(); restoreFog(); G.rig.root.position.y = 0; running = false; done(); }, 420);
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" || e.key === " " || e.key === "Enter") { e.preventDefault(); e.stopImmediatePropagation(); sfx("ui"); finish(); } };
  const onClick = () => { sfx("ui"); finish(); };
  addEventListener("keydown", onKey, true); el.addEventListener("pointerdown", onClick);
  const tick = () => {
    if (ended) return;
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt; G.time += dt;
    let acc = 0, i = 0; while (i < SHOTS.length - 1 && t > acc + SHOTS[i].dur) { acc += SHOTS[i].dur; i++; }
    if (t >= INTRO_SECONDS) { finish(); return; }
    const s = SHOTS[i], k = Math.min(1, (t - acc) / s.dur);
    if (i !== shot) { shot = i; cap.parentElement!.classList.remove("in"); void (cap.parentElement as HTMLElement).offsetWidth; cap.innerHTML = esc(s.caption); cap.parentElement!.classList.add("in"); if (i === 1) sfx("notice"); if (i === 4) sfx("door"); }
    const r = s.rig?.(k, t);
    G.rig.root.visible = !!r;
    if (r) {
      const gy = standHeight(r.x, r.z); G.rig.root.position.set(r.x, gy + (r.y ?? 0), r.z); G.rig.root.rotation.y = r.yaw;
      if (i === 1 && r.action === "hurt" && !landed) { landed = true; sfx("thunk"); burst(V(r.x, r.z, gy + 0.3), 18, "#efe2bf", 1); G.stage.trauma = 0.25; }
      G.rig.pose({ time: G.time, speed: r.speed ?? 0, moveYaw: r.yaw, faceYaw: r.yaw, action: r.action, actionT: r.at ?? 0, armed: "none", flash: 0 });
    }
    G.stage.cam.pitch = THREE.MathUtils.degToRad(s.cam.pitch); G.stage.cam.yaw = THREE.MathUtils.degToRad(s.cam.yaw); G.stage.cam.dist = s.cam.dist;
    const f = s.focus(k); f.y = standHeight(f.x, f.z) + 0.5; G.stage.setFov(24, 34); G.stage.place(f, dt, G.time); updateFx(dt);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
