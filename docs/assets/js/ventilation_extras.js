/* Copyright (c) 2026 Julian W. Landaw | SPDX-License-Identifier: MIT */
const ventPlayback = { active: false, time: 0, frame: null, last: null, painted: null };
let ventCO2Seed = null;
let ventForceRun = false;
const ventLoopCoordinates = new Map();
function ventAligned() {
  return Boolean(
    ventBaseline &&
      ventRun?.completeBreaths[ventBreathIndex] &&
      ventElement('comparisonMode').value === 'aligned' &&
      ventElement('viewWindow').value !== 'monitor',
  );
}
function syncVentTiming(fraction, rate) {
  const mode = ventElement('timingMode').value;
  ventElement('timingValue').value =
    mode === 'ti' ? (fraction * 60) / rate : (1 - fraction) / fraction;
}
function updateVentTimingMode() {
  const mode = ventElement('timingMode').value,
    direct = mode !== 'fraction';
  ventInputs.get('IF').wrapper.hidden = direct;
  ventElement('timingValue').hidden = ventElement('timingValueLabel').hidden = !direct;
  ventElement('timingValueLabel').textContent =
    mode === 'ti' ? 'Inspiratory time (s)' : 'I:E ratio — enter E for 1:E';
  if (ventRun) syncVentTiming(ventRun.settings.IF, ventRun.settings.RR);
}
function preserveVentTi(rate) {
  if (!ventRun || !ventElement('keepTi').checked || !(rate > 0)) return;
  const fraction = (ventRun.timing.Ti * rate) / 60;
  ventInputs.get('IF').number.value = fraction;
  syncVentTiming(fraction, rate);
}
function stopVentPlayback() {
  ventPlayback.active = false;
  cancelAnimationFrame(ventPlayback.frame);
  ventPlayback.frame = null;
  ventPlayback.last = null;
  if (ventElement('playVent')) {
    ventElement('playVent').textContent = 'Play';
    ventElement('playVent').setAttribute('aria-pressed', 'false');
    ventElement('playbackStatus').textContent = `Paused · ${ventFormat(ventPlayback.time)} s`;
    ventElement('ventCursorValues').setAttribute('aria-live', 'polite');
    if (ventRun) ventElement('breathSelect').disabled = !ventRun.completeBreaths.length;
  }
}
function paintVentPlayback() {
  ventCursorTime = ventPlayback.time;
  ventBreathIndex = Math.min(
    ventRun.completeBreaths.length - 1,
    Math.floor((ventPlayback.time + 1e-9) / ventRun.timing.cycle) - 1,
  );
  drawVentilation();
  renderVentMetrics();
  drawVentLoops();
  renderBreathSelect();
  ventElement('playbackStatus').textContent =
    `${ventPlayback.active ? 'Playing' : 'Paused'} · ${ventFormat(ventPlayback.time)} / ${ventFormat(ventSettings.T, 0)} s`;
}
function advanceVentPlayback(timestamp) {
  if (!ventPlayback.active) return;
  if (ventPlayback.last != null)
    ventPlayback.time = Math.min(
      ventSettings.T,
      ventPlayback.time +
        (Math.max(0, timestamp - ventPlayback.last) / 1000) *
          Number(ventElement('playbackSpeed').value),
    );
  ventPlayback.last = timestamp;
  if (
    ventPlayback.painted == null ||
    timestamp - ventPlayback.painted >= 80 ||
    ventPlayback.time >= ventSettings.T
  ) {
    paintVentPlayback();
    ventPlayback.painted = timestamp;
  }
  if (ventPlayback.time >= ventSettings.T) {
    stopVentPlayback();
    return;
  }
  ventPlayback.frame = requestAnimationFrame(advanceVentPlayback);
}
function renderVentComparison() {
  const note = ventElement('baselineNote'),
    changes = ventElement('settingsChanges');
  if (!ventBaseline) {
    note.textContent = '';
    changes.textContent = '';
    return;
  }
  note.textContent = `Frozen breath ${ventBaseline.breath.index + 1}. ${ventAligned() ? 'Breaths align at inspiration start, using unscaled seconds; a shorter breath ends sooner.' : 'Curves use absolute run time.'} Δ means current minus baseline. CO₂ numbers refer to each selected breath, not its steady-state target.`;
  const differences = [];
  for (const key of Object.keys(Ventilation.defaults)) {
    if (ventSettings[key] === ventBaseline.run.settings[key]) continue;
    if ((key === 'PC' && ventMode === 'vcv') || (['VT', 'HF'].includes(key) && ventMode === 'pcv'))
      continue;
    const label = ventFields[key]?.[0] || key;
    differences.push(`${label}: ${ventBaseline.run.settings[key]} → ${ventSettings[key]}`);
  }
  changes.textContent = differences.length
    ? `Changed settings: ${differences.join('; ')}.`
    : 'No settings changed.';
}
function drawVentLoops() {
  if (!ventRun || !ventElement('loopsPanel').open) return;
  const b = ventRun.completeBreaths[ventBreathIndex];
  ventElement('loopCaption').textContent = b
    ? `Selected breath ${b.index + 1}. Time follows the arrow markers; loop clicks update the shared cursor.`
    : 'Complete a breath to display its loops.';
  for (const [id, kind] of [
    ['pvLoop', 'pv'],
    ['fvLoop', 'fv'],
  ]) {
    const svg = ventElement(id);
    svg.replaceChildren();
    if (!b) {
      ventLoopCoordinates.delete(id);
      continue;
    }
    const scale = ventElement('flowUnit').value === 'L/min' ? 60 : 1;
    const loopData = (run, breath) => [
      {
        t: breath.start,
        p: run.settings.PEEP,
        v: breath.V0 * 1000,
        f: -breath.regionV0.reduce((sum, v, i) => sum + v / run.timing.regions.tauE[i], 0),
      },
      ...ventVisiblePoints(run, breath.start, breath.end),
    ];
    const current = loopData(ventRun, b);
    const baseline = ventBaseline ? loopData(ventBaseline.run, ventBaseline.breath) : [];
    const points = [...current, ...baseline];
    const values = (point) => (kind === 'pv' ? [point.p, point.v] : [point.v, point.f * scale]);
    let xMax = 1,
      yMin = 0,
      yMax = 1;
    for (const point of points) {
      const [x, y] = values(point);
      xMax = Math.max(xMax, x);
      yMin = Math.min(yMin, y);
      yMax = Math.max(yMax, y);
    }
    xMax = ventNiceCeiling(xMax * 1.06);
    yMax = ventNiceCeiling(yMax * 1.06);
    yMin = yMin < 0 ? -ventNiceCeiling(-yMin * 1.06) : 0;
    const width = Math.max(260, svg.clientWidth || 350),
      height = 270,
      pad = { l: 46, r: 14, t: 26, b: 42 };
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const x = (v) => pad.l + (v / xMax) * (width - pad.l - pad.r),
      y = (v) => height - pad.b - ((v - yMin) / (yMax - yMin)) * (height - pad.t - pad.b);
    for (let i = 0; i <= 4; i++) {
      const xx = x((xMax * i) / 4),
        value = yMin + ((yMax - yMin) * i) / 4,
        yy = y(value);
      svg.append(
        ventSvg('line', { x1: xx, x2: xx, y1: pad.t, y2: height - pad.b, stroke: '#e7edf4' }),
        ventSvg('line', { x1: pad.l, x2: width - pad.r, y1: yy, y2: yy, stroke: '#e7edf4' }),
        ventSvg(
          'text',
          { x: xx, y: height - pad.b + 16, 'text-anchor': 'middle', 'font-size': 10 },
          Number(((xMax * i) / 4).toPrecision(3)),
        ),
        ventSvg(
          'text',
          { x: pad.l - 5, y: yy + 3, 'text-anchor': 'end', 'font-size': 10 },
          Number(value.toPrecision(3)),
        ),
      );
    }
    svg.append(
      ventSvg(
        'text',
        { x: pad.l, y: 15, 'font-size': 11 },
        kind === 'pv' ? 'Volume (mL)' : `Flow (${ventElement('flowUnit').value})`,
      ),
      ventSvg(
        'text',
        { x: width / 2, y: height - 5, 'text-anchor': 'middle', 'font-size': 11 },
        kind === 'pv' ? 'Airway pressure (cm H₂O)' : 'Volume (mL)',
      ),
    );
    const draw = (data, baselineTrace) => {
      let previous = null,
        phase = null,
        path = '';
      const flush = () => {
        if (path)
          svg.append(
            ventSvg('path', {
              d: path,
              fill: 'none',
              stroke: baselineTrace ? '#718096' : phase === 'expiration' ? '#9a5105' : '#2563eb',
              'stroke-width': 2,
              ...(baselineTrace ? { 'stroke-dasharray': '4 4' } : {}),
              'data-loop-phase': phase,
              'data-baseline': baselineTrace,
            }),
          );
      };
      for (const point of data) {
        const position = values(point),
          ph = point.f < 0 ? 'expiration' : 'inspiration';
        if (ph !== phase) {
          flush();
          path = '';
          phase = ph;
          if (previous) {
            const v = values(previous);
            path = `M${x(v[0])},${y(v[1])} `;
          }
        }
        path += `${path ? 'L' : 'M'}${x(position[0])},${y(position[1])} `;
        previous = point;
      }
      flush();
      if (!baselineTrace)
        for (const fraction of [0.15, 0.7]) {
          const t = b.start + fraction * (b.end - b.start),
            a = values(Ventilation.sample(ventRun, t)),
            z = values(Ventilation.sample(ventRun, Math.min(b.end, t + 0.03)));
          const angle = (Math.atan2(y(z[1]) - y(a[1]), x(z[0]) - x(a[0])) * 180) / Math.PI;
          svg.append(
            ventSvg('polygon', {
              points: '-4,-3 4,0 -4,3',
              transform: `translate(${x(a[0])},${y(a[1])}) rotate(${angle})`,
              fill: fraction < 0.5 ? '#2563eb' : '#9a5105',
            }),
          );
        }
    };
    if (baseline.length) draw(baseline, true);
    draw(current, false);
    svg.append(
      ventSvg('circle', {
        class: 'loop-cursor',
        r: 4,
        fill: '#b42355',
        stroke: '#fff',
        'stroke-width': 1,
      }),
    );
    ventLoopCoordinates.set(id, { x, y, values, b, current });
  }
  updateVentLoopCursor(ventCursorTime);
}
function updateVentLoopCursor(time) {
  for (const [id, q] of ventLoopCoordinates) {
    const marker = ventElement(id).querySelector('.loop-cursor');
    if (!marker) continue;
    const inside = time >= q.b.start && time <= q.b.end;
    marker.setAttribute('visibility', inside ? 'visible' : 'hidden');
    if (inside) {
      const v = q.values(Ventilation.sample(ventRun, time));
      marker.setAttribute('cx', q.x(v[0]));
      marker.setAttribute('cy', q.y(v[1]));
    }
  }
}
function initVentExtras() {
  ventElement('playbackStatus').setAttribute('aria-live', 'off');
  ventElement('timingMode').addEventListener('change', () => {
    updateVentTimingMode();
    simulateAndDraw();
  });
  ventElement('timingValue').addEventListener('input', simulateAndDraw);
  ventElement('timingValue').setAttribute('aria-describedby', 'timingError');
  ventElement('comparisonMode').addEventListener('change', () => {
    stopVentPlayback();
    refreshVentView();
  });
  ventElement('showTeaching').addEventListener('change', refreshVentView);
  ventElement('loopsPanel').addEventListener('toggle', drawVentLoops);
  for (const id of ['pvLoop', 'fvLoop']) {
    ventElement(id).addEventListener('pointerdown', (event) => {
      stopVentPlayback();
      const q = ventLoopCoordinates.get(id);
      if (!q) return;
      const rect = ventElement(id).getBoundingClientRect(),
        box = ventElement(id).viewBox.baseVal;
      const px = ((event.clientX - rect.left) * box.width) / rect.width,
        py = ((event.clientY - rect.top) * box.height) / rect.height;
      let nearest = null,
        distance = Infinity;
      for (const p of q.current) {
        const v = q.values(p),
          d = (q.x(v[0]) - px) ** 2 + (q.y(v[1]) - py) ** 2;
        if (d < distance) {
          distance = d;
          nearest = p;
        }
      }
      if (nearest) updateVentCursor(nearest.t);
    });
    ventElement(id).addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const q = ventLoopCoordinates.get(id);
      if (!q) return;
      stopVentPlayback();
      updateVentCursor(
        event.key === 'Home'
          ? q.b.start
          : event.key === 'End'
            ? q.b.end
            : Math.max(
                q.b.start,
                Math.min(q.b.end, ventCursorTime + (event.key === 'ArrowRight' ? 0.1 : -0.1)),
              ),
      );
    });
  }
  ventElement('playVent').addEventListener('click', () => {
    if (ventPlayback.active) {
      stopVentPlayback();
      return;
    }
    if (!ventValid) return;
    if (ventPlayback.time >= ventSettings.T) ventPlayback.time = 0;
    ventElement('viewWindow').value = 'monitor';
    ventPlayback.active = true;
    ventPlayback.last = null;
    ventPlayback.painted = null;
    ventElement('playVent').textContent = 'Pause';
    ventElement('ventCursorValues').setAttribute('aria-live', 'off');
    ventElement('playVent').setAttribute('aria-pressed', 'true');
    paintVentPlayback();
    ventPlayback.frame = requestAnimationFrame(advanceVentPlayback);
  });
  ventElement('rewindVent').addEventListener('click', () => {
    stopVentPlayback();
    ventPlayback.time = 0;
    ventElement('viewWindow').value = 'monitor';
    paintVentPlayback();
  });
  ventElement('viewWindow').addEventListener('change', () => {
    stopVentPlayback();
    if (ventElement('viewWindow').value === 'monitor') paintVentPlayback();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopVentPlayback();
  });
  for (const id of ['ventCursor', 'ventCursorSlider', 'plot'])
    ventElement(id).addEventListener('pointerdown', stopVentPlayback);
  for (const id of ['ventCursor', 'ventCursorSlider'])
    ventElement(id).addEventListener('input', stopVentPlayback);
  ventElement('plot').addEventListener('keydown', (event) => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) stopVentPlayback();
  });
  ventElement('continueCO2').addEventListener('click', () => {
    if (!ventBaseline || !ventValid) return;
    stopVentPlayback();
    ventCO2Seed = structuredClone(ventBaseline.breath.co2State);
    ventForceRun = true;
    ventElement('co2StartNote').textContent =
      'CO₂ starts from the frozen run’s selected breath end: lung/tissue concentrations and airway contents. Mechanics restart from the selected lung state. Reset restores the initial-pressure start. This state is local to this page.';
    simulateAndDraw();
  });
}
