// M: the full map of Banana Grove (Duckov.MiniMaps mechanism: a top-down snapshot per sub-level, POI icons, player
// pins saved per map, scroll zoom). Ours: rendered at load with an orthographic camera from the real scene, fogged
// until each area is discovered, plus an "Underground" panel for the grotto.
import * as THREE from "three";
import { G } from "../core/state";
import { CLEARINGS, POI, DOOR, PORTALS } from "../world/layout";
import { exits } from "../world/props";
import { state as gridState } from "../world/grid";

type Shot = { url: string; minX: number; maxX: number; minZ: number; maxZ: number };
let over: Shot | null = null, under: Shot | null = null, el: HTMLDivElement | null = null, zoom = 1;
const pins: { x: number; z: number }[] = JSON.parse(localStorage.getItem("bv_pins") ?? "[]");
function snap(scene: THREE.Scene, minX: number, maxX: number, minZ: number, maxZ: number, px: number): Shot {
  const r = G.stage.renderer, w = px, h = Math.round(px * (maxZ - minZ) / (maxX - minX));
  const cam = new THREE.OrthographicCamera(minX, maxX, -minZ, -maxZ, 1, 200); cam.position.set(0, 120, 0); cam.up.set(0, 0, -1); cam.lookAt(0, 0, 0);
  // looking straight down with up = -z: screen x = world x, screen up = world -z (north)
  cam.left = minX; cam.right = maxX; cam.top = -minZ; cam.bottom = -maxZ; cam.updateProjectionMatrix();
  const rt = new THREE.WebGLRenderTarget(w, h, { colorSpace: THREE.SRGBColorSpace }); const fog = scene.fog; scene.fog = null;
  const hidden: THREE.Object3D[] = []; scene.traverse((o) => { if ((o as THREE.Sprite).isSprite || o === G.rig?.root) { if (o.visible) { hidden.push(o); o.visible = false; } } });
  r.setRenderTarget(rt); r.render(scene, cam); r.setRenderTarget(null); scene.fog = fog; hidden.forEach((o) => (o.visible = true));
  const buf = new Uint8Array(w * h * 4); r.readRenderTargetPixels(rt, 0, 0, w, h, buf); rt.dispose();
  const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d")!, img = x.createImageData(w, h);
  for (let y = 0; y < h; y++) img.data.set(buf.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4); // flip
  x.putImageData(img, 0, 0);
  return { url: c.toDataURL("image/jpeg", 0.85), minX, maxX, minZ, maxZ };
}
export function buildMapShots(scene: THREE.Scene) { over = snap(scene, -60, 60, -72, 76, 900); under = snap(scene, 96, 142, -34, 52, 360); }
export const mapOpen = () => !!el;
/** breadcrumb trail of this raid (research/duckov-map rule 4): a point every ~3 u walked */
const trail: { x: number; z: number }[] = [];
export function resetTrail() { trail.length = 0; }
export function recordTrail() { const l = trail[trail.length - 1]; if (!l || Math.hypot(l.x - G.pp.x, l.z - G.pp.z) > 3) trail.push({ x: G.pp.x, z: G.pp.z }); }
let miniOn = localStorage.getItem("bv_minimap") !== "0";
export function toggleMinimap() { miniOn = !miniOn; localStorage.setItem("bv_minimap", miniOn ? "1" : "0"); if (mini) mini.style.display = miniOn ? "block" : "none"; }
export function toggleMap() { if (el) { el.remove(); el = null; return; } open(); }
function pos(s: Shot, x: number, z: number) { return { l: ((x - s.minX) / (s.maxX - s.minX)) * 100, t: ((z - s.minZ) / (s.maxZ - s.minZ)) * 100 }; }
function open() {
  if (!over || !under) return;
  el = document.createElement("div"); el.className = "mapview"; el.style.pointerEvents = "auto";
  const panel = (s: Shot, title: string, cls: string) => {
    const areas = CLEARINGS.filter((c) => (c.under ? s === under : s === over));
    // fog: dark everywhere except discovered areas (soft-edged ellipses erased from a canvas)
    const fc = document.createElement("canvas"); fc.width = 300; fc.height = Math.round(300 * (s.maxZ - s.minZ) / (s.maxX - s.minX)); const fx = fc.getContext("2d")!;
    fx.fillStyle = "rgba(26,22,18,0.92)"; fx.fillRect(0, 0, fc.width, fc.height); fx.globalCompositeOperation = "destination-out";
    for (const c of areas) if (G.discovered.has(c.id)) { const p = pos(s, c.x, c.z), rx = (c.rx * 1.7 / (s.maxX - s.minX)) * fc.width, rz = (c.rz * 1.7 / (s.maxZ - s.minZ)) * fc.height;
      const g = fx.createRadialGradient(0, 0, 0, 0, 0, 1); g.addColorStop(0.6, "rgba(0,0,0,1)"); g.addColorStop(1, "rgba(0,0,0,0)");
      fx.save(); fx.translate((p.l / 100) * fc.width, (p.t / 100) * fc.height); fx.scale(rx, rz); fx.fillStyle = g; fx.beginPath(); fx.arc(0, 0, 1, 0, 7); fx.fill(); fx.restore(); }
    const fog = `<img class="fogimg" src="${fc.toDataURL()}">`;
    const labels = areas.map((c) => { const p = pos(s, c.x, c.z); const known = G.discovered.has(c.id); return `<span class="lab ${known ? "" : "unk"}" style="left:${p.l}%;top:${p.t}%;transform:translate(-50%,-50%) rotate(${(-G.stage.cam.yaw * 180) / Math.PI}deg)">${known ? c.name : "?"}</span>`; }).join("");
    const icons = [
      ...exits.filter((e) => e.open && (e.x > 90) === (s === under)).map((e) => ({ x: e.x, z: e.z, i: e.id === "raft" ? "🛶" : e.id === "tunnel" ? "🕳️" : "🏠", t: e.id === "raft" ? "Raft (+30%)" : e.id === "tunnel" ? "Smuggler Tunnel" : "Hatch home" })),
      ...(s === over ? [{ x: DOOR.x, z: DOOR.z, i: gridState.doorOpen ? "🚪" : "🔒", t: "Vine door" }] : []),
      ...PORTALS.flatMap((p) => [p.a, p.b].filter((q) => (q.x > 90) === (s === under)).map((q) => ({ x: q.x, z: q.z, i: "⬇", t: p.label }))),
      ...pins.filter((q) => (q.x > 90) === (s === under)).map((q) => ({ x: q.x, z: q.z, i: "📍", t: "your pin (click to remove)" })),
    ].map((o) => { const p = pos(s, o.x, o.z); return `<em class="ico" title="${o.t}" style="left:${p.l}%;top:${p.t}%;transform:translate(-50%,-50%) rotate(${(-G.stage.cam.yaw * 180) / Math.PI}deg)">${o.i}</em>`; }).join("");
    const me = (G.pp.x > 90) === (s === under) ? (() => { const p = pos(s, G.pp.x, G.pp.z); return `<b class="me" style="left:${p.l}%;top:${p.t}%;transform:translate(-50%,-50%) rotate(${-G.moveYaw + Math.PI}rad)">▲</b>`; })() : "";
    // breadcrumb trail: an svg polyline in the image's own percentage space
    const pts = trail.filter((q) => (q.x > 90) === (s === under)).map((q) => { const p = pos(s, q.x, q.z); return `${p.l.toFixed(2)},${p.t.toFixed(2)}`; }).join(" ");
    const crumbs = pts ? `<svg class="trail" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="${pts}"/></svg>` : "";
    // rotated to the camera's yaw (Duckov's map follows its -30 deg camera) so map left/right = screen left/right
    const rot = (G.stage.cam.yaw * 180) / Math.PI;
    return `<div class="mp ${cls}" data-s="${s === over ? "o" : "u"}"><h3>${title}</h3><div class="mrot" style="transform:rotate(${rot}deg)"><div class="mimg" style="aspect-ratio:${s.maxX - s.minX}/${s.maxZ - s.minZ}"><img src="${s.url}">${fog}${crumbs}${labels}${icons}${me}</div></div></div>`;
  };
  el.innerHTML = `<div class="mwrap" style="transform:scale(${zoom})">${panel(over, "Banana Grove", "big")}${panel(under, "Underground", "small")}</div><div class="mneedle" style="transform:rotate(${(G.stage.cam.yaw * 180) / Math.PI}deg)">N</div><div class="mfoot"><kbd>M</kbd> close, scroll to zoom, click to drop or remove a pin. Areas found: ${[...G.discovered].length} of ${CLEARINGS.length}</div>`;
  document.body.appendChild(el);
  el.onwheel = (e) => { zoom = THREE.MathUtils.clamp(zoom * (e.deltaY < 0 ? 1.1 : 0.9), 0.7, 2.5); (el!.querySelector(".mwrap") as HTMLElement).style.transform = `scale(${zoom})`; };
  el.querySelectorAll<HTMLElement>(".mimg").forEach((m) => m.onclick = (e) => {
    const s = (m.parentElement!.dataset.s === "o" ? over : under)!, r = m.getBoundingClientRect();
    const x = s.minX + ((e.clientX - r.left) / r.width) * (s.maxX - s.minX), z = s.minZ + ((e.clientY - r.top) / r.height) * (s.maxZ - s.minZ);
    const k = pins.findIndex((q) => Math.hypot(q.x - x, q.z - z) < 4); if (k >= 0) pins.splice(k, 1); else pins.push({ x, z });
    localStorage.setItem("bv_pins", JSON.stringify(pins)); toggleMap(); toggleMap();
  });
  void POI;
}

// ---------------------------------------------------------------- corner minimap (camera-up, like the game view)
let mini: HTMLDivElement | null = null, miniImg: HTMLDivElement | null = null, miniFog: HTMLCanvasElement | null = null, fogKey = "";
const MINI_PX = 190, MINI_RANGE = 38; // world units across the circle
export function buildMinimap() {
  if (!over) return; mini?.remove();
  mini = document.createElement("div"); mini.className = "minimap";
  mini.innerHTML = `<div class="mm-rot"><div class="mm-img"></div><canvas class="mm-fog"></canvas><div class="mm-icons"></div></div><b class="mm-me">▲</b><i class="mm-n">N</i>`;
  document.getElementById("ui")!.appendChild(mini);
  miniImg = mini.querySelector(".mm-img") as HTMLDivElement; miniFog = mini.querySelector(".mm-fog") as HTMLCanvasElement; fogKey = "";
}
export function updateMinimap() {
  if (!mini || !over || !miniImg || !miniFog) return;
  if (!miniOn) { mini.style.display = "none"; return; } mini.style.display = "block";
  { const r = mini.getBoundingClientRect(), a = G.aimPoint.clone().project(G.stage.camera), ax = (a.x * 0.5 + 0.5) * innerWidth, ay = (-a.y * 0.5 + 0.5) * innerHeight; mini.style.opacity = ax > r.left - 20 && ax < r.right + 20 && ay > r.top - 20 && ay < r.bottom + 20 ? "0.3" : "1"; }
  const isUnder = G.pp.x > 90, shot = isUnder ? under : over; if (!shot) return;
  const W = shot.maxX - shot.minX, H = shot.maxZ - shot.minZ, scale = MINI_PX / MINI_RANGE; // px per world unit
  const rot = mini.querySelector(".mm-rot") as HTMLDivElement;
  // the camera looks along yaw; screen-up is world direction -(sin yaw, cos yaw); rotate the north-up image so that is up
  rot.style.transform = `rotate(${(G.stage.cam.yaw * 180) / Math.PI}deg)`;
  const ox = (G.pp.x - shot.minX) * scale, oz = (G.pp.z - shot.minZ) * scale;
  for (const el of [miniImg, miniFog]) { el.style.width = W * scale + "px"; el.style.height = H * scale + "px"; el.style.left = MINI_PX / 2 - ox + "px"; el.style.top = MINI_PX / 2 - oz + "px"; }
  miniImg.style.backgroundImage = `url(${shot.url})`;
  const key = (isUnder ? "u" : "o") + [...G.discovered].join(",");
  if (key !== fogKey) { fogKey = key; drawFog(miniFog, shot); }
  // nearby icons: exits, the door, pins
  const icons = [...exits.filter((e) => e.open).map((e) => ({ x: e.x, z: e.z, i: e.id === "raft" ? "🛶" : e.id === "tunnel" ? "🕳️" : "🏠" })), { x: DOOR.x, z: DOOR.z, i: gridState.doorOpen ? "🚪" : "🔒" }, ...pins.map((q) => ({ x: q.x, z: q.z, i: "📍" }))]
    .filter((o) => (o.x > 90) === isUnder && Math.hypot(o.x - G.pp.x, o.z - G.pp.z) < MINI_RANGE * 0.7);
  (mini.querySelector(".mm-icons") as HTMLDivElement).innerHTML = icons.map((o) => `<em style="left:${MINI_PX / 2 + (o.x - G.pp.x) * scale}px;top:${MINI_PX / 2 + (o.z - G.pp.z) * scale}px;transform:translate(-50%,-50%) rotate(${(-G.stage.cam.yaw * 180) / Math.PI}deg)">${o.i}</em>`).join("");
  (mini.querySelector(".mm-me") as HTMLElement).style.transform = `translate(-50%,-50%) rotate(${((G.stage.cam.yaw - G.moveYaw + Math.PI) * 180) / Math.PI}deg)`;
  (mini.querySelector(".mm-n") as HTMLElement).style.transform = `rotate(${(G.stage.cam.yaw * 180) / Math.PI}deg) translateY(-${MINI_PX / 2 - 10}px) rotate(${(-G.stage.cam.yaw * 180) / Math.PI}deg)`;
}
function drawFog(c: HTMLCanvasElement, s: Shot) {
  c.width = 240; c.height = Math.round(240 * (s.maxZ - s.minZ) / (s.maxX - s.minX)); const x = c.getContext("2d")!;
  x.fillStyle = "rgba(26,22,18,0.9)"; x.fillRect(0, 0, c.width, c.height); x.globalCompositeOperation = "destination-out";
  for (const a of CLEARINGS) if (G.discovered.has(a.id) && (a.under ?? false) === (s === under)) {
    const p = pos(s, a.x, a.z), rx = (a.rx * 1.8 / (s.maxX - s.minX)) * c.width, rz = (a.rz * 1.8 / (s.maxZ - s.minZ)) * c.height;
    const g = x.createRadialGradient(0, 0, 0, 0, 0, 1); g.addColorStop(0.55, "rgba(0,0,0,1)"); g.addColorStop(1, "rgba(0,0,0,0)");
    x.save(); x.translate((p.l / 100) * c.width, (p.t / 100) * c.height); x.scale(rx, rz); x.fillStyle = g; x.beginPath(); x.arc(0, 0, 1, 0, 7); x.fill(); x.restore();
  }
}
