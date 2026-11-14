// Scripted real-input playtest: node tools/play.mjs <script> [outdir]
// Scripts: "combat" (walk to Palm Edge, shoot + bonk monkeys, roll), "crate" (open the nearest crates)
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
const [script = "combat", out = "/tmp/g1/play"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--use-angle=gl", "--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errs = []; p.on("pageerror", (e) => errs.push(String(e))); p.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errs.push(m.text()); });
await p.goto("http://localhost:5318/game.html?fresh=1"); await p.waitForTimeout(6000);
const st = () => p.evaluate(() => { const G = window.__g.G; return { pp: [+G.pp.x.toFixed(1), +G.pp.z.toFixed(1)], hp: G.hp, stamina: Math.round(G.stamina), mag: G.mag, ammo: G.ammo, pack: G.pack.slice(), raidT: +G.raidT.toFixed(1), log: G.log, enemies: G.enemies.filter((e) => e.active).map((e) => ({ k: e.kind, s: e.state, hp: e.hp, d: +Math.hypot(e.p.x - G.pp.x, e.p.z - G.pp.z).toFixed(1) })) }; });
const scr = (x, z) => p.evaluate(([x, z]) => { const G = window.__g.G; const THREE_v = G.pp.clone().set(x, G.pp.y + 1, z).project(G.stage.camera); return { x: (THREE_v.x * 0.5 + 0.5) * innerWidth, y: (-THREE_v.y * 0.5 + 0.5) * innerHeight }; }, [x, z]);
const nearestEnemy = () => p.evaluate(() => { const G = window.__g.G; let best = null, bd = 1e9; for (const e of G.enemies) { if (e.down) continue; const d = Math.hypot(e.p.x - G.pp.x, e.p.z - G.pp.z); if (d < bd) { bd = d; best = e; } } return best ? { x: best.p.x, z: best.p.z, d: bd, kind: best.kind, state: best.state } : null; });
const walkTo = async (x, z, maxMs = 12000) => { // follow the game's A* path with camera-relative WASD
  const t0 = Date.now(); while (Date.now() - t0 < maxMs) {
    const s = await st(); if (Math.hypot(x - s.pp[0], z - s.pp[1]) < 1.2) break;
    const wp = await p.evaluate(([x, z]) => { const g = window.__g; const P = g.path(g.G.pp.x, g.G.pp.z, x, z); return P[0] ?? { x, z }; }, [x, z]);
    const dx = wp.x - s.pp[0], dz = wp.z - s.pp[1];
    const yaw = -30 * Math.PI / 180, c = Math.cos(-yaw), sn = Math.sin(-yaw); const lx = dx * c + dz * sn, lz = -dx * sn + dz * c; // world → camera space
    for (const k of ["w", "a", "s", "d"]) await p.keyboard.up(k);
    const m = Math.max(Math.abs(lx), Math.abs(lz)); if (lz < -0.4 * m) await p.keyboard.down("w"); if (lz > 0.4 * m) await p.keyboard.down("s"); if (lx < -0.4 * m) await p.keyboard.down("a"); if (lx > 0.4 * m) await p.keyboard.down("d");
    await p.waitForTimeout(120);
  } for (const k of ["w", "a", "s", "d"]) await p.keyboard.up(k);
};
let shot = 0; const snap = async (n) => { await p.screenshot({ path: `${out}/${String(shot++).padStart(2, "0")}_${n}.png` }); };
await p.mouse.move(800, 300); await p.mouse.click(800, 300); // unlock audio
if (script === "combat") {
  await walkTo(0, 50); await snap("palms"); console.log("at palms", JSON.stringify(await st()));
  for (let i = 0; i < 40; i++) {
    const e = await nearestEnemy(); if (!e || e.d > 14) { await p.waitForTimeout(150); continue; }
    const s = await scr(e.x, e.z); await p.mouse.move(s.x, s.y);
    if (e.d < 2.4) await p.keyboard.press("v");
    else { await p.mouse.down(); await p.waitForTimeout(240); await p.mouse.up(); }
    if (e.state === "windup" || e.state === "throwing") { await p.keyboard.press(" "); }
    if (i === 4 || i === 12) await snap("fight" + i);
    await p.waitForTimeout(120);
  }
  await snap("after"); console.log("after fight", JSON.stringify(await st()));
}
if (script === "crate") {
  for (const [x, z] of [[-7, 47], [8, 50]]) { await walkTo(x + 0.8, z + 1.2); await p.keyboard.press("e"); await p.waitForTimeout(1300); await snap(`crate_${x}`); await p.waitForTimeout(400); await walkTo(x + 1.5, z - 1.5, 2500); await walkTo(x - 1.5, z + 0.5, 2500); }
  console.log("crates", JSON.stringify(await st()));
}
console.log("errors:", errs.filter((e) => !e.includes("404")).slice(0, 8).join("\n") || "none");
await b.close();
