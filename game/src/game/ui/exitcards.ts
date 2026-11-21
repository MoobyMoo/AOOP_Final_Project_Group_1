import { G, flat } from "../core/state";
import { exits, exitStatus } from "../world/props";
import { EXIT_DEFS } from "../world/extraction";
import { levelOf } from "./mapdata";
import { DEMO } from "../world/map/grove";
import { itemDef } from "../loot/tables";

const names = { hatch: "Bunker hatch", raft: "River raft", tunnel: "Smuggler Tunnel", boat: "Cove boat" };
let timer = 0, last = "";
export function buildExitCards(host: HTMLElement) {
  host.innerHTML = `<details><summary>Extraction routes</summary><div class="exit-card-list" aria-live="off"></div></details>`;
  timer = 0; last = ""; updateExitCards(host, 1);
}
export function updateExitCards(host: HTMLElement, dt: number) {
  if ((timer -= dt) > 0) return; timer = 0.2;
  const html = exits.map(exit => {
    const status = exitStatus(exit), def = EXIT_DEFS[exit.id], sameFloor = levelOf(G.pp.x) === levelOf(exit.x);
    const active = G.extract.id === exit.id && G.extract.t > 0;
    const condition = def.requirements.map(r => r.kind === "item" ? `Requires ${itemDef(r.item).name} in your pack${r.consume ? " (consumed)" : ""}` : r.kind === "boss" ? "Defeat the boss first" : `Open from ${r.from}s to ${r.until}s`).join(" · ") || "No item required";
    const closedReason = !exit.open && DEMO && (exit.id === "raft" || exit.id === "tunnel") ? "Outside the current playable area" : !exit.open && exit.id === "tunnel" ? "Break the rubble in the grotto to open this route" : status.reason;
    const reason = !status.open ? closedReason : !exit.armed ? "Move 8 m away to activate" : "Ready";
    return `<article class="exit-card ${status.open ? "ready" : "locked"}"><div><b>${names[exit.id]}</b><span>${sameFloor ? `${Math.round(flat(G.pp, exit))} m` : "Other floor"}</span></div>
      <small>${condition} · Stay in ring for ${def.dwellSeconds}s${exit.bonus ? ` · +${Math.round(exit.bonus * 100)}% haul bonus` : ""}</small>
      <p>${active ? `Extracting · ${Math.max(0, def.dwellSeconds - G.extract.t).toFixed(1)}s remaining` : reason}</p></article>`;
  }).join("");
  if (html !== last) { host.querySelector(".exit-card-list")!.innerHTML = html; last = html; }
}
