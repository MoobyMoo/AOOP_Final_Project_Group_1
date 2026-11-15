// Sealed lockboxes (Progression v0.2 "safe gambling"): a raid-only find in four tiers. The Fence opens one for a fee;
// the box's tag prints its odds table (the chance of each prize quality). Opening is one atomic step on a copy of the
// save: the fee leaves the wallet (core/wallet.ts "lockboxFee"), the box instance is consumed, the prize arrives as a
// newly owned instance through delivery, and a ledger entry records both identities. Hard lines (LORE.md): never real
// money, odds always shown.
//
// Duckov mechanism, adapted (POLISH_FINDINGS 17 "drop weights", LootBoxLoader tag mode): roll a quality from the
// weights, then pick an entry of exactly that quality, falling one quality lower until something matches.
import type { SaveV1 } from "../contracts";
import { ITEMS, itemDef } from "./tables";
import { tierQuality, TIERS, TIER_KEYS } from "./tiers";
import { itemType, own, instanceId } from "./instances";
import { LOCKBOXES, lockboxOf, type LockboxDef } from "./lockbox-items";
import { debit, econ, note } from "../core/wallet";
import { claimDelivery, ownedItems, validateOwnership } from "../core/settlement";
export { LOCKBOXES, lockboxOf };

const PRIZE_KINDS = new Set(["sell", "part", "heal", "gun", "attachment"]);
const STORY = /^(note_|road_map|cove_flare|keeper_carving|plantation_seal)/;
/** prize pools by Duckov quality (q1..q6): every sellable, part, heal, gun and attachment of that tier; a gun weighs
 *  half (they're the jackpot) */
export const PRIZES: Record<number, { id: string; w: number }[]> = (() => {
  const out: Record<number, { id: string; w: number }[]> = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (const d of Object.values(ITEMS)) {
    if (!PRIZE_KINDS.has(d.kind) || d.value <= 0 || d.id === "kingpin" || STORY.test(d.id)) continue;
    const q = tierQuality(d.rarity); if (q < 1 || q > 6) continue;
    out[q].push({ id: d.id, w: d.kind === "gun" ? 0.5 : 1 });
  }
  for (const q of Object.keys(out)) out[+q].sort((a, b) => a.id.localeCompare(b.id));
  return out;
})();
export const isLockbox = (inst: string) => !!lockboxOf(itemType(inst));
/** the odds table printed on the box: "Petty 55% · Standard 30% · ..." (zero rows left off) */
export function oddsRows(box: LockboxDef) { return box.odds.map((p, i) => ({ q: i + 1, name: TIERS[TIER_KEYS[i + 1]].name, color: TIERS[TIER_KEYS[i + 1]].color, pct: p })).filter(r => r.pct > 0); }
/** pick the prize: u1 picks the quality by the printed odds, u2 the item inside it */
export function rollPrize(box: LockboxDef, u1: number, u2: number): string {
  let r = u1 * 100, q = 1;
  for (let i = 0; i < 6; i++) { r -= box.odds[i]; if (r < 0) { q = i + 1; break; } q = i + 1; }
  for (; q >= 1; q--) {
    const pool = PRIZES[q]; if (!pool.length) continue;
    const total = pool.reduce((a, p) => a + p.w, 0); let x = u2 * total;
    for (const p of pool) { x -= p.w; if (x < 0) return p.id; }
    return pool[pool.length - 1].id;
  }
  return "banana";
}
/** the average base value of a box's prize (npm run sim prints it beside the fee) */
export function prizeEV(box: LockboxDef) {
  let ev = 0;
  for (let i = 0; i < 6; i++) {
    let q = i + 1; while (q > 1 && !PRIZES[q].length) q--;
    const pool = PRIZES[q], total = pool.reduce((a, p) => a + p.w, 0);
    ev += box.odds[i] / 100 * pool.reduce((a, p) => a + p.w / total * itemDef(p.id).value, 0);
  }
  return ev;
}
/** where an owned lockbox can be opened from: the stash or delivery */
const holders = (save: SaveV1) => [save.reserved, save.delivery ?? []];
export function canOpen(save: SaveV1, inst: string): { ok: boolean; reason: string; fee: number } {
  const box = lockboxOf(itemType(inst));
  if (!box) return { ok: false, reason: "Not a lockbox", fee: 0 };
  if (save.activeRaid) return { ok: false, reason: "Open it at home", fee: box.fee };
  if (!holders(save).some(list => list.includes(inst))) return { ok: false, reason: "Not in your stash", fee: box.fee };
  if (save.money < box.fee) return { ok: false, reason: `The fee is 🍌 ${box.fee}`, fee: box.fee };
  return { ok: true, reason: "", fee: box.fee };
}
export type OpenResult = { save: SaveV1; prize: string; fee: number; box: string };
/** open on a copy: pay the fee, consume the box, own the prize (it arrives through delivery). null if refused */
export function openLockbox(save: SaveV1, inst: string, u1: number, u2: number): OpenResult | null {
  if (!canOpen(save, inst).ok) return null;
  const next = structuredClone(save), box = lockboxOf(itemType(inst))!;
  const before = ownedItems(next);
  for (const list of holders(next)) { const i = list.indexOf(inst); if (i >= 0) { list.splice(i, 1); break; } }
  if (!debit(next, "lockboxFee", box.fee, { in: [inst], note: box.id })) return null;
  const prize = own(rollPrize(box, u1, u2));
  (next.delivery ??= []).push(prize); claimDelivery(next);
  note(next, "lockbox", { in: [inst], out: [prize], note: `${box.id} -> ${itemType(prize)}` });
  econ(next).opened++;
  const ids = (l: string[]) => l.map(instanceId).sort().join();
  if (ids([...before.filter(i => i !== inst), prize]) !== ids(ownedItems(next))) throw new Error("Lockbox ledger does not balance");
  validateOwnership(next);
  return { save: next, prize, fee: box.fee, box: box.id };
}
