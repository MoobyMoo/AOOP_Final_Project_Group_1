import type { RaidLootCtx, Rarity } from '../contracts';
import { tierQuality, truncatedPick, TIER_REVEAL } from './tiers';
import { isUseful, itemDef } from './tables';
import { attachmentPool, attachmentShare } from './attachments';

export type ContainerType = 'weapon' | 'food' | 'ammo' | 'parts' | 'medical' | 'lunchbox' | 'toolbox' | 'medcabinet' | 'safe' | 'trash' | 'sack' | 'jacket';
/** L01 (SYSTEMS_PORT): presenceChance = the separate per-raid presence roll; count = the attempts range; qualityWeights =
 *  a multiplier on each pool entry by its rarity (Duckov's quality layer, kept simple); searchFactor = scales the per-item
 *  reveal (trash is fast, a safe slow) on top of the open delay */
export type ContainerDef = { label: string; count: readonly [number, number]; openSeconds: number; pool: Record<string, number>; placements: readonly string[];
  minimumAmmo?: number; presenceChance: number; qualityWeights?: Partial<Record<Rarity, number>>; searchFactor?: number;
  /** Duckov's tag-mode draw (LootBoxLoader; POLISH_FINDINGS 17 "drop weights"): each attempt first rolls a quality from
   *  `weights` (q0..q6), with a map bonus Q truncating the low end (U[(1-1/Q)W, W]), then picks a pool entry of exactly
   *  that quality by its pool weight, falling one quality lower until something matches. Without it, the pool is one
   *  weighted draw (Duckov's pool mode). */
  qualities?: { weights: readonly number[]; bonus?: number } };
/** guns in the loot (combat/guns.ts): inside its quality, each gun weighs this much against the other entries; tier
 *  sets which quality roll it answers to. The bound Kingpin is never loot. Tuned so a weapon crate gives a gun about
 *  one time in five (loot/sim.ts prints the rate), mostly low tier; a top-tier gun is about one crate in 250. */
const GUN_POOL = { pocket_change: 0.25, pipe_dream: 0.25, peel_sprayer: 0.25, bootleg_rifle: 0.25, cash_flow: 0.5, coconut_cracker: 0.5,
  golden_parachute: 0.5, contraband_carbine: 0.5, bean_counter: 0.5, insider_trader: 0.5, board_meeting: 0.5, the_audit: 0.5, long_ledger: 0.5, hostile_takeover: 1 };
export const CONTAINERS: Record<ContainerType, ContainerDef> = {
  // G1.5 row 36, Duckov's attachment sources (POLISH_FINDINGS "Attachments", loot): an attachment is about 30% of a
  // weapon crate's rolls (Duckov's better weapon crates 24-41%), 4.6% of a parts crate's (its tech box) and 2% of an
  // ammo tin's (1.5-2.1%); inside that share, rarity weights (attachments.ts). Enemies never drop them: Duckov's
  // carry them on their guns, ours carry no guns (G1.5 row 28: an enemy drops only what it uses).
  // the weapon crate is where guns live (Duckov's weapon crates): Duckov's second-commonest quality table 350/135/35/8/2/1
  // (q1..q6), so a q1 roll is mostly springs and rounds, a q2 roll mostly fine parts and the two low guns, and a top gun
  // is a 0.2% roll per attempt
  weapon: { label: 'Weapon crate', count: [1, 3], openSeconds: 0.6, pool: { lockbox_uncommon: 1, boomerang: 3, spring: 2, ammo45: 3, ammo_rifle: 2, ammo_shell: 1.5, ammo_sniper: 1, ...attachmentPool(attachmentShare(0.3, 8)), ...GUN_POOL }, placements: ['guard hut locked rack', 'plantation barn secured shelf'], presenceChance: 0.7,
    qualities: { weights: [0, 350, 135, 35, 8, 2, 1] } },
  food: { label: 'Food basket', count: [1, 4], openSeconds: 0.2, pool: { banana: 5, coconut: 4, honey_pot: 2, sunset_mango: 1 }, placements: ['beach picnic', 'ferry galley', 'palm edge harvest', 'camp kitchen', 'plantation farmhouse kitchen', 'cove picnic'], presenceChance: 0.75 },
  ammo: { label: 'Ammo tin', minimumAmmo: 40, count: [6, 7], openSeconds: 0.2, pool: { ammo45: 1, ammo_rifle: 0.3, ammo_shell: 0.2, ammo_sniper: 0.12, ...attachmentPool(attachmentShare(0.02, 1.62)) }, placements: ['ferry guard locker', 'guard hut post', 'camp watch post', 'plantation barn sentry'], presenceChance: 0.85 },
  parts: { label: 'Parts crate', count: [1, 4], openSeconds: 0.2, pool: { spring: 4, plank: 4, old_gear: 3, vine_rope: 3, brass_compass: 1, ...attachmentPool(attachmentShare(0.046, 15)) }, placements: ['ferry engine room', 'beach wreck repair', 'guard hut workbench', 'camp workshop', 'plantation barn', 'cove boat repair'], presenceChance: 0.75 },
  medical: { label: 'Medical box', count: [1, 3], openSeconds: 0.2, pool: { bandage: 6, smoothie: 3, firstaid: 1 }, placements: ['ferry first aid', 'guard hut rest spot', 'camp treatment tent', 'plantation farmhouse bedside'], presenceChance: 0.7 },
  // the small, frequent, low-value ones (Duckov's trash cans, toolboxes, lockers, cabinets): G1.5 population pass. A safe is
  // rare, slow and the only one that leans to valuables; trash is quick and mostly junk; pockets are a little of anything
  lunchbox: { label: 'Lunchbox', count: [1, 2], openSeconds: 0.2, pool: { banana: 4, coconut: 3, honey_pot: 1.5, meat: 2, sunset_mango: 0.5 }, placements: ['kitchens', 'benches', 'the lookout fire'], presenceChance: 0.7, searchFactor: 0.8 },
  toolbox: { label: 'Toolbox', count: [1, 2], openSeconds: 0.2, pool: { ink: 0.6, spring: 4, scrap_tin: 3, plank: 2, old_gear: 2, vine_rope: 2 }, placements: ['sheds', 'workbenches', 'the boardwalk hub'], presenceChance: 0.7, searchFactor: 0.8 },
  medcabinet: { label: 'Medicine cabinet', count: [1, 2], openSeconds: 0.3, pool: { bandage: 6, smoothie: 2, firstaid: 0.5 }, placements: ['walls and shelves by beds'], presenceChance: 0.65 },
  safe: { label: 'Safe', count: [1, 2], openSeconds: 1.2, pool: { paper: 3, ink: 1.5, lockbox_uncommon: 0.8, lockbox_rare: 0.5, lockbox_epic: 0.1, banana_notes: 6, brass_compass: 3, sunset_mango: 2, golden_banana: 1, golden_parachute: 0.25, pocket_change: 0.3 }, placements: ['the plantation office', 'the gang boss tent', 'the smugglers\' hall'], presenceChance: 0.5, qualityWeights: { common: 0.5, uncommon: 1, rare: 1, epic: 1 }, searchFactor: 1.5 },
  trash: { label: 'Junk heap', count: [1, 3], openSeconds: 0.1, pool: { paper: 1.5, lockbox_fine: 0.15, scrap_tin: 7, banana: 2, spring: 2, plank: 2, vine_rope: 1, ammo45: 0.6 }, placements: ['camps', 'yards', 'the beach'], presenceChance: 0.85, qualityWeights: { rare: 0.5, epic: 0 }, searchFactor: 0.6 },
  sack: { label: 'Supply sack', count: [1, 3], openSeconds: 0.2, pool: { paper: 0.8, banana: 3, coconut: 3, plank: 2, vine_rope: 3, honey_pot: 2, sunset_mango: 0.5 }, placements: ['camps', 'cart loads', 'the cove'], presenceChance: 0.75 },
  jacket: { label: 'Hanging jacket', count: [1, 2], openSeconds: 0.2, pool: { paper: 1, ink: 0.4, lockbox_fine: 0.4, banana_notes: 3, ammo45: 2, bandage: 2, banana: 1.5, vine_rope: 1, brass_compass: 0.5 }, placements: ['washing lines', 'bunks', 'benches'], presenceChance: 0.7, searchFactor: 0.8 },
};
export const QUALITY_SEARCH_SECONDS = TIER_REVEAL;
export function searchSeconds(quality: number): number {
  return QUALITY_SEARCH_SECONDS[Number.isFinite(quality) ? Math.max(0, Math.min(6, Math.trunc(quality))) : 0];
}
/** an item's Duckov quality = its tier index (loot/tiers.ts) */
export function itemQuality(inst: string): number {
  return tierQuality(itemDef(inst).rarity);
}
export function rollContainer(type: ContainerType, rng: () => number, context?: RaidLootCtx): string[] {
  const definition = CONTAINERS[type];
  const count = definition.count[0] + Math.floor(rng() * (definition.count[1] - definition.count[0] + 1));
  const entries = Object.entries(definition.pool).map(([id, weight]) => [id, weight * (definition.qualityWeights?.[itemDef(id).rarity] ?? 1)] as [string, number]).filter(([, weight]) => weight > 0).sort(([left], [right]) => left.localeCompare(right));
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  const pick = (list: [string, number][], sum: number) => {
    let remaining = rng() * sum;
    for (const [id, weight] of list) { remaining -= weight; if (remaining < 0) return id; }
    return list[list.length - 1][0];
  };
  const q = definition.qualities;
  const items = Array.from({ length: count }, () => {
    if (!q) return pick(entries, total);
    for (let quality = truncatedPick(q.weights, q.bonus ?? 1, rng()); quality >= 0; quality--) {
      const list = entries.filter(([id]) => tierQuality(itemDef(id).rarity) === quality);
      if (list.length) return pick(list, list.reduce((sum, [, weight]) => sum + weight, 0));
    }
    return pick(entries, total);
  });
  if (definition.minimumAmmo) {
    // the floor is in .45 (the Kingpin's, which every run starts with); other calibers in the
    // tin are extra and may be swapped for .45 to meet it (Sol's pacing counted the .45-only tin)
    const ammo = entries.some(([item]) => item === 'ammo45') ? 'ammo45' : entries.find(([item]) => itemDef(item).kind === 'ammo')![0];
    let rounds = items.reduce((sum, item) => sum + (item === ammo ? itemDef(item).stack ?? 1 : 0), 0);
    for (let index = 0; index < items.length && rounds < definition.minimumAmmo; index++) {
      if (items[index] === ammo) continue;
      items[index] = ammo;
      rounds += itemDef(ammo).stack ?? 1;
    }
  }
  if (context) {
    if (context.usefulFound === 0 && !items.some(item => isUseful(item, context))) {
      items[0] = entries.find(([item]) => isUseful(item, context))![0];
    }
    context.cratesOpened++;
    context.emptyStreak = 0;
    for (const inst of items) {
      const item = itemDef(inst);
      if (item.kind === 'ammo') context.ammoFound += item.stack ?? 1;
      if (isUseful(inst, context)) context.usefulFound++;
    }
  }
  return items;
}
export function demoContainerType(socket: { x: number; z: number; in?: string; type?: ContainerType }): ContainerType {
  if (socket.type) return socket.type;
  if (socket.in === 'barn') return 'parts';
  if (socket.in === 'farmhouse') return 'food';
  if (socket.in === 'ferry') return 'medical';
  if (socket.x < -45 && socket.z < 40) return socket.z < 25 ? 'medical' : 'food';
  if (socket.z > 80 || socket.x < -30 && socket.z > 40) return 'food';
  if (socket.z > 40) return 'ammo';
  return 'parts';
}
export const DEMO_CONTAINER_BUDGET: Partial<Record<ContainerType, number>> = { food: 8, ammo: 6, parts: 8, medical: 4, weapon: 2 };
