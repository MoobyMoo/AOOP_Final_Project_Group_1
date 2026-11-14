// Map v3 blockout check without a browser: node tools/mapdump.mjs [out.svg]
// Bundles src/game/world/map/dump.ts (map data + grid + the building stub), prints the lint report and writes a
// top-down SVG of the outline, zones, roads, colliders, gates and sockets. Exits 1 if the lint has errors.
import { writeFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { rolldown } from "rolldown";
const out = process.argv[2] ?? "/tmp/mapv3/blockout.svg";
const bundle = await rolldown({ input: "src/game/world/map/dump.ts", platform: "node", logLevel: "silent" });
const { output } = await bundle.generate({ format: "esm" }); await bundle.close();
globalThis.__seed = Number(process.env.SEED ?? 4242); // world seed for the scatter (SEED=n node tools/mapdump.mjs)
globalThis.location ??= { search: "" }; // render/shading.ts reads the query string at import
const log = console.log; let text = ""; console.log = (s) => { text += s; };
mkdirSync("/tmp/mapv3", { recursive: true }); writeFileSync("/tmp/mapv3/dump.bundle.mjs", output[0].code);
try { await import(pathToFileURL("/tmp/mapv3/dump.bundle.mjs").href + "?" + Date.now()); } catch (e) { console.log = log; log(text); throw e; }
console.log = log; log(text);
writeFileSync(out, globalThis.__svg); log("wrote", out);
process.exit(JSON.parse(text).errors.length ? 1 : 0);
