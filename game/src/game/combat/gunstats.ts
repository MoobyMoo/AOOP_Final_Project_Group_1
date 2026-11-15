// The live stats of the gun in hand with its attachments fitted (G1.5 row 36; two gun slots: combat/arsenal.ts). Base
// numbers are the gun's row in combat/guns.ts (the Kingpin's are also live under ?tune "kingpin" / "gun"); GUN is
// those numbers after the fitted attachments' modifiers (loot/attachments.ts applyMods: adds, then percents, then
// multiplies, Duckov's order). Everything that shoots, aims or listens reads GUN: handling.ts (scatter, recoil, ADS),
// raid.ts (camera lead and FOV), combat.ts (damage, pellets, noise, range, crit), reload.ts (mag and reload via GUN_DEF).
// Fitting and removing are instant in the loot screen (Duckov's slot drag), never during a reload, and keep every
// round: a smaller magazine hands its extra rounds back to the reserve.
import { G } from "../core/state";
import { GUNS, gunOf, type GunDef as ArmDef, type Handling } from "./guns";
import { applyMods, attachmentDef, gunMods, ATT_SLOTS, EMPTY_GUN, type GunStat } from "../loot/attachments";
import { onTune, tuneObject } from "../core/tune";
import { setShotSuppressed } from "../core/audio";
import type { AttSlot, GunAtts, GunSlot } from "../contracts";
import { cancelReload } from "./reload";

/** sights: how much a sight's zoom also narrows the FOV at full ADS (ours; Duckov's camera only pushes the lead, its
 *  FOV is 23.5 -> 22.8 for every gun). FOV scale = adsFov / (1 + fovPerZoom x the sight's added lead factor). */
export const SIGHT = tuneObject("sight", { fovPerZoom: 0.3 }, { fovPerZoom: { min: 0, max: 1.5, step: 0.01, label: "FOV narrowing per +1 aim zoom" } },
  { note: "scope zoom: the FOV part (combat/gunstats.ts); the lead part is the sight's ADSAimDistanceFactor" });

/** the gun row in hand (the Kingpin when the slot is empty, so readers always see a valid gun; ARMED says if one is) */
export let ARM: ArmDef = GUNS.kingpin45;
/** the gun in hand's base handling (live: reassigned by refreshGun) */
export let H: Handling = GUNS.kingpin45.h;
/** the live, modified stats. Scatter and recoil are already multiplied through (rest/max/grow, scaleV/scaleH). */
export const GUN = {
  id: "kingpin45", armed: true,
  rest: H.rest, max: H.max, grow: H.grow, restAds: H.restAds, maxAds: H.maxAds, growAds: H.growAds,
  recoverAds: H.recoverAds, scaleV: H.scaleV, scaleH: H.scaleH, adsTime: H.adsTime, adsDist: H.adsDist, adsFov: H.adsFov,
  range: ARM.range, bulletSpeed: ARM.bulletSpeed, noise: ARM.noise, mag: ARM.mag, reload: ARM.reload, critMult: ARM.critMult, moveSpeed: 1,
  damage: ARM.damage, pellets: ARM.pellets, interval: ARM.interval, pen: ARM.pen,
  /** Duckov ItemAgent_Gun.Silenced: sound range below 0.95 x the gun's own; the shot then plays muffled */
  suppressed: false,
};
/** the reload loop's view of the gun (reload.ts startReload) */
export const GUN_DEF = { mag: ARM.mag, reload: ARM.reload, reloadMode: ARM.reloadMode, perRound: ARM.perRound, autoReload: ARM.autoReload, sound: ARM.sound };

/** the gun slot in hand (null: empty slot) */
export const activeSlot = (): GunSlot | null => G.save?.guns?.[G.slot] ?? null;
/** what is fitted on the gun in hand */
export const fitted = (): GunAtts => activeSlot()?.atts ?? EMPTY_GUN;
/** the gun row an instance or id names */
export const gunDefOf = (inst: string | null | undefined): ArmDef | undefined => gunOf(inst);
/** the unmodified value of each stat for a gun (the item tag words adds against it) */
export function baseStat(stat: GunStat, def: ArmDef = ARM): number {
  const h = def.h;
  return { scatterHip: 1, scatterAds: 1, recoverAds: 1, recoilV: 1, recoilH: 1, adsTime: h.adsTime, adsDist: h.adsDist, range: def.range, bulletSpeed: def.bulletSpeed, noise: def.noise, mag: def.mag, reload: def.reload, critMult: def.critMult, moveSpeed: def.move }[stat];
}
/** a gun's stats with a fitted set (pure: the loot screen's tags and the gunfeel table use it for guns not in hand) */
export function statsFor(def: ArmDef, atts: GunAtts) {
  const h = def.h, mods = gunMods(atts, def.slots), v = (s: GunStat) => applyMods(baseStat(s, def), mods.get(s) ?? []);
  const hip = Math.max(0, v("scatterHip")), ads = Math.max(0, v("scatterAds"));
  const adsDist = Math.max(1, v("adsDist")), noise = Math.max(0, v("noise"));
  return {
    rest: h.rest * hip, max: h.max * hip, grow: h.grow * hip, restAds: h.restAds * ads, maxAds: h.maxAds * ads, growAds: h.growAds * ads,
    recoverAds: h.recoverAds * Math.max(0, v("recoverAds")), scaleV: h.scaleV * Math.max(0, v("recoilV")), scaleH: h.scaleH * Math.max(0, v("recoilH")),
    adsTime: Math.max(0.05, v("adsTime")), adsDist, adsFov: h.adsFov / (1 + SIGHT.fovPerZoom * Math.max(0, adsDist - h.adsDist)),
    range: Math.max(2, v("range")), bulletSpeed: Math.max(5, v("bulletSpeed")), noise,
    mag: Math.max(1, Math.round(v("mag"))), // Duckov Capacity: max(1, RoundToInt(value))
    reload: Math.max(0.1, v("reload")), critMult: Math.max(1, v("critMult")), moveSpeed: v("moveSpeed") > 0 ? v("moveSpeed") : 1,
    // an integrally suppressed gun is quiet by its own number; a fitted can makes any gun quiet (Duckov's 0.95 rule)
    suppressed: !!def.suppressed || noise < 0.95 * def.noise,
  };
}
/** recompute GUN from the gun in hand and its attachments; pushes the visible and audible side too */
export function refreshGun() {
  const slot = activeSlot(), def = gunDefOf(slot?.inst) ?? GUNS.kingpin45;
  ARM = def; H = def.h;
  Object.assign(GUN, statsFor(def, slot?.atts ?? EMPTY_GUN), { id: def.id, armed: !!slot, damage: def.damage, pellets: def.pellets, interval: def.interval, pen: def.pen });
  Object.assign(GUN_DEF, { mag: GUN.mag, reload: GUN.reload, reloadMode: def.reloadMode, perRound: def.perRound, autoReload: def.autoReload, sound: def.sound });
  if (G.save) {
    G.magSize = GUN.mag;
    if (G.scene === "raid" && G.mag > G.magSize) { G.ammo += G.mag - G.magSize; G.mag = G.magSize; }
    // the extended mag is its own piece hanging under the standard magazine (attachments.glb), so the old longer-mag
    // geometry stays off: both at once would overlap
    G.gun?.setVariant?.({ extMag: false });
    G.gun?.setAttachments?.(fitted());
  }
  setShotSuppressed(GUN.suppressed);
}
onTune((group) => { if (group === "gun" || group === "kingpin" || group === "sight") refreshGun(); });

export type FitResult = { ok: true; old: string | null } | { ok: false; why: string };
/** fit an attachment id into its slot on gun slot `on` (default: the gun in hand); returns the one it replaced (the
 *  caller puts it somewhere) */
export function fit(id: string, on: 0 | 1 = G.slot): FitResult {
  if (G.scene === "raid" && !G.alive) return { ok: false, why: "The raid has ended" };
  const gs = G.save.guns[on], def = gunDefOf(gs?.inst);
  if (!gs || !def) return { ok: false, why: "No gun in that slot" };
  const a = attachmentDef(id); if (!a) return { ok: false, why: `That doesn't fit the ${def.name}` };
  if (!def.slots.includes(a.slot)) return { ok: false, why: `The ${def.name} has no ${a.slot} slot` };
  if (G.scene === "raid" && G.reloadT >= 0 && on === G.slot) cancelReload();
  const old = gs.atts[a.slot];
  gs.atts[a.slot] = id; refreshGun();
  return { ok: true, old };
}
/** take the attachment off a slot; returns its id (the caller puts it somewhere) */
export function unfit(slot: AttSlot, on: 0 | 1 = G.slot): string | null {
  if (G.scene === "raid" && !G.alive) return null;
  const gs = G.save.guns[on]; const id = gs?.atts[slot]; if (!gs || !id) return null;
  if (G.scene === "raid" && G.reloadT >= 0 && on === G.slot) cancelReload();
  gs.atts[slot] = null; refreshGun(); return id;
}
export { ATT_SLOTS };
// capture and test handle (tools/gunfeel.mjs)
(globalThis as unknown as { __gunStats: object }).__gunStats = { GUN, fitted, fit, unfit, refreshGun, statsFor, arm: () => ARM };
