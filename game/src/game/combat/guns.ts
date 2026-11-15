// THE ARSENAL: every gun is a row in GUNS (Moo 2026-11-15: "weapon types like Duckov: pistol, SMG, AR, sniper";
// "for each gun there should be variety, not just one pistol, one shotgun"). Pure data, no three.js: safe in saves,
// the loot sim, node tests and AI shooters (Sol's armed enemies read the same rows through fireGun).
//
// SOURCES. Every number starts from a Duckov class band in research/duckov-re/BALANCE_RANGES.md ("Class summaries" and
// the per-class tables; balance_ranges.json categories.guns.by_class, p10 / median / p90) and moves only where a gun's
// tier or its one trait says so; each deviation is written next to the number. Tier rule (lead, 2026-11-15): low near
// the class's weak end (p10 damage and rate, p90 scatter, recoil and reload), mid at the median, high near the strong
// end. Reference guns named in comments are the measured Duckov rows (scratch gun_handling_metadata.json) the shape
// was checked against; nothing else of theirs (names, art, models) is used.
//  - Scatter is the effective cone in degrees (Duckov stat x ScatterFactor), recoil scales are px at 1440 tall.
//  - BULLET SPEED: ours = Duckov x BULLET_SCALE (0.7). The Kingpin has flown at 48 u/s since G1 (Duckov's pistol p10)
//    so the round is visible on screen; every gun keeps Duckov's relative speeds by the same factor.
//  - Damage is integer per round (ours; enemies have small integer HP). A shotgun's damage is the shot budget, split
//    over its pellets as in Duckov (Damage / ShotCount per projectile).
//  - "LMG": the analysis tool's "LMG" class (n=3) is Duckov's magnum family (caliber MAG: the hand cannon and a heavy
//    bullpup; 10-round median), not belt-fed guns. Duckov's real light machine guns are two rifle-class guns on rifle
//    ammo (75 and 135 rounds, 5.7-5.8 s reloads). Hostile Takeover is built from those, and the gunfeel report shows it
//    against both bands.
//  - Fire modes: "semi" repeats while the trigger is held at the gun's interval (the Kingpin has always done this; its
//    feel is kept), "auto" the same at full rate, "burst" fires `burst` rounds then pauses `burstGap`, "bolt" is semi
//    with the cycle shown as a bolt throw. Duckov's TriggerMode 0/1/2 is auto/semi/bolt-or-pump.
import type { AttSlot, Rarity } from "../contracts";

import type { GunSound } from "../core/audio";
export type GunClass = "pistol" | "smg" | "rifle" | "shotgun" | "sniper" | "lmg";
export type Caliber = "ammo45" | "ammo_rifle" | "ammo_shell" | "ammo_sniper";
export type FireMode = "semi" | "auto" | "burst" | "bolt";
export type ReloadMode = "mag" | "round";
/** handling: scatter, recoil and ADS (combat/handling.ts reads these; units as KINGPIN_HANDLING in weapons.ts) */
export type Handling = {
  rest: number; max: number; grow: number; recover: number; restAds: number; maxAds: number; growAds: number; recoverAds: number;
  walk: number; sprint: number; adsMove: number; moveRate: number;
  vMin: number; vMax: number; hMin: number; hMax: number; scaleV: number; scaleH: number; recoilTime: number; recoverDelay: number; recoverSpeed: number; recoilMul: number;
  adsTime: number; adsWalk: number; adsDist: number; adsFov: number;
};
export type GunDef = {
  id: string; name: string; cls: GunClass; tier: Rarity; caliber: Caliber; fire: FireMode; burst?: number; burstGap?: number;
  /** per round (a shotgun: the whole shot, split over `pellets`) */ damage: number; pellets: number;
  interval: number; mag: number; reload: number; reloadMode: ReloadMode; perRound: number; autoReload: boolean;
  range: number; bulletSpeed: number; critMult: number; pen: number; noise: number;
  /** Duckov MoveSpeedMultiplier while the gun is out */ move: number;
  magnet: number; magnetAds: number; /** camera kick on a shot, x FEEL.shotKick */ kick: number;
  slots: readonly AttSlot[]; h: Handling;
  /** sale value (bananas), kg */ value: number; weight: number;
  /** integrally suppressed: plays and carries like a gun with the Hush Can on, and has no muzzle slot */ suppressed?: boolean;
  /** shot and handling sound (core/audio.ts GUN_KITS): the class's sampled layer set, a gain on top of the set's mix,
   *  how long the tail may ring (s), and per-gun overrides of the set's layers (a pump rack, a break-action clunk) */
  sound: GunSound;
  trait: string; blurb: string; bound?: boolean;
};

export const BULLET_SCALE = 0.7;
const DEG = Math.PI / 180;
/** Duckov's class medians (BALANCE_RANGES per-class tables) as handling. walk/sprint/adsMove/moveRate are ours (Duckov's
 *  player has no movement term; POLISH_FINDINGS 16) and the same for every gun. */
const BASE: Record<GunClass, Handling> = {
  pistol: { rest: 6, max: 16, grow: 7.8, recover: 0.5, restAds: 4.2, maxAds: 10.2, growAds: 6.35, recoverAds: 0.7, walk: 0.6, sprint: 1.5, adsMove: 0.5, moveRate: 8,
    vMin: 0.833, vMax: 1.167, hMin: -0.5, hMax: 0.5, scaleV: 30, scaleH: 30, recoilTime: 0.05, recoverDelay: 0.08, recoverSpeed: 550, recoilMul: 1, adsTime: 0.35, adsWalk: 0.5, adsDist: 1, adsFov: 0.93 },
  smg: { rest: 6, max: 13.5, grow: 3.54, recover: 0.3, restAds: 3.2, maxAds: 9.35, growAds: 2.26, recoverAds: 0.44, walk: 0.6, sprint: 1.5, adsMove: 0.5, moveRate: 8,
    vMin: 0.778, vMax: 1.22, hMin: -0.478, hMax: 0.5, scaleV: 22.1, scaleH: 20.4, recoilTime: 0.05, recoverDelay: 0.1, recoverSpeed: 550, recoilMul: 1, adsTime: 0.45, adsWalk: 0.55, adsDist: 1, adsFov: 0.93 },
  rifle: { rest: 9.03, max: 31.5, grow: 7.83, recover: 0.25, restAds: 2.85, maxAds: 8.9, growAds: 2.4, recoverAds: 0.45, walk: 0.6, sprint: 1.5, adsMove: 0.5, moveRate: 8,
    vMin: 0.891, vMax: 1.11, hMin: -0.4, hMax: 0.576, scaleV: 38.6, scaleH: 39.4, recoilTime: 0.075, recoverDelay: 0.12, recoverSpeed: 500, recoilMul: 1, adsTime: 0.6, adsWalk: 0.45, adsDist: 1, adsFov: 0.93 },
  // shotgun ADS max: the class median (50) sits above the hip max (42) because the population mixes pump and semi
  // guns; ours clamps the aimed ceiling to the hip one so aiming never widens a cone
  shotgun: { rest: 25, max: 42, grow: 13, recover: 0.5, restAds: 20.3, maxAds: 42, growAds: 12, recoverAds: 0.5, walk: 0.6, sprint: 1.5, adsMove: 0.5, moveRate: 8,
    vMin: 0.857, vMax: 1.14, hMin: -0.5, hMax: 0.5, scaleV: 90, scaleH: 68, recoilTime: 0.08, recoverDelay: 0.2, recoverSpeed: 550, recoilMul: 1, adsTime: 0.5, adsWalk: 0.6, adsDist: 1, adsFov: 0.93 },
  // snipers: the hip cone is huge on purpose (Duckov: 25 deg rest, 51 deg grow); the aimed rest cone is 1 deg. Our
  // FOV narrows at full aim on top of the lead factor (ours: Duckov's camera only leans)
  sniper: { rest: 25, max: 35, grow: 51, recover: 0.3, restAds: 1, maxAds: 30, growAds: 30, recoverAds: 0.7, walk: 0.6, sprint: 1.5, adsMove: 0.5, moveRate: 8,
    vMin: 0.926, vMax: 1.08, hMin: -0.455, hMax: 0.5, scaleV: 97.5, scaleH: 83, recoilTime: 0.1, recoverDelay: 0.15, recoverSpeed: 300, recoilMul: 1, adsTime: 0.75, adsWalk: 0.4, adsDist: 1.54, adsFov: 0.8 },
  // the belt-fed rifles (75-round gun stat#110913): scatter = stat x ScatterFactor 39, recover from the rifle medians
  lmg: { rest: 12, max: 35.3, grow: 8.3, recover: 0.25, restAds: 3.5, maxAds: 9.9, growAds: 3.05, recoverAds: 0.45, walk: 0.6, sprint: 1.5, adsMove: 0.5, moveRate: 8,
    vMin: 0.891, vMax: 1.11, hMin: -0.4, hMax: 0.576, scaleV: 45.45, scaleH: 54, recoilTime: 0.1, recoverDelay: 0.12, recoverSpeed: 500, recoilMul: 1, adsTime: 0.8, adsWalk: 0.4, adsDist: 1, adsFov: 0.93 },
};
const hand = (cls: GunClass, over: Partial<Handling> = {}): Handling => ({ ...BASE[cls], ...over });
/** attachment slots per class (POLISH_FINDINGS "Attachments" A1 and the measured slot sets): pistols Muzzle/Tec/Mag
 *  (the Kingpin takes the hand cannon's four, with a sight); a full rifle has all six; the pump shotgun Scope/Muzzle/
 *  Stock/Tec (stat#110888); bolt snipers Scope/Muzzle/Mag plus Stock (stat#110918); the belt-fed rifle all six */
const SLOTS: Record<string, readonly AttSlot[]> = {
  pistol: ["muzzle", "mag", "laser"], hand: ["sight", "muzzle", "mag", "laser"],
  smg: ["sight", "muzzle", "grip", "stock", "laser", "mag"], smgQuiet: ["sight", "grip", "stock", "laser", "mag"],
  rifle: ["sight", "muzzle", "grip", "stock", "laser", "mag"], rifleLow: ["sight", "muzzle", "stock", "mag"],
  shotgun: ["sight", "muzzle", "stock", "laser"], single: ["muzzle", "stock"], semiShot: ["sight", "muzzle", "grip", "stock", "laser", "mag"],
  sniper: ["sight", "muzzle", "stock", "mag"], lmg: ["sight", "muzzle", "grip", "stock", "laser", "mag"],
};
/** shot sound per class: each class has its own ElevenLabs layer set (research/audio/QUEUE.md "Guns by class"); the
 *  class loudness lives in the set's mix (core/audio.ts MIX), so gain stays 1; tail = how long the tail may ring (s) */
const SOUND: Record<GunClass, GunSound> = {
  pistol: { set: "pistol", gain: 1, tail: 1.4 }, smg: { set: "smg", gain: 1, tail: 0.6 }, rifle: { set: "rifle", gain: 1, tail: 1.3 },
  shotgun: { set: "shotgun", gain: 1, tail: 1.7 }, sniper: { set: "sniper", gain: 1, tail: 3 }, lmg: { set: "lmg", gain: 1, tail: 1.1 },
};
const KICK: Record<GunClass, number> = { pistol: 1, smg: 0.55, rifle: 0.8, shotgun: 2.2, sniper: 2.6, lmg: 0.9 };
const MAGNET: Record<GunClass, [number, number]> = { pistol: [7, 10], smg: [6, 9], rifle: [5, 9], shotgun: [9, 11], sniper: [3, 8], lmg: [5, 8] };

type Row = Omit<GunDef, "h" | "slots" | "magnet" | "magnetAds" | "kick" | "sound" | "pellets" | "perRound" | "autoReload" | "pen" | "reloadMode"> &
  Partial<Pick<GunDef, "pellets" | "perRound" | "autoReload" | "pen" | "reloadMode" | "kick">> & { h?: Partial<Handling>; slots: string; snd?: Partial<GunSound> };
function gun(r: Row): GunDef {
  const [mg, ma] = MAGNET[r.cls];
  return {
    pellets: 1, perRound: 0.4, autoReload: false, pen: 0, reloadMode: "mag", kick: KICK[r.cls],
    ...r, h: hand(r.cls, r.h), slots: SLOTS[r.slots], magnet: mg * DEG, magnetAds: ma * DEG, sound: { ...SOUND[r.cls], ...r.snd },
  };
}
const sp = (duckov: number) => Math.round(duckov * BULLET_SCALE);

export const GUNS: Record<string, GunDef> = {
  // ---------------------------------------------------------------- pistols (.45). Band: dmg 6.5/12/15, shots/s 6/7/16,
  // mag 6/13/24, reload 1/1.1/1.9, range 16.2/16.5/19, crit 1.2, ADS 0.3/0.35/0.42 s
  pocket_change: gun({ id: "pocket_change", name: "Pocket Change", cls: "pistol", tier: "common", caliber: "ammo45", fire: "semi",
    // damage 9 / mag 8 (not p10's 6.5 / 6): the first pass at 7 x 7 modelled 2.8 s against 48 HP, far past the band's
    // 1.0 s p90; 9 x 8 lands it at 1.0 s, the slow edge, which is where a low tier belongs
    damage: 9, interval: 1 / 6, mag: 8, reload: 1.6, range: 16.2, bulletSpeed: sp(48), critMult: 1.2, noise: 19.8, move: 1, value: 45, weight: 0.52, slots: "pistol",
    // weak end: p90 scatter and kick; trait: weighs nothing and never slows you, aimed or not (AdsWalk p90 0.72, ADS p10 0.3 s)
    h: { rest: 6.2, max: 19.6, grow: 9.8, restAds: 4.2, maxAds: 12, growAds: 6.35, scaleV: 38, scaleH: 30, adsTime: 0.3, adsWalk: 0.72 },
    trait: "Featherweight: aim and walk at almost full speed", blurb: "A palm-sized pop-gun from a tourist shop. Weak and wild, but you hardly know you're holding it." }),
  kingpin45: gun({ id: "kingpin45", name: "Kingpin .45", cls: "pistol", tier: "uncommon", caliber: "ammo45", fire: "semi",
    // KEPT AS SHIPPED (weapons.ts CRITS/RELOAD notes): 8 x 12 dmg, 0.2 s, 1.2 s reload; pen 1 and crit 1.3 are its heavy-.45 trait
    damage: 12, interval: 0.2, mag: 8, reload: 1.2, range: 16, bulletSpeed: 48, critMult: 1.3, pen: 1, noise: 20, move: 1, value: 0, weight: 0.9, slots: "hand", bound: true, kick: 1,
    h: { rest: 6, max: 18, grow: 9, recover: 0.5, restAds: 3.5, maxAds: 12, growAds: 5.5, recoverAds: 0.6, vMin: 0.85, vMax: 1.15, hMin: -0.4, hMax: 0.6, scaleV: 34, scaleH: 30, recoilTime: 0.06, recoverDelay: 0.1, adsTime: 0.3, adsWalk: 0.6, adsDist: 1.1 },
    trait: "Heavy .45: punches through light armour, takes a sight", blurb: "Your own sidearm, engraved with your initials. Heavy rounds, eight to a magazine. It never leaves your side." }),
  golden_parachute: gun({ id: "golden_parachute", name: "Golden Parachute", cls: "pistol", tier: "rare", caliber: "ammo45", fire: "semi",
    // strong end: dmg 15 (p90), mag 13 (median), reload 1.0 (p10), range 19 (p90), crit 1.4 (max); trait: the tightest cone
    damage: 15, interval: 0.15, mag: 13, reload: 1.0, range: 19, bulletSpeed: sp(79), critMult: 1.4, noise: 20.3, move: 1, value: 220, weight: 0.65, slots: "hand",
    h: { rest: 5.9, max: 15.5, grow: 3.8, restAds: 1.3, maxAds: 3.6, growAds: 0.83, scaleV: 28, scaleH: 10, adsTime: 0.35 },
    trait: "Match grade: the tightest pistol cone, crits hit hardest", blurb: "A gold-plated executive pistol. Every shot lands where you meant it, which is the whole point of having money." }),

  // ---------------------------------------------------------------- SMGs (.45, Duckov's SMG/pistol caliber family). Band: dmg 8.5/10.5/12.5,
  // shots/s 12/15/18.65, mag 20/30/31, reload 2.18/2.3/3.15, range 19.3/20.8/22.1, crit 1.1/1.2/1.38, move 0.95
  peel_sprayer: gun({ id: "peel_sprayer", name: "Peel Sprayer", cls: "smg", tier: "fine", caliber: "ammo45", fire: "auto",
    // trait: fastest gun on the island (18 /s, p90) with the widest SMG cone (p90 rest/max/grow) and p90 kick
    damage: 9, interval: 1 / 18, mag: 25, reload: 3.0, range: 19.3, bulletSpeed: sp(75), critMult: 1.15, noise: 24.7, move: 0.95, value: 70, weight: 2.4, slots: "smg",
    h: { rest: 7, max: 15.9, grow: 5.4, scaleV: 31, scaleH: 31, adsTime: 0.45 },
    trait: "Hose: 18 rounds a second, sprays wide", blurb: "A stamped-tin bullet hose the Peel Gang swear by. It empties fast and hits everything near what you aimed at." }),
  cash_flow: gun({ id: "cash_flow", name: "Cash Flow", cls: "smg", tier: "uncommon", caliber: "ammo45", fire: "auto",
    // medians: dmg 10.5 -> 10 (integer), 15 /s, 30 rounds, range 20.8, crit 1.2; trait: quickest hands (ADS 0.35 p10, reload 2.18 p10)
    damage: 10, interval: 1 / 15, mag: 30, reload: 2.18, range: 20.8, bulletSpeed: sp(75), critMult: 1.2, noise: 24.7, move: 0.95, value: 140, weight: 2.7, slots: "smg",
    h: { adsTime: 0.35 },
    trait: "Quick hands: fastest SMG to aim and reload", blurb: "A tidy little machine pistol for monkeys who move money fast. Nothing fancy, everything quick." }),
  insider_trader: gun({ id: "insider_trader", name: "Insider Trader", cls: "smg", tier: "epic", caliber: "ammo45", fire: "auto", suppressed: true,
    // strong end: dmg 12.5 -> 12, crit 1.38, p10 scatter/recoil; integral can = the Hush Can's numbers (sound -75%, range and bullet speed -10%)
    damage: 12, interval: 1 / 14, mag: 30, reload: 2.2, range: Math.round(22.1 * 0.9 * 10) / 10, bulletSpeed: sp(83 * 0.9), critMult: 1.38, noise: Math.round(22.8 * 0.25 * 10) / 10, move: 0.95, value: 340, weight: 2.9, slots: "smgQuiet",
    h: { rest: 4.44, max: 11.5, grow: 2.5, restAds: 2.55, maxAds: 7.12, growAds: 1.6, scaleV: 17.2, scaleH: 15, adsTime: 0.4 },
    trait: "Silent: integral suppressor, no muzzle slot", blurb: "A long, quiet SMG with the suppressor built into the barrel. Guards two huts over never hear a thing." }),

  // ---------------------------------------------------------------- assault rifles (rifle rounds). Band: dmg 12.9/16/22, shots/s 10/12.5/14.6,
  // mag 20/30/87, reload 2.32/2.9/5.14, range 23.8/26.5/30.7, crit 1.29/1.45/1.65, move 0.78/0.85/0.852, ADS 0.45/0.6/0.81 s
  bootleg_rifle: gun({ id: "bootleg_rifle", name: "Bootleg Rifle", cls: "rifle", tier: "fine", caliber: "ammo_rifle", fire: "auto",
    // weak end: dmg 14, 10 /s (p10), 20 rounds, reload 3.2, range 23.8, p90 scatter and recoil; trait: the kick. Its
    // modelled TTK (0.40 s) sits 0.02 s past the band's p90: the slow edge for the bottom rifle
    damage: 14, interval: 0.1, mag: 20, reload: 3.2, range: 23.8, bulletSpeed: sp(90), critMult: 1.29, noise: 28, move: 0.85, value: 80, weight: 3.6, slots: "rifleLow",
    h: { rest: 14.2, max: 38.2, grow: 10.8, restAds: 3.5, maxAds: 10.1, growAds: 3.09, scaleV: 55, scaleH: 54, adsTime: 0.81 },
    trait: "Kicks like a mule: the widest, wildest rifle", blurb: "Hammered together in a back shed from three other rifles. It fires, mostly where you point it, and it kicks like a mule." }),
  contraband_carbine: gun({ id: "contraband_carbine", name: "Contraband Carbine", cls: "rifle", tier: "rare", caliber: "ammo_rifle", fire: "auto",
    // the medians, all of them; trait: takes every attachment
    damage: 16, interval: 0.08, mag: 30, reload: 2.9, range: 26.5, bulletSpeed: sp(107), critMult: 1.45, noise: 30, move: 0.85, value: 230, weight: 3.7, slots: "rifle",
    trait: "All-rounder: full auto, takes every attachment", blurb: "Smuggled in under a crate of bananas. A dependable full-auto rifle that will carry anything you bolt onto it." }),
  board_meeting: gun({ id: "board_meeting", name: "Board Meeting", cls: "rifle", tier: "epic", caliber: "ammo_rifle", fire: "burst", burst: 3, burstGap: 0.22,
    // strong end: dmg 20, crit 1.65, range 30.7, p10 scatter and recoil, a built-in lean (ADSAimDistanceFactor p90 1.46);
    // trait: 3-round bursts (Duckov BurstCount 3, stat#110889) at 14.6 /s inside the burst
    damage: 20, interval: 1 / 14.6, mag: 30, reload: 2.5, range: 30.7, bulletSpeed: sp(122), critMult: 1.65, noise: 30, move: 0.85, value: 360, weight: 3.9, slots: "rifle",
    h: { rest: 7.06, max: 27.4, grow: 3.96, restAds: 2.17, maxAds: 7.52, growAds: 1.75, scaleV: 24.8, scaleH: 25.3, adsTime: 0.5, adsDist: 1.46 },
    trait: "Three-round bursts, dead accurate", blurb: "Everyone gets three words in, then it's settled. A precise burst rifle with a long view down the barrel." }),

  // ---------------------------------------------------------------- shotguns (shells, 5 pellets). Band: shot dmg 5/47/60.4, shots/s 2.2/4.8/5.2,
  // mag 2/8/12.4, reload 0.4/1.5/2 (single-round guns 0.25-0.4 per round), range 14.2/16.5/17.5, crit 1.1, move 1
  pipe_dream: gun({ id: "pipe_dream", name: "Pipe Dream", cls: "shotgun", tier: "common", caliber: "ammo_shell", fire: "semi",
    // trait: a single-shot break action (Duckov's 2-shot hand shotgun, 0.4 s per shell, stat#110893, at one barrel):
    // never jams, reloads after every shot; a fat 55 budget (11 a pellet) and the widest pattern (p90)
    damage: 55, pellets: 5, interval: 0.4, mag: 1, reload: 0.4, reloadMode: "round", perRound: 0.4, autoReload: true, range: 14.2, bulletSpeed: sp(100), critMult: 1.1, noise: 24.4, move: 1, value: 40, weight: 2.1, slots: "single",
    h: { rest: 32, max: 68, grow: 30, restAds: 24, maxAds: 60, growAds: 30, scaleV: 102, scaleH: 80, adsTime: 0.31 },
    snd: { open: "breakClunk" }, // the break action drops open for every shell
    trait: "Single shot: one big barrel, reload after every blast", blurb: "A length of pipe, a nail and a lot of hope. One shell at a time, and it always goes bang." }),
  coconut_cracker: gun({ id: "coconut_cracker", name: "Coconut Cracker", cls: "shotgun", tier: "uncommon", caliber: "ammo_shell", fire: "bolt",
    // median budget 47 -> 45 (9 a pellet), 8-shell tube loaded one at a time (0.4 s, the single-round median), median cone;
    // trait: pump action, so it cycles at 2 /s (deviation: the class median 4.8 /s is a semi rate; a pump reads as a pump)
    damage: 45, pellets: 5, interval: 0.5, mag: 8, reload: 0.4, reloadMode: "round", perRound: 0.4, range: 16.5, bulletSpeed: sp(100), critMult: 1.1, noise: 24.4, move: 1, value: 130, weight: 2.5, slots: "shotgun",
    snd: { mech: "pumpRack", mechAt: 0.22, close: "pumpRack" }, // racks after every shot and after loading
    trait: "Pump action: loads shell by shell, keeps what it loaded", blurb: "A pump shotgun that splits coconuts at ten paces. Rack it, aim it at the door, wait." }),
  the_audit: gun({ id: "the_audit", name: "The Audit", cls: "shotgun", tier: "epic", caliber: "ammo_shell", fire: "semi",
    // strong end: budget 60 (12 a pellet), 5-shell box (Duckov's semi box shotguns, stat#110900) with a full 1.5 s reload,
    // 3.6 /s (stat#110954), range 17.5, tighter p10 hip cone; trait: semi-auto follow-ups
    damage: 60, pellets: 5, interval: 1 / 3.6, mag: 5, reload: 1.5, range: 17.5, bulletSpeed: sp(110), critMult: 1.2, noise: 24.4, move: 1, value: 330, weight: 3.4, slots: "semiShot",
    h: { rest: 15.6, max: 35, grow: 9.4, restAds: 11, maxAds: 30, growAds: 8, scaleV: 102, scaleH: 80, adsTime: 0.55 },
    snd: { mech: "rifleMech", mechAt: 0.03 }, // a gas-driven semi action, and the box swaps like a rifle mag
    trait: "Semi-auto box mag: fast follow-ups, whole-mag reload", blurb: "Five shells in a box magazine and a trigger that keeps up with you. Nobody passes this audit." }),

  // ---------------------------------------------------------------- snipers (sniper rounds). Band: dmg 19.7/22/28.2, shots/s 0.5/0.8/2.24,
  // mag 4/5/10.4, reload 0.9/3.2/3.6, range 31.2/34.1/37.1, crit 2.06/2.55/3.64, pen 1, move 0.72, ADS 0.5/0.75/0.8, lead 1.35/1.54/2.1
  bean_counter: gun({ id: "bean_counter", name: "Bean Counter", cls: "sniper", tier: "rare", caliber: "ammo_sniper", fire: "bolt",
    // the medians: 22 dmg, 0.8 /s, 5 rounds, 3.2 s, crit 2.55, lead 1.54; trait: the steady one (quickest aim 0.5 s, p10)
    damage: 22, interval: 1.25, mag: 5, reload: 3.2, range: 34.1, bulletSpeed: sp(166), critMult: 2.55, pen: 1, noise: 35.9, move: 0.72, value: 210, weight: 3.9, slots: "sniper",
    h: { adsTime: 0.5 },
    trait: "Bolt action, quick to the eye", blurb: "A bolt rifle with a plain scope that counts every bean from across the yard." }),
  long_ledger: gun({ id: "long_ledger", name: "Long Ledger", cls: "sniper", tier: "epic", caliber: "ammo_sniper", fire: "bolt",
    // strong end: dmg 28, crit 3.3 (stat#110896), range 37.1, speed p90, 10 rounds (p90), lead 2.1 (p90) and a narrower FOV;
    // trait: the longest look on the island, slowest to raise (0.8 s, p90)
    damage: 28, interval: 1.25, mag: 10, reload: 3.6, range: 37.1, bulletSpeed: sp(177), critMult: 3.3, pen: 1, noise: 39.8, move: 0.72, value: 380, weight: 4.4, slots: "sniper",
    h: { adsTime: 0.8, adsDist: 2.1, adsFov: 0.7, restAds: 0.956, scaleV: 122, scaleH: 113 },
    trait: "Strong zoom: sees and hits from furthest away", blurb: "A long bolt rifle with a brass telescope. It settles accounts from the far side of the map." }),

  // ---------------------------------------------------------------- the LMG (rifle rounds). Built from Duckov's belt-fed rifles (stat#110913
  // 75 rds, 5.7 s, 18 dmg, 11 /s, move 0.78; stat#110916 135 rds, 5.8 s, 16 dmg, 12.5 /s)
  hostile_takeover: gun({ id: "hostile_takeover", name: "Hostile Takeover", cls: "lmg", tier: "legendary", caliber: "ammo_rifle", fire: "auto",
    damage: 17, interval: 1 / 11, mag: 75, reload: 5.7, range: 28.3, bulletSpeed: sp(90), critMult: 1.45, noise: 32.7, move: 0.78, value: 520, weight: 7.6, slots: "lmg",
    trait: "75-round belt: slow to reload, slows you down", blurb: "A belt-fed monster for a buy-out nobody agreed to. Seventy-five rounds, then a very long reload." }),
};

export const GUN_IDS = Object.keys(GUNS);
export const STARTER_GUN = "kingpin45";
/** item types that name a gun row under another id: the bound Kingpin's instance has been "kingpin@uuid" since
 *  boundWeapons (core/settlement.ts), and its row/model/icon id is kingpin45 */
export const GUN_ALIAS: Record<string, string> = { kingpin: "kingpin45" };
/** the gun row id for an item type or instance string ("kingpin@uuid" -> "kingpin45"), or null if it isn't a gun */
export function gunId(inst: string | null | undefined): string | null {
  if (!inst) return null;
  const type = inst.replace(/@[a-zA-Z0-9_-]+$/, "").split(/[#~]/)[0], id = GUN_ALIAS[type] ?? type;
  return Object.hasOwn(GUNS, id) ? id : null;
}
export const gunOf = (inst: string | null | undefined): GunDef | undefined => { const id = gunId(inst); return id ? GUNS[id] : undefined; };
export const isGunId = (type: string): boolean => gunId(type) !== null;
export const CLASS_LABEL: Record<GunClass, string> = { pistol: "Pistol", smg: "SMG", rifle: "Assault rifle", shotgun: "Shotgun", sniper: "Sniper", lmg: "Light machine gun" };

/** CALIBERS (Duckov: a bullet tag + a matching Caliber string; reload draws only the selected matching type;
 *  POLISH_FINDINGS 12). One ammo type per caliber here. stack = rounds in one found stack. */
export const CALIBERS: Record<Caliber, { name: string; short: string; stack: number; icon: string }> = {
  ammo45: { name: ".45 Rounds", short: ".45", stack: 8, icon: "🔸" },
  ammo_rifle: { name: "Rifle Rounds", short: "RIFLE", stack: 15, icon: "🔶" },
  ammo_shell: { name: "Shotgun Shells", short: "SHELL", stack: 6, icon: "🟥" },
  ammo_sniper: { name: "Sniper Rounds", short: "SNIPER", stack: 5, icon: "🔷" },
};
export const CALIBER_IDS = Object.keys(CALIBERS) as Caliber[];
export const isCaliber = (id: string): id is Caliber => Object.hasOwn(CALIBERS, id);
export type Rounds = Record<Caliber, number>;
export const noRounds = (): Rounds => ({ ammo45: 0, ammo_rifle: 0, ammo_shell: 0, ammo_sniper: 0 });
