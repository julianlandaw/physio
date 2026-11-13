/* Copyright (c) 2026 Julian W. Landaw | SPDX-License-Identifier: MIT */

function getTciTargetChanges() {
  return [...document.querySelectorAll('#tciTargetChanges tbody tr')].map((row) =>
    Object.fromEntries(
      ['time', 'target'].map((field) => {
        const raw = row.querySelector(`[data-field="${field}"]`).value.trim();
        return [field, readNumericInput(raw)];
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
  tciTargetChangeErrors(
    getTciTargetChanges(),
    document.getElementById('tciStopTime').value,
  ).forEach((error) => {
    addError(null, error.message);
    const row = document.querySelector('#tciTargetChanges tbody').rows[error.index];
    markInvalidInput(row?.querySelector(`[data-field="${error.field}"]`), error.message);
    document.getElementById('tciTargetScheduleEditor').open = true;
  });
}
function initTciTargetSchedule() {
  document.getElementById('addTciTargetChangeBtn').addEventListener('click', () => {
    if (document.querySelectorAll('#tciTargetChanges tbody tr').length >= 100) return;
    addTciTargetChange();
    dfsolve();
  });
  document.getElementById('tciTargetChanges').addEventListener('change', dfsolve);
}
