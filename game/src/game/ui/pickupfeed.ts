import { G } from "../core/state";
import { carriedWeight } from "../actors/player";
import { carryLimit } from "./equipui";
import { itemDef } from "../loot/tables";
import { itemType } from "../loot/instances";
import { equipDef } from "../loot/equipment";
import { packStacks } from "../loot/pack";
import { createPickupNotices } from "../loot/pickup-notices";
import { iconHtml } from "./itemicon";

const feed = createPickupNotices();
let layer: HTMLElement | null = null, signature = "";
const now = () => performance.now() / 1000;
const active = () => G.scene === "raid" && G.alive && !G.bot;
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
export function pickupSucceeded(inst: string, count = 1, detail = "Added to pack") {
  if (!active()) return;
  const weight = carriedWeight(), limit = carryLimit();
  if (weight > limit) detail += ` · Overweight ${weight.toFixed(1)}/${limit} kg: movement slowed`;
  feed.add("pickup", itemType(inst), inst, count, detail, now());
}
export function pickupBlocked(inst: string, reason?: string) {
  if (!active()) return;
  const detail = reason ?? (equipDef(inst)?.bound ? "This starter equipment stays with its owner" : `No free pack slots (${packStacks(G.pack).length}/${G.packSlots}). Drop an item or use a larger bag`);
  feed.add("blocked", itemType(inst), inst, 1, detail, now());
}
export function buildPickupFeed(host: HTMLElement) {
  layer?.remove(); feed.clear(); signature = "";
  layer = document.createElement("div"); layer.className = "ui-ref pickup-notice-layer";
  const log = document.createElement("div"); log.className = "pickup-feed"; log.setAttribute("role", "log"); log.setAttribute("aria-label", "Pickup notifications"); log.setAttribute("aria-live", "polite"); log.setAttribute("aria-relevant", "additions text");
  layer.appendChild(log); host.appendChild(layer);
}
export function updatePickupFeed() {
  if (!layer?.isConnected) return;
  const entries = feed.entries(now());
  const next = JSON.stringify(entries); if (next === signature) return; signature = next;
  layer.querySelector(".pickup-feed")!.innerHTML = entries.map(n => {
    const d = itemDef(n.item);
    return `<div class="pickup-notice ${n.kind}${n.detail.includes("Overweight") ? " overweight" : ""}" data-item="${esc(n.type)}" style="--rar:var(--rar-${d.rarity})">${iconHtml(n.item, 40)}<div><b>${n.kind === "pickup" ? "+ " : "Cannot pick up · "}${esc(d.name)}${n.kind === "pickup" ? ` ×${n.count}` : ""}</b><small>${esc(n.detail)}</small></div></div>`;
  }).join("");
}
