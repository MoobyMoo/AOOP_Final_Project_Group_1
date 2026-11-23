// M: the full map, and the corner minimap (map v5, G1.5 rows 07, 23 and 49).
// Duckov's mechanism (research/duckov-re/POLISH_FINDINGS 5, MAP_FINDINGS "Map UI", duckov-footage POLISH_FOOTAGE 5):
//  - one image per subscene (ours: mapbake.ts, at load): a flat, muted overhead map outdoors, a cool-blue blueprint
//    floor plan underground;
//  - the map shows the floor you are on. No floor tabs: a small floor button on the zoom rail (and L) peeks at the
//    other floor, with a line saying you are peeking;
//  - full screen: zone title top-left, the compass top-right, the zoom control on the right margin (centre on you,
//    in, the rail, out), the Map Markers bar bottom-left (a row of icons and a row of colours; right-click the map to
//    place or remove a marker; left-drag pans), the scale and keys bottom-right;
//  - camera-aligned (the map turns with the camera yaw, the needle shows north), markers stay upright and
//    screen-sized at every zoom, wheel zoom keeps the view centre, the map opens on the whole level;
//  - extracts green, the boss red (a fixed danger area until spotted, then a moving "?": ai/enemies.ts bossMarkers()),
//    level links, the route-closed locks, your markers, the explored trail and the player arrow; never regular
//    enemies or loot. No legend panel (Duckov has none): each marker names itself on hover.
// The image is baked once; per frame only CSS transforms move (the minimap) and only while the M map is open.
import "@fontsource/barlow-condensed/500.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "./map.css";
import * as THREE from "three";
import { G } from "../core/state";
import { CLEARINGS } from "../world/layout";
import { bakeMap, type MapImage } from "./mapbake";
import { menuOpened, menuClosed, registerMenu } from "./menubar";
import { SURFACE, UNDER, levelOf, areaLabels, marks, closedPoly, demoEdge, inDemo, underClosed, routeLocks, PIN_DEFAULT, type Level, type Mark, type MarkKind, type Pin } from "./mapdata";
import { ICON, TIPS, PIN_GLYPHS, PIN_COLORS, ME_FACE, ME_NOTCH, pinSvg, glyphSvg } from "./mapicons";
import { prefs } from "./settings";
import { mapDestination, setMapDestination, clearMapDestination } from "./navigation";

const imgs: Partial<Record<Level, MapImage>> = {};
function readMapPreference(key: string): unknown {
  try { return JSON.parse(localStorage.getItem(key) ?? "null"); }
  catch { return null; }
}
function saveMapPreference(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { /* Keep map interactions available for this session. */ }
}
function pinIcon(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < PIN_GLYPHS.length ? value : 0;
}
function pinColor(value: unknown): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : PIN_DEFAULT;
}
const savedPins = readMapPreference("bv_pins");
const pins: Pin[] = Array.isArray(savedPins) ? savedPins
  .filter((p): p is Pin => p && typeof p.x === "number" && Number.isFinite(p.x) && typeof p.z === "number" && Number.isFinite(p.z))
  .map(p => ({ x: p.x, z: p.z, i: pinIcon(p.i), c: pinColor(p.c) })) : [];
/** the icon and colour the markers bar has picked (Duckov: selected index 0, white) */
const savedPick = readMapPreference("bv_pin_pick") as Partial<Pin> | null;
const pick = { i: pinIcon(savedPick?.i), c: pinColor(savedPick?.c) };
const savePick = () => saveMapPreference("bv_pin_pick", pick);
/** the encoded image (mapbake encodes it in the background; if asked before that lands, encode now) */
const urlOf = (m: MapImage) => m.url || (m.url = m.canvas.toDataURL("image/webp", 0.93));
const savePins = () => saveMapPreference("bv_pins", pins);
const deg = (r: number) => (r * 180) / Math.PI;

// ---------------------------------------------------------------- the bake (once, at load: main.ts)
/** the demo edge on the surface image: a dashed tie-orange line (drawn before the cut-out, which fades and tears the
 *  land north of it and clips the line to the island) */
function drawClosed(x: CanvasRenderingContext2D, m: MapImage) {
  const P = (p: [number, number]) => [(p[0] - m.minX) * m.ppu, (p[1] - m.minZ) * m.ppu] as const;
  x.save(); x.lineCap = "round"; x.lineJoin = "round"; x.beginPath();
  demoEdge().forEach((p, i) => { const [a, b] = P(p); if (i) x.lineTo(a, b); else x.moveTo(a, b); });
  x.strokeStyle = "rgba(42,26,18,0.55)"; x.lineWidth = 6; x.stroke();
  x.strokeStyle = "#f46a10"; x.lineWidth = 3.2; x.setLineDash([14, 9]); x.stroke(); x.restore();
}
export function buildMapShots(scene?: THREE.Scene) {
  const s = scene ?? G.stage.scene;
  const poly = closedPoly();
  imgs.surface = bakeMap(s, "surface", SURFACE, 2048, poly ? { extra: drawClosed, closed: { edge: demoEdge(), poly } } : {});
  imgs.under = bakeMap(s, "under", UNDER, 1024, { lit: (x, z) => !underClosed && inDemo(x, z) }); // the blueprint: rooms shut for the demo stay dark
  if (new URLSearchParams(location.search).has("dev")) (window as unknown as { __map: unknown }).__map = { imgs, open: (l?: Level) => { if (!el) open(l); }, setLevel: (l: Level) => setLevel(l) };
}

/** a north-up square crop of the surface map around (x, z), radius r u, with a landing pin at the centre: the
 *  destination cards in the vault (home/dispatch.ts). Cached per call site; null before the bake ran. */
const crops = new Map<string, string>();
export function mapCrop(x: number, z: number, r: number, px = 240): string | null {
  const m = imgs.surface, k = `${x},${z},${r},${px}`;
  if (!m) return null;
  if (crops.has(k)) return crops.get(k)!;
  const c = document.createElement("canvas"); c.width = c.height = px; const g = c.getContext("2d")!;
  g.fillStyle = "#24302e"; g.fillRect(0, 0, px, px);
  g.drawImage(m.canvas, (x - r - m.minX) * m.ppu, (z - r - m.minZ) * m.ppu, 2 * r * m.ppu, 2 * r * m.ppu, 0, 0, px, px);
  const h = px / 2; g.fillStyle = "rgba(20,14,10,.45)"; g.beginPath(); g.ellipse(h, h + 3, 9, 4, 0, 0, 7); g.fill();
  g.fillStyle = "#f46a10"; g.strokeStyle = "#1c120b"; g.lineWidth = 2.5; g.beginPath(); g.moveTo(h, h + 2); g.bezierCurveTo(h - 12, h - 12, h - 9, h - 26, h, h - 26); g.bezierCurveTo(h + 9, h - 26, h + 12, h - 12, h, h + 2); g.fill(); g.stroke();
  g.fillStyle = "#f3ead6"; g.beginPath(); g.arc(h, h - 16, 4, 0, 7); g.fill();
  const url = c.toDataURL("image/webp", 0.9); crops.set(k, url); return url;
}

// ---------------------------------------------------------------- explored trail (research/duckov-map rule 4)
const trail: { x: number; z: number }[] = [];
export function resetTrail() { trail.length = 0; trailKey = -1; }
export function recordTrail() { const l = trail[trail.length - 1]; if (!l || Math.hypot(l.x - G.pp.x, l.z - G.pp.z) > 3) trail.push({ x: G.pp.x, z: G.pp.z }); }
let trailKey = -1;
function trailPoints(m: MapImage, l: Level) {
  // split into runs per level so a portal hop does not draw a line across the map
  const runs: string[] = []; let cur: string[] = [];
  for (const q of trail) { if (levelOf(q.x) !== l) { if (cur.length > 1) runs.push(cur.join(" ")); cur = []; continue; } cur.push(`${((q.x - m.minX) * m.ppu).toFixed(1)},${((q.z - m.minZ) * m.ppu).toFixed(1)}`); }
  if (cur.length) cur.push(`${((G.pp.x - m.minX) * m.ppu).toFixed(1)},${((G.pp.z - m.minZ) * m.ppu).toFixed(1)}`);
  if (cur.length > 1) runs.push(cur.join(" "));
  return runs.map((r) => `<polyline points="${r}"/>`).join("");
}

// ---------------------------------------------------------------- shared: a map plane and its markers
const planePx = (m: MapImage, x: number, z: number) => ({ x: (x - m.minX) * m.ppu, y: (z - m.minZ) * m.ppu });
function dangerSvg(m: MapImage, list: Mark[]) {
  return list.filter((k) => k.kind === "danger" && k.r).map((k) => { const p = planePx(m, k.x, k.z); return `<circle class="danger" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${(k.r! * m.ppu).toFixed(1)}"/>`; }).join("");
}

// ---------------------------------------------------------------- the M map
let el: HTMLDivElement | null = null, raf = 0;
let level: Level = "surface", zoom = 1, fit = 1, fx = 0, fy = 0, vw = 1, vh = 1;
let markEls = new Map<string, HTMLElement>(), labelEls: { el: HTMLElement; x: number; z: number }[] = [], lastMarks = 0;
let markList: Mark[] = [];
const ZMAX = 8; // the deepest zoom, times the fitted view (Duckov's display scale runs 1 to 13 from a small start)
export const mapOpen = () => !!el;
export function toggleMap() { if (el) close(); else open(); }
function close() { if (!el) return; cancelAnimationFrame(raf); el.remove(); el = null; removeEventListener("keydown", onKey, true); menuClosed("map"); }
registerMenu("map", { open: () => { if (!el) open(); }, close, isOpen: () => !!el });
function onKey(e: KeyboardEvent) { if (e.code === "KeyL" || e.code === "PageUp" || e.code === "PageDown") { setLevel(level === "surface" ? "under" : "surface"); e.preventDefault(); } }
const FLOOR: Record<Level, string> = { surface: "Surface", under: "Grotto · B1" };

function open(start?: Level) {
  if (!imgs.surface || !imgs.under) return;
  const here = levelOf(G.pp.x);
  el = document.createElement("div"); el.className = "mv3";
  const found = [...G.discovered].filter((id) => { const c = CLEARINGS.find((q) => q.id === id); return c && inDemo(c.x, c.z); }).length;
  el.innerHTML = `
  <div class="mv3-view"><div class="mv3-plane"><img alt=""><svg class="mv3-vec"></svg></div><div class="mv3-over"></div></div>
  <header class="mv3-title">
    <h1>Banana Grove</h1><p class="sub"></p>
    <div class="mv3-where"><b class="floor"></b><span class="area"></span><small class="found">Areas found <b class="num">${found} / ${areaLabels("surface").length + areaLabels("under").length}</b></small></div>
  </header>
  <div class="mv3-needle" title="North">${COMPASS}</div>
  <div class="mv3-zoom" role="group" aria-label="Zoom">
    <div class="rail" title="Zoom: drag, or use the wheel"><i class="thumb">${MAGNIFIER}</i></div>
    <button class="ctr" title="Centre on you">${CENTRE}</button>
    <button class="flr" title="Peek at the other floor (L)"></button>
  </div>
  <div class="mv3-peek"></div>
  <section class="mv3-mk" aria-label="Map markers">
    <div class="mv3-guidance"><span>${prefs.mapAssist ? "Click the map to choose a destination" : "Enable Map guidance in Esc settings"}</span><button type="button" aria-label="Clear destination">Clear</button></div>
    <h3>Map markers</h3><p>Right-click the map to place or remove a marker</p>
    <div class="mv3-mk-icons">${PIN_GLYPHS.map((g, i) => `<button data-i="${i}" title="${g[0]}">${glyphSvg(i)}</button>`).join("")}</div>
    <div class="mv3-mk-cols">${PIN_COLORS.map((c) => `<button data-c="${c}" style="--c:${c}" title="Marker colour"></button>`).join("")}</div>
  </section>
  <footer class="mv3-foot">
    <div class="mv3-scale"><i></i><span>25 m</span></div>
    <div class="mv3-keys"><span><b class="a-kbd">M</b>Close</span><span><b class="a-kbd">Wheel</b>Zoom</span><span><b class="a-kbd">Drag</b>Pan</span><span><b class="a-kbd">Right-click</b>Marker</span><span><b class="a-kbd">L</b>Floor</span></div>
  </footer>
  <div class="mv3-tip"><b></b><span></span></div>`;
  document.body.appendChild(el);
  addEventListener("keydown", onKey, true);
  menuOpened("map"); // the menu bar across the top (Pack, Jobs, Map, Notes); closes the Tab screen or a page
  // the markers bar: the picked icon and colour (kept between raids)
  const paint = () => {
    el!.querySelectorAll<HTMLButtonElement>(".mv3-mk-icons button").forEach((b) => { b.classList.toggle("on", +b.dataset.i! === pick.i); });
    el!.querySelectorAll<HTMLButtonElement>(".mv3-mk-cols button").forEach((b) => b.classList.toggle("on", b.dataset.c === pick.c));
  };
  el.querySelectorAll<HTMLButtonElement>(".mv3-mk-icons button").forEach((b) => b.onclick = () => { pick.i = +b.dataset.i!; savePick(); paint(); });
  el.querySelectorAll<HTMLButtonElement>(".mv3-mk-cols button").forEach((b) => b.onclick = () => { pick.c = b.dataset.c!; savePick(); paint(); });
  paint();
  el.querySelector<HTMLButtonElement>('.mv3-guidance button')!.onclick = () => { clearMapDestination(); lastMarks = 0; update(); };
  // the zoom slider (drag the magnifier along the rail, or click the rail), centre on you; the floor button peeks
  const zoomTo = (z: number) => { zoom = THREE.MathUtils.clamp(z, fit, fit * ZMAX); clampFocus(); place(); };
  (el.querySelector(".mv3-zoom .ctr") as HTMLElement).onclick = () => {
    const m = imgs[level]!;
    if (levelOf(G.pp.x) === level) { const p = planePx(m, G.pp.x, G.pp.z); fx = p.x; fy = p.y; zoomTo(Math.max(zoom, fit * 2.5)); } else setLevel(level);
  };
  (el.querySelector(".mv3-zoom .flr") as HTMLElement).onclick = () => setLevel(level === "surface" ? "under" : "surface");
  const rail = el.querySelector(".mv3-zoom .rail") as HTMLElement;
  const railAt = (y: number) => { const r = rail.getBoundingClientRect(), t = THREE.MathUtils.clamp(1 - (y - r.top) / r.height, 0, 1); zoomTo(fit * Math.pow(ZMAX, t)); };
  rail.onpointerdown = (e) => { rail.setPointerCapture(e.pointerId); railAt(e.clientY); rail.onpointermove = (q) => railAt(q.clientY); };
  rail.onpointerup = () => { rail.onpointermove = null; };
  const view = el.querySelector(".mv3-view") as HTMLDivElement, tip = el.querySelector(".mv3-tip") as HTMLElement;
  view.onwheel = (e) => { e.preventDefault(); zoomTo(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)); };
  let down: { x: number; y: number; fx: number; fy: number; moved: boolean } | null = null;
  view.onpointerdown = (e) => { if (e.button !== 0) return; down = { x: e.clientX, y: e.clientY, fx, fy, moved: false }; view.setPointerCapture(e.pointerId); tip.classList.remove("on"); };
  view.onpointermove = (e) => {
    if (!down) { hover(e); return; }
    const dx = e.clientX - down.x, dy = e.clientY - down.y; if (!down.moved && Math.hypot(dx, dy) < 5) return;
    down.moved = true; view.classList.add("drag");
    const a = -G.stage.cam.yaw, c = Math.cos(a), s = Math.sin(a); // screen delta -> plane delta: undo the rotation and the zoom
    fx = down.fx - (dx * c - dy * s) / zoom; fy = down.fy - (dx * s + dy * c) / zoom; clampFocus(); place();
  };
  view.onpointerup = (e) => {
    const clicked = down && !down.moved && e.button === 0;
    view.classList.remove("drag"); down = null;
    if (!clicked || !prefs.mapAssist) return;
    const bounds = view.getBoundingClientRect();
    const p = matrix().inverse().transformPoint(new DOMPoint(e.clientX - bounds.left, e.clientY - bounds.top)), m = imgs[level]!;
    let x = m.minX + p.x / m.ppu, z = m.minZ + p.y / m.ppu, label = "Destination";
    const placeLabel = labelEls.find(q => { const r = q.el.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom && !q.el.classList.contains("shut"); });
    const mark = markList.filter(k => k.id !== "navigation-target" && Math.hypot(k.x - x, k.z - z) < 22 / (zoom * m.ppu)).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0];
    if (mark) { x = mark.x; z = mark.z; label = mark.kind === "boat" || mark.kind === "exit" ? mark.label.split(" · ")[0] : mark.label; }
    else if (placeLabel) { x = placeLabel.x; z = placeLabel.z; label = placeLabel.el.textContent ?? label; }
    if ((!mark && !placeLabel && m.shape.at(x, z) <= 0) || !inDemo(x, z)) return;
    setMapDestination({ x, z, label, raid: G.save.activeRaid?.id ?? "" });
    lastMarks = 0; update();
  };
  view.onpointercancel = () => { down = null; view.classList.remove("drag"); };
  view.onpointerleave = () => tip.classList.remove("on");
  // right-click: place a marker, or take off the one under the cursor (Duckov's Map Markers)
  view.oncontextmenu = (e) => {
    e.preventDefault();
    const p = matrix().inverse().transformPoint(new DOMPoint(e.clientX, e.clientY)), m = imgs[level]!;
    const x = m.minX + p.x / m.ppu, z = m.minZ + p.y / m.ppu;
    const k = pins.findIndex((q) => levelOf(q.x) === level && Math.hypot(q.x - x, q.z - z) < 18 / (zoom * m.ppu) + 1);
    if (k >= 0) pins.splice(k, 1); else { if (m.shape.at(x, z) <= 0) return; pins.push({ x, z, i: pick.i, c: pick.c }); } // the board is not the map
    savePins(); lastMarks = 0; tip.classList.remove("on"); update();
  };
  /** the hover tag: what a marker is (the legend's job, on the marker itself) */
  function hover(e: PointerEvent) {
    const t = (e.target as HTMLElement).closest<HTMLElement>(".mk, .me");
    if (!t) { tip.classList.remove("on"); return; }
    const kind = (t.classList.contains("me") ? "me" : t.dataset.kind) as MarkKind | "me", k = markList.find((q) => markEls.get(q.id) === t);
    const [name, what] = TIPS[kind] ?? ["", ""];
    (tip.querySelector("b") as HTMLElement).textContent = k && kind !== "pin" && kind !== "danger" ? k.label : name;
    (tip.querySelector("span") as HTMLElement).textContent = kind === "danger" && k ? `${k.label}: ${what.toLowerCase()}` : what;
    tip.style.transform = `translate(${e.clientX + 16}px,${e.clientY + 14}px)`; tip.classList.add("on");
  }
  setLevel(start ?? here, true);
  const tick = () => { if (!el) return; update(); raf = requestAnimationFrame(tick); };
  raf = requestAnimationFrame(tick);
}
const MAGNIFIER = `<svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6.2" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M14.6 14.6l6 6" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/></svg>`;
/** the compass: a ring, a dot, a red pointer on the rim and "North" curving round outside it; turned by the map's yaw */
const COMPASS = `<svg viewBox="0 0 140 140" aria-hidden="true"><defs><path id="mv3-arc" d="M 20 70 A 50 50 0 0 1 120 70"/></defs><text><textPath href="#mv3-arc" startOffset="50%" text-anchor="middle">North</textPath></text><circle class="ring" cx="70" cy="70" r="38"/><circle class="dot" cx="70" cy="70" r="4.5"/><path class="ptr" d="M70 36.5 78 49 70 46 62 49z"/></svg>`;
const SUB: Record<Level, string> = { surface: "Exile Beach to the Old Plantation", under: "The smugglers' cave, one floor under the cove" };
const TITLE: Record<Level, string> = { surface: "Banana Grove", under: "The Grotto" };
const CENTRE = `<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="5.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="10" cy="10" r="1.8" fill="currentColor"/><path d="M10 1v3.4M10 15.6V19M1 10h3.4M15.6 10H19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

/** show one floor: its image, its labels, its markers, fitted whole */
function setLevel(l: Level, opening = false) {
  if (!el) return; level = l; const m = imgs[l]!, here = levelOf(G.pp.x);
  el.classList.toggle("under", l === "under"); el.classList.toggle("peek", l !== here);
  (el.querySelector(".mv3-where .floor") as HTMLElement).textContent = FLOOR[l]; (el.querySelector(".mv3-title .sub") as HTMLElement).textContent = SUB[l]; (el.querySelector(".mv3-title h1") as HTMLElement).textContent = TITLE[l];
  const area = CLEARINGS.find((c) => c.id === G.area);
  (el.querySelector(".mv3-where .area") as HTMLElement).textContent = l === here ? (area?.name ?? "") : `You're on the ${here === "under" ? "grotto floor" : "surface"}`;
  const flr = el.querySelector(".mv3-zoom .flr") as HTMLElement; flr.textContent = l === "surface" ? "B1" : "1F"; flr.title = l === "surface" ? "Peek at the grotto, one floor down (L)" : "Back up to the surface (L)";
  flr.classList.toggle("on", l !== here);
  (el.querySelector(".mv3-peek") as HTMLElement).innerHTML = l !== here ? `Showing the ${l === "under" ? "grotto" : "surface"}: you're ${here === "under" ? "underground" : "on the surface"} <b class="a-kbd">L</b>` : "";
  const view = el.querySelector(".mv3-view") as HTMLDivElement, r = view.getBoundingClientRect(); vw = r.width; vh = r.height;
  const plane = el.querySelector(".mv3-plane") as HTMLDivElement; plane.style.width = m.w + "px"; plane.style.height = m.h + "px";
  (plane.querySelector("img") as HTMLImageElement).src = urlOf(m);
  const vec = plane.querySelector(".mv3-vec") as SVGSVGElement; vec.setAttribute("viewBox", `0 0 ${m.w} ${m.h}`); vec.setAttribute("width", String(m.w)); vec.setAttribute("height", String(m.h));
  // fit: the piece's own outline, turned by the camera yaw, inside the open middle of the screen (clear of the title,
  // the markers bar and the zoom rail), not the rotated image rectangle
  const yaw = G.stage.cam.yaw, co = Math.cos(yaw), si = Math.sin(yaw), o = m.shape.outline;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = 0; i < o.length; i += 2) { const sx = o[i] * co - o[i + 1] * si, sy = o[i] * si + o[i + 1] * co; x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy); }
  const pad = { l: vw * 0.06, r: vw * 0.1, t: vh * 0.2, b: vh * 0.15 }; // clear of the bar and title above, the markers bar below, the zoom slider right
  fit = Math.min((vw - pad.l - pad.r) / (x1 - x0), (vh - pad.t - pad.b) / (y1 - y0));
  // focus: the turned box's centre, shifted by the padding difference, back in image px
  const cx = (x0 + x1) / 2 - (pad.l - pad.r) / 2 / fit, cy = (y0 + y1) / 2 - (pad.t - pad.b) / 2 / fit;
  zoom = fit; fx = cx * co + cy * si; fy = -cx * si + cy * co;
  // labels: upright, screen-sized, placed each frame from the matrix
  const over = el.querySelector(".mv3-over") as HTMLDivElement; over.innerHTML = ""; markEls = new Map(); labelEls = [];
  for (const a of areaLabels(l)) {
    const d = document.createElement("span"); d.className = "lab" + (a.id === G.area ? " cur" : "") + (G.discovered.has(a.id) ? "" : " new"); d.textContent = a.name; over.appendChild(d); labelEls.push({ el: d, x: a.x, z: a.z });
  }
  const edge = demoEdge();
  if (l === "surface" && edge.length > 3) { // the closed north names itself (the legend row it had in v4)
    const mid = edge[Math.floor(edge.length / 2)], d = document.createElement("span"); d.className = "lab shut"; d.innerHTML = `Closed for the demo<small>Opens in the full game</small>`; over.appendChild(d); labelEls.push({ el: d, x: mid[0], z: mid[1] - 7 });
  }
  if (l === "under" && underClosed) {
    // the grotto is shut for the demo: one caption over it instead of its area names (the cave-in lock sits at its mouth)
    const d = document.createElement("span"), k = routeLocks("under")[0];
    d.className = "lab closed"; d.innerHTML = `Grotto closed<small>${k?.note ?? "Opens after the demo"}</small>`; over.appendChild(d); labelEls.push({ el: d, x: 168, z: 26 });
  }
  const me = document.createElement("b"); me.className = "me"; me.innerHTML = `<i class="nt">${ME_NOTCH}</i>${ME_FACE}<span>You</span>`; over.appendChild(me); markEls.set("me", me);
  lastMarks = 0; trailKey = -1; update(); void opening;
}
const matrix = () => new DOMMatrix().translate(vw / 2, vh / 2).rotate(deg(G.stage.cam.yaw)).scale(zoom).translate(-fx, -fy);
function clampFocus() {
  const b = imgs[level]!.shape.box; fx = THREE.MathUtils.clamp(fx, b.l, b.r); fy = THREE.MathUtils.clamp(fy, b.t, b.b);
}
function place() {
  if (!el) return; const M = matrix();
  (el.querySelector(".mv3-plane") as HTMLElement).style.transform = M.toString();
  (el.querySelector(".mv3-needle") as HTMLElement).style.transform = `rotate(${deg(G.stage.cam.yaw)}deg)`;
  (el.querySelector(".mv3-zoom .thumb") as HTMLElement).style.top = `${(1 - Math.log(zoom / fit) / Math.log(ZMAX)) * 100}%`;
  const m = imgs[level]!, sc = el.querySelector(".mv3-scale") as HTMLElement; (sc.querySelector("i") as HTMLElement).style.width = (25 * m.ppu * zoom).toFixed(1) + "px";
  const put = (e: HTMLElement, x: number, z: number) => {
    const p = M.transformPoint(new DOMPoint((x - m.minX) * m.ppu, (z - m.minZ) * m.ppu));
    const out = p.x < -40 || p.y < -40 || p.x > vw + 40 || p.y > vh + 40; e.style.display = out ? "none" : "";
    e.style.transform = `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) translate(-50%,-50%)` + (e.dataset.rot ? ` rotate(${e.dataset.rot}deg)` : "");
  };
  // markers first, then the labels, each pushed up or down off any marker or earlier label it would cover (screen space)
  const boxes: { l: number; t: number; r: number; b: number }[] = [];
  // the title, the compass, the zoom rail, the markers bar and the footer sit over the view: labels step off them too
  for (const q of document.querySelectorAll<HTMLElement>(".mv3-title h1, .mv3-title .sub, .mv3-where, .mv3-needle, .mv3-zoom, .mv3-mk, .mv3-foot, .mv3-peek, .mb3-row")) { const r = q.getBoundingClientRect(); if (r.width) boxes.push({ l: r.left - 4, t: r.top - 4, r: r.right + 4, b: r.bottom + 4 }); }
  const toScreen = (x: number, z: number) => M.transformPoint(new DOMPoint((x - m.minX) * m.ppu, (z - m.minZ) * m.ppu));
  for (const [id, e] of markEls) {
    if (id === "me") continue; const x = Number(e.dataset.x), z = Number(e.dataset.z); put(e, x, z);
    const p = toScreen(x, z), hw = (e.offsetWidth || 28) / 2, hh = (e.offsetHeight || 28) / 2, sp = e.querySelector("span") as HTMLElement | null;
    boxes.push({ l: p.x - hw, t: p.y - hh, r: p.x + hw, b: p.y + hh });
    if (sp && sp.offsetWidth) boxes.push({ l: p.x - sp.offsetWidth / 2, t: p.y + hh, r: p.x + sp.offsetWidth / 2, b: p.y + hh + sp.offsetHeight + 2 });
  }
  if (levelOf(G.pp.x) === level) { // the player arrow, turned to the heading: its box grows toward the diagonal
    const p = toScreen(G.pp.x, G.pp.z), e = markEls.get("me")!, hs = Math.max(14, (e.offsetWidth || 30) * 0.62);
    boxes.push({ l: p.x - hs, t: p.y - hs, r: p.x + hs, b: p.y + hs });
  }
  // each label takes the first clear spot from a short list near its place (on it, above, below, beside, farther out);
  // when none is clear, the one that covers the least
  const hit = (l: number, t: number, r: number, b: number) => { let o = 0; for (const q of boxes) { const ox = Math.min(r, q.r) - Math.max(l, q.l), oy = Math.min(b, q.b) - Math.max(t, q.t); if (ox > 0 && oy > 0) o += ox * oy; } return o; };
  for (const q of labelEls) {
    const p = toScreen(q.x, q.z), w = q.el.offsetWidth / 2, h = q.el.offsetHeight / 2, sy = h * 2 + 4, sx = w + 22;
    let best = { dx: 0, dy: 0 }, bestO = Infinity;
    for (const [dx, dy] of [[0, 0], [0, -sy], [0, sy], [sx, 0], [-sx, 0], [0, -2 * sy], [0, 2 * sy], [sx, -sy], [-sx, -sy], [sx, sy], [-sx, sy]]) {
      const o = hit(p.x + dx - w, p.y + dy - h, p.x + dx + w, p.y + dy + h);
      if (o < bestO) { bestO = o; best = { dx, dy }; } if (o === 0) break;
    }
    const x = p.x + best.dx, y = p.y + best.dy;
    const out = x < -80 || y < -40 || x > vw + 80 || y > vh + 40; q.el.style.display = out ? "none" : "";
    q.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-50%)`;
    if (!out) boxes.push({ l: x - w, t: y - h, r: x + w, b: y + h }); // later labels step off this one
  }
  const me = markEls.get("me")!; me.style.visibility = levelOf(G.pp.x) === level ? "visible" : "hidden";
  (me.firstElementChild as HTMLElement).style.transform = `rotate(${deg(G.stage.cam.yaw - G.moveYaw + Math.PI).toFixed(1)}deg)`; put(me, G.pp.x, G.pp.z);
}
/** a marker's face: the player's markers are their own icon and colour, everything else its role's icon */
const face = (k: Mark, size?: number) => (k.kind === "pin" ? pinSvg(k.icon, k.color, size) : ICON[k.kind]);
/** per frame while open: the boss and pins refresh 4 times a second, positions every frame (the sim keeps running) */
function update() {
  if (!el) return; const now = performance.now(), m = imgs[level]!;
  if (now - lastMarks > 250) {
    lastMarks = now; const list = marks(level, pins), over = el.querySelector(".mv3-over") as HTMLDivElement, keep = new Set(["me"]);
    const target = prefs.mapAssist ? mapDestination(G.save.activeRaid?.id ?? "") : null;
    if (target && levelOf(target.x) === level) list.push({ id: "navigation-target", kind: "pin", x: target.x, z: target.z, label: target.label, icon: 0, color: "#f46a10" });
    const guide = el.querySelector<HTMLElement>('.mv3-guidance span')!;
    guide.textContent = !prefs.mapAssist ? "Enable Map guidance in Esc settings" : target ? `Destination: ${target.label}` : "Click the map to choose a destination";
    (el.querySelector('.mv3-guidance button') as HTMLButtonElement).disabled = !target;
    markList = list;
    for (const k of list) {
      let e = markEls.get(k.id); keep.add(k.id); const sig = k.kind + (k.kind === "pin" ? `${k.icon}${k.color}` : "");
      if (!e || e.dataset.sig !== sig) { e?.remove(); e = document.createElement("em"); e.className = "mk " + k.kind; e.dataset.kind = k.kind; e.dataset.sig = sig; e.innerHTML = face(k) + `<span>${k.label}</span>`; over.insertBefore(e, markEls.get("me")!); markEls.set(k.id, e); }
      e.dataset.x = String(k.x); e.dataset.z = String(k.z);
    }
    for (const [id, e] of markEls) if (!keep.has(id)) { e.remove(); markEls.delete(id); }
    const key = trail.length * 7 + (level === "under" ? 1 : 0) + list.filter((k) => k.kind === "danger").length * 100000;
    if (key !== trailKey) { trailKey = key; (el.querySelector(".mv3-vec") as SVGSVGElement).innerHTML = dangerSvg(m, list) + `<g class="trail">${trailPoints(m, level)}</g>`; }
  }
  place();
}

/** the HUD's waypoint table (Duckov's bottom-right map/waypoint distance): your newest marker on this floor, else the
 *  nearest open extract. Distances in metres (1 u = 1 m) */
export function waypoint(): { svg: string; label: string; d: number; kind: "pin" | "exit" } | null {
  const l = levelOf(G.pp.x);
  for (let i = pins.length - 1; i >= 0; i--) { const p = pins[i]; if (levelOf(p.x) === l) return { svg: pinSvg(p.i ?? 0, p.c ?? PIN_DEFAULT, 26), label: "Your marker", d: Math.hypot(p.x - G.pp.x, p.z - G.pp.z), kind: "pin" }; }
  let best: Mark | null = null, bd = 1e9;
  for (const k of marks(l, [])) if ((k.kind === "exit" || k.kind === "boat") && !/·/.test(k.label)) { const d = Math.hypot(k.x - G.pp.x, k.z - G.pp.z); if (d < bd) { bd = d; best = k; } }
  return best ? { svg: ICON[best.kind], label: best.label, d: bd, kind: "exit" } : null;
}

// ---------------------------------------------------------------- corner minimap (camera-up, like the game view)
let mini: HTMLDivElement | null = null, miniPlane: HTMLDivElement | null = null, miniVec: SVGSVGElement | null = null, miniIcons: HTMLDivElement | null = null;
let miniOn = readMapPreference("bv_minimap") !== 0, miniLevel: Level | null = null, miniMarksT = 0, miniMarks: Mark[] = [], miniTrailKey = -1;
const miniEls = new Map<string, HTMLElement>();
const MINI_PX = 180, MINI_RANGE = 40; // world units across the circle
export function toggleMinimap() { miniOn = !miniOn; saveMapPreference("bv_minimap", miniOn ? 1 : 0); if (mini) mini.style.display = miniOn ? "" : "none"; }
export function buildMinimap() {
  if (!imgs.surface) return; mini?.remove(); miniEls.clear(); miniLevel = null; miniTrailKey = -1;
  mini = document.createElement("div"); mini.className = "mm3";
  mini.innerHTML = `<div class="mm3-clip"><div class="mm3-plane"><img alt=""><svg class="mm3-vec"></svg></div><div class="mm3-icons"></div></div><b class="mm3-me">${ICON.me}</b><i class="mm3-n">N</i>`;
  document.getElementById("ui")!.appendChild(mini);
  miniPlane = mini.querySelector(".mm3-plane"); miniVec = mini.querySelector(".mm3-vec"); miniIcons = mini.querySelector(".mm3-icons");
}
export function updateMinimap() {
  if (!mini || !miniPlane || !miniVec || !miniIcons) return;
  if (!miniOn || el) { mini.style.display = "none"; return; } mini.style.display = "";
  // fade to 30% when the aim point is over it (ZoinkCN's mod fix, research/duckov-map rule 5)
  { const r = mini.getBoundingClientRect(), a = G.aimPoint.clone().project(G.stage.camera), ax = (a.x * 0.5 + 0.5) * innerWidth, ay = (-a.y * 0.5 + 0.5) * innerHeight; mini.classList.toggle("faded", ax > r.left - 20 && ax < r.right + 20 && ay > r.top - 20 && ay < r.bottom + 20); }
  const l = levelOf(G.pp.x), m = imgs[l]; if (!m) return;
  if (l !== miniLevel) {
    miniLevel = l; (miniPlane.querySelector("img") as HTMLImageElement).src = urlOf(m); miniPlane.style.width = m.w + "px"; miniPlane.style.height = m.h + "px";
    miniVec.setAttribute("viewBox", `0 0 ${m.w} ${m.h}`); miniVec.setAttribute("width", String(m.w)); miniVec.setAttribute("height", String(m.h)); miniTrailKey = -1; miniMarksT = 0;
    mini.classList.toggle("under", l === "under");
  }
  const z = MINI_PX / MINI_RANGE / m.ppu, yaw = G.stage.cam.yaw, p = planePx(m, G.pp.x, G.pp.z);
  const M = new DOMMatrix().translate(MINI_PX / 2, MINI_PX / 2).rotate(deg(yaw)).scale(z).translate(-p.x, -p.y);
  miniPlane.style.transform = M.toString();
  const now = performance.now();
  if (now - miniMarksT > 250) {
    miniMarksT = now; miniMarks = marks(l, pins).filter((k) => k.kind !== "link" || Math.hypot(k.x - G.pp.x, k.z - G.pp.z) < MINI_RANGE);
    const keep = new Set<string>();
    for (const k of miniMarks) {
      let e = miniEls.get(k.id); keep.add(k.id);
      const sig = k.kind + (k.kind === "pin" ? `${k.icon}${k.color}` : "");
      if (!e || e.dataset.sig !== sig) { e?.remove(); e = document.createElement("em"); e.className = "mk " + k.kind; e.dataset.kind = k.kind; e.dataset.sig = sig; e.innerHTML = face(k); miniIcons.appendChild(e); miniEls.set(k.id, e); }
    }
    for (const [id, e] of miniEls) if (!keep.has(id)) { e.remove(); miniEls.delete(id); }
    const key = trail.length * 7 + miniMarks.filter((k) => k.kind === "danger").length * 100000;
    if (key !== miniTrailKey) { miniTrailKey = key; miniVec.innerHTML = dangerSvg(m, miniMarks) + `<g class="trail">${trailPoints(m, l)}</g>`; }
  }
  // icons: inside the ring they sit on their spot; exits, locks and the boss further out pin to the rim as bearings
  const R = MINI_PX / 2 - 12;
  for (const k of miniMarks) {
    const e = miniEls.get(k.id); if (!e) continue;
    const q = M.transformPoint(new DOMPoint((k.x - m.minX) * m.ppu, (k.z - m.minZ) * m.ppu)); let dx = q.x - MINI_PX / 2, dy = q.y - MINI_PX / 2; const d = Math.hypot(dx, dy);
    const rim = k.kind === "exit" || k.kind === "boat" || k.kind === "boss";
    if (d > R) { if (!rim) { e.style.display = "none"; continue; } dx *= R / d; dy *= R / d; e.classList.add("rim"); } else e.classList.remove("rim");
    e.style.display = ""; e.style.transform = `translate(${(MINI_PX / 2 + dx).toFixed(1)}px,${(MINI_PX / 2 + dy).toFixed(1)}px) translate(-50%,-50%)`;
  }
  (mini.querySelector(".mm3-me") as HTMLElement).style.transform = `translate(-50%,-50%) rotate(${deg(yaw - G.moveYaw + Math.PI).toFixed(1)}deg)`;
  const nx = Math.sin(yaw), ny = -Math.cos(yaw); // north (-z, image up) on screen: image-up turned by the map rotation
  (mini.querySelector(".mm3-n") as HTMLElement).style.transform = `translate(${(MINI_PX / 2 + nx * (MINI_PX / 2 - 2)).toFixed(1)}px,${(MINI_PX / 2 + ny * (MINI_PX / 2 - 2)).toFixed(1)}px) translate(-50%,-50%)`;
}
