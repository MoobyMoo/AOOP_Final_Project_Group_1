// Gun-handling checks (scatter, recoil, ADS, ?tune, the Esc settings plate): real mouse and keys on the built game,
// numbers read from the page (combat/handling.ts __gun, core/raid.ts __cam, core/tune.ts __tune), crops saved.
//   node tools/gunfeel.mjs <outdir> [scenario,...]     BASE=http://127.0.0.1:5356 (never 5318 or 5340)
// scenarios: burst rest kick ads tune menu sights comp supp laser   (the last four: G1.5 row 36 attachments)
//            arsenal: every gun in combat/guns.ts measured in game (time to kill a still 48 HP target, the resting
//            cone hip and aimed, the first shot's kick in px at 1440, the aimed camera lead and FOV) and set against
//            Duckov's class bands (research/duckov-re/balance_ranges.json); writes arsenal.md and arsenal.json
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
// ---------------------------------------------------------------- attachments (G1.5 row 36)
/** fit exactly this set on the Kingpin (setup through the capture hook; the loot-screen fitting is uitest's job) */
const fitOnly = (p, ids) => p.evaluate((ids) => { const S = window.__gunStats, g = window.__g.G.save.gun; for (const k of Object.keys(g)) S.unfit(k); for (const id of ids) S.fit(id); return { ...S.GUN }; }, ids);
const crossAt = (p) => p.evaluate(() => { const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(document.querySelector(".h3-cross").style.transform); return [+m[1], +m[2]]; });

if (want("sights")) { // bare vs holo vs 2x: ADS camera lead, FOV, time to full aim; full-frame shots aimed
  const p = await open("peace=1");
  const [hx, hy] = await hero(p); const ax = hx + 330, ay = hy - 140;
  const read = () => p.evaluate(() => { const G = window.__g.G, c = window.__cam; return { lead: +c.lead.length().toFixed(3), aimDist: +Math.hypot(G.aimPoint.x - G.pp.x, G.aimPoint.z - G.pp.z).toFixed(2), fov: +G.stage.camera.fov.toFixed(3), ads: +window.__gun.HS.ads.toFixed(3) }; });
  const out = {};
  for (const [name, ids] of [["bare", []], ["holo", ["att_sight_holo"]], ["2x", ["att_sight_2x"]]]) {
    const gun = await fitOnly(p, ids);
    await p.mouse.move(ax + 1, ay); await p.mouse.move(ax, ay); await p.waitForTimeout(1200);
    const hip = await read();
    // time to full aim, from a per-frame record of the aim amount and the game clock
    await p.evaluate(() => { window.__ar = []; window.__arOn = true; const f = () => { window.__ar.push([window.__g.G.raidT, window.__gun.HS.ads]); if (window.__arOn) requestAnimationFrame(f); }; requestAnimationFrame(f); });
    await p.mouse.down({ button: "right" }); await p.waitForTimeout(1800);
    const ar = await p.evaluate(() => { window.__arOn = false; return window.__ar; });
    const t0 = (ar.find((q) => q[1] > 0) ?? ar[0])[0], full = ar.find((q) => q[1] >= 0.999);
    const aimed = await read(); await p.screenshot({ path: `${OUT}/sight_${name}_aimed.png` });
    await p.mouse.up({ button: "right" }); await p.waitForTimeout(900);
    out[name] = { adsDistFactor: r2(gun.adsDist), adsFovScale: +gun.adsFov.toFixed(3), adsTimeStat: r2(gun.adsTime), measuredFullAimS: full ? r2(full[0] - t0 + 1 / 60) : null,
      hipLeadU: hip.lead, aimedLeadU: aimed.lead, leadPushU: r2(aimed.lead - hip.lead), hipFov: hip.fov, aimedFov: aimed.fov, fovScaleMeasured: +(aimed.fov / hip.fov).toFixed(3), aimDistU: aimed.aimDist };
  }
  await fitOnly(p, []);
  log.sights = { ...out, errs: p.errs };
  await p.ctx.close();
}

if (want("comp")) { // compensator: recoil kick px over 6 single shots, bare vs fitted (same raid seed, so the same random picks)
  const out = {};
  for (const [name, ids] of [["bare", []], ["comp", ["att_muzzle_comp"]]]) {
    const p = await open("peace=1");
    const gun = await fitOnly(p, ids);
    const [hx, hy] = await hero(p); const ax = hx + 260, ay = hy - 80;
    await p.mouse.move(ax, ay); await p.waitForTimeout(800);
    await record(p); await p.waitForTimeout(200);
    for (let s = 0; s < 6; s++) { await p.mouse.down(); await p.waitForTimeout(30); await p.mouse.up(); if (s === 0) { await p.waitForTimeout(40); await crop(p, `comp_${name}_kick`, ax, ay - 20, 200, 200); } await p.waitForTimeout(900); }
    const rec = await stop(p), peaks = [], starts = [];
    for (let i = 1; i < rec.length; i++) if (rec[i].shots > rec[i - 1].shots) starts.push(i);
    starts.forEach((i, k) => { const end = starts[k + 1] ?? rec.length; const w = rec.slice(i, end).filter((q) => q.t - rec[i].t < 0.3); peaks.push(r2(Math.max(...w.map((q) => Math.hypot(q.rx, q.ry))))); });
    out[name] = { scaleV: r2(gun.scaleV), scaleH: r2(gun.scaleH), shots: peaks.length, peakKickPx: peaks, meanPeakPx: r2(peaks.reduce((a, b) => a + b, 0) / Math.max(1, peaks.length)), errs: p.errs };
    await p.ctx.close();
  }
  out.reduction = out.bare.meanPeakPx ? r2(1 - out.comp.meanPeakPx / out.bare.meanPeakPx) : null;
  log.comp = out;
}

if (want("supp")) { // suppressor: AI hearing radius, a bandit 12 u behind you, the noise ring, and the shot's loudness
  const out = {};
  for (const [name, ids] of [["bare", []], ["supp", ["att_muzzle_supp"]]]) {
    const p = await open("");
    const gun = await fitOnly(p, ids);
    const [hx, hy] = await hero(p); await p.mouse.move(hx + 260, hy - 60); await p.waitForTimeout(500);
    // a patrolling bandit 12 u behind (outside its 10 u sight), the rest parked far away
    const setup = await p.evaluate(() => {
      const G = window.__g.G, aim = G.aimYaw, b = G.enemies.find((e) => e.kind === "bandit" && !e.down);
      for (const e of G.enemies) if (e !== b) { e.p.set(e.p.x + 400, e.p.y, e.p.z + 400); }
      b.p.set(G.pp.x - Math.sin(aim) * 12, G.pp.y, G.pp.z - Math.cos(aim) * 12); b.state = "patrol"; b.lastSeen = null; b.vel.set(0, 0, 0);
      window.__rings = 0; const hud = window.__ui?.hud; if (hud && !hud.__wrapped) { const f = hud.noiseRing; hud.noiseRing = (...a) => { window.__rings++; return f.apply(hud, a); }; hud.__wrapped = true; }
      return { banditDistU: +Math.hypot(b.p.x - G.pp.x, b.p.z - G.pp.z).toFixed(2), state: b.state };
    });
    // the loudness of one shot, read off the sfx bus (peak and RMS in dBFS, and the spectral centroid in Hz)
    await p.mouse.click(hx + 260, hy - 60, { button: "right" }); await p.waitForTimeout(300); // a click unlocks audio
    const tapOk = await p.evaluate(() => { window.__tap = window.__audio.tap(); window.__tapShot = window.__audio.tap(true); return !!window.__tap; });
    // the whole sfx bus for loudness; the shot's crack + tail chain alone for its brightness (the brass and the slide
    // click are not muffled, so they would skew a whole-bus centroid)
    await p.evaluate(() => { const a = window.__tap, sh = window.__tapShot, ctx = window.__audio.ctx(); window.__lv = { peak: 0, sumSq: 0, n: 0, cent: [], shotSumSq: 0, shotN: 0 }; window.__lvOn = true; const buf = new Float32Array(a.fftSize), sb = new Float32Array(sh.fftSize), fb = new Float32Array(sh.frequencyBinCount);
      const f = () => { a.getFloatTimeDomainData(buf); let pk = 0, ss = 0; for (const v of buf) { pk = Math.max(pk, Math.abs(v)); ss += v * v; } const L = window.__lv; L.peak = Math.max(L.peak, pk); L.sumSq += ss; L.n += buf.length;
        sh.getFloatTimeDomainData(sb); let spk = 0, sss = 0; for (const v of sb) { spk = Math.max(spk, Math.abs(v)); sss += v * v; } L.shotSumSq += sss; L.shotN += sb.length;
        if (spk > 0.005) { sh.getFloatFrequencyData(fb); let num = 0, den = 0; for (let i = 0; i < fb.length; i++) { const m = Math.pow(10, fb[i] / 20); num += m * i * ctx.sampleRate / sh.fftSize; den += m; } L.cent.push(num / Math.max(1e-9, den)); }
        if (window.__lvOn) requestAnimationFrame(f); }; requestAnimationFrame(f); });
    await p.mouse.down(); await p.waitForTimeout(30); await p.mouse.up(); await p.waitForTimeout(500);
    const lv = await p.evaluate(() => { window.__lvOn = false; const L = window.__lv; return { busPeakDb: +(20 * Math.log10(L.peak + 1e-9)).toFixed(1), busRmsDb: +(10 * Math.log10(L.sumSq / Math.max(1, L.n) + 1e-12)).toFixed(1), shotLayerRmsDb: +(10 * Math.log10(L.shotSumSq / Math.max(1, L.shotN) + 1e-12)).toFixed(1), shotCentroidHz: L.cent.length ? Math.round(L.cent.reduce((a, b) => a + b, 0) / L.cent.length) : null }; });
    const after = await p.evaluate(() => { const G = window.__g.G, b = G.enemies.find((e) => e.kind === "bandit" && !e.down && Math.hypot(e.p.x - G.pp.x, e.p.z - G.pp.z) < 30); return { state: b?.state, rings: window.__rings, shots: window.__gun.HS.shots }; });
    out[name] = { noiseRadiusU: r2(gun.noise), suppressedFlag: gun.suppressed, shotLevel: await p.evaluate(() => (window.__audio.tone.suppressed ? window.__audio.tone.level : 1)), banditAt: setup.banditDistU, banditBefore: setup.state, banditAfter: after.state, noiseRingsDrawn: after.rings, tap: tapOk, loudness: lv, errs: p.errs };
    await p.ctx.close();
  }
  if (out.bare.loudness && out.supp.loudness) { out.busDropDb = r2(out.bare.loudness.busRmsDb - out.supp.loudness.busRmsDb); out.shotLayerDropDb = r2(out.bare.loudness.shotLayerRmsDb - out.supp.loudness.shotLayerRmsDb); }
  log.supp = out;
}

if (want("laser")) { // laser: the resting hip cone, standing and walking, bare vs fitted
  const p = await open("peace=1");
  const [hx, hy] = await hero(p); await p.mouse.move(hx + 240, hy - 30); await p.waitForTimeout(600);
  const read = () => p.evaluate(() => { const g = window.__gun; return { sc: +g.currentScatter().toFixed(2), gapPx: parseFloat(document.querySelector(".h3-cross").style.getPropertyValue("--spread")) }; });
  const out = {};
  for (const [name, ids] of [["bare", []], ["laser", ["att_laser"]]]) {
    const gun = await fitOnly(p, ids); await p.waitForTimeout(1500);
    const stand = await read(); const c = await crossAt(p); await crop(p, `laser_${name}_cross`, c[0], c[1], 200, 200);
    await p.keyboard.down("d"); await p.waitForTimeout(800); const walk = await read(); await p.keyboard.up("d"); await p.waitForTimeout(1200);
    out[name] = { restHipDeg: r2(gun.rest), maxHipDeg: r2(gun.max), standingDeg: stand.sc, standingGapPx: stand.gapPx, walkingDeg: walk.sc };
  }
  await fitOnly(p, []);
  log.laser = { ...out, errs: p.errs };
  await p.ctx.close();
}
if (want("arsenal")) {
  const bands = JSON.parse(fs.readFileSync(new URL("../research/duckov-re/balance_ranges.json", import.meta.url)));
  const BY = { pistol: "pistol", smg: "SMG", rifle: "rifle", shotgun: "shotgun", sniper: "sniper", lmg: "rifle" }; // LMG: Duckov's belt-fed guns are rifle-class (POLISH_FINDINGS 17)
  const band = (cls, stat) => bands.categories.guns.by_class[BY[cls]].stats[stat];
  const ttkBand = (cls) => bands.ttk.find((t) => t.tier === "ordinary.hp_0_60" && t.class === BY[cls] && t.ammo === "neutral_ammo").stats.seconds;
  const rows = [];
  const p = await open("peace=1");
  const defs = await p.evaluate(() => JSON.parse(JSON.stringify(window.__arsenal.defs())));
  for (const id of Object.keys(defs)) {
    const d = defs[id], cal = d.caliber;
    // in hand, drawn, with a full magazine and rounds to spare (all through the real pickup and reload paths)
    await p.evaluate(({ id, cal }) => { const ui = window.__ui, G = window.__g.G; if (id === "kingpin45") window.__arsenal.switchTo(0); else { ui.gun2(id); window.__arsenal.switchTo(1); } ui.rounds(cal, 300); G.drawT = 1; G.hp = G.maxHp; }, { id, cal });
    await p.waitForTimeout(300);
    for (let k = 0; k < 4 && await p.evaluate(() => window.__g.G.mag < window.__g.G.magSize); k++) { await p.keyboard.press("r"); await p.waitForFunction(() => window.__g.G.reloadT < 0, null, { timeout: 20000 }); await p.waitForTimeout(100); }
    // the resting cone, hip then aimed; the camera lead and FOV at full aim
    const [hx, hy] = await hero(p); await p.mouse.move(hx + 420, hy - 40); await p.waitForTimeout(1500);
    const hip = await p.evaluate(() => ({ cone: window.__gun.currentScatter(), lead: window.__cam.lead.length(), fov: window.__g.G.stage.camera.fov }));
    await p.mouse.down({ button: "right" }); await p.waitForTimeout(d.h.adsTime * 1000 + 2500); // the cone settles from the hip rest to the aimed one
    const ads = await p.evaluate(() => ({ cone: window.__gun.currentScatter(), lead: window.__cam.lead.length(), fov: window.__g.G.stage.camera.fov, ads: window.__gun.HS.ads }));
    await p.mouse.up({ button: "right" }); await p.waitForTimeout(900);
    // the first shot's kick: the recoil offset's peak, px scaled to the 1440 reference
    await record(p); await p.mouse.click(hx + 420, hy - 40); await p.waitForTimeout(450);
    const rec = await stop(p), kick = Math.max(0, ...rec.map((q) => Math.hypot(q.rx, q.ry))) * 1440 / H;
    await p.waitForTimeout(Math.max(900, d.interval * 1000 + 400));
    if (await p.evaluate(() => window.__g.G.mag < window.__g.G.magSize)) { await p.keyboard.press("r"); await p.waitForFunction(() => window.__g.G.reloadT < 0, null, { timeout: 20000 }); }
    // time to kill a still 48 HP target (Duckov's ordinary hp_0_60 median), hip at 6 u; snipers aimed at 12 u, shotguns at 5 u
    const dist = d.cls === "sniper" ? 12 : d.cls === "shotgun" ? 5 : 6, aimed = d.cls === "sniper";
    const spot = await p.evaluate((dist) => { const g = window.__g, G = g.G; for (let a = 0; a < 16; a++) { const yaw = Math.PI + a * Math.PI / 8 * (a % 2 ? 1 : -1) / 2; const x = G.pp.x + Math.sin(yaw) * dist, z = G.pp.z + Math.cos(yaw) * dist; if (g.walkable(x, z) && g.los(G.pp.x, G.pp.z, x, z)) return { x, z }; } return null; }, dist);
    if (!spot) { rows.push({ id, err: "no clear line for the target" }); continue; }
    await p.evaluate(({ x, z }) => { window.__dummy = window.__ui.dummy(x, z, 48); }, spot);
    const aimAt = async () => { const [x, y] = await p.evaluate(() => { if (!window.__g.G.enemies.some((q) => q.id === window.__dummy && !q.down)) return [innerWidth / 2, innerHeight / 2]; const G = window.__g.G, e = G.enemies.find((q) => q.id === window.__dummy), v = e.p.clone().setY(G.pp.y + 1).project(G.stage.camera); /* the game picks the aim on the plane at the hero's chest */ return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight]; }); await p.mouse.move(x, y, { steps: 2 }); };
    await aimAt(); await p.waitForTimeout(500);
    if (aimed) { await p.mouse.down({ button: "right" }); await p.waitForTimeout(d.h.adsTime * 1000 + 500); await aimAt(); }
    const s0 = await p.evaluate(() => ({ shots: window.__g.G.log.shots, hits: window.__g.G.log.hits, t: window.__g.G.raidT }));
    const deliberate = d.cls === "sniper"; // a sniper waits for the aimed cone to settle between shots (it grows 30 deg a shot)
    if (!deliberate) await p.mouse.down();
    const t0 = Date.now(); let first = null, killed = null;
    while (Date.now() - t0 < 20000) {
      const st = await p.evaluate(() => { const G = window.__g.G, e = G.enemies.find((q) => q.id === window.__dummy); return { t: G.raidT, shots: G.log.shots, down: !e || e.down, mag: G.mag, rl: G.reloadT }; });
      if (first === null && st.shots > s0.shots) first = st.t;
      if (st.down) { killed = st.t; break; }
      if (st.mag === 0 && st.rl < 0) { await p.mouse.up(); await p.keyboard.press("r"); await p.waitForTimeout(150); if (!deliberate) await p.mouse.down(); }
      if (deliberate && st.rl < 0 && await p.evaluate(() => window.__g.G.fireCd <= 0 && window.__gun.currentScatter() <= window.__gun.restScatter() * window.__gun.HS.move + 0.3)) { await p.mouse.down(); await p.waitForTimeout(30); await p.mouse.up(); }
      await aimAt(); // track the target as the camera's aim lead moves the view, as a player does
      await p.waitForTimeout(16);
    }
    await p.mouse.up(); if (aimed) await p.mouse.up({ button: "right" });
    const s1 = await p.evaluate(() => ({ shots: window.__g.G.log.shots, hits: window.__g.G.log.hits }));
    await p.evaluate(() => { const G = window.__g.G, e = G.enemies.find((q) => q.id === window.__dummy); if (e) { e.down = true; e.rig.root.visible = false; } });
    // Duckov's modelled TTK with our numbers (BALANCE_RANGES "Modeled time to kill": 48 HP, armour 0.5823)
    const armor = 0.5823, m = 2 / (Math.max(0, armor - d.pen) + 2), per = Math.max(1, d.damage / d.pellets * m) * d.pellets, N = Math.ceil(48 / per), sps = 1 / d.interval;
    const L = Math.floor((N - 1) / d.mag), rl = d.reloadMode === "round" ? d.perRound * d.mag : d.reload, modelled = (N - 1 - L) / sps + L * Math.max(rl, 1 / sps);
    const B = (stat) => { const b = band(d.cls, stat); return b ? [b.p10, b.median, b.p90] : null; };
    const tb = ttkBand(d.cls);
    rows.push({ id, name: d.name, cls: d.cls, tier: d.tier, damage: d.damage, pellets: d.pellets, sps: r2(sps), mag: d.mag, reload: d.reloadMode === "round" ? `${d.perRound}/rd` : d.reload,
      ttkMeasured: killed !== null && first !== null ? r2(killed - first) : null, shots: s1.shots - s0.shots, hits: s1.hits - s0.hits, ttkModelled: r2(modelled), ttkBand: [r2(tb.p10), r2(tb.median), r2(tb.p90)],
      coneHip: r2(hip.cone), coneAds: r2(ads.cone), kickPx: r2(kick), adsLead: r2(ads.lead), adsFovScale: r2(ads.fov / hip.fov), adsLeadHip: r2(hip.lead),
      bands: { damage: B("Damage"), sps: B("ShootSpeed"), mag: B("Capacity"), reload: B("ReloadTime"), coneHip: B("effective.DefaultScatter"), coneAds: B("effective.DefaultScatterADS"), kick: B("RecoilScaleV"), adsTime: B("ADSTime"), lead: B("ADSAimDistanceFactor") },
      errs: [...p.errs] });
    console.log(`arsenal ${id}: ttk ${rows.at(-1).ttkMeasured} s (model ${rows.at(-1).ttkModelled}, band ${rows.at(-1).ttkBand.join("/")}), cone ${rows.at(-1).coneHip}/${rows.at(-1).coneAds}, kick ${rows.at(-1).kickPx} px`);
  }
  await p.ctx.close();
  // a markdown table: each number and its Duckov class band p10 / median / p90; a mark when it sits outside
  const fmt = (v, b, lowerBetter = false) => { if (v === null || v === undefined) return "-"; if (!b) return `${v}`; const tol = 0.01 * Math.max(Math.abs(b[0]), Math.abs(b[2])), out = v < b[0] - tol ? " ▼" : v > b[2] + tol ? " ▲" : ""; void lowerBetter; return `${typeof v === "number" ? r2(v) : v}${out}`; };
  const md = [`| Gun | Class / tier | Damage | Shots/s | Mag | Reload | TTK measured (shots, hits) | TTK modelled vs band | Cone hip / ADS deg | Kick px | ADS lead, FOV |`, `|---|---|---|---|---|---|---|---|---|---|---|`];
  for (const r of rows) {
    if (r.err) { md.push(`| ${r.id} | ${r.err} |`); continue; }
    const bb = (b) => b ? `${r2(b[0])}/${r2(b[1])}/${r2(b[2])}` : "-";
    md.push(`| ${r.name} | ${r.cls} / ${r.tier} | ${fmt(r.damage, r.bands.damage)} ${r.pellets > 1 ? `(${r.pellets} pellets)` : ""} [${bb(r.bands.damage)}] | ${fmt(r.sps, r.bands.sps)} [${bb(r.bands.sps)}] | ${fmt(r.mag, r.bands.mag)} [${bb(r.bands.mag)}] | ${typeof r.reload === "number" ? fmt(r.reload, r.bands.reload) : r.reload} [${bb(r.bands.reload)}] | ${r.ttkMeasured ?? "-"} s (${r.shots}, ${r.hits}) | ${fmt(r.ttkModelled, r.ttkBand)} s [${bb(r.ttkBand)}] | ${fmt(r.coneHip, r.bands.coneHip)} / ${fmt(r.coneAds, r.bands.coneAds)} [${bb(r.bands.coneHip)} / ${bb(r.bands.coneAds)}] | ${r.kickPx} | ${r.adsLead} u, ×${r.adsFovScale} |`);
  }
  fs.writeFileSync(`${OUT}/arsenal.md`, md.join("\n") + "\n\n▲ / ▼ = above p90 / below p10 of the Duckov class band. Bands in brackets are p10 / median / p90. LMG rows use the rifle band (Duckov's belt-fed guns are rifle-class). Measured TTK: a still 48 HP target tracked by the mouse, hip at 6 u (shotguns 5 u; snipers aimed at 12 u, each shot taken once the aimed cone has settled), first shot to knockout, no armour, body aim (no head crits). Modelled TTK: Duckov's formula with our numbers against its ordinary hp_0_60 tier (48 HP, armour 0.58).\n");
  fs.writeFileSync(`${OUT}/arsenal.json`, JSON.stringify(rows, null, 1));
  log.arsenal = rows.map((r) => ({ id: r.id, ttk: r.ttkMeasured, model: r.ttkModelled, err: r.err }));
}
fs.writeFileSync(`${OUT}/gunfeel.json`, JSON.stringify(log, null, 1));
console.log(JSON.stringify(log, null, 1));
await b.close();
