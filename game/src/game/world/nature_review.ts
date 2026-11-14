// Review page for the nature kit (nature.html). ?view=lineup&page=0..5 lays every variant out with labels;
// ?view=edge|cave|beach|falls|hollow|mangrove dresses the real map with NATURE_KIT (plus the extra pieces placed by
// hand here) and looks at it with the gameplay camera: pitch 55, yaw -30, FOV 24, distance 40, sun elevation 50.
// Extra params: at=x,z (camera target), dist, wind=0, kit=old (placeholder kit, for before/after), hero=0.
import * as THREE from "three";
import { Stage } from "../render/stage";
import { U } from "../render/shading";
import { updateCutout } from "../render/cutout";
import { buildTerrain, groundHeight } from "./terrain";
import { dressWorld, flushChunks, buildGrass, addPieces, reserve } from "./dress";
import { PLACEHOLDER_KIT, grassTuft as oldTuft } from "./placeholder";
import { openness, nearestTrailDist } from "./grid";
import { POI, CLEARINGS } from "./layout";
import { mergePieces } from "./kitutil";
import { createRig } from "../actors/rig";
import { DEFAULT_LOOK } from "../actors/look";
import { preloadNature, NATURE_KIT, NATURE, naturePiece, natureTypes, grassTuft, waterfall, enableFoliageWind } from "./kit_nature";

const QS = new URLSearchParams(location.search);
const view = QS.get("view") ?? "lineup";
const stage = new Stage(document.getElementById("game") as HTMLCanvasElement);
stage.sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - Number(QS.get("sunel") ?? 50)), THREE.MathUtils.degToRad(Number(QS.get("sunaz") ?? 160)));
const scene = stage.scene;
let seed = 4242; const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const rr = (a: number, b: number) => a + rng() * (b - a);
const labels: { el: HTMLElement; p: THREE.Vector3 }[] = [];
const target = new THREE.Vector3();
const info = document.getElementById("info")!;

const PAGES: { ground: string; types: string[] }[] = [
  { ground: "#86a64e", types: ["palm", "palmlean", "tree", "treefar", "mangrove"] },
  { ground: "#86a64e", types: ["bush", "fern", "bigleaf", "banana", "flowers", "reeds", "lily", "beachgrass", "litter", "grass"] },
  { ground: "#d9ae74", types: ["rocks", "rockm", "rockl", "boulders", "pebbles", "log", "stump", "driftwood", "shells"] },
  { ground: "#6f6458", types: ["caverock", "stalagmite", "mushroom", "crystal", "roots", "caster"] },
  { ground: "#c99a62", types: ["giant"] },
];

function label(text: string, p: THREE.Vector3) {
  const el = document.createElement("div"); el.className = "lab"; el.textContent = text; document.body.appendChild(el); labels.push({ el, p });
}
function hero(x: number, z: number, y = groundHeight(x, z)) {
  if (QS.get("hero") === "0") return;
  const rig = createRig("monkey", DEFAULT_LOOK); rig.root.position.set(x, y, z); rig.root.rotation.y = 2.4; scene.add(rig.root);
  rig.pose?.({ time: 0, speed: 0, moveYaw: 0, faceYaw: 0, action: "idle", actionT: 0, armed: "pistol", flash: 0 } as never);
  return rig;
}

function lineup(page: number) {
  const pg = PAGES[page] ?? PAGES[0], tris: string[] = [];
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: pg.ground, roughness: 0.95 }));
  ground.receiveShadow = true; ground.position.y = 0.04; scene.add(ground);
  const counts = new Map(natureTypes().map((t) => [t.type, t.variants]));
  // rows run across the screen (camera yaw 0 here); tall pieces need room behind them: at pitch 55 a height h covers 0.7 h of ground
  let z = 0, x = 0, rowDepth = 0, maxX = 0; const ROW = pg.types.includes("giant") ? 60 : 30;
  scene.fog = null; stage.cam.yaw = 0;
  for (const type of pg.types) {
    const n = counts.get(type) ?? 0, groups: THREE.Group[] = [], sizes: THREE.Vector3[] = [];
    for (let v = 0; v < n; v++) {
      const ps = naturePiece(type, rng, 1, { variant: v, plain: true });
      const g = mergePieces(ps); const box = new THREE.Box3().setFromObject(g); groups.push(g); sizes.push(box.getSize(new THREE.Vector3()));
      tris.push(`${type}_${v}: ${ps.reduce((a, p) => a + p.geo.attributes.position.count / 3, 0)}`);
    }
    const w = Math.max(...sizes.map((s) => Math.max(s.x, s.z)), 0.8), hgt = Math.max(...sizes.map((s) => s.y)), step = w + Math.max(0.6, w * 0.15), rowW = step * n;
    const depth = w + hgt * 0.75 + 1.2;
    if (x > 0 && x + rowW > ROW) { z += rowDepth; x = 0; rowDepth = 0; }
    groups.forEach((g, i) => { g.position.set(x + step * (i + 0.5), type === "caster" ? 1.5 : 0, z + depth - w / 2 - 0.9); scene.add(g); });
    label(type, new THREE.Vector3(x + rowW / 2, 0, z + depth - 0.5));
    x += rowW + 1.2; rowDepth = Math.max(rowDepth, depth); maxX = Math.max(maxX, x);
  }
  const total = z + rowDepth;
  target.set(maxX / 2 - 0.6, 0, total / 2);
  hero(-1.4, total - 1.5, 0.04);
  const fit = Math.max((maxX + 4) / (innerWidth / innerHeight), (total + 2) * Math.sin(stage.cam.pitch)) / (2 * Math.tan(THREE.MathUtils.degToRad(12)));
  stage.cam.dist = Number(QS.get("dist") ?? Math.max(24, fit * 1.04));
  stage.camera.far = 600; stage.camera.updateProjectionMatrix();
  info.textContent = `lineup page ${page} · ` + tris.join("  ");
}

/** hand placement of the pieces dress.ts does not scatter yet (the lead owns the real placement) */
function extras() {
  const R = () => rr(0, Math.PI * 2);
  addPieces(NATURE.giantTree(rng, 1), POI.giantTree.x, POI.giantTree.z, 0); reserve(POI.giantTree.x, POI.giantTree.z, 5);
  // waterfall: the gap lines up with the falls-nook trail
  const wf = waterfall(); wf.position.set(POI.falls.x, groundHeight(POI.falls.x, POI.falls.z) - 0.1, POI.falls.z - 0.6); wf.rotation.y = -0.588; scene.add(wf);
  reserve(POI.falls.x, POI.falls.z, 7);
  for (let i = 0; i < 5; i++) { const x = 35 + rr(-5, 5), z = -31 + rr(-3, 2.5); addPieces(NATURE.lilyPads(rng, rr(0.8, 1.2)), x, z, R(), 1, -0.15 - 0.03); }
  for (let i = 0; i < 9; i++) { const a = R(), x = 35 + Math.cos(a) * rr(6, 7.5), z = -31 + Math.sin(a) * rr(3.8, 4.8); if (openness(x, z) > 0.4) addPieces(NATURE.reeds(rng, rr(0.8, 1.2)), x, z, R()); }
  // mangroves ring their clearing; reeds at their feet
  for (let i = 0; i < 60; i++) {
    const a = R(), x = 33 + Math.cos(a) * rr(8, 13), z = 40 + Math.sin(a) * rr(6, 10), o = openness(x, z);
    if (o > 0.2 || o < -3 || nearestTrailDist(x, z) < 3) continue;
    addPieces(NATURE.mangrove(rng, rr(0.9, 1.25)), x, z, R()); reserve(x, z, 2.6);
    if (rng() < 0.6) addPieces(NATURE.reeds(rng, rr(0.8, 1.1)), x + rr(-2, 2), z + rr(1, 2.5), R());
  }
  // beach dressing
  for (let i = 0; i < 260; i++) {
    const x = rr(-60, 60), z = rr(58, 73), o = openness(x, z); if (o < 0.6 || nearestTrailDist(x, z) < 2) continue;
    const f = rng();
    if (z < 62.5 && f < 0.2) { addPieces(NATURE.leaningPalm(rng, rr(0.95, 1.2)), x, z, R()); reserve(x, z, 2); }
    else if (f < 0.35) addPieces(NATURE.driftwood(rng, rr(0.8, 1.3)), x, z, R());
    else if (f < 0.55) addPieces(NATURE.shells(rng, rr(0.8, 1.1)), x, z, R());
    else if (f < 0.8) addPieces(NATURE.beachGrass(rng, rr(0.8, 1.3)), x, z, R());
    else addPieces(naturePiece("pebbles", rng, rr(0.8, 1.2), { variant: 2 }), x, z, R());
  }
  // ground scatter along the jungle edge and in clearings: litter under the wall, flowers and pebbles in the open
  for (let i = 0; i < 5200; i++) {
    const x = rr(-70, 70), z = rr(-62, 58), o = openness(x, z); if (o < -0.6 || o > 4 || nearestTrailDist(x, z) < 1.6) continue;
    const c = CLEARINGS.find((q) => Math.hypot((x - q.x) / q.rx, (z - q.z) / q.rz) < 1); if (c && c.ground === "plank") continue;
    const f = rng();
    if (o < 1.2) { if (f < 0.5) addPieces(NATURE.leafLitter(rng, rr(0.8, 1.3)), x, z, R()); else if (f < 0.62) addPieces(NATURE.flowers(rng, rr(0.8, 1.2)), x, z, R()); }
    else if (f < 0.1) addPieces(NATURE.flowers(rng, rr(0.8, 1.2)), x, z, R());
    else if (f < 0.22) addPieces(NATURE.pebbles(rng, rr(0.7, 1.2)), x, z, R());
    else if (f < 0.27) addPieces(NATURE.boulders(rng, rr(0.7, 1.0)), x, z, R());
  }
  // grotto: stalagmites, crystals and root curtains against the walls
  for (let i = 0; i < 700; i++) {
    const x = rr(96, 140), z = rr(-34, 52), o = openness(x, z); if (o < -1.2 || o > 2.2 || nearestTrailDist(x, z) < 2.2) continue;
    const f = rng();
    if (o < 0.3) addPieces(f < 0.5 ? NATURE.stalagmite(rng, rr(0.9, 1.5)) : f < 0.75 ? NATURE.hangingRoots(rng, rr(0.9, 1.2)) : NATURE.crystal(rng, rr(1, 1.6)), x, z, R());
    else if (f < 0.25) addPieces(NATURE.crystal(rng, rr(0.7, 1.1)), x, z, R());
    else if (f < 0.45) addPieces(NATURE.stalagmite(rng, rr(0.6, 1.0)), x, z, R());
  }
}

function world() {
  const old = QS.get("kit") === "old";
  if (!old && QS.get("wind") !== "0") enableFoliageWind();
  buildTerrain(scene);
  const stats = dressWorld(scene, old ? PLACEHOLDER_KIT : NATURE_KIT, rng);
  if (!old) extras();
  const groups = flushChunks(scene);
  const blades = buildGrass(scene, rng, old ? oldTuft() : grassTuft());
  let tris = 0; for (const g of groups) g.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) tris += m.geometry.attributes.position.count / 3; });
  const AT: Record<string, [number, number]> = { edge: [-17, 40], cave: [116, 16], beach: [-6, 64], falls: [36, -32], hollow: [0, -32], mangrove: [32, 41], camp: [-33, 20], palms: [1, 47] };
  const at = (QS.get("at")?.split(",").map(Number) ?? AT[view] ?? AT.edge) as [number, number];
  target.set(at[0], groundHeight(at[0], at[1]), at[1]);
  if (view === "cave") { stage.sun.intensity = 2.2; stage.sun.color.set("#b9c8ff"); stage.hemi.intensity = 0.75; scene.background = new THREE.Color("#2a2630"); scene.fog = new THREE.Fog("#2a2630", 50, 100); }
  const h = hero(at[0] + 1.5, at[1] + 1);
  if (h) U.uPlayer.value.copy(h.root.position);
  info.textContent = `${view} · kit ${old ? "placeholder" : "nature"} · wall ${stats.wall} under ${stats.under} · chunks ${groups.length} · kit tris ${(tris / 1e6).toFixed(2)}M · grass ${blades}`;
  return h;
}

await preloadNature();
const h = view === "lineup" ? (lineup(Number(QS.get("page") ?? 0)), undefined) : world();
const chest = new THREE.Vector3(); let t0 = performance.now(), frames = 0, fpsT = 0;
const fps = document.getElementById("fps")!;
function frame(now: number) {
  const dt = Math.min(0.05, (now - t0) / 1000); t0 = now; U.uTime.value += dt;
  stage.place(target, dt, U.uTime.value);
  if (h) updateCutout(stage.camera, chest.copy(h.root.position).setY(h.root.position.y + 1.1), stage.renderer);
  stage.render(dt);
  for (const l of labels) { const v = l.p.clone().project(stage.camera); l.el.style.left = `${(v.x * 0.5 + 0.5) * innerWidth}px`; l.el.style.top = `${(-v.y * 0.5 + 0.5) * innerHeight}px`; }
  frames++; fpsT += dt; if (fpsT > 1) { fps.textContent = `${Math.round(frames / fpsT)} fps · ${stage.renderer.info.render.calls} calls · ${(stage.renderer.info.render.triangles / 1000).toFixed(0)}k tris`; frames = 0; fpsT = 0; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
