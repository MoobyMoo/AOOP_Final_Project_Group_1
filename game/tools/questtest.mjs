// The first job end to end with real mouse and keys (G1.5 row 40; Moo: "we need to unlock something to be able to TP
// there"). Setup goes through ?dev hooks (a finished look, standing next to someone, the hatch teleport the base test
// uses for extraction); every step under test is real input:
//   talk     E at Smuggler Sal (free-standing by the departures board): his dialogue, "Take the job" (mouse)
//   locked   E at the pod: the Old Plantation Road card is locked and says why (the road map job)
//   deploy   Exile Beach, Launch; in the raid, E at the guard's coat in the checkpoint hut: the road map is inside
//   take     double-click the road map in the coat (mouse); the tracker says to get it home
//   extract  the hatch ring, home; the payout slip; the map is in the stash
//   hand in  E at Sal, "Hand it in": the job pays once (🍌 20 and the route), a second click pays nothing
//   unlock   E at the pod: the plantation card is open now; pick it, Launch: the fare is paid once, you land inland
// node tools/questtest.mjs [--shots DIR] [--headed]   BASE=http://127.0.0.1:5358 (never 5318 or 5340). Exit 1 on failure.
import { chromium } from "playwright-core";
const BASE = process.env.BASE ?? "http://127.0.0.1:5358";
if (["5318", "5340"].includes(new URL(BASE).port)) throw new Error("that port belongs to another server");
const SHOTS = process.argv.includes("--shots") ? process.argv[process.argv.indexOf("--shots") + 1] : null;
const b = await chromium.launch({ executablePath: "/usr/bin/chromium", headless: !process.argv.includes("--headed"), args: ["--use-angle=gl", "--enable-gpu", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
let failed = 0; const log = (ok, name, note = "") => { if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${note ? "  " + note : ""}`); };
const G = (fn, arg) => p.evaluate(fn, arg);
const until = async (fn, arg, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await G(fn, arg)) return true; await p.waitForTimeout(50); } return false; };
const shot = async (name) => { if (SHOTS) { await p.waitForTimeout(350); await p.screenshot({ path: `${SHOTS}/${name}.png` }); } };
const quests = () => G(() => JSON.parse(JSON.stringify({ ...window.__G.save.quests, money: window.__G.save.money, stash: window.__G.save.reserved })));
const standBy = async (x, z) => { await G(([a, c]) => window.__g.home.pos.set(a, 0, c), [x, z]); await p.waitForTimeout(250); };

// ---- a new player (look done, arrival seen), straight into the vault
await p.goto(`${BASE}/game.html?dev&fresh`);
await p.waitForFunction(() => window.__G?.save, null, { timeout: 120000 });
await G(() => { const s = window.__G.save; s.quests.intro = true; localStorage.setItem("bv_g1", JSON.stringify({ ...s, lookDone: true })); });
await p.goto(`${BASE}/game.html?dev`);
await p.waitForFunction(() => window.__G?.scene === "bunker" && window.__g?.home, null, { timeout: 120000 });
await p.waitForTimeout(1200);
{ const q = await quests(); log(q.active.length === 0 && q.done.length === 0 && q.money === 0, "a new save: no jobs, no money"); }

// ---- talk to Sal and take his first job
const sal = await G(() => window.__g.home.stations().find((s) => s.id === "talk" && s.x > 0));
log(!!sal, "Sal stands by the departures board with a talk station", JSON.stringify(sal));
await standBy(sal.x, sal.z + 1.2);
log(await until(() => /Smuggler Sal/.test(document.getElementById("hp")?.textContent ?? ""), null, 2000), "the prompt offers to talk to Sal");
await p.keyboard.press("e"); await p.waitForSelector(".panel.npc");
log(/Scout the Plantation Road/.test(await p.locator(".panel.npc").innerText()), "Sal offers \"Scout the Plantation Road\"");
await shot("q01-sal-offer");
await p.click('button[data-a="q:accept:sal_roadmap"]'); await p.waitForTimeout(300);
{ const q = await quests(); log(q.active.includes("sal_roadmap") && q.tracked === "sal_roadmap", "taking the job makes it active and tracked"); }
await shot("q02-sal-accepted");
await p.keyboard.press("Escape"); await p.waitForTimeout(300);
log(await until(() => /Scout the Plantation Road/.test(document.querySelector(".q3-track")?.textContent ?? ""), null, 2000), "the tracker line names the job");

// ---- the pod: the plantation card is locked and says why
const walkToPod = async () => { await standBy(0, -8.2); await p.keyboard.down("w"); await until(() => document.getElementById("hp")?.classList.contains("on") && /Banana Express|Departures/.test(document.getElementById("hp").textContent), null, 3000); await p.keyboard.up("w"); await p.waitForTimeout(150); };
await walkToPod();
await p.keyboard.press("e"); await p.waitForSelector(".panel.dest .dcard");
{ const locked = await p.locator('.dcard[data-a="dest:plantation"]').isDisabled(), why = await p.locator('.dcard[data-a="dest:plantation"] .dlock').innerText();
  log(locked && /road map/i.test(why), "the plantation card is locked with the job as the reason", why);
  log(await p.locator('.dcard[data-a="dest:cove"]').isDisabled(), "Smuggler's Cove is locked too", await p.locator('.dcard[data-a="dest:cove"] .dlock').innerText()); }
await shot("q03-pod-locked");
await p.click('.dcard[data-a="dest:beach"]'); await p.waitForSelector(".panel.dest.confirm");
await p.click('button[data-a="launch:beach"]');
log(await until(() => window.__G.scene === "raid", null, 25000), "launched to Exile Beach");
await p.waitForTimeout(1500);

// ---- the guard's coat in the checkpoint hut: the road map is in it
const coat = await G(() => { const c = window.__G.crates.find((q) => q.socket === "hut-jacket"); return c ? { x: c.x, z: c.z } : null; });
log(!!coat, "the job forces the guard's coat to be there", JSON.stringify(coat));
const spot = await G(([x, z]) => { const g = window.__g; let best = null; for (let r = 0.6; r <= 1.6 && !best; r += 0.2) for (let a = 0; a < 6.28 && !best; a += 0.39) { const px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r; if (g.walkable(px, pz)) best = [px, pz]; } return best; }, [coat.x, coat.z]);
await G(([x, z]) => window.__g.tp(x, z), spot); await p.waitForTimeout(400);
await p.keyboard.press("e");
log(await until(() => /Hanging jacket/i.test(document.querySelector(".lv")?.textContent ?? ""), null, 4000), "E opens the guard's coat in the looting screen");
const mapCell = '.lv-them button[aria-label="Foreman\'s Road Map"]';
log(await until((sel) => !!document.querySelector(sel), mapCell, 15000), "the search reveals the foreman's road map");
await shot("q04-coat-roadmap");
{ const bb = await p.locator(mapCell).first().boundingBox(); await p.mouse.dblclick(bb.x + bb.width / 2, bb.y + bb.height / 2); }
log(await until(() => window.__G.pack.some((i) => i.startsWith("road_map")), null, 3000), "double-click takes the road map into the pack");
await p.keyboard.press("e"); await p.waitForTimeout(400);
log(await until(() => /in pack/i.test(document.querySelector(".q3-track")?.textContent ?? ""), null, 2000), "the tracker says the map is in the pack: get it home", await G(() => document.querySelector(".q3-track")?.textContent));
await shot("q05-tracker-carrying");

// ---- extract at the hatch
{ const ex = await G(() => window.__g.exits().find((e) => e.id === "hatch"));
  await G(([x, z]) => window.__g.tp(x + 10, z - 4), [ex.x, ex.z]); await p.waitForTimeout(400);
  await G(([x, z]) => window.__g.tp(x, z), [ex.x, ex.z]);
  log(await until(() => window.__G.scene === "bunker", null, 15000), "extracted at the hatch and came home");
  await p.waitForTimeout(900); await shot("q06-payout");
  const q = await quests(); log(q.stash.some((i) => i.startsWith("road_map")), "the road map is in the stash");
  await p.keyboard.press("e"); await p.waitForTimeout(300); }

// ---- hand it in to Sal
await standBy(sal.x, sal.z + 1.2);
await p.keyboard.press("e"); await p.waitForSelector(".panel.npc");
log(await p.locator('button[data-a="q:turnin:sal_roadmap"]').count() === 1, "Sal's job shows Hand it in");
await shot("q07-sal-ready");
{ const before = await quests();
  await p.click('button[data-a="q:turnin:sal_roadmap"]'); await p.waitForTimeout(400);
  const after = await quests();
  log(after.done.includes("sal_roadmap") && after.unlocks.includes("dest:plantation") && after.money === before.money + 20, "handing it in pays 🍌 20 and opens the plantation road", `money ${before.money} -> ${after.money}`);
  log(!after.stash.some((i) => i.startsWith("road_map")) && after.ledger.length === 1 && after.ledger[0].consumed[0].startsWith("road_map"), "the road map leaves the stash, one ledger record");
  log(await p.locator('button[data-a="q:turnin:sal_roadmap"]').count() === 0, "no second Hand it in button");
  const stored = await G(() => JSON.parse(localStorage.getItem("bv_g1")).quests);
  log(stored.done.includes("sal_roadmap") && stored.ledger.length === 1, "the payout is saved");
  await shot("q08-sal-done"); }
await p.keyboard.press("Escape"); await p.waitForTimeout(300);

// ---- the pod: the plantation road is open; deploy there
await walkToPod();
await p.keyboard.press("e"); await p.waitForSelector(".panel.dest .dcard");
log(!(await p.locator('.dcard[data-a="dest:plantation"]').isDisabled()), "the Old Plantation Road card is open now");
await shot("q09-pod-unlocked");
await p.click('.dcard[data-a="dest:plantation"]'); await p.waitForSelector(".panel.dest.confirm");
{ const m0 = (await quests()).money; await p.dblclick('button[data-a="launch:plantation"]'); await p.waitForTimeout(100);
  log(await G(() => window.__G.save.money) === m0 - 20, "Launch pays the 20 banana fare once", `${m0} -> ${await G(() => window.__G.save.money)}`);
  log(await until(() => window.__G.scene === "raid", null, 25000), "arrived on the plantation road");
  const sp = await G(() => window.__g.spawn()); log(sp?.entry.group === "plantation-road", "landed at a plantation-road entry", sp?.entry.id); }
await p.waitForTimeout(1500); await shot("q10-plantation-road");

if (errs.length) { console.log("page errors:", errs.slice(0, 5)); failed++; }
await b.close();
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
