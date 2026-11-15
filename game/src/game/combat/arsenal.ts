// TWO GUN SLOTS AND THE BRIEFCASE (Moo 2026-11-15: "Duckov has two weapon slots, we should too"). Duckov's model,
// recovered in research/duckov-re/POLISH_FINDINGS.md 17 "Weapon slots and classes":
//  - three weapon slots: gun 1 (key 1), gun 2 (key 2), melee (V). Either gun slot takes any gun class.
//  - pressing the held slot's key does nothing; the wheel cycles 1 -> 2 (Duckov: Left/Right arrows, or the wheel when its
//    ScrollWheelBehaviour option is "Weapon"; Moo asked for the wheel). Ours skips melee in the cycle: our V is an
//    instant briefcase swing over the gun, not a held weapon (G1 design), so there is nothing to hold.
//  - a draw takes 0.15 s (ItemAgentHolder holdStadyTime): the new gun cannot fire until then; scatter resets on draw.
//  - switching is allowed when idle or reloading only (CanEditInventory): melee, dash, healing and equipping block it.
//    A switch cancels the reload and loses its progress; single-round inserts already done stay in the gun.
//  - each gun keeps its own loaded rounds (Duckov stores them on the gun item): G.loaded[slot].
//  - pickup fills the first empty gun slot (1, then 2), then the pack; it never swaps the gun in hand.
// Guns at home are unloaded: their rounds go back to the caliber's loose reserve (save.ammo), so the settlement
// ledger only ever counts loose rounds per caliber plus what is loaded in the two slots.
import { G } from "../core/state";
import { CALIBERS, GUNS, gunId, gunOf, type Caliber } from "./guns";
import { cancelReload } from "./reload";
import { refreshGun, gunDefOf } from "./gunstats";
import { resetHandling } from "./handling";
import { EMPTY_GUN } from "../loot/attachments";
import { sfx } from "../core/audio";
import type { GunSlot, GunView } from "../contracts";

/** Duckov ItemAgentHolder.holdStadyTime: seconds after a draw before the gun is live */
export const DRAW_TIME = 0.15;
/** the view factory (main.ts sets it once the gun models are loaded; tests leave it null) */
export const arsenalHooks = {
  createView: null as null | ((id: string) => GunView),
  changed: null as null | (() => void),
};
let viewId = "";
/** put the model of the gun in hand on the right hand (or hide it for an empty slot) */
export function mountActiveGun() {
  const gs = G.save?.guns?.[G.slot], id = gunId(gs?.inst) ?? "";
  if (G.rig && arsenalHooks.createView) {
    if (id && id !== viewId) {
      const old = G.gun; const view = arsenalHooks.createView(id);
      if (old?.root.parent) old.root.parent.remove(old.root);
      G.rig.sockets.handR.add(view.root); G.gun = view; viewId = id;
    }
    if (G.gun) G.gun.root.visible = !!id && G.scene === "raid";
  }
  refreshGun();
}
/** can the player switch now (Duckov CanEditInventory: only idle or reloading) */
export const canSwitch = () => G.alive && G.meleeT < 0 && G.rollT < 0 && !G.useItem && !G.equipping;
/** draw the gun in slot k. Returns false if it is already in hand, empty, or switching is blocked */
export function switchTo(k: 0 | 1): boolean {
  if (k === G.slot || !G.save.guns[k] || !canSwitch()) return false;
  cancelReload(); // Duckov: the reload clock lives on the old hand agent; its progress is lost
  G.slot = k; G.drawT = 0; G.burstLeft = 0; G.fireCd = Math.max(G.fireCd, 0);
  mountActiveGun(); resetHandling(); sfx("slide");
  arsenalHooks.changed?.();
  return true;
}
/** the wheel: the other gun slot, if it holds a gun */
export function cycleGun(dir: 1 | -1): boolean { void dir; return switchTo(G.slot === 0 ? 1 : 0); }
/** is the gun in hand still being drawn */
export const drawing = () => G.drawT < DRAW_TIME;

/** a fresh, empty gun slot for an instance */
export const slotFor = (inst: string): GunSlot => ({ inst, atts: { ...EMPTY_GUN } });
/** the first empty gun slot (Duckov TryPlug emptyOnly: primary, then secondary), or -1 */
export const freeGunSlot = (): -1 | 0 | 1 => (!G.save.guns[0] ? 0 : !G.save.guns[1] ? 1 : -1);
/** a found gun goes into the first empty slot, empty of rounds (ours: guns spawn unloaded, so no round appears
 *  without a source in the ledger). Returns the slot, or -1 when both are full (the caller packs it) */
export function equipFound(inst: string): -1 | 0 | 1 {
  const free = freeGunSlot(); if (free < 0) return -1;
  const k = free as 0 | 1;
  G.save.guns[k] = slotFor(inst); G.loaded[k] = 0;
  if (!G.save.guns[G.slot] || k === G.slot) { G.slot = k; G.drawT = 0; } // Duckov: an empty hand draws what lands in a slot
  mountActiveGun(); arsenalHooks.changed?.();
  return k;
}
/** unload slot k into the loose reserve of its caliber; returns the rounds moved */
export function unloadSlot(k: 0 | 1): number {
  const def = gunDefOf(G.save.guns[k]?.inst), n = G.loaded[k];
  if (!def || n <= 0) { G.loaded[k] = 0; return 0; }
  G.reserve[def.caliber] += n; G.loaded[k] = 0; return n;
}
/** take the gun out of slot k (the caller puts the gun and the returned attachments somewhere). Its rounds go to the
 *  reserve, its attachments come off with it (ours: a gun outside a slot carries no parts; Duckov keeps them on) */
export function takeGun(k: 0 | 1): { inst: string; atts: string[] } | null {
  const gs = G.save.guns[k]; if (!gs) return null;
  if (k === G.slot) cancelReload();
  unloadSlot(k);
  const atts = Object.values(gs.atts).filter((a): a is string => !!a);
  G.save.guns[k] = null;
  if (k === G.slot && G.save.guns[k === 0 ? 1 : 0]) { G.slot = k === 0 ? 1 : 0; G.drawT = 0; }
  mountActiveGun(); arsenalHooks.changed?.();
  return { inst: gs.inst, atts };
}
/** put a gun instance into slot k (must be empty) */
export function placeGun(k: 0 | 1, inst: string) {
  if (G.save.guns[k]) throw new Error("gun slot occupied");
  G.save.guns[k] = slotFor(inst); G.loaded[k] = 0;
  if (!G.save.guns[G.slot] || k === G.slot) { G.slot = k; G.drawT = 0; }
  mountActiveGun(); arsenalHooks.changed?.();
}
/** swap the two slots' contents (the Tab screen's drag from one gun slot to the other) */
export function swapSlots() {
  cancelReload();
  const g = G.save.guns; [g[0], g[1]] = [g[1], g[0]]; [G.loaded[0], G.loaded[1]] = [G.loaded[1], G.loaded[0]];
  G.slot = G.slot === 0 ? 1 : 0; // the gun in hand stays in hand
  mountActiveGun(); arsenalHooks.changed?.();
}
/** raid start: load each gun from its caliber's reserve (the home stash is loose rounds) */
export function loadForRaid() {
  for (const k of [0, 1] as const) {
    G.loaded[k] = 0; const def = gunDefOf(G.save.guns[k]?.inst); if (!def) continue;
    G.slot = k; refreshGun(); // the slot's real capacity with its attachments
    const n = Math.min(G.magSize, G.reserve[def.caliber]); G.loaded[k] = n; G.reserve[def.caliber] -= n;
  }
  G.slot = G.save.guns[0] ? 0 : G.save.guns[1] ? 1 : 0; G.drawT = 9; G.burstLeft = 0;
}
/** every round the player holds, per caliber: loose reserve plus loaded (the settlement checkpoint) */
export function heldRounds(): Record<Caliber, number> {
  const out = { ...G.reserve };
  for (const k of [0, 1] as const) { const def = gunDefOf(G.save.guns[k]?.inst); if (def) out[def.caliber] += G.loaded[k]; }
  return out;
}
/** short label for a caliber on the HUD */
export const caliberShort = (c: Caliber) => CALIBERS[c].short;
export const gunName = (inst: string | null | undefined) => gunOf(inst)?.name ?? "";
(globalThis as unknown as { __arsenal: object }).__arsenal = { defs: () => GUNS, switchTo, cycleGun, equipFound, takeGun, placeGun, swapSlots, heldRounds, state: () => ({ slot: G.slot, loaded: [...G.loaded], reserve: { ...G.reserve }, guns: G.save?.guns?.map((g) => g && { inst: g.inst, atts: { ...g.atts } }), drawT: G.drawT }) };
