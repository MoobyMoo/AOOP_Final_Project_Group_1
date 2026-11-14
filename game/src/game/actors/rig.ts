// Rig v2: characters built in Blender (tools/blender/*.py -> public/models/*.glb) and posed here.
// Armature, zones and part names are documented in tools/blender/README.md (keep them stable: other meshes get
// rigged to this skeleton).
//
// - preloadCharacters() loads the GLBs once; createRig() is synchronous after that.
// - Every character is ONE skinned mesh: the chosen part meshes (ears, eyes, torso, suit front...) are merged per
//   part combination and cached, so instances with the same parts share geometry. Colour comes from a per-instance
//   palette material (charmat.ts): a Look change is a uniform write plus bone/morph values.
// - Clips are pre-sampled at 30 fps into flat tables shared by all instances. pose() keeps no clock of its own:
//   clip times come from state.time / state.actionT, and fades, springs and the stride phase advance by the delta
//   of state.time between calls. It allocates nothing.
//
// Animation system (our build of the mechanism Duckov's CharacterAnimationControl uses: blend tree + hand state +
// attack layer + dash state + procedural aim/recoil):
//   1 locomotion   idle <-> 2D directional blend of walk/run (forward), runBack, strafeL, strafeR. Inputs: speed and
//                  the move direction in the facing frame (moveYaw - body yaw). The body faces faceYaw. The cycle
//                  rate is speed / stride length of the blend (GAIT_LEN), so planted feet do not slide.
//   2 hand state   by RigState.armed: none | pistol ("aim": right hand out, two-hand hold) | briefcase ("carry");
//                  during action "reload" the layer plays the reload clip instead (gun drops, left-hand mag swap).
//   3 attack       fire / melee / throw / hurt / use on the spine and up, ramped in 0.08 s and out 0.12 s; the legs
//                  keep the locomotion blend.
//   4 full body    roll (dash), defeat, cheer override everything for their duration (actionT).
//   5 procedural   gun-arm aim toward faceYaw at 360 deg/s, recoil kick, head look, chin-up, blink, brow expression,
//                  tail and ear springs driven by the body's own motion, squash on roll landings and hits, hurt flash.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import type { Rig, RigState, RigAction, MonkeyLook, EnemyStyle, Gear, WearSlot } from "../contracts";
import { charMaterial, newPalette, setRegion, shade, regionBytes, regionDefault, STATIC_PALETTE } from "./charmat";
import { preloadWearables, instWearable, wearable, WEAR_ZONES } from "./wearables";
import { monkeyEnemy, mulberry, DEFAULT_LOOK, lookExt, type MonkeyEnemySpec } from "./look";

/** actions the rigs can play beyond the contract's RigAction (report: contracts.ts lacks these) */
export type RigActionX = RigAction | "use" | "cheer";
/** real seconds for one play of each timed clip (the game maps actionT 0..1 over it); loops give their period */
export const CLIP_INFO: Record<string, { dur: number; loop?: boolean }> = {
  idle: { dur: 2, loop: true }, walk: { dur: 0.5, loop: true }, run: { dur: 0.45, loop: true }, runBack: { dur: 0.4, loop: true }, strafeL: { dur: 0.35, loop: true },
  strafeR: { dur: 0.35, loop: true }, aim: { dur: 1, loop: true }, carry: { dur: 1, loop: true }, fire: { dur: 0.25 }, reload: { dur: 1.2 },
  melee: { dur: 0.45 }, roll: { dur: 0.34 }, hurt: { dur: 0.35 }, throw: { dur: 0.75 }, use: { dur: 1.6 }, defeat: { dur: 0.9 }, cheer: { dur: 0.9, loop: true },
  windup: { dur: 0.9 }, slam: { dur: 0.6 }, charge: { dur: 0.5, loop: true }, stunned: { dur: 1.6, loop: true }, sleep: { dur: 3.2, loop: true },
};
/** metres one cycle of each gait covers with planted feet (from tools/blender/monkey_anim.py GAIT_LEN / build_gorilla.py) */
export const GAIT_LEN = { walk: 0.8, run: 2.2, runBack: 1.636, strafe: 1.182, gorillaWalk: 1.7 };

const FPS = 30, ST = 7, MORPHS = ["blink", "eyeWide", "browTilt", "build"];
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
type Spring = { x: number; v: number };
/** damped spring step (semi-implicit Euler); w = angular frequency, z = damping ratio */
function spring(s: Spring, target: number, w: number, z: number, h: number) { s.v += (w * w * (target - s.x) - 2 * z * w * s.v) * h; s.x += s.v * h; }

/** one animation layer: the current clip fades in, the clip it replaced fades out, weights ease and never pop */
class Layer {
  private cur: Clip | null = null; private curU = 0; private curW = 0;
  private prv: Clip | null = null; private prvU = 0; private prvW = 0;
  constructor(private tin: number, private tout: number) {}
  /** dt < 0 = snap (first frame or a clock jump) */
  set(clip: Clip | null, u: number, dt: number, snapIn = false) {
    if (clip !== this.cur) {
      if (this.cur && this.curW > 0.01 && dt >= 0) { this.prv = this.cur; this.prvU = this.curU; this.prvW = this.curW; }
      this.cur = clip; this.curW = dt < 0 || snapIn ? 1 : 0;
    }
    if (clip) { this.curU = u; this.curW = dt < 0 ? 1 : Math.min(1, this.curW + dt / this.tin); }
    this.prvW = dt < 0 ? 0 : Math.max(0, this.prvW - dt / this.tout);
    if (this.prvW <= 0) this.prv = null;
  }
  get weight() { return Math.min(1, (this.cur ? this.curW : 0) + (this.prv ? this.prvW : 0)); }
  /** blend over the pose in PA; mask = per-bone weight (null = every bone) */
  apply(nb: number, mask: Float32Array | null) {
    if (this.prv) { sample(this.prv, this.prvU, PB, nb); blend(PA, PB, this.prvW, nb, mask, 0); }
    if (this.cur) { sample(this.cur, this.curU, PB, nb); blend(PA, PB, this.curW, nb, mask, 0); }
  }
}
type GearMats = { pal: Float32Array; matte: THREE.MeshStandardMaterial; gloss: THREE.MeshStandardMaterial };

abstract class CharRig implements Rig {
  root = new THREE.Group();
  /** inner group: turns to the facing and carries the seeded size + squash, so gameplay owns root entirely */
  body = new THREE.Group();
  sockets: Rig["sockets"];
  bounds = { radius: 0.45, height: 2 };
  protected bones: THREE.Bone[]; protected nb: number; protected mesh: THREE.SkinnedMesh;
  protected pal = newPalette(); protected mat: THREE.MeshStandardMaterial;
  protected gm: Record<string, GearMats> = {};
  protected upper: Float32Array;                       // 1 = spine and up, 0 = hips/legs
  protected t0 = NaN; protected seed: number; protected scale = 1;
  protected attack = new Layer(0.08, 0.12); protected full = new Layer(0.06, 0.12);
  protected squash: Spring = { x: 0, v: 0 }; protected prevAct = ""; protected prevAT = 0; protected prevFlash = 0;
  protected faceSock: THREE.Object3D;

  constructor(protected model: Model, lower: RegExp) {
    const arm = cloneSkinned(model.tmpl), byName: Record<string, THREE.Bone> = {};
    arm.traverse((o) => { if ((o as THREE.Bone).isBone) byName[o.name] = o as THREE.Bone; });
    this.bones = model.names.map((n) => byName[n]); this.nb = this.bones.length;
    this.mat = charMaterial(this.pal);
    this.mesh = new THREE.SkinnedMesh(merge(model, []), this.mat);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.morphTargetInfluences = MORPHS.map(() => 0);
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
  /** per-instance gear materials for one slot (own palette copy, so gear can be recoloured and flashed per rig) */
  protected matsFor(key: string): GearMats {
    return (this.gm[key] ??= (() => { const pal = STATIC_PALETTE.slice(); return { pal, matte: charMaterial(pal), gloss: charMaterial(pal, true) }; })());
  }
  protected setParts(names: string[]) {
    const g = merge(this.model, names);
    if (this.mesh.geometry !== g) this.mesh.geometry = g;
  }
  /** delta of the gameplay clock since the last pose(); -1 on a jump (first call, scrub, pause): fades snap */
  protected tick(s: RigState) { const dt = s.time - this.t0; this.t0 = s.time; return dt >= 0 && dt < 0.25 ? dt : -1; }
  protected write() {
    for (let b = 0, o = 0; b < this.nb; b++, o += ST) {
      const bn = this.bones[b];
      bn.position.set(PA[o], PA[o + 1], PA[o + 2]); bn.quaternion.set(PA[o + 3], PA[o + 4], PA[o + 5], PA[o + 6]).normalize();
    }
  }
  /** squash and stretch: a spring kicked by landings and hits, applied to the body scale */
  protected squashStep(s: RigState, h: number, land: boolean) {
    const hit = (s.flash > 0 && this.prevFlash <= 0) || (s.action === "hurt" && (this.prevAct !== "hurt" || s.actionT < this.prevAT - 0.2));
    if (h > 0) { if (land) this.squash.v += 3.4; if (hit) this.squash.v += 2.2; spring(this.squash, 0, 24, 0.33, h); } else { this.squash.x = 0; this.squash.v = 0; }
    const q = clamp(this.squash.x, -0.14, 0.24);
    this.body.scale.set(this.scale * (1 + q * 0.5), this.scale * (1 - q), this.scale * (1 + q * 0.5));
    this.prevAct = s.action; this.prevAT = s.actionT; this.prevFlash = s.flash;
  }
  protected flash(v: number) {
    const e = v > 0 ? Math.min(1, v) * 0.85 : 0;
    this.mat.emissiveIntensity = e;
    for (const k in this.gm) { this.gm[k].matte.emissiveIntensity = e; this.gm[k].gloss.emissiveIntensity = e; }
  }
  /** blink pulse from the gameplay clock (every ~3.3 s, offset per instance) */
  protected blink(time: number) { const p = frac(time / 3.3 + this.seed) * 3.3; return p < 0.16 ? Math.sin((p / 0.16) * Math.PI) : 0; }
  abstract pose(s: RigState): void;
  dispose() {
    this.root.removeFromParent(); this.mat.dispose();
    for (const k in this.gm) { this.gm[k].matte.dispose(); this.gm[k].gloss.dispose(); }
    this.mesh.skeleton.dispose();
  }
}

// ---------------------------------------------------------------- monkey (player, wild, bandit)
const M_ATTACK: Record<string, string> = { fire: "fire", melee: "melee", throw: "throw", hurt: "hurt", use: "use" };
const M_FULL: Record<string, string> = { roll: "roll", defeat: "defeat", cheer: "cheer" };
/** look tuning the game may change: headUp = how far monkeys lift their chin toward the top-down camera (rad);
 *  aimRate = how fast the gun arm turns toward faceYaw (rad/s, 360 deg/s like Duckov's right-hand sync) */
export const RIG_TUNE = { headUp: 0.24, aimRate: Math.PI * 2 };
const TW_MAX = 1.3;   // the gun arm can lead or trail the body by up to ~75 deg

class MonkeyRig extends CharRig {
  private look: MonkeyLook = DEFAULT_LOOK; private spec: MonkeyEnemySpec | null;
  private gear: Gear = { head: null, face: null, body: null, back: null, ears: null };
  private gearObj: Record<WearSlot, THREE.Object3D | null> = { head: null, face: null, body: null, back: null, ears: null };
  private hand = new Layer(0.12, 0.14); private aimMask: Float32Array; private aimK = 0;
  private yaw = 0; private aimYaw = 0; private phase = 0; private wd = new Float32Array(4);   // fwd, back, left, right
  private briefcase: THREE.Object3D | null = null; private handProp: THREE.Object3D | null = null; private propBack = 0;
  private spine: THREE.Bone; private chest: THREE.Bone; private neck: THREE.Bone; private head: THREE.Bone; private earL: THREE.Bone; private earR: THREE.Bone;
  private tail: THREE.Bone[]; private curl = 0; private build = 0; private hipsI: number; private hipsY = 0;
  private tSway: Spring = { x: 0, v: 0 }; private tSway2: Spring = { x: 0, v: 0 }; private tLift: Spring = { x: 0, v: 0 }; private ear: Spring = { x: 0, v: 0 };

  constructor(model: Model, style: MonkeyLook | EnemyStyle) {
    super(model, /^(root|hips|thigh|shin|foot)/);
    this.aimMask = new Float32Array(this.nb);
    model.names.forEach((n, i) => { this.aimMask[i] = /^(chest|shoulder|upperarm|forearm|hand|thumb|sk_hand)/.test(n) ? 1 : n === "spine" ? 0.6 : 0; });
    this.spine = this.bone("spine"); this.chest = this.bone("chest"); this.neck = this.bone("neck"); this.head = this.bone("head");
    this.earL = this.bone("ear_L"); this.earR = this.bone("ear_R"); this.tail = [1, 2, 3, 4, 5].map((i) => this.bone("tail" + i)); this.hipsI = model.bi.hips;
    this.spec = "kind" in style ? monkeyEnemy(style) : null;
    this.scale = this.spec?.scale ?? 1; this.body.scale.setScalar(this.scale);
    this.bounds = { radius: 0.45 * this.scale, height: 2.0 * this.scale };
    this.setLook(this.spec ? this.spec.look : (style as MonkeyLook));
    if (this.spec) {
      this.gear = { head: this.spec.head, face: this.spec.face, body: null, back: this.spec.back, ears: null };
      for (const slot of ["head", "face", "back"] as const) this.attach(slot, this.gear[slot]);
      if (this.spec.bandana) setRegion(this.matsFor("face").pal, "red", this.spec.bandana);
      if (this.spec.hand) { this.handProp = instWearable(this.spec.hand, this.matsFor("prop")); this.bone("sk_hand_R").add(this.handProp); }
      this.refresh();
    } else {
      this.briefcase = instWearable("prop_briefcase", this.matsFor("prop")); this.briefcase.visible = false; this.bone("sk_hand_R").add(this.briefcase);
    }
  }
  private socketFor(slot: WearSlot) { return slot === "head" ? this.sockets.head : slot === "back" ? this.sockets.back : this.faceSock; }
  private attach(slot: WearSlot, id: string | null) {
    this.gearObj[slot]?.removeFromParent(); this.gearObj[slot] = null;
    if (!id) return;
    const o = instWearable(id, this.matsFor(slot)); this.socketFor(slot).add(o); this.gearObj[slot] = o;
  }
  /** gear colours: each slot has its own palette copy; LookExt.gear[slot].main / .accent recolour the item's zones */
  private gearColors() {
    const g = lookExt(this.look).gear;
    for (const slot of ["head", "face", "back"] as const) {
      const id = this.gear[slot], z = id ? WEAR_ZONES[id] : undefined;
      if (!id || !z || this.spec) continue;
      const pal = this.matsFor(slot).pal, c = g?.[slot];
      setRegion(pal, z.main, c?.main ?? regionDefault(z.main));
      if (z.accent) setRegion(pal, z.accent, c?.accent ?? regionDefault(z.accent));
    }
  }
  /** part list from the look + what the gear hides */
  private refresh() {
    const l = this.look, x = lookExt(l), suit = !this.spec, jacket = x.jacket ?? "two", hides = [wearable(this.gear.head), wearable(this.gear.face), wearable(this.gear.back)];
    const parts = ["head", this.spec ? "torso_" + this.spec.torso : jacket === "vest" ? "torso_vest" : "torso_suit", "hands", "tail", "feet_" + l.feet.style, "eyes_" + l.eyes.style, "lids_" + l.eyes.style, "mouth_" + l.mouth];
    if (!hides.some((w) => w?.hidesEars)) parts.push("ears_" + l.ears.style);
    if (l.brows.style !== "none" && !hides.some((w) => w?.hidesBrows)) parts.push("brows_" + l.brows.style);
    if (suit) {
      parts.push("front_" + jacket);
      if (l.tie.style !== "none") parts.push("tie_" + l.tie.style);
      if (x.pocketSquare && jacket !== "vest") parts.push("square");
    }
    if (this.spec?.tuft) parts.push("tuft");
    this.setParts(parts);
    this.gearColors();
  }
  setLook(look: MonkeyLook) {
    this.look = look; const p = this.pal, x = lookExt(look), c = x.colors ?? {};
    setRegion(p, "fur", look.fur); setRegion(p, "fur2", shade(look.fur, -0.1)); setRegion(p, "face", look.face);
    setRegion(p, "ear", c.innerEar ?? new THREE.Color(look.fur).lerp(new THREE.Color(look.face), 0.5));
    setRegion(p, "pupil", c.eyes ?? regionDefault("pupil")); setRegion(p, "shirt", c.shirt ?? regionDefault("shirt"));
    setRegion(p, "dark", c.brows ?? regionDefault("dark")); setRegion(p, "gold", c.buttons ?? regionDefault("gold")); setRegion(p, "square", c.square ?? regionDefault("square"));
    setRegion(p, "suit", look.suit); setRegion(p, "suit2", shade(look.suit, -0.055, 1.05)); setRegion(p, "pants", look.pants);
    setRegion(p, "tie", look.tie.color); setRegion(p, "feet", look.feet.color); setRegion(p, "sole", shade(look.feet.color, -0.22));
    this.head.scale.setScalar(1 + look.headSize);
    this.earL.scale.setScalar(look.ears.size); this.earR.scale.setScalar(look.ears.size);
    this.curl = (look.tail.curl - 0.3) * 0.62;
    this.build = clamp(this.spec ? this.spec.build : x.build ?? 0, -1, 1);
    this.sockets.back.scale.set(1 + 0.18 * this.build, 1, 1 + 0.2 * this.build);   // packs and straps follow the belly
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
    const nb = this.nb, dt = this.tick(s), snap = dt < 0, h = snap ? 0 : Math.min(dt, 1 / 30), act = s.action as string;
    const fullClip = M_FULL[act], atkClip = M_ATTACK[act];
    // ---- facing: the body faces faceYaw (eased); the gun arm chases it at aimRate so it never snaps
    let yawRate = 0;
    if (snap) { this.yaw = s.faceYaw; this.aimYaw = s.faceYaw; }
    else {
      const prev = this.yaw, st = RIG_TUNE.aimRate * dt;
      this.yaw += wrap(s.faceYaw - this.yaw) * (1 - Math.exp(-dt * (fullClip ? 26 : 13)));
      this.aimYaw += clamp(wrap(s.faceYaw - this.aimYaw), -st, st);
      yawRate = dt > 0 ? wrap(this.yaw - prev) / dt : 0;
    }
    this.body.rotation.y = this.yaw - this.root.rotation.y;
    // ---- locomotion: 2D directional blend in the facing frame, cycle rate matched to the stride
    const a = wrap(s.moveYaw - this.yaw), ca = Math.cos(a), sa = Math.sin(a), nrm = 1 / (Math.abs(ca) + Math.abs(sa)), k = snap ? 1 : 1 - Math.exp(-dt * 12), wd = this.wd;
    wd[0] += (Math.max(0, ca) * nrm - wd[0]) * k; wd[1] += (Math.max(0, -ca) * nrm - wd[1]) * k; wd[2] += (Math.max(0, sa) * nrm - wd[2]) * k; wd[3] += (Math.max(0, -sa) * nrm - wd[3]) * k;
    const wMove = smooth(0.15, 1.0, s.speed), runMix = smooth(1.6, 3.4, s.speed);
    const stride = wd[0] * (GAIT_LEN.walk + (GAIT_LEN.run - GAIT_LEN.walk) * runMix) + wd[1] * GAIT_LEN.runBack + (wd[2] + wd[3]) * GAIT_LEN.strafe;
    const rate = clamp(s.speed / Math.max(0.3, stride), 0.8, 3.6);
    this.phase = snap ? s.time * rate : this.phase + dt * rate;
    sample(this.clip("idle"), frac(s.time / 2 + this.seed), PA, nb);
    if (wMove > 0.001) {
      const ph = frac(this.phase);
      let acc = 0;
      acc = this.dir("run", wd[0] * runMix, ph, acc); acc = this.dir("walk", wd[0] * (1 - runMix), ph, acc);
      acc = this.dir("runBack", wd[1], ph, acc); acc = this.dir("strafeL", wd[2], ph, acc); acc = this.dir("strafeR", wd[3], ph, acc);
      if (acc > 0) blend(PA, PC, wMove, nb, null);
    }
    const hipsY = PA[this.hipsI * ST + 1], vy = h > 0 ? (hipsY - this.hipsY) / h : 0; this.hipsY = hipsY;
    // ---- hand state: what is held decides the arm pose; a reload takes the layer over
    this.hand.set(act === "reload" ? this.clip("reload") : s.armed === "pistol" ? this.clip("aim") : s.armed === "briefcase" ? this.clip("carry") : null, act === "reload" ? clamp(s.actionT, 0, 1) : 0, dt);
    this.hand.apply(nb, this.aimMask);
    // ---- attack layer (spine and up) and the full-body state (roll, defeat)
    this.attack.set(atkClip ? this.clip(atkClip) : null, clamp(s.actionT, 0, 1), dt);
    this.attack.apply(nb, this.upper);
    this.full.set(fullClip ? this.clip(fullClip) : null, act === "cheer" ? frac(s.time / CLIP_INFO.cheer.dur + this.seed) : clamp(s.actionT, 0, 1), dt, act === "roll");
    this.full.apply(nb, null);
    this.write();
    // ---- procedural: gun-arm aim, head look, chin up, tail, ears, recoil
    const free = 1 - this.full.weight;
    this.aimK += ((s.armed === "pistol" ? 1 : 0) - this.aimK) * (snap ? 1 : 1 - Math.exp(-dt * 10));
    const twist = clamp(wrap(this.aimYaw - this.yaw), -TW_MAX, TW_MAX) * this.aimK * free;
    if (twist !== 0) { this.spine.quaternion.premultiply(Q.setFromAxisAngle(UP, twist * 0.35)); this.chest.quaternion.premultiply(Q.setFromAxisAngle(UP, twist * 0.65)); }
    const look = (clamp(wrap(s.faceYaw - this.yaw), -0.8, 0.8) - twist) * free, up = RIG_TUNE.headUp * free;
    this.neck.quaternion.premultiply(Q.setFromAxisAngle(UP, look * 0.4)).multiply(Q.setFromAxisAngle(XA, -up * 0.4));
    this.head.quaternion.premultiply(Q.setFromAxisAngle(UP, look * 0.6)).multiply(Q.setFromAxisAngle(XA, -up * 0.6));
    // tail: a follow-through chain (two springs in series) dragged by turning, side-stepping and the hop; ears wobble
    if (h > 0) {
      spring(this.tSway, clamp(-yawRate * 0.11 - sa * wMove * 0.22, -0.55, 0.55), 13, 0.42, h); spring(this.tSway2, this.tSway.x * 1.5, 9, 0.38, h);
      spring(this.tLift, clamp(-vy * 0.13 - ca * wMove * 0.1, -0.35, 0.35), 15, 0.4, h); spring(this.ear, clamp(-vy * 0.22, -0.45, 0.45), 19, 0.3, h);
    } else { this.tSway.x = this.tSway.v = this.tSway2.x = this.tSway2.v = this.tLift.x = this.tLift.v = this.ear.x = this.ear.v = 0; }
    for (let i = 0; i < 5; i++) {
      const t = this.tail[i], far = i >= 2;
      t.quaternion.multiply(Q.setFromAxisAngle(ZA, (far ? this.tSway2.x : this.tSway.x) * 0.4 * free));
      t.quaternion.multiply(Q.setFromAxisAngle(XA, (i > 0 ? this.curl : 0) + this.tLift.x * (far ? 0.55 : 0.3) * free));
    }
    this.earL.quaternion.multiply(Q.setFromAxisAngle(ZA, this.ear.x)); this.earR.quaternion.multiply(Q.setFromAxisAngle(ZA, -this.ear.x));
    // recoil: fast out, slower recover (Duckov: back 20/s, recover 8/s); moves the gun socket, a little of it reaches the chest
    const hr = this.sockets.handR, ft = act === "fire" ? s.actionT * CLIP_INFO.fire.dur : -1, kick = ft < 0 ? 0 : ft < 0.035 ? ft / 0.035 : Math.exp(-(ft - 0.035) * 9);
    hr.position.z = -0.1 * kick; hr.rotation.x = -0.3 * kick;
    if (kick > 0) this.chest.quaternion.multiply(Q.setFromAxisAngle(XA, -0.05 * kick));
    this.squashStep(s, h, (this.prevAct === "roll" && act !== "roll") || (act === "roll" && this.prevAT < 0.86 && s.actionT >= 0.86));
    // ---- props and face
    const brief = s.armed === "briefcase";
    hr.visible = !brief; if (this.briefcase) this.briefcase.visible = brief;
    if (this.handProp) {              // the boomerang leaves the hand at the release and is back a moment later
      if (act === "throw" && s.actionT >= 0.3) this.propBack = s.time + 0.9;
      this.handProp.visible = !(s.time < this.propBack && s.time > this.propBack - 5);
    }
    const mi = this.mesh.morphTargetInfluences!, l = this.look, shut = act === "defeat" ? smooth(0.45, 0.6, s.actionT) : act === "hurt" ? 1 - smooth(0.3, 0.6, s.actionT) : 0;
    mi[0] = Math.max(this.blink(s.time), shut);
    mi[1] = (l.eyes.spacing - 1) / 0.15;
    mi[2] = clamp(l.brows.tilt + (act === "hurt" || act === "defeat" ? -1.4 : act === "melee" || act === "throw" ? 0.7 : act === "fire" ? 0.3 : 0), -1.3, 1.3);
    mi[3] = this.build;
    this.flash(s.flash);
  }
  /** add one directional gait to the running blend in PC (weights are normalised as they accumulate) */
  private dir(name: string, w: number, ph: number, acc: number) {
    if (w <= 0.001) return acc;
    if (acc === 0) sample(this.clip(name), ph, PC, this.nb); else { sample(this.clip(name), ph, PB, this.nb); blend(PC, PB, w / (acc + w), this.nb, null); }
    return acc + w;
  }
}

// ---------------------------------------------------------------- gorilla (brute, the Sleeper)
// Same system: locomotion blend (idle <-> knuckle-walk, stride-matched) + attack layer (hurt) + full-body states.
// windup / slam / charge / stunned / sleep / defeat are full-body: rearing up moves the hips, so the legs must follow.
const G_FULL: Record<string, string> = { windup: "windup", slam: "slam", charge: "charge", stunned: "stunned", sleep: "sleep", defeat: "defeat" };
class GorillaRig extends CharRig {
  private phase = 0; private yaw = 0; private headB: THREE.Bone; private neckB: THREE.Bone;
  constructor(model: Model, style: EnemyStyle) {
    super(model, /^(root|hips|thigh|shin|foot)/);
    const rng = mulberry(style.seed * 7919 + 13), boss = style.kind === "sleeper", size = (boss ? 1.26 : 1) * (1 + (rng() - 0.5) * (boss ? 0.04 : 0.16));
    this.scale = size; this.body.scale.setScalar(size); this.bounds = { radius: 0.9 * size, height: 2.9 * size };
    const fur = shade(boss ? "#3d3a4a" : "#4f4a58", (rng() - 0.5) * 0.08), p = this.pal;
    setRegion(p, "fur", fur); setRegion(p, "fur2", boss ? "#b9b4c4" : shade(fur, 0.08)); setRegion(p, "skin", shade(fur, -0.07)); setRegion(p, "skin2", shade(fur, 0.14, 0.8));
    setRegion(p, "vest", "#7a3142"); setRegion(p, "vest2", "#ecdfc2"); setRegion(p, "mask", "#7a4ea0");
    this.headB = this.bone("head"); this.neckB = this.bone("neck");
    this.setParts(boss ? ["body", "face", "vest", "sleepmask", "chain"] : ["body", "face"]);
  }
  pose(s: RigState) {
    const nb = this.nb, dt = this.tick(s), snap = dt < 0, h = snap ? 0 : Math.min(dt, 1 / 30), act = s.action as string, fullClip = G_FULL[act];
    this.yaw = snap ? s.moveYaw : this.yaw + wrap(s.moveYaw - this.yaw) * (1 - Math.exp(-dt * 9));
    this.body.rotation.y = this.yaw - this.root.rotation.y;
    const wMove = smooth(0.2, 1.2, s.speed), rate = clamp(s.speed / GAIT_LEN.gorillaWalk, 0.5, 2.4);
    this.phase = snap ? s.time * rate : this.phase + dt * rate;
    sample(this.clip("idle"), frac(s.time / 2.6 + this.seed), PA, nb);
    if (wMove > 0.001) { sample(this.clip("walk"), frac(this.phase), PC, nb); blend(PA, PC, wMove, nb, null); }
    this.attack.set(act === "hurt" ? this.clip("hurt") : null, clamp(s.actionT, 0, 1), dt);
    this.attack.apply(nb, this.upper);
    const loop = act === "charge" || act === "stunned" || act === "sleep";
    this.full.set(fullClip ? this.clip(fullClip) : null, loop ? frac(s.time / CLIP_INFO[act].dur + this.seed) : clamp(s.actionT, 0, 1), dt, act === "slam");
    this.full.apply(nb, null);
    this.write();
    const look = clamp(wrap(s.faceYaw - this.yaw), -0.7, 0.7) * (1 - this.full.weight);
    if (look !== 0) { this.neckB.quaternion.premultiply(Q.setFromAxisAngle(UP, look * 0.4)); this.headB.quaternion.premultiply(Q.setFromAxisAngle(UP, look * 0.6)); }
    this.squashStep(s, h, act === "slam" && s.actionT >= 0.6 && (this.prevAct !== "slam" || this.prevAT < 0.6));
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
