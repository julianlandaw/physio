/* Copyright (c) 2026 Julian W. Landaw | SPDX-License-Identifier: MIT */

function getTciTargetChanges() {
  return [...document.querySelectorAll('#tciTargetChanges tbody tr')].map((row) =>
    Object.fromEntries(
      ['time', 'target'].map((field) => {
        const raw = row.querySelector(`[data-field="${field}"]`).value.trim();
        return [field, raw === '' ? NaN : Number(raw)];
      }),
    ),
  );
}
function addTciTargetChange(
  change = { time: '', target: document.getElementById('tciTarget').value },
) {
  const row = document.createElement('tr');
  for (const field of ['time', 'target']) {
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.step = 'any';
    input.className = 'form-control form-control-sm';
    input.dataset.field = field;
    input.value = change[field];
    input.setAttribute(
      'aria-label',
      field === 'time'
        ? 'Target change time in minutes'
        : 'New target in displayed concentration units',
    );
    row.insertCell().append(input);
  }
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = '×';
  button.className = 'btn btn-sm btn-outline-danger';
  button.setAttribute('aria-label', 'Remove target change');
  button.addEventListener('click', () => {
    row.remove();
    dfsolve();
  });
  row.insertCell().append(button);
  document.querySelector('#tciTargetChanges tbody').append(row);
}
function setTciTargetChanges(changes = []) {
  document.querySelector('#tciTargetChanges tbody').replaceChildren();
  changes.forEach(addTciTargetChange);
}
function validateTciTargetChanges(addError) {
  let previous = 0;
  const stop = Number(document.getElementById('tciStopTime').value);
  if (getTciTargetChanges().length > 100) addError(null, 'Use at most 100 TCI target changes.');
  getTciTargetChanges().forEach((change, index) => {
    const row = document.querySelector('#tciTargetChanges tbody').rows[index];
    if (!Number.isFinite(change.time) || change.time <= previous || change.time >= stop) {
      addError(
        null,
        `Target change ${index + 1}: times must increase, be greater than 0, and be before TCI stop.`,
      );
      row.querySelector('[data-field="time"]').classList.add('is-invalid');
      document.getElementById('tciTargetScheduleEditor').open = true;
    }
    if (!Number.isFinite(change.target) || change.target < 0) {
      addError(null, `Target change ${index + 1}: enter a non-negative concentration.`);
      row.querySelector('[data-field="target"]').classList.add('is-invalid');
      document.getElementById('tciTargetScheduleEditor').open = true;
    }
    previous = change.time;
  });
}
function tciTargetAt(tci, time) {
  let target = tci.targetBase;
  for (const change of tci.targetChanges || []) {
    if (change.time > time + TIME_EPSILON) break;
    target = change.targetBase;
  }
  return target;
}
function initTciTargetSchedule() {
  document.getElementById('addTciTargetChangeBtn').addEventListener('click', () => {
    if (document.querySelectorAll('#tciTargetChanges tbody tr').length >= 100) return;
    addTciTargetChange();
    dfsolve();
  });
  document.getElementById('tciTargetChanges').addEventListener('change', dfsolve);
}
