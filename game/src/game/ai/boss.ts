export type BossPoint = { x: number; z: number };
export const BOSS = {
  id: 'plantation-foreman', name: 'Foreman Knucklebark', hp: 450, bodyMitigation: 0.3,
  reaction: 0.3, sight: 22, hearing: 1.5, speedMultiplier: 1.15, escortHp: 75,
  leash: 30, throwRange: 18, swatRange: 2.7, slamRange: 4.2,
  throwDamage: 18, swatDamage: 24, slamDamage: 30,
  throwWindup: 0.7, swatWindup: 0.5, slamWindup: 1,
  throwRecovery: 1.5, swatRecovery: 1.25, slamRecovery: 2,
  specialCooldown: [6, 8] as const, progressionItem: 'plantation_seal',
} as const;
export type BossAttack = 'throw' | 'swat' | 'slam';
export type BossEvent = { type: 'phase' } | { type: 'attack'; attack: BossAttack; angles: readonly number[] };
export type BossBrain = {
  home: BossPoint; state: 'patrol' | 'notice' | 'chase' | 'windup' | 'recover' | 'return' | 'down';
  timer: number; cooldown: number; attack: BossAttack; phase: 1 | 2; spotted: boolean; alerted: boolean;
  specials: number; lockedYaw: number;
};
export type BossView = { hp: number; position: BossPoint; target: BossPoint; visible: boolean; onScreen: boolean; alive: boolean; escortsBusy?: boolean };
const distance = (left: BossPoint, right: BossPoint) => Math.hypot(left.x - right.x, left.z - right.z);
export function createBossBrain(home: BossPoint): BossBrain {
  return { home: { ...home }, state: 'patrol', timer: 0, cooldown: 0, attack: 'throw', phase: 1, spotted: false, alerted: false, specials: 0, lockedYaw: 0 };
}
export function isBoss(enemy: { tag?: string }): boolean { return enemy.tag === BOSS.id; }
export function bossDamage(enemy: { tag?: string }, damage: number, hit: 'head' | 'body' = 'body'): number {
  return isBoss(enemy) && hit !== 'head' ? damage * (1 - BOSS.bodyMitigation) : damage;
}
export function enemyHearingRange(enemy: { tag?: string }, radius: number): number { return radius * (isBoss(enemy) ? BOSS.hearing : 1); }
export function bossPockets(rng: () => number): string[] { return [BOSS.progressionItem, ...(rng() < 0.25 ? ['honey_pot'] : [])]; }
export function stepBoss(brain: BossBrain, view: BossView, dt: number): BossEvent[] {
  const events: BossEvent[] = [];
  if (!Number.isFinite(dt) || dt < 0) return events;
  if (view.hp <= 0) { brain.state = 'down'; return events; }
  if (view.hp <= BOSS.hp / 2 && brain.phase === 1) { brain.phase = 2; events.push({ type: 'phase' }); }
  if (view.visible && view.onScreen) brain.spotted = true;
  const targetDistance = distance(view.position, view.target);
  const outside = distance(view.target, brain.home) > BOSS.leash || distance(view.position, brain.home) > BOSS.leash;
  if (!view.alive || outside) { brain.state = 'return'; brain.timer = 0; brain.alerted = false; return events; }
  brain.timer = Math.max(0, brain.timer - dt);
  brain.cooldown = Math.max(0, brain.cooldown - dt);
  switch (brain.state) {
    case 'patrol':
      if ((view.visible && targetDistance <= BOSS.sight) || brain.alerted) { brain.state = 'notice'; brain.timer = BOSS.reaction; }
      break;
    case 'notice': if (brain.timer <= 0) brain.state = 'chase'; break;
    case 'return': if (distance(view.position, brain.home) < 1) { brain.state = 'patrol'; brain.cooldown = 2; } break;
    case 'chase': {
      if (!view.visible || !view.onScreen || view.escortsBusy) break;
      const special = brain.cooldown <= 0 && targetDistance <= BOSS.throwRange;
      if (!special && targetDistance > BOSS.swatRange) break;
      brain.attack = special ? (brain.specials % 2 === 1 && targetDistance < 7 ? 'slam' : 'throw') : 'swat';
      brain.state = 'windup';
      brain.timer = { throw: BOSS.throwWindup, swat: BOSS.swatWindup, slam: BOSS.slamWindup }[brain.attack];
      brain.lockedYaw = Math.atan2(view.target.x - view.position.x, view.target.z - view.position.z);
      break;
    }
    case 'windup':
      if (brain.timer <= 0) {
        if (view.onScreen && view.visible) events.push({ type: 'attack', attack: brain.attack, angles: brain.attack === 'throw' && brain.phase === 2 ? [0, 0.26] : [0] });
        if (brain.attack !== 'swat') { brain.specials++; brain.cooldown = BOSS.specialCooldown[0] + brain.specials % 3; }
        brain.state = 'recover';
        brain.timer = { throw: BOSS.throwRecovery, swat: BOSS.swatRecovery, slam: BOSS.slamRecovery }[brain.attack];
      }
      break;
    case 'recover': if (brain.timer <= 0) brain.state = 'chase'; break;
  }
  return events;
}
export function escortMayAttack(brain: BossBrain, index: number, time: number): boolean {
  if (brain.state === 'down') return Math.floor(time / 2.4) % 2 === index && time % 2.4 < 0.8;
  if (!['chase', 'recover'].includes(brain.state)) return false;
  return Math.floor(time / 2.4) % 2 === index && time % 2.4 < 1.4;
}
export function bossMarker(brain: BossBrain, position: BossPoint) {
  return { id: BOSS.id, label: BOSS.name, kind: brain.state === 'down' ? 'defeated' : brain.spotted ? 'boss' : 'danger-area',
    x: brain.spotted ? position.x : brain.home.x, z: brain.spotted ? position.z : brain.home.z,
    radius: brain.spotted ? 0 : BOSS.leash, spotted: brain.spotted };
}
