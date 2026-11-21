import type { SaveV1 } from "../contracts";
import { BOUND_KIT, SLOTS, equipDef, gearStats } from "../loot/equipment";
import { itemDef } from "../loot/tables";
import { itemType } from "../loot/instances";
import { packStacks } from "../loot/pack";
import { gunOf, CALIBERS } from "../combat/guns";
import { PLAYER } from "../combat/weapons";

/** The same three supplies are shown before departure and taken into the raid. */
export function startingSupplies(save: SaveV1): string[] {
  const items: string[] = [];
  for (const type of ["firstaid", "smoothie", "bandage"]) {
    for (const inst of save.reserved) if (items.length < 3 && itemType(inst) === type) items.push(inst);
  }
  return items;
}
export function departureReadiness(save: SaveV1) {
  const gear = { ...save.gear };
  for (const slot of SLOTS) if (!gear[slot] && BOUND_KIT[slot]) gear[slot] = save.locker.find(inst => equipDef(inst)?.id === BOUND_KIT[slot]) ?? null;
  const supplies = startingSupplies(save), stats = gearStats(gear);
  const guns = save.guns.flatMap((g) => { const def = gunOf(g?.inst); return def && g ? [{ name: def.name, caliber: def.caliber, rounds: save.ammo[def.caliber], ammoName: CALIBERS[def.caliber].name }] : []; });
  const slots = 8 + 2 * save.upgrades.pack + stats.packSlots, used = packStacks(supplies).length;
  const equipment = [...Object.values(gear).filter((i): i is string => !!i), ...save.guns.flatMap(g => g ? [g.inst, ...Object.values(g.atts).filter((i): i is string => !!i)] : [])];
  const weight = [...supplies, ...equipment].reduce((n, inst) => n + (itemDef(inst).weight ?? 0), 0);
  const limit = PLAYER.maxWeight + 4 * save.upgrades.pack + stats.maxWeight;
  const warnings: string[] = [];
  if (!guns.length) warnings.push("No firearm equipped. You will rely on your briefcase.");
  for (const caliber of new Set(guns.map(g => g.caliber))) {
    const gun = guns.find(g => g.caliber === caliber)!;
    if (gun.rounds <= 0) warnings.push(`No ${gun.ammoName} for your equipped weapon.`);
    else if (gun.rounds < 12) warnings.push(`Low ${gun.ammoName}: ${gun.rounds} rounds shared by weapons of this caliber.`);
  }
  if (!supplies.length) warnings.push("No healing supplies will be taken. Buy some from Sal first.");
  if (used >= slots) warnings.push("Your pack has no free slots.");
  if (weight > limit) warnings.push("Your loadout is overweight and will slow you down.");
  return { guns, supplies, slots, used, free: Math.max(0, slots - used), weight, limit, warnings };
}
