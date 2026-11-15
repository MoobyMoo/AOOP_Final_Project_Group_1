// ITEM TIERS: Duckov's item quality, our names and colours (Moo 2026-11-15: "guns, armor etc like Duckov can have
// rarity"). Mechanism: research/duckov-re/POLISH_FINDINGS.md 17 "Item quality". Seven levels, index = Duckov quality
// 0..6. Pure data: safe in saves, the loot sim and node tests.
//   reveal  Duckov's search time per quality (QUALITY_SEARCH_SECONDS, loot/containers.ts): 1, 1, 1, 1, 1.5, 2, 1 s
//   colour  one colour per level; the loot cell, the tag stripe, the HUD gun card rim and the ground beam all use it
//   drops   containers weigh pool entries by tier (loot/containers.ts qualityWeights, L01)
//   value   tier sets a gun's or armour piece's price band (TIER_VALUE)
import type { Rarity } from "../contracts";

export const TIER_KEYS: readonly Rarity[] = ["junk", "common", "fine", "uncommon", "rare", "epic", "legendary"];
export type TierDef = { key: Rarity; q: number; name: string; color: string; beam: boolean };
/** names: the island's money ladder (ours). Colours follow Duckov's per-quality roles (displayQuality: q1 white, q2 green,
 *  q3 blue, q4 purple, q5 orange, q6 red; q0 has no colour) in the Corner office palette (ui3.css --rar-*). Unlike
 *  Duckov's data, where most loot has no display quality, every item shows its tier (POLISH_FINDINGS 17, PROPOSED rule).
 *  beam = the ground item throws a light column (rare finds beam). The four pre-tier keys keep their quality (common 1,
 *  uncommon 3, rare 4, epic 5), so their colours move to Duckov's roles: uncommon green -> blue, rare blue -> purple,
 *  epic purple -> orange. */
export const TIERS: Record<Rarity, TierDef> = {
  junk: { key: "junk", q: 0, name: "Scrap", color: "#8a8172", beam: false },
  common: { key: "common", q: 1, name: "Petty", color: "#e6decd", beam: false },
  fine: { key: "fine", q: 2, name: "Standard", color: "#86d23c", beam: false },
  uncommon: { key: "uncommon", q: 3, name: "Premium", color: "#3db4ea", beam: false },
  rare: { key: "rare", q: 4, name: "Executive", color: "#a862f2", beam: true },
  epic: { key: "epic", q: 5, name: "Boardroom", color: "#ff8a3a", beam: true },
  legendary: { key: "legendary", q: 6, name: "Offshore", color: "#ff4b4b", beam: true },
};
export const tierOf = (r: Rarity | undefined): TierDef => TIERS[r ?? "common"] ?? TIERS.common;
export const tierQuality = (r: Rarity | undefined): number => tierOf(r).q;
export const tierColor = (r: Rarity | undefined): string => tierOf(r).color;
export const tierAtLeast = (r: Rarity | undefined, min: Rarity): boolean => tierQuality(r) >= TIERS[min].q;
export const isRarity = (v: unknown): v is Rarity => typeof v === "string" && Object.hasOwn(TIERS, v);
/** Duckov's per-quality search reveal (GameplayDataSettings looting.inspectingTimes), seconds, indexed by quality 0..6 */
export const TIER_REVEAL = [1, 1, 1, 1, 1.5, 2, 1] as const;
/** Duckov's commonest container quality table (q1..q6 weights 1200/100/20/8/3/1, LootBoxLoader; POLISH_FINDINGS 17).
 *  Ours flattens it (hand-weighted pools already carry the scarcity); a container scales each pool entry by its
 *  tier's weight here, then by its own qualityWeights. */
export const TIER_DROP: Record<Rarity, number> = { junk: 1, common: 1, fine: 1, uncommon: 1, rare: 1, epic: 1, legendary: 1 };
/** Duckov's map bonus: a draw from U[(1 - 1/Q) W, W] over the cumulative weights in tier order cuts the low end instead of
 *  multiplying rare weights (RandomContainer.cs:34). Q = 1 is no bonus. Returns the index picked. */
export function truncatedPick(weights: readonly number[], q: number, u: number): number {
  const total = weights.reduce((a, b) => a + b, 0), low = q > 1 ? (1 - 1 / q) * total : 0;
  let r = low + u * (total - low);
  for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r < 0) return i; }
  return weights.length - 1;
}
