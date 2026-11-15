import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { captureBuild } from './botbuild.mjs';

export async function runBossMatrix() {
  const base = process.env.BASE ?? 'http://127.0.0.1:5347';
  assert.equal(new URL(base).port, '5347', 'boss fixtures use the systems-only port');
  const output = process.env.BOT_OUT ?? '/tmp/bv-systems-boss';
  const directory = process.env.BOT_DIST ?? '/tmp/bv-systems-dist';
  const build = await captureBuild(directory, base);
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const rows = [];
  try {
    for (const mode of ['avoid', 'greedy', 'prepared']) for (let seed = 1; seed <= (mode === 'avoid' ? 3 : 10); seed++) {
      const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(String(error)));
      await page.goto(`${base}/game.html?fresh=1&raid=1&bot=1&ts=8&post=0&dpr=1&fixdpr=1&greed=${mode === 'avoid' ? 0.3 : 0.8}&lag=0.25&seed=${seed}`);
      await page.waitForFunction(() => window.__g?.G.scene === 'raid' && window.__g.G.enemies.some(enemy => enemy.tag === 'plantation-foreman'), null, { timeout: 90000 });
      await page.evaluate(mode => {
        const { G, tp, walkable, los } = window.__g;
        const boss = G.enemies.find(enemy => enemy.tag === 'plantation-foreman');
        for (const enemy of G.enemies) if (enemy.group !== 'plantation-boss') enemy.rig.root.removeFromParent();
        G.enemies = G.enemies.filter(enemy => enemy.group === 'plantation-boss');
        const radius = mode === 'avoid' ? 26 : 12;
        const start = Array.from({ length: 32 }, (_, index) => ({ x: boss.home.x + Math.sin(index * Math.PI / 16) * radius, z: boss.home.z + Math.cos(index * Math.PI / 16) * radius }))
          .find(point => walkable(point.x, point.z) && los(point.x, point.z, boss.p.x, boss.p.z));
        if (!start) throw new Error('No valid arena fixture start');
        tp(start.x, start.z);
        G.hp = G.maxHp = mode === 'prepared' ? 125 : 100;
        G.ammo = mode === 'prepared' ? 88 : 16;
        if (mode === 'prepared') window.__gunStats.fit('att_mag_ext');
        else window.__gunStats.unfit('mag');
        G.mag = G.magSize;
        G.gear = mode === 'prepared' ? { head: 'warden_helmet', face: 'shades', body: 'warden_vest', back: 'satchel', ears: null } : { head: 'bowler', face: 'shades', body: 'suit', back: 'satchel', ears: null };
        G.pack = mode === 'prepared' ? ['smoothie', 'smoothie', 'smoothie'] : [];
        G.stamina = 100;
        boss.face = Math.atan2(G.pp.x - boss.p.x, G.pp.z - boss.p.z);
        window.__bossFixture = { startT: G.raidT, bossId: boss.id, maxBossHp: boss.max, start: { x: G.pp.x, z: G.pp.z } };
      }, mode);
      await page.waitForFunction(() => {
        const game = window.__g.G, fixture = window.__bossFixture;
        const boss = game.enemies.find(enemy => enemy.id === fixture.bossId);
        return !game.alive || boss?.down && game.enemies.every(enemy => enemy.down) || game.raidT - fixture.startT > 120 || game.scene !== 'raid';
      }, null, { timeout: 180000 });
      const row = await page.evaluate(() => {
        const game = window.__g.G, fixture = window.__bossFixture;
        const boss = game.enemies.find(enemy => enemy.id === fixture.bossId);
        return { elapsed: game.raidT - fixture.startT, hp: game.hp, bossHp: boss?.hp ?? null, defeated: boss?.down ?? false, cleared: !!boss?.down && game.enemies.every(enemy => enemy.down), bonked: !game.alive && game.hp <= 0,
          engaged: (window.__bot?.events ?? []).some(event => event.type === 'boss-engaged' && event.enemyId === fixture.bossId),
          shots: game.log.shots, escortsDown: game.enemies.filter(enemy => enemy.group === 'plantation-boss' && enemy !== boss && enemy.down).length, start: fixture.start, errors: [] };
      });
      row.errors = errors; rows.push({ mode, seed, ...row });
      console.log(JSON.stringify(rows.at(-1)));
      await writeFile(`${output}/boss-matrix.partial.json`, JSON.stringify(rows, null, 2));
      await context.close();
      assert.equal(errors.length, 0, 'no runtime exceptions');
    }
  } finally { await browser.close(); }
  const high = rows.filter(row => row.mode === 'greedy' && row.engaged);
  const avoided = rows.filter(row => row.mode === 'avoid' && !row.engaged && !row.bonked);
  const prepared = rows.filter(row => row.mode === 'prepared' && row.cleared && !row.bonked);
  const gates = {
    avoidance: { pass: avoided.length === 3, count: avoided.length, total: 3 },
    greedyBonks: { pass: high.length === 10 && high.filter(row => row.bonked).length / high.length >= 0.4, bonks: high.filter(row => row.bonked).length, engaged: high.length },
    preparedWin: { pass: prepared.length >= 7, wins: prepared.length, total: 10, minimum: 7 },
  };
  assert.deepEqual(await captureBuild(directory, base), build, 'build and runtime sources unchanged during boss suite');
  const result = { gates, rows, build, scope: 'Live isolated arena fixtures, actual AI/combat/player bot; other encounters removed. Existing combat hook integration is reported separately. Not full-raid population rates.' };
  await writeFile(`${output}/BOSS_MATRIX.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(gates, null, 2));
  assert.ok(Object.values(gates).every(gate => gate.pass), 'boss matrix gates');
}
