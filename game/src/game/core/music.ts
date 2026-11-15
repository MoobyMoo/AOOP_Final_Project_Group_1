// Music + ambience (G1.5 row 02, ElevenLabs music on Moo's account). Streamed through media elements into the
// music bus (decoding minutes of stereo would cost ~30 MB a track), so each layer is just an <audio> element with a
// gain we fade. Layers:
//  - bed: the place's ambience loop (beach surf + jungle in the raid, the bunker's room tone at home)
//  - theme: the scene's music (bunker theme at home, sparse exploration music in the raid)
//  - combat: a percussion layer that rises while an awake enemy near the player is hunting it, and lowers the theme
// Stings (extract, bonk) duck everything for their length. Files and names: public/audio/music/manifest.json
// written by tools/audio/build_music.mjs; a missing file just leaves that layer silent.
import { G } from "./state";
import { audioCtx, musicBus } from "./audio";

type Layer = { el: HTMLAudioElement; g: GainNode; target: number };
const layers: Record<string, Layer> = {};
let files: Record<string, string> | null = null, loading: Promise<unknown> | null = null, scene: "bunker" | "raid" | "none" = "none", want: "bunker" | "raid" | "none" = "none";
let combat = 0, duck = 1, duckT = 0;
const base = () => `${import.meta.env.BASE_URL}audio/music/`;
async function manifest() {
  if (files) return files;
  try { files = (await (await fetch(base() + "manifest.json")).json()) as Record<string, string>; } catch { files = {}; }
  return files;
}
function layer(name: string): Layer | null {
  const ctx = audioCtx(); if (!ctx || !musicBus || !files?.[name]) return null;
  if (layers[name]) return layers[name];
  const el = new Audio(base() + files[name]); el.loop = !name.startsWith("sting"); el.preload = "auto"; el.crossOrigin = "anonymous";
  const g = ctx.createGain(); g.gain.value = 0; ctx.createMediaElementSource(el).connect(g).connect(musicBus);
  return (layers[name] = { el, g, target: 0 });
}
/** levels per scene: [layer, gain] */
const MIX: Record<string, [string, number][]> = {
  bunker: [["bunkerTheme", 0.55], ["bunkerBed", 0.35]],
  raid: [["raidBed", 0.6], ["raidTheme", 0.32], ["combat", 0]],
  none: [],
};
/** switch scene music; safe to call before audio is unlocked (applies on the next tick after it is) */
export function setMusic(s: "bunker" | "raid" | "none") { want = s; }
export function sting(name: "stingExtract" | "stingBonk") {
  const l = layer(name); if (!l) return;
  l.el.currentTime = 0; l.target = 0.8; l.g.gain.value = 0.8; void l.el.play().catch(() => {});
  duckT = Math.min(l.el.duration || 4, 6);
}
/** combat intensity 0..1: awake enemies hunting the player, closer counts more */
function hunting() {
  if (G.scene !== "raid" || !G.alive) return 0;
  let s = 0;
  for (const e of G.enemies) {
    if (e.down || !e.active || ["patrol", "return", "sleep", "recover", "down"].includes(e.state)) continue;
    const d = Math.hypot(e.p.x - G.pp.x, e.p.z - G.pp.z); if (d < 30) s += d < 14 ? 1 : (30 - d) / 16;
  }
  return Math.min(1, s);
}
let hold = 0;
/** once per render frame */
export function musicTick(dt: number) {
  const ctx = audioCtx(); if (!ctx || !musicBus) return;
  if (!files) { loading ??= manifest(); return; }
  if (want !== scene) {
    scene = want;
    for (const l of Object.values(layers)) if (l.el.loop) l.target = 0;
    for (const [name, gain] of MIX[scene]) { const l = layer(name); if (l) { l.target = gain; if (l.el.paused) { l.el.currentTime = 0; void l.el.play().catch(() => {}); } } }
  }
  // combat rises fast (0.6 s), holds 4 s after the last hunter, then falls over ~3 s
  const h = hunting(); if (h > 0) hold = 4; else hold = Math.max(0, hold - dt);
  const goal = h > 0 ? h : hold > 0 ? combat : 0;
  combat += (goal - combat) * Math.min(1, dt * (goal > combat ? 1.6 : 0.35));
  if (duckT > 0) duckT -= dt;
  duck += ((duckT > 0 ? 0.25 : 1) - duck) * Math.min(1, dt * 4);
  for (const [name, l] of Object.entries(layers)) {
    let t = l.target;
    if (scene === "raid" && name === "combat") t = 0.55 * combat;
    if (scene === "raid" && name === "raidTheme") t *= 1 - 0.7 * combat;
    if (!name.startsWith("sting")) t *= duck;
    const g = l.g.gain.value + (t - l.g.gain.value) * Math.min(1, dt * 2.5);
    l.g.gain.value = g;
    if (l.el.loop && g < 0.003 && t === 0 && !l.el.paused) l.el.pause();
    else if (l.el.loop && t > 0 && l.el.paused) void l.el.play().catch(() => {});
  }
}
