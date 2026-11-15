// Bananaville raid prototype R1 (DESIGN.md section 9; Fable 5.2 advisor scope).
// One jungle area from a text map, 3 hearts, briefcase bonk + dodge roll, grunt / brute / the Sleeper,
// an 8-slot pack whose best 2 items sit safe in the cheek pouch, crate tiers with a rarity pop,
// a locked vine door and its key, two exits (gate home, raft with a sale bonus), and a one-minute home screen.
// Keyboard-only friendly (Mac trackpad rule): bonks go the way you face, with a soft lock-on.
import * as THREE from "three";
import { MonkeyCard, Look } from "../monkey";
import { inked, box, cyl, ball } from "../toon";
import { initFx, updateFx, popIn, squash, arc, burst, floatText, tween } from "../fx";
import { sfx, unlockAudio } from "../audio";
import { MAP, TILE } from "./map";
import { ITEMS, RARITY_COLOR, CRATE, rollCrate, CrateTier } from "./loot";

type V3 = THREE.Vector3;
const V = (x: number, z: number, y = 0) => new THREE.Vector3(x, y, z);
const flat = (a: V3, b: V3) => Math.hypot(a.x - b.x, a.z - b.z);
const rand = (a: number, b: number) => a + Math.random() * (b - a);

// ---------- tuning (ours) ----------
const P = { speed: 5.8, radius: 0.45, bonkCd: 0.38, bonkWind: 0.08, bonkReach: 1.9, lockOn: 2.8, rollTime: 0.3, rollSpeed: 14, rollCd: 0.75, iframesHurt: 1.0, extract: 3 };
const H = MAP.length, W = MAP[0].length;

// ---------- persistent progress (localStorage) ----------
type Meta = { money: number; up: { slots: number; bonk: number; heart: number }; pouchBonus: number; hats: string[]; hat: string | null; keyring: boolean; order: number; raids: number };
const META_KEY = "bv_r1";
const meta: Meta = Object.assign({ money: 0, up: { slots: 0, bonk: 0, heart: 0 }, pouchBonus: 0, hats: [], hat: null, keyring: false, order: 0, raids: 0 }, JSON.parse(localStorage.getItem(META_KEY) ?? "{}"));
const saveMeta = () => localStorage.setItem(META_KEY, JSON.stringify(meta));
const UPGRADES = {
  slots: { name: "Bigger Pack", icon: "🎒", desc: "+2 pack slots", costs: [60, 140] },
  bonk: { name: "Heavier Briefcase", icon: "💼", desc: "+1 bonk power", costs: [80, 200] },
  heart: { name: "Banana Breakfast", icon: "❤️", desc: "+1 heart", costs: [100, 220] },
} as const;
const ORDERS = [
  { need: "golden", n: 2, text: "Mayor Chimp wants 2 Golden Bananas for the town fair", reward: "Cheek pouch +1 safe slot, +$40", give: () => { meta.pouchBonus++; meta.money += 40; } },
  { need: "honey", n: 2, text: "The baker needs 2 Honey Pots", reward: "+$90 and a Lucky Cap", give: () => { meta.money += 90; if (!meta.hats.includes("lucky")) meta.hats.push("lucky"); } },
  { need: "idol", n: 1, text: "A collector will pay big for the Sleeper's Banana Idol", reward: "+$200 and a peek at Banana Boulevard", give: () => { meta.money += 200; } },
];
const maxHearts = () => 3 + meta.up.heart + (meta.hat === "explorer" ? 1 : 0);
const bonkPower = () => 1 + meta.up.bonk + (meta.hat === "bandana" ? 1 : 0);
const packSlots = () => 8 + 2 * meta.up.slots;
const pouchSlots = () => 2 + meta.pouchBonus;

// ---------- renderer ----------
const canvas = document.getElementById("game") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#cfe6b0");
scene.fog = new THREE.Fog("#cfe6b0", 26, 62);
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
const sun = new THREE.DirectionalLight("#fff1d6", 2.2);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 70 });
scene.add(sun, sun.target, new THREE.HemisphereLight("#fff4e0", "#4f8a3a", 1.2));
let camDist = 1;
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight; camDist = camera.aspect < 1 ? 1.3 : 1;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize); resize();
initFx(scene, camera);

// ---------- the map ----------
const tx = (c: number) => (c - W / 2 + 0.5) * TILE, tz = (r: number) => (r - H / 2 + 0.5) * TILE;
const toTile = (p: V3) => ({ r: Math.floor(p.z / TILE + H / 2), c: Math.floor(p.x / TILE + W / 2) });
const find = (ch: string) => { const o: { r: number; c: number }[] = []; MAP.forEach((row, r) => [...row].forEach((x, c) => { if (x === ch) o.push({ r, c }); })); return o; };
let doorOpen = false;
const charAt = (r: number, c: number) => (r < 0 || r >= H || c < 0 || c >= W ? "#" : MAP[r][c]);
/** walls for movement: thicket, river, palms, and the door while it's shut */
const solid = (r: number, c: number) => { const ch = charAt(r, c); return ch === "#" || ch === "~" || ch === "T" || (ch === "D" && !doorOpen); };

const ground = new THREE.Mesh(new THREE.PlaneGeometry(W * TILE + 40, H * TILE + 40), new THREE.MeshToonMaterial({ color: "#6fae4f" }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
{ // trails and river as instanced tiles; thicket as instanced bushes with ink hulls
  const tileGeo = new THREE.PlaneGeometry(TILE, TILE); tileGeo.rotateX(-Math.PI / 2);
  const trail = find(","), river = find("~");
  const mk = (list: { r: number; c: number }[], color: string, y: number) => {
    const im = new THREE.InstancedMesh(tileGeo, new THREE.MeshToonMaterial({ color }), list.length);
    const m = new THREE.Matrix4();
    list.forEach((t, i) => im.setMatrixAt(i, m.makeTranslation(tx(t.c), y, tz(t.r))));
    im.receiveShadow = true; scene.add(im);
  };
  mk(river, "#4fb3d9", 0.02);
  { // trails: a winding dirt strip down the middle of each trail tile, not a full sandy square
    const list = [...trail, ...find("G"), ...find("R")];
    const g = new THREE.CircleGeometry(1.05, 10); g.rotateX(-Math.PI / 2);
    const isTrail = (r: number, c: number) => ",GR".includes(charAt(r, c));
    const spots: V3[] = [];
    for (const t of list) { // a blob on each trail tile, plus blobs bridging to trail neighbours: a continuous winding path
      spots.push(V(tx(t.c) + rand(-0.3, 0.3), tz(t.r) + rand(-0.3, 0.3)));
      for (const [dr, dc] of [[0, 1], [1, 0]]) if (isTrail(t.r + dr, t.c + dc)) for (const k of [0.33, 0.66]) spots.push(V(tx(t.c + dc * k) + rand(-0.25, 0.25), tz(t.r + dr * k) + rand(-0.25, 0.25)));
    }
    const im = new THREE.InstancedMesh(g, new THREE.MeshToonMaterial({ color: "#d9b67d" }), spots.length);
    const m = new THREE.Matrix4();
    spots.forEach((p, i) => im.setMatrixAt(i, m.compose(p.setY(0.012), new THREE.Quaternion(), new THREE.Vector3(rand(0.95, 1.2), 1, rand(0.95, 1.2)))));
    im.receiveShadow = true; scene.add(im);
  }
  { // jungle floor clutter: grass tufts, ferns, flowers, pebbles (decoration only, never blocking)
    const floor = [...find("."), ...find(","), ...find("c"), ...find("g"), ...find("y"), ...find("1"), ...find("2")];
    const tuft = new THREE.ConeGeometry(0.12, 0.5, 4), fern = new THREE.SphereGeometry(0.45, 8, 6), flower = new THREE.SphereGeometry(0.09, 6, 5), pebble = new THREE.DodecahedronGeometry(0.18);
    const lists = { tuft: [] as THREE.Matrix4[], fern: [] as THREE.Matrix4[], flower: [] as THREE.Matrix4[], pebble: [] as THREE.Matrix4[] };
    const Q = new THREE.Quaternion(), S = (x: number, y = x) => new THREE.Vector3(x, y, x);
    for (const t of floor) {
      const onTrail = charAt(t.r, t.c) === ",";
      for (let k = 0; k < (onTrail ? 3 : 7); k++) {
        let x = tx(t.c) + rand(-1.5, 1.5), z = tz(t.r) + rand(-1.5, 1.5);
        if (onTrail && Math.abs(x - tx(t.c)) < 1.1) x += Math.sign(x - tx(t.c) || 1) * 1.1;
        const r = Math.random();
        if (r < 0.5) for (let j = 0; j < 3; j++) lists.tuft.push(new THREE.Matrix4().compose(V(x + rand(-0.15, 0.15), z + rand(-0.15, 0.15), 0.22), new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(-0.3, 0.3), 0, rand(-0.3, 0.3))), S(rand(0.8, 1.3))));
        else if (r < 0.7 && !onTrail) lists.fern.push(new THREE.Matrix4().compose(V(x, z, 0.12), Q, S(rand(0.7, 1.3), rand(0.35, 0.55))));
        else if (r < 0.88) lists.flower.push(new THREE.Matrix4().compose(V(x, z, 0.18), Q, S(1)));
        else lists.pebble.push(new THREE.Matrix4().compose(V(x, z, 0.06), Q, S(rand(0.6, 1.4), rand(0.5, 0.8))));
      }
    }
    const put = (geo: THREE.BufferGeometry, color: string, ms: THREE.Matrix4[], tint?: string[]) => {
      const im = new THREE.InstancedMesh(geo, new THREE.MeshToonMaterial({ color: tint ? "#ffffff" : color }), ms.length);
      ms.forEach((m, i) => { im.setMatrixAt(i, m); if (tint) im.setColorAt(i, new THREE.Color(tint[i % tint.length])); });
      scene.add(im);
    };
    put(tuft, "#5aa045", lists.tuft); put(fern, "#4f9a3e", lists.fern); put(flower, "", lists.flower, ["#fff6e6", "#ffd84a", "#ff9ec4", "#e8493a"]); put(pebble, "#b9ad98", lists.pebble);
  }
  const bushes: THREE.Matrix4[] = [], greens = ["#3f8a34", "#4f9a3e", "#357a2c", "#5aa045"];
  const colors: THREE.Color[] = [];
  find("#").forEach(({ r, c }) => {
    const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => { const ch = charAt(r + dr, c + dc); return ch !== "#" && ch !== "~"; });
    const n = edge ? 3 : 1;
    for (let k = 0; k < n; k++) {
      const s = edge ? rand(0.9, 1.5) : 2.0;
      const m = new THREE.Matrix4().compose(V(tx(c) + rand(-0.8, 0.8), tz(r) + rand(-0.8, 0.8), s * 0.55), new THREE.Quaternion(), new THREE.Vector3(s, s * rand(0.8, 1.1), s));
      bushes.push(m); colors.push(new THREE.Color(greens[(r * 7 + c * 3 + k) % 4]));
    }
    if (edge && (r * 13 + c * 7) % 5 === 0) { // a palm sticking out of the thicket
      scene.add(cyl(0.16, 0.24, 3.4, "#8a5a34", tx(c), 0, tz(r), 7));
      const crown = ball(1.3, "#4f9440", tx(c), 3.6, tz(r)); crown.scale.y = 0.55; scene.add(crown);
    }
  });
  const geo = new THREE.SphereGeometry(1, 12, 9);
  const im = new THREE.InstancedMesh(geo, new THREE.MeshToonMaterial({ color: "#ffffff" }), bushes.length);
  const hull = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0x2a1a12, side: THREE.BackSide }), bushes.length);
  const big = new THREE.Matrix4().makeScale(1.05, 1.05, 1.05);
  bushes.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, colors[i]); hull.setMatrixAt(i, m.clone().multiply(big)); });
  im.castShadow = true; scene.add(im, hull);
}
const palms = find("T").map(({ r, c }) => {
  const g = new THREE.Group(); g.position.set(tx(c), 0, tz(r));
  g.add(cyl(0.2, 0.3, 3.0, "#9a6a3e", 0, 0, 0, 8));
  for (let i = 0; i < 6; i++) {
    const leaf = inked(new THREE.ConeGeometry(0.3, 1.6, 4), i % 2 ? "#5fb04a" : "#4f9a3e", 0.03);
    leaf.position.set(0, 3.0, 0); leaf.rotation.set(Math.PI / 2.4, (i / 6) * Math.PI * 2, 0, "YXZ"); leaf.children.forEach((ch) => ch.translateY(0.7)); g.add(leaf);
  }
  scene.add(g); return g;
});
void palms;
const GATE = find("G")[0], RAFT = find("R")[0], DOOR = find("D")[0];
const gatePos = V(tx(GATE.c), tz(GATE.r)), raftPos = V(tx(RAFT.c), tz(RAFT.r));
function sign(text: string, bg: string, w: number) {
  const c = document.createElement("canvas"); c.width = 512; c.height = 128;
  const x = c.getContext("2d")!; x.fillStyle = bg; x.fillRect(0, 0, 512, 128); x.lineWidth = 14; x.strokeStyle = "#2a1a12"; x.strokeRect(7, 7, 498, 114);
  x.fillStyle = "#2a1a12"; x.font = "bold 62px Trebuchet MS"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(text, 256, 68, 480);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshBasicMaterial({ map: t }));
}
{ // home gate
  const g = new THREE.Group(); g.position.copy(gatePos).setZ(gatePos.z + 1.2);
  g.add(cyl(0.18, 0.2, 2.6, "#8a5a34", -1.6, 0, 0, 8), cyl(0.18, 0.2, 2.6, "#8a5a34", 1.6, 0, 0, 8));
  const s = sign("HOME", "#ffe066", 2.6); s.position.set(0, 2.5, 0); g.add(s); scene.add(g);
}
{ // the raft on the river
  const g = new THREE.Group(); g.position.copy(raftPos).setZ(raftPos.z - 1.8);
  for (let i = 0; i < 5; i++) { const l = cyl(0.22, 0.22, 2.4, "#a8743f", -0.9 + i * 0.45, 0, 0, 8); l.rotation.x = Math.PI / 2; l.position.y = 0.25; g.add(l); }
  g.add(cyl(0.05, 0.05, 2.2, "#5a3f28", 0.6, 0.3, 0, 6));
  const flag = box(0.9, 0.5, 0.04, "#e8493a", 1.05, 1.9, 0); g.add(flag);
  const s = sign("RAFT +30%", "#bfe8ff", 2.4); s.position.set(0, 2.8, 0.6); g.add(s); scene.add(g);
}
const door = new THREE.Group();
{ // the vine door: visible on raid 1, the key is deeper in
  door.position.set(tx(DOOR.c), 0, tz(DOOR.r));
  door.add(box(0.5, 2.6, 3.0, "#7a5230", 0, 0, 0));
  for (let i = 0; i < 5; i++) door.add(box(0.56, 0.18, 3.05, "#3f8a34", 0, 0.3 + i * 0.5, 0));
  const lock = sign("🗝️ LOCKED", "#ffd84a", 1.8); lock.position.set(-0.32, 1.6, 0); lock.rotation.y = -Math.PI / 2; door.add(lock);
  scene.add(door);
}
function ringMesh(r: number, color: string, thick = 0.12) {
  const m = new THREE.Mesh(new THREE.RingGeometry(r - thick, r, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.03; m.renderOrder = 2; return m;
}
const exits = [{ id: "gate", pos: gatePos, ring: ringMesh(1.8, "#ffe066"), fill: null as THREE.Mesh | null, bonus: 0 }, { id: "raft", pos: raftPos, ring: ringMesh(1.8, "#7fd4ff"), fill: null as THREE.Mesh | null, bonus: 0.3 }];
exits.forEach((e) => { e.ring.position.set(e.pos.x, 0.03, e.pos.z); scene.add(e.ring); });

// ---------- shared sprites ----------
const iconTex = new Map<string, THREE.CanvasTexture>();
function iconSprite(emoji: string, size = 0.7, ringColor = "#ffffff") {
  const key = emoji + ringColor;
  let t = iconTex.get(key);
  if (!t) {
    const c = document.createElement("canvas"); c.width = c.height = 128; const x = c.getContext("2d")!;
    x.fillStyle = "#fff"; x.strokeStyle = ringColor === "#ffffff" ? "#2a1a12" : ringColor; x.lineWidth = 12;
    x.beginPath(); x.arc(64, 64, 52, 0, Math.PI * 2); x.fill(); x.stroke();
    x.font = "64px serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(emoji, 64, 70);
    t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; iconTex.set(key, t);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false }));
  s.scale.setScalar(size); s.renderOrder = 12; return s;
}

// ---------- player ----------
const BOSS: Look = { fur: "#c8682c", suit: "#3a3340", tie: "#ff8a2a", hat: "bowler", hatBand: "#ff8a2a", shades: true };
const player = new MonkeyCard(BOSS, 1.7);
scene.add(player.group);
const pp = player.group.position;
const hatIcon = new THREE.Group(); player.group.add(hatIcon);
function showHat() {
  hatIcon.clear();
  if (meta.hat) { const s = iconSprite(ITEMS[meta.hat].icon, 0.55, RARITY_COLOR[ITEMS[meta.hat].rarity]); s.position.set(0.55, 2.05, 0); hatIcon.add(s); }
}
const swipe = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.9, 24, 1, -Math.PI * 0.32, Math.PI * 0.64), new THREE.MeshBasicMaterial({ color: "#fff6e6", transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
swipe.rotation.x = -Math.PI / 2; swipe.position.y = 0.6; scene.add(swipe);
const st = { hearts: 3, pack: [] as string[], face: V(0, -1), vel: new THREE.Vector3(), bonkCd: 0, wind: 0, rollT: 0, rollCd: 0, rollDir: V(0, -1), iframes: 0, knock: new THREE.Vector3(), lastHurt: -9, alive: true, extractT: 0, at: "" };
const plainMat = (m: MonkeyCard) => m.plane.material as THREE.MeshBasicMaterial;

// ---------- the pack: the best N items sit safe in the cheek pouch ----------
const worth = (id: string) => (ITEMS[id].kind === "key" ? 999 : ITEMS[id].value);
function sortPack() { st.pack.sort((a, b) => worth(b) - worth(a)); }
const safeCount = () => Math.min(st.pack.length, pouchSlots());
function addToPack(id: string) {
  const d = ITEMS[id];
  if (d.kind === "hat" && !meta.hat) { // a find you use on the spot
    meta.hat = id; if (!meta.hats.includes(id)) meta.hats.push(id); showHat(); saveMeta();
    toast(`${d.icon} ${d.name} on! ${d.perk}`); if (id === "explorer") st.hearts++;
    updateHud(); return true;
  }
  if (st.pack.length >= packSlots()) return false;
  st.pack.push(id); sortPack(); updateHud(); return true;
}

// ---------- crates ----------
type Crate = { tier: CrateTier; g: THREE.Group; lid: THREE.Object3D; pos: V3; open: boolean; prog: number; ring: THREE.Mesh; key: boolean };
const crates: Crate[] = [];
function makeCrate(tier: CrateTier, pos: V3, key = false): Crate {
  const t = CRATE[tier], g = new THREE.Group(); g.position.copy(pos);
  g.add(box(1.2, 0.7, 0.9, t.color, 0, 0, 0), box(1.24, 0.14, 0.94, t.band, 0, 0.28, 0));
  const lid = box(1.26, 0.16, 0.96, t.band, 0, 0.7, 0); g.add(lid);
  if (tier === "gold") g.add(box(0.2, 0.22, 0.05, "#fff3a0", 0, 0.35, 0.47));
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.18, 40, 1, Math.PI / 2, 0.001), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(pos.x, 0.04, pos.z); ring.visible = false;
  const glow = ringMesh(0.95, tier === "wood" ? "#fff6e6" : tier === "green" ? "#8fe08a" : "#ffd84a", 0.1); glow.position.set(0, 0.03, 0); g.add(glow); glow.name = "glow";
  scene.add(g, ring);
  return { tier, g, lid, pos: pos.clone(), open: false, prog: 0, ring, key };
}
function openCrate(c: Crate) {
  c.open = true; c.ring.visible = false; const glow = c.g.getObjectByName("glow"); if (glow) glow.visible = false;
  tween(0.3, (k) => { c.lid.position.y = 0.7 + k * 0.5; c.lid.rotation.z = -k * 1.2; c.lid.position.x = -k * 0.4; });
  const roll = rollCrate(c.tier, meta.hat === "lucky", new Set(meta.hats));
  if (c.key) roll.push("key");
  let best = 0;
  roll.forEach((id, i) => {
    const a = (i / roll.length) * Math.PI * 2 + Math.random();
    dropItem(id, c.pos.clone().setY(0.9), c.pos.clone().add(V(Math.cos(a) * 1.3, Math.sin(a) * 1.3)), i * 0.08);
    best = Math.max(best, ["common", "uncommon", "rare", "epic"].indexOf(ITEMS[id].rarity));
  });
  const col = Object.values(RARITY_COLOR)[best];
  sfx(best >= 2 ? "rare" : "crate"); burst(c.pos.clone().setY(1), 10 + best * 8, col, 1 + best * 0.2);
  if (best >= 2) { beam(c.pos, col); floatText(best === 3 ? "EPIC!" : "RARE!", c.pos.clone().setY(2.6), col, 30); trauma = Math.min(1, trauma + 0.2); }
  noise(c.pos, 0.5); log.crates++;
}
function beam(at: V3, color: string) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 9, 12, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }));
  m.position.copy(at).setY(4.5); scene.add(m);
  tween(1.6, (k) => { (m.material as THREE.MeshBasicMaterial).opacity = 0.45 * (1 - k); m.scale.set(1 + k, 1, 1 + k); }, () => scene.remove(m));
}

// ---------- items on the ground ----------
type Drop = { id: string; s: THREE.Sprite; ring: THREE.Mesh; pos: V3; t: number; ready: number };
const drops: Drop[] = [];
function dropItem(id: string, from: V3, to: V3, delay = 0) {
  const d = ITEMS[id], col = RARITY_COLOR[d.rarity];
  const s = iconSprite(d.icon, 0.75, col === RARITY_COLOR.common ? "#ffffff" : col);
  const ring = ringMesh(0.55, col, 0.1); ring.position.set(to.x, 0.04, to.z);
  const dr: Drop = { id, s, ring, pos: to.clone(), t: 0, ready: 0.5 + delay };
  setTimeout(() => { scene.add(ring); arc(s, from, () => to.clone().setY(0.6), 0.35, 1.4, () => squash(s, 0.3, 0.2)); }, delay * 1000);
  drops.push(dr);
}
function removeDrop(i: number) { scene.remove(drops[i].s, drops[i].ring); drops.splice(i, 1); }
let swapOffer: number | null = null;
function updateDrops(dt: number) {
  swapOffer = null;
  let bestOffer = -1;
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i]; d.t += dt; d.ready -= dt;
    if (d.s.parent && d.ready < 0) d.s.position.y = 0.6 + Math.sin(d.t * 3) * 0.08;
    if (d.ready > 0 || flat(pp, d.pos) > 1.2 || !st.alive) continue;
    if (addToPack(d.id)) {
      const s = d.s; drops.splice(i, 1); scene.remove(d.ring);
      arc(s, s.position.clone(), () => pp.clone().setY(1.6), 0.18, 0.8, () => scene.remove(s));
      sfx("pick"); floatText(`${ITEMS[d.id].icon} ${ITEMS[d.id].name}`, pp.clone().setY(2.5), RARITY_COLOR[ITEMS[d.id].rarity] === RARITY_COLOR.common ? "#2a1a12" : RARITY_COLOR[ITEMS[d.id].rarity], 20);
      if (d.id === "key") toast("🗝️ The Vine Key! It opens the locked door in the middle of the jungle");
    } else if (worth(d.id) > worth(st.pack[st.pack.length - 1])) { if (worth(d.id) > bestOffer) { bestOffer = worth(d.id); swapOffer = i; } }
  }
}
function doSwap() {
  if (swapOffer === null) return;
  const d = drops[swapOffer], out = st.pack.pop()!;
  dropItem(out, pp.clone().setY(1.4), pp.clone().add(V(rand(-1, 1), rand(-1, 1))));
  removeDrop(swapOffer); st.pack.push(d.id); sortPack(); sfx("pick"); log.swaps++;
  floatText(`swapped ${ITEMS[out].icon} → ${ITEMS[d.id].icon}`, pp.clone().setY(2.5), "#2a1a12", 20); updateHud();
}

// ---------- enemies ----------
type Kind = "grunt" | "brute" | "sleeper";
type Enemy = {
  kind: Kind; m: MonkeyCard; p: V3; home: V3; hp: number; max: number; state: string; t: number; face: V3; vel: V3;
  sack: string[]; stolen: string[]; bar: ReturnType<typeof hpBar>; z: number; quiet: number; ring: THREE.Mesh | null; stripe: THREE.Group | null; lostT: number;
};
const enemies: Enemy[] = [];
function hpBar() {
  const c = document.createElement("canvas"); c.width = 128; c.height = 20; const x = c.getContext("2d")!;
  const t = new THREE.CanvasTexture(c); const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false }));
  s.scale.set(1.1, 0.17, 1); s.renderOrder = 13; s.visible = false;
  return { s, draw: (k: number) => { x.clearRect(0, 0, 128, 20); x.fillStyle = "#2a1a12"; x.fillRect(0, 0, 128, 20); x.fillStyle = k > 0.5 ? "#8fd18a" : k > 0.25 ? "#ffcc3d" : "#e8493a"; x.fillRect(3, 3, 122 * k, 14); t.needsUpdate = true; s.visible = true; } };
}
const LOOKS: Record<Kind, [Look, number]> = {
  grunt: [{ fur: "#8a5a34", suit: "#3a3340", hat: "none", mask: true, stripes: "#fff6e6" }, 1.35],
  brute: [{ fur: "#6a4428", suit: "#5a3a2a", hat: "cap", hatBand: "#3a3340", mask: true }, 2.2],
  sleeper: [{ fur: "#4f4a58", suit: "#4f4a58", hat: "none" }, 3.0],
};
function spawnEnemy(kind: Kind, at: V3) {
  const [look, h] = LOOKS[kind], m = new MonkeyCard(look, h);
  m.group.position.copy(at); scene.add(m.group);
  const max = kind === "grunt" ? 2 : kind === "brute" ? 6 : 8;
  const e: Enemy = { kind, m, p: m.group.position, home: at.clone(), hp: max, max, state: kind === "sleeper" ? "sleep" : "patrol", t: rand(0, 2), face: V(0, 1), vel: new THREE.Vector3(), sack: [], stolen: [], bar: hpBar(), z: 3, quiet: 0, ring: null, stripe: null, lostT: 0 };
  e.bar.s.position.set(0, h + 0.35, 0); m.group.add(e.bar.s);
  if (kind === "grunt") { e.sack = rollCrate("wood"); const sack = ball(0.36, "#9a7a4a", 0.55, 1.0, -0.4); m.group.add(sack); }
  if (kind === "brute") { e.sack = rollCrate("green"); m.setExpr("angry"); }
  if (kind === "sleeper") {
    m.setExpr("blink");
    for (let i = 0; i < 3; i++) { const s = iconSprite("💤", 0.55 - i * 0.06); s.position.set(0.7 + i * 0.35, 3.1 + i * 0.45, 0); s.name = "z" + i; m.group.add(s); }
  }
  enemies.push(e); return e;
}
// grid pathfinding: a distance field toward the player, rebuilt a few times a second while anyone chases
let field = new Int16Array(W * H).fill(-1), fieldT = 0;
function buildField() {
  field.fill(-1);
  const s = toTile(pp); if (solid(s.r, s.c)) return;
  const q = [s.r * W + s.c]; field[q[0]] = 0;
  for (let h = 0; h < q.length; h++) {
    const i = q[h], r = Math.floor(i / W), c = i % W;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const rr = r + dr, cc = c + dc, j = rr * W + cc;
      if (rr < 0 || rr >= H || cc < 0 || cc >= W || field[j] >= 0 || solid(rr, cc)) continue;
      field[j] = field[i] + 1; q.push(j);
    }
  }
}
/** line of sight across the tile grid (palms and thicket block it) */
function sees(a: V3, b: V3) {
  const n = Math.ceil(flat(a, b) / 0.8);
  for (let i = 1; i < n; i++) { const p = a.clone().lerp(b, i / n); const t = toTile(p); const ch = charAt(t.r, t.c); if (ch === "#" || ch === "T" || (ch === "D" && !doorOpen)) return false; }
  return true;
}
function stepToward(e: Enemy, target: V3, speed: number, dt: number) {
  let goal = target;
  if (target === pp && !sees(e.p, target)) { // only the chase uses the distance field (it points at the player)
    const t = toTile(e.p); let best = field[t.r * W + t.c], bt: { r: number; c: number } | null = null;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const v = field[(t.r + dr) * W + t.c + dc]; if (v >= 0 && (best < 0 || v < best)) { best = v; bt = { r: t.r + dr, c: t.c + dc }; } }
    if (bt) goal = V(tx(bt.c), tz(bt.r));
  }
  const d = V(goal.x - e.p.x, goal.z - e.p.z); const l = d.length();
  if (l < 0.05) { e.vel.set(0, 0, 0); return; }
  d.multiplyScalar(1 / l); e.face.copy(d); e.vel.copy(d).multiplyScalar(speed);
  e.p.addScaledVector(d, Math.min(l, speed * dt)); collide(e.p, e.kind === "brute" ? 0.7 : 0.45);
}
function collide(p: V3, rad: number) {
  const t = toTile(p);
  for (let r = t.r - 1; r <= t.r + 1; r++) for (let c = t.c - 1; c <= t.c + 1; c++) {
    if (!solid(r, c)) continue;
    const ch = charAt(r, c);
    if (ch === "T") { const cpos = V(tx(c), tz(r)); const d = flat(p, cpos), rr = rad + 0.5; if (d < rr && d > 0.001) { p.x = cpos.x + (p.x - cpos.x) * rr / d; p.z = cpos.z + (p.z - cpos.z) * rr / d; } continue; }
    const x0 = tx(c) - TILE / 2, x1 = tx(c) + TILE / 2, z0 = tz(r) - TILE / 2, z1 = tz(r) + TILE / 2;
    const cx = THREE.MathUtils.clamp(p.x, x0, x1), cz = THREE.MathUtils.clamp(p.z, z0, z1);
    const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
    if (d < rad) { if (d > 0.0001) { p.x = cx + dx / d * rad; p.z = cz + dz / d * rad; } else p.z = z1 + rad; }
  }
  for (const c of crates) { const d = flat(p, c.pos), rr = rad + 0.55; if (d < rr && d > 0.001) { p.x = c.pos.x + (p.x - c.pos.x) * rr / d; p.z = c.pos.z + (p.z - c.pos.z) * rr / d; } }
}
function alert(e: Enemy) {
  if (e.state !== "patrol") return;
  e.state = "notice"; e.t = e.kind === "brute" ? 0.6 : 0.45;
  const a = iconSprite("❗", 0.5); a.position.set(0, e.m.height + 0.7, 0); e.m.group.add(a); setTimeout(() => e.m.group.remove(a), 600);
  sfx("nope");
  for (const o of enemies) if (o !== e && o.kind !== "sleeper" && flat(o.p, e.p) < 8) setTimeout(() => alert(o), 250); // calls its friends
}
function hurtPlayer(from: V3, steal: Enemy | null) {
  if (st.iframes > 0 || !st.alive || st.rollT > 0) return false;
  st.hearts--; st.iframes = P.iframesHurt; st.lastHurt = gameT; log.heartsLost++;
  st.knock.set(pp.x - from.x, 0, pp.z - from.z).normalize().multiplyScalar(7);
  hitStop = 0.07; trauma = Math.min(1, trauma + 0.55); sfx("hurt"); squash(player.body, 0.35, 0.3); player.flash("wow", 600);
  const hurtEl = document.getElementById("hurt")!; hurtEl.classList.remove("on"); void hurtEl.offsetWidth; hurtEl.classList.add("on");
  floatText("-1 ❤️", pp.clone().setY(2.4), "#e8493a", 26);
  if (steal && st.pack.length > safeCount()) { // the grunt grabs your best loose item and runs
    const loose = st.pack.splice(safeCount(), 1)[0]; steal.stolen.push(loose);
    floatText(`${ITEMS[loose].icon} snatched!`, steal.p.clone().setY(2.2), "#c0392b", 22); steal.state = "flee"; steal.t = 2.5; updateHud();
  }
  updateHud();
  if (st.hearts <= 0) bonkOut();
  return true;
}
function damage(e: Enemy, n: number) {
  e.hp -= n; e.bar.draw(Math.max(0, e.hp) / e.max);
  const mat = plainMat(e.m); mat.color.setRGB(3, 3, 3); setTimeout(() => mat.color.setRGB(1, 1, 1), 70);
  squash(e.m.body, 0.25, 0.2); burst(e.p.clone().setY(1.2), 10, "#ffe066", 0.9);
  floatText("BONK!", e.p.clone().setY(e.m.height + 0.6), "#e8493a", 24);
  if (e.hp <= 0) defeat(e);
}
function defeat(e: Enemy) {
  e.state = "down"; e.vel.set(0, 0, 0); e.bar.s.visible = false;
  plainMat(e.m).color.setRGB(0.75, 0.75, 0.75); e.m.setExpr("wow");
  const stars = iconSprite("💫", 0.6); stars.position.set(0, e.m.height * 0.75, 0); e.m.group.add(stars);
  tween(0.35, (k) => { e.m.body.rotation.z = -k * 1.35; e.m.body.position.y = -k * 0.25; });
  const loot = [...e.stolen, ...e.sack]; if (Math.random() < 0.3) loot.push("smoothie");
  if (e.kind === "sleeper") { loot.push(...rollCrate("gold", meta.hat === "lucky"), "idol"); floatText("THE SLEEPER IS OUT COLD!", e.p.clone().setY(4), "#c77dff", 34); trauma = 1; beam(e.p, RARITY_COLOR.epic); sfx("rare"); }
  loot.forEach((id, i) => { const a = (i / loot.length) * Math.PI * 2; dropItem(id, e.p.clone().setY(1.2), e.p.clone().add(V(Math.cos(a) * 1.4, Math.sin(a) * 1.4)), i * 0.07); });
  e.stolen = []; e.sack = []; log.kills[e.kind]++;
}
function noise(at: V3, n: number) {
  for (const e of enemies) {
    if (e.kind === "sleeper" && e.state === "sleep" && flat(at, e.p) < 14) {
      const before = Math.ceil(e.z); e.z = Math.max(0, e.z - n); e.quiet = 0;
      for (let i = Math.ceil(e.z); i < before; i++) { const z = e.m.group.getObjectByName("z" + i); if (z) { z.visible = false; burst(z.getWorldPosition(new THREE.Vector3()), 6, "#cfe8ff", 0.5); } }
      if (Math.ceil(e.z) < before) floatText(e.z > 0 ? `💤 ${Math.ceil(e.z)} left` : "uh oh...", e.p.clone().setY(4.2), "#5a4a6a", 20);
      if (e.z <= 0) wakeSleeper(e);
    } else if (e.kind !== "sleeper" && e.state === "patrol" && flat(at, e.p) < 7 * n) alert(e);
  }
}
function wakeSleeper(e: Enemy) {
  for (let i = 0; i < 3; i++) { const z = e.m.group.getObjectByName("z" + i); if (z) z.visible = false; }
  e.state = "roar"; e.t = 1.2; e.m.setExpr("angry"); log.wakes++;
  floatText("ROOAAR!", e.p.clone().setY(3.8), "#c0392b", 36); trauma = Math.min(1, trauma + 0.6); sfx("hurt");
  if (log.wakes === 1) toast("The Sleeper is awake! Dodge his charge so he hits a tree, then bonk him while he's dizzy");
}
/** a ground stripe that points along e.face: the charge telegraph */
function stripeFor(e: Enemy, len: number, w: number, color: string) {
  if (!e.stripe) {
    const g = new THREE.PlaneGeometry(w, 1); g.translate(0, 0.5, 0);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = Math.PI / 2; m.renderOrder = 3; // the plane's +y now runs along the holder's +z
    e.stripe = new THREE.Group(); e.stripe.add(m);
  }
  const m = e.stripe.children[0] as THREE.Mesh; m.scale.y = len;
  e.stripe.position.set(e.p.x, 0.05, e.p.z); e.stripe.rotation.set(0, Math.atan2(e.face.x, e.face.z), 0);
  scene.add(e.stripe); return m.material as THREE.MeshBasicMaterial;
}
function updateEnemy(e: Enemy, dt: number) {
  e.t -= dt;
  const d = flat(e.p, pp), toP = V(pp.x - e.p.x, pp.z - e.p.z).normalize();
  if (e.kind === "sleeper") return updateSleeper(e, dt, d, toP);
  const sight = e.kind === "brute" ? 8 : 9.5;
  switch (e.state) {
    case "patrol": {
      if (e.t <= 0) { e.t = rand(1.5, 3); const a = Math.random() * Math.PI * 2; e.face.set(Math.cos(a), 0, Math.sin(a)); }
      const tgt = e.home.clone().addScaledVector(e.face, 2.5);
      if (flat(e.p, tgt) > 0.4) stepToward(e, tgt, 1.6, dt); else e.vel.set(0, 0, 0);
      if (st.alive && d < sight && (e.face.dot(toP) > -0.2 || d < 3) && sees(e.p, pp)) alert(e);
      break;
    }
    case "notice": e.vel.set(0, 0, 0); e.face.copy(toP); if (e.t <= 0) e.state = "chase"; break;
    case "chase": {
      if (!st.alive) { e.state = "return"; break; }
      stepToward(e, pp, e.kind === "brute" ? 3.4 : 4.7, dt);
      if (d > 16 || !sees(e.p, pp)) { e.lostT += dt; if (e.lostT > 4) { e.state = "return"; e.lostT = 0; } } else e.lostT = 0;
      if (e.kind === "grunt" && d < 1.5) { e.state = "windup"; e.t = 0.45; e.vel.set(0, 0, 0); plainMat(e.m).color.setRGB(1.9, 0.6, 0.6); sfx("swing"); }
      if (e.kind === "brute" && d < 2.3) {
        e.state = "windup"; e.t = 0.9; e.vel.set(0, 0, 0); plainMat(e.m).color.setRGB(1.9, 0.7, 0.4);
        if (!e.ring) e.ring = ringMesh(2.4, "#ff8a2a", 0.25);
        e.ring.position.set(e.p.x, 0.04, e.p.z); scene.add(e.ring); e.ring.scale.setScalar(0.2);
      }
      break;
    }
    case "windup":
      if (e.kind === "brute" && e.ring) { const k = 1 - e.t / 0.9; e.ring.scale.setScalar(0.2 + k * 0.8); (e.ring.material as THREE.MeshBasicMaterial).opacity = 0.4 + k * 0.5; e.m.body.scale.y = 1 + k * 0.15; }
      if (e.t <= 0) {
        plainMat(e.m).color.setRGB(1, 1, 1);
        if (e.kind === "grunt") { if (d < 1.8) hurtPlayer(e.p, e); if ((e.state as string) !== "flee") { e.state = "recover"; e.t = 0.55; } }
        else { // the slam
          e.m.body.scale.y = 1; if (e.ring) scene.remove(e.ring);
          burst(e.p.clone().setY(0.2), 22, "#c9a46a", 1.3); trauma = Math.min(1, trauma + 0.35); sfx("hit");
          if (d < 2.4) hurtPlayer(e.p, null);
          e.state = "recover"; e.t = 1.3; noise(e.p, 0.3);
        }
      }
      break;
    case "recover": e.vel.set(0, 0, 0); if (e.t <= 0) e.state = "chase"; break;
    case "flee": stepToward(e, e.p.clone().addScaledVector(toP, -3), 5.0, dt); if (e.t <= 0) e.state = "chase"; break;
    case "return": stepToward(e, e.home, 2.5, dt); if (flat(e.p, e.home) < 0.6) e.state = "patrol"; if (st.alive && d < 6 && sees(e.p, pp)) e.state = "chase"; break;
  }
}
const HOLLOW_Z = tz(10); // the Sleeper never leaves his hollow
function updateSleeper(e: Enemy, dt: number, d: number, toP: V3) {
  switch (e.state) {
    case "sleep":
      e.quiet += dt; e.m.body.scale.y = 0.94 + Math.sin(gameT * 1.6) * 0.03;
      if (e.z < 3 && e.quiet > 10) { e.quiet = 0; const i = Math.ceil(e.z); const z = e.m.group.getObjectByName("z" + Math.min(2, i)); if (i < 3 && z) { z.visible = true; popIn(z); } e.z = Math.min(3, Math.floor(e.z) + 1); }
      break;
    case "roar": e.m.body.position.y = Math.abs(Math.sin(gameT * 30)) * 0.08; if (e.t <= 0) { e.m.body.position.y = 0; e.state = "aim"; e.t = 0.9; } break;
    case "aim": {
      if (pp.z > HOLLOW_Z + 4 || !st.alive) { e.state = "back"; if (e.stripe) scene.remove(e.stripe); break; }
      if (e.t > 0.45) e.face.copy(toP);
      const mat = stripeFor(e, 15.6, 1.8, "#ffb04a");
      mat.opacity = e.t < 0.45 ? 0.8 : 0.35 + Math.abs(Math.sin(gameT * 18)) * 0.25;
      if (e.t <= 0) { if (e.stripe) scene.remove(e.stripe); e.state = "charge"; e.t = 2.4; } // he keeps going until he hits something
      break;
    }
    case "charge": {
      const next = e.p.clone().addScaledVector(e.face, 13 * dt), t = toTile(next.clone().addScaledVector(e.face, 0.9));
      e.vel.copy(e.face).multiplyScalar(13);
      if (solid(t.r, t.c) && charAt(t.r, t.c) !== "~" || next.z > HOLLOW_Z + 2) { // rams a tree or the thicket
        e.state = "stunned"; e.t = 3.5; e.vel.set(0, 0, 0); log.rams++;
        const stars = iconSprite("💫", 0.8); stars.name = "stun"; stars.position.set(0, 3.2, 0); e.m.group.add(stars);
        floatText("THUNK! Bonk him now!", e.p.clone().setY(3.8), "#8a5a34", 28); trauma = Math.min(1, trauma + 0.5); hitStop = 0.08; sfx("hit"); e.m.setExpr("wow");
        burst(e.p.clone().setY(1.5), 18, "#7cc24f", 1.2);
        break;
      }
      if (solid(t.r, t.c)) { e.t = 0; }
      e.p.copy(next); collide(e.p, 0.9);
      if (d < 1.4) hurtPlayer(e.p, null);
      if (e.t <= 0) { e.state = "recover"; e.t = 1.0; e.vel.set(0, 0, 0); floatText("skrrt", e.p.clone().setY(3.2), "#5a4a6a", 18); }
      break;
    }
    case "recover": if (e.t <= 0) { e.state = "aim"; e.t = 0.9; } break;
    case "stunned": e.m.body.rotation.z = Math.sin(gameT * 9) * 0.15; if (e.t <= 0) { const s = e.m.group.getObjectByName("stun"); if (s) e.m.group.remove(s); e.m.body.rotation.z = 0; e.m.setExpr("angry"); e.state = "aim"; e.t = 0.9; } break;
    case "back":
      stepToward(e, e.home, 3.5, dt);
      if (flat(e.p, e.home) < 0.5) { e.state = "sleep"; e.z = 3; e.m.setExpr("blink"); e.vel.set(0, 0, 0); for (let i = 0; i < 3; i++) { const z = e.m.group.getObjectByName("z" + i); if (z) { z.visible = true; popIn(z, i * 0.15); } } }
      if (st.alive && pp.z < HOLLOW_Z && d < 12) { e.state = "aim"; e.t = 0.9; }
      break;
  }
}

// ---------- combat input ----------
function nearestTarget() {
  let best: Enemy | null = null, bd = P.lockOn;
  for (const e of enemies) { if (e.state === "down") continue; const d = flat(e.p, pp); if (d < bd) { bd = d; best = e; } }
  return best;
}
function bonk() {
  if (!st.alive || st.bonkCd > 0 || st.rollT > 0) return;
  const t = nearestTarget();
  if (t) st.face.set(t.p.x - pp.x, 0, t.p.z - pp.z).normalize();
  st.bonkCd = P.bonkCd; st.wind = P.bonkWind; sfx("swing"); squash(player.body, 0.2, 0.18);
}
function landBonk() {
  swipe.position.set(pp.x, 0.6, pp.z); swipe.rotation.set(-Math.PI / 2, 0, Math.atan2(st.face.z, st.face.x));
  const mat = swipe.material as THREE.MeshBasicMaterial; mat.opacity = 0.8; tween(0.14, (k) => { mat.opacity = 0.8 * (1 - k); });
  let hit = false;
  for (const e of enemies) {
    if (e.state === "down") continue;
    const d = flat(e.p, pp), dir = V(e.p.x - pp.x, e.p.z - pp.z).normalize();
    const reach = P.bonkReach + (e.kind === "brute" ? 0.4 : e.kind === "sleeper" ? 0.8 : 0);
    if (d > reach || dir.dot(st.face) < 0.3) continue;
    hit = true;
    if (e.kind === "sleeper") {
      if (e.state === "sleep") { e.z = 0; wakeSleeper(e); continue; }
      if (e.state !== "stunned") { floatText("Too tough! Make him hit a tree", e.p.clone().setY(3.6), "#5a4a6a", 20); sfx("nope"); continue; }
      damage(e, bonkPower()); continue;
    }
    if (e.state === "patrol") alert(e);
    damage(e, bonkPower());
    if (e.state !== "down" && e.kind === "grunt") { e.p.addScaledVector(dir, 0.8); collide(e.p, 0.45); if (e.state === "windup" && e.kind === "grunt") { e.state = "recover"; e.t = 0.5; plainMat(e.m).color.setRGB(1, 1, 1); } }
  }
  if (hit) { hitStop = 0.05; trauma = Math.min(1, trauma + 0.15); sfx("hit"); noise(pp, 1); }
}
function roll() {
  if (!st.alive || st.rollCd > 0) return;
  const mv = inputVec();
  st.rollDir.copy(mv.lengthSq() > 0.01 ? mv.normalize() : st.face);
  st.rollT = P.rollTime; st.rollCd = P.rollCd; sfx("roll");
  tween(P.rollTime, (k) => { player.body.rotation.z = -k * Math.PI * 2 * Math.sign(st.rollDir.x || 1); }, () => { player.body.rotation.z = 0; });
  noise(pp, 0.2);
}
function drink() {
  const i = st.pack.indexOf("smoothie");
  if (i < 0 || st.hearts >= maxHearts() || !st.alive) return;
  st.pack.splice(i, 1); st.hearts++; sfx("pick"); floatText("+1 ❤️", pp.clone().setY(2.5), "#e8493a", 26); updateHud();
}

// ---------- input ----------
const keys = new Set<string>();
addEventListener("keydown", (e) => {
  unlockAudio(); const k = e.key.toLowerCase();
  if (homeOpen) return homeKey(k);
  if (keys.has(k)) return; keys.add(k);
  if (k === " " || k === "j") { e.preventDefault(); bonk(); }
  if (k === "shift" || k === "k") roll();
  if (k === "q") drink();
  if (k === "e") doSwap();
});
addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
const joy = { on: false, ox: 0, oy: 0, x: 0, y: 0, t0: 0 };
canvas.addEventListener("pointerdown", (e) => { unlockAudio(); if (e.pointerType === "mouse") { if (e.button === 0) bonk(); return; } joy.on = true; joy.ox = e.clientX; joy.oy = e.clientY; joy.x = joy.y = 0; joy.t0 = performance.now(); });
canvas.addEventListener("pointermove", (e) => { if (!joy.on) return; let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy; const l = Math.hypot(dx, dy); if (l > 55) { dx *= 55 / l; dy *= 55 / l; } joy.x = dx / 55; joy.y = dy / 55; });
canvas.addEventListener("pointerup", (e) => { if (!joy.on) return; joy.on = false; if (performance.now() - joy.t0 < 200 && Math.hypot(joy.x, joy.y) < 0.2) bonk(); joy.x = joy.y = 0; void e; });
function inputVec() {
  const k = (a: string, b: string) => (keys.has(a) || keys.has(b) ? 1 : 0);
  return V(k("d", "arrowright") - k("a", "arrowleft") + joy.x, k("s", "arrowdown") - k("w", "arrowup") + joy.y);
}

// ---------- HUD ----------
const heartsEl = document.getElementById("hearts")!, moneyEl = document.getElementById("money")!, packEl = document.getElementById("pack")!, promptEl = document.getElementById("prompt")!, exitEl = document.getElementById("exitbar")!;
function toast(msg: string) { const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.getElementById("toasts")!.appendChild(t); setTimeout(() => t.remove(), 4200); }
function updateHud() {
  heartsEl.textContent = "❤️".repeat(Math.max(0, st.hearts)) + "🤍".repeat(Math.max(0, maxHearts() - st.hearts));
  moneyEl.textContent = "$" + Math.floor(meta.money);
  const safe = safeCount();
  let html = "";
  for (let i = 0; i < packSlots(); i++) {
    const id = st.pack[i], pouch = i < pouchSlots();
    const r = id ? ITEMS[id].rarity : "common";
    html += `<div class="slot ${pouch ? "pouch" : ""} ${id ? "full" : ""}" style="${id ? `border-color:${RARITY_COLOR[r] === RARITY_COLOR.common ? "#2a1a12" : RARITY_COLOR[r]}` : ""}">${id ? ITEMS[id].icon : ""}${pouch ? '<span class="lock">🐹</span>' : ""}</div>`;
    if (i === pouchSlots() - 1) html += '<div class="sep"></div>';
  }
  void safe;
  packEl.innerHTML = html;
}

// ---------- raid lifecycle ----------
let gameT = 0, raidT = 0, hitStop = 0, trauma = 0, homeOpen = false;
const log = { id: Math.random().toString(36).slice(2, 8), started: new Date().toISOString(), build: "r1", raids: [] as object[], crates: 0, swaps: 0, heartsLost: 0, wakes: 0, rams: 0, loadedPush: 0, kills: { grunt: 0, brute: 0, sleeper: 0 } };
let raidStart = { ...log, kills: { ...log.kills } };
let pushArmed = false;
function startRaid() {
  homeOpen = false; document.getElementById("home")!.classList.remove("on");
  for (const e of enemies) { scene.remove(e.m.group); if (e.ring) scene.remove(e.ring); if (e.stripe) scene.remove(e.stripe); e.m.dispose(); }
  enemies.length = 0;
  for (const c of crates) scene.remove(c.g, c.ring); crates.length = 0;
  while (drops.length) removeDrop(0);
  doorOpen = false; door.position.y = 0; door.visible = true;
  const K = find("K")[0];
  for (const ch of ["c", "g", "y"] as const) for (const t of find(ch)) crates.push(makeCrate(ch === "c" ? "wood" : ch === "g" ? "green" : "gold", V(tx(t.c), tz(t.r))));
  crates.push(makeCrate("green", V(tx(K.c), tz(K.r)), !meta.keyring));
  for (const t of find("1")) spawnEnemy("grunt", V(tx(t.c), tz(t.r)));
  for (const t of find("2")) spawnEnemy("brute", V(tx(t.c), tz(t.r)));
  for (const t of find("S")) spawnEnemy("sleeper", V(tx(t.c), tz(t.r)));
  pp.copy(gatePos).setZ(gatePos.z - 3.2); st.face.set(0, 0, -1);
  st.hearts = maxHearts(); st.pack = []; st.alive = true; st.iframes = 0; st.extractT = 0; st.knock.set(0, 0, 0);
  player.group.visible = true; player.body.rotation.set(0, 0, 0);
  raidT = 0; pushArmed = false; raidStart = { ...log, kills: { ...log.kills } };
  showHat(); updateHud();
  if (meta.raids === 0) toast("WASD move · SPACE bonk · SHIFT roll · Q drink a smoothie · E swap when your pack is full");
  else toast(`Raid ${meta.raids + 1}: your best ${pouchSlots()} items ride safe in your cheek pouch 🐹`);
}
function bonkOut() {
  st.alive = false;
  const kept = st.pack.slice(0, safeCount()), lost = st.pack.slice(safeCount());
  floatText("BONKED!", pp.clone().setY(2.8), "#c0392b", 40); trauma = 1; sfx("hurt");
  tween(1.0, (k) => { player.body.rotation.z = k * Math.PI * 4; player.group.scale.setScalar(1 - k * 0.6); }, () => { player.group.scale.setScalar(1); player.group.visible = false; });
  setTimeout(() => endRaid("bonked", kept, lost), 1300);
}
function extract(exit: typeof exits[number]) {
  st.alive = false; sfx("unlock"); burst(pp.clone().setY(1.2), 30, "#ffd84a", 1.3);
  floatText(exit.id === "raft" ? "All aboard! +30%" : "Home safe!", pp.clone().setY(2.8), "#3a7a2a", 32);
  setTimeout(() => endRaid(exit.id, st.pack.slice(), [], exit.bonus), 700);
}
function endRaid(how: string, kept: string[], lost: string[], bonus = 0) {
  meta.raids++;
  const r = { n: meta.raids, len: Math.round(raidT), how, kept, lost, hearts: st.hearts, crates: log.crates - raidStart.crates, swaps: log.swaps - raidStart.swaps, heartsLost: log.heartsLost - raidStart.heartsLost, wakes: log.wakes - raidStart.wakes, loadedPush: log.loadedPush - raidStart.loadedPush, kills: { grunt: log.kills.grunt - raidStart.kills.grunt, brute: log.kills.brute - raidStart.kills.brute, sleeper: log.kills.sleeper - raidStart.kills.sleeper }, value: 0 };
  // keys and hats stay with you; everything else sells (orders take what they need first)
  let order: typeof ORDERS[number] | null = ORDERS[meta.order] ?? null, delivered = false;
  const sell: string[] = [];
  for (const id of kept) {
    const d = ITEMS[id];
    if (d.kind === "key") { if (!meta.keyring) { meta.keyring = true; toast("🗝️ Vine Key on your keyring: the door opens for you from now on"); } continue; }
    if (d.kind === "hat") { if (!meta.hats.includes(id)) meta.hats.push(id); continue; }
    sell.push(id);
  }
  if (order && sell.filter((x) => x === order!.need).length >= order.n) {
    for (let i = 0; i < order.n; i++) sell.splice(sell.indexOf(order.need), 1);
    order.give(); meta.order++; delivered = true;
  }
  const value = Math.round(sell.reduce((a, id) => a + ITEMS[id].value, 0) * (1 + bonus));
  r.value = value; log.raids.push(r);
  meta.money += value; saveMeta(); postLog();
  openHome(how, sell, lost, value, bonus, delivered ? order : null);
}

// ---------- home screen (under a minute: count-up, upgrades, the order board, hats) ----------
const homeEl = document.getElementById("home")!;
function openHome(how: string, sold: string[], lost: string[], value: number, bonus: number, delivered: typeof ORDERS[number] | null) {
  homeOpen = true; homeEl.classList.add("on");
  const title = how === "bonked" ? "Bonked! The crew carried you home 🤕" : how === "raft" ? "You rafted home with the haul 🛶" : "Home through the gate 🏡";
  const items = sold.map((id, i) => `<span class="it" style="animation-delay:${i * 0.12}s;border-color:${RARITY_COLOR[ITEMS[id].rarity]}">${ITEMS[id].icon}<b>$${ITEMS[id].value}</b></span>`).join("");
  const lostHtml = lost.length ? `<div class="lost">Dropped in the jungle: ${lost.map((id) => ITEMS[id].icon).join(" ")}</div>` : "";
  const order = ORDERS[meta.order];
  homeEl.innerHTML = `
    <div class="card">
      <h2>${title}</h2>
      <div class="items">${items || "<i>Nothing to sell this time</i>"}</div>${lostHtml}
      <div class="total">${bonus ? `<span class="bonus">raft +${Math.round(bonus * 100)}%</span>` : ""} Sold for <b id="count">$0</b></div>
      ${delivered ? `<div class="order done">✅ Order delivered: ${delivered.reward}</div>` : ""}
      <div class="order">${order ? `📋 <b>Order:</b> ${order.text} <span class="need">${ITEMS[order.need].icon} ×${order.n}</span><br><small>Reward: ${order.reward}</small>` : "📋 All orders done! Banana Boulevard is next (coming after R1)"}</div>
      <div class="ups">${(Object.keys(UPGRADES) as (keyof typeof UPGRADES)[]).map((k, i) => { const u = UPGRADES[k], lvl = meta.up[k], cost = u.costs[lvl];
        return `<button class="up" data-k="${k}" ${cost === undefined || meta.money < cost ? "disabled" : ""}><span class="ico">${u.icon}</span><b>${u.name}</b><small>${u.desc}</small><span class="cost">${cost === undefined ? "MAX" : `[${i + 1}] $${cost}`}</span></button>`; }).join("")}</div>
      <div class="hats">Hat: ${["none", ...meta.hats].map((h) => `<button class="hat ${meta.hat === (h === "none" ? null : h) ? "on" : ""}" data-h="${h}">${h === "none" ? "🎩" : ITEMS[h].icon}<small>${h === "none" ? "Bowler" : ITEMS[h].perk}</small></button>`).join("")}</div>
      <div class="money">Bank: <b>$${Math.floor(meta.money)}</b></div>
      <button class="go">Back to the jungle [Enter]</button>
    </div>`;
  let shown = 0; const cEl = homeEl.querySelector("#count")!;
  const tick = setInterval(() => { shown = Math.min(value, shown + Math.max(1, Math.ceil(value / 30))); cEl.textContent = "$" + shown; if (shown >= value) clearInterval(tick); else sfx("cash"); }, 40);
  homeEl.querySelectorAll<HTMLButtonElement>(".up").forEach((b) => b.onclick = () => buy(b.dataset.k as keyof typeof UPGRADES));
  homeEl.querySelectorAll<HTMLButtonElement>(".hat").forEach((b) => b.onclick = () => { meta.hat = b.dataset.h === "none" ? null : b.dataset.h!; saveMeta(); openHome(how, sold, lost, value, bonus, delivered); });
  homeEl.querySelector<HTMLButtonElement>(".go")!.onclick = () => startRaid();
  moneyEl.textContent = "$" + Math.floor(meta.money);
}
function buy(k: keyof typeof UPGRADES) {
  const cost = UPGRADES[k].costs[meta.up[k]];
  if (cost === undefined || meta.money < cost) return;
  meta.money -= cost; meta.up[k]++; saveMeta(); sfx("unlock");
  const b = homeEl.querySelector<HTMLButtonElement>(`.up[data-k="${k}"]`); if (b) { b.classList.add("bought"); }
  setTimeout(() => { const o = homeEl.querySelector(".go"); if (o) { homeEl.querySelectorAll<HTMLButtonElement>(".up").forEach((bb) => { const kk = bb.dataset.k as keyof typeof UPGRADES, c = UPGRADES[kk].costs[meta.up[kk]]; bb.disabled = c === undefined || meta.money < c; bb.querySelector(".cost")!.textContent = c === undefined ? "MAX" : `$${c}`; }); homeEl.querySelector(".money b")!.textContent = "$" + Math.floor(meta.money); } }, 50);
}
function homeKey(k: string) {
  if (k === "enter") startRaid();
  if (k === "1") buy("slots"); if (k === "2") buy("bonk"); if (k === "3") buy("heart");
}

// ---------- play log (same dev-server endpoint as v5b) ----------
const BOT = new URLSearchParams(location.search).has("bot");
function postLog() { if (BOT) return; fetch("/__playlog", { method: "POST", body: JSON.stringify({ ...log, meta, gameT: Math.round(gameT) }), headers: { "content-type": "application/json" } }).catch(() => {}); }
addEventListener("pagehide", () => { if (!BOT) navigator.sendBeacon?.("/__playlog", JSON.stringify({ ...log, meta, gameT: Math.round(gameT) })); });

// ---------- threat arrows for chasers off-screen ----------
const arrowsEl = document.getElementById("arrows")!;
function updateArrows() {
  let html = "";
  for (const e of enemies) {
    const hot = ["chase", "windup", "aim", "charge", "notice"].includes(e.state); if (!hot) continue;
    const v = e.p.clone().setY(1).project(camera);
    if (v.z < 1 && Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.92) continue;
    let x = v.x, y = v.y; if (v.z > 1) { x = -x; y = -y; }
    const k = Math.min(0.9 / Math.max(0.001, Math.abs(x)), 0.85 / Math.max(0.001, Math.abs(y))); x *= k; y *= k;
    html += `<div class="threat" style="left:${(x * 0.5 + 0.5) * 100}%;top:${(-y * 0.5 + 0.5) * 100}%;transform:translate(-50%,-50%) rotate(${Math.atan2(-y, x)}rad)">➤</div>`;
  }
  arrowsEl.innerHTML = html;
}

// ---------- loop ----------
const clock = new THREE.Clock();
const camFocus = new THREE.Vector3();
function step(dt: number) {
  gameT += dt; raidT += dt;
  updateFx(dt);
  st.bonkCd -= dt; st.rollCd -= dt; st.iframes -= dt;
  if (st.wind > 0) { st.wind -= dt; if (st.wind <= 0) landBonk(); }
  if (st.alive) {
    const mv = inputVec(); if (mv.length() > 1) mv.normalize();
    if (mv.lengthSq() > 0.01 && st.rollT <= 0) st.face.copy(mv).normalize();
    if (st.rollT > 0) { st.rollT -= dt; st.vel.copy(st.rollDir).multiplyScalar(P.rollSpeed); }
    else st.vel.lerp(mv.multiplyScalar(P.speed), Math.min(1, dt * 16));
    pp.addScaledVector(st.vel, dt);
    if (st.knock.lengthSq() > 0.05) { pp.addScaledVector(st.knock, dt); st.knock.multiplyScalar(Math.max(0, 1 - dt * 7)); }
    collide(pp, P.radius);
    // the vine door opens for a monkey holding the key
    if (!doorOpen && flat(pp, door.position) < 2.6 && (meta.keyring || st.pack.includes("key"))) {
      doorOpen = true; tween(0.6, (k) => { door.position.y = -2.8 * k; }, () => { door.visible = false; }); sfx("unlock"); toast("The vine door opens: treasure inside!"); trauma = 0.4;
    }
    // crates: stand close and the search ring fills
    for (const c of crates) {
      if (c.open) continue;
      const near = flat(pp, c.pos) < 1.6;
      if (!near && c.prog <= 0) { c.ring.visible = false; continue; }
      c.ring.visible = true;
      if (near) c.prog += dt; else c.prog = Math.max(0, c.prog - dt * 2);
      const k = Math.min(1, c.prog / CRATE[c.tier].search);
      c.ring.geometry.dispose(); c.ring.geometry = new THREE.RingGeometry(1.0, 1.18, 40, 1, Math.PI / 2, Math.max(0.001, k * Math.PI * 2));
      if (k >= 1) openCrate(c);
    }
    // extraction: stand still in the ring; getting hit resets it
    let inExit: typeof exits[number] | null = null;
    for (const ex of exits) if (flat(pp, ex.pos) < 1.8 && (ex.id !== "gate" || raidT > 5)) inExit = ex;
    if (inExit && gameT - st.lastHurt > 0.5) {
      st.extractT += dt; exitEl.style.display = "block";
      exitEl.textContent = `${inExit.id === "raft" ? "🛶 Raft leaves" : "🏡 Heading home"} in ${Math.max(0, P.extract - st.extractT).toFixed(1)}s`;
      if (st.extractT >= P.extract) { exitEl.style.display = "none"; extract(inExit); }
    } else { st.extractT = 0; exitEl.style.display = "none"; }
    // "came back to the gate loaded, then went deeper anyway"
    const loaded = st.pack.length >= Math.max(3, packSlots() * 0.5), dg = flat(pp, gatePos);
    if (loaded && dg < 8 && raidT > 20) pushArmed = true;
    if (pushArmed && dg > 22) { log.loadedPush++; pushArmed = false; }
  } else st.vel.set(0, 0, 0);
  player.tick(dt, camera, st.vel);
  if (st.iframes > 0 && st.alive) player.plane.visible = Math.sin(gameT * 40) > -0.3; else player.plane.visible = true;
  fieldT -= dt; if (fieldT <= 0) { fieldT = 0.25; buildField(); }
  for (const e of enemies) { if (e.state === "down") continue; updateEnemy(e, dt); e.m.tick(dt, camera, e.vel); }
  for (const a of enemies) for (const b of enemies) { // keep the crowd from stacking into one monkey
    if (a === b || a.state === "down" || b.state === "down") continue;
    const d = flat(a.p, b.p), r = a.kind === "brute" || b.kind === "brute" ? 1.3 : 0.9;
    if (d < r && d > 0.001) { const push = (r - d) / 2; const dx = (a.p.x - b.p.x) / d, dz = (a.p.z - b.p.z) / d; a.p.x += dx * push; a.p.z += dz * push; b.p.x -= dx * push; b.p.z -= dz * push; }
  }
  updateDrops(dt);
  promptEl.textContent = swapOffer !== null ? `Pack full: [E] swap ${ITEMS[st.pack[st.pack.length - 1]].icon} for ${ITEMS[drops[swapOffer].id].icon}` : st.pack.includes("smoothie") && st.hearts < maxHearts() ? "[Q] drink a smoothie 🥤" : "";
}
function frame() {
  const real = Math.min(clock.getDelta(), 0.05);
  if (!homeOpen) { if (hitStop > 0) hitStop -= real; else step(real); }
  const look = pp.clone().addScaledVector(st.face, 1.4);
  camFocus.lerp(look, Math.min(1, real * 5));
  trauma = Math.max(0, trauma - real * 1.5);
  const sh = trauma * trauma * 0.3, n = performance.now() / 40;
  camera.position.set(camFocus.x + Math.sin(n * 1.3) * sh, 15 * camDist + Math.sin(n * 1.7) * sh, camFocus.z + 10.5 * camDist);
  camera.lookAt(camFocus.x, 0.6, camFocus.z);
  sun.position.set(camFocus.x - 6, 16, camFocus.z + 8); sun.target.position.copy(camFocus);
  updateArrows();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
(window as any).__r1 = { st, meta, enemies, crates, drops, log, pp, startRaid, get raidT() { return raidT; } };
startRaid();
requestAnimationFrame(frame);
