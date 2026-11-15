import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import { buildEntry, captureBuild } from './botbuild.mjs';

const outputDir = process.env.BOT_OUT ?? "/tmp/bv-systems-bot";
const buildDir = process.env.BOT_DIST ?? "/tmp/bv-systems-dist";

function settlementLedger(record) {
  const identity = inst => inst.split('@')[1];
  const before = record.before.map(identity), after = record.after.map(identity);
  const consumed = record.consumed.map(identity), abandoned = record.abandoned.map(identity);
  const accounted = [...after, ...consumed, ...abandoned];
  const missing = before.filter(id => !accounted.includes(id));
  const unexpected = accounted.filter(id => !before.includes(id));
  const duplicates = accounted.filter((id, index) => accounted.indexOf(id) !== index);
  assert.ok([...before, ...accounted].every(Boolean), `identified items ${record.id}`);
  assert.equal(new Set(before).size, before.length, `unique origin items ${record.id}`);
  // rounds are per caliber since the arsenal ({ ammo45, ammo_rifle, ... }); an old record holds plain numbers
  const r = record.rounds, cals = typeof r.before === 'number' ? [null] : Object.keys(r.before), at = (v, c) => c === null ? v : v[c] ?? 0;
  for (const c of cals) assert.equal(at(r.before, c), at(r.after, c) + at(r.spent, c) + at(r.abandoned, c), `ammunition ledger ${record.id}${c ? ' ' + c : ''}`);
  assert.deepEqual({ missing, unexpected, duplicates }, { missing: [], unexpected: [], duplicates: [] }, `item-id ledger ${record.id}`);
  return { raidId: record.id, reason: record.reason, before, after, consumed, abandoned, missing, unexpected, duplicates, rounds: record.rounds };
}

async function selfTest() {
  const record = { id: 'test', reason: 'hatch', before: ['banana@one', 'bandage@two'], after: ['banana@one'], consumed: ['bandage@two'], abandoned: [], rounds: { before: 12, after: 7, spent: 5, abandoned: 0 } };
  assert.deepEqual(settlementLedger(record).missing, []);
  assert.throws(() => settlementLedger({ ...record, after: [] }));
  assert.throws(() => settlementLedger({ ...record, after: ['banana@one', 'banana@one'] }));
  assert.throws(() => settlementLedger({ ...record, rounds: { ...record.rounds, spent: 4 } }));
  console.log('PASS reject missing, duplicated and unbalanced settlement ledgers');
  assert.equal(buildEntry('<script type="module" src="/assets/game-current.js"></script>'), 'game-current.js');
  assert.throws(() => buildEntry('<script src="/assets/game-stale.js"></script>'));
  assert.throws(() => buildEntry('<script type="module" src="/assets/../game.js"></script>'));
  console.log('PASS identify the entry from HTML rather than stale asset files');
  const { rolldown } = await import("rolldown");
  const bundle = await rolldown({ input: "src/game/core/bot.ts" });
  const { output } = await bundle.generate({ format: "esm" });
  await bundle.close();
  const { createBot } = await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString("base64")}`);
  const weaponBundle = await rolldown({ input: "src/game/combat/weapons.ts" });
  const weaponOutput = await weaponBundle.generate({ format: "esm" });
  await weaponBundle.close();
  const { aimRang } = await import(`data:text/javascript;base64,${Buffer.from(weaponOutput.output[0].code).toString("base64")}`);
  const observation = () => ({
    t: 0, scene: "raid", raidT: 0, raids: 0, money: 0,
    player: { x: 0, z: 0, hearts: 3, maxHearts: 3, hp: 100, maxHp: 100, ammo: 8, mag: 8, packFree: 8, packValue: 0, rolling: false, reloading: false },
    crates: [{ id: 1, x: 1.5, z: 0, tier: "wood", opened: false }],
    enemies: [], pickups: [], exits: [{ id: "hatch", x: -10, z: 0, armed: true }], stations: [],
    walkable: (x, z) => Math.hypot(x - 1.5, z) > 1,
    path: () => [{ x: 0, z: 0 }], los: () => true,
    upgrades: { mag: 0, pack: 0, heart: 0 }, combatEvents: [],
  });
  const tests = [
    ['draw the other gun when the one in hand is dry (two gun slots)', () => {
      const bot = createBot({ greed: 0.5, reactionLag: 0, seed: 1 });
      const view = observation(); view.player.mag = 0; view.player.ammo = 0;
      view.player.gun = { slot: 0, interval: 0.08, range: 26.5, drawing: false, other: { slot: 1, rounds: 20 } };
      assert.equal(bot.tick(view, 0.3).swap, 2);
      const full = observation(); full.player.gun = { slot: 0, interval: 0.08, range: 26.5, drawing: false, other: { slot: 1, rounds: 20 } };
      assert.equal(bot.tick(full, 0.3).swap, undefined);
    }],
    ['repair a pinched corridor requiring an eighth-cell lateral step', () => {
      const bot = createBot({ greed: 0.5, reactionLag: 0, seed: 1 });
      const view = observation(); view.player.x = 0.3; view.player.z = 0.275;
      view.walkable = (x, z) => x >= 3 || x >= 0 && x <= 1.3 && Math.abs(z - 0.275) < 0.01 || x >= 1 && Math.abs(z - 0.15) < 0.01;
      view.path = (fromX, fromZ, toX, toZ) => fromX >= 3 ? [{ x: toX, z: toZ }] : [];
      view.crates = [{ id: 1, x: 10, z: 0.5, tier: 'wood', opened: false }];
      assert.ok(bot.tick(view, 0.3).move[0] > 0);
    }],
    ['preserve the exact origin through a sub-grid clearance corridor', () => {
      const bot = createBot({ greed: 0.5, reactionLag: 0, seed: 1 });
      const view = observation(); view.player.x = 0.3; view.player.z = 0.275;
      view.walkable = (x, z) => x >= 3 || x >= 0 && Math.abs(z - 0.275) < 0.01;
      view.path = (fromX, fromZ, toX, toZ) => fromX >= 3 ? [{ x: toX, z: toZ }] : [];
      view.crates = [{ id: 1, x: 10, z: 0.5, tier: 'wood', opened: false }];
      assert.ok(bot.tick(view, 0.3).move[0] > 0);
    }],
    ['bridge a physically open corridor out of a closed coarse navigation cell', () => {
      const bot = createBot({ greed: 0.5, reactionLag: 0, seed: 1 });
      const view = observation(); view.player.x = 0.25; view.player.z = 0.25;
      view.walkable = (x, z) => x >= 3 || x >= 0 && Math.abs(z - 0.25) < 0.12;
      view.path = (fromX, fromZ, toX, toZ) => fromX >= 3 ? [{ x: toX, z: toZ }] : [];
      view.crates = [{ id: 1, x: 10, z: 0.5, tier: 'wood', opened: false }];
      assert.ok(bot.tick(view, 0.3).move[0] > 0);
    }],
    ['avoid a boss hearing a loud Kingpin outside its sight radius', () => {
      const bot = createBot({ greed: 0.3, reactionLag: 0, seed: 1 });
      const view = observation(); view.walkable = () => true;
      view.path = (fromX, fromZ, toX, toZ) => [{ x: toX, z: toZ }];
      view.enemies = [{ id: 99, x: 32, z: 0, hp: 450, kind: 'brute', state: 'patrol', boss: true }];
      view.crates = [{ id: 1, x: 4, z: 0, tier: 'wood', opened: false }, { id: 2, x: -10, z: 0, tier: 'wood', opened: false }];
      assert.ok(bot.tick(view, 0.3).move[0] < 0);
      view.player.shotNoise = 5;
      assert.ok(createBot({ greed: 0.3, reactionLag: 0, seed: 1 }).tick(view, 0.3).move[0] > 0, 'a suppressor uses the sight-limited buffer rather than the unsuppressed noise radius');
    }],
    ['repair a route through a radius-safe quarter-cell corridor', () => {
      const bot = createBot({ greed: 0.5, reactionLag: 0, seed: 1 });
      const view = observation(); view.player.x = 0.25;
      view.walkable = x => Math.abs(x - 0.25) < 0.1;
      view.path = () => [{ x: 0.5, z: 5 }, { x: 0.5, z: 10 }];
      view.crates = [{ id: 1, x: 0.25, z: 10, tier: 'wood', opened: false }];
      assert.ok(bot.tick(view, 0.3).move[1] > 0);
    }],
    ['retain loot-screen timing when an outcome arrives before the scene transition', () => {
      const bot = createBot({ greed: 0.5, reactionLag: 0, seed: 1 });
      const view = observation();
      view.lootTiming = { searchSeconds: 12, itemsTaken: 5, opens: 3 };
      bot.tick(view, 0.3);
      view.outcome = { type: 'bonk-out', raidT: 20 };
      bot.tick(view, 0.3);
      const timing = bot.events.find(event => event.type === 'loot-timing');
      assert.equal(timing.searchSeconds, 12); assert.equal(timing.itemsTaken, 5); assert.equal(timing.opens, 3);
    }],
    ['keep fighting at melee range after an unprepared forced engagement', () => {
      const bot = createBot({ greed: 0.8, reactionLag: 0, seed: 1 });
      const view = observation(); view.demo = true; view.walkable = () => true;
      view.path = (fromX, fromZ, toX, toZ) => [{ x: toX, z: toZ }];
      view.enemies = [{ id: 99, x: 5, z: 0, hp: 450, kind: 'brute', state: 'chase', boss: true }];
      bot.tick(view, 0.3);
      view.player.ammo = 0; view.player.mag = 0;
      assert.ok(bot.tick(view, 0.3).move[0] > 0);
    }],
    ['retreat from an engaged boss even without supplies or the demo tour', () => {
      const bot = createBot({ greed: 0.8, reactionLag: 0, seed: 1 });
      const view = observation(); view.demo = true; view.walkable = () => true;
      view.path = (fromX, fromZ, toX, toZ) => [{ x: toX, z: toZ }];
      view.enemies = [{ id: 99, x: 2.5, z: 0, hp: 450, kind: 'brute', state: 'chase', boss: true }];
      bot.tick(view, 0.3);
      view.enemies[0].windup = true; view.enemies[0].state = 'windup';
      const input = bot.tick(view, 0.3);
      assert.equal(input.roll, true);
      assert.ok(input.move[0] < 0);
    }],
    ['start the return before the demo expedition exceeds its travel budget', () => {
      const bot = createBot({ greed: 0.8, reactionLag: 0, seed: 1 });
      const view = observation(); view.demo = true; view.raidT = 215; view.walkable = () => true;
      view.path = (fromX, fromZ, toX, toZ) => [{ x: toX, z: toZ }];
      view.crates[0].x = 10;
      assert.ok(bot.tick(view, 0.3).move[0] < 0);
    }],
    ['permit the toured boss detour only at every preparation threshold', () => {
      for (const deficit of ['none', 'ammo', 'heals', 'health', 'tour']) {
        const bot = createBot({ greed: 0.8, reactionLag: 0, seed: 1 });
        const view = observation(); view.demo = true;
        view.player.ammo = deficit === 'ammo' ? 55 : 56;
        view.player.healing = deficit === 'heals' ? 59 : 60;
        view.player.hp = deficit === 'health' ? 79 : 80;
        view.walkable = () => true;
        view.path = (fromX, fromZ, toX, toZ) => [{ x: toX, z: toZ }];
        view.enemies = [{ id: 99, x: 30, z: 0, hp: 450, kind: 'brute', state: 'patrol', boss: true }];
        view.crates = Array.from({ length: 10 }, (_, index) => ({ id: index, x: -10, z: 0, tier: 'wood', opened: true, area: deficit === 'tour' ? 'beach' : ['beach', 'camp', 'checkpoint'][index % 3] }));
        view.crates.push({ id: 11, x: -10, z: 0, tier: 'wood', opened: false, area: 'camp', type: 'medical' });
        const input = bot.tick(view, 0.3);
        assert.equal(bot.events.some(event => event.type === 'boss-detour'), deficit === 'none', deficit);
        assert.equal(input.move[0] > 0, deficit === 'none', deficit);
      }
    }],
    ['bound container routing work by the best reachable path rather than population size', () => {
      const bot = createBot({ greed: 0.5, reactionLag: 0, seed: 1 });
      const view = observation(); let paths = 0;
      view.walkable = () => true; view.path = (fx, fz, tx, tz) => { paths++; return [{ x: tx, z: tz }]; };
      view.crates = Array.from({ length: 46 }, (_, id) => ({ id, x: 10 + id * 10, z: 0, tier: 'wood', opened: false }));
      assert.ok(bot.tick(view, 0.3).move[0] > 0);
      assert.ok(paths <= 2, `only the nearest viable goal and its walking route need pathfinding: ${paths}`);
    }],
    ['advance a melee approach beyond the coarse origin instead of orbiting it', () => {
      const bot = createBot({ greed: 0.8, reactionLag: 0, seed: 1 });
      const view = observation(); view.player.x = 0.2; view.player.ammo = 0; view.player.mag = 0;
      view.enemies = [{ id: 88, x: 8, z: 0, hp: 75, kind: 'bandit', state: 'chase', awake: true }];
      view.walkable = (x, z) => !(x >= 2 && x <= 6 && z < 2.5);
      view.path = () => [{ x: 0.5, z: 0 }, { x: 0.5, z: 3 }, { x: 8, z: 3 }, { x: 8, z: 0 }];
      assert.ok(bot.tick(view, 0.3).move[1] > 0.9);
    }],
    ['commit a prepared campaign to a distant boss after touring', () => {
      const bot = createBot({ greed: 0.8, reactionLag: 0, seed: 1 });
      const view = observation(); view.demo = true; view.bossRoute = 'prepared'; view.raidT = 170;
      view.player.ammo = 100; view.player.healing = 80;
      view.walkable = () => true; view.path = (fx, fz, tx, tz) => [{ x: tx, z: tz }];
      view.crates = Array.from({ length: 14 }, (_, id) => ({ id, x: -10, z: 0, tier: 'wood', opened: true, area: ['beach', 'camp', 'checkpoint'][id % 3] }));
      view.enemies = [{ id: 99, x: 50, z: 0, hp: 450, kind: 'brute', state: 'patrol', boss: true }];
      assert.ok(bot.tick(view, 0.3).move[0] > 0);
      assert.equal(bot.events.find(event => event.type === 'boss-detour')?.profile, 'prepared');
    }],
    ['only the explicit unprepared stress profile commits to boss melee range', () => {
      for (const profile of ['prepared', 'unprepared', undefined]) {
        const bot = createBot({ greed: 0.8, reactionLag: 0, seed: 1 });
        const view = observation(); view.bossRoute = profile;
        view.player.ammo = 100; view.player.healing = profile === 'prepared' ? 80 : 0;
        view.walkable = () => true; view.path = (fx, fz, tx, tz) => [{ x: tx, z: tz }];
        view.enemies = [{ id: 99, x: 8, z: 0, hp: 450, kind: 'brute', state: 'recover', boss: true }];
        const input = bot.tick(view, 0.3);
        assert.equal(!!input.fire, profile !== 'unprepared');
        assert.equal(input.move[0] > 0, profile === 'unprepared');
      }
    }],
    ['explicit unprepared campaign tours before accepting the boss risk', () => {
      const bot = createBot({ greed: 0.8, reactionLag: 0, seed: 1 });
      const view = observation(); view.demo = true; view.bossRoute = 'unprepared'; view.player.healing = 0;
      view.walkable = () => true; view.path = (fx, fz, tx, tz) => [{ x: tx, z: tz }];
      view.crates = Array.from({ length: 10 }, (_, id) => ({ id, x: -10, z: 0, tier: 'wood', opened: true, area: ['beach', 'camp', 'checkpoint'][id % 3] }));
      view.enemies = [{ id: 99, x: 30, z: 0, hp: 450, kind: 'brute', state: 'patrol', boss: true }];
      assert.ok(bot.tick(view, 0.3).move[0] > 0);
      assert.equal(bot.events.find(event => event.type === 'boss-detour')?.prepared, false);
    }],
    ['stop the boss tour at its configured area count instead of visiting every area', () => {
      const bot = createBot({ greed: 0.8, reactionLag: 0, seed: 1 });
      const view = observation(); view.demo = true; view.bossRoute = 'prepared'; view.player.ammo = 100; view.player.healing = 80;
      view.walkable = () => true; view.path = (fx, fz, tx, tz) => [{ x: tx, z: tz }];
      view.crates = Array.from({ length: 3 }, (_, id) => ({ id, x: -10, z: 0, tier: 'wood', opened: true, area: ['beach', 'camp', 'checkpoint'][id] }));
      view.crates.push({ id: 4, x: -4, z: 0, tier: 'wood', opened: false, area: 'camp' }, { id: 5, x: 30, z: 0, tier: 'wood', opened: false, area: 'grotto' });
      assert.ok(bot.tick(view, 0.3).move[0] < 0);
    }],
    ['a supplied boss route commits after eight containers across three areas', () => {
      const bot = createBot({ greed: 0.8, reactionLag: 0, seed: 1 });
      const view = observation(); view.demo = true; view.bossRoute = 'prepared'; view.player.ammo = 100; view.player.healing = 80;
      view.walkable = () => true; view.path = (fx, fz, tx, tz) => [{ x: tx, z: tz }];
      view.crates = Array.from({ length: 8 }, (_, id) => ({ id, x: -10, z: 0, tier: 'wood', opened: true, area: ['beach', 'camp', 'checkpoint'][id % 3] }));
      view.crates.push({ id: 8, x: -4, z: 0, tier: 'wood', opened: false, area: 'camp' });
      view.enemies = [{ id: 9, x: 30, z: 0, hp: 450, kind: 'brute', state: 'patrol', boss: true }];
      assert.ok(bot.tick(view, 0.3).move[0] > 0);
    }],
    ['an unsupplied boss route keeps seeking medicine within its expedition budget', () => {
      const bot = createBot({ greed: 0.8, reactionLag: 0, seed: 1 });
      const view = observation(); view.demo = true; view.bossRoute = 'prepared'; view.raidT = 190; view.player.ammo = 100; view.player.healing = 0;
      view.walkable = () => true; view.path = (fx, fz, tx, tz) => [{ x: tx, z: tz }];
      view.crates = [{ id: 6, x: 10, z: 0, tier: 'wood', opened: false, area: 'camp', type: 'medical' }];
      view.enemies = [{ id: 9, x: 100, z: 0, hp: 450, kind: 'brute', state: 'patrol', boss: true }];
      assert.ok(bot.tick(view, 0.3).move[0] > 0);
    }],
    ['prepared routes shoot the ranged escort before the closer boss', () => {
      const bot = createBot({ greed: 0.8, reactionLag: 0, seed: 1 });
      const view = observation(); view.bossRoute = 'prepared'; view.player.ammo = 100; view.player.healing = 80;
      view.enemies = [{ id: 9, x: 12, z: 0, hp: 450, kind: 'brute', state: 'recover', boss: true }, { id: 10, x: 0, z: 14, hp: 75, kind: 'wild', state: 'throwing', escort: true }];
      const input = bot.tick(view, 0.3);
      assert.ok(input.fire); assert.deepEqual(input.aim, [0, 14]);
    }],
    ['a prepared boss route remains committed after fighting an escort spends healing', () => {
      const bot = createBot({ greed: 0.8, reactionLag: 0, seed: 1 });
      const view = observation(); view.bossRoute = 'prepared'; view.player.ammo = 100; view.player.healing = 80;
      view.walkable = () => true; view.path = (fx, fz, tx, tz) => [{ x: tx, z: tz }];
      view.enemies = [{ id: 9, x: 30, z: 0, hp: 450, kind: 'brute', state: 'patrol', boss: true }];
      bot.tick(view, 0.3);
      view.enemies.push({ id: 10, x: 0, z: 14, hp: 75, kind: 'wild', state: 'throwing', escort: true });
      const attack = bot.tick(view, 0.3);
      assert.ok(attack.fire); assert.equal(bot.events.find(event => event.type === 'boss-engaged')?.enemyId, 9);
      view.player.healing = 40; view.player.hp = 90;
      view.enemies = [view.enemies[0]];
      view.bodies = [{ id: 11, x: -4, z: 0 }];
      assert.ok(bot.tick(view, 0.3).move[0] > 0);
    }],
    ['prepared routes dodge a distant boss throw sideways after reaction lag', () => {
      const bot = createBot({ greed: 0.8, reactionLag: 0.25, seed: 1 });
      const view = observation(); view.bossRoute = 'prepared'; view.player.ammo = 100; view.player.healing = 80; view.player.stamina = 100;
      view.walkable = () => true;
      view.enemies = [{ id: 9, x: 12, z: 0, hp: 450, kind: 'brute', state: 'windup', boss: true, windup: true }];
      bot.tick(view, 0.3); view.t = 0.6;
      const input = bot.tick(view, 0.3);
      assert.ok(input.roll); assert.ok(Math.abs(input.move[1]) > Math.abs(input.move[0]));
    }],
    ['prepared routes answer ranged population threats before starting a non-emergency heal', () => {
      const bot = createBot({ greed: 0.8, reactionLag: 0, seed: 1 });
      const view = observation(); view.bossRoute = 'prepared'; view.player.hp = 70; view.player.healing = 80; view.player.smoothies = 2;
      view.enemies = [{ id: 10, x: 13, z: 0, hp: 48, kind: 'wild', state: 'throwing', awake: true }];
      const input = bot.tick(view, 0.3);
      assert.ok(input.fire); assert.notEqual(input.heal, true);
    }],
    ['prepared routes keep moving sideways while a timed heal is in progress', () => {
      const bot = createBot({ greed: 0.8, reactionLag: 0, seed: 1 });
      const view = observation(); view.bossRoute = 'prepared'; view.player.usingItem = true; view.player.hp = 30;
      view.walkable = () => true;
      view.enemies = [{ id: 10, x: 13, z: 0, hp: 48, kind: 'wild', state: 'throwing', awake: true }];
      const input = bot.tick(view, 0.3);
      assert.ok(Math.abs(input.move[1]) > 0); assert.notEqual(input.roll, true);
    }],
    ['tour new slice areas before a nearby prepared boss', () => {
      const bot = createBot({ greed: 0.8, reactionLag: 0, seed: 1 });
      const view = observation(); view.demo = true; view.player.ammo = 80; view.player.healing = 80;
      view.walkable = () => true; view.path = (fromX, fromZ, toX, toZ) => [{ x: toX, z: toZ }];
      view.enemies = [{ id: 9, x: 30, z: 0, hp: 450, kind: 'brute', state: 'patrol', boss: true }];
      view.crates = [{ id: 2, x: -10, z: 0, tier: 'wood', opened: false, area: 'camp', type: 'parts' }];
      assert.ok(bot.tick(view, 0.3).move[0] < 0);
    }],
    ['never approach an unprepared boss merely because ammunition was collected', () => {
      const bot = createBot({ greed: 0.8, reactionLag: 0, seed: 1 });
      const view = observation(); view.walkable = () => true; view.player.healing = 0;
      view.path = (fromX, fromZ, toX, toZ) => [{ x: toX, z: toZ }];
      bot.tick(view, 0.3); view.player.ammo = 80;
      view.enemies = [{ id: 9, x: 30, z: 0, hp: 450, kind: 'brute', state: 'patrol', boss: true }];
      view.crates = [{ id: 2, x: -10, z: 0, tier: 'wood', opened: false, type: 'medical' }];
      assert.ok(bot.tick(view, 0.3).move[0] < 0);
    }],
    ['keep exploring the compact slice after the former six-container quota', () => {
      const bot = createBot({ greed: 0.3, reactionLag: 0, seed: 1 });
      const view = observation(); view.demo = true; view.walkable = () => true;
      view.path = (fromX, fromZ, toX, toZ) => [{ x: toX, z: toZ }];
      view.crates = Array.from({ length: 7 }, (_, index) => ({ id: index, x: 10, z: 0, tier: 'wood', opened: index < 6 }));
      assert.ok(bot.tick(view, 0.3).move[0] > 0);
    }],
    ['reload manually while moving to loot, then resume fire after completion', () => {
      const bot = createBot({ greed: 0.5, reactionLag: 0, seed: 1 });
      const view = observation(); view.player.mag = 0; view.walkable = () => true;
      view.path = (fromX, fromZ, toX, toZ) => [{ x: toX, z: toZ }];
      view.crates[0].x = 8;
      assert.equal(bot.tick(view, 0.3).reload, true);
      view.player.reloading = true;
      assert.notEqual(bot.tick(view, 0.3).reload, true);
      view.player.reloading = false; view.player.mag = 8; view.player.ammo = 0;
      view.enemies = [{ id: 1, x: 8, z: 0, hp: 24, kind: 'wild', state: 'recover', awake: true, windup: false }];
      assert.equal(bot.tick(view, 0.3).fire, true);
    }],
    ['top up a partial magazine between encounters under manual reload rules', () => {
      const bot = createBot({ greed: 0.5, reactionLag: 0, seed: 1 });
      const view = observation(); view.player.mag = 2;
      assert.equal(bot.tick(view, 0.3).reload, true);
      view.player.ammo = 0;
      assert.notEqual(bot.tick(view, 0.3).reload, true);
    }],
    ['reload an empty magazine even during a threat reaction window', () => {
      const bot = createBot({ greed: 0.5, reactionLag: 0.25, seed: 1 });
      const view = observation(); view.player.mag = 0;
      view.enemies = [{ id: 1, x: 6, z: 0, hp: 24, kind: 'wild', state: 'recover', awake: true, windup: false }];
      const input = bot.tick(view, 1 / 60);
      assert.equal(input.reload, true);
      assert.notEqual(input.fire, true);
      view.player.reloading = true;
      assert.notEqual(bot.tick(view, 0.3).reload, true);
      assert.notEqual(bot.tick(view, 0.3).fire, true);
    }],
    ['close a clear short gap to bonk an ordinary bandit and conserve rounds', () => {
      const bot = createBot({ greed: 0.5, reactionLag: 0, seed: 1 });
      const view = observation(); view.walkable = () => true;
      view.path = (fromX, fromZ, toX, toZ) => [{ x: toX, z: toZ }];
      view.enemies = [{ id: 1, x: 3, z: 0, hp: 48, kind: 'bandit', state: 'chase', awake: true, windup: false }];
      const input = bot.tick(view, 0.3);
      assert.ok(input.move[0] > 0);
      assert.notEqual(input.fire, true);
    }],
    ['punish an ordinary rooted thrower with melee without changing escort tactics', () => {
      const bot = createBot({ greed: 0.5, reactionLag: 0, seed: 1 });
      const view = observation(); view.walkable = () => true;
      view.path = (fromX, fromZ, toX, toZ) => [{ x: toX, z: toZ }];
      view.enemies = [{ id: 1, x: 7, z: 0, hp: 24, kind: 'wild', state: 'rooted', awake: true, windup: false }];
      assert.ok(bot.tick(view, 0.3).move[0] > 0);
      view.enemies[0].escort = true;
      assert.equal(bot.tick(view, 0.3).fire, true);
    }],
    ['search a fresh nearby body before continuing a distant container route', () => {
      const bot = createBot({ greed: 0.5, reactionLag: 0, seed: 1 });
      const view = observation(); view.walkable = () => true;
      view.path = (fromX, fromZ, toX, toZ) => [{ x: toX, z: toZ }];
      view.crates[0].x = 12;
      assert.ok(bot.tick(view, 0.3).move[0] > 0);
      view.bodies = [{ id: 2, x: -1, z: 0 }];
      assert.equal(bot.tick(view, 0.3).interact, true);
    }],
    ['collect opened ammo before voluntarily chasing the boss', () => {
      const bot = createBot({ greed: 0.8, reactionLag: 0, seed: 1 });
      const view = observation(); view.walkable = () => true;
      view.path = (fromX, fromZ, toX, toZ) => [{ x: toX, z: toZ }];
      view.crates = []; view.pickups = [{ id: 2, item: 'ammo45', x: 1.2, z: 0 }];
      view.enemies = [{ id: 1, x: 0, z: 30, hp: 450, kind: 'brute', boss: true, state: 'patrol', awake: true, windup: false }];
      const input = bot.tick(view, 0.3);
      assert.ok(input.move[0] > 0);
      assert.equal(input.move[1], 0);
    }],
    ['visit a safe ammo stop before the greedy boss detour', () => {
      const bot = createBot({ greed: 0.8, reactionLag: 0, seed: 1 });
      const view = observation(); view.walkable = () => true;
      view.path = (fromX, fromZ, toX, toZ) => [{ x: toX, z: toZ }];
      view.crates = [{ id: 1, x: 0, z: 20, type: 'ammo', tier: 'wood', opened: false }, { id: 2, x: -20, z: 0, type: 'ammo', tier: 'wood', opened: false }];
      view.enemies = [{ id: 1, x: 0, z: 30, hp: 450, kind: 'brute', boss: true, state: 'patrol', awake: true, windup: false }];
      assert.ok(bot.tick(view, 0.3).move[0] < 0);
      view.player.ammo = 80; view.player.healing = 80; view.crates = [];
      assert.ok(bot.tick(view, 0.3).move[1] > 0);
    }],
    ['never mistake a manual reload for new ammunition', () => {
      const bot = createBot({ greed: 0.8, reactionLag: 0, seed: 1 });
      const view = observation(); view.walkable = () => true;
      view.path = (fromX, fromZ, toX, toZ) => [{ x: toX, z: toZ }];
      view.player.mag = 0; view.player.ammo = 24;
      view.crates = [{ id: 2, x: -20, z: 0, type: 'ammo', tier: 'wood', opened: false }];
      view.enemies = [{ id: 1, x: 0, z: 30, hp: 450, kind: 'brute', boss: true, state: 'patrol', awake: true, windup: false }];
      bot.tick(view, 0.3);
      view.player.mag = 8; view.player.ammo = 16;
      assert.ok(bot.tick(view, 0.3).move[0] < 0);
      assert.ok(!bot.events.some(event => event.type === 'ammo-collected'));
    }],
    ['shoot a bandit outside melee reach rather than path-locking at a fence', () => {
      const bot = createBot({ greed: 0.5, reactionLag: 0.25, seed: 1 });
      const view = observation(); view.walkable = x => x < 1 || x > 2;
      view.enemies = [{ id: 1, x: 2.5, z: 0, hp: 48, kind: 'bandit', state: 'chase', awake: true, windup: false }];
      bot.tick(view, 0.3);
      assert.equal(bot.tick(view, 0.3).fire, true);
    }],
    ["open a reachable door when extraction starts inside a closed room", () => {
      const bot = createBot({ greed: 0.8, reactionLag: 0.25, seed: 1 });
      const view = observation(); view.crates = []; view.walkable = () => true; view.raidT = 421;
      view.exits = [{ id: "raft", x: 20, z: 0, open: true }];
      view.gates = [{ id: "room", x: 1.5, z: 0, nx: 1, nz: 0, open: false, breakable: false, usable: true }];
      view.path = (fromX, fromZ, toX, toZ) => toX < 2 ? [{ x: toX, z: toZ }] : [];
      bot.tick(view, 1 / 60);
      assert.equal(bot.tick(view, 1 / 60).interact, true);
    }],
    ["compensate the boomerang curve at the intended intercept", () => {
      for (const target of [{ x: 6, z: 0 }, { x: -3, z: 4 }, { x: 0, z: -2 }]) {
        const out = Math.hypot(target.x, target.z) + 1.5;
        const aim = aimRang(target.x, target.z, out);
        const lateral = Math.sin(aim.travel / out * Math.PI) * 1.6;
        assert.ok(Math.hypot(aim.x * aim.travel - aim.z * lateral - target.x, aim.z * aim.travel + aim.x * lateral - target.z) < 0.01);
      }
    }],
    ["finish an in-range rubble attack without a movement timeout", () => {
      const bot = createBot({ greed: 0.8, reactionLag: 0.25, seed: 1 });
      const view = observation(); view.raidId = 2; view.crates = []; view.walkable = () => true;
      view.exits.push({ id: "tunnel", x: 20, z: 0, open: false });
      view.gates = [{ id: "grotto-rubble", x: 1.5, z: 0, nx: 1, nz: 0, open: false, breakable: true, usable: true }];
      for (let tick = 0; tick < 600; tick++) bot.tick(view, 1 / 60);
      assert.ok(!bot.events.some(event => event.type === "stuck" && event.goal.startsWith("break:")));
    }],
    ["try both sides of a closed tunnel barrier", () => {
      const bot = createBot({ greed: 0.8, reactionLag: 0.25, seed: 1 });
      const view = observation(); view.raidId = 2; view.crates = []; view.walkable = () => true;
      view.exits.push({ id: "tunnel", x: 20, z: 0, open: false });
      view.gates = [{ id: "grotto-rubble", x: 10, z: 0, nx: 1, nz: 0, open: false, breakable: true, usable: true }];
      view.path = (fromX, fromZ, toX, toZ) => toX > 10 || toX < 0 ? [{ x: toX, z: toZ }] : [];
      assert.ok(bot.tick(view, 1 / 60).move[0] > 0);
    }],
    ["use the pistol rather than request exhausted melee", () => {
      const bot = createBot({ greed: 0.3, reactionLag: 0.25, seed: 1 });
      const view = observation(); view.player.stamina = 0;
      view.enemies = [{ id: 1, x: 1, z: 0, hp: 48, kind: "bandit", state: "chase", awake: true, windup: false }];
      bot.tick(view, 0.3);
      const input = bot.tick(view, 0.3);
      assert.notEqual(input.melee, true);
      assert.equal(input.fire, true);
    }],
    ["choose the tunnel when it is the available exit", () => {
      const bot = createBot({ greed: 0.8, reactionLag: 0.25, seed: 1 });
      const view = observation(); view.crates = []; view.walkable = () => true;
      view.path = (fromX, fromZ, toX, toZ) => [{ x: toX, z: toZ }];
      view.exits = [{ id: "tunnel", x: 10, z: 0, open: true }];
      assert.ok(bot.tick(view, 1 / 60).move[0] > 0);
    }],
    ["route to a tunnel through a real portal interaction", () => {
      const bot = createBot({ greed: 0.8, reactionLag: 0.25, seed: 1 });
      const view = observation(); view.crates = []; view.walkable = () => true;
      view.path = (fromX, fromZ, toX, toZ) => (fromX < 100) === (toX < 100) ? [{ x: toX, z: toZ }] : [];
      view.portals = [{ id: "cave", x: 1, z: 0, to: { x: 150, z: 0 } }];
      view.exits = [{ id: "tunnel", x: 160, z: 0, open: true }];
      assert.equal(bot.tick(view, 1 / 60).interact, true);
    }],
    ["interact from the reachable crate cell centre", () => {
      const bot = createBot({ greed: 0.5, reactionLag: 0.25, seed: 1 });
      assert.equal(bot.tick(observation(), 1 / 60).interact, true);
    }],
    ['bridge from an off-grid pocket to a reachable path origin', () => {
      const bot = createBot({ greed: 0.5, reactionLag: 0, seed: 1 });
      const view = observation(); view.crates = []; view.walkable = () => true;
      view.exits = [{ id: 'hatch', x: 20, z: 0, open: true }];
      view.path = (fromX, fromZ, toX, toZ) => fromX >= 1 ? [{ x: toX, z: toZ }] : [];
      assert.ok(bot.tick(view, 0.3).move[0] > 0);
    }],
    ['never bridge a rejected path origin across an unwalkable segment', () => {
      const bot = createBot({ greed: 0.5, reactionLag: 0, seed: 1 });
      const view = observation(); view.crates = []; view.walkable = x => x < 0.8;
      view.exits = [{ id: 'hatch', x: 20, z: 0, open: true }];
      view.path = (fromX, fromZ, toX, toZ) => fromX >= 1 ? [{ x: toX, z: toZ }] : [];
      assert.deepEqual(bot.tick(view, 0.3).move, [0, 0]);
    }],
    ["never infer kills from a scene reset", () => {
      const bot = createBot({ greed: 0.5, reactionLag: 0.25, seed: 1 });
      const view = observation();
      view.enemies = [{ id: 1, x: 30, z: 0, hp: 24, kind: "wild", state: "patrol", awake: false, windup: false }];
      bot.tick(view, 1 / 60);
      bot.tick({ ...view, scene: "bunker", enemies: [], outcome: { type: "extract", exit: "hatch", value: 5, raidT: 20 } }, 1 / 60);
      assert.equal(bot.events.filter(event => event.type === "kill").length, 0);
      assert.equal(bot.events.filter(event => event.type === "extract").length, 1);
    }],
    ["move into pickup range rather than using crate range", () => {
      const bot = createBot({ greed: 0.5, reactionLag: 0.25, seed: 1 });
      const view = observation();
      view.crates = []; view.pickups = [{ id: 2, item: "banana", x: 1.2, z: 0 }];
      view.walkable = () => true; view.path = () => [{ x: 1.2, z: 0 }];
      assert.ok(bot.tick(view, 1 / 60).move[0] > 0);
    }],
    ["track a pickup while its landing position changes", () => {
      const bot = createBot({ greed: 0.5, reactionLag: 0.25, seed: 1 });
      const view = observation();
      view.crates = []; view.pickups = [{ id: 2, item: "banana", x: 1.2, z: 0 }];
      view.walkable = () => true;
      view.path = (fromX, fromZ, toX, toZ) => [{ x: toX, z: toZ }];
      bot.tick(view, 1 / 60);
      view.player.x = 1.2; view.pickups[0].x = 3;
      assert.ok(bot.tick(view, 2).move[0] > 0);
    }],
    ["deduplicate authoritative combat and wait for the real bonk outcome", () => {
      const bot = createBot({ greed: 0.5, reactionLag: 0.25, seed: 1 });
      const view = observation();
      view.combatEvents = [{ serial: 1, type: "shot", weapon: "pistol", raidT: 1 }, { serial: 2, type: "kill", weapon: "melee", enemyId: 7, raidT: 2 }];
      bot.tick(view, 1 / 60); bot.tick(view, 1 / 60);
      assert.equal(bot.events.filter(event => event.type === "shot").length, 1);
      assert.equal(bot.events.filter(event => event.type === "kill").length, 1);
      view.player.hp = 0; view.player.hearts = 0;
      bot.tick(view, 1 / 60);
      assert.equal(bot.events.filter(event => event.type === "bonk-out").length, 0);
      view.outcome = { type: "bonk-out", raidT: 4 };
      bot.tick(view, 1 / 60); bot.tick(view, 1 / 60);
      assert.equal(bot.events.filter(event => event.type === "bonk-out").length, 1);
    }],
    ["close summary, sell, buy and deploy without pathing on the raid grid", () => {
      const bot = createBot({ greed: 0.5, reactionLag: 0.25, seed: 1 });
      const view = observation(); view.scene = "bunker"; view.homePanelOpen = true; view.money = 500;
      assert.equal(bot.tick(view, 1 / 60).ui, "leave");
      view.homePanelOpen = false;
      assert.equal(bot.tick(view, 1 / 60).interact, true);
      assert.equal(bot.tick(view, 1 / 60).buy, "mag");
      view.upgrades.mag = 1;
      assert.equal(bot.tick(view, 1 / 60).ui, "start");
    }],
    ["leave an unarmed hatch and return only once it arms", () => {
      const bot = createBot({ greed: 0.3, reactionLag: 0.25, seed: 1 });
      const view = observation();
      view.crates = []; view.player.hearts = 1; view.player.hp = 33;
      view.exits = [{ id: "hatch", x: 0, z: 0 }]; view.exitArmed = { hatch: false };
      view.walkable = () => true; view.path = (fromX, fromZ, toX, toZ) => [{ x: toX, z: toZ }];
      assert.ok(bot.tick(view, 1 / 60).move[0] > 0);
      view.player.x = 10; view.exitArmed.hatch = true;
      assert.ok(bot.tick(view, 2).move[0] < 0);
    }],
  ];
  let failed = 0;
  for (const [name, test] of tests) {
    try { test(); console.log(`PASS ${name}`); }
    catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
  }
  assert.equal(failed, 0, `${failed} bot regressions`);
}

if (process.argv.includes("--self-test")) await selfTest();

async function runCampaign(browser, { raids, ts, greed, seed, lag = 0.25, bossRoute = process.env.BOT_ROUTE }) {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  await page.addInitScript(() => {
    const monitor = window.__botMonitor = { samples: [], softlocks: [], scenes: [], starts: [], bosses: {} };
    let raid = -1, anchor, progressAt = 0, sampledAt = -1, scene = "", stalled = false;
    setInterval(() => {
      const game = window.__g?.G;
      if (!game) return;
      const label = game.scene + (window.__g.home.panelOpen() ? ":panel" : "");
      if (scene !== label) { monitor.scenes.push({ scene: label, raid: game.save.raids, t: game.time }); scene = label; }
      if (game.scene !== "raid") return;
      if (raid !== game.save.raids) {
        raid = game.save.raids; anchor = null; sampledAt = -1; stalled = false;
        monitor.starts.push({ raid, seed: game.seed, hp: game.hp, upgrades: { ...game.save.upgrades } });
      }
      const { x, z } = game.pp, extracting = game.extract.t > 0;
      const boss = game.enemies.find(enemy => enemy.tag === 'plantation-foreman');
      if (boss) monitor.bosses[raid] = { id: boss.id, hp: boss.hp, down: boss.down, escortsDown: game.enemies.filter(enemy => enemy.group === 'plantation-boss' && enemy !== boss && enemy.down).length };
      if (!anchor || Math.hypot(x - anchor.x, z - anchor.z) > 0.5 || extracting) { anchor = { x, z }; progressAt = game.raidT; }
      if (game.raidT - progressAt >= 20 || game.raidT > 900) {
        if (!stalled) monitor.softlocks.push({ raid, raidT: game.raidT, stillFor: game.raidT - progressAt, x, z, hp: game.hp, ammo: game.ammo + game.mag, intent: game.intent, usingItem: game.usingItem, equipping: game.equipping, extract: { ...game.extract }, enemies: game.enemies.filter(enemy => !enemy.down && enemy.p.distanceTo(game.pp) < 15).map(enemy => ({ id: enemy.id, kind: enemy.kind, state: enemy.state, hp: enemy.hp, x: enemy.p.x, z: enemy.p.z })) });
        stalled = true;
      }
      if (game.raidT - sampledAt >= 1) {
        sampledAt = game.raidT;
        monitor.samples.push({ raid, t: game.raidT, x, z, hp: game.hp, ammo: game.ammo + game.mag, crates: game.log.crates, extracting });
      }
    }, 100);
  });
  const base = process.env.BASE ?? "http://127.0.0.1:5352";
  assert.ok(Number(new URL(base).port) >= 5352 && Number(new URL(base).port) <= 5359, "campaigns use a systems-only port from 5352 to 5359");
  const url = `${base}/game.html?fresh=1&bot=1&ts=${ts}&post=0&dpr=1&fixdpr=1&greed=${greed}&lag=${lag}&seed=${seed}${bossRoute ? `&botroute=${bossRoute}` : ''}${process.env.BOT_GUN ? `&botgun=${process.env.BOT_GUN}` : ''}`; // BOT_GUN: start in gun 1 with this gun (main.ts, test only)
  const started = Date.now();
  const build = await captureBuild(buildDir, base);
  const report = { config: { raids, ts, greed, seed, lag, bossRoute, url }, build, started: new Date().toISOString(), errors, itemLedger: [] };
  const destination = `${outputDir}/g${greed}-s${seed}.json`;
  let logged = -1, lastProgress = 0;
  try {
    await page.goto(url);
    while (Date.now() - started < 1_800_000) {
      await page.waitForTimeout(2000);
      const state = await page.evaluate(() => ({
        raids: window.__raids ?? [], events: window.__bot?.events ?? [], monitor: window.__botMonitor,
        settlements: window.__g?.G.save.settlements ?? [],
        current: window.__g ? { scene: window.__g.G.scene, t: window.__g.G.raidT, raid: window.__g.G.save.raids, x: window.__g.G.pp.x, z: window.__g.G.pp.z, hp: window.__g.G.hp, ammo: window.__g.G.ammo + window.__g.G.mag, crates: window.__g.G.log.crates,
          intent: window.__g.G.intent, enemies: window.__g.G.enemies.filter(enemy => !enemy.down && enemy.p.distanceTo(window.__g.G.pp) < 15).map(enemy => ({ id: enemy.id, hp: enemy.hp, state: enemy.state, x: enemy.p.x, z: enemy.p.z })),
          pack: [...window.__g.G.pack], searches: window.__g.G.crates.filter(crate => crate.started && !crate.opened).map(crate => ({ id: crate.id, x: crate.x, z: crate.z, elapsed: crate.session?.elapsed, duration: crate.session?.duration, slots: crate.session?.slots })) } : null,
      }));
      Object.assign(report, state, { elapsedSeconds: (Date.now() - started) / 1000 });
      if (state.settlements.length !== report.itemLedger.length) {
        assert.deepEqual(await captureBuild(buildDir, base), build, 'build and runtime sources unchanged during campaign');
        const previousCount = report.itemLedger.length;
        report.itemLedger = state.settlements.map(settlementLedger);
        for (const diff of report.itemLedger.slice(previousCount)) console.log(JSON.stringify({ ledger: diff.raidId, reason: diff.reason, before: diff.before.length, after: diff.after.length, consumed: diff.consumed.length, abandoned: diff.abandoned.length, missing: diff.missing, unexpected: diff.unexpected, duplicates: diff.duplicates, rounds: diff.rounds }));
      }
      if (state.raids.length !== logged || Date.now() - lastProgress > 15000) {
        logged = state.raids.length; lastProgress = Date.now();
        console.log(JSON.stringify({ greed, seed, complete: logged, ...state.current }));
        await writeFile(destination, JSON.stringify(report, null, 2) + "\n");
      }
      if (errors.length || state.monitor?.softlocks.length) throw new Error(`Game failure: ${JSON.stringify(errors.length ? errors : state.monitor.softlocks)}`);
      if (state.raids.length >= raids && state.current?.scene === "raid" && state.current.raid >= raids) { report.complete = true; break; }
    }
    if (!report.complete) throw new Error("Campaign exceeded the 30-minute wall-clock deadline");
    assert.equal(report.itemLedger.length, raids, 'every completed raid has an audited settlement');
    assert.deepEqual(await captureBuild(buildDir, base), build, 'build and runtime sources unchanged during campaign');
    for (const result of report.raids) {
      const events = report.events.filter(event => event.raid === result.raid);
      assert.equal(events.filter(event => event.type === "kill").length, Object.values(result.log.kills).reduce((sum, count) => sum + count, 0), "authoritative kill total");
      assert.equal(events.filter(event => event.type === "shot").length, result.log.shots, "authoritative shot total");
      assert.equal(events.filter(event => ["extract", "bonk-out"].includes(event.type)).length, 1, "exactly one authoritative outcome");
      assert.equal(events.some(event => event.inferred), false, "no inferred combat or outcomes");
    }
  } catch (error) {
    report.failure = String(error);
    throw error;
  } finally {
    await writeFile(destination, JSON.stringify(report, null, 2) + "\n");
    await context.close();
  }
  return report;
}

async function writeReport() {
  const { rolldown } = await import('rolldown');
  const timingBundle = await rolldown({ input: 'src/game/loot/search.ts' });
  const timingOutput = await timingBundle.generate({ format: 'esm' });
  await timingBundle.close();
  const { estimateHumanRaid } = await import(`data:text/javascript;base64,${Buffer.from(timingOutput.output[0].code).toString('base64')}`);
  const policyBundle = await rolldown({ input: 'src/game/core/bot.ts' });
  const policyOutput = await policyBundle.generate({ format: 'esm' });
  await policyBundle.close();
  const { BOT_POLICY: botPolicy } = await import(`data:text/javascript;base64,${Buffer.from(policyOutput.output[0].code).toString('base64')}`);
  const bossPolicy = botPolicy.boss;
  const files = ["g0.3-s1.json", "g0.5-s2.json", "g0.8-s3.json", "g0.8-s4.json"];
  const campaigns = await Promise.all(files.map(async file => JSON.parse(await readFile(`${outputDir}/${file}`, "utf8"))));
  assert.deepEqual(campaigns.map(campaign => [campaign.config.greed, campaign.config.seed, campaign.raids.length, campaign.config.bossRoute]), [[0.3, 1, 4, undefined], [0.5, 2, 4, undefined], [0.8, 3, 6, 'prepared'], [0.8, 4, 4, 'unprepared']], 'the matrix contains 4 low, 4 medium, 6 prepared-route and 4 unprepared-route raids');
  for (const campaign of campaigns) {
    assert.equal(campaign.config.ts, 4);
    assert.equal(campaign.config.lag, 0.25);
    assert.equal(campaign.complete, true, "all campaigns must finish before reporting");
    assert.equal(campaign.failure, undefined);
    assert.equal(campaign.monitor.softlocks.length, 0);
    assert.equal(campaign.errors.length, 0);
    assert.equal(campaign.itemLedger.length, campaign.raids.length);
    for (const settlement of campaign.settlements) settlementLedger(settlement);
    for (const raid of campaign.raids) {
      const events = campaign.events.filter(event => event.raid === raid.raid);
      assert.equal(events.filter(event => event.type === "shot").length, raid.log.shots);
      assert.equal(events.filter(event => event.type === "kill" && event.weapon === "pistol").length, raid.log.killsBy.pistol);
      assert.equal(events.filter(event => event.type === "kill" && event.weapon === "melee").length, raid.log.killsBy.briefcase);
      const outcomes = events.filter(event => event.type === "extract" || event.type === "bonk-out");
      assert.equal(events.filter(event => event.type === 'loot-timing').length, 1, 'every raid records its loot-screen timing');
      const timing = events.find(event => event.type === 'loot-timing');
      assert.ok(Number.isFinite(timing.searchSeconds) && timing.searchSeconds >= 0 && timing.searchSeconds <= raid.t + 1e-6);
      assert.ok(Number.isInteger(timing.itemsTaken) && timing.itemsTaken >= 0 && Number.isInteger(timing.opens) && timing.opens >= 0);
      assert.equal(outcomes.length, 1);
      assert.equal(outcomes[0].inferred, false);
      assert.equal(outcomes[0].raidT, raid.t);
      assert.equal(outcomes[0].type, raid.how === "bonked" ? "bonk-out" : "extract");
      if (raid.how !== "bonked") assert.equal(outcomes[0].exit, raid.how);
    }
  }
  const rows = campaigns.flatMap(campaign => campaign.raids.map(raid => {
    const events = campaign.events.filter(event => event.raid === raid.raid);
    const kills = Object.values(raid.log.kills).reduce((sum, count) => sum + count, 0);
    return { greed: campaign.config.greed, botSeed: campaign.config.seed, lag: campaign.config.lag, bossRoute: campaign.config.bossRoute, ...raid, bossEngaged: events.some(event => event.type === 'boss-engaged'), bossState: campaign.monitor.bosses[raid.raid],
      bossDetours: events.filter(event => event.type === 'boss-detour'),
      lootTiming: events.find(event => event.type === 'loot-timing'),
      humanSeconds: estimateHumanRaid(raid.t, events.find(event => event.type === 'loot-timing') ?? { searchSeconds: 0, itemsTaken: 0, opens: 0 }), kills,
      hpLost: events.filter(event => event.type === "hurt").reduce((sum, event) => sum + (event.hp ?? 0), 0),
      upgradesBought: events.filter(event => event.type === "upgrade-bought").map(event => `${event.upgrade} ${event.level} (${event.cost})`),
    };
  }));
  assert.equal(rows.length, 18, 'the gate report requires the complete 18-raid matrix');
  assert.ok(new Set(rows.map(row => row.botSeed)).size >= 3);
  const totalKills = rows.reduce((sum, row) => sum + row.kills, 0);
  const meleeKills = rows.reduce((sum, row) => sum + row.log.killsBy.briefcase, 0);
  const zeroAmmo = rows.filter(row => row.ammo === 0).length;
  const useful = rows.filter(row => row.usefulFound > 0).length;
  const inLength = rows.filter(row => row.humanSeconds >= 180 && row.humanSeconds <= 360).length;
  const high = rows.filter(row => row.greed === 0.8 && row.lag === 0.25), bonks = high.filter(row => row.how === "bonked").length;
  const bossHigh = high.filter(row => row.bossEngaged), bossBonks = bossHigh.filter(row => row.how === 'bonked').length;
  const low = rows.filter(row => row.greed === 0.3), lowEngaged = low.filter(row => row.bossEngaged).length;
  const detours = rows.flatMap(row => row.bossDetours);
  const normalDetours = detours.filter(event => event.profile !== 'unprepared');
  const preparedDetours = normalDetours.filter(event => event.prepared && event.ammo >= bossPolicy.ammo && event.healing >= bossPolicy.healing && event.hp >= event.maxHp * bossPolicy.healthFraction && event.opened >= bossPolicy.containers && new Set(event.areas).size >= bossPolicy.areas);
  const preparedRoutes = rows.filter(row => row.bossRoute === 'prepared' && row.bossEngaged && row.bossDetours.some(event => event.prepared));
  const unpreparedRoutes = rows.filter(row => row.bossRoute === 'unprepared' && row.bossEngaged && row.bossDetours.some(event => !event.prepared));
  const preparedClears = preparedRoutes.filter(row => row.bossState?.down && row.bossState.escortsDown === 2);
  const unpreparedBonks = unpreparedRoutes.filter(row => row.how === 'bonked');
  const percentage = (numerator, denominator) => (100 * numerator / denominator).toFixed(1) + "%";
  const range = values => `${Math.min(...values).toFixed(2)}–${Math.max(...values).toFixed(2)}`;
  const gates = [
    { name: "Demo human-estimated raid length 3–6 min", pass: inLength === rows.length, measured: `${inLength}/${rows.length} in range; ${range(rows.map(row => row.humanSeconds / 60))} min; mean ${(rows.reduce((sum, row) => sum + row.humanSeconds, 0) / rows.length / 60).toFixed(2)} min` },
    { name: "Briefcase ≥30% of all kills", pass: totalKills > 0 && meleeKills / totalKills >= 0.3, measured: `${meleeKills}/${totalKills} = ${percentage(meleeKills, totalKills)}` },
    { name: "<20% of raids end with zero ammo", pass: zeroAmmo / rows.length < 0.2, measured: `${zeroAmmo}/${rows.length} = ${percentage(zeroAmmo, rows.length)}; loaded + reserve` },
    { name: "Every raid yields a useful find", pass: useful === rows.length, measured: `${useful}/${rows.length} raids rolled ≥1 useful item; minimum ${Math.min(...rows.map(row => row.usefulFound))}` },
    { name: 'Low-greed avoids the boss', pass: low.length > 0 && lowEngaged === 0, measured: `${lowEngaged}/${low.length} engaged` },
    { name: 'Prepared boss-route campaign coverage', pass: preparedRoutes.length >= 4, measured: `${preparedRoutes.length}/6 raids toured, prepared and engaged the live boss` },
    { name: 'Unprepared boss-route campaign coverage', pass: unpreparedRoutes.length >= 4, measured: `${unpreparedRoutes.length}/4 raids toured and knowingly engaged unprepared` },
    { name: 'Prepared campaign clears ≥70%', pass: preparedRoutes.length >= 4 && preparedClears.length / preparedRoutes.length >= 0.7, measured: `${preparedClears.length}/${preparedRoutes.length} boss plus both escorts cleared` },
    { name: 'Unprepared campaign bonks ≥40%', pass: unpreparedRoutes.length >= 4 && unpreparedBonks.length / unpreparedRoutes.length >= 0.4, measured: `${unpreparedBonks.length}/${unpreparedRoutes.length} bonked` },
    { name: 'Normal boss detours require supplies and area tour', pass: preparedDetours.length === normalDetours.length, measured: `${preparedDetours.length}/${normalDetours.length} non-stress detours met all preparation and tour thresholds` },
    { name: 'Settlement identity and round conservation', pass: true, measured: `${rows.length}/${rows.length} audited settlements; zero missing, unexpected or duplicate items and balanced ammunition` },
    { name: "Zero softlocks", pass: true, measured: `0/${rows.length}; longest raid ${Math.max(...rows.map(row => row.t)).toFixed(2)} s <900 s` },
  ];
  const build = campaigns[0].build;
  assert.ok(build?.sha256 && build?.sourceHashes, 'campaign must capture build identity at execution time');
  for (const campaign of campaigns) assert.deepEqual(campaign.build, build, 'all campaigns use the same build');
  assert.deepEqual(await captureBuild(buildDir, process.env.BASE ?? 'http://127.0.0.1:5352'), build, 'report matches the served build and current runtime sources');
  const { entry, sha256: buildSha256 } = build;
  const summary = { generated: new Date().toISOString(), build, inputs: files, gates, rows };
  await writeFile(`${outputDir}/G1_PACING.json`, JSON.stringify(summary, null, 2) + "\n");
  const perGreed = campaigns.map(campaign => {
    const subset = rows.filter(row => row.greed === campaign.config.greed && row.botSeed === campaign.config.seed);
    return `| ${campaign.config.greed} | ${campaign.config.seed} | ${subset.length} | ${(subset.reduce((sum, row) => sum + row.humanSeconds / 60, 0) / subset.length).toFixed(2)} | ${subset.filter(row => row.how === "bonked").length} | ${subset.filter(row => row.ammo === 0).length} |`;
  });
  const raidRows = rows.map(row => `| ${row.greed} / ${row.botSeed} / ${row.raid + 1} | ${row.how} | ${row.t.toFixed(2)} | ${(row.humanSeconds / 60).toFixed(2)} | ${row.log.crates} | ${row.log.killsBy.pistol} / ${row.log.killsBy.briefcase} / ${row.kills - row.log.killsBy.pistol - row.log.killsBy.briefcase} | ${row.log.shots} | ${row.hpLost} | ${row.value + row.bonus} | ${row.ammo} | ${row.usefulFound} | ${row.upgradesBought.join(", ") || "—"} |`);
  const document = `# G1 pacing: real-game bot runs

Local run date: 2026-11-15 (Asia/Taipei). ${rows.length} completed raids, four fresh-save campaigns, bot seeds 1/2/3/4, greed 0.3/0.5/0.8, 250 ms simulated reaction lag throughout. High greed includes six prepared-route attempts and four explicit unprepared stress-route attempts. These are full-population production-build raids from normal deployments, with no teleports, supplied kits or removed encounters. Build and source identities are recorded in the accompanying JSON.

## Gates

| Gate | Result | Measurement |
| --- | --- | --- |
${gates.map(gate => `| ${gate.name} | ${gate.pass ? "PASS" : "FAIL"} | ${gate.measured} |`).join("\n")}

The length gate applies to every completed raid, including bonk-outs. Human seconds = (raid seconds − observed search seconds) ×1.33 + observed search seconds + items taken ×0.75 + loot sessions opened ×1.5. Shared search sessions already implement Duckov's quality schedule (1, 1, 1, 1, 1.5, 2, 1 seconds); their elapsed time is not counted twice. Take time (0.75 seconds/item) and open/close time (1.5 seconds/session) are explicit assumptions, not measured human behavior. The useful-find gate follows the shipped \`isUseful\` / \`LootContext.usefulFound\` definition: a useful item was generated, not necessarily collected or brought home. This is not evidence of a delivery guarantee. These small samples do not establish population rates. Post-processing was off as requested; FPS, asset quality, council scores and human feel were not evaluated.

Campaign boss-engaging high-greed bonks: ${bossBonks}/${bossHigh.length}; all high-greed bonks: ${bonks}/${high.length}. Prepared-route coverage requires an observed prepared detour followed by real engagement. Unprepared stress-route coverage requires an observed unprepared detour followed by real engagement. A route request alone is not coverage. Stress bots deliberately commit to briefcase range without preparation after their area tour; ordinary bots retain preparation checks and their original boss tactics. All identity and ammunition ledger assertions run unchanged for every cohort.

## Per-raid measurements

Kills are pistol / briefcase / environment. HP lost sums observed raw-HP decreases at fixed ticks; \`log.hurt\` also retains the game's incoming damage counter (which can include lethal overkill). Value extracted means retained item value plus raft bonus; on bonk-outs this is the safe-pouch value, not the lost pack. Upgrade purchases happen after the listed raid, before the next deployment; numbers in parentheses are prices.

| Greed / bot seed / raid | Exit | Bot s | Human min | Crates | Kills P / B / E | Rounds | HP lost | Value extracted | End ammo | Useful rolled | Upgrades bought |
| --- | --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- |
${raidRows.join("\n")}

| Greed | Bot seed | Raids | Mean human min | Bonked | Zero ammo |
| --- | --- | ---: | ---: | ---: | ---: |
${perGreed.join("\n")}

## Systems tuning and interpretation

This run includes master's population pass: 64 authored sockets, seven additional container kinds, encounter groups and fauna filtering. Normal container quotas are ${[0.3, 0.5, 0.8].map(greed => botPolicy.demo.baseContainers + Math.round(greed * botPolicy.demo.containersPerGreed)).join('/')} with a ${botPolicy.demo.returnSeconds}-second expedition budget. An explicit boss-route objective has a ${bossPolicy.routeReturnSeconds}-second return budget. Prepared bots tour ${bossPolicy.containers} containers across ${bossPolicy.areas} areas and require ${bossPolicy.ammo} rounds, ${bossPolicy.healing} HP of carried healing and ${bossPolicy.healthFraction * 100}% current health. They retain needed medicine instead of trading it for sale loot. Explicit unprepared stress bots tour ${bossPolicy.unpreparedContainers} containers across ${bossPolicy.areas} areas before accepting the risk. No minimum duration or idle wait was added. The boss yard remains at (1, 48.5).

The demo target is 3–6 human-estimated minutes with the loot-aware estimator above. Bonk-outs count too. Boss outcomes here come from the full campaign, not isolated arenas.

Boat extraction coverage: ${rows.filter(row => row.how === "boat").length}/${rows.length}. Shared contracts.ts remains unchanged; bot-only observations extend the shared view without editing its contract.

See research/economy/G1_5_SYSTEMS.md for API details, the economy comparison and integration boundaries. Completing a campaign does not imply the numeric gates pass.

## Reproduction and evidence

Build with npx vite build --outDir /tmp/bv-systems-dist and serve it on a free port 5352–5359. Set BASE to that server, BOT_DIST=/tmp/bv-systems-dist and BOT_OUT=<evidence-directory>, then run node tools/botrun.mjs --matrix and --report. Use --camp-regression with a separate output directory for the two six-raid regressions. Campaigns use isolated browser contexts, fresh saves, Chromium at /usr/bin/chromium, ts=4, post=0, dpr=1 and fixdpr=1. The runner rejects ports 5318 and 5340.

The runner samples every 100 ms wall time. It aborts on no movement beyond 0.5 u for 20 simulated raid seconds outside extraction, or a raid above 900 s. It checks authoritative shot, kill and outcome events against game logs, rejects inferred outcomes and requires another deployment after each final result. Diagnostic runs are excluded from this aggregate. Bot seeds differ from actual world seeds; both are retained in raw evidence.

Raw evidence: ${files.map(file => `\`${file}\``).join(", ")}; aggregate G1_PACING.json. Build entry: ${entry}; SHA-256: ${buildSha256}. The JSON records source hashes.
`;
  await writeFile(`${outputDir}/G1_PACING.md`, document);
  console.log(gates.map(gate => `${gate.pass ? "PASS" : "FAIL"} ${gate.name}: ${gate.measured}`).join("\n"));
  assert.ok(gates.every(gate => gate.pass), 'campaign gates; measurements were saved before this assertion');
}

if (process.argv.includes("--report")) await writeReport();
if (process.argv.includes('--boss-matrix')) await (await import('./bossrun.mjs')).runBossMatrix();

if (!process.argv.includes("--self-test") && !process.argv.includes("--report") && !process.argv.includes('--boss-matrix')) {
  await mkdir(outputDir, { recursive: true });
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--use-angle=gl", "--enable-gpu", "--ignore-gpu-blocklist"] });
  try {
    if (process.argv.includes('--camp-regression')) {
      const campaigns = [];
      campaigns.push(...await Promise.all([1, 2].map(seed => runCampaign(browser, { ts: 4, greed: 0.5, seed, raids: 6 }))));
      assert.deepEqual(campaigns[0].build, campaigns[1].build, 'both camp regressions use one build');
      await writeFile(`${outputDir}/CAMP_REGRESSION.json`, JSON.stringify({ build: campaigns[0].build, completed: campaigns.reduce((sum, campaign) => sum + campaign.raids.length, 0), errors: campaigns.flatMap(campaign => campaign.errors), softlocks: campaigns.flatMap(campaign => campaign.monitor.softlocks), itemLedgers: campaigns.flatMap(campaign => campaign.itemLedger), rows: campaigns.flatMap(campaign => campaign.raids.map(raid => ({ botSeed: campaign.config.seed, ...raid }))) }, null, 2));
    } else if (process.argv.includes("--matrix")) {
      await Promise.all([{ greed: 0.3, seed: 1, raids: 4 }, { greed: 0.5, seed: 2, raids: 4 }, { greed: 0.8, seed: 3, raids: 6, bossRoute: 'prepared' }, { greed: 0.8, seed: 4, raids: 4, bossRoute: 'unprepared' }].map(config => runCampaign(browser, { ts: 4, ...config })));
    } else {
      const [raids = "4", ts = "4", greed = "0.5", seed = "1", lag = "0.25"] = process.argv.slice(2);
      await runCampaign(browser, { raids: +raids, ts: +ts, greed: +greed, seed: +seed, lag: +lag });
    }
  } finally { await browser.close(); }
}
