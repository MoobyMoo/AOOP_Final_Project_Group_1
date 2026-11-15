import type { CrateTier, EnemyStyle, ItemDef, RaidLootCtx } from "../contracts";
import type { CrateSocket } from "../world/layout";
import { EQUIP, enemyGear, parseInst, saleValue } from "./equipment";
import { rollContainer, type ContainerType } from './containers';
import { ATTACHMENT_ITEMS } from "./attachments";
import { CALIBERS, GUNS, type GunClass } from "../combat/guns";
import { tierQuality } from "./tiers";

const GUN_ICON: Record<GunClass, string> = { pistol: "🔫", smg: "🔫", rifle: "🔫", shotgun: "🔫", sniper: "🔭", lmg: "🔫" };
/** guns as items (combat/guns.ts): kind "gun", tier, value, kg. "kingpin" is the bound Kingpin's instance type */
export const GUN_ITEMS: Record<string, ItemDef> = Object.fromEntries([
  ...Object.values(GUNS).map(g => [g.id, { id: g.id, name: g.name, icon: GUN_ICON[g.cls], rarity: g.tier, value: g.value, kind: "gun" as const, weight: g.weight }]),
  ["kingpin", { id: "kingpin", name: GUNS.kingpin45.name, icon: "🔫", rarity: GUNS.kingpin45.tier, value: 0, kind: "gun" as const, weight: GUNS.kingpin45.weight }],
]);
import { STORY_ITEMS } from "./storyitems";
import { LOCKBOX_ITEMS } from "./lockbox-items";

export type LootContext = RaidLootCtx & {
  fixed?: CrateSocket["fixed"] | "radio" | "radio_shack";
  ownsExtendedMag?: boolean;
  carried?: string[];
  enemySeed?: number;
  containerType?: ContainerType;
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
  // ammunition, one type per caliber (combat/guns.ts CALIBERS; Duckov matches caliber strings on reload)
  ...Object.fromEntries(Object.entries(CALIBERS).map(([id, c]) => [id, { id, name: c.name, icon: c.icon, rarity: "common" as const, value: 0, kind: "ammo" as const, weight: 0, stack: c.stack }])),
  vine_key: { id: "vine_key", name: "Vine Key", icon: "🗝️", rarity: "rare", value: 0, kind: "key", weight: 0.1 },
  radio_key: { id: "radio_key", name: "Radio Shack Key", icon: "🗝️", rarity: "rare", value: 0, kind: "key", weight: 0.1 },
  spring: { id: "spring", name: "Spring", icon: "🌀", rarity: "common", value: 11, kind: "part", weight: 0.5 },
  plantation_seal: { id: 'plantation_seal', name: 'Plantation Workshop Seal', icon: '🔩', rarity: 'rare', value: 0, kind: 'key', weight: 0.2 },
  // G1.5 population pass: animal drops and the small containers' junk and cash
  meat: { id: "meat", name: "Boar Meat", icon: "🍖", rarity: "common", value: 14, kind: "sell", weight: 1.0 },
  hide: { id: "hide", name: "Animal Hide", icon: "🟫", rarity: "uncommon", value: 22, kind: "part", weight: 1.2 },
  scrap_tin: { id: "scrap_tin", name: "Scrap Tin", icon: "🥫", rarity: "common", value: 4, kind: "part", weight: 0.3 },
  banana_notes: { id: "banana_notes", name: "Banana Notes", icon: "💵", rarity: "uncommon", value: 25, kind: "sell", weight: 0.1 },
  plank: { id: "plank", name: "Plank", icon: "🪵", rarity: "common", value: 8, kind: "part", weight: 2.0 },
  // Progression v0.2 (the vault is a factory): the coupon press's inputs turn up in office and camp containers; the
  // ripening room and the scrap press make the other two (home/factory.ts). Values feed npm run sim's factory gate.
  paper: { id: "paper", name: "Office Paper", icon: "📄", rarity: "common", value: 3, kind: "part", weight: 0.2 },
  ink: { id: "ink", name: "Ink Cartridge", icon: "🖋️", rarity: "fine", value: 8, kind: "part", weight: 0.3 },
  premium_bunch: { id: "premium_bunch", name: "Premium Bunch", icon: "🍌", rarity: "fine", value: 26, kind: "sell", weight: 1.0 },
  machine_parts: { id: "machine_parts", name: "Machined Parts", icon: "🔧", rarity: "uncommon", value: 40, kind: "part", weight: 0.8 },
  // sealed lockboxes (loot/lockbox.ts): raid-only finds, never sold; the Fence opens them for a fee
  ...LOCKBOX_ITEMS,
  ...STORY_ITEMS, // lore notes, quest items, the Keeper carving (loot/storyitems.ts)
  ...ATTACHMENT_ITEMS, // gun attachments (loot/attachments.ts; att_mag_ext is the old extended_mag)
  ...GUN_ITEMS,
  oar: { id: "oar", name: "Cove boat oar", icon: "🪵", rarity: "common", value: 8, kind: "part", weight: 1.5 },
  ...Object.fromEntries(Object.values(EQUIP).map(def => [def.id, { id: def.id, name: def.name, icon: { head: "🎩", face: "🕶️", body: "🦺", back: "🎒", ears: "🎧" }[def.slot], rarity: def.rarity, value: def.value, weight: def.weight, kind: "wear" as const }])),
};
import { itemType, stackCount } from "./instances";
export function itemDef(inst: string): ItemDef {
  const parsed = parseInst(inst);
  if (parsed) return { ...ITEMS[parsed.id], id: inst, value: saleValue(inst) };
  const definition = ITEMS[itemType(inst)];
  if (!Object.hasOwn(ITEMS, itemType(inst))) return { id: inst, name: inst, icon: "❔", rarity: "common", value: 0, kind: "sell", weight: 0 };
  return definition.kind === "ammo" ? { ...definition, stack: stackCount(inst, definition.stack ?? 8), weight: stackCount(inst, definition.stack ?? 8) * 0.02 } : definition;
}
export const EQUIPMENT_CHANCE: Record<CrateTier, number> = { wood: 0.02, green: 0.10, gold: 0.28 };

export const PRICES = {
  upgrades: { mag: [160], pack: [260], heart: [340] },
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

export function isUseful(id: string, ctx: Pick<RaidLootCtx, 'orderNeeds'>): boolean {
  const item = itemDef(id);
  return Boolean(item && (item.kind !== "sell" || item.value >= 39 || ctx.orderNeeds.includes(itemType(id))));
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
    // by tier quality (loot/tiers.ts): wood crates hold up to q2, green up to q3, gold anything; better tiers rarer
    const cap = tier === "wood" ? 2 : tier === "green" ? 3 : 6;
    const equipment = Object.fromEntries(Object.values(EQUIP).filter(def => !def.bound && tierQuality(def.rarity) <= cap).map(def => [def.id, [6, 6, 4.5, 3, 1, 0.2, 0.1][tierQuality(def.rarity)]]));
    const id = draw(equipment, ctx, rng);
    found[0] = EQUIP[id].dur ? `${id}#${65 + Math.floor(rng() * 36)}` : id;
  }
  return found;
}

function record(found: string[], ctx: LootContext): string[] {
  return found.map(id => {
    if (id === "ammo45") {
      ctx.ammoFound += ITEMS.ammo45.stack!;
    }
    if (isUseful(id, ctx)) ctx.usefulFound++;
    return id;
  });
}

export function rollCrate(tier: CrateTier, ctx: LootContext, rng: () => number): string[] {
  if (ctx.containerType && !ctx.fixed) return rollContainer(ctx.containerType, rng, ctx);
  const special = ctx.fixed === "key" || ctx.fixed === "vault" || ctx.fixed === "sleeper";
  const found = randomContents(special ? "gold" : tier, ctx, rng, ctx.fixed === "sleeper");
  if (ctx.fixed === "key") found.unshift("vine_key");
  if (ctx.fixed === "vault") found.unshift(rng() < 0.5 ? "warden_vest" : "warden_helmet");
  if (ctx.fixed === "radio" || ctx.fixed === "radio_shack") found.unshift("radio_headset");
  if (ctx.fixed === "vault" && !ctx.ownsExtendedMag) {
    found.unshift("att_mag_ext");
    ctx.ownsExtendedMag = true;
  }
  if (ctx.usefulFound === 0 && !found.some(id => isUseful(id, ctx))) found.push("smoothie");
  if (ctx.ammoFound < Math.floor((ctx.cratesOpened + 1) / 3) * 8 && !found.includes("ammo45")) found.push("ammo45");
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
      if (rng() < 0.30) found.push("ammo45");
      break;
    case "bandit":
      found = ctx.carried ? ctx.carried.filter(id => itemDef(id).kind === "sell") : [draw({ banana: 0.25, coconut: 0.20, vine_rope: 0.30, old_gear: 0.25 }, ctx, rng)];
      if (rng() < 0.35) found.push("ammo45");
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
