// The ninja dash look (G1.5 row 14; Moo: "instead of the roll copying the front flip like Duckov, a ninja dash with
// trailing effects"). Gameplay is the unchanged ROLL CONTRACT (combat/weapons.ts: 0.34 s, full protection, 3.2 u,
// stamina 10, the skid); this module only draws it:
// - afterimages: up to 3 frozen copies of the hero's body, one every 0.1 s of the dash (~0.95 u apart, wider than the
//   body, so each reads as its own crisp silhouette instead of a smear; Moo 2026-11-15: the 5-ghost trail at 0.07 s
//   "looks blurred, low quality"), each an unlit cool-teal silhouette that fades out over 0.22 s. Each ghost writes
//   depth so its overlapping limbs do not double up into uneven alpha. They are pooled SkinnedMeshes sharing the hero's geometry; each keeps its
//   own snapshot of the bone matrices (its skeleton never updates), so a ghost costs one draw call and no skinning
//   work on the CPU. Wearables (hat, shades, satchel) are not copied: the silhouette reads as the body.
// - speed lines: thin white streaks left behind along the dash, drawn in the gun FX sprite batch (no extra draw call).
// - a dust kick at the push-off and a smaller one at the stop, coloured by the ground (none on grass).
// The pose itself (procedural forward lean until a "dash" clip exists) lives in actors/rig.ts.
import * as THREE from "three";
import { G } from "../core/state";
import type { KingpinFx } from "../combat/kingpin";
import { PLAYER } from "../combat/weapons";
import { zoneAt } from "../world/grid";
import { tuneObject } from "../core/tune";

/** dash look constants (?tune "dash"; read live every frame) */
export const DASH_FX = { ghosts: 3, every: 0.1, life: 0.22, alpha: 0.55, lineEvery: 0.05, lineLen: 1.1, lineLenRand: 0.9, lineSpread: 1.1, pushDust: 4, stopDust: 2 };
tuneObject("dash", DASH_FX, {
  ghosts: { min: 0, max: 8, step: 1, label: "afterimages (max live)" }, every: { min: 0.02, max: 0.34, step: 0.01, label: "one afterimage every (s)" },
  life: { min: 0.05, max: 1, step: 0.01, label: "afterimage fade (s)" }, alpha: { min: 0, max: 1, step: 0.01, label: "afterimage opacity" },
  lineEvery: { min: 0.01, max: 0.3, step: 0.005, label: "speed line every (s)" }, lineLen: { min: 0, max: 4, step: 0.05, label: "speed line length" },
  lineLenRand: { min: 0, max: 4, step: 0.05, label: "speed line length random" }, lineSpread: { min: 0, max: 4, step: 0.05, label: "speed line spread" },
  pushDust: { min: 0, max: 12, step: 1, label: "push-off dust puffs" }, stopDust: { min: 0, max: 12, step: 1, label: "stop dust puffs" },
}, { note: "ninja dash FX (actors/dash.ts)" });
const TINT = new THREE.Color(0.12, 0.72, 1.0).multiplyScalar(1.25);
type Ghost = { mesh: THREE.SkinnedMesh; skel: THREE.Skeleton; mat: THREE.MeshBasicMaterial; t: number; live: boolean };
const ghosts: Ghost[] = [];
const dir = new THREE.Vector3(), at = new THREE.Vector3();
let dashT = -1, nextGhost = 0, nextLine = 0, src: THREE.SkinnedMesh | null = null;

function body(): THREE.SkinnedMesh | null {
  if (src && src.parent) return src;
  src = null; G.rig.root.traverse((o) => { if (!src && (o as THREE.SkinnedMesh).isSkinnedMesh && o.userData.rigBody) src = o as THREE.SkinnedMesh; });
  return src;
}
function ghostFor(s: THREE.SkinnedMesh): Ghost | null {
  let g = ghosts.find((q) => !q.live);
  if (!g && ghosts.length < DASH_FX.ghosts) {
    // pushed back in depth, so where a ghost overlaps the live hero (a dash into a wall) the hero always wins
    const mat = new THREE.MeshBasicMaterial({ color: TINT, transparent: true, opacity: DASH_FX.alpha, depthWrite: true, toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: 6, polygonOffsetUnits: 60 });
    const mesh = new THREE.SkinnedMesh(s.geometry, mat);
    const skel = new THREE.Skeleton(s.skeleton.bones, s.skeleton.boneInverses);
    skel.update = () => {};                               // frozen: the snapshot below is all it ever draws
    mesh.bind(skel, s.bindMatrix); mesh.bindMode = s.bindMode;
    mesh.matrixAutoUpdate = false; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false; mesh.renderOrder = -1;
    mesh.name = "dashGhost";
    g = { mesh, skel, mat, t: 0, live: false }; ghosts.push(g);
  }
  if (!g && ghosts.length) g = ghosts.reduce((a, b) => (b.t > a.t ? b : a)); // all busy: reuse the oldest
  return g ?? null;
}
function snapshot() {
  const s = body(); if (!s) return;
  const g = ghostFor(s); if (!g) return;
  if (g.mesh.geometry !== s.geometry) g.mesh.geometry = s.geometry; // the look can change parts between raids
  s.skeleton.update(); // this frame's pose (the rig was posed and its matrices updated just before)
  const from = s.skeleton.boneMatrices, to = g.skel.boneMatrices; if (!from || !to) return;
  to.set(from.length <= to.length ? from : from.subarray(0, to.length));
  if (g.skel.boneTexture) g.skel.boneTexture.needsUpdate = true;
  const mi = s.morphTargetInfluences, gi = g.mesh.morphTargetInfluences;
  if (mi && gi) for (let i = 0; i < Math.min(mi.length, gi.length); i++) gi[i] = mi[i];
  g.mesh.matrix.copy(s.matrixWorld); g.mesh.matrixWorldNeedsUpdate = true;
  if (g.mesh.parent !== G.stage.scene) G.stage.scene.add(g.mesh);
  g.t = 0; g.live = true; g.mesh.visible = true; g.mat.opacity = DASH_FX.alpha;
}
const fx = () => G.fx as KingpinFx;
/** ground dust colour per ground kind (dash and footstep dust; none on grass, plank and stone) */
const DUST: Partial<Record<string, string>> = { sand: "#e6cf9c", dirt: "#b89566", mud: "#8a6f4c", cave: "#9d968b" };
export function dustColor(x: number, z: number) { return DUST[zoneAt(x, z)?.ground ?? "sand"] ?? null; }

/** the dash started this frame (actors/player.ts) */
export function startDash(d: THREE.Vector3) {
  dir.copy(d).setY(0).normalize(); dashT = 0; nextGhost = DASH_FX.every * 0.5; nextLine = 0;
  const c = dustColor(G.pp.x, G.pp.z); if (c && DASH_FX.pushDust > 0) fx().dust(G.pp, -dir.x * 2.2, -dir.z * 2.2, DASH_FX.pushDust, c, 1.15);
}
/** per render frame, after the rig is posed (core/raid.ts renderRaid) */
export function updateDashFx(dt: number) {
  if (dashT >= 0) {
    dashT += dt;
    if (G.rollT < 0 || dashT > PLAYER.roll.time + 0.02) { // over (or cancelled): the stop puff
      dashT = -1; const c = dustColor(G.pp.x, G.pp.z); if (c && DASH_FX.stopDust > 0) fx().dust(G.pp, dir.x * 1.2, dir.z * 1.2, DASH_FX.stopDust, c, 0.9);
    } else {
      while (dashT >= nextGhost && nextGhost < PLAYER.roll.time) { snapshot(); nextGhost += Math.max(0.01, DASH_FX.every); }
      while (dashT >= nextLine) {
        nextLine += Math.max(0.005, DASH_FX.lineEvery);
        const len = DASH_FX.lineLen + Math.random() * DASH_FX.lineLenRand, side = (Math.random() - 0.5) * DASH_FX.lineSpread, h = 0.35 + Math.random() * 1.3;
        at.set(G.pp.x - dir.x * (len + 0.2) + dir.z * side, G.pp.y + h, G.pp.z - dir.z * (len + 0.2) - dir.x * side);
        fx().speedLine(at, dir.x * len, 0, dir.z * len, 0.035 + Math.random() * 0.025, 0.14 + Math.random() * 0.06, 0.9);
      }
    }
  }
  for (const g of ghosts) {
    if (!g.live) continue;
    g.t += dt; const k = g.t / Math.max(0.01, DASH_FX.life);
    if (k >= 1) { g.live = false; g.mesh.visible = false; continue; }
    g.mat.opacity = DASH_FX.alpha * (1 - k) * (1 - k);
  }
}
/** raid start/end: hide everything */
export function clearDashFx() { dashT = -1; for (const g of ghosts) { g.live = false; g.mesh.visible = false; g.mesh.removeFromParent(); } }
