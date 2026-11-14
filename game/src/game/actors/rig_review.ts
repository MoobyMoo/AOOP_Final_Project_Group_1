// Rig review page (rig.html). Query:
//   view=lineup|gameplay|closeup   kind=player|wild|bandit|brute|sleeper   action=<RigAction|use|cheer>
//   t=<seconds, freezes the clock>  loop=1 (replay timed actions)  speed=<u/s>  yaw=<deg facing>  aim=<deg twist>
//   preset=<index into LOOK_PRESETS>  look=<share code>  gear=bowler,shades,satchel | none  armed=pistol|none|briefcase
//   seed=<enemy seed>  old=1 (the old primitive monkey beside it)  gun=0 (hide the stand-in pistol)  bg=<hex>
//   gear accepts equipment instances too ("warden_vest#0" = broken).
// view=gear is the G1-23 equipment matrix:
//   set=body    every body piece on the default Businessman (front row: satchel; back row: big backpack)
//   set=hats    every hat x every headset (plus a bare-headed column and a no-headset row)
//   set=builds  a stocky and a slim Businessman in every vest
//   set=bandit  Peel Gang bandits in peel_jacket + pot_helmet, beside a plain bandit and one with a headset
//   set=face    every face piece with the helmets and headsets it has to clear
//   set=broken  each new piece at durability 0 beside the same piece intact
//   cam=close|game (game = the real 55 deg / 40 u camera)  turn=<deg> (180 = backs)  row=<i> from=<col> n=<cols> (zoom on a few)
//   action / speed / t / armed work as in the other views.
// The gameplay view is the real camera (Stage: 55 deg pitch, -30 deg yaw, FOV 24, distance 40).
import * as THREE from "three";
import { Stage } from "../render/stage";
import { U, patch } from "../render/shading";
import { preloadCharacters, createRig, rigStats, CLIP_INFO, type RigActionX } from "./rig";
import { LOOK_PRESETS, decodeLook } from "./look";
import { WEARABLES, DEFAULT_GEAR, WEAR_ZONES, baseId } from "./wearables";
import { createKingpin, preloadKingpin } from "../combat/kingpin";
import { Monkey3D } from "./monkey3d";
import type { Rig, Gear, RigState, EnemyStyle, MonkeyLook } from "../contracts";

const QS = new URLSearchParams(location.search);
const num = (k: string, d: number) => (QS.has(k) ? Number(QS.get(k)) : d);
const view = QS.get("view") ?? "closeup", kind = QS.get("kind") ?? "player", action = (QS.get("action") ?? "idle") as RigActionX;
const stage = new Stage(document.getElementById("game") as HTMLCanvasElement, QS.get("bg") ? "#" + QS.get("bg") : view === "gameplay" ? "#b7c98a" : "#d9cfa8");
const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), patch(new THREE.MeshStandardMaterial({ color: view === "gameplay" ? "#86a85a" : "#c9bd96", roughness: 0.95 }), { rim: 0 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; stage.scene.add(ground);

function parseGear(s: string | null): Gear {
  if (s === null) return { ...DEFAULT_GEAR };
  const g: Gear = { head: null, face: null, body: null, back: null, ears: null };
  for (const inst of s.split(",")) { const w = WEARABLES.find((x) => x.id === baseId(inst)); if (w) g[w.slot] = inst; }
  return g;
}
type Actor = { rig: Rig; action: RigActionX; speed: number; yaw: number; aim: number; armed: RigState["armed"]; off: number };
const actors: Actor[] = [];
function add(k: string, x: number, z: number, o: Partial<Actor> & { look?: MonkeyLook; gear?: Gear; seed?: number } = {}) {
  const player = k === "player";
  const rig = player ? createRig("monkey", o.look ?? LOOK_PRESETS[0].look) : createRig(k === "brute" || k === "sleeper" ? "gorilla" : "monkey", { kind: k, seed: o.seed ?? 3 } as EnemyStyle);
  if (player) {
    rig.setGear?.(o.gear ?? { ...DEFAULT_GEAR });
    if (QS.get("gun") !== "0" && (view !== "gear" || QS.get("armed") === "pistol")) rig.sockets.handR.add(createKingpin().root);
  }
  rig.root.position.set(x, 0, z); stage.scene.add(rig.root);
  const a: Actor = { rig, action: o.action ?? "idle", speed: o.speed ?? 0, yaw: o.yaw ?? 0, aim: o.aim ?? 0, armed: o.armed ?? (player ? "pistol" : "none"), off: actors.length * 0.37 };
  actors.push(a); return a;
}

await preloadCharacters(); await preloadKingpin();
const defSpeed = (a: string) => (a === "run" ? 4.6 : a === "walk" ? 1.6 : a === "charge" ? 6 : 0);
const yaw = THREE.MathUtils.degToRad(num("yaw", view === "gameplay" ? -30 : view === "lineup" ? 172 : 160)), aim = THREE.MathUtils.degToRad(num("aim", 0));
const look = (QS.get("look") && decodeLook(QS.get("look")!)) || LOOK_PRESETS[num("preset", 0)]?.look || LOOK_PRESETS[0].look;
const armed = (QS.get("armed") ?? (kind === "player" ? (action === "melee" ? "briefcase" : "pistol") : "none")) as RigState["armed"];
let focus = new THREE.Vector3(0, 1.0, 0);
if (view === "lineup") {
  const gears: Gear[] = [{ ...DEFAULT_GEAR }, { head: "tophat", face: "monocle", body: null, back: "bigpack", ears: null }, { head: "fedora", face: "aviators", body: null, back: "cratepack", ears: null }, { head: "crown", face: "heartglasses", body: null, back: null, ears: null }, { head: "hardhat", face: "goggles", body: null, back: "bigpack", ears: null }, { head: "pith", face: "eyepatch", body: null, back: "satchel", ears: null }];
  LOOK_PRESETS.forEach((p, i) => add("player", 9.8 - i * 1.95, -2.2, { look: p.look, gear: gears[i % gears.length], yaw, armed: i === 0 ? "pistol" : "none" }));
  add("wild", 8.6, 1.2, { seed: 1, yaw }); add("wild", 6.6, 1.2, { seed: 2, yaw }); add("wild", 4.6, 1.2, { seed: 5, yaw });
  add("bandit", 2.2, 1.2, { seed: 1, yaw }); add("bandit", 0.2, 1.2, { seed: 4, yaw }); add("bandit", -1.8, 1.2, { seed: 7, yaw });
  if (QS.get("gorillas") !== "0") { add("brute", -5.2, 1.6, { seed: 2, yaw }); add("sleeper", -9.6, 1.8, { seed: 1, yaw }); }
  for (const a of actors) { a.action = action; a.speed = num("speed", defSpeed(action)); }
  focus.set(0, 1.3, -0.4); stage.cam.dist = num("dist", 31); stage.cam.pitch = THREE.MathUtils.degToRad(num("pitch", 16)); stage.cam.yaw = THREE.MathUtils.degToRad(num("camyaw", 172));
} else if (view === "gear") {
  const set = QS.get("set") ?? "body", game = QS.get("cam") === "game", camYaw = num("camyaw", game ? -30 : 172), th = THREE.MathUtils.degToRad(camYaw);
  const g = (o: Partial<Gear>): Gear => ({ head: null, face: null, body: null, back: null, ears: null, ...o });
  const ids = (slot: string) => WEARABLES.filter((w) => w.slot === slot).map((w) => w.id);
  const BODY = ids("body"), HATS = [null, ...ids("head")], EARS = ids("ears"), FACE = ids("face");
  type Cell = { k?: string; look?: MonkeyLook; gear: Gear; seed?: number };
  const withBuild = (b: number): MonkeyLook => ({ ...structuredClone(LOOK_PRESETS[0].look), x: { build: b } } as MonkeyLook);
  let rows: Cell[][] = [];
  if (set === "body") rows = [[null, ...BODY].map((b) => ({ gear: g({ ...DEFAULT_GEAR, body: b }) })), [null, ...BODY].map((b, i) => ({ look: LOOK_PRESETS[i % LOOK_PRESETS.length].look, gear: g({ head: "fedora", face: "aviators", body: b, back: i % 2 ? "bigpack" : "cratepack" }) }))];
  else if (set === "hats") rows = [null, ...EARS].map((e) => HATS.map((h) => ({ gear: g({ head: h, face: "shades", ears: e }) })));
  else if (set === "builds") rows = [1, -1].map((b) => BODY.map((id) => ({ look: withBuild(b), gear: g({ ...DEFAULT_GEAR, body: id }) })));
  else if (set === "bandit") rows = [[1, 4, 7, 9].map((seed, i) => ({ k: "bandit", seed, gear: i === 3 ? g({}) : g({ head: "pot_helmet", body: "peel_jacket", ears: i === 2 ? "radio_headset" : null }) })),
    [2, 5].map((seed, i) => ({ k: i ? "wild" : "bandit", seed, gear: g({ head: i ? "coconut_helmet" : "warden_helmet", body: i ? "leaf_vest" : "warden_vest", back: i ? null : "sack" }) }))];
  else if (set === "face") rows = [FACE.map((f) => ({ gear: g({ head: "warden_helmet", face: f, ears: "walkman" }) })), FACE.map((f, i) => ({ gear: g({ head: ["pot_helmet", "coconut_helmet", "bowler", "pith"][i % 4], face: f, ears: "radio_headset" }) }))];
  else if (set === "broken") { const NEW = WEARABLES.filter((w) => !!WEAR_ZONES[w.id] && ["pot_helmet", "coconut_helmet", "warden_helmet", "snorkel", ...BODY, "sack", ...EARS].includes(w.id)); rows = [NEW.map((w) => ({ gear: g({ [w.slot]: w.id }) })), NEW.map((w) => ({ gear: g({ [w.slot]: w.id + "#0" }) }))]; }
  const from = num("from", 0), n = num("n", 99);
  if (QS.has("row")) rows = [rows[num("row", 0)] ?? rows[0]];
  rows = rows.map((r) => r.slice(from, from + n));
  const cols = Math.max(...rows.map((r) => r.length)), dx = num("dx", 2.15), dz = num("dz", game ? 3.2 : 2.7);
  const face = THREE.MathUtils.degToRad(num("yaw", camYaw) + num("turn", 0));
  rows.forEach((r, j) => r.forEach((c, i) => {
    const u = (i - (cols - 1) / 2) * dx, v = (j - (rows.length - 1) / 2) * dz;
    const a = add(c.k ?? "player", Math.cos(th) * u + Math.sin(th) * v, -Math.sin(th) * u + Math.cos(th) * v, { look: c.look, gear: c.k ? undefined : c.gear, seed: c.seed, yaw: face, action, speed: num("speed", defSpeed(action)), armed: (QS.get("armed") ?? "none") as RigState["armed"] });
    if (c.k) a.rig.setGear?.(c.gear);
  }));
  focus.set(0, game ? 0.9 : 1.05, 0);
  stage.cam.dist = num("dist", game ? 40 : Math.max(8.6, cols * dx * 1.5, rows.length * 7.5)); stage.cam.pitch = THREE.MathUtils.degToRad(num("pitch", game ? 55 : 14)); stage.cam.yaw = th;
} else {
  const big = kind === "brute" || kind === "sleeper";
  add(kind, 0, 0, { look, gear: parseGear(QS.get("gear")), seed: num("seed", 3), action, speed: num("speed", defSpeed(action)), yaw, aim, armed });
  if (QS.get("old") === "1") {
    const m = new Monkey3D({ fur: "#e07a32", face: "#f6c896", suit: "#3c5a8c", pants: "#2c3550", tie: "#ff8a2a", hat: "bowler", band: "#ffb02a", shades: true, briefcase: false, rim: 1.3 });
    m.root.position.set(view === "gameplay" ? -2.2 : -1.7, 0, 0); m.root.rotation.y = yaw; m.update(0.016, 0, yaw); stage.scene.add(m.root);
    focus.x = view === "gameplay" ? -1.1 : -0.85;
  }
  if (view === "closeup") {
    focus.y = big ? 1.5 : 1.05; stage.cam.dist = num("dist", big ? 17 : 8.6); stage.cam.pitch = THREE.MathUtils.degToRad(num("pitch", 9)); stage.cam.yaw = THREE.MathUtils.degToRad(num("camyaw", 138));
  } else { focus.y = 0.9; stage.cam.dist = num("dist", 40); }
}

const info = document.getElementById("info")!, loop = QS.get("loop") === "1", clock = new THREE.Clock();
let fixed = QS.has("t"), fixedT = num("t", 0);
let shown = "";
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1), now = fixed ? fixedT : clock.elapsedTime;
  for (const a of actors) {
    const ci = CLIP_INFO[a.action], timed = ci && !ci.loop;
    let act = a.action, at = 0;
    if (timed) {
      if (fixed) at = QS.has("at") ? num("at", 0) : now / ci.dur;
      else if (loop) { const cyc = (now + a.off) % (ci.dur + 0.7); at = cyc / ci.dur; if (at > 1) { act = a.speed > 0.3 ? "run" : "idle"; at = 0; } }
      else at = Math.min(1, now / ci.dur);
    }
    a.rig.root.rotation.y = a.yaw;
    a.rig.pose({ time: now + a.off, speed: a.speed, moveYaw: a.yaw, faceYaw: a.yaw + a.aim, action: act as RigState["action"], actionT: Math.min(1, at), armed: act === "melee" && a.armed !== "none" ? "briefcase" : a.armed === "briefcase" ? "pistol" : a.armed, flash: num("flash", 0) });
  }
  U.uTime.value = now; stage.place(focus, dt, now); stage.render(dt);
  const s = rigStats(actors[0].rig), txt = `${view} · ${kind} · ${action}\n${s.tris} tris · ${s.calls} draw calls (rig + gear)\nframe: ${stage.renderer.info.render.calls} calls`;
  if (txt !== shown) { shown = txt; info.textContent = QS.get("hud") === "0" ? "" : txt; }
  requestAnimationFrame(frame);
}
(window as unknown as { __rig: unknown }).__rig = { stats: () => actors.map((a) => rigStats(a.rig)), actors, setT: (t: number) => { fixed = true; fixedT = t; } };
requestAnimationFrame(frame);
