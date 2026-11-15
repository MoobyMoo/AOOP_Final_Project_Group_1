// Jobs (G1.5 row 40; SYSTEMS_PORT E03, E01 stock unlocks, R01 destination prerequisites). Data and rules only, no
// three.js and no DOM: story/ draws the NPCs, dialogue and quest log; core/settlement.ts payQuest() pays a finished job
// through the item ledger; core/save.ts persists QuestSave.
//
// Duckov mechanism, ported (Quest / Task / Reward / QuestManager, research/duckov-re):
//  - a quest is available when every prerequisite quest is finished and its extra conditions hold (MeetsPrerequisit);
//  - it completes when every task is finished (AreTasksFinished); task status is saved per task;
//  - task types: submit items (counted when you hand them in, consumed then), kill counts (only while the quest is
//    active, optionally in a given scene), reach a location, evacuate, build, use an item (ours: read a note);
//  - each reward has its own claimed state and pays once (Reward.Claim: claimable && !claimed); rewards include
//    money, items and shop-stock unlocks; a finished task queues a notice.
// Ours: rewards pay together at the turn-in, in one atomic transaction with a ledger record (payQuest). Event credit
// is de-duplicated per raid (extracts by settlement id; knockouts by enemy id inside the raid that saw them).
import type { SaveV1 } from "../contracts";
import { itemType } from "../loot/instances";

export type NpcId = "sal" | "fence" | "radio" | "keeper";
export type KoKind = "wild" | "bandit" | "brute" | "boss";
export type TaskDef =
  | { t: "fetch"; item: string; n: number; text: string; where?: string }
  | { t: "extract"; dest?: string; n: number; text: string }
  | { t: "visit"; area: string; text: string }
  | { t: "ko"; kind: KoKind; n: number; text: string }
  | { t: "note"; note: string; text: string; where?: string }
  | { t: "build"; facility: string; text: string };
/** unlock keys: dest:<destination id>, stock:<item id> (Sal's shop), fac:<facility id>, secret:<id>. flag:salMovedIn
 *  sets the old save flag (Sal's shop opens and his neon sign lights) */
export type RewardDef = { t: "money"; n: number } | { t: "item"; item: string; n: number } | { t: "unlock"; key: string; text: string };
export type QuestDef = {
  id: string; giver: NpcId; title: string;
  /** one line for the quest log and the tracker */
  brief: string;
  /** the giver's pitch (1-3 short lines), the line while you're on it, and the thanks */
  offer: string[]; progress: string; done: string[];
  /** finished quests this one needs (all of them) */
  requires: string[];
  /** where you hand it in: at home (the stash) or to a raid NPC (from your pack) */
  turnIn: "home" | "raid";
  tasks: TaskDef[]; rewards: RewardDef[];
  /** the Radio Operator's hint when you start a raid with this job tracked */
  hint?: string;
};

// ---------------------------------------------------------------- the first-hour chain (about 8 jobs)
// Sal teaches the loop (loot, extract, sell, build) and opens the plantation road; the Radio Operator opens the cove
// and the ammo press; Sal points at the boss; the Grove Keeper points at a secret.
export const QUESTS: QuestDef[] = [
  { id: "sal_roadmap", giver: "sal", title: "Scout the Plantation Road", turnIn: "home", requires: [],
    brief: "Find the foreman's road map in the beach checkpoint's guard hut and bring it home to Sal.",
    offer: ["New fish! Name's Sal. Smuggler, fixer, notary. Mostly smuggler.", "The pod only flies where we've got a map. The foreman's guards keep one in their hut up the beach road.", "Coat pocket, if I know guards. Grab it, grab anything else, and get home down the hatch."],
    progress: "Guard hut, coat on the wall, map in the coat. Guards are predictable. That's why they're guards.",
    done: ["Old Plantation Road, right there on the board. The fare's twenty.", "Tell the foreman Sal says hi. Actually, don't."],
    tasks: [{ t: "fetch", item: "road_map", n: 1, text: "The foreman's road map in your stash", where: "the guard's coat in the checkpoint hut, north of the hatch" }],
    rewards: [{ t: "unlock", key: "dest:plantation", text: "Old Plantation Road on the Banana Express" }, { t: "money", n: 20 }],
    hint: "Road map's in the checkpoint guard's coat. The hut's just up the road from the hatch." },
  { id: "sal_office", giver: "sal", title: "Office Space", turnIn: "home", requires: ["sal_roadmap"],
    brief: "Take the pod to the Old Plantation Road and come home, then build Sal a desk.",
    offer: ["Rule one: the island pays whoever gets home. Rule two: further out pays more.", "Take the pod inland, come back alive. Sell what you bring at the Fence.", "Then build me a desk. I don't do business standing up."],
    progress: "Pod, plantation road, hatch, Fence, desk. In that order. Write it on your hand.",
    done: ["A desk! With drawers! I'm moved. Emotionally. Not physically, I'm already here."],
    tasks: [
      { t: "extract", dest: "plantation", n: 1, text: "Come home from the Old Plantation Road" },
      { t: "build", facility: "sal", text: "Build Sal's Corner Desk (sell loot at the Fence's window first)" },
    ],
    rewards: [{ t: "money", n: 25 }],
    hint: "Further from the hatch means better crates. It also means further to run. Run anyway." },
  { id: "sal_supplies", giver: "sal", title: "Office Supplies", turnIn: "home", requires: ["sal_office"],
    brief: "Bring Sal 3 Vine Rope and 1 Old Gear so he can open his shop.",
    offer: ["Every shop needs stock. Three vine ropes and one old gear.", "Don't ask what for. I won't tell you what for."],
    progress: "Rope and a gear. Crates, toolboxes, bandit pockets. Be creative.",
    done: ["Shop's open! Ammo, bandages, smoothies. Cash only.", "Also, my cousin runs a radio. He'll need a desk. Blueprint's yours."],
    tasks: [
      { t: "fetch", item: "vine_rope", n: 3, text: "Vine Rope in your stash" },
      { t: "fetch", item: "old_gear", n: 1, text: "Old Gear in your stash" },
    ],
    rewards: [{ t: "money", n: 40 }, { t: "unlock", key: "flag:salMovedIn", text: "Sal's shop opens" }, { t: "unlock", key: "fac:radio", text: "Radio Desk blueprint" }],
    hint: "Vine rope turns up in sacks and crates. Old gears live in toolboxes." },
  { id: "radio_static", giver: "radio", title: "Static on the Line", turnIn: "home", requires: ["sal_supplies"],
    brief: "Visit the Old Plantation and read the foreman's real ledger in the plantation office.",
    offer: ["...copy. Name's Dial. I hear everything on this island.", "The foreman keeps two ledgers. Find the honest one.", "Kidding. There's no honest one. Read it anyway."],
    progress: "The office is in the farmhouse. The safe is in the office. The ledger is in the safe. Then the guards are in your face.",
    done: ["Two sets of books. Respect.", "I told Sal to stock first-aid kits. He listened. Weird."],
    tasks: [
      { t: "visit", area: "plantation", text: "Set foot on the Old Plantation" },
      { t: "note", note: "note_foreman_ledger", text: "Read the foreman's ledger", where: "the plantation office safe, in the farmhouse" },
    ],
    rewards: [{ t: "money", n: 30 }, { t: "unlock", key: "stock:firstaid", text: "Sal stocks first-aid kits" }],
    hint: "Foreman's ledger is in the office safe, in the farmhouse. Two hired guns sit on it." },
  { id: "radio_gang", giver: "radio", title: "Gang Frequencies", turnIn: "home", requires: ["radio_static"],
    brief: "Bonk three Peel Gang bandits. Quiet airwaves are happy airwaves.",
    offer: ["The Peel Gang yaps all day on channel four.", "Bonk three of them. I need to hear myself think."],
    progress: "Bandits wear bandanas and sacks. They like the camp west of the palms.",
    done: ["Channel four's gone quiet.", "They dropped an ammo press blueprint in the panic. Print your own rounds."],
    tasks: [{ t: "ko", kind: "bandit", n: 3, text: "Bonk Peel Gang bandits" }],
    rewards: [{ t: "money", n: 35 }, { t: "unlock", key: "fac:press", text: "Coin-Op Ammo Press blueprint" }],
    hint: "Peel Gang's camp is west of the palms. They travel in threes. So do the bruises." },
  { id: "radio_flare", giver: "radio", title: "Signal Fire", turnIn: "home", requires: ["radio_static"],
    brief: "Read the Rum Runners' IOU at the cove, then bring 2 Springs and 1 Scrap Tin for a flare.",
    offer: ["The Rum Runners land at Smuggler's Cove when they see a green flare.", "Bring springs for the trigger and a tin for the casing. And find their IOU. I want to know who owes pirates money."],
    progress: "The IOU's at the smugglers' picnic on the cove sand. Springs and tins are junk. Junk is everywhere.",
    done: ["One cove signal flare. Keep it in your stash and the pod can drop you at the cove.", "Don't light it indoors."],
    tasks: [
      { t: "note", note: "note_pirate_iou", text: "Read the Rum Runner IOU", where: "the smugglers' picnic at Smuggler's Cove" },
      { t: "fetch", item: "spring", n: 2, text: "Springs in your stash" },
      { t: "fetch", item: "scrap_tin", n: 1, text: "Scrap Tin in your stash" },
    ],
    rewards: [{ t: "item", item: "cove_flare", n: 1 }, { t: "money", n: 15 }],
    hint: "The IOU is at the smugglers' picnic, far west along the beach. Scrap tin hides in junk heaps." },
  { id: "sal_payroll", giver: "sal", title: "The Foreman's Payroll", turnIn: "home", requires: ["sal_roadmap"],
    brief: "Bonk Foreman Knucklebark in his loading yard and come home.",
    offer: ["Foreman Knucklebark runs the loading yard and pays his gorillas in bananas.", "Our bananas. Island bananas. Bonk him and the payroll's ours."],
    progress: "The yard's north of the palms on the road to the plantation. He's big. Aim for the head. It's also big.",
    done: ["You bonked Knucklebark? I'm adding 'business partner' to your title. In pencil.", "I've got hard hats in stock now. Sturdy ones. Mostly."],
    tasks: [{ t: "ko", kind: "boss", n: 1, text: "Bonk Foreman Knucklebark" }],
    rewards: [{ t: "money", n: 120 }, { t: "unlock", key: "stock:hardhat", text: "Sal stocks hard hats" }],
    hint: "Knucklebark's in the loading yard north of the palms, with two monkeys on the payroll. Bring bullets." },
  { id: "keeper_lanterns", giver: "keeper", title: "Seed Lanterns", turnIn: "raid", requires: [],
    brief: "Bring the Grove Keeper two Honey Pots in the mangrove. They know a secret.",
    offer: ["You are loud, suit-wearer. The lanterns are dim.", "Bring two pots of honey. The lanterns drink sap, and honey is close enough.", "Then I will show you where the old roots keep their seeds."],
    progress: "Two pots of honey. Bees keep it in baskets and sacks, like everyone on this island.",
    done: ["The lanterns glow again.", "Under the great mangrove at the east edge, the roots hold a cellar. Take what the island gives. Leave some."],
    tasks: [{ t: "fetch", item: "honey_pot", n: 2, text: "Honey Pots in your pack (hand them over at the camp)" }],
    rewards: [{ t: "unlock", key: "secret:root-cellar", text: "The Keepers' root cellar" }, { t: "item", item: "keeper_carving", n: 1 }],
    hint: "There's a Keeper trader camped by the jetty in the mangrove. Friendly. Don't make them unfriendly." },
];
export const questOf = (id: string) => QUESTS.find((q) => q.id === id);

// ---------------------------------------------------------------- saved state
/** one paid job (the ledger, like Sol's raid settlements): what left, what arrived, and when */
export type QuestPayout = { quest: string; at: "home" | "raid"; raid?: string; consumed: string[]; granted: string[]; money: number; unlocks: string[] };
export type QuestSave = {
  v: 1;
  /** the arrival intro has played */
  intro: boolean;
  active: string[]; done: string[]; tracked: string | null;
  /** task counters: "<quest>/<task index>" -> count (Duckov saves per-task status) */
  progress: Record<string, number>;
  /** notes read (ever) */
  notes: string[];
  /** unlocks paid by jobs (and granted by migration): dest:, stock:, fac:, secret:, flag: */
  unlocks: string[];
  /** one-shot dialogue and bark flags */
  seen: string[];
  /** settlement ids already credited to extract tasks (the last 40) */
  counted: string[];
  ledger: QuestPayout[];
};
export const freshQuests = (): QuestSave => ({ v: 1, intro: false, active: [], done: [], tracked: null, progress: {}, notes: [], unlocks: [], seen: [], counted: [], ledger: [] });
/** the quest state on a save (a save written before quests gets an empty one) */
export function qs(save: SaveV1): QuestSave { return (save.quests ??= freshQuests()); }

const strs = (v: unknown): string[] => Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length < 80))] : [];
const obj = (v: unknown): Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
/** validate a saved QuestSave, or build one for a save from before jobs (the migration). legacy = the raw save. An old
 *  save keeps what it already had: Sal moved in (his first three jobs count as done) and, after a return, the plantation
 *  road that one extraction used to open (with the road map job done). The intro never plays for a save that has already been played. */
export function sanitizeQuests(value: unknown, legacy: { salMovedIn: boolean; extracts: number; raids: number; lookDone: boolean }): QuestSave {
  const raw = obj(value), out = freshQuests();
  if (!Object.keys(raw).length) { // migration from a save with no jobs
    out.intro = legacy.lookDone || legacy.raids > 0;
    if (legacy.extracts > 0) { out.done.push("sal_roadmap"); out.unlocks.push("dest:plantation"); }
    if (legacy.salMovedIn) { out.done.push(...(legacy.extracts > 0 ? [] : ["sal_roadmap"]), "sal_office", "sal_supplies"); out.unlocks.push("flag:salMovedIn", "fac:radio"); }
    return out;
  }
  const known = (id: string) => !!questOf(id);
  out.intro = raw.intro === true;
  out.done = strs(raw.done).filter(known);
  out.active = strs(raw.active).filter((id) => known(id) && !out.done.includes(id));
  out.tracked = typeof raw.tracked === "string" && out.active.includes(raw.tracked) ? raw.tracked : out.active[0] ?? null;
  for (const [k, n] of Object.entries(obj(raw.progress))) {
    const [q, i] = k.split("/"), def = questOf(q), task = def?.tasks[Number(i)];
    if (task && typeof n === "number" && Number.isSafeInteger(n) && n > 0) out.progress[k] = Math.min(n, need(task));
  }
  out.notes = strs(raw.notes); out.unlocks = strs(raw.unlocks); out.seen = strs(raw.seen).slice(-200); out.counted = strs(raw.counted).slice(-40);
  out.ledger = Array.isArray(raw.ledger) ? raw.ledger.filter((r) => typeof obj(r).quest === "string" && known(obj(r).quest as string)).map((r) => structuredClone(r) as QuestPayout) : [];
  // a paid job is done even if the done list was damaged (the ledger is the authority: it can never pay twice)
  for (const r of out.ledger) if (!out.done.includes(r.quest)) { out.done.push(r.quest); out.active = out.active.filter((id) => id !== r.quest); }
  return out;
}

// ---------------------------------------------------------------- rules
export type QuestStatus = "locked" | "available" | "active" | "ready" | "done";
const need = (t: TaskDef) => ("n" in t ? t.n : 1);
export const taskKey = (quest: string, i: number) => `${quest}/${i}`;
/** what you own at home that a fetch task can count (the stash, the locker and anything waiting in delivery) */
export const homeItems = (save: SaveV1) => [...save.reserved, ...save.locker, ...(save.delivery ?? [])];
export const unlocked = (save: SaveV1, key: string) => qs(save).unlocks.includes(key) || (key === "flag:salMovedIn" && save.salMovedIn);
export function isBuilt(save: SaveV1, facility: string) { return save.base.items.some((i) => i.def === facility); }
/** the Radio Operator is in once his desk is built (the desk needs Sal's second job's blueprint) */
export const radioIn = (save: SaveV1) => isBuilt(save, "radio");

/** one task's progress. items = what a fetch task counts (default: what you own at home) */
export function taskProgress(save: SaveV1, q: QuestDef, i: number, items: readonly string[] = homeItems(save)): { have: number; need: number; ok: boolean } {
  const t = q.tasks[i], n = need(t), s = qs(save);
  let have = 0;
  if (s.done.includes(q.id)) have = n;
  else if (t.t === "fetch") have = items.filter((inst) => itemType(inst) === t.item).length;
  else if (t.t === "build") have = isBuilt(save, t.facility) ? 1 : 0;
  else if (t.t === "note") have = s.notes.includes(t.note) ? 1 : 0; // a note read before the job still counts: notes are found once
  else have = s.progress[taskKey(q.id, i)] ?? 0;
  have = Math.min(have, n);
  return { have, need: n, ok: have >= n };
}
export function giverPresent(save: SaveV1, giver: NpcId) { return giver !== "radio" || radioIn(save); }
/** Duckov MeetsPrerequisit: every required quest finished (and the giver is around to offer it) */
export function meetsPrereqs(save: SaveV1, q: QuestDef) { const s = qs(save); return q.requires.every((r) => s.done.includes(r)) && giverPresent(save, q.giver); }
export function questStatus(save: SaveV1, id: string, items?: readonly string[]): QuestStatus {
  const q = questOf(id), s = qs(save);
  if (!q) return "locked";
  if (s.done.includes(id)) return "done";
  if (s.active.includes(id)) return q.tasks.every((_, i) => taskProgress(save, q, i, items).ok) ? "ready" : "active";
  return meetsPrereqs(save, q) ? "available" : "locked";
}
/** the giver's jobs in the order to show them: ready first, then active, then the next one on offer */
export function jobsOf(save: SaveV1, giver: NpcId, items?: readonly string[]) {
  return QUESTS.filter((q) => q.giver === giver).map((q) => ({ q, st: questStatus(save, q.id, items) })).filter((j) => j.st !== "locked");
}
/** take a job (Duckov: the quest giver's accept). Tracks it if nothing else is tracked. */
export function accept(save: SaveV1, id: string): boolean {
  const s = qs(save);
  if (questStatus(save, id) !== "available") return false;
  s.active.push(id); s.tracked = id;
  return true;
}
export function track(save: SaveV1, id: string | null) { const s = qs(save); if (id === null || s.active.includes(id)) s.tracked = id; }
export const trackedQuest = (save: SaveV1) => { const s = qs(save), id = s.tracked && s.active.includes(s.tracked) ? s.tracked : s.active[0]; return id ? questOf(id) ?? null : null; };
/** the item types active fetch tasks still want (loot weighting, quest item spawns) */
export function wantedItems(save: SaveV1, items?: readonly string[]): string[] {
  const out = new Set<string>();
  for (const id of qs(save).active) { const q = questOf(id)!; q.tasks.forEach((t, i) => { if (t.t === "fetch" && !taskProgress(save, q, i, items).ok) out.add(t.item); }); }
  return [...out];
}
/** does any active job still need this note read */
export const wantsNote = (save: SaveV1, note: string) => qs(save).active.some((id) => questOf(id)!.tasks.some((t, i) => t.t === "note" && t.note === note && !taskProgress(save, questOf(id)!, i).ok));

// ---------------------------------------------------------------- events (raid and home)
export type QuestEvent =
  | { t: "ko"; kind: string; boss: boolean }
  | { t: "visit"; area: string }
  | { t: "note"; note: string }
  | { t: "extract"; dest: string; raid: string };
/** a task that moved: what to tell the player (U01 notice) */
export type QuestNotice = { quest: string; title: string; text: string; have: number; need: number; ready: boolean };
/** credit an event to every active job that wants it (Duckov: tasks listen only while their quest is active). Returns
 *  the notices for the tasks that moved. Notes are remembered as read even with no job asking. */
export function questEvent(save: SaveV1, ev: QuestEvent): QuestNotice[] {
  const s = qs(save), out: QuestNotice[] = [];
  if (ev.t === "note" && !s.notes.includes(ev.note)) s.notes.push(ev.note);
  if (ev.t === "extract") { if (s.counted.includes(ev.raid)) return out; s.counted = [...s.counted, ev.raid].slice(-40); }
  for (const id of s.active) {
    const q = questOf(id)!;
    q.tasks.forEach((t, i) => {
      const k = taskKey(id, i), before = taskProgress(save, q, i);
      if (before.ok) return;
      const hit = (ev.t === "ko" && t.t === "ko" && (t.kind === "boss" ? ev.boss : !ev.boss && t.kind === ev.kind))
        || (ev.t === "visit" && t.t === "visit" && t.area === ev.area)
        || (ev.t === "note" && t.t === "note" && t.note === ev.note)
        || (ev.t === "extract" && t.t === "extract" && (!t.dest || t.dest === ev.dest));
      if (!hit) return;
      s.progress[k] = Math.min(need(t), (s.progress[k] ?? 0) + 1);
      const now = taskProgress(save, q, i);
      out.push({ quest: id, title: q.title, text: t.text, have: now.have, need: now.need, ready: questStatus(save, id) === "ready" });
    });
  }
  return out;
}
/** the job's rewards in plain words (dialogue, quest log) */
export function rewardText(r: RewardDef): string {
  if (r.t === "money") return `🍌 ${r.n}`;
  if (r.t === "item") return `${r.n > 1 ? `${r.n} × ` : ""}${r.item === "cove_flare" ? "Cove Signal Flare" : r.item === "keeper_carving" ? "Keeper Seed Carving" : r.item}`;
  return r.text;
}
