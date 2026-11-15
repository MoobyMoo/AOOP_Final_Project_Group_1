// G1 worker contracts (v2, after the Fable advisor review items 29-31). Every parallel worker builds against these
// types; only the lead edits this file. Units: world units (1 u ~ 1 m), seconds, radians. +y up; yaw 0 faces +z.
// Gameplay owns all clocks: rigs and guns keep no timers of their own and must not allocate per frame.
import type * as THREE from "three";

// ---------------------------------------------------------------- actors/ (Fable A: rig v2)
/** Everything the character creator sets (the body). DEFAULT_LOOK (actors/look.ts) = the brand Businessman (BRAND.md).
 *  Wearables are NOT part of the body: shades, hats and packs are gear on sockets (Duckov's CharacterModel has
 *  helmet/face/backpack/armor/hand sockets, and a helmet or mask can hide hair/mouth), so they can be swapped,
 *  found in raids and knocked off by hits. */
export type MonkeyLook = {
  v: 2;
  fur: string; face: string;  // hex colours
  headSize: number;           // -0.25..0.25 offset on the default head scale
  ears: { style: EarStyle; size: number };            // size 0.75..1.35
  eyes: { style: EyeStyle; spacing: number };         // spacing 0.85..1.15 (always modelled: visible when no face gear)
  brows: { style: BrowStyle; tilt: number };          // tilt -1 (worried)..1 (scheming)
  mouth: MouthStyle;
  suit: string; pants: string; tie: { style: TieStyle; color: string };
  tail: { curl: number };     // 0 (loose)..1 (tight curl)
  feet: { style: FeetStyle; color: string };
};
export type EarStyle = "round" | "pointy" | "floppy";
export type EyeStyle = "round" | "sleepy" | "sparkle" | "beady";
export type BrowStyle = "bold" | "thin" | "bushy" | "none";
export type MouthStyle = "smile" | "grin" | "smirk" | "toothy" | "whistle";
export type TieStyle = "tie" | "bowtie" | "none";
export type FeetStyle = "round" | "shoes";
/** EQUIPMENT (G1-23, Duckov CharacterEquipmentController: Armor/Helmat/FaceMask/Backpack/Headset slots). Gear is what
 *  you wear; it is loot, not creator cosmetics. Each slot holds an item INSTANCE string: "id" (full condition) or
 *  "id#d" with d = durability 0..100 (integer). parseInst/fmtInst live in loot/equipment.ts.
 *  Default Businessman: suit + bowler + shades + satchel, all BOUND (never lost, never sold). */
export type Gear = { head: string | null; face: string | null; body: string | null; back: string | null; ears: string | null };
export type WearSlot = keyof Gear;
export type EquipSlot = WearSlot;
export type Wearable = { id: string; slot: WearSlot; name: string; rarity: "common" | "uncommon" | "rare" | "epic"; hidesEars?: boolean; hidesBrows?: boolean; hidesTie?: boolean };
/** equipment stats (our numbers; Duckov mechanisms in research/duckov-re: CODE_FINDINGS 2.2 armor, FINDINGS E2 ranges).
 *  headArmor is used for enemy critical hits, bodyArmor for the rest: damage x 2 / (max(0, A - pen) + 2).
 *  An armor piece loses durability on every hit it mitigates; at 0 it gives no armor (still worn) until repaired. */
export type EquipDef = Wearable & {
  value: number; weight: number;          // sale value at full condition (scales with durability), kg
  headArmor?: number; bodyArmor?: number; // 0..4 (head) / 0..4 (body)
  dur?: number;                            // has durability when set (max 100)
  packSlots?: number; maxWeight?: number;  // back/body pockets: extra pack slots, extra carry kg
  perk?: { crit?: number; critDmg?: number; aim?: number; notice?: number; search?: number; heal?: number; hearing?: number; speed?: number };
  // crit +chance 0..1, critDmg +mult, aim = magnet deg, notice = enemy notice-range factor (<1 = stealthier), search = crate
  // open-time factor (<1 faster), heal = heal amount factor, hearing = show enemy footsteps within N u, speed = move factor
  bound?: boolean;                         // starter piece: never dropped on a bonk-out, never sold; goes home when replaced
};
/** non-player looks: wild monkeys, bandits (bandana, mask, striped shirt, sack), gorillas */
export type EnemyStyle = { kind: "wild" | "bandit" | "brute" | "sleeper"; seed: number };

export type RigAction =
  | "idle" | "run" | "fire" | "reload" | "melee" | "roll" | "hurt" | "throw" | "defeat"    // monkey
  | "sleep" | "walk" | "windup" | "slam" | "charge" | "stunned";                           // gorilla (+ idle, hurt, defeat)
export type RigState = {
  time: number;          // gameplay clock (s), for loops (breath, tail, run cycle phase)
  speed: number;         // u/s along moveYaw; drives the run cycle; strafing/backpedal must look right
  moveYaw: number;       // legs/hips heading
  faceYaw: number;       // upper body + head + arms aim heading (twist up to ~75 deg from moveYaw, beyond that the hips turn)
  action: RigAction;
  actionT: number;       // 0..1 progress through timed actions (fire, reload, melee, roll, hurt, throw, windup, slam, defeat)
  armed: "none" | "pistol" | "briefcase";
  flash: number;         // 0..1 hurt/hit flash, per instance (never mutate shared materials)
};
export interface Rig {
  root: THREE.Group;     // gameplay sets root.position and root.rotation.y = moveYaw; pose() never moves root.position
  sockets: { handR: THREE.Object3D; handL: THREE.Object3D; back: THREE.Object3D; head: THREE.Object3D; face?: THREE.Object3D; body?: THREE.Object3D; ears?: THREE.Object3D }; // monkeys also expose face/body/ears (G1-23); body armor is skinned, the body socket is for rigid extras
  bounds: { radius: number; height: number };
  pose(s: RigState): void;
  setLook?(look: MonkeyLook): void;   // monkeys: rebuild the changed parts live (creator)
  dressBoss?(): void;                 // gorillas: the Plantation boss look (bigger, armor plates, head left bare: headshots count)
  setGear?(gear: Gear): void;         // monkeys: swap wearables on the head/face/back sockets
  knockOff?(slot: WearSlot): THREE.Object3D | null; // detach a wearable (world space) for the hit gag; gameplay animates it and re-attaches via setGear
  dispose(): void;
}
// actors/rig.ts exports: createRig(plan: "monkey", look: MonkeyLook): Rig; createRig(plan: "monkey" | "gorilla", style: EnemyStyle): Rig
// actors/wearables.ts exports: WEARABLES: Wearable[], DEFAULT_GEAR: Gear, buildWearable(id): THREE.Object3D (for icons/pickups too)
// actors/look.ts exports: DEFAULT_LOOK, LOOK_PRESETS: {name, look}[], randomLook(rng), encodeLook(l): string, decodeLook(s): MonkeyLook | null
// Budget per rig: <= 8 draw calls, <= 6k triangles, zero allocation in pose().

// ---------------------------------------------------------------- combat/ (Fable B: the Kingpin .45)
export interface GunView {
  root: THREE.Group;       // grip at origin, barrel along +z; long enough (>= 0.9 u incl. slide) to read at camera dist 40
  muzzle: THREE.Object3D; eject: THREE.Object3D;
  setVariant(v: { extMag: boolean }): void;
  /** fitted attachments (G1.5 row 36): shows each on its named socket (socket_sight / socket_muzzle / socket_mag /
   *  socket_rail) when the models are loaded; a slot with no model, or a gun with no sockets, shows nothing */
  setAttachments?(fitted: GunAtts): void;
  /** the fitted laser's beam origin (null with no laser, or no laser model) */
  laser?: THREE.Object3D | null;
  pose(s: { fireT: number; reloadT: number }): void; // fireT: 0..1 after a shot (slide back/forward), reloadT: 0..1 (or -1 = not reloading)
}
export interface GunFx {   // pooled; no per-shot allocation
  fire(muzzle: THREE.Object3D, eject: THREE.Object3D, to: THREE.Vector3, hit: "enemy" | "wall" | "none"): void; // flash + light + shell + tracer + impact puff
  update(dt: number): void;
  /** a bullet landed (projectile bullets call this on arrival instead of fire() drawing an instant tracer) */
  impact?(at: THREE.Vector3, dir: THREE.Vector3, hit: "enemy" | "wall"): void;
}
// combat/kingpin.ts exports: createKingpin(): GunView; createGunFx(scene: THREE.Scene): GunFx

// ---------------------------------------------------------------- world/kit (Fable C)
export type MatId = "matte" | "foliage" | "emissive";
/** geometry, not meshes: the world merges pieces per 16 u chunk (draw-call budget <= 700 per frame) */
export type KitPiece = { geo: THREE.BufferGeometry /* position, normal, color (vertex colours) */; mat: MatId; footprint: number; blocksMove: boolean; blocksShot: boolean; tall: boolean };
// ---------------------------------------------------------------- map v3 (G1-22, lead-owned)
/** collision shapes in a piece's local space (+y up, front +z, origin on the ground). move = blocks walking;
 *  shot = blocks bullets and LOS; low = waist-high cover (blocks walking, not shots or sight over it). */
export type Collider =
  | { t: "box"; x: number; z: number; w: number; d: number; yaw?: number; move: boolean; shot: boolean; low?: boolean; id?: string }
  | { t: "circle"; x: number; z: number; r: number; move: boolean; shot: boolean; low?: boolean; id?: string }
  | { t: "seg"; ax: number; az: number; bx: number; bz: number; thick: number; move: boolean; shot: boolean; low?: boolean; id?: string };
/** one placed kit instance in a map file. k = builder id ("palm", "building:cellblock", "wall:stone"...), o = builder options */
export type Placed = { k: string; x: number; z: number; yaw?: number; s?: number; o?: Record<string, unknown>; id?: string };
/** an enterable building (Duckov OcclusionFade + DarkRoomFade + Door, our implementation). All transforms in the
 *  building's local space; parts live under parts.root. */
export type BuildingDef = {
  pieces: KitPiece[];                         // static merged geometry: floors, lower walls, interior props
  parts: Record<string, THREE.Object3D>;      // must include root, roof (fades), upper (upper walls/front walls that fade)
  colliders: Collider[];                      // walls, interior furniture, door leaves (door colliders carry the door id)
  interiors: { x: number; z: number; w: number; d: number; h: number }[];   // inside volumes: roof fade + dark tint
  doors: { id: string; leaf: string /* parts key */; axis: "y"; open: number; breakable?: boolean; locked?: string /* key item id */ }[];
  lights: string[];                           // parts keys of point-light anchors inside
  breakables?: { id: string; intact: string; debris: string; remains: string }[]; // breakable wall parts (collider carries the id)
};
// world/kit_house.ts (Fable W2) exports preloadHouse(), building(id, opts?): BuildingDef, houseModule(name, opts?) for
//   one-off assembly. Each kit (nature/build/house) also exports collidersFor(k, o?): Collider[] for its placed pieces.

// world/kit2.ts exports builders (seeded rng param) returning KitPiece[] for: palm, broadTree, bush, fern, bigLeaf, bananaPlant,
//   rock, log, stump, crate(tier), barrel, sack, tent, campfire, lantern, fence, tarp, ruin pieces, vine door, raft,
//   hatch, driftwood/shells, plus the bunker room set. Lights/animated parts are returned separately as Object3D.

// ---------------------------------------------------------------- loot/ (Codex Sol)
export type Rarity = "common" | "uncommon" | "rare" | "epic";
export type ItemKind = "sell" | "heal" | "key" | "ammo" | "attachment" | "part" | "wear" | "note"; // note = a readable lore note (loot/storyitems.ts)
export type ItemDef = { id: string; name: string; icon: string; rarity: Rarity; value: number; kind: ItemKind; stack?: number; weight?: number }; // weight in kg-ish units (Duckov-style weight states)
export type CrateTier = "wood" | "green" | "gold";
export type RaidLootCtx = { raid: number; cratesOpened: number; usefulFound: number; emptyStreak: number; ammoFound: number; orderNeeds: string[] };
// loot/tables.ts exports: ITEMS, CRATE_TABLES, rollCrate(tier, ctx, rng): string[] (may be [] = honest empty), rollEnemyDrop(kind, ctx, rng): string[]
// Seeded: never Math.random. Explicit probabilities, independent of list order.

/** GUN ATTACHMENTS (G1.5 row 36; Duckov's gun SlotCollection, research/duckov-re/POLISH_FINDINGS.md "Attachments").
 *  The Kingpin is a pistol, so it has a pistol's slots. Each holds an attachment item id (loot/attachments.ts) or null.
 *  Attachments carry stat modifiers (add, percent, multiply, applied in that order) onto the gun's handling stats. */
export type AttSlot = "sight" | "muzzle" | "mag" | "laser";
export type GunAtts = Record<AttSlot, string | null>;

// ---------------------------------------------------------------- core/save.ts (Codex Sol)
export type SaveV1 = {
  activeRaid?: import("./core/settlement").RaidCheckpoint;
  settlements?: import("./core/settlement").Settlement[];
  delivery?: string[];
  deployReceipt?: { id: string; paid: number };
  boundWeapons?: { kingpin: string; briefcase: string };
  v: 1; createdAt: string; raids: number; money: number; ammo: number;
  look: MonkeyLook; lookDone: boolean; gear: Gear; locker: string[]; // gear = worn instances; locker = equipment and gun attachments kept at home (instances / ids)
  satchel: { items: string[]; x: number; z: number } | null; // pack dropped on a bonk-out: recoverable once next raid (Duckov corpse rule)
  upgrades: { mag: number; pack: number; heart: number };
  keys: string[]; trophies: string[]; reserved: string[];   // keys auto-kept, trophies shown in the bunker, order items reserved
  order: { id: string; progress: Record<string, number>; done: boolean } | null;
  fixtures: string[]; salMovedIn: boolean;
  gun: GunAtts;                                              // what is fitted on the Kingpin (kept through a bonk-out: the gun is yours for good)
  stats: { bonkOuts: number; extracts: number; best: number };
  base: BaseLayout; // the vault's built facilities (home/facilities.ts; G1.5 row 17). Old saves migrate to the old room's stations
  quests?: import("./core/quests").QuestSave; // jobs, notes read, unlocks and the quest payout ledger (core/quests.ts; G1.5 row 40). core/save.ts always fills it
};
/** the vault's saved layout (Duckov BuildingManager save: building id, grid cell, rotation, tokens). x, z = the
 *  footprint's min-corner cell, r = quarter turns; tokens = facilities packed up into storage (placing one is free) */
export type BaseLayout = { v: 1; next: number; items: { uid: number; def: string; x: number; z: number; r: 0 | 1 | 2 | 3 }[]; tokens: Record<string, number> };
// core/save.ts exports: load(): SaveV1; save(s: SaveV1): void (called only at home); reset(): SaveV1; migrate(raw: unknown): SaveV1

// ---------------------------------------------------------------- core/bot.ts (Codex Sol)
export type BotView = {
  t: number; scene: "creator" | "bunker" | "raid" | "summary";
  player: { x: number; z: number; hearts: number; maxHearts: number; ammo: number; mag: number; reloading: boolean; rolling: boolean; packFree: number; packValue: number };
  enemies: { id: number; kind: EnemyStyle["kind"]; x: number; z: number; state: string; hp: number; windup: boolean; awake: boolean }[];
  crates: { id: number; x: number; z: number; tier: CrateTier; opened: boolean }[];
  pickups: { id: number; x: number; z: number; item: string }[];
  exits: { id: "hatch" | "raft" | "tunnel" | "boat"; x: number; z: number; open?: boolean }[]; // tunnel opens once the grotto rubble is broken
  stations: { id: "sell" | "bench" | "orders" | "ladder" | "mirror" | "sal"; x: number; z: number }[];
  walkable(x: number, z: number): boolean;
  path(fx: number, fz: number, tx: number, tz: number): { x: number; z: number }[];
  los(ax: number, az: number, bx: number, bz: number): boolean;
  raidT: number; money: number; raids: number; doorOpen: boolean; hasKey: boolean;
};
export type BotInput = { move: [number, number]; aim?: [number, number]; fire?: boolean; melee?: boolean; roll?: boolean; interact?: boolean; reload?: boolean; heal?: boolean; buy?: "mag" | "pack" | "heart"; ui?: "start" | "leave" };
// core/bot.ts exports: createBot(opts: { greed: number; reactionLag: number; seed: number }): { tick(v: BotView, dt: number): BotInput; events: object[] }
