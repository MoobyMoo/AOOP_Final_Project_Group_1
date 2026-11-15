// Bot hook: builds a BotView from game state, asks the bot (Sol's core/bot.ts once merged; a tiny built-in driver
// until then) for a BotInput, and turns it into an Intent. Also drives the home loop through the bunker API.
import { G } from "./state";
import type { Intent } from "./input";
import type { BotInput } from "../contracts";
import type { BotObservation } from "./bot";
import { botTelemetry } from "./bot";
import { path, walkable, los, gates, state as gridState } from "../world/grid";
import { exits, portalMarks } from "../world/props";
import { homeApi, stations } from "../home/bunker";
import { packValue, currentSearch, worth } from "../loot/raidloot";
import { SLOTS, equipDef } from "../loot/equipment";
import { betterEquipment, equipFromLocker, equipFromPack, repair, sellEquip } from "../loot/equipment-actions";
import { isBoss } from '../ai/boss';

type Bot = { tick(v: BotObservation, dt: number): BotInput; events: object[] };
let bot: Bot | null = null;
export function setBot(b: Bot) { bot = b; }
let deploying = false;
export function view(): BotObservation {
  return {
    t: G.time, scene: G.scene === "map" ? "raid" : G.scene,
    raidId: botTelemetry.raidId, outcome: botTelemetry.outcome, combatEvents: botTelemetry.combatEvents,
    homePanelOpen: homeApi.panelOpen(), searching: !!currentSearch(), extracting: !!G.extract.id,
    packMinValue: Math.min(...G.pack.map(worth)),
    exitArmed: Object.fromEntries(exits.map(exit => [exit.id, exit.armed])),
    player: { x: G.pp.x, z: G.pp.z, hearts: Math.ceil(G.hp / 34), maxHearts: Math.ceil(G.maxHp / 34), hp: G.hp, maxHp: G.maxHp, stamina: G.stamina, usingItem: !!G.useItem, ammo: G.ammo, mag: G.mag, reloading: G.reloadT >= 0, rolling: G.rollT >= 0, packFree: G.packSlots - G.pack.length, packValue: packValue(), smoothies: G.pack.filter((i) => i === "smoothie" || i === "bandage" || i === "firstaid").length },
    // animals only matter to the bot while they are coming for it (a boar's windup and charge, a croc's ambush)
    enemies: G.enemies.filter((e) => !e.down && (!e.fauna || ["windup", "charge", "bite"].includes(e.state))).map((e) => ({ id: e.id, kind: e.kind, x: e.p.x, z: e.p.z, state: e.state, hp: e.hp, boss: isBoss(e), escort: e.group === 'plantation-boss' && !isBoss(e), windup: e.state === "windup" || e.state === "aim" || e.state === "charge", awake: e.state !== "sleep" && e.state !== "patrol" })),
    crates: G.crates.map((c) => ({ id: c.id, x: c.x, z: c.z, tier: c.tier, opened: c.opened })),
    pickups: G.pickups.map((p) => ({ id: p.id, x: p.p.x, z: p.p.z, item: p.item })),
    exits: exits.map(e => ({ id: e.id, x: e.x, z: e.z, open: e.open })),
    portals: portalMarks.filter(portal => !portal.id.startsWith("zip-")).map(portal => ({ id: portal.id, x: portal.x, z: portal.z, to: portal.to })),
    gates: gates.map(gate => ({ id: gate.id, x: gate.x, z: gate.z, nx: gate.nx, nz: gate.nz, open: gate.open, breakable: gate.hp !== undefined, usable: !gate.locked || G.pack.includes(gate.locked) || G.save.keys.includes(gate.locked) })),
    stations: stations.map((s) => ({ id: s.id === "trophies" ? "orders" : s.id, x: s.x, z: s.z })),
    upgrades: { ...G.save.upgrades },
    walkable, path, safePath: (fx, fz, tx, tz, allow) => path(fx, fz, tx, tz, 60000, allow), los, raidT: G.raidT, money: G.save.money, raids: G.save.raids, doorOpen: gridState.doorOpen, hasKey: G.pack.includes("vine_key"),
  };
}
export function botTick(dt: number): Intent {
  const v = view(), b: BotInput = bot ? bot.tick(v, dt) : { move: [0, 0] };
  if (G.scene === "raid" && !G.equipping && !G.extract.id && !currentSearch()) {
    const index = G.pack.findIndex(inst => { const def = equipDef(inst); return def && betterEquipment(inst, G.gear[def.slot]); });
    if (index >= 0 && equipFromPack(index)) bot?.events.push({ type: "equipment-start", t: G.time, inst: G.pack[index] });
  }
  if (G.scene !== "bunker") deploying = false;
  if (G.scene === "bunker" && !deploying) {
    if (b.ui === "leave") b.interact = true;
    else if (b.buy) {
      const before = G.save.upgrades[b.buy], money = G.save.money;
      homeApi.act("up:" + b.buy);
      if (G.save.upgrades[b.buy] > before) bot?.events.push({ type: "upgrade-bought", t: G.time, raid: G.save.raids - 1, upgrade: b.buy, level: G.save.upgrades[b.buy], cost: money - G.save.money });
    }
    else if (b.ui === "start") {
      for (const slot of SLOTS) { const before = G.save.money; if (repair(slot)) bot?.events.push({ type: "equipment-repaired", t: G.time, slot, cost: before - G.save.money }); }
      deploying = true; homeApi.act("deploy");
    }
    else if (b.interact && !homeApi.panelOpen()) {
      for (const slot of SLOTS) {
        let best = G.save.gear[slot], index = -1;
        G.save.locker.forEach((inst, candidate) => { if (equipDef(inst)?.slot === slot && betterEquipment(inst, best)) { best = inst; index = candidate; } });
        if (index >= 0) equipFromLocker(index);
      }
      for (let index = G.save.locker.length - 1; index >= 0; index--) if (!equipDef(G.save.locker[index])?.bound) {
        const inst = G.save.locker[index], value = sellEquip(index);
        bot?.events.push({ type: "equipment-sold", t: G.time, inst, value });
      }
      homeApi.act("sellAll"); b.interact = false;
    }
  }
  // world-space move → camera-relative stick
  const yaw = G.stage.cam.yaw, c = Math.cos(yaw), s = Math.sin(yaw), [wx, wz] = b.move;
  const mx = wx * c - wz * s, mz = wx * s + wz * c, l = Math.hypot(mx, mz) || 1;
  let aimNdc: { x: number; y: number } | null = null;
  if (b.aim) { const p = G.pp.clone().set(b.aim[0], G.pp.y + 1, b.aim[1]).project(G.stage.camera); aimNdc = { x: p.x, y: p.y }; }
  return { move: { x: mx / Math.max(1, l), z: mz / Math.max(1, l) }, aimNdc, fire: !!b.fire, firePressed: !!b.fire, ads: false, sprint: false, melee: !!b.melee, roll: !!b.roll, interact: !!b.interact, interactHeld: !!b.interact, map: false, inv: false, mini: false, reload: !!b.reload, heal: !!b.heal, swap1: false, swap2: false, swap3: false, esc: false };
}
