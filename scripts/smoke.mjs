import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Core = require('../src/core.js');

const state = Core.createInitialState(12345);
assert.equal(state.version, '0.0.1');
assert.equal(state.contacts.length, 3, 'initial shift should seed three contacts');
assert.equal(state.afterAction, null);

const selected = state.contacts[0];
Core.selectContact(state, selected.id);
assert.equal(state.selectedId, selected.id, 'contact selection should persist');

const beforeConfidence = selected.certainty;
const investigation = Core.investigate(state, selected.id);
assert.equal(investigation.ok, true);
assert.ok(selected.certainty > beforeConfidence, 'investigation should increase confidence');

while (selected.certainty < 0.52) Core.investigate(state, selected.id);
const expected = Core.idealResponse(selected);
const response = Core.respond(state, selected.id, expected);
assert.equal(response.ok, true);
assert.equal(response.result.correct, true, 'ideal response should score as correct');
assert.equal(state.contacts.some((contact) => contact.id === selected.id), false, 'resolved contact should leave active list');
assert.equal(state.resolved.length, 1);

const activeBeforeSpawn = state.contacts.length;
Core.tick(state, 9);
assert.ok(state.contacts.length >= activeBeforeSpawn, 'spawn clock should not reduce active contacts');

state.shiftRemaining = 1;
Core.tick(state, 1);
assert.ok(state.afterAction, 'shift end should create after-action summary');
assert.equal(state.shiftRemaining, 0);
assert.match(state.afterAction.grade, /^[A-D]$/);
assert.equal(Core.investigate(state, state.contacts[0]?.id).ok, false, 'actions should stop after shift completion');

console.log('Blacksite Command smoke: PASS');
