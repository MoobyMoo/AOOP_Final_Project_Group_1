// Hit feedback (G1.5 row 02): damage numbers and the four hit markers, built on the mechanism in
// research/duckov-re/POLISH_FINDINGS.md section 3 ("Numbers, hit markers and kill feedback"), our own look:
// - one number per hit, never merged; it starts 2 u above the hit, launches up at 6 u/s (+-10 deg) against gravity
//   -10, lives 0.9 s, pops from 1.87x to 1x over the first 0.15 s and fades over the last 0.45 s.
// - a crit number is 1.2x the size, banana gold instead of cream, and sits on a coral starburst (our glyph).
// - markers at the crosshair: hit, crit, kill, crit kill, each with its own look and its own sound ("hit", "hitCrit",
//   "kill", "killCrit"). A new marker crossfades in 20 ms; a kill marker can't be cut short by an ordinary hit.
//   Hit = four cream ticks; crit = longer gold ticks around a gold diamond; kill = thick coral ticks; crit kill =
//   coral ticks, the gold diamond and a coral ring. Lifetimes 0.18 / 0.24 / 0.36 / 0.46 s on the game clock.
// DOM nodes are pooled (24 numbers, one marker); nothing is created per hit after the first build.
import * as THREE from "three";
import { G } from "../core/state";
import { sfx } from "../core/audio";

export type HitKind = "hit" | "crit" | "kill" | "critKill";
const LIFE = 0.9, POP = 0.15, FADE = 0.45, SPEED = 6, GRAV = -10, POP0 = 1.87, CRIT_SIZE = 1.2, BASE_PX = 21, N = 24;

const CSS = `
.dmgnum{position:fixed;left:0;top:0;pointer-events:none;z-index:6;font:800 ${BASE_PX}px/1 var(--body,"Nunito"),system-ui,sans-serif;color:#fff8ec;
  -webkit-text-stroke:4px rgba(28,16,24,.9);paint-order:stroke fill;white-space:nowrap;will-change:transform,opacity;display:none}
.dmgnum.crit{color:#ffe14a}
.dmgnum.crit::before{content:"";position:absolute;left:50%;top:50%;width:2.3em;height:2.3em;transform:translate(-50%,-50%) rotate(12deg);z-index:-1;
  background:#ff6b57;clip-path:polygon(50% 0,61% 28%,93% 14%,76% 42%,100% 55%,71% 63%,80% 96%,53% 75%,30% 100%,32% 69%,0 70%,23% 50%,4% 25%,35% 32%);
  box-shadow:none;opacity:.95}
.dmgnum.crit b{position:relative}
.hitmark{position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:7;opacity:0}
.hitmark i{position:absolute;left:-1.5px;top:-11px;width:3px;height:7px;border-radius:2px;background:#fff;box-shadow:0 0 0 1.5px rgba(28,16,24,.75);transform-origin:1.5px 11px}
.hitmark i:nth-child(1){transform:rotate(45deg) translateY(var(--o,-7px))}.hitmark i:nth-child(2){transform:rotate(135deg) translateY(var(--o,-7px))}
.hitmark i:nth-child(3){transform:rotate(225deg) translateY(var(--o,-7px))}.hitmark i:nth-child(4){transform:rotate(315deg) translateY(var(--o,-7px))}
.hitmark b{position:absolute;left:-5px;top:-5px;width:10px;height:10px;border:2px solid #ffe14a;transform:rotate(45deg);box-sizing:border-box;display:none;box-shadow:0 0 0 1.5px rgba(28,16,24,.6)}
.hitmark u{position:absolute;left:-17px;top:-17px;width:34px;height:34px;border-radius:50%;border:2.5px solid #ff6b57;box-sizing:border-box;display:none}
.hitmark.crit i{background:#ffe14a;height:9px}.hitmark.crit b{display:block}
.hitmark.kill i{background:#ff6b57;height:10px;width:4px}
.hitmark.critKill i{background:#ff6b57;height:11px;width:4px}.hitmark.critKill b{display:block}.hitmark.critKill u{display:block}
`;
type Num = { el: HTMLDivElement; t: number; p: THREE.Vector3; v: THREE.Vector3; size: number; live: boolean };
const nums: Num[] = [];
let mark: HTMLDivElement | null = null, markKind: HitKind = "hit", built = false, ring = 0;
const proj = new THREE.Vector3();
const DUR: Record<HitKind, number> = { hit: 0.18, crit: 0.24, kill: 0.36, critKill: 0.46 };
/** the hit-confirm sound per marker (names the lead fills with samples) */
export const SOUND = { hit: "hit", crit: "hitCrit", kill: "kill", critKill: "killCrit" } as const;
const SCALE: Record<HitKind, number> = { hit: 1, crit: 1.25, kill: 1.35, critKill: 1.6 };

function build() {
  if (built) return; built = true;
  const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
  for (let i = 0; i < N; i++) {
    const el = document.createElement("div"); el.className = "dmgnum"; el.appendChild(document.createElement("b")); document.body.appendChild(el);
    nums.push({ el, t: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), size: 1, live: false });
  }
  mark = document.createElement("div"); mark.className = "hitmark"; mark.innerHTML = "<i></i><i></i><i></i><i></i><b></b><u></u>"; document.body.appendChild(mark);
}

/** a damage number at a hit point (world); crit numbers are 1.2x and gold on a starburst */
export function damageNumber(n: number, at: THREE.Vector3, crit: boolean) {
  build();
  let k = nums.find((q) => !q.live); if (!k) { k = nums[ring]; ring = (ring + 1) % N; } // full: reuse the oldest-ish
  k.live = true; k.t = 0; k.size = crit ? CRIT_SIZE : 1; k.p.copy(at); k.p.y += 2;
  const ax = (G.rng() - 0.5) * 2 * 10 * Math.PI / 180, az = (G.rng() - 0.5) * 2 * 10 * Math.PI / 180; // +-10 deg in X and Z
  k.v.set(Math.sin(az) * SPEED, Math.cos(ax) * Math.cos(az) * SPEED, Math.sin(ax) * SPEED);
  k.el.className = crit ? "dmgnum crit" : "dmgnum"; (k.el.firstChild as HTMLElement).textContent = String(n); k.el.style.display = "block";
  place(k);
}
function place(k: Num) {
  proj.copy(k.p).project(G.stage.camera);
  const x = (proj.x * 0.5 + 0.5) * innerWidth, y = (-proj.y * 0.5 + 0.5) * innerHeight;
  const pop = k.t < POP ? POP0 + (1 - POP0) * (k.t / POP) : 1, a = k.t <= LIFE - FADE ? 1 : Math.max(0, (LIFE - k.t) / FADE);
  k.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,-50%) scale(${(pop * k.size).toFixed(3)})`;
  k.el.style.opacity = a.toFixed(3);
}

/** hit marker + its sound. Kill markers have priority: an ordinary hit/crit can't interrupt one that is still playing */
export function hitMarker(kind: HitKind, at = G.aimPoint) {
  build();
  sfx(SOUND[kind]);
  const isKill = kind === "kill" || kind === "critKill";
  if (!isKill && markT < DUR[markKind] && (markKind === "kill" || markKind === "critKill")) return;
  markKind = kind; markT = 0; markAt = at; mark!.className = "hitmark " + kind;
  placeMark();
}
let markAt = G.aimPoint, markT = 9;
/** the marker on the game clock (so ?ts= slow motion slows it too): a 20 ms crossfade in, hold, then fade and grow */
function placeMark() {
  if (!mark) return;
  const d = DUR[markKind], k = markT / d, s = SCALE[markKind];
  if (k >= 1) { if (mark.style.opacity !== "0") mark.style.opacity = "0"; return; }
  proj.copy(markAt).project(G.stage.camera);
  const x = (proj.x * 0.5 + 0.5) * innerWidth, y = (-proj.y * 0.5 + 0.5) * innerHeight, inK = Math.min(1, markT / 0.02);
  const a = k < 0.55 ? inK : 1 - (k - 0.55) / 0.45, sc = markT < 0.02 ? s * (1.5 - 0.5 * inK) : s * (1 + 0.12 * Math.max(0, (k - 0.1) / 0.9));
  mark.style.opacity = a.toFixed(3);
  mark.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) scale(${sc.toFixed(3)})`;
}

/** per render frame: move the numbers, keep the marker on the crosshair */
export function updateFeedback(dt: number) {
  if (!built) return;
  for (const k of nums) {
    if (!k.live) continue;
    k.t += dt; if (k.t >= LIFE) { k.live = false; k.el.style.display = "none"; continue; }
    k.v.y += GRAV * dt; k.p.addScaledVector(k.v, dt); place(k);
  }
  if (markT < 2) { markT += dt; placeMark(); }
}
/** raid end / scene change: hide everything */
export function clearFeedback() { for (const k of nums) { k.live = false; k.el.style.display = "none"; } markT = 9; if (mark) mark.style.opacity = "0"; }
