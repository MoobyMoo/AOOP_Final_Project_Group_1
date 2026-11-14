// Node entry for tools/mapdump.mjs: builds the grid from the map data + the building stub (no renderer), prints the
// lint report and writes a top-down SVG blockout (outline, zones, roads, colliders, gates, sockets).
import { PLACED, ZONES, ROADS, CRATES, SPAWNS, PORTALS, POI, BOUNDS, SUPPLY_DROPS, START } from "./grove";
import { initGrid, lintReport, debugGrid, gates, GW, GH } from "../grid";
import { building, houseSize } from "../kit_house_stub";
import { makeScatter } from "./scatter";

const feet = PLACED.filter((p) => p.k.startsWith("building:")).map((p) => { const s = houseSize(p.k.slice(9)), q = Math.abs(Math.sin(p.yaw ?? 0)) > 0.5; return { x: p.x, z: p.z, hx: q ? s.hz : s.hx, hz: q ? s.hx : s.hz }; });
const scatter = makeScatter(Number((globalThis as unknown as { __seed?: number }).__seed ?? 4242), feet);
initGrid((p) => building(p.k.slice(9)), scatter);
const rep = lintReport(), g = debugGrid(), S = 6, W = GW * S, Hh = GH * S;
const X = (x: number) => ((x - BOUNDS.minX) * S).toFixed(1), Z = (z: number) => ((z - BOUNDS.minZ) * S).toFixed(1);
const ZC: Record<string, string> = { sand: "#e6d09a", grass: "#9bbf62", dirt: "#d8b47c", stone: "#cbb894", cave: "#857869", plank: "#b99a6c", mud: "#8da07a" };
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Hh}" viewBox="0 0 ${W} ${Hh}" font-family="sans-serif"><rect width="100%" height="100%" fill="#3d5a3a"/>`;
let run = "";
for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) { const v = g.cells[r * GW + c]; if (v) run += `<rect x="${c * S}" y="${r * S}" width="${S}" height="${S}" fill="${v === 2 ? "#4a9fb5" : "#a9c878"}"/>`; }
svg += run;
for (const z of [...ZONES].reverse()) svg += `<polygon points="${z.pts.map((p) => `${X(p[0])},${Z(p[1])}`).join(" ")}" fill="${ZC[z.ground]}" fill-opacity="0.75" stroke="#00000030"/>`;
for (const r of ROADS) svg += `<polyline points="${r.pts.map((p) => `${X(p[0])},${Z(p[1])}`).join(" ")}" fill="none" stroke="${r.ground === "plank" ? "#8a6a45" : r.ground === "cave" ? "#6a5f55" : "#c79a5e"}" stroke-width="${r.w * S}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="0.8"/>`;
for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) { const i = r * GW + c; if (g.cells[i] === 1 && g.navStatic[i]) svg += `<rect x="${c * S}" y="${r * S}" width="${S}" height="${S}" fill="#00000028"/>`; }
for (const q of g.cols) {
  const fill = q.gate >= 0 ? "#ff7a2a" : q.flags & 2 ? "#3a3026" : "#8a6f4a";
  if (q.circle) svg += `<circle cx="${X(q.x)}" cy="${Z(q.z)}" r="${(q.r * S).toFixed(1)}" fill="${fill}"/>`;
  else svg += `<rect x="${-q.hx * S}" y="${-q.hz * S}" width="${q.hx * 2 * S}" height="${q.hz * 2 * S}" fill="${fill}" transform="translate(${X(q.x)},${Z(q.z)}) rotate(${(-Math.atan2(q.s, q.c) * 180) / Math.PI})"/>`;
}
for (const p of scatter) svg += `<circle cx="${X(p.x)}" cy="${Z(p.z)}" r="1.6" fill="#2f5a2a" fill-opacity="0.55"/>`;
for (const p of PLACED) if (p.k.startsWith("building:")) svg += `<text x="${X(p.x)}" y="${Z(p.z)}" font-size="13" text-anchor="middle" fill="#fff" stroke="#000" stroke-width="0.4">${p.k.slice(9)}</text>`;
for (const c of CRATES) svg += `<rect x="${+X(c.x) - 4}" y="${+Z(c.z) - 4}" width="8" height="8" fill="${c.tier === "gold" ? "#ffd84a" : c.tier === "green" ? "#3fae5a" : "#b07a3a"}" stroke="#000"/>`;
SPAWNS.forEach((set, si) => { for (const s of set) svg += `<circle cx="${X(s.x)}" cy="${Z(s.z)}" r="${s.kind === "brute" || s.kind === "sleeper" ? 7 : 4}" fill="${si ? "#4a6cff" : "#ff4a4a"}" fill-opacity="0.8" stroke="#000"/>`; });
for (const p of PORTALS) for (const q of [p.a, p.b]) svg += `<circle cx="${X(q.x)}" cy="${Z(q.z)}" r="6" fill="#c77dff" stroke="#000"/>`;
for (const d of SUPPLY_DROPS) svg += `<path d="M${X(d.x)},${+Z(d.z) - 7} l6,12 l-12,0 z" fill="#ff5a3a" stroke="#000"/>`;
for (const [k, v] of Object.entries(POI)) svg += `<text x="${X(v.x)}" y="${+Z(v.z) - 6}" font-size="11" text-anchor="middle" fill="#102">${k}</text>`;
svg += `<circle cx="${X(START.x)}" cy="${Z(START.z)}" r="5" fill="#fff" stroke="#000"/>`;
for (const z of ZONES) { const xs = z.pts.map((p) => p[0]), zs = z.pts.map((p) => p[1]); svg += `<text x="${X((Math.min(...xs) + Math.max(...xs)) / 2)}" y="${Z(Math.min(...zs) + 3)}" font-size="14" font-weight="bold" text-anchor="middle" fill="#201" fill-opacity="0.8">${z.name}</text>`; }
for (let x = Math.ceil(BOUNDS.minX / 20) * 20; x < BOUNDS.maxX; x += 20) svg += `<line x1="${X(x)}" y1="0" x2="${X(x)}" y2="${Hh}" stroke="#00000018"/><text x="${+X(x) + 2}" y="12" font-size="11" fill="#fff">${x}</text>`;
for (let z = Math.ceil(BOUNDS.minZ / 20) * 20; z < BOUNDS.maxZ; z += 20) svg += `<line x1="0" y1="${Z(z)}" x2="${W}" y2="${Z(z)}" stroke="#00000018"/><text x="2" y="${+Z(z) - 2}" font-size="11" fill="#fff">${z}</text>`;
svg += "</svg>";
console.log(JSON.stringify({ ...rep, gates: gates.length }, null, 1));
(globalThis as unknown as { __svg: string }).__svg = svg;
