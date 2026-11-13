/* Copyright (c) 2026 Julian W. Landaw | SPDX-License-Identifier: MIT */
// Deliberately load no application UI: any DOM dependency fails in this worker.
importScripts(
  '../docs/assets/js/math.js',
  '../docs/assets/js/threecompartmentmodel_units.js',
  '../docs/assets/js/threecompartmentmodel_engine.js',
);
const checks = [];
const check = (name, condition) => {
  checks.push(`${condition ? 'PASS' : 'FAIL'} ${name}`);
  if (!condition) throw Error(name);
};
const approx = (a, b, tolerance = 1e-8) => Number.isFinite(a) && Math.abs(a - b) <= tolerance;
try {
  check(
    'numerical engine loads without a document or window',
    typeof document === 'undefined' && typeof window === 'undefined',
  );
  const state = {
    pk: { inputMode: 'clearance', Vd1: 1, Vd2: 0, Vd3: 0, Cl: 1, Q2: 0, Q3: 0, ke0: 0.5 },
    units: { conc: 'mg/mL', bolus: 'mg/kg', infusion: 'mg/kg/min' },
    patient: { weightKg: 70 },
    inputs: { b: 1, tbolus: 0, infusion: 0, tinfusion: 0, tfinal: 2, initialp: 0 },
    schedule: { enabled: false, boluses: [], infusions: [] },
    tci: { enabled: false },
  };
  const original = JSON.stringify(state);
  const bolus = simulateStrategy(state);
  check(
    'standalone engine agrees with analytical one-compartment decay',
    bolus.cp.every((value, index) => approx(value, Math.exp(-bolus.ts[index]))),
  );
  check(
    'standalone effect-site solution agrees with analytical concentration',
    bolus.ce.every((value, index) =>
      approx(value, Math.exp(-0.5 * bolus.ts[index]) - Math.exp(-bolus.ts[index])),
    ),
  );
  check('standalone simulation does not mutate its input', JSON.stringify(state) === original);
  const rates = computeModelRates(resolvePkParameters(state.pk));
  check('standalone terminal half-life is ln(2)', approx(rates.terminalHalfLife, Math.log(2)));
  check(
    'isolated bolus has no infusion context half-time',
    contextSensitiveHalfTime(bolus, resolvePkParameters(state.pk)) === null,
  );
  const absolute = structuredClone(state);
  absolute.units.bolus = 'mg';
  absolute.inputs.b = 70;
  check(
    'standalone absolute dosing uses the supplied weight',
    approx(simulateStrategy(absolute).cp[0], 1),
  );
  const infusion = structuredClone(state);
  infusion.inputs.b = 0;
  infusion.inputs.infusion = 1;
  infusion.inputs.tinfusion = 1;
  const delivery = simulateStrategy(infusion);
  check('standalone finite infusion conserves delivered dose', approx(delivery.totalDoseMgKg, 1));
  check(
    'cumulative dose agrees with delivered dose',
    approx(delivery.cumulativeDoseMgKg.at(-1), delivery.totalDoseMgKg),
  );
  const events = structuredClone(state);
  events.inputs.b = 0;
  events.schedule = {
    enabled: true,
    boluses: [
      { time: 0, dose: 1, duration: 0 },
      { time: 0.35, dose: 2, duration: 0 },
      { time: 2, dose: 3, duration: 0 },
    ],
    infusions: [],
  };
  const jumps = simulateStrategy(events),
    jumpInput = prepareSimulationInput(events);
  check(
    'cumulative dose includes initial and final boluses',
    approx(jumps.cumulativeDoseMgKg[0], 1) && approx(jumps.cumulativeDoseMgKg.at(-1), 6),
  );
  const before = sampleSimulation(jumps, jumpInput, 0.349),
    after = sampleSimulation(jumps, jumpInput, 0.35);
  check(
    'sampling never interpolates ahead of a bolus jump',
    approx(before.cp, Math.exp(-0.349)) &&
      approx(before.cumulativeDoseMgKg, 1) &&
      approx(after.cp, Math.exp(-0.35) + 2) &&
      approx(after.cumulativeDoseMgKg, 3),
  );
  const fractional = sampleSimulation(delivery, prepareSimulationInput(infusion), 0.123);
  check(
    'fractional sampling follows the analytical infusion solution',
    approx(fractional.cp, 1 - Math.exp(-0.123)) && approx(fractional.cumulativeDoseMgKg, 0.123),
  );
  check(
    'standalone infusion context half-time is ln(2)',
    approx(contextSensitiveHalfTime(delivery, resolvePkParameters(state.pk)), Math.log(2)),
  );
  const micro = structuredClone(state);
  micro.pk = { ...state.pk, inputMode: 'microconstants', k10: 1, k12: 0, k21: 0, k13: 0, k31: 0 };
  check(
    'clearance and microconstant modes produce identical predictions',
    simulateStrategy(micro).cp.every((value, index) => approx(value, bolus.cp[index])),
  );
  for (const targetType of ['cp', 'ce']) {
    const tci = structuredClone(state);
    tci.tci = {
      enabled: true,
      targetType,
      target: 1,
      maxRate: 50,
      stopTime: 1.8,
      changes: [
        { time: 0.35, target: 2 },
        { time: 0.75, target: 0 },
        { time: 1.25, target: 0.5 },
      ],
    };
    const source = simulateStrategy(tci);
    const replayState = structuredClone(tci);
    replayState.tci.enabled = false;
    replayState.schedule = buildScheduleFromTciSimulation(
      source,
      INFUSIONUNITS[tci.units.infusion],
      70,
    );
    const replay = simulateStrategy(replayState);
    check(
      `standalone ${targetType} TCI replay preserves dose and predictions`,
      approx(source.totalDoseMgKg, replay.totalDoseMgKg) &&
        replay.ts.every((time, index) => {
          const sourceIndex = source.ts.findIndex((t) => approx(t, time));
          return (
            sourceIndex >= 0 &&
            approx(replay.cp[index], source.cp[sourceIndex]) &&
            approx(replay.ce[index], source.ce[sourceIndex])
          );
        }),
    );
    check(
      `standalone ${targetType} TCI obeys its cap and zero-target pause`,
      source.intervalRates.every(
        (rate, index) =>
          rate >= 0 &&
          rate <= 50 &&
          (source.ts[index] < 0.75 || source.ts[index] >= 1.25 || rate === 0),
      ),
    );
  }
  self.postMessage({ passed: true, checks });
} catch (error) {
  self.postMessage({ passed: false, checks, error: error.message });
}
