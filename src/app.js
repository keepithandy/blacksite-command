(function () {
  'use strict';

  const Core = window.BlacksiteCore;
  if (!Core) throw new Error('BlacksiteCore failed to load.');

  const STORAGE_KEY = 'blacksite-command.case-files.v1';
  const radar = document.getElementById('radar');
  const shiftClock = document.getElementById('shiftClock');
  const scoreValue = document.getElementById('scoreValue');
  const activeCount = document.getElementById('activeCount');
  const archiveCount = document.getElementById('archiveCount');
  const sensorOnlineCount = document.getElementById('sensorOnlineCount');
  const contactEmpty = document.getElementById('contactEmpty');
  const contactDetail = document.getElementById('contactDetail');
  const contactId = document.getElementById('contactId');
  const contactCallsign = document.getElementById('contactCallsign');
  const contactSector = document.getElementById('contactSector');
  const contactSignal = document.getElementById('contactSignal');
  const contactConfidence = document.getElementById('contactConfidence');
  const contactStatus = document.getElementById('contactStatus');
  const contactSources = document.getElementById('contactSources');
  const contactCorrelation = document.getElementById('contactCorrelation');
  const incidentId = document.getElementById('incidentId');
  const incidentStage = document.getElementById('incidentStage');
  const incidentStages = Array.from(document.querySelectorAll('[data-incident-stage]'));
  const investigateButton = document.getElementById('investigateButton');
  const responseButtons = Array.from(document.querySelectorAll('[data-response]'));
  const filterButtons = Array.from(document.querySelectorAll('[data-sensor-filter]'));
  const feed = document.getElementById('feed');
  const caseArchive = document.getElementById('caseArchive');
  const archiveStatus = document.getElementById('archiveStatus');
  const sensorGrid = document.getElementById('sensorGrid');
  const satelliteStatus = document.getElementById('satelliteStatus');
  const afterActionPanel = document.getElementById('afterActionPanel');
  const reportGrade = document.getElementById('reportGrade');
  const reportScore = document.getElementById('reportScore');
  const reportResolved = document.getElementById('reportResolved');
  const reportAccuracy = document.getElementById('reportAccuracy');
  const restartButton = document.getElementById('restartButton');

  function loadArchive() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return {
        available: true,
        files: raw ? JSON.parse(raw) : []
      };
    } catch (error) {
      return {
        available: false,
        files: []
      };
    }
  }

  const storedArchive = loadArchive();
  let storageAvailable = storedArchive.available;
  let state = Core.createInitialState(Date.now(), storedArchive.files);
  let activeSensorFilter = 'ALL';
  let timer = null;

  function persistArchive() {
    if (!storageAvailable) return false;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Core.exportCaseFiles(state)));
      return true;
    } catch (error) {
      storageAvailable = false;
      return false;
    }
  }

  function riskClass(contact) {
    if (contact.certainty < 0.56) return 'unknown';
    if (contact.threat >= 0.72) return 'high';
    if (contact.threat >= 0.4) return 'medium';
    return 'low';
  }

  function renderRadar() {
    radar.replaceChildren();
    const contacts = state.contacts.filter((contact) => Core.contactMatchesSensor(contact, activeSensorFilter));

    contacts.forEach((contact) => {
      const button = document.createElement('button');
      const selected = state.selectedId === contact.id;
      const sourceCount = Core.uniqueSensorSources(contact).length;
      button.type = 'button';
      button.className = `contact-marker risk-${riskClass(contact)}${selected ? ' selected' : ''}`;
      button.style.left = `${contact.x}%`;
      button.style.top = `${contact.y}%`;
      button.setAttribute('aria-pressed', String(selected));
      button.setAttribute(
        'aria-label',
        `${contact.id} ${contact.callsign}, ${Math.round(contact.certainty * 100)} percent confidence, ${sourceCount} sensor sources`
      );
      button.innerHTML = `<span>${contact.id}</span><small>${sourceCount} SRC</small>`;
      button.addEventListener('click', () => {
        Core.selectContact(state, contact.id);
        render();
      });
      radar.appendChild(button);
    });

    if (!contacts.length) {
      const empty = document.createElement('div');
      empty.className = 'radar-empty';
      empty.textContent = `No contacts currently match ${activeSensorFilter}.`;
      radar.appendChild(empty);
    }
  }

  function renderFilters() {
    filterButtons.forEach((button) => {
      const active = button.dataset.sensorFilter === activeSensorFilter;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function renderIncidentProgress(contact) {
    const incident = Core.getIncidentForContact(state, contact.id);
    const stageIndex = incident ? incident.stageIndex : 0;
    incidentId.textContent = incident ? incident.id : 'PENDING';
    incidentStage.textContent = Core.INCIDENT_STAGES[stageIndex];

    incidentStages.forEach((step, index) => {
      step.classList.toggle('is-complete', index < stageIndex);
      step.classList.toggle('is-current', index === stageIndex);
      step.setAttribute('aria-current', index === stageIndex ? 'step' : 'false');
    });
  }

  function renderDetail() {
    const contact = Core.getContact(state, state.selectedId);
    contactEmpty.hidden = Boolean(contact);
    contactDetail.hidden = !contact;
    if (!contact) return;

    const sources = Core.uniqueSensorSources(contact);
    contactId.textContent = contact.id;
    contactCallsign.textContent = contact.callsign;
    contactSector.textContent = contact.sector;
    contactSignal.textContent = contact.signal;
    contactConfidence.textContent = `${Math.round(contact.certainty * 100)}%`;
    contactStatus.textContent = contact.status;
    contactSources.textContent = sources.length ? sources.join(' + ') : 'NONE';
    contactCorrelation.textContent = Core.getCorrelationQuality(contact).replace('-', ' ').toUpperCase();
    renderIncidentProgress(contact);

    const shiftDone = Boolean(state.afterAction);
    investigateButton.disabled = shiftDone;
    responseButtons.forEach((button) => {
      button.disabled = shiftDone || contact.certainty < 0.52 || sources.length < 2;
    });
  }

  function renderSensorNetwork() {
    sensorGrid.replaceChildren();
    let availableCount = 0;

    Core.SECTORS.forEach((sector) => {
      const weather = state.sectorWeather[sector];
      const card = document.createElement('article');
      card.className = 'sensor-sector';

      const title = document.createElement('div');
      title.className = 'sensor-sector-heading';
      title.innerHTML = `<strong>${sector}</strong><span class="weather weather-${weather.toLowerCase()}">${weather}</span>`;
      card.appendChild(title);

      const list = document.createElement('div');
      list.className = 'sensor-list';
      Core.getSectorSensorStatus(state, sector).forEach((sensor) => {
        const row = document.createElement('div');
        row.className = `sensor-row sensor-${sensor.status}`;
        const percent = Math.round(sensor.effectiveness * 100);
        if (sensor.effectiveness > 0) availableCount += 1;
        row.innerHTML = `<span>${sensor.type}</span><strong>${sensor.status.toUpperCase()}</strong><small>${percent}%</small>`;
        list.appendChild(row);
      });
      card.appendChild(list);
      sensorGrid.appendChild(card);
    });

    sensorOnlineCount.textContent = String(availableCount);
    const pass = state.satellitePass;
    satelliteStatus.textContent = pass.remaining > 0
      ? `${pass.sector} // ${Math.ceil(pass.remaining)}s REMAINING`
      : `REPOSITIONING // ${Math.ceil(pass.nextIn)}s`;
  }

  function renderFeed() {
    feed.replaceChildren();
    const items = state.feed.slice(0, 11);
    if (!items.length) {
      const empty = document.createElement('li');
      empty.className = 'feed-empty';
      empty.textContent = 'No station traffic available.';
      feed.appendChild(empty);
      return;
    }

    items.forEach((entry) => {
      const item = document.createElement('li');
      item.className = `feed-${entry.level}`;
      const time = document.createElement('time');
      time.textContent = Core.formatClock(entry.at);
      const message = document.createElement('span');
      message.textContent = entry.text;
      item.append(time, message);
      feed.appendChild(item);
    });
  }

  function renderArchive() {
    archiveCount.textContent = String(state.caseFiles.length);
    archiveStatus.textContent = storageAvailable
      ? 'LOCAL ARCHIVE READY'
      : 'SESSION-ONLY FALLBACK';
    archiveStatus.classList.toggle('storage-warning', !storageAvailable);
    caseArchive.replaceChildren();

    if (!state.caseFiles.length) {
      const empty = document.createElement('li');
      empty.className = 'archive-empty';
      empty.textContent = 'No resolved case files yet. Complete an incident to archive it.';
      caseArchive.appendChild(empty);
      return;
    }

    state.caseFiles.slice(0, 8).forEach((entry) => {
      const item = document.createElement('li');
      item.className = 'case-file';
      const sourceText = entry.sensorSources?.length ? entry.sensorSources.join(' + ') : 'LEGACY CASE';
      item.innerHTML = `
        <div class="case-file-heading">
          <strong>${entry.id}</strong>
          <span class="case-risk risk-${entry.risk}">${entry.risk.toUpperCase()}</span>
        </div>
        <div class="case-file-meta">
          <span>${entry.callsign}</span>
          <span>${entry.sector}</span>
          <span>${entry.response.toUpperCase()}</span>
          <span>${entry.confidence}% CONF.</span>
        </div>
        <p>${sourceText} // ${(entry.correlationQuality || 'single-source').toUpperCase()}</p>
        <p>${entry.correct ? 'Assessment matched final disposition.' : `Review: expected ${entry.expected.toUpperCase()}.`}</p>
      `;
      caseArchive.appendChild(item);
    });
  }

  function renderAfterAction() {
    const report = state.afterAction;
    afterActionPanel.hidden = !report;
    if (!report) return;
    reportGrade.textContent = report.grade;
    reportScore.textContent = String(report.score);
    reportResolved.textContent = String(report.resolved);
    reportAccuracy.textContent = `${Math.round(report.accuracy * 100)}%`;
  }

  function render() {
    shiftClock.textContent = Core.formatClock(state.shiftRemaining);
    scoreValue.textContent = String(state.score);
    activeCount.textContent = String(state.contacts.length);
    renderFilters();
    renderRadar();
    renderDetail();
    renderSensorNetwork();
    renderFeed();
    renderArchive();
    renderAfterAction();
  }

  function startTimer() {
    if (timer) window.clearInterval(timer);
    timer = window.setInterval(() => {
      Core.tick(state, 1);
      render();
      if (state.afterAction) {
        window.clearInterval(timer);
        timer = null;
      }
    }, 1000);
  }

  filterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      activeSensorFilter = button.dataset.sensorFilter;
      renderFilters();
      renderRadar();
    });
  });

  investigateButton.addEventListener('click', () => {
    if (!state.selectedId) return;
    Core.investigate(state, state.selectedId);
    render();
  });

  responseButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (!state.selectedId) return;
      const result = Core.respond(state, state.selectedId, button.dataset.response);
      if (result.ok) persistArchive();
      render();
    });
  });

  restartButton.addEventListener('click', () => {
    const archive = Core.exportCaseFiles(state);
    state = Core.createInitialState(Date.now(), archive);
    activeSensorFilter = 'ALL';
    persistArchive();
    render();
    startTimer();
  });

  render();
  startTimer();
})();
