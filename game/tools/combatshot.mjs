// Combat frames for the council: runs the bot (greed 0.8) on the built preview and saves a frame whenever an enemy is engaged.
// node tools/combatshot.mjs [outdir] [base]. Never port 5318 (Moo plays there).
import { chromium } from "playwright-core";
const [OUT = "/tmp/combat", BASE = "http://127.0.0.1:5340"] = process.argv.slice(2);
if (new URL(BASE).port === "5318") throw new Error("port 5318 belongs to the owner's live server");
import("node:fs").then((fs) => fs.mkdirSync(OUT, { recursive: true }));
const b = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--use-angle=gl", "--enable-gpu", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
await p.goto(`${BASE}/game.html?fresh=1&bot=1&greed=0.8&seed=2`);
await p.waitForFunction(() => window.__g?.G?.scene === "raid", null, { timeout: 90000 });
let n = 0;
for (let t = 0; t < 240 && n < 6; t++) {
  await p.waitForTimeout(500);
  const s = await p.evaluate(() => { const G = window.__g.G; return { fight: G.enemies.filter((e) => !e.down && e.active && ["chase", "aim", "windup", "attack", "alert"].includes(e.state)).length, scene: G.scene }; });
  if (s.scene !== "raid") break;
  if (s.fight >= 1) { await p.screenshot({ path: `${OUT}/c${n++}.png` }); await p.waitForTimeout(2500); }
}
console.log("frames", n); await b.close();
