import { CONTAINERS, rollContainer, searchSeconds, demoContainerType } from "./containers";
import { createSearch, advanceSearch, take, takeAll } from "./search";
import { bodyContents, bodySearch, seedEnemyInventory } from "./bodies";
import { mulberry32, ITEMS } from "./tables";
import { demoRaidLoot } from './demo-economy';
import { instanceBody, itemType, instanceId } from "./instances";

let checks = 0;
function check(value: unknown, message: string): asserts value {
  checks++;
  if (!value) throw new Error(message);
}
for (const type of Object.keys(CONTAINERS) as (keyof typeof CONTAINERS)[]) {
  const definition = CONTAINERS[type];
  for (let seed = 0; seed < 200; seed++) {
    const items = rollContainer(type, mulberry32(seed));
    check(items.length >= definition.count[0] && items.length <= definition.count[1], `${type} item count`);
    check(items.every(item => Object.hasOwn(definition.pool, item) && ITEMS[item]), `${type} pool only`);
    check(JSON.stringify(items) === JSON.stringify(rollContainer(type, mulberry32(seed))), `${type} deterministic`);
  }
  check(definition.placements.length > 0, `${type} placement suggestions`);
}
check(JSON.stringify([0, 1, 2, 3, 4, 5, 6].map(searchSeconds)) === '[1,1,1,1,1.5,2,1]', "quality reveal schedule");
check(searchSeconds(-10) === 1 && searchSeconds(100) === 1 && searchSeconds(5.8) === 2, 'quality indices clamp');
check(demoContainerType({ x: 1, z: 45, in: 'barn' }) === 'parts', 'barn contains parts');
const search = createSearch(['banana', 'banana', 'golden_banana']);
check(take(search, 0) === null && takeAll(search).length === 0, 'hidden contents cannot be taken');
advanceSearch(search, 1.2);
check(itemType(take(search, 0)!) === 'banana' && take(search, 0) === null, 'exactly once per slot');
check(instanceId(search.slots[0].item) !== instanceId(search.slots[1].item), 'identical items have distinct identities');
check(takeAll(search).length === 0, 'second item still hidden');
advanceSearch(search, 10);
check(JSON.stringify(takeAll(search, 1).map(instanceBody)) === '["banana"]', 'capacity and duplicate identity');
check(JSON.stringify(takeAll(search).map(instanceBody)) === '["golden_banana"]' && takeAll(search).length === 0, 'take all drains revealed slots');
advanceSearch(search, -10);
check(search.elapsed >= 0, 'invalid time cannot undo reveals');
const enemy = { kind: 'wild' as const, down: false, gear: { head: 'cap', face: null, body: null, back: null, ears: null }, carry: ['radio_key'], stolen: ['coconut'] };
let rolls = 0;
seedEnemyInventory(enemy, () => { rolls++; return 0; });
const spawnRolls = rolls;
check(bodyContents(enemy).length === 0, 'living enemy is not searchable');
enemy.carry.push('sunset_mango');
enemy.gear.head = 'hardhat#17';
enemy.down = true;
const expected = ['hardhat#17', ...enemy.carry, ...enemy.stolen].map(instanceBody);
check(JSON.stringify(bodyContents(enemy).map(instanceBody)) === JSON.stringify(expected), 'body transfers current worn condition, pockets and stolen items exactly');
check(!bodyContents(enemy).includes('ammo45'), 'boomerang user invents no firearm ammunition');
check(rolls === spawnRolls, 'no RNG at death');
const body = bodySearch(enemy)!;
advanceSearch(body, 100);
check(JSON.stringify(takeAll(body).map(instanceBody)) === JSON.stringify(expected), 'body uses shared take API');
check(bodyContents(enemy).length === 0 && bodySearch(enemy) === body, 'reopening cannot duplicate loot');
check(enemy.carry.length === 0 && enemy.stolen.length === 0 && enemy.gear.head === null, 'ownership transferred out of enemy');
const demo = demoRaidLoot(1, 'hatch');
check(demo.containers === 6 && demo.items.includes('ammo45'), 'demo hatch includes an explicit ammo stop');
check(!demo.items.includes('plantation_seal'), 'first upgrade does not require boss progression');
check(demoRaidLoot(1, 'boss').items.includes('plantation_seal'), 'boss reward is guaranteed');
const gunner = { kind: 'bandit' as const, down: false, carry: [] as string[], stolen: [] as string[] };
seedEnemyInventory(gunner, () => 0.9, { weapon: 'boomerang', ammo: { item: 'ammo45', stacks: 99 }, pockets: [] });
seedEnemyInventory(gunner, () => { throw new Error('inventory seeded twice'); });
check(gunner.carry.filter(item => itemType(item) === 'ammo45').length === 2, 'replenishing AI cannot inflate loot reserve');
gunner.carry.splice(gunner.carry.findIndex(item => itemType(item) === 'ammo45'), 1); gunner.down = true;
check(bodyContents(gunner).filter(item => itemType(item) === 'ammo45').length === 1, 'spent loot reserve is not restored at death');
console.log(`Loot/search: ${checks} checks passed`);
