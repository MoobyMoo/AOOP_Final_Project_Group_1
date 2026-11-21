// The vault's way out (G1.5 row 33): the Banana Express, a big brass office mail tube that fires a monkey up to the
// island, and the departures board beside it. E at either opens the destination view; an entry opens a confirm step
// with the fare; Launch pays once (core/deployment.ts), waits 0.5 s like Duckov's MapSelectionView, plays the pod
// (step in, squash, whoosh up the pipe), then the loading curtain covers the raid build.
// The models are the vault kit's vault_pod and vault_board (home/vaultkit.ts); if the kit is missing, plain blockouts.
import * as THREE from "three";
import type { SaveV1 } from "../contracts";
import { mat } from "../render/shading";
import { DESTINATIONS, destOf, destinationState } from "../core/deployment";
import { mapCrop } from "../ui/mapview";
import { vaultModel } from "./vaultkit";
import { departureReadiness } from "../core/loadout";
import { itemDef } from "../loot/tables";

const brass = () => mat("#c29a5b", { rough: 0.35 }), dark = () => mat("#23272a", { rough: 0.7 });
function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, parent?: THREE.Object3D) {
  const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; parent?.add(o); return o;
}

// ---------------------------------------------------------------- the pod (3 x 3 cells, front +z)
/** door: the leaf, pivot on its hinge (rotation.y 0 shut, POD_DOOR_OPEN open). gauge: the needle, pivot on the dial's
 *  axle (rotation.z POD_GAUGE_REST at rest, falling as the pressure climbs). lamp: the ready light, on its own
 *  material (lamp_emit) so its colour can change. */
export type Pod = { root: THREE.Group; gauge: THREE.Object3D; lamp: THREE.Mesh; puffAt: THREE.Vector3; door: THREE.Object3D };
export const POD_DOOR_OPEN = -1.9, POD_GAUGE_REST = 1.9;
const lampMat = () => { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color("#7dff8a").multiplyScalar(2.2), toneMapped: false }); m.name = "lamp_emit"; return m; };
export function makePod(): Pod {
  try {
    const root = vaultModel("vault_pod"), door = root.getObjectByName("pod_door"), gauge = root.getObjectByName("pod_needle"), lamp = root.getObjectByName("pod_lamp") as THREE.Mesh | undefined;
    if (!door || !gauge || !lamp?.isMesh) throw new Error("vault_pod: a named node is missing");
    lamp.material = lampMat();
    door.rotation.y = POD_DOOR_OPEN; gauge.rotation.z = POD_GAUGE_REST;
    return { root, gauge, lamp, puffAt: new THREE.Vector3(0, 0.5, 0), door };
  } catch (e) { console.warn("pod: vault kit missing, blockout", e); return blockoutPod(); }
}
function blockoutPod(): Pod {
  const root = new THREE.Group(); root.name = "pod";
  mesh(new THREE.CylinderGeometry(1.42, 1.5, 0.36, 28), dark(), 0, 0.18, 0, root);
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 1.02, 3.1, 28, 1, true), new THREE.MeshStandardMaterial({ color: "#bfe8ff", transparent: true, opacity: 0.22, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false }));
  glass.position.y = 1.95; root.add(glass);
  mesh(new THREE.CylinderGeometry(1.2, 1.12, 0.5, 28), brass(), 0, 3.75, 0, root);
  const door = new THREE.Group(); door.position.set(-0.62, 0.42, 0.82); root.add(door);
  mesh(new THREE.BoxGeometry(1.3, 2.9, 0.06), brass(), 0.62, 1.45, 0, door); door.rotation.y = POD_DOOR_OPEN;
  const gauge = mesh(new THREE.BoxGeometry(0.025, 0.16, 0.01), mat("#b2321f"), 1.25, 1.3, 1.135, root); gauge.geometry.translate(0, 0.07, 0); gauge.rotation.z = POD_GAUGE_REST;
  const lamp = mesh(new THREE.SphereGeometry(0.13, 14, 10), lampMat(), 0.9, 4.1, 0.9, root);
  return { root, gauge, lamp, puffAt: new THREE.Vector3(0, 0.5, 0), door };
}

// ---------------------------------------------------------------- the departures board (2 x 1 cells)
export type Board = { root: THREE.Group; refresh(save: SaveV1): void };
const FLAP = '700 25px "IBM Plex Mono", "DejaVu Sans Mono", monospace';
/** one row of split-flap cells: a dark tile per character with the hinge line across its middle */
function flaps(x: CanvasRenderingContext2D, text: string, x0: number, y: number, n: number, fg: string, right = false) {
  const w = 20, h = 38, gap = 2, t = right ? text.slice(0, n).padStart(n) : text.slice(0, n).padEnd(n);
  x.font = FLAP; x.textAlign = "center"; x.textBaseline = "middle";
  for (let i = 0; i < n; i++) {
    const cx = x0 + i * (w + gap);
    x.fillStyle = "#26282d"; x.fillRect(cx, y - h / 2, w, h);
    if (t[i] !== " ") { x.fillStyle = fg; x.fillText(t[i], cx + w / 2, y + 2); }
    x.fillStyle = "#0f1012"; x.fillRect(cx, y - 1, w, 2);
  }
}
export function makeBoard(): Board {
  const c = document.createElement("canvas"); c.width = 512; c.height = 320; const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const faceMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  let root: THREE.Group;
  try {
    root = vaultModel("vault_board");
    const face = root.getObjectByName("board_face") as THREE.Mesh | undefined;
    if (!face?.isMesh) throw new Error("vault_board: board_face is missing");
    // the kit ships no UVs: map the panel's own bounds to 0..1 (x across, y up; the panel only leans back about x)
    const g = face.geometry = face.geometry.clone(); g.computeBoundingBox();
    const bb = g.boundingBox!, pos = g.attributes.position, uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) { uv[i * 2] = (pos.getX(i) - bb.min.x) / (bb.max.x - bb.min.x); uv[i * 2 + 1] = (pos.getY(i) - bb.min.y) / (bb.max.y - bb.min.y); }
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    face.material = faceMat; face.castShadow = false;
  } catch (e) {
    console.warn("board: vault kit missing, blockout", e);
    root = new THREE.Group(); root.name = "board";
    for (const x of [-0.9, 0.9]) mesh(new THREE.BoxGeometry(0.1, 2.6, 0.1), brass(), x, 1.3, 0, root);
    mesh(new THREE.BoxGeometry(1.95, 1.25, 0.12), dark(), 0, 1.85, 0, root);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.85, 1.15), faceMat); face.position.set(0, 1.85, 0.065); root.add(face);
  }
  function refresh(save: SaveV1) {
    const x = c.getContext("2d")!; x.fillStyle = "#15171a"; x.fillRect(0, 0, 512, 320);
    x.fillStyle = "#c29a5b"; x.font = `700 44px "Barlow Condensed", "Arial Narrow", sans-serif`; x.textAlign = "left"; x.textBaseline = "middle"; x.fillText("DEPARTURES", 20, 40);
    x.font = `600 22px "Barlow Condensed", "Arial Narrow", sans-serif`; x.textAlign = "right"; x.fillStyle = "#8a7a5c"; x.fillText("FARE", 492, 46);
    x.fillStyle = "#3b3940"; x.fillRect(20, 70, 472, 3);
    DESTINATIONS.forEach((d, i) => {
      const st = destinationState(d.id, save), y = 112 + i * 56;
      if (y > 300) return;
      let name = d.name.toUpperCase(); while (name.length > 16 && name.includes(" ")) name = name.slice(0, name.lastIndexOf(" ")); // whole words only
      flaps(x, name, 20, y, 16, st.unlocked ? "#f3ead6" : "#7d7568");
      flaps(x, !st.unlocked ? "LOCK" : d.cost ? `${d.cost}` : "FREE", 406, y, 4, !st.unlocked ? "#7d7568" : d.cost ? "#f3d48a" : "#7dff8a", true);
    });
    tex.needsUpdate = true;
  }
  return { root, refresh };
}

// ---------------------------------------------------------------- the destination view and the confirm step (ui3 panels)
const fare = (cost: number) => (cost ? `🍌 ${cost}` : "Free");
const crop = (id: string) => { const d = destOf(id)!; return mapCrop(d.preview.x, d.preview.z, d.preview.r) ?? ""; };
export function destinationsHtml(save: SaveV1) {
  const cards = DESTINATIONS.map((d) => {
    const st = destinationState(d.id, save), img = crop(d.id);
    const tail = !st.unlocked ? `<em class="dlock">🔒 ${st.reason}</em>` : !st.affordable ? `<em class="dlock">${st.reason}</em>` : `<em class="dgo">Pick</em>`;
    return `<button class="dcard${st.ok ? "" : " locked"}" data-a="dest:${d.id}" ${st.ok ? "" : "disabled"} aria-label="${d.name}">
      <span class="dimg">${img ? `<img src="${img}" alt="">` : ""}</span>
      <span class="dbody"><b>${d.name}</b><small>${d.blurb}</small><span class="dfoot"><span class="dfare num">${fare(d.cost)}</span>${tail}</span></span></button>`;
  }).join("");
  return `<header><h2>Banana Express</h2><small class="num">🍌 ${save.money}</small></header><p class="quote">"Keep your arms inside the tube."</p><div class="dest3">${cards}</div>`;
}
export function confirmHtml(id: string, save: SaveV1) {
  const d = destOf(id)!, img = crop(id), left = save.money - d.cost;
  const check = departureReadiness(save);
  const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const healCounts = new Map<string, number>();
  for (const inst of check.supplies) { const name = itemDef(inst).name; healCounts.set(name, (healCounts.get(name) ?? 0) + 1); }
  const checklist = `<section class="departure-check" aria-label="Departure checklist"><h3>Loadout check</h3>
    <dl><dt>Weapons</dt><dd>${check.guns.map(g => esc(g.name)).join(" · ") || "Briefcase only"}</dd>
    <dt>Ammunition</dt><dd>${[...new Set(check.guns.map(g => `${g.ammoName}: ${g.rounds} rounds`))].map(esc).join(" · ") || "No firearm equipped"}</dd>
    <dt>Healing supplies</dt><dd>${[...healCounts].map(([name, count]) => `${esc(name)} ×${count}`).join(" · ") || "None"}</dd>
    <dt>Pack slots</dt><dd>Used ${check.used} / ${check.slots} · Free ${check.free}</dd>
    <dt>Carry weight</dt><dd>${check.weight.toFixed(1)} / ${check.limit} kg</dd></dl>
    <p>Up to 3 healing items are packed automatically. Ammo shown is shared by caliber, including rounds loaded on arrival.</p>
    ${check.warnings.length ? `<ul class="departure-warnings" role="status">${check.warnings.map(w => `<li>${esc(w)}</li>`).join("")}</ul><p>You can still launch with this loadout.</p>` : `<p class="departure-ready">Ready to depart</p>`}</section>`;
  return `<header><h2>Confirm departure</h2><small class="num">🍌 ${save.money}</small></header>
    <div class="dconf">${img ? `<img src="${img}" alt="">` : ""}<div><b>${d.name}</b><p>${d.blurb}</p></div></div>
    <div class="total"><span>Fare</span><b class="num">${fare(d.cost)}</b></div>
    <p class="dim fare-note">${d.cost ? `Paid once when you press Launch. You'll have 🍌 ${left} left.` : "No fare on this route."}</p>
    ${checklist}
    <div class="actions"><button data-a="launch:${d.id}" class="launch">Launch</button><button class="ghost" data-a="dests">Back</button></div>`;
}

// ---------------------------------------------------------------- the loading curtain (Duckov SceneLoader's curtain scene)
let curtain: HTMLDivElement | null = null;
export function showCurtain(name: string, region: string) {
  curtain?.remove();
  curtain = document.createElement("div"); curtain.className = "curtain3";
  curtain.innerHTML = `<div class="cbox"><span class="ctag">Banana Express · now arriving</span><h1>${name}</h1><small>${region}</small><div class="tie"></div><i class="cdots"><b></b><b></b><b></b></i></div>`;
  document.body.appendChild(curtain);
  requestAnimationFrame(() => curtain?.classList.add("on"));
}
export function hideCurtain(delay = 450) {
  const c = curtain; curtain = null; if (!c) return;
  setTimeout(() => { c.classList.remove("on"); setTimeout(() => c.remove(), 400); }, delay);
}
export const curtainUp = () => !!curtain;
