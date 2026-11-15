/** Equipment stats and instance helpers are pure and safe in saves/simulations.
 * Runtime/UI API: loot/equipment-actions.ts exports equipFromPack(index), unequip(slot),
 * equipFromLocker(index), stash(index), sellEquip(index), repair(slot), repairAll(), heardEnemies(),
 * drainEquipmentEvents(). Raid swaps take EQUIP_TIME seconds; a hit or roll cancels without consuming loot.
 * Home actions require the bunker and persist immediately. Locker indices identify instances, not item ids.
 */
import type { EnemyStyle, EquipDef, Gear, WearSlot } from "../contracts";

/** TIERS (loot/tiers.ts; POLISH_FINDINGS 17): armour pieces are tiered by armour against Duckov's per-quality medians
 *  (BALANCE_RANGES "Armor and gear", by quality: body 1.05 / 2 / 2.25 / 3.9 / 5.05 at q1..q5, head 0.9 / 0.5 / 1.5 / 4.3
 *  / 5.05). Ours run 0..4 where Duckov's run to about 6, so ours x 1.5 is compared and the nearest quality wins: body 1
 *  fine, 1.5-2 uncommon, 3 rare, 4 epic; head 0.2-0.5 common/fine, 1-1.5 uncommon, 2-3 rare. Pieces with no armour
 *  are tiered by what their perk is worth (the crown is a trophy: epic). Values are unchanged by the re-tier. */
export const EQUIP: Record<string, EquipDef> = {
  suit: { id: "suit", slot: "body", name: "Businessman's Suit", rarity: "common", value: 0, weight: 0, bodyArmor: 0, bound: true },
  bowler: { id: "bowler", slot: "head", name: "Bowler Hat", rarity: "common", value: 0, weight: 0, headArmor: 0, bound: true },
  shades: { id: "shades", slot: "face", name: "Shades", rarity: "common", value: 0, weight: 0, headArmor: 0.2, dur: 100, perk: { crit: 0.03 }, bound: true },
  satchel: { id: "satchel", slot: "back", name: "Satchel", rarity: "common", value: 0, weight: 0, packSlots: 0, bound: true },
  cap: { id: "cap", slot: "head", name: "Cap", rarity: "common", value: 15, weight: 0.2 },
  beanie: { id: "beanie", slot: "head", name: "Beanie", rarity: "common", value: 12, weight: 0.2 },
  fedora: { id: "fedora", slot: "head", name: "Fedora", rarity: "fine", value: 40, weight: 0.3, headArmor: 0.5, dur: 100, perk: { notice: 0.92 } },
  tophat: { id: "tophat", slot: "head", name: "Top Hat", rarity: "fine", value: 120, weight: 0.4, headArmor: 0.5, dur: 100 },
  pot_helmet: { id: "pot_helmet", slot: "head", name: "Cooking Pot", rarity: "uncommon", value: 25, weight: 0.9, headArmor: 1, dur: 100 },
  hardhat: { id: "hardhat", slot: "head", name: "Hard Hat", rarity: "uncommon", value: 60, weight: 0.6, headArmor: 1.5, dur: 100 },
  pith: { id: "pith", slot: "head", name: "Pith Helmet", rarity: "uncommon", value: 80, weight: 0.5, headArmor: 1.5, dur: 100 },
  coconut_helmet: { id: "coconut_helmet", slot: "head", name: "Coconut Helmet", rarity: "rare", value: 90, weight: 0.8, headArmor: 2, dur: 100 },
  guard_helmet: { id: "guard_helmet", slot: "head", name: "Foreman's Guard Helmet", rarity: "uncommon", value: 70, weight: 0.9, headArmor: 1.5, dur: 100 },
  guard_plate: { id: "guard_plate", slot: "body", name: "Foreman's Guard Plate", rarity: "uncommon", value: 120, weight: 3.2, bodyArmor: 2, dur: 100, perk: { speed: 0.97 } },
  warden_helmet: { id: "warden_helmet", slot: "head", name: "Warden's Riot Helmet", rarity: "rare", value: 260, weight: 1.2, headArmor: 3, dur: 100, perk: { speed: 0.97 } },
  crown: { id: "crown", slot: "head", name: "Crown", rarity: "epic", value: 400, weight: 0.8, headArmor: 1, dur: 100 },
  aviators: { id: "aviators", slot: "face", name: "Aviators", rarity: "fine", value: 70, weight: 0.2, perk: { aim: 2 } },
  monocle: { id: "monocle", slot: "face", name: "Monocle", rarity: "uncommon", value: 90, weight: 0.1, perk: { search: 0.75 } },
  eyepatch: { id: "eyepatch", slot: "face", name: "Eyepatch", rarity: "fine", value: 45, weight: 0.1, perk: { critDmg: 0.15 } },
  goggles: { id: "goggles", slot: "face", name: "Ski Goggles", rarity: "common", value: 40, weight: 0.3, headArmor: 0.3, dur: 100 },
  heartglasses: { id: "heartglasses", slot: "face", name: "Heart Glasses", rarity: "uncommon", value: 110, weight: 0.2, perk: { heal: 1.2 } },
  banditmask: { id: "banditmask", slot: "face", name: "Bandit Mask", rarity: "fine", value: 50, weight: 0.2, headArmor: 0.2, dur: 100, perk: { notice: 0.8 } },
  snorkel: { id: "snorkel", slot: "face", name: "Snorkel Mask", rarity: "common", value: 35, weight: 0.4, headArmor: 0.5, dur: 100 },
  leaf_vest: { id: "leaf_vest", slot: "body", name: "Banana-Leaf Vest", rarity: "fine", value: 50, weight: 1.5, bodyArmor: 1, dur: 100, packSlots: 1 },
  life_jacket: { id: "life_jacket", slot: "body", name: "Ferry Life Jacket", rarity: "fine", value: 80, weight: 1.8, bodyArmor: 1, dur: 100, packSlots: 2 },
  peel_jacket: { id: "peel_jacket", slot: "body", name: "Peel Gang Padded Jacket", rarity: "uncommon", value: 110, weight: 2.2, bodyArmor: 1.5, dur: 100, packSlots: 1 },
  bamboo_plate: { id: "bamboo_plate", slot: "body", name: "Bamboo Plate Vest", rarity: "uncommon", value: 140, weight: 3, bodyArmor: 2, dur: 100 },
  coconut_cuirass: { id: "coconut_cuirass", slot: "body", name: "Coconut Cuirass", rarity: "rare", value: 240, weight: 5, bodyArmor: 3, dur: 100, perk: { speed: 0.95 } },
  warden_vest: { id: "warden_vest", slot: "body", name: "Warden's Kevlar", rarity: "epic", value: 520, weight: 4.5, bodyArmor: 4, dur: 100 },
  sack: { id: "sack", slot: "back", name: "Loot Sack", rarity: "common", value: 20, weight: 0.8, packSlots: 1, maxWeight: 4 },
  bigpack: { id: "bigpack", slot: "back", name: "Big Backpack", rarity: "fine", value: 90, weight: 1.2, packSlots: 2, maxWeight: 8 },
  cratepack: { id: "cratepack", slot: "back", name: "Banana Crate Pack", rarity: "rare", value: 200, weight: 2, packSlots: 4, maxWeight: 15, perk: { speed: 0.97 } },
  walkman: { id: "walkman", slot: "ears", name: "Walkman Headphones", rarity: "uncommon", value: 150, weight: 0.3, perk: { hearing: 18 } },
  radio_headset: { id: "radio_headset", slot: "ears", name: "Radio Headset", rarity: "rare", value: 380, weight: 0.4, perk: { hearing: 28 } },
};
export const SLOTS: readonly WearSlot[] = ["head", "face", "body", "back", "ears"];
export const BOUND_KIT: Gear = { head: "bowler", face: "shades", body: "suit", back: "satchel", ears: null };
export const EQUIP_TIME = 1;
export const EQUIP_MOVE = 0.55;
export const ENEMY_CRIT = { chance: 0.12, damage: 1.5 };
export type EquipInstance = { id: string; dur: number; uid?: string };
export function parseInst(inst: string): EquipInstance | null {
  if (typeof inst !== "string") return null;
  const match = /^([a-z][a-z0-9_]*)(?:#(-?\d+(?:\.\d+)?))?(?:@([a-zA-Z0-9_-]+))?$/.exec(inst);
  if (!match || !Object.hasOwn(EQUIP, match[1])) return null;
  const dur = match[2] === undefined ? 100 : Number(match[2]);
  return Number.isFinite(dur) ? { id: match[1], dur: Math.round(Math.max(0, Math.min(100, dur))), ...(match[3] ? { uid: match[3] } : {}) } : null;
}
export function fmtInst(id: string, dur = 100): string {
  const parsed = parseInst(id);
  if (!parsed || !Number.isFinite(dur)) throw new Error("Invalid equipment instance");
  const condition = Math.round(Math.max(0, Math.min(100, dur)));
  return (condition === 100 ? parsed.id : `${parsed.id}#${condition}`) + (parsed.uid ? `@${parsed.uid}` : "");
}
export const isEquip = (inst: string): boolean => parseInst(inst) !== null;
export const equipDef = (inst: string | null | undefined): EquipDef | undefined => {
  const parsed = inst ? parseInst(inst) : null;
  return parsed ? EQUIP[parsed.id] : undefined;
};
export function gearStats(gear: Gear) {
  const stats = { headArmor: 0, bodyArmor: 0, packSlots: 0, maxWeight: 0, crit: 0, critDmg: 1.5, aim: 0, notice: 1, search: 1, heal: 1, hearing: 0, speed: 1 };
  for (const slot of SLOTS) {
    const parsed = gear[slot] ? parseInst(gear[slot]!) : null;
    if (!parsed) continue;
    const def = EQUIP[parsed.id];
    if (def.slot !== slot) continue;
    if (parsed.dur > 0) { stats.headArmor += def.headArmor ?? 0; stats.bodyArmor += def.bodyArmor ?? 0; }
    stats.packSlots += def.packSlots ?? 0; stats.maxWeight += def.maxWeight ?? 0;
    for (const key of ["crit", "critDmg", "aim"] as const) stats[key] += def.perk?.[key] ?? 0;
    for (const key of ["notice", "search", "heal", "speed"] as const) stats[key] *= def.perk?.[key] ?? 1;
    stats.hearing = Math.max(stats.hearing, def.perk?.hearing ?? 0);
  }
  return stats;
}
export function wear(inst: string, hit: number): string {
  const parsed = parseInst(inst);
  if (!parsed || !EQUIP[parsed.id].dur || !Number.isFinite(hit) || hit <= 0) return inst;
  return fmtInst(inst, parsed.dur - Math.max(1, Math.ceil(hit * 0.5)));
}
export function repairCost(inst: string): number {
  const parsed = parseInst(inst);
  if (!parsed || !EQUIP[parsed.id].dur || parsed.dur === 100) return 0;
  return Math.ceil((100 - parsed.dur) / 100 * Math.max(10, EQUIP[parsed.id].value * 0.4));
}
export function saleValue(inst: string): number {
  const parsed = parseInst(inst);
  return parsed && !EQUIP[parsed.id].bound ? Math.floor(EQUIP[parsed.id].value * parsed.dur / 100) : 0;
}
export const visualGear = (gear: Gear): Gear => Object.fromEntries(SLOTS.map(slot => [slot, gear[slot] ? parseInst(gear[slot]!)?.id ?? null : null])) as Gear;
function loadoutRoll(seed: number, salt: number) {
  let value = (seed ^ Math.imul(salt, 0x9e3779b9)) >>> 0;
  value = Math.imul(value ^ value >>> 16, 0x21f0aaad);
  value = Math.imul(value ^ value >>> 15, 0x735a2d97);
  return ((value ^ value >>> 15) >>> 0) / 4294967296;
}
export function enemyGear(seed: number, kind: EnemyStyle["kind"]): Gear {
  const gear: Gear = { head: null, face: null, body: null, back: null, ears: null };
  if (kind === "brute") gear.head = "coconut_helmet";
  if (kind === "bandit") {
    const helmet = loadoutRoll(seed, 1);
    gear.head = helmet < 0.12 ? "pot_helmet" : helmet < 0.20 ? "hardhat" : null;
    if (loadoutRoll(seed, 2) < 0.2) gear.face = "banditmask";
    if (loadoutRoll(seed, 3) < 0.16) gear.body = "peel_jacket";
    if (loadoutRoll(seed, 4) < 0.3) gear.back = "sack";
  }
  return gear;
}
