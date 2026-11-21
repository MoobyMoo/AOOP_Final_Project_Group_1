import type { SaveV1 } from "../contracts";
import type { Settlement } from "./settlement";
import { homeItems, qs, questOf, taskProgress, rewardText } from "./quests";
import { equipDef } from "../loot/equipment";
import { itemDef } from "../loot/tables";
import { itemType } from "../loot/instances";

export type RaidReport = { cashChange: number; jobs: { title: string; status: string; tasks: string[] }[]; unlocks: string[]; accessories: string[] };
type Baseline = { cash: number; progress: Record<string, number>; active: string[]; done: string[]; unlocks: string[]; accessories: string[] };
let before: Baseline | null = null;
export function beginRaidReport(save: SaveV1, pack: readonly string[]) {
  const s = qs(save), progress: Record<string, number> = {};
  for (const id of s.active) {
    const q = questOf(id)!;
    q.tasks.forEach((_, i) => { progress[`${id}/${i}`] = taskProgress(save, q, i, q.turnIn === "raid" ? pack : undefined).have; });
  }
  before = { cash: save.money, progress, active: [...s.active], done: [...s.done], unlocks: [...s.unlocks], accessories: [...homeItems(save), ...Object.values(save.activeRaid?.gear ?? save.gear).filter((i): i is string => !!i), ...pack].map(itemType) };
}
export function finishRaidReport(save: SaveV1, settlement: Settlement): RaidReport {
  const s = qs(save), base = before;
  const jobs = [...new Set([...(base?.active ?? []), ...s.active, ...s.done.filter(id => !base?.done.includes(id))])].flatMap(id => {
    const q = questOf(id); if (!q) return [];
    const tasks = q.tasks.flatMap((task, i) => {
      const progress = taskProgress(save, q, i, q.turnIn === "raid" ? settlement.kept : undefined), old = base?.progress[`${id}/${i}`] ?? 0;
      return progress.have !== old ? [`${task.text}: ${old} → ${progress.have}/${progress.need}`] : [];
    });
    if (!tasks.length && !s.done.includes(id)) return [];
    const ready = q.tasks.every((_, i) => taskProgress(save, q, i, q.turnIn === "raid" ? settlement.kept : undefined).ok);
    return [{ title: q.title, status: s.done.includes(id) ? "Completed" : ready ? (q.turnIn === "raid" ? "Take supplies to the Keeper" : "Ready to hand in") : "In progress", tasks }];
  });
  const newKeys = s.unlocks.filter(key => !base?.unlocks.includes(key));
  const unlocks = newKeys.map(key => {
    for (const id of s.done) { const reward = questOf(id)?.rewards.find(r => r.t === "unlock" && r.key === key); if (reward) return rewardText(reward); }
    return key.replaceAll(":", " · ");
  });
  const accessories = [...new Set([...settlement.kept, ...Object.values(save.gear).filter((i): i is string => !!i)].filter(inst => {
    const def = equipDef(inst); return def && (def.slot === "face" || def.slot === "ears") && !(base?.accessories ?? []).includes(itemType(inst));
  }).map(inst => itemDef(inst).name))];
  return { cashChange: base ? save.money - base.cash : settlement.bonus, jobs, unlocks, accessories };
}
