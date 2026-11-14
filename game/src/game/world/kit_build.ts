// Structures + landmarks kit (Fable C2). Geometry is authored by script in Blender 5.2 (tools/blender/build/*.py),
// exported as GLB to public/models/build/<group>.glb, and turned into KitPieces / part nodes here.
// Vertex colours carry albedo x baked AO (COLOR_0, linear); there are no textures and no UVs.
//
// USE
//   await preloadBuild();                       // once, before any builder
//   const { pieces, parts } = crate("gold");    // pieces: static geometry at the origin (merge per chunk)
//   scene.add(parts.root); parts.root.position.set(x, groundHeight(x, z), z);   // parts.root holds every moving node
//
// SPACE  +y up, front faces +z (yaw 0), origin on the ground at the footprint centre. 1 u = 1 m; the monkey is ~2 u tall.
//        Walls run along local z with the wall thickness on x (same as the placeholder in props.ts).
//
// PARTS  Every part is an Object3D whose origin is its pivot, parented to parts.root (so its local transform is in asset
//        space). Meshes use kitMaterial(mat); never mutate that shared material. Empty nodes are attach points.
//   crate(tier)          lid     hinge on the back top edge, axis x. Closed = rotation.x 0, open = rotation.x -1.9
//                        glint   (gold only) point above the treasure for a sparkle
//   campfire()           flame   scale/flicker it (origin at the log pile); light: point for a PointLight
//   lantern()            light   point inside the glass for a PointLight
//   gate()               leaf    hinge on the -x post, axis y; open = rotation.y -1.5
//   well()               bucket  hangs on the rope (bob it); drop: point at the bottom of the dark shaft
//   wallSection(kind,{breakable:true})
//                        intact  the whole breakable wall (hide it on break)
//                        debris  Group of chunk_0..n meshes, hidden; each chunk's origin is its centroid. On break:
//                                show, throw each chunk along (chunk.position - hit).setY(+) with gravity and spin,
//                                fade or leave on the ground
//                        remains the stumps / low rubble left standing after the break (hidden until then)
//   door()               leaf    the vine door leaf: hinge on the -x jamb, axis y. Closed 0, open = rotation.y -1.6
//                        keyhole point at the big keyhole (prompt / key fx)
//   fusebox()            lever   pivot at its axle, axis x: up = 0, pulled = rotation.x 1.1;  spark: point at the crossed wires
//   statue()             glint   point at the statue's shades
//   ferry()              hold    the breakable side boards are wallSection("hull", { breakable: true }) at WALLS hull-boards
//                        smoke   point on the funnel
//   bomber()             prop_l / prop_r   propellers, axis z (spin if you like)
//   vat()                puddle  the amber spill decal mesh (a flat piece at y 0.03; kept separate so gameplay can scale it)
//   falls()              water   the falling sheet (scroll or wobble it); foam: point at the splash
//   zipline(from, to)    handle  the trolley + grip: move it along the cable from parts.a to parts.b (points, world space
//                                relative to parts.root); cable is rebuilt for the given span
//   raft()               flag    pivot on the mast, axis y: yaw it into the wind / wobble rotation.y
//   hatch()              lid     hinge at the back of the collar, axis x: closed 0, open = rotation.x -1.9
//                        scope   the periscope head, axis y (it can turn to watch the player)
//   supplyDrop()         smoke   point: red smoke emitter;  crate: the gold crate body (lid: its lid, as in crate())
//   portal(kind)         well: see well().  cave / roots: dark: the dark opening mesh (fade target)
//   bunkerRoom()         fixtures mag | pack | heart | neon (hidden until bought: set .visible), bulbs: emissive string
//                        lights, ladder / sell / bench / mirror / board / shelf / desk / cot: station nodes at their
//                        spots (BUNKER_SPOTS), bell: the counter bell (ding it: scale), lightA..: points for PointLights
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { KitPiece, MatId, CrateTier } from "../contracts";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { kitMaterial, bake } from "./kitutil";

export type Built = { pieces: KitPiece[]; parts: Record<string, THREE.Object3D> };
type Meta = { footprint: number; blocksMove: boolean; blocksShot: boolean; tall: boolean; glow: number; tris: number };
type Src = { name: string; meta: Meta; statics: { geo: THREE.BufferGeometry; mat: MatId }[]; nodes: THREE.Object3D[] };

export const BUILD_GROUPS = ["loot", "camp", "walls", "ruins", "landmarks", "traversal", "bunker"] as const;
const LIB = new Map<string, Src>();
let loading: Promise<void> | null = null;

/** position + normal + colour only, non-indexed (what mergePieces expects), colours as float RGB */
function normalise(geo: THREE.BufferGeometry, mat: MatId, glow: number, m?: THREE.Matrix4, keepIndex = false) {
  let g = geo.index && !keepIndex ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal" && k !== "color") g.deleteAttribute(k);
  const c = g.attributes.color as THREE.BufferAttribute | undefined, n = g.attributes.position.count, col = new Float32Array(n * 3), k = mat === "emissive" ? glow : 1;
  for (let i = 0; i < n; i++) { col[i * 3] = (c ? c.getX(i) : 1) * k; col[i * 3 + 1] = (c ? c.getY(i) : 1) * k; col[i * 3 + 2] = (c ? c.getZ(i) : 1) * k; }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  if (m) g.applyMatrix4(m);
  return g;
}
function ingest(scene: THREE.Object3D) {
  scene.updateMatrixWorld(true);
  for (const root of scene.children) {
    const u = root.userData as Partial<Meta> & { asset?: string };
    if (!u.asset) continue;
    const meta: Meta = { footprint: u.footprint ?? 0.5, blocksMove: !!u.blocksMove, blocksShot: !!u.blocksShot, tall: !!u.tall, glow: u.glow ?? 1.8, tris: u.tris ?? 0 };
    const src: Src = { name: u.asset, meta, statics: [], nodes: [] }, inv = root.matrixWorld.clone().invert();
    for (const ch of [...root.children]) {
      const kind = ch.userData.kind as string, mat = (ch.userData.mat ?? "matte") as MatId;
      if (kind === "static") { const mesh = ch as THREE.Mesh; src.statics.push({ geo: normalise(mesh.geometry, mat, meta.glow, inv.clone().multiply(mesh.matrixWorld)), mat }); continue; }
      ch.traverse((o) => {
        const mesh = o as THREE.Mesh; if (!mesh.isMesh) return;
        const mm = (o.userData.mat ?? "matte") as MatId;
        mesh.geometry = normalise(mesh.geometry, mm, meta.glow, undefined, true); mesh.material = kitMaterial(mm);
        mesh.castShadow = mm !== "emissive"; mesh.receiveShadow = mm !== "emissive";
      });
      ch.name = (ch.userData.part as string) ?? ch.name;
      src.nodes.push(ch);
    }
    LIB.set(src.name, src);
  }
}
/** load every group once (GLTFLoader); resolves when all builders are usable */
export function preloadBuild(base = `${import.meta.env.BASE_URL}models/build/`, groups: readonly string[] = BUILD_GROUPS): Promise<void> {
  loading ??= (async () => {
    const loader = new GLTFLoader();
    const all = await Promise.all(groups.map((g) => loader.loadAsync(`${base}${g}.glb`)));
    for (const gltf of all) ingest(gltf.scene);
  })();
  return loading;
}
export const buildReady = () => LIB.size > 0;
export const buildAssetNames = () => [...LIB.keys()];
export const buildAssetMeta = (name: string) => LIB.get(name)?.meta;

/** any asset by its Blender name (see tools/blender/build/manifest/*.json). m places the static pieces and parts.root. */
export function asset(name: string, m?: THREE.Matrix4, o: Partial<Pick<KitPiece, "footprint" | "blocksMove" | "blocksShot" | "tall">> = {}): Built {
  const s = LIB.get(name);
  if (!s) throw new Error(`kit_build: unknown asset "${name}" (did preloadBuild() finish?)`);
  const pieces: KitPiece[] = s.statics.map(({ geo, mat }) => ({ geo: m ? geo.clone().applyMatrix4(m) : geo.clone(), mat, footprint: o.footprint ?? s.meta.footprint, blocksMove: o.blocksMove ?? s.meta.blocksMove, blocksShot: o.blocksShot ?? s.meta.blocksShot, tall: o.tall ?? s.meta.tall }));
  const root = new THREE.Group(); root.name = s.name;
  if (m) m.decompose(root.position, root.quaternion, root.scale);
  const parts: Record<string, THREE.Object3D> = { root };
  for (const n of s.nodes) { const c = n.clone(true); root.add(c); parts[c.name] = c; }
  return { pieces, parts };
}

// ---------------------------------------------------------------- helpers
const TM = (x = 0, y = 0, z = 0, yaw = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(sx, sy, sz));
const nth = <T,>(list: T[], i = 0) => list[((Math.floor(i) % list.length) + list.length) % list.length];
/** several Builts as one: pieces concatenated, every sub-root parented under one root; part names get the prefix */
function combine(list: { b: Built; prefix?: string }[], name = "set"): Built {
  const root = new THREE.Group(); root.name = name;
  const parts: Record<string, THREE.Object3D> = { root }, pieces: KitPiece[] = [];
  for (const { b, prefix = "" } of list) {
    pieces.push(...b.pieces); root.add(b.parts.root);
    for (const [k, v] of Object.entries(b.parts)) if (k !== "root") parts[prefix + k] = v;
  }
  return { pieces, parts };
}
/** static pieces as one Object3D (for things gameplay must hide or swap: breakable walls, bunker fixtures) */
function piecesToObject(pieces: KitPiece[], name: string): THREE.Group {
  const g = new THREE.Group(); g.name = name;
  const by = new Map<MatId, THREE.BufferGeometry[]>();
  for (const p of pieces) (by.get(p.mat) ?? by.set(p.mat, []).get(p.mat)!).push(p.geo);
  for (const [id, geos] of by) { const m = new THREE.Mesh(geos.length === 1 ? geos[0] : mergeGeometries(geos, false)!, kitMaterial(id)); m.castShadow = id !== "emissive"; m.receiveShadow = id !== "emissive"; g.add(m); }
  return g;
}
const point = (b: Built, name: string) => b.parts[name]?.position ?? new THREE.Vector3();

// ---------------------------------------------------------------- loot
/** crate tiers: wood / green (painted, stencilled) / gold (gold-trimmed strongbox). o.open poses the lid open. */
export function crate(tier: CrateTier, o: { open?: boolean; variant?: number } = {}): Built {
  const b = asset(tier === "wood" ? nth(["crate_wood", "crate_wood_b"], o.variant) : tier === "green" ? "crate_green" : "crate_gold");
  if (o.open) b.parts.lid.rotation.x = CRATE_LID_OPEN;
  return b;
}
export const CRATE_LID_OPEN = -1.9;
export const barrel = (variant = 0) => asset(nth(["barrel_wood", "barrel_rust", "barrel_teal"], variant));
export const sack = (pile = false) => asset(pile ? "sack_pile" : "sack");
export const bananaStash = () => asset("banana_stash");
export const ammoBox = () => asset("ammo_box");
/** the player's bag, dropped on a bonk-out */
export const satchel = () => asset("satchel");

// ---------------------------------------------------------------- camp
export const tent = (variant = 0) => asset(nth(["tent_a", "tent_b"], variant));
export const tarp = () => asset("tarp");
export const bedroll = (variant = 0) => asset(nth(["bedroll_a", "bedroll_b"], variant));
export const campfire = () => asset("campfire");
export const lantern = (onPost = false) => asset(onPost ? "lantern_post" : "lantern");
/** stick fence section, 2.5 u along local x */
export const fence = (variant = 0) => asset(nth(["fence_a", "fence_b"], variant));
export const gate = (open = false) => { const b = asset("gate"); if (open) b.parts.leaf.rotation.y = -1.5; return b; };
export const watchtower = () => asset("watchtower");
export const well = () => asset("well");
export const logBench = (variant = 0) => asset(nth(["log_bench", "log_bench_b"], variant));
export const signpost = (kind: "a" | "raft" | "key" = "a") => asset(`signpost_${kind}`);

// ---------------------------------------------------------------- walls
export type WallKind = "palisade" | "stone" | "hull" | "rock" | "fence";
const WALL_KIT: Record<WallKind, { len: number; solid: string[]; weak?: string; debris?: string; post?: string }> = {
  palisade: { len: 2.5, solid: ["wall_palisade_a", "wall_palisade_b"], weak: "wall_palisade_weak", debris: "wall_palisade_debris", post: "wall_palisade_post" },
  stone: { len: 1.85, solid: ["wall_stone_a", "wall_stone_b"], weak: "wall_stone_weak", debris: "wall_stone_debris" },
  hull: { len: 2.5, solid: ["wall_hull_a"], weak: "wall_hull_weak", debris: "wall_hull_debris" },
  rock: { len: 2.1, solid: ["wall_rock_a"], weak: "wall_rock_weak", debris: "wall_rock_debris" },
  fence: { len: 2.5, solid: ["fence_a", "fence_b"] },
};
/** A wall of `length` u running along local z, centred on the origin (rotate it with yawOf(a, b) as props.ts does).
 *  Solid: static pieces. Breakable: parts.intact (hide on break), parts.debris (hidden Group of chunk meshes, origin at
 *  each chunk's centroid: show + fling), parts.remains (hidden: stumps / rubble left afterwards). */
export function wallSection(kind: WallKind, o: { length?: number; breakable?: boolean; seed?: number } = {}): Built {
  const k = WALL_KIT[kind], length = o.length ?? k.len, n = Math.max(1, Math.round(length / k.len)), s = length / (n * k.len);
  const mod = (i: number) => TM(0, 0, (i - (n - 1) / 2) * k.len * s, Math.PI / 2, s, 1, 1);
  const root = new THREE.Group(); root.name = `wall_${kind}`;
  const parts: Record<string, THREE.Object3D> = { root }, pieces: KitPiece[] = [];
  if (!o.breakable || !k.weak || !k.debris) {
    for (let i = 0; i < n; i++) pieces.push(...asset(nth(k.solid, i + (o.seed ?? 0)), mod(i)).pieces);
    return { pieces, parts };
  }
  if (k.post) for (const e of [-1, 1]) pieces.push(...asset(k.post, TM(0, 0, e * (length / 2 + 0.12))).pieces);
  const intact: KitPiece[] = [], debris = new THREE.Group(), remains = new THREE.Group();
  debris.name = "debris"; remains.name = "remains"; debris.visible = remains.visible = false;
  for (let i = 0; i < n; i++) {
    intact.push(...asset(k.weak, mod(i)).pieces);
    const d = asset(k.debris, mod(i));
    d.parts.root.updateMatrix();
    for (const c of [...d.parts.root.children]) { c.applyMatrix4(d.parts.root.matrix); c.name = c.name === "remains" ? c.name : `${c.name}_${i}`; (c.name === "remains" ? remains : debris).add(c); }
  }
  parts.intact = piecesToObject(intact, "intact"); parts.debris = debris; parts.remains = remains;
  root.add(parts.intact, debris, remains);
  return { pieces, parts };
}
export const rubblePile = (rock = false) => asset(rock ? "rubble_pile_rock" : "rubble_pile");

// ---------------------------------------------------------------- ruins
export const ruinFloor = (variant = 0) => asset(nth(["ruin_floor_a", "ruin_floor_b", "ruin_floor_c"], variant));
export const ruinSteps = () => asset("ruin_steps");
/** drum pillar: 0 whole, 1 broken, 2 fallen */
export const pillar = (variant = 0) => asset(nth(["pillar_a", "pillar_b", "pillar_c"], variant));
export const brokenWall = () => asset("ruin_wall_broken");
export const arch = () => asset("ruin_arch");
/** the vine door (DOOR.w = 3.4 along local x, front +z). parts.leaf hinges on the -x jamb: rotation.y 0 → DOOR_OPEN */
export const door = (open = false) => { const b = asset("vine_door"); if (open) b.parts.leaf.rotation.y = DOOR_OPEN; return b; };
export const DOOR_OPEN = -1.6;
/** the Warden's Vault interior (8.8 x 6.8 u). parts.crate marks the strongbox plinth; light0/light1 the torches */
export const vault = () => asset("vault");
export const plinth = () => asset("vault_plinth");
export const fusebox = () => asset("fusebox");
export const statue = () => asset("statue");

// ---------------------------------------------------------------- landmarks (named after layout.ts LANDMARKS ids)
/** hull x -4.5..5.6 (bow east), z -3..3 around LANDMARKS.ferry: it IS the hull-n / hull-s / hull-e walls, so do not
 *  also build those. The stern is open for wallSection("hull", { length: 5, breakable: true }) at WALLS hull-boards. */
export const ferry = () => asset("ferry");
export const bomber = () => asset("bomber");
export const vat = () => asset("vat");
export const tractor = () => asset("tractor");
/** wall-mounted: put the origin at the foot of the trunk face, front (+z) pointing away from the tree */
export const audit = () => asset("audit");
/** the walk-through waterfall. parts.water is the sheet: give it a translucent material (see waterMaterial()) */
export function falls(): Built { const b = asset("falls"); (b.parts.water as THREE.Mesh).material = waterMaterial(); b.parts.water.castShadow = false; return b; }
export const bottle = () => asset("bottle");
export const lemonStand = () => asset("lemon_stand");
export const lemon = lemonStand;
let WATER: THREE.Material | null = null;
export function waterMaterial() { return (WATER ??= new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false })); }

// ---------------------------------------------------------------- traversal + exits
/** One-way zipline. a = ground point under the lookout tower, b = ground point of the landing; h = deck height (layout
 *  from.h), endH = landing height (layout to.h). Pieces and parts are in WORLD space (parts.root stays at the origin).
 *  The rider's root runs from parts.from to parts.to (as interact.ts does); parts.handle starts at the top anchor,
 *  ZIP_HANG above the rider: move it along parts.a → parts.b. */
export function zipline(a: THREE.Vector3, b: THREE.Vector3, o: { h?: number; endH?: number } = {}): Built {
  const h = o.h ?? 6, endH = o.endH ?? 1.2, dx = b.x - a.x, dz = b.z - a.z;
  const tw = asset("zip_tower", TM(a.x, a.y, a.z, Math.atan2(-dz, dx), 1, h / 6, 1));
  const anchorB = endH + 1.4 + ZIP_HANG;
  const en = asset("zip_end", TM(b.x, b.y, b.z, Math.atan2(dz, -dx), 1, anchorB / 4.8, 1));
  const out = combine([{ b: tw, prefix: "tower_" }, { b: en, prefix: "end_" }], "zipline");
  const wa = tw.parts.anchor.getWorldPosition(new THREE.Vector3()), wb = en.parts.anchor.getWorldPosition(new THREE.Vector3());
  const len = wa.distanceTo(wb), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), wb.clone().sub(wa).normalize());
  const cable = bake(new THREE.CylinderGeometry(0.035, 0.035, len, 5, 1), "#2e2a30", new THREE.Matrix4().compose(wa.clone().lerp(wb, 0.5), q, new THREE.Vector3(1, 1, 1)));
  out.pieces.push({ geo: cable, mat: "matte", footprint: 0, blocksMove: false, blocksShot: false, tall: true });
  const hd = asset("zip_handle").parts.handle; hd.position.copy(wa); hd.quaternion.setFromEuler(new THREE.Euler(0, Math.atan2(-dz, dx), 0)); out.parts.root.add(hd); out.parts.handle = hd;
  const mk = (n: string, p: THREE.Vector3) => { const e = new THREE.Object3D(); e.name = n; e.position.copy(p); out.parts.root.add(e); out.parts[n] = e; };
  mk("a", wa); mk("b", wb); mk("from", new THREE.Vector3(a.x, a.y + h, a.z)); mk("to", new THREE.Vector3(b.x, b.y + endH + 1.4, b.z));
  return out;
}
export const ZIP_HANG = 2.3;
/** boardwalk section on stilts, 4 u along local x, 2.8 wide: 0 plain, 1 broken plank, 2 end ramp (2.6 u) */
export const boardwalk = (variant = 0) => asset(nth(["boardwalk_a", "boardwalk_b", "boardwalk_ramp"], variant));
/** plank bridge, 5 u along local x */
export const bridge = () => asset("bridge");
export const raft = () => asset("raft");
export const hatch = (open = false) => { const b = asset("hatch"); if (open) b.parts.lid.rotation.x = -1.9; return b; };
/** crashed bandit balloon gondola + a gold crate (parts.lid) + parts.smoke (red smoke emitter point) */
export function supplyDrop(): Built {
  const g = asset("supply_gondola"), c = asset("crate_gold", TM(point(g, "crate").x, 0, point(g, "crate").z, 0.5));
  const out = combine([{ b: g }, { b: c }], "supply_drop"); out.parts.crate = c.parts.root; return out;
}
/** sub-level entrances, by PORTALS id (or "back" for the grotto side). parts.dark = the black opening (fade target) */
export function portal(kind: "camp-well" | "cove-cave" | "hollow-roots" | "back" | string): Built {
  return asset(kind === "camp-well" ? "well" : kind === "hollow-roots" ? "portal_roots" : kind === "back" ? "portal_cave_dark" : "portal_cave");
}

// ---------------------------------------------------------------- the bunker
/** where each station stands in the room (game x, z), matching home/bunker.ts */
export const BUNKER_SPOTS = { sell: { x: -4.5, z: -2.6 }, bench: { x: 0.5, z: -3.4 }, orders: { x: 4.6, z: -2.8 }, mirror: { x: -6.2, z: 1.6 }, trophies: { x: 6.4, z: 1.4 }, ladder: { x: 0, z: 3.4 }, sal: { x: 6.2, z: -1.6 } };
const BUNKER_STATIC = ["bunker_room", "bunker_counter", "bunker_workbench", "bunker_pinboard", "bunker_mirror", "bunker_ladder", "bunker_cot", "bunker_desk", "bunker_shelf", "bunker_lights"];
/** The whole room, authored in room space (x -8..8, z -5..5, floor y 0; back wall at z -5, front and west cut away).
 *  parts: mag | pack | heart | neon = the upgrade fixtures (Groups, hidden: set .visible when bought), bulbs (emissive
 *  string lights), bell, glass (mirror pane: swap in a reflective material if wanted), slot0..8 (trophy positions),
 *  counter / read / stand / climb / sal / spawn (points), light* (points for PointLights). */
export function bunkerRoom(): Built {
  const out = combine(BUNKER_STATIC.map((n) => ({ b: asset(n), prefix: n === "bunker_lights" ? "string_" : n === "bunker_room" ? "" : `${n.slice(7)}_` })), "bunker");
  const alias: Record<string, string> = { string_bulbs: "bulbs", counter_bell: "bell", mirror_glass: "glass", counter_counter: "counter", pinboard_read: "read", mirror_stand: "stand", ladder_climb: "climb" };
  for (const [from, to] of Object.entries(alias)) if (out.parts[from]) out.parts[to] = out.parts[from];
  for (let i = 0; i < 9; i++) if (out.parts[`shelf_slot${i}`]) out.parts[`slot${i}`] = out.parts[`shelf_slot${i}`];
  for (const id of ["mag", "pack", "heart", "neon"]) {
    const f = asset(`bunker_fx_${id}`), g = piecesToObject(f.pieces, id);
    g.add(f.parts.root); g.visible = false; out.parts.root.add(g); out.parts[id] = g;
  }
  return out;
}
