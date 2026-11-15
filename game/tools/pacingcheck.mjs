import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const base = process.env.BASE ?? "http://127.0.0.1:5338";
assert.ok(!["5318", "5340"].includes(new URL(base).port), "use an isolated systems preview");
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--use-angle=gl", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", error => errors.push(String(error)));
async function load(peace = false) {
  await page.goto(`${base}/game.html?fresh=1&raid=1&dev=1&seed=1&post=0&dpr=1&fixdpr=1&ts=4${peace ? "&peace=1" : ""}`);
  await page.waitForFunction(() => window.__g?.G?.scene === "raid", null, { timeout: 90000 });
}
try {
  await load(true);
  await page.evaluate(() => {
    const { G, tp } = window.__g;
    G.pack = ["radio_key", "vine_key", "radio_key"];
    tp(0, 86);
  });
  await page.waitForFunction(() => window.__g.G.raidT > 1);
  await page.evaluate(() => window.__g.tp(-8, 102));
  await page.waitForFunction(() => window.__g.G.scene === "bunker", null, { timeout: 30000 });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("bv_g1")));
  assert.deepEqual(saved.keys.sort(), ["radio_key", "vine_key"]);
  assert.ok(!saved.reserved.some(item => item.endsWith("_key")));
  console.log("PASS actual hatch extraction persists every key once");

  await load();
  await page.evaluate(() => {
    const { G, tp, walkable } = window.__g;
    const crate = G.crates.find(crate => Math.hypot(crate.x, crate.z - 60) < 70 && !crate.fixed);
    crate.tier = "gold";
    const playerSpot = [1.3, -1.3].flatMap(x => [0, 1, -1].map(z => ({ x: crate.x + x, z: crate.z + z }))).find(point => walkable(point.x, point.z));
    tp(playerSpot.x, playerSpot.z);
    const guardSpot = Array.from({ length: 16 }, (_, index) => ({ x: crate.x + Math.cos(index * Math.PI / 8) * 8, z: crate.z + Math.sin(index * Math.PI / 8) * 8 })).find(point => walkable(point.x, point.z));
    const enemy = G.enemies.find(enemy => enemy.kind === "bandit");
    G.enemies = [enemy];
    enemy.p.set(guardSpot.x, 0, guardSpot.z); enemy.home.copy(enemy.p); enemy.vel.set(0, 0, 0); enemy.path = [];
    enemy.state = "patrol"; enemy.t = 1000; enemy.lastSeen = null; enemy.face = Math.atan2(enemy.p.x - G.pp.x, enemy.p.z - G.pp.z);
  });
  await page.keyboard.press("e");
  await page.waitForFunction(() => window.__g.G.enemies[0].state !== "patrol", null, { timeout: 5000 });
  console.log("PASS opening a reward crate alerts a nearby guard who is facing away");

  await load();
  await page.evaluate(() => {
    const { G, gates, setGate, tp } = window.__g;
    const door = gates.find(gate => gate.kind === "door" && !gate.locked);
    const enemy = G.enemies.find(enemy => enemy.kind === "bandit");
    G.enemies = [enemy];
    setGate(door.id, false);
    enemy.p.set(door.x - door.nx * 7, 0, door.z - door.nz * 7);
    tp(door.x + door.nx * 3, door.z + door.nz * 3);
    enemy.state = "chase"; enemy.lastSeen = G.pp.clone(); enemy.path = []; enemy.repath = 0;
    window.__testDoor = door.id;
  });
  await page.waitForFunction(() => window.__g.gates.find(gate => gate.id === window.__testDoor).open, null, { timeout: 15000 });
  console.log("PASS pursuing enemy opens an ordinary closed door");

  await load();
  await page.evaluate(() => {
    const { G, gates, setGate, tp } = window.__g;
    const door = gates.find(gate => gate.id === "radio:radio_door");
    const enemy = G.enemies.find(enemy => enemy.kind === "bandit");
    G.enemies = [enemy]; G.pack = [];
    setGate(door.id, false);
    enemy.p.set(door.x - door.nx * 1.3, 0, door.z - door.nz * 1.3);
    tp(door.x + door.nx * 1.3, door.z + door.nz * 1.3);
    enemy.state = "chase"; enemy.lastSeen = G.pp.clone(); enemy.path = []; enemy.repath = 0;
    window.__testStarted = G.raidT;
  });
  await page.waitForFunction(() => window.__g.G.raidT - window.__testStarted > 2);
  assert.deepEqual(await page.evaluate(() => ({ open: window.__g.gates.find(gate => gate.id === "radio:radio_door").open, hp: window.__g.G.hp })), { open: false, hp: 100 });
  console.log("PASS enemies respect locked doors and cannot swipe through them");

  await load(true);
  await page.evaluate(() => {
    const saved = { ...window.__g.G.save, raids: 2, lookDone: true };
    localStorage.setItem("bv_g1", JSON.stringify(saved));
  });
  await page.goto(`${base}/game.html?raid=1&bot=1&peace=1&greed=0.8&seed=3&post=0&dpr=1&fixdpr=1&ts=4`);
  await page.waitForFunction(() => window.__g?.G?.scene === "raid", null, { timeout: 90000 });
  await page.evaluate(() => { for (const crate of window.__g.G.crates) crate.opened = true; });
  const progress = setInterval(async () => {
    console.log("tunnel progress", await page.evaluate(() => ({ at: window.__g.G.pp, t: window.__g.G.raidT, scene: window.__g.G.scene, rubbleOpen: window.__g.gates.find(gate => gate.id === "grotto-rubble").open, events: window.__bot.events.slice(-2) })));
  }, 15000);
  try {
    await page.waitForFunction(() => window.__raids?.some(raid => raid.how === "tunnel"), null, { timeout: 120000 });
  } catch (error) {
    console.log(await page.evaluate(() => ({ scene: window.__g.G.scene, at: window.__g.G.pp, t: window.__g.G.raidT, intent: window.__g.G.intent, rubble: window.__g.gates.find(gate => gate.id === "grotto-rubble"), raids: window.__raids, events: window.__bot.events.slice(-8) })));
    throw error;
  } finally {
    clearInterval(progress);
  }
  assert.ok(await page.evaluate(() => window.__g.G.save.fixtures.includes("open:grotto-rubble")));
  console.log("PASS bot routes through a portal, breaks rubble and uses the real tunnel exit; unlocked fixture persists");

  await load(true);
  await page.goto(`${base}/game.html?raid=1&bot=1&peace=1&greed=0.8&seed=3&post=0&dpr=1&fixdpr=1&ts=4`);
  await page.waitForFunction(() => window.__g?.G?.scene === "raid", null, { timeout: 90000 });
  await page.evaluate(() => {
    const { G, gates, setGate, tp } = window.__g;
    const door = gates.find(gate => gate.id === "cellblock:cell2");
    if (!door) throw new Error("evidence cell door missing");
    setGate(door.id, false);
    tp(71.5, -6.3);
    G.raidT = 421;
  });
  await page.waitForFunction(() => window.__g.gates.find(gate => gate.id === "cellblock:cell2").open, null, { timeout: 20000 });
  await page.waitForFunction(() => Math.hypot(window.__g.G.pp.x - 71.5, window.__g.G.pp.z + 6.3) > 6, null, { timeout: 20000 });
  console.log("PASS extraction bot opens the closed evidence cell and leaves the room");
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
