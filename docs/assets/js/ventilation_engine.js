/* Copyright (c) 2026 Julian W. Landaw | SPDX-License-Identifier: MIT */
// Two passive parallel RC regions. Volume is measured above the equilibrium
// volume at set PEEP. Units: L, s, cm H2O internally; UI VT/C are mL-based.
const Ventilation = (() => {
  const EPS = 1e-9;
  const defaults = {
    mode: 'vcv',
    VT: 400,
    PC: 12,
    PEEP: 5,
    RR: 12,
    IF: 0.33,
    HF: 0.25,
    R: 10,
    Rexp: 10,
    C: 50,
    T: 60,
    initial: 'startup',
    VCO2: 200,
    VD: 150,
    CO2Gradient: 5,
    capnogramShape: 'transport',
    FRC: 2.5,
    CO2Store: 20,
    CO2Initial: 40,
    airwayMix: 0.2,
    regionRatio: 1,
  };
  const limits = {
    VT: [50, 1000],
    PC: [0.1, 40],
    PEEP: [0, 25],
    RR: [0.1, 40],
    IF: [0.05, 0.8],
    HF: [0, 0.8],
    R: [1, 50],
    Rexp: [1, 50],
    C: [5, 150],
    T: [5, 120],
    VCO2: [50, 500],
    VD: [0, 500],
    CO2Gradient: [0, 30],
    FRC: [1, 6],
    CO2Store: [5, 60],
    CO2Initial: [5, 100],
    airwayMix: [0, 1],
    regionRatio: [1, 8],
  };
  function validate(p) {
    const errors = [];
    if (!['vcv', 'pcv'].includes(p.mode))
      errors.push({ field: 'mode', message: 'Choose a supported ventilation mode.' });
    for (const [field, [min, max]] of Object.entries(limits)) {
      if (
        ((field === 'VT' || field === 'HF') && p.mode === 'pcv') ||
        (field === 'PC' && p.mode === 'vcv')
      )
        continue;
      if (
        typeof p[field] !== 'number' ||
        !Number.isFinite(p[field]) ||
        p[field] < min ||
        p[field] > max
      )
        errors.push({ field, message: `${field}: enter a number from ${min} to ${max}.` });
    }
    if (!['startup', 'steady'].includes(p.initial))
      errors.push({ field: 'initial', message: 'Choose an initial lung state.' });
    if (!['transport', 'auto', 'reference', 'obstructive'].includes(p.capnogramShape))
      errors.push({ field: 'capnogramShape', message: 'Choose a supported capnogram shape.' });
    return errors;
  }
  function timing(p) {
    const cycle = 60 / p.RR,
      Ti = cycle * p.IF,
      Te = cycle - Ti;
    const Th = p.mode === 'vcv' ? Ti * p.HF : 0;
    const Tflow = Ti - Th,
      C = p.C / 1000;
    return {
      cycle,
      Ti,
      Te,
      Th,
      Tflow,
      C,
      tauI: p.R * C,
      tauE: p.Rexp * C,
      flow: p.mode === 'vcv' ? p.VT / 1000 / Tflow : null,
      regions: VentilationRegions.configure(p),
    };
  }
  function breath(p, q, index, volumes) {
    return VentilationRegions.breath(p, q, index, volumes);
  }
  // Illustrative time capnogram, not a heterogeneous gas-exchange model.
  // Shape fractions are teaching choices, not fitted disease parameters.
  function capnogramTiming(p, q) {
    const severity =
      p.capnogramShape === 'reference'
        ? 0
        : p.capnogramShape === 'obstructive'
          ? 1
          : Math.max(0, Math.min(1, (p.Rexp - 10) / 30));
    return {
      delay: q.Te * 0.04,
      riseEnd: q.Te * (0.12 + 0.26 * severity),
      plateauLevel: 0.95 - 0.35 * severity,
      severity,
    };
  }
  function capnogram(q, shape, gas, local, phase) {
    if (gas.EtCO2 == null) return { co2: null, co2Phase: 'unavailable' };
    if (phase !== 'expiration') return { co2: 0, co2Phase: 'inspiratory baseline' };
    const expiredTime = Math.max(0, local - q.Ti);
    if (expiredTime <= shape.delay) return { co2: 0, co2Phase: 'phase I' };
    if (expiredTime < shape.riseEnd)
      return {
        co2:
          (gas.EtCO2 * shape.plateauLevel * (expiredTime - shape.delay)) /
          (shape.riseEnd - shape.delay),
        co2Phase: 'phase II',
      };
    const progress = Math.min(1, (expiredTime - shape.riseEnd) / (q.Te - shape.riseEnd));
    return {
      co2: gas.EtCO2 * (shape.plateauLevel + (1 - shape.plateauLevel) * progress),
      co2Phase: 'phase III',
    };
  }
  function sampleBreath(p, q, b, time, side) {
    return VentilationRegions.sample(p, q, b, time, side);
  }
  function mechanicalSample(run, rawTime, side) {
    const time = Math.max(0, Math.min(run.settings.T, rawTime));
    side ||= Math.abs(time - run.settings.T) < EPS ? 'left' : 'right';
    let index = Math.floor((time + EPS) / run.timing.cycle);
    if (side === 'left' && time > 0 && Math.abs(time - index * run.timing.cycle) < EPS) index--;
    index = Math.max(0, Math.min(run.breaths.length - 1, index));
    return sampleBreath(run.settings, run.timing, run.breaths[index], time, side);
  }
  function sample(run, time, side) {
    const point = mechanicalSample(run, time, side);
    if (!run.co2.length) return point;
    let lo = 0,
      hi = run.t.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (run.t[mid] <= point.t) lo = mid;
      else hi = mid - 1;
    }
    if (side === 'left' || (side == null && Math.abs(point.t - run.settings.T) < EPS))
      while (lo > 0 && Math.abs(run.t[lo] - run.t[lo - 1]) < EPS) lo--;
    const next = Math.min(lo + 1, run.t.length - 1),
      span = run.t[next] - run.t[lo];
    const interpolate = (values) =>
      values[lo] == null || values[next] == null
        ? null
        : values[lo] + (values[next] - values[lo]) * (span > 0 ? (point.t - run.t[lo]) / span : 0);
    point.co2 = interpolate(run.co2);
    point.alveolarCO2 = interpolate(run.alveolarCO2);
    point.alveolarCO2Regions = [interpolate(run.co2Fast), interpolate(run.co2Slow)];
    point.co2Phase =
      point.phase !== 'expiration'
        ? 'inspiratory washout / baseline'
        : point.co2 == null
          ? 'unavailable'
          : point.co2 < 2
            ? 'phase I'
            : point.co2 < 0.85 * point.alveolarCO2
              ? 'phase II'
              : 'phase III';
    return point;
  }
  // A steady-state ventilation estimate, independent of startup/selected breath.
  // VCO2 is mL/min STPD; alveolar ventilation is L/min BTPS. No CO2 stores,
  // perfusion are simulated. The Pa–Et gradient is an assumption.
  function gasExchange(p, q) {
    const steady = VentilationRegions.initial({ ...p, initial: 'steady' }, q);
    const steadyVT = breath(p, q, 0, steady).metrics.VT;
    const alveolarVentilation = (Math.max(0, steadyVT - p.VD) * p.RR) / 1000;
    const result = {
      steadyVT,
      alveolarVentilation,
      PaCO2: null,
      EtCO2: null,
      status: 'no-ventilation',
    };
    if (!(alveolarVentilation > 0)) return result;
    const pressure = (0.863 * p.VCO2) / alveolarVentilation;
    // At sea level, dry-gas pressure in humidified alveolar gas is 713 mmHg.
    // Reject a physically impossible steady-state solution rather than cap it.
    if (pressure >= 713) return { ...result, status: 'out-of-range' };
    result.PaCO2 = pressure;
    if (pressure <= p.CO2Gradient) return { ...result, status: 'gradient' };
    return { ...result, EtCO2: pressure - p.CO2Gradient, status: 'ok' };
  }
  function simulate(settings, options = {}) {
    const p = { ...defaults, ...settings };
    const errors = validate(p);
    if (errors.length) throw Error(errors.map((error) => error.message).join(' '));
    const q = timing(p),
      breaths = [];
    let V0 = VentilationRegions.initial(p, q);
    for (let i = 0; i * q.cycle < p.T - EPS; i++) {
      const b = breath(p, q, i, V0);
      breaths.push(b);
      V0 = b.regionVend;
    }
    const run = {
      settings: p,
      timing: q,
      breaths,
      t: [],
      p: [],
      v: [],
      f: [],
      palv: [],
      phase: [],
      co2: [],
      alveolarCO2: [],
      co2Fast: [],
      co2Slow: [],
      gasExchange: gasExchange(p, q),
      capnogramTiming: capnogramTiming(p, q),
    };
    const events = [0, p.T];
    for (const b of breaths) {
      events.push(b.start);
      if (p.mode === 'vcv' && q.Th > 0) events.push(b.start + q.Tflow);
      events.push(b.start + q.Ti, b.end);
      events.push(
        b.start + q.Ti + q.Te * 0.04,
        b.start + q.Ti + q.Te * 0.12,
        b.start + q.Ti + q.Te * 0.38,
        b.start + q.Ti + capnogramTiming({ ...p, capnogramShape: 'auto' }, q).riseEnd,
      );
    }
    const boundaries = events
      .filter((t) => t >= 0 && t <= p.T + EPS)
      .sort((a, b) => a - b)
      .filter((t, i, a) => !i || t - a[i - 1] > EPS);
    const dt = Math.min(0.01, q.cycle / 250);
    const times = [...boundaries];
    for (let i = 1; i * dt < p.T - EPS; i++) times.push(i * dt);
    times.sort((a, b) => a - b);
    const unique = times.filter((t, i) => !i || t - times[i - 1] > EPS);
    let nextBoundary = 0;
    const co2Model = VentilationCO2.create(
      p,
      breaths[0].regionV0,
      options.co2State,
      options.co2Step,
    );
    for (const time of unique) {
      while (nextBoundary < boundaries.length && boundaries[nextBoundary] < time - EPS)
        nextBoundary++;
      const isBoundary =
        nextBoundary < boundaries.length && Math.abs(boundaries[nextBoundary] - time) < EPS;
      const sides =
        time > EPS && time < p.T - EPS && isBoundary
          ? ['left', 'right']
          : [time >= p.T - EPS ? 'left' : 'right'];
      for (const side of sides) {
        const point = mechanicalSample(run, Math.min(time, p.T), side);
        const gas = co2Model.advance(point.t, (t) => mechanicalSample(run, t, 'left'));
        const currentBreath = breaths[point.breath - 1];
        if (Math.abs(point.t - currentBreath.end) < EPS && !currentBreath.co2State)
          currentBreath.co2State = co2Model.read().state;
        point.co2 = gas.measured;
        point.alveolarCO2 = gas.alveolar;
        point.co2Fast = gas.alveolarRegions[0];
        point.co2Slow = gas.alveolarRegions[1];
        for (const key of [
          't',
          'p',
          'v',
          'f',
          'palv',
          'phase',
          'co2',
          'alveolarCO2',
          'co2Fast',
          'co2Slow',
        ])
          run[key].push(point[key]);
      }
    }
    run.co2Balance = co2Model.read();
    for (const b of breaths) {
      b.metrics.EtCO2 = b.complete ? sample(run, b.end, 'left').co2 : null;
      b.metrics.EstimatedPaCO2 = b.metrics.EtCO2 == null ? null : b.metrics.EtCO2 + p.CO2Gradient;
    }
    // Optional legacy illustrative shapes use the evolving breath amplitude.
    // The transport trace remains the default and is the mass-audited output.
    if (p.capnogramShape !== 'transport')
      run.co2 = run.t.map((time, i) => {
        const point = mechanicalSample(run, time, i && run.t[i - 1] === time ? 'right' : 'left');
        const b = breaths[point.breath - 1];
        return capnogram(
          q,
          run.capnogramTiming,
          { EtCO2: b.metrics.EtCO2 ?? run.co2[i] },
          time - b.start,
          point.phase,
        ).co2;
      });
    run.completeBreaths = breaths.filter((b) => b.complete);
    run.metrics = run.completeBreaths.at(-1)?.metrics || null;
    return run;
  }
  return { defaults, limits, validate, timing, sample, simulate };
})();
