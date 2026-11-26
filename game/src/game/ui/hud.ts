// Raid HUD v3, direction A "Corner office" (G1.5 row 06; styles in ui3.css). Placement is Duckov's
// (POLISH_FINDINGS 9 table, 1920x1080 reference px, scaled by ui/scale.ts): clock top-left at an 11 px inset,
// extract countdown top-centre (centre y 106.8), health / armor / load bottom-left of centre, the weapon slots
// (POLISH_FINDINGS 17 "HUD weapon display", Duckov's WeaponButtons row at 2560x1440 x 0.75: gun 1 96, gun 2 96,
// briefcase 60, 15 px gaps, bottom 37.5, right edge at centre + 42.75), the ammo block floating 6 px above the gun in
// hand and centred on it (Duckov's BulletTypeHUD moves to the selected card), quick slots 3-8 from centre + 56.25
// (75 px, 15 px gaps), minimap top-right, prompt and stamina following the character, the action bar at y 225.
// Duckov's cards show only the icon tinted by quality; ours also print loaded / reserve in the gun's caliber (Moo).
// The DOM is touched only when a value changes (every write is behind a key compare), so the HUD costs no layout
// per frame beyond the few follow-the-character transforms.
// Tab and looting live in ui/lootview.ts (openLoot); hud.inventory() is the Tab toggle.
import "@fontsource/barlow-condensed/500.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/700.css";
import "./ui3.css";
import * as THREE from "three";
import { G, flat, entryGraceRemaining, type Crate, type Enemy } from "../core/state";
import { buildExitCards, updateExitCards } from "./exitcards";
import { mapDestination, destinationBearing } from "./navigation";
import { levelOf } from "./mapdata";
import { buildPickupFeed, updatePickupFeed } from "./pickupfeed";
import { itemDef } from "../loot/raidloot";
import { CLEARINGS } from "../world/layout";
import { drainEquipmentEvents, heardEnemies } from "../loot/equipment-actions";
import { gearSummary, carryLimit } from "./equipui";
import { iconHtml } from "./itemicon";
import { iconUrl } from "./icons";
import { carriedWeight } from "../actors/player";
import { HEALS } from "../combat/weapons";
import { CALIBERS, gunOf } from "../combat/guns";
import { DRAW_TIME } from "../combat/arsenal";
import { cancelReload } from "../combat/reload";
import { interruptEquip } from "../loot/equipment-actions";
import { sfx } from "../core/audio";
import { menuTick } from "./menubar";
import { waypoint } from "./mapview";
import { itemType } from "../loot/instances";
import { packStacks } from "../loot/pack";
import { toRef } from "./scale";
import { HS, currentScatter, restScatter } from "../combat/handling";
import { tuneObject } from "../core/tune";
import { prefs } from "./settings";
import { closeLoot, lootHooks, lootOpen, lootSwallowsInteract, openLoot, toggleInventory, updateLoot, useHeal, type LootTarget } from "./lootview";

export { openLoot, closeLoot, lootOpen, type LootTarget };
const root = () => document.getElementById("ui")!;
const BRK = `<i class="brk tl"></i><i class="brk tr"></i><i class="brk bl"></i><i class="brk br"></i>`;
let E: Record<string, HTMLElement> = {};
const proj = new THREE.Vector3();
function toScreen(p: THREE.Vector3) { proj.copy(p).project(G.stage.camera); return { x: (proj.x * 0.5 + 0.5) * innerWidth, y: (-proj.y * 0.5 + 0.5) * innerHeight, on: Math.abs(proj.x) < 1 && Math.abs(proj.y) < 1 && proj.z < 1 }; }
let lastHeard = "", lastEhp = "", lastArrows = "", lastClock = "", lastHp = -1, lastPrompt = "", lastStam = "", lastLoad = "", lastAmmo = "", lastQuick = "", lastRl = "", lastSearch = "", lastWeapons = "";
let toastT = 0, bannerT = 0, promptT = 0, helpT = 0, shownScatter = 0, shownRest = 0, lastCross = "";
let actA = 0, actK = 0, actLabel = "", wpT = 0, lastWp = "";
/** the timed action in progress, for the ring and the bar: a reload, a heal, putting gear on, the 0.15 s draw */
function currentAction(): { k: number; label: string; cancel: boolean; ringOnly?: boolean } | null {
  if (G.reloadT >= 0) { const d = gunOf(G.save.guns[G.slot]?.inst); return { k: G.reloadT, label: `Reloading${d ? ` · ${d.name}` : ""}`, cancel: true }; }
  if (G.useItem) return { k: G.useItem.t / G.useItem.time, label: itemDef(G.useItem.id).name, cancel: true };
  if (G.equipping) return { k: G.equipping.t / G.equipping.time, label: `Putting on the ${itemDef(G.equipping.inst).name}`, cancel: true };
  if (G.drawT < DRAW_TIME) return { k: G.drawT / DRAW_TIME, label: "", cancel: false, ringOnly: true };
  return null;
}
/** X: cancel the timed action (Duckov's "[X] Cancel" under the action bar). X is free in a raid (input.ts) */
function cancelAction() {
  if (G.reloadT >= 0) { cancelReload(); return true; }
  if (G.useItem) { G.useItem = null; return true; }
  if (G.equipping) { interruptEquip(); return true; }
  return false;
}
/** the crosshair reads the gun (POLISH_FINDINGS 16, Duckov AimMarker): each tick sits base + perDeg x scatter px from
 *  the centre (1440-tall reference, scaled to the window), the shown scatter chasing the live cone at `chase` deg/s.
 *  ADS fades in a brass ring at the same radius and a second, inner ring at the resting cone, so you see the bloom
 *  above rest shrink back. The whole cross sits on the kicked aim point, so recoil moves it. */
export const CROSS = tuneObject("crosshair", { base: 20, perDeg: 5, chase: 500 }, {
  base: { min: 0, max: 80, step: 0.5, label: "gap at zero scatter (px @1440)" }, perDeg: { min: 0, max: 20, step: 0.1, label: "px per degree of scatter (@1440)" },
  chase: { min: 5, max: 2000, step: 5, label: "shown scatter chase (deg/s)" },
}, { note: "crosshair (ui/hud.ts)" });
const noiseRings: { m: THREE.Mesh; t: number }[] = [];
const keyed = (t: string) => { const m = /^([A-Z0-9/]+) · (.*)$/.exec(t); return m ? `<kbd>${m[1]}</kbd><span>${m[2]}</span>` : `<span>${t}</span>`; };
const set = (el: HTMLElement | undefined, html: string) => { if (el && el.innerHTML !== html) el.innerHTML = html; };
const QUICK_KEYS = ["3", "4", "5", "6", "7", "8"];
/** quick slots 3-8: each heal type you pick up takes the first free slot and keeps it for the raid (Duckov binds
 *  items to quick slots; ours bind themselves so a first-time player never has to) */
let quick: (string | null)[] = [null, null, null, null, null, null];
function bindQuick() { for (const id of Object.keys(HEALS)) if (G.pack.some(inst => itemType(inst) === id) && !quick.includes(id)) { const k = quick.indexOf(null); if (k >= 0) quick[k] = id; } }
let keysWired = false;
function wireKeys() {
  if (keysWired) return; keysWired = true;
  addEventListener("keydown", (e) => {
    if (G.scene !== "raid" || e.repeat) return;
    if (e.code === "KeyX" && !lootOpen()) { if (cancelAction()) sfx("ui"); return; }
    const k = QUICK_KEYS.indexOf(e.key); if (k < 0) return;
    const id = quick[k]; if (!id) return;
    if (!useHeal(id) && !lootOpen()) { if (!G.pack.some(inst => itemType(inst) === id)) hud.toast(`No ${itemDef(id).name} left`); else if (G.hp >= G.maxHp) hud.toast("You're already at full health"); }
  });
}
const mmss = (t: number) => `${String(Math.floor(t / 60)).padStart(2, "0")}:${(t % 60).toFixed(3).padStart(6, "0")}`;

export const hud = {
  build() {
    closeLoot();
    root().innerHTML = ""; E = {}; lastArrows = lastClock = lastPrompt = lastHeard = lastEhp = lastStam = lastLoad = lastAmmo = lastQuick = lastRl = lastSearch = lastWeapons = ""; lastHp = -1;
    quick = [null, null, null, null, null, null]; wireKeys(); lootHooks.changed = () => { hud.health(); hud.pack(); hud.ammo(); };
    const scr = document.createElement("div"); scr.className = "h3-screen"; scr.style.cssText = "position:absolute;inset:0;pointer-events:none"; root().appendChild(scr);
    const ref = document.createElement("div"); ref.className = "ui-ref h3"; root().appendChild(ref);
    buildPickupFeed(root());
    const el = (cls: string, html = "", parent: HTMLElement = ref) => { const d = document.createElement("div"); d.className = cls; d.innerHTML = html; parent.appendChild(d); return d; };
    E.hurt = el("h3-hurt", "", scr); E.heard = el("h3-heard", "", scr); E.ehp = el("h3-ehp", "", scr); E.arrows = el("h3-arrows", "", scr);
    E.cross = el("h3-cross", `<u class="ring"></u><u class="rest"></u><i></i><i></i><i></i><i></i><b></b>`, scr); shownScatter = shownRest = 0; lastCross = "";
    // the action ring at the cursor (Duckov's ActionProgressHUD, frames/reload: a ring nested inside the crosshair ticks)
    E.rl = el("h3-rl", `<svg viewBox="0 0 60 60"><circle class="tr" cx="30" cy="30" r="24"/><circle class="fg fgb" cx="30" cy="30" r="24" pathLength="100"/><circle class="fg" cx="30" cy="30" r="24" pathLength="100"/></svg>`, scr); actA = 0; actK = 0;
    E.clock = el("h3-clock shade", "<b></b><span></span><em></em>");
    E.help = el("h3-help shade", `<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move, <kbd>Shift</kbd> sprint, <kbd>Space</kbd> dash<br>Click to shoot, right-click to aim, <kbd>R</kbd> reload, <kbd>V</kbd> briefcase<br><kbd>E</kbd> search, <kbd>Q</kbd> or <kbd>3</kbd>–<kbd>8</kbd> heal, <kbd>Tab</kbd> pack, <kbd>M</kbd> map`);
    helpT = G.save.raids === 0 ? 30 : 8;
    E.hp = el("plate h3-hp", `${BRK}<span class="heart" aria-hidden="true">♥</span><div class="bar"><i class="lag"></i><i class="fill"></i></div><b class="num"></b>`);
    E.status = el("h3-status", ""); E.status.setAttribute("aria-label", "Character status"); E.status.setAttribute("aria-live", "polite");
    E.armor = el("plate h3-badge h3-armor", `${BRK}<span class="k">armor</span><span class="v"></span><span class="k s"></span>`);
    E.load = el("plate h3-badge h3-load", `${BRK}<span class="k">load</span><span class="v"></span><span class="k s"></span>`);
    E.capacity = el("plate h3-capacity", `${BRK}<span>Pack slots</span><span class="num"></span>`);
    E.grace = el("plate h3-grace", `${BRK}<span></span>`);
    E.ammo = el("plate h3-ammo", `${BRK}<span class="m"></span><span class="r"></span><span class="c"></span>`);
    E.weapons = el("h3-weapons", `<div class="plate h3-slot gun" data-k="0"></div><div class="plate h3-slot gun" data-k="1"></div><div class="plate h3-slot case"><span class="key">V</span><span class="emo" style="font-size:30px">💼</span></div>`);
    E.quick = el("h3-quick");
    E.extract = el("plate h3-extract", "");
    E.routes = el("h3-routes", ""); buildExitCards(E.routes);
    E.guidance = el("plate h3-guidance", `<span class="nav-arrow" aria-hidden="true">↑</span><span><b></b><small></small></span>`); E.guidance.hidden = true;
    // the waypoint table, bottom-right (Duckov's [M] distance readout): your newest map marker, else the nearest extract
    E.wp = el("h3-wp shade", `<span class="ic"></span><span class="t"><small></small><b class="num"></b></span><kbd>M</kbd>`); wpT = 0; lastWp = "";
    // ... and its bar above the hotbar's middle with the cancel key under it (frames/reload: about 6% of the screen wide)
    E.act = el("h3-act", `<span class="l"></span><div class="bar"><i></i></div><div class="x"><kbd>X</kbd>Cancel</div>`);
    E.toast = el("plate h3-toast", ""); E.banner = el("h3-banner", "");
    E.stam = el("h3-stam");
    E.prompt = el("plate h3-prompt", "");
    E.search = el("h3-search", `<svg viewBox="0 0 40 40"><circle class="bg" cx="20" cy="20" r="19"/><circle class="tr" cx="20" cy="20" r="16"/><circle class="fg" cx="20" cy="20" r="16"/></svg><span class="glass"><svg viewBox="0 0 24 24" fill="none" stroke="#f3ead6" stroke-width="2.6" stroke-linecap="square"><circle cx="10" cy="10" r="6"/><path d="M15 15l5 5"/></svg></span>`);
    hud.health(); hud.ammo(); hud.pack();
  },
  /** the two gun cards: icon (tier glow), key, loaded / reserve in the gun's caliber, the frame on the one in hand,
   *  the reload strip and the draw sweep (Duckov holdStadyTime 0.15 s) */
  weapons() {
    if (!E.weapons) return;
    const k = G.save.guns.map((gs, i) => gs ? `${gs.inst}:${G.loaded[i]}:${G.reserve[gunOf(gs.inst)!.caliber]}` : "-").join("|") + "|" + G.slot;
    if (k === lastWeapons) return; lastWeapons = k;
    for (const i of [0, 1] as const) {
      const card = E.weapons.querySelector(`[data-k="${i}"]`) as HTMLElement, gs = G.save.guns[i], def = gunOf(gs?.inst);
      card.classList.toggle("on", !!gs && i === G.slot); card.classList.toggle("none", !gs);
      if (!gs || !def) { card.style.removeProperty("--rar"); card.innerHTML = `${BRK}<span class="key">${i + 1}</span>`; continue; }
      card.style.setProperty("--rar", `var(--rar-${def.tier})`);
      const empty = G.loaded[i] === 0 && G.reserve[def.caliber] === 0;
      card.innerHTML = `${BRK}<span class="key">${i + 1}</span>${iconHtml(gs.inst, 80)}<span class="n${empty ? " out" : ""}">${G.loaded[i]}<small>/${G.reserve[def.caliber]}</small></span><span class="cal">${CALIBERS[def.caliber].short}</span><i class="rl"></i><i class="draw"></i>`;
      card.title = def.name;
    }
    lastRl = ""; // the reload strip lives in the card just rebuilt
    // the ammo block floats above the gun in hand (Duckov: 8 px above the selected card at 2560, centred on it)
    const right = 42.75, centre = G.slot === 0 ? right - 60 - 15 - 96 - 15 - 48 : right - 60 - 15 - 48;
    if (E.ammo) E.ammo.style.left = `calc(50% + ${centre - 105}px)`;
  },
  health() {
    if (!E.hp) return; const k = Math.max(0, G.hp / G.maxHp);
    (E.hp.querySelector(".fill") as HTMLElement).style.width = k * 100 + "%"; (E.hp.querySelector(".lag") as HTMLElement).style.width = k * 100 + "%";
    set(E.hp.querySelector("b") as HTMLElement, String(Math.ceil(G.hp))); E.hp.classList.toggle("low", k < 0.3);
    const g = gearSummary(G.gear);
    set(E.armor.querySelector(".v") as HTMLElement, String(g.body)); set(E.armor.querySelector(".s") as HTMLElement, `head ${g.head}`);
    if (lastHp >= 0 && G.hp < lastHp) { E.hp.classList.remove("shake"); void E.hp.offsetWidth; E.hp.classList.add("shake"); }
    lastHp = G.hp;
  },
  /** heals report here from actors/player.ts; the action ring and bar read G.useItem, G.equipping and the reload directly
   *  each frame (hud.update), so this only keeps the old call sites working */
  use(_u: { id: string; t: number; time: number } | null) {},
  status() {
    const lines: { label: string; help: string; danger?: boolean }[] = [];
    if (G.alive) {
      if (G.hp < G.maxHp) lines.push({ label: G.hp / G.maxHp < 0.3 ? "Critical health" : "Injured", help: "Q or a healing quick slot to recover", danger: G.hp / G.maxHp < 0.3 });
      if (G.painT > 0) lines.push({ label: "Recently hit", help: "Movement briefly slowed · Find cover" });
      const ratio = carriedWeight() / carryLimit();
      if (ratio > 1) lines.push({ label: "Overweight", help: "Drop or store items to restore movement", danger: true });
      else if (ratio > 0.75) lines.push({ label: "Heavy load", help: "Movement slowed · Lighten your pack" });
      if (G.useItem) lines.push({ label: `Healing · ${Math.max(0, G.useItem.time - G.useItem.t).toFixed(1)}s`, help: "Taking damage or dashing interrupts healing" });
      else if (G.stamina < 10) lines.push({ label: "Too tired to dash", help: "Stop sprinting and let stamina recover" });
    }
    const html = lines.map(line => `<div class="${line.danger ? "danger" : ""}"><b>${line.label}</b><small>${line.help}</small></div>`).join("");
    if (E.status.innerHTML !== html) E.status.innerHTML = html;
  },
  money() {},
  ammo() {
    if (!E.ammo) return;
    hud.weapons();
    const def = gunOf(G.save.guns[G.slot]?.inst);
    const st = !def ? "empty" : G.reloadT >= 0 ? "reloading" : G.mag === 0 && G.ammo === 0 ? "empty" : "";
    const other = G.save.guns[G.slot === 0 ? 1 : 0];
    const cap = !def ? "No gun: swing V" : st === "reloading" ? "Reloading…" : st === "empty" ? (other ? `No ${CALIBERS[def.caliber].short}: press ${G.slot === 0 ? 2 : 1}` : "No rounds: swing V") : G.mag === 0 ? "Press R to reload" : def.name; // the caliber is on the card
    const k = `${G.mag}|${G.ammo}|${st}|${cap}`; if (k === lastAmmo) return; lastAmmo = k;
    E.ammo.className = `plate h3-ammo ${st}`;
    set(E.ammo.querySelector(".m") as HTMLElement, String(G.mag).padStart(2, "0")); set(E.ammo.querySelector(".r") as HTMLElement, `/ ${String(G.ammo).padStart(2, "0")}`);
    set(E.ammo.querySelector(".c") as HTMLElement, cap);
  },
  pack() { hud.bar(); },
  /** quick slots 3-8 and the load badge */
  bar() {
    if (!E.quick) return; bindQuick();
    const qk = quick.map((id) => (id ? `${id}:${G.pack.filter((p) => itemType(p) === id).length}` : "")).join(",") + "|" + (G.useItem?.id ?? "");
    if (qk !== lastQuick) {
      lastQuick = qk;
      E.quick.innerHTML = quick.map((id, i) => {
        const n = id ? G.pack.filter((p) => itemType(p) === id).length : 0;
        return `<div class="plate h3-q ${id && !n ? "none" : ""} ${id && G.useItem && itemType(G.useItem.id) === id ? "using" : ""}" ${id ? `title="${itemDef(id).name}"` : ""}><span class="key">${QUICK_KEYS[i]}</span>${id ? iconHtml(id, 56) + `<span class="n">${n}</span>` : ""}</div>`;
      }).join("");
    }
    hud.load();
  },
  load() {
    if (!E.load) return;
    const w = carriedWeight(), lim = carryLimit(), r = w / lim, band = r > 1 ? "over" : r > 0.75 ? "heavy" : r <= 0.25 ? "light" : "normal";
    const used = packStacks(G.pack).length, remaining = Math.max(0, G.packSlots - used);
    const k = `${w.toFixed(1)}|${lim}|${band}|${used}|${G.packSlots}`; if (k === lastLoad) return; lastLoad = k;
    set(E.capacity.querySelector(".num") as HTMLElement, `Used ${used}/${G.packSlots} · Free ${remaining}`);
    E.capacity.classList.toggle("full", remaining === 0);
    E.load.className = `plate h3-badge h3-load ${band}`;
    set(E.load.querySelector(".v") as HTMLElement, w.toFixed(1)); set(E.load.querySelector(".s") as HTMLElement, band === "over" ? "overloaded" : `of ${lim} kg`);
  },
  /** Tab: the shared loot screen with no target (ui/lootview.ts) */
  inventory(open?: boolean) { toggleInventory(open); },
  invOpen: () => lootOpen(),
  /** the loot screen owns E (and the E that closed it) */
  swallowInteract: () => lootSwallowsInteract(),
  prompt(t: string) { if (!E.prompt) return; if (t !== lastPrompt) { E.prompt.innerHTML = BRK + keyed(t); lastPrompt = t; } E.prompt.classList.add("on"); promptT = 0.15; },
  toast(t: string) { if (!E.toast) return; E.toast.innerHTML = BRK + t; E.toast.classList.remove("on"); void E.toast.offsetWidth; E.toast.classList.add("on"); toastT = 4.5; },
  banner(t: string, sub = "") { if (!E.banner) return; E.banner.innerHTML = `<div class="plate">${BRK}<b>${t}</b>${sub ? `<small>${sub}</small>` : ""}<div class="tie"></div></div>`; E.banner.classList.remove("on"); void E.banner.offsetWidth; E.banner.classList.add("on"); bannerT = 2.8; },
  search(c: Crate | null, k: number) {
    if (!E.search) return;
    if (!c) { if (lastSearch) { E.search.style.display = "none"; lastSearch = ""; } return; }
    const s = toScreen(new THREE.Vector3(c.x, 1.6, c.z)); lastSearch = "on"; E.search.style.display = "block";
    E.search.style.transform = `translate(${toRef(s.x).toFixed(1)}px,${toRef(s.y).toFixed(1)}px)`;
    (E.search.querySelector(".fg") as SVGCircleElement).style.strokeDashoffset = String(100.5 * (1 - Math.min(1, k)));
  },
  hitMarker(kill: boolean) { void kill; /* combat/feedback.ts draws the four markers (restyled in ui3.css) */ },
  hurt(_src: string) { if (!E.hurt) return; E.hurt.classList.remove("on"); void E.hurt.offsetWidth; E.hurt.classList.add("on"); },
  enemyDown(_e: Enemy) {},
  bonkOut() { hud.banner("Bonked!", "The crew is carrying you home"); },
  /** noise stays a mechanic (enemies hear it) but has no on-screen ring (Moo 2026-11-15: "I don't think having that ripple circle is good") */
  noiseRing(at: THREE.Vector3, r: number) { if (at && r > 0) return;
    const m = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 64), new THREE.MeshBasicMaterial({ color: "#fff6d6", transparent: true, opacity: 0.5, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(at.x, at.y + 0.08, at.z); m.scale.setScalar(r * 0.3); m.renderOrder = 4; G.stage.scene.add(m); noiseRings.push({ m, t: 0 });
    (m.userData as { r: number }).r = r;
  },
  /** top-centre extract countdown (Duckov EvacuationCountdownUI: minutes, seconds and a 3-digit millisecond field) */
  extract(label: string, k: number, secs: number | null = null) {
    if (!E.extract) return; if (k <= 0) { E.extract.style.display = "none"; return; }
    const name = label.replace(/^\p{Extended_Pictographic}️?\s*/u, "");
    E.extract.style.display = "block";
    E.extract.innerHTML = `${BRK}<div class="l">${name}${secs === null ? "" : " in"}</div>${secs === null ? `<div class="t wait">Stand still</div>` : `<div class="t">${mmss(secs)}</div>`}<div class="bar"><i style="width:${Math.min(100, k * 100).toFixed(1)}%"></i></div>`;
  },
  update(dt: number) {
    if (!E.cross) return;
    const grace = entryGraceRemaining();
    E.grace.hidden = grace <= 0;
    if (grace > 0) set(E.grace.querySelector("span") as HTMLElement, `Spawn protection · ${Math.ceil(grace)}s`);
    updateLoot(dt); menuTick();
    updatePickupFeed();
    hud.status();
    updateExitCards(E.routes, dt);
    // follow-character pieces: projected each frame, written in reference px
    const me = toScreen(G.pp.clone().setY(G.pp.y + 1.2)), mx = toRef(me.x), my = toRef(me.y);
    { // stamina ring beside the character, hidden when full (Duckov: stamina under FollowCharacterHUD, offset left)
      const k = G.stamina / 100, v = k >= 0.999 ? "full" : `${k.toFixed(2)}|${G.stamina < 20}`;
      if (v !== lastStam) { lastStam = v; E.stam.style.opacity = v === "full" ? "0" : "1"; E.stam.style.setProperty("--k", k.toFixed(3)); E.stam.classList.toggle("low", G.stamina < 20); }
      if (v !== "full") E.stam.style.transform = `translate(${(mx - 54).toFixed(1)}px,${(my - 18).toFixed(1)}px)`;
    }
    if (promptT > 0) E.prompt.style.transform = `translate(${(mx + 46).toFixed(1)}px,${(my - 4).toFixed(1)}px)`;
    hud.ammo(); hud.load();
    hud.weapons();
    { const rl = G.reloadT >= 0 ? G.reloadT.toFixed(2) : "", dr = G.drawT < DRAW_TIME ? (G.drawT / DRAW_TIME).toFixed(2) : "";
      if (rl + dr !== lastRl) { lastRl = rl + dr; const c = E.weapons.querySelector(`[data-k="${G.slot}"]`) as HTMLElement | null;
        for (const q of E.weapons.querySelectorAll<HTMLElement>(".rl")) q.style.setProperty("--rl", "0");
        c?.querySelector<HTMLElement>(".rl")?.style.setProperty("--rl", rl || "0"); c?.querySelector<HTMLElement>(".draw")?.style.setProperty("--dr", dr || "1"); } }
    if ((wpT -= dt) <= 0) { wpT = 0.25; const w = waypoint(), k = w ? `${w.svg}|${w.label}|${Math.round(w.d)}` : "";
      if (k !== lastWp) { lastWp = k; E.wp.style.display = w ? "" : "none"; if (w) { (E.wp.querySelector(".ic") as HTMLElement).innerHTML = w.svg; E.wp.classList.toggle("pin", w.kind === "pin"); set(E.wp.querySelector("small") as HTMLElement, w.label); set(E.wp.querySelector("b") as HTMLElement, `${String(Math.round(w.d)).padStart(2, "0")} m`); } }
      const target = prefs.mapAssist ? mapDestination(G.save.activeRaid?.id ?? "") : null;
      E.guidance.hidden = !target;
      if (target) {
        const bearing = destinationBearing(G.pp, target, G.stage.cam.yaw), sameFloor = levelOf(G.pp.x) === levelOf(target.x), arrived = sameFloor && bearing.distance <= 4;
        const arrow = E.guidance.querySelector<HTMLElement>(".nav-arrow")!;
        arrow.hidden = !sameFloor || arrived; arrow.style.transform = `rotate(${bearing.angle.toFixed(1)}deg)`;
        set(E.guidance.querySelector("b") as HTMLElement, target.label);
        set(E.guidance.querySelector("small") as HTMLElement, !sameFloor ? `Destination ${levelOf(target.x) === "under" ? "underground" : "on surface"} · Use a map connection` : arrived ? "Near destination" : `Approx. direction ${bearing.compass} · ${Math.round(bearing.distance)} m`);
      }
    }
    toastT -= dt; bannerT -= dt; promptT -= dt;
    if (prefs.controls) { if (E.help.classList.contains("gone")) E.help.classList.remove("gone"); helpT = Math.max(helpT, 0.01); }
    else if (helpT > 0) { helpT -= dt; if (helpT <= 0) E.help.classList.add("gone"); }
    if (toastT <= 0 && E.toast.classList.contains("on")) E.toast.classList.remove("on");
    if (bannerT <= 0 && E.banner.classList.contains("on")) E.banner.classList.remove("on");
    if (promptT <= 0 && E.prompt.classList.contains("on")) E.prompt.classList.remove("on");
    const a = toScreen(G.aimPoint); E.cross.style.transform = `translate(${a.x.toFixed(1)}px,${a.y.toFixed(1)}px)`;
    { // the action ring and bar (POLISH_FINDINGS 12: progress = current / total, alpha approaching shown or hidden at 8
      // per second; frames/reload: the ring at the cursor and the bar over the hotbar together, X cancels)
      const act = currentAction(), want = act ? 1 : 0;
      actA = want > actA ? Math.min(want, actA + 8 * dt) : Math.max(want, actA - 8 * dt);
      if (act) { actK = act.k; if (act.label !== actLabel) { actLabel = act.label; (E.act.querySelector(".l") as HTMLElement).textContent = act.label; } E.act.classList.toggle("nocancel", !act.cancel); E.act.classList.toggle("ringonly", !!act.ringOnly); }
      const on = actA > 0.001, k = Math.max(0, Math.min(1, actK));
      if (on) {
        E.rl.style.display = "block"; E.rl.style.opacity = actA.toFixed(3); E.rl.style.transform = `translate(${a.x.toFixed(1)}px,${a.y.toFixed(1)}px)`;
        for (const c of E.rl.querySelectorAll<SVGCircleElement>(".fg")) c.style.strokeDashoffset = String(100 * (1 - k));
        E.act.style.display = "block"; E.act.style.opacity = actA.toFixed(3); (E.act.querySelector(".bar i") as HTMLElement).style.width = `${(k * 100).toFixed(1)}%`;
      } else if (E.rl.style.display !== "none") { E.rl.style.display = "none"; E.act.style.display = "none"; }
      E.cross.classList.toggle("act", on && actA > 0.2); // the ticks step out so the ring sits inside them
    }
    { // scatter gap, ADS ring (CROSS above)
      const step = CROSS.chase * dt, cs = currentScatter(), rs = restScatter() * HS.move;
      shownScatter = Math.abs(cs - shownScatter) <= step ? cs : shownScatter + Math.sign(cs - shownScatter) * step;
      shownRest = Math.abs(rs - shownRest) <= step ? rs : shownRest + Math.sign(rs - shownRest) * step;
      const k = innerHeight / 1440, gap = (CROSS.base + CROSS.perDeg * shownScatter) * k, rest = (CROSS.base + CROSS.perDeg * shownRest) * k;
      const key = `${gap.toFixed(1)}|${rest.toFixed(1)}|${HS.ads.toFixed(2)}`;
      if (key !== lastCross) {
        lastCross = key; const st = E.cross.style;
        st.setProperty("--spread", gap.toFixed(1) + "px"); st.setProperty("--rest", rest.toFixed(1) + "px"); st.setProperty("--ads", HS.ads.toFixed(2));
        E.cross.classList.toggle("ads", HS.ads > 0.5);
      }
    }
    const lock = !G.intent.aimNdc; if (E.cross.classList.contains("lock") !== lock) E.cross.classList.toggle("lock", lock);
    for (let i = noiseRings.length - 1; i >= 0; i--) { const n = noiseRings[i]; n.t += dt / 0.6; const r = (n.m.userData as { r: number }).r; n.m.scale.setScalar(r * (0.3 + 0.7 * Math.min(1, n.t))); (n.m.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - n.t); if (n.t >= 1) { n.m.removeFromParent(); (n.m.material as THREE.Material).dispose(); n.m.geometry.dispose(); noiseRings.splice(i, 1); } }
    for (const ev of drainEquipmentEvents()) {
      if (ev.type === "broken") hud.toast(ev.message ?? "Armor broken!");
      else if (ev.type === "interrupted") hud.toast("Interrupted!");
      else if (ev.type === "equipped" && ev.inst) hud.toast(`Wearing the ${itemDef(ev.inst).name}`);
      if (ev.type !== "hit") { hud.health(); hud.pack(); }
    }
    { // headphones: footsteps you can hear show as small rings where the enemy is (Duckov SoundVisable)
      let f = ""; for (const e of heardEnemies()) { const s = toScreen(new THREE.Vector3(e.x, 0.2, e.z)); if (s.on) f += `<i style="left:${Math.round(s.x)}px;top:${Math.round(s.y)}px"></i>`; }
      if (f !== lastHeard) { E.heard.innerHTML = f; lastHeard = f; }
    }
    { // enemy health over anyone fighting you or hit in the last 4 s
      let b = "";
      for (const e of G.enemies) {
        const recent = e.hitAt !== undefined && G.raidT - e.hitAt < 4, engaged = !["patrol", "sleep", "return"].includes(e.state) && flat(e.p, G.pp) < 24;
        if (e.down || !e.active || !(recent || engaged)) continue;
        const s = toScreen(e.p.clone().setY(e.rig.bounds.height + 0.35)); if (!s.on) continue;
        b += `<i style="left:${Math.round(s.x)}px;top:${Math.round(s.y)}px"><b style="width:${Math.max(0, Math.round((e.hp / e.max) * 100))}%"></b></i>`;
      }
      if (b !== lastEhp) { E.ehp.innerHTML = b; lastEhp = b; }
    }
    let h = "";
    for (const e of G.enemies) {
      if (e.down || !e.active || ["patrol", "sleep", "return"].includes(e.state) || flat(e.p, G.pp) > 24) continue;
      const s = toScreen(e.p.clone().setY(1)); if (s.on) continue;
      const cx = innerWidth / 2, cy = innerHeight / 2, ang = Math.atan2(s.y - cy, s.x - cx), rx = innerWidth / 2 - 40, ry = innerHeight / 2 - 40;
      const k = Math.min(rx / Math.abs(Math.cos(ang) || 1e-3), ry / Math.abs(Math.sin(ang) || 1e-3));
      h += `<div class="arrow ${e.state === "windup" || e.state === "aim" ? "hot" : ""}" style="left:${Math.round(cx + Math.cos(ang) * k)}px;top:${Math.round(cy + Math.sin(ang) * k)}px;transform:translate(-50%,-50%) rotate(${ang.toFixed(2)}rad)"></div>`;
    }
    if (h !== lastArrows) { E.arrows.innerHTML = h; lastArrows = h; }
    // clock: the island's time of day (raid time runs it forward from 10:00) + area + raid time
    const m = Math.floor(G.raidT / 60), s = Math.floor(G.raidT % 60), day = 10 * 60 + Math.floor(G.raidT * 2), hh = Math.floor(day / 60) % 24, mm = day % 60;
    const area = CLEARINGS.find((c) => c.id === G.area)?.name ?? "Exile Beach", key = `${hh}:${mm}|${area}|${m}:${s}`;
    if (key !== lastClock) { lastClock = key; (E.clock.children[0] as HTMLElement).textContent = `${hh}:${String(mm).padStart(2, "0")}`; (E.clock.children[1] as HTMLElement).textContent = area; (E.clock.children[2] as HTMLElement).textContent = `Raid time ${m}:${String(s).padStart(2, "0")}`; }
  },
};
