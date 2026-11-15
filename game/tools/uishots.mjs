// UI v4 captures (G1.5 rows 49-50): every screen at 1920x1080 and 1280x720 through the ?dev hooks, the same steps
// before and after a change so the pairs compare. Writes <out>/<size>/<name>.jpg.
//   raid   hud, hud mid-reload (the ring), Tab, a body being looted, settings (Esc), the M map: surface, the map with
//          pins and a marker, zoomed in, and underground (the player stood in the grotto: the map shows that floor)
//   vault  the Banana Express board, the Fence, the workbench, Sal (NPC dialogue), the radio desk (NPC), the job log,
//          the payout slip
//   new    the creator
// node tools/uishots.mjs <out> [only=raid,vault,new]   BASE=http://127.0.0.1:5356 (never 5318 or 5340)
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
const [OUT = "/tmp/bv-ui4/shots", only = "raid,vault,new"] = process.argv.slice(2);
const BASE = process.env.BASE ?? "http://127.0.0.1:5356";
if (["5318", "5340"].includes(new URL(BASE).port)) throw new Error("that port belongs to another server");
const SIZES = (process.env.SIZES ?? "1920x1080,1280x720").split(",").map((s) => s.split("x").map(Number));
const parts = only.split(",");
const b = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--use-angle=gl", "--enable-gpu", "--ignore-gpu-blocklist"] });
const errs = [];

for (const [w, h] of SIZES) {
  const dir = `${OUT}/${w}x${h}`; mkdirSync(dir, { recursive: true });
  const p = await b.newPage({ viewport: { width: w, height: h } });
  p.on("pageerror", (e) => errs.push(String(e)));
  const G = (fn, arg) => p.evaluate(fn, arg);
  const shot = async (name, wait = 450) => { await p.waitForTimeout(wait); await p.screenshot({ path: `${dir}/${name}.jpg`, quality: 88 }); console.log(`${w}x${h} ${name}`); };
  const esc = async () => { for (let k = 0; k < 3 && (await p.locator(".lv, .set3, .mv3, .panel").count()); k++) { await p.keyboard.press("Escape"); await p.waitForTimeout(250); } };

  if (parts.includes("raid")) {
    await p.goto(`${BASE}/game.html?raid&dev&fresh&peace=1`);
    await p.waitForFunction(() => window.__ui && window.__G?.scene === "raid", null, { timeout: 120000 });
    await p.waitForTimeout(2500); await p.mouse.move(w * 0.62, h * 0.42);
    await G(() => { const g = window.__G; window.__ui.clearPack(); g.pack.push(...["leaf_vest", "brass_compass", "bandage", "bandage", "golden_banana", "honey_pot"].map(window.__ui.own)); g.hp = 72; window.__ui.hud.health(); window.__ui.hud.pack(); });
    await shot("01-hud", 1200);
    // reload: empty most of the mag, R, capture partway (the ring at the crosshair)
    await G(() => { const g = window.__G; g.mag = 2; window.__ui.rounds?.("ammo45", 30); });
    await p.keyboard.press("r");
    await p.waitForFunction(() => window.__G.reloadT > 0.35, null, { timeout: 5000 }).catch(() => {});
    await p.screenshot({ path: `${dir}/02-reload-ring.jpg`, quality: 92 }); console.log(`${w}x${h} 02-reload-ring`);
    await p.waitForTimeout(2500);
    // a heal in progress (the same ring)
    await G(() => { window.__G.hp = 50; });
    await p.keyboard.press("3"); await p.waitForTimeout(450); await p.screenshot({ path: `${dir}/03-heal-ring.jpg`, quality: 92 }); console.log(`${w}x${h} 03-heal-ring`);
    await p.waitForTimeout(3000);
    await p.keyboard.press("Tab"); await p.waitForSelector(".lv"); await shot("04-tab", 600); await esc();
    await G(() => window.__ui.body()); await p.waitForSelector(".lv"); await shot("05-loot-searching", 700);
    await p.waitForTimeout(4500); await shot("06-loot-revealed", 200);
    const cell = await p.locator(".lv-them button[aria-label]").first().boundingBox().catch(() => null);
    if (cell) { await p.mouse.move(cell.x + cell.width / 2, cell.y + cell.height / 2); await shot("07-loot-tag", 500); }
    await esc();
    await p.keyboard.press("Escape"); await p.waitForSelector(".set3", { timeout: 3000 }).catch(() => {}); await shot("08-settings"); await esc();
    // the map: surface
    await p.keyboard.press("m"); await p.waitForSelector(".mv3"); await shot("10-map-surface", 900);
    // pins: right-click (v5) or click (v4) on three spots, the markers bar's second icon / colour when it exists
    const view = await p.locator(".mv3-view").boundingBox();
    if (view) {
      const pick = await p.locator(".mv3-mk-icons button").nth(3).count(); if (pick) await p.locator(".mv3-mk-icons button").nth(3).click();
      const sw = await p.locator(".mv3-mk-cols button").nth(2).count(); if (sw) await p.locator(".mv3-mk-cols button").nth(2).click();
      const v5 = !!(await p.locator(".mv3-mk").count());
      for (const [fx, fy] of [[0.42, 0.42], [0.55, 0.58], [0.62, 0.36]]) await p.mouse.click(view.x + view.width * fx, view.y + view.height * fy, { button: v5 ? "right" : "left" });
      await shot("11-map-pins", 500);
      await p.mouse.move(view.x + view.width * 0.5, view.y + view.height * 0.5);
      for (let k = 0; k < 6; k++) { await p.mouse.wheel(0, -120); await p.waitForTimeout(60); }
      await shot("12-map-zoom", 600);
      // undo the pins (the next size starts clean)
      await G(() => localStorage.removeItem("bv_pins"));
    }
    await p.keyboard.press("m"); await p.waitForTimeout(300);
    // underground: stand in the grotto and open the map (it shows the floor you are on)
    await G(() => { window.__g.tp(168, 26); }); await p.waitForTimeout(1500);
    await p.keyboard.press("m"); await p.waitForSelector(".mv3"); await shot("13-map-under", 900);
    await p.keyboard.press("m"); await p.waitForTimeout(300);
    await G(() => { window.__g.tp(-4, 99); }); await p.waitForTimeout(1500);
    await shot("14-hud-minimap", 300);
  }

  if (parts.includes("vault")) {
    await p.goto(`${BASE}/game.html?dev&fresh`); await p.waitForFunction(() => window.__G?.save, null, { timeout: 120000 });
    await G(() => { const s = window.__G.save; localStorage.setItem("bv_g1", JSON.stringify({ ...s, lookDone: true, money: 320, salMovedIn: true, raids: 4, reserved: ["banana", "coconut", "vine_rope", "honey_pot", "golden_banana", "brass_compass"],
      base: { v: 1, next: 5, tokens: {}, items: [{ uid: 1, def: "fence", x: -13, z: -12, r: 0 }, { uid: 2, def: "bench", x: 6, z: -12, r: 0 }, { uid: 3, def: "sal", x: 10, z: -12, r: 0 }, { uid: 4, def: "radio", x: -9, z: -6, r: 1 }] },
      quests: { ...s.quests, intro: true, done: ["sal_roadmap", "sal_office", "sal_supplies", "radio_static"], active: ["sal_payroll"], tracked: "sal_payroll", unlocks: ["dest:plantation", "flag:salMovedIn", "fac:radio", "stock:firstaid"], notes: ["note_guard_log"], seen: [] } })); });
    await p.goto(`${BASE}/game.html?dev`); await p.waitForFunction(() => window.__G?.scene === "bunker" && window.__g?.home, null, { timeout: 120000 });
    await p.waitForTimeout(1800);
    await shot("20-vault-hud");
    for (const [id, name] of [["deploy", "21-banana-express"], ["sell", "22-fence"], ["bench", "23-bench"], ["sal", "24-npc-sal"], ["radio", "25-npc-radio"]]) {
      await G((id) => window.__g.home.open(id), id); await p.waitForSelector(".panel"); await shot(name, 500); await esc(); await p.waitForTimeout(200);
    }
    await p.keyboard.press("Tab"); await p.waitForSelector(".panel.qlog").catch(() => {}); await shot("26-job-log"); await esc();
    await G(() => window.__ui.slip()); await p.waitForSelector(".panel.result"); await shot("27-payout-slip", 700); await esc();
  }

  if (parts.includes("new")) {
    await p.goto(`${BASE}/game.html?dev&fresh`); await p.waitForSelector('button[data-go="1"]', { timeout: 120000 }); await shot("30-creator", 1500);
    const cv = await p.locator("canvas").first().boundingBox();
    if (cv) { await p.mouse.move(w * 0.42, h * 0.5); await p.mouse.down(); await p.mouse.move(w * 0.52, h * 0.5, { steps: 10 }); await p.mouse.up(); await shot("31-creator-turned", 500); }
  }
  await p.close();
}
if (errs.length) console.log("ERRORS:", [...new Set(errs)].slice(0, 12).join("\n"));
await b.close();
