// The vault's buildable facilities (G1.5 row 17; SYSTEMS_PORT H01/H02, POLISH_FINDINGS 11). Pure data and rules, no
// three.js: home/basebuild.ts draws them, home/bunker.ts runs their stations, core/save.ts persists the layout.
//
// Duckov mechanism, ported (BuildingArea / BuilderView / BuildingManager, POLISH_FINDINGS 11):
//  - free placement on an integer grid, 1 cell = 1 m. The recovered area has half-ranges 17 x 13, so anchors run
//    x -16..16 and z -12..12: 33 x 25 = 825 cells. Ours is the same size.
//  - four rotations in 90 degree steps; odd turns swap the footprint's width and depth.
//  - the cursor rounds to a cell, then the integer half-footprint is subtracted: that is the anchor (min corner) cell.
//    World centre = (x - 0.5 + w / 2, z - 0.5 + d / 2).
//  - a placement checks area bounds and occupied cells (authored fixtures count as occupied); the build checks the
//    count cap, prerequisites and payment. A building token pays first, otherwise the cost.
//  - returning (packing up) a building removes it and gives back one token of that type, not the raw cost. Moving is
//    free. Saves keep id, grid cell, rotation and tokens.
// Ours on top (POLISH_FINDINGS 11 rules): a walkway check. Every station's front row must stay reachable from the
// pod on foot, so you can never wall yourself off from the Fence or the exit.
import type { BaseLayout, SaveV1 } from "../contracts";
import { itemType, own } from "../loot/instances";
import { unlocked } from "../core/quests";

export const AREA = { minX: -16, maxX: 16, minZ: -12, maxZ: 12 } as const;
export const AREA_W = AREA.maxX - AREA.minX + 1, AREA_D = AREA.maxZ - AREA.minZ + 1; // 33 x 25

export type FacilityId = "fence" | "bench" | "sal" | "trophy" | "med" | "stash" | "generator" | "press" | "desk" | "plant" | "radio";
export type StarterId = "pod" | "board" | "locker" | "blueprints";
/** what E does at a facility (home/bunker.ts open()) */
export type StationId = "sell" | "bench" | "sal" | "trophies" | "med" | "stash" | "generator" | "press" | "deploy" | "locker" | "blueprints" | "radio" | "talk";
export type FacilityDef = {
  id: FacilityId; name: string; does: string;   // name and one line on what it is for (catalog card)
  w: number; d: number;                         // footprint in cells at rotation 0 (w along x, d along z; front faces +z)
  cost: number; maxCount: number; requires: FacilityId[];
  station?: StationId; label?: string;          // E prompt
  decor?: boolean;                              // no station: needs no free front row
  /** a job's unlock key (core/quests.ts) the blueprint needs, and the card's reason while it's missing */
  unlock?: { key: string; reason: string };
  duckov: string;                               // the Duckov facility function it maps to (SYSTEMS_PORT H02 row)
};
/** Our catalog. Costs are bananas from loot/tables.ts's economy; npm run sim checks them (loot/sim.ts "Base"). The
 *  two stations a new vault needs to function (selling and the bench) are free to place, so the upgrade-cadence gate
 *  is unchanged by the empty start. */
export const CATALOG: FacilityDef[] = [
  { id: "fence", name: "The Fence's Teller Window", does: "Sell your haul and spare gear", w: 4, d: 2, cost: 0, maxCount: 1, requires: [], station: "sell", label: "The Fence: sell your haul", duckov: "H02 #05/#06 traders (sell side)" },
  { id: "bench", name: "Back-Office Workbench", does: "Buy upgrades and repair your gear", w: 3, d: 2, cost: 0, maxCount: 1, requires: [], station: "bench", label: "Workbench: upgrades and repairs", duckov: "H02 #01/#02 workshop (repair, upgrades)" },
  { id: "sal", name: "Sal's Corner Desk", does: "Sal's job board. Finish his job and he sells ammo and heals here", w: 3, d: 2, cost: 30, maxCount: 1, requires: [], station: "sal", label: "Sal's desk", duckov: "H02 #19 move-in merchant + E03 contracts" },
  { id: "trophy", name: "Trophy Wall", does: "Shows your epic finds and your raid record", w: 3, d: 1, cost: 40, maxCount: 1, requires: [], station: "trophies", label: "Trophy wall", duckov: "H02 #16/#21 trophy and display shelf (no stat bonus)" },
  { id: "med", name: "First-Aid Kiosk", does: "Make bandages from vine rope and smoothies from bananas", w: 3, d: 1, cost: 120, maxCount: 1, requires: [], station: "med", label: "First-aid kiosk: make heals", duckov: "H02 #11 medical station (medical crafting)" },
  { id: "stash", name: "Safe-Deposit Wall", does: "12 more stash slots for loot and gear. You can build two", w: 3, d: 1, cost: 80, maxCount: 2, requires: [], station: "stash", label: "Safe-deposit wall", duckov: "H04 player storage capacity (+slots)" },
  { id: "generator", name: "Vault Generator", does: "Powers the ammo press and switches on the big vault lights", w: 2, d: 2, cost: 60, maxCount: 1, requires: [], station: "generator", label: "Vault generator", duckov: "H01 building prerequisites (upgrade gate)" },
  { id: "press", name: "Coin-Op Ammo Press", does: "Press springs and old gears into .45 rounds. Needs the generator", w: 2, d: 2, cost: 140, maxCount: 1, requires: ["generator"], station: "press", label: "Ammo press", duckov: "H03 crafting (ammo recipe)",
    unlock: { key: "fac:press", reason: "Blueprint from the Radio Operator's job \"Gang Frequencies\"" } },
  { id: "radio", name: "Radio Desk", does: "A desk for the Radio Operator: gang chatter, hints, raid warnings and his jobs", w: 2, d: 1, cost: 0, maxCount: 1, requires: [], station: "radio", label: "The Radio Operator", duckov: "H02 move-in NPC + E03 quest giver",
    unlock: { key: "fac:radio", reason: "Blueprint from Sal's job \"Office Supplies\"" } },
  { id: "desk", name: "Manager's Desk", does: "Decor. Somewhere to put your feet up", w: 4, d: 2, cost: 25, maxCount: 1, requires: [], decor: true, duckov: "H02 #26 decoration (no action)" },
  { id: "plant", name: "Potted Palm", does: "Decor. A bit of green down here", w: 1, d: 1, cost: 10, maxCount: 3, requires: [], decor: true, duckov: "H02 #26 decoration (no action)" },
];
export const defOf = (id: string) => CATALOG.find((d) => d.id === id);

/** fixtures the vault starts with (Duckov's authored base objects): fixed, never saved, never moved */
export type Starter = { id: StarterId; name: string; x: number; z: number; w: number; d: number; r: number; station: StationId; label: string };
export const STARTERS: Starter[] = [
  { id: "pod", name: "Banana Express", x: -1, z: -12, w: 3, d: 3, r: 0, station: "deploy", label: "Banana Express: pick a destination" },
  { id: "board", name: "Departures board", x: 2, z: -11, w: 2, d: 1, r: 0, station: "deploy", label: "Departures board: pick a destination" },
  { id: "blueprints", name: "Blueprint desk", x: -4, z: -11, w: 2, d: 1, r: 0, station: "blueprints", label: "Blueprint desk: build" },
  { id: "locker", name: "Locker and mirror", x: -8, z: -12, w: 3, d: 1, r: 0, station: "locker", label: "Locker and mirror: your gear and your look" },
];
/** where you stand when you arrive (in front of the pod) */
export const SPAWN = { x: 0, z: -8.2 };

// ---------------------------------------------------------------- grid geometry
export const rotFoot = (w: number, d: number, r: number) => (r & 1 ? { w: d, d: w } : { w, d });
/** Duckov BuilderView: round the cursor to a cell, subtract the integer half-footprint */
export function anchorAt(def: { w: number; d: number }, r: number, wx: number, wz: number) {
  const f = rotFoot(def.w, def.d, r);
  return { x: Math.round(wx) - Math.floor(f.w / 2), z: Math.round(wz) - Math.floor(f.d / 2) };
}
/** Duckov BuildingArea: world centre of a footprint whose min-corner cell is (x, z) */
export function centreOf(def: { w: number; d: number }, x: number, z: number, r: number) {
  const f = rotFoot(def.w, def.d, r);
  return { x: x - 0.5 + f.w / 2, z: z - 0.5 + f.d / 2 };
}
/** rotation r turns the model's +z front by r x 90 degrees (three.js rotation.y = r * PI / 2) */
export const frontOf = (r: number) => [[0, 1], [1, 0], [0, -1], [-1, 0]][r & 3] as [number, number];
export function cellsOf(def: { w: number; d: number }, x: number, z: number, r: number) {
  const f = rotFoot(def.w, def.d, r), out: [number, number][] = [];
  for (let i = 0; i < f.w; i++) for (let j = 0; j < f.d; j++) out.push([x + i, z + j]);
  return out;
}
/** the row of cells just in front of the footprint (where you stand to use it) */
export function frontRow(def: { w: number; d: number }, x: number, z: number, r: number) {
  const f = rotFoot(def.w, def.d, r), [fx, fz] = frontOf(r), out: [number, number][] = [];
  if (fz) { const row = fz > 0 ? z + f.d : z - 1; for (let i = 0; i < f.w; i++) out.push([x + i, row]); }
  else { const col = fx > 0 ? x + f.w : x - 1; for (let j = 0; j < f.d; j++) out.push([col, z + j]); }
  return out;
}
export const inArea = (x: number, z: number) => x >= AREA.minX && x <= AREA.maxX && z >= AREA.minZ && z <= AREA.maxZ;
const key = (x: number, z: number) => `${x},${z}`;

export type Item = BaseLayout["items"][number];
type Thing = { uid: number; name: string; def: { w: number; d: number }; x: number; z: number; r: number; station?: StationId };
const things = (base: BaseLayout, skip?: number): Thing[] => [
  ...STARTERS.map((s) => ({ uid: -1, name: s.name, def: s, x: s.x, z: s.z, r: s.r, station: s.station })),
  ...base.items.filter((i) => i.uid !== skip).flatMap((i) => { const d = defOf(i.def); return d ? [{ uid: i.uid, name: d.name, def: d, x: i.x, z: i.z, r: i.r, station: d.station }] : []; }),
];
/** cell -> the name of what stands there */
export function occupancy(base: BaseLayout, skip?: number) {
  const occ = new Map<string, string>();
  for (const t of things(base, skip)) for (const [cx, cz] of cellsOf(t.def, t.x, t.z, t.r)) occ.set(key(cx, cz), t.name);
  return occ;
}
/** flood fill over free cells from the spawn */
function reachable(occ: Map<string, string>) {
  const seen = new Set<string>(), q: [number, number][] = [[Math.round(SPAWN.x), Math.round(SPAWN.z)]];
  if (occ.has(key(q[0][0], q[0][1]))) return seen;
  seen.add(key(q[0][0], q[0][1]));
  while (q.length) {
    const [x, z] = q.pop()!;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz, k = key(nx, nz);
      if (!inArea(nx, nz) || occ.has(k) || seen.has(k)) continue;
      seen.add(k); q.push([nx, nz]);
    }
  }
  return seen;
}

export type CellCheck = { x: number; z: number; ok: boolean };
export type PlaceCheck = { ok: boolean; reason: string; cells: CellCheck[]; front: CellCheck[] };
/** Can `def` stand with its min-corner cell at (x, z) and rotation r? (skip = the uid being moved). Reasons are
 *  player-facing. */
export function checkPlace(base: BaseLayout, def: FacilityDef, x: number, z: number, r: number, skip?: number): PlaceCheck {
  const occ = occupancy(base, skip), cells: CellCheck[] = [], front: CellCheck[] = [];
  let reason = "";
  for (const [cx, cz] of cellsOf(def, x, z, r)) {
    const out = !inArea(cx, cz), hit = occ.get(key(cx, cz));
    cells.push({ x: cx, z: cz, ok: !out && !hit });
    if (!reason && out) reason = "Outside the vault floor";
    if (!reason && hit) reason = `Overlaps the ${hit}`;
  }
  if (!reason && cells.some((c) => c.x === Math.round(SPAWN.x) && c.z === Math.round(SPAWN.z))) reason = "Keep the pod's landing spot clear";
  if (!reason) {
    // our walkway rule: with this placed, the spawn must still reach every station's front row (this one's too)
    const after = new Map(occ); for (const c of cells) after.set(key(c.x, c.z), def.name);
    const seen = reachable(after);
    if (!def.decor) for (const [cx, cz] of frontRow(def, x, z, r)) front.push({ x: cx, z: cz, ok: inArea(cx, cz) && seen.has(key(cx, cz)) });
    if (!def.decor && !front.some((c) => c.ok)) reason = "Its front is blocked: leave room to walk up to it";
    if (!reason) for (const t of things(base, skip)) {
      if (!t.station) continue;
      if (!frontRow(t.def, t.x, t.z, t.r).some(([cx, cz]) => seen.has(key(cx, cz)))) { reason = `Blocks the way to the ${t.name}`; break; }
    }
  }
  return { ok: !reason, reason, cells, front };
}

// ---------------------------------------------------------------- the build transaction
export const builtCount = (base: BaseLayout, id: string) => base.items.filter((i) => i.def === id).length;
export const has = (save: SaveV1, id: FacilityId) => save.base.items.some((i) => i.def === id);
export const tokens = (save: SaveV1, id: string) => save.base.tokens[id] ?? 0;
/** Can you pick this from the catalog? (Duckov BuilderView: count cap, prerequisites, a token or the cost) */
export function canBuild(save: SaveV1, id: string): { ok: boolean; reason: string; free: boolean; cost: number } {
  const def = defOf(id);
  if (!def) return { ok: false, reason: "Unknown facility", free: false, cost: 0 };
  const free = tokens(save, id) > 0, cost = free ? 0 : def.cost;
  if (builtCount(save.base, id) >= def.maxCount) return { ok: false, reason: def.maxCount > 1 ? `All ${def.maxCount} built` : "Already built", free, cost };
  const missing = def.requires.filter((r) => !has(save, r));
  if (missing.length) return { ok: false, reason: `Needs the ${missing.map((m) => defOf(m)!.name).join(" and ")}`, free, cost };
  if (def.unlock && !free && !unlocked(save, def.unlock.key)) return { ok: false, reason: def.unlock.reason, free, cost }; // a packed-up one (a token) is already yours
  if (save.money < cost) return { ok: false, reason: `Needs 🍌 ${cost}`, free, cost };
  return { ok: true, reason: "", free, cost };
}
export type BuildResult = { ok: true; item: Item; paid: number; usedToken: boolean } | { ok: false; reason: string };
/** validate, pay (a token first, otherwise money), then place. Pays exactly once per placed facility. */
export function build(save: SaveV1, id: string, x: number, z: number, r: number): BuildResult {
  const def = defOf(id), can = canBuild(save, id);
  if (!def || !can.ok) return { ok: false, reason: can.reason };
  const at = checkPlace(save.base, def, x, z, r & 3);
  if (!at.ok) return { ok: false, reason: at.reason };
  if (can.free) save.base.tokens[id] = tokens(save, id) - 1; else save.money -= def.cost;
  if (!save.base.tokens[id]) delete save.base.tokens[id];
  const item: Item = { uid: save.base.next++, def: id, x, z, r: (r & 3) as Item["r"] };
  save.base.items.push(item);
  return { ok: true, item, paid: can.free ? 0 : def.cost, usedToken: can.free };
}
/** relocate (free, like Duckov's move) */
export function move(save: SaveV1, uid: number, x: number, z: number, r: number): { ok: boolean; reason: string } {
  const item = save.base.items.find((i) => i.uid === uid), def = item && defOf(item.def);
  if (!item || !def) return { ok: false, reason: "Nothing to move" };
  const at = checkPlace(save.base, def, x, z, r & 3, uid);
  if (!at.ok) return at;
  item.x = x; item.z = z; item.r = (r & 3) as Item["r"];
  return { ok: true, reason: "" };
}
/** pack up (Duckov's "return"): the facility goes back into storage as one token; placing it again is free. Money
 *  spent is not paid back. Refused if it would strand another station (it never does: removing only frees cells). */
export function packUp(save: SaveV1, uid: number): { ok: boolean; def?: FacilityId } {
  const i = save.base.items.findIndex((it) => it.uid === uid);
  if (i < 0) return { ok: false };
  const [item] = save.base.items.splice(i, 1);
  save.base.tokens[item.def] = tokens(save, item.def) + 1;
  return { ok: true, def: item.def as FacilityId };
}

// ---------------------------------------------------------------- functions that depend on what's built
export const STASH_BASE = 24, STASH_PER_WALL = 12;
/** stash slots (Duckov PlayerStorage capacity + AddPlayerStorage providers): loose loot plus stored gear */
export const stashCapacity = (save: SaveV1) => STASH_BASE + STASH_PER_WALL * builtCount(save.base, "stash");
export const stashUsed = (save: SaveV1) => save.reserved.length + save.locker.length;
export const powered = (save: SaveV1) => has(save, "generator");

/** home crafting (SYSTEMS_PORT H03: immediate craft, inputs from the stash). out "ammo:n" adds rounds. */
export type Recipe = { id: string; at: FacilityId; name: string; inputs: Record<string, number>; out: string; n: number; power?: boolean };
export const RECIPES: Recipe[] = [
  { id: "bandage", at: "med", name: "2 Banana-Leaf Bandages", inputs: { vine_rope: 1 }, out: "bandage", n: 2 },
  { id: "smoothie", at: "med", name: "Banana Smoothie", inputs: { banana: 2 }, out: "smoothie", n: 1 },
  { id: "rounds8", at: "press", name: "8 rounds of .45", inputs: { spring: 1 }, out: "ammo", n: 8, power: true },
  { id: "rounds16", at: "press", name: "16 rounds of .45", inputs: { old_gear: 1 }, out: "ammo", n: 16, power: true },
];
export function canCraft(save: SaveV1, r: Recipe): { ok: boolean; reason: string } {
  if (!has(save, r.at)) return { ok: false, reason: `Build the ${defOf(r.at)!.name}` };
  if (r.power && !powered(save)) return { ok: false, reason: "No power: build the Vault Generator" };
  for (const [id, n] of Object.entries(r.inputs)) if (save.reserved.filter((inst) => itemType(inst) === id).length < n) return { ok: false, reason: "Not enough in your stash" };
  const grow = r.out === "ammo" ? 0 : r.n - Object.values(r.inputs).reduce((a, b) => a + b, 0);
  if (grow > 0 && stashUsed(save) + grow > stashCapacity(save)) return { ok: false, reason: "Stash full: sell something or build a Safe-Deposit Wall" };
  return { ok: true, reason: "" };
}
/** consume inputs and add outputs in one step; nothing changes unless all of it can */
export function craft(save: SaveV1, id: string): boolean {
  const r = RECIPES.find((q) => q.id === id);
  if (!r || !canCraft(save, r).ok) return false;
  for (const [item, n] of Object.entries(r.inputs)) for (let k = 0; k < n; k++) save.reserved.splice(save.reserved.findIndex(inst => itemType(inst) === item), 1);
  if (r.out === "ammo") save.ammo += r.n; else for (let k = 0; k < r.n; k++) save.reserved.push(own(r.out));
  return true;
}

// ---------------------------------------------------------------- save
export const emptyBase = (): BaseLayout => ({ v: 1, next: 1, items: [], tokens: {} });
/** the stations an old save already had in the fixed room (the Fence, the bench, Sal's board, the trophy shelf),
 *  placed along the back wall so an old save keeps everything that worked */
export function legacyBase(): BaseLayout {
  const b = emptyBase();
  for (const [def, x, z, r] of [["fence", -13, -12, 0], ["bench", 6, -12, 0], ["sal", 10, -12, 0], ["trophy", 16, -4, 3]] as const) b.items.push({ uid: b.next++, def, x, z, r });
  return b;
}
const int = (v: unknown, lo: number, hi: number): number | null => typeof v === "number" && Number.isSafeInteger(v) && v >= lo && v <= hi ? v : null;
/** validate a saved layout. Anything unknown is dropped; anything that no longer fits (overlap, out of bounds, over
 *  its cap) goes back into storage as a token, so a bad layout can never lose a paid-for facility. */
export function sanitizeBase(value: unknown): BaseLayout {
  const raw = value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const out = emptyBase();
  const tok = raw.tokens !== null && typeof raw.tokens === "object" && !Array.isArray(raw.tokens) ? raw.tokens as Record<string, unknown> : {};
  for (const [id, n] of Object.entries(tok)) { const c = int(n, 1, 99); if (defOf(id) && c) out.tokens[id] = c; }
  const uids = new Set<number>(); let next = int(raw.next, 1, 1e9) ?? 1;
  for (const it of Array.isArray(raw.items) ? raw.items : []) {
    const o = it !== null && typeof it === "object" ? it as Record<string, unknown> : {};
    const def = typeof o.def === "string" ? defOf(o.def) : undefined;
    if (!def) continue;
    const x = int(o.x, AREA.minX, AREA.maxX), z = int(o.z, AREA.minZ, AREA.maxZ), r = int(o.r, 0, 3);
    let uid = int(o.uid, 1, 1e9);
    if (uid === null || uids.has(uid)) uid = null;
    const fits = x !== null && z !== null && r !== null && builtCount(out, def.id) < def.maxCount && checkPlace(out, def, x, z, r).cells.every((c) => c.ok);
    if (!fits) { out.tokens[def.id] = (out.tokens[def.id] ?? 0) + 1; continue; }
    if (uid === null) uid = Math.max(next, ...uids, 0) + 1;
    uids.add(uid); next = Math.max(next, uid + 1);
    out.items.push({ uid, def: def.id, x: x!, z: z!, r: r as Item["r"] });
  }
  out.next = next;
  return out;
}
