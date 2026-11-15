// M: the full map, and the corner minimap (map v3, G1.5 rows 07 and 23).
// Duckov's mechanism (research/duckov-re/POLISH_FINDINGS 5, research/duckov-map FINDINGS 3):
//  - one image per subscene, an orthographic capture of the real scene (ours: mapbake.ts, at load, restyled);
//  - the level you are on is shown by default; the other level is a toggle, never a second panel beside it;
//  - camera-aligned (the map turns with the -30 deg camera yaw, a needle shows north), markers stay upright and
//    screen-sized at every zoom, wheel zoom keeps the view centre, the map opens centred on the player;
//  - extracts, level links, pins, the explored trail and the player; the boss as a fixed danger area until spotted,
//    then a moving "?" (ai/enemies.ts bossMarkers()); never regular enemies or loot.
// Ours on top: the demo slice with the north closed (route locks from world/map), a ruled grid, a legend.
// Map v4: like Duckov's (a sprite whose alpha is the level's outline, floating on the map's background), each image is
// cut to its level's shape (mapshape.ts): the island with a sliver of sea, the grotto's chambers, on the map board.
// The image is baked once; per frame only CSS transforms move (the minimap) and only while the M map is open.
import "@fontsource/barlow-condensed/500.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "./map.css";
import * as THREE from "three";
import { G } from "../core/state";
import { CLEARINGS } from "../world/layout";
import { bakeMap, type MapImage } from "./mapbake";
import { SURFACE, UNDER, levelOf, areaLabels, marks, closedPoly, demoEdge, inDemo, underClosed, routeLocks, type Level, type Mark } from "./mapdata";
import { ICON, LEGEND } from "./mapicons";

const imgs: Partial<Record<Level, MapImage>> = {};
const pins: { x: number; z: number }[] = JSON.parse(localStorage.getItem("bv_pins") ?? "[]");
/** the encoded image (mapbake encodes it in the background; if asked before that lands, encode now) */
const urlOf = (m: MapImage) => m.url || (m.url = m.canvas.toDataURL("image/webp", 0.93));
const savePins = () => localStorage.setItem("bv_pins", JSON.stringify(pins));
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
  imgs.under = bakeMap(s, "under", UNDER, 1024, { dim: underClosed });
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
export const mapOpen = () => !!el;
export function toggleMap() { if (el) close(); else open(); }
function close() { cancelAnimationFrame(raf); el?.remove(); el = null; removeEventListener("keydown", onKey, true); }
function onKey(e: KeyboardEvent) { if (e.code === "KeyL" || e.code === "PageUp" || e.code === "PageDown") { setLevel(level === "surface" ? "under" : "surface"); e.preventDefault(); } }

function open(start?: Level) {
  if (!imgs.surface || !imgs.under) return;
  const here = levelOf(G.pp.x);
  el = document.createElement("div"); el.className = "mv3";
  const area = CLEARINGS.find((c) => c.id === G.area)?.name ?? "";
  el.innerHTML = `
  <div class="mv3-panel">
    <i class="brk tl"></i><i class="brk tr"></i><i class="brk bl"></i><i class="brk br"></i>
    <header class="mv3-head">
      <div class="mv3-title"><h2>Banana Grove</h2><small>Field map · Exile Beach to the Old Plantation</small></div>
      <nav class="mv3-tabs">${(["surface", "under"] as Level[]).map((l) => `<button data-l="${l}">${l === "surface" ? "Surface" : "Underground"}${l === here ? `<i class="here">you</i>` : ""}</button>`).join("")}</nav>
      <div class="mv3-where"><span>Location</span><b>${area || (here === "under" ? "Underground" : "Banana Grove")}</b></div>
    </header>
    <div class="tie"></div>
    <div class="mv3-body">
      <div class="mv3-view">
        <div class="mv3-plane"><img alt=""><svg class="mv3-vec"></svg></div>
        <div class="mv3-over"></div>
        <div class="mv3-needle"><b>N</b></div>
        <div class="mv3-scale"><i></i><span>25 m</span></div>
      </div>
      <aside class="mv3-side">
        <h3>Legend</h3>
        <ul>${LEGEND.map(([k, t]) => `<li><span class="ic">${ICON[k]}</span>${t}</li>`).join("")}<li><span class="ic trail-k"></span>Your route this raid</li><li class="closed-row"><span class="ic closed-k"></span><span>Closed until the full game<small>Old Colony, the Vault, the Hollow, Raft Landing and the grotto open after the demo</small></span></li></ul>
        <h3>Raid</h3>
        <dl><dt>Areas found</dt><dd class="num">${[...G.discovered].filter((id) => inDemo(CLEARINGS.find((c) => c.id === id)?.x ?? 0, CLEARINGS.find((c) => c.id === id)?.z ?? 0)).length} / ${areaLabels("surface").length + areaLabels("under").length}</dd><dt>Pins</dt><dd class="num pins">${pins.length}</dd></dl>
      </aside>
    </div>
    <footer class="mv3-keys"><span><b class="a-kbd">M</b>Close</span><span><b class="a-kbd">Wheel</b>Zoom</span><span><b class="a-kbd">Drag</b>Pan</span><span><b class="a-kbd">Click</b>Drop or remove a pin</span><span><b class="a-kbd">L</b>Switch level</span></footer>
  </div>`;
  document.body.appendChild(el);
  addEventListener("keydown", onKey, true);
  el.querySelectorAll<HTMLButtonElement>(".mv3-tabs button").forEach((b) => b.onclick = () => setLevel(b.dataset.l as Level));
  const view = el.querySelector(".mv3-view") as HTMLDivElement;
  view.onwheel = (e) => { e.preventDefault(); zoom = THREE.MathUtils.clamp(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), fit, fit * 6); clampFocus(); place(); };
  let down: { x: number; y: number; fx: number; fy: number; moved: boolean } | null = null;
  view.onpointerdown = (e) => { down = { x: e.clientX, y: e.clientY, fx, fy, moved: false }; view.setPointerCapture(e.pointerId); };
  view.onpointermove = (e) => {
    if (!down) return; const dx = e.clientX - down.x, dy = e.clientY - down.y; if (!down.moved && Math.hypot(dx, dy) < 5) return;
    down.moved = true; view.classList.add("drag");
    const a = -G.stage.cam.yaw, c = Math.cos(a), s = Math.sin(a); // screen delta -> plane delta: undo the rotation and the zoom
    fx = down.fx - (dx * c - dy * s) / zoom; fy = down.fy - (dx * s + dy * c) / zoom; clampFocus(); place();
  };
  view.onpointerup = (e) => {
    view.classList.remove("drag"); const d = down; down = null; if (!d || d.moved) return;
    const r = view.getBoundingClientRect(), p = matrix().inverse().transformPoint(new DOMPoint(e.clientX - r.left, e.clientY - r.top)), m = imgs[level]!;
    const x = m.minX + p.x / m.ppu, z = m.minZ + p.y / m.ppu; if (m.shape.at(x, z) <= 0) return; // the board is not the map
    const k = pins.findIndex((q) => levelOf(q.x) === level && Math.hypot(q.x - x, q.z - z) < 14 / (zoom * m.ppu) + 1.5);
    if (k >= 0) pins.splice(k, 1); else pins.push({ x, z }); savePins();
    (el!.querySelector(".pins") as HTMLElement).textContent = String(pins.length); lastMarks = 0;
  };
  setLevel(start ?? here, true);
  const tick = () => { if (!el) return; update(); raf = requestAnimationFrame(tick); };
  raf = requestAnimationFrame(tick);
}

/** show one level: its image, its labels, its markers. Centred on the player when they are on it */
function setLevel(l: Level, opening = false) {
  if (!el) return; level = l; const m = imgs[l]!;
  el.querySelectorAll<HTMLButtonElement>(".mv3-tabs button").forEach((b) => b.classList.toggle("on", b.dataset.l === l));
  el.classList.toggle("under", l === "under");
  const view = el.querySelector(".mv3-view") as HTMLDivElement, r = view.getBoundingClientRect(); vw = r.width; vh = r.height;
  const plane = el.querySelector(".mv3-plane") as HTMLDivElement; plane.style.width = m.w + "px"; plane.style.height = m.h + "px";
  (plane.querySelector("img") as HTMLImageElement).src = urlOf(m);
  const vec = plane.querySelector(".mv3-vec") as SVGSVGElement; vec.setAttribute("viewBox", `0 0 ${m.w} ${m.h}`); vec.setAttribute("width", String(m.w)); vec.setAttribute("height", String(m.h));
  // fit: the piece's own outline, turned by the camera yaw, inside the view (not the rotated image rectangle)
  const yaw = G.stage.cam.yaw, co = Math.cos(yaw), si = Math.sin(yaw), o = m.shape.outline;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = 0; i < o.length; i += 2) { const sx = o[i] * co - o[i + 1] * si, sy = o[i] * si + o[i + 1] * co; x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy); }
  fit = Math.min(vw / (x1 - x0), vh / (y1 - y0)) * 0.95;
  // the demo area is small enough to show whole on both levels (Moo needs the full picture first; the wheel zooms in
  // around the cursor's centre from there). Focus: the turned box's centre, back in image px
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  zoom = fit; fx = cx * co + cy * si; fy = -cx * si + cy * co;
  // labels: upright, screen-sized, placed each frame from the matrix
  const over = el.querySelector(".mv3-over") as HTMLDivElement; over.innerHTML = ""; markEls = new Map(); labelEls = [];
  for (const a of areaLabels(l)) {
    const d = document.createElement("span"); d.className = "lab" + (a.id === G.area ? " cur" : "") + (G.discovered.has(a.id) ? "" : " new"); d.textContent = a.name; over.appendChild(d); labelEls.push({ el: d, x: a.x, z: a.z });
  }
  if (l === "under" && underClosed) {
    // the grotto is shut for the demo: one caption over it instead of its area names (the cave-in lock sits at its mouth)
    const d = document.createElement("span"), k = routeLocks("under")[0];
    d.className = "lab closed"; d.innerHTML = `Grotto closed<small>${k?.note ?? "Opens after the demo"}</small>`; over.appendChild(d); labelEls.push({ el: d, x: 168, z: 26 });
  }
  const me = document.createElement("b"); me.className = "me"; me.innerHTML = ICON.me; over.appendChild(me); markEls.set("me", me);
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
  const m = imgs[level]!, sc = el.querySelector(".mv3-scale") as HTMLElement; (sc.querySelector("i") as HTMLElement).style.width = (25 * m.ppu * zoom).toFixed(1) + "px";
  const put = (e: HTMLElement, x: number, z: number) => {
    const p = M.transformPoint(new DOMPoint((x - m.minX) * m.ppu, (z - m.minZ) * m.ppu));
    const out = p.x < -40 || p.y < -40 || p.x > vw + 40 || p.y > vh + 40; e.style.display = out ? "none" : "";
    e.style.transform = `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) translate(-50%,-50%)` + (e.dataset.rot ? ` rotate(${e.dataset.rot}deg)` : "");
  };
  // markers first, then the labels, each pushed up or down off any marker or earlier label it would cover (screen space)
  const boxes: { l: number; t: number; r: number; b: number }[] = [];
  // the needle and the scale bar sit over the view: labels step off them too
  const vr = (el.querySelector(".mv3-view") as HTMLElement).getBoundingClientRect();
  for (const q of el.querySelectorAll<HTMLElement>(".mv3-needle, .mv3-scale")) { const r = q.getBoundingClientRect(); boxes.push({ l: r.left - vr.left - 4, t: r.top - vr.top - 4, r: r.right - vr.left + 4, b: r.bottom - vr.top + 4 }); }
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
  me.dataset.rot = deg(G.stage.cam.yaw - G.moveYaw + Math.PI).toFixed(1); put(me, G.pp.x, G.pp.z);
}
/** per frame while open: the boss and pins refresh 4 times a second, positions every frame (the sim keeps running) */
function update() {
  if (!el) return; const now = performance.now(), m = imgs[level]!;
  if (now - lastMarks > 250) {
    lastMarks = now; const list = marks(level, pins), over = el.querySelector(".mv3-over") as HTMLDivElement, keep = new Set(["me"]);
    for (const k of list) {
      let e = markEls.get(k.id); keep.add(k.id);
      if (!e || e.dataset.kind !== k.kind) { e?.remove(); e = document.createElement("em"); e.className = "mk " + k.kind; e.dataset.kind = k.kind; e.innerHTML = ICON[k.kind] + `<span>${k.label}</span>`; over.insertBefore(e, markEls.get("me")!); markEls.set(k.id, e); }
      e.dataset.x = String(k.x); e.dataset.z = String(k.z);
    }
    for (const [id, e] of markEls) if (!keep.has(id)) { e.remove(); markEls.delete(id); }
    const key = trail.length * 7 + (level === "under" ? 1 : 0) + list.filter((k) => k.kind === "danger").length * 100000;
    if (key !== trailKey) { trailKey = key; (el.querySelector(".mv3-vec") as SVGSVGElement).innerHTML = dangerSvg(m, list) + `<g class="trail">${trailPoints(m, level)}</g>`; }
  }
  place();
}

// ---------------------------------------------------------------- corner minimap (camera-up, like the game view)
let mini: HTMLDivElement | null = null, miniPlane: HTMLDivElement | null = null, miniVec: SVGSVGElement | null = null, miniIcons: HTMLDivElement | null = null;
let miniOn = localStorage.getItem("bv_minimap") !== "0", miniLevel: Level | null = null, miniMarksT = 0, miniMarks: Mark[] = [], miniTrailKey = -1;
const miniEls = new Map<string, HTMLElement>();
const MINI_PX = 180, MINI_RANGE = 40; // world units across the circle
export function toggleMinimap() { miniOn = !miniOn; localStorage.setItem("bv_minimap", miniOn ? "1" : "0"); if (mini) mini.style.display = miniOn ? "" : "none"; }
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
      if (!e || e.dataset.kind !== k.kind) { e?.remove(); e = document.createElement("em"); e.className = "mk " + k.kind; e.dataset.kind = k.kind; e.innerHTML = ICON[k.kind]; miniIcons.appendChild(e); miniEls.set(k.id, e); }
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
