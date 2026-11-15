// Leaving the vault (G1.5 row 33; SYSTEMS_PORT R01/R02). Data and rules only: home/dispatch.ts is the pod and the
// destination view, core/raid.ts places you with pickEntry().
//
// Duckov mechanism, ported (MapSelectionView / MapSelectionEntry / SceneLoader / LevelManager):
//  - an in-base machine opens a destination list; each entry has a scene, an entry group (beacon), a cost, conditions,
//    a display name and a lock indicator;
//  - clicking an eligible entry opens a separate confirmation showing the cost; confirming checks again, pays, waits
//    0.5 s (unscaled), then loads behind a curtain;
//  - spawn: an explicit location wins; otherwise a random candidate from the entry group's start points, with a
//    fallback. Ours makes the fallback explicit and adds a 12 m enemy exclusion (SYSTEMS_PORT R02 port spec).
// This module never moves items: the only transaction is the fare (Sol's settlement owns everything else).
// Prerequisites (G1.5 row 40, Moo: "like how the teleporter works, we need to unlock something to be able to TP
// there"): Duckov's MapSelectionEntry carries Condition[]; while any fails the card shows its lock indicator and can't be
// picked. Ours are data on each destination, each with the reason the board shows: a job's unlock (the plantation road
// opens with Sal's road map) or an item you keep in the stash (the cove needs a signal flare, like Duckov's item-gated
// boat route).
import type { SaveV1 } from "../contracts";
import { ROADS, START } from "../world/layout";
import { mulberry32 } from "../loot/tables";
import { itemType } from "../loot/instances";
import { homeItems, unlocked } from "./quests";
import { credit, debit, title } from "./wallet";

export type EntryPoint = { id: string; group: string; x: number; z: number; facing: number; safeRadius: number };
export type DestinationDef = {
  id: string; name: string; region: string; entryGroup: string;
  cost: number;                                   // bananas, paid once on confirm
  blurb: string;                                  // what you'll find (destination card)
  preview: { x: number; z: number; r: number };   // map crop for the card (world centre, radius in u)
  requires: Prereq[];                             // all must hold (Duckov MapSelectionEntry conditions); [] = always open
};
/** a destination condition and the lock reason the card shows while it fails */
/** netWorth = a rich-list title index (core/networth.ts TITLES): the destination opens once your net worth reaches it */
export type Prereq = { unlock: string; reason: string } | { item: string; reason: string } | { netWorth: number; reason: string };
export const prereqMet = (p: Prereq, save: SaveV1) => "unlock" in p ? unlocked(save, p.unlock) : "netWorth" in p ? title(save) >= p.netWorth : homeItems(save).some((inst) => itemType(inst) === p.item);
export const SAFE_RADIUS = 12;
const facePlantation = (x: number, z: number) => Math.atan2(4 - x, 21 - z); // yaw toward the Old Plantation's yard
/** where each destination drops you. Beach: 3 authored spots around the hatch. Plantation road: taken from the road
 *  data (the west trail and the boardwalk where they leave the fork, and the hatch road's bend). */
const road = (id: string, i: number) => { const p = ROADS.find((r) => r.id === id)?.pts[i]; return p ? { x: p[0], z: p[1] } : null; };
export const ENTRY_POINTS: EntryPoint[] = [
  { id: "beach-hatch", group: "beach", x: START.x, z: START.z, facing: Math.PI, safeRadius: SAFE_RADIUS },
  { id: "beach-west", group: "beach", x: -24, z: 100.4, facing: Math.PI * 0.85, safeRadius: SAFE_RADIUS },
  { id: "beach-east", group: "beach", x: 14, z: 101.2, facing: -Math.PI * 0.85, safeRadius: SAFE_RADIUS },
  // Smuggler's Cove: on the sand inside the cove's rock arms, facing the water (the grotto cave is a short walk west)
  { id: "cove-picnic", group: "cove", x: -76.4, z: 98.6, facing: -Math.PI * 0.6, safeRadius: SAFE_RADIUS },
  { id: "cove-arm", group: "cove", x: -81.5, z: 94.2, facing: -Math.PI * 0.75, safeRadius: SAFE_RADIUS },
  { id: "cove-trail", group: "cove", x: -74.5, z: 97.7, facing: -Math.PI * 0.5, safeRadius: SAFE_RADIUS },
  ...([["west-trail", 1], ["boardwalk", 1], ["hatch-road", 2]] as const).flatMap(([id, i]) => {
    const p = road(id, i); return p ? [{ id: `road-${id}`, group: "plantation-road", x: p.x, z: p.z, facing: facePlantation(p.x, p.z), safeRadius: SAFE_RADIUS }] : [];
  }),
];
export const DESTINATIONS: DestinationDef[] = [
  { id: "beach", name: "Exile Beach", region: "Exile Beach", entryGroup: "beach", cost: 0, requires: [],
    blurb: "Land by the hatch on the sand. Crates in the palms, the prison ferry, the cove.", preview: { x: -2, z: 96, r: 26 } },
  { id: "plantation", name: "Old Plantation Road", region: "Old Plantation", entryGroup: "plantation-road", cost: 20,
    requires: [{ unlock: "dest:plantation", reason: "Needs the foreman's road map: Sal's job \"Scout the Plantation Road\"" }],
    blurb: "Land on a trail above the palms, halfway up the island. Closer to the plantation and the foreman's yard.", preview: { x: 0, z: 62, r: 26 } },
  { id: "cove", name: "Smuggler's Cove", region: "Smuggler's Cove", entryGroup: "cove", cost: 15,
    requires: [{ item: "cove_flare", reason: "Needs a cove signal flare in your stash: the Radio Operator's job \"Signal Fire\"" }],
    blurb: "Land on the smugglers' sand at the west end of the beach. The grotto cave and the cove boat are steps away.", preview: { x: -82, z: 96, r: 24 } },
];
export const destOf = (id: string) => DESTINATIONS.find((d) => d.id === id);

export type DestState = { unlocked: boolean; affordable: boolean; ok: boolean; reason: string };
export function destinationState(id: string, save: SaveV1): DestState {
  const d = destOf(id);
  if (!d) return { unlocked: false, affordable: false, ok: false, reason: "Unknown destination" };
  const missing = d.requires.find((p) => !prereqMet(p, save)), unlocked = !missing, affordable = save.money >= d.cost;
  return { unlocked, affordable, ok: unlocked && affordable, reason: missing ? missing.reason : !affordable ? `The fare is 🍌 ${d.cost}` : "" };
}
export const canDeploy = (id: string, save: SaveV1) => { const s = destinationState(id, save); return { ok: s.ok && !pending, reason: pending ? "Already on the way" : s.reason }; };

export type DeployRequest = { destinationId: string; name: string; entryGroup: string; paid: number };
let pending: DeployRequest | null = null;
export const pendingDeploy = () => pending;
/** Confirm: re-check, pay the fare once and write the save (core/save.ts save, passed in), and hand back the request. Refuses while a launch is already on its
 *  way, so a double-click can't pay twice. The caller starts the raid, then calls settleDeploy() (or cancelDeploy()
 *  if loading failed, which refunds). */
export function deploy(id: string, save: SaveV1, write: (s: SaveV1) => void): { ok: true; req: DeployRequest } | { ok: false; reason: string } {
  const d = destOf(id), can = canDeploy(id, save);
  if (!d || !can.ok) return { ok: false, reason: can.reason };
  if (d.cost && !debit(save, "fare", d.cost, { note: d.id })) return { ok: false, reason: `The fare is 🍌 ${d.cost}` };
  write(save);
  pending = { destinationId: d.id, name: d.name, entryGroup: d.entryGroup, paid: d.cost };
  return { ok: true, req: pending };
}
export function settleDeploy() { pending = null; }
export function cancelDeploy(save: SaveV1, write: (s: SaveV1) => void) {
  if (!pending) return;
  if (pending.paid) credit(save, "refund", pending.paid, { note: `fare ${pending.destinationId}` });
  write(save); pending = null;
}

export type SpawnPick = { entry: EntryPoint; clearance: number; fallback: null | "crowded" | "start" };
/** choose a start in the group: walkable, no enemy within its safe radius; random among the valid ones (seeded per
 *  raid, its own stream so enemy and crate rolls are unchanged). Explicit fallbacks: "crowded" = every candidate has
 *  an enemy too close, take the one with the most room; "start" = none is walkable, use the beach hatch START. */
export function pickEntry(group: string, enemies: readonly { x: number; z: number }[], walkable: (x: number, z: number) => boolean, seed: number): SpawnPick {
  const rng = mulberry32((seed ^ 0x5eed1e) >>> 0);
  const clear = (e: EntryPoint) => enemies.reduce((m, q) => Math.min(m, Math.hypot(q.x - e.x, q.z - e.z)), Infinity);
  const cands = ENTRY_POINTS.filter((e) => e.group === group && walkable(e.x, e.z)).map((e) => ({ e, c: clear(e) }));
  const ok = cands.filter((q) => q.c >= q.e.safeRadius);
  if (ok.length) { const q = ok[Math.floor(rng() * ok.length)]; return { entry: q.e, clearance: q.c, fallback: null }; }
  if (cands.length) { const q = cands.reduce((a, b) => (b.c > a.c ? b : a)); return { entry: q.e, clearance: q.c, fallback: "crowded" }; }
  const s: EntryPoint = { id: "start", group, x: START.x, z: START.z, facing: Math.PI, safeRadius: SAFE_RADIUS };
  return { entry: s, clearance: clear(s), fallback: "start" };
}
