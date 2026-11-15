// Music + ambience (ElevenLabs music and loops on Moo's account; prompts and flows in research/audio/QUEUE.md).
// Streamed through media elements into the music bus (decoding minutes of stereo would cost ~30 MB a track), so each
// layer is just an <audio> element with a gain we fade. What plays:
//  - bunker: bunkerTheme (lounge-jazz exotica) over bunkerBed (room tone)
//  - raid: an area theme and an ambience bed picked from G.area (AREA below), crossfading over ~3 s when they change;
//    walking off every zone keeps the last area's pair, so seams between zones never flicker
//  - combat: a jazz-percussion layer on top of any area theme; it follows the hunting intensity and pulls the theme down
//  - boss: while Foreman Knucklebark is alerted or attacking, bossTheme replaces the area theme and the combat layer;
//    it fades out over ~4 s once he is down or loses you. stingBossIntro on the way in, stingBossDown when he falls
// Stings duck everything else for their length. Files: public/audio/music/manifest.json from tools/audio/build_music.mjs;
// a missing file leaves its layer silent (and a missing area theme falls back to the beach pair).
import { G } from "./state";
import { audioCtx, musicBus } from "./audio";
import { bossFight } from "../ai/enemies";

type Layer = { el: HTMLAudioElement; g: GainNode; target: number; fade: number; ref: number };
const layers: Record<string, Layer> = {};
let files: Record<string, string> | null = null, loading: Promise<unknown> | null = null;
let scene: "bunker" | "raid" | "none" = "none", want: "bunker" | "raid" | "none" = "none";
let combat = 0, duck = 1, duckTo = 1, duckT = 0, hold = 0, area = "beach", boss: "none" | "fight" | "down" = "none", bossHold = 0, bossOn = false;
const base = () => `${import.meta.env.BASE_URL}audio/music/`;
async function manifest() {
  if (files) return files;
  try { files = (await (await fetch(base() + "manifest.json")).json()) as Record<string, string>; } catch { files = {}; }
  return files;
}
const isSting = (name: string) => name.startsWith("sting");
function layer(name: string): Layer | null {
  const ctx = audioCtx(); if (!ctx || !musicBus || !files?.[name]) return null;
  if (layers[name]) return layers[name];
  const el = new Audio(base() + files[name]); el.loop = !isSting(name); el.preload = "auto"; el.crossOrigin = "anonymous";
  const g = ctx.createGain(); g.gain.value = 0; ctx.createMediaElementSource(el).connect(g).connect(musicBus);
  return (layers[name] = { el, g, target: 0, fade: 3, ref: 0 });
}
/** zone id (world/map/grove ZONES) -> music area; zones not listed keep the current area */
const AREA: Record<string, "beach" | "plantation" | "mangrove" | "grotto"> = {
  beach: "beach", cove: "beach", palms: "beach", westbend: "beach", wreck: "beach", riverbank: "beach",
  plantation: "plantation", camp: "plantation", radio: "plantation", planecrash: "plantation", ruin: "plantation", shrine: "plantation", vault: "plantation",
  mangrove: "mangrove", waterfall: "mangrove", "falls-nook": "mangrove",
  "grotto-a": "grotto", tunnel: "grotto", "grotto-b": "grotto", "grotto-c": "grotto", hollow: "grotto",
};
/** levels: themes stay sparse under play, beds sit below them */
const LEVEL = { bunkerTheme: 0.55, bunkerBed: 0.35, theme: 0.34, bed: 0.55, combat: 0.5, boss: 0.62 };
/** the theme and bed for an area, falling back to the beach pair while an area has no files of its own */
function areaPair(a: string): [string, string] {
  const has = (n: string) => !!files?.[n];
  const theme = has(`${a}Theme`) ? `${a}Theme` : has("beachTheme") ? "beachTheme" : "raidTheme";
  const bed = has(`${a}Bed`) ? `${a}Bed` : has("beachBed") ? "beachBed" : "raidBed";
  return [theme, bed];
}
/** switch scene music; safe to call before audio is unlocked (applies on the next tick after it is) */
export function setMusic(s: "bunker" | "raid" | "none") { want = s; }
type Sting = "stingExtract" | "stingBonk" | "stingRare" | "stingBossIntro" | "stingBossDown";
/** a one-shot over the music; the rest ducks to `under` for the sting's length */
export function sting(name: Sting, under = name === "stingRare" ? 0.55 : 0.25) {
  const l = layer(name); if (!l) return;
  l.el.currentTime = 0; l.target = 0.8; l.g.gain.value = 0.8; void l.el.play().catch(() => {});
  duckT = Math.min(l.el.duration || 4, 6); duckTo = under;
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
/** what each loop layer should be doing this frame: name -> [gain, fade seconds] */
function plan(): Record<string, [number, number]> {
  const p: Record<string, [number, number]> = {};
  if (scene === "bunker") { p.bunkerTheme = [LEVEL.bunkerTheme, 3]; p.bunkerBed = [LEVEL.bunkerBed, 3]; }
  if (scene !== "raid") return p;
  const [theme, bed] = areaPair(area);
  p[bed] = [LEVEL.bed * (bossOn ? 0.6 : 1), 3];
  if (bossOn && files?.bossTheme) { p.bossTheme = [LEVEL.boss, 1.2]; p[theme] = [0, 1.5]; p.combat = [0, 1.5]; }
  else {
    if (files?.bossTheme) p.bossTheme = [0, 4];
    p[theme] = [LEVEL.theme * (1 - 0.6 * combat), 3];
    p.combat = [LEVEL.combat * combat, 0.6];
  }
  return p;
}
/** once per render frame */
export function musicTick(dt: number) {
  const ctx = audioCtx(); if (!ctx || !musicBus) return;
  if (!files) { loading ??= manifest(); return; }
  if (want !== scene) { scene = want; boss = "none"; bossOn = false; bossHold = 0; area = "beach"; }
  if (scene === "raid") {
    const a = AREA[G.area]; if (a) area = a;
    // boss: on when he is in the fight, off ~0 s after he falls (the down sting covers it) or 4 s after he loses you
    const b = bossFight();
    if (b === "fight" && boss !== "fight") { if (!bossOn) sting("stingBossIntro"); bossOn = true; }
    if (b === "down" && boss === "fight") { sting("stingBossDown"); bossOn = false; }
    if (b === "fight") bossHold = 4; else if (bossOn && (bossHold -= dt) <= 0) bossOn = false;
    boss = b;
  }
  // combat rises fast (0.6 s), holds 4 s after the last hunter, then falls over ~3 s
  const h = hunting(); if (h > 0) hold = 4; else hold = Math.max(0, hold - dt);
  const goal = h > 0 ? h : hold > 0 ? combat : 0;
  combat += (goal - combat) * Math.min(1, dt * (goal > combat ? 1.6 : 0.35));
  if (duckT > 0) duckT -= dt;
  duck += ((duckT > 0 ? duckTo : 1) - duck) * Math.min(1, dt * 4);
  const p = plan();
  for (const [name, [gain, fade]] of Object.entries(p)) { const l = gain > 0 || layers[name] ? layer(name) : null; if (l) { l.target = gain; l.fade = fade; } }
  for (const l of Object.values(layers)) l.ref = Math.max(l.target, l.g.gain.value, l.ref * (l.g.gain.value > 0.003 ? 1 : 0)); // the level a fade runs from
  for (const [name, l] of Object.entries(layers)) {
    if (isSting(name)) { if (l.el.ended) l.g.gain.value = 0; continue; }
    if (!(name in p)) { l.target = 0; l.fade = 3; }
    const t = l.target * duck, g0 = l.g.gain.value;
    // linear fade: rising from silence to its level, or falling from its level to silence, takes `fade` seconds
    const step = dt * Math.max(l.ref, 0.05) / l.fade;
    const g = Math.abs(t - g0) <= step ? t : g0 + Math.sign(t - g0) * step;
    l.g.gain.value = g;
    if (g < 0.003 && t === 0 && !l.el.paused) l.el.pause();
    else if (t > 0 && l.el.paused) void l.el.play().catch(() => {});
  }
}
/** dev/test view of the mixer (window.__music with ?dev) */
export function musicState() {
  return { scene, area, boss, bossOn, combat: +combat.toFixed(2), duck: +duck.toFixed(2),
    layers: Object.fromEntries(Object.entries(layers).map(([n, l]) => [n, { gain: +l.g.gain.value.toFixed(3), target: +l.target.toFixed(3), playing: !l.el.paused }])) };
}
