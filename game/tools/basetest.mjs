// The vault and the Banana Express, end to end with real mouse and keys (G1.5 rows 17 and 33). Setup (a save with a
// finished look, the hatch position for the extraction) goes through ?dev hooks; every step under test is real input:
//   build    B opens build mode; click a card, aim the ghost at the floor with the mouse, R rotates, click places
//   blocked  a ghost over the pod is red and a click there builds nothing and charges nothing
//   relocate click a built facility, M, aim, click: free
//   pack up  click a built facility, X: it goes into storage as a token (Duckov's return), no money back; placing it
//            again is free and uses the token
//   persist  reload the page: the same layout and tokens
//   deploy   walk to the pod, E, click Exile Beach, Launch: free, lands on a beach candidate
//   extract  stand in the hatch ring (teleport there, then real waiting) and come home
//   deploy 2 a return alone keeps the Old Plantation Road locked (it opens with Sal's road map job: tools/questtest.mjs);
//            with the job's unlock granted through ?dev, double-click Launch: the 20 banana fare is paid once
// node tools/basetest.mjs [--shots DIR]   BASE=http://127.0.0.1:5357 (never 5318 or 5340). Exit code 1 on any failure.
import { chromium } from "playwright-core";
const BASE = process.env.BASE ?? "http://127.0.0.1:5357";
if (["5318", "5340"].includes(new URL(BASE).port)) throw new Error("that port belongs to another server");
const SHOTS = process.argv.includes("--shots") ? process.argv[process.argv.indexOf("--shots") + 1] : null;
const b = await chromium.launch({ executablePath: "/usr/bin/chromium", headless: !process.argv.includes("--headed"), args: ["--use-angle=gl", "--enable-gpu", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
let failed = 0; const log = (ok, name, note = "") => { if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${note ? "  " + note : ""}`); };
const G = (fn, arg) => p.evaluate(fn, arg);
const until = async (fn, arg, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await G(fn, arg)) return true; await p.waitForTimeout(50); } return false; };
const shot = async (name) => { if (SHOTS) { await p.waitForTimeout(350); await p.screenshot({ path: `${SHOTS}/${name}.png` }); } }; // 350 ms: panels fade in over 200
const save = () => G(() => JSON.parse(JSON.stringify({ money: window.__G.save.money, items: window.__G.save.base.items, tokens: window.__G.save.base.tokens, extracts: window.__G.save.stats.extracts })));
const bs = () => G(() => window.__g.home.build.state());
/** put the mouse over the cell the ghost's anchor should land on (Duckov's rounding: cursor - integer half-footprint) */
async function aimAt(ax, az, w, d, r) {
  const fw = r & 1 ? d : w, fd = r & 1 ? w : d, cx = ax + Math.floor(fw / 2), cz = az + Math.floor(fd / 2);
  const s = await G(([x, z]) => window.__g.home.build.cellToScreen(x, z), [cx, cz]);
  await p.mouse.move(s.x - 30, s.y - 20); await p.mouse.move(s.x, s.y, { steps: 6 }); await p.waitForTimeout(120);
  return s;
}
const clickCell = async (x, z) => { const s = await G(([a, c]) => window.__g.home.build.cellToScreen(a, c), [x, z]); await p.mouse.move(s.x, s.y, { steps: 4 }); await p.waitForTimeout(80); await p.mouse.click(s.x, s.y); await p.waitForTimeout(150); };

// ---- a new player with a look and 300 bananas, straight into the vault
await p.goto(`${BASE}/game.html?dev&fresh`);
await p.waitForFunction(() => window.__G?.save, null, { timeout: 120000 });
await G(() => localStorage.setItem("bv_g1", JSON.stringify({ ...window.__G.save, lookDone: true, money: 300 })));
await p.goto(`${BASE}/game.html?dev`);
await p.waitForFunction(() => window.__G?.scene === "bunker" && window.__g?.home, null, { timeout: 120000 });
await p.waitForTimeout(1500);
{ const s = await save(); log(s.items.length === 0, "a new vault starts empty", `${s.items.length} facilities`); }
await shot("01-empty-vault");

// ---- build two
await p.keyboard.press("b"); await p.waitForSelector(".bld3-cat");
log((await bs()).mode === "browse", "B opens build mode");
await p.waitForTimeout(400);
await p.click('.bcard[data-b="fence"]');
await aimAt(-1, -9, 4, 2, 0); // over the pod's landing spot and front: must be red
{ const st = await bs(); log(st.mode === "place" && !st.cursor.ok, "the ghost over the pod is blocked", st.cursor.reason); }
await shot("02-build-blocked");
{ const before = await save(); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(200); const after = await save(); log(after.items.length === 0 && after.money === before.money, "a blocked click builds nothing and charges nothing"); }
await aimAt(3, -5, 4, 2, 0);
{ const st = await bs(); log(st.cursor.ok, "the ghost fits on open floor", JSON.stringify(st.cursor)); }
await shot("03-build-ghost");
{ const s0 = await save(); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(250); const s1 = await save(); const f = s1.items.find((i) => i.def === "fence");
  log(!!f && f.x === 3 && f.z === -5 && f.r === 0 && s1.money === s0.money, "built the Fence's window (free)", JSON.stringify(f)); }
await p.click('.bcard[data-b="sal"]');
await p.keyboard.press("r"); await p.waitForTimeout(100);
await aimAt(10, -6, 3, 2, 1);
{ const s0 = await save(); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(250); const s1 = await save(); const d = s1.items.find((i) => i.def === "sal");
  log(!!d && d.r === 1 && d.x === 10 && d.z === -6 && s1.money === s0.money - 30, "built Sal's desk, rotated once, for 30", `${JSON.stringify(d)} money ${s0.money} -> ${s1.money}`); }
await shot("04-built-two");

// ---- relocate Sal's desk (free)
{ const s0 = await save(), d = s0.items.find((i) => i.def === "sal");
  await clickCell(d.x, d.z + 1); log((await bs()).selected === d.uid, "click a built facility selects it");
  await p.keyboard.press("m"); await p.waitForTimeout(150); log((await bs()).mode === "move", "M starts moving it");
  await aimAt(9, 2, 3, 2, 1); await shot("05-relocate-ghost"); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(250);
  const s1 = await save(), m = s1.items.find((i) => i.uid === d.uid);
  log(m.x === 9 && m.z === 2 && s1.money === s0.money, "relocated for free", `${JSON.stringify(m)} money ${s1.money}`); }

// ---- pack up the paid one, then place it again from storage
{ const s0 = await save(), d = s0.items.find((i) => i.def === "sal");
  await clickCell(d.x, d.z); await p.keyboard.press("x"); await p.waitForTimeout(250);
  const s1 = await save();
  log(!s1.items.some((i) => i.def === "sal") && s1.tokens.sal === 1 && s1.money === s0.money, "packed up: one token in storage, no bananas back", `tokens ${JSON.stringify(s1.tokens)} money ${s1.money}`);
  const card = await p.locator('.bcard[data-b="sal"] .bp').innerText(); log(/storage/i.test(card), "the card says it's in storage", card); }
{ const s0 = await save(); await p.click('.bcard[data-b="sal"]'); await aimAt(9, 2, 3, 2, 0); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(250);
  const s1 = await save(); log(s1.items.some((i) => i.def === "sal") && !s1.tokens.sal && s1.money === s0.money, "placed again from storage for free", `money ${s1.money} tokens ${JSON.stringify(s1.tokens)}`); }
{ const s0 = await save(), f = s0.items.find((i) => i.def === "fence"); await clickCell(f.x + 1, f.z); await p.keyboard.press("x"); await p.waitForTimeout(250);
  const s1 = await save(); log(s1.tokens.fence === 1 && s1.money === s0.money, "packed up the Fence's window too", JSON.stringify(s1.tokens)); }
await shot("06-build-mode");
await p.keyboard.press("Escape"); await p.waitForTimeout(150); await p.keyboard.press("Escape"); await p.waitForTimeout(250);
log((await bs()).mode === "off", "Esc leaves build mode");

// ---- persist
const kept = await save();
await p.reload(); await p.waitForFunction(() => window.__G?.scene === "bunker" && window.__g?.home, null, { timeout: 120000 }); await p.waitForTimeout(1200);
{ const s = await save(); log(JSON.stringify(s.items) === JSON.stringify(kept.items) && JSON.stringify(s.tokens) === JSON.stringify(kept.tokens) && s.money === kept.money, "the layout and storage survive a reload", JSON.stringify({ items: s.items, tokens: s.tokens })); }
await shot("07-after-reload");

// ---- the locker (starter fixture, moved onto the back wall): E opens the shared loot screen on your stored gear
await G(() => window.__g.home.pos.set(-7, 0, -10.8)); await p.waitForTimeout(200);
await p.keyboard.press("e");
log(await until(() => !!document.querySelector(".lv") && /Locker/.test(document.querySelector(".lv")?.textContent ?? ""), null, 3000), "E at the locker opens the locker screen");
await shot("07b-locker");
await p.keyboard.press("Escape"); await p.waitForTimeout(300);
log(!(await p.locator(".lv").count()), "Esc closes the locker");
await G(() => window.__g.home.pos.set(0, 0, -8.2)); await p.waitForTimeout(200);

// ---- deploy to Exile Beach through the pod
const walkToPod = async () => { await p.keyboard.down("w"); await until(() => window.__g.home.stations().length && document.getElementById("hp")?.classList.contains("on"), null, 3000); await p.keyboard.up("w"); await p.waitForTimeout(150); };
await walkToPod();
await p.keyboard.press("e"); await p.waitForSelector(".panel.dest .dcard");
log((await p.locator('.dcard[data-a="dest:plantation"]').isDisabled()), "Old Plantation Road is locked on a new save", await p.locator('.dcard[data-a="dest:plantation"] .dlock').innerText());
await shot("08-pod-board");
await p.click('.dcard[data-a="dest:beach"]'); await p.waitForSelector(".panel.dest.confirm");
await shot("09-confirm-beach");
{ const m0 = (await save()).money; await p.click('button[data-a="launch:beach"]');
  log(await until(() => window.__g.home.launching(), null, 1000), "Launch starts the pod");
  await p.waitForTimeout(1300); await shot("10-pod-launch");
  log(await until(() => window.__G.scene === "raid", null, 20000), "arrived in the raid");
  const sp = await G(() => window.__g.spawn()); const m1 = await G(() => window.__G.save.money);
  log(sp?.entry.group === "beach" && !sp.fallback && m1 === m0, "landed on a beach candidate, no fare", `${sp?.entry.id} clearance ${sp?.clearance?.toFixed(1)} fallback ${sp?.fallback} money ${m0}->${m1}`); }
await p.waitForTimeout(1500); await shot("11-arrived-beach");

// ---- extract at the hatch and come home
{ const ex = await G(() => window.__g.exits().find((e) => e.id === "hatch"));
  await G(([x, z]) => window.__g.tp(x + 10, z - 4), [ex.x, ex.z]); await p.waitForTimeout(400);
  await G(([x, z]) => window.__g.tp(x, z), [ex.x, ex.z]);
  log(await until(() => window.__G.scene === "bunker", null, 15000), "extracted at the hatch and came home");
  await p.waitForTimeout(800); const s = await save(); log(s.extracts === 1, "one successful return counted", `extracts ${s.extracts}`);
  await p.keyboard.press("e"); await p.waitForTimeout(300); } // close the payout slip

// ---- deploy to the Old Plantation Road: double-click Launch, pay once
await walkToPod();
await p.keyboard.press("e"); await p.waitForSelector(".panel.dest .dcard");
log((await p.locator('.dcard[data-a="dest:plantation"]').isDisabled()) && /road map/i.test(await p.locator('.dcard[data-a="dest:plantation"] .dlock').innerText()), "a return alone doesn't open the plantation road: the road map job does");
await p.keyboard.press("Escape"); await p.waitForTimeout(250);
await G(() => { window.__G.save.quests.unlocks.push("dest:plantation"); window.__g.home.refresh(); }); // setup: the road map job's unlock (core/quests.ts)
await p.keyboard.press("e"); await p.waitForSelector(".panel.dest .dcard");
log(!(await p.locator('.dcard[data-a="dest:plantation"]').isDisabled()), "Old Plantation Road is open with the job's unlock");
await shot("12-pod-board-unlocked");
await p.click('.dcard[data-a="dest:plantation"]'); await p.waitForSelector(".panel.dest.confirm");
await shot("13-confirm-plantation");
{ const m0 = (await save()).money; await p.dblclick('button[data-a="launch:plantation"]'); await p.waitForTimeout(100);
  const m1 = await G(() => window.__G.save.money);
  log(m1 === m0 - 20, "a double-click on Launch pays the fare once", `${m0} -> ${m1}`);
  log(await until(() => window.__G.scene === "raid", null, 20000), "arrived on the plantation road");
  const sp = await G(() => window.__g.spawn()), m2 = await G(() => window.__G.save.money), stored = await G(() => JSON.parse(localStorage.getItem("bv_g1")).money);
  log(sp?.entry.group === "plantation-road" && m2 === m0 - 20 && stored === m0 - 20, "landed inland; fare saved once", `${sp?.entry.id} (${sp?.entry.x}, ${sp?.entry.z}) clearance ${sp?.clearance?.toFixed(1)} fallback ${sp?.fallback} money ${m2} stored ${stored}`); }
await p.waitForTimeout(1500); await shot("14-arrived-plantation-road");

if (errs.length) { console.log("page errors:", errs.slice(0, 5)); failed++; }
await b.close();
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
