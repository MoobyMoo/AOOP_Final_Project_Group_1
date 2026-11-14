// Combat numbers (ours). Contracts written before tuning (CODE_FINDINGS section 9 rules 5-8; advisor G1 review 8-19).
export const PLAYER = {
  speed: 5.8, radius: 0.45, hearts: 3, iframesHurt: 1.0,
  /** ROLL CONTRACT: 0.34 s, protects from every enemy damage source (melee swipe, slam ring, charge, boomerang,
   *  thrown junk) for the whole roll, starting the frame it's pressed. Travel 3.2 u, then a 0.2 s skid at 60% speed
   *  (no protection), 0.6 s cooldown from the end of the roll. Direction = move input, else aim. Noise ring 4 u. */
  roll: { time: 0.34, dist: 3.2, skid: 0.2, skidSpeed: 0.6, cooldown: 0.6, noise: 4, buffer: 0.12 },
};
/** CANCEL RULE (one, on purpose): a roll interrupts firing and melee recovery and PAUSES a reload (it resumes after);
 *  it never interrupts the 0.1 s melee wind-up. Melee interrupts a reload (restarts it). Nothing interrupts a roll. */
export const KINGPIN = {
  id: "kingpin45", name: "Kingpin .45", mag: 8, extMag: 12, interval: 0.22, damage: 1, reload: 1.2, range: 16,
  magnet: 7 * Math.PI / 180, // bullets bend toward the enemy nearest the aim ray within 7 degrees
  noise: 14, kick: 0.09, startAmmo: 16, // every raid starts with at least 16 rounds (advisor 8)
};
export const BRIEFCASE = { reach: 1.9, arc: Math.PI * 0.6, wind: 0.1, damage: 2, cycle: 0.4, knock: 5.5, noise: 2 };
export const ENEMY = {
  wild: { hp: 2, speed: 3.4, sight: 11, keep: [6.5, 9], wind: 0.55, rangMax: 9, rangSpeed: 11, recover: 0.5 },
  bandit: { hp: 4, speed: 5.2, sight: 10, notice: 0.4, wind: 0.42, reach: 1.6, recover: 0.6, flee: 5.6 },
  brute: { hp: 12, speed: 3.1, sight: 9, wind: 0.9, slam: 2.6, recover: 1.3 },
  /** the Sleeper: awake hits plink for 0; stunned hits do full damage (advisor 18) */
  sleeper: { hp: 20, wake: 14, aim: 0.9, charge: 13, stun: 3.2, roar: 1.2 },
};
/** feedback channels kept separate (rule 8): flash, sound, camera kick, knockback; hit-stop only on melee kills + the stun */
export const FEEL = { flash: 0.09, shotKick: 0.09, killKick: 0.25, hurtTrauma: 0.5, hitStopKill: 0.05, hitStopStun: 0.08 };
