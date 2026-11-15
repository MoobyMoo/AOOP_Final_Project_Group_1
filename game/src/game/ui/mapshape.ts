// The map is the shape of the level, not a rectangle (map v4, Moo: "their map is not just a rectangle"); map v5 makes
// its edge Duckov's (frames/m-map: the land feathers into a deep navy-teal void, #051B2E; no ink edge, no paper).
// Duckov's display (MiniMapDisplayEntry: a plain UI Image of the per-subscene sprite, tinted white; no Mask, no frame)
// takes its outline from the texture's alpha, so the land floats on the dark. We do the same at bake time:
//   1. a signed field on a 0.5 u grid: > 0 inside the piece: the walkable outline (world/map LAND) grown by a sliver of
//      sea along coast and river edges and a rim along cliffs and jungle, roughened with value noise.
//   2. the closed north (G1.5 demo scope): past the demo edge the land loses its colour, darkens and fades into the
//      same navy void, its far edge a slow ragged line (no torn paper).
//   3. one pass over the baked pixels: the land darkens toward navy over its last few metres and its alpha feathers
//      out, so it sinks into the void the way Duckov's island does.
// The underground is a floor plan (blueprint() below): slate-cyan walls over dark teal rooms, unpowered rooms dark.
// All of it runs once per level at load (mapbake.ts); nothing per frame.
import { edgeDist } from "../world/grid";
import { LAND } from "../world/map/grove";
import { segDist, type Pt } from "../world/map/types";
import type { MapFrame } from "./mapbake";

export type Closed = { edge: Pt[]; poly: Pt[] };
/** the piece's shape, kept with the image: the field for hit tests, and the outline in image px for framing */
export type MapShape = { at: (x: number, z: number) => number; outline: Float32Array; box: { l: number; t: number; r: number; b: number } };

const STEP = 0.5;            // field grid, world units
const SEA = 6.0;             // shallow water kept off the coast
const RIM = 2.6;             // jungle / cliff kept past the walkable line (the tree wall), on average
const RIM_SWAY = 2.0;        // ... swaying in and out along the side, so a forest edge never reads as a ruler
const CAVE_RIM = 2.5;        // a pin may land this far outside the grotto's rooms
const ROUGH = 0.85;          // edge irregularity, world units
const TORN = 13;             // the closed land ends this far north of the demo edge
const FADE = 10.0;           // ... and has faded into the void by about here
const NAVY = [5, 27, 46] as const;              // Duckov's void (#051B2E), map.css --void
const FEATHER = 2.4;         // the land's alpha feathers out over this many units

function hash(i: number, j: number, s: number) {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(s, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** smooth value noise in -1..1 */
function vnoise(x: number, z: number, s: number) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(i, j, s), b = hash(i + 1, j, s), c = hash(i, j + 1, s), d = hash(i + 1, j + 1, s);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}
const rough = (x: number, z: number) => ROUGH * (0.65 * vnoise(x / 7.5, z / 7.5, 11) + 0.35 * vnoise(x / 2.6, z / 2.6, 12));
// the tear: a slow drift (so it does not run parallel to the demo edge), then the rip's own jags
const tornN = (x: number, z: number) => 2.4 * vnoise(x / 30, z / 30, 20) + 1.1 * vnoise(x / 4.2, z / 4.2, 21) + 0.45 * vnoise(x / 1.3, z / 1.3, 22);
const sstep = (a: number, b: number, v: number) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

/** f: the piece without the tear; t: the tear term (TORN - c + smooth noise); c: distance north of the demo edge;
 *  s: signed distance to the walkable outline; wl: how much of the water-lining a point gets (coast, not jungle) */
type Field = { x0: number; z0: number; nx: number; nz: number; f: Float32Array; s: Float32Array; wl: Float32Array; c: Float32Array | null; t: Float32Array | null };
function bil(g: Float32Array, F: Field, x: number, z: number) {
  let gx = (x - F.x0) / STEP, gz = (z - F.z0) / STEP;
  gx = Math.min(F.nx - 1.001, Math.max(0, gx)); gz = Math.min(F.nz - 1.001, Math.max(0, gz));
  const i = gx | 0, j = gz | 0, u = gx - i, v = gz - j, k = j * F.nx + i;
  const a = g[k], b = g[k + 1], c = g[k + F.nx], d = g[k + F.nx + 1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** +1 inside / -1 outside a polygon for every grid node, by scanline (one crossing list per row, not one test per node) */
function signs(poly: readonly (readonly [number, number, ...unknown[]])[], F: Pick<Field, "x0" | "z0" | "nx" | "nz">) {
  const out = new Int8Array(F.nx * F.nz).fill(-1), xs: number[] = [];
  for (let j = 0; j < F.nz; j++) {
    const z = F.z0 + j * STEP; xs.length = 0;
    for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
      const za = poly[a][1], zb = poly[b][1];
      if ((za > z) !== (zb > z)) xs.push(poly[a][0] + ((z - za) * (poly[b][0] - poly[a][0])) / (zb - za));
    }
    xs.sort((p, q) => p - q);
    for (let q = 0; q + 1 < xs.length; q += 2) {
      const i0 = Math.max(0, Math.ceil((xs[q] - F.x0) / STEP)), i1 = Math.min(F.nx - 1, Math.floor((xs[q + 1] - F.x0) / STEP));
      for (let i = i0; i <= i1; i++) out[j * F.nx + i] = 1;
    }
  }
  return out;
}
/** distance to segment a-b written into `d` (min) for the nodes within `band` of it; farther nodes keep `band` */
function splat(d: Float32Array, F: Pick<Field, "x0" | "z0" | "nx" | "nz">, ax: number, az: number, bx: number, bz: number, band: number) {
  const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - band - F.x0) / STEP)), i1 = Math.min(F.nx - 1, Math.ceil((Math.max(ax, bx) + band - F.x0) / STEP));
  const j0 = Math.max(0, Math.floor((Math.min(az, bz) - band - F.z0) / STEP)), j1 = Math.min(F.nz - 1, Math.ceil((Math.max(az, bz) + band - F.z0) / STEP));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = j * F.nx + i, q = segDist(F.x0 + i * STEP, F.z0 + j * STEP, ax, az, bx, bz); if (q < d[k]) d[k] = q; }
}

/** the field for one level's frame (surface: land + sea sliver + closed north; underground: chambers) */
function buildField(f: MapFrame, closed?: Closed): Field {
  const nx = Math.ceil((f.maxX - f.minX) / STEP) + 2, nz = Math.ceil((f.maxZ - f.minZ) / STEP) + 2, x0 = f.minX - STEP / 2, z0 = f.minZ - STEP / 2;
  const N = nx * nz, F: Field = { x0, z0, nx, nz, f: new Float32Array(N), s: new Float32Array(N), wl: new Float32Array(N), c: closed ? new Float32Array(N) : null, t: closed ? new Float32Array(N) : null };
  // distances to coast/river edges and to cliff/jungle edges (an edge takes its start's kind), each edge splatted only
  // into the band around it: the field only matters near the outline (farther, its sign is all that is read)
  const BAND = 10, uC = new Float32Array(N).fill(BAND), uO = new Float32Array(N).fill(BAND), inLand = signs(LAND, F);
  for (let a = 0; a < LAND.length; a++) {
    const p = LAND[a], q = LAND[(a + 1) % LAND.length];
    splat(p[2] === "coast" || p[2] === "river" ? uC : uO, F, p[0], p[1], q[0], q[1], BAND);
  }
  const CB = 17, cd = closed ? new Float32Array(N).fill(CB) : null, inClosed = closed ? signs(closed.poly, F) : null;
  if (closed && cd) for (let a = 0; a < closed.edge.length - 1; a++) splat(cd, F, closed.edge[a][0], closed.edge[a][1], closed.edge[a + 1][0], closed.edge[a + 1][1], CB);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * STEP, z = z0 + j * STEP, k = j * nx + i, inside = inLand[k] > 0, m = Math.min(uC[k], uO[k]), s = inside ? m : -m;
    F.s[k] = s;
    if (m >= BAND) F.f[k] = inside ? BAND : -BAND; // far from the outline: plainly in or out
    else {
      // outside: the union of a sea band off the coast and a rim off the rest (continuous where the kinds meet)
      const rim = RIM + RIM_SWAY * vnoise(x / 21, z / 21, 13), sea = SEA + 0.9 * vnoise(x / 13, z / 13, 14);
      F.f[k] = (inside ? s + rim : Math.max(sea - uC[k], rim - uO[k])) + rough(x, z);
      F.wl[k] = inside ? 0 : Math.min(1, Math.max(0, (uO[k] - uC[k]) / 3));
    }
    if (F.c && F.t && cd && inClosed) { const c = inClosed[k] > 0 ? cd[k] : -cd[k]; F.c[k] = c; F.t[k] = Math.abs(c - TORN) < 7 ? TORN - c + tornN(x, z) : TORN - c; }
  }
  return F;
}

/** the piece's field at a world point, smooth terms only (hit tests, framing, the shadow) */
function fieldAt(F: Field, x: number, z: number) {
  const v = bil(F.f, F, x, z);
  return F.t ? Math.min(v, bil(F.t, F, x, z)) : v;
}

/** cut the baked surface image to the island's shape, in place. Returns the shape for the map view */
export function cutout(cv: HTMLCanvasElement, f: MapFrame, closed?: Closed): MapShape {
  const F = buildField(f, closed), w = cv.width, h = cv.height, ppu = w / (f.maxX - f.minX);
  const x = cv.getContext("2d", { willReadFrequently: true })!, img = x.getImageData(0, 0, w, h), D = img.data;
  const { nx: GX, f: Ff, c: Fc, t: Ft } = F, fx0 = F.x0, fz0 = F.z0, inv = 1 / STEP;
  const ci = new Int32Array(w), cu = new Float32Array(w);
  for (let col = 0; col < w; col++) { const g = Math.min(F.nx - 1.001, Math.max(0, (f.minX + (col + 0.5) / ppu - fx0) * inv)); ci[col] = g | 0; cu[col] = g - (g | 0); }
  const grow = (z: number) => Math.min(F.nz - 1.001, Math.max(0, (z - fz0) * inv));
  // one row per call: a small hot function gets optimised quickly (one 2.8 M iteration loop body did not)
  const shadeRow = (row: number) => {
    const z = f.minZ + (row + 0.5) / ppu, gz = grow(z), j = gz | 0, v = gz - j, rowK = j * GX;
    for (let col = 0; col < w; col++) {
      const p = (row * w + col) * 4, k = rowK + ci[col], u = cu[col];
      const w00 = (1 - u) * (1 - v), w10 = u * (1 - v), w01 = (1 - u) * v, w11 = u * v, k2 = k + GX;
      let fv = Ff[k] * w00 + Ff[k + 1] * w10 + Ff[k2] * w01 + Ff[k2 + 1] * w11, c = -1e9;
      if (Ft && Fc && Fc[k] > -2) { // south of the demo edge by 2 u or more, the fade cannot reach
        fv = Math.min(fv, Ft[k] * w00 + Ft[k + 1] * w10 + Ft[k2] * w01 + Ft[k2 + 1] * w11);
        c = Fc[k] * w00 + Fc[k + 1] * w10 + Fc[k2] * w01 + Fc[k2 + 1] * w11;
      }
      const alpha = sstep(-FEATHER, 0.4, fv);
      if (alpha <= 0) { D[p + 3] = 0; continue; }
      let r = D[p], g = D[p + 1], b = D[p + 2];
      // the closed north: the colour drains, then the land darkens into the void
      if (c > 0.4) {
        const fade = sstep(0.4, FADE, c), L = 0.3 * r + 0.59 * g + 0.11 * b, d1 = Math.min(1, fade * 1.6) * 0.85;
        r += (L - r) * d1; g += (L - g) * d1; b += (L - b) * d1;
        const d2 = Math.pow(fade, 0.8) * 0.9; r += (NAVY[0] - r) * d2; g += (NAVY[1] - g) * d2; b += (NAVY[2] - b) * d2;
      }
      // the last few metres of land sink toward the void
      const e = (1 - sstep(0, 3.5, fv)) * 0.6; r += (NAVY[0] - r) * e; g += (NAVY[1] - g) * e; b += (NAVY[2] - b) * e;
      D[p] = r; D[p + 1] = g; D[p + 2] = b; D[p + 3] = Math.round(alpha * 255);
    }
  };
  for (let row = 0; row < h; row++) shadeRow(row);
  x.putImageData(img, 0, 0);
  return shapeOf((wx, wz) => fieldAt(F, wx, wz), f, ppu);
}
/** the piece's shape from its field: the outline in image px (cells inside with a neighbour outside), for fitting the
 *  view to the piece, and its box for clamping the pan */
function shapeOf(at: (x: number, z: number) => number, f: MapFrame, ppu: number): MapShape {
  const pts: number[] = []; let l = 1e9, t = 1e9, rr = -1e9, bb = -1e9;
  const cs = 1.0, mw = Math.ceil((f.maxX - f.minX) / cs), mh = Math.ceil((f.maxZ - f.minZ) / cs), inn = new Uint8Array(mw * mh);
  for (let j = 0; j < mh; j++) for (let i = 0; i < mw; i++) inn[j * mw + i] = at(f.minX + (i + 0.5) * cs, f.minZ + (j + 0.5) * cs) > 0 ? 1 : 0;
  for (let j = 0; j < mh; j++) for (let i = 0; i < mw; i++) {
    if (!inn[j * mw + i]) continue;
    if (i > 0 && i < mw - 1 && j > 0 && j < mh - 1 && inn[j * mw + i - 1] && inn[j * mw + i + 1] && inn[(j - 1) * mw + i] && inn[(j + 1) * mw + i]) continue;
    const px = (i + 0.5) * cs * ppu, py = (j + 0.5) * cs * ppu; pts.push(px, py);
    l = Math.min(l, px); rr = Math.max(rr, px); t = Math.min(t, py); bb = Math.max(bb, py);
  }
  return { at, outline: new Float32Array(pts), box: { l, t, r: rr, b: bb } };
}

// ---------------------------------------------------------------- the underground: a floor plan (map v5)
// Duckov draws its underground floors (frames/m-map 2cmx1ERrVvw, J-Lab) as a dark plan: crisp light slate-cyan wall
// lines (#6C7F85) round dark teal rooms (#0D2E3B / #14232B), a black wall mass, and the void beyond (#000F1D);
// unpowered rooms stay dark. Ours is drawn from the grotto's own carved shapes (grid edgeDist): each chamber and
// corridor a room, lit a shade brighter toward its middle with a faint floor rule, a thick black wall mass round it
// and a crisp slate-cyan line on its inner face; rooms the demo has shut (the `lit` test) unpowered: near-black, a
// dim dashed line. Nothing is captured, so it is crisp at every zoom and costs a few ms.
const BP = { room: [13, 46, 59], roomHi: [26, 66, 80], rule: [20, 56, 70], mass: [2, 9, 14], wall: [108, 127, 133], wallHi: [150, 176, 182], dark: [6, 15, 22], darkWall: [40, 56, 62] } as const;
export function blueprint(f: MapFrame, w: number, h: number, lit: (x: number, z: number) => boolean): { canvas: HTMLCanvasElement; shape: MapShape } {
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const x = cv.getContext("2d", { willReadFrequently: true })!, img = x.createImageData(w, h), D = img.data, ppu = w / (f.maxX - f.minX);
  // the field on a 0.25 u grid (bilinear per pixel), and whether each node is powered
  const S = 0.25, nx = Math.ceil((f.maxX - f.minX) / S) + 2, nz = Math.ceil((f.maxZ - f.minZ) / S) + 2;
  const fd = new Float32Array(nx * nz), on = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const wx = f.minX + (i - 0.5) * S, wz = f.minZ + (j - 0.5) * S, k = j * nx + i; fd[k] = edgeDist(wx, wz); on[k] = lit(wx, wz) ? 1 : 0; }
  const MASS = 2.2; // the black wall mass round every room, in u
  const set = (p: number, c: readonly number[]) => { D[p] = c[0]; D[p + 1] = c[1]; D[p + 2] = c[2]; };
  const mix = (p: number, c: readonly number[], a: number) => { D[p] += (c[0] - D[p]) * a; D[p + 1] += (c[1] - D[p + 1]) * a; D[p + 2] += (c[2] - D[p + 2]) * a; };
  for (let row = 0; row < h; row++) {
    const wz = f.minZ + (row + 0.5) / ppu, gz = (wz - f.minZ) / S + 0.5, j = Math.min(nz - 2, Math.max(0, gz | 0)), v = gz - j;
    for (let col = 0; col < w; col++) {
      const wx = f.minX + (col + 0.5) / ppu, p = (row * w + col) * 4;
      const gx = (wx - f.minX) / S + 0.5, i = Math.min(nx - 2, Math.max(0, gx | 0)), u = gx - i, k = j * nx + i;
      const d = fd[k] * (1 - u) * (1 - v) + fd[k + 1] * u * (1 - v) + fd[k + nx] * (1 - u) * v + fd[k + nx + 1] * u * v;
      if (d < -MASS - 0.6) { D[p + 3] = 0; continue; }
      const pw = on[k] + on[k + 1] + on[k + nx] + on[k + nx + 1] >= 2, dp = d * ppu;
      set(p, BP.mass); D[p + 3] = Math.round(sstep(-MASS - 0.6, -MASS + 0.2, d) * 255); // the wall mass, feathered out
      if (d > 0) { // the floor: lit rooms brighter toward the middle, a faint 2 u floor rule
        const a = Math.min(1, dp / 1.2);
        if (pw) {
          set(p, BP.room); mix(p, BP.roomHi, Math.min(1, d / 7) * 0.8);
          const mx = Math.abs(wx / 2 - Math.round(wx / 2)) * 2 * ppu, mz = Math.abs(wz / 2 - Math.round(wz / 2)) * 2 * ppu;
          if (Math.min(mx, mz) < 0.6) mix(p, BP.rule, 0.7);
        } else set(p, BP.dark);
        if (a < 1) mix(p, BP.mass, 1 - a);
      }
      // the inner wall line: crisp, a touch brighter on its room side; unpowered rooms get a dim dashed one
      const lw = Math.max(0, 1 - Math.abs(dp - 1.2) / 1.3);
      if (lw > 0) { if (pw) mix(p, dp > 1.2 ? BP.wallHi : BP.wall, lw); else if ((Math.floor((wx + wz) * 1.4) & 1) === 0) mix(p, BP.darkWall, lw); }
    }
  }
  x.putImageData(img, 0, 0);
  return { canvas: cv, shape: shapeOf((wx, wz) => edgeDist(wx, wz) + CAVE_RIM, f, ppu) };
}
