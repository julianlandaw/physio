/* Copyright (c) 2026 Julian W. Landaw | SPDX-License-Identifier: MIT */
// Two parallel passive RC regions share the airway pressure. Equal compliance
// and resting-volume shares; regional resistance ratio k preserves aggregate
// parallel resistance R and total compliance C. k=1 is the uniform reference.
const VentilationRegions = (() => {
  const EPS = 1e-9,
    sum = (v) => v[0] + v[1];
  function configure(p) {
    const k = p.regionRatio ?? 1,
      C = p.C / 1000,
      Ci = C / 2;
    const R = [p.R * (1 + 1 / k), p.R * (k + 1)],
      Re = [p.Rexp * (1 + 1 / k), p.Rexp * (k + 1)];
    const g = R.map((x) => 1 / x),
      G = sum(g),
      K = g[0] / G - 0.5,
      lambda = (((g[0] * g[1]) / G) * 2) / Ci;
    return {
      C,
      Ci,
      R,
      Re,
      g,
      G,
      K,
      lambda,
      tauI: R.map((x) => x * Ci),
      tauE: Re.map((x) => x * Ci),
    };
  }
  function drive(v, Q, t, r) {
    const total = sum(v) + Q * t,
      d0 = (v[0] - v[1]) / r.Ci,
      eq = (2 * r.K * Q) / r.Ci / r.lambda;
    const d = d0 + (eq - d0) * -Math.expm1(-r.lambda * t);
    const fast = total / 2 + (r.C * d) / 4;
    return [fast, total - fast];
  }
  function inspiration(p, q, v) {
    const r = q.regions;
    if (p.mode === 'pcv')
      return v.map((x, i) => x + (p.PC * r.Ci - x) * -Math.expm1(-q.Ti / r.tauI[i]));
    return drive(drive(v, q.flow, q.Tflow, r), 0, q.Th, r);
  }
  function expiration(v, t, r) {
    return v.map((x, i) => x * Math.exp(-t / r.tauE[i]));
  }
  function initial(p, q) {
    if (p.initial === 'startup') return [0, 0];
    const cycle = (v) => expiration(inspiration(p, q, v), q.Te, q.regions);
    const b = cycle([0, 0]),
      a = cycle([1, 0]).map((x, i) => x - b[i]),
      c = cycle([0, 1]).map((x, i) => x - b[i]);
    const A = 1 - a[0],
      B = -c[0],
      C = -a[1],
      D = 1 - c[1],
      det = A * D - B * C;
    return [(D * b[0] - B * b[1]) / det, (A * b[1] - C * b[0]) / det];
  }
  function abovePEEP(v, Q, r) {
    return (Q + (r.g[0] * v[0]) / r.Ci + (r.g[1] * v[1]) / r.Ci) / r.G;
  }
  function pressureIntegral(v, Q, t, r) {
    const d0 = (v[0] - v[1]) / r.Ci,
      eq = (2 * r.K * Q) / r.Ci / r.lambda;
    return (
      (Q / r.G) * t +
      (sum(v) / r.C) * t +
      (Q * t * t) / (2 * r.C) +
      r.K * (eq * t + ((d0 - eq) * -Math.expm1(-r.lambda * t)) / r.lambda)
    );
  }
  function breath(p, q, index, v0) {
    const r = q.regions,
      start = index * q.cycle,
      end = (index + 1) * q.cycle;
    const flowEnd = p.mode === 'vcv' ? drive(v0, q.flow, q.Tflow, r) : null;
    const ve = inspiration(p, q, v0),
      vend = expiration(ve, q.Te, r);
    const plateau = p.mode === 'vcv' && q.Th > 0 ? p.PEEP + abovePEEP(ve, 0, r) : null;
    const peak =
      p.mode === 'pcv'
        ? p.PEEP + p.PC
        : p.PEEP +
          Math.max(abovePEEP(v0, q.flow, r), abovePEEP(flowEnd, q.flow, r), abovePEEP(ve, 0, r));
    const mean =
      p.PEEP +
      (p.mode === 'pcv'
        ? p.PC * q.Ti
        : pressureIntegral(v0, q.flow, q.Tflow, r) + pressureIntegral(flowEnd, 0, q.Th, r)) /
        q.cycle;
    const V0 = sum(v0),
      Ve = sum(ve),
      Vend = sum(vend);
    return {
      index,
      start,
      end,
      V0,
      Ve,
      Vend,
      regionV0: v0.slice(),
      regionVe: ve,
      regionVend: vend,
      complete: end <= p.T + EPS,
      metrics: {
        VT: (Ve - V0) * 1000,
        Expired: (Ve - Vend) * 1000,
        Peak: peak,
        Plateau: plateau,
        Mean: mean,
        Intrinsic: Vend / r.C,
        StartIntrinsic: V0 / r.C,
        EndExpVolume: Vend * 1000,
        Retained: (Vend - V0) * 1000,
        MinuteVentilation: (Ve - Vend) * p.RR,
        Driving: plateau == null ? null : (Ve - V0) / r.C,
        EndInspiratory: p.PEEP + Ve / r.C,
        EquilibratedPlateau: plateau == null ? null : p.PEEP + Ve / r.C,
        ResistiveDrop: p.mode === 'vcv' ? p.R * q.flow : null,
        IntrinsicFast: vend[0] / r.Ci,
        IntrinsicSlow: vend[1] / r.Ci,
      },
    };
  }
  function sample(p, q, b, time, side) {
    const r = q.regions,
      t = Math.max(0, Math.min(q.cycle, time - b.start));
    const before = (z) => t < z - EPS || (side === 'left' && t <= z + EPS);
    let v, f, pressure, phase;
    if (before(q.Ti)) {
      if (p.mode === 'pcv') {
        v = b.regionV0.map((x, i) => x + (p.PC * r.Ci - x) * -Math.expm1(-t / r.tauI[i]));
        f = v.map((x, i) => (p.PC - x / r.Ci) / r.R[i]);
        pressure = p.PEEP + p.PC;
        phase = 'inspiration';
      } else {
        const flowing = before(q.Tflow),
          Q = flowing ? q.flow : 0;
        v = flowing
          ? drive(b.regionV0, Q, t, r)
          : drive(drive(b.regionV0, q.flow, q.Tflow, r), 0, t - q.Tflow, r);
        const above = abovePEEP(v, Q, r);
        f = v.map((x, i) => (above - x / r.Ci) / r.R[i]);
        pressure = p.PEEP + above;
        phase = flowing ? 'inspiration' : 'hold';
      }
    } else {
      v = expiration(b.regionVe, t - q.Ti, r);
      f = v.map((x, i) => -x / r.tauE[i]);
      pressure = p.PEEP;
      phase = 'expiration';
    }
    return {
      t: time,
      v: sum(v) * 1000,
      f: p.mode === 'vcv' && phase !== 'expiration' ? (phase === 'hold' ? 0 : q.flow) : sum(f),
      p: pressure,
      palv: p.PEEP + sum(v) / r.C,
      phase,
      breath: b.index + 1,
      regionVolumes: v.map((x) => x * 1000),
      regionFlows: f,
      regionPressures: v.map((x) => p.PEEP + x / r.Ci),
    };
  }
  return { configure, initial, breath, sample };
})();
