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
  const contactEmpty = document.getElementById('contactEmpty');
  const contactDetail = document.getElementById('contactDetail');
  const contactId = document.getElementById('contactId');
  const contactCallsign = document.getElementById('contactCallsign');
  const contactSector = document.getElementById('contactSector');
  const contactSignal = document.getElementById('contactSignal');
  const contactConfidence = document.getElementById('contactConfidence');
  const contactStatus = document.getElementById('contactStatus');
  const incidentId = document.getElementById('incidentId');
  const incidentStage = document.getElementById('incidentStage');
  const incidentStages = Array.from(document.querySelectorAll('[data-incident-stage]'));
  const investigateButton = document.getElementById('investigateButton');
  const responseButtons = Array.from(document.querySelectorAll('[data-response]'));
  const feed = document.getElementById('feed');
  const caseArchive = document.getElementById('caseArchive');
  const archiveStatus = document.getElementById('archiveStatus');
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
    state.contacts.forEach((contact) => {
      const button = document.createElement('button');
      const selected = state.selectedId === contact.id;
      button.type = 'button';
      button.className = `contact-marker risk-${riskClass(contact)}${selected ? ' selected' : ''}`;
      button.style.left = `${contact.x}%`;
      button.style.top = `${contact.y}%`;
      button.setAttribute('aria-pressed', String(selected));
      button.setAttribute('aria-label', `${contact.id} ${contact.callsign}, ${Math.round(contact.certainty * 100)} percent confidence`);
      button.innerHTML = `<span>${contact.id}</span>`;
      button.addEventListener('click', () => {
        Core.selectContact(state, contact.id);
        render();
      });
      radar.appendChild(button);
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

    contactId.textContent = contact.id;
    contactCallsign.textContent = contact.callsign;
    contactSector.textContent = contact.sector;
    contactSignal.textContent = contact.signal;
    contactConfidence.textContent = `${Math.round(contact.certainty * 100)}%`;
    contactStatus.textContent = contact.status;
    renderIncidentProgress(contact);

    const shiftDone = Boolean(state.afterAction);
    investigateButton.disabled = shiftDone;
    responseButtons.forEach((button) => {
      button.disabled = shiftDone || contact.certainty < 0.52;
    });
  }

  function renderFeed() {
    feed.replaceChildren();
    const items = state.feed.slice(0, 9);
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
    renderRadar();
    renderDetail();
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
    persistArchive();
    render();
    startTimer();
  });

  render();
  startTimer();
})();
