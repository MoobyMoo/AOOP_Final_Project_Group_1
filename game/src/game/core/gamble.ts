// Safe gambling (Progression v0.2; Moo 2026-11-15: "when we return we can decide whether to double our loot worth by
// flipping a coin, playing red/black... it creates unique moments"). Hard lines (LORE.md): never real money in or
// out, the odds always on screen, no auto-repeat. Two games live here as rules; the UI is home/gamble-ui.ts.
//
// Sal's wagers: at his desk, before deploying, bet bananas on your own raid at 2x-3x. Placing one moves nothing; the
// stake leaves the wallet when the pod launches (core/settlement.ts beginRaid -> rideWager, bound to that raid id) and
// the raid's settlement judges it exactly once (settleRaid -> judgeWager). A bonk-out, a quit or a reload loses it.
//
// Double or Nothing (G1_5_BRIEF row 48): on the payout slip after an extraction, the Fence buys the raid's valuables
// at today's market price; you stake up to that sum (never items, never the stash) on a coin or red/black on his
// little wheel. Once per raid, a slight house edge (the coin lands on its edge 2% of the time; the wheel has one green
// pocket in 37), so over many raids it is a banana sink, which npm run sim ("Gambling") confirms.
import type { SaveV1 } from "../contracts";
import type { Settlement } from "./settlement";
import { gunOf } from "../combat/guns";
import { itemDef } from "../loot/tables";
import { instanceId } from "../loot/instances";
import { marketPrice } from "../loot/market";
import { credit, debit, econ, type GambleResult } from "./wallet";

// ---------------------------------------------------------------- Sal's wagers
export type WagerFacts = { extracted: boolean; value: number; feats: readonly string[]; kept: readonly string[] };
export type WagerDef = { id: string; text: string; short: string; odds: number; judge: (f: WagerFacts) => boolean };
export const WAGERS: readonly WagerDef[] = [
  { id: "haul300", text: "Extract with 🍌 300+ of loot", short: "a 300-banana haul", odds: 2, judge: (f) => f.extracted && f.value >= 300 },
  { id: "foreman", text: "KO Foreman Knucklebark and get home", short: "the foreman bonked", odds: 3, judge: (f) => f.extracted && f.feats.includes("ko:boss") },
  { id: "rifle", text: "Come back with a Hired Gun's rifle", short: "a rifle brought home", odds: 3, judge: (f) => f.extracted && f.kept.some((inst) => { const g = gunOf(inst); return !!g && (g.cls === "rifle" || g.cls === "lmg"); }) },
];
export const STAKES = [25, 50, 100] as const;
export const wagerOf = (id: string) => WAGERS.find((w) => w.id === id);
export const payoutFor = (w: WagerDef, stake: number) => Math.floor(stake * w.odds);
/** place (or change) the wager for the next raid. Nothing is paid until the pod launches */
export function placeWager(save: SaveV1, id: string, stake: number): { ok: boolean; reason: string } {
  const w = wagerOf(id);
  if (!w || !STAKES.includes(stake as never)) return { ok: false, reason: "Sal doesn't take that bet" };
  if (save.activeRaid || econ(save).wager?.state === "riding") return { ok: false, reason: "A bet is already riding" };
  if (save.money < stake) return { ok: false, reason: `You need 🍌 ${stake}` };
  econ(save).wager = { id, stake, state: "placed" }; return { ok: true, reason: "" };
}
export function cancelWager(save: SaveV1) { const e = econ(save); if (e.wager?.state === "placed") e.wager = null; }
/** the pod launched (beginRaid): take the stake and bind the bet to this raid. A bet the wallet can't cover is called
 *  off (nothing paid). Mutates. */
export function rideWager(save: SaveV1, raidId: string) {
  const e = econ(save), w = e.wager;
  if (!w || w.state !== "placed") return;
  if (!debit(save, "wagerStake", w.stake, { raid: raidId, note: w.id })) { e.wager = null; return; }
  e.wager = { ...w, state: "riding", raid: raidId };
}
/** the raid settled: judge a bet riding on it, pay once (stake x odds; net worth counts betting only while you're ahead overall). Mutates. */
export function judgeWager(save: SaveV1, record: Settlement, feats: readonly string[]) {
  const e = econ(save), w = e.wager;
  if (!w || w.state !== "riding") return;
  const def = wagerOf(w.id);
  if (w.raid !== record.id || !def) { e.wager = null; e.lastWager = { id: w.id, stake: w.stake, won: false, paid: 0, raid: w.raid ?? record.id }; return; }
  const extracted = !["bonked", "quit", "reload"].includes(record.reason);
  const won = def.judge({ extracted, value: record.value, feats, kept: record.kept });
  const paid = won ? payoutFor(def, w.stake) : 0;
  if (paid) credit(save, "wagerPay", paid, { raid: record.id, note: w.id });
  e.wager = null; e.lastWager = { id: w.id, stake: w.stake, won, paid, raid: record.id };
}

// ---------------------------------------------------------------- Double or Nothing
export type Game = "coin" | "wheel";
export const COIN_EDGE = 0.02, WHEEL_POCKETS = 37; // one green pocket: the Fence's
/** the chance shown on screen and used by the roll */
export const winChance = (game: Game) => game === "coin" ? (1 - COIN_EDGE) / 2 : 18 / WHEEL_POCKETS;
export const oddsLabel = (game: Game) => `${(winChance(game) * 100).toFixed(game === "coin" ? 0 : 1)}% to win`;
const BONKED = ["bonked", "quit", "reload"];
/** what the Fence would buy from this raid right now: its kept valuables (kind "sell") still in your stash or delivery,
 *  at today's prices. cap = the most you can stake (those sale bananas). null if this raid can't be rolled */
export function haulOffer(save: SaveV1, raidId: string): { items: string[]; sold: number; cap: number; rolled: boolean } | null {
  const record = save.settlements?.find((r) => r.id === raidId);
  if (!record || BONKED.includes(record.reason)) return null;
  const home = new Set([...save.reserved, ...(save.delivery ?? [])].map(instanceId));
  const items = record.kept.filter((inst) => itemDef(inst).kind === "sell" && home.has(instanceId(inst)));
  const sold = items.reduce((a, inst) => a + marketPrice(save, inst), 0);
  return { items, sold, cap: sold, rolled: econ(save).rolled.includes(raidId) };
}
/** which side or colour the roll landed on. coin: u < p picks your side, the next p the other, the rest the edge.
 *  wheel: pocket floor(u x 37): 0 green, 1-18 red, 19-36 black. */
export function landed(game: Game, pick: string, u: number): { side: string; pocket?: number } {
  if (game === "coin") { const p = winChance("coin"); const other = pick === "heads" ? "tails" : "heads"; return { side: u < p ? pick : u < 2 * p ? other : "edge" }; }
  const pocket = Math.min(WHEEL_POCKETS - 1, Math.floor(u * WHEEL_POCKETS));
  return { side: pocket === 0 ? "green" : pocket <= 18 ? "red" : "black", pocket };
}
export type DoubleResult = { save: SaveV1; result: GambleResult; pocket?: number };
/** roll on a copy: sell the raid's valuables (sale), take the stake (gambleStake), pay double on a win (gamblePay).
 *  One roll per raid id. null if refused; the input save never changes. */
export function rollDouble(save: SaveV1, raidId: string, stake: number, game: Game, pick: string, u: number): DoubleResult | null {
  const offer = haulOffer(save, raidId);
  const picks = game === "coin" ? ["heads", "tails"] : ["red", "black"];
  if (!offer || offer.rolled || !offer.items.length || !picks.includes(pick) || !Number.isSafeInteger(stake) || stake < 1 || stake > offer.cap || !(u >= 0 && u < 1)) return null;
  const next = structuredClone(save), gone = new Set(offer.items.map(instanceId));
  next.reserved = next.reserved.filter((inst) => !gone.has(instanceId(inst)));
  if (next.delivery) next.delivery = next.delivery.filter((inst) => !gone.has(instanceId(inst)));
  credit(next, "sale", offer.sold, { raid: raidId, in: offer.items, note: "Double or Nothing: the Fence buys the haul" });
  if (!debit(next, "gambleStake", stake, { raid: raidId, note: game })) return null;
  const land = landed(game, pick, u), won = land.side === pick, payout = won ? stake * 2 : 0;
  if (payout) credit(next, "gamblePay", payout, { raid: raidId, note: game });
  const e = econ(next); e.rolled = [...e.rolled, raidId];
  const result: GambleResult = { raid: raidId, game, pick, landed: land.side, stake, won, payout, sold: offer.sold };
  e.lastGamble = result;
  if (next.money !== save.money + offer.sold - stake + payout) throw new Error("Double or Nothing ledger does not balance");
  return { save: next, result, pocket: land.pocket };
}
