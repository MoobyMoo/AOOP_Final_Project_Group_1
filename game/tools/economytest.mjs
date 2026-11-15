// The Progression v0.2 economy, end to end with real mouse and keys (LORE.md "bananas are power"). Setup (a save with
// a finished look, Associate net worth, the Fence's window and Sal's desk built, a few bananas, coconuts and a sealed
// lockbox in the stash) goes through ?dev; every step under test is real input on the built game:
//   build      B, click the Banana Ripening Room card, aim the ghost with the mouse, click: it's built and paid once
//   wager      walk up to Sal's desk, E, click "🍌 50" on "Extract with 300+": placed; the stake leaves on launch
//   raid       E at the pod, pick Exile Beach, Launch; extract at the hatch with a 300+ haul (setup puts it in the pack)
//   slip       the payout slip shows Sal's verdict (won), the ripening room's run, and Double or Nothing
//   double     forced roll that wins: click Coin, Heads, Half, "Sell and roll": the coin plays, money balances, the
//              slip gets "Rolled the dice"; a second roll is refused
//   promotion  closing the slip plays the Performance Review (Manager) and the title chip updates
//   collect    E at the ripening room: the tray holds a Premium Bunch; "Collect the tray" moves it into the stash
//   lockbox    E at the Fence: the lockbox row prints its odds; Open: the fee is paid, the box shakes, the prize is owned
//   lose       a second raid, reduced motion on, forced roll that loses: the result shows at once, the stake is gone
// node tools/economytest.mjs [--shots DIR] [--headed]   BASE=http://127.0.0.1:5358 (never 5318 or 5340). Exit 1 on failure.
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
const econ = () => G(() => JSON.parse(JSON.stringify({ money: window.__G.save.money, life: window.__G.save.econ.lifetime, reviewed: window.__G.save.econ.reviewed, wager: window.__G.save.econ.wager, lastWager: window.__G.save.econ.lastWager, lastGamble: window.__G.save.econ.lastGamble, lines: window.__G.save.econ.lines, reserved: window.__G.save.reserved, locker: window.__G.save.locker, delivery: window.__G.save.delivery ?? [], raids: window.__G.save.raids, ledger: window.__G.save.econ.ledger.slice(-12) })));
const count = (list, type) => list.filter((i) => i.split(/[@#~]/)[0] === type).length;
/** stand in front of a station and press E (the vault opens the nearest station within reach) */
const useAt = async (x, z) => { await G(([a, c]) => window.__g.home.pos.set(a, 0, c), [x, z]); await p.waitForTimeout(250); await p.keyboard.press("e"); await p.waitForTimeout(400); };
const closePanel = async () => { await p.keyboard.press("Escape"); await p.waitForTimeout(300); };

// ---- setup: Associate (net worth 1,990, reviewed), the Fence's window and Sal's desk, raw bananas and a lockbox
await p.goto(`${BASE}/game.html?dev&fresh`);
await p.waitForFunction(() => window.__G?.save, null, { timeout: 120000 });
await G(() => {
  const s = window.__G.save, u = () => crypto.randomUUID();
  s.lookDone = true; s.money = 400; s.econ.lifetime = 1990; s.econ.reviewed = 1;
  s.base.items = [{ uid: 1, def: "fence", x: -13, z: -12, r: 0 }, { uid: 2, def: "sal", x: 10, z: -12, r: 0 }]; s.base.next = 3;
  s.reserved.push(...Array.from({ length: 6 }, () => `banana@${u()}`), `coconut@${u()}`, `coconut@${u()}`, `lockbox_rare@${u()}`);
  localStorage.setItem("bv_g1", JSON.stringify(s));
});
await p.goto(`${BASE}/game.html?dev`);
await p.waitForFunction(() => window.__G?.scene === "bunker" && window.__g?.home && window.__econ, null, { timeout: 120000 });
await p.waitForTimeout(1500);
{ const chip = await p.locator(".home-title").innerText(), rows = await p.locator(".mkt3 .mrow").count();
  log(/Associate/.test(chip) && rows === 6, "the vault HUD shows the title and today's six market movers", chip.replace(/\s+/g, " ")); }
await shot("01-vault-hud");

// ---- build the ripening room with the mouse
await p.keyboard.press("b"); await p.waitForSelector(".bld3-cat"); await p.waitForTimeout(400);
{ const lockedScrap = await p.locator('.bcard[data-b="scrappress"] .bs').innerText(), lockedCoupon = await p.locator('.bcard[data-b="coupon"] .bs').innerText();
  log(/Manager|Coin-Op|generator/i.test(lockedScrap) && /Senior Manager|generator/i.test(lockedCoupon), "higher factory lines are locked on the blueprint desk", `${lockedScrap} | ${lockedCoupon}`); }
await p.click('.bcard[data-b="ripen"]');
{ const s = await G(([x, z]) => window.__g.home.build.cellToScreen(x, z), [3 + 1, -5 + 1]); await p.mouse.move(s.x - 30, s.y - 20); await p.mouse.move(s.x, s.y, { steps: 6 }); await p.waitForTimeout(150); }
await shot("02-build-ripen-ghost");
{ const m0 = (await econ()).money; await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(300);
  const it = await G(() => window.__G.save.base.items.find((i) => i.def === "ripen")), m1 = (await econ()).money;
  log(!!it && m1 === m0 - 150, "built the Banana Ripening Room for 150", JSON.stringify(it)); }
await p.keyboard.press("Escape"); await p.waitForTimeout(400);
await shot("03-ripen-built");
const ripen = await G(() => { const it = window.__G.save.base.items.find((i) => i.def === "ripen"); return window.__g.home.stations().find((s) => s.uid === it.uid); });

// ---- Sal's wager
await useAt(11, -9.6);
log(await until(() => !!document.querySelector('.panel [data-econ="wager:haul300:50"]'), null, 3000), "E at Sal's desk shows his book");
await shot("04-sal-book");
await p.click('[data-econ="wager:haul300:50"]'); await p.waitForTimeout(400);
{ const e = await econ(); log(e.wager?.id === "haul300" && e.wager.stake === 50 && e.wager.state === "placed" && e.money === 250, "a 50-banana bet on a 300 haul is placed; nothing paid yet", JSON.stringify(e.wager)); }
await shot("05-wager-placed");
await closePanel();

// ---- raid: the pod to Exile Beach, a 300+ haul, extract at the hatch
const deployBeach = async () => {
  await useAt(0, -8.6); await p.waitForSelector(".panel.dest .dcard"); await p.click('.dcard[data-a="dest:beach"]'); await p.waitForSelector(".panel.dest.confirm");
  await p.click('button[data-a="launch:beach"]'); return until(() => window.__G.scene === "raid", null, 20000);
};
log(await deployBeach(), "launched to Exile Beach");
{ const e = await econ(); log(e.money === 200 && e.wager?.state === "riding" && e.ledger.some((l) => l.k === "wagerStake" && l.n === -50), "the stake left the wallet on launch, through the ledger", `money ${e.money}`); }
const extract = async (n) => {
  await p.waitForTimeout(1200);
  await G((k) => { for (let i = 0; i < k; i++) window.__G.pack.push(`golden_banana@${crypto.randomUUID()}`); }, n); // setup: the haul
  const ex = await G(() => window.__g.exits().find((e) => e.id === "hatch"));
  await G(([x, z]) => window.__g.tp(x + 10, z - 4), [ex.x, ex.z]); await p.waitForTimeout(400);
  await G(([x, z]) => window.__g.tp(x, z), [ex.x, ex.z]);
  return until(() => window.__G.scene === "bunker" && !!document.querySelector(".panel.result .slip"), null, 20000);
};
log(await extract(4), "extracted at the hatch with four golden bananas");
await p.waitForTimeout(900);
{ const e = await econ(), slip = await p.locator(".slip").innerText();
  log(e.lastWager?.won === true && e.lastWager.paid === 100 && /Sal's bet.*won 🍌 100/s.test(slip), "Sal paid the bet once (2x) and the slip says so", JSON.stringify(e.lastWager));
  log(/Banana Ripening Room\s+1 made/.test(slip) && (e.lines.ripen?.tray.length ?? 0) === 1 && count(e.reserved, "banana") === 4, "the ripening room ran once: 2 bananas in, 1 Premium Bunch on its tray");
  log(await p.locator(".don3 .droll").count() === 1 && /49% to win/.test(slip), "Double or Nothing is on the slip with its odds"); }
await shot("06-slip");

// ---- Double or Nothing: a forced win
await G(() => window.__econ.force(0.2)); // < 0.49: the coin lands on the side you called
await p.click('[data-econ="don:game:coin"]'); await p.click('[data-econ="don:pick:heads"]'); await p.click('[data-econ="don:stake:0.5"]');
{ const before = await econ();
  await p.click('[data-econ="don:roll"]');
  log(await until(() => !!document.querySelector(".ov3.roll3 .coin3"), null, 2000), "the coin flips over the slip, the Fence sweating");
  await shot("07-don-rolling", 1300);
  log(await until(() => !document.querySelector(".ov3 .out")?.hidden, null, 6000), "the slow-motion flip lands");
  await shot("08-don-won", 200);
  const after = await econ(), g = after.lastGamble;
  log(g?.won && g.landed === "heads" && after.money === before.money + g.sold - g.stake + g.payout && g.payout === 2 * g.stake, "won: the haul sold, the stake doubled, the wallet balances", JSON.stringify(g));
  await p.keyboard.press("e"); await until(() => !document.querySelector(".ov3"), null, 3000); await p.waitForTimeout(300);
  log(await p.locator(".slip .stamp.dice").count() === 1 && await p.locator(".don3 .droll").count() === 0, "the slip is stamped \"Rolled the dice\"; no second roll");
  await shot("09-slip-stamped"); }

// ---- the promotion: closing the slip plays the Performance Review
await closePanel();
log(await until(() => /Manager/.test(document.querySelector(".panel.review .ptitle")?.textContent ?? ""), null, 3000), "a Performance Review plays: promoted to Manager");
await shot("10-performance-review", 900);
{ const e = await econ(); log(e.life >= 2000 && e.reviewed === 2, "net worth passed 2,000 and the review is recorded", `net worth ${e.life}`); }
await p.click('[data-econ="review:close"]'); await p.waitForTimeout(400);
log(/Manager/.test(await p.locator(".home-title").innerText()), "the title chip says Manager");

// ---- collect the ripening room's tray
await useAt(ripen.x, -3.0);
log(await until(() => /Banana Ripening Room/.test(document.querySelector(".panel.line")?.textContent ?? ""), null, 3000), "E at the ripening room opens its card and tray");
await shot("11-line-panel");
{ const before = await econ(); await p.click('[data-econ^="line:collect:"]'); await p.waitForTimeout(500);
  const after = await econ(); log(count([...after.reserved, ...after.delivery], "premium_bunch") === count([...before.reserved, ...before.delivery], "premium_bunch") + 1 && after.lines.ripen.tray.length === 0, "collected: the Premium Bunch is in the stash, the tray is empty"); }
await shot("12-collected");
await closePanel();

// ---- open the lockbox at the Fence
await useAt(-11.5, -9.6);
log(await until(() => !!document.querySelector('.panel [data-econ^="box:"]'), null, 3000), "the Fence's window lists the sealed lockbox with its printed odds");
log(/Premium.*%.*Executive.*%/s.test(await p.locator(".panel .lb3 .odds3").innerText()), "the odds table is printed on the row");
await shot("13-fence-lockbox");
{ const before = await econ(); await G(() => window.__econ.force(0.5, 0.5));
  await p.click('[data-econ^="box:"]');
  log(await until(() => !!document.querySelector(".ov3.box3 .lbx.shake"), null, 2000), "the box shakes before it opens");
  await shot("14-lockbox-shake", 300);
  log(await until(() => !document.querySelector(".ov3.box3 .prize")?.hidden, null, 4000), "the prize is revealed");
  await shot("15-lockbox-reveal", 500);
  const after = await econ(), entry = after.ledger.findLast((l) => l.k === "lockbox");
  const prize = entry?.out?.[0];
  log(after.money === before.money - 80 && count(after.reserved, "lockbox_rare") === 0 && !!prize && [...after.reserved, ...after.locker, ...after.delivery].includes(prize), "fee 80 paid once; the box is gone; the prize is owned (stash, locker or delivery)", prize);
  await p.keyboard.press("e"); await until(() => !document.querySelector(".ov3"), null, 3000); }
await closePanel();

// ---- a second raid, reduced motion, a forced loss
await p.emulateMedia({ reducedMotion: "reduce" });
log(await deployBeach(), "launched again");
log(await extract(1), "extracted with one golden banana");
await p.waitForTimeout(900);
{ const slip = await p.locator(".slip").innerText(); log(/Banana Ripening Room\s+1 made/.test(slip), "the ripening room ran for this raid too"); }
await G(() => window.__econ.force(0.95)); // between 0.49 and 0.98: the other side
{ const before = await econ(); await p.click('[data-econ="don:stake:1"]'); await p.click('[data-econ="don:roll"]');
  const t0 = Date.now(); log(await until(() => !document.querySelector(".ov3 .out")?.hidden, null, 2000), "reduced motion: the result shows at once", `${Date.now() - t0} ms`);
  await shot("16-don-lost-reduced", 150);
  const after = await econ(), g = after.lastGamble;
  log(g && !g.won && g.landed === "tails" && after.money === before.money + g.sold - g.stake, "lost: the stake is gone, nothing else", JSON.stringify(g));
  await p.keyboard.press("e"); await until(() => !document.querySelector(".ov3"), null, 3000); await p.waitForTimeout(300);
  await shot("17-slip-lost"); }

if (errs.length) { console.log("page errors:", errs.slice(0, 5)); failed++; }
await b.close();
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
