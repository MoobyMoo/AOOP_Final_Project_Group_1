// Raid HUD v2 (styles in hud.css). Restraint at the edges: clock top-left, vitals bottom-left, hotbar bottom-centre,
// minimap top-right, Tab = the full pack. DOM is only touched when a value changes.
import * as THREE from "three";
import { G, flat, type Crate, type Enemy } from "../core/state";
import { itemDef } from "../loot/raidloot";
import { CLEARINGS } from "../world/layout";
import { ARMOR, PLAYER } from "../combat/weapons";
import { iconHtml } from "./itemicon";

const root = () => document.getElementById("ui")!;
const el = (cls: string, html = "", parent: HTMLElement = root()) => { const d = document.createElement("div"); d.className = cls; d.innerHTML = html; parent.appendChild(d); return d; };
let E: Record<string, HTMLElement> = {};
const proj = new THREE.Vector3();
function toScreen(p: THREE.Vector3) { proj.copy(p).project(G.stage.camera); return { x: (proj.x * 0.5 + 0.5) * innerWidth, y: (-proj.y * 0.5 + 0.5) * innerHeight, on: Math.abs(proj.x) < 1 && Math.abs(proj.y) < 1 && proj.z < 1 }; }
let toastT = 0, bannerT = 0, promptT = 0, helpT = 0, lastArrows = "", lastClock = "", lastHp = -1, lastPrompt = "", lastVitals = "", invOpen = false;
const noiseRings: { m: THREE.Mesh; t: number }[] = [];
const keyed = (t: string) => { const m = /^([A-Z0-9/]+) · (.*)$/.exec(t); return m ? `<kbd>${m[1]}</kbd> ${m[2]}` : t; };
const HEALS = ["firstaid", "smoothie", "bandage"];
const rbg = (id: string) => `var(--r-${itemDef(id).rarity})`;
const packWeight = () => G.pack.reduce((a, id) => a + (itemDef(id).weight ?? 1), 0) + G.ammo * 0.02;

export const hud = {
  build() {
    root().innerHTML = ""; E = {}; lastArrows = lastClock = lastPrompt = lastVitals = ""; lastHp = -1; invOpen = false;
    E.clock = el("hud-clock", "<b></b><span></span><em></em>");
    E.vitals = el("hud-vitals", `<div class="hud-hp"><span class="heart">♥</span><div class="bar"><i class="lag"></i><i class="fill"></i></div><b></b></div><div class="gauge" data-i="⚡"></div><div class="hud-warn" style="display:none"></div>`);
    E.bar = el("hud-bar"); E.stam = el("hud-stam", "<i></i>"); E.use = el("hud-use");
    E.prompt = el("hud-prompt"); E.toast = el("hud-toast"); E.banner = el("hud-banner");
    E.search = el("hud-search", `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" class="bg"/><circle cx="20" cy="20" r="16" class="fg"/></svg>`);
    E.cross = el("hud-cross", `<i></i><i></i><i></i><i></i><b></b>`); E.extract = el("hud-extract"); E.hurt = el("hud-hurt"); E.arrows = el("hud-arrows"); E.time = el("hud-time");
    E.help = el("hud-help", `<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move &nbsp;<kbd>Shift</kbd> sprint &nbsp;<kbd>Space</kbd> dodge<br>Click to shoot, right click to aim &nbsp;<kbd>V</kbd> briefcase &nbsp;<kbd>R</kbd> reload<br><kbd>E</kbd> search &nbsp;<kbd>Q</kbd> heal &nbsp;<kbd>Tab</kbd> pack &nbsp;<kbd>M</kbd> map`);
    helpT = G.save.raids === 0 ? 30 : 8;
    hud.health(); hud.ammo(); hud.pack();
  },
  health() {
    if (!E.vitals) return; const k = Math.max(0, G.hp / G.maxHp), hp = E.vitals.querySelector(".hud-hp") as HTMLElement;
    (hp.querySelector(".fill") as HTMLElement).style.width = k * 100 + "%"; (hp.querySelector(".lag") as HTMLElement).style.width = k * 100 + "%";
    const arm = ARMOR[G.gear?.head ?? ""] ?? 0;
    (hp.querySelector("b") as HTMLElement).innerHTML = `${Math.ceil(G.hp)}<small> / ${G.maxHp}${arm ? `, armor ${arm}` : ""}</small>`;
    if (lastHp >= 0 && G.hp < lastHp) { hp.classList.remove("shake"); void hp.offsetWidth; hp.classList.add("shake"); }
    lastHp = G.hp;
  },
  use(u: { id: string; t: number; time: number } | null) { if (!E.use) return; if (!u) { E.use.style.display = "none"; return; } E.use.style.display = "block"; E.use.innerHTML = `${itemDef(u.id).name}<div class="bar"><i style="width:${(u.t / u.time) * 100}%"></i></div>`; },
  money() {},
  /** the hotbar: Kingpin [1], briefcase [V], heals [Q], plus the pack summary */
  ammo() { hud.bar(); },
  pack() { hud.bar(); if (invOpen) hud.inventory(true); },
  bar() {
    if (!E.bar) return;
    const heal = HEALS.find((h) => G.pack.includes(h)), healN = G.pack.filter((h) => HEALS.includes(h)).length;
    const w = packWeight(), full = G.pack.length >= G.packSlots, value = G.pack.reduce((a, id) => a + itemDef(id).value, 0);
    E.bar.innerHTML = `
      <div class="hb-slot on ${G.reloadT >= 0 ? "reload" : ""}"><span class="tag ${G.mag === 0 ? "empty" : ""}">${G.mag} / ${G.ammo}</span><span class="gun">Kingpin<small>.45</small></span><span class="key"><kbd>1</kbd></span></div>
      <div class="hb-slot"><span class="emo" style="font-size:28px">💼</span><span class="key"><kbd>V</kbd></span></div>
      <div class="hb-slot">${heal ? iconHtml(heal, 44) : ""}${healN ? `<span class="n">${healN}</span>` : ""}<span class="key"><kbd>Q</kbd></span></div>
      <div class="hb-pack"><span class="chip ${full ? "full" : ""}">Pack ${G.pack.length} of ${G.packSlots}, <b>🍌 ${value}</b></span><span class="chip"><kbd>Tab</kbd> ${w.toFixed(1)} of ${PLAYER.maxWeight} kg</span></div>`;
  },
  /** Tab: the full pack, cheek pouch first (safe if you get bonked), weight state */
  inventory(open = !invOpen) {
    invOpen = open; let p = document.querySelector(".inv") as HTMLElement | null;
    if (!open) { p?.remove(); return; }
    if (!p) { p = document.createElement("div"); p.className = "panel inv"; root().appendChild(p); p.style.pointerEvents = "none"; }
    const w = packWeight(), r = w / PLAYER.maxWeight, state = r > 1 ? "Overweight: you crawl" : r > 0.75 ? "Heavy: slower and louder" : r <= 0.25 ? "Light: a little faster" : "Normal load";
    let cells = "";
    for (let i = 0; i < G.packSlots; i++) { const id = G.pack[i]; cells += id ? `<div class="cell ${i < G.pouchSlots ? "pouch" : ""}" style="--rbg:${rbg(id)}" title="${itemDef(id).name}">${iconHtml(id, 44)}<span class="v">${itemDef(id).value}</span></div>` : `<div class="cell empty ${i < G.pouchSlots ? "pouch" : ""}"></div>`; }
    const value = G.pack.reduce((a, id) => a + itemDef(id).value, 0);
    p.innerHTML = `<header><h2>Your pack</h2><small><kbd>Tab</kbd> close</small></header><div class="grid">${cells}</div>
      <p class="dim" style="margin-top:10px">The best ${G.pouchSlots} items sit in your cheek pouch. They stay safe if you get bonked; the rest drops in your satchel.</p>
      <div class="stats" style="margin-top:12px"><div class="stat"><b>🍌 ${value}</b><span>pack value</span></div><div class="stat"><b>${w.toFixed(1)} kg</b><span>${state}</span></div><div class="stat"><b>${G.ammo + G.mag}</b><span>rounds</span></div></div>`;
  },
  prompt(t: string) { if (!E.prompt) return; if (t !== lastPrompt) { E.prompt.innerHTML = keyed(t); lastPrompt = t; } E.prompt.classList.add("on"); promptT = 0.15; },
  toast(t: string) { if (!E.toast) return; E.toast.textContent = t; E.toast.classList.remove("on"); void E.toast.offsetWidth; E.toast.classList.add("on"); toastT = 4.5; },
  banner(t: string, sub = "") { if (!E.banner) return; E.banner.innerHTML = `<i class="rope l"></i><i class="rope r"></i><div class="board"><b>${t}</b>${sub ? `<small>${sub}</small>` : ""}</div>`; E.banner.classList.remove("on"); void E.banner.offsetWidth; E.banner.classList.add("on"); bannerT = 2.8; },
  search(c: Crate | null, k: number) { if (!E.search) return; if (!c) { E.search.style.display = "none"; return; } const s = toScreen(new THREE.Vector3(c.x, 1.6, c.z)); E.search.style.display = "block"; E.search.style.left = s.x + "px"; E.search.style.top = s.y + "px"; (E.search.querySelector(".fg") as SVGCircleElement).style.strokeDashoffset = String(100.5 * (1 - Math.min(1, k))); },
  hitMarker(kill: boolean) { if (!E.cross) return; E.cross.classList.remove("hit", "kill"); void E.cross.offsetWidth; E.cross.classList.add(kill ? "kill" : "hit"); },
  hurt(_src: string) { if (!E.hurt) return; E.hurt.classList.remove("on"); void E.hurt.offsetWidth; E.hurt.classList.add("on"); },
  enemyDown(_e: Enemy) {},
  bonkOut() { hud.banner("Bonked!", "The crew is carrying you home"); },
  noiseRing(at: THREE.Vector3, r: number) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 64), new THREE.MeshBasicMaterial({ color: "#fff6d6", transparent: true, opacity: 0.5, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(at.x, at.y + 0.08, at.z); m.scale.setScalar(r * 0.3); m.renderOrder = 4; G.stage.scene.add(m); noiseRings.push({ m, t: 0 });
    (m.userData as { r: number }).r = r;
  },
  extract(label: string, k: number, secs: number | null = null) {
    if (!E.extract) return; if (k <= 0) { E.extract.style.display = "none"; return; }
    E.extract.style.display = "block"; E.extract.innerHTML = `${label}<b>${secs === null ? "Stand still" : secs.toFixed(1)}</b><div class="bar"><i style="width:${Math.min(100, k * 100)}%"></i></div>`;
  },
  update(dt: number) {
    if (!E.cross) return;
    if (G.intent.swap3 === undefined) { /* noop */ }
    { // stamina beside the character (hidden when full) + the stamina gauge and weight warning in the vitals
      const k = G.stamina / 100, s = toScreen(G.pp.clone().setY(G.pp.y + 0.2)); E.stam.style.left = s.x + 34 + "px"; E.stam.style.top = s.y - 28 + "px";
      E.stam.style.opacity = k >= 0.999 ? "0" : "1"; (E.stam.firstChild as HTMLElement).style.height = k * 100 + "%"; E.stam.classList.toggle("low", G.stamina < 20);
      const r = packWeight() / PLAYER.maxWeight, warn = r > 1 ? "over" : r > 0.75 ? "heavy" : "", v = `${Math.round(k * 50)}|${warn}`;
      if (v !== lastVitals) {
        lastVitals = v; const g = E.vitals.querySelector(".gauge") as HTMLElement; g.style.setProperty("--k", k.toFixed(2)); g.classList.toggle("low", G.stamina < 20);
        const wEl = E.vitals.querySelector(".hud-warn") as HTMLElement; wEl.style.display = warn ? "block" : "none"; wEl.className = "hud-warn " + warn; wEl.textContent = warn === "over" ? "Overweight" : "Heavy";
      }
    }
    const reloadSlot = E.bar.querySelector(".hb-slot") as HTMLElement | null;
    if (reloadSlot) { reloadSlot.classList.toggle("reload", G.reloadT >= 0); if (G.reloadT >= 0) reloadSlot.style.setProperty("--rl", G.reloadT.toFixed(2)); }
    toastT -= dt; bannerT -= dt; promptT -= dt;
    if (helpT > 0) { helpT -= dt; if (helpT <= 0) E.help.classList.add("gone"); }
    if (toastT <= 0) E.toast.classList.remove("on"); if (bannerT <= 0) E.banner.classList.remove("on"); if (promptT <= 0) E.prompt.classList.remove("on");
    const a = toScreen(G.aimPoint); E.cross.style.left = a.x + "px"; E.cross.style.top = a.y + "px";
    E.cross.style.setProperty("--spread", (6 + Math.max(0, 1 - G.fireT) * 8 - (G.ads ? 2 : 0)) + "px"); E.cross.classList.toggle("lock", !G.intent.aimNdc);
    for (let i = noiseRings.length - 1; i >= 0; i--) { const n = noiseRings[i]; n.t += dt / 0.6; const r = (n.m.userData as { r: number }).r; n.m.scale.setScalar(r * (0.3 + 0.7 * Math.min(1, n.t))); (n.m.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - n.t); if (n.t >= 1) { n.m.removeFromParent(); (n.m.material as THREE.Material).dispose(); n.m.geometry.dispose(); noiseRings.splice(i, 1); } }
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
    const area = CLEARINGS.find((c) => c.id === G.area)?.name ?? "Banana Grove", key = `${hh}:${mm}|${area}|${m}:${s}`;
    if (key !== lastClock) { lastClock = key; (E.clock.children[0] as HTMLElement).textContent = `${hh}:${String(mm).padStart(2, "0")}`; (E.clock.children[1] as HTMLElement).textContent = area; (E.clock.children[2] as HTMLElement).textContent = `Raid time ${m}:${String(s).padStart(2, "0")}`; }
  },
};
