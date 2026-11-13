/* Copyright (c) 2026 Julian W. Landaw | SPDX-License-Identifier: MIT */
let inspectionTime = 0;
function snapInspectionTime(time) {
  return Number((Math.round(time / SIMULATION_STEP_MINUTES) * SIMULATION_STEP_MINUTES).toFixed(12));
}

function formatInspectionTime(time) {
  return Math.abs(time - snapInspectionTime(time)) < TIME_EPSILON
    ? time.toFixed(Math.max(0, Math.ceil(-Math.log10(SIMULATION_STEP_MINUTES))))
    : formatInputValue(time);
}
const formatInspectionValue = (value) => String(roundToSignificantFigures(value, 4));
const DELIVERY_STATUS_LABELS = {
  capped: 'At the maximum infusion rate',
  tracking: 'Delivering toward the target',
  'paused-zero-target': 'Delivery paused: target is zero',
  'paused-above-target': 'Delivery paused: predicted concentration needs no additional drug',
  stopped: 'TCI stopped',
  end: 'End of simulation',
};

function inspectionStatus(sample) {
  return (
    DELIVERY_STATUS_LABELS[sample.status] ||
    (sample.rateBase > 0 ? 'Rate-based drug delivery' : 'No rate-based delivery')
  );
}

function setInspectionTime(raw) {
  if (!latestSimulationContext) return;
  const input = document.getElementById('inspectionTime');
  const end = latestSimulationContext.result.simulation.ts.at(-1);
  const message = numericInputError(raw, 'Inspection time', { max: end });
  clearInvalidInput(input);
  if (message) {
    markInvalidInput(input, message);
    return;
  }
  inspectionTime = readNumericInput(raw);
  updateSimulationInspection();
}

function updateSimulationInspection() {
  if (!latestSimulationContext) return;
  const { state, result } = latestSimulationContext;
  const { simulation, input } = result;
  inspectionTime = clamp(inspectionTime, 0, simulation.ts.at(-1));
  const sample = sampleSimulation(simulation, input, inspectionTime);
  const concUnit = UNITS[state.units.conc],
    infusionUnit = INFUSIONUNITS[state.units.infusion];
  const weight = state.patient.weightKg;
  const set = (id, text) => {
    document.getElementById(id).textContent = text;
  };
  const concentration = (value) =>
    `${formatInspectionValue(value * concUnit.factor)} ${concUnit.name}`;
  const timeInput = document.getElementById('inspectionTime'),
    slider = document.getElementById('inspectionSlider');
  clearInvalidInput(timeInput);
  timeInput.max = slider.max = String(simulation.ts.at(-1));
  timeInput.value = formatInspectionTime(inspectionTime);
  slider.value = String(inspectionTime);
  slider.setAttribute('aria-valuetext', `${formatInspectionTime(inspectionTime)} min`);
  set('inspectionCp', concentration(sample.cp));
  set('inspectionCe', sample.ce == null ? 'Not modeled' : concentration(sample.ce));
  set(
    'inspectionTarget',
    sample.targetBase == null
      ? 'No active TCI target'
      : `${sample.targetType === 'ce' ? 'Ce' : 'Cp'} ${concentration(sample.targetBase)}`,
  );
  const value = sample.targetType === 'ce' ? sample.ce : sample.cp;
  const difference =
    sample.targetBase == null || value == null
      ? null
      : (value - sample.targetBase) * concUnit.factor;
  set(
    'inspectionDifference',
    difference == null
      ? '—'
      : `${difference >= 0 ? '+' : ''}${formatInspectionValue(difference)} ${concUnit.name}`,
  );
  set(
    'inspectionRate',
    `${formatInspectionValue(convertMgKgMinToInfusionValue(sample.rateBase, infusionUnit, weight))} ${infusionUnit.name}`,
  );
  set(
    'inspectionDose',
    `${formatInspectionValue(sample.cumulativeDoseMgKg)} mg/kg (${formatInspectionValue(sample.cumulativeDoseMgKg * weight)} mg)`,
  );
  set('inspectionStatus', inspectionStatus(sample));
  document.getElementById('inspectionStatus').dataset.state = sample.status;
  for (const id of ['myDiv1', 'tciRatePlot']) {
    const plot = document.getElementById(id);
    if (!plot?.data) continue;
    if (!plot.inspectionClickHandler) {
      plot.inspectionClickHandler = (event) => {
        const time = event.points?.[0]?.x;
        if (typeof time === 'number') setInspectionTime(time);
      };
      plot.on('plotly_click', plot.inspectionClickHandler);
    }
    const shapes = (plot.layout.shapes || []).filter((shape) => shape.name !== 'inspection-cursor');
    shapes.push({
      name: 'inspection-cursor',
      type: 'line',
      xref: 'x',
      yref: 'paper',
      x0: inspectionTime,
      x1: inspectionTime,
      y0: 0,
      y1: 1,
      line: { color: '#8a9099', width: 1, dash: 'dot' },
    });
    Plotly.relayout(plot, { shapes });
  }
}

function updateTciDeliverySummary() {
  const panel = document.getElementById('tciDeliverySummary');
  const { state, result } = latestSimulationContext;
  panel.hidden = !state.tci.enabled;
  if (panel.hidden) {
    panel.textContent = '';
    return;
  }
  const durations = {};
  result.simulation.deliveryStatus.forEach((status, index) => {
    durations[status] =
      (durations[status] || 0) + result.simulation.ts[index + 1] - result.simulation.ts[index];
  });
  panel.textContent = `Calculated delivery: at maximum ${formatInputValue(durations.capped || 0)} min · paused for zero target ${formatInputValue(durations['paused-zero-target'] || 0)} min · paused without additional drug ${formatInputValue(durations['paused-above-target'] || 0)} min · stopped ${formatInputValue(durations.stopped || 0)} min. Inspect a time point for its target, delivery rate, and concentration difference.`;
}

function resultsCsvCell(value) {
  if (value == null) return '';
  let text = String(value);
  if (typeof value === 'string' && /^[=+@\-\t\r]/.test(text)) text = "'" + text;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function simulationResultsCsv(state, result) {
  const { simulation, input } = result;
  const concentration = UNITS[state.units.conc],
    infusion = INFUSIONUNITS[state.units.infusion];
  const source = state.provenance || unknownModelProvenance(state.drug, 'legacy');
  const p = resolvePkParameters(state.pk),
    weight = state.patient.weightKg;
  const pkFields = ['V1', 'V2', 'V3', 'Cl', 'Q2', 'Q3', 'k10', 'k12', 'k21', 'k13', 'k31', 'ke0'];
  const header = [
    'time_min',
    'cp',
    'ce',
    'concentration_unit',
    'delivery_rate',
    'delivery_rate_unit',
    'cumulative_dose_mg_per_kg',
    'cumulative_dose_mg',
    'active_target',
    'target_compartment',
    'delivery_status',
    'weight_kg',
    'drug',
    'model_id',
    'model_name',
    'model_revision',
    'registry_revision',
    'parameters_modified',
    'population_assumptions',
    'source_review',
    'source_references',
    'V1_mL_per_kg',
    'V2_mL_per_kg',
    'V3_mL_per_kg',
    'Cl_mL_per_kg_min',
    'Q2_mL_per_kg_min',
    'Q3_mL_per_kg_min',
    'k10_per_min',
    'k12_per_min',
    'k21_per_min',
    'k13_per_min',
    'k31_per_min',
    'ke0_per_min',
  ];
  const metadata = [
    weight,
    state.drug || 'custom',
    source.modelId,
    source.modelName,
    source.modelRevision,
    source.registryRevision,
    state.presetModified,
    source.populationAssumptions,
    source.reviewStatus,
    JSON.stringify(source.references),
    ...pkFields.map((field) => p[field]),
  ];
  const rows = [header.join(',')];
  simulation.ts.forEach((time) => {
    const sample = sampleSimulation(simulation, input, time);
    const values = [
      time,
      sample.cp * concentration.factor,
      sample.ce == null ? null : sample.ce * concentration.factor,
      concentration.name,
      convertMgKgMinToInfusionValue(sample.rateBase, infusion, weight),
      infusion.name,
      sample.cumulativeDoseMgKg,
      sample.cumulativeDoseMgKg * weight,
      sample.targetBase == null ? null : sample.targetBase * concentration.factor,
      sample.targetBase == null ? '' : sample.targetType,
      inspectionStatus(sample),
      ...metadata,
    ];
    rows.push(values.map(resultsCsvCell).join(','));
  });
  return rows.join('\r\n');
}

function initSimulationInspection() {
  document
    .getElementById('inspectionTime')
    .addEventListener('change', (event) => setInspectionTime(event.target.value));
  document.getElementById('inspectionSlider').addEventListener('input', (event) => {
    const end = latestSimulationContext?.result.simulation.ts.at(-1);
    if (end == null) return;
    setInspectionTime(clamp(snapInspectionTime(Number(event.target.value)), 0, end));
  });
  document.getElementById('inspectionSlider').addEventListener('keydown', (event) => {
    if (!latestSimulationContext) return;
    const end = latestSimulationContext.result.simulation.ts.at(-1);
    let time;
    if (['ArrowRight', 'ArrowUp'].includes(event.key))
      time =
        (Math.floor((inspectionTime + TIME_EPSILON) / SIMULATION_STEP_MINUTES) + 1) *
        SIMULATION_STEP_MINUTES;
    else if (['ArrowLeft', 'ArrowDown'].includes(event.key))
      time =
        (Math.ceil((inspectionTime - TIME_EPSILON) / SIMULATION_STEP_MINUTES) - 1) *
        SIMULATION_STEP_MINUTES;
    else if (event.key === 'Home') time = 0;
    else if (event.key === 'End') time = end;
    else return;
    event.preventDefault();
    setInspectionTime(clamp(Number(time.toFixed(12)), 0, end));
  });
  document.getElementById('exportResultsCsvBtn').addEventListener('click', () => {
    if (!validateSimulationInputs()) {
      setResultsValidity(false);
      return;
    }
    dfsolve();
    const { state, result } = latestSimulationContext;
    downloadText(
      `physio-${state.drug || 'custom'}-results.csv`,
      simulationResultsCsv(state, result),
      'text/csv',
    );
    document.getElementById('regimenFileStatus').textContent =
      'Simulation results CSV downloaded with concentration and delivery units, cumulative dose, model parameters, and recorded provenance.';
  });
}
