// Equipment UI pieces shared by the raid pack screen (Tab) and the bunker locker (G1-23). Gear is loot in five
// Duckov-style slots; the rules and numbers live in loot/equipment.ts, the actions in loot/equipment-actions.ts.
// Read-only helpers here: what a piece does, its condition and the armor / carry totals. The screens that show
// them are ui/lootview.ts (Tab, looting, the locker) and the item tag copy in ui/itemcopy.ts.
import type { Gear, WearSlot } from "../contracts";
import { G } from "../core/state";
import { PLAYER } from "../combat/weapons";
import { SLOTS, equipDef, gearStats, isEquip, parseInst, repairCost } from "../loot/equipment";
import { itemDef } from "../loot/raidloot";

export const SLOT_NAME: Record<WearSlot, string> = { head: "Head", face: "Face", body: "Body", back: "Back", ears: "Ears" };
const pct = (k: number) => `${Math.round(k * 100)}%`;

/** what a piece does, in plain words (one line per effect) */
export function equipLines(inst: string): string[] {
  const d = equipDef(inst); if (!d) return [];
  const p = d.perk ?? {}, out: string[] = [], broken = d.dur !== undefined && (parseInst(inst)?.dur ?? 100) <= 0;
  if (d.headArmor) out.push(`Head armor ${d.headArmor}${broken ? " (broken)" : ""}: guards against critical hits`);
  if (d.bodyArmor) out.push(`Body armor ${d.bodyArmor}${broken ? " (broken)" : ""}`);
  if (d.packSlots) out.push(`${d.packSlots} more pack slot${d.packSlots > 1 ? "s" : ""}`);
  if (d.maxWeight) out.push(`Carry ${d.maxWeight} kg more`);
  if (p.crit) out.push(`Critical hit chance +${pct(p.crit)}`);
  if (p.critDmg) out.push(`Critical hits do ${pct(p.critDmg)} more`);
  if (p.aim) out.push(`Aim assist +${p.aim}°`);
  if (p.notice) out.push(p.notice < 1 ? `Enemies spot you ${pct(1 - p.notice)} later` : `Enemies spot you ${pct(p.notice - 1)} sooner`);
  if (p.search) out.push(`Search crates ${pct(1 - p.search)} faster`);
  if (p.heal) out.push(`Heals restore ${pct(p.heal - 1)} more`);
  if (p.hearing) out.push(`See footsteps within ${p.hearing} m`);
  if (p.speed) out.push(p.speed < 1 ? `Move ${pct(1 - p.speed)} slower` : `Move ${pct(p.speed - 1)} faster`);
  if (!out.length) out.push("Just looks sharp");
  return out;
}
/** durability 0..1, or null when the piece has none */
export function condition(inst: string | null | undefined): number | null {
  const d = equipDef(inst ?? undefined); if (!d || d.dur === undefined || !inst) return null;
  return (parseInst(inst)?.dur ?? 100) / 100;
}
/** armor and carry totals for the summary row */
export function gearSummary(gear: Gear) {
  const s = gearStats(gear), limit = PLAYER.maxWeight + 4 * G.save.upgrades.pack + s.maxWeight;
  return { head: s.headArmor, body: s.bodyArmor, limit, hearing: s.hearing };
}
export const carryLimit = () => gearSummary(G.gear).limit;
/** what a full repair of worn + locker gear would cost */
export function repairBill(gear: Gear, locker: string[]) {
  return [...SLOTS.map((s) => gear[s]), ...locker].reduce((a, inst) => a + (inst ? repairCost(inst) : 0), 0);
}
