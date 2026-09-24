(function (global, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.BlacksiteCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '0.0.3';
  const SHIFT_SECONDS = 5 * 60;
  const MAX_CONTACTS = 6;
  const MAX_CASE_FILES = 50;
  const SPAWN_EVERY_SECONDS = 9;
  const SENSOR_EVENT_SECONDS = 24;
  const WEATHER_EVENT_SECONDS = 48;
  const SATELLITE_PASS_SECONDS = 14;
  const SATELLITE_GAP_SECONDS = 24;

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
  const SENSOR_TYPES = Object.freeze(['RADAR', 'SIGINT', 'SATELLITE', 'GROUND']);
  const WEATHER_TYPES = Object.freeze(['CLEAR', 'WIND', 'RAIN', 'STORM']);

  const CALLSIGNS = ['KITE', 'EMBER', 'MOTH', 'VANTA', 'LARK', 'GHOST', 'CINDER', 'ROOK'];
  const SECTORS = ['NORTH RIDGE', 'DRY LAKE', 'ECHO VALLEY', 'WEST RANGE', 'SALT FLATS'];
  const SIGNALS = ['burst telemetry', 'narrowband ping', 'encrypted voice', 'transponder mismatch', 'silent track'];

  const WEATHER_SENSOR_MODIFIERS = Object.freeze({
    CLEAR: Object.freeze({ RADAR: 1, SIGINT: 1, SATELLITE: 1, GROUND: 1 }),
    WIND: Object.freeze({ RADAR: 0.96, SIGINT: 0.88, SATELLITE: 0.98, GROUND: 0.82 }),
    RAIN: Object.freeze({ RADAR: 0.82, SIGINT: 0.92, SATELLITE: 0.72, GROUND: 0.78 }),
    STORM: Object.freeze({ RADAR: 0.62, SIGINT: 0.72, SATELLITE: 0.38, GROUND: 0.58 })
  });

  const SENSOR_BASE_RELIABILITY = Object.freeze({
    RADAR: 0.86,
    SIGINT: 0.8,
    SATELLITE: 0.92,
    GROUND: 0.76
  });

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
    if (state.feed.length > 50) state.feed.length = 50;
  }

  function classifyThreat(threat) {
    if (threat >= 0.72) return 'high';
    if (threat >= 0.4) return 'medium';
    return 'low';
  }

  function uniqueSensorSources(contact) {
    return [...new Set((contact.sensorHits || []).map((hit) => hit.type))];
  }

  function getCorrelationQuality(contact) {
    const sourceCount = uniqueSensorSources(contact).length;
    if (sourceCount >= 4) return 'fused';
    if (sourceCount === 3) return 'multi-source';
    if (sourceCount === 2) return 'supported';
    return 'single-source';
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
      sensorSources: Array.isArray(entry.sensorSources)
        ? [...new Set(entry.sensorSources.filter((type) => SENSOR_TYPES.includes(type)))]
        : [],
      correlationQuality: ['single-source', 'supported', 'multi-source', 'fused'].includes(entry.correlationQuality)
        ? entry.correlationQuality
        : 'single-source',
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
      sensorSources: [...entry.sensorSources],
      stages: entry.stages.map((stage) => ({ ...stage }))
    }));
  }

  function createSensorNetwork(state) {
    state.sensorNetwork = [];
    SECTORS.forEach((sector, sectorIndex) => {
      ['RADAR', 'SIGINT', 'GROUND'].forEach((type, typeIndex) => {
        const variance = 0.78 + nextRandom(state) * 0.22;
        state.sensorNetwork.push({
          id: `${type.slice(0, 3)}-${sectorIndex + 1}`,
          type,
          sector,
          coverage: clamp(variance, 0.72, 1),
          status: 'online',
          outageRemaining: 0,
          eventSerial: typeIndex
        });
      });
    });

    state.sectorWeather = {};
    SECTORS.forEach((sector) => {
      state.sectorWeather[sector] = pick(state, WEATHER_TYPES);
    });

    state.satellitePass = {
      sector: pick(state, SECTORS),
      remaining: SATELLITE_PASS_SECONDS,
      nextIn: 0
    };
  }

  function getSensorNode(state, sector, type) {
    if (type === 'SATELLITE') {
      return {
        id: 'SAT-ORBITAL',
        type,
        sector,
        coverage: 1,
        status: state.satellitePass.remaining > 0 && state.satellitePass.sector === sector ? 'online' : 'standby',
        outageRemaining: 0
      };
    }
    return state.sensorNetwork.find((sensor) => sensor.sector === sector && sensor.type === type) || null;
  }

  function sensorStatusMultiplier(status) {
    if (status === 'offline') return 0;
    if (status === 'degraded') return 0.55;
    if (status === 'standby') return 0;
    return 1;
  }

  function getSensorEffectiveness(state, sector, type) {
    const node = getSensorNode(state, sector, type);
    if (!node) return 0;
    const weather = state.sectorWeather[sector] || 'CLEAR';
    return clamp(
      SENSOR_BASE_RELIABILITY[type] *
        node.coverage *
        sensorStatusMultiplier(node.status) *
        WEATHER_SENSOR_MODIFIERS[weather][type],
      0,
      1
    );
  }

  function getSectorSensorStatus(state, sector) {
    return SENSOR_TYPES.map((type) => {
      const node = getSensorNode(state, sector, type);
      return {
        type,
        status: node?.status || 'offline',
        effectiveness: getSensorEffectiveness(state, sector, type)
      };
    });
  }

  function setSensorStatus(state, sensorId, status, duration) {
    if (!['online', 'degraded', 'offline'].includes(status)) {
      return { ok: false, reason: 'invalid-status' };
    }
    const sensor = state.sensorNetwork.find((entry) => entry.id === sensorId);
    if (!sensor) return { ok: false, reason: 'sensor-unavailable' };
    sensor.status = status;
    sensor.outageRemaining = status === 'online' ? 0 : Math.max(1, Number(duration) || 20);
    addFeed(
      state,
      `${sensor.id} ${sensor.sector} ${status.toUpperCase()}${sensor.outageRemaining ? ` for ${sensor.outageRemaining}s` : ''}.`,
      status === 'online' ? 'sensor' : 'warn'
    );
    return { ok: true, sensor };
  }

  function recordSensorHit(state, contact, type, reason) {
    if (contact.sensorHits.some((hit) => hit.type === type)) return null;
    const effectiveness = getSensorEffectiveness(state, contact.sector, type);
    if (effectiveness <= 0) return null;
    const hit = {
      type,
      at: state.elapsed,
      quality: effectiveness,
      weather: state.sectorWeather[contact.sector],
      reason: reason || 'correlation'
    };
    contact.sensorHits.push(hit);
    return hit;
  }

  function seedContactSensors(state, contact) {
    const candidates = SENSOR_TYPES
      .map((type) => ({ type, effectiveness: getSensorEffectiveness(state, contact.sector, type) }))
      .filter((entry) => entry.effectiveness > 0)
      .sort((a, b) => b.effectiveness - a.effectiveness);

    candidates.forEach((candidate, index) => {
      const threshold = index === 0 ? 1 : candidate.effectiveness * (index === 1 ? 0.72 : 0.38);
      if (nextRandom(state) <= threshold) recordSensorHit(state, contact, candidate.type, 'acquisition');
    });

    if (!contact.sensorHits.length && candidates[0]) {
      recordSensorHit(state, contact, candidates[0].type, 'acquisition');
    }
  }

  function correlateSensors(state, contact) {
    const unseen = SENSOR_TYPES
      .filter((type) => !contact.sensorHits.some((hit) => hit.type === type))
      .map((type) => ({ type, effectiveness: getSensorEffectiveness(state, contact.sector, type) }))
      .filter((entry) => entry.effectiveness > 0)
      .sort((a, b) => b.effectiveness - a.effectiveness);

    let added = null;
    for (const candidate of unseen) {
      const chance = 0.35 + candidate.effectiveness * 0.55;
      if (nextRandom(state) <= chance) {
        added = recordSensorHit(state, contact, candidate.type, 'operator-correlation');
        if (added) break;
      }
    }

    const sources = uniqueSensorSources(contact);
    const averageQuality = contact.sensorHits.length
      ? contact.sensorHits.reduce((sum, hit) => sum + hit.quality, 0) / contact.sensorHits.length
      : 0;
    const sourceBonus = Math.max(0, sources.length - 1) * 0.045;
    const confidenceGain = 0.08 + averageQuality * 0.07 + sourceBonus + nextRandom(state) * 0.035;

    return { added, sources, averageQuality, confidenceGain };
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
      certainty: 0.22 + nextRandom(state) * 0.18,
      age: 0,
      acquiredAt: state.elapsed,
      investigations: 0,
      incidentId: null,
      status: 'unclassified',
      sensorHits: []
    };
    seedContactSensors(state, contact);
    const sources = uniqueSensorSources(contact);
    contact.certainty = clamp(contact.certainty + Math.max(0, sources.length - 1) * 0.045, 0, 1);
    state.contacts.push(contact);
    addFeed(
      state,
      `${id} acquired in ${contact.sector}: ${contact.signal}. ${sources.join(' + ') || 'NO'} source.`,
      'contact'
    );
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
      sensorEventClock: 0,
      weatherEventClock: 0,
      contactSerial: 0,
      incidentSerial: 0,
      feedSerial: 0,
      contacts: [],
      incidents: [],
      resolved: [],
      caseFiles: [],
      feed: [],
      selectedId: null,
      afterAction: null,
      sensorNetwork: [],
      sectorWeather: {},
      satellitePass: null
    };

    importCaseFiles(state, caseFiles);
    createSensorNetwork(state);
    addFeed(
      state,
      `VEIL command station online. ${state.satellitePass.sector} satellite pass active. Monitoring only until an action is explicitly selected.`,
      'system'
    );
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

  function contactMatchesSensor(contact, type) {
    if (!type || type === 'ALL') return true;
    return uniqueSensorSources(contact).includes(type);
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

    const sources = uniqueSensorSources(contact);
    if (sources.length < 2) return null;

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
          note: reason || `${sources.join(' + ')} sources correlated.`
        }
      ]
    };
    contact.incidentId = id;
    state.incidents.unshift(incident);
    addFeed(state, `${id} opened for ${contact.id}: ${sources.length} independent sources correlated.`, 'incident');
    return incident;
  }

  function syncIncidentStage(state, contact) {
    const sources = uniqueSensorSources(contact);
    let incident = getIncidentForContact(state, contact.id);
    if (!incident && contact.certainty >= 0.56 && sources.length >= 2) {
      incident = openIncident(state, contact, `${sources.join(' + ')} sources correlated.`);
    }

    if (incident && contact.certainty >= 0.78 && sources.length >= 3 && incident.stageIndex < 2) {
      pushIncidentStage(
        incident,
        2,
        state.elapsed,
        `${classifyThreat(contact.threat).toUpperCase()}-risk assessment confirmed from ${sources.length} sources at ${Math.round(contact.certainty * 100)}% confidence.`
      );
      addFeed(state, `${incident.id} advanced to ASSESSMENT with ${sources.length}-source fusion.`, 'incident');
    }

    return incident;
  }

  function investigate(state, id) {
    if (state.afterAction) return { ok: false, reason: 'shift-complete' };
    const contact = getContact(state, id);
    if (!contact) return { ok: false, reason: 'contact-unavailable' };

    contact.investigations += 1;
    const correlation = correlateSensors(state, contact);
    contact.certainty = clamp(contact.certainty + correlation.confidenceGain, 0, 1);
    const sourceCount = correlation.sources.length;

    if (contact.certainty >= 0.78 && sourceCount >= 3) contact.status = `${classifyThreat(contact.threat)}-risk confirmed`;
    else if (contact.certainty >= 0.56 && sourceCount >= 2) contact.status = 'correlated';
    else if (sourceCount >= 2) contact.status = 'multi-source partial';
    else contact.status = 'single-source partial';

    state.score += 1;
    const incident = syncIncidentStage(state, contact);
    const sourceText = correlation.added
      ? `${correlation.added.type} added`
      : `${sourceCount} source${sourceCount === 1 ? '' : 's'} retained`;
    addFeed(
      state,
      `${contact.id} correlation: ${sourceText}; ${Math.round(contact.certainty * 100)}% confidence.`,
      'intel'
    );
    return { ok: true, contact, incident, correlation };
  }

  function idealResponse(contact) {
    if (contact.threat >= 0.72) return RESPONSES.CONTAIN;
    if (contact.threat >= 0.4) return RESPONSES.SHADOW;
    return RESPONSES.OBSERVE;
  }

  function createCaseFile(state, contact, incident, result) {
    const stages = incident.history.map((stage) => ({ ...stage }));
    const sources = uniqueSensorSources(contact);
    const caseFile = {
      id: incident.id,
      contactId: contact.id,
      callsign: contact.callsign,
      sector: contact.sector,
      signal: contact.signal,
      risk: classifyThreat(contact.threat),
      confidence: Math.round(contact.certainty * 100),
      sensorSources: sources,
      correlationQuality: getCorrelationQuality(contact),
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
    const sources = uniqueSensorSources(contact);
    if (contact.certainty < 0.52 || sources.length < 2) {
      addFeed(
        state,
        `${contact.id} response withheld: requires 52% confidence and two independent sensor sources.`,
        'warn'
      );
      return { ok: false, reason: sources.length < 2 ? 'insufficient-sources' : 'insufficient-confidence' };
    }

    let incident = syncIncidentStage(state, contact);
    if (!incident) {
      incident = openIncident(state, contact, `${sources.join(' + ')} sources correlated for operator decision.`);
    }
    if (!incident) return { ok: false, reason: 'incident-unavailable' };

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
      sensorSources: sources,
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

  function tickSatellite(state, seconds) {
    let remaining = seconds;
    while (remaining > 0) {
      if (state.satellitePass.remaining > 0) {
        const step = Math.min(remaining, state.satellitePass.remaining);
        state.satellitePass.remaining -= step;
        remaining -= step;
        if (state.satellitePass.remaining <= 0) {
          state.satellitePass.nextIn = SATELLITE_GAP_SECONDS;
          addFeed(state, `SATELLITE pass over ${state.satellitePass.sector} complete.`, 'sensor');
        }
      } else {
        const step = Math.min(remaining, state.satellitePass.nextIn);
        state.satellitePass.nextIn -= step;
        remaining -= step;
        if (state.satellitePass.nextIn <= 0) {
          state.satellitePass.sector = pick(state, SECTORS);
          state.satellitePass.remaining = SATELLITE_PASS_SECONDS;
          addFeed(state, `SATELLITE pass entering ${state.satellitePass.sector} for ${SATELLITE_PASS_SECONDS}s.`, 'sensor');
        }
      }
    }
  }

  function recoverSensors(state, seconds) {
    state.sensorNetwork.forEach((sensor) => {
      if (sensor.status === 'online') return;
      sensor.outageRemaining = Math.max(0, sensor.outageRemaining - seconds);
      if (sensor.outageRemaining <= 0) {
        sensor.status = 'online';
        addFeed(state, `${sensor.id} ${sensor.sector} restored ONLINE.`, 'sensor');
      }
    });
  }

  function triggerSensorEvent(state) {
    const online = state.sensorNetwork.filter((sensor) => sensor.status === 'online');
    if (!online.length) return null;
    const sensor = online[Math.floor(nextRandom(state) * online.length)];
    const status = nextRandom(state) < 0.68 ? 'degraded' : 'offline';
    const duration = 12 + Math.floor(nextRandom(state) * 21);
    setSensorStatus(state, sensor.id, status, duration);
    return sensor;
  }

  function triggerWeatherEvent(state) {
    const sector = pick(state, SECTORS);
    const previous = state.sectorWeather[sector];
    const choices = WEATHER_TYPES.filter((weather) => weather !== previous);
    const weather = pick(state, choices);
    state.sectorWeather[sector] = weather;
    addFeed(state, `${sector} weather changed: ${previous} → ${weather}. Sensor quality recalculated.`, 'weather');
    return { sector, previous, weather };
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
    state.sensorEventClock += activeDelta;
    state.weatherEventClock += activeDelta;
    moveContacts(state, activeDelta);
    tickSatellite(state, activeDelta);
    recoverSensors(state, activeDelta);

    while (state.sensorEventClock >= SENSOR_EVENT_SECONDS) {
      state.sensorEventClock -= SENSOR_EVENT_SECONDS;
      triggerSensorEvent(state);
    }

    while (state.weatherEventClock >= WEATHER_EVENT_SECONDS) {
      state.weatherEventClock -= WEATHER_EVENT_SECONDS;
      triggerWeatherEvent(state);
    }

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
    SENSOR_TYPES,
    WEATHER_TYPES,
    SECTORS,
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
    getSensorNode,
    getSensorEffectiveness,
    getSectorSensorStatus,
    uniqueSensorSources,
    getCorrelationQuality,
    contactMatchesSensor,
    setSensorStatus,
    triggerSensorEvent,
    triggerWeatherEvent,
    idealResponse,
    importCaseFiles,
    exportCaseFiles,
    formatClock
  };
});
