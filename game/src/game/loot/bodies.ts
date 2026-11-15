import type { EnemyStyle, Gear } from '../contracts';
import { createSearch, type SearchSession } from './search';
import { isUseful } from './tables';

export type LootEnemy = { kind: EnemyStyle['kind']; down: boolean; gear?: Gear; carry: string[]; stolen: string[] };
const bodies = new WeakMap<LootEnemy, SearchSession>();
const seeded = new WeakSet<LootEnemy>();
export function seedEnemyInventory(enemy: LootEnemy, rng: () => number, options: { weapon?: string; ammo?: { item: string; stacks: number }; pockets?: readonly string[] } = {}) {
  if (seeded.has(enemy)) return;
  seeded.add(enemy);
  const weapon = options.weapon ?? (enemy.kind === 'wild' ? 'boomerang' : undefined);
  if (weapon) enemy.carry.push(weapon);
  if (options.ammo) for (let index = 0; index < Math.min(2, Math.max(0, Math.floor(options.ammo.stacks))); index++) enemy.carry.push(options.ammo.item);
  if (options.pockets) enemy.carry.push(...options.pockets);
  else if (rng() < 0.65) {
    const pool = ['banana', 'coconut', 'vine_rope', 'old_gear'];
    enemy.carry.push(pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))]);
  }
  if (enemy.kind === 'sleeper') enemy.carry.push('banana_idol');
  if (!options.pockets && ![...Object.values(enemy.gear ?? {}), ...enemy.carry, ...enemy.stolen].some(item => item && isUseful(item, { orderNeeds: [] }))) enemy.carry.push('bandage');
}
export function bodySearch(enemy: LootEnemy): SearchSession | null {
  if (!enemy.down) return null;
  let session = bodies.get(enemy);
  if (!session) {
    const gear = enemy.gear ? Object.values(enemy.gear).filter((inst): inst is string => inst !== null) : [];
    session = createSearch([...gear, ...enemy.carry, ...enemy.stolen]);
    bodies.set(enemy, session);
    enemy.carry.length = 0;
    enemy.stolen.length = 0;
    if (enemy.gear) for (const slot of Object.keys(enemy.gear) as (keyof Gear)[]) enemy.gear[slot] = null;
  }
  return session;
}
export function bodyContents(enemy: LootEnemy): readonly string[] {
  return bodySearch(enemy)?.slots.filter(slot => !slot.taken).map(slot => slot.item) ?? [];
}
