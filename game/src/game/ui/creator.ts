// Character creator (Moo 2026-11-15, Duckov's creator mechanism: research/duckov-re/CUSTOMIZE_FINDINGS.md):
// swappable parts + a few placement sliders + colour swatches, presets (the Businessman first), Randomize, a
// copy/paste share code (a bad paste changes nothing), gear from your wardrobe. First launch and the bunker mirror.
import * as THREE from "three";
import { G } from "../core/state";
import type { MonkeyLook, Gear, WearSlot } from "../contracts";
import { DEFAULT_LOOK, LOOK_PRESETS, randomLook, encodeLook, decodeLook, lookExt } from "../actors/look";
import { WEAR_ZONES } from "../actors/wearables";
import { BOUND_KIT, visualGear } from "../loot/equipment";
import { regionDefault } from "../actors/charmat";
import { save } from "../core/save";
import { sfx } from "../core/audio";
import { U } from "../render/shading";
import { buildRoom } from "../home/bunker";

const FUR = ["#e07a32", "#c8682c", "#a0582a", "#7a4e2e", "#4a3a30", "#d9a441", "#e8d0a0", "#9a9aa0", "#f0f0ea", "#b8452a"];
const SKIN = ["#f6c896", "#f2d2b0", "#e6b483", "#d9a070", "#ffe0c8", "#c99a7a", "#f4c0b0"];
const SUIT = ["#3c5a8c", "#2a2a34", "#5a2a3a", "#2f5a3e", "#8a6a3e", "#e8e2d4", "#6a3a8a", "#c9302c", "#3a8a9a", "#f2cc3b"];
const EYE = ["#1c1416", "#3a2a22", "#2f5a8c", "#2a7a4a", "#6a3a8a", "#8a2a2a"];
const SHIRT = ["#f6f2ea", "#dfe8f2", "#f3e0b0", "#f2c8c8", "#c8e0c8", "#3a3640", "#1e1b24"];
const METAL = ["#e8b84a", "#c9ccd6", "#b87333", "#1e1b24", "#f3ead6"];
const GEARC = ["#2a2a30", "#f46a10", "#c9302c", "#e8b84a", "#2f6ad1", "#2a9a5a", "#e84a9a", "#f3ead6", "#8a6a3e"];
const JACKET_NAMES: [string, string][] = [["two", "Two-button"], ["double", "Double-breasted"], ["vest", "Vest"], ["open", "Open"]];
const ACCENT = ["#ff8a2a", "#c9302c", "#ffd84a", "#2f6ad1", "#2a9a5a", "#e84a9a", "#f3ead6", "#1e1b24"];
type Tab = "presets" | "head" | "face" | "outfit" | "code";
let tab: Tab = "presets", el: HTMLDivElement | null = null, onDone: () => void = () => {}, spin = 0.35, drag: number | null = null;
// drag to turn (UI v4): the drag moves a target angle and the monkey eases onto it (no stepping on a coarse mouse),
// a flick keeps turning and slows to a stop, "Front view" eases him back to face you
const FRONT = 0.35;
let goal = FRONT, vel = 0, lastX = 0, lastT = 0, ctl: HTMLDivElement | null = null;
let look: MonkeyLook, gear: Gear;
const P = new URLSearchParams(location.search);

export function openCreator(done: () => void, scene: THREE.Scene) {
  onDone = done; look = structuredClone(G.save.look); gear = { ...G.save.gear };
  buildRoom(); G.scene = "creator"; G.stage.setScene(scene, false); scene.fog = null;
  if (!G.rig.root.parent || G.rig.root.parent !== scene) scene.add(G.rig.root);
  G.gun.root.visible = false; // no gun in the mirror
  G.rig.root.position.set(1.0, 0, 1.2);
  el = document.createElement("div"); el.className = "creator"; document.getElementById("ui")!.innerHTML = ""; document.getElementById("ui")!.appendChild(el);
  el.style.pointerEvents = "auto"; render();
  const c = G.stage.renderer.domElement;
  spin = goal = FRONT; vel = 0;
  c.onpointerdown = (e) => { if (G.scene !== "creator") return; drag = e.clientX; lastX = e.clientX; lastT = performance.now(); vel = 0; c.setPointerCapture(e.pointerId); c.classList.add("c-turning"); };
  c.onpointerup = c.onpointercancel = () => { drag = null; c.classList.remove("c-turning"); if (performance.now() - lastT > 90) vel = 0; };
  c.onpointermove = (e) => {
    if (G.scene !== "creator" || drag === null) return;
    const now = performance.now(), d = (e.clientX - lastX) * 0.011, dt = Math.max(1, now - lastT) / 1000;
    goal += d; vel = vel * 0.6 + (d / dt) * 0.4; lastX = e.clientX; lastT = now;
  };
  c.classList.add("c-canvas");
  ctl?.remove(); ctl = document.createElement("div"); ctl.className = "c-stage";
  ctl.innerHTML = `<span class="hint">Drag to turn him</span><button data-view="1" title="Turn him back to face you">${VIEW_ICON}Front view</button>`;
  document.getElementById("ui")!.appendChild(ctl); ctl.style.pointerEvents = "auto";
  ctl.querySelector<HTMLElement>("[data-view]")!.onclick = () => { vel = 0; goal = FRONT + Math.round((spin - FRONT) / (Math.PI * 2)) * Math.PI * 2; sfx("ui"); };
  if (P.has("bot")) setTimeout(finish, 300);
}
function apply() { G.rig.setLook?.(look); G.rig.setGear?.(gear) /* raw instances: the rig strips "#dur" and dulls broken pieces */; }
const sw = (cols: string[], cur: string, key: string) => `<div class="sw">${cols.map((c) => `<i data-k="${key}" data-v="${c}" style="background:${c}" class="${c === cur ? "on" : ""}"></i>`).join("")}<label><input type="color" data-k="${key}" value="${cur}"></label></div>`;
const chips = (opts: string[], cur: string, key: string) => `<div class="chips">${opts.map((o) => `<b data-k="${key}" data-v="${o}" class="${o === cur ? "on" : ""}">${o === "bowtie" ? "Bow tie" : o[0].toUpperCase() + o.slice(1)}</b>`).join("")}</div>`;
const chipsL = (opts: [string, string][], cur: string, key: string) => `<div class="chips">${opts.map(([v, n]) => `<b data-k="${key}" data-v="${v}" class="${v === cur ? "on" : ""}">${n}</b>`).join("")}</div>`;
const hexOf = (c: THREE.Color | string) => "#" + new THREE.Color(c).getHexString();
const slider = (label: string, key: string, v: number, min: number, max: number) => `<div class="sl"><span>${label}</span><input type="range" data-k="${key}" min="${min}" max="${max}" step="0.01" value="${v}"><em>${v.toFixed(2)}</em></div>`;
/** tints for YOUR bound pieces (bowler, shades, satchel); found gear keeps its own colours (G1-23) */
function gearColours(slot: WearSlot, X: ReturnType<typeof lookExt>) {
  const id = BOUND_KIT[slot], z = id ? WEAR_ZONES[id] : undefined; if (!z) return "";
  const cur = X.gear?.[slot as "head" | "face" | "back"];
  return `<div class="gc"><span>Main</span>${sw(GEARC, cur?.main ?? regionDefault(z.main), `x.gear.${slot}.main`)}${z.accent ? `<span>Trim</span>${sw(GEARC, cur?.accent ?? regionDefault(z.accent), `x.gear.${slot}.accent`)}` : ""}</div>`;
}
function render() {
  if (!el) return; const L = look, X = lookExt(L);
  const tabs: [Tab, string][] = [["presets", "Presets"], ["head", "Head"], ["face", "Face"], ["outfit", "Your suit"], ["code", "Share"]];
  let body = "";
  if (tab === "presets") body = `<div class="presets">${LOOK_PRESETS.map((p, i) => `<button data-preset="${i}">${p.name}</button>`).join("")}</div><button class="rand" data-rand="1">🎲 Randomize</button>`;
  if (tab === "head") body = `<h4>Fur</h4>${sw(FUR, L.fur, "fur")}${slider("Head size", "headSize", L.headSize, -0.25, 0.25)}<h4>Ears</h4>${chips(["round", "pointy", "floppy"], L.ears.style, "ears.style")}${slider("Ear size", "ears.size", L.ears.size, 0.75, 1.35)}<h4>Inner ears</h4>${sw([hexOf(new THREE.Color(L.fur).lerp(new THREE.Color(L.face), 0.5)), ...SKIN.slice(0, 4), "#e8a0a0"], X.colors?.innerEar ?? hexOf(new THREE.Color(L.fur).lerp(new THREE.Color(L.face), 0.5)), "x.colors.innerEar")}<h4>Tail curl</h4>${slider("Curl", "tail.curl", L.tail.curl, 0, 1)}`;
  if (tab === "face") body = `<h4>Face</h4>${sw(SKIN, L.face, "face")}<h4>Eyes</h4>${chips(["round", "sleepy", "sparkle", "beady"], L.eyes.style, "eyes.style")}${slider("Eye spacing", "eyes.spacing", L.eyes.spacing, 0.85, 1.15)}${sw(EYE, X.colors?.eyes ?? regionDefault("pupil"), "x.colors.eyes")}<h4>Brows</h4>${chips(["bold", "thin", "bushy", "none"], L.brows.style, "brows.style")}${sw(["#3a2420", "#1e1b24", "#7a4e2e", "#c9c2b8", "#e8b84a"], X.colors?.brows ?? regionDefault("dark"), "x.colors.brows")}${slider("Brow mood", "brows.tilt", L.brows.tilt, -1, 1)}<h4>Mouth</h4>${chips(["smile", "grin", "smirk", "toothy", "whistle"], L.mouth, "mouth")}<p class="dim">Tip: your shades come off at the bunker locker if you want to see the eyes.</p>`;
  if (tab === "outfit") body = `<h4>Build</h4>${slider("Slim to stocky", "x.build", X.build ?? 0, -1, 1)}<h4>Jacket</h4>${chipsL(JACKET_NAMES, X.jacket ?? "two", "x.jacket")}<h4>Suit</h4>${sw(SUIT, L.suit, "suit")}<h4>Shirt</h4>${sw(SHIRT, X.colors?.shirt ?? regionDefault("shirt"), "x.colors.shirt")}<h4>Buttons</h4>${sw(METAL, X.colors?.buttons ?? regionDefault("gold"), "x.colors.buttons")}<h4>Trousers</h4>${sw(SUIT, L.pants, "pants")}<h4>Tie</h4>${chips(["tie", "bowtie", "none"], L.tie.style, "tie.style")}${sw(ACCENT, L.tie.color, "tie.color")}<h4>Pocket square</h4>${chipsL([["yes", "On"], ["no", "Off"]], X.pocketSquare ? "yes" : "no", "x.pocketSquare")}${X.pocketSquare ? sw(ACCENT, X.colors?.square ?? regionDefault("square"), "x.colors.square") : ""}<h4>Feet</h4>${chips(["round", "shoes"], L.feet.style, "feet.style")}${sw([...FUR.slice(0, 5), "#2a2a30", "#6e4b2e"], L.feet.color, "feet.color")}<h4>Your bowler</h4>${gearColours("head", X)}<h4>Your shades</h4>${gearColours("face", X)}<h4>Your satchel</h4>${gearColours("back", X)}<p class="dim">Hats, armor and packs you find in raids are changed in your pack (Tab) or the bunker locker.</p>`;
  if (tab === "code") body = `<p>Share your look: copy this code, or paste a friend's.</p><textarea readonly>${encodeLook(L)}</textarea><button data-copy="1">Copy code</button><input class="paste" placeholder="paste a code here"><button data-paste="1">Use pasted code</button><p class="msg"></p>`;
  el.innerHTML = `<div class="c-head"><h2>Make your Businessman</h2><small>drag to turn him around</small></div><div class="c-tabs">${tabs.map(([t, n]) => `<b data-tab="${t}" class="${t === tab ? "on" : ""}">${n}</b>`).join("")}</div><div class="c-body">${body}</div><div class="c-foot"><button class="reset" data-reset="1">Reset</button><button class="go" data-go="1">${G.save.lookDone ? "Done" : "Let's get to business ▸"}</button></div>`;
  el.querySelectorAll<HTMLElement>("[data-tab]").forEach((b) => b.onclick = () => { tab = b.dataset.tab as Tab; sfx("ui"); render(); });
  el.querySelectorAll<HTMLElement>("[data-preset]").forEach((b) => b.onclick = () => { look = structuredClone(LOOK_PRESETS[+b.dataset.preset!].look); apply(); sfx("pop"); render(); });
  el.querySelectorAll<HTMLElement>("[data-rand]").forEach((b) => b.onclick = () => { look = randomLook(Math.random); apply(); sfx("pop"); render(); });
  el.querySelectorAll<HTMLElement>("i[data-k], b[data-k]").forEach((b) => b.onclick = () => { set(b.dataset.k!, b.dataset.v!); sfx("ui"); render(); });
  el.querySelectorAll<HTMLInputElement>("input[type=color]").forEach((b) => b.oninput = () => { set(b.dataset.k!, b.value); });
  el.querySelectorAll<HTMLInputElement>("input[type=range]").forEach((b) => b.oninput = () => { set(b.dataset.k!, Number(b.value)); (b.nextElementSibling as HTMLElement).textContent = Number(b.value).toFixed(2); });
  el.querySelector<HTMLElement>("[data-copy]")?.addEventListener("click", () => { navigator.clipboard?.writeText(encodeLook(look)).catch(() => {}); (el!.querySelector(".msg") as HTMLElement).textContent = "Copied!"; });
  el.querySelector<HTMLElement>("[data-paste]")?.addEventListener("click", () => { const v = (el!.querySelector(".paste") as HTMLInputElement).value, l = decodeLook(v); const m = el!.querySelector(".msg") as HTMLElement; if (!l) { m.textContent = "That code didn't work. Nothing changed."; sfx("nope"); return; } look = l; apply(); sfx("pop"); render(); });
  el.querySelector<HTMLElement>("[data-reset]")!.onclick = () => { look = structuredClone(DEFAULT_LOOK); apply(); render(); };
  el.querySelector<HTMLElement>("[data-go]")!.onclick = finish;
}
function set(path: string, v: string | number | boolean) {
  if (path === "x.pocketSquare") v = v === "yes";
  const parts = path.split("."); let o = look as unknown as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) o = (o[parts[i]] ??= {}) as Record<string, unknown>; // look.x and its groups are optional
  o[parts[parts.length - 1]] = v; apply();
}
function finish() { G.save.look = look; G.save.lookDone = true; save(G.save); sfx("extract"); el?.remove(); el = null; ctl?.remove(); ctl = null; const c = G.stage.renderer.domElement; c.onpointerdown = c.onpointermove = c.onpointerup = c.onpointercancel = null; c.classList.remove("c-canvas", "c-turning"); onDone(); }
const VIEW_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M4 3.5v5h5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
export function renderCreator(dt: number) {
  G.time += dt; U.uTime.value = G.time; // no auto-spin (Moo 2026-11-15): the monkey turns only when dragged
  if (drag === null && Math.abs(vel) > 0.05) { goal += vel * dt; vel *= Math.exp(-5 * dt); } else if (drag === null) vel = 0; // a flick coasts to a stop
  spin += (goal - spin) * (1 - Math.exp(-16 * dt)); // ease onto the dragged angle
  const r = G.rig; r.root.rotation.y = G.stage.cam.yaw + spin;
  r.pose({ time: G.time, speed: 0, moveYaw: G.stage.cam.yaw + spin, faceYaw: G.stage.cam.yaw + spin, action: "idle", actionT: 0, armed: "none", flash: 0 });
  // close-up: the monkey on the right third of the screen, the panel on the left
  const cam = G.stage.cam, saved = { ...cam }; cam.dist = 8.5; cam.pitch = THREE.MathUtils.degToRad(14);
  const right = new THREE.Vector3(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw)).multiplyScalar(-1.25);
  G.stage.place(r.root.position.clone().add(new THREE.Vector3(0, 1.15, 0)).add(right), dt, G.time); Object.assign(cam, saved);
}
