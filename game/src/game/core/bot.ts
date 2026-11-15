import type { BotInput, BotView, SaveV1 } from "../contracts";
import { BRIEFCASE, ENEMY, KINGPIN, PLAYER } from "../combat/weapons";
import { PRICES, itemDef, mulberry32 } from "../loot/tables";
import { BOSS } from '../ai/boss';

type Point = { x: number; z: number };
type Weapon = "pistol" | "melee" | "unknown";
export type BotObservation = Omit<BotView, "exits" | 'enemies'> & {
  enemies: (BotView['enemies'][number] & { boss?: boolean; escort?: boolean })[];
  exits: { id: "hatch" | "raft" | "tunnel" | "boat"; x: number; z: number; open?: boolean }[];
  portals?: (Point & { id: string; to: Point })[];
  gates?: (Point & { id: string; open: boolean; breakable: boolean; usable: boolean; nx: number; nz: number })[];
  safePath?: (fx: number, fz: number, tx: number, tz: number, allow: (x: number, z: number) => boolean) => Point[];
  packMinValue?: number;
  player: BotView["player"] & { smoothies?: number; hp?: number; maxHp?: number; stamina?: number; usingItem?: boolean };
  raidId?: number;
  homePanelOpen?: boolean;
  searching?: boolean;
  extracting?: boolean;
  exitArmed?: Record<string, boolean | undefined>;
  upgrades?: SaveV1["upgrades"];
  outcome?: { type: "extract"; exit: "hatch" | "raft" | "tunnel" | "boat"; value: number; raidT: number } | { type: "bonk-out"; raidT?: number };
  combatEvents?: { serial: number; type: "shot" | "kill"; enemyId?: number; weapon: "pistol" | "melee" | "environment"; raidT?: number }[];
};
export const botTelemetry: { raidId: number; outcome?: BotObservation["outcome"]; combatEvents: NonNullable<BotObservation["combatEvents"]> } = { raidId: 0, combatEvents: [] };
let combatSerial = 0;
export function recordBotCombat(type: "shot" | "kill", weapon: "pistol" | "melee" | "environment", raidT: number, enemyId?: number) {
  botTelemetry.combatEvents.push({ serial: ++combatSerial, type, weapon, raidT, enemyId });
}
type Goal = Point & { kind: "crate" | "pickup" | "exit" | "arm" | "station" | "break" | "door" | 'boss'; id: string | number };
type Snapshot = {
  scene: BotView["scene"]; player: BotObservation["player"]; raidT: number;
  enemies: BotView["enemies"]; crates: BotView["crates"]; pickups: BotView["pickups"]; exits: BotObservation["exits"];
};
const distance = (left: Point, right: Point) => Math.hypot(left.x - right.x, left.z - right.z);
const goalKey = (goal: Goal) => `${goal.kind}:${goal.id}${["arm", "break", "door"].includes(goal.kind) ? `:${goal.x}:${goal.z}` : ""}`;
const dead = (enemy: BotView["enemies"][number]) => enemy.hp <= 0 || ["defeat", "dead"].includes(enemy.state);

export function createBot(opts: { greed: number; reactionLag: number; seed: number }): { tick(v: BotObservation, dt: number): BotInput; events: object[] } {
  const greed = Number.isFinite(opts.greed) ? Math.max(0, Math.min(1, opts.greed)) : 0.5;
  const lag = Number.isFinite(opts.reactionLag) ? Math.max(0, opts.reactionLag) : 0.25;
  const rng = mulberry32(opts.seed);
  const turn = rng() < 0.5 ? -1 : 1;
  const events: object[] = [];
  const levels = { mag: 0, pack: 0, heart: 0 };
  const threats = new Map<number, { seen: number; windup: number | null }>();
  const weapons = new Map<number, Weapon>();
  const blocked = new Map<string, number>();
  const failures = new Map<string, number>();
  const combatSeen = new Set<number>();
  const engagedBosses = new Set<number>();
  let now = 0, previous: Snapshot | undefined, goal: Goal | undefined;
  let waypoints: Point[] = [], waypoint = 0, pathAt = -Infinity;
  let anchor: Point | undefined, progressAt = 0;
  let extracting = false, ended = false, boughtHome = false, soldHome = false;
  let homeWait = 0, smoothies = 0, nextHeal = 0, nextShot = 0, nextMelee = 0, nextRoll = 0;

  function log(v: BotObservation, type: string, fields: object = {}) {
    events.push({ type, t: v.t, raidT: v.raidT, raid: v.raidId ?? v.raids, ...fields });
  }

  function setGoal(value: Goal | undefined, player: Point) {
    if (goal && value && goalKey(goal) === goalKey(value)) return;
    goal = value;
    waypoints = [];
    waypoint = 0;
    pathAt = -Infinity;
    anchor = { x: player.x, z: player.z };
    progressAt = now;
  }

  function safe(v: BotObservation, point: Point): boolean {
    return greed >= 0.75 || v.enemies.every(enemy => dead(enemy) || (enemy.boss ? distance(point, enemy) > BOSS.sight + 2 : enemy.kind !== "sleeper" || enemy.awake || distance(point, enemy) > ENEMY.sleeper.wake + PLAYER.radius + 0.5));
  }

  function segment(v: BotObservation, from: Point, to: Point): boolean {
    if (v.portals?.some(portal => distance(from, portal) < 0.1 && distance(to, portal.to) < 0.1)) return true;
    const steps = Math.max(1, Math.ceil(distance(from, to) / 0.4));
    for (let index = 1; index <= steps; index++) {
      const point = { x: from.x + (to.x - from.x) * index / steps, z: from.z + (to.z - from.z) * index / steps };
      if (!v.walkable(point.x, point.z) || !safe(v, point)) return false;
    }
    return true;
  }

  function repairRoute(v: BotObservation, target: Point): Point[] | null {
    const key = (point: Point) => `${point.x},${point.z}`;
    const start = { x: Math.floor(v.player.x) + 0.5, z: Math.floor(v.player.z) + 0.5 };
    const queue: Point[] = [], parents = new Map<string, Point | null>();
    for (const [offsetX, offsetZ] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const point = { x: start.x + offsetX, z: start.z + offsetZ };
      if (segment(v, v.player, point)) { queue.push(point); parents.set(key(point), null); }
    }
    for (let index = 0; index < queue.length && index < 6000; index++) {
      const current = queue[index];
      if (distance(current, target) <= 1.1) {
        const points: Point[] = [];
        let point: Point | null = current;
        while (point) { points.push(point); point = parents.get(key(point)) ?? null; }
        points.reverse();
        const simplified: Point[] = [];
        let from: Point = v.player;
        for (let cursor = 0; cursor < points.length; cursor++) {
          if (!points[cursor + 1] || !segment(v, from, points[cursor + 1])) { simplified.push(points[cursor]); from = points[cursor]; }
        }
        return simplified;
      }
      for (const [offsetX, offsetZ] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const point = { x: current.x + offsetX, z: current.z + offsetZ };
        if (parents.has(key(point)) || !segment(v, current, point)) continue;
        parents.set(key(point), current);
        queue.push(point);
      }
    }
    return null;
  }

  function directRoute(v: BotObservation, target: Point, reach = 1.8): Point[] | null {
    if (distance(v.player, target) <= reach) return [];
    const endpoints: Point[] = [target];
    for (let index = 0; index < 8; index++) {
      const angle = index * Math.PI / 4;
      endpoints.push({ x: target.x + Math.cos(angle) * 1.1, z: target.z + Math.sin(angle) * 1.1 });
    }
    for (const endpoint of endpoints) {
      if ((endpoint !== target && !v.walkable(endpoint.x, endpoint.z)) || !safe(v, endpoint)) continue;
      const points = v.safePath ? v.safePath(v.player.x, v.player.z, endpoint.x, endpoint.z, (x, z) => safe(v, { x, z })) : v.path(v.player.x, v.player.z, endpoint.x, endpoint.z);
      if (!points.length) continue;
      let from: Point = v.player, valid = true;
      for (const point of points) {
        if (!segment(v, from, point)) { valid = false; break; }
        from = point;
      }
      if (valid && distance(from, target) <= reach) return points;
      if (valid && segment(v, from, target)) return [...points, target];
      const repaired = repairRoute(v, target);
      if (repaired) return repaired;
    }
    return null;
  }

  function route(v: BotObservation, target: Point, reach = 1.8): Point[] | null {
    const direct = directRoute(v, target, reach);
    if (direct) return direct;
    let best: Point[] | null = null, bestLength = Infinity;
    for (const portal of v.portals ?? []) {
      const before = directRoute(v, portal, 1.3);
      if (!before) continue;
      const after = directRoute({ ...v, player: { ...v.player, ...portal.to } }, target, reach);
      if (!after) continue;
      const points = [...before, { x: portal.x, z: portal.z }, portal.to, ...after];
      let length = 0, from: Point = v.player;
      for (const point of points) { if (!v.portals?.some(entry => distance(from, entry) < 0.1 && distance(point, entry.to) < 0.1)) length += distance(from, point); from = point; }
      if (length < bestLength) { best = points; bestLength = length; }
    }
    return best;
  }

  function choose(v: BotObservation, candidates: Goal[]): Goal | undefined {
    let best: Goal | undefined, bestLength = Infinity;
    for (const candidate of [...candidates].sort((left, right) => String(left.id).localeCompare(String(right.id)))) {
      if ((blocked.get(goalKey(candidate)) ?? 0) > now) continue;
      const points = route(v, candidate, candidate.kind === "pickup" ? 0.8 : 1.8);
      if (points === null) { blocked.set(goalKey(candidate), now + 10); continue; }
      let from: Point = v.player, length = 0;
      for (const point of points) { if (!v.portals?.some(portal => distance(from, portal) < 0.1 && distance(point, portal.to) < 0.1)) length += distance(from, point); from = point; }
      if (length < bestLength) { best = candidate; bestLength = length; }
    }
    return best;
  }

  function walk(v: BotObservation, input: BotInput, interact = true) {
    if (!goal) return;
    const reach = goal.kind === "crate" ? 1.8 : goal.kind === "pickup" ? 0.8 : goal.kind === "break" || goal.kind === "door" ? 0.3 : 1.3;
    if (distance(v.player, goal) <= reach) {
      input.interact = interact;
      return;
    }
    if (now - pathAt > 1.5 || waypoint >= waypoints.length) {
      const points = route(v, goal, reach);
      pathAt = now;
      if (points === null) {
        blocked.set(goalKey(goal), now + 10);
        setGoal(undefined, v.player);
        return;
      }
      waypoints = points;
      waypoint = 0;
    }
    const portal = v.portals?.find(portal => distance(v.player, portal) < 1.3 && waypoints.slice(waypoint).some(point => distance(point, portal.to) < 0.1));
    if (portal) { input.interact = true; pathAt = -Infinity; return; }
    while (waypoint < waypoints.length && distance(v.player, waypoints[waypoint]) < 0.3) waypoint++;
    const point = waypoints[waypoint];
    if (!point) return;
    const length = distance(v.player, point);
    if (length > 0) input.move = [(point.x - v.player.x) / length, (point.z - v.player.z) / length];
  }

  function finish(v: BotObservation, snapshot: Snapshot, bonk: boolean) {
    if (ended) return;
    ended = true;
    if (bonk) log(v, "bonk-out", { raidT: v.outcome?.raidT ?? snapshot.raidT, value: snapshot.player.packValue, inferred: v.outcome?.type !== "bonk-out" });
    else {
      const exit = v.outcome?.type === "extract" ? v.outcome.exit : goal?.kind === "exit" ? goal.id : snapshot.exits.reduce<BotObservation["exits"][number] | undefined>((best, candidate) => !best || distance(snapshot.player, candidate) < distance(snapshot.player, best) ? candidate : best, undefined)?.id;
      log(v, "extract", {
        exit: exit ?? "unknown", raidT: v.outcome?.type === "extract" ? v.outcome.raidT : snapshot.raidT,
        value: v.outcome?.type === "extract" ? v.outcome.value : snapshot.player.packValue,
        inferred: v.outcome?.type !== "extract",
      });
    }
    log(v, "ammo-at-end", { ammo: snapshot.player.ammo + snapshot.player.mag, reserve: snapshot.player.ammo, loaded: snapshot.player.mag });
  }

  function observe(v: BotObservation) {
    if (v.scene === "raid" && previous?.scene !== "raid") {
      threats.clear(); weapons.clear(); failures.clear(); blocked.clear(); combatSeen.clear(); engagedBosses.clear();
      extracting = false; ended = false; smoothies = 0;
      nextShot = nextMelee = nextRoll = nextHeal = 0;
      setGoal(undefined, v.player);
    }
    if (previous?.scene === "raid") {
      if (v.scene !== "raid") {
        const bonk = v.outcome ? v.outcome.type === "bonk-out" : previous.player.hearts <= 0 || !previous.exits.some(exit => distance(previous!.player, exit) <= 1.75);
        finish(v, previous, bonk);
      }
      else {
        if ((v.player.hp ?? v.player.hearts) < (previous.player.hp ?? previous.player.hearts)) log(v, "hurt", { hp: v.player.hp === undefined ? undefined : previous.player.hp! - v.player.hp, hearts: previous.player.hearts - v.player.hearts });
        if (v.player.rolling && !previous.player.rolling) log(v, "roll");
        for (const crate of v.crates) {
          if (crate.opened && previous.crates.some(before => before.id === crate.id && !before.opened)) log(v, "crate-opened", { id: crate.id, tier: crate.tier });
        }
        if (v.combatEvents === undefined) {
          if (v.player.mag < previous.player.mag) log(v, "shot", { count: previous.player.mag - v.player.mag, weapon: "pistol", inferred: true });
          for (const enemy of previous.enemies) {
            const current = v.enemies.find(candidate => candidate.id === enemy.id);
            if (!dead(enemy) && (!current || dead(current))) log(v, "kill", { id: enemy.id, kind: enemy.kind, weapon: weapons.get(enemy.id) ?? "unknown", inferred: true });
          }
        }
        for (const pickup of previous.pickups) {
          if (itemDef(pickup.item).kind === "heal" && distance(previous.player, pickup) <= 1.5 && !v.pickups.some(current => current.id === pickup.id)) smoothies++;
        }
      }
    }
    for (const event of v.combatEvents ?? []) {
      if (combatSeen.has(event.serial)) continue;
      combatSeen.add(event.serial);
      log(v, event.type, { id: event.enemyId, weapon: event.weapon, raidT: event.raidT ?? v.raidT, count: event.type === "shot" ? 1 : undefined, inferred: false });
    }
    if (v.scene === "bunker" && previous?.scene !== "bunker") {
      boughtHome = false; soldHome = false; homeWait = now;
      setGoal(undefined, v.player);
    }
    if (v.upgrades) Object.assign(levels, v.upgrades);
    if (v.player.smoothies !== undefined) smoothies = Math.max(0, v.player.smoothies);
    if (v.scene === "raid" && v.outcome) {
      finish(v, { scene: v.scene, player: { ...v.player }, raidT: v.raidT, enemies: [], crates: [], pickups: [], exits: v.exits }, v.player.hearts <= 0 || v.outcome?.type === "bonk-out");
    }
  }

  function bunker(v: BotObservation, input: BotInput) {
    if (v.homePanelOpen) { input.ui = "leave"; return; }
    if (v.homePanelOpen !== undefined) {
      if (!soldHome) { soldHome = true; input.interact = true; return; }
      if (!boughtHome) {
        const upgrade = (Object.keys(levels) as (keyof typeof levels)[])
          .map(id => ({ id, price: PRICES.upgrades[id][levels[id]] }))
          .filter(candidate => candidate.price !== undefined && candidate.price <= v.money)
          .sort((left, right) => left.price - right.price)[0];
        boughtHome = true;
        if (upgrade) { input.buy = upgrade.id; return; }
      }
      input.ui = "start";
      return;
    }
    if (!soldHome && v.player.packValue > 0) {
      const station = v.stations.find(candidate => candidate.id === "sell");
      if (station && now - homeWait < 8) {
        setGoal({ ...station, kind: "station" }, v.player);
        walk(v, input);
        return;
      }
    }
    soldHome = true;
    if (!boughtHome) {
      const upgrades = (Object.keys(PRICES.upgrades) as (keyof typeof levels)[])
        .map(id => ({ id, price: PRICES.upgrades[id][levels[id]] }))
        .filter(upgrade => upgrade.price !== undefined && upgrade.price <= v.money)
        .sort((left, right) => left.price - right.price || left.id.localeCompare(right.id));
      const upgrade = upgrades[0];
      const station = v.stations.find(candidate => candidate.id === "bench");
      if (upgrade && station && (blocked.get(`station:${station.id}`) ?? 0) <= now) {
        setGoal({ ...station, kind: "station" }, v.player);
        walk(v, input);
        if (input.interact) {
          input.buy = upgrade.id;
          boughtHome = true;
        }
        return;
      }
      boughtHome = true;
    }
    const ladder = v.stations.find(station => station.id === "ladder");
    if (ladder) { setGoal({ ...ladder, kind: "station" }, v.player); walk(v, input); }
  }

  function dodge(v: BotObservation, input: BotInput, enemy: BotView["enemies"][number]): boolean {
    if (v.player.rolling || (v.player.stamina ?? PLAYER.stamina.max) < PLAYER.stamina.roll || now < nextRoll || now < nextMelee - BRIEFCASE.cycle + BRIEFCASE.wind) return false;
    const length = distance(v.player, enemy) || 1;
    const away: [number, number] = [(v.player.x - enemy.x) / length, (v.player.z - enemy.z) / length];
    const side: [number, number] = [-away[1] * turn, away[0] * turn];
    const options = enemy.kind === "wild" || enemy.kind === "sleeper" ? [side, away, [-side[0], -side[1]]] : [away, side, [-side[0], -side[1]]];
    for (const vector of options) {
      const target = { x: v.player.x + vector[0] * PLAYER.roll.dist, z: v.player.z + vector[1] * PLAYER.roll.dist };
      if (!segment(v, v.player, target)) continue;
      input.move = [vector[0], vector[1]];
      input.aim = [enemy.x, enemy.z];
      input.roll = true;
      nextRoll = now + PLAYER.roll.time + PLAYER.roll.skid + PLAYER.roll.cooldown;
      return true;
    }
    return false;
  }

  function combat(v: BotObservation, input: BotInput): boolean {
    const nearby = v.enemies.filter(enemy => !dead(enemy) && distance(v.player, enemy) <= Math.max(9, enemy.boss ? KINGPIN.range : enemy.kind === "sleeper" && enemy.awake ? ENEMY.sleeper.charge : 0))
      .filter(enemy => !enemy.boss || greed >= 0.75)
      .filter(enemy => enemy.kind !== "sleeper" || enemy.awake || greed >= 0.75);
    for (const enemy of nearby) {
      let threat = threats.get(enemy.id);
      if (!threat) { threat = { seen: now, windup: null }; threats.set(enemy.id, threat); }
      if (enemy.windup && threat.windup === null) threat.windup = now;
      if (!enemy.windup) threat.windup = null;
    }
    for (const id of threats.keys()) if (!nearby.some(enemy => enemy.id === id)) threats.delete(id);
    const ready = nearby.filter(enemy => now - threats.get(enemy.id)!.seen >= lag).sort((left, right) => distance(v.player, left) - distance(v.player, right) || left.id - right.id);
    for (const enemy of ready) {
      const threat = threats.get(enemy.id)!;
      const range = enemy.boss ? BOSS.swatRange : { wild: ENEMY.wild.rangMax, bandit: ENEMY.bandit.reach, brute: ENEMY.brute.slam, sleeper: ENEMY.sleeper.charge }[enemy.kind];
      if (enemy.windup && threat.windup !== null && now - threat.windup >= lag && distance(v.player, enemy) <= range + PLAYER.radius && dodge(v, input, enemy)) return true;
    }
    const enemy = ready.find(candidate => v.los(v.player.x, v.player.z, candidate.x, candidate.z));
    if (!enemy || v.player.rolling) return false;
    if (enemy.boss && !engagedBosses.has(enemy.id)) { engagedBosses.add(enemy.id); log(v, 'boss-engaged', { enemyId: enemy.id }); }
    input.aim = [enemy.x, enemy.z];
    const range = distance(v.player, enemy);
    if (enemy.kind === "sleeper" && enemy.state !== "stunned") return false;
    const melee = (range <= BRIEFCASE.reach + 0.3 || v.player.ammo + v.player.mag === 0) && (v.player.stamina ?? PLAYER.stamina.max) >= 4;
    if (melee) {
      if (range <= BRIEFCASE.reach + 0.3 && now >= nextMelee) {
        input.melee = true;
        nextMelee = now + BRIEFCASE.cycle;
        weapons.set(enemy.id, "melee");
      } else if (range > BRIEFCASE.reach + 0.3) {
        const points = route(v, enemy, 1.5);
        const point = points?.find(candidate => distance(v.player, candidate) > 0.3);
        if (point) { const length = distance(v.player, point); input.move = [(point.x - v.player.x) / length, (point.z - v.player.z) / length]; }
        else return false;
      }
    } else {
      if (v.player.mag === 0 && v.player.ammo > 0 && !v.player.reloading) input.reload = true;
      const sleeperVulnerable = enemy.kind !== "sleeper" || !enemy.awake || enemy.state === "stunned";
      const quiet = greed < 0.75 && v.enemies.some(candidate => candidate.kind === "sleeper" && !candidate.awake && !dead(candidate) && distance(v.player, candidate) <= KINGPIN.noise);
      if (quiet) return false;
      if (v.player.mag > 0 && !v.player.reloading && now >= nextShot && sleeperVulnerable && !quiet && range <= KINGPIN.range) {
        input.fire = true;
        nextShot = now + KINGPIN.interval;
        weapons.set(enemy.id, "pistol");
      }
    }
    return true;
  }

  function raid(v: BotObservation, input: BotInput) {
    if (ended) return;
    if ((v.player.hp !== undefined ? v.player.hp <= v.player.maxHp! * 0.5 : v.player.hearts <= 1) && !v.player.usingItem && smoothies > 0 && now >= nextHeal) {
      input.heal = true;
      smoothies--;
      nextHeal = now + 2.5;
    }
    if (v.player.usingItem) return;
    if (goal?.kind === "door" || goal?.kind === "break") {
      const gate = v.gates?.find(gate => gate.id === goal!.id);
      if (!gate || gate.open) setGoal(undefined, v.player);
      else if (goal.kind === "door" && distance(v.player, gate) < 1.65) { input.interact = true; return; }
      else if (goal.kind === "break" && distance(v.player, gate) < BRIEFCASE.reach + 0.2) {
        input.aim = [gate.x, gate.z]; if (now >= nextMelee) { input.melee = true; nextMelee = now + BRIEFCASE.cycle; } return;
      }
    }
    if (combat(v, input)) return;
    if (goal?.kind === 'boss') {
      const boss = v.enemies.find(enemy => enemy.id === goal!.id);
      if (!boss || dead(boss)) setGoal(undefined, v.player);
      else { goal.x = boss.x; goal.z = boss.z; }
    }
    if (goal?.kind === "crate" && !v.crates.some(crate => crate.id === goal!.id && !crate.opened)) setGoal(undefined, v.player);
    if (goal?.kind === "pickup" && !v.pickups.some(pickup => pickup.id === goal!.id)) setGoal(undefined, v.player);
    if (goal?.kind === "pickup") {
      const pickup = v.pickups.find(candidate => candidate.id === goal!.id);
      if (pickup) { goal.x = pickup.x; goal.z = pickup.z; }
    }
    if (goal?.kind === "arm" && v.exitArmed?.[goal.id]) setGoal(undefined, v.player);
    const opened = v.crates.filter(crate => crate.opened).length;
    const doors: Goal[] = (v.gates ?? []).filter(gate => !gate.open && gate.usable && !gate.breakable && distance(v.player, gate) < 12).flatMap(gate => [-1, 1].map(side => ({ ...gate, x: gate.x + gate.nx * side * 1.3, z: gate.z + gate.nz * side * 1.3, kind: "door" as const })));
    if (opened >= 3 + Math.round(greed * 9) || v.raidT >= 270 || (v.player.hearts <= 1 && smoothies === 0 && !input.heal)) extracting = true;
    if (!extracting) {
      if (!goal || goal.kind === "exit") {
        const pickups: Goal[] = v.pickups.filter(pickup => distance(v.player, pickup) <= 6 && (v.player.packFree > 0 || ["ammo", "key", "attachment"].includes(itemDef(pickup.item).kind) || itemDef(pickup.item).value > (v.packMinValue ?? Infinity)))
          .map(pickup => ({ ...pickup, kind: "pickup" }));
        const boss = greed >= 0.75 ? v.enemies.find(enemy => enemy.boss && !dead(enemy) && distance(v.player, enemy) < 40) : undefined;
        const selected = boss ? { ...boss, kind: 'boss' as const } : choose(v, pickups) ?? choose(v, v.crates.filter(crate => !crate.opened).map(crate => ({ ...crate, kind: "crate" }))) ?? choose(v, doors);
        setGoal(selected, v.player);
        if (!selected) extracting = true;
      }
    }
    if (extracting && goal?.kind !== "exit" && goal?.kind !== "arm") {
      // the demo slice (G1.5-13) shuts the raft and the tunnel: the greedy bot rows the cove boat home, and the middle
      // bot takes it every other raid, so a campaign tests both of the slice's exits
      const raftOpen = v.exits.some(exit => exit.id === "raft" && exit.open !== false), raid = v.raidId ?? v.raids;
      const preferred = greed >= 0.65 && v.player.hearts > 1 ? (raftOpen ? (raid % 3 === 2 ? "tunnel" : "raft") : "boat") : !raftOpen && greed >= 0.45 && raid % 2 === 1 ? "boat" : "hatch";
      const tunnel = v.exits.find(exit => exit.id === "tunnel");
      if (preferred === "tunnel" && tunnel?.open === false) {
        const rubble = v.gates?.find(gate => gate.id === "grotto-rubble" && !gate.open);
        if (rubble) {
          const sides: Goal[] = [-1, 1].map(side => ({ ...rubble, x: rubble.x + rubble.nx * side * 1.5, z: rubble.z + rubble.nz * side * 1.5, kind: "break" }));
          const target = choose(v, sides);
          if (target) { setGoal(target, v.player); walk(v, input, false); return; }
        }
      }
      const exits: Goal[] = v.exits.filter(exit => exit.open !== false).map(exit => ({ ...exit, kind: "exit" }));
      const exit = choose(v, exits.filter(exit => exit.id === preferred)) ?? choose(v, exits);
      if (exit && v.exitArmed?.[exit.id] === false) {
        const arming: Goal[] = Array.from({ length: 8 }, (_, index) => ({ kind: "arm", id: exit.id, x: exit.x + Math.cos(index * Math.PI / 4) * 10, z: exit.z + Math.sin(index * Math.PI / 4) * 10 }));
        setGoal(choose(v, arming), v.player);
      } else setGoal(exit ?? choose(v, doors), v.player);
    }
    walk(v, input);
    if (!input.fire && !input.melee && !input.interact && v.player.mag === 0 && v.player.ammo > 0 && !v.player.reloading) input.reload = true;
  }

  function watchdog(v: BotObservation, input: BotInput) {
    if (v.scene !== "raid" || v.searching || v.extracting) { progressAt = now; return; }
    if (goal?.kind === "break" && input.aim && v.gates?.some(gate => gate.id === goal!.id && !gate.open && distance(v.player, gate) < BRIEFCASE.reach + 0.2)) { progressAt = now; return; }
    if (!goal) { anchor = undefined; return; }
    if (!anchor || distance(anchor, v.player) >= 0.5) { anchor = { x: v.player.x, z: v.player.z }; progressAt = now; }
    if (now - progressAt < 4) return;
    const key = goalKey(goal), attempts = (failures.get(key) ?? 0) + 1;
    failures.set(key, attempts);
    log(v, "stuck", { goal: key, x: v.player.x, z: v.player.z, seconds: now - progressAt, action: attempts === 1 ? "repath" : "drop" });
    waypoints = []; waypoint = 0; pathAt = -Infinity; progressAt = now;
    if (attempts > 1) { blocked.set(key, now + 20); setGoal(undefined, v.player); }
    input.move = [0, 0];
  }

  return {
    events,
    tick(v, dt) {
      now += Number.isFinite(dt) && dt > 0 ? dt : 0;
      const input: BotInput = { move: [0, 0] };
      observe(v);
      if (v.scene === "creator") input.ui = "start";
      else if (v.scene === "summary") input.ui = "leave";
      else if (v.scene === "bunker") bunker(v, input);
      else raid(v, input);
      watchdog(v, input);
      previous = {
        scene: v.scene, player: { ...v.player }, raidT: v.raidT,
        enemies: v.enemies.map(enemy => ({ ...enemy })), crates: v.crates.map(crate => ({ ...crate })), pickups: v.pickups.map(pickup => ({ ...pickup })),
        exits: v.exits.map(exit => ({ ...exit })),
      };
      return input;
    },
  };
}
