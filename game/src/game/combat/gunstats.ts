// The Kingpin's live stats with its attachments fitted (G1.5 row 36). Base numbers stay in combat/weapons.ts (KINGPIN,
// KINGPIN_HANDLING, live under ?tune); GUN is those numbers after the fitted attachments' modifiers (loot/attachments.ts
// applyMods: adds, then percents, then multiplies, Duckov's order). Everything that shoots, aims or listens reads GUN:
// handling.ts (scatter, recoil, ADS), raid.ts (camera lead and FOV), combat.ts (noise, range, crit), reload.ts (mag
// size and reload time through GUN_DEF).
// Fitting and removing are instant in the loot screen (Duckov's slot drag), never during a reload, and keep every
// round: a smaller magazine hands its extra rounds back to the reserve.
import { G } from "../core/state";
import { KINGPIN, KINGPIN_HANDLING as H } from "./weapons";
import { applyMods, attachmentDef, gunMods, ATT_SLOTS, EMPTY_GUN, type GunStat } from "../loot/attachments";
import { onTune, tuneObject } from "../core/tune";
import { setShotSuppressed } from "../core/audio";
import type { AttSlot, GunAtts } from "../contracts";
import { cancelReload } from "./reload";

/** sights: how much a sight's zoom also narrows the FOV at full ADS (ours; Duckov's camera only pushes the lead, its
 *  FOV is 23.5 -> 22.8 for every gun). FOV scale = adsFov / (1 + fovPerZoom x the sight's added lead factor). */
export const SIGHT = tuneObject("sight", { fovPerZoom: 0.3 }, { fovPerZoom: { min: 0, max: 1.5, step: 0.01, label: "FOV narrowing per +1 aim zoom" } },
  { note: "scope zoom: the FOV part (combat/gunstats.ts); the lead part is the sight's ADSAimDistanceFactor" });

/** the live, modified stats. Scatter and recoil are already multiplied through (rest/max/grow, scaleV/scaleH). */
export const GUN = {
  rest: H.rest, max: H.max, grow: H.grow, restAds: H.restAds, maxAds: H.maxAds, growAds: H.growAds,
  recoverAds: H.recoverAds, scaleV: H.scaleV, scaleH: H.scaleH, adsTime: H.adsTime, adsDist: H.adsDist, adsFov: H.adsFov,
  range: KINGPIN.range, bulletSpeed: KINGPIN.bulletSpeed, noise: KINGPIN.noise, mag: KINGPIN.mag, reload: KINGPIN.reload, critMult: KINGPIN.critMult, moveSpeed: 1,
  /** Duckov ItemAgent_Gun.Silenced: sound range below 0.95 x the gun's own; the shot then plays muffled */
  suppressed: false,
};
/** the reload loop's view of the gun (reload.ts startReload) */
export const GUN_DEF = { mag: KINGPIN.mag, reload: KINGPIN.reload, reloadMode: KINGPIN.reloadMode, perRound: KINGPIN.perRound, autoReload: KINGPIN.autoReload };

/** what is fitted now (the save holds it at home and in the raid: attachments ride on the gun) */
export const fitted = (): GunAtts => G.save?.gun ?? EMPTY_GUN;
/** the unmodified value of each stat (the item tag words adds against it) */
export function baseStat(stat: GunStat): number {
  return { scatterHip: 1, scatterAds: 1, recoverAds: 1, recoilV: 1, recoilH: 1, adsTime: H.adsTime, adsDist: H.adsDist, range: KINGPIN.range, bulletSpeed: KINGPIN.bulletSpeed, noise: KINGPIN.noise, mag: KINGPIN.mag, reload: KINGPIN.reload, critMult: KINGPIN.critMult, moveSpeed: 1 }[stat];
}
/** recompute GUN from the base numbers and the fitted attachments; pushes the visible and audible side too */
export function refreshGun() {
  const mods = gunMods(fitted()), v = (s: GunStat) => applyMods(baseStat(s), mods.get(s) ?? []);
  const hip = Math.max(0, v("scatterHip")), ads = Math.max(0, v("scatterAds"));
  GUN.rest = H.rest * hip; GUN.max = H.max * hip; GUN.grow = H.grow * hip;
  GUN.restAds = H.restAds * ads; GUN.maxAds = H.maxAds * ads; GUN.growAds = H.growAds * ads; GUN.recoverAds = H.recoverAds * Math.max(0, v("recoverAds"));
  GUN.scaleV = H.scaleV * Math.max(0, v("recoilV")); GUN.scaleH = H.scaleH * Math.max(0, v("recoilH"));
  GUN.adsTime = Math.max(0.05, v("adsTime")); GUN.adsDist = Math.max(1, v("adsDist"));
  GUN.adsFov = H.adsFov / (1 + SIGHT.fovPerZoom * Math.max(0, GUN.adsDist - H.adsDist));
  GUN.range = Math.max(2, v("range")); GUN.bulletSpeed = Math.max(5, v("bulletSpeed")); GUN.noise = Math.max(0, v("noise"));
  GUN.mag = Math.max(1, Math.round(v("mag"))); // Duckov Capacity: max(1, RoundToInt(value))
  GUN.reload = Math.max(0.1, v("reload")); GUN.critMult = Math.max(1, v("critMult")); GUN.moveSpeed = v("moveSpeed") > 0 ? v("moveSpeed") : 1;
  GUN.suppressed = GUN.noise < 0.95 * KINGPIN.noise;
  GUN_DEF.mag = GUN.mag; GUN_DEF.reload = GUN.reload;
  if (G.save) {
    G.magSize = GUN.mag;
    if (G.scene === "raid" && G.mag > G.magSize) { G.ammo += G.mag - G.magSize; G.mag = G.magSize; }
    G.gun?.setVariant?.({ extMag: GUN.mag > KINGPIN.mag });
    G.gun?.setAttachments?.(fitted());
  }
  setShotSuppressed(GUN.suppressed);
}
onTune((group) => { if (group === "gun" || group === "kingpin" || group === "sight") refreshGun(); });

export type FitResult = { ok: true; old: string | null } | { ok: false; why: string };
/** fit an attachment id into its slot; returns the one it replaced (the caller puts it somewhere) */
export function fit(id: string): FitResult {
  const a = attachmentDef(id); if (!a) return { ok: false, why: "That doesn't fit the Kingpin" };
  if (G.scene === "raid" && G.reloadT >= 0) cancelReload();
  const gun = G.save.gun, old = gun[a.slot];
  gun[a.slot] = id; refreshGun();
  return { ok: true, old };
}
/** take the attachment off a slot; returns its id (the caller puts it somewhere) */
export function unfit(slot: AttSlot): string | null {
  const gun = G.save.gun, id = gun[slot]; if (!id) return null;
  if (G.scene === "raid" && G.reloadT >= 0) cancelReload();
  gun[slot] = null; refreshGun(); return id;
}
export { ATT_SLOTS };
// capture and test handle (tools/gunfeel.mjs)
(globalThis as unknown as { __gunStats: object }).__gunStats = { GUN, fitted, fit, unfit, refreshGun };
