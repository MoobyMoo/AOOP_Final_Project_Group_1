// Map v3 functional check with real input: node tools/mapfunc.mjs [base]
// Doors (open/close with E, locked needs its key, A* follows door state), breakables (briefcase on the ferry boards
// and the cellblock's cracked wall), a portal into the grotto, the zipline. Prints one PASS/FAIL line per check.
// base defaults to http://127.0.0.1:5340 (the built preview); never 5318.
import { chromium } from "playwright-core";
const base = process.argv[2] ?? "http://127.0.0.1:5340";
if (new URL(base).port === "5318") throw new Error("port 5318 belongs to the owner's live server");
const b = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--use-angle=gl", "--enable-gpu", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
await p.goto(`${base}/game.html?fresh=1&raid=1&peace=1`); await p.waitForFunction(() => window.__g?.world?.(), null, { timeout: 90000 }); await p.waitForTimeout(2500);
await p.mouse.click(640, 300);
const ev = (f, a) => p.evaluate(f, a);
const gate = (id) => ev((id) => { const g = window.__g.gates.find((q) => q.id === id); return g && { x: g.x, z: g.z, nx: g.nx, nz: g.nz, open: g.open }; }, id);
const tp = async (x, z) => { await ev(([x, z]) => window.__g.tp(x, z), [x, z]); await p.waitForTimeout(900); };
const aimAt = async (x, z) => { const s = await ev(([x, z]) => { const G = window.__g.G, v = G.pp.clone().set(x, G.pp.y + 1, z).project(G.stage.camera); return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight }; }, [x, z]); await p.mouse.move(s.x, s.y); await p.waitForTimeout(120); };
const results = []; const check = (name, ok, info = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${info ? "  " + info : ""}`); };
const side = (g, k) => [g.x + g.nx * k, g.z + g.nz * k];
// 1) a plain door: E opens it, A* goes through only when it is open, E closes it again
{ const id = "farmhouse:farm_front", g = await gate(id), out = side(g, 1.3), inn = side(g, -1.6);
  await tp(...out);
  const before = await ev(([a, c]) => window.__g.path(a[0], a[1], c[0], c[1]).length, [out, inn]);
  const lenClosed = await ev(([a, c]) => { const q = window.__g.path(a[0], a[1], c[0], c[1]); return window.__g.pathLength(q, a[0], a[1]); }, [out, inn]);
  await p.keyboard.press("e"); await p.waitForTimeout(700);
  const opened = (await gate(id)).open, lenOpen = await ev(([a, c]) => { const q = window.__g.path(a[0], a[1], c[0], c[1]); return window.__g.pathLength(q, a[0], a[1]); }, [out, inn]);
  check("door opens with E", opened); check("A* routes through the open door", lenOpen > 0 && lenOpen < 5 && (before === 0 || lenClosed > 8), `closed: ${lenClosed.toFixed(1)} u, open: ${lenOpen.toFixed(1)} u`);
  await p.keyboard.press("e"); await p.waitForTimeout(700); check("door closes with E", !(await gate(id)).open); }
// 2) a locked door: stays shut without its key, opens with it
{ const id = "radio:radio_door", g = await gate(id); await tp(...side(g, 1.3));
  await p.keyboard.press("e"); await p.waitForTimeout(500); const shut = !(await gate(id)).open;
  await ev(() => window.__g.G.pack.push("radio_key")); await p.keyboard.press("e"); await p.waitForTimeout(500);
  check("locked door refuses without the key", shut); check("locked door opens with the Radio Shack Key", (await gate(id)).open); }
// 3) breakables: the ferry's stern boards and the cellblock's cracked wall, with the briefcase
for (const [id, k, hits] of [["hull-boards", -1.25, 6], ["cellblock:brk0", -1.3, 11]]) {
  const g = await gate(id); let at = side(g, k); if (!(await ev(([x, z]) => window.__g.walkable(x, z), at))) at = side(g, -k);
  await tp(...at);
  for (let i = 0; i < hits && !(await gate(id)).open; i++) { await aimAt(g.x, g.z); await p.keyboard.press("v"); await p.waitForTimeout(620); }
  const through = await ev(([a, c]) => window.__g.path(a[0], a[1], c[0], c[1]).length > 0, [at, side(g, at[0] === side(g, k)[0] && at[1] === side(g, k)[1] ? -k * 1.4 : k * 1.4)]);
  check(`breakable ${id} breaks under the briefcase`, (await gate(id)).open); check(`${id}: the way through is walkable afterwards`, through); }
// 4) a portal into the grotto and back
{ await tp(-93.6, 91); await p.keyboard.press("e"); await p.waitForTimeout(1500);
  const under = await ev(() => window.__g.G.pp.x > 120); check("cove cave portal leads into the grotto", under);
  await p.keyboard.press("e"); await p.waitForTimeout(1500); check("and back up", await ev(() => window.__g.G.pp.x < 0)); }
// 5) the zipline from the plantation lookout to the beach
{ await tp(21, 11.2); await p.keyboard.press("e"); await p.waitForTimeout(9000);
  const pp = await ev(() => [window.__g.G.pp.x, window.__g.G.pp.z, !!window.__g.G.zipping]); check("zipline lands on the beach", !pp[2] && Math.hypot(pp[0] - 20, pp[1] - 100.6) < 2.5, `at ${pp[0].toFixed(1)}, ${pp[1].toFixed(1)}`); }
if (errs.length) console.log("PAGE ERRORS:", [...new Set(errs)].join("\n"));
console.log(`${results.filter((r) => r.ok).length}/${results.length} checks pass`);
await b.close(); process.exit(results.every((r) => r.ok) && !errs.length ? 0 : 1);
