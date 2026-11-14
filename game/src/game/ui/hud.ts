// Raid HUD (styles in hud.css): quiet dark pills, chunky Lilita numerals, a signboard banner for new areas.
// DOM overlay; world-anchored bits are projected each frame. The DOM is only touched when a value changes.
import * as THREE from "three";
import { G, flat, type Crate, type Enemy } from "../core/state";
import { itemDef, RAR_COLOR } from "../loot/raidloot";
import { CLEARINGS } from "../world/layout";
import { ARMOR, PLAYER } from "../combat/weapons";

const root = () => document.getElementById("ui")!;
const el = (cls: string, html = "", parent: HTMLElement = root()) => { const d = document.createElement("div"); d.className = cls; d.innerHTML = html; parent.appendChild(d); return d; };
let E: Record<string, HTMLElement> = {};
const proj = new THREE.Vector3();
function toScreen(p: THREE.Vector3) { proj.copy(p).project(G.stage.camera); return { x: (proj.x * 0.5 + 0.5) * innerWidth, y: (-proj.y * 0.5 + 0.5) * innerHeight, on: Math.abs(proj.x) < 1 && Math.abs(proj.y) < 1 && proj.z < 1 }; }
let toastT = 0, bannerT = 0, promptT = 0, helpT = 0, lastArrows = "", lastClock = "", lastHp = -1, lastPrompt = "";
const noiseRings: { m: THREE.Mesh; t: number }[] = [];
/** "E · Search crate" → a keycap + plain text */
const keyed = (t: string) => { const m = /^([A-Z0-9/]+) · (.*)$/.exec(t); return m ? `<kbd>${m[1]}</kbd> ${m[2]}` : t; };

export const hud = {
  build() {
    root().innerHTML = ""; E = {}; lastArrows = lastClock = lastPrompt = ""; lastHp = -1;
    E.health = el("hud-health", `<span class="ico">♥</span><div class="body"><div class="bar"><i class="lag"></i><i class="fill"></i><i class="seg"></i></div><b></b><span class="arm"></span></div>`);
    E.stam = el("hud-stam", "<i></i>"); E.use = el("hud-use"); E.money = el("hud-money"); E.ammo = el("hud-ammo"); E.pack = el("hud-pack");
    E.prompt = el("hud-prompt"); E.toast = el("hud-toast"); E.banner = el("hud-banner");
    E.search = el("hud-search", `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" class="bg"/><circle cx="20" cy="20" r="16" class="fg"/></svg>`);
    E.cross = el("hud-cross", `<i></i><i></i><i></i><i></i><b></b>`); E.extract = el("hud-extract"); E.hurt = el("hud-hurt"); E.arrows = el("hud-arrows"); E.raidT = el("hud-raidt", "<b></b><span></span>");
    E.help = el("hud-help", `<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move <kbd>Shift</kbd> sprint <kbd>Space</kbd> dodge<br>click to shoot, right click to aim <kbd>V</kbd> briefcase <kbd>R</kbd> reload<br><kbd>E</kbd> search <kbd>Q</kbd> heal <kbd>M</kbd> map`);
    helpT = G.save.raids === 0 ? 30 : 10;
    hud.health(); hud.money(); hud.ammo(); hud.pack();
  },
  health() {
    if (!E.health) return; const k = Math.max(0, G.hp / G.maxHp), fill = E.health.querySelector(".fill") as HTMLElement;
    fill.style.width = k * 100 + "%"; fill.classList.toggle("low", k < 0.3); (E.health.querySelector(".lag") as HTMLElement).style.width = k * 100 + "%";
    (E.health.querySelector("b") as HTMLElement).textContent = String(Math.ceil(G.hp));
    const arm = ARMOR[G.gear?.head ?? ""] ?? 0; (E.health.querySelector(".arm") as HTMLElement).textContent = arm ? `armor ${arm}` : "";
    if (lastHp >= 0 && G.hp < lastHp) { E.health.classList.remove("shake"); void E.health.offsetWidth; E.health.classList.add("shake"); }
    lastHp = G.hp;
  },
  use(u: { id: string; t: number; time: number } | null) { if (!E.use) return; if (!u) { E.use.style.display = "none"; return; } E.use.style.display = "block"; E.use.innerHTML = `${itemDef(u.id).icon} ${itemDef(u.id).name}<div class="bar"><i style="width:${(u.t / u.time) * 100}%"></i></div>`; },
  money() { if (E.money) E.money.textContent = `🍌 ${G.save.money.toLocaleString()}`; },
  ammo() {
    if (!E.ammo) return;
    const pips = Array.from({ length: G.magSize }, (_, i) => `<i class="${i < G.mag ? "" : "spent"}"></i>`).join("");
    E.ammo.innerHTML = `<span class="gun">Kingpin .45</span><b class="${G.mag === 0 ? "empty" : "tick"}">${G.mag}</b><span class="res">/ ${G.ammo}</span><div class="pips">${pips}</div>`;
  },
  pack() {
    if (!E.pack) return; let h = "";
    for (let i = 0; i < G.packSlots; i++) {
      const id = G.pack[i], d = id ? itemDef(id) : null;
      h += `<div class="slot ${i < G.pouchSlots ? "pouch" : ""} ${d ? "has" : ""}" ${d ? `style="--rc:${RAR_COLOR[d.rarity]}" title="${d.name}"` : ""}>${d ? d.icon : ""}</div>`;
    }
    const v = G.pack.reduce((a, id) => a + itemDef(id).value, 0);
    const w = G.pack.reduce((a, id) => a + (itemDef(id).weight ?? 1), 0) + G.ammo * 0.02, wr = w / PLAYER.maxWeight;
    const ws = wr > 1 ? "over" : wr > 0.75 ? "heavy" : "";
    E.pack.innerHTML = `<div class="slots">${h}</div><div class="info"><span class="chip">🍌 ${v}</span><span class="chip ${ws}">${w.toFixed(1)} / ${PLAYER.maxWeight} kg${ws === "over" ? ", overweight" : ws === "heavy" ? ", heavy" : wr <= 0.25 ? ", light" : ""}</span>${G.pack.length >= G.packSlots ? `<span class="chip full">pack full</span>` : ""}</div>`;
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
  /** label = where you're going; secs = time left (or null while you're moving) */
  extract(label: string, k: number, secs: number | null = null) {
    if (!E.extract) return; if (k <= 0) { E.extract.style.display = "none"; return; }
    E.extract.style.display = "block"; E.extract.innerHTML = `${label}<b>${secs === null ? "Stand still" : secs.toFixed(1)}</b><div class="bar"><i style="width:${Math.min(100, k * 100)}%"></i></div>`;
  },
  update(dt: number) {
    if (!E.cross) return;
    { // stamina: a small bar beside the character, hidden when full (Duckov-style)
      const k = G.stamina / 100, s = toScreen(G.pp.clone().setY(G.pp.y + 0.2)); E.stam.style.left = s.x + 38 + "px"; E.stam.style.top = s.y - 30 + "px";
      E.stam.style.opacity = k >= 0.999 ? "0" : "1"; (E.stam.firstChild as HTMLElement).style.height = k * 100 + "%"; E.stam.classList.toggle("low", G.stamina < 20);
    }
    toastT -= dt; bannerT -= dt; promptT -= dt;
    if (helpT > 0) { helpT -= dt; if (helpT <= 0) E.help.classList.add("gone"); }
    if (toastT <= 0) E.toast.classList.remove("on"); if (bannerT <= 0) E.banner.classList.remove("on"); if (promptT <= 0) E.prompt.classList.remove("on");
    const a = toScreen(G.aimPoint); E.cross.style.left = a.x + "px"; E.cross.style.top = a.y + "px";
    E.cross.style.setProperty("--spread", (6 + Math.max(0, 1 - G.fireT) * 8) + "px"); E.cross.classList.toggle("lock", !G.intent.aimNdc);
    E.cross.classList.toggle("reload", G.reloadT >= 0); if (G.reloadT >= 0) E.cross.style.setProperty("--rl", String(G.reloadT));
    for (let i = noiseRings.length - 1; i >= 0; i--) { const n = noiseRings[i]; n.t += dt / 0.6; const r = (n.m.userData as { r: number }).r; n.m.scale.setScalar(r * (0.3 + 0.7 * Math.min(1, n.t))); (n.m.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - n.t); if (n.t >= 1) { n.m.removeFromParent(); (n.m.material as THREE.Material).dispose(); n.m.geometry.dispose(); noiseRings.splice(i, 1); } }
    // off-screen threat arrows (no off-screen surprises); rebuilt only when they change
    let h = "";
    for (const e of G.enemies) {
      if (e.down || !e.active || ["patrol", "sleep", "return"].includes(e.state) || flat(e.p, G.pp) > 24) continue;
      const s = toScreen(e.p.clone().setY(1)); if (s.on) continue;
      const cx = innerWidth / 2, cy = innerHeight / 2, ang = Math.atan2(s.y - cy, s.x - cx), rx = innerWidth / 2 - 40, ry = innerHeight / 2 - 40;
      const k = Math.min(rx / Math.abs(Math.cos(ang) || 1e-3), ry / Math.abs(Math.sin(ang) || 1e-3));
      h += `<div class="arrow ${e.state === "windup" || e.state === "aim" ? "hot" : ""}" style="left:${Math.round(cx + Math.cos(ang) * k)}px;top:${Math.round(cy + Math.sin(ang) * k)}px;transform:translate(-50%,-50%) rotate(${ang.toFixed(2)}rad)"></div>`;
    }
    if (h !== lastArrows) { E.arrows.innerHTML = h; lastArrows = h; }
    const m = Math.floor(G.raidT / 60), s = Math.floor(G.raidT % 60), area = CLEARINGS.find((c) => c.id === G.area)?.name ?? "Banana Grove", clock = `${m}:${String(s).padStart(2, "0")}|${area}`;
    if (clock !== lastClock) { lastClock = clock; (E.raidT.firstChild as HTMLElement).textContent = `${m}:${String(s).padStart(2, "0")}`; (E.raidT.lastChild as HTMLElement).textContent = area; }
  },
};
