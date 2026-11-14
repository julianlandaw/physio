/* Copyright (c) 2026 Julian W. Landaw | SPDX-License-Identifier: MIT */
importScripts(
  '../docs/assets/js/ventilation_co2.js',
  '../docs/assets/js/ventilation_regions.js',
  '../docs/assets/js/ventilation_engine.js',
);
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
  for (const mode of ['vcv', 'pcv']) {
    const run = Ventilation.simulate({ ...Ventilation.defaults, mode, T: 5 }),
      q = run.timing,
      shape = run.capnogramTiming,
      et = run.metrics.EtCO2;
    const at = (local, side) => Ventilation.sample(run, local, side);
    check(
      `${mode}: capnogram remains within zero and estimated end-tidal CO2`,
      run.co2.length === run.t.length &&
        run.co2.every((v) => Number.isFinite(v) && v >= 0 && v < 713),
    );
    check(
      `${mode}: first inspiration starts with fresh airway gas`,
      run.co2[0] === 0 && Ventilation.sample(run, 0.5).co2 < 0.1,
    );
    check(
      `${mode}: capnogram phase I precedes the expiratory upstroke`,
      at(q.Ti + 0.02).co2 < 0.1 && at(4.5).co2 > 10,
    );
    const rise = at(q.Ti + (shape.delay + shape.riseEnd) / 2);
    check(
      `${mode}: transported CO2 retains a mass balance`,
      Math.abs(run.co2Balance.residual) < 1e-9 &&
        run.co2Balance.produced > 0 &&
        run.co2Balance.exhaled > 0,
    );
    check(`${mode}: end-expiratory capnogram equals displayed EtCO2`, near(at(5).co2, et));
    const multiple = Ventilation.simulate({ ...run.settings, T: 10 });
    check(
      `${mode}: breath boundary retains the end-tidal peak and inspiratory reset`,
      near(Ventilation.sample(multiple, 5, 'left').co2, et) &&
        near(Ventilation.sample(multiple, 5, 'right').co2, et) &&
        Ventilation.sample(multiple, 5.4).co2 < et / 10,
    );
    check(
      `${mode}: capnogram phase boundaries are included exactly in chart samples`,
      run.t.some((t) => near(t, q.Ti + shape.delay)) &&
        run.t.some((t) => near(t, q.Ti + shape.riseEnd)),
    );
    const obstructive = Ventilation.simulate({ ...run.settings, capnogramShape: 'obstructive' });
    const normalizedTime = q.Ti + q.Te / 2;
    check(
      `${mode}: obstructive shape has a longer upstroke and steeper phase III`,
      obstructive.capnogramTiming.riseEnd > shape.riseEnd &&
        obstructive.capnogramTiming.plateauLevel < shape.plateauLevel &&
        !near(Ventilation.sample(obstructive, normalizedTime).co2, at(normalizedTime).co2) &&
        near(obstructive.metrics.EtCO2, et),
    );
  }
  const noCO2 = Ventilation.simulate({ ...Ventilation.defaults, VD: 400 });
  check(
    'low ventilation retains CO2 with finite stores rather than fabricating missing data',
    noCO2.co2.every((v) => Number.isFinite(v) && v >= 0) &&
      Math.abs(noCO2.co2Balance.residual) < 1e-9,
  );
  const autoShape = Ventilation.simulate({ ...Ventilation.defaults, Rexp: 40 });
  const overrideShape = Ventilation.simulate({
    ...autoShape.settings,
    capnogramShape: 'reference',
  });
  check(
    'automatic shape responds to expiratory resistance and permits independent override',
    autoShape.capnogramTiming.severity === 1 && overrideShape.capnogramTiming.severity === 0,
  );
  check(
    'unsupported capnogram shapes are rejected',
    Ventilation.validate({ ...Ventilation.defaults, capnogramShape: 'unknown' }).some(
      (e) => e.field === 'capnogramShape',
    ),
  );
  const dynamic = Ventilation.simulate({ ...Ventilation.defaults, T: 120 });
  check(
    'dynamic CO2 changes over breaths rather than repeating one amplitude',
    Math.abs(dynamic.breaths[0].metrics.EtCO2 - dynamic.metrics.EtCO2) > 1,
  );
  const fastDynamic = Ventilation.simulate({ ...Ventilation.defaults, RR: 24, T: 120 });
  check(
    'increased VCV ventilation lowers CO2 after the same initial conditions',
    fastDynamic.metrics.EtCO2 < dynamic.metrics.EtCO2,
  );
  const highProduction = Ventilation.simulate({ ...Ventilation.defaults, VCO2: 400, T: 120 });
  check(
    'higher metabolic production increases stored and end-tidal CO2',
    highProduction.metrics.EtCO2 > dynamic.metrics.EtCO2 &&
      highProduction.co2Balance.produced > dynamic.co2Balance.produced,
  );
  const continued = Ventilation.simulate(
    { ...Ventilation.defaults, RR: 24, T: 20 },
    { co2State: dynamic.co2Balance.state },
  );
  check(
    'continuation starts at the captured CO2 sensor value without a jump',
    near(continued.co2[0], dynamic.co2.at(-1)) && Math.abs(continued.co2Balance.residual) < 1e-9,
  );
  const gradientOnly = Ventilation.simulate({ ...Ventilation.defaults, CO2Gradient: 12, T: 5 });
  check(
    'the assumed Pa-Et gradient changes only the arterial display estimate',
    near(gradientOnly.metrics.EstimatedPaCO2 - gradientOnly.metrics.EtCO2, 12) &&
      near(
        gradientOnly.metrics.EtCO2,
        Ventilation.simulate({ ...Ventilation.defaults, T: 5 }).metrics.EtCO2,
      ),
  );
  const noAirway = Ventilation.simulate({ ...Ventilation.defaults, VD: 0, T: 5 });
  check(
    'zero dead space is supported without a transport division by zero',
    noAirway.co2.every(Number.isFinite) && Math.abs(noAirway.co2Balance.residual) < 1e-9,
  );
  const extreme = Ventilation.simulate({
    ...Ventilation.defaults,
    VT: 1000,
    RR: 40,
    IF: 0.05,
    HF: 0.8,
    VD: 0.1,
    T: 5,
  });
  check(
    'very short high-flow inspiration and tiny dead space conserve CO2',
    Math.abs(extreme.co2Balance.residual) < 1e-9 && extreme.co2.every(Number.isFinite),
  );
  const refined = Ventilation.simulate({ ...Ventilation.defaults, T: 20 }, { co2Step: 0.002 });
  const normalStep = Ventilation.simulate({ ...Ventilation.defaults, T: 20 });
  check(
    'CO2 time-step refinement changes end-tidal pressure by less than 0.2 mmHg',
    Math.abs(refined.metrics.EtCO2 - normalStep.metrics.EtCO2) < 0.2,
  );
  const store = VentilationCO2.create(
    { ...Ventilation.defaults, VCO2: 0, VD: 0, FRC: 2, CO2Store: 10 },
    0,
    { lungFraction: 0.04, tissueFraction: 0.08 },
  );
  const mixed = store.advance(20, () => ({ v: 0 }));
  const meanFraction = (2 * 0.04 + 10 * 0.08) / 12;
  const expectedFraction =
    meanFraction + (0.04 - meanFraction) * Math.exp(-0.5 * (1 / 2 + 1 / 10) * 20);
  check(
    'isolated lung/tissue exchange matches the analytical mixing solution',
    Math.abs(mixed.alveolar / 713 - expectedFraction) < 1e-5 && Math.abs(mixed.residual) < 1e-10,
  );
  const checkpointRun = Ventilation.simulate({ ...Ventilation.defaults, T: 17.9 });
  const rapidEmptying = Ventilation.simulate({
    ...Ventilation.defaults,
    R: 1,
    Rexp: 1,
    C: 5,
    VD: 0,
    T: 5,
  });
  check(
    'a fast fully emptied compartment retains its sampled capnogram until inspiration',
    rapidEmptying.metrics.EtCO2 > 5 && Math.abs(rapidEmptying.co2Balance.residual) < 1e-9,
  );
  const checkpoint = checkpointRun.completeBreaths[0];
  check(
    'each complete breath captures its own CO2 continuation state',
    near(checkpoint.co2State.measured, checkpoint.metrics.EtCO2) &&
      Math.abs(checkpoint.co2State.measured - checkpointRun.co2Balance.measured) > 0.01,
  );
  const tank = VentilationCO2.create(
    { ...Ventilation.defaults, VCO2: 0, VD: 150, airwayMix: 1 },
    1,
    { lungFraction: 0.05, tissueFraction: 0.05 },
  );
  tank.advance(2, (t) => ({ v: (1 - 0.1 * t) * 1000, phase: 'expiration' }));
  const tankEnd = tank.read(),
    expectedMix = 0.05 * (1 - Math.exp(-0.2 / 0.15));
  check(
    'airway mixing matches the analytical stirred-tank solution',
    near(tankEnd.state.mixFraction, expectedMix, 1e-9),
  );
  check(
    'mixed airway accounts for both stored and exhaled CO2',
    near(tankEnd.exhaled, 0.2 * 0.05 - 0.15 * expectedMix, 1e-9) &&
      Math.abs(tankEnd.residual) < 1e-9,
  );
  const riseTime = (run) => {
    const b = run.completeBreaths[0],
      e = b.metrics.EtCO2;
    const points = run.t
      .map((t, i) => ({ t, p: run.co2[i] }))
      .filter((x) => x.t >= b.start + run.timing.Ti && x.t <= b.end);
    return points.find((x) => x.p >= 0.9 * e).t - points.find((x) => x.p >= 0.1 * e).t;
  };
  const unmixed = Ventilation.simulate({ ...Ventilation.defaults, T: 5, airwayMix: 0 });
  const airwayMixed = Ventilation.simulate({ ...Ventilation.defaults, T: 5, airwayMix: 0.4 });
  check(
    'airway mixing broadens the upstroke without changing total dead space',
    riseTime(airwayMixed) > riseTime(unmixed) + 0.1 &&
      near(
        airwayMixed.co2Balance.state.plugVolume + airwayMixed.co2Balance.state.mixingVolume,
        0.15,
      ),
  );
  for (const mode of ['vcv', 'pcv']) {
    const settings = { ...Ventilation.defaults, mode, regionRatio: 6, T: 20 },
      r = Ventilation.simulate(settings),
      q = r.timing,
      g = q.regions;
    check(
      `${mode}: regional R and C preserve the aggregate inputs`,
      near(1 / g.R[0] + 1 / g.R[1], 1 / settings.R) &&
        near(2 * g.Ci, settings.C / 1000) &&
        near(g.tauE[1] / g.tauE[0], 6),
    );
    for (const fraction of [0.1, 0.3, 0.8]) {
      const point = Ventilation.sample(r, q.cycle * fraction),
        resistance = point.phase === 'expiration' ? g.Re : g.R;
      check(
        `${mode}: regional flow and volume sum at ${fraction} of a breath`,
        near(point.regionVolumes[0] + point.regionVolumes[1], point.v) &&
          near(point.regionFlows[0] + point.regionFlows[1], point.f),
      );
      check(
        `${mode}: each region shares the airway pressure at ${fraction}`,
        point.regionFlows.every((f, i) =>
          near(
            settings.PEEP + point.regionVolumes[i] / 1000 / g.Ci + resistance[i] * f,
            point.p,
            1e-8,
          ),
        ),
      );
    }
    const periodic = Ventilation.simulate({ ...settings, initial: 'steady' });
    check(
      `${mode}: periodic initialization conserves volume separately in both regions`,
      periodic.breaths.every((b) => b.regionV0.every((v, i) => near(v, b.regionVend[i]))),
    );
    check(
      `${mode}: regional and mixed airway gas transfers conserve total CO2`,
      Math.abs(r.co2Balance.residual) < 1e-9 && Math.abs(periodic.co2Balance.residual) < 1e-9,
    );
    if (mode === 'vcv') {
      const hold = Ventilation.sample(r, q.Tflow + q.Th / 2);
      check(
        'VCV permits internal redistribution during a zero-total-flow hold',
        hold.f === 0 &&
          near(hold.regionFlows[0] + hold.regionFlows[1], 0) &&
          Math.abs(hold.regionFlows[0]) > 1e-4,
      );
      check(
        'VCV delivers the selected tidal volume despite uneven filling',
        r.breaths.every((b) => near(b.metrics.VT, settings.VT)),
      );
      const mean =
        r.t.slice(1).reduce((a, t, i) => a + ((t - r.t[i]) * (r.p[i] + r.p[i + 1])) / 2, 0) /
        settings.T;
      const exact =
        r.completeBreaths.reduce((a, b) => a + b.metrics.Mean, 0) / r.completeBreaths.length;
      check(
        'two-region VCV mean pressure agrees with direct integration',
        near(mean, exact, 0.002),
      );
      const before = Ventilation.sample(r, q.Tflow, 'left'),
        after = Ventilation.sample(r, q.Tflow, 'right');
      check(
        'instantaneous resistive drop remains distinct from later redistribution',
        near(before.p - after.p, r.breaths[0].metrics.ResistiveDrop),
      );
    } else {
      check(
        'PCV regional filling agrees with independent RC solutions',
        r.breaths[0].regionVe.every((v, i) =>
          near(v, settings.PC * g.Ci * (1 - Math.exp(-q.Ti / g.tauI[i]))),
        ),
      );
    }
  }
  const heterogeneous = Ventilation.simulate({ ...Ventilation.defaults, regionRatio: 6, T: 120 });
  const homogeneous = Ventilation.simulate({ ...Ventilation.defaults, regionRatio: 1, T: 120 });
  const lateRise = (r) => {
    const b = r.completeBreaths.at(-1),
      q = r.timing;
    return (
      Ventilation.sample(r, b.start + q.Ti + q.Te * 0.9).co2 -
      Ventilation.sample(r, b.start + q.Ti + q.Te * 0.5).co2
    );
  };
  check(
    'unequal emptying develops higher CO2 in the slow region',
    heterogeneous.co2Balance.alveolarRegions[1] > heterogeneous.co2Balance.alveolarRegions[0] + 1,
  );
  check(
    'regional CO2 differences create a rising plateau without shape overlays',
    lateRise(heterogeneous) > lateRise(homogeneous) + 0.1 &&
      heterogeneous.settings.capnogramShape === 'transport',
  );
  check(
    'the uniform reference has equal regional volumes and CO2 concentrations',
    homogeneous.breaths.every((b) => near(b.regionVend[0], b.regionVend[1])) &&
      near(homogeneous.co2Balance.alveolarRegions[0], homogeneous.co2Balance.alveolarRegions[1]),
  );
  const continuation = Ventilation.simulate(
    { ...Ventilation.defaults, regionRatio: 6, T: 5 },
    { co2State: heterogeneous.co2Balance.state },
  );
  const saved = heterogeneous.co2Balance.state;
  const expectedInitial =
    Ventilation.defaults.CO2Store * saved.tissueFraction +
    (Ventilation.defaults.FRC / 2) * (saved.lungFractions[0] + saved.lungFractions[1]) +
    saved.plugVolume * saved.plugFraction +
    saved.mixingVolume * saved.mixFraction;
  check(
    'continuation preserves distinct regional gas states and the mixed airway',
    continuation.co2[0] === heterogeneous.co2Balance.measured &&
      near(continuation.co2Balance.initialMass, expectedInitial, 1e-9) &&
      Math.abs(continuation.co2Balance.residual) < 1e-9,
  );
  const extremeRegions = Ventilation.simulate({
    ...Ventilation.defaults,
    regionRatio: 8,
    R: 1,
    Rexp: 1,
    C: 5,
    RR: 40,
    IF: 0.05,
    HF: 0.8,
    VT: 1000,
    VD: 0.1,
    T: 5,
  });
  check(
    'extreme regional time constants remain stable and conserve gas',
    extremeRegions.v.every((v) => Number.isFinite(v) && v >= 0) &&
      Math.abs(extremeRegions.co2Balance.residual) < 1e-9,
  );
  check(
    'invalid mixing and regional ratio values are rejected',
    Ventilation.validate({ ...Ventilation.defaults, airwayMix: 2, regionRatio: 0 }).length === 2,
  );
  self.postMessage({ passed: true, checks });
} catch (error) {
  self.postMessage({ passed: false, checks, error: error.message });
}
