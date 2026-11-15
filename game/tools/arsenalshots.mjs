// Captures for the arsenal (two gun slots, 15 guns): the HUD bottom bar with two guns, the Tab screen with both gun
// slots and their attachment rows, and every gun in hand (close camera), all on the built game with real keys.
//   node tools/arsenalshots.mjs <outdir> [ids,...]     BASE=http://127.0.0.1:5359 (never 5318 or 5340)
// Every hand-out goes through the real pickup path (ui/devhooks.ts gun2 / rounds), so the settlement ledger stays whole.
import { chromium } from "playwright-core";
import fs from "node:fs";
const [OUT = "/tmp/bv-arsenal-shots", only = ""] = process.argv.slice(2);
const BASE = process.env.BASE ?? "http://127.0.0.1:5359";
if (["5318", "5340"].includes(new URL(BASE).port)) throw new Error("that port belongs to another server");
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--use-angle=gl", "--enable-gpu", "--ignore-gpu-blocklist"] });
const errs = [];
async function open(query, w = 1920, h = 1080) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(`${BASE}/game.html?fresh=1&raid=1&dev&peace=1&nofauna=1&${query}`);
  await p.waitForFunction(() => window.__g?.G?.scene === "raid" && window.__ui, null, { timeout: 90000 });
  await p.waitForTimeout(1500);
  await p.evaluate(() => { for (const c of [".h3-banner", ".h3-help"]) { const el = document.querySelector(c); if (el) el.style.display = "none"; } });
  return p;
}
const hero = (p) => p.evaluate(() => { const G = window.__g.G, v = G.pp.clone().setY(G.pp.y + 1).project(G.stage.camera); return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight]; });

// ---- the HUD with two guns, and the Tab screen with both slots
{
  const p = await open("");
  await p.evaluate(() => { const ui = window.__ui; ui.gun2("contraband_carbine"); ui.rounds("ammo_rifle", 45); window.__arsenal.switchTo(1); window.__g.G.drawT = 1; });
  await p.keyboard.press("r"); await p.waitForTimeout(3300);
  const [hx, hy] = await hero(p); await p.mouse.move(hx + 300, hy - 60); await p.waitForTimeout(600);
  await p.screenshot({ path: `${OUT}/hud_two_guns.png`, clip: { x: 560, y: 820, width: 800, height: 260 } });
  await p.screenshot({ path: `${OUT}/hud_full.png` });
  await p.keyboard.press("1"); await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/hud_two_guns_gun1.png`, clip: { x: 560, y: 820, width: 800, height: 260 } });
  // a sight and a grip on the carbine, the extended mag on the Kingpin, so both attachment rows show parts
  await p.evaluate(() => { const ui = window.__ui, G = window.__g.G; for (const id of ["att_sight_holo", "att_grip_steady", "att_mag_ext"]) ui.give?.(id) ?? G.pack.push(ui.own(id)); });
  await p.evaluate(() => { const G = window.__g.G, gs = window.__gunStats; for (const inst of [...G.pack]) { const t = window.__ui.itemType(inst); const k = t === "att_mag_ext" ? 0 : 1; const r = gs.fit(inst, k); if (r.ok) G.pack.splice(G.pack.indexOf(inst), 1); } window.__ui.hud.pack(); });
  await p.keyboard.press("Tab"); await p.waitForSelector(".lv"); await p.waitForTimeout(500);
  await p.mouse.click(...(await p.locator('.lv-me [data-src="gun:1"]').boundingBox().then((bb) => [bb.x + bb.width / 2, bb.y + bb.height / 2])));
  await p.mouse.move(960, 600); await p.waitForTimeout(300); // off the card, so its tooltip doesn't cover gun 1
  await p.screenshot({ path: `${OUT}/tab_both_slots.png` });
  await p.close();
}
// ---- every gun in hand, close camera; a long gun also aimed (ADS) and mid-reload
{
  const p = await open("dist=11&pitch=38", 1400, 900);
  const ids = await p.evaluate(() => Object.keys(window.__arsenal.defs()));
  for (const id of ids.filter((i) => !only || only.split(",").includes(i))) {
    const cal = await p.evaluate((id) => window.__arsenal.defs()[id].caliber, id);
    await p.evaluate(({ id, cal }) => { const ui = window.__ui, G = window.__g.G; if (id === "kingpin45") window.__arsenal.switchTo(0); else { ui.gun2(id); window.__arsenal.switchTo(1); } ui.rounds(cal, 20); G.drawT = 1; }, { id, cal });
    const [hx, hy] = await hero(p);
    await p.mouse.move(hx + 420, hy + 40); await p.waitForTimeout(900);
    const [cx, cy] = await hero(p);
    await p.screenshot({ path: `${OUT}/hand_${id}.png`, clip: { x: Math.max(0, cx - 260), y: Math.max(0, cy - 240), width: 520, height: 420 } });
    // three-quarter from behind the shoulder: aim up-screen, away from the camera
    await p.mouse.move(cx + 60, cy - 380); await p.waitForTimeout(700);
    await p.screenshot({ path: `${OUT}/hand_${id}_away.png`, clip: { x: Math.max(0, cx - 260), y: Math.max(0, cy - 300), width: 520, height: 420 } });
    // toward the camera (the stock and the off hand show from the front)
    await p.mouse.move(cx - 80, cy + 360); await p.waitForTimeout(700);
    await p.screenshot({ path: `${OUT}/hand_${id}_toward.png`, clip: { x: Math.max(0, cx - 260), y: Math.max(0, cy - 240), width: 520, height: 420 } });
    console.log("captured", id);
  }
  // mid-reload and fire poses for one long gun
  await p.evaluate(() => { const ui = window.__ui, G = window.__g.G; ui.gun2("contraband_carbine"); ui.rounds("ammo_rifle", 60); window.__arsenal.switchTo(1); G.drawT = 1; });
  const [hx, hy] = await hero(p); await p.mouse.move(hx + 420, hy + 40); await p.waitForTimeout(600);
  await p.keyboard.press("r"); await p.waitForTimeout(1300);
  const [cx, cy] = await hero(p);
  await p.screenshot({ path: `${OUT}/reload_contraband_carbine.png`, clip: { x: Math.max(0, cx - 260), y: Math.max(0, cy - 240), width: 520, height: 420 } });
  await p.close();
}
fs.writeFileSync(`${OUT}/errors.json`, JSON.stringify(errs, null, 1));
console.log(`done; ${errs.length} page errors`);
await b.close();
