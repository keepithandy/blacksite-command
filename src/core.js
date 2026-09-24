(function (global, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.BlacksiteCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '0.0.2';
  const SHIFT_SECONDS = 5 * 60;
  const MAX_CONTACTS = 6;
  const MAX_CASE_FILES = 50;
  const SPAWN_EVERY_SECONDS = 9;
  const RESPONSES = Object.freeze({
    OBSERVE: 'observe',
    SHADOW: 'shadow',
    CONTAIN: 'contain'
  });
  const INCIDENT_STAGES = Object.freeze([
    'Acquisition',
    'Correlation',
    'Assessment',
    'Resolution'
  ]);

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

  function normalizeCaseFile(entry) {
    if (!entry || typeof entry !== 'object') return null;
    if (typeof entry.id !== 'string' || !/^INC-\d{4,}$/.test(entry.id)) return null;
    return {
      id: entry.id,
      contactId: String(entry.contactId || 'UNKNOWN'),
      callsign: String(entry.callsign || 'UNKNOWN'),
      sector: String(entry.sector || 'UNKNOWN'),
      signal: String(entry.signal || 'unknown'),
      risk: ['low', 'medium', 'high'].includes(entry.risk) ? entry.risk : 'low',
      confidence: clamp(Number(entry.confidence) || 0, 0, 100),
      response: Object.values(RESPONSES).includes(entry.response) ? entry.response : RESPONSES.OBSERVE,
      expected: Object.values(RESPONSES).includes(entry.expected) ? entry.expected : RESPONSES.OBSERVE,
      correct: Boolean(entry.correct),
      points: Number.isFinite(Number(entry.points)) ? Number(entry.points) : 0,
      openedAt: Math.max(0, Number(entry.openedAt) || 0),
      closedAt: Math.max(0, Number(entry.closedAt) || 0),
      duration: Math.max(0, Number(entry.duration) || 0),
      stages: Array.isArray(entry.stages)
        ? entry.stages.slice(0, INCIDENT_STAGES.length).map((stage) => ({
            name: INCIDENT_STAGES.includes(stage?.name) ? stage.name : 'Acquisition',
            at: Math.max(0, Number(stage?.at) || 0),
            note: String(stage?.note || '')
          }))
        : [],
      status: 'closed'
    };
  }

  function incidentSerialFromCaseFiles(caseFiles) {
    return caseFiles.reduce((highest, entry) => {
      const serial = Number.parseInt(entry.id.slice(4), 10);
      return Number.isFinite(serial) ? Math.max(highest, serial) : highest;
    }, 0);
  }

  function importCaseFiles(state, entries) {
    const normalized = Array.isArray(entries)
      ? entries.map(normalizeCaseFile).filter(Boolean).slice(0, MAX_CASE_FILES)
      : [];
    state.caseFiles = normalized;
    state.incidentSerial = Math.max(state.incidentSerial || 0, incidentSerialFromCaseFiles(normalized));
    return state.caseFiles;
  }

  function exportCaseFiles(state) {
    return state.caseFiles.map((entry) => ({
      ...entry,
      stages: entry.stages.map((stage) => ({ ...stage }))
    }));
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
      acquiredAt: state.elapsed,
      investigations: 0,
      incidentId: null,
      status: 'unclassified'
    };
    state.contacts.push(contact);
    addFeed(state, `${id} acquired in ${contact.sector}: ${contact.signal}.`, 'contact');
    return contact;
  }

  function createInitialState(seed, caseFiles) {
    const state = {
      version: VERSION,
      rngSeed: Number.isFinite(seed) ? seed >>> 0 : 0x51f15e,
      shiftRemaining: SHIFT_SECONDS,
      elapsed: 0,
      score: 0,
      spawnClock: 0,
      contactSerial: 0,
      incidentSerial: 0,
      feedSerial: 0,
      contacts: [],
      incidents: [],
      resolved: [],
      caseFiles: [],
      feed: [],
      selectedId: null,
      afterAction: null
    };

    importCaseFiles(state, caseFiles);
    addFeed(state, 'VEIL command station online. Monitoring only until an action is explicitly selected.', 'system');
    for (let index = 0; index < 3; index += 1) createContact(state);
    return state;
  }

  function getContact(state, id) {
    return state.contacts.find((contact) => contact.id === id) || null;
  }

  function getIncident(state, id) {
    return state.incidents.find((incident) => incident.id === id) || null;
  }

  function getIncidentForContact(state, contactId) {
    return state.incidents.find((incident) => incident.contactId === contactId) || null;
  }

  function selectContact(state, id) {
    state.selectedId = getContact(state, id) ? id : null;
    return state.selectedId;
  }

  function pushIncidentStage(incident, stageIndex, at, note) {
    if (stageIndex <= incident.stageIndex) return false;
    incident.stageIndex = stageIndex;
    incident.updatedAt = at;
    incident.history.push({
      name: INCIDENT_STAGES[stageIndex],
      at,
      note
    });
    return true;
  }

  function openIncident(state, contact, reason) {
    const existing = getIncidentForContact(state, contact.id);
    if (existing) return existing;

    const id = `INC-${String(++state.incidentSerial).padStart(4, '0')}`;
    const incident = {
      id,
      contactId: contact.id,
      callsign: contact.callsign,
      sector: contact.sector,
      signal: contact.signal,
      openedAt: contact.acquiredAt,
      updatedAt: state.elapsed,
      stageIndex: 1,
      status: 'active',
      history: [
        {
          name: INCIDENT_STAGES[0],
          at: contact.acquiredAt,
          note: `${contact.id} acquired in ${contact.sector}.`
        },
        {
          name: INCIDENT_STAGES[1],
          at: state.elapsed,
          note: reason || 'Independent sources correlated.'
        }
      ]
    };
    contact.incidentId = id;
    state.incidents.unshift(incident);
    addFeed(state, `${id} opened for ${contact.id}: correlation threshold reached.`, 'incident');
    return incident;
  }

  function syncIncidentStage(state, contact) {
    let incident = getIncidentForContact(state, contact.id);
    if (!incident && contact.certainty >= 0.56) {
      incident = openIncident(state, contact, 'Independent sources correlated.');
    }

    if (incident && contact.certainty >= 0.78 && incident.stageIndex < 2) {
      pushIncidentStage(
        incident,
        2,
        state.elapsed,
        `${classifyThreat(contact.threat).toUpperCase()}-risk assessment confirmed at ${Math.round(contact.certainty * 100)}% confidence.`
      );
      addFeed(state, `${incident.id} advanced to ASSESSMENT.`, 'incident');
    }

    return incident;
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
    const incident = syncIncidentStage(state, contact);
    addFeed(state, `${contact.id} correlation updated: ${Math.round(contact.certainty * 100)}% confidence.`, 'intel');
    return { ok: true, contact, incident };
  }

  function idealResponse(contact) {
    if (contact.threat >= 0.72) return RESPONSES.CONTAIN;
    if (contact.threat >= 0.4) return RESPONSES.SHADOW;
    return RESPONSES.OBSERVE;
  }

  function createCaseFile(state, contact, incident, result) {
    const stages = incident.history.map((stage) => ({ ...stage }));
    const caseFile = {
      id: incident.id,
      contactId: contact.id,
      callsign: contact.callsign,
      sector: contact.sector,
      signal: contact.signal,
      risk: classifyThreat(contact.threat),
      confidence: Math.round(contact.certainty * 100),
      response: result.response,
      expected: result.expected,
      correct: result.correct,
      points: result.points,
      openedAt: incident.openedAt,
      closedAt: state.elapsed,
      duration: Math.max(0, state.elapsed - incident.openedAt),
      stages,
      status: 'closed'
    };
    state.caseFiles.unshift(caseFile);
    if (state.caseFiles.length > MAX_CASE_FILES) state.caseFiles.length = MAX_CASE_FILES;
    return caseFile;
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

    let incident = syncIncidentStage(state, contact);
    if (!incident) {
      incident = openIncident(state, contact, 'Operator decision promoted contact to incident.');
    }

    const expected = idealResponse(contact);
    const correct = expected === response;
    const points = correct ? 8 : -4;
    state.score += points;

    pushIncidentStage(
      incident,
      3,
      state.elapsed,
      `${response.toUpperCase()} ordered; expected disposition ${expected.toUpperCase()}.`
    );
    incident.status = 'closed';
    incident.resolution = {
      response,
      expected,
      correct,
      points
    };

    const result = {
      ...contact,
      incidentId: incident.id,
      response,
      expected,
      correct,
      points,
      resolvedAt: state.elapsed
    };

    state.resolved.unshift(result);
    const caseFile = createCaseFile(state, contact, incident, result);
    state.contacts = state.contacts.filter((entry) => entry.id !== id);
    if (state.selectedId === id) state.selectedId = null;

    addFeed(
      state,
      `${incident.id} resolved with ${response.toUpperCase()}: ${correct ? 'assessment matched' : `review expected ${expected.toUpperCase()}`}.`,
      correct ? 'success' : 'warn'
    );
    return { ok: true, result, incident, caseFile };
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
      accuracy,
      archivedCases: state.caseFiles.length
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
    INCIDENT_STAGES,
    createInitialState,
    createContact,
    selectContact,
    investigate,
    respond,
    tick,
    finalizeShift,
    getContact,
    getIncident,
    getIncidentForContact,
    idealResponse,
    importCaseFiles,
    exportCaseFiles,
    formatClock
  };
});
