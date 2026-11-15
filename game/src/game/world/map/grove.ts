// Banana Grove v3, the G1 raid map, authored as placements (G1_BRIEF "Map v3"). Open ground is the default; the
// things placed here are what block you. Mechanism sources: research/duckov-re MAP_FINDINGS (every raid subscene
// carries Door, Breakable, OcclusionFade, DarkRoomFade, point lights, teleporters) and research/duckov-map section 2
// (built places joined by funnelled connectors) + rule 9 (break every connector each 4-6 s). Layout, names and gags
// are ours (LORE.md); nothing here copies a Duckov layout.
//
// x = east, z = south (toward the camera). Overworld x -104..104, z -116..114; the grotto sub-level is at x 136..200.
// Metrics (combat/weapons.ts): walk 4.6 u/s, sprint 6.6, roll 3.2 u, player radius 0.45, pistol range 16, sight 9-11.
//   A doorway is 1.4 u, a gate 3 u, a road 3-4 u; cover is 0.9-1.1 u high; 4-6 s of walking = 18-28 u.
// Time budget (human; bot = / 1.33): chicken run to the hatch 2.5-3.5 min, raft run 5-6.5 min. Nothing worth having
// sits next to the spawn: the first crates are 30+ u out, gold and the key are 100+ u out behind guards.
// Buildings stand at half-integer coordinates with yaw in quarter turns, so walls and doorways land on nav cells.
import type { Placed } from "../../contracts";
import type { Zone, Road, Shape, Wall, Portal, CrateSocket, Spawn, Pt, EdgeKind } from "./types";
import { toWorld } from "./types";
import { pinVariant } from "./colliders";
import { plugGaps } from "./seal";

// ---------------------------------------------------------------- authoring helpers (deterministic)
const P: Placed[] = [];
const WALLS_: Wall[] = [];
let sd = 20261115;
const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647, rr = (a: number, b: number) => a + rnd() * (b - a);
const H = Math.PI / 2;
function put(k: string, x: number, z: number, yaw = 0, s = 1, o?: Record<string, unknown>, id?: string) { P.push({ k, x, z, yaw, s, o, id }); }
/** several pieces around a point: [kind, dx, dz, yaw?, scale?, opts?] rotated by yaw */
type Item = [string, number, number, number?, number?, Record<string, unknown>?];
function group(x: number, z: number, yaw: number, items: Item[]) {
  for (const [k, dx, dz, y = 0, s = 1, o] of items) { const [wx, wz] = toWorld({ x, z, yaw }, dx, dz); put(k, wx, wz, yaw + y, s, o); }
}
/** a straight run of wall modules from a to b */
function wall(kind: Wall["kind"], ax: number, az: number, bx: number, bz: number) {
  const len = Math.hypot(bx - ax, bz - az); if (len < 0.4) return;
  put(`wall:${kind}`, (ax + bx) / 2, (az + bz) / 2, Math.atan2(bx - ax, bz - az), 1, { len });
}
function breakable(id: string, kind: Wall["kind"], ax: number, az: number, bx: number, bz: number, hp: number, persist: boolean, reveals: string) {
  WALLS_.push({ id, pts: [[ax, az], [bx, bz]], kind, breakable: { hp, persist, reveals } });
}
type Gap = { side: "n" | "s" | "e" | "w"; at: number; w: number; gate?: boolean; posts?: string; breakId?: string; hp?: number; persist?: boolean; reveals?: string };
/** a walled compound: wall runs on all four sides with authored gaps (gates, breakable sections) */
function enclosure(kind: Wall["kind"], x0: number, z0: number, x1: number, z1: number, gaps: Gap[], skip = "") {
  for (const side of ["n", "s", "e", "w"] as const) {
    if (skip.includes(side)) continue;
    const alongX = side === "n" || side === "s", fixed = side === "n" ? z0 : side === "s" ? z1 : side === "w" ? x0 : x1;
    const a0 = alongX ? x0 : z0, a1 = alongX ? x1 : z1;
    const at = (t: number): Pt => (alongX ? [t, fixed] : [fixed, t]);
    const gs = gaps.filter((g) => g.side === side).sort((a, b) => a.at - b.at);
    let cur = a0;
    for (const g of gs) {
      const s0 = g.at - g.w / 2, s1 = g.at + g.w / 2;
      wall(kind, ...at(cur), ...at(s0)); cur = s1;
      if (g.breakId) breakable(g.breakId, kind, ...at(s0), ...at(s1), g.hp ?? 6, g.persist ?? true, g.reveals ?? "");
      if (g.gate) put("gate", ...at(g.at), alongX ? 0 : H, 1, { open: true });
      if (g.posts) { put(g.posts, ...at(s0 - 0.2), rr(0, 6)); put(g.posts, ...at(s1 + 0.2), rr(0, 6)); }
    }
    wall(kind, ...at(cur), ...at(a1));
  }
}
/** a rock ridge: big boulders shoulder to shoulder along a polyline (a hard funnel you walk around) */
function ridge(pts: Pt[], s = 2.0) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / (1.7 * s)));
    for (let k = 0; k <= n; k++) {
      if (k === n && i < pts.length - 2) continue;
      const t = k / n, big = rnd() < 0.3;
      put(big ? "boulders" : "rockl", ax + (bx - ax) * t + rr(-0.5, 0.5), az + (bz - az) * t + rr(-0.5, 0.5), rr(0, 6.28), (big ? 0.75 : 1) * s * rr(0.9, 1.2));
      if (rnd() < 0.5) put(rnd() < 0.5 ? "bush" : "fern", ax + (bx - ax) * t + rr(-2.2, 2.2), az + (bz - az) * t + rr(-2.2, 2.2), rr(0, 6.28), rr(0.9, 1.3));
    }
  }
}
/** a thicket: trees trunk to trunk with solid undergrowth (a soft funnel: shots stop, you walk around) */
function thicket(pts: Pt[], w = 3) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 1.5));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, nx = -(bz - az) / len, nz = (bx - ax) / len, off = rr(-w / 2, w / 2), f = rnd();
      const x = ax + (bx - ax) * t + nx * off, z = az + (bz - az) * t + nz * off;
      if (f < 0.34) put(rnd() < 0.5 ? "tree" : "palm", x, z, rr(0, 6.28), rr(0.85, 1.15));
      else put(f < 0.7 ? "bush" : f < 0.85 ? "bigleaf" : "banana", x, z, rr(0, 6.28), rr(1.0, 1.4), { solid: 0.8 });
    }
  }
}
/** a stick fence from a to b */
const fence = (ax: number, az: number, bx: number, bz: number) => wall("fence", ax, az, bx, bz);
/** rows of banana plants (the plantation fields) */
function rows(x0: number, z0: number, x1: number, z1: number, stepX = 2.4, stepZ = 2.6) {
  for (let x = x0; x <= x1; x += stepX) for (let z = z0; z <= z1; z += stepZ) if (rnd() < 0.86) put("banana", x + rr(-0.2, 0.2), z + rr(-0.3, 0.3), rr(0, 6.28), rr(0.9, 1.25));
}
/** boardwalk sections along a polyline (4 u each, sunk so the deck sits on the causeway the road raises) */
function boardwalk(pts: Pt[]) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 4)), yaw = Math.atan2(-(bz - az), bx - ax);
    for (let k = 0; k < n; k++) { const t = (k + 0.5) / n; put(rnd() < 0.25 ? "boardwalk_b" : "boardwalk_a", ax + (bx - ax) * t, az + (bz - az) * t, yaw, 1, { len: len / n, deck: true }); }
  }
}

// ---------------------------------------------------------------- the outline
export const SEA_Z = 112;    // south of this is the sea
export const RIVER_Z = -114; // north of this is the river
export const UNDER_X = 120;  // the grotto sub-level lives east of this
export const BOUNDS = { minX: -112, maxX: 204, minZ: -124, maxZ: 124 };
/** decks over water: walkable, but the ground under them is river bed (terrain.ts carves it and lifts the walk height
 *  to the deck). The landing pier runs north from the beach; a stub of its west arm still stands (G1 council fix round
 *  1: the dock was a board strip on dry sand, the water a sliver in the corner of the frame). */
export const PIER_Y = 0.36;
export const PIERS = [
  { id: "dock", x0: 15.55, x1: 18.45, z0: -115.8, z1: -103.4 },
  { id: "dock-west", x0: 13.7, x1: 15.55, z0: -109.3, z1: -106.7 },
];
const PIER_PTS: [number, number, EdgeKind][] = [[18.45, -106.2, "river"], [18.45, -115.8, "river"], [15.55, -115.8, "river"], [15.55, -109.3, "river"], [13.7, -109.3, "river"], [13.7, -106.8, "river"]];
const OVER: [number, number, EdgeKind][] = [
  [-100, 100, "coast"], [-84, 110, "coast"], [-40, 113, "coast"], [0, 114, "coast"], [40, 113, "coast"], [80, 110, "coast"],
  [98, 100, "cliff"], [102, 76, "jungle"], [100, 40, "jungle"], [103, 14, "cliff"], [100, -30, "jungle"], [102, -56, "cliff"],
  [96, -70, "cliff"], [74, -71, "cliff"], [73, -87, "cliff"], [59, -87, "cliff"], [58, -71, "cliff"], [52, -74, "cliff"], [50, -92, "jungle"],
  [54, -108, "river"], [40, -109.5, "river"], [30, -106.5, "river"], [22, -105.8, "river"], ...PIER_PTS, [12, -107, "river"], [4, -106.6, "river"], [0, -109, "river"], [-1.5, -116, "river"], [-30, -116, "river"], [-70, -112, "river"],
  [-90, -100, "jungle"], [-100, -70, "cliff"], [-104, -30, "jungle"], [-100, 0, "jungle"], [-102, 30, "cliff"], [-104, 70, "cliff"], [-103, 88, "cliff"],
];
/** the land alone: the outline without the pier decks (what the terrain and the shore paint follow) */
export const LAND: [number, number, EdgeKind][] = OVER.filter((q) => !PIER_PTS.includes(q));
/** walkable outline. The grotto is carved space (chambers + corridors), which is what a cave is */
export const SHAPES: Shape[] = [
  { t: "poly", pts: OVER },
  { t: "ellipse", x: 150, z: 62, rx: 11, rz: 8, under: true }, { t: "ellipse", x: 168, z: 26, rx: 15, rz: 11, under: true },
  { t: "ellipse", x: 154, z: -24, rx: 11, rz: 9, under: true }, { t: "ellipse", x: 192, z: 44, rx: 6, rz: 5, under: true },
  { t: "capsule", pts: [[153, 55], [158, 44], [162, 35]], w: 5.6, under: true },
  { t: "capsule", pts: [[164, 17], [159, 2], [156, -15]], w: 5.6, under: true },
  { t: "capsule", pts: [[180, 31], [185, 37], [189, 41]], w: 5.0, under: true },
];

// ---------------------------------------------------------------- zones (names, ground paint, scatter biome; never walkability)
const rect = (x0: number, z0: number, x1: number, z1: number): Pt[] => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const oval = (x: number, z: number, rx: number, rz: number, n = 14): Pt[] => Array.from({ length: n }, (_, i) => [x + Math.cos((i / n) * 6.2832) * rx, z + Math.sin((i / n) * 6.2832) * rz] as Pt);
/** first match wins: small zones go before the big ones they sit in */
export const ZONES: Zone[] = [
  { id: "wreck", name: "The Prison Ferry", pts: rect(58.5, 97.2, 71.5, 104.8), ground: "plank", biome: "yard", flat: true },
  { id: "cove", name: "Smuggler's Cove", pts: oval(-84, 96, 16, 11), ground: "sand", biome: "beach" },
  { id: "beach", name: "Exile Beach", pts: [[-70, 93], [-30, 90], [30, 90], [72, 92], [96, 96], [96, 116], [-90, 116]], ground: "sand", biome: "beach" },
  { id: "palms", name: "Palm Edge", pts: [[-30, 90], [30, 90], [28, 58], [-26, 58]], ground: "grass", biome: "jungle" },
  { id: "westbend", name: "Lookout Bend", pts: oval(-38, 61, 9, 7), ground: "grass", biome: "jungle" },
  { id: "camp", name: "Peel Gang Camp", pts: rect(-79, 11, -45, 41), ground: "dirt", biome: "yard", flat: true },
  { id: "mangrove", name: "Mangrove Boardwalk", pts: [[30, 76], [56, 80], [96, 76], [98, 40], [84, 30], [56, 34], [34, 46]], ground: "mud", biome: "swamp", water: -0.16 },
  { id: "plantation", name: "Old Plantation", pts: rect(-20, 1, 28, 41), ground: "dirt", biome: "farm", flat: true },
  { id: "shrine", name: "???", pts: rect(56.6, -22, 66.4, -11.6), ground: "stone", biome: "ruin", flat: true },
  { id: "vault", name: "The Warden's Vault", pts: rect(75.5, -32, 87, -22.5), ground: "stone", biome: "ruin", flat: true },
  { id: "ruin", name: "Penal Colony", pts: rect(49, -23, 88, 16), ground: "stone", biome: "ruin", flat: true },
  { id: "radio", name: "The Radio Shack", pts: oval(-28, -15, 9, 7), ground: "dirt", biome: "yard", flat: true },
  { id: "planecrash", name: "Bomber Wreck", pts: oval(-66, -44, 16, 12), ground: "dirt", biome: "crash" },
  { id: "falls-nook", name: "Behind the Falls", pts: rect(59, -87, 73, -76), ground: "stone", biome: "falls", flat: true },
  { id: "waterfall", name: "Waterfall Pool", pts: oval(66, -62, 13, 10), ground: "grass", biome: "falls" },
  { id: "hollow", name: "The Sleeper's Hollow", pts: oval(0, -58, 17, 14), ground: "dirt", biome: "hollow" },
  { id: "riverbank", name: "Raft Landing", pts: [[-66, -96], [-20, -92], [46, -94], [54, -108], [20, -118], [-30, -118], [-70, -114]], ground: "sand", biome: "beach" },
  // the grotto: an underground sub-level (darker light, cave ground); three ways in, one secret way out
  { id: "grotto-a", name: "Grotto Mouth", pts: oval(150, 62, 12, 9), ground: "cave", biome: "cave", under: true },
  { id: "tunnel", name: "Smuggler Tunnel", pts: oval(192, 44, 7, 6), ground: "cave", biome: "cave", under: true },
  { id: "grotto-b", name: "Smugglers' Hall", pts: oval(168, 26, 16, 12), ground: "cave", biome: "cave", under: true },
  { id: "grotto-c", name: "Root Chamber", pts: oval(154, -24, 12, 10), ground: "cave", biome: "cave", under: true },
];

// ---------------------------------------------------------------- roads (ground paint; the funnels are the things beside them)
const ROADS_: Omit<Road, "bb">[] = [
  { id: "hatch-road", pts: [[-8, 100], [-4, 90], [0.5, 80.5], [0, 64]], w: 3.6, ground: "dirt" },
  { id: "beach-west", pts: [[-14, 101], [-40, 99], [-62, 99], [-74, 95]], w: 3.0, ground: "sand" },
  { id: "beach-east", pts: [[-2, 102], [28, 101], [56, 101]], w: 3.0, ground: "sand" },
  { id: "west-trail", pts: [[0, 64], [-18, 64], [-36, 62], [-48, 53], [-56, 46], [-60, 40]], w: 3.2, ground: "dirt" },
  { id: "north-road", pts: [[0, 64], [0, 52], [-2, 41]], w: 3.4, ground: "dirt" },
  { id: "boardwalk", pts: [[0, 64], [16, 62], [30, 58], [48, 54], [56, 50], [66, 42], [68, 32], [68, 16]], w: 3.4, ground: "plank", raise: 0.02 },
  { id: "jetty", pts: [[48, 54], [44, 64], [46, 70]], w: 3.2, ground: "plank", raise: 0.02 },
  { id: "camp-yard", pts: [[-60, 40], [-61, 30], [-64, 20], [-64, 12]], w: 3.0, ground: "dirt" },
  { id: "camp-shortcut", pts: [[-46, 26], [-32, 25], [-20, 22]], w: 2.8, ground: "dirt" },
  { id: "camp-north", pts: [[-64, 12], [-66, -4], [-66, -24], [-66, -36]], w: 3.0, ground: "dirt" },
  { id: "farm-yard", pts: [[-2, 41], [0, 30], [2, 20], [0, 8], [0, 1]], w: 3.4, ground: "dirt" },
  { id: "farm-east", pts: [[2, 20], [14, 12], [28, 12], [38, 8], [49, 2]], w: 3.2, ground: "dirt" },
  { id: "ridge-road", pts: [[0, 1], [-2, -12], [0, -28], [0, -44]], w: 3.4, ground: "dirt" },
  { id: "radio-spur", pts: [[-2, -12], [-14, -13], [-24, -14]], w: 2.6, ground: "dirt" },
  { id: "bomber-furrow", pts: [[-44, -52], [-56, -47], [-66, -44]], w: 5.0, ground: "dirt" },
  { id: "bomber-hollow", pts: [[-54, -49], [-36, -54], [-17, -58]], w: 3.0, ground: "dirt" },
  { id: "colony-north", pts: [[71, -22], [70, -36], [66, -50], [64, -56]], w: 3.0, ground: "dirt" },
  { id: "falls-hollow", pts: [[54, -62], [36, -60], [17, -58]], w: 3.0, ground: "dirt" },
  { id: "river-road", pts: [[2, -72], [8, -84], [10, -98]], w: 3.4, ground: "dirt" },
  { id: "west-beach", pts: [[-66, -56], [-74, -74], [-70, -92], [-52, -100], [-20, -102], [8, -102]], w: 2.8, ground: "sand" },
  { id: "dock", pts: [[17, -100.4], [17, -103.6]], w: 3.0, ground: "plank" },
  { id: "grotto-ab", pts: [[151, 58], [158, 44], [164, 32]], w: 3.0, ground: "cave" },
  { id: "grotto-bc", pts: [[164, 18], [159, 2], [156, -16]], w: 3.0, ground: "cave" },
  { id: "grotto-tunnel", pts: [[178, 30], [185, 37], [191, 43]], w: 2.6, ground: "cave" },
];
export const ROADS: Road[] = ROADS_.map((r) => ({ ...r, bb: [Math.min(...r.pts.map((p) => p[0])) - r.w - 6, Math.max(...r.pts.map((p) => p[0])) + r.w + 6, Math.min(...r.pts.map((p) => p[1])) - r.w - 6, Math.max(...r.pts.map((p) => p[1])) + r.w + 6] }));

// ================================================================ the places
// ---------------------------------------------------------------- Exile Beach + the hatch
put("hatch", -8, 102, 0, 1, undefined, "hatch");
group(-8, 102, 0, [["barrel_teal", 3.4, 2.2], ["sack", 3.9, 1.1, 0.6], ["driftwood", -4, 3, 0.4, 1.2], ["palmlean", -5.5, -3.5, 2.2], ["shells", 2.5, 4.5], ["beachgrass", -3.5, -1.5], ["beachgrass", 5.5, -2.5, 1], ["rockm", 6.5, 3.5, 0.3]]);
put("bottle", -34, 108.5, 0.4, 1, undefined, "bottle");
group(-34, 107, 0, [["driftwood", 2.5, -0.5, 1.1, 1.3], ["shells", -2, 0.5], ["rockm", -3.5, -2, 0, 1.1], ["beachgrass", 1.5, -3]]);
// a beached rowboat's worth of flotsam at each end of the sand: the reason to walk the beach
group(-40, 100, 0.3, [["crate_wood_b", 2.2, 0.6, 0.5], ["barrel_wood", -1.6, 1.2], ["sack_pile", 0.4, -2.0, 0.2], ["driftwood", 3, 2.6, 2], ["palm", -3.5, -2.6], ["rockl", -5.2, 0.8, 1, 1.1], ["beachgrass", 4.5, -1.5]]);
group(34, 104, -0.2, [["barrel_rust", 1.8, 0.4], ["barrel_teal", 2.6, 1.2], ["driftwood", -2.5, 1.5, 0.7, 1.4], ["log", -0.5, -2.4, 1.3], ["palmlean", 3.5, -3, 4], ["rockm", -4, -0.5], ["shells", 0.5, 2.8]]);
group(1, 95, 0.2, [["driftwood", -2.4, 0.6, 0.4, 1.3], ["rockm", 2.6, 1.4], ["crate_wood_b", 3.4, -1.6, 0.5], ["barrel_rust", -3.6, -1.4], ["log", 0.4, -3.2, 1.1], ["rockl", -5.5, 2.5, 0, 1.1], ["sack", 2.2, -2.6]]); // what the tide left by the hatch road
group(-12, 97, 0, [["rockm", -1.4, 1.2], ["driftwood", 1.6, -1.2, 2, 1.2], ["palm", -3.4, -2.4], ["rocks", 2.4, 2.2, 0, 1.3], ["barrel_wood", -4.6, 1.6]]);
put("zip_end", 20, 99, 0, 1, undefined, "zip-end");
group(20, 99, 0, [["barrel_wood", 3.2, 1.5], ["signpost_a", -2.6, 1.8, 0.4], ["rockm", 4.5, -1.5], ["beachgrass", -3.5, -1]]);
for (const [x, z] of [[-58, 104], [-22, 96], [10, 106], [46, 97], [78, 104], [-66, 108], [56, 108], [-14, 108], [86, 99]]) group(x, z, rr(0, 6), [[rnd() < 0.5 ? "palmlean" : "palm", 0, 0, rr(0, 6), rr(0.9, 1.2)], ["beachgrass", 1.6, 0.8], ["rockm", -1.8, 1.2, rr(0, 6), rr(0.8, 1.2)], ["driftwood", 0.5, -2.2, rr(0, 6)]]);

// ---------------------------------------------------------------- The Prison Ferry (enterable hull; the stern boards break)
put("ferry", 64, 101, 0, 1, undefined, "ferry");
breakable("hull-boards", "hull", 60, 98.5, 60, 103.5, 4, false, "The ferry's hold");
group(64, 101, 0, [["barrel_rust", 4.4, 1.4], ["sack_pile", -0.6, 1.4, 0.2], ["crate_wood_b", -1.6, -0.6, 0.3], ["barrel_teal", -6.6, -3.4], ["barrel_teal", -7.4, 2.6], ["driftwood", -8.5, 0.5, 1.4, 1.5], ["rockl", 9.5, 2, 0, 1.4], ["rockl", 8.5, -4.5, 2, 1.2], ["rockm", -6, 5.6], ["log", -9, -3, 0.4], ["signpost_a", -7.6, -0.8, 1.2]]);

// ---------------------------------------------------------------- Smuggler's Cove (cave portal into the grotto)
put("portal_cave", -97, 91, H, 1, undefined, "cove-cave");
ridge([[-66, 90], [-70, 96]], 1.8); ridge([[-71, 104], [-74, 109]], 1.8); // the cove's rock arms; the gap between them is the way in
ridge([[-92, 82], [-80, 84], [-70, 86]], 2.0);
group(-82, 98, 0, [["tarp", -3, -4.5, 0.3], ["bedroll_a", -3.2, -4.6, 0.6], ["barrel_wood", 3.6, -2.2], ["barrel_rust", 4.4, -1.4], ["crate_green", 5.2, -3.4, 0.4], ["sack_pile", 1.2, -6, 0.2], ["campfire", 1, -1.5], ["log_bench", 2.6, 0.4, 0.4], ["lantern_post", -5.8, -1.5, 1], ["driftwood", -1, 5, 0.6, 1.4], ["rockl", -8, 3.5, 0, 1.3], ["rockm", 7.5, 3.5], ["palmlean", -6.5, 7, 1], ["shells", 4, 6], ["banana_stash", -0.8, -5.2, 0.5]]);

// ---------------------------------------------------------------- Palm Edge: the checkpoint (first building, first guard)
ridge([[-103, 82], [-88, 80], [-70, 82], [-52, 80], [-36, 82], [-22, 80], [-11, 81]], 2.0);
ridge([[12, 81], [22, 79], [30, 78]], 2.0);
fence(-10.5, 81, -2.4, 81); put("gate", -0.8, 81, 0, 1, { open: true }); fence(0.8, 81, 3.5, 81);
put("building:guard_hut", 6.5, 78.5, -H, 1, { open: true }, "hut-south");
group(0, 80, 0, [["signpost_a", -3.4, 2.2, 0.3], ["barrel_wood", 3.2, 3.4], ["sack", 3.8, 2.6], ["lantern_post", -2.6, -1.6, 2], ["log_bench", -4.6, -3.4, 1.3], ["crate_wood", -5.6, 1.9, 0.2], ["rockm", -7.5, -2], ["barrel_rust", 9.6, -3.6], ["tarp", -7, -7, 0.2], ["bedroll_b", -7, -7.2, 0.4]]);
group(-14, 72, 0, [["palm", 0, 0], ["palm", 3.5, 2.5, 1], ["log", 1.8, -2.2, 0.8], ["bush", -2, 1.6], ["fern", 4.5, -1]]);
group(14, 70, 0, [["palm", 0, 0, 2], ["tree", -3.6, 2.4], ["rockl", 2.6, 2.4, 0, 1.2], ["stump", -1.6, -2.4], ["bigleaf", 3.6, -1.4]]);
// the fork: three ways on (rule 9: a decision, a sign, a wreck)
group(0, 64, 0, [["signpost_key", -2.8, -1.6, 0.6], ["signpost_raft", 2.6, -2.4, -0.4], ["lantern_post", 2.9, 1.9, 1], ["log_bench", -3.4, 2.4, 0.3], ["rockm", 4.5, 3.5]]);
group(-18, 66, 0.2, [["crate_wood_b", 0, 0, 0.4], ["barrel_wood", 1.3, 0.5], ["barrel_wood", 1.9, -0.6], ["sack_pile", -2.3, 0.9, 1], ["log", -0.6, 2.2, 0.2], ["stump", 2.8, 1.9]]); // a looted cart's load
// (the overgrown middle road's logs gave way to the foreman's loading yard, G1.5: see the Old Plantation)

// ---------------------------------------------------------------- Lookout Bend (a bandit lookout over the west trail)
group(-38, 60, 0, [["campfire", 0, 0], ["log_bench", -2.2, 0.8, 1.2], ["log_bench_b", 1.4, 2.2, 0.2], ["tent_b", -3.5, -4.2, 0.4], ["barrel_wood", 3.4, -2.6], ["sack", 2.8, -3.4], ["signpost_key", 5.5, 3.5, -0.6], ["lantern_post", -5, 2.5, 2.4], ["rockl", 6, -4.5, 0, 1.3], ["bedroll_a", -1.4, -2.2, 0.4]]);
ridge([[-44, 66], [-34, 70], [-24, 70]], 1.7);
group(-50, 50, 0, [["log", -2.2, 1.6, 0.9], ["rockl", 3.4, 2.6, 0, 1.4], ["rockl", -4, -2.6, 0, 1.2], ["stump", 1.2, -2.4], ["fern", 0, 3.4]]); // the choke before the camp gate

// ---------------------------------------------------------------- Peel Gang Camp (palisade compound; the key crate is up the watchtower)
enclosure("palisade", -78, 12, -46, 40, [
  { side: "s", at: -60, w: 3.2, gate: true }, { side: "n", at: -64, w: 3.2, gate: true },
  { side: "e", at: 25.75, w: 7.5, breakId: "palisade", hp: 6, persist: true, reveals: "Shortcut: camp ↔ plantation" },
]);
put("watchtower", -73, 17, 0.25, 1, undefined, "watchtower");
put("well", -52, 22, 0.3, 1, undefined, "camp-well");
put("campfire", -62, 27, 0, 1, undefined, "campfire");
group(-62, 27, 0, [["log_bench", -2.3, 0.7, 1.25], ["log_bench_b", 1.3, 2.3, 0.15], ["log_bench_b", 1.9, -1.6, -0.9], ["lantern", -1.9, 1.9], ["bedroll_a", -3.6, -1.6, 0.6], ["satchel", -0.9, 3.6, 0.7]]);
group(-60, 22, 0, [["stump", -2.4, 0.6], ["barrel_wood", 3.2, -1.4], ["barrel_teal", 4.1, -0.8], ["sack_pile", -4.4, -2.2, 0.6], ["log", 1.4, -3.4, 0.4], ["crate_wood_b", -5.6, 1.4, 0.3], ["lantern", 0.6, 1.6], ["bedroll_b", 4.6, 2.4, 1.2]]); // the yard between the fire and the north gate
put("tent_a", -71, 26, 0.5); put("tent_b", -66.5, 16.5, 0.35); put("tent_b", -55.5, 16, -0.3);
group(-52, 34, -0.4, [["tarp", 0, 0], ["bedroll_b", -0.3, -0.3, 0.4], ["crate_wood_b", 1.4, -1.0, 0.3], ["lantern_post", -3.2, 2.2, 0.4]]);
group(-56, 30, 0, [["crate_green", 1.7, -0.8, -0.25], ["barrel_wood", 0.4, 1.6], ["barrel_rust", 1.4, 1.3], ["sack_pile", 2.8, 1.4, 0.4], ["ammo_box", -0.8, 1.6, 0.5], ["sack", 0.7, -1.7, 1]]);
group(-66, 35, 0, [["lemon_stand", 0, 0, 0.3], ["barrel_teal", 2.2, 0.8], ["sack", -1.4, 0.9], ["banana_stash", -3, -0.6, 0.2]]);
group(-70, 21, 0, [["banana_stash", 1.2, 2.4, 0.2], ["barrel_wood", -5.5, 1.4], ["sack_pile", -5, 6.5, 1.2], ["lantern_post", 4.6, -2.6, 2.2], ["barrel_rust", -6, -6.4]]);
group(-49, 15, 0, [["barrel_wood", 0, 0], ["barrel_wood", 1, 0.8], ["sack_pile", -2.4, 0.6, 0.3], ["lantern_post", 0.8, 3.5, 3]]);
group(-60, 43, 0, [["signpost_a", 3.2, 1.6, 0.3], ["barrel_wood", -3, 0.6], ["rockm", 4.5, 3], ["log", -4.8, 2.6, 0.5]]);
// G1 council fix round 1: the camp read as equipment spaced out on clean sand. It is lived in now: a sandbag post
// covering the south gate with a decoy sentry behind it, the gang's washing strung by the stores, a lean-to bunk, crates
// stacked where they were unloaded, a second decoy propped by the fire.
group(-57.0, 38.0, 0.2, [["sandbags", 0, 0], ["dummy_seated", 0.4, -1.3, -0.2], ["barrel_wood", 2.2, -1.1], ["ammo_box", -1.2, -1.0, 0.4]]);
put("sandbags", -63.9, 38.9, -0.12);
put("washing_line", -57.2, 34.2, 0.25);
put("lean_to", -67.6, 30.9, 0.35);
group(-67.6, 30.9, 0.35, [["lantern", 2.3, 1.9], ["sack", -2.3, 1.6, 0.4], ["barrel_teal", 2.6, -0.6]]);
put("crate_stack", -47.8, 32.6, 0.3); put("crate_stack", -74.2, 37.0, -0.25);
put("dummy_seated", -62.7, 24.3, 0.1);
group(-69.4, 20.4, 0, [["sack_pile", 0, 0, 0.8], ["bedroll_a", 1.9, 0.9, 0.3], ["lantern", -1.4, 1.0]]);
// the shortcut track east of the breakable palisade
group(-34, 26, 0.1, [["barrel_wood", 0, 1.9], ["barrel_rust", 1, 2.6], ["crate_wood_b", -1.4, 2.4, 0.6], ["sack", 0.4, 3.4], ["stump", -2.6, -2.2], ["rockm", 3, -2.4]]);

// ---------------------------------------------------------------- Old Plantation (farmhouse + barn, fields, tractor, the molasses vat, the zipline lookout)
enclosure("fence", -18, 3, 26, 40, [
  { side: "s", at: -2, w: 3.2, gate: true }, { side: "n", at: 0, w: 3.2, gate: true }, { side: "w", at: 24, w: 3.2, gate: true }, { side: "e", at: 12, w: 3.2, gate: true },
  { side: "s", at: 16, w: 4.5 }, { side: "w", at: 9, w: 3.5 }, // broken stretches: fences are low cover, not locks
]);
put("building:farmhouse", -6.5, 11.5, 0, 1, undefined, "farmhouse");
put("building:barn", 17.5, 24.5, -H, 1, { open: true }, "barn");
put("tractor", 6, 31, 0.4, 1, undefined, "tractor");
put("vat", -9, 31, 0, 1, undefined, "vat");
put("zip_tower", 21, 8, 0, 1, undefined, "zip-tower");
rows(-16, 22, -12, 27); rows(8, 34, 23, 38.5); rows(-16, 34.5, -4, 38.5, 2.4, 2.2);
group(2, 22, 0, [["barrel_wood", 3.5, -2.5], ["barrel_wood", 4.4, -1.8], ["sack_pile", 4.2, 0.4, 1.4], ["log_bench", -3, 3.5, 0.2], ["lantern_post", -3.2, -2.6, 1], ["crate_wood_b", 5.6, 3.2, 0.3], ["banana_stash", -4.5, 0.4, 1.2]]);
// The foreman's loading yard (G1.5 boss arena): the stretch of road between the fork and the plantation's south gate,
// where Foreman Knucklebark checks every bunch that leaves. Cover in a loose ring 6-10 u out so a throw can be broken
// (two crate stacks and the cart load are tall; the sandbags and logs are waist-high and shots pass), the road itself
// kept clear (x -2..2), the yard open to the south so you can back out toward the fork and the west trail.
group(1, 50, 0, [
  ["crate_stack", -9, -3.4, 0.25], ["crate_stack", 8.6, 3.4, -0.3], ["sandbags", -5.2, 6.4, 0.08], ["sandbags", 6.4, -5.4, -0.18],
  ["barrel_rust", 10.2, -2.6], ["barrel_wood", 11.1, -1.7], ["crate_green", -10.6, 3.4, 0.4], ["barrel_teal", -11.9, 2.1],
  ["log", 4.2, 9.2, 1.35], ["stump", 6.6, 9.8], ["log_bench", 12.6, 6.4, -0.4], ["lantern_post", 12.4, 4.6, 2.2],
  ["sack_pile", -12.8, -2.4, 0.5], ["banana_stash", -4.6, -6.6, 0.1], ["banana_stash", 4.4, -7.4, -0.2], ["signpost_a", 2.8, 10.6, 0.2],
  ["rockm", -13.6, 8.4], ["bush", -14.4, 10.2], ["banana", 15.6, 0.6], ["banana", 14.8, -4.2], ["fern", -15.2, 4.6],
]);
group(6, 31, 0, [["barrel_rust", 3, 1.6], ["sack", -2.6, 1.2], ["crate_wood", -2.8, -1.8, 0.5], ["log", 1, 3.6, 0.3]]);
group(-9, 31, 0, [["barrel_wood", 3.2, -2.4], ["barrel_wood", 3.9, -1.5], ["barrel_rust", 3.6, 3.4]]);
group(21, 8, 0, [["barrel_wood", -3, 1.5], ["sack_pile", -3.2, -1.6, 0.4], ["signpost_a", 2.6, 3, 0.2], ["crate_wood_b", 3, -2, 0.2]]);
group(-6.5, 18.5, 0, [["log_bench", -2.4, 0.4], ["barrel_teal", 3.6, 0.2], ["lantern_post", 1.6, 1.8, 1], ["sack", -4.4, 0.6]]);
group(-22, 23, 0, [["signpost_a", 0.6, -2.4, 1.2], ["banana_stash", 0.4, 2.2], ["barrel_wood", -1.2, 2.8]]);
group(38, 9, 0, [["barrel_wood", -0.6, 2.4], ["barrel_rust", 0.4, 3.2], ["lantern_post", 1.6, -2.4, 0.4], ["log_bench", -2.4, -2.6, 0.2], ["rockl", 3.6, 3.4, 0, 1.3], ["rockl", -4.4, -4.2, 0, 1.2], ["sack", 1.4, 2.4]]); // the halfway post on the colony road

// ---------------------------------------------------------------- the central ridge (north of the plantation) and the radio shack
ridge([[-44, -2], [-30, -3], [-16, -1], [-4, -2]], 2.1); ridge([[4, -2], [18, -1], [32, -3], [44, -6]], 2.1);
put("building:radio_shack", -27.5, -15.5, 0, 1, undefined, "radio");
group(-27.5, -15.5, 0, [["barrel_rust", 4.2, 0.6], ["barrel_rust", 4.4, -0.6], ["crate_wood_b", -4.4, 1.4, 0.3], ["lantern_post", 2.4, 3.6, 1], ["signpost_a", 5.5, 4, 0.6], ["sack_pile", -4.2, -1.4, 1.2], ["wall_palisade_post", -1.6, -3.4, 0, 1.5], ["rockl", -6.5, 3.5, 0, 1.2], ["log_bench_b", 0.4, 4.4, 0.1]]);
group(-2, -12, 0, [["signpost_raft", 2.6, 0.6, -0.3], ["rockm", -3.2, 1.6], ["log", 3.6, -2.4, 0.9], ["stump", -3.4, -2.2]]);
put("bridge", 0, -28, H); // a plank bridge over the dry creek
group(0, -28, 0, [["rockl", -4.2, 0.6, 0, 1.3], ["rockl", 4.4, -0.4, 0, 1.2], ["rockm", -5.6, -2.4], ["rockm", 5.8, 2.2], ["reeds", -3, 2.6], ["reeds", 3.2, -2.8], ["log", 6.5, -3, 0.4]]);
group(1, -40, 0, [["signpost_a", -2.8, 0.6, 2.6], ["rockl", 3.4, 1.4, 0, 1.3], ["stump", -3.6, -1.6], ["stump", 3, -2.6], ["log", -4.6, 2.6, 1]]); // the warning before the hollow

// ---------------------------------------------------------------- Mangrove Boardwalk (causeway over the swamp; wade off it at your own risk)
boardwalk([[30, 58], [48, 54]]); boardwalk([[48, 54], [56, 50]]); boardwalk([[56, 50], [66, 42]]); boardwalk([[66, 42], [68, 32]]); boardwalk([[48, 54], [44, 64]]); boardwalk([[44, 64], [46, 70]]);
put("boardwalk_ramp", 27.4, 58.6, 0.22, 1, { deck: true }); put("boardwalk_ramp", 68, 29.4, H, 1, { deck: true });
for (const [x, z, s] of [[38, 62, 1.1], [36, 50, 1], [44, 48, 1.2], [54, 58, 1.1], [60, 54, 1], [52, 44, 1.1], [62, 46, 0.9], [72, 46, 1.2], [62, 36, 1], [74, 36, 1.1], [40, 70, 1.2], [52, 68, 1], [50, 74, 1.1], [80, 56, 1.2], [70, 62, 1], [84, 44, 1.1], [34, 66, 1], [60, 68, 1.2], [88, 64, 1], [78, 70, 1.1], [66, 74, 1]]) put("mangrove", x + rr(-0.6, 0.6), z + rr(-0.6, 0.6), rr(0, 6.28), s);
group(48, 54, 0, [["barrel_teal", 1.5, -2.0], ["sack", -1.6, -1.9], ["lantern_post", 2.2, 1.9, 2]]);
group(46, 70, 0, [["barrel_wood", 1.3, 1.2], ["crate_wood_b", -1.4, 1.5, 0.3], ["lantern_post", 1.6, -1.4, 1]]);
group(66, 42, 0, [["barrel_rust", 1.9, 1.4], ["sack_pile", -2.2, -1.2, 0.5]]);
group(68, 24, 0, [["signpost_a", 2.6, 1.4, 0.2], ["rockm", -3, 0.6], ["log", 3.4, -2.6, 1.2], ["barrel_wood", -2.6, -2.4]]);

// ---------------------------------------------------------------- Penal Colony (stone compound, the cellblock, the cracked wall, the vine door)
enclosure("stone", 50, -22, 86, 14, [
  { side: "s", at: 68, w: 4.4, posts: "pillar_a" }, { side: "w", at: 2, w: 4.4, posts: "pillar_b" },
  { side: "n", at: 71, w: 4.0, posts: "pillar_b" }, { side: "n", at: 80, w: 5.2 }, // the vine door stands in the north wall
  { side: "e", at: 4, w: 5.0 }, // the east wall has fallen in: rubble you can climb round, and a view of the swamp
]);
put("building:cellblock", 66.5, -7.5, 0, 1, { open: ["block_door", "cell2"] }, "cellblock");
put("vine_door", 80, -22, 0, 1, undefined, "vine-door");
put("vault", 81.2, -27.4, 0, 1, undefined, "vault");
put("fusebox", 84.2, -21, -0.4, 1, undefined, "fusebox");
for (let i = 0; i < 4; i++) for (let k = 0; k < 2; k++) put(`ruin_floor_${"abc"[(i + k) % 3]}`, 60 + i * 4.1, 2.4 + k * 4.1, (i + k) % 2 ? H : 0);
group(68, 6, 0, [["pillar_a", -9.6, -3.4], ["pillar_b", -3.2, -3.8], ["pillar_c", 3.4, -3.6, 0.2], ["pillar_a", 9.8, -3.2], ["pillar_b", -9.8, 5.4], ["pillar_a", 9.6, 5.2], ["rubble_pile", 5.6, 1.4, 0.6], ["barrel_wood", -6.0, 3.4], ["crate_wood_b", -5.2, 1.9, 0.3], ["ruin_wall_broken", -13, 4.6, H], ["rubble_pile", -11.5, -1.6], ["lantern_post", 2.6, 6.2, 1], ["barrel_rust", 12.6, 2.4], ["sack_pile", 13.2, -2.6, 1.2]]);
put("ruin_arch", 68, 14.2, 0); put("ruin_steps", 68, 16.2, Math.PI);
group(86, 4, 0, [["rubble_pile_rock", -0.6, -1.6], ["rubble_pile", 0.4, 1.4, 1], ["rubble_pile_rock", 1.2, -0.2, 2], ["rockl", 2.6, 3.6, 0, 1.2], ["pillar_c", -2.4, 2.6, 1.9]]);
group(53, -16, 0, [["rubble_pile", -1.4, -2.6], ["barrel_wood", 0.6, -3.6], ["pillar_b", 0.4, 2.6]]);
group(72, -17, 0, [["ruin_wall_broken", 2.4, 1.6, 0.3], ["crate_wood", -2.5, -2.8, 0.2], ["rubble_pile", 5, -2.6, 1], ["pillar_a", 9.5, 1.8], ["barrel_rust", 12.6, -2.2]]);
group(80, -22, 0, [["rubble_pile", -4.2, 2.2], ["lantern_post", -3.4, 1.6, 1], ["pillar_b", 3.6, 3.2]]);
// the secret shrine: a walled court behind the cellblock. The only way in is through the cracked back wall of cell 1
wall("stone", 56.5, -22, 56.5, -11.7); wall("stone", 66.5, -22, 66.5, -11.7);
put("statue", 61.5, -18.6, 0, 1, undefined, "statue"); put("ruin_floor_c", 61.5, -18.4, 0);
group(61.5, -17, 0, [["pillar_b", -3.6, -3.6], ["pillar_b", 3.6, -3.6], ["rubble_pile", -3.2, 3.6], ["lantern", -1.6, 0.4], ["lantern", 1.6, 0.4], ["banana_stash", 3.2, 3.4, 1], ["fern", -3.6, 0.6], ["bigleaf", 3.8, 0.2]]);
// the vault's own walls: the rock it is cut into (west side low so the camera sees in)
ridge([[75.6, -24.2], [75.2, -31.6]], 1.25);
// (two runs here, 73.7-76.4 and 83.6-86, doubled the compound's own north wall in the same place: coplanar stone, removed G1.5-12)

// ---------------------------------------------------------------- Bomber Wreck (EGG ep03) and the road from the camp
put("bomber", -66, -44, 0.3, 1, undefined, "bomber");
group(-66, -44, 0.3, [["rubble_pile_rock", -7.6, 1.2], ["rubble_pile_rock", -8.4, -1.4, 1], ["barrel_rust", 3.4, 3.2], ["barrel_rust", 5.0, 4.6], ["crate_wood_b", 2.2, -3.4, 0.4], ["sack_pile", 5.6, -3.2, 0.3], ["stump", -4.4, 5.6], ["stump", -6.4, -4.0], ["log", 9.5, 5, 0.6], ["tarp", 9, -5.5, 0.4], ["bedroll_a", 9.2, -5.6, 1], ["campfire", 6.5, -8.5], ["log_bench_b", 4.6, -9.6, 0.4], ["rockl", -10, 6, 0, 1.3], ["lantern_post", 11.5, -2.4, 2]]);
put("bomber_debris_a", -56.4, -46.2, 0.8); put("bomber_debris_b", -59.6, -51.6, 2.1); put("bomber_debris_c", -70.6, -51.4, 0.4); put("bomber_debris_a", -70.4, -38.4, 3.6); put("bomber_debris_c", -52.6, -48.8, 1.4); put("bomber_debris_b", -47.6, -51.2, 0.3);
group(-58, -40, 0, [["rubble_pile_rock", 0, 0], ["stump", 2.4, 1.6], ["stump", -1.6, 2.6], ["log", 3.6, -1.6, 0.6], ["rockm", -3.2, -1.4], ["barrel_rust", 1.2, -2.8], ["sack", -2.4, -2.6], ["rubble_pile_rock", 4.6, 2.6, 1]]); // what the bomber shed along its furrow
group(-70, -6, 0, [["tarp", 0, 0, 1.1], ["crate_wood_b", 0.4, 0.2, 0.3], ["barrel_wood", -2.6, 1.6], ["sack_pile", 2.4, -2, 0.4], ["bedroll_b", -0.6, -0.8, 1.2], ["lantern_post", 3.4, 2.4, 1], ["rockl", -4.5, -2.5, 0, 1.2]]); // a smuggler stash on the way
group(-64, -22, 0, [["log", -3.6, 0.6, 0.2], ["log", 3.4, -0.4, -0.2], ["stump", -5.2, -1.8], ["rockl", 5.6, 2, 0, 1.3], ["rockm", -6, 2.4], ["signpost_a", 2.4, 2.6, 0.5]]); // a log barricade
ridge([[-48, -30], [-40, -38], [-32, -42]], 1.8);
group(-36, -53, 0, [["stump", -2, 1.4], ["stump", 1.4, 2.2], ["stump", 3, -1.2], ["stump", -3.4, -2.2], ["log", 0.4, -3.2, 0.3], ["log", -1, 3.8, 1.2], ["sack_pile", 4.6, 1.8, 0.4], ["crate_wood_b", -4.8, 0.4, 0.2], ["barrel_wood", 5.2, -2.6]]); // the logging site

// ---------------------------------------------------------------- The Sleeper's Hollow (giant tree, the audit notice, roots into the grotto)
put("giant", -6, -66, 0, 1, undefined, "giant-tree");
put("audit", -6, -63.1, 0, 1, undefined, "audit");
put("portal_roots", -15, -68, 0.5, 1, undefined, "hollow-roots");
for (const [x, z, s] of [[-17, -50, 1.5], [-20, -60, 1.3], [16, -48, 1.4], [20, -58, 1.5], [17, -68, 1.3], [10, -72, 1.2], [-8, -74, 1.4], [8, -45, 1.2], [-9, -45, 1.3]]) put(rnd() < 0.35 ? "boulders" : "rockl", x, z, rr(0, 6.28), s);
for (const [x, z] of [[-13, -47], [13, -45], [22, -52], [21, -64], [14, -71], [-2, -74], [-21, -55], [-19, -64], [4, -48]]) put("tree", x + rr(-0.5, 0.5), z + rr(-0.5, 0.5), rr(0, 6.28), rr(1.0, 1.25));
group(2, -58, 0, [["bedroll_b", 0, 0.6, 0.3, 2.2], ["banana_stash", 3.4, 2.2, 0.5], ["barrel_wood", -4.6, 3.4], ["sack_pile", 4.2, -2.4, 1], ["stump", -3.4, -3.2], ["log", 6.5, 4.4, 0.4], ["rockm", -7, 0.4]]);

// ---------------------------------------------------------------- Waterfall Pool (walk through the falls to the nook) and the road from the colony
put("waterfall", 66, -72, 0, 1, undefined, "falls");
put("pool", 66, -63.5, 0, 1, { r: 6.4 });
ridge([[74.5, -71.5], [84, -70], [96, -69]], 2.4); ridge([[57.5, -71.5], [52.5, -73]], 2.2);
group(66, -62, 0, [["rockl", -8.5, 1.5, 0, 1.4], ["rockl", 8.8, 2.4, 0, 1.3], ["rockm", -7, 5.4], ["rockm", 6.6, 6], ["reeds", -6, -2], ["reeds", 6.4, -1.6], ["reeds", 4.6, 5.2], ["lily", -2.4, 1.6], ["lily", 2.6, -0.8], ["lily", 0.4, 3.6], ["log", -10.5, -3.5, 0.6], ["flowers", -9, 7], ["flowers", 9.5, 6.5], ["banana", 11, -2], ["bigleaf", -11, 3.5]]);
group(66, -81, 0, [["lantern", -3.4, 1.2], ["barrel_wood", 4.2, -2.4], ["sack_pile", -4, -3, 0.4], ["bedroll_a", 3, 1.6, 0.4], ["rockm", 5, 2.4], ["crystal", -5, -1.2]]);
group(69, -36, 0, [["pillar_c", -3, 0.6, 0.4], ["pillar_b", 3.2, -1.4], ["rubble_pile", 1, 2.4], ["ruin_wall_broken", -4.4, -3.2, 0.5], ["barrel_wood", 4.4, 2.6], ["stump", -5.4, 3.4]]); // a fallen colonnade
group(36, -61, 0, [["mushroom", -2.4, 1.4, 0, 1.6], ["mushroom", 2.2, 2.4, 0, 1.4], ["mushroom", 0.4, -2.8, 0, 1.8], ["rockl", -4.4, -2, 0, 1.3], ["log", 3.8, -1.6, 0.6], ["stump", -3.4, 3.4], ["flowers", 4.6, 3.4]]); // the mushroom ring

// ---------------------------------------------------------------- the north ridge, the river checkpoint, Raft Landing (boathouse + dock)
ridge([[-60, -84], [-44, -82], [-28, -84], [-12, -82], [1, -84]], 2.2); ridge([[17.4, -84.6], [28, -82], [40, -84], [50, -86]], 2.2); // starts clear of the north hut (its first boulder stood in the hut corner)
fence(2.4, -84.5, 6.4, -84.5); put("gate", 8, -84.5, 0, 1, { open: true }); fence(9.6, -84.5, 15, -84.5);
put("building:guard_hut", 13.5, -88.5, -H, 1, undefined, "hut-north");
group(8, -86, 0, [["signpost_raft", -3.6, 3.4, 0.2], ["barrel_wood", 2.6, 3.6], ["lantern_post", -2.8, -2.2, 2], ["sack_pile", -4.4, -3.6, 0.4], ["log_bench", 3.4, -5.6, 0.3], ["barrel_rust", -5.6, -2.2]]);
put("building:boathouse", -6.5, -110.5, Math.PI, 1, { open: true }, "boathouse");
// The landing: a pier on piles over the river. Sections are 4 u; the deck rides PIER_Y above the water line, a ramp
// brings it down to the sand. The west arm broke off years ago: one section hangs on, its piles march on into the bay.
const DOCK = { y: PIER_Y - 0.1 };
put("boardwalk_ramp", 17, -102.3, -H, 1, DOCK);
put("dock_a", 17, -105.6, H, 1, DOCK); put("dock_b", 17, -109.6, H, 1, DOCK); put("dock_a", 17, -113.6, H, 1, DOCK);
put("dock_broken", 13.55, -108, Math.PI, 1, DOCK);
put("dock_piles", 9.2, -108.1, 0.1, 1, DOCK); put("dock_piles", 5.4, -108.5, -0.25, 1, DOCK);
put("raft", 17, -118.1, 0, 1, { y: -0.34 }, "raft");
group(17, -102, 0, [["barrel_teal", 3.0, 0.3], ["barrel_teal", 3.8, -0.6], ["barrel_rust", 3.4, 1.3], ["sack_pile", -3.4, 0.5, 0.4], ["lantern_post", 2.4, -2.5, 1], ["crate_stack", -2.8, 3.6, 0.5], ["signpost_raft", -2.3, 1.9, 0.3], ["log_bench", 5.6, 2.4, 0.3], ["sandbags", 6.0, -0.8, 0.5]]);
// what the river leaves on the high-water line (the wrack line the ground shader paints runs through these)
for (const [x, z, yaw] of [[5.6, -104.6, 0.4], [9.4, -105.0, 2.1], [12.6, -105.1, 1.2], [21.6, -103.9, 0.2], [25.2, -104.2, 2.6], [28.8, -104.6, 0.9], [33.5, -105.6, 1.7], [38.5, -107.3, 0.3]]) group(x, z, yaw, [["driftwood", 0, 0, 0, rr(1.0, 1.4)], ["shells", 0.9, 0.3], ["pebbles", -0.8, 0.4], ["rocks", 0.3, -0.7, rr(0, 6), rr(0.8, 1.2)]]);
group(7.6, -103.4, 0, [["rockm", 0, 0, 0.4, 1.1], ["beachgrass", 1.6, 1.2], ["rockl", -3.4, 0.9, 1, 1.1], ["beachgrass", -2.0, 2.2, 2]]);
group(26, -102, 0, [["palmlean", 0, 0, 3.4], ["rockm", 2.4, 0.6], ["beachgrass", -1.6, 1.4], ["crate_wood_b", 3.6, -1.2, 0.4], ["barrel_wood", 4.5, -0.4]]);
group(-6.5, -104.5, 0, [["barrel_wood", 5.6, 0.4], ["barrel_rust", 6.2, 1.4], ["driftwood", -7, -2, 1, 1.4], ["log_bench", 0, -1.6, 0.1], ["lantern_post", -5.2, -1.2, 1], ["sack_pile", -7, 2.4, 1.3], ["palmlean", 8.6, 1.2, 2]]);
group(36, -100, 0, [["palm", 0, 0], ["rockl", 3.4, 2.4, 0, 1.3], ["driftwood", -2.6, -3.4, 0.3, 1.3], ["beachgrass", 2, -2], ["barrel_wood", -3.2, 1.6], ["shells", 0.6, 3.4]]);
group(-30, -103, 0, [["palmlean", 0, 0, 1], ["driftwood", 3, -2, 1.2, 1.3], ["rockm", -3, 1.6], ["beachgrass", 2.4, 2.6], ["crate_wood_b", -1.6, -2.6, 0.5], ["barrel_wood", -2.8, -1.6]]);
group(-56, -98, 0, [["rockl", 0, 0, 0, 1.4], ["rockl", 3.4, -2.6, 0, 1.2], ["palm", -3.6, 2.6], ["driftwood", 2.4, 3.4, 0.6], ["beachgrass", -2, -3]]);
group(-74, -74, 0, [["log", 0, 0, 0.3], ["rockl", 3.6, 2.4, 0, 1.3], ["stump", -2.6, -2.4], ["fern", 2, -3], ["signpost_a", -3, 2.6, 0.4]]); // the west path's marker

// ---------------------------------------------------------------- the grotto (underground): mouth, smugglers' hall, root chamber, the tunnel out
put("portal_cave_dark", 141.5, 63, H, 1, undefined, "cove-cave-back");
put("portal_roots", 150, -31.4, 0, 1, undefined, "hollow-roots-back");
breakable("grotto-rubble", "rock", 184.6, 32.4, 180.6, 37.2, 10, true, "The Smuggler Tunnel: a new way home");
group(150, 62, 0, [["crate_wood_b", 5.2, -3.6, 0.4], ["barrel_wood", 6.2, 2.4], ["lantern", 3.4, 3.6], ["stalagmite", -2.4, -5.2, 0, 1.2], ["mushroom", 1.6, 5.4], ["crystal", -4.4, 4.6], ["sack", 4.6, -1.4]]);
group(168, 26, 0, [["tarp", -6.5, -4.5, 0.4], ["bedroll_a", -6.4, -4.8, 0.6], ["barrel_rust", 6.4, -5.6], ["barrel_wood", 7.4, -4.6], ["crate_green", 5.2, 5.4, 0.3], ["sack_pile", -7.5, 4.4, 0.4], ["campfire", -1.6, 1.4], ["log_bench_b", -3.6, 2.6, 1.2], ["lantern_post", 8.4, 1.4, 2], ["stalagmite", 2.4, -7.4, 0, 1.3], ["stalagmite", -10.5, -1.4], ["crystal", 9.6, 6.4], ["banana_stash", 0.6, -4.4, 0.4], ["caverock", -9.5, 6.5, 0, 1.2]]);
group(154, -24, 0, [["roots", -4.4, -5.4], ["roots", 5.2, -4.6, 2], ["roots", 6.4, 3.2, 4], ["mushroom", -5.6, 3.4, 0, 1.4], ["mushroom", 2.4, 5.6], ["crystal", -6.4, -1.2], ["barrel_wood", 4.4, 5.2], ["sack_pile", -3, 5.6, 0.4], ["stalagmite", 7.6, -1.2]]);
group(192, 44, 0, [["barrel_wood", -3.4, 2.4], ["lantern", 2.4, -2.6], ["crate_wood_b", -2.6, -2.8, 0.4], ["crystal", 3.6, 2.4]]);
for (const [x, z] of [[155.6, 50], [160.4, 40], [162.6, 8], [157.4, -6]]) group(x, z, rr(0, 6), [["stalagmite", 1.7, 0.4, 0, rr(0.8, 1.2)], ["mushroom", -1.6, -0.6, 0, rr(0.9, 1.5)], ["crystal", -1.9, 1.2]]);

// ================================================================ G1.5 demo slice (row 13)
// Moo: "make a very polished first area and lock the routes to the next". The demo runs from Exile Beach to the Old
// Plantation (with the Mangrove Boardwalk between them, which is open swamp: walling it off would take 150 u of made-up
// barrier across open ground, while the colony's own walls already make a border). Everything north of the line below
// stays in the data; ?north opens it again for development. The line, west to east: a rock ridge from the cliff to the
// camp, the Peel Gang barricade in the camp's north gate, a ridge from the camp to the central ridge, the rockslide in the
// central ridge's gap (the north road), the central ridge, a rockfall in the colony's west gate (the farm road), the
// colony's south wall with the collapsed boardwalk and its fallen arch, and a ridge from the colony to the east cliff.
// The grotto's two ways in (the cove cave and the camp well) are shut too. Duckov closes its routes the same way: a
// visible, solid thing in the world plus a mark on the map (POLISH_FINDINGS 5); the pieces and the names are ours.
export const DEMO = !(typeof location !== "undefined" && /[?&]north\b/.test(location.search));
/** inside the demo slice (x, z). The grotto and everything north of the line above is out. Used to park sockets and spawns */
export function inDemo(x: number, z: number) {
  if (!DEMO) return true;
  if (x > UNDER_X) return false;
  return x < -46 ? z > 12.5 : x <= 50 ? z > (x > 44 ? -8 : -3) : z > 14.6;
}
/** a "route closed" record for the map (the lead's M map draws these; see ROUTE_LOCKS below) */
export type RouteLock = { id: string; kind: "barricade" | "rockslide" | "bridge" | "cave-in"; label: string; note: string; x: number; z: number; under?: boolean;
  /** a point on the demo side and one just past it: the lint checks the first is reachable and the second is not */
  inside: Pt; beyond: Pt };
export const ROUTE_LOCKS: RouteLock[] = DEMO ? [
  { id: "camp-north", kind: "barricade", label: "Peel Gang barricade", note: "The gang nailed their north gate shut. The road to the bomber and the radio shack is closed.", x: -64, z: 11.2, inside: [-64, 15], beyond: [-64, 7] },
  { id: "north-road", kind: "rockslide", label: "Rockslide", note: "The ridge came down across the north road. The way to the hollow and the river is closed.", x: 0, z: -2.4, inside: [0, 1.6], beyond: [0, -7] },
  { id: "colony-road", kind: "rockslide", label: "Rockfall at the colony gate", note: "Boulders off the ridge fill the colony's west gate.", x: 48.6, z: 2, inside: [44, 4.5], beyond: [53, 2] },
  { id: "colony-boardwalk", kind: "bridge", label: "Collapsed boardwalk", note: "The boardwalk's last span fell into the swamp and the colony arch came down behind it.", x: 68, z: 22, inside: [66, 38], beyond: [68, 10] },
  { id: "cove-cave", kind: "cave-in", label: "Cave-in", note: "The smugglers' cave has fallen in. The grotto is closed.", x: -95.6, z: 91, inside: [-92.6, 91.6], beyond: [145, 63] },
] : [];
/** points just past every sealing line: the lint checks a monkey can't reach any of them (grid.ts exactReach) */
export const SEAL_PROBES: Pt[] = [];
/** the cove boat: the second way home inside the slice (a smuggler's rowboat at the cove's waterline) */
export const COVE_BOAT = { x: -90, z: 104.5, boat: { x: -92.6, z: 108.8, yaw: 0.62 } };
if (DEMO) {
  // a separate stream so the slice never shifts the look of anything authored above
  let ls = 151103; const lr = () => (ls = (ls * 16807) % 2147483647) / 2147483647, lrr = (a: number, b: number) => a + lr() * (b - a);
  /** boulders and big rocks shoulder to shoulder, overlapping enough that a monkey can't squeeze between (radius 0.45) */
  const seal = (pts: Pt[], s = 1.9, step = 1.25) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / (step * s)));
      // lint probes 5 u past the line (its left side walking from the first point: the polylines run with the slice on the right)
      for (let t = 0; t <= len; t += 1.5) SEAL_PROBES.push([ax + ((bx - ax) * t) / len + ((bz - az) / len) * 5, az + ((bz - az) * t) / len - ((bx - ax) / len) * 5]);
      for (let k = 0; k <= n; k++) {
        if (k === n && i < pts.length - 2) continue;
        const t = k / n, big = lr() < 0.35;
        put(big ? "boulders" : "rockl", ax + (bx - ax) * t + lrr(-0.25, 0.25), az + (bz - az) * t + lrr(-0.25, 0.25), lrr(0, 6.28), (big ? 0.8 : 1) * s * lrr(0.95, 1.12));
        if (lr() < 0.45) put(lr() < 0.5 ? "bush" : "fern", ax + (bx - ax) * t + lrr(-2.2, 2.2), az + (bz - az) * t + lrr(1.2, 2.6), lrr(0, 6.28), lrr(0.9, 1.3));
      }
    }
  };
  // ---- west: the cliff to the camp's north-west corner, the camp's north-east corner to the central ridge
  seal([[-101.8, 10.6], [-90, 11.4], [-80.6, 12.0]], 1.9); // ends clear of the camp corner: the plugs close the last metre
  seal([[-44.4, 10.4], [-44.6, 4.8], [-44.2, -1.4]], 1.7); // clear of the palisade corner (rock in a wall reads as a glitch)
  // ---- the Peel Gang barricade: the north gate shut, sandbags behind it, the gang's junk piled outside, a painted sign
  { const g = P.find((p) => p.k === "gate" && Math.abs(p.x + 64) < 0.1 && Math.abs(p.z - 12) < 0.1); if (g) g.o = { ...(g.o ?? {}), open: false }; }
  put("sandbags", -64, 12.78, 0);
  group(-64, 10.6, 0, [["crate_stack", -1.4, -0.3, 0.12], ["barrel_rust", 1.6, -0.1], ["barrel_wood", 2.3, -0.9], ["log", 0.4, -1.9, 0.18], ["wall_palisade_post", -3.2, -0.6, 0.2], ["wall_palisade_post", 3.2, 0.2, 2.1], ["signpost_a", 3.4, -1.6, 0.5], ["sack_pile", -3.4, -2.2, 0.4], ["rocks", 0.6, -3.2, 0.3, 1.2]]);
  group(-64, 15.2, 0, [["crate_wood_b", 2.4, 0.2, 0.3], ["lantern", -2.2, 0.3]]);
  // ---- the rockslide in the central ridge's gap: the north road ends in a slope of fresh rock and a buried signpost
  seal([[-4.6, -2.6], [-1.6, -3.4], [1.4, -3.0], [4.4, -2.2]], 2.0, 1.05);
  group(0, -2.4, 0, [["rockm", -1.9, 2.2, 0.4, 1.2], ["rockm", 1.7, 2.5, 2.2, 1.1], ["rocks", -2.4, 3.6, 0.2, 1.3], ["rocks", 2.2, 3.9, 1.6, 1.1], ["rocks", 0.4, 4.6, 3.1, 1.2], ["rockm", 3.6, 2.8, 0.6], ["log", -3.2, 2.9, 0.7], ["signpost_raft", -0.6, 4.0, 2.4]]);
  // ---- east: the central ridge's end to the colony's west wall; the rockfall in the colony's west gate
  seal([[44.8, -6.4], [46.0, -7.0], [46.8, -7.4]], 1.8); put("rockm", 48.7, -7.9, 1.1, 1.3); // the last metre to the colony wall
  seal([[53.2, 0.4], [53.2, 2.0], [53.2, 3.6]], 1.7, 1.0); // just inside the gateway, clear of its pillars and the wall
  put("rockm", 51.6, -0.9, 0.7, 1.3); put("rockm", 51.6, 4.7, 2.3, 1.3); // the corners between the pillars and the pile
  group(48, 2.2, 0, [["rockm", -1.2, -1.4, 0.6, 1.1], ["rockm", -1.4, 1.6, 2.4, 1.0], ["rocks", -2.6, 0.2, 0.4, 1.3], ["rocks", -3.6, 2.6, 1.9, 1.0], ["rockm", -2.2, -2.8, 0.2]]);
  // ---- the collapsed boardwalk: its last span and the ramp are gone; a broken section hangs into the water, the piles
  // stand on; behind it the colony's south arch has fallen into its own gateway
  { const r = ROADS.find((q) => q.id === "boardwalk")!; r.pts = r.pts.filter((q) => q[1] > 40); r.pts.push([67.4, 36.4]); } // no causeway under the missing span: it ends in the water
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; if ((p.k === "boardwalk_a" || p.k === "boardwalk_b") && p.z < 36 && p.x > 66 || p.k === "boardwalk_ramp" && p.x === 68) P.splice(i, 1); }
  put("dock_broken", 67.6, 33.8, H + 0.12, 1, { deck: true, tilt: [0.16, 0.05] }); put("dock_piles", 68.4, 31.4, H + 0.2); put("dock_piles", 67.2, 29.2, H - 0.3);
  group(68, 26, 0, [["driftwood", -1.6, 0.4, 0.9, 1.3], ["driftwood", 1.4, -1.2, 2.6, 1.2], ["reeds", -2.6, 1.6], ["reeds", 2.8, 0.8], ["rocks", 0.4, -2.4, 0.4, 1.1]]);
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; if ((p.k === "ruin_arch" || p.k === "ruin_steps") && p.x === 68) P.splice(i, 1); }
  // the fallen arch: a slab of its wall across the gateway (pillar to pillar), rubble either side
  put("ruin_wall_broken", 68, 14.0, 0, 0.95); put("rubble_pile_rock", 68.2, 12.3, 1.3, 1.15); put("rubble_pile", 67.4, 15.7, 3.3, 1.1); put("pillar_c", 69.6, 17.2, 1.2, 0.9);
  put("rocks", 66.2, 16.8, 0.8, 1.2); put("rocks", 70.6, 15.6, 2.2, 1.1);
  // ---- the colony's south-east corner to the east cliff
  seal([[88.6, 15.2], [94, 15.4], [102.8, 14.4]], 1.9);
  // ---- the cove cave has fallen in; the camp well is boarded over (the grotto's two ways in)
  group(-96.2, 91, H, [["rubble_pile_rock", -1.2, 1.2, 0.4, 1.25], ["rubble_pile_rock", 1.3, 1.1, 2.6, 1.2], ["rockm", 0.1, 2.3, 0.9, 1.1], ["rocks", -0.8, 3.2, 0.3, 1.2], ["rocks", 1.6, 3.4, 1.7, 1.0]]);
  // (the camp well's own model has boards over its shaft: the read says the gang nailed them down, props.ts)
  // ---- the cove boat: the smugglers' rowboat pulled up at the waterline, a lantern on a post, oars and a crate
  group(-88.6, 104.2, 0.62, [["lantern_post", 2.4, 1.6, 2.2], ["crate_wood_b", -2.6, 0.8, 0.4], ["barrel_wood", -3.2, -0.6], ["rocks", 2.6, -1.4, 0.4, 1.1], ["signpost_a", -2.0, 2.6, 0.9]]);
}
/** the patrol set in use: in the demo the north's enemies stay parked in the data */
export const activeSpawns = (set: number): Spawn[] => SPAWNS[set % SPAWNS.length].filter((s) => inDemo(s.x, s.z));

/** worn footpaths (ground decals, dress.ts): where feet go every day. Drawn darker and patchy on the dirt */
export const PATHS: Pt[][] = [
  [[-60, 39.6], [-60.6, 34], [-61.4, 29.6]], [[-62.6, 25.2], [-63.6, 20], [-64, 13]],          // gate to fire to gate
  [[-64.6, 26.6], [-68.4, 27.6]], [[-66.2, 18.6], [-63.4, 24.6]], [[-55.8, 18.2], [-60.4, 25.2]],  // tent mouths to the fire
  [[-60.2, 26.4], [-55.4, 24], [-53.4, 23]], [[-60.6, 28.8], [-55, 31.4], [-53, 32.8]],          // to the well, to the stores
  [[-63.6, 28.4], [-66.2, 30.6]], [[-63.2, 24.8], [-69.6, 19.2], [-71.6, 18.2]],                // to the lean-to, to the tower
  [[10, -98], [13.4, -100.4], [16.6, -101.4]], [[8, -102], [12.6, -102.4], [15.8, -102.2]],       // down to the dock
  [[-64, -42], [-60.6, -46.4], [-57, -47.8]],                                                  // round the wreck
  // G1.5 row 09, the demo slice: where feet and wheels go at the checkpoint, the plantation, the foreman's yard, the cove
  [[4.2, 77.6], [1.6, 79.4], [-0.6, 80.2]], [[-6.6, 73.4], [-4.2, 76.8], [-1.6, 79.6]],         // hut door and bunk to the gate
  [[-5.2, 17.2], [0.4, 19.8], [6.4, 22.6], [12.8, 24.2]], [[-6.2, 29.4], [-2.2, 29.8], [0.4, 28.6]], // porch to barn, vat to the yard
  [[5.2, 29.6], [2.6, 26.4], [1.6, 22.6]], [[19.2, 20.4], [22.4, 15.6], [25.2, 12.4]],            // tractor to the yard, barn to the east gate
  [[-1.3, 41.6], [-1.6, 47.6], [-1.1, 53.6], [-0.6, 59.8]], [[1.3, 41.8], [1.0, 47.8], [1.5, 53.8], [2.0, 59.6]], // cart ruts through the foreman's yard
  [[-80.6, 97.2], [-84.4, 100.6], [-88.6, 103.6]],                                             // the smugglers' path to their boat
];
P.forEach(pinVariant); // multi-rock and leaning nature pieces get a fixed variant (colliders.ts)
/** the demo's border, west to east, as one line that must be closed: the west seal, the camp's north wall (its gate is
 *  the barricade), the north-east seal, the central ridge with the rockslide in its gap, the ridge end to the colony, the
 *  colony's west and south walls (the rockfall and the fallen arch in their gates), the east seal. Ridges authored for
 *  looks had gaps a monkey fits through; seal.ts finds them and plugs them with more rock */
export const DEMO_BORDER: Pt[] = [[-103.5, 10.5], [-90, 11.4], [-78.6, 12.2], [-78, 12], [-46, 12], [-45, 5.5], [-44.2, -1.4], [-44, -2], [-30, -3], [-16, -1], [-4.6, -2.4], [-1.6, -3.4], [1.4, -3.0], [4.4, -2.2], [18, -1], [32, -3], [44, -6], [47.4, -7.4], [50, -8], [50, -0.6], [53, -0.6], [53, 4.4], [50, 4.4], [50, 14], [86, 14], [94, 15.4], [103.5, 14.4]];
export const BORDER_PLUGS: Placed[] = DEMO ? (() => { let ps = 902011; return plugGaps(P, [DEMO_BORDER], OVER, () => (ps = (ps * 16807) % 2147483647) / 2147483647); })() : [];
P.push(...BORDER_PLUGS);
export const PLACED: Placed[] = P;
export const WALLS: Wall[] = WALLS_;

// ================================================================ gameplay sockets
const placedById = (id: string) => { const p = P.find((q) => q.id === id); if (!p) throw new Error(`grove: no placed piece "${id}"`); return p; };
/** a point in a placed piece's local space, in world coordinates */
const at = (id: string, lx: number, lz: number) => { const [x, z] = toWorld(placedById(id), lx, lz); return { x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100 }; };

/** the vine door: shut until the Vine Key has been extracted once (then the vault opens from raid 2) */
export const DOOR = { x: 80, z: -22, yaw: 0, w: 3.4 };
/** sub-level entrances (fade + move): a = where you stand outside, b = where you arrive. The well is a one-way drop */
export const PORTALS: Portal[] = [
  { id: "cove-cave", a: { x: -93.6, z: 91 }, b: { x: 145, z: 63 }, label: "Enter the grotto" },
  { id: "camp-well", a: { x: -52.6, z: 24.2 }, b: { x: 170, z: 22 }, label: "Jump down the well", oneWay: true },
  { id: "hollow-roots", a: { x: -13.4, z: -65.2 }, b: { x: 150, z: -28 }, label: "Climb into the roots" },
];
/** one-way zipline from the plantation lookout down to the beach: a fast way home from the middle of the map */
export const ZIPLINES = [{ id: "lookout", from: { x: 21, z: 8, h: 6 }, to: { x: 20, z: 99, h: 1.2 } }];
export const POI = {
  hatch: { x: -8, z: 102 }, coveBoat: { x: -90, z: 104.5 }, boss: { x: 1, z: 48.5 }, raft: { x: 17, z: -113.4 }, tunnelExit: { x: 193.5, z: 44.5 },
  campfire: { x: -62, z: 27 }, watchtower: { x: -73, z: 17 }, ruinCenter: { x: 68, z: 4 }, raftSign: { x: 0.6, z: -11.4 },
  sleeperBed: { x: 2, z: -57.4 }, giantTree: { x: -6, z: -66 }, vat: { x: -9, z: 31 }, plane: { x: -66, z: -44 }, falls: { x: 66, z: -72 },
};
/** landmarks: unique set pieces (and where the easter eggs live, LORE.md) */
export const LANDMARKS = [
  { id: "ferry", x: 64, z: 101, note: "the wrecked prison ferry that brought the Businessman (Act 1: Exile)" },
  { id: "bottle", x: -34, z: 108.5, note: "message in a bottle: a readable note from the last exile" },
  { id: "watchtower", x: -73, z: 17, note: "bandit lookout; the key crate sits on its platform" },
  { id: "lemon", x: -66, z: 35, note: "EGG ep02: a bandit with lemon juice on his face who thinks you can't see him" },
  { id: "vat", x: -9, z: 31, note: "EGG ep01: a burst molasses vat; the sticky puddle slows everyone" },
  { id: "tractor", x: 6, z: 31, note: "a rusted plantation tractor (cover)" },
  { id: "bomber", x: -66, z: -44, note: "EGG ep03: a crashed bomber, bullet holes only on the wings (survivorship bias)" },
  { id: "fusebox", x: 84.2, z: -21, note: "EGG ep04: the vault's fuse box, wired backwards: PULL TO OPEN closes it" },
  { id: "statue", x: 61.5, z: -18.6, note: "secret shrine: a golden statue of a monkey in a bowler, plaque 'IN BANANAS WE TRUST'" },
  { id: "audit", x: -6, z: -63, note: "a NOTICE OF AUDIT nailed to the giant tree (foreshadows the ending gag)" },
  { id: "falls", x: 66, z: -72, note: "a waterfall you can walk through to a hidden nook" },
];
/** Generic crate sockets: the fixed ones (key, vault, Sleeper, shrine, radio) and the north's tiered crates. The demo
 *  slice's own loot is in CONTAINER_SOCKETS (typed, G1.5-27); loot/sockets.ts picks per raid from both.
 *  Tiers rise with distance from the hatch and behind contested doors. */
export const CRATES: CrateSocket[] = [
  // (G1.5-27: the slice's generic sockets in the ferry, the cove, the lookout, the camp, the plantation and the mangrove
  // became typed containers, CONTAINER_SOCKETS below.) Peel Gang camp: the key is up the tower, far from both gates
  { ...at("watchtower", 0.2, 0.25), tier: "gold", fixed: "key", y: 3.07 },
  // Penal Colony: the yard, the locked evidence cell, the back yard; the vault and the shrine are gated
  { x: 59.4, z: 9.4, tier: "wood" }, { ...at("cellblock", 5.4, 2.8), tier: "gold", in: "cellblock" }, { x: 79, z: 9, tier: "wood" },
  { x: 82.2, z: -28.4, tier: "gold", fixed: "vault", y: 0.44 }, { x: 64.2, z: -19.6, tier: "gold", fixed: "secret" },
  // the radio shack, the stash on the camp's north road, the bomber
  { ...at("radio", 0.3, 0.2), tier: "green", fixed: "radio", in: "radio" }, { x: -72, z: -8.7, tier: "wood" } /* sockets nudged 0.5-0.9 u clear of the next collider (G1.5-12): an outdoor crate turns at random */, { x: -59.6, z: -50.3, tier: "green" }, { x: -73.5, z: -39, tier: "wood" },
  // the hollow: the Sleeper's own chest and a stash at the tree's back
  { x: 8, z: -64, tier: "gold", fixed: "sleeper" }, { x: -13, z: -54, tier: "green" }, { x: -33.4, z: -55.6, tier: "wood" },
  // the falls: beside the pool, and in the nook behind the water
  { x: 55.4, z: -58.6, tier: "wood" }, { x: 68.6, z: -83, tier: "green" }, { x: 74.6, z: -40.4, tier: "wood" },
  // the river checkpoint and the landing
  { ...at("hut-north", -0.7, 0), tier: "wood", in: "hut-north" }, { ...at("boathouse", 1.1, 0.4), tier: "green", in: "boathouse" }, { x: 31.5, z: -104.5, tier: "wood" }, { x: -54.4, z: -100.6, tier: "wood" },
  // the grotto
  { x: 173.6, z: 33, tier: "gold" }, { x: 157.6, z: -27.6, tier: "gold" }, { x: 146.6, z: 67.4, tier: "wood" },
];
/** Foreman Knucklebark's encounter (ai/boss.ts, Sol's numbers): the loading yard on the road from the fork to the
 *  plantation's south gate. radius = the 30 u leash; the retreat is the way out you can always take (south to the fork,
 *  then west along the trail), and it ends outside the leash (npm run sim checks both). */
/** Typed containers (G1.5-27): Sol's five pools (loot/containers.ts CONTAINERS) placed by his rules, which follow the
 *  room: ammo tins at guard posts, food baskets in kitchens and camps, parts crates by workshops and boats, medical boxes
 *  at rest and treatment spots, weapon crates in the two secured places. Budget 8 food, 6 ammo, 8 parts, 4 medical,
 *  2 weapon (DEMO_CONTAINER_BUDGET); loot/sockets.ts spawns a type-balanced share of them each raid. Each is its own
 *  model (kit_build container(type)), so it reads before you open it. Interior ones square up with their building. */
export type ContainerSocket = { id: string; type: "weapon" | "food" | "ammo" | "parts" | "medical"; x: number; z: number; y?: number; in?: string; yaw?: number; note: string };
const cs = (id: string, type: ContainerSocket["type"], p: { x: number; z: number }, note: string, o: Partial<ContainerSocket> = {}): ContainerSocket => ({ id, type, x: p.x, z: p.z, note, ...o });
export const CONTAINER_SOCKETS: ContainerSocket[] = [
  // food: picnics, galleys, harvests, kitchens
  cs("beach-picnic", "food", { x: -44.2, z: 97.2 }, "beach picnic by the flotsam"),
  cs("ferry-galley", "food", at("ferry", -2.4, -1.8), "the ferry's galley", { in: "ferry" }),
  cs("palm-harvest", "food", { x: 10.6, z: 67.4 }, "a palm harvest under the trees"),
  cs("camp-kitchen", "food", { x: -58.6, z: 27.6 }, "the camp's kitchen fire"),
  cs("farm-kitchen", "food", at("farmhouse", 3.6, 1.7), "the farmhouse kitchen", { in: "farmhouse" }),
  cs("cove-picnic", "food", { x: -78.4, z: 100.4 }, "the smugglers' picnic"),
  cs("lookout-fire", "food", { x: -35.0, z: 61.8 }, "the lookout's cookfire"),
  cs("farm-porch", "food", { x: -1.6, z: 17.8 }, "the farmhouse porch"),
  // ammo: guard posts
  cs("ferry-locker", "ammo", at("ferry", -2.6, 1.6), "the ferry's guard locker", { in: "ferry" }),
  cs("hut-post", "ammo", { x: 11.0, z: 74.6 }, "the checkpoint guard's post"),
  cs("camp-gatepost", "ammo", { x: -54.8, z: 39.0 }, "the camp's south gate post"),
  cs("barn-sentry", "ammo", at("barn", -1.0, -2.0), "the barn sentry", { in: "barn" }),
  cs("lookout-post", "ammo", { x: -40.9, z: 57.8 }, "the bandit lookout"),
  cs("yard-tin", "ammo", { x: -7.4, z: 43.4 }, "the foreman's yard"),
  // parts: workshops, wrecks, boats, machines
  cs("beach-wreck", "parts", { x: 31.4, z: 101.2 }, "a wreck's worth of flotsam on the beach"),
  cs("ferry-engine", "parts", { x: 57.3, z: 104.6 }, "by the ferry's stern"),
  cs("hut-bench", "parts", { x: 9.0, z: 74.2 }, "the checkpoint hut's workbench, round the back"),
  cs("camp-workshop", "parts", { x: -71.4, z: 36.8 }, "the camp's workshop by the crate stacks"),
  cs("barn-parts", "parts", at("barn", 1.0, 1.2), "the barn's parts bins", { in: "barn" }),
  cs("cove-repair", "parts", { x: -84.8, z: 102.6 }, "the cove boat's repair kit"),
  cs("tractor", "parts", { x: 10.4, z: 29 }, "the rusted tractor"),
  cs("zip-tower", "parts", { x: 16.7, z: 7.5 }, "the zipline tower"),
  // medical: rest and treatment
  cs("ferry-aid", "medical", at("ferry", 2.4, 1.2), "the ferry's first aid", { in: "ferry" }),
  cs("checkpoint-bunk", "medical", { x: -4.8, z: 72.6 }, "the checkpoint's bunk"),
  cs("camp-tent", "medical", { x: -57.4, z: 22 }, "the camp's treatment tent"),
  cs("farm-bedside", "medical", at("farmhouse", -3.4, 1.4), "the farmhouse bedside", { in: "farmhouse" }),
  // weapon: the secured places
  cs("hut-rack", "weapon", { x: 10.6, z: 78.4 }, "the checkpoint's locked rack, behind the hut") /* inside, the hut is too small to stand beside it (bot softlock, G1.5 matrix) */,
  cs("barn-shelf", "weapon", at("barn", -0.6, 4.0), "the barn's secured shelf", { in: "barn" }),
];
/** portals the demo shuts (the grotto's two ways in) */
export const portalOpen = (id: string) => !DEMO || (id !== "cove-cave" && id !== "camp-well");
export const BOSS_ENCOUNTER = {
  x: 1, z: 48.5, retreat: { x: -24, z: 74 }, radius: 30,
  spawns: [
    { kind: 'brute', x: 1, z: 48.5, group: 'plantation-boss', tag: 'plantation-foreman' },
    { kind: 'wild', x: -5, z: 51.6, group: 'plantation-boss', tag: 'foreman-escort-0' },
    { kind: 'wild', x: 6.4, z: 49.2, group: 'plantation-boss', tag: 'foreman-escort-1' },
  ] satisfies Spawn[],
};
/** the map's static danger area for the boss (before he is spotted; ai/enemies.ts bossMarkers() takes over in a raid) */
export const BOSS_ARENA = { id: 'plantation-foreman', label: 'Foreman Knucklebark', kind: 'danger-area' as const, x: BOSS_ENCOUNTER.x, z: BOSS_ENCOUNTER.z, radius: BOSS_ENCOUNTER.radius };
const base: Spawn[] = [
  ...BOSS_ENCOUNTER.spawns,
  { kind: "bandit", x: -60, z: 31, group: "camp" }, { kind: "bandit", x: -66, z: 21, group: "camp" }, { kind: "bandit", x: -63.4, z: 37.2, group: "camp", tag: "lemon", carry: "radio_key" }, { kind: "bandit", x: -54, z: 27, group: "camp" },
  { kind: "brute", x: 4, z: 24 }, { kind: "sleeper", x: 2, z: -57.4 },
];
/** two patrol sets; one is picked per raid. Only enemies within 32 u simulate; at most 6 awake at once. Reward
 *  routes are contested: the colony's cells, the bomber, both ways into the raft landing (pacing report issue 2): a
 *  brute holds the river checkpoint and the landing gang stands in sight of the raft ring, so the 3 s stand-still is earned. */
export const SPAWNS: Spawn[][] = [[...base,
  { kind: "bandit", x: 0.6, z: 84.6 }, { kind: "wild", x: -9.5, z: 67.5 }, { kind: "wild", x: 12, z: 66 }, { kind: "bandit", x: -39, z: 63 },
  { kind: "wild", x: 50.5, z: 58.5 }, { kind: "wild", x: 66, z: 20 }, { kind: "bandit", x: 62, z: 6, group: "ruin" }, { kind: "bandit", x: 65.5, z: -5.4, group: "ruin" }, { kind: "bandit", x: 77.5, z: -14, group: "ruin" },
  { kind: "bandit", x: -62, z: -40, group: "plane" }, { kind: "bandit", x: -58, z: -51, group: "plane" }, { kind: "wild", x: 60, z: -56 },
  { kind: "brute", x: 8, z: -90.5, group: "landing" }, { kind: "bandit", x: -7.7, z: -111.5, group: "landing" }, { kind: "bandit", x: 24.6, z: -101.2, group: "landing" }, { kind: "bandit", x: 32.6, z: -102.2, group: "landing" }, { kind: "wild", x: 30, z: -99, group: "landing" },
  { kind: "bandit", x: 166, z: 24, group: "grotto" }, { kind: "bandit", x: 172, z: 29, group: "grotto" },
], [...base,
  { kind: "wild", x: 8, z: 70 }, { kind: "wild", x: -80, z: 95 }, { kind: "wild", x: 42, z: 58 }, { kind: "wild", x: 64, z: 46 }, { kind: "bandit", x: 16.5, z: 63.5 }, /* was 4, 50: the foreman's yard now */
  { kind: "wild", x: 72, z: 8, group: "ruin" }, { kind: "bandit", x: 69.5, z: -5.4, group: "ruin" }, { kind: "bandit", x: 76, z: -15, group: "ruin" },
  { kind: "bandit", x: -24, z: -11 }, { kind: "wild", x: -60, z: -16.5 }, { kind: "bandit", x: -70, z: -48, group: "plane" }, { kind: "wild", x: -56, z: -40 },
  { kind: "wild", x: 36, z: -58 }, { kind: "brute", x: 8, z: -90, group: "landing" }, { kind: "bandit", x: 24.2, z: -100.8, group: "landing" }, { kind: "bandit", x: 33, z: -102.6, group: "landing" }, { kind: "bandit", x: -7.7, z: -111.5, group: "landing" }, { kind: "wild", x: -40, z: -101 }, { kind: "wild", x: 33, z: -100, group: "landing" },
  { kind: "bandit", x: 165, z: 32, group: "grotto" }, { kind: "wild", x: 153, z: -21 },
]];
/** allies share an alert only inside their group's ring (CODE_FINDINGS rule 11) */
export const GROUP_RINGS: Record<string, { x: number; z: number; r: number }> = {
  'plantation-boss': { x: BOSS_ENCOUNTER.x, z: BOSS_ENCOUNTER.z, r: BOSS_ENCOUNTER.radius },
  camp: { x: -62, z: 26, r: 19 }, plane: { x: -64, z: -45, r: 14 }, grotto: { x: 168, z: 26, r: 14 }, ruin: { x: 68, z: -4, r: 20 }, landing: { x: 8, z: -98, r: 26 },
};
/** dynamic event: a bandit supply balloon crash-lands one gold crate (with red smoke) 90-150 s into a raid */
export const SUPPLY_DROPS_ALL = [{ x: 12, z: 16, area: "plantation" }, { x: -54, z: -54, area: "planecrash" }, { x: 76, z: -58, area: "waterfall" }, { x: -76, z: 102, area: "cove" }];
export const SUPPLY_DROPS = SUPPLY_DROPS_ALL.filter((d) => inDemo(d.x, d.z));
/** where the player starts a raid (just outside the hatch ring) */
export const START = { x: -5.5, z: 97.4 };
