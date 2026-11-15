// Map v4: the map is the shape of the level, not a rectangle (Moo: "their map is not just a rectangle").
// Duckov's display (MiniMapDisplayEntry: a plain UI Image of the per-subscene sprite, tinted white; no Mask, no frame)
// takes its outline from the texture's alpha, so the island floats on the map board. We do the same at bake time:
//   1. a signed field on a 0.5 u grid: > 0 inside the piece. Surface: the walkable outline (world/map LAND) grown by a
//      sliver of shallow sea along coast and river edges and a thin rim along cliffs and jungle, roughened with value
//      noise so the edge reads hand-cut. Underground: the carved chambers (grid edgeDist) with a rock rim.
//   2. the closed north (G1.5 demo scope): past the demo edge the print fades into the board's fog colour and the
//      piece ends in a torn edge (a second, rougher field term), not a hatched band.
//   3. one pass over the baked pixels: water-lining along the coast, the 25 u grid on the land only, the fade, an ink
//      edge in the game's outline colour (render/shading INK), alpha outside the piece and a soft drop shadow on the
//      board (offset to fall down-screen after the map's camera-yaw rotation).
// All of it runs once per level at load (mapbake.ts); nothing per frame.
import { G } from "../core/state";
import { INK } from "../render/shading";
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
const CAVE_RIM = 1.2;        // rock kept around the grotto
const ROUGH = 0.85;          // edge irregularity, world units
const TORN = 12.5;           // the torn edge, this far north of the demo edge
const FADE = 9.0;            // the print has faded out by here
const DIM = 0.5;             // how far a closed level (the demo's grotto) is washed out
const FOG = [70, 77, 85] as const;              // the closed north: the board's tone (map.css --board #313840), a shade lighter
const TORN_LIP = [118, 124, 128] as const;      // the torn paper's pale fibre lip
const SHADOW = [8, 10, 16] as const;

const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const INK_RGB = hex(INK);

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
const tornFine = (x: number, z: number) => 0.16 * vnoise(x / 0.32, z / 0.32, 23);
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
function buildField(f: MapFrame, under: boolean, closed?: Closed): Field {
  const nx = Math.ceil((f.maxX - f.minX) / STEP) + 2, nz = Math.ceil((f.maxZ - f.minZ) / STEP) + 2, x0 = f.minX - STEP / 2, z0 = f.minZ - STEP / 2;
  const N = nx * nz, F: Field = { x0, z0, nx, nz, f: new Float32Array(N), s: new Float32Array(N), wl: new Float32Array(N), c: closed ? new Float32Array(N) : null, t: closed ? new Float32Array(N) : null };
  if (under) {
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const x = x0 + i * STEP, z = z0 + j * STEP, k = j * nx + i, s = edgeDist(x, z); F.s[k] = s; F.f[k] = s + CAVE_RIM + 0.5 * rough(x, z); }
    return F;
  }
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

/** cut the baked image to the level's shape, in place. Returns the shape for the map view */
/** `dim`: the whole level is closed (the grotto in the demo): washed toward the fog tone like the closed north */
export function cutout(cv: HTMLCanvasElement, f: MapFrame, under: boolean, closed?: Closed, dim = false): MapShape {
  const F = buildField(f, under, closed), w = cv.width, h = cv.height, ppu = w / (f.maxX - f.minX);
  const x = cv.getContext("2d", { willReadFrequently: true })!, img = x.getImageData(0, 0, w, h), D = img.data;
  // the drop shadow falls down-screen and a little right once the map is turned by the camera yaw (mapview matrix)
  const yaw = G.stage.cam.yaw, sx = 0.35, sy = 1, sl = Math.hypot(sx, sy), OFF = 1.35;
  const ox = ((sx * Math.cos(yaw) + sy * Math.sin(yaw)) / sl) * OFF, oz = ((-sx * Math.sin(yaw) + sy * Math.cos(yaw)) / sl) * OFF;
  const inkW = 3.6, gridC = under ? [194, 154, 91] : [30, 24, 20], gridA = under ? 0.14 : 0.2;
  const { nx: GX, f: Ff, s: Fs, wl: Fw, c: Fc, t: Ft } = F, fx0 = F.x0, fz0 = F.z0, inv = 1 / STEP;
  // per column: the field cell and weight (the rows' are found per row); every grid shares them
  const ci = new Int32Array(w), cu = new Float32Array(w), si = new Int32Array(w), su = new Float32Array(w); // si/su: the shadow's source
  const gcol = (x: number, I: Int32Array, U: Float32Array, col: number) => { const g = Math.min(F.nx - 1.001, Math.max(0, (x - fx0) * inv)); I[col] = g | 0; U[col] = g - (g | 0); };
  const gxl = new Float32Array(w); // px to the nearest 25 u grid line, per column
  for (let col = 0; col < w; col++) { const xw = f.minX + (col + 0.5) / ppu; gcol(xw, ci, cu, col); gcol(xw - ox, si, su, col); gxl[col] = Math.abs(xw / 25 - Math.round(xw / 25)) * 25 * ppu; }
  const grow = (z: number) => Math.min(F.nz - 1.001, Math.max(0, (z - fz0) * inv));
  // one row per call: a small hot function gets optimised quickly (one 2.8 M iteration loop body did not)
  const shadeRow = (row: number) => {
    const z = f.minZ + (row + 0.5) / ppu, gz = grow(z), j = gz | 0, v = gz - j, rowK = j * GX;
    const sgz = grow(z - oz), sj = sgz | 0, sv = sgz - sj, sRowK = sj * GX;
    const gzl = Math.abs(z / 25 - Math.round(z / 25)) * 25 * ppu;
    for (let col = 0; col < w; col++) {
      const xw = f.minX + (col + 0.5) / ppu, p = (row * w + col) * 4, k = rowK + ci[col], u = cu[col];
      const w00 = (1 - u) * (1 - v), w10 = u * (1 - v), w01 = (1 - u) * v, w11 = u * v, k2 = k + GX;
      let fv = Ff[k] * w00 + Ff[k + 1] * w10 + Ff[k2] * w01 + Ff[k2 + 1] * w11, c = -1e9, torn = false;
      if (Ft && Fc && Fc[k] > -2) { // south of the demo edge by 2 u or more, neither the fade nor the tear can reach
        let tt = Ft[k] * w00 + Ft[k + 1] * w10 + Ft[k2] * w01 + Ft[k2 + 1] * w11;
        if (tt < fv + 1 && tt < 1.5) tt += tornFine(xw, z); // the paper's fibres, only along the tear
        if (tt < fv) { fv = tt; torn = true; }
        c = Fc[k] * w00 + Fc[k + 1] * w10 + Fc[k2] * w01 + Fc[k2 + 1] * w11;
      }
      const fpx = fv * ppu, alpha = fpx >= 0.5 ? 1 : fpx <= -0.5 ? 0 : fpx + 0.5;
      let r = D[p], g = D[p + 1], b = D[p + 2];
      if (alpha > 0) {
        const s0 = Fs[k], s = s0 > 1 ? s0 : s0 * w00 + Fs[k + 1] * w10 + Fs[k2] * w01 + Fs[k2 + 1] * w11;
        if (s > 0) {
          // the 25 u grid, on the land only (Duckov's technical look, our ledger rule)
          const gd = Math.min(gxl[col], gzl);
          if (gd < 1.4) { const a = gridA * Math.min(1, 1.4 - gd); r += (gridC[0] - r) * a; g += (gridC[1] - g) * a; b += (gridC[2] - b) * a; }
        } else if (!under && s < -0.5) {
          // water-lining: three thin rules following the coast offshore, fading out to sea (an engraved map's coast)
          const wl = Fw[k] * w00 + Fw[k + 1] * w10 + Fw[k2] * w01 + Fw[k2 + 1] * w11;
          if (wl > 0) {
            const o = -s / 1.5, nn = Math.round(o);
            if (nn >= 1 && nn <= 3) { const dpx = Math.abs(o - nn) * 1.5 * ppu, a = Math.max(0, Math.min(1, 1.3 - dpx / 0.9)) * 0.38 * wl * (1 - nn / 4.2); r += (226 - r) * a; g += (244 - g) * a; b += (238 - b) * a; }
          }
        }
        // the closed north: the print loses its colour, then fades into the fog tone
        let fade = 0;
        if (c > 0.4 || dim) {
          fade = dim ? DIM : sstep(0.4, FADE, c);
          const L = 0.3 * r + 0.59 * g + 0.11 * b, d1 = Math.min(1, fade * 1.4) * 0.75;
          r += (L - r) * d1; g += (L - g) * d1; b += (L - b) * d1;
          const fib = (hash(col >> 1, row >> 1, 31) - 0.5) * 6, d2 = Math.pow(fade, 0.85) * 0.93;
          r += (FOG[0] + fib - r) * d2; g += (FOG[1] + fib - g) * d2; b += (FOG[2] + fib - b) * d2;
        }
        if (fpx < inkW * 1.2 + 1) {
          if (torn) {
            // a torn edge has no ink: a pale fibre lip where the paper split
            const a = Math.max(0, 1 - fpx / 2.2) * 0.75; r += (TORN_LIP[0] - r) * a; g += (TORN_LIP[1] - g) * a; b += (TORN_LIP[2] - b) * a;
          } else {
            // the ink edge, its width breathing a little along the line like a pen's
            const wv = inkW * (0.8 + 0.4 * (0.5 + 0.5 * vnoise(xw / 5, z / 5, 41))), a = Math.max(0, Math.min(1, wv - fpx + 0.5)) * 0.95 * (1 - fade);
            r += (INK_RGB[0] - r) * a; g += (INK_RGB[1] - g) * a; b += (INK_RGB[2] - b) * a;
          }
        }
      }
      if (alpha >= 1) { D[p] = r; D[p + 1] = g; D[p + 2] = b; D[p + 3] = 255; continue; }
      // outside (or on the anti-aliased rim): the shadow the piece casts on the board
      const contact = fv > -0.9 ? 0.32 * sstep(-0.9, 0.05, fv) : 0;
      let fs = -9;
      if (fv > -6) {
        const q = sRowK + si[col], qu = su[col], q2 = q + GX, a00 = (1 - qu) * (1 - sv), a10 = qu * (1 - sv), a01 = (1 - qu) * sv, a11 = qu * sv;
        fs = Ff[q] * a00 + Ff[q + 1] * a10 + Ff[q2] * a01 + Ff[q2 + 1] * a11;
        if (Ft) fs = Math.min(fs, Ft[q] * a00 + Ft[q + 1] * a10 + Ft[q2] * a01 + Ft[q2 + 1] * a11);
      }
      const sh = Math.max(fs > -2.6 ? 0.5 * sstep(-2.6, 0.5, fs) : 0, contact);
      const oa = alpha + sh * (1 - alpha);
      if (oa <= 0.002) { D[p + 3] = 0; continue; }
      const kk = sh * (1 - alpha);
      D[p] = (r * alpha + SHADOW[0] * kk) / oa; D[p + 1] = (g * alpha + SHADOW[1] * kk) / oa; D[p + 2] = (b * alpha + SHADOW[2] * kk) / oa; D[p + 3] = Math.round(oa * 255);
    }
  };
  for (let row = 0; row < h; row++) shadeRow(row);
  x.putImageData(img, 0, 0);
  // the outline in image px (cells inside with a neighbour outside), for fitting the view to the piece
  const pts: number[] = []; let l = 1e9, t = 1e9, rr = -1e9, bb = -1e9;
  const cs = 1.0, mw = Math.ceil((f.maxX - f.minX) / cs), mh = Math.ceil((f.maxZ - f.minZ) / cs), inn = new Uint8Array(mw * mh);
  for (let j = 0; j < mh; j++) for (let i = 0; i < mw; i++) inn[j * mw + i] = fieldAt(F, f.minX + (i + 0.5) * cs, f.minZ + (j + 0.5) * cs) > 0 ? 1 : 0;
  for (let j = 0; j < mh; j++) for (let i = 0; i < mw; i++) {
    if (!inn[j * mw + i]) continue;
    if (i > 0 && i < mw - 1 && j > 0 && j < mh - 1 && inn[j * mw + i - 1] && inn[j * mw + i + 1] && inn[(j - 1) * mw + i] && inn[(j + 1) * mw + i]) continue;
    const px = (i + 0.5) * cs * ppu, py = (j + 0.5) * cs * ppu; pts.push(px, py);
    l = Math.min(l, px); rr = Math.max(rr, px); t = Math.min(t, py); bb = Math.max(bb, py);
  }
  return { at: (wx, wz) => fieldAt(F, wx, wz), outline: new Float32Array(pts), box: { l, t, r: rr, b: bb } };
}
