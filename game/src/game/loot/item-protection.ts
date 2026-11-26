import type { SaveV1 } from "../contracts";
import { qs, questOf } from "../core/quests";
import { itemDef } from "./tables";
import { itemType } from "./instances";
import { tierAtLeast } from "./tiers";
export function importantItemReasons(save: SaveV1, items: readonly string[]): string[] {
  const reasons = new Set<string>();
  for (const inst of items) {
    const type = itemType(inst), def = itemDef(inst);
    if (tierAtLeast(def.rarity, "rare")) reasons.add(`${def.name} is rare or better.`);
    if (def.kind === "key" || def.kind === "note") reasons.add(`${def.name} is a key or story item.`);
    for (const id of qs(save).active) {
      const q = questOf(id);
      if (q?.tasks.some(task => task.t === "fetch" && task.item === type)) reasons.add(`${def.name} is needed for "${q.title}".`);
    }
  }
  return [...reasons];
}
