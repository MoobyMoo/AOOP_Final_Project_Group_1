import { rolldown } from 'rolldown';

let source;
export async function installFixtureLedger(page) {
  if (!source) {
    const bundle = await rolldown({ input: 'isolated-fixture', plugins: [{
      name: 'isolated-fixture',
      resolveId(id) { if (id === 'isolated-fixture') return id; },
      load(id) {
        if (id !== 'isolated-fixture') return;
        return `
          import { beginRaid } from '${process.cwd()}/src/game/core/settlement.ts';
          import { own, itemType } from '${process.cwd()}/src/game/loot/instances.ts';
          export { itemType };
          export function begin(game) {
            game.pack = game.pack.map(own);
            game.gear = Object.fromEntries(Object.entries(game.gear).map(([slot, item]) => [slot, item ? own(item) : null]));
            for (const enemy of game.enemies) {
              enemy.carry = enemy.carry.map(own); enemy.stolen = enemy.stolen.map(own);
              if (enemy.gear) for (const slot of Object.keys(enemy.gear)) if (enemy.gear[slot]) enemy.gear[slot] = own(enemy.gear[slot]);
            }
            const save = { ...game.save, ammo: game.ammo + game.mag };
            delete save.activeRaid;
            game.save = beginRaid(save, 'fixture-' + crypto.randomUUID(), game.pack, game.gear);
          }
        `;
      },
    }] });
    try { source = (await bundle.generate({ format: 'iife', name: 'FixtureLedger' })).output[0].code; }
    finally { await bundle.close(); }
  }
  await page.addScriptTag({ content: source });
}
