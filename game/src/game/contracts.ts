// G1 worker contracts. Every parallel worker builds against these types; only the lead edits this file.
// Units: world units (1 u ~ 1 m), seconds, radians. +y is up; a heading of 0 faces +z.
import type * as THREE from "three";

// ---------------------------------------------------------------- actors/ (Fable A: rig v2)
/** Every option the character creator can set. Defaults (DEFAULT_LOOK in actors/look.ts) = the brand Businessman (BRAND.md). */
export type MonkeyLook = {
  v: 1;
  fur: string; face: string; // hex colours
  headSize: number;          // -0.3..0.3 offset on the default head scale
  ears: { style: "round" | "pointy" | "floppy"; size: number; height: number }; // size 0.7..1.4, height -0.1..0.1
  eyes: { style: "shades" | "round" | "sleepy" | "sparkle" | "monocle"; spacing: number; height: number }; // spacing 0.8..1.2, height -0.06..0.06
  brows: { style: "bold" | "thin" | "bushy" | "none"; tilt: number }; // tilt -0.5 (worried)..0.5 (scheming)
  mouth: "smile" | "grin" | "smirk" | "toothy" | "whistle";
  hat: { style: "bowler" | "tophat" | "cap" | "fedora" | "none"; color: string; band: string };
  suit: string; pants: string; tie: { style: "tie" | "bowtie" | "none"; color: string };
  tail: { curl: number; length: number }; // curl 0..1, length 0.7..1.3
  feet: { style: "round" | "shoes"; color: string };
};

export type RigAction = "idle" | "run" | "aim" | "fire" | "reload" | "melee" | "roll" | "hurt" | "dizzy" | "cheer" | "throw" | "slam" | "charge" | "sleep";
export type RigState = {
  speed: number;   // u/s, drives the run cycle
  face: number;    // body heading
  aim?: number;    // aim heading; upper body twists toward it (up to ~70 deg), legs keep `face`
  action: RigAction;
  t: number;       // 0..1 progress through a timed action (fire, reload, melee, roll, throw, slam); ignored for loops
};
export interface Rig {
  root: THREE.Group;                       // place/rotate this; its scale is the body plan's
  update(dt: number, s: RigState): void;   // pure pose; never moves root.position
  flash(ms?: number): void;                // per-instance hurt flash (must not touch shared materials)
  setLook?(look: MonkeyLook): void;        // monkeys only: rebuild parts live (creator)
  socket(name: "handR" | "handL" | "back" | "hat" | "head"): THREE.Object3D;
  height: number;                          // top of head, for floating text/bars
  dispose(): void;
}
export type BodyPlan = "monkey" | "gorilla";
// actors/rig.ts must export: createRig(plan: BodyPlan, look: MonkeyLook | EnemyStyle): Rig
export type EnemyStyle = { kind: "wild" | "bandit" | "brute" | "sleeper"; fur: string; face: string; outfit?: string; hat?: MonkeyLook["hat"]["style"] | "bandana"; scale?: number };

// ---------------------------------------------------------------- combat/ (Fable B: the Kingpin .45)
export interface GunView {
  root: THREE.Group;       // attach to rig.socket("handR"); muzzle points +z
  muzzle: THREE.Object3D;  // world position/direction of shots
  fire(): void;            // slide kick, flash, light, shell eject (FX live in the scene passed to createGun)
  reload(t: number): void; // pose for reload progress 0..1 (mag out ~0.15, new mag in ~0.65, slide ~0.85)
  update(dt: number): void;
  tracer(from: THREE.Vector3, to: THREE.Vector3, hit: boolean): void;
}
// combat/gunModel.ts must export: createGun(scene: THREE.Scene, id: "kingpin45"): GunView

// ---------------------------------------------------------------- loot/ (Codex Sol)
export type Rarity = "common" | "uncommon" | "rare" | "epic";
export type ItemKind = "sell" | "heal" | "key" | "hat" | "ammo" | "weapon" | "part";
export type ItemDef = { id: string; name: string; icon: string; rarity: Rarity; value: number; kind: ItemKind; stack?: number; perk?: string };
export type CrateTier = "wood" | "green" | "gold";
export type RaidLootState = { cratesOpened: number; usefulFound: number; emptyStreak: number; luck: number };
// loot/tables.ts must export: ITEMS: Record<string, ItemDef>; CRATES: Record<CrateTier, {...}>;
//   rollCrate(tier: CrateTier, st: RaidLootState, rng?: () => number): string[]   (may return [] = an honest empty crate)
//   rollEnemyDrop(kind: EnemyStyle["kind"], rng?: () => number): string[]

// ---------------------------------------------------------------- core/save.ts (Codex Sol)
export type SaveV1 = {
  v: 1; createdAt: string; raids: number; money: number; ammo: number;
  look: MonkeyLook; lookDone: boolean;
  upgrades: { mag: number; pack: number; heart: number };
  stash: string[]; hats: string[]; hat: string | null; keyring: string[];
  order: { id: string; progress: Record<string, number>; done: boolean }[];
  fixtures: string[]; // visible bunker upgrades owned
};
// core/save.ts must export: load(): SaveV1; save(s: SaveV1): void; reset(): SaveV1; migrate(raw: unknown): SaveV1

// ---------------------------------------------------------------- core/bot.ts (Codex Sol)
export type BotView = {
  t: number; scene: "creator" | "bunker" | "raid" | "summary";
  player: { x: number; z: number; hearts: number; maxHearts: number; ammo: number; mag: number; rolling: boolean; packFree: number };
  enemies: { id: number; kind: EnemyStyle["kind"]; x: number; z: number; state: string; hp: number; threat: boolean }[];
  crates: { id: number; x: number; z: number; tier: CrateTier; opened: boolean }[];
  pickups: { id: number; x: number; z: number; item: string }[];
  exits: { id: "hatch" | "raft"; x: number; z: number; open: boolean }[];
  stations: { id: "sell" | "bench" | "orders" | "ladder" | "mirror"; x: number; z: number }[];
  walkable(x: number, z: number): boolean;
  path(fromX: number, fromZ: number, toX: number, toZ: number): { x: number; z: number }[]; // tile-centre waypoints
  raidValue: number; money: number;
};
export type BotInput = { move: { x: number; z: number }; aim?: { x: number; z: number }; fire?: boolean; melee?: boolean; roll?: boolean; interact?: boolean; reload?: boolean; heal?: boolean; buy?: "mag" | "pack" | "heart"; ui?: "start" | "sellAll" | "deliver" | "leave" };
// core/bot.ts must export: createBot(opts?: { greed?: number }): { tick(v: BotView, dt: number): BotInput; log: object[] }
