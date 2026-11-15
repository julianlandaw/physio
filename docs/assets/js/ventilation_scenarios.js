/* Copyright (c) 2026 Julian W. Landaw | SPDX-License-Identifier: MIT */
// Acute teaching events. Mechanics preserve regional volumes through every
// phase/event boundary; CO2 stores and metabolism persist through perfusion loss.
const VentilationScenarios = (() => {
  const names = {
    none: 'No event',
    bronchospasm: 'Bronchospasm',
    'tube-kink': 'Kinked endotracheal tube',
    'mucus-plug': 'Mucus plug',
    'air-embolism': 'Venous air embolism',
  };
  const warmCache = new Map(),
    EPS = 1e-9;
  function active(p, t, side = 'right') {
    const reached = (x) => t > x + EPS || (Math.abs(t - x) <= EPS && side !== 'left');
    return (
      p.eventType !== 'none' &&
      reached(p.eventOnset) &&
      (!p.eventRecovery || !reached(p.eventRecovery))
    );
  }
  function effect(p, t, side) {
    const on = active(p, t, side),
      s = on ? p.eventSeverity : 0;
    const r = VentilationRegions.configure(p);
    const result = {
      R: r.R.slice(),
      Re: r.Re.slice(),
      common: 0,
      closed: [false, false],
      commonClosed: false,
      perfusion: 1,
      active: on,
    };
    if (p.eventType === 'bronchospasm') {
      result.R = result.R.map((v, i) => v * (1 + [18, 80][i] * s * s));
      result.Re = result.Re.map((v, i) => v * (1 + [35, 160][i] * s * s));
    } else if (
      p.eventType === 'tube-kink' ||
      (p.eventType === 'mucus-plug' && p.eventLocation === 'common')
    ) {
      result.common = p.R * Math.expm1(Math.log(1001) * s);
      result.commonClosed = on && s === 1;
    } else if (p.eventType === 'mucus-plug') {
      result.R[1] *= 1 + 999 * s ** 4;
      result.Re[1] *= 1 + 999 * s ** 4;
      result.closed[1] = on && s === 1;
    } else if (p.eventType === 'air-embolism') result.perfusion = (1 - s) ** 2;
    return result;
  }
  function phaseAt(q, time, side = 'right') {
    let i = Math.floor((time + EPS) / q.cycle);
    if (side === 'left' && time > 0 && Math.abs(time - i * q.cycle) < EPS) i--;
    i = Math.max(0, i);
    const local = Math.max(0, time - i * q.cycle);
    const before = (x) => local < x - EPS || (side === 'left' && local <= x + EPS);
    return {
      index: i,
      phase: before(q.Ti) ? (q.Th > 0 && !before(q.Tflow) ? 'hold' : 'inspiration') : 'expiration',
    };
  }
  function matrix(p, q, e, phase, kind) {
    const resistance = phase === 'expiration' ? e.Re : e.R;
    const g = resistance.map((r, i) => (e.closed[i] ? 0 : 1 / r)),
      G = g[0] + g[1],
      Ci = q.C / 2;
    const Q = phase === 'hold' || e.commonClosed ? 0 : q.flow;
    let A = [
        [0, 0],
        [0, 0],
      ],
      b = [0, 0];
    const flow = kind === 'flow' || phase === 'hold' || e.commonClosed;
    const P = phase === 'expiration' ? 0 : kind === 'cap' ? p.pressureLimit - p.PEEP : p.PC;
    if (G > 0) {
      for (let i = 0; i < 2; i++)
        for (let j = 0; j < 2; j++)
          A[i][j] =
            (g[i] * (flow ? g[j] / G : (e.common * g[j]) / (1 + e.common * G))) / Ci -
            (i === j ? g[i] / Ci : 0);
      b = g.map((x) => (flow ? (x * Q) / G : (x * P) / (1 + e.common * G)));
    }
    return { A, b, g, G, Ci, Q, P, flow, e, phase, kind };
  }
  function phi(l, t) {
    return Math.abs(l * t) < 1e-7
      ? t * (1 + (l * t) / 2 + (l * t) ** 2 / 6)
      : Math.expm1(l * t) / l;
  }
  function propagate(v, c, t) {
    if (t <= 0) return v.slice();
    const [[a, b], [d, e]] = c.A,
      tr = (a + e) / 2,
      disc = Math.sqrt((a - e) ** 2 + 4 * b * d) / 2;
    let l1 = tr + disc,
      l2 = tr - disc;
    if (Math.abs(l1) < 1e-12) l1 = 0;
    if (Math.abs(l2) < 1e-12) l2 = 0;
    const gap = l1 - l2,
      E = Math.exp(l2 * t),
      F = phi(l2, t);
    const derivative =
      Math.abs(l2 * t) < 1e-4
        ? t * t * (0.5 + (l2 * t) / 3 + (l2 * t) ** 2 / 8)
        : (Math.exp(l2 * t) * (l2 * t - 1) + 1) / (l2 * l2);
    const B = gap > 1e-10 ? (Math.exp(l2 * t) * Math.expm1(gap * t)) / gap : E * t;
    // Avoid overflow in exp(l2*t)*expm1(gap*t) for a zero eigenvalue.
    const EB = Number.isFinite(B) ? B : (Math.exp(l1 * t) - E) / gap;
    const H = gap > 1e-10 ? (phi(l1, t) - F) / gap : derivative;
    return v.map(
      (x, i) =>
        E * x +
        EB * ((c.A[i][0] - (i === 0 ? l2 : 0)) * v[0] + (c.A[i][1] - (i === 1 ? l2 : 0)) * v[1]) +
        F * c.b[i] +
        H * ((c.A[i][0] - (i === 0 ? l2 : 0)) * c.b[0] + (c.A[i][1] - (i === 1 ? l2 : 0)) * c.b[1]),
    );
  }
  function observe(p, q, c, v, t, index) {
    const elastic = v.map((x) => x / c.Ci);
    const weighted = c.g[0] * elastic[0] + c.g[1] * elastic[1];
    const junction = c.G
      ? c.flow
        ? (c.Q + weighted) / c.G
        : (c.P + c.e.common * weighted) / (1 + c.e.common * c.G)
      : 0;
    const flows = c.g.map((g, i) => g * (junction - elastic[i]));
    const flow = c.flow ? c.Q : flows[0] + flows[1];
    const airway = c.e.commonClosed
      ? c.phase === 'expiration'
        ? 0
        : p.mode === 'vcv'
          ? (p.pressureLimit || p.PEEP + p.PC) - p.PEEP
          : p.PC
      : c.flow
        ? junction + c.e.common * flow
        : c.P;
    return {
      t,
      v: (v[0] + v[1]) * 1000,
      f: flow,
      p: p.PEEP + airway,
      palv: p.PEEP + (v[0] + v[1]) / q.C,
      phase: c.phase,
      breath: index + 1,
      regionVolumes: v.map((x) => x * 1000),
      regionFlows: flows,
      regionPressures: elastic.map((x) => p.PEEP + x),
      perfusionScale: c.e.perfusion,
      circuitFlush: c.e.commonClosed,
      pressureLimited: c.kind === 'cap',
      eventActive: c.e.active,
    };
  }
  function sample(run, rawTime, side) {
    const t = Math.max(0, Math.min(run.settings.T, rawTime));
    side ||= Math.abs(t - run.settings.T) < EPS ? 'left' : 'right';
    const segments = run.segments;
    let lo = 0,
      hi = segments.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (segments[mid].start < t - EPS || (side === 'right' && segments[mid].start <= t + EPS))
        lo = mid;
      else hi = mid - 1;
    }
    const s = segments[lo];
    return observe(
      run.settings,
      run.timing,
      s.control,
      propagate(s.v0, s.control, Math.max(0, t - s.start)),
      t,
      s.index,
    );
  }
  function build(p, options = {}) {
    const q = Ventilation.timing(p),
      segments = [],
      boundaries = [0, p.T];
    for (let i = 0; i * q.cycle < p.T - EPS; i++)
      for (const d of [0, q.Tflow, q.Ti, q.cycle]) {
        const t = i * q.cycle + d;
        if (t >= 0 && t <= p.T) boundaries.push(t);
      }
    if (p.eventType !== 'none')
      for (const t of [p.eventOnset, p.eventRecovery]) if (t > 0 && t < p.T) boundaries.push(t);
    const dt = Math.min(options.step ?? 0.01, q.cycle / 250);
    for (let i = 1; i * dt < p.T - EPS; i++) boundaries.push(i * dt);
    boundaries.sort((a, b) => a - b);
    const times = boundaries.filter((t, i) => !i || t - boundaries[i - 1] > EPS);
    let volumes = options.volumes?.slice() ?? VentilationRegions.initial(p, q);
    const initialVolumes = volumes.slice();
    function append(start, end, v0, control, index) {
      const v1 = propagate(v0, control, end - start);
      segments.push({ start, end, v0: v0.slice(), v1, control, index });
      return v1;
    }
    for (let i = 1; i < times.length; i++) {
      const start = times[i - 1],
        end = times[i],
        ph = phaseAt(q, (start + end) / 2),
        e = effect(p, (start + end) / 2);
      const isVC = p.mode === 'vcv' && ph.phase === 'inspiration';
      const requested = matrix(
        p,
        q,
        e,
        ph.phase,
        isVC ? (e.commonClosed && p.pressureLimit ? 'cap' : 'flow') : 'pressure',
      );
      if (!isVC || !p.pressureLimit || e.commonClosed) {
        volumes = append(start, end, volumes, requested, ph.index);
        continue;
      }
      const needed = (v) => observe(p, q, requested, v, start, ph.index).p;
      const limited = needed(volumes) > p.pressureLimit + 1e-10;
      const control = limited ? matrix(p, q, e, ph.phase, 'cap') : requested;
      const last = propagate(volumes, control, end - start);
      const crossing = limited
        ? needed(last) < p.pressureLimit - 1e-10
        : needed(last) > p.pressureLimit + 1e-10;
      if (!crossing) {
        volumes = append(start, end, volumes, control, ph.index);
        continue;
      }
      let lo = 0,
        hi = end - start;
      for (let n = 0; n < 36; n++) {
        const mid = (lo + hi) / 2,
          over = needed(propagate(volumes, control, mid)) > p.pressureLimit;
        if (over === limited) lo = mid;
        else hi = mid;
      }
      const at = start + (lo + hi) / 2;
      volumes = append(start, at, volumes, control, ph.index);
      volumes = append(
        at,
        end,
        volumes,
        limited ? requested : matrix(p, q, e, ph.phase, 'cap'),
        ph.index,
      );
    }
    const run = {
      settings: p,
      timing: q,
      scenario: true,
      segments,
      initialVolumes,
      breaths: [],
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
      events: [],
    };
    if (p.eventType !== 'none') {
      run.events.push({ time: p.eventOnset, label: names[p.eventType], kind: 'onset' });
      if (p.eventRecovery)
        run.events.push({ time: p.eventRecovery, label: 'Event resolved', kind: 'recovery' });
    }
    const gas = VentilationCO2.create(p, initialVolumes, options.co2State, options.co2Step);
    const nodeTimes = [0, ...segments.map((s) => s.end)].filter(
      (t, i, a) => !i || t - a[i - 1] > EPS,
    );
    for (const t of nodeTimes) {
      const state = gas.advance(t, (time) => sample(run, time, 'left'));
      for (const side of t > EPS && t < p.T - EPS ? ['left', 'right'] : ['right']) {
        const point = sample(run, t, side);
        point.co2 = state.measured;
        point.alveolarCO2 = state.alveolar;
        point.co2Fast = state.alveolarRegions[0];
        point.co2Slow = state.alveolarRegions[1];
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
      if (t > 0 && Math.abs(t / q.cycle - Math.round(t / q.cycle)) < 1e-8) {
        const index = Math.round(t / q.cycle) - 1;
        run.breaths[index] = { co2State: gas.read().state };
      }
    }
    run.co2Balance = gas.read();
    const count = Math.ceil((p.T - EPS) / q.cycle);
    for (let index = 0; index < count; index++) {
      const start = index * q.cycle,
        end = (index + 1) * q.cycle,
        complete = end <= p.T + EPS;
      const a = sample(run, start, 'right'),
        ei = sample(run, Math.min(p.T, start + q.Ti), 'left'),
        z = sample(run, Math.min(end, p.T), 'left');
      const parts = segments.filter((s) => s.index === index);
      let integral = 0,
        peak = p.PEEP;
      for (const s of parts) {
        const x = observe(p, q, s.control, s.v0, s.start, index),
          y = observe(p, q, s.control, s.v1, s.end, index),
          m = observe(
            p,
            q,
            s.control,
            propagate(s.v0, s.control, (s.end - s.start) / 2),
            (s.start + s.end) / 2,
            index,
          );
        integral += ((s.end - s.start) * (x.p + 4 * m.p + y.p)) / 6;
        peak = Math.max(peak, x.p, y.p, m.p);
      }
      const V0 = a.v / 1000,
        Ve = ei.v / 1000,
        Vend = z.v / 1000;
      const before = sample(run, Math.min(p.T, start + q.Tflow), 'left'),
        after = sample(run, Math.min(p.T, start + q.Tflow), 'right');
      const limited = parts.some((s) => s.control.kind === 'cap');
      const m = {
        VT: ei.v - a.v,
        Expired: ei.v - z.v,
        Peak: peak,
        Plateau: p.mode === 'vcv' && q.Th > 0 ? ei.p : null,
        Mean: complete ? integral / q.cycle : null,
        Intrinsic: Vend / q.C,
        StartIntrinsic: V0 / q.C,
        EndExpVolume: z.v,
        Retained: z.v - a.v,
        MinuteVentilation: (Ve - Vend) * p.RR,
        Driving: p.mode === 'vcv' && q.Th > 0 ? (Ve - V0) / q.C : null,
        EndInspiratory: ei.palv,
        EquilibratedPlateau: p.mode === 'vcv' && q.Th > 0 ? ei.palv : null,
        ResistiveDrop: p.mode === 'vcv' ? before.p - after.p : null,
        IntrinsicFast: z.regionVolumes[0] / 1000 / q.regions.Ci,
        IntrinsicSlow: z.regionVolumes[1] / 1000 / q.regions.Ci,
        PressureLimited: limited,
        EtCO2: null,
        EstimatedPaCO2: null,
      };
      if (complete) {
        let pos = run.t.length - 1;
        while (pos > 0 && run.t[pos] > end + EPS) pos--;
        m.EtCO2 = run.co2[pos];
        m.EstimatedPaCO2 =
          m.EtCO2 == null || p.eventType !== 'none' ? null : m.EtCO2 + p.CO2Gradient;
        m.TissueCO2 = run.breaths[index]?.co2State?.tissueFraction * 713;
      }
      run.breaths[index] = {
        ...run.breaths[index],
        index,
        start,
        end,
        complete,
        V0,
        Ve,
        Vend,
        regionV0: a.regionVolumes.map((v) => v / 1000),
        regionVe: ei.regionVolumes.map((v) => v / 1000),
        regionVend: z.regionVolumes.map((v) => v / 1000),
        metrics: m,
      };
    }
    run.completeBreaths = run.breaths.filter((b) => b.complete);
    run.metrics = run.completeBreaths.at(-1)?.metrics ?? null;
    const first = run.completeBreaths[0];
    run.gasExchange = {
      steadyVT: first?.metrics.VT ?? 0,
      alveolarVentilation: first ? (Math.max(0, first.metrics.VT - p.VD) * p.RR) / 1000 : 0,
    };
    return run;
  }
  function settled(p) {
    const base = {
      ...p,
      eventType: 'none',
      eventOnset: 30,
      eventRecovery: 0,
      eventSeverity: 0,
      eventLocation: 'regional',
      capnogramShape: 'transport',
      initial: 'steady',
      T: 120,
    };
    const key = JSON.stringify({ ...base, T: 0 });
    if (warmCache.has(key)) return warmCache.get(key);
    const q = Ventilation.timing(base),
      v = VentilationRegions.initial(base, q);
    const vt = VentilationRegions.breath(base, q, 0, v).metrics.VT,
      VA = (Math.max(0, vt - base.VD) * base.RR) / 1000;
    const guess = VA > 0 ? (0.863 * base.VCO2) / VA : base.CO2Initial;
    const P = guess >= 5 && guess <= 100 ? guess : base.CO2Initial;
    let seed = {
        lungFraction: P / 713,
        tissueFraction: P / 713 + ((base.VCO2 / 60000) * 863) / 713 / 0.5,
        airwayFraction: P / 713,
        measured: P,
      },
      volumes = v;
    let result = { seed, volumes, settled: false, seconds: 0 };
    if (q.cycle <= 120) {
      const n = Math.max(1, Math.min(6, Math.floor(120 / q.cycle))),
        T = n * q.cycle;
      for (let i = 0; i < 24; i++) {
        const run = build({ ...base, T }, { co2State: seed, volumes });
        if (!run.co2Balance.valid) {
          result = {
            seed,
            volumes,
            settled: false,
            seconds: i * T,
            reason: 'CO₂ storage exceeded the model domain during warmup.',
          };
          break;
        }
        const next = run.co2Balance.state;
        const difference = Math.max(
          Math.abs(next.tissueFraction - seed.tissueFraction) * 713,
          Math.abs(next.measured - seed.measured),
        );
        volumes = run.breaths.at(-1).regionVend;
        seed = next;
        result = { seed, volumes, settled: difference < 0.05, seconds: (i + 1) * T };
        if (result.settled && i >= 2) break;
      }
    }
    warmCache.set(key, result);
    if (warmCache.size > 4) warmCache.delete(warmCache.keys().next().value);
    return result;
  }
  function simulate(p, options = {}) {
    const initial = p.eventType === 'none' ? null : settled(p);
    const run = build(
      p,
      initial ? { ...options, co2State: initial.seed, volumes: initial.volumes } : options,
    );
    run.warmup = initial ? { settled: initial.settled, seconds: initial.seconds } : null;
    if (initial?.reason) run.warmup.reason = initial.reason;
    return run;
  }
  return { names, active, effect, simulate, sample };
})();
