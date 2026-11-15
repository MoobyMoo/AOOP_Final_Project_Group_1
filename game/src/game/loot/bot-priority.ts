import { HEALS } from '../combat/weapons';
import { itemType } from './instances';
import { itemDef } from './tables';

export function healingValue(inst: string): number {
  const heal = HEALS[itemType(inst)];
  return heal?.heal ?? 0;
}

export function lootPriority(inst: string, pack: readonly string[], healingReserve: number): number {
  const healing = pack.reduce((total, item) => total + healingValue(item), 0);
  const protectedHeal = healingValue(inst) > 0 && healing - (pack.includes(inst) ? healingValue(inst) : 0) < healingReserve;
  return itemDef(inst).value + (protectedHeal ? 1000 : 0);
}
