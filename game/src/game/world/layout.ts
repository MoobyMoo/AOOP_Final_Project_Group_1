// Banana Grove v2, the G1 raid map: a route network, not a ring (Moo 2026-11-15: "not very linear... dynamic and
// creative like Duckov with many cool areas and easter eggs, breakable walls"). Mechanism sources: research/duckov-re
// FINDINGS 1.3 + pattern 2 (maps are route networks with caves/cellars, passages opened with explosives, secret and
// beacon exits). Layout, names and gags are ours; easter eggs point at the channel's Shorts (LORE.md).
// x = east, z = south (toward the camera). Overworld x -70..70, z -80..80; the grotto sub-level sits at x 95..140.
// Time budget (human): short hatch run 2.5-3.5 min, raft run 5-6.5 min (bot = / 1.33). Areas are optional detours
// off several loops, so the player picks a route every raid.
export type Ground = "grass" | "sand" | "dirt" | "stone" | "cave" | "plank";
export type Clearing = { id: string; name: string; x: number; z: number; rx: number; rz: number; ground: Ground; under?: boolean };
export type Trail = { id: string; pts: [number, number][]; w: number; ground?: Ground };
export type Wall = { id: string; pts: [number, number][]; kind: "palisade" | "stone" | "hull" | "rock" | "fence"; breakable?: { hp: number; persist: boolean; reveals: string } };
export type Portal = { id: string; a: { x: number; z: number }; b: { x: number; z: number }; label: string; oneWay?: boolean };

export const CLEARINGS: Clearing[] = [
  { id: "beach", name: "Exile Beach", x: 0, z: 68, rx: 48, rz: 8, ground: "sand" },
  { id: "wreck", name: "The Prison Ferry", x: 31, z: 62.5, rx: 5.5, rz: 3, ground: "plank" },
  { id: "cove", name: "Smuggler's Cove", x: -46, z: 56, rx: 9, rz: 7, ground: "sand" },
  { id: "palms", name: "Palm Edge", x: 0, z: 48, rx: 12, rz: 8, ground: "grass" },
  { id: "westbend", name: "Lookout Bend", x: -22, z: 37, rx: 6, rz: 5, ground: "grass" },
  { id: "camp", name: "Peel Gang Camp", x: -36, z: 19, rx: 13, rz: 11, ground: "dirt" },
  { id: "mangrove", name: "Mangrove Boardwalk", x: 33, z: 40, rx: 10, rz: 7, ground: "grass" },
  { id: "plantation", name: "Old Plantation", x: 2, z: 15, rx: 14, rz: 10, ground: "dirt" },
  { id: "ruin", name: "Penal Colony Ruins", x: 36, z: 9, rx: 11, rz: 9, ground: "stone" },
  { id: "vault", name: "The Warden's Vault", x: 49, z: -3, rx: 5, rz: 4, ground: "stone" },
  { id: "shrine", name: "???", x: 22, z: -1, rx: 3.6, rz: 3.2, ground: "stone" },
  { id: "planecrash", name: "Bomber Wreck", x: -32, z: -14, rx: 11, rz: 8, ground: "grass" },
  { id: "hollow", name: "The Sleeper's Hollow", x: 2, z: -31, rx: 13, rz: 11, ground: "dirt" },
  { id: "waterfall", name: "Waterfall Pool", x: 35, z: -30, rx: 9, rz: 7, ground: "grass" },
  { id: "falls-nook", name: "Behind the Falls", x: 39, z: -39.5, rx: 3.2, rz: 2.4, ground: "stone" },
  { id: "riverbank", name: "Raft Landing", x: 5, z: -62, rx: 22, rz: 5, ground: "sand" },
  // the grotto: an underground sub-level (darker light, cave ground); three ways in, one secret way out
  { id: "grotto-a", name: "Grotto Mouth", x: 108, z: 42, rx: 8, rz: 6, ground: "cave", under: true },
  { id: "grotto-b", name: "Smugglers' Hall", x: 118, z: 15, rx: 11, rz: 8, ground: "cave", under: true },
  { id: "grotto-c", name: "Root Chamber", x: 110, z: -22, rx: 8, rz: 7, ground: "cave", under: true },
  { id: "tunnel", name: "Smuggler Tunnel", x: 134, z: 30, rx: 4, rz: 3.5, ground: "cave", under: true },
];
export const TRAILS: Trail[] = [
  { id: "beach-palms", pts: [[-3, 62], [-1, 55], [0, 51]], w: 3.6 },
  { id: "beach-cove", pts: [[-26, 65], [-33, 61], [-39, 58]], w: 3.2, ground: "sand" },
  { id: "palms-west", pts: [[-7, 44], [-15, 40], [-22, 37], [-28, 31], [-32, 27]], w: 3.0 },
  { id: "palms-plantation", pts: [[0, 41], [-1, 33], [1, 25]], w: 2.4 },               // overgrown middle path
  { id: "palms-mangrove", pts: [[9, 46], [17, 44], [25, 42]], w: 2.6, ground: "plank" },
  { id: "mangrove-ruin", pts: [[35, 34], [37, 26], [36, 18]], w: 2.8, ground: "plank" },
  { id: "camp-palisade", pts: [[-26, 16], [-20, 15], [-12, 15]], w: 3.0 },              // through the breakable palisade
  { id: "camp-plane", pts: [[-37, 9], [-37, 2], [-34, -6]], w: 3.0 },
  { id: "plantation-ruin", pts: [[15, 13], [21, 12], [26, 11]], w: 3.0 },
  { id: "plantation-hollow", pts: [[3, 6], [2, -6], [2, -20]], w: 3.2 },
  { id: "plane-hollow", pts: [[-22, -17], [-15, -22], [-10, -27]], w: 2.8 },
  { id: "ruin-falls", pts: [[39, 1], [40, -10], [37, -23]], w: 2.8 },
  { id: "falls-hollow", pts: [[27, -30], [21, -31], [15, -31]], w: 2.8 },
  { id: "hollow-river", pts: [[4, -42], [5, -50], [6, -57]], w: 3.0 },
  { id: "ruin-shrine", pts: [[29, 4], [25, 1]], w: 2.4, ground: "stone" },              // behind the cracked wall
  { id: "falls-nook", pts: [[36, -35], [38, -38]], w: 2.0, ground: "stone" },           // walk through the waterfall
  { id: "grotto-ab", pts: [[110, 36], [114, 28], [117, 22]], w: 3.0, ground: "cave" },
  { id: "grotto-bc", pts: [[116, 8], [113, -6], [111, -15]], w: 3.0, ground: "cave" },
  { id: "grotto-tunnel", pts: [[127, 19], [131, 25], [134, 28]], w: 2.4, ground: "cave" }, // past the rubble wall
];
/** the vine door: shut until the Vine Key has been extracted once (then the vault opens from raid 2) */
export const VAULT_TRAIL: Trail = { id: "ruin-vault", pts: [[41, 4], [45, 0], [48, -2]], w: 2.8, ground: "stone" };
export const DOOR = { x: 43.2, z: 2.2, yaw: -0.78, w: 3.4 };
/** walls block movement and shots; breakable sections take melee hits (and the brute's slam) and open for good if persist */
export const WALLS: Wall[] = [
  { id: "palisade", pts: [[-24, 11.5], [-24, 19]], kind: "palisade", breakable: { hp: 6, persist: true, reveals: "Shortcut: camp ↔ plantation" } },
  { id: "ruin-crack", pts: [[27.6, 5.5], [29.6, 2.4]], kind: "stone", breakable: { hp: 8, persist: true, reveals: "A secret room!" } },
  { id: "hull-boards", pts: [[27, 65], [27, 60]], kind: "hull", breakable: { hp: 4, persist: false, reveals: "The ferry's hold" } },
  { id: "grotto-rubble", pts: [[125, 15], [127, 21]], kind: "rock", breakable: { hp: 10, persist: true, reveals: "The Smuggler Tunnel: a new way home" } },
  { id: "hull-n", pts: [[26.5, 59.5], [36, 59.5]], kind: "hull" }, { id: "hull-s", pts: [[26.5, 65.5], [36, 65.5]], kind: "hull" }, { id: "hull-e", pts: [[36, 59.5], [36.5, 62.5], [36, 65.5]], kind: "hull" },
];
/** sub-level entrances (fade + move); the well is a one-way drop */
export const PORTALS: Portal[] = [
  { id: "cove-cave", a: { x: -52, z: 52 }, b: { x: 104, z: 45 }, label: "Enter the grotto" },
  { id: "camp-well", a: { x: -41, z: 25 }, b: { x: 121, z: 11 }, label: "Jump down the well", oneWay: true },
  { id: "hollow-roots", a: { x: -8, z: -39 }, b: { x: 107, z: -26 }, label: "Climb into the roots" },
];
/** one-way zipline from the plantation lookout down to the beach: a fast way home from the middle of the map */
export const ZIPLINES = [{ id: "lookout", from: { x: 9, z: 6, h: 6 }, to: { x: 15, z: 61, h: 1.2 } }];
export const POI = {
  hatch: { x: -6, z: 64 }, raft: { x: 13, z: -64.5 }, tunnelExit: { x: 135.5, z: 30 },
  campfire: { x: -36, z: 19 }, watchtower: { x: -44, z: 14 }, ruinCenter: { x: 36, z: 9 }, raftSign: { x: 6, z: -21 },
  sleeperBed: { x: 2, z: -33 }, giantTree: { x: -3, z: -36 }, vat: { x: -6, z: 12 }, plane: { x: -31, z: -14 }, falls: { x: 37, z: -36 },
};
/** landmarks: unique set pieces the world dresses (and where the easter eggs live) */
export const LANDMARKS = [
  { id: "ferry", x: 31, z: 62.5, note: "the wrecked prison ferry that brought the Businessman (Act 1: Exile)" },
  { id: "bottle", x: -16, z: 70, note: "message in a bottle: a readable note from the last exile" },
  { id: "watchtower", x: -44, z: 14, note: "bandit lookout; the key crate sits on its platform" },
  { id: "lemon", x: -30, z: 24, note: "EGG ep02: a bandit with lemon juice on his face who thinks you can't see him" },
  { id: "vat", x: -6, z: 12, note: "EGG ep01: a burst molasses vat; the sticky puddle slows everyone" },
  { id: "tractor", x: 10, z: 20, note: "a rusted plantation tractor (cover)" },
  { id: "bomber", x: -31, z: -14, note: "EGG ep03: a crashed bomber, bullet holes only on the wings (survivorship bias)" },
  { id: "fusebox", x: 46, z: 1.5, note: "EGG ep04: the vault's fuse box, wired backwards: PULL TO OPEN closes it" },
  { id: "statue", x: 22, z: -1.5, note: "secret shrine: a golden statue of a monkey in a bowler, plaque 'IN BANANAS WE TRUST'" },
  { id: "audit", x: -1, z: -40, note: "a NOTICE OF AUDIT nailed to the giant tree (foreshadows the ending gag)" },
  { id: "falls", x: 37, z: -36, note: "a waterfall you can walk through to a hidden nook" },
];
export const SEA_Z = 74;    // south of this is the sea
export const RIVER_Z = -66; // north of this is the river
export type CrateSocket = { x: number; z: number; tier: "wood" | "green" | "gold"; fixed?: "key" | "vault" | "sleeper" | "secret" };
/** 34 authored sockets; fixed ones always spawn, about 18 of the rest per raid */
export const CRATES: CrateSocket[] = [
  { x: 10, z: 66, tier: "wood" }, { x: -18, z: 66, tier: "wood" }, { x: 33, z: 62, tier: "green" }, { x: 30, z: 63.5, tier: "wood" },
  { x: -46, z: 59, tier: "green" }, { x: -42, z: 53, tier: "wood" },
  { x: -7, z: 47, tier: "wood" }, { x: 8, z: 50, tier: "wood" }, { x: -21, z: 34, tier: "wood" },
  { x: -44, z: 14, tier: "gold", fixed: "key" }, { x: -40, z: 26, tier: "green" }, { x: -29, z: 23, tier: "wood" }, { x: -33, z: 11, tier: "wood" },
  { x: 30, z: 43, tier: "wood" }, { x: 39, z: 38, tier: "green" },
  { x: -7, z: 18, tier: "wood" }, { x: 12, z: 12, tier: "green" }, { x: 2, z: 22, tier: "wood" },
  { x: 33, z: 14, tier: "wood" }, { x: 43, z: 11, tier: "green" }, { x: 40, z: 4, tier: "wood" },
  { x: 50, z: -4, tier: "gold", fixed: "vault" }, { x: 22, z: -2, tier: "gold", fixed: "secret" },
  { x: -27, z: -16, tier: "green" }, { x: -36, z: -12, tier: "wood" }, { x: -31, z: -9, tier: "wood" },
  { x: -8, z: -27, tier: "green" }, { x: 6, z: -36, tier: "gold", fixed: "sleeper" },
  { x: 33, z: -27, tier: "wood" }, { x: 39, z: -40, tier: "green" },
  { x: 16, z: -61, tier: "green" }, { x: -8, z: -61, tier: "wood" },
  { x: 120, z: 17, tier: "green" }, { x: 112, z: -22, tier: "green" },
];
export type SpawnKind = "wild" | "bandit" | "brute" | "sleeper";
export type Spawn = { kind: SpawnKind; x: number; z: number; group?: string; tag?: "lemon" };
const base: Spawn[] = [
  { kind: "bandit", x: -33, z: 21, group: "camp" }, { kind: "bandit", x: -39, z: 16, group: "camp" }, { kind: "bandit", x: -30, z: 24, group: "camp", tag: "lemon" },
  { kind: "brute", x: 3, z: 14 }, { kind: "sleeper", x: 2, z: -33 },
];
/** two patrol sets; one is picked per raid (advisor 24). Only enemies within 32 u simulate; at most 6 awake at once. */
export const SPAWNS: Spawn[][] = [[...base,
  { kind: "wild", x: -5, z: 45 }, { kind: "wild", x: 7, z: 49 }, { kind: "wild", x: 31, z: 41 }, { kind: "wild", x: 33, z: 6 },
  { kind: "wild", x: 33, z: -28 }, { kind: "bandit", x: -21, z: 37 }, { kind: "bandit", x: -30, z: -13, group: "plane" }, { kind: "bandit", x: -34, z: -16, group: "plane" },
  { kind: "bandit", x: 118, z: 14, group: "grotto" }, { kind: "bandit", x: 121, z: 18, group: "grotto" },
], [...base,
  { kind: "wild", x: 5, z: 46 }, { kind: "wild", x: -45, z: 55 }, { kind: "wild", x: 36, z: 38 }, { kind: "wild", x: 38, z: 12 },
  { kind: "wild", x: -27, z: -12 }, { kind: "bandit", x: 30, z: 43 }, { kind: "bandit", x: 36, z: 8, group: "ruin" }, { kind: "bandit", x: -33, z: -15, group: "plane" },
  { kind: "bandit", x: 116, z: 16, group: "grotto" }, { kind: "wild", x: 109, z: -21 },
]];
/** allies share an alert only inside their group's ring (CODE_FINDINGS rule 11) */
export const GROUP_RINGS: Record<string, { x: number; z: number; r: number }> = {
  camp: { x: -36, z: 19, r: 13 }, plane: { x: -32, z: -14, r: 11 }, grotto: { x: 118, z: 15, r: 11 }, ruin: { x: 36, z: 9, r: 11 },
};
/** dynamic event: a bandit supply balloon crash-lands one gold crate (with red smoke) 90-150 s into a raid */
export const SUPPLY_DROPS = [{ x: -1, z: 18, area: "plantation" }, { x: -29, z: -18, area: "planecrash" }, { x: 30, z: -32, area: "waterfall" }, { x: -44, z: 57, area: "cove" }];
export const BOUNDS = { minX: -72, maxX: 142, minZ: -84, maxZ: 82 };
