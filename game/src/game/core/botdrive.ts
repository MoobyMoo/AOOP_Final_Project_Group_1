// Bot hook: builds a BotView from game state, asks the bot (Sol's core/bot.ts once merged; a tiny built-in driver
// until then) for a BotInput, and turns it into an Intent. Also drives the home loop through the bunker API.
import { G } from "./state";
import type { Intent } from "./input";
import type { BotInput } from "../contracts";
import type { BotObservation } from "./bot";
import { path, walkable, los, state as gridState } from "../world/grid";
import { exits } from "../world/props";
import { homeApi, stations } from "../home/bunker";
import { packValue } from "../loot/raidloot";

type Bot = { tick(v: BotObservation, dt: number): BotInput; events: object[] };
let bot: Bot | null = null;
export function setBot(b: Bot) { bot = b; }
const t0 = performance.now();
export function view(): BotObservation {
  return {
    t: (performance.now() - t0) / 1000, scene: G.scene === "map" ? "raid" : G.scene,
    player: { x: G.pp.x, z: G.pp.z, hearts: Math.ceil(G.hp / 34), maxHearts: Math.ceil(G.maxHp / 34), ammo: G.ammo, mag: G.mag, reloading: G.reloadT >= 0, rolling: G.rollT >= 0, packFree: G.packSlots - G.pack.length, packValue: packValue(), smoothies: G.pack.filter((i) => i === "smoothie" || i === "bandage" || i === "firstaid").length },
    enemies: G.enemies.filter((e) => !e.down).map((e) => ({ id: e.id, kind: e.kind, x: e.p.x, z: e.p.z, state: e.state, hp: e.hp, windup: e.state === "windup" || e.state === "aim" || e.state === "charge", awake: e.state !== "sleep" && e.state !== "patrol" })),
    crates: G.crates.map((c) => ({ id: c.id, x: c.x, z: c.z, tier: c.tier, opened: c.opened })),
    pickups: G.pickups.map((p) => ({ id: p.id, x: p.obj.position.x, z: p.obj.position.z, item: p.item })),
    exits: exits.filter((e) => e.open && e.id !== "tunnel").map((e) => ({ id: e.id as "hatch" | "raft", x: e.x, z: e.z })),
    stations: stations.map((s) => ({ id: s.id === "trophies" ? "orders" : s.id, x: s.x, z: s.z })),
    upgrades: { ...G.save.upgrades },
    walkable, path, los, raidT: G.raidT, money: G.save.money, raids: G.save.raids, doorOpen: gridState.doorOpen, hasKey: G.pack.includes("vine_key"),
  };
}
export function botTick(dt: number): Intent {
  const v = view(), b: BotInput = bot ? bot.tick(v, dt) : { move: [0, 0] };
  if (G.scene === "bunker") { // home: sell, buy the cheapest upgrade, deploy
    if (!homeApi.panelOpen()) { homeApi.act("sellAll"); for (const k of ["pack", "heart", "mag"]) homeApi.act("up:" + k); homeApi.act("deploy"); }
  }
  // world-space move → camera-relative stick
  const yaw = G.stage.cam.yaw, c = Math.cos(yaw), s = Math.sin(yaw), [wx, wz] = b.move;
  const mx = wx * c - wz * s, mz = wx * s + wz * c, l = Math.hypot(mx, mz) || 1;
  let aimNdc: { x: number; y: number } | null = null;
  if (b.aim) { const p = G.pp.clone().set(b.aim[0], G.pp.y + 1, b.aim[1]).project(G.stage.camera); aimNdc = { x: p.x, y: p.y }; }
  return { move: { x: mx / Math.max(1, l), z: mz / Math.max(1, l) }, aimNdc, fire: !!b.fire, firePressed: !!b.fire, ads: false, sprint: false, melee: !!b.melee, roll: !!b.roll, interact: !!b.interact, interactHeld: !!b.interact, map: false, inv: false, mini: false, reload: !!b.reload, heal: !!b.heal, swap1: false, swap2: false, swap3: false, esc: false };
}
