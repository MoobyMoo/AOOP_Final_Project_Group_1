import type { Gear, GunSlots, SaveV1 } from "../contracts";
import { BOUND_KIT, SLOTS, equipDef } from "../loot/equipment";
import { instanceId, own, itemType } from "../loot/instances";
import { itemDef } from "../loot/tables";
import { fitsInPack, packStacks } from "../loot/pack";
import { tierAtLeast } from "../loot/tiers";
import { ATT_SLOTS, attachmentDef, isAttachment } from "../loot/attachments";
import { CALIBER_IDS, gunOf, isCaliber, noRounds, type Rounds } from "../combat/guns";
import { EXIT_DEFS, exitCondition, exitCosts, type ExitId } from "../world/extraction";
import { stashCapacity, stashUsed } from "../home/facilities";
import { homeItems, qs, questOf, questStatus, type QuestPayout } from "./quests";
import { credit } from "./wallet";
import { judgeWager, rideWager } from "./gamble";
import { runLines, trayItems } from "../home/factory";
import { refreshMarket } from "../loot/market";

/** ammo = every round held per caliber (loose reserve + loaded in both guns); rounds / spentRounds = the per-caliber
 *  ledger (Duckov caliber matching: a .45 found never becomes a rifle round) */
export type RaidCheckpoint = {
  id: string; pack: string[]; gear: Gear; guns?: GunSlots; world: string[]; consumed: string[];
  x: number; z: number; ammo: Rounds; elapsed: number;
  origin: string[]; introduced: string[];
  rounds?: Rounds; spentRounds?: Rounds;
  /** what happened this raid that a wager can ask about ("ko:boss"), noted by core/raid-journal.ts noteFeat */
  feats?: string[];
};
export type Settlement = {
  id: string; reason: string; kept: string[]; lost: string[]; consumed: string[]; abandoned: string[];
  before: string[]; after: string[]; elapsed: number; value: number; bonus: number;
  rounds: { before: Rounds; after: Rounds; spent: Rounds; abandoned: Rounds };
};
/** the items held in gun slots: each unbound gun and every fitted attachment (the bound Kingpin is in boundWeapons) */
export function slotItems(save: SaveV1, guns: GunSlots | undefined): string[] {
  const bound = new Set(Object.values(save.boundWeapons ?? {}));
  return (guns ?? [null, null]).flatMap(gs => gs ? [...(bound.has(gs.inst) ? [] : [gs.inst]), ...Object.values(gs.atts).filter((a): a is string => !!a)] : []);
}
export function ownedItems(save: SaveV1): string[] {
  return [...Object.values(save.boundWeapons ?? {}), ...save.locker, ...save.reserved, ...(save.delivery ?? []), ...(save.satchel?.items ?? []), ...trayItems(save),
    ...slotItems(save, save.activeRaid?.guns ?? save.guns),
    ...(save.activeRaid ? [...save.activeRaid.pack, ...Object.values(save.activeRaid.gear).filter((inst): inst is string => !!inst), ...save.activeRaid.world] : Object.values(save.gear).filter((inst): inst is string => !!inst))];
}
export function identifySave(save: SaveV1): SaveV1 {
  const next = structuredClone(save);
  next.boundWeapons = { kingpin: own(next.boundWeapons?.kingpin ?? "kingpin"), briefcase: own(next.boundWeapons?.briefcase ?? "briefcase") };
  for (const slot of SLOTS) if (next.gear[slot]) next.gear[slot] = own(next.gear[slot]!);
  for (const gs of next.guns) if (gs) { gs.inst = gs.inst === next.boundWeapons.kingpin || itemType(gs.inst) === "kingpin" ? next.boundWeapons.kingpin : own(gs.inst); for (const slot of ATT_SLOTS) if (gs.atts[slot]) gs.atts[slot] = own(gs.atts[slot]!); }
  next.locker = next.locker.map(own); next.reserved = next.reserved.map(own);
  if (next.delivery) next.delivery = next.delivery.map(own);
  if (next.satchel) next.satchel.items = next.satchel.items.map(own);
  for (const line of Object.values(next.econ?.lines ?? {})) line.tray = line.tray.map(own);
  return next;
}
/** what goes to the locker (gear, attachments and guns) rather than the reserved shelf */
export const isLockerItem = (inst: string) => !!(equipDef(inst) || isAttachment(inst) || gunOf(inst));
const EMPTY_ATTS = { sight: null, muzzle: null, mag: null, laser: null, grip: null, stock: null };
export function claimDelivery(save: SaveV1) {
  while (save.delivery?.length && stashUsed(save) < stashCapacity(save)) {
    const inst = save.delivery.shift()!;
    if (isLockerItem(inst)) save.locker.push(inst); else save.reserved.push(inst);
  }
}
export function validateOwnership(save: SaveV1) {
  const seen = new Set<string>();
  const fixed = new Set(Object.values(save.boundWeapons ?? {}));
  for (const [slot, inst] of Object.entries(save.boundWeapons ?? {})) if (itemType(inst) !== slot) throw new Error(`Invalid bound weapon: ${slot}`);
  for (const inst of ownedItems(save)) {
    const identity = instanceId(inst);
    if (!identity || seen.has(identity) || (itemDef(inst).icon === "❔" && !fixed.has(inst))) throw new Error(`Invalid item ownership: ${inst}`);
    seen.add(identity);
  }
  for (const [slot, inst] of Object.entries(save.activeRaid?.gear ?? save.gear)) if (inst && equipDef(inst)?.slot !== slot) throw new Error(`Invalid equipment slot: ${slot}`);
  for (const gs of save.activeRaid?.guns ?? save.guns) {
    if (!gs) continue; const def = gunOf(gs.inst);
    if (!def) throw new Error(`Invalid gun in slot: ${gs.inst}`);
    for (const [slot, inst] of Object.entries(gs.atts)) if (inst && (attachmentDef(inst)?.slot !== slot || !def.slots.includes(slot as never))) throw new Error(`Invalid attachment slot: ${slot}`);
  }
  if (!Number.isSafeInteger(save.money) || save.money < 0 || !validRounds(save.ammo)) throw new Error("Invalid economy state");
  if (save.deployReceipt && (!save.deployReceipt.id || !Number.isSafeInteger(save.deployReceipt.paid) || save.deployReceipt.paid < 0)) throw new Error("Invalid deploy receipt");
  const active = save.activeRaid;
  if (active && (!active.id || ![active.x, active.z, active.elapsed].every(Number.isFinite) || active.elapsed < 0 || !validRounds(active.ammo))) throw new Error("Invalid raid checkpoint");
  if (active) for (const inst of active.consumed) {
    const identity = instanceId(inst);
    if (!identity || seen.has(identity)) throw new Error(`Consumed item still owned or consumed twice: ${inst}`);
    seen.add(identity);
  }
}
export function beginRaid(save: SaveV1, id: string, pack: string[], gear: Gear): SaveV1 {
  if (save.activeRaid) throw new Error("A raid already owns the loadout");
  if (save.settlements?.some(record => record.id === id)) return save;
  const next = identifySave(save);
  delete next.deployReceipt;
  next.activeRaid = { id, pack: [...pack], gear: { ...gear }, guns: structuredClone(next.guns), world: [], consumed: [], x: 0, z: 0, ammo: { ...save.ammo }, elapsed: 0, origin: [], introduced: [] };
  next.activeRaid.origin = ownedItems(next);
  next.activeRaid.rounds = addRounds(save.ammo, itemRounds(ownedItems(next))); next.activeRaid.spentRounds = noRounds();
  rideWager(next, id); // Sal's wager: the stake leaves the wallet as the pod launches (core/gamble.ts)
  validateOwnership(next); return next;
}
const validRounds = (r: unknown): r is Rounds => !!r && typeof r === "object" && CALIBER_IDS.every(c => Number.isSafeInteger((r as Rounds)[c]) && (r as Rounds)[c] >= 0);
/** rounds inside ammo item stacks, per caliber (each ammo item type is its caliber) */
export function itemRounds(items: string[]): Rounds {
  const out = noRounds();
  for (const inst of items) { const def = itemDef(inst), type = itemType(inst); if (def.kind === "ammo" && isCaliber(type)) out[type] += def.stack ?? 8; }
  return out;
}
const addRounds = (...list: Rounds[]): Rounds => { const out = noRounds(); for (const r of list) for (const c of CALIBER_IDS) out[c] += r[c] ?? 0; return out; };
const subRounds = (a: Rounds, b: Rounds): Rounds => { const out = noRounds(); for (const c of CALIBER_IDS) out[c] = (a[c] ?? 0) - (b[c] ?? 0); return out; };
/** an old save's single .45 count as a per-caliber ledger */
export const asRounds = (v: unknown): Rounds => typeof v === "number" ? { ...noRounds(), ammo45: v } : validRounds(v) ? { ...v } : noRounds();
export function checkpointRaid(save: SaveV1, checkpoint: Omit<RaidCheckpoint, "id" | "origin" | "introduced" | "rounds" | "spentRounds">): SaveV1 {
  if (!save.activeRaid) return save;
  const next = structuredClone(save);
  next.activeRaid = { ...save.activeRaid, ...structuredClone(checkpoint) };
  const previous = [...save.activeRaid.origin, ...save.activeRaid.introduced];
  const previousIds = new Set(previous.map(instanceId));
  const present = [...ownedItems(next), ...checkpoint.consumed];
  const presentIds = new Set(present.map(instanceId));
  for (const inst of previous) if (!presentIds.has(instanceId(inst))) throw new Error(`Item disappeared during raid: ${inst}`);
  const introduced = present.filter(inst => !previousIds.has(instanceId(inst)));
  next.activeRaid.introduced = [...save.activeRaid.introduced, ...introduced];
  const rounds = addRounds(checkpoint.ammo, itemRounds(ownedItems(next)));
  const spent = subRounds(addRounds(asRounds(save.activeRaid.rounds ?? addRounds(asRounds(save.activeRaid.ammo), itemRounds(ownedItems(save)))), itemRounds(introduced)), rounds);
  for (const c of CALIBER_IDS) if (spent[c] < 0) throw new Error(`Ammunition appeared without a source: ${c}`);
  next.activeRaid.rounds = rounds; next.activeRaid.spentRounds = addRounds(asRounds(save.activeRaid.spentRounds), spent);
  validateOwnership(next); return next;
}
export function settleRaid(save: SaveV1, reason: string, pouchSlots: number, bonusRate = 0): SaveV1 {
  const active = save.activeRaid;
  if (!active || save.settlements?.some(record => record.id === active.id)) return save;
  validateOwnership(save);
  const next = structuredClone(save), bonked = ["bonked", "quit", "reload"].includes(reason);
  const definition = EXIT_DEFS[reason as ExitId];
  if (!bonked && (!definition || !exitCondition(definition, active.pack, active.elapsed, save.fixtures).open)) throw new Error("Extraction conditions are not met");
  const costs = bonked ? [] : exitCosts(definition, active.pack);
  const slots = bonked ? packStacks(active.pack) : [];
  const kept = bonked ? slots.slice(0, pouchSlots).flat() : active.pack.filter(inst => !costs.includes(inst));
  const lost = bonked ? slots.slice(pouchSlots).flat() : [];
  const abandoned = [...active.world];
  next.gear = { ...active.gear };
  next.guns = structuredClone(active.guns ?? save.guns);
  if (bonked) {
    // Duckov's stakes (brief row 39): every unbound gun and every attachment, the Kingpin's too, go to the satchel; the
    // bound Kingpin stays in its slot. With both slots empty after that, the Kingpin comes off the rack into gun 1
    const kingpin = next.boundWeapons?.kingpin;
    for (const k of [0, 1] as const) {
      const gs = next.guns[k]; if (!gs) continue;
      lost.push(...Object.values(gs.atts).filter((inst): inst is string => !!inst));
      if (gs.inst === kingpin) next.guns[k] = { inst: gs.inst, atts: { ...EMPTY_ATTS } }; else { lost.push(gs.inst); next.guns[k] = null; }
    }
    if (!next.guns[0] && !next.guns[1] && kingpin) next.guns[0] = { inst: kingpin, atts: { ...EMPTY_ATTS } };
    abandoned.push(...(next.satchel?.items ?? []));
    for (const slot of SLOTS) {
      const inst = next.gear[slot];
      if (inst && !equipDef(inst)?.bound) { lost.push(inst); next.gear[slot] = null; }
      if (!next.gear[slot] && BOUND_KIT[slot]) {
        const index = next.locker.findIndex(owned => itemType(owned) === BOUND_KIT[slot]);
        if (index >= 0) next.gear[slot] = next.locker.splice(index, 1)[0];
      }
    }
    next.satchel = lost.length ? { items: [...lost], x: active.x, z: active.z } : null;
  }
  claimDelivery(next);
  for (const inst of kept) {
    if (stashUsed(next) >= stashCapacity(next)) (next.delivery ??= []).push(inst);
    else if (isLockerItem(inst)) next.locker.push(inst); else next.reserved.push(inst);
    const def = itemDef(inst), type = itemType(inst);
    if (def.kind === "key" && !next.keys.includes(type)) next.keys.push(type);
    if (tierAtLeast(def.rarity, "epic") && !next.trophies.includes(type)) next.trophies.push(type);
  }
  const value = kept.reduce((total, inst) => total + itemDef(inst).value, 0), bonus = bonked ? 0 : Math.round(value * bonusRate);
  next.ammo = asRounds(active.ammo); next.raids++;
  if (bonus) credit(next, "bonus", bonus, { raid: active.id });
  if (bonked) next.stats.bonkOuts++; else next.stats.extracts++;
  next.stats.best = Math.max(next.stats.best, value + bonus);
  delete next.activeRaid;
  const remainingRounds = addRounds(next.ammo, itemRounds(ownedItems(next))), abandonedRounds = itemRounds(abandoned), spentRounds = asRounds(active.spentRounds);
  const before = [...active.origin, ...active.introduced], initialRounds = addRounds(save.ammo, itemRounds(before));
  const balance = subRounds(initialRounds, addRounds(remainingRounds, abandonedRounds, spentRounds));
  for (const c of CALIBER_IDS) if (balance[c] !== 0) throw new Error(`Settlement ammunition ledger does not balance: ${c}`);
  const record: Settlement = { id: active.id, reason, kept, lost, abandoned, consumed: [...active.consumed, ...costs], before, after: ownedItems(next), elapsed: active.elapsed, value, bonus, rounds: { before: initialRounds, after: remainingRounds, spent: spentRounds, abandoned: abandonedRounds } };
  const source = record.before.map(instanceId).sort().join();
  const destination = [...record.after, ...record.consumed, ...record.abandoned].map(instanceId).sort().join();
  if (source !== destination) throw new Error("Settlement item ledger does not balance");
  next.settlements = [...(next.settlements ?? []), record];
  validateOwnership(next);
  // the economy between raids (Progression v0.2): Sal judges a wager riding on this raid, every built factory line runs
  // once for it (its own ledger entries), and the black market moves for the next one
  judgeWager(next, record, active.feats ?? []);
  runLines(next, record.id);
  refreshMarket(next);
  validateOwnership(next); return next;
}

// ---------------------------------------------------------------- job payouts (G1.5 row 40; SYSTEMS_PORT E03)
/** Pay a finished job exactly once, through the same item ledger as a raid (Duckov Reward.Claim: claimable and not yet
 *  claimed; ours pays every reward in one atomic step). Works on a copy and returns it with the ledger record, or null
 *  if the job isn't ready or was already paid; nothing changes unless all of it can.
 *   - at home: fetched items leave the stash (reserved / locker / delivery) by instance; reward items get an owned
 *     identity and arrive through delivery (claimDelivery: into the stash while there's room);
 *   - in a raid (a raid NPC, raid.pack = the live pack): fetched items leave the pack into activeRaid.consumed, reward
 *     items join the pack (or the ground beside you when it's full: raid.drop), and the next checkpoint records them as
 *     introduced. The returned pack is the new live pack.
 *  The ledger balances: before - consumed + granted = after, by instance id. */
export function payQuest(save: SaveV1, id: string, raid?: { pack: readonly string[]; slots: number }): { save: SaveV1; record: QuestPayout; pack?: string[]; drop: string[] } | null {
  const def = questOf(id);
  if (!def || def.turnIn !== (raid ? "raid" : "home") || !!raid !== !!save.activeRaid) return null;
  const items = raid ? raid.pack : homeItems(save);
  if (questStatus(save, id, items) !== "ready" || save.quests?.ledger.some(r => r.quest === id)) return null;
  const next = structuredClone(save), q = qs(next);
  const before = raid ? [...raid.pack] : ownedItems(next);
  const pack = raid ? [...raid.pack] : undefined;
  const consumed: string[] = [], granted: string[] = [], drop: string[] = [], unlocks: string[] = [];
  const takeOne = (type: string) => {
    if (pack) { const i = pack.findIndex(inst => itemType(inst) === type); return i >= 0 ? pack.splice(i, 1)[0] : null; }
    for (const list of [next.reserved, next.locker, next.delivery ?? []]) { const i = list.findIndex(inst => itemType(inst) === type && !equipDef(inst)?.bound); if (i >= 0) return list.splice(i, 1)[0]; }
    return null;
  };
  for (const t of def.tasks) if (t.t === "fetch") for (let k = 0; k < t.n; k++) { const inst = takeOne(t.item); if (!inst) return null; consumed.push(inst); }
  let money = 0;
  for (const r of def.rewards) {
    if (r.t === "money") { credit(next, "quest", r.n, { note: id, ...(next.activeRaid ? { raid: next.activeRaid.id } : {}) }); money += r.n; }
    else if (r.t === "unlock") { if (!q.unlocks.includes(r.key)) q.unlocks.push(r.key); unlocks.push(r.key); if (r.key === "flag:salMovedIn") next.salMovedIn = true; }
    else for (let k = 0; k < r.n; k++) {
      const inst = own(r.item); granted.push(inst);
      if (pack) { if (fitsInPack(pack, raid!.slots, inst)) pack.push(inst); else drop.push(inst); }
      else (next.delivery ??= []).push(inst);
    }
  }
  q.active = q.active.filter(a => a !== id); q.done.push(id);
  if (q.tracked === id) q.tracked = q.active[0] ?? null;
  for (let i = 0; i < def.tasks.length; i++) delete q.progress[`${id}/${i}`];
  const record: QuestPayout = { quest: id, at: raid ? "raid" : "home", ...(next.activeRaid ? { raid: next.activeRaid.id } : {}), consumed, granted, money, unlocks };
  q.ledger.push(record);
  if (pack && next.activeRaid) {
    next.activeRaid.pack = [...pack]; next.activeRaid.consumed = [...next.activeRaid.consumed, ...consumed]; next.activeRaid.world = [...next.activeRaid.world, ...drop];
  } else claimDelivery(next);
  const after = pack ? [...pack, ...drop] : ownedItems(next);
  const balance = (list: string[]) => list.map(instanceId).sort().join();
  if (balance([...before.filter(inst => !consumed.includes(inst)), ...granted]) !== balance(after)) throw new Error("Job payout ledger does not balance");
  validateOwnership(next);
  return { save: next, record, pack, drop };
}
