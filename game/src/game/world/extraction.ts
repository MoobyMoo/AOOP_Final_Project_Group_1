import { itemType } from "../loot/instances";

export type ExitId = "hatch" | "raft" | "tunnel" | "boat";
export type ExitRequirement = { kind: "item"; item: string; consume: boolean } | { kind: "boss"; flag: string } | { kind: "timed"; from: number; until: number };
export type ExitDef = { id: ExitId; dwellSeconds: number; requirements: ExitRequirement[]; interruptOnDamage: boolean };
export const EXIT_DEFS: Record<ExitId, ExitDef> = {
  hatch: { id: "hatch", dwellSeconds: 5, requirements: [], interruptOnDamage: false },
  boat: { id: "boat", dwellSeconds: 5, requirements: [{ kind: "item", item: "oar", consume: false }], interruptOnDamage: false },
  raft: { id: "raft", dwellSeconds: 5, requirements: [], interruptOnDamage: false },
  tunnel: { id: "tunnel", dwellSeconds: 5, requirements: [], interruptOnDamage: false },
};
export function exitCondition(def: ExitDef, items: readonly string[], elapsed: number, flags: readonly string[] = []): { open: boolean; reason: string } {
  for (const requirement of def.requirements) {
    if (requirement.kind === "item" && !items.some(inst => itemType(inst) === requirement.item)) return { open: false, reason: `needs an ${requirement.item.replaceAll("_", " ")}` };
    if (requirement.kind === "boss" && !flags.includes(requirement.flag)) return { open: false, reason: "defeat the boss first" };
    if (requirement.kind === "timed" && (elapsed < requirement.from || elapsed > requirement.until)) return { open: false, reason: `open ${requirement.from}–${requirement.until}s` };
  }
  return { open: true, reason: "ready" };
}
export function advanceExit(def: ExitDef, progress: number, dt: number, state: { inside: boolean; alive: boolean; open: boolean; damaged?: boolean }): number {
  return !state.inside || !state.alive || !state.open || (state.damaged && def.interruptOnDamage) ? 0 : Math.min(def.dwellSeconds, progress + Math.max(0, dt));
}
export function exitCosts(def: ExitDef, items: readonly string[]): string[] {
  return def.requirements.flatMap(requirement => requirement.kind === "item" && requirement.consume ? items.filter(inst => itemType(inst) === requirement.item).slice(0, 1) : []);
}
