// Ground detail layers (G1.5 row 09). POLISH_FINDINGS 7: Duckov blends up to four terrain layers, each a 512² tileable
// diffuse (plus normal) texture repeating every 4 m; decals carry the local marks. Our ground stays a vertex-coloured
// height field (the colours are the art direction's), and this adds the texture detail it was missing: one 512² tileable
// map, one layer per channel, made here in code (no painted or bought textures: WORKFLOW "code-built visuals"):
//   R sand   wind ripples and grain        G dirt   pebbles, grit and hairline cracks
//   B turf   short blade strokes           A stone  worn cobble cells with dark joints
// Each channel is centred on 128 (0.5), so the shader's detail term averages to no change: it adds texture, not light,
// and the clip/lumastats checks keep reading the same mean.
import * as THREE from "three";

const N = 512, TAU = Math.PI * 2;
/** tileable seeded random */
function rng(seed: number) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let v = Math.imul(s ^ (s >>> 15), s | 1); v ^= v + Math.imul(v ^ (v >>> 7), v | 61); return ((v ^ (v >>> 14)) >>> 0) / 4294967296; }; }
/** periodic smooth noise on the 512 tile: a sum of sines with whole-number frequencies (tiles exactly) */
function waves(r: () => number, n: number, fmin: number, fmax: number) {
  const w = Array.from({ length: n }, () => ({ fx: Math.round(fmin + r() * (fmax - fmin)) * (r() < 0.5 ? -1 : 1), fy: Math.round(fmin + r() * (fmax - fmin)), p: r() * TAU, a: 0.5 + r() }));
  const sum = w.reduce((s, q) => s + q.a, 0);
  return (x: number, y: number) => w.reduce((s, q) => s + q.a * Math.sin(TAU * (q.fx * x + q.fy * y) / N + q.p), 0) / sum;
}
/** draw on a 512² canvas and wrap whatever crosses an edge onto the far side */
function canvas(base: number, draw: (x: CanvasRenderingContext2D, wrap: (f: (dx: number, dy: number) => void) => void) => void) {
  const c = document.createElement("canvas"); c.width = c.height = N; const x = c.getContext("2d")!;
  x.fillStyle = `rgb(${base},${base},${base})`; x.fillRect(0, 0, N, N);
  draw(x, (f) => { for (const dy of [-N, 0, N]) for (const dx of [-N, 0, N]) f(dx, dy); });
  return x.getImageData(0, 0, N, N).data;
}
let TEX: THREE.DataTexture | null = null;
/** each layer's mean (0..1): the shader subtracts it, so the detail never shifts a ground's average value */
export const DETAIL_MEAN = new THREE.Vector4(0.5, 0.5, 0.5, 0.5);
export function groundDetail(): THREE.DataTexture {
  if (TEX) return TEX;
  const r = rng(91511), out = new Uint8Array(N * N * 4);
  // R: sand. Ripples along a wandering wind direction, a little grain
  const warp = waves(r, 5, 1, 4), ripple = waves(r, 3, 9, 14);
  // G: dirt. Pebbles with a lit top and a shadowed bottom, grit, a few hairline cracks
  const dirt = canvas(128, (x, wrap) => {
    for (let i = 0; i < 1000; i++) {
      const px = r() * N, py = r() * N, rad = 1.4 + r() * r() * 8, dark = 70 + r() * 40, lit = 175 + r() * 30;
      wrap((dx, dy) => { x.fillStyle = `rgb(${dark},${dark},${dark})`; x.beginPath(); x.ellipse(px + dx, py + dy + rad * 0.25, rad, rad * 0.75, 0, 0, TAU); x.fill();
        x.fillStyle = `rgb(${lit},${lit},${lit})`; x.beginPath(); x.ellipse(px + dx - rad * 0.2, py + dy - rad * 0.2, rad * 0.62, rad * 0.45, 0, 0, TAU); x.fill(); });
    }
    x.lineWidth = 1.6; x.strokeStyle = "rgb(78,78,78)";
    for (let i = 0; i < 26; i++) { let px = r() * N, py = r() * N, a = r() * TAU; const pts: [number, number][] = [[px, py]]; for (let k = 0; k < 6; k++) { a += (r() - 0.5) * 1.2; px += Math.cos(a) * 9; py += Math.sin(a) * 9; pts.push([px, py]); }
      wrap((dx, dy) => { x.beginPath(); x.moveTo(pts[0][0] + dx, pts[0][1] + dy); for (const [qx, qy] of pts) x.lineTo(qx + dx, qy + dy); x.stroke(); }); }
  });
  // B: turf. Short strokes leaning one way with a few cross-blades, light tips over darker roots
  const turf = canvas(128, (x, wrap) => {
    x.lineCap = "round";
    for (let i = 0; i < 5200; i++) {
      const px = r() * N, py = r() * N, len = 5 + r() * 11, a = -Math.PI / 2 + (r() - 0.5) * 1.1, v = 70 + r() * 130, lw = 1.2 + r() * 1.4;
      wrap((dx, dy) => { x.strokeStyle = `rgb(${v},${v},${v})`; x.lineWidth = lw; x.beginPath(); x.moveTo(px + dx, py + dy); x.lineTo(px + dx + Math.cos(a) * len, py + dy + Math.sin(a) * len); x.stroke(); });
    }
  });
  // A: stone. Worley cells on a 9 x 9 tiling grid: joints dark, faces a touch uneven
  const G9 = 9, cell = N / G9, pts = Array.from({ length: G9 * G9 }, () => [r(), r(), 0.85 + r() * 0.3]);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 4;
    // sand
    const w = warp(x, y) * 40, rp = Math.sin(TAU * ((x * 0.6 + y * 0.8) / N) * 11 + w) * 0.6 + ripple(x, y) * 0.4;
    out[i] = Math.max(0, Math.min(255, 128 + rp * 46 + (r() - 0.5) * 26));
    out[i + 1] = dirt[i] + (r() - 0.5) * 18;
    out[i + 2] = turf[i];
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell); let d1 = 1e9, d2 = 1e9, tone = 1;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const gx = (cx + ox + G9) % G9, gy = (cy + oy + G9) % G9, p = pts[gy * G9 + gx], fx = (cx + ox + p[0]) * cell, fy = (cy + oy + p[1]) * cell, d = Math.hypot(fx - x, fy - y);
      if (d < d1) { d2 = d1; d1 = d; tone = p[2]; } else if (d < d2) d2 = d;
    }
    const joint = Math.min(1, (d2 - d1) / 5);
    out[i + 3] = Math.max(0, Math.min(255, 128 * (0.55 + 0.45 * joint) * tone + 22 + (r() - 0.5) * 14));
  }
  const mean = [0, 0, 0, 0]; for (let i = 0; i < out.length; i++) mean[i & 3] += out[i]; DETAIL_MEAN.set(...(mean.map((m) => m / (N * N) / 255) as [number, number, number, number]));
  const t = new THREE.DataTexture(out, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4; t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true;
  return (TEX = t);
}
