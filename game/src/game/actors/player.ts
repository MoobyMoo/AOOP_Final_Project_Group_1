// Player controller: movement, aim (mouse cursor or sticky keyboard lock), Kingpin fire/reload, briefcase melee,
// dodge roll, hurt. Implements the roll contract and the single cancel rule in combat/weapons.ts.
import * as THREE from "three";
import { G, V, flat, angDiff, type Enemy } from "../core/state";
import { PLAYER, KINGPIN, BRIEFCASE, FEEL } from "../combat/weapons";
import { collide, walkable, wallAt } from "../world/grid";
import { groundHeight } from "../world/terrain";
import { sfx } from "../core/audio";
import { shoot, swingBriefcase, makeNoise } from "../combat/combat";
import { hud } from "../ui/hud";

const UP = new THREE.Vector3(0, 1, 0);
const tmp = new THREE.Vector3();
let stepT = 0;

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

export function updatePlayer(dt: number) {
  const i = G.intent, st = G.stage;
  G.iframes = Math.max(0, G.iframes - dt); G.fireCd -= dt; G.meleeCd -= dt; G.rollCd -= dt; G.fireT += dt / 0.25;
  if (G.hurtT >= 0) { G.hurtT += dt / 0.35; if (G.hurtT >= 1) G.hurtT = -1; }
  if (!G.alive || G.zipping) return;

  // ---- aim
  if (i.aimNdc) {
    const p = st.pick(i.aimNdc.x, i.aimNdc.y, G.pp.y + 1.0); G.aimPoint.copy(p);
    G.aimYaw = Math.atan2(p.x - G.pp.x, p.z - G.pp.z); G.lockTarget = null;
  } else {
    // keyboard/trackpad: sticky lock on the enemy nearest the facing ray; Tab cycles (handled in input as swap1..)
    if (!G.lockTarget || G.lockTarget.down || flat(G.lockTarget.p, G.pp) > 13) G.lockTarget = nearestToRay(12, Math.PI * 0.6, G.pp, G.moveYaw);
    if (G.lockTarget) { G.aimYaw = Math.atan2(G.lockTarget.p.x - G.pp.x, G.lockTarget.p.z - G.pp.z); G.aimPoint.copy(G.lockTarget.p).setY(1); }
    else { G.aimYaw = G.moveYaw; G.aimPoint.copy(G.pp).addScaledVector(V(Math.sin(G.moveYaw), Math.cos(G.moveYaw)), 6); }
  }

  // ---- roll (input buffered 0.12 s)
  if (i.roll) G.rollBuffer = PLAYER.roll.buffer; else G.rollBuffer -= dt;
  const meleeWindup = G.meleeT >= 0 && G.meleeT < BRIEFCASE.wind / BRIEFCASE.cycle;
  if (G.rollBuffer > 0 && G.rollT < 0 && G.rollCd <= 0 && !meleeWindup) {
    G.rollBuffer = 0; G.rollT = 0; G.log.rolls++; if (G.log.firstRoll < 0) G.log.firstRoll = G.raidT;
    const mv = moveVec(i.move);
    G.rollDir.copy(mv.lengthSq() > 0.01 ? mv.normalize() : V(Math.sin(G.aimYaw), Math.cos(G.aimYaw)));
    G.meleeT = -1; // roll interrupts melee recovery
    if (G.reloadT >= 0) G.reloadPaused = true; // and pauses a reload
    sfx("roll"); makeNoise(G.pp, PLAYER.roll.noise, "roll");
  }
  if (G.rollT >= 0) {
    G.rollT += dt / PLAYER.roll.time;
    const sp = PLAYER.roll.dist / PLAYER.roll.time;
    move(G.rollDir.clone().multiplyScalar(sp * dt));
    G.moveYaw = Math.atan2(G.rollDir.x, G.rollDir.z); G.vel.copy(G.rollDir).multiplyScalar(sp);
    if (G.rollT >= 1) { G.rollT = -1; G.skidT = PLAYER.roll.skid; G.rollCd = PLAYER.roll.cooldown; G.reloadPaused = false; }
    return;
  }

  // ---- move
  const mv = moveVec(i.move);
  const slow = G.skidT > 0 ? PLAYER.roll.skidSpeed : 1; G.skidT -= dt;
  const packSlow = 1 - Math.max(0, G.pack.length - G.packSlots * 0.75) * 0.02;
  const aimSlow = G.fireCd > -0.25 ? 0.82 : 1; // a little slower while shooting
  G.vel.lerp(mv.multiplyScalar(PLAYER.speed * slow * packSlow * aimSlow), Math.min(1, dt * 14));
  move(G.vel.clone().multiplyScalar(dt));
  if (G.vel.lengthSq() > 0.3) { G.moveYaw = Math.atan2(G.vel.x, G.vel.z); stepT -= dt * G.vel.length(); if (stepT < 0) { stepT = 1.7; sfx("step", 0.6); } }
  else if (Math.abs(angDiff(G.aimYaw, G.moveYaw)) > 1.3) G.moveYaw = G.aimYaw; // standing: hips follow the aim

  // ---- reload
  if (G.reloadT >= 0 && !G.reloadPaused) {
    const before = G.reloadT; G.reloadT += dt / KINGPIN.reload;
    if (before < 0.15 && G.reloadT >= 0.15) sfx("reloadOut");
    if (before < 0.65 && G.reloadT >= 0.65) sfx("reloadIn");
    if (before < 0.85 && G.reloadT >= 0.85) sfx("slide");
    if (G.reloadT >= 1) { const n = Math.min(G.magSize - G.mag, G.ammo); G.mag += n; G.ammo -= n; G.reloadT = -1; hud.ammo(); }
  }
  if (i.reload && G.reloadT < 0 && G.mag < G.magSize && G.ammo > 0) G.reloadT = 0;

  // ---- melee (always available: right click / space / F / K)
  if (G.meleeT >= 0) {
    const before = G.meleeT; G.meleeT += dt / BRIEFCASE.cycle;
    const hitAt = BRIEFCASE.wind / BRIEFCASE.cycle + 0.05;
    if (before < hitAt && G.meleeT >= hitAt) swingBriefcase();
    if (G.meleeT >= 1) G.meleeT = -1;
  } else if (i.melee && G.meleeCd <= 0) {
    G.meleeT = 0; G.meleeCd = BRIEFCASE.cycle; sfx("swing");
    if (G.reloadT >= 0) G.reloadT = 0; // melee restarts a reload
    if (!i.aimNdc) { const t = nearestToRay(3, Math.PI, G.pp, G.moveYaw); if (t) G.aimYaw = Math.atan2(t.p.x - G.pp.x, t.p.z - G.pp.z); }
  }

  // ---- fire (hold to fire at 0.22 s)
  if (i.fire && G.meleeT < 0 && G.fireCd <= 0 && G.reloadT < 0) {
    if (G.mag > 0) { G.mag--; G.fireCd = KINGPIN.interval; G.fireT = 0; shoot(); hud.ammo(); if (G.log.firstShot < 0) G.log.firstShot = G.raidT; }
    else if (G.ammo > 0) G.reloadT = 0;
    else if (i.firePressed) { sfx("dry"); G.fireCd = 0.3; hud.toast("Out of rounds: bonk them with the briefcase (right click / Space)"); }
  }
  if (G.mag === 0 && G.ammo > 0 && G.reloadT < 0 && G.fireCd < -0.4) G.reloadT = 0; // auto-reload an empty gun
}

function moveVec(m: { x: number; z: number }) { return new THREE.Vector3(m.x, 0, m.z).applyAxisAngle(UP, G.stage.cam.yaw); }
function move(d: THREE.Vector3) {
  tmp.copy(G.pp).add(d);
  if (!walkable(tmp.x, tmp.z) && walkable(G.pp.x, G.pp.z)) { // slide along walls
    if (walkable(tmp.x, G.pp.z)) tmp.z = G.pp.z; else if (walkable(G.pp.x, tmp.z)) tmp.x = G.pp.x; else tmp.copy(G.pp);
  }
  G.pp.x = tmp.x; G.pp.z = tmp.z; collide(G.pp, PLAYER.radius); G.pp.y = groundHeight(G.pp.x, G.pp.z);
}

/** the ROLL CONTRACT is enforced here: no damage while rolling, from any source */
export function hurtPlayer(from: THREE.Vector3, src: string, steal?: Enemy): boolean {
  if (!G.alive || G.iframes > 0 || G.rollT >= 0 || G.zipping) return false;
  G.hearts--; G.iframes = PLAYER.iframesHurt; G.hurtT = 0; G.log.hurt++;
  const away = G.pp.clone().sub(from).setY(0).normalize();
  G.vel.addScaledVector(away, 7); G.stage.trauma = Math.min(1, G.stage.trauma + FEEL.hurtTrauma);
  G.stage.kick.addScaledVector(away, 0.25); G.hitStop = 0.06; sfx("hurt");
  if (G.reloadT >= 0) G.reloadT = 0;
  hud.hurt(src); hud.hearts();
  if (steal) { const loose = G.pack.length > G.pouchSlots ? G.pack.splice(G.pack.length - 1, 1)[0] : null; if (loose) { steal.stolen.push(loose); hud.toast("A bandit snatched your " + loose.replace(/_/g, " ") + "! Bonk him to get it back"); hud.pack(); } }
  if (G.hearts <= 0) { G.alive = false; hud.bonkOut(); }
  return true;
}
void wallAt;
