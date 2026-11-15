import { itemQuality, searchSeconds } from './containers';

export type SearchSlot = { readonly item: string; readonly revealAt: number; revealed: boolean; taken: boolean };
export type SearchSession = { elapsed: number; readonly slots: SearchSlot[]; readonly duration: number };
export type LootTiming = { searchSeconds: number; itemsTaken: number; opens: number };
export const HUMAN_RAID_TIMING = { fieldFactor: 1.33, takeSeconds: 0.75, sessionSeconds: 1.5 } as const;
export function estimateHumanRaid(raidSeconds: number, loot: LootTiming): number {
  const search = Math.max(0, Math.min(raidSeconds, loot.searchSeconds));
  return (raidSeconds - search) * HUMAN_RAID_TIMING.fieldFactor + search + loot.itemsTaken * HUMAN_RAID_TIMING.takeSeconds + loot.opens * HUMAN_RAID_TIMING.sessionSeconds;
}
export function createSearch(items: readonly string[], options: { openSeconds?: number; searchFactor?: number } = {}): SearchSession {
  const factor = Number.isFinite(options.searchFactor) && options.searchFactor! > 0 ? options.searchFactor! : 1;
  let duration = Math.max(0, options.openSeconds ?? 0.2) * factor;
  const slots = items.map(item => {
    duration += searchSeconds(itemQuality(item)) * factor;
    return { item, revealAt: duration, revealed: false, taken: false };
  });
  return { elapsed: 0, slots, duration };
}
export function advanceSearch(session: SearchSession, seconds: number): readonly SearchSlot[] {
  if (Number.isFinite(seconds) && seconds > 0) session.elapsed = Math.min(session.duration, session.elapsed + seconds);
  const revealed: SearchSlot[] = [];
  for (const slot of session.slots) if (!slot.revealed && session.elapsed + 1e-9 >= slot.revealAt) { slot.revealed = true; revealed.push(slot); }
  return revealed;
}
export function take(session: SearchSession, index: number): string | null {
  const slot = session.slots[index];
  if (!slot?.revealed || slot.taken) return null;
  slot.taken = true;
  return slot.item;
}
export function takeAll(session: SearchSession, capacity = Infinity): string[] {
  const items: string[] = [];
  const limit = Number.isNaN(capacity) ? 0 : Math.max(0, Math.floor(capacity));
  for (let index = 0; index < session.slots.length && items.length < limit; index++) {
    const item = take(session, index);
    if (item !== null) items.push(item);
  }
  return items;
}
