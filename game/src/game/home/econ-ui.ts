// The economy in the vault (Progression v0.2): the title chip and the market board on the vault HUD, the factory
// line panel (input/output card, tray, upgrades), Sal's wager rows, the Fence's lockbox counter with its reveal, the
// Double or Nothing section on the payout slip with its coin and wheel, and the Performance Review plate on a
// promotion. Rules live in core/wallet.ts, core/gamble.ts, home/factory.ts, loot/lockbox.ts and loot/market.ts; this
// file is DOM only. Buttons use data-econ (one delegated listener), so a section can re-render in place.
//
// Motion: the coin and the wheel play in slow motion and the lockbox shakes before it pops, unless the player asks for
// reduced motion (prefers-reduced-motion), which shows the result at once with a short fade. Nothing auto-repeats.
// Sounds are the existing set; TODO(audio, ElevenLabs): a coin toss, a wheel's ticking, a win fanfare, a sad trombone
// and a Performance Review sting (they use stingExtract / stingBonk / stingRare / tick / whirr today).
import "./econ.css";
import { G } from "../core/state";
import { save } from "../core/save";
import { sfx } from "../core/audio";
import { sting } from "../core/music";
import { iconHtml } from "../ui/itemicon";
import { itemDef } from "../loot/tables";
import { itemType } from "../loot/instances";
import { TIERS, TIER_KEYS, tierQuality } from "../loot/tiers";
import { TITLES, titleName } from "../core/networth";
import { econ, lifetime, markReviewed, pendingReview, title } from "../core/wallet";
import { CATALOG, has } from "./facilities";
import { LINES, canUpgrade, collectLine, feedable, isLine, lineOf, lineRate, lineState, recipeText, toggleLine, trayCap, trayBatches, upgradeLine, type LineId } from "./factory";
import { WAGERS, STAKES, cancelWager, haulOffer, oddsLabel, payoutFor, placeWager, rollDouble, wagerOf, winChance, type Game } from "../core/gamble";
import { LOCKBOXES, canOpen, isLockbox, lockboxOf, oddsRows, openLockbox } from "../loot/lockbox";
import { marketMovers, marketPrice } from "../loot/market";
import { claimDelivery } from "../core/settlement";
import { portrait } from "../story/portrait";

export type EconHost = { reopen(station: string, uid?: number): void; money(): void; refresh(): void; float(text: string, fac: string, color?: string): void; closePanel(): void; showPanel(html: string, cls?: string): void };
let host: EconHost | null = null;
export const initEconUi = (h: EconHost) => { host = h; };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const fmt = (n: number) => n.toLocaleString("en-US");
/** the next roll's uniform draw: crypto, unless a test forced one (?dev window.__econ.force) */
let forced: number[] = [];
const draw = () => forced.length ? forced.shift()! : crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;

// ---------------------------------------------------------------- vault HUD: title chip and market board
export function titleChipHtml() {
  // the chip changes with the Performance Review, not before it (the review is the reveal)
  const t = Math.min(title(G.save), G.save.econ?.reviewed ?? 0), next = TITLES[t + 1], due = title(G.save) > t;
  return `<span class="home-title" title="Net worth: lifetime bananas earned">${esc(titleName(t))}<small class="num">🍌 ${fmt(lifetime(G.save))}${due ? " · review due" : next ? ` / ${fmt(next.at)}` : ""}</small></span>`;
}
export function marketBoardHtml() {
  const movers = marketMovers(G.save);
  if (!movers.length) return "";
  return `<div class="mkt3"><i class="brk tl"></i><i class="brk br"></i><header><b>Black market</b><span>today's movers</span></header>${movers.map((m) => {
    const pct = Math.round((m.factor - 1) * 100), up = pct > 0;
    return `<div class="mrow ${up ? "up" : "down"}"><span class="mi">${iconHtml(m.id, 22)}</span><span class="mn">${esc(m.name)}</span><span class="mp num">🍌 ${m.price}</span><span class="md num">${up ? "▲" : "▼"} ${Math.abs(pct)}%</span></div>`;
  }).join("")}<footer>Prices move after every raid. Hold loot and sell high.</footer></div>`;
}

// ---------------------------------------------------------------- the factory line panel
const head = (title: string, sub = "") => `<header><h2>${title}</h2>${sub ? `<small>${sub}</small>` : ""}</header>`;
const chips = (rec: Record<string, number>, stash?: boolean) => Object.entries(rec).map(([id, n]) => `<span class="lchip" style="--rar:var(--rar-${itemDef(id).rarity})">${iconHtml(id, 34)}<b class="num">×${n}</b><small>${esc(itemDef(id).name)}${stash ? ` · ${G.save.reserved.filter((i) => itemType(i) === id).length} in stash` : ""}</small></span>`).join("");
export function linePanelHtml(id: LineId) {
  const sv = G.save, def = lineOf(id)!, fac = CATALOG.find((f) => f.id === id)!, st = lineState(sv, id), rate = lineRate(st), up = canUpgrade(sv, id), r = recipeText(def);
  const feed = feedable(sv, def), batches = trayBatches(def, st), cap = trayCap(st);
  const outChips = chips(def.out) + (def.cash ? `<span class="lchip cash"><span class="emo">🍌</span><b class="num">${def.cash}</b><small>bananas</small></span>` : "") + (def.rounds ? `<span class="lchip"><span class="emo">🔸</span><b class="num">×${def.rounds.n}</b><small>rifle rounds</small></span>` : "");
  const tray = st.tray.length || st.cash || st.rounds;
  const groups = new Map<string, number>(); for (const i of st.tray) groups.set(itemType(i), (groups.get(itemType(i)) ?? 0) + 1);
  return `${head(fac.name, `Tier ${st.tier} · ${rate} batch${rate > 1 ? "es" : ""} per raid${st.paused ? " · paused" : ""}`)}
    <div class="line3" aria-label="${esc(`${r.in} makes ${r.out}`)}"><div class="lside"><em>In, per batch</em>${chips(def.inputs, true)}</div><div class="larrow">➜</div><div class="lside"><em>Out, per batch</em>${outChips}</div></div>
    <p class="dim lnote">Runs once after every raid you finish, home safe or bonked: up to ${rate} batch${rate > 1 ? "es" : ""}, fed from your stash (items a job still needs are kept back). Your stash can feed ${feed} now. It never makes anything without raided inputs.</p>
    <h4>Output tray <span class="q3-dim num">${batches} of ${cap} batches</span></h4>
    ${tray ? `<div class="ltray">${[...groups].map(([t, n]) => `<span class="lchip" style="--rar:var(--rar-${itemDef(t).rarity})">${iconHtml(t, 30)}<b class="num">×${n}</b></span>`).join("")}${st.cash ? `<span class="lchip cash"><span class="emo">🍌</span><b class="num">${st.cash}</b></span>` : ""}${st.rounds ? `<span class="lchip"><span class="emo">🔸</span><b class="num">×${st.rounds}</b></span>` : ""}</div>
      <div class="actions"><button data-econ="line:collect:${id}">Collect the tray</button></div>` : `<p class="dim lnote">Empty. Finish a raid with ${esc(r.in)} in your stash.</p>`}
    ${batches >= cap ? `<p class="warn3 lnote">The tray is full: the line stalls until you collect.</p>` : ""}
    <div class="rows" style="margin-top:12px">
      <div class="row"><b>${st.tier >= 3 ? "Top tier" : `Upgrade to tier ${st.tier + 1}`}</b><small>${st.tier >= 3 ? "Runs 3 batches per raid" : `${lineRate({ tier: st.tier + 1, staff: st.staff })} batches per raid${up.ok ? "" : `. ${esc(up.reason)}`}`}</small>${st.tier >= 3 ? `<em class="act">Done</em>` : `<button class="act" data-econ="line:up:${id}" ${up.ok ? "" : "disabled"}>🍌 ${up.cost}</button>`}</div>
      <div class="row"><b>Staff</b><small>Nobody on the line yet. Recruits will speed it up later.</small><em class="act num">×${st.staff}</em></div>
      <div class="row"><b>${st.paused ? "Paused" : "Running"}</b><small>${st.paused ? "It keeps its tray and skips raids until you start it again" : "Pause it to keep its inputs in your stash"}</small><button class="act ghost" data-econ="line:pause:${id}">${st.paused ? "Start" : "Pause"}</button></div>
    </div>`;
}

// ---------------------------------------------------------------- Sal's wagers (rows under his jobs)
export function wagerRowsHtml() {
  const sv = G.save; if (!has(sv, "sal")) return "";
  const w = econ(sv).wager, def = w && wagerOf(w.id), last = econ(sv).lastWager;
  const lastLine = last && last.raid === sv.settlements?.at(-1)?.id ? `<p class="wg3-last ${last.won ? "won" : "lost"}">Last raid: ${last.won ? `you called ${esc(wagerOf(last.id)?.short ?? "it")}. Paid 🍌 ${last.paid}.` : `${esc(wagerOf(last.id)?.short ?? "the bet")} didn't happen. Sal kept 🍌 ${last.stake}.`}</p>` : "";
  const riding = w && def ? `<div class="wg3-on"><b>On the books: 🍌 ${w.stake} on ${esc(def.short)}</b><small>Pays 🍌 ${payoutFor(def, w.stake)} if it happens. ${w.state === "placed" ? "The stake leaves your wallet when the pod launches." : "Riding on this raid."}</small>${w.state === "placed" ? `<button class="act ghost" data-econ="wager:cancel">Call it off</button>` : ""}</div>` : "";
  return `<h4>Sal's book <span class="q3-dim">bet on your next raid · judged when you get home</span></h4>${lastLine}${riding}<div class="rows wg3">${WAGERS.map((d) => `<div class="row"><b>${esc(d.text)}</b><small>Pays ${d.odds}× your stake. A bonk-out loses it.</small><span class="wg3-st">${STAKES.map((s) => `<button class="act${w?.id === d.id && w.stake === s ? " on" : ""}" data-econ="wager:${d.id}:${s}" ${sv.money < s || w?.state === "riding" ? "disabled" : ""}>🍌 ${s}</button>`).join("")}</span></div>`).join("")}</div>`;
}

// ---------------------------------------------------------------- the Fence: lockboxes and today's prices
export const sellable = (sv = G.save) => sv.reserved.filter((i) => { const k = itemDef(i).kind; return k !== "key" && k !== "lockbox"; });
export function fenceCell(inst: string) {
  const d = itemDef(inst), p = marketPrice(G.save, inst), moved = p !== d.value;
  return `<div class="cell${moved ? (p > d.value ? " mup" : " mdown") : ""}" style="--rar:var(--rar-${d.rarity})" title="${esc(d.name)}${moved ? ` (base ${d.value})` : ""}">${iconHtml(inst, 54)}<span class="v">${p}</span></div>`;
}
export function oddsTableHtml(type: string) {
  const box = lockboxOf(type); if (!box) return "";
  return `<span class="odds3">${oddsRows(box).map((r) => `<span style="--c:${r.color}"><i></i>${r.name} <b class="num">${r.pct}%</b></span>`).join("")}</span>`;
}
export function lockboxRowsHtml() {
  const sv = G.save, boxes = [...sv.reserved, ...(sv.delivery ?? [])].filter(isLockbox);
  if (!boxes.length) return "";
  return `<h4 style="margin:16px 20px 8px">Sealed lockboxes <span class="q3-dim">the Fence opens them for a fee · odds printed on the box</span></h4><div class="rows">${boxes.map((inst) => {
    const box = lockboxOf(itemType(inst))!, can = canOpen(sv, inst);
    return `<div class="row lb3"><b>${iconHtml(inst, 26)} ${esc(box.name)}</b><small>${oddsTableHtml(box.id)}</small><button class="act" data-econ="box:${inst}" ${can.ok ? "" : "disabled"} title="${esc(can.reason)}">Open · 🍌 ${box.fee}</button></div>`;
  }).join("")}</div>`;
}

// ---------------------------------------------------------------- the payout slip's economy lines
/** Sal's verdict on a wager riding on this raid, what the factory made for it, and the Double or Nothing table */
export function slipExtrasHtml(raidId: string): string {
  const e = econ(G.save), w = e.lastWager?.raid === raidId ? e.lastWager : null, def = w && wagerOf(w.id);
  const wager = w && def ? `<table class="wg"><tr><td>Sal's bet: ${esc(def.short)}</td><td>${w.won ? `won 🍌 ${w.paid}` : `lost 🍌 ${w.stake}`}</td></tr></table>` : "";
  const runs = e.ledger.filter((r) => r.k === "run" && r.raid === raidId);
  const factory = runs.length ? `<table class="fac">${runs.map((r) => { const id = r.note?.split(" ")[0] ?? "", f = CATALOG.find((c) => c.id === id); const n = (r.out ?? []).length; const cash = /\+(\d+) cash/.exec(r.note ?? "")?.[1], rounds = /\+(\d+) ammo/.exec(r.note ?? "")?.[1];
    return `<tr><td>${esc(f?.name ?? id)}</td><td>${[n ? `${n} made` : "", cash ? `🍌 ${cash}` : "", rounds ? `${rounds} rounds` : ""].filter(Boolean).join(", ")}</td></tr>`; }).join("")}</table><p class="note">On the tray. Collect at the line.</p>` : "";
  return `${wager || factory ? `<hr>${wager}${factory}` : ""}${donHtml(raidId)}`;
}

// ---------------------------------------------------------------- Double or Nothing (on the payout slip)
type Don = { raid: string; game: Game; pick: string; frac: number; busy: boolean };
let don: Don | null = null;
export function donHtml(raidId: string): string {
  const offer = haulOffer(G.save, raidId);
  if (!offer || !offer.items.length || offer.sold <= 0) return "";
  if (!don || don.raid !== raidId) don = { raid: raidId, game: "coin", pick: "heads", frac: 0.5, busy: false };
  return `<div class="don3" data-raid="${raidId}">${donInner()}</div>`;
}
const stakeOf = (cap: number, frac: number) => Math.max(1, Math.floor(cap * frac));
function donInner(): string {
  const d = don!, offer = haulOffer(G.save, d.raid), last = econ(G.save).lastGamble;
  if (!offer) return "";
  if (offer.rolled) {
    const r = last?.raid === d.raid ? last : null;
    return `<div class="dhead"><b>Double or Nothing</b><span>with the Fence</span></div>${r ? `<p class="dres ${r.won ? "won" : "lost"}">${r.game === "coin" ? `The coin landed ${r.landed === "edge" ? "on its edge. The house wins" : r.landed}` : `The ball landed on ${r.landed}`}. ${r.won ? `You won 🍌 ${r.payout}.` : `You lost 🍌 ${r.stake}. The Fence pockets it.`}</p><p class="dsub">He bought the haul for 🍌 ${r.sold}. One roll per raid.</p>` : `<p class="dsub">Already rolled for this raid.</p>`}`;
  }
  const cap = offer.cap, stake = stakeOf(cap, d.frac), sides = d.game === "coin" ? ["heads", "tails"] : ["red", "black"];
  const kinds = new Map<string, number>(); for (const i of offer.items) kinds.set(itemType(i), (kinds.get(itemType(i)) ?? 0) + 1);
  return `<div class="dhead"><b>Double or Nothing</b><span>with the Fence</span></div>
    <p class="dsub">He buys this raid's valuables on the spot for <b>🍌 ${offer.sold}</b> at today's prices. Bet some or all of it. One roll per raid, never your items.</p>
    <div class="ditems">${[...kinds].map(([t, n]) => `<span>${iconHtml(t, 22)}${n > 1 ? `×${n}` : ""}</span>`).join("")}</div>
    <div class="dgrp"><span>Game</span><button data-econ="don:game:coin" class="${d.game === "coin" ? "on" : ""}" ${d.busy ? "disabled" : ""}>Coin flip</button><button data-econ="don:game:wheel" class="${d.game === "wheel" ? "on" : ""}" ${d.busy ? "disabled" : ""}>Red or black</button></div>
    <div class="dgrp"><span>Call</span>${sides.map((s) => `<button data-econ="don:pick:${s}" class="${d.pick === s ? "on" : ""} side-${s}" ${d.busy ? "disabled" : ""}>${s[0].toUpperCase() + s.slice(1)}</button>`).join("")}</div>
    <div class="dgrp"><span>Stake</span>${[[0.25, "A quarter"], [0.5, "Half"], [1, "All of it"]].map(([f, l]) => `<button data-econ="don:stake:${f}" class="${d.frac === f ? "on" : ""}" ${d.busy ? "disabled" : ""}>${l} · 🍌 ${stakeOf(cap, f as number)}</button>`).join("")}</div>
    <p class="dodds"><b>${oddsLabel(d.game)}</b> · ${d.game === "coin" ? "the Fence's coin lands on its edge 2% of the time, and then he wins" : "37 pockets: 18 red, 18 black, 1 green for the Fence"} · win pays 🍌 ${stake * 2}</p>
    <div class="dact"><button data-econ="don:roll" class="droll" ${d.busy ? "disabled" : ""}>Sell and roll 🍌 ${stake}</button><button data-econ="don:skip" class="ghost" ${d.busy ? "disabled" : ""}>Keep the haul</button></div>`;
}
const rerenderDon = () => { const el = document.querySelector<HTMLElement>(".don3"); if (el && don) el.innerHTML = donInner(); };
function stampSlip() {
  const slip = document.querySelector(".slip"); if (!slip || slip.querySelector(".stamp.dice")) return;
  const s = document.createElement("span"); s.className = "stamp dice"; s.textContent = "Rolled the dice"; slip.appendChild(s);
}
function rollNow() {
  const d = don; if (!d || d.busy) return;
  const offer = haulOffer(G.save, d.raid); if (!offer || offer.rolled) return;
  const stake = stakeOf(offer.cap, d.frac), u = draw();
  const res = rollDouble(G.save, d.raid, stake, d.game, d.pick, u);
  if (!res) { sfx("nope"); return; }
  d.busy = true; rerenderDon();
  Object.assign(G.save, res.save); save(G.save); host?.money();
  playRoll(d.game, d.pick, res.result.landed, res.pocket, res.result.won, () => {
    d.busy = false; rerenderDon(); stampSlip(); host?.money();
    if (res.result.won) { sting("stingExtract"); sfx("cash"); } else sting("stingBonk"); // TODO(audio): win fanfare / sad trombone takes
  });
}

// ---------------------------------------------------------------- the roll animation (over the slip)
function overlay(cls: string, html: string) {
  const el = document.createElement("div"); el.className = `ov3 ${cls}${reduced() ? " rm" : ""}`; el.innerHTML = html;
  document.getElementById("ui")!.appendChild(el); return el;
}
const fenceFace = () => { const url = portrait("fence"); return url ? `<img src="${url}" alt="The Fence">` : `<span class="emo">🦝</span>`; };
const WHEEL_ORDER = (() => { const out: string[] = []; for (let i = 0; i < 37; i++) out.push(i === 0 ? "green" : i % 2 ? "red" : "black"); return out; })();
function wheelSvg() {
  const R = 120, n = 37, seg = (2 * Math.PI) / n; let paths = "";
  for (let i = 0; i < n; i++) {
    const a0 = i * seg - seg / 2 - Math.PI / 2, a1 = a0 + seg, x0 = R * Math.cos(a0), y0 = R * Math.sin(a0), x1 = R * Math.cos(a1), y1 = R * Math.sin(a1);
    paths += `<path d="M0 0L${x0.toFixed(2)} ${y0.toFixed(2)}A${R} ${R} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}Z" fill="${{ green: "#2f9a52", red: "#c8392a", black: "#24222a" }[WHEEL_ORDER[i]]}" stroke="#c29a5b" stroke-width="1"/>`;
  }
  return `<svg class="wheel" viewBox="-130 -130 260 260" aria-hidden="true"><g class="spin">${paths}<circle r="44" fill="#3a2a22" stroke="#c29a5b" stroke-width="3"/><circle r="10" fill="#e2bf82"/></g></svg><div class="ball" aria-hidden="true"></div>`;
}
/** which visual pocket shows the result: 0 is green; red results land on odd slots, black on even ones */
const wheelSlot = (side: string, pocket = 0) => side === "green" ? 0 : side === "red" ? 2 * Math.max(1, Math.min(18, pocket)) - 1 : 2 * Math.max(1, Math.min(18, pocket - 18));
function playRoll(game: Game, pick: string, side: string, pocket: number | undefined, won: boolean, done: () => void) {
  const label = game === "coin" ? (side === "edge" ? "On its edge!" : side === "heads" ? "Heads" : "Tails") : side[0].toUpperCase() + side.slice(1);
  const el = overlay("roll3", `<div class="rbox"><div class="fence3 sweat">${fenceFace()}<i class="d1"></i><i class="d2"></i><i class="d3"></i></div>
    <div class="stage3">${game === "coin" ? `<div class="coin3"><div class="face h">🍌</div><div class="face t">🏦</div><div class="rim"></div></div>` : wheelSvg()}</div>
    <p class="call">You called <b>${pick}</b> · ${oddsLabel(game)}</p><p class="out" hidden></p></div>`);
  const out = el.querySelector<HTMLElement>(".out")!, fence = el.querySelector<HTMLElement>(".fence3")!;
  const finish = () => {
    out.hidden = false; out.className = `out ${won ? "won" : "lost"}`; out.innerHTML = `${label}. ${won ? "You win!" : "The Fence wins."}`;
    fence.classList.remove("sweat"); fence.classList.add(won ? "sulk" : "grin");
    const close = () => { el.remove(); removeEventListener("keydown", key, true); done(); };
    const key = (e: KeyboardEvent) => { if (["e", "escape", "enter", " "].includes(e.key.toLowerCase())) { e.stopPropagation(); e.preventDefault(); close(); } };
    el.addEventListener("click", close); addEventListener("keydown", key, true);
    setTimeout(close, reduced() ? 1600 : 2600);
  };
  if (reduced()) { // no spin, no slow motion: the result after a short beat
    if (game === "coin") el.querySelector<HTMLElement>(".coin3")!.style.transform = side === "tails" ? "rotateX(180deg)" : side === "edge" ? "rotateX(90deg)" : "none";
    else { const slot = wheelSlot(side, pocket); el.querySelector<SVGGElement>(".spin")!.style.transform = `rotate(${-slot * 360 / 37}deg)`; }
    setTimeout(finish, 350); return;
  }
  // slow motion: fast at first, then a long ease-out over the last second and a half (the Fence sweats)
  const T = 3.4, t0 = performance.now();
  const coin = el.querySelector<HTMLElement>(".coin3"), spin = el.querySelector<SVGGElement>(".spin");
  const endCoin = 360 * 7 + (side === "tails" ? 180 : side === "edge" ? 90 : 0);
  const endWheel = 360 * 4 - wheelSlot(side, pocket) * (360 / 37);
  sfx(game === "coin" ? "throw" : "whirr");
  let lastTick = 0;
  const ease = (k: number) => 1 - Math.pow(1 - k, 4);
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / 1000 / T), e = ease(k);
    if (coin) { coin.style.transform = `translateY(${(-Math.sin(Math.min(1, k * 1.25) * Math.PI) * 70).toFixed(1)}px) rotateX(${(endCoin * e).toFixed(1)}deg)`; }
    if (spin) {
      const ang = endWheel * e; spin.style.transform = `rotate(${ang.toFixed(2)}deg)`;
      const slot = Math.floor(ang / (360 / 37)); if (slot !== lastTick) { lastTick = slot; if (k > 0.45) sfx("tick", 0.6); }
    }
    if (k < 1) requestAnimationFrame(step); else { sfx(game === "coin" ? "thunk" : "pop"); finish(); }
  };
  requestAnimationFrame(step);
}

// ---------------------------------------------------------------- lockbox reveal
function openBox(inst: string) {
  const res = openLockbox(G.save, inst, draw(), draw());
  if (!res) { sfx("nope"); return; }
  Object.assign(G.save, res.save); save(G.save); host?.money();
  const prize = itemDef(res.prize), q = tierQuality(prize.rarity), tier = TIERS[TIER_KEYS[q]];
  const el = overlay("box3", `<div class="rbox"><div class="lbx shake">${iconHtml(inst, 96)}</div><div class="prize" hidden style="--c:${tier.color}">${iconHtml(res.prize, 96)}<b>${esc(prize.name)}</b><span>${tier.name} · worth 🍌 ${prize.value}</span></div>
    <p class="call">${esc(lockboxOf(itemType(inst))!.name)} · fee 🍌 ${res.fee}</p>${oddsTableHtml(itemType(inst))}</div>`);
  sfx("crateTick");
  const reveal = () => {
    el.querySelector<HTMLElement>(".lbx")!.hidden = true; el.querySelector<HTMLElement>(".prize")!.hidden = false;
    sfx("crate"); if (q >= 4) { sfx("rare"); sting("stingRare"); }
    const close = () => { el.remove(); removeEventListener("keydown", key, true); host?.reopen("sell"); };
    const key = (e: KeyboardEvent) => { if (["e", "escape", "enter", " "].includes(e.key.toLowerCase())) { e.stopPropagation(); e.preventDefault(); close(); } };
    el.addEventListener("click", close); addEventListener("keydown", key, true);
  };
  setTimeout(reveal, reduced() ? 250 : 1300);
}

// ---------------------------------------------------------------- the Performance Review
/** a promotion waiting: show the plate once (called by the vault when no panel is open) */
export function maybeReview(): boolean {
  const t = pendingReview(G.save); if (t < 0 || !host) return false;
  markReviewed(G.save); save(G.save);
  if (G.bot) return false; // the pacing bot gets promoted quietly
  const unlocks = [...CATALOG.filter((f) => f.netWorth === t).map((f) => f.name), ...LINES.flatMap((l) => l.upgradeTitle.map((need, i) => need === t ? `${CATALOG.find((f) => f.id === l.id)!.name} tier ${i + 2}` : "")).filter(Boolean)];
  host.showPanel(`<header><h2>Performance Review</h2><small>Banana Bank Ltd. · Human Resources</small></header>
    <div class="perf3"><p class="pre">Effective immediately, the Monkey Businessman is promoted to</p><div class="ptitle">${esc(titleName(t))}</div><span class="pstamp">Promoted</span>
    <p class="pquote">"${esc(TITLES[t].blurb)}"</p><div class="stats"><div class="stat"><b class="num">🍌 ${fmt(lifetime(G.save))}</b><span>net worth</span></div><div class="stat"><b>${t + 1} of ${TITLES.length}</b><span>on the rich list</span></div>${TITLES[t + 1] ? `<div class="stat"><b class="num">🍌 ${fmt(TITLES[t + 1].at)}</b><span>for ${esc(TITLES[t + 1].name)}</span></div>` : ""}</div>
    ${unlocks.length ? `<h4>New on the blueprint desk</h4><ul class="punl">${unlocks.map((u) => `<li>${esc(u)}</li>`).join("")}</ul>` : ""}</div>
    <div class="actions"><button data-econ="review:close">Back to work</button></div>`, "review");
  sting("stingRare"); sfx("cash"); G.stage.trauma = 0.15;
  const chip = document.querySelector(".home-title"); if (chip) chip.outerHTML = titleChipHtml();
  return true;
}

// ---------------------------------------------------------------- actions (one delegated listener)
addEventListener("click", (ev) => {
  const b = (ev.target as HTMLElement | null)?.closest<HTMLElement>("[data-econ]");
  if (!b || (b as HTMLButtonElement).disabled || G.scene !== "bunker") return;
  ev.stopPropagation(); act(b.dataset.econ!);
});
function act(a: string) {
  const sv = G.save, [k, verb, arg] = a.split(":");
  if (k === "review") { host?.closePanel(); sfx("ui"); return; }
  if (k === "line" && isLine(arg)) {
    if (verb === "collect") { const got = collectLine(sv, arg, claimDelivery); save(sv); host?.money(); sfx(got.cash ? "cash" : "pick"); host?.float(`Collected ${got.items.length ? `${got.items.length} item${got.items.length > 1 ? "s" : ""}` : ""}${got.cash ? ` 🍌 ${got.cash}` : ""}${got.rounds ? ` ${got.rounds} rounds` : ""}`.trim(), arg, "#ffd84a"); }
    else if (verb === "up") { if (upgradeLine(sv, arg)) { save(sv); sfx("buy"); host?.money(); host?.float(`Tier ${lineState(sv, arg).tier}!`, arg, "#fff3c4"); } else sfx("nope"); }
    else if (verb === "pause") { toggleLine(sv, arg); save(sv); sfx("ui"); }
    host?.refresh(); host?.reopen("line", sv.base.items.find((i) => i.def === arg)?.uid); return;
  }
  if (k === "wager") {
    if (verb === "cancel") { cancelWager(sv); save(sv); sfx("ui"); }
    else { const r = placeWager(sv, verb, Number(arg)); if (r.ok) { save(sv); sfx("buy"); host?.float(`Sal: "${wagerOf(verb)!.odds} to 1. You're on."`, "sal", "#fff3c4"); } else { sfx("nope"); host?.float(r.reason, "sal", "#ffb648"); } }
    host?.reopen("sal"); return;
  }
  if (k === "box") { openBox(a.slice(4)); return; }
  if (k === "don" && don) {
    if (verb === "game") { don.game = arg as Game; don.pick = arg === "coin" ? "heads" : "red"; sfx("ui"); }
    else if (verb === "pick") { don.pick = arg; sfx("ui"); }
    else if (verb === "stake") { don.frac = Number(arg); sfx("ui"); }
    else if (verb === "roll") { rollNow(); return; }
    else if (verb === "skip") { const el = document.querySelector<HTMLElement>(".don3"); if (el) el.innerHTML = `<div class="dhead"><b>Double or Nothing</b><span>with the Fence</span></div><p class="dsub">"Suit yourself. The table's open after every raid."</p>`; sfx("ui"); return; }
    rerenderDon(); return;
  }
}
/** tests and captures (?dev): force the next draws, read the odds */
if (typeof location !== "undefined" && new URLSearchParams(location.search).has("dev")) (globalThis as unknown as { __econ: object }).__econ = { force: (...u: number[]) => { forced = [...u]; }, winChance, LOCKBOXES, WAGERS };
