import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Core = require('../src/core.js');

const state = Core.createInitialState(12345);
assert.equal(state.version, '0.0.2');
assert.equal(state.contacts.length, 3, 'initial shift should seed three contacts');
assert.equal(state.caseFiles.length, 0, 'new profile should start with an empty archive');
assert.equal(state.afterAction, null);

const selected = state.contacts[0];
Core.selectContact(state, selected.id);
assert.equal(state.selectedId, selected.id, 'contact selection should persist');

while (selected.certainty < 0.56) {
  const investigation = Core.investigate(state, selected.id);
  assert.equal(investigation.ok, true);
}

const incident = Core.getIncidentForContact(state, selected.id);
assert.ok(incident, 'correlated contact should open an incident');
assert.equal(incident.stageIndex, 1, 'new incident should enter correlation stage');
assert.deepEqual(
  incident.history.map((entry) => entry.name),
  ['Acquisition', 'Correlation'],
  'incident history should preserve acquisition and correlation'
);

while (selected.certainty < 0.78) Core.investigate(state, selected.id);
assert.equal(incident.stageIndex, 2, 'high-confidence incident should advance to assessment');
assert.equal(incident.history.at(-1).name, 'Assessment');

const expected = Core.idealResponse(selected);
const response = Core.respond(state, selected.id, expected);
assert.equal(response.ok, true);
assert.equal(response.result.correct, true, 'ideal response should score as correct');
assert.equal(response.incident.stageIndex, 3, 'resolved incident should reach resolution stage');
assert.equal(response.incident.status, 'closed');
assert.equal(response.caseFile.id, incident.id, 'resolution should generate a case file');
assert.equal(state.contacts.some((contact) => contact.id === selected.id), false, 'resolved contact should leave active list');
assert.equal(state.resolved.length, 1);
assert.equal(state.caseFiles.length, 1);
assert.equal(state.caseFiles[0].stages.at(-1).name, 'Resolution');

const exported = Core.exportCaseFiles(state);
assert.deepEqual(exported, state.caseFiles, 'archive export should preserve case file data');
exported[0].callsign = 'MUTATED';
assert.notEqual(state.caseFiles[0].callsign, 'MUTATED', 'archive export should not expose mutable state references');

const restored = Core.createInitialState(54321, Core.exportCaseFiles(state));
assert.equal(restored.caseFiles.length, 1, 'new shift should import prior case archive');
assert.equal(restored.caseFiles[0].id, incident.id);

const nextContact = restored.contacts[0];
while (nextContact.certainty < 0.56) Core.investigate(restored, nextContact.id);
const nextIncident = Core.getIncidentForContact(restored, nextContact.id);
assert.notEqual(nextIncident.id, incident.id, 'incident ids should continue beyond archived cases');

const activeBeforeSpawn = restored.contacts.length;
Core.tick(restored, 9);
assert.ok(restored.contacts.length >= activeBeforeSpawn, 'spawn clock should not reduce active contacts');

restored.shiftRemaining = 1;
Core.tick(restored, 1);
assert.ok(restored.afterAction, 'shift end should create after-action summary');
assert.equal(restored.shiftRemaining, 0);
assert.match(restored.afterAction.grade, /^[A-D]$/);
assert.equal(Core.investigate(restored, restored.contacts[0]?.id).ok, false, 'actions should stop after shift completion');

console.log('Blacksite Command smoke: PASS');
