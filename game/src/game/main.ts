// Bananaville G1 entry. Scene flow: creator (first launch) → bunker → raid → bunker (summary). Fixed-step sim (1/60),
// render per frame. ?bot=1 lets the pacing bot play; ?ts=N speeds time up; ?fresh=1 starts a new save; ?raid=1 skips home.
import "@fontsource/lilita-one";
import "@fontsource/nunito/700.css";
import "@fontsource/nunito/800.css";
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
  // the raid summary is a receipt from the Businessman's own bank (home UI: ledger paper + a rubber stamp)
  const stamp = r.how === "bonked" ? ["BONKED", "bad"] : r.how === "raft" ? ["RAFTED", "raft"] : ["HOME SAFE", "ok"];
  const how = r.how === "bonked" ? "The crew carried you home" : r.how === "raft" ? "Rafted home with the haul" : r.how === "tunnel" ? "Home through the Smuggler Tunnel" : "Back through the hatch";
  const mmss = `${Math.floor(r.raidT / 60)}:${String(Math.floor(r.raidT % 60)).padStart(2, "0")}`;
  const counted = new Map<string, number>(); for (const i of kept) counted.set(i, (counted.get(i) ?? 0) + 1);
  const lines = [...counted].map(([i, n]) => `<div class="line"><span>${itemDef(i).icon} ${itemDef(i).name}${n > 1 ? ` x${n}` : ""}</span><span></span><b>${itemDef(i).value * n}</b></div>`).join("");
  const lostN = r.lost.length;
  const html = `<div class="co">Banana Bank Ltd.<small>Raid ${sv.raids}, Banana Grove, ${mmss}</small></div><div class="stamp ${stamp[1]}">${stamp[0]}</div><hr>
    <p>${how}.</p><hr>${lines || `<p class="dim">Nothing brought home this time.</p>`}
    ${bonus ? `<div class="line"><span>🛶 Raft bonus</span><span></span><b>+${bonus}</b></div>` : ""}
    ${lostN ? `<div class="line lost"><span>Left in your satchel (${lostN} item${lostN > 1 ? "s" : ""})</span><span></span><b>recover it</b></div>` : ""}
    <hr><div class="line total"><span>Total</span><span></span><b>🍌 ${value + bonus}</b></div>
    <p class="dim">${Object.values(r.log.kills).reduce((x, y) => x + y, 0)} bonked, ${r.log.crates} crates opened. Sell your stash at the Fence.${r.kept.includes("key") ? " The Vine Key is on your keyring: the vault opens next raid." : ""}</p>`;
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
