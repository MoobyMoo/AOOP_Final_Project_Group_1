// The laser attachment's beam and dot (G1.5 row 36). Duckov has an Accessory_Lazer hook but ships no beam prefab
// (POLISH_FINDINGS "Attachments"), so this look is ours. Fable's note on the assets: the laser is the weakest read from
// the raid camera, so the beam and the dot are what sell it. The beam leaves the model's emit point (attachments.glb
// att_laser extras.emit) toward the aim point and stops at the first wall or enemy, at the cursor, or at the gun's
// range, whichever comes first; the dot glows where it stops. Two draw calls, no allocation per frame.
import * as THREE from "three";
import { G } from "../core/state";
import { rayShot } from "../world/grid";
import { GUN } from "./gunstats";
import { tuneObject } from "../core/tune";

export const LASER = tuneObject("laser", { width: 0.035, opacity: 0.55, dot: 0.55, core: 0.07 }, {
  width: { min: 0.005, max: 0.2, step: 0.005, label: "beam width (u)" }, opacity: { min: 0, max: 1, step: 0.01, label: "beam opacity" },
  dot: { min: 0, max: 2, step: 0.01, label: "dot glow size (u)" }, core: { min: 0, max: 0.3, step: 0.005, label: "dot core radius (u)" },
}, { note: "laser attachment beam + dot (combat/laser.ts)" });

const RED = new THREE.Color("#ff2a1a");
let beam: THREE.Mesh | null = null, glow: THREE.Sprite | null = null, core: THREE.Mesh | null = null;
const from = new THREE.Vector3(), q = new THREE.Quaternion(), FWD = new THREE.Vector3(0, 0, 1), dir = new THREE.Vector3();
function build(scene: THREE.Scene) {
  const g = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true); g.rotateX(Math.PI / 2); g.translate(0, 0, 0.5);
  beam = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: RED.clone().multiplyScalar(2.2), transparent: true, opacity: LASER.opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d")!, rg = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, "rgba(255,255,255,1)"); rg.addColorStop(0.18, "rgba(255,90,60,0.95)"); rg.addColorStop(0.5, "rgba(255,30,20,0.35)"); rg.addColorStop(1, "rgba(255,0,0,0)");
  x.fillStyle = rg; x.fillRect(0, 0, 64, 64);
  glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  core = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: RED.clone().multiplyScalar(3), toneMapped: false }));
  for (const o of [beam, glow, core]) { o.frustumCulled = false; o.renderOrder = 7; o.visible = false; scene.add(o); }
}
/** per render frame, after the gun is posed */
export function updateLaser() {
  const emit = G.gun?.laser, scene = G.stage.scene;
  if (!beam || beam.parent !== scene) { if (beam) { for (const o of [beam, glow!, core!]) scene.add(o); } else build(scene); }
  const on = !!emit && G.gun.root.visible && G.alive && G.scene === "raid";
  beam!.visible = glow!.visible = core!.visible = on; if (!on) return;
  emit!.getWorldPosition(from);
  // toward the aim point itself (the cursor's spot at hip height, player.ts), so the dot sits on the crosshair; walls,
  // enemies and the gun's range cut it short
  dir.copy(G.aimPoint).sub(from); const flatLen = Math.hypot(dir.x, dir.z); if (flatLen < 0.3) dir.set(Math.sin(G.aimYaw), 0, Math.cos(G.aimYaw)).multiplyScalar(0.3);
  const k = 1 / Math.max(1e-6, Math.hypot(dir.x, dir.z)), fx = dir.x * k, fz = dir.z * k;
  let reach = Math.min(GUN.range, Math.max(0.3, flatLen), rayShot(from.x, from.z, fx, fz, GUN.range));
  for (const e of G.enemies) { // stop on the first enemy across the line
    if (e.down) continue; const ex = e.p.x - from.x, ez = e.p.z - from.z, along = ex * fx + ez * fz;
    if (along > 0 && along < reach && Math.abs(ex * fz - ez * fx) < e.rig.bounds.radius) reach = along;
  }
  dir.multiplyScalar(k * reach); const len = dir.length(); dir.normalize();
  const w = LASER.width; q.setFromUnitVectors(FWD, dir);
  beam!.position.copy(from); beam!.quaternion.copy(q); beam!.scale.set(w, w, len); (beam!.material as THREE.MeshBasicMaterial).opacity = LASER.opacity;
  glow!.position.copy(from).addScaledVector(dir, len); glow!.scale.setScalar(LASER.dot);
  core!.position.copy(glow!.position); core!.scale.setScalar(LASER.core);
}
