// Bananaville feel test v2 (throwaway spike). Idle-arcade loop built from research/idle-arcade:
// walk near a tree to pick, the stack grows on your back, walk to a station to unload, customers
// buy and pay at the register, scoop the cash, stand on floor pads to unlock the next thing.
// Covers demo beats 1-3 (+ a teaser of the next area). Numbers are first guesses until
// research/economy lands.
import * as THREE from "three";
import { MonkeyCard, Look } from "./monkey";
import { box, cyl, ball, inked } from "./toon";
import { initFx, updateFx, popIn, squash, arc, burst, floatText, tween } from "./fx";
import { sfx, unlockAudio } from "./audio";
import { Stack, makeItem, makeBill, Kind } from "./items";
import { Pad } from "./pads";

type V3 = THREE.Vector3;
const V = (x: number, z: number, y = 0) => new THREE.Vector3(x, y, z);
const flat = (a: V3, b: V3) => Math.hypot(a.x - b.x, a.z - b.z);

// ---------- renderer / scene ----------
const canvas = document.getElementById("game") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#ffdcae");
scene.fog = new THREE.Fog("#ffdcae", 34, 95);
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 300);
const sun = new THREE.DirectionalLight("#fff1d6", 2.3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 });
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight("#fff4e0", "#6fa553", 1.25));
let camDist = 1;
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  const portrait = camera.aspect < 1;
  camera.fov = portrait ? 52 : 40;
  camDist = portrait ? 1.25 : 1;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize); resize();
initFx(scene, camera);

// ---------- world ----------
const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), new THREE.MeshToonMaterial({ color: "#8cc86a" }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(15, 11.5), new THREE.MeshToonMaterial({ color: "#f2dcae" }));
floor.rotation.x = -Math.PI / 2; floor.position.set(1, 0.01, 0.6); floor.receiveShadow = true; scene.add(floor);
const road = new THREE.Mesh(new THREE.PlaneGeometry(120, 3), new THREE.MeshToonMaterial({ color: "#e2bf8c" }));
road.rotation.x = -Math.PI / 2; road.position.set(0, 0.015, 8.4); road.receiveShadow = true; scene.add(road);
// fence on three sides (the south side opens onto the road)
for (let x = -6.5; x <= 8.5; x += 1.25) scene.add(cyl(0.08, 0.1, 0.8, "#b07a45", x, 0, -5.2, 6));
for (let z = -5.2; z <= 6.4; z += 1.25) { scene.add(cyl(0.08, 0.1, 0.8, "#b07a45", -6.5, 0, z, 6)); scene.add(cyl(0.08, 0.1, 0.8, "#b07a45", 8.5, 0, z, 6)); }
scene.add(box(15, 0.1, 0.12, "#c98a4b", 1, 0.55, -5.2), box(0.12, 0.1, 11.6, "#c98a4b", -6.5, 0.55, 0.6), box(0.12, 0.1, 11.6, "#c98a4b", 8.5, 0.55, 0.6));
// jungle backdrop
for (let i = 0; i < 40; i++) {
  const x = -30 + i * 1.6 + Math.sin(i * 7.3) * 0.9, z = -9 - (i % 4) * 1.8 - Math.abs(Math.sin(i)) * 2;
  scene.add(cyl(0.18, 0.26, 2.4 + (i % 3) * 0.7, "#8a5a34", x, 0, z, 7), ball(1.2 + (i % 4) * 0.25, i % 2 ? "#5fa548" : "#4f9440", x, 2.9 + (i % 3) * 0.7, z));
}
for (let i = 0; i < 16; i++) {
  const side = i % 2 ? 1 : -1, z = -6 + (i >> 1) * 1.9;
  const x = side > 0 ? 11 + Math.sin(i) : -9.5 - Math.cos(i);
  scene.add(ball(0.9 + (i % 3) * 0.3, "#5aa045", x, 0.6, z));
}
// the goal on the horizon from minute one: golden banana tower + rides
{
  const g = new THREE.Group(); g.position.set(6, 0, -62);
  g.add(cyl(3.2, 4.2, 6, "#e8b13a", 0, 0, 0, 10));
  const nana = inked(new THREE.TorusGeometry(6, 2.1, 10, 24, Math.PI * 0.85), "#ffd84a", 0.25);
  nana.position.set(-1, 12, 0); nana.rotation.z = Math.PI * 0.12; g.add(nana);
  const wheel = inked(new THREE.TorusGeometry(6, 0.35, 6, 32), "#e8493a", 0.15); wheel.position.set(-16, 8, 4); g.add(wheel);
  g.add(cyl(0.4, 0.4, 8, "#e8493a", -16, 0, 4, 6));
  scene.add(g);
}

// ---------- shared helpers ----------
const bubbleTex = new Map<string, THREE.CanvasTexture>();
function bubble(emoji: string) {
  let t = bubbleTex.get(emoji);
  if (!t) {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const x = c.getContext("2d")!;
    x.fillStyle = "#fff"; x.strokeStyle = "#2a1a12"; x.lineWidth = 8;
    x.beginPath(); x.ellipse(64, 56, 54, 46, 0, 0, Math.PI * 2); x.fill(); x.stroke();
    x.beginPath(); x.moveTo(52, 98); x.lineTo(64, 122); x.lineTo(76, 98); x.fill(); x.stroke();
    x.font = "58px serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(emoji, 64, 58);
    t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; bubbleTex.set(emoji, t);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false }));
  s.scale.setScalar(0.75); s.renderOrder = 15;
  return s;
}
function zoneRing(at: V3, r = 0.9, color = "#ffffff") {
  const m = new THREE.Mesh(new THREE.RingGeometry(r - 0.09, r, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.copy(at).setY(0.025); m.renderOrder = 1;
  return m;
}
let trauma = 0; // camera shake: shake = trauma^2, decays (research/game-feel)
const obstacles: { p: V3; r: number }[] = [];

// ---------- trees ----------
type Tree = { g: THREE.Group; pos: V3; ripe: number; regrow: number; fruit: THREE.Object3D[]; on: boolean };
const TREE_MAX = 4;
function makeTree(pos: V3): Tree {
  const g = new THREE.Group(); g.position.copy(pos);
  g.add(cyl(0.13, 0.2, 1.5, "#9a6a3e", 0, 0, 0, 8));
  for (let i = 0; i < 6; i++) {
    const leaf = inked(new THREE.ConeGeometry(0.22, 1.1, 4), i % 2 ? "#5fb04a" : "#4f9a3e", 0.03);
    leaf.position.set(0, 1.55, 0); leaf.rotation.set(Math.PI / 2.4, (i / 6) * Math.PI * 2, 0, "YXZ");
    leaf.children.forEach((c) => c.translateY(0.45));
    g.add(leaf);
  }
  const fruit: THREE.Object3D[] = [];
  for (let i = 0; i < TREE_MAX; i++) {
    const f = makeItem("banana"); f.position.set(Math.cos(i * 1.57) * 0.3, 1.25 - (i % 2) * 0.13, Math.sin(i * 1.57) * 0.3);
    g.add(f); fruit.push(f);
  }
  return { g, pos: pos.clone(), ripe: TREE_MAX, regrow: 0, fruit, on: false };
}
const trees = [makeTree(V(-1.2, -2.7)), makeTree(V(-3.2, -1.1)), makeTree(V(-4.4, 0.9))];
function plantTree(t: Tree) {
  t.on = true; scene.add(t.g); popIn(t.g, 0, 0.5);
  burst(t.pos.clone().setY(1), 14, "#7cc24f");
  obstacles.push({ p: t.pos, r: 0.35 });
}

// ---------- player (declared early: piles and pads read its position) ----------
const BOSS: Look = { fur: "#c8682c", suit: "#3a3340", tie: "#ff8a2a", hat: "bowler", hatBand: "#ff8a2a", shades: true };
const player = new MonkeyCard(BOSS, 1.7);
player.group.position.set(0, 0, 0.4);
scene.add(player.group);
// the stack rides up from the shoulders and towers over the head, so it always reads from the high camera
const backOf = (m: MonkeyCard, h = 1.5) => () => m.group.position.clone().add(new THREE.Vector3(0, h, -0.55));
let pAnchorH = 1.62; // just above the bowler hat; rises when the basket is bought
const pStack = new Stack(scene, () => player.group.position.clone().add(new THREE.Vector3(0, pAnchorH, -0.55)), 3);
let wallet = 0;
const SPEED = 5.6;
const pVel = new THREE.Vector3();

// ---------- cash piles ----------
class CashPile {
  bills: THREE.Object3D[] = [];
  private t = 0;
  constructor(public origin: V3, public value = 5) {}
  slot(i: number) { return this.origin.clone().add(V((i % 3) * 0.46 - 0.46, (Math.floor(i / 3) % 3) * 0.27 - 0.27, 0.04 + Math.floor(i / 9) * 0.075)); }
  add(from: V3) {
    const b = makeBill(), i = this.bills.length;
    this.bills.push(b);
    b.rotation.y = (Math.random() - 0.5) * 0.25;
    arc(b, from, () => this.slot(i), 0.22, 1.1, () => { squash(b, 0.3, 0.18); sfx("sell"); });
  }
  update(dt: number) {
    if (!this.bills.length || flat(player.group.position, this.origin) > 1.5) return;
    this.t -= dt;
    while (this.t <= 0 && this.bills.length) {
      this.t += 0.03;
      const b = this.bills.pop()!;
      arc(b, b.position.clone(), () => player.group.position.clone().setY(1.0), 0.18, 1.0, () => {
        scene.remove(b); wallet += this.value; sfx("cash"); bumpWallet();
      });
    }
  }
}
const starterPile = new CashPile(V(0.9, 1.2));
for (let i = 0; i < 6; i++) { const b = makeBill(); b.position.copy(starterPile.slot(i)); scene.add(b); starterPile.bills.push(b); }
const registerPile = new CashPile(V(6.9, -1.5));

// ---------- stations ----------
type Station = {
  kind: Kind; group: THREE.Group; pos: V3; drop: V3; cap: number; count: number; items: THREE.Object3D[];
  slot: (i: number) => V3; queue: Cust[]; spot: (i: number) => V3; open: boolean; price: number; ring: THREE.Mesh;
};
function makeSign(text: string, bg: string) {
  const c = document.createElement("canvas"); c.width = 512; c.height = 128;
  const x = c.getContext("2d")!;
  x.fillStyle = bg; x.fillRect(0, 0, 512, 128); x.lineWidth = 14; x.strokeStyle = "#2a1a12"; x.strokeRect(7, 7, 498, 114);
  x.fillStyle = "#2a1a12"; x.font = "bold 62px Trebuchet MS"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(text, 256, 68);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.42), new THREE.MeshBasicMaterial({ map: t }));
}
function makeStation(kind: Kind, pos: V3, drop: V3, cap: number, price: number, cols: number, queueDir: V3): Station {
  const g = new THREE.Group(); g.position.copy(pos);
  const color = kind === "banana" ? "#c98a4b" : "#5ac0b5";
  g.add(box(2.2, 0.8, 1, color, 0, 0, 0), box(2.3, 0.08, 1.1, "#8a5a34", 0, 0.8, 0));
  for (const x of [-1.05, 1.05]) g.add(cyl(0.05, 0.05, 2, "#8a5a34", x, 0, -0.45, 6));
  for (let i = 0; i < 6; i++) g.add(box(0.37, 0.05, 1.3, i % 2 ? "#fff6e6" : kind === "banana" ? "#e8493a" : "#ff7aa8", -0.93 + i * 0.37, 1.95, 0.05));
  const sign = makeSign(kind === "banana" ? "BANANAS" : "SMOOTHIES", kind === "banana" ? "#ffe066" : "#ffb3c8");
  sign.position.set(0, 0.42, 0.52); g.add(sign);
  return {
    kind, group: g, pos, drop, cap, count: 0, items: [], queue: [], open: false, price,
    slot: (i) => pos.clone().add(V(-0.75 + (i % cols) * (1.5 / (cols - 1)), -0.18 + Math.floor(i / cols) * 0.3, 0.86)),
    spot: (i) => pos.clone().add(V(0, 1.15, 0)).add(queueDir.clone().multiplyScalar(i * 0.85)),
    ring: zoneRing(drop, 0.85),
  };
}
const stand = makeStation("banana", V(2, -1.4), V(2, -2.7), 8, 5, 4, V(0, 1));
const bar = makeStation("smoothie", V(-0.4, 3.0), V(-0.4, 1.7), 6, 15, 3, V(0, 1));
function openStation(s: Station) {
  s.open = true; scene.add(s.group, s.ring);
  s.group.children.forEach((c, i) => popIn(c, i * 0.035));
  burst(s.pos.clone().setY(1.2), 20, "#fff6e6");
  obstacles.push({ p: s.pos, r: 1.05 });
  trauma = Math.min(1, trauma + 0.35);
}
function addToDisplay(s: Station, from: V3) {
  const i = s.count++;
  const o = makeItem(s.kind);
  s.items.push(o);
  arc(o, from, () => s.slot(i), 0.18, 0.8, () => squash(o, 0.3, 0.2));
}
function takeFromDisplay(s: Station) { const o = s.items.pop()!; s.count--; return o; }

// register
const register = { pos: V(5.4, -1.4), zone: V(5.4, -2.7), queue: [] as Cust[], open: false, t: 0, group: new THREE.Group(), ring: zoneRing(V(5.4, -2.7), 0.85, "#ffe066") };
register.group.position.copy(register.pos);
register.group.add(box(1.4, 0.85, 0.9, "#8a5a34", 0, 0, 0), box(0.6, 0.35, 0.45, "#3a3340", 0, 0.85, -0.05), box(0.5, 0.06, 0.3, "#8fd18a", 0, 1.2, 0.05));
const regSpot = (i: number) => register.pos.clone().add(V(0, 1.15 + i * 0.85));

// blender: 2 bananas in -> 1 smoothie out
const blender = {
  pos: V(-3.6, 3.4), zone: V(-2.3, 3.4), open: false, input: 0, inCap: 6, output: 0, outCap: 6, prog: 0,
  group: new THREE.Group(), jar: cyl(0.32, 0.26, 0.9, "#bfe8ff", 0, 0.8, 0, 12), cups: [] as THREE.Object3D[], hopper: [] as THREE.Object3D[],
  bar: box(1, 0.08, 0.08, "#8fd18a", 0, 2.25, 0.3), ring: zoneRing(V(-2.3, 3.4), 0.85, "#ff9fb2"),
};
blender.group.position.copy(blender.pos);
blender.group.add(box(1.4, 0.8, 1, "#d9dde3", 0, 0, 0), blender.jar, cyl(0.36, 0.36, 0.12, "#3a3340", 0, 1.7, 0, 12), blender.bar);
const cupSlot = (i: number) => blender.pos.clone().add(V(0.9 + (i % 2) * 0.3, 0.05, -0.3 + Math.floor(i / 2) * 0.3));

// input: WASD / arrows, or drag anywhere (touch, trackpad, mouse) for a virtual joystick
const keys = new Set<string>();
addEventListener("keydown", (e) => { keys.add(e.key.toLowerCase()); unlockAudio(); });
addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
const joy = { on: false, ox: 0, oy: 0, x: 0, y: 0 };
const joyEl = document.getElementById("joy")!, knob = document.getElementById("knob")!;
canvas.addEventListener("pointerdown", (e) => { unlockAudio(); joy.on = true; joy.ox = e.clientX; joy.oy = e.clientY; joy.x = joy.y = 0; joyEl.style.left = e.clientX + "px"; joyEl.style.top = e.clientY + "px"; joyEl.classList.add("on"); canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener("pointermove", (e) => {
  if (!joy.on) return;
  let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy; const l = Math.hypot(dx, dy), m = 55;
  if (l > m) { dx *= m / l; dy *= m / l; }
  joy.x = dx / m; joy.y = dy / m; knob.style.transform = `translate(${dx}px, ${dy}px)`;
});
const endJoy = () => { joy.on = false; joy.x = joy.y = 0; joyEl.classList.remove("on"); knob.style.transform = ""; };
canvas.addEventListener("pointerup", endJoy); canvas.addEventListener("pointercancel", endJoy);

// ---------- customers ----------
const FURS = ["#c8682c", "#a8582a", "#d47a3a", "#b86a36"];
const SUITS = ["#4a8fd1", "#e8493a", "#8fd18a", "#ffb04a", "#b07ad1", "#5ac0b5"];
type Cust = {
  m: MonkeyCard; want: Kind; st: Station | null; state: "queue" | "toReg" | "leave"; patience: number;
  bub: THREE.Sprite | null; held: THREE.Object3D | null; exitX: number; vel: V3; ready: boolean;
};
const custs: Cust[] = [];
let spawnT = 1.5;
function spawnCustomer() {
  if (!stand.open || custs.length >= 10) return;
  const st = bar.open && Math.random() < 0.45 ? bar : stand;
  if (st.queue.length >= 4) return;
  const look: Look = { fur: FURS[Math.floor(Math.random() * 4)], suit: SUITS[Math.floor(Math.random() * 6)], hat: Math.random() < 0.5 ? "cap" : "none", hatBand: SUITS[Math.floor(Math.random() * 6)] };
  const m = new MonkeyCard(look, 1.3 + Math.random() * 0.2);
  const fromLeft = Math.random() < 0.5;
  m.group.position.set(fromLeft ? -16 : 18, 0, 8.4);
  scene.add(m.group);
  const c: Cust = { m, want: st.kind, st, state: "queue", patience: 35, bub: null, held: null, exitX: fromLeft ? 18 : -16, vel: new THREE.Vector3(), ready: false };
  st.queue.push(c);
  custs.push(c);
}
function setBubble(c: Cust, emoji: string | null) {
  if (c.bub) c.m.group.remove(c.bub);
  c.bub = null;
  if (!emoji) return;
  c.bub = bubble(emoji); c.bub.position.set(0, 2.05, 0); c.m.group.add(c.bub); popIn(c.bub, 0, 0.3, 0.75);
}
function moveTo(pos: V3, target: V3, speed: number, dt: number, vel: V3) {
  const d = target.clone().sub(pos); d.y = 0;
  const l = d.length();
  if (l < 0.04) { vel.set(0, 0, 0); return true; }
  const step = Math.min(l, speed * dt);
  vel.copy(d).multiplyScalar(speed / l);
  pos.addScaledVector(d, step / l);
  return l - step < 0.05;
}
function leave(c: Cust, emoji: string) {
  c.state = "leave"; setBubble(c, emoji);
  if (c.st) { c.st.queue.splice(c.st.queue.indexOf(c), 1); c.st = null; }
}
function updateCustomers(dt: number) {
  for (const c of custs) {
    const p = c.m.group.position;
    if (c.state === "queue" && c.st) {
      const i = c.st.queue.indexOf(c);
      // walk along the road first, then up into the line
      const spot = c.st.spot(i);
      const onRoad = Math.abs(p.z - 8.4) < 0.2 && Math.abs(p.x - spot.x) > 0.3;
      const arrived = moveTo(p, onRoad ? V(spot.x, 8.4) : spot, 3.4, dt, c.vel) && !onRoad;
      if (i === 0 && arrived) {
        if (!c.bub) setBubble(c, c.want === "banana" ? "🍌" : "🥤");
        c.patience -= dt;
        if (c.st.count > 0) {
          const o = takeFromDisplay(c.st);
          c.st.queue.shift(); c.st = null; c.state = "toReg";
          register.queue.push(c);
          setBubble(c, null); c.m.flash("wow", 500);
          arc(o, o.position.clone(), () => c.m.group.position.clone().setY(1.75), 0.2, 0.7, () => { c.m.group.add(o); o.position.set(0, 1.75, 0); c.held = o; });
        } else if (c.patience <= 0) { c.m.setExpr("angry"); floatText("Too slow!", p.clone().setY(2), "#c0392b"); leave(c, "😡"); }
      }
    } else if (c.state === "toReg") {
      const i = register.queue.indexOf(c);
      c.ready = moveTo(p, regSpot(i), 3.4, dt, c.vel) && i === 0;
    } else if (c.state === "leave") {
      moveTo(p, Math.abs(p.z - 8.4) > 0.2 ? V(p.x, 8.4) : V(c.exitX, 8.4), 3.6, dt, c.vel);
    }
    c.m.tick(dt, camera, c.vel);
  }
  for (let i = custs.length - 1; i >= 0; i--) {
    const c = custs[i];
    if (c.state === "leave" && Math.abs(c.m.group.position.x - c.exitX) < 0.3) { scene.remove(c.m.group); c.m.dispose(); custs.splice(i, 1); }
  }
}

// ---------- helpers ----------
type Helper = { m: MonkeyCard; stack: Stack; vel: V3; job: "pick" | "deliver" | "cashier"; t: number; target: Tree | null };
const helpers: Helper[] = [];
const HELPER_SPEED = SPEED * 0.7; // the player always outperforms helpers (research rule 19)
function hire(job: "pick" | "cashier", at: V3) {
  const look: Look = job === "cashier"
    ? { fur: "#b86a36", suit: "#4a8fd1", hat: "cap", hatBand: "#ffe066", tie: "#ffe066" }
    : { fur: "#d47a3a", suit: "#8fd18a", hat: "cap", hatBand: "#5aa045", apron: "#fff6e6" };
  const m = new MonkeyCard(look, 1.45);
  m.group.position.copy(at);
  scene.add(m.group); popIn(m.pivot, 0, 0.5);
  burst(at.clone().setY(1), 16, "#8fd18a");
  helpers.push({ m, stack: new Stack(scene, backOf(m, 1.25), 2), vel: new THREE.Vector3(), job, t: 0, target: null });
}
function bananaSinks() {
  const s: { drop: V3; fill: number; put: (from: V3) => void }[] = [];
  if (stand.open && stand.count < stand.cap) s.push({ drop: stand.drop, fill: stand.count / stand.cap, put: (f) => addToDisplay(stand, f) });
  if (blender.open && blender.input < blender.inCap) s.push({ drop: blender.zone, fill: blender.input / blender.inCap, put: (f) => feedBlender(f) });
  return s.sort((a, b) => a.fill - b.fill); // emptiest first (research rule 32)
}
function updateHelpers(dt: number) {
  for (const h of helpers) {
    const p = h.m.group.position;
    h.t -= dt;
    if (h.job === "cashier") moveTo(p, register.zone.clone().add(V(0.5, -0.2)), HELPER_SPEED, dt, h.vel);
    else if (h.job === "pick") {
      if (!h.target || h.target.ripe === 0) h.target = trees.filter((t) => t.on && t.ripe > 0).sort((a, b) => flat(a.pos, p) - flat(b.pos, p))[0] ?? null;
      if (h.stack.full || (!h.target && h.stack.size > 0)) h.job = "deliver";
      else if (h.target) {
        if (moveTo(p, h.target.pos.clone().add(V(0.7, 0.4)), HELPER_SPEED, dt, h.vel) && h.t <= 0) {
          h.t = 0.32; h.target.ripe--; h.target.regrow = Math.max(h.target.regrow, 1.6);
          const f = h.target.fruit[h.target.ripe]; f.visible = false;
          h.stack.push("banana", f.getWorldPosition(new THREE.Vector3()));
        }
      } else h.vel.set(0, 0, 0);
    } else {
      const sink = bananaSinks()[0];
      if (!h.stack.size) h.job = "pick";
      else if (!sink) h.vel.set(0, 0, 0);
      else if (moveTo(p, sink.drop.clone().add(V(-0.4, 0)), HELPER_SPEED, dt, h.vel) && h.t <= 0) {
        h.t = 0.14; const from = h.stack.take("banana"); if (from) sink.put(from);
      }
    }
    h.stack.update(dt, h.vel);
    h.m.tick(dt, camera, h.vel);
  }
}

function feedBlender(from: V3) {
  const o = makeItem("banana"), i = blender.input++;
  blender.hopper.push(o);
  arc(o, from, () => blender.pos.clone().add(V(-0.45 + (i % 3) * 0.3, 0.85 + Math.floor(i / 3) * 0.12, 0.35)), 0.18, 0.8);
}
function updateBlender(dt: number) {
  if (!blender.open) return;
  if (blender.input >= 2 && blender.output < blender.outCap) {
    blender.prog += dt / 1.4;
    blender.jar.rotation.y += dt * 20;
    if (blender.prog >= 1) {
      blender.prog = 0; blender.input -= 2;
      for (let k = 0; k < 2; k++) scene.remove(blender.hopper.pop()!);
      const cup = makeItem("smoothie"), i = blender.output++;
      blender.cups.push(cup);
      arc(cup, blender.pos.clone().setY(1.6), () => cupSlot(i), 0.25, 0.9, () => squash(cup, 0.3, 0.2));
      squash(blender.jar, 0.12, 0.25); sfx("drop");
    }
  }
  blender.bar.scale.x = Math.max(0.001, blender.prog);
}

// ---------- HUD ----------
const walletEl = document.getElementById("wallet")!;
function bumpWallet() { walletEl.classList.remove("bump"); void walletEl.offsetWidth; walletEl.classList.add("bump"); }
function toast(msg: string) { const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.getElementById("toasts")!.appendChild(t); setTimeout(() => t.remove(), 3200); }

// ---------- pads (the unlock sequence: demo beats 1-3) ----------
const pads: Pad[] = [];
const panOnAfford = new Set<Pad>();
const panned = new Set<Pad>();
function pad(x: number, z: number, cost: number, label: string, icon: string, fn: () => void, big = false, pan = false) {
  const p = new Pad(scene, V(x, z), cost, label, icon, fn, big); pads.push(p); if (pan) panOnAfford.add(p); return p;
}
// the next area waits behind fog, teasing what comes after this slice
const clouds = new THREE.Group();
for (let i = 0; i < 14; i++) {
  const c = ball(0.9 + (i % 3) * 0.35, "#fffaf0", -6.6 + (i % 7) * 1.25 + Math.sin(i * 3) * 0.3, 0.7 + (i >> 3) * 0.6 + (i % 2) * 0.3, -6.6 - (i >> 1) % 3 * 1.1);
  clouds.add(c);
}
scene.add(clouds);
const fogSign = makeSign("COMING SOON", "#ffe066"); fogSign.position.set(-3, 1.3, -5.55); scene.add(fogSign);
function openBakeryTease() {
  clouds.children.forEach((c, i) => tween(0.5, (k) => { c.scale.setScalar(Math.max(0.001, 1 - k)); c.position.y += k * 0.05; }, undefined, i * 0.05));
  setTimeout(() => scene.remove(clouds), 1400);
  const g = new THREE.Group(); g.position.set(-3, 0, -8.4);
  g.add(box(4, 2.2, 2.4, "#e8a06a", 0, 0, 0));
  const roof = inked(new THREE.ConeGeometry(3.2, 1.4, 4), "#e8493a", 0.06); roof.rotation.y = Math.PI / 4; roof.position.y = 2.9; g.add(roof);
  const s = makeSign("BAKERY", "#ffe066"); s.position.set(0, 1.4, 1.22); g.add(s);
  scene.add(g); g.children.forEach((c, i) => popIn(c, 0.4 + i * 0.12, 0.6));
  fogSign.visible = false; trauma = 1;
  setTimeout(() => toast("End of this feel test: the bakery comes next"), 1600);
}
const P: Record<string, Pad> = {};
P.stand = pad(2, -1.4, 10, "Banana Stand", "🍌", () => {
  openStation(stand); register.open = true; scene.add(register.group, register.ring);
  register.group.children.forEach((c, i) => popIn(c, 0.2 + i * 0.05));
  P.tree1.show(); toast("Your first stand! Now plant a tree");
});
P.tree1 = pad(-1.2, -2.7, 20, "Banana Tree", "🌴", () => { plantTree(trees[0]); P.tree2.show(); P.basket.show(); toast("Walk under the tree to pick bananas"); });
P.tree2 = pad(-3.2, -1.1, 30, "Banana Tree", "🌴", () => plantTree(trees[1]));
P.basket = pad(0.6, -0.2, 50, "Basket: carry 6", "🧺", () => {
  pStack.cap = 6;
  const b = box(0.62, 0.26, 0.44, "#b07a45", 0, 1.6, -0.55); player.group.add(b); popIn(b); pAnchorH = 1.9;
  player.flash("wow", 700); P.picker.show(); P.bar.show();
});
P.picker = pad(-4.6, -2.8, 80, "Hire Picker", "🐒", () => { hire("pick", V(-4.6, -2.8)); toast("A picker joined! He's slower than you, though"); });
P.bar = pad(-0.4, 3.0, 100, "Smoothie Bar", "🥤", () => { openStation(bar); P.blender.show(); toast("Thirsty customers! You need a blender"); }, false, true);
P.blender = pad(-3.6, 3.4, 120, "Blender", "🍹", () => {
  blender.open = true; scene.add(blender.group, blender.ring); blender.group.children.forEach((c, i) => popIn(c, i * 0.05));
  obstacles.push({ p: blender.pos, r: 0.8 }); trauma = Math.min(1, trauma + 0.35);
  P.tree3.show(); P.cashier.show(); P.bakery.show(); toast("2 bananas in, 1 smoothie out");
});
P.tree3 = pad(-4.4, 0.9, 150, "Banana Tree", "🌴", () => plantTree(trees[2]));
P.cashier = pad(7.0, -3.4, 200, "Hire Cashier", "🧾", () => hire("cashier", V(7, -3.4)), false, true);
P.bakery = pad(-3, -4.3, 500, "Bakery Wing", "🍞", () => openBakeryTease(), true, true);
P.stand.show();

// onboarding arrow: one bouncing arrow, no text tutorial (research rule 12)
const arrow = inked(new THREE.ConeGeometry(0.32, 0.7, 4), "#ffcc3d", 0.05);
arrow.rotation.x = Math.PI; scene.add(arrow);
function arrowTarget(): V3 | null {
  if (P.bar.done) return null;
  if (starterPile.bills.length) return starterPile.origin;
  const affordable = pads.find((p) => p.visible && !p.done && wallet >= p.left);
  if (affordable) return affordable.pos;
  if (registerPile.bills.length >= 3) return registerPile.origin;
  if (register.queue[0]?.ready && !helpers.some((h) => h.job === "cashier")) return register.zone;
  if (pStack.count("banana") > 0) return stand.drop;
  return trees.find((t) => t.on && t.ripe > 0)?.pos ?? null;
}

// ---------- loop ----------
const clock = new THREE.Clock();
const camFocus = player.group.position.clone();
let pan: { to: V3; t: number } | null = null;
let pickT = 0, dropT = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  updateFx(dt);

  // player movement: no slowdown when carrying (research rule 1)
  const kx = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0) + joy.x;
  const kz = (keys.has("s") || keys.has("arrowdown") ? 1 : 0) - (keys.has("w") || keys.has("arrowup") ? 1 : 0) + joy.y;
  const mv = new THREE.Vector3(kx, 0, kz);
  if (mv.length() > 1) mv.normalize();
  pVel.lerp(mv.multiplyScalar(SPEED), Math.min(1, dt * 18));
  const p = player.group.position;
  p.addScaledVector(pVel, dt);
  for (const o of obstacles) { const d = flat(p, o.p), r = o.r + 0.3; if (d < r && d > 0.001) { p.x = o.p.x + (p.x - o.p.x) * r / d; p.z = o.p.z + (p.z - o.p.z) * r / d; } }
  p.x = THREE.MathUtils.clamp(p.x, -6, 8); p.z = THREE.MathUtils.clamp(p.z, -4.8, 7.6);
  player.tick(dt, camera, pVel);
  pStack.update(dt, pVel);

  // pick: walking under a ripe tree harvests automatically
  pickT -= dt;
  for (const t of trees) {
    if (!t.on) continue;
    if (t.ripe < TREE_MAX) { t.regrow -= dt; if (t.regrow <= 0) { t.fruit[t.ripe].visible = true; popIn(t.fruit[t.ripe], 0, 0.35); t.ripe++; t.regrow = 1.6; } }
    if (pickT <= 0 && t.ripe > 0 && !pStack.full && flat(p, t.pos) < 1.3) {
      pickT = 0.12; t.ripe--; t.regrow = Math.max(t.regrow, 1.6);
      const f = t.fruit[t.ripe]; f.visible = false;
      pStack.push("banana", f.getWorldPosition(new THREE.Vector3()));
      squash(t.g, 0.06, 0.2); sfx("pick");
    }
  }
  // unload, filtered by what each zone accepts (research rule 3)
  dropT -= dt;
  if (dropT <= 0) {
    if (stand.open && flat(p, stand.drop) < 1.0 && stand.count < stand.cap) { const f = pStack.take("banana"); if (f) { addToDisplay(stand, f); dropT = 0.07; sfx("drop"); } }
    else if (blender.open && flat(p, blender.zone) < 1.0) {
      if (blender.input < blender.inCap && pStack.count("banana")) { const f = pStack.take("banana"); if (f) { feedBlender(f); dropT = 0.07; sfx("drop"); } }
      else if (blender.output > 0 && !pStack.full) {
        const cup = blender.cups.pop()!; blender.output--; scene.remove(cup);
        pStack.push("smoothie", cup.position.clone()); dropT = 0.1; sfx("pick");
      }
    } else if (bar.open && flat(p, bar.drop) < 1.0 && bar.count < bar.cap) { const f = pStack.take("smoothie"); if (f) { addToDisplay(bar, f); dropT = 0.08; sfx("drop"); } }
  }

  // register: the player (or a cashier) rings up the customer at the front
  const front = register.queue[0];
  const cashier = helpers.some((h) => h.job === "cashier");
  const manned = flat(p, register.zone) < 1.0;
  register.ring.visible = register.open && !cashier;
  if (front?.ready && (manned || cashier)) {
    register.t += dt;
    if (register.t >= (manned ? 0.3 : 0.75)) {
      register.t = 0; register.queue.shift();
      const price = front.want === "banana" ? stand.price : bar.price;
      const from = front.m.group.position.clone().setY(1.2);
      for (let i = 0; i < price / 5; i++) setTimeout(() => registerPile.add(from), i * 70);
      if (front.held) { front.m.group.remove(front.held); front.held = null; }
      front.m.flash("wow", 500); floatText("+$" + price, from.clone().setY(2.1), "#3a7a2a");
      squash(register.group, 0.06, 0.2);
      leave(front, "😍");
    }
  } else register.t = 0;
  starterPile.update(dt); registerPile.update(dt);

  // pads: drain the wallet while standing on them; pan to big ones once affordable (research rule 13)
  for (const pd of pads) {
    wallet -= pd.update(dt, p, wallet, () => p.clone().setY(1.1));
    if (pd.visible && !pd.done && panOnAfford.has(pd) && !panned.has(pd) && wallet >= pd.left) { panned.add(pd); pan = { to: pd.pos.clone(), t: 0 }; }
  }

  spawnT -= dt;
  if (spawnT <= 0) { spawnCustomer(); spawnT = 2.2 + Math.random() * 1.6; }
  updateCustomers(dt);
  updateHelpers(dt);
  updateBlender(dt);

  // camera: high 3/4 follow (idle-arcade framing)
  const focus = p.clone();
  if (pan) {
    pan.t += dt;
    const w = pan.t < 0.5 ? pan.t / 0.5 : pan.t < 1.3 ? 1 : Math.max(0, 1 - (pan.t - 1.3) / 0.5);
    focus.lerp(pan.to, w * w * (3 - 2 * w));
    if (pan.t > 1.8) pan = null;
  }
  camFocus.lerp(focus, Math.min(1, dt * 4));
  trauma = Math.max(0, trauma - dt * 1.4);
  const sh = trauma * trauma * 0.25, n = performance.now() / 40;
  camera.position.set(camFocus.x + Math.sin(n * 1.3) * sh, 13.5 * camDist + Math.sin(n * 1.7) * sh, camFocus.z + 10.5 * camDist);
  camera.lookAt(camFocus.x, 0.6, camFocus.z);
  sun.position.set(camFocus.x - 6, 14, camFocus.z + 8); sun.target.position.copy(camFocus);

  const at = arrowTarget();
  arrow.visible = !!at;
  if (at) arrow.position.set(at.x, 1.25 + Math.abs(Math.sin(performance.now() / 220)) * 0.35, at.z);
  walletEl.textContent = "$" + Math.floor(wallet);
  renderer.render(scene, camera);
}
function loop() { frame(); requestAnimationFrame(loop); }
(window as any).__dbg = { get wallet() { return wallet; }, set wallet(v: number) { wallet = v; }, pads, P, player, stand, bar, blender, register, custs, helpers };
loop();
toast("Grab the cash, then step on the glowing pad");
