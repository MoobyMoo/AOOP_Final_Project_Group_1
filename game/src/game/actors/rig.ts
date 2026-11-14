// Rig v2: characters built in Blender (tools/blender/*.py -> public/models/*.glb) and posed here.
//
// - preloadCharacters() loads the GLBs once; createRig() is synchronous after that.
// - Every character is ONE skinned mesh: the chosen part meshes (ears, eyes, torso...) are merged per part
//   combination and cached, so instances with the same parts share geometry. Colour comes from a per-instance
//   palette material (charmat.ts), so setLook colour/slider changes are uniform and bone writes only.
// - Clips are pre-sampled at 30 fps into flat tables shared by all instances. pose() is a pure function of the
//   RigState stream: it keeps no clock of its own (fades and the run phase advance by the delta of state.time)
//   and allocates nothing.
// - Layers: locomotion (idle/walk/run by speed) -> pistol hold on the upper body -> the action clip (upper body
//   while moving, whole body when standing or for roll/defeat) -> procedural spine twist toward faceYaw, recoil,
//   tail curl, blink, brow expression, hurt flash.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import type { Rig, RigState, RigAction, MonkeyLook, EnemyStyle, Gear, WearSlot } from "../contracts";
import { charMaterial, newPalette, setRegion, shade, regionBytes, STATIC_PALETTE } from "./charmat";
import { preloadWearables, instWearable, wearable } from "./wearables";
import { monkeyEnemy, mulberry, DEFAULT_LOOK, type MonkeyEnemySpec } from "./look";

/** actions the rigs can play beyond the contract's RigAction (report: contracts.ts lacks these) */
export type RigActionX = RigAction | "use" | "cheer";
/** real seconds for one play of each timed clip (the game maps actionT 0..1 over it); loops give their period */
export const CLIP_INFO: Record<string, { dur: number; loop?: boolean }> = {
  idle: { dur: 2, loop: true }, walk: { dur: 0.8, loop: true }, run: { dur: 0.45, loop: true }, fire: { dur: 0.25 }, reload: { dur: 1.2 },
  melee: { dur: 0.45 }, roll: { dur: 0.34 }, hurt: { dur: 0.35 }, throw: { dur: 0.75 }, use: { dur: 1.6 }, defeat: { dur: 0.9 }, cheer: { dur: 0.9, loop: true },
  windup: { dur: 0.9 }, slam: { dur: 0.6 }, charge: { dur: 0.5, loop: true }, stunned: { dur: 1.6, loop: true }, sleep: { dur: 3.2, loop: true },
};

const FPS = 30, ST = 7, MORPHS = ["blink", "eyeWide", "browTilt"];
type Clip = { frames: number; data: Float32Array };
type Part = { n: number; pos: Float32Array; nrm: Float32Array; ra: Uint8Array; si: Uint16Array; sw: Float32Array; idx: ArrayLike<number>; morph: (Float32Array | null)[] };
type Model = {
  tmpl: THREE.Object3D; names: string[]; bi: Record<string, number>; inverses: THREE.Matrix4[]; bind: THREE.Matrix4;
  rest: Float32Array; clips: Record<string, Clip>; parts: Map<string, Part>; merged: Map<string, THREE.BufferGeometry>; radius: number;
};
const MODELS: { monkey?: Model; gorilla?: Model } = {};
let loading: Promise<void> | null = null;

/** load every character asset once. Await this at boot, before the first createRig(). */
export function preloadCharacters(base = `${import.meta.env.BASE_URL}models/`): Promise<void> {
  loading ??= Promise.all([
    loadModel(base + "monkey.glb", 2.6).then((m) => { MODELS.monkey = m; }),
    loadModel(base + "gorilla.glb", 4.2).then((m) => { MODELS.gorilla = m; }),
    preloadWearables(base + "wearables.glb"),
  ]).then(() => undefined);
  return loading;
}
export const charactersReady = () => !!MODELS.monkey && !!MODELS.gorilla;

function f32(a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, size: number): Float32Array {
  const out = new Float32Array(a.count * size);
  for (let i = 0; i < a.count; i++) for (let k = 0; k < size; k++) out[i * size + k] = a.getComponent(i, k);
  return out;
}
async function loadModel(url: string, radius: number): Promise<Model> {
  const gltf = await new GLTFLoader().loadAsync(url);
  gltf.scene.updateMatrixWorld(true);
  const meshes: THREE.SkinnedMesh[] = [];
  gltf.scene.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh); });
  if (!meshes.length) throw new Error(`no skinned meshes in ${url}`);
  const skel = meshes[0].skeleton, names = skel.bones.map((b) => b.name);
  const parts = new Map<string, Part>();
  for (const m of meshes) {
    const g = m.geometry, n = g.getAttribute("position").count, si = g.getAttribute("skinIndex"), dict = m.morphTargetDictionary ?? {};
    const siOut = new Uint16Array(n * 4);
    for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) siOut[i * 4 + k] = si.getComponent(i, k);
    parts.set(m.name.replace(/^p_/, ""), {
      n, pos: f32(g.getAttribute("position"), 3), nrm: f32(g.getAttribute("normal"), 3), ra: regionBytes(g.getAttribute("uv") as THREE.BufferAttribute),
      si: siOut, sw: f32(g.getAttribute("skinWeight"), 4), idx: g.index!.array,
      morph: MORPHS.map((nm) => (nm in dict && g.morphAttributes.position ? f32(g.morphAttributes.position[dict[nm]] as THREE.BufferAttribute, 3) : null)),
    });
  }
  // template = the armature without its meshes
  let rootBone: THREE.Object3D = skel.bones[0];
  while ((rootBone.parent as THREE.Bone | null)?.isBone) rootBone = rootBone.parent!;
  const tmpl = rootBone.parent ?? rootBone;
  for (const m of meshes) m.removeFromParent();
  tmpl.removeFromParent();
  const nb = names.length, rest = new Float32Array(nb * ST), bi: Record<string, number> = {};
  skel.bones.forEach((b, i) => { bi[b.name] = i; rest.set([b.position.x, b.position.y, b.position.z, b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w], i * ST); });
  // pre-sample every clip at 30 fps: [frame][bone][px py pz qx qy qz qw]
  const clips: Record<string, Clip> = {};
  for (const c of gltf.animations) {
    const frames = Math.max(2, Math.round(c.duration * FPS) + 1), data = new Float32Array(frames * nb * ST);
    for (let f = 0; f < frames; f++) data.set(rest, f * nb * ST);
    for (const tr of c.tracks) {
      const dot = tr.name.lastIndexOf("."), b = bi[tr.name.slice(0, dot)], prop = tr.name.slice(dot + 1);
      if (b === undefined || prop === "scale") continue;
      const size = tr.getValueSize(), it = (tr as unknown as { createInterpolant(r: Float32Array): THREE.Interpolant }).createInterpolant(new Float32Array(size)), off = prop === "position" ? 0 : 3;
      for (let f = 0; f < frames; f++) {
        const v = it.evaluate(Math.min(c.duration, f / FPS)) as Float32Array;
        for (let k = 0; k < size; k++) data[(f * nb + b) * ST + off + k] = v[k];
      }
    }
    clips[c.name] = { frames, data };
  }
  return { tmpl, names, bi, inverses: skel.boneInverses, bind: meshes[0].bindMatrix.clone(), rest, clips, parts, merged: new Map(), radius };
}

/** one geometry for a set of parts (cached per combination, shared by every instance that uses it) */
function merge(model: Model, names: string[]): THREE.BufferGeometry {
  const key = names.join("|");
  let g = model.merged.get(key);
  if (g) return g;
  const ps = names.map((n) => model.parts.get(n)).filter((p): p is Part => !!p);
  let nv = 0, ni = 0;
  for (const p of ps) { nv += p.n; ni += p.idx.length; }
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), ra = new Uint8Array(nv * 2), si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4);
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni), morph = MORPHS.map(() => new Float32Array(nv * 3));
  let vo = 0, io = 0;
  for (const p of ps) {
    pos.set(p.pos, vo * 3); nrm.set(p.nrm, vo * 3); ra.set(p.ra, vo * 2); si.set(p.si, vo * 4); sw.set(p.sw, vo * 4);
    for (let k = 0; k < p.idx.length; k++) idx[io + k] = p.idx[k] + vo;
    p.morph.forEach((mm, i) => { if (mm) morph[i].set(mm, vo * 3); });
    vo += p.n; io += p.idx.length;
  }
  g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  g.setAttribute("aRA", new THREE.BufferAttribute(ra, 2, false));
  g.setAttribute("skinIndex", new THREE.BufferAttribute(si, 4)); g.setAttribute("skinWeight", new THREE.BufferAttribute(sw, 4));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.morphAttributes.position = morph.map((mm) => new THREE.BufferAttribute(mm, 3)); g.morphTargetsRelative = true;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, model.radius * 0.4, 0), model.radius);
  g.boundingBox = new THREE.Box3(new THREE.Vector3(-model.radius, -0.5, -model.radius), new THREE.Vector3(model.radius, model.radius * 1.4, model.radius));
  model.merged.set(key, g);
  return g;
}

// ---------------------------------------------------------------- pose maths (module scratch: pose() is synchronous)
const PA = new Float32Array(64 * ST), PB = new Float32Array(64 * ST), PC = new Float32Array(64 * ST);
const Q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0), XA = new THREE.Vector3(1, 0, 0), ZA = new THREE.Vector3(0, 0, 1);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const frac = (x: number) => x - Math.floor(x);

function sample(c: Clip, u: number, out: Float32Array, nb: number) {
  const f = clamp(u, 0, 1) * (c.frames - 1), i0 = Math.min(Math.floor(f), c.frames - 2), a = f - i0, n = nb * ST, o0 = i0 * n, o1 = o0 + n, d = c.data;
  for (let b = 0; b < n; b += ST) {
    out[b] = d[o0 + b] + (d[o1 + b] - d[o0 + b]) * a; out[b + 1] = d[o0 + b + 1] + (d[o1 + b + 1] - d[o0 + b + 1]) * a; out[b + 2] = d[o0 + b + 2] + (d[o1 + b + 2] - d[o0 + b + 2]) * a;
    const s = d[o0 + b + 3] * d[o1 + b + 3] + d[o0 + b + 4] * d[o1 + b + 4] + d[o0 + b + 5] * d[o1 + b + 5] + d[o0 + b + 6] * d[o1 + b + 6] < 0 ? -a : a, r = 1 - a;
    out[b + 3] = d[o0 + b + 3] * r + d[o1 + b + 3] * s; out[b + 4] = d[o0 + b + 4] * r + d[o1 + b + 4] * s; out[b + 5] = d[o0 + b + 5] * r + d[o1 + b + 5] * s; out[b + 6] = d[o0 + b + 6] * r + d[o1 + b + 6] * s;
  }
}
/** dst = lerp(dst, src, w * mask[b]) for every bone; mask values: upper weight per bone, lowerW scales the rest */
function blend(dst: Float32Array, src: Float32Array, w: number, nb: number, mask: Float32Array | null, lowerW = 1) {
  for (let b = 0; b < nb; b++) {
    const k = mask ? w * (mask[b] + (1 - mask[b]) * lowerW) : w;
    if (k <= 0.0005) continue;
    const o = b * ST, r = 1 - k;
    dst[o] = dst[o] * r + src[o] * k; dst[o + 1] = dst[o + 1] * r + src[o + 1] * k; dst[o + 2] = dst[o + 2] * r + src[o + 2] * k;
    const s = dst[o + 3] * src[o + 3] + dst[o + 4] * src[o + 4] + dst[o + 5] * src[o + 5] + dst[o + 6] * src[o + 6] < 0 ? -k : k;
    dst[o + 3] = dst[o + 3] * r + src[o + 3] * s; dst[o + 4] = dst[o + 4] * r + src[o + 4] * s; dst[o + 5] = dst[o + 5] * r + src[o + 5] * s; dst[o + 6] = dst[o + 6] * r + src[o + 6] * s;
  }
}

let rigCount = 0;
type ActDef = { clip: string; full?: boolean; loop?: boolean; snap?: boolean };

abstract class CharRig implements Rig {
  root = new THREE.Group();
  /** inner group: turns to the hips heading and carries the seeded size, so gameplay owns root entirely */
  body = new THREE.Group();
  sockets: Rig["sockets"];
  bounds = { radius: 0.45, height: 2 };
  protected bones: THREE.Bone[]; protected nb: number; protected mesh: THREE.SkinnedMesh;
  protected pal = newPalette(); protected mat: THREE.MeshStandardMaterial;
  protected gearMats: { matte: THREE.MeshStandardMaterial; gloss: THREE.MeshStandardMaterial } | null = null;
  protected upper: Float32Array;                       // 1 = upper-body bone, 0 = hips/legs
  protected t0 = NaN; protected seed: number;
  private curClip: Clip | null = null; private curFull = false; private curU = 0; private curW = 0;
  private prvClip: Clip | null = null; private prvFull = false; private prvU = 0; private prvW = 0;
  protected fullW = 0;                                 // how much of the pose is a whole-body action (kills twist)
  protected faceSock: THREE.Object3D;

  constructor(protected model: Model, lower: RegExp) {
    const arm = cloneSkinned(model.tmpl), byName: Record<string, THREE.Bone> = {};
    arm.traverse((o) => { if ((o as THREE.Bone).isBone) byName[o.name] = o as THREE.Bone; });
    this.bones = model.names.map((n) => byName[n]); this.nb = this.bones.length;
    this.mat = charMaterial(this.pal);
    this.mesh = new THREE.SkinnedMesh(merge(model, []), this.mat);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.morphTargetInfluences = [0, 0, 0];
    arm.add(this.mesh); this.mesh.bind(new THREE.Skeleton(this.bones, model.inverses), model.bind);
    this.mesh.boundingSphere = this.mesh.geometry.boundingSphere!; this.mesh.boundingBox = this.mesh.geometry.boundingBox!;
    this.body.add(arm); this.root.add(this.body);
    this.upper = new Float32Array(this.nb);
    model.names.forEach((n, i) => { this.upper[i] = lower.test(n) ? 0 : 1; });
    const sock = (bone: string, name: string) => { const o = new THREE.Object3D(); o.name = name; this.bone(bone).add(o); return o; };
    this.sockets = { handR: sock("sk_hand_R", "handR"), handL: sock("sk_hand_L", "handL"), back: sock("sk_back", "back"), head: sock("sk_head", "head") };
    this.faceSock = sock("sk_face", "face");
    this.seed = frac(++rigCount * 0.6180339887);
  }
  protected bone(n: string) { return this.bones[this.model.bi[n]]; }
  protected clip(n: string) { return this.model.clips[n]; }
  protected mats() { return (this.gearMats ??= { matte: charMaterial(STATIC_PALETTE), gloss: charMaterial(STATIC_PALETTE, true) }); }
  protected setParts(names: string[]) {
    const g = merge(this.model, names);
    if (this.mesh.geometry !== g) this.mesh.geometry = g;
  }
  /** delta of the gameplay clock since the last pose(); a jump (first call, scrub, pause) snaps every fade */
  protected tick(s: RigState) { let dt = s.time - this.t0; this.t0 = s.time; return dt >= 0 && dt < 0.25 ? dt : -1; }
  /** choose the action clip for this frame and advance the two overlay fades */
  protected setAction(def: ActDef | undefined, s: RigState, dt: number) {
    const clip = def ? this.clip(def.clip) ?? null : null, snap = dt < 0;
    if (clip !== this.curClip) {
      if (this.curClip && this.curW > 0.01 && !snap) { this.prvClip = this.curClip; this.prvFull = this.curFull; this.prvU = this.curU; this.prvW = this.curW; }
      this.curClip = clip; this.curFull = !!def?.full; this.curW = snap || def?.snap ? 1 : 0;
    }
    if (clip && def) {
      this.curU = def.loop ? frac(s.time / CLIP_INFO[def.clip].dur + this.seed) : clamp(s.actionT, 0, 1);
      this.curW = snap ? 1 : Math.min(1, this.curW + dt / 0.07);
    }
    this.prvW = snap ? 0 : Math.max(0, this.prvW - dt / 0.12);
    if (this.prvW <= 0) this.prvClip = null;
    this.fullW = clamp((this.curClip && this.curFull ? this.curW : 0) + (this.prvClip && this.prvFull ? this.prvW : 0), 0, 1);
  }
  /** blend the fading-out and current action clips over the pose in PA */
  protected overlays(lowerW: number) {
    if (this.prvClip) { sample(this.prvClip, this.prvU, PB, this.nb); blend(PA, PB, this.prvW, this.nb, this.upper, this.prvFull ? 1 : lowerW); }
    if (this.curClip) { sample(this.curClip, this.curU, PB, this.nb); blend(PA, PB, this.curW, this.nb, this.upper, this.curFull ? 1 : lowerW); }
  }
  protected write() {
    for (let b = 0, o = 0; b < this.nb; b++, o += ST) {
      const bn = this.bones[b];
      bn.position.set(PA[o], PA[o + 1], PA[o + 2]); bn.quaternion.set(PA[o + 3], PA[o + 4], PA[o + 5], PA[o + 6]).normalize();
    }
  }
  protected flash(v: number) {
    const e = v > 0 ? Math.min(1, v) * 0.85 : 0;
    this.mat.emissiveIntensity = e;
    if (this.gearMats) { this.gearMats.matte.emissiveIntensity = e; this.gearMats.gloss.emissiveIntensity = e; }
  }
  /** blink pulse from the gameplay clock (every ~3.3 s, offset per instance) */
  protected blink(time: number) { const p = frac(time / 3.3 + this.seed) * 3.3; return p < 0.16 ? Math.sin((p / 0.16) * Math.PI) : 0; }
  abstract pose(s: RigState): void;
  dispose() {
    this.root.removeFromParent(); this.mat.dispose();
    if (this.gearMats) { this.gearMats.matte.dispose(); this.gearMats.gloss.dispose(); }
    this.mesh.skeleton.dispose();
  }
}

// ---------------------------------------------------------------- monkey (player, wild, bandit)
const M_ACT: Record<string, ActDef> = {
  fire: { clip: "fire", snap: true }, reload: { clip: "reload" }, melee: { clip: "melee", snap: true }, roll: { clip: "roll", full: true, snap: true },
  hurt: { clip: "hurt", snap: true }, throw: { clip: "throw" }, use: { clip: "use" }, defeat: { clip: "defeat", full: true }, cheer: { clip: "cheer", full: true, loop: true },
};
/** look tuning the game may change: headUp = how far monkeys lift their chin toward the top-down camera (rad) */
export const RIG_TUNE = { headUp: 0.24 };
const TW_MAX = 1.3;   // upper body twists up to ~75 deg from the hips; past that the hips turn

class MonkeyRig extends CharRig {
  private look: MonkeyLook = DEFAULT_LOOK; private spec: MonkeyEnemySpec | null;
  private gear: Gear = { head: null, face: null, back: null };
  private gearObj: Record<WearSlot, THREE.Object3D | null> = { head: null, face: null, back: null };
  private aimMask: Float32Array; private aimW = 0; private hip = 0; private phase = 0; private back = false;
  private briefcase: THREE.Object3D | null = null; private handProp: THREE.Object3D | null = null; private propBack = 0;
  private spine: THREE.Bone; private chest: THREE.Bone; private neck: THREE.Bone; private head: THREE.Bone; private tail: THREE.Bone[]; private curl = 0;
  private scale = 1;

  constructor(model: Model, style: MonkeyLook | EnemyStyle) {
    super(model, /^(root|hips|thigh|shin|foot)/);
    this.aimMask = new Float32Array(this.nb);
    model.names.forEach((n, i) => { this.aimMask[i] = /^(chest|shoulder|upperarm|forearm|hand|thumb|sk_hand)/.test(n) ? 1 : n === "spine" ? 0.6 : 0; });
    this.spine = this.bone("spine"); this.chest = this.bone("chest"); this.neck = this.bone("neck"); this.head = this.bone("head"); this.tail = [2, 3, 4, 5].map((i) => this.bone("tail" + i));
    this.spec = "kind" in style ? monkeyEnemy(style) : null;
    this.scale = this.spec?.scale ?? 1; this.body.scale.setScalar(this.scale);
    this.bounds = { radius: 0.45 * this.scale, height: 2.0 * this.scale };
    this.setLook(this.spec ? this.spec.look : (style as MonkeyLook));
    if (this.spec) {
      this.gear = { head: this.spec.head, face: this.spec.face, back: this.spec.back };
      for (const slot of ["head", "face", "back"] as const) this.attach(slot, this.gear[slot]);
      if (this.spec.hand) { this.handProp = instWearable(this.spec.hand, this.mats()); this.bone("sk_hand_R").add(this.handProp); }
      this.refresh();
    } else {
      this.briefcase = instWearable("prop_briefcase", this.mats()); this.briefcase.visible = false; this.bone("sk_hand_R").add(this.briefcase);
    }
  }
  private socketFor(slot: WearSlot) { return slot === "head" ? this.sockets.head : slot === "back" ? this.sockets.back : this.faceSock; }
  private attach(slot: WearSlot, id: string | null) {
    this.gearObj[slot]?.removeFromParent(); this.gearObj[slot] = null;
    if (!id) return;
    const o = instWearable(id, this.mats()); this.socketFor(slot).add(o); this.gearObj[slot] = o;
  }
  /** part list from the look + what the gear hides */
  private refresh() {
    const l = this.look, torso = this.spec ? this.spec.torso : "suit", hides = [wearable(this.gear.head), wearable(this.gear.face), wearable(this.gear.back)];
    const parts = ["head", "torso_" + torso, "hands", "tail", "feet_" + l.feet.style, "eyes_" + l.eyes.style, "lids_" + l.eyes.style, "mouth_" + l.mouth];
    if (!hides.some((w) => w?.hidesEars)) parts.push("ears_" + l.ears.style);
    if (l.brows.style !== "none" && !hides.some((w) => w?.hidesBrows)) parts.push("brows_" + l.brows.style);
    if (torso === "suit" && l.tie.style !== "none") parts.push("tie_" + l.tie.style);
    if (this.spec?.tuft) parts.push("tuft");
    this.setParts(parts);
  }
  setLook(look: MonkeyLook) {
    this.look = look; const p = this.pal;
    setRegion(p, "fur", look.fur); setRegion(p, "fur2", shade(look.fur, -0.1)); setRegion(p, "face", look.face);
    setRegion(p, "suit", look.suit); setRegion(p, "suit2", shade(look.suit, -0.07, 1.05)); setRegion(p, "pants", look.pants);
    setRegion(p, "tie", look.tie.color); setRegion(p, "feet", look.feet.color); setRegion(p, "sole", shade(look.feet.color, -0.22));
    this.bone("head").scale.setScalar(1 + look.headSize);
    this.bone("ear_L").scale.setScalar(look.ears.size); this.bone("ear_R").scale.setScalar(look.ears.size);
    this.curl = (look.tail.curl - 0.3) * 0.62;
    this.refresh();
  }
  setGear(gear: Gear) {
    for (const slot of ["head", "face", "back"] as const) if (gear[slot] !== this.gear[slot] || (gear[slot] && !this.gearObj[slot])) this.attach(slot, gear[slot]);
    this.gear = { ...gear }; this.refresh();
  }
  knockOff(slot: WearSlot): THREE.Object3D | null {
    const o = this.gearObj[slot];
    if (!o) return null;
    o.updateWorldMatrix(true, false);
    if (this.root.parent) this.root.parent.attach(o); else o.removeFromParent();
    this.gearObj[slot] = null; this.gear = { ...this.gear, [slot]: null }; this.refresh();
    return o;
  }
  pose(s: RigState) {
    const nb = this.nb, dt = this.tick(s), snap = dt < 0, act = s.action as string, def = M_ACT[act];
    this.setAction(def, s, dt);
    // ---- heading: legs follow moveYaw (backpedal when facing the other way), the upper body twists to faceYaw
    const d = wrap(s.faceYaw - s.moveYaw);
    if (s.speed < 0.4 || def?.full) this.back = false; else if (this.back ? Math.abs(d) < 1.7 : Math.abs(d) > 2.0) this.back = !this.back;
    let hip = s.moveYaw + (this.back ? Math.PI : 0);
    const over = wrap(s.faceYaw - hip);
    if (over > TW_MAX) hip += over - TW_MAX; else if (over < -TW_MAX) hip += over + TW_MAX;
    this.hip = snap ? hip : this.hip + wrap(hip - this.hip) * Math.min(1, dt * 14);
    this.body.rotation.y = this.hip - this.root.rotation.y;
    const twist = clamp(wrap(s.faceYaw - this.hip), -1.6, 1.6) * (1 - this.fullW);
    // ---- locomotion
    const wMove = smooth(0.25, 1.4, s.speed), runMix = smooth(2.0, 3.6, s.speed);
    const rate = clamp(s.speed / 1.15 + (s.speed / 2.3 - s.speed / 1.15) * runMix, 0.9, 3.3) * (this.back ? -1 : 1);
    this.phase = snap ? s.time * rate : this.phase + dt * rate;
    sample(this.clip("idle"), frac(s.time / 2 + this.seed), PA, nb);
    if (wMove > 0.001) {
      const ph = frac(this.phase);
      sample(this.clip("run"), ph, PB, nb);
      if (runMix < 0.999) { sample(this.clip("walk"), ph, PC, nb); blend(PB, PC, 1 - runMix, nb, null); }
      blend(PA, PB, wMove, nb, null);
    }
    // ---- pistol hold on the upper body
    const aimT = s.armed === "pistol" ? 1 : 0;
    this.aimW = snap ? aimT : this.aimW + clamp(aimT - this.aimW, -dt / 0.12, dt / 0.12);
    if (this.aimW > 0.001) { sample(this.clip("aim"), 0, PB, nb); blend(PA, PB, this.aimW, nb, this.aimMask, 0); }
    // ---- action clip: upper body while moving, whole body when standing
    this.overlays(1 - wMove);
    this.write();
    // ---- procedural: twist, tail curl, recoil, props, face
    if (twist !== 0) { this.spine.quaternion.premultiply(Q.setFromAxisAngle(UP, twist * 0.4)); this.chest.quaternion.premultiply(Q.setFromAxisAngle(UP, twist * 0.6)); }
    if (this.curl !== 0) { Q.setFromAxisAngle(XA, this.curl); for (const t of this.tail) t.quaternion.multiply(Q); }
    // chin up toward the high camera so the face reads from above (the old monkey did the same)
    const up = RIG_TUNE.headUp * (1 - this.fullW);
    if (up !== 0) { this.neck.quaternion.multiply(Q.setFromAxisAngle(XA, -up * 0.4)); this.head.quaternion.multiply(Q.setFromAxisAngle(XA, -up * 0.6)); }
    const hr = this.sockets.handR, kick = act === "fire" ? Math.exp(-s.actionT * 7) * (1 - s.actionT) : 0;
    hr.position.z = -0.11 * kick; hr.rotation.x = -0.32 * kick;
    if (kick > 0) this.chest.quaternion.multiply(Q.setFromAxisAngle(XA, -0.06 * kick));
    const brief = s.armed === "briefcase";
    hr.visible = !brief; if (this.briefcase) this.briefcase.visible = brief;
    if (this.handProp) {              // the boomerang leaves the hand at the release and comes back a moment later
      if (act === "throw" && s.actionT >= 0.3) this.propBack = s.time + 0.9;
      this.handProp.visible = !(s.time < this.propBack && s.time > this.propBack - 5);
    }
    const mi = this.mesh.morphTargetInfluences!, l = this.look, shut = act === "defeat" ? smooth(0.45, 0.6, s.actionT) : act === "hurt" ? 1 - smooth(0.3, 0.6, s.actionT) : 0;
    mi[0] = Math.max(this.blink(s.time), shut);
    mi[1] = (l.eyes.spacing - 1) / 0.15;
    mi[2] = clamp(l.brows.tilt + (act === "hurt" || act === "defeat" ? -1.4 : act === "melee" || act === "throw" ? 0.7 : act === "fire" ? 0.3 : 0), -1.3, 1.3);
    this.flash(s.flash);
  }
}

// ---------------------------------------------------------------- gorilla (brute, the Sleeper)
const G_ACT: Record<string, ActDef> = {
  windup: { clip: "windup", full: true }, slam: { clip: "slam", full: true, snap: true }, charge: { clip: "charge", full: true, loop: true },
  stunned: { clip: "stunned", full: true, loop: true }, sleep: { clip: "sleep", full: true, loop: true }, hurt: { clip: "hurt", snap: true },
  defeat: { clip: "defeat", full: true },
};
class GorillaRig extends CharRig {
  private phase = 0;
  constructor(model: Model, style: EnemyStyle) {
    super(model, /^(root|hips|thigh|shin|foot)/);
    const rng = mulberry(style.seed * 7919 + 13), boss = style.kind === "sleeper", size = (boss ? 1.26 : 1) * (1 + (rng() - 0.5) * (boss ? 0.04 : 0.16));
    this.body.scale.setScalar(size); this.bounds = { radius: 0.9 * size, height: 2.9 * size };
    const fur = shade(boss ? "#3d3a4a" : "#4f4a58", (rng() - 0.5) * 0.08), p = this.pal;
    setRegion(p, "fur", fur); setRegion(p, "fur2", boss ? "#b9b4c4" : shade(fur, 0.08)); setRegion(p, "skin", shade(fur, -0.07)); setRegion(p, "skin2", shade(fur, 0.14, 0.8));
    setRegion(p, "vest", "#7a3142"); setRegion(p, "vest2", "#ecdfc2"); setRegion(p, "mask", "#7a4ea0");
    this.setParts(boss ? ["body", "face", "vest", "sleepmask", "chain"] : ["body", "face"]);
  }
  pose(s: RigState) {
    const nb = this.nb, dt = this.tick(s), snap = dt < 0, act = s.action as string;
    this.setAction(G_ACT[act], s, dt);
    this.body.rotation.y = s.moveYaw - this.root.rotation.y;
    const wMove = smooth(0.2, 1.2, s.speed), rate = clamp(s.speed / 2.4, 0.6, 2.2);
    this.phase = snap ? s.time * rate : this.phase + dt * rate;
    sample(this.clip("idle"), frac(s.time / 2.6 + this.seed), PA, nb);
    if (wMove > 0.001) { sample(this.clip("walk"), frac(this.phase), PB, nb); blend(PA, PB, wMove, nb, null); }
    this.overlays(1 - wMove);
    this.write();
    const mi = this.mesh.morphTargetInfluences!;
    mi[0] = act === "sleep" || act === "stunned" ? 1 : act === "defeat" ? smooth(0.4, 0.6, s.actionT) : this.blink(s.time);
    this.flash(s.flash);
  }
}

export function createRig(plan: "monkey", look: MonkeyLook): Rig;
export function createRig(plan: "monkey" | "gorilla", style: EnemyStyle): Rig;
export function createRig(plan: "monkey" | "gorilla", style: MonkeyLook | EnemyStyle): Rig {
  const gorilla = "kind" in style && (style.kind === "brute" || style.kind === "sleeper"), model = gorilla ? MODELS.gorilla : MODELS.monkey;
  if (!model) throw new Error("createRig: await preloadCharacters() first");
  void plan;
  return gorilla ? new GorillaRig(model, style as EnemyStyle) : new MonkeyRig(model, style);
}

/** triangles + draw calls (main pass) a rig costs right now, for budgets and the review page */
export function rigStats(rig: Rig) {
  let tris = 0, calls = 0;
  rig.root.traverseVisible((o) => {
    const m = o as THREE.Mesh; if (!m.isMesh) return;
    calls++; tris += (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute("position").count) / 3;
  });
  return { tris: Math.round(tris), calls };
}
void ZA;
