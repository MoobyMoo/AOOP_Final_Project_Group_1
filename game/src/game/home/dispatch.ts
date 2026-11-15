// The vault's way out (G1.5 row 33): the Banana Express, a big brass office mail tube that fires a monkey up to the
// island, and the departures board beside it. E at either opens the destination view; an entry opens a confirm step
// with the fare; Launch pays once (core/deployment.ts), waits 0.5 s like Duckov's MapSelectionView, plays the pod
// (step in, squash, whoosh up the pipe), then the loading curtain covers the raid build.
// PLACEHOLDER models (clean blockouts) until Fable's pod and board land: see the TODO in the report / CHECKLIST.
import * as THREE from "three";
import type { SaveV1 } from "../contracts";
import { mat } from "../render/shading";
import { DESTINATIONS, destOf, destinationState } from "../core/deployment";
import { mapCrop } from "../ui/mapview";

const brass = () => mat("#c29a5b", { rough: 0.35 }), steel = () => mat("#3b4246", { rough: 0.6 }), dark = () => mat("#23272a", { rough: 0.7 });
function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, parent?: THREE.Object3D) {
  const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; parent?.add(o); return o;
}
function label(text: string, w: number, h: number, o: { bg?: string; fg?: string; font?: string } = {}) {
  const c = document.createElement("canvas"); c.width = 512; c.height = Math.round((512 * h) / w); const x = c.getContext("2d")!;
  x.fillStyle = o.bg ?? "#1d1c20"; x.fillRect(0, 0, c.width, c.height);
  x.strokeStyle = "#c29a5b"; x.lineWidth = 8; x.strokeRect(6, 6, c.width - 12, c.height - 12);
  x.fillStyle = o.fg ?? "#f3d48a"; x.font = o.font ?? `700 ${Math.round(c.height * 0.5)}px "Barlow Condensed", "Arial Narrow", sans-serif`; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(text, c.width / 2, c.height / 2 + 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
}

// ---------------------------------------------------------------- the pod (3 x 3 cells, front +z)
export type Pod = { root: THREE.Group; gauge: THREE.Object3D; lamp: THREE.Mesh; puffAt: THREE.Vector3; door: THREE.Object3D };
export function makePod(): Pod {
  const root = new THREE.Group(); root.name = "pod";
  mesh(new THREE.CylinderGeometry(1.42, 1.5, 0.36, 28), steel(), 0, 0.18, 0, root);                  // plinth
  mesh(new THREE.TorusGeometry(1.32, 0.07, 8, 32), brass(), 0, 0.37, 0, root).rotation.x = Math.PI / 2;
  mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.06, 28), mat("#5a4a32", { rough: 0.5 }), 0, 0.39, 0, root); // brass floor plate
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 1.02, 3.1, 28, 1, true), new THREE.MeshStandardMaterial({ color: "#bfe8ff", transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.2, side: THREE.DoubleSide, depthWrite: false }));
  glass.position.y = 1.95; glass.renderOrder = 2; root.add(glass);
  for (const y of [0.55, 1.6, 2.55, 3.45]) mesh(new THREE.TorusGeometry(1.05, 0.06, 8, 32), brass(), 0, y, 0, root).rotation.x = Math.PI / 2;
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.1, 6), brass(), Math.sin(a) * 1.05, 1.95, Math.cos(a) * 1.05, root); }
  mesh(new THREE.CylinderGeometry(1.2, 1.12, 0.5, 28), brass(), 0, 3.75, 0, root);                    // cap
  mesh(new THREE.CylinderGeometry(0.55, 1.12, 0.6, 24), mat("#a8834c", { rough: 0.4 }), 0, 4.3, 0, root); // funnel
  // the pipe: up from the funnel, an elbow, and back into the wall (the vault wall is 6.4 u tall)
  const pipe = () => mat("#9a7a48", { rough: 0.4 });
  mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.8, 20), pipe(), 0, 5.0, 0, root);
  // quarter elbow in the y-z plane: from the vertical pipe's top (0, 5.4, 0) round to (0, 6.2, -0.8), heading for the wall
  const elbow = mesh(new THREE.TorusGeometry(0.8, 0.55, 14, 20, Math.PI / 2), pipe(), 0, 5.4, -0.8, root); elbow.rotation.y = -Math.PI / 2;
  mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.9, 20), pipe(), 0, 6.2, -1.2, root).rotation.x = Math.PI / 2;
  for (const y of [4.75, 5.3]) mesh(new THREE.TorusGeometry(0.58, 0.06, 8, 24), brass(), 0, y, 0, root).rotation.x = Math.PI / 2;
  const sign = label("BANANA EXPRESS", 1.9, 0.38); sign.position.set(0, 3.75, 1.215); root.add(sign);
  // the door: a brass-framed glass leaf on the front that swings shut before the launch (hinge on its -x edge)
  const door = new THREE.Group(); door.position.set(-0.62, 0.42, 0.82); root.add(door);
  mesh(new THREE.BoxGeometry(0.06, 2.9, 0.06), brass(), 0, 1.45, 0, door); mesh(new THREE.BoxGeometry(0.06, 2.9, 0.06), brass(), 1.24, 1.45, 0, door);
  mesh(new THREE.BoxGeometry(1.3, 0.06, 0.06), brass(), 0.62, 2.9, 0, door);
  door.rotation.y = -1.9; // open
  // pressure gauge on a post at the front right, and a ready lamp
  const post = mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.2, 8), dark(), 1.25, 0.6, 1.05, root); void post;
  const dial = mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 20), brass(), 1.25, 1.3, 1.08, root); dial.rotation.x = Math.PI / 2;
  mesh(new THREE.CircleGeometry(0.18, 20), mat("#f3ead6", { rough: 0.6 }), 1.25, 1.3, 1.125, root);
  const gauge = mesh(new THREE.BoxGeometry(0.025, 0.16, 0.01), mat("#b2321f"), 1.25, 1.3, 1.135, root); gauge.geometry.translate(0, 0.07, 0); gauge.rotation.z = 1.9;
  const lamp = mesh(new THREE.SphereGeometry(0.13, 14, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color("#7dff8a").multiplyScalar(2.2), toneMapped: false }), 0.9, 4.1, 0.9, root);
  return { root, gauge, lamp, puffAt: new THREE.Vector3(0, 0.5, 0), door };
}

// ---------------------------------------------------------------- the departures board (2 x 1 cells)
export type Board = { root: THREE.Group; refresh(save: SaveV1): void };
export function makeBoard(): Board {
  const root = new THREE.Group(); root.name = "board";
  for (const x of [-0.9, 0.9]) mesh(new THREE.BoxGeometry(0.1, 2.6, 0.1), brass(), x, 1.3, 0, root);
  mesh(new THREE.BoxGeometry(1.95, 1.25, 0.12), dark(), 0, 1.85, 0, root);
  mesh(new THREE.BoxGeometry(2.05, 0.1, 0.22), brass(), 0, 2.53, 0, root);
  const c = document.createElement("canvas"); c.width = 512; c.height = 320; const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.85, 1.15), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); face.position.set(0, 1.85, 0.065); root.add(face);
  function refresh(save: SaveV1) {
    const x = c.getContext("2d")!; x.fillStyle = "#15171a"; x.fillRect(0, 0, 512, 320);
    x.fillStyle = "#c29a5b"; x.font = `700 46px "Barlow Condensed", "Arial Narrow", sans-serif`; x.textAlign = "left"; x.textBaseline = "middle"; x.fillText("DEPARTURES", 24, 42);
    x.fillStyle = "#3b3940"; x.fillRect(24, 74, 464, 3);
    DESTINATIONS.forEach((d, i) => {
      const st = destinationState(d.id, save), y = 124 + i * 78;
      x.fillStyle = "#23262a"; x.fillRect(18, y - 30, 476, 60);
      x.fillStyle = st.unlocked ? "#f3ead6" : "#7d7568"; x.font = `600 38px "Barlow Condensed", "Arial Narrow", sans-serif`; x.textAlign = "left"; x.fillText(d.name.toUpperCase(), 32, y + 2);
      x.textAlign = "right"; x.fillStyle = !st.unlocked ? "#7d7568" : d.cost ? "#f3d48a" : "#7dff8a"; x.fillText(!st.unlocked ? "LOCKED" : d.cost ? `${d.cost}` : "FREE", 482, y + 2);
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
  return `<header><h2>Confirm departure</h2><small class="num">🍌 ${save.money}</small></header>
    <div class="dconf">${img ? `<img src="${img}" alt="">` : ""}<div><b>${d.name}</b><p>${d.blurb}</p></div></div>
    <div class="total"><span>Fare</span><b class="num">${fare(d.cost)}</b></div>
    <p class="dim">${d.cost ? `Paid once when you press Launch. You'll have 🍌 ${left} left.` : "No fare on this route."}</p>
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
