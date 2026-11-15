// Shots, melee, damage, knockouts, breakable walls, noise. Feedback channels are separate (CODE_FINDINGS rule 8):
// enemy flash 90 ms, sound, camera kick on the shot and on kills/hurt only, knockback, hit-stop only on melee kills.
import * as THREE from "three";
import { G, V, flat, angDiff, type Enemy } from "../core/state";
import { KINGPIN, BRIEFCASE, ENEMY, FEEL, GEAR_CRIT_BASE } from "./weapons";
import { rayShot, wallAt, breakWall, isWall, gate, los } from "../world/grid";
import { sfx } from "../core/audio";
import { burst, floatText } from "../../fx";
import { hud } from "../ui/hud";
import { alertEnemy, hearNoise } from "../ai/enemies";
import { dropLoot } from "../loot/raidloot";
import { breakWallVisual } from "../world/props";
import { recordBotCombat } from "../core/bot";
import { gearStats } from "../loot/equipment";
import type { KingpinFx } from "./kingpin";
import { onShot } from "./handling";
import { GUN } from "./gunstats";
import { aimHead, headCenter } from "./headshot";
import { damageNumber, hitMarker, clearFeedback } from "./feedback";
import { surfaceAt } from "./surface";
import { throwDemo } from "./rangfx";
import { bossDamage, enemyHearingRange } from "./boss_hooks"; // -> ../ai/boss once Sol's row-26 commit is merged
import { zoneAt } from "../world/grid";

const tmp = new THREE.Vector3(), to = new THREE.Vector3(), hitAt = new THREE.Vector3();
// ---- projectile bullets (Moo 2026-11-15: "we should be able to see the bullets like Duckov"): each round is a visible
// glowing streak that travels at BULLET_SPEED and hits on arrival; swept against walls and enemies every sim step.
// G1.5 row 03: the streak is what a 0.04 s trail behind the round would cover (Duckov's ordinary trail retention, its
// width 0.19; ours 0.14), and when the round stops the tail keeps running into the stop point for those 0.04 s
// instead of the whole streak blinking out. Bullets are pooled (MAX_BULLETS objects, reused).
// Speed is per round (KINGPIN.bulletSpeed 48 u/s, a suppressor takes 10% off: combat/gunstats.ts GUN.bulletSpeed).
const TRAIL_T = 0.04;
type Bullet = { p: THREE.Vector3; d: THREE.Vector3; left: number; flown: number; alive: boolean; dieT: number; damage: number; crit: boolean; head: Enemy | null; speed: number };
const MAX_BULLETS = 48;
const pool: Bullet[] = Array.from({ length: MAX_BULLETS }, () => ({ p: new THREE.Vector3(), d: new THREE.Vector3(), left: 0, flown: 0, alive: false, dieT: -1, damage: 0, crit: false, head: null, speed: 48 }));
let bulletMesh: THREE.InstancedMesh | null = null;
const bm = new THREE.Matrix4(), bq = new THREE.Quaternion(), bs = new THREE.Vector3(), FWD = new THREE.Vector3(0, 0, 1);
function ensureBulletMesh() {
  if (bulletMesh && bulletMesh.parent === G.stage.scene) return bulletMesh;
  if (!bulletMesh) {
    const g = new THREE.CylinderGeometry(0.07, 0.02, 1, 8, 1, true); g.rotateX(Math.PI / 2); g.translate(0, 0, -0.5); // head at z=0, tail behind
    bulletMesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffe08a").multiplyScalar(4.5), transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), MAX_BULLETS);
    bulletMesh.frustumCulled = false; bulletMesh.renderOrder = 6;
  }
  G.stage.scene.add(bulletMesh); return bulletMesh;
}
const fxk = () => G.fx as KingpinFx;
/** crit damage multiplier for the Kingpin with the worn gear (weapons.ts CRITS) */
export function critMultiplier() { return GUN.critMult * (1 + gearStats(G.gear).critDmg - GEAR_CRIT_BASE); }
export function shoot() {
  G.log.shots++;
  if (G.bot) recordBotCombat("shot", "pistol", G.raidT);
  // the magnet: bend toward the enemy nearest the aim ray within 7 degrees (10 while aiming)
  const stats = gearStats(G.gear);
  let yaw = G.aimYaw, target: Enemy | null = null, bestA = (G.ads ? KINGPIN.magnetAds : KINGPIN.magnet) + stats.aim * Math.PI / 180;
  for (const e of G.enemies) {
    if (e.down || !e.active) continue; const d = flat(G.pp, e.p); if (d > GUN.range) continue;
    const a = Math.abs(angDiff(Math.atan2(e.p.x - G.pp.x, e.p.z - G.pp.z), G.aimYaw)) - Math.atan2(e.rig.bounds.radius, d);
    if (a < bestA) { bestA = a; target = e; }
  }
  if (target) yaw = Math.atan2(target.p.x - G.pp.x, target.p.z - G.pp.z);
  // scatter (combat/handling.ts): the round leaves somewhere inside the live cone, then the cone grows and the cursor kicks
  tmp.copy(G.pp).setY(G.pp.y + 1).project(G.stage.camera);
  yaw += onShot({ x: tmp.x * innerWidth * 0.5, y: tmp.y * innerHeight * 0.5 });
  G.gun.pose({ fireT: 0, reloadT: -1 }); G.gun.root.updateMatrixWorld(true);
  G.gun.muzzle.getWorldPosition(to);
  G.fx.fire(G.gun.muzzle, G.gun.eject, to, "none"); // flash, light, brass; the bullet itself draws the tracer
  // crit at aim time (headshot.ts): the cursor on a head makes this round critical; body shots crit only via gear perks
  const head = G.intent.aimNdc ? aimHead.enemy : null, critical = !!head || G.rng() < stats.crit;
  const b = pool.find((q) => !q.alive && q.dieT < 0) ?? pool.reduce((x, y) => (y.flown > x.flown ? y : x)); // full: recycle the oldest
  b.p.copy(to); b.d.set(Math.sin(yaw), 0, Math.cos(yaw)); b.left = GUN.range; b.speed = GUN.bulletSpeed; b.flown = 0; b.alive = true; b.dieT = -1;
  b.crit = critical; b.head = head; b.damage = Math.round(KINGPIN.damage * (critical ? critMultiplier() : 1));
  sfx("shot"); sfx("shell");
  G.stage.kick.add(tmp.set(-b.d.x, 0, -b.d.z).multiplyScalar(FEEL.shotKick));
  makeNoise(G.pp, GUN.noise, "shot"); // a suppressor shrinks this (combat/gunstats.ts)
}
/** advance bullets one sim step; hits resolve on contact */
export function updateBullets(dt: number) {
  for (const b of pool) {
    if (!b.alive) { if (b.dieT >= 0) { b.dieT += dt; if (b.dieT > TRAIL_T) b.dieT = -1; } continue; }
    const step = Math.min(b.left, b.speed * dt);
    const wallD = rayShot(b.p.x, b.p.z, b.d.x, b.d.z, step + 0.01);
    let hit: Enemy | null = null, hitD = Math.min(step, wallD);
    for (const e of G.enemies) {
      if (e.down) continue;
      const ex = e.p.x - b.p.x, ez = e.p.z - b.p.z, along = ex * b.d.x + ez * b.d.z; if (along < -0.3 || along > hitD) continue;
      if (Math.abs(ex * b.d.z - ez * b.d.x) < e.rig.bounds.radius + 0.12) { hit = e; hitD = Math.max(0, along); }
    }
    if (hit) {
      b.p.addScaledVector(b.d, hitD); b.flown += hitD; b.alive = false; b.dieT = 0; G.log.hits++;
      // the effect sits where the round was aimed: the head for a headshot on that enemy, else mid-body
      if (b.crit && b.head === hit) headCenter(hit, hitAt); else hitAt.copy(b.p).setY(hit.p.y + hit.rig.bounds.height * 0.5);
      b.p.y = hitAt.y;
      damage(hit, b.damage, "pistol", b.d, b.crit, hitAt, b.crit && b.head === hit);
      fxk().impactOn(hitAt, b.d, "enemy", b.crit);
    } else if (wallD <= step) {
      b.p.addScaledVector(b.d, wallD); b.flown += wallD; b.alive = false; b.dieT = 0;
      const surf = surfaceAt(b.p.x + b.d.x * 0.2, b.p.z + b.d.z * 0.2);
      fxk().impactOn(b.p, b.d, surf);
      sfx(IMPACT_SFX[surf], Math.max(0.15, 1 - flat(b.p, G.pp) / 28));
      const w = wallAt(b.p.x + b.d.x * 0.3, b.p.z + b.d.z * 0.3); if (w) hud.toast("Bullets won't break that. Try the briefcase!");
    } else { b.p.addScaledVector(b.d, step); b.left -= step; b.flown += step; if (b.left <= 0) { b.alive = false; b.dieT = 0; } }
  }
}
const IMPACT_SFX = { dirt: "impactDirt", wood: "impactWood", metal: "impactMetal", foliage: "impactFoliage", stone: "impactStone" } as const;
/** draw live bullets as streaks pointing along their flight (one draw call); a stopped round's tail runs in for 0.04 s */
export function renderBullets() {
  const m = ensureBulletMesh(); let n = 0;
  for (const b of pool) {
    if (!b.alive && b.dieT < 0) continue;
    if (n >= MAX_BULLETS) break; // capacity, not m.count (count is how many we drew last frame)
    const trail = Math.min(b.speed * TRAIL_T, b.flown + 0.2) - (b.alive ? 0 : b.speed * b.dieT);
    if (trail <= 0.02) continue;
    bq.setFromUnitVectors(FWD, b.d); bs.set(1, 1, trail); bm.compose(b.p, bq, bs); m.setMatrixAt(n++, bm);
  }
  m.count = n; m.instanceMatrix.needsUpdate = true; m.visible = n > 0;
}
export function clearBullets() { for (const b of pool) { b.alive = false; b.dieT = -1; } if (bulletMesh) { bulletMesh.count = 0; bulletMesh.removeFromParent(); } clearFeedback(); }
export function swingBriefcase() {
  const fx = Math.sin(G.aimYaw), fz = Math.cos(G.aimYaw);
  let any = false;
  for (const e of G.enemies) {
    if (e.down) continue; const d = flat(G.pp, e.p) - e.rig.bounds.radius; if (d > BRIEFCASE.reach) continue;
    const a = Math.abs(angDiff(Math.atan2(e.p.x - G.pp.x, e.p.z - G.pp.z), G.aimYaw)); if (a > BRIEFCASE.arc / 2 && d > 0.4) continue;
    if (!los(G.pp.x, G.pp.z, e.p.x, e.p.z)) continue;
    damage(e, BRIEFCASE.damage, "briefcase", V(fx, fz)); any = true;
  }
  // breakable walls in front
  for (const r of [0.9, 1.5, 2.0]) {
    const w = wallAt(G.pp.x + fx * r, G.pp.z + fz * r);
    if (w) { hitWall(w.id, 1, G.pp.clone().add(V(fx * r, fz * r, 1))); any = true; break; }
  }
  if (any) { sfx("bonk"); G.stage.kick.add(V(fx, fz).multiplyScalar(0.08)); }
  makeNoise(G.pp, BRIEFCASE.noise, "melee");
}
const wallHp = new Map<string, number>();
export function hitWall(id: string, n: number, at: THREE.Vector3) {
  const w = gate(id); if (!w || w.hp === undefined || w.open) return; // breakable wall sections and boarded doors are both gates in the grid
  const hp = (wallHp.get(id) ?? w.hp) - n; wallHp.set(id, hp);
  const woody = w.mat === "palisade" || w.mat === "hull" || w.mat === "wood";
  burst(at, 8, woody ? "#a8824f" : "#b9ab94", 0.8); sfx(woody ? "impactWood" : "impactStone");
  if (hp <= 0) {
    breakWall(id); breakWallVisual(id); sfx("crate"); sfx("thunk"); G.stage.trauma = Math.min(1, G.stage.trauma + 0.4);
    if (w.reveals) hud.banner(w.reveals); G.log.breaks.push(id); makeNoise(at, 10, "smash");
    if (w.persist && !G.save.fixtures.includes("open:" + id)) G.save.fixtures.push("open:" + id);
  } else floatText(["crack!", "CRACK!", "KRAK!"][Math.min(2, w.hp - hp - 1)] ?? "crack!", at, "#7a5a3c", 20);
}
export function resetWalls() { wallHp.clear(); }

/** apply damage to an enemy. Player-origin hits (pistol, briefcase) get a damage number, a hit marker and its sound;
 *  crit = the round was classified critical at aim time (headshot.ts); at = where it landed (for the number) */
export function damage(e: Enemy, n: number, by: "pistol" | "briefcase" | "slam" | "ram", dir: THREE.Vector3, crit = false, at?: THREE.Vector3, head = false) {
  if (e.down) return;
  if (e.kind === "sleeper" && e.state !== "stunned") { // awake hits plink for zero (advisor 18)
    floatText("plink", e.p.clone().setY(3.4), "#8a8fa0", 18); sfx("hit", 0.4); if (e.state === "sleep") hearNoise(e, 3); return;
  }
  // boss resistance (ai/boss.ts, Sol row 26) after the head/crit classification; it is the only armour-like step on
  // this path (enemies wear no armour against the player here), so nothing is applied twice
  n = Math.max(1, Math.round(bossDamage(e, n, head ? "head" : "body")));
  e.hp -= n; e.flash = FEEL.flash; e.hitAt = G.raidT;
  const player = by === "pistol" || by === "briefcase", kill = e.hp <= 0;
  if (player) {
    damageNumber(n, at ?? hitAt.copy(e.p).setY(e.p.y + e.rig.bounds.height * 0.6), crit);
    hitMarker(kill ? (crit ? "critKill" : "kill") : crit ? "crit" : "hit");
  }
  if (by !== "pistol") sfx("bonk");
  if (e.kind !== "brute" && e.kind !== "sleeper") e.vel.addScaledVector(dir, by === "briefcase" ? BRIEFCASE.knock : 2.5);
  if (by !== "pistol") burst(e.p.clone().setY(1.2), by === "briefcase" ? 10 : 5, "#fff3b0", 0.7); // bullets bring their own pop (kingpin impactOn)
  if (by === "briefcase") floatText("BONK!", e.p.clone().setY(e.rig.bounds.height + 0.8), "#e8493a", 24);
  if (e.state === "sleep" || e.state === "patrol" || e.state === "return") alertEnemy(e, true);
  if (kill) knockOut(e, by);
}
export function knockOut(e: Enemy, by: string) {
  if (G.bot) recordBotCombat("kill", by === "briefcase" ? "melee" : by === "pistol" ? "pistol" : "environment", G.raidT, e.id);
  e.down = true; e.state = "down"; e.downT = 0; e.vel.set(0, 0, 0);
  G.log.kills[e.kind] = (G.log.kills[e.kind] ?? 0) + 1; if (by === "pistol" || by === "briefcase") G.log.killsBy[by]++;
  sfx("ko"); G.stage.kick.add(e.p.clone().sub(G.pp).setY(0).normalize().multiplyScalar(FEEL.killKick * 0.5));
  if (by === "briefcase") G.hitStop = FEEL.hitStopKill;
  floatText(e.kind === "sleeper" ? "THE SLEEPER IS OUT COLD!" : ["OOF!", "WHOOPS!", "NIGHTY NIGHT!", "BONKED!"][e.id % 4], e.p.clone().setY(e.rig.bounds.height + 0.8), "#ffd84a", e.kind === "sleeper" ? 34 : 24);
  if (e.ring) e.ring.visible = false; if (e.stripe) e.stripe.visible = false;
  if (e.rang) { e.rang.back = true; }
  dropLoot(e);
  hud.enemyDown(e);
}

/** noise: a visible ring when loud; wakes/alerts listeners inside the radius (rule 10: predictable) */
export function makeNoise(at: THREE.Vector3, r: number, kind: string) {
  for (const e of G.enemies) { if (e.down) continue; const d = flat(at, e.p); if (d < enemyHearingRange(e, r)) hearNoise(e, kind === "shot" ? 1 : kind === "smash" ? 1 : 0.5, at); }
  if (r >= 8) hud.noiseRing(at, r);
}
void isWall; void tmp; void ENEMY;
// capture and test handle (tools/combatfeel.mjs): read-only queries, no game state changes
(globalThis as unknown as { __combat: object }).__combat = { surfaceAt, headCenter, aimHead, critMultiplier, rayShot, throwDemo, ground: (x: number, z: number) => zoneAt(x, z)?.ground ?? null, live: () => pool.filter((b) => b.alive).length };
