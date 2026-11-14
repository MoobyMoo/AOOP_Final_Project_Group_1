import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright-core";

const outputDir = process.env.BOT_OUT ?? "playlogs/bot";
const buildDir = process.env.BOT_DIST ?? "/tmp/bv-sol-dist";

async function selfTest() {
  const { rolldown } = await import("rolldown");
  const bundle = await rolldown({ input: "src/game/core/bot.ts" });
  const { output } = await bundle.generate({ format: "esm" });
  await bundle.close();
  const { createBot } = await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString("base64")}`);
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
    ["interact from the reachable crate cell centre", () => {
      const bot = createBot({ greed: 0.5, reactionLag: 0.25, seed: 1 });
      assert.equal(bot.tick(observation(), 1 / 60).interact, true);
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

async function runCampaign(browser, { raids, ts, greed, seed, lag = 0.25 }) {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  await page.addInitScript(() => {
    const monitor = window.__botMonitor = { samples: [], softlocks: [], scenes: [], starts: [] };
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
      if (!anchor || Math.hypot(x - anchor.x, z - anchor.z) > 0.5 || extracting) { anchor = { x, z }; progressAt = game.raidT; }
      if (game.raidT - progressAt >= 20 || game.raidT > 900) {
        if (!stalled) monitor.softlocks.push({ raid, raidT: game.raidT, stillFor: game.raidT - progressAt, x, z, hp: game.hp, ammo: game.ammo + game.mag, extract: { ...game.extract }, enemies: game.enemies.filter(enemy => !enemy.down && enemy.p.distanceTo(game.pp) < 15).map(enemy => ({ id: enemy.id, kind: enemy.kind, state: enemy.state, hp: enemy.hp, x: enemy.p.x, z: enemy.p.z })) });
        stalled = true;
      }
      if (game.raidT - sampledAt >= 1) {
        sampledAt = game.raidT;
        monitor.samples.push({ raid, t: game.raidT, x, z, hp: game.hp, ammo: game.ammo + game.mag, crates: game.log.crates, extracting });
      }
    }, 100);
  });
  const base = process.env.BASE ?? "http://127.0.0.1:5330";
  assert.notEqual(new URL(base).port, "5318", "port 5318 belongs to the owner's live server");
  const url = `${base}/game.html?fresh=1&bot=1&ts=${ts}&post=0&dpr=1&fixdpr=1&greed=${greed}&lag=${lag}&seed=${seed}`;
  const started = Date.now();
  const report = { config: { raids, ts, greed, seed, lag, url }, started: new Date().toISOString(), errors };
  const destination = `${outputDir}/g${greed}-s${seed}.json`;
  let logged = -1, lastProgress = 0;
  try {
    await page.goto(url);
    while (Date.now() - started < 1_800_000) {
      await page.waitForTimeout(2000);
      const state = await page.evaluate(() => ({
        raids: window.__raids ?? [], events: window.__bot?.events ?? [], monitor: window.__botMonitor,
        current: window.__g ? { scene: window.__g.G.scene, t: window.__g.G.raidT, raid: window.__g.G.save.raids, x: window.__g.G.pp.x, z: window.__g.G.pp.z, hp: window.__g.G.hp, ammo: window.__g.G.ammo + window.__g.G.mag, crates: window.__g.G.log.crates } : null,
      }));
      Object.assign(report, state, { elapsedSeconds: (Date.now() - started) / 1000 });
      if (state.raids.length !== logged || Date.now() - lastProgress > 15000) {
        logged = state.raids.length; lastProgress = Date.now();
        console.log(JSON.stringify({ greed, seed, complete: logged, ...state.current }));
        await writeFile(destination, JSON.stringify(report, null, 2) + "\n");
      }
      if (errors.length || state.monitor?.softlocks.length) throw new Error(`Game failure: ${JSON.stringify(errors.length ? errors : state.monitor.softlocks)}`);
      if (state.raids.length >= raids && state.current?.scene === "raid" && state.current.raid >= raids) { report.complete = true; break; }
    }
    if (!report.complete) throw new Error("Campaign exceeded the 30-minute wall-clock deadline");
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
  const files = ["g0.3-s1.json", "g0.5-s2.json", "g0.8-s3.json"];
  const campaigns = await Promise.all(files.map(async file => JSON.parse(await readFile(`${outputDir}/${file}`, "utf8"))));
  for (const campaign of campaigns) {
    assert.equal(campaign.complete, true, "all campaigns must finish before reporting");
    assert.equal(campaign.failure, undefined);
    assert.equal(campaign.monitor.softlocks.length, 0);
    assert.equal(campaign.errors.length, 0);
    for (const raid of campaign.raids) {
      const events = campaign.events.filter(event => event.raid === raid.raid);
      assert.equal(events.filter(event => event.type === "shot").length, raid.log.shots);
      assert.equal(events.filter(event => event.type === "kill" && event.weapon === "pistol").length, raid.log.killsBy.pistol);
      assert.equal(events.filter(event => event.type === "kill" && event.weapon === "melee").length, raid.log.killsBy.briefcase);
      const outcomes = events.filter(event => event.type === "extract" || event.type === "bonk-out");
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
    return { greed: campaign.config.greed, botSeed: campaign.config.seed, lag: campaign.config.lag, ...raid,
      humanSeconds: raid.t * 1.33, kills,
      hpLost: events.filter(event => event.type === "hurt").reduce((sum, event) => sum + (event.hp ?? 0), 0),
      upgradesBought: events.filter(event => event.type === "upgrade-bought").map(event => `${event.upgrade} ${event.level} (${event.cost})`),
    };
  }));
  assert.ok(rows.length >= 10);
  assert.ok(new Set(rows.map(row => row.botSeed)).size >= 3);
  const totalKills = rows.reduce((sum, row) => sum + row.kills, 0);
  const meleeKills = rows.reduce((sum, row) => sum + row.log.killsBy.briefcase, 0);
  const zeroAmmo = rows.filter(row => row.ammo === 0).length;
  const useful = rows.filter(row => row.usefulFound > 0).length;
  const inLength = rows.filter(row => row.humanSeconds >= 240 && row.humanSeconds <= 480).length;
  const high = rows.filter(row => row.greed === 0.8 && row.lag === 0.25), bonks = high.filter(row => row.how === "bonked").length;
  const percentage = (numerator, denominator) => (100 * numerator / denominator).toFixed(1) + "%";
  const range = values => `${Math.min(...values).toFixed(2)}–${Math.max(...values).toFixed(2)}`;
  const failedUseful = rows.find(row => row.usefulFound === 0);
  const usefulExample = failedUseful ? `The failed case (greed ${failedUseful.greed}, bot seed ${failedUseful.botSeed}, raid ${failedUseful.raid + 1}) opened ${failedUseful.log.crates} crate(s) and returned value ${failedUseful.value + failedUseful.bonus}, including bonus.` : "Every sampled raid passed the shipped roll condition.";
  const gates = [
    { name: "Human-estimated raid length 4–8 min", pass: inLength === rows.length, measured: `${inLength}/${rows.length} in range; ${range(rows.map(row => row.humanSeconds / 60))} min; mean ${(rows.reduce((sum, row) => sum + row.humanSeconds, 0) / rows.length / 60).toFixed(2)} min` },
    { name: "Briefcase ≥30% of all kills", pass: totalKills > 0 && meleeKills / totalKills >= 0.3, measured: `${meleeKills}/${totalKills} = ${percentage(meleeKills, totalKills)}` },
    { name: "<20% of raids end with zero ammo", pass: zeroAmmo / rows.length < 0.2, measured: `${zeroAmmo}/${rows.length} = ${percentage(zeroAmmo, rows.length)}; loaded + reserve` },
    { name: "Every raid yields a useful find", pass: useful === rows.length, measured: `${useful}/${rows.length} raids rolled ≥1 useful item; minimum ${Math.min(...rows.map(row => row.usefulFound))}` },
    { name: "10–30% bonk-out at greed 0.8 / 250 ms lag", pass: bonks / high.length >= 0.1 && bonks / high.length <= 0.3, measured: `${bonks}/${high.length} = ${percentage(bonks, high.length)}` },
    { name: "Zero softlocks", pass: true, measured: `0/${rows.length}; longest raid ${Math.max(...rows.map(row => row.t)).toFixed(2)} s <900 s` },
  ];
  const assets = await readdir(`${buildDir}/assets`);
  const entry = assets.find(file => /^game-.*\.js$/.test(file));
  const buildSha256 = createHash("sha256").update(await readFile(`${buildDir}/assets/${entry}`)).digest("hex");
  const sourcePaths = ["src/game/core/bot.ts", "src/game/core/botdrive.ts", "src/game/core/raid.ts", "src/game/combat/combat.ts", "src/game/main.ts"];
  const sourceHashes = Object.fromEntries(await Promise.all(sourcePaths.map(async file => [file, createHash("sha256").update(await readFile(file)).digest("hex")])));
  const summary = { generated: new Date().toISOString(), build: { entry, sha256: buildSha256, sourceHashes }, inputs: files, gates, rows };
  await writeFile(`${outputDir}/G1_PACING.json`, JSON.stringify(summary, null, 2) + "\n");
  const perGreed = campaigns.map(campaign => {
    const subset = rows.filter(row => row.greed === campaign.config.greed);
    return `| ${campaign.config.greed} | ${campaign.config.seed} | ${subset.length} | ${(subset.reduce((sum, row) => sum + row.humanSeconds / 60, 0) / subset.length).toFixed(2)} | ${subset.filter(row => row.how === "bonked").length} | ${subset.filter(row => row.ammo === 0).length} |`;
  });
  const raidRows = rows.map(row => `| ${row.greed} / ${row.botSeed} / ${row.raid + 1} | ${row.how} | ${row.t.toFixed(2)} | ${(row.humanSeconds / 60).toFixed(2)} | ${row.log.crates} | ${row.log.killsBy.pistol} / ${row.log.killsBy.briefcase} / ${row.kills - row.log.killsBy.pistol - row.log.killsBy.briefcase} | ${row.log.shots} | ${row.hpLost} | ${row.value + row.bonus} | ${row.ammo} | ${row.usefulFound} | ${row.upgradesBought.join(", ") || "—"} |`);
  const document = `# G1 pacing: real-game bot runs

Local run date: 2026-11-15 (Asia/Taipei). ${rows.length} completed raids, three fresh-save campaigns, bot seeds 1/2/3, greed 0.3/0.5/0.8, 250 ms simulated reaction lag throughout. These are real rendered production-build raids, not the loot simulator. Build and source identities are recorded in the accompanying JSON.

## Gates

| Gate | Result | Measurement |
| --- | --- | --- |
${gates.map(gate => `| ${gate.name} | ${gate.pass ? "PASS" : "FAIL"} | ${gate.measured} |`).join("\n")}

The length gate applies to every completed raid, including bonk-outs. Human estimates are raid simulation time ×1.33, not wall-clock duration. The useful-find gate follows the shipped \`isUseful\` / \`LootContext.usefulFound\` definition: a useful item was generated, not necessarily collected or brought home. This is not evidence of a delivery guarantee. These small samples do not establish population rates. Post-processing was off as requested; FPS, asset quality, council scores and human feel were not evaluated.

## Per-raid measurements

Kills are pistol / briefcase / environment. HP lost sums observed raw-HP decreases at fixed ticks; \`log.hurt\` also retains the game's incoming damage counter (which can include lethal overkill). Value extracted means retained item value plus raft bonus; on bonk-outs this is the safe-pouch value, not the lost pack. Upgrade purchases happen after the listed raid, before the next deployment; numbers in parentheses are prices.

| Greed / bot seed / raid | Exit | Bot s | Human min | Crates | Kills P / B / E | Rounds | HP lost | Value extracted | End ammo | Useful rolled | Upgrades bought |
| --- | --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- |
${raidRows.join("\n")}

| Greed | Bot seed | Raids | Mean human min | Bonked | Zero ammo |
| --- | --- | ---: | ---: | ---: | ---: |
${perGreed.join("\n")}

## What changed and why

- Combat events originate in \`shoot\` / \`knockOut\`; finish outcomes originate in \`raid.finish\`. Serial numbers deduplicate combat events and the raid ID remains stable across the result transition. The runner checks shot and kill totals against each game's own per-raid log, requires exactly one non-inferred outcome, and rejects inferred events.
- The adapter latches deployment until the asynchronous fade changes scenes. Previously every bunker simulation tick scheduled another deployment; the reset enemy arrays appeared as a burst of inferred kills. The actual creator has its own bot-aware completion callback. Summary panels are closed using normal Intent interaction; sale, cheapest affordable upgrade, and deployment use the existing home API.
- A crate is searched from 1.9 u and an A* endpoint can sit about 1.5 u from its centre. Arrival now uses 1.8 u, while pickup arrival uses 0.8 u for the game's 1.1 u collection radius. Pickup goals track their coordinates and use the existing scatter destination rather than the temporarily blocked crate centre. An unarmed exit gets a departure-and-return route. Searches and extraction countdowns are exempt from the bot's short recovery watchdog, not from the runner's 20-second non-extraction check.
- HP/maxHP, healing-in-progress, upgrades and authoritative outcomes are exposed without converting HP into fictional hearts. Compatibility hearts remain available. A non-stunned Sleeper is not shot; a quiet policy that declines firing returns to navigation rather than waiting forever.

## Top five game issues and recommended tuning

1. **The measured loop is too short.** The observed human-estimated range is ${range(rows.map(row => row.humanSeconds / 60))} min, versus 4–8 min. Nearby crates can satisfy the bot's pack/greed policy before deeper map rewards matter. Recommend moving worthwhile objectives and rewards farther into route choices, then validating with human runs. Do not add idle waits or multiply movement times just to pass the bot gate.
2. **High greed does not produce the requested risk.** At greed 0.8 and 250 ms lag, ${bonks}/${high.length} raids ended bonked. The bot repeatedly reaches the raft without needing to defeat the Sleeper or stay in a contested extraction ring. Recommend testing encounters on rewarding routes and extraction approaches; do not raise all enemy damage based on one small sample.
3. **The useful-find guarantee has an eligibility gap.** ${useful}/${rows.length} raids rolled a useful item. ${usefulExample} \`rollCrate\` only forces useful loot after the third crate. Recommend guaranteeing a useful item on the first eligible loot opportunity, or stating the three-crate condition honestly. Also validate scatter positions and track collection: \`usefulFound\` counts generated items, not acquired ones, and scattering currently ignores collision.
4. **Persistent collision state accumulates across raids.** \`grid.block\` appends blockers and marks PROP cells; \`startRaid\` rebuilds props and crates but does not restore either collection. Old crate sockets can remain solid when the next raid chooses different sockets. Recommend a static baseline plus a resettable per-raid collision layer. Left unchanged because grid/props are outside this task's edit scope.
5. **The seed query is not a world seed.** The three requested bot seeds are exercised, but \`startRaid\` derives world seeds from \`save.raids * 7919 + 13\` regardless of the query. AI also uses \`Math.random\` for timers, so identical URLs are not deterministic replays. Recommend separate explicit bot/world seeds and routing simulation randomness through the raid RNG. Raw reports retain actual world seeds; do not treat these as three independent seeded maps per greed.

Contract problem: \`BotView\` describes hearts but the game uses 100 HP (+25 per health upgrade), and its exit union excludes the real tunnel. The local observation extension carries HP and tunnel outcomes, but tunnel navigation remains untested/excluded by the adapter. The shared contract needs a central update followed by an underground/tunnel scenario; it is unchanged here as requested.

Risk tuning: the greed-0.8/250-ms sample is ${bonks}/${high.length} bonk-outs (${percentage(bonks, high.length)}), ${bonks / high.length >= 0.1 && bonks / high.length <= 0.3 ? "inside" : "outside"} the target band. If this persists with larger samples, tune contested extraction approaches and route incentives before changing enemy damage. Ammo tuning: ${zeroAmmo}/${rows.length} finish empty; adjust ammo availability only after the collision and pickup-delivery issues are addressed. Melee share is ${percentage(meleeKills, totalKills)}; preserve close-range bandit counterplay rather than forcing the bot to waste ammunition or melee invulnerable targets.

## Reproduction and evidence

\`npx tsc --noEmit -p .\` and \`node tools/botrun.mjs --self-test\` validate types and the bot regressions. Build: \`npx vite build --outDir /tmp/bv-sol-dist --emptyOutDir\`. Serve separately: \`npx vite preview --outDir /tmp/bv-sol-dist --port 5330 --strictPort --host 127.0.0.1\`. Run \`node tools/botrun.mjs --matrix\` (4 low, 4 medium, 10 high), then \`node tools/botrun.mjs --report\`. Campaigns use isolated browser contexts, fresh saves, Chromium at \`/usr/bin/chromium\`, the requested GPU flags, \`ts=4\`, \`post=0\`, \`dpr=1\`, \`fixdpr=1\`. Port 5318 was never used.

The runner samples every 100 ms wall time, retaining roughly one trace point per simulated second. A softlock is no movement exceeding 0.5 u for 20 simulated raid seconds while not counting down extraction, or a raid exceeding 900 s. Detection aborts the campaign and writes its failure context. All accepted campaigns have zero page errors and zero softlocks, traverse creator/bunker/raid/result/bunker, and start another raid after the final result so its home purchases are recorded. Diagnostic pre-fix runs under \`diagnostic/\` are excluded from every gate.

Raw evidence: ${files.map(file => `\`${file}\``).join(", ")}; machine-readable aggregate: \`G1_PACING.json\`. Build entry: \`${entry}\`; SHA-256: \`${buildSha256}\`. The aggregate also records source hashes. Implementation choices are grounded in the shipped interaction distances, collision/path implementation, actual HP constants and home API, rather than outdated brief numbers.

Validation: TypeScript passes; all seven bot regression checks pass; rebuilding after the final type-only correction produces the identical game bundle SHA-256 used by these runs. Home file audit reports four pre-existing entries: \`/home/moo/0f840a8ea5fae3927f1d1022d7b10fcd0e677cde4bf3681a5fa5d4218c333b86.png\`, \`/home/moo/nltk_data\`, \`/home/moo/shorts-pilot\`, and \`/home/moo/tiny-apps\`. None was created or moved by this task.
`;
  await writeFile(`${outputDir}/G1_PACING.md`, document);
  console.log(gates.map(gate => `${gate.pass ? "PASS" : "FAIL"} ${gate.name}: ${gate.measured}`).join("\n"));
}

if (process.argv.includes("--report")) await writeReport();

if (!process.argv.includes("--self-test") && !process.argv.includes("--report")) {
  await mkdir(outputDir, { recursive: true });
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--use-angle=gl", "--enable-gpu", "--ignore-gpu-blocklist"] });
  try {
    if (process.argv.includes("--matrix")) {
      for (const config of [{ greed: 0.3, seed: 1, raids: 4 }, { greed: 0.5, seed: 2, raids: 4 }, { greed: 0.8, seed: 3, raids: 10 }]) await runCampaign(browser, { ts: 4, ...config });
    } else {
      const [raids = "4", ts = "4", greed = "0.5", seed = "1", lag = "0.25"] = process.argv.slice(2);
      await runCampaign(browser, { raids: +raids, ts: +ts, greed: +greed, seed: +seed, lag: +lag });
    }
  } finally { await browser.close(); }
}
