/* Copyright (c) 2026 Julian W. Landaw | SPDX-License-Identifier: MIT */
importScripts('../docs/assets/js/ventilation_engine.js');
const checks = [];
const check = (name, value) => {
  checks.push(`${value ? 'PASS' : 'FAIL'} ${name}`);
  if (!value) throw Error(name);
};
const near = (a, b, tol = 1e-8) => Number.isFinite(a) && Math.abs(a - b) <= tol;
try {
  check('ventilation engine runs without a document', typeof document === 'undefined');
  for (const mode of ['vcv', 'pcv']) {
    const p = { ...Ventilation.defaults, mode, T: 5 };
    const s = Ventilation.simulate(p),
      q = s.timing,
      b = s.completeBreaths[0];
    check(
      `${mode}: one complete breath has exact boundaries`,
      s.completeBreaths.length === 1 && s.t.at(-1) === 5 && s.t.some((t) => near(t, q.Ti)),
    );
    check(
      `${mode}: expiratory pressure equals set PEEP`,
      s.p.every((pressure, i) => s.phase[i] !== 'expiration' || near(pressure, p.PEEP)),
    );
    check(
      `${mode}: no artificial negative pressure or volume`,
      s.p.every((v) => v >= p.PEEP - 1e-8) && s.v.every((v) => v >= 0),
    );
    check(
      `${mode}: delivered minus expired volume equals retained volume`,
      near(b.metrics.VT - b.metrics.Expired, b.metrics.Retained),
    );
    const exp = Ventilation.sample(s, q.Ti + q.Te / 2);
    check(
      `${mode}: expiration follows the analytical exponential`,
      near(exp.v, 1000 * b.Ve * Math.exp(-q.Te / 2 / q.tauE)) &&
        near(exp.f, (-b.Ve * Math.exp(-q.Te / 2 / q.tauE)) / q.tauE),
    );
    const end = Ventilation.sample(s, 5);
    check(
      `${mode}: final sample is the selected breath's end`,
      end.phase === 'expiration' &&
        near(end.v, b.Vend * 1000) &&
        near(b.metrics.Intrinsic, end.palv - p.PEEP),
    );
    const inside = Ventilation.sample(s, q.Ti * 0.7);
    if (mode === 'pcv') {
      const expected = p.PC * q.C * (1 - Math.exp(-q.Ti / q.tauI));
      check(
        'pcv: delivered volume agrees with the closed-form solution',
        near(b.metrics.VT, expected * 1000),
      );
      check(
        'pcv: decelerating inspiratory flow follows its analytical solution',
        near(inside.f, (p.PC / p.R) * Math.exp((-q.Ti * 0.7) / q.tauI)),
      );
      check(
        'pcv: mean pressure is the time-weighted square wave',
        near(b.metrics.Mean, p.PEEP + p.PC * p.IF),
      );
      check('pcv: flowing inspiration is not labeled plateau pressure', b.metrics.Plateau === null);
    } else {
      check('vcv: exact set volume is delivered', near(b.metrics.VT, p.VT));
      check(
        'vcv: hold eliminates resistive pressure',
        Ventilation.sample(s, q.Tflow + q.Th / 2).f === 0 &&
          near(b.metrics.Peak - b.metrics.Plateau, p.R * q.flow),
      );
      check(
        'vcv: driving pressure uses total PEEP at breath start',
        near(b.metrics.Driving, p.VT / p.C),
      );
      const trapezoid =
        s.t.slice(1).reduce((sum, t, i) => sum + ((t - s.t[i]) * (s.p[i] + s.p[i + 1])) / 2, 0) / 5;
      check(
        'vcv: analytical mean agrees with pressure integration',
        near(trapezoid, b.metrics.Mean, 1e-7),
      );
      const noHold = Ventilation.simulate({ ...p, HF: 0 });
      check('vcv: a missing hold yields no plateau measurement', noHold.metrics.Plateau === null);
      const shortFlow = Ventilation.simulate({ ...p, RR: 40, IF: 0.05, HF: 0.8 });
      check(
        'vcv: very short flow phase still delivers exactly the selected volume',
        shortFlow.timing.Tflow < 0.05 && near(shortFlow.metrics.VT, p.VT),
      );
    }
    const stiff = Ventilation.simulate({ ...p, R: 1, Rexp: 1, C: 5 });
    check(
      `${mode}: minimum allowed R and C remain stable`,
      stiff.p.every((v) => v >= p.PEEP - 1e-8) &&
        stiff.v.every((v) => v >= 0) &&
        near(stiff.metrics.VT, mode === 'vcv' ? p.VT : p.PC * 5),
    );
    const partial = Ventilation.simulate({ ...p, RR: 1 });
    check(
      `${mode}: partial breaths have no invented breath metrics`,
      partial.completeBreaths.length === 0 && partial.metrics === null,
    );
    const notAligned = Ventilation.simulate({ ...p, RR: 17, IF: 0.37, HF: 0.19, T: 17.9 });
    check(
      `${mode}: non-grid phases and simulation end are retained`,
      near(notAligned.t.at(-1), 17.9) &&
        notAligned.t.some((t) => near(t, notAligned.timing.Ti)) &&
        notAligned.completeBreaths.length === 5,
    );
    check(
      `${mode}: metrics refer to the last complete breath`,
      notAligned.metrics === notAligned.completeBreaths.at(-1).metrics &&
        notAligned.breaths.at(-1).complete === false,
    );
    const steady = Ventilation.simulate({ ...p, R: 20, Rexp: 30, C: 60, initial: 'steady' });
    check(
      `${mode}: periodic initialization conserves volume breath to breath`,
      steady.breaths.every((b) => near(b.V0, b.Vend)) &&
        near(steady.metrics.VT, steady.metrics.Expired),
    );
    const fast = Ventilation.simulate({ ...p, R: 20, Rexp: 20, C: 60, RR: 24, T: 60 });
    const slow = Ventilation.simulate({ ...p, R: 20, Rexp: 20, C: 60, RR: 12, T: 60 });
    check(
      `${mode}: shorter expiration increases retained volume`,
      fast.metrics.Intrinsic > slow.metrics.Intrinsic,
    );
    const obstructed = Ventilation.simulate({ ...p, R: 30, Rexp: 30 });
    check(
      `${mode}: resistance change has the expected mode-dependent effect`,
      mode === 'vcv'
        ? obstructed.metrics.Peak > s.metrics.Peak
        : obstructed.metrics.VT < s.metrics.VT,
    );
  }
  let rejected = false;
  try {
    Ventilation.simulate({ ...Ventilation.defaults, C: 0 });
  } catch (error) {
    rejected = true;
  }
  check('engine rejects invalid mechanics before calculation', rejected);
  const reference = Ventilation.simulate(Ventilation.defaults).gasExchange;
  check(
    'CO2: reference alveolar ventilation uses tidal volume minus dead space',
    near(reference.alveolarVentilation, 3) && near(reference.steadyVT, 400),
  );
  check(
    'CO2: mL/min STPD to L/min BTPS conversion gives the analytical pressure',
    near(reference.PaCO2, (0.863 * 200) / 3) && near(reference.EtCO2, reference.PaCO2 - 5),
  );
  const co2 = (changes) =>
    Ventilation.simulate({ ...Ventilation.defaults, ...changes }).gasExchange;
  check(
    'CO2: doubling rate halves estimated PaCO2 at fixed VCV tidal volume',
    near(co2({ RR: 24 }).PaCO2, reference.PaCO2 / 2),
  );
  check(
    'CO2: doubling production doubles estimated PaCO2',
    near(co2({ VCO2: 400 }).PaCO2, reference.PaCO2 * 2),
  );
  check('CO2: increased dead space raises estimated CO2', co2({ VD: 250 }).EtCO2 > reference.EtCO2);
  check(
    'CO2: the assumed gradient affects EtCO2 without changing PaCO2',
    near(co2({ CO2Gradient: 10 }).PaCO2, reference.PaCO2) &&
      near(co2({ CO2Gradient: 10 }).EtCO2, reference.EtCO2 - 5),
  );
  check(
    'CO2: resistance alone does not invent V/Q effects in VCV',
    near(co2({ R: 30, Rexp: 30 }).EtCO2, reference.EtCO2),
  );
  check(
    'CO2: resistance reduces PCV steady ventilation and increases estimated CO2',
    co2({ mode: 'pcv', R: 30, Rexp: 30 }).EtCO2 > co2({ mode: 'pcv' }).EtCO2,
  );
  const trappedSettings = {
    ...Ventilation.defaults,
    mode: 'pcv',
    R: 30,
    Rexp: 40,
    C: 100,
    RR: 30,
    VD: 50,
  };
  const trapped = Ventilation.simulate({ ...trappedSettings, initial: 'steady' });
  check(
    'CO2: PCV uses periodic delivered volume including the effect of air trapping',
    near(trapped.gasExchange.steadyVT, trapped.metrics.VT) &&
      near(
        trapped.gasExchange.alveolarVentilation,
        ((trapped.metrics.VT - trappedSettings.VD) * trappedSettings.RR) / 1000,
      ),
  );
  check(
    'CO2: steady estimate is independent of startup and partial-run duration',
    near(co2({ ...trappedSettings, T: 5 }).EtCO2, trapped.gasExchange.EtCO2),
  );
  const noVent = co2({ VD: 400 });
  check(
    'CO2: tidal volume at or below dead space gives no finite CO2 estimate',
    noVent.alveolarVentilation === 0 &&
      noVent.EtCO2 === null &&
      noVent.PaCO2 === null &&
      co2({ VD: 500 }).status === 'no-ventilation',
  );
  check(
    'CO2: physically impossible pressures are unavailable rather than clamped',
    co2({ VD: 399 }).status === 'out-of-range' && co2({ VD: 399 }).EtCO2 === null,
  );
  const mismatch = co2({ RR: 40, VD: 0, CO2Gradient: 30 });
  check(
    'CO2: incompatible gradient leaves PaCO2 available without inventing zero EtCO2',
    mismatch.status === 'gradient' && mismatch.PaCO2 > 0 && mismatch.EtCO2 === null,
  );
  check(
    'CO2: invalid production, dead space and gradient are rejected',
    ['VCO2', 'VD', 'CO2Gradient'].every((field) =>
      Ventilation.validate({ ...Ventilation.defaults, [field]: -1 }).some((e) => e.field === field),
    ),
  );
  self.postMessage({ passed: true, checks });
} catch (error) {
  self.postMessage({ passed: false, checks, error: error.message });
}
