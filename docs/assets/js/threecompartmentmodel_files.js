/* Copyright (c) 2026 Julian W. Landaw
 * SPDX-License-Identifier: MIT
 * Versioned regimen files; the simulator supplies state and restore functions.
 */

function downloadText(filename, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildRegimenDocument({ validate = true } = {}) {
  if (validate && !validateSimulationInputs())
    throw new Error('Correct the highlighted inputs before saving.');
  const current = getCurrentState();
  current.schedule = getScheduleFromDOM({ includeInactive: true });
  const file = {
    format: 'physio-regimen',
    version: 1,
    savedAt: new Date().toISOString(),
    current,
    strategies,
    tciOriginal: tciImportSession?.sourceState || null,
  };
  // Apply the same rules on save and load, including saved comparison strategies.
  parseRegimenDocument(JSON.stringify(file));
  return file;
}

function validateRegimenState(value, path) {
  const object = (item, name) => {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      throw new Error(`${name} must be an object.`);
    return item;
  };
  const number = (item, name, positive = false) => {
    if (typeof item !== 'number' || !Number.isFinite(item) || (positive ? item <= 0 : item < 0)) {
      throw new Error(`${name} must be a finite ${positive ? 'positive' : 'non-negative'} number.`);
    }
    return item;
  };
  const boolean = (item, name) => {
    if (typeof item !== 'boolean') throw new Error(`${name} must be true or false.`);
    return item;
  };
  const numbers = (item, names, name) => {
    object(item, name);
    return Object.fromEntries(names.map((key) => [key, number(item[key], `${name}.${key}`)]));
  };
  const v = object(value, path);
  if (v.drug !== null && !DRUGS.some((drug) => drug.id === v.drug))
    throw new Error(`${path}: unknown drug preset.`);
  const units = object(v.units, `${path}.units`);
  if (
    !Object.hasOwn(UNITS, units.conc) ||
    !Object.hasOwn(BOLUSUNITS, units.bolus) ||
    !Object.hasOwn(INFUSIONUNITS, units.infusion)
  ) {
    throw new Error(`${path}: unsupported concentration or dosing units.`);
  }
  const patient = object(v.patient, `${path}.patient`);
  const weightKg = number(patient.weightKg, `${path}.patient.weightKg`, true);
  const inputs = numbers(
    v.inputs,
    ['b', 'tbolus', 'infusion', 'tinfusion', 'tfinal', 'initialp'],
    `${path}.inputs`,
  );
  if (inputs.tfinal <= 0 || inputs.tfinal > MAX_SIMULATION_MINUTES)
    throw new Error(
      `${path}: simulation duration must be greater than 0 and at most ${MAX_SIMULATION_MINUTES} minutes.`,
    );
  const pk = numbers(
    v.pk,
    ['Vd1', 'Vd2', 'Vd3', 'Cl', 'Q2', 'Q3', 'ke0', 'k10', 'k12', 'k21', 'k13', 'k31'],
    `${path}.pk`,
  );
  pk.inputMode = v.pk.inputMode;
  if (!['clearance', 'microconstants'].includes(pk.inputMode) || pk.Vd1 <= 0)
    throw new Error(`${path}: invalid PK input mode or central volume.`);
  if (pk.inputMode === 'clearance' && ((pk.Q2 > 0 && pk.Vd2 <= 0) || (pk.Q3 > 0 && pk.Vd3 <= 0)))
    throw new Error(`${path}: exchanging peripheral compartments need positive volumes.`);
  if (
    pk.inputMode === 'microconstants' &&
    ((pk.k12 > 0 && pk.k21 <= 0) || (pk.k13 > 0 && pk.k31 <= 0))
  )
    throw new Error(`${path}: exchanging peripheral compartments need positive return rates.`);
  const schedule = object(v.schedule, `${path}.schedule`);
  const events = (items, fields, name) => {
    if (!Array.isArray(items) || items.length > 50000)
      throw new Error(`${name} must be an array with at most 50,000 events.`);
    return items.map((item, index) => numbers(item, fields, `${name}[${index}]`));
  };
  const boluses = events(
    schedule.boluses,
    ['time', 'dose', 'duration'],
    `${path}.schedule.boluses`,
  );
  const infusions = events(
    schedule.infusions,
    ['start', 'end', 'rate'],
    `${path}.schedule.infusions`,
  );
  if (infusions.some((item) => item.end < item.start))
    throw new Error(`${path}: an infusion ends before it starts.`);
  const tci = numbers(v.tci, ['target', 'maxRate', 'stopTime'], `${path}.tci`);
  tci.enabled = boolean(v.tci.enabled, `${path}.tci.enabled`);
  const changes = v.tci.changes === undefined ? [] : v.tci.changes;
  if (!Array.isArray(changes) || changes.length > 100)
    throw new Error(`${path}: at most 100 TCI target changes are supported.`);
  tci.changes = changes.map((change, index) =>
    numbers(change, ['time', 'target'], `${path}.tci.changes[${index}]`),
  );
  if (
    tci.changes.some(
      (change, index) =>
        change.time <= (index ? tci.changes[index - 1].time : 0) || change.time >= tci.stopTime,
    )
  )
    throw new Error(`${path}: TCI changes must increase in time and precede TCI stop.`);
  tci.targetType = v.tci.targetType;
  if (!['cp', 'ce'].includes(tci.targetType))
    throw new Error(`${path}: unsupported TCI target compartment.`);
  const scheduleEnabled = boolean(schedule.enabled, `${path}.schedule.enabled`);
  if (
    tci.enabled &&
    (scheduleEnabled ||
      tci.target <= 0 ||
      tci.maxRate <= 0 ||
      (tci.targetType === 'ce' && pk.ke0 <= 0))
  )
    throw new Error(`${path}: invalid active TCI settings.`);
  return {
    id: 'live',
    name: typeof v.name === 'string' ? v.name.slice(0, 120) : 'Loaded regimen',
    drug: v.drug,
    presetModified: boolean(v.presetModified, `${path}.presetModified`),
    patient: { weightKg },
    units: { conc: units.conc, bolus: units.bolus, infusion: units.infusion },
    inputs,
    pk,
    tci,
    schedule: { enabled: scheduleEnabled, boluses, infusions },
  };
}

function parseRegimenDocument(text) {
  const file = JSON.parse(text);
  if (file?.format !== 'physio-regimen' || file.version !== 1)
    throw new Error('Choose a Physio regimen JSON file with version 1.');
  if (!Array.isArray(file.strategies) || file.strategies.length > 50)
    throw new Error('A regimen file can contain at most 50 comparison strategies.');
  const current = validateRegimenState(file.current, 'Current regimen');
  const saved = file.strategies.map((state, index) => ({
    ...validateRegimenState(state, `Strategy ${index + 1}`),
    id: uuidLike(),
  }));
  const original =
    file.tciOriginal == null ? null : validateRegimenState(file.tciOriginal, 'Original TCI');
  if (original && !original.tci.enabled)
    throw new Error('The original TCI snapshot must have TCI enabled.');
  return { current, strategies: saved, tciOriginal: original };
}

function loadRegimenDocument(text) {
  // Validate and simulate before changing any current inputs.
  const file = parseRegimenDocument(text);
  const simulation = simulateStrategy(file.current);
  if (![...simulation.cp, ...simulation.ce].every(Number.isFinite))
    throw new Error('The loaded parameters did not produce finite model predictions.');
  let session = null;
  if (file.tciOriginal) {
    const sourceSimulation = simulateStrategy(file.tciOriginal);
    if (![...sourceSimulation.cp, ...sourceSimulation.ce].every(Number.isFinite))
      throw new Error('The original TCI parameters did not produce finite model predictions.');
    session = {
      sourceState: file.tciOriginal,
      sourceSimulation,
      exactSchedule: buildScheduleFromTciSimulation(
        sourceSimulation,
        INFUSIONUNITS[file.tciOriginal.units.infusion],
        file.tciOriginal.patient.weightKg,
      ),
    };
  }
  restoreSimulationState(file.current);
  strategies = file.strategies;
  activeStrategyId = null;
  selectedTimelineEvent = null;
  timelineUndoSchedule = null;
  tciImportSession = session;
  compareMode = false;
  document.getElementById('compareMode').checked = false;
  chartRevision++;
  renderStrategyList();
  dfsolve();
  setSimulationStatus('Regimen loaded.', 'ok');
}

function initRegimenFiles() {
  const status = document.getElementById('regimenFileStatus');
  document.getElementById('saveRegimenBtn').addEventListener('click', () => {
    try {
      const file = buildRegimenDocument();
      const text = JSON.stringify(file, null, 2);
      if (new Blob([text]).size > 5 * 1024 * 1024)
        throw new Error(
          'This file exceeds 5 MB. Remove unused comparison strategies before saving.',
        );
      downloadText(`physio-${currentDrug || 'custom'}-regimen.json`, text);
      status.textContent =
        'Regimen file downloaded, including comparison strategies and the original TCI snapshot when present.';
    } catch (error) {
      status.textContent = error.message;
    }
  });
  const input = document.getElementById('regimenFileInput');
  document.getElementById('loadRegimenBtn').addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('Choose a regimen file smaller than 5 MB.');
      loadRegimenDocument(await file.text());
      status.textContent = `Loaded ${file.name}.`;
    } catch (error) {
      status.textContent = `Could not load regimen: ${error.message}`;
    } finally {
      input.value = '';
    }
  });
}
