// Wildlife (G1.5 population pass). Moo: "wild animals and stuff can exist too". Our own system; Duckov has animals too,
// but nothing of theirs is copied. Two kinds:
//  - ambient and harmless: crabs on the sand (scuttle sideways, burrow), parrots perched in palms (flush with a squawk:
//    that squawk is a noise event at your position, so a flushed parrot gives you away), frogs at the swamp's water and
//    in the grotto (hop off). They scatter when you come near and when gunfire goes off in a radius.
//  - wildlife that can hurt you, run as G.enemies entries so bullets, the briefcase, damage numbers, knockouts and the
//    searchable body (loot/bodies.ts, the shared loot screen) all work unchanged: boars graze in the plantation fields and
//    on the jungle edge, neutral until you come close or hit one, then charge after a telegraph (the "!" cue, a pawing
//    windup); crocs lurk in the mangrove water and ambush you at the water's edge, bite once and sink back.
// Their calm states are named like the monkeys' ("patrol", "return") so the HUD's health bars, threat arrows and the
// combat music only react once an animal is actually coming for you (windup, charge, bite).
// Enemies and animals ignore each other (the simple option the brief offers): the monkeys' perception only ever looks
// at you. Animals hear through makeNoise (combat.ts calls faunaHear) and see you by distance.
// Models: Fable's rigged fauna_<id> nodes in public/models/fauna.glb when the file is there (cloned with their
// skeletons, clips matched by name), else clean code-built stand-ins (a few lit shapes per animal).
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as skClone } from "three/addons/utils/SkeletonUtils.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { G, V, flat, type Enemy } from "../core/state";
import type { Rig } from "../contracts";
import { walkable } from "../world/grid";
import { groundHeight } from "../world/terrain";
import { mat, patch } from "../render/shading";
import { hurtPlayer } from "../actors/player";
import { sfx } from "../core/audio";
import { burst } from "../../fx";
import { PLACED, FAUNA_SPAWNS, type FaunaId } from "../world/map/grove";

export type { FaunaId };
/** the numbers (ours; tuned for a 2 u monkey walking 4.6 u/s) */
export const FAUNA = {
  crab: { scare: 4, hear: 12, speed: 4.2, burrow: [6, 10] as const },
  parrot: { scare: 7, hear: 18, fly: 9, noise: 13 },
  frog: { scare: 3, hear: 10, hop: 1.3 },
  boar: { hp: 110, notice: 5.5, noticeSprint: 7.5, wind: 0.8, charge: 10, chargeLen: 12, hit: 18, recover: 1.6, calm: 6, radius: 0.55, height: 0.9, drops: ["meat", "meat", "hide"] },
  croc: { hp: 220, ambush: 3.6, wind: 0.5, bite: 25, reach: 1.9, sink: 2, cooldown: 8, radius: 1.0, height: 0.5, drops: ["hide", "hide"] },
} as const;

// ---------------------------------------------------------------- models: Fable's GLB if present, else stand-ins
let GLB: THREE.Group | null = null, CLIPS: THREE.AnimationClip[] = [], tried = false;
/** load public/models/fauna.glb if it exists (Fable is building it in parallel); stand-ins otherwise */
export async function preloadFauna(url = `${import.meta.env.BASE_URL}models/fauna.glb`) {
  if (tried) return; tried = true;
  try { const head = await fetch(url, { method: "HEAD" }); if (!head.ok) return; const g = await new GLTFLoader().loadAsync(url); GLB = g.scene; CLIPS = g.animations; } catch { GLB = null; }
}
export const faunaGlbLoaded = () => !!GLB;
type PlayOpts = { once?: boolean; speed?: number; reverse?: boolean; restart?: boolean; fade?: number };
type Model = { root: THREE.Group; parts: Record<string, THREE.Object3D>; glb: boolean; mixer?: THREE.AnimationMixer; play?: (name: string, o?: PlayOpts) => void; phase?: () => number };
const PATCHED = new WeakSet<THREE.Material>();
/** Fable's rig for an animal: fauna_<id> is an armature with one skinned mesh, bones <id>_<bone>, clips <id>_<clip>
 *  (30 fps). SkeletonUtils.clone per instance so every animal has its own skeleton; the clips bind by bone name. Its
 *  MAT_Fauna takes COLOR_0, so the loader's own material renders it; we only add our rim light (render/shading patch) */
function fromGlb(id: FaunaId): Model | null {
  const src = GLB?.getObjectByName(`fauna_${id}`); if (!src) return null;
  const root = new THREE.Group(), body = skClone(src) as THREE.Object3D; body.position.set(0, 0, 0); body.rotation.set(0, 0, 0); root.add(body);
  body.traverse((o) => { const m = o as THREE.Mesh; if (!m.isMesh) return; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
    for (const mt of Array.isArray(m.material) ? m.material : [m.material]) if (!PATCHED.has(mt)) { patch(mt, { rim: 0.55 }); PATCHED.add(mt); } });
  const mixer = new THREE.AnimationMixer(body), clips = new Map(CLIPS.filter((c) => c.name.startsWith(id + "_")).map((c) => [c.name.slice(id.length + 1), c]));
  let cur: THREE.AnimationAction | null = null, curName = "";
  const play = (name: string, o: PlayOpts = {}) => {
    if (name === curName && !o.restart) { if (cur && o.speed !== undefined) cur.timeScale = (o.reverse ? -1 : 1) * o.speed; return; }
    const c = clips.get(name); if (!c) return;
    const act = mixer.clipAction(c); act.reset(); act.setLoop(o.once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); act.clampWhenFinished = !!o.once;
    act.timeScale = (o.reverse ? -1 : 1) * (o.speed ?? 1); if (o.reverse) act.time = c.duration;
    act.enabled = true; act.setEffectiveWeight(1); act.play();
    if (cur && cur !== act) cur.crossFadeTo(act, o.fade ?? 0.12, false);
    cur = act; curName = name;
  };
  const phase = () => (cur ? Math.max(0, Math.min(1, cur.time / cur.getClip().duration)) : 0);
  play(id === "parrot" ? "perch_idle" : id === "croc" ? "lurk" : "idle");
  return { root, parts: { body }, glb: true, mixer, play, phase };
}
let VC_MAT: THREE.Material | null = null;
const M = (c: string) => mat(c, { rough: 0.7, rim: 0.6 });
function part(g: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0, parent?: THREE.Object3D) { const m = new THREE.Mesh(g, M(color)); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent?.add(m); return m; }
/** the stand-ins: a few shapes each, sized to read at the gameplay camera (a crab is a fist, a boar knee-high to a monkey) */
function standIn(id: FaunaId): Model {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body); const parts: Record<string, THREE.Object3D> = { body };
  if (id === "crab") {
    part(new THREE.SphereGeometry(0.2, 10, 6).scale(1.3, 0.5, 1), "#e8613c", 0, 0.12, 0, body);
    for (const s of [-1, 1]) { const c = part(new THREE.SphereGeometry(0.09, 8, 5).scale(1.2, 0.7, 0.9), "#f07a4c", s * 0.3, 0.14, 0.14, body); parts[s < 0 ? "clawL" : "clawR"] = c;
      for (let k = 0; k < 3; k++) part(new THREE.CylinderGeometry(0.018, 0.018, 0.2, 4).rotateZ(s * 1.0), "#c8502f", s * 0.27, 0.06, -0.1 + k * 0.1, body); }
    for (const s of [-1, 1]) part(new THREE.SphereGeometry(0.035, 6, 4), "#1c1c1c", s * 0.07, 0.24, 0.14, body);
  } else if (id === "parrot") {
    part(new THREE.SphereGeometry(0.16, 10, 8).scale(0.85, 1.1, 1), "#d8352f", 0, 0.2, 0, body);
    part(new THREE.SphereGeometry(0.11, 10, 8), "#e04a3a", 0, 0.42, 0.04, body);
    part(new THREE.ConeGeometry(0.045, 0.1, 6).rotateX(Math.PI / 2 + 0.6), "#f2c94c", 0, 0.4, 0.15, body);
    part(new THREE.BoxGeometry(0.08, 0.04, 0.32).translate(0, 0, -0.18), "#2b6fd1", 0, 0.12, -0.08, body);
    for (const s of [-1, 1]) { const w = new THREE.Group(); w.position.set(s * 0.13, 0.26, 0); body.add(w); part(new THREE.BoxGeometry(0.3, 0.03, 0.16).translate(s * 0.15, 0, 0), s < 0 ? "#2fa84f" : "#2fa84f", 0, 0, 0, w); parts[s < 0 ? "wingL" : "wingR"] = w; }
  } else if (id === "frog") {
    part(new THREE.SphereGeometry(0.16, 10, 6).scale(1, 0.6, 1.15), "#4fae3c", 0, 0.1, 0, body);
    for (const s of [-1, 1]) { part(new THREE.SphereGeometry(0.05, 8, 5), "#f2f2d0", s * 0.08, 0.2, 0.1, body); part(new THREE.SphereGeometry(0.06, 8, 5).scale(1.4, 0.5, 1.6), "#3f8f30", s * 0.15, 0.04, -0.06, body); }
  } else if (id === "boar") {
    part(new THREE.SphereGeometry(0.5, 12, 8).scale(0.9, 0.85, 1.35), "#6b4a34", 0, 0.62, 0, body);
    part(new THREE.SphereGeometry(0.3, 10, 8).scale(0.9, 0.9, 1.1), "#5e402c", 0, 0.62, 0.68, body);
    part(new THREE.CylinderGeometry(0.13, 0.14, 0.12, 10).rotateX(Math.PI / 2), "#c98f7a", 0, 0.56, 0.98, body);
    for (const s of [-1, 1]) { part(new THREE.ConeGeometry(0.04, 0.18, 6).rotateX(-0.6), "#f4ecd8", s * 0.12, 0.52, 0.92, body); part(new THREE.ConeGeometry(0.08, 0.16, 5), "#4a3222", s * 0.17, 0.92, 0.6, body); }
    part(new THREE.BoxGeometry(0.06, 0.18, 0.7), "#2e2018", 0, 1.02, 0.05, body); // the bristle ridge
    for (const [x, z] of [[-0.25, 0.4], [0.25, 0.4], [-0.25, -0.4], [0.25, -0.4]]) { const l = part(new THREE.CylinderGeometry(0.07, 0.06, 0.4, 6), "#4a3222", x, 0.2, z, body); parts[`leg${x}${z}`] = l; }
  } else {
    part(new THREE.BoxGeometry(0.62, 0.3, 1.5), "#4f6b3a", 0, 0.2, 0, body);
    part(new THREE.BoxGeometry(0.42, 0.2, 0.75).translate(0, 0, 0.35), "#5a7a42", 0, 0.18, 0.8, body);
    const jaw = part(new THREE.BoxGeometry(0.38, 0.08, 0.7).translate(0, 0, 0.35), "#e9e2c6", 0, 0.06, 0.82, body); parts.jaw = jaw;
    part(new THREE.ConeGeometry(0.22, 1.3, 6).rotateX(-Math.PI / 2), "#4f6b3a", 0, 0.2, -1.35, body);
    for (const s of [-1, 1]) part(new THREE.SphereGeometry(0.06, 8, 5), "#e7d34a", s * 0.13, 0.33, 0.95, body);
    for (const [x, z] of [[-0.36, 0.45], [0.36, 0.45], [-0.36, -0.45], [0.36, -0.45]]) part(new THREE.BoxGeometry(0.16, 0.1, 0.22), "#3e5a2e", x, 0.05, z, body);
  }
  // the small ones a little larger than life, like the ground items (loot/ground.ts): a fist-sized crab still has to read
  body.scale.setScalar({ crab: 1.4, parrot: 1.7, frog: 1.4, boar: 1, croc: 1 }[id]);
  // one draw call for everything that doesn't move on its own: the shapes merged into one vertex-coloured mesh
  const moving = new Set(Object.entries(parts).filter(([n]) => n !== "body" && (n.startsWith("wing") || n.startsWith("leg"))).map(([, o]) => o));
  const stat = body.children.filter((c) => (c as THREE.Mesh).isMesh && !moving.has(c)) as THREE.Mesh[];
  if (stat.length > 1) {
    const geos = stat.map((m) => { m.updateMatrix(); const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix); const col = ((m.material as THREE.MeshStandardMaterial).color ?? new THREE.Color(1, 1, 1)), n = g.getAttribute("position").count, c = new Float32Array(n * 3); for (let i = 0; i < n; i++) c.set([col.r, col.g, col.b], i * 3); g.setAttribute("color", new THREE.BufferAttribute(c, 3)); for (const a of Object.keys(g.attributes)) if (!["position", "normal", "color"].includes(a)) g.deleteAttribute(a); return g; });
    for (const m of stat) m.removeFromParent();
    const merged = new THREE.Mesh(mergeGeometries(geos, false)!, VC_MAT ??= mat("#ffffff", { rough: 0.7, rim: 0.6, vc: true })); merged.castShadow = true; merged.receiveShadow = true; body.add(merged);
    for (const [n, o] of Object.entries(parts)) if (o !== body && !moving.has(o)) delete parts[n];
  }
  return { root, parts, glb: false };
}
const model = (id: FaunaId) => fromGlb(id) ?? standIn(id);

// ---------------------------------------------------------------- ambient animals
type Ambient = { id: "crab" | "parrot" | "frog"; m: Model; p: THREE.Vector3; home: THREE.Vector3; face: number; state: string; t: number; v: THREE.Vector3; perchY: number; seed: number };
const ambient: Ambient[] = [];
const hostiles: Enemy[] = [];
let palms: { x: number; z: number; y: number }[] = [];
export const faunaStats = () => ({ ambient: ambient.length, hostile: hostiles.filter((e) => !e.down).length, glb: !!GLB, near: ambient.filter((a) => flat(a.p, G.pp) < 32).length + hostiles.filter((e) => !e.down && e.active).length });
export const faunaList = () => ({ ambient: ambient.map((a) => ({ id: a.id, x: a.p.x, y: a.p.y, z: a.p.z, state: a.state })), hostile: hostiles.map((e) => ({ id: e.fauna, x: e.p.x, z: e.p.z, state: e.state, hp: e.hp, down: e.down })) });

/** a hostile animal's Rig (contracts.ts): bounds, a head socket for headshots, and the knockout pose (the death clip, or
 *  the stand-in tipping over). Everything else is driven by fauna.ts per state */
const models = new Map<Enemy, Model>();
function animalRig(id: "boar" | "croc", m: Model): Rig {
  const d = FAUNA[id], head = new THREE.Object3D(); head.position.set(0, id === "boar" ? 0.7 : 0.3, id === "boar" ? 0.75 : 0.9); m.root.add(head);
  const hip = new THREE.Object3D(); m.root.add(hip);
  return {
    root: m.root, bounds: { radius: d.radius, height: d.height }, sockets: { handR: hip, handL: hip, back: hip, head },
    pose(s) {
      const body = m.parts.body;
      if (s.action === "defeat") { if (m.glb) m.play?.("death", { once: true }); else { body.rotation.z = Math.min(1, s.actionT) * (Math.PI / 2); body.position.y = -0.1 * s.actionT; } return; }
      if (m.glb) return;
      body.rotation.z = 0;
      // the stand-in's little motions: legs trot, the head dips in the windup
      const k = Math.sin(s.time * (s.speed > 5 ? 22 : 9)) * Math.min(1, s.speed / 3) * 0.6;
      for (const [n, o] of Object.entries(m.parts)) if (n.startsWith("leg")) o.rotation.x = (n.includes("-0.4") === n.includes("-0.25") ? 1 : -1) * k;
      body.rotation.x = s.action === "windup" ? Math.sin(s.time * 30) * 0.06 + 0.12 : 0;
    },
    dispose() { m.root.removeFromParent(); },
  };
}
/** a raid's wildlife: seeded from the raid rng, from the authored spawn areas (grove.ts FAUNA_SPAWNS) */
export function spawnFauna(nextId: () => number) {
  for (const a of ambient) a.m.root.removeFromParent(); ambient.length = 0; hostiles.length = 0; models.clear();
  palms = PLACED.filter((p) => (p.k === "palm" || p.k === "palmlean") && Math.abs(p.x) < 110 && p.z > 0).map((p) => ({ x: p.x, z: p.z, y: groundHeight(p.x, p.z) + 4.4 * (p.s ?? 1) }));
  const used = new Set<(typeof palms)[number]>(); // one parrot a palm
  for (const f of FAUNA_SPAWNS) {
    const n = f.min + Math.floor(G.rng() * (f.max - f.min + 1)), pts = [...f.points];
    for (let k = 0; k < n && pts.length; k++) {
      const [px, pz] = pts.splice(Math.floor(G.rng() * pts.length), 1)[0];
      // on open ground near the authored point (a mangrove's roots or a rock can sit on it)
      let x = px, z = pz; for (let r = 0, a = G.rng() * 6.28; r < 3.5 && !walkable(x, z); r += 0.35, a += 2.4) { x = px + Math.cos(a) * r; z = pz + Math.sin(a) * r; }
      if (f.id === "boar" || f.id === "croc") { if (walkable(x, z)) spawnHostile(f.id, x, z, nextId()); continue; }
      const m = model(f.id); G.stage.scene.add(m.root);
      let y = groundHeight(x, z), perchY = 0, hx = x, hz = z;
      if (f.id === "parrot") { const palm = nearestPalm(x, z, undefined, 0, 20, used); if (!palm) { m.root.removeFromParent(); continue; } used.add(palm); hx = palm.x + 0.3; hz = palm.z; y = perchY = palm.y; }
      else if (!walkable(x, z)) { m.root.removeFromParent(); continue; }
      ambient.push({ id: f.id, m, p: V(hx, hz, y), home: V(hx, hz, y), face: G.rng() * 6.28, state: f.id === "parrot" ? "perch" : "idle", t: G.rng() * 3, v: new THREE.Vector3(), perchY, seed: G.rng() * 10 });
    }
  }
}
function nearestPalm(x: number, z: number, not?: { x: number; z: number }, min = 0, max = 60, used?: Set<(typeof palms)[number]>) {
  let best: (typeof palms)[number] | null = null, bd = 1e9;
  for (const p of palms) { const d = Math.hypot(p.x - x, p.z - z); if (d < min || d > max || not && Math.hypot(p.x - not.x, p.z - not.z) < 2 || used?.has(p)) continue; if (d < bd) { bd = d; best = p; } }
  return best;
}
function spawnHostile(id: "boar" | "croc", x: number, z: number, idn: number) {
  const m = model(id), rig = animalRig(id, m), d = FAUNA[id];
  const e: Enemy = { id: idn, kind: "wild", fauna: id, rig, p: V(x, z), vel: new THREE.Vector3(), face: G.rng() * 6.28, hp: d.hp, max: d.hp, state: id === "boar" ? "patrol" : "patrol", t: G.rng() * 3, actionT: 0,
    home: V(x, z), path: [], repath: 0, flash: 0, stolen: [], carry: [...d.drops], zs: 3, quiet: 0, lastSeen: null, lostT: 0, rang: null, active: false, down: false, downT: 0, wakeAt: 0 };
  rig.root.position.set(x, groundHeight(x, z), z); G.stage.scene.add(rig.root); G.enemies.push(e); hostiles.push(e); models.set(e, m);
  (e as Enemy & { hpSeen?: number }).hpSeen = e.hp;
}

// ---------------------------------------------------------------- hearing (combat.ts makeNoise calls this)
/** gunfire and other loud noises scatter the ambient animals within their hearing; a hit or a shot close by sets a boar off */
export function faunaHear(at: THREE.Vector3, r: number, kind: string) {
  const loud = kind === "shot" || kind === "smash" || kind === "melee";
  for (const a of ambient) { const d = flat(a.p, at); if (d < Math.min(FAUNA[a.id].hear, r * 1.4) || (loud && d < FAUNA[a.id].hear)) scare(a, at); }
  for (const e of hostiles) if (!e.down && e.fauna === "boar" && kind === "shot" && flat(e.p, at) < 9 && e.state === "patrol") { e.state = "windup"; e.t = FAUNA.boar.wind; sfx("windup"); }
}
function scare(a: Ambient, from: { x: number; z: number }) {
  if (a.id === "parrot") { if (a.state === "perch") flush(a); return; }
  if (a.state === "burrowed" || a.state === "flee" || a.state === "hop" || a.state === "emerge") return;
  const dx = a.p.x - from.x, dz = a.p.z - from.z, l = Math.hypot(dx, dz) || 1;
  a.face = Math.atan2(dx, dz); a.v.set(dx / l, 0, dz / l);
  if (a.id === "crab") { a.state = "flee"; a.t = 1.2; } else { a.state = "hop"; a.t = 3; }
}
/** a parrot takes off: a squawk, and the noise of it is at your position (it gives you away) */
function flush(a: Ambient) {
  a.state = "fly"; a.t = 0; sfx("squawk"); // "fly" starts with the takeoff on the perch
  const land = nearestPalm(a.p.x, a.p.z, a.home, 18, 45);
  a.home.set(land ? land.x + 0.3 : a.p.x + (a.p.x - G.pp.x) * 4, land ? land.y : a.p.y + 14, land ? land.z : a.p.z + (a.p.z - G.pp.z) * 4);
  a.v.copy(a.p); // the take-off point
  noiseHook?.(G.pp.clone(), FAUNA.parrot.noise, "parrot");
}
let noiseHook: ((at: THREE.Vector3, r: number, kind: string) => void) | null = null;
/** combat.ts hands its makeNoise in here (no import cycle) */
export const setFaunaNoise = (f: typeof noiseHook) => { noiseHook = f; };

// ---------------------------------------------------------------- per sim step
const tmp = new THREE.Vector3();
export function updateFauna(dt: number) {
  const sprint = G.sprinting;
  for (const a of ambient) {
    const d = flat(a.p, G.pp); a.t += dt;
    a.m.root.visible = d < 46;
    if (d > 46 && a.state !== "fly") continue;
    a.m.mixer?.update(dt);
    if (a.id === "crab") crab(a, d, dt, sprint); else if (a.id === "frog") frog(a, d, dt); else parrot(a, d, dt, sprint);
    a.m.root.position.copy(a.p); a.m.root.rotation.y = a.face;
  }
  for (const e of hostiles) {
    const m = models.get(e); if (m?.mixer && e.rig.root.visible && flat(e.p, G.pp) < 46) m.mixer.update(dt);
    if (e.down || !e.active) continue;
    const hpSeen = (e as Enemy & { hpSeen?: number }).hpSeen ?? e.hp, hurt = e.hp < hpSeen; (e as Enemy & { hpSeen?: number }).hpSeen = e.hp;
    if (e.fauna === "boar") boar(e, dt, hurt); else croc(e, dt, hurt);
  }
}
function crab(a: Ambient, d: number, dt: number, sprint: boolean) {
  const body = a.m.parts.body, m = a.m;
  if (a.state === "idle") {
    if (d < FAUNA.crab.scare * (sprint ? 1.5 : 1)) return scare(a, G.pp);
    // a sideways shuffle round home: along its own +x (its left), which is how Fable's scuttle reads
    if (a.t > 1.5) { a.t = 0; a.v.set(Math.cos(a.face), 0, -Math.sin(a.face)).multiplyScalar(G.rng() < 0.4 ? 0 : G.rng() < 0.5 ? 0.6 : -0.6); if (flat(a.p, a.home) > 2) { a.v.set(a.home.x - a.p.x, 0, a.home.z - a.p.z).setLength(0.6); a.face = Math.atan2(a.v.x, a.v.z) - Math.PI / 2; } }
    step(a, a.v, dt);
    if (m.glb) m.play!(a.v.lengthSq() > 0.01 ? "scuttle" : "idle", { speed: 0.6 + a.v.length() * 0.6 }); else body.position.y = Math.abs(Math.sin(G.time * 18 + a.seed)) * 0.02 * a.v.length();
  } else if (a.state === "flee") { // sideways: its left (+x) along the run, so it faces a quarter turn off its heading
    const run = tmp.copy(a.v).multiplyScalar(FAUNA.crab.speed); step(a, run, dt); a.face = Math.atan2(a.v.x, a.v.z) - Math.PI / 2;
    if (m.glb) m.play!("flee"); else body.position.y = Math.abs(Math.sin(G.time * 30 + a.seed)) * 0.04;
    if (a.t > 1.2) { a.state = "burrowed"; a.t = 0; burst(a.p.clone().setY(a.p.y + 0.1), 6, "#e3cf9e", 0.5); if (m.glb) m.play!("burrow", { once: true }); }
  } else if (a.state === "burrowed") {
    // Fable's burrow ends with nothing above the sand (the eyes show from 0.6 to 0.8): hide it once it is under
    if (m.glb) { if (a.t > 1.25) a.m.root.visible = false; } else body.position.y = Math.max(-0.35, body.position.y - dt * 1.4);
    if (a.t > FAUNA.crab.burrow[0] + (a.seed % 1) * (FAUNA.crab.burrow[1] - FAUNA.crab.burrow[0]) && d > 7) { a.state = "emerge"; a.t = 0; if (m.glb) { a.m.root.visible = true; m.play!("burrow", { once: true, reverse: true }); } }
  } else if (m.glb) { if (a.t > 1.2) { a.state = "idle"; a.t = 0; } }
  else { body.position.y = Math.min(0, body.position.y + dt * 0.8); if (body.position.y >= 0) { a.state = "idle"; a.t = 0; } }
}
function frog(a: Ambient, d: number, dt: number) {
  const body = a.m.parts.body, m = a.m;
  if (a.state === "idle") { if (!m.glb) body.scale.y = 1 + Math.sin(G.time * 5 + a.seed) * 0.05; else m.play!("idle"); if (d < FAUNA.frog.scare) scare(a, G.pp); return; }
  if (m.glb) { // three hops on Fable's clip (0.8 s, the arc baked in): slide the root only while airborne, 0.24-0.78 of it
    const hopT = 0.8, n = Math.floor(a.t / hopT), k = (a.t % hopT) / hopT;
    if (n !== Math.floor((a.t - dt) / hopT) || a.t <= dt) m.play!("hop", { once: true, restart: true, fade: 0.05 });
    if (k > 0.24 && k < 0.78) step(a, tmp.copy(a.v).multiplyScalar(FAUNA.frog.hop / ((0.78 - 0.24) * hopT)), dt);
    if (a.t > hopT * 3) { a.state = "idle"; a.t = 0; a.home.copy(a.p); m.play!("idle"); }
    return;
  }
  // the stand-in: three hops, an arc each 0.45 s
  const k = (a.t % 0.45) / 0.45; body.position.y = Math.sin(Math.min(1, k / 0.8) * Math.PI) * 0.35;
  if (k < 0.8) step(a, tmp.copy(a.v).multiplyScalar(FAUNA.frog.hop / 0.36), dt);
  if (a.t > 1.35) { a.state = "idle"; a.t = 0; body.position.y = 0; a.home.copy(a.p); }
}
function parrot(a: Ambient, d: number, dt: number, sprint: boolean) {
  const w = a.m.parts, m = a.m, flap = (amp: number, f: number) => { if (w.wingL) w.wingL.rotation.z = Math.sin(G.time * f + a.seed) * amp; if (w.wingR) w.wingR.rotation.z = -Math.sin(G.time * f + a.seed) * amp; };
  if (a.state === "perch") {
    if (m.glb) m.play!("perch_idle"); else { flap(0.05, 3); w.body.rotation.y = Math.sin(G.time * 0.7 + a.seed) * 0.6; }
    if (d < FAUNA.parrot.scare * (sprint ? 1.4 : 1)) flush(a);
    return;
  }
  // takeoff (0.6 s on the perch), the flight arc to the landing palm with the wings beating, the landing (0.67 s).
  // The origin is the perch point under its feet: the game moves the root, the clips chain takeoff > fly > land > perch
  const TO = 0.6, T = Math.max(1.6, flat(a.v, a.home) / FAUNA.parrot.fly), LAND = 0.67;
  if (a.state === "fly" && a.t < TO) { if (m.glb) m.play!("takeoff", { once: true }); else flap(0.9, 26); return; }
  if (a.state === "fly") {
    if (m.glb) m.play!("fly", { fade: 0.05 }); else flap(0.9, 26);
    const k = Math.min(1, (a.t - TO) / T);
    a.p.set(a.v.x + (a.home.x - a.v.x) * k, a.v.y + (a.home.y - a.v.y) * k + Math.sin(k * Math.PI) * 5, a.v.z + (a.home.z - a.v.z) * k);
    a.face = Math.atan2(a.home.x - a.v.x, a.home.z - a.v.z);
    if (k >= 1) { a.state = "land"; a.t = 0; a.perchY = a.home.y; if (m.glb) m.play!("land", { once: true, fade: 0.05 }); }
    return;
  }
  if (a.state === "land") { if (!m.glb) flap(0.4, 14); if (a.t > LAND) { a.state = "perch"; a.t = 0; } }
}
function step(a: Ambient, v: THREE.Vector3, dt: number) {
  const nx = a.p.x + v.x * dt, nz = a.p.z + v.z * dt;
  if (walkable(nx, nz)) { a.p.x = nx; a.p.z = nz; } else { v.multiplyScalar(-1); a.face += Math.PI; }
  a.p.y = groundHeight(a.p.x, a.p.z);
}

// ---------------------------------------------------------------- the boar: neutral, then a telegraphed charge
/** Fable's boar strides (planted hooves): walk 0.7 m a 0.8 s loop, run 1.3 m a 0.4 s loop, charge 1.8 m a 0.333 s loop */
const BOAR_STRIDE = { walk: 0.7 / 0.8, run: 1.3 / 0.4, charge: 1.8 / 0.3333 };
const hitT = new WeakMap<Enemy, number>();
function boarClip(e: Enemy, dt: number, hurt: boolean) {
  const m = models.get(e); if (!m?.glb) return;
  let h = (hitT.get(e) ?? 0) - dt; if (hurt && e.state !== "charge") { h = 0.4; m.play!("hit", { once: true, restart: true, fade: 0.05 }); } hitT.set(e, h);
  if (h > 0) return; // the flinch plays out, then it goes back to idle's first frame
  const sp = Math.hypot(e.vel.x, e.vel.z);
  if (e.state === "windup") m.play!("charge_windup"); // a loop: held for the whole telegraph
  else if (e.state === "charge") m.play!("charge", { speed: FAUNA.boar.charge / BOAR_STRIDE.charge });
  else if (sp > 2.5) m.play!("run", { speed: sp / BOAR_STRIDE.run });
  else if (sp > 0.15) m.play!("walk", { speed: sp / BOAR_STRIDE.walk });
  else m.play!("idle");
}
function boar(e: Enemy, dt: number, hurt: boolean) {
  const b = FAUNA.boar, d = flat(e.p, G.pp);
  e.t -= dt; boarClip(e, dt, hurt);
  switch (e.state) {
    case "patrol": {
      if (hurt || d < (G.sprinting ? b.noticeSprint : b.notice)) { e.state = "windup"; e.t = b.wind; sfx("windup"); e.vel.set(0, 0, 0); break; }
      if (e.t <= 0) { e.t = 2 + G.rng() * 3; const a = G.rng() * 6.28, r = G.rng() * 4; tmp.set(e.home.x + Math.cos(a) * r - e.p.x, 0, e.home.z + Math.sin(a) * r - e.p.z); e.vel.copy(tmp.lengthSq() > 0.1 ? tmp.setLength(1.1) : tmp.set(0, 0, 0)); }
      if (e.vel.lengthSq() > 0.01) e.face = Math.atan2(e.vel.x, e.vel.z);
      break;
    }
    case "windup": // the telegraph: it squares up and paws (ai/enemies.ts windCue shows the "!")
      e.face = Math.atan2(G.pp.x - e.p.x, G.pp.z - e.p.z); e.vel.set(0, 0, 0);
      if (e.t <= 0) { e.state = "charge"; e.actionT = 0; e.home.set(e.p.x, 0, e.p.z); e.vel.set(Math.sin(e.face), 0, Math.cos(e.face)).multiplyScalar(b.charge); sfx("grunt"); }
      break;
    case "charge": {
      e.actionT += b.charge * dt; e.vel.setLength(b.charge);
      if (d < b.radius + 0.75) { hurtPlayer(e.p, "gore", b.hit); G.vel.addScaledVector(tmp.set(Math.sin(e.face), 0, Math.cos(e.face)), 7); e.state = "recover"; e.t = b.recover; e.vel.set(0, 0, 0); break; }
      if (e.actionT > b.chargeLen || !walkable(e.p.x + Math.sin(e.face) * 0.8, e.p.z + Math.cos(e.face) * 0.8)) { e.state = "recover"; e.t = b.recover; e.vel.set(0, 0, 0); burst(e.p.clone().setY(0.3), 8, "#b89a6a", 0.6); }
      break;
    }
    case "recover":
      e.vel.multiplyScalar(0.8);
      if (e.t <= 0) { if (d < 14) { e.state = "windup"; e.t = b.wind; sfx("windup"); } else { e.state = "patrol"; e.t = b.calm; } }
      break;
    default: e.state = "patrol";
  }
}
// ---------------------------------------------------------------- the croc: lurks, ambushes at the edge, bites once, sinks
/** Fable's croc: the origin is the water line (ai/enemies.ts keeps it there), the bind pose is surfaced; lurk sits 0.15 m
 *  lower, surface rises, bite snaps shut 0.95 m ahead at 0.47 of its 0.6 s, retreat backs off 0.7 m and goes under */
function croc(e: Enemy, dt: number, hurt: boolean) {
  const c = FAUNA.croc, d = flat(e.p, G.pp), m = models.get(e)!, body = m.parts.body;
  const sink = (to: number, k: number) => { if (!m.glb) body.position.y += (to - body.position.y) * Math.min(1, dt * k); };
  e.t -= dt;
  switch (e.state) {
    case "patrol":
      sink(-0.32, 4); e.vel.set(0, 0, 0); m.play?.("lurk");
      if (e.t <= 0 && (d < c.ambush || hurt && d < 12)) {
        e.state = "windup"; e.t = c.wind; sfx("splash"); burst(e.p.clone().setY(0.1), 14, "#bfe8e2", 0.8); e.face = Math.atan2(G.pp.x - e.p.x, G.pp.z - e.p.z);
        m.play?.("surface", { once: true, speed: 0.8 / c.wind }); // the 0.8 s surfacing squeezed into the telegraph
      }
      break;
    case "windup": sink(0, 10); if (e.t <= 0) { e.state = "bite"; e.t = 0.6; e.actionT = 0; e.vel.set(Math.sin(e.face), 0, Math.cos(e.face)).multiplyScalar(m.glb ? 1.2 : 6); m.play?.("bite", { once: true, fade: 0.05 }); } break;
    case "bite": {
      // the jaws close 0.95 m ahead of the origin at 0.47 of the clip (0.28 s in); the stand-in bites on contact
      const snap = m.glb ? 0.6 - e.t >= 0.28 : true, jaw = tmp.set(e.p.x + Math.sin(e.face) * 0.95, 0, e.p.z + Math.cos(e.face) * 0.95);
      if (snap && e.actionT !== 1 && (m.glb ? flat(jaw, G.pp) < 0.95 : d < c.reach)) { hurtPlayer(e.p, "bite", c.bite); e.actionT = 1; }
      if (m.glb && 0.6 - e.t > 0.3) e.vel.multiplyScalar(0.6);
      if (e.t <= (m.glb ? 0 : 0.35)) { e.state = "return"; e.t = c.sink; e.actionT = 0; e.vel.set(0, 0, 0); m.play?.("retreat", { once: true, fade: 0.05 }); }
      break;
    }
    case "return": // backs off and sinks (retreat ends under the water line), then glides home under it
      tmp.set(e.home.x - e.p.x, 0, e.home.z - e.p.z);
      if (!m.glb || c.sink - e.t > 1) { e.vel.copy(tmp.lengthSq() > 0.04 ? tmp.setLength(2.5) : tmp.set(0, 0, 0)); if (!m.glb) e.face = Math.atan2(-tmp.x, -tmp.z); }
      sink(-0.32, 2);
      if (e.t <= 0) { e.state = "patrol"; e.t = c.cooldown; }
      break;
    default: e.state = "patrol";
  }
}
