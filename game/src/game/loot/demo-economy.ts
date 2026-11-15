import { bossPockets } from '../ai/boss';
import { bodyContents, seedEnemyInventory } from './bodies';
import { rollContainer, type ContainerType } from './containers';
import { enemyGear } from './equipment';
import { itemDef, mulberry32, PRICES } from './tables';

export const DEMO_ROUTES: Record<'hatch' | 'cove' | 'boss', readonly ContainerType[]> = {
  hatch: ['food', 'medical', 'ammo', 'parts', 'food', 'parts'],
  cove: ['food', 'medical', 'ammo', 'parts', 'food', 'parts', 'ammo', 'weapon'],
  boss: ['food', 'medical', 'ammo', 'parts', 'food', 'parts', 'ammo', 'weapon', 'medical'],
};
export function demoRaidLoot(seed: number, route: keyof typeof DEMO_ROUTES) {
  const rng = mulberry32(seed);
  const items = DEMO_ROUTES[route].flatMap(type => rollContainer(type, rng));
  for (const [index, kind] of (['wild', 'bandit'] as const).entries()) {
    const enemy = { kind, down: false, gear: enemyGear(seed ^ Math.imul(index + 1, 7), kind), carry: [] as string[], stolen: [] as string[] };
    seedEnemyInventory(enemy, rng); enemy.down = true;
    items.push(...bodyContents(enemy));
  }
  if (route === 'boss') {
    items.push(...bossPockets(rng), 'boomerang', 'leaf_vest');
  }
  const values = items.filter(id => !['ammo', 'key', 'attachment'].includes(itemDef(id).kind)).map(id => itemDef(id).value).sort((left, right) => right - left);
  const rounds = items.filter(id => itemDef(id).kind === 'ammo').reduce((sum, id) => sum + (itemDef(id).stack ?? 1), 0);
  return { items, containers: DEMO_ROUTES[route].length, rounds, value8: values.slice(0, 8).reduce((sum, value) => sum + value, 0), value10: values.slice(0, 10).reduce((sum, value) => sum + value, 0) };
}
export function upgradePacing(median8: number, median10: number) {
  const upgrades = Object.entries(PRICES.upgrades).map(([id, prices]) => ({ id, price: prices[0] })).sort((left, right) => left.price - right.price);
  let balance = 0, bought = 0, raids = 0, pack = false;
  while (bought < upgrades.length && raids < 100) {
    balance += pack ? median10 : median8; raids++;
    while (bought < upgrades.length && balance >= upgrades[bought].price) {
      balance -= upgrades[bought].price;
      if (upgrades[bought].id === 'pack') pack = true;
      bought++;
    }
  }
  return { raids, bought, affordable: upgrades.filter(upgrade => upgrade.price <= median8).length, firstTwo: upgrades[0].price + upgrades[1].price };
}
