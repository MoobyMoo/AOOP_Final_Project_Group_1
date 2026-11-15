// Central collider table for placed kit pieces (map v3 rule 2: collision comes from pieces). Everything is in the
// piece's local space (+y up, front +z, origin on the ground), at scale 1; the grid transforms it with the Placed.
// move = blocks walking, shot = blocks bullets and sight, low = waist-high cover (blocks walking only).
// Radii for nature pieces mirror META in kit_nature.ts; boxes for build pieces come from the GLB bounds
// (tools/blender/build manifests). Buildings bring their own colliders in their BuildingDef.
import type { Collider, Placed } from "../../contracts";

const C = (r: number, move = true, shot = false, x = 0, z = 0): Collider => ({ t: "circle", x, z, r, move, shot, low: move && !shot });
const B = (w: number, d: number, shot = false, x = 0, z = 0, yaw = 0): Collider => ({ t: "box", x, z, w, d, yaw, move: true, shot, low: !shot });
const S = (ax: number, az: number, bx: number, bz: number, thick: number, shot = true): Collider => ({ t: "seg", ax, az, bx, bz, thick, move: true, shot, low: !shot });

/** nature kit: type -> [radius, move, shot]. Understory (bush, fern, big leaves...) is walk-through unless o.solid.
 *  Radii are the meshes' own outline cut 0.15 u up (G1.5-12 glitch hunt, src/game/dev/glitch.ts fitNature): the old
 *  rockm 0.8 / rockl 1.2 / boulders 1.8 / caverock 0.85 / stalagmite 0.6 / crystal 0.45 stood 0.3 to 1 u clear of the
 *  rock (an invisible wall all round it), mangrove 1.1 let you walk into its roots. Types in NATURE_V use those instead. */
const NATURE: Record<string, [number, boolean, boolean]> = {
  palm: [0.3, true, true], palmlean: [0.3, true, true], tree: [0.42, true, true], treefar: [0.42, true, true], mangrove: [1.5, true, true], giant: [2.6, true, true],
  rockm: [0.52, true, false], rockl: [0.85, true, true], boulders: [0.8, true, true], stump: [0.46, true, false],
  caverock: [0.58, true, true], stalagmite: [0.32, true, true], crystal: [0.3, true, false], roots: [0.9, true, true],
};
/** per-variant footprints for pieces that are several rocks, or lean: [x, z, r] circles in piece space at scale 1, or a
 *  [ax, az, bx, bz, thick] segment (a leaning trunk from its foot to where it is at chest height). The first shape
 *  carries the type's shot flag, the rest block walking only. Variant counts match the GLBs (glitch.ts checks it). */
type VShape = [number, number, number] | [number, number, number, number, number];
const NATURE_V: Record<string, VShape[][]> = {
  rockl: [[[0.03, 0.08, 0.89], [1.1, 0.29, 0.36]], [[0.07, -0.02, 0.76], [-0.06, -1.02, 0.37]], [[0, 0.01, 0.79], [-0.12, 1.08, 0.36]], [[-0.02, -0.08, 0.83], [0.67, -0.93, 0.36]]],
  boulders: [[[-0.01, -0.01, 0.82], [-0.11, -1.29, 0.48], [0.08, 1.2, 0.45]], [[-0.05, 0.03, 0.74], [-0.52, 1.07, 0.48], [1.0, -0.62, 0.47], [-0.95, -0.68, 0.42]], [[0.03, 0, 0.75], [0.47, 1.13, 0.45], [-0.87, -0.64, 0.33]]],
  caverock: [[[0.04, 0, 0.56], [0.73, -0.05, 0.24]], [[0.05, 0.02, 0.5]], [[0.06, -0.01, 0.22], [0.05, -0.49, 0.22], [-0.41, 0.18, 0.21]], [[0.04, 0.09, 0.61]]],
  stalagmite: [[[0, 0, 0.3], [0.27, -0.03, 0.22], [-0.6, 0.32, 0.21]], [[0, -0.01, 0.27], [0.53, 0.18, 0.18]], [[0, 0, 0.29], [0.67, 0.09, 0.21]]],
  // mangrove: the stilt roots ring the trunk 1.3-1.95 u out with gaps between them. One circle at 1.35 (the old 1.5 left
  // 1.6-2.4 u of outline with no root near it) plus a small one on each stilt foot that lands further out
  mangrove: [[[0, 0, 1.35], [1.33, -1.28, 0.22], [1.82, -0.05, 0.22], [-0.84, -1.53, 0.22]], [[0, 0, 1.35], [1.79, -0.1, 0.22], [1.69, -0.82, 0.22], [0.37, 1.69, 0.22], [1.68, 0.87, 0.22]], [[0, 0, 1.35], [0.47, 1.65, 0.22], [-0.45, 1.76, 0.22], [1.24, 1.5, 0.22]]],
  palmlean: [[[0.06, -0.04, 1.27, -0.9, 0.5]], [[0.04, 0.05, 0.81, 0.9, 0.5]], [[0.06, -0.05, 1.35, -1.11, 0.52]]], // to where the trunk is at 1.6 u
};
/** how many variants each per-variant type has (the nature GLBs) */
export const NATURE_VARIANTS = Object.fromEntries(Object.entries(NATURE_V).map(([k, v]) => [k, v.length])) as Record<string, number>;
/** fix which variant a placed nature piece shows, from its position, so the grid and the renderer agree on its shape
 *  (o.cv; an authored o.v wins). Pure: no rng is drawn, so the world rng stream stays as it was */
export function pinVariant(p: Placed): Placed {
  const n = NATURE_VARIANTS[p.k]; if (!n || p.o?.v !== undefined || p.o?.cv !== undefined) return p;
  const h = (Math.imul(Math.round(p.x * 100), 73856093) ^ Math.imul(Math.round(p.z * 100), 19349663)) >>> 0;
  p.o = { ...(p.o ?? {}), cv: h % n }; return p;
}
/** trees the Sleeper stuns himself on */
export const RAM = new Set(["palm", "palmlean", "tree", "treefar", "mangrove", "giant", "rockl", "boulders", "pillar_a"]);
/** walk-through nature types (no collider): listed so the lint can tell "known, open" from "unknown kind" */
const OPEN_NATURE = new Set(["bush", "fern", "bigleaf", "banana", "flowers", "reeds", "lily", "beachgrass", "litter", "rocks", "pebbles", "driftwood", "shells", "mushroom", "caster"]);

/** build kit: asset name -> colliders */
const BUILD: Record<string, Collider[]> = {
  // camp
  tent_a: [B(3.3, 3.2, true), C(0.2, true, false, -2.48, 0), C(0.2, true, false, 2.48, 0), C(0.15, true, false, -1.32, -2.3), C(0.15, true, false, 1.32, -2.3), C(0.15, true, false, -1.32, 2.3), C(0.15, true, false, 1.32, 2.3)] /* the canvas body (was 4.4 x 3.6: an invisible wall past its ends, G1.5-12) and a peg on each guy rope */, tent_b: [B(3.0, 2.6, true)], tarp: [C(0.18, true, false, -2.2, -2.0), C(0.18, true, false, 2.2, -2.0), C(0.18, true, false, -2.2, 1.8), C(0.18, true, false, 2.2, 1.8)],
  campfire: [C(0.8)], lantern_post: [C(0.22)], fence_a: [B(2.6, 0.32)], fence_b: [B(2.6, 0.32)],
  gate: [C(0.32, true, true, -1.5, 0), C(0.32, true, true, 1.5, 0)],
  watchtower: [C(0.3, true, false, -1.35, -1.35), C(0.3, true, false, 1.35, -1.35), C(0.3, true, false, -1.35, 1.35), C(0.3, true, false, 1.35, 1.35)],
  well: [C(1.25)], log_bench: [B(2.1, 0.6)], log_bench_b: [B(1.4, 0.6)], signpost_a: [C(0.22), S(-0.95, 0.13, -0.3, 0.13, 0.2, false)], signpost_raft: [C(0.22), S(-0.95, 0.13, -0.3, 0.13, 0.2, false)], /* the lower board is at head height (1.15-1.6 u) and juts 0.95 u off the post */ signpost_key: [C(0.22)],
  sandbags: [B(2.9, 0.8)], crate_stack: [B(2.4, 1.15, true), C(0.42, true, false, 1.42, -0.42)], dummy_seated: [C(0.45)],
  washing_line: [C(0.16, true, false, -2.25, 0), C(0.16, true, false, 2.25, 0)],
  // lean_to: the roof runs from the ground at the back (z -1.3) up to 1.7 u at the open front (z 1.5): under 2 u all the
  // way, so the whole slope is solid (a 2 u monkey walked into it), with the two guy stakes at the front corners
  lean_to: [B(3.3, 2.7, false, 0, -0.05), C(0.15, true, false, -2.06, 1.88), C(0.15, true, false, 2.06, 1.88)],
  dock_piles: [C(0.22, true, false, 0, 1.3), C(0.22, true, false, 0.2, -1.3)],
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
  // (from tools/blender/build/g_landmarks.py ferry(), three z = -blender y): the raised bow deck x 2.75-4.5 (1.07 u up,
  // with the wheelhouse and the funnel on it) is solid to the bow, the steps up to it, the leaning mast, cell 01 behind
  // its bars, cell 02's dividers and open door, the sand drifts against the hull outside and the one in the hold
  ferry: [S(-4.5, -3, 5.6, -3, 0.5), S(-4.5, 3, 5.6, 3, 0.5), S(5.6, -3, 7.0, 0, 0.5), S(5.6, 3, 7.0, 0, 0.5),
    B(1.75, 5.5, true, 3.62, 0), C(1.0, true, true, 4.9, 0), C(0.5, true, true, 6.1, 0), B(1.1, 1.1, false, 2.2, 1.5), C(0.2, true, true, 1.28, 1.28),
    B(1.85, 1.4, true, -2.4, -2.08), S(-0.3, -1.42, 0.3, -1.42, 0.16, false), S(-1.5, -1.42, -1.5, -2.75, 0.16, false), S(0.3, -1.42, 0.3, -2.75, 0.16, false),
    S(-0.25, -1.42, 0.15, -2.28, 0.14, false), C(0.22, true, false, -0.9, -2.2),
    S(-4.9, 3.75, 0.4, 3.75, 1.5, false), S(1.4, 3.6, 5.0, 3.6, 1.2, false), S(-1.2, -3.75, 4.4, -3.75, 1.4, false), C(0.6, true, false, -3.2, 1.85), C(0.55, true, false, 0.4, 2.55)],
  bomber: [S(-5.4, 0, 6.6, 0, 1.7, true), S(0.6, -5.6, 0.6, 6.4, 1.5, false), S(6.2, -2.2, 6.2, 2.2, 0.9, false)],
  // vat: the tank, its west staves and spill (x -3.45..-2.25), the burst staves at the north-west (two), the ladder at the south
  // and the valve on the east (asset space; the vat is lifted 0.4 u so its base is not buried, grove.ts)
  vat: [C(1.95, true, true), B(1.2, 2.4, false, -2.85, 0.3), C(0.35, true, false, -1.85, 1.6), C(0.3, true, false, -0.9, -2.35), C(0.35, true, false, 2.2, 0.85), C(0.5, true, false, -3.3, 2.45)], tractor: [B(3.0, 3.6, true)], lemon_stand: [B(1.5, 0.9, false, 0.35, 0.1)],
  // traversal
  zip_tower: [C(1.5)], cove_boat: [B(3.1, 1.3, false, 0.07, 0.08)] /* the house kit's rowboat hull x -1.5..1.65, z -0.62..0.78 (scaled 1.25 by its Placed) */, hatch: [C(0.25, true, false, 1.1, -0.3), B(1.3, 0.4, false, -1.42, 0.45)] /* the wheel post and the raised lid */, supply_gondola: [C(1.2)],
  portal_cave: [C(1.1, true, true, -2.3, -0.4), C(1.1, true, true, 2.3, -0.4), S(-2.6, -1.6, 2.6, -1.6, 0.9)],
  portal_cave_dark: [C(1.1, true, true, -2.3, -0.4), C(1.1, true, true, 2.3, -0.4), S(-2.6, -1.6, 2.6, -1.6, 0.9)],
  // portal_roots: fitted to the root mass cut 0.12-1.6 u up (glitch.ts localProfile): the west leg (x -2.7..-1.5), the east
  // leg (x 2..3.2, forward to z 1.16) and the mound behind the mouth (x -1.1..1.6, back to z -2.76)
  portal_roots: [C(0.7, true, true, -2.1, -0.1), C(0.7, true, true, 2.55, 0.4), B(2.7, 1.6, true, 0.25, -1.95)],
};
/** build pieces that never block (floors, decals, walk-on decks, small dressing) */
const OPEN_BUILD = new Set(["bedroll_a", "bedroll_b", "lantern", "sack", "ammo_box", "satchel", "ruin_floor_a", "ruin_floor_b", "ruin_floor_c", "ruin_steps", "audit", "bottle",
  "boardwalk_a", "boardwalk_b", "boardwalk_ramp", "bridge", "raft", "zip_end", "falls", "dock_a", "dock_b", "dock_broken", "bomber_debris_a", "bomber_debris_b", "bomber_debris_c"]);
const WALL_THICK: Record<string, number> = { palisade: 0.55, stone: 0.65, hull: 0.4, rock: 1.1, fence: 0.32 };

/** colliders of a placed piece, in its local space. Unknown kinds return null (the lint reports them). */
export function collidersFor(k: string, o: Record<string, unknown> = {}): Collider[] | null {
  if (k.startsWith("wall:")) { // a run of wall modules along local z, o.len long
    const kind = k.slice(5), len = Number(o.len ?? 2.5), fence = kind === "fence";
    return [{ t: "box", x: 0, z: 0, w: WALL_THICK[kind] ?? 0.5, d: len, move: true, shot: !fence, low: fence }];
  }
  if (k === "waterfall") return [B(6.0, 5.4, true, -4.3, -0.95), B(6.0, 5.4, true, 4.3, -0.95)]; // the two piers; the 2.6 u gap stays open
  if (k === "pool" || k === "ground" || k === "light") return [];
  const vs = NATURE_V[k], vi = Number(o.v ?? o.cv);
  if (vs && Number.isInteger(vi) && vs[vi % vs.length]) {
    const shot = NATURE[k][2];
    return vs[vi % vs.length].map((q, i) => q.length === 3 ? C(q[2], true, i === 0 && shot, q[0], q[1]) : S(q[0], q[1], q[2], q[3], q[4], i === 0 && shot));
  }
  if (k === "log") return [B(2.6, 0.75)];
  // an open gate's leaf swings to local +z from its -x post (x -1.34..-1.0, z 0..2.28): you walked through it (G1.5-12)
  if (k === "gate" && o.open) return [...BUILD.gate, S(-1.17, 0.12, -1.17, 2.2, 0.34, false)]; // a log lies along its local x (all four variants are 2.5-2.9 u long, 0.7-0.85 u thick)
  const n = NATURE[k];
  if (n) return [{ t: "circle", x: 0, z: 0, r: n[0], move: n[1], shot: n[2], low: n[1] && !n[2] }];
  if (OPEN_NATURE.has(k)) return o.solid ? [C(Number(o.solid === true ? 0.75 : o.solid), true, false)] : [];
  if (BUILD[k]) return BUILD[k];
  if (OPEN_BUILD.has(k)) return [];
  return null;
}
/** true if a placed instance contributes no collision at all */
export const isOpenPiece = (p: Placed) => (collidersFor(p.k, p.o)?.length ?? 0) === 0;
