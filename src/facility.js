(function (global, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global.BlacksiteCore) api.install(global.BlacksiteCore);
  global.BlacksiteFacility = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '0.0.4';
  const EVENT_SECONDS = 36;
  const IDS = Object.freeze(['POWER', 'COMMS', 'RADAR_ARRAY', 'SAT_UPLINK', 'INTEL_SERVERS', 'SECURITY']);
  const DEFINITIONS = Object.freeze({
    POWER: { label: 'Power', impact: 'Emergency reserve and all station systems.' },
    COMMS: { label: 'Comms', impact: 'SIGINT, ground relay, orbital relay, and response dispatch.' },
    RADAR_ARRAY: { label: 'Radar Array', impact: 'RADAR coverage and track quality.' },
    SAT_UPLINK: { label: 'Sat Uplink', impact: 'SATELLITE correlation during orbital passes.' },
    INTEL_SERVERS: { label: 'Intel Servers', impact: 'Correlation throughput, SIGINT, and ground fusion.' },
    SECURITY: { label: 'Security', impact: 'Station integrity and protected coordination.' }
  });
  const SENSOR_MAP = Object.freeze({
    RADAR: ['POWER', 'RADAR_ARRAY'],
    SIGINT: ['POWER', 'COMMS', 'INTEL_SERVERS'],
    SATELLITE: ['POWER', 'COMMS', 'SAT_UPLINK'],
    GROUND: ['POWER', 'COMMS', 'INTEL_SERVERS']
  });
  const EVENT_COPY = Object.freeze({
    POWER: ['bus voltage instability', 'generator transfer fault', 'distribution relay fault'],
    COMMS: ['relay desynchronization', 'antenna controller fault', 'secure channel interruption'],
    RADAR_ARRAY: ['array timing fault', 'tracking processor fault', 'azimuth drive anomaly'],
    SAT_UPLINK: ['uplink amplifier fault', 'tracking dish interruption', 'orbital handshake loss'],
    INTEL_SERVERS: ['fusion queue overload', 'storage controller fault', 'analysis cluster interruption'],
    SECURITY: ['perimeter controller fault', 'access-control interruption', 'camera bus instability']
  });

  let currentState = null;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const rank = (status) => status === 'offline' ? 2 : status === 'degraded' ? 1 : 0;
  const worse = (a, b) => rank(a) >= rank(b) ? a : b;

  function feed(state, text, level) {
    if (!Array.isArray(state.feed)) return;
    if (!Number.isFinite(state.feedSerial)) state.feedSerial = 0;
    state.feed.unshift({ id: `${state.elapsed || 0}-${state.feedSerial++}`, at: state.elapsed || 0, level: level || 'facility', text });
    if (state.feed.length > 50) state.feed.length = 50;
  }

  function baseStatus(condition) {
    if (condition < 35) return 'offline';
    if (condition < 70) return 'degraded';
    return 'online';
  }

  function refresh(system) {
    const fault = system.fault === 'none' ? 'online' : system.fault;
    system.status = worse(baseStatus(system.condition), fault);
    return system.status;
  }

  function createFacility(state) {
    const seed = Number.isFinite(state.rngSeed) ? state.rngSeed >>> 0 : 0x51f15e;
    state.facility = {
      reserve: 100,
      loadShed: false,
      eventClock: 0,
      incidents: 0,
      repairs: 0,
      rngSeed: (seed ^ 0xfac17e) >>> 0,
      systems: IDS.map((id) => ({ id, condition: 100, status: 'online', fault: 'none', faultRemaining: 0, repairCooldown: 0 }))
    };
    return state.facility;
  }

  function ensure(state) {
    return state.facility || createFacility(state);
  }

  function random(state) {
    const facility = ensure(state);
    facility.rngSeed = (Math.imul(facility.rngSeed, 1103515245) + 12345) >>> 0;
    return facility.rngSeed / 4294967296;
  }

  function getSystem(state, id) {
    return ensure(state).systems.find((system) => system.id === id) || null;
  }

  function multiplier(state, id) {
    const system = getSystem(state, id);
    if (!system) return 0;
    refresh(system);
    const condition = 0.45 + 0.55 * (system.condition / 100);
    if (system.status === 'offline') return 0;
    if (system.status === 'degraded') return clamp(condition * 0.62, 0, 0.68);
    return clamp(condition, 0, 1);
  }

  function powerSupport(state) {
    const facility = ensure(state);
    const power = getSystem(state, 'POWER');
    refresh(power);
    if (power.status === 'online') return multiplier(state, 'POWER');
    if (facility.reserve <= 0) return 0.08;
    return power.status === 'offline' ? 0.46 : 0.66;
  }

  function sensorMultiplier(state, type) {
    const parts = SENSOR_MAP[type];
    if (!parts) return 1;
    let value = Math.min(...parts.map((id) => id === 'POWER' ? powerSupport(state) : multiplier(state, id)));
    if (ensure(state).loadShed && type === 'SATELLITE') value = 0;
    if (ensure(state).loadShed && type === 'GROUND') value = Math.min(value, 0.42);
    return clamp(value, 0, 1);
  }

  function sensorFacilityStatus(state, type) {
    const value = sensorMultiplier(state, type);
    return value < 0.18 ? 'offline' : value < 0.72 ? 'degraded' : 'online';
  }

  function syncSensors(state, holdSeconds) {
    if (!Array.isArray(state.sensorNetwork)) return;
    const hold = Math.max(2, Number(holdSeconds) || 2);
    state.sensorNetwork.forEach((sensor) => {
      const desired = sensorFacilityStatus(state, sensor.type);
      if (desired === 'online') {
        if (sensor.facilityOverride) {
          sensor.status = sensor.facilityPreviousStatus || 'online';
          sensor.outageRemaining = Math.max(0, Number(sensor.facilityPreviousOutage) || 0);
          delete sensor.facilityOverride;
          delete sensor.facilityPreviousStatus;
          delete sensor.facilityPreviousOutage;
        }
        return;
      }
      if (!sensor.facilityOverride) {
        sensor.facilityPreviousStatus = sensor.status;
        sensor.facilityPreviousOutage = sensor.outageRemaining;
      }
      sensor.facilityOverride = desired;
      sensor.status = worse(sensor.status, desired);
      sensor.outageRemaining = Math.max(Number(sensor.outageRemaining) || 0, hold);
    });
  }

  function updateLoadShed(state) {
    const facility = ensure(state);
    const power = getSystem(state, 'POWER');
    refresh(power);
    const next = power.status === 'offline' || facility.reserve <= 45;
    if (next !== facility.loadShed) {
      facility.loadShed = next;
      feed(state, next
        ? 'FACILITY load shed active: SATELLITE suspended and GROUND relays limited.'
        : 'FACILITY load shed cleared: normal sensor support restored.', next ? 'warn' : 'facility');
    }
    return next;
  }

  function degrade(state, id, amount, faultStatus, duration) {
    const system = getSystem(state, id);
    if (!system) return { ok: false, reason: 'system-unavailable' };
    const status = ['degraded', 'offline'].includes(faultStatus) ? faultStatus : 'degraded';
    system.condition = clamp(system.condition - clamp(Number(amount) || 10, 1, 100), 0, 100);
    system.fault = worse(system.fault === 'none' ? 'online' : system.fault, status);
    system.faultRemaining = Math.max(system.faultRemaining, Math.max(4, Number(duration) || 18));
    refresh(system);
    ensure(state).incidents += 1;
    feed(state, `${DEFINITIONS[id].label.toUpperCase()} ${system.status.toUpperCase()}: ${Math.round(system.condition)}% condition // ${Math.ceil(system.faultRemaining)}s recovery.`, system.status === 'offline' ? 'warn' : 'facility');
    updateLoadShed(state);
    syncSensors(state, system.faultRemaining + 1);
    return { ok: true, system };
  }

  function setCondition(state, id, condition) {
    const system = getSystem(state, id);
    if (!system) return { ok: false, reason: 'system-unavailable' };
    system.condition = clamp(Number(condition) || 0, 0, 100);
    system.fault = 'none';
    system.faultRemaining = 0;
    system.repairCooldown = 0;
    refresh(system);
    updateLoadShed(state);
    syncSensors(state, 2);
    return { ok: true, system };
  }

  function repair(state, id) {
    if (state.afterAction) return { ok: false, reason: 'shift-complete' };
    const system = getSystem(state, id);
    if (!system) return { ok: false, reason: 'system-unavailable' };
    if (system.repairCooldown > 0) return { ok: false, reason: 'repair-cooldown' };
    if (system.condition >= 100 && system.fault === 'none') return { ok: false, reason: 'system-nominal' };
    system.condition = clamp(system.condition + 30, 0, 100);
    system.fault = 'none';
    system.faultRemaining = 0;
    system.repairCooldown = 10;
    refresh(system);
    ensure(state).repairs += 1;
    feed(state, `${DEFINITIONS[id].label.toUpperCase()} stabilized to ${Math.round(system.condition)}% // ${system.status.toUpperCase()}.`, 'facility');
    updateLoadShed(state);
    syncSensors(state, 2);
    return { ok: true, system };
  }

  function triggerEvent(state) {
    const id = IDS[Math.floor(random(state) * IDS.length)];
    const status = random(state) < 0.76 ? 'degraded' : 'offline';
    const loss = status === 'offline' ? 18 + Math.floor(random(state) * 15) : 7 + Math.floor(random(state) * 12);
    const duration = 12 + Math.floor(random(state) * 19);
    const copy = EVENT_COPY[id];
    feed(state, `FACILITY ALERT // ${DEFINITIONS[id].label}: ${copy[Math.floor(random(state) * copy.length)]}.`, 'warn');
    return degrade(state, id, loss, status, duration);
  }

  function tickFacility(state, seconds) {
    const facility = ensure(state);
    const delta = Math.max(0, Number(seconds) || 0);
    if (!delta) return facility;
    facility.systems.forEach((system) => {
      system.repairCooldown = Math.max(0, system.repairCooldown - delta);
      if (system.fault === 'none') return;
      system.faultRemaining = Math.max(0, system.faultRemaining - delta);
      if (system.faultRemaining <= 0) {
        const before = system.status;
        system.fault = 'none';
        refresh(system);
        if (before !== system.status) feed(state, `${DEFINITIONS[system.id].label.toUpperCase()} transient cleared // ${system.status.toUpperCase()}.`, 'facility');
      }
    });
    const power = getSystem(state, 'POWER');
    refresh(power);
    if (power.status === 'offline') facility.reserve = clamp(facility.reserve - delta * 1.05, 0, 100);
    else if (power.status === 'degraded') facility.reserve = clamp(facility.reserve - delta * 0.48, 0, 100);
    else facility.reserve = clamp(facility.reserve + delta * 0.2, 0, 100);
    updateLoadShed(state);
    facility.eventClock += delta;
    while (facility.eventClock >= EVENT_SECONDS && !state.afterAction) {
      facility.eventClock -= EVENT_SECONDS;
      triggerEvent(state);
    }
    return facility;
  }

  function status(state) {
    return ensure(state).systems.map((system) => {
      refresh(system);
      return { ...system, label: DEFINITIONS[system.id].label, impact: DEFINITIONS[system.id].impact };
    });
  }

  function integrity(state) {
    const systems = status(state);
    return systems.reduce((sum, system) => sum + system.condition, 0) / systems.length;
  }

  function install(Core) {
    if (!Core || Core.__facilityCommandInstalled) return Core;
    const original = {
      createInitialState: Core.createInitialState,
      createContact: Core.createContact,
      investigate: Core.investigate,
      respond: Core.respond,
      tick: Core.tick,
      finalizeShift: Core.finalizeShift,
      getSensorEffectiveness: Core.getSensorEffectiveness,
      getSectorSensorStatus: Core.getSectorSensorStatus
    };

    Core.VERSION = VERSION;
    Core.FACILITY_SYSTEM_IDS = IDS;
    Core.FACILITY_DEFINITIONS = DEFINITIONS;
    Core.getFacilitySystem = getSystem;
    Core.getFacilityStatus = status;
    Core.getFacilityIntegrity = integrity;
    Core.getFacilitySensorMultiplier = sensorMultiplier;
    Core.degradeFacilitySystem = degrade;
    Core.setFacilitySystemCondition = setCondition;
    Core.repairFacilitySystem = repair;
    Core.triggerFacilityEvent = triggerEvent;
    Core.tickFacility = tickFacility;

    Core.createInitialState = function (seed, caseFiles) {
      const state = original.createInitialState(seed, caseFiles);
      state.version = VERSION;
      createFacility(state);
      currentState = state;
      feed(state, 'FACILITY COMMAND online // all station subsystems nominal.', 'facility');
      return state;
    };

    Core.createContact = function (state) {
      syncSensors(state, 2);
      return original.createContact(state);
    };

    Core.getSensorEffectiveness = function (state, sector, type) {
      return clamp(original.getSensorEffectiveness(state, sector, type) * sensorMultiplier(state, type), 0, 1);
    };

    Core.getSectorSensorStatus = function (state, sector) {
      return original.getSectorSensorStatus(state, sector).map((sensor) => {
        const facility = sensorMultiplier(state, sensor.type);
        const effectiveness = clamp(sensor.effectiveness * facility, 0, 1);
        let sensorStatus = sensor.status;
        if (facility < 0.18) sensorStatus = 'offline';
        else if (facility < 0.72 && !['offline', 'standby'].includes(sensorStatus)) sensorStatus = 'degraded';
        return { ...sensor, status: sensorStatus, effectiveness, facilityMultiplier: facility };
      });
    };

    Core.investigate = function (state, id) {
      if (Math.min(powerSupport(state), multiplier(state, 'COMMS'), multiplier(state, 'INTEL_SERVERS')) < 0.18) {
        feed(state, 'Correlation unavailable: POWER / COMMS / INTEL SERVERS below operational minimum.', 'warn');
        return { ok: false, reason: 'facility-unavailable' };
      }
      syncSensors(state, 3);
      const satelliteBlocked = sensorMultiplier(state, 'SATELLITE') < 0.18;
      const pass = satelliteBlocked && state.satellitePass ? { ...state.satellitePass } : null;
      if (pass) { state.satellitePass.remaining = 0; state.satellitePass.nextIn = Math.max(1, state.satellitePass.nextIn || 1); }
      const result = original.investigate(state, id);
      if (pass) state.satellitePass = pass;
      return result;
    };

    Core.respond = function (state, id, response) {
      if (Math.min(powerSupport(state), multiplier(state, 'COMMS')) < 0.18) {
        feed(state, 'Response dispatch unavailable: POWER / COMMS below operational minimum.', 'warn');
        return { ok: false, reason: 'facility-unavailable' };
      }
      return original.respond(state, id, response);
    };

    Core.finalizeShift = function (state) {
      const report = original.finalizeShift(state);
      report.facilityIntegrity = integrity(state);
      report.facilityReserve = ensure(state).reserve;
      report.facilityIncidents = ensure(state).incidents;
      report.facilityRepairs = ensure(state).repairs;
      return report;
    };

    Core.tick = function (state, seconds) {
      const delta = Number.isFinite(seconds) ? Math.max(0, seconds) : 1;
      const active = Math.min(delta, Number.isFinite(state.shiftRemaining) ? state.shiftRemaining : delta);
      const beforeIds = new Set((state.contacts || []).map((contact) => contact.id));
      syncSensors(state, delta + 2);
      const result = original.tick(state, seconds);
      tickFacility(state, active);
      syncSensors(state, 2);
      if (sensorMultiplier(state, 'SATELLITE') < 0.18) {
        (state.contacts || []).forEach((contact) => {
          if (!beforeIds.has(contact.id)) contact.sensorHits = (contact.sensorHits || []).filter((hit) => hit.type !== 'SATELLITE');
        });
      }
      if (state.afterAction) {
        state.afterAction.facilityIntegrity = integrity(state);
        state.afterAction.facilityReserve = ensure(state).reserve;
        state.afterAction.facilityIncidents = ensure(state).incidents;
        state.afterAction.facilityRepairs = ensure(state).repairs;
      }
      return result;
    };

    Core.__facilityCommandInstalled = true;
    return Core;
  }

  function getCurrentState() { return currentState; }

  return {
    VERSION,
    SYSTEM_IDS: IDS,
    DEFINITIONS,
    install,
    getCurrentState,
    createFacilityState: createFacility,
    getFacilitySystem: getSystem,
    getFacilityStatus: status,
    getFacilityIntegrity: integrity,
    getFacilitySensorMultiplier: sensorMultiplier,
    degradeFacilitySystem: degrade,
    setFacilitySystemCondition: setCondition,
    repairFacilitySystem: repair,
    triggerFacilityEvent: triggerEvent,
    tickFacility
  };
});
