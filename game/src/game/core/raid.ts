// The raid scene: builds Banana Grove once, starts/steps/ends a raid. Fixed-step sim (advisor 31).
import * as THREE from "three";
import { G, V } from "./state";
import { buildTerrain, groundHeight } from "../world/terrain";
import { dressWorld, flushChunks, buildGrass } from "../world/dress";
import { PLACEHOLDER_KIT, grassTuft } from "../world/placeholder";
import { lint, state as gridState } from "../world/grid";
import { POI } from "../world/layout";
import { buildProps } from "../world/props";
import { startInteractions, updateInteractions, setOnExtract } from "../world/interact";
import { createRig } from "../actors/rig";
import { createKingpin, createGunFx } from "../combat/kingpin";
import { KINGPIN, PLAYER } from "../combat/weapons";
import { spawnEnemies, updateEnemies } from "../ai/enemies";
import { setupCrates, updateLoot, sortPack, packValue, itemDef } from "../loot/raidloot";
import { updatePlayer } from "../actors/player";
import { resetWalls } from "../combat/combat";
import { hud } from "../ui/hud";
import { initFx, updateFx } from "../../fx";
import { U } from "../render/shading";
import { updateCutout } from "../render/cutout";
import { buildMinimap, updateMinimap, resetTrail, recordTrail } from "../ui/mapview";

export const raidScene = new THREE.Scene();
let built = false;
export function buildRaidWorld() {
  if (built) return; built = true;
  const errs = lint(); if (errs.length) console.warn("map lint:", errs);
  const scn = G.stage.scene; G.stage.setScene(raidScene);
  let seed = 4242; const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  buildTerrain(raidScene); dressWorld(raidScene, PLACEHOLDER_KIT, rng); flushChunks(raidScene); buildGrass(raidScene, rng, grassTuft());
  G.stage.setScene(scn);
}
export type RaidResult = { how: "hatch" | "raft" | "tunnel" | "bonked"; kept: string[]; lost: string[]; bonus: number; raidT: number; log: typeof G.log };
let onEnd: (r: RaidResult) => void = () => {};
export function startRaid(end: (r: RaidResult) => void) {
  onEnd = end; buildRaidWorld(); G.stage.setScene(raidScene); initFx(raidScene, G.stage.camera);
  G.scene = "raid"; G.raidT = 0; G.alive = true; G.seed = (G.save.raids * 7919 + 13) >>> 0; let s = G.seed || 1; G.rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  // props are rebuilt each raid because doors/walls depend on the save (cheap: a few dozen meshes)
  for (const o of raidScene.children.filter((c) => c.userData.perRaid)) o.removeFromParent();
  const before = new Set(raidScene.children); gridState.broken.clear(); resetWalls();
  buildProps(raidScene);
  // player
  if (!G.rig) { G.rig = createRig("monkey", G.save.look); G.gun = createKingpin(); G.fx = createGunFx(raidScene); G.rig.sockets.handR.add(G.gun.root); }
  G.rig.setLook?.(G.save.look); G.gear = { ...G.save.gear }; G.rig.setGear?.(G.gear);
  raidScene.add(G.rig.root);
  G.pp = G.rig.root.position; G.pp.set(POI.hatch.x + 2.5, 0, POI.hatch.z - 4.5); // spawn just outside the hatch ring G.pp.y = groundHeight(G.pp.x, G.pp.z);
  G.vel.set(0, 0, 0); G.moveYaw = Math.PI; G.aimYaw = Math.PI;
  G.maxHp = PLAYER.hp + 25 * G.save.upgrades.heart; G.hp = G.maxHp; G.stamina = PLAYER.stamina.max; G.staminaDelay = 0; G.sprinting = false; G.painT = 0; G.useItem = null; G.iframes = 0;
  G.magSize = G.save.upgrades.mag || G.save.fixtures.includes("extended_mag") ? KINGPIN.extMag : KINGPIN.mag; G.gun.setVariant({ extMag: G.magSize > KINGPIN.mag });
  G.ammo = Math.max(KINGPIN.startAmmo, G.save.ammo); G.mag = Math.min(G.magSize, G.ammo); G.ammo -= G.mag;
  G.fireCd = 0; G.fireT = 1; G.reloadT = -1; G.meleeT = -1; G.rollT = -1; G.rollCd = 0; G.skidT = 0; G.zipping = null;
  G.packSlots = 8 + 2 * G.save.upgrades.pack; G.pouchSlots = 2; G.pack = [];
  // heals bought at home come along (up to 3)
  for (const h of ["firstaid", "smoothie", "bandage"]) while (G.pack.length < 3 && G.save.reserved.includes(h)) { G.save.reserved.splice(G.save.reserved.indexOf(h), 1); G.pack.push(h); }
  G.discovered = new Set(); G.area = ""; G.lockTarget = null;
  G.log = { crates: 0, kills: {}, killsBy: { pistol: 0, briefcase: 0 }, shots: 0, hits: 0, hurt: 0, rolls: 0, swaps: 0, missed: 0, firstShot: -1, firstCrate: -1, firstRoll: -1, breaks: [], value: 0 };
  G.lootCtx = { raid: G.save.raids, cratesOpened: 0, usefulFound: 0, emptyStreak: 0, ammoFound: 0, orderNeeds: G.save.order && !G.save.order.done ? Object.keys(G.save.order.progress) : [] };
  spawnEnemies(G.save.raids % 2); setupCrates();
  for (const c of raidScene.children) if (!before.has(c)) c.userData.perRaid = true;
  hud.build(); buildMinimap(); resetTrail(); startInteractions(); bonkT = 0;
  // warm-up: compile every shader now (hidden enemies/props would otherwise compile mid-raid and hitch)
  const hidden: THREE.Object3D[] = []; raidScene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
  G.stage.renderer.compile(raidScene, G.stage.camera); hidden.forEach((o) => (o.visible = false));
  setOnExtract((id, bonus) => finish(id, bonus));
  G.stage.focus.copy(G.pp); focus.copy(G.pp);
  hud.banner("Banana Grove", G.save.raids === 0 ? "find loot, bonk bandits, get home with it" : `raid ${G.save.raids + 1}`);
}
function finish(how: RaidResult["how"], bonus: number) {
  sortPack();
  const kept = how === "bonked" ? G.pack.slice(0, G.pouchSlots) : [...G.pack], lost = how === "bonked" ? G.pack.slice(G.pouchSlots) : [];
  // Duckov-style corpse: a bonk-out leaves the loose pack as a satchel you can recover once next raid; a second bonk-out first loses it
  if (how === "bonked") G.save.satchel = lost.length ? { items: lost, x: G.pp.x, z: G.pp.z } : null;
  G.log.value = packValue();
  G.save.ammo = G.ammo + G.mag;
  onEnd({ how, kept, lost, bonus, raidT: G.raidT, log: G.log });
}
let bonkT = 0;
const focus = new THREE.Vector3(), chest = new THREE.Vector3(), sockQ = new THREE.Quaternion(), yawQ = new THREE.Quaternion(), UPV = new THREE.Vector3(0, 1, 0);
export function stepRaid(dt: number) {
  G.raidT += dt; G.time += dt;
  updatePlayer(dt); updateEnemies(dt); updateLoot(dt); updateInteractions(dt); recordTrail();
  if (!G.alive && G.hp <= 0) { bonkT += dt; if (bonkT > 1.8 && bonkT - dt <= 1.8) finish("bonked", 0); }
}
/** per render frame (not per sim step): pose, camera, FX */
export function renderRaid(dt: number) {
  const action = !G.alive && G.hp <= 0 ? "defeat" : G.rollT >= 0 ? "roll" : G.meleeT >= 0 ? "melee" : G.reloadT >= 0 ? "reload" : G.hurtT >= 0 ? "hurt" : G.fireT < 1 ? "fire" : G.vel.lengthSq() > 0.3 ? "run" : "idle";
  const at = action === "defeat" ? Math.min(1, bonkT / 0.9) : action === "roll" ? G.rollT : action === "melee" ? G.meleeT : action === "reload" ? G.reloadT : action === "hurt" ? G.hurtT : action === "fire" ? G.fireT : 0;
  G.rig.root.rotation.y = G.moveYaw;
  G.rig.pose({ time: G.time, speed: G.vel.length(), moveYaw: G.moveYaw, faceYaw: action === "roll" ? G.moveYaw : G.aimYaw, action, actionT: at, armed: G.meleeT >= 0 ? "briefcase" : "pistol", flash: G.iframes > 0.25 ? 1 : 0 });
  // level the gun in the hand and point it along the aim (the socket's own rotation follows the arm pose)
  G.rig.root.updateMatrixWorld(true); G.rig.sockets.handR.getWorldQuaternion(sockQ);
  G.gun.root.quaternion.copy(sockQ.invert()).multiply(yawQ.setFromAxisAngle(UPV, G.aimYaw));
  G.gun.root.visible = G.meleeT < 0 && G.alive;
  G.gun.pose({ fireT: Math.min(1, G.fireT), reloadT: G.reloadT });
  G.fx.update(dt); updateFx(dt); hud.update(dt); updateMinimap();
  U.uTime.value = G.time; U.uPlayer.value.copy(G.pp);
  // camera: damped follow + a small lead toward the aim point (CODE_FINDINGS 8.1: aim lookahead, kept modest, rule 19)
  const lead = G.aimPoint.clone().sub(G.pp).setY(0); const L = Math.min(lead.length(), 10); lead.setLength(L * 0.22);
  focus.lerp(G.pp.clone().add(lead), Math.min(1, dt * (G.fireCd > -0.2 ? 3 : 6)));
  G.stage.place(focus, dt, G.time);
  updateCutout(G.stage.camera, chest.copy(G.pp).setY(G.pp.y + 1.1), G.stage.renderer);
  void V; void itemDef;
}
