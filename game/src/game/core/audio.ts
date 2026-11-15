// Synth placeholder SFX for every G1 action (no files; ElevenLabs only after asking Moo).
// Each sound = layers of an oscillator sweep and/or a filtered noise burst. Repeats inside 0.25 s climb in pitch
// for pickups/cash (research/idle-arcade rule 5); combat sounds get a small random detune instead so they don't machine-gun.
let ctx: AudioContext | null = null, master: GainNode | null = null, noiseBuf: AudioBuffer | null = null;
export function unlockAudio() {
  if (!ctx) {
    ctx = new AudioContext(); master = ctx.createGain(); master.gain.value = 0.55;
    const comp = ctx.createDynamicsCompressor(); master.connect(comp).connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
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
  const pitch = def.climb ? 1 + Math.min(c.n * 0.045, 0.8) : 1 + (Math.random() - 0.5) * 2 * (def.jitter ?? 0);
  for (const o of def.osc ?? []) {
    const t0 = now + (o.at ?? 0), osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.wave ?? "sine"; osc.frequency.setValueAtTime(o.f * pitch, t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2 * pitch, t0 + o.d);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(o.g * vol, t0 + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.d);
    osc.connect(g).connect(master); osc.start(t0); osc.stop(t0 + o.d + 0.03);
  }
  for (const n of def.nz ?? []) {
    const t0 = now + (n.at ?? 0), src = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf; src.playbackRate.value = pitch;
    lp.type = "lowpass"; lp.frequency.setValueAtTime(n.lp, t0); if (n.lp2) lp.frequency.exponentialRampToValueAtTime(n.lp2, t0 + n.d);
    let node: AudioNode = src.connect(lp);
    if (n.hp) { const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = n.hp; node = node.connect(hp); }
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(n.g * vol, t0 + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.d);
    node.connect(g).connect(master); src.start(t0, Math.random() * 0.5); src.stop(t0 + n.d + 0.03);
  }
}
