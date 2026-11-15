// Sealing a border line (G1.5-13, the demo slice). A rock ridge authored for looks has gaps between its boulders; that was
// fine while the land behind it was part of the map, not once the ridge is the edge of the demo. This walks a polyline
// that must be closed, finds every stretch where a monkey (radius 0.45) could stand on the line itself (every path from
// one side to the other crosses the line somewhere, so a point there with that much clearance is a way through), and
// returns rocks that plug those stretches. Pure data: it reads the same collider table the grid builds from
// (colliders.ts), so the lint's exact check (grid.ts exactReach) and this agree.
import type { Placed } from "../../contracts";
import { collidersFor, pinVariant } from "./colliders";
import { toWorld, polySigned, type Pt, type PtLike } from "./types";

type C = { circle: boolean; x: number; z: number; r: number; hx: number; hz: number; c: number; s: number };
function worldCols(list: Placed[]): C[] {
  const out: C[] = [];
  for (const p of list) {
    if (p.k.startsWith("building:")) continue;
    for (const c of collidersFor(p.k, p.o) ?? []) {
      if (!c.move) continue;
      const k = p.s ?? 1;
      if (c.t === "circle") { const [x, z] = toWorld(p, c.x, c.z); out.push({ circle: true, x, z, r: c.r * k, hx: 0, hz: 0, c: 1, s: 0 }); continue; }
      let lx: number, lz: number, hx: number, hz: number, yaw: number;
      if (c.t === "box") { lx = c.x; lz = c.z; hx = c.w / 2; hz = c.d / 2; yaw = c.yaw ?? 0; }
      else { lx = (c.ax + c.bx) / 2; lz = (c.az + c.bz) / 2; hx = c.thick / 2; hz = Math.hypot(c.bx - c.ax, c.bz - c.az) / 2; yaw = Math.atan2(c.bx - c.ax, c.bz - c.az); }
      const [x, z] = toWorld(p, lx, lz), wy = (p.yaw ?? 0) + yaw;
      out.push({ circle: false, x, z, r: Math.hypot(hx, hz) * k, hx: hx * k, hz: hz * k, c: Math.cos(wy), s: Math.sin(wy) });
    }
  }
  return out;
}
function dist(q: C, x: number, z: number) {
  const dx = x - q.x, dz = z - q.z;
  if (q.circle) return Math.hypot(dx, dz) - q.r;
  const lx = Math.abs(dx * q.c - dz * q.s) - q.hx, lz = Math.abs(dx * q.s + dz * q.c) - q.hz;
  return lx <= 0 && lz <= 0 ? Math.max(lx, lz) : Math.hypot(Math.max(lx, 0), Math.max(lz, 0));
}
/** the stretches of a line a monkey could stand on: [from, to] points */
export function openStretches(list: Placed[], line: Pt[], outline: readonly PtLike[], rad = 0.45, step = 0.2) {
  const xs = line.map((p) => p[0]), zs = line.map((p) => p[1]);
  const bb = [Math.min(...xs) - 6, Math.max(...xs) + 6, Math.min(...zs) - 6, Math.max(...zs) + 6];
  const cols = worldCols(list.filter((p) => p.x > bb[0] && p.x < bb[1] && p.z > bb[2] && p.z < bb[3]));
  const runs: [Pt, Pt][] = [];
  let start: Pt | null = null, last: Pt | null = null;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, az] = line[i], [bx, bz] = line[i + 1], len = Math.hypot(bx - ax, bz - az);
    for (let t = 0; t <= len; t += step) {
      const x = ax + ((bx - ax) * t) / len, z = az + ((bz - az) * t) / len;
      // outside the outline (1 u cells: the walkable edge can sit up to half a cell past the polygon) or against a collider
      const open = polySigned(outline, x, z) > -1.1 && cols.every((q) => dist(q, x, z) >= rad + 0.04);
      if (open) { start ??= [x, z]; last = [x, z]; } else if (start && last) { runs.push([start, last]); start = last = null; }
    }
  }
  if (start && last) runs.push([start, last]);
  return runs;
}
/** rocks that close every open stretch (three passes: a plug's own shape can leave a sliver) */
export function plugGaps(list: Placed[], lines: Pt[][], outline: readonly PtLike[], rng: () => number): Placed[] {
  const plugs: Placed[] = [];
  for (let pass = 0; pass < 3; pass++) {
    let added = 0;
    for (const line of lines) for (const [a, b] of openStretches([...list, ...plugs], line, outline)) {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil((len + 0.6) / 1.7));
      for (let k = 0; k < n; k++) {
        const t = n === 1 ? 0.5 : k / (n - 1), x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
        plugs.push(pinVariant({ k: rng() < 0.3 ? "boulders" : "rockl", x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, yaw: rng() * 6.28, s: 1.35 + rng() * 0.25 })); added++;
      }
    }
    if (!added) break;
  }
  return plugs;
}
