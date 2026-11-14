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
    const labels = areas.map((c) => { const p = pos(s, c.x, c.z); const known = G.discovered.has(c.id); return `<span class="lab ${known ? "" : "unk"}" style="left:${p.l}%;top:${p.t}%">${known ? c.name : "?"}</span>`; }).join("");
    const icons = [
      ...exits.filter((e) => e.open && (e.x > 90) === (s === under)).map((e) => ({ x: e.x, z: e.z, i: e.id === "raft" ? "🛶" : e.id === "tunnel" ? "🕳️" : "🏠", t: e.id === "raft" ? "Raft (+30%)" : e.id === "tunnel" ? "Smuggler Tunnel" : "Hatch home" })),
      ...(s === over ? [{ x: DOOR.x, z: DOOR.z, i: gridState.doorOpen ? "🚪" : "🔒", t: "Vine door" }] : []),
      ...PORTALS.flatMap((p) => [p.a, p.b].filter((q) => (q.x > 90) === (s === under)).map((q) => ({ x: q.x, z: q.z, i: "⬇", t: p.label }))),
      ...pins.filter((q) => (q.x > 90) === (s === under)).map((q) => ({ x: q.x, z: q.z, i: "📍", t: "your pin (click to remove)" })),
    ].map((o) => { const p = pos(s, o.x, o.z); return `<em class="ico" title="${o.t}" style="left:${p.l}%;top:${p.t}%">${o.i}</em>`; }).join("");
    const me = (G.pp.x > 90) === (s === under) ? (() => { const p = pos(s, G.pp.x, G.pp.z); return `<b class="me" style="left:${p.l}%;top:${p.t}%;transform:translate(-50%,-50%) rotate(${-G.moveYaw + Math.PI}rad)">▲</b>`; })() : "";
    return `<div class="mp ${cls}" data-s="${s === over ? "o" : "u"}"><h3>${title}</h3><div class="mimg" style="aspect-ratio:${s.maxX - s.minX}/${s.maxZ - s.minZ}"><img src="${s.url}">${fog}${labels}${icons}${me}</div></div>`;
  };
  el.innerHTML = `<div class="mwrap" style="transform:scale(${zoom})">${panel(over, "Banana Grove", "big")}${panel(under, "Underground", "small")}</div><div class="mfoot">M / Esc close · scroll to zoom · click to drop or remove a pin · discovered ${[...G.discovered].length}/${CLEARINGS.length}</div>`;
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
