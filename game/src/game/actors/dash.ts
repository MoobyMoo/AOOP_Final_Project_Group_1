// The ninja dash look (G1.5 row 14; Moo: "instead of the roll copying the front flip like Duckov, a ninja dash with
// trailing effects"). Gameplay is the unchanged ROLL CONTRACT (combat/weapons.ts: 0.34 s, full protection, 3.2 u,
// stamina 10, the skid); this module only draws it:
// - afterimages: up to 5 frozen copies of the hero's body, one every 0.07 s of the dash, each an unlit cool-teal
//   silhouette that fades out over 0.26 s. They are pooled SkinnedMeshes sharing the hero's geometry; each keeps its
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

const GHOSTS = 5, EVERY = 0.07, LIFE = 0.26, ALPHA = 0.62, TINT = new THREE.Color(0.12, 0.72, 1.0).multiplyScalar(1.25);
type Ghost = { mesh: THREE.SkinnedMesh; skel: THREE.Skeleton; mat: THREE.MeshBasicMaterial; t: number; live: boolean };
const ghosts: Ghost[] = [];
const dir = new THREE.Vector3(), at = new THREE.Vector3();
let dashT = -1, nextGhost = 0, nextLine = 0, src: THREE.SkinnedMesh | null = null;

function body(): THREE.SkinnedMesh | null {
  if (src && src.parent) return src;
  src = null; G.rig.root.traverse((o) => { if (!src && (o as THREE.SkinnedMesh).isSkinnedMesh && o.userData.rigBody) src = o as THREE.SkinnedMesh; });
  return src;
}
function ghostFor(s: THREE.SkinnedMesh): Ghost {
  let g = ghosts.find((q) => !q.live);
  if (!g && ghosts.length < GHOSTS) {
    // pushed back in depth, so where a ghost overlaps the live hero (a dash into a wall) the hero always wins
    const mat = new THREE.MeshBasicMaterial({ color: TINT, transparent: true, opacity: ALPHA, depthWrite: false, toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: 6, polygonOffsetUnits: 60 });
    const mesh = new THREE.SkinnedMesh(s.geometry, mat);
    const skel = new THREE.Skeleton(s.skeleton.bones, s.skeleton.boneInverses);
    skel.update = () => {};                               // frozen: the snapshot below is all it ever draws
    mesh.bind(skel, s.bindMatrix); mesh.bindMode = s.bindMode;
    mesh.matrixAutoUpdate = false; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false; mesh.renderOrder = -1;
    mesh.name = "dashGhost";
    g = { mesh, skel, mat, t: 0, live: false }; ghosts.push(g);
  }
  if (!g) g = ghosts.reduce((a, b) => (b.t > a.t ? b : a)); // all busy: reuse the oldest
  return g;
}
function snapshot() {
  const s = body(); if (!s) return;
  const g = ghostFor(s);
  if (g.mesh.geometry !== s.geometry) g.mesh.geometry = s.geometry; // the look can change parts between raids
  s.skeleton.update(); // this frame's pose (the rig was posed and its matrices updated just before)
  const from = s.skeleton.boneMatrices, to = g.skel.boneMatrices; if (!from || !to) return;
  to.set(from.length <= to.length ? from : from.subarray(0, to.length));
  if (g.skel.boneTexture) g.skel.boneTexture.needsUpdate = true;
  const mi = s.morphTargetInfluences, gi = g.mesh.morphTargetInfluences;
  if (mi && gi) for (let i = 0; i < Math.min(mi.length, gi.length); i++) gi[i] = mi[i];
  g.mesh.matrix.copy(s.matrixWorld); g.mesh.matrixWorldNeedsUpdate = true;
  if (g.mesh.parent !== G.stage.scene) G.stage.scene.add(g.mesh);
  g.t = 0; g.live = true; g.mesh.visible = true; g.mat.opacity = ALPHA;
}
const fx = () => G.fx as KingpinFx;
/** ground dust colour per ground kind (dash and footstep dust; none on grass, plank and stone) */
const DUST: Partial<Record<string, string>> = { sand: "#e6cf9c", dirt: "#b89566", mud: "#8a6f4c", cave: "#9d968b" };
export function dustColor(x: number, z: number) { return DUST[zoneAt(x, z)?.ground ?? "sand"] ?? null; }

/** the dash started this frame (actors/player.ts) */
export function startDash(d: THREE.Vector3) {
  dir.copy(d).setY(0).normalize(); dashT = 0; nextGhost = EVERY * 0.5; nextLine = 0;
  const c = dustColor(G.pp.x, G.pp.z); if (c) fx().dust(G.pp, -dir.x * 2.2, -dir.z * 2.2, 4, c, 1.15);
}
/** per render frame, after the rig is posed (core/raid.ts renderRaid) */
export function updateDashFx(dt: number) {
  if (dashT >= 0) {
    dashT += dt;
    if (G.rollT < 0 || dashT > PLAYER.roll.time + 0.02) { // over (or cancelled): the stop puff
      dashT = -1; const c = dustColor(G.pp.x, G.pp.z); if (c) fx().dust(G.pp, dir.x * 1.2, dir.z * 1.2, 2, c, 0.9);
    } else {
      while (dashT >= nextGhost && nextGhost < PLAYER.roll.time) { snapshot(); nextGhost += EVERY; }
      while (dashT >= nextLine) {
        nextLine += 0.025;
        const len = 1.1 + Math.random() * 0.9, side = (Math.random() - 0.5) * 1.1, h = 0.35 + Math.random() * 1.3;
        at.set(G.pp.x - dir.x * (len + 0.2) + dir.z * side, G.pp.y + h, G.pp.z - dir.z * (len + 0.2) - dir.x * side);
        fx().speedLine(at, dir.x * len, 0, dir.z * len, 0.035 + Math.random() * 0.025, 0.14 + Math.random() * 0.06, 0.9);
      }
    }
  }
  for (const g of ghosts) {
    if (!g.live) continue;
    g.t += dt; const k = g.t / LIFE;
    if (k >= 1) { g.live = false; g.mesh.visible = false; continue; }
    g.mat.opacity = ALPHA * (1 - k) * (1 - k);
  }
}
/** raid start/end: hide everything */
export function clearDashFx() { dashT = -1; for (const g of ghosts) { g.live = false; g.mesh.visible = false; g.mesh.removeFromParent(); } }
