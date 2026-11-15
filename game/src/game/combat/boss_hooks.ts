// TEMPORARY local stand-in for the systems worker's src/game/ai/boss.ts (Sol, G1.5 row 26), so combat compiles and
// runs before that commit lands. Same signatures and the numbers Sol gave: the plantation foreman (a brute, tag
// "plantation-foreman", 450 HP, no helmet) takes 0.7x on body hits and full damage on head hits, and hears noise 1.5x
// farther. LEAD, ON MERGE: replace this whole file with
//   export { bossDamage, enemyHearingRange } from "../ai/boss";
// (or point combat.ts's import at ../ai/boss and delete this file).
const BOSS = "plantation-foreman";
export function bossDamage(enemy: { tag?: string }, damage: number, hit: "head" | "body" = "body"): number {
  return enemy.tag === BOSS ? damage * (hit === "head" ? 1 : 0.7) : damage;
}
export function enemyHearingRange(enemy: { tag?: string }, radius: number): number {
  return enemy.tag === BOSS ? radius * 1.5 : radius;
}
