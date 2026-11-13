/* Copyright (c) 2026 Julian W. Landaw | SPDX-License-Identifier: MIT */

function chartConfig() {
  return { responsive: true, displaylogo: false, displayModeBar: window.innerWidth > 690 };
}

function renderPlot(id, traces, layout) {
  const themed = themedPlotLayout(layout);
  themed.uirevision = `${currentDrug}:${chartRevision}`;
  themed.yaxis.uirevision = `${chartRevision}:${isLogScale}`;
  return Plotly.react(id, traces, themed, chartConfig());
}

function setChartWindow(windowMinutes) {
  const end = parseFloatSafe(tfinalnum.value, 240);
  const range = [0, windowMinutes === 'full' ? end : Math.min(end, Number(windowMinutes))];
  ['myDiv1', 'myDiv2', 'myDiv3', 'tciRatePlot'].forEach((id) => {
    if (document.getElementById(id)?.data)
      Plotly.relayout(id, { 'xaxis.range': range, 'xaxis.autorange': false });
  });
}

const lightLayout = {
  font: {
    family: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
    size: 14,
    color: '#333',
  },
  paper_bgcolor: '#ffffff',
  plot_bgcolor: '#f8f9fa',
  margin: { l: 60, r: 30, t: 55, b: 70 },
  xaxis: { gridcolor: '#e9ecef', zerolinecolor: '#dee2e6', linecolor: '#adb5bd', mirror: true },
  yaxis: { gridcolor: '#e9ecef', zerolinecolor: '#dee2e6', linecolor: '#adb5bd', mirror: true },
  title: {
    font: {
      family: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
      size: 18,
      color: '#212529',
    },
  },
};

const darkLayout = {
  font: {
    family: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
    size: 14,
    color: '#e9ecef',
  },
  paper_bgcolor: '#121212',
  plot_bgcolor: '#1e1e1e',
  margin: { l: 60, r: 30, t: 55, b: 70 },
  xaxis: { gridcolor: '#2a2a2a', zerolinecolor: '#444', linecolor: '#666', mirror: true },
  yaxis: { gridcolor: '#2a2a2a', zerolinecolor: '#444', linecolor: '#666', mirror: true },
  title: {
    font: {
      family: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
      size: 18,
      color: '#e9ecef',
    },
  },
};

function themedPlotLayout(layout) {
  const theme = document.body.classList.contains('dark-mode') ? darkLayout : lightLayout;
  return {
    ...theme,
    ...layout,
    font: { ...theme.font, ...layout.font },
    margin: { ...theme.margin, ...layout.margin },
    xaxis: { ...theme.xaxis, ...layout.xaxis },
    yaxis: { ...theme.yaxis, ...layout.yaxis },
    title: {
      ...theme.title,
      ...layout.title,
      font: { ...theme.title.font, ...layout.title?.font },
    },
  };
}

function toggleDarkMode() {
  document.body.classList.toggle('dark-mode');
  const btn = document.getElementById('darkModeBtnTop');
  if (btn) {
    const enabled = document.body.classList.contains('dark-mode');
    btn.setAttribute('aria-pressed', String(enabled));
    btn.textContent = enabled ? 'Light mode' : 'Dark mode';
  }
  const theme = document.body.classList.contains('dark-mode') ? darkLayout : lightLayout;
  ['myDiv1', 'myDiv2', 'myDiv3', 'tciRatePlot'].forEach((id) => {
    const plot = document.getElementById(id);
    if (!plot?.data) return;
    Plotly.relayout(plot, {
      font: theme.font,
      paper_bgcolor: theme.paper_bgcolor,
      plot_bgcolor: theme.plot_bgcolor,
      'title.font': theme.title.font,
      ...Object.fromEntries(
        ['xaxis', 'yaxis'].flatMap((axis) =>
          Object.entries(theme[axis]).map(([key, value]) => [`${axis}.${key}`, value]),
        ),
      ),
    });
  });
}

let isLogScale = false;

function toggleScale() {
  isLogScale = !isLogScale;
  const newType = isLogScale ? 'log' : 'linear';
  Plotly.relayout('myDiv1', { 'yaxis.type': newType });
  Plotly.relayout('myDiv2', { 'yaxis.type': newType });
  Plotly.relayout('myDiv3', { 'yaxis.type': newType });
  const btn = document.getElementById('scaleToggleBtnTop');
  if (btn) {
    btn.textContent = isLogScale ? 'Linear Y-axis' : 'Log Y-axis';
    btn.setAttribute('aria-pressed', String(isLogScale));
  }
}

function valToDisplayY(value, unitName) {
  const sourceUnit = UNITS[unitName];
  if (!sourceUnit) return value;
  const mgPerMl = value / sourceUnit.factor;
  return mgPerMl * currentUnit.factor;
}

function refreshReferenceOverlays() {
  const plot = document.getElementById('myDiv1');
  if (!plot?.data || !latestSimulationContext) return;
  const shapes = (plot.layout.shapes || []).filter((shape) => shape.name !== 'therapeutic-band');
  const references = buildTherapeuticShapes(latestSimulationContext.params.tfinal).shapes;
  Plotly.relayout(plot, { shapes: [...shapes, ...references] });
  renderTherapeuticRangeKey();
}

function buildTherapeuticShapes(finalTime) {
  const shapes = [];
  if (!showTherapeutic || !currentDrug || presetIsModified) return { shapes };
  const ranges = EFFECT_SITE_RANGES[currentDrug] || [];
  if (!Array.isArray(ranges) || ranges.length === 0) return { shapes };
  const x0 = 0,
    x1 = finalTime;

  ranges.forEach((r) => {
    const yLow = valToDisplayY(r.low, r.unit);
    const yHigh = valToDisplayY(r.high, r.unit);
    shapes.push({
      name: 'therapeutic-band',
      type: 'rect',
      xref: 'x',
      yref: 'y',
      x0,
      x1,
      y0: yLow,
      y1: yHigh,
      fillcolor: r.color,
      opacity: 0.07,
      line: { width: 0 },
    });
  });

  return { shapes };
}

function renderTherapeuticRangeKey() {
  const key = document.getElementById('therapeuticRangeKey');
  const ranges = showTherapeutic && !presetIsModified ? EFFECT_SITE_RANGES[currentDrug] || [] : [];
  key.replaceChildren();
  key.hidden = !ranges.length;
  ranges.forEach((range) => {
    const item = document.createElement('span');
    const swatch = document.createElement('i');
    swatch.style.backgroundColor = range.color;
    swatch.setAttribute('aria-hidden', 'true');
    item.append(
      swatch,
      document.createTextNode(`${range.label}: ${range.low}–${range.high} ${range.unit}`),
    );
    key.appendChild(item);
  });
}

function legendOutsideBottom(
  layout,
  { y = -0.22, bottom = 90, fontSize = 11, itemWidth = 30 } = {},
) {
  layout.legend = {
    ...(layout.legend || {}),
    orientation: 'h',
    x: 0.5,
    xanchor: 'center',
    y,
    yanchor: 'top',
    yref: 'paper',
    bgcolor: 'rgba(0,0,0,0)',
    borderwidth: 0,
    font: { size: fontSize },
    itemwidth: itemWidth,
    itemclick: 'toggle',
    itemdoubleclick: 'toggleothers',
    tracegroupgap: 8,
  };

  const m = layout.margin || {};
  layout.margin = {
    t: Math.max(55, m.t || 0),
    r: Math.max(20, m.r || 0),
    b: Math.max(bottom, m.b || 0),
    l: Math.max(60, m.l || 0),
    pad: 4,
  };

  layout.xaxis = layout.xaxis || {};
  layout.xaxis.title = { ...(layout.xaxis.title || {}), standoff: 10 };
  layout.xaxis.automargin = true;
  return layout;
}

function renderCompareResults(rows, unitLabel) {
  const container = document.getElementById('compareResults');
  if (!container) return;
  if (!rows || !rows.length) {
    container.innerHTML = '';
    return;
  }

  const fmt = (x, sig = 3) => (Number.isFinite(x) ? roundToSignificantFigures(x, sig) : 'N/A');

  const header = `
    <table class="table table-bordered table-sm align-middle text-center">
      <thead class="table-light">
        <tr>
          <th>Strategy</th>
          <th>Total dose (mg/kg)</th>
          <th>Cp Cmax (${unitLabel})</th>
          <th>Tmax (min)</th>
          <th>Ce Cmax (${unitLabel})</th>
          <th>Tmax (min)</th>
          <th>AUC Cp (${unitLabel}·min)</th>
          <th>AUC Ce (${unitLabel}·min)</th>
        </tr>
      </thead>
      <tbody>`;

  const body = rows
    .map((r) => {
      const m = r.metrics;
      return `
      <tr>
        <td class="text-start">${escapeHtml(r.state.name)}</td>
        <td>${fmt(m.totalDose_mgkg, 4)}</td>
        <td>${fmt(m.cmaxCp * currentUnit.factor, 4)}</td>
        <td>${fmt(m.tmaxCp, 3)}</td>
        <td>${fmt(m.cmaxCe == null ? null : m.cmaxCe * currentUnit.factor, 4)}</td>
        <td>${fmt(m.tmaxCe, 3)}</td>
        <td>${fmt(m.aucCp * currentUnit.factor, 4)}</td>
        <td>${fmt(m.aucCe == null ? null : m.aucCe * currentUnit.factor, 4)}</td>
      </tr>`;
    })
    .join('');

  container.innerHTML = header + body + '</tbody></table>';
}

function plotComparisonFromCurrent() {
  const live = getCurrentState('Current');
  const relevant = strategies.filter((s) => s.drug === currentDrug);
  const all = [live, ...relevant];
  if (all.length <= 1) return;

  const palette = [
    '#1f77b4',
    '#ff7f0e',
    '#2ca02c',
    '#d62728',
    '#9467bd',
    '#8c564b',
    '#e377c2',
    '#7f7f7f',
    '#bcbd22',
    '#17becf',
  ];
  const unitLabel = currentUnit.name;
  const yFactor = currentUnit.factor;

  const traces = [];
  const metricsRows = [];

  all.forEach((s, i) => {
    const sim = getSimulationResult(s).simulation;
    const color = palette[i % palette.length];
    traces.push({
      x: sim.ts,
      y: sim.cp.map((v) => v * yFactor),
      name: `${s.name} Cp (${unitLabel})`,
      legendgroup: s.id,
      line: { color, width: 2 },
    });
    if (sim.hasEffectSite) {
      traces.push({
        x: sim.ts,
        y: sim.ce.map((v) => v * yFactor),
        name: `${s.name} Ce (${unitLabel})`,
        legendgroup: s.id,
        line: { color, width: 2, dash: 'dot' },
      });
    }
    metricsRows.push({ state: s, metrics: computeMetrics(sim) });
  });

  const layout = {
    title: { text: 'Central vs Effect-site (Comparison)' },
    xaxis: { title: { text: 'Time (min)' } },
    yaxis: { title: { text: `Concentration (${unitLabel})` }, type: isLogScale ? 'log' : 'linear' },
  };

  const { shapes: therShapes } = buildTherapeuticShapes(live.inputs.tfinal);
  layout.shapes = [...(layout.shapes || []), ...therShapes];
  legendOutsideBottom(layout);
  renderPlot('myDiv1', traces, layout);
  renderCompareResults(metricsRows, unitLabel);
}

function addEventMarkers(layout) {
  const finalTime = parseFloatSafe(document.getElementById('tfinal')?.value, 0);
  layout.shapes = [];
  layout.annotations = [];
  const tci = getTciConfig();
  if (tci.enabled) {
    const stopTime = Math.min(tci.stopTime, finalTime);
    if (stopTime > 0 && stopTime < finalTime) {
      layout.shapes.push({
        type: 'line',
        x0: stopTime,
        x1: stopTime,
        y0: 0,
        y1: 1,
        xref: 'x',
        yref: 'paper',
        line: { color: '#198754', width: 0.8, dash: 'dot' },
      });
      layout.annotations.push({
        x: stopTime,
        y: 1,
        xref: 'x',
        yref: 'paper',
        text: 'TCI stop',
        showarrow: false,
        yanchor: 'bottom',
        font: { color: '#198754', size: 10 },
      });
    }
    return layout;
  }
  const schedule = getScheduleFromDOM();

  if (!schedule || !schedule.enabled) {
    const bolusTime = parseFloatSafe(document.getElementById('tbolus')?.value, 0);
    const infusionStop = parseFloatSafe(document.getElementById('tinfusion')?.value, 0) + bolusTime;

    if (bolusTime > 0 && bolusTime < finalTime) {
      layout.shapes.push({
        type: 'line',
        x0: bolusTime,
        x1: bolusTime,
        y0: 0,
        y1: 1,
        xref: 'x',
        yref: 'paper',
        line: { color: 'red', width: 0.6, dash: 'dot' },
      });
      layout.annotations.push({
        x: bolusTime,
        y: 1,
        xref: 'x',
        yref: 'paper',
        text: 'Bolus',
        showarrow: false,
        yanchor: 'bottom',
        font: { color: 'red', size: 10 },
      });
    }

    if (infusionStop > 0 && infusionStop < finalTime) {
      layout.shapes.push({
        type: 'line',
        x0: infusionStop,
        x1: infusionStop,
        y0: 0,
        y1: 1,
        xref: 'x',
        yref: 'paper',
        line: { color: 'blue', width: 0.6, dash: 'dot' },
      });
      layout.annotations.push({
        x: infusionStop,
        y: 1,
        xref: 'x',
        yref: 'paper',
        text: 'Infusion End',
        showarrow: false,
        yanchor: 'bottom',
        font: { color: 'blue', size: 10 },
      });
    }
    return layout;
  }

  const boluses = (schedule.boluses || []).filter((b) => Number.isFinite(b.time));
  const infs = (schedule.infusions || []).filter(
    (i) => Number.isFinite(i.start) && Number.isFinite(i.end),
  );

  boluses.forEach((b, k) => {
    const t = b.time;
    if (t >= 0 && t <= finalTime) {
      layout.shapes.push({
        type: 'line',
        x0: t,
        x1: t,
        y0: 0,
        y1: 1,
        xref: 'x',
        yref: 'paper',
        line: { color: 'red', width: 0.6, dash: 'dot' },
      });
      if (k < 6)
        layout.annotations.push({
          x: t,
          y: 1,
          xref: 'x',
          yref: 'paper',
          text: `B${k + 1}`,
          showarrow: false,
          yanchor: 'bottom',
          font: { color: 'red', size: 10 },
        });
    }
  });

  if (infs.length > MAX_VISIBLE_SCHEDULE_SEGMENTS) {
    [infs[0].start, infs[infs.length - 1].end].forEach((time, index) => {
      if (time >= 0 && time <= finalTime) {
        layout.shapes.push({
          type: 'line',
          x0: time,
          x1: time,
          y0: 0,
          y1: 1,
          xref: 'x',
          yref: 'paper',
          line: { color: 'blue', width: 0.6, dash: 'dot' },
        });
        layout.annotations.push({
          x: time,
          y: 1,
          xref: 'x',
          yref: 'paper',
          text: index === 0 ? 'Variable infusion start' : 'Variable infusion end',
          showarrow: false,
          yanchor: 'bottom',
          font: { color: 'blue', size: 10 },
        });
      }
    });
    return layout;
  }

  infs.forEach((seg, k) => {
    const s = Math.max(0, seg.start);
    const e = Math.max(0, seg.end);
    [s, e].forEach((t, j) => {
      if (t >= 0 && t <= finalTime) {
        layout.shapes.push({
          type: 'line',
          x0: t,
          x1: t,
          y0: 0,
          y1: 1,
          xref: 'x',
          yref: 'paper',
          line: { color: 'blue', width: 0.6, dash: 'dot' },
        });
        if (k < 4) {
          const label = j === 0 ? `I${k + 1}s` : `I${k + 1}e`;
          layout.annotations.push({
            x: t,
            y: 1,
            xref: 'x',
            yref: 'paper',
            text: label,
            showarrow: false,
            yanchor: 'bottom',
            font: { color: 'blue', size: 10 },
          });
        }
      }
    });
  });

  return layout;
}

function updateTciReplayComparison(simulation, schedule, tci) {
  const panel = document.getElementById('tciReplayComparison');
  const tools = document.getElementById('tciSimplifyTools');
  const active = Boolean(tciImportSession && schedule.enabled && !tci.enabled);
  if (panel) panel.hidden = !active;
  if (tools) tools.hidden = !active;
  if (!active) return [];

  const source = tciImportSession.sourceState;
  const original = tciImportSession.sourceSimulation;
  const drug = DRUGS.find((d) => d.id === source.drug)?.label || 'Custom model';
  const sourceText = document.getElementById('tciSourceDescription');
  if (sourceText)
    sourceText.textContent = `${drug} · ${source.tci.targetType === 'ce' ? 'Ce' : 'Cp'} initial target ${formatInputValue(source.tci.target)} ${source.units.conc}${(source.tci.changes || []).map((change) => `; at ${formatInputValue(change.time)} min → ${formatInputValue(change.target)} ${source.units.conc}`).join('')} · stop ${formatInputValue(source.tci.stopTime)} min · maximum ${formatInputValue(source.tci.maxRate)} ${source.units.infusion} · ${formatInputValue(source.patient.weightKg)} kg · original ${tciImportSession.exactSchedule.infusions.length} segments`;

  const endTime = Math.min(original.ts.at(-1), simulation.ts.at(-1));
  const cpError = maxReplayDifference(original, simulation, 'cp', endTime) * currentUnit.factor;
  const ceError =
    original.hasEffectSite && simulation.hasEffectSite
      ? maxReplayDifference(original, simulation, 'ce', endTime) * currentUnit.factor
      : null;
  const doseDifference = simulation.totalDoseMgKg - original.totalDoseMgKg;
  const metrics = document.getElementById('tciReplayMetrics');
  if (metrics)
    metrics.textContent = `Maximum model replay difference over 0–${formatInputValue(endTime)} min: Cp ${formatInputValue(cpError)} ${currentUnit.name}${ceError == null ? '' : `; Ce ${formatInputValue(ceError)} ${currentUnit.name}`}. Total delivered dose difference: ${doseDifference >= 0 ? '+' : ''}${formatInputValue(doseDifference)} mg/kg.`;

  const current = getCurrentState();
  const assumptionsChanged = replayAssumptionsChanged(current, source);
  const warning = document.getElementById('tciReplayWarning');
  if (warning)
    warning.textContent = assumptionsChanged
      ? 'Model, weight, initial concentration, or final time changed since import; replay differences also reflect those changes.'
      : compareMode && strategies.some((s) => s.drug === currentDrug)
        ? 'The original TCI overlay is hidden while strategy comparison is active; turn comparison off to view it.'
        : '';

  if (!document.getElementById('showTciReference')?.checked) return [];
  const referenceTimes = original.ts.filter((time) => time <= endTime + TIME_EPSILON);
  if (referenceTimes.at(-1) < endTime - TIME_EPSILON) referenceTimes.push(endTime);
  const sourceTraces = [
    {
      x: referenceTimes,
      y: referenceTimes.map(
        (time) => interpolateSimulationValue(original, original.cp, time) * currentUnit.factor,
      ),
      name: 'Original TCI Cp (model)',
      line: { color: '#2856b8', width: 2, dash: 'dash' },
    },
  ];
  if (original.hasEffectSite)
    sourceTraces.push({
      x: referenceTimes,
      y: referenceTimes.map(
        (time) => interpolateSimulationValue(original, original.ce, time) * currentUnit.factor,
      ),
      name: 'Original TCI Ce (model)',
      line: { color: '#a85a16', width: 2, dash: 'dash' },
    });
  return sourceTraces;
}

function renderSimulationCharts(simulation, params, schedule, tci) {
  const { ts, xs1, xs2, xs3, ces } = simulation;
  const N = ts.length - 1;
  const yFactor = currentUnit.factor;
  const unitLabel = currentUnit.name;
  const hasEffectSite = simulation.hasEffectSite;

  const trace_cp = {
    x: [],
    y: [],
    name: `Cp (${unitLabel})`,
    line: { color: '#1f77b4', width: 2 },
  };
  const trace_ce = hasEffectSite
    ? { x: [], y: [], name: `Ce (${unitLabel})`, line: { color: '#ff7f0e', width: 2, dash: 'dot' } }
    : null;
  const trace_target = tci.enabled
    ? {
        x: [],
        y: [],
        name: `${tci.targetType === 'ce' ? 'Ce' : 'Cp'} target until ${formatInputValue(Math.min(tci.stopTime, params.tfinal))} min`,
        line: { color: '#198754', width: 2, dash: 'dash', shape: 'hv' },
      }
    : null;
  const trace_p1 = {
    x: [],
    y: [],
    name: `Rapid peripheral compartment (${unitLabel})`,
    line: { width: 2 },
  };
  const trace_p2 = {
    x: [],
    y: [],
    name: `Slow peripheral compartment (${unitLabel})`,
    line: { width: 2 },
  };

  for (let i = 0; i < N + 1; i++) {
    const t = ts[i];
    const cp = params.Vd1 > 0 ? xs1[i] / params.Vd1 : 0;
    const p1 = params.Vd2 > 0 ? xs2[i] / params.Vd2 : 0;
    const p2 = params.Vd3 > 0 ? xs3[i] / params.Vd3 : 0;
    const ce = ces[i];

    trace_cp.x.push(t);
    trace_cp.y.push(cp * yFactor);
    if (trace_ce) {
      trace_ce.x.push(t);
      trace_ce.y.push(ce * yFactor);
    }
    trace_p1.x.push(t);
    trace_p1.y.push(p1 * yFactor);
    trace_p2.x.push(t);
    trace_p2.y.push(p2 * yFactor);
    if (trace_target) {
      trace_target.x.push(t);
      trace_target.y.push(t <= tci.stopTime ? tciTargetAt(tci, t) * yFactor : null);
    }
  }

  let layout1 = {
    title: {
      text: hasEffectSite
        ? 'Central vs Effect-site'
        : 'Central concentration (effect site not modeled)',
    },
    xaxis: { title: { text: 'Time (min)' } },
    yaxis: { title: { text: `Concentration (${unitLabel})` }, type: isLogScale ? 'log' : 'linear' },
  };
  let layout2 = {
    title: { text: 'Rapid peripheral compartment' },
    xaxis: { title: { text: 'Time (min)' } },
    yaxis: { title: { text: `Concentration (${unitLabel})` }, type: isLogScale ? 'log' : 'linear' },
    showlegend: false,
  };
  let layout3 = {
    title: { text: 'Slow peripheral compartment' },
    xaxis: { title: { text: 'Time (min)' } },
    yaxis: { title: { text: `Concentration (${unitLabel})` }, type: isLogScale ? 'log' : 'linear' },
    showlegend: false,
  };

  layout1 = addEventMarkers(layout1);
  layout2 = addEventMarkers(layout2);
  layout3 = addEventMarkers(layout3);

  layout1 = legendOutsideBottom(layout1);

  const { shapes: therShapes } = buildTherapeuticShapes(params.tfinal);
  layout1.shapes = [...(layout1.shapes || []), ...therShapes];

  const originalTciTraces = updateTciReplayComparison(simulation, schedule, tci);
  const panel1Traces = [
    trace_cp,
    ...(trace_ce ? [trace_ce] : []),
    ...(trace_target ? [trace_target] : []),
    ...originalTciTraces,
  ];
  renderTherapeuticRangeKey();

  if (compareMode && strategies.some((s) => s.drug === currentDrug)) {
    plotComparisonFromCurrent();
  } else {
    renderPlot('myDiv1', panel1Traces, layout1);
    const compareResults = document.getElementById('compareResults');
    if (compareResults) compareResults.textContent = '';
  }

  renderPlot('myDiv2', [trace_p1], layout2);
  renderPlot('myDiv3', [trace_p2], layout3);

  const tciRatePanel = document.getElementById('tciRatePanel');
  if (tciRatePanel) tciRatePanel.hidden = !(tci.enabled || schedule.enabled);
  const deliveryRateHeading = document.getElementById('deliveryRateHeading');
  if (deliveryRateHeading)
    deliveryRateHeading.textContent = tci.enabled
      ? 'Educational TCI calculated infusion rate'
      : 'Scheduled delivery rate';
  if (tci.enabled || schedule.enabled) {
    const rateTrace = {
      x: ts.slice(0, N),
      y: simulation.intervalRates.map((rate) =>
        convertMgKgMinToInfusionValue(rate, currentInfusionUnit, params.weightKg),
      ),
      name: `${tci.enabled ? 'Calculated' : 'Scheduled'} rate (${currentInfusionUnit.name})`,
      line: { color: '#198754', width: 2, shape: 'hv' },
      fill: 'tozeroy',
      fillcolor: 'rgba(25, 135, 84, .12)',
    };
    renderPlot('tciRatePlot', [rateTrace], {
      margin: { l: 60, r: 30, t: 12, b: 42 },
      xaxis: { title: { text: 'Time (min)' } },
      yaxis: { title: { text: `Rate (${currentInfusionUnit.name})` } },
      showlegend: false,
    });
  }
}

function renderSimulationResults(simulation, params, pk, result) {
  const { ts, xs1, ces } = simulation;
  const N = ts.length - 1;
  const { k10, k12, k21, k13, k31 } = pk;
  const yFactor = currentUnit.factor;
  const unitLabel = currentUnit.name;
  const hasEffectSite = simulation.hasEffectSite;
  const trace_cp = { y: simulation.cp.map((v) => v * yFactor) };
  const trace_ce = hasEffectSite ? { y: simulation.ce.map((v) => v * yFactor) } : null;
  // Results
  const finalCp = roundToSignificantFigures((yFactor * xs1[N]) / params.Vd1, 3);
  const finalCe = hasEffectSite ? roundToSignificantFigures(yFactor * ces[N], 3) : null;
  pfinalhtml.innerHTML = finalCp;
  document.getElementById('keyFinalCp').textContent = finalCp;
  document.getElementById('keyFinalCe').textContent = hasEffectSite ? finalCe : 'Not modeled';
  document.getElementById('keyFinalCpUnit').textContent = unitLabel;
  document.getElementById('keyFinalCeUnit').textContent = hasEffectSite ? unitLabel : '';
  const peakCpIndex = trace_cp.y.reduce(
    (best, value, index, values) => (value > values[best] ? index : best),
    0,
  );
  const peakCeIndex = trace_ce
    ? trace_ce.y.reduce((best, value, index, values) => (value > values[best] ? index : best), 0)
    : null;
  document.getElementById('keyPeakCp').textContent = roundToSignificantFigures(
    trace_cp.y[peakCpIndex],
    3,
  );
  document.getElementById('keyPeakCe').textContent = trace_ce
    ? roundToSignificantFigures(trace_ce.y[peakCeIndex], 3)
    : 'Not modeled';
  document.getElementById('keyPeakCpUnit').textContent = unitLabel;
  document.getElementById('keyPeakCeUnit').textContent = hasEffectSite ? unitLabel : '';
  document.getElementById('keyTmaxCe').textContent = trace_ce
    ? roundToSignificantFigures(ts[peakCeIndex], 3)
    : 'N/A';
  const pss =
    params.Cl > 0 && simulation.finalActiveRate > 1e-12
      ? simulation.finalActiveRate / params.Cl
      : null;
  psshtml.textContent = pss == null ? 'N/A' : roundToSignificantFigures(yFactor * pss, 3);

  const rates = result.modelRates;
  alphahtml.textContent = roundToSignificantFigures(rates.alpha, 3);
  betahtml.textContent = roundToSignificantFigures(rates.beta, 3);
  gammahtml.textContent = roundToSignificantFigures(rates.gamma, 3);
  termhalflifehtml.textContent = roundToSignificantFigures(rates.terminalHalfLife, 3);
  document.getElementById('keyTerminalHalfLife').textContent = termhalflifehtml.textContent;

  k10html.innerHTML = roundToSignificantFigures(k10, 3);
  k12html.innerHTML = roundToSignificantFigures(k12, 3);
  k21html.innerHTML = roundToSignificantFigures(k21, 3);
  k13html.innerHTML = roundToSignificantFigures(k13, 3);
  k31html.innerHTML = roundToSignificantFigures(k31, 3);
  Vd1numhtml.innerHTML = roundToSignificantFigures(params.Vd1, 3);
  Vd2numhtml.innerHTML = roundToSignificantFigures(params.Vd2, 3);
  Vd3numhtml.innerHTML = roundToSignificantFigures(params.Vd3, 3);
  Q2numhtml.innerHTML = roundToSignificantFigures(params.Vd1 * k12, 3);
  Q3numhtml.innerHTML = roundToSignificantFigures(params.Vd1 * k13, 3);
  Clnumhtml.innerHTML = roundToSignificantFigures(params.Vd1 * k10, 3);

  const cshl = result.contextHalfTime;
  contextsensitivehalflifehtml.textContent =
    cshl == null ? 'N/A' : roundToSignificantFigures(cshl, 3);
  document.getElementById('keyContextHalfLife').textContent =
    contextsensitivehalflifehtml.textContent;
}
