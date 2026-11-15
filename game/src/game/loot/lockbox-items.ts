// Sealed lockboxes as items (Progression v0.2 "safe gambling"). Data only, no imports from loot/tables.ts (tables
// spreads these into ITEMS), like loot/storyitems.ts. The rules (odds, fee, the prize pools, opening) live in
// loot/lockbox.ts. A lockbox is found only in raids, is never sold (value 0, the Fence's window skips it), and opens at
// the Fence for a fee with the odds printed on the box.
import type { ItemDef, Rarity } from "../contracts";

export type LockboxDef = { id: string; tier: Rarity; name: string; fee: number;
  /** chance of each prize quality, Duckov q1..q6 (Petty..Offshore), in percent; printed on the box */
  odds: readonly [number, number, number, number, number, number] };
/** fees and odds are set by npm run sim ("Lockboxes"): the average prize is worth a bit more than the fee, so opening
 *  one is a fair-ish gamble, never an income machine */
export const LOCKBOXES: readonly LockboxDef[] = [
  { id: "lockbox_fine", tier: "fine", name: "Standard Lockbox", fee: 25, odds: [55, 30, 12, 3, 0, 0] },
  { id: "lockbox_uncommon", tier: "uncommon", name: "Premium Lockbox", fee: 45, odds: [25, 35, 25, 12, 3, 0] },
  { id: "lockbox_rare", tier: "rare", name: "Executive Lockbox", fee: 80, odds: [0, 25, 38, 27, 8, 2] },
  { id: "lockbox_epic", tier: "epic", name: "Boardroom Lockbox", fee: 130, odds: [0, 0, 28, 40, 24, 8] },
];
export const lockboxOf = (type: string) => LOCKBOXES.find(b => b.id === type);
export const LOCKBOX_ITEMS: Record<string, ItemDef> = Object.fromEntries(LOCKBOXES.map(b => [b.id, { id: b.id, name: b.name, icon: "🔐", rarity: b.tier, value: 0, kind: "lockbox" as const, weight: 1.2 }]));
