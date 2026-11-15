// Items on the ground as their own models (G1.5 row 04+). Moo: "they shouldn't be like pngs, they should drop like
// real assets". Sources and choices:
//  - POLISH_FINDINGS 1: Duckov's pickup shows the item's own graphic. A drop throws it along the aim, +-22.5 deg, at 1.5-3
//    horizontal and 2.5 vertical, rotation frozen; the physics comes off after 3 s (6 s when it is still falling).
//    Procedural loot skips the throw: it is placed at rest with a random yaw. Pickup is manual (E), one selected item.
//  - POLISH_FINDINGS 13: our own dark 1.5-2 px silhouette for readability, a warm rim (1, 0.85, 0.25) on the selected
//    one, a small contact shade, the item itself lit like the world. No rarity beams: the silhouette itself takes the
//    item's tier colour from Standard (q2) up (loot/tiers.ts; Duckov tints the icon glow by display quality), so a
//    good find reads on the ground without a light column.
// Models: the 40 Blender item GLBs (public/models/items, the icon set's meshes), the wearable meshes (actors/wearables.ts)
// for gear that has no item GLB, the gun GLB for a gun. Small items are shown larger than life (longest side at least
// 0.42 u) so a 14 cm ammo box still reads from the gameplay camera. Every model is pooled: one merged item mesh, one
// outline hull and one shade per pickup (3 draw calls), reused when picked up.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { G } from "../core/state";
import { patch } from "../render/shading";
import { groundHeight, meshHeightMax } from "../world/terrain";
import { walkable } from "../world/grid";
import { baseId, buildWearable, hasWearable, WEARABLES } from "../actors/wearables";
import { MODEL_LIKE } from "./attachments";
import { gunId } from "../combat/guns";
import { itemDef } from "./tables";
import { tierOf } from "./tiers";
/** guns on the ground (combat/gunmodels.ts gunPickupModel, set by main.ts so node tests never load three's GLB code) */
export const groundHooks = { gunModel: null as null | ((id: string) => THREE.Object3D) };
/** a gun lies on its side at its in-hand scale (core/raid.ts GUN_SCALE), so a machine gun looks bigger than a pistol */
const GUN_GROUND_SCALE = 0.65;

/** loot ids -> item GLB names (the icon set's short names; ui/itemicon.ts uses the same) */
const ALIAS: Record<string, string> = { banana: "bunch", vine_rope: "rope", golden_banana: "golden", honey_pot: "honey", old_gear: "gear", sunset_mango: "mango", brass_compass: "compass", banana_idol: "idol", vine_key: "key", ammo45: "ammo", plantation_seal: "radio_key", oar: "plank", ...MODEL_LIKE };
const GLBS = ["ammo", "aviators", "bandage", "banditmask", "beanie", "bigpack", "boomerang", "bowler", "bunch", "cap", "coconut", "compass", "cratepack", "crown", "extmag", "eyepatch", "fedora", "firstaid", "gear", "goggles", "golden", "hardhat", "heartglasses", "hide", "honey", "idol", "key", "mango", "meat", "monocle", "pith", "plank", "radio_key", "rope", "satchel", "shades", "smoothie", "spring", "suit", "tophat"];
/** flat things stood upright in their GLB (a jacket, a magazine, a monocle): they lie on their back on the ground */
const LIE = new Set(["suit", "extmag", "monocle", "satchel", "firstaid", "att_mag_ext"]);
const MIN_SIDE = 0.42, MAX_SIDE = 0.78, MAX_SCALE = 3.2, MIN_SCALE = 1.25;
/** POLISH_FINDINGS 1 / 13 numbers */
export const THROW = { hMin: 1.5, hMax: 3, up: 2.5, spread: Math.PI / 8, gravity: 9.81, physicsOff: 3, recover: 6 };
export const PICK_REACH = 1.35;

type Tmpl = { meshes: { geo: THREE.BufferGeometry; mat: THREE.Material }[]; hull: THREE.BufferGeometry; foot: number; h: number };
const TMPL = new Map<string, Tmpl>();
const RAW = new Map<string, THREE.Object3D>();
let loading: Promise<void> | null = null;

/** one lit material for every item GLB: albedo in the vertex colour, roughness and metalness per vertex (aRM), so a
 *  model with matte, satin, gloss and metal parts is still one mesh */
let ITEM_MAT: THREE.MeshStandardMaterial | null = null;
function itemMaterial() {
  if (ITEM_MAT) return ITEM_MAT;
  const m = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1 }), { rim: 0.55 });
  const base = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    base.call(m, sh, r);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute vec2 aRM;\nvarying vec2 vRM;").replace("#include <color_vertex>", "#include <color_vertex>\n  vRM = aRM;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec2 vRM;")
      .replace("#include <roughnessmap_fragment>", "float roughnessFactor = vRM.x;").replace("#include <metalnessmap_fragment>", "float metalnessFactor = vRM.y;");
  };
  const key = m.customProgramCacheKey; m.customProgramCacheKey = () => key.call(m) + "itemRM";
  return (ITEM_MAT = m);
}
/** the outline hull: back faces pushed out along smooth normals by a fixed number of screen pixels */
const HULL_U = { uRes: { value: new THREE.Vector2(1920, 1080) } };
function hullMaterial(color: string, px: number, opacity = 1) {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, toneMapped: false });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, HULL_U, { uPx: { value: px } });
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform vec2 uRes;\nuniform float uPx;")
      .replace("#include <project_vertex>", `#include <project_vertex>
  { vec4 cn = projectionMatrix * vec4(normalize(normalMatrix * normal), 0.0);
    vec2 d = cn.xy; float l = length(d); if (l > 1e-5) gl_Position.xy += d / l * uPx * 2.0 / uRes * gl_Position.w; }`);
  };
  m.customProgramCacheKey = () => `hull${px}`;
  return m;
}
let DARK: THREE.Material | null = null, WARM: THREE.Material | null = null, SHADE: THREE.MeshBasicMaterial | null = null;
const SHADE_GEO = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
function shadeMaterial() {
  if (SHADE) return SHADE;
  const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d")!, g = x.createRadialGradient(32, 32, 2, 32, 32, 31);
  g.addColorStop(0, "rgba(0,0,0,0.62)"); g.addColorStop(0.45, "rgba(0,0,0,0.38)"); g.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return (SHADE = new THREE.MeshBasicMaterial({ map: t, color: "#1a1408", transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
}

/** load the item GLBs once (raid start; the wearables come with the characters) */
export function preloadGroundItems(base = `${import.meta.env.BASE_URL}models/items/`): Promise<void> {
  loading ??= Promise.all([...GLBS.map((n) => new GLTFLoader().loadAsync(`${base}${n}.glb`).then((g) => { RAW.set(n, g.scene); }, () => undefined)),
    new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/attachments.glb`).then(addAttachments, () => undefined)]).then(() => undefined);
  return loading;
}
/** gun attachments (attachments.glb, one root node per id) on the ground. Their colour lives in the Kingpin palette
 *  texture and the item material is vertex colour only, so each vertex takes its palette texel (times its AO). */
function addAttachments(g: { scene: THREE.Object3D }) {
  const px = new Map<unknown, { d: Uint8ClampedArray; w: number; h: number } | null>();
  const pixels = (img: unknown) => {
    if (px.has(img)) return px.get(img)!;
    let out: { d: Uint8ClampedArray; w: number; h: number } | null = null;
    try { const im = img as { width: number; height: number }, c = document.createElement("canvas"); c.width = im.width; c.height = im.height; const x = c.getContext("2d")!; x.drawImage(img as CanvasImageSource, 0, 0); out = { d: x.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height }; } catch { out = null; }
    px.set(img, out); return out;
  };
  const col = new THREE.Color();
  for (const top of g.scene.children) {
    if (!/^att_[a-z0-9_]+$/.test(top.name)) continue;
    const node = top.clone(true); node.position.set(0, 0, 0); node.quaternion.identity();
    node.traverse((o) => {
      const m = o as THREE.Mesh; if (!m.isMesh) return;
      const src = m.material as THREE.MeshStandardMaterial, geo = m.geometry.clone(), n = geo.getAttribute("position").count;
      const ao = geo.getAttribute("color"), uv = geo.getAttribute("uv"), tex = src.map ? pixels(src.map.image) : null, c3 = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        if (tex && uv) { const u = Math.min(tex.w - 1, Math.max(0, Math.floor((uv.getX(i) % 1 + 1) % 1 * tex.w))), v = Math.min(tex.h - 1, Math.max(0, Math.floor((uv.getY(i) % 1 + 1) % 1 * tex.h))), k = (v * tex.w + u) * 4; col.setRGB(tex.d[k] / 255, tex.d[k + 1] / 255, tex.d[k + 2] / 255, THREE.SRGBColorSpace); }
        else col.copy(src.emissive && src.emissive.getHex() ? src.emissive : src.color);
        const a = ao ? ao.getX(i) : 1; c3.set([col.r * a, col.g * a, col.b * a], i * 3);
      }
      geo.setAttribute("color", new THREE.BufferAttribute(c3, 3)); m.geometry = geo;
      m.material = new THREE.MeshStandardMaterial({ roughness: src.map ? 0.45 : 0.3, metalness: src.map ? 0.25 : 0 });
    });
    RAW.set(top.name, node);
  }
}

/** which model an item shows: an item GLB, a wearable mesh, or the fallback crate-pack */
export function modelKey(item: string) {
  const gid = gunId(item); if (gid && groundHooks.gunModel) return "gun:" + gid;
  const id = baseId(item) ?? item, glb = ALIAS[id] ?? id;
  if (RAW.has(glb)) return "glb:" + glb;
  if (hasWearable(id)) return "wear:" + id;
  return "glb:bunch";
}
/** lay a template on the ground: lie flat things down, scale small ones up, base on y 0, centred on x/z */
/** which way a model's outside faces: + when most of its surface looks up (a hat right side up), - when it looks down */
function upness(geos: THREE.BufferGeometry[]) {
  let up = 0; const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (const g0 of geos) { const g = g0.index ? g0.toNonIndexed() : g0, p = g.getAttribute("position");
    for (let i = 0; i + 2 < p.count; i += 3) { a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2); n.subVectors(c, b).cross(a.sub(b)); up += -n.y; } }
  return up;
}
function ground(geos: THREE.BufferGeometry[], lie: boolean, wear = false, fixed = 0) {
  const box = new THREE.Box3(); for (const g of geos) { g.computeBoundingBox(); box.union(g.boundingBox!); }
  const size = box.getSize(new THREE.Vector3()), m = new THREE.Matrix4();
  // a wearable built for a socket stands however it was worn: anything much taller than it is wide lies down
  const flat = lie || size.y > Math.max(size.x, size.z) * 1.35;
  if (flat) m.makeRotationX(-Math.PI / 2);
  for (const g of geos) g.applyMatrix4(m);
  // a helmet authored hanging from the head socket can come out upside down: turn it so its outside faces up
  if (wear && upness(geos) < 0) { const f = new THREE.Matrix4().makeRotationX(Math.PI); for (const g of geos) g.applyMatrix4(f); }
  const b2 = new THREE.Box3(); for (const g of geos) { g.computeBoundingBox(); b2.union(g.boundingBox!); }
  const s2 = b2.getSize(new THREE.Vector3()), side = Math.max(s2.x, s2.z, 1e-3), k = fixed || Math.min(MAX_SCALE, MAX_SIDE / side, Math.max(MIN_SCALE, MIN_SIDE / side));
  const c = b2.getCenter(new THREE.Vector3()), t = new THREE.Matrix4().makeScale(k, k, k).multiply(new THREE.Matrix4().makeTranslation(-c.x, -b2.min.y, -c.z));
  for (const g of geos) { g.applyMatrix4(t); g.computeBoundingSphere(); }
  return { foot: Math.max(s2.x, s2.z) * k, h: s2.y * k };
}
function hullOf(geos: THREE.BufferGeometry[]) {
  const pos = geos.map((g) => { const src = g.index ? g.toNonIndexed() : g, q = new THREE.BufferGeometry(); q.setAttribute("position", src.getAttribute("position").clone()); return q; });
  const merged = mergeVertices(mergeGeometries(pos, false)!, 1e-3); merged.computeVertexNormals(); return merged;
}
function template(key: string): Tmpl {
  let t = TMPL.get(key); if (t) return t;
  const [kind, name] = key.split(":");
  if (kind === "glb") {
    const geos: THREE.BufferGeometry[] = [];
    RAW.get(name)!.updateMatrixWorld(true);
    RAW.get(name)!.traverse((o) => {
      const mesh = o as THREE.Mesh; if (!mesh.isMesh) return;
      const mat = mesh.material as THREE.MeshStandardMaterial, g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld), n = g.getAttribute("position").count;
      const rm = new Float32Array(n * 2); for (let i = 0; i < n; i++) { rm[i * 2] = mat.roughness ?? 0.7; rm[i * 2 + 1] = mat.metalness ?? 0; }
      g.setAttribute("aRM", new THREE.BufferAttribute(rm, 2));
      if (!g.getAttribute("color")) { const c = new Float32Array(n * 3); const col = mat.color ?? new THREE.Color(1, 1, 1); for (let i = 0; i < n; i++) c.set([col.r, col.g, col.b], i * 3); g.setAttribute("color", new THREE.BufferAttribute(c, 3)); }
      for (const a of Object.keys(g.attributes)) if (!["position", "normal", "color", "aRM"].includes(a)) g.deleteAttribute(a);
      if (g.getAttribute("color").itemSize === 4) { const c4 = g.getAttribute("color"), c3 = new Float32Array(n * 3); for (let i = 0; i < n; i++) c3.set([c4.getX(i), c4.getY(i), c4.getZ(i)], i * 3); g.setAttribute("color", new THREE.BufferAttribute(c3, 3)); }
      geos.push(g.index ? g.toNonIndexed() : g);
    });
    const f = ground(geos, LIE.has(name)), geo = mergeGeometries(geos, false)!;
    t = { meshes: [{ geo, mat: itemMaterial() }], hull: hullOf([geo]), ...f };
  } else if (kind === "gun") {
    const src = groundHooks.gunModel!(name), meshes: { geo: THREE.BufferGeometry; mat: THREE.Material }[] = [];
    src.updateMatrixWorld(true);
    const side = new THREE.Matrix4().makeRotationZ(-Math.PI / 2); // on its right side, the ejection port up
    src.traverse((o) => { const mesh = o as THREE.Mesh; if (mesh.isMesh && mesh.visible) meshes.push({ geo: mesh.geometry.clone().applyMatrix4(mesh.matrixWorld).applyMatrix4(side), mat: Array.isArray(mesh.material) ? mesh.material[0] : mesh.material }); });
    for (const m of meshes) for (const a of Object.keys(m.geo.attributes)) if (a === "skinIndex" || a === "skinWeight") m.geo.deleteAttribute(a);
    const f = ground(meshes.map((q) => q.geo), false, false, GUN_GROUND_SCALE);
    t = { meshes, hull: hullOf(meshes.map((q) => q.geo)), ...f };
  } else {
    const src = buildWearable(name), meshes: { geo: THREE.BufferGeometry; mat: THREE.Material }[] = [];
    src.updateMatrixWorld(true);
    src.traverse((o) => { const mesh = o as THREE.Mesh; if (mesh.isMesh) meshes.push({ geo: mesh.geometry.clone().applyMatrix4(mesh.matrixWorld), mat: mesh.material as THREE.Material }); });
    // body armour and bags are tubes and shells round the torso: on the ground they lie on their back, front up
    const slot = WEARABLES.find((w) => w.id === name)?.slot, f = ground(meshes.map((q) => q.geo), slot === "body" || slot === "back", true);
    t = { meshes, hull: hullOf(meshes.map((q) => q.geo)), ...f };
  }
  TMPL.set(key, t); return t;
}

// ---------------------------------------------------------------- pooled instances
const pool = new Map<string, THREE.Group[]>();
/** a ground model for an item: the item, its dark silhouette, its warm selection rim (hidden) and its contact shade */
export function takeModel(item: string): { obj: THREE.Group; key: string } {
  const key = modelKey(item), free = pool.get(key);
  const reuse = free?.pop();
  if (reuse) { reuse.visible = true; (reuse.userData.warm as THREE.Object3D).visible = false; reuse.scale.setScalar(1); (reuse.userData.dark as THREE.Mesh).material = rimFor(item); return { obj: reuse, key }; }
  const t = template(key), g = new THREE.Group(); g.name = "pickup:" + key;
  const body = new THREE.Group(); g.add(body);
  for (const m of t.meshes) { const mesh = new THREE.Mesh(m.geo, m.mat); mesh.castShadow = false; mesh.receiveShadow = true; body.add(mesh); }
  DARK ??= hullMaterial("#1d1409", 1.75); WARM ??= hullMaterial("#ffd940", 4.2, 0.9);
  const dark = new THREE.Mesh(t.hull, rimFor(item)), warm = new THREE.Mesh(t.hull, WARM); dark.renderOrder = 1; warm.renderOrder = 0; warm.visible = false; body.add(dark, warm);
  const shade = new THREE.Mesh(SHADE_GEO, shadeMaterial()); shade.scale.set(t.foot * 1.35 + 0.25, 1, t.foot * 1.35 + 0.25); shade.renderOrder = -1; g.add(shade);
  g.userData = { body, warm, dark, shade, foot: t.foot, h: t.h };
  return { obj: g, key };
}
/** the silhouette: the shared dark one, or (from Standard up) a slightly wider one in the item's tier colour */
const RIMS = new Map<string, THREE.Material>();
function rimFor(item: string): THREE.Material {
  DARK ??= hullMaterial("#1d1409", 1.75);
  const t = tierOf(itemDef(item).rarity); if (t.q < 2) return DARK;
  let m = RIMS.get(t.key); if (!m) { m = hullMaterial(t.color, 2.4); RIMS.set(t.key, m); } return m;
}
/** an item's ground model with no outline and no shade (a jacket left on a bench: a container, not a pickup) */
export function plainModel(item: string): THREE.Group {
  const t = template(modelKey(item)), g = new THREE.Group();
  for (const m of t.meshes) { const mesh = new THREE.Mesh(m.geo, m.mat); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); }
  return g;
}
export function releaseModel(obj: THREE.Object3D, key: string) {
  obj.visible = false; obj.removeFromParent();
  (pool.get(key) ?? pool.set(key, []).get(key)!).push(obj as THREE.Group);
}
/** size of a model's footprint (for spacing several items) */
export const modelFoot = (item: string) => template(modelKey(item)).foot;

// ---------------------------------------------------------------- the throw (Duckov's ItemExtensions numbers)
const tmp = new THREE.Vector3();
/** start a pickup's flight: aim = the direction it goes (radians, world yaw: x = sin, z = cos), +-22.5 deg */
export function throwVelocity(aim: number, rng: () => number) {
  const a = aim + (rng() * 2 - 1) * THROW.spread, h = THROW.hMin + rng() * (THROW.hMax - THROW.hMin);
  return new THREE.Vector3(Math.sin(a) * h, THROW.up, Math.cos(a) * h);
}
/** one physics step for a thrown pickup. Returns true while it still moves */
export function stepThrow(p: { p: THREE.Vector3; v?: THREE.Vector3; landed: boolean; t: number; land?: number }, dt: number) {
  if (!p.v) return false;
  const v = p.v;
  if (!p.landed) {
    v.y -= THROW.gravity * dt;
    const nx = p.p.x + v.x * dt, nz = p.p.z + v.z * dt;
    // a wall or a collider stops it sideways (it drops where it hit, on the near side)
    if (walkable(nx, nz)) { p.p.x = nx; p.p.z = nz; } else { v.x *= -0.15; v.z *= -0.15; }
    p.p.y += v.y * dt;
    const gy = groundHeight(p.p.x, p.p.z);
    if (p.p.y <= gy) { p.p.y = gy; p.landed = true; p.land = 0; v.y = 0; }
    if (p.t > THROW.recover) { p.p.y = gy; p.landed = true; p.land = 0; } // Duckov's fall recovery: put it on the ground
  } else {
    // no bounce, no spin: it skids a little and stops (the physics comes off at 3 s either way)
    const k = Math.exp(-14 * dt); v.x *= k; v.z *= k;
    const nx = p.p.x + v.x * dt, nz = p.p.z + v.z * dt; if (walkable(nx, nz)) { p.p.x = nx; p.p.z = nz; }
    p.p.y = groundHeight(p.p.x, p.p.z);
    if (Math.hypot(v.x, v.z) < 0.04 || p.t > THROW.physicsOff) { p.v = undefined; return false; }
  }
  return true;
}
/** pose a pickup's model from its state: position, landing squash, shade on the drawn ground, selection rim */
export function poseModel(obj: THREE.Object3D, p: THREE.Vector3, landT: number | undefined, selected: boolean, dt: number) {
  const u = obj.userData as { body: THREE.Object3D; warm: THREE.Object3D; shade: THREE.Mesh; foot: number; h: number };
  obj.position.set(p.x, 0, p.z);
  u.body.position.y = p.y;
  if (landT !== undefined && landT < 0.18) { const k = Math.sin((landT / 0.18) * Math.PI) * 0.16; u.body.scale.set(1 + k * 0.5, 1 - k, 1 + k * 0.5); } else u.body.scale.set(1, 1, 1);
  // resting on top of something (a crate, a barrel: loose finds) the shade lies on that top, not on the ground below
  const onTop = landT !== undefined && p.y - groundHeight(p.x, p.z) > 0.15;
  const gy = onTop ? p.y - 0.035 : meshHeightMax(p.x, p.z, Math.min(0.45, u.foot * 0.5)), air = onTop ? 0 : Math.max(0, p.y - groundHeight(p.x, p.z));
  u.shade.position.y = gy + 0.045; (u.shade.material as THREE.Material).opacity = 1;
  const s = (u.foot * 1.35 + 0.25) * (1 + air * 0.35); u.shade.scale.set(s, 1, s); u.shade.visible = air < 2.5;
  u.warm.visible = selected; void dt; void tmp;
}
/** keep the outline width in pixels when the canvas resizes */
export function hullResolution(w: number, h: number) { HULL_U.uRes.value.set(w, h); }
void G;
