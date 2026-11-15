import type { Gear, WearSlot } from "../contracts";
import { G, flat } from "../core/state";
import { save } from "../core/save";
import { armorMult } from "../combat/weapons";
import { attachmentDef } from "./attachments";
import { BOUND_KIT, EQUIP_MOVE, EQUIP_TIME, SLOTS, equipDef, fmtInst, gearStats, parseInst, repairCost, saleValue, visualGear, wear } from "./equipment";

export { EQUIP_MOVE };
const currentGear = () => G.scene === "bunker" ? G.save.gear : G.gear;
const capacity = (gear: Gear) => 8 + 2 * G.save.upgrades.pack + gearStats(gear).packSlots;
const event = (entry: typeof G.equipmentEvents[number]) => {
  G.equipmentEvents.push(entry);
  if (G.equipmentEvents.length > 64) G.equipmentEvents.shift();
};
function returnBound(inst: string) {
  if (!G.save.locker.some(owned => equipDef(owned)?.id === equipDef(inst)?.id)) G.save.locker.push(inst);
}
export function refreshEquipment() {
  const gear = currentGear();
  G.packSlots = capacity(gear);
  G.rig?.setGear?.(gear); // raw instances everywhere: the rig strips "#dur" and dulls broken pieces
}
export function drainEquipmentEvents() { return G.equipmentEvents.splice(0); }
export function interruptEquip() {
  if (!G.equipping) return;
  event({ type: "interrupted", slot: G.equipping.slot, inst: G.equipping.inst });
  G.equipping = null;
}
function canSwap(inst: string, source: "pack" | "worn"): boolean {
  const def = equipDef(inst);
  if (!def) return false;
  const old = G.gear[def.slot];
  const next = { ...G.gear, [def.slot]: source === "pack" ? inst : null };
  const count = G.pack.length + (source === "pack" ? -1 : 0) + (old && !equipDef(old)?.bound ? 1 : 0);
  return count <= capacity(next);
}
export function equipFromPack(index: number): boolean {
  const inst = G.pack[index], def = equipDef(inst);
  if (!Number.isInteger(index) || !def || def.bound || G.scene !== "raid" || !G.alive || G.equipping || G.rollT >= 0 || G.useItem || G.zipping || !canSwap(inst, "pack")) return false;
  G.equipping = { inst, slot: def.slot, source: "pack", t: 0, time: EQUIP_TIME };
  return true;
}
export function unequip(slot: WearSlot): boolean {
  if (!SLOTS.includes(slot)) return false;
  const gear = currentGear(), inst = gear[slot];
  if (!inst) return false;
  if (G.scene === "bunker") {
    if (equipDef(inst)?.bound) returnBound(inst); else G.save.locker.push(inst);
    G.save.gear = { ...gear, [slot]: null }; G.gear = { ...G.save.gear };
    refreshEquipment(); save(G.save); return true;
  }
  if (G.scene !== "raid" || !G.alive || G.equipping || G.rollT >= 0 || G.useItem || G.zipping || !canSwap(inst, "worn")) return false;
  G.equipping = { inst, slot, source: "worn", t: 0, time: EQUIP_TIME };
  return true;
}
export function updateEquipment(dt: number) {
  const action = G.equipping;
  if (!action) return;
  if (G.scene !== "raid" || !G.alive || G.rollT >= 0 || G.zipping) { interruptEquip(); return; }
  action.t += dt;
  if (action.t < action.time) return;
  const index = G.pack.indexOf(action.inst);
  if ((action.source === "pack" ? index < 0 : G.gear[action.slot] !== action.inst) || !canSwap(action.inst, action.source)) { interruptEquip(); return; }
  const old = G.gear[action.slot];
  if (action.source === "pack") G.pack.splice(index, 1);
  if (old) { if (equipDef(old)?.bound) returnBound(old); else G.pack.push(old); }
  G.gear = { ...G.gear, [action.slot]: action.source === "pack" ? action.inst : null };
  G.equipping = null;
  refreshEquipment(); event({ type: "equipped", slot: action.slot, inst: action.inst });
}
export function collectEquipment(inst: string): "packed" | "equipping" | "full" {
  const def = equipDef(inst);
  if (!def || def.bound || G.pack.length >= G.packSlots) return "full";
  G.pack.push(inst);
  if (!G.gear[def.slot] && equipFromPack(G.pack.length - 1)) return "equipping";
  return "packed";
}
export function protectPlayerHit(rawDamage: number, crit: boolean): number {
  interruptEquip();
  const stats = gearStats(G.gear), armor = crit ? stats.headArmor : stats.bodyArmor;
  const damage = Math.max(1, Math.round(rawDamage * armorMult(armor)));
  if (armor > 0) for (const slot of crit ? ["head", "face"] as const : ["body"] as const) {
    const inst = G.gear[slot], def = equipDef(inst);
    if (!inst || !def || (crit ? def.headArmor ?? 0 : def.bodyArmor ?? 0) <= 0) continue;
    const next = wear(inst, rawDamage);
    G.gear[slot] = next;
    if (parseInst(inst)!.dur > 0 && parseInst(next)!.dur === 0) event({ type: "broken", slot, inst: next, message: slot === "head" ? "Helmet cracked!" : slot === "face" ? "Face armor cracked!" : "Body armor cracked!" });
  }
  event({ type: "hit", crit, damage });
  return damage;
}
export function equipFromLocker(index: number): boolean {
  if (G.scene !== "bunker" || !Number.isInteger(index)) return false;
  const inst = G.save.locker[index], def = equipDef(inst);
  if (!def) return false;
  G.save.locker.splice(index, 1);
  const old = G.save.gear[def.slot];
  if (old) { if (equipDef(old)?.bound) returnBound(old); else G.save.locker.push(old); }
  G.save.gear = { ...G.save.gear, [def.slot]: inst }; G.gear = { ...G.save.gear };
  refreshEquipment(); save(G.save); return true;
}
export function stash(index: number): boolean {
  if (G.scene !== "bunker" || !Number.isInteger(index) || !equipDef(G.pack[index])) return false;
  const inst = G.pack.splice(index, 1)[0];
  if (equipDef(inst)?.bound) returnBound(inst); else G.save.locker.push(inst);
  save(G.save); return true;
}
export function sellEquip(index: number): number {
  if (G.scene !== "bunker" || !Number.isInteger(index)) return 0;
  const inst = G.save.locker[index], def = equipDef(inst), att = attachmentDef(inst);
  if ((!def || def.bound) && !att) return 0;
  const value = att ? att.value : saleValue(inst);
  G.save.locker.splice(index, 1); G.save.money += value; save(G.save);
  return value;
}
export function repair(slot: WearSlot): boolean {
  if (G.scene !== "bunker" || !SLOTS.includes(slot)) return false;
  const inst = G.save.gear[slot], cost = inst ? repairCost(inst) : 0;
  if (!inst || cost <= 0 || G.save.money < cost) return false;
  G.save.money -= cost; G.save.gear[slot] = fmtInst(inst); G.gear = { ...G.save.gear };
  refreshEquipment(); save(G.save); return true;
}
export function repairAll(): number {
  if (G.scene !== "bunker") return 0;
  const cost = [...Object.values(G.save.gear), ...G.save.locker].reduce<number>((total, inst) => total + (inst ? repairCost(inst) : 0), 0);
  if (!cost || G.save.money < cost) return 0;
  G.save.money -= cost;
  for (const slot of SLOTS) if (G.save.gear[slot] && repairCost(G.save.gear[slot]!) > 0) G.save.gear[slot] = fmtInst(G.save.gear[slot]!);
  G.save.locker = G.save.locker.map(inst => repairCost(inst) > 0 ? fmtInst(inst) : inst); G.gear = { ...G.save.gear };
  refreshEquipment(); save(G.save); return cost;
}
export function heardEnemies(): { id: number; x: number; z: number }[] {
  if (G.scene !== "raid") return [];
  const range = gearStats(G.gear).hearing;
  return range > 0 ? G.enemies.filter(enemy => !enemy.down && enemy.vel.lengthSq() > 0.25 && flat(enemy.p, G.pp) <= range).map(enemy => ({ id: enemy.id, x: enemy.p.x, z: enemy.p.z })) : [];
}
export function loseWornEquipment(): string[] {
  interruptEquip();
  const lost: string[] = [];
  for (const slot of SLOTS) {
    const inst = G.gear[slot];
    if (!inst || equipDef(inst)?.bound) continue;
    lost.push(inst); G.gear[slot] = null;
  }
  refreshEquipment(); return lost;
}
export function restoreBoundKit() {
  for (const slot of SLOTS) {
    const starter = BOUND_KIT[slot];
    if (G.gear[slot] || !starter) continue;
    const index = G.save.locker.findIndex(inst => equipDef(inst)?.id === starter);
    if (index >= 0) G.gear[slot] = G.save.locker.splice(index, 1)[0];
  }
}
export function betterEquipment(candidate: string, worn: string | null): boolean {
  const def = equipDef(candidate);
  if (!def || def.bound) return false;
  if (!worn) return true;
  const other = equipDef(worn), condition = parseInst(candidate)!.dur > 0, oldCondition = parseInst(worn)!.dur > 0;
  const armor = condition ? (def.headArmor ?? 0) + (def.bodyArmor ?? 0) : 0;
  const oldArmor = oldCondition ? (other?.headArmor ?? 0) + (other?.bodyArmor ?? 0) : 0;
  return armor > oldArmor || (armor === oldArmor && (def.packSlots ?? 0) > (other?.packSlots ?? 0));
}
