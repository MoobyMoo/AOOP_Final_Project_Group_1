// Bananaville G1 entry. Scene flow: creator (first launch) → bunker → raid → bunker (summary). Fixed-step sim (1/60),
// render per frame. ?bot=1 lets the pacing bot play; ?ts=N speeds time up; ?fresh=1 starts a new save; ?raid=1 skips home.
import { isAttachment } from "./loot/attachments";
import { preloadBuild } from "./world/kit_build";
import "@fontsource/lilita-one";
import "@fontsource/nunito/700.css";
import "@fontsource/nunito/800.css";
import * as THREE from "three";
import { Stage } from "./render/stage";
import { Input } from "./core/input";
import { G } from "./core/state";
import { load, save, retainKeys } from "./core/save";
import { unlockAudio } from "./core/audio";
import { musicTick, setMusic, sting, musicState } from "./core/music";
import { startRaid, stepRaid, renderRaid, buildRaidWorld, raidScene, quitRaid, type RaidResult } from "./core/raid";
import { initSettings, settingsOpen } from "./ui/settings";
import { lootOpen } from "./ui/lootview";
import { path, walkable, los, lintReport, exactReach, clearance, areaStats, gates, setGate, pathLength, collide } from "./world/grid";
import { worldStats, countVisible, scattered } from "./world/world";
import { blockoutSvg } from "./world/map/dump";
import { preloadNature } from "./world/kit_nature";
import { preloadHouse } from "./world/buildings";
import { preloadGroundItems } from "./loot/ground";
import { groundHeight } from "./world/terrain";
import { houses, houseFootprints } from "./world/buildings";
import { CONTAINER_SOCKETS } from "./world/map/grove";
import { enterBunker, stepBunker, renderBunker, leaveBunker, bunkerScene, homeApi } from "./home/bunker";
import { openCreator, renderCreator } from "./ui/creator";
import { buildMapShots, toggleMap, mapOpen, toggleMinimap } from "./ui/mapview";
import { itemDef, dropItem, placeItem } from "./loot/raidloot";
import { isEquip, visualGear } from "./loot/equipment";
import { payoutSlip } from "./ui/payout";
import { createRig, preloadCharacters, RIG_TUNE } from "./actors/rig";
import { createKingpin, createGunFx, preloadKingpin } from "./combat/kingpin";
import { fadeTo } from "./world/interact";
import { botTick, setBot } from "./core/botdrive";
import { createBot } from "./core/bot";
import { hud } from "./ui/hud";

const QS = new URLSearchParams(location.search);
G.stage = new Stage(document.getElementById("game") as HTMLCanvasElement);
G.input = new Input(G.stage.renderer.domElement);
if (QS.has("fresh")) localStorage.removeItem("bv_g1");
G.save = load(); G.bot = QS.has("bot"); G.intent = G.input.read(0);
if (G.bot) { const bot = createBot({ greed: Number(QS.get("greed") ?? 0.5), reactionLag: Number(QS.get("lag") ?? 0.25), seed: Number(QS.get("botseed") ?? QS.get("seed") ?? 1) }); setBot(bot); (window as unknown as { __bot: unknown }).__bot = bot; }
if (QS.has("dev")) Object.assign(window as unknown as object, { __G: G, __RIG_TUNE: RIG_TUNE, __music: musicState }); // captures and debugging only
addEventListener("pointerdown", unlockAudio); addEventListener("keydown", unlockAudio);
// Esc settings (ui/settings.ts): the loot screen, the map and the bunker panels own Esc while open and close first;
// quitting a raid from it is a bonk-out (core/raid.ts quitRaid)
initSettings({ blocked: () => lootOpen() || mapOpen() || homeApi.panelOpen(), quit: () => quitRaid() });

// world + rig up front (the map snapshot needs the raid scene built); the gun model is a GLB, loaded before anything asks for it
await preloadKingpin();
await preloadBuild().catch((e) => console.warn("build kit missing, bunker uses the blockout", e)); // structures kit (bunker room, raid structures)
await preloadCharacters(); // character GLBs (rig v2): createRig() is synchronous once this resolves
await Promise.all([preloadNature(), preloadHouse(), preloadGroundItems()]); // nature + building kits (the structures kit is loaded above): the raid world builds from them
buildRaidWorld(); G.stage.setScene(raidScene); buildMapShots(raidScene);
if (QS.has("dev")) (window as unknown as { __ui: unknown }).__ui = await import("./ui/devhooks"); // UI captures and tools/uitest.mjs
if (QS.has("tune")) (await import("./ui/tunepanel")).openTunePanel(); // live tuning panel (core/tune.ts)
if (QS.has("glitch")) (window as unknown as { __glitch: unknown }).__glitch = await import("./dev/glitch"); // the glitch hunt (tools/glitchcheck.mjs)
G.rig = createRig("monkey", G.save.look); G.gun = createKingpin(); G.fx = createGunFx(raidScene); G.rig.sockets.handR.add(G.gun.root); G.rig.setGear?.(G.save.gear);

function goHome(summary?: string) { setMusic("bunker"); enterBunker(goRaid, goMirror, summary); }
function goMirror() { leaveBunker(); openCreator(() => goHome(), bunkerScene); }
function goRaid() { fadeTo(() => { leaveBunker(); startRaid(onRaidEnd); setMusic("raid"); }); }
function onRaidEnd(r: RaidResult) {
  const sv = G.save; sv.raids++; sting(r.how === "bonked" ? "stingBonk" : "stingExtract");
  if (r.how === "bonked") sv.stats.bonkOuts++; else sv.stats.extracts++;
  retainKeys(sv, r.kept);
  const kept = r.kept.filter((i) => itemDef(i).kind !== "key");
  const value = kept.reduce((a, i) => a + itemDef(i).value, 0), bonus = Math.round(value * r.bonus);
  sv.reserved.push(...kept.filter(inst => !isEquip(inst) && !isAttachment(inst))); sv.locker.push(...kept.filter(inst => isEquip(inst) || isAttachment(inst))); // gear and gun attachments go to the locker sv.money += bonus; sv.stats.best = Math.max(sv.stats.best, value + bonus);
  for (const i of kept) if (itemDef(i).rarity === "epic" && !sv.trophies.includes(i)) sv.trophies.push(i);
  sv.gear = { ...G.gear };
  save(sv);
  // the payout slip (ui/payout.ts): B's appraisal receipt in A's palette
  const kills = Object.values(r.log.kills).reduce((x, y) => x + y, 0);
  const html = payoutSlip({ raid: sv.raids, how: r.how, raidT: r.raidT, kills, crates: r.log.crates, kept, lost: r.lost.length, value, bonus, vineKey: r.kept.includes("vine_key") });
  (window as unknown as { __raids: object[] }).__raids ??= []; (window as unknown as { __raids: object[] }).__raids.push({ raid: sv.raids - 1, seed: G.seed, how: r.how, t: r.raidT, value, bonus, kept: r.kept.length, lost: r.lost.length, log: structuredClone(r.log), ammo: G.ammo + G.mag, hp: G.hp, maxHp: G.maxHp, usefulFound: G.lootCtx.usefulFound, upgrades: { ...sv.upgrades } });
  G.alive = true; goHome(html);
}

const STEP = 1 / 60, TS = Number(QS.get("ts") ?? 1);
let acc = 0; const clock = new THREE.Clock();
const PROF = QS.has("prof"), prof: { t: number; sim: number; prep: number; draw: number; steps: number }[] = [];
(window as unknown as { __prof: unknown }).__prof = prof;
function frame() {
  const real = Math.min(clock.getDelta(), 0.1) * TS;
  const p0 = performance.now();
  acc += real; let n = 0;
  while (acc >= STEP && n++ < 8 * TS) {
    G.intent = G.bot ? botTick(STEP) : G.input.read(STEP);
    if (settingsOpen()) { acc -= STEP; continue; } // paused under the settings plate: input is read and dropped
    if (G.intent.map && G.scene === "raid") toggleMap();
    if (G.intent.inv && G.scene === "raid") hud.inventory();
    if (hud.invOpen() && G.scene === "raid") Object.assign(G.intent, { fire: false, firePressed: false, ads: false, melee: false, reload: false, roll: false }); // the loot screen takes the mouse and R (sort)
    if (hud.swallowInteract() && G.scene === "raid") Object.assign(G.intent, { interact: false, interactHeld: false }); // E closes an open container; don't reopen it
    if (G.intent.mini && G.scene === "raid") toggleMinimap();
    if (G.intent.esc && mapOpen()) toggleMap();
    if (G.scene === "raid") { if (G.hitStop > 0) G.hitStop -= STEP; else { if (mapOpen()) neutral(); stepRaid(STEP); } }
    else if (G.scene === "bunker") stepBunker(STEP);
    acc -= STEP;
  }
  if (acc > STEP * 8) acc = 0;
  const p1 = performance.now();
  if (G.scene === "raid") renderRaid(real); else if (G.scene === "bunker") renderBunker(real); else if (G.scene === "creator") renderCreator(real);
  const p2 = performance.now();
  G.stage.render(real); musicTick(real);
  if (PROF) { const p3 = performance.now(); if (p3 - p0 > 20 || real > 0.033) prof.push({ t: Math.round(G.raidT * 10) / 10, sim: +(p1 - p0).toFixed(1), prep: +(p2 - p1).toFixed(1), draw: +(p3 - p2).toFixed(1), steps: n }); }
  requestAnimationFrame(frame);
}
function neutral() { const i = G.intent; i.move = { x: 0, z: 0 }; i.fire = i.firePressed = i.melee = i.roll = i.interact = i.reload = i.heal = false; }
(window as unknown as { __g: unknown }).__g = { G, path, walkable, los, collide, home: homeApi, info: () => ({ calls: G.stage.renderer.info.render.calls, tris: G.stage.renderer.info.render.triangles }),
  // map v3 checks: lint report, world build stats, objects in the current frame (G1-21), teleport, gates
  lint: lintReport, exactReach, clearance, sockets: CONTAINER_SOCKETS, areas: () => areaStats(houseFootprints()), feet: () => houseFootprints(), loot: { dropItem, placeItem }, world: () => worldStats, density: () => countVisible(G.stage.camera, [...G.crates, ...G.enemies.filter((e) => !e.down).map((e) => ({ x: e.p.x, z: e.p.z }))]),
  tp: (x: number, z: number) => { G.pp.set(x, groundHeight(x, z), z); G.vel.set(0, 0, 0); }, gates, setGate, pathLength, houses, svg: () => blockoutSvg(scattered) };

if (QS.has("raid")) { G.save.lookDone = true; startRaid(onRaidEnd); setMusic("raid"); }
else if (!G.save.lookDone) openCreator(() => goHome(), bunkerScene);
else goHome();
requestAnimationFrame(frame);
void createRig;
