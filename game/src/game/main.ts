// Bananaville G1 entry. Scene flow: creator (first launch) → bunker → raid → bunker (summary). Fixed-step sim (1/60),
// render per frame. ?bot=1 lets the pacing bot play; ?ts=N speeds time up; ?fresh=1 starts a new save; ?raid=1 skips home.
import * as THREE from "three";
import { Stage } from "./render/stage";
import { Input } from "./core/input";
import { G } from "./core/state";
import { load, save } from "./core/save_interim";
import { unlockAudio } from "./core/audio";
import { startRaid, stepRaid, renderRaid, buildRaidWorld, raidScene, type RaidResult } from "./core/raid";
import { path, walkable, los } from "./world/grid";
import { enterBunker, stepBunker, renderBunker, leaveBunker, bunkerScene, homeApi } from "./home/bunker";
import { openCreator, renderCreator } from "./ui/creator";
import { buildMapShots, toggleMap, mapOpen } from "./ui/mapview";
import { itemDef } from "./loot/raidloot";
import { createRig } from "./actors/rig";
import { createKingpin, createGunFx } from "./combat/kingpin";
import { fadeTo } from "./world/interact";
import { botTick } from "./core/botdrive";

const QS = new URLSearchParams(location.search);
G.stage = new Stage(document.getElementById("game") as HTMLCanvasElement);
G.input = new Input(G.stage.renderer.domElement);
if (QS.has("fresh")) localStorage.removeItem("bv_g1");
G.save = load(); G.bot = QS.has("bot"); G.intent = G.input.read(0);
addEventListener("pointerdown", unlockAudio); addEventListener("keydown", unlockAudio);

// world + rig up front (the map snapshot needs the raid scene built)
buildRaidWorld(); G.stage.setScene(raidScene); buildMapShots(raidScene);
G.rig = createRig("monkey", G.save.look); G.gun = createKingpin(); G.fx = createGunFx(raidScene); G.rig.sockets.handR.add(G.gun.root); G.rig.setGear?.(G.save.gear);

function goHome(summary?: string) { enterBunker(goRaid, goMirror, summary); }
function goMirror() { leaveBunker(); openCreator(() => goHome(), bunkerScene); }
function goRaid() { fadeTo(() => { leaveBunker(); startRaid(onRaidEnd); }); }
function onRaidEnd(r: RaidResult) {
  const sv = G.save; sv.raids++;
  if (r.how === "bonked") sv.stats.bonkOuts++; else sv.stats.extracts++;
  if (r.kept.includes("key") && !sv.keys.includes("key")) sv.keys.push("key");
  const kept = r.kept.filter((i) => itemDef(i).kind !== "key");
  const value = kept.reduce((a, i) => a + itemDef(i).value, 0), bonus = Math.round(value * r.bonus);
  sv.reserved.push(...kept); sv.money += bonus; sv.stats.best = Math.max(sv.stats.best, value + bonus);
  for (const i of kept) if (itemDef(i).rarity === "epic" && !sv.trophies.includes(i)) sv.trophies.push(i);
  sv.gear = { ...G.gear };
  save(sv);
  const title = r.how === "bonked" ? "Bonked! The crew carried you home 🤕" : r.how === "raft" ? "Rafted home with the haul 🛶" : r.how === "tunnel" ? "Home through the Smuggler Tunnel 🕳️" : "Back through the hatch 🏠";
  const icons = (l: string[]) => l.map((i) => `<span title="${itemDef(i).name}">${itemDef(i).icon}</span>`).join("") || "<span class=dim>nothing</span>";
  const html = `<h2>${title}</h2><p class="dim">${Math.floor(r.raidT / 60)}:${String(Math.floor(r.raidT % 60)).padStart(2, "0")} in Banana Grove · ${Object.values(r.log.kills).reduce((a, b) => a + b, 0)} bonked · ${r.log.crates} crates</p>
    <h4>Brought home (into your stash; sell it at the Fence)</h4><div class="items">${icons(r.kept)}</div><p>Worth 🍌 <b>${value}</b>${bonus ? ` + raft bonus 🍌 <b>${bonus}</b> (paid now)` : ""}</p>
    ${r.lost.length ? `<h4>Left behind in your satchel (recover it next raid!)</h4><div class="items">${icons(r.lost)}</div>` : ""}
    ${r.kept.includes("key") ? `<p>🗝️ The Vine Key is on your keyring: the vault door is open from now on.</p>` : ""}`;
  (window as unknown as { __raids: object[] }).__raids ??= []; (window as unknown as { __raids: object[] }).__raids.push({ how: r.how, t: Math.round(r.raidT), value, bonus, kept: r.kept.length, lost: r.lost.length, log: r.log });
  G.alive = true; goHome(html);
}

const STEP = 1 / 60, TS = Number(QS.get("ts") ?? 1);
let acc = 0; const clock = new THREE.Clock();
function frame() {
  const real = Math.min(clock.getDelta(), 0.1) * TS;
  acc += real; let n = 0;
  while (acc >= STEP && n++ < 8 * TS) {
    G.intent = G.bot ? botTick(STEP) : G.input.read(STEP);
    if (G.intent.map && G.scene === "raid") toggleMap();
    if (G.intent.esc && mapOpen()) toggleMap();
    if (G.scene === "raid") { if (G.hitStop > 0) G.hitStop -= STEP; else { if (mapOpen()) neutral(); stepRaid(STEP); } }
    else if (G.scene === "bunker") stepBunker(STEP);
    acc -= STEP;
  }
  if (acc > STEP * 8) acc = 0;
  if (G.scene === "raid") renderRaid(real); else if (G.scene === "bunker") renderBunker(real); else if (G.scene === "creator") renderCreator(real);
  G.stage.render(real);
  requestAnimationFrame(frame);
}
function neutral() { const i = G.intent; i.move = { x: 0, z: 0 }; i.fire = i.firePressed = i.melee = i.roll = i.interact = i.reload = i.heal = false; }
(window as unknown as { __g: unknown }).__g = { G, path, walkable, los, home: homeApi, info: () => ({ calls: G.stage.renderer.info.render.calls, tris: G.stage.renderer.info.render.triangles }) };

if (QS.has("raid")) { G.save.lookDone = true; startRaid(onRaidEnd); }
else if (!G.save.lookDone) openCreator(() => goHome(), bunkerScene);
else goHome();
requestAnimationFrame(frame);
void createRig;
