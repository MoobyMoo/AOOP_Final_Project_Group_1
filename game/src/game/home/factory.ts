// The vault is a factory (Progression v0.2). Production lines are facilities on the vault grid (home/facilities.ts
// CATALOG: ripen, bottler, scrappress, coupon). Each completed raid, every built line takes its inputs from the stash
// and puts what it makes on its output tray; you collect the tray at the line. No real-time timers.
//
// THE HARD RULE: the factory multiplies what you raid and never prints from nothing. Every line consumes raided items
// (no line has an empty recipe), runs only when a raid settles, makes at most MAX_BATCHES per raid however upgraded or
// staffed, and stalls when its tray is full. npm run sim ("Factory") proves it: with zero raiding the factory makes
// nothing, a stash runs dry, and a raid's value-add is capped at a share of a median raid.
//
// Duckov mechanism, ported (SYSTEMS_PORT H01-H03; the production facilities' formulas): a station has recipes of
// inputs to outputs, crafting pays then generates the output, overflow is buffered rather than lost. Duckov has no
// authored production time; ours is "one run per completed raid" (SYSTEMS_PORT H03 port spec: no real-time factory
// timer). Upgrade tiers follow Duckov's building levels (H01): each tier costs bananas and needs a net-worth title.
// Staffing is the hook for recruits (a later wave): a multiplier on the batch rate, 1 = unstaffed.
//
// Every movement is ledgered (core/wallet.ts): a run leaves a "run" entry with the consumed and made instances; a
// collection leaves "collect" (items) and "factory" (the coupon press's cash, counted toward net worth).
import type { SaveV1 } from "../contracts";
import { itemType, own } from "../loot/instances";
import { itemDef } from "../loot/tables";
import { CALIBERS, type Caliber } from "../combat/guns";
import { TITLE, titleReason } from "../core/networth";
import { credit, debit, econ, note, title, type LineState } from "../core/wallet";
import { wantedItems } from "../core/quests";
import { has, type FacilityId } from "./facilities";

export type LineId = Extract<FacilityId, "ripen" | "bottler" | "scrappress" | "coupon">;
export type LineDef = {
  id: LineId; verb: string;
  /** one batch: these leave the stash ... */
  inputs: Record<string, number>;
  /** ... and these arrive on the tray (items, cash, rounds) */
  out: Record<string, number>; cash?: number; rounds?: { caliber: Caliber; n: number };
  /** tier 2 and tier 3: banana cost and the title each needs */
  upgrade: readonly [number, number]; upgradeTitle: readonly [number, number];
};
/** the lines. Margins are slim on purpose (npm run sim "Factory" holds the value-add cap): base values in, a bit
 *  more out */
export const LINES: readonly LineDef[] = [
  { id: "ripen", verb: "ripens", inputs: { banana: 2 }, out: { premium_bunch: 1 }, upgrade: [150, 300], upgradeTitle: [TITLE.associate, TITLE.manager] },
  { id: "bottler", verb: "bottles", inputs: { banana: 2, coconut: 1 }, out: { smoothie: 2 }, upgrade: [180, 360], upgradeTitle: [TITLE.associate, TITLE.manager] },
  { id: "scrappress", verb: "presses", inputs: { old_gear: 1, spring: 1, scrap_tin: 1 }, out: { machine_parts: 1 }, rounds: { caliber: "ammo_rifle", n: 10 }, upgrade: [260, 520], upgradeTitle: [TITLE.manager, TITLE.seniorManager] },
  { id: "coupon", verb: "prints", inputs: { paper: 3, ink: 1 }, out: {}, cash: 22, upgrade: [400, 800], upgradeTitle: [TITLE.seniorManager, TITLE.director] },
];
export const lineOf = (id: string) => LINES.find((l) => l.id === id);
export const isLine = (id: string): id is LineId => !!lineOf(id);
/** batches per completed raid by tier; MAX_BATCHES caps it whatever the staffing; the tray holds TRAY_RAIDS raids' worth */
export const TIER_RATE = [1, 2, 3] as const, MAX_BATCHES = 4, TRAY_RAIDS = 4;

export function lineState(save: SaveV1, id: LineId): LineState {
  return (econ(save).lines[id] ??= { tier: 1, staff: 1, tray: [], cash: 0, rounds: 0, runs: [] });
}
export const lineRate = (st: Pick<LineState, "tier" | "staff">) => Math.min(MAX_BATCHES, Math.floor(TIER_RATE[Math.max(1, Math.min(3, st.tier)) - 1] * Math.max(1, st.staff)));
export const trayCap = (st: LineState) => lineRate(st) * TRAY_RAIDS;
/** batches waiting on the tray (items count in batches of the recipe's output) */
export function trayBatches(def: LineDef, st: LineState) {
  const per = Object.values(def.out).reduce((a, b) => a + b, 0);
  return per ? Math.ceil(st.tray.length / per) : def.cash ? Math.ceil(st.cash / def.cash) : 0;
}
/** base-value margin of one batch (out - in), and the rounds it adds */
export function batchValueAdd(def: LineDef) {
  const val = (rec: Record<string, number>) => Object.entries(rec).reduce((a, [id, n]) => a + itemDef(id).value * n, 0);
  return val(def.out) + (def.cash ?? 0) - val(def.inputs);
}
/** how many batches the stash can feed now (items a job still wants are kept back) */
export function feedable(save: SaveV1, def: LineDef) {
  const wanted = new Set(wantedItems(save));
  return Math.min(...Object.entries(def.inputs).map(([id, n]) => wanted.has(id) ? 0 : Math.floor(save.reserved.filter((inst) => itemType(inst) === id).length / n)));
}
export type RunReport = { id: LineId; batches: number; made: string[]; cash: number; rounds: number; stalled?: "inputs" | "tray" | "off" };
/** a raid settled: run every built line once for it (core/settlement.ts settleRaid). Mutates the save it's given. */
export function runLines(save: SaveV1, raidId: string): RunReport[] {
  const out: RunReport[] = [];
  for (const def of LINES) {
    if (!has(save, def.id)) continue;
    const st = lineState(save, def.id);
    if (st.runs.includes(raidId)) continue;
    st.runs = [...st.runs, raidId].slice(-20);
    if (st.paused) { out.push({ id: def.id, batches: 0, made: [], cash: 0, rounds: 0, stalled: "off" }); continue; }
    const room = Math.max(0, trayCap(st) - trayBatches(def, st)), feed = feedable(save, def);
    const batches = Math.min(lineRate(st), feed, room);
    if (batches <= 0) { out.push({ id: def.id, batches: 0, made: [], cash: 0, rounds: 0, stalled: room <= 0 ? "tray" : "inputs" }); continue; }
    const consumed: string[] = [], made: string[] = [];
    for (const [id, n] of Object.entries(def.inputs)) for (let k = 0; k < n * batches; k++) consumed.push(save.reserved.splice(save.reserved.findIndex((inst) => itemType(inst) === id), 1)[0]);
    for (const [id, n] of Object.entries(def.out)) for (let k = 0; k < n * batches; k++) made.push(own(id));
    st.tray.push(...made); st.cash += (def.cash ?? 0) * batches; st.rounds += (def.rounds?.n ?? 0) * batches;
    note(save, "run", { raid: raidId, in: consumed, out: made, note: `${def.id} x${batches}${def.cash ? ` +${def.cash * batches} cash` : ""}${def.rounds ? ` +${def.rounds.n * batches} ${def.rounds.caliber}` : ""}` });
    out.push({ id: def.id, batches, made, cash: (def.cash ?? 0) * batches, rounds: (def.rounds?.n ?? 0) * batches });
  }
  return out;
}
export type Collected = { items: string[]; cash: number; rounds: number };
/** empty a line's tray: items go to delivery (into the stash while there's room), cash to the wallet, rounds to your
 *  loose ammo. Mutates; returns what moved. Collecting works for a packed-up line too (its tray waits in storage). */
export function collectLine(save: SaveV1, id: LineId, claim: (s: SaveV1) => void): Collected {
  const def = lineOf(id)!, st = lineState(save, id), items = [...st.tray], cash = st.cash, rounds = st.rounds;
  if (!items.length && !cash && !rounds) return { items, cash, rounds };
  st.tray = []; st.cash = 0; st.rounds = 0;
  (save.delivery ??= []).push(...items); claim(save);
  if (items.length || rounds) note(save, "collect", { out: items, note: `${id}${rounds ? ` +${rounds} ${def.rounds!.caliber}` : ""}` });
  if (cash) credit(save, "factory", cash, { note: id });
  if (rounds && def.rounds) save.ammo[def.rounds.caliber] += rounds;
  return { items, cash, rounds };
}
export function canUpgrade(save: SaveV1, id: LineId): { ok: boolean; reason: string; cost: number } {
  const def = lineOf(id)!, st = lineState(save, id);
  if (st.tier >= 3) return { ok: false, reason: "Top tier", cost: 0 };
  const cost = def.upgrade[st.tier - 1], need = def.upgradeTitle[st.tier - 1];
  if (title(save) < need) return { ok: false, reason: titleReason(need), cost };
  if (save.money < cost) return { ok: false, reason: `Needs 🍌 ${cost}`, cost };
  return { ok: true, reason: "", cost };
}
export function upgradeLine(save: SaveV1, id: LineId): boolean {
  const can = canUpgrade(save, id); if (!can.ok) return false;
  if (!debit(save, "lineUpgrade", can.cost, { note: `${id} tier ${lineState(save, id).tier + 1}` })) return false;
  lineState(save, id).tier++; return true;
}
/** pause / resume a line (a paused line keeps its tray and skips runs) */
export function toggleLine(save: SaveV1, id: LineId) { const st = lineState(save, id); if (st.paused) delete st.paused; else st.paused = true; }
/** every instance waiting on a tray (core/settlement.ts ownedItems: tray items are owned) */
export const trayItems = (save: SaveV1) => Object.values(save.econ?.lines ?? {}).flatMap((l) => l.tray);
/** the input and output card text: "2 Banana Bunch -> 1 Premium Bunch" */
export function recipeText(def: LineDef) {
  const list = (rec: Record<string, number>) => Object.entries(rec).map(([id, n]) => `${n} ${itemDef(id).name}`);
  return { in: list(def.inputs).join(" + "), out: [...list(def.out), ...(def.cash ? [`🍌 ${def.cash}`] : []), ...(def.rounds ? [`${def.rounds.n} ${CALIBERS[def.rounds.caliber].name}`] : [])].join(" + ") };
}
