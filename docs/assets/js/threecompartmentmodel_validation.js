/* Copyright (c) 2026 Julian W. Landaw | SPDX-License-Identifier: MIT */

// One interpretation of numeric entries for every editor. Missing entries stay
// invalid; only explicitly optional fields may use zero when blank.
function readNumericInput(raw, { optional = false } = {}) {
  if (raw == null || (typeof raw !== 'number' && typeof raw !== 'string')) return NaN;
  if (String(raw).trim() === '') return optional ? 0 : NaN;
  const value = Number(raw);
  return Number.isFinite(value) ? value : NaN;
}

function numericInputError(
  raw,
  label,
  { min = 0, max = Infinity, strictlyPositive = false, optional = false } = {},
) {
  const value = readNumericInput(raw, { optional });
  if (!Number.isFinite(value)) return `${label}: enter a number.`;
  if (strictlyPositive ? value <= 0 : value < min)
    return `${label} must be ${strictlyPositive ? 'greater than 0' : `at least ${min}`}.`;
  if (value > max) return `${label} must be no greater than ${max}.`;
  return null;
}

function doseEventErrors(type, event) {
  const fields = type === 'bolus' ? ['time', 'dose', 'duration'] : ['start', 'end', 'rate'];
  const errors = fields.flatMap((field) => {
    const message = numericInputError(event[field], field);
    return message ? [{ field, message }] : [];
  });
  if (type === 'infusion' && !errors.length && Number(event.end) < Number(event.start))
    errors.push({ field: 'end', message: 'Infusion end must be at or after its start.' });
  return errors;
}

function tciTargetChangeErrors(changes, stop) {
  const errors = [];
  if (changes.length > 100)
    errors.push({ index: 100, field: 'time', message: 'Use at most 100 TCI target changes.' });
  changes.forEach((change, index) => {
    const timeError = numericInputError(change.time, 'Change time', { strictlyPositive: true });
    if (
      timeError ||
      readNumericInput(change.time) <= (index ? readNumericInput(changes[index - 1].time) : 0) ||
      readNumericInput(change.time) >= readNumericInput(stop)
    )
      errors.push({
        index,
        field: 'time',
        message: `Target change ${index + 1}: times must increase, be greater than 0, and be before TCI stop.`,
      });
    const targetError = numericInputError(change.target, 'Target');
    if (targetError)
      errors.push({
        index,
        field: 'target',
        message: `Target change ${index + 1}: enter a non-negative concentration.`,
      });
  });
  return errors;
}

function markInvalidInput(input, message) {
  input?.classList.add('is-invalid');
  input?.setAttribute('aria-invalid', 'true');
  if (input && message) input.setAttribute('aria-description', message);
}

function clearInvalidInput(input) {
  input?.classList.remove('is-invalid');
  input?.removeAttribute('aria-invalid');
  input?.removeAttribute('aria-description');
}

function getScheduleWarnings(schedule, finalTime) {
  const warnings = [];
  const infusions = schedule.infusions.filter(
    (i) => Number.isFinite(i.start) && Number.isFinite(i.end) && i.end > i.start,
  );
  let furthestEnd = 0;
  infusions.forEach((infusion, index) => {
    if (index && infusion.start < furthestEnd - TIME_EPSILON) {
      warnings.push('Infusion segments overlap; their rates add during the overlap.');
    } else if (index && infusion.start > furthestEnd + TIME_EPSILON) {
      warnings.push('There is a zero-infusion gap between scheduled segments.');
    }
    furthestEnd = Math.max(furthestEnd, infusion.end);
  });
  if (
    Number.isFinite(finalTime) &&
    (infusions.some((i) => i.start >= finalTime || i.end > finalTime + TIME_EPSILON) ||
      schedule.boluses.some(
        (b) => b.time > finalTime || b.time + b.duration > finalTime + TIME_EPSILON,
      ))
  )
    warnings.push(
      'Some dosing extends beyond the simulation end time and is truncated or omitted.',
    );
  return [...new Set(warnings)];
}

function validateSimulationInputs() {
  const errors = [];
  const invalidIds = new Set();
  const addError = (id, message) => {
    errors.push(message);
    if (!id) return;
    const linkedIds = [id];
    Object.entries(MAIN_INPUT_LINKS).forEach(([mainId, sourceId]) => {
      if (sourceId === id) linkedIds.push(mainId);
    });
    linkedIds.forEach((invalidId) => {
      invalidIds.add(invalidId);
      const error = document.getElementById(`${invalidId}Error`);
      if (error && !error.textContent) {
        error.textContent = message;
        error.hidden = false;
      }
    });
  };
  const readNumber = (
    id,
    label,
    { min = -Infinity, strictlyPositive = false, optional = false } = {},
  ) => {
    const el = document.getElementById(id);
    const options = { min, strictlyPositive, optional };
    const message = numericInputError(el?.value, label, options);
    if (message) {
      addError(id, message);
      return null;
    }
    return readNumericInput(el?.value, options);
  };

  $$('.form-control.is-invalid').forEach(clearInvalidInput);
  $$('.field-error').forEach((el) => {
    el.hidden = true;
    el.textContent = '';
  });
  readNumber('weight', 'Weight', { strictlyPositive: true });
  const finalTime = readNumber('tfinal', 'Final time', { strictlyPositive: true });
  if (finalTime != null && finalTime > MAX_SIMULATION_MINUTES) {
    addError('tfinal', `Final time must be no greater than ${MAX_SIMULATION_MINUTES} minutes.`);
  }
  readNumber('initialp', 'Initial concentration', { min: 0 });
  readNumber('Vd1', 'V1', { strictlyPositive: true });
  readNumber('ke0', 'ke0', { min: 0, optional: true });
  const tciActive = Boolean(document.getElementById('tciEnabled')?.checked);
  const scheduleActive = !tciActive && Boolean(document.getElementById('useSchedule')?.checked);
  if (!tciActive && !scheduleActive) {
    readNumber('b', 'Bolus dose', { min: 0 });
    readNumber('tbolus', 'Loading-dose duration', { min: 0 });
    readNumber('infusion', 'Infusion rate', { min: 0 });
    readNumber('tinfusion', 'Infusion duration', { min: 0 });
  }
  if (tciActive) {
    validateTciTargetChanges(addError);
    readNumber('tciTarget', 'TCI target', { strictlyPositive: true });
    readNumber('tciMaxRate', 'TCI maximum rate', { strictlyPositive: true });
    readNumber('tciStopTime', 'TCI stop time', { min: 0 });
    if (document.getElementById('tciTargetType')?.value === 'ce' && Number(ke0num?.value) <= 0) {
      addError('ke0', 'ke0 must be greater than 0 for an effect-site TCI target.');
    }
  }

  if (getPkInputMode() === 'microconstants') {
    const k12 = readNumber('k12input', 'k12', { min: 0 });
    const k21 = readNumber('k21input', 'k21', { min: 0 });
    const k13 = readNumber('k13input', 'k13', { min: 0 });
    const k31 = readNumber('k31input', 'k31', { min: 0 });
    readNumber('k10input', 'k10', { min: 0 });
    if (k12 > 0 && k21 <= 0)
      addError('k21input', 'k21 must be greater than 0 when k12 is greater than 0.');
    if (k13 > 0 && k31 <= 0)
      addError('k31input', 'k31 must be greater than 0 when k13 is greater than 0.');
  } else {
    const v2 = readNumber('Vd2', 'V2', { min: 0 });
    const v3 = readNumber('Vd3', 'V3', { min: 0 });
    const q2 = readNumber('Q2', 'Q2', { min: 0 });
    const q3 = readNumber('Q3', 'Q3', { min: 0 });
    readNumber('Cl', 'Clearance', { min: 0 });
    if (q2 > 0 && v2 <= 0) addError('Vd2', 'V2 must be greater than 0 when Q2 is greater than 0.');
    if (q3 > 0 && v3 <= 0) addError('Vd3', 'V3 must be greater than 0 when Q3 is greater than 0.');
  }

  const schedule = getScheduleFromDOM();
  scheduleValidationErrors = [];
  if (scheduleActive && schedule.enabled) {
    validateScheduleState(addError);
  }
  renderScheduleErrorLinks();

  invalidIds.forEach((id) => document.getElementById(id)?.classList.add('is-invalid'));
  $$('.is-invalid').forEach((el) => el.setAttribute('aria-invalid', 'true'));
  const summary = document.getElementById('validationSummary');
  if (summary) {
    summary.hidden = errors.length === 0;
    summary.textContent = errors.length ? `Simulation not updated: ${errors.join(' ')}` : '';
  }
  document.getElementById('mainValidationSummary').hidden = errors.length === 0;
  document.getElementById('mainInputErrors').textContent = errors.length
    ? `Results have not updated. ${[...new Set(errors)].join(' ')}`
    : '';
  document.getElementById('scheduleEditorErrors').hidden = errors.length === 0;
  document.getElementById('scheduleEditorErrors').textContent = errors.join(' ');
  const scheduleWarnings = document.getElementById('scheduleWarnings');
  if (scheduleWarnings) {
    const warnings = scheduleActive ? getScheduleWarnings(schedule, finalTime) : [];
    scheduleWarnings.hidden = warnings.length === 0;
    scheduleWarnings.textContent = warnings.length ? `Schedule note: ${warnings.join(' ')}` : '';
  }
  setSimulationStatus(
    errors.length
      ? 'Results are not updated. Correct the highlighted parameters.'
      : 'Simulation is up to date.',
    errors.length ? 'error' : 'ok',
  );
  return errors.length === 0;
}
