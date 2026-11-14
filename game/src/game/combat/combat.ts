// Shots, melee, damage, knockouts, breakable walls, noise. Feedback channels are separate (CODE_FINDINGS rule 8):
// enemy flash 90 ms, sound, camera kick on the shot and on kills/hurt only, knockback, hit-stop only on melee kills.
import * as THREE from "three";
import { G, V, flat, angDiff, type Enemy } from "../core/state";
import { KINGPIN, BRIEFCASE, ENEMY, FEEL } from "./weapons";
import { rayShot, wallAt, breakWall, isWall } from "../world/grid";
import { WALLS } from "../world/layout";
import { sfx } from "../core/audio";
import { burst, floatText } from "../../fx";
import { hud } from "../ui/hud";
import { alertEnemy, hearNoise } from "../ai/enemies";
import { dropLoot } from "../loot/raidloot";
import { breakWallVisual } from "../world/props";

const tmp = new THREE.Vector3(), to = new THREE.Vector3();
export function shoot() {
  G.log.shots++;
  // the magnet: bend toward the enemy nearest the aim ray within 7 degrees
  let yaw = G.aimYaw, target: Enemy | null = null, bestA = G.ads ? KINGPIN.magnetAds : KINGPIN.magnet;
  for (const e of G.enemies) {
    if (e.down || !e.active) continue; const d = flat(G.pp, e.p); if (d > KINGPIN.range) continue;
    const a = Math.abs(angDiff(Math.atan2(e.p.x - G.pp.x, e.p.z - G.pp.z), G.aimYaw)) - Math.atan2(e.rig.bounds.radius, d);
    if (a < bestA) { bestA = a; target = e; }
  }
  if (target) yaw = Math.atan2(target.p.x - G.pp.x, target.p.z - G.pp.z);
  const dx = Math.sin(yaw), dz = Math.cos(yaw);
  const sx = G.pp.x + dx * 0.6, sz = G.pp.z + dz * 0.6;
  const wallD = rayShot(sx, sz, dx, dz, KINGPIN.range);
  // first enemy along the ray before the wall
  let hit: Enemy | null = null, hitD = wallD;
  for (const e of G.enemies) {
    if (e.down) continue;
    const ex = e.p.x - sx, ez = e.p.z - sz, along = ex * dx + ez * dz; if (along < 0 || along > hitD) continue;
    const side = Math.abs(ex * dz - ez * dx); if (side < e.rig.bounds.radius + 0.15) { hit = e; hitD = along; }
  }
  to.set(sx + dx * hitD, G.pp.y + 1.05, sz + dz * hitD);
  G.fx.fire(G.gun.muzzle, G.gun.eject, to, hit ? "enemy" : wallD < KINGPIN.range ? "wall" : "none");
  sfx("shot"); sfx("shell");
  G.stage.kick.add(V(-dx, -dz).multiplyScalar(FEEL.shotKick));
  makeNoise(G.pp, KINGPIN.noise, "shot");
  if (hit) { G.log.hits++; damage(hit, KINGPIN.damage, "pistol", V(dx, dz)); }
  else if (wallD < KINGPIN.range) { const w = wallAt(sx + dx * (wallD + 0.3), sz + dz * (wallD + 0.3)); if (w) hud.toast("Bullets won't break that. Try the briefcase!"); }
}
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
  const w = WALLS.find((q) => q.id === id)!; if (!w.breakable) return;
  const hp = (wallHp.get(id) ?? w.breakable.hp) - n; wallHp.set(id, hp);
  burst(at, 8, w.kind === "palisade" || w.kind === "hull" ? "#a8824f" : "#b9ab94", 0.8); sfx("hit");
  if (hp <= 0) {
    breakWall(id); breakWallVisual(id); sfx("crate"); sfx("thunk"); G.stage.trauma = Math.min(1, G.stage.trauma + 0.4);
    hud.banner(w.breakable.reveals); G.log.breaks.push(id); makeNoise(at, 10, "smash");
    if (w.breakable.persist && !G.save.fixtures.includes("open:" + id)) G.save.fixtures.push("open:" + id);
  } else floatText(["crack!", "CRACK!", "KRAK!"][Math.min(2, w.breakable.hp - hp - 1)] ?? "crack!", at, "#7a5a3c", 20);
}
export function resetWalls() { wallHp.clear(); }

export function damage(e: Enemy, n: number, by: "pistol" | "briefcase" | "slam" | "ram", dir: THREE.Vector3) {
  if (e.down) return;
  if (e.kind === "sleeper" && e.state !== "stunned") { // awake hits plink for zero (advisor 18)
    floatText("plink", e.p.clone().setY(3.4), "#8a8fa0", 18); sfx("hit", 0.4); if (e.state === "sleep") hearNoise(e, 3); return;
  }
  e.hp -= n; e.flash = FEEL.flash; floatText(String(n), e.p.clone().setY(e.rig.bounds.height + 0.2 + Math.random() * 0.4), by === "briefcase" ? "#ffd84a" : "#fff8ec", 18); sfx(by === "pistol" ? "hit" : "bonk"); hud.hitMarker(e.hp <= 0);
  if (e.kind !== "brute" && e.kind !== "sleeper") e.vel.addScaledVector(dir, by === "briefcase" ? BRIEFCASE.knock : 2.5);
  burst(e.p.clone().setY(1.2), by === "briefcase" ? 10 : 5, "#fff3b0", 0.7);
  if (by === "briefcase") floatText("BONK!", e.p.clone().setY(e.rig.bounds.height + 0.8), "#e8493a", 24);
  if (e.state === "sleep" || e.state === "patrol" || e.state === "return") alertEnemy(e, true);
  if (e.hp <= 0) knockOut(e, by);
}
export function knockOut(e: Enemy, by: string) {
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
