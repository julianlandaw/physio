/* Copyright (c) 2026 Julian W. Landaw | SPDX-License-Identifier: MIT */
// Passive, linear single compartment. Volume is measured above the equilibrium
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
    capnogramShape: 'auto',
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
    if (!['auto', 'reference', 'obstructive'].includes(p.capnogramShape))
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
    };
  }
  function initialVolume(p, q) {
    if (p.initial === 'startup') return 0;
    const B = Math.exp(-q.Te / q.tauE);
    if (p.mode === 'vcv') return (B * p.VT) / 1000 / -Math.expm1(-q.Te / q.tauE);
    return (
      (B * -Math.expm1(-q.Ti / q.tauI) * p.PC * q.C) / -Math.expm1(-q.Ti / q.tauI - q.Te / q.tauE)
    );
  }
  function breath(p, q, index, V0) {
    const start = index * q.cycle,
      end = (index + 1) * q.cycle;
    const Ve =
      p.mode === 'vcv' ? V0 + p.VT / 1000 : V0 + (p.PC * q.C - V0) * -Math.expm1(-q.Ti / q.tauI);
    const Vend = Ve * Math.exp(-q.Te / q.tauE);
    const plateau = p.mode === 'vcv' && q.Th > 0 ? p.PEEP + Ve / q.C : null;
    const peak = p.mode === 'pcv' ? p.PEEP + p.PC : p.PEEP + Ve / q.C + p.R * q.flow;
    const mean =
      p.mode === 'pcv'
        ? p.PEEP + (p.PC * q.Ti) / q.cycle
        : p.PEEP +
          ((V0 / q.C) * q.Tflow +
            (q.flow * q.Tflow ** 2) / (2 * q.C) +
            p.R * q.flow * q.Tflow +
            (Ve / q.C) * q.Th) /
            q.cycle;
    return {
      index,
      start,
      end,
      V0,
      Ve,
      Vend,
      complete: end <= p.T + EPS,
      metrics: {
        VT: (Ve - V0) * 1000,
        Expired: (Ve - Vend) * 1000,
        Peak: peak,
        Plateau: plateau,
        Mean: mean,
        Intrinsic: Vend / q.C,
        StartIntrinsic: V0 / q.C,
        EndExpVolume: Vend * 1000,
        Retained: (Vend - V0) * 1000,
        MinuteVentilation: (Ve - Vend) * p.RR,
        Driving: plateau == null ? null : plateau - (p.PEEP + V0 / q.C),
        EndInspiratory: p.PEEP + Ve / q.C,
      },
    };
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
  function sampleBreath(p, q, b, time, side, gas, shape) {
    const local = Math.max(0, Math.min(q.cycle, time - b.start));
    const before = (boundary) =>
      local < boundary - EPS || (side === 'left' && local <= boundary + EPS);
    let volume, flow, pressure, phase;
    if (before(q.Ti)) {
      if (p.mode === 'pcv') {
        volume = b.V0 + (p.PC * q.C - b.V0) * -Math.expm1(-local / q.tauI);
        flow = (p.PC * q.C - volume) / q.tauI;
        pressure = p.PEEP + p.PC;
        phase = 'inspiration';
      } else if (before(q.Tflow)) {
        volume = b.V0 + q.flow * local;
        flow = q.flow;
        pressure = p.PEEP + volume / q.C + p.R * flow;
        phase = 'inspiration';
      } else {
        volume = b.Ve;
        flow = 0;
        pressure = p.PEEP + volume / q.C;
        phase = 'hold';
      }
    } else {
      volume = b.Ve * Math.exp(-(local - q.Ti) / q.tauE);
      flow = -volume / q.tauE;
      pressure = p.PEEP;
      phase = 'expiration';
    }
    return {
      t: time,
      v: volume * 1000,
      f: flow,
      p: pressure,
      palv: p.PEEP + volume / q.C,
      phase,
      breath: b.index + 1,
      ...capnogram(q, shape, gas, local, phase),
    };
  }
  function sample(run, rawTime, side) {
    const time = Math.max(0, Math.min(run.settings.T, rawTime));
    side ||= Math.abs(time - run.settings.T) < EPS ? 'left' : 'right';
    let index = Math.floor((time + EPS) / run.timing.cycle);
    if (side === 'left' && time > 0 && Math.abs(time - index * run.timing.cycle) < EPS) index--;
    index = Math.max(0, Math.min(run.breaths.length - 1, index));
    return sampleBreath(
      run.settings,
      run.timing,
      run.breaths[index],
      time,
      side,
      run.gasExchange,
      run.capnogramTiming,
    );
  }
  // A steady-state ventilation estimate, independent of startup/selected breath.
  // VCO2 is mL/min STPD; alveolar ventilation is L/min BTPS. No CO2 stores,
  // perfusion are simulated. The Pa–Et gradient is an assumption.
  function gasExchange(p, q) {
    const V0 = initialVolume({ ...p, initial: 'steady' }, q);
    const steadyVT =
      p.mode === 'vcv' ? p.VT : (p.PC * q.C - V0) * -Math.expm1(-q.Ti / q.tauI) * 1000;
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
  function simulate(settings) {
    const p = { ...defaults, ...settings };
    const errors = validate(p);
    if (errors.length) throw Error(errors.map((error) => error.message).join(' '));
    const q = timing(p),
      breaths = [];
    let V0 = initialVolume(p, q);
    for (let i = 0; i * q.cycle < p.T - EPS; i++) {
      const b = breath(p, q, i, V0);
      breaths.push(b);
      V0 = b.Vend;
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
      gasExchange: gasExchange(p, q),
      capnogramTiming: capnogramTiming(p, q),
    };
    const events = [0, p.T];
    for (const b of breaths) {
      events.push(b.start);
      if (p.mode === 'vcv' && q.Th > 0) events.push(b.start + q.Tflow);
      events.push(b.start + q.Ti, b.end);
      events.push(
        b.start + q.Ti + run.capnogramTiming.delay,
        b.start + q.Ti + run.capnogramTiming.riseEnd,
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
        const point = sample(run, Math.min(time, p.T), side);
        for (const key of ['t', 'p', 'v', 'f', 'palv', 'phase', 'co2']) run[key].push(point[key]);
      }
    }
    run.completeBreaths = breaths.filter((b) => b.complete);
    run.metrics = run.completeBreaths.at(-1)?.metrics || null;
    return run;
  }
  return { defaults, limits, validate, timing, sample, simulate };
})();
