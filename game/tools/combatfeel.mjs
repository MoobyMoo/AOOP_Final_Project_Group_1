// Combat-feel captures (G1.5 rows 02, 03, 14, 19, 20): scripted scenarios in slow motion (?ts=), each saved as a frame
// sequence cropped around the action, plus an optional real-time video.
//   node tools/combatfeel.mjs <outdir> [scenario,...]      BASE=http://127.0.0.1:5345 (never 5318: Moo plays there)
// scenarios: head body critkill reload empty dash rang surfaces video
import { chromium } from "playwright-core";
import fs from "node:fs";
const [OUT = "/tmp/bv-cf/shots", only = ""] = process.argv.slice(2);
const BASE = process.env.BASE ?? "http://127.0.0.1:5345";
if (new URL(BASE).port === "5318") throw new Error("port 5318 belongs to the owner's live server");
fs.mkdirSync(OUT, { recursive: true });
const want = (s) => !only || only.split(",").includes(s);
const W = 1600, H = 900;
const b = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--use-angle=gl", "--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const log = {};

async function open(query, video) {
  const ctx = await b.newContext({ viewport: { width: W, height: H }, ...(video ? { recordVideo: { dir: video, size: { width: 1280, height: 720 } } } : {}) });
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(`${BASE}/game.html?fresh=1&raid=1&${query}`);
  await p.waitForFunction(() => window.__g?.G?.scene === "raid", null, { timeout: 90000 });
  await p.waitForTimeout(1200);
  await p.evaluate(() => { for (const c of [".hud-banner", ".hud-help"]) { const el = document.querySelector(c); if (el) el.style.display = "none"; } }); // DOM over the canvas eats the clicks
  p.errs = errs; p.ctx = ctx; return p;
}
/** screen pixel of a world point */
const scr = (p, x, y, z) => p.evaluate(([x, y, z]) => { const G = window.__g.G, v = G.pp.clone().set(x, y, z).project(G.stage.camera); return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight]; }, [x, y, z]);
/** frames around a world point: n shots, `gap` ms apart, each a w x h crop */
async function frames(p, name, at, n, gap, w = 720, h = 440) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const [cx, cy] = await scr(p, ...at);
    const clip = { x: Math.max(0, Math.min(W - w, cx - w / 2)), y: Math.max(0, Math.min(H - h, cy - h / 2)), width: w, height: h };
    const f = `${OUT}/${name}_${String(i).padStart(2, "0")}.png`; await p.screenshot({ path: f, clip }); out.push(f);
    if (gap) await p.waitForTimeout(gap);
  }
  return out;
}
/** put the hero `dist` u south of an enemy (or anywhere walkable around it) and park the enemy's AI */
async function faceEnemy(p, kind, dist = 6) {
  return p.evaluate(([kind, dist]) => {
    const g = window.__g, G = g.G;
    const e = G.enemies.filter((q) => q.kind === kind && !q.down).sort((a, c) => Math.hypot(a.p.x - G.pp.x, a.p.z - G.pp.z) - Math.hypot(c.p.x - G.pp.x, c.p.z - G.pp.z))[0];
    for (let k = 0; k < 16; k++) { const a = Math.PI * 0.5 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.35, x = e.p.x + Math.cos(a) * dist, z = e.p.z + Math.sin(a) * dist; if (g.walkable(x, z) && g.los(x, z, e.p.x, e.p.z)) { g.tp(x, z); break; } }
    e.active = true; e.state = "notice"; e.t = 30; e.vel.set(0, 0, 0); // holds still, facing the hero, for the shot
    return { id: e.id, x: e.p.x, z: e.p.z, hp: e.hp };
  }, [kind, dist]);
}
/** wait until the follow camera has caught up with a teleport (the hero within 60 px of where it settles) */
async function settle(p) {
  let last = null;
  for (let i = 0; i < 60; i++) {
    const s = await p.evaluate(() => { const G = window.__g.G; const v = G.pp.clone().project(G.stage.camera); return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight]; });
    if (last && Math.hypot(s[0] - last[0], s[1] - last[1]) < 1.5) return; last = s; await p.waitForTimeout(150);
  }
}
async function head(p, id) { return p.evaluate((id) => { const G = window.__g.G, e = G.enemies.find((q) => q.id === id), c = G.pp.clone(); const r = window.__combat.headCenter(e, c); return [c.x, c.y, c.z, r]; }, id); }
async function shootAt(p, x, y, z) {
  const [sx, sy] = await scr(p, x, y, z); await p.mouse.move(sx, sy); await p.waitForTimeout(250);
  const onHead = await p.evaluate(() => window.__combat.aimHead.enemy?.id ?? null);
  await p.mouse.down(); await p.waitForTimeout(40); await p.mouse.up();
  return onHead;
}

if (want("head") || want("body") || want("critkill")) {
  for (const sc of ["head", "body", "critkill"].filter(want)) {
    const p = await open("ts=0.25&seed=4242");
    const e = await faceEnemy(p, "bandit", 6); await settle(p);
    if (sc === "critkill") await p.evaluate((id) => { window.__g.G.enemies.find((q) => q.id === id).hp = 10; }, e.id);
    const h = await head(p, e.id);
    const onHead = sc === "body" ? await shootAt(p, e.x, 0.55, e.z) : await shootAt(p, h[0], h[1], h[2]);
    await frames(p, sc, [e.x, 1.4, e.z], 8, 110);
    log[sc] = { onHead, ...(await p.evaluate((id) => { const G = window.__g.G, q = G.enemies.find((x) => x.id === id); return { hpAfter: q.hp, down: q.down, crit: [...document.querySelectorAll(".dmgnum")].filter((d) => d.style.display === "block").map((d) => [d.className, d.textContent]) }; }, e.id)), hpBefore: e.hp, errs: p.errs };
    await p.ctx.close();
  }
}
if (want("reload") || want("empty")) {
  for (const sc of ["reload", "empty"].filter(want)) {
    const p = await open("ts=0.25&peace=1");
    await p.mouse.move(W / 2 + 160, H / 2 - 40); await p.waitForTimeout(200);
    await p.evaluate((sc) => { const G = window.__g.G; G.mag = sc === "empty" ? 0 : 3; G.ammo = 20; }, sc);
    if (sc === "reload") await p.keyboard.press("r"); else { await p.mouse.down(); await p.waitForTimeout(40); await p.mouse.up(); }
    const pp = await p.evaluate(() => [window.__g.G.pp.x, window.__g.G.pp.z]);
    const states = [];
    for (let i = 0; i < 8; i++) { states.push(await p.evaluate(() => { const G = window.__g.G; return { t: +G.reloadT.toFixed(2), time: G.reloadTime, mag: G.mag, ammo: G.ammo }; })); await frames(p, `${sc}_${i}`, [pp[0], 1, pp[1]], 1, 0, 900, 520); await p.waitForTimeout(650); }
    log[sc] = { states, errs: p.errs };
    await p.ctx.close();
  }
}
if (want("dash")) {
  const p = await open("ts=0.1&peace=1");
  // a clear 6 u lane to the left of a sand spot east of the spawn
  await p.evaluate(() => { const g = window.__g, G = g.G; for (let x = G.pp.x + 2; x < G.pp.x + 40; x += 1) { let ok = true; for (let k = 0; k <= 7; k++) ok = ok && g.walkable(x - k, G.pp.z) && g.los(x, G.pp.z, x - 7, G.pp.z); if (ok) { g.tp(x, G.pp.z); return; } } });
  await settle(p);
  await p.mouse.move(W / 2 - 300, H / 2 - 60); await p.keyboard.down("a"); await p.waitForTimeout(800);
  const pp = await p.evaluate(() => [window.__g.G.pp.x, window.__g.G.pp.z]);
  await p.keyboard.press(" ");
  await frames(p, "dash", [pp[0] - 2.2, 1, pp[1]], 8, 330, 640, 380);
  await p.keyboard.up("a");
  log.dash = { errs: p.errs, ghosts: await p.evaluate(() => { let n = 0; window.__g.G.stage.scene.traverse((o) => { if (o.name === "dashGhost") n++; }); return n; }) };
  await p.ctx.close();
}
if (want("rang")) {
  const p = await open("ts=0.35&peace=1&seed=4242");
  // three backdrops: open beach sand (spawn), grass, and the shade under the farmhouse/palms; found by ground kind
  const spots = await p.evaluate(() => {
    const g = window.__g, G = g.G, C = window.__combat, out = {};
    out.sand = [G.pp.x, G.pp.z];
    for (let r = 4; r < 140 && !out.grass; r += 3) for (let a = 0; a < 6.28 && !out.grass; a += 0.3) { const x = G.pp.x + Math.cos(a) * r, z = G.pp.z - Math.abs(Math.sin(a)) * r; if (g.walkable(x, z) && C.ground(x, z) === "grass") out.grass = [x, z]; }
    out.shade = [-11, 15]; // in the farmhouse's shadow (it falls west and toward the camera)
    return out;
  });
  const owner = await p.evaluate(() => window.__g.G.enemies.length);
  for (const [k, at] of Object.entries(spots)) {
    if (!at) continue;
    await p.evaluate(([x, z]) => { const g = window.__g, G = g.G; let tx = x, tz = z + 3; if (!g.walkable(tx, tz)) tz = z - 3; g.tp(tx, tz); }, at);
    await settle(p);
    await p.evaluate(([x, z]) => { const G = window.__g.G; const owner = G.enemies[0] ?? { p: G.pp.clone().set(999, 0, 999), carry: [], down: true, rang: null }; window.__combat.throwDemo(owner, x - 4, z, 1, 0, 9); }, at);
    await p.waitForTimeout(300);
    const px = await p.evaluate(() => { const G = window.__g.G, r = G.rangs[G.rangs.length - 1]; if (!r) return null; const a = r.p.clone().project(G.stage.camera), c = r.p.clone().setX(r.p.x + 0.24).project(G.stage.camera); return { thickPx: +(Math.abs(c.x - a.x) * innerWidth / 2).toFixed(1), lenPx: +(Math.abs(c.x - a.x) * innerWidth / 2 * 0.95 / 0.24).toFixed(1) }; });
    log["rang_" + k] = { at, px, enemies: owner };
    const r = await p.evaluate(() => { const r = window.__g.G.rangs.at(-1); return r ? [r.p.x, 1.1, r.p.z] : null; });
    if (r) await frames(p, `rang_${k}`, r, 4, 120, 640, 400);
  }
  log.rang = { errs: p.errs };
  await p.ctx.close();
}
if (want("surfaces")) {
  const p = await open("ts=0.25&peace=1&seed=4242");
  const found = await p.evaluate(() => {
    const g = window.__g, G = g.G, C = window.__combat, out = {}, need = ["dirt", "wood", "metal", "foliage", "stone"];
    const centres = [[G.pp.x, G.pp.z], [-6.5, 11.5], [17.5, 24.5], [66.5, -7.5], [-27.5, -15.5], [6.5, 78.5], [-6, 60], [20, 40], [-40, 30], [40, 0], [0, -30], [60, 40], [-20, -60], [30, -90]];
    for (const [cx, cz] of centres) for (let r = 0; r < 30; r += 1.5) for (let k = 0; k < 24; k++) {
      const x = cx + Math.cos(k * 0.2618) * r, z = cz + Math.sin(k * 0.2618) * r; if (!g.walkable(x, z)) continue;
      for (let j = 0; j < 8; j++) {
        const dx = Math.cos(j * 0.785), dz = Math.sin(j * 0.785), d = C.rayShot(x, z, dx, dz, 9);
        if (d < 3.5 || d >= 9) continue;
        const s = C.surfaceAt(x + dx * (d + 0.2), z + dz * (d + 0.2));
        if (need.includes(s) && !out[s]) out[s] = { x, z, dx, dz, d };
      }
      if (need.every((s) => out[s])) return out;
    }
    return out;
  });
  log.surfacesFound = found;
  for (const [s, f] of Object.entries(found)) {
    await p.evaluate(({ x, z }) => window.__g.tp(x, z), f); await settle(p);
    const hx = f.x + f.dx * f.d, hz = f.z + f.dz * f.d;
    const [sx, sy] = await scr(p, hx, 1.0, hz); await p.mouse.move(sx, sy); await p.waitForTimeout(250);
    await p.mouse.down(); await p.waitForTimeout(40); await p.mouse.up();
    await p.waitForFunction(() => window.__combat.live() === 0, null, { timeout: 5000 }).catch(() => {}); // the round landed
    await frames(p, `surf_${s}`, [hx, 1, hz], 4, 60, 480, 300);
  }
  log.surfaces = { errs: p.errs };
  await p.ctx.close();
}
if (want("impacts")) { // the effect per surface, close up: the same spot, one impact each, slow motion
  const p = await open("ts=0.15&peace=1");
  const at = await p.evaluate(() => { const G = window.__g.G; return [G.pp.x + 2.5, G.pp.y + 1, G.pp.z - 1.5]; });
  for (const s of ["dirt", "wood", "metal", "foliage", "stone", "enemy", "enemyCrit"]) {
    await p.evaluate(([x, y, z, s]) => { const G = window.__g.G, v = G.pp.clone().set(x, y, z), d = G.pp.clone().set(-1, 0, 0); G.fx.impactOn(v, d, s === "enemyCrit" ? "enemy" : s, s === "enemyCrit"); }, [...at, s]);
    await frames(p, `imp_${s}`, at, 4, 140, 260, 170);
    await p.waitForTimeout(8000); // let it clear (1.2 s of game time) before the next one
  }
  log.impacts = { errs: p.errs };
  await p.ctx.close();
}
if (want("video")) { // real time (ts=1), recorded through the CDP screencast, then assembled with the system ffmpeg
  const dir = `${OUT}/video`; fs.mkdirSync(dir, { recursive: true });
  const p = await open("ts=1&seed=4242");
  const cdp = await p.ctx.newCDPSession(p), stamps = []; let n = 0;
  cdp.on("Page.screencastFrame", async (f) => { const name = `${dir}/f${String(n++).padStart(5, "0")}.jpg`; fs.writeFileSync(name, Buffer.from(f.data, "base64")); stamps.push([name, f.metadata.timestamp]); await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {}); });
  const e = await faceEnemy(p, "bandit", 6); await settle(p);
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 82, maxWidth: 1280, maxHeight: 720, everyNthFrame: 1 });
  await p.waitForTimeout(400);
  const body = await p.evaluate((id) => { const q = window.__g.G.enemies.find((x) => x.id === id); return [q.p.x, 0.55, q.p.z]; }, e.id);
  await shootAt(p, ...body); await p.waitForTimeout(450);                                   // a body shot
  for (let i = 0; i < 3; i++) { const h = await head(p, e.id); await shootAt(p, h[0], h[1], h[2]); await p.waitForTimeout(330); } // headshots to the crit kill
  await p.waitForTimeout(500);
  await p.evaluate(() => { window.__g.G.mag = 0; }); await p.mouse.down(); await p.waitForTimeout(40); await p.mouse.up(); // empty: click + reload
  await p.waitForTimeout(1500);
  await p.keyboard.down("a"); await p.waitForTimeout(300); await p.keyboard.press(" "); await p.waitForTimeout(600); await p.keyboard.up("a");
  await p.keyboard.down("s"); await p.waitForTimeout(250); await p.keyboard.press(" "); await p.waitForTimeout(600); await p.keyboard.up("s");
  await p.evaluate(() => { const G = window.__g.G; window.__combat.throwDemo(G.enemies.find((q) => q.down) ?? G.enemies[0], G.pp.x - 5, G.pp.z - 2.5, 1, 0, 9); });
  await p.waitForTimeout(1300);
  await cdp.send("Page.stopScreencast"); await p.waitForTimeout(300);
  const list = stamps.map(([f, t], i) => `file '${f}'\nduration ${Math.max(0.005, ((stamps[i + 1]?.[1] ?? t + 1 / 30) - t)).toFixed(4)}`).join("\n");
  fs.writeFileSync(`${dir}/list.txt`, list + `\nfile '${stamps.at(-1)[0]}'\n`);
  log.video = { frames: stamps.length, seconds: +(stamps.at(-1)[1] - stamps[0][1]).toFixed(2), list: `${dir}/list.txt`, errs: p.errs };
  await p.ctx.close();
}
fs.writeFileSync(`${OUT}/log.json`, JSON.stringify(log, null, 1));
console.log(JSON.stringify(log, null, 1));
await b.close();
