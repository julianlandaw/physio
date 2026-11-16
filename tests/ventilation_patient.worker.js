/* Copyright (c) 2026 Julian W. Landaw | SPDX-License-Identifier: MIT */
importScripts(
  '../docs/assets/js/ventilation_co2.js',
  '../docs/assets/js/ventilation_regions.js',
  '../docs/assets/js/ventilation_scenarios.js',
  '../docs/assets/js/ventilation_engine.js',
  '../docs/assets/js/ventilation_patient.js',
);
const checks = [],
  check = (name, value) => {
    checks.push(`${value ? 'PASS' : 'FAIL'} ${name}`);
    if (!value) throw Error(name);
  };
const near = (a, b, tol = 1e-7) => Number.isFinite(a) && Math.abs(a - b) < tol;
try {
  const adult = { age: 40, ibw: 70, mlPerKg: 6, scaleModel: true },
    base = { ...Ventilation.defaults };
  check('patient calculations run independently of the page', typeof document === 'undefined');
  check(
    'invalid ages, weights, targets and missing scaling choice are rejected',
    [
      { ...adult, age: 0.5 },
      { ...adult, age: 111 },
      { ...adult, ibw: 0 },
      { ...adult, ibw: 151 },
      { ...adult, age: NaN },
      { ...adult, ibw: '70' },
      { ...adult, mlPerKg: 9 },
      { ...adult, scaleModel: undefined },
      null,
    ].every((p) => VentilationPatient.validate(p).length > 0),
  );
  check(
    'child rates follow the cited low-normal age anchors',
    [
      [1, 20],
      [2, 18],
      [5, 17],
      [10, 14],
      [18, 12],
    ].every(([age, rate]) => near(VentilationPatient.rateForAge(age), rate)),
  );
  check(
    'interpolation is continuous and adult age does not invent a rate change',
    near(VentilationPatient.rateForAge(7.5), 15.5) &&
      near(VentilationPatient.rateForAge(20), VentilationPatient.rateForAge(90)) &&
      !Number.isFinite(VentilationPatient.rateForAge(0.5)),
  );
  const a = VentilationPatient.suggest(adult, base);
  check(
    '70 kg adult reference suggests 420 mL and an explicit 6–8 mL/kg range',
    !a.errors.length &&
      a.patch.VT === 420 &&
      a.patch.RR === 12 &&
      a.range[0] === 420 &&
      a.range[1] === 560 &&
      a.patch.PEEP === 5,
  );
  check(
    'age and weight do not silently replace the requested I:E ratio',
    !Object.hasOwn(a.patch, 'IF') && base.IF === 2 / 3,
  );
  for (const [age, ibw] of [
    [1, 5],
    [2, 10],
    [5, 20],
    [10, 35],
    [17, 60],
    [40, 70],
    [80, 150],
  ]) {
    const profile = { ...adult, age, ibw },
      suggestion = VentilationPatient.suggest(profile, base),
      p = { ...base, ...suggestion.patch, initial: 'steady' };
    check(
      `${age} y ${ibw} kg: sized model and settings pass physical-input validation`,
      !suggestion.errors.length && !Ventilation.validate(p).length,
    );
    const q = Ventilation.timing({ ...p, mode: 'pcv' }),
      tau = (p.R * p.C) / 1000;
    const pressureVT =
      (1000 * suggestion.PC * (p.C / 1000) * -Math.expm1(-q.Ti / tau) * -Math.expm1(-q.Te / tau)) /
      -Math.expm1(-q.cycle / tau);
    check(
      `${age} y ${ibw} kg: PC fit matches an independent periodic RC formula`,
      near(pressureVT, 6 * ibw, 1e-5),
    );
    const repeated = VentilationPatient.suggest(profile, p);
    check(
      `${age} y ${ibw} kg: repeated application does not compound model scaling`,
      ['C', 'R', 'Rexp', 'FRC', 'VD', 'CO2Store', 'VCO2', 'modelWeight'].every((k) =>
        near(repeated.patch[k], p[k]),
      ),
    );
    for (const mode of ['vcv', 'pcv']) {
      const run = Ventilation.simulate({ ...p, mode }),
        m = run.metrics;
      check(
        `${mode} ${age} y ${ibw} kg: requested size-based VT is delivered in the baseline model`,
        near(m.VT, 6 * ibw, 0.01),
      );
      check(
        `${mode} ${age} y ${ibw} kg: small and large gas stores remain valid and mass-conserving`,
        run.co2Balance.valid &&
          Math.abs(run.co2Balance.residual) < 1e-8 &&
          run.co2.every((v) => Number.isFinite(v) && v >= 0),
      );
    }
  }
  const kept = VentilationPatient.suggest({ ...adult, ibw: 20, age: 5, scaleModel: false }, base);
  check(
    'opting out preserves entered mechanics and gas properties',
    !kept.errors.length &&
      !Object.hasOwn(kept.patch, 'C') &&
      !Object.hasOwn(kept.patch, 'modelWeight'),
  );
  const impossible = VentilationPatient.suggest(
    { ...adult, ibw: 150, scaleModel: false },
    { ...base, mode: 'pcv', C: 1, R: 250 },
  );
  check(
    'an unattainable pressure target is explained instead of silently capped',
    impossible.errors.some((e) => e.field === 'PC') &&
      !impossible.pressureFits &&
      !Object.hasOwn(impossible.patch, 'PC'),
  );
  const timed = VentilationPatient.suggest(
    { ...adult, age: 5, ibw: 20 },
    { ...base, IF: 0.3 },
    true,
  );
  check(
    'Keep Ti fixed is honored when changing the age-based rate',
    near((60 / timed.patch.RR) * timed.patch.IF, (60 / base.RR) * 0.3),
  );
  const invalidTiming = VentilationPatient.suggest({ ...adult, age: 1, ibw: 5 }, base, true);
  check(
    'an incompatible fixed Ti is reported rather than clamped',
    invalidTiming.errors.some((e) => e.field === 'IF'),
  );
  const small = VentilationPatient.suggest({ ...adult, age: 5, ibw: 20 }, base).patch;
  for (const mode of ['vcv', 'pcv'])
    for (const type of Object.keys(VentilationScenarios.catalog).filter((t) => t !== 'none')) {
      const run = Ventilation.simulate({
        ...base,
        ...small,
        mode,
        T: 120,
        initial: 'steady',
        pressureLimit: 40,
        eventType: type,
        eventOnset: 30,
        eventRecovery: 90,
        eventSeverity: VentilationScenarios.catalog[type].severity ?? 0.85,
      });
      check(
        `${mode}: child-sized ${type} event retains a valid mass balance`,
        run.co2Balance.valid && Math.abs(run.co2Balance.residual) < 1e-8,
      );
    }
  self.postMessage({ passed: true, checks });
} catch (error) {
  self.postMessage({ passed: false, checks, error: error.message });
}
