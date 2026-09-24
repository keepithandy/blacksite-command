(function (global, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.BlacksiteRadarRealism = api;
  if (typeof document !== 'undefined') {
    const start = () => api.install(document);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MAX_RANGE_NM = 80;
  const SCOPE_RADIUS = 43;
  const SWEEP_MS = 4200;
  const PERSISTENCE_MS = 3600;
  const HISTORY_LENGTH = 5;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function projectToScope(xPercent, yPercent, radiusLimit) {
    const limit = Number.isFinite(radiusLimit) ? radiusLimit : SCOPE_RADIUS;
    let dx = Number(xPercent) - 50;
    let dy = Number(yPercent) - 50;
    const radius = Math.sqrt(dx * dx + dy * dy);
    if (radius > limit && radius > 0) {
      const scale = limit / radius;
      dx *= scale;
      dy *= scale;
    }
    return {
      x: 50 + dx,
      y: 50 + dy,
      radius: Math.sqrt(dx * dx + dy * dy)
    };
  }

  function bearingRangeFromPercent(xPercent, yPercent, maxRangeNm) {
    const dx = Number(xPercent) - 50;
    const dy = Number(yPercent) - 50;
    const bearing = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
    const radialPercent = clamp(Math.sqrt(dx * dx + dy * dy) / SCOPE_RADIUS, 0, 1);
    return {
      bearing,
      rangeNm: radialPercent * (Number.isFinite(maxRangeNm) ? maxRangeNm : MAX_RANGE_NM)
    };
  }

  function classifyReturnState(sourceCount, confirmed, degraded) {
    if (degraded) return 'coast';
    if (confirmed || sourceCount >= 3) return 'confirmed';
    if (sourceCount === 2) return 'track';
    return 'raw';
  }

  function angularDistance(a, b) {
    return Math.abs((((a - b) + 540) % 360) - 180);
  }

  function createBearingLabels() {
    const fragment = document.createDocumentFragment();
    for (let bearing = 0; bearing < 360; bearing += 30) {
      const label = document.createElement('span');
      label.className = 'radar-bearing-label';
      label.dataset.bearing = String(bearing);
      label.textContent = String(bearing).padStart(3, '0');
      label.style.setProperty('--bearing', `${bearing}deg`);
      fragment.appendChild(label);
    }
    return fragment;
  }

  function getRadarArrayStatus() {
    const cards = Array.from(document.querySelectorAll('#facilityGrid .facility-system'));
    const radarCard = cards.find((card) => card.querySelector('.facility-system-heading strong')?.textContent?.trim() === 'RADAR ARRAY');
    if (!radarCard) return 'online';
    if (radarCard.classList.contains('facility-offline')) return 'offline';
    if (radarCard.classList.contains('facility-degraded')) return 'degraded';
    return 'online';
  }

  function getWeatherClutterLevel() {
    const weather = Array.from(document.querySelectorAll('#sensorGrid .weather')).map((entry) => entry.textContent?.trim());
    if (!weather.length) return 0.08;
    let score = 0;
    weather.forEach((type) => {
      if (type === 'STORM') score += 0.28;
      else if (type === 'RAIN') score += 0.16;
      else if (type === 'WIND') score += 0.08;
    });
    return clamp(0.05 + score / Math.max(1, weather.length), 0.05, 0.32);
  }

  function install(root) {
    const radar = root.getElementById('radar');
    if (!radar || radar.dataset.realismInstalled === 'true') return false;
    radar.dataset.realismInstalled = 'true';

    const stage = root.createElement('div');
    stage.className = 'radar-stage';
    const parent = radar.parentNode;
    parent.insertBefore(stage, radar);
    stage.appendChild(radar);

    const bezel = root.createElement('div');
    bezel.className = 'radar-bezel';
    bezel.setAttribute('aria-hidden', 'true');
    bezel.appendChild(createBearingLabels());
    stage.appendChild(bezel);

    const ranges = root.createElement('div');
    ranges.className = 'radar-range-labels';
    ranges.setAttribute('aria-hidden', 'true');
    [20, 40, 60, 80].forEach((range) => {
      const label = root.createElement('span');
      label.textContent = `${range} NM`;
      label.style.setProperty('--ring-radius', `${(range / MAX_RANGE_NM) * 43}%`);
      ranges.appendChild(label);
    });
    stage.appendChild(ranges);

    const center = root.createElement('div');
    center.className = 'radar-origin';
    center.setAttribute('aria-hidden', 'true');
    stage.appendChild(center);

    const scopeStatus = root.createElement('div');
    scopeStatus.className = 'radar-scope-status';
    scopeStatus.innerHTML = '<span id="radarMode">PPI // 80 NM</span><span id="radarSweepReadout">SWEEP 000°</span><span id="radarArrayReadout">ARRAY ONLINE</span>';
    stage.appendChild(scopeStatus);

    const history = new Map();
    const lastHit = new Map();
    let observer;
    let augmentScheduled = false;

    function addHistory(id, x, y) {
      const points = history.get(id) || [];
      const previous = points[points.length - 1];
      if (!previous || Math.hypot(previous.x - x, previous.y - y) > 0.18) {
        points.push({ x, y, at: performance.now() });
        if (points.length > HISTORY_LENGTH) points.shift();
        history.set(id, points);
      }
    }

    function drawHistory(activeIds) {
      radar.querySelectorAll('.radar-history-point').forEach((entry) => entry.remove());
      history.forEach((points, id) => {
        if (!activeIds.has(id)) return;
        points.slice(0, -1).forEach((point, index) => {
          const ghost = root.createElement('i');
          ghost.className = 'radar-history-point';
          ghost.style.left = `${point.x}%`;
          ghost.style.top = `${point.y}%`;
          ghost.style.opacity = String((index + 1) / Math.max(1, points.length) * 0.42);
          ghost.setAttribute('aria-hidden', 'true');
          radar.prepend(ghost);
        });
      });
    }

    function augmentContacts() {
      augmentScheduled = false;
      observer.disconnect();
      const status = getRadarArrayStatus();
      radar.classList.toggle('radar-array-degraded', status === 'degraded');
      radar.classList.toggle('radar-array-offline', status === 'offline');
      radar.style.setProperty('--clutter-opacity', String(getWeatherClutterLevel() + (status === 'degraded' ? 0.08 : status === 'offline' ? 0.16 : 0)));

      const activeIds = new Set();
      radar.querySelectorAll('.contact-marker').forEach((marker) => {
        const id = marker.querySelector('span')?.textContent?.trim() || 'TRACK';
        activeIds.add(id);
        const rawX = Number.parseFloat(marker.style.left) || 50;
        const rawY = Number.parseFloat(marker.style.top) || 50;
        const projected = projectToScope(rawX, rawY);
        marker.style.left = `${projected.x}%`;
        marker.style.top = `${projected.y}%`;
        addHistory(id, projected.x, projected.y);

        const sourceCount = Number.parseInt(marker.querySelector('small')?.textContent || '1', 10) || 1;
        const confirmed = !marker.classList.contains('risk-unknown');
        const returnState = classifyReturnState(sourceCount, confirmed, status !== 'online');
        marker.classList.remove('return-raw', 'return-track', 'return-confirmed', 'return-coast');
        marker.classList.add(`return-${returnState}`);
        marker.dataset.returnState = returnState.toUpperCase();

        const reading = bearingRangeFromPercent(projected.x, projected.y);
        marker.dataset.bearing = String(Math.round(reading.bearing));
        marker.dataset.range = reading.rangeNm.toFixed(1);
        const readout = root.createElement('span');
        readout.className = 'radar-track-readout';
        readout.textContent = `${returnState === 'coast' ? 'COAST' : 'TRK'} ${String(Math.round(reading.bearing)).padStart(3, '0')}°  ${reading.rangeNm.toFixed(1)} NM`;
        marker.appendChild(readout);
      });
      drawHistory(activeIds);
      observer.observe(radar, { childList: true });
    }

    function scheduleAugment() {
      if (augmentScheduled) return;
      augmentScheduled = true;
      queueMicrotask(augmentContacts);
    }

    observer = new MutationObserver(scheduleAugment);
    observer.observe(radar, { childList: true });
    scheduleAugment();

    function frame(now) {
      const sweep = ((now % SWEEP_MS) / SWEEP_MS) * 360;
      radar.style.setProperty('--sweep-angle', `${sweep}deg`);
      const sweepReadout = root.getElementById('radarSweepReadout');
      if (sweepReadout) sweepReadout.textContent = `SWEEP ${String(Math.round(sweep) % 360).padStart(3, '0')}°`;

      const arrayStatus = getRadarArrayStatus();
      const arrayReadout = root.getElementById('radarArrayReadout');
      if (arrayReadout) arrayReadout.textContent = `ARRAY ${arrayStatus.toUpperCase()}`;

      radar.querySelectorAll('.contact-marker').forEach((marker) => {
        const id = marker.querySelector('span')?.textContent?.trim() || 'TRACK';
        const bearing = Number(marker.dataset.bearing) || 0;
        const hitWindow = arrayStatus === 'offline' ? 0 : arrayStatus === 'degraded' ? 5 : 8;
        if (hitWindow && angularDistance(sweep, bearing) <= hitWindow) lastHit.set(id, now);
        const age = now - (lastHit.get(id) || now - PERSISTENCE_MS);
        const persistence = arrayStatus === 'offline'
          ? 0.18
          : clamp(1 - age / PERSISTENCE_MS, marker.classList.contains('return-raw') ? 0.18 : 0.3, 1);
        marker.style.setProperty('--return-opacity', persistence.toFixed(3));
        marker.classList.toggle('sweep-hit', age < 180 && arrayStatus !== 'offline');
      });

      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    return true;
  }

  return {
    MAX_RANGE_NM,
    SCOPE_RADIUS,
    projectToScope,
    bearingRangeFromPercent,
    classifyReturnState,
    angularDistance,
    install
  };
});