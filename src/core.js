(function (global, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.BlacksiteCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '0.0.1';
  const SHIFT_SECONDS = 5 * 60;
  const MAX_CONTACTS = 6;
  const SPAWN_EVERY_SECONDS = 9;
  const RESPONSES = Object.freeze({
    OBSERVE: 'observe',
    SHADOW: 'shadow',
    CONTAIN: 'contain'
  });

  const CALLSIGNS = ['KITE', 'EMBER', 'MOTH', 'VANTA', 'LARK', 'GHOST', 'CINDER', 'ROOK'];
  const SECTORS = ['NORTH RIDGE', 'DRY LAKE', 'ECHO VALLEY', 'WEST RANGE', 'SALT FLATS'];
  const SIGNALS = ['burst telemetry', 'narrowband ping', 'encrypted voice', 'transponder mismatch', 'silent track'];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function nextRandom(state) {
    state.rngSeed = (Math.imul(state.rngSeed, 1664525) + 1013904223) >>> 0;
    return state.rngSeed / 4294967296;
  }

  function pick(state, values) {
    return values[Math.floor(nextRandom(state) * values.length)];
  }

  function addFeed(state, text, level) {
    state.feed.unshift({
      id: `${state.elapsed}-${state.feedSerial++}`,
      at: state.elapsed,
      level: level || 'info',
      text
    });
    if (state.feed.length > 40) state.feed.length = 40;
  }

  function classifyThreat(threat) {
    if (threat >= 0.72) return 'high';
    if (threat >= 0.4) return 'medium';
    return 'low';
  }

  function createContact(state) {
    const id = `C-${String(++state.contactSerial).padStart(3, '0')}`;
    const callsign = `${pick(state, CALLSIGNS)}-${10 + Math.floor(nextRandom(state) * 89)}`;
    const contact = {
      id,
      callsign,
      sector: pick(state, SECTORS),
      signal: pick(state, SIGNALS),
      x: 8 + nextRandom(state) * 84,
      y: 10 + nextRandom(state) * 78,
      vx: (nextRandom(state) - 0.5) * 1.7,
      vy: (nextRandom(state) - 0.5) * 1.4,
      threat: 0.12 + nextRandom(state) * 0.82,
      certainty: 0.25 + nextRandom(state) * 0.28,
      age: 0,
      investigations: 0,
      status: 'unclassified'
    };
    state.contacts.push(contact);
    addFeed(state, `${id} acquired in ${contact.sector}: ${contact.signal}.`, 'contact');
    return contact;
  }

  function createInitialState(seed) {
    const state = {
      version: VERSION,
      rngSeed: Number.isFinite(seed) ? seed >>> 0 : 0x51f15e,
      shiftRemaining: SHIFT_SECONDS,
      elapsed: 0,
      score: 0,
      spawnClock: 0,
      contactSerial: 0,
      feedSerial: 0,
      contacts: [],
      resolved: [],
      feed: [],
      selectedId: null,
      afterAction: null
    };

    addFeed(state, 'VEIL command station online. Monitoring only until an action is explicitly selected.', 'system');
    for (let index = 0; index < 3; index += 1) createContact(state);
    return state;
  }

  function getContact(state, id) {
    return state.contacts.find((contact) => contact.id === id) || null;
  }

  function selectContact(state, id) {
    state.selectedId = getContact(state, id) ? id : null;
    return state.selectedId;
  }

  function investigate(state, id) {
    if (state.afterAction) return { ok: false, reason: 'shift-complete' };
    const contact = getContact(state, id);
    if (!contact) return { ok: false, reason: 'contact-unavailable' };

    contact.investigations += 1;
    contact.certainty = clamp(contact.certainty + 0.18 + nextRandom(state) * 0.1, 0, 1);
    if (contact.certainty >= 0.78) contact.status = `${classifyThreat(contact.threat)}-risk confirmed`;
    else if (contact.certainty >= 0.56) contact.status = 'correlated';
    else contact.status = 'partial correlation';

    state.score += 1;
    addFeed(state, `${contact.id} correlation updated: ${Math.round(contact.certainty * 100)}% confidence.`, 'intel');
    return { ok: true, contact };
  }

  function idealResponse(contact) {
    if (contact.threat >= 0.72) return RESPONSES.CONTAIN;
    if (contact.threat >= 0.4) return RESPONSES.SHADOW;
    return RESPONSES.OBSERVE;
  }

  function respond(state, id, response) {
    if (state.afterAction) return { ok: false, reason: 'shift-complete' };
    if (!Object.values(RESPONSES).includes(response)) return { ok: false, reason: 'invalid-response' };

    const contact = getContact(state, id);
    if (!contact) return { ok: false, reason: 'contact-unavailable' };
    if (contact.certainty < 0.52) {
      addFeed(state, `${contact.id} response withheld: confidence below 52%.`, 'warn');
      return { ok: false, reason: 'insufficient-confidence' };
    }

    const expected = idealResponse(contact);
    const correct = expected === response;
    const points = correct ? 8 : -4;
    state.score += points;

    const result = {
      ...contact,
      response,
      expected,
      correct,
      points,
      resolvedAt: state.elapsed
    };

    state.resolved.unshift(result);
    state.contacts = state.contacts.filter((entry) => entry.id !== id);
    if (state.selectedId === id) state.selectedId = null;

    addFeed(
      state,
      `${contact.id} resolved with ${response.toUpperCase()}: ${correct ? 'assessment matched' : `review expected ${expected.toUpperCase()}`}.`,
      correct ? 'success' : 'warn'
    );
    return { ok: true, result };
  }

  function moveContacts(state, seconds) {
    state.contacts.forEach((contact) => {
      contact.age += seconds;
      contact.x += contact.vx * seconds;
      contact.y += contact.vy * seconds;
      if (contact.x < 4 || contact.x > 96) contact.vx *= -1;
      if (contact.y < 6 || contact.y > 94) contact.vy *= -1;
      contact.x = clamp(contact.x, 4, 96);
      contact.y = clamp(contact.y, 6, 94);
    });
  }

  function finalizeShift(state) {
    if (state.afterAction) return state.afterAction;
    const correct = state.resolved.filter((entry) => entry.correct).length;
    const total = state.resolved.length;
    const accuracy = total ? correct / total : 0;
    const grade = state.score >= 30 && accuracy >= 0.75 ? 'A' : state.score >= 18 && accuracy >= 0.6 ? 'B' : state.score >= 8 ? 'C' : 'D';
    state.afterAction = {
      score: state.score,
      grade,
      resolved: total,
      correct,
      accuracy
    };
    state.selectedId = null;
    addFeed(state, `Shift complete. Grade ${grade}. ${correct}/${total || 0} responses matched assessment.`, 'system');
    return state.afterAction;
  }

  function tick(state, seconds) {
    if (state.afterAction) return state;
    const delta = Number.isFinite(seconds) ? Math.max(0, seconds) : 1;
    if (!delta) return state;

    const activeDelta = Math.min(delta, state.shiftRemaining);
    state.elapsed += activeDelta;
    state.shiftRemaining = Math.max(0, state.shiftRemaining - activeDelta);
    state.spawnClock += activeDelta;
    moveContacts(state, activeDelta);

    while (state.spawnClock >= SPAWN_EVERY_SECONDS && state.contacts.length < MAX_CONTACTS && state.shiftRemaining > 0) {
      state.spawnClock -= SPAWN_EVERY_SECONDS;
      createContact(state);
    }

    if (state.shiftRemaining <= 0) finalizeShift(state);
    return state;
  }

  function formatClock(seconds) {
    const safe = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(safe / 60);
    const remainder = safe % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  }

  return {
    VERSION,
    SHIFT_SECONDS,
    RESPONSES,
    createInitialState,
    createContact,
    selectContact,
    investigate,
    respond,
    tick,
    finalizeShift,
    getContact,
    idealResponse,
    formatClock
  };
});
