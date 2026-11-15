// Banana Stand feel test (throwaway spike): pick bananas, stock the stand, set a price, sell to monkey
// customers, upgrade the stand. One question: does growing a monkey business feel satisfying in our style?
import * as THREE from "three";
import { MonkeyCard, Look } from "./monkey";
import { box, cyl, ball, inked } from "./toon";

// ---------- renderer / scene ----------
const canvas = document.getElementById("game") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const DAY_SKY = new THREE.Color("#ffd9a8"), NIGHT_SKY = new THREE.Color("#3b3560");
scene.background = DAY_SKY.clone();
scene.fog = new THREE.Fog(DAY_SKY.clone(), 28, 60);
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
const sun = new THREE.DirectionalLight("#fff1d6", 2.4);
sun.position.set(-8, 14, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20 });
scene.add(sun);
const hemi = new THREE.HemisphereLight("#fff4e0", "#6fa553", 1.2);
scene.add(hemi);
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener("resize", resize); resize();

// ---------- tiny tween helper ----------
type Tw = { t: number; d: number; f: (k: number) => void; done?: () => void };
const tweens: Tw[] = [];
const tween = (d: number, f: (k: number) => void, done?: () => void) => tweens.push({ t: 0, d, f, done });
const backOut = (k: number) => { const s = 2.2; return 1 + (s + 1) * Math.pow(k - 1, 3) + s * Math.pow(k - 1, 2); };
const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);
/** pop an object in from nothing with overshoot */
function popIn(o: THREE.Object3D, delay = 0, d = 0.45) {
  o.scale.setScalar(0.001);
  setTimeout(() => tween(d, (k) => { const s = backOut(k); o.scale.set(s, Math.max(0.001, s * (k < 0.5 ? 1.25 : 1)), s); }), delay * 1000);
}
/** squash-and-stretch bounce */
function squash(o: THREE.Object3D, amt = 0.25) {
  tween(0.32, (k) => { const w = Math.sin(k * Math.PI) * amt * (1 - k); o.scale.set(1 + w, 1 - w, 1 + w); });
}

// ---------- world ----------
const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshToonMaterial({ color: "#8cc06a" }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const road = new THREE.Mesh(new THREE.PlaneGeometry(60, 4.4), new THREE.MeshToonMaterial({ color: "#e7c79a" }));
road.rotation.x = -Math.PI / 2; road.position.set(0, 0.02, 4); road.receiveShadow = true; scene.add(road);
// background jungle
for (let i = 0; i < 26; i++) {
  const x = -26 + i * 2.1 + Math.sin(i * 7) * 0.8, z = -9 - (i % 3) * 1.6;
  const trunk = cyl(0.16, 0.24, 2.2 + (i % 3) * 0.6, "#8a5a34", x, 0, z, 8);
  const top = ball(1.1 + (i % 4) * 0.2, i % 2 ? "#5fa548" : "#4f9440", x, 2.6 + (i % 3) * 0.6, z);
  scene.add(trunk, top);
}
for (let i = 0; i < 18; i++) { const b = ball(0.45 + (i % 3) * 0.15, "#6fb455", -20 + i * 2.4 + Math.cos(i) * 0.6, 0.25, -5.5 - (i % 2)); scene.add(b); }

// ---------- banana trees (pick here) ----------
type Tree = { g: THREE.Group; pos: THREE.Vector3; ripe: number; regrow: number; fruit: THREE.Object3D[] };
const trees: Tree[] = [];
for (const [x, z] of [[-9, -2.2], [-11.5, 0.2], [-8.2, 1.6]]) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.add(cyl(0.18, 0.28, 2.6, "#9a6a3e", 0, 0, 0, 8));
  for (let i = 0; i < 6; i++) {
    const leaf = inked(new THREE.ConeGeometry(0.35, 2.2, 4), i % 2 ? "#5fb04a" : "#4f9a3e", 0.03);
    leaf.position.set(0, 2.7, 0); leaf.rotation.set(Math.PI / 2.6, (i / 6) * Math.PI * 2, 0, "YXZ");
    leaf.children.forEach((c) => c.translateY(0.9));
    g.add(leaf);
  }
  const fruit: THREE.Object3D[] = [];
  for (let i = 0; i < 4; i++) { const f = ball(0.16, "#ffd84a", Math.cos(i * 1.6) * 0.35, 2.15 - (i % 2) * 0.22, Math.sin(i * 1.6) * 0.35); g.add(f); fruit.push(f); }
  scene.add(g);
  trees.push({ g, pos: g.position.clone(), ripe: 4, regrow: 0, fruit });
}

// ---------- the stand (grows with upgrades) ----------
const STAND = new THREE.Vector3(0, 0, 1.4);
const stand = new THREE.Group(); stand.position.copy(STAND); scene.add(stand);
const stockPile = new THREE.Group(); scene.add(stockPile);
let level = 0;
const UPGRADES = [
  { cost: 0, name: "Crate stand" },
  { cost: 25, name: "Striped awning" },
  { cost: 70, name: "Banana Shack" },
  { cost: 160, name: "Banana Boutique" },
];
const signCanvas = document.createElement("canvas"); signCanvas.width = 512; signCanvas.height = 128;
const signTex = new THREE.CanvasTexture(signCanvas); signTex.colorSpace = THREE.SRGBColorSpace;
function paintSign(text: string, bg: string) {
  const c = signCanvas.getContext("2d")!;
  c.fillStyle = bg; c.fillRect(0, 0, 512, 128);
  c.lineWidth = 14; c.strokeStyle = "#2a1a12"; c.strokeRect(7, 7, 498, 114);
  c.fillStyle = "#2a1a12"; c.font = "bold 64px Trebuchet MS"; c.textAlign = "center"; c.textBaseline = "middle";
  c.fillText(text, 256, 68); signTex.needsUpdate = true;
}
function buildLevel(l: number) {
  const parts: THREE.Object3D[] = [];
  const add = (o: THREE.Object3D) => { stand.add(o); parts.push(o); };
  if (l === 0) {
    add(box(2.2, 0.9, 1, "#c98a4b", 0, 0, 0));
    add(box(2.3, 0.08, 1.1, "#a86d38", 0, 0.9, 0));
    paintSign("BANANAS", "#ffe066");
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshBasicMaterial({ map: signTex }));
    sign.position.set(0, 0.45, 0.52); add(sign);
  } else if (l === 1) {
    for (const x of [-1.05, 1.05]) add(cyl(0.06, 0.06, 2.2, "#8a5a34", x, 0, -0.4, 6));
    for (let i = 0; i < 6; i++) add(box(0.4, 0.06, 1.4, i % 2 ? "#fff6e6" : "#e8493a", -1 + i * 0.4, 2.1, 0.1));
    add(box(2.2, 0.08, 0.5, "#a86d38", 0, 1.35, -0.4));
  } else if (l === 2) {
    add(box(3.4, 2.4, 0.3, "#d98b4a", 0, 0, -0.75));
    add(box(1.1, 0.9, 1, "#c98a4b", 1.75, 0, 0));
    const roof = inked(new THREE.ConeGeometry(2.6, 1.2, 4), "#7cc24f", 0.05);
    roof.rotation.y = Math.PI / 4; roof.position.set(0, 3, -0.3); add(roof);
    paintSign("BANANA SHACK", "#ffe066");
  } else if (l === 3) {
    for (const x of [-1.9, 1.9]) { add(cyl(0.05, 0.05, 1.6, "#2a1a12", x, 0, 0.6, 6)); add(ball(0.18, "#fff3a0", x, 1.7, 0.6)); }
    add(box(1.2, 0.5, 0.5, "#e8493a", -2.4, 0, 0.6));
    for (let i = 0; i < 5; i++) add(ball(0.14, "#ffd84a", -2.7 + i * 0.15, 0.62, 0.6));
    const star = inked(new THREE.OctahedronGeometry(0.4), "#ffcc3d", 0.04); star.position.set(0, 3.9, -0.3); add(star);
    paintSign("BANANA BOUTIQUE", "#ffcc3d");
  }
  parts.forEach((p, i) => popIn(p, i * 0.06));
  squash(stand, 0.18);
  burst(STAND.clone().add(new THREE.Vector3(0, 1.4, 0)), 14, "#fff6e6");
}

function refreshStockPile() {
  while (stockPile.children.length) stockPile.remove(stockPile.children[0]);
  const n = Math.min(state.stock, 24);
  for (let i = 0; i < n; i++) {
    const b = ball(0.12, "#ffd84a", STAND.x - 0.8 + (i % 8) * 0.22, 1.08 + Math.floor(i / 8) * 0.18, STAND.z + 0.1 - Math.floor(i / 8) * 0.12);
    stockPile.add(b);
  }
}

// ---------- particles / floating text ----------
type P = { o: THREE.Object3D; v: THREE.Vector3; life: number };
const parts: P[] = [];
function burst(at: THREE.Vector3, n: number, color: string) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.07 + Math.random() * 0.06, 6, 4), new THREE.MeshBasicMaterial({ color }));
    m.position.copy(at);
    scene.add(m);
    parts.push({ o: m, v: new THREE.Vector3((Math.random() - 0.5) * 5, 2 + Math.random() * 4, (Math.random() - 0.5) * 5), life: 0.7 + Math.random() * 0.4 });
  }
}
const floaters: { el: HTMLDivElement; pos: THREE.Vector3; t: number }[] = [];
function floatText(text: string, at: THREE.Vector3, color = "#2a1a12") {
  const el = document.createElement("div");
  el.textContent = text;
  Object.assign(el.style, { position: "fixed", font: "bold 22px Trebuchet MS", color, textShadow: "0 2px 0 #fff, 0 -2px 0 #fff, 2px 0 0 #fff, -2px 0 0 #fff", pointerEvents: "none", transform: "translate(-50%,-50%)" });
  document.body.appendChild(el);
  floaters.push({ el, pos: at.clone(), t: 0 });
}
/** a banana flies from a world point to the money counter */
function flyToHud(from: THREE.Vector3) {
  const el = document.createElement("div"); el.textContent = "🍌";
  const s = from.clone().project(camera);
  const sx = (s.x * 0.5 + 0.5) * innerWidth, sy = (-s.y * 0.5 + 0.5) * innerHeight;
  const target = document.querySelector(".money")!.getBoundingClientRect();
  Object.assign(el.style, { position: "fixed", left: sx + "px", top: sy + "px", fontSize: "26px", pointerEvents: "none", transition: "all .7s cubic-bezier(.5,-0.4,.7,1)", transform: "translate(-50%,-50%) scale(1.3)" });
  document.body.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => { el.style.left = target.left + 30 + "px"; el.style.top = target.top + 18 + "px"; el.style.transform = "translate(-50%,-50%) scale(.6)"; }));
  setTimeout(() => { el.remove(); const m = document.querySelector(".money")!; m.classList.remove("bump"); void (m as HTMLElement).offsetWidth; m.classList.add("bump"); }, 700);
}

// ---------- player ----------
const BOSS: Look = { fur: "#c8682c", suit: "#3a3340", tie: "#ff8a2a", hat: "bowler", hatBand: "#ff8a2a", shades: true };
const player = new MonkeyCard(BOSS, 1.7);
player.group.position.set(-3, 0, 3);
scene.add(player.group);
const carryPile = new THREE.Group(); player.group.add(carryPile);
const keys = new Set<string>();
addEventListener("keydown", (e) => { keys.add(e.key.toLowerCase()); if (e.key.toLowerCase() === "e") tryPick(); });
addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
let walkPh = 0;

// ---------- game state ----------
const state = { money: 0, carry: 0, stock: 0, price: 3, day: 1, t: 0, sold: 0, lost: 0, earned: 0, rep: 1 };
const DAY_LEN = 75, CARRY_MAX = 8;
const $ = (id: string) => document.getElementById(id)!;
function toast(msg: string) { const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; $("toasts").appendChild(t); setTimeout(() => t.remove(), 2400); }
function refreshCarry() {
  while (carryPile.children.length) carryPile.remove(carryPile.children[0]);
  for (let i = 0; i < state.carry; i++) carryPile.add(ball(0.11, "#ffd84a", (i % 4 - 1.5) * 0.18, 1.95 + Math.floor(i / 4) * 0.17, 0.25));
}
function hud() {
  $("money").textContent = String(state.money);
  $("carry").textContent = `${state.carry}/${CARRY_MAX}`;
  $("stock").textContent = String(state.stock);
  $("price").textContent = String(state.price);
  $("day").textContent = String(state.day);
  ($("clockfill") as HTMLElement).style.width = `${(state.t / DAY_LEN) * 100}%`;
  const next = UPGRADES[level + 1];
  const btn = $("upgrade") as HTMLButtonElement;
  if (!next) { btn.textContent = "Max level (for now!)"; btn.disabled = true; btn.classList.remove("ready"); }
  else { btn.textContent = `Upgrade: ${next.name} (🍌${next.cost})`; btn.disabled = state.money < next.cost; btn.classList.toggle("ready", !btn.disabled); }
}
$("pdown").onclick = () => { state.price = Math.max(1, state.price - 1); hud(); };
$("pup").onclick = () => { state.price = Math.min(15, state.price + 1); hud(); };
$("upgrade").onclick = () => {
  const next = UPGRADES[level + 1];
  if (!next || state.money < next.cost) return;
  state.money -= next.cost; level++; state.rep += 0.5;
  buildLevel(level);
  toast(`${next.name} built! More customers incoming`);
  hud();
};

function tryPick() {
  const p = player.group.position;
  const tree = trees.find((t) => t.pos.distanceTo(p) < 2.2 && t.ripe > 0);
  if (!tree) { if (trees.some((t) => t.pos.distanceTo(p) < 2.2)) toast("This tree needs time to regrow"); return; }
  if (state.carry >= CARRY_MAX) { toast("Hands full! Stock the stand first"); return; }
  const take = Math.min(tree.ripe, CARRY_MAX - state.carry);
  for (let i = 0; i < take; i++) { const f = tree.fruit[tree.ripe - 1 - i]; tween(0.25, (k) => f.scale.setScalar(1 - k)); }
  tree.ripe -= take; tree.regrow = 9;
  state.carry += take;
  squash(tree.g, 0.15); squash(player.plane, 0.3);
  burst(tree.pos.clone().add(new THREE.Vector3(0, 2.2, 0)), 8, "#ffd84a");
  floatText(`+${take} 🍌`, tree.pos.clone().add(new THREE.Vector3(0, 3, 0)));
  player.setExpr("wow"); setTimeout(() => player.setExpr("happy"), 500);
  refreshCarry(); hud();
}

// ---------- customers ----------
const FURS = ["#c8682c", "#a8582a", "#d47a3a", "#b86a36"];
const SUITS = ["#4a8fd1", "#e8493a", "#8fd18a", "#ffb04a", "#b07ad1", "#5ac0b5"];
const HATS: Look["hat"][] = ["cap", "none", "none", "cap"];
type Cust = { m: MonkeyCard; state: "walk" | "queue" | "decide" | "leave"; x: number; want: number; wait: number; bubble?: THREE.Sprite; dir: number };
const custs: Cust[] = [];
let spawnT = 2;
function bubbleSprite(emoji: string) {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const x = c.getContext("2d")!;
  x.fillStyle = "#fff"; x.strokeStyle = "#2a1a12"; x.lineWidth = 8;
  x.beginPath(); x.ellipse(64, 56, 54, 46, 0, 0, Math.PI * 2); x.fill(); x.stroke();
  x.beginPath(); x.moveTo(52, 98); x.lineTo(64, 122); x.lineTo(76, 98); x.fill(); x.stroke();
  x.font = "56px serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(emoji, 64, 58);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false }));
  s.scale.setScalar(0.9); s.renderOrder = 10;
  return s;
}
function showBubble(c: Cust, emoji: string) {
  if (c.bubble) c.m.group.remove(c.bubble);
  c.bubble = bubbleSprite(emoji); c.bubble.position.set(0, 2.25, 0);
  c.m.group.add(c.bubble); popIn(c.bubble, 0, 0.3);
}
function spawn() {
  const fromLeft = Math.random() < 0.5;
  const look: Look = { fur: FURS[Math.floor(Math.random() * 4)], suit: SUITS[Math.floor(Math.random() * 6)], hat: HATS[Math.floor(Math.random() * 4)], hatBand: SUITS[Math.floor(Math.random() * 6)] };
  const m = new MonkeyCard(look, 1.3 + Math.random() * 0.25);
  const x = fromLeft ? -22 : 22;
  m.group.position.set(x, 0, 4 + (Math.random() - 0.5) * 1.2);
  scene.add(m.group);
  // willingness to pay grows with stand level and reputation
  const want = 2 + Math.random() * 3 + level * 1.6 + (state.rep - 1) * 0.8;
  custs.push({ m, state: "walk", x, want, wait: 0, dir: fromLeft ? 1 : -1 });
}
function queueSpot(i: number) { return new THREE.Vector3(STAND.x + 0.4 + i * 0.9, 0, STAND.z + 1.5 + (i > 0 ? 0.4 : 0)); }

// ---------- loop ----------
const clock = new THREE.Clock();
const camTarget = new THREE.Vector3();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  // tweens
  for (let i = tweens.length - 1; i >= 0; i--) { const tw = tweens[i]; tw.t += dt; const k = Math.min(1, tw.t / tw.d); tw.f(k); if (k >= 1) { tweens.splice(i, 1); tw.done?.(); } }
  // player movement
  const mv = new THREE.Vector3((keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0), 0, (keys.has("s") || keys.has("arrowdown") ? 1 : 0) - (keys.has("w") || keys.has("arrowup") ? 1 : 0));
  const p = player.group.position;
  if (mv.lengthSq() > 0) {
    mv.normalize().multiplyScalar(5.2 * dt); p.add(mv);
    p.x = THREE.MathUtils.clamp(p.x, -16, 16); p.z = THREE.MathUtils.clamp(p.z, -4, 7);
    walkPh += dt * 13;
    player.plane.position.y = Math.abs(Math.sin(walkPh)) * 0.14;
    player.plane.rotation.z = Math.sin(walkPh) * 0.07;
  } else { player.plane.position.y *= 0.8; player.plane.rotation.z *= 0.8; player.plane.scale.y = 1 + Math.sin(clock.elapsedTime * 2.4) * 0.015; }
  // auto-stock when near the stand
  if (state.carry > 0 && p.distanceTo(STAND) < 2.4) {
    state.stock += state.carry; floatText(`Stocked ${state.carry}!`, STAND.clone().add(new THREE.Vector3(0, 2.2, 0)), "#3a7a2a");
    state.carry = 0; squash(stand, 0.12); refreshCarry(); refreshStockPile(); hud();
  }
  // trees regrow
  for (const t of trees) {
    if (t.ripe < 4) { t.regrow -= dt; if (t.regrow <= 0) { const f = t.fruit[t.ripe]; popIn(f); t.ripe++; t.regrow = 3; } }
  }
  // day clock + lighting
  state.t += dt;
  const dayK = state.t / DAY_LEN;
  const dusk = THREE.MathUtils.smoothstep(dayK, 0.72, 1);
  (scene.background as THREE.Color).copy(DAY_SKY).lerp(NIGHT_SKY, dusk * 0.85);
  (scene.fog as THREE.Fog).color.copy(scene.background as THREE.Color);
  sun.intensity = 2.4 * (1 - dusk * 0.7); hemi.intensity = 1.2 * (1 - dusk * 0.45);
  if (state.t >= DAY_LEN) endDay();
  // spawning (busier with level / reputation, quiet at dusk)
  spawnT -= dt;
  if (spawnT <= 0 && dusk < 0.6) { spawn(); spawnT = Math.max(1.1, 5 - level * 0.9 - state.rep * 0.4) * (0.7 + Math.random() * 0.6); }
  // customers
  const queue = custs.filter((c) => c.state === "queue" || c.state === "decide");
  for (const c of custs) {
    const g = c.m.group.position;
    let moving = false;
    if (c.state === "walk") {
      // walk along the road; turn in if the queue isn't too long
      const spot = queueSpot(queue.length);
      if (Math.abs(g.x - STAND.x) < 6 && queue.length < 4) { g.lerp(spot, Math.min(1, dt * 2.2)); moving = true; if (g.distanceTo(spot) < 0.15) { c.state = "queue"; queue.push(c); } }
      else { g.x += c.dir * 2.6 * dt; moving = true; if (Math.abs(g.x) > 24) c.state = "leave"; }
    } else if (c.state === "queue") {
      const idx = queue.indexOf(c);
      const spot = queueSpot(idx);
      if (g.distanceTo(spot) > 0.05) { g.lerp(spot, Math.min(1, dt * 3)); moving = true; }
      if (idx === 0 && g.distanceTo(spot) < 0.2) { c.state = "decide"; c.wait = 0.9; showBubble(c, "🤔"); }
      c.wait += 0; // patience could go here
    } else if (c.state === "decide") {
      c.wait -= dt;
      if (c.wait <= 0) decide(c);
    } else if (c.state === "leave") {
      g.x += c.dir * 3 * dt; g.z += (4.2 - g.z) * dt; moving = true;
    }
    c.m.plane.position.y = moving ? Math.abs(Math.sin(clock.elapsedTime * 12 + c.want)) * 0.1 : c.m.plane.position.y * 0.85;
    c.m.tick(dt, camera);
  }
  for (let i = custs.length - 1; i >= 0; i--) if (custs[i].state === "leave" && Math.abs(custs[i].m.group.position.x) > 24) { scene.remove(custs[i].m.group); custs.splice(i, 1); }
  // particles
  for (let i = parts.length - 1; i >= 0; i--) { const q = parts[i]; q.life -= dt; q.v.y -= 12 * dt; q.o.position.addScaledVector(q.v, dt); q.o.scale.setScalar(Math.max(0.01, q.life)); if (q.life <= 0) { scene.remove(q.o); parts.splice(i, 1); } }
  // camera follows the player softly, framing the stand
  camTarget.lerp(new THREE.Vector3(p.x * 0.6, 0, p.z * 0.3 + 1), Math.min(1, dt * 2.5));
  camera.position.set(camTarget.x, 9.5, camTarget.z + 15);
  camera.lookAt(camTarget.x, 1, camTarget.z);
  player.tick(dt, camera);
  // floating texts
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i]; f.t += dt; f.pos.y += dt * 1.2;
    const s = f.pos.clone().project(camera);
    f.el.style.left = (s.x * 0.5 + 0.5) * innerWidth + "px"; f.el.style.top = (-s.y * 0.5 + 0.5) * innerHeight + "px";
    f.el.style.opacity = String(1 - easeOut(Math.max(0, f.t - 0.6) / 0.6));
    if (f.t > 1.2) { f.el.remove(); floaters.splice(i, 1); }
  }
  hud();
  renderer.render(scene, camera);
}

function decide(c: Cust) {
  const g = c.m.group.position.clone().add(new THREE.Vector3(0, 1.6, 0));
  if (state.stock <= 0) {
    showBubble(c, "😢"); c.m.setExpr("neutral"); state.lost++;
    floatText("Sold out!", g, "#c0392b");
  } else if (state.price <= c.want) {
    const delight = state.price <= c.want * 0.6;
    state.stock--; state.money += state.price; state.earned += state.price; state.sold++;
    state.rep = Math.min(4, state.rep + (delight ? 0.05 : 0.02));
    showBubble(c, delight ? "😍" : "🙂"); c.m.setExpr(delight ? "wow" : "happy");
    squash(c.m.plane, 0.3); squash(stand, 0.08);
    burst(STAND.clone().add(new THREE.Vector3(0, 1.2, 0.6)), 6, "#ffd84a");
    floatText(`+${state.price}`, g, "#3a7a2a");
    flyToHud(g);
    refreshStockPile();
  } else {
    showBubble(c, state.price > c.want * 1.6 ? "😡" : "😒"); c.m.setExpr("angry"); state.lost++;
    state.rep = Math.max(0.6, state.rep - 0.03);
    floatText("Too pricey!", g, "#c0392b");
  }
  c.state = "leave";
  c.dir = Math.random() < 0.5 ? -1 : 1;
}

let paused = false;
function endDay() {
  if (paused) return;
  paused = true;
  const s = $("summary");
  s.innerHTML = `<h2>End of day ${state.day}</h2><p>Sold <b>${state.sold}</b> bananas</p><p>Earned <b>🍌${state.earned}</b></p><p>Missed customers: <b>${state.lost}</b></p><p>Reputation: <b>${"★".repeat(Math.round(state.rep))}</b></p><button id="nextday">Start day ${state.day + 1}</button>`;
  s.classList.remove("hidden");
  $("nextday").onclick = () => {
    s.classList.add("hidden");
    state.day++; state.t = 0; state.sold = state.lost = state.earned = 0; paused = false;
    clock.getDelta();
  };
}

// the end-of-day summary pauses the world
function loop() {
  if (paused) { clock.getDelta(); renderer.render(scene, camera); } else frame();
  requestAnimationFrame(loop);
}
buildLevel(0);
(window as any).__dbg = { state, hud };
loop();
toast("Pick bananas from the trees on the left (E), then walk to your stand");
