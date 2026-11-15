// Enemy brains. Behaviour, not HP, separates the four kinds (CODE_FINDINGS rules 9-12, LORE roster):
// wild monkey = keeps distance, throws an out-and-back banana boomerang, rooted until it returns;
// bandit = "!" notice cue, chases, swipe steals a loose pack item, flees to camp;
// brute = slow, 0.9 s flashing wind-up with a ground ring, 2.6 u slam (also smashes breakable walls);
// the Sleeper = sleeps (3 Z's), noise pops Z's, roars, aims a stripe, charges until he rams something; only stunned hits count.
// Activation: only enemies within 32 u think; at most 6 engaged at once. No wind-up may start off-screen (advisor 15).
import * as THREE from "three";
import { G, V, flat, type Enemy } from "../core/state";
import { ENEMY, aimRang } from "../combat/weapons";
import { createRig } from "../actors/rig";
import { SPAWNS, GROUP_RINGS } from "../world/layout";
import { path as findPath, pathLength, los, collide, walkable, ramAt, gates, straightWalk } from "../world/grid";
import { groundHeight } from "../world/terrain";
import { sfx } from "../core/audio";
import { floatText, burst } from "../../fx";
import { hurtPlayer } from "../actors/player";
import { damage, hitWall } from "../combat/combat";
import { hud } from "../ui/hud";
import { enemyGear, gearStats, visualGear } from "../loot/equipment";
import { openDoorForEnemy } from "../world/buildings";

let nextId = 1;
const sharedAlerts = new Map<Enemy, { delay: number; at: THREE.Vector3 }>();
// Cue badges sit up and to the right of the head, like a speech bubble, so they never share pixels with the health bar
// (centred over the head) or the damage numbers (rising from the head): G1 council fix 5, "separate anchors".
// "!" on a yellow bubble = noticed you. A red spiky burst with claw marks = the hit is coming (wind-up).
const CUE_CENTER = new THREE.Vector2(-0.42, 0.18), CUE_Y = 0.35;
const cueCanvas = (draw: (x: CanvasRenderingContext2D) => void) => { const c = document.createElement("canvas"); c.width = c.height = 128; const x = c.getContext("2d")!; x.lineJoin = "round"; x.lineCap = "round"; draw(x); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
const markTex = cueCanvas((x) => {
  x.fillStyle = "#ffd84a"; x.strokeStyle = "#2a1a12"; x.lineWidth = 9;
  x.beginPath(); x.moveTo(12, 118); x.lineTo(34, 78); x.lineTo(58, 98); x.closePath(); x.stroke(); x.fill();   // the tail points at the head
  x.beginPath(); x.arc(70, 56, 44, 0, 7); x.stroke(); x.fill();
  x.beginPath(); x.moveTo(34, 78); x.lineTo(58, 98); x.lineTo(60, 80); x.closePath(); x.fill();                  // hide the outline where the tail joins
  x.fillStyle = "#2a1a12"; x.font = "bold 72px Trebuchet MS"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("!", 70, 60);
});
const windTex = cueCanvas((x) => {
  x.translate(64, 64); x.fillStyle = "#e8402e"; x.strokeStyle = "#2a1a12"; x.lineWidth = 9;
  x.beginPath(); for (let i = 0; i < 20; i++) { const a = (i / 20) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 36 : 56; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); } x.closePath(); x.stroke(); x.fill();
  x.strokeStyle = "#fff6e0"; x.lineWidth = 9;                                                                   // three claw slashes
  for (const o of [-17, 0, 17]) { x.beginPath(); x.moveTo(o + 10, -22); x.quadraticCurveTo(o + 2, 0, o - 12, 22); x.stroke(); }
});
const windMat = new THREE.SpriteMaterial({ map: windTex, depthTest: false });
const windMarks = new WeakMap<Enemy, THREE.Sprite>();
/** the attack-ready cue: pops in when a wind-up starts, swells and beats faster until the hit lands */
function windCue(e: Enemy) {
  let m = windMarks.get(e);
  const total = e.kind === "sleeper" ? ENEMY.sleeper.aim * 0.5 : ENEMY[e.kind].wind;
  const on = !e.down && e.active && (e.state === "windup" || (e.kind === "sleeper" && e.state === "aim" && e.t < total));
  if (!on) { if (m) m.visible = false; return; }
  if (!m) { m = new THREE.Sprite(windMat); m.renderOrder = 22; m.center.copy(CUE_CENTER); e.rig.root.add(m); windMarks.set(e, m); }
  if (e.alertMark) e.alertMark.visible = false;
  const k = Math.min(1, Math.max(0, 1 - e.t / total)), pop = Math.min(1, k / 0.12), c = pop - 1, over = 1 + 2.7 * c * c * c + 1.7 * c * c;
  m.position.set(0, e.rig.bounds.height + CUE_Y, 0); m.scale.setScalar(Math.max(0.01, over * (0.8 + 0.3 * k) + Math.sin(k * k * 34) * 0.07 * pop)); m.visible = true;
}
const zTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d")!; x.fillStyle = "#e8f2ff"; x.strokeStyle = "#3a4a6a"; x.lineWidth = 5; x.font = "bold 50px Trebuchet MS"; x.textAlign = "center"; x.textBaseline = "middle"; x.strokeText("Z", 32, 34); x.fillText("Z", 32, 34); return new THREE.CanvasTexture(c); })();

export function spawnEnemies(set: number) {
  sharedAlerts.clear();
  for (const e of G.enemies) e.rig.dispose(); G.enemies = [];
  for (const [index, s] of SPAWNS[set % SPAWNS.length].entries()) {
    const plan = s.kind === "brute" || s.kind === "sleeper" ? "gorilla" : "monkey";
    const gearSeed = G.seed ^ Math.imul(index + 1, 7), gear = enemyGear(gearSeed, s.kind);
    const rig = createRig(plan, { kind: s.kind, seed: gearSeed });
    rig.setGear?.(gear);
    const st = ENEMY[s.kind];
    const e: Enemy = { id: nextId++, kind: s.kind, rig, p: V(s.x, s.z), vel: new THREE.Vector3(), face: G.rng() * 6.28, hp: st.hp, max: st.hp,
      state: s.kind === "sleeper" ? "sleep" : "patrol", t: G.rng() * 2, actionT: 0, home: V(s.x, s.z), group: s.group, tag: s.tag, path: [], repath: 0, flash: 0,
      stolen: [], carry: [], gear, gearSeed, zs: 3, quiet: 0, lastSeen: null, lostT: 0, rang: null, active: false, down: false, downT: 0 };
    if (s.carry) e.carry.push(s.carry); // e.g. the Radio Shack Key on the lemon bandit: bonk him and it drops
    rig.root.position.copy(e.p); G.stage.scene.add(rig.root);
    if (s.kind === "sleeper") for (let i = 0; i < 3; i++) { const z = new THREE.Sprite(new THREE.SpriteMaterial({ map: zTex, depthTest: false })); z.name = "z" + i; z.scale.setScalar(0.6 + i * 0.15); z.position.set(0.5 + i * 0.35, rig.bounds.height + 0.3 + i * 0.45, 0); z.renderOrder = 20; rig.root.add(z); }
    G.enemies.push(e);
  }
}
const onScreen = (p: THREE.Vector3) => { const v = p.clone().setY(p.y + 1).project(G.stage.camera); return Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.92 && v.z < 1; };
const toPlayer = (e: Enemy) => V(G.pp.x - e.p.x, G.pp.z - e.p.z);
function sees(e: Enemy, range: number) {
  if (!G.alive || G.zipping) return false; const d = flat(e.p, G.pp); if (d > range * gearStats(G.gear).notice) return false;
  const tp = toPlayer(e).normalize(), f = V(Math.sin(e.face), Math.cos(e.face));
  return (tp.dot(f) > -0.25 || d < 3.5) && los(e.p.x, e.p.z, G.pp.x, G.pp.z);
}
function mark(e: Enemy) {
  if (!e.alertMark) { e.alertMark = new THREE.Sprite(new THREE.SpriteMaterial({ map: markTex, depthTest: false })); e.alertMark.renderOrder = 21; e.alertMark.center.copy(CUE_CENTER); e.rig.root.add(e.alertMark); }
  e.alertMark.position.set(0, e.rig.bounds.height + CUE_Y, 0); e.alertMark.scale.setScalar(0.01); e.alertMark.visible = true;
  const m = e.alertMark; let k = 0; const grow = () => { k += 0.08; m.scale.setScalar(Math.min(0.85, k * 1.8)); if (k < 1) requestAnimationFrame(grow); else setTimeout(() => (m.visible = false), 700); }; grow();
}
/** the notice cue (rule 9) + local group alert (rule 11) */
export function alertEnemy(e: Enemy, direct = false) {
  if (e.down) return;
  if (e.kind === "sleeper") { if (e.state === "sleep") { e.zs = 0; wake(e); } return; }
  if (e.state === "patrol" || e.state === "return") {
    e.state = "notice"; e.t = e.kind === "bandit" ? ENEMY.bandit.notice : 0.35; mark(e); sfx("notice", 0.7);
    if (direct && e.group && GROUP_RINGS[e.group]) {
      const ring = GROUP_RINGS[e.group];
      if (flat(e.p, ring) < ring.r) for (const ally of G.enemies) if (ally !== e && ally.group === e.group && flat(ally.p, ring) < ring.r && !ally.down && ["patrol", "return"].includes(ally.state)) {
        sharedAlerts.set(ally, { delay: 0.45 + G.rng() * 0.35, at: (e.lastSeen ?? e.p).clone() });
      }
    }
  }
}
export function hearNoise(e: Enemy, loud: number, at?: THREE.Vector3) {
  if (e.down) return;
  if (e.kind === "sleeper") {
    if (e.state !== "sleep") return;
    const before = Math.ceil(e.zs); e.zs = Math.max(0, e.zs - loud); e.quiet = 0;
    for (let i = Math.ceil(e.zs); i < before; i++) { const z = e.rig.root.getObjectByName("z" + i); if (z) { z.visible = false; burst(z.getWorldPosition(new THREE.Vector3()), 6, "#cfe8ff", 0.5); } }
    if (Math.ceil(e.zs) < before) floatText(e.zs > 0 ? `💤 ${Math.ceil(e.zs)} left` : "uh oh...", e.p.clone().setY(4.4), "#5a4a6a", 20);
    if (e.zs <= 0) wake(e);
    return;
  }
  if ((e.state === "patrol" || e.state === "return") && at) { e.lastSeen = at.clone(); alertEnemy(e, true); }
}
function wake(e: Enemy) {
  for (let i = 0; i < 3; i++) { const z = e.rig.root.getObjectByName("z" + i); if (z) z.visible = false; }
  e.state = "roar"; e.t = ENEMY.sleeper.roar; sfx("roar"); G.stage.trauma = Math.min(1, G.stage.trauma + 0.6);
  floatText("ROOAAR!", e.p.clone().setY(4.2), "#c0392b", 38);
  hud.toast("The Sleeper is awake! Dodge his charge so he rams a tree, then hit him while he's dizzy");
}
function goTo(e: Enemy, tx: number, tz: number, speed: number, dt: number) {
  if (e.state !== "patrol" && e.state !== "return") for (const door of gates) {
    if (door.kind === "door" && !door.locked && !door.open && Math.hypot(door.x - e.p.x, door.z - e.p.z) < 2.4 && openDoorForEnemy(door.id)) { e.path = []; e.repath = 0; }
  }
  e.repath -= dt;
  if (e.repath <= 0 || !e.path.length) {
    e.repath = 0.45 + G.rng() * 0.2; e.path = straightWalk(e.p.x, e.p.z, tx, tz) ? [{ x: tx, z: tz }] : findPath(e.p.x, e.p.z, tx, tz, 6000);
    if (!e.path.length && e.state !== "patrol" && e.state !== "return") {
      let best = Infinity;
      for (const door of gates) if (door.kind === "door" && !door.locked && !door.open && flat(e.p, door) < 16) for (const side of [-1, 1]) {
        const x = door.x + door.nx * side * 1.3, z = door.z + door.nz * side * 1.3;
        const approach = findPath(e.p.x, e.p.z, x, z, 6000);
        const cost = pathLength(approach, e.p.x, e.p.z) + Math.hypot(door.x - tx, door.z - tz);
        if (approach.length && cost < best) { best = cost; e.path = approach; }
      }
    }
  }
  const w = e.path[0]; if (!w) { e.vel.multiplyScalar(0.8); return; }
  const d = Math.hypot(w.x - e.p.x, w.z - e.p.z); if (d < 0.5) { e.path.shift(); return; }
  const want = V((w.x - e.p.x) / d, (w.z - e.p.z) / d).multiplyScalar(speed);
  e.vel.lerp(want, Math.min(1, dt * 8)); e.face = Math.atan2(e.vel.x, e.vel.z);
}
const engaged = () => G.enemies.filter((e) => !e.down && ["windup", "swipe", "slam", "throwing", "charge"].includes(e.state)).length;

export function updateEnemies(dt: number) {
  for (const [ally, alert] of sharedAlerts) {
    alert.delay -= dt;
    if (alert.delay <= 0) { sharedAlerts.delete(ally); if (!ally.down && ["patrol", "return"].includes(ally.state)) { ally.lastSeen = alert.at; alertEnemy(ally); } }
  }
  for (const e of G.enemies) {
    const d = flat(e.p, G.pp);
    e.active = d < 32;
    e.flash = Math.max(0, e.flash - dt);
    windCue(e);
    if (e.down) { e.downT += dt; poseRig(e, dt); continue; }
    if (!e.active) { e.rig.root.visible = d < 48; continue; }
    e.rig.root.visible = true;
    e.t -= dt;
    switch (e.kind) { case "wild": wild(e, dt, d); break; case "bandit": bandit(e, dt, d); break; case "brute": brute(e, dt, d); break; case "sleeper": sleeper(e, dt, d); break; }
    if (e.kind !== "sleeper" || e.state !== "charge") {
      const nx = e.p.x + e.vel.x * dt, nz = e.p.z + e.vel.z * dt;
      if (walkable(nx, nz)) { e.p.x = nx; e.p.z = nz; } else e.vel.multiplyScalar(0.3);
      collide(e.p, e.rig.bounds.radius * 0.8);
    }
    e.vel.multiplyScalar(e.state === "chase" || e.state === "flee" || e.state === "kite" || e.state === "return" || e.state === "patrol" ? 1 : Math.exp(-dt * 8));
    e.p.y = groundHeight(e.p.x, e.p.z);
    poseRig(e, dt);
  }
  updateRangs(dt);
}
function poseRig(e: Enemy, dt: number) {
  const r = e.rig; r.root.position.copy(e.p);
  r.root.rotation.y = e.face;
  let action: string = "idle", at = 0;
  const sp = Math.hypot(e.vel.x, e.vel.z);
  switch (e.state) {
    case "down": action = "defeat"; at = Math.min(1, e.downT / 0.9); if (e.downT > 1.6) { r.root.scale.setScalar(Math.max(0.001, 1 - (e.downT - 1.6) * 3) * r.root.scale.x / Math.max(0.001, r.root.scale.x)); if (e.downT > 1.95) r.root.visible = false; } break;
    case "windup": action = e.kind === "brute" ? "windup" : e.kind === "wild" ? "throw" : "melee"; at = 1 - Math.max(0, e.t) / (e.kind === "brute" ? ENEMY.brute.wind : e.kind === "wild" ? ENEMY.wild.wind : ENEMY.bandit.wind); at *= e.kind === "brute" ? 0.6 : 0.3; break;
    case "slam": action = "slam"; at = 0.6 + (1 - Math.max(0, e.t) / 0.25) * 0.4; break;
    case "swipe": action = "melee"; at = 0.3 + (1 - Math.max(0, e.t) / 0.3) * 0.7; break;
    case "throwing": action = "throw"; at = 0.3 + (1 - Math.max(0, e.t) / 0.2) * 0.7; break;
    case "sleep": action = "sleep"; break;
    case "roar": action = "windup"; at = 0.5; break;
    case "aim": action = "windup"; at = 0.3; break;
    case "charge": action = "charge"; break;
    case "stunned": action = "stunned"; break;
    default: action = sp > 0.3 ? (e.kind === "brute" || e.kind === "sleeper" ? "walk" : "run") : "idle";
  }
  r.pose({ time: G.time + e.id, speed: sp, moveYaw: e.face, faceYaw: e.face, action: action as never, actionT: at, armed: "none", flash: e.flash > 0 ? 1 : 0 });
  void dt;
}

// ---------------------------------------------------------------- wild monkey
function wild(e: Enemy, dt: number, d: number) {
  const s = ENEMY.wild;
  switch (e.state) {
    case "patrol": patrol(e, dt, 1.6); if (sees(e, s.sight)) { e.lastSeen = G.pp.clone(); alertEnemy(e, true); } break;
    case "notice": e.vel.set(0, 0, 0); e.face = Math.atan2(G.pp.x - e.p.x, G.pp.z - e.p.z); if (e.t <= 0) { e.state = "kite"; e.t = 0.8 + G.rng(); } break;
    case "kite": {
      if (!G.alive) { e.state = "return"; break; }
      const tp = toPlayer(e).normalize(); e.face = Math.atan2(tp.x, tp.z);
      const want = d < s.keep[0] ? -1 : d > s.keep[1] ? 1 : 0, side = V(-tp.z, tp.x).multiplyScalar(Math.sin(G.time * 0.9 + e.id) * 0.8);
      e.vel.lerp(tp.clone().multiplyScalar(want * s.speed).add(side.multiplyScalar(s.speed * 0.6)), Math.min(1, dt * 5));
      if (d > 14 && !los(e.p.x, e.p.z, G.pp.x, G.pp.z)) { goTo(e, G.pp.x, G.pp.z, s.speed, dt); }
      if (e.t <= 0 && d < s.rangMax + 1 && los(e.p.x, e.p.z, G.pp.x, G.pp.z) && onScreen(e.p) && engaged() < 6) { e.state = "windup"; e.t = s.wind; e.vel.set(0, 0, 0); sfx("windup", 0.5); }
      if (d > 26) e.state = "return";
      break;
    }
    case "windup": e.face = Math.atan2(G.pp.x - e.p.x, G.pp.z - e.p.z); if (e.t <= 0) { throwRang(e); e.state = "throwing"; e.t = 0.2; } break;
    case "throwing": if (e.t <= 0) e.state = "rooted"; break;
    case "rooted": e.vel.set(0, 0, 0); if (!e.rang) { e.state = "kite"; e.t = s.recover + G.rng() * 1.2; } break;
    case "return": goTo(e, e.home.x, e.home.z, 2.5, dt); if (flat(e.p, e.home) < 1) e.state = "patrol"; if (sees(e, 7)) alertEnemy(e); break;
  }
}
const rangGeo = new THREE.TorusGeometry(0.32, 0.08, 6, 14, Math.PI * 0.9), rangMat = new THREE.MeshStandardMaterial({ color: "#ffd23a", roughness: 0.5, emissive: "#ffb020", emissiveIntensity: 0.35 });
function throwRang(e: Enemy) {
  const mesh = new THREE.Mesh(rangGeo, rangMat); mesh.castShadow = true; mesh.rotation.x = Math.PI / 2; const holder = new THREE.Group(); holder.add(mesh); G.stage.scene.add(holder);
  const flight = e.group ? Math.min(0.5, flat(e.p, G.pp) / ENEMY.wild.rangSpeed) : 0;
  const target = toPlayer(e).addScaledVector(G.vel, flight), out = Math.min(ENEMY.wild.rangMax, flat(e.p, G.pp) + 1.5);
  const aim = aimRang(target.x, target.z, out), dir = e.group ? V(aim.x, aim.z) : target.normalize();
  const r = { p: e.p.clone().setY(1.1), from: e.p.clone(), dir, t: 0, out, mesh: holder, owner: e, hitDone: false, back: false };
  e.rang = r; G.rangs.push(r); sfx("throw");
}
function updateRangs(dt: number) {
  for (let i = G.rangs.length - 1; i >= 0; i--) {
    const r = G.rangs[i]; r.t += dt;
    const sp = ENEMY.wild.rangSpeed, travelled = r.t * sp;
    // out along dir with a sideways curve, then home to the owner along a mirrored curve
    if (!r.back && travelled > r.out) { r.back = true; r.hitDone = false; }
    if (!r.back) { const k = travelled / r.out; r.p.set(r.from.x + r.dir.x * travelled - r.dir.z * Math.sin(k * Math.PI) * 1.6, 1.1, r.from.z + r.dir.z * travelled + r.dir.x * Math.sin(k * Math.PI) * 1.6); }
    else { const tgt = r.owner.down ? r.owner.p.clone().add(V(0, 0, 0)) : r.owner.p; const dd = V(tgt.x - r.p.x, tgt.z - r.p.z); const L = dd.length(); if (L < 0.8) { remove(i, r, r.owner.down); continue; } dd.normalize(); r.p.x += (dd.x + dd.z * 0.35) * sp * dt; r.p.z += (dd.z - dd.x * 0.35) * sp * dt; }
    r.mesh.position.copy(r.p); r.mesh.rotation.y += dt * 22;
    if (flat(r.p, G.pp) < 0.8 && !r.hitDone) { if (hurtPlayer(r.p, "boomerang", ENEMY.wild.dmg)) r.hitDone = true; } // it keeps flying: dodge the throw and the return
    if (r.t > 4) remove(i, r, true);
  }
  function remove(i: number, r: typeof G.rangs[number], drop: boolean) {
    G.stage.scene.remove(r.mesh); G.rangs.splice(i, 1); r.owner.rang = null;
    if (drop) { r.owner.carry.push("boomerang"); }
  }
}

// ---------------------------------------------------------------- bandit snatcher
function bandit(e: Enemy, dt: number, d: number) {
  const s = ENEMY.bandit;
  switch (e.state) {
    case "patrol": patrol(e, dt, 1.6); if (sees(e, s.sight * (e.group === "landing" || e.group === "ruin" ? 1.4 : 1))) { e.lastSeen = G.pp.clone(); alertEnemy(e, true); } break;
    case "notice": e.vel.set(0, 0, 0); e.face = Math.atan2(G.pp.x - e.p.x, G.pp.z - e.p.z); if (e.t <= 0) e.state = "chase"; break;
    case "chase":
      if (!G.alive) { e.state = "return"; break; }
      if (sees(e, 24)) { e.lastSeen = G.pp.clone(); e.lostT = 0; }
      goTo(e, e.lastSeen?.x ?? e.home.x, e.lastSeen?.z ?? e.home.z, s.speed, dt);
      if (d < s.reach + 0.3 && los(e.p.x, e.p.z, G.pp.x, G.pp.z) && onScreen(e.p) && engaged() < 6) { e.state = "windup"; e.t = s.wind; e.vel.set(0, 0, 0); sfx("windup", 0.4); e.flash = 0.05; }
      if (d > 24 || !los(e.p.x, e.p.z, G.pp.x, G.pp.z)) { e.lostT += dt; if (e.lostT > (e.group === "landing" || e.group === "ruin" ? 9 : 6)) { e.state = "return"; e.lostT = 0; } } else e.lostT = 0;
      break;
    case "windup": e.face = Math.atan2(G.pp.x - e.p.x, G.pp.z - e.p.z); if (e.t <= 0) { e.state = "swipe"; e.t = 0.3; if (flat(e.p, G.pp) < s.reach + 0.4 && los(e.p.x, e.p.z, G.pp.x, G.pp.z)) { if (hurtPlayer(e.p, "swipe", s.dmg, e) && e.stolen.length) { e.state = "flee"; e.t = 3.5; sfx("snatch"); floatText("YOINK!", e.p.clone().setY(2.6), "#c0392b", 24); } } } break;
    case "swipe": if (e.t <= 0) { e.state = "recover"; e.t = s.recover; } break;
    case "recover": e.vel.set(0, 0, 0); if (e.t <= 0) e.state = "chase"; break;
    case "flee": { const away = toPlayer(e).normalize().multiplyScalar(-6); goTo(e, e.p.x + away.x, e.p.z + away.z, s.flee, dt); if (e.t <= 0) e.state = "chase"; break; }
    case "return": goTo(e, e.home.x, e.home.z, 2.6, dt); if (flat(e.p, e.home) < 1) e.state = "patrol"; if (sees(e, 7)) alertEnemy(e); break;
  }
}
// ---------------------------------------------------------------- gorilla brute
function brute(e: Enemy, dt: number, d: number) {
  const s = ENEMY.brute;
  switch (e.state) {
    case "patrol": patrol(e, dt, 1.2); if (sees(e, s.sight)) alertEnemy(e); break;
    case "notice": e.vel.set(0, 0, 0); e.face = Math.atan2(G.pp.x - e.p.x, G.pp.z - e.p.z); if (e.t <= 0) { e.state = "chase"; sfx("roar", 0.5); } break;
    case "chase":
      if (!G.alive) { e.state = "return"; break; }
      goTo(e, G.pp.x, G.pp.z, s.speed, dt);
      if (d < s.slam - 0.2 && onScreen(e.p)) {
        e.state = "windup"; e.t = s.wind; e.vel.set(0, 0, 0); sfx("windup");
        if (!e.ring) { e.ring = new THREE.Mesh(new THREE.RingGeometry(s.slam - 0.25, s.slam, 48), new THREE.MeshBasicMaterial({ color: "#ff7a2a", transparent: true, opacity: 0.8, depthWrite: false })); e.ring.rotation.x = -Math.PI / 2; e.ring.renderOrder = 3; G.stage.scene.add(e.ring); const fill = new THREE.Mesh(new THREE.CircleGeometry(s.slam, 48), new THREE.MeshBasicMaterial({ color: "#ff7a2a", transparent: true, opacity: 0.25, depthWrite: false })); fill.name = "fill"; e.ring.add(fill); }
        e.ring.visible = true; e.ring.position.set(e.p.x, e.p.y + 0.06, e.p.z);
      }
      if (d > 22) { e.lostT += dt; if (e.lostT > 3) e.state = "return"; } else e.lostT = 0;
      break;
    case "windup": {
      const k = 1 - e.t / s.wind; const fill = e.ring!.getObjectByName("fill") as THREE.Mesh; fill.scale.setScalar(Math.max(0.05, k)); (e.ring!.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.abs(Math.sin(G.time * 18)) * 0.4;
      e.flash = Math.sin(G.time * 22) > 0.6 ? 0.03 : 0;
      if (e.t <= 0) {
        e.state = "slam"; e.t = 0.25; e.ring!.visible = false; sfx("slam"); G.stage.trauma = Math.min(1, G.stage.trauma + 0.45); burst(e.p.clone().setY(0.3), 22, "#c9a46a", 1.4, 2.2);
        if (flat(e.p, G.pp) < s.slam + 0.3 && los(e.p.x, e.p.z, G.pp.x, G.pp.z)) hurtPlayer(e.p, "slam", s.dmg);
        for (const g of gates) if (g.hp !== undefined && !g.open && Math.hypot(g.x - e.p.x, g.z - e.p.z) < s.slam + 1.5 + g.w * 0.25) hitWall(g.id, 3, V(g.x, g.z, 1)); // the slam smashes breakable walls and boarded doors
        for (const o of G.enemies) if (o !== e && !o.down && flat(o.p, e.p) < s.slam) damage(o, 20, "slam", o.p.clone().sub(e.p).setY(0).normalize());
      }
      break;
    }
    case "slam": if (e.t <= 0) { e.state = "recover"; e.t = s.recover; } break;
    case "recover": e.vel.set(0, 0, 0); if (e.t <= 0) e.state = "chase"; break;
    case "return": goTo(e, e.home.x, e.home.z, 2.2, dt); if (flat(e.p, e.home) < 1.2) e.state = "patrol"; if (sees(e, 6)) alertEnemy(e); break;
  }
}
// ---------------------------------------------------------------- the Sleeper
function sleeper(e: Enemy, dt: number, d: number) {
  const s = ENEMY.sleeper;
  const inHollow = flat(G.pp, e.home) < 17;
  switch (e.state) {
    case "sleep":
      e.vel.set(0, 0, 0); e.quiet += dt;
      if (d < 2.2) hearNoise(e, dt * 0.8); // walking right up to him slowly wakes him too
      if (e.zs < 3 && e.quiet > 12) { e.quiet = 0; const i = Math.ceil(e.zs); const z = e.rig.root.getObjectByName("z" + Math.min(2, i)); if (z) z.visible = true; e.zs = Math.min(3, Math.floor(e.zs) + 1); }
      break;
    case "roar": e.face = Math.atan2(G.pp.x - e.p.x, G.pp.z - e.p.z); if (e.t <= 0) { e.state = "aim"; e.t = s.aim; } break;
    case "aim": {
      if (!inHollow || !G.alive) { e.state = "back"; if (e.stripe) e.stripe.visible = false; break; }
      if (e.t > s.aim * 0.5) e.face = Math.atan2(G.pp.x - e.p.x, G.pp.z - e.p.z);
      stripe(e, e.t < s.aim * 0.5);
      if (e.t <= 0) { if (e.stripe) e.stripe.visible = false; e.state = "charge"; e.t = 2.2; }
      break;
    }
    case "charge": {
      const fx = Math.sin(e.face), fz = Math.cos(e.face), step = s.charge * dt;
      const nx = e.p.x + fx * step, nz = e.p.z + fz * step;
      const ram = ramAt(nx, nz, 1.0);
      if (ram || !walkable(nx + fx * 0.9, nz + fz * 0.9)) {
        if (ram || e.t < 2.0) { e.state = "stunned"; e.t = s.stun; sfx("thunk"); G.stage.trauma = Math.min(1, G.stage.trauma + 0.55); G.hitStop = 0.08; floatText("THUNK! Get him now!", e.p.clone().setY(4), "#8a5a34", 28); burst(e.p.clone().setY(2), 18, "#7cc24f", 1.2); }
        else { e.state = "aim"; e.t = s.aim; }
        e.vel.set(0, 0, 0); break;
      }
      e.p.x = nx; e.p.z = nz; e.vel.set(fx * s.charge, 0, fz * s.charge);
      if (d < 1.6) hurtPlayer(e.p, "charge", s.dmg);
      if (e.t <= 0) { e.state = "aim"; e.t = s.aim + 0.4; e.vel.set(0, 0, 0); floatText("skrrt", e.p.clone().setY(3.4), "#5a4a6a", 18); }
      break;
    }
    case "stunned": e.vel.set(0, 0, 0); if (e.t <= 0) { e.state = "aim"; e.t = s.aim; } break;
    case "back":
      goTo(e, e.home.x, e.home.z, 3.5, dt);
      if (flat(e.p, e.home) < 0.8) { e.state = "sleep"; e.zs = 3; e.vel.set(0, 0, 0); for (let i = 0; i < 3; i++) { const z = e.rig.root.getObjectByName("z" + i); if (z) z.visible = true; } }
      if (inHollow && G.alive && d < 13) { e.state = "aim"; e.t = s.aim; }
      break;
  }
}
function stripe(e: Enemy, locked: boolean) {
  if (!e.stripe) {
    const g = new THREE.PlaneGeometry(1.9, 1); g.translate(0, 0.5, 0);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: "#ff9a3a", transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = Math.PI / 2; m.scale.y = 16; m.renderOrder = 3; e.stripe = new THREE.Group(); e.stripe.add(m); G.stage.scene.add(e.stripe);
  }
  e.stripe.visible = true; e.stripe.position.set(e.p.x, e.p.y + 0.06, e.p.z); e.stripe.rotation.set(0, e.face, 0);
  ((e.stripe.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = locked ? 0.8 : 0.3 + Math.abs(Math.sin(G.time * 16)) * 0.3;
}
function patrol(e: Enemy, dt: number, speed: number) {
  if (e.t <= 0) { e.t = 1.5 + G.rng() * 2.5; const a = G.rng() * 6.28; e.path = []; e.lastSeen = V(e.home.x + Math.cos(a) * 3, e.home.z + Math.sin(a) * 3); }
  if (e.lastSeen && flat(e.p, e.lastSeen) > 0.6 && walkable(e.lastSeen.x, e.lastSeen.z)) goTo(e, e.lastSeen.x, e.lastSeen.z, speed, dt); else e.vel.multiplyScalar(0.85);
}
