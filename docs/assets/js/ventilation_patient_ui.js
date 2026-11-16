/* Copyright (c) 2026 Julian W. Landaw | SPDX-License-Identifier: MIT */
let ventPatient = null;
let ventPatientLoadError = '';
function resetVentPatient() {
  ventPatient = null;
  ventPatientLoadError = '';
  ventElement('patientAge').value = ventElement('patientWeight').value = '';
  ventElement('patientVolume').value = '6';
  ventElement('patientScale').checked = true;
  ventElement('patientApplied').textContent = '';
}
function ventPatientReference(settings) {
  if (!ventPatient) return settings;
  const suggestion = VentilationPatient.suggest(ventPatient, settings);
  if (suggestion.errors.length) {
    ventElement('patientPanel').open = true;
    ventElement('patientError').textContent = suggestion.errors.map((e) => e.message).join(' ');
    return null;
  }
  return { ...settings, ...suggestion.patch };
}
function readVentPatient() {
  return {
    age: readVentNumber(ventElement('patientAge').value),
    ibw: readVentNumber(ventElement('patientWeight').value),
    mlPerKg: Number(ventElement('patientVolume').value),
    scaleModel: ventElement('patientScale').checked,
  };
}
function renderVentPatient() {
  const profile = readVentPatient(),
    empty =
      ventElement('patientAge').value.trim() === '' &&
      ventElement('patientWeight').value.trim() === '';
  const errors = VentilationPatient.validate(profile),
    message = ventElement('patientError');
  for (const [field, id] of [
    ['age', 'patientAge'],
    ['ibw', 'patientWeight'],
  ])
    ventElement(id).setAttribute(
      'aria-invalid',
      String(!empty && errors.some((e) => e.field === field)),
    );
  ventElement('applyPatient').disabled = empty || errors.length > 0 || !ventValid;
  ventElement('patientSummary').textContent = ventPatient
    ? `${ventPatient.age} y · ${ventPatient.ibw} kg`
    : '';
  if (empty || errors.length) {
    message.textContent = empty ? ventPatientLoadError : errors.map((e) => e.message).join(' ');
    ventElement('patientPreview').textContent =
      'Enter age and ideal/predicted weight to preview a starting example.';
    return;
  }
  if (!ventValid) {
    message.textContent = 'Correct the ventilator settings before applying a patient example.';
    return;
  }
  const suggestion = VentilationPatient.suggest(
    profile,
    ventSettings,
    ventElement('keepTi').checked,
  );
  message.textContent = suggestion.errors.map((e) => e.message).join(' ');
  ventElement('applyPatient').disabled = suggestion.errors.length > 0;
  ventElement('patientPreview').textContent =
    `VT ${ventFormat(suggestion.patch.VT, 0)} mL (${profile.mlPerKg} mL/kg; size reference ${suggestion.range.map((v) => ventFormat(v, 0)).join('–')} mL); rate ${ventFormat(suggestion.patch.RR)} /min; PEEP 5 cm H₂O. ${suggestion.pressureFits ? `Baseline PC estimate ${ventFormat(suggestion.PC)} cm H₂O above PEEP.` : 'No PC estimate within the model range.'}${!profile.scaleModel && ventSettings.VD >= suggestion.patch.VT ? ' Current airway dead space is at least the target volume; use size scaling or review dead space before interpreting CO₂.' : ''}`;
}
function initVentPatientUI() {
  ventElement('keepTi').addEventListener('change', renderVentPatient);
  const query = ventQuery.get('patient');
  if (query) {
    try {
      if (query.length > 512) throw Error('Profile too large');
      const parsed = JSON.parse(query),
        profile = {
          age: parsed.age,
          ibw: parsed.ibw,
          mlPerKg: parsed.mlPerKg,
          scaleModel: parsed.scaleModel,
        };
      if (VentilationPatient.validate(profile).length) throw Error('Invalid profile');
      ventPatient = profile;
      ventElement('patientAge').value = profile.age;
      ventElement('patientWeight').value = profile.ibw;
      ventElement('patientVolume').value = profile.mlPerKg;
      ventElement('patientScale').checked = profile.scaleModel;
    } catch {
      ventPatientLoadError = 'The shared patient profile was invalid and was not loaded.';
      ventElement('patientPanel').open = true;
    }
  }
  for (const id of ['patientAge', 'patientWeight', 'patientVolume', 'patientScale'])
    ventElement(id).addEventListener(
      id === 'patientAge' || id === 'patientWeight' ? 'input' : 'change',
      () => {
        const profile = readVentPatient();
        ventPatientLoadError = '';
        ventElement('patientApplied').textContent = '';
        ventPatient = VentilationPatient.validate(profile).length ? null : profile;
        renderVentPatient();
        if (ventRun) {
          renderVentMetrics();
          updateVentURL();
        }
      },
    );
  ventElement('applyPatient').addEventListener('click', () => {
    const profile = readVentPatient();
    if (!ventValid || VentilationPatient.validate(profile).length) return;
    const suggestion = VentilationPatient.suggest(
      profile,
      ventSettings,
      ventElement('keepTi').checked,
    );
    if (suggestion.errors.length) {
      renderVentPatient();
      return;
    }
    ventPatient = profile;
    ventCO2Seed = null;
    ventForceRun = true;
    ventElement('co2StartNote').textContent =
      'CO₂ starts from the initial pressure for this size-based example.';
    setVentSettings({ ...ventSettings, ...suggestion.patch }, ventCaseId);
    ventElement('patientApplied').textContent =
      'Starting settings applied. Review the waveforms and adjust for the clinical situation.';
  });
}
