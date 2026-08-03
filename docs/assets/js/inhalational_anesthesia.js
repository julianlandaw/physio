/* Copyright (c) 2026 Julian W. Landaw | SPDX-License-Identifier: MIT */
(() => {
  'use strict';
  const AGENTS = {
    sevoflurane: { label: 'Sevoflurane', bloodGas: 0.65, mac: 2.1, vaporizer: 2, note: 'Low blood solubility produces relatively rapid wash-in. Reference MAC is an adult educational value.' },
    desflurane: { label: 'Desflurane', bloodGas: 0.42, mac: 6.0, vaporizer: 6, note: 'Very low blood solubility produces rapid wash-in and washout in this model.' },
    isoflurane: { label: 'Isoflurane', bloodGas: 1.4, mac: 1.15, vaporizer: 1.2, note: 'Higher blood solubility slows alveolar wash-in relative to sevoflurane and desflurane.' },
    nitrousOxide: { label: 'Nitrous oxide', bloodGas: 0.47, mac: 104, vaporizer: 50, note: 'This simplified model does not include concentration or second-gas effects, diffusion hypoxia, or oxygen safety limits.' }
  };
  const $ = id => document.getElementById(id);
  const numeric = id => Math.max(0, Number($(id).value) || 0);
  const params = () => ({ agent: $('agent').value, vaporizer: numeric('vaporizer') / 100, fgf: numeric('fgf'), offTime: numeric('offTime'), va: numeric('va'), frc: numeric('frc'), circuit: numeric('circuitVolume'), co: numeric('co'), duration: Math.min(360, Math.max(1, numeric('duration'))) });
  const round = n => Number.isFinite(n) ? n.toFixed(n >= 10 ? 1 : 2) : '—';

  function derivative(y, p, drug, t) {
    const [fi, fa, vrg, muscle, fat] = y;
    const qVrg = p.co * 0.75, qMuscle = p.co * 0.20, qFat = p.co * 0.05;
    const fv = (qVrg * vrg + qMuscle * muscle + qFat * fat) / Math.max(p.co, 1e-9);
    const vapor = t < p.offTime ? p.vaporizer : 0;
    const uptake = p.co * drug.bloodGas * Math.max(0, fa - fv);
    return [
      (p.fgf * (vapor - fi) - p.va * (fi - fa)) / Math.max(p.circuit, .05),
      (p.va * (fi - fa) - uptake) / Math.max(p.frc, .05),
      qVrg * (fa - vrg) / (6 * 1.7),
      qMuscle * (fa - muscle) / (35 * 3.0),
      qFat * (fa - fat) / (18 * 25)
    ];
  }
  function add(y, k, scale) { return y.map((value, i) => value + k[i] * scale); }
  function rk4(y, p, drug, t, dt) {
    const k1 = derivative(y, p, drug, t); const k2 = derivative(add(y, k1, dt / 2), p, drug, t + dt / 2);
    const k3 = derivative(add(y, k2, dt / 2), p, drug, t + dt / 2); const k4 = derivative(add(y, k3, dt), p, drug, t + dt);
    return y.map((value, i) => Math.max(0, value + dt * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]) / 6));
  }
  function simulate(p) {
    const drug = AGENTS[p.agent], dt = .05, n = Math.ceil(p.duration / dt), y = [0, 0, 0, 0, 0];
    const out = { t: [], fi: [], fa: [], vrg: [], muscle: [], fat: [], uptake: [], vapor: [] };
    for (let i = 0; i <= n; i++) {
      const t = Math.min(p.duration, i * dt); const d = derivative(y, p, drug, t);
      out.t.push(t); out.fi.push(y[0]); out.fa.push(y[1]); out.vrg.push(y[2]); out.muscle.push(y[3]); out.fat.push(y[4]); out.uptake.push(Math.max(0, p.frc * -d[1] + p.va * (y[0] - y[1]))); out.vapor.push(t < p.offTime ? p.vaporizer : 0);
      if (i < n) { const next = rk4(y, p, drug, t, dt); y.splice(0, y.length, ...next); }
    }
    return out;
  }
  const trace = (x, y, name, color, dash) => ({ x, y: y.map(value => value * 100), name, line: { color, width: 2, dash: dash || 'solid' }, hovertemplate: '%{y:.2f}% at %{x:.1f} min<extra>' + name + '</extra>' });
  function plot(p, data) {
    const drug = AGENTS[p.agent], base = { paper_bgcolor: '#fff', plot_bgcolor: '#fff', margin: { l: 60, r: 22, t: 16, b: 48 }, font: { family: 'system-ui, sans-serif', color: '#172033' }, xaxis: { title: 'Time (min)', gridcolor: '#e8eef6' }, yaxis: { gridcolor: '#e8eef6' }, legend: { orientation: 'h', y: -0.23 } }, config = { responsive: true, displaylogo: false };
    Plotly.react('fractionPlot', [trace(data.t, data.vapor, 'Vaporizer setting', '#94a3b8', 'dash'), trace(data.t, data.fi, 'Inspired / circuit', '#2563eb'), trace(data.t, data.fa, 'Alveolar / end-tidal', '#0f766e'), trace(data.t, data.vrg, 'Vessel-rich equivalent', '#d97706')], { ...base, yaxis: { ...base.yaxis, title: 'Fraction (vol%)' } }, config);
    Plotly.react('tissuePlot', [trace(data.t, data.vrg, 'Vessel-rich', '#d97706'), trace(data.t, data.muscle, 'Muscle', '#7c3aed'), trace(data.t, data.fat, 'Fat', '#db2777')], { ...base, yaxis: { ...base.yaxis, title: 'Partial-pressure equivalent (vol%)' } }, config);
    Plotly.react('uptakePlot', [{ x: data.t, y: data.uptake, name: 'Pulmonary uptake', line: { color: '#0891b2', width: 2 }, fill: 'tozeroy', fillcolor: 'rgba(8,145,178,.15)', hovertemplate: '%{y:.3f} L-equivalent/min<extra>Uptake</extra>' }], { ...base, showlegend: false, yaxis: { ...base.yaxis, title: 'Uptake (L-equivalent/min)' } }, config);
    const last = data.t.length - 1, fi = data.fi[last], fa = data.fa[last];
    $('metricFi').textContent = `${round(fi * 100)}%`; $('metricFa').textContent = `${round(fa * 100)}%`; $('metricVrg').textContent = `${round(data.vrg[last] * 100)}%`; $('metricMac').textContent = round((fa * 100) / drug.mac); $('metricRatio').textContent = fi > 0.00001 ? round(fa / fi) : '—';
  }
  function render() { const p = params(), drug = AGENTS[p.agent]; $('bloodGas').textContent = round(drug.bloodGas); $('mac').textContent = `${drug.mac}%`; $('agentNote').textContent = drug.note; plot(p, simulate(p)); }
  function selectAgent() { const drug = AGENTS[$('agent').value]; $('vaporizer').value = drug.vaporizer; render(); }
  function reset() { $('agent').value = 'sevoflurane'; $('vaporizer').value = 2; $('fgf').value = 4; $('offTime').value = 60; $('va').value = 4; $('frc').value = 2.5; $('circuitVolume').value = 2; $('co').value = 5; $('duration').value = 120; render(); }
  Object.entries(AGENTS).forEach(([id, drug]) => $('agent').append(new Option(drug.label, id)));
  $('agent').value = 'sevoflurane'; $('agent').addEventListener('change', selectAgent); ['vaporizer','fgf','offTime','va','frc','circuitVolume','co','duration'].forEach(id => $(id).addEventListener('change', render)); $('resetBtn').addEventListener('click', reset);
  window.addEventListener('resize', () => {
    ['fractionPlot', 'tissuePlot', 'uptakePlot'].forEach(id => Plotly.Plots.resize($(id)));
  });
  render();
})();
