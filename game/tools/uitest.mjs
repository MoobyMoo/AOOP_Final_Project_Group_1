// UI usability check (G1.5 row 24): the four first-time tasks, done with real mouse and keys on the built game, each
// timed and asserted. Setup (stocking the pack, opening a container) uses the ?dev hooks in src/game/ui/devhooks.ts
// because the world's E-opens-the-loot-screen wiring is the world worker's; every task step itself is real input.
//   1 equip a vest      Tab, double-click the vest in your pack, wait for the 1 s put-on
//   2 move loot          open a body, wait for the search reveal, drag an item into your pack, drag one back,
//                        then press "Take searched"
//   3 use a heal         Tab, double-click the bandage; also quick key 3 with the screen closed
//   4 what does it do    Tab, click the compass: the leather tag names it and says what it is for; hover a fact
//                        label for its tooltip
//   5 fit a sight       open a weapon crate, drag the scope onto the Kingpin's sight slot, read its stat lines on
//                        the tag, double-click the slot to take it off, double-click it in the pack to fit it again
// Also: Ctrl-drag splits an ammo stack, R sorts, Esc and E close, nothing overlaps at 1280x720.
// node tools/uitest.mjs [--headed]   BASE=http://127.0.0.1:5349 (never 5318 or 5340). Exit code 1 on any failure.
import { chromium } from "playwright-core";
const BASE = process.env.BASE ?? "http://127.0.0.1:5349";
if (["5318", "5340"].includes(new URL(BASE).port)) throw new Error("that port belongs to another server");
const SIZES = (process.env.SIZES ?? "1920x1080,1280x720").split(",").map((s) => s.split("x").map(Number));
const b = await chromium.launch({ executablePath: "/usr/bin/chromium", headless: !process.argv.includes("--headed"), args: ["--use-angle=gl", "--enable-gpu", "--ignore-gpu-blocklist"] });
const results = []; let failed = 0;

async function run(w, h) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(`${BASE}/game.html?raid&dev&fresh`);
  await p.waitForFunction(() => window.__ui && window.__G?.scene === "raid", null, { timeout: 90000 });
  await p.waitForTimeout(1500);
  const G = (fn, arg) => p.evaluate(fn, arg);
  const center = async (sel) => { const bb = await p.locator(sel).first().boundingBox(); if (!bb) throw new Error("not on screen: " + sel); return { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 }; };
  const dbl = async (sel) => { const c = await center(sel); await p.mouse.dblclick(c.x, c.y); };
  const click = async (sel) => { const c = await center(sel); await p.mouse.click(c.x, c.y); };
  const drag = async (from, to, ctrl = false) => {
    const a = await center(from), z = await center(to);
    if (ctrl) await p.keyboard.down("Control");
    await p.mouse.move(a.x, a.y); await p.mouse.down(); await p.mouse.move(a.x + 12, a.y + 8, { steps: 3 });
    await p.mouse.move(z.x, z.y, { steps: 12 }); await p.mouse.up();
    if (ctrl) await p.keyboard.up("Control");
  };
  const until = async (fn, arg, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await G(fn, arg)) return true; await p.waitForTimeout(50); } return false; };
  const task = async (name, f) => {
    const t0 = Date.now(); let ok = false, note = "";
    try { const r = await f(); ok = r !== false; if (typeof r === "string") note = r; } catch (e) { note = String(e.message ?? e).split("\n")[0]; }
    const s = ((Date.now() - t0) / 1000).toFixed(1); results.push({ size: `${w}x${h}`, task: name, ok, s, note }); if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${w}x${h}  ${name.padEnd(34)} ${s} s ${note}`);
    await closeAll();
  };
  // Esc with nothing open now opens the settings plate (ui/settings.ts) and pauses the raid, so only press it while the
  // loot screen or that plate is up
  const closeAll = async () => { for (let k = 0; k < 3 && (await p.locator(".lv, .set3").count()); k++) { await p.keyboard.press("Escape"); await p.waitForTimeout(250); } };
  const cell = (panel, name) => `.lv-${panel} button[aria-label="${name}"]`;

  // ---- 1 equip a vest
  await G(() => { const g = window.__G; g.pack.length = 0; g.pack.push("leaf_vest", "brass_compass", "bandage", "golden_banana"); window.__ui.hud.pack(); });
  await task("1 equip a vest (Tab, double-click)", async () => {
    await p.keyboard.press("Tab"); await p.waitForSelector(".lv");
    await dbl(cell("me", "Banana-Leaf Vest"));
    if (!(await until(() => (window.__G.gear.body ?? "").startsWith("leaf_vest"), null, 4000))) return false;
    return (await p.locator('.lv-me [data-src="slot:body"] img[alt="Banana-Leaf Vest"]').count()) === 1 || "slot not redrawn";
  });

  // ---- 2 move loot between panels
  await task("2 move loot (drag both ways, take all)", async () => {
    await G(() => window.__ui.body(["bandage", "brass_compass", "ammo45", "coconut", "peel_jacket#64"]));
    await p.waitForSelector(".lv-them .c3.unk");
    const unknownAtOpen = await p.locator(".lv-them .c3.unk").count();
    if (unknownAtOpen < 1) return "nothing was hidden at open";
    if (!(await p.locator(".lv-them .c3.scan .ring").count())) return "no search ring";
    if (!(await until(() => window.__ui.lootDebug().them[0] !== "?", null, 4000))) return "first item never revealed";
    const before = await G(() => window.__G.pack.length);
    await drag(cell("them", "Banana-Leaf Bandage"), '.lv-me [data-drop="pack:' + before + '"]');
    if (!(await until((n) => window.__G.pack.length === n + 1, before, 1500))) return "drag into pack failed";
    await drag(cell("me", "Golden Banana"), ".lv-them .lv-grid");
    if (!(await until(() => window.__ui.lootDebug().them.includes("golden_banana"), null, 1500))) return "drag into body failed";
    await until(() => !window.__ui.lootDebug().them.includes("?"), null, 9000);
    await click('.lv-them [data-act="takeall"]');
    return await until(() => window.__ui.lootDebug().them.length === 0 || window.__G.pack.length >= window.__G.packSlots, null, 2000) || "take searched left items";
  });

  // ---- Ctrl-drag splits an ammo stack
  await task("ctrl-drag splits a stack of rounds", async () => {
    await G(() => { const g = window.__G; g.pack.length = 0; window.__ui.crate("ammo"); });
    await until(() => !window.__ui.lootDebug().them.includes("?"), null, 6000);
    const a0 = await G(() => window.__G.ammo);
    await drag(cell("them", ".45 Rounds"), '.lv-me [data-drop="pack:0"]', true);
    const a1 = await G(() => window.__G.ammo);
    return (a1 - a0 === 4) || `took ${a1 - a0} rounds, expected 4 of 8`;
  });

  // ---- 3 use a heal
  await G(() => { const g = window.__G; g.pack.length = 0; g.pack.push("bandage", "bandage", "brass_compass"); g.hp = 50; window.__ui.hud.health(); window.__ui.hud.pack(); });
  await task("3 use a heal (Tab, double-click)", async () => {
    await p.keyboard.press("Tab"); await p.waitForSelector(".lv");
    await dbl(cell("me", "Banana-Leaf Bandage"));
    return await until(() => window.__G.hp > 50 && window.__G.pack.filter((i) => i === "bandage").length === 1, null, 3000);
  });
  await task("3b use a heal (quick key 3)", async () => {
    await closeAll(); await G(() => { window.__G.hp = 50; });
    const hint = await p.locator(".h3-quick .h3-q").first().innerText(); if (!hint.includes("3")) return "quick slot 3 has no key label";
    await p.keyboard.press("3");
    return await until(() => window.__G.hp > 50 && !window.__G.pack.includes("bandage"), null, 3000);
  });

  // ---- 4 find out what an item does
  await task("4 what does it do (click, read the tag)", async () => {
    await p.keyboard.press("Tab"); await p.waitForSelector(".lv");
    await click(cell("me", "Brass Compass"));
    const name = await p.locator(".lv-tagwrap h3").innerText(), blurb = await p.locator(".lv-tagwrap .blurb").innerText(), worth = await p.locator(".lv-tagwrap .facts").innerText();
    if (name !== "Brass Compass" || !blurb.length || !/Worth/.test(worth)) return `tag shows "${name}"`;
    const w = await center('.lv-tagwrap .facts [data-tip]'); await p.mouse.move(w.x, w.y); await p.waitForTimeout(200);
    return (await p.locator(".tip3.on").count()) === 1 || "no tooltip on the tag";
  });

  // ---- 5 fit a sight from a weapon crate (G1.5 row 36)
  await task("5 fit a sight (weapon crate, drag)", async () => {
    await G(() => { const g = window.__G; g.pack.length = 0; for (const k of Object.keys(g.save.gun)) window.__gunStats.unfit(k); window.__ui.hud.pack(); window.__ui.crate("weapon", ["att_sight_2x"]); });
    if (!(await until(() => window.__ui.lootDebug().them.includes("att_sight_2x"), null, 9000))) return "the scope was never revealed";
    const z0 = await G(() => window.__gunStats.GUN.adsDist);
    await drag('.lv-them button[aria-label="Lookout 2x Scope"]', '.lv-me [data-src="att:sight"]');
    if (!(await until(() => window.__G.save.gun.sight === "att_sight_2x", null, 1500))) return "dragging onto the sight slot did not fit it";
    const z1 = await G(() => window.__gunStats.GUN.adsDist);
    const lines = await p.locator(".lv-tagwrap .does.stats").innerText();
    if (!/Aim zoom \+72%/.test(lines)) return `tag lines: ${lines.replace(/\n/g, " | ")}`;
    if (!(await p.locator('.lv-me [data-src="att:sight"] img, .lv-me [data-src="att:sight"] .emo').count())) return "slot not redrawn";
    await dbl('.lv-me [data-src="att:sight"]');
    if (!(await until(() => window.__G.save.gun.sight === null && window.__G.pack.includes("att_sight_2x"), null, 1500))) return "double-clicking the slot did not take it off";
    await dbl(cell("me", "Lookout 2x Scope"));
    if (!(await until(() => window.__G.save.gun.sight === "att_sight_2x" && !window.__G.pack.includes("att_sight_2x"), null, 1500))) return "double-clicking it in the pack did not fit it";
    await drag('.lv-me [data-src="att:sight"]', '.lv-me .lv-grid');
    if (!(await until(() => window.__G.save.gun.sight === null && window.__G.pack.includes("att_sight_2x"), null, 1500))) return "dragging it off did not remove it";
    return `aim zoom x${z0.toFixed(2)} -> x${z1.toFixed(2)}; ${lines.replace(/\n/g, ", ")}`;
  });

  // ---- keys and layout
  await task("R sorts, E closes a target", async () => {
    await G(() => { const g = window.__G; g.pack.length = 0; g.pack.push("banana", "golden_banana"); });
    await p.keyboard.press("Tab"); await p.waitForSelector(".lv"); await p.keyboard.press("r");
    if (await G(() => window.__G.pack[0]) !== "golden_banana") return "sort did nothing";
    if (await G(() => window.__G.reloadT) >= 0) return "R also reloaded";
    await p.keyboard.press("Escape"); await G(() => window.__ui.crate("food")); await p.waitForSelector(".lv"); await p.keyboard.press("e");
    return (await p.locator(".lv").count()) === 0 || "E did not close";
  });
  await task("no overlap between panels and the tag", async () => {
    await G(() => window.__ui.body()); await until(() => window.__ui.lootDebug().them[0] !== "?", null, 4000); await click('.lv-them [data-src="them:0"]'); await p.waitForTimeout(200);
    const r = await G(() => { const q = (s) => document.querySelector(s).getBoundingClientRect(); const a = q(".lv-me"), t = q(".lv-tagwrap .tag3"), z = q(".lv-them"), k = q(".lv-keys span");
      return { ok: a.right <= t.left && t.right <= z.left && t.bottom <= k.top && z.bottom <= innerHeight && a.top >= 0, a: [a.left, a.right], t: [t.left, t.right, t.bottom], z: [z.left, z.right], k: k.top }; });
    return r.ok || JSON.stringify(r);
  });
  if (errs.length) { console.log("page errors:", errs.slice(0, 3)); failed++; }
  await p.close();
}
for (const [w, h] of SIZES) await run(w, h);
await b.close();
console.log(`\n${results.filter((r) => r.ok).length} of ${results.length} passed`);
process.exit(failed ? 1 : 0);
