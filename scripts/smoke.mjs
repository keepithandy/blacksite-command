import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Core = require('../src/core.js');
const Facility = require('../src/facility.js');
Facility.install(Core);

const state = Core.createInitialState(12345);
assert.equal(state.version, '0.0.4');
assert.equal(Core.VERSION, '0.0.4');
assert.equal(state.contacts.length, 3, 'initial shift should seed three contacts');
assert.equal(state.caseFiles.length, 0, 'new profile should start with an empty archive');
assert.equal(Core.SENSOR_TYPES.length, 4, 'sensor network should expose four source types');
assert.equal(state.sensorNetwork.length, Core.SECTORS.length * 3, 'each sector should have radar, sigint and ground nodes');
assert.equal(Core.getFacilityStatus(state).length, 6, 'facility should expose six station subsystems');
assert.equal(Math.round(Core.getFacilityIntegrity(state)), 100);
assert.equal(Math.round(state.facility.reserve), 100);
assert.equal(state.facility.loadShed, false);
assert.equal(state.afterAction, null);

const selected = state.contacts[0];
Core.selectContact(state, selected.id);
assert.equal(state.selectedId, selected.id, 'contact selection should persist');
assert.ok(Core.uniqueSensorSources(selected).length >= 1, 'contact acquisition should include at least one source');
assert.equal(Core.contactMatchesSensor(selected, 'ALL'), true);

let attempts = 0;
while (Core.uniqueSensorSources(selected).length < 2 && attempts < 20) {
  const investigation = Core.investigate(state, selected.id);
  assert.equal(investigation.ok, true);
  attempts += 1;
}
assert.ok(Core.uniqueSensorSources(selected).length >= 2, 'correlation should acquire a second independent source');

const radarFailure = Core.degradeFacilitySystem(state, 'RADAR_ARRAY', 72, 'offline', 20);
assert.equal(radarFailure.ok, true);
assert.equal(Core.getFacilitySystem(state, 'RADAR_ARRAY').status, 'offline');
assert.ok(Core.getFacilitySensorMultiplier(state, 'RADAR') < 0.18, 'offline radar array should remove radar support');
const radarStatus = Core.getSectorSensorStatus(state, selected.sector).find((sensor) => sensor.type === 'RADAR');
assert.equal(radarStatus.status, 'offline');
assert.equal(radarStatus.effectiveness, 0);

const radarRepair = Core.repairFacilitySystem(state, 'RADAR_ARRAY');
assert.equal(radarRepair.ok, true);
assert.ok(Core.getFacilitySystem(state, 'RADAR_ARRAY').condition > 50);
Core.tick(state, 10);
const secondRadarRepair = Core.repairFacilitySystem(state, 'RADAR_ARRAY');
assert.equal(secondRadarRepair.ok, true);
assert.equal(Core.getFacilitySystem(state, 'RADAR_ARRAY').status, 'online');
assert.ok(Core.getFacilitySensorMultiplier(state, 'RADAR') > 0.7);

Core.degradeFacilitySystem(state, 'POWER', 60, 'offline', 20);
Core.tick(state, 1);
assert.equal(state.facility.loadShed, true, 'power failure should activate load shedding');
assert.ok(state.facility.reserve < 100, 'emergency reserve should drain during power failure');
assert.equal(Core.getFacilitySensorMultiplier(state, 'SATELLITE'), 0, 'load shed should suspend satellite support');
assert.ok(Core.getFacilitySensorMultiplier(state, 'GROUND') <= 0.42, 'load shed should limit ground support');
Core.repairFacilitySystem(state, 'POWER');
Core.tick(state, 1);
assert.equal(Core.getFacilitySystem(state, 'POWER').status, 'online');
assert.equal(state.facility.loadShed, false, 'repairing power should clear load shedding while reserve remains');

Core.degradeFacilitySystem(state, 'COMMS', 80, 'offline', 20);
const blockedInvestigation = Core.investigate(state, selected.id);
assert.equal(blockedInvestigation.ok, false);
assert.equal(blockedInvestigation.reason, 'facility-unavailable');
Core.setFacilitySystemCondition(state, 'COMMS', 100);
Core.setFacilitySystemCondition(state, 'INTEL_SERVERS', 100);

while (selected.certainty < 0.56 && attempts < 50) {
  Core.investigate(state, selected.id);
  attempts += 1;
}
const incident = Core.getIncidentForContact(state, selected.id);
assert.ok(incident, 'two-source correlated contact should open an incident');

while ((selected.certainty < 0.78 || Core.uniqueSensorSources(selected).length < 3) && attempts < 100) {
  Core.investigate(state, selected.id);
  attempts += 1;
}
assert.ok(Core.uniqueSensorSources(selected).length >= 3, 'assessment should require multi-source fusion');
assert.equal(incident.stageIndex, 2, 'high-confidence three-source incident should advance to assessment');

const expected = Core.idealResponse(selected);
const response = Core.respond(state, selected.id, expected);
assert.equal(response.ok, true);
assert.equal(response.result.correct, true, 'ideal response should score as correct');
assert.equal(response.incident.stageIndex, 3, 'resolved incident should reach resolution stage');
assert.ok(response.caseFile.sensorSources.length >= 3, 'case file should retain sensor provenance');
assert.equal(state.caseFiles.length, 1);

const facilityEventCount = state.facility.incidents;
Core.triggerFacilityEvent(state);
assert.equal(state.facility.incidents, facilityEventCount + 1, 'facility event should register an infrastructure incident');

const exported = Core.exportCaseFiles(state);
const restored = Core.createInitialState(54321, exported);
assert.equal(restored.version, '0.0.4');
assert.equal(restored.caseFiles.length, 1, 'new shift should import prior case archive');
assert.equal(Core.getFacilityStatus(restored).length, 6, 'new shifts should initialize fresh facility command state');

restored.shiftRemaining = 1;
Core.tick(restored, 1);
assert.ok(restored.afterAction, 'shift end should create after-action summary');
assert.equal(restored.shiftRemaining, 0);
assert.match(restored.afterAction.grade, /^[A-D]$/);
assert.ok(Number.isFinite(restored.afterAction.facilityIntegrity));
assert.ok(Number.isFinite(restored.afterAction.facilityReserve));
assert.equal(Core.investigate(restored, restored.contacts[0]?.id).ok, false, 'actions should stop after shift completion');

console.log('Blacksite Command v0.0.4 facility smoke: PASS');
