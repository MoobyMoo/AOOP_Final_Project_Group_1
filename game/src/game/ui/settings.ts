// Esc settings plate (UI v3 "Corner office": the bunker ledger plate with brass brackets and the tie stripe). Opens with
// Esc in a raid or the bunker when nothing else owns Esc: the loot screen, the map and the bunker station panels close
// first (this listener runs in the capture phase before theirs and stands aside while any of them is open). The raid
// pauses while it is open. Sound: the four buses (core/audio.ts setVolume, persisted). Screen: "show controls" keeps
// the raid's key help on screen. Quit to bunker (raid only) counts as a bonk-out, after a second click: quitting must
// never be a free extract, so it keeps the pouch and leaves the rest, the same as being bonked.
// There is no mouse sensitivity setting: the cursor is the OS pointer itself (no virtual cursor to scale).
import { G } from "../core/state";
import { VOLUME, setVolume, sfx } from "../core/audio";

const LS = "bv_settings";
/** player preferences outside the audio buses */
export const prefs = (() => { try { const raw = JSON.parse(localStorage.getItem(LS) ?? "{}"); return { controls: raw?.controls === true, mapAssist: raw?.mapAssist === true }; } catch { return { controls: false, mapAssist: false }; } })();
function savePrefs() {
  try { localStorage.setItem(LS, JSON.stringify(prefs)); }
  catch { /* Apply controls and guidance preferences for the current session. */ }
}
const BRK = `<i class="brk tl"></i><i class="brk tr"></i><i class="brk bl"></i><i class="brk br"></i>`;
const BUSES: [keyof typeof VOLUME, string][] = [["master", "Master"], ["sfx", "Effects"], ["ui", "Interface"], ["music", "Music"]];

let el: HTMLDivElement | null = null, quitArmed = false;
let hooks: { blocked: () => boolean; quit: () => void } = { blocked: () => false, quit: () => {} };
export const settingsOpen = () => !!el;

/** main.ts wires this once: `blocked` = something else owns Esc right now; `quit` = leave the raid */
export function initSettings(h: typeof hooks) {
  hooks = h;
  addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || e.repeat) return;
    if (el) { e.preventDefault(); closeSettings(); return; }
    if ((G.scene !== "raid" && G.scene !== "bunker") || hooks.blocked() || (G.scene === "raid" && !G.alive) || G.bot) return;
    e.preventDefault(); openSettings();
  }, true);
}
export function openSettings() {
  if (el) return;
  const raid = G.scene === "raid"; quitArmed = false;
  el = document.createElement("div"); el.className = "panel set3"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Settings");
  el.innerHTML = `${BRK}<header><h2>Settings</h2><small>${raid ? "Raid paused" : "Bunker"}</small></header><div class="tie"></div>
    <h4>Sound</h4>
    <div class="rows">${BUSES.map(([k, name]) => `<label class="srow"><b>${name}</b><input type="range" min="0" max="100" step="1" value="${Math.round(VOLUME[k] * 100)}" data-bus="${k}" aria-label="${name} volume"><span class="num" data-v="${k}">${Math.round(VOLUME[k] * 100)}%</span></label>`).join("")}</div>
    <h4>Screen</h4>
    <div class="rows"><div class="srow"><b>Show controls</b><small>Keep the key list on screen in a raid</small><button class="tgl" data-a="controls" aria-pressed="${prefs.controls}">${prefs.controls ? "On" : "Off"}</button></div></div>
    <div class="rows"><label class="srow"><b>Map guidance</b><small>Click a destination on the map for a direction hint</small><input type="checkbox" data-pref="mapAssist" aria-label="Map guidance" ${prefs.mapAssist ? "checked" : ""}></label></div>
    <div class="actions"><button data-a="resume">Resume</button>${raid ? `<button class="ghost" data-a="quit">Quit to bunker</button>` : ""}</div>
    ${raid ? `<p class="dim quitnote">Quitting counts as a bonk-out: your pouch comes home, the rest of your pack and worn gear stay behind.</p>` : ""}
    <div class="foot"><kbd>Esc</kbd> to resume</div>`;
  (document.getElementById("ui") ?? document.body).appendChild(el);
  el.querySelectorAll<HTMLInputElement>("input[data-bus]").forEach((r) => {
    r.oninput = () => { const k = r.dataset.bus as keyof typeof VOLUME; setVolume(k, Number(r.value) / 100); (el!.querySelector(`[data-v="${k}"]`) as HTMLElement).textContent = `${r.value}%`; };
    r.onchange = () => sfx(r.dataset.bus === "sfx" ? "shell" : "ui"); // a blip on the bus you just set
  });
  el.querySelectorAll<HTMLButtonElement>("button[data-a]").forEach((b) => b.onclick = () => act(b.dataset.a!, b));
  el.querySelector<HTMLInputElement>('[data-pref="mapAssist"]')!.onchange = (e) => { prefs.mapAssist = (e.target as HTMLInputElement).checked; savePrefs(); sfx("ui"); };
  (el.querySelector('button[data-a="resume"]') as HTMLButtonElement).focus({ preventScroll: true });
  sfx("ui");
}
function act(a: string, b: HTMLButtonElement) {
  if (a === "resume") closeSettings();
  else if (a === "controls") { prefs.controls = !prefs.controls; savePrefs(); b.setAttribute("aria-pressed", String(prefs.controls)); b.textContent = prefs.controls ? "On" : "Off"; sfx("ui"); }
  else if (a === "quit") {
    if (!quitArmed) { quitArmed = true; b.textContent = "Leave the pack? Click again"; b.classList.add("armed"); sfx("nope"); return; }
    closeSettings(); hooks.quit();
  }
}
export function closeSettings() { if (!el) return; el.remove(); el = null; quitArmed = false; sfx("ui"); }
