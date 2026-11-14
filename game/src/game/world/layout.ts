// Banana Grove, the G1 raid map, authored as shapes (clearings + trails) instead of tiles so the jungle reads organic.
// x = east, z = south (toward the camera). The beach and bunker hatch are south; the raft is far north.
// Shape (advisor G1 review items 20-24): hatch → palm edge → fork; west = bandit camp, east = the ruin (vine door,
// vault); both rejoin at the brute clearing (the push-your-luck point: raft sign, the Sleeper audible), then the
// Sleeper's hollow and the river raft. A hatch run is a loop that never retraces cleared ground.
// Time budget (human): hatch loop 2.5-3.5 min, raft run 5-6.5 min; bot gate = those / 1.33.
export type Clearing = { id: string; x: number; z: number; rx: number; rz: number; ground: "grass" | "sand" | "dirt" | "stone" };
export type Trail = { id: string; pts: [number, number][]; w: number };
export const CLEARINGS: Clearing[] = [
  { id: "beach", x: 0, z: 61, rx: 34, rz: 7.5, ground: "sand" },
  { id: "palms", x: 0, z: 43, rx: 12, rz: 9, ground: "grass" },
  { id: "camp", x: -25, z: 14, rx: 11, rz: 10, ground: "dirt" },
  { id: "westbend", x: -19, z: 31, rx: 6, rz: 5, ground: "grass" },
  { id: "ruin", x: 24, z: 15, rx: 10, rz: 9, ground: "grass" },
  { id: "eastbend", x: 19, z: 31, rx: 6, rz: 5, ground: "grass" },
  { id: "vault", x: 31, z: 2, rx: 4.5, rz: 4, ground: "stone" },
  { id: "brute", x: 0, z: -12, rx: 12, rz: 9, ground: "grass" },
  { id: "hollow", x: -4, z: -39, rx: 13, rz: 11, ground: "dirt" },
  { id: "riverbank", x: 4, z: -57, rx: 18, rz: 4.5, ground: "sand" },
];
export const TRAILS: Trail[] = [
  { id: "beach-palms", pts: [[-3, 58], [-1, 51], [0, 46]], w: 3.4 },
  { id: "palms-west", pts: [[-6, 38], [-14, 33], [-19, 31], [-23, 25], [-25, 18]], w: 3.0 },
  { id: "palms-east", pts: [[6, 38], [14, 33], [19, 31], [22, 24], [24, 19]], w: 3.0 },
  { id: "camp-brute", pts: [[-24, 6], [-19, -2], [-11, -8], [-4, -11]], w: 3.0 },
  { id: "ruin-brute", pts: [[22, 8], [17, 0], [10, -7], [4, -11]], w: 3.0 },
  { id: "brute-hollow", pts: [[0, -18], [-1, -24], [-3, -30]], w: 3.2 },
  { id: "hollow-river", pts: [[-2, -46], [1, -51], [4, -55]], w: 3.0 },
];
/** the vine door sits on the short trail from the ruin into the vault; shut until the key is extracted once */
export const DOOR = { x: 28.6, z: 6.8, yaw: -0.85, w: 3.4 };
export const VAULT_TRAIL: Trail = { id: "ruin-vault", pts: [[26, 10], [29, 5.5], [31, 3]], w: 2.8 };
export const POI = {
  hatch: { x: -4, z: 60 }, raft: { x: 7, z: -58.5 }, campfire: { x: -25, z: 14 }, ruinCenter: { x: 24, z: 15 },
  raftSign: { x: 4, z: -18 }, sleeperBed: { x: -4, z: -41 },
};
export const SEA_Z = 67;    // south of this is the sea
export const RIVER_Z = -61; // north of this is the river
/** crate sockets: 20 authored, 14 used per seed; fixed ones always spawn */
export type CrateSocket = { x: number; z: number; tier: "wood" | "green" | "gold"; fixed?: "key" | "vault" | "sleeper" | "door" };
export const CRATES: CrateSocket[] = [
  { x: 9, z: 57, tier: "wood" }, { x: -14, z: 59, tier: "wood" },
  { x: -7, z: 44, tier: "wood" }, { x: 8, z: 41, tier: "wood" },
  { x: -17, z: 32.5, tier: "wood" }, { x: 17, z: 34, tier: "green" },
  { x: -29, z: 9, tier: "gold", fixed: "key" }, { x: -31, z: 17, tier: "green" }, { x: -20, z: 20, tier: "wood" }, { x: -18, z: 8, tier: "wood" },
  { x: 19, z: 20, tier: "wood" }, { x: 30, z: 18, tier: "green" }, { x: 25.5, z: 9.5, tier: "wood", fixed: "door" }, { x: 30.5, z: 10.5, tier: "green", fixed: "door" },
  { x: 32, z: 1, tier: "gold", fixed: "vault" },
  { x: -9, z: -14, tier: "green" }, { x: 9, z: -9, tier: "wood" },
  { x: -12, z: -42, tier: "green" }, { x: 2, z: -46, tier: "gold", fixed: "sleeper" },
  { x: 12, z: -56, tier: "green" },
];
export type SpawnKind = "wild" | "bandit" | "brute" | "sleeper";
export type Spawn = { kind: SpawnKind; x: number; z: number; group?: string };
/** two patrol sets; one is picked per seed (advisor 24) */
export const SPAWNS: Spawn[][] = [[
  { kind: "wild", x: -6, z: 40 }, { kind: "wild", x: 7, z: 46 },
  { kind: "wild", x: 16, z: 31 }, { kind: "wild", x: 27, z: 13 }, { kind: "wild", x: 5, z: -33 },
  { kind: "bandit", x: -22, z: 12, group: "camp" }, { kind: "bandit", x: -28, z: 16, group: "camp" }, { kind: "bandit", x: -26, z: 9, group: "camp" }, { kind: "bandit", x: -18, z: 30 },
  { kind: "brute", x: 1, z: -13 }, { kind: "sleeper", x: -4, z: -41 },
], [
  { kind: "wild", x: 5, z: 40 }, { kind: "wild", x: -9, z: 46 },
  { kind: "wild", x: -17, z: 32 }, { kind: "wild", x: 21, z: 18 }, { kind: "wild", x: -9, z: -32 },
  { kind: "bandit", x: -21, z: 16, group: "camp" }, { kind: "bandit", x: -29, z: 13, group: "camp" }, { kind: "bandit", x: -24, z: 8, group: "camp" }, { kind: "bandit", x: 18, z: 31 },
  { kind: "brute", x: -2, z: -11 }, { kind: "sleeper", x: -4, z: -41 },
]];
export const CAMP_RING = { x: -25, z: 13, r: 12 }; // allies share alerts only inside this ring (CODE_FINDINGS rule 11)
export const BOUNDS = { minX: -50, maxX: 50, minZ: -72, maxZ: 76 };
