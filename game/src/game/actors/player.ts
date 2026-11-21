// Player controller on Duckov's body mechanisms (combat/weapons.ts header): HP + armor, stamina (sprint, dodge,
// melee, pain), weight states, timed healing, aim-down-sights. Implements the roll contract and the one cancel rule.
import * as THREE from "three";
import { G, V, flat, angDiff, activeCaliber, entryGraceRemaining, type Enemy } from "../core/state";
import { CALIBERS } from "../combat/guns";
import { PLAYER, BRIEFCASE, FEEL, HEALS } from "../combat/weapons";
import { itemType } from "../loot/instances";
import { packStacks } from "../loot/pack";
import { consumeInstance } from "../core/raid-journal";
import { updateHandling, kickedNdc } from "../combat/handling";
import { tuneObject } from "../core/tune";
import { ENEMY_CRIT, SLOTS, equipDef, gearStats } from "../loot/equipment";
import { EQUIP_MOVE, interruptEquip, protectPlayerHit, updateEquipment } from "../loot/equipment-actions";
import { collide, walkable, zoneAt, roadDist } from "../world/grid";
import { groundHeight, standHeight } from "../world/terrain";
import { sfx, stepOn } from "../core/audio";
import { shoot, swingBriefcase, makeNoise, bulletHooks } from "../combat/combat";
import { hud } from "../ui/hud";
import { itemDef } from "../loot/raidloot";
import { floatText, burst } from "../../fx";
import { updateAimHead, aimHead } from "../combat/headshot";
import { startReload, cancelReload, updateReload, emptyTrigger } from "../combat/reload";
import { ARM, GUN, GUN_DEF, H } from "../combat/gunstats";
import { switchTo, cycleGun, drawing } from "../combat/arsenal";
import { startDash, dustColor } from "./dash";
import type { KingpinFx } from "../combat/kingpin";

tuneObject("player", PLAYER, {
  speed: { min: 1, max: 12, step: 0.1, label: "walk speed (u/s)" }, sprint: { min: 1, max: 16, step: 0.1, label: "sprint speed (u/s)" },
  "stamina.max": { min: 10, max: 300, step: 1, label: "stamina max" }, "stamina.sprintDrain": { min: 0, max: 40, step: 0.5, label: "sprint drain /s" },
  "stamina.recover": { min: 0, max: 100, step: 1, label: "stamina recover /s" }, "stamina.delay": { min: 0, max: 5, step: 0.05, label: "recover delay (s)" },
  "stamina.sprintStart": { min: 0, max: 100, step: 1, label: "stamina needed to start a sprint" }, "stamina.roll": { min: 0, max: 50, step: 1, label: "dash cost" },
  "stamina.melee": { min: 0, max: 50, step: 1, label: "briefcase cost" }, "stamina.pain": { min: 0, max: 50, step: 1, label: "pain cost" },
  "pain.time": { min: 0, max: 3, step: 0.05, label: "pain slow time (s)" }, "pain.slow": { min: 0, max: 0.9, step: 0.01, label: "pain slow" },
  "roll.time": { min: 0.1, max: 1, step: 0.01, label: "dash time (s)" }, "roll.dist": { min: 0.5, max: 8, step: 0.1, label: "dash distance (u)" },
  "roll.skid": { min: 0, max: 1, step: 0.01, label: "skid time (s)" }, "roll.skidSpeed": { min: 0, max: 1, step: 0.01, label: "skid speed" },
  "roll.cooldown": { min: 0, max: 3, step: 0.05, label: "dash cooldown (s)" },
  "weight.lightBonus": { min: 0, max: 0.6, step: 0.01, label: "light load bonus" }, "weight.heavySlow": { min: 0, max: 0.9, step: 0.01, label: "heavy load slow" },
  "weight.overSlow": { min: 0, max: 0.95, step: 0.01, label: "overloaded slow" }, maxWeight: { min: 5, max: 100, step: 1, label: "carry limit (kg)" },
}, { note: "movement and stamina (combat/weapons.ts PLAYER)" });
const UP = new THREE.Vector3(0, 1, 0);
const tmp = new THREE.Vector3();
let stepT = 0, dryLatch = false;

/** enemy nearest the aim ray (advisor 14), used by keyboard lock and the bullet magnet */
/** the ground under a point for footsteps: a painted road (boardwalk planks, dirt tracks) wins over its zone's ground */
const roadHit: NonNullable<Parameters<typeof roadDist>[2]> = { road: null };
function groundUnder(x: number, z: number) { return roadDist(x, z, roadHit) <= 0 && roadHit.road ? roadHit.road.ground : zoneAt(x, z)?.ground; }
export function nearestToRay(maxD: number, maxAng: number, from = G.pp, yaw = G.aimYaw): Enemy | null {
  let best: Enemy | null = null, bs = 1e9;
  for (const e of G.enemies) {
    if (e.down || !e.active) continue;
    const d = flat(from, e.p); if (d > maxD) continue;
    const a = Math.abs(angDiff(Math.atan2(e.p.x - from.x, e.p.z - from.z), yaw)); if (a > maxAng) continue;
    const score = a * 3 + d * 0.08; if (score < bs) { bs = score; best = e; }
  }
  return best;
}
export function useStamina(n: number) { G.stamina = Math.max(0, G.stamina - n); G.staminaDelay = PLAYER.stamina.delay; }
/** kg carried: the pack, worn gear, both guns with their parts, and every round (0.02 kg each, loaded or loose) */
export function carriedWeight() {
  let w = G.pack.reduce((a, id) => a + (itemDef(id).weight ?? 1), 0) + SLOTS.reduce((total, slot) => total + (equipDef(G.gear[slot])?.weight ?? 0), 0);
  for (const gs of G.save.guns) if (gs) { w += itemDef(gs.inst).weight ?? 0; for (const a of Object.values(gs.atts)) if (a) w += itemDef(a).weight ?? 0; }
  const rounds = Object.values(G.reserve).reduce((a, b) => a + b, 0) + G.loaded[0] + G.loaded[1];
  return w + rounds * 0.02;
}
export function weightState() { const r = G.weight / (PLAYER.maxWeight + 4 * G.save.upgrades.pack + gearStats(G.gear).maxWeight), w = PLAYER.weight; return r > 1 ? "over" : r > w.heavy ? "heavy" : r <= w.light ? "light" : "normal"; }

export function updatePlayer(dt: number) {
  const i = G.intent, st = G.stage, S = PLAYER.stamina;
  G.iframes = Math.max(0, G.iframes - dt); G.fireCd -= dt; G.meleeCd -= dt; G.rollCd -= dt; G.fireT += dt / 0.25; G.painT -= dt;
  if (G.hurtT >= 0) { G.hurtT += dt / 0.35; if (G.hurtT >= 1) G.hurtT = -1; }
  G.staminaDelay -= dt; if (G.staminaDelay <= 0 && !G.sprinting) G.stamina = Math.min(S.max, G.stamina + S.recover * dt);
  if (!G.alive || G.zipping) return;
  updateEquipment(dt);
  G.weight = carriedWeight();

  // ---- aim (RMB = aim down sights over 0.3 s: tighter scatter, longer camera lead, slower walk, wider magnet).
  // combat/handling.ts runs the aim amount, scatter recovery and the recoil kick; the kick moves the cursor itself, so
  // the aim point, the crosshair, the head check and the next shot all see it
  updateHandling(dt, i);
  if (i.aimNdc) {
    const ndc = kickedNdc(i.aimNdc);
    const p = st.pick(ndc.x, ndc.y, G.pp.y + 1.0); G.aimPoint.copy(p);
    // on a head (headshot.ts): half the correction toward the head centre, Duckov's aim-height fix, so the shot and the
    // crosshair go for the enemy the cursor is on, not for the ground plane behind its head
    if (updateAimHead(ndc)) { G.aimPoint.x += (aimHead.point.x - G.aimPoint.x) * 0.5; G.aimPoint.z += (aimHead.point.z - G.aimPoint.z) * 0.5; }
    G.aimYaw = Math.atan2(G.aimPoint.x - G.pp.x, G.aimPoint.z - G.pp.z); G.lockTarget = null;
  } else {
    updateAimHead(null);
    if (!G.lockTarget || G.lockTarget.down || flat(G.lockTarget.p, G.pp) > 13) G.lockTarget = nearestToRay(12, Math.PI * 0.6, G.pp, G.moveYaw);
    if (G.lockTarget) { G.aimYaw = Math.atan2(G.lockTarget.p.x - G.pp.x, G.lockTarget.p.z - G.pp.z); G.aimPoint.copy(G.lockTarget.p).setY(1); }
    else { G.aimYaw = G.moveYaw; G.aimPoint.copy(G.pp).addScaledVector(V(Math.sin(G.moveYaw), Math.cos(G.moveYaw)), 6); }
  }

  // ---- ninja dash (Space; buffered 0.12 s; costs 10 stamina). The ROLL CONTRACT in weapons.ts is unchanged: 0.34 s,
  // full protection from the press, 3.2 u, then the skid; it only looks different (actors/dash.ts). G1.5 row 14.
  if (i.roll) G.rollBuffer = PLAYER.roll.buffer; else G.rollBuffer -= dt;
  const meleeWindup = G.meleeT >= 0 && G.meleeT < BRIEFCASE.wind / BRIEFCASE.cycle;
  if (G.rollBuffer > 0 && G.rollT < 0 && G.rollCd <= 0 && !meleeWindup) {
    if (G.stamina < S.roll) { if (i.roll) { hud.toast("Too tired to dash! (stamina)"); sfx("nope"); } G.rollBuffer = 0; }
    else {
      G.rollBuffer = 0; G.rollT = 0; G.log.rolls++; if (G.log.firstRoll < 0) G.log.firstRoll = G.raidT; useStamina(S.roll);
      const mv = moveVec(i.move);
      G.rollDir.copy(mv.lengthSq() > 0.01 ? mv.normalize() : V(Math.sin(G.aimYaw), Math.cos(G.aimYaw)));
      G.meleeT = -1; interruptEquip(); if (G.useItem) { G.useItem = null; hud.use(null); }
      cancelReload(); // a dash cancels a reload (weapons.ts CANCEL RULE)
      sfx("dash"); makeNoise(G.pp, PLAYER.roll.noise, "roll"); startDash(G.rollDir);
    }
  }
  if (G.rollT >= 0) {
    G.rollT += dt / PLAYER.roll.time;
    const sp = PLAYER.roll.dist / PLAYER.roll.time;
    move(G.rollDir.clone().multiplyScalar(sp * dt));
    G.moveYaw = Math.atan2(G.rollDir.x, G.rollDir.z); G.vel.copy(G.rollDir).multiplyScalar(sp);
    if (G.rollT >= 1) { G.rollT = -1; G.skidT = PLAYER.roll.skid; G.rollCd = PLAYER.roll.cooldown; }
    return;
  }

  // ---- move: walk/sprint, weight state, pain, skid, item use, shooting/ADS
  const mv = moveVec(i.move), moving = mv.lengthSq() > 0.01;
  const busy = G.fireCd > -0.25 || i.ads || G.useItem || G.equipping || G.meleeT >= 0; // reloading does not stop a sprint (row 20)
  if (G.sprinting) { if (!i.sprint || !moving || busy || G.stamina <= 0) G.sprinting = false; }
  else if (i.sprint && moving && !busy && G.stamina >= S.sprintStart) G.sprinting = true;
  if (G.sprinting) useStamina(S.sprintDrain * dt);
  const ws = weightState(), W = PLAYER.weight;
  const wMul = ws === "light" ? 1 + W.lightBonus : ws === "heavy" ? 1 - W.heavySlow : ws === "over" ? 1 - W.overSlow : 1;
  let speed = (G.sprinting ? PLAYER.sprint : PLAYER.speed) * wMul * gearStats(G.gear).speed * GUN.moveSpeed; // attachments: Duckov MoveSpeedMultiplier
  if (G.equipping) speed *= EQUIP_MOVE;
  if (G.skidT > 0) speed *= PLAYER.roll.skidSpeed; G.skidT -= dt;
  if (G.painT > 0) speed *= 1 - PLAYER.pain.slow;
  if (G.useItem) speed *= 1 - HEALS[itemType(G.useItem.id)].slow;
  if (G.ads) speed *= H.adsWalk; else if (G.fireCd > -0.25) speed *= 0.85; // Duckov: walk x AdsWalkSpeedMultiplier while aiming
  G.vel.lerp(mv.multiplyScalar(speed), Math.min(1, dt * 14));
  move(G.vel.clone().multiplyScalar(dt));
  if (G.vel.lengthSq() > 0.3) {
    G.moveYaw = Math.atan2(G.vel.x, G.vel.z); stepT -= dt * G.vel.length();
    if (stepT < 0) {
      stepT = 1.7; stepOn(groundUnder(G.pp.x, G.pp.z), ws === "heavy" || ws === "over" ? 1 : 0.6); if (G.sprinting || ws === "heavy" || ws === "over") makeNoise(G.pp, G.sprinting ? 7 : 5, "step");
      const dc = G.sprinting ? dustColor(G.pp.x, G.pp.z) : null; // footstep dust: one puff per sprinting step on loose ground (POLISH_FINDINGS 4)
      if (dc) (G.fx as KingpinFx).dust(G.pp, -G.vel.x * 0.08, -G.vel.z * 0.08, 1, dc, 0.8);
    }
  } else if (Math.abs(angDiff(G.aimYaw, G.moveYaw)) > 1.3) G.moveYaw = G.aimYaw;

  // ---- healing: hold-free timed use (Q uses your best heal); a roll or a hit interrupts it
  if (G.useItem) {
    G.useItem.t += dt; hud.use(G.useItem);
    if (G.useItem.t >= G.useItem.time) {
      const h = HEALS[itemType(G.useItem.id)], amount = Math.round(h.heal * gearStats(G.gear).heal); G.hp = Math.min(G.maxHp, G.hp + amount); sfx("heal"); burst(G.pp.clone().setY(1.5), 12, "#ff9ec4", 0.6);
      floatText(`+${amount}`, G.pp.clone().setY(2.6), "#6ad16a", 24);
      const k = G.pack.indexOf(G.useItem.id); if (k >= 0) consumeInstance(G.pack.splice(k, 1)[0]);
      G.useItem = null; hud.use(null); hud.health(); hud.pack();
    }
  } else if (i.heal && !G.equipping) {
    const id = G.pack.find(inst => ["firstaid", "smoothie", "bandage"].includes(itemType(inst)));
    if (!id) hud.toast("No bandage or smoothie in your pack");
    else if (G.hp >= G.maxHp) hud.toast("You're already at full health");
    else { G.useItem = { id, t: 0, time: HEALS[itemType(id)].time }; cancelReload(); sfx("ui"); }
  }

  // ---- weapon slots (combat/arsenal.ts): 1 / 2 draw a gun, the wheel cycles; a draw takes 0.15 s before it can fire
  G.drawT += dt;
  if (i.swap1) switchTo(0); else if (i.swap2) switchTo(1); else if (i.wheel) cycleGun(i.wheel > 0 ? 1 : -1);

  // ---- reload (combat/reload.ts): R, or the trigger on an empty gun; walk and run freely meanwhile
  const loaded = G.mag;
  if (!G.useItem) updateReload(dt);
  if (i.reload && !G.useItem) startReload(GUN_DEF);
  if (G.mag !== loaded) hud.ammo();

  // ---- melee (V): the briefcase; costs stamina
  if (G.meleeT >= 0) {
    const before = G.meleeT; G.meleeT += dt / BRIEFCASE.cycle;
    const hitAt = BRIEFCASE.wind / BRIEFCASE.cycle + 0.05;
    if (before < hitAt && G.meleeT >= hitAt) swingBriefcase();
    if (G.meleeT >= 1) G.meleeT = -1;
  } else if (i.melee && G.meleeCd <= 0 && !G.useItem && !G.equipping) {
    if (G.stamina < 4) { hud.toast("Too tired to swing!"); sfx("nope"); }
    else {
      G.meleeT = 0; G.meleeCd = BRIEFCASE.cycle; sfx("swing"); useStamina(PLAYER.stamina.melee); G.sprinting = false;
      cancelReload(); // the briefcase is a weapon swap: it cancels a reload
      if (!i.aimNdc) { const t = nearestToRay(3, Math.PI, G.pp, G.moveYaw); if (t) G.aimYaw = Math.atan2(t.p.x - G.pp.x, t.p.z - G.pp.z); }
    }
  }

  // ---- fire. Every gun repeats while the trigger is held, at its interval (the Kingpin has always done this); a burst
  // gun fires `burst` rounds per pull at its interval, then rests burstGap. Empty: a dry click (one per 200 ms) and a
  // fresh pull starts the reload; autoReload guns (the single-shot) reload by themselves after the shot
  const trigger = i.fire || i.firePressed; // a tap shorter than one sim step still fires
  if (!trigger) dryLatch = false;
  const ready = G.meleeT < 0 && G.fireCd <= 0 && G.reloadT < 0 && !G.useItem && !G.equipping && GUN.armed && !drawing();
  if (ready && (trigger || G.burstLeft > 0)) {
    G.sprinting = false;
    if (G.mag > 0) {
      if (ARM.fire === "burst" && G.burstLeft <= 0) G.burstLeft = ARM.burst ?? 3;
      G.mag--; G.fireT = 0; shoot(); hud.ammo(); if (G.log.firstShot < 0) G.log.firstShot = G.raidT;
      if (ARM.fire === "burst") { G.burstLeft--; G.fireCd = G.burstLeft > 0 ? GUN.interval : GUN.interval + (ARM.burstGap ?? 0.2); }
      else G.fireCd = GUN.interval;
      if (G.mag === 0) { G.burstLeft = 0; if (GUN_DEF.autoReload) startReload(GUN_DEF); }
    } else if (trigger) {
      G.burstLeft = 0;
      const click = i.firePressed || !dryLatch; dryLatch = true;
      if (!emptyTrigger(GUN_DEF, click, i.firePressed) && G.ammo <= 0 && i.firePressed) hud.toast(`Out of ${GUN_CAL()}: switch guns (1 / 2) or bonk them with the briefcase (V)`);
    } else G.burstLeft = 0;
  }
}
const GUN_CAL = () => { const c = activeCaliber(); return c ? CALIBERS[c].name.toLowerCase() : "rounds"; };
// enemy rounds (fireGun with team "enemy") land through hurtPlayer, so the roll contract and armour apply
bulletHooks.hitPlayer = (from, damage) => { hurtPlayer(from, "gun", damage); };

function moveVec(m: { x: number; z: number }) { return new THREE.Vector3(m.x, 0, m.z).applyAxisAngle(UP, G.stage.cam.yaw); }
function move(d: THREE.Vector3) {
  tmp.copy(G.pp).add(d);
  if (!walkable(tmp.x, tmp.z) && walkable(G.pp.x, G.pp.z)) {
    if (walkable(tmp.x, G.pp.z)) tmp.z = G.pp.z; else if (walkable(G.pp.x, tmp.z)) tmp.x = G.pp.x; else tmp.copy(G.pp);
  }
  G.pp.x = tmp.x; G.pp.z = tmp.z; collide(G.pp, PLAYER.radius); G.pp.y = standHeight(G.pp.x, G.pp.z);
}
export function playerArmor(crit = false) { const stats = gearStats(G.gear); return crit ? stats.headArmor : stats.bodyArmor; }

/** the ROLL CONTRACT is enforced here: no damage while rolling, from any source. Returns damage dealt. */
export function hurtPlayer(from: THREE.Vector3, src: string, dmg: number, steal?: Enemy): number {
  if (!G.alive || entryGraceRemaining() > 0 || G.iframes > 0 || G.rollT >= 0 || G.zipping) return 0;
  const crit = G.rng() < ENEMY_CRIT.chance;
  const n = protectPlayerHit(dmg * (crit ? ENEMY_CRIT.damage : 1), crit);
  G.hp = Math.max(0, G.hp - n); G.iframes = PLAYER.iframesHurt; G.hurtT = 0; G.log.hurt += n;
  G.painT = PLAYER.pain.time; useStamina(PLAYER.stamina.pain); G.sprinting = false;
  if (G.useItem) { G.useItem = null; hud.use(null); hud.toast("Interrupted!"); }
  const away = G.pp.clone().sub(from).setY(0).normalize();
  G.vel.addScaledVector(away, 6); G.stage.trauma = Math.min(1, G.stage.trauma + FEEL.hurtTrauma * Math.min(1, n / 20 + 0.3));
  G.stage.kick.addScaledVector(away, 0.22); G.hitStop = 0.05; sfx("hurt");
  floatText(`-${n}`, G.pp.clone().setY(2.5), "#ff5a4a", 26);
  hud.hurt(src); hud.health(); // an ordinary hit never cancels a reload (row 20)
  const loose = steal ? packStacks(G.pack)[G.pouchSlots]?.[0] : undefined;
  if (steal && loose) {
    G.pack.splice(G.pack.indexOf(loose), 1);
    steal.stolen.push(loose);
    hud.toast(`A bandit snatched your ${itemDef(loose).name}! Bonk him to get it back`);
    hud.pack();
  }
  if (G.hp <= 0) { G.alive = false; hud.bonkOut(); }
  return n;
}
