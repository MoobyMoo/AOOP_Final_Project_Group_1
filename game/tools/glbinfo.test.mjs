import { after, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const directory = mkdtempSync(join(tmpdir(), "bananaville-glbinfo-"));
const filename = join(directory, "fixture.glb");
const inspector = fileURLToPath(new URL("./glbinfo.mjs", import.meta.url));
after(() => {
  if (existsSync(filename)) unlinkSync(filename);
  rmdirSync(directory);
});

function inspect(model) {
  const json = Buffer.from(JSON.stringify({ asset: { version: "2.0" }, ...model }));
  const length = Math.ceil(json.length / 4) * 4;
  const buffer = Buffer.alloc(20 + length);
  buffer.write("glTF", 0);
  buffer.writeUInt32LE(2, 4);
  buffer.writeUInt32LE(buffer.length, 8);
  buffer.writeUInt32LE(length, 12);
  buffer.writeUInt32LE(0x4e4f534a, 16);
  buffer.fill(0x20, 20);
  json.copy(buffer, 20);
  writeFileSync(filename, buffer);
  return spawnSync(process.execPath, [inspector, filename], { encoding: "utf8" });
}

test("counts indexed and non-indexed triangle lists", () => {
  const result = inspect({
    accessors: [{ componentType: 5126, type: "VEC3", count: 6 }, { componentType: 5123, type: "SCALAR", count: 3 }],
    meshes: [{ name: "Mixed", primitives: [{ attributes: { POSITION: 0 } }, { attributes: { POSITION: 0 }, indices: 1 }] }],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Mixed prims 2 tris 3/);
  assert.match(result.stdout, /total tris 3/);
});

test("counts triangle strips and fans while ignoring line primitives", () => {
  const result = inspect({
    accessors: [{ componentType: 5126, type: "VEC3", count: 5 }],
    meshes: [{ primitives: [
      { attributes: { POSITION: 0 }, mode: 5 },
      { attributes: { POSITION: 0 }, mode: 6 },
      { attributes: { POSITION: 0 }, mode: 1 },
    ] }],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /total tris 6/);
});

test("accepts a valid empty scene with optional collections omitted", () => {
  const result = inspect({ scenes: [{}], scene: 0 });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /total tris 0 \| nodes 0 \| skins 0 joints 0/);
  assert.match(result.stdout, /bin 0/);
});

test("rejects an invalid GLB header with a specific error", () => {
  writeFileSync(filename, "invalid");
  const result = spawnSync(process.execPath, [inspector, filename], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Invalid GLB 2 header/);
});

test("explains the required command argument", () => {
  const result = spawnSync(process.execPath, [inspector], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Usage: node tools\/glbinfo\.mjs/);
});
