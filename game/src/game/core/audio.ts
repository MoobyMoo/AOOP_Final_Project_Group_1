// Game SFX. Recorded samples (ElevenLabs, G1.5 row 02) are the voice of every action; the synth recipes below stay as
// the fallback for any kind with no sample yet and for the frames before the samples finish decoding.
// Mix rules (research/duckov-re/POLISH_FINDINGS.md, the gunshot layering and hit-confirm roles):
//  - one sample per kind is picked at random and never the same take twice in a row, with a small pitch jitter, so
//    repeats don't machine-gun; pickups/cash climb in pitch for repeats inside 0.25 s (research/idle-arcade rule 5)
//  - the shot is three layers mixed at runtime: core crack, slide mechanism a beat later, and the tail
//  - each kind has a voice cap; the oldest voice is cut with a short fade when the cap is hit
//  - three buses (sfx, ui, music) into one compressor so music can duck under combat later
let ctx: AudioContext | null = null, master: GainNode | null = null, noiseBuf: AudioBuffer | null = null;
let sfxBus: GainNode | null = null, uiBus: GainNode | null = null;
export let musicBus: GainNode | null = null;
export function audioCtx() { return ctx; }
/** player volume settings, 0..1 per bus (persisted; the settings menu calls this) */
export const VOLUME = { master: 1, sfx: 1, ui: 1, music: 1, ...JSON.parse(localStorage.getItem("bv_volume") ?? "{}") as Partial<Record<"master" | "sfx" | "ui" | "music", number>> };
const BUS_BASE = { master: 0.7, sfx: 1, ui: 0.8, music: 0.5 };
export function setVolume(bus: keyof typeof VOLUME, v: number) {
  VOLUME[bus] = Math.min(1, Math.max(0, v)); localStorage.setItem("bv_volume", JSON.stringify(VOLUME)); applyVolume();
}
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
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    void loadSamples();
  }
  if (ctx.state === "suspended") void ctx.resume();
}
type Osc = { f: number; f2?: number; wave?: OscillatorType; d: number; g: number; at?: number };
type Nz = { lp: number; lp2?: number; hp?: number; d: number; g: number; at?: number };
type Def = { osc?: Osc[]; nz?: Nz[]; climb?: boolean; jitter?: number };
const DEFS = {
  shot: { nz: [{ lp: 5200, lp2: 900, hp: 120, d: 0.16, g: 0.9 }], osc: [{ f: 140, f2: 45, wave: "sine", d: 0.14, g: 0.7 }], jitter: 0.06 },
  shell: { osc: [{ f: 3100, f2: 2600, wave: "triangle", d: 0.05, g: 0.08, at: 0.22 }, { f: 2700, f2: 2300, wave: "triangle", d: 0.04, g: 0.05, at: 0.33 }], jitter: 0.1 },
  dry: { osc: [{ f: 900, f2: 700, wave: "square", d: 0.03, g: 0.08 }] },
  reloadOut: { nz: [{ lp: 2500, hp: 600, d: 0.05, g: 0.25 }], osc: [{ f: 420, f2: 300, wave: "square", d: 0.04, g: 0.08 }] },
  reloadIn: { nz: [{ lp: 3000, hp: 700, d: 0.05, g: 0.3 }], osc: [{ f: 520, f2: 640, wave: "square", d: 0.05, g: 0.1 }] },
  slide: { nz: [{ lp: 4000, hp: 900, d: 0.08, g: 0.35 }], osc: [{ f: 700, f2: 1100, wave: "square", d: 0.06, g: 0.07, at: 0.04 }] },
  swing: { nz: [{ lp: 1800, lp2: 600, hp: 300, d: 0.14, g: 0.3 }], jitter: 0.08 },
  bonk: { osc: [{ f: 260, f2: 120, wave: "triangle", d: 0.12, g: 0.6 }, { f: 820, f2: 600, wave: "sine", d: 0.08, g: 0.25 }], nz: [{ lp: 2200, d: 0.05, g: 0.4 }], jitter: 0.07 },
  hit: { osc: [{ f: 520, f2: 300, wave: "square", d: 0.05, g: 0.15 }], nz: [{ lp: 3000, hp: 400, d: 0.05, g: 0.35 }], jitter: 0.12 },
  marker: { osc: [{ f: 1800, f2: 1700, wave: "sine", d: 0.04, g: 0.12 }] },
  // G1.5 rows 02/03/14/20 (combat feel): synth stand-ins for the hit-confirm roles, surface impacts, the dash and the
  // single-round insert. The lead replaces these with ElevenLabs samples under the same names.
  hitCrit: { osc: [{ f: 1500, f2: 1900, wave: "triangle", d: 0.06, g: 0.16 }, { f: 2600, f2: 2400, wave: "sine", d: 0.05, g: 0.08, at: 0.02 }], nz: [{ lp: 6000, hp: 1500, d: 0.04, g: 0.25 }], jitter: 0.04 },
  kill: { osc: [{ f: 880, f2: 520, wave: "triangle", d: 0.12, g: 0.2 }, { f: 1320, f2: 1100, wave: "sine", d: 0.1, g: 0.08, at: 0.04 }] },
  killCrit: { osc: [{ f: 1320, f2: 1760, wave: "triangle", d: 0.1, g: 0.2 }, { f: 1760, f2: 2640, wave: "sine", d: 0.18, g: 0.12, at: 0.06 }], nz: [{ lp: 7000, hp: 2000, d: 0.06, g: 0.2 }] },
  impactDirt: { nz: [{ lp: 900, lp2: 300, hp: 80, d: 0.08, g: 0.22 }], jitter: 0.15 },
  impactWood: { nz: [{ lp: 2200, hp: 300, d: 0.06, g: 0.25 }], osc: [{ f: 260, f2: 180, wave: "triangle", d: 0.06, g: 0.12 }], jitter: 0.12 },
  impactMetal: { osc: [{ f: 2400, f2: 2100, wave: "triangle", d: 0.12, g: 0.1 }, { f: 3700, f2: 3500, wave: "sine", d: 0.09, g: 0.06 }], nz: [{ lp: 8000, hp: 2500, d: 0.04, g: 0.25 }], jitter: 0.1 },
  impactFoliage: { nz: [{ lp: 3500, lp2: 1200, hp: 900, d: 0.1, g: 0.16 }], jitter: 0.2 },
  impactStone: { nz: [{ lp: 4000, hp: 700, d: 0.05, g: 0.3 }], osc: [{ f: 900, f2: 600, wave: "square", d: 0.03, g: 0.05 }], jitter: 0.12 },
  dash: { nz: [{ lp: 4200, lp2: 900, hp: 600, d: 0.2, g: 0.32 }], osc: [{ f: 520, f2: 1300, wave: "sine", d: 0.12, g: 0.08 }] },
  reloadRound: { nz: [{ lp: 3200, hp: 900, d: 0.04, g: 0.25 }], osc: [{ f: 700, f2: 820, wave: "square", d: 0.03, g: 0.06 }], jitter: 0.08 },
  ko: { osc: [{ f: 700, f2: 180, wave: "triangle", d: 0.35, g: 0.35 }, { f: 1400, f2: 2200, wave: "sine", d: 0.25, g: 0.12, at: 0.12 }] },
  hurt: { osc: [{ f: 300, f2: 110, wave: "sawtooth", d: 0.22, g: 0.28 }], nz: [{ lp: 1200, d: 0.12, g: 0.4 }] },
  roll: { nz: [{ lp: 900, lp2: 300, d: 0.22, g: 0.35 }], osc: [{ f: 200, f2: 320, wave: "sine", d: 0.12, g: 0.12 }] },
  step: { nz: [{ lp: 700, hp: 150, d: 0.04, g: 0.08 }], jitter: 0.2 },
  crateTick: { osc: [{ f: 600, wave: "triangle", d: 0.03, g: 0.06 }], climb: true },
  crate: { nz: [{ lp: 1400, hp: 200, d: 0.18, g: 0.5 }], osc: [{ f: 180, f2: 90, wave: "triangle", d: 0.15, g: 0.3 }] },
  pop: { osc: [{ f: 660, f2: 990, wave: "sine", d: 0.1, g: 0.25 }], climb: true },
  rare: { osc: [{ f: 660, wave: "sine", d: 0.3, g: 0.2 }, { f: 990, wave: "sine", d: 0.3, g: 0.18, at: 0.08 }, { f: 1320, wave: "sine", d: 0.45, g: 0.18, at: 0.16 }] },
  pick: { osc: [{ f: 520, f2: 780, wave: "triangle", d: 0.07, g: 0.2 }], climb: true },
  full: { osc: [{ f: 220, f2: 180, wave: "square", d: 0.12, g: 0.08 }] },
  throw: { nz: [{ lp: 2400, lp2: 700, hp: 500, d: 0.2, g: 0.3 }], osc: [{ f: 500, f2: 900, wave: "triangle", d: 0.1, g: 0.08 }] },
  whirr: { osc: [{ f: 300, f2: 340, wave: "triangle", d: 0.1, g: 0.05 }] },
  windup: { osc: [{ f: 140, f2: 260, wave: "sawtooth", d: 0.5, g: 0.12 }] },
  slam: { osc: [{ f: 90, f2: 35, wave: "sine", d: 0.4, g: 0.9 }], nz: [{ lp: 800, lp2: 200, d: 0.35, g: 0.7 }] },
  roar: { osc: [{ f: 160, f2: 90, wave: "sawtooth", d: 0.9, g: 0.35 }, { f: 240, f2: 130, wave: "sawtooth", d: 0.9, g: 0.2 }], nz: [{ lp: 900, d: 0.8, g: 0.4 }] },
  thunk: { osc: [{ f: 110, f2: 50, wave: "sine", d: 0.3, g: 0.9 }], nz: [{ lp: 1500, lp2: 300, d: 0.25, g: 0.6 }] },
  notice: { osc: [{ f: 880, f2: 1320, wave: "square", d: 0.08, g: 0.1 }] },
  snatch: { osc: [{ f: 900, f2: 500, wave: "square", d: 0.15, g: 0.12 }] },
  tick: { osc: [{ f: 1000, wave: "sine", d: 0.05, g: 0.12 }] },
  extract: { osc: [{ f: 523, wave: "triangle", d: 0.25, g: 0.2 }, { f: 659, wave: "triangle", d: 0.25, g: 0.2, at: 0.1 }, { f: 784, wave: "triangle", d: 0.45, g: 0.22, at: 0.2 }] },
  cash: { osc: [{ f: 1320, f2: 1980, wave: "sine", d: 0.06, g: 0.14 }], climb: true },
  buy: { osc: [{ f: 523, wave: "triangle", d: 0.12, g: 0.2 }, { f: 784, wave: "triangle", d: 0.2, g: 0.2, at: 0.08 }], nz: [{ lp: 5000, hp: 2000, d: 0.08, g: 0.15 }] },
  nope: { osc: [{ f: 200, f2: 150, wave: "sawtooth", d: 0.14, g: 0.1 }] },
  heal: { osc: [{ f: 400, f2: 800, wave: "sine", d: 0.3, g: 0.2 }] },
  ui: { osc: [{ f: 700, wave: "triangle", d: 0.04, g: 0.1 }] },
  door: { nz: [{ lp: 600, d: 0.4, g: 0.5 }], osc: [{ f: 80, f2: 60, wave: "sine", d: 0.4, g: 0.4 }] },
} satisfies Record<string, Def>;
export type Sfx = keyof typeof DEFS;
const combo: Record<string, { n: number; t: number }> = {};
/** play a sound; vol scales it (e.g. by distance) */
export function sfx(kind: Sfx, vol = 1) {
  if (!ctx || !master || vol <= 0.01) return;
  const now = ctx.currentTime, def = DEFS[kind] as Def;
  const c = (combo[kind] ??= { n: 0, t: 0 }); c.n = now - c.t < 0.25 ? c.n + 1 : 0; c.t = now;
  if (playSample(kind, vol, c.n)) return;
  const pitch = def.climb ? 1 + Math.min(c.n * 0.045, 0.8) : 1 + (Math.random() - 0.5) * 2 * (def.jitter ?? 0);
  const bus = (UI_KINDS.has(kind) ? uiBus : sfxBus)!;
  for (const o of def.osc ?? []) {
    const t0 = now + (o.at ?? 0), osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.wave ?? "sine"; osc.frequency.setValueAtTime(o.f * pitch, t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2 * pitch, t0 + o.d);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(o.g * vol, t0 + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.d);
    osc.connect(g).connect(bus); osc.start(t0); osc.stop(t0 + o.d + 0.03);
  }
  for (const n of def.nz ?? []) {
    const t0 = now + (n.at ?? 0), src = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf; src.playbackRate.value = pitch;
    lp.type = "lowpass"; lp.frequency.setValueAtTime(n.lp, t0); if (n.lp2) lp.frequency.exponentialRampToValueAtTime(n.lp2, t0 + n.d);
    let node: AudioNode = src.connect(lp);
    if (n.hp) { const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = n.hp; node = node.connect(hp); }
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(n.g * vol, t0 + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.d);
    node.connect(g).connect(bus); src.start(t0, Math.random() * 0.5); src.stop(t0 + n.d + 0.03);
  }
}

// ---- samples ----
/** per-kind mix: gain (after the offline loudness normalise), pitch jitter, voice cap, optional hard length cap */
type Mix = { g: number; jit?: number; cap?: number; max?: number; climb?: boolean };
const MIX: Partial<Record<Sfx | "shotCore" | "shotMech" | "shotTail", Mix>> = {
  shotCore: { g: 0.42, jit: 0.05, cap: 6, max: 0.9 }, shotMech: { g: 0.22, jit: 0.06, cap: 4, max: 0.35 }, shotTail: { g: 0.25, jit: 0.04, cap: 3, max: 1.4 },
  shell: { g: 0.25, jit: 0.1, cap: 3, max: 0.6 }, dry: { g: 0.5, cap: 1 }, reloadOut: { g: 0.6, cap: 1 }, reloadIn: { g: 0.65, cap: 1 },
  slide: { g: 0.65, cap: 1 }, reloadRound: { g: 0.5, jit: 0.06, cap: 2 },
  hit: { g: 0.55, jit: 0.08, cap: 4, max: 0.4 }, hitCrit: { g: 0.7, jit: 0.04, cap: 3, max: 0.5 }, kill: { g: 0.7, cap: 2, max: 0.8 }, killCrit: { g: 0.8, cap: 2, max: 1.0 },
  ko: { g: 0.6, jit: 0.05, cap: 2, max: 1.2 }, bonk: { g: 0.85, jit: 0.06, cap: 2, max: 0.7 }, swing: { g: 0.5, jit: 0.08, cap: 2, max: 0.5 },
  impactDirt: { g: 0.35, jit: 0.12, cap: 4, max: 0.4 }, impactWood: { g: 0.4, jit: 0.1, cap: 4, max: 0.45 }, impactMetal: { g: 0.35, jit: 0.08, cap: 3, max: 0.6 },
  impactFoliage: { g: 0.3, jit: 0.15, cap: 3, max: 0.45 }, impactStone: { g: 0.4, jit: 0.1, cap: 4, max: 0.45 },
  dash: { g: 0.55, jit: 0.05, cap: 1, max: 0.6 }, hurt: { g: 0.7, jit: 0.06, cap: 1, max: 0.7 }, heal: { g: 0.5, cap: 1, max: 1.5 }, step: { g: 0.18, jit: 0.15, cap: 2, max: 0.35 },
  windup: { g: 0.6, cap: 2, max: 1.0 }, throw: { g: 0.5, jit: 0.06, cap: 2, max: 0.8 }, roar: { g: 0.85, cap: 1, max: 2.5 }, slam: { g: 1.0, cap: 1, max: 1.5 },
  notice: { g: 0.45, cap: 2, max: 0.7 }, snatch: { g: 0.5, cap: 1, max: 0.7 }, thunk: { g: 0.8, cap: 2, max: 1.0 },
  crate: { g: 0.55, cap: 1, max: 1.2 }, crateTick: { g: 0.3, cap: 2, max: 0.35, climb: true }, door: { g: 0.55, cap: 2, max: 1.5 },
  extract: { g: 0.7, cap: 1, max: 3 }, tick: { g: 0.35, cap: 1, max: 0.3 }, whirr: { g: 0.35, cap: 1, max: 1.0 },
  pick: { g: 0.45, cap: 3, max: 0.4, climb: true }, rare: { g: 0.6, cap: 1, max: 2 }, cash: { g: 0.45, cap: 3, max: 0.8, climb: true }, buy: { g: 0.55, cap: 1, max: 1.2 },
  ui: { g: 0.35, cap: 2, max: 0.25 }, pop: { g: 0.4, cap: 3, max: 0.4, climb: true }, nope: { g: 0.4, cap: 1, max: 0.5 },
};
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
  } catch (e) { console.warn("sfx samples unavailable, synth fallback", e); }
}
function pickBuf(kind: string): AudioBuffer | null {
  const list = BUFS[kind]; if (!list?.length) return null;
  let i = Math.floor(Math.random() * list.length);
  if (list.length > 1 && i === last[kind]) i = (i + 1 + Math.floor(Math.random() * (list.length - 1))) % list.length;
  last[kind] = i; return list[i];
}
function voice(kind: string, buf: AudioBuffer, vol: number, rate: number, at: number, bus: GainNode) {
  const m = MIX[kind as keyof typeof MIX] ?? { g: 0.5 }, cap = m.cap ?? 3, vs = (voices[kind] ??= []);
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
    voice("shotCore", core, vol, rate("shotCore"), 0, bus);
    const mech = pickBuf("shotMech"); if (mech) voice("shotMech", mech, vol, rate("shotMech"), 0.035, bus);
    const tail = pickBuf("shotTail"); if (tail) voice("shotTail", tail, vol * (0.6 + 0.4 * vol), rate("shotTail"), 0.01, bus);
    return true;
  }
  const buf = pickBuf(kind); if (!buf) return false;
  voice(kind, buf, vol, rate(kind), 0, bus); return true;
}
