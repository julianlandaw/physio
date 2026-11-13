/*
   Copyright (c) 2026 Julian W. Landaw
   SPDX-License-Identifier: MIT
*/

/* Application coordination and form bindings. Numerical, presentation, and
   editor code lives in the accompanying threecompartmentmodel_* modules. */

// ============================
// Small helpers
// ============================
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// Mirror raw entries, including blanks, so validation never turns an incomplete dose into zero.
const MAIN_INPUT_LINKS = {
  mainWeight: 'weight',
  mainFinalTime: 'tfinal',
  mainBolusAmount: 'b',
  mainLoadingDuration: 'tbolus',
  mainInfusionRate: 'infusion',
  mainInfusionDuration: 'tinfusion',
  mainTciTarget: 'tciTarget',
  mainTciMaxRate: 'tciMaxRate',
  mainTciStopTime: 'tciStopTime',
};

const MAX_VISIBLE_SCHEDULE_SEGMENTS = 80;
let tciImportSession = null;
let latestPdfContext = null;
let chartRevision = 0;
let schedulePage = 0;
const SCHEDULE_PAGE_SIZE = 50;

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
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
    ['appHeader', 'appContent'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.toggleAttribute('inert', isInert);
      el.setAttribute('aria-hidden', String(isInert));
    });
  }

  function openDrawer() {
    previousFocus = document.activeElement;
    drawer?.removeAttribute('inert');
    document.body.classList.add('drawer-open');
    setBackgroundInert(true);
    btn?.setAttribute('aria-expanded', 'true');
    drawer?.setAttribute('aria-hidden', 'false');
    backdrop?.setAttribute('aria-hidden', 'false');
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
    drawer?.setAttribute('inert', '');
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
    const focusable = $$(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      drawer,
    ).filter((el) => el.offsetParent !== null);
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
  $$('.card-header[data-collapse="true"]').forEach((h) => {
    h.addEventListener('click', () => {
      const body = h.nextElementSibling;
      const icon = h.querySelector('.toggle-icon');
      if (!body) return;
      const isHidden = body.style.display === 'none';
      body.style.display = isHidden ? 'block' : 'none';
      if (icon) icon.textContent = isHidden ? '▼' : '▲';
      h.setAttribute('aria-expanded', String(isHidden));
    });
  });

  // Keep every parameter section collapsed until the user chooses to open it.
  const collapseById = (id, collapsed = true) => {
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
// DOM labels and inputs
// ============================
const Vd1html = document.getElementById('Vd1html');
Vd1html.innerHTML = '<i>V</i><sub>1</sub> (mL/kg)';
const Vd1num = document.getElementById('Vd1');
const Vd2html = document.getElementById('Vd2html');
Vd2html.innerHTML = '<i>V</i><sub>2</sub> (mL/kg)';
const Vd2num = document.getElementById('Vd2');
const Vd3html = document.getElementById('Vd3html');
Vd3html.innerHTML = '<i>V</i><sub>3</sub> (mL/kg)';
const Vd3num = document.getElementById('Vd3');
const Clhtml = document.getElementById('Clhtml');
Clhtml.innerHTML = '<i>C</i><sub><i>l</i></sub> (mL/kg/min)';
const Clnum = document.getElementById('Cl');
const Q2html = document.getElementById('Q2html');
Q2html.innerHTML = '<i>Q</i><sub>2</sub> (mL/kg/min)';
const Q2num = document.getElementById('Q2');
const Q3html = document.getElementById('Q3html');
Q3html.innerHTML = '<i>Q</i><sub>3</sub> (mL/kg/min)';
const Q3num = document.getElementById('Q3');

const pkInputModeSelect = document.getElementById('pkInputMode');

const k10inputhtml = document.getElementById('k10inputhtml');
if (k10inputhtml) k10inputhtml.innerHTML = 'k<sub>10</sub> (min<sup>-1</sup>)';
const k10inputnum = document.getElementById('k10input');
const k12inputhtml = document.getElementById('k12inputhtml');
if (k12inputhtml) k12inputhtml.innerHTML = 'k<sub>12</sub> (min<sup>-1</sup>)';
const k12inputnum = document.getElementById('k12input');
const k21inputhtml = document.getElementById('k21inputhtml');
if (k21inputhtml) k21inputhtml.innerHTML = 'k<sub>21</sub> (min<sup>-1</sup>)';
const k21inputnum = document.getElementById('k21input');
const k13inputhtml = document.getElementById('k13inputhtml');
if (k13inputhtml) k13inputhtml.innerHTML = 'k<sub>13</sub> (min<sup>-1</sup>)';
const k13inputnum = document.getElementById('k13input');
const k31inputhtml = document.getElementById('k31inputhtml');
if (k31inputhtml) k31inputhtml.innerHTML = 'k<sub>31</sub> (min<sup>-1</sup>)';
const k31inputnum = document.getElementById('k31input');
const bhtml = document.getElementById('bhtml');
bhtml.innerHTML = 'Bolus (mg/kg)';
const bnum = document.getElementById('b');
const infusionhtml = document.getElementById('infusionhtml');
infusionhtml.innerHTML = 'Infusion (mg/kg/min)';
const infusionnum = document.getElementById('infusion');
const tbolushtml = document.getElementById('tbolushtml');
tbolushtml.innerHTML = 'Loading-dose duration (min)';
const tbolusnum = document.getElementById('tbolus');
const tinfusionhtml = document.getElementById('tinfusionhtml');
tinfusionhtml.innerHTML = 'Infusion duration (min)';
const tinfusionnum = document.getElementById('tinfusion');
const weighthtml = document.getElementById('weighthtml');
if (weighthtml) weighthtml.innerHTML = 'Patient weight (kg)';
const weightnum = document.getElementById('weight');
const bolusUnitSelect = document.getElementById('bolusUnitSelect');
const infusionUnitSelect = document.getElementById('infusionUnitSelect');
const initialphtml = document.getElementById('initialphtml');
initialphtml.innerHTML = '[<i>P</i>]<sub>init</sub> (mg/mL)';
const initialpnum = document.getElementById('initialp');
const tfinalhtml = document.getElementById('tfinalhtml');
tfinalhtml.innerHTML = '<i>t</i><sub>final</sub> (min)';
const tfinalnum = document.getElementById('tfinal');
const ke0html = document.getElementById('ke0html');
ke0html.innerHTML = 'k<sub>e0</sub> (min<sup>-1</sup>)';
const ke0num = document.getElementById('ke0');

const pfinalhtml = document.getElementById('pfinalhtml');
pfinalhtml.innerHTML = 0;
const psshtml = document.getElementById('psshtml');
psshtml.innerHTML = 0;
const concentrationunitshtml1 = document.getElementById('concentrationunitshtml1');
concentrationunitshtml1.innerHTML = 'mg/mL';
const concentrationunitshtml2 = document.getElementById('concentrationunitshtml2');
concentrationunitshtml2.innerHTML = 'mg/mL';
const alphahtml = document.getElementById('alphahtml');
alphahtml.innerHTML = 0;
const betahtml = document.getElementById('betahtml');
betahtml.innerHTML = 0;
const gammahtml = document.getElementById('gammahtml');
gammahtml.innerHTML = 0;
const termhalflifehtml = document.getElementById('termhalflifehtml');
termhalflifehtml.innerHTML = 0;
const k10html = document.getElementById('k10html');
k10html.innerHTML = 0;
const k12html = document.getElementById('k12html');
k12html.innerHTML = 0;
const k13html = document.getElementById('k13html');
k13html.innerHTML = 0;
const k21html = document.getElementById('k21html');
k21html.innerHTML = 0;
const k31html = document.getElementById('k31html');
k31html.innerHTML = 0;
const Vd1numhtml = document.getElementById('Vd1numhtml');
Vd1numhtml.innerHTML = 0;
const Vd2numhtml = document.getElementById('Vd2numhtml');
Vd2numhtml.innerHTML = 0;
const Vd3numhtml = document.getElementById('Vd3numhtml');
Vd3numhtml.innerHTML = 0;
const Q2numhtml = document.getElementById('Q2numhtml');
Q2numhtml.innerHTML = 0;
const Q3numhtml = document.getElementById('Q3numhtml');
Q3numhtml.innerHTML = 0;
const Clnumhtml = document.getElementById('Clnumhtml');
Clnumhtml.innerHTML = 0;
const contextsensitivehalflifehtml = document.getElementById('contextsensitivehalflifehtml');
contextsensitivehalflifehtml.innerHTML = 0;

// ============================
// Units (display only; internal math stays mg/mL)
// ============================

let currentUnit = UNITS['mg/mL'];

function setDisplayUnit(unitName, preserveValue = true) {
  const nextUnit = UNITS[unitName] || UNITS['mg/mL'];
  if (preserveValue && currentUnit.factor !== nextUnit.factor) {
    $$('#tciTargetChanges [data-field="target"]').forEach((input) => {
      const value = parseFloat(input.value);
      if (Number.isFinite(value))
        input.value = formatInputValue((value / currentUnit.factor) * nextUnit.factor);
    });
    [
      initialpnum,
      document.getElementById('tciTarget'),
      document.getElementById('testRegimenTarget'),
    ].forEach((input) => {
      const value = parseFloat(input?.value);
      if (input && Number.isFinite(value))
        input.value = formatInputValue((value / currentUnit.factor) * nextUnit.factor);
    });
  }
  currentUnit = nextUnit;
  initialphtml.innerHTML = `[<i>P</i>]<sub>init</sub> (${currentUnit.name})`;
  concentrationunitshtml1.innerHTML = currentUnit.name;
  concentrationunitshtml2.innerHTML = currentUnit.name;
  updateTciControls?.();
}

let currentBolusUnit = BOLUSUNITS['mg/kg'];

let currentInfusionUnit = INFUSIONUNITS['mg/kg/min'];

const BOLUS_UNIT_ORDER = ['mg/kg', 'µg/kg', 'ng/kg', 'mg', 'µg', 'ng'];
const INFUSION_UNIT_ORDER = [
  'mg/kg/min',
  'µg/kg/min',
  'ng/kg/min',
  'mg/kg/hr',
  'µg/kg/hr',
  'ng/kg/hr',
  'mg/min',
  'µg/min',
  'ng/min',
  'mg/hr',
  'µg/hr',
  'ng/hr',
];

function getWeightKg() {
  const w = parseFloatSafe(weightnum?.value, 70);
  return Number.isFinite(w) && w > 0 ? w : 70;
}

function populateUnitSelect(selectEl, unitsMap, order) {
  if (!selectEl) return;
  selectEl.innerHTML = '';
  order.forEach((unitName) => {
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

function setBolusUnit(unitName, preserveValues = true) {
  const previousUnit = currentBolusUnit;
  const nextUnit = BOLUSUNITS[unitName] || BOLUSUNITS['mg/kg'];
  if (preserveValues && previousUnit.name !== nextUnit.name) {
    const weightKg = getWeightKg();
    const convert = (value) =>
      convertMgKgToBolusValue(
        convertBolusValueToMgKg(value, previousUnit, weightKg),
        nextUnit,
        weightKg,
      );
    if (bnum && Number.isFinite(parseFloat(bnum.value)))
      bnum.value = formatInputValue(convert(parseFloat(bnum.value)));
    rescaleScheduleState('bolus', 'dose', convert);
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
    const convert = (value) =>
      convertMgKgMinToInfusionValue(
        convertInfusionValueToMgKgMin(value, previousUnit, weightKg),
        nextUnit,
        weightKg,
      );
    if (infusionnum && Number.isFinite(parseFloat(infusionnum.value)))
      infusionnum.value = formatInputValue(convert(parseFloat(infusionnum.value)));
    const tciMaxRate = document.getElementById('tciMaxRate');
    if (tciMaxRate && Number.isFinite(parseFloat(tciMaxRate.value)))
      tciMaxRate.value = formatInputValue(convert(parseFloat(tciMaxRate.value)));
    rescaleScheduleState('infusion', 'rate', convert);
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
  ['tciMaxRateUnit', 'mainTciMaxRateUnit', 'tciRateUnit'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = iUnit;
  });
}

function getTciConfig() {
  const enabled = Boolean(document.getElementById('tciEnabled')?.checked);
  const targetType = document.getElementById('tciTargetType')?.value === 'ce' ? 'ce' : 'cp';
  const target = parseFloatSafe(document.getElementById('tciTarget')?.value, 0);
  const maxRate = convertInfusionValueToMgKgMin(
    document.getElementById('tciMaxRate')?.value,
    currentInfusionUnit,
    getWeightKg(),
  );
  const stopTime = Math.max(0, parseFloatSafe(document.getElementById('tciStopTime')?.value, 0));
  return {
    enabled,
    targetType,
    target,
    targetBase: target / currentUnit.factor,
    targetChanges: getTciTargetChanges().map((change) => ({
      time: change.time,
      targetBase: change.target / currentUnit.factor,
    })),
    maxRate,
    stopTime,
  };
}

function updateTciControls() {
  const config = getTciConfig();
  const targetUnit = currentUnit?.name || 'mg/mL';
  ['tciTargetUnit', 'mainTciTargetUnit'].forEach((id) => {
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
  document.getElementById('tciChangeUnit').textContent = targetUnit;
  updateDosingWorkspace();
}

function updateDosingWorkspace() {
  const tci = Boolean(document.getElementById('tciEnabled')?.checked);
  const schedule = !tci && Boolean(document.getElementById('useSchedule')?.checked);
  const mode = tci ? 'tci' : schedule ? 'schedule' : 'basic';
  document.getElementById('tciTargetScheduleEditor').hidden = !tci;
  $$('input[name="dosingMode"]').forEach((input) => {
    input.checked = input.value === mode;
  });
  document.getElementById('mainManualControls').hidden = tci;
  document.getElementById('mainBolusAmount').disabled =
    tci || (schedule && !getQuickScheduleEntry('bolus'));
  document.getElementById('mainInfusionRate').disabled =
    tci || (schedule && !getQuickScheduleEntry('infusion'));
  document.getElementById('mainScheduleControls').hidden = !schedule;
  $$('.basic-only').forEach((el) => {
    el.hidden = mode !== 'basic';
  });
  document.getElementById('quickDoseEditorHeading').textContent = tci
    ? 'TCI settings'
    : schedule
      ? 'Scheduled dosing'
      : 'Basic dosing';
  Object.entries(MAIN_INPUT_LINKS).forEach(([mainId, sourceId]) => {
    if (schedule && ['mainBolusAmount', 'mainInfusionRate'].includes(mainId)) {
      const bolus = mainId === 'mainBolusAmount';
      const entry = getQuickScheduleEntry(bolus ? 'bolus' : 'infusion');
      document.getElementById(mainId).value = entry?.[bolus ? 'dose' : 'rate'] ?? '';
      return;
    }
    document.getElementById(mainId).value = document.getElementById(sourceId).value;
  });
}

function setDosingMode(mode) {
  document.getElementById('tciEnabled').checked = mode === 'tci';
  document.getElementById('useSchedule').checked = mode === 'schedule';
  disableLegacyBolusInfusionInputs(mode !== 'basic');
  dfsolve();
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
  const target = readNumericInput(targetInput?.value);
  const duration = readNumericInput(durationInput?.value);
  [targetInput, durationInput].forEach(clearInvalidInput);
  if (numericInputError(targetInput?.value, 'Plasma target', { strictlyPositive: true })) {
    markInvalidInput(targetInput);
    setSimulationStatus(
      'Enter a predicted plasma target greater than 0 to generate a test regimen.',
      'error',
    );
    return;
  }
  if (numericInputError(durationInput?.value, 'Loading-dose duration')) {
    markInvalidInput(durationInput);
    setSimulationStatus('Loading-dose duration must be zero or greater.', 'error');
    return;
  }

  if (getPkInputMode() === 'microconstants') syncClearanceInputsFromMicroInputs();
  const pk = getPkParametersFromInputs();
  const targetBase = target / currentUnit.factor;
  const loadingDoseMgKg = pk.V1 * targetBase;
  const maintenanceRateMgKgMin = pk.Cl * targetBase;
  const finalTime = Math.max(0, parseFloatSafe(tfinalnum?.value, 0));

  bnum.value = formatInputValue(
    convertMgKgToBolusValue(loadingDoseMgKg, currentBolusUnit, getWeightKg()),
  );
  tbolusnum.value = formatInputValue(duration);
  infusionnum.value = formatInputValue(
    convertMgKgMinToInfusionValue(maintenanceRateMgKgMin, currentInfusionUnit, getWeightKg()),
  );
  tinfusionnum.value = formatInputValue(Math.max(0, finalTime - duration));
  const useSchedule = document.getElementById('useSchedule');
  if (useSchedule) useSchedule.checked = false;
  const tciEnabled = document.getElementById('tciEnabled');
  if (tciEnabled) tciEnabled.checked = false;
  selectedTimelineEvent = null;
  disableLegacyBolusInfusionInputs(false);
  dfsolve();
  setSimulationStatus(
    `Model-derived test regimen generated: loading ${formatInputValue(loadingDoseMgKg)} mg/kg and maintenance ${formatInputValue(maintenanceRateMgKgMin)} mg/kg/min before unit conversion.`,
    'ok',
  );
}

function disableLegacyBolusInfusionInputs(disabled) {
  ['b', 'tbolus', 'infusion', 'tinfusion'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = !!disabled;
  });
}

// ============================
// Schedule editor
// ============================

function initScheduleWorkspace() {
  const dialog = document.getElementById('scheduleEditor');
  const card = document.getElementById('scheduleCard');
  const anchor = document.createComment('schedule drawer position');
  card.before(anchor);
  let returnFocus = null;
  const open = () => {
    if (dialog.open) return;
    returnFocus = document.activeElement;
    if (document.body.classList.contains('drawer-open'))
      document.getElementById('drawerCloseBtn').click();
    document.getElementById('scheduleEditorBody').appendChild(card);
    expandDrawerCard('scheduleCard');
    dialog.showModal();
    document.body.classList.add('schedule-editor-open');
    updateSchedulePage();
  };
  openScheduleEditor = open;
  document.getElementById('mainEditScheduleBtn').addEventListener('click', open);
  $$('[data-open-schedule]').forEach((button) => button.addEventListener('click', open));
  const restoreDrawer = () => {
    if (!dialog.contains(card)) return;
    anchor.after(card);
    document.body.classList.remove('schedule-editor-open');
    updateSchedulePage();
    const target = returnFocus?.closest('#paramsDrawer')
      ? document.getElementById('paramsBtn')
      : returnFocus;
    target?.focus();
  };
  const close = () => {
    dialog.close();
    restoreDrawer();
  };
  document.getElementById('closeScheduleEditorBtn').addEventListener('click', close);
  dialog.addEventListener('close', restoreDrawer);
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  ['schedulePreviousBtn', 'scheduleNextBtn'].forEach((id, index) => {
    document.getElementById(id).addEventListener('click', () => {
      schedulePage += index ? 1 : -1;
      updateSchedulePage();
      document.getElementById('scheduleEditorBody').scrollTop = 0;
    });
  });
  $$('[data-schedule-page]').forEach((button) =>
    button.addEventListener('click', () => {
      schedulePage += Number(button.dataset.schedulePage);
      updateSchedulePage();
    }),
  );
  document.getElementById('scheduleJumpBtn').addEventListener('click', () => {
    const input = document.getElementById('scheduleJumpTime');
    const raw = input.value.trim();
    const time = Number(raw);
    input.setCustomValidity(
      !raw || !Number.isFinite(time) || time < 0 ? 'Enter a time of at least 0 minutes.' : '',
    );
    if (!input.reportValidity()) return;
    flushVisibleScheduleInputs();
    const intervals = scheduleState.infusions
      .map((event, index) => ({ ...event, index }))
      .sort((a, b) => a.start - b.start);
    const found = intervals.find((item) => item.end > time) || intervals.at(-1);
    if (!found) return;
    schedulePage = Math.floor(found.index / SCHEDULE_PAGE_SIZE);
    updateSchedulePage();
    const row = document.querySelector(`#infusionEventsTable [data-event-id="${found.id}"]`);
    row.querySelector('input').focus();
    row.scrollIntoView({ block: 'center' });
  });
  document
    .getElementById('scheduleJumpTime')
    .addEventListener('input', (event) => event.target.setCustomValidity(''));
  document.getElementById('scheduleJumpTime').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      document.getElementById('scheduleJumpBtn').click();
    }
  });
  document.getElementById('scheduleCsvBtn').addEventListener('click', () => {
    if (!document.getElementById('useSchedule').checked || !validateSimulationInputs()) {
      document.getElementById('scheduleEditorErrors').hidden = false;
      document.getElementById('scheduleEditorErrors').textContent =
        'Enable the schedule and correct any incomplete entries before exporting.';
      return;
    }
    downloadText('physio-schedule.csv', scheduleCsv(getScheduleFromDOM()), 'text/csv');
  });
}

function scheduleCsv(schedule) {
  const rows = [
    ['type', 'start_min', 'end_min', 'dose', 'duration_min', 'rate', 'unit', 'weight_kg'],
  ];
  schedule.boluses.forEach((b) =>
    rows.push([
      'bolus',
      b.time,
      b.time + b.duration,
      b.dose,
      b.duration,
      '',
      currentBolusUnit.name,
      getWeightKg(),
    ]),
  );
  schedule.infusions.forEach((i) =>
    rows.push([
      'infusion',
      i.start,
      i.end,
      '',
      '',
      i.rate,
      currentInfusionUnit.name,
      getWeightKg(),
    ]),
  );
  return rows.map((row) => row.join(',')).join('\r\n');
}

function importCurrentTciAsSchedule() {
  if (!document.getElementById('tciEnabled')?.checked) {
    setSimulationStatus(
      'Enable TCI and enter a target and maximum rate before importing its infusion schedule.',
      'error',
    );
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
    state.patient.weightKg,
  );
  tciImportSession = { sourceState: state, sourceSimulation: simulation, exactSchedule: schedule };
  selectedTimelineEvent = null;
  document.getElementById('tciEnabled').checked = false;
  setScheduleToDOM(schedule);
  disableLegacyBolusInfusionInputs(true);
  expandDrawerCard('scheduleCard');
  dfsolve();
  setSimulationStatus(
    `TCI rates imported as ${schedule.infusions.length} editable infusion segments. TCI is off; the schedule no longer tracks the target.`,
    'ok',
  );
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
      setSimulationStatus(
        `At least ${countTciInfusionRuns(exact.infusions)} segments are needed to preserve zero-rate gaps.`,
        'error',
      );
      return;
    }
  }
  selectedTimelineEvent = null;
  setScheduleToDOM({ enabled: true, boluses: [], infusions });
  document.getElementById('tciEnabled').checked = false;
  disableLegacyBolusInfusionInputs(true);
  dfsolve();
  setSimulationStatus(
    `${simplified ? 'Simplified' : 'Exact'} original TCI schedule restored as ${infusions.length} editable segments. Current schedule edits were replaced.`,
    'ok',
  );
}

function updateRegimenOverview(params, schedule) {
  const drug = DRUGS.find((d) => d.id === currentDrug);
  const drugLabel = drug ? `${drug.label}${presetIsModified ? ' — modified' : ''}` : 'Custom model';
  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };
  setText('summaryDrug', drugLabel);
  setText('summaryWeight', `${formatInputValue(params.weightKg)} kg`);
  setText(
    'summaryModel',
    getPkInputMode() === 'microconstants' ? 'Microconstants' : 'Clearance & volumes',
  );
  const sourceText =
    currentProvenance().notes ||
    currentProvenance().reviewStatus ||
    'Custom parameters — review volumes, clearances, effect-site rate, units, and source assumptions before interpreting this simulation.';
  setText(
    'summarySource',
    presetIsModified
      ? `${sourceText} PK/effect-site parameters have been modified; preset therapeutic ranges are hidden.`
      : sourceText,
  );
  renderModelProvenance();

  let segments = [];
  let description = '';
  const tci = getTciConfig();
  const plotCaption = document.getElementById('primaryPlotCaption');
  if (plotCaption) {
    plotCaption.textContent =
      params.ke0 <= 0
        ? 'Cp = central plasma concentration. Effect-site concentration is unavailable because no effect-site model is defined.'
        : tci.enabled
          ? 'Cp = central plasma; Ce = effect site. The dashed green line is the educational TCI target; the rate chart shows calculated delivery.'
          : 'Cp = central plasma; Ce = effect site. Orange marks loading-dose delivery; blue marks infusion delivery.';
  }
  if (tci.enabled) {
    const compartment = tci.targetType === 'ce' ? 'effect-site (Ce)' : 'plasma (Cp)';
    const stopTime = Math.min(tci.stopTime, params.tfinal);
    const changes = tci.targetChanges.length;
    description = `Educational TCI · ${compartment} initial target ${formatInputValue(tci.target)} ${currentUnit.name}${changes ? ` · ${changes} target change${changes === 1 ? '' : 's'}` : ''} · stop ${formatInputValue(stopTime)} min · maximum ${formatInputValue(Number(document.getElementById('tciMaxRate')?.value))} ${currentInfusionUnit.name}`;
    segments = [{ start: 0, end: stopTime, type: 'infusion', index: -1, label: 'Educational TCI' }];
  } else if (schedule?.enabled) {
    const boluses = schedule.boluses || [];
    const infusions = schedule.infusions || [];
    description = `${boluses.length} bolus${boluses.length === 1 ? '' : 'es'} · ${infusions.length} infusion segment${infusions.length === 1 ? '' : 's'}`;
    const displayedInfusions =
      infusions.length > MAX_VISIBLE_SCHEDULE_SEGMENTS
        ? [{ start: infusions[0].start, end: infusions[infusions.length - 1].end, summary: true }]
        : infusions;
    segments = [
      ...boluses.map((event, index) => ({
        start: event.time,
        end: event.duration > 0 ? event.time + event.duration : event.time,
        type: 'bolus',
        index,
        label: `Bolus ${index + 1}`,
      })),
      ...displayedInfusions.map((event, index) => ({
        start: event.start,
        end: event.end,
        type: 'infusion',
        index: event.summary ? -1 : index,
        summary: Boolean(event.summary),
        label: event.summary ? `${infusions.length} infusion segments` : `Infusion ${index + 1}`,
      })),
    ];
  } else {
    description = `Bolus ${formatInputValue(parseFloatSafe(bnum.value, 0))} ${currentBolusUnit.name} over ${formatInputValue(params.tbolus)} min · infusion ${formatInputValue(parseFloatSafe(infusionnum.value, 0))} ${currentInfusionUnit.name} for ${formatInputValue(params.tinfusion)} min`;
    segments = [
      { start: 0, end: params.tbolus, type: 'bolus', index: 0, label: 'Bolus' },
      {
        start: params.tbolus,
        end: params.tbolus + params.tinfusion,
        type: 'infusion',
        index: 0,
        label: 'Infusion',
      },
    ];
  }
  setText('summaryDose', description);
  setText('doseTimelineText', `0–${formatInputValue(params.tfinal)} min`);

  const track = document.getElementById('doseTimelineTrack');
  if (!track) return;
  track.textContent = '';
  const validSegments = segments.filter(
    (segment) =>
      Number.isFinite(segment.start) &&
      Number.isFinite(segment.end) &&
      segment.start <= params.tfinal &&
      segment.end >= 0,
  );
  track.setAttribute(
    'aria-label',
    `${description}; simulation duration ${formatInputValue(params.tfinal)} minutes.`,
  );
  validSegments.forEach((segment) => {
    const start = clamp(segment.start, 0, params.tfinal);
    const end = clamp(segment.end, 0, params.tfinal);
    const marker = document.createElement('span');
    marker.className = `dose-timeline__segment dose-timeline__segment--${segment.type}${segment.summary ? ' dose-timeline__segment--summary' : ''}`;
    marker.dataset.eventType = segment.type;
    marker.dataset.eventIndex = String(segment.index);
    marker.style.left = `${(start / params.tfinal) * 100}%`;
    marker.style.width = `${Math.max(1.2, ((Math.max(end, start) - start) / params.tfinal) * 100)}%`;
    const eventDetails = segment.summary
      ? `${segment.label}; edit individual rates in Dosing Schedule`
      : tci.enabled
        ? description
        : getTimelineEventDetails(segment, schedule);
    marker.title =
      tci.enabled || segment.summary ? eventDetails : `${eventDetails}. Click to edit.`;
    if (!tci.enabled && !segment.summary) {
      marker.setAttribute('role', 'button');
      marker.setAttribute('tabindex', '0');
      marker.setAttribute('aria-label', `Edit ${eventDetails}`);
    }
    const label = document.createElement('span');
    label.className = 'dose-timeline__segment-label';
    label.textContent = segment.summary
      ? segment.label
      : tci.enabled
        ? `TCI 0–${formatInputValue(end)} min`
        : segment.type === 'bolus'
          ? `B ${formatInputValue(start)}m`
          : `Infusion ${formatInputValue(start)}–${formatInputValue(end)} min`;
    marker.appendChild(label);
    track.appendChild(marker);
  });

  track.dataset.tciMode = String(tci.enabled);
  renderTimelineEventEditor(tci.enabled ? { enabled: false } : schedule);
  updateMainDoseEditor(tci.enabled ? { enabled: true, boluses: [], infusions: [] } : schedule);
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
    if (hint) hint.textContent = 'Enter a target and maximum rate in the displayed units.';
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
    if (infusionLabel)
      infusionLabel.textContent = firstInfusion ? 'Earliest infusion' : 'No scheduled infusion';
    if (hint)
      hint.textContent =
        'Schedule active: these controls update the earliest events. Use the timeline or schedule table to edit other events.';
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

function initDistributionDetails() {
  const details = document.getElementById('distributionDetails');
  if (!details) return;
  details.addEventListener('toggle', () => {
    if (!details.open) return;
    setTimeout(
      () =>
        ['myDiv2', 'myDiv3'].forEach((id) => {
          const el = document.getElementById(id);
          if (el && window.Plotly) Plotly.Plots.resize(el);
        }),
      0,
    );
  });
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
  addB.addEventListener('click', () => {
    addBolusRow();
    dfsolve();
  });
  addI.addEventListener('click', () => {
    addInfusionRow();
    dfsolve();
  });
  clrB.addEventListener('click', () => {
    clearTable(bolusTbl);
    addBolusRow({ time: 0, dose: 0, duration: 0 });
    dfsolve();
  });
  clrI.addEventListener('click', () => {
    clearTable(infTbl);
    addInfusionRow({ start: 0, end: 0, rate: 0 });
    dfsolve();
  });
  convertBasicBtn?.addEventListener('click', () => {
    if (!validateSimulationInputs()) return;
    document.getElementById('tciEnabled').checked = false;
    const duration = Math.max(0, parseFloatSafe(tbolusnum.value, 0));
    setScheduleToDOM({
      enabled: true,
      boluses: [{ time: 0, dose: parseFloatSafe(bnum.value, 0), duration }],
      infusions: [
        {
          start: duration,
          end: duration + Math.max(0, parseFloatSafe(tinfusionnum.value, 0)),
          rate: parseFloatSafe(infusionnum.value, 0),
        },
      ],
    });
    disableLegacyBolusInfusionInputs(true);
    dfsolve();
  });
  $$('[data-import-tci-schedule]').forEach((button) =>
    button.addEventListener('click', importCurrentTciAsSchedule),
  );
  document
    .getElementById('simplifyTciScheduleBtn')
    ?.addEventListener('click', () => replaceWithTciOriginal(true));
  document
    .getElementById('restoreExactTciScheduleBtn')
    ?.addEventListener('click', () => replaceWithTciOriginal(false));
  document.getElementById('undoTciImportBtn')?.addEventListener('click', undoTciImport);
  document.getElementById('showTciReference')?.addEventListener('change', dfsolve);

  const scheduleInput = () => {
    flushVisibleScheduleInputs();
    if (!useCb.checked) return;
    clearTimeout(scheduleEditTimer);
    scheduleEditTimer = setTimeout(() => {
      scheduleEditTimer = null;
      dfsolve();
    }, 250);
  };
  const scheduleChange = () => {
    if (!useCb.checked) {
      recordRegimenHistory();
      return;
    }
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
      removeScheduleEntry('bolus', btn.closest('tr').dataset.eventId);
      if (useCb.checked) dfsolve();
      else recordRegimenHistory();
    }
  });

  infTbl.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button');
    if (!btn) return;
    if (btn.dataset.action === 'remove') {
      removeScheduleEntry('infusion', btn.closest('tr').dataset.eventId);
      if (useCb.checked) dfsolve();
      else recordRegimenHistory();
    }
  });
}

// ============================
// Therapeutic ranges
// ============================
let currentDrug = null;
let presetIsModified = false;
let showTherapeutic = true;

function markPresetModified() {
  if (!currentDrug || presetIsModified) return;
  presetIsModified = true;
  setCurrentDrugLabel();
}

const EFFECT_SITE_RANGES = Object.fromEntries(
  PHYSIO_DRUG_REGISTRY.drugs.map((d) => [d.id, d.ranges]),
);

function ensureTherapeuticToggle() {
  if (document.getElementById('toggleTherapeutic')) return;
  try {
    const container = document.createElement('div');
    container.id = 'therapeuticToggleContainer';
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

    document.getElementById('chartToolbar').appendChild(container);

    cb.addEventListener('change', function () {
      showTherapeutic = this.checked;
      refreshReferenceOverlays();
    });
  } catch (e) {
    console.warn('Could not add therapeutic toggle checkbox:', e);
  }
}

// ============================
// Strategy comparison
// ============================
let strategies = [];
let compareMode = false;
let activeStrategyId = null;

function uuidLike() {
  try {
    return crypto && crypto.randomUUID
      ? crypto.randomUUID()
      : 'id-' + Math.random().toString(16).slice(2) + Date.now().toString(16);
  } catch (e) {
    return 'id-' + Math.random().toString(16).slice(2) + Date.now().toString(16);
  }
}

function plural(n, one, many) {
  return n === 1 ? one : many;
}

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
    provenance: currentProvenance(),
    patient: {
      weightKg: getWeightKg(),
    },
    units: {
      conc: currentUnit?.name || 'mg/mL',
      bolus: currentBolusUnit?.name || 'mg/kg',
      infusion: currentInfusionUnit?.name || 'mg/kg/min',
    },
    inputs: {
      b: parseFloatSafe(bnum.value),
      tbolus: parseFloatSafe(tbolusnum.value),
      infusion: parseFloatSafe(infusionnum.value),
      tinfusion: parseFloatSafe(tinfusionnum.value),
      tfinal: parseFloatSafe(tfinalnum.value),
      initialp: parseFloatSafe(initialpnum.value),
    },
    schedule: getScheduleFromDOM(),
    tci: {
      enabled: Boolean(document.getElementById('tciEnabled')?.checked),
      targetType: document.getElementById('tciTargetType')?.value === 'ce' ? 'ce' : 'cp',
      target: parseFloatSafe(document.getElementById('tciTarget')?.value, 0),
      maxRate: parseFloatSafe(document.getElementById('tciMaxRate')?.value, 0),
      stopTime: parseFloatSafe(document.getElementById('tciStopTime')?.value, 0),
      changes: getTciTargetChanges(),
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
      ke0: Number.isFinite(parseFloat(ke0num.value)) ? parseFloat(ke0num.value) : 0,
    },
  };
}

function renderStrategyList() {
  const list = document.getElementById('strategyList');
  if (!list) return;
  if (!strategies.length) {
    list.innerHTML = '<div class="list-group-item text-muted">No saved strategies yet.</div>';
    return;
  }

  const rows = strategies
    .map((s) => {
      const activeClass = s.id === activeStrategyId ? 'border-primary' : '';
      const c = scheduleCounts(s.schedule);
      const subtitle = `${c.boluses} ${plural(c.boluses, 'bolus', 'boluses')}; ${c.infusions} ${plural(c.infusions, 'infusion', 'infusions')}; tfinal ${s.inputs.tfinal} min`;
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
    })
    .join('');

  list.innerHTML = rows;
}

function captureCurrentStrategy() {
  if (!validateSimulationInputs()) return;
  const live = getCurrentState();
  const n = strategies.length + 1;
  const s = { ...live, id: uuidLike(), name: `${currentDrug ?? 'Drug'} strategy ${n}` };
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
  const s = strategies.find((x) => x.id === id);
  if (!s) return;
  chartRevision++;
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
    const preset = DRUGS.find((drug) => drug.id === s.drug);
    if (preset) withoutIntermediateSolve(preset.apply);
  } catch (e) {
    console.warn('Could not switch drug preset:', e);
  }

  currentDrug = s.drug || null;
  presetIsModified = Boolean(s.presetModified);
  modelProvenance = s.provenance
    ? validateModelProvenance(s.provenance)
    : unknownModelProvenance(s.drug, 'legacy');
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

  if (pkInputModeSelect) pkInputModeSelect.value = s.pk.inputMode || 'clearance';
  if (k10inputnum) k10inputnum.value = s.pk.k10 ?? '';
  if (k12inputnum) k12inputnum.value = s.pk.k12 ?? '';
  if (k21inputnum) k21inputnum.value = s.pk.k21 ?? '';
  if (k13inputnum) k13inputnum.value = s.pk.k13 ?? '';
  if (k31inputnum) k31inputnum.value = s.pk.k31 ?? '';
  if ((s.pk.inputMode || 'clearance') === 'microconstants') syncClearanceInputsFromMicroInputs();
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
    setTciTargetChanges(s.tci.changes || []);
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
  setSimulationStatus(
    'Original TCI settings restored. Schedule edits made since import were discarded.',
    'ok',
  );
}

function deleteStrategy(id) {
  strategies = strategies.filter((s) => s.id !== id);
  if (activeStrategyId === id) activeStrategyId = strategies[0]?.id || null;
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
  cb.addEventListener('change', function () {
    compareMode = this.checked;
    dfsolve();
  });
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
    const s = strategies.find((x) => x.id === id);
    if (s) s.name = inp.value;
  });
  list.addEventListener('change', (ev) => {
    if (ev.target.matches('input.strategy-name')) dfsolve();
  });

  renderStrategyList();
}

// Simulate a saved strategy independently of the current form.

// ============================
// PK input mode: clearances/volumes vs microconstants
// ============================
function getPkInputMode() {
  return pkInputModeSelect?.value || 'clearance';
}

function updatePkInputVisibility() {
  const microMode = getPkInputMode() === 'microconstants';
  $$('.pk-clearance-row').forEach((row) => {
    row.style.display = microMode ? 'none' : '';
  });
  $$('.pk-clearance-volume-row').forEach((row) => {
    row.style.display = microMode ? 'none' : '';
  });
  $$('.pk-micro-row').forEach((row) => {
    row.style.display = microMode ? '' : 'none';
  });
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
  const values = Object.fromEntries(
    ['Vd1', 'Vd2', 'Vd3', 'Cl', 'Q2', 'Q3', 'ke0'].map((id) => [
      id,
      parseFloatSafe(document.getElementById(id).value),
    ]),
  );
  ['k10', 'k12', 'k21', 'k13', 'k31'].forEach((key) => {
    values[key] = parseFloatSafe(document.getElementById(key + 'input').value);
  });
  return resolvePkParameters({ ...values, inputMode: getPkInputMode() });
}

// ============================
// Validate inputs, run the engine, and update the views
// ============================

function setSimulationStatus(message, state = 'ok') {
  const status = document.getElementById('simulationStatus');
  const text = document.getElementById('simulationStatusText');
  if (!status || !text) return;
  text.textContent = message;
  status.dataset.state = state;
}

let suppressIntermediateSolve = 0;

function withoutIntermediateSolve(action) {
  suppressIntermediateSolve++;
  try {
    return action();
  } finally {
    suppressIntermediateSolve--;
  }
}

function dfsolve() {
  if (suppressIntermediateSolve) return;
  cancelDraftSave();

  updateTciControls();
  updateSchedulePage();

  if (!validateSimulationInputs()) {
    setResultsValidity(false);
    recordRegimenHistory();
    return;
  }

  if (getPkInputMode() === 'microconstants') syncClearanceInputsFromMicroInputs();
  else syncMicroInputsFromClearanceInputs();

  const pk = getPkParametersFromInputs();
  const params = {};
  params.Vd1 = pk.V1; // mL/kg
  params.Vd2 = pk.V2; // mL/kg, derived in microconstant mode
  params.Vd3 = pk.V3; // mL/kg, derived in microconstant mode
  params.Cl = pk.Cl; // mL/kg/min

  params.tbolus = Math.max(0, parseFloatSafe(tbolusnum.value, 0));
  params.tinfusion = Math.max(0, parseFloatSafe(tinfusionnum.value, 0));
  params.weightKg = getWeightKg();
  params.initialp = parseFloatSafe(initialpnum.value, 0);
  params.tfinal = parseFloatSafe(tfinalnum.value, 240);
  params.ke0 = Number.isFinite(parseFloat(ke0num.value)) ? parseFloat(ke0num.value) : 0;

  const schedule = getScheduleFromDOM();
  const tci = getTciConfig();
  const state = getCurrentState();
  const result = getSimulationResult(state);
  const { simulation } = result;
  latestSimulationContext = { state, result, params, schedule, tci };
  setResultsValidity(true);
  updateRegimenOverview(params, schedule);

  renderSimulationCharts(simulation, params, schedule, tci);
  renderSimulationResults(simulation, params, pk, result);
  updateSimulationInspection();
  updateTciDeliverySummary();
  queueDraftSave();
  recordRegimenHistory();
}

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
// Drug presets
// ============================
// Optional educational starting points. Other models permit TCI only after
// the user supplies a target and maximum rate; never use this to control a pump.
const TCI_PRESETS = Object.fromEntries(
  PHYSIO_DRUG_REGISTRY.drugs.filter((d) => d.tci).map((d) => [d.id, d.tci]),
);

function applyTciPreset(id) {
  setTciTargetChanges();
  const profile = TCI_PRESETS[id];
  const enabled = document.getElementById('tciEnabled');
  const targetType = document.getElementById('tciTargetType');
  const target = document.getElementById('tciTarget');
  const maxRate = document.getElementById('tciMaxRate');
  const stopTime = document.getElementById('tciStopTime');
  const note = document.getElementById('tciPresetNote');
  if (!id) {
    if (enabled) enabled.disabled = false;
    if (note)
      note.textContent =
        'Custom model: enter an educational target and maximum rate based on your own model assumptions.';
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
    if (note)
      note.textContent =
        id === 'bupivacaine'
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

function applyRegistryPreset(id) {
  const preset = PHYSIO_DRUG_REGISTRY.drugs.find((drug) => drug.id === id);
  if (!preset) return;
  modelProvenance = registryModelProvenance(id);
  currentDrug = id;
  setDisplayUnit(preset.units.conc);
  setBolusUnit(preset.units.bolus);
  setInfusionUnit(preset.units.infusion);
  Object.entries(preset.pk).forEach(([key, value]) => {
    const ids = { Vd1: 'Vd1', Vd2: 'Vd2', Vd3: 'Vd3', Cl: 'Cl', Q2: 'Q2', Q3: 'Q3', ke0: 'ke0' };
    document.getElementById(ids[key]).value = value;
  });
  syncMicroInputsFromClearanceInputs();
  dfsolve();
}

function propofol() {
  applyRegistryPreset('propofol');
}

function etomidate() {
  applyRegistryPreset('etomidate');
}

function ketamine() {
  applyRegistryPreset('ketamine');
}

function dexmedetomidine() {
  applyRegistryPreset('dexmedetomidine');
}

function midazolam() {
  applyRegistryPreset('midazolam');
}

function diazepam() {
  applyRegistryPreset('diazepam');
}

function fentanyl() {
  applyRegistryPreset('fentanyl');
}

function hydromorphone() {
  applyRegistryPreset('hydromorphone');
}

function remifentanil() {
  applyRegistryPreset('remifentanil');
}

function sufentanil() {
  applyRegistryPreset('sufentanil');
}

function alfentanil() {
  applyRegistryPreset('alfentanil');
}

function methadone() {
  applyRegistryPreset('methadone');
}

function rocuronium() {
  applyRegistryPreset('rocuronium');
}

function vecuronium() {
  applyRegistryPreset('vecuronium');
}

function cisatracurium() {
  applyRegistryPreset('cisatracurium');
}

function pancuronium() {
  applyRegistryPreset('pancuronium');
}

function succinylcholine() {
  applyRegistryPreset('succinylcholine');
}

function lidocaine() {
  applyRegistryPreset('lidocaine');
}

function bupivacaine() {
  applyRegistryPreset('bupivacaine');
}

function phenylephrine() {
  applyRegistryPreset('phenylephrine');
}

function ephedrine() {
  applyRegistryPreset('ephedrine');
}

function epinephrine() {
  applyRegistryPreset('epinephrine');
}

function dobutamine() {
  applyRegistryPreset('dobutamine');
}

function dopamine() {
  applyRegistryPreset('dopamine');
}

function milrinone() {
  applyRegistryPreset('milrinone');
}

function vasopressin() {
  applyRegistryPreset('vasopressin');
}

// ============================
// Drug preset library
// ============================
const DRUGS = PHYSIO_DRUG_REGISTRY.drugs.map((drug) => ({
  ...drug,
  apply: () => applyRegistryPreset(drug.id),
}));

// Illustrative adult IV inputs in each preset's displayed units. These make a
// useful starting curve, not a regimen for clinical use. Zero means no example
// for that route or dose unit, not a recommendation to omit treatment.
const DRUG_DOSE_EXAMPLES = Object.fromEntries(
  PHYSIO_DRUG_REGISTRY.drugs.map((d) => [d.id, d.example]),
);

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
  ['drugPicker', 'drawerDrugPicker'].forEach((id) => {
    const picker = document.getElementById(id);
    if (!picker) return;
    picker.textContent = '';
    const custom = document.createElement('option');
    custom.value = '';
    custom.textContent = 'Custom model (keep current parameters)';
    picker.appendChild(custom);
    const groups = [...new Set(DRUGS.map((d) => d.group))];
    groups.forEach((groupName) => {
      const group = document.createElement('optgroup');
      group.label = groupName;
      DRUGS.filter((d) => d.group === groupName).forEach((d) => {
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
  const pickers = [
    document.getElementById('drugPicker'),
    document.getElementById('drawerDrugPicker'),
  ].filter(Boolean);
  const d = DRUGS.find((x) => x.id === currentDrug);
  if (!d) {
    label.textContent = 'Custom model';
    pickers.forEach((picker) => {
      picker.value = '';
    });
    return;
  }
  label.textContent = `${d.label}${presetIsModified ? ' — modified' : ''} — units: ${currentUnit.name}`;
  pickers.forEach((picker) => {
    picker.value = d.id;
  });
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
  setScheduleToDOM({ enabled: false, boluses: [], infusions: [] });
  disableLegacyBolusInfusionInputs(false);
}

function applyDrugById(id, { clearDosing = true } = {}) {
  if (!id) return;
  const fn = DRUGS.find((drug) => drug.id === id)?.apply;
  if (typeof fn !== 'function') return;
  chartRevision++;

  if (clearDosing) clearDosingForDrugSwitch();
  presetIsModified = false;
  withoutIntermediateSolve(fn); // Apply preset parameters; render after all dosing and TCI fields are ready.
  if (clearDosing) applyDrugDoseExample(id);
  applyTciPreset(id);
  setCurrentDrugLabel();
  dfsolve();
  if (clearDosing)
    setSimulationStatus(
      id === 'bupivacaine'
        ? 'Bupivacaine has no routine IV dosing example; dosing remains zero. This systemic PK model is educational only.'
        : id === 'vasopressin'
          ? 'Vasopressin is dosed in units/min, which this mass-based model does not support; dosing remains zero.'
          : 'Drug preset loaded with an illustrative adult IV dosing example. Previous dosing was replaced; TCI is off.',
      'ok',
    );

  [document.getElementById('drugPicker'), document.getElementById('drawerDrugPicker')]
    .filter(Boolean)
    .forEach((picker) => {
      picker.value = id;
    });
}

// ============================
// Reset + init
// ============================
function reset() {
  chartRevision++;
  selectedTimelineEvent = null;
  clearDosingForDrugSwitch();
  if (weightnum) weightnum.value = 70;
  if (pkInputModeSelect) pkInputModeSelect.value = 'clearance';
  updatePkInputVisibility();
  presetIsModified = false;
  withoutIntermediateSolve(propofol);
  applyDrugDoseExample('propofol');
  applyTciPreset('propofol');
  const testTarget = document.getElementById('testRegimenTarget');
  if (testTarget) testTarget.value = '';
  const tciStopTime = document.getElementById('tciStopTime');
  if (tciStopTime) tciStopTime.value = tfinalnum.value;

  try {
    setScheduleToDOM({
      enabled: false,
      boluses: [
        {
          time: 0,
          dose: parseFloatSafe(bnum.value, 0),
          duration: parseFloatSafe(tbolusnum.value, 0),
        },
      ],
      infusions: [
        {
          start: parseFloatSafe(tbolusnum.value, 0),
          end: parseFloatSafe(tbolusnum.value, 0) + parseFloatSafe(tinfusionnum.value, 0),
          rate: parseFloatSafe(infusionnum.value, 0),
        },
      ],
    });
  } catch (e) {}

  const useCb = document.getElementById('useSchedule');
  if (useCb) useCb.checked = false;
  disableLegacyBolusInfusionInputs(false);
  updateScheduleUnitLabels();
  setCurrentDrugLabel();
  dfsolve();
  setSimulationStatus('Default propofol example loaded.', 'ok');
}

function applyMainDoseAdjustment(type) {
  const input = document.getElementById(type === 'bolus' ? 'mainBolusAmount' : 'mainInfusionRate');
  if (document.getElementById('useSchedule').checked) {
    const event = getQuickScheduleEntry(type);
    const field = type === 'bolus' ? 'dose' : 'rate';
    if (!event) return;
    event[field] = scheduleNumber(input.value);
    renderScheduleTables();
  } else {
    document.getElementById(MAIN_INPUT_LINKS[input.id]).value = input.value;
  }
  dfsolve();
}

function wireInputs() {
  $$('[data-chart-window]').forEach((button) =>
    button.addEventListener('click', () => setChartWindow(button.dataset.chartWindow)),
  );
  document
    .getElementById('downloadChartBtn')
    .addEventListener('click', () =>
      Plotly.downloadImage('myDiv1', { format: 'png', filename: 'physio-concentrations' }),
    );
  Object.entries(MAIN_INPUT_LINKS).forEach(([mainId, sourceId]) => {
    const input = document.getElementById(mainId);
    const error = document.createElement('span');
    error.id = `${mainId}Error`;
    error.className = 'field-error';
    error.hidden = true;
    input.after(error);
    input.setAttribute('aria-describedby', error.id);
    if (
      [
        'mainBolusAmount',
        'mainInfusionRate',
        'mainTciTarget',
        'mainTciMaxRate',
        'mainTciStopTime',
      ].includes(mainId)
    )
      return;
    input.addEventListener('change', () => {
      document.getElementById(sourceId).value = input.value;
      dfsolve();
    });
  });
  $$('input[name="dosingMode"]').forEach((input) =>
    input.addEventListener('change', () => setDosingMode(input.value)),
  );
  document
    .getElementById('mainConvertBasicBtn')
    .addEventListener('click', () => document.getElementById('loadScheduleExampleBtn').click());
  document.getElementById('reviewInvalidInputsBtn').addEventListener('click', () => {
    if (scheduleValidationErrors.length) {
      focusScheduleError(scheduleValidationErrors[0]);
      return;
    }
    const field = document.querySelector('#paramsDrawer .is-invalid');
    document.getElementById('paramsBtn').click();
    const card = field?.closest('.card');
    if (card) expandDrawerCard(card.id);
    setTimeout(() => field?.focus(), 0);
  });
  [
    Vd1num,
    Vd2num,
    Vd3num,
    Clnum,
    Q2num,
    Q3num,
    k10inputnum,
    k12inputnum,
    k21inputnum,
    k13inputnum,
    k31inputnum,
    ke0num,
  ].forEach((el) =>
    el?.addEventListener('change', () => {
      markPresetModified();
      dfsolve();
    }),
  );

  [bnum, tbolusnum, tinfusionnum, infusionnum, initialpnum, tfinalnum, weightnum].forEach((el) =>
    el?.addEventListener('change', () => dfsolve()),
  );

  pkInputModeSelect?.addEventListener('change', () => {
    if (getPkInputMode() === 'microconstants') syncMicroInputsFromClearanceInputs();
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

  ['tciTargetType', 'tciTarget', 'tciMaxRate', 'tciStopTime'].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', () => dfsolve());
  });
  document.getElementById('tciEnabled')?.addEventListener('change', (event) => {
    if (event.target.checked) {
      const useSchedule = document.getElementById('useSchedule');
      if (useSchedule) useSchedule.checked = false;
      disableLegacyBolusInfusionInputs(true);
      setSimulationStatus(
        'Educational TCI mode is active; manual dosing inputs are not used.',
        'ok',
      );
    } else {
      disableLegacyBolusInfusionInputs(Boolean(document.getElementById('useSchedule')?.checked));
    }
    dfsolve();
  });

  document.getElementById('scaleToggleBtnTop')?.addEventListener('click', () => toggleScale());
  document.getElementById('darkModeBtnTop')?.addEventListener('click', () => toggleDarkMode());

  ['drugPicker', 'drawerDrugPicker'].forEach((id) => {
    const drugPicker = document.getElementById(id);
    drugPicker?.addEventListener('change', () => {
      if (drugPicker.value) {
        applyDrugById(drugPicker.value);
        return;
      }
      tciImportSession = null;
      currentDrug = null;
      modelProvenance = null;
      presetIsModified = false;
      applyTciPreset(null);
      setCurrentDrugLabel();
      dfsolve();
    });
  });

  document
    .getElementById('mainBolusAmount')
    ?.addEventListener('change', () => applyMainDoseAdjustment('bolus'));
  document
    .getElementById('mainInfusionRate')
    ?.addEventListener('change', () => applyMainDoseAdjustment('infusion'));
  document.getElementById('mainResetBtn')?.addEventListener('click', reset);
  document
    .getElementById('timelineEventSaveBtn')
    ?.addEventListener('click', saveSelectedTimelineEvent);
  document
    .getElementById('timelineEventDuplicateBtn')
    ?.addEventListener('click', duplicateSelectedTimelineEvent);
  document
    .getElementById('timelineEventDeleteBtn')
    ?.addEventListener('click', deleteSelectedTimelineEvent);
  document
    .getElementById('generateTestRegimenBtn')
    ?.addEventListener('click', generateModelDerivedTestRegimen);
  ['mainTciTargetType', 'mainTciTarget', 'mainTciMaxRate', 'mainTciStopTime'].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', applyMainTciAdjustment);
  });

  document.getElementById('resetBtn')?.addEventListener('click', () => reset());
  document.getElementById('oneCompBtn')?.addEventListener('click', () => onecompartment());
  document
    .getElementById('summaryParamsBtn')
    ?.addEventListener('click', () => document.getElementById('paramsBtn')?.click());
  document.getElementById('exportPdfBtn')?.addEventListener('click', exportSimulationPdf);
}

(function init() {
  const desktopWorkspace = window.matchMedia('(min-width: 992px)');
  const setSummaryVisibility = () => {
    document.getElementById('regimenMore').open = desktopWorkspace.matches;
  };
  setSummaryVisibility();
  desktopWorkspace.addEventListener('change', setSummaryVisibility);
  window.matchMedia('(max-width: 690px)').addEventListener('change', () => dfsolve());
  initDrawer();
  populateDrugPicker();
  initializeUnitSelectors();
  ensureTherapeuticToggle();
  ensureScheduleUI();
  initScheduleWorkspace();
  ensureTimelineEditor();
  ensureCompareUI();
  initDistributionDetails();
  wireInputs();
  initRegimenFiles();
  initTciTargetSchedule();
  initSimulationInspection();
  window.addEventListener('beforeprint', () => {
    if (latestPdfContext) updatePdfDoseProtocol(latestPdfContext.params, latestPdfContext.schedule);
  });
  updatePkInputVisibility();
  syncMicroInputsFromClearanceInputs();
  reset();
  initDraftRecovery();
  initRegimenHistory();

  window.addEventListener('resize', () => {
    ['myDiv1', 'myDiv2', 'myDiv3', 'tciRatePlot'].forEach((id) => {
      const el = document.getElementById(id);
      if (el && window.Plotly) Plotly.Plots.resize(el);
    });
  });
})();
