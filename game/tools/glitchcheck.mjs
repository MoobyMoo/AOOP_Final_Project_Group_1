// Glitch hunt driver (G1.5-12). Runs src/game/dev/glitch.ts in the built game and writes the findings, then crops
// every bug/visible finding (or the spots given with --at) at the default camera and a close one.
//   node tools/glitchcheck.mjs [--base http://127.0.0.1:5344] [--out /tmp/bv-gh/glitch] [--seed 4242] [--crops 60]
//                              [--no-assets] [--no-crops] [--at "name:x,z;name2:x,z"] [--min visible|minor|bug] [--cols]
// --cols draws every movement collider as a red outline on the crops.
// BASE env works too. Never port 5318 (Moo's server) or 5340. Exit code 1 when a bug-level finding is left.
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
const A = process.argv.slice(2), arg = (k, d) => { const i = A.indexOf("--" + k); return i < 0 ? d : A[i + 1]; }, flag = (k) => A.includes("--" + k);
const base = arg("base", process.env.BASE ?? "http://127.0.0.1:5344"), out = arg("out", "/tmp/bv-gh/glitch"), seed = arg("seed", "4242");
const maxCrops = Number(arg("crops", 60)), at = arg("at", ""), minSev = arg("min", "visible");
if (["5318", "5340"].includes(new URL(base).port)) throw new Error("ports 5318 and 5340 are not ours");
mkdirSync(out + "/crops", { recursive: true });
const b = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--use-angle=gl", "--enable-gpu", "--ignore-gpu-blocklist"] });
const errs = [];
async function open(extra = "") {
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  p.on("pageerror", (e) => errs.push(String(e))); p.on("console", (m) => { if (m.type() === "error" && !m.text().includes("404")) errs.push(m.text()); });
  await p.goto(`${base}/game.html?fresh=1&raid=1&peace=1&glitch=1&seed=${seed}${extra}`);
  await p.waitForFunction(() => window.__g?.world?.() && window.__glitch, null, { timeout: 90000 }); await p.waitForTimeout(2000);
  return p;
}
const p = await open();
let spots = [];
if (!at || flag("check")) {
  const r = await p.evaluate((assets) => window.__glitch.run({ assets }), !flag("no-assets"));
  writeFileSync(`${out}/glitch.json`, JSON.stringify(r, null, 1));
  console.log("owners", r.owners, "ms", JSON.stringify(r.ms));
  console.log("by severity", JSON.stringify(r.bySev), "by category", JSON.stringify(r.byCat));
  const order = { bug: 0, visible: 1, minor: 2, accepted: 3 };
  const fs = r.findings.sort((x, y) => order[x.sev] - order[y.sev] || x.cat.localeCompare(y.cat) || y.v - x.v);
  for (const f of fs) if (order[f.sev] <= order[minSev]) console.log(`${f.sev.padEnd(7)} ${f.cat.padEnd(8)} ${String(f.x).padStart(7)},${String(f.z).padStart(7)}  ${f.what}${f.why ? "  [accepted: " + f.why + "]" : ""}`);
  for (const f of fs) if (f.sev === "accepted") console.log(`accepted ${f.cat.padEnd(8)} ${String(f.x).padStart(7)},${String(f.z).padStart(7)}  ${f.what}  -- ${f.why}`);
  // crop list: bug + visible, one per 3 u, skipping the asset-level rows (no world position)
  const kept = [];
  for (const f of fs) { if (order[f.sev] > 1 || f.src === "asset") continue; if (kept.some((k) => Math.hypot(k.x - f.x, k.z - f.z) < 3)) continue; kept.push(f); }
  spots = kept.slice(0, maxCrops).map((f, i) => ({ name: `${String(i).padStart(2, "0")}_${f.cat}_${f.k.replace(/[^a-z0-9_|-]/gi, "").replace(/\|/g, "-").slice(0, 28)}`, x: f.x, y: f.y, z: f.z }));
  r.crops = spots; writeFileSync(`${out}/glitch.json`, JSON.stringify(r, null, 1));
}
if (at) spots = at.split(";").filter(Boolean).map((s) => { const [name, xyz] = s.split(":"), [x, z, y] = xyz.split(",").map(Number); return { name, x, z, y }; });
async function crops(page, tag) {
  if (flag("cols")) await page.evaluate(() => window.__glitch.showColliders(true));
  if (!flag("cut")) await page.evaluate(() => window.__glitch.cutout(false)); // --cut keeps the see-through on
  for (const s of spots) {
    const y = await page.evaluate(([x, z, y]) => { const g = window.__g; const gy = Number.isFinite(y) ? y : g.G.pp.y; g.tp(x + 3.5, z); g.G.aimPoint.set(x + 7, 0, z); return Number.isFinite(y) ? y : gy; }, [s.x, s.z, s.y]);
    await page.mouse.move(1500, 450); await page.waitForTimeout(1400);
    const sc = await page.evaluate(([x, y, z]) => window.__glitch.screenOf(x, y, z), [s.x, s.y ?? y, s.z]);
    const w = 400, h = 280, cx = Math.max(0, Math.min(1600 - w, sc.x - w / 2)), cy = Math.max(0, Math.min(900 - h, sc.y - h / 2));
    await page.screenshot({ path: `${out}/crops/${s.name}_${tag}.png`, clip: { x: cx, y: cy, width: w, height: h } });
  }
}
if (!flag("no-crops") && spots.length) {
  await crops(p, "far");
  const q = await open("&dist=18&pitch=40"); await crops(q, "close"); await q.close();
  console.log(`crops: ${spots.length} spots x 2 cameras in ${out}/crops`);
}
if (errs.length) console.log("PAGE ERRORS:", [...new Set(errs)].slice(0, 10).join("\n"));
await b.close();
try { const r = JSON.parse((await import("node:fs")).readFileSync(`${out}/glitch.json`, "utf8")); process.exitCode = r.bySev?.bug ? 1 : 0; } catch { /* --at only */ }
