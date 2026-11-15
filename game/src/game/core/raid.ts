// The raid scene: builds Banana Grove once, starts/steps/ends a raid. Fixed-step sim (advisor 31).
import * as THREE from "three";
import { G, V } from "./state";
import { groundHeight, standHeight } from "../world/terrain";
import { resetRaidColliders, walkable, isUnder } from "../world/grid";
import { START } from "../world/layout";
import { DEMO } from "../world/map/grove";
import { resetProps, updateProps } from "../world/props";
import { resetHouses, updateHouses } from "../world/buildings";
import { updateLightPool } from "../world/lights";
import { buildWorld } from "../world/world";
import { mulberry32 } from "../loot/tables";
import { startInteractions, updateInteractions, setOnExtract } from "../world/interact";
import { createRig } from "../actors/rig";
import { createKingpin, createGunFx } from "../combat/kingpin";
import { KINGPIN, KINGPIN_HANDLING, PLAYER } from "../combat/weapons";
import { HS, resetHandling } from "../combat/handling";
import { GUN, refreshGun } from "../combat/gunstats";
import { updateLaser } from "../combat/laser";
import { tuneObject } from "./tune";
import { spawnEnemies, updateEnemies } from "../ai/enemies";
import { setupCrates, updateLoot, renderLoot, sortPack, packValue, itemDef } from "../loot/raidloot";
import { updatePlayer } from "../actors/player";
import { resetWalls, updateBullets, renderBullets, clearBullets } from "../combat/combat";
import { updateFeedback } from "../combat/feedback";
import { updateRangFx, clearRangFx } from "../combat/rangfx";
import { updateDashFx, clearDashFx } from "../actors/dash";
import type { KingpinFx } from "../combat/kingpin";
import { hud } from "../ui/hud";
import { initFx, updateFx } from "../../fx";
import { U } from "../render/shading";
import { updateCutout } from "../render/cutout";
import { updateCampfires } from "../render/campfire";
import { buildMinimap, updateMinimap, resetTrail, recordTrail } from "../ui/mapview";
import { botTelemetry } from "./bot";
import { visualGear } from "../loot/equipment";
import { loseWornEquipment, refreshEquipment, restoreBoundKit } from "../loot/equipment-actions";
import { pickEntry, type SpawnPick } from "./deployment";

const QS = new URLSearchParams(location.search);
/** ?seed= is the world seed: map scatter, crate sockets and patrol set all derive from it (the bot has ?botseed=) */
export const WORLD_SEED = Number.isFinite(Number(QS.get("seed"))) && QS.has("seed") ? Number(QS.get("seed")) >>> 0 : 4242;
export const raidScene = new THREE.Scene();
/** the raid camera (?tune "camera"): angles in degrees, distance in u, FOV landscape / portrait. Follow: the focus
 *  eases toward hero + lead at `follow` /s (`followFiring` while the trigger was pulled in the last 0.2 s, Duckov's
 *  1.5-vs-12 slow-down when shooting), lead = `lead` x the hero-to-aim distance (capped at leadMax u) scaled by the
 *  gun's ADS lead factor (Duckov GameCamera: aimOffsetDistanceFactor and maxAimOffset both x ADSAimDistanceFactor). */
export const CAMERA = tuneObject("camera", {
  pitch: Number(QS.get("pitch") ?? 55), yaw: Number(QS.get("yaw") ?? -30), dist: Number(QS.get("dist") ?? 40), fov: 24, fovPortrait: 34,
  lead: 0.22, leadMax: 10, follow: 12, followFiring: 1.5, heightFollow: 2.2, // follow rates = Duckov (research/duckov-re/BALANCE_RANGES.md top 10)
}, {
  pitch: { min: 20, max: 89, step: 0.5, label: "pitch (deg)" }, yaw: { min: -180, max: 180, step: 1, label: "yaw (deg)" }, dist: { min: 10, max: 90, step: 0.5, label: "distance (height)" },
  fov: { min: 10, max: 60, step: 0.5, label: "FOV" }, fovPortrait: { min: 10, max: 80, step: 0.5, label: "FOV portrait" },
  lead: { min: 0, max: 0.7, step: 0.01, label: "aim lead factor" }, leadMax: { min: 0, max: 30, step: 0.5, label: "aim lead cap (u)" },
  follow: { min: 0.5, max: 30, step: 0.5, label: "follow /s" }, followFiring: { min: 0.5, max: 30, step: 0.5, label: "follow while firing /s" },
  heightFollow: { min: 0.2, max: 20, step: 0.1, label: "ground height follow /s" },
}, { note: "raid camera (core/raid.ts)" });
let built = false;
export function buildRaidWorld() {
  if (built) return; built = true;
  const scn = G.stage.scene; G.stage.setScene(raidScene);
  const st = buildWorld(raidScene, WORLD_SEED, { wind: QS.get("wind") !== "0" });
  if (st.lint.errors.length) console.error("map lint:", st.lint.errors); if (st.lint.warnings.length) console.warn("map lint warnings:", st.lint.warnings);
  G.stage.setScene(scn);
}
export type RaidResult = { how: "hatch" | "raft" | "tunnel" | "boat" | "bonked"; kept: string[]; lost: string[]; bonus: number; raidT: number; log: typeof G.log };
let onEnd: (r: RaidResult) => void = () => {};
/** how this raid was entered (core/deployment.ts): the entry group picks the spawn, the title is the arrival banner */
export type RaidEntry = { entryGroup?: string; title?: string };
/** the last spawn choice (tests, captures): which candidate, its enemy clearance, and any fallback taken */
export let lastSpawn: SpawnPick | null = null;
export function startRaid(end: (r: RaidResult) => void, entry: RaidEntry = {}) {
  if (G.bot) { botTelemetry.raidId = G.save.raids; botTelemetry.outcome = undefined; botTelemetry.combatEvents = []; }
  onEnd = end; buildRaidWorld(); G.stage.setScene(raidScene); initFx(raidScene, G.stage.camera);
  G.scene = "raid"; G.raidT = 0; G.alive = true; G.seed = (Math.imul(WORLD_SEED, 2654435761) + G.save.raids * 7919 + 13) >>> 0; G.rng = mulberry32(G.seed);
  // props are rebuilt each raid because doors/walls depend on the save (cheap: a few dozen meshes)
  for (const o of raidScene.children.filter((c) => c.userData.perRaid)) o.removeFromParent();
  const before = new Set(raidScene.children); resetRaidColliders(); resetWalls(); resetHouses(); resetProps();
  // player
  if (!G.rig) { G.rig = createRig("monkey", G.save.look); G.gun = createKingpin(); G.fx = createGunFx(raidScene); G.rig.sockets.handR.add(G.gun.root); }
  G.rig.setLook?.(G.save.look); G.gear = { ...G.save.gear }; restoreBoundKit(); G.rig.setGear?.(G.gear);
  raidScene.add(G.rig.root);
  G.pp = G.rig.root.position; G.pp.set(START.x, 0, START.z); // just outside the hatch ring (placed for real below, once the enemies stand)
  G.pp.y = standHeight(G.pp.x, G.pp.z);
  G.vel.set(0, 0, 0); G.moveYaw = Math.PI; G.aimYaw = Math.PI;
  G.maxHp = PLAYER.hp + 25 * G.save.upgrades.heart; G.hp = G.maxHp; G.stamina = PLAYER.stamina.max; G.staminaDelay = 0; G.sprinting = false; G.painT = 0; G.useItem = null; G.iframes = 0;
  refreshGun(); // magazine size, the extended mag's look and the fitted attachments (combat/gunstats.ts)
  G.ammo = Math.max(KINGPIN.startAmmo, G.save.ammo); G.mag = Math.min(G.magSize, G.ammo); G.ammo -= G.mag;
  G.fireCd = 0; G.fireT = 1; G.reloadT = -1; G.meleeT = -1; G.rollT = -1; G.rollCd = 0; G.skidT = 0; G.zipping = null;
  G.pouchSlots = 2; G.pack = []; G.equipping = null; G.equipmentEvents = []; refreshEquipment();
  // heals bought at home come along (up to 3)
  for (const h of ["firstaid", "smoothie", "bandage"]) while (G.pack.length < 3 && G.save.reserved.includes(h)) { G.save.reserved.splice(G.save.reserved.indexOf(h), 1); G.pack.push(h); }
  G.discovered = new Set(); G.area = ""; G.lockTarget = null;
  G.log = { crates: 0, kills: {}, killsBy: { pistol: 0, briefcase: 0 }, shots: 0, hits: 0, hurt: 0, rolls: 0, swaps: 0, missed: 0, firstShot: -1, firstCrate: -1, firstRoll: -1, breaks: [], value: 0 };
  G.lootCtx = { raid: G.save.raids, cratesOpened: 0, usefulFound: 0, emptyStreak: 0, ammoFound: 0, orderNeeds: G.save.order && !G.save.order.done ? Object.keys(G.save.order.progress) : [] };
  if (QS.has("peace")) { for (const e of G.enemies) e.rig.dispose(); G.enemies = []; } else spawnEnemies((G.save.raids + WORLD_SEED) % 2);
  // the spawn (SYSTEMS_PORT R02): an explicit ?at=x,z wins (captures, tests), else a safe candidate of the entry group
  lastSpawn = pickEntry(entry.entryGroup ?? "beach", G.enemies.filter((e) => !e.down).map((e) => e.p), walkable, G.seed);
  if (lastSpawn.fallback) console.warn(`spawn: no safe ${entry.entryGroup ?? "beach"} candidate, fallback "${lastSpawn.fallback}" at ${lastSpawn.entry.id} (nearest enemy ${lastSpawn.clearance.toFixed(1)} u)`);
  G.pp.set(lastSpawn.entry.x, 0, lastSpawn.entry.z); G.moveYaw = G.aimYaw = lastSpawn.entry.facing;
  { const at = QS.get("at")?.split(",").map(Number); if (at && at.length === 2 && at.every(Number.isFinite) && walkable(at[0], at[1])) { G.pp.set(at[0], 0, at[1]); G.moveYaw = G.aimYaw = Math.PI; } }
  G.pp.y = standHeight(G.pp.x, G.pp.z);
  setupCrates();
  for (const c of raidScene.children) if (!before.has(c)) c.userData.perRaid = true;
  resetHandling(); hud.build(); buildMinimap(); resetTrail(); clearBullets(); clearRangFx(); clearDashFx(); startInteractions(); bonkT = 0;
  (G.fx as KingpinFx).groundY = groundHeight; // casings land on the terrain
  // warm-up: compile every shader now (hidden enemies/props would otherwise compile mid-raid and hitch)
  const hidden: THREE.Object3D[] = []; raidScene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
  G.stage.renderer.compile(raidScene, G.stage.camera); hidden.forEach((o) => (o.visible = false));
  setOnExtract((id, bonus) => finish(id, bonus));
  G.stage.focus.copy(G.pp); focus.copy(G.pp);
  hud.banner(entry.title ?? (DEMO ? "Exile Beach" : "Banana Grove"), G.save.raids === 0 ? "find loot, bonk bandits, get home with it" : `raid ${G.save.raids + 1}`);
}
function finish(how: RaidResult["how"], bonus: number) {
  sortPack();
  const kept = how === "bonked" ? G.pack.slice(0, G.pouchSlots) : [...G.pack], lost = how === "bonked" ? G.pack.slice(G.pouchSlots) : [];
  // Duckov-style corpse: a bonk-out leaves the loose pack as a satchel you can recover once next raid; a second bonk-out first loses it
  if (how === "bonked") {
    lost.push(...loseWornEquipment());
    G.save.satchel = lost.length ? { items: lost, x: G.pp.x, z: G.pp.z } : null;
    restoreBoundKit();
  }
  G.equipping = null;
  G.log.value = packValue();
  G.save.ammo = G.ammo + G.mag;
  if (G.bot) botTelemetry.outcome = how === "bonked" ? { type: "bonk-out", raidT: G.raidT } : { type: "extract", exit: how, value: kept.reduce((value, id) => value + itemDef(id).value, 0), raidT: G.raidT };
  onEnd({ how, kept, lost, bonus, raidT: G.raidT, log: G.log });
}
let bonkT = 0;
/** the settings menu's "Quit to bunker": leaving mid-raid counts as a bonk-out (loose pack and worn gear stay behind,
 *  the pouch comes home), so quitting can never be a free extract */
export function quitRaid() { if (G.scene === "raid") finish("bonked", 0); }
/** last frame's camera lead and focus (capture tools measure the ADS push from these) */
export const camLead = new THREE.Vector3(), camFocus = new THREE.Vector3();
/** Moo 2026-11-15: guns were way too big; Duckov-like proportions put a pistol at ~1/4 of the character's height */
const GUN_SCALE = 0.65;
const focus = new THREE.Vector3(), chest = new THREE.Vector3(), sockQ = new THREE.Quaternion(), yawQ = new THREE.Quaternion(), UPV = new THREE.Vector3(0, 1, 0);
export function stepRaid(dt: number) {
  G.raidT += dt; G.time += dt;
  updatePlayer(dt); updateBullets(dt); updateEnemies(dt); updateLoot(dt); updateInteractions(dt); recordTrail();
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
  G.gun.root.scale.setScalar(GUN_SCALE);
  G.gun.pose({ fireT: Math.min(1, G.fireT), reloadT: G.reloadT });
  updateDashFx(dt); // after the pose: the afterimages copy it
  updateLaser(); // the laser attachment's beam and dot follow the posed gun
  G.fx.update(dt); renderBullets(); updateRangFx(dt); updateFeedback(dt); updateFx(dt); hud.update(dt); updateMinimap();
  updateHouses(dt, isUnder(G.pp.x)); updateProps(dt); renderLoot(dt); updateLightPool(dt, G.pp);
  U.uTime.value = G.time; U.uPlayer.value.copy(G.pp);
  // camera: damped follow + a lead toward the aim point (CODE_FINDINGS 8.1: aim lookahead, kept modest, rule 19). ADS
  // pushes it: lead factor and cap x the gun's ADS lead factor, FOV x its ADS scale, both by the aim amount
  // (POLISH_FINDINGS 16, Duckov GameCamera.LateUpdate / UpdateFov)
  // the lead factor and the FOV scale are the gun's with its sight fitted (combat/gunstats.ts GUN)
  const C = CAMERA, push = 1 + (GUN.adsDist - 1) * HS.ads;
  G.stage.cam.pitch = THREE.MathUtils.degToRad(C.pitch); G.stage.cam.yaw = THREE.MathUtils.degToRad(C.yaw); G.stage.cam.dist = C.dist;
  G.stage.setFov(C.fov, C.fovPortrait, 1 + (GUN.adsFov - 1) * HS.ads);
  const lead = G.aimPoint.clone().sub(G.pp).setY(0); const L = Math.min(lead.length(), C.leadMax * push); lead.setLength(L * C.lead * push);
  { const y = focus.y; focus.lerp(G.pp.clone().add(lead), Math.min(1, dt * (G.fireCd > -0.2 ? C.followFiring : C.follow)));
    focus.y = y + (G.pp.y - y) * Math.min(1, dt * C.heightFollow); } // ground bumps reach the camera slowly: no step-by-step bob (Moo: dizzy)
  camLead.copy(lead); camFocus.copy(focus);
  G.stage.place(focus, dt, G.time);
  updateCutout(G.stage.camera, chest.copy(G.pp).setY(G.pp.y + 1.1), G.stage.renderer, G.aimPoint, G.pp.y);
  updateCampfires(G.time, G.stage.scene, G.stage.renderer);
  void V; void itemDef;
}
(globalThis as unknown as { __cam: object }).__cam = { lead: camLead, focus: camFocus, CAMERA };
