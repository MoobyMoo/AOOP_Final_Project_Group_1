// Gun handling: scatter, recoil and aim-down-sights for the Kingpin (Moo 2026-11-15: "the recoil on the gun on our
// crosshair", "the spread that gets narrower if we don't move", "aim down sights that zooms in a bit and reduces
// spread"). Duckov's mechanism, ported from the decompiled source (POLISH_FINDINGS 16); numbers in weapons.ts
// KINGPIN_HANDLING, all live-tunable under ?tune (core/tune.ts).
//   ADS     aim amount moves toward 1 at 1/adsTime per second while the button is held and nothing else is running
//           (sprint, dash, reload, melee, healing, equipping all drop it, as Duckov's IsInAdsInput), back at >= 4/s.
//   scatter rest/max/grow/recover lerped hip -> ADS by the aim amount; grows after each shot, recovers at
//           recover x grow x shots/s; the live cone is that x the movement multiplier.
//   recoil  a screen-space kick added to the cursor before it is turned into the aim point, so the crosshair, the aim
//           yaw and the next shot all see it, then it settles back (InputManager.AddRecoil / ProcessMousePosViaRecoil).
import { G } from "../core/state";
import type { Intent } from "../core/input";
import { KINGPIN, KINGPIN_HANDLING as H, PLAYER } from "./weapons";
import { tuneObject } from "../core/tune";
import { GUN, refreshGun } from "./gunstats";

tuneObject("gun", H, {
  rest: { min: 0, max: 30, step: 0.1, label: "hip scatter at rest (deg)" }, max: { min: 0, max: 60, step: 0.5, label: "hip scatter max" },
  grow: { min: 0, max: 30, step: 0.1, label: "hip grow per shot" }, recover: { min: 0, max: 3, step: 0.01, label: "hip recover (x grow x shots/s)" },
  restAds: { min: 0, max: 30, step: 0.1, label: "ADS scatter at rest" }, maxAds: { min: 0, max: 60, step: 0.5, label: "ADS scatter max" },
  growAds: { min: 0, max: 30, step: 0.1, label: "ADS grow per shot" }, recoverAds: { min: 0, max: 3, step: 0.01, label: "ADS recover" },
  walk: { min: 0, max: 4, step: 0.05, label: "moving: + x at walk speed" }, sprint: { min: 0, max: 6, step: 0.05, label: "sprinting: + extra" },
  adsMove: { min: 0, max: 1, step: 0.05, label: "ADS keeps this much of the move penalty" }, moveRate: { min: 0.5, max: 40, step: 0.5, label: "move penalty ease /s" },
  vMin: { min: 0, max: 3, step: 0.01, label: "recoil V min" }, vMax: { min: 0, max: 3, step: 0.01, label: "recoil V max" },
  hMin: { min: -3, max: 3, step: 0.01, label: "recoil H min" }, hMax: { min: -3, max: 3, step: 0.01, label: "recoil H max" },
  scaleV: { min: 0, max: 150, step: 1, label: "recoil V scale (px @1440)" }, scaleH: { min: 0, max: 150, step: 1, label: "recoil H scale (px @1440)" },
  recoilTime: { min: 0.01, max: 0.3, step: 0.005, label: "kick time (s)" }, recoverDelay: { min: 0, max: 0.5, step: 0.01, label: "hold before settle (s)" },
  recoverSpeed: { min: 20, max: 3000, step: 10, label: "settle speed (px/s @1440)" }, recoilMul: { min: 0, max: 4, step: 0.05, label: "recoil multiplier" },
  adsTime: { min: 0.05, max: 1.5, step: 0.01, label: "ADS time (s)" }, adsWalk: { min: 0.1, max: 1, step: 0.01, label: "ADS walk multiplier" },
  adsDist: { min: 1, max: 4, step: 0.01, label: "ADS camera lead factor (bare gun)" }, adsFov: { min: 0.6, max: 1, step: 0.005, label: "ADS FOV scale" },
}, { note: "Kingpin scatter / recoil / ADS (combat/handling.ts)" });
tuneObject("kingpin", KINGPIN, {
  interval: { min: 0.05, max: 1, step: 0.01, label: "seconds between shots" }, damage: { min: 1, max: 80, step: 1 }, range: { min: 4, max: 40, step: 0.5 },
  reload: { min: 0.2, max: 4, step: 0.05, label: "reload (s)" }, magnet: { min: 0, max: 0.5, step: 0.005, label: "magnet hip (rad)" }, magnetAds: { min: 0, max: 0.5, step: 0.005, label: "magnet ADS (rad)" },
  critMult: { min: 1, max: 4, step: 0.05 }, noise: { min: 0, max: 30, step: 0.5 },
});

refreshGun(); // the registry just applied any saved overrides to H and KINGPIN
// Attachments (combat/gunstats.ts): the modded numbers come from GUN (scatter rest/max/grow, recoil scale, ADS time);
// the rest of the handling numbers are read straight from H.
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const toward = (v: number, to: number, step: number) => (Math.abs(to - v) <= step ? to : v + Math.sign(to - v) * step);
/** live handling state (read by the HUD, the camera and the capture tools) */
export const HS = {
  /** Duckov scatterBeforeControl: degrees, before the movement multiplier */
  scatter: 6,
  /** aim amount 0..1 */
  ads: 0,
  /** movement multiplier on the cone */
  move: 1,
  /** recoil offset of the cursor, CSS px, y up */
  rx: 0, ry: 0,
  shots: 0,
};
let kickX = 0, kickY = 0, kickT = 1e9, kickDur = 0.06, mouseX = NaN, mouseY = NaN;
export const shotsPerSecond = () => 1 / Math.max(0.01, KINGPIN.interval);
export const restScatter = () => lerp(GUN.rest, GUN.restAds, HS.ads);
export const maxScatter = () => lerp(GUN.max, GUN.maxAds, HS.ads);
export const growScatter = () => lerp(GUN.grow, GUN.growAds, HS.ads);
/** degrees per second back toward rest (Duckov: lerp(rec, recADS, ads) x ScatterGrow x ShootSpeed) */
export const recoverScatter = () => lerp(H.recover, GUN.recoverAds, HS.ads) * growScatter() * shotsPerSecond();
/** the cone a round leaves in right now, degrees (Duckov CurrentScatter = scatterBeforeControl x character multiplier) */
export const currentScatter = () => HS.scatter * HS.move;
export function resetHandling() { refreshGun(); HS.scatter = GUN.rest; HS.ads = 0; HS.move = 1; HS.rx = HS.ry = 0; HS.shots = 0; kickT = 1e9; mouseX = mouseY = NaN; }
/** Duckov IsInAdsInput: the button, and no sprint or other action running */
export const adsInput = (i: Intent) => i.ads && !G.sprinting && G.rollT < 0 && G.meleeT < 0 && G.reloadT < 0 && !G.useItem && !G.equipping;
const pxScale = () => innerHeight / 1440;

/** per sim step, before the aim point is picked */
export function updateHandling(dt: number, i: Intent) {
  const want = adsInput(i);
  G.ads = want;
  const rate = 1 / Math.max(0.01, GUN.adsTime);
  HS.ads = toward(HS.ads, want ? 1 : 0, dt * (want ? rate : Math.max(rate, 4)));
  // scatter: clamp to max, then recover toward rest (6x when below it, after ADS lowered the floor's opposite)
  const rest = restScatter(), max = maxScatter();
  if (HS.scatter > max) HS.scatter = max;
  HS.scatter = toward(HS.scatter, rest, recoverScatter() * dt * (HS.scatter < rest ? 6 : 1));
  // movement multiplier: walk share of the walk speed, plus the sprint extra, eased
  const speed = Math.hypot(G.vel.x, G.vel.z), walkK = Math.min(1, speed / PLAYER.speed);
  const target = 1 + (H.walk * walkK + (G.sprinting ? H.sprint : 0)) * lerp(1, H.adsMove, HS.ads);
  HS.move += (target - HS.move) * (1 - Math.exp(-dt * H.moveRate));
  // recoil: the kick runs over kickDur, then holds, then settles at recoverSpeed
  const ndc = i.aimNdc;
  if (ndc) {
    const mx = ndc.x * innerWidth * 0.5, my = ndc.y * innerHeight * 0.5;
    if (Number.isFinite(mouseX)) { // moving the mouse against the kick cancels that much of it (Duckov's counter-pull)
      const len = Math.hypot(HS.rx, HS.ry);
      if (len > 1e-3) { const pull = -((mx - mouseX) * HS.rx + (my - mouseY) * HS.ry) / len; if (pull > 0) { const k = Math.max(0, len - pull) / len; HS.rx *= k; HS.ry *= k; } }
    }
    mouseX = mx; mouseY = my;
  } else { HS.rx = HS.ry = 0; mouseX = mouseY = NaN; }
  let step = Math.min(dt, Math.max(0, kickDur - kickT));
  if (step > 0) { HS.rx += kickX * step / kickDur * pxScale(); HS.ry += kickY * step / kickDur * pxScale(); }
  else if (kickT > H.recoverDelay) {
    const len = Math.hypot(HS.rx, HS.ry);
    if (len > 0) { step = H.recoverSpeed * pxScale() * dt; const k = Math.max(0, len - step) / len; HS.rx *= k; HS.ry *= k; }
  }
  kickT += dt;
}
/** the cursor with the recoil offset, in NDC (what the aim point is picked from) */
export function kickedNdc(ndc: { x: number; y: number }) { return { x: ndc.x + HS.rx / (innerWidth * 0.5), y: ndc.y + HS.ry / (innerHeight * 0.5) }; }
/** a shot leaves: returns its yaw deviation (rad) inside the current cone, then grows scatter and starts the kick */
export function onShot(hero: { x: number; y: number } | null): number {
  const dev = (G.rng() - 0.5) * currentScatter() * Math.PI / 180;
  HS.scatter = Math.min(maxScatter(), Math.max(restScatter(), HS.scatter + growScatter()));
  HS.shots++;
  // kick direction: outward along hero -> cursor on screen (V) and across it (H, Duckov's -Perpendicular)
  if (hero && G.intent.aimNdc) {
    const cx = G.intent.aimNdc.x * innerWidth * 0.5 + HS.rx - hero.x, cy = G.intent.aimNdc.y * innerHeight * 0.5 + HS.ry - hero.y;
    const l = Math.hypot(cx, cy) || 1, nx = cx / l, ny = cy / l;
    const v = lerp(H.vMin, H.vMax, G.rng()) * GUN.scaleV * H.recoilMul, h = lerp(H.hMin, H.hMax, G.rng()) * GUN.scaleH * H.recoilMul;
    kickX = nx * v + h * ny; kickY = ny * v - h * nx;
    kickDur = Math.max(0.005, Math.min(H.recoilTime, 1 / shotsPerSecond())); kickT = 0;
  }
  return dev;
}
// capture and test handle
(globalThis as unknown as { __gun: object }).__gun = { HS, H, GUN, currentScatter, restScatter, maxScatter, recoverScatter };
