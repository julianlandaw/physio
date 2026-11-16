/* Copyright (c) 2026 Julian W. Landaw | SPDX-License-Identifier: MIT */
// Teaching starting points, not a patient-specific optimization or disease model.
const VentilationPatient = (() => {
  const limits = { age: [1, 110], ibw: [5, 150] };
  function validate(profile) {
    const errors = [];
    for (const [field, [min, max]] of Object.entries(limits))
      if (
        typeof profile?.[field] !== 'number' ||
        !Number.isFinite(profile[field]) ||
        profile[field] < min ||
        profile[field] > max
      )
        errors.push({
          field,
          message:
            field === 'age'
              ? 'Enter an age from 1 to 110 years; infants are outside this teaching model.'
              : 'Enter ideal/predicted weight from 5 to 150 kg.',
        });
    if (![6, 7, 8].includes(profile?.mlPerKg))
      errors.push({ field: 'mlPerKg', message: 'Choose 6, 7 or 8 mL/kg.' });
    if (typeof profile?.scaleModel !== 'boolean')
      errors.push({ field: 'scaleModel', message: 'Choose whether to scale the teaching model.' });
    return errors;
  }
  // Low-normal age anchors from ERC 2025 Table 2; interpolation is a teaching
  // choice. Adult age alone does not determine a different ventilator rate.
  function rateForAge(age) {
    if (!Number.isFinite(age) || age < limits.age[0] || age > limits.age[1]) return NaN;
    if (age >= 18) return 12;
    const anchors = [
      [1, 20],
      [2, 18],
      [5, 17],
      [10, 14],
      [18, 12],
    ];
    for (let i = 1; i < anchors.length; i++) {
      const [a, r] = anchors[i - 1],
        [b, s] = anchors[i];
      if (age <= b) return Math.round((r + ((s - r) * (age - a)) / (b - a)) * 10) / 10;
    }
    return NaN;
  }
  function suggest(profile, settings, keepTi = false) {
    const errors = validate(profile);
    if (errors.length) return { errors };
    const RR = rateForAge(profile.age),
      VT = profile.ibw * profile.mlPerKg;
    const patch = { VT, RR, PEEP: 5 };
    if (keepTi) patch.IF = (settings.IF * RR) / settings.RR;
    if (profile.scaleModel) {
      const scale = profile.ibw / settings.modelWeight;
      Object.assign(patch, {
        modelWeight: profile.ibw,
        C: settings.C * scale,
        R: settings.R / Math.sqrt(scale),
        Rexp: settings.Rexp / Math.sqrt(scale),
        FRC: settings.FRC * scale,
        VD: settings.VD * scale,
        CO2Store: settings.CO2Store * scale,
        VCO2: settings.VCO2 * scale,
      });
    }
    const next = { ...settings, ...patch };
    // Estimate pressure from the exact periodic, passive baseline mechanics.
    // No acute event is used to fit the pressure, and no CO2 target is fitted.
    let PC = null;
    if (next.IF >= Ventilation.limits.IF[0] && next.IF <= Ventilation.limits.IF[1]) {
      const baseline = { ...next, mode: 'pcv', PC: 1, eventType: 'none', initial: 'steady' },
        q = Ventilation.timing(baseline);
      const response = VentilationRegions.breath(
        baseline,
        q,
        0,
        VentilationRegions.initial(baseline, q),
      ).metrics.VT;
      if (Number.isFinite(response) && response > 0) PC = VT / response;
    }
    const pressureFits =
      Number.isFinite(PC) && PC >= Ventilation.limits.PC[0] && PC <= Ventilation.limits.PC[1];
    if (pressureFits) patch.PC = PC;
    const modelErrors = Ventilation.validate({ ...settings, ...patch });
    if (settings.mode === 'pcv' && !pressureFits)
      modelErrors.push({
        field: 'PC',
        message:
          'The target volume cannot be matched within the model’s pressure range. Adjust lung mechanics or the volume target.',
      });
    return {
      patch,
      PC,
      pressureFits,
      range: [6 * profile.ibw, 8 * profile.ibw],
      errors: modelErrors,
    };
  }
  return { limits, validate, rateForAge, suggest };
})();
