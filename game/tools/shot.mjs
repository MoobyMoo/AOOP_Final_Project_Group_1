// Scripted capture: node tools/shot.mjs <url> <out.png> [waitMs] [evalJS]
// Uses the system chromium with the GPU (ANGLE/GL) so fps numbers mean something.
import { chromium } from "playwright-core";
const [url, out, wait = "2500", js] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--use-angle=gl", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errs = [];
p.on("pageerror", (e) => errs.push(String(e))); p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
await p.goto(url); await p.waitForTimeout(+wait);
if (js) console.log(JSON.stringify(await p.evaluate(js)));
await p.screenshot({ path: out });
console.log("renderer:", await p.evaluate(() => { const g = document.createElement("canvas").getContext("webgl2"); const d = g.getExtension("WEBGL_debug_renderer_info"); return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : "?"; }));
if (errs.length) console.log("ERRORS:", errs.join("\n"));
await b.close();
