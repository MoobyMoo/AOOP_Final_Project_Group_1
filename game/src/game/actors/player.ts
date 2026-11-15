// Player controller on Duckov's body mechanisms (combat/weapons.ts header): HP + armor, stamina (sprint, dodge,
// melee, pain), weight states, timed healing, aim-down-sights. Implements the roll contract and the one cancel rule.
import * as THREE from "three";
import { G, V, flat, angDiff, type Enemy } from "../core/state";
import { PLAYER, KINGPIN, BRIEFCASE, FEEL, HEALS } from "../combat/weapons";
import { ENEMY_CRIT, SLOTS, equipDef, gearStats } from "../loot/equipment";
import { EQUIP_MOVE, interruptEquip, protectPlayerHit, updateEquipment } from "../loot/equipment-actions";
import { collide, walkable } from "../world/grid";
import { groundHeight } from "../world/terrain";
import { sfx } from "../core/audio";
import { shoot, swingBriefcase, makeNoise } from "../combat/combat";
import { hud } from "../ui/hud";
import { itemDef } from "../loot/raidloot";
import { floatText, burst } from "../../fx";
import { updateAimHead, aimHead } from "../combat/headshot";
import { startReload, cancelReload, updateReload, emptyTrigger } from "../combat/reload";
import { startDash, dustColor } from "./dash";
import type { KingpinFx } from "../combat/kingpin";

const UP = new THREE.Vector3(0, 1, 0);
const tmp = new THREE.Vector3();
let stepT = 0, dryLatch = false;

/** enemy nearest the aim ray (advisor 14), used by keyboard lock and the bullet magnet */
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
export function carriedWeight() { return G.pack.reduce((a, id) => a + (itemDef(id).weight ?? 1), 0) + SLOTS.reduce((total, slot) => total + (equipDef(G.gear[slot])?.weight ?? 0), 0) + (G.ammo + G.mag) * 0.02; }
export function weightState() { const r = G.weight / (PLAYER.maxWeight + 4 * G.save.upgrades.pack + gearStats(G.gear).maxWeight), w = PLAYER.weight; return r > 1 ? "over" : r > w.heavy ? "heavy" : r <= w.light ? "light" : "normal"; }

export function updatePlayer(dt: number) {
  const i = G.intent, st = G.stage, S = PLAYER.stamina;
  G.iframes = Math.max(0, G.iframes - dt); G.fireCd -= dt; G.meleeCd -= dt; G.rollCd -= dt; G.fireT += dt / 0.25; G.painT -= dt;
  if (G.hurtT >= 0) { G.hurtT += dt / 0.35; if (G.hurtT >= 1) G.hurtT = -1; }
  G.staminaDelay -= dt; if (G.staminaDelay <= 0 && !G.sprinting) G.stamina = Math.min(S.max, G.stamina + S.recover * dt);
  if (!G.alive || G.zipping) return;
  updateEquipment(dt);
  G.weight = carriedWeight();

  // ---- aim (RMB = aim down sights: steadier, longer camera lead, wider magnet)
  G.ads = i.ads && G.rollT < 0;
  if (i.aimNdc) {
    const p = st.pick(i.aimNdc.x, i.aimNdc.y, G.pp.y + 1.0); G.aimPoint.copy(p);
    // on a head (headshot.ts): half the correction toward the head centre, Duckov's aim-height fix, so the shot and the
    // crosshair go for the enemy the cursor is on, not for the ground plane behind its head
    if (updateAimHead(i.aimNdc)) { G.aimPoint.x += (aimHead.point.x - G.aimPoint.x) * 0.5; G.aimPoint.z += (aimHead.point.z - G.aimPoint.z) * 0.5; }
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
  const busy = G.fireCd > -0.25 || G.ads || G.useItem || G.equipping || G.meleeT >= 0; // reloading does not stop a sprint (row 20)
  if (G.sprinting) { if (!i.sprint || !moving || busy || G.stamina <= 0) G.sprinting = false; }
  else if (i.sprint && moving && !busy && G.stamina >= S.sprintStart) G.sprinting = true;
  if (G.sprinting) useStamina(S.sprintDrain * dt);
  const ws = weightState(), W = PLAYER.weight;
  const wMul = ws === "light" ? 1 + W.lightBonus : ws === "heavy" ? 1 - W.heavySlow : ws === "over" ? 1 - W.overSlow : 1;
  let speed = (G.sprinting ? PLAYER.sprint : PLAYER.speed) * wMul * gearStats(G.gear).speed;
  if (G.equipping) speed *= EQUIP_MOVE;
  if (G.skidT > 0) speed *= PLAYER.roll.skidSpeed; G.skidT -= dt;
  if (G.painT > 0) speed *= 1 - PLAYER.pain.slow;
  if (G.useItem) speed *= 1 - HEALS[G.useItem.id].slow;
  if (G.ads) speed *= 0.7; else if (G.fireCd > -0.25) speed *= 0.85;
  G.vel.lerp(mv.multiplyScalar(speed), Math.min(1, dt * 14));
  move(G.vel.clone().multiplyScalar(dt));
  if (G.vel.lengthSq() > 0.3) {
    G.moveYaw = Math.atan2(G.vel.x, G.vel.z); stepT -= dt * G.vel.length();
    if (stepT < 0) {
      stepT = 1.7; sfx("step", ws === "heavy" || ws === "over" ? 1 : 0.6); if (G.sprinting || ws === "heavy" || ws === "over") makeNoise(G.pp, G.sprinting ? 7 : 5, "step");
      const dc = G.sprinting ? dustColor(G.pp.x, G.pp.z) : null; // footstep dust: one puff per sprinting step on loose ground (POLISH_FINDINGS 4)
      if (dc) (G.fx as KingpinFx).dust(G.pp, -G.vel.x * 0.08, -G.vel.z * 0.08, 1, dc, 0.8);
    }
  } else if (Math.abs(angDiff(G.aimYaw, G.moveYaw)) > 1.3) G.moveYaw = G.aimYaw;

  // ---- healing: hold-free timed use (Q uses your best heal); a roll or a hit interrupts it
  if (G.useItem) {
    G.useItem.t += dt; hud.use(G.useItem);
    if (G.useItem.t >= G.useItem.time) {
      const h = HEALS[G.useItem.id], amount = Math.round(h.heal * gearStats(G.gear).heal); G.hp = Math.min(G.maxHp, G.hp + amount); sfx("heal"); burst(G.pp.clone().setY(1.5), 12, "#ff9ec4", 0.6);
      floatText(`+${amount}`, G.pp.clone().setY(2.6), "#6ad16a", 24);
      const k = G.pack.indexOf(G.useItem.id); if (k >= 0) G.pack.splice(k, 1);
      G.useItem = null; hud.use(null); hud.health(); hud.pack();
    }
  } else if (i.heal && !G.equipping) {
    const id = ["firstaid", "smoothie", "bandage"].find((h) => G.pack.includes(h));
    if (!id) hud.toast("No bandage or smoothie in your pack");
    else if (G.hp >= G.maxHp) hud.toast("You're already at full health");
    else { G.useItem = { id, t: 0, time: HEALS[id].time }; cancelReload(); sfx("ui"); }
  }

  // ---- reload (combat/reload.ts): R, or the trigger on an empty gun; walk and run freely meanwhile
  const loaded = G.mag;
  if (!G.useItem) updateReload(dt);
  if (i.reload && !G.useItem) startReload(KINGPIN);
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

  // ---- fire (hold to fire at 0.22 s). Empty: a dry click (one per 200 ms) and a fresh pull starts the reload;
  // autoReload is off for the Kingpin, so running dry with the trigger held only clicks once
  const trigger = i.fire || i.firePressed; // a tap shorter than one sim step still fires
  if (!trigger) dryLatch = false;
  if (trigger && G.meleeT < 0 && G.fireCd <= 0 && G.reloadT < 0 && !G.useItem && !G.equipping) {
    G.sprinting = false;
    if (G.mag > 0) {
      G.mag--; G.fireCd = KINGPIN.interval; G.fireT = 0; shoot(); hud.ammo(); if (G.log.firstShot < 0) G.log.firstShot = G.raidT;
      if (G.mag === 0 && KINGPIN.autoReload) startReload(KINGPIN);
    } else {
      const click = i.firePressed || !dryLatch; dryLatch = true;
      if (!emptyTrigger(KINGPIN, click, i.firePressed) && G.ammo <= 0 && i.firePressed) hud.toast("Out of rounds: bonk them with the briefcase (V)");
    }
  }
}

function moveVec(m: { x: number; z: number }) { return new THREE.Vector3(m.x, 0, m.z).applyAxisAngle(UP, G.stage.cam.yaw); }
function move(d: THREE.Vector3) {
  tmp.copy(G.pp).add(d);
  if (!walkable(tmp.x, tmp.z) && walkable(G.pp.x, G.pp.z)) {
    if (walkable(tmp.x, G.pp.z)) tmp.z = G.pp.z; else if (walkable(G.pp.x, tmp.z)) tmp.x = G.pp.x; else tmp.copy(G.pp);
  }
  G.pp.x = tmp.x; G.pp.z = tmp.z; collide(G.pp, PLAYER.radius); G.pp.y = groundHeight(G.pp.x, G.pp.z);
}
export function playerArmor(crit = false) { const stats = gearStats(G.gear); return crit ? stats.headArmor : stats.bodyArmor; }

/** the ROLL CONTRACT is enforced here: no damage while rolling, from any source. Returns damage dealt. */
export function hurtPlayer(from: THREE.Vector3, src: string, dmg: number, steal?: Enemy): number {
  if (!G.alive || G.iframes > 0 || G.rollT >= 0 || G.zipping) return 0;
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
  if (steal && G.pack.length > G.pouchSlots) { const loose = G.pack.splice(G.pouchSlots, 1)[0]; steal.stolen.push(loose); hud.toast(`A bandit snatched your ${itemDef(loose).name}! Bonk him to get it back`); hud.pack(); }
  if (G.hp <= 0) { G.alive = false; hud.bonkOut(); }
  return n;
}
