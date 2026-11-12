/* Copyright (c) 2026 Julian W. Landaw | SPDX-License-Identifier: MIT */
const DRAFT_KEY = 'physio.regimen.draft.v1';
const DRAFT_PREFERENCE_KEY = 'physio.regimen.recovery.enabled';
let draftRecoveryReady = false;
let draftTimer = null;
let lastValidDraftText = null;
function cancelDraftSave() {
  clearTimeout(draftTimer);
  draftTimer = null;
}
function writeDraftNow() {
  cancelDraftSave();
  if (
    !draftRecoveryReady ||
    !document.getElementById('draftRecoveryEnabled').checked ||
    !lastValidDraftText
  )
    return;
  try {
    localStorage.setItem(DRAFT_KEY, lastValidDraftText);
    document.getElementById('draftStatus').textContent =
      'Last valid regimen saved on this browser.';
  } catch (error) {
    document.getElementById('draftStatus').textContent =
      'Browser recovery could not be saved. Use Save regimen for a file copy.';
  }
}
function queueDraftSave() {
  cancelDraftSave();
  if (!draftRecoveryReady || !document.getElementById('draftRecoveryEnabled').checked) return;
  try {
    lastValidDraftText = JSON.stringify(buildRegimenDocument({ validate: false }));
    draftTimer = setTimeout(writeDraftNow, 500);
  } catch (error) {
    document.getElementById('draftStatus').textContent =
      'Recovery keeps the previous valid regimen until the current inputs can be saved.';
  }
}
function initDraftRecovery() {
  const enabled = document.getElementById('draftRecoveryEnabled'),
    status = document.getElementById('draftStatus');
  let stored = null;
  try {
    enabled.checked = localStorage.getItem(DRAFT_PREFERENCE_KEY) !== 'false';
    stored = enabled.checked ? localStorage.getItem(DRAFT_KEY) : null;
    if (stored) {
      loadRegimenDocument(stored);
      lastValidDraftText = stored;
      status.textContent = 'Recovered your last valid regimen from this browser.';
    }
  } catch (error) {
    status.textContent =
      'The saved draft could not be recovered. Your current inputs are available.';
  }
  draftRecoveryReady = true;
  if (!stored) queueDraftSave();
  document.addEventListener('input', cancelDraftSave);
  window.addEventListener('pagehide', writeDraftNow);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) writeDraftNow();
  });
  enabled.addEventListener('change', () => {
    cancelDraftSave();
    try {
      localStorage.setItem(DRAFT_PREFERENCE_KEY, String(enabled.checked));
    } catch (error) {
      /* Storage may be unavailable. */
    }
    status.textContent = enabled.checked ? 'Draft recovery enabled.' : 'Draft recovery paused.';
    if (enabled.checked) dfsolve();
  });
  document.getElementById('forgetDraftBtn').addEventListener('click', () => {
    cancelDraftSave();
    lastValidDraftText = null;
    enabled.checked = false;
    try {
      localStorage.removeItem(DRAFT_KEY);
      localStorage.setItem(DRAFT_PREFERENCE_KEY, 'false');
    } catch (error) {
      /* Keep the simulation usable. */
    }
    status.textContent = 'Saved draft cleared. Enable recovery to start saving new edits.';
  });
}
