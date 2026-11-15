import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const sourcePaths = ['src/game/ai/enemies.ts', 'src/game/ai/boss.ts', 'src/game/combat/combat.ts', 'src/game/combat/weapons.ts', 'src/game/contracts.ts', 'src/game/core/bot.ts', 'src/game/core/botdrive.ts', 'src/game/core/raid.ts', 'src/game/core/save.ts', 'src/game/loot/raidloot.ts', 'src/game/loot/bodies.ts', 'src/game/loot/containers.ts', 'src/game/loot/search.ts', 'src/game/loot/sockets.ts', 'src/game/loot/tables.ts', 'src/game/main.ts', 'src/game/world/buildings.ts', 'src/game/world/grid.ts', 'src/game/world/map/grove.ts'];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export function buildEntry(html) {
  const entry = [...html.matchAll(/<script\b[^>]*>/g)].filter(match => /\btype=["']module["']/.test(match[0])).map(match => match[0].match(/\bsrc=["']\/assets\/(game-[\w-]+\.js)["']/)?.[1]).filter(Boolean);
  assert.equal(entry.length, 1, 'exactly one production game entry in HTML');
  return entry[0];
}

export async function captureBuild(directory, base) {
  const html = await readFile(`${directory}/game.html`, 'utf8');
  const entry = buildEntry(html);
  const response = await fetch(new URL('/game.html', base));
  assert.ok(response.ok, 'preview serves game HTML');
  assert.equal(buildEntry(await response.text()), entry, 'preview HTML matches selected build');
  const bundle = await readFile(`${directory}/assets/${entry}`);
  const served = await fetch(new URL(`/assets/${entry}`, base));
  assert.ok(served.ok, 'preview serves selected bundle');
  assert.equal(digest(Buffer.from(await served.arrayBuffer())), digest(bundle), 'served bundle matches disk');
  const sourceHashes = Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path, digest(await readFile(path))])));
  return { entry, sha256: digest(bundle), sourceHashes };
}
