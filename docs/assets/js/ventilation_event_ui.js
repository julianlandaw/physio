/* Copyright (c) 2026 Julian W. Landaw | SPDX-License-Identifier: MIT */
function ventEventTime() {
  return ventPlayback.active ? ventPlayback.time : ventCursorTime;
}
function renderVentEventStatus() {
  if (!ventRun) return;
  const p = ventRun.settings,
    item = VentilationScenarios.catalog[p.eventType],
    time = ventEventTime(),
    on = VentilationScenarios.active(p, time);
  ventElement('eventStatus').setAttribute('aria-live', ventPlayback.active ? 'off' : 'polite');
  const enabled = p.eventType !== 'none';
  // Keep timing fields available when a newly selected event has an invalid
  // schedule and the plot still represents the previous valid run.
  const selectedType = ventElement('eventType').value;
  ventElement('eventSettings').hidden = ventElement('eventActions').hidden =
    selectedType === 'none';
  ventElement('triggerEvent').disabled =
    !ventValid || !enabled || time >= p.T || time >= p.eventOnset - 1e-9;
  ventElement('resolveEvent').disabled =
    !ventValid || !enabled || !on || time <= p.eventOnset + 1e-9 || time >= p.T;
  ventElement('eventLocation').disabled = selectedType !== 'mucus-plug';
  ventElement('eventLocationControl').hidden = selectedType !== 'mucus-plug';
  ventElement('eventSummary').textContent = enabled
    ? `${item.name} · ${time < p.eventOnset ? 'baseline' : on ? 'active' : 'recovery'}`
    : '';
  ventElement('initialState').disabled = enabled;
  const at = enabled
    ? `${item.name}: ${time < p.eventOnset ? 'baseline' : on ? 'active' : 'recovery'} at ${ventFormat(time, 1)} s. `
    : '';
  const warm = ventRun.warmup
    ? `Baseline ${ventRun.warmup.settled ? 'settled' : 'warmed; not fully settled'} over ${ventFormat(ventRun.warmup.seconds, 0)} simulated seconds off-screen. ${ventRun.warmup.reason || ''} `
    : '';
  ventElement('eventStatus').textContent = enabled
    ? `${at}${warm}Onset ${ventFormat(p.eventOnset, 2)} s${p.eventRecovery ? `; recovery ${ventFormat(p.eventRecovery, 2)} s` : ''}. Lung volumes and gas stores persist through both changes.`
    : 'Standard simulator. Select an event, or load the settled reference scenario.';
  ventElement('continueCO2').disabled = enabled || !ventBaseline || !ventValid;
}
function renderVentEventDescription() {
  const p = ventRun.settings,
    item = VentilationScenarios.catalog[p.eventType];
  ventElement('eventPattern').textContent = item.pattern || '';
  ventElement('eventPattern').hidden = p.eventType === 'none';
  ventElement('eventDescription').textContent = item.description || '';
  const sources = ventElement('eventSources');
  sources.replaceChildren();
  for (const [label, url] of item.sources || []) {
    if (sources.childNodes.length) sources.append(' · ');
    const link = document.createElement('a');
    link.href = url;
    link.textContent = label;
    sources.append(link);
  }
  sources.hidden = !sources.childNodes.length;
}
function applyVentEventAction(onset) {
  if (!ventValid || ventSettings.eventType === 'none') return;
  const time = ventEventTime(),
    playing = ventPlayback.active;
  if (time >= ventSettings.T) return;
  if (onset) {
    if (time >= ventSettings.eventOnset) return;
    ventInputs.get('eventOnset').number.value = time;
    if (ventSettings.eventRecovery && ventSettings.eventRecovery <= time)
      ventInputs.get('eventRecovery').number.value = 0;
  } else {
    if (!VentilationScenarios.active(ventSettings, time) || time <= ventSettings.eventOnset) return;
    ventInputs.get('eventRecovery').number.value = time;
  }
  simulateAndDraw();
  if (!ventValid) return;
  ventPlayback.time = time;
  ventCursorTime = time;
  ventElement('viewWindow').value = 'monitor';
  paintVentPlayback();
  if (playing) ventElement('playVent').click();
}
function initVentEventUI() {
  const groups = new Map();
  for (const [value, item] of Object.entries(VentilationScenarios.catalog)) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = item.name;
    if (!item.group) {
      ventElement('eventType').append(option);
      continue;
    }
    if (!groups.has(item.group)) {
      const group = document.createElement('optgroup');
      group.label = item.group;
      groups.set(item.group, group);
      ventElement('eventType').append(group);
    }
    groups.get(item.group).append(option);
  }
  ventElement('eventType').addEventListener('change', () => {
    if (ventElement('eventType').value !== 'none') {
      ventElement('capnogramShape').value = 'transport';
      if (ventMode === 'vcv' && Number(ventInputs.get('pressureLimit').number.value) === 0)
        ventInputs.get('pressureLimit').number.value = 40;
    }
    simulateAndDraw();
  });
  ventElement('eventLocation').addEventListener('change', simulateAndDraw);
  ventElement('loadEventReference').addEventListener('click', () => {
    const type =
      ventElement('eventType').value === 'none' ? 'bronchospasm' : ventElement('eventType').value;
    ventCO2Seed = null;
    ventForceRun = true;
    ventBaseline = null;
    ventElement('keepTi').checked = false;
    ventElement('timingMode').value = 'ie';
    updateVentTimingMode();
    setVentSettings(
      {
        ...Ventilation.defaults,
        mode: ventMode,
        VT: 500,
        PC: 10.4,
        T: 120,
        initial: 'steady',
        pressureLimit: 40,
        eventType: type,
        eventSeverity:
          VentilationScenarios.catalog[type].severity ?? Ventilation.defaults.eventSeverity,
        eventOnset: 30,
        eventRecovery: 90,
      },
      'reference',
    );
    ventBreathIndex = 0;
    renderBreathSelect();
    ventElement('viewWindow').value = 'full';
    ventCursorTime = 0;
    refreshVentView();
  });
  ventElement('triggerEvent').addEventListener('click', () => applyVentEventAction(true));
  ventElement('resolveEvent').addEventListener('click', () => applyVentEventAction(false));
}
