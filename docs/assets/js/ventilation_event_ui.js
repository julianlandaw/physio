/* Copyright (c) 2026 Julian W. Landaw | SPDX-License-Identifier: MIT */
function ventEventTime() {
  return ventPlayback.active ? ventPlayback.time : ventCursorTime;
}
function renderVentEventStatus() {
  if (!ventRun) return;
  const p = ventRun.settings,
    time = ventEventTime(),
    on = VentilationScenarios.active(p, time);
  ventElement('eventStatus').setAttribute('aria-live', ventPlayback.active ? 'off' : 'polite');
  const enabled = p.eventType !== 'none';
  ventElement('triggerEvent').disabled =
    !ventValid || !enabled || time >= p.T || time >= p.eventOnset - 1e-9;
  ventElement('resolveEvent').disabled =
    !ventValid || !enabled || !on || time <= p.eventOnset + 1e-9 || time >= p.T;
  ventElement('eventLocation').disabled = p.eventType !== 'mucus-plug';
  ventElement('initialState').disabled = enabled;
  const at = enabled
    ? `${VentilationScenarios.names[p.eventType]}: ${time < p.eventOnset ? 'baseline' : on ? 'active' : 'recovery'} at ${ventFormat(time, 1)} s. `
    : '';
  const warm = ventRun.warmup
    ? `Baseline ${ventRun.warmup.settled ? 'settled' : 'warmed; not fully settled'} over ${ventFormat(ventRun.warmup.seconds, 0)} simulated seconds off-screen. ${ventRun.warmup.reason || ''} `
    : '';
  ventElement('eventStatus').textContent = enabled
    ? `${at}${warm}Onset ${ventFormat(p.eventOnset, 2)} s${p.eventRecovery ? `; recovery ${ventFormat(p.eventRecovery, 2)} s` : ''}. Lung volumes and gas stores persist through both changes.`
    : 'Standard simulator. Select an event, or load the settled reference scenario.';
  const descriptions = {
    bronchospasm:
      'Diffuse, unequal inspiratory/expiratory narrowing. Severe attacks may yield a low or absent expired CO₂ signal while stores rise; mild cases need not lower EtCO₂.',
    'tube-kink':
      'Resistance in the common endotracheal airway. At severity 1 the airway is completely blocked; proximal sampling gas is washed by fresh circuit gas.',
    'mucus-plug':
      'Choose one region or the common airway. At severity 1 that path is closed. A regional plug can preserve VC volume at the cost of higher pressure, so EtCO₂ need not fall.',
    'air-embolism':
      'Reduced pulmonary CO₂ delivery is represented by reduced lung/tissue exchange conductance. Metabolic production continues. Airway mechanics initially stay the same. This is a perfusion surrogate, not a bubble/circulation model.',
    none: '',
  };
  ventElement('eventDescription').textContent = descriptions[p.eventType];
  ventElement('continueCO2').disabled = enabled || !ventBaseline || !ventValid;
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
  for (const [value, label] of Object.entries(VentilationScenarios.names)) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    ventElement('eventType').append(option);
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
    ventElement('timingMode').value = 'fraction';
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
