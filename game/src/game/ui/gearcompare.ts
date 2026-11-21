import type { Gear, GunSlots } from "../contracts";
import { equipDef, gearStats } from "../loot/equipment";
import { itemDef } from "../loot/tables";
import { gunOf } from "../combat/guns";
import { statsFor } from "../combat/gunstats";

export type Comparison = { current: string; candidate: string; rows: { label: string; before: number; after: number; delta: number; unit: string; good: boolean }[] };
export function gunComparisons(inst: string, guns: GunSlots): Comparison[] {
  const candidate = gunOf(inst); if (!candidate) return [];
  const next = statsFor(candidate, { sight: null, muzzle: null, mag: null, laser: null, grip: null, stock: null });
  return guns.flatMap((gun, i) => {
    const current = gunOf(gun?.inst); if (!gun || !current || gun.inst === inst) return [];
    const old = statsFor(current, gun.atts);
    const rows = [
      { label: "Damage / shot", before: current.damage, after: candidate.damage, unit: "", lower: false },
      { label: "Shots / second", before: 1 / current.interval, after: 1 / candidate.interval, unit: "", lower: false },
      { label: "Magazine", before: old.mag, after: next.mag, unit: "", lower: false },
      { label: "Range", before: old.range, after: next.range, unit: " m", lower: false },
      { label: "Reload time", before: old.reload, after: next.reload, unit: " s", lower: true },
      { label: "Item weight", before: current.weight, after: candidate.weight, unit: " kg", lower: true },
    ].map(row => ({ ...row, delta: row.after - row.before, good: row.lower ? row.after < row.before : row.after > row.before }));
    return [{ current: `Gun ${i + 1} · ${current.name} (fitted)`, candidate: `${candidate.name} (unfitted)`, rows }];
  });
}

export function equipmentComparison(inst: string, gear: Gear) {
  const def = equipDef(inst); if (!def || gear[def.slot] === inst) return null;
  const current = gear[def.slot], before = gearStats(gear), after = gearStats({ ...gear, [def.slot]: inst });
  const fields: { key: keyof typeof before; label: string; scale?: number; unit?: string; lower?: boolean }[] = [
    { key: "headArmor", label: "Head armor" }, { key: "bodyArmor", label: "Body armor" },
    { key: "packSlots", label: "Extra pack slots" }, { key: "maxWeight", label: "Extra carry", unit: " kg" },
    { key: "crit", label: "Critical chance", scale: 100, unit: "%" }, { key: "critDmg", label: "Critical damage", scale: 100, unit: "%" },
    { key: "aim", label: "Aim assist", unit: "°" }, { key: "notice", label: "Enemy detection", scale: 100, unit: "%", lower: true },
    { key: "search", label: "Search time", scale: 100, unit: "%", lower: true }, { key: "heal", label: "Healing", scale: 100, unit: "%" },
    { key: "hearing", label: "Hearing", unit: " m" }, { key: "speed", label: "Move speed", scale: 100, unit: "%" },
  ];
  const rows = fields.filter(f => Math.abs(after[f.key] - before[f.key]) > 1e-6).map(f => {
    const a = before[f.key] * (f.scale ?? 1), b = after[f.key] * (f.scale ?? 1), delta = b - a;
    return { label: f.label, before: a, after: b, delta, unit: f.unit ?? "", good: f.lower ? delta < 0 : delta > 0 };
  });
  const oldWeight = current ? itemDef(current).weight ?? 0 : 0, newWeight = itemDef(inst).weight ?? 0;
  if (Math.abs(oldWeight - newWeight) > 1e-6) rows.push({ label: "Item weight", before: oldWeight, after: newWeight, delta: newWeight - oldWeight, unit: " kg", good: newWeight < oldWeight });
  return { current: current ? itemDef(current).name : "Empty slot", candidate: itemDef(inst).name, rows };
}
