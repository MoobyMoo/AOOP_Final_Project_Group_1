// The banana ledger (Progression v0.2). Every banana that enters or leaves the wallet goes through credit() or debit()
// here and leaves an entry: sales, gear sales, the raft bonus, job pay, factory output, fares and refunds, builds,
// upgrades, repairs, Sal's shop, the Keeper's trades, wager stakes and payouts, Double or Nothing, lockbox fees.
// Item movements the economy makes (a factory run, a tray collected, a lockbox opened) leave a 0-banana entry with the
// instances in and out, beside Sol's raid settlements and job payouts.
//
// Net worth (core/networth.ts) is the lifetime total earned, counted here as entries land: sales, gear sales, the
// bonus, job pay and factory cash count in full; betting (Sal's wagers and Double or Nothing) counts only when you're
// ahead overall: its running net (payouts minus stakes) adds to net worth when it reaches a new high, so a lucky streak
// counts once and gambling can't farm titles (a win after a loss only refills what the loss took). Spending and losses
// never lower net worth. Pure data and rules, no DOM: safe in node tests and the sim.
//
// Duckov mechanism (SYSTEMS_PORT E02): one authoritative wallet (EconomyManager.Money), payment helpers that refuse
// rather than go negative. Ours keeps `money` as that wallet and adds the entry log for the property tests.
import type { SaveV1 } from "../contracts";
import { titleIndex } from "./networth";

export type EconKind =
  | "sale" | "gearSale" | "bonus" | "quest" | "factory"          // income: counts toward net worth
  | "refund" | "fare" | "build" | "upgrade" | "repair" | "shop" | "trade" | "lineUpgrade" | "lockboxFee"
  | "wagerStake" | "wagerPay" | "gambleStake" | "gamblePay"      // wins count their profit only
  | "run" | "collect" | "lockbox";                                // item movements (n = 0)
const EARNS: ReadonlySet<EconKind> = new Set(["sale", "gearSale", "bonus", "quest", "factory"]);
const BETS: ReadonlySet<EconKind> = new Set(["wagerStake", "wagerPay", "gambleStake", "gamblePay"]);
/** one ledger line. n = signed bananas into the wallet; earned = what it added to net worth; in/out = instances that
 *  left / arrived (owned identities) */
export type EconEntry = { seq: number; k: EconKind; n: number; earned: number; at: number; raid?: string; in?: string[]; out?: string[]; note?: string };
/** a production line's saved state, keyed by the facility id (one of each line): tier 1..3, staffing multiplier
 *  (recruits later; 1 = unstaffed), the output tray (owned instances, cash and rounds waiting to be collected), and the
 *  raids it already ran for (a raid runs a line once) */
export type LineState = { tier: number; staff: number; tray: string[]; cash: number; rounds: number; runs: string[]; paused?: boolean };
/** Sal's wager: placed at his desk (nothing paid yet), riding once the pod launches (stake paid, bound to the raid) */
export type Wager = { id: string; stake: number; state: "placed" | "riding"; raid?: string };
export type WagerResult = { id: string; stake: number; won: boolean; paid: number; raid: string };
export type GambleResult = { raid: string; game: "coin" | "wheel"; pick: string; landed: string; stake: number; won: boolean; payout: number; sold: number };
export type EconSave = {
  v: 1;
  lifetime: number;            // bananas earned, ever (net worth)
  reviewed: number;            // the highest title whose Performance Review has played
  seq: number;                 // next ledger sequence number
  ledger: EconEntry[];         // the most recent LEDGER_KEEP entries
  totals: Partial<Record<EconKind, number>>; // every entry ever, summed per kind (signed bananas)
  market: { serial: number; movers: Record<string, number> }; // loot/market.ts
  lines: Record<string, LineState>;                          // home/factory.ts
  wager: Wager | null; lastWager: WagerResult | null;        // core/gamble.ts
  rolled: string[];            // settlement ids already rolled at Double or Nothing (once per raid)
  lastGamble: GambleResult | null;
  opened: number;              // lockboxes opened
  betNet: number; betHigh: number; // betting's running net and its high-water mark (what betting added to net worth)
};
export const LEDGER_KEEP = 400;
export const freshEcon = (): EconSave => ({ v: 1, lifetime: 0, reviewed: 0, seq: 1, ledger: [], totals: {}, market: { serial: -1, movers: {} }, lines: {}, wager: null, lastWager: null, rolled: [], lastGamble: null, opened: 0, betNet: 0, betHigh: 0 });
/** the save's economy state, created on first use (core/save.ts always fills it) */
export function econ(save: SaveV1): EconSave { return (save.econ ??= freshEcon()); }

type Meta = { raid?: string; in?: string[]; out?: string[]; note?: string };
const whole = (n: number) => Number.isSafeInteger(n) && n >= 0;
function entry(save: SaveV1, k: EconKind, n: number, meta: Meta): EconEntry {
  const e = econ(save);
  let earned = EARNS.has(k) && n > 0 ? n : 0;
  if (BETS.has(k)) { e.betNet += n; const high = Math.max(e.betHigh, e.betNet); earned = high - e.betHigh; e.betHigh = high; }
  const rec: EconEntry = { seq: e.seq++, k, n, earned, at: save.raids, ...(meta.raid ? { raid: meta.raid } : {}), ...(meta.in?.length ? { in: [...meta.in] } : {}), ...(meta.out?.length ? { out: [...meta.out] } : {}), ...(meta.note ? { note: meta.note } : {}) };
  e.ledger.push(rec); if (e.ledger.length > LEDGER_KEEP) e.ledger.splice(0, e.ledger.length - LEDGER_KEEP);
  e.totals[k] = (e.totals[k] ?? 0) + n; e.lifetime += earned;
  return rec;
}
/** bananas into the wallet. n must be a whole number >= 0 */
export function credit(save: SaveV1, k: EconKind, n: number, meta: Meta = {}): EconEntry {
  if (!whole(n)) throw new Error(`Invalid credit: ${n}`);
  save.money += n; return entry(save, k, n, meta);
}
/** bananas out of the wallet; refuses (false, nothing changes) if the wallet can't cover it */
export function debit(save: SaveV1, k: EconKind, n: number, meta: Meta = {}): boolean {
  if (!whole(n) || save.money < n) return false;
  save.money -= n; entry(save, k, -n, meta); return true;
}
/** an item movement with no bananas (a factory run, a tray collected, a lockbox opened) */
export const note = (save: SaveV1, k: EconKind, meta: Meta) => entry(save, k, 0, meta);

export const lifetime = (save: SaveV1) => save.econ?.lifetime ?? 0;
export const title = (save: SaveV1) => titleIndex(lifetime(save));
/** a promotion waiting for its Performance Review (the title index), or -1 */
export const pendingReview = (save: SaveV1) => { const t = title(save); return t > (save.econ?.reviewed ?? 0) ? t : -1; };
export const markReviewed = (save: SaveV1) => { const e = econ(save); e.reviewed = Math.max(e.reviewed, titleIndex(e.lifetime)); };
/** the ledger's next sequence number (property tests: bananas moved since a mark = the entries after it) */
export const ledgerMark = (save: SaveV1) => save.econ?.seq ?? 1;
export const movedSince = (save: SaveV1, mark: number) => (save.econ?.ledger ?? []).filter(e => e.seq >= mark).reduce((a, e) => a + e.n, 0);

// ---------------------------------------------------------------- save
type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Raw : {};
const int = (v: unknown, fb: number, lo = 0, hi = Number.MAX_SAFE_INTEGER) => typeof v === "number" && Number.isSafeInteger(v) && v >= lo && v <= hi ? v : fb;
const strs = (v: unknown) => Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && s.length > 0) : [];
/** validate saved economy state. A save from before it starts its net worth at the bananas it holds (spending isn't
 *  recoverable), with that title already reviewed so no stale promotion plays. `items` keeps tray instances that are
 *  real item types (the caller passes core/save.ts's loot filter) */
export function sanitizeEcon(value: unknown, ctx: { money: number; items: (list: unknown) => string[] }): EconSave {
  const raw = obj(value), out = freshEcon();
  if (!Object.keys(raw).length) { out.lifetime = ctx.money; out.reviewed = titleIndex(ctx.money); return out; }
  out.lifetime = int(raw.lifetime, ctx.money); out.reviewed = Math.min(int(raw.reviewed, 0, 0, 7), titleIndex(out.lifetime));
  out.seq = int(raw.seq, 1, 1);
  const kinds = new Set<string>(["sale", "gearSale", "bonus", "quest", "factory", "refund", "fare", "build", "upgrade", "repair", "shop", "trade", "lineUpgrade", "lockboxFee", "wagerStake", "wagerPay", "gambleStake", "gamblePay", "run", "collect", "lockbox"]);
  for (const r of Array.isArray(raw.ledger) ? raw.ledger.slice(-LEDGER_KEEP) : []) {
    const e = obj(r); if (typeof e.k !== "string" || !kinds.has(e.k) || typeof e.n !== "number" || !Number.isSafeInteger(e.n)) continue;
    out.ledger.push({ seq: int(e.seq, 0), k: e.k as EconKind, n: e.n, earned: int(e.earned, 0), at: int(e.at, 0), ...(typeof e.raid === "string" ? { raid: e.raid } : {}), ...(Array.isArray(e.in) ? { in: strs(e.in) } : {}), ...(Array.isArray(e.out) ? { out: strs(e.out) } : {}), ...(typeof e.note === "string" ? { note: e.note } : {}) });
  }
  out.seq = Math.max(out.seq, ...out.ledger.map(e => e.seq + 1));
  for (const [k, n] of Object.entries(obj(raw.totals))) if (kinds.has(k) && typeof n === "number" && Number.isSafeInteger(n)) out.totals[k as EconKind] = n;
  const m = obj(raw.market);
  out.market = { serial: int(m.serial, -1, -1), movers: Object.fromEntries(Object.entries(obj(m.movers)).filter(([, f]) => typeof f === "number" && f > 0 && f <= 4) as [string, number][]) };
  for (const [id, l] of Object.entries(obj(raw.lines))) {
    const s = obj(l);
    out.lines[id] = { tier: int(s.tier, 1, 1, 3), staff: typeof s.staff === "number" && s.staff >= 1 && s.staff <= 4 ? s.staff : 1, tray: ctx.items(s.tray), cash: int(s.cash, 0), rounds: int(s.rounds, 0), runs: strs(s.runs).slice(-20), ...(s.paused === true ? { paused: true } : {}) };
  }
  const w = obj(raw.wager);
  if (typeof w.id === "string" && int(w.stake, 0) > 0 && (w.state === "placed" || w.state === "riding")) out.wager = { id: w.id, stake: w.stake as number, state: w.state, ...(typeof w.raid === "string" ? { raid: w.raid } : {}) };
  const lw = obj(raw.lastWager);
  if (typeof lw.id === "string" && typeof lw.raid === "string") out.lastWager = { id: lw.id, stake: int(lw.stake, 0), won: lw.won === true, paid: int(lw.paid, 0), raid: lw.raid };
  out.rolled = [...new Set(strs(raw.rolled))];
  const lg = obj(raw.lastGamble);
  if (typeof lg.raid === "string" && (lg.game === "coin" || lg.game === "wheel")) out.lastGamble = { raid: lg.raid, game: lg.game, pick: String(lg.pick ?? ""), landed: String(lg.landed ?? ""), stake: int(lg.stake, 0), won: lg.won === true, payout: int(lg.payout, 0), sold: int(lg.sold, 0) };
  out.opened = int(raw.opened, 0);
  out.betNet = typeof raw.betNet === "number" && Number.isSafeInteger(raw.betNet) ? raw.betNet : 0; out.betHigh = Math.max(0, int(raw.betHigh, 0), out.betNet);
  return out;
}
