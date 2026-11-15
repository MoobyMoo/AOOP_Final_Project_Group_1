// Review page for the guns (gun.html). ?gun=<id> picks the gun (combat/guns.ts GUNS; default kingpin45): its GLB when
// it has landed in public/models/guns/, else its placeholder (combat/gunmodels.ts). Views in the real stage lighting:
//   ?view=turntable (default)  the gun big, turning (or fixed with &rot=deg)
//   ?view=gameplay             the Businessman holding it, seen from the game camera (40 u, 55 deg, FOV 24)
// Exact frames for capture: &fireT=0.05 and/or &reloadT=0.6 freeze the pose. In the gameplay view the FX are pre-rolled
// too (&shots=N shots at the real 0.22 s spacing, stopping fireT of an interval after the last one); on the turntable
// a frozen frame is the bare pose unless &fx=1 (the flash is sized for the game camera and floods a close-up).
//   ?view=lineup             every gun at rest, side by side by class (the Kingpin first, for scale)
// &ext=1 extended magazine (the Kingpin only). &atts=id,id fits attachments (loot/attachments.ts ids).
// &marks=1 shows the off-hand point (gun.support, a red ball) and the stock's reach (a blue ball at the butt).
// &auto=1 loops 4 shots then a reload, forever. &hit=enemy|wall|none picks the target. &face=deg turns the shooter.
// Keys: SPACE fire, R reload, E extended magazine, T next target, V other view. &hud=0 hides the text.
import * as THREE from "three";
import { Stage } from "../render/stage";
import { U, mat } from "../render/shading";
import { createGunFx } from "./kingpin";
import { createGunView, gunModelSource, preloadGunModels } from "./gunmodels";
import { GUNS, GUN_IDS, CLASS_LABEL, isGunId } from "./guns";
import { tierOf } from "../loot/tiers";
import { KINGPIN, FEEL } from "./weapons";
import { createRig, preloadCharacters } from "../actors/rig";
import { DEFAULT_LOOK } from "../actors/look";
import { crate, rock, bush, ruinBlock } from "../world/kit";
import { ATTACHMENTS } from "../loot/attachments";
import type { RigState, GunAtts } from "../contracts";

const QS = new URLSearchParams(location.search);
const num = (k: string) => (QS.has(k) ? Number(QS.get(k)) : null);
const view = QS.get("view") === "gameplay" ? "gameplay" : QS.get("view") === "lineup" ? "lineup" : "turntable";
const GUN_ID = isGunId(QS.get("gun") ?? "") ? QS.get("gun")! : "kingpin45", DEF = GUNS[GUN_ID], IS_KP = GUN_ID === "kingpin45";
const pFire = num("fireT"), pReload = num("reloadT"), auto = QS.get("auto") === "1";
const frozen = !auto && (pFire !== null || pReload !== null);
type Hit = "enemy" | "wall" | "none";
const HITS: Hit[] = ["enemy", "wall", "none"];
let hit: Hit = (HITS as string[]).includes(QS.get("hit") ?? "") ? (QS.get("hit") as Hit) : view === "gameplay" ? "enemy" : "none";
let ext = IS_KP && QS.get("ext") === "1";

const stage = new Stage(document.getElementById("game") as HTMLCanvasElement);
const scene = stage.scene, rad = THREE.MathUtils.degToRad;
stage.renderer.info.autoReset = false;
await Promise.all([preloadGunModels(), preloadCharacters()]);
const gun = createGunView(GUN_ID), fx = createGunFx(scene);
gun.setVariant({ extMag: ext });
// &atts=att_sight_holo,att_laser fits those attachments on their slots (a slot the gun lacks shows nothing)
if (QS.get("atts")) {
  const fit: GunAtts = { sight: null, muzzle: null, mag: null, laser: null, grip: null, stock: null };
  for (const a of QS.get("atts")!.split(",")) if (Object.hasOwn(ATTACHMENTS, a)) fit[ATTACHMENTS[a].slot] = a;
  gun.setAttachments?.(fit);
}
if (QS.get("marks") === "1") {
  const ball = (hex: string) => new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshBasicMaterial({ color: hex, depthTest: false }));
  if (gun.support) { const b = ball("#ff2020"); b.renderOrder = 30; gun.support.add(b); }
  if (gun.stockReach) { const b = ball("#2070ff"); b.renderOrder = 30; b.position.set(0, 0.3, -gun.stockReach); gun.root.add(b); }
}
const target = new THREE.Vector3(), focus = new THREE.Vector3(), aimDir = new THREE.Vector3();
let live = !frozen, fireT = pFire ?? 1, reloadT = pReload ?? -1;

// ------------------------------------------------------------------------------------------------ scenes
const ground = new THREE.Mesh(new THREE.CircleGeometry(70, 48).rotateX(-Math.PI / 2), mat(view === "gameplay" ? "#8db45a" : "#cbb98c", { rough: 0.95, rim: 0 }));
ground.receiveShadow = true; scene.add(ground);
const spin = new THREE.Group(); // turntable
const rig = createRig("monkey", DEFAULT_LOOK), enemy = createRig("monkey", { kind: "bandit", seed: 1 });
const rs: RigState = { time: 0, speed: 0, moveYaw: 0, faceYaw: 0, action: "idle", actionT: 0, armed: "pistol", flash: 0 };
const es: RigState = { time: 0, speed: 0, moveYaw: 0, faceYaw: 0, action: "idle", actionT: 0, armed: "none", flash: 0 };
// the stage's canopy cookie shades big patches of ground; find a sunny one so the review isn't judged in the shade
// (same noise as shading.ts, ported; close enough to the GPU result at these magnitudes)
const SUN_SPOT = (() => {
  const fr = (x: number) => x - Math.floor(x), hash = (x: number, y: number) => fr(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
  const noise = (x: number, y: number) => { const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    return (hash(ix, iy) * (1 - ux) + hash(ix + 1, iy) * ux) * (1 - uy) + (hash(ix, iy + 1) * (1 - ux) + hash(ix + 1, iy + 1) * ux) * uy; };
  const fbm = (x: number, y: number) => { let v = 0, a = 0.5; for (let i = 0; i < 4; i++) { v += a * noise(x, y); x *= 2.03; y *= 2.03; a *= 0.5; } return v; };
  let best = new THREE.Vector3(), bv = -1;
  for (let x = -60; x <= 60; x += 2) for (let z = -60; z <= 60; z += 2) {
    let lo = 1; for (let a = 0; a < 8; a++) for (const r of [0, 3, 6]) lo = Math.min(lo, fbm((x + Math.cos(a * 0.785) * r) * 0.05, (z + Math.sin(a * 0.785) * r) * 0.05));
    if (lo > bv) { bv = lo; best.set(x, 0, z); }
  }
  return best;
})();
const SHOOTER = new THREE.Vector3(-3.6, 0, 0.6).add(SUN_SPOT), ENEMY = new THREE.Vector3(), WALL = new THREE.Vector3();
const _qs = new THREE.Quaternion(), _qd = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);

// the gun's length along the barrel (and its middle), for framing: the Kingpin is 1.11 u
const gunBox = new THREE.Box3().setFromObject(gun.root), gunLen = gunBox.max.z - gunBox.min.z, gunMid = (gunBox.max.z + gunBox.min.z) / 2;
if (view === "lineup") {
  // rows by class, guns in tier order along a row; each gun's middle on its spot, barrel to screen-right
  if (!QS.has("pitch")) stage.cam.pitch = rad(62);
  if (!QS.has("yaw")) stage.cam.yaw = 0;
  if (!QS.has("dist")) stage.cam.dist = 19;
  const rows = ["pistol", "smg", "rifle", "shotgun", "sniper", "lmg"];
  const ped = new THREE.Mesh(new THREE.BoxGeometry(10, 0.05, 8.4), mat("#b9a678", { rough: 0.9, rim: 0 })); ped.position.copy(SUN_SPOT).setY(0.025); ped.receiveShadow = true; scene.add(ped);
  rows.forEach((cls, r) => GUN_IDS.filter((id) => GUNS[id].cls === cls).forEach((id, i) => {
    const g = createGunView(id), b = new THREE.Box3().setFromObject(g.root);
    g.root.rotation.y = Math.PI / 2; // barrel along +x
    g.root.position.set(SUN_SPOT.x - 3 + i * 3 - (b.max.z + b.min.z) / 2, 0.45, SUN_SPOT.z - 3.5 + r * 1.4);
    g.root.traverse((o) => { o.castShadow = true; });
    scene.add(g.root);
  }));
  Object.assign(stage.sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 }); stage.sun.shadow.camera.updateProjectionMatrix();
  focus.copy(SUN_SPOT).setY(0.4); focus.z += 0.2;
} else if (view === "turntable") {
  if (!QS.has("pitch")) stage.cam.pitch = rad(16);
  if (!QS.has("yaw")) stage.cam.yaw = rad(115); // key light from the camera's left; the stage sun sits at azimuth 160
  if (!QS.has("dist")) stage.cam.dist = IS_KP ? 3.1 : 3.1 * Math.max(1, gunLen / 1.15);
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.6, 0.05, 48), mat("#b9a678", { rough: 0.9, rim: 0 })); ped.position.copy(SUN_SPOT).setY(0.025); ped.receiveShadow = true; scene.add(ped);
  spin.position.copy(SUN_SPOT).setY(1.05); scene.add(spin);
  gun.root.position.set(0, -0.02, IS_KP ? -0.2 : -gunMid); spin.add(gun.root); // turn about the middle of the gun, not the grip
  Object.assign(stage.sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3 }); stage.sun.shadow.camera.updateProjectionMatrix(); stage.sun.shadow.bias = -0.0002; stage.sun.shadow.normalBias = 0.004;
  focus.copy(SUN_SPOT).setY(1.06);
} else {
  // screen-right on the ground is (0.866, 0, 0.5) for the default camera yaw of -30 deg
  ENEMY.set(SHOOTER.x + 7.4, 0, SHOOTER.z + 2.2); WALL.set(SHOOTER.x + 6.2, 0, SHOOTER.z - 3.4);
  rig.root.position.copy(SHOOTER); scene.add(rig.root);
  enemy.root.position.copy(ENEMY); scene.add(enemy.root);
  const wall = new THREE.Group(); wall.position.copy(WALL); wall.rotation.y = Math.atan2(SHOOTER.x - WALL.x, SHOOTER.z - WALL.z);
  for (const [x, y, w, h] of [[-1.05, 0.5, 1.9, 1], [0.95, 0.5, 2, 1], [-0.1, 1.45, 2.1, 0.9], [1.6, 1.35, 0.8, 0.7]] as const) { const b = ruinBlock(w, h, 0.7); b.position.set(x, y, 0); b.castShadow = b.receiveShadow = true; wall.add(b); }
  scene.add(wall);
  const dress: [THREE.Object3D, number, number, number][] = [[crate("wood"), -5.6, 2.6, 0.4], [rock(1.1), 0.5, -4.2, 1], [bush(1), -1.2, 4.4, 0], [bush(0.8), 5.6, 5.2, 2], [crate("gold"), 6.8, -0.6, -0.3], [rock(0.7), -6.4, -2.4, 2]];
  for (const [o, x, z, ry] of dress) { o.position.set(x + SUN_SPOT.x, 0, z + SUN_SPOT.z); o.rotation.y = ry; o.traverse((m) => { m.castShadow = true; m.receiveShadow = true; }); scene.add(o); }
  rig.sockets.handR.add(gun.root);
  focus.set((SHOOTER.x + ENEMY.x) / 2 - 0.4, 0.9, (SHOOTER.z + ENEMY.z) / 2 - 0.8);
}

/** aim the shooter (or the turntable gun) and work out where the shot lands */
function aim(t: number) {
  if (view === "lineup") { gun.root.updateWorldMatrix(true, true); gun.muzzle.getWorldPosition(target); return; }
  if (view === "turntable") {
    // rot is relative to the camera: 0 = side profile with the muzzle to screen-right, 180 = the ejection-port side
    spin.rotation.y = stage.cam.yaw + Math.PI / 2 + (QS.has("rot") ? rad(Number(QS.get("rot"))) : t * 0.5 - 0.6);
    gun.root.updateWorldMatrix(true, true);
    gun.muzzle.getWorldPosition(target); gun.muzzle.getWorldDirection(aimDir); target.addScaledVector(aimDir, hit === "none" ? 12 : 4.5);
    return;
  }
  const to = hit === "wall" ? WALL : ENEMY;
  let yaw = Math.atan2(to.x - SHOOTER.x, to.z - SHOOTER.z); if (hit === "none") yaw = rad(60);
  if (QS.has("face")) yaw = rad(Number(QS.get("face")));
  rig.root.rotation.y = yaw; rs.time = t; rs.moveYaw = rs.faceYaw = yaw;
  rs.action = reloadT >= 0 ? "reload" : fireT < 1 ? "fire" : "idle"; rs.actionT = reloadT >= 0 ? reloadT : fireT;
  rig.pose(rs);
  enemy.root.rotation.y = yaw + Math.PI; es.time = t + 3; es.moveYaw = es.faceYaw = yaw + Math.PI; enemy.pose(es);
  // hold the gun level and pointed along the facing, whatever the arm is doing (the real rig will own this)
  rig.root.updateWorldMatrix(true, true);
  rig.sockets.handR.getWorldQuaternion(_qs).invert(); gun.root.quaternion.copy(_qs).multiply(_qd.setFromAxisAngle(UP, yaw));
  gun.root.updateWorldMatrix(true, true);
  gun.muzzle.getWorldPosition(target); aimDir.set(Math.sin(yaw), 0, Math.cos(yaw));
  const d = hit === "none" ? DEF.range : Math.hypot(to.x - SHOOTER.x, to.z - SHOOTER.z) - (hit === "wall" ? 0.42 : 0.3) - 1.2;
  target.addScaledVector(aimDir, Math.max(1, d)); if (hit === "enemy") target.y = 1.0;
}

// ------------------------------------------------------------------------------------------------ gameplay-side clock
let sinceShot = 9, reloadClock = -1, ammo = 0, autoShots = 4, autoWait = 0.4, clock = 0;
const magSize = () => (ext ? KINGPIN.extMag : DEF.mag);
ammo = magSize();
function shoot() {
  if (view === "lineup") return;
  gun.pose({ fireT: 0, reloadT: -1 }); aim(clock);
  fx.fire(gun.muzzle, gun.eject, target, hit);
  sinceShot = 0; ammo--; stage.kick.addScaledVector(aimDir, -FEEL.shotKick);
}
function tryFire() { if (reloadClock >= 0 || sinceShot < DEF.interval) return false; if (ammo <= 0) { startReload(); return false; } shoot(); return true; }
function startReload() { if (reloadClock < 0) reloadClock = 0; }
addEventListener("keydown", (e) => {
  if (e.repeat && e.code !== "Space") return;
  if (e.code === "Space") { live = true; tryFire(); e.preventDefault(); }
  else if (e.code === "KeyR") { live = true; startReload(); }
  else if (e.code === "KeyE" && IS_KP) { ext = !ext; gun.setVariant({ extMag: ext }); ammo = Math.min(ammo, magSize()); }
  else if (e.code === "KeyT") hit = HITS[(HITS.indexOf(hit) + 1) % HITS.length];
  else if (e.code === "KeyV") { QS.set("view", view === "gameplay" ? "turntable" : "gameplay"); location.search = QS.toString(); }
});

// frozen frames: pre-roll the FX so a still shows a real moment of sustained fire
if (frozen) {
  aim(0);
  if (pFire !== null && (view === "gameplay" || QS.get("fx") === "1")) {
    const shots = Math.max(1, num("shots") ?? (view === "gameplay" ? 4 : 1)), STEP = 1 / 240;
    for (let s = 0; s < shots; s++) {
      shoot();
      const span = s < shots - 1 ? DEF.interval : pFire * DEF.interval;
      for (let t = 0; t + 1e-6 < span; t += STEP) fx.update(Math.min(STEP, span - t));
    }
    stage.kick.set(0, 0, 0);
  }
}

// ------------------------------------------------------------------------------------------------ loop + stats
const statsEl = document.getElementById("stats")!, hudEl = document.getElementById("hud")!;
if (QS.get("hud") === "0") hudEl.style.display = "none";
const tier = tierOf(DEF.tier), titleEl = hudEl.querySelector("b")!;
titleEl.textContent = view === "lineup" ? "The arsenal" : DEF.name;
if (view !== "lineup") { const sub = document.createElement("i"); sub.textContent = ` ${CLASS_LABEL[DEF.cls]} · ${tier.name} · ${gunModelSource(GUN_ID)}`; sub.style.color = tier.color; titleEl.append(sub); }
if (!IS_KP) document.getElementById("keys")!.textContent = "SPACE fire · R reload · T target · V view";
document.title = `Bananaville: ${view === "lineup" ? "arsenal" : DEF.name} review`;
let gunTris = 0, gunCalls = 0;
const countGun = () => { gunTris = 0; gunCalls = 0; gun.root.traverse((o) => { const m = o as THREE.Mesh; if (!m.isMesh || !m.visible) return; gunCalls++; const g = m.geometry; gunTris += (g.index ? g.index.count : g.attributes.position.count) / 3; }); };
const peak = { fxCalls: 0, sprites: 0, shells: 0, fxTris: 0 };
const report = { id: GUN_ID, source: gunModelSource(GUN_ID), length: gunLen, hold: gun.hold ?? "one", support: (gun.support ? gun.root.worldToLocal(gun.support.getWorldPosition(new THREE.Vector3())).toArray() : null)?.map((v) => +v.toFixed(3)) ?? null, stockReach: +(gun.stockReach ?? 0).toFixed(3), gun: { drawCalls: 0, triangles: 0 }, fx: fx.stats(), peak, frame: { calls: 0, triangles: 0 }, view, ext };
(window as unknown as { __gun: typeof report }).__gun = report;
let last = performance.now(), statT = 0;
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; clock += dt; U.uTime.value = 0; // canopy cookie held still: the review stays in its sunny patch
  if (live) {
    sinceShot += dt;
    if (reloadClock >= 0) { reloadClock += dt; if (reloadClock >= DEF.reload) { reloadClock = -1; ammo = magSize(); } }
    if (auto) {
      if (reloadClock < 0) {
        autoWait -= dt;
        if (autoShots > 0) { if (autoWait <= 0 && sinceShot >= DEF.interval + 0.03) { ammo = Math.max(ammo, 1); shoot(); autoShots--; if (autoShots === 0) autoWait = 0.5; } }
        else if (autoWait <= 0) { startReload(); autoShots = 4; autoWait = 0.35; if (view === "gameplay" && !QS.has("hit")) hit = hit === "enemy" ? "wall" : "enemy"; }
      }
    }
    fireT = Math.min(1, sinceShot / DEF.interval); reloadT = reloadClock >= 0 ? Math.min(1, reloadClock / DEF.reload) : -1;
    aim(clock); gun.pose({ fireT, reloadT }); fx.update(dt);
  } else { aim(0); gun.pose({ fireT, reloadT }); }
  stage.place(focus, dt, clock); stage.render(dt);
  const info = stage.renderer.info, s = fx.stats();
  report.frame.calls = info.render.calls; report.frame.triangles = info.render.triangles; info.reset();
  countGun(); report.gun.drawCalls = gunCalls; report.gun.triangles = gunTris; report.fx = s; report.ext = ext;
  peak.fxCalls = Math.max(peak.fxCalls, s.drawCalls); peak.sprites = Math.max(peak.sprites, s.sprites); peak.shells = Math.max(peak.shells, s.shells); peak.fxTris = Math.max(peak.fxTris, s.triangles);
  if ((statT -= dt) <= 0) {
    statT = 0.2;
    statsEl.textContent = `gun ${gunCalls} draw calls, ${gunTris} tris · fx ${s.drawCalls} draw calls, ${s.sprites} sprites, ${s.shells} shells, ${s.triangles} tris (peak ${peak.fxTris}) · frame ${report.frame.calls} calls · ${ext ? "extended" : "standard"} mag ${Math.max(0, ammo)}/${magSize()} · target ${hit} · fireT ${fireT.toFixed(2)} reloadT ${reloadT.toFixed(2)}`;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
