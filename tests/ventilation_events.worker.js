/* Copyright (c) 2026 Julian W. Landaw | SPDX-License-Identifier: MIT */
importScripts(
  '../docs/assets/js/ventilation_co2.js',
  '../docs/assets/js/ventilation_regions.js',
  '../docs/assets/js/ventilation_scenarios.js',
  '../docs/assets/js/ventilation_engine.js',
);
const checks = [],
  check = (name, value) => {
    checks.push(`${value ? 'PASS' : 'FAIL'} ${name}`);
    if (!value) throw Error(name);
  };
const near = (a, b, tol = 1e-7) => Number.isFinite(a) && Math.abs(a - b) < tol;
try {
  const base = {
    ...Ventilation.defaults,
    IF: 0.33,
    VT: 500,
    PC: 10.4,
    T: 120,
    pressureLimit: 40,
    eventOnset: 30,
    eventRecovery: 90,
  };
  const pressureCase = { ...base, R: 30, Rexp: 30, T: 5, eventType: 'none', pressureLimit: 20 };
  const limited = Ventilation.simulate(pressureCase),
    q = limited.timing,
    C = pressureCase.C / 1000;
  const hit =
    ((pressureCase.pressureLimit - pressureCase.PEEP - pressureCase.R * q.flow) * C) / q.flow;
  const equilibrium = (pressureCase.pressureLimit - pressureCase.PEEP) * C;
  const expected =
    (equilibrium +
      (q.flow * hit - equilibrium) * Math.exp(-(q.Tflow - hit) / (pressureCase.R * C))) *
    1000;
  check(
    'VC switches from constant flow to the analytical pressure-limited filling solution',
    near(limited.metrics.VT, expected, 1e-5) && limited.metrics.VT < pressureCase.VT,
  );
  check(
    'pressure-limited VC never exceeds the pressure ceiling or commanded flow',
    limited.p.every((p) => p <= 20 + 1e-7) &&
      limited.f.every((f, i) => limited.phase[i] !== 'inspiration' || f <= q.flow + 1e-7),
  );
  check(
    'cap onset is recorded as a mechanical segment boundary',
    limited.segments.some((s) => near(s.end, hit, 1e-7)),
  );
  for (const mode of ['vcv', 'pcv']) {
    const bronch = Ventilation.simulate({ ...base, mode, eventType: 'bronchospasm' }),
      before = bronch.breaths[5].metrics,
      after = bronch.breaths[8].metrics,
      recovered = bronch.breaths[23].metrics;
    check(
      `${mode}: baseline is warmed off-screen and stable`,
      bronch.warmup.settled &&
        bronch.warmup.seconds > 0 &&
        Math.abs(before.EtCO2 - bronch.breaths[1].metrics.EtCO2) < 0.3,
    );
    check(
      `${mode}: severe bronchospasm reduces delivered volume and measured CO2`,
      after.VT < before.VT / 2 && after.EtCO2 < before.EtCO2 / 3,
    );
    check(
      `${mode}: CO2 stores rise despite a low capnogram`,
      after.TissueCO2 > before.TissueCO2 && after.EstimatedPaCO2 === null,
    );
    check(
      `${mode}: resolving obstruction restores ventilation with a CO2 rebound`,
      recovered.VT > after.VT * 2 && bronch.breaths[19].metrics.EtCO2 > before.EtCO2,
    );
    check(
      `${mode}: obstruction conserves produced, stored and eliminated CO2`,
      Math.abs(bronch.co2Balance.residual) < 1e-9,
    );
    check(
      `${mode}: event onset preserves both regional volumes and measured CO2`,
      [30, 90].every((t) => {
        const a = Ventilation.sample(bronch, t, 'left'),
          b = Ventilation.sample(bronch, t, 'right');
        return a.regionVolumes.every((v, i) => near(v, b.regionVolumes[i])) && near(a.co2, b.co2);
      }),
    );
    if (mode === 'vcv')
      check(
        'severe bronchospasm reaches the VC ceiling',
        after.PressureLimited && near(after.Peak, 40),
      );
    else
      check(
        'PC maintains pressure while obstruction reduces volume',
        near(after.Peak, before.Peak) && !after.PressureLimited,
      );
    const embolism = Ventilation.simulate({ ...base, mode, eventType: 'air-embolism' }),
      e0 = embolism.breaths[5].metrics,
      e1 = embolism.breaths[17].metrics;
    check(
      `${mode}: reduced pulmonary delivery lowers EtCO2 without reducing metabolism`,
      e1.EtCO2 < e0.EtCO2 / 2 && near(embolism.co2Balance.produced, bronch.co2Balance.produced),
    );
    check(
      `${mode}: embolism initially preserves airway pressure and delivered volume`,
      near(e1.VT, e0.VT) && near(e1.Peak, e0.Peak) && e1.TissueCO2 > e0.TissueCO2,
    );
    check(
      `${mode}: embolism and recovery conserve CO2`,
      Math.abs(embolism.co2Balance.residual) < 1e-9,
    );
    const kink = Ventilation.simulate({ ...base, mode, eventType: 'tube-kink', eventSeverity: 1 });
    check(
      `${mode}: complete tube obstruction closes external flow but preserves stored gas`,
      kink.breaths[8].metrics.VT === 0 &&
        (mode !== 'vcv' || kink.breaths[8].metrics.PressureLimited) &&
        kink.breaths[8].metrics.EtCO2 < 1 &&
        kink.co2Balance.circuitLoss > 0 &&
        Math.abs(kink.co2Balance.residual) < 1e-9,
    );
    const plug = Ventilation.simulate({ ...base, mode, eventType: 'mucus-plug', eventSeverity: 1 }),
      b = plug.breaths[8];
    check(
      `${mode}: a complete regional plug preserves the blocked region's volume`,
      near(b.regionV0[1], b.regionVe[1]) && near(b.regionVe[1], b.regionVend[1]),
    );
    check(
      `${mode}: a regional plug permits continued ventilation through the other region`,
      b.metrics.VT > 100 && Math.abs(plug.co2Balance.residual) < 1e-9,
    );
    for (const type of [
      'malignant-hyperthermia',
      'hypotension',
      'pulmonary-embolism',
      'insufflation',
      'mainstem',
      'rebreathing',
      'compliance-loss',
    ]) {
      const run = Ventilation.simulate({
          ...base,
          mode,
          eventType: type,
          eventSeverity: VentilationScenarios.catalog[type].severity ?? base.eventSeverity,
        }),
        before = run.breaths[5].metrics,
        late = run.breaths[17].metrics,
        recovered = run.breaths[23].metrics,
        gas = run.co2Balance;
      check(
        `${mode} ${type}: new event preserves a valid CO2 mass balance`,
        gas.valid && Math.abs(gas.residual) < 1e-9,
      );
      check(
        `${mode} ${type}: onset and recovery preserve volumes and sensor continuity`,
        [30, 90].every((t) => {
          const a = Ventilation.sample(run, t, 'left'),
            b = Ventilation.sample(run, t, 'right');
          return a.regionVolumes.every((v, i) => near(v, b.regionVolumes[i])) && near(a.co2, b.co2);
        }),
      );
      check(
        `${mode} ${type}: recovery restores baseline mechanical delivery`,
        near(recovered.VT, before.VT, 0.01) && near(recovered.Peak, before.Peak, 0.01),
      );
      if (type === 'malignant-hyperthermia') {
        check(
          `${mode}: MH raises production and EtCO2 without changing airway mechanics`,
          late.EtCO2 > before.EtCO2 + 8 &&
            gas.produced > bronch.co2Balance.produced * 1.8 &&
            near(late.VT, before.VT) &&
            near(late.Peak, before.Peak),
        );
      } else if (type === 'hypotension' || type === 'pulmonary-embolism') {
        check(
          `${mode} ${type}: low pulmonary delivery lowers EtCO2 with unchanged production and mechanics`,
          late.EtCO2 < before.EtCO2 * 0.75 &&
            late.TissueCO2 > before.TissueCO2 &&
            near(gas.produced, bronch.co2Balance.produced) &&
            near(late.VT, before.VT) &&
            near(late.Peak, before.Peak),
        );
        if (type === 'pulmonary-embolism') {
          const point = Ventilation.sample(run, 87.5);
          check(
            `${mode}: PE underperfuses ventilated regions unequally`,
            point.alveolarCO2Regions[1] < point.alveolarCO2Regions[0] &&
              point.regionVolumes.every((v) => v > 0),
          );
        }
      } else if (type === 'insufflation') {
        check(
          `${mode}: insufflation adds an audited CO2 load without changing metabolism`,
          gas.absorbed > 0 &&
            gas.inspired === 0 &&
            near(gas.produced, bronch.co2Balance.produced) &&
            late.EtCO2 > before.EtCO2,
        );
        check(
          `${mode}: insufflation changes compliance and has a continuous absorption tail`,
          (mode === 'vcv' ? late.Peak > before.Peak + 3 : late.VT < before.VT * 0.8) &&
            Ventilation.sample(run, 90).absorbedCO2 > 0 &&
            Ventilation.sample(run, 110).absorbedCO2 < Ventilation.sample(run, 90).absorbedCO2,
        );
        const left = Ventilation.sample(run, 31, 'left');
        check(
          `${mode}: elastic regional pressure uses event compliance`,
          left.regionVolumes.every((v, i) =>
            near(
              left.regionPressures[i] - base.PEEP,
              v / 1000 / VentilationScenarios.effect(run.settings, 31).Ci[i],
            ),
          ),
        );
      } else if (type === 'mainstem') {
        const b = run.breaths[17];
        check(
          `${mode}: mainstem isolates one region without forcing an absent capnogram`,
          near(b.regionV0[1], b.regionVe[1]) &&
            near(b.regionVe[1], b.regionVend[1]) &&
            late.EtCO2 > 10 &&
            (mode === 'vcv' ? late.Peak > before.Peak + 10 : late.VT < before.VT * 0.6),
        );
      } else if (type === 'rebreathing') {
        check(
          `${mode}: rebreathing raises the inspired baseline using an audited inlet gas`,
          gas.inspired > 0 &&
            gas.absorbed === 0 &&
            near(gas.produced, bronch.co2Balance.produced) &&
            Ventilation.sample(run, 85 + run.timing.Ti * 0.8).co2 > 6 &&
            late.EtCO2 > before.EtCO2 &&
            Ventilation.sample(run, 115 + run.timing.Ti * 0.8).co2 < 2,
        );
      } else if (type === 'compliance-loss') {
        check(
          `${mode}: isolated stiffness changes pressure or volume without adding a CO2 source`,
          (mode === 'vcv' ? late.Peak > before.Peak + 8 : late.VT < before.VT * 0.6) &&
            gas.absorbed === 0 &&
            gas.inspired === 0 &&
            near(gas.produced, bronch.co2Balance.produced),
        );
        const b = run.breaths[17],
          point = Ventilation.sample(run, b.start + run.timing.Ti, 'left');
        check(
          `${mode}: end-inspiratory measurements use changed compliance`,
          near(point.palv, b.metrics.EndInspiratory) &&
            near(
              point.palv - base.PEEP,
              point.regionVolumes.reduce((s, v) => s + v, 0) /
                1000 /
                VentilationScenarios.effect(run.settings, point.t, 'left').Ci.reduce(
                  (s, c) => s + c,
                  0,
                ),
            ),
        );
      }
    }
  }
  check(
    'all new events are mechanically and chemically neutral at zero severity',
    Object.keys(VentilationScenarios.catalog).every((type) =>
      [10, 45, 105].every((t) => {
        const e = VentilationScenarios.effect({ ...base, eventType: type, eventSeverity: 0 }, t),
          r = VentilationRegions.configure(base);
        return (
          e.R.every((x, i) => near(x, r.R[i])) &&
          e.Re.every((x, i) => near(x, r.Re[i])) &&
          e.Ci.every((x) => near(x, r.Ci)) &&
          e.perfusion.every((x) => near(x, 1)) &&
          near(e.production, 1) &&
          e.absorbed === 0 &&
          e.inspired === 0 &&
          !e.commonClosed &&
          !e.closed.some(Boolean)
        );
      }),
    ),
  );
  const abrupt = Ventilation.simulate({
    ...base,
    eventType: 'tube-kink',
    eventOnset: 31.37,
    eventRecovery: 73.21,
  });
  check(
    'mid-breath onset and recovery retain exact timestamps',
    abrupt.t.some((t) => near(t, 31.37)) && abrupt.t.some((t) => near(t, 73.21)),
  );
  check(
    'mid-breath obstruction preserves lung-volume continuity',
    [31.37, 73.21].every((t) =>
      near(Ventilation.sample(abrupt, t, 'left').v, Ventilation.sample(abrupt, t, 'right').v),
    ),
  );
  for (const t of [31.5, 33, 74]) {
    const p = Ventilation.sample(abrupt, t),
      e = VentilationScenarios.effect(abrupt.settings, t),
      R = p.phase === 'expiration' ? e.Re : e.R;
    const junction = p.p - abrupt.settings.PEEP - e.common * p.f;
    check(
      `common airway and regional pressures agree at ${t} s`,
      p.regionFlows.every((f, i) =>
        near(p.regionVolumes[i] / 1000 / abrupt.timing.regions.Ci + R[i] * f, junction, 1e-6),
      ),
    );
  }
  const refined = VentilationScenarios.simulate(
    { ...base, eventType: 'tube-kink', eventOnset: 31.37, eventRecovery: 73.21 },
    { step: 0.005 },
  );
  check(
    'mechanical and CO2 results converge when scenario sampling is refined',
    near(refined.breaths[8].metrics.VT, abrupt.breaths[8].metrics.VT, 0.02) &&
      near(refined.breaths[8].metrics.EtCO2, abrupt.breaths[8].metrics.EtCO2, 0.2),
  );
  const insufflationSettings = {
      ...base,
      eventType: 'insufflation',
      pressureLimit: 20,
      eventOnset: 31.13,
      eventRecovery: 73.21,
    },
    insufflation = Ventilation.simulate(insufflationSettings),
    fineInsufflation = VentilationScenarios.simulate(insufflationSettings, { step: 0.005 });
  check(
    'mid-breath compliance changes preserve each region and sensor state',
    [31.13, 73.21].every((t) => {
      const a = Ventilation.sample(insufflation, t, 'left'),
        b = Ventilation.sample(insufflation, t, 'right');
      return a.regionVolumes.every((v, i) => near(v, b.regionVolumes[i])) && near(a.co2, b.co2);
    }),
  );
  check(
    'stiffening switches VC to pressure-limited delivery without exceeding its inspiratory ceiling',
    insufflation.breaths[8].metrics.VT < base.VT &&
      insufflation.breaths[8].metrics.PressureLimited &&
      insufflation.p.every((p, i) => insufflation.phase[i] !== 'inspiration' || p <= 20 + 1e-7),
  );
  check(
    'coupled compliance and absorbed-CO2 results converge on a finer grid',
    near(insufflation.breaths[8].metrics.VT, fineInsufflation.breaths[8].metrics.VT, 0.02) &&
      near(
        insufflation.breaths[17].metrics.EtCO2,
        fineInsufflation.breaths[17].metrics.EtCO2,
        0.2,
      ) &&
      near(insufflation.co2Balance.absorbed, fineInsufflation.co2Balance.absorbed, 1e-5),
  );
  const invalid = [
    { eventOnset: 120 },
    { eventRecovery: 20 },
    { pressureLimit: 5 },
    { capnogramShape: 'obstructive' },
  ];
  check(
    'invalid scenario schedules, pressure limits and schematic tracings are rejected',
    invalid.every(
      (values) =>
        Ventilation.validate({ ...base, eventType: 'bronchospasm', ...values }).length > 0,
    ),
  );
  check(
    'complete common closure requires a finite VC ceiling',
    Ventilation.validate({
      ...base,
      eventType: 'tube-kink',
      eventSeverity: 1,
      pressureLimit: 0,
    }).some((e) => e.field === 'pressureLimit'),
  );
  check(
    'pressure-limited VC rejects schematic tracing overlays',
    Ventilation.validate({ ...pressureCase, capnogramShape: 'reference' }).some(
      (e) => e.field === 'capnogramShape',
    ),
  );
  self.postMessage({ passed: true, checks });
} catch (error) {
  self.postMessage({ passed: false, checks, error: error.message });
}
