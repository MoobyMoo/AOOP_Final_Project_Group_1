import type { BotInput, BotView, SaveV1 } from "../contracts";
import { BRIEFCASE, ENEMY, KINGPIN, PLAYER } from "../combat/weapons";
import { ITEMS, PRICES, mulberry32 } from "../loot/tables";

type Point = { x: number; z: number };
type Weapon = "pistol" | "melee" | "unknown";
export type BotObservation = BotView & {
  player: BotView["player"] & { smoothies?: number };
  upgrades?: SaveV1["upgrades"];
  outcome?: { type: "extract"; exit: "hatch" | "raft"; value: number; raidT: number } | { type: "bonk-out" };
  combatEvents?: { serial: number; type: "shot" | "kill"; enemyId?: number; weapon: "pistol" | "melee" }[];
};
type Goal = Point & { kind: "crate" | "pickup" | "exit" | "station"; id: string | number };
type Snapshot = {
  scene: BotView["scene"]; player: BotView["player"]; raidT: number;
  enemies: BotView["enemies"]; crates: BotView["crates"]; pickups: BotView["pickups"]; exits: BotView["exits"];
};
const distance = (left: Point, right: Point) => Math.hypot(left.x - right.x, left.z - right.z);
const goalKey = (goal: Goal) => `${goal.kind}:${goal.id}`;
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
  let now = 0, previous: Snapshot | undefined, goal: Goal | undefined;
  let waypoints: Point[] = [], waypoint = 0, pathAt = -Infinity;
  let anchor: Point | undefined, progressAt = 0;
  let extracting = false, ended = false, boughtHome = false, soldHome = false;
  let homeWait = 0, smoothies = 0, nextHeal = 0, nextShot = 0, nextMelee = 0, nextRoll = 0;
  let pendingBuy: { id: keyof typeof levels; money: number } | undefined;

  function log(v: BotView, type: string, fields: object = {}) {
    events.push({ type, t: v.t, raid: v.raids, ...fields });
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

  function safe(v: BotView, point: Point): boolean {
    return greed >= 0.75 || v.enemies.every(enemy => enemy.kind !== "sleeper" || enemy.awake || dead(enemy) || distance(point, enemy) > ENEMY.sleeper.wake + PLAYER.radius + 0.5);
  }

  function segment(v: BotView, from: Point, to: Point): boolean {
    const steps = Math.max(1, Math.ceil(distance(from, to) / 0.4));
    for (let index = 1; index <= steps; index++) {
      const point = { x: from.x + (to.x - from.x) * index / steps, z: from.z + (to.z - from.z) * index / steps };
      if (!v.walkable(point.x, point.z) || !safe(v, point)) return false;
    }
    return true;
  }

  function repairRoute(v: BotView, target: Point): Point[] | null {
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

  function route(v: BotView, target: Point): Point[] | null {
    if (distance(v.player, target) <= 1.25) return [];
    const endpoints: Point[] = [target];
    for (let index = 0; index < 8; index++) {
      const angle = index * Math.PI / 4;
      endpoints.push({ x: target.x + Math.cos(angle) * 1.1, z: target.z + Math.sin(angle) * 1.1 });
    }
    for (const endpoint of endpoints) {
      if (!v.walkable(endpoint.x, endpoint.z) || !safe(v, endpoint)) continue;
      const points = v.path(v.player.x, v.player.z, endpoint.x, endpoint.z);
      if (!points.length) continue;
      let from: Point = v.player, valid = true;
      for (const point of points) {
        if (!segment(v, from, point)) { valid = false; break; }
        from = point;
      }
      if (valid && distance(from, target) <= 1.25) return points;
      const repaired = repairRoute(v, target);
      if (repaired) return repaired;
    }
    return null;
  }

  function choose(v: BotView, candidates: Goal[]): Goal | undefined {
    let best: Goal | undefined, bestLength = Infinity;
    for (const candidate of [...candidates].sort((left, right) => String(left.id).localeCompare(String(right.id)))) {
      if ((blocked.get(goalKey(candidate)) ?? 0) > now) continue;
      const points = route(v, candidate);
      if (points === null) { blocked.set(goalKey(candidate), now + 10); continue; }
      let from: Point = v.player, length = 0;
      for (const point of points) { length += distance(from, point); from = point; }
      if (length < bestLength) { best = candidate; bestLength = length; }
    }
    return best;
  }

  function walk(v: BotView, input: BotInput, interact = true) {
    if (!goal) return;
    if (distance(v.player, goal) <= 1.25) {
      input.interact = interact;
      return;
    }
    if (now - pathAt > 1.5 || waypoint >= waypoints.length) {
      const points = route(v, goal);
      pathAt = now;
      if (points === null) {
        blocked.set(goalKey(goal), now + 10);
        setGoal(undefined, v.player);
        return;
      }
      waypoints = points;
      waypoint = 0;
    }
    while (waypoint < waypoints.length && distance(v.player, waypoints[waypoint]) < 0.3) waypoint++;
    const point = waypoints[waypoint];
    if (!point) return;
    const length = distance(v.player, point);
    if (length > 0) input.move = [(point.x - v.player.x) / length, (point.z - v.player.z) / length];
  }

  function finish(v: BotObservation, snapshot: Snapshot, bonk: boolean) {
    if (ended) return;
    ended = true;
    if (bonk) log(v, "bonk-out", { raidT: snapshot.raidT, value: snapshot.player.packValue, inferred: v.outcome?.type !== "bonk-out" });
    else {
      const exit = v.outcome?.type === "extract" ? v.outcome.exit : goal?.kind === "exit" ? goal.id : snapshot.exits.reduce<BotView["exits"][number] | undefined>((best, candidate) => !best || distance(snapshot.player, candidate) < distance(snapshot.player, best) ? candidate : best, undefined)?.id;
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
      threats.clear(); weapons.clear(); failures.clear(); blocked.clear(); combatSeen.clear();
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
        if (v.player.hearts < previous.player.hearts) log(v, "hurt", { hearts: previous.player.hearts - v.player.hearts });
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
          if (ITEMS[pickup.item]?.kind === "heal" && distance(previous.player, pickup) <= 1.5 && !v.pickups.some(current => current.id === pickup.id)) smoothies++;
        }
      }
    }
    for (const event of v.combatEvents ?? []) {
      if (combatSeen.has(event.serial)) continue;
      combatSeen.add(event.serial);
      log(v, event.type, { id: event.enemyId, weapon: event.weapon, count: event.type === "shot" ? 1 : undefined, inferred: false });
    }
    if (v.scene === "bunker" && previous?.scene !== "bunker") {
      boughtHome = false; soldHome = false; homeWait = now;
      setGoal(undefined, v.player);
    }
    if (pendingBuy && v.money < pendingBuy.money) { levels[pendingBuy.id]++; pendingBuy = undefined; }
    if (v.upgrades) Object.assign(levels, v.upgrades);
    levels.heart = Math.max(levels.heart, v.player.maxHearts - PLAYER.hearts);
    if (v.player.smoothies !== undefined) smoothies = Math.max(0, v.player.smoothies);
    if (v.scene === "raid" && (v.player.hearts <= 0 || v.outcome)) {
      finish(v, { scene: v.scene, player: { ...v.player }, raidT: v.raidT, enemies: [], crates: [], pickups: [], exits: v.exits }, v.player.hearts <= 0 || v.outcome?.type === "bonk-out");
    }
  }

  function bunker(v: BotObservation, input: BotInput) {
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
          pendingBuy = { id: upgrade.id, money: v.money };
          boughtHome = true;
        }
        return;
      }
      boughtHome = true;
    }
    const ladder = v.stations.find(station => station.id === "ladder");
    if (ladder) { setGoal({ ...ladder, kind: "station" }, v.player); walk(v, input); }
  }

  function dodge(v: BotView, input: BotInput, enemy: BotView["enemies"][number]): boolean {
    if (v.player.rolling || now < nextRoll || now < nextMelee - BRIEFCASE.cycle + BRIEFCASE.wind) return false;
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

  function combat(v: BotView, input: BotInput): boolean {
    const nearby = v.enemies.filter(enemy => !dead(enemy) && distance(v.player, enemy) <= Math.max(9, enemy.kind === "sleeper" && enemy.awake ? ENEMY.sleeper.charge : 0))
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
      const range = { wild: ENEMY.wild.rangMax, bandit: ENEMY.bandit.reach, brute: ENEMY.brute.slam, sleeper: ENEMY.sleeper.charge }[enemy.kind];
      if (enemy.windup && threat.windup !== null && now - threat.windup >= lag && distance(v.player, enemy) <= range + PLAYER.radius && dodge(v, input, enemy)) return true;
    }
    const enemy = ready.find(candidate => v.los(v.player.x, v.player.z, candidate.x, candidate.z));
    if (!enemy || v.player.rolling) return false;
    input.aim = [enemy.x, enemy.z];
    const range = distance(v.player, enemy);
    const melee = range <= 2 || v.player.ammo + v.player.mag === 0;
    if (melee) {
      if (range <= BRIEFCASE.reach && now >= nextMelee) {
        input.melee = true;
        nextMelee = now + BRIEFCASE.cycle;
        weapons.set(enemy.id, "melee");
      } else if (range > BRIEFCASE.reach) {
        const points = route(v, enemy);
        const point = points?.find(candidate => distance(v.player, candidate) > 0.3);
        if (point) { const length = distance(v.player, point); input.move = [(point.x - v.player.x) / length, (point.z - v.player.z) / length]; }
      }
    } else {
      if (v.player.mag === 0 && v.player.ammo > 0 && !v.player.reloading) input.reload = true;
      const sleeperVulnerable = enemy.kind !== "sleeper" || !enemy.awake || enemy.state === "stunned";
      const quiet = greed < 0.75 && v.enemies.some(candidate => candidate.kind === "sleeper" && !candidate.awake && !dead(candidate) && distance(v.player, candidate) <= KINGPIN.noise);
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
    if (v.player.hearts <= 1 && smoothies > 0 && now >= nextHeal) {
      input.heal = true;
      smoothies--;
      nextHeal = now + 1;
    }
    if (combat(v, input)) return;
    if (goal?.kind === "crate" && !v.crates.some(crate => crate.id === goal!.id && !crate.opened)) setGoal(undefined, v.player);
    if (goal?.kind === "pickup" && !v.pickups.some(pickup => pickup.id === goal!.id)) setGoal(undefined, v.player);
    const opened = v.crates.filter(crate => crate.opened).length;
    const capacity = 8 + 2 * levels.pack;
    const used = capacity - v.player.packFree;
    if (opened >= 3 + Math.round(greed * 9) || (used >= Math.ceil(capacity * (0.4 + greed * 0.6)) && opened >= 3) || v.raidT >= 420 || (v.player.hearts <= 1 && smoothies === 0 && !input.heal)) extracting = true;
    if (!extracting) {
      if (!goal || goal.kind === "exit") {
        const pickups: Goal[] = v.pickups.filter(pickup => distance(v.player, pickup) <= 6 && (v.player.packFree > 0 || ["ammo", "key", "attachment"].includes(ITEMS[pickup.item]?.kind)))
          .map(pickup => ({ ...pickup, kind: "pickup" }));
        const selected = choose(v, pickups) ?? choose(v, v.crates.filter(crate => !crate.opened).map(crate => ({ ...crate, kind: "crate" })));
        setGoal(selected, v.player);
        if (!selected) extracting = true;
      }
    }
    if (extracting && goal?.kind !== "exit") {
      const preferred = greed >= 0.65 && v.player.hearts > 1 ? "raft" : "hatch";
      const exits: Goal[] = v.exits.map(exit => ({ ...exit, kind: "exit" }));
      setGoal(choose(v, exits.filter(exit => exit.id === preferred)) ?? choose(v, exits), v.player);
    }
    walk(v, input);
    if (!input.fire && !input.melee && !input.interact && v.player.mag === 0 && v.player.ammo > 0 && !v.player.reloading) input.reload = true;
  }

  function watchdog(v: BotView, input: BotInput) {
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
