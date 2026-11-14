// Bananaville G1 entry. Scene flow: creator (first launch) → bunker → raid → bunker. Fixed-step sim, render per frame.
import * as THREE from "three";
import { Stage } from "./render/stage";
import { Input } from "./core/input";
import { G } from "./core/state";
import { load, save } from "./core/save_interim";
import { unlockAudio } from "./core/audio";
import { startRaid, stepRaid, renderRaid, type RaidResult } from "./core/raid";

const QS = new URLSearchParams(location.search);
G.stage = new Stage(document.getElementById("game") as HTMLCanvasElement);
G.input = new Input(G.stage.renderer.domElement);
G.save = load(); G.bot = QS.has("bot"); G.intent = G.input.read(0);
if (QS.has("fresh")) { localStorage.removeItem("bv_g1"); G.save = load(); }
addEventListener("pointerdown", unlockAudio); addEventListener("keydown", unlockAudio);

function goRaid() { startRaid(onRaidEnd); }
function onRaidEnd(r: RaidResult) {
  G.save.raids++; if (r.how === "bonked") G.save.stats.bonkOuts++; else G.save.stats.extracts++;
  if (r.kept.includes("key") && !G.save.keys.includes("key")) G.save.keys.push("key");
  const value = r.kept.filter((i) => i !== "key").length; void value;
  save(G.save);
  console.log("raid over", r.how, Math.round(r.raidT), "s", r.kept, r.lost, r.log);
  goRaid(); // TEMP until the bunker lands
}

const STEP = 1 / 60, TS = Number(QS.get("ts") ?? 1);
let acc = 0; const clock = new THREE.Clock();
function frame() {
  const real = Math.min(clock.getDelta(), 0.1) * TS;
  if (G.scene === "raid") {
    if (G.hitStop > 0) G.hitStop -= real; else {
      acc += real; let n = 0;
      while (acc >= STEP && n++ < 8 * TS) { G.intent = G.input.read(STEP); stepRaid(STEP); acc -= STEP; }
    }
    renderRaid(real);
  }
  G.stage.render(real);
  requestAnimationFrame(frame);
}
(window as unknown as { __g: unknown }).__g = { G, info: () => ({ calls: G.stage.renderer.info.render.calls, tris: G.stage.renderer.info.render.triangles }) };
goRaid();
requestAnimationFrame(frame);
