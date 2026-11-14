// Synthesized feedback sounds (no audio files yet). Consecutive sounds of one kind inside 0.25 s
// climb in pitch: pitch = 1 + min(combo * 0.045, 0.8) (research/idle-arcade rule 5).
let ctx: AudioContext | null = null;
const combo: Record<string, { n: number; t: number }> = {};

export function unlockAudio() {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
}

type Kind = "pick" | "drop" | "cash" | "pay" | "unlock" | "sell" | "nope";
const BASE: Record<Kind, { f: number; wave: OscillatorType; d: number; g: number }> = {
  pick: { f: 520, wave: "triangle", d: 0.07, g: 0.16 },
  drop: { f: 440, wave: "triangle", d: 0.07, g: 0.14 },
  cash: { f: 880, wave: "sine", d: 0.06, g: 0.12 },
  pay: { f: 660, wave: "square", d: 0.04, g: 0.05 },
  sell: { f: 990, wave: "sine", d: 0.12, g: 0.14 },
  unlock: { f: 523, wave: "triangle", d: 0.5, g: 0.18 },
  nope: { f: 180, wave: "sawtooth", d: 0.12, g: 0.06 },
};

export function sfx(kind: Kind) {
  if (!ctx) return;
  const now = ctx.currentTime;
  const c = (combo[kind] ??= { n: 0, t: 0 });
  c.n = now - c.t < 0.25 ? c.n + 1 : 0;
  c.t = now;
  const b = BASE[kind];
  const pitch = 1 + Math.min(c.n * 0.045, 0.8);
  const notes = kind === "unlock" ? [1, 1.26, 1.5, 2] : [1];
  notes.forEach((m, i) => {
    const o = ctx!.createOscillator(), g = ctx!.createGain();
    o.type = b.wave;
    const t0 = now + i * 0.07;
    o.frequency.setValueAtTime(b.f * pitch * m, t0);
    if (kind === "pick" || kind === "cash") o.frequency.exponentialRampToValueAtTime(b.f * pitch * m * 1.5, t0 + b.d);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(b.g, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + b.d);
    o.connect(g).connect(ctx!.destination);
    o.start(t0); o.stop(t0 + b.d + 0.02);
  });
}
