// Story captures and checks (G1.5 row 40) with real mouse and keys; save setup through ?dev:
//   intro    a brand-new save: the creator's "Let's get to business", then the arrival plays (four frames), Esc skips
//            the rest, the vault follows; a reload does not play it again
//   vault    a mid-game vault (the Fence's window, Sal's desk, the radio desk): each NPC's dialogue (E), a bark, the
//            job log (Tab), the Fence's counter, Sal's shop with job-unlocked stock
//   raid     the Grove Keeper's camp in the mangrove: their dialogue and trades (E), take their job, hand over two
//            honey pots (the payout from the live pack); a lore note read in the Tab screen; the job log beside the pack
// node tools/storyshots.mjs --shots DIR [--headed]   BASE=http://127.0.0.1:5358 (never 5318 or 5340). Exit 1 on failure.
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
const shot = async (name, wait = 350) => { if (SHOTS) { await p.waitForTimeout(wait); await p.screenshot({ path: `${SHOTS}/${name}.png` }); } };
const boot = async (patch, query = "") => {
  await G((pt) => { const s = window.__G.save; localStorage.setItem("bv_g1", JSON.stringify({ ...s, ...pt, quests: { ...s.quests, ...(pt.quests ?? {}) } })); }, patch);
  await p.goto(`${BASE}/game.html?dev${query}`);
  await p.waitForFunction((raid) => window.__G?.scene === (raid ? "raid" : "bunker") && (raid || window.__g?.home), query.includes("raid"), { timeout: 120000 });
  await p.waitForTimeout(1500);
};

// ---------------------------------------------------------------- intro: once per save, after the creator
await p.goto(`${BASE}/game.html?dev&fresh`);
await p.waitForSelector('button[data-go="1"]', { timeout: 120000 }); await p.waitForTimeout(800);
await p.click('button[data-go="1"]');
log(await until(() => !!document.querySelector(".intro3"), null, 5000), "a new save: the arrival plays after the creator");
await p.waitForTimeout(1200); await shot("s01-intro-ferry", 0);
await p.waitForTimeout(3600); await shot("s02-intro-thrown", 0);
await p.waitForTimeout(3200); await shot("s03-intro-beach", 0);
await p.waitForTimeout(2600); await shot("s04-intro-hatch", 0);
await p.keyboard.press("Escape");
log(await until(() => window.__G.scene === "bunker" && !document.querySelector(".intro3"), null, 5000), "Esc skips to the empty vault");
log(!(await p.locator(".set3").count()), "the skipping Esc does not open the settings plate");
await p.goto(`${BASE}/game.html?dev`); await p.waitForFunction(() => window.__G?.scene === "bunker", null, { timeout: 120000 }); await p.waitForTimeout(800);
log(!(await p.locator(".intro3").count()) && await G(() => window.__G.save.quests.intro === true), "a reload goes straight to the vault: it plays once per save");

// ---------------------------------------------------------------- a mid-game vault
await boot({ lookDone: true, money: 320, salMovedIn: true, reserved: ["banana", "coconut", "vine_rope", "honey_pot", "note_gang_dues"],
  base: { v: 1, next: 5, tokens: {}, items: [{ uid: 1, def: "fence", x: -13, z: -12, r: 0 }, { uid: 2, def: "bench", x: 6, z: -12, r: 0 }, { uid: 3, def: "sal", x: 10, z: -12, r: 0 }, { uid: 4, def: "radio", x: -9, z: -6, r: 1 }] },
  quests: { intro: true, done: ["sal_roadmap", "sal_office", "sal_supplies", "radio_static"], active: ["sal_payroll"], tracked: "sal_payroll", unlocks: ["dest:plantation", "flag:salMovedIn", "fac:radio", "stock:firstaid"], notes: ["note_guard_log", "note_foreman_ledger"], seen: [] } });
const st = await G(() => window.__g.home.stations());
const at = async (id) => { const s = st.find((q) => q.id === id); await G(([x, z]) => window.__g.home.pos.set(x, 0, z), [s.x, s.z + 1.6]); await p.waitForTimeout(350); };
log(await G(() => !!window.__G.save.base.items.find((i) => i.def === "radio")), "the radio desk stands in the vault");
// a bark on walking up to the radio desk
await at("radio"); await p.waitForTimeout(400);
log(await until(() => !!document.querySelector(".npc3-bark"), null, 2000), "the Radio Operator barks when you walk up");
await shot("s05-bark", 100);
await p.keyboard.press("e"); await p.waitForSelector(".panel.npc");
{ const t = await p.locator(".panel.npc").innerText(); log(/Dial/.test(t) && /Gang Frequencies|Signal Fire/.test(t), "the Radio Operator offers his next jobs", t.split("\n").slice(0, 4).join(" | ")); }
await shot("s06-radio-dialogue");
await p.click('button[data-a="npc:chatter"]'); await p.waitForTimeout(300); await shot("s06b-radio-chatter");
log(/BananaGPT raised another round/.test(await p.locator(".panel.npc").innerText()), "Dial's chatter reads the BananaGPT headline");
await p.keyboard.press("Escape"); await p.waitForTimeout(300);
await at("sal"); await p.keyboard.press("e"); await p.waitForSelector(".panel.npc");
{ const t = await p.locator(".panel.npc").innerText(); log(/Foreman's Payroll/.test(t) && /Sal's shop/.test(t) && /first-aid/i.test(t) && !/Hard hat/.test(t), "Sal: the boss job on, his shop with first-aid kits (job-unlocked), no hard hats yet"); }
await shot("s07-sal-dialogue-shop");
await p.keyboard.press("Escape"); await p.waitForTimeout(300);
await at("sell"); await p.keyboard.press("e"); await p.waitForSelector(".panel");
{ const t = await p.locator(".panel").innerText(); log(/The Fence/.test(t) && /Sell everything/.test(t), "the Fence's window: his line over the counter"); }
await shot("s08-fence-dialogue");
await p.keyboard.press("Escape"); await p.waitForTimeout(300);
await p.keyboard.press("Tab"); await p.waitForSelector(".panel.qlog");
{ const t = await p.locator(".panel.qlog").innerText(); log(/Foreman's Payroll/.test(t) && await p.locator('.mb3 button[data-tab="jobs"].on').count() === 1, "Tab: the job log, the menu bar's Jobs tab lit"); }
// the menu bar (UI v4): the notes are the bar's Notes tab
await p.click('.mb3 button[data-tab="notes"]'); await p.waitForSelector('.panel.qlog[data-part="notes"]');
{ const t = await p.locator(".panel.qlog").innerText(); log(/Notes/.test(t) && /Checkpoint Guard Log/.test(t) && await p.locator('.mb3 button[data-tab="notes"].on').count() === 1, "the Notes tab: the notes read"); }
await p.click(".q3-note summary >> nth=1"); await shot("s09-job-log");
await p.keyboard.press("Tab"); await p.waitForTimeout(300);
log(!(await p.locator(".panel.qlog").count()), "Tab closes the job log");

// ---------------------------------------------------------------- the raid: the Grove Keeper, a note
await boot({ lookDone: true, money: 200, quests: { intro: true, done: [], active: [], tracked: null, unlocks: [], notes: [], seen: [] } }, "&raid&peace");
const keeper = { x: 42.9, z: 58.7 };
const spot = await G(([x, z]) => { const g = window.__g; for (let r = 1.3; r <= 2; r += 0.1) for (let a = 3.14; a < 9.4; a += 0.3) { const px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r; if (g.walkable(px, pz)) return [px, pz]; } return null; }, [keeper.x, keeper.z]);
await G(([x, z]) => window.__g.tp(x, z), spot); await p.waitForTimeout(600);
await shot("s10-keeper-camp");
log(await until(() => /Grove Keeper/.test(document.querySelector(".h3-prompt")?.textContent ?? ""), null, 3000), "near the camp: E to talk to the Grove Keeper");
await p.keyboard.press("e"); await p.waitForSelector(".panel.npc.raid");
{ const t = await p.locator(".panel.npc.raid").innerText(); log(/Keeper Wren/.test(t) && /Seed Lanterns/.test(t) && /Trades/.test(t), "the Keeper's dialogue: their job and their trades"); }
await shot("s11-keeper-dialogue");
await p.click('button[data-a="q:accept:keeper_lanterns"]'); await p.waitForTimeout(300);
{ const m0 = await G(() => window.__G.save.money); await p.click('button[data-a="trade:bandage"]'); await p.waitForTimeout(300);
  log(await G(() => window.__G.save.money) === m0 - 10 && await G(() => window.__G.pack.some((i) => i.startsWith("bandage"))), "a trade: 🍌 10 for leaf wraps, into the pack"); }
// two honey pots arrive in the pack (setup: as if found), then hand them over
await G(() => { window.__G.pack.push("honey_pot@hp1", "honey_pot@hp2"); });
await p.keyboard.press("Escape"); await p.waitForTimeout(300); await p.keyboard.press("e"); await p.waitForSelector(".panel.npc.raid");
log(await p.locator('button[data-a="q:turnin:keeper_lanterns"]').count() === 1, "with two honey pots in the pack the Keeper's job is ready");
await p.click('button[data-a="q:turnin:keeper_lanterns"]'); await p.waitForTimeout(500);
{ const r = await G(() => ({ pack: [...window.__G.pack], consumed: window.__G.save.activeRaid.consumed, unlocks: window.__G.save.quests.unlocks, ledger: window.__G.save.quests.ledger }));
  log(!r.pack.some((i) => i.startsWith("honey_pot")) && r.pack.some((i) => i.startsWith("keeper_carving")) && r.consumed.includes("honey_pot@hp1") && r.unlocks.includes("secret:root-cellar") && r.ledger.length === 1, "handing over the honey: consumed in the raid ledger, a carving in the pack, the secret unlocked"); }
await shot("s12-keeper-done");
await p.keyboard.press("Escape"); await p.waitForTimeout(300);
// a lore note in the pack, read in the Tab screen
await G(() => { window.__G.pack.push("note_pirate_iou@n1"); });
await p.keyboard.press("Tab"); await p.waitForSelector(".lv");
log(await until(() => /Jobs/.test(document.querySelector(".lv-them")?.textContent ?? ""), null, 2000), "Tab: the job log sits beside your pack");
await shot("s13-tab-joblog");
{ const bb = await p.locator('.lv-me button[aria-label="Rum Runner IOU"]').first().boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); }
log(await until(() => /Captain Saltbeard/.test(document.querySelector(".lv-tagwrap")?.textContent ?? ""), null, 2000), "clicking the note shows its text on the tag");
log(await until(() => window.__G.save.quests.notes.includes("note_pirate_iou"), null, 2000), "reading it is remembered (counts for jobs)");
await shot("s14-note-read");
await G(() => { window.__G.pack.push("note_courier_slip@c1"); }); await p.waitForTimeout(300);
{ const bb = await p.locator('.lv-me button[aria-label="Mainland Courier Slip"]').first().boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); }
log(await until(() => /certain investor, V\.P\./.test(document.querySelector(".lv-tagwrap")?.textContent ?? ""), null, 2000), "the mainland courier slip reads on the tag (a hint, no job)");
log(await G(() => !window.__story.quests.QUESTS.some((q) => q.tasks.some((t) => t.note === "note_courier_slip"))), "no job asks for the courier slip");
await shot("s15-courier-slip");
await p.keyboard.press("Tab"); await p.waitForTimeout(300);
// the root cellar spawns next raid
if (errs.length) { console.log("page errors:", errs.slice(0, 5)); failed++; }
await b.close();
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
