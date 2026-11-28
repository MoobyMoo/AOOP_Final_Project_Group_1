// Print the structure of a GLB: node tools/glbinfo.mjs public/models/monkey.glb
import { readFileSync } from "node:fs";
const filename = process.argv[2];
if (!filename) {
  console.error("Usage: node tools/glbinfo.mjs <model.glb>");
  process.exit(1);
}
const b = readFileSync(filename);
if (b.length < 20 || b.toString("ascii", 0, 4) !== "glTF" || b.readUInt32LE(4) !== 2 || b.readUInt32LE(8) !== b.length) {
  throw new Error("Invalid GLB 2 header");
}
const jl = b.readUInt32LE(12);
if (b.readUInt32LE(16) !== 0x4e4f534a || jl % 4 !== 0 || jl > b.length - 20) {
  throw new Error("Invalid GLB JSON chunk");
}
const j = JSON.parse(b.subarray(20, 20 + jl).toString());
const acc = (i) => j.accessors?.[i];
function primitiveTriangles(primitive) {
  const count = acc(primitive.indices ?? primitive.attributes?.POSITION)?.count ?? 0;
  switch (primitive.mode ?? 4) {
    case 4: return Math.floor(count / 3);
    case 5:
    case 6: return Math.max(0, count - 2);
    default: return 0;
  }
}
let tris = 0;
console.log("meshes:");
for (const m of j.meshes ?? []) {
  const p = m.primitives ?? [];
  const t = p.reduce((total, primitive) => total + primitiveTriangles(primitive), 0);
  tris += t;
  console.log(" ", m.name, "prims", p.length, "tris", t, "attrs", Object.keys(p[0]?.attributes ?? {}).join(","), "targets", (m.extras?.targetNames ?? []).join(","));
}
console.log("total tris", tris, "| nodes", j.nodes?.length ?? 0, "| skins", j.skins?.length ?? 0, "joints", j.skins?.[0]?.joints.length ?? 0, "| materials", j.materials?.map((m) => m.name).join(","));
console.log("joints:", j.skins?.[0]?.joints.map((i) => j.nodes?.[i]?.name).join(" "));
console.log("animations:");
for (const a of j.animations ?? []) {
  const input = acc(a.samplers?.[0]?.input);
  console.log(" ", a.name, "channels", a.channels?.length ?? 0, "keys", input?.count ?? 0, "dur", (input?.max?.[0] ?? 0).toFixed(3));
}
const bv = (j.bufferViews ?? []).reduce((total, view) => total + view.byteLength, 0);
console.log("json", jl, "bin", bv);
