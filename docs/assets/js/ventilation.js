/* Copyright (c) 2026 Julian W. Landaw | SPDX-License-Identifier: MIT */
const ventMode = document.body.dataset.ventilationMode;
const ventPrefix = ventMode === 'vcv' ? 'vcv' : 'pcv';
const ventFields = {
  VT: ['Tidal volume', 'mL', 1],
  PC: ['Pressure above PEEP', 'cm H₂O', 0.1],
  PEEP: ['PEEP', 'cm H₂O', 0.1],
  RR: ['Respiratory rate', 'breaths/min', 0.1],
  IF: ['Inspiratory fraction', 'of cycle', 0.01],
  HF: ['Inspiratory hold', 'fraction of Ti', 0.01],
  R: ['Inspiratory resistance', 'cm H₂O/(L/s)', 0.1],
  Rexp: ['Expiratory resistance', 'cm H₂O/(L/s)', 0.1],
  C: ['Compliance', 'mL/cm H₂O', 1],
  T: ['Simulation duration', 's', 1],
  VCO2: ['CO₂ production (V̇CO₂)', 'mL/min STPD', 1],
  VD: ['Physiologic dead space (VD)', 'mL/breath BTPS', 1],
  CO2Gradient: ['Assumed PaCO₂ − EtCO₂', 'mmHg', 0.1],
};
let ventSettings = { ...Ventilation.defaults, mode: ventMode },
  ventRun = null,
  ventBaseline = null;
let ventValid = true,
  ventBreathIndex = -1,
  ventCaseId = 'reference',
  ventCursorTime = 0;
const ventInputs = new Map();
const ventElement = (id) => document.getElementById(id);
const ventFormat = (value, digits = 1) =>
  value == null || !Number.isFinite(value) ? '—' : value.toFixed(digits);

function buildVentilator() {
  ventElement('ventilatorApp').innerHTML = `
    <div class="workspace">
      <details class="card settings" id="settingsPanel" open aria-labelledby="settingsHeading">
        <summary class="settings-toggle">Adjust settings <span id="settingsSummary"></span></summary>
        <div class="card-heading"><h2 id="settingsHeading">Settings</h2><button id="resetBtn" type="button">Reset</button></div>
        <label class="scenario-label" for="lungCase">Lung-mechanics example</label><select id="lungCase"></select><p class="scenario-note" id="scenarioNote"></p>
        <p class="control-group-label">Ventilator</p><div class="controls" id="ventilatorControls"></div>
        <p class="control-group-label">Lung mechanics</p><div class="controls" id="lungControls"></div>
        <details class="advanced"><summary>Hold, expiration &amp; run options</summary>
          <div class="controls" id="advancedControls"></div>
          <label class="check"><input id="linkResistance" type="checkbox" checked> Use the same resistance for inspiration and expiration</label>
          <label class="scenario-label" for="initialState">Initial lung state</label><select id="initialState"><option value="startup">Start from rest at set PEEP</option><option value="steady">Periodic steady state</option></select>
        </details>
        <details class="advanced"><summary>CO₂ estimate assumptions</summary>
          <div class="controls" id="co2Controls"></div>
          <p class="small">Illustrative defaults: V̇CO₂ 200 mL/min, dead space 150 mL, Pa–Et gradient 5 mmHg. Lung-mechanics examples preserve these values; they do not set disease-specific gas exchange.</p>
        </details>
        <div class="timing" id="timingReadout" aria-label="Calculated breath timing"></div>
      </details>
      <section class="results-column" aria-label="Predicted ventilation">
        <div id="ventilationErrors" class="validation" role="alert" hidden></div>
        <p id="breathCaption" class="breath-caption"></p><section class="metrics" id="metrics" aria-label="Selected breath measurements"></section>
        <details class="additional"><summary>Plateau, mean pressure &amp; additional measurements</summary><div id="additionalMetrics" class="metrics"></div></details>
        <p id="emptyingNote" class="emptying-note"></p>
        <section class="card co2-card" aria-labelledby="co2Heading">
          <h2 id="co2Heading">Steady-state EtCO₂ estimate</h2>
          <div class="co2-readings" id="co2Readings"></div>
          <p class="small" id="co2Note"></p>
        </section>
        <section class="card plot-card" aria-label="Ventilator waveforms">
          <div class="chart-toolbar">
            <label for="viewWindow">View<select id="viewWindow"><option value="three">Three breaths</option><option value="breath">Selected breath</option><option value="full">Full run</option></select></label>
            <label for="breathSelect">Breath<select id="breathSelect"></select></label>
            <label for="flowUnit">Flow<select id="flowUnit"><option value="L/min">L/min</option><option value="L/s">L/s</option></select></label>
            <label class="check"><input id="showAlveolar" type="checkbox"> Alveolar pressure</label>
            <label class="check"><input id="lockAxes" type="checkbox"> Lock scales</label>
          </div>
          <svg class="plot" id="plot" role="img" aria-label="Pressure, volume, and flow waveforms"></svg>
          <div class="legend"><span style="--line:#2563eb">Airway pressure</span><span style="--line:#0f766e">Volume</span><span style="--line:#9a5105">Flow</span><span id="alveolarLegend" style="--line:#b42355" hidden>Alveolar pressure</span><span class="dash" id="baselineLegend" hidden>Frozen baseline</span></div>
          <p class="phase-key">Blue shading: inspiration · amber shading: hold · unshaded: expiration. Dashed pressure reference: set PEEP.</p>
          <p class="axis-note" id="axisNote" hidden>Some values exceed the locked scales. Unlock scales to see their full range.</p>
          <div class="inspection"><div class="inspection-controls"><label for="ventCursor">Inspect time (s)<input id="ventCursor" type="number" min="0" step="any" value="0"></label><label for="ventCursorSlider" class="sr-only">Inspection time in seconds</label><input id="ventCursorSlider" type="range" min="0" step="any" value="0"></div><div class="inspection-values" id="ventCursorValues" role="status"></div></div>
        </section>
        <div class="button-row" style="margin-top:10px"><div><button type="button" id="freezeBaseline">Freeze baseline</button> <button type="button" id="clearBaseline" disabled>Clear baseline</button></div></div><p id="baselineNote" class="baseline-note"></p>
      </section>
    </div>
    <details class="card model"><summary>Model assumptions, scenario values &amp; sources</summary>
      <p>Passive linear single compartment, ideal pressure/flow control, no leaks or patient effort. Compliance represents the respiratory system. Volume is above its equilibrium volume at set PEEP. Expiratory airway pressure is set PEEP; alveolar pressure can remain higher when emptying is incomplete.</p>
      <p><code>τ = R × C; PCV: V(t) = C × ΔP + [V₀ − C × ΔP] × exp(−t/τᵢ); VCV flow: V(t) = V₀ + flow × t; expiration: V(t) = Vₑᵢ × exp(−t/τₑ).</code> Holds have zero flow. Each phase is solved exactly, including its boundaries.</p>
      <p>Metrics describe the selected complete breath, including actual volume change during inspiration and expiration. Plateau pressure requires a VCV hold. In PCV, pressure at the airway opening is not assumed to be a plateau if flow continues. Driving pressure, when available, uses plateau minus total PEEP at breath start. Changing respiratory rate keeps the inspiratory fraction fixed.</p>
      <p>These examples illustrate mechanics, not recommended ventilator settings. Real COPD and bronchospasm involve heterogeneity, nonlinear resistance, and sometimes dynamic expiratory flow limitation that this model does not reproduce.</p>
      <p>CO₂ is a separate steady-state estimate: <code>V̇A = max(VTsteady − VD, 0) × RR / 1000; PaCO₂ ≈ 0.863 × V̇CO₂ / V̇A; EtCO₂ ≈ PaCO₂ − assumed gradient.</code> VTsteady comes from the periodic steady-state mechanics, in mL; V̇A is L/min BTPS and V̇CO₂ is mL/min STPD. Thus startup, run duration and selected breath do not change this estimate. Inspired CO₂ is assumed zero. No body CO₂ stores, washout dynamics, perfusion, V/Q distribution or capnogram shape are modeled. The positive Pa–Et gradient is user-assumed, not predicted from resistance or compliance. There is no finite steady-state estimate when VTsteady ≤ VD. Impossible sea-level pressures (≥713 mmHg) and gradients that would give nonpositive EtCO₂ are reported as unavailable, without clamping.</p>
      <p>CO₂ background: <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC4737892/">CO₂ gas-exchange modeling study</a> (mass balance and unit conversion); <a href="https://pubmed.ncbi.nlm.nih.gov/14633572/">arterial-to-end-tidal gradient modeling study</a>. These references support the concepts, not validation of this simplified estimator.</p>
      <table class="source-table"><thead><tr><th>Example</th><th>Rᵢ / Rₑ<br>cm H₂O/(L/s)</th><th>C<br>mL/cm H₂O</th><th>τₑ<br>s</th></tr></thead><tbody id="caseTable"></tbody></table>
      <ul><li><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC11107031/">2024 PCV bench study</a>: COPD bench compliance 60 with obstructive resistances including 20. This supports the COPD-like mechanics example, not all of its clinical behavior.</li><li><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC7925949/">2021 respiratory-mechanics bench study</a>: obstructive R 20/C 50 and restrictive R 10/C 25 examples. Our bronchospasm-like R 30/C 50 is an illustrative extension, not a validated disease parameter set.</li><li><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC3376482/">Respiratory compartment model equations</a>.</li></ul>
    </details>`;
  for (const field of [ventMode === 'vcv' ? 'VT' : 'PC', 'PEEP', 'RR', 'IF'])
    addVentControl(field, 'ventilatorControls');
  for (const field of ['R', 'C']) addVentControl(field, 'lungControls');
  for (const field of [...(ventMode === 'vcv' ? ['HF'] : []), 'Rexp', 'T'])
    addVentControl(field, 'advancedControls');
  for (const field of ['VCO2', 'VD', 'CO2Gradient']) addVentControl(field, 'co2Controls');
  for (const item of VENTILATION_CASES) {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.label;
    ventElement('lungCase').append(option);
    const row = document.createElement('tr');
    [item.label, `${item.R} / ${item.R}`, item.C, ventFormat((item.R * item.C) / 1000, 2)].forEach(
      (value) => {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.append(cell);
      },
    );
    ventElement('caseTable').append(row);
  }
  const custom = document.createElement('option');
  custom.value = 'custom';
  custom.textContent = 'Custom mechanics';
  ventElement('lungCase').append(custom);
}

function addVentControl(field, containerId) {
  const [label, unit, step] = ventFields[field],
    [min, max] = Ventilation.limits[field];
  const wrapper = document.createElement('div');
  wrapper.className = 'control';
  const name = document.createElement('label');
  name.id = `${ventPrefix}${field}Label`;
  name.htmlFor = `${ventPrefix}${field}`;
  name.append(document.createTextNode(label));
  const units = document.createElement('span');
  units.className = 'unit';
  units.textContent = unit;
  name.append(' ', units);
  const number = document.createElement('input');
  number.id = `${ventPrefix}${field}`;
  number.type = 'number';
  number.min = min;
  number.max = max;
  number.step = 'any';
  number.inputMode = 'decimal';
  const range = document.createElement('input');
  range.type = 'range';
  range.id = `${number.id}Slider`;
  range.min = min;
  range.max = max;
  range.step = step;
  range.setAttribute('aria-labelledby', name.id);
  const error = document.createElement('span');
  error.className = 'field-error';
  error.id = `${number.id}Error`;
  number.setAttribute('aria-describedby', error.id);
  range.setAttribute('aria-describedby', error.id);
  wrapper.append(name, number, range, error);
  ventElement(containerId).append(wrapper);
  ventInputs.set(field, { wrapper, number, range, error });
  number.addEventListener('input', () => {
    const value = readVentNumber(number.value);
    if (Number.isFinite(value)) range.value = value;
    if (['R', 'Rexp', 'C'].includes(field)) {
      ventCaseId = 'custom';
      ventElement('lungCase').value = 'custom';
    }
    if (field === 'R' && ventElement('linkResistance').checked)
      ventInputs.get('Rexp').number.value = number.value;
    simulateAndDraw();
  });
  range.addEventListener('input', () => {
    number.value = range.value;
    number.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function readVentNumber(value) {
  return String(value).trim() === '' ? NaN : Number(value);
}
function readVentSettings() {
  const p = { ...ventSettings, mode: ventMode, initial: ventElement('initialState').value };
  for (const [field, control] of ventInputs) p[field] = readVentNumber(control.number.value);
  if (ventElement('linkResistance').checked) p.Rexp = p.R;
  return p;
}
function showVentErrors(errors) {
  for (const control of ventInputs.values()) {
    control.wrapper.classList.remove('invalid');
    control.number.removeAttribute('aria-invalid');
    control.error.textContent = '';
  }
  for (const error of errors) {
    const control = ventInputs.get(error.field);
    if (control) {
      control.wrapper.classList.add('invalid');
      control.number.setAttribute('aria-invalid', 'true');
      control.error.textContent = `Enter ${control.number.min}–${control.number.max} ${ventFields[error.field][1]}.`;
    }
  }
  const summary = ventElement('ventilationErrors');
  summary.hidden = !errors.length;
  summary.textContent = errors.length
    ? 'Results have not updated. Correct the highlighted settings; the waveforms and measurements retain the last valid run.'
    : '';
  ventElement('freezeBaseline').disabled = Boolean(errors.length);
}
function setVentSettings(p, caseId = 'custom') {
  const next = { ...Ventilation.defaults, ...p, mode: ventMode };
  if (!Ventilation.validate(next).length) ventSettings = next;
  ventCaseId = caseId;
  for (const [field, control] of ventInputs)
    control.number.value = control.range.value = next[field];
  const linked = Math.abs(next.R - next.Rexp) < 1e-10;
  ventElement('linkResistance').checked = linked;
  ventInputs.get('Rexp').number.disabled = ventInputs.get('Rexp').range.disabled = linked;
  ventElement('initialState').value = next.initial;
  ventElement('lungCase').value = caseId;
  ventBreathIndex = -1;
  simulateAndDraw();
}
function simulateAndDraw() {
  const p = readVentSettings(),
    errors = Ventilation.validate(p);
  updateVentCaseNote();
  showVentErrors(errors);
  ventValid = !errors.length;
  if (!ventValid) return;
  if (!ventRun || JSON.stringify(p) !== JSON.stringify(ventRun.settings)) {
    ventRun = Ventilation.simulate(p);
    ventBreathIndex = ventRun.completeBreaths.length - 1;
  }
  if (ventBreathIndex < 0 || ventBreathIndex >= ventRun.completeBreaths.length)
    ventBreathIndex = ventRun.completeBreaths.length - 1;
  ventSettings = p;
  for (const [field, control] of ventInputs) control.range.value = p[field];
  if (ventElement('linkResistance').checked) ventInputs.get('Rexp').number.value = p.R;
  ventElement('settingsSummary').textContent =
    `${ventMode === 'vcv' ? `${ventFormat(p.VT, 0)} mL` : `ΔP ${ventFormat(p.PC)} cm H₂O`} · ${ventFormat(p.RR)} /min · R ${ventFormat(p.R)} · C ${ventFormat(p.C, 0)}`;
  updateModeLinks();
  renderBreathSelect();
  renderVentMetrics();
  renderTiming();
  drawVentilation();
  updateVentCursor();
}
function updateVentCaseNote() {
  const item = VENTILATION_CASES.find((c) => c.id === ventCaseId);
  const note = ventElement('scenarioNote');
  note.replaceChildren();
  note.append(
    document.createTextNode(
      item
        ? item.note
        : 'Custom lung mechanics. Changing an example preserves the ventilator settings.',
    ),
  );
  if (item?.source) {
    const link = document.createElement('a');
    link.href = item.source;
    link.textContent = ` ${item.sourceLabel}`;
    note.append(link);
  }
}
function updateModeLinks() {
  document.querySelectorAll('[data-mode-link]').forEach((link) => {
    const url = new URL(link.getAttribute('href').split('?')[0], location.href);
    url.searchParams.set('settings', JSON.stringify(ventSettings));
    url.searchParams.set('case', ventCaseId);
    link.href = url.href;
  });
}
function renderBreathSelect() {
  const select = ventElement('breathSelect');
  select.replaceChildren();
  for (const b of ventRun.completeBreaths) {
    const option = document.createElement('option');
    option.value = b.index;
    option.textContent = String(b.index + 1);
    select.append(option);
  }
  if (!ventRun.completeBreaths.length) {
    const option = document.createElement('option');
    option.textContent = 'Partial';
    select.append(option);
  }
  select.disabled = !ventRun.completeBreaths.length;
  select.value = String(ventBreathIndex);
}
function ventMetric(container, value, label, baselineValue, digits = 1) {
  const item = document.createElement('div');
  item.className = 'metric';
  const number = document.createElement('div');
  number.className = 'num';
  number.textContent = ventFormat(value, digits);
  const text = document.createElement('div');
  text.className = 'lbl';
  text.textContent = label;
  item.append(number, text);
  if (ventBaseline) {
    const was = document.createElement('div');
    was.className = 'was';
    was.textContent = `Baseline ${ventFormat(baselineValue, digits)}`;
    item.append(was);
  }
  container.append(item);
}
function renderVentMetrics() {
  const b = ventRun.completeBreaths[ventBreathIndex],
    m = b?.metrics,
    old = ventBaseline?.metrics;
  ventElement('freezeBaseline').disabled = !ventValid || !b;
  ventElement('breathCaption').textContent = b
    ? `Breath ${b.index + 1} · ${ventFormat(b.start, 2)}–${ventFormat(b.end, 2)} s · ${ventSettings.initial === 'steady' ? 'periodic steady-state initial volume' : 'run started from rest'}`
    : 'No complete breath yet. Waveforms show the partial breath; increase simulation duration for breath measurements.';
  const primary = ventElement('metrics'),
    extra = ventElement('additionalMetrics');
  primary.replaceChildren();
  extra.replaceChildren();
  for (const [key, label, digits] of [
    ['VT', 'Delivered VT (mL)', 0],
    ['Expired', 'Expired VT (mL)', 0],
    ['Peak', 'Peak airway pressure (cm H₂O)', 1],
    ['Intrinsic', 'End-expiratory intrinsic PEEP (cm H₂O)', 2],
  ])
    ventMetric(primary, m?.[key], label, old?.[key], digits);
  for (const [key, label, digits] of [
    ['Plateau', 'Plateau pressure (cm H₂O); requires VCV hold', 1],
    ['Mean', 'Mean airway pressure (cm H₂O)', 1],
    ['Driving', 'Plateau minus start total PEEP (cm H₂O)', 1],
    ['EndExpVolume', 'Retained end-expiratory volume (mL)', 1],
    ['Retained', 'Net retained this breath (mL)', 1],
    ['MinuteVentilation', 'Expired minute ventilation (L/min)', 2],
  ])
    ventMetric(extra, m?.[key], label, old?.[key], digits);
  const q = ventRun.timing;
  renderVentCO2();
  ventElement('emptyingNote').textContent = b
    ? `Expiration: ${ventFormat(q.Te / q.tauE, 2)} time constants; ${ventFormat(100 * Math.exp(-q.Te / q.tauE), 1)}% of end-inspiratory compartment volume remains. Expiratory flow at the breath end: ${ventFormat((-b.Vend / q.tauE) * 60, 1)} L/min.`
    : 'The display distinguishes a partial breath from completed-breath measurements.';
  ventElement('baselineLegend').hidden = !ventBaseline;
  ventElement('clearBaseline').disabled = !ventBaseline;
  ventElement('baselineNote').textContent = ventBaseline
    ? `Frozen baseline: breath ${ventBaseline.breath.index + 1}, ${ventFormat(ventBaseline.breath.start, 2)}–${ventFormat(ventBaseline.breath.end, 2)} s · R ${ventBaseline.run.settings.R}/${ventBaseline.run.settings.Rexp}, C ${ventBaseline.run.settings.C}, RR ${ventBaseline.run.settings.RR}. Dashed curves use the same absolute time axis. Breath measurements refer to this frozen breath. Baseline CO₂ uses periodic steady-state mechanics with V̇CO₂ ${ventBaseline.run.settings.VCO2} mL/min, VD ${ventBaseline.run.settings.VD} mL and Pa–Et gradient ${ventBaseline.run.settings.CO2Gradient} mmHg.`
    : '';
}
function renderVentCO2() {
  const gas = ventRun.gasExchange,
    old = ventBaseline?.run.gasExchange;
  const readings = ventElement('co2Readings');
  readings.replaceChildren();
  for (const [key, label, digits] of [
    ['EtCO2', 'Estimated EtCO₂ (mmHg)', 1],
    ['PaCO2', 'Estimated PaCO₂ (mmHg)', 1],
    ['alveolarVentilation', 'Steady alveolar ventilation (L/min)', 2],
  ])
    ventMetric(readings, gas[key], label, old?.[key], digits);
  const notes = {
    ok: 'This is a steady-state estimate, not a breath-by-breath measurement or a CO₂ washout simulation.',
    'no-ventilation':
      'No finite CO₂ estimate: steady tidal volume does not exceed dead space, so estimated alveolar ventilation is zero.',
    'out-of-range':
      'CO₂ estimate unavailable: these assumptions require a physically impossible steady-state CO₂ pressure at sea level.',
    gradient:
      'EtCO₂ unavailable: the assumed Pa–Et gradient equals or exceeds estimated PaCO₂. Reduce the assumed gradient to obtain a positive estimate.',
  };
  ventElement('co2Note').textContent =
    `${notes[gas.status]} Based on steady VT ${ventFormat(gas.steadyVT, 0)} mL, V̇CO₂ ${ventFormat(ventSettings.VCO2, 0)} mL/min, VD ${ventFormat(ventSettings.VD, 0)} mL and assumed Pa–Et gradient ${ventFormat(ventSettings.CO2Gradient)} mmHg.`;
}
function renderTiming() {
  const q = ventRun.timing,
    container = ventElement('timingReadout');
  container.replaceChildren();
  for (const [label, value] of [
    ['Ti', `${ventFormat(q.Ti, 2)} s`],
    ['Te', `${ventFormat(q.Te, 2)} s`],
    ['I:E', `1:${ventFormat(q.Te / q.Ti, 2)}`],
    ['τᵢ / τₑ', `${ventFormat(q.tauI, 2)} / ${ventFormat(q.tauE, 2)} s`],
    ...(ventMode === 'vcv'
      ? [
          ['Flow time', `${ventFormat(q.Tflow, 2)} s`],
          ['Hold time', `${ventFormat(q.Th, 2)} s`],
          ['Set flow', `${ventFormat(q.flow * 60, 1)} L/min`],
        ]
      : []),
  ]) {
    const item = document.createElement('div');
    item.textContent = label;
    const strong = document.createElement('strong');
    strong.textContent = value;
    item.append(strong);
    container.append(item);
  }
}
function ventWindow() {
  const selected = ventRun.completeBreaths[ventBreathIndex];
  const view = ventElement('viewWindow').value;
  if (view === 'full' || !selected) return [0, ventSettings.T];
  return [
    view === 'breath' ? selected.start : Math.max(0, selected.end - 3 * ventRun.timing.cycle),
    Math.min(selected.end, ventSettings.T),
  ];
}
function updateVentCursor(rawTime = ventCursorTime) {
  if (!ventRun) return;
  const input = ventElement('ventCursor'),
    time = readVentNumber(rawTime),
    [start, end] = ventWindow();
  if (!Number.isFinite(time) || time < start || time > end) {
    input.setAttribute('aria-invalid', 'true');
    return;
  }
  input.removeAttribute('aria-invalid');
  ventCursorTime = time;
  input.value = Number(time.toFixed(4));
  input.min = start;
  input.max = end;
  const slider = ventElement('ventCursorSlider');
  slider.min = start;
  slider.max = end;
  slider.value = time;
  const point = Ventilation.sample(ventRun, time),
    scale = ventElement('flowUnit').value === 'L/min' ? 60 : 1;
  ventElement('ventCursorValues').textContent =
    `${ventFormat(time, 2)} s · breath ${point.breath} · ${point.phase} · Paw ${ventFormat(point.p, 2)} cm H₂O · Palv ${ventFormat(point.palv, 2)} cm H₂O · V ${ventFormat(point.v, 1)} mL · Flow ${ventFormat(point.f * scale, 2)} ${ventElement('flowUnit').value}${ventValid ? '' : ' · last valid run'}`;
  updateVentCursorLines(time);
}
function refreshVentView() {
  drawVentilation();
  renderVentMetrics();
}

(function initVentilator() {
  buildVentilator();
  ventElement('settingsPanel').open = !window.matchMedia('(max-width: 700px)').matches;
  ventElement('lungCase').addEventListener('change', (event) => {
    const item = VENTILATION_CASES.find((c) => c.id === event.target.value);
    if (item)
      setVentSettings({ ...readVentSettings(), R: item.R, Rexp: item.R, C: item.C }, item.id);
  });
  ventElement('resetBtn').addEventListener('click', () => {
    ventBaseline = null;
    ventElement('lockAxes').checked = false;
    setVentSettings(Ventilation.defaults, 'reference');
  });
  ventElement('linkResistance').addEventListener('change', (event) => {
    ventInputs.get('Rexp').number.disabled = ventInputs.get('Rexp').range.disabled =
      event.target.checked;
    if (event.target.checked)
      ventInputs.get('Rexp').number.value = ventInputs.get('R').number.value;
    ventCaseId = 'custom';
    ventElement('lungCase').value = 'custom';
    simulateAndDraw();
  });
  ventElement('initialState').addEventListener('change', simulateAndDraw);
  ventElement('breathSelect').addEventListener('change', (event) => {
    ventBreathIndex = Number(event.target.value);
    refreshVentView();
  });
  for (const id of ['viewWindow', 'flowUnit', 'showAlveolar', 'lockAxes'])
    ventElement(id).addEventListener('change', refreshVentView);
  ventElement('freezeBaseline').addEventListener('click', () => {
    const b = ventRun.completeBreaths[ventBreathIndex];
    if (!ventValid || !b) return;
    ventBaseline = { run: ventRun, breath: b, metrics: { ...b.metrics } };
    refreshVentView();
  });
  ventElement('clearBaseline').addEventListener('click', () => {
    ventBaseline = null;
    refreshVentView();
  });
  ventElement('ventCursor').addEventListener('change', (event) =>
    updateVentCursor(event.target.value),
  );
  ventElement('ventCursorSlider').addEventListener('input', (event) =>
    updateVentCursor(event.target.value),
  );
  document.querySelectorAll('[data-mode-link]').forEach((link) =>
    link.addEventListener('click', (event) => {
      if (!ventValid) {
        event.preventDefault();
        showVentErrors(Ventilation.validate(readVentSettings()));
      }
    }),
  );
  let resizeFrame;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      if (ventRun) drawVentilation();
    });
  });
  const query = new URLSearchParams(location.search);
  let initial = { ...Ventilation.defaults, mode: ventMode },
    caseId = 'reference';
  try {
    const text = query.get('settings');
    if (text) {
      if (text.length > 4096) throw Error('Settings too large');
      const parsed = JSON.parse(text);
      for (const field of Object.keys(Ventilation.defaults))
        if (field !== 'mode' && Object.hasOwn(parsed, field)) initial[field] = parsed[field];
      if (Ventilation.validate(initial).length) throw Error('Invalid shared settings');
      caseId = VENTILATION_CASES.some((c) => c.id === query.get('case'))
        ? query.get('case')
        : 'custom';
      const example = VENTILATION_CASES.find((c) => c.id === caseId);
      if (
        example &&
        (initial.R !== example.R || initial.Rexp !== example.R || initial.C !== example.C)
      )
        caseId = 'custom';
    }
  } catch (error) {
    initial = { ...Ventilation.defaults, mode: ventMode };
    caseId = 'reference';
  }
  setVentSettings(initial, caseId);
})();
