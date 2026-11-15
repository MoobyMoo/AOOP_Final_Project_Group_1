// Dev and test hooks for the UI (loaded only with ?dev): open a real container or body in the loot screen without
// walking to one, so captures and tools/uitest.mjs can drive the screen with real mouse and keys.
import { G } from "../core/state";
import { createSearch } from "../loot/search";
import { rollContainer, CONTAINERS, type ContainerType } from "../loot/containers";
import { gearStats } from "../loot/equipment";
import { openLoot, closeLoot, lootDebug, type LootTarget } from "./lootview";

/** a typed container rolled from its real pool, searched at the real per-item timings */
export function crate(type: ContainerType = "medical", extra: string[] = []) {
  const items = [...rollContainer(type, G.rng), ...extra];
  const t: LootTarget = { name: CONTAINERS[type].label, items, search: createSearch(items, { openSeconds: CONTAINERS[type].openSeconds, searchFactor: gearStats(G.gear).search }), kind: "container" };
  openLoot(t); return t;
}
/** a knocked-out bandit: worn gear plus carried loot, searched like a crate (row 18) */
export function body(items = ["peel_jacket#64", "guard_helmet", "ammo45", "banana", "brass_compass"]) {
  const t: LootTarget = { name: "Peel Gang bandit", sub: "Knocked out", items: [...items], search: createSearch(items, { searchFactor: gearStats(G.gear).search }), kind: "body" };
  openLoot(t); return t;
}
export { openLoot, closeLoot, lootDebug };
export { hud } from "./hud";
import { enterBunker } from "../home/bunker";
import { payoutSlip } from "./payout";
/** the bunker without a raid (captures) */
export function home() { G.save.lookDone = true; enterBunker(() => {}, () => {}); }
/** the arrival panel with a sample payout slip */
export function slip(bonked = false) {
  G.save.lookDone = true;
  enterBunker(() => {}, () => {}, payoutSlip({ raid: 4, how: bonked ? "bonked" : "hatch", raidT: 221, kills: 3, crates: 5, kept: bonked ? ["banana"] : ["golden_banana", "brass_compass", "honey_pot", "coconut", "coconut", "leaf_vest#72", "vine_key"], lost: bonked ? 4 : 0, value: bonked ? 9 : 260, bonus: 0, vineKey: !bonked }));
}
import { placeItem } from "../loot/raidloot";
/** lay items on the ground in a row in front of the player (captures of ground models) */
export function lay(items: string[], spacing = 1.1) {
  const fx = Math.sin(G.aimYaw), fz = Math.cos(G.aimYaw), sx = fz, sz = -fx;
  items.forEach((id, i) => { const o = (i - (items.length - 1) / 2) * spacing; placeItem(id, G.pp.x + fx * 2.5 + sx * o, G.pp.z + fz * 2.5 + sz * o); });
}
