/* threecompartmentmodel.js
   Clean UI wiring + existing PK/PD model logic.
   Notes:
   - Keeps your internal math the same.
   - Adds: top-bar drug search/datalist, right drawer.
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

// ============================
// Drawer + collapsible cards
// ============================
function initDrawer() {
  const btn = $('#paramsBtn');
  const drawer = $('#paramsDrawer');
  const backdrop = $('#drawerBackdrop');
  const closeBtn = $('#drawerCloseBtn');

  function openDrawer() {
    document.body.classList.add('drawer-open');
    btn?.setAttribute('aria-expanded', 'true');
    drawer?.setAttribute('aria-hidden', 'false');
    backdrop?.setAttribute('aria-hidden', 'false');
    // Allow Plotly to re-measure after drawer animation
    setTimeout(() => ['myDiv1','myDiv2','myDiv3'].forEach(id => {
      const el = document.getElementById(id);
      if (el && window.Plotly) Plotly.Plots.resize(el);
    }), 260);
  }

  function closeDrawer() {
    document.body.classList.remove('drawer-open');
    btn?.setAttribute('aria-expanded', 'false');
    drawer?.setAttribute('aria-hidden', 'true');
    backdrop?.setAttribute('aria-hidden', 'true');
  }

  btn?.addEventListener('click', openDrawer);
  closeBtn?.addEventListener('click', closeDrawer);
  backdrop?.addEventListener('click', closeDrawer);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

  // Collapse cards (simple)
  $$('.card-header[data-collapse="true"]').forEach(h => {
    h.addEventListener('click', () => {
      const body = h.nextElementSibling;
      const icon = h.querySelector('.toggle-icon');
      if (!body) return;
      const isHidden = body.style.display === 'none';
      body.style.display = isHidden ? 'block' : 'none';
      if (icon) icon.textContent = isHidden ? '▼' : '▲';
      // Resize Plotly if plots are inside (they are not), but keep safe
      setTimeout(() => ['myDiv1','myDiv2','myDiv3'].forEach(id => {
        const el = document.getElementById(id);
        if (el && window.Plotly) Plotly.Plots.resize(el);
      }), 50);
    });
  });

  // Start with advanced sections collapsed (optional)
  const collapseById = (id, collapsed=true) => {
    const card = document.getElementById(id);
    if (!card) return;
    const header = card.querySelector('.card-header');
    const body = header?.nextElementSibling;
    const icon = header?.querySelector('.toggle-icon');
    if (!body) return;
    body.style.display = collapsed ? 'none' : 'block';
    if (icon) icon.textContent = collapsed ? '▲' : '▼';
  };
  collapseById('parameterCard',true);
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
  if (btn) btn.textContent = isLogScale ? 'Linear' : 'Log';
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
const bhtml = document.getElementById("bhtml");
bhtml.innerHTML = "Bolus (mg/kg)";
const bnum = document.getElementById("b");
const infusionhtml = document.getElementById("infusionhtml");
infusionhtml.innerHTML = "Infusion (mg/kg/min)";
const infusionnum = document.getElementById("infusion");
const tbolushtml = document.getElementById("tbolushtml");
tbolushtml.innerHTML = "Bolus Time (min)";
const tbolusnum = document.getElementById("tbolus");
const tinfusionhtml = document.getElementById("tinfusionhtml");
tinfusionhtml.innerHTML = "Infusion Time (min)";
const tinfusionnum = document.getElementById("tinfusion");
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

function setDisplayUnit(unitName) {
  currentUnit = UNITS[unitName] || UNITS['mg/mL'];
  initialphtml.innerHTML = `[<i>P</i>]<sub>init</sub> (${unitName})`;
  concentrationunitshtml1.innerHTML = unitName;
  concentrationunitshtml2.innerHTML = unitName;
}

const BOLUSUNITS = {
  'mg/kg': { name: 'mg/kg', factor: 1 },
  'µg/kg': { name: 'µg/kg', factor: 1e3 },
  'ng/kg': { name: 'ng/kg', factor: 1e6 }
};
let currentBolusUnit = BOLUSUNITS['mg/kg'];

function setBolusUnit(unitName) {
  currentBolusUnit = BOLUSUNITS[unitName] || BOLUSUNITS['mg/kg'];
  bhtml.innerHTML = `Bolus (${unitName})`;
  updateScheduleUnitLabels();
}

const INFUSIONUNITS = {
  'mg/kg/min': { name: 'mg/kg/min', factor: 1 },
  'µg/kg/min': { name: 'µg/kg/min', factor: 1e3 },
  'ng/kg/min': { name: 'ng/kg/min', factor: 1e6 },
  'mg/kg/hr': { name: 'mg/kg/hr', factor: 60.0 },
  'µg/kg/hr': { name: 'µg/kg/hr', factor: 1e3 * 60.0 },
  'ng/kg/hr': { name: 'ng/kg/hr', factor: 1e6 * 60.0 }
};
let currentInfusionUnit = INFUSIONUNITS['mg/kg/min'];

function setInfusionUnit(unitName) {
  currentInfusionUnit = INFUSIONUNITS[unitName] || INFUSIONUNITS['mg/kg/min'];
  infusionhtml.innerHTML = `Infusion (${unitName})`;
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

function addBolusRow({ time = 0, dose = 0, duration = 0 } = {}) {
  const tbl = document.getElementById('bolusEventsTable');
  if (!tbl || !tbl.tBodies || !tbl.tBodies[0]) return;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="number" class="form-control form-control-sm" data-field="time" value="${time}"></td>
    <td><input type="number" class="form-control form-control-sm" data-field="dose" value="${dose}"></td>
    <td><input type="number" class="form-control form-control-sm" data-field="duration" value="${duration}"></td>
    <td><button class="btn btn-sm btn-outline-danger" type="button" data-action="remove">×</button></td>
  `;
  tbl.tBodies[0].appendChild(tr);
}

function addInfusionRow({ start = 0, end = 0, rate = 0 } = {}) {
  const tbl = document.getElementById('infusionEventsTable');
  if (!tbl || !tbl.tBodies || !tbl.tBodies[0]) return;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="number" class="form-control form-control-sm" data-field="start" value="${start}"></td>
    <td><input type="number" class="form-control form-control-sm" data-field="end" value="${end}"></td>
    <td><input type="number" class="form-control form-control-sm" data-field="rate" value="${rate}"></td>
    <td><button class="btn btn-sm btn-outline-danger" type="button" data-action="remove">×</button></td>
  `;
  tbl.tBodies[0].appendChild(tr);
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

  if (bs.length === 0) addBolusRow({ time: 0, dose: 0, duration: 0 });
  else bs.forEach(b => addBolusRow(b));

  if (ins.length === 0) addInfusionRow({ start: 0, end: 0, rate: 0 });
  else ins.forEach(i => addInfusionRow(i));
}

function buildInputRateFromSchedule(schedule, dt, tfinal) {
  const N = Math.ceil(tfinal / dt);
  const u = new Array(N).fill(0);
  const instant = new Array(N + 1).fill(0);
  if (!schedule || !schedule.enabled) return { u, instant };

  const bFactor = (currentBolusUnit && currentBolusUnit.factor) ? currentBolusUnit.factor : 1;
  (schedule.boluses || []).forEach(ev => {
    const t = Math.max(0, parseFloatSafe(ev.time, 0));
    const doseMgKg = parseFloatSafe(ev.dose, 0) / bFactor;
    const dur = Math.max(0, parseFloatSafe(ev.duration, 0));
    if (!Number.isFinite(doseMgKg) || doseMgKg === 0) return;
    const idx0 = clamp(Math.round(t / dt), 0, N);
    if (dur <= 0) {
      instant[idx0] += doseMgKg;
      return;
    }
    const idx1 = clamp(Math.round((t + dur) / dt), 0, N);
    const end = Math.max(idx0 + 1, idx1);
    const rate = doseMgKg / dur;
    for (let i = idx0; i < Math.min(end, N); i++) u[i] += rate;
  });

  const iFactor = (currentInfusionUnit && currentInfusionUnit.factor) ? currentInfusionUnit.factor : 1;
  (schedule.infusions || []).forEach(ev => {
    let s = Math.max(0, parseFloatSafe(ev.start, 0));
    let e = Math.max(0, parseFloatSafe(ev.end, 0));
    if (e < s) { const tmp = e; e = s; s = tmp; }
    const rateMgKgMin = parseFloatSafe(ev.rate, 0) / iFactor;
    if (!Number.isFinite(rateMgKgMin) || rateMgKgMin === 0) return;
    const idx0 = clamp(Math.round(s / dt), 0, N);
    const idx1 = clamp(Math.round(e / dt), 0, N);
    if (idx1 <= idx0) return;
    for (let i = idx0; i < Math.min(idx1, N); i++) u[i] += rateMgKgMin;
  });

  return { u, instant };
}

function ensureScheduleUI() {
  const useCb = document.getElementById('useSchedule');
  const bolusTbl = document.getElementById('bolusEventsTable');
  const infTbl = document.getElementById('infusionEventsTable');
  const addB = document.getElementById('addBolusEventBtn');
  const addI = document.getElementById('addInfusionEventBtn');
  const clrB = document.getElementById('clearBolusEventsBtn');
  const clrI = document.getElementById('clearInfusionEventsBtn');
  if (!useCb || !bolusTbl || !infTbl || !addB || !addI || !clrB || !clrI) return;

  useCb.checked = true;
  disableLegacyBolusInfusionInputs(true);
  updateScheduleUnitLabels();

  if (bolusTbl.tBodies[0].rows.length === 0) addBolusRow({ time: 0, dose: 0, duration: 0 });
  if (infTbl.tBodies[0].rows.length === 0) addInfusionRow({ start: 0, end: 0, rate: 0 });

  useCb.addEventListener('change', () => { disableLegacyBolusInfusionInputs(useCb.checked); dfsolve(); });
  addB.addEventListener('click', () => { addBolusRow(); dfsolve(); });
  addI.addEventListener('click', () => { addInfusionRow(); dfsolve(); });
  clrB.addEventListener('click', () => { clearTable(bolusTbl); addBolusRow({ time: 0, dose: 0, duration: 0 }); dfsolve(); });
  clrI.addEventListener('click', () => { clearTable(infTbl); addInfusionRow({ start: 0, end: 0, rate: 0 }); dfsolve(); });

  bolusTbl.addEventListener('input', () => { if (useCb.checked) dfsolve(); });
  infTbl.addEventListener('input', () => { if (useCb.checked) dfsolve(); });

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
let showTherapeutic = true;

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
  if (!showTherapeutic || !currentDrug) return { shapes, legendTraces };
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
    units: {
      conc: currentUnit?.name || 'mg/mL',
      bolus: currentBolusUnit?.name || 'mg/kg',
      infusion: currentInfusionUnit?.name || 'mg/kg/min'
    },
    inputs: {
      b: parseFloat(bnum.value),
      tbolus: parseFloat(tbolusnum.value),
      infusion: parseFloat(infusionnum.value),
      tinfusion: parseFloat(tinfusionnum.value),
      tfinal: parseFloat(tfinalnum.value),
      initialp: parseFloat(initialpnum.value)
    },
    schedule: getScheduleFromDOM(),
    pk: {
      Vd1: parseFloat(Vd1num.value),
      Vd2: parseFloat(Vd2num.value),
      Vd3: parseFloat(Vd3num.value),
      Cl: parseFloat(Clnum.value),
      Q2: parseFloat(Q2num.value),
      Q3: parseFloat(Q3num.value),
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
      <div class="list-group-item ${activeClass}" data-id="${s.id}">
        <div class="d-flex justify-content-between align-items-start gap-2">
          <div class="flex-grow-1">
            <input class="form-control form-control-sm strategy-name" data-id="${s.id}" value="${s.name}" />
            <div class="small text-muted mt-1">${subtitle}</div>
          </div>
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-primary" type="button" data-action="load" data-id="${s.id}">Load</button>
            <button class="btn btn-outline-danger" type="button" data-action="delete" data-id="${s.id}">✕</button>
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
  try {
    if (s.drug && typeof window[s.drug] === 'function') window[s.drug]();
  } catch (e) {
    console.warn('Could not switch drug preset:', e);
  }

  bnum.value = s.inputs.b;
  tbolusnum.value = s.inputs.tbolus;
  infusionnum.value = s.inputs.infusion;
  tinfusionnum.value = s.inputs.tinfusion;
  tfinalnum.value = s.inputs.tfinal;
  initialpnum.value = s.inputs.initialp;

  Vd1num.value = s.pk.Vd1;
  Vd2num.value = s.pk.Vd2;
  Vd3num.value = s.pk.Vd3;
  Clnum.value = s.pk.Cl;
  Q2num.value = s.pk.Q2;
  Q3num.value = s.pk.Q3;
  ke0num.value = s.pk.ke0;

  if (s.schedule) setScheduleToDOM(s.schedule);
  activeStrategyId = s.id;
  renderStrategyList();
  dfsolve();
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
  const p = state.pk;
  const inp = state.inputs;
  const dt = 0.1;
  const N = Math.ceil(inp.tfinal / dt);

  const k12 = p.Q2 / p.Vd1;
  const k13 = p.Q3 / p.Vd1;
  const k10 = p.Cl / p.Vd1;
  const k21 = p.Q2 / p.Vd2;
  const k31 = p.Q3 / p.Vd3;

  const initUnit = UNITS[state.units.conc] || UNITS['mg/mL'];
  const initialp_mgml = inp.initialp / initUnit.factor;

  const bUnit = BOLUSUNITS[state.units.bolus] || BOLUSUNITS['mg/kg'];
  const iUnit = INFUSIONUNITS[state.units.infusion] || INFUSIONUNITS['mg/kg/min'];

  const tbol = Math.max(0, inp.tbolus);
  const tinf = Math.max(0, inp.tinfusion);
  const bolusRate = (tbol > 0 ? (inp.b / tbol) : 0) / bUnit.factor;
  const infusionRate = (inp.infusion) / iUnit.factor;
  const Nhalf1 = Math.ceil(tbol / dt);
  const Nhalf2 = Nhalf1 + Math.ceil(tinf / dt);

  const schedule = (state && state.schedule && state.schedule.enabled) ? state.schedule : { enabled: false };

  function buildRatesFromStateSchedule() {
    const u = new Array(N).fill(0);
    const instant = new Array(N + 1).fill(0);
    if (!schedule || !schedule.enabled) return { u, instant };

    const bF = bUnit.factor;
    (schedule.boluses || []).forEach(ev => {
      const t = Math.max(0, parseFloatSafe(ev.time, 0));
      const doseMgKg = parseFloatSafe(ev.dose, 0) / bF;
      const dur = Math.max(0, parseFloatSafe(ev.duration, 0));
      if (!Number.isFinite(doseMgKg) || doseMgKg === 0) return;
      const idx0 = clamp(Math.round(t / dt), 0, N);
      if (dur <= 0) { instant[idx0] += doseMgKg; return; }
      const idx1 = clamp(Math.round((t + dur) / dt), 0, N);
      const end = Math.max(idx0 + 1, idx1);
      const rate = doseMgKg / dur;
      for (let i = idx0; i < Math.min(end, N); i++) u[i] += rate;
    });

    const iF = iUnit.factor;
    (schedule.infusions || []).forEach(ev => {
      let s = Math.max(0, parseFloatSafe(ev.start, 0));
      let e = Math.max(0, parseFloatSafe(ev.end, 0));
      if (e < s) { const tmp = e; e = s; s = tmp; }
      const rateMgKgMin = parseFloatSafe(ev.rate, 0) / iF;
      if (!Number.isFinite(rateMgKgMin) || rateMgKgMin === 0) return;
      const idx0 = clamp(Math.round(s / dt), 0, N);
      const idx1 = clamp(Math.round(e / dt), 0, N);
      if (idx1 <= idx0) return;
      for (let i = idx0; i < Math.min(idx1, N); i++) u[i] += rateMgKgMin;
    });

    return { u, instant };
  }

  const sched = buildRatesFromStateSchedule();

  const ts = new Array(N + 1);
  for (let i = 0; i <= N; i++) ts[i] = i * dt;

  const xs1 = new Array(N + 1);
  const xs2 = new Array(N + 1);
  const xs3 = new Array(N + 1);
  const ces = new Array(N + 1);

  xs1[0] = initialp_mgml * p.Vd1;
  xs2[0] = 0;
  xs3[0] = 0;
  ces[0] = initialp_mgml;

  const mat = math.matrix([
    [ -dt*(k10 + k12 + k13), dt*k21, dt*k31, 0, dt ],
    [ dt*k12, -dt*k21, 0, 0, 0 ],
    [ dt*k13, 0, -dt*k31, 0, 0 ],
    [ dt*(p.ke0/p.Vd1), 0, 0, -dt*(p.ke0), 0 ],
    [ 0, 0, 0, 0, 0 ]
  ]);
  const M = math.expm(mat);

  const a11 = M.subset(math.index(0,0)), a12 = M.subset(math.index(0,1)), a13 = M.subset(math.index(0,2)), a15 = M.subset(math.index(0,4));
  const a21 = M.subset(math.index(1,0)), a22 = M.subset(math.index(1,1)), a23 = M.subset(math.index(1,2)), a25 = M.subset(math.index(1,4));
  const a31 = M.subset(math.index(2,0)), a32 = M.subset(math.index(2,1)), a33 = M.subset(math.index(2,2)), a35 = M.subset(math.index(2,4));
  const a41 = M.subset(math.index(3,0)), a42 = M.subset(math.index(3,1)), a43 = M.subset(math.index(3,2)), a44 = M.subset(math.index(3,3)), a45 = M.subset(math.index(3,4));

  for (let i = 0; i < N; i++) {
    let u = 0;
    if (schedule && schedule.enabled) {
      if (sched.instant && sched.instant[i]) xs1[i] = xs1[i] + sched.instant[i];
      u = (sched.u && sched.u[i]) ? sched.u[i] : 0;
    } else {
      if (i < Nhalf1) u = bolusRate;
      else if (i < Nhalf2) u = infusionRate;
      else u = 0;
    }

    const x1 = xs1[i], x2 = xs2[i], x3 = xs3[i], ce = ces[i];
    xs1[i+1] = a11*x1 + a12*x2 + a13*x3 + u*a15;
    xs2[i+1] = a21*x1 + a22*x2 + a23*x3 + u*a25;
    xs3[i+1] = a31*x1 + a32*x2 + a33*x3 + u*a35;
    ces[i+1] = a41*x1 + a42*x2 + a43*x3 + a44*ce + u*a45;
  }

  const cp = xs1.map(x => x / p.Vd1);
  const ce = ces.slice();
  return { ts, cp, ce };
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
  const idxCe = ce.reduce((imax, v, i, arr) => (v > arr[imax] ? i : imax), 0);

  const bUnit = BOLUSUNITS[state.units.bolus] || BOLUSUNITS['mg/kg'];
  const iUnit = INFUSIONUNITS[state.units.infusion] || INFUSIONUNITS['mg/kg/min'];
  const bolusDose_mgkg = (state.inputs.b || 0) / bUnit.factor;
  const infusionRate_mgkgmin = (state.inputs.infusion || 0) / iUnit.factor;
  const infusionDose_mgkg = infusionRate_mgkgmin * (state.inputs.tinfusion || 0);

  return {
    totalDose_mgkg: bolusDose_mgkg + infusionDose_mgkg,
    cmaxCp: cp[idxCp], tmaxCp: ts[idxCp],
    cmaxCe: ce[idxCe], tmaxCe: ts[idxCe],
    aucCp: trapz(cp, ts), aucCe: trapz(ce, ts),
    finalCp: cp[cp.length-1], finalCe: ce[ce.length-1]
  };
}

function renderCompareResults(rows, unitLabel) {
  const container = document.getElementById('compareResults');
  if (!container) return;
  if (!rows || !rows.length) { container.innerHTML = ''; return; }

  const fmt = (x, sig=3) => roundToSignificantFigures(x, sig);

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
        <td class="text-start">${r.state.name}</td>
        <td>${fmt(m.totalDose_mgkg, 4)}</td>
        <td>${fmt(m.cmaxCp * currentUnit.factor, 4)}</td>
        <td>${fmt(m.tmaxCp, 3)}</td>
        <td>${fmt(m.cmaxCe * currentUnit.factor, 4)}</td>
        <td>${fmt(m.tmaxCe, 3)}</td>
        <td>${fmt(m.aucCp * currentUnit.factor, 4)}</td>
        <td>${fmt(m.aucCe * currentUnit.factor, 4)}</td>
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
    traces.push({ x: sim.ts, y: sim.ce.map(v => v * yFactor), name: `${s.name} Ce (${unitLabel})`, legendgroup: s.id, line: { color, width: 2, dash: 'dot' } });
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
// Main solver / plotting (preserved)
// ============================
function addEventMarkers(layout) {
  const finalTime = parseFloatSafe(document.getElementById('tfinal')?.value, 0);
  layout.shapes = [];
  layout.annotations = [];
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

function dfsolve() {
  let params = { b: [], Cl: [], Q2: [], Q3: [], Vd1: [], Vd2: [], Vd3: [], tbolus: [], tinfusion: [], initialp: [], tfinal: [], dt: [], ke0: [] };
  params.Vd1 = parseFloat(Vd1num.value);
  params.Vd2 = parseFloat(Vd2num.value);
  params.Vd3 = parseFloat(Vd3num.value);
  params.Cl = parseFloat(Clnum.value);
  params.Q2 = parseFloat(Q2num.value) / 1.0;
  params.Q3 = parseFloat(Q3num.value) / 1.0;

  // Legacy b/tbolus is still read (but disabled when schedule is enabled)
  params.b = parseFloat(bnum.value) / parseFloat(tbolusnum.value) / currentBolusUnit.factor;
  params.tbolus = parseFloat(tbolusnum.value);
  params.tinfusion = parseFloat(tinfusionnum.value);
  params.initialp = parseFloat(initialpnum.value);
  params.tfinal = parseFloat(tfinalnum.value);
  params.dt = 0.1;
  params.ke0 = Number.isFinite(parseFloat(ke0num.value)) ? parseFloat(ke0num.value) : 0;

  const k12 = params.Q2 / params.Vd1;
  const k13 = params.Q3 / params.Vd1;
  const k10 = params.Cl / params.Vd1;
  const k21 = params.Q2 / params.Vd2;
  const k31 = params.Q3 / params.Vd3;

  const N = Math.ceil(params.tfinal / params.dt);
  const Nhalf1 = Math.ceil(params.tbolus / params.dt);
  const Nhalf2 = Nhalf1 + Math.ceil(params.tinfusion / params.dt);

  const ts = new Array(N + 1);
  const xs1 = new Array(N + 1);
  const xs2 = new Array(N + 1);
  const xs3 = new Array(N + 1);
  const ces = new Array(N + 1);
  for (let i = 0; i < N + 1; i++) ts[i] = i * params.dt;

  let x01 = params.initialp * params.Vd1 / currentUnit.factor;
  xs1[0] = x01; xs2[0] = 0; xs3[0] = 0;
  ces[0] = params.initialp / currentUnit.factor;

  const dt = params.dt;
  const mat = math.matrix([
    [ -dt*(k10 + k12 + k13), dt*k21, dt*k31, 0, dt ],
    [ dt*k12, -dt*(k21), 0, 0, 0 ],
    [ dt*k13, 0, -dt*(k31), 0, 0 ],
    [ dt*(params.ke0/params.Vd1), 0, 0, -dt*(params.ke0), 0 ],
    [ 0, 0, 0, 0, 0 ]
  ]);
  const M = math.expm(mat);

  const a11 = M.subset(math.index(0,0)), a12 = M.subset(math.index(0,1)), a13 = M.subset(math.index(0,2)), a15 = M.subset(math.index(0,4));
  const a21 = M.subset(math.index(1,0)), a22 = M.subset(math.index(1,1)), a23 = M.subset(math.index(1,2)), a25 = M.subset(math.index(1,4));
  const a31 = M.subset(math.index(2,0)), a32 = M.subset(math.index(2,1)), a33 = M.subset(math.index(2,2)), a35 = M.subset(math.index(2,4));
  const a41 = M.subset(math.index(3,0)), a42 = M.subset(math.index(3,1)), a43 = M.subset(math.index(3,2)), a44 = M.subset(math.index(3,3)), a45 = M.subset(math.index(3,4));

  const schedule = getScheduleFromDOM();
  const schedRates = buildInputRateFromSchedule(schedule, params.dt, params.tfinal);
  const uArr = schedRates.u;
  const instArr = schedRates.instant;

  let counter = 0;
  while (counter < N) {
    let u = 0;
    if (schedule && schedule.enabled) {
      if (instArr && instArr[counter]) xs1[counter] = xs1[counter] + instArr[counter];
      u = (uArr && uArr[counter]) ? uArr[counter] : 0;
    } else {
      if (counter < Nhalf1) u = parseFloat(bnum.value) / parseFloat(tbolusnum.value) / currentBolusUnit.factor;
      else if (counter < Nhalf2) u = parseFloat(infusionnum.value) / currentInfusionUnit.factor;
      else u = 0;
    }

    params.b = u;

    const x1n = a11*xs1[counter] + a12*xs2[counter] + a13*xs3[counter] + params.b*a15;
    const x2n = a21*xs1[counter] + a22*xs2[counter] + a23*xs3[counter] + params.b*a25;
    const x3n = a31*xs1[counter] + a32*xs2[counter] + a33*xs3[counter] + params.b*a35;
    const cen = a41*xs1[counter] + a42*xs2[counter] + a43*xs3[counter] + a44*ces[counter] + params.b*a45;

    xs1[counter+1] = x1n;
    xs2[counter+1] = x2n;
    xs3[counter+1] = x3n;
    ces[counter+1] = cen;
    counter++;
  }

  const yFactor = currentUnit.factor;
  const unitLabel = currentUnit.name;

  const trace_cp = { x: [], y: [], name: `Cp (${unitLabel})`, line: { color: '#1f77b4', width: 2 } };
  const trace_ce = { x: [], y: [], name: `Ce (${unitLabel})`, line: { color: '#ff7f0e', width: 2, dash: 'dot' } };
  const trace_p1 = { x: [], y: [], name: `P1 Compartment (${unitLabel})`, line: { width: 2 } };
  const trace_p2 = { x: [], y: [], name: `P2 Compartment (${unitLabel})`, line: { width: 2 } };

  for (let i = 0; i < N + 1; i++) {
    const t = ts[i];
    const cp = (xs1[i] / params.Vd1);
    const p1 = (xs2[i] / params.Vd2);
    const p2 = (xs3[i] / params.Vd3);
    const ce = (ces[i]);

    trace_cp.x.push(t); trace_cp.y.push(cp * yFactor);
    trace_ce.x.push(t); trace_ce.y.push(ce * yFactor);
    trace_p1.x.push(t); trace_p1.y.push(p1 * yFactor);
    trace_p2.x.push(t); trace_p2.y.push(p2 * yFactor);
  }

  let layout1 = {
    title: { text: 'Central vs Effect-site' },
    xaxis: { title: { text: 'Time (min)' } },
    yaxis: { title: { text: `Concentration (${unitLabel})` } }
  };
  let layout2 = {
    title: { text: 'P1 Compartment' },
    xaxis: { title: { text: 'Time (min)' } },
    yaxis: { title: { text: `Concentration (${unitLabel})` } },
    showlegend: false
  };
  let layout3 = {
    title: { text: 'P2 Compartment' },
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

  const panel1Traces = [trace_cp, trace_ce, ...legendTraces];
  const PLOT_CONFIG = { responsive: true, displaylogo: false };

  if (compareMode && strategies.some(s => s.drug === currentDrug)) {
    plotComparisonFromCurrent();
  } else {
    Plotly.newPlot('myDiv1', panel1Traces, layout1, PLOT_CONFIG);
  }

  Plotly.newPlot('myDiv2', [trace_p1], layout2, PLOT_CONFIG);
  Plotly.newPlot('myDiv3', [trace_p2], layout3, PLOT_CONFIG);

  // Results
  pfinalhtml.innerHTML = roundToSignificantFigures(yFactor * xs1[N] / params.Vd1, 3);
  const uLast = (Number.isFinite(params.b) ? params.b : 0);
  const pss = uLast / params.Cl;
  psshtml.innerHTML = roundToSignificantFigures(yFactor * pss, 3);

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

  k10html.innerHTML = roundToSignificantFigures(k10, 3);
  k12html.innerHTML = roundToSignificantFigures(k12, 3);
  k21html.innerHTML = roundToSignificantFigures(k21, 3);
  k13html.innerHTML = roundToSignificantFigures(k13, 3);
  k31html.innerHTML = roundToSignificantFigures(k31, 3);

  // Context-sensitive half-life
  let cshl = 0;
  let x1 = xs1[N], x2 = xs2[N], x3 = xs3[N];
  while (x1 > (xs1[N]/2)) {
    cshl += params.dt;
    const x1t = x1, x2t = x2, x3t = x3;
    x1 = a11*x1t + a12*x2t + a13*x3t;
    x2 = a21*x1t + a22*x2t + a23*x3t;
    x3 = a31*x1t + a32*x2t + a33*x3t;
    if (cshl > 1e6) break;
  }
  contextsensitivehalflifehtml.innerHTML = roundToSignificantFigures(cshl, 3);
}

window.dfsolve = dfsolve;

function onecompartment() {
  Q2num.value = 0;
  Q3num.value = 0;
  dfsolve();
}

// ============================
// Drug presets (kept from your file; unchanged values)
// ============================
function propofol() {
  currentDrug = 'propofol';
  setDisplayUnit('µg/mL');
  setBolusUnit('mg/kg');
  setInfusionUnit('µg/kg/min');
  Vd1num.value = 61;
  Vd2num.value = 270;
  Vd3num.value = 3400;
  Clnum.value = 27.023;
  Q2num.value = 18.422;
  Q3num.value = 11.956;
  ke0num.value = 0.456;
  dfsolve();
}

function etomidate() {
  currentDrug = 'etomidate';
  setDisplayUnit('µg/mL');
  setBolusUnit('mg/kg');
  setInfusionUnit('mg/kg/hr');
  Vd1num.value = 4.45/70*1000;
  Vd2num.value = 15/70*1000;
  Vd3num.value = 60/70*1000;
  Clnum.value = 0.63/70*1000;
  Q2num.value = 3/70*1000;
  Q3num.value = 0.5/70*1000;
  ke0num.value = 0.45;
  dfsolve();
}

function ketamine() {
  currentDrug = 'ketamine';
  setDisplayUnit('µg/mL');
  setBolusUnit('mg/kg');
  setInfusionUnit('mg/kg/hr');
  Vd1num.value = 20/70*1000;
  Vd2num.value = 40/70*1000;
  Vd3num.value = 125/70*1000;
  Clnum.value = 1.2/70*1000;
  Q2num.value = 1.5/70*1000;
  Q3num.value = 0.3/70*1000;
  ke0num.value = 0.25;
  dfsolve();
}

function dexmedetomidine() {
  currentDrug = 'dexmedetomidine';
  setDisplayUnit('ng/mL');
  setBolusUnit('µg/kg');
  setInfusionUnit('µg/kg/hr');
  Vd1num.value = 1.78/70*1000;
  Vd2num.value = 30.3/70*1000;
  Vd3num.value = 62/70*1000;
  Clnum.value = 0.686/70*1000;
  Q2num.value = 2.98/70*1000;
  Q3num.value = 0.602/70*1000;
  ke0num.value = 0.277;
  dfsolve();
}

function midazolam() {
  currentDrug = 'midazolam';
  setDisplayUnit('µg/mL');
  setBolusUnit('mg/kg');
  setInfusionUnit('µg/kg/min');
  Vd1num.value = 25/70*1000;
  Vd2num.value = 50/70*1000;
  Vd3num.value = 125/70*1000;
  Clnum.value = 0.45/70*1000;
  Q2num.value = 1.5/70*1000;
  Q3num.value = 0.3/70*1000;
  ke0num.value = 0.073;
  dfsolve();
}

function diazepam() {
  currentDrug = 'diazepam';
  setDisplayUnit('µg/mL');
  setBolusUnit('mg/kg');
  setInfusionUnit('mg/kg/hr');
  Vd1num.value = 42/70*1000;
  Vd2num.value = 18/70*1000;
  Vd3num.value = 38.5/70*1000;
  Clnum.value = 39.3/70;
  Q2num.value = 300/70;
  Q3num.value = 76.7/70;
  ke0num.value = 0.2;
  dfsolve();
}

function fentanyl() {
  currentDrug = 'fentanyl';
  setDisplayUnit('ng/mL');
  setBolusUnit('µg/kg');
  setInfusionUnit('µg/kg/hr');
  Vd1num.value = 144 + 2.0/7;
  Vd2num.value = 378 + 4.0/7;
  Vd3num.value = 2942 + 5.0/7;
  Clnum.value = 10 + 4.0/70;
  Q2num.value = 34;
  Q3num.value = 21 + 2.0/7;
  ke0num.value = 0.114;
  dfsolve();
}

function hydromorphone() {
  currentDrug = 'hydromorphone';
  setDisplayUnit('ng/mL');
  setBolusUnit('mg/kg');
  setInfusionUnit('mg/kg/hr');
  Vd1num.value = 20/70*1000;
  Vd2num.value = 90/70*1000;
  Vd3num.value = 70/70*1000;
  Clnum.value = 0.75/70*1000;
  Q2num.value = 1.5/70*1000;
  Q3num.value = 0.4/70*1000;
  ke0num.value = 0.5;
  dfsolve();
}

function remifentanil() {
  currentDrug = 'remifentanil';
  setDisplayUnit('ng/mL');
  setBolusUnit('µg/kg');
  setInfusionUnit('µg/kg/min');
  Vd1num.value = 5.8/70*1000;
  Vd2num.value = 8.82/70*1000;
  Vd3num.value = 5.03/70*1000;
  Clnum.value = 2.58/70*1000;
  Q2num.value = 1.72/70*1000;
  Q3num.value = 0.124/70*1000;
  ke0num.value = 1.09;
  dfsolve();
}

function sufentanil() {
  currentDrug = 'sufentanil';
  setDisplayUnit('ng/mL');
  setBolusUnit('µg/kg');
  setInfusionUnit('µg/kg/hr');
  Vd1num.value = 25/70*1000;
  Vd2num.value = 150/70*1000;
  Vd3num.value = 500/70*1000;
  Clnum.value = 1/70*1000;
  Q2num.value = 1.2/70*1000;
  Q3num.value = 0.3/70*1000;
  ke0num.value = 1.5;
  dfsolve();
}

function alfentanil() {
  currentDrug = 'alfentanil';
  setDisplayUnit('ng/mL');
  setBolusUnit('µg/kg');
  setInfusionUnit('µg/kg/min');
  Vd1num.value = 0.9*1000;
  Vd2num.value = 1.5*1000;
  Vd3num.value = 3*1000;
  Clnum.value = 6.4;
  Q2num.value = 1/70*1000;
  Q3num.value = 0.3/70*1000;
  ke0num.value = 2;
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
  dfsolve();
}

function pancuronium() {
  currentDrug = 'pancuronium';
  setDisplayUnit('µg/mL');
  setBolusUnit('mg/kg');
  setInfusionUnit('mg/kg/hr');
  Vd1num.value = 100;
  Vd2num.value = 120;
  Vd3num.value = 30;
  Clnum.value = 1.5;
  Q2num.value = 8;
  Q3num.value = 2;
  ke0num.value = 0.05;
  dfsolve();
}

function succinylcholine() {
  currentDrug = 'succinylcholine';
  setDisplayUnit('µg/mL');
  setBolusUnit('mg/kg');
  setInfusionUnit('mg/kg/min');
  Vd1num.value = 10;
  Vd2num.value = 20;
  Vd3num.value = 50;
  Clnum.value = 300;
  Q2num.value = 50;
  Q3num.value = 5;
  ke0num.value = 0.197;
  dfsolve();
}

function lidocaine() {
  currentDrug = 'lidocaine';
  setDisplayUnit('µg/mL');
  setBolusUnit('mg/kg');
  setInfusionUnit('µg/kg/min');
  Vd1num.value = 171 + 3.0/7;
  Vd2num.value = 571 + 3.0/7;
  Vd3num.value = 1428 + 4.0/7;
  Clnum.value = 15 + 5.0/7;
  Q2num.value = 21 + 3.0/7;
  Q3num.value = 14 + 2.0/7;
  ke0num.value = null;
  dfsolve();
}

function bupivacaine() {
  currentDrug = 'bupivacaine';
  setDisplayUnit('µg/mL');
  setBolusUnit('mg/kg');
  setInfusionUnit('µg/kg/min');
  Vd1num.value = 142 + 6.0/7;
  Vd2num.value = 714 + 2.0/7;
  Vd3num.value = 2857 + 1.0/7;
  Clnum.value = 3 + 4.0/7;
  Q2num.value = 11 + 3.0/7;
  Q3num.value = 7 + 1.0/7;
  ke0num.value = null;
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
  dfsolve();
}

// ============================
// Top-bar drug search: datalist + apply button
// ============================
const DRUGS = [
  { id: 'propofol', label: 'Propofol' },
  { id: 'etomidate', label: 'Etomidate' },
  { id: 'ketamine', label: 'Ketamine' },
  { id: 'dexmedetomidine', label: 'Dexmedetomidine' },
  { id: 'midazolam', label: 'Midazolam' },
  { id: 'diazepam', label: 'Diazepam' },
  { id: 'fentanyl', label: 'Fentanyl' },
  { id: 'hydromorphone', label: 'Hydromorphone' },
  { id: 'remifentanil', label: 'Remifentanil' },
  { id: 'sufentanil', label: 'Sufentanil' },
  { id: 'alfentanil', label: 'Alfentanil' },
  { id: 'methadone', label: 'Methadone' },
  { id: 'rocuronium', label: 'Rocuronium' },
  { id: 'vecuronium', label: 'Vecuronium' },
  { id: 'cisatracurium', label: 'Cisatracurium' },
  { id: 'pancuronium', label: 'Pancuronium' },
  { id: 'succinylcholine', label: 'Succinylcholine' },
  { id: 'lidocaine', label: 'Lidocaine' },
  { id: 'bupivacaine', label: 'Bupivacaine' },
  { id: 'phenylephrine', label: 'Phenylephrine' },
  { id: 'ephedrine', label: 'Ephedrine' },
  { id: 'epinephrine', label: 'Epinephrine' },
  { id: 'dobutamine', label: 'Dobutamine' },
  { id: 'dopamine', label: 'Dopamine' },
  { id: 'milrinone', label: 'Milrinone' },
  { id: 'vasopressin', label: 'Vasopressin' }
];

function populateDrugDatalist() {
  const dl = document.getElementById('drugDatalist');
  if (!dl) return;
  dl.innerHTML = '';
  DRUGS.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.label;
    opt.dataset.drugId = d.id;
    dl.appendChild(opt);
  });
}

function resolveDrugIdFromInput(text) {
  if (!text) return null;
  const t = text.trim().toLowerCase();
  // Exact label match
  const exact = DRUGS.find(d => d.label.toLowerCase() === t);
  if (exact) return exact.id;
  // ID match
  const idMatch = DRUGS.find(d => d.id.toLowerCase() === t);
  if (idMatch) return idMatch.id;
  // Starts-with match
  const sw = DRUGS.find(d => d.label.toLowerCase().startsWith(t));
  if (sw) return sw.id;
  return null;
}

function setCurrentDrugLabel() {
  const label = document.getElementById('currentDrugLabel');
  if (!label) return;
  const d = DRUGS.find(x => x.id === currentDrug);
  if (!d) { label.textContent = 'No drug selected'; return; }
  label.textContent = `${d.label} — units: ${currentUnit.name}`;
}

function applyDrugFromTopBar() {
  const inp = document.getElementById('drugSearch');
  const text = inp?.value || '';
  const id = resolveDrugIdFromInput(text);
  if (!id) return;
  const fn = window[id];
  if (typeof fn === 'function') {
    fn();
    setCurrentDrugLabel();
  }
}

// ============================
// Reset + init
// ============================
function reset() {
  propofol();
  bnum.value = 1;
  tbolusnum.value = 1;
  tinfusionnum.value = 60;
  infusionnum.value = 100;
  tfinalnum.value = 255;

  try {
    setScheduleToDOM({
      enabled: true,
      boluses: [{ time: 0, dose: parseFloatSafe(bnum.value,0), duration: parseFloatSafe(tbolusnum.value,0) }],
      infusions: [{ start: parseFloatSafe(tbolusnum.value,0), end: parseFloatSafe(tbolusnum.value,0) + parseFloatSafe(tinfusionnum.value,0), rate: parseFloatSafe(infusionnum.value,0) }]
    });
  } catch (e) {}

  const useCb = document.getElementById('useSchedule');
  if (useCb) useCb.checked = true;
  disableLegacyBolusInfusionInputs(true);
  updateScheduleUnitLabels();
  setCurrentDrugLabel();
  dfsolve();
}

function wireInputs() {
  [Vd1num, Vd2num, Vd3num, Clnum, Q2num, Q3num, bnum, tbolusnum, tinfusionnum, infusionnum, initialpnum, tfinalnum, ke0num]
    .forEach(el => el?.addEventListener('change', () => dfsolve()));

  document.getElementById('scaleToggleBtnTop')?.addEventListener('click', () => toggleScale());
  document.getElementById('darkModeBtnTop')?.addEventListener('click', () => toggleDarkMode());

  document.getElementById('drugApplyBtn')?.addEventListener('click', () => applyDrugFromTopBar());
  document.getElementById('drugSearch')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); applyDrugFromTopBar(); }
  });

  document.getElementById('resetBtn')?.addEventListener('click', () => reset());
  document.getElementById('oneCompBtn')?.addEventListener('click', () => onecompartment());
}

(function init() {
  applyPlotTheme();
  initDrawer();
  populateDrugDatalist();
  ensureTherapeuticToggle();
  ensureScheduleUI();
  ensureCompareUI();
  wireInputs();
  reset();

  window.addEventListener('resize', () => {
    ['myDiv1','myDiv2','myDiv3'].forEach(id => {
      const el = document.getElementById(id);
      if (el && window.Plotly) Plotly.Plots.resize(el);
    });
  });
})();
