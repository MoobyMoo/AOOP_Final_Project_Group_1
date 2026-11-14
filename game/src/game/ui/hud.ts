// Raid HUD in the look-target style. DOM overlay; world-anchored bits are projected each frame.
import * as THREE from "three";
import { G, flat, type Crate, type Enemy } from "../core/state";
import { itemDef, RAR_COLOR } from "../loot/raidloot";
import { CLEARINGS } from "../world/layout";

const root = () => document.getElementById("ui")!;
const el = (cls: string, html = "", parent: HTMLElement = root()) => { const d = document.createElement("div"); d.className = cls; d.innerHTML = html; parent.appendChild(d); return d; };
let E: Record<string, HTMLElement> = {};
const proj = new THREE.Vector3();
function toScreen(p: THREE.Vector3) { proj.copy(p).project(G.stage.camera); return { x: (proj.x * 0.5 + 0.5) * innerWidth, y: (-proj.y * 0.5 + 0.5) * innerHeight, on: Math.abs(proj.x) < 1 && Math.abs(proj.y) < 1 && proj.z < 1 }; }
let toastT = 0, bannerT = 0, promptT = 0, markerT = 0;
const noiseRings: { m: THREE.Mesh; t: number }[] = [];

export const hud = {
  build() {
    root().innerHTML = ""; E = {};
    E.hearts = el("hud-hearts"); E.money = el("hud-money"); E.ammo = el("hud-ammo"); E.pack = el("hud-pack");
    E.prompt = el("hud-prompt"); E.toast = el("hud-toast"); E.banner = el("hud-banner"); E.search = el("hud-search", `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" class="bg"/><circle cx="20" cy="20" r="16" class="fg"/></svg>`);
    E.cross = el("hud-cross", `<i></i><i></i><i></i><i></i><b></b>`); E.extract = el("hud-extract"); E.hurt = el("hud-hurt"); E.arrows = el("hud-arrows"); E.raidT = el("hud-raidt");
    E.help = el("hud-help", "WASD move · mouse aim · <b>click</b> shoot · <b>R</b> reload · <b>right click / Space</b> briefcase · <b>Shift</b> roll · <b>E</b> search / use · <b>Q</b> smoothie · <b>M</b> map · <b>T</b> keyboard aim");
    hud.hearts(); hud.money(); hud.ammo(); hud.pack();
  },
  hearts() { if (!E.hearts) return; E.hearts.innerHTML = Array.from({ length: G.maxHearts }, (_, i) => `<span class="${i < G.hearts ? "on" : "off"}">♥</span>`).join(""); },
  money() { if (E.money) E.money.innerHTML = `🍌 <b>${G.save.money.toLocaleString()}</b>`; },
  ammo() { if (E.ammo) E.ammo.innerHTML = `<span class="gun">KINGPIN .45</span><b class="${G.mag === 0 ? "empty" : ""}">${G.mag}</b><span>/ ${G.ammo}</span>`; },
  pack() {
    if (!E.pack) return; let h = "";
    for (let i = 0; i < G.packSlots; i++) {
      const id = G.pack[i], pouch = i < G.pouchSlots, d = id ? itemDef(id) : null;
      h += `<div class="slot ${pouch ? "pouch" : ""}" style="${d ? `border-color:${RAR_COLOR[d.rarity]}` : ""}">${d ? d.icon : ""}${pouch ? `<em>safe</em>` : ""}</div>`;
    }
    const v = G.pack.reduce((a, id) => a + itemDef(id).value, 0);
    E.pack.innerHTML = `<div class="slots">${h}</div><div class="val">pack worth 🍌 ${v}${G.pack.length >= G.packSlots ? " · <b>FULL</b>" : ""}</div>`;
  },
  prompt(t: string) { if (!E.prompt) return; E.prompt.textContent = t; E.prompt.classList.add("on"); promptT = 0.15; },
  toast(t: string) { if (!E.toast) return; E.toast.textContent = t; E.toast.classList.remove("on"); void E.toast.offsetWidth; E.toast.classList.add("on"); toastT = 4.5; },
  banner(t: string, sub = "") { if (!E.banner) return; E.banner.innerHTML = `<b>${t}</b>${sub ? `<small>${sub}</small>` : ""}`; E.banner.classList.remove("on"); void E.banner.offsetWidth; E.banner.classList.add("on"); bannerT = 2.6; },
  search(c: Crate | null, k: number) { if (!E.search) return; if (!c) { E.search.style.display = "none"; return; } const s = toScreen(new THREE.Vector3(c.x, 1.6, c.z)); E.search.style.display = "block"; E.search.style.left = s.x + "px"; E.search.style.top = s.y + "px"; (E.search.querySelector(".fg") as SVGCircleElement).style.strokeDashoffset = String(100.5 * (1 - Math.min(1, k))); },
  hitMarker(kill: boolean) { if (!E.cross) return; E.cross.classList.remove("hit", "kill"); void E.cross.offsetWidth; E.cross.classList.add(kill ? "kill" : "hit"); markerT = 0.18; },
  hurt(_src: string) { if (!E.hurt) return; E.hurt.classList.remove("on"); void E.hurt.offsetWidth; E.hurt.classList.add("on"); },
  enemyDown(_e: Enemy) {},
  bonkOut() { hud.banner("BONKED!", "The crew is carrying you home…"); },
  noiseRing(at: THREE.Vector3, r: number) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 64), new THREE.MeshBasicMaterial({ color: "#fff3c4", transparent: true, opacity: 0.5, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(at.x, at.y + 0.08, at.z); m.scale.setScalar(r * 0.3); m.renderOrder = 4; G.stage.scene.add(m); noiseRings.push({ m, t: 0 });
    (m.userData as { r: number }).r = r;
  },
  extract(label: string, k: number) { if (!E.extract) return; if (k <= 0) { E.extract.style.display = "none"; return; } E.extract.style.display = "block"; E.extract.innerHTML = `${label}<div class="bar"><i style="width:${Math.min(100, k * 100)}%"></i></div>`; },
  update(dt: number) {
    if (!E.cross) return;
    toastT -= dt; bannerT -= dt; promptT -= dt; markerT -= dt;
    if (toastT <= 0) E.toast.classList.remove("on"); if (bannerT <= 0) E.banner.classList.remove("on"); if (promptT <= 0) E.prompt.classList.remove("on");
    // crosshair follows the aim point; spreads a little right after a shot
    const a = toScreen(G.aimPoint); E.cross.style.left = a.x + "px"; E.cross.style.top = a.y + "px";
    E.cross.style.setProperty("--spread", (6 + Math.max(0, 1 - G.fireT) * 8) + "px"); E.cross.classList.toggle("lock", !G.intent.aimNdc);
    E.cross.classList.toggle("reload", G.reloadT >= 0); if (G.reloadT >= 0) E.cross.style.setProperty("--rl", String(G.reloadT));
    for (let i = noiseRings.length - 1; i >= 0; i--) { const n = noiseRings[i]; n.t += dt / 0.6; const r = (n.m.userData as { r: number }).r; n.m.scale.setScalar(r * (0.3 + 0.7 * Math.min(1, n.t))); (n.m.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - n.t); if (n.t >= 1) { n.m.removeFromParent(); noiseRings.splice(i, 1); } }
    // off-screen threat arrows (readability rule: no off-screen surprise)
    let h = "";
    for (const e of G.enemies) {
      if (e.down || !e.active || ["patrol", "sleep", "return"].includes(e.state) || flat(e.p, G.pp) > 24) continue;
      const s = toScreen(e.p.clone().setY(1)); if (s.on) continue;
      const cx = innerWidth / 2, cy = innerHeight / 2, ang = Math.atan2(s.y - cy, s.x - cx), rx = innerWidth / 2 - 40, ry = innerHeight / 2 - 40;
      const k = Math.min(rx / Math.abs(Math.cos(ang) || 1e-3), ry / Math.abs(Math.sin(ang) || 1e-3));
      h += `<div class="arrow ${e.state === "windup" || e.state === "aim" ? "hot" : ""}" style="left:${cx + Math.cos(ang) * k}px;top:${cy + Math.sin(ang) * k}px;transform:translate(-50%,-50%) rotate(${ang}rad)">➤</div>`;
    }
    E.arrows.innerHTML = h;
    const m = Math.floor(G.raidT / 60), s = Math.floor(G.raidT % 60); E.raidT.textContent = `${m}:${String(s).padStart(2, "0")} · ${CLEARINGS.find((c) => c.id === G.area)?.name ?? "Banana Grove"}`;
  },
};
