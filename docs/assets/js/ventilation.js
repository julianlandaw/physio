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
  VD: ['Airway dead space (VD)', 'mL BTPS', 1],
  CO2Gradient: ['Assumed PaCO₂ − EtCO₂', 'mmHg', 0.1],
  FRC: ['Resting alveolar volume', 'L at set PEEP', 0.1],
  CO2Store: ['Tissue-equivalent CO₂ storage', 'L equivalent gas volume', 1],
  CO2Initial: ['Initial alveolar CO₂', 'mmHg', 1],
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
        <div class="timing-controls"><label for="timingMode">Enter timing as</label><select id="timingMode"><option value="fraction">Inspiratory fraction</option><option value="ti">Inspiratory time (Ti)</option><option value="ie">I:E ratio (1:E)</option></select>
        <label for="timingValue" id="timingValueLabel" hidden>Inspiratory time (s)</label><input id="timingValue" type="number" step="any" hidden><p id="timingError" class="field-error"></p>
        <label class="check"><input id="keepTi" type="checkbox"> Keep Ti fixed when changing rate</label></div>
        <p class="control-group-label">Lung mechanics</p><div class="controls" id="lungControls"></div>
        <details class="advanced"><summary>Hold, expiration &amp; run options</summary>
          <div class="controls" id="advancedControls"></div>
          <label class="check"><input id="linkResistance" type="checkbox" checked> Use the same resistance for inspiration and expiration</label>
          <label class="scenario-label" for="initialState">Initial lung state</label><select id="initialState"><option value="startup">Start from rest at set PEEP</option><option value="steady">Periodic steady state</option></select>
        </details>
        <details class="advanced"><summary>CO₂ &amp; capnogram options</summary>
          <div class="controls" id="co2Controls"></div>
          <label class="scenario-label" for="capnogramShape">CO₂ tracing</label>
          <select id="capnogramShape"><option value="transport">Dynamic airway transport</option><option value="auto">Illustrative shape: follows resistance</option><option value="reference">Illustrative reference shape</option><option value="obstructive">Illustrative obstructive shape</option></select>
          <button type="button" id="continueCO2" disabled>Start CO₂ from baseline end</button><p class="small" id="co2StartNote">CO₂ starts from the initial pressure above. Mechanics start from the selected lung state.</p>
        </details>
        <div class="timing" id="timingReadout" aria-label="Calculated breath timing"></div>
      </details>
      <section class="results-column" aria-label="Predicted ventilation">
        <div id="ventilationErrors" class="validation" role="alert" hidden></div>
        <p id="breathCaption" class="breath-caption"></p><section class="metrics" id="metrics" aria-label="Selected breath measurements"></section>
        <details class="additional"><summary>Plateau, mean pressure &amp; additional measurements</summary><div id="additionalMetrics" class="metrics"></div></details>
        <p id="emptyingNote" class="emptying-note"></p>
        <section class="card plot-card" aria-label="Ventilator waveforms">
          <div class="chart-toolbar">
            <button id="playVent" type="button">Play</button><button id="rewindVent" type="button">Rewind</button><label for="playbackSpeed">Speed<select id="playbackSpeed"><option value="0.5">½×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="4">4×</option></select></label><span id="playbackStatus" class="small" role="status">Paused</span>
            <label for="viewWindow">View<select id="viewWindow"><option value="three">Three breaths</option><option value="breath">Selected breath</option><option value="full">Full run</option><option value="monitor">Monitor window</option></select></label>
            <label for="breathSelect">Breath<select id="breathSelect"></select></label>
            <label for="flowUnit">Flow<select id="flowUnit"><option value="L/min">L/min</option><option value="L/s">L/s</option></select></label>
            <label class="check"><input id="showAlveolar" type="checkbox"> Alveolar pressure</label>
            <label class="check"><input id="lockAxes" type="checkbox"> Lock scales</label>
            <label class="check"><input id="showTeaching" type="checkbox"> Teaching annotations</label>
          </div>
          <svg class="plot" id="plot" role="img" aria-label="Pressure, volume, flow, and CO₂ capnogram waveforms"></svg>
          <div class="legend"><span style="--line:#2563eb">Airway pressure</span><span style="--line:#0f766e">Volume</span><span style="--line:#9a5105">Flow</span><span style="--line:#7c3aed">CO₂ capnogram</span><span id="alveolarLegend" style="--line:#b42355" hidden>Alveolar pressure</span><span class="dash" id="baselineLegend" hidden>Frozen baseline</span></div>
          <p class="phase-key">Blue shading: inspiration · amber shading: hold · unshaded: expiration. Dashed pressure reference: set PEEP.</p>
          <p class="phase-key" id="capnogramNote"></p>
          <p class="axis-note" id="axisNote" hidden>Some values exceed the locked scales. Unlock scales to see their full range.</p>
          <div class="inspection"><div class="inspection-controls"><label for="ventCursor">Inspect time (s)<input id="ventCursor" type="number" min="0" step="any" value="0"></label><label for="ventCursorSlider" class="sr-only">Inspection time in seconds</label><input id="ventCursorSlider" type="range" min="0" step="any" value="0"></div><div class="inspection-values" id="ventCursorValues" role="status"></div></div>
        </section>
        <details class="card loops-card" id="loopsPanel"><summary>Pressure–volume &amp; flow–volume loops</summary><p id="loopCaption" class="small"></p><div class="loop-grid"><svg id="pvLoop" class="loop-plot" role="img" tabindex="0" aria-label="Pressure-volume loop; click to inspect time"></svg><svg id="fvLoop" class="loop-plot" role="img" tabindex="0" aria-label="Flow-volume loop; click to inspect time"></svg></div><p class="small">Blue: inspiration/hold · amber: expiration · dashed: frozen baseline. Click a loop to inspect the corresponding time. Volume is above set-PEEP equilibrium; transient breaths may form open loops.</p></details>
        <section class="card co2-card" aria-labelledby="co2Heading">
          <h2 id="co2Heading">Selected-breath CO₂</h2>
          <div class="co2-readings" id="co2Readings"></div>
          <p class="small" id="co2Note"></p>
        </section>
        <div class="button-row" style="margin-top:10px"><div><button type="button" id="freezeBaseline">Freeze baseline</button> <button type="button" id="clearBaseline" disabled>Clear baseline</button></div><label for="comparisonMode">Compare by <select id="comparisonMode"><option value="absolute">Absolute time</option><option value="aligned">Start of inspiration</option></select></label></div><p id="baselineNote" class="baseline-note"></p><p id="settingsChanges" class="small"></p>
      </section>
    </div>
    <details class="card model"><summary>Model assumptions, scenario values &amp; sources</summary>
      <p>Passive linear single compartment, ideal pressure/flow control, no leaks or patient effort. Compliance represents the respiratory system. Volume is above its equilibrium volume at set PEEP. Expiratory airway pressure is set PEEP; alveolar pressure can remain higher when emptying is incomplete.</p>
      <p><code>τ = R × C; PCV: V(t) = C × ΔP + [V₀ − C × ΔP] × exp(−t/τᵢ); VCV flow: V(t) = V₀ + flow × t; expiration: V(t) = Vₑᵢ × exp(−t/τₑ).</code> Holds have zero flow. Each phase is solved exactly, including its boundaries.</p>
      <p>Metrics describe the selected complete breath, including actual volume change during inspiration and expiration. Plateau pressure requires a VCV hold. In PCV, pressure at the airway opening is not assumed to be a plateau if flow continues. Driving pressure, when available, uses plateau minus total PEEP at breath start. Timing can be entered as inspiratory fraction, Ti or I:E. The keep-Ti option preserves inspiratory time when rate changes; invalid combinations retain the last valid run.</p>
      <p>These examples illustrate mechanics, not recommended ventilator settings. Real COPD and bronchospasm involve heterogeneity, nonlinear resistance, and sometimes dynamic expiratory flow limitation that this model does not reproduce.</p>
      <p>Dynamic CO₂ uses a well-mixed lung gas store (resting volume plus tidal volume), a tissue-equivalent CO₂ store, metabolic production, and bidirectional airway transport. Inspired gas has zero CO₂; expired gas leaves through the same airway parcels that return residual CO₂ on inspiration. A 40 ms sensor response smooths the sampled signal without altering the gas mass balance. EtCO₂ is the sensor value at the end of each complete expiration, not a repeating steady-state amplitude.</p>
      <p>Illustrative defaults: resting alveolar volume 2.5 L, tissue-equivalent CO₂ storage 20 L, initial alveolar CO₂ 40 mmHg, airway dead space 150 mL, metabolic production 200 mL/min STPD, and equivalent exchange conductance 0.5 L/s (not blood flow). Gas amounts use BTPS; conversion is 863/713 at sea level. These are teaching assumptions, not patient-specific fitted values. Tissue stores model buffering in equivalent gas-volume units, not anatomical tissue volume. The airway dead-space input now represents transported conducting-airway volume, rather than the previous estimator's physiologic dead space. No separate alveolar dead space, V/Q heterogeneity, shunt, circulation delays or acid–base chemistry are modeled.</p>
      <p>The assumed Pa–Et gradient only adds to sampled EtCO₂ to show an arterial estimate; it does not shift the gas-transport signal or predict V/Q mismatch. Approximate steady alveolar ventilation remains <code>max(VTsteady − VD, 0) × RR / 1000</code> L/min. Unlike the old steady-state estimate, low ventilation can retain CO₂ in finite stores while producing a small capnogram. Each settings edit restarts the run; “Start CO₂ from baseline end” instead uses the frozen selected breath's end lung/tissue concentrations, sensor value and airway contents. Mechanics restart separately. This continued CO₂ start is local to the page and resets with Reset; mode links transfer parameter values, not stored gas history.</p>
      <p>Dynamic airway transport is the default tracing. Optional legacy reference/obstructive shapes remain illustrative overlays with evolving breath amplitudes; their time fractions are not a validated resistance-to-capnogram relationship. Teaching annotations label phases approximately from airway CO₂ relative to alveolar CO₂. The simplified dynamic model is mass-conserving but is not a validated clinical gas-exchange simulator.</p>
      <p>Modeling background: <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC4737892/">lung/tissue CO₂ mass-balance study</a>; <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC8354828/">body gas-store modeling</a>. These support the concepts, not these specific parameters or implementation. <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC10115549/">Bronchospasm capnogram case study</a> provides background on obstructive shape.</p>
      <table class="source-table"><thead><tr><th>Example</th><th>Rᵢ / Rₑ<br>cm H₂O/(L/s)</th><th>C<br>mL/cm H₂O</th><th>τₑ<br>s</th></tr></thead><tbody id="caseTable"></tbody></table>
      <ul><li><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC11107031/">2024 PCV bench study</a>: COPD bench compliance 60 with obstructive resistances including 20. This supports the COPD-like mechanics example, not all of its clinical behavior.</li><li><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC7925949/">2021 respiratory-mechanics bench study</a>: obstructive R 20/C 50 and restrictive R 10/C 25 examples. Our bronchospasm-like R 30/C 50 is an illustrative extension, not a validated disease parameter set.</li><li><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC3376482/">Respiratory compartment model equations</a>.</li></ul>
    </details>`;
  for (const field of [ventMode === 'vcv' ? 'VT' : 'PC', 'PEEP', 'RR', 'IF'])
    addVentControl(field, 'ventilatorControls');
  for (const field of ['R', 'C']) addVentControl(field, 'lungControls');
  for (const field of [...(ventMode === 'vcv' ? ['HF'] : []), 'Rexp', 'T'])
    addVentControl(field, 'advancedControls');
  for (const field of ['VCO2', 'VD', 'CO2Gradient', 'FRC', 'CO2Store', 'CO2Initial'])
    addVentControl(field, 'co2Controls');
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
    if (field === 'CO2Initial' && ventCO2Seed) {
      ventCO2Seed = null;
      ventElement('co2StartNote').textContent =
        'CO₂ starts from the initial pressure above. Mechanics start from the selected lung state.';
      ventForceRun = true;
    }
    const value = readVentNumber(number.value);
    if (Number.isFinite(value)) range.value = value;
    if (['R', 'Rexp', 'C'].includes(field)) {
      ventCaseId = 'custom';
      ventElement('lungCase').value = 'custom';
    }
    if (field === 'R' && ventElement('linkResistance').checked)
      ventInputs.get('Rexp').number.value = number.value;
    if (field === 'RR') preserveVentTi(value);
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
  const p = {
    ...ventSettings,
    mode: ventMode,
    initial: ventElement('initialState').value,
    capnogramShape: ventElement('capnogramShape').value,
  };
  for (const [field, control] of ventInputs) p[field] = readVentNumber(control.number.value);
  if (ventElement('timingMode').value === 'ti')
    p.IF = readVentNumber(ventElement('timingValue').value) / (60 / p.RR);
  if (ventElement('timingMode').value === 'ie')
    p.IF = 1 / (1 + readVentNumber(ventElement('timingValue').value));
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
  const timingInvalid = errors.some((e) => e.field === 'IF');
  ventElement('timingError').textContent = timingInvalid
    ? 'Timing must leave 5–80% of the cycle for inspiration. Check Ti, I:E and rate.'
    : '';
  ventElement('timingValue').setAttribute('aria-invalid', String(timingInvalid));
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
  ventElement('capnogramShape').value = next.capnogramShape;
  syncVentTiming(next.IF, next.RR);
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
  if (!ventRun || ventForceRun || JSON.stringify(p) !== JSON.stringify(ventRun.settings)) {
    stopVentPlayback();
    ventPlayback.time = 0;
    if (ventElement('viewWindow').value === 'monitor') ventElement('viewWindow').value = 'three';
    ventRun = Ventilation.simulate(p, { co2State: ventCO2Seed });
    ventForceRun = false;
    ventBreathIndex = ventRun.completeBreaths.length - 1;
  }
  if (ventBreathIndex < 0 || ventBreathIndex >= ventRun.completeBreaths.length)
    ventBreathIndex = ventRun.completeBreaths.length - 1;
  ventSettings = p;
  for (const [field, control] of ventInputs) control.range.value = p[field];
  if (ventElement('linkResistance').checked) ventInputs.get('Rexp').number.value = p.R;
  ventInputs.get('IF').number.value = p.IF;
  ventElement('settingsSummary').textContent =
    `${ventMode === 'vcv' ? `${ventFormat(p.VT, 0)} mL` : `ΔP ${ventFormat(p.PC)} cm H₂O`} · ${ventFormat(p.RR)} /min · R ${ventFormat(p.R)} · C ${ventFormat(p.C, 0)}`;
  updateModeLinks();
  renderBreathSelect();
  renderVentMetrics();
  renderTiming();
  drawVentilation();
  drawVentLoops();
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
  select.disabled = !ventRun.completeBreaths.length || ventPlayback.active;
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
    if (Number.isFinite(value) && Number.isFinite(baselineValue)) {
      const delta = value - baselineValue;
      was.textContent += ` · Δ ${delta >= 0 ? '+' : ''}${ventFormat(delta, digits)}`;
    }
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
    : ventElement('viewWindow').value === 'monitor'
      ? 'No complete breath yet in playback. Continue playing to see completed-breath measurements.'
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
  ventElement('continueCO2').disabled = !ventBaseline;
  renderVentComparison();
}
function renderVentCO2() {
  const m = ventRun.completeBreaths[ventBreathIndex]?.metrics,
    old = ventBaseline?.metrics,
    gas = ventRun.gasExchange;
  const readings = ventElement('co2Readings');
  readings.replaceChildren();
  for (const [key, label, digits] of [
    ['EtCO2', 'Estimated EtCO₂ (mmHg)', 1],
    ['EstimatedPaCO2', 'EtCO₂ + assumed Pa–Et gradient (mmHg)', 1],
  ])
    ventMetric(readings, m?.[key], label, old?.[key], digits);
  ventElement('co2Note').textContent =
    `EtCO₂ is sampled at the end of the selected complete breath. CO₂ evolves through lung/tissue storage and airway transit; the assumed Pa–Et gradient affects only the arterial estimate. Approximate steady alveolar ventilation: ${ventFormat(gas.alveolarVentilation, 2)} L/min. This simplified model has no V/Q heterogeneity or validated disease-specific CO₂ kinetics.`;
  ventElement('capnogramNote').textContent =
    ventSettings.capnogramShape === 'transport'
      ? 'Dynamic CO₂: lung/tissue stores, bidirectional airway transit and a 40 ms sensor response. Dots mark each breath’s end-expiratory CO₂.'
      : 'Illustrative shape overlay with evolving breath amplitudes. Select Dynamic airway transport for the mass-balance model’s tracing.';
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
  if (ventElement('viewWindow').value === 'monitor') {
    const span = Math.min(ventSettings.T, 3 * ventRun.timing.cycle);
    return [Math.max(0, ventPlayback.time - span), Math.max(span, ventPlayback.time)];
  }
  if (ventAligned()) {
    const b = ventRun.completeBreaths[ventBreathIndex];
    return [
      b.start,
      b.start + Math.max(b.end - b.start, ventBaseline.breath.end - ventBaseline.breath.start),
    ];
  }
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
  if (!Number.isFinite(time) || time < start || time > Math.min(end, ventSettings.T)) {
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
    `${ventFormat(time, 2)} s · breath ${point.breath} · ${point.phase} · Paw ${ventFormat(point.p, 2)} cm H₂O · Palv ${ventFormat(point.palv, 2)} cm H₂O · V ${ventFormat(point.v, 1)} mL · Flow ${ventFormat(point.f * scale, 2)} ${ventElement('flowUnit').value} · CO₂ ${ventFormat(point.co2, 1)} mmHg (${point.co2Phase})${ventValid ? '' : ' · last valid run'}`;
  updateVentCursorLines(time);
  updateVentLoopCursor(time);
}
function refreshVentView() {
  drawVentilation();
  renderVentMetrics();
  drawVentLoops();
}

(function initVentilator() {
  buildVentilator();
  initVentExtras();
  ventElement('settingsPanel').open = !window.matchMedia('(max-width: 700px)').matches;
  ventElement('lungCase').addEventListener('change', (event) => {
    const item = VENTILATION_CASES.find((c) => c.id === event.target.value);
    if (item)
      setVentSettings({ ...readVentSettings(), R: item.R, Rexp: item.R, C: item.C }, item.id);
  });
  ventElement('resetBtn').addEventListener('click', () => {
    stopVentPlayback();
    ventPlayback.time = 0;
    ventElement('viewWindow').value = 'three';
    ventCO2Seed = null;
    ventForceRun = true;
    ventElement('co2StartNote').textContent =
      'CO₂ starts from the initial pressure above. Mechanics start from the selected lung state.';
    ventElement('timingMode').value = 'fraction';
    ventElement('keepTi').checked = false;
    updateVentTimingMode();
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
  ventElement('capnogramShape').addEventListener('change', simulateAndDraw);
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
      if (ventRun) {
        drawVentilation();
        drawVentLoops();
      }
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
