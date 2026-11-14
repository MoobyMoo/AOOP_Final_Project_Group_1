// Bananaville feel test v5b (throwaway spike). v5b: push-your-luck jungle runs (Fable 5.2 advisor, 2026-11-14):
// overstack past the safe line, a depth gradient of richer trees, the Peel Gang snatcher you dodge,
// and the Sleeper, a napping gorilla the Shaker can wake. Earlier notes (v3): Built from research/automation, research/idle-arcade,
// research/economy and research/refs/gameplay/NOTES.md:
//  - every link in the chain has a worker role (Picker, Cashier, Runner, Fry Cook, Banker)
//  - workers are visible from the start as locked ghosts; the player stays fastest (70% rule)
//  - goal before source (register, then shelf, then tree), at most a couple of floor pads at a time
//  - customers carry shopping lists, never walk out, and demand beats supply so nobody idles
//  - an Office holds repeatable Player / Staff upgrade pads
// Second product is banana chips from a fryer (deliberately not smoothies). Numbers are ours.
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

// ---------- tuning (our numbers; research/economy pacing targets) ----------
const T = {
  playerSpeed: 6.2, playerCap: 6, pickEvery: 0.35, dropEvery: 0.025,
  price: { banana: 2, chips: 8 } as Record<Kind, number>,
  staffSpeedK: 0.7, staffCap: 6, spawnEvery: 1.0, maxCusts: 18, bunchRegrow: 10, shakePerTree: 3,
  rowHold: [3, 5, 8], // near / mid / deep: depth pays (advisor section 2)
};
let speedMult = 1, priceMult = 1, staffSpeedMult = 1, staffCapBonus = 0;

// ---------- renderer / scene ----------
const canvas = document.getElementById("game") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
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
const plane = (w: number, d: number, color: string, x: number, z: number, y = 0.01) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshToonMaterial({ color }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true; scene.add(m); return m;
};
plane(260, 260, "#8cc86a", 0, 0, 0);
plane(16, 11.8, "#f2dcae", 0.8, 0.6);
plane(120, 3, "#e2bf8c", 0, 8.4, 0.015);
plane(3.8, 4.8, "#f3c9a6", 6.6, 3.7, 0.02); // office rug
const GATE = { x0: 0.8, x1: 3.2, z: -5.4 }; // opening in the north fence
for (let x = -7; x <= 8.75; x += 1.25) if (x < GATE.x0 - 0.2 || x > GATE.x1 + 0.2) scene.add(cyl(0.08, 0.1, 0.8, "#b07a45", x, 0, -5.4, 6));
for (const x of [GATE.x0 - 0.1, GATE.x1 + 0.1]) scene.add(cyl(0.14, 0.16, 1.5, "#8a5a34", x, 0, GATE.z, 8));
for (let z = -5.4; z <= 6.4; z += 1.25) { scene.add(cyl(0.08, 0.1, 0.8, "#b07a45", -7, 0, z, 6)); scene.add(cyl(0.08, 0.1, 0.8, "#b07a45", 8.75, 0, z, 6)); }
scene.add(box(GATE.x0 + 7, 0.1, 0.12, "#c98a4b", (GATE.x0 - 7) / 2, 0.55, -5.4), box(8.75 - GATE.x1, 0.1, 0.12, "#c98a4b", (GATE.x1 + 8.75) / 2, 0.55, -5.4), box(0.12, 0.1, 11.8, "#c98a4b", -7, 0.55, 0.5), box(0.12, 0.1, 11.8, "#c98a4b", 8.75, 0.55, 0.5));
plane(3.2, 34, "#e2bf8c", 2, -22, 0.012); // dirt path from the gate into the jungle
plane(34, 40, "#7dbb5c", 2, -26, 0.006);    // jungle floor, a shade darker than the lawn
for (let i = 0; i < 40; i++) {
  const x = -30 + i * 1.6 + Math.sin(i * 7.3) * 0.9, z = -44 - (i % 4) * 1.8 - Math.abs(Math.sin(i)) * 2;
  scene.add(cyl(0.18, 0.26, 2.4 + (i % 3) * 0.7, "#8a5a34", x, 0, z, 7), ball(1.2 + (i % 4) * 0.25, i % 2 ? "#5fa548" : "#4f9440", x, 2.9 + (i % 3) * 0.7, z));
}
for (let i = 0; i < 26; i++) {
  const z = -40 + i * 1.5, x = (i % 2 ? 15 : -12) + Math.sin(i * 2.1);
  if (z < -7) scene.add(cyl(0.18, 0.26, 2.6, "#8a5a34", x, 0, z, 7), ball(1.5, i % 3 ? "#4f9440" : "#5fa548", x, 3.0, z));
}
for (let i = 0; i < 16; i++) {
  const z = -6 + (i >> 1) * 1.9;
  scene.add(ball(0.9 + (i % 3) * 0.3, "#5aa045", i % 2 ? 11.5 + Math.sin(i) : -10 - Math.cos(i), 0.6, z));
}
{ // the goal on the horizon from minute one
  const g = new THREE.Group(); g.position.set(6, 0, -62);
  g.add(cyl(3.2, 4.2, 6, "#e8b13a", 0, 0, 0, 10));
  const nana = inked(new THREE.TorusGeometry(6, 2.1, 10, 24, Math.PI * 0.85), "#ffd84a", 0.25);
  nana.position.set(-1, 12, 0); nana.rotation.z = Math.PI * 0.12; g.add(nana);
  const wheel = inked(new THREE.TorusGeometry(6, 0.35, 6, 32), "#e8493a", 0.15); wheel.position.set(-16, 8, 4); g.add(wheel);
  g.add(cyl(0.4, 0.4, 8, "#e8493a", -16, 0, 4, 6));
  scene.add(g);
}

// ---------- shared helpers ----------
function canvasSprite(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void, scale: [number, number]) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const x = c.getContext("2d")!; draw(x);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false }));
  s.scale.set(scale[0], scale[1], 1); s.renderOrder = 15;
  return { s, c, x, t };
}
const iconTex = new Map<string, THREE.CanvasTexture>();
function icon(emoji: string, size = 0.6) {
  let t = iconTex.get(emoji);
  if (!t) {
    const { t: tt } = canvasSprite(128, 128, (x) => {
      x.fillStyle = "#fff"; x.strokeStyle = "#2a1a12"; x.lineWidth = 8;
      x.beginPath(); x.arc(64, 64, 54, 0, Math.PI * 2); x.fill(); x.stroke();
      x.font = "64px serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(emoji, 64, 68);
    }, [1, 1]);
    t = tt; iconTex.set(emoji, t);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false }));
  s.scale.setScalar(size); s.renderOrder = 15;
  return s;
}
function zoneRing(at: V3, r = 0.9, color = "#ffffff") {
  const m = new THREE.Mesh(new THREE.RingGeometry(r - 0.09, r, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.copy(at).setY(0.025); m.renderOrder = 1;
  return m;
}
function makeSign(text: string, bg: string, w = 1.7) {
  const c = document.createElement("canvas"); c.width = 512; c.height = 128;
  const x = c.getContext("2d")!;
  x.fillStyle = bg; x.fillRect(0, 0, 512, 128); x.lineWidth = 14; x.strokeStyle = "#2a1a12"; x.strokeRect(7, 7, 498, 114);
  x.fillStyle = "#2a1a12"; x.font = "bold 58px Trebuchet MS"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(text, 256, 68, 480);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.25), new THREE.MeshBasicMaterial({ map: t }));
}
{ const s = makeSign("OFFICE", "#f3c9a6", 1.8); s.rotation.x = -Math.PI / 2; s.position.set(6.6, 0.03, 1.6); scene.add(s); }
let trauma = 0;
const obstacles: { p: V3; r: number }[] = [];
const ICON: Record<Kind, string> = { banana: "🍌", chips: "🍟" };

// ---------- player ----------
const BOSS: Look = { fur: "#c8682c", suit: "#3a3340", tie: "#ff8a2a", hat: "bowler", hatBand: "#ff8a2a", shades: true };
const player = new MonkeyCard(BOSS, 1.7);
player.group.position.set(2.6, 0, 1.4);
scene.add(player.group);
let pAnchorH = 1.62;
const pStack = new Stack(scene, () => player.group.position.clone().add(new THREE.Vector3(0, pAnchorH, -0.55)), T.playerCap);
pStack.over = 2; pStack.enableSafeLine(); // greed: carry up to 2x, but the bananas above the line are loose
let basket: THREE.Object3D | null = null;
let wallet = 0;
const pVel = new THREE.Vector3();

// ---------- trees ----------
type Tree = { g: THREE.Group; pos: V3; ripe: number; regrow: number; fruit: THREE.Object3D[]; on: boolean; row: number; max: number };
function makeTree(pos: V3, max: number): Tree {
  const g = new THREE.Group(); g.position.copy(pos);
  g.add(cyl(0.13, 0.2, 1.5, "#9a6a3e", 0, 0, 0, 8));
  for (let i = 0; i < 6; i++) {
    const leaf = inked(new THREE.ConeGeometry(0.22, 1.1, 4), i % 2 ? "#5fb04a" : "#4f9a3e", 0.03);
    leaf.position.set(0, 1.55, 0); leaf.rotation.set(Math.PI / 2.4, (i / 6) * Math.PI * 2, 0, "YXZ");
    leaf.children.forEach((c) => c.translateY(0.45));
    g.add(leaf);
  }
  const fruit: THREE.Object3D[] = [];
  for (let i = 0; i < max; i++) {
    const ring = i < 5 ? 0 : 1, n = ring ? max - 5 : Math.min(5, max), a = ((ring ? i - 5 : i) / n) * Math.PI * 2 + ring * 0.6;
    const f = makeItem("banana");
    f.position.set(Math.cos(a) * (0.34 + ring * 0.1), 1.3 - (i % 2) * 0.14 - ring * 0.22, Math.sin(a) * (0.34 + ring * 0.1));
    g.add(f); fruit.push(f);
  }
  if (max >= 8) g.scale.setScalar(1.25); // deep trees read bigger and richer
  return { g, pos: pos.clone(), ripe: max, regrow: 0, fruit, on: false, row: 0, max };
}
// clumps of three inside one Shaker reach: near (3 each) ~2.3 s out, mid (5) ~3.7 s, deep (8) ~5 s.
// Pickers never work the deep row: the richest trees stay the boss's (advisor section 3)
const ROWS: [number, number][][] = [
  [[0.4, -15.6], [3.6, -15.6], [2, -17.8], [-5.2, -14.8], [-2.6, -15.2], [-4, -17.2]],
  [[-7.6, -23], [-4.6, -23], [-6.1, -25.4], [6.6, -23], [9.6, -23.4], [8.1, -25.7]],
  [[-4.6, -31.6], [-1.4, -31.6], [-3, -34.2], [5.4, -31], [8.6, -31.4], [7, -33.8]],
];
const trees: Tree[] = [];
ROWS.forEach((row, r) => row.forEach(([x, z]) => { const t = makeTree(V(x, z), T.rowHold[r]); t.row = r; t.on = true; scene.add(t.g); obstacles.push({ p: t.pos, r: 0.3 }); trees.push(t); }));
// the jungle gets denser and darker the deeper you go (bushes and ferns, off the path)
for (let i = 0; i < 70; i++) {
  const z = -9 - ((i * 37) % 31), x = -12 + ((i * 53) % 27) + Math.sin(i * 2.7);
  if (Math.abs(x - 2) < 2.2 || trees.some((t) => flat(t.pos, V(x, z)) < 1.6)) continue;
  const deep = Math.min(1, Math.max(0, (-z - 12) / 22));
  scene.add(ball(0.35 + (i % 4) * 0.12 + deep * 0.25, deep > 0.5 ? (i % 2 ? "#3f8a34" : "#357a2c") : (i % 2 ? "#5aa045" : "#4f9a3e"), x, 0.2, z));
}
// windfall bananas on the path: nothing on the route is ever empty (FORMULA section 2)
const windfalls = [V(2, -9), V(1, -12), V(3, -14)].map((at) => ({ at, o: null as THREE.Object3D | null, t: 0 }));
function updateWindfalls(dt: number, p: V3) {
  for (const w of windfalls) {
    if (!gate.open) continue;
    if (!w.o) { w.t -= dt; if (w.t <= 0) { w.o = makeItem("banana"); w.o.position.copy(w.at).setY(0.15); w.o.rotation.z = 1.2; scene.add(w.o); popIn(w.o, 0, 0.3); } continue; }
    w.o.rotation.y += dt * 2;
    if (!pStack.full && flat(p, w.at) < 1.0) { scene.remove(w.o); w.o = null; w.t = 20; pStack.push("banana", w.at.clone().setY(0.3)); sfx("pick"); act("pick", 1); }
  }
}
function plantTree(t: Tree) {
  t.on = true; scene.add(t.g); popIn(t.g, 0, 0.5);
  burst(t.pos.clone().setY(1), 14, "#7cc24f");
  obstacles.push({ p: t.pos, r: 0.3 });
}
function pickFrom(t: Tree, into: Stack) {
  t.ripe--;
  t.regrow = T.bunchRegrow; // the whole bunch grows back ~10 s after the last pick (advisor: bunch regrow)
  const f = t.fruit[t.ripe]; f.visible = false;
  into.push("banana", f.getWorldPosition(new THREE.Vector3()));
}

// ---------- cash piles ----------
class CashPile {
  bills: { o: THREE.Object3D; v: number }[] = [];
  private t = 0;
  constructor(public origin: V3) {}
  slot(i: number) { return this.origin.clone().add(V((i % 3) * 0.46 - 0.46, (Math.floor(i / 3) % 3) * 0.27 - 0.27, 0.04 + Math.floor(i / 9) * 0.075)); }
  add(from: V3, v: number) {
    const o = makeBill(), i = this.bills.length;
    this.bills.push({ o, v });
    o.rotation.y = (Math.random() - 0.5) * 0.25;
    arc(o, from, () => this.slot(i), 0.22, 1.1, () => { squash(o, 0.3, 0.18); sfx("sell"); });
  }
  place(v: number) { const o = makeBill(); o.position.copy(this.slot(this.bills.length)); scene.add(o); this.bills.push({ o, v }); }
  /** collector walks over the pile: bills fly to them and land in the wallet */
  collect(dt: number, who: V3, radius: number, every: number) {
    if (!this.bills.length || flat(who, this.origin) > radius) return;
    this.t -= dt;
    while (this.t <= 0 && this.bills.length) {
      this.t += every;
      const b = this.bills.pop()!;
      if (who === player.group.position) act("scoop");
      arc(b.o, b.o.position.clone(), () => who.clone().setY(1.0), 0.18, 1.0, () => { scene.remove(b.o); wallet += b.v; sfx("cash"); bumpWallet(); });
    }
  }
}
const starterPile = new CashPile(V(2.6, 3.0));
for (let i = 0; i < 5; i++) starterPile.place(5);

// ---------- shelves ----------
type Shelf = {
  kind: Kind; group: THREE.Group; pos: V3; drop: V3; cap: number; count: number; items: THREE.Object3D[];
  slot: (i: number) => V3; spot: (i: number) => V3; queue: Cust[]; open: boolean; ring: THREE.Mesh;
};
function makeShelf(kind: Kind, pos: V3, cap: number, cols: number, color: string, awning: string, label: string): Shelf {
  const g = new THREE.Group(); g.position.copy(pos);
  g.add(box(2.4, 0.8, 1.1, color, 0, 0, 0), box(2.5, 0.08, 1.2, "#8a5a34", 0, 0.8, 0));
  for (const x of [-1.15, 1.15]) g.add(cyl(0.05, 0.05, 2.1, "#8a5a34", x, 0, -0.5, 6));
  for (let i = 0; i < 6; i++) g.add(box(0.41, 0.05, 1.4, i % 2 ? "#fff6e6" : awning, -1.03 + i * 0.41, 2.05, 0.05));
  const sign = makeSign(label, "#ffe066"); sign.position.set(0, 0.42, 0.57); g.add(sign);
  return {
    kind, group: g, pos, drop: pos.clone().add(V(0, -1.25)), cap, count: 0, items: [], queue: [], open: false,
    ring: zoneRing(pos.clone().add(V(0, -1.25)), 0.85),
    // items fill the counter top in rows, then layer upward
    slot: (i) => pos.clone().add(V(-0.9 + (i % cols) * (1.8 / (cols - 1)), -0.22 + (Math.floor(i / cols) % 2) * 0.44, 0.9 + Math.floor(i / (cols * 2)) * 0.2)),
    spot: (i) => pos.clone().add(V(0, 1.2 + i * 0.85)),
  };
}
const bananaShelf = makeShelf("banana", V(2.2, -1.9), 40, 5, "#c98a4b", "#e8493a", "BANANAS");
const chipsShelf = makeShelf("chips", V(-1.4, -1.9), 24, 3, "#e8a06a", "#ffcc3d", "BANANA CHIPS");
const shelfFor = (k: Kind) => (k === "banana" ? bananaShelf : chipsShelf);
function openShelf(s: Shelf) {
  s.open = true; scene.add(s.group, s.ring);
  s.group.children.forEach((c, i) => popIn(c, i * 0.035));
  burst(s.pos.clone().setY(1.2), 20, "#fff6e6");
  obstacles.push({ p: s.pos, r: 1.1 });
  trauma = Math.min(1, trauma + 0.35);
}
function stockShelf(s: Shelf, from: V3) {
  const i = s.count++;
  const o = makeItem(s.kind);
  s.items.push(o);
  arc(o, from, () => s.slot(i), 0.18, 0.8, () => squash(o, 0.3, 0.2));
}

// ---------- register (there from the start: the goal comes before the source) ----------
const register = {
  pos: V(5.0, -0.6), zone: V(5.0, -1.8), queue: [] as Cust[], t: 0, group: new THREE.Group(),
  ring: zoneRing(V(5.0, -1.8), 0.85, "#ffe066"), pile: new CashPile(V(6.7, -0.8)),
};
register.group.position.copy(register.pos);
register.group.add(box(1.5, 0.85, 0.9, "#8a5a34", 0, 0, 0), box(0.6, 0.35, 0.45, "#3a3340", 0, 0.85, -0.05), box(0.5, 0.06, 0.3, "#8fd18a", 0, 1.2, 0.05));
scene.add(register.group, register.ring);
obstacles.push({ p: register.pos, r: 0.75 });
const regSpot = (i: number) => register.pos.clone().add(V(0, 1.2 + i * 0.8));

// ---------- fryer: 2 bananas in -> 1 bag of banana chips out; free trash bin beside it ----------
const fryer = {
  pos: V(-4.4, 1.6), zone: V(-3.0, 1.6), open: false, input: 0, inCap: 30, output: 0, outCap: 24, prog: 0,
  group: new THREE.Group(), vat: cyl(0.55, 0.5, 0.3, "#e8a417", 0, 0.82, 0, 14), bar: box(1, 0.08, 0.08, "#8fd18a", 0, 2.0, 0.4),
  cups: [] as THREE.Object3D[], hopper: [] as THREE.Object3D[], ring: zoneRing(V(-3.0, 1.6), 0.85, "#ffcc3d"),
  recipe: canvasSprite(256, 112, (x) => {
    x.fillStyle = "#fff"; x.strokeStyle = "#2a1a12"; x.lineWidth = 8;
    x.beginPath(); x.roundRect(6, 6, 244, 100, 30); x.fill(); x.stroke();
    x.font = "52px serif"; x.textBaseline = "middle"; x.fillStyle = "#2a1a12"; x.fillText("🍌🍌 ➜ 🍟", 22, 60);
  }, [1.6, 0.7]).s,
};
fryer.group.position.copy(fryer.pos);
fryer.group.add(box(1.5, 0.82, 1.1, "#c7ccd4", 0, 0, 0), fryer.vat, cyl(0.06, 0.06, 0.9, "#3a3340", 0.5, 0.82, -0.3, 6), fryer.bar);
fryer.recipe.position.set(0, 2.6, 0); fryer.group.add(fryer.recipe);
const chipSlot = (i: number) => fryer.pos.clone().add(V(-0.45 + (i % 4) * 0.3, 0.05 + Math.floor(i / 8) * 0.3, 0.85 + (Math.floor(i / 4) % 2) * 0.3));
const trash = { pos: V(-5.4, 3.6), zone: V(-4.2, 3.6), group: new THREE.Group(), ring: zoneRing(V(-4.2, 3.6), 0.7, "#c0392b"), open: false };
trash.group.position.copy(trash.pos); trash.group.add(cyl(0.4, 0.32, 0.8, "#5f6873", 0, 0, 0, 12), cyl(0.44, 0.44, 0.08, "#3a3340", 0, 0.8, 0, 12));
function feedFryer(from: V3) {
  const o = makeItem("banana"), i = fryer.input++;
  fryer.hopper.push(o);
  arc(o, from, () => fryer.pos.clone().add(V(-0.5 + (i % 4) * 0.33, 0.85 + Math.floor(i / 8) * 0.2, -0.35 - (Math.floor(i / 4) % 2) * 0.25)), 0.18, 0.8);
}
function updateFryer(dt: number) {
  if (!fryer.open) return;
  if (fryer.input >= 2 && fryer.output < fryer.outCap) {
    fryer.prog += dt / 0.5;
    fryer.vat.position.y = 0.82 + Math.sin(performance.now() / 50) * 0.02;
    if (fryer.prog >= 1) {
      fryer.prog = 0; fryer.input -= 2;
      for (let k = 0; k < 2; k++) scene.remove(fryer.hopper.pop()!);
      const bag = makeItem("chips"), i = fryer.output++;
      fryer.cups.push(bag);
      arc(bag, fryer.pos.clone().setY(1.4), () => chipSlot(i), 0.25, 0.9, () => squash(bag, 0.3, 0.2));
      squash(fryer.vat, 0.15, 0.25); sfx("drop"); burst(fryer.pos.clone().setY(1.2), 5, "#ffe7a0", 0.5);
    }
  }
  fryer.bar.scale.x = Math.max(0.001, fryer.prog);
}
function takeChips(into: Stack) {
  const bag = fryer.cups.pop()!; fryer.output--; scene.remove(bag);
  into.push("chips", bag.position.clone());
}

// ---------- conveyor belt: grove -> fryer, a machine that replaces a worker ----------
const BELT = [V(-2.6, -3.2), V(-3.6, -1.6), V(-4.4, 0.4)];
const belt = { open: false, group: new THREE.Group(), t: 0, ghost: new THREE.Group() };
function beltPiece(a: V3, b: V3, color: string, into: THREE.Group, opacity = 1) {
  const len = flat(a, b), mid = a.clone().lerp(b, 0.5);
  const m = box(0.55, 0.12, len, color, mid.x, 0.18, mid.z);
  m.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
  if (opacity < 1) m.traverse((o) => { const mm = (o as THREE.Mesh).material as THREE.Material | undefined; if (mm) { const c = mm.clone(); c.transparent = true; c.opacity = opacity; (o as THREE.Mesh).material = c; } });
  into.add(m);
}
for (let i = 0; i < BELT.length - 1; i++) { beltPiece(BELT[i], BELT[i + 1], "#3a3340", belt.group); beltPiece(BELT[i], BELT[i + 1], "#9a9a9a", belt.ghost, 0.45); }
function updateBelt(dt: number) {
  if (!belt.open) return;
  belt.t -= dt;
  if (belt.t > 0 || fryer.input >= fryer.inCap) return;
  const t = trees.filter((tr) => tr.on && tr.ripe > 0 && tr.row < 2).sort((a, b) => b.ripe - a.ripe)[0];
  if (!t) return;
  belt.t = 0.32;
  t.ripe--; t.regrow = T.bunchRegrow; t.fruit[t.ripe].visible = false;
  const o = makeItem("banana"); scene.add(o);
  const path = [t.fruit[t.ripe].getWorldPosition(new THREE.Vector3()), ...BELT.map((b) => b.clone().setY(0.36))];
  tween(1.5, (k) => {
    const f = k * (path.length - 1), i = Math.min(path.length - 2, Math.floor(f));
    o.position.copy(path[i]).lerp(path[i + 1], f - i);
  }, () => { scene.remove(o); feedFryer(BELT[BELT.length - 1].clone().setY(0.4)); });
}

// ---------- input ----------
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

// ---------- customers: shopping lists, patient queues (they never walk out) ----------
const FURS = ["#c8682c", "#a8582a", "#d47a3a", "#b86a36"];
const SUITS = ["#4a8fd1", "#e8493a", "#8fd18a", "#ffb04a", "#b07ad1", "#5ac0b5"];
type Need = { kind: Kind; n: number };
type Cust = {
  m: MonkeyCard; list: Need[]; state: "shop" | "toReg" | "leave"; shelf: Shelf | null; grabT: number;
  bub: ReturnType<typeof canvasSprite>; held: THREE.Object3D[]; owed: number; exitX: number; vel: V3; ready: boolean;
};
const custs: Cust[] = [];
let spawnT = 1;
function drawList(c: Cust) {
  const x = c.bub.x; x.clearRect(0, 0, 256, 112);
  x.fillStyle = "#fff"; x.strokeStyle = "#2a1a12"; x.lineWidth = 8;
  x.beginPath(); x.roundRect(6, 6, 244, 84, 26); x.fill(); x.stroke();
  x.beginPath(); x.moveTo(112, 88); x.lineTo(128, 108); x.lineTo(144, 88); x.fill();
  const left = c.list.filter((l) => l.n > 0);
  x.fillStyle = "#2a1a12"; x.textBaseline = "middle";
  if (!left.length) { x.font = "52px serif"; x.textAlign = "center"; x.fillText(c.state === "leave" ? "😍" : "💵", 128, 50); }
  else left.forEach((l, i) => {
    const cx = left.length === 1 ? 96 : 30 + i * 112;
    x.font = "48px serif"; x.textAlign = "left"; x.fillText(ICON[l.kind], cx, 52);
    x.font = "bold 40px Trebuchet MS"; x.fillText("×" + l.n, cx + 54, 54);
  });
  c.bub.t.needsUpdate = true;
}
function spawnCustomer() {
  if (!bananaShelf.open || custs.length >= T.maxCusts) return;
  // pick an order whose line is short, so no single shelf soaks up every customer
  const bq = bananaShelf.queue.length, cq = chipsShelf.queue.length;
  const list: Need[] = [];
  const chipsWaiting = custs.filter((c) => c.state === "shop" && c.list.some((l) => l.kind === "chips" && l.n > 0)).length;
  if (chipsShelf.open && cq < 5 && (fryer.open || chipsWaiting < 2) && (bq >= 6 || Math.random() < 0.5)) {
    list.push({ kind: "chips", n: 1 + Math.floor(Math.random() * 3) });
    if (bq < 6 && Math.random() < 0.4) list.push({ kind: "banana", n: 2 + Math.floor(Math.random() * 3) });
  } else if (bq < 6) list.push({ kind: "banana", n: 2 + Math.floor(Math.random() * 4) });
  else return;
  const look: Look = { fur: FURS[Math.floor(Math.random() * 4)], suit: SUITS[Math.floor(Math.random() * 6)], hat: Math.random() < 0.5 ? "cap" : "none", hatBand: SUITS[Math.floor(Math.random() * 6)] };
  const m = new MonkeyCard(look, 1.3 + Math.random() * 0.2);
  const fromLeft = Math.random() < 0.5;
  m.group.position.set(fromLeft ? -16 : 18, 0, 8.4);
  scene.add(m.group);
  const bub = canvasSprite(256, 112, () => {}, [1.05, 0.46]);
  bub.s.position.set(0, 2.15, 0); m.group.add(bub.s);
  const c: Cust = { m, list, state: "shop", shelf: null, grabT: 0, bub, held: [], owed: 0, exitX: fromLeft ? 18 : -16, vel: new THREE.Vector3(), ready: false };
  drawList(c);
  custs.push(c);
}
function moveTo(pos: V3, finalTarget: V3, speed: number, dt: number, vel: V3) {
  const target = route(pos, finalTarget), via = target !== finalTarget;
  const d = target.clone().sub(pos); d.y = 0;
  const l = d.length();
  if (l < 0.04) { vel.set(0, 0, 0); return true; }
  const step = Math.min(l, speed * dt);
  vel.copy(d).multiplyScalar(speed / l);
  pos.addScaledVector(d, step / l);
  return !via && l - step < 0.05;
}
/** walk along the road until lined up, then straight up into place */
function walkIn(p: V3, target: V3, speed: number, dt: number, vel: V3) {
  const onRoad = Math.abs(p.z - 8.4) < 0.2 && Math.abs(p.x - target.x) > 0.3;
  return moveTo(p, onRoad ? V(target.x, 8.4) : target, speed, dt, vel) && !onRoad;
}
function updateCustomers(dt: number) {
  for (const c of custs) {
    const p = c.m.group.position;
    if (c.state === "shop") {
      const need = c.list.find((l) => l.n > 0)!;
      const s = shelfFor(need.kind);
      if (c.shelf !== s) { c.shelf = s; s.queue.push(c); }
      const i = s.queue.indexOf(c);
      c.bub.s.visible = i < 3;
      const arrived = walkIn(p, s.spot(i), 3.4, dt, c.vel);
      if (i === 0 && arrived && s.count > 0) {
        c.grabT -= dt;
        if (c.grabT <= 0) {
          c.grabT = 0.11;
          const o = s.items.pop()!; s.count--;
          const h = c.held.length; c.held.push(o);
          arc(o, o.position.clone(), () => c.m.group.position.clone().setY(1.62 + h * 0.2), 0.2, 0.7, () => { c.m.group.add(o); o.position.set(0, 1.62 + h * 0.2, 0); });
          need.n--; c.owed += T.price[need.kind] * priceMult; drawList(c); sfx("pick");
          if (need.n === 0) {
            s.queue.shift(); c.shelf = null;
            if (!c.list.some((l) => l.n > 0)) { c.state = "toReg"; register.queue.push(c); c.m.flash("wow", 500); drawList(c); }
          }
        }
      }
    } else if (c.state === "toReg") {
      const i = register.queue.indexOf(c);
      c.bub.s.visible = i < 3;
      c.ready = walkIn(p, regSpot(i), 3.4, dt, c.vel) && i === 0;
    } else {
      c.bub.s.visible = true;
      moveTo(p, Math.abs(p.z - 8.4) > 0.2 ? V(p.x, 8.4) : V(c.exitX, 8.4), 3.6, dt, c.vel);
    }
    c.m.tick(dt, camera, c.vel);
  }
  for (let i = custs.length - 1; i >= 0; i--) {
    const c = custs[i];
    if (c.state === "leave" && Math.abs(c.m.group.position.x - c.exitX) < 0.3) { scene.remove(c.m.group); c.m.dispose(); custs.splice(i, 1); }
  }
}
function checkout(c: Cust) {
  const from = c.m.group.position.clone().setY(1.3);
  const bills = Math.max(1, Math.round(c.owed / 5)), each = c.owed / bills;
  for (let i = 0; i < bills; i++) setTimeout(() => register.pile.add(from, each), i * 60);
  c.held.forEach((o) => c.m.group.remove(o)); c.held = [];
  floatText("+$" + Math.round(c.owed), from.clone().setY(2.2), "#3a7a2a");
  c.state = "leave"; drawList(c); c.m.flash("wow", 600);
  squash(register.group, 0.06, 0.2);
}

// ---------- workers: one job each, slower than the player (research/automation) ----------
type Role = "picker" | "cashier" | "runner" | "cook" | "banker";
const ROLE: Record<Role, { look: Look; icon: string; name: string }> = {
  picker: { look: { fur: "#d47a3a", suit: "#8fd18a", hat: "cap", hatBand: "#5aa045", apron: "#fff6e6" }, icon: "🍌", name: "Picker" },
  cashier: { look: { fur: "#b86a36", suit: "#4a8fd1", hat: "cap", hatBand: "#ffe066", tie: "#ffe066" }, icon: "💵", name: "Cashier" },
  runner: { look: { fur: "#c8682c", suit: "#ffb04a", hat: "cap", hatBand: "#e8493a" }, icon: "🍟", name: "Runner" },
  cook: { look: { fur: "#a8582a", suit: "#fff6e6", hat: "chef", apron: "#e8493a" }, icon: "🔥", name: "Fry Cook" },
  banker: { look: { fur: "#8a5a34", suit: "#3a3340", hat: "bowler", hatBand: "#8fd18a", tie: "#8fd18a" }, icon: "🏦", name: "Banker" },
};
type Worker = { role: Role; m: MonkeyCard; stack: Stack; vel: V3; t: number; target: Tree | null; mode: "fetch" | "deliver"; home: V3; row: number };
const workers: Worker[] = [];
const staffSpeed = () => T.playerSpeed * T.staffSpeedK * staffSpeedMult;
const hasRole = (r: Role) => workers.some((w) => w.role === r);
function hire(role: Role, at: V3) {
  const m = new MonkeyCard(ROLE[role].look, 1.45);
  m.group.position.copy(at);
  const tag = icon(ROLE[role].icon, 0.45); tag.position.set(0, 1.85, 0); m.group.add(tag);
  scene.add(m.group); popIn(m.pivot, 0, 0.5);
  burst(at.clone().setY(1), 18, "#8fd18a");
  workers.push({ role, m, stack: new Stack(scene, () => m.group.position.clone().add(new THREE.Vector3(0, 1.42, -0.5)), T.staffCap + staffCapBonus), vel: new THREE.Vector3(), t: 0, target: null, mode: "fetch", home: at.clone(), row: Math.min(1, workers.filter((w) => w.role === role).length) });
  floatText(ROLE[role].name + " hired!", at.clone().setY(2.4), "#3a7a2a", 24);
  ghosts.get(role)?.remove(); ghosts.delete(role);
}
function nearestRipe(p: V3, row?: number, maxRow = 2) { return trees.filter((t) => t.on && t.ripe > 0 && t.row <= maxRow && (row === undefined || t.row === row)).sort((a, b) => flat(a.pos, p) - flat(b.pos, p))[0] ?? null; }
/** route through the gate when the target is on the other side of the north fence */
function route(p: V3, target: V3): V3 {
  const pin = p.z > GATE.z, tin = target.z > GATE.z;
  if (pin === tin) return target;
  const gx = (GATE.x0 + GATE.x1) / 2, inGap = p.x > GATE.x0 + 0.25 && p.x < GATE.x1 - 0.25;
  if (inGap && Math.abs(p.z - GATE.z) < 1.4) return V(gx, GATE.z + (pin ? -1.6 : 1.6));
  return V(gx, GATE.z + (pin ? 1.0 : -1.0));
}
function updateWorkers(dt: number) {
  for (const w of workers) {
    const p = w.m.group.position, sp = staffSpeed();
    w.stack.cap = T.staffCap + staffCapBonus;
    w.t -= dt;
    if (w.role === "picker" || w.role === "cook") {
      // pickers stock the banana shelf; the cook keeps the fryer fed (one destination each)
      const dest = w.role === "picker" ? { drop: bananaShelf.drop, room: bananaShelf.open && bananaShelf.count < bananaShelf.cap, put: (f: V3) => stockShelf(bananaShelf, f) }
        : { drop: fryer.zone, room: fryer.open && fryer.input < fryer.inCap, put: (f: V3) => feedFryer(f) };
      if (w.mode === "fetch") {
        if (!w.target || w.target.ripe === 0) w.target = nearestRipe(p, w.role === "picker" ? w.row : undefined, 1) ?? nearestRipe(p, undefined, 1);
        if (w.stack.full || (!w.target && w.stack.size)) w.mode = "deliver";
        else if (w.target) { if (moveTo(p, w.target.pos.clone().add(V(0.6, 0.6)), sp, dt, w.vel) && w.t <= 0) { w.t = 0.3; pickFrom(w.target, w.stack); } }
        else moveTo(p, w.home, sp, dt, w.vel);
      } else {
        if (!w.stack.size) w.mode = "fetch";
        else if (!dest.room) moveTo(p, dest.drop.clone().add(V(0.7, 0.3)), sp, dt, w.vel);
        else if (moveTo(p, dest.drop.clone().add(V(0.5, 0)), sp, dt, w.vel) && w.t <= 0) { w.t = 0.12; const f = w.stack.take("banana"); if (f) { dest.put(f); sfx("drop"); } }
      }
    } else if (w.role === "runner") {
      // fryer output -> chips shelf
      if (w.mode === "fetch") {
        if (w.stack.full || (w.stack.size && fryer.output === 0)) w.mode = "deliver";
        else if (moveTo(p, fryer.zone.clone().add(V(0.5, 0.5)), sp, dt, w.vel) && w.t <= 0 && fryer.output > 0) { w.t = 0.16; takeChips(w.stack); }
      } else {
        if (!w.stack.size) w.mode = "fetch";
        else if (moveTo(p, chipsShelf.drop.clone().add(V(0.5, 0)), sp, dt, w.vel) && w.t <= 0 && chipsShelf.count < chipsShelf.cap) { w.t = 0.12; const f = w.stack.take("chips"); if (f) { stockShelf(chipsShelf, f); sfx("drop"); } }
      }
    } else if (w.role === "cashier") moveTo(p, register.zone.clone().add(V(0.55, -0.15)), sp, dt, w.vel);
    else if (w.role === "banker") {
      if (register.pile.bills.length >= 3) { moveTo(p, register.pile.origin.clone().add(V(0, -0.5)), sp, dt, w.vel); register.pile.collect(dt, p, 0.9, 0.08); }
      else moveTo(p, w.home, sp, dt, w.vel);
    }
    w.stack.update(dt, w.vel);
    w.m.tick(dt, camera, w.vel);
  }
}

// ---------- locked ghosts: every job you can automate is visible before you can afford it ----------
class Ghost {
  m: MonkeyCard;
  constructor(public role: Role, public at: V3) {
    const look = { ...ROLE[role].look, fur: "#8d8d8d", suit: "#a5a5a5", hatBand: "#bdbdbd", apron: ROLE[role].look.apron ? "#cfcfcf" : undefined, tie: undefined };
    this.m = new MonkeyCard(look, 1.45);
    (this.m.plane.material as THREE.MeshBasicMaterial).opacity = 0.55;
    this.m.group.position.copy(at);
    const lock = icon("🔒", 0.42); lock.position.set(0, 1.85, 0); this.m.group.add(lock);
    const role_ = icon(ROLE[role].icon, 0.38); role_.position.set(0.42, 1.55, 0); this.m.group.add(role_);
  }
  show() { if (!this.m.group.parent) { scene.add(this.m.group); popIn(this.m.pivot, 0, 0.4); } }
  remove() { scene.remove(this.m.group); }
}
const ghosts = new Map<Role, Ghost>();
const HIRE_AT: Record<Role, V3> = { picker: V(3.9, -3.9), cashier: V(6.6, -2.2), runner: V(-1.4, 0.6), cook: V(-4.4, 0.0), banker: V(7.9, 0.4) };
(Object.keys(HIRE_AT) as Role[]).filter((r) => r !== "cook").forEach((r) => ghosts.set(r, new Ghost(r, HIRE_AT[r])));

// ---------- HUD ----------
const walletEl = document.getElementById("wallet")!;
const goalText = document.getElementById("goaltext")!, goalFill = document.getElementById("goalfill") as HTMLElement;
function bumpWallet() { walletEl.classList.remove("bump"); void walletEl.offsetWidth; walletEl.classList.add("bump"); }
function toast(msg: string) { const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.getElementById("toasts")!.appendChild(t); setTimeout(() => t.remove(), 3400); }

// ---------- the gate: closed until the shelf exists, then it swings open onto the jungle ----------
const gate = { open: false, door: box(GATE.x1 - GATE.x0 - 0.2, 1.1, 0.12, "#b07a45", (GATE.x0 + GATE.x1) / 2, 0, GATE.z) };
scene.add(gate.door);
function openGate() {
  gate.open = true;
  tween(0.6, (k) => { gate.door.position.y = -1.2 * k; }, () => scene.remove(gate.door));
  pan = { to: CAMP.clone().setZ(CAMP.z + 8), t: 0 }; // show the gang's camp once (advisor: gate opens, camera shows the sign)
}

// ---------- Banana Shaker: the briefcase slam shakes every tree in reach (gathering turns into mowing) ----------
let shaker = false, shakerT = 0;
function updateShaker(dt: number, p: V3) {
  shakerT -= dt;
  if (!shaker || shakerT > 0 || pStack.full) return;
  const near = trees.filter((t) => t.ripe > 0 && flat(t.pos, p) < 3.5);
  if (near.reduce((a, t) => a + t.ripe, 0) < 3) return; // no "SHAKE! +1": only slam for a real haul
  shakerT = 0.9;
  let n = 0;
  for (const t of near) { for (let k = 0; k < T.shakePerTree && t.ripe > 0 && !pStack.full; k++) { pickFrom(t, pStack); n++; } squash(t.g, 0.14, 0.25); }
  if (near.some((t) => t.row === 2)) sleeperNoise(1); // every slam in the deep row pops one of the Sleeper's Z's
  squash(player.body, 0.25, 0.25); burst(p.clone().setY(0.2), 12, "#c9a46a", 0.7); trauma = Math.min(1, trauma + 0.15);
  sfx("pick"); floatText("SHAKE! +" + n, p.clone().setY(2.6), "#8a5a34", 24); act("shake", n);
}

// ---------- bananas on the ground: spilled loads you can grab back for a few seconds ----------
const ground: { o: THREE.Object3D; at: V3; t: number }[] = [];
function dropGround(from: V3, at: V3, life = 8) {
  const o = makeItem("banana"), g = { o, at: at.clone().setY(0.15), t: life };
  ground.push(g);
  arc(o, from, () => g.at, 0.35, 1.4, () => { o.rotation.z = 1.2; squash(o, 0.3, 0.2); });
}
function removeGround(i: number) { scene.remove(ground[i].o); ground.splice(i, 1); }
function updateGround(dt: number, p: V3) {
  for (let i = ground.length - 1; i >= 0; i--) {
    const g = ground[i]; g.t -= dt;
    g.o.visible = g.t > 2 || Math.sin(g.t * 22) > -0.3; // blinks for its last 2 s
    if (g.t <= 0) { removeGround(i); continue; }
    if (!pStack.full && flat(p, g.at) < 1.0 && g.t < 7.6) { pStack.push("banana", g.at); removeGround(i); sfx("pick"); act("pick", 1); log.recovered++; }
  }
}

// ---------- play log: what a human session actually did (posted to the dev server, read by the lead) ----------
const log = {
  id: Math.random().toString(36).slice(2, 8), started: new Date().toISOString(),
  hauls: 0, haulBananas: 0, maxLoose: 0, trips: 0,
  snatchTries: 0, dodged: 0, snatched: 0, bonks: 0, stashTaken: 0,
  wakes: 0, charges: 0, chargeHits: 0, scattered: 0, eaten: 0, treeRams: 0, recovered: 0,
  events: [] as { t: number; e: string }[],
};
function ev(e: string) { log.events.push({ t: Math.round(gameT), e }); }

// ---------- danger telegraph: a stripe on the ground that tracks you, then locks ----------
function makeStripe(color: string, w: number) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 1), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
  m.geometry.translate(0, 0.5, 0); m.rotation.x = Math.PI / 2; m.renderOrder = 3; // +y of the plane points along the holder's +z
  const holder = new THREE.Group(); holder.add(m); holder.position.y = 0.04;
  return { holder, mat: m.material as THREE.MeshBasicMaterial, mesh: m };
}
function aimStripe(st: ReturnType<typeof makeStripe>, from: V3, dir: V3, len: number, locked: boolean, t: number) {
  st.holder.position.set(from.x, 0.04, from.z);
  st.holder.rotation.y = Math.atan2(dir.x, dir.z);
  st.mesh.scale.y = len;
  st.mat.opacity = locked ? 0.8 : 0.35 + Math.abs(Math.sin(t * 18)) * 0.25;
}

// ---------- the Peel Gang snatcher: stalks you, telegraphs a lunge, and you sidestep it ----------
const CAMP = V(11, -37);
{ // the gang's knock-off stand, visible from the gate (the threat is shown before it hits)
  const g = new THREE.Group(); g.position.copy(CAMP);
  g.add(box(2.2, 0.8, 1, "#7a5a3a", 0, 0, 0), box(2.3, 0.08, 1.1, "#5a3f28", 0, 0.8, 0));
  const sign = makeSign("TOTALLY LEGIT BANANAS", "#e0d6c0", 2.6); sign.position.set(0, 1.7, 0); g.add(sign);
  g.add(cyl(0.05, 0.05, 1.7, "#5a3f28", -1, 0, 0, 6), cyl(0.05, 0.05, 1.7, "#5a3f28", 1, 0, 0, 6));
  scene.add(g); obstacles.push({ p: CAMP, r: 1.1 });
}
const stash = { count: 0, items: [] as THREE.Object3D[], t: 0 };
function addToStash(n: number) {
  for (let i = 0; i < n; i++) { const o = makeItem("banana"), k = stash.count++; o.position.copy(CAMP).add(V(-0.8 + (k % 6) * 0.32, 0, 0.1 + Math.floor(k / 6) * 0.05)).setY(0.9 + Math.floor(k / 12) * 0.12); scene.add(o); stash.items.push(o); }
}
/** walk up to the gang's stand and take your bananas back (100% recoverable) */
function updateStash(dt: number, p: V3) {
  stash.t -= dt;
  if (!stash.count || pStack.full || flat(p, CAMP) > 2.2 || stash.t > 0) return;
  stash.t = 0.08; stash.count--;
  const o = stash.items.pop()!; scene.remove(o);
  pStack.push("banana", o.position.clone()); sfx("pick"); act("pick", 1); log.stashTaken++;
  if (!stash.count) floatText("Got it all back!", CAMP.clone().setY(2.6), "#3a7a2a", 22);
}
const BUSHES = [V(-5, -19), V(8, -19), V(-10, -29), V(13, -28)];
for (const b of BUSHES) scene.add(ball(1.1, "#3f8a34", b.x, 0.7, b.z - 0.6), ball(0.8, "#4f9a3e", b.x + 0.8, 0.5, b.z - 0.4));
const BANDIT: Look = { fur: "#8a5a34", suit: "#3a3340", hat: "none", mask: true, stripes: "#fff6e6" };
type BanditState = "hide" | "stalk" | "warn" | "dash" | "flee" | "dizzy" | "home";
const bandit = {
  m: new MonkeyCard(BANDIT, 1.3), state: "hide" as BanditState, t: 0, vel: new THREE.Vector3(), loot: [] as THREE.Object3D[],
  cool: 45, scripted: true, bush: BUSHES[0], stars: icon("💫", 0.5), alert: icon("❗", 0.5), dir: new THREE.Vector3(), whiff: false,
  stripe: makeStripe("#e8493a", 0.9),
};
bandit.stars.position.set(0, 1.75, 0); bandit.alert.position.set(0, 1.9, 0);
const SN = { stalkSpeed: 6.8, strikeFrom: 6, warn: 0.7, lock: 0.25, dashSpeed: 13, dashTime: 0.8, hitR: 0.9, faceplant: 2.5, bonkR: 1.0 };
let hitStop = 0;
function updateBandit(dt: number, p: V3) {
  const b = bandit, bp = b.m.group.position, sp = T.playerSpeed * speedMult;
  b.t -= dt;
  switch (b.state) {
    case "hide": {
      // a strike every 45-75 s, three times as often while you carry loose bananas; the first (at ~0:45) is scripted to miss
      if (!gate.open) break;
      b.cool -= dt * (pStack.loose > 0 ? 3 : 1);
      const where = b.scripted ? p.z < -12 : p.z < -20;
      if (b.cool <= 0 && where && pStack.size >= 3) {
        b.bush = BUSHES.slice().sort((x, y) => flat(x, p) - flat(y, p))[0];
        bp.copy(b.bush).setZ(b.bush.z - 0.2); scene.add(b.m.group); popIn(b.m.pivot, 0, 0.4);
        b.state = "stalk"; b.t = 6; b.m.setExpr("angry");
      }
      break;
    }
    case "stalk": // creeps toward you; strikes from about 6 u out
      moveTo(bp, p, SN.stalkSpeed, dt, b.vel);
      if (flat(bp, p) < SN.strikeFrom || b.t <= 0) {
        b.state = "warn"; b.t = SN.warn; b.vel.set(0, 0, 0); b.m.group.add(b.alert); scene.add(b.stripe.holder); sfx("nope");
        log.snatchTries++; ev("snatcher-warn");
      }
      break;
    case "warn": { // the stripe tracks you, then locks for the last 0.25 s
      const locked = b.t < SN.lock;
      if (!locked) {
        b.dir.set(p.x - bp.x, 0, p.z - bp.z).normalize();
        if (b.scripted) b.dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.32); // the tutorial lunge goes wide on purpose
      }
      aimStripe(b.stripe, bp, b.dir, SN.dashSpeed * SN.dashTime, locked, gameT);
      if (b.t <= 0) { b.m.group.remove(b.alert); scene.remove(b.stripe.holder); b.state = "dash"; b.t = SN.dashTime; b.whiff = true; }
      break;
    }
    case "dash":
      bp.addScaledVector(b.dir, SN.dashSpeed * dt); b.vel.copy(b.dir).multiplyScalar(SN.dashSpeed);
      bp.x = THREE.MathUtils.clamp(bp.x, -11, 14); bp.z = THREE.MathUtils.clamp(bp.z, -40, GATE.z - 0.6);
      if (flat(bp, p) < SN.hitR) { // caught you: grabs the loose top (3), or 2 from a safe stack
        const n = pStack.loose > 0 ? Math.min(3, pStack.loose) : pStack.size >= 3 ? 2 : 0;
        for (let i = 0; i < n; i++) {
          const from = pStack.take("banana") ?? pStack.take("chips"); if (!from) break;
          const o = makeItem("banana"), h = b.loot.length; b.loot.push(o);
          arc(o, from, () => bp.clone().setY(1.5 + h * 0.2), 0.18, 0.6, () => { b.m.group.add(o); o.position.set(0, 1.5 + h * 0.2, 0); });
        }
        floatText(n ? `SNATCHED ${n}!` : "Nothing to grab!", p.clone().setY(2.6), "#c0392b", 26);
        trauma = Math.min(1, trauma + 0.3); squash(player.body, 0.3, 0.25);
        log.snatched += n; ev("snatched " + n);
        b.state = "flee"; b.t = 0.6; b.whiff = false; b.scripted = false; b.m.setExpr("happy");
        if (n) toast("Chase him and walk into him, or take them back at his stand");
      } else if (b.t <= 0) { // whiff: face-plants, and walking into him bonks him
        b.state = "dizzy"; b.t = SN.faceplant; b.vel.set(0, 0, 0); b.m.group.add(b.stars); b.m.setExpr("wow");
        floatText("WHIFF!", bp.clone().setY(2.2), "#8a5a34", 26); squash(b.m.body, 0.35, 0.3);
        log.dodged++; ev("dodged");
        if (b.scripted) toast("He missed! Walk into him to BONK him");
        b.scripted = false;
      }
      break;
    case "flee":
      moveTo(bp, CAMP.clone().setZ(CAMP.z + 1.2), sp * 0.85, dt, b.vel);
      if (b.t <= 0 && flat(bp, p) < SN.bonkR) { bonk(false); break; }
      if (flat(bp, CAMP) < 1.6) { addToStash(b.loot.length); b.loot.forEach((o) => b.m.group.remove(o)); b.loot = []; goHome(); }
      break;
    case "dizzy":
      b.m.body.rotation.z = Math.sin(gameT * 10) * 0.3;
      if (flat(bp, p) < SN.bonkR + 0.2) { bonk(true); break; }
      if (b.t <= 0) { b.m.group.remove(b.stars); b.m.body.rotation.z = 0; goHome(); }
      break;
    case "home":
      moveTo(bp, b.bush.clone().setZ(b.bush.z - 0.2), sp * 0.8, dt, b.vel);
      if (flat(bp, b.bush) < 0.4) { scene.remove(b.m.group); b.state = "hide"; }
      break;
  }
  if (b.m.group.parent) b.m.tick(dt, camera, b.vel);
}
function goHome() { bandit.state = "home"; bandit.cool = 45 + Math.random() * 30; bandit.m.setExpr("neutral"); }
function bonk(tip: boolean) {
  const b = bandit, bp = b.m.group.position;
  hitStop = 0.06; trauma = Math.min(1, trauma + 0.35);
  squash(player.body, 0.3, 0.25); sfx("unlock"); burst(bp.clone().setY(1.2), 14, "#ffe066", 1);
  floatText("BONK!", bp.clone().setY(2.4), "#e8493a", 30);
  for (const o of b.loot) { b.m.group.remove(o); if (!pStack.full) pStack.push("banana", bp.clone().setY(1.6)); else dropGround(bp.clone().setY(1.6), bp.clone().add(V(Math.random() - 0.5, Math.random() - 0.5))); }
  b.loot = [];
  if (tip) { wallet += 5; floatText("+$5 bounty", bp.clone().setY(1.6), "#3a7a2a"); bumpWallet(); }
  b.m.group.remove(b.stars); b.m.body.rotation.z = 0;
  goHome(); b.state = "home"; act("bonk", 1); log.bonks++; ev("bonk");
}

// ---------- the Sleeper: a huge napping gorilla in the deep row. Slams wake him; he charges in a straight line ----------
const SLEEP_AT = V(2, -37);
const SL = { zs: 3, regain: 8, roar: 1.2, aim: 0.9, lock: 0.5, speed: 12, chargeTime: 1.2, recover: 1.5, hitR: 1.25, leashZ: -20, stun: 3, eatEvery: 0.5, eatFor: 8 };
type SleepState = "sleep" | "roar" | "aim" | "charge" | "recover" | "stunned" | "eat" | "back";
const sleeper = {
  m: new MonkeyCard({ fur: "#4f4a58", suit: "#4f4a58", hat: "none" }, 2.7), state: "sleep" as SleepState, t: 0, z: SL.zs, quiet: 0,
  vel: new THREE.Vector3(), dir: new THREE.Vector3(), charges: 0, eatT: 0, stripe: makeStripe("#ffb04a", 1.6),
  zIcons: [0, 1, 2].map((i) => { const s = icon("💤", 0.5 - i * 0.06); s.position.set(0.5 + i * 0.32, 2.6 + i * 0.42, 0); return s; }),
  stars: icon("💫", 0.7),
};
sleeper.m.group.position.copy(SLEEP_AT); sleeper.m.setExpr("blink"); scene.add(sleeper.m.group);
sleeper.zIcons.forEach((s) => sleeper.m.group.add(s));
sleeper.stars.position.set(0, 2.9, 0);
{ const nest = cyl(1.6, 1.8, 0.18, "#9a7a4a", SLEEP_AT.x, 0, SLEEP_AT.z, 14); scene.add(nest); }
let playerStun = 0;
const knock = new THREE.Vector3();
function sleeperNoise(n: number) {
  const s = sleeper;
  if (s.state !== "sleep") return;
  const before = Math.ceil(s.z);
  s.z = Math.max(0, s.z - n); s.quiet = 0;
  const after = Math.ceil(s.z);
  for (let i = after; i < before; i++) { const ic = s.zIcons[i]; ic.visible = false; burst(ic.getWorldPosition(new THREE.Vector3()), 6, "#cfe8ff", 0.5); }
  if (after < before) { squash(s.m.body, 0.08, 0.3); floatText(after ? `💤 ${after} left` : "uh oh...", s.m.group.position.clone().setY(3.4), "#5a4a6a", 20); }
  if (s.z <= 0) { // wakes up
    s.state = "roar"; s.t = SL.roar; s.charges = 0; s.m.setExpr("angry");
    floatText("ROOAAR!", s.m.group.position.clone().setY(3.2), "#c0392b", 34); trauma = Math.min(1, trauma + 0.6); sfx("nope");
    log.wakes++; ev("sleeper-wake");
    if (log.wakes === 1) toast("You woke the Sleeper! Sidestep his charge, or let him hit a tree");
  }
}
function updateSleeper(dt: number, p: V3) {
  const s = sleeper, sp = s.m.group.position;
  s.t -= dt;
  const inDeep = p.z < -27;
  switch (s.state) {
    case "sleep":
      s.quiet += dt;
      if (s.z < SL.zs && s.quiet > SL.regain) {
        s.quiet = 0; const idx = Math.ceil(s.z);
        if (idx < SL.zs) { s.zIcons[idx].visible = true; popIn(s.zIcons[idx]); }
        s.z = Math.min(SL.zs, Math.floor(s.z) + 1);
      }
      s.m.body.scale.y = 0.94 + Math.sin(gameT * 1.6) * 0.03; // big slow breaths
      break;
    case "roar": s.m.body.position.y = Math.abs(Math.sin(gameT * 30)) * 0.08; if (s.t <= 0) startAim(); break;
    case "aim": {
      const locked = s.t < SL.lock;
      if (!locked) s.dir.set(p.x - sp.x, 0, p.z - sp.z).normalize();
      aimStripe(s.stripe, sp, s.dir, SL.speed * SL.chargeTime, locked, gameT);
      if (s.t <= 0) { scene.remove(s.stripe.holder); s.state = "charge"; s.t = SL.chargeTime; s.charges++; log.charges++; }
      break;
    }
    case "charge": {
      sp.addScaledVector(s.dir, SL.speed * dt); s.vel.copy(s.dir).multiplyScalar(SL.speed);
      sp.x = THREE.MathUtils.clamp(sp.x, -11, 14);
      if (sp.z > SL.leashZ) { sp.z = SL.leashZ; s.t = 0; } // leashed: he never leaves the deep jungle
      const tree = trees.find((t) => flat(t.pos, sp) < 0.95);
      if (tree) { // rams a tree: its bunch rains down for you, he sees stars
        for (let k = 0; k < tree.ripe; k++) { tree.fruit[k].visible = false; const a = Math.random() * Math.PI * 2; dropGround(tree.pos.clone().setY(1.4), tree.pos.clone().add(V(Math.cos(a) * 1.5, Math.sin(a) * 1.5)), 10); }
        tree.ripe = 0; tree.regrow = T.bunchRegrow; squash(tree.g, 0.3, 0.4);
        s.state = "stunned"; s.t = SL.stun; s.vel.set(0, 0, 0); s.m.group.add(s.stars); s.m.setExpr("wow");
        floatText("THUNK!", sp.clone().setY(3), "#8a5a34", 32); trauma = Math.min(1, trauma + 0.5); hitStop = 0.08;
        log.treeRams++; ev("tree-ram");
        break;
      }
      if (flat(sp, p) < SL.hitR && playerStun <= 0) { hitPlayer(); break; }
      if (s.t <= 0) { s.state = "recover"; s.t = SL.recover; s.vel.set(0, 0, 0); }
      break;
    }
    case "recover": case "stunned":
      if (s.t <= 0) {
        s.m.group.remove(s.stars); s.m.setExpr("angry");
        if (inDeep && s.charges < 4) startAim(); else { s.state = "back"; s.m.setExpr("neutral"); }
      }
      break;
    case "eat": { // munches the spilled bananas nearest him, one per 0.5 s
      s.eatT -= dt;
      const near = ground.map((g, i) => ({ g, i })).sort((a, b) => flat(a.g.at, sp) - flat(b.g.at, sp))[0];
      if (near && flat(near.g.at, sp) > 0.8) moveTo(sp, near.g.at, 3, dt, s.vel); else s.vel.set(0, 0, 0);
      if (near && flat(near.g.at, sp) <= 0.8 && s.eatT <= 0) { s.eatT = SL.eatEvery; removeGround(near.i); squash(s.m.body, 0.12, 0.2); floatText("chomp", sp.clone().setY(2.9), "#5a4a6a", 18); log.eaten++; }
      if (s.t <= 0 || !near) { s.state = "back"; s.m.setExpr("neutral"); }
      break;
    }
    case "back":
      if (moveTo(sp, SLEEP_AT, 4, dt, s.vel)) {
        s.state = "sleep"; s.z = SL.zs; s.quiet = 0; s.zIcons.forEach((ic, i) => { ic.visible = true; popIn(ic, i * 0.15); }); s.m.setExpr("blink"); s.vel.set(0, 0, 0);
      }
      break;
  }
  if (s.state !== "roar") s.m.body.position.y *= 0.8;
  s.m.tick(dt, camera, s.vel);
}
function startAim() { const s = sleeper; s.state = "aim"; s.t = SL.aim; scene.add(s.stripe.holder); s.m.setExpr("angry"); }
function hitPlayer() {
  const s = sleeper, p = player.group.position;
  playerStun = 0.4; knock.copy(s.dir).multiplyScalar(5); trauma = Math.min(1, trauma + 0.7); hitStop = 0.08;
  squash(player.body, 0.4, 0.3); player.flash("wow", 700);
  const n = pStack.loose;
  for (let k = 0; k < n; k++) {
    const from = pStack.take("banana") ?? pStack.take("chips"); if (!from) break;
    const a = Math.random() * Math.PI * 2, r = 0.8 + Math.random() * 1.7;
    dropGround(from, p.clone().add(V(Math.cos(a) * r, Math.sin(a) * r)));
  }
  log.chargeHits++; log.scattered += n; ev("charge-hit scattered " + n);
  if (n) { floatText(`WHAM! ${n} spilled!`, p.clone().setY(2.8), "#c0392b", 28); s.state = "eat"; s.t = SL.eatFor; s.eatT = 0.6; s.vel.set(0, 0, 0); s.m.setExpr("happy"); }
  else { floatText("OOF! (nothing loose)", p.clone().setY(2.8), "#5a4a6a", 24); s.state = "recover"; s.t = SL.recover; s.vel.set(0, 0, 0); }
}

// ---------- metrics for the pacing bot: active windows, longest empty walk, bananas per walking second ----------
const metrics = { lastAct: 0, maxEmptyWalk: 0, emptyWalk: 0, walk: 0, picked: 0, kinds: new Map<number, Set<string>>(), segs: [] as { label: string; bpws: number }[], segWalk: 0, segPicked: 0 };
function act(kind: string, n = 1) {
  const m = Math.floor(gameT / 60);
  if (!metrics.kinds.has(m)) metrics.kinds.set(m, new Set());
  metrics.kinds.get(m)!.add(kind);
  metrics.emptyWalk = 0; metrics.lastAct = gameT;
  if (kind === "pick" || kind === "shake") { metrics.picked += n; metrics.segPicked += n; }
}

// ---------- pads: the unlock sequence (our prices; first purchase < 60 s, then every ~45-70 s) ----------
const pads: Pad[] = [];
const panOnAfford = new Set<Pad>();
const panned = new Set<Pad>();
function pad(x: number, z: number, cost: number, label: string, ico: string, fn: () => void, opts: { big?: boolean; pan?: boolean } = {}) {
  const p = new Pad(scene, V(x, z), cost, label, ico, () => {
    unlockLog.push({ t: Math.round(gameT), label });
    metrics.segs.push({ label, bpws: +(metrics.segPicked / Math.max(1, metrics.segWalk)).toFixed(2) }); metrics.segPicked = 0; metrics.segWalk = 0;
    fn();
  }, opts.big); pads.push(p); if (opts.pan) panOnAfford.add(p); return p;
}
function hirePad(role: Role, cost: number, then?: () => void) {
  const at = HIRE_AT[role];
  return pad(at.x, at.z + 0.9, cost, "Hire " + ROLE[role].name, ROLE[role].icon, () => { hire(role, at); then?.(); }, { pan: true });
}
/** repeatable upgrade pads in the office: re-arm with the next tier after each purchase */
function tierPad(x: number, z: number, name: string, ico: string, costs: number[], apply: (lvl: number) => void, lvl = 0): void {
  if (lvl >= costs.length) return;
  const p = pad(x, z, costs[lvl], `${name} ${lvl + 1}/${costs.length}`, ico, () => { apply(lvl + 1); setTimeout(() => tierPad(x, z, name, ico, costs, apply, lvl + 1), 450); });
  p.show();
}
const clouds = new THREE.Group();
for (let i = 0; i < 14; i++) clouds.add(ball(0.9 + (i % 3) * 0.35, "#fffaf0", -9.5 - ((i >> 1) % 3) * 1.1, 0.7 + (i >> 3) * 0.6 + (i % 2) * 0.3, -1 + (i % 7) * 1.3 + Math.sin(i * 3) * 0.3));
scene.add(clouds);
const comingSign = makeSign("COMING SOON", "#ffe066"); comingSign.position.set(-7.4, 1.3, 2.2); comingSign.rotation.y = Math.PI / 2; scene.add(comingSign);

const P = {
  shelf: pad(2.2, -1.9, 10, "Banana Shelf", "🍌", () => { openShelf(bananaShelf); openGate(); P.basket.show(); toast("The gate is open: the bananas are out in the jungle"); }),
  basket: pad(4.8, -3.8, 30, "Basket: carry 12", "🧺", () => {
    pStack.cap = 12; basket = box(0.62, 0.26, 0.44, "#b07a45", 0, 1.6, -0.55); player.group.add(basket); popIn(basket); pAnchorH = 1.9;
    player.flash("wow", 700); P.shaker.show();
  }),
  shaker: pad(-0.6, -3.8, 60, "Banana Shaker", "💼", () => { shaker = true; ghosts.get("picker")!.show(); P.picker.show(); toast("Stand by the trees: your briefcase slam shakes them all"); }, { pan: true }),
  picker: hirePad("picker", 150, () => { P.cashierP.show(); ghosts.get("cashier")!.show(); toast("Your Picker keeps the banana shelf full"); }),
  cashierP: hirePad("cashier", 260, () => { P.chips.show(); openOffice(); toast("No more running to the register! The Office is open"); }),
  chips: pad(-1.4, -1.9, 450, "Chips Shelf", "🍟", () => { openShelf(chipsShelf); P.fryer.show(); toast("Customers want banana chips! Build a fryer"); }, { pan: true }),
  fryer: pad(-4.4, 1.6, 550, "Fryer", "🔥", () => {
    fryer.open = true; scene.add(fryer.group, fryer.ring); fryer.group.children.forEach((c, i) => popIn(c, i * 0.05));
    trash.open = true; scene.add(trash.group, trash.ring); popIn(trash.group, 0.3);
    obstacles.push({ p: fryer.pos, r: 0.85 }, { p: trash.pos, r: 0.45 }); trauma = Math.min(1, trauma + 0.35);
    ghosts.get("runner")!.show(); scene.add(belt.ghost); P.runner.show(); openStaffOffice();
    toast("Dump bananas on the fryer, carry chips to the shelf. Red ring = trash");
  }),
  runner: hirePad("runner", 800, () => { P.cook.show(); P.picker2.show(); }),
  picker2: pad(4.9, -4.0, 900, "Hire Picker 2", "🍌", () => hire("picker", V(4.9, -4.6))),
  picker3: pad(-6.0, -2.4, 1300, "Hire Picker 3", "🍌", () => hire("picker", V(-6.0, -3.0))),
  cook: pad(-3.6, -1.6, 1500, "Conveyor Belt", "⚙️", () => {
    belt.open = true; scene.remove(belt.ghost); scene.add(belt.group); belt.group.children.forEach((c, i) => popIn(c, i * 0.08));
    trauma = Math.min(1, trauma + 0.5); P.bankerP.show(); P.picker3.show(); ghosts.get("banker")!.show(); toast("The belt feeds the fryer straight from the grove");
  }, { pan: true }),
  bankerP: hirePad("banker", 1800, () => P.next.show()),
  next: pad(-5.6, 5.6, 2800, "Banana Boulevard", "🏙️", () => openNextTease(), { big: true, pan: true }),
};
let officeOpen = false;
function openOffice() {
  if (officeOpen) return openStaffOffice();
  officeOpen = true;
  toast("The Office opened: upgrade your carry and speed");
  tierPad(5.8, 2.6, "Carry", "🧺", [150, 1100], (l) => {
    pStack.cap = 12 + 6 * l;
    if (!basket) { basket = box(0.62, 0.26, 0.44, "#b07a45", 0, 1.6, -0.55); player.group.add(basket); pAnchorH = 1.9; }
    popIn(basket); player.flash("wow", 700);
  });
  tierPad(7.4, 2.6, "Speed", "👟", [250, 1100], (l) => { speedMult = 1 + 0.12 * l; });
}
function openStaffOffice() {
  tierPad(5.8, 4.4, "Price", "🏷️", [700, 1500], (l) => { priceMult = 1 + 0.15 * l; });
  tierPad(7.4, 4.4, "Staff Speed", "🐒", [1000], (l) => { staffSpeedMult = 1 + 0.15 * l; });
  tierPad(6.6, 6.0, "Staff Carry", "🎒", [1000], (l) => { staffCapBonus = 2 * l; });
}
function openNextTease() {
  clouds.children.forEach((c, i) => tween(0.5, (k) => { c.scale.setScalar(Math.max(0.001, 1 - k)); }, undefined, i * 0.05));
  setTimeout(() => scene.remove(clouds), 1400);
  const g = new THREE.Group(); g.position.set(-11, 0, 2.2); g.rotation.y = Math.PI / 2;
  g.add(box(4.2, 2.2, 2.4, "#e8a06a", 0, 0, 0));
  const roof = inked(new THREE.ConeGeometry(3.2, 1.4, 4), "#e8493a", 0.06); roof.rotation.y = Math.PI / 4; roof.position.y = 2.9; g.add(roof);
  const s = makeSign("BANANA BOULEVARD", "#ffe066", 2.6); s.position.set(0, 1.4, 1.22); g.add(s);
  scene.add(g); g.children.forEach((c, i) => popIn(c, 0.4 + i * 0.12, 0.6));
  comingSign.visible = false; trauma = 1;
  setTimeout(() => toast("End of this feel test: Banana Boulevard comes next"), 1600);
}
P.shelf.show();

// ---------- guidance: one arrow that always points at what needs you, plus a goal bar ----------
const arrow = inked(new THREE.ConeGeometry(0.32, 0.7, 4), "#ffcc3d", 0.05);
arrow.rotation.x = Math.PI; scene.add(arrow);
let firstChipsShelved = false;
function arrowTarget(): V3 | null {
  const p = player.group.position;
  if (starterPile.bills.length) return starterPile.origin;
  const affordable = pads.filter((pd) => pd.visible && !pd.done && wallet >= pd.left).sort((a, b) => a.left - b.left)[0];
  if (affordable) return affordable.pos;
  if (!hasRole("cashier") && register.queue[0]?.ready) return register.zone;
  if (!hasRole("banker") && register.pile.bills.length >= 6) return register.pile.origin;
  if (pStack.count("chips") && chipsShelf.count < chipsShelf.cap) return chipsShelf.drop;
  // the arrow only ever suggests a SAFE load; going past the line is the player's own greed
  const ripeNear = nearestRipe(p);
  const wantMore = GREEDY ? !pStack.full : pStack.size < pStack.cap;
  if (wantMore && ripeNear && flat(ripeNear.pos, p) < 8 && p.z < GATE.z) return ripeNear.pos;
  if (pStack.count("banana")) {
    if (bananaShelf.count < bananaShelf.cap) return bananaShelf.drop;
    if (fryer.open && fryer.input < fryer.inCap) return fryer.zone;
    if (pStack.full) return trash.open ? trash.zone : null;
  }
  if (fryer.open && fryer.output > 0 && !pStack.full && chipsShelf.count < chipsShelf.cap && !hasRole("runner")) return fryer.zone;
  if (firstChipsShelved && hasRole("picker") && pads.every((pd) => !pd.visible || pd.done || wallet < pd.left)) return null; // let the player roam
  const t = nearestRipe(p);
  return t ? t.pos : null;
}
function updateGoal() {
  const next = pads.filter((pd) => pd.visible && !pd.done).sort((a, b) => a.left - b.left)[0];
  if (!next) { goalText.textContent = "All unlocked!"; goalFill.style.width = "100%"; return; }
  goalText.textContent = `Next: ${next.label}  $${Math.floor(Math.min(wallet, next.left))} / $${Math.ceil(next.left)}`;
  goalFill.style.width = `${Math.min(100, (wallet / next.left) * 100)}%`;
}

// ---------- pacing harness (dev only): ?bot=1&ts=8 ----------
const QS = new URLSearchParams(location.search);
const BOT = QS.has("bot"), TS = Math.max(1, Number(QS.get("ts") ?? 1));
const GREEDY = BOT && QS.has("greed"); // bot variant that always fills to 2x
let gameT = 0;
const unlockLog: { t: number; label: string }[] = [];
function botInput(): V3 {
  const p = player.group.position;
  // a decent player: sidestep a telegraphed lunge or charge, bonk a dazed bandit, chase one carrying your bananas
  const threat = bandit.state === "warn" ? { from: bandit.m.group.position, dir: bandit.dir } : sleeper.state === "aim" ? { from: sleeper.m.group.position, dir: sleeper.dir } : null;
  if (threat) {
    const side = V(-threat.dir.z, threat.dir.x), rel = V(p.x - threat.from.x, p.z - threat.from.z);
    if (side.dot(rel) < 0) side.negate();
    return side.normalize();
  }
  const bp = bandit.m.group.position;
  if ((bandit.state === "dizzy" || (bandit.state === "flee" && bandit.loot.length)) && flat(bp, p) < 9) { const d = V(bp.x - p.x, bp.z - p.z); return d.normalize(); }
  if (stash.count && !pStack.full && flat(p, CAMP) < 12) { const d = V(CAMP.x - p.x, CAMP.z + 1.6 - p.z); if (d.length() > 0.6) return d.normalize(); }
  const goal = arrowTarget() ?? nearestRipe(p)?.pos ?? null;
  if (!goal) return new THREE.Vector3();
  const at = route(p, goal);
  const d = V(at.x - p.x, at.z - p.z);
  if (d.length() < 0.25) return new THREE.Vector3();
  d.normalize();
  // steer around stations like a person would: push away and slide along the side nearer the target
  for (const o of obstacles) {
    const away = V(p.x - o.p.x, p.z - o.p.z), dist = away.length(), reach = o.r + 1.0;
    if (dist > reach || dist < 0.001 || flat(at, o.p) < o.r) continue;
    away.divideScalar(dist);
    if (d.dot(away) > 0.2) continue; // already moving away from it
    const tangent = V(-away.z, away.x);
    if (tangent.dot(d) < 0) tangent.negate();
    d.addScaledVector(tangent, 1.4 * (1 - dist / reach) + 0.4).addScaledVector(away, 0.6 * (1 - dist / reach));
  }
  return d.normalize();
}

// ---------- loop ----------
const clock = new THREE.Clock();
const camFocus = player.group.position.clone();
let pan: { to: V3; t: number } | null = null;
let pickT = 0, dropT = 0;
function frame() {
  const real = Math.min(clock.getDelta(), 0.05);
  for (let k = 0; k < TS; k++) { if (hitStop > 0) { hitStop -= real; continue; } step(real); }
  render();
}
function step(dt: number) {
  gameT += dt;
  updateFx(dt);

  // movement: never slowed by carrying (research rule 1)
  const kx = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0) + joy.x;
  const kz = (keys.has("s") || keys.has("arrowdown") ? 1 : 0) - (keys.has("w") || keys.has("arrowup") ? 1 : 0) + joy.y;
  const mv = BOT ? botInput() : new THREE.Vector3(kx, 0, kz);
  if (mv.length() > 1) mv.normalize();
  if (playerStun > 0) { playerStun -= dt; mv.set(0, 0, 0); } // a charge knocks you back; control loss never over 0.5 s
  pVel.lerp(mv.multiplyScalar(T.playerSpeed * speedMult), Math.min(1, dt * 18));
  const p = player.group.position;
  const prevZ = p.z;
  p.addScaledVector(pVel, dt);
  if (knock.lengthSq() > 0.01) { p.addScaledVector(knock, dt); knock.multiplyScalar(Math.max(0, 1 - dt * 6)); } else knock.set(0, 0, 0);
  for (const o of obstacles) { const d = flat(p, o.p), r = o.r + 0.3; if (d < r && d > 0.001) { p.x = o.p.x + (p.x - o.p.x) * r / d; p.z = o.p.z + (p.z - o.p.z) * r / d; } }
  // the fence only opens at the gate (and only once the gate is open)
  const inGap = gate.open && p.x > GATE.x0 + 0.3 && p.x < GATE.x1 - 0.3;
  if ((prevZ > GATE.z) !== (p.z > GATE.z) && !inGap) p.z = prevZ > GATE.z ? GATE.z + 0.35 : GATE.z - 0.35;
  if (p.z > GATE.z) p.x = THREE.MathUtils.clamp(p.x, -6.5, 8.3); else p.x = THREE.MathUtils.clamp(p.x, -11, 14);
  p.z = THREE.MathUtils.clamp(p.z, -40, 7.6);
  // back through the gate with a greedy stack: the BIG HAUL beat (advisor: overstack pays at the gate)
  if (prevZ < GATE.z && p.z >= GATE.z && pStack.size) {
    log.trips++;
    const n = pStack.loose;
    if (n > 0) {
      wallet += n; bumpWallet(); log.hauls++; log.haulBananas += n; ev("big-haul " + n);
      floatText(`BIG HAUL! +${n} 🍌  +$${n}`, p.clone().setY(3.0), "#e8a417", 30);
      burst(p.clone().setY(2.2), 26, "#ffd84a", 1.2); sfx("unlock"); trauma = Math.min(1, trauma + 0.3); act("haul", n);
    }
  }
  log.maxLoose = Math.max(log.maxLoose, pStack.loose);
  if (pVel.length() > 1) { metrics.walk += dt; metrics.segWalk += dt; metrics.emptyWalk += dt; metrics.maxEmptyWalk = Math.max(metrics.maxEmptyWalk, metrics.emptyWalk); }
  player.tick(dt, camera, pVel);
  pStack.update(dt, pVel);

  // trees regrow; walking under one picks automatically
  pickT -= dt;
  for (const t of trees) {
    if (t.ripe < t.max) { t.regrow -= dt; if (t.regrow <= 0) { for (let k = t.ripe; k < t.max; k++) { t.fruit[k].visible = true; popIn(t.fruit[k], (k - t.ripe) * 0.05, 0.35); } t.ripe = t.max; } }
  }
  const tNear = nearestRipe(p);
  if (pickT <= 0 && tNear && !pStack.full && flat(p, tNear.pos) < 1.6) {
    pickT = T.pickEvery; pickFrom(tNear, pStack); squash(tNear.g, 0.08, 0.18); sfx("pick"); act("pick", 1);
    if (tNear.row === 2) sleeperNoise(0.25); // hand-picking the deep trees is quieter than a slam, not silent
  }
  updateShaker(dt, p);
  updateWindfalls(dt, p);
  updateBandit(dt, p);
  updateSleeper(dt, p);
  updateGround(dt, p);
  updateStash(dt, p);
  // drop zones accept only what they use (filtered unloading)
  dropT -= dt;
  if (dropT <= 0) {
    if (bananaShelf.open && flat(p, bananaShelf.drop) < 1.15 && bananaShelf.count < bananaShelf.cap && pStack.count("banana")) { const f = pStack.take("banana"); if (f) { stockShelf(bananaShelf, f); dropT = T.dropEvery; sfx("drop"); act("drop"); } }
    else if (chipsShelf.open && flat(p, chipsShelf.drop) < 1.15 && chipsShelf.count < chipsShelf.cap && pStack.count("chips")) { const f = pStack.take("chips"); if (f) { stockShelf(chipsShelf, f); dropT = T.dropEvery; sfx("drop"); act("drop"); firstChipsShelved = true; } }
    else if (fryer.open && flat(p, fryer.zone) < 1.15) {
      if (fryer.input < fryer.inCap && pStack.count("banana")) { const f = pStack.take("banana"); if (f) { feedFryer(f); dropT = T.dropEvery; sfx("drop"); act("drop"); } }
      else if (fryer.output > 0 && !pStack.full) { takeChips(pStack); dropT = 0.08; sfx("pick"); }
    } else if (trash.open && flat(p, trash.zone) < 0.95 && pStack.size) {
      const k: Kind = pStack.count("banana") ? "banana" : "chips";
      const f = pStack.take(k); if (f) { const o = makeItem(k); arc(o, f, () => trash.pos.clone().setY(0.9), 0.16, 0.6, () => scene.remove(o)); dropT = 0.05; sfx("nope"); }
    }
  }

  // register: the player (until a cashier is hired) rings up the front customer
  const front = register.queue[0];
  const cashier = hasRole("cashier");
  const manned = flat(p, register.zone) < 1.1;
  register.ring.visible = !cashier;
  if (front?.ready && (manned || cashier)) {
    register.t += dt;
    if (register.t >= (manned ? 0.18 : 0.45)) { register.t = 0; register.queue.shift(); checkout(front); if (manned) act("serve"); }
  } else register.t = 0;
  starterPile.collect(dt, p, 1.4, 0.03);
  register.pile.collect(dt, p, 1.4, 0.03);

  for (const pd of pads) {
    const spent = pd.update(dt, p, wallet, () => p.clone().setY(1.1), pVel.length() > 2.5);
    if (spent > 0) act("pay");
    wallet = Math.round((wallet - spent) * 100) / 100;
    if (pd.visible && !pd.done && panOnAfford.has(pd) && !panned.has(pd) && wallet >= pd.left) { panned.add(pd); pan = { to: pd.pos.clone(), t: 0 }; }
  }

  // demand beats supply: more stock on display brings customers faster
  spawnT -= dt;
  if (spawnT <= 0) {
    spawnCustomer();
    const stock = bananaShelf.count + chipsShelf.count * 2;
    spawnT = Math.max(0.45, T.spawnEvery - stock * 0.03) * (0.75 + Math.random() * 0.5);
  }
  updateCustomers(dt);
  updateWorkers(dt);
  updateFryer(dt);
  updateBelt(dt);

}
function render() {
  const p = player.group.position, dt = 1 / 60;
  // camera: high 3/4 follow, short pans to newly affordable unlocks
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
  // after two trips the jungle is yours to read: no arrow out there (advisor), the home pip shows the way back
  arrow.visible = !!at && flat(p, at) > 1.1 && !(p.z < GATE.z - 1 && log.trips >= 2);
  updatePip(p);
  vigEl.style.opacity = String(THREE.MathUtils.clamp((-p.z - 12) / 24, 0, 0.6));
  if (at) arrow.position.set(at.x, 1.25 + Math.abs(Math.sin(performance.now() / 220)) * 0.35, at.z);
  walletEl.textContent = "$" + Math.floor(wallet);
  updateGoal();
  renderer.render(scene, camera);
}
// ---------- home pip: when the shop is off-screen, an edge marker shows the way back, shelf stock and the line ----------
const pipEl = document.getElementById("pip")!, pipArrow = document.getElementById("piparrow")!, pipText = document.getElementById("piptext")!;
const vigEl = document.getElementById("vig")!;
function updatePip(p: V3) {
  if (p.z > GATE.z - 2) { pipEl.style.display = "none"; return; }
  const v = bananaShelf.pos.clone().project(camera);
  let x = v.x, y = v.y;
  if (v.z > 1) { x = -x; y = -y; }
  if (v.z < 1 && Math.abs(x) < 0.92 && Math.abs(y) < 0.86) { pipEl.style.display = "none"; return; }
  const k = Math.min(0.86 / Math.max(0.001, Math.abs(x)), 0.74 / Math.max(0.001, Math.abs(y)));
  x *= k; y *= k;
  pipEl.style.display = "flex";
  pipEl.style.left = (x * 0.5 + 0.5) * innerWidth + "px"; pipEl.style.top = (-y * 0.5 + 0.5) * innerHeight + "px";
  pipArrow.style.transform = `rotate(${Math.atan2(-y, x)}rad)`;
  const line = bananaShelf.queue.length + chipsShelf.queue.length;
  pipText.textContent = `🏪 🍌${bananaShelf.count}  👥${line}`;
  pipEl.classList.toggle("hungry", bananaShelf.count === 0 && line > 0);
}
// ---------- play log upload (dev server only; never in bot runs) ----------
function postLog(beacon = false) {
  if (BOT) return;
  const body = JSON.stringify({ ...log, gameT: Math.round(gameT), wallet: Math.round(wallet), unlockLog, ua: navigator.userAgent.slice(0, 80) });
  if (beacon) navigator.sendBeacon?.("/__playlog", body);
  else fetch("/__playlog", { method: "POST", body, headers: { "content-type": "application/json" } }).catch(() => {});
}
setInterval(() => { if (gameT > 5) postLog(); }, 20000);
addEventListener("pagehide", () => postLog(true));
function loop() { frame(); requestAnimationFrame(loop); }
(window as any).__dbg = { unlockLog, metrics, bandit, stash, sleeper, log, ground, wake: () => sleeperNoise(3), get kindsPerMin() { return [...metrics.kinds.values()].map((k) => k.size); }, get gameT() { return gameT; }, get wallet() { return wallet; }, set wallet(v: number) { wallet = v; }, pads, P, player, bananaShelf, chipsShelf, fryer, register, custs, workers, pStack };
loop();
toast("Grab the cash, then step on the glowing pad");
