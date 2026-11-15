// Combat + body numbers (ours), on Duckov's mechanisms (Moo 2026-11-15: "health and stamina like Duckov").
// Mechanism sources: research/duckov-re/CODE_FINDINGS.md 2.2 (armor 2/(A-P+2)), 2.3 (HP pool), 2.4 (dash: 0.5 s,
// 10 stamina, 0.5 s cooldown; protection = active action), 2.5 (pain buff 0.5 s, -30% move, 5 stamina), 6.1 (weight
// states at 25/75/100%), 6.3 (stamina 100, sprint 7/s, recover 20/s after 1.5 s, sprint start >= 20%), Drug.cs /
// CA_UseItem.cs (heal value + use time, multi-use kits). Hunger/thirst intentionally NOT used (DESIGN 1, rule 17).
import { EQUIP } from "../loot/equipment";

export const PLAYER = {
  hp: 100, speed: 4.6, sprint: 6.6, radius: 0.45, iframesHurt: 0.35,
  stamina: { max: 100, sprintDrain: 7, recover: 20, delay: 1.5, sprintStart: 20, roll: 10, melee: 8, pain: 5 },
  pain: { time: 0.5, slow: 0.3 },
  /** ROLL CONTRACT: 0.34 s, protects from every enemy damage source (melee swipe, slam ring, charge, boomerang,
   *  thrown junk) for the whole roll, starting the frame it's pressed. Travel 3.2 u, then a 0.2 s skid at 60% speed
   *  (no protection), 0.6 s cooldown from the end of the roll, costs 10 stamina (needs at least 10). Direction = move
   *  input, else aim. Noise ring 4 u. */
  roll: { time: 0.34, dist: 3.2, skid: 0.2, skidSpeed: 0.6, cooldown: 0.6, noise: 4, buffer: 0.12 },
  /** weight states (ratio = carried / maxWeight): light <= 0.25 +15%, normal, heavy > 0.75 -40% + louder steps,
   *  overweight > 1 -70% (a crawl, never a freeze: rule 17). Pack slots still cap the count. */
  maxWeight: 30, weight: { light: 0.25, heavy: 0.75, lightBonus: 0.15, heavySlow: 0.4, overSlow: 0.7 },
};
/** CANCEL RULE (G1.5 row 20, POLISH_FINDINGS 12 on Duckov's CA_Reload priorities): a dash cancels a reload, and so do
 *  the briefcase swing (a weapon swap) and using a heal; you can walk and run while reloading, and ordinary hits never
 *  cancel it. A dash also interrupts firing, melee recovery and item use; it never interrupts the 0.1 s melee wind-up.
 *
 *  RELOAD (combat/reload.ts). Two modes: "mag" loads the whole missing amount when the timer completes (one timer for a
 *  top-up and an empty gun, no chamber +1, as in Duckov); "round" inserts one round per perRound seconds and keeps every
 *  completed insert when cancelled (for a future scatter gun). autoReload off by default: pulling the trigger on an
 *  empty gun starts the reload instead, with a dry click limited to one per 200 ms.
 *  Kingpin numbers, chosen on purpose: Duckov's low-tier demo pistol is 13 rounds / 1.1 s / 9 damage, its 8-round
 *  pistols reload in 1.8 s. The Kingpin is our heavy .45: 8 rounds (12 with the extended mag) of 12 damage, so one
 *  magazine (96) sits just under their 13 x 9 = 117, and its 1.2 s reload sits between their two. 1.2 s also matches
 *  the authored gun and arm reload clips (kingpin45.glb "reload", monkey.glb "reload"), so nothing is time-stretched.
 *
 *  CRITS (G1.5 row 02, POLISH_FINDINGS 3, Duckov's aim-time classification): a shot fired while the cursor is on an
 *  enemy's head target is critical; anything else is a body shot, which only crits through gear perks (perk.crit).
 *  Crit damage = damage x critMult x (1 + gear critDmg bonus), where the bonus is gearStats().critDmg - 1.5 (the
 *  eyepatch's +0.15 makes the Kingpin crit 1.3 x 1.15 = 1.5). Duckov's form is (gun + ammo) x (1 + holder). */
export const KINGPIN = {
  // extMag: what the extended mag attachment (att_mag_ext, +4 rounds) makes it
  id: "kingpin45", name: "Kingpin .45", mag: 8, extMag: 12, interval: 0.22, damage: 12, reload: 1.2, range: 16, pen: 1,
  magnet: 7 * Math.PI / 180, magnetAds: 10 * Math.PI / 180, noise: 14, bulletSpeed: 48, kick: 0.09, startAmmo: 24,
  critMult: 1.3, reloadMode: "mag" as ReloadMode, perRound: 0.4, autoReload: false,
};
/** GUN HANDLING (combat/handling.ts; POLISH_FINDINGS 16 "Gun handling: scatter, recoil, ADS"). Duckov's mechanism with
 *  our numbers. Scatter is the full cone angle in degrees (a round leaves at +-scatter/2 around the aim, flat on the
 *  ground plane like Duckov's yaw-only spread). Each value is lerped hip -> ADS by the aim amount (0..1, reached over
 *  adsTime, released at least 4/s). After a shot scatter grows by `grow`, clamped to [rest, max]; it falls back to
 *  `rest` at recover x grow x shots-per-second degrees/s (Duckov's formula; 6x faster when below rest).
 *  Anchors (stat values x ScatterFactor): Duckov's low-tier 13-round pistol rests at 6.0 deg, peaks at 16.0, grows
 *  7.8/shot (ADS 4.2 / 12.0 / 5.0); its 8-round pistol rests 6.1, peaks 22.4, grows 11.0 (ADS 3.6 / 13.2 / 5.3).
 *  The Kingpin is our heavy 8-round .45, so it sits between them and kicks harder than the 13-rounder.
 *  Movement (ours; Duckov's player path has no movement term, see POLISH_FINDINGS 16): the live scatter is multiplied
 *  by 1 + walk x (speed / walk speed) + sprint while sprinting, with the added part scaled by adsMove in ADS, eased
 *  at moveRate /s. Duckov applies character multipliers the same way (GunScatterMultiplier, x4 for an AI whose target
 *  runs).
 *  Recoil moves the aim point in screen pixels (1440-tall reference, scaled to the window): V along the line from the
 *  hero to the cursor (outward), H across it, each a uniform pick in [min, max] x scale, applied over recoilTime, then
 *  held until recoverDelay and pulled back at recover px/s. Moving the mouse against it cancels that much of it. */
export const KINGPIN_HANDLING = {
  rest: 6, max: 18, grow: 9, recover: 0.5,
  restAds: 3.5, maxAds: 12, growAds: 5.5, recoverAds: 0.6,
  walk: 0.6, sprint: 1.5, adsMove: 0.5, moveRate: 8,
  vMin: 0.85, vMax: 1.15, hMin: -0.4, hMax: 0.6, scaleV: 34, scaleH: 30, recoilTime: 0.06, recoverDelay: 0.1, recoverSpeed: 550, recoilMul: 1,
  /** ADS: time to full aim, walk multiplier while the button is held, camera lead factor (Duckov ADSAimDistanceFactor:
   *  1.0 on every pistol, 1.1-3.68 on rifles) and the FOV scale at full aim (Duckov 22.8/23.5 = 0.97; ours 0.93 because
   *  our 40 u telephoto barely shows 3%). G1.5 row 36: sights carry the zoom (Duckov adds +0.16 holo .. +2.4 8x onto the
   *  gun's factor), so the bare Kingpin is back near Duckov's pistol: 1.1, a visible lean and no more. The fitted
   *  sight's numbers are in loot/attachments.ts and the live result in combat/gunstats.ts GUN. */
  adsTime: 0.3, adsWalk: 0.6, adsDist: 1.1, adsFov: 0.93,
};
export type ReloadMode = "mag" | "round";
/** a gun as the reload loop sees it (the Kingpin today; a scatter gun later uses mode "round") */
export type GunDef = { mag: number; reload: number; reloadMode: ReloadMode; perRound: number; autoReload: boolean };
/** the head target: a sphere this big (world units at rig scale 1) around the middle of the head (Duckov: 0.42) */
export const HEAD = { radius: 0.42 };
/** gear crit-damage bonus on top of the gun's multiplier (gearStats starts critDmg at 1.5) */
export const GEAR_CRIT_BASE = 1.5;
export const BRIEFCASE = { reach: 1.9, arc: Math.PI * 0.6, wind: 0.1, damage: 22, cycle: 0.45, knock: 5.5, noise: 2 };
/** enemy HP and the damage their attacks do to the player (before armor) */
export const ENEMY = {
  wild: { hp: 24, speed: 3.4, sight: 11, keep: [6.5, 9], wind: 0.55, rangMax: 9, rangSpeed: 11, recover: 0.5, dmg: 12 },
  bandit: { hp: 48, speed: 4.4, sight: 10, notice: 0.4, wind: 0.42, reach: 1.6, recover: 0.6, flee: 5.6, dmg: 10 },
  brute: { hp: 150, speed: 3.1, sight: 9, wind: 0.9, slam: 2.6, recover: 1.3, dmg: 30 },
  /** the Sleeper: awake hits plink for 0; stunned hits do full damage (advisor 18) */
  sleeper: { hp: 240, wake: 14, aim: 0.9, charge: 13, stun: 3.2, roar: 1.2, dmg: 35 },
};
export function aimRang(targetX: number, targetZ: number, out: number) {
  const distance = Math.hypot(targetX, targetZ);
  let lower = 0, upper = Math.min(distance, out);
  for (let iteration = 0; iteration < 12; iteration++) {
    const travel = (lower + upper) / 2;
    if (Math.hypot(travel, Math.sin(travel / out * Math.PI) * 1.6) < distance) lower = travel;
    else upper = travel;
  }
  const travel = (lower + upper) / 2;
  const angle = Math.atan2(targetZ, targetX) - Math.atan2(Math.sin(travel / out * Math.PI) * 1.6, travel);
  return { x: Math.cos(angle), z: Math.sin(angle), travel };
}
/** healing items: heal value + use time (Drug.cs / CA_UseItem.cs mechanism); uses > 1 = a multi-use kit */
export const HEALS: Record<string, { heal: number; time: number; uses?: number; slow: number }> = {
  bandage: { heal: 15, time: 1.0, slow: 0.5 },
  smoothie: { heal: 40, time: 2.4, slow: 0.6 },
  firstaid: { heal: 25, time: 1.6, uses: 3, slow: 0.5 },
};
/** armor from wearables (helmets), Duckov formula: damage x 2 / (max(0, armor - pen) + 2) */
export const ARMOR: Record<string, number> = Object.fromEntries(Object.values(EQUIP).map(def => [def.id, def.headArmor ?? 0]));
export const armorMult = (armor: number, pen = 0) => (armor > 0 ? 2 / (Math.max(0, armor - pen) + 2) : 1);
/** feedback channels kept separate (rule 8): flash, sound, camera kick, knockback; hit-stop only on melee kills + the stun */
export const FEEL = { flash: 0.09, shotKick: 0.09, killKick: 0.25, hurtTrauma: 0.5, hitStopKill: 0.05, hitStopStun: 0.08 };
