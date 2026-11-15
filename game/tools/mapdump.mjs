// Map v3 lint + blockout from the real build: node tools/mapdump.mjs [out.svg]   (SEED=n for another world seed)
// Loads the built game (BASE, default http://127.0.0.1:5340: `npx vite build && npx vite preview --port 5340`),
// prints the lint report (reachability, gating and key order, time budget, rule-9 road gaps) and writes a top-down
// SVG of the outline, zones, roads, colliders, gates, sockets and scatter. Exits 1 if the lint has errors.
// Never port 5318: Moo plays there.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { chromium } from "playwright-core";
const out = process.argv[2] ?? "/tmp/mapv3/blockout.svg", BASE = process.env.BASE ?? "http://127.0.0.1:5340", seed = process.env.SEED;
if (new URL(BASE).port === "5318") throw new Error("port 5318 belongs to the owner's live server");
const b = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--use-angle=gl", "--enable-gpu", "--ignore-gpu-blocklist"] });
const p = await b.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
await p.goto(`${BASE}/game.html?fresh=1&raid=1&peace=1${seed ? `&seed=${seed}` : ""}`);
await p.waitForFunction(() => window.__g?.world?.(), null, { timeout: 90000 });
// the exact lint (G1.5-13): the demo's route locks must hold at a monkey's real radius, not just on the nav raster
const r = await p.evaluate(() => { const g = window.__g, w = g.world(); return { lint: g.lint({ exact: true }), world: { seed: w.seed, placed: w.placed, scattered: w.scattered, edge: w.edge, kitTris: w.kitTris, grass: w.grass, buildMs: w.ms }, svg: g.svg() }; });
await b.close();
console.log(JSON.stringify({ ...r.lint, world: r.world }, null, 1)); if (errs.length) console.log("PAGE ERRORS:", errs.join("\n"));
mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, r.svg); console.log("wrote", out);
process.exit(r.lint.errors.length || errs.length ? 1 : 0);
