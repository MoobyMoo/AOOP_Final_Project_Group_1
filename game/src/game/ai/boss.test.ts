import { BOSS, bossPockets, createBossBrain, stepBoss, bossDamage, bossMarker, escortMayAttack, enemyHearingRange } from './boss';

let checks = 0;
function check(value: unknown, message: string) {
  checks++;
  if (!value) throw new Error(message);
}
const brain = createBossBrain({ x: 0, z: 0 });
const view = { hp: 450, position: { x: 0, z: 0 }, target: { x: 0, z: 10 }, visible: true, onScreen: true, alive: true };
check(BOSS.hp === 450 && bossDamage({ tag: BOSS.id }, 100, 'body') === 70 && bossDamage({ tag: BOSS.id }, 100, 'head') === 100, 'body armor exposes head');
check(bossDamage({}, 100, 'body') === 100, 'ordinary enemy unchanged');
check(enemyHearingRange({ tag: BOSS.id }, 14) === 21 && enemyHearingRange({}, 14) === 14, 'hearing scales the emitted sound radius');
check(bossPockets(() => 0.9).join() === BOSS.progressionItem && bossPockets(() => 0).length === 2, 'progression reward plus separate modest bonus');
check(bossMarker(brain, view.position).kind === 'danger-area', 'static marker before spotting');
stepBoss(brain, view, 0.01);
check(brain.state === 'notice', 'reaction starts on sight');
stepBoss(brain, view, 0.29);
check(brain.state === 'notice', 'reaction not skipped');
stepBoss(brain, view, 0.02);
stepBoss(brain, view, 0.01);
check(brain.state === 'windup' && brain.attack === 'throw', 'first throw winds up');
check(bossMarker(brain, { x: 2, z: 3 }).x === 2, 'spotted marker moves');
check(stepBoss(brain, view, 0.69).length === 0, 'no early throw');
check(stepBoss(brain, view, 0.02).some(event => event.type === 'attack' && event.attack === 'throw'), 'throw after windup');
check(brain.state === 'recover', 'clear recovery');
const phaseEvents = stepBoss(brain, { ...view, hp: 225 }, 0.01);
check(phaseEvents.some(event => event.type === 'phase'), 'phase cue at 50 percent');
check(!stepBoss(brain, { ...view, hp: 200 }, 0.01).some(event => event.type === 'phase'), 'phase cue exactly once');
stepBoss(brain, { ...view, target: { x: 0, z: 40 } }, 0.01);
check(brain.state === 'return', 'retreat cancels attacks beyond leash');
check(!escortMayAttack(brain, 0, 1) && !escortMayAttack(brain, 1, 1), 'escorts do not pursue retreat');
const owners = new Set<number>();
brain.state = 'chase';
for (let tick = 0; tick < 100; tick++) {
  const time = tick / 10;
  const permits = [0, 1].filter(index => escortMayAttack(brain, index, time));
  check(permits.length <= 1, 'escort firing slots never overlap');
  permits.forEach(owner => owners.add(owner));
}
check(owners.size === 2, 'both escorts get attack windows');
stepBoss(brain, { ...view, hp: 0 }, 0.01);
check(bossMarker(brain, view.position).kind === 'defeated', 'dead boss marker retires');
const close = createBossBrain({ x: 0, z: 0 });
const closeView = { ...view, hp: 200, target: { x: 0, z: 1 } };
const counts = { throw: 0, swat: 0, slam: 0 };
let phaseCues = 0;
for (let tick = 0; tick < 3000; tick++) {
  const before = close.state, attack = close.attack;
  for (const event of stepBoss(close, closeView, 0.01)) {
    if (event.type === 'phase') phaseCues++;
    else {
      counts[event.attack]++;
      check(close.state === 'recover' && close.timer >= 1.25, 'every attack has a recovery window');
      if (event.attack === 'throw') check(event.angles.length === 2, 'phase two adds a second throw angle');
      if (event.attack !== 'swat') check(close.cooldown >= 6 && close.cooldown <= 8, 'special cooldown is bounded');
    }
  }
  if (before === 'windup' && close.state === 'windup') check(close.attack === attack, 'attack identity is locked during warning');
  if (close.state === 'windup') check(!escortMayAttack(close, 0, tick / 100) && !escortMayAttack(close, 1, tick / 100), 'both escorts pause during boss warning');
}
check(Object.values(counts).every(count => count > 0) && phaseCues === 1, 'all three attacks execute and phase cue never repeats');
console.log(`Boss: ${checks} checks passed`);
