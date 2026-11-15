import type { Gear, GunAtts, SaveV1 } from "../contracts";
import { BOUND_KIT, SLOTS, equipDef } from "../loot/equipment";
import { instanceId, own, itemType } from "../loot/instances";
import { itemDef } from "../loot/tables";
import { ATT_SLOTS, EMPTY_GUN, attachmentDef, isAttachment } from "../loot/attachments";
import { EXIT_DEFS, exitCondition, exitCosts, type ExitId } from "../world/extraction";
import { stashCapacity, stashUsed } from "../home/facilities";

export type RaidCheckpoint = {
  id: string; pack: string[]; gear: Gear; gun?: GunAtts; world: string[]; consumed: string[];
  x: number; z: number; ammo: number; elapsed: number;
  origin: string[]; introduced: string[];
  rounds?: number; spentRounds?: number;
};
export type Settlement = {
  id: string; reason: string; kept: string[]; lost: string[]; consumed: string[]; abandoned: string[];
  before: string[]; after: string[]; elapsed: number; value: number; bonus: number;
  rounds: { before: number; after: number; spent: number; abandoned: number };
};
export function ownedItems(save: SaveV1): string[] {
  return [...Object.values(save.boundWeapons ?? {}), ...save.locker, ...save.reserved, ...(save.delivery ?? []), ...(save.satchel?.items ?? []),
    ...Object.values(save.activeRaid?.gun ?? save.gun).filter((inst): inst is string => !!inst),
    ...(save.activeRaid ? [...save.activeRaid.pack, ...Object.values(save.activeRaid.gear).filter((inst): inst is string => !!inst), ...save.activeRaid.world] : Object.values(save.gear).filter((inst): inst is string => !!inst))];
}
export function identifySave(save: SaveV1): SaveV1 {
  const next = structuredClone(save);
  next.boundWeapons = { kingpin: own(next.boundWeapons?.kingpin ?? "kingpin"), briefcase: own(next.boundWeapons?.briefcase ?? "briefcase") };
  for (const slot of SLOTS) if (next.gear[slot]) next.gear[slot] = own(next.gear[slot]!);
  for (const slot of ATT_SLOTS) if (next.gun[slot]) next.gun[slot] = own(next.gun[slot]!);
  next.locker = next.locker.map(own); next.reserved = next.reserved.map(own);
  if (next.delivery) next.delivery = next.delivery.map(own);
  if (next.satchel) next.satchel.items = next.satchel.items.map(own);
  return next;
}
export function claimDelivery(save: SaveV1) {
  while (save.delivery?.length && stashUsed(save) < stashCapacity(save)) {
    const inst = save.delivery.shift()!;
    if (equipDef(inst) || isAttachment(inst)) save.locker.push(inst); else save.reserved.push(inst);
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
  for (const [slot, inst] of Object.entries(save.activeRaid?.gun ?? save.gun)) if (inst && attachmentDef(inst)?.slot !== slot) throw new Error(`Invalid attachment slot: ${slot}`);
  if (!Number.isSafeInteger(save.money) || save.money < 0 || !Number.isSafeInteger(save.ammo) || save.ammo < 0) throw new Error("Invalid economy state");
  if (save.deployReceipt && (!save.deployReceipt.id || !Number.isSafeInteger(save.deployReceipt.paid) || save.deployReceipt.paid < 0)) throw new Error("Invalid deploy receipt");
  const active = save.activeRaid;
  if (active && (!active.id || ![active.x, active.z, active.elapsed].every(Number.isFinite) || active.elapsed < 0 || !Number.isSafeInteger(active.ammo) || active.ammo < 0)) throw new Error("Invalid raid checkpoint");
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
  next.activeRaid = { id, pack: [...pack], gear: { ...gear }, gun: { ...next.gun }, world: [], consumed: [], x: 0, z: 0, ammo: save.ammo, elapsed: 0, origin: [], introduced: [] };
  next.activeRaid.origin = ownedItems(next);
  next.activeRaid.rounds = save.ammo + itemRounds(ownedItems(next)); next.activeRaid.spentRounds = 0;
  validateOwnership(next); return next;
}
const itemRounds = (items: string[]) => items.reduce((sum, inst) => sum + (itemDef(inst).kind === "ammo" ? itemDef(inst).stack ?? 8 : 0), 0);
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
  const rounds = checkpoint.ammo + itemRounds(ownedItems(next));
  const spent = (save.activeRaid.rounds ?? save.activeRaid.ammo + itemRounds(ownedItems(save))) + itemRounds(introduced) - rounds;
  if (spent < 0) throw new Error("Ammunition appeared without a source");
  next.activeRaid.rounds = rounds; next.activeRaid.spentRounds = (save.activeRaid.spentRounds ?? 0) + spent;
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
  const kept = bonked ? active.pack.slice(0, pouchSlots) : active.pack.filter(inst => !costs.includes(inst));
  const lost = bonked ? active.pack.slice(pouchSlots) : [];
  const abandoned = [...active.world];
  next.gear = { ...active.gear };
  next.gun = { ...(active.gun ?? save.gun) };
  if (bonked) {
    lost.push(...Object.values(next.gun).filter((inst): inst is string => !!inst)); next.gun = { ...EMPTY_GUN };
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
    else if (equipDef(inst) || isAttachment(inst)) next.locker.push(inst); else next.reserved.push(inst);
    const def = itemDef(inst), type = itemType(inst);
    if (def.kind === "key" && !next.keys.includes(type)) next.keys.push(type);
    if (def.rarity === "epic" && !next.trophies.includes(type)) next.trophies.push(type);
  }
  const value = kept.reduce((total, inst) => total + itemDef(inst).value, 0), bonus = bonked ? 0 : Math.round(value * bonusRate);
  next.ammo = active.ammo; next.money += bonus; next.raids++;
  if (bonked) next.stats.bonkOuts++; else next.stats.extracts++;
  next.stats.best = Math.max(next.stats.best, value + bonus);
  delete next.activeRaid;
  const remainingRounds = next.ammo + itemRounds(ownedItems(next)), abandonedRounds = itemRounds(abandoned), spentRounds = active.spentRounds ?? 0;
  const before = [...active.origin, ...active.introduced], initialRounds = save.ammo + itemRounds(before);
  if (initialRounds !== remainingRounds + abandonedRounds + spentRounds) throw new Error("Settlement ammunition ledger does not balance");
  const record: Settlement = { id: active.id, reason, kept, lost, abandoned, consumed: [...active.consumed, ...costs], before, after: ownedItems(next), elapsed: active.elapsed, value, bonus, rounds: { before: initialRounds, after: remainingRounds, spent: spentRounds, abandoned: abandonedRounds } };
  const source = record.before.map(instanceId).sort().join();
  const destination = [...record.after, ...record.consumed, ...record.abandoned].map(instanceId).sort().join();
  if (source !== destination) throw new Error("Settlement item ledger does not balance");
  next.settlements = [...(next.settlements ?? []), record];
  validateOwnership(next); return next;
}
