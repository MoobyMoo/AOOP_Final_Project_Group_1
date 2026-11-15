// Node and material check of public/models/build/vault.glb, read straight from the GLB's JSON chunk (no three.js):
// every piece the game asks for by name is a root node, every named part hangs under its piece, lamp_emit exists.
//   node tools/blender/build/check_vault.mjs        exit code 1 on any miss
import { readFileSync } from "node:fs";
const buf = readFileSync(new URL("../../../public/models/build/vault.glb", import.meta.url));
const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString("utf8"));
const nodes = json.nodes, roots = new Map(json.scenes[0].nodes.map((i) => [nodes[i].name, i]));
const under = (i, out = []) => { for (const c of nodes[i].children ?? []) { out.push(nodes[c]); under(c, out); } return out; };
const WANT = {
  vault_pod: ["pod_door", "pod_needle", "pod_lamp", "pod_glass"], vault_board: ["board_face"], vault_door_round: ["door_wheel"], vault_sconce: ["sconce_bulb"],
  vault_floor: [], vault_floor_half: [], vault_floor_cell: [], vault_floor_border: [], vault_floor_corner: [], vault_kerb: [], vault_kerb_post: [],
  vault_wall: [], vault_wall_corner: [], vault_pilaster: [], vault_trim: [], vault_wall_cap: [],
  fac_fence: ["bell"], fac_bench: ["fx_mag", "fx_pack", "fx_heart"], fac_sal: ["neon"], fac_trophy: [0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => `fac_trophy__slot${k}`), fac_med: [], fac_stash: [],
  fac_generator: ["gen_wheel", "gen_lamp"], fac_press: ["press_wheel"], fac_desk: [], fac_plant: [], fac_locker: ["mirror_glass"], fac_blueprint: ["bp_sheet"],
};
let bad = 0;
for (const [piece, parts] of Object.entries(WANT)) {
  const i = roots.get(piece);
  if (i === undefined) { console.log(`MISSING piece ${piece}`); bad++; continue; }
  const kids = under(i), names = new Set(kids.map((n) => n.name)), tris = nodes[i].extras?.tris;
  const miss = parts.filter((p) => !names.has(p));
  if (miss.length) { console.log(`MISSING in ${piece}: ${miss.join(", ")}`); bad++; }
  console.log(`${piece.padEnd(20)} ${String(tris).padStart(5)} tris  ${[...names].filter((n) => !n.startsWith(piece + "__")).join(" ")}`);
}
const mats = json.materials.map((m) => m.name);
if (!mats.includes("lamp_emit")) { console.log("MISSING material lamp_emit"); bad++; }
const lamp = nodes.find((n) => n.name === "pod_lamp"), lampMat = lamp && json.materials[json.meshes[lamp.mesh].primitives[0].material]?.name;
if (lampMat !== "lamp_emit") { console.log(`pod_lamp is on material ${lampMat}, not lamp_emit`); bad++; }
console.log(`materials: ${mats.join(", ")}`);
console.log(bad ? `${bad} problem(s)` : "vault.glb: all pieces, nodes and materials present");
process.exit(bad ? 1 : 0);
