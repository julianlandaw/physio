/* Copyright (c) 2026 Julian W. Landaw | SPDX-License-Identifier: MIT */
let ventLockedAxes = null,
  ventCurrentAxes = null,
  ventAxesFlowScale = 60,
  ventPlotCoordinates = null;
const ventColors = { p: '#2563eb', v: '#0f766e', f: '#9a5105', palv: '#b42355', co2: '#7c3aed' };
function ventSvg(tag, attributes = {}, text) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
  if (text != null) node.textContent = text;
  return node;
}
function ventNiceCeiling(value) {
  if (!(value > 0)) return 1;
  const power = 10 ** Math.floor(Math.log10(value)),
    unit = value / power;
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power;
}
function ventVisiblePoints(run, start, end) {
  start = Math.max(0, start);
  end = Math.min(run.settings.T, end);
  if (end < start) return [];
  const points = [Ventilation.sample(run, start)];
  for (let i = 0; i < run.t.length; i++)
    if (run.t[i] > start && run.t[i] < end)
      points.push({
        t: run.t[i],
        p: run.p[i],
        v: run.v[i],
        f: run.f[i],
        palv: run.palv[i],
        co2: run.co2[i],
        alveolarCO2: run.alveolarCO2[i],
      });
  points.push(Ventilation.sample(run, end, 'left'));
  return points;
}
function drawVentilation() {
  if (!ventRun) return;
  const svg = ventElement('plot'),
    width = svg.clientWidth || 800,
    height = svg.clientHeight || 660;
  const [start, end] = ventWindow(),
    scale = ventElement('flowUnit').value === 'L/min' ? 60 : 1,
    showAlveolar = ventElement('showAlveolar').checked;
  const selected = ventRun.completeBreaths[ventBreathIndex];
  const limit =
    ventElement('viewWindow').value === 'monitor'
      ? ventPlayback.time
      : ventAligned()
        ? selected.end
        : end;
  const current = ventVisiblePoints(ventRun, start, Math.min(end, limit));
  const before = ventAligned()
    ? ventVisiblePoints(ventBaseline.run, ventBaseline.breath.start, ventBaseline.breath.end).map(
        (p) => ({ ...p, t: p.t + selected.start - ventBaseline.breath.start }),
      )
    : ventBaseline
      ? ventVisiblePoints(ventBaseline.run, start, Math.min(end, ventBaseline.run.settings.T))
      : [];
  // Only draw baseline data in the time range actually simulated for it.
  const baselinePoints =
    ventAligned() || (ventBaseline && start < ventBaseline.run.settings.T) ? before : [];
  let pressure = 1,
    volume = 1,
    flow = 0.1,
    co2 = 40;
  for (const point of [...current, ...baselinePoints]) {
    pressure = Math.max(pressure, point.p, showAlveolar ? point.palv : 0);
    volume = Math.max(volume, point.v);
    flow = Math.max(flow, Math.abs(point.f * scale));
    if (point.co2 != null) co2 = Math.max(co2, point.co2);
  }
  const fresh = {
    p: [0, ventNiceCeiling(pressure * 1.08)],
    v: [0, ventNiceCeiling(volume * 1.08)],
    f: [-ventNiceCeiling(flow * 1.08), ventNiceCeiling(flow * 1.08)],
    co2: [0, ventNiceCeiling(co2 * 1.08)],
  };
  if (ventElement('lockAxes').checked) {
    if (!ventLockedAxes) ventLockedAxes = structuredClone(ventCurrentAxes || fresh);
    if (scale !== ventAxesFlowScale)
      ventLockedAxes.f = ventLockedAxes.f.map((value) => (value * scale) / ventAxesFlowScale);
  } else ventLockedAxes = null;
  const axes = ventLockedAxes || fresh;
  ventCurrentAxes = structuredClone(axes);
  ventAxesFlowScale = scale;
  let clipped = false;
  for (const point of [...current, ...baselinePoints])
    for (const key of ['p', 'v', 'f', 'co2', ...(showAlveolar ? ['palv'] : [])]) {
      if (point[key] == null) continue;
      const axis = axes[key === 'palv' ? 'p' : key],
        value = point[key] * (key === 'f' ? scale : 1);
      if (value < axis[0] - 1e-9 || value > axis[1] + 1e-9) clipped = true;
    }
  ventElement('axisNote').hidden = !clipped;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.replaceChildren();
  const pad = { l: 49, r: 12, t: 20, b: 32 },
    gap = 32,
    panelHeight = (height - pad.t - pad.b - 3 * gap) / 4;
  const x = (time) => pad.l + ((time - start) / (end - start)) * (width - pad.l - pad.r);
  const panels = [
    ['p', 'Airway pressure (cm H₂O)'],
    ['v', 'Volume above set-PEEP equilibrium (mL)'],
    ['f', `Flow (${ventElement('flowUnit').value})`],
    [
      'co2',
      ventSettings.capnogramShape === 'transport'
        ? 'CO₂ capnogram (mmHg; dynamic model)'
        : 'CO₂ capnogram (mmHg; illustrative)',
    ],
  ];
  const definitions = ventSvg('defs');
  svg.append(definitions);
  panels.forEach(([key, label], index) => {
    const top = pad.t + index * (panelHeight + gap),
      [min, max] = axes[key];
    const y = (value) => top + panelHeight - ((value - min) / (max - min)) * panelHeight;
    const clip = ventSvg('clipPath', { id: `ventClip${index}` });
    clip.append(
      ventSvg('rect', { x: pad.l, y: top, width: width - pad.l - pad.r, height: panelHeight }),
    );
    definitions.append(clip);
    const group = ventSvg('g', { 'clip-path': `url(#ventClip${index})` });
    svg.append(group);
    for (const b of ventRun.breaths) {
      const phases = [[b.start, b.start + ventRun.timing.Tflow, '#2563eb', 0.045]];
      if (ventRun.timing.Th > 0)
        phases.push([b.start + ventRun.timing.Tflow, b.start + ventRun.timing.Ti, '#b7791f', 0.1]);
      for (const [from, to, color, opacity] of phases) {
        const a = Math.max(start, from),
          z = Math.min(end, to, limit);
        if (z > a)
          group.append(
            ventSvg('rect', {
              x: x(a),
              y: top,
              width: x(z) - x(a),
              height: panelHeight,
              fill: color,
              opacity,
            }),
          );
      }
    }
    for (let g = 0; g <= 4; g++) {
      const value = min + ((max - min) * g) / 4,
        yy = y(value);
      svg.append(
        ventSvg('line', { x1: pad.l, x2: width - pad.r, y1: yy, y2: yy, stroke: '#e7edf4' }),
      );
      svg.append(
        ventSvg(
          'text',
          { x: pad.l - 6, y: yy + 4, fill: '#52627a', 'font-size': 10, 'text-anchor': 'end' },
          Number(value.toPrecision(3)),
        ),
      );
    }
    svg.append(
      ventSvg(
        'text',
        { x: pad.l, y: top - 7, fill: '#172033', 'font-size': width < 500 ? 10 : 12 },
        label,
      ),
    );
    if (key === 'f')
      group.append(
        ventSvg('line', { x1: pad.l, x2: width - pad.r, y1: y(0), y2: y(0), stroke: '#9aa9bc' }),
      );
    if (key === 'p') {
      group.append(
        ventSvg('line', {
          x1: pad.l,
          x2: width - pad.r,
          y1: y(ventSettings.PEEP),
          y2: y(ventSettings.PEEP),
          stroke: '#718096',
          'stroke-dasharray': '4 4',
        }),
      );
      svg.append(
        ventSvg(
          'text',
          {
            x: width - pad.r - 3,
            y: Math.max(top + 10, y(ventSettings.PEEP) - 4),
            fill: '#52627a',
            'font-size': 9,
            'text-anchor': 'end',
          },
          `Set PEEP ${ventFormat(ventSettings.PEEP, 1)}`,
        ),
      );
    }
    const trace = (points, field, color, baseline = false) => {
      if (!points.length) return;
      let connected = false;
      const path = points
        .map((point) => {
          if (point[field] == null || !Number.isFinite(point[field])) {
            connected = false;
            return '';
          }
          const command = connected ? 'L' : 'M';
          connected = true;
          return `${command}${x(point.t).toFixed(3)},${y(point[field] * (field === 'f' ? scale : 1)).toFixed(3)}`;
        })
        .join(' ');
      if (!path.trim()) return;
      group.append(
        ventSvg('path', {
          d: path,
          fill: 'none',
          stroke: color,
          'stroke-width': baseline ? 1.7 : 2.2,
          'data-signal': field,
          'data-baseline': baseline,
          ...(baseline ? { 'stroke-dasharray': '5 4', opacity: 0.8 } : {}),
        }),
      );
    };
    trace(baselinePoints, key, '#718096', true);
    trace(current, key, ventColors[key]);
    if (key === 'co2') {
      const et = selected?.metrics.EtCO2;
      svg.append(
        ventSvg(
          'text',
          {
            x: width - pad.r - 3,
            y: top + 12,
            fill: ventColors.co2,
            'font-size': 10,
            'text-anchor': 'end',
          },
          et == null ? 'EtCO₂: complete a breath' : `Selected EtCO₂ ${ventFormat(et, 1)} mmHg`,
        ),
      );
      if (et != null)
        for (const b of ventRun.breaths) {
          if (
            b.complete &&
            b.metrics.EtCO2 != null &&
            b.end > start &&
            b.end <= Math.min(end, limit) + 1e-9
          )
            group.append(
              ventSvg('circle', {
                class: 'vent-etco2-marker',
                cx: x(b.end),
                cy: y(b.metrics.EtCO2),
                r: 2.6,
                fill: ventColors.co2,
              }),
            );
        }
    }
    if (key === 'p' && showAlveolar) {
      trace(baselinePoints, 'palv', '#a6768a', true);
      trace(current, 'palv', ventColors.palv);
    }
    if (ventElement('showTeaching').checked && selected && selected.end <= limit + 1e-9)
      drawVentAnnotations(svg, group, key, selected, x, y, top, panelHeight, width, pad);
    for (let g = 0; g <= 4; g++) {
      const time = start + ((end - start) * g) / 4;
      svg.append(
        ventSvg('line', {
          x1: x(time),
          x2: x(time),
          y1: top,
          y2: top + panelHeight,
          stroke: '#eef2f7',
          'pointer-events': 'none',
        }),
      );
    }
    svg.append(
      ventSvg('line', {
        class: 'vent-cursor-line',
        x1: x(start),
        x2: x(start),
        y1: top,
        y2: top + panelHeight,
        stroke: '#64748b',
        'stroke-dasharray': '2 3',
        'pointer-events': 'none',
      }),
    );
  });
  for (let i = 0; i <= 4; i++) {
    const time = start + ((end - start) * i) / 4;
    svg.append(
      ventSvg(
        'text',
        { x: x(time), y: height - 15, 'text-anchor': 'middle', 'font-size': 10, fill: '#52627a' },
        Number((ventAligned() ? time - start : time).toFixed(2)),
      ),
    );
  }
  svg.append(
    ventSvg(
      'text',
      {
        x: pad.l + (width - pad.l - pad.r) / 2,
        y: height - 2,
        'text-anchor': 'middle',
        'font-size': 10,
        fill: '#52627a',
      },
      ventAligned() ? 'Time from inspiration (s)' : 'Time (s)',
    ),
  );
  ventElement('alveolarLegend').hidden = !showAlveolar;
  ventPlotCoordinates = { x, start, end, pad, width };
  ventCursorTime = Math.max(start, Math.min(end, ventSettings.T, ventCursorTime));
  updateVentCursor();
  if (!svg.dataset.cursorReady) {
    svg.dataset.cursorReady = 'true';
    svg.setAttribute('tabindex', '0');
    const inspect = (event) => {
      const rect = svg.getBoundingClientRect(),
        q = ventPlotCoordinates;
      const px = ((event.clientX - rect.left) * q.width) / rect.width;
      const fraction = Math.max(0, Math.min(1, (px - q.pad.l) / (q.width - q.pad.l - q.pad.r)));
      updateVentCursor(Number((q.start + fraction * (q.end - q.start)).toFixed(4)));
    };
    svg.addEventListener('pointerdown', inspect);
    svg.addEventListener('pointermove', (event) => {
      if (event.buttons === 1) inspect(event);
    });
    svg.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const q = ventPlotCoordinates;
      updateVentCursor(
        event.key === 'Home'
          ? q.start
          : event.key === 'End'
            ? q.end
            : Math.max(
                q.start,
                Math.min(q.end, ventCursorTime + (event.key === 'ArrowRight' ? 0.1 : -0.1)),
              ),
      );
    });
  }
}
function drawVentAnnotations(svg, group, key, b, x, y, top, panelHeight, width, pad) {
  const q = ventRun.timing,
    m = b.metrics;
  const label = (text, row = 0) =>
    svg.append(
      ventSvg(
        'text',
        {
          class: 'teaching-label',
          x: pad.l + 5,
          y: top + 13 + row * 13,
          'font-size': 10,
          fill: '#172033',
          stroke: '#fff',
          'stroke-width': 3,
          'paint-order': 'stroke',
        },
        text,
      ),
    );
  const mark = (t, value) =>
    group.append(ventSvg('circle', { cx: x(t), cy: y(value), r: 3, fill: '#b42355' }));
  if (key === 'p') {
    label(
      `Peak ${ventFormat(m.Peak)}${m.Plateau == null ? '' : ` · ${ventSettings.regionRatio > 1 ? 'end hold' : 'plateau'} ${ventFormat(m.Plateau)}`} cm H₂O`,
    );
    label(
      m.Plateau == null
        ? 'Plateau requires a VCV hold'
        : `Instant resistive drop ${ventFormat(m.ResistiveDrop)} cm H₂O`,
      1,
    );
    const t = b.start + (ventMode === 'vcv' ? q.Tflow : q.Ti / 2);
    mark(t, m.Peak);
    if (m.Plateau != null) mark(b.start + q.Tflow + q.Th / 2, m.Plateau);
    label(`End total PEEP (alveolar) ${ventFormat(ventSettings.PEEP + m.Intrinsic)} cm H₂O`, 2);
  }
  if (key === 'f') {
    const scale = ventElement('flowUnit').value === 'L/min' ? 60 : 1,
      f = Ventilation.sample(ventRun, b.end, 'left').f * scale;
    mark(b.end, f);
    label(`End-expiratory flow ${ventFormat(f, 2)} ${ventElement('flowUnit').value}`);
    if (Math.abs(f) > 0.1) label('Flow persists at the next inspiration', 1);
  }
  if (key === 'v') {
    label(`Delivered ${ventFormat(m.VT, 0)} mL · expired ${ventFormat(m.Expired, 0)} mL`);
    if (q.Th > 0) label(`Inspiratory hold ${ventFormat(q.Th, 2)} s: flow = 0`, 1);
  }
  if (key === 'co2') {
    const data = ventVisiblePoints(ventRun, b.start + q.Ti, b.end);
    for (const [name, test] of [
      ['I', (p) => p.co2 < 2],
      ['II', (p) => p.co2 >= 2 && p.co2 < 0.85 * p.alveolarCO2],
      ['III', (p) => p.co2 >= 0.85 * p.alveolarCO2],
    ]) {
      const point = data.find((p) => p.co2 != null && test(p));
      if (point)
        svg.append(
          ventSvg(
            'text',
            {
              class: 'teaching-label',
              x: x(point.t) + 2,
              y: top + panelHeight - 5 - (name.length - 1) * 13,
              'font-size': 10,
              fill: '#7c3aed',
            },
            name,
          ),
        );
    }
  }
}
function updateVentCursorLines(time) {
  if (!ventPlotCoordinates) return;
  const x = ventPlotCoordinates.x(time);
  ventElement('plot')
    .querySelectorAll('.vent-cursor-line')
    .forEach((line) => {
      line.setAttribute('x1', x);
      line.setAttribute('x2', x);
    });
}
