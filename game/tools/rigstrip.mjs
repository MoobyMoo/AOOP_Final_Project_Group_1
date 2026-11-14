// Motion strip from the rig review page: node tools/rigstrip.mjs "<rig.html url>" out.png "t0,t1,..." [x,y,w,h] [cols]
// Loads the page once, scrubs the gameplay clock with window.__rig.setT(t) and tiles the cropped frames (ImageMagick).
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const [url, out, ts, rect = "500,120,600,680", cols = "8"] = process.argv.slice(2);
const [x, y, width, height] = rect.split(",").map(Number);
const b = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--use-angle=gl", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
await p.goto(url); await p.waitForFunction("window.__rig", null, { timeout: 20000 }); await p.waitForTimeout(1200);
const dir = mkdtempSync(join(tmpdir(), "rigstrip-")), files = [];
for (const t of ts.split(",")) {
  await p.evaluate((v) => window.__rig.setT(v), Number(t)); await p.waitForTimeout(160);
  const f = join(dir, `f${files.length}.png`); await p.screenshot({ path: f, clip: { x, y, width, height } }); files.push(f);
}
await b.close();
execFileSync("montage", [...files, "-tile", `${cols}x`, "-geometry", "+1+1", "-background", "#222", out]);
rmSync(dir, { recursive: true });
if (errs.length) console.log("ERRORS:", errs.join("\n"));
