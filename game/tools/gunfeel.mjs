// Gun-handling checks (scatter, recoil, ADS, ?tune, the Esc settings plate): real mouse and keys on the built game,
// numbers read from the page (combat/handling.ts __gun, core/raid.ts __cam, core/tune.ts __tune), crops saved.
//   node tools/gunfeel.mjs <outdir> [scenario,...]     BASE=http://127.0.0.1:5356 (never 5318 or 5340)
// scenarios: burst rest kick ads tune menu
import { chromium } from "playwright-core";
import fs from "node:fs";
const [OUT = "/tmp/bv-gun-shots", only = ""] = process.argv.slice(2);
const BASE = process.env.BASE ?? "http://127.0.0.1:5356";
if (["5318", "5340"].includes(new URL(BASE).port)) throw new Error("that port belongs to another server");
fs.mkdirSync(OUT, { recursive: true });
const want = (s) => !only || only.split(",").includes(s);
const W = 1600, H = 900;
const b = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--use-angle=gl", "--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const log = {};
const r2 = (v) => Math.round(v * 100) / 100;

async function open(query) {
  const ctx = await b.newContext({ viewport: { width: W, height: H } });
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", (e) => errs.push(String(e))); p.on("dialog", (d) => d.accept(p.nextPrompt ?? undefined));
  await p.goto(`${BASE}/game.html?fresh=1&raid=1&dev&${query}`);
  await p.waitForFunction(() => window.__g?.G?.scene === "raid", null, { timeout: 90000 });
  await p.waitForTimeout(1500);
  await p.evaluate(() => { for (const c of [".h3-banner", ".h3-help"]) { const el = document.querySelector(c); if (el) el.style.display = "none"; } });
  p.errs = errs; p.ctx = ctx; return p;
}
/** hero on screen (CSS px) */
const hero = (p) => p.evaluate(() => { const G = window.__g.G, v = G.pp.clone().setY(G.pp.y + 1).project(G.stage.camera); return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight]; });
/** start a per-frame recorder of the handling state and the crosshair */
const record = (p) => p.evaluate(() => {
  window.__rec = []; window.__recOn = true; const G = window.__g.G;
  const f = () => {
    const g = window.__gun, c = document.querySelector(".h3-cross"), m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(c?.style.transform || "");
    window.__rec.push({ t: +G.raidT.toFixed(4), sc: +g.currentScatter().toFixed(3), base: +g.HS.scatter.toFixed(3), mv: +g.HS.move.toFixed(3), ads: +g.HS.ads.toFixed(3), rx: +g.HS.rx.toFixed(2), ry: +g.HS.ry.toFixed(2),
      shots: g.HS.shots, mag: G.mag, cx: m ? +m[1] : null, cy: m ? +m[2] : null, gap: parseFloat(c?.style.getPropertyValue("--spread") || "0"), speed: +Math.hypot(G.vel.x, G.vel.z).toFixed(2), sprint: G.sprinting });
    if (window.__recOn) requestAnimationFrame(f);
  }; requestAnimationFrame(f);
});
const stop = (p) => p.evaluate(() => { window.__recOn = false; return window.__rec; });
async function crop(p, name, x, y, w = 260, h = 260) { const f = `${OUT}/${name}.png`; await p.screenshot({ path: f, clip: { x: Math.max(0, Math.min(W - w, x - w / 2)), y: Math.max(0, Math.min(H - h, y - h / 2)), width: w, height: h } }); return f; }

if (want("burst")) { // scatter grows over a 6-shot burst, then recovers
  const p = await open("peace=1&ts=0.5");
  const [hx, hy] = await hero(p); const ax = hx + 260, ay = hy - 40;
  await p.mouse.move(ax, ay); await p.waitForTimeout(800);
  await crop(p, "burst_0_rest", ax, ay);
  await record(p); await p.waitForTimeout(300);
  await p.mouse.down();
  await p.waitForFunction(() => window.__gun.HS.shots >= 6, null, { timeout: 15000 });
  await p.mouse.up(); await crop(p, "burst_1_after6", ax, ay);
  await p.waitForTimeout(500); await crop(p, "burst_2_recovering", ax, ay);
  await p.waitForTimeout(2500); await crop(p, "burst_3_recovered", ax, ay);
  const rec = await stop(p);
  const shots = []; for (let i = 1; i < rec.length; i++) if (rec[i].shots > rec[i - 1].shots) shots.push({ shot: rec[i].shots, t: rec[i].t, coneUsed: rec[i - 1].sc, after: rec[i].sc, gapPx: rec[i].gap });
  const last = shots[shots.length - 1], rest = rec[0].sc;
  const back = rec.find((q) => q.t > last.t && q.sc <= rest + 0.05);
  const peak = Math.max(...rec.map((q) => q.sc));
  log.burst = { restDeg: rest, perShot: shots, peakDeg: peak, recoveredToRestAfterS: back ? r2(back.t - last.t) : null, gapRestPx: rec[0].gap, gapPeakPx: Math.max(...rec.map((q) => q.gap)), errs: p.errs };
  fs.writeFileSync(`${OUT}/burst_series.json`, JSON.stringify(rec));
  await p.ctx.close();
}

if (want("rest")) { // resting cone standing vs walking vs sprinting, hip and ADS
  const p = await open("peace=1");
  const [hx, hy] = await hero(p); await p.mouse.move(hx + 240, hy - 30); await p.waitForTimeout(600);
  const read = () => p.evaluate(() => { const g = window.__gun, G = window.__g.G; return { sc: +g.currentScatter().toFixed(2), move: +g.HS.move.toFixed(2), ads: +g.HS.ads.toFixed(2), speed: +Math.hypot(G.vel.x, G.vel.z).toFixed(2), sprint: G.sprinting, gap: parseFloat(document.querySelector(".h3-cross").style.getPropertyValue("--spread")) }; });
  const out = {};
  out.standHip = await read();
  const cx = (await hero(p))[0], cy = (await hero(p))[1];
  await p.keyboard.down("d"); await p.waitForTimeout(700); out.walkHip = await read();
  await crop(p, "rest_walk_hip", ...(await p.evaluate(() => { const c = document.querySelector(".h3-cross"); const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(c.style.transform); return [+m[1], +m[2]]; })));
  await p.keyboard.down("Shift"); await p.waitForTimeout(700); out.sprintHip = await read();
  await p.keyboard.up("Shift"); await p.keyboard.up("d"); await p.waitForTimeout(900); out.standAgain = await read();
  void cx; void cy;
  await p.mouse.down({ button: "right" }); await p.waitForTimeout(800); out.standAds = await read();
  await p.keyboard.down("a"); await p.waitForTimeout(700); out.walkAds = await read(); await p.keyboard.up("a");
  await p.mouse.up({ button: "right" }); await p.waitForTimeout(600);
  log.rest = { ...out, errs: p.errs };
  await p.ctx.close();
}

if (want("kick")) { // the crosshair kicks with each shot and settles back to the cursor
  const p = await open("peace=1&ts=0.25");
  const [hx, hy] = await hero(p); const ax = hx + 260, ay = hy - 80;
  await p.mouse.move(ax, ay); await p.waitForTimeout(800);
  await record(p); await p.waitForTimeout(300);
  const frames = [];
  for (let s = 0; s < 3; s++) {
    await p.mouse.down(); await p.waitForTimeout(30); await p.mouse.up();
    if (s === 0) for (let i = 0; i < 8; i++) { frames.push(await crop(p, `kick_${String(i).padStart(2, "0")}`, ax, ay, 200, 200)); await p.waitForTimeout(25); }
    await p.waitForTimeout(1600);
  }
  const rec = await stop(p);
  const base = rec[0], per = [];
  for (let i = 1; i < rec.length; i++) if (rec[i].shots > rec[i - 1].shots) {
    // d: crosshair to the (fixed) cursor on screen; r: the recoil offset itself
    const after = rec.slice(i).filter((q) => q.t - rec[i].t < 0.6), off = after.map((q) => ({ t: q.t - rec[i].t, d: Math.hypot(q.cx - ax, q.cy - ay), r: Math.hypot(q.rx, q.ry) }));
    const pk = off.reduce((a, q) => (q.r > a.r ? q : a), off[0]); const settle = off.find((q) => q.t > pk.t && q.r < 0.5);
    per.push({ shot: rec[i].shots, peakPx: r2(pk.r), crossToCursorAtPeakPx: r2(pk.d), peakAtS: r2(pk.t), settledAtS: settle ? r2(settle.t) : null, crossToCursorSettledPx: settle ? r2(settle.d) : null });
  }
  log.kick = { cursor: [r2(ax), r2(ay)], crossAtRest: [base.cx, base.cy], perShot: per, frames: frames.length, windowH: H, errs: p.errs };
  fs.writeFileSync(`${OUT}/kick_series.json`, JSON.stringify(rec));
  await p.ctx.close();
}

if (want("ads")) { // ADS pushes the camera and zooms; measured from the focus lead and the FOV
  const p = await open("peace=1");
  const [hx, hy] = await hero(p); const ax = hx + 300, ay = hy - 120;
  await p.mouse.move(ax, ay); await p.waitForTimeout(1000); await p.mouse.move(ax - 1, ay); await p.waitForTimeout(800);
  const read = () => p.evaluate(() => { const G = window.__g.G, c = window.__cam; const v = G.pp.clone().setY(G.pp.y + 1).project(G.stage.camera); return { lead: +c.lead.length().toFixed(3), focusFromHero: +Math.hypot(c.focus.x - G.pp.x, c.focus.z - G.pp.z).toFixed(3), aimDist: +Math.hypot(G.aimPoint.x - G.pp.x, G.aimPoint.z - G.pp.z).toFixed(2), fov: +G.stage.camera.fov.toFixed(3), ads: +window.__gun.HS.ads.toFixed(2), heroScreen: [Math.round((v.x * 0.5 + 0.5) * innerWidth), Math.round((-v.y * 0.5 + 0.5) * innerHeight)], scatter: +window.__gun.currentScatter().toFixed(2) }; });
  await p.mouse.move(ax + 1, ay); await p.mouse.move(ax, ay); await p.waitForTimeout(100);
  const hip = await read(); await p.screenshot({ path: `${OUT}/ads_0_hip.png` });
  await crop(p, "ads_cross_hip", ax, ay, 220, 220);
  await p.mouse.down({ button: "right" });
  const ramp = []; for (let i = 0; i < 8; i++) { ramp.push(await p.evaluate(() => [+window.__g.G.raidT.toFixed(2), +window.__gun.HS.ads.toFixed(2)])); await p.waitForTimeout(50); }
  await p.waitForTimeout(1500);
  const ads = await read(); await p.screenshot({ path: `${OUT}/ads_1_aimed.png` });
  const cross = await p.evaluate(() => { const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(document.querySelector(".h3-cross").style.transform); return [+m[1], +m[2]]; });
  await crop(p, "ads_cross_aimed", cross[0], cross[1], 220, 220);
  await p.mouse.down(); await p.waitForTimeout(20); await p.mouse.up(); await p.waitForTimeout(60);
  await crop(p, "ads_cross_shot", cross[0], cross[1], 220, 220);
  await p.mouse.up({ button: "right" }); await p.mouse.move(ax + 1, ay); await p.waitForTimeout(1200); await p.mouse.move(ax, ay); await p.waitForTimeout(100);
  const back = await read();
  log.ads = { hip, ads, released: back, pushU: r2(ads.lead - hip.lead), fovScale: r2(ads.fov / hip.fov), heroShiftPx: [ads.heroScreen[0] - hip.heroScreen[0], ads.heroScreen[1] - hip.heroScreen[1]], ramp, errs: p.errs };
  await p.ctx.close();
}

if (want("tune")) { // ?tune panel: a slider change applies live, persists, and reset restores it
  const p = await open("peace=1&tune");
  const [hx, hy] = await hero(p); await p.mouse.move(hx + 240, hy - 40); await p.waitForTimeout(500);
  const before = await p.evaluate(() => ({ rest: window.__tune.get("gun", "rest"), sc: window.__gun.currentScatter(), gap: parseFloat(document.querySelector(".h3-cross").style.getPropertyValue("--spread")), groups: window.__tune.groups() }));
  // through the panel UI: open the "gun" folder and type 14 into its first number box
  await p.locator(".lil-gui.bv-tune > .children > .lil-gui > .title", { hasText: /^gun$/ }).click();
  const box = p.locator(".lil-gui.bv-tune .lil-gui", { has: p.locator(".title", { hasText: /^gun$/ }) }).locator(".controller.number input").first();
  await box.fill("14"); await box.press("Enter"); await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/tune_panel.png`, clip: { x: W - 420, y: 0, width: 420, height: 620 } });
  const after = await p.evaluate(() => ({ rest: window.__tune.get("gun", "rest"), sc: window.__gun.currentScatter(), gap: parseFloat(document.querySelector(".h3-cross").style.getPropertyValue("--spread")), stored: localStorage.getItem("bv_tune") }));
  await crop(p, "tune_cross_after", ...(await p.evaluate(() => { const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(document.querySelector(".h3-cross").style.transform); return [+m[1], +m[2]]; })));
  // a camera value through the API, read back from the camera
  const cam = await p.evaluate(async () => { const d0 = window.__g.G.stage.camera.position.distanceTo(window.__g.G.stage.focus); window.__tune.set("camera", "dist", 30); await new Promise((r) => setTimeout(r, 300)); const d1 = window.__g.G.stage.camera.position.distanceTo(window.__g.G.stage.focus); window.__tune.reset("camera"); return { before: +d0.toFixed(2), after: +d1.toFixed(2) }; });
  const exported = await p.evaluate(() => window.__tune.export());
  await p.reload(); await p.waitForFunction(() => window.__g?.G?.scene === "raid", null, { timeout: 90000 }); await p.waitForTimeout(800);
  const reloaded = await p.evaluate(() => ({ rest: window.__tune.get("gun", "rest") }));
  await p.evaluate(() => window.__tune.reset("gun")); await p.waitForTimeout(300);
  const reset = await p.evaluate(() => ({ rest: window.__tune.get("gun", "rest"), stored: localStorage.getItem("bv_tune"), sc: window.__gun.currentScatter() }));
  const imported = await p.evaluate((j) => { const n = window.__tune.import(j); const v = window.__tune.get("gun", "rest"); window.__tune.reset("gun"); return { n, rest: v }; }, exported);
  log.tune = { before, after, cam, exported: JSON.parse(exported), afterReload: reloaded, afterReset: reset, importRoundTrip: imported, errs: p.errs };
  await p.ctx.close();
}

if (want("menu")) { // the Esc settings plate: open/pause/volume/controls/resume, Esc priority, quit to bunker, bunker Esc
  const p = await open("");
  const out = {};
  const state = () => p.evaluate(() => ({ open: !!document.querySelector(".set3"), raidT: +window.__g.G.raidT.toFixed(2), scene: window.__g.G.scene, loot: !!document.querySelector(".lv"), map: !!document.querySelector(".mv3, .mapview, [class*=mv3]") }));
  await p.mouse.move(W / 2 + 200, H / 2); await p.waitForTimeout(300);
  await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  const s1 = await state(); await p.waitForTimeout(700); const s2 = await state();
  out.openPaused = { opened: s1.open, raidTBefore: s1.raidT, raidTAfter700ms: s2.raidT };
  await p.screenshot({ path: `${OUT}/menu_raid.png` });
  const slider = p.locator('.set3 input[data-bus="master"]'); await slider.focus(); for (let i = 0; i < 10; i++) await slider.press("ArrowLeft");
  out.master = await p.evaluate(() => ({ shown: document.querySelector('.set3 [data-v="master"]').textContent, stored: JSON.parse(localStorage.getItem("bv_volume") ?? "{}").master }));
  await p.locator('.set3 button[data-a="controls"]').click();
  out.controls = await p.evaluate(() => ({ pref: JSON.parse(localStorage.getItem("bv_settings") ?? "{}").controls, pressed: document.querySelector('.set3 button[data-a="controls"]').getAttribute("aria-pressed") }));
  await p.locator('.set3 button[data-a="resume"]').click(); await p.waitForTimeout(400);
  const s3 = await state(); out.resume = { closed: !s3.open, raidTRuns: s3.raidT > s2.raidT };
  out.helpShown = await p.evaluate(() => { const h = document.querySelector(".h3-help"); return h && !h.classList.contains("gone"); });
  await p.keyboard.press("Escape"); await p.waitForTimeout(200); out.escOpens = (await state()).open;
  await p.keyboard.press("Escape"); await p.waitForTimeout(200); out.escCloses = !(await state()).open;
  // Tab loot screen: Esc closes it and does not open settings
  await p.keyboard.press("Tab"); await p.waitForTimeout(600); const l1 = await state();
  await p.keyboard.press("Escape"); await p.waitForTimeout(400); const l2 = await state();
  out.lootFirst = { lootOpened: l1.loot, afterEsc: { loot: l2.loot, settings: l2.open } };
  // map: Esc closes it and does not open settings
  await p.keyboard.press("m"); await p.waitForTimeout(600); const m1 = await p.evaluate(() => window.__ui?.mapOpen?.() ?? null);
  const mapBefore = await p.evaluate(() => document.querySelectorAll("body > div").length);
  await p.keyboard.press("Escape"); await p.waitForTimeout(500); const m2 = await state();
  out.mapFirst = { mapOpenedProbe: m1, bodyDivsWithMap: mapBefore, afterEsc: { settings: m2.open, bodyDivs: await p.evaluate(() => document.querySelectorAll("body > div").length) } };
  // quit to bunker: two clicks; counts as a bonk-out
  await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  await p.locator('.set3 button[data-a="quit"]').click(); await p.waitForTimeout(200);
  out.quitArmed = await p.evaluate(() => ({ label: document.querySelector('.set3 button[data-a="quit"]').textContent, scene: window.__g.G.scene }));
  await p.screenshot({ path: `${OUT}/menu_quit_armed.png` });
  await p.locator('.set3 button[data-a="quit"]').click();
  await p.waitForFunction(() => window.__g.G.scene === "bunker", null, { timeout: 20000 }); await p.waitForTimeout(1500);
  out.quit = await p.evaluate(() => ({ scene: window.__g.G.scene, raids: window.__raids?.map((r) => r.how), bonkOuts: window.__g.G.save.stats.bonkOuts, resultPanel: window.__g.home.panelOpen() }));
  // bunker: Esc closes the result panel first, then opens settings (no quit button there)
  await p.keyboard.press("Escape"); await p.waitForTimeout(400);
  const k1 = await p.evaluate(() => ({ panel: window.__g.home.panelOpen(), settings: !!document.querySelector(".set3") }));
  await p.keyboard.press("Escape"); await p.waitForTimeout(400);
  const k2 = await p.evaluate(() => ({ panel: window.__g.home.panelOpen(), settings: !!document.querySelector(".set3"), quitButton: !!document.querySelector('.set3 button[data-a="quit"]') }));
  await p.screenshot({ path: `${OUT}/menu_bunker.png` });
  await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  await p.evaluate(() => window.__g.home.open("bench")); await p.waitForTimeout(300);
  await p.keyboard.press("Escape"); await p.waitForTimeout(400);
  const k3 = await p.evaluate(() => ({ panel: window.__g.home.panelOpen(), settings: !!document.querySelector(".set3") }));
  out.bunker = { firstEsc: k1, secondEsc: k2, stationPanelEsc: k3 };
  await p.evaluate(() => { localStorage.removeItem("bv_settings"); localStorage.setItem("bv_volume", "{}"); });
  log.menu = { ...out, errs: p.errs };
  await p.ctx.close();
}
fs.writeFileSync(`${OUT}/gunfeel.json`, JSON.stringify(log, null, 1));
console.log(JSON.stringify(log, null, 1));
await b.close();
