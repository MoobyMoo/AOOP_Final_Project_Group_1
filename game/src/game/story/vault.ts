// The NPCs in the vault (G1.5 row 40): where they stand, who you can talk to, their barks, and the job actions. The
// vault (home/bunker.ts) owns the room, the panels and the stations; this file places the cast in it:
//   the Fence        behind the teller window once it's built; until then by the blueprint desk, asking for one
//   Smuggler Sal     behind his corner desk once it's built; until then leaning on the departures board
//   the Radio Operator  at the radio desk (a facility: its blueprint is Sal's second job's reward); not before
// Each stands where you can walk up and press E. Barks: one line over the head when you come near, keyed to
// milestones, each said once (saved in quests.seen).
import * as THREE from "three";
import { G } from "../core/state";
import { save } from "../core/save";
import { sfx } from "../core/audio";
import { floatText, burst } from "../../fx";
import { accept, qs, questOf, questStatus, giverPresent, radioIn, track, type NpcId } from "../core/quests";
import { payQuest } from "../core/settlement";
import { NPCS, BARKS, CHATTER, npcRig } from "./npcs";
import { dialogueHtml, esc, questLogHtml } from "./dialogue";
import { menuOpened, menuHooks, openPage } from "../ui/menubar";
import type { Station } from "../home/bunker";

type NpcRig = ReturnType<typeof npcRig>;
type Placed = { id: NpcId; rig: NpcRig; free: boolean; at: THREE.Vector3; yaw: number };
const rigs = new Map<NpcId, NpcRig>();
let placed: Placed[] = [];
/** free-standing NPCs block a circle on the floor (home/bunker.ts collide) */
export const npcBlockers: { x: number; z: number; r: number }[] = [];
export type VaultApi = { show(html: string, cls?: string): void; close(): void; refresh(): void; money(): void };
let api: VaultApi | null = null;
export const initVault = (a: VaultApi) => { api = a; };

/** where each NPC stands: behind their facility (local offset), or free-standing (world) */
const AT: Record<"fence" | "sal" | "radio", { fac: string; local: [number, number]; free?: { x: number; z: number; yaw: number } }> = {
  fence: { fac: "fence", local: [0, -0.55], free: { x: -6.4, z: -8.6, yaw: 0.5 } },
  sal: { fac: "sal", local: [0.1, -0.3], free: { x: 4.6, z: -10.2, yaw: -0.35 } },
  radio: { fac: "radio", local: [0, -0.45] },
};
const rigOf = (id: NpcId) => { let r = rigs.get(id); if (!r) { r = npcRig(id); rigs.set(id, r); } return r; };

/** place the cast for the current layout and add a talk station for each free-standing NPC (call after the stations
 *  are rebuilt). facObj = the built facility's object, or null */
export function syncNpcs(scene: THREE.Scene, facObj: (id: string) => THREE.Object3D | null, stations: Station[]) {
  for (const p of placed) p.rig.root.removeFromParent();
  placed = []; npcBlockers.length = 0;
  for (const id of ["fence", "sal", "radio"] as const) {
    const a = AT[id], o = facObj(a.fac);
    if (id === "radio" && !radioIn(G.save)) continue;
    const rig = rigOf(id);
    if (o) {
      o.updateMatrixWorld(true); const at = o.localToWorld(new THREE.Vector3(a.local[0], 0, a.local[1])); at.y = 0;
      rig.root.position.copy(at); rig.root.rotation.y = o.rotation.y; placed.push({ id, rig, free: false, at, yaw: o.rotation.y });
    } else if (a.free) {
      const at = new THREE.Vector3(a.free.x, 0, a.free.z);
      rig.root.position.copy(at); rig.root.rotation.y = a.free.yaw; placed.push({ id, rig, free: true, at, yaw: a.free.yaw });
      npcBlockers.push({ x: at.x, z: at.z, r: 0.45 });
      stations.push({ id: "talk", npc: id, x: at.x, z: at.z, label: `Talk to ${NPCS[id].name}`, rect: { x0: at.x - 0.4, x1: at.x + 0.4, z0: at.z - 0.4, z1: at.z + 0.4 } });
    } else continue;
    scene.add(rig.root);
  }
}
/** per render frame: idle, heads turned toward you when you're near */
export function poseNpcs(time: number, pp: THREE.Vector3) {
  for (const p of placed) {
    const d = Math.hypot(pp.x - p.at.x, pp.z - p.at.z), look = Math.atan2(pp.x - p.at.x, pp.z - p.at.z);
    const dy = Math.atan2(Math.sin(look - p.yaw), Math.cos(look - p.yaw)), face = d < 7 ? p.yaw + THREE.MathUtils.clamp(dy, -1.2, 1.2) : p.yaw;
    p.rig.pose({ time: time + p.id.length * 1.7, speed: 0, moveYaw: p.yaw, faceYaw: face, action: "idle", actionT: 0, armed: "none", flash: 0 });
  }
  placeBubble();
}

// ---------------------------------------------------------------- barks
let bubble: HTMLDivElement | null = null, bubbleFor: Placed | null = null, bubbleT = 0;
const proj = new THREE.Vector3();
function placeBubble() {
  if (!bubble || !bubbleFor) return;
  bubbleFor.rig.sockets.head.getWorldPosition(proj); proj.y += 0.75; proj.project(G.stage.camera);
  bubble.style.transform = `translate(${((proj.x * 0.5 + 0.5) * innerWidth).toFixed(0)}px,${((-proj.y * 0.5 + 0.5) * innerHeight).toFixed(0)}px) translate(-50%,-100%)`;
}
export function bark(p: Placed, text: string) {
  bubble?.remove(); bubble = document.createElement("div"); bubble.className = "npc3-bark"; bubble.innerHTML = `<b>${esc(NPCS[p.id].name)}</b>${esc(text)}`;
  document.getElementById("ui")?.appendChild(bubble); bubbleFor = p; bubbleT = 4; placeBubble();
}
/** per sim step at home: say a milestone line once when you walk near, fade the bubble */
export function stepNpcs(dt: number, pp: THREE.Vector3, busy: boolean) { // busy = a panel is open: no bubble over it
  if (bubble && (bubbleT -= dt) <= 0 || busy) { bubble?.remove(); bubble = null; bubbleFor = null; }
  if (busy || bubble) return;
  const s = qs(G.save);
  for (const p of placed) {
    if (Math.hypot(pp.x - p.at.x, pp.z - p.at.z) > 4.2) continue;
    const b = BARKS[p.id].find((l) => !s.seen.includes(`bark:${l.id}`) && l.when(G.save));
    if (!b) continue;
    s.seen.push(`bark:${b.id}`); save(G.save); bark(p, b.text); sfx("ui"); return;
  }
}
export const clearBarks = () => { bubble?.remove(); bubble = null; bubbleFor = null; };

// ---------------------------------------------------------------- dialogue and job actions
let chat = 0;
/** the extra rows under an NPC's jobs (the vault fills in Sal's shop and the Fence's counter) */
export type Extras = Partial<Record<NpcId, () => string>>;
let extras: Extras = {};
export const setExtras = (e: Extras) => { extras = e; };
export function npcPanel(id: NpcId, lines?: string[]) {
  const foot = id === "radio" ? `<div class="actions"><button class="ghost" data-a="npc:chatter">Any chatter?</button></div>` : "";
  return dialogueHtml(id, G.save, { lines, extra: extras[id]?.(), foot });
}
export function openNpc(id: NpcId, lines?: string[]) { api?.show(npcPanel(id, lines), "npc"); }
export function readyJobsHtml() {
  const jobs = qs(G.save).active.map(questOf).filter(q => q && q.turnIn === "home" && questStatus(G.save, q.id) === "ready");
  return jobs.length ? `<h3>Ready to hand in</h3>${jobs.map(q => `<div><b>${esc(q!.title)}</b><button type="button" data-ready-job="${q!.id}" ${giverPresent(G.save, q!.giver) ? "" : "disabled"}>Talk to ${esc(NPCS[q!.giver].name)}</button>${!giverPresent(G.save, q!.giver) ? `<small>The quest giver's facility must be available.</small>` : ""}</div>`).join("")}` : "";
}
export function openReadyJob(id: string) {
  const q = questOf(id);
  if (G.scene !== "bunker" || !q || q.turnIn !== "home" || questStatus(G.save, id) !== "ready" || !giverPresent(G.save, q.giver)) return;
  openNpc(q.giver); sfx("ui");
}
/** the job log (Tab or J): the menu bar's Jobs or Notes page, as a vault plate */
export function openQuestLog(part: "jobs" | "notes" = "jobs") {
  api?.show(`<header><h2>${part === "jobs" ? "Jobs" : "Notes"}</h2><small>Tab or J</small></header>${questLogHtml(G.save, { part })}`, "qlog");
  const el = document.querySelector<HTMLElement>(".panel.qlog"); if (el) el.dataset.part = part;
  menuOpened(part);
}
menuHooks.page = (t) => { if (G.scene === "raid") openPage(t); else openQuestLog(t); };
/** a dialogue or quest-log button. Returns true when handled. */
export function questAct(a: string): boolean {
  const [k, verb, id] = a.split(":");
  if (k === "npc" && verb === "chatter") { const line = CHATTER[chat++ % CHATTER.length]; openNpc("radio", [line]); sfx("ui"); return true; }
  if (k !== "q") return false;
  const q = questOf(id); if (!q) return true;
  const log = !!document.querySelector(".panel.qlog");
  if (verb === "accept") {
    if (accept(G.save, id)) { save(G.save); sfx("buy"); floatText(`Job: ${q.title}`, new THREE.Vector3(0, 2.6, -8), "#fff3c4", 24); }
    else sfx("nope");
    openNpc(q.giver); return true;
  }
  if (verb === "track") { track(G.save, id); save(G.save); sfx("ui"); if (log) openQuestLog((document.querySelector<HTMLElement>(".panel.qlog")?.dataset.part as "jobs" | "notes") ?? "jobs"); else openNpc(q.giver); return true; }
  if (verb === "turnin") {
    let paid: ReturnType<typeof payQuest> = null;
    try { paid = payQuest(G.save, id); } catch (e) { console.error("job payout refused", e); }
    if (!paid) { sfx("nope"); openNpc(q.giver); return true; }
    Object.assign(G.save, paid.save); save(G.save);
    sfx("rare"); G.stage.trauma = 0.25; api?.refresh(); api?.money();
    const at = placed.find((p) => p.id === q.giver)?.at ?? new THREE.Vector3(0, 0, -8);
    burst(at.clone().setY(1.6), 22, "#ffd84a", 1);
    floatText(`${q.title}: done!${paid.record.money ? ` +🍌 ${paid.record.money}` : ""}`, at.clone().setY(2.8), "#ffd84a", 28);
    openNpc(q.giver, q.done); return true;
  }
  return true;
}
