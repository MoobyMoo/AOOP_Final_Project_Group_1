// R1 loot: our own items, values and crate tables (tuned by playtest, not taken from any game).
// Crates roll in layers (how many, which tier), but every crate holds at least one item.
export type Rarity = "common" | "uncommon" | "rare" | "epic";
export type ItemKind = "sell" | "heal" | "key" | "hat";
export type ItemDef = { id: string; name: string; icon: string; rarity: Rarity; value: number; kind: ItemKind; perk?: string };
export const RARITY_COLOR: Record<Rarity, string> = { common: "#efe6cf", uncommon: "#6ad16a", rare: "#4aa8ff", epic: "#c77dff" };

export const ITEMS: Record<string, ItemDef> = {
  bunch: { id: "bunch", name: "Banana Bunch", icon: "🍌", rarity: "common", value: 4, kind: "sell" },
  coconut: { id: "coconut", name: "Coconut", icon: "🥥", rarity: "common", value: 3, kind: "sell" },
  rope: { id: "rope", name: "Vine Rope", icon: "🪢", rarity: "common", value: 3, kind: "sell" },
  golden: { id: "golden", name: "Golden Banana", icon: "🌟", rarity: "uncommon", value: 12, kind: "sell" },
  honey: { id: "honey", name: "Honey Pot", icon: "🍯", rarity: "uncommon", value: 9, kind: "sell" },
  gear: { id: "gear", name: "Old Gear", icon: "⚙️", rarity: "uncommon", value: 8, kind: "sell" },
  mango: { id: "mango", name: "Sunset Mango", icon: "🥭", rarity: "rare", value: 20, kind: "sell" },
  compass: { id: "compass", name: "Brass Compass", icon: "🧭", rarity: "rare", value: 24, kind: "sell" },
  idol: { id: "idol", name: "Banana Idol", icon: "🗿", rarity: "epic", value: 55, kind: "sell" },
  smoothie: { id: "smoothie", name: "Banana Smoothie", icon: "🥤", rarity: "uncommon", value: 5, kind: "heal" },
  key: { id: "key", name: "Vine Key", icon: "🗝️", rarity: "rare", value: 0, kind: "key" },
  explorer: { id: "explorer", name: "Explorer Hat", icon: "🤠", rarity: "rare", value: 15, kind: "hat", perk: "+1 heart" },
  bandana: { id: "bandana", name: "Bandit Bandana", icon: "🧣", rarity: "rare", value: 15, kind: "hat", perk: "+1 bonk power" },
  lucky: { id: "lucky", name: "Lucky Cap", icon: "🧢", rarity: "epic", value: 30, kind: "hat", perk: "better crates" },
};
const BY_RARITY: Record<Rarity, string[]> = {
  common: ["bunch", "coconut", "rope"], uncommon: ["golden", "honey", "gear"], rare: ["mango", "compass"], epic: ["idol"],
};
export type CrateTier = "wood" | "green" | "gold";
export const CRATE: Record<CrateTier, { count: [number, number]; weights: [number, number, number, number]; hat: number; search: number; color: string; band: string }> = {
  wood: { count: [1, 2], weights: [70, 25, 5, 0], hat: 0, search: 0.6, color: "#a8743f", band: "#7a5230" },
  green: { count: [2, 2], weights: [30, 50, 18, 2], hat: 0.08, search: 1.0, color: "#6f9a52", band: "#3f6a32" },
  gold: { count: [2, 3], weights: [0, 30, 50, 20], hat: 0.25, search: 1.5, color: "#e8b13a", band: "#a8741a" },
};
const RAR: Rarity[] = ["common", "uncommon", "rare", "epic"];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/** roll a crate: how many items, then a tier per item; lucky shifts weight one tier up */
export function rollCrate(tier: CrateTier, lucky = false, hatsOwned: Set<string> = new Set()): string[] {
  const t = CRATE[tier];
  const n = t.count[0] + Math.floor(Math.random() * (t.count[1] - t.count[0] + 1));
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    if (Math.random() < 0.12) { out.push("smoothie"); continue; }
    const w = [...t.weights];
    if (lucky) for (let k = 3; k > 0; k--) { const move = w[k - 1] * 0.25; w[k - 1] -= move; w[k] += move; }
    let r = Math.random() * w.reduce((a, b) => a + b, 0), k = 0;
    while (r > w[k]) { r -= w[k]; k++; }
    out.push(pick(BY_RARITY[RAR[Math.min(k, 3)]]));
  }
  if (Math.random() < t.hat) { const free = ["explorer", "bandana", "lucky"].filter((h) => !hatsOwned.has(h)); if (free.length) out[out.length - 1] = pick(free); }
  return out;
}
