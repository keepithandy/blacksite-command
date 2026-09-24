import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Radar = require('../src/radar-realism.js');

assert.equal(Math.round(Radar.headingFromDelta(0, -1)), 0, 'northbound vector should read heading 000');
assert.equal(Math.round(Radar.headingFromDelta(1, 0)), 90, 'eastbound vector should read heading 090');
assert.equal(Math.round(Radar.headingFromDelta(0, 1)), 180, 'southbound vector should read heading 180');
assert.equal(Math.round(Radar.headingFromDelta(-1, 0)), 270, 'westbound vector should read heading 270');
assert.equal(Radar.vectorLengthFromDelta(0, 0), 9, 'stationary/near-stationary vectors should keep a visible minimum');
assert.ok(Radar.vectorLengthFromDelta(5, 5) <= 34, 'velocity vector length should remain visually bounded');
assert.equal(Radar.ghostReturnCount(0.1, 'online'), 2, 'light clutter should generate only a few ghost returns');
assert.ok(
  Radar.ghostReturnCount(0.1, 'offline') > Radar.ghostReturnCount(0.1, 'online'),
  'offline radar should visually increase ambiguous ghost returns'
);
assert.ok(Radar.ghostReturnCount(0.5, 'offline') <= 10, 'ghost-return count should remain capped');
assert.equal(Radar.angularDistance(359, 1), 2, 'sweep highlight math should wrap cleanly across north');

console.log('Blacksite Command v0.0.4.2 radar effects smoke: PASS');
