import { itemDef } from "../loot/tables";
import { gunOf } from "../combat/guns";
export const LOOT_FILTERS = { all: "All items", weapons: "Weapons", equipment: "Equipment", ammo: "Ammo", supplies: "Supplies", other: "Other" };
export type LootFilter = { category: keyof typeof LOOT_FILTERS; query: string };
export const emptyLootFilter = (): LootFilter => ({ category: "all", query: "" });
export function matchesLoot(inst: string, filter: LootFilter): boolean {
  const d = itemDef(inst);
  const category = gunOf(inst) ? "weapons" : d.kind === "wear" || d.kind === "attachment" ? "equipment" : d.kind === "ammo" ? "ammo" : d.kind === "heal" ? "supplies" : "other";
  return (filter.category === "all" || filter.category === category) && d.name.toLocaleLowerCase().includes(filter.query.trim().toLocaleLowerCase());
}
