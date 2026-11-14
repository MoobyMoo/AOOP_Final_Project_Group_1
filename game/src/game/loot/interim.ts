// INTERIM loot tables (lead) with the same signatures as Sol's loot/tables.ts; swapped out on merge.
import type { ItemDef, CrateTier, RaidLootCtx } from "../contracts";
export const ITEMS: Record<string, ItemDef> = {
  bunch: { id: "bunch", name: "Banana Bunch", icon: "🍌", rarity: "common", value: 4, kind: "sell" },
  coconut: { id: "coconut", name: "Coconut", icon: "🥥", rarity: "common", value: 3, kind: "sell" },
  rope: { id: "rope", name: "Vine Rope", icon: "🪢", rarity: "common", value: 3, kind: "sell" },
  plank: { id: "plank", name: "Plank", icon: "🪵", rarity: "common", value: 2, kind: "part" },
  golden: { id: "golden", name: "Golden Banana", icon: "🌟", rarity: "uncommon", value: 12, kind: "sell" },
  honey: { id: "honey", name: "Honey Pot", icon: "🍯", rarity: "uncommon", value: 9, kind: "sell" },
  gear: { id: "gear", name: "Old Gear", icon: "⚙️", rarity: "uncommon", value: 8, kind: "part" },
  spring: { id: "spring", name: "Spring", icon: "🌀", rarity: "uncommon", value: 7, kind: "part" },
  boomerang: { id: "boomerang", name: "Banana Boomerang", icon: "🪃", rarity: "uncommon", value: 10, kind: "sell" },
  mango: { id: "mango", name: "Sunset Mango", icon: "🥭", rarity: "rare", value: 20, kind: "sell" },
  compass: { id: "compass", name: "Brass Compass", icon: "🧭", rarity: "rare", value: 24, kind: "sell" },
  idol: { id: "idol", name: "Banana Idol", icon: "🗿", rarity: "epic", value: 55, kind: "sell" },
  smoothie: { id: "smoothie", name: "Banana Smoothie", icon: "🥤", rarity: "uncommon", value: 5, kind: "heal" },
  ammo: { id: "ammo", name: ".45 Rounds", icon: "🔸", rarity: "common", value: 2, kind: "ammo", stack: 8 },
  key: { id: "key", name: "Vine Key", icon: "🗝️", rarity: "rare", value: 0, kind: "key" },
  extmag: { id: "extmag", name: "Kingpin Extended Mag", icon: "📎", rarity: "epic", value: 0, kind: "attachment" },
};
const POOL: Record<string, string[]> = { common: ["bunch", "coconut", "rope", "plank"], uncommon: ["golden", "honey", "gear", "spring"], rare: ["mango", "compass"], epic: ["idol"] };
const W: Record<CrateTier, { n: [number, number]; w: number[]; empty: number; ammo: number }> = {
  wood: { n: [1, 2], w: [70, 26, 4, 0], empty: 0.12, ammo: 0.3 },
  green: { n: [2, 2], w: [32, 48, 18, 2], empty: 0.04, ammo: 0.35 },
  gold: { n: [2, 3], w: [0, 35, 48, 17], empty: 0, ammo: 0.3 },
};
const RAR = ["common", "uncommon", "rare", "epic"];
export function rollCrate(tier: CrateTier, ctx: RaidLootCtx, rng: () => number): string[] {
  const t = W[tier];
  if (ctx.emptyStreak === 0 && rng() < t.empty) return [];
  const n = t.n[0] + Math.floor(rng() * (t.n[1] - t.n[0] + 1)), out: string[] = [];
  for (let i = 0; i < n; i++) {
    if (rng() < 0.1) { out.push("smoothie"); continue; }
    let r = rng() * 100, k = 0; while (k < 3 && r >= t.w[k]) { r -= t.w[k]; k++; }
    const pool = POOL[RAR[k]], boosted = pool.filter((p) => ctx.orderNeeds.includes(p));
    out.push(boosted.length && rng() < 0.35 ? boosted[0] : pool[Math.floor(rng() * pool.length)]);
  }
  if (rng() < t.ammo) out.push("ammo");
  if (ctx.cratesOpened >= 3 && ctx.usefulFound === 0 && !out.some((i) => ITEMS[i].value >= 8)) out.push("golden");
  return out;
}
export function rollEnemyDrop(kind: string, _ctx: RaidLootCtx, rng: () => number): string[] {
  if (kind === "wild") return rng() < 0.35 ? ["ammo"] : rng() < 0.5 ? ["bunch"] : [];
  if (kind === "bandit") return [rng() < 0.5 ? "ammo" : "coconut", ...(rng() < 0.3 ? ["golden"] : [])];
  if (kind === "brute") return ["ammo", rng() < 0.5 ? "honey" : "gear", "bunch"];
  return ["idol", "mango", "compass", "ammo"];
}
export const WEAR_DROPS = ["tophat", "aviators", "pith", "eyepatch", "fedora", "goggles", "heartglasses", "crown"];
