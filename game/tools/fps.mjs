// Frame-time check (advisor G1 item 32): Mac-like 1470x956 @2x, walk a loop for N seconds, report median/p95 frame
// time, fps and draw calls. node tools/fps.mjs [seconds] [extraQuery]   (BASE=http://127.0.0.1:5340 by default: the
// built preview on its own port. Never 5318: Moo plays there.) SCENE=bunker walks the vault instead, with every
// facility built (the heaviest the base gets).
import { chromium } from "playwright-core";
const [secs = "20", extra = ""] = process.argv.slice(2);
const BASE = process.env.BASE ?? "http://127.0.0.1:5340";
if (new URL(BASE).port === "5318") throw new Error("port 5318 belongs to the owner's live server");
const b = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--use-angle=gl", "--enable-gpu", "--ignore-gpu-blocklist", "--disable-frame-rate-limit", "--disable-gpu-vsync"] });
const p = await b.newPage({ viewport: { width: 1470, height: 956 }, deviceScaleFactor: 2 });
const HOME = process.env.SCENE === "bunker";
if (HOME) {
  await p.goto(`${BASE}/game.html?fresh=1&dev&dpr=2&prof=1${extra}`); await p.waitForFunction(() => window.__G?.save && window.__g?.home, null, { timeout: 90000 });
  await p.evaluate(() => localStorage.setItem("bv_g1", JSON.stringify({ ...window.__G.save, lookDone: true, money: 5000, salMovedIn: true, upgrades: { mag: 1, pack: 1, heart: 1 }, trophies: ["golden_banana", "banana_idol", "brass_compass"] })));
  await p.goto(`${BASE}/game.html?dev&dpr=2&prof=1${extra}`); await p.waitForFunction(() => window.__G?.scene === "bunker" && window.__g?.home, null, { timeout: 90000 });
  await p.evaluate(() => { const B = window.__g.home.build; B.open(); for (const [id, x, z, r] of [["fence", -13, -12, 0], ["bench", 6, -12, 0], ["sal", 10, -12, 0], ["trophy", 16, -4, 3], ["med", -14, 4, 0], ["stash", -9, 8, 0], ["stash", -5, 8, 0], ["generator", 12, 6, 0], ["press", 8, 6, 0], ["desk", -2, 3, 0], ["plant", 4, 4, 0], ["plant", 5, 4, 0], ["plant", 14, -2, 0]]) { B.choose(id); B.confirmAt(x, z, r); } B.close(); });
  await p.waitForTimeout(3000);
} else { await p.goto(`${BASE}/game.html?fresh=1&raid=1&dpr=2&prof=1${extra}`); await p.waitForFunction(() => window.__g?.G?.scene === "raid", null, { timeout: 90000 }); await p.waitForTimeout(4000); }
await p.evaluate(() => { window.__ft = []; let last = performance.now(); const f = (t) => { window.__ft.push(t - last); last = t; requestAnimationFrame(f); }; requestAnimationFrame(f); });
const keys = ["w", "d", "w", "a", "w", "d", "s", "a"]; const t0 = Date.now(); let k = 0;
while (Date.now() - t0 < +secs * 1000) { await p.keyboard.down(keys[k % keys.length]); await p.waitForTimeout(1200); await p.keyboard.up(keys[k % keys.length]); k++; }
const r = await p.evaluate(() => { const a = window.__ft.slice(10).sort((x, y) => x - y); const q = (v) => a[Math.floor(a.length * v)]; const g = window.__g; const long = window.__ft.slice(10).filter((x) => x > 33).length; const pop = { enemies: g.G.enemies.filter((e) => !e.down && !e.fauna).length, activeEnemies: g.G.enemies.filter((e) => !e.down && e.active && !e.fauna).length, ...(g.fauna ? g.fauna() : {}), containers: g.G.crates.filter((c) => c.kind === "container").length, groundItems: g.G.pickups.length }; return { frames: a.length, long33: long, pop, median: +q(0.5).toFixed(2), p95: +q(0.95).toFixed(2), fps: +(1000 / q(0.5)).toFixed(1), ...g.info(), pp: [g.G.pp.x.toFixed(0), g.G.pp.z.toFixed(0)], built: g.G.save.base.items.length, scene: g.G.scene }; });
console.log(JSON.stringify(r)); console.log(JSON.stringify(await p.evaluate(() => window.__prof.slice(0, 40)))); await b.close();
