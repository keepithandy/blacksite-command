import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Core = require('../src/core.js');

const state = Core.createInitialState(12345);
assert.equal(state.version, '0.0.3');
assert.equal(state.contacts.length, 3, 'initial shift should seed three contacts');
assert.equal(state.caseFiles.length, 0, 'new profile should start with an empty archive');
assert.equal(Core.SENSOR_TYPES.length, 4, 'sensor network should expose four source types');
assert.equal(state.sensorNetwork.length, Core.SECTORS.length * 3, 'each sector should have radar, sigint and ground nodes');
assert.ok(Core.SECTORS.includes(state.satellitePass.sector), 'satellite pass should target a valid sector');
assert.equal(state.afterAction, null);

const selected = state.contacts[0];
Core.selectContact(state, selected.id);
assert.equal(state.selectedId, selected.id, 'contact selection should persist');
assert.ok(Core.uniqueSensorSources(selected).length >= 1, 'contact acquisition should include at least one source');
assert.equal(Core.contactMatchesSensor(selected, 'ALL'), true);
assert.equal(
  Core.contactMatchesSensor(selected, Core.uniqueSensorSources(selected)[0]),
  true,
  'sensor filter should match a recorded contact source'
);

let attempts = 0;
while (Core.uniqueSensorSources(selected).length < 2 && attempts < 20) {
  const investigation = Core.investigate(state, selected.id);
  assert.equal(investigation.ok, true);
  attempts += 1;
}
assert.ok(Core.uniqueSensorSources(selected).length >= 2, 'correlation should acquire a second independent source');

while (selected.certainty < 0.56 && attempts < 40) {
  Core.investigate(state, selected.id);
  attempts += 1;
}

const incident = Core.getIncidentForContact(state, selected.id);
assert.ok(incident, 'two-source correlated contact should open an incident');
assert.equal(incident.stageIndex, 1, 'new incident should enter correlation stage');

while ((selected.certainty < 0.78 || Core.uniqueSensorSources(selected).length < 3) && attempts < 80) {
  Core.investigate(state, selected.id);
  attempts += 1;
}
assert.ok(Core.uniqueSensorSources(selected).length >= 3, 'assessment should require multi-source fusion');
assert.equal(incident.stageIndex, 2, 'high-confidence three-source incident should advance to assessment');
assert.equal(Core.getCorrelationQuality(selected), 'multi-source');

const expected = Core.idealResponse(selected);
const response = Core.respond(state, selected.id, expected);
assert.equal(response.ok, true);
assert.equal(response.result.correct, true, 'ideal response should score as correct');
assert.equal(response.incident.stageIndex, 3, 'resolved incident should reach resolution stage');
assert.ok(response.caseFile.sensorSources.length >= 3, 'case file should retain sensor provenance');
assert.equal(state.caseFiles.length, 1);

const sensor = state.sensorNetwork[0];
const effectBefore = Core.getSensorEffectiveness(state, sensor.sector, sensor.type);
const outage = Core.setSensorStatus(state, sensor.id, 'offline', 5);
assert.equal(outage.ok, true);
assert.equal(Core.getSensorEffectiveness(state, sensor.sector, sensor.type), 0, 'offline sensor should provide no effectiveness');
Core.tick(state, 5);
assert.equal(sensor.status, 'online', 'sensor should recover after outage duration');
assert.ok(Core.getSensorEffectiveness(state, sensor.sector, sensor.type) > 0);
assert.ok(effectBefore > 0);

const weatherEvent = Core.triggerWeatherEvent(state);
assert.ok(Core.SECTORS.includes(weatherEvent.sector));
assert.notEqual(state.sectorWeather[weatherEvent.sector], weatherEvent.previous, 'weather event should change sector conditions');

const exported = Core.exportCaseFiles(state);
const restored = Core.createInitialState(54321, exported);
assert.equal(restored.caseFiles.length, 1, 'new shift should import prior case archive');
assert.deepEqual(restored.caseFiles[0].sensorSources, state.caseFiles[0].sensorSources, 'sensor provenance should persist');

const passBefore = restored.satellitePass.sector;
const cycleSeconds = restored.satellitePass.remaining + restored.satellitePass.nextIn + 25;
Core.tick(restored, cycleSeconds);
assert.ok(Core.SECTORS.includes(restored.satellitePass.sector), 'satellite cycle should remain on valid sectors');
assert.ok(restored.satellitePass.remaining >= 0);
assert.ok(restored.satellitePass.nextIn >= 0);
assert.ok(passBefore);

restored.shiftRemaining = 1;
Core.tick(restored, 1);
assert.ok(restored.afterAction, 'shift end should create after-action summary');
assert.equal(restored.shiftRemaining, 0);
assert.match(restored.afterAction.grade, /^[A-D]$/);
assert.equal(Core.investigate(restored, restored.contacts[0]?.id).ok, false, 'actions should stop after shift completion');

console.log('Blacksite Command v0.0.3 sensor smoke: PASS');
