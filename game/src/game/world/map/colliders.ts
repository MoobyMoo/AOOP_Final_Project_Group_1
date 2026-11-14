// Central collider table for placed kit pieces (map v3 rule 2: collision comes from pieces). Everything is in the
// piece's local space (+y up, front +z, origin on the ground), at scale 1; the grid transforms it with the Placed.
// move = blocks walking, shot = blocks bullets and sight, low = waist-high cover (blocks walking only).
// Radii for nature pieces mirror META in kit_nature.ts; boxes for build pieces come from the GLB bounds
// (tools/blender/build manifests). Buildings bring their own colliders in their BuildingDef.
import type { Collider, Placed } from "../../contracts";

const C = (r: number, move = true, shot = false, x = 0, z = 0): Collider => ({ t: "circle", x, z, r, move, shot, low: move && !shot });
const B = (w: number, d: number, shot = false, x = 0, z = 0, yaw = 0): Collider => ({ t: "box", x, z, w, d, yaw, move: true, shot, low: !shot });
const S = (ax: number, az: number, bx: number, bz: number, thick: number, shot = true): Collider => ({ t: "seg", ax, az, bx, bz, thick, move: true, shot, low: !shot });

/** nature kit: type -> [radius, move, shot]. Understory (bush, fern, big leaves...) is walk-through unless o.solid. */
const NATURE: Record<string, [number, boolean, boolean]> = {
  palm: [0.3, true, true], palmlean: [0.3, true, true], tree: [0.42, true, true], treefar: [0.42, true, true], mangrove: [1.1, true, true], giant: [2.6, true, true],
  rockm: [0.8, true, false], rockl: [1.2, true, true], boulders: [1.8, true, true], log: [0.6, true, false], stump: [0.5, true, false],
  caverock: [0.85, true, true], stalagmite: [0.6, true, true], crystal: [0.45, true, false], roots: [0.9, true, true],
};
/** trees the Sleeper stuns himself on */
export const RAM = new Set(["palm", "palmlean", "tree", "treefar", "mangrove", "giant", "rockl", "boulders", "pillar_a"]);
/** walk-through nature types (no collider): listed so the lint can tell "known, open" from "unknown kind" */
const OPEN_NATURE = new Set(["bush", "fern", "bigleaf", "banana", "flowers", "reeds", "lily", "beachgrass", "litter", "rocks", "pebbles", "driftwood", "shells", "mushroom", "caster"]);

/** build kit: asset name -> colliders */
const BUILD: Record<string, Collider[]> = {
  // camp
  tent_a: [B(4.4, 3.6, true)], tent_b: [B(3.0, 2.6, true)], tarp: [C(0.18, true, false, -2.2, -2.0), C(0.18, true, false, 2.2, -2.0), C(0.18, true, false, -2.2, 1.8), C(0.18, true, false, 2.2, 1.8)],
  campfire: [C(0.8)], lantern_post: [C(0.22)], fence_a: [B(2.6, 0.32)], fence_b: [B(2.6, 0.32)],
  gate: [C(0.32, true, true, -1.5, 0), C(0.32, true, true, 1.5, 0)],
  watchtower: [C(0.3, true, false, -1.35, -1.35), C(0.3, true, false, 1.35, -1.35), C(0.3, true, false, -1.35, 1.35), C(0.3, true, false, 1.35, 1.35)],
  well: [C(1.25)], log_bench: [B(2.1, 0.6)], log_bench_b: [B(1.4, 0.6)], signpost_a: [C(0.22)], signpost_raft: [C(0.22)], signpost_key: [C(0.22)],
  // loot dressing
  barrel_wood: [C(0.46, true, true)], barrel_rust: [C(0.44, true, true)], barrel_teal: [C(0.44, true, true)], sack_pile: [B(2.2, 1.0, false, 0.45, 0.2)], banana_stash: [B(1.3, 0.85)],
  crate_wood: [B(1.36, 1.02, true)], crate_wood_b: [B(1.1, 1.06, true)], crate_green: [B(1.7, 1.02, true)], crate_gold: [B(1.4, 1.0, true)],
  // walls (single modules; runs use "wall:<kind>")
  rubble_pile: [C(0.6)], rubble_pile_rock: [C(0.65)], wall_palisade_post: [C(0.28, true, true)],
  // ruins
  pillar_a: [C(0.62, true, true)], pillar_b: [C(0.6, true, true)], pillar_c: [C(0.6, true, true), B(2.6, 0.9, false, 1.9, 0.3)],
  ruin_wall_broken: [B(3.8, 0.7, true, 0, 0.1)], ruin_arch: [C(0.75, true, true, -1.5, 0.2), C(0.75, true, true, 1.6, 0.2)],
  vine_door: [C(0.55, true, true, -2.25, 0), C(0.55, true, true, 2.25, 0)],
  // the vault interior (9.5 x 7.5): solid back (north) and east walls, low stub walls on the cutaway west side
  vault: [S(-4.5, -3.5, 4.5, -3.5, 0.6), S(4.5, -3.5, 4.5, 3.5, 0.6), S(-4.5, -3.5, -4.5, 3.5, 0.6)],
  vault_plinth: [B(2.0, 1.6)], fusebox: [C(0.5)], statue: [C(0.95, true, true)],
  // landmarks. ferry: the hull is the wall (stern open at local x -4 for the breakable boards); bow to the east
  ferry: [S(-4.5, -3, 5.6, -3, 0.5), S(-4.5, 3, 5.6, 3, 0.5), S(5.6, -3, 7.0, 0, 0.5), S(5.6, 3, 7.0, 0, 0.5), C(0.8, true, true, 2.6, -1.4)],
  bomber: [S(-5.4, 0, 6.6, 0, 1.7, true), S(0.6, -5.6, 0.6, 6.4, 1.5, false), S(6.2, -2.2, 6.2, 2.2, 0.9, false)],
  vat: [C(1.95, true, true)], tractor: [B(3.0, 3.6, true)], lemon_stand: [B(1.5, 0.9, false, 0.35, 0.1)],
  // traversal
  zip_tower: [C(1.5)], hatch: [C(0.25, true, false, 1.1, -0.3)], supply_gondola: [C(1.2)],
  portal_cave: [C(1.1, true, true, -2.3, -0.4), C(1.1, true, true, 2.3, -0.4), S(-2.6, -1.6, 2.6, -1.6, 0.9)],
  portal_cave_dark: [C(1.1, true, true, -2.3, -0.4), C(1.1, true, true, 2.3, -0.4), S(-2.6, -1.6, 2.6, -1.6, 0.9)],
  portal_roots: [C(1.0, true, true, -2.2, -0.6), C(1.0, true, true, 2.2, -0.6), S(-2.4, -2.0, 2.4, -2.0, 0.9)],
};
/** build pieces that never block (floors, decals, walk-on decks, small dressing) */
const OPEN_BUILD = new Set(["bedroll_a", "bedroll_b", "lantern", "sack", "ammo_box", "satchel", "ruin_floor_a", "ruin_floor_b", "ruin_floor_c", "ruin_steps", "audit", "bottle",
  "boardwalk_a", "boardwalk_b", "boardwalk_ramp", "bridge", "raft", "zip_end", "falls"]);
const WALL_THICK: Record<string, number> = { palisade: 0.55, stone: 0.65, hull: 0.4, rock: 1.1, fence: 0.32 };

/** colliders of a placed piece, in its local space. Unknown kinds return null (the lint reports them). */
export function collidersFor(k: string, o: Record<string, unknown> = {}): Collider[] | null {
  if (k.startsWith("wall:")) { // a run of wall modules along local z, o.len long
    const kind = k.slice(5), len = Number(o.len ?? 2.5), fence = kind === "fence";
    return [{ t: "box", x: 0, z: 0, w: WALL_THICK[kind] ?? 0.5, d: len, move: true, shot: !fence, low: fence }];
  }
  if (k === "waterfall") return [B(6.0, 5.4, true, -4.3, -0.95), B(6.0, 5.4, true, 4.3, -0.95)]; // the two piers; the 2.6 u gap stays open
  if (k === "pool" || k === "ground" || k === "light") return [];
  const n = NATURE[k];
  if (n) return [{ t: "circle", x: 0, z: 0, r: n[0], move: n[1], shot: n[2], low: n[1] && !n[2] }];
  if (OPEN_NATURE.has(k)) return o.solid ? [C(Number(o.solid === true ? 0.75 : o.solid), true, false)] : [];
  if (BUILD[k]) return BUILD[k];
  if (OPEN_BUILD.has(k)) return [];
  return null;
}
/** true if a placed instance contributes no collision at all */
export const isOpenPiece = (p: Placed) => (collidersFor(p.k, p.o)?.length ?? 0) === 0;
