// Game SFX. Recorded samples (ElevenLabs, G1.5 row 02) are the voice of every action; there is no synth fallback (the
// old synth recipes were removed once every kind had takes; research/audio/QUEUE.md lists the set).
// Mix rules (research/duckov-re/POLISH_FINDINGS.md, the gunshot layering and hit-confirm roles):
//  - one sample per kind is picked at random and never the same take twice in a row, with a small pitch jitter, so
//    repeats don't machine-gun; pickups/cash climb in pitch for repeats inside 0.25 s (research/idle-arcade rule 5)
//  - the shot is three layers mixed at runtime: core crack, slide mechanism a beat later, and the tail
//  - each kind has a voice cap; the oldest voice is cut with a short fade when the cap is hit
//  - three buses (sfx, ui, music) into one compressor so music can duck under combat later
import { tuneObject } from "./tune";
let ctx: AudioContext | null = null, master: GainNode | null = null, loaded = false;
let sfxBus: GainNode | null = null, uiBus: GainNode | null = null;
/** the gunshot's crack and tail go through this lowpass + gain before the sfx bus, so a suppressor can make the shot
 *  quieter and duller without a second sample set (G1.5 row 36). The slide mechanism layer skips it: a suppressor
 *  does not quiet the action. */
let shotLp: BiquadFilterNode | null = null, shotGain: GainNode | null = null;
/** shot tone (?tune "suppressor"): open = no suppressor; suppressed = the cutoff (Hz) and the level it plays at */
export const SHOT_TONE = { suppressed: 0, cutoff: 1300, level: 0.42, q: 0.5 };
tuneObject("suppressor", SHOT_TONE, { cutoff: { min: 300, max: 8000, step: 50, label: "suppressed shot lowpass (Hz)" }, level: { min: 0.05, max: 1, step: 0.01, label: "suppressed shot level" }, q: { min: 0.1, max: 4, step: 0.05, label: "lowpass Q" } },
  { onChange: () => applyShotTone(), note: "suppressor sound (core/audio.ts; on while a suppressor is fitted)" });
/** a suppressor is fitted (combat/gunstats.ts calls this when the attachments change) */
export function setShotSuppressed(on: boolean) { SHOT_TONE.suppressed = on ? 1 : 0; applyShotTone(); }
function applyShotTone() {
  if (!ctx || !shotLp || !shotGain) return; const t = ctx.currentTime, on = SHOT_TONE.suppressed > 0;
  shotLp.frequency.setTargetAtTime(on ? SHOT_TONE.cutoff : 20000, t, 0.01); shotLp.Q.setTargetAtTime(on ? SHOT_TONE.q : 0.0001, t, 0.01);
  shotGain.gain.setTargetAtTime(on ? SHOT_TONE.level : 1, t, 0.01);
}
/** the gain the shot's crack plays at right now (capture tools measure the suppressor with this) */
export const shotLevel = () => (SHOT_TONE.suppressed > 0 ? SHOT_TONE.level : 1);
/** capture handle (tools/gunfeel.mjs): an analyser tapped off the sfx bus (it only listens) */
(globalThis as unknown as { __audio: object }).__audio = {
  tap(shotOnly = false) { const src = shotOnly ? shotGain : sfxBus; if (!ctx || !src) return null; const a = ctx.createAnalyser(); a.fftSize = 2048; src.connect(a); return a; },
  ctx: () => ctx, tone: SHOT_TONE,
};
export let musicBus: GainNode | null = null;
export function audioCtx() { return ctx; }
/** player volume settings, 0..1 per bus (persisted; the settings menu calls this) */
export const VOLUME = { master: 1, sfx: 1, ui: 1, music: 1 };
try {
  const saved = JSON.parse(globalThis.localStorage?.getItem("bv_volume") ?? "{}");
  for (const bus of Object.keys(VOLUME) as (keyof typeof VOLUME)[]) {
    const value = saved?.[bus];
    if (typeof value === "number" && Number.isFinite(value)) VOLUME[bus] = Math.min(1, Math.max(0, value));
  }
} catch { /* Use the defaults when stored preferences are unreadable. */ }
const BUS_BASE = { master: 0.7, sfx: 1, ui: 0.8, music: 0.5 };
export function setVolume(bus: keyof typeof VOLUME, v: number) {
  if (!Number.isFinite(v)) return;
  VOLUME[bus] = Math.min(1, Math.max(0, v));
  try { globalThis.localStorage?.setItem("bv_volume", JSON.stringify(VOLUME)); }
  catch { /* Volume still applies for this session when storage is unavailable. */ }
  applyVolume();
}
// ?tune "audio": the same four buses (the setting persists through setVolume, not the tune store)
tuneObject("audio", VOLUME, { master: { min: 0, max: 1, step: 0.01 }, sfx: { min: 0, max: 1, step: 0.01, label: "effects" }, ui: { min: 0, max: 1, step: 0.01, label: "interface" }, music: { min: 0, max: 1, step: 0.01 } },
  { persist: false, onChange: (k, v) => setVolume(k as keyof typeof VOLUME, v), note: "bus volumes (core/audio.ts; the settings menu writes the same values)" });
function applyVolume() {
  if (!ctx) return; const t = ctx.currentTime;
  for (const [bus, node] of [["master", master], ["sfx", sfxBus], ["ui", uiBus], ["music", musicBus]] as const) node?.gain.setTargetAtTime(BUS_BASE[bus] * VOLUME[bus], t, 0.03);
}
export function unlockAudio() {
  if (!ctx) {
    ctx = new AudioContext(); master = ctx.createGain(); master.gain.value = 0.7;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.15;
    master.connect(comp).connect(ctx.destination);
    sfxBus = ctx.createGain(); uiBus = ctx.createGain(); musicBus = ctx.createGain();
    sfxBus.gain.value = 1; uiBus.gain.value = 0.8; musicBus.gain.value = 0.5;
    sfxBus.connect(master); uiBus.connect(master); musicBus.connect(master); applyVolume();
    shotLp = ctx.createBiquadFilter(); shotLp.type = "lowpass"; shotGain = ctx.createGain(); shotLp.connect(shotGain).connect(sfxBus); applyShotTone();
    void loadSamples();
  }
  if (ctx.state === "suspended") void ctx.resume();
}
/** every sound the game plays; each one is an ElevenLabs sample set (public/audio/sfx/manifest.json, built by
 *  tools/audio/build_sfx.mjs). "shot" layers shotCore + shotMech + shotTail; "step" is the generic footstep (stepOn
 *  picks the surface). There is no synth: a kind with no samples plays nothing and warns once in dev. */
export type Sfx = "shot" | "shell" | "dry" | "reloadOut" | "reloadIn" | "slide" | "reloadRound" | "swing" | "bonk" | "hit" | "hitCrit"
  | "kill" | "killCrit" | "impactDirt" | "impactWood" | "impactMetal" | "impactFoliage" | "impactStone" | "dash" | "ko" | "hurt" | "heal"
  | "step" | "crateTick" | "crate" | "pop" | "rare" | "pick" | "throw" | "whirr" | "windup" | "slam" | "roar" | "thunk" | "notice"
  | "snatch" | "tick" | "extract" | "cash" | "buy" | "nope" | "ui" | "door"
  | "squawk" | "grunt" | "squeal" | "splash" | "scuttle"
  | "coinFlip" | "coinLand" | "rouletteSpin" | "lockboxOpen"; // the Fence's games and lockboxes (home/econ-ui.ts) // wildlife (ai/fauna.ts): parrot flush, boar telegraph + charge, croc lunge, crab
const combo: Record<string, { n: number; t: number }> = {}, warned = new Set<string>();
/** play a sound; vol scales it (e.g. by distance) */
export function sfx(kind: Sfx, vol = 1) {
  if (!ctx || !master || vol <= 0.01) return;
  const now = ctx.currentTime, c = (combo[kind] ??= { n: 0, t: 0 }); c.n = now - c.t < 0.25 ? c.n + 1 : 0; c.t = now;
  if (!playSample(kind, vol, c.n) && import.meta.env.DEV && loaded && !warned.has(kind)) { warned.add(kind); console.warn(`sfx "${kind}" has no samples`); }
}

// ---- guns: one sampled layer set per class (combat/guns.ts GunDef.sound) ----
/** the layer sets: "pistol" is the Kingpin's original takes, the rest are per-class ElevenLabs takes; "zapper" is the
 *  novelty ray gun (no shell, no mechanism) */
export type GunSet = "pistol" | "smg" | "rifle" | "shotgun" | "sniper" | "lmg" | "zapper";
export type GunLayer = "shotCore" | "shotMech" | "shotTail" | "smgCore" | "smgMech" | "smgTail" | "rifleCore" | "rifleMech" | "rifleTail"
  | "shotgunCore" | "shotgunTail" | "sniperCore" | "sniperTail" | "lmgCore" | "lmgBelt" | "lmgTail" | "zapperCore"
  | "pumpRack" | "boltCycle" | "breakClunk" | "smgMagOut" | "smgMagIn" | "rifleMagOut" | "rifleMagIn" | "shellInsert" | "lmgBoxOut" | "lmgBoxIn"
  | "dryHeavy" | "dryLight" | "dry" | "reloadOut" | "reloadIn" | "slide" | "reloadRound";
type Kit = {
  core: GunLayer; tail?: GunLayer; /** the action, `mechAt` s after the shot (a bolt or pump cycles later than a gas action) */ mech?: GunLayer; mechAt?: number;
  dry: GunLayer; /** mag reload: out at 15 %, in at 65 %, close at 85 % */ out?: GunLayer; in?: GunLayer; close?: GunLayer;
  /** round reload: each round, plus open at the start and close when it ends (only when a gun sets them) */ round?: GunLayer; open?: GunLayer;
};
const GUN_KITS: Record<GunSet, Kit> = {
  pistol: { core: "shotCore", mech: "shotMech", mechAt: 0.035, tail: "shotTail", dry: "dry", out: "reloadOut", in: "reloadIn", close: "slide", round: "reloadRound" },
  smg: { core: "smgCore", mech: "smgMech", mechAt: 0.02, tail: "smgTail", dry: "dryLight", out: "smgMagOut", in: "smgMagIn", close: "slide" },
  rifle: { core: "rifleCore", mech: "rifleMech", mechAt: 0.03, tail: "rifleTail", dry: "dryHeavy", out: "rifleMagOut", in: "rifleMagIn", close: "slide" },
  shotgun: { core: "shotgunCore", tail: "shotgunTail", dry: "dryHeavy", round: "shellInsert", out: "rifleMagOut", in: "rifleMagIn", close: "slide" },
  sniper: { core: "sniperCore", mech: "boltCycle", mechAt: 0.45, tail: "sniperTail", dry: "dryHeavy", out: "rifleMagOut", in: "rifleMagIn", close: "boltCycle" },
  lmg: { core: "lmgCore", mech: "lmgBelt", mechAt: 0.025, tail: "lmgTail", dry: "dryHeavy", out: "lmgBoxOut", in: "lmgBoxIn", close: "lmgBelt" },
  zapper: { core: "zapperCore", dry: "dryLight", out: "reloadOut", in: "reloadIn", close: "slide" },
};
/** a gun's sound: its class set, a gain on top of the set's mix, the tail's longest ring (s), and per-gun overrides of
 *  the kit (a pump gun's rack as its mechanism and reload close, a break action's clunk as its reload open) */
export type GunSound = { set: GunSet; gain: number; tail: number } & Partial<Pick<Kit, "mech" | "mechAt" | "open" | "close">>;
const kitOf = (s: GunSound): Kit => ({ ...GUN_KITS[s.set], ...(s.mech ? { mech: s.mech, mechAt: s.mechAt } : {}), ...(s.open ? { open: s.open } : {}), ...(s.close ? { close: s.close } : {}) });
const jit = (k: string) => 1 + (Math.random() - 0.5) * 2 * (MIX[k as keyof typeof MIX]?.jit ?? 0);
/** a gunshot voiced for one gun: core crack (rotating takes, never the same twice in a row, so auto fire doesn't
 *  machine-gun), the action a beat later, and the tail held up to `tail` s. Core and tail go through the suppressor
 *  filter; the action does not (a suppressor does not quiet the bolt) */
export function gunShot(sound: GunSound, vol = 1) {
  if (!ctx || !master || vol <= 0.01) return;
  const kit = kitOf(sound), core = pickBuf(kit.core); if (!core) return;
  const v = vol * sound.gain;
  voice(kit.core, core, v, jit(kit.core), 0, shotLp ?? sfxBus!);
  const mech = kit.mech && pickBuf(kit.mech); if (mech) voice(kit.mech!, mech, v, jit(kit.mech!), kit.mechAt ?? 0.03, sfxBus!);
  const tail = kit.tail && pickBuf(kit.tail); if (tail) voice(kit.tail!, tail, v * (0.6 + 0.4 * vol), jit(kit.tail!), 0.01, shotLp ?? sfxBus!, sound.tail);
}
/** a reload stage for one gun (combat/reload.ts): "open" | "out" | "in" | "close" | "round"; a stage the kit has no
 *  layer for is silent */
export function gunReload(sound: GunSound, stage: "open" | "out" | "in" | "close" | "round") {
  if (!ctx || !master) return;
  const k = kitOf(sound)[stage], buf = k && pickBuf(k); if (buf) voice(k!, buf, 1, jit(k!), 0, sfxBus!);
}
/** the empty-gun click: light for pistols, SMGs and the zapper, heavy for long guns */
export function gunDry(sound: GunSound) {
  if (!ctx || !master) return;
  const k = kitOf(sound).dry, buf = pickBuf(k); if (buf) voice(k, buf, 1, jit(k), 0, sfxBus!);
}
// ---- samples ----
/** per-kind mix: gain, pitch jitter, voice cap, optional hard length cap. The gains level every kind against the gun: each
 *  is set from the kind's measured punch (loudest 100 ms RMS of its peak-normalised takes) plus a role offset in dB
 *  relative to shotCore, which stays at 0.42 (about -7.5 dB): hit-confirms -1..-3, boss cues +1, gun handling -8..-10,
 *  impacts -9, UI -6..-12, footsteps -16/-17, wildlife -1..-3 (crab -18), guns by class: smg -2, rifle/lmg +1, shotgun +2, sniper +3, zapper -1 (their actions, tails and reloads -4..-10). Re-derive them when takes change (research/audio/QUEUE.md, "Mix"). */
type Mix = { g: number; jit?: number; cap?: number; max?: number; climb?: boolean };
const MIX: Partial<Record<Sfx | GunLayer | StepKind | HumKind, Mix>> = {
  shotCore: { g: 0.42, jit: 0.05, cap: 6, max: 0.9 }, shotMech: { g: 0.29, jit: 0.06, cap: 4, max: 0.35 }, shotTail: { g: 0.24, jit: 0.04, cap: 3, max: 1.4 },
  shell: { g: 0.18, jit: 0.1, cap: 3, max: 0.6 }, dry: { g: 0.39, cap: 1 }, reloadOut: { g: 0.35, cap: 1 }, reloadIn: { g: 0.5, cap: 1 },
  slide: { g: 0.24, cap: 1 }, reloadRound: { g: 0.2, jit: 0.06, cap: 2 },
  hit: { g: 0.26, jit: 0.08, cap: 4, max: 0.4 }, hitCrit: { g: 0.32, jit: 0.04, cap: 3, max: 0.5 }, kill: { g: 0.27, cap: 2, max: 0.8 }, killCrit: { g: 0.27, cap: 2, max: 1.0 },
  ko: { g: 0.1, jit: 0.05, cap: 2, max: 1.2 }, bonk: { g: 0.51, jit: 0.06, cap: 2, max: 0.7 }, swing: { g: 0.18, jit: 0.08, cap: 2, max: 0.5 },
  impactDirt: { g: 0.15, jit: 0.12, cap: 4, max: 0.4 }, impactWood: { g: 0.26, jit: 0.1, cap: 4, max: 0.45 }, impactMetal: { g: 0.22, jit: 0.08, cap: 3, max: 0.6 },
  impactFoliage: { g: 0.32, jit: 0.15, cap: 3, max: 0.45 }, impactStone: { g: 0.37, jit: 0.1, cap: 4, max: 0.45 },
  dash: { g: 0.07, jit: 0.05, cap: 1, max: 0.6 }, hurt: { g: 0.18, jit: 0.06, cap: 1, max: 0.7 }, heal: { g: 0.23, cap: 1, max: 1.5 }, step: { g: 0.14, jit: 0.15, cap: 2, max: 0.35 },
  windup: { g: 0.17, cap: 2, max: 1.0 }, throw: { g: 0.14, jit: 0.06, cap: 2, max: 0.8 }, roar: { g: 0.35, cap: 1, max: 2.5 }, slam: { g: 0.23, cap: 1, max: 1.5 },
  notice: { g: 0.27, cap: 2, max: 0.7 }, snatch: { g: 0.12, cap: 1, max: 0.7 }, thunk: { g: 0.19, cap: 2, max: 1.0 },
  crate: { g: 0.27, cap: 1, max: 1.2 }, crateTick: { g: 0.2, cap: 2, max: 0.35, climb: true }, door: { g: 0.06, cap: 2, max: 1.5 },
  extract: { g: 0.2, cap: 1, max: 3 }, tick: { g: 0.26, cap: 1, max: 0.3 }, whirr: { g: 0.28, cap: 1, max: 1.0 },
  pick: { g: 0.4, cap: 3, max: 0.4, climb: true }, rare: { g: 0.21, cap: 1, max: 2 }, cash: { g: 0.38, cap: 3, max: 0.8, climb: true }, buy: { g: 0.24, cap: 1, max: 1.2 },
  ui: { g: 0.28, cap: 2, max: 0.25 }, pop: { g: 0.21, cap: 3, max: 0.4, climb: true }, nope: { g: 0.41, cap: 1, max: 0.5 },
  // guns by class (GUN_KITS): cores rotate takes; voice caps let auto fire overlap; gains from measured punch (QUEUE.md "Mix")
  smgCore: { g: 0.47, jit: 0.05, cap: 8, max: 0.5 }, rifleCore: { g: 0.38, jit: 0.04, cap: 6, max: 0.7 }, shotgunCore: { g: 0.31, jit: 0.03, cap: 3, max: 1.0 },
  sniperCore: { g: 0.53, jit: 0.03, cap: 2, max: 1.0 }, lmgCore: { g: 0.26, jit: 0.05, cap: 8, max: 0.6 }, zapperCore: { g: 0.29, jit: 0.06, cap: 4, max: 0.8 },
  smgMech: { g: 0.24, jit: 0.08, cap: 4, max: 0.3 }, rifleMech: { g: 0.24, jit: 0.06, cap: 4, max: 0.35 }, lmgBelt: { g: 0.24, jit: 0.08, cap: 4, max: 0.4 },
  pumpRack: { g: 0.23, jit: 0.03, cap: 1, max: 0.9 }, boltCycle: { g: 0.26, jit: 0.03, cap: 1, max: 1.1 }, breakClunk: { g: 0.35, jit: 0.04, cap: 1, max: 0.9 },
  smgTail: { g: 0.14, jit: 0.05, cap: 3, max: 0.9 }, rifleTail: { g: 0.36, jit: 0.04, cap: 3, max: 1.6 }, shotgunTail: { g: 0.21, jit: 0.03, cap: 2, max: 1.9 },
  sniperTail: { g: 0.33, jit: 0.02, cap: 2, max: 3.2 }, lmgTail: { g: 0.27, jit: 0.04, cap: 3, max: 1.3 },
  smgMagOut: { g: 0.24, jit: 0.04, cap: 1 }, smgMagIn: { g: 0.43, jit: 0.04, cap: 1 }, rifleMagOut: { g: 0.27, jit: 0.04, cap: 1 }, rifleMagIn: { g: 0.28, jit: 0.04, cap: 1 },
  shellInsert: { g: 0.39, jit: 0.06, cap: 2 }, lmgBoxOut: { g: 0.22, jit: 0.04, cap: 1 }, lmgBoxIn: { g: 0.17, jit: 0.04, cap: 1, max: 1.1 },
  dryHeavy: { g: 0.27, cap: 1 }, dryLight: { g: 0.23, cap: 1 },
  // the economy (home/econ-ui.ts): coin -6/-5, roulette -6, lockbox -4; factory hums -20 at their closest (factoryHum)
  coinFlip: { g: 0.21, jit: 0.05, cap: 1, max: 1.0 }, coinLand: { g: 0.35, jit: 0.05, cap: 1, max: 1.2 }, rouletteSpin: { g: 0.74, cap: 1, max: 3.6 }, lockboxOpen: { g: 0.43, cap: 1, max: 2 },
  facRipen: { g: 0.02 }, facBottler: { g: 0.06 }, facScrappress: { g: 0.03 }, facCoupon: { g: 0.04 },
  // wildlife (ai/fauna.ts): squawk -1 (it gives you away, so it carries), grunt -2 (the charge warning), squeal -3, splash -2, scuttle -18
  squawk: { g: 0.38, jit: 0.06, cap: 2, max: 0.8 }, grunt: { g: 0.36, jit: 0.06, cap: 2, max: 0.8 }, squeal: { g: 0.18, jit: 0.05, cap: 2, max: 0.7 },
  splash: { g: 0.15, jit: 0.05, cap: 1, max: 1.2 }, scuttle: { g: 0.1, jit: 0.15, cap: 2, max: 0.5 },
  // footsteps per ground (stepOn): low under everything, wide jitter so a walk never repeats exactly
  stepDirt: { g: 0.14, jit: 0.12, cap: 2, max: 0.35 }, stepSand: { g: 0.07, jit: 0.12, cap: 2, max: 0.5 }, stepGrass: { g: 0.1, jit: 0.12, cap: 2, max: 0.5 },
  stepPlank: { g: 0.1, jit: 0.1, cap: 2, max: 0.35 }, stepStone: { g: 0.08, jit: 0.1, cap: 2, max: 0.35 }, stepMud: { g: 0.11, jit: 0.1, cap: 2, max: 0.4 },
  stepCave: { g: 0.1, jit: 0.1, cap: 2, max: 0.45 },
};
// ---- factory hums (home/bunker.ts): one looping voice per line, faded toward the level the bunker sets each frame ----
export type HumKind = "facRipen" | "facBottler" | "facScrappress" | "facCoupon";
const hums: Partial<Record<HumKind, { src: AudioBufferSourceNode; g: GainNode }>> = {};
/** a factory line's hum at `level` 0..1 (distance falloff and whether it runs; 0 fades it out and stops it) */
export function factoryHum(kind: HumKind, level: number) {
  if (!ctx || !sfxBus) return;
  let h = hums[kind];
  if (!h && level > 0.005) {
    const buf = pickBuf(kind); if (!buf) return;
    const src = ctx.createBufferSource(), g = ctx.createGain(); src.buffer = buf; src.loop = true; g.gain.value = 0;
    src.connect(g).connect(sfxBus); src.start(0, Math.random() * buf.duration); h = hums[kind] = { src, g };
  }
  if (!h) return;
  h.g.gain.setTargetAtTime(level * (MIX[kind]?.g ?? 0.1), ctx.currentTime, 0.25);
  if (level <= 0.005 && h.g.gain.value < 0.002) { h.src.stop(); delete hums[kind]; }
}
/** silence every factory hum at once (leaving the bunker) */
export function stopFactoryHums() { for (const k of Object.keys(hums) as HumKind[]) { hums[k]!.src.stop(); delete hums[k]; } }
type StepKind = "stepDirt" | "stepSand" | "stepGrass" | "stepPlank" | "stepStone" | "stepMud" | "stepCave";
/** a footstep on the given ground (world/map/types Ground); falls back to the generic step while that surface has no takes */
export function stepOn(ground: string | undefined, vol = 1) {
  const kind = ("step" + (ground ?? "dirt")[0].toUpperCase() + (ground ?? "dirt").slice(1)) as StepKind;
  if (!ctx || vol <= 0.01 || !BUFS[kind]?.length) { sfx("step", vol); return; }
  const m = MIX[kind]!; voice(kind, pickBuf(kind)!, vol, 1 + (Math.random() - 0.5) * 2 * (m.jit ?? 0), 0, sfxBus!);
}
const UI_KINDS = new Set<string>(["ui", "pick", "rare", "cash", "buy", "pop", "nope", "tick"]);
const BUFS: Record<string, AudioBuffer[]> = {};
const last: Record<string, number> = {};
const voices: Record<string, { src: AudioBufferSourceNode; g: GainNode }[]> = {};
/** public/audio/sfx/manifest.json is written by tools/audio/build_sfx.mjs: { kind: ["kind_1.mp3", ...] } */
async function loadSamples() {
  try {
    const base = `${import.meta.env.BASE_URL}audio/sfx/`;
    const man = (await (await fetch(base + "manifest.json")).json()) as Record<string, string[]>;
    await Promise.all(Object.entries(man).flatMap(([kind, files]) => files.map(async (f, i) => {
      const buf = await ctx!.decodeAudioData(await (await fetch(base + f)).arrayBuffer());
      (BUFS[kind] ??= [])[i] = buf;
    })));
    for (const k in BUFS) BUFS[k] = BUFS[k].filter(Boolean);
  } catch (e) { console.warn("sfx samples unavailable", e); }
  loaded = true;
}
function pickBuf(kind: string): AudioBuffer | null {
  const list = BUFS[kind]; if (!list?.length) return null;
  let i = Math.floor(Math.random() * list.length);
  if (list.length > 1 && i === last[kind]) i = (i + 1 + Math.floor(Math.random() * (list.length - 1))) % list.length;
  last[kind] = i; return list[i];
}
function voice(kind: string, buf: AudioBuffer, vol: number, rate: number, at: number, bus: AudioNode, maxLen?: number) {
  const m0 = MIX[kind as keyof typeof MIX] ?? { g: 0.5 }, m = maxLen ? { ...m0, max: maxLen } : m0, cap = m.cap ?? 3, vs = (voices[kind] ??= []);
  while (vs.length >= cap) { const old = vs.shift()!; old.g.gain.setTargetAtTime(0, ctx!.currentTime, 0.012); old.src.stop(ctx!.currentTime + 0.06); }
  const src = ctx!.createBufferSource(), g = ctx!.createGain(); src.buffer = buf; src.playbackRate.value = rate;
  g.gain.value = m.g * vol; src.connect(g).connect(bus);
  const t0 = ctx!.currentTime + at, len = Math.min(buf.duration / rate, m.max ?? 99);
  if (len < buf.duration / rate) { g.gain.setValueAtTime(m.g * vol, t0 + len - 0.06); g.gain.linearRampToValueAtTime(0, t0 + len); }
  src.start(t0); src.stop(t0 + len + 0.01);
  const rec = { src, g }; vs.push(rec); src.onended = () => { const j = vs.indexOf(rec); if (j >= 0) vs.splice(j, 1); };
}
function playSample(kind: Sfx, vol: number, combo: number): boolean {
  const bus = (UI_KINDS.has(kind) ? uiBus : sfxBus)!;
  const rate = (k: string) => { const m = MIX[k as keyof typeof MIX]; return m?.climb ? 1 + Math.min(combo * 0.045, 0.8) : 1 + (Math.random() - 0.5) * 2 * (m?.jit ?? 0); };
  if (kind === "shot") {
    const core = pickBuf("shotCore"); if (!core) return false;
    voice("shotCore", core, vol, rate("shotCore"), 0, shotLp ?? bus);
    const mech = pickBuf("shotMech"); if (mech) voice("shotMech", mech, vol, rate("shotMech"), 0.035, bus);
    const tail = pickBuf("shotTail"); if (tail) voice("shotTail", tail, vol * (0.6 + 0.4 * vol), rate("shotTail"), 0.01, shotLp ?? bus);
    return true;
  }
  const buf = pickBuf(kind) ?? (kind === "step" ? pickBuf("stepDirt") : null); if (!buf) return false;
  voice(kind, buf, vol, rate(kind), 0, bus); return true;
}
