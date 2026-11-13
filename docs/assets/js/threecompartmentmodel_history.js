/* Copyright (c) 2026 Julian W. Landaw | SPDX-License-Identifier: MIT */
// History is local to this visit. Raw entries preserve incomplete edits; saved
// regimen files and automatic recovery continue to contain validated data only.
const REGIMEN_HISTORY_LIMIT = 30;
const REGIMEN_HISTORY_CHARACTER_LIMIT = 6 * 1024 * 1024;
const HISTORY_FIELD_IDS = [
  'weight',
  'b',
  'tbolus',
  'infusion',
  'tinfusion',
  'tfinal',
  'initialp',
  'Vd1',
  'Vd2',
  'Vd3',
  'Cl',
  'Q2',
  'Q3',
  'ke0',
  'k10input',
  'k12input',
  'k21input',
  'k13input',
  'k31input',
  'pkInputMode',
  'tciTarget',
  'tciTargetType',
  'tciMaxRate',
  'tciStopTime',
];
let regimenHistory = [];
let regimenHistoryIndex = -1;
let regimenHistoryReady = false;
let applyingRegimenHistory = false;

function captureHistoryEntry() {
  flushVisibleScheduleInputs();
  const state = {
    fields: Object.fromEntries(
      HISTORY_FIELD_IDS.map((id) => [id, document.getElementById(id).value]),
    ),
    drug: currentDrug,
    presetModified: presetIsModified,
    provenance: modelProvenance,
    units: {
      conc: currentUnit.name,
      bolus: currentBolusUnit.name,
      infusion: currentInfusionUnit.name,
    },
    scheduleEnabled: document.getElementById('useSchedule').checked,
    tciEnabled: document.getElementById('tciEnabled').checked,
    // IDs are view identifiers, so exclude them when comparing regimen content.
    schedule: Object.fromEntries(
      ['boluses', 'infusions'].map((type) => [
        type,
        scheduleState[type].map(({ id, ...values }) => values),
      ]),
    ),
    targets: [...document.querySelectorAll('#tciTargetChanges tbody tr')].map((row) =>
      Object.fromEntries(
        ['time', 'target'].map((field) => [
          field,
          row.querySelector(`[data-field="${field}"]`).value,
        ]),
      ),
    ),
    strategies,
    compareMode,
    tciOriginal: tciImportSession?.sourceState || null,
  };
  return {
    text: JSON.stringify(state),
    page: schedulePage,
    selection: selectedTimelineEvent && { ...selectedTimelineEvent },
    activeStrategyId,
  };
}

function recordRegimenHistory() {
  if (!regimenHistoryReady || applyingRegimenHistory || suppressIntermediateSolve) return;
  const entry = captureHistoryEntry();
  if (regimenHistory[regimenHistoryIndex]?.text === entry.text) return;
  regimenHistory.splice(regimenHistoryIndex + 1);
  regimenHistory.push(entry);
  let characters = regimenHistory.reduce((total, item) => total + item.text.length, 0);
  while (
    regimenHistory.length > 1 &&
    (regimenHistory.length > REGIMEN_HISTORY_LIMIT || characters > REGIMEN_HISTORY_CHARACTER_LIMIT)
  ) {
    characters -= regimenHistory.shift().text.length;
  }
  regimenHistoryIndex = regimenHistory.length - 1;
  updateRegimenHistoryControls();
}

function updateRegimenHistoryControls() {
  document.querySelectorAll('[data-regimen-history]').forEach((button) => {
    button.disabled =
      button.dataset.regimenHistory === 'undo'
        ? regimenHistoryIndex <= 0
        : regimenHistoryIndex >= regimenHistory.length - 1;
  });
  document.getElementById('regimenHistoryStatus').textContent =
    regimenHistoryIndex > 0 || regimenHistory.length > 1
      ? `${regimenHistoryIndex} undo · ${regimenHistory.length - regimenHistoryIndex - 1} redo`
      : 'Edits can be undone during this visit.';
}

function restoreHistoryEntry(entry) {
  const state = JSON.parse(entry.text);
  applyingRegimenHistory = true;
  clearTimeout(scheduleEditTimer);
  scheduleEditTimer = null;
  cancelDraftSave();
  try {
    currentDrug = state.drug;
    presetIsModified = state.presetModified;
    modelProvenance = state.provenance;
    setDisplayUnit(state.units.conc, false);
    setBolusUnit(state.units.bolus, false);
    setInfusionUnit(state.units.infusion, false);
    applyTciPreset(state.drug);
    Object.entries(state.fields).forEach(([id, value]) => {
      document.getElementById(id).value = value;
    });
    setScheduleToDOM(
      { enabled: state.scheduleEnabled, ...state.schedule },
      { addPlaceholders: false },
    );
    schedulePage = entry.page;
    renderScheduleTables();
    document.getElementById('tciEnabled').checked = state.tciEnabled;
    setTciTargetChanges(state.targets);
    strategies = state.strategies;
    activeStrategyId = entry.activeStrategyId;
    selectedTimelineEvent = entry.selection;
    compareMode = state.compareMode;
    document.getElementById('compareMode').checked = compareMode;
    tciImportSession = state.tciOriginal ? createTciImportSession(state.tciOriginal) : null;
    updatePkInputVisibility();
    disableLegacyBolusInfusionInputs(state.scheduleEnabled || state.tciEnabled);
    setCurrentDrugLabel();
    renderStrategyList();
    dfsolve();
  } finally {
    applyingRegimenHistory = false;
    updateRegimenHistoryControls();
  }
}

function moveRegimenHistory(direction) {
  // Commit debounced schedule edits before moving, even if their solve is pending.
  recordRegimenHistory();
  const next = regimenHistoryIndex + direction;
  if (next < 0 || next >= regimenHistory.length) return;
  regimenHistoryIndex = next;
  restoreHistoryEntry(regimenHistory[next]);
}

function undoRegimenEdit() {
  moveRegimenHistory(-1);
}
function redoRegimenEdit() {
  moveRegimenHistory(1);
}

function initRegimenHistory() {
  regimenHistoryReady = true;
  recordRegimenHistory();
  document.querySelectorAll('[data-regimen-history]').forEach((button) =>
    button.addEventListener('click', () => {
      if (button.dataset.regimenHistory === 'undo') undoRegimenEdit();
      else redoRegimenEdit();
    }),
  );
  document.addEventListener('keydown', (event) => {
    // Text and number controls retain their native editing shortcuts.
    if (
      event.target.closest?.('input, textarea, select, [contenteditable]') ||
      event.altKey ||
      !(event.ctrlKey || event.metaKey)
    )
      return;
    const key = event.key.toLowerCase();
    if (key !== 'z' && !(key === 'y' && !event.metaKey)) return;
    event.preventDefault();
    if (event.shiftKey || key === 'y') redoRegimenEdit();
    else undoRegimenEdit();
  });
}
