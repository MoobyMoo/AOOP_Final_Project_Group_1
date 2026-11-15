// The world side of the looting screen (G1.5 rows 05, 18, 27): one hook for the lead's UI worker. Everything you search
// with E is a Lootable (core/state.ts Crate): a typed container, a generic crate (the key strongbox, the north's tiers,
// your satchel) or a knocked-out enemy's body. Each has one search session (loot/search.ts) for the whole raid:
// per-item reveal on Duckov's quality clock, interrupted searches resume where they stopped, taken slots stay taken.
//
// USE (ui/*):
//   lootHook.ui = { open(t) { show the panel for t }, close(t) { hide it } };   // register once; the world stops tossing
//                                                                                // revealed items onto the ground
//   lootHook.current()          the lootable being searched now (null when you walked off, dodged or got bonked)
//   lootHook.state(t)           { label, kind, type, elapsed, duration, revealed, total, taken, done }
//   lootHook.contents(t)        the slots: { item, revealAt, revealed, taken } in order (hidden ones: show a placeholder)
//   lootHook.take(t, i)         move slot i into the pack if it fits; returns the item id or null (hidden, taken, no room)
//   lootHook.takeAll(t)         every revealed slot that fits; returns the ids taken
//   lootHook.close()            stop searching (the session keeps its progress)
//   lootHook.open(t)            start/resume searching t from code (E does this in play)
//   lootHook.nearest()          what E would open from here (for a prompt), or null
//   lootHook.nearbyItems(r)     ground items within r, nearest first (Duckov's nearby list, row 04)
// The world advances the session while you stay within 2.2 u (raidloot.ts updateLoot); the screen only reads and takes.
// The bot never uses the screen: with G.bot set, revealed items are always tossed out for it to pick up.
import { G, type Crate } from "../core/state";
import type { SearchSession, SearchSlot } from "./search";

export type Lootable = Crate;
export type LootState = { label: string; kind: "crate" | "container" | "body"; type?: string; elapsed: number; duration: number; revealed: number; total: number; taken: number; done: boolean };
type Ui = { open(t: Lootable): void; close(t: Lootable): void };
// late-bound so this file has no import cycle with raidloot.ts (which calls lootHook.ui)
let api: {
  session: (t: Lootable) => SearchSession | null; begin: (t: Lootable) => SearchSession | null; end: () => void; current: () => Lootable | null;
  nearest: () => Lootable | null; fits: (item: string) => boolean; give: (item: string, n?: number) => boolean; take: (s: SearchSession, i: number) => string | null;
  nearby: (r: number) => { item: string; x: number; z: number; id: number }[];
} | null = null;
export const bindLootApi = (a: NonNullable<typeof api>) => { api = a; };

export const lootHook = {
  ui: null as Ui | null,
  open(t: Lootable) { return api?.begin(t) ?? null; },
  close() { api?.end(); },
  current() { return api?.current() ?? null; },
  nearest() { return api?.nearest() ?? null; },
  contents(t: Lootable): readonly SearchSlot[] { return api?.session(t)?.slots ?? []; },
  state(t: Lootable): LootState {
    const s = t.session ?? null, slots = s?.slots ?? [];
    return { label: t.label ?? "crate", kind: t.kind ?? "crate", type: t.type, elapsed: s?.elapsed ?? 0, duration: s?.duration ?? 0, revealed: slots.filter((q) => q.revealed).length, total: slots.length, taken: slots.filter((q) => q.taken).length, done: !!s && slots.every((q) => q.taken) };
  },
  take(t: Lootable, index: number): string | null {
    const s = api?.session(t); if (!s || !api) return null;
    const slot = s.slots[index]; if (!slot?.revealed || slot.taken || !api.fits(slot.item)) return null;
    const item = api.take(s, index); if (!item) return null;
    if (!api.give(item)) { slot.taken = false; return null; }
    if (s.slots.every((q) => q.taken)) t.opened = true;
    return item;
  },
  takeAll(t: Lootable): string[] { const out: string[] = []; const s = api?.session(t); if (!s) return out; s.slots.forEach((_, i) => { const it = lootHook.take(t, i); if (it) out.push(it); }); return out; },
  nearbyItems(r = 3) { return api?.nearby(r) ?? []; },
};
void G;
