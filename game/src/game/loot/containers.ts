import type { RaidLootCtx } from '../contracts';
import { isUseful, itemDef } from './tables';
import { attachmentPool, attachmentShare } from './attachments';

export type ContainerType = 'weapon' | 'food' | 'ammo' | 'parts' | 'medical';
export type ContainerDef = { label: string; count: readonly [number, number]; openSeconds: number; pool: Record<string, number>; minimumAmmo?: number; placements: readonly string[] };
export const CONTAINERS: Record<ContainerType, ContainerDef> = {
  // G1.5 row 36, Duckov's attachment sources (POLISH_FINDINGS "Attachments", loot): an attachment is about 30% of a
  // weapon crate's rolls (Duckov's better weapon crates 24-41%), 4.6% of a parts crate's (its tech box) and 2% of an
  // ammo tin's (1.5-2.1%); inside that share, rarity weights (attachments.ts). Enemies never drop them: Duckov's
  // carry them on their guns, ours carry no guns (G1.5 row 28: an enemy drops only what it uses).
  weapon: { label: 'Weapon crate', count: [1, 3], openSeconds: 0.6, pool: { boomerang: 3, spring: 2, ammo45: 3, ...attachmentPool(attachmentShare(0.3, 8)) }, placements: ['guard hut locked rack', 'plantation barn secured shelf'] },
  food: { label: 'Food basket', count: [1, 4], openSeconds: 0.2, pool: { banana: 5, coconut: 4, honey_pot: 2, sunset_mango: 1 }, placements: ['beach picnic', 'ferry galley', 'palm edge harvest', 'camp kitchen', 'plantation farmhouse kitchen', 'cove picnic'] },
  ammo: { label: 'Ammo tin', count: [6, 7], openSeconds: 0.2, pool: { ammo45: 1, ...attachmentPool(attachmentShare(0.02, 1)) }, minimumAmmo: 40, placements: ['ferry guard locker', 'guard hut post', 'camp watch post', 'plantation barn sentry'] },
  parts: { label: 'Parts crate', count: [1, 4], openSeconds: 0.2, pool: { spring: 4, plank: 4, old_gear: 3, vine_rope: 3, brass_compass: 1, ...attachmentPool(attachmentShare(0.046, 15)) }, placements: ['ferry engine room', 'beach wreck repair', 'guard hut workbench', 'camp workshop', 'plantation barn', 'cove boat repair'] },
  medical: { label: 'Medical box', count: [1, 3], openSeconds: 0.2, pool: { bandage: 6, smoothie: 3, firstaid: 1 }, placements: ['ferry first aid', 'guard hut rest spot', 'camp treatment tent', 'plantation farmhouse bedside'] },
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
  const entries = Object.entries(definition.pool).sort(([left], [right]) => left.localeCompare(right));
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  const items = Array.from({ length: count }, () => {
    let remaining = rng() * total;
    for (const [id, weight] of entries) { remaining -= weight; if (remaining < 0) return id; }
    return entries[entries.length - 1][0];
  });
  if (definition.minimumAmmo) {
    const ammo = entries.find(([item]) => itemDef(item).kind === 'ammo')![0];
    let rounds = items.reduce((sum, item) => sum + (itemDef(item).kind === 'ammo' ? itemDef(item).stack ?? 1 : 0), 0);
    for (let index = 0; index < items.length && rounds < definition.minimumAmmo; index++) {
      if (itemDef(items[index]).kind === 'ammo') continue;
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
export const DEMO_CONTAINER_BUDGET: Record<ContainerType, number> = { food: 8, ammo: 6, parts: 8, medical: 4, weapon: 2 };
