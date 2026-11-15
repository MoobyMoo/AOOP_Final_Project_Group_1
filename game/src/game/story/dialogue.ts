// The dialogue panel and the quest log (UI v3 "Corner office": the same pinstripe .panel plates as every station).
// Pure HTML from the save; the vault (story/vault.ts) and the raid (story/raid.ts) show them and handle the clicks.
//   dialogue  portrait, name and role, 1-3 short lines, then the NPC's jobs: a job on offer (Take the job), one you're
//             on (its tasks with progress), one that's ready (Hand it in). NPC extras (Sal's shop, the Fence's
//             counter, the Keeper's trades) go underneath.
//   quest log every job you're on or have finished, the tracked one first, plus the notes you've read (click to reread)
//   tracker   one line for the HUD: the tracked job and its next unfinished task
import type { SaveV1 } from "../contracts";
import { QUESTS, jobsOf, qs, questOf, questStatus, rewardText, taskProgress, trackedQuest, type NpcId, type QuestDef, type QuestStatus } from "../core/quests";
import { NOTES, noteOf } from "../loot/storyitems";
import { itemType } from "../loot/instances";
import { NPCS, greetLine } from "./npcs";
import { portrait } from "./portrait";

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const GIVER: Record<NpcId, string> = { sal: "Sal", fence: "the Fence", radio: "Dial", keeper: "the Grove Keeper" };
const STATUS: Record<QuestStatus, string> = { locked: "Locked", available: "On offer", active: "On it", ready: "Ready to hand in", done: "Done" };

/** a job's task rows. items = what fetch tasks count (home: the stash; raid: the stash for home jobs, the pack for raid jobs) */
export function tasksHtml(save: SaveV1, q: QuestDef, items?: readonly string[], pack: readonly string[] = []) {
  return `<ul class="q3-tasks">${q.tasks.map((t, i) => {
    const p = taskProgress(save, q, i, items), carried = t.t === "fetch" && q.turnIn === "home" && !p.ok ? pack.filter((inst) => itemType(inst) === t.item).length : 0;
    const where = (t.t === "fetch" || t.t === "note") && t.where && !p.ok ? `<small>${esc(t.where)}</small>` : "";
    return `<li class="${p.ok ? "ok" : ""}"><i>${p.ok ? "✔" : "◇"}</i><span>${esc(t.text)}${carried ? ` <em>(${carried} in your pack: get it home)</em>` : ""}${where}</span><b class="num">${p.need > 1 || t.t === "fetch" ? `${p.have}/${p.need}` : p.ok ? "" : ""}</b></li>`;
  }).join("")}</ul>`;
}
const rewardsHtml = (q: QuestDef) => `<p class="q3-reward"><span>Reward</span> ${q.rewards.map((r) => esc(rewardText(r))).join(" · ")}</p>`;

/** the dialogue panel. lines = override (a turn-in's thanks); extra = NPC-specific rows under the jobs */
export function dialogueHtml(id: NpcId, save: SaveV1, o: { lines?: string[]; extra?: string; items?: readonly string[]; pack?: readonly string[]; foot?: string } = {}) {
  const npc = NPCS[id], jobs = jobsOf(save, id, o.items);
  const ready = jobs.find((j) => j.st === "ready"), offer = jobs.find((j) => j.st === "available"), on = jobs.find((j) => j.st === "active");
  const lines = o.lines ?? (ready ? ["That's the stuff. Hand it over."] : offer ? offer.q.offer : on ? [on.q.progress] : [greetLine(id, save)]);
  const img = portrait(id);
  const job = (q: QuestDef, st: QuestStatus) => `<div class="q3-job ${st}"><div class="q3-jh"><b>${esc(q.title)}</b><em>${STATUS[st]}</em></div><p class="q3-brief">${esc(q.brief)}</p>
    ${st !== "available" ? tasksHtml(save, q, o.items, o.pack) : ""}${rewardsHtml(q)}
    <div class="actions">${st === "available" ? `<button data-a="q:accept:${q.id}">Take the job</button>` : st === "ready" ? `<button data-a="q:turnin:${q.id}">Hand it in</button>` : qs(save).tracked === q.id ? `<em class="q3-trk">Tracked</em>` : `<button class="ghost" data-a="q:track:${q.id}">Track it</button>`}</div></div>`;
  const shown = [ready, on, offer].filter((j, i, a) => j && a.indexOf(j) === i) as { q: QuestDef; st: QuestStatus }[];
  return `<header><h2>${esc(npc.name)}</h2><small>${esc(npc.role)}</small></header>
    <div class="npc3"><span class="npc3-face">${img ? `<img src="${img}" alt="">` : `<b>${esc(npc.name[0])}</b>`}</span><div class="npc3-lines">${lines.slice(0, 3).map((l) => `<p>${esc(l)}</p>`).join("")}</div></div>
    ${shown.map((j) => job(j.q, j.st)).join("")}${o.extra ?? ""}${o.foot ?? ""}`;
}

/** the quest log: jobs (tracked first, then on, then done) and the notes read */
export function questLogHtml(save: SaveV1, o: { items?: readonly string[]; pack?: readonly string[]; compact?: boolean } = {}) {
  const s = qs(save), tracked = trackedQuest(save);
  const on = s.active.map((id) => questOf(id)!).sort((a, b) => Number(b.id === tracked?.id) - Number(a.id === tracked?.id));
  const done = s.done.map((id) => questOf(id)!).filter(Boolean);
  const offered = QUESTS.filter((q) => questStatus(save, q.id, o.items) === "available");
  const job = (q: QuestDef) => { const st = questStatus(save, q.id, o.items); return `<div class="q3-job ${st}${q.id === tracked?.id ? " tracked" : ""}"><div class="q3-jh"><b>${esc(q.title)}</b><em>${q.id === tracked?.id ? "Tracked · " : ""}${STATUS[st]}</em></div>
    <p class="q3-brief">${esc(q.brief)} <span class="q3-dim">From ${GIVER[q.giver]}.</span></p>${tasksHtml(save, q, o.items, o.pack)}${rewardsHtml(q)}
    ${q.id === tracked?.id ? "" : `<div class="actions"><button class="ghost" data-a="q:track:${q.id}">Track it</button></div>`}</div>`; };
  const notes = NOTES.filter((n) => s.notes.includes(n.id));
  return `<div class="q3-log">${on.length ? on.map(job).join("") : `<p class="q3-dim">No jobs on the go. ${offered.length ? `${offered.map((q) => GIVER[q.giver]).filter((g, i, a) => a.indexOf(g) === i).join(" and ")} ${offered.length > 1 ? "have" : "has"} work for you.` : "Talk to Sal in the vault."}</p>`}
    ${done.length ? `<h4>Done</h4><ul class="q3-done">${done.map((q) => `<li>✔ ${esc(q.title)}</li>`).join("")}</ul>` : ""}
    <h4>Notes <span class="q3-dim num">${notes.length} of ${NOTES.length}</span></h4>${notes.length ? notes.map((n) => `<details class="q3-note"><summary>📜 ${esc(n.title)}</summary><p>${esc(n.text)}</p></details>`).join("") : `<p class="q3-dim">Notes you read in a raid are kept here.</p>`}</div>`;
}

/** the tracker line: the tracked job and its next unfinished task (or "hand it in") */
export function trackerHtml(save: SaveV1, o: { items?: readonly string[]; pack?: readonly string[] } = {}) {
  const q = trackedQuest(save); if (!q) return "";
  const st = questStatus(save, q.id, q.turnIn === "raid" ? o.pack : o.items);
  const i = q.tasks.findIndex((_, k) => !taskProgress(save, q, k, q.turnIn === "raid" ? o.pack : o.items).ok);
  const t = i >= 0 ? q.tasks[i] : null, p = t ? taskProgress(save, q, i, q.turnIn === "raid" ? o.pack : o.items) : null;
  const carried = t?.t === "fetch" && q.turnIn === "home" ? (o.pack ?? []).filter((inst) => itemType(inst) === t.item).length : 0;
  const line = st === "ready" ? `Hand it in to ${GIVER[q.giver]}` : t ? `${t.text}${p && (p.need > 1 || t.t === "fetch") ? ` <b class="num">${p.have}/${p.need}</b>` : ""}${carried ? ` <em>+${carried} in pack</em>` : ""}` : "";
  return `<span class="q3-dia">◆</span><span class="q3-t"><b>${esc(q.title)}</b><span>${line}</span></span>`;
}

/** a note's full text for the item tag (read in the loot or Tab screen) */
export function noteTagHtml(type: string) {
  const n = noteOf(type); if (!n) return "";
  return `<div class="q3-paper"><h4>${esc(n.title)}</h4><p>${esc(n.text)}</p><small>Found: ${esc(n.where)}</small></div>`;
}
