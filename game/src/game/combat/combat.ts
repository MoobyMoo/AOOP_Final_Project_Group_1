// Shots, melee, damage, knockouts, breakable walls, noise. Feedback channels are separate (CODE_FINDINGS rule 8):
// enemy flash 90 ms, sound, camera kick on the shot and on kills/hurt only, knockback, hit-stop only on melee kills.
import * as THREE from "three";
import { G, V, flat, angDiff, type Enemy } from "../core/state";
import { KINGPIN, BRIEFCASE, ENEMY, FEEL } from "./weapons";
import { rayShot, wallAt, breakWall, isWall, gate } from "../world/grid";
import { sfx } from "../core/audio";
import { burst, floatText } from "../../fx";
import { hud } from "../ui/hud";
import { alertEnemy, hearNoise } from "../ai/enemies";
import { dropLoot } from "../loot/raidloot";
import { breakWallVisual } from "../world/props";
import { recordBotCombat } from "../core/bot";

const tmp = new THREE.Vector3(), to = new THREE.Vector3();
// ---- projectile bullets (Moo 2026-11-15: "we should be able to see the bullets like Duckov"): each round is a visible
// glowing streak that travels at BULLET_SPEED and hits on arrival; swept against walls and enemies every sim step.
const BULLET_SPEED = 48, BULLET_LEN = 1.3;
type Bullet = { p: THREE.Vector3; d: THREE.Vector3; left: number; alive: boolean };
const bullets: Bullet[] = [];
const MAX_BULLETS = 48;
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
export function shoot() {
  G.log.shots++;
  if (G.bot) recordBotCombat("shot", "pistol", G.raidT);
  // the magnet: bend toward the enemy nearest the aim ray within 7 degrees (10 while aiming)
  let yaw = G.aimYaw, target: Enemy | null = null, bestA = G.ads ? KINGPIN.magnetAds : KINGPIN.magnet;
  for (const e of G.enemies) {
    if (e.down || !e.active) continue; const d = flat(G.pp, e.p); if (d > KINGPIN.range) continue;
    const a = Math.abs(angDiff(Math.atan2(e.p.x - G.pp.x, e.p.z - G.pp.z), G.aimYaw)) - Math.atan2(e.rig.bounds.radius, d);
    if (a < bestA) { bestA = a; target = e; }
  }
  if (target) yaw = Math.atan2(target.p.x - G.pp.x, target.p.z - G.pp.z);
  yaw += (G.rng() - 0.5) * (G.ads ? 0.02 : 0.05); // a little spread so a burst looks alive
  G.gun.pose({ fireT: 0, reloadT: -1 }); G.gun.root.updateMatrixWorld(true);
  G.gun.muzzle.getWorldPosition(to);
  G.fx.fire(G.gun.muzzle, G.gun.eject, to, "none"); // flash, light, brass; the bullet itself draws the tracer
  const d = V(Math.sin(yaw), Math.cos(yaw));
  bullets.push({ p: to.clone(), d, left: KINGPIN.range, alive: true });
  sfx("shot"); sfx("shell");
  G.stage.kick.add(V(-d.x, -d.z).multiplyScalar(FEEL.shotKick));
  makeNoise(G.pp, KINGPIN.noise, "shot");
}
/** advance bullets one sim step; hits resolve on contact */
export function updateBullets(dt: number) {
  for (const b of bullets) {
    if (!b.alive) continue;
    const step = Math.min(b.left, BULLET_SPEED * dt);
    const wallD = rayShot(b.p.x, b.p.z, b.d.x, b.d.z, step + 0.01);
    let hit: Enemy | null = null, hitD = Math.min(step, wallD);
    for (const e of G.enemies) {
      if (e.down) continue;
      const ex = e.p.x - b.p.x, ez = e.p.z - b.p.z, along = ex * b.d.x + ez * b.d.z; if (along < -0.3 || along > hitD) continue;
      if (Math.abs(ex * b.d.z - ez * b.d.x) < e.rig.bounds.radius + 0.12) { hit = e; hitD = Math.max(0, along); }
    }
    if (hit) {
      b.p.addScaledVector(b.d, hitD); b.alive = false; G.log.hits++;
      damage(hit, KINGPIN.damage, "pistol", b.d.clone());
      G.fx.impact?.(b.p.clone().setY(hit.p.y + hit.rig.bounds.height * 0.5), b.d, "enemy");
    } else if (wallD <= step) {
      b.p.addScaledVector(b.d, wallD); b.alive = false; G.fx.impact?.(b.p, b.d, "wall");
      const w = wallAt(b.p.x + b.d.x * 0.3, b.p.z + b.d.z * 0.3); if (w) hud.toast("Bullets won't break that. Try the briefcase!");
    } else { b.p.addScaledVector(b.d, step); b.left -= step; if (b.left <= 0) b.alive = false; }
  }
  for (let i = bullets.length - 1; i >= 0; i--) if (!bullets[i].alive) bullets.splice(i, 1);
}
/** draw live bullets as streaks pointing along their flight (one draw call) */
export function renderBullets() {
  const m = ensureBulletMesh(); let n = 0;
  for (const b of bullets) {
    if (n >= MAX_BULLETS) break; // capacity, not m.count (count is how many we drew last frame)
    bq.setFromUnitVectors(FWD, b.d); const trail = Math.min(BULLET_LEN, KINGPIN.range - b.left + 0.2);
    bs.set(1, 1, trail); bm.compose(b.p, bq, bs); m.setMatrixAt(n++, bm);
  }
  m.count = n; m.instanceMatrix.needsUpdate = true; m.visible = n > 0;
}
export function clearBullets() { bullets.length = 0; if (bulletMesh) { bulletMesh.count = 0; bulletMesh.removeFromParent(); } }
export function swingBriefcase() {
  const fx = Math.sin(G.aimYaw), fz = Math.cos(G.aimYaw);
  let any = false;
  for (const e of G.enemies) {
    if (e.down) continue; const d = flat(G.pp, e.p) - e.rig.bounds.radius; if (d > BRIEFCASE.reach) continue;
    const a = Math.abs(angDiff(Math.atan2(e.p.x - G.pp.x, e.p.z - G.pp.z), G.aimYaw)); if (a > BRIEFCASE.arc / 2 && d > 0.4) continue;
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
  burst(at, 8, w.mat === "palisade" || w.mat === "hull" || w.mat === "wood" ? "#a8824f" : "#b9ab94", 0.8); sfx("hit");
  if (hp <= 0) {
    breakWall(id); breakWallVisual(id); sfx("crate"); sfx("thunk"); G.stage.trauma = Math.min(1, G.stage.trauma + 0.4);
    if (w.reveals) hud.banner(w.reveals); G.log.breaks.push(id); makeNoise(at, 10, "smash");
    if (w.persist && !G.save.fixtures.includes("open:" + id)) G.save.fixtures.push("open:" + id);
  } else floatText(["crack!", "CRACK!", "KRAK!"][Math.min(2, w.hp - hp - 1)] ?? "crack!", at, "#7a5a3c", 20);
}
export function resetWalls() { wallHp.clear(); }

export function damage(e: Enemy, n: number, by: "pistol" | "briefcase" | "slam" | "ram", dir: THREE.Vector3) {
  if (e.down) return;
  if (e.kind === "sleeper" && e.state !== "stunned") { // awake hits plink for zero (advisor 18)
    floatText("plink", e.p.clone().setY(3.4), "#8a8fa0", 18); sfx("hit", 0.4); if (e.state === "sleep") hearNoise(e, 3); return;
  }
  e.hp -= n; e.flash = FEEL.flash; floatText(String(n), e.p.clone().setY(e.rig.bounds.height + 0.2 + G.rng() * 0.4), by === "briefcase" ? "#ffd84a" : "#fff8ec", 18); sfx(by === "pistol" ? "hit" : "bonk"); hud.hitMarker(e.hp <= 0);
  if (e.kind !== "brute" && e.kind !== "sleeper") e.vel.addScaledVector(dir, by === "briefcase" ? BRIEFCASE.knock : 2.5);
  burst(e.p.clone().setY(1.2), by === "briefcase" ? 10 : 5, "#fff3b0", 0.7);
  if (by === "briefcase") floatText("BONK!", e.p.clone().setY(e.rig.bounds.height + 0.8), "#e8493a", 24);
  if (e.state === "sleep" || e.state === "patrol" || e.state === "return") alertEnemy(e, true);
  if (e.hp <= 0) knockOut(e, by);
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
  for (const e of G.enemies) { if (e.down) continue; const d = flat(at, e.p); if (d < r) hearNoise(e, kind === "shot" ? 1 : kind === "smash" ? 1 : 0.5, at); }
  if (r >= 8) hud.noiseRing(at, r);
}
void isWall; void tmp; void ENEMY;
