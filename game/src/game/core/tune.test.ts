import { DUCKOV_BANDS } from './duckov_bands';
import { tuneObject, tune, tuneGroups, getTune, setTune, resetGroup, exportTune } from './tune';

const assert = { equal(actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}`);
} };

const player = tuneObject('player', { speed: 4.6, custom: 9 }, {
  speed: { min: 0, max: 100, step: 2, label: 'walk' }, custom: { min: 1, max: 20 },
});
assert.equal(player.speed, 4.6);
const speed = tuneGroups().find(group => group.name === 'player')!.keys.get('speed')!;
assert.equal(speed.range.min, DUCKOV_BANDS['player.speed'].min);
assert.equal(speed.range.max, DUCKOV_BANDS['player.speed'].max);
assert.equal(speed.range.step, DUCKOV_BANDS['player.speed'].step);
assert.equal(speed.range.label, 'walk');
assert.equal(tuneGroups()[0].keys.get('custom')!.range.max, 20);
setTune('player', 'speed', 4);
assert.equal(getTune('player', 'speed'), 4);
resetGroup('player');
assert.equal(player.speed, 4.6);
assert.equal(exportTune(), '{}');
tune('kingpin', 'interval', .22, { min: 0, max: 10 });
assert.equal(getTune('kingpin', 'interval'), .22);
assert.equal(tuneGroups().find(group => group.name === 'kingpin')!.keys.get('interval')!.range.max, DUCKOV_BANDS['kingpin.interval'].max);
console.log('tune: generated bounds, custom ranges, defaults and reset pass');
