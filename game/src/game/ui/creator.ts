// Character creator (Moo 2026-11-15, Duckov's creator mechanism: research/duckov-re/CUSTOMIZE_FINDINGS.md):
// swappable parts + a few placement sliders + colour swatches, presets (the Businessman first), Randomize, a
// copy/paste share code (a bad paste changes nothing), gear from your wardrobe. First launch and the bunker mirror.
import * as THREE from "three";
import { G } from "../core/state";
import type { MonkeyLook, Gear, WearSlot } from "../contracts";
import { DEFAULT_LOOK, LOOK_PRESETS, randomLook, encodeLook, decodeLook } from "../actors/look";
import { WEARABLES } from "../actors/wearables";
import { save } from "../core/save_interim";
import { sfx } from "../core/audio";
import { U } from "../render/shading";
import { buildRoom } from "../home/bunker";

const FUR = ["#e07a32", "#c8682c", "#a0582a", "#7a4e2e", "#4a3a30", "#d9a441", "#e8d0a0", "#9a9aa0", "#f0f0ea", "#b8452a"];
const SKIN = ["#f6c896", "#f2d2b0", "#e6b483", "#d9a070", "#ffe0c8", "#c99a7a", "#f4c0b0"];
const SUIT = ["#3c5a8c", "#2a2a34", "#5a2a3a", "#2f5a3e", "#8a6a3e", "#e8e2d4", "#6a3a8a", "#c9302c", "#3a8a9a", "#f2cc3b"];
const ACCENT = ["#ff8a2a", "#c9302c", "#ffd84a", "#2f6ad1", "#2a9a5a", "#e84a9a", "#f3ead6", "#1e1b24"];
type Tab = "presets" | "head" | "face" | "outfit" | "gear" | "code";
let tab: Tab = "presets", el: HTMLDivElement | null = null, onDone: () => void = () => {}, spin = 0.35, drag: number | null = null;
let look: MonkeyLook, gear: Gear;
const P = new URLSearchParams(location.search);

export function openCreator(done: () => void, scene: THREE.Scene) {
  onDone = done; look = structuredClone(G.save.look); gear = { ...G.save.gear };
  buildRoom(); G.scene = "creator"; G.stage.setScene(scene, false); scene.fog = null;
  if (!G.rig.root.parent || G.rig.root.parent !== scene) scene.add(G.rig.root);
  G.rig.root.position.set(1.0, 0, 1.2);
  el = document.createElement("div"); el.className = "creator"; document.getElementById("ui")!.innerHTML = ""; document.getElementById("ui")!.appendChild(el);
  el.style.pointerEvents = "auto"; render();
  const c = G.stage.renderer.domElement;
  c.onpointerdown = (e) => { if (G.scene === "creator") drag = e.clientX; }; addEventListener("pointerup", () => (drag = null));
  c.onpointermove = (e) => { if (G.scene === "creator" && drag !== null) { spin += (e.clientX - drag) * 0.012; drag = e.clientX; } };
  if (P.has("bot")) setTimeout(finish, 300);
}
function apply() { G.rig.setLook?.(look); G.rig.setGear?.(gear); }
const sw = (cols: string[], cur: string, key: string) => `<div class="sw">${cols.map((c) => `<i data-k="${key}" data-v="${c}" style="background:${c}" class="${c === cur ? "on" : ""}"></i>`).join("")}<label><input type="color" data-k="${key}" value="${cur}"></label></div>`;
const chips = (opts: string[], cur: string, key: string) => `<div class="chips">${opts.map((o) => `<b data-k="${key}" data-v="${o}" class="${o === cur ? "on" : ""}">${o}</b>`).join("")}</div>`;
const slider = (label: string, key: string, v: number, min: number, max: number) => `<div class="sl"><span>${label}</span><input type="range" data-k="${key}" min="${min}" max="${max}" step="0.01" value="${v}"><em>${v.toFixed(2)}</em></div>`;
function render() {
  if (!el) return; const L = look;
  const tabs: [Tab, string][] = [["presets", "Presets"], ["head", "Head"], ["face", "Face"], ["outfit", "Outfit"], ["gear", "Gear"], ["code", "Share"]];
  let body = "";
  if (tab === "presets") body = `<div class="presets">${LOOK_PRESETS.map((p, i) => `<button data-preset="${i}">${p.name}</button>`).join("")}</div><button class="rand" data-rand="1">🎲 Randomize</button>`;
  if (tab === "head") body = `<h4>Fur</h4>${sw(FUR, L.fur, "fur")}${slider("Head size", "headSize", L.headSize, -0.25, 0.25)}<h4>Ears</h4>${chips(["round", "pointy", "floppy"], L.ears.style, "ears.style")}${slider("Ear size", "ears.size", L.ears.size, 0.75, 1.35)}<h4>Tail curl</h4>${slider("Curl", "tail.curl", L.tail.curl, 0, 1)}`;
  if (tab === "face") body = `<h4>Face</h4>${sw(SKIN, L.face, "face")}<h4>Eyes</h4>${chips(["round", "sleepy", "sparkle", "beady"], L.eyes.style, "eyes.style")}${slider("Eye spacing", "eyes.spacing", L.eyes.spacing, 0.85, 1.15)}<h4>Brows</h4>${chips(["bold", "thin", "bushy", "none"], L.brows.style, "brows.style")}${slider("Brow mood", "brows.tilt", L.brows.tilt, -1, 1)}<h4>Mouth</h4>${chips(["smile", "grin", "smirk", "toothy", "whistle"], L.mouth, "mouth")}<p class="dim">Tip: take the shades off in Gear to see the eyes.</p>`;
  if (tab === "outfit") body = `<h4>Suit</h4>${sw(SUIT, L.suit, "suit")}<h4>Trousers</h4>${sw(SUIT, L.pants, "pants")}<h4>Tie</h4>${chips(["tie", "bowtie", "none"], L.tie.style, "tie.style")}${sw(ACCENT, L.tie.color, "tie.color")}<h4>Feet</h4>${chips(["round", "shoes"], L.feet.style, "feet.style")}${sw([...FUR.slice(0, 5), "#2a2a30", "#6e4b2e"], L.feet.color, "feet.color")}`;
  if (tab === "gear") body = (["head", "face", "back"] as WearSlot[]).map((slot) => `<h4>${{ head: "Hat", face: "Face", back: "Back" }[slot]}</h4><div class="chips">${slot !== "back" ? `<b data-gear="${slot}:" class="${!gear[slot] ? "on" : ""}">none</b>` : ""}${WEARABLES.filter((w) => w.slot === slot).map((w) => { const owned = G.save.wardrobe.includes(w.id); return `<b data-gear="${slot}:${w.id}" class="${gear[slot] === w.id ? "on" : ""} ${owned ? "" : "locked"}" title="${owned ? w.name : "find it in a raid"}">${owned ? w.name : "🔒 " + w.name}</b>`; }).join("")}</div>`).join("") + `<p class="dim">More hats and glasses turn up in crates. Helmets also protect you.</p>`;
  if (tab === "code") body = `<p>Share your look: copy this code, or paste a friend's.</p><textarea readonly>${encodeLook(L)}</textarea><button data-copy="1">Copy code</button><input class="paste" placeholder="paste a code here"><button data-paste="1">Use pasted code</button><p class="msg"></p>`;
  el.innerHTML = `<div class="c-head"><h2>Make your Businessman</h2><small>drag to turn him around</small></div><div class="c-tabs">${tabs.map(([t, n]) => `<b data-tab="${t}" class="${t === tab ? "on" : ""}">${n}</b>`).join("")}</div><div class="c-body">${body}</div><div class="c-foot"><button class="reset" data-reset="1">Reset</button><button class="go" data-go="1">${G.save.lookDone ? "Done" : "Let's get to business ▸"}</button></div>`;
  el.querySelectorAll<HTMLElement>("[data-tab]").forEach((b) => b.onclick = () => { tab = b.dataset.tab as Tab; sfx("ui"); render(); });
  el.querySelectorAll<HTMLElement>("[data-preset]").forEach((b) => b.onclick = () => { look = structuredClone(LOOK_PRESETS[+b.dataset.preset!].look); apply(); sfx("pop"); render(); });
  el.querySelectorAll<HTMLElement>("[data-rand]").forEach((b) => b.onclick = () => { look = randomLook(Math.random); apply(); sfx("pop"); render(); });
  el.querySelectorAll<HTMLElement>("i[data-k], b[data-k]").forEach((b) => b.onclick = () => { set(b.dataset.k!, b.dataset.v!); sfx("ui"); render(); });
  el.querySelectorAll<HTMLInputElement>("input[type=color]").forEach((b) => b.oninput = () => { set(b.dataset.k!, b.value); });
  el.querySelectorAll<HTMLInputElement>("input[type=range]").forEach((b) => b.oninput = () => { set(b.dataset.k!, Number(b.value)); (b.nextElementSibling as HTMLElement).textContent = Number(b.value).toFixed(2); });
  el.querySelectorAll<HTMLElement>("[data-gear]").forEach((b) => b.onclick = () => { const [slot, id] = b.dataset.gear!.split(":") as [WearSlot, string]; if (id && !G.save.wardrobe.includes(id)) { sfx("nope"); return; } gear = { ...gear, [slot]: id || null }; apply(); sfx("ui"); render(); });
  el.querySelector<HTMLElement>("[data-copy]")?.addEventListener("click", () => { navigator.clipboard?.writeText(encodeLook(look)).catch(() => {}); (el!.querySelector(".msg") as HTMLElement).textContent = "Copied!"; });
  el.querySelector<HTMLElement>("[data-paste]")?.addEventListener("click", () => { const v = (el!.querySelector(".paste") as HTMLInputElement).value, l = decodeLook(v); const m = el!.querySelector(".msg") as HTMLElement; if (!l) { m.textContent = "That code didn't work. Nothing changed."; sfx("nope"); return; } look = l; apply(); sfx("pop"); render(); });
  el.querySelector<HTMLElement>("[data-reset]")!.onclick = () => { look = structuredClone(DEFAULT_LOOK); apply(); render(); };
  el.querySelector<HTMLElement>("[data-go]")!.onclick = finish;
}
function set(path: string, v: string | number) {
  const parts = path.split("."); let o = look as unknown as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]] as Record<string, unknown>;
  o[parts[parts.length - 1]] = v; apply();
}
function finish() { G.save.look = look; G.save.gear = gear; G.save.lookDone = true; save(G.save); sfx("extract"); el?.remove(); el = null; const c = G.stage.renderer.domElement; c.onpointerdown = c.onpointermove = null; onDone(); }
export function renderCreator(dt: number) {
  G.time += dt; U.uTime.value = G.time; if (drag === null) spin += dt * 0.15;
  const r = G.rig; r.root.rotation.y = G.stage.cam.yaw + spin;
  r.pose({ time: G.time, speed: 0, moveYaw: G.stage.cam.yaw + spin, faceYaw: G.stage.cam.yaw + spin, action: "idle", actionT: 0, armed: "none", flash: 0 });
  // close-up: the monkey on the right third of the screen, the panel on the left
  const cam = G.stage.cam, saved = { ...cam }; cam.dist = 8.5; cam.pitch = THREE.MathUtils.degToRad(14);
  const right = new THREE.Vector3(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw)).multiplyScalar(-1.25);
  G.stage.place(r.root.position.clone().add(new THREE.Vector3(0, 1.15, 0)).add(right), dt, G.time); Object.assign(cam, saved);
}
