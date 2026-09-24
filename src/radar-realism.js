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
  const ACQUISITION_MS = 2200;
  const HISTORY_LENGTH = 6;

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
    return { x: 50 + dx, y: 50 + dy, radius: Math.sqrt(dx * dx + dy * dy) };
  }

  function bearingRangeFromPercent(xPercent, yPercent, maxRangeNm) {
    const dx = Number(xPercent) - 50;
    const dy = Number(yPercent) - 50;
    const bearing = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
    const radialPercent = clamp(Math.sqrt(dx * dx + dy * dy) / SCOPE_RADIUS, 0, 1);
    return { bearing, rangeNm: radialPercent * (Number.isFinite(maxRangeNm) ? maxRangeNm : MAX_RANGE_NM) };
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

  function headingFromDelta(dx, dy) {
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return 0;
    return (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
  }

  function vectorLengthFromDelta(dx, dy) {
    return clamp(Math.hypot(Number(dx) || 0, Number(dy) || 0) * 17, 9, 34);
  }

  function ghostReturnCount(clutterLevel, arrayStatus) {
    const base = Math.round(clamp(Number(clutterLevel) || 0, 0, 0.5) * 18);
    const penalty = arrayStatus === 'offline' ? 5 : arrayStatus === 'degraded' ? 2 : 0;
    return clamp(base + penalty, 0, 10);
  }

  function seededFraction(seed) {
    const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return value - Math.floor(value);
  }

  function createBearingLabels(root) {
    const fragment = root.createDocumentFragment();
    for (let bearing = 0; bearing < 360; bearing += 30) {
      const label = root.createElement('span');
      label.className = 'radar-bearing-label';
      label.dataset.bearing = String(bearing);
      label.textContent = String(bearing).padStart(3, '0');
      label.style.setProperty('--bearing', `${bearing}deg`);
      fragment.appendChild(label);
    }
    return fragment;
  }

  function getRadarArrayStatus(root) {
    const cards = Array.from(root.querySelectorAll('#facilityGrid .facility-system'));
    const radarCard = cards.find((card) => card.querySelector('.facility-system-heading strong')?.textContent?.trim() === 'RADAR ARRAY');
    if (!radarCard) return 'online';
    if (radarCard.classList.contains('facility-offline')) return 'offline';
    if (radarCard.classList.contains('facility-degraded')) return 'degraded';
    return 'online';
  }

  function getWeatherClutterLevel(root) {
    const weather = Array.from(root.querySelectorAll('#sensorGrid .weather')).map((entry) => entry.textContent?.trim());
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

    const sweepBloom = root.createElement('div');
    sweepBloom.className = 'radar-sweep-bloom';
    sweepBloom.setAttribute('aria-hidden', 'true');
    radar.appendChild(sweepBloom);

    const glass = root.createElement('div');
    glass.className = 'radar-glass-overlay';
    glass.setAttribute('aria-hidden', 'true');
    radar.appendChild(glass);

    const bezel = root.createElement('div');
    bezel.className = 'radar-bezel';
    bezel.setAttribute('aria-hidden', 'true');
    bezel.appendChild(createBearingLabels(root));
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
    const firstSeen = new Map();
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

    function drawHistory(activeIds, arrayStatus) {
      radar.querySelectorAll('.radar-history-point, .radar-track-vector, .radar-coast-projection').forEach((entry) => entry.remove());
      history.forEach((points, id) => {
        if (!activeIds.has(id) || !points.length) return;
        points.slice(0, -1).forEach((point, index) => {
          const ghost = root.createElement('i');
          ghost.className = `radar-history-point${arrayStatus === 'online' ? '' : ' radar-history-coast'}`;
          ghost.style.left = `${point.x}%`;
          ghost.style.top = `${point.y}%`;
          ghost.style.opacity = String((index + 1) / Math.max(1, points.length) * (arrayStatus === 'online' ? 0.42 : 0.62));
          ghost.setAttribute('aria-hidden', 'true');
          radar.prepend(ghost);
        });

        if (points.length < 2) return;
        const previous = points[points.length - 2];
        const current = points[points.length - 1];
        const dx = current.x - previous.x;
        const dy = current.y - previous.y;
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        const vector = root.createElement('i');
        vector.className = `radar-track-vector${arrayStatus === 'online' ? '' : ' radar-vector-coast'}`;
        vector.style.left = `${current.x}%`;
        vector.style.top = `${current.y}%`;
        vector.style.setProperty('--vector-angle', `${angle}deg`);
        vector.style.setProperty('--vector-length', `${vectorLengthFromDelta(dx, dy)}px`);
        vector.setAttribute('aria-hidden', 'true');
        radar.appendChild(vector);

        if (arrayStatus !== 'online') {
          const projection = root.createElement('i');
          projection.className = 'radar-coast-projection';
          projection.style.left = `${clamp(current.x + dx * 2.5, 7, 93)}%`;
          projection.style.top = `${clamp(current.y + dy * 2.5, 7, 93)}%`;
          projection.setAttribute('aria-hidden', 'true');
          radar.appendChild(projection);
        }
      });
    }

    function drawEnvironmentArtifacts(arrayStatus, clutter) {
      radar.querySelectorAll('.radar-ghost-return, .radar-noise-arc').forEach((entry) => entry.remove());
      const bucket = Math.floor(performance.now() / 2800);
      const ghostCount = ghostReturnCount(clutter, arrayStatus);
      for (let index = 0; index < ghostCount; index += 1) {
        const radial = 8 + seededFraction(bucket * 37 + index * 11) * 38;
        const angle = seededFraction(bucket * 17 + index * 29) * Math.PI * 2;
        const ghost = root.createElement('i');
        ghost.className = 'radar-ghost-return';
        ghost.style.left = `${50 + Math.cos(angle) * radial}%`;
        ghost.style.top = `${50 + Math.sin(angle) * radial}%`;
        ghost.style.setProperty('--ghost-delay', `${(index % 4) * -0.37}s`);
        ghost.setAttribute('aria-hidden', 'true');
        radar.prepend(ghost);
      }

      const arcCount = clutter > 0.22 ? 3 : clutter > 0.13 ? 2 : 1;
      for (let index = 0; index < arcCount; index += 1) {
        const arc = root.createElement('i');
        arc.className = 'radar-noise-arc';
        arc.style.setProperty('--arc-size', `${34 + index * 18}%`);
        arc.style.setProperty('--arc-angle', `${Math.round(seededFraction(bucket * 23 + index * 19) * 360)}deg`);
        arc.style.setProperty('--arc-opacity', String(clamp(clutter * (0.32 + index * 0.08), 0.025, 0.18)));
        arc.setAttribute('aria-hidden', 'true');
        radar.prepend(arc);
      }
    }

    function augmentContacts() {
      augmentScheduled = false;
      observer.disconnect();
      const status = getRadarArrayStatus(root);
      const clutter = getWeatherClutterLevel(root) + (status === 'degraded' ? 0.08 : status === 'offline' ? 0.16 : 0);
      radar.classList.toggle('radar-array-degraded', status === 'degraded');
      radar.classList.toggle('radar-array-offline', status === 'offline');
      radar.style.setProperty('--clutter-opacity', String(clamp(clutter, 0.05, 0.48)));

      const activeIds = new Set();
      const now = performance.now();
      radar.querySelectorAll('.contact-marker').forEach((marker) => {
        const id = marker.querySelector('span')?.textContent?.trim() || 'TRACK';
        activeIds.add(id);
        if (!firstSeen.has(id)) firstSeen.set(id, now);
        const rawX = Number.parseFloat(marker.style.left) || 50;
        const rawY = Number.parseFloat(marker.style.top) || 50;
        const projected = projectToScope(rawX, rawY);
        marker.style.left = `${projected.x}%`;
        marker.style.top = `${projected.y}%`;
        addHistory(id, projected.x, projected.y);

        const sourceCount = Number.parseInt(marker.querySelector('small')?.textContent || '1', 10) || 1;
        const confirmed = !marker.classList.contains('risk-unknown');
        const returnState = classifyReturnState(sourceCount, confirmed, status !== 'online');
        marker.classList.remove('return-raw', 'return-track', 'return-confirmed', 'return-coast', 'priority-track', 'new-return');
        marker.classList.add(`return-${returnState}`);
        marker.classList.toggle('priority-track', returnState === 'confirmed' || marker.classList.contains('risk-high'));
        marker.classList.toggle('new-return', now - firstSeen.get(id) < ACQUISITION_MS);
        marker.dataset.returnState = returnState.toUpperCase();

        const reading = bearingRangeFromPercent(projected.x, projected.y);
        marker.dataset.bearing = String(Math.round(reading.bearing));
        marker.dataset.range = reading.rangeNm.toFixed(1);

        const trail = history.get(id) || [];
        if (trail.length >= 2) {
          const previous = trail[trail.length - 2];
          const current = trail[trail.length - 1];
          marker.dataset.heading = String(Math.round(headingFromDelta(current.x - previous.x, current.y - previous.y)));
        }

        const readout = root.createElement('span');
        readout.className = 'radar-track-readout';
        const headingText = marker.dataset.heading ? `  HDG ${String(marker.dataset.heading).padStart(3, '0')}°` : '';
        readout.textContent = `${returnState === 'coast' ? 'COAST' : 'TRK'} ${String(Math.round(reading.bearing)).padStart(3, '0')}°  ${reading.rangeNm.toFixed(1)} NM${headingText}`;
        marker.appendChild(readout);

        const flare = root.createElement('i');
        flare.className = 'radar-hit-flare';
        flare.setAttribute('aria-hidden', 'true');
        marker.appendChild(flare);

        if (marker.classList.contains('new-return')) {
          const ring = root.createElement('i');
          ring.className = 'radar-acquisition-ring';
          ring.setAttribute('aria-hidden', 'true');
          marker.appendChild(ring);
        }

        if (marker.classList.contains('priority-track')) {
          const bracket = root.createElement('i');
          bracket.className = 'radar-priority-bracket';
          bracket.setAttribute('aria-hidden', 'true');
          marker.appendChild(bracket);
        }
      });

      drawHistory(activeIds, status);
      drawEnvironmentArtifacts(status, clutter);
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

      const arrayStatus = getRadarArrayStatus(root);
      const arrayReadout = root.getElementById('radarArrayReadout');
      if (arrayReadout) arrayReadout.textContent = `ARRAY ${arrayStatus.toUpperCase()}`;

      bezel.querySelectorAll('.radar-bearing-label').forEach((label) => {
        const bearing = Number(label.dataset.bearing) || 0;
        label.classList.toggle('sweep-lit', arrayStatus !== 'offline' && angularDistance(sweep, bearing) <= 8);
      });

      radar.querySelectorAll('.contact-marker').forEach((marker) => {
        const id = marker.querySelector('span')?.textContent?.trim() || 'TRACK';
        const bearing = Number(marker.dataset.bearing) || 0;
        const hitWindow = arrayStatus === 'offline' ? 0 : arrayStatus === 'degraded' ? 5 : 8;
        if (hitWindow && angularDistance(sweep, bearing) <= hitWindow) lastHit.set(id, now);
        const age = now - (lastHit.get(id) || now - PERSISTENCE_MS);
        const persistence = arrayStatus === 'offline' ? 0.18 : clamp(1 - age / PERSISTENCE_MS, marker.classList.contains('return-raw') ? 0.18 : 0.3, 1);
        marker.style.setProperty('--return-opacity', persistence.toFixed(3));
        marker.classList.toggle('sweep-hit', age < 170 && arrayStatus !== 'offline');
        marker.classList.toggle('new-return', now - (firstSeen.get(id) || now) < ACQUISITION_MS);
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
    headingFromDelta,
    vectorLengthFromDelta,
    ghostReturnCount,
    install
  };
});
