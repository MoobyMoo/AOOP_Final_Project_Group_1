import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { captureBuild } from './botbuild.mjs';
import { execFileSync } from 'node:child_process';
import { rolldown } from 'rolldown';

const base = process.env.BASE ?? 'http://127.0.0.1:5347';
const directory = process.env.BOT_DIST ?? '/tmp/bv-systems-wave2-dist';
const output = process.env.BOT_OUT ?? '/tmp/bv-systems-wave2-fixtures';
assert.equal(new URL(base).port, '5347');
await mkdir(output, { recursive: true });
const build = await captureBuild(directory, base);
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist'] });
const rows = [], errors = [];
const baselineCommit = '8936572';
const baselineBundle = await rolldown({ input: 'src/game/core/bot.ts', plugins: [{ name: 'historical-bot', transform(code, id) { if (id.endsWith('/core/bot.ts')) return execFileSync('git', ['show', `${baselineCommit}:src/game/core/bot.ts`], { encoding: 'utf8' }); } }] });
const baseline = await baselineBundle.generate({ format: 'iife', name: 'BaselineBot' });
await baselineBundle.close();
try {
  for (const magazine of [8, 12]) {
    const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(`${base}/game.html?fresh=1&raid=1&bot=1&ts=4&post=0&dpr=1&fixdpr=1&seed=1`);
    await page.waitForFunction(() => window.__g?.G.scene === 'raid');
    await page.evaluate(magazine => {
      const { G } = window.__g;
      G.bot = false;
      G.enemies = []; G.crates = []; G.pickups = [];
      if (magazine === 12) window.__gunStats.fit('att_mag_ext');
      else window.__gunStats.unfit('mag');
      G.mag = 0; G.ammo = 24; G.reloadT = -1;
      G.rollT = -1; G.useItem = null; G.equipping = null;
      window.__reloadFixture = { start: G.raidT };
    }, magazine);
    await page.waitForFunction(() => window.__g.G.raidT - window.__reloadFixture.start >= 2);
    assert.deepEqual(await page.evaluate(() => [window.__g.G.mag, window.__g.G.ammo, window.__g.G.reloadT]), [0, 24, -1], 'an idle empty gun never auto-reloads');
    await page.evaluate(() => { window.__g.G.bot = true; });
    await page.waitForFunction(() => window.__g.G.reloadT >= 0);
    const started = await page.evaluate(() => ({ time: window.__g.G.raidT, duration: window.__g.G.reloadTime, shots: window.__g.G.log.shots }));
    await page.waitForFunction(() => window.__g.G.mag > 0 && window.__g.G.reloadT < 0);
    const finished = await page.evaluate(() => ({ mag: window.__g.G.mag, reserve: window.__g.G.ammo, shots: window.__g.G.log.shots, raidT: window.__g.G.raidT }));
    assert.equal(started.duration, 1.2, 'the bot uses the combat reload hook and original Kingpin timing');
    assert.equal(finished.mag, magazine);
    assert.equal(finished.reserve, 24 - magazine);
    assert.equal(finished.shots, started.shots, 'manual reload does not fire a phantom shot');
    rows.push({ magazine, noAutoReload: true, manualReload: true, ...started, ...finished });
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(`${base}/game.html?fresh=1&raid=1&bot=1&ts=4&post=0&dpr=1&fixdpr=1&seed=1`);
  await page.waitForFunction(() => window.__g?.G.scene === 'raid');
  await page.evaluate(() => {
    const { G, walkable, los } = window.__g;
    const body = G.enemies[0];
    const point = Array.from({ length: 16 }, (_, index) => ({ x: G.pp.x + Math.cos(index * Math.PI / 8), z: G.pp.z + Math.sin(index * Math.PI / 8) }))
      .find(point => walkable(point.x, point.z) && los(G.pp.x, G.pp.z, point.x, point.z));
    if (!point) throw new Error('No reachable body fixture location');
    body.down = true; body.hp = 0; body.state = 'defeat';
    body.p.set(point.x, G.pp.y, point.z);
    body.gear = { head: null, face: null, body: null, back: null, ears: null };
    body.carry = ['ammo45', 'bandage']; body.stolen = [];
    G.enemies = [body]; G.crates = [{ id: 99999, x: point.x, z: point.z, tier: 'wood', fixed: 'body', obj: body.rig.root, opened: false, search: 0, items: null, kind: 'body', enemy: body }]; G.pickups = [];
    G.ammo = 0; G.mag = 0; G.reloadT = -1; G.pack = []; G.equipping = null;
    window.__bodyFixture = body;
  });
  await page.waitForFunction(() => window.__g.G.ammo + window.__g.G.mag === 8 && window.__g.G.pack.includes('bandage'));
  const body = await page.evaluate(() => ({ rounds: window.__g.G.ammo + window.__g.G.mag, bandages: window.__g.G.pack.filter(item => item === 'bandage').length, remainingCarry: window.__bodyFixture.carry.length, useful: window.__g.G.lootCtx.usefulFound }));
  assert.deepEqual(body, { rounds: 8, bandages: 1, remainingCarry: 0, useful: 2 }, 'the bot searches and collects a real body once, including its explicit reserve');
  rows.push({ bodySearch: true, ...body });
  await context.close();
  for (const position of [{ x: 11.4721319667333, z: 23.453993361078023 }, { x: -71.37383123270891, z: 16.42909183005226 }, { x: -57.30283983088589, z: 39.275 }]) {
    const navigation = await browser.newContext({ viewport: { width: 960, height: 540 } });
    const navigationPage = await navigation.newPage();
    navigationPage.on('pageerror', error => errors.push(String(error)));
    await navigationPage.goto(`${base}/game.html?fresh=1&raid=1&bot=1&ts=4&post=0&dpr=1&fixdpr=1&seed=3&greed=0.8`);
    await navigationPage.waitForFunction(() => window.__g?.G.scene === 'raid');
    await navigationPage.evaluate(position => {
      const { G, tp } = window.__g;
      G.enemies = [];
      tp(position.x, position.z);
      window.__navigationFixture = { x: G.pp.x, z: G.pp.z, start: G.raidT };
    }, position);
    await navigationPage.waitForFunction(() => window.__g.G.raidT - window.__navigationFixture.start >= 12);
    const navigationResult = await navigationPage.evaluate(() => {
      const { G } = window.__g, start = window.__navigationFixture;
      return { moved: Math.hypot(G.pp.x - start.x, G.pp.z - start.z), elapsed: G.raidT - start.start };
    });
    console.log(JSON.stringify({ navigation: position, ...navigationResult }));
    assert.ok(navigationResult.moved > 3, `the bot escapes the stalled corner through real collision-safe routing: ${JSON.stringify(position)}`);
    rows.push({ radiusSafeNavigation: true, position, ...navigationResult });
    await navigation.close();
  }
  const returningBoss = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const returningPage = await returningBoss.newPage();
  returningPage.on('pageerror', error => errors.push(String(error)));
  await returningPage.goto(`${base}/game.html?fresh=1&raid=1&bot=1&ts=4&post=0&dpr=1&fixdpr=1&seed=2&greed=0.5`);
  await returningPage.waitForFunction(() => window.__g?.G.scene === 'raid');
  await returningPage.addScriptTag({ content: baseline.output[0].code });
  await returningPage.evaluate(() => {
    const { G, tp } = window.__g;
    G.enemies = [];
    tp(11.15687438315738, 76.76451531887488);
    const tick = window.__bot.tick;
    window.__bot.tick = (view, dt) => {
      const observation = { ...view, searching: false, bodies: [], pickups: [], gates: [], crates: view.crates.filter(crate => Math.hypot(crate.x - view.player.x, crate.z - view.player.z) > 10), enemies: [{ id: 79, x: 11.759198650264265, z: 72.6461012052136, hp: 439, kind: 'brute', state: 'return', boss: true }] };
      if (!window.__bossReturnFixture) {
        const old = window.BaselineBot.createBot({ greed: 0.5, reactionLag: 0.25, seed: 2 });
        const before = old.tick(observation, dt);
        const control = window.BaselineBot.createBot({ greed: 0.5, reactionLag: 0.25, seed: 2 }).tick({ ...observation, enemies: [] }, dt);
        const after = tick(observation, dt);
        window.__bossReturnFixture = { before, control, after, x: G.pp.x, z: G.pp.z, start: G.raidT };
        return after;
      }
      return tick(observation, dt);
    };
  });
  await returningPage.waitForFunction(() => window.__bossReturnFixture && window.__g.G.raidT - window.__bossReturnFixture.start >= 12);
  const bossReturn = await returningPage.evaluate(() => {
    const { G } = window.__g, fixture = window.__bossReturnFixture;
    return { ...fixture, moved: Math.hypot(G.pp.x - fixture.x, G.pp.z - fixture.z) };
  });
  assert.deepEqual(bossReturn.before.move, [0, 0], 'the master bot reproduces the returning-boss exclusion deadlock at the reported camp position');
  assert.ok(!bossReturn.before.interact, 'the historical bot is path-blocked, not opening a nearby unsearched crate');
  assert.ok(Math.hypot(...bossReturn.control.move) > 0, 'the historical bot can route from the same camp position when the boss exclusion is removed');
  assert.ok(Math.hypot(...bossReturn.after.move) > 0, 'the bot immediately routes away from the returning boss without a timeout');
  assert.ok(bossReturn.moved > 3, 'the bot leaves the reported camp position through real world collision');
  rows.push({ bossReturn: true, baselineCommit, ...bossReturn });
  await returningBoss.close();
  assert.equal(errors.length, 0);
  assert.deepEqual(await captureBuild(directory, base), build);
  await writeFile(`${output}/SYSTEMS_FIXTURES.json`, JSON.stringify({ build, rows, errors }, null, 2));
  console.log(JSON.stringify({ rows, errors }));
} finally { await browser.close(); }
