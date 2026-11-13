/* Copyright (c) 2026 Julian W. Landaw | SPDX-License-Identifier: MIT */

const MAX_SIMULATION_MINUTES = 1440;

const SIMULATION_STEP_MINUTES = 0.1;

const TIME_EPSILON = 1e-9;

// Numerical API: inputs and outputs only. This file and units.js can run with
// Math.js without a document, a chart library, or any application UI state.
function resolvePkParameters(value) {
  const p = { ...value };
  if ((p.inputMode || 'clearance') === 'microconstants') {
    p.Cl = p.k10 * p.Vd1;
    p.Q2 = p.k12 * p.Vd1;
    p.Q3 = p.k13 * p.Vd1;
    p.Vd2 = p.k21 > 0 ? p.Q2 / p.k21 : 0;
    p.Vd3 = p.k31 > 0 ? p.Q3 / p.k31 : 0;
  } else {
    p.k10 = p.Vd1 > 0 ? p.Cl / p.Vd1 : 0;
    p.k12 = p.Vd1 > 0 ? p.Q2 / p.Vd1 : 0;
    p.k21 = p.Vd2 > 0 ? p.Q2 / p.Vd2 : 0;
    p.k13 = p.Vd1 > 0 ? p.Q3 / p.Vd1 : 0;
    p.k31 = p.Vd3 > 0 ? p.Q3 / p.Vd3 : 0;
  }
  return { ...p, mode: p.inputMode || 'clearance', V1: p.Vd1, V2: p.Vd2, V3: p.Vd3 };
}

function createTciImportSession(sourceState) {
  const sourceSimulation = simulateStrategy(sourceState);
  return {
    sourceState,
    sourceSimulation,
    exactSchedule: buildScheduleFromTciSimulation(
      sourceSimulation,
      INFUSIONUNITS[sourceState.units.infusion],
      sourceState.patient.weightKg,
    ),
  };
}

function computeModelRates(pk) {
  const { k10, k12, k21, k13, k31 } = pk;
  const matrix = math.matrix([
    [-(k10 + k12 + k13), k21, k31],
    [k12, -k21, 0],
    [k13, 0, -k31],
  ]);
  let values = [];
  try {
    values = toArray(math.eigs(matrix).values);
  } catch (error) {
    console.error('eigs failed:', error);
  }
  const rates = values
    .map((value) => math.re(value))
    .filter((value) => Number.isFinite(value) && value < 0)
    .sort((a, b) => Math.abs(b) - Math.abs(a))
    .map((value) => -value);
  return {
    alpha: rates[0] || 0,
    beta: rates[1] || 0,
    gamma: rates[2] || 0,
    terminalHalfLife: rates.length ? Math.log(2) / rates.at(-1) : 0,
  };
}

function contextSensitiveHalfTime(simulation, pk, step = SIMULATION_STEP_MINUTES) {
  if (simulation.lastRateEndIndex == null) return null;
  const index = clamp(simulation.lastRateEndIndex, 0, simulation.ts.length - 1);
  const x1 = simulation.xs1[index],
    x2 = simulation.xs2[index],
    x3 = simulation.xs3[index];
  if (!Number.isFinite(x1) || x1 <= 0) return null;
  const target = x1 / 2;
  const washoutAt = (time) => {
    const transition = createTransition(pk, 0, time);
    return transition.a11 * x1 + transition.a12 * x2 + transition.a13 * x3;
  };
  let lower = 0,
    upper = step;
  while (upper < 1e6 && washoutAt(upper) > target) {
    lower = upper;
    upper *= 2;
  }
  if (washoutAt(upper) > target) return null;
  for (let iteration = 0; iteration < 28; iteration++) {
    const middle = (lower + upper) / 2;
    if (washoutAt(middle) > target) lower = middle;
    else upper = middle;
  }
  return (lower + upper) / 2;
}

function tciTargetAt(tci, time) {
  let target = tci.targetBase;
  for (const change of tci.targetChanges || []) {
    if (change.time > time + TIME_EPSILON) break;
    target = change.targetBase;
  }
  return target;
}

function buildSimulationTimes(finalTime, eventTimes = [], step = SIMULATION_STEP_MINUTES) {
  const tfinal = Math.max(0, parseFloatSafe(finalTime, 0));
  const times = [0, tfinal];
  for (let t = step; t < tfinal - TIME_EPSILON; t += step) {
    times.push(Math.min(t, tfinal));
  }
  eventTimes.forEach((value) => {
    const time = Number(value);
    if (Number.isFinite(time) && time > TIME_EPSILON && time < tfinal - TIME_EPSILON)
      times.push(time);
  });
  times.sort((a, b) => a - b);
  return times.filter(
    (time, index) => index === 0 || Math.abs(time - times[index - 1]) > TIME_EPSILON,
  );
}

function createTransition(pk, ke0, duration, cache = new Map()) {
  const dt = Math.max(0, duration);
  const cacheKey = dt.toFixed(12);
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  const mat = math.matrix([
    [-dt * (pk.k10 + pk.k12 + pk.k13), dt * pk.k21, dt * pk.k31, 0, dt],
    [dt * pk.k12, -dt * pk.k21, 0, 0, 0],
    [dt * pk.k13, 0, -dt * pk.k31, 0, 0],
    [dt * (ke0 / pk.V1), 0, 0, -dt * ke0, 0],
    [0, 0, 0, 0, 0],
  ]);
  const M = math.expm(mat);
  const transition = {
    a11: M.subset(math.index(0, 0)),
    a12: M.subset(math.index(0, 1)),
    a13: M.subset(math.index(0, 2)),
    a15: M.subset(math.index(0, 4)),
    a21: M.subset(math.index(1, 0)),
    a22: M.subset(math.index(1, 1)),
    a23: M.subset(math.index(1, 2)),
    a25: M.subset(math.index(1, 4)),
    a31: M.subset(math.index(2, 0)),
    a32: M.subset(math.index(2, 1)),
    a33: M.subset(math.index(2, 2)),
    a35: M.subset(math.index(2, 4)),
    a41: M.subset(math.index(3, 0)),
    a42: M.subset(math.index(3, 1)),
    a43: M.subset(math.index(3, 2)),
    a44: M.subset(math.index(3, 3)),
    a45: M.subset(math.index(3, 4)),
  };
  cache.set(cacheKey, transition);
  return transition;
}

function buildDosingPlan({ schedule, basic, bolusUnit, infusionUnit, weightKg }) {
  const rateEvents = [];
  const instantEvents = [];
  const addBolus = (time, dose, duration) => {
    const start = Math.max(0, parseFloatSafe(time, 0));
    const amount = convertBolusValueToMgKg(dose, bolusUnit, weightKg);
    const length = Math.max(0, parseFloatSafe(duration, 0));
    if (!Number.isFinite(amount) || amount <= 0) return;
    if (length <= TIME_EPSILON) instantEvents.push({ time: start, amount });
    else rateEvents.push({ start, end: start + length, rate: amount / length, kind: 'bolus' });
  };
  const addInfusion = (startValue, endValue, rateValue) => {
    const start = Math.max(0, parseFloatSafe(startValue, 0));
    const end = Math.max(0, parseFloatSafe(endValue, 0));
    const rate = convertInfusionValueToMgKgMin(rateValue, infusionUnit, weightKg);
    if (!Number.isFinite(rate) || rate <= 0 || end <= start + TIME_EPSILON) return;
    rateEvents.push({ start, end, rate, kind: 'infusion' });
  };

  if (schedule?.enabled) {
    (schedule.boluses || []).forEach((event) => addBolus(event.time, event.dose, event.duration));
    (schedule.infusions || []).forEach((event) => addInfusion(event.start, event.end, event.rate));
  } else {
    const loadingDuration = Math.max(0, parseFloatSafe(basic?.tbolus, 0));
    addBolus(0, basic?.bolus, loadingDuration);
    addInfusion(
      loadingDuration,
      loadingDuration + Math.max(0, parseFloatSafe(basic?.tinfusion, 0)),
      basic?.infusion,
    );
  }
  return { rateEvents, instantEvents };
}

function simulatePkModel({ pk, ke0, initialConcentration, finalTime, dosingPlan, tci }) {
  const tfinal = Math.max(0, finalTime);
  const hasEffectSite = Number.isFinite(ke0) && ke0 > 0;
  const eventTimes = tci?.enabled
    ? [tci.stopTime, ...(tci.targetChanges || []).map((change) => change.time)]
    : [
        ...(dosingPlan?.rateEvents || []).flatMap((event) => [event.start, event.end]),
        ...(dosingPlan?.instantEvents || []).map((event) => event.time),
      ];
  const ts = buildSimulationTimes(tfinal, eventTimes);
  const N = ts.length - 1;
  const xs1 = new Array(N + 1).fill(0);
  const xs2 = new Array(N + 1).fill(0);
  const xs3 = new Array(N + 1).fill(0);
  const ces = new Array(N + 1).fill(0);
  const intervalRates = new Array(N).fill(0);
  const cumulativeDoseMgKg = new Array(N + 1).fill(0);
  const deliveryStatus = new Array(N).fill('manual');
  const transitionCache = new Map();

  xs1[0] = initialConcentration * pk.V1;
  ces[0] = initialConcentration;
  let totalDoseMgKg = 0;
  let lastRateEndIndex = null;

  const instantAt = (time) =>
    (dosingPlan?.instantEvents || []).reduce(
      (sum, event) => (Math.abs(event.time - time) <= TIME_EPSILON ? sum + event.amount : sum),
      0,
    );
  const sortedRateEvents = [...(dosingPlan?.rateEvents || [])].sort((a, b) => a.start - b.start);
  let nextRateEvent = 0;
  let activeRateEvents = [];
  let nextTargetChange = 0;
  let activeTarget = tci?.targetBase;
  const rateOverInterval = (start, end) => {
    const duration = end - start;
    if (duration <= 0) return 0;
    while (nextRateEvent < sortedRateEvents.length && sortedRateEvents[nextRateEvent].start < end) {
      activeRateEvents.push(sortedRateEvents[nextRateEvent++]);
    }
    activeRateEvents = activeRateEvents.filter((event) => event.end > start);
    return activeRateEvents.reduce((sum, event) => {
      const overlap = Math.max(0, Math.min(end, event.end) - Math.max(start, event.start));
      return sum + (event.rate * overlap) / duration;
    }, 0);
  };

  for (let i = 0; i < N; i++) {
    const instant = tci?.enabled ? 0 : instantAt(ts[i]);
    if (instant > 0) {
      xs1[i] += instant;
      totalDoseMgKg += instant;
    }
    cumulativeDoseMgKg[i] = totalDoseMgKg;
    const duration = ts[i + 1] - ts[i];
    const transition = createTransition(pk, hasEffectSite ? ke0 : 0, duration, transitionCache);
    let rate = 0;
    if (tci?.enabled) {
      while (
        nextTargetChange < (tci.targetChanges?.length || 0) &&
        tci.targetChanges[nextTargetChange].time <= ts[i] + TIME_EPSILON
      ) {
        activeTarget = tci.targetChanges[nextTargetChange++].targetBase;
      }
      const baseCpNext =
        (transition.a11 * xs1[i] + transition.a12 * xs2[i] + transition.a13 * xs3[i]) / pk.V1;
      const baseCeNext =
        transition.a41 * xs1[i] +
        transition.a42 * xs2[i] +
        transition.a43 * xs3[i] +
        transition.a44 * ces[i];
      const gain = tci.targetType === 'ce' ? transition.a45 : transition.a15 / pk.V1;
      const baseline = tci.targetType === 'ce' ? baseCeNext : baseCpNext;
      rate =
        ts[i] < tci.stopTime - TIME_EPSILON && gain > 0
          ? clamp((activeTarget - baseline) / gain, 0, tci.maxRate)
          : 0;
      deliveryStatus[i] =
        ts[i] >= tci.stopTime - TIME_EPSILON
          ? 'stopped'
          : activeTarget === 0
            ? 'paused-zero-target'
            : rate === 0
              ? 'paused-above-target'
              : rate >= tci.maxRate
                ? 'capped'
                : 'tracking';
    } else {
      rate = rateOverInterval(ts[i], ts[i + 1]);
    }
    intervalRates[i] = rate;
    totalDoseMgKg += rate * duration;
    cumulativeDoseMgKg[i + 1] = totalDoseMgKg;
    if (Math.abs(rate) > 1e-12) lastRateEndIndex = i + 1;

    const x1 = xs1[i],
      x2 = xs2[i],
      x3 = xs3[i],
      ce = ces[i];
    xs1[i + 1] =
      transition.a11 * x1 + transition.a12 * x2 + transition.a13 * x3 + rate * transition.a15;
    xs2[i + 1] =
      transition.a21 * x1 + transition.a22 * x2 + transition.a23 * x3 + rate * transition.a25;
    xs3[i + 1] =
      transition.a31 * x1 + transition.a32 * x2 + transition.a33 * x3 + rate * transition.a35;
    ces[i + 1] =
      transition.a41 * x1 +
      transition.a42 * x2 +
      transition.a43 * x3 +
      transition.a44 * ce +
      rate * transition.a45;
  }

  const finalInstant = tci?.enabled ? 0 : instantAt(ts[N]);
  if (finalInstant > 0) {
    xs1[N] += finalInstant;
    totalDoseMgKg += finalInstant;
  }
  cumulativeDoseMgKg[N] = totalDoseMgKg;

  return {
    ts,
    xs1,
    xs2,
    xs3,
    ces,
    intervalRates,
    cumulativeDoseMgKg,
    deliveryStatus,
    totalDoseMgKg,
    lastRateEndIndex,
    hasEffectSite,
    finalActiveRate: N > 0 ? intervalRates[N - 1] : 0,
    cp: xs1.map((value) => value / pk.V1),
    ce: ces.slice(),
  };
}

function buildScheduleFromTciSimulation(simulation, infusionUnit, weightKg) {
  const infusions = [];
  simulation.intervalRates.forEach((rateMgKgMin, index) => {
    if (!(rateMgKgMin > 0)) return;
    const start = Number(formatInputValue(simulation.ts[index]));
    const end = Number(formatInputValue(simulation.ts[index + 1]));
    const rate = Number(
      formatInputValue(convertMgKgMinToInfusionValue(rateMgKgMin, infusionUnit, weightKg)),
    );
    const last = infusions[infusions.length - 1];
    if (last && last.end === start && last.rate === rate) last.end = end;
    else infusions.push({ start, end, rate });
  });
  return { enabled: true, boluses: [], infusions };
}

function simplifyTciInfusions(infusions, limit) {
  if (limit >= infusions.length) return infusions.map((item) => ({ ...item }));
  const runs = [];
  for (const infusion of infusions) {
    const last = runs[runs.length - 1];
    if (last && Math.abs(last[last.length - 1].end - infusion.start) < 1e-8) last.push(infusion);
    else runs.push([infusion]);
  }
  if (runs.length > limit) return null; // Never bridge a zero-rate gap.
  const groups = runs.map((run) => {
    const duration = [0],
      dose = [0],
      squared = [0];
    run.forEach((item) => {
      const dt = item.end - item.start;
      duration.push(duration.at(-1) + dt);
      dose.push(dose.at(-1) + item.rate * dt);
      squared.push(squared.at(-1) + item.rate * item.rate * dt);
    });
    return { run, duration, dose, squared, from: 0, to: run.length };
  });
  const loss = (g, a, b) => {
    const dt = g.duration[b] - g.duration[a];
    const dose = g.dose[b] - g.dose[a];
    return dt > 0 ? g.squared[b] - g.squared[a] - (dose * dose) / dt : 0;
  };
  const bestSplit = (g) => {
    let best = { at: -1, gain: 0 };
    const whole = loss(g, g.from, g.to);
    for (let at = g.from + 1; at < g.to; at++) {
      const gain = whole - loss(g, g.from, at) - loss(g, at, g.to);
      if (gain > best.gain + 1e-12) best = { at, gain };
    }
    return best;
  };
  const heap = [];
  const push = (group) => {
    group.split = bestSplit(group);
    heap.push(group);
    let index = heap.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (heap[parent].split.gain >= heap[index].split.gain) break;
      [heap[parent], heap[index]] = [heap[index], heap[parent]];
      index = parent;
    }
  };
  const pop = () => {
    const top = heap[0],
      tail = heap.pop();
    if (heap.length) {
      heap[0] = tail;
      let index = 0;
      while (true) {
        const left = index * 2 + 1,
          right = left + 1;
        let largest = index;
        if (left < heap.length && heap[left].split.gain > heap[largest].split.gain) largest = left;
        if (right < heap.length && heap[right].split.gain > heap[largest].split.gain)
          largest = right;
        if (largest === index) break;
        [heap[index], heap[largest]] = [heap[largest], heap[index]];
        index = largest;
      }
    }
    return top;
  };
  groups.forEach(push);
  while (heap.length < limit && heap[0]?.split.gain > 0) {
    const g = pop();
    push({ ...g, to: g.split.at });
    push({ ...g, from: g.split.at });
  }
  return heap
    .map((g) => {
      const dt = g.duration[g.to] - g.duration[g.from];
      return {
        start: g.run[g.from].start,
        end: g.run[g.to - 1].end,
        rate: Number(formatInputValue((g.dose[g.to] - g.dose[g.from]) / dt)),
      };
    })
    .sort((a, b) => a.start - b.start);
}

function countTciInfusionRuns(infusions) {
  return infusions.reduce(
    (count, item, index) =>
      count + (index === 0 || Math.abs(infusions[index - 1].end - item.start) >= 1e-8 ? 1 : 0),
    0,
  );
}

function prepareSimulationInput(state) {
  const p = resolvePkParameters(state.pk);
  const { k10, k12, k21, k13, k31 } = p;
  const inp = state.inputs;
  const initUnit = UNITS[state.units.conc] || UNITS['mg/mL'];
  const initialp_mgml = inp.initialp / initUnit.factor;

  const bUnit = BOLUSUNITS[state.units.bolus] || BOLUSUNITS['mg/kg'];
  const iUnit = INFUSIONUNITS[state.units.infusion] || INFUSIONUNITS['mg/kg/min'];
  const weightKg =
    state.patient?.weightKg && state.patient.weightKg > 0 ? state.patient.weightKg : 70;
  const dosingPlan = buildDosingPlan({
    schedule: state.schedule,
    basic: { bolus: inp.b, tbolus: inp.tbolus, infusion: inp.infusion, tinfusion: inp.tinfusion },
    bolusUnit: bUnit,
    infusionUnit: iUnit,
    weightKg,
  });
  const savedTci = state.tci || { enabled: false };
  const tci = {
    enabled: Boolean(savedTci.enabled),
    targetType: savedTci.targetType === 'ce' ? 'ce' : 'cp',
    targetBase: parseFloatSafe(savedTci.target, 0) / initUnit.factor,
    targetChanges: (savedTci.changes || []).map((change) => ({
      time: change.time,
      targetBase: change.target / initUnit.factor,
    })),
    maxRate: convertInfusionValueToMgKgMin(savedTci.maxRate, iUnit, weightKg),
    stopTime: Math.max(0, parseFloatSafe(savedTci.stopTime, 0)),
  };
  return {
    pk: { V1: p.Vd1, V2: p.Vd2, V3: p.Vd3, k10, k12, k21, k13, k31 },
    ke0: parseFloatSafe(p.ke0, 0),
    initialConcentration: initialp_mgml,
    finalTime: Math.max(0, parseFloatSafe(inp.tfinal, 0)),
    dosingPlan: tci.enabled ? { rateEvents: [], instantEvents: [] } : dosingPlan,
    tci: tci.enabled ? tci : { enabled: false },
  };
}

function simulateStrategy(state) {
  return simulatePkModel(prepareSimulationInput(state));
}

function simulationInterval(simulation, time) {
  const ts = simulation.ts;
  let lower = 0,
    upper = ts.length - 1;
  while (upper - lower > 1) {
    const middle = (lower + upper) >> 1;
    if (ts[middle] <= time) lower = middle;
    else upper = middle;
  }
  return time >= ts.at(-1) ? ts.length - 1 : lower;
}

// Rates are right-continuous. Concentration and cumulative dose at a bolus
// boundary include that bolus; sampling before it never anticipates the jump.
function sampleSimulation(simulation, input, requestedTime) {
  const time = clamp(requestedTime, 0, simulation.ts.at(-1));
  const index = simulationInterval(simulation, time);
  const dt = time - simulation.ts[index];
  const rateBase = simulation.intervalRates[index] || 0;
  let cp = simulation.cp[index],
    ce = simulation.ce[index];
  if (dt > TIME_EPSILON) {
    const a = createTransition(input.pk, simulation.hasEffectSite ? input.ke0 : 0, dt);
    const x1 = simulation.xs1[index],
      x2 = simulation.xs2[index],
      x3 = simulation.xs3[index];
    cp = (a.a11 * x1 + a.a12 * x2 + a.a13 * x3 + rateBase * a.a15) / input.pk.V1;
    ce = a.a41 * x1 + a.a42 * x2 + a.a43 * x3 + a.a44 * ce + rateBase * a.a45;
  }
  const targetBase =
    input.tci.enabled && time < input.tci.stopTime - TIME_EPSILON
      ? tciTargetAt(input.tci, time)
      : null;
  return {
    time,
    cp,
    ce: simulation.hasEffectSite ? ce : null,
    rateBase,
    cumulativeDoseMgKg: simulation.cumulativeDoseMgKg[index] + rateBase * dt,
    targetBase,
    targetType: input.tci.enabled ? input.tci.targetType : null,
    status: index === simulation.ts.length - 1 ? 'end' : simulation.deliveryStatus[index],
  };
}

function physicallyEqual(a, b) {
  if (typeof a === 'number' && typeof b === 'number')
    return Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b), 1e-12);
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.hasOwn(b, key) && physicallyEqual(a[key], b[key]))
  );
}

function replayAssumptionsChanged(current, source) {
  const now = prepareSimulationInput(current),
    original = prepareSimulationInput(source);
  return (
    current.drug !== source.drug ||
    !physicallyEqual(now.pk, original.pk) ||
    !physicallyEqual(now.ke0, original.ke0) ||
    !physicallyEqual(current.patient.weightKg, source.patient.weightKg) ||
    !physicallyEqual(now.initialConcentration, original.initialConcentration) ||
    !physicallyEqual(now.finalTime, original.finalTime)
  );
}

function trapz(y, x) {
  let s = 0;
  for (let i = 1; i < y.length; i++) {
    const dx = x[i] - x[i - 1];
    s += 0.5 * (y[i] + y[i - 1]) * dx;
  }
  return s;
}

function computeMetrics(sim) {
  const { ts, cp, ce } = sim;
  const idxCp = cp.reduce((imax, v, i, arr) => (v > arr[imax] ? i : imax), 0);
  const idxCe = sim.hasEffectSite
    ? ce.reduce((imax, v, i, arr) => (v > arr[imax] ? i : imax), 0)
    : null;

  return {
    totalDose_mgkg: sim.totalDoseMgKg,
    cmaxCp: cp[idxCp],
    tmaxCp: ts[idxCp],
    cmaxCe: idxCe == null ? null : ce[idxCe],
    tmaxCe: idxCe == null ? null : ts[idxCe],
    aucCp: trapz(cp, ts),
    aucCe: sim.hasEffectSite ? trapz(ce, ts) : null,
  };
}

function toArray(m) {
  if (Array.isArray(m)) return m;
  if (m && typeof m.toArray === 'function') return m.toArray();
  if (m && m._data) return m._data;
  return [m];
}

function interpolateSimulationValue(simulation, values, time) {
  const ts = simulation.ts;
  if (time <= ts[0]) return values[0];
  if (time >= ts[ts.length - 1]) return values[values.length - 1];
  let lo = 0,
    hi = ts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ts[mid] <= time) lo = mid;
    else hi = mid;
  }
  const fraction = (time - ts[lo]) / (ts[hi] - ts[lo]);
  return values[lo] + fraction * (values[hi] - values[lo]);
}

function maxReplayDifference(original, edited, field, endTime) {
  let maximum = 0;
  for (const time of original.ts) {
    if (time > endTime + TIME_EPSILON) break;
    maximum = Math.max(
      maximum,
      Math.abs(
        interpolateSimulationValue(edited, edited[field], time) -
          interpolateSimulationValue(original, original[field], time),
      ),
    );
  }
  for (const time of edited.ts) {
    if (time > endTime + TIME_EPSILON) break;
    maximum = Math.max(
      maximum,
      Math.abs(
        interpolateSimulationValue(edited, edited[field], time) -
          interpolateSimulationValue(original, original[field], time),
      ),
    );
  }
  return maximum;
}
