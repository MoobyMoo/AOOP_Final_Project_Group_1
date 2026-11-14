// Bananaville G1 entry. Scene flow: creator → bunker → raid → bunker.
import * as THREE from "three";
import { Stage } from "./render/stage";
import { U } from "./render/shading";
import { updateCutout } from "./render/cutout";
import { Input } from "./core/input";
import { buildTerrain, groundHeight } from "./world/terrain";
import { dressWorld, flushChunks, buildGrass } from "./world/dress";
import { PLACEHOLDER_KIT, grassTuft } from "./world/placeholder";
import { lint, collide, gridInfo } from "./world/grid";
import { POI } from "./world/layout";
import { createRig } from "./actors/rig";
import { DEFAULT_LOOK } from "./actors/look";

const QS = new URLSearchParams(location.search);
const stage = new Stage(document.getElementById("game") as HTMLCanvasElement);
const input = new Input(stage.renderer.domElement);
const errs = lint(); if (errs.length) console.warn("map lint:", errs);
const t0 = performance.now();
buildTerrain(stage.scene);
let seed = Number(QS.get("seed") ?? 1); const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const dressStats = dressWorld(stage.scene, PLACEHOLDER_KIT, rng);
const chunks = flushChunks(stage.scene);
const grass = buildGrass(stage.scene, rng, grassTuft());
console.log("world built", Math.round(performance.now() - t0), "ms", dressStats, "chunks", chunks.length, "grass", grass, gridInfo());

const player = createRig("monkey", DEFAULT_LOOK);
stage.scene.add(player.root);
const at = (QS.get("at") ?? "").split(",").map(Number);
const pp = player.root.position.set(at.length === 2 ? at[0] : POI.hatch.x, 0, at.length === 2 ? at[1] : POI.hatch.z - 3);
const focus = pp.clone(); const vel = new THREE.Vector3(); let face = 0, t = 0;
const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05); t += dt; U.uTime.value = t;
  const i = input.read(dt);
  const mv = new THREE.Vector3(i.move.x, 0, i.move.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), stage.cam.yaw);
  vel.lerp(mv.multiplyScalar(5.8), Math.min(1, dt * 14));
  pp.addScaledVector(vel, dt); collide(pp, 0.45); pp.y = groundHeight(pp.x, pp.z);
  if (vel.lengthSq() > 0.05) face = Math.atan2(vel.x, vel.z);
  player.root.rotation.y = 0;
  player.pose({ time: t, speed: vel.length(), moveYaw: face, faceYaw: face, action: "run", actionT: 0, armed: "none", flash: 0 });
  U.uPlayer.value.copy(pp);
  focus.lerp(pp, Math.min(1, dt * 5));
  stage.place(focus, dt, t);
  updateCutout(stage.camera, pp.clone().setY(pp.y + 1.2), stage.renderer);
  stage.render(dt);
  requestAnimationFrame(frame);
}
(window as any).__g = { stage, player, info: () => ({ calls: stage.renderer.info.render.calls, tris: stage.renderer.info.render.triangles }) };
requestAnimationFrame(frame);
