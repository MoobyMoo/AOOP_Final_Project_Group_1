// The end-of-raid payout slip (UI v3): direction B's appraisal receipt, kept for this one moment, in A's palette.
// A cream thermal slip with a torn edge, typed line items with rarity ticks, the haul total and a rubber stamp
// (green "Home safe", red "Bonked"). Shown by home/bunker.ts as the arrival panel (class "result").
import { itemDef } from "../loot/raidloot";
import { iconHtml } from "./itemicon";
import type { RaidReport } from "../core/raid-report";

export type PayoutInfo = { raid: number; how: "bonked" | "raft" | "tunnel" | string; raidT: number; kills: number; crates: number; kept: string[]; lost: number; value: number; bonus: number; vineKey: boolean; delivery?: number;
  /** extra slip sections (main.ts): the wager result, the factory's run, Double or Nothing (home/econ-ui.ts) */
  extra?: string; report?: RaidReport };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function payoutSlip(p: PayoutInfo) {
  const bad = p.how === "bonked";
  const how = bad ? "Bonked" : p.how === "raft" ? "Rafted home" : p.how === "tunnel" ? "Home by the tunnel" : p.how === "boat" ? "Rowed home" : "Home safe";
  const sub = bad ? "The crew carried you home." : p.how === "raft" ? "You rafted home with the haul." : p.how === "tunnel" ? "Home through the Smuggler Tunnel." : p.how === "boat" ? "You rowed the haul home from the cove." : "Back through the hatch.";
  const mmss = `${Math.floor(p.raidT / 60)}:${String(Math.floor(p.raidT % 60)).padStart(2, "0")}`;
  // group identical items: "Coconut x2"
  const groups = new Map<string, { inst: string; n: number }>();
  for (const i of p.kept) { const k = i.split("@")[0]; const g = groups.get(k); if (g) g.n++; else groups.set(k, { inst: i, n: 1 }); }
  const rows = [...groups.values()].sort((a, b) => itemDef(b.inst).value * b.n - itemDef(a.inst).value * a.n)
    .map(({ inst, n }) => { const d = itemDef(inst); return `<tr style="--rar:var(--rar-${d.rarity})"><td><span class="r"></span>${iconHtml(inst, 26)}${esc(d.name)}${n > 1 ? ` ×${n}` : ""}</td><td>${d.kind === "key" ? "keyring" : d.kind === "lockbox" ? "sealed" : `🍌 ${d.value * n}`}</td></tr>`; }).join("");
  return `<div class="slip"><div class="co">Banana Bank Ltd.<small>Payout slip for raid ${p.raid}, ${mmss} on the island</small></div>
    <span class="stamp ${bad ? "" : "ok"}">${bad ? "Bonked" : "Kept"}</span><hr>
    <div class="how ${bad ? "bad" : "ok"}">${how}</div><p class="sub">${sub}</p><hr>
    <table><tr><td>Enemies bonked</td><td>${p.kills}</td></tr><tr><td>Crates opened</td><td>${p.crates}</td></tr></table><hr>
    ${p.kept.length ? `<div class="items"><table>${rows}</table></div>` : `<p class="sub">Nothing came home this time.</p>`}
    <table><tr><td>Items brought home</td><td>${p.kept.length}</td></tr><tr><td>Loot appraisal (sell later)</td><td>🍌 ${p.value}</td></tr>${p.bonus ? `<tr><td>Raft bonus, paid now</td><td>🍌 ${p.bonus}</td></tr>` : ""}<tr class="tot"><td>Haul + bonus value</td><td>🍌 ${p.value + p.bonus}</td></tr>${p.report ? `<tr><td>Wallet change since landing</td><td>${p.report.cashChange >= 0 ? "+" : "−"}🍌 ${Math.abs(p.report.cashChange)}</td></tr>` : ""}</table>
    ${p.report ? `<section class="raid-report"><h3>Job progress</h3>${p.report.jobs.length ? p.report.jobs.map(job => `<article><b>${esc(job.title)}</b><small>${esc(job.status)}</small><ul>${job.tasks.map(task => `<li>${esc(task)}</li>`).join("")}</ul></article>`).join("") : `<p>No job progress this raid.</p>`}<h3>New accessories</h3><p>${p.report.accessories.length ? p.report.accessories.map(esc).join(" · ") + " · Available in your locker or equipped slots." : "No new accessories brought home."}</p><h3>Unlocks</h3><p>${p.report.unlocks.length ? p.report.unlocks.map(esc).join(" · ") : "No new unlocks this raid."}</p></section>` : ""}
    ${p.lost ? `<p class="lost">${p.lost} item${p.lost > 1 ? "s" : ""} stayed in your satchel where you fell. Recover it next raid.</p>` : ""}
    ${p.vineKey ? `<p class="note">The Vine Key is on your keyring. The vault opens next raid.</p>` : ""}
    ${p.delivery ? `<p class="note">${p.delivery} owned item${p.delivery === 1 ? " is" : "s are"} safe in delivery. Free stash space or build a Safe-Deposit Wall to receive them automatically. Nothing expires.</p>` : ""}
    ${p.extra ?? ""}<p class="note">Sell your stash at the Fence.</p><div class="barcode"></div></div>`;
}
