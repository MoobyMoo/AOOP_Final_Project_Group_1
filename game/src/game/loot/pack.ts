import { itemType } from "./instances";
import { ITEMS } from "./tables";

function stackType(inst: string): string | null {
  const type = itemType(inst);
  if (!Object.hasOwn(ITEMS, type)) return null;
  const { kind } = ITEMS[type];
  return kind === "sell" || kind === "heal" || kind === "part" || kind === "key" ? type : null;
}

/** Slots share a type when their items are interchangeable. Keep each item's ID for the raid ledger. */
export function packStacks(items: readonly string[]): string[][] {
  const slots: string[][] = [];
  const byType = new Map<string, string[]>();
  for (const item of items) {
    const type = stackType(item);
    const stack = type === null ? undefined : byType.get(type);
    if (stack) {
      stack.push(item);
    } else {
      const first = [item];
      slots.push(first);
      if (type !== null) byType.set(type, first);
    }
  }
  return slots;
}

export function fitsInPack(items: readonly string[], slots: number, item: string): boolean {
  const type = stackType(item);
  return packStacks(items).length < slots || (type !== null && items.some(other => stackType(other) === type));
}
