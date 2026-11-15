import type { RaidLootCtx } from '../contracts';
import { itemDef } from './tables';
import { attachmentPool, attachmentShare } from './attachments';

export type ContainerType = 'weapon' | 'food' | 'ammo' | 'parts' | 'medical' | 'lunchbox' | 'toolbox' | 'medcabinet' | 'safe' | 'trash' | 'sack' | 'jacket';
/** L01 (SYSTEMS_PORT): presenceChance = the separate per-raid presence roll; count = the attempts range; qualityWeights =
 *  a multiplier on each pool entry by its rarity (Duckov's quality layer, kept simple); searchFactor = scales the per-item
 *  reveal (trash is fast, a safe slow) on top of the open delay */
export type ContainerDef = { label: string; count: readonly [number, number]; openSeconds: number; pool: Record<string, number>; placements: readonly string[];
  presenceChance: number; qualityWeights?: Partial<Record<'common' | 'uncommon' | 'rare' | 'epic', number>>; searchFactor?: number };
export const CONTAINERS: Record<ContainerType, ContainerDef> = {
  // G1.5 row 36, Duckov's attachment sources (POLISH_FINDINGS "Attachments", loot): an attachment is about 30% of a
  // weapon crate's rolls (Duckov's better weapon crates 24-41%), 4.6% of a parts crate's (its tech box) and 2% of an
  // ammo tin's (1.5-2.1%); inside that share, rarity weights (attachments.ts). Enemies never drop them: Duckov's
  // carry them on their guns, ours carry no guns (G1.5 row 28: an enemy drops only what it uses).
  weapon: { label: 'Weapon crate', count: [1, 3], openSeconds: 0.6, pool: { boomerang: 3, spring: 2, ammo45: 3, ...attachmentPool(attachmentShare(0.3, 8)) }, placements: ['guard hut locked rack', 'plantation barn secured shelf'], presenceChance: 0.7 },
  food: { label: 'Food basket', count: [1, 4], openSeconds: 0.2, pool: { banana: 5, coconut: 4, honey_pot: 2, sunset_mango: 1 }, placements: ['beach picnic', 'ferry galley', 'palm edge harvest', 'camp kitchen', 'plantation farmhouse kitchen', 'cove picnic'], presenceChance: 0.75 },
  ammo: { label: 'Ammo tin', count: [2, 3], openSeconds: 0.2, pool: { ammo45: 1, ...attachmentPool(attachmentShare(0.02, 1)) }, placements: ['ferry guard locker', 'guard hut post', 'camp watch post', 'plantation barn sentry'], presenceChance: 0.85 },
  parts: { label: 'Parts crate', count: [1, 4], openSeconds: 0.2, pool: { spring: 4, plank: 4, old_gear: 3, vine_rope: 3, brass_compass: 1, ...attachmentPool(attachmentShare(0.046, 15)) }, placements: ['ferry engine room', 'beach wreck repair', 'guard hut workbench', 'camp workshop', 'plantation barn', 'cove boat repair'], presenceChance: 0.75 },
  medical: { label: 'Medical box', count: [1, 3], openSeconds: 0.2, pool: { bandage: 6, smoothie: 3, firstaid: 1 }, placements: ['ferry first aid', 'guard hut rest spot', 'camp treatment tent', 'plantation farmhouse bedside'], presenceChance: 0.7 },
  // the small, frequent, low-value ones (Duckov's trash cans, toolboxes, lockers, cabinets): G1.5 population pass. A safe is
  // rare, slow and the only one that leans to valuables; trash is quick and mostly junk; pockets are a little of anything
  lunchbox: { label: 'Lunchbox', count: [1, 2], openSeconds: 0.2, pool: { banana: 5, coconut: 3, honey_pot: 1, meat: 1 }, placements: ['kitchens', 'benches', 'the lookout fire'], presenceChance: 0.7, searchFactor: 0.8 },
  toolbox: { label: 'Toolbox', count: [1, 2], openSeconds: 0.2, pool: { spring: 4, scrap_tin: 3, plank: 2, old_gear: 2, vine_rope: 2 }, placements: ['sheds', 'workbenches', 'the boardwalk hub'], presenceChance: 0.7, searchFactor: 0.8 },
  medcabinet: { label: 'Medicine cabinet', count: [1, 2], openSeconds: 0.3, pool: { bandage: 6, smoothie: 2, firstaid: 0.5 }, placements: ['walls and shelves by beds'], presenceChance: 0.65 },
  safe: { label: 'Safe', count: [1, 2], openSeconds: 1.2, pool: { banana_notes: 6, brass_compass: 3, sunset_mango: 2, golden_banana: 1 }, placements: ['the plantation office', 'the gang boss tent', 'the smugglers\' hall'], presenceChance: 0.5, qualityWeights: { common: 0.5, uncommon: 1, rare: 1, epic: 1 }, searchFactor: 1.5 },
  trash: { label: 'Junk heap', count: [1, 3], openSeconds: 0.1, pool: { scrap_tin: 7, banana: 2, spring: 2, plank: 2, vine_rope: 1, ammo45: 0.6 }, placements: ['camps', 'yards', 'the beach'], presenceChance: 0.85, qualityWeights: { rare: 0.5, epic: 0 }, searchFactor: 0.6 },
  sack: { label: 'Supply sack', count: [1, 3], openSeconds: 0.2, pool: { banana: 4, coconut: 3, plank: 3, vine_rope: 3, honey_pot: 1 }, placements: ['camps', 'cart loads', 'the cove'], presenceChance: 0.75 },
  jacket: { label: 'Hanging jacket', count: [1, 2], openSeconds: 0.2, pool: { banana_notes: 2, ammo45: 2, bandage: 2, banana: 2, vine_rope: 1, brass_compass: 0.3 }, placements: ['washing lines', 'bunks', 'benches'], presenceChance: 0.7, searchFactor: 0.8 },
};
export const QUALITY_SEARCH_SECONDS = [1, 1, 1, 1, 1.5, 2, 1] as const;
export function searchSeconds(quality: number): number {
  return QUALITY_SEARCH_SECONDS[Number.isFinite(quality) ? Math.max(0, Math.min(6, Math.trunc(quality))) : 0];
}
export function itemQuality(inst: string): number {
  return { common: 1, uncommon: 3, rare: 4, epic: 5 }[itemDef(inst).rarity];
}
export function rollContainer(type: ContainerType, rng: () => number, context?: RaidLootCtx): string[] {
  const definition = CONTAINERS[type];
  const count = definition.count[0] + Math.floor(rng() * (definition.count[1] - definition.count[0] + 1));
  const entries = Object.entries(definition.pool).map(([id, weight]) => [id, weight * (definition.qualityWeights?.[itemDef(id).rarity] ?? 1)] as [string, number]).filter(([, weight]) => weight > 0).sort(([left], [right]) => left.localeCompare(right));
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  const items = Array.from({ length: count }, () => {
    let remaining = rng() * total;
    for (const [id, weight] of entries) { remaining -= weight; if (remaining < 0) return id; }
    return entries[entries.length - 1][0];
  });
  if (context) {
    context.cratesOpened++;
    context.emptyStreak = 0;
    for (const inst of items) {
      const item = itemDef(inst);
      if (item.kind === 'ammo') context.ammoFound += item.stack ?? 1;
      if (item.kind !== 'sell' || item.value >= 39 || context.orderNeeds.includes(inst)) context.usefulFound++;
    }
  }
  return items;
}
export function demoContainerType(socket: { x: number; z: number; in?: string }): ContainerType {
  if (socket.in === 'barn') return 'parts';
  if (socket.in === 'farmhouse') return 'food';
  if (socket.in === 'ferry') return 'medical';
  if (socket.x < -45 && socket.z < 40) return socket.z < 25 ? 'medical' : 'food';
  if (socket.z > 80 || socket.x < -30 && socket.z > 40) return 'food';
  if (socket.z > 40) return 'ammo';
  return 'parts';
}
export const DEMO_CONTAINER_BUDGET: Partial<Record<ContainerType, number>> = { food: 8, ammo: 6, parts: 8, medical: 4, weapon: 2 };
