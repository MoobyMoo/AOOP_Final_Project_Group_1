// NPC portraits for the dialogue panel: the NPC's own rig (story/npcs.ts npcRig) rendered once, head and shoulders,
// into a small image with the game's renderer. Cached per NPC; a failure falls back to a lettered badge.
import * as THREE from "three";
import { G } from "../core/state";
import type { NpcId } from "../core/quests";
import { npcRig } from "./npcs";

const cache = new Map<NpcId, string>();
const SIZE = 256;
export function portrait(id: NpcId): string {
  const hit = cache.get(id); if (hit) return hit;
  let url = "";
  try { url = render(id); } catch (e) { console.warn("portrait failed", id, e); }
  if (url) cache.set(id, url);
  return url;
}
function render(id: NpcId): string {
  const r = G.stage?.renderer; if (!r) return "";
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight("#fff4e0", "#5a4a3a", 1.6));
  const key = new THREE.DirectionalLight("#ffe6c4", 3.2); key.position.set(1.4, 2.6, 2.4); scene.add(key);
  const rim = new THREE.DirectionalLight("#9fc4ff", 1.6); rim.position.set(-2, 1.8, -1.5); scene.add(rim);
  const rig = npcRig(id); scene.add(rig.root);
  rig.pose({ time: 1.3, speed: 0, moveYaw: 0, faceYaw: 0.25, action: "idle", actionT: 0, armed: "none", flash: 0 });
  rig.root.rotation.y = -0.35; rig.root.updateMatrixWorld(true);
  const head = new THREE.Vector3(); rig.sockets.head.getWorldPosition(head);
  const cam = new THREE.PerspectiveCamera(24, 1, 0.05, 20); cam.position.set(head.x + 0.55, head.y + 0.1, head.z + 4.4); cam.lookAt(head.x, head.y - 0.42, head.z);
  const rt = new THREE.WebGLRenderTarget(SIZE, SIZE, { samples: 4 }); rt.texture.colorSpace = THREE.SRGBColorSpace;
  const prev = r.getRenderTarget(), prevClear = r.getClearAlpha(), prevColor = r.getClearColor(new THREE.Color());
  r.setRenderTarget(rt); r.setClearColor("#000000", 0); r.clear(); r.render(scene, cam);
  const px = new Uint8Array(SIZE * SIZE * 4); r.readRenderTargetPixels(rt, 0, 0, SIZE, SIZE, px);
  r.setRenderTarget(prev); r.setClearColor(prevColor, prevClear);
  rt.dispose(); rig.dispose();
  const c = document.createElement("canvas"); c.width = c.height = SIZE; const x = c.getContext("2d")!, img = x.createImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y++) img.data.set(px.subarray((SIZE - 1 - y) * SIZE * 4, (SIZE - y) * SIZE * 4), y * SIZE * 4); // flip: GL rows run bottom-up
  x.putImageData(img, 0, 0);
  return c.toDataURL("image/png");
}
