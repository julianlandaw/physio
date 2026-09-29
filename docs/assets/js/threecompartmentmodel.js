/*
   Copyright (c) 2026 Julian W. Landaw
   SPDX-License-Identifier: MIT
*/

/* threecompartmentmodel.js
   Clean UI wiring + existing PK/PD model logic.
   Notes:
   - Keeps your internal math the same.
   - Adds: categorized drug preset picker, right drawer.
*/

// ============================
// Small helpers
// ============================
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

function parseFloatSafe(v, defVal = 0) {
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : defVal;
}

function clamp(x, lo, hi) { return Math.min(Math.max(x, lo), hi); }

function roundToSignificantFigures(num, sigFigs) {
  if (num === 0) return 0;
  const magnitude = math.floor(math.log10(Math.abs(num)));
  const factor = 10 ** (sigFigs - magnitude - 1);
  return math.round(num * factor) / factor;
}

const MAX_SIMULATION_MINUTES = 1440;
const SIMULATION_STEP_MINUTES = 0.1;
const TIME_EPSILON = 1e-9;
const MAX_VISIBLE_SCHEDULE_SEGMENTS = 80;
let tciImportSession = null;
let latestPdfContext = null;

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildSimulationTimes(finalTime, eventTimes = [], step = SIMULATION_STEP_MINUTES) {
  const tfinal = Math.max(0, parseFloatSafe(finalTime, 0));
  const times = [0, tfinal];
  for (let t = step; t < tfinal - TIME_EPSILON; t += step) {
    times.push(Math.min(t, tfinal));
  }
  eventTimes.forEach(value => {
    const time = Number(value);
    if (Number.isFinite(time) && time > TIME_EPSILON && time < tfinal - TIME_EPSILON) times.push(time);
  });
  times.sort((a, b) => a - b);
  return times.filter((time, index) => index === 0 || Math.abs(time - times[index - 1]) > TIME_EPSILON);
}

function createTransition(pk, ke0, duration, cache = new Map()) {
  const dt = Math.max(0, duration);
  const cacheKey = dt.toFixed(12);
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  const mat = math.matrix([
    [ -dt*(pk.k10 + pk.k12 + pk.k13), dt*pk.k21, dt*pk.k31, 0, dt ],
    [ dt*pk.k12, -dt*pk.k21, 0, 0, 0 ],
    [ dt*pk.k13, 0, -dt*pk.k31, 0, 0 ],
    [ dt*(ke0/pk.V1), 0, 0, -dt*ke0, 0 ],
    [ 0, 0, 0, 0, 0 ]
  ]);
  const M = math.expm(mat);
  const transition = {
    a11: M.subset(math.index(0,0)), a12: M.subset(math.index(0,1)), a13: M.subset(math.index(0,2)), a15: M.subset(math.index(0,4)),
    a21: M.subset(math.index(1,0)), a22: M.subset(math.index(1,1)), a23: M.subset(math.index(1,2)), a25: M.subset(math.index(1,4)),
    a31: M.subset(math.index(2,0)), a32: M.subset(math.index(2,1)), a33: M.subset(math.index(2,2)), a35: M.subset(math.index(2,4)),
    a41: M.subset(math.index(3,0)), a42: M.subset(math.index(3,1)), a43: M.subset(math.index(3,2)), a44: M.subset(math.index(3,3)), a45: M.subset(math.index(3,4))
  };
  cache.set(cacheKey, transition);
  return transition;
}

// ============================
// Drawer + collapsible cards
// ============================
function initDrawer() {
  const btn = $('#paramsBtn');
  const drawer = $('#paramsDrawer');
  const backdrop = $('#drawerBackdrop');
  const closeBtn = $('#drawerCloseBtn');
  let previousFocus = null;

  function setBackgroundInert(isInert) {
    ['appHeader', 'appContent'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.toggleAttribute('inert', isInert);
      el.setAttribute('aria-hidden', String(isInert));
    });
  }

  function openDrawer() {
    previousFocus = document.activeElement;
    document.body.classList.add('drawer-open');
    setBackgroundInert(true);
    btn?.setAttribute('aria-expanded', 'true');
    drawer?.setAttribute('aria-hidden', 'false');
    backdrop?.setAttribute('aria-hidden', 'false');
    // Allow Plotly to re-measure after drawer animation
    setTimeout(() => ['myDiv1','myDiv2','myDiv3','tciRatePlot'].forEach(id => {
      const el = document.getElementById(id);
      if (el && window.Plotly) Plotly.Plots.resize(el);
    }), 260);
    setTimeout(() => closeBtn?.focus(), 0);
  }

  function closeDrawer() {
    document.body.classList.remove('drawer-open');
    setBackgroundInert(false);
    btn?.setAttribute('aria-expanded', 'false');
    drawer?.setAttribute('aria-hidden', 'true');
    backdrop?.setAttribute('aria-hidden', 'true');
    const focusTarget = previousFocus && document.contains(previousFocus) ? previousFocus : btn;
    focusTarget?.focus?.();
  }

  btn?.addEventListener('click', openDrawer);
  closeBtn?.addEventListener('click', closeDrawer);
  backdrop?.addEventListener('click', closeDrawer);
  window.addEventListener('keydown', (e) => {
    if (!document.body.classList.contains('drawer-open')) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeDrawer();
      return;
    }
    if (e.key !== 'Tab' || !drawer) return;
    const focusable = $$('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])', drawer)
      .filter(el => el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  // Collapse cards (simple)
  $$('.card-header[data-collapse="true"]').forEach(h => {
    h.addEventListener('click', () => {
      const body = h.nextElementSibling;
      const icon = h.querySelector('.toggle-icon');
      if (!body) return;
      const isHidden = body.style.display === 'none';
      body.style.display = isHidden ? 'block' : 'none';
      if (icon) icon.textContent = isHidden ? '▼' : '▲';
      h.setAttribute('aria-expanded', String(isHidden));
      // Resize Plotly if plots are inside (they are not), but keep safe
      setTimeout(() => ['myDiv1','myDiv2','myDiv3','tciRatePlot'].forEach(id => {
        const el = document.getElementById(id);
        if (el && window.Plotly) Plotly.Plots.resize(el);
      }), 50);
    });
  });

  // Keep every parameter section collapsed until the user chooses to open it.
  const collapseById = (id, collapsed=true) => {
    const card = document.getElementById(id);
    if (!card) return;
    const header = card.querySelector('.card-header');
    const body = header?.nextElementSibling;
    const icon = header?.querySelector('.toggle-icon');
    if (!body) return;
    body.style.display = collapsed ? 'none' : 'block';
    if (icon) icon.textContent = collapsed ? '▲' : '▼';
    header?.setAttribute('aria-expanded', String(!collapsed));
  };
  collapseById('parameterCard', true);
  collapseById('tciCard', true);
  collapseById('testRegimenCard', true);
  collapseById('scheduleCard', true);
  collapseById('compareCard', true);
  collapseById('simulationCard', true);
  collapseById('volumeCard', true);
  collapseById('pharmCard', true);
}

// ============================
// Plot theme (light/dark) + scale toggle
// ============================
const lightLayout = {
  font: {family: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif', size: 14, color: '#333'},
  paper_bgcolor: '#ffffff',
  plot_bgcolor: '#f8f9fa',
  margin: {l: 60, r: 30, t: 55, b: 70},
  xaxis: { gridcolor: '#e9ecef', zerolinecolor: '#dee2e6', linecolor: '#adb5bd', mirror: true },
  yaxis: { gridcolor: '#e9ecef', zerolinecolor: '#dee2e6', linecolor: '#adb5bd', mirror: true },
  title: { font: {family: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif', size: 18, color: '#212529'} }
};

const darkLayout = {
  font: {family: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif', size: 14, color: '#e9ecef'},
  paper_bgcolor: '#121212',
  plot_bgcolor: '#1e1e1e',
  margin: {l: 60, r: 30, t: 55, b: 70},
  xaxis: { gridcolor: '#2a2a2a', zerolinecolor: '#444', linecolor: '#666', mirror: true },
  yaxis: { gridcolor: '#2a2a2a', zerolinecolor: '#444', linecolor: '#666', mirror: true },
  title: { font: {family: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif', size: 18, color: '#e9ecef'} }
};

function applyPlotTheme() {
  Plotly.defaults = { layout: document.body.classList.contains('dark-mode') ? darkLayout : lightLayout };
}

function toggleDarkMode() {
  document.body.classList.toggle('dark-mode');
  const btn = document.getElementById('darkModeBtnTop');
  if (btn) {
    const enabled = document.body.classList.contains('dark-mode');
    btn.setAttribute('aria-pressed', String(enabled));
    btn.textContent = enabled ? 'Light mode' : 'Dark mode';
  }
  applyPlotTheme();
  if (window.dfsolve) dfsolve();
}

let isLogScale = false;
function toggleScale() {
  isLogScale = !isLogScale;
  const newType = isLogScale ? 'log' : 'linear';
  Plotly.relayout('myDiv1', {'yaxis.type': newType});
  Plotly.relayout('myDiv2', {'yaxis.type': newType});
  Plotly.relayout('myDiv3', {'yaxis.type': newType});
  const btn = document.getElementById('scaleToggleBtnTop');
  if (btn) {
    btn.textContent = isLogScale ? 'Linear Y-axis' : 'Log Y-axis';
    btn.setAttribute('aria-pressed', String(isLogScale));
  }
}

// ============================
// DOM: labels and inputs (kept from your current JS)
// ============================
const Vd1html = document.getElementById("Vd1html");
Vd1html.innerHTML = "<i>V</i><sub>1</sub> (mL/kg)";
const Vd1num = document.getElementById("Vd1");
const Vd2html = document.getElementById("Vd2html");
Vd2html.innerHTML = "<i>V</i><sub>2</sub> (mL/kg)";
const Vd2num = document.getElementById("Vd2");
const Vd3html = document.getElementById("Vd3html");
Vd3html.innerHTML = "<i>V</i><sub>3</sub> (mL/kg)";
const Vd3num = document.getElementById("Vd3");
const Clhtml = document.getElementById("Clhtml");
Clhtml.innerHTML = "<i>C</i><sub><i>l</i></sub> (mL/kg/min)";
const Clnum = document.getElementById("Cl");
const Q2html = document.getElementById("Q2html");
Q2html.innerHTML = "<i>Q</i><sub>2</sub> (mL/kg/min)";
const Q2num = document.getElementById("Q2");
const Q3html = document.getElementById("Q3html");
Q3html.innerHTML = "<i>Q</i><sub>3</sub> (mL/kg/min)";
const Q3num = document.getElementById("Q3");

const pkInputModeSelect = document.getElementById("pkInputMode");

const k10inputhtml = document.getElementById("k10inputhtml");
if (k10inputhtml) k10inputhtml.innerHTML = "k<sub>10</sub> (min<sup>-1</sup>)";
const k10inputnum = document.getElementById("k10input");
const k12inputhtml = document.getElementById("k12inputhtml");
if (k12inputhtml) k12inputhtml.innerHTML = "k<sub>12</sub> (min<sup>-1</sup>)";
const k12inputnum = document.getElementById("k12input");
const k21inputhtml = document.getElementById("k21inputhtml");
if (k21inputhtml) k21inputhtml.innerHTML = "k<sub>21</sub> (min<sup>-1</sup>)";
const k21inputnum = document.getElementById("k21input");
const k13inputhtml = document.getElementById("k13inputhtml");
if (k13inputhtml) k13inputhtml.innerHTML = "k<sub>13</sub> (min<sup>-1</sup>)";
const k13inputnum = document.getElementById("k13input");
const k31inputhtml = document.getElementById("k31inputhtml");
if (k31inputhtml) k31inputhtml.innerHTML = "k<sub>31</sub> (min<sup>-1</sup>)";
const k31inputnum = document.getElementById("k31input");
const bhtml = document.getElementById("bhtml");
bhtml.innerHTML = "Bolus (mg/kg)";
const bnum = document.getElementById("b");
const infusionhtml = document.getElementById("infusionhtml");
infusionhtml.innerHTML = "Infusion (mg/kg/min)";
const infusionnum = document.getElementById("infusion");
const tbolushtml = document.getElementById("tbolushtml");
tbolushtml.innerHTML = "Loading-dose duration (min)";
const tbolusnum = document.getElementById("tbolus");
const tinfusionhtml = document.getElementById("tinfusionhtml");
tinfusionhtml.innerHTML = "Infusion duration (min)";
const tinfusionnum = document.getElementById("tinfusion");
const weighthtml = document.getElementById("weighthtml");
if (weighthtml) weighthtml.innerHTML = "Patient weight (kg)";
const weightnum = document.getElementById("weight");
const bolusUnitSelect = document.getElementById("bolusUnitSelect");
const infusionUnitSelect = document.getElementById("infusionUnitSelect");
const initialphtml = document.getElementById("initialphtml");
initialphtml.innerHTML = "[<i>P</i>]<sub>init</sub> (mg/mL)";
const initialpnum = document.getElementById("initialp");
const tfinalhtml = document.getElementById("tfinalhtml");
tfinalhtml.innerHTML = "<i>t</i><sub>final</sub> (min)";
const tfinalnum = document.getElementById("tfinal");
const ke0html = document.getElementById("ke0html");
ke0html.innerHTML = "k<sub>e0</sub> (min<sup>-1</sup>)";
const ke0num = document.getElementById("ke0");

const pfinalhtml = document.getElementById("pfinalhtml"); pfinalhtml.innerHTML = 0;
const psshtml = document.getElementById("psshtml"); psshtml.innerHTML = 0;
const concentrationunitshtml1 = document.getElementById("concentrationunitshtml1"); concentrationunitshtml1.innerHTML = "mg/mL";
const concentrationunitshtml2 = document.getElementById("concentrationunitshtml2"); concentrationunitshtml2.innerHTML = "mg/mL";
const alphahtml = document.getElementById("alphahtml"); alphahtml.innerHTML = 0;
const betahtml = document.getElementById("betahtml"); betahtml.innerHTML = 0;
const gammahtml = document.getElementById("gammahtml"); gammahtml.innerHTML = 0;
const termhalflifehtml = document.getElementById("termhalflifehtml"); termhalflifehtml.innerHTML = 0;
const k10html = document.getElementById("k10html"); k10html.innerHTML = 0;
const k12html = document.getElementById("k12html"); k12html.innerHTML = 0;
const k13html = document.getElementById("k13html"); k13html.innerHTML = 0;
const k21html = document.getElementById("k21html"); k21html.innerHTML = 0;
const k31html = document.getElementById("k31html"); k31html.innerHTML = 0;
const Vd1numhtml = document.getElementById("Vd1numhtml"); Vd1numhtml.innerHTML = 0;
const Vd2numhtml = document.getElementById("Vd2numhtml"); Vd2numhtml.innerHTML = 0;
const Vd3numhtml = document.getElementById("Vd3numhtml"); Vd3numhtml.innerHTML = 0;
const Q2numhtml = document.getElementById("Q2numhtml"); Q2numhtml.innerHTML = 0;
const Q3numhtml = document.getElementById("Q3numhtml"); Q3numhtml.innerHTML = 0;
const Clnumhtml = document.getElementById("Clnumhtml"); Clnumhtml.innerHTML = 0;
const contextsensitivehalflifehtml = document.getElementById("contextsensitivehalflifehtml"); contextsensitivehalflifehtml.innerHTML = 0;

// ============================
// Units (display only; internal math stays mg/mL)
// ============================
const UNITS = {
  'mg/mL': { name: 'mg/mL', factor: 1 },
  'µg/mL': { name: 'µg/mL', factor: 1e3 },
  'ng/mL': { name: 'ng/mL', factor: 1e6 }
};
let currentUnit = UNITS['mg/mL'];

function formatInputValue(value) {
  return Number.isFinite(value) ? String(roundToSignificantFigures(value, 10)) : '';
}

function setDisplayUnit(unitName, preserveValue = true) {
  const nextUnit = UNITS[unitName] || UNITS['mg/mL'];
  if (preserveValue && currentUnit.factor !== nextUnit.factor) {
    [initialpnum, document.getElementById('tciTarget'), document.getElementById('testRegimenTarget')].forEach(input => {
      const value = parseFloat(input?.value);
      if (input && Number.isFinite(value)) input.value = formatInputValue((value / currentUnit.factor) * nextUnit.factor);
    });
  }
  currentUnit = nextUnit;
  initialphtml.innerHTML = `[<i>P</i>]<sub>init</sub> (${currentUnit.name})`;
  concentrationunitshtml1.innerHTML = currentUnit.name;
  concentrationunitshtml2.innerHTML = currentUnit.name;
  updateTciControls?.();
}

const BOLUSUNITS = {
  'mg/kg': { name: 'mg/kg', factor: 1, perKg: true },
  'µg/kg': { name: 'µg/kg', factor: 1e3, perKg: true },
  'ng/kg': { name: 'ng/kg', factor: 1e6, perKg: true },
  'mg': { name: 'mg', factor: 1, perKg: false },
  'µg': { name: 'µg', factor: 1e3, perKg: false },
  'ng': { name: 'ng', factor: 1e6, perKg: false }
};
let currentBolusUnit = BOLUSUNITS['mg/kg'];

const INFUSIONUNITS = {
  'mg/kg/min': { name: 'mg/kg/min', factor: 1, perKg: true },
  'µg/kg/min': { name: 'µg/kg/min', factor: 1e3, perKg: true },
  'ng/kg/min': { name: 'ng/kg/min', factor: 1e6, perKg: true },
  'mg/kg/hr': { name: 'mg/kg/hr', factor: 60.0, perKg: true },
  'µg/kg/hr': { name: 'µg/kg/hr', factor: 1e3 * 60.0, perKg: true },
  'ng/kg/hr': { name: 'ng/kg/hr', factor: 1e6 * 60.0, perKg: true },
  'mg/min': { name: 'mg/min', factor: 1, perKg: false },
  'µg/min': { name: 'µg/min', factor: 1e3, perKg: false },
  'ng/min': { name: 'ng/min', factor: 1e6, perKg: false },
  'mg/hr': { name: 'mg/hr', factor: 60.0, perKg: false },
  'µg/hr': { name: 'µg/hr', factor: 1e3 * 60.0, perKg: false },
  'ng/hr': { name: 'ng/hr', factor: 1e6 * 60.0, perKg: false }
};
let currentInfusionUnit = INFUSIONUNITS['mg/kg/min'];

const BOLUS_UNIT_ORDER = ['mg/kg', 'µg/kg', 'ng/kg', 'mg', 'µg', 'ng'];
const INFUSION_UNIT_ORDER = ['mg/kg/min', 'µg/kg/min', 'ng/kg/min', 'mg/kg/hr', 'µg/kg/hr', 'ng/kg/hr', 'mg/min', 'µg/min', 'ng/min', 'mg/hr', 'µg/hr', 'ng/hr'];

function getWeightKg() {
  const w = parseFloatSafe(weightnum?.value, 70);
  return (Number.isFinite(w) && w > 0) ? w : 70;
}

function convertBolusValueToMgKg(value, unitObj = currentBolusUnit, weightKg = getWeightKg()) {
  const normalized = parseFloatSafe(value, 0) / (unitObj?.factor ?? 1);
  if (unitObj?.perKg) return normalized;
  return normalized / Math.max(weightKg, 1e-9);
}

function convertInfusionValueToMgKgMin(value, unitObj = currentInfusionUnit, weightKg = getWeightKg()) {
  const normalized = parseFloatSafe(value, 0) / (unitObj?.factor ?? 1);
  if (unitObj?.perKg) return normalized;
  return normalized / Math.max(weightKg, 1e-9);
}

function convertMgKgToBolusValue(valueMgKg, unitObj, weightKg = getWeightKg()) {
  const perKgValue = unitObj?.perKg ? valueMgKg : valueMgKg * weightKg;
  return perKgValue * (unitObj?.factor ?? 1);
}

function convertMgKgMinToInfusionValue(valueMgKgMin, unitObj, weightKg = getWeightKg()) {
  const perKgValue = unitObj?.perKg ? valueMgKgMin : valueMgKgMin * weightKg;
  return perKgValue * (unitObj?.factor ?? 1);
}

function convertBolusToMgKg(value, unitObj = currentBolusUnit) {
  return convertBolusValueToMgKg(value, unitObj, getWeightKg());
}

function convertInfusionToMgKgMin(value, unitObj = currentInfusionUnit) {
  return convertInfusionValueToMgKgMin(value, unitObj, getWeightKg());
}

function populateUnitSelect(selectEl, unitsMap, order) {
  if (!selectEl) return;
  selectEl.innerHTML = '';
  order.forEach(unitName => {
    const meta = unitsMap[unitName];
    if (!meta) return;
    const opt = document.createElement('option');
    opt.value = unitName;
    opt.textContent = meta.name;
    selectEl.appendChild(opt);
  });
}

function initializeUnitSelectors() {
  populateUnitSelect(bolusUnitSelect, BOLUSUNITS, BOLUS_UNIT_ORDER);
  populateUnitSelect(infusionUnitSelect, INFUSIONUNITS, INFUSION_UNIT_ORDER);
}

function rescaleScheduleInputs(selector, convert) {
  $$(selector).forEach(input => {
    const value = parseFloat(input.value);
    if (Number.isFinite(value)) input.value = formatInputValue(convert(value));
  });
}

function setBolusUnit(unitName, preserveValues = true) {
  const previousUnit = currentBolusUnit;
  const nextUnit = BOLUSUNITS[unitName] || BOLUSUNITS['mg/kg'];
  if (preserveValues && previousUnit.name !== nextUnit.name) {
    const weightKg = getWeightKg();
    const convert = value => convertMgKgToBolusValue(convertBolusValueToMgKg(value, previousUnit, weightKg), nextUnit, weightKg);
    if (bnum && Number.isFinite(parseFloat(bnum.value))) bnum.value = formatInputValue(convert(parseFloat(bnum.value)));
    rescaleScheduleInputs('#bolusEventsTable input[data-field="dose"]', convert);
  }
  currentBolusUnit = nextUnit;
  bhtml.innerHTML = `Bolus (${currentBolusUnit.name})`;
  if (bolusUnitSelect) bolusUnitSelect.value = currentBolusUnit.name;
  updateScheduleUnitLabels();
}

function setInfusionUnit(unitName, preserveValues = true) {
  const previousUnit = currentInfusionUnit;
  const nextUnit = INFUSIONUNITS[unitName] || INFUSIONUNITS['mg/kg/min'];
  if (preserveValues && previousUnit.name !== nextUnit.name) {
    const weightKg = getWeightKg();
    const convert = value => convertMgKgMinToInfusionValue(convertInfusionValueToMgKgMin(value, previousUnit, weightKg), nextUnit, weightKg);
    if (infusionnum && Number.isFinite(parseFloat(infusionnum.value))) infusionnum.value = formatInputValue(convert(parseFloat(infusionnum.value)));
    const tciMaxRate = document.getElementById('tciMaxRate');
    if (tciMaxRate && Number.isFinite(parseFloat(tciMaxRate.value))) tciMaxRate.value = formatInputValue(convert(parseFloat(tciMaxRate.value)));
    rescaleScheduleInputs('#infusionEventsTable input[data-field="rate"]', convert);
  }
  currentInfusionUnit = nextUnit;
  infusionhtml.innerHTML = `Infusion (${currentInfusionUnit.name})`;
  if (infusionUnitSelect) infusionUnitSelect.value = currentInfusionUnit.name;
  updateScheduleUnitLabels();
}

function updateScheduleUnitLabels() {
  const bSpan = document.getElementById('scheduleBolusUnit');
  const iSpan = document.getElementById('scheduleInfusionUnit');
  const bBadge = document.getElementById('scheduleBolusUnitBadge');
  const iBadge = document.getElementById('scheduleInfusionUnitBadge');
  const bUnit = currentBolusUnit?.name || 'mg/kg';
  const iUnit = currentInfusionUnit?.name || 'mg/kg/min';
  if (bSpan) bSpan.textContent = `(${bUnit})`;
  if (iSpan) iSpan.textContent = `(${iUnit})`;
  if (bBadge) bBadge.textContent = bUnit;
  if (iBadge) iBadge.textContent = iUnit;
  ['tciMaxRateUnit', 'mainTciMaxRateUnit', 'tciRateUnit'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = iUnit;
  });
}

function getTciConfig() {
  const enabled = Boolean(document.getElementById('tciEnabled')?.checked);
  const targetType = document.getElementById('tciTargetType')?.value === 'ce' ? 'ce' : 'cp';
  const target = parseFloatSafe(document.getElementById('tciTarget')?.value, 0);
  const maxRate = convertInfusionValueToMgKgMin(document.getElementById('tciMaxRate')?.value, currentInfusionUnit, getWeightKg());
  const stopTime = Math.max(0, parseFloatSafe(document.getElementById('tciStopTime')?.value, 0));
  return { enabled, targetType, target, targetBase: target / currentUnit.factor, maxRate, stopTime };
}

function updateTciControls() {
  const config = getTciConfig();
  const targetUnit = currentUnit?.name || 'mg/mL';
  ['tciTargetUnit', 'mainTciTargetUnit'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = targetUnit;
  });
  const testTargetUnit = document.getElementById('testRegimenTargetUnit');
  if (testTargetUnit) testTargetUnit.textContent = targetUnit;
  const mainControls = document.getElementById('mainTciControls');
  if (mainControls) mainControls.hidden = !config.enabled;
  const mainImportButton = document.getElementById('mainImportTciScheduleBtn');
  if (mainImportButton) mainImportButton.hidden = !config.enabled;
  const mainTargetType = document.getElementById('mainTciTargetType');
  const mainTarget = document.getElementById('mainTciTarget');
  const mainMaxRate = document.getElementById('mainTciMaxRate');
  const mainStopTime = document.getElementById('mainTciStopTime');
  if (mainTargetType) mainTargetType.value = config.targetType;
  if (mainTarget) mainTarget.value = document.getElementById('tciTarget')?.value || '';
  if (mainMaxRate) mainMaxRate.value = document.getElementById('tciMaxRate')?.value || '';
  if (mainStopTime) mainStopTime.value = document.getElementById('tciStopTime')?.value || '';
}

function applyMainTciAdjustment() {
  const type = document.getElementById('mainTciTargetType')?.value;
  const target = document.getElementById('mainTciTarget')?.value;
  const maxRate = document.getElementById('mainTciMaxRate')?.value;
  const stopTime = document.getElementById('mainTciStopTime')?.value;
  if (type) document.getElementById('tciTargetType').value = type;
  if (target !== undefined) document.getElementById('tciTarget').value = target;
  if (maxRate !== undefined) document.getElementById('tciMaxRate').value = maxRate;
  if (stopTime !== undefined) document.getElementById('tciStopTime').value = stopTime;
  dfsolve();
}

function generateModelDerivedTestRegimen() {
  const targetInput = document.getElementById('testRegimenTarget');
  const durationInput = document.getElementById('testRegimenLoadingDuration');
  const target = Number(targetInput?.value);
  const duration = Number(durationInput?.value);
  [targetInput, durationInput].forEach(input => input?.classList.remove('is-invalid'));
  if (!Number.isFinite(target) || target <= 0) {
    targetInput?.classList.add('is-invalid');
    setSimulationStatus('Enter a predicted plasma target greater than 0 to generate a test regimen.', 'error');
    return;
  }
  if (!Number.isFinite(duration) || duration < 0) {
    durationInput?.classList.add('is-invalid');
    setSimulationStatus('Loading-dose duration must be zero or greater.', 'error');
    return;
  }

  if (getPkInputMode() === 'microconstants') syncClearanceInputsFromMicroInputs();
  const pk = getPkParametersFromInputs();
  const targetBase = target / currentUnit.factor;
  const loadingDoseMgKg = pk.V1 * targetBase;
  const maintenanceRateMgKgMin = pk.Cl * targetBase;
  const finalTime = Math.max(0, parseFloatSafe(tfinalnum?.value, 0));

  bnum.value = formatInputValue(convertMgKgToBolusValue(loadingDoseMgKg, currentBolusUnit, getWeightKg()));
  tbolusnum.value = formatInputValue(duration);
  infusionnum.value = formatInputValue(convertMgKgMinToInfusionValue(maintenanceRateMgKgMin, currentInfusionUnit, getWeightKg()));
  tinfusionnum.value = formatInputValue(Math.max(0, finalTime - duration));
  const useSchedule = document.getElementById('useSchedule');
  if (useSchedule) useSchedule.checked = false;
  const tciEnabled = document.getElementById('tciEnabled');
  if (tciEnabled) tciEnabled.checked = false;
  selectedTimelineEvent = null;
  disableLegacyBolusInfusionInputs(false);
  dfsolve();
  setSimulationStatus(`Model-derived test regimen generated: loading ${formatInputValue(loadingDoseMgKg)} mg/kg and maintenance ${formatInputValue(maintenanceRateMgKgMin)} mg/kg/min before unit conversion.`, 'ok');
}

function disableLegacyBolusInfusionInputs(disabled) {
  ['b','tbolus','infusion','tinfusion'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !!disabled;
  });
}

// ============================
// Advanced schedule UI (kept)
// ============================
function clearTable(tbl) {
  if (!tbl || !tbl.tBodies || !tbl.tBodies[0]) return;
  tbl.tBodies[0].innerHTML = '';
}

function addBolusRow({ time = 0, dose = 0, duration = 0 } = {}, container = null) {
  const tbl = document.getElementById('bolusEventsTable');
  if (!tbl || !tbl.tBodies || !tbl.tBodies[0]) return;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="number" class="form-control form-control-sm" data-field="time" value="${time}" min="0" step="any" aria-label="Bolus time in minutes"></td>
    <td><input type="number" class="form-control form-control-sm" data-field="dose" value="${dose}" min="0" step="any" aria-label="Bolus dose"></td>
    <td><input type="number" class="form-control form-control-sm" data-field="duration" value="${duration}" min="0" step="any" aria-label="Bolus duration in minutes"></td>
    <td><button class="btn btn-sm btn-outline-danger" type="button" data-action="remove" aria-label="Remove bolus">×</button></td>
  `;
  (container || tbl.tBodies[0]).appendChild(tr);
}

function addInfusionRow({ start = 0, end = 0, rate = 0 } = {}, container = null) {
  const tbl = document.getElementById('infusionEventsTable');
  if (!tbl || !tbl.tBodies || !tbl.tBodies[0]) return;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="number" class="form-control form-control-sm" data-field="start" value="${start}" min="0" step="any" aria-label="Infusion start time in minutes"></td>
    <td><input type="number" class="form-control form-control-sm" data-field="end" value="${end}" min="0" step="any" aria-label="Infusion end time in minutes"></td>
    <td><input type="number" class="form-control form-control-sm" data-field="rate" value="${rate}" min="0" step="any" aria-label="Infusion rate"></td>
    <td><button class="btn btn-sm btn-outline-danger" type="button" data-action="remove" aria-label="Remove infusion segment">×</button></td>
  `;
  (container || tbl.tBodies[0]).appendChild(tr);
}

function getScheduleFromDOM() {
  const schedule = { enabled: false, boluses: [], infusions: [] };
  const useCb = document.getElementById('useSchedule');
  if (!useCb || !useCb.checked) return schedule;
  schedule.enabled = true;

  const bolusTbl = document.getElementById('bolusEventsTable');
  const infTbl = document.getElementById('infusionEventsTable');

  if (bolusTbl && bolusTbl.tBodies && bolusTbl.tBodies[0]) {
    [...bolusTbl.tBodies[0].rows].forEach(r => {
      const time = parseFloatSafe(r.querySelector('input[data-field="time"]')?.value, 0);
      const dose = parseFloatSafe(r.querySelector('input[data-field="dose"]')?.value, 0);
      const duration = parseFloatSafe(r.querySelector('input[data-field="duration"]')?.value, 0);
      if (dose === 0) return;
      schedule.boluses.push({ time, dose, duration });
    });
  }

  if (infTbl && infTbl.tBodies && infTbl.tBodies[0]) {
    [...infTbl.tBodies[0].rows].forEach(r => {
      const start = parseFloatSafe(r.querySelector('input[data-field="start"]')?.value, 0);
      const end = parseFloatSafe(r.querySelector('input[data-field="end"]')?.value, 0);
      const rate = parseFloatSafe(r.querySelector('input[data-field="rate"]')?.value, 0);
      if (rate === 0) return;
      schedule.infusions.push({ start, end, rate });
    });
  }

  schedule.boluses.sort((a,b) => a.time - b.time);
  schedule.infusions.sort((a,b) => a.start - b.start);
  return schedule;
}

function setScheduleToDOM(schedule) {
  const useCb = document.getElementById('useSchedule');
  const bolusTbl = document.getElementById('bolusEventsTable');
  const infTbl = document.getElementById('infusionEventsTable');
  if (!useCb || !bolusTbl || !infTbl) return;

  useCb.checked = !!(schedule && schedule.enabled);
  clearTable(bolusTbl);
  clearTable(infTbl);

  const bs = (schedule && Array.isArray(schedule.boluses)) ? schedule.boluses : [];
  const ins = (schedule && Array.isArray(schedule.infusions)) ? schedule.infusions : [];

  const bolusFragment = document.createDocumentFragment();
  const infusionFragment = document.createDocumentFragment();
  if (bs.length === 0) addBolusRow({ time: 0, dose: 0, duration: 0 }, bolusFragment);
  else bs.forEach(b => addBolusRow(b, bolusFragment));

  if (ins.length === 0) addInfusionRow({ start: 0, end: 0, rate: 0 }, infusionFragment);
  else ins.forEach(i => addInfusionRow(i, infusionFragment));
  bolusTbl.tBodies[0].appendChild(bolusFragment);
  infTbl.tBodies[0].appendChild(infusionFragment);
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
    (schedule.boluses || []).forEach(event => addBolus(event.time, event.dose, event.duration));
    (schedule.infusions || []).forEach(event => addInfusion(event.start, event.end, event.rate));
  } else {
    const loadingDuration = Math.max(0, parseFloatSafe(basic?.tbolus, 0));
    addBolus(0, basic?.bolus, loadingDuration);
    addInfusion(loadingDuration, loadingDuration + Math.max(0, parseFloatSafe(basic?.tinfusion, 0)), basic?.infusion);
  }
  return { rateEvents, instantEvents };
}

function simulatePkModel({ pk, ke0, initialConcentration, finalTime, dosingPlan, tci }) {
  const tfinal = Math.max(0, finalTime);
  const hasEffectSite = Number.isFinite(ke0) && ke0 > 0;
  const eventTimes = tci?.enabled
    ? [tci.stopTime]
    : [
        ...(dosingPlan?.rateEvents || []).flatMap(event => [event.start, event.end]),
        ...(dosingPlan?.instantEvents || []).map(event => event.time)
      ];
  const ts = buildSimulationTimes(tfinal, eventTimes);
  const N = ts.length - 1;
  const xs1 = new Array(N + 1).fill(0);
  const xs2 = new Array(N + 1).fill(0);
  const xs3 = new Array(N + 1).fill(0);
  const ces = new Array(N + 1).fill(0);
  const intervalRates = new Array(N).fill(0);
  const transitionCache = new Map();

  xs1[0] = initialConcentration * pk.V1;
  ces[0] = initialConcentration;
  let totalDoseMgKg = 0;
  let lastRateEndIndex = null;

  const instantAt = time => (dosingPlan?.instantEvents || []).reduce((sum, event) =>
    Math.abs(event.time - time) <= TIME_EPSILON ? sum + event.amount : sum, 0);
  const sortedRateEvents = [...(dosingPlan?.rateEvents || [])].sort((a, b) => a.start - b.start);
  let nextRateEvent = 0;
  let activeRateEvents = [];
  const rateOverInterval = (start, end) => {
    const duration = end - start;
    if (duration <= 0) return 0;
    while (nextRateEvent < sortedRateEvents.length && sortedRateEvents[nextRateEvent].start < end) {
      activeRateEvents.push(sortedRateEvents[nextRateEvent++]);
    }
    activeRateEvents = activeRateEvents.filter(event => event.end > start);
    return activeRateEvents.reduce((sum, event) => {
      const overlap = Math.max(0, Math.min(end, event.end) - Math.max(start, event.start));
      return sum + event.rate * overlap / duration;
    }, 0);
  };

  for (let i = 0; i < N; i++) {
    const instant = tci?.enabled ? 0 : instantAt(ts[i]);
    if (instant > 0) {
      xs1[i] += instant;
      totalDoseMgKg += instant;
    }
    const duration = ts[i + 1] - ts[i];
    const transition = createTransition(pk, hasEffectSite ? ke0 : 0, duration, transitionCache);
    let rate = 0;
    if (tci?.enabled) {
      const baseCpNext = (transition.a11*xs1[i] + transition.a12*xs2[i] + transition.a13*xs3[i]) / pk.V1;
      const baseCeNext = transition.a41*xs1[i] + transition.a42*xs2[i] + transition.a43*xs3[i] + transition.a44*ces[i];
      const gain = tci.targetType === 'ce' ? transition.a45 : transition.a15 / pk.V1;
      const baseline = tci.targetType === 'ce' ? baseCeNext : baseCpNext;
      rate = ts[i] < tci.stopTime - TIME_EPSILON && gain > 0
        ? clamp((tci.targetBase - baseline) / gain, 0, tci.maxRate)
        : 0;
    } else {
      rate = rateOverInterval(ts[i], ts[i + 1]);
    }
    intervalRates[i] = rate;
    totalDoseMgKg += rate * duration;
    if (Math.abs(rate) > 1e-12) lastRateEndIndex = i + 1;

    const x1 = xs1[i], x2 = xs2[i], x3 = xs3[i], ce = ces[i];
    xs1[i+1] = transition.a11*x1 + transition.a12*x2 + transition.a13*x3 + rate*transition.a15;
    xs2[i+1] = transition.a21*x1 + transition.a22*x2 + transition.a23*x3 + rate*transition.a25;
    xs3[i+1] = transition.a31*x1 + transition.a32*x2 + transition.a33*x3 + rate*transition.a35;
    ces[i+1] = transition.a41*x1 + transition.a42*x2 + transition.a43*x3 + transition.a44*ce + rate*transition.a45;
  }

  const finalInstant = tci?.enabled ? 0 : instantAt(ts[N]);
  if (finalInstant > 0) {
    xs1[N] += finalInstant;
    totalDoseMgKg += finalInstant;
  }

  return {
    ts, xs1, xs2, xs3, ces, intervalRates, totalDoseMgKg, lastRateEndIndex, hasEffectSite,
    finalActiveRate: N > 0 ? intervalRates[N - 1] : 0,
    cp: xs1.map(value => value / pk.V1),
    ce: ces.slice()
  };
}

function buildScheduleFromTciSimulation(simulation, infusionUnit, weightKg) {
  const infusions = [];
  simulation.intervalRates.forEach((rateMgKgMin, index) => {
    if (!(rateMgKgMin > 0)) return;
    const start = Number(formatInputValue(simulation.ts[index]));
    const end = Number(formatInputValue(simulation.ts[index + 1]));
    const rate = Number(formatInputValue(convertMgKgMinToInfusionValue(rateMgKgMin, infusionUnit, weightKg)));
    const last = infusions[infusions.length - 1];
    if (last && last.end === start && last.rate === rate) last.end = end;
    else infusions.push({ start, end, rate });
  });
  return { enabled: true, boluses: [], infusions };
}

function importCurrentTciAsSchedule() {
  if (!document.getElementById('tciEnabled')?.checked) {
    setSimulationStatus('Enable TCI and enter a target and maximum rate before importing its infusion schedule.', 'error');
    return;
  }
  if (!validateSimulationInputs()) return;
  if (getPkInputMode() === 'microconstants') syncClearanceInputsFromMicroInputs();
  else syncMicroInputsFromClearanceInputs();

  const state = getCurrentState();
  const simulation = simulateStrategy(state);
  const schedule = buildScheduleFromTciSimulation(
    simulation,
    INFUSIONUNITS[state.units.infusion],
    state.patient.weightKg
  );
  tciImportSession = { sourceState: state, sourceSimulation: simulation, exactSchedule: schedule };
  selectedTimelineEvent = null;
  timelineUndoSchedule = null;
  document.getElementById('tciEnabled').checked = false;
  setScheduleToDOM(schedule);
  disableLegacyBolusInfusionInputs(true);
  expandDrawerCard('scheduleCard');
  dfsolve();
  setSimulationStatus(`TCI rates imported as ${schedule.infusions.length} editable infusion segments. TCI is off; the schedule no longer tracks the target.`, 'ok');
}

function simplifyTciInfusions(infusions, limit) {
  if (limit >= infusions.length) return infusions.map(item => ({ ...item }));
  const runs = [];
  for (const infusion of infusions) {
    const last = runs[runs.length - 1];
    if (last && Math.abs(last[last.length - 1].end - infusion.start) < 1e-8) last.push(infusion);
    else runs.push([infusion]);
  }
  if (runs.length > limit) return null; // Never bridge a zero-rate gap.
  const groups = runs.map(run => {
    const duration = [0], dose = [0], squared = [0];
    run.forEach(item => {
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
    return dt > 0 ? g.squared[b] - g.squared[a] - dose * dose / dt : 0;
  };
  const bestSplit = g => {
    let best = { at: -1, gain: 0 };
    const whole = loss(g, g.from, g.to);
    for (let at = g.from + 1; at < g.to; at++) {
      const gain = whole - loss(g, g.from, at) - loss(g, at, g.to);
      if (gain > best.gain + 1e-12) best = { at, gain };
    }
    return best;
  };
  const heap = [];
  const push = group => {
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
    const top = heap[0], tail = heap.pop();
    if (heap.length) {
      heap[0] = tail;
      let index = 0;
      while (true) {
        const left = index * 2 + 1, right = left + 1;
        let largest = index;
        if (left < heap.length && heap[left].split.gain > heap[largest].split.gain) largest = left;
        if (right < heap.length && heap[right].split.gain > heap[largest].split.gain) largest = right;
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
  return heap.map(g => {
    const dt = g.duration[g.to] - g.duration[g.from];
    return {
      start: g.run[g.from].start,
      end: g.run[g.to - 1].end,
      rate: Number(formatInputValue((g.dose[g.to] - g.dose[g.from]) / dt))
    };
  }).sort((a, b) => a.start - b.start);
}

function replaceWithTciOriginal(simplified = false) {
  if (!tciImportSession) return;
  const exact = tciImportSession.exactSchedule;
  let infusions = exact.infusions;
  if (simplified) {
    const input = document.getElementById('tciSimplifyLimit');
    const limit = Number(input?.value);
    if (!Number.isSafeInteger(limit) || limit < 1) {
      setSimulationStatus('Enter a whole-number segment limit of at least 1.', 'error');
      return;
    }
    infusions = simplifyTciInfusions(exact.infusions, limit);
    if (!infusions) {
      setSimulationStatus(`At least ${countTciInfusionRuns(exact.infusions)} segments are needed to preserve zero-rate gaps.`, 'error');
      return;
    }
  }
  selectedTimelineEvent = null;
  setScheduleToDOM({ enabled: true, boluses: [], infusions });
  document.getElementById('tciEnabled').checked = false;
  disableLegacyBolusInfusionInputs(true);
  dfsolve();
  setSimulationStatus(`${simplified ? 'Simplified' : 'Exact'} original TCI schedule restored as ${infusions.length} editable segments. Current schedule edits were replaced.`, 'ok');
}

function countTciInfusionRuns(infusions) {
  return infusions.reduce((count, item, index) => count + (index === 0 || Math.abs(infusions[index - 1].end - item.start) >= 1e-8 ? 1 : 0), 0);
}

function updateRegimenOverview(params, schedule) {
  const drug = DRUGS.find(d => d.id === currentDrug);
  const drugLabel = drug ? `${drug.label}${presetIsModified ? ' — modified' : ''}` : 'Custom model';
  const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  setText('summaryDrug', drugLabel);
  setText('summaryWeight', `${formatInputValue(params.weightKg)} kg`);
  setText('summaryModel', getPkInputMode() === 'microconstants' ? 'Microconstants' : 'Clearance & volumes');
  const sourceText = drug?.note || 'Custom parameters — review volumes, clearances, effect-site rate, units, and source assumptions before interpreting this simulation.';
  setText('summarySource', presetIsModified
    ? `${sourceText} PK/effect-site parameters have been modified; preset therapeutic ranges are hidden.`
    : sourceText);

  let segments = [];
  let description = '';
  const tci = getTciConfig();
  const plotCaption = document.getElementById('primaryPlotCaption');
  if (plotCaption) {
    plotCaption.textContent = params.ke0 <= 0
      ? 'Cp = central plasma concentration. Effect-site concentration is unavailable because no effect-site model is defined.'
      : tci.enabled
      ? 'Cp = central plasma; Ce = effect site. The dashed green line is the educational TCI target; the rate chart shows calculated delivery.'
      : 'Cp = central plasma; Ce = effect site. Orange marks loading-dose delivery; blue marks infusion delivery.';
  }
  if (tci.enabled) {
    const compartment = tci.targetType === 'ce' ? 'effect-site (Ce)' : 'plasma (Cp)';
    const stopTime = Math.min(tci.stopTime, params.tfinal);
    description = `Educational TCI · ${compartment} target ${formatInputValue(tci.target)} ${currentUnit.name} until ${formatInputValue(stopTime)} min · maximum ${formatInputValue(document.getElementById('tciMaxRate')?.value)} ${currentInfusionUnit.name}`;
    segments = [{ start: 0, end: stopTime, type: 'infusion', index: -1, label: 'Educational TCI' }];
  } else if (schedule?.enabled) {
    const boluses = schedule.boluses || [];
    const infusions = schedule.infusions || [];
    description = `${boluses.length} bolus${boluses.length === 1 ? '' : 'es'} · ${infusions.length} infusion segment${infusions.length === 1 ? '' : 's'}`;
    const displayedInfusions = infusions.length > MAX_VISIBLE_SCHEDULE_SEGMENTS
      ? [{ start: infusions[0].start, end: infusions[infusions.length - 1].end, summary: true }]
      : infusions;
    segments = [
      ...boluses.map((event, index) => ({ start: event.time, end: event.duration > 0 ? event.time + event.duration : event.time, type: 'bolus', index, label: `Bolus ${index + 1}` })),
      ...displayedInfusions.map((event, index) => ({ start: event.start, end: event.end, type: 'infusion', index: event.summary ? -1 : index, summary: Boolean(event.summary), label: event.summary ? `${infusions.length} infusion segments` : `Infusion ${index + 1}` }))
    ];
  } else {
    description = `Bolus ${formatInputValue(parseFloatSafe(bnum.value, 0))} ${currentBolusUnit.name} over ${formatInputValue(params.tbolus)} min · infusion ${formatInputValue(parseFloatSafe(infusionnum.value, 0))} ${currentInfusionUnit.name} for ${formatInputValue(params.tinfusion)} min`;
    segments = [
      { start: 0, end: params.tbolus, type: 'bolus', index: 0, label: 'Bolus' },
      { start: params.tbolus, end: params.tbolus + params.tinfusion, type: 'infusion', index: 0, label: 'Infusion' }
    ];
  }
  setText('summaryDose', description);
  setText('doseTimelineText', `0–${formatInputValue(params.tfinal)} min`);

  const track = document.getElementById('doseTimelineTrack');
  if (!track) return;
  track.textContent = '';
  const validSegments = segments.filter(segment => Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.start <= params.tfinal && segment.end >= 0);
  track.setAttribute('aria-label', `${description}; simulation duration ${formatInputValue(params.tfinal)} minutes.`);
  validSegments.forEach(segment => {
    const start = clamp(segment.start, 0, params.tfinal);
    const end = clamp(segment.end, 0, params.tfinal);
    const marker = document.createElement('span');
    marker.className = `dose-timeline__segment dose-timeline__segment--${segment.type}${segment.summary ? ' dose-timeline__segment--summary' : ''}`;
    marker.dataset.eventType = segment.type;
    marker.dataset.eventIndex = String(segment.index);
    marker.style.left = `${(start / params.tfinal) * 100}%`;
    marker.style.width = `${Math.max(1.2, ((Math.max(end, start) - start) / params.tfinal) * 100)}%`;
    const eventDetails = segment.summary ? `${segment.label}; edit individual rates in Dosing Schedule` : tci.enabled ? description : getTimelineEventDetails(segment, schedule);
    marker.title = tci.enabled || segment.summary ? eventDetails : `${eventDetails}. Click to edit.`;
    if (!tci.enabled && !segment.summary) {
      marker.setAttribute('role', 'button');
      marker.setAttribute('tabindex', '0');
      marker.setAttribute('aria-label', `Edit ${eventDetails}`);
    }
    const label = document.createElement('span');
    label.className = 'dose-timeline__segment-label';
    label.textContent = segment.summary ? segment.label : tci.enabled ? `TCI 0–${formatInputValue(end)} min` : segment.type === 'bolus'
      ? `B ${formatInputValue(start)}m`
      : `Infusion ${formatInputValue(start)}–${formatInputValue(end)} min`;
    marker.appendChild(label);
    track.appendChild(marker);
  });

  track.dataset.tciMode = String(tci.enabled);
  renderTimelineEventEditor(tci.enabled ? { enabled: false } : schedule);
  updateMainDoseEditor(tci.enabled ? { enabled: true, boluses: [], infusions: [] } : schedule);
  updateTciControls();
  latestPdfContext = { params, schedule };
  updatePdfReportSummary(params, schedule);
}

function updateMainDoseEditor(schedule) {
  const bolusInput = document.getElementById('mainBolusAmount');
  const infusionInput = document.getElementById('mainInfusionRate');
  const bolusLabel = document.getElementById('mainBolusLabel');
  const infusionLabel = document.getElementById('mainInfusionLabel');
  const bolusUnit = document.getElementById('mainBolusUnit');
  const infusionUnit = document.getElementById('mainInfusionUnit');
  const hint = document.getElementById('quickDoseEditorHint');
  if (!bolusInput || !infusionInput) return;

  if (getTciConfig().enabled) {
    bolusInput.value = '';
    infusionInput.value = '';
    bolusInput.disabled = true;
    infusionInput.disabled = true;
    if (bolusLabel) bolusLabel.textContent = 'Manual bolus disabled';
    if (infusionLabel) infusionLabel.textContent = 'Manual infusion disabled';
    if (hint) hint.textContent = 'Educational TCI is active. Adjust the target and maximum rate above.';
    return;
  }

  if (bolusUnit) bolusUnit.textContent = currentBolusUnit.name;
  if (infusionUnit) infusionUnit.textContent = currentInfusionUnit.name;

  if (schedule?.enabled) {
    const firstBolus = schedule.boluses?.[0];
    const firstInfusion = schedule.infusions?.[0];
    bolusInput.value = firstBolus ? formatInputValue(firstBolus.dose) : '';
    infusionInput.value = firstInfusion ? formatInputValue(firstInfusion.rate) : '';
    bolusInput.disabled = !firstBolus;
    infusionInput.disabled = !firstInfusion;
    if (bolusLabel) bolusLabel.textContent = firstBolus ? 'Earliest bolus' : 'No scheduled bolus';
    if (infusionLabel) infusionLabel.textContent = firstInfusion ? 'Earliest infusion' : 'No scheduled infusion';
    if (hint) hint.textContent = 'Schedule active: these controls update the earliest events. Use the timeline or schedule table to edit other events.';
    return;
  }

  bolusInput.value = bnum ? formatInputValue(parseFloatSafe(bnum.value, 0)) : '';
  infusionInput.value = infusionnum ? formatInputValue(parseFloatSafe(infusionnum.value, 0)) : '';
  bolusInput.disabled = false;
  infusionInput.disabled = false;
  if (bolusLabel) bolusLabel.textContent = 'Bolus';
  if (infusionLabel) infusionLabel.textContent = 'Infusion';
  if (hint) hint.textContent = 'Updates the current bolus and infusion.';
}

// ============================
// Direct timeline editing
// ============================
let selectedTimelineEvent = null;

function getTimelineEventDetails(segment, schedule) {
  if (segment.type === 'bolus') {
    const event = schedule?.enabled ? schedule.boluses?.[segment.index] : { dose: parseFloatSafe(bnum?.value, 0), duration: parseFloatSafe(tbolusnum?.value, 0) };
    return `${segment.label}: ${formatInputValue(event?.dose || 0)} ${currentBolusUnit.name} at ${formatInputValue(segment.start)} min${event?.duration > 0 ? ` over ${formatInputValue(event.duration)} min` : ''}`;
  }
  const event = schedule?.enabled ? schedule.infusions?.[segment.index] : { rate: parseFloatSafe(infusionnum?.value, 0) };
  return `${segment.label}: ${formatInputValue(event?.rate || 0)} ${currentInfusionUnit.name} from ${formatInputValue(segment.start)} to ${formatInputValue(segment.end)} min`;
}

function getSelectedTimelineEvent(schedule = getScheduleFromDOM()) {
  if (!selectedTimelineEvent || !schedule?.enabled) return null;
  const events = selectedTimelineEvent.type === 'bolus' ? schedule.boluses : schedule.infusions;
  const event = events?.[selectedTimelineEvent.index];
  return event ? { ...selectedTimelineEvent, event } : null;
}

function renderTimelineEventEditor(schedule = getScheduleFromDOM()) {
  const editor = document.getElementById('timelineEventEditor');
  const selected = getSelectedTimelineEvent(schedule);
  if (!editor) return;
  editor.hidden = !selected;
  if (!selected) return;

  const isBolus = selected.type === 'bolus';
  const toggleField = (id, visible) => { const field = document.getElementById(id); if (field) field.hidden = !visible; };
  toggleField('timelineBolusTimeField', isBolus);
  toggleField('timelineBolusDoseField', isBolus);
  toggleField('timelineBolusDurationField', isBolus);
  toggleField('timelineInfusionStartField', !isBolus);
  toggleField('timelineInfusionEndField', !isBolus);
  toggleField('timelineInfusionRateField', !isBolus);
  document.getElementById('timelineEventEditorHeading').textContent = `${isBolus ? 'Bolus' : 'Infusion'} ${selected.index + 1}`;
  document.getElementById('timelineEventDoseUnit').textContent = currentBolusUnit.name;
  document.getElementById('timelineEventRateUnit').textContent = currentInfusionUnit.name;
  if (isBolus) {
    document.getElementById('timelineEventTime').value = formatInputValue(selected.event.time);
    document.getElementById('timelineEventDose').value = formatInputValue(selected.event.dose);
    document.getElementById('timelineEventDuration').value = formatInputValue(selected.event.duration);
  } else {
    document.getElementById('timelineEventStart').value = formatInputValue(selected.event.start);
    document.getElementById('timelineEventEnd').value = formatInputValue(selected.event.end);
    document.getElementById('timelineEventRate').value = formatInputValue(selected.event.rate);
  }
}

function selectTimelineEvent(type, index) {
  const schedule = getEditableTimelineSchedule();
  const events = type === 'bolus' ? schedule.boluses : schedule.infusions;
  if (!Number.isInteger(index) || index < 0 || index >= events.length) return;
  selectedTimelineEvent = { type, index };
  if (!getScheduleFromDOM().enabled) {
    setScheduleToDOM(schedule);
    disableLegacyBolusInfusionInputs(true);
  }
  dfsolve();
  setSimulationStatus(`${type === 'bolus' ? 'Bolus' : 'Infusion'} selected. Edit its details below the timeline.`, 'ok');
}

function saveSelectedTimelineEvent() {
  const schedule = getEditableTimelineSchedule();
  const selected = getSelectedTimelineEvent(schedule);
  if (!selected) return;
  const { event } = selected;
  const invalid = [];
  if (selected.type === 'bolus') {
    event.time = Number(document.getElementById('timelineEventTime')?.value);
    event.dose = Number(document.getElementById('timelineEventDose')?.value);
    event.duration = Number(document.getElementById('timelineEventDuration')?.value);
    if (![event.time, event.dose, event.duration].every(value => Number.isFinite(value) && value >= 0)) invalid.push('Enter non-negative time, dose, and duration values.');
    schedule.boluses.sort((a, b) => a.time - b.time);
    selectedTimelineEvent.index = schedule.boluses.indexOf(event);
  } else {
    event.start = Number(document.getElementById('timelineEventStart')?.value);
    event.end = Number(document.getElementById('timelineEventEnd')?.value);
    event.rate = Number(document.getElementById('timelineEventRate')?.value);
    if (![event.start, event.end, event.rate].every(value => Number.isFinite(value) && value >= 0) || event.end < event.start) invalid.push('Enter non-negative start, end, and rate values; end must not precede start.');
    schedule.infusions.sort((a, b) => a.start - b.start);
    selectedTimelineEvent.index = schedule.infusions.indexOf(event);
  }
  if (invalid.length) {
    setSimulationStatus(invalid[0], 'error');
    return;
  }
  commitTimelineSchedule(schedule, `${selected.type === 'bolus' ? 'Bolus' : 'Infusion'} updated.`);
}

function duplicateSelectedTimelineEvent() {
  const schedule = getEditableTimelineSchedule();
  const selected = getSelectedTimelineEvent(schedule);
  if (!selected) return;
  const tfinal = Math.max(0.1, parseFloatSafe(tfinalnum?.value, 0.1));
  if (selected.type === 'bolus') {
    const copy = { ...selected.event, time: clamp(selected.event.time + 1, 0, tfinal) };
    schedule.boluses.push(copy);
    schedule.boluses.sort((a, b) => a.time - b.time);
    selectedTimelineEvent = { type: 'bolus', index: schedule.boluses.indexOf(copy) };
  } else {
    const duration = Math.max(0.1, selected.event.end - selected.event.start);
    const start = clamp(selected.event.start + 1, 0, Math.max(0, tfinal - duration));
    const copy = { ...selected.event, start, end: Math.min(tfinal, start + duration) };
    schedule.infusions.push(copy);
    schedule.infusions.sort((a, b) => a.start - b.start);
    selectedTimelineEvent = { type: 'infusion', index: schedule.infusions.indexOf(copy) };
  }
  commitTimelineSchedule(schedule, `${selected.type === 'bolus' ? 'Bolus' : 'Infusion'} duplicated.`);
}

function deleteSelectedTimelineEvent() {
  if (!selectedTimelineEvent) return;
  const { type, index } = selectedTimelineEvent;
  selectedTimelineEvent = null;
  removeTimelineEvent(type, index);
}

function getTimelineTimeFromPointer(event, track) {
  const rect = track.getBoundingClientRect();
  const tfinal = Math.max(0.1, parseFloatSafe(tfinalnum?.value, 0.1));
  const fraction = clamp((event.clientX - rect.left) / Math.max(rect.width, 1), 0, 1);
  return clamp(Math.round(fraction * tfinal * 10) / 10, 0, tfinal);
}

function getEditableTimelineSchedule() {
  const current = getScheduleFromDOM();
  if (current.enabled) return current;
  const bolusDuration = Math.max(0, parseFloatSafe(tbolusnum?.value, 0));
  return {
    enabled: true,
    boluses: [{ time: 0, dose: Math.max(0, parseFloatSafe(bnum?.value, 0)), duration: bolusDuration }],
    infusions: [{
      start: bolusDuration,
      end: bolusDuration + Math.max(0, parseFloatSafe(tinfusionnum?.value, 0)),
      rate: Math.max(0, parseFloatSafe(infusionnum?.value, 0))
    }]
  };
}

function timelineDefaultBolusDose(schedule) {
  const last = schedule.boluses[schedule.boluses.length - 1];
  return last?.dose || Math.max(parseFloatSafe(bnum?.value, 0), 0.01);
}

function timelineDefaultInfusionRate(schedule) {
  const last = schedule.infusions[schedule.infusions.length - 1];
  return last?.rate || Math.max(parseFloatSafe(infusionnum?.value, 0), 0.01);
}

function commitTimelineSchedule(schedule, message, { undoSchedule = null } = {}) {
  document.getElementById('tciEnabled').checked = false;
  setScheduleToDOM(schedule);
  disableLegacyBolusInfusionInputs(true);
  expandDrawerCard('scheduleCard');
  dfsolve();
  timelineUndoSchedule = undoSchedule;
  setSimulationStatus(message, 'ok', { showUndo: Boolean(undoSchedule) });
}

function expandDrawerCard(id) {
  const card = document.getElementById(id);
  const header = card?.querySelector('.card-header');
  const body = header?.nextElementSibling;
  if (!body) return;
  body.style.display = 'block';
  header?.setAttribute('aria-expanded', 'true');
  const icon = header?.querySelector('.toggle-icon');
  if (icon) icon.textContent = '▼';
}

function removeTimelineEvent(type, index) {
  const schedule = getEditableTimelineSchedule();
  const priorSchedule = JSON.parse(JSON.stringify(schedule));
  const events = type === 'bolus' ? schedule.boluses : schedule.infusions;
  if (!Number.isInteger(index) || index < 0 || index >= events.length) return;
  events.splice(index, 1);
  selectedTimelineEvent = null;
  commitTimelineSchedule(schedule, `${type === 'bolus' ? 'Bolus' : 'Infusion'} removed from the schedule.`, { undoSchedule: priorSchedule });
}

function ensureTimelineEditor() {
  const track = document.getElementById('doseTimelineTrack');
  if (!track || track.dataset.timelineEditorReady === 'true') return;
  track.dataset.timelineEditorReady = 'true';

  let pointerStart = null;
  let dragging = false;
  let draft = null;

  const clearDraft = () => {
    draft?.remove();
    draft = null;
    track.classList.remove('is-dragging');
  };

  const renderDraft = (start, end) => {
    if (!draft) {
      draft = document.createElement('span');
      draft.className = 'dose-timeline__draft';
      track.appendChild(draft);
    }
    const tfinal = Math.max(0.1, parseFloatSafe(tfinalnum?.value, 0.1));
    const left = Math.min(start, end);
    const width = Math.max(0.5, Math.abs(end - start) / tfinal * 100);
    draft.style.left = `${left / tfinal * 100}%`;
    draft.style.width = `${width}%`;
  };

  track.addEventListener('pointerdown', event => {
    if (getTciConfig().enabled) return;
    if (event.button !== undefined && event.button !== 0) return;
    const segment = event.target.closest('.dose-timeline__segment');
    pointerStart = { x: event.clientX, time: getTimelineTimeFromPointer(event, track), segment };
    dragging = false;
    if (!segment) {
      track.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    }
  });

  track.addEventListener('pointermove', event => {
    if (!pointerStart || pointerStart.segment) return;
    const currentTime = getTimelineTimeFromPointer(event, track);
    if (Math.abs(event.clientX - pointerStart.x) > 6) dragging = true;
    if (dragging) {
      track.classList.add('is-dragging');
      renderDraft(pointerStart.time, currentTime);
    }
  });

  track.addEventListener('pointerup', event => {
    if (!pointerStart) return;
    const start = pointerStart;
    const endTime = getTimelineTimeFromPointer(event, track);
    pointerStart = null;
    clearDraft();

    if (start.segment) {
      if (Math.abs(event.clientX - start.x) <= 6) {
        selectTimelineEvent(start.segment.dataset.eventType, Number(start.segment.dataset.eventIndex));
      }
      return;
    }

    const schedule = getEditableTimelineSchedule();
    if (dragging) {
      const infusionStart = Math.min(start.time, endTime);
      const infusionEnd = Math.max(infusionStart + 0.1, Math.max(start.time, endTime));
      schedule.infusions.push({ start: infusionStart, end: infusionEnd, rate: timelineDefaultInfusionRate(schedule) });
      schedule.infusions.sort((a, b) => a.start - b.start);
      const eventIndex = schedule.infusions.findIndex(event => event.start === infusionStart && event.end === infusionEnd);
      selectedTimelineEvent = { type: 'infusion', index: eventIndex };
      commitTimelineSchedule(schedule, `Infusion added from ${formatInputValue(infusionStart)} to ${formatInputValue(infusionEnd)} min. Edit its rate below the timeline.`);
    } else {
      schedule.boluses.push({ time: start.time, dose: timelineDefaultBolusDose(schedule), duration: 0 });
      schedule.boluses.sort((a, b) => a.time - b.time);
      selectedTimelineEvent = { type: 'bolus', index: schedule.boluses.findIndex(event => event.time === start.time && event.duration === 0) };
      commitTimelineSchedule(schedule, `Bolus added at ${formatInputValue(start.time)} min. Edit its dose below the timeline.`);
    }
    dragging = false;
  });

  track.addEventListener('pointercancel', () => {
    pointerStart = null;
    dragging = false;
    clearDraft();
  });

  track.addEventListener('keydown', event => {
    if (getTciConfig().enabled) return;
    const segment = event.target.closest('.dose-timeline__segment');
    if (!segment || !['Enter', ' ', 'Delete', 'Backspace'].includes(event.key)) return;
    event.preventDefault();
    if (['Delete', 'Backspace'].includes(event.key)) removeTimelineEvent(segment.dataset.eventType, Number(segment.dataset.eventIndex));
    else selectTimelineEvent(segment.dataset.eventType, Number(segment.dataset.eventIndex));
  });
}

function updatePdfDoseProtocol(params, schedule) {
  const container = document.getElementById('pdfDoseProtocol');
  if (!container) return;
  container.textContent = '';

  const addTable = (title, headers, rows) => {
    if (!rows.length) return;
    const section = document.createElement('section');
    const heading = document.createElement('h4');
    heading.textContent = title;
    const table = document.createElement('table');
    table.className = 'pdf-dose-table';
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headers.forEach(header => {
      const cell = document.createElement('th');
      cell.textContent = header;
      headerRow.appendChild(cell);
    });
    thead.appendChild(headerRow);
    const tbody = document.createElement('tbody');
    rows.forEach(row => {
      const tr = document.createElement('tr');
      row.forEach(value => {
        const cell = document.createElement('td');
        cell.textContent = value;
        tr.appendChild(cell);
      });
      tbody.appendChild(tr);
    });
    table.append(thead, tbody);
    section.append(heading, table);
    container.appendChild(section);
  };

  const formatTime = value => `${formatInputValue(parseFloatSafe(value, 0))} min`;
  const protocol = document.createElement('p');
  protocol.className = 'pdf-dose-note';
  protocol.textContent = `Simulation duration: ${formatTime(params.tfinal)}.`;
  container.appendChild(protocol);

  const tci = getTciConfig();
  if (tci.enabled) {
    addTable(
      'Educational target-controlled infusion settings',
      ['Target compartment', `Target (${currentUnit.name})`, `Maximum rate (${currentInfusionUnit.name})`, 'Infusion stop'],
      [[tci.targetType === 'ce' ? 'Effect site (Ce)' : 'Plasma (Cp)', formatInputValue(tci.target), formatInputValue(document.getElementById('tciMaxRate')?.value), formatTime(Math.min(tci.stopTime, params.tfinal))]]
    );
    const note = document.createElement('p');
    note.className = 'pdf-dose-note';
    note.textContent = 'The calculated variable infusion rate is shown in the TCI rate graph above.';
    container.appendChild(note);
    return;
  }

  if (schedule?.enabled) {
    addTable(
      'Bolus events',
      ['Time', `Dose (${currentBolusUnit.name})`, 'Duration'],
      (schedule.boluses || []).map(event => [formatTime(event.time), formatInputValue(event.dose), formatTime(event.duration)])
    );
    addTable(
      'Infusion segments',
      ['Start', 'End', `Rate (${currentInfusionUnit.name})`],
      (schedule.infusions || []).map(event => [formatTime(event.start), formatTime(event.end), formatInputValue(event.rate)])
    );
    if (!(schedule.boluses || []).length && !(schedule.infusions || []).length) {
      const empty = document.createElement('p');
      empty.textContent = 'No non-zero scheduled doses were entered.';
      container.appendChild(empty);
    }
    return;
  }

  addTable(
    'Bolus',
    ['Start', `Dose (${currentBolusUnit.name})`, 'Duration'],
    [[formatTime(0), formatInputValue(parseFloatSafe(bnum.value, 0)), formatTime(params.tbolus)]]
  );
  addTable(
    'Infusion',
    ['Start', 'End', `Rate (${currentInfusionUnit.name})`],
    [[formatTime(params.tbolus), formatTime(params.tbolus + params.tinfusion), formatInputValue(parseFloatSafe(infusionnum.value, 0))]]
  );
}

function updatePdfReportSummary(params, schedule) {
  const container = document.getElementById('pdfReportMeta');
  if (!container) return;
  container.textContent = '';
  const drug = DRUGS.find(item => item.id === currentDrug);
  const tci = getTciConfig();
  const items = [
    ['Drug/model', drug ? `${drug.label}${presetIsModified ? ' — modified parameters' : ''}` : 'Custom model'],
    ['Patient weight', `${formatInputValue(params.weightKg)} kg`],
    ['Simulation duration', `${formatInputValue(params.tfinal)} min`],
    ['PK inputs', getPkInputMode() === 'microconstants' ? 'Microconstants' : 'Clearance & volumes'],
    ['Delivery strategy', tci.enabled ? `Educational TCI (${tci.targetType === 'ce' ? 'Ce' : 'Cp'} target)` : (schedule?.enabled ? 'Custom dose schedule' : 'Bolus + infusion')]
  ];
  items.forEach(([label, value]) => {
    const item = document.createElement('div');
    const term = document.createElement('strong');
    term.textContent = `${label}: `;
    item.append(term, document.createTextNode(value));
    container.appendChild(item);
  });
}

function initDistributionDetails() {
  const details = document.getElementById('distributionDetails');
  if (!details) return;
  details.addEventListener('toggle', () => {
    if (!details.open) return;
    setTimeout(() => ['myDiv2', 'myDiv3'].forEach(id => {
      const el = document.getElementById(id);
      if (el && window.Plotly) Plotly.Plots.resize(el);
    }), 0);
  });
}

function exportSimulationPdf() {
  if (latestPdfContext) updatePdfDoseProtocol(latestPdfContext.params, latestPdfContext.schedule);
  const expandableSections = $$('.distribution-details, .model-details');
  const priorStates = expandableSections.map(section => section.open);
  const generatedAt = document.getElementById('pdfGeneratedAt');
  if (generatedAt) {
    generatedAt.textContent = `Generated ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date())}`;
  }

  document.body.classList.add('print-report');
  expandableSections.forEach(section => { section.open = true; });

  // Plotly needs a layout pass once hidden detail panels become printable.
  setTimeout(() => {
    ['myDiv1', 'myDiv2', 'myDiv3', 'tciRatePlot'].forEach(id => {
      const el = document.getElementById(id);
      if (el && window.Plotly) Plotly.Plots.resize(el);
    });
    window.print();
  }, 120);

  window.addEventListener('afterprint', () => {
    document.body.classList.remove('print-report');
    expandableSections.forEach((section, index) => { section.open = priorStates[index]; });
    setTimeout(() => ['myDiv1', 'myDiv2', 'myDiv3', 'tciRatePlot'].forEach(id => {
      const el = document.getElementById(id);
      if (el && window.Plotly) Plotly.Plots.resize(el);
    }), 0);
  }, { once: true });
}

function ensureScheduleUI() {
  const useCb = document.getElementById('useSchedule');
  const bolusTbl = document.getElementById('bolusEventsTable');
  const infTbl = document.getElementById('infusionEventsTable');
  const addB = document.getElementById('addBolusEventBtn');
  const addI = document.getElementById('addInfusionEventBtn');
  const clrB = document.getElementById('clearBolusEventsBtn');
  const clrI = document.getElementById('clearInfusionEventsBtn');
  const convertBasicBtn = document.getElementById('loadScheduleExampleBtn');
  if (!useCb || !bolusTbl || !infTbl || !addB || !addI || !clrB || !clrI) return;

  useCb.checked = false;
  disableLegacyBolusInfusionInputs(false);
  updateScheduleUnitLabels();

  if (bolusTbl.tBodies[0].rows.length === 0) addBolusRow({ time: 0, dose: 0, duration: 0 });
  if (infTbl.tBodies[0].rows.length === 0) addInfusionRow({ start: 0, end: 0, rate: 0 });

  useCb.addEventListener('change', () => {
    if (useCb.checked) document.getElementById('tciEnabled').checked = false;
    disableLegacyBolusInfusionInputs(useCb.checked);
    dfsolve();
  });
  addB.addEventListener('click', () => { addBolusRow(); dfsolve(); });
  addI.addEventListener('click', () => { addInfusionRow(); dfsolve(); });
  clrB.addEventListener('click', () => { clearTable(bolusTbl); addBolusRow({ time: 0, dose: 0, duration: 0 }); dfsolve(); });
  clrI.addEventListener('click', () => { clearTable(infTbl); addInfusionRow({ start: 0, end: 0, rate: 0 }); dfsolve(); });
  convertBasicBtn?.addEventListener('click', () => {
    document.getElementById('tciEnabled').checked = false;
    const duration = Math.max(0, parseFloatSafe(tbolusnum.value, 0));
    setScheduleToDOM({
      enabled: true,
      boluses: [{ time: 0, dose: parseFloatSafe(bnum.value, 0), duration }],
      infusions: [{ start: duration, end: duration + Math.max(0, parseFloatSafe(tinfusionnum.value, 0)), rate: parseFloatSafe(infusionnum.value, 0) }]
    });
    disableLegacyBolusInfusionInputs(true);
    dfsolve();
  });
  $$('[data-import-tci-schedule]').forEach(button => button.addEventListener('click', importCurrentTciAsSchedule));
  document.getElementById('simplifyTciScheduleBtn')?.addEventListener('click', () => replaceWithTciOriginal(true));
  document.getElementById('restoreExactTciScheduleBtn')?.addEventListener('click', () => replaceWithTciOriginal(false));
  document.getElementById('undoTciImportBtn')?.addEventListener('click', undoTciImport);
  document.getElementById('showTciReference')?.addEventListener('change', dfsolve);

  let scheduleEditTimer = null;
  const scheduleInput = () => {
    if (!useCb.checked) return;
    clearTimeout(scheduleEditTimer);
    scheduleEditTimer = setTimeout(() => { scheduleEditTimer = null; dfsolve(); }, 250);
  };
  const scheduleChange = () => {
    if (!useCb.checked) return;
    clearTimeout(scheduleEditTimer);
    scheduleEditTimer = null;
    dfsolve();
  };
  bolusTbl.addEventListener('input', scheduleInput);
  infTbl.addEventListener('input', scheduleInput);
  bolusTbl.addEventListener('change', scheduleChange);
  infTbl.addEventListener('change', scheduleChange);

  bolusTbl.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button');
    if (!btn) return;
    if (btn.dataset.action === 'remove') {
      btn.closest('tr')?.remove();
      if (useCb.checked) dfsolve();
    }
  });

  infTbl.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button');
    if (!btn) return;
    if (btn.dataset.action === 'remove') {
      btn.closest('tr')?.remove();
      if (useCb.checked) dfsolve();
    }
  });
}

// ============================
// Therapeutic ranges + toggle (kept)
// ============================
let currentDrug = null;
let presetIsModified = false;
let showTherapeutic = true;

function markPresetModified() {
  if (!currentDrug || presetIsModified) return;
  presetIsModified = true;
  setCurrentDrugLabel();
}

const EFFECT_SITE_RANGES = {
  "propofol": [
    {"label": "Sedation (plasma)", "unit": "µg/mL", "low": 1.0, "high": 2.0, "color": "#1f77b4"},
    {"label": "General anesthesia (plasma)", "unit": "µg/mL", "low": 3.0, "high": 6.0, "color": "#1f77b4"},
    {"label": "Effect-site hypnosis (Ce)", "unit": "µg/mL", "low": 2.5, "high": 4.0, "color": "#ff7f0e"}
  ],
  "etomidate": [
    {"label": "Hypnosis (plasma)", "unit": "µg/mL", "low": 0.2, "high": 0.4, "color": "#1f77b4"}
  ],
  "ketamine": [
    {"label": "Analgesia (plasma)", "unit": "ng/mL", "low": 100.0, "high": 200.0, "color": "#1f77b4"},
    {"label": "Dissociative anesthesia (plasma)", "unit": "µg/mL", "low": 1.0, "high": 2.0, "color": "#1f77b4"}
  ],
  "dexmedetomidine": [
    {"label": "Sedation (plasma)", "unit": "ng/mL", "low": 0.3, "high": 1.2, "color": "#1f77b4"},
    {"label": "Deep sedation (plasma)", "unit": "ng/mL", "low": 1.2, "high": 2.0, "color": "#1f77b4"}
  ],
  "midazolam": [
    {"label": "Sedation (plasma)", "unit": "µg/mL", "low": 0.05, "high": 0.15, "color": "#1f77b4"},
    {"label": "Anesthesia (plasma)", "unit": "µg/mL", "low": 0.2, "high": 0.5, "color": "#1f77b4"}
  ],
  "diazepam": [
    {"label": "Anxiolysis/sedation (plasma)", "unit": "µg/mL", "low": 0.2, "high": 2.0, "color": "#1f77b4"}
  ],
  "fentanyl": [
    {"label": "Analgesia (effect-site Ce)", "unit": "ng/mL", "low": 1.0, "high": 2.0, "color": "#ff7f0e"},
    {"label": "Anesthesia (effect-site Ce)", "unit": "ng/mL", "low": 2.0, "high": 4.0, "color": "#ff7f0e"}
  ],
  "hydromorphone": [],
  "remifentanil": [
    {"label": "Analgesia (effect-site Ce)", "unit": "ng/mL", "low": 1.0, "high": 3.0, "color": "#ff7f0e"},
    {"label": "Anesthesia (effect-site Ce)", "unit": "ng/mL", "low": 3.0, "high": 8.0, "color": "#ff7f0e"}
  ],
  "sufentanil": [
    {"label": "Analgesia (effect-site Ce)", "unit": "ng/mL", "low": 0.1, "high": 0.3, "color": "#ff7f0e"},
    {"label": "Anesthesia (effect-site Ce)", "unit": "ng/mL", "low": 0.3, "high": 0.7, "color": "#ff7f0e"}
  ],
  "alfentanil": [
    {"label": "Analgesia (effect-site Ce)", "unit": "ng/mL", "low": 50.0, "high": 150.0, "color": "#ff7f0e"},
    {"label": "Anesthesia (effect-site Ce)", "unit": "ng/mL", "low": 150.0, "high": 300.0, "color": "#ff7f0e"}
  ],
  "methadone": [
    {"label": "Analgesia (plasma)", "unit": "ng/mL", "low": 30.0, "high": 100.0, "color": "#1f77b4"}
  ],
  "rocuronium": [], "vecuronium": [], "cisatracurium": [], "pancuronium": [], "succinylcholine": [],
  "lidocaine": [ {"label": "Antiarrhythmic therapeutic (plasma)", "unit": "µg/mL", "low": 1.5, "high": 5.0, "color": "#1f77b4"} ],
  "bupivacaine": [],
  "phenylephrine": [], "ephedrine": [], "epinephrine": [], "dobutamine": [], "dopamine": [], "milrinone": [], "vasopressin": []
};

function valToDisplayY(value, unitName) {
  const sourceUnit = UNITS[unitName];
  if (!sourceUnit) return value;
  const mgPerMl = value / sourceUnit.factor;
  return mgPerMl * currentUnit.factor;
}

function buildTherapeuticShapes(finalTime) {
  const shapes = [];
  const legendTraces = [];
  if (!showTherapeutic || !currentDrug || presetIsModified) return { shapes, legendTraces };
  const ranges = EFFECT_SITE_RANGES[currentDrug] || [];
  if (!Array.isArray(ranges) || ranges.length === 0) return { shapes, legendTraces };
  const x0 = 0, x1 = finalTime;

  ranges.forEach((r) => {
    const yLow = valToDisplayY(r.low, r.unit);
    const yHigh = valToDisplayY(r.high, r.unit);
    shapes.push({
      type: 'rect', xref: 'x', yref: 'y',
      x0, x1, y0: yLow, y1: yHigh,
      fillcolor: r.color, opacity: 0.15, line: { width: 0 }
    });
    legendTraces.push({
      x: [null], y: [null], mode: 'lines',
      name: `${r.label} ${r.low}–${r.high} ${r.unit}`,
      line: { color: r.color, width: 10 },
      hoverinfo: 'skip',
      legendgroup: 'therapeutic',
      legendgrouptitle: { text: 'Therapeutic ranges (Cp/Ce)' }
    });
  });

  return { shapes, legendTraces };
}

function ensureTherapeuticToggle() {
  if (document.getElementById('toggleTherapeutic')) return;
  try {
    const container = document.createElement('div');
    container.id = 'therapeuticToggleContainer';
    container.style.margin = '10px 0 0';
    container.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

    const label = document.createElement('label');
    label.style.cursor = 'pointer';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = 'toggleTherapeutic';
    cb.checked = showTherapeutic;

    const text = document.createTextNode(' Show therapeutic ranges');
    label.appendChild(cb);
    label.appendChild(text);
    container.appendChild(label);

    const plotDiv = document.getElementById('myDiv1');
    if (plotDiv && plotDiv.parentNode) plotDiv.parentNode.insertBefore(container, plotDiv);

    cb.addEventListener('change', function () {
      showTherapeutic = this.checked;
      dfsolve();
    });
  } catch (e) {
    console.warn('Could not add therapeutic toggle checkbox:', e);
  }
}

// Legend formatting helper
function legendOutsideBottom(layout, { y = -0.40, bottom = 140, fontSize = 11, itemWidth = 90 } = {}) {
  layout.legend = {
    ...(layout.legend || {}),
    orientation: 'h',
    x: 0.5, xanchor: 'center',
    y, yanchor: 'top', yref: 'paper',
    bgcolor: 'rgba(0,0,0,0)',
    borderwidth: 0,
    font: { size: fontSize },
    itemwidth: itemWidth,
    itemclick: 'toggle',
    itemdoubleclick: 'toggleothers',
    tracegroupgap: 8
  };

  const m = layout.margin || {};
  layout.margin = {
    t: Math.max(55, m.t || 0),
    r: Math.max(20, m.r || 0),
    b: Math.max(bottom, m.b || 0),
    l: Math.max(60, m.l || 0),
    pad: 4
  };

  layout.xaxis = layout.xaxis || {};
  layout.xaxis.title = { ...(layout.xaxis.title || {}), standoff: 10 };
  layout.xaxis.automargin = true;
  return layout;
}

// ============================
// Comparison feature (kept; minimal changes)
// ============================
let strategies = [];
let compareMode = false;
let activeStrategyId = null;

function uuidLike() {
  try { return (crypto && crypto.randomUUID) ? crypto.randomUUID() : ('id-' + Math.random().toString(16).slice(2) + Date.now().toString(16)); }
  catch (e) { return 'id-' + Math.random().toString(16).slice(2) + Date.now().toString(16); }
}

function plural(n, one, many) { return (n === 1) ? one : many; }

function scheduleCounts(schedule) {
  if (!schedule || !schedule.enabled) return { boluses: 1, infusions: 1 };
  const b = Array.isArray(schedule.boluses) ? schedule.boluses.length : 0;
  const i = Array.isArray(schedule.infusions) ? schedule.infusions.length : 0;
  return { boluses: b, infusions: i };
}

function getCurrentState(name = 'Current') {
  return {
    id: 'live',
    name,
    drug: currentDrug,
    presetModified: presetIsModified,
    patient: {
      weightKg: getWeightKg()
    },
    units: {
      conc: currentUnit?.name || 'mg/mL',
      bolus: currentBolusUnit?.name || 'mg/kg',
      infusion: currentInfusionUnit?.name || 'mg/kg/min'
    },
    inputs: {
      b: parseFloatSafe(bnum.value),
      tbolus: parseFloatSafe(tbolusnum.value),
      infusion: parseFloatSafe(infusionnum.value),
      tinfusion: parseFloatSafe(tinfusionnum.value),
      tfinal: parseFloatSafe(tfinalnum.value),
      initialp: parseFloatSafe(initialpnum.value)
    },
    schedule: getScheduleFromDOM(),
    tci: {
      enabled: Boolean(document.getElementById('tciEnabled')?.checked),
      targetType: document.getElementById('tciTargetType')?.value === 'ce' ? 'ce' : 'cp',
      target: parseFloatSafe(document.getElementById('tciTarget')?.value, 0),
      maxRate: parseFloatSafe(document.getElementById('tciMaxRate')?.value, 0),
      stopTime: parseFloatSafe(document.getElementById('tciStopTime')?.value, 0)
    },
    pk: {
      inputMode: getPkInputMode(),
      Vd1: parseFloatSafe(Vd1num.value, 0),
      Vd2: parseFloatSafe(Vd2num.value, 0),
      Vd3: parseFloatSafe(Vd3num.value, 0),
      Cl: parseFloatSafe(Clnum.value, 0),
      Q2: parseFloatSafe(Q2num.value, 0),
      Q3: parseFloatSafe(Q3num.value, 0),
      k10: parseFloatSafe(k10inputnum?.value, 0),
      k12: parseFloatSafe(k12inputnum?.value, 0),
      k21: parseFloatSafe(k21inputnum?.value, 0),
      k13: parseFloatSafe(k13inputnum?.value, 0),
      k31: parseFloatSafe(k31inputnum?.value, 0),
      ke0: Number.isFinite(parseFloat(ke0num.value)) ? parseFloat(ke0num.value) : 0
    }
  };
}

function renderStrategyList() {
  const list = document.getElementById('strategyList');
  if (!list) return;
  if (!strategies.length) {
    list.innerHTML = '<div class="list-group-item text-muted">No saved strategies yet.</div>';
    return;
  }

  const rows = strategies.map(s => {
    const activeClass = (s.id === activeStrategyId) ? 'border-primary' : '';
    const c = scheduleCounts(s.schedule);
    const subtitle = `${c.boluses} ${plural(c.boluses,'bolus','boluses')}; ${c.infusions} ${plural(c.infusions,'infusion','infusions')}; tfinal ${s.inputs.tfinal} min`;
    return `
      <div class="list-group-item ${activeClass}" data-id="${escapeHtml(s.id)}">
        <div class="d-flex justify-content-between align-items-start gap-2">
          <div class="flex-grow-1">
            <input class="form-control form-control-sm strategy-name" data-id="${escapeHtml(s.id)}" value="${escapeHtml(s.name)}" />
            <div class="small text-muted mt-1">${subtitle}</div>
          </div>
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-primary" type="button" data-action="load" data-id="${escapeHtml(s.id)}">Load</button>
            <button class="btn btn-outline-danger" type="button" data-action="delete" data-id="${escapeHtml(s.id)}">✕</button>
          </div>
        </div>
      </div>`;
  }).join('');

  list.innerHTML = rows;
}

function captureCurrentStrategy() {
  const live = getCurrentState();
  const n = strategies.length + 1;
  const s = { ...live, id: uuidLike(), name: `${(currentDrug ?? 'Drug')} strategy ${n}` };
  strategies.push(s);
  activeStrategyId = s.id;
  renderStrategyList();
  dfsolve();
}

function clearStrategies() {
  strategies = [];
  activeStrategyId = null;
  renderStrategyList();
  const cr = document.getElementById('compareResults');
  if (cr) cr.innerHTML = '';
  dfsolve();
}

function loadStrategyToInputs(id) {
  const s = strategies.find(x => x.id === id);
  if (!s) return;
  tciImportSession = null;
  restoreSimulationState(s);
  activeStrategyId = s.id;
  renderStrategyList();
  dfsolve();
}

function restoreSimulationState(s) {
  const tciEnabled = document.getElementById('tciEnabled');
  if (tciEnabled) tciEnabled.checked = false;
  try {
    if (s.drug && typeof window[s.drug] === 'function') window[s.drug]();
  } catch (e) {
    console.warn('Could not switch drug preset:', e);
  }

  currentDrug = s.drug || null;
  presetIsModified = Boolean(s.presetModified);
  applyTciPreset(s.drug);
  if (typeof s.units?.conc === 'string') setDisplayUnit(s.units.conc, false);
  if (typeof s.units?.bolus === 'string') setBolusUnit(s.units.bolus, false);
  if (typeof s.units?.infusion === 'string') setInfusionUnit(s.units.infusion, false);

  bnum.value = s.inputs.b;
  tbolusnum.value = s.inputs.tbolus;
  infusionnum.value = s.inputs.infusion;
  tinfusionnum.value = s.inputs.tinfusion;
  tfinalnum.value = s.inputs.tfinal;
  initialpnum.value = s.inputs.initialp;
  if (weightnum && s.patient?.weightKg != null) weightnum.value = s.patient.weightKg;

  Vd1num.value = s.pk.Vd1;
  Vd2num.value = s.pk.Vd2;
  Vd3num.value = s.pk.Vd3;
  Clnum.value = s.pk.Cl;
  Q2num.value = s.pk.Q2;
  Q3num.value = s.pk.Q3;
  ke0num.value = s.pk.ke0;

  if (pkInputModeSelect) pkInputModeSelect.value = s.pk.inputMode || "clearance";
  if (k10inputnum) k10inputnum.value = s.pk.k10 ?? "";
  if (k12inputnum) k12inputnum.value = s.pk.k12 ?? "";
  if (k21inputnum) k21inputnum.value = s.pk.k21 ?? "";
  if (k13inputnum) k13inputnum.value = s.pk.k13 ?? "";
  if (k31inputnum) k31inputnum.value = s.pk.k31 ?? "";
  if ((s.pk.inputMode || "clearance") === "microconstants") syncClearanceInputsFromMicroInputs();
  else syncMicroInputsFromClearanceInputs();
  updatePkInputVisibility();

  if (s.schedule) setScheduleToDOM(s.schedule);
  if (tciEnabled) {
    tciEnabled.checked = Boolean(s.tci?.enabled) && !tciEnabled.disabled;
  }
  if (s.tci) {
    document.getElementById('tciTargetType').value = s.tci.targetType === 'ce' ? 'ce' : 'cp';
    document.getElementById('tciTarget').value = s.tci.target;
    document.getElementById('tciMaxRate').value = s.tci.maxRate;
    document.getElementById('tciStopTime').value = s.tci.stopTime;
  }
  disableLegacyBolusInfusionInputs(Boolean(tciEnabled?.checked || s.schedule?.enabled));
  setCurrentDrugLabel();
}

function undoTciImport() {
  if (!tciImportSession) return;
  const sourceState = tciImportSession.sourceState;
  tciImportSession = null;
  selectedTimelineEvent = null;
  restoreSimulationState(sourceState);
  dfsolve();
  setSimulationStatus('Original TCI settings restored. Schedule edits made since import were discarded.', 'ok');
}

function deleteStrategy(id) {
  strategies = strategies.filter(s => s.id !== id);
  if (activeStrategyId === id) activeStrategyId = (strategies[0]?.id || null);
  renderStrategyList();
  dfsolve();
}

function ensureCompareUI() {
  const cb = document.getElementById('compareMode');
  const addBtn = document.getElementById('addStrategyBtn');
  const clearBtn = document.getElementById('clearStrategiesBtn');
  const list = document.getElementById('strategyList');
  if (!cb || !addBtn || !clearBtn || !list) return;

  cb.checked = compareMode;
  cb.addEventListener('change', function () { compareMode = this.checked; dfsolve(); });
  addBtn.addEventListener('click', () => captureCurrentStrategy());
  clearBtn.addEventListener('click', () => clearStrategies());

  list.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const id = btn.getAttribute('data-id');
    if (action === 'load') loadStrategyToInputs(id);
    if (action === 'delete') deleteStrategy(id);
  });

  list.addEventListener('input', (ev) => {
    const inp = ev.target.closest('input.strategy-name');
    if (!inp) return;
    const id = inp.getAttribute('data-id');
    const s = strategies.find(x => x.id === id);
    if (s) s.name = inp.value;
  });

  renderStrategyList();
}

// Strategy simulation for comparison (kept, trimmed but equivalent)
function simulateStrategy(state) {
  const p = { ...(state.pk || {}) };
  const inp = state.inputs;

  if ((p.inputMode || "clearance") === "microconstants") {
    p.Vd2 = p.k21 > 0 ? (p.k12 * p.Vd1) / p.k21 : 0;
    p.Vd3 = p.k31 > 0 ? (p.k13 * p.Vd1) / p.k31 : 0;
    p.Cl = p.k10 * p.Vd1;
    p.Q2 = p.k12 * p.Vd1;
    p.Q3 = p.k13 * p.Vd1;
  }

  let k10, k12, k21, k13, k31;
  if ((p.inputMode || "clearance") === "microconstants") {
    k10 = parseFloatSafe(p.k10, 0);
    k12 = parseFloatSafe(p.k12, 0);
    k21 = parseFloatSafe(p.k21, 0);
    k13 = parseFloatSafe(p.k13, 0);
    k31 = parseFloatSafe(p.k31, 0);
  } else {
    k10 = p.Vd1 > 0 ? p.Cl / p.Vd1 : 0;
    k12 = p.Vd1 > 0 ? p.Q2 / p.Vd1 : 0;
    k21 = p.Vd2 > 0 ? p.Q2 / p.Vd2 : 0;
    k13 = p.Vd1 > 0 ? p.Q3 / p.Vd1 : 0;
    k31 = p.Vd3 > 0 ? p.Q3 / p.Vd3 : 0;
  }

  const initUnit = UNITS[state.units.conc] || UNITS['mg/mL'];
  const initialp_mgml = inp.initialp / initUnit.factor;

  const bUnit = BOLUSUNITS[state.units.bolus] || BOLUSUNITS['mg/kg'];
  const iUnit = INFUSIONUNITS[state.units.infusion] || INFUSIONUNITS['mg/kg/min'];
  const weightKg = (state.patient?.weightKg && state.patient.weightKg > 0) ? state.patient.weightKg : 70;
  const dosingPlan = buildDosingPlan({
    schedule: state.schedule,
    basic: { bolus: inp.b, tbolus: inp.tbolus, infusion: inp.infusion, tinfusion: inp.tinfusion },
    bolusUnit: bUnit,
    infusionUnit: iUnit,
    weightKg
  });
  const savedTci = state.tci || { enabled: false };
  const tci = {
    enabled: Boolean(savedTci.enabled),
    targetType: savedTci.targetType === 'ce' ? 'ce' : 'cp',
    targetBase: parseFloatSafe(savedTci.target, 0) / initUnit.factor,
    maxRate: convertInfusionValueToMgKgMin(savedTci.maxRate, iUnit, weightKg),
    stopTime: Math.max(0, parseFloatSafe(savedTci.stopTime, 0))
  };
  return simulatePkModel({
    pk: { V1: p.Vd1, V2: p.Vd2, V3: p.Vd3, k10, k12, k21, k13, k31 },
    ke0: parseFloatSafe(p.ke0, 0),
    initialConcentration: initialp_mgml,
    finalTime: Math.max(0, parseFloatSafe(inp.tfinal, 0)),
    dosingPlan,
    tci
  });
}

function trapz(y, x) {
  let s = 0;
  for (let i = 1; i < y.length; i++) {
    const dx = x[i] - x[i-1];
    s += 0.5 * (y[i] + y[i-1]) * dx;
  }
  return s;
}


function computeMetrics(state, sim) {
  const { ts, cp, ce } = sim;
  const idxCp = cp.reduce((imax, v, i, arr) => (v > arr[imax] ? i : imax), 0);
  const idxCe = sim.hasEffectSite ? ce.reduce((imax, v, i, arr) => (v > arr[imax] ? i : imax), 0) : null;

  return {
    totalDose_mgkg: sim.totalDoseMgKg,
    cmaxCp: cp[idxCp], tmaxCp: ts[idxCp],
    cmaxCe: idxCe == null ? null : ce[idxCe], tmaxCe: idxCe == null ? null : ts[idxCe],
    aucCp: trapz(cp, ts), aucCe: sim.hasEffectSite ? trapz(ce, ts) : null,
    finalCp: cp[cp.length - 1], finalCe: sim.hasEffectSite ? ce[ce.length - 1] : null
  };
}

function renderCompareResults(rows, unitLabel) {
  const container = document.getElementById('compareResults');
  if (!container) return;
  if (!rows || !rows.length) { container.innerHTML = ''; return; }

  const fmt = (x, sig=3) => Number.isFinite(x) ? roundToSignificantFigures(x, sig) : 'N/A';

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

  const body = rows.map(r => {
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
  }).join('');

  container.innerHTML = header + body + '</tbody></table>';
}

function plotComparisonFromCurrent() {
  const live = getCurrentState('Current');
  const relevant = strategies.filter(s => s.drug === currentDrug);
  const all = [live, ...relevant];
  if (all.length <= 1) return;

  const palette = ['#1f77b4','#ff7f0e','#2ca02c','#d62728','#9467bd','#8c564b','#e377c2','#7f7f7f','#bcbd22','#17becf'];
  const unitLabel = currentUnit.name;
  const yFactor = currentUnit.factor;

  const traces = [];
  const metricsRows = [];

  all.forEach((s, i) => {
    const sim = simulateStrategy(s);
    const color = palette[i % palette.length];
    traces.push({ x: sim.ts, y: sim.cp.map(v => v * yFactor), name: `${s.name} Cp (${unitLabel})`, legendgroup: s.id, line: { color, width: 2 } });
    if (sim.hasEffectSite) {
      traces.push({ x: sim.ts, y: sim.ce.map(v => v * yFactor), name: `${s.name} Ce (${unitLabel})`, legendgroup: s.id, line: { color, width: 2, dash: 'dot' } });
    }
    metricsRows.push({ state: s, sim, metrics: computeMetrics(s, sim) });
  });

  const layout = {
    title: { text: 'Central vs Effect-site (Comparison)' },
    xaxis: { title: { text: 'Time (min)' } },
    yaxis: { title: { text: `Concentration (${unitLabel})` } }
  };

  const { shapes: therShapes, legendTraces } = buildTherapeuticShapes(live.inputs.tfinal);
  layout.shapes = [ ...(layout.shapes || []), ...therShapes ];
  legendOutsideBottom(layout, { y: -0.42, bottom: 160 });

  const PLOT_CONFIG = { responsive: true, displaylogo: false };
  Plotly.newPlot('myDiv1', [...traces, ...legendTraces], layout, PLOT_CONFIG);
  renderCompareResults(metricsRows, unitLabel);
}


// ============================
// PK input mode: clearances/volumes vs microconstants
// ============================
function getPkInputMode() {
  return pkInputModeSelect?.value || "clearance";
}

function updatePkInputVisibility() {
  const microMode = getPkInputMode() === "microconstants";
  $$(".pk-clearance-row").forEach(row => { row.style.display = microMode ? "none" : ""; });
  $$(".pk-clearance-volume-row").forEach(row => { row.style.display = microMode ? "none" : ""; });
  $$(".pk-micro-row").forEach(row => { row.style.display = microMode ? "" : "none"; });
}

function syncMicroInputsFromClearanceInputs() {
  const V1 = parseFloatSafe(Vd1num?.value, 0);
  const V2 = parseFloatSafe(Vd2num?.value, 0);
  const V3 = parseFloatSafe(Vd3num?.value, 0);
  const Cl = parseFloatSafe(Clnum?.value, 0);
  const Q2 = parseFloatSafe(Q2num?.value, 0);
  const Q3 = parseFloatSafe(Q3num?.value, 0);

  if (k10inputnum) k10inputnum.value = V1 > 0 ? Cl / V1 : 0;
  if (k12inputnum) k12inputnum.value = V1 > 0 ? Q2 / V1 : 0;
  if (k21inputnum) k21inputnum.value = V2 > 0 ? Q2 / V2 : 0;
  if (k13inputnum) k13inputnum.value = V1 > 0 ? Q3 / V1 : 0;
  if (k31inputnum) k31inputnum.value = V3 > 0 ? Q3 / V3 : 0;
}

function syncClearanceInputsFromMicroInputs() {
  const V1 = parseFloatSafe(Vd1num?.value, 0);
  const k10 = parseFloatSafe(k10inputnum?.value, 0);
  const k12 = parseFloatSafe(k12inputnum?.value, 0);
  const k21 = parseFloatSafe(k21inputnum?.value, 0);
  const k13 = parseFloatSafe(k13inputnum?.value, 0);
  const k31 = parseFloatSafe(k31inputnum?.value, 0);

  const Cl = k10 * V1;
  const V2 = k21 > 0 ? (k12 * V1) / k21 : 0;
  const Q2 = k12 * V1;
  const V3 = k31 > 0 ? (k13 * V1) / k31 : 0;
  const Q3 = k13 * V1;

  if (Clnum) Clnum.value = Cl;
  if (Q2num) Q2num.value = Q2;
  if (Q3num) Q3num.value = Q3;
  if (Vd2num) Vd2num.value = V2;
  if (Vd3num) Vd3num.value = V3;
}

function getPkParametersFromInputs() {
  const mode = getPkInputMode();
  const V1 = parseFloatSafe(Vd1num?.value, 0);
  let V2, V3, Cl, Q2, Q3, k10, k12, k21, k13, k31;

  if (mode === "microconstants") {
    k10 = parseFloatSafe(k10inputnum?.value, 0);
    k12 = parseFloatSafe(k12inputnum?.value, 0);
    k21 = parseFloatSafe(k21inputnum?.value, 0);
    k13 = parseFloatSafe(k13inputnum?.value, 0);
    k31 = parseFloatSafe(k31inputnum?.value, 0);
    Cl = k10 * V1;
    V2 = k21 > 0 ? (k12 * V1) / k21 : 0;
    Q2 = k12 * V1;
    V3 = k31 > 0 ? (k13 * V1) / k31 : 0;
    Q3 = k13 * V1;
  } else {
    V2 = parseFloatSafe(Vd2num?.value, 0);
    V3 = parseFloatSafe(Vd3num?.value, 0);
    Cl = parseFloatSafe(Clnum?.value, 0);
    Q2 = parseFloatSafe(Q2num?.value, 0);
    Q3 = parseFloatSafe(Q3num?.value, 0);
    k10 = V1 > 0 ? Cl / V1 : 0;
    k12 = V1 > 0 ? Q2 / V1 : 0;
    k21 = V2 > 0 ? Q2 / V2 : 0;
    k13 = V1 > 0 ? Q3 / V1 : 0;
    k31 = V3 > 0 ? Q3 / V3 : 0;
  }
  return { mode, V1, V2, V3, Cl, Q2, Q3, k10, k12, k21, k13, k31 };
}

// ============================
// Main solver / plotting (preserved)
// ============================
function addEventMarkers(layout) {
  const finalTime = parseFloatSafe(document.getElementById('tfinal')?.value, 0);
  layout.shapes = [];
  layout.annotations = [];
  const tci = getTciConfig();
  if (tci.enabled) {
    const stopTime = Math.min(tci.stopTime, finalTime);
    if (stopTime > 0 && stopTime < finalTime) {
      layout.shapes.push({ type: 'line', x0: stopTime, x1: stopTime, y0: 0, y1: 1, xref: 'x', yref: 'paper', line: { color: '#198754', width: 0.8, dash: 'dot' } });
      layout.annotations.push({ x: stopTime, y: 1, xref: 'x', yref: 'paper', text: 'TCI stop', showarrow: false, yanchor: 'bottom', font: { color: '#198754', size: 10 } });
    }
    return layout;
  }
  const schedule = getScheduleFromDOM();

  if (!schedule || !schedule.enabled) {
    const bolusTime = parseFloatSafe(document.getElementById('tbolus')?.value, 0);
    const infusionStop = parseFloatSafe(document.getElementById('tinfusion')?.value, 0) + bolusTime;

    if (bolusTime > 0 && bolusTime < finalTime) {
      layout.shapes.push({ type: 'line', x0: bolusTime, x1: bolusTime, y0: 0, y1: 1, xref: 'x', yref: 'paper', line: { color: 'red', width: 0.6, dash: 'dot' } });
      layout.annotations.push({ x: bolusTime, y: 1, xref: 'x', yref: 'paper', text: 'Bolus', showarrow: false, yanchor: 'bottom', font: { color: 'red', size: 10 } });
    }

    if (infusionStop > 0 && infusionStop < finalTime) {
      layout.shapes.push({ type: 'line', x0: infusionStop, x1: infusionStop, y0: 0, y1: 1, xref: 'x', yref: 'paper', line: { color: 'blue', width: 0.6, dash: 'dot' } });
      layout.annotations.push({ x: infusionStop, y: 1, xref: 'x', yref: 'paper', text: 'Infusion End', showarrow: false, yanchor: 'bottom', font: { color: 'blue', size: 10 } });
    }
    return layout;
  }

  const boluses = (schedule.boluses || []).filter(b => Number.isFinite(b.time));
  const infs = (schedule.infusions || []).filter(i => Number.isFinite(i.start) && Number.isFinite(i.end));

  boluses.forEach((b, k) => {
    const t = b.time;
    if (t >= 0 && t <= finalTime) {
      layout.shapes.push({ type: 'line', x0: t, x1: t, y0: 0, y1: 1, xref: 'x', yref: 'paper', line: { color: 'red', width: 0.6, dash: 'dot' } });
      if (k < 6) layout.annotations.push({ x: t, y: 1, xref: 'x', yref: 'paper', text: `B${k+1}`, showarrow: false, yanchor: 'bottom', font: { color: 'red', size: 10 } });
    }
  });

  if (infs.length > MAX_VISIBLE_SCHEDULE_SEGMENTS) {
    [infs[0].start, infs[infs.length - 1].end].forEach((time, index) => {
      if (time >= 0 && time <= finalTime) {
        layout.shapes.push({ type: 'line', x0: time, x1: time, y0: 0, y1: 1, xref: 'x', yref: 'paper', line: { color: 'blue', width: 0.6, dash: 'dot' } });
        layout.annotations.push({ x: time, y: 1, xref: 'x', yref: 'paper', text: index === 0 ? 'Variable infusion start' : 'Variable infusion end', showarrow: false, yanchor: 'bottom', font: { color: 'blue', size: 10 } });
      }
    });
    return layout;
  }

  infs.forEach((seg, k) => {
    const s = Math.max(0, seg.start);
    const e = Math.max(0, seg.end);
    [s, e].forEach((t, j) => {
      if (t >= 0 && t <= finalTime) {
        layout.shapes.push({ type: 'line', x0: t, x1: t, y0: 0, y1: 1, xref: 'x', yref: 'paper', line: { color: 'blue', width: 0.6, dash: 'dot' } });
        if (k < 4) {
          const label = (j === 0) ? `I${k+1}s` : `I${k+1}e`;
          layout.annotations.push({ x: t, y: 1, xref: 'x', yref: 'paper', text: label, showarrow: false, yanchor: 'bottom', font: { color: 'blue', size: 10 } });
        }
      }
    });
  });

  return layout;
}

function toArray(m) {
  if (Array.isArray(m)) return m;
  if (m && typeof m.toArray === 'function') return m.toArray();
  if (m && m._data) return m._data;
  return [m];
}

function getScheduleWarnings(schedule, finalTime) {
  const warnings = [];
  const infusions = schedule.infusions.filter(i => Number.isFinite(i.start) && Number.isFinite(i.end) && i.end > i.start);
  let furthestEnd = 0;
  infusions.forEach((infusion, index) => {
    if (index && infusion.start < furthestEnd - TIME_EPSILON) {
      warnings.push('Infusion segments overlap; their rates add during the overlap.');
    } else if (index && infusion.start > furthestEnd + TIME_EPSILON) {
      warnings.push('There is a zero-infusion gap between scheduled segments.');
    }
    furthestEnd = Math.max(furthestEnd, infusion.end);
  });
  if (Number.isFinite(finalTime) && (
    infusions.some(i => i.start >= finalTime || i.end > finalTime + TIME_EPSILON) ||
    schedule.boluses.some(b => b.time > finalTime || b.time + b.duration > finalTime + TIME_EPSILON)
  )) warnings.push('Some dosing extends beyond the simulation end time and is truncated or omitted.');
  return [...new Set(warnings)];
}

function validateSimulationInputs() {
  const errors = [];
  const invalidIds = new Set();
  const addError = (id, message) => { errors.push(message); if (id) invalidIds.add(id); };
  const readNumber = (id, label, { min = -Infinity, strictlyPositive = false, optional = false } = {}) => {
    const el = document.getElementById(id);
    const raw = el?.value?.trim();
    if (optional && raw === '') return 0;
    const value = Number(raw);
    if (raw === '' || !Number.isFinite(value) || (strictlyPositive ? value <= 0 : value < min)) {
      addError(id, `${label} must be ${strictlyPositive ? 'greater than 0' : `at least ${min}`}.`);
      return null;
    }
    return value;
  };

  $$('.form-control.is-invalid').forEach(el => el.classList.remove('is-invalid'));
  readNumber('weight', 'Weight', { strictlyPositive: true });
  const finalTime = readNumber('tfinal', 'Final time', { strictlyPositive: true });
  if (finalTime != null && finalTime > MAX_SIMULATION_MINUTES) {
    addError('tfinal', `Final time must be no greater than ${MAX_SIMULATION_MINUTES} minutes.`);
  }
  readNumber('initialp', 'Initial concentration', { min: 0 });
  readNumber('Vd1', 'V1', { strictlyPositive: true });
  readNumber('ke0', 'ke0', { min: 0, optional: true });
  const tciActive = Boolean(document.getElementById('tciEnabled')?.checked);
  const scheduleActive = !tciActive && Boolean(document.getElementById('useSchedule')?.checked);
  if (!tciActive && !scheduleActive) {
    readNumber('b', 'Bolus dose', { min: 0 });
    readNumber('tbolus', 'Loading-dose duration', { min: 0 });
    readNumber('infusion', 'Infusion rate', { min: 0 });
    readNumber('tinfusion', 'Infusion duration', { min: 0 });
  }
  if (tciActive) {
    readNumber('tciTarget', 'TCI target', { strictlyPositive: true });
    readNumber('tciMaxRate', 'TCI maximum rate', { strictlyPositive: true });
    readNumber('tciStopTime', 'TCI stop time', { min: 0 });
    if (document.getElementById('tciTargetType')?.value === 'ce' && Number(ke0num?.value) <= 0) {
      addError('ke0', 'ke0 must be greater than 0 for an effect-site TCI target.');
    }
  }

  if (getPkInputMode() === 'microconstants') {
    const k12 = readNumber('k12input', 'k12', { min: 0 });
    const k21 = readNumber('k21input', 'k21', { min: 0 });
    const k13 = readNumber('k13input', 'k13', { min: 0 });
    const k31 = readNumber('k31input', 'k31', { min: 0 });
    readNumber('k10input', 'k10', { min: 0 });
    if (k12 > 0 && k21 <= 0) addError('k21input', 'k21 must be greater than 0 when k12 is greater than 0.');
    if (k13 > 0 && k31 <= 0) addError('k31input', 'k31 must be greater than 0 when k13 is greater than 0.');
  } else {
    const v2 = readNumber('Vd2', 'V2', { min: 0 });
    const v3 = readNumber('Vd3', 'V3', { min: 0 });
    const q2 = readNumber('Q2', 'Q2', { min: 0 });
    const q3 = readNumber('Q3', 'Q3', { min: 0 });
    readNumber('Cl', 'Clearance', { min: 0 });
    if (q2 > 0 && v2 <= 0) addError('Vd2', 'V2 must be greater than 0 when Q2 is greater than 0.');
    if (q3 > 0 && v3 <= 0) addError('Vd3', 'V3 must be greater than 0 when Q3 is greater than 0.');
  }

  const schedule = getScheduleFromDOM();
  if (scheduleActive && schedule.enabled) {
    $$('#bolusEventsTable tbody tr').forEach((row, index) => {
      const fields = ['time', 'dose', 'duration'].map(field => row.querySelector(`[data-field="${field}"]`)?.value?.trim());
      const [time, dose, duration] = fields.map(Number);
      if (fields.some(value => value === '') || !Number.isFinite(time) || time < 0 || !Number.isFinite(dose) || dose < 0 || !Number.isFinite(duration) || duration < 0) {
        addError(null, `Bolus ${index + 1} must have non-negative time, dose, and duration.`);
        $$('input', row).forEach(el => el.classList.add('is-invalid'));
      }
    });
    $$('#infusionEventsTable tbody tr').forEach((row, index) => {
      const fields = ['start', 'end', 'rate'].map(field => row.querySelector(`[data-field="${field}"]`)?.value?.trim());
      const [start, end, rate] = fields.map(Number);
      if (fields.some(value => value === '') || !Number.isFinite(start) || start < 0 || !Number.isFinite(end) || end < start || !Number.isFinite(rate) || rate < 0) {
        addError(null, `Infusion ${index + 1} must have non-negative start/end/rate values, with end at or after start.`);
        $$('input', row).forEach(el => el.classList.add('is-invalid'));
      }
    });
  }

  invalidIds.forEach(id => document.getElementById(id)?.classList.add('is-invalid'));
  const summary = document.getElementById('validationSummary');
  if (summary) {
    summary.hidden = errors.length === 0;
    summary.textContent = errors.length ? `Simulation not updated: ${errors.join(' ')}` : '';
  }
  const scheduleWarnings = document.getElementById('scheduleWarnings');
  if (scheduleWarnings) {
    const warnings = scheduleActive ? getScheduleWarnings(schedule, finalTime) : [];
    scheduleWarnings.hidden = warnings.length === 0;
    scheduleWarnings.textContent = warnings.length ? `Schedule note: ${warnings.join(' ')}` : '';
  }
  setSimulationStatus(errors.length ? 'Results are not updated. Correct the highlighted parameters.' : 'Simulation is up to date.', errors.length ? 'error' : 'ok');
  return errors.length === 0;
}

let timelineUndoSchedule = null;

function setSimulationStatus(message, state = 'ok', { showUndo = false } = {}) {
  const status = document.getElementById('simulationStatus');
  const text = document.getElementById('simulationStatusText');
  const undoBtn = document.getElementById('undoTimelineBtn');
  if (!status || !text) return;
  text.textContent = message;
  status.dataset.state = state;
  if (undoBtn) undoBtn.hidden = !showUndo;
  if (!showUndo) timelineUndoSchedule = null;
}

function undoTimelineDeletion() {
  if (!timelineUndoSchedule) return;
  const restoredSchedule = timelineUndoSchedule;
  timelineUndoSchedule = null;
  setScheduleToDOM(restoredSchedule);
  disableLegacyBolusInfusionInputs(true);
  expandDrawerCard('scheduleCard');
  dfsolve();
  setSimulationStatus('Timeline deletion restored.', 'ok');
}

function interpolateSimulationValue(simulation, values, time) {
  const ts = simulation.ts;
  if (time <= ts[0]) return values[0];
  if (time >= ts[ts.length - 1]) return values[values.length - 1];
  let lo = 0, hi = ts.length - 1;
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
    maximum = Math.max(maximum, Math.abs(interpolateSimulationValue(edited, edited[field], time) - interpolateSimulationValue(original, original[field], time)));
  }
  for (const time of edited.ts) {
    if (time > endTime + TIME_EPSILON) break;
    maximum = Math.max(maximum, Math.abs(interpolateSimulationValue(edited, edited[field], time) - interpolateSimulationValue(original, original[field], time)));
  }
  return maximum;
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
  const drug = DRUGS.find(d => d.id === source.drug)?.label || 'Custom model';
  const sourceText = document.getElementById('tciSourceDescription');
  if (sourceText) sourceText.textContent = `${drug} · ${source.tci.targetType === 'ce' ? 'Ce' : 'Cp'} target ${formatInputValue(source.tci.target)} ${source.units.conc} · maximum ${formatInputValue(source.tci.maxRate)} ${source.units.infusion} · ${formatInputValue(source.patient.weightKg)} kg · original ${tciImportSession.exactSchedule.infusions.length} segments`;

  const endTime = Math.min(original.ts.at(-1), simulation.ts.at(-1));
  const cpError = maxReplayDifference(original, simulation, 'cp', endTime) * currentUnit.factor;
  const ceError = original.hasEffectSite && simulation.hasEffectSite
    ? maxReplayDifference(original, simulation, 'ce', endTime) * currentUnit.factor : null;
  const doseDifference = simulation.totalDoseMgKg - original.totalDoseMgKg;
  const metrics = document.getElementById('tciReplayMetrics');
  if (metrics) metrics.textContent = `Maximum model replay difference over 0–${formatInputValue(endTime)} min: Cp ${formatInputValue(cpError)} ${currentUnit.name}${ceError == null ? '' : `; Ce ${formatInputValue(ceError)} ${currentUnit.name}`}. Total delivered dose difference: ${doseDifference >= 0 ? '+' : ''}${formatInputValue(doseDifference)} mg/kg.`;

  const current = getCurrentState();
  const assumptionsChanged = current.drug !== source.drug ||
    JSON.stringify(current.pk) !== JSON.stringify(source.pk) ||
    current.patient.weightKg !== source.patient.weightKg ||
    current.inputs.initialp !== source.inputs.initialp ||
    current.inputs.tfinal !== source.inputs.tfinal ||
    JSON.stringify(current.units) !== JSON.stringify(source.units);
  const warning = document.getElementById('tciReplayWarning');
  if (warning) warning.textContent = assumptionsChanged
    ? 'Model, weight, units, initial concentration, or final time changed since import; replay differences also reflect those changes.'
    : compareMode && strategies.some(s => s.drug === currentDrug)
      ? 'The original TCI overlay is hidden while strategy comparison is active; turn comparison off to view it.'
      : '';

  if (!document.getElementById('showTciReference')?.checked) return [];
  const referenceTimes = original.ts.filter(time => time <= endTime + TIME_EPSILON);
  if (referenceTimes.at(-1) < endTime - TIME_EPSILON) referenceTimes.push(endTime);
  const sourceTraces = [{
    x: referenceTimes, y: referenceTimes.map(time => interpolateSimulationValue(original, original.cp, time) * currentUnit.factor),
    name: 'Original TCI Cp (model)', line: { color: '#2856b8', width: 2, dash: 'dash' }
  }];
  if (original.hasEffectSite) sourceTraces.push({
    x: referenceTimes, y: referenceTimes.map(time => interpolateSimulationValue(original, original.ce, time) * currentUnit.factor),
    name: 'Original TCI Ce (model)', line: { color: '#a85a16', width: 2, dash: 'dash' }
  });
  return sourceTraces;
}

function dfsolve() {
  let params = { b: [], Cl: [], Q2: [], Q3: [], Vd1: [], Vd2: [], Vd3: [], tbolus: [], tinfusion: [], initialp: [], tfinal: [], dt: [], ke0: [], weightKg: [] };

  if (!validateSimulationInputs()) return;

  if (getPkInputMode() === "microconstants") syncClearanceInputsFromMicroInputs();
  else syncMicroInputsFromClearanceInputs();

  const pk = getPkParametersFromInputs();
  params.Vd1 = pk.V1; // mL/kg
  params.Vd2 = pk.V2; // mL/kg, derived in microconstant mode
  params.Vd3 = pk.V3; // mL/kg, derived in microconstant mode
  params.Cl = pk.Cl;  // mL/kg/min
  params.Q2 = pk.Q2;  // mL/kg/min
  params.Q3 = pk.Q3;  // mL/kg/min

  const k10 = pk.k10; // 1/min
  const k12 = pk.k12; // 1/min
  const k21 = pk.k21; // 1/min
  const k13 = pk.k13; // 1/min
  const k31 = pk.k31; // 1/min

  params.tbolus = Math.max(0, parseFloatSafe(tbolusnum.value, 0));
  params.tinfusion = Math.max(0, parseFloatSafe(tinfusionnum.value, 0));
  params.weightKg = getWeightKg();
  params.initialp = parseFloatSafe(initialpnum.value, 0);
  params.tfinal = parseFloatSafe(tfinalnum.value, 240);
  params.dt = SIMULATION_STEP_MINUTES;
  params.ke0 = Number.isFinite(parseFloat(ke0num.value)) ? parseFloat(ke0num.value) : 0;

  const schedule = getScheduleFromDOM();
  const tci = getTciConfig();
  const dosingPlan = buildDosingPlan({
    schedule,
    basic: {
      bolus: parseFloatSafe(bnum.value, 0),
      tbolus: params.tbolus,
      infusion: parseFloatSafe(infusionnum.value, 0),
      tinfusion: params.tinfusion
    },
    bolusUnit: currentBolusUnit,
    infusionUnit: currentInfusionUnit,
    weightKg: params.weightKg
  });
  const simulation = simulatePkModel({
    pk: { V1: params.Vd1, V2: params.Vd2, V3: params.Vd3, k10, k12, k21, k13, k31 },
    ke0: params.ke0,
    initialConcentration: params.initialp / currentUnit.factor,
    finalTime: params.tfinal,
    dosingPlan,
    tci
  });
  const { ts, xs1, xs2, xs3, ces } = simulation;
  const N = ts.length - 1;
  updateRegimenOverview(params, schedule);

  const yFactor = currentUnit.factor;
  const unitLabel = currentUnit.name;
  const hasEffectSite = simulation.hasEffectSite;

  const trace_cp = { x: [], y: [], name: `Cp (${unitLabel})`, line: { color: '#1f77b4', width: 2 } };
  const trace_ce = hasEffectSite ? { x: [], y: [], name: `Ce (${unitLabel})`, line: { color: '#ff7f0e', width: 2, dash: 'dot' } } : null;
  const trace_target = tci.enabled ? { x: [], y: [], name: `${tci.targetType === 'ce' ? 'Ce' : 'Cp'} target until ${formatInputValue(Math.min(tci.stopTime, params.tfinal))} min`, line: { color: '#198754', width: 2, dash: 'dash' } } : null;
  const trace_p1 = { x: [], y: [], name: `Rapid peripheral compartment (${unitLabel})`, line: { width: 2 } };
  const trace_p2 = { x: [], y: [], name: `Slow peripheral compartment (${unitLabel})`, line: { width: 2 } };

  for (let i = 0; i < N + 1; i++) {
    const t = ts[i];
    const cp = params.Vd1 > 0 ? (xs1[i] / params.Vd1) : 0;
    const p1 = params.Vd2 > 0 ? (xs2[i] / params.Vd2) : 0;
    const p2 = params.Vd3 > 0 ? (xs3[i] / params.Vd3) : 0;
    const ce = (ces[i]);

    trace_cp.x.push(t); trace_cp.y.push(cp * yFactor);
    if (trace_ce) { trace_ce.x.push(t); trace_ce.y.push(ce * yFactor); }
    trace_p1.x.push(t); trace_p1.y.push(p1 * yFactor);
    trace_p2.x.push(t); trace_p2.y.push(p2 * yFactor);
    if (trace_target) { trace_target.x.push(t); trace_target.y.push(t <= tci.stopTime ? tci.target : null); }
  }

  let layout1 = {
    title: { text: hasEffectSite ? 'Central vs Effect-site' : 'Central concentration (effect site not modeled)' },
    xaxis: { title: { text: 'Time (min)' } },
    yaxis: { title: { text: `Concentration (${unitLabel})` } }
  };
  let layout2 = {
    title: { text: 'Rapid peripheral compartment' },
    xaxis: { title: { text: 'Time (min)' } },
    yaxis: { title: { text: `Concentration (${unitLabel})` } },
    showlegend: false
  };
  let layout3 = {
    title: { text: 'Slow peripheral compartment' },
    xaxis: { title: { text: 'Time (min)' } },
    yaxis: { title: { text: `Concentration (${unitLabel})` } },
    showlegend: false
  };

  layout1 = addEventMarkers(layout1);
  layout2 = addEventMarkers(layout2);
  layout3 = addEventMarkers(layout3);

  layout1 = legendOutsideBottom(layout1, { y: -0.42, bottom: 150, fontSize: 11, itemWidth: 90 });

  const { shapes: therShapes, legendTraces } = buildTherapeuticShapes(params.tfinal);
  layout1.shapes = [ ...(layout1.shapes || []), ...therShapes ];

  const originalTciTraces = updateTciReplayComparison(simulation, schedule, tci);
  const panel1Traces = [trace_cp, ...(trace_ce ? [trace_ce] : []), ...(trace_target ? [trace_target] : []), ...originalTciTraces, ...legendTraces];
  const PLOT_CONFIG = { responsive: true, displaylogo: false };

  if (compareMode && strategies.some(s => s.drug === currentDrug)) {
    plotComparisonFromCurrent();
  } else {
    Plotly.newPlot('myDiv1', panel1Traces, layout1, PLOT_CONFIG);
    const compareResults = document.getElementById('compareResults');
    if (compareResults) compareResults.textContent = '';
  }

  Plotly.newPlot('myDiv2', [trace_p1], layout2, PLOT_CONFIG);
  Plotly.newPlot('myDiv3', [trace_p2], layout3, PLOT_CONFIG);

  const tciRatePanel = document.getElementById('tciRatePanel');
  if (tciRatePanel) tciRatePanel.hidden = !(tci.enabled || schedule.enabled);
  const deliveryRateHeading = document.getElementById('deliveryRateHeading');
  if (deliveryRateHeading) deliveryRateHeading.textContent = tci.enabled ? 'Educational TCI calculated infusion rate' : 'Scheduled delivery rate';
  if (tci.enabled || schedule.enabled) {
    const rateTrace = {
      x: ts.slice(0, N),
      y: simulation.intervalRates.map(rate => convertMgKgMinToInfusionValue(rate, currentInfusionUnit, params.weightKg)),
      name: `${tci.enabled ? 'Calculated' : 'Scheduled'} rate (${currentInfusionUnit.name})`,
      line: { color: '#198754', width: 2, shape: 'hv' },
      fill: 'tozeroy',
      fillcolor: 'rgba(25, 135, 84, .12)'
    };
    Plotly.newPlot('tciRatePlot', [rateTrace], {
      margin: { l: 60, r: 30, t: 12, b: 42 },
      xaxis: { title: { text: 'Time (min)' } },
      yaxis: { title: { text: `Rate (${currentInfusionUnit.name})` } },
      showlegend: false
    }, PLOT_CONFIG);
  }

  // Results
  const finalCp = roundToSignificantFigures(yFactor * xs1[N] / params.Vd1, 3);
  const finalCe = hasEffectSite ? roundToSignificantFigures(yFactor * ces[N], 3) : null;
  pfinalhtml.innerHTML = finalCp;
  document.getElementById('keyFinalCp').textContent = finalCp;
  document.getElementById('keyFinalCe').textContent = hasEffectSite ? finalCe : 'Not modeled';
  document.getElementById('keyFinalCpUnit').textContent = unitLabel;
  document.getElementById('keyFinalCeUnit').textContent = hasEffectSite ? unitLabel : '';
  const peakCpIndex = trace_cp.y.reduce((best, value, index, values) => value > values[best] ? index : best, 0);
  const peakCeIndex = trace_ce ? trace_ce.y.reduce((best, value, index, values) => value > values[best] ? index : best, 0) : null;
  document.getElementById('keyPeakCp').textContent = roundToSignificantFigures(trace_cp.y[peakCpIndex], 3);
  document.getElementById('keyPeakCe').textContent = trace_ce ? roundToSignificantFigures(trace_ce.y[peakCeIndex], 3) : 'Not modeled';
  document.getElementById('keyPeakCpUnit').textContent = unitLabel;
  document.getElementById('keyPeakCeUnit').textContent = hasEffectSite ? unitLabel : '';
  document.getElementById('keyTmaxCe').textContent = trace_ce ? roundToSignificantFigures(ts[peakCeIndex], 3) : 'N/A';
  const pss = params.Cl > 0 && simulation.finalActiveRate > 1e-12 ? simulation.finalActiveRate / params.Cl : null;
  psshtml.textContent = pss == null ? 'N/A' : roundToSignificantFigures(yFactor * pss, 3);

  // Eigenvalues
  const Axyz = math.matrix([
    [-(k10 + k12 + k13), k21, k31],
    [k12, -k21, 0],
    [k13, 0, -k31]
  ]);

  let evalsRaw = [];
  try {
    const eigs_xyz = math.eigs(Axyz);
    evalsRaw = toArray(eigs_xyz.values);
  } catch (e) {
    console.error('eigs failed:', e);
  }

  let evalsReal = evalsRaw.map(v => math.re(v)).filter(v => Number.isFinite(v) && v < 0);
  if (evalsReal.length === 0) {
    alphahtml.innerHTML = betahtml.innerHTML = gammahtml.innerHTML = 0;
    termhalflifehtml.innerHTML = 0;
  } else {
    evalsReal.sort((a,b) => Math.abs(b) - Math.abs(a));
    const alpha = -(evalsReal[0] ?? 0);
    const beta = -(evalsReal[1] ?? 0);
    const gamma = -(evalsReal[2] ?? 0);
    const termhalflife = (gamma > 0 ? Math.log(2)/gamma : (beta > 0 ? Math.log(2)/beta : (alpha > 0 ? Math.log(2)/alpha : 0)));
    alphahtml.innerHTML = roundToSignificantFigures(alpha, 3);
    betahtml.innerHTML = roundToSignificantFigures(beta, 3);
    gammahtml.innerHTML = roundToSignificantFigures(gamma, 3);
    termhalflifehtml.innerHTML = roundToSignificantFigures(termhalflife, 3);
  }
  document.getElementById('keyTerminalHalfLife').textContent = termhalflifehtml.textContent;

  k10html.innerHTML = roundToSignificantFigures(k10, 3);
  k12html.innerHTML = roundToSignificantFigures(k12, 3);
  k21html.innerHTML = roundToSignificantFigures(k21, 3);
  k13html.innerHTML = roundToSignificantFigures(k13, 3);
  k31html.innerHTML = roundToSignificantFigures(k31, 3);
  Vd1numhtml.innerHTML = roundToSignificantFigures(params.Vd1, 3);
  Vd2numhtml.innerHTML = roundToSignificantFigures(params.Vd2, 3);
  Vd3numhtml.innerHTML = roundToSignificantFigures(params.Vd3, 3);
  Q2numhtml.innerHTML = roundToSignificantFigures(params.Vd1*k12, 3);
  Q3numhtml.innerHTML = roundToSignificantFigures(params.Vd1*k13, 3);
  Clnumhtml.innerHTML = roundToSignificantFigures(params.Vd1*k10, 3);

  // Context-sensitive half-time is defined here only after a nonzero rate-based
  // input. An isolated instantaneous bolus does not have an infusion context.
  let cshl = null;
  if (simulation.lastRateEndIndex != null) {
    const startIdx = clamp(simulation.lastRateEndIndex, 0, N);
    const x1 = xs1[startIdx], x2 = xs2[startIdx], x3 = xs3[startIdx];
    if (Number.isFinite(x1) && x1 > 0) {
      const target = x1 / 2;
      const washoutCpAt = duration => {
        const transition = createTransition({ V1: params.Vd1, k10, k12, k21, k13, k31 }, 0, duration);
        return transition.a11*x1 + transition.a12*x2 + transition.a13*x3;
      };
      let lower = 0;
      let upper = params.dt;
      while (upper < 1e6 && washoutCpAt(upper) > target) {
        lower = upper;
        upper *= 2;
      }
      if (washoutCpAt(upper) <= target) {
        for (let iteration = 0; iteration < 28; iteration++) {
          const middle = (lower + upper) / 2;
          if (washoutCpAt(middle) > target) lower = middle;
          else upper = middle;
        }
        cshl = (lower + upper) / 2;
      }
    }
  }

  contextsensitivehalflifehtml.textContent = cshl == null ? 'N/A' : roundToSignificantFigures(cshl, 3);
  document.getElementById('keyContextHalfLife').textContent = contextsensitivehalflifehtml.textContent;

}

window.dfsolve = dfsolve;

function onecompartment() {
  markPresetModified();
  Q2num.value = 0;
  Q3num.value = 0;
  if (k12inputnum) k12inputnum.value = 0;
  if (k21inputnum) k21inputnum.value = 0;
  if (k13inputnum) k13inputnum.value = 0;
  if (k31inputnum) k31inputnum.value = 0;
  dfsolve();
}

// ============================
// Drug presets (kept from your file; unchanged values)
// ============================
// Optional educational starting points. Other models permit TCI only after
// the user supplies a target and maximum rate; never use this to control a pump.
const TCI_PRESETS = Object.freeze({
  propofol: { targetType: 'cp', target: 2, maxRate: 200, note: 'Educational Propofol/Marsh starting point: Cp 2 µg/mL; maximum 200 µg/kg/min. Adjust only for simulation exploration.' },
  dexmedetomidine: { targetType: 'cp', target: 0.6, maxRate: 6, note: 'Educational dexmedetomidine starting point: Cp 0.6 ng/mL; maximum 6 µg/kg/hr. This is not a clinical prescription.' },
  remifentanil: { targetType: 'ce', target: 2, maxRate: 0.5, note: 'Educational remifentanil/Minto starting point: Ce 2 ng/mL; maximum 0.5 µg/kg/min. This is not a clinical prescription.' }
});

function applyTciPreset(id) {
  const profile = TCI_PRESETS[id];
  const enabled = document.getElementById('tciEnabled');
  const targetType = document.getElementById('tciTargetType');
  const target = document.getElementById('tciTarget');
  const maxRate = document.getElementById('tciMaxRate');
  const stopTime = document.getElementById('tciStopTime');
  const note = document.getElementById('tciPresetNote');
  if (!id) {
    if (enabled) enabled.disabled = false;
    if (note) note.textContent = 'Custom model: enter an educational target and maximum rate based on your own model assumptions.';
    updateTciControls();
    return;
  }
  if (!profile) {
    if (enabled) {
      enabled.checked = false;
      enabled.disabled = false;
    }
    if (targetType) targetType.value = 'cp';
    if (target) target.value = '';
    if (maxRate) maxRate.value = '';
    if (stopTime) stopTime.value = formatInputValue(parseFloatSafe(tfinalnum?.value, 120));
    if (note) note.textContent = id === 'bupivacaine'
      ? 'No TCI starting profile. Enter your own target and maximum rate. Bupivacaine has no routine IV dosing example; this is a theoretical systemic PK simulation, not an IV regimen or pump program.'
      : id === 'vasopressin'
        ? 'No TCI starting profile. Enter your own target and maximum rate. Vasopressin is clinically dosed in units/min, which these mass-based inputs do not convert; this is not a dosing or pump recommendation.'
        : 'No TCI starting profile for this drug. Enter your own positive concentration target and maximum infusion rate in the displayed units. Ce targeting also requires a valid ke0. Educational simulation only—not a dosing recommendation or pump program.';
    updateTciControls();
    return;
  }
  if (enabled) {
    enabled.checked = false;
    enabled.disabled = false;
  }
  if (targetType) targetType.value = profile.targetType;
  if (target) target.value = profile.target;
  if (maxRate) maxRate.value = profile.maxRate;
  if (stopTime) stopTime.value = formatInputValue(parseFloatSafe(tfinalnum?.value, 255));
  if (note) note.textContent = profile.note;
  updateTciControls();
}

function propofol() {
  currentDrug = 'propofol';
  setDisplayUnit('µg/mL');
  setBolusUnit('mg/kg');
  setInfusionUnit('µg/kg/min');

  // Marsh model (validated)
  Vd1num.value = 228;
  Vd2num.value = 464;
  Vd3num.value = 2895;

  Clnum.value  = 27.1;
  Q2num.value  = 25.5;
  Q3num.value  = 9.6;

  ke0num.value = 0.26;

  syncMicroInputsFromClearanceInputs();
  dfsolve();
}

function etomidate() { // Arden
  currentDrug = 'etomidate';
  setDisplayUnit('µg/mL');
  setBolusUnit('mg/kg');
  setInfusionUnit('mg/kg/hr');

  Vd1num.value = 64;
  Vd2num.value = 214;
  Vd3num.value = 700;   // refined from 857 for slightly less deep accumulation

  Clnum.value  = 9;
  Q2num.value  = 43;
  Q3num.value  = 7;

  ke0num.value = 0.45;

  syncMicroInputsFromClearanceInputs();
  dfsolve();
}

function ketamine() { // Domino / Clements / Hijazi-type models
  currentDrug = 'ketamine';
  setDisplayUnit('µg/mL');
  setBolusUnit('mg/kg');
  setInfusionUnit('mg/kg/hr');

  Vd1num.value = 286;
  Vd2num.value = 571;
  Vd3num.value = 1500;

  Clnum.value  = 17;
  Q2num.value  = 18;
  Q3num.value  = 4;

  ke0num.value = 0.3;

  syncMicroInputsFromClearanceInputs();
  dfsolve();
}

function dexmedetomidine() { // Dyck / Hannivoort-type models
  currentDrug = 'dexmedetomidine';
  setDisplayUnit('ng/mL');
  setBolusUnit('µg/kg');
  setInfusionUnit('µg/kg/hr');

  // Slightly adjusted, literature-consistent
  Vd1num.value = 360;     // ↑ slightly
  Vd2num.value = 491;
  Vd3num.value = 934;

  Clnum.value  = 12.9;
  Q2num.value  = 24;
  Q3num.value  = 8.9;

  ke0num.value = 0.06;   // critical fix

  syncMicroInputsFromClearanceInputs();
  dfsolve();
}

function midazolam() { // Greenblatt
  currentDrug = 'midazolam';
  setDisplayUnit('ng/mL');
  setBolusUnit('mg/kg');
  setInfusionUnit('µg/kg/min');

  Vd1num.value = 250;    // slightly reduced
  Vd2num.value = 700;
  Vd3num.value = 1800;

  Clnum.value  = 6.4;
  Q2num.value  = 15;     // slightly reduced
  Q3num.value  = 4;

  ke0num.value = 0.07;

  syncMicroInputsFromClearanceInputs();
  dfsolve();
}

function diazepam() {
  currentDrug = 'diazepam';
  setDisplayUnit('µg/mL');
  setBolusUnit('mg/kg');
  setInfusionUnit('mg/kg/hr');
  Vd1num.value = 500;
  Vd2num.value = 1667; // 18/70*1000;
  Vd3num.value = 7500; // 38.5/70*1000;
  Clnum.value = 5; // 39.3/70;
  Q2num.value = 25; // 300/70;
  Q3num.value = 7.5; // 76.7/70;
  ke0num.value = 0.2;
  syncMicroInputsFromClearanceInputs();
  dfsolve();
}

function fentanyl() {
  currentDrug = 'fentanyl';
  setDisplayUnit('ng/mL');
  setBolusUnit('µg/kg');
  setInfusionUnit('µg/kg/hr');

  // Improved Shafer-type approximation
  Vd1num.value = 80;
  Vd2num.value = 400;
  Vd3num.value = 3000;   // reduced

  Clnum.value  = 8;      // reduced
  Q2num.value  = 12;
  Q3num.value  = 4;

  ke0num.value = 0.11;

  syncMicroInputsFromClearanceInputs();
  dfsolve();
}

function hydromorphone() {
  currentDrug = 'hydromorphone';
  setDisplayUnit('ng/mL');
  setBolusUnit('mg/kg');
  setInfusionUnit('mg/kg/hr');
  Vd1num.value = 150;
  Vd2num.value = 600;
  Vd3num.value = 1500;
  Clnum.value = 8;
  Q2num.value = 25;
  Q3num.value = 5;
  ke0num.value = 0.5;
  syncMicroInputsFromClearanceInputs();
  dfsolve();
}

function remifentanil() { // Minto
  currentDrug = 'remifentanil';
  setDisplayUnit('ng/mL');
  setBolusUnit('µg/kg');
  setInfusionUnit('µg/kg/min');

  // Improved weight-normalized approximation of Minto
  Vd1num.value = 65;    // ↓ smaller central
  Vd2num.value = 150;   // similar
  Vd3num.value = 350;   // ↑ slightly larger deep compartment

  Clnum.value  = 30;    // ↓ more realistic
  Q2num.value  = 25;    // slightly reduced
  Q3num.value  = 10;

  ke0num.value = 0.6;   // keep

  syncMicroInputsFromClearanceInputs();
  dfsolve();
}

function sufentanil() {
  currentDrug = 'sufentanil';
  setDisplayUnit('ng/mL');
  setBolusUnit('µg/kg');
  setInfusionUnit('µg/kg/hr');
  Vd1num.value = 100;
  Vd2num.value = 250;
  Vd3num.value = 833;
  Clnum.value = 3;
  Q2num.value = 15;
  Q3num.value = 5;
  ke0num.value = 1.5;
  syncMicroInputsFromClearanceInputs();
  dfsolve();
}

function alfentanil() {
  currentDrug = 'alfentanil';
  setDisplayUnit('ng/mL');
  setBolusUnit('µg/kg');
  setInfusionUnit('µg/kg/min');
  Vd1num.value = 150;
  Vd2num.value = 300;
  Vd3num.value = 600;
  Clnum.value = 5.25;
  Q2num.value = 30;
  Q3num.value = 9;
  ke0num.value = 2;
  syncMicroInputsFromClearanceInputs();
  dfsolve();
}

function methadone() {
  currentDrug = 'methadone';
  setDisplayUnit('ng/mL');
  setBolusUnit('mg/kg');
  setInfusionUnit('mg/kg/hr');
  Vd1num.value = 21.5/70*1000;
  Vd2num.value = 75.1/70*1000;
  Vd3num.value = 484/70*1000;
  Clnum.value = 2.25;
  Q2num.value = 77.4;
  Q3num.value = 32.4;
  ke0num.value = 0.087;
  syncMicroInputsFromClearanceInputs();
  dfsolve();
}

function rocuronium() {
  currentDrug = 'rocuronium';
  setDisplayUnit('µg/mL');
  setBolusUnit('mg/kg');
  setInfusionUnit('mg/kg/hr');
  Vd1num.value = 80;
  Vd2num.value = 300;
  Vd3num.value = 400;
  Clnum.value = 3.2;
  Q2num.value = 20;
  Q3num.value = 5;
  ke0num.value = 0.2;
  syncMicroInputsFromClearanceInputs();
  dfsolve();
}

function vecuronium() {
  currentDrug = 'vecuronium';
  setDisplayUnit('µg/mL');
  setBolusUnit('mg/kg');
  setInfusionUnit('µg/kg/min');
  Vd1num.value = 10.25/70*1000;
  Vd2num.value = 7.92/70*1000;
  Vd3num.value = 41.99/70*1000;
  Clnum.value = 0.51/70*1000;
  Q2num.value = 0.51/70*1000;
  Q3num.value = 0.095/70*1000;
  ke0num.value = 0.3;
  syncMicroInputsFromClearanceInputs();
  dfsolve();
}

function cisatracurium() {
  currentDrug = 'cisatracurium';
  setDisplayUnit('µg/mL');
  setBolusUnit('mg/kg');
  setInfusionUnit('µg/kg/min');
  Vd1num.value = 40;
  Vd2num.value = 60;
  Vd3num.value = 45;
  Clnum.value = 5;
  Q2num.value = 10;
  Q3num.value = 2;
  ke0num.value = 0.0575;
  syncMicroInputsFromClearanceInputs();
  dfsolve();
}

function pancuronium() {
  currentDrug = 'pancuronium';
  setDisplayUnit('µg/mL');
  setBolusUnit('mg/kg');
  setInfusionUnit('mg/kg/hr');
  Vd1num.value = 60;
  Vd2num.value = 180;
  Vd3num.value = 600;
  Clnum.value = 1.5;
  Q2num.value = 9;
  Q3num.value = 3;
  ke0num.value = 0.05;
  syncMicroInputsFromClearanceInputs();
  dfsolve();
}

function succinylcholine() {
  currentDrug = 'succinylcholine';
  setDisplayUnit('µg/mL');
  setBolusUnit('mg/kg');
  setInfusionUnit('mg/kg/min');
  Vd1num.value = 50;
  Vd2num.value = 100;
  Vd3num.value = 150;
  Clnum.value = 300;
  Q2num.value = 25;
  Q3num.value = 10;
  ke0num.value = 0.197;
  syncMicroInputsFromClearanceInputs();
  dfsolve();
}

function lidocaine() {
  currentDrug = 'lidocaine';
  setDisplayUnit('µg/mL');
  setBolusUnit('mg/kg');
  setInfusionUnit('mg/kg/hr');

  // Standard PK (no effect-site model)
  Vd1num.value = 500;    // mL/kg
  Vd2num.value = 1000;   // mL/kg
  Vd3num.value = 1500;   // mL/kg

  Clnum.value  = 10;     // mL/kg/min
  Q2num.value  = 10;     // mL/kg/min
  Q3num.value  = 5;      // mL/kg/min

  ke0num.value = null;     // no effect-site

  syncMicroInputsFromClearanceInputs();
  dfsolve();
}

function bupivacaine() {
  currentDrug = 'bupivacaine';
  setDisplayUnit('µg/mL');
  setBolusUnit('mg/kg');
  setInfusionUnit('µg/kg/min');
  Vd1num.value = 150;
  Vd2num.value = 300;
  Vd3num.value = 600;
  Clnum.value = 3;
  Q2num.value = 15;
  Q3num.value = 6;
  ke0num.value = null;
  syncMicroInputsFromClearanceInputs();
  dfsolve();
}

function phenylephrine() {
  currentDrug = 'phenylephrine';
  setDisplayUnit('ng/mL');
  setBolusUnit('µg/kg');
  setInfusionUnit('µg/kg/min');
  Vd1num.value = 214 + 2.0/7;
  Vd2num.value = 357 + 1.0/7;
  Vd3num.value = 714 + 2.0/7;
  Clnum.value = 17 + 1.0/7;
  Q2num.value = 17 + 1.0/7;
  Q3num.value = 11 + 3.0/7;
  ke0num.value = 0.4;
  syncMicroInputsFromClearanceInputs();
  dfsolve();
}

function ephedrine() {
  currentDrug = 'ephedrine';
  setDisplayUnit('ng/mL');
  setBolusUnit('mg/kg');
  setInfusionUnit('mg/kg/min');
  Vd1num.value = 285 + 5.0/7;
  Vd2num.value = 857 + 1.0/7;
  Vd3num.value = 1714 + 2.0/7;
  Clnum.value = 5 + 5.0/7;
  Q2num.value = 10;
  Q3num.value = 7 + 1.0/7;
  ke0num.value = 0.06;
  syncMicroInputsFromClearanceInputs();
  dfsolve();
}

function epinephrine() {
  currentDrug = 'epinephrine';
  setDisplayUnit('ng/mL');
  setBolusUnit('µg/kg');
  setInfusionUnit('µg/kg/min');
  Vd1num.value = 171 + 3.0/7;
  Vd2num.value = 357 + 1.0/7;
  Vd3num.value = 571 + 3.0/7;
  Clnum.value = 21 + 3.0/7;
  Q2num.value = 21 + 3.0/7;
  Q3num.value = 14 + 2.0/7;
  ke0num.value = 0.8;
  syncMicroInputsFromClearanceInputs();
  dfsolve();
}

function dobutamine() {
  currentDrug = 'dobutamine';
  setDisplayUnit('ng/mL');
  setBolusUnit('µg/kg');
  setInfusionUnit('µg/kg/min');
  Vd1num.value = 214 + 2.0/7;
  Vd2num.value = 428 + 4.0/7;
  Vd3num.value = 714 + 2.0/7;
  Clnum.value = 14 + 2.0/7;
  Q2num.value = 14 + 2.0/7;
  Q3num.value = 10;
  ke0num.value = 0.3;
  syncMicroInputsFromClearanceInputs();
  dfsolve();
}

function dopamine() {
  currentDrug = 'dopamine';
  setDisplayUnit('ng/mL');
  setBolusUnit('µg/kg');
  setInfusionUnit('µg/kg/min');
  Vd1num.value = 228 + 4.0/7;
  Vd2num.value = 428 + 4.0/7;
  Vd3num.value = 785 + 5.0/7;
  Clnum.value = 12 + 6.0/7;
  Q2num.value = 12 + 6.0/7;
  Q3num.value = 8 + 4.0/7;
  ke0num.value = 0.2;
  syncMicroInputsFromClearanceInputs();
  dfsolve();
}

function milrinone() {
  currentDrug = 'milrinone';
  setDisplayUnit('ng/mL');
  setBolusUnit('µg/kg');
  setInfusionUnit('µg/kg/min');
  Vd1num.value = 285 + 5.0/7;
  Vd2num.value = 1000;
  Vd3num.value = 2142 + 6.0/7;
  Clnum.value = 2 + 6.0/7;
  Q2num.value = 7 + 1.0/7;
  Q3num.value = 4 + 2.0/7;
  ke0num.value = 0.03;
  syncMicroInputsFromClearanceInputs();
  dfsolve();
}

function vasopressin() {
  currentDrug = 'vasopressin';
  setDisplayUnit('ng/mL');
  setBolusUnit('µg/kg');
  setInfusionUnit('µg/kg/min');
  Vd1num.value = 171 + 3.0/7;
  Vd2num.value = 357 + 1.0/7;
  Vd3num.value = 571 + 3.0/7;
  Clnum.value = 4 + 2.0/7;
  Q2num.value = 8 + 4.0/7;
  Q3num.value = 5 + 5.0/7;
  ke0num.value = 0.05;
  syncMicroInputsFromClearanceInputs();
  dfsolve();
}

// ============================
// Drug preset library
// ============================
const DRUGS = [
  { id: 'propofol', label: 'Propofol', group: 'Hypnotics & sedatives', note: 'Marsh model (validated preset parameters).' },
  { id: 'etomidate', label: 'Etomidate', group: 'Hypnotics & sedatives', note: 'Arden-derived preset; V3 is refined for less deep accumulation.' },
  { id: 'ketamine', label: 'Ketamine', group: 'Hypnotics & sedatives', note: 'Domino / Clements / Hijazi-type preset.' },
  { id: 'dexmedetomidine', label: 'Dexmedetomidine', group: 'Hypnotics & sedatives', note: 'Dyck / Hannivoort-type preset; literature-consistent adjustment.' },
  { id: 'midazolam', label: 'Midazolam', group: 'Hypnotics & sedatives', note: 'Greenblatt-derived preset with adjusted V1 and Q2.' },
  { id: 'diazepam', label: 'Diazepam', group: 'Hypnotics & sedatives', note: 'Site preset parameters; verify model applicability for the intended patient.' },
  { id: 'fentanyl', label: 'Fentanyl', group: 'Opioid analgesics', note: 'Shafer-type approximation preset.' },
  { id: 'hydromorphone', label: 'Hydromorphone', group: 'Opioid analgesics', note: 'Site preset parameters; verify model applicability for the intended patient.' },
  { id: 'remifentanil', label: 'Remifentanil', group: 'Opioid analgesics', note: 'Weight-normalized Minto approximation preset.' },
  { id: 'sufentanil', label: 'Sufentanil', group: 'Opioid analgesics', note: 'Site preset parameters; verify model applicability for the intended patient.' },
  { id: 'alfentanil', label: 'Alfentanil', group: 'Opioid analgesics', note: 'Site preset parameters; verify model applicability for the intended patient.' },
  { id: 'methadone', label: 'Methadone', group: 'Opioid analgesics', note: 'Site preset parameters; verify model applicability for the intended patient.' },
  { id: 'rocuronium', label: 'Rocuronium', group: 'Neuromuscular blockers', note: 'Site preset parameters; verify model applicability for the intended patient.' },
  { id: 'vecuronium', label: 'Vecuronium', group: 'Neuromuscular blockers', note: 'Site preset parameters; verify model applicability for the intended patient.' },
  { id: 'cisatracurium', label: 'Cisatracurium', group: 'Neuromuscular blockers', note: 'Site preset parameters; verify model applicability for the intended patient.' },
  { id: 'pancuronium', label: 'Pancuronium', group: 'Neuromuscular blockers', note: 'Site preset parameters; verify model applicability for the intended patient.' },
  { id: 'succinylcholine', label: 'Succinylcholine', group: 'Neuromuscular blockers', note: 'Site preset parameters; verify model applicability for the intended patient.' },
  { id: 'lidocaine', label: 'Lidocaine', group: 'Local anesthetics', note: 'Standard PK preset; no validated effect-site model is assumed.' },
  { id: 'bupivacaine', label: 'Bupivacaine', group: 'Local anesthetics', note: 'Site preset parameters; no validated effect-site model is assumed.' },
  { id: 'phenylephrine', label: 'Phenylephrine', group: 'Vasoactive & inotropic agents', note: 'Site preset parameters; verify model applicability for the intended patient.' },
  { id: 'ephedrine', label: 'Ephedrine', group: 'Vasoactive & inotropic agents', note: 'Site preset parameters; verify model applicability for the intended patient.' },
  { id: 'epinephrine', label: 'Epinephrine', group: 'Vasoactive & inotropic agents', note: 'Site preset parameters; verify model applicability for the intended patient.' },
  { id: 'dobutamine', label: 'Dobutamine', group: 'Vasoactive & inotropic agents', note: 'Site preset parameters; verify model applicability for the intended patient.' },
  { id: 'dopamine', label: 'Dopamine', group: 'Vasoactive & inotropic agents', note: 'Site preset parameters; verify model applicability for the intended patient.' },
  { id: 'milrinone', label: 'Milrinone', group: 'Vasoactive & inotropic agents', note: 'Site preset parameters; verify model applicability for the intended patient.' },
  { id: 'vasopressin', label: 'Vasopressin', group: 'Vasoactive & inotropic agents', note: 'Site preset parameters; verify model applicability for the intended patient.' }
];

// Illustrative adult IV inputs in each preset's displayed units. These make a
// useful starting curve, not a regimen for clinical use. Zero means no example
// for that route or dose unit, not a recommendation to omit treatment.
const DRUG_DOSE_EXAMPLES = Object.freeze({
  propofol: { bolus: 1, bolusMinutes: 1, infusion: 100, infusionMinutes: 60, finalMinutes: 255 },
  etomidate: { bolus: 0.3, bolusMinutes: 1 },
  ketamine: { bolus: 1, bolusMinutes: 1, infusion: 1, infusionMinutes: 60 },
  dexmedetomidine: { bolus: 1, bolusMinutes: 10, infusion: 0.5, infusionMinutes: 60 },
  midazolam: { bolus: 0.05, bolusMinutes: 2, infusion: 1, infusionMinutes: 60 },
  diazepam: { bolus: 0.1, bolusMinutes: 2 },
  fentanyl: { bolus: 1, bolusMinutes: 1, infusion: 1, infusionMinutes: 60 },
  hydromorphone: { bolus: 0.005, bolusMinutes: 2 },
  remifentanil: { bolus: 0.5, bolusMinutes: 1, infusion: 0.1, infusionMinutes: 60 },
  sufentanil: { bolus: 0.2, bolusMinutes: 1, infusion: 0.3, infusionMinutes: 60 },
  alfentanil: { bolus: 10, bolusMinutes: 1, infusion: 0.5, infusionMinutes: 60 },
  methadone: { bolus: 0.05, bolusMinutes: 2 },
  rocuronium: { bolus: 0.6, bolusMinutes: 1 },
  vecuronium: { bolus: 0.1, bolusMinutes: 1 },
  cisatracurium: { bolus: 0.15, bolusMinutes: 1, infusion: 1, infusionMinutes: 60 },
  pancuronium: { bolus: 0.08, bolusMinutes: 1 },
  succinylcholine: { bolus: 1, bolusMinutes: 0.5 },
  lidocaine: { bolus: 1, bolusMinutes: 2, infusion: 1, infusionMinutes: 60 },
  // No routine IV bupivacaine example; systemic exposure here is a modeling aid only.
  bupivacaine: {},
  phenylephrine: { bolus: 1, bolusMinutes: 0, infusion: 0.5, infusionMinutes: 60 },
  ephedrine: { bolus: 0.1, bolusMinutes: 0 },
  epinephrine: { infusion: 0.05, infusionMinutes: 60 },
  dobutamine: { infusion: 5, infusionMinutes: 60 },
  dopamine: { infusion: 5, infusionMinutes: 60 },
  milrinone: { bolus: 50, bolusMinutes: 10, infusion: 0.375, infusionMinutes: 60 },
  // Vasopressin is dosed in units/min; a mass-based default would be misleading.
  vasopressin: {}
});

function applyDrugDoseExample(id) {
  const example = DRUG_DOSE_EXAMPLES[id];
  if (!example) return;
  bnum.value = formatInputValue(example.bolus ?? 0);
  tbolusnum.value = formatInputValue(example.bolusMinutes ?? 0);
  infusionnum.value = formatInputValue(example.infusion ?? 0);
  tinfusionnum.value = formatInputValue(example.infusionMinutes ?? 0);
  tfinalnum.value = formatInputValue(example.finalMinutes ?? 120);
}

function populateDrugPicker() {
  ['drugPicker', 'drawerDrugPicker'].forEach(id => {
    const picker = document.getElementById(id);
    if (!picker) return;
    picker.textContent = '';
    const custom = document.createElement('option');
    custom.value = '';
    custom.textContent = 'Custom model (keep current parameters)';
    picker.appendChild(custom);
    const groups = [...new Set(DRUGS.map(d => d.group))];
    groups.forEach(groupName => {
      const group = document.createElement('optgroup');
      group.label = groupName;
      DRUGS.filter(d => d.group === groupName).forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = d.label;
        group.appendChild(opt);
      });
      picker.appendChild(group);
    });
  });
}


function setCurrentDrugLabel() {
  const label = document.getElementById('currentDrugLabel');
  if (!label) return;
  const pickers = [document.getElementById('drugPicker'), document.getElementById('drawerDrugPicker')].filter(Boolean);
  const d = DRUGS.find(x => x.id === currentDrug);
  if (!d) {
    label.textContent = 'Custom model';
    pickers.forEach(picker => { picker.value = ''; });
    return;
  }
  label.textContent = `${d.label}${presetIsModified ? ' — modified' : ''} — units: ${currentUnit.name}`;
  pickers.forEach(picker => { picker.value = d.id; });
}

function clearDosingForDrugSwitch() {
  tciImportSession = null;
  const tciEnabled = document.getElementById('tciEnabled');
  if (tciEnabled) tciEnabled.checked = false;
  initialpnum.value = 0;
  bnum.value = 0;
  tbolusnum.value = 0;
  infusionnum.value = 0;
  tinfusionnum.value = 0;
  const testTarget = document.getElementById('testRegimenTarget');
  if (testTarget) testTarget.value = '';
  selectedTimelineEvent = null;
  timelineUndoSchedule = null;
  setScheduleToDOM({ enabled: false, boluses: [], infusions: [] });
  disableLegacyBolusInfusionInputs(false);
}

function applyDrugById(id, { clearDosing = true } = {}) {
  if (!id) return;
  const fn = window[id];
  if (typeof fn !== 'function') return;

  if (clearDosing) clearDosingForDrugSwitch();
  presetIsModified = false;
  fn();                 // runs the preset (sets units + PK + dfsolve())
  if (clearDosing) applyDrugDoseExample(id);
  applyTciPreset(id);
  setCurrentDrugLabel();
  dfsolve();
  if (clearDosing) setSimulationStatus(
    id === 'bupivacaine' ? 'Bupivacaine has no routine IV dosing example; dosing remains zero. This systemic PK model is educational only.' :
    id === 'vasopressin' ? 'Vasopressin is dosed in units/min, which this mass-based model does not support; dosing remains zero.' :
    'Drug preset loaded with an illustrative adult IV dosing example. Previous dosing was replaced; TCI is off.', 'ok');

  [document.getElementById('drugPicker'), document.getElementById('drawerDrugPicker')]
    .filter(Boolean)
    .forEach(picker => { picker.value = id; });
}


// ============================
// Reset + init
// ============================
function reset() {
  selectedTimelineEvent = null;
  timelineUndoSchedule = null;
  clearDosingForDrugSwitch();
  if (weightnum) weightnum.value = 70;
  if (pkInputModeSelect) pkInputModeSelect.value = 'clearance';
  updatePkInputVisibility();
  presetIsModified = false;
  propofol();
  applyDrugDoseExample('propofol');
  applyTciPreset('propofol');
  const testTarget = document.getElementById('testRegimenTarget');
  if (testTarget) testTarget.value = '';
  const tciStopTime = document.getElementById('tciStopTime');
  if (tciStopTime) tciStopTime.value = tfinalnum.value;

  try {
    setScheduleToDOM({
      enabled: false,
      boluses: [{ time: 0, dose: parseFloatSafe(bnum.value,0), duration: parseFloatSafe(tbolusnum.value,0) }],
      infusions: [{ start: parseFloatSafe(tbolusnum.value,0), end: parseFloatSafe(tbolusnum.value,0) + parseFloatSafe(tinfusionnum.value,0), rate: parseFloatSafe(infusionnum.value,0) }]
    });
  } catch (e) {}

  const useCb = document.getElementById('useSchedule');
  if (useCb) useCb.checked = false;
  disableLegacyBolusInfusionInputs(false);
  updateScheduleUnitLabels();
  setCurrentDrugLabel();
  dfsolve();
  setSimulationStatus('Simulation reset to the default propofol example.', 'ok');
}

function applyMainDoseAdjustment(type) {
  const input = document.getElementById(type === 'bolus' ? 'mainBolusAmount' : 'mainInfusionRate');
  const value = Number(input?.value);
  if (!Number.isFinite(value) || value < 0) {
    input?.classList.add('is-invalid');
    setSimulationStatus(`${type === 'bolus' ? 'Bolus amount' : 'Infusion rate'} must be zero or greater.`, 'error');
    return;
  }
  input?.classList.remove('is-invalid');

  const schedule = getScheduleFromDOM();
  if (schedule.enabled) {
    const events = type === 'bolus' ? schedule.boluses : schedule.infusions;
    const field = type === 'bolus' ? 'dose' : 'rate';
    if (!events?.length) return;
    events[0][field] = value;
    setScheduleToDOM(schedule);
  } else if (type === 'bolus' && bnum) {
    bnum.value = value;
  } else if (type === 'infusion' && infusionnum) {
    infusionnum.value = value;
  }
  dfsolve();
}


function wireInputs() {
  [
    Vd1num, Vd2num, Vd3num,
    Clnum, Q2num, Q3num,
    k10inputnum, k12inputnum, k21inputnum, k13inputnum, k31inputnum, ke0num
  ].forEach(el => el?.addEventListener('change', () => {
    markPresetModified();
    dfsolve();
  }));

  [
    bnum, tbolusnum, tinfusionnum, infusionnum,
    initialpnum, tfinalnum, weightnum
  ].forEach(el => el?.addEventListener('change', () => dfsolve()));

  pkInputModeSelect?.addEventListener("change", () => {
    if (getPkInputMode() === "microconstants") syncMicroInputsFromClearanceInputs();
    else syncClearanceInputsFromMicroInputs();
    updatePkInputVisibility();
    dfsolve();
  });

  bolusUnitSelect?.addEventListener('change', () => {
    setBolusUnit(bolusUnitSelect.value);
    dfsolve();
  });
  infusionUnitSelect?.addEventListener('change', () => {
    setInfusionUnit(infusionUnitSelect.value);
    dfsolve();
  });

  ['tciTargetType', 'tciTarget', 'tciMaxRate', 'tciStopTime'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => dfsolve());
  });
  document.getElementById('tciEnabled')?.addEventListener('change', event => {
    if (event.target.checked) {
      const useSchedule = document.getElementById('useSchedule');
      if (useSchedule) useSchedule.checked = false;
      disableLegacyBolusInfusionInputs(true);
      setSimulationStatus('Educational TCI mode is active; manual dosing inputs are not used.', 'ok');
    } else {
      disableLegacyBolusInfusionInputs(Boolean(document.getElementById('useSchedule')?.checked));
    }
    dfsolve();
  });

  document.getElementById('scaleToggleBtnTop')?.addEventListener('click', () => toggleScale());
  document.getElementById('darkModeBtnTop')?.addEventListener('click', () => toggleDarkMode());

  ['drugPicker', 'drawerDrugPicker'].forEach(id => {
    const drugPicker = document.getElementById(id);
    drugPicker?.addEventListener('change', () => {
      if (drugPicker.value) {
        applyDrugById(drugPicker.value);
        return;
      }
      tciImportSession = null;
      currentDrug = null;
      presetIsModified = false;
      applyTciPreset(null);
      setCurrentDrugLabel();
      dfsolve();
    });
  });

  document.getElementById('mainBolusAmount')?.addEventListener('change', () => applyMainDoseAdjustment('bolus'));
  document.getElementById('mainInfusionRate')?.addEventListener('change', () => applyMainDoseAdjustment('infusion'));
  document.getElementById('undoTimelineBtn')?.addEventListener('click', undoTimelineDeletion);
  document.getElementById('mainResetBtn')?.addEventListener('click', reset);
  document.getElementById('timelineEventSaveBtn')?.addEventListener('click', saveSelectedTimelineEvent);
  document.getElementById('timelineEventDuplicateBtn')?.addEventListener('click', duplicateSelectedTimelineEvent);
  document.getElementById('timelineEventDeleteBtn')?.addEventListener('click', deleteSelectedTimelineEvent);
  document.getElementById('generateTestRegimenBtn')?.addEventListener('click', generateModelDerivedTestRegimen);
  ['mainTciTargetType', 'mainTciTarget', 'mainTciMaxRate', 'mainTciStopTime'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', applyMainTciAdjustment);
  });

  document.getElementById('resetBtn')?.addEventListener('click', () => reset());
  document.getElementById('oneCompBtn')?.addEventListener('click', () => onecompartment());
  document.getElementById('summaryParamsBtn')?.addEventListener('click', () => document.getElementById('paramsBtn')?.click());
  document.getElementById('exportPdfBtn')?.addEventListener('click', exportSimulationPdf);
}

(function init() {
  applyPlotTheme();
  initDrawer();
  populateDrugPicker();
  initializeUnitSelectors();
  ensureTherapeuticToggle();
  ensureScheduleUI();
  ensureTimelineEditor();
  ensureCompareUI();
  initDistributionDetails();
  wireInputs();
  window.addEventListener('beforeprint', () => {
    if (latestPdfContext) updatePdfDoseProtocol(latestPdfContext.params, latestPdfContext.schedule);
  });
  updatePkInputVisibility();
  syncMicroInputsFromClearanceInputs();
  reset();

  window.addEventListener('resize', () => {
    ['myDiv1','myDiv2','myDiv3','tciRatePlot'].forEach(id => {
      const el = document.getElementById(id);
      if (el && window.Plotly) Plotly.Plots.resize(el);
    });
  });
})();
