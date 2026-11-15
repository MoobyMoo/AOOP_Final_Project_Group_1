// Captures of the vault for the look review (vault v3): empty, then built up, from the play camera.
//   BASE=http://127.0.0.1:5354 node tools/vaultshots.mjs <out_dir>      (a production build; never 5318 or 5340)
// Setup goes through the ?dev hooks (a save with a look, money, Sal moved in, the three upgrades, trophies); the
// facilities are placed with the build API. The player is moved by setting its position, then the camera settles.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
const BASE = process.env.BASE ?? "http://127.0.0.1:5354", OUT = process.argv[2] ?? "/tmp/vault_v3";
if (["5318", "5340"].includes(new URL(BASE).port)) throw new Error("that port belongs to another server");
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--use-angle=gl", "--enable-gpu", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errs = []; p.on("pageerror", (e) => errs.push(String(e))); p.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errs.push(m.text()); });
const shot = async (name) => { await p.waitForTimeout(500); await p.screenshot({ path: `${OUT}/${name}.jpg`, quality: 90 }); console.log("shot", name); };
const at = async (x, z) => { await p.evaluate(([x, z]) => { window.__g.home.pos.set(x, 0, z); }, [x, z]); await p.waitForTimeout(1400); };
const boot = async (extra) => {
  await p.goto(`${BASE}/game.html?dev&fresh`); await p.waitForFunction(() => window.__G?.save, null, { timeout: 120000 });
  await p.evaluate((extra) => localStorage.setItem("bv_g1", JSON.stringify({ ...window.__G.save, lookDone: true, ...extra })), extra);
  await p.goto(`${BASE}/game.html?dev`); await p.waitForFunction(() => window.__G?.scene === "bunker" && window.__g?.home, null, { timeout: 120000 });
  await p.waitForTimeout(1800);
};

// ---- a new vault: the pod, the board, the blueprint desk, the locker and mirror
await boot({ money: 300 });
await shot("01-empty-spawn");
await at(-5, -8.6); await shot("02-empty-locker-blueprints");
await at(7, -8.4); await shot("03-empty-vault-door");
await at(13, 7); await shot("04-empty-east-wall");
await at(-13, 9); await shot("05-empty-open-corner");
await p.keyboard.press("b"); await p.waitForSelector(".bld3-cat"); await p.waitForTimeout(900); await shot("06-empty-build-mode");
await p.keyboard.press("Escape"); await p.waitForTimeout(300);

// ---- built up: every facility, Sal moved in, the three upgrades bought, trophies on the wall
await boot({ money: 5000, salMovedIn: true, upgrades: { mag: 1, pack: 1, heart: 1 }, trophies: ["golden_banana", "banana_idol", "brass_compass"] });
const LAYOUT = [["fence", -14, -12, 0], ["stash", 11, -12, 0], ["stash", 14, -12, 0], ["trophy", 16, -9, 3], ["sal", 15, -4, 3], ["med", 16, 1, 3], ["bench", 4, -7, 0],
  ["generator", 10, -5, 0], ["press", 12, -5, 0], ["desk", -9, -6, 0], ["plant", -10, -7, 0], ["plant", -5, -7, 0], ["plant", 4, -12, 0]];
const placed = await p.evaluate((L) => { const B = window.__g.home.build; B.open(); const out = L.map(([id, x, z, r]) => { B.choose(id); return [id, B.confirmAt(x, z, r)]; }); B.close(); return out; }, LAYOUT);
console.log("placed", placed.filter(([, ok]) => ok).length, "of", placed.length, placed.filter(([, ok]) => !ok).map(([id]) => id).join(" "));
await p.waitForTimeout(1200);
await at(0, -8.2); await shot("10-built-spawn");
await at(-10, -8); await shot("11-built-fence-locker-desk");
await at(7, -6.4); await shot("12-built-door-bench-machines");
await at(12.5, -8.6); await shot("13-built-stash-trophy");
await at(12.5, -1.5); await shot("14-built-sal-med");
await at(-9, -3.4); await shot("15-built-managers-desk");
await p.keyboard.press("b"); await p.waitForSelector(".bld3-cat"); await p.waitForTimeout(900); await shot("16-built-build-mode");
await p.keyboard.press("Escape"); await p.waitForTimeout(300);
// the launch: door shut, gauge up, the monkey in the tube
await at(0, -8.6);
await p.evaluate(() => window.__g.home.act("launch:beach"));
await p.waitForTimeout(1150); await p.screenshot({ path: `${OUT}/17-pod-launch.jpg`, quality: 90 }); console.log("shot 17-pod-launch");
const info = await p.evaluate(() => window.__g.info?.());
console.log(JSON.stringify({ info, errs: errs.slice(0, 12) }));
await b.close();
