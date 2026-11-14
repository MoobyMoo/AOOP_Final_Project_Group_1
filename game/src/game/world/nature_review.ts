// Review page for the nature kit (nature.html). ?view=lineup&page=0..5 lays every variant out with labels;
// ?view=edge|cave|beach|falls|hollow|mangrove|camp|palms builds the real map (world.ts: placed pieces + scatter)
// and looks at it with the gameplay camera: pitch 55, yaw -30, FOV 24, distance 40, sun elevation 50.
// Extra params: at=x,z (camera target), dist, wind=0, kit=old (placeholder kit, for before/after), hero=0.
import * as THREE from "three";
import { Stage } from "../render/stage";
import { U } from "../render/shading";
import { updateCutout } from "../render/cutout";
import { groundHeight } from "./terrain";
import { buildWorld, preloadWorldKits } from "./world";
import { mergePieces } from "./kitutil";
import { createRig } from "../actors/rig";
import { DEFAULT_LOOK } from "../actors/look";
import { naturePiece, natureTypes } from "./kit_nature";

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

/** the real map (map v3: placed pieces + rule scatter + edge dressing), looked at with the gameplay camera */
function world() {
  const st = buildWorld(scene, Number(QS.get("seed") ?? 4242), { wind: QS.get("wind") !== "0" });
  const AT: Record<string, [number, number]> = { edge: [-90, 40], cave: [168, 26], beach: [-6, 100], falls: [66, -64], hollow: [0, -58], mangrove: [50, 54], camp: [-62, 27], palms: [0, 74] };
  const at = (QS.get("at")?.split(",").map(Number) ?? AT[view] ?? AT.edge) as [number, number];
  target.set(at[0], groundHeight(at[0], at[1]), at[1]);
  if (view === "cave") { stage.sun.intensity = 2.2; stage.sun.color.set("#b9c8ff"); stage.hemi.intensity = 0.75; scene.background = new THREE.Color("#2a2630"); scene.fog = new THREE.Fog("#2a2630", 50, 100); }
  const h = hero(at[0] + 1.5, at[1] + 1);
  if (h) U.uPlayer.value.copy(h.root.position);
  info.textContent = `${view} · placed ${st.placed} + scatter ${st.scattered} + edge ${st.edge} · chunk meshes ${st.chunkMeshes} · kit tris ${(st.kitTris / 1e6).toFixed(2)}M · grass ${st.grass}`;
  return h;
}

await preloadWorldKits();
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
