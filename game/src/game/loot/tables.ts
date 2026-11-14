import type { CrateTier, EnemyStyle, ItemDef, RaidLootCtx } from "../contracts";
import type { CrateSocket } from "../world/layout";
import { EQUIP, enemyGear, parseInst, saleValue } from "./equipment";

export type LootContext = RaidLootCtx & {
  fixed?: CrateSocket["fixed"] | "radio" | "radio_shack";
  ownsExtendedMag?: boolean;
  carried?: string[];
  enemySeed?: number;
};

export const ITEMS: Record<string, ItemDef> = {
  banana: { id: "banana", name: "Banana Bunch", icon: "🍌", rarity: "common", value: 9, kind: "sell", weight: 1.2 },
  coconut: { id: "coconut", name: "Coconut", icon: "🥥", rarity: "common", value: 12, kind: "sell", weight: 1.5 },
  vine_rope: { id: "vine_rope", name: "Vine Rope", icon: "🪢", rarity: "common", value: 16, kind: "sell", weight: 0.8 },
  golden_banana: { id: "golden_banana", name: "Golden Banana", icon: "🌟", rarity: "epic", value: 96, kind: "sell", weight: 0.6 },
  honey_pot: { id: "honey_pot", name: "Honey Pot", icon: "🍯", rarity: "uncommon", value: 27, kind: "sell", weight: 1.4 },
  old_gear: { id: "old_gear", name: "Old Gear", icon: "⚙️", rarity: "uncommon", value: 23, kind: "sell", weight: 1.8 },
  sunset_mango: { id: "sunset_mango", name: "Sunset Mango", icon: "🥭", rarity: "rare", value: 39, kind: "sell", weight: 0.6 },
  brass_compass: { id: "brass_compass", name: "Brass Compass", icon: "🧭", rarity: "rare", value: 53, kind: "sell", weight: 0.4 },
  banana_idol: { id: "banana_idol", name: "Banana Idol", icon: "🗿", rarity: "epic", value: 145, kind: "sell", weight: 3.0 },
  smoothie: { id: "smoothie", name: "Banana Smoothie", icon: "🧃", rarity: "uncommon", value: 18, kind: "heal", weight: 0.5 },
  bandage: { id: "bandage", name: "Banana-Leaf Bandage", icon: "🩹", rarity: "common", value: 6, kind: "heal", weight: 0.2 },
  firstaid: { id: "firstaid", name: "Jungle First-Aid Kit", icon: "🧰", rarity: "rare", value: 30, kind: "heal", weight: 0.9 },
  boomerang: { id: "boomerang", name: "Banana Boomerang", icon: "🪃", rarity: "uncommon", value: 20, kind: "sell", weight: 0.7 },
  ammo45: { id: "ammo45", name: ".45 Rounds", icon: "🔸", rarity: "common", value: 0, kind: "ammo", weight: 0, stack: 8 },
  vine_key: { id: "vine_key", name: "Vine Key", icon: "🗝️", rarity: "rare", value: 0, kind: "key", weight: 0.1 },
  extended_mag: { id: "extended_mag", name: "Kingpin Extended Mag", icon: "📎", rarity: "epic", value: 0, kind: "attachment", weight: 0.2 },
  spring: { id: "spring", name: "Spring", icon: "🌀", rarity: "common", value: 11, kind: "part", weight: 0.5 },
  plank: { id: "plank", name: "Plank", icon: "🪵", rarity: "common", value: 8, kind: "part", weight: 2.0 },
  ...Object.fromEntries(Object.values(EQUIP).map(def => [def.id, { id: def.id, name: def.name, icon: { head: "🎩", face: "🕶️", body: "🦺", back: "🎒", ears: "🎧" }[def.slot], rarity: def.rarity, value: def.value, weight: def.weight, kind: "wear" as const }])),
};
export function itemDef(inst: string): ItemDef {
  const parsed = parseInst(inst);
  if (parsed) return { ...ITEMS[parsed.id], id: inst, value: saleValue(inst) };
  return Object.hasOwn(ITEMS, inst) ? ITEMS[inst] : { id: inst, name: inst, icon: "❔", rarity: "common", value: 0, kind: "sell", weight: 0 };
}
export const EQUIPMENT_CHANCE: Record<CrateTier, number> = { wood: 0.02, green: 0.10, gold: 0.28 };

export const PRICES = {
  upgrades: { mag: [240], pack: [720], heart: [1050] },
  ammo8: 24,
  smoothie: 36,
  bandage: 12,
};

type CrateTable = { empty: number; extra: number; items: Record<string, number> };
export const CRATE_TABLES: Record<CrateTier, CrateTable> = {
  wood: {
    empty: 0.12, extra: 0.25,
    items: { banana: 0.20, coconut: 0.17, vine_rope: 0.14, plank: 0.11, spring: 0.08, old_gear: 0.05, honey_pot: 0.03, smoothie: 0.02, bandage: 0.05, ammo45: 0.15 },
  },
  green: {
    empty: 0.04, extra: 0.55,
    items: { banana: 0.04, coconut: 0.07, vine_rope: 0.10, spring: 0.08, old_gear: 0.14, honey_pot: 0.15, sunset_mango: 0.12, brass_compass: 0.07, smoothie: 0.04, bandage: 0.04, firstaid: 0.01, ammo45: 0.12, golden_banana: 0.02 },
  },
  gold: {
    empty: 0, extra: 1,
    items: { old_gear: 0.05, honey_pot: 0.08, sunset_mango: 0.22, brass_compass: 0.29, golden_banana: 0.20, banana_idol: 0.04, smoothie: 0.04, firstaid: 0.03, ammo45: 0.05 },
  },
};
const SLEEPER_POOL = { sunset_mango: 0.10, brass_compass: 0.17, golden_banana: 0.42, banana_idol: 0.28, smoothie: 0.03 };

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ state >>> 15, state | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

export function isUseful(id: string, ctx: RaidLootCtx): boolean {
  const item = itemDef(id);
  return Boolean(item && (item.kind !== "sell" || item.value >= 39 || ctx.orderNeeds.includes(id)));
}

function draw(pool: Record<string, number>, ctx: RaidLootCtx, rng: () => number): string {
  const entries = Object.entries(pool).sort(([left], [right]) => left.localeCompare(right));
  const weight = (id: string, probability: number) => probability * (ctx.orderNeeds.includes(id) ? 1.2 : 1);
  let remaining = rng() * entries.reduce((sum, [id, probability]) => sum + weight(id, probability), 0);
  for (const [id, probability] of entries) {
    remaining -= weight(id, probability);
    if (remaining < 0) return id;
  }
  return entries[entries.length - 1][0];
}

function randomContents(tier: CrateTier, ctx: RaidLootCtx, rng: () => number, epic = false, equipment = true): string[] {
  const table = CRATE_TABLES[tier];
  if (rng() < table.empty && ctx.emptyStreak === 0) return [];
  const pool = epic ? SLEEPER_POOL : table.items;
  const found = [draw(pool, ctx, rng)];
  if (rng() < table.extra) found.push(draw(pool, ctx, rng));
  if (equipment && rng() < EQUIPMENT_CHANCE[tier]) {
    const equipment = Object.fromEntries(Object.values(EQUIP).filter(def => !def.bound && (tier === "wood" ? def.rarity === "common" : tier === "green" ? ["common", "uncommon"].includes(def.rarity) : true)).map(def => [def.id, { common: 6, uncommon: 3, rare: 1, epic: 0.2 }[def.rarity]]));
    const id = draw(equipment, ctx, rng);
    found[0] = EQUIP[id].dur ? `${id}#${65 + Math.floor(rng() * 36)}` : id;
  }
  return found;
}

function record(found: string[], ctx: LootContext): string[] {
  return found.map(id => {
    if (id === "ammo45") {
      if (ctx.ammoFound >= 16) id = "banana";
      else ctx.ammoFound += ITEMS.ammo45.stack!;
    }
    if (isUseful(id, ctx)) ctx.usefulFound++;
    return id;
  });
}

export function rollCrate(tier: CrateTier, ctx: LootContext, rng: () => number): string[] {
  const special = ctx.fixed === "key" || ctx.fixed === "vault" || ctx.fixed === "sleeper";
  const found = randomContents(special ? "gold" : tier, ctx, rng, ctx.fixed === "sleeper");
  if (ctx.fixed === "key") found.unshift("vine_key");
  if (ctx.fixed === "vault") found.unshift(rng() < 0.5 ? "warden_vest" : "warden_helmet");
  if (ctx.fixed === "radio" || ctx.fixed === "radio_shack") found.unshift("radio_headset");
  if (ctx.fixed === "vault" && !ctx.ownsExtendedMag) {
    found.unshift("extended_mag");
    ctx.ownsExtendedMag = true;
  }
  if (ctx.cratesOpened >= 1 && ctx.usefulFound === 0 && !found.some(id => isUseful(id, ctx))) found.push("smoothie");
  if (ctx.cratesOpened >= 4 && ctx.ammoFound < 8 && !found.includes("ammo45")) found.push("ammo45");
  const result = record(found, ctx);
  ctx.cratesOpened++;
  ctx.emptyStreak = result.length ? 0 : ctx.emptyStreak + 1;
  return result;
}

export function rollEnemyDrop(kind: EnemyStyle["kind"], ctx: LootContext, rng: () => number): string[] {
  let found: string[];
  switch (kind) {
    case "wild":
      found = rng() < 0.35 ? ["banana"] : [];
      if (rng() < 0.16) found.push("ammo45");
      break;
    case "bandit":
      found = ctx.carried ? ctx.carried.filter(id => ITEMS[id]?.kind === "sell") : [draw({ banana: 0.25, coconut: 0.20, vine_rope: 0.30, old_gear: 0.25 }, ctx, rng)];
      if (rng() < 0.18) found.push("ammo45");
      break;
    case "brute":
      found = randomContents("green", ctx, rng, false, false);
      break;
    case "sleeper":
      found = ["banana_idol", ...randomContents("gold", ctx, rng, false, false)];
      break;
  }
  found.push(...Object.values(enemyGear(ctx.enemySeed ?? 0, kind)).filter((inst): inst is string => inst !== null));
  return record(found, ctx);
}
