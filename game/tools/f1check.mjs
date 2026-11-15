// G1 fix round F1 checks (cutaways in motion, combat cues in slow motion, the campfire). Built preview only.
// node tools/f1check.mjs <outdir> <base> [walk,door,muzzle,cues,fire]
//   walk   the hero steps behind the big hollow bush, eight frames (hero cutout: clean hole, grain only in the rim)
//   door   the hero steps in through the farmhouse's outside door and back out at quarter speed, a frame every ~70 ms
//          across the roof fade (0.12 s game time), so mid-fade frames are in the set
//   muzzle one pistol shot at 1/10 speed: the flash while it is alive
//   cues   next to a bandit and a brute at 1/5 speed: the "!" bubble, the wind-up cue, damage numbers on a hit
//   fire   the Peel Gang campfire, three frames
// Never 5318 or 5340 (the owner's and the lead's servers).
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
const [out = "/tmp/f1check", base = "http://127.0.0.1:5341", only = "walk,door,muzzle,cues,fire"] = process.argv.slice(2);
if (["5318", "5340"].includes(new URL(base).port)) throw new Error("ports 5318 and 5340 are taken");
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--use-angle=gl", "--enable-gpu", "--ignore-gpu-blocklist"] });
const errs = [];
async function open(q) {
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  p.on("pageerror", (e) => errs.push(String(e))); p.on("console", (m) => { if (m.type() === "error" && !m.text().includes("404")) errs.push(m.text()); });
  await p.goto(`${base}/game.html?fresh=1&raid=1${q}`);
  await p.waitForFunction(() => window.__g?.world?.() && window.__g.G.scene === "raid", null, { timeout: 90000 }); await p.waitForTimeout(2500);
  return p;
}
const tp = (p, x, z, ax = x, az = z - 2) => p.evaluate(([x, z, ax, az]) => { const g = window.__g; g.tp(x, z); g.G.aimPoint.set(ax, 0, az); }, [x, z, ax, az]);
const want = (k) => only.split(",").includes(k);

if (want("walk")) {
  const p = await open("&peace=1"); await p.mouse.move(800, 380);
  await tp(p, 3, -54); await p.waitForTimeout(1500);
  // right = (0.866, 0.5), toward the camera = (-0.5, 0.866) on the ground at the default yaw of -30 degrees
  for (let i = 0; i < 8; i++) { const t = -2.4 + i * 0.75; await tp(p, 5.45 + 0.866 * t, -50.7 + 0.5 * t); await p.waitForTimeout(1300); await p.screenshot({ path: `${out}/walk${i}.png` }); }
  await p.close();
}
if (want("door")) {
  const p = await open("&peace=1&ts=0.25"); await p.mouse.move(800, 380);
  // the farmhouse's outside door: the one door with exactly one side inside an interior volume
  const door = await p.evaluate(() => {
    const g = window.__g, h = g.houses.find((h) => h.kind.startsWith("farmhouse")) ?? g.houses[0], yaw = h.p.yaw ?? 0, c = Math.cos(yaw), s = Math.sin(yaw);
    const inside = (x, z) => { const dx = x - h.p.x, dz = z - h.p.z, lx = dx * c - dz * s, lz = dx * s + dz * c; return h.def.interiors.some((i) => Math.abs(lx - i.x) < i.w / 2 && Math.abs(lz - i.z) < i.d / 2); };
    for (const d of g.gates) { if (d.kind !== "door" || !d.id.startsWith(h.id + ":")) continue; const a = inside(d.x + d.nx * 1.6, d.z + d.nz * 1.6), b = inside(d.x - d.nx * 1.6, d.z - d.nz * 1.6); if (a !== b) { g.setGate(d.id, true); return { id: d.id, x: d.x, z: d.z, nx: d.nx * (a ? 1 : -1), nz: d.nz * (a ? 1 : -1) }; } }
    return null;
  });
  console.log("door", JSON.stringify(door));
  const at = (k) => [door.x + door.nx * k, door.z + door.nz * k];   // k > 0 is indoors
  await tp(p, ...at(-2.4)); await p.waitForTimeout(7000); let n = 0;
  for (const k of [1.6, -2.4]) { await tp(p, ...at(k)); for (let i = 0; i < 9; i++) { await p.screenshot({ path: `${out}/door${String(n++).padStart(2, "0")}.png` }); await p.waitForTimeout(20); } await p.waitForTimeout(6000); await p.screenshot({ path: `${out}/door${String(n++).padStart(2, "0")}.png` }); }
  await p.close();
}
if (want("muzzle")) {
  const p = await open("&peace=1&ts=0.1");                         // 1/10 speed: the 55 ms flash lasts about half a second
  await tp(p, -60, 40); await p.mouse.move(520, 470); await p.waitForTimeout(14000);
  await p.mouse.down(); for (let i = 0; i < 6; i++) { await p.waitForTimeout(40); await p.screenshot({ path: `${out}/muzzle${i}.png` }); } await p.mouse.up();
  await p.close();
}
if (want("cues")) {
  const p = await open("&ts=0.2"); await p.mouse.move(800, 380); const where = {};
  for (const kind of ["bandit", "brute"]) {
    const e = await p.evaluate((kind) => { const g = window.__g, e = g.G.enemies.find((e) => e.kind === kind && !e.down && e.state === "patrol"); return e ? { id: e.id, x: e.p.x, z: e.p.z } : null; }, kind);
    if (!e) { console.log("no", kind); continue; }
    await p.evaluate((e) => { const g = window.__g; g.G.hp = g.G.maxHp; g.tp(e.x - 7, e.z + 12); }, e); await p.waitForTimeout(7000);   // let the camera arrive first
    await p.evaluate((id) => { const g = window.__g, e = g.G.enemies.find((e) => e.id === id); g.tp(e.p.x - 2.2, e.p.z + 3.8); }, e.id);
    const seen = new Set(); let shots = 0;
    for (let t = 0; t < 900 && seen.size < 3; t++) {
      const st = await p.evaluate((id) => { const g = window.__g, e = g.G.enemies.find((e) => e.id === id); g.G.hp = g.G.maxHp; const v = e.p.clone().setY(e.p.y + 1.4).project(g.G.stage.camera); return { state: e.state, t: e.t, x: Math.round((v.x * 0.5 + 0.5) * innerWidth), y: Math.round((-v.y * 0.5 + 0.5) * innerHeight), floaters: document.querySelectorAll(".floater").length, down: e.down }; }, e.id);
      if (st.down) break;
      await p.mouse.move(st.x, st.y);
      const key = st.state === "notice" ? "notice" : st.state === "windup" ? (st.t < 0.22 ? "windup" : null) : st.floaters ? "hit" : null;
      if (key && !seen.has(key)) { seen.add(key); where[`cue_${kind}_${key}`] = [st.x, st.y]; await p.screenshot({ path: `${out}/cue_${kind}_${key}.png` }); }
      if (!seen.has("hit") && shots++ % 10 === 9) { await p.mouse.down(); await p.waitForTimeout(50); await p.mouse.up(); }
      await p.waitForTimeout(30);
    }
    console.log(kind, [...seen].join(","));
  }
  writeFileSync(`${out}/cues.json`, JSON.stringify(where));
  await p.close();
}
if (want("fire")) {
  const p = await open("&peace=1"); await p.mouse.move(800, 380);
  await tp(p, -60, 28); await p.waitForTimeout(2000);
  for (let i = 0; i < 3; i++) { await p.screenshot({ path: `${out}/fire${i}.png` }); await p.waitForTimeout(350); }
  await p.close();
}
if (errs.length) console.log("ERRORS:", [...new Set(errs)].slice(0, 12).join("\n"));
await b.close();
