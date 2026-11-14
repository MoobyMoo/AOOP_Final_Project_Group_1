// Print the structure of a GLB: node tools/glbinfo.mjs public/models/monkey.glb
import { readFileSync } from "node:fs";
const b = readFileSync(process.argv[2]);
const jl = b.readUInt32LE(12), j = JSON.parse(b.subarray(20, 20 + jl).toString());
const acc = (i) => j.accessors[i];
let tris = 0;
console.log("meshes:");
for (const m of j.meshes) { const p = m.primitives; const t = p.reduce((a, q) => a + acc(q.indices).count / 3, 0); tris += t;
  console.log(" ", m.name, "prims", p.length, "tris", t, "attrs", Object.keys(p[0].attributes).join(","), "targets", (m.extras?.targetNames ?? []).join(",")); }
console.log("total tris", tris, "| nodes", j.nodes.length, "| skins", j.skins?.length, "joints", j.skins?.[0]?.joints.length, "| materials", j.materials?.map((m) => m.name).join(","));
console.log("joints:", j.skins?.[0]?.joints.map((i) => j.nodes[i].name).join(" "));
console.log("animations:"); for (const a of j.animations ?? []) { const s = a.samplers[0]; console.log(" ", a.name, "channels", a.channels.length, "keys", acc(s.input).count, "dur", acc(s.input).max[0].toFixed(3)); }
const bv = j.bufferViews.reduce((a, v) => a + v.byteLength, 0); console.log("json", jl, "bin", bv);
