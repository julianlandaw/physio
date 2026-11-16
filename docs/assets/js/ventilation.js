/* Copyright (c) 2026 Julian W. Landaw | SPDX-License-Identifier: MIT */
const ventQuery = new URLSearchParams(location.search);
let ventMode = ventQuery.get('mode') === 'pcv' ? 'pcv' : 'vcv';
const ventPrefix = 'vent';
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
  airwayMix: ['Airway mixing fraction', 'of total airway dead space', 0.05],
  regionRatio: ['Slow / fast time-constant ratio', '1 = uniform lung', 0.1],
  modelWeight: ['Ideal weight used for model scaling', 'kg', 1],
  pressureLimit: ['VC pressure ceiling (0 = ideal)', 'cm H₂O absolute', 1],
  eventOnset: ['Event onset', 's', 1],
  eventRecovery: ['Recovery time (0 = none)', 's', 1],
  eventSeverity: ['Event severity (teaching scale)', '0 to 1 (1 = maximal)', 0.05],
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
      <aside class="controls-column" aria-label="Simulation controls">
        <details class="card event-panel" id="eventPanel" open><summary>Practice an acute event <span id="eventSummary" class="summary-value"></span></summary>
          <label class="scenario-label" for="eventType">Event</label><select id="eventType"></select>
          <p class="small" id="eventPattern" hidden></p>
          <div id="eventSettings"><div class="controls event-controls" id="eventControls"></div>
          <div id="eventLocationControl" hidden><label class="scenario-label" for="eventLocation">Mucus plug location</label><select id="eventLocation"><option value="regional">One lung region</option><option value="common">Common endotracheal airway</option></select></div>
          </div><div class="button-row"><button type="button" id="loadEventReference">Load settled reference</button><span id="eventActions"><button type="button" id="triggerEvent">Trigger now</button> <button type="button" id="resolveEvent">Resolve event</button></span></div>
          <p class="small" id="eventStatus" role="status"></p><details class="event-help"><summary>How this event works</summary><p class="small" id="eventDescription"></p><p class="small" id="eventSources" hidden></p>
          <p class="small">Without a patient profile, Load reference sets VT 500 mL / PC 10.4 cm H₂O, rate 12/min, a 40 cm H₂O VC ceiling, onset at 30 s and recovery at 90 s in a 120 s run. A valid patient profile replaces the size-based starting settings. These are teaching settings. Press Play to watch, or inspect a time and trigger/resolve there. Severity changes mechanism strength, not a prescribed CO₂ amplitude. Patterns overlap across causes.</p>
          </details>
        </details>
      <details class="card" id="patientPanel"><summary>Patient &amp; starting settings <span id="patientSummary" class="summary-value"></span></summary>
        <div class="patient-inputs">
          <label for="patientAge">Age (years)<input id="patientAge" type="number" min="1" max="110" step="any" placeholder="e.g. 40" aria-describedby="patientError"></label>
          <label for="patientWeight">Ideal/predicted weight (kg)<input id="patientWeight" type="number" min="5" max="150" step="any" placeholder="e.g. 70" aria-describedby="patientError"></label>
        </div>
        <label class="scenario-label" for="patientVolume">Target tidal volume</label><select id="patientVolume"><option value="6">6 mL/kg</option><option value="7">7 mL/kg</option><option value="8">8 mL/kg</option></select>
        <label class="check patient-scale"><input id="patientScale" type="checkbox" checked> Also scale the teaching lung model</label>
        <p class="small" id="patientPreview">Enter age and ideal/predicted weight to preview a starting example.</p>
        <p id="patientError" class="field-error" role="status"></p>
        <button id="applyPatient" type="button" disabled>Apply starting settings</button><p class="small" id="patientApplied" role="status"></p>
        <details class="event-help"><summary>How these starting settings are chosen</summary>
          <p class="small">Use ideal/predicted weight, not actual weight. This selects a volume example, an age-based child/teen rate or adult reference rate, and PEEP 5. It does not find an optimal clinical prescription. Adult age alone does not determine a different rate. Gas exchange, disease and measured mechanics still matter.</p>
          <p class="small">Supported teaching range: age 1–110 years, ideal weight 5–150 kg. Infants are not modeled. With model scaling enabled, C, dead space, resting lung volume, CO₂ production and stores scale with weight; resistance scales inversely with its square root. These are illustrative size assumptions, not validated pediatric physiology. Uncheck to keep your current lung/gas parameters. Timing is retained; Keep Ti fixed is respected. PC is fitted to the passive baseline model, not an acute event.</p>
          <p class="small">Background: <a href="https://pubmed.ncbi.nlm.nih.gov/39048148/">AARC tidal-volume assessment guidance</a> · <a href="https://www.sciencedirect.com/science/article/abs/pii/S0300957225002795">ERC 2025 age-based respiratory reference table</a>. The rate interpolation, model scaling and PC fit are teaching choices, not validated recommendations.</p>
        </details>
      </details>
      <details class="card settings" id="settingsPanel" open aria-labelledby="settingsHeading">
        <summary class="settings-toggle">Adjust settings <span id="settingsSummary"></span></summary>
        <div class="card-heading"><h2 id="settingsHeading">Settings</h2><button id="resetBtn" type="button">Reset</button></div>
        <p class="control-group-label">Ventilator</p><div class="controls" id="ventilatorControls"></div>
        <p class="control-group-label">Lung</p>
        <label class="sr-only" for="lungCase">Lung-mechanics example</label><select id="lungCase"></select>
        <div class="controls lung-controls" id="lungControls"></div>
        <details class="advanced" id="timingPanel"><summary>Breath timing</summary>
          <div class="controls" id="timingControls"></div>
          <div class="timing-controls"><label for="timingMode">Enter timing as</label><select id="timingMode"><option value="fraction">Inspiratory fraction</option><option value="ti">Inspiratory time (Ti)</option><option value="ie" selected>I:E ratio</option></select>
          <label for="timingValue" id="timingValueLabel" hidden>Inspiratory time (s)</label><input id="timingValue" type="number" step="any" hidden><p id="timingError" class="field-error"></p>
          <label class="check"><input id="keepTi" type="checkbox"> Keep Ti fixed when changing rate</label></div>
        </details>
        <details class="advanced" id="mechanicsPanel"><summary>Advanced mechanics &amp; run</summary>
          <div class="controls" id="advancedControls"></div>
          <label class="check"><input id="linkResistance" type="checkbox" checked> Link inspiratory / expiratory resistance</label>
          <label class="scenario-label" for="initialState">Initial lung state</label><select id="initialState"><option value="startup">Start from rest at set PEEP</option><option value="steady">Periodic steady state</option></select>
          <p class="small" id="regionMechanicsNote"></p>
        </details>
        <details class="advanced"><summary>CO₂ &amp; capnogram options</summary>
          <div class="controls" id="co2Controls"></div>
          <label class="scenario-label" for="capnogramShape">CO₂ tracing</label>
          <select id="capnogramShape"><option value="transport">Dynamic airway transport</option><option value="auto">Illustrative shape: follows resistance</option><option value="reference">Illustrative reference shape</option><option value="obstructive">Illustrative obstructive shape</option></select>
          <button type="button" id="continueCO2" disabled>Start CO₂ from baseline end</button><p class="small" id="co2StartNote">CO₂ starts from the initial pressure above. Mechanics start from the selected lung state.</p>
        </details>
      </details>
      </aside><section class="results-column" aria-label="Predicted ventilation">
        <div id="ventilationErrors" class="validation" role="alert" hidden></div>
        <p id="breathCaption" class="breath-caption"></p><section class="metrics" id="metrics" aria-label="Selected breath measurements"></section>
        <section class="card plot-card" aria-label="Ventilator waveforms">
          <div class="chart-toolbar">
            <button id="playVent" class="primary-button" type="button">Play</button><button id="rewindVent" type="button">Rewind</button><span id="playbackStatus" class="small" role="status">Paused</span>
            <label for="viewWindow">View<select id="viewWindow"><option value="three">Three breaths</option><option value="breath">Selected breath</option><option value="full" selected>Full run</option><option value="monitor">Monitor window</option></select></label>
          </div>
          <details class="chart-options" id="chartOptions"><summary>Display options</summary><div class="chart-toolbar">
            <label for="playbackSpeed">Speed<select id="playbackSpeed"><option value="0.5">½×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="4">4×</option></select></label>
            <label for="breathSelect">Breath<select id="breathSelect"></select></label>
            <label for="flowUnit">Flow<select id="flowUnit"><option value="L/min">L/min</option><option value="L/s">L/s</option></select></label>
            <label class="check"><input id="showAlveolar" type="checkbox"> Alveolar pressure</label>
            <label class="check"><input id="lockAxes" type="checkbox"> Lock scales</label>
            <label class="check"><input id="showTeaching" type="checkbox"> Teaching annotations</label>
          </div></details>
          <svg class="plot" id="plot" role="img" aria-label="Pressure, volume, flow, and CO₂ capnogram waveforms"></svg>
          <div class="legend"><span style="--line:#2563eb">Airway pressure</span><span style="--line:#0f766e">Volume</span><span style="--line:#9a5105">Flow</span><span style="--line:#7c3aed">CO₂ capnogram</span><span id="alveolarLegend" style="--line:#b42355" hidden>Alveolar pressure</span><span class="dash" id="baselineLegend" hidden>Frozen baseline</span></div>
          <details class="chart-help"><summary>Reading the waveforms</summary><p class="phase-key">Blue shading: inspiration · amber shading: hold · unshaded: expiration. Dashed pressure reference: set PEEP.</p>
          <p class="phase-key" id="capnogramNote"></p></details>
          <p class="axis-note" id="axisNote" hidden>Some values exceed the locked scales. Unlock scales to see their full range.</p>
          <details class="inspection" id="inspectionPanel"><summary>Inspect a time point</summary><div class="inspection-controls"><label for="ventCursor">Inspect time (s)<input id="ventCursor" type="number" min="0" step="any" value="0"></label><label for="ventCursorSlider" class="sr-only">Inspection time in seconds</label><input id="ventCursorSlider" type="range" min="0" step="any" value="0"></div><div class="inspection-values" id="ventCursorValues" role="status"></div></details>
        </section>
        <details class="card" id="measurementsPanel"><summary>Detailed measurements</summary>
          <div id="additionalMetrics" class="metrics"></div><p id="emptyingNote" class="emptying-note"></p>
          <div class="timing" id="timingReadout" aria-label="Calculated breath timing"></div>
          <p class="scenario-note" id="scenarioNote"></p>
        <section class="co2-card" aria-labelledby="co2Heading">
          <h2 id="co2Heading">Selected-breath CO₂</h2><div class="co2-readings" id="co2Readings"></div>
          <p class="small" id="regionReadout"></p><p class="small" id="co2Note"></p>
        </section></details>
        <details class="card" id="loopsPanel"><summary>Pressure–volume &amp; flow–volume loops</summary><p id="loopCaption" class="small"></p><div class="loop-grid"><svg id="pvLoop" class="loop-plot" role="img" tabindex="0" aria-label="Pressure-volume loop; click to inspect time"></svg><svg id="fvLoop" class="loop-plot" role="img" tabindex="0" aria-label="Flow-volume loop; click to inspect time"></svg></div><p class="small">Blue: inspiration/hold · amber: expiration · dashed: frozen baseline. Click a loop to inspect the corresponding time. Volume is above set-PEEP equilibrium; transient breaths may form open loops.</p></details>
        <details class="card comparison-panel" id="comparisonPanel"><summary>Compare with a baseline</summary><div class="button-row"><div><button type="button" id="freezeBaseline">Freeze baseline</button> <button type="button" id="clearBaseline" disabled>Clear baseline</button></div><label for="comparisonMode">Compare by <select id="comparisonMode"><option value="absolute">Absolute time</option><option value="aligned">Start of inspiration</option></select></label></div><p id="baselineNote" class="baseline-note"></p><p id="settingsChanges" class="small"></p></details>
      </section>
    </div>
    <details class="card model"><summary>Model assumptions, scenario values &amp; sources</summary>
      <p>Two passive parallel lung regions share the airway pressure. At baseline, each receives half the total compliance, resting alveolar volume and lung/tissue gas-exchange conductance. There are no leaks, patient effort or nonlinear flow limitation. With slow/fast time-constant ratio k, regional resistances are <code>Rfast = R × (1 + 1/k); Rslow = R × (1 + k)</code>, preserving the entered parallel R and total C. The same split applies to expiratory resistance. Ratio 1 is the uniform reference.</p>
      <p>PCV fills each region according to its own RC solution; expiration empties each independently toward set PEEP. VCV supplies the selected total flow, which divides according to regional elastic pressures and resistances. VCV holds have zero total flow but may allow internal gas redistribution. Mechanical phases and their boundaries are solved analytically; periodic initialization conserves each region's volume. Volume is above equilibrium at set PEEP.</p>
      <p>With unequal regions, the optional alveolar-pressure curve and intrinsic PEEP report compliance-weighted mean elastic pressure, not either individual region's pressure. Regional end-expiratory values are shown below the CO₂ readings. End-hold airway pressure may continue changing while the regions equilibrate; it is labeled separately from a uniform-lung plateau. Equilibrated elastic driving pressure uses the delivered volume divided by total C. Instantaneous resistive drop refers to removal of VCV flow at the start of the hold and is distinct from subsequent redistribution.</p>
      <p>Airway dead space is split into unmixed transit volume and a well-mixed compartment near the mouth. The mixing fraction is 0.2 by default: at VD 150 mL this is 30 mL mixed and 120 mL unmixed. Total dead space stays fixed when its split changes. Gas travels in both directions, including airway CO₂ returning on inspiration. The mixed compartment's exponential dilution is solved exactly for each incoming parcel; a separate 40 ms sensor response smooths the signal without changing stored or exhaled CO₂. Setting mixing to 0 restores unmixed transport. Background: <a href="https://pubmed.ncbi.nlm.nih.gov/37030832/">mechanistic airway-mixing model</a>.</p>
      <p>Each lung region has its own CO₂ content and exchanges with shared tissue stores. Unequal ventilation can therefore create unequal CO₂ concentrations; gas contributions are combined by their flow at the common junction. Internal redistribution also transports CO₂. Both regions initially have the same CO₂, so a rising plateau develops as regional differences form rather than being imposed from the first breath. Background: <a href="https://publications.ersnet.org/content/erjor/8/1/00440-2021">sequential ventilation-inhomogeneity study</a>. These references support the concepts, not the chosen parameters or validation of this implementation.</p>
      <p>Teaching defaults: total resting alveolar volume 2.5 L, tissue-equivalent storage 20 L, initial alveolar CO₂ 40 mmHg and production 200 mL/min STPD. At the 70 kg model reference, baseline total equivalent lung/tissue exchange conductance is 0.5 L/s, divided equally; this is not blood flow. Gas amounts use BTPS with sea-level conversion 863/713. No separate alveolar dead space, blood-perfusion network, shunt, circulation delays or acid–base chemistry is modeled. The assumed Pa–Et gradient only adds to sampled EtCO₂ for an arterial display estimate. Approximate steady alveolar ventilation is <code>max(VTsteady − VD, 0) × RR / 1000</code> L/min; it is not a measurement of regional gas exchange.</p>
      <p>The COPD-like and bronchospasm-like examples add illustrative 4:1 and 6:1 regional ratios to their R/C examples. These ratios and the mixing default are not fitted disease parameters; the model does not reproduce all clinical capnograms or dynamic airway collapse. Every settings edit restarts the run. “Start CO₂ from baseline end” preserves the frozen selected breath's separate regional concentrations, airway contents and sensor value while mechanics restart from their chosen initial state. This continued gas state is local to the page; shared URLs transfer settings, not gas history. Optional legacy shapes are schematic overlays, not the transport model. Timing may be entered as fraction, Ti or I:E, with an option to preserve Ti across rate changes.</p>
      <p>Acute events warm the baseline off-screen, then preserve regional volumes, gas stores and sensor state through onset and recovery. Status reports if warmup did not fully settle. A nonzero VC ceiling limits absolute airway pressure during inspiration and can reduce delivered volume; 0 retains ideal delivery. Event severity is an illustrative mechanism scale, not a measured percentage of obstruction. Bronchospasm increases unequal inspiratory/expiratory resistance; a kink or common mucus plug adds series resistance; a regional plug affects one branch. Complete common closure traps distal gas while fresh circuit gas washes the proximal sampling compartment at an assumed 0.1 L/s, with this loss included in the CO₂ audit.</p>
      <p>The venous-air-embolism scenario reduces equivalent lung/tissue exchange by (1 − severity)² without reducing metabolic production or changing airway mechanics. It represents reduced pulmonary CO₂ delivery, not bubbles or circulation. Event scenarios replace the fixed Pa–Et estimate with tissue-equivalent store pressure, which is not PaCO₂. A low expired tracing can coexist with rising stored CO₂; recovery may cause a rebound. Bronchospasm and plugging do not always lower EtCO₂, and waveform patterns overlap. Background: <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC12340691/">bronchospasm case observations</a> and <a href="https://pubmed.ncbi.nlm.nih.gov/22383084/">venous-air-embolism observations</a>. These sources support qualitative patterns, not calibration of the event severity or timing. This simulator is educational and cannot diagnose a clinical event.</p>
      <p>Other events act on the same transported gas, not a prescribed waveform. MH increases metabolic CO₂ production. Abdominal insufflation stiffens both regions and adds gradually absorbed CO₂. Hypotension represents reduced cardiac output; PE reduces regional pulmonary delivery unequally. Mainstem intubation excludes one region at maximal severity while ventilation of the other continues. Acute compliance loss models stiffness without fluid, recruitment or oxygenation. CO₂ rebreathing introduces inspired gas through the airway. Metabolic production, absorbed CO₂ and inspired CO₂ are audited separately. Compliance changes preserve volumes and gas content while elastic pressure can change immediately; the reference resting gas volume stays fixed.</p>
      <p>Each event's “How this event works” section links its background sources and states its limitations. No blood pressure, cardiac output, oxygen saturation, temperature, clot, pleural-pressure or disease-specific treatment model is included. Severity and the 120 s reference time scale are teaching choices, not measured disease severity or validated onset/recovery times. Clinical patterns overlap, and an abnormal tracing alone does not establish the cause.</p>
      <p>The optional patient profile suggests an editable volume/rate/PEEP starting example, not an optimal clinical prescription. Its optional model scaling changes C, dead space, resting gas volume, CO₂ stores and baseline production in proportion to ideal weight, relative to the current model weight; resistance changes inversely with the square root of that ratio. Exchange conductance and the insufflation scenario’s CO₂ uptake scale with model weight relative to 70 kg. These are explicit teaching assumptions, not patient measurements or validated pediatric kinetics. Child/teen rates use interpolated low-normal ERC age anchors; adults use a 12/min reference regardless of adult age. Timing, pathology and real gas exchange can require different settings. The profile is preserved in shared URLs and event references; Reset clears it.</p>
      <table class="source-table"><thead><tr><th>Example</th><th>Rᵢ / Rₑ<br>cm H₂O/(L/s)</th><th>C<br>mL/cm H₂O</th><th>τₑ fast / slow<br>s</th></tr></thead><tbody id="caseTable"></tbody></table>
      <ul><li><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC11107031/">2024 PCV bench study</a>: COPD bench compliance 60 with obstructive resistances including 20. This supports the COPD-like mechanics example, not all of its clinical behavior.</li><li><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC7925949/">2021 respiratory-mechanics bench study</a>: obstructive R 20/C 50 and restrictive R 10/C 25 examples. Our bronchospasm-like R 30/C 50 is an illustrative extension, not a validated disease parameter set.</li><li><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC3376482/">Respiratory compartment model equations</a>.</li></ul>
    </details>`;
  for (const field of ['VT', 'PC', 'RR', 'PEEP']) addVentControl(field, 'ventilatorControls');
  for (const field of ['R', 'C']) addVentControl(field, 'lungControls');
  for (const field of ['IF', 'HF']) addVentControl(field, 'timingControls');
  for (const field of ['regionRatio', 'Rexp', 'pressureLimit', 'T'])
    addVentControl(field, 'advancedControls');
  for (const field of ['eventOnset', 'eventRecovery', 'eventSeverity'])
    addVentControl(field, 'eventControls');
  for (const field of ['VCO2', 'VD', 'airwayMix', 'CO2Gradient', 'FRC', 'CO2Store', 'CO2Initial'])
    addVentControl(field, 'co2Controls');
  for (const item of VENTILATION_CASES) {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.label;
    ventElement('lungCase').append(option);
    const row = document.createElement('tr');
    const tau = VentilationRegions.configure({
      ...Ventilation.defaults,
      R: item.R,
      Rexp: item.R,
      C: item.C,
      regionRatio: item.regionRatio,
    }).tauE;
    [
      item.label,
      `${item.R} / ${item.R}`,
      item.C,
      tau.map((t) => ventFormat(t, 2)).join(' / '),
    ].forEach((value) => {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    });
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
    if (['R', 'Rexp', 'C', 'regionRatio'].includes(field)) {
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
    eventType: ventElement('eventType').value,
    eventLocation: ventElement('eventLocation').value,
  };
  for (const [field, control] of ventInputs) p[field] = readVentNumber(control.number.value);
  if (ventElement('timingMode').value === 'ti')
    p.IF = readVentNumber(ventElement('timingValue').value) / (60 / p.RR);
  if (ventElement('timingMode').value === 'ie') p.IF = readVentRatio();
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
      control.error.textContent = ['eventOnset', 'eventRecovery', 'pressureLimit'].includes(
        error.field,
      )
        ? error.message
        : `Enter ${control.number.min}–${control.number.max} ${ventFields[error.field][1]}.`;
      // A hidden advanced setting must remain discoverable when it is invalid.
      let section = control.wrapper.closest('details');
      while (section) {
        section.open = true;
        section = section.parentElement.closest('details');
      }
    }
  }
  if (errors.some((e) => e.field === 'IF')) ventElement('timingPanel').open = true;
  const summary = ventElement('ventilationErrors');
  const timingInvalid = errors.some((e) => e.field === 'IF');
  ventElement('timingError').textContent = timingInvalid
    ? 'Timing must leave 5–80% of the cycle for inspiration. Check Ti, I:E and rate.'
    : '';
  ventElement('timingValue').setAttribute('aria-invalid', String(timingInvalid));
  summary.hidden = !errors.length;
  summary.textContent = errors.length
    ? `Results have not updated. Correct the highlighted settings; waveforms and measurements retain the last valid run. ${errors
        .filter((e) => !ventInputs.has(e.field))
        .map((e) => e.message)
        .join(' ')}`
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
  ventElement('eventType').value = next.eventType;
  ventElement('eventLocation').value = next.eventLocation;
  syncVentTiming(next.IF, next.RR);
  ventElement('lungCase').value = caseId;
  ventBreathIndex = -1;
  syncVentMode();
  simulateAndDraw();
}
function simulateAndDraw() {
  const p = readVentSettings(),
    errors = Ventilation.validate(p);
  updateVentCaseNote();
  showVentErrors(errors);
  ventValid = !errors.length;
  if (!ventValid) {
    renderVentEventStatus();
    renderVentPatient();
    return;
  }
  if (!ventRun || ventForceRun || JSON.stringify(p) !== JSON.stringify(ventRun.settings)) {
    stopVentPlayback();
    ventPlayback.time = 0;
    if (ventElement('viewWindow').value === 'monitor') ventElement('viewWindow').value = 'full';
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
  updateVentURL();
  renderBreathSelect();
  renderTiming();
  renderVentEventDescription();
  renderVentPatient();
  refreshVentView();
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
  if (ventSettings.modelWeight !== 70)
    note.append(
      ` Mechanics are scaled from the 70 kg reference to ${ventFormat(ventSettings.modelWeight)} kg using teaching assumptions.`,
    );
}
function syncVentMode() {
  document.body.dataset.ventilationMode = ventMode;
  for (const [field, hidden] of [
    ['VT', ventMode !== 'vcv'],
    ['PC', ventMode !== 'pcv'],
    ['HF', ventMode !== 'vcv'],
    ['pressureLimit', ventMode !== 'vcv'],
  ])
    ventInputs.get(field).wrapper.hidden = hidden;
  document
    .querySelectorAll('[data-vent-mode]')
    .forEach((button) =>
      button.setAttribute('aria-pressed', String(button.dataset.ventMode === ventMode)),
    );
  ventElement('modeHint').textContent =
    ventMode === 'vcv'
      ? 'Volume is set. Pressure responds to the lung.'
      : 'Pressure is set. Delivered volume responds to the lung.';
}
function updateVentURL() {
  const url = new URL(location.href);
  url.searchParams.set('mode', ventMode);
  url.searchParams.set('settings', JSON.stringify(ventSettings));
  url.searchParams.set('case', ventCaseId);
  if (ventPatient) url.searchParams.set('patient', JSON.stringify(ventPatient));
  else url.searchParams.delete('patient');
  // Some file viewers restrict history; the simulator still works without it.
  try {
    history.replaceState(null, '', url.href);
  } catch {}
}
function switchVentMode(mode) {
  if (!['vcv', 'pcv'].includes(mode) || mode === ventMode) return;
  const p = readVentSettings();
  let errors = Ventilation.validate(p);
  if (!errors.length) {
    p.mode = mode;
    if (mode === 'vcv' && p.eventType !== 'none' && p.pressureLimit === 0) p.pressureLimit = 40;
    errors = Ventilation.validate(p);
  }
  if (errors.length) {
    showVentErrors(errors);
    for (const error of errors)
      if (ventInputs.has(error.field)) ventInputs.get(error.field).wrapper.hidden = false;
    return;
  }
  ventMode = mode;
  setVentSettings(p, ventCaseId);
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
    ? `Breath ${b.index + 1} · ${ventFormat(b.start, 2)}–${ventFormat(b.end, 2)} s · ${ventRun.warmup ? 'warmed baseline → event → recovery' : ventSettings.initial === 'steady' ? 'periodic steady-state initial volume' : 'run started from rest'}${b.metrics.PressureLimited ? ' · VC pressure ceiling reached' : ''}`
    : ventElement('viewWindow').value === 'monitor'
      ? 'No complete breath yet in playback. Continue playing to see completed-breath measurements.'
      : 'No complete breath yet. Waveforms show the partial breath; increase simulation duration for breath measurements.';
  const primary = ventElement('metrics'),
    extra = ventElement('additionalMetrics');
  primary.replaceChildren();
  extra.replaceChildren();
  for (const [key, label, digits] of [
    [
      'VT',
      `Delivered VT (mL)${ventPatient && m ? ` · ${ventFormat(m.VT / ventPatient.ibw)} mL/kg` : ''}`,
      0,
    ],
    ['EtCO2', 'EtCO₂ (mmHg)', 1],
    ['Peak', 'Peak pressure (cm H₂O)', 1],
    [
      'Intrinsic',
      ventSettings.regionRatio > 1 || ventRun.scenario
        ? 'Mean intrinsic PEEP (cm H₂O)'
        : 'End-expiratory intrinsic PEEP (cm H₂O)',
      2,
    ],
  ])
    ventMetric(primary, m?.[key], label, old?.[key], digits);
  for (const [key, label, digits] of [
    ['Expired', 'Expired VT (mL)', 0],
    [
      'Plateau',
      ventSettings.regionRatio > 1 || ventRun.scenario
        ? 'End-hold airway pressure (cm H₂O)'
        : 'Plateau pressure (cm H₂O); requires VCV hold',
      1,
    ],
    ['Mean', 'Mean airway pressure (cm H₂O)', 1],
    [
      'Driving',
      ventSettings.regionRatio > 1 || ventRun.scenario
        ? 'Equilibrated elastic driving pressure (cm H₂O)'
        : 'Plateau minus start total PEEP (cm H₂O)',
      1,
    ],
    ['EndExpVolume', 'Retained end-expiratory volume (mL)', 1],
    ['Retained', 'Net retained this breath (mL)', 1],
    ['MinuteVentilation', 'Expired minute ventilation (L/min)', 2],
  ])
    ventMetric(extra, m?.[key], label, old?.[key], digits);
  const q = ventRun.timing;
  renderVentCO2();
  ventElement('emptyingNote').textContent =
    b && ventRun.scenario
      ? `Actual expired volume ${ventFormat(b.metrics.Expired, 0)} mL; ${ventFormat((100 * b.Vend) / b.Ve, 1)}% of end-inspiratory volume remains. ${ventMode === 'pcv' ? 'PC maintains its selected pressure; delivered volume can fall.' : b.metrics.PressureLimited ? 'VC delivery was limited by the pressure ceiling.' : 'No VC pressure limiting during this breath.'} Scenario mechanics vary over time; the timing constants below describe baseline regions.`
      : b
        ? `Expiration: ${q.regions.tauE.map((t) => ventFormat(q.Te / t, 2)).join(' / ')} fast/slow time constants; ${ventFormat((100 * b.Vend) / b.Ve, 1)}% of end-inspiratory volume remains. Expiratory flow at breath end: ${ventFormat(Ventilation.sample(ventRun, b.end, 'left').f * 60, 1)} L/min.`
        : 'The display distinguishes a partial breath from completed-breath measurements.';
  ventElement('baselineLegend').hidden = !ventBaseline;
  ventElement('clearBaseline').disabled = !ventBaseline;
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
    ventSettings.eventType !== 'none'
      ? ['TissueCO2', 'Tissue-equivalent CO₂ store pressure (mmHg; not PaCO₂)', 1]
      : ['EstimatedPaCO2', 'EtCO₂ + assumed Pa–Et gradient (mmHg)', 1],
  ])
    ventMetric(readings, m?.[key], label, old?.[key], digits);
  ventElement('co2Note').textContent =
    ventSettings.eventType !== 'none'
      ? 'Event mode carries stored gas forward while the selected mechanism changes mechanics, CO₂ production, absorption, inspired CO₂ or pulmonary delivery. Low measured EtCO₂ can coexist with rising tissue CO₂. Tissue pressure is a model surrogate, not PaCO₂; the fixed Pa–Et estimate is suppressed. Interpret CO₂ with delivered/expired volume, pressure and flow.'
      : `EtCO₂ is sampled at the end of the selected complete breath. Two lung regions exchange CO₂ with shared tissue stores and receive equal gas-exchange conductance; unequal ventilation can create regional CO₂ differences. Approximate ${ventRun.scenario ? 'first-breath fresh-gas' : 'steady alveolar'} ventilation: ${ventFormat(gas.alveolarVentilation, 2)} L/min. These are illustrative mechanics, not validated disease-specific kinetics. The Pa–Et gradient affects only the arterial estimate.`;
  const b = ventRun.completeBreaths[ventBreathIndex],
    fractions = b?.co2State?.lungFractions;
  ventElement('regionReadout').textContent = fractions
    ? `Selected breath, fast / slow regions: alveolar CO₂ ${fractions.map((f) => ventFormat(f * 713)).join(' / ')} mmHg; end-expiratory elastic pressure ${ventFormat(b.metrics.IntrinsicFast)} / ${ventFormat(b.metrics.IntrinsicSlow)} cm H₂O above set PEEP.`
    : 'Regional measurements require a complete breath.';
  ventElement('regionMechanicsNote').textContent =
    `Two equal-size regions share the airway. Total C and parallel R stay as entered. Expiratory time constants: ${ventRun.timing.regions.tauE.map((t) => ventFormat(t, 2)).join(' / ')} s. Ratio 1 restores uniform mechanics.`;
  ventElement('capnogramNote').textContent =
    ventSettings.capnogramShape === 'transport'
      ? `Dynamic CO₂: two lung regions, ${ventFormat(ventSettings.VD * ventSettings.airwayMix, 0)} mL of airway mixing and ${ventFormat(ventSettings.VD * (1 - ventSettings.airwayMix), 0)} mL of unmixed transit, with a 40 ms sensor response. Dots mark each breath’s end-expiratory CO₂.`
      : 'Illustrative shape overlay with evolving breath amplitudes. Select Dynamic airway transport for the mass-balance model’s tracing.';
}
function renderTiming() {
  const q = ventRun.timing,
    container = ventElement('timingReadout');
  container.replaceChildren();
  for (const [label, value] of [
    ['Ti', `${ventFormat(q.Ti, 2)} s`],
    ['Te', `${ventFormat(q.Te, 2)} s`],
    ['I:E', formatVentRatio(ventSettings.IF)],
    [
      'τₑ fast / slow',
      `${ventFormat(q.regions.tauE[0], 2)} / ${ventFormat(q.regions.tauE[1], 2)} s`,
    ],
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
  renderVentEventStatus();
}
function refreshVentView() {
  drawVentilation();
  renderVentMetrics();
  drawVentLoops();
}

(function initVentilator() {
  buildVentilator();
  initVentEventUI();
  initVentExtras();
  initVentPatientUI();
  ventElement('settingsPanel').open = !window.matchMedia('(max-width: 700px)').matches;
  ventElement('lungCase').addEventListener('change', (event) => {
    const item = VENTILATION_CASES.find((c) => c.id === event.target.value);
    if (item)
      setVentSettings(
        {
          ...readVentSettings(),
          R: item.R / Math.sqrt(ventSettings.modelWeight / 70),
          Rexp: item.R / Math.sqrt(ventSettings.modelWeight / 70),
          C: (item.C * ventSettings.modelWeight) / 70,
          regionRatio: item.regionRatio,
        },
        item.id,
      );
  });
  ventElement('resetBtn').addEventListener('click', () => {
    resetVentPatient();
    stopVentPlayback();
    ventPlayback.time = 0;
    ventElement('viewWindow').value = 'full';
    ventCO2Seed = null;
    ventForceRun = true;
    ventElement('co2StartNote').textContent =
      'CO₂ starts from the initial pressure above. Mechanics start from the selected lung state.';
    ventElement('timingMode').value = 'ie';
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
  document
    .querySelectorAll('[data-vent-mode]')
    .forEach((button) =>
      button.addEventListener('click', () => switchVentMode(button.dataset.ventMode)),
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
  const query = ventQuery;
  let initial = { ...Ventilation.defaults, mode: ventMode },
    caseId = 'reference';
  try {
    const text = query.get('settings');
    if (text) {
      if (text.length > 4096) throw Error('Settings too large');
      const parsed = JSON.parse(text);
      if (!query.has('mode') && ['vcv', 'pcv'].includes(parsed.mode))
        ventMode = initial.mode = parsed.mode;
      for (const field of Object.keys(Ventilation.defaults))
        if (field !== 'mode' && Object.hasOwn(parsed, field)) initial[field] = parsed[field];
      // PC has no ceiling control. Give an incoming event the same finite VC
      // ceiling as selecting the event locally, including complete obstruction.
      if (
        ventMode === 'vcv' &&
        parsed.mode === 'pcv' &&
        initial.eventType !== 'none' &&
        initial.pressureLimit === 0
      )
        initial.pressureLimit = 40;
      if (Ventilation.validate(initial).length) throw Error('Invalid shared settings');
      caseId = VENTILATION_CASES.some((c) => c.id === query.get('case'))
        ? query.get('case')
        : 'custom';
      const example = VENTILATION_CASES.find((c) => c.id === caseId);
      if (
        example &&
        (Math.abs(initial.R - example.R / Math.sqrt(initial.modelWeight / 70)) > 1e-8 ||
          Math.abs(initial.Rexp - example.R / Math.sqrt(initial.modelWeight / 70)) > 1e-8 ||
          Math.abs(initial.C - (example.C * initial.modelWeight) / 70) > 1e-8 ||
          initial.regionRatio !== example.regionRatio)
      )
        caseId = 'custom';
    }
  } catch {
    initial = { ...Ventilation.defaults, mode: ventMode };
    caseId = 'reference';
  }
  setVentSettings(initial, caseId);
})();
