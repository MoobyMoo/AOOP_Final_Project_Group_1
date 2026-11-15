// The reload loop (G1.5 row 20), on Duckov's mechanism from research/duckov-re/POLISH_FINDINGS.md section 12; the
// numbers and the rules are in combat/weapons.ts (CANCEL RULE, RELOAD).
// - "mag": one timer for a top-up or an empty gun; when it completes, the whole missing amount moves from the reserve.
// - "round": one round per perRound seconds; each completed insert is already in the gun, so a cancel keeps it (the
//   timer and the transfer are separate steps, so an interrupt can never duplicate rounds).
// State for the HUD: G.reloadT (0..1 overall progress, -1 = not reloading), G.reloadTime (seconds for this reload),
// G.mag / G.ammo (loaded / reserve). Events: onReload(fn) gets "start" | "round" | "done" | "cancel" | "dry" | "empty".
import { G } from "../core/state";
import { sfx } from "../core/audio";
import type { GunDef } from "./weapons";

export type ReloadEvent = "start" | "round" | "done" | "cancel" | "dry" | "empty";
const listeners = new Set<(e: ReloadEvent) => void>();
/** subscribe to reload events (the HUD); returns an unsubscribe function */
export function onReload(fn: (e: ReloadEvent) => void) { listeners.add(fn); return () => listeners.delete(fn); }
const emit = (e: ReloadEvent) => { for (const f of listeners) f(e); };

let elapsed = 0, need = 0, inserted = 0, mode: GunDef["reloadMode"] = "mag", lastDry = -1;
/** reload-speed gain from gear or skills later (Duckov: time / (1 + gain)); 0 today */
const speedGain = () => 0;

export const reloading = () => G.reloadT >= 0;
/** start a reload if the gun is not full and the reserve has rounds; returns true if it started */
export function startReload(gun: GunDef): boolean {
  if (G.reloadT >= 0 || G.mag >= G.magSize || G.ammo <= 0 || G.useItem) return false;
  mode = gun.reloadMode; need = Math.min(G.magSize - G.mag, G.ammo); inserted = 0; elapsed = 0;
  G.reloadTime = (mode === "round" ? need * gun.perRound : gun.reload) / (1 + speedGain());
  G.reloadT = 0; emit("start");
  return true;
}
/** stop a reload (dash, briefcase, heal, death). "round" mode keeps the rounds already inserted */
export function cancelReload() {
  if (G.reloadT < 0) return;
  G.reloadT = -1; emit("cancel");
}
export function updateReload(dt: number) {
  if (G.reloadT < 0) return;
  const before = elapsed; elapsed += dt;
  const T = G.reloadTime, k0 = before / T, k1 = elapsed / T;
  if (mode === "mag") {
    if (k0 < 0.15 && k1 >= 0.15) sfx("reloadOut");
    if (k0 < 0.65 && k1 >= 0.65) sfx("reloadIn");
    if (k0 < 0.85 && k1 >= 0.85) sfx("slide");
    if (k1 >= 1) { const n = Math.min(G.magSize - G.mag, G.ammo); G.mag += n; G.ammo -= n; G.reloadT = -1; emit("done"); return; }
  } else {
    const per = T / Math.max(1, need);
    while (inserted < need && elapsed >= (inserted + 1) * per) {
      if (G.ammo <= 0 || G.mag >= G.magSize) break;
      G.mag++; G.ammo--; inserted++; sfx("reloadRound"); emit("round");
    }
    if (inserted >= need || G.ammo <= 0 || G.mag >= G.magSize) { G.reloadT = -1; emit("done"); return; }
  }
  G.reloadT = Math.min(0.999, k1);
}
/** the trigger on an empty gun: a dry click (at most one per 200 ms) and, on a fresh pull with rounds in reserve, a
 *  reload. click = this attempt should click (a fresh pull, or the first held attempt after the gun ran dry) */
export function emptyTrigger(gun: GunDef, click: boolean, fresh: boolean): boolean {
  if (click && G.time - lastDry >= 0.2) { lastDry = G.time; sfx("dry"); emit("dry"); }
  if (G.ammo > 0) return fresh && startReload(gun);
  if (fresh) emit("empty");
  return false;
}
