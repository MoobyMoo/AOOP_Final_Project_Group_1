// Bot hook: builds a BotView from game state, asks the bot (Sol's core/bot.ts once merged; a tiny built-in driver
// until then) for a BotInput, and turns it into an Intent. Also drives the home loop through the bunker API.
import { G } from "./state";
import type { Intent } from "./input";
import type { BotInput } from "../contracts";
import type { BotObservation } from "./bot";
import { botTelemetry } from "./bot";
import { path, walkable, los, state as gridState } from "../world/grid";
import { exits } from "../world/props";
import { homeApi, stations } from "../home/bunker";
import { packValue, currentSearch } from "../loot/raidloot";

type Bot = { tick(v: BotObservation, dt: number): BotInput; events: object[] };
let bot: Bot | null = null;
export function setBot(b: Bot) { bot = b; }
let deploying = false;
export function view(): BotObservation {
  return {
    t: G.time, scene: G.scene === "map" ? "raid" : G.scene,
    raidId: botTelemetry.raidId, outcome: botTelemetry.outcome, combatEvents: botTelemetry.combatEvents,
    homePanelOpen: homeApi.panelOpen(), searching: !!currentSearch(), extracting: !!G.extract.id,
    exitArmed: Object.fromEntries(exits.map(exit => [exit.id, exit.armed])),
    player: { x: G.pp.x, z: G.pp.z, hearts: Math.ceil(G.hp / 34), maxHearts: Math.ceil(G.maxHp / 34), hp: G.hp, maxHp: G.maxHp, stamina: G.stamina, usingItem: !!G.useItem, ammo: G.ammo, mag: G.mag, reloading: G.reloadT >= 0, rolling: G.rollT >= 0, packFree: G.packSlots - G.pack.length, packValue: packValue(), smoothies: G.pack.filter((i) => i === "smoothie" || i === "bandage" || i === "firstaid").length },
    enemies: G.enemies.filter((e) => !e.down).map((e) => ({ id: e.id, kind: e.kind, x: e.p.x, z: e.p.z, state: e.state, hp: e.hp, windup: e.state === "windup" || e.state === "aim" || e.state === "charge", awake: e.state !== "sleep" && e.state !== "patrol" })),
    crates: G.crates.map((c) => ({ id: c.id, x: c.x, z: c.z, tier: c.tier, opened: c.opened })),
    pickups: G.pickups.map((p) => ({ id: p.id, x: p.p.x, z: p.p.z, item: p.item })),
    exits: exits.filter((e) => e.open && e.id !== "tunnel").map((e) => ({ id: e.id as "hatch" | "raft", x: e.x, z: e.z })),
    stations: stations.map((s) => ({ id: s.id === "trophies" ? "orders" : s.id, x: s.x, z: s.z })),
    upgrades: { ...G.save.upgrades },
    walkable, path, los, raidT: G.raidT, money: G.save.money, raids: G.save.raids, doorOpen: gridState.doorOpen, hasKey: G.pack.includes("vine_key"),
  };
}
export function botTick(dt: number): Intent {
  const v = view(), b: BotInput = bot ? bot.tick(v, dt) : { move: [0, 0] };
  if (G.scene !== "bunker") deploying = false;
  if (G.scene === "bunker" && !deploying) {
    if (b.ui === "leave") b.interact = true;
    else if (b.buy) {
      const before = G.save.upgrades[b.buy], money = G.save.money;
      homeApi.act("up:" + b.buy);
      if (G.save.upgrades[b.buy] > before) bot?.events.push({ type: "upgrade-bought", t: G.time, raid: G.save.raids - 1, upgrade: b.buy, level: G.save.upgrades[b.buy], cost: money - G.save.money });
    }
    else if (b.ui === "start") { deploying = true; homeApi.act("deploy"); }
    else if (b.interact && !homeApi.panelOpen()) { homeApi.act("sellAll"); b.interact = false; }
  }
  // world-space move → camera-relative stick
  const yaw = G.stage.cam.yaw, c = Math.cos(yaw), s = Math.sin(yaw), [wx, wz] = b.move;
  const mx = wx * c - wz * s, mz = wx * s + wz * c, l = Math.hypot(mx, mz) || 1;
  let aimNdc: { x: number; y: number } | null = null;
  if (b.aim) { const p = G.pp.clone().set(b.aim[0], G.pp.y + 1, b.aim[1]).project(G.stage.camera); aimNdc = { x: p.x, y: p.y }; }
  return { move: { x: mx / Math.max(1, l), z: mz / Math.max(1, l) }, aimNdc, fire: !!b.fire, firePressed: !!b.fire, ads: false, sprint: false, melee: !!b.melee, roll: !!b.roll, interact: !!b.interact, interactHeld: !!b.interact, map: false, inv: false, mini: false, reload: !!b.reload, heal: !!b.heal, swap1: false, swap2: false, swap3: false, esc: false };
}
