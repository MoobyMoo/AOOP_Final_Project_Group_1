// INTERIM save (lead) with Sol's core/save.ts signatures; swapped out on merge.
import type { SaveV1 } from "../contracts";
import { DEFAULT_LOOK } from "../actors/look";
import { DEFAULT_GEAR } from "../actors/wearables";
const KEY = "bv_g1";
export function reset(): SaveV1 {
  return { v: 1, createdAt: new Date().toISOString(), raids: 0, money: 0, ammo: 16, look: structuredClone(DEFAULT_LOOK), lookDone: false, gear: { ...DEFAULT_GEAR }, wardrobe: ["bowler", "shades", "satchel"],
    upgrades: { mag: 0, pack: 0, heart: 0 }, keys: [], trophies: [], reserved: [], order: null, fixtures: [], salMovedIn: false, stats: { bonkOuts: 0, extracts: 0, best: 0 } };
}
export function migrate(raw: unknown): SaveV1 { const d = reset(); if (!raw || typeof raw !== "object") return d; const r = raw as Partial<SaveV1>; return { ...d, ...r, upgrades: { ...d.upgrades, ...(r.upgrades ?? {}) }, stats: { ...d.stats, ...(r.stats ?? {}) }, gear: { ...d.gear, ...(r.gear ?? {}) }, look: r.look && (r.look as { v: number }).v === 2 ? r.look : d.look }; }
export function load(): SaveV1 { try { return migrate(JSON.parse(localStorage.getItem(KEY) ?? "null")); } catch { return reset(); } }
export function save(s: SaveV1) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage full or blocked */ } }
