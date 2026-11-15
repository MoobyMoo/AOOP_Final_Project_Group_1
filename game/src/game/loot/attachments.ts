// Gun attachments (G1.5 row 36), on Duckov's mechanism: research/duckov-re/POLISH_FINDINGS.md "Attachments".
// A gun exposes slots; an attachment fits one slot and carries stat modifiers onto the gun's stats. A stat's value is
//   (base + sum of adds) x (1 + sum of percents) x product of (1 + each multiply)
// in that order (Duckov ItemStatsSystem Stat.Value: ModifierType Add 0, PercentageAdd 100, PercentageMultiply 200).
// Pure data and math: safe in saves, the loot sim and node tests. The runtime side (fitting in a raid, the camera,
// the sound) is combat/gunstats.ts; the screen is ui/lootview.ts.
import type { AttSlot, GunAtts, ItemDef, Rarity } from "../contracts";
import { itemType } from "./instances";

/** the gun stats attachments can change. Our names; the Duckov stat key each stands for is in STAT_DUCKOV. */
export type GunStat =
  | "scatterHip" | "scatterAds"      // multipliers on the hip / ADS scatter (rest, max and grow together), base 1
  | "recoverAds"                     // multiplier on the ADS scatter recovery, base 1
  | "recoilV" | "recoilH"            // multipliers on the recoil kick along / across the aim line, base 1
  | "adsTime" | "adsDist"            // seconds to full aim; ADS camera lead factor (the "zoom")
  | "range" | "bulletSpeed" | "noise" // bullet distance (u); bullet speed (u/s); gunshot hearing radius for the AI (u)
  | "mag" | "reload"                 // magazine capacity (rounds); reload time (s)
  | "critMult"                       // crit damage multiplier
  | "moveSpeed";                     // walk and run speed multiplier while the gun is out, base 1
export const STAT_DUCKOV: Record<GunStat, string> = {
  scatterHip: "ScatterFactor", scatterAds: "ScatterFactorADS", recoverAds: "ScatterRecoverADS", recoilV: "RecoilScaleV", recoilH: "RecoilScaleH",
  adsTime: "ADSTime", adsDist: "ADSAimDistanceFactor", range: "BulletDistance", bulletSpeed: "BulletSpeed", noise: "SoundRange",
  mag: "Capacity", reload: "ReloadTime", critMult: "CritDamageFactor", moveSpeed: "MoveSpeedMultiplier",
};
export type ModType = "add" | "percent" | "multiply";
/** Duckov ModifierType numbers (the serialized `type` field) */
export const MOD_TYPE_CODE: Record<ModType, number> = { add: 0, percent: 100, multiply: 200 };
export type Modifier = { stat: GunStat; type: ModType; value: number };
/** duckov = the live Duckov item whose modifiers this one carries (POLISH_FINDINGS "Attachments", the catalog) */
export type AttachmentDef = { id: string; slot: AttSlot; name: string; rarity: Rarity; value: number; weight: number; icon: string; mods: Modifier[]; blurb: string; duckov: string };

/** Every slot type, in display order (Duckov's gun slot keys Scope, Muzzle, Grip, Stock, Tec, Mag; no Special). Each gun
 *  lists the ones it has (combat/guns.ts GunDef.slots, per class from POLISH_FINDINGS "Attachments" A1). The Kingpin
 *  keeps the hand cannon's four: sight, muzzle, magazine, laser (Duckov's Tec). Compatibility is by slot type only
 *  (Duckov also gates muzzles, mags and stocks by gun-type tag; ours: one part fits every gun with that slot). */
export const ATT_SLOTS: readonly AttSlot[] = ["sight", "muzzle", "grip", "stock", "laser", "mag"];
export const SLOT_LABEL: Record<AttSlot, string> = { sight: "Sight", muzzle: "Muzzle", mag: "Magazine", laser: "Laser", grip: "Grip", stock: "Stock" };
export const EMPTY_GUN: GunAtts = { sight: null, muzzle: null, mag: null, laser: null, grip: null, stock: null };

const m = (stat: GunStat, type: ModType, value: number): Modifier => ({ stat, type, value });
/** Our catalog: our names and art, Duckov's modifiers. Each item copies one live Duckov attachment that fits a pistol
 *  or the hand cannon (the `duckov` field); the numbers are the same because every modified Kingpin stat sits on a
 *  Duckov pistol's scale (sound range 14 vs their 20, bullet range 16 vs 16.5, 8 rounds vs 8, ADS 0.3 s vs 0.3 s).
 *  Tier = the Duckov item's quality (q2 fine, q3 uncommon, q4 rare; loot/tiers.ts; before the 7-tier scale these read
 *  uncommon / rare / epic); value follows its price (500 / 1100 / 2400 -> 60 / 130 / 290);
 *  weight is its kg. */
export const ATTACHMENTS: Record<string, AttachmentDef> = {
  // sights (Scope): Duckov's four small sights are one item (+0.16 lead, +0.1 crit damage); 2X is the first real zoom
  att_sight_holo: { id: "att_sight_holo", slot: "sight", name: "Banana Dot Sight", rarity: "fine", value: 60, weight: 0.2, icon: "🔴", duckov: "Scope_All_Holo_1",
    mods: [m("adsDist", "add", 0.16), m("critMult", "add", 0.1)],
    blurb: "A little glass window with a glowing banana-yellow dot. A touch more zoom, and headshots hit harder." },
  att_sight_2x: { id: "att_sight_2x", slot: "sight", name: "Lookout 2x Scope", rarity: "uncommon", value: 130, weight: 0.25, icon: "🔭", duckov: "Scope_All_2X_1",
    mods: [m("adsDist", "add", 0.72), m("adsTime", "add", 0.1), m("recoilV", "percent", 0.2), m("recoilH", "percent", 0.08)],
    blurb: "A stubby brass scope. You see much further down the line, but it is slower to raise and kicks more." },
  // muzzles
  att_muzzle_comp: { id: "att_muzzle_comp", slot: "muzzle", name: "Peel Compensator", rarity: "uncommon", value: 130, weight: 0.1, icon: "🗜️", duckov: "Muzzle_PST_REC_2",
    mods: [m("recoilV", "percent", -0.23), m("recoilH", "percent", -0.23)],
    blurb: "Slotted like a banana peel, it throws the blast upward so the gun kicks less." },
  att_muzzle_supp: { id: "att_muzzle_supp", slot: "muzzle", name: "Hush Can", rarity: "fine", value: 60, weight: 0.25, icon: "🤫", duckov: "Muzzle_PST_SIL_1",
    mods: [m("noise", "percent", -0.75), m("range", "percent", -0.1), m("bulletSpeed", "percent", -0.1)],
    blurb: "A fat can on the barrel. The bang becomes a cough, and guards a few steps away never hear it." },
  att_muzzle_horn: { id: "att_muzzle_horn", slot: "muzzle", name: "Brass Horn Barrel", rarity: "uncommon", value: 130, weight: 0.25, icon: "📯", duckov: "Muzzle_PST_DIS_1",
    mods: [m("range", "percent", 0.3), m("noise", "percent", 0.3), m("moveSpeed", "percent", -0.05)],
    blurb: "A long flared barrel extension. Rounds carry much further, and the whole island hears it." },
  // magazines
  att_mag_ext: { id: "att_mag_ext", slot: "mag", name: "Extended Mag", rarity: "fine", value: 60, weight: 0.12, icon: "📎", duckov: "Magazine_PST_CAP_1",
    mods: [m("mag", "percent", 0.5)],
    blurb: "A longer magazine: half as many rounds again (12 in the Kingpin)." },
  att_mag_drum: { id: "att_mag_drum", slot: "mag", name: "Coconut Drum Mag", rarity: "uncommon", value: 130, weight: 0.15, icon: "🥥", duckov: "Magazine_PST_CAP_2",
    mods: [m("mag", "percent", 1), m("adsTime", "percent", 0.1)],
    blurb: "A round drum in a coconut shell: twice the rounds (16 in the Kingpin), a little heavier to aim." },
  att_mag_quick: { id: "att_mag_quick", slot: "mag", name: "Slick Speed Mag", rarity: "fine", value: 60, weight: 0.1, icon: "⚡", duckov: "Magazine_PST_ADS_1",
    mods: [m("adsTime", "percent", -0.12), m("reload", "percent", -0.2), m("moveSpeed", "percent", 0.05), m("recoverAds", "percent", 0.12)],
    blurb: "A light, waxed magazine with a pull tab. Same rounds, faster reloads, quicker hands." },
  // lasers (Duckov's Tec slot)
  att_laser: { id: "att_laser", slot: "laser", name: "Red Pointer", rarity: "fine", value: 60, weight: 0.05, icon: "🔦", duckov: "Tec_Laser_SCA_1",
    mods: [m("scatterHip", "percent", -0.13)],
    blurb: "A small rail laser. The red dot keeps your shots from the hip a little closer together." },
  att_laser_gold: { id: "att_laser_gold", slot: "laser", name: "Gilded Pointer", rarity: "rare", value: 290, weight: 0.12, icon: "✨", duckov: "Tec_Laser_SCA_2",
    mods: [m("scatterHip", "percent", -0.23)],
    blurb: "A gold-plated rail laser for a businessman who shoots from the hip." },
  // grips (universal in Duckov) and stocks (rifle-tagged in Duckov, fitting every long gun): the long guns' new slots
  att_grip_quick: { id: "att_grip_quick", slot: "grip", name: "Bamboo Foregrip", rarity: "fine", value: 60, weight: 0.1, icon: "🎋", duckov: "Grip_ALL_ADS_1",
    mods: [m("adsTime", "percent", -0.12)],
    blurb: "A short bamboo handle under the barrel. The gun comes up to your eye a little faster." },
  att_grip_steady: { id: "att_grip_steady", slot: "grip", name: "Vine-Wrap Grip", rarity: "rare", value: 290, weight: 0.19, icon: "🪢", duckov: "Grip_ALL_REC_3",
    mods: [m("recoilV", "percent", -0.23), m("recoilH", "percent", -0.23)],
    blurb: "A vine-wrapped vertical grip. Both hands on the gun, and the kick stays where you put it." },
  att_stock_crate: { id: "att_stock_crate", slot: "stock", name: "Crate-Slat Stock", rarity: "fine", value: 60, weight: 0.3, icon: "🪵", duckov: "Stock_AR_REC_1",
    mods: [m("recoilV", "percent", -0.13), m("recoilH", "percent", -0.13)],
    blurb: "Two banana-crate slats nailed into a shoulder stock. Crude, and it still soaks up the kick." },
  att_stock_padded: { id: "att_stock_padded", slot: "stock", name: "Padded Leather Stock", rarity: "rare", value: 290, weight: 0.47, icon: "🛋️", duckov: "Stock_AR_SCA_5",
    mods: [m("scatterHip", "percent", -0.23)],
    blurb: "A stitched leather stock off an office chair. Shots from the hip stay much tighter." },
};
/** attachments with no icon of their own borrow a look-alike's (the asset set covers the six brief ids) */
export const LOOKS_LIKE: Record<string, string> = { att_laser_gold: "att_laser", att_muzzle_horn: "att_muzzle_comp", att_mag_drum: "att_mag_ext", att_mag_quick: "att_mag_ext" };
/** grips and stocks have no models yet: they show as the tier-tinted emoji icon in the UI and nothing on the gun */
/** ...and on the gun and on the ground, its model; the speed mag is a standard-size mag, so it shows no extension */
export const MODEL_LIKE: Record<string, string> = { att_laser_gold: "att_laser", att_muzzle_horn: "att_muzzle_comp", att_mag_drum: "att_mag_ext" };
export const isAttachment = (id: string | null | undefined): boolean => typeof id === "string" && Object.hasOwn(ATTACHMENTS, itemType(id));
export const attachmentDef = (id: string | null | undefined): AttachmentDef | undefined => (id && Object.hasOwn(ATTACHMENTS, itemType(id)) ? ATTACHMENTS[itemType(id)] : undefined);
/** the loot-table entries (tables.ts ITEMS spreads these in) */
export const ATTACHMENT_ITEMS: Record<string, ItemDef> = Object.fromEntries(Object.values(ATTACHMENTS).map((a) => [a.id, { id: a.id, name: a.name, icon: a.icon, rarity: a.rarity, value: a.value, kind: "attachment" as const, weight: a.weight }]));

/** Duckov's Stat.Value order: adds, then the summed percents, then each multiply */
/** Duckov Stat.Recalculate (Stat.cs:106): (base + sum add) x max(0, 1 + sum percent) x product max(0, 1 + multiply) */
export function applyMods(base: number, mods: readonly Modifier[]): number {
  let add = 0, pct = 0, mul = 1;
  for (const q of mods) { if (q.type === "add") add += q.value; else if (q.type === "percent") pct += q.value; else mul *= Math.max(0, 1 + q.value); }
  return (base + add) * Math.max(0, 1 + pct) * mul;
}
/** every modifier on the gun right now, by stat (only the slots the gun has) */
export function gunMods(fitted: GunAtts, slots: readonly AttSlot[] = ATT_SLOTS): Map<GunStat, Modifier[]> {
  const out = new Map<GunStat, Modifier[]>();
  for (const slot of slots) { const a = attachmentDef(fitted[slot]); if (!a || a.slot !== slot) continue; for (const q of a.mods) { const l = out.get(q.stat); if (l) l.push(q); else out.set(q.stat, [q]); } }
  return out;
}
/** a clean fitted set: unknown ids, ids in the wrong slot and slots the gun lacks are dropped */
export function sanitizeGun(raw: unknown, slots: readonly AttSlot[] = ATT_SLOTS): GunAtts {
  const o = raw !== null && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const out: GunAtts = { ...EMPTY_GUN };
  for (const slot of slots) { const id = o[slot]; if (typeof id === "string" && attachmentDef(id)?.slot === slot) out[slot] = id; }
  return out;
}

// ---------------------------------------------------------------- plain-English stat lines for the item tag
/** which way is better for the player, and how to word it (Duckov's polarity: only the bad direction shows red) */
const LINE: Record<GunStat, { label: string; better: 1 | -1; unit?: "s" }> = {
  scatterHip: { label: "Hip spread", better: -1 }, scatterAds: { label: "Aimed spread", better: -1 }, recoverAds: { label: "Aimed spread recovery", better: 1 },
  recoilV: { label: "Recoil", better: -1 }, recoilH: { label: "Side kick", better: -1 },
  adsTime: { label: "Time to aim", better: -1, unit: "s" }, adsDist: { label: "Aim zoom", better: 1 },
  range: { label: "Bullet range", better: 1 }, bulletSpeed: { label: "Bullet speed", better: 1 }, noise: { label: "Gunshot heard from", better: -1 },
  mag: { label: "Magazine", better: 1 }, reload: { label: "Reload time", better: -1, unit: "s" },
  critMult: { label: "Crit damage", better: 1 }, moveSpeed: { label: "Move speed", better: 1 },
};
export type StatLine = { text: string; good: boolean; stat: GunStat };
/** one line per modifier, in plain English: "Aim zoom +72%", "Recoil -23%", "Time to aim +0.1 s". As in Duckov, a
 *  percent reads as a percent and an add reads in the stat's own format: seconds for times, a percent for the factor
 *  stats (aim zoom and crit damage are factors, so +0.72 reads +72%). `magBase` adds the rounds to a magazine line. */
export function statLines(id: string, magBase = 8): StatLine[] {
  const a = attachmentDef(id); if (!a) return [];
  return a.mods.map((q) => {
    const L = LINE[q.stat], sign = q.value >= 0 ? "+" : "-", abs = Math.abs(q.value);
    let amount = q.type === "add" && L.unit === "s" ? `${sign}${+abs.toFixed(2)} s` : `${sign}${Math.round(abs * 100)}%`;
    if (q.stat === "mag" && q.type === "percent") amount += ` (${Math.max(1, Math.round(magBase * (1 + q.value)))} rounds)`;
    return { text: `${L.label} ${amount}`, good: Math.sign(q.value) === L.better, stat: q.stat };
  });
}

// ---------------------------------------------------------------- loot weights (rarity -> weight inside a pool)
/** inside a pool, attachments weigh by tier (Duckov rolls a quality first; its live parts are 29 / 40 / 18 at
 *  quality 2 / 3 / 4, and the better qualities roll less often). Ours: q2 fine 3, q3 uncommon 1.2, q4 rare 0.4 (the
 *  same weights as before the re-tier, which moved each part to its Duckov quality's key) */
export const ATT_RARITY_WEIGHT: Record<Rarity, number> = { junk: 8, common: 6, fine: 3, uncommon: 1.2, rare: 0.4, epic: 0.15, legendary: 0.05 };
/** the pool scale that makes attachments `share` of the rolls in a pool whose other weights sum to `others` */
export function attachmentShare(share: number, others: number): number {
  const total = Object.values(ATTACHMENTS).reduce((sum, a) => sum + ATT_RARITY_WEIGHT[a.rarity], 0);
  return others * share / (1 - share) / total;
}
export function attachmentPool(scale = 1, only?: (a: AttachmentDef) => boolean): Record<string, number> {
  return Object.fromEntries(Object.values(ATTACHMENTS).filter((a) => !only || only(a)).map((a) => [a.id, ATT_RARITY_WEIGHT[a.rarity] * scale]));
}
