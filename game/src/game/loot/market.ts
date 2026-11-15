// Black-market price swings (Progression v0.2: "black-market price swings between raids: hold loot and sell high").
// Between raids a handful of loot types move away from their base value; everything else sells at base. The vault's
// market board shows today's movers, the Fence's window pays today's price, and this file is the price API the
// cyber-eye stock-ticker augment will read later (marketPrice / marketFactor / marketMovers).
//
// Duckov mechanism, adapted (SYSTEMS_PORT E02; BlackMarket.cs GenerateDemandsAndSupplies and the shipped record
// Duckov.BlackMarkets.BlackMarket.json): every refresh draws a batch of demanded items (8 in the shipped record), each
// with a price factor from a weighted table (0.75 34%, 1 34%, 2 25%, 4 5%, 8 1%, 16 0.2%), price =
// floor(base x factor x batch). The refresh is a 6 h UTC timer. Ours: the refresh is per completed raid (no real-time
// waits), the batch is 6 movers, and the table is gentler and centred near 1 because every item always sells at base
// too: a mover is a bonus or a dip, never the only buyer. npm run sim ("Market") checks the mean stays near 1 and that
// waiting for a spike can't beat selling now by much.
import type { SaveV1 } from "../contracts";
import { ITEMS, itemDef, mulberry32 } from "./tables";
import { itemType } from "./instances";
import { econ } from "../core/wallet";

const STORY = /^(note_|road_map|cove_flare|keeper_carving|plantation_seal|oar$)/;
/** what the market trades: loot you sell, parts and heals with a value (not gear, guns, attachments, keys or boxes) */
export const MARKET_POOL: readonly string[] = Object.values(ITEMS).filter(d => ["sell", "part", "heal"].includes(d.kind) && d.value > 0 && !STORY.test(d.id)).map(d => d.id).sort();
/** [factor, weight]: Duckov's demand table, softened (mean about 1.04) */
export const MARKET_FACTORS: readonly (readonly [number, number])[] = [[0.7, 25], [0.85, 25], [1.2, 25], [1.35, 15], [1.6, 8], [2, 2]];
export const MOVERS_PER_RAID = 6;
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
/** the movers for one market serial (deterministic per save and raid count) */
export function marketRoll(seed: string, serial: number): Record<string, number> {
  const rng = mulberry32((hash(seed) ^ Math.imul(serial + 1, 0x9e3779b1)) >>> 0), pool = [...MARKET_POOL], out: Record<string, number> = {};
  const total = MARKET_FACTORS.reduce((a, [, w]) => a + w, 0);
  for (let k = 0; k < MOVERS_PER_RAID && pool.length; k++) {
    const id = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    let r = rng() * total; let f = 1;
    for (const [factor, w] of MARKET_FACTORS) { r -= w; if (r < 0) { f = factor; break; } }
    out[id] = f;
  }
  return out;
}
/** refresh the board for the save's current raid count (core/settlement.ts after each raid; core/save.ts on load) */
export function refreshMarket(save: SaveV1) {
  const e = econ(save);
  if (e.market.serial === save.raids) return;
  e.market = { serial: save.raids, movers: marketRoll(save.createdAt, save.raids) };
}
// ---------------------------------------------------------------- the price API
export const marketFactor = (save: SaveV1, type: string) => save.econ?.market.movers[type] ?? 1;
/** what the Fence pays today for one item: base value x today's factor for market goods, the base value otherwise */
export function marketPrice(save: SaveV1, inst: string): number {
  const d = itemDef(inst), f = marketFactor(save, itemType(inst));
  return d.value > 0 && f !== 1 ? Math.max(1, Math.round(d.value * f)) : d.value;
}
export type Mover = { id: string; name: string; icon: string; base: number; price: number; factor: number };
/** today's movers, biggest rise first */
export function marketMovers(save: SaveV1): Mover[] {
  return Object.entries(save.econ?.market.movers ?? {}).filter(([id]) => Object.hasOwn(ITEMS, id))
    .map(([id, factor]) => ({ id, name: ITEMS[id].name, icon: ITEMS[id].icon, base: ITEMS[id].value, price: Math.max(1, Math.round(ITEMS[id].value * factor)), factor }))
    .sort((a, b) => b.factor - a.factor);
}
export const priceApi = { factor: marketFactor, price: marketPrice, movers: marketMovers };
