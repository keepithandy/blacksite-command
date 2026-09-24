(function () {
  'use strict';

  const Core = window.BlacksiteCore;
  if (!Core) throw new Error('BlacksiteCore failed to load.');

  const radar = document.getElementById('radar');
  const shiftClock = document.getElementById('shiftClock');
  const scoreValue = document.getElementById('scoreValue');
  const activeCount = document.getElementById('activeCount');
  const contactEmpty = document.getElementById('contactEmpty');
  const contactDetail = document.getElementById('contactDetail');
  const contactId = document.getElementById('contactId');
  const contactCallsign = document.getElementById('contactCallsign');
  const contactSector = document.getElementById('contactSector');
  const contactSignal = document.getElementById('contactSignal');
  const contactConfidence = document.getElementById('contactConfidence');
  const contactStatus = document.getElementById('contactStatus');
  const investigateButton = document.getElementById('investigateButton');
  const responseButtons = Array.from(document.querySelectorAll('[data-response]'));
  const feed = document.getElementById('feed');
  const afterActionPanel = document.getElementById('afterActionPanel');
  const reportGrade = document.getElementById('reportGrade');
  const reportScore = document.getElementById('reportScore');
  const reportResolved = document.getElementById('reportResolved');
  const reportAccuracy = document.getElementById('reportAccuracy');
  const restartButton = document.getElementById('restartButton');

  let state = Core.createInitialState(Date.now());
  let timer = null;

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
      Core.respond(state, state.selectedId, button.dataset.response);
      render();
    });
  });

  restartButton.addEventListener('click', () => {
    state = Core.createInitialState(Date.now());
    render();
    startTimer();
  });

  render();
  startTimer();
})();
