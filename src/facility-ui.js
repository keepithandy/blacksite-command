(function () {
  'use strict';

  const Core = window.BlacksiteCore;
  const Facility = window.BlacksiteFacility;
  const grid = document.getElementById('facilityGrid');
  const health = document.getElementById('facilityHealth');
  const reserve = document.getElementById('facilityReserve');
  const load = document.getElementById('loadShedStatus');
  if (!Core || !Facility || !grid || !health || !reserve || !load) return;

  function render() {
    const state = Facility.getCurrentState();
    if (!state?.facility) return;
    const systems = Core.getFacilityStatus(state);
    health.textContent = `${Math.round(Core.getFacilityIntegrity(state))}%`;
    reserve.textContent = `RESERVE ${Math.round(state.facility.reserve)}%`;
    load.textContent = state.facility.loadShed ? 'LOAD SHED ACTIVE' : 'LOAD NOMINAL';
    load.classList.toggle('facility-alert', state.facility.loadShed);
    grid.replaceChildren();

    systems.forEach((system) => {
      const card = document.createElement('article');
      card.className = `facility-system facility-${system.status}`;
      const cooldown = Math.ceil(system.repairCooldown);
      const disabled = Boolean(state.afterAction) || (system.condition >= 100 && system.fault === 'none') || cooldown > 0;
      card.innerHTML = `
        <div class="facility-system-heading"><strong>${system.label}</strong><span>${system.status.toUpperCase()}</span></div>
        <div class="facility-meter" aria-label="${system.label} condition ${Math.round(system.condition)} percent"><span style="width:${Math.round(system.condition)}%"></span></div>
        <div class="facility-system-meta"><span>${Math.round(system.condition)}% CONDITION</span><span>${system.fault !== 'none' ? `${system.fault.toUpperCase()} ${Math.ceil(system.faultRemaining)}s` : 'NO ACTIVE FAULT'}</span></div>
        <p>${system.impact}</p>
        <button type="button" data-facility-repair="${system.id}" ${disabled ? 'disabled' : ''}>${cooldown > 0 ? `COOLDOWN ${cooldown}s` : 'STABILIZE'}</button>`;
      grid.appendChild(card);
    });
  }

  grid.addEventListener('click', (event) => {
    const button = event.target.closest('[data-facility-repair]');
    const state = Facility.getCurrentState();
    if (!button || !state) return;
    Core.repairFacilitySystem(state, button.dataset.facilityRepair);
    render();
  });

  render();
  window.setInterval(render, 1000);
})();
