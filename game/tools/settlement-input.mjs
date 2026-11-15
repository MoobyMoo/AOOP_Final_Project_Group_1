import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";

const base = process.env.BASE ?? "http://127.0.0.1:5353";
const out = process.env.SETTLEMENT_OUT ?? "/tmp/bv-settlement-input";
assert.ok(["5352", "5353", "5354", "5355", "5356", "5357", "5358", "5359"].includes(new URL(base).port));
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--use-angle=gl", "--enable-gpu", "--ignore-gpu-blocklist"] });
const report = { actions: [], ledgers: [], errors: [] };
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
page.on("pageerror", error => report.errors.push(String(error)));
const state = () => page.evaluate(() => {
  const game = window.__g.G;
  return { scene: game.scene, alive: game.alive, x: game.pp.x, z: game.pp.z, hp: game.hp, pack: [...game.pack], extract: { ...game.extract }, save: structuredClone(game.save), pickups: game.pickups.map(pickup => ({ item: pickup.item, x: pickup.p.x, z: pickup.p.z })) };
});
async function action(label, run) { await run(); report.actions.push(label); console.log(label); assert.deepEqual(report.errors, []); }
async function moveTo(x, z, tolerance = 0.65) {
  for (let step = 0; step < 900; step++) {
    const next = await page.evaluate(({ x, z, tolerance }) => {
      const { G: game, path } = window.__g;
      if (game.scene !== "raid" || !game.alive) return { ended: true };
      if (Math.hypot(game.pp.x - x, game.pp.z - z) < tolerance) return { arrived: true };
      const route = path(game.pp.x, game.pp.z, x, z);
      const point = route.find(point => Math.hypot(point.x - game.pp.x, point.z - game.pp.z) > 0.65) ?? { x, z };
      const dx = point.x - game.pp.x, dz = point.z - game.pp.z, yaw = game.stage.cam.yaw;
      return { mx: dx * Math.cos(yaw) - dz * Math.sin(yaw), mz: dx * Math.sin(yaw) + dz * Math.cos(yaw), route: route.length };
    }, { x, z, tolerance });
    if (next.arrived) return;
    assert.ok(!next.ended, `raid ended while walking to ${x},${z}`);
    const keys = [];
    if (Math.abs(next.mx) > Math.abs(next.mz) * 0.4) keys.push(next.mx > 0 ? "d" : "a");
    if (Math.abs(next.mz) > Math.abs(next.mx) * 0.4) keys.push(next.mz > 0 ? "s" : "w");
    for (const key of keys) await page.keyboard.down(key);
    await page.waitForTimeout(65);
    for (const key of keys) await page.keyboard.up(key);
    if (report.errors.length) throw new Error(report.errors.join("\n"));
  }
  throw new Error(`walking timed out at ${JSON.stringify(await state())}`);
}
function ledger(record) {
  const ids = items => items.map(inst => inst.split("@")[1]).sort();
  assert.deepEqual(ids(record.before), ids([...record.after, ...record.consumed, ...record.abandoned]));
  assert.equal(new Set(ids(record.before)).size, record.before.length);
  assert.equal(record.rounds.before, record.rounds.after + record.rounds.spent + record.rounds.abandoned);
  report.ledgers.push({ id: record.id, reason: record.reason, before: record.before.length, after: record.after.length, consumed: record.consumed.length, abandoned: record.abandoned.length, missing: [], duplicates: [], rounds: record.rounds });
}
async function hatch() {
  await moveTo(-2.5, 93);
  await moveTo(-8, 102, 1);
  await page.waitForFunction(() => window.__g.G.extract.t > 0);
  await page.keyboard.press("Tab");
  await page.waitForFunction(() => window.__g.G.scene === "bunker", { timeout: 30000 });
  assert.equal(await page.locator(".lv").count(), 0);
  ledger((await state()).save.settlements.at(-1));
}
try {
  await page.goto(`${base}/game.html?raid&peace&fresh&post=0&dpr=1&fixdpr=1&ts=2`);
  await page.waitForFunction(() => window.__g?.G.save.activeRaid);
  const oar = (await state()).pickups.find(pickup => pickup.item.startsWith("oar@"));
  assert.ok(oar);
  await action("Walk to the oar and loot with E", async () => {
    await moveTo(oar.x, oar.z); await page.keyboard.press("e");
    await page.waitForFunction(item => window.__g.G.pack.includes(item), oar.item);
  });
  await action("Drop the owned oar through the inventory", async () => {
    await page.keyboard.press("Tab");
    await page.locator('[data-src="pack:0"]').click();
    await page.locator('[data-act="drop"]').click();
    await page.keyboard.press("Escape"); await page.waitForTimeout(1800);
    assert.ok(!(await state()).pack.includes(oar.item));
  });
  await action("Retake the same item identity from the ground", async () => {
    const dropped = (await state()).pickups.find(pickup => pickup.item === oar.item); assert.ok(dropped);
    await moveTo(dropped.x, dropped.z); await page.keyboard.press("e");
    await page.waitForFunction(item => window.__g.G.pack.includes(item), oar.item);
  });
  await action("Extract through the hatch with inventory open", hatch);
  assert.ok((await state()).save.reserved.includes(oar.item));
  await page.screenshot({ path: `${out}/hatch.png` });
  await context.clearCookies();
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("settlement-death-fixture")) {
      localStorage.setItem("bv_g1", JSON.stringify({ v: 1, lookDone: true, reserved: ["firstaid", "smoothie", "bandage"], gun: { mag: "att_mag_ext" } }));
      sessionStorage.setItem("settlement-death-fixture", "1");
    }
  });
  await action("Take a loaded kit into a live boomerang encounter", async () => {
    await page.goto(`${base}/game.html?raid&at=8,68&post=0&dpr=1&fixdpr=1&ts=4`);
    await page.waitForFunction(() => window.__g?.G.save.activeRaid);
    assert.equal((await state()).pack.length, 3);
    await page.waitForFunction(() => window.__g.G.scene === "bunker", null, { timeout: 120000 });
    ledger((await state()).save.settlements.at(-1));
  });
  const corpse = (await state()).save.satchel; assert.ok(corpse?.items.some(inst => inst.startsWith("att_mag_ext@")));
  await action("Redeploy, walk to the satchel and recover with real loot clicks", async () => {
    await page.goto(`${base}/game.html?raid&peace&post=0&dpr=1&fixdpr=1&ts=2`);
    await page.waitForFunction(() => window.__g?.G.save.activeRaid);
    await moveTo(corpse.x, corpse.z, 1.3); await page.keyboard.press("e");
    await page.waitForTimeout(3500);
    await page.locator('[data-act="takeall"]').click();
    for (const item of corpse.items) assert.ok((await state()).pack.includes(item), `recovered ${item}`);
    await page.keyboard.press("Escape");
  });
  await action("Extract the recovered instances through the hatch", hatch);
  const final = await state();
  for (const item of corpse.items) assert.ok([...final.save.reserved, ...final.save.locker].includes(item));
  assert.equal(final.save.satchel, null);
  await page.screenshot({ path: `${out}/recovered.png` });
  report.complete = true;
} catch (error) {
  report.failure = String(error); report.state = await state().catch(() => null);
  await page.screenshot({ path: `${out}/failure.png` });
  throw error;
} finally {
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2) + "\n");
  await browser.close();
}
