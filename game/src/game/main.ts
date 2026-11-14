// Bananaville G1 entry. Scene flow: creator (first launch) → bunker → raid → bunker (summary). Fixed-step sim (1/60),
// render per frame. ?bot=1 lets the pacing bot play; ?ts=N speeds time up; ?fresh=1 starts a new save; ?raid=1 skips home.
import { preloadBuild } from "./world/kit_build";
import "@fontsource/lilita-one";
import "@fontsource/nunito/700.css";
import "@fontsource/nunito/800.css";
import * as THREE from "three";
import { Stage } from "./render/stage";
import { Input } from "./core/input";
import { G } from "./core/state";
import { load, save } from "./core/save";
import { unlockAudio } from "./core/audio";
import { startRaid, stepRaid, renderRaid, buildRaidWorld, raidScene, type RaidResult } from "./core/raid";
import { path, walkable, los } from "./world/grid";
import { enterBunker, stepBunker, renderBunker, leaveBunker, bunkerScene, homeApi } from "./home/bunker";
import { openCreator, renderCreator } from "./ui/creator";
import { buildMapShots, toggleMap, mapOpen, toggleMinimap } from "./ui/mapview";
import { itemDef } from "./loot/raidloot";
import { isEquip, visualGear } from "./loot/equipment";
import { iconHtml } from "./ui/itemicon";
import { createRig, preloadCharacters } from "./actors/rig";
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
if (G.bot) { const bot = createBot({ greed: Number(QS.get("greed") ?? 0.5), reactionLag: Number(QS.get("lag") ?? 0.25), seed: Number(QS.get("seed") ?? 1) }); setBot(bot); (window as unknown as { __bot: unknown }).__bot = bot; }
if (QS.has("dev")) (window as unknown as { __G: unknown }).__G = G; // captures and debugging only
addEventListener("pointerdown", unlockAudio); addEventListener("keydown", unlockAudio);

// world + rig up front (the map snapshot needs the raid scene built); the gun model is a GLB, loaded before anything asks for it
await preloadKingpin();
await preloadBuild().catch((e) => console.warn("build kit missing, bunker uses the blockout", e)); // structures kit (bunker room, raid structures)
await preloadCharacters(); // character GLBs (rig v2): createRig() is synchronous once this resolves
buildRaidWorld(); G.stage.setScene(raidScene); buildMapShots(raidScene);
G.rig = createRig("monkey", G.save.look); G.gun = createKingpin(); G.fx = createGunFx(raidScene); G.rig.sockets.handR.add(G.gun.root); G.rig.setGear?.(G.save.gear);

function goHome(summary?: string) { enterBunker(goRaid, goMirror, summary); }
function goMirror() { leaveBunker(); openCreator(() => goHome(), bunkerScene); }
function goRaid() { fadeTo(() => { leaveBunker(); startRaid(onRaidEnd); }); }
function onRaidEnd(r: RaidResult) {
  const sv = G.save; sv.raids++;
  if (r.how === "bonked") sv.stats.bonkOuts++; else sv.stats.extracts++;
  if (r.kept.includes("vine_key") && !sv.keys.includes("vine_key")) sv.keys.push("vine_key");
  const kept = r.kept.filter((i) => itemDef(i).kind !== "key");
  const value = kept.reduce((a, i) => a + itemDef(i).value, 0), bonus = Math.round(value * r.bonus);
  sv.reserved.push(...kept.filter(inst => !isEquip(inst))); sv.locker.push(...kept.filter(isEquip)); sv.money += bonus; sv.stats.best = Math.max(sv.stats.best, value + bonus);
  for (const i of kept) if (itemDef(i).rarity === "epic" && !sv.trophies.includes(i)) sv.trophies.push(i);
  sv.gear = { ...G.gear };
  save(sv);
  // raid result (Duckov-style panel: title + badge, stats, a rarity-tinted item grid, total)
  const badge = r.how === "bonked" ? ["Bonked", "bad"] : r.how === "raft" ? ["Rafted home", "raft"] : r.how === "tunnel" ? ["Tunnel", "ok"] : ["Home safe", "ok"];
  const how = r.how === "bonked" ? "The crew carried you home." : r.how === "raft" ? "You rafted home with the haul." : r.how === "tunnel" ? "Home through the Smuggler Tunnel." : "Back through the hatch.";
  const mmss = `${Math.floor(r.raidT / 60)}:${String(Math.floor(r.raidT % 60)).padStart(2, "0")}`, kills = Object.values(r.log.kills).reduce((x, y) => x + y, 0);
  const cellH = (i: string) => `<div class="cell" style="--rbg:var(--r-${itemDef(i).rarity})" title="${itemDef(i).name}">${iconHtml(i, 44)}<span class="v">${itemDef(i).value}</span></div>`;
  const html = `<header><div class="result-title"><h2>Raid ${sv.raids}</h2><i class="${badge[1]}">${badge[0]}</i></div><small>Banana Grove</small></header><p>${how}</p>
    <div class="stats"><div class="stat"><b>${mmss}</b><span>raid time</span></div><div class="stat"><b>${kills}</b><span>bonked</span></div><div class="stat"><b>${r.log.crates}</b><span>crates opened</span></div></div>
    <h4>Brought home</h4>${kept.length ? `<div class="grid">${kept.map(cellH).join("")}</div>` : `<p class="dim">Nothing this time.</p>`}
    ${r.lost.length ? `<p class="lostline">${r.lost.length} item${r.lost.length > 1 ? "s" : ""} left in your satchel where you fell. Recover it next raid.</p>` : ""}
    ${r.kept.includes("vine_key") ? `<p>🗝️ The Vine Key is on your keyring. The vault opens next raid.</p>` : ""}
    <div class="total"><span>Haul value${bonus ? `, raft bonus 🍌 ${bonus} paid now` : ""}</span><b>🍌 ${value + bonus}</b></div><p class="dim">Sell your stash at the Fence.</p>`;
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
    if (G.intent.map && G.scene === "raid") toggleMap();
    if (G.intent.inv && G.scene === "raid") hud.inventory();
    if (hud.invOpen() && G.scene === "raid") Object.assign(G.intent, { fire: false, firePressed: false, ads: false, melee: false }); // the pack screen takes the mouse
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
  G.stage.render(real);
  if (PROF) { const p3 = performance.now(); if (p3 - p0 > 20 || real > 0.033) prof.push({ t: Math.round(G.raidT * 10) / 10, sim: +(p1 - p0).toFixed(1), prep: +(p2 - p1).toFixed(1), draw: +(p3 - p2).toFixed(1), steps: n }); }
  requestAnimationFrame(frame);
}
function neutral() { const i = G.intent; i.move = { x: 0, z: 0 }; i.fire = i.firePressed = i.melee = i.roll = i.interact = i.reload = i.heal = false; }
(window as unknown as { __g: unknown }).__g = { G, path, walkable, los, home: homeApi, info: () => ({ calls: G.stage.renderer.info.render.calls, tris: G.stage.renderer.info.render.triangles }) };

if (QS.has("raid")) { G.save.lookDone = true; startRaid(onRaidEnd); }
else if (!G.save.lookDone) openCreator(() => goHome(), bunkerScene);
else goHome();
requestAnimationFrame(frame);
void createRig;
