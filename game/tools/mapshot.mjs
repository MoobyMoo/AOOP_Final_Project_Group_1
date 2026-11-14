// Map v3 area captures at the default gameplay camera: node tools/mapshot.mjs <outdir> [base] [views] [extraQuery]
// One page load (?fresh=1&raid=1&peace=1), then the player is teleported to each area with __g.tp and a frame is
// captured after the camera settles. Prints draw calls, triangles and the density count (G1-21) per view and writes
// <outdir>/stats.json. base defaults to http://127.0.0.1:5340 (the built preview); never 5318 (Moo plays there).
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
const [out = "/tmp/mapv3/shots", base = "http://127.0.0.1:5340", only = "", extra = ""] = process.argv.slice(2);
if (new URL(base).port === "5318") throw new Error("port 5318 belongs to the owner's live server");
export const VIEWS = {
  beach: [-4, 99], ferry: [60, 100.5], ferry_in: [64, 101], cove: [-82, 96], checkpoint: [1, 82], fork: [0, 65], lookout: [-38, 61],
  camp: [-60, 28], camp_tower: [-70, 19], camp_gate: [-60, 42], plantation: [2, 22], farmhouse_in: [-4.5, 13.5], barn_in: [16.5, 24.5], vat: [-6, 32],
  mangrove: [49, 54], colony: [66, 5], cellblock_in: [66.5, -5.5], cellblock_cell: [64.5, -9.5], shrine: [44, -16], vault_door: [80, -19.5], vault: [81, -27],
  radio: [-27.5, -11.5], bomber: [-62, -42], hollow: [3, -54], falls: [66, -62], nook: [66, -81], checkpoint_n: [8, -82], landing: [12, -103], boathouse_in: [-6.5, -103.5],
  road_n: [0, 50], road_ridge: [-1, -20], road_west: [-66, -16], open_east: [40, 30], open_west: [-30, 40],
  grotto_mouth: [150, 62], grotto_hall: [168, 26], grotto_roots: [154, -24], tunnel: [190, 43],
};
const views = only ? only.split(",") : Object.keys(VIEWS);
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--use-angle=gl", "--enable-gpu", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errs = []; p.on("pageerror", (e) => errs.push(String(e))); p.on("console", (m) => { if (m.type() === "error" && !m.text().includes("404")) errs.push(m.text()); });
await p.goto(`${base}/game.html?fresh=1&raid=1&peace=1${extra}`);
await p.waitForFunction(() => window.__g?.world?.(), null, { timeout: 60000 }); await p.waitForTimeout(2500);
const world = await p.evaluate(() => { const w = window.__g.world(); return { ...w, lint: { errors: w.lint.errors, warnings: w.lint.warnings, stats: w.lint.stats } }; });
console.log("world", JSON.stringify(world));
const stats = { world, views: {} };
for (const v of views) {
  const [x, z] = VIEWS[v] ?? v.split(":").map(Number);
  await p.evaluate(([x, z]) => { const g = window.__g; g.tp(x, z); g.G.aimPoint.set(x, 0, z - 2); }, [x, z]);
  await p.mouse.move(800, 380); await p.waitForTimeout(1700);
  const s = await p.evaluate(() => { const g = window.__g; return { ...g.info(), ...g.density(), pp: [+g.G.pp.x.toFixed(1), +g.G.pp.z.toFixed(1)], area: g.G.area }; });
  stats.views[v] = s; console.log(v.padEnd(14), JSON.stringify(s));
  await p.screenshot({ path: `${out}/${v}.png` });
}
writeFileSync(`${out}/stats.json`, JSON.stringify(stats, null, 1));
if (errs.length) console.log("ERRORS:", [...new Set(errs)].slice(0, 12).join("\n"));
await b.close();
