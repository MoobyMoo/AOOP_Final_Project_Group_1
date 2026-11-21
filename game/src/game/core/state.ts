// Shared raid state. Modules import G instead of passing a dozen references around.
import * as THREE from "three";
import type { Stage } from "../render/stage";
import type { Rig, GunView, GunFx, Gear } from "../contracts";
import type { Input, Intent } from "./input";
import type { SaveV1 } from "../contracts";
import { gunOf, noRounds, type Caliber } from "../combat/guns";

/** the caliber of the gun in the active slot (null: empty slot or melee) */
export function activeCaliber(): Caliber | null {
  const inst = G.save?.guns?.[G.slot]?.inst; if (!inst) return null;
  return gunOf(inst)?.caliber ?? null;
}

export type Enemy = {
  id: number; kind: "wild" | "bandit" | "brute" | "sleeper"; rig: Rig; p: THREE.Vector3; vel: THREE.Vector3; face: number;
  hp: number; max: number; state: string; t: number; actionT: number; home: THREE.Vector3; group?: string; tag?: string;
  path: { x: number; z: number }[]; repath: number; flash: number; hitAt?: number; stolen: string[]; carry: string[];
  zs: number; quiet: number; lastSeen: THREE.Vector3 | null; lostT: number; rang?: Rang | null; ring?: THREE.Mesh; stripe?: THREE.Group;
  alertMark?: THREE.Sprite; active: boolean; down: boolean; downT: number; hatOff?: boolean;
  gear?: Gear; gearSeed?: number;
  /** raid time it may wake (staggered activation, ai/encounters.ts); fauna = a hostile animal run by ai/fauna.ts */
  wakeAt?: number; fauna?: "boar" | "croc";
};
export type Rang = { p: THREE.Vector3; from: THREE.Vector3; dir: THREE.Vector3; t: number; out: number; mesh: THREE.Object3D; owner: Enemy; hitDone: boolean; back: boolean };
/** anything you search with E (G1.5 rows 18, 27): a generic crate (tiered, fixed rewards), a typed container or a
 *  knocked-out enemy's body. session = the search (loot/search.ts): per-item reveal, kept between openings.
 *  opened = searched out (nothing left to reveal or take); started = the lid is up / the search has begun */
export type Crate = {
  id: number; x: number; z: number; tier: "wood" | "green" | "gold"; fixed?: string; obj: THREE.Object3D; opened: boolean; search: number; items: string[] | null; beam?: THREE.Object3D;
  kind?: "crate" | "container" | "body"; type?: import("../loot/containers").ContainerType; label?: string; socket?: string;
  session?: import("../loot/search").SearchSession | null; started?: boolean; enemy?: Enemy; r?: number; note?: string;
};
/** an item lying in the world as its own model (G1.5 row 04+). p = where it is (x, z; y = its height while it flies),
 *  v = velocity while thrown (Duckov's toss: rotation frozen), rest = settled. obj comes from a per-model pool */
export type Pickup = { id: number; item: string; p: THREE.Vector3; obj: THREE.Object3D; vy: number; landed: boolean; t: number; n?: number; v?: THREE.Vector3; key?: string; land?: number };

export const G = {
  stage: null as unknown as Stage, input: null as unknown as Input, intent: null as unknown as Intent,
  save: null as unknown as SaveV1,
  scene: "creator" as "creator" | "bunker" | "raid" | "summary" | "map",
  time: 0, raidT: 0, hitStop: 0, seed: 1,
  rng: Math.random as () => number,
  // player
  rig: null as unknown as Rig, gun: null as unknown as GunView, fx: null as unknown as GunFx,
  pp: new THREE.Vector3(), vel: new THREE.Vector3(), moveYaw: 0, aimYaw: 0, aimPoint: new THREE.Vector3(),
  hp: 100, maxHp: 100, stamina: 100, staminaDelay: 0, sprinting: false, painT: 0, armor: 0, weight: 0, iframes: 0, alive: true,
  useItem: null as null | { id: string; t: number; time: number }, ads: false,
  /** WEAPON SLOTS (combat/arsenal.ts; POLISH_FINDINGS 17). slot = the gun in hand (0 = key 1, 1 = key 2); each gun keeps
   *  its own loaded rounds (loaded[slot], Duckov stores them on the gun item); reserve = loose rounds by caliber.
   *  drawT = seconds since the last draw (Duckov holdStadyTime 0.15 s: no firing before it); burst = rounds left in a burst */
  slot: 0 as 0 | 1, loaded: [0, 0] as [number, number], reserve: noRounds(), drawT: 9, burstLeft: 0,
  /** loaded rounds in the gun in hand (the reload loop and the HUD read and write this) */
  get mag(): number { return this.loaded[this.slot]; },
  set mag(v: number) { this.loaded[this.slot] = v; },
  /** reserve rounds that fit the gun in hand (Duckov shows and reloads only the matching type) */
  get ammo(): number { const c = activeCaliber(); return c ? this.reserve[c] : 0; },
  set ammo(v: number) { const c = activeCaliber(); if (c) this.reserve[c] = v; },
  magSize: 8, fireCd: 0, fireT: 1, reloadT: -1, reloadPaused: false,
  reloadTime: 1.2, // seconds the current reload takes (combat/reload.ts); reloadT is its 0..1 progress, -1 = none
  meleeT: -1, meleeHit: false, meleeCd: 0,
  rollT: -1, rollDir: new THREE.Vector3(), rollCd: 0, skidT: 0, rollBuffer: 0, hurtT: -1,
  pack: [] as string[], packSlots: 8, pouchSlots: 2, gear: null as unknown as Gear,
  equipping: null as null | { inst: string; slot: keyof Gear; source: "pack" | "worn"; t: number; time: number },
  equipmentEvents: [] as { type: "equipped" | "interrupted" | "hit" | "broken"; slot?: keyof Gear; inst?: string; message?: string; crit?: boolean; damage?: number }[],
  lockTarget: null as Enemy | null,
  enemies: [] as Enemy[], crates: [] as Crate[], pickups: [] as Pickup[], rangs: [] as Rang[],
  extract: { id: "", t: 0 }, zipping: null as null | { t: number; len: number },
  discovered: new Set<string>(), area: "",
  log: { crates: 0, kills: {} as Record<string, number>, killsBy: { pistol: 0, briefcase: 0 }, shots: 0, hits: 0, hurt: 0, rolls: 0, swaps: 0, missed: 0, firstShot: -1, firstCrate: -1, firstRoll: -1, breaks: [] as string[], value: 0 },
  lootCtx: { raid: 0, cratesOpened: 0, usefulFound: 0, emptyStreak: 0, ammoFound: 0, orderNeeds: [] as string[] },
  bot: false,
  /** this raid's rolled encounters (ai/encounters.ts): what spawned where, for the logs */
  encounters: [] as { id: string; count: number }[],
};
export const V = (x: number, z: number, y = 0) => new THREE.Vector3(x, y, z);
export const ENTRY_GRACE_SECONDS = 10;
export const entryGraceRemaining = () => G.scene === "raid" && G.alive ? Math.max(0, ENTRY_GRACE_SECONDS - G.raidT) : 0;
export const flat = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
export const angDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
