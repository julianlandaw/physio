/* Copyright (c) 2026 Julian W. Landaw | SPDX-License-Identifier: MIT */
// The complete schedule lives here. Tables are bounded views, never the data store.
let scheduleState = { boluses: [], infusions: [] };
let scheduleEventSequence = 0;
let scheduleRenderSignature = '';

function scheduleFields(type) {
  return type === 'bolus' ? ['time', 'dose', 'duration'] : ['start', 'end', 'rate'];
}
function scheduleList(type) {
  return scheduleState[type === 'bolus' ? 'boluses' : 'infusions'];
}
function scheduleTable(type) {
  return document.getElementById(type === 'bolus' ? 'bolusEventsTable' : 'infusionEventsTable');
}
function scheduleNumber(raw) {
  return String(raw).trim() === '' ? '' : Number(raw);
}
function scheduleEntry(type, values) {
  return {
    id: `dose-${++scheduleEventSequence}`,
    ...Object.fromEntries(scheduleFields(type).map((field) => [field, values[field] ?? 0])),
  };
}
function flushVisibleScheduleInputs() {
  for (const type of ['bolus', 'infusion']) {
    const byId = new Map(scheduleList(type).map((event) => [event.id, event]));
    for (const row of scheduleTable(type).tBodies[0].rows) {
      const event = byId.get(row.dataset.eventId);
      if (!event) continue;
      row.querySelectorAll('input[data-field]').forEach((input) => {
        event[input.dataset.field] = scheduleNumber(input.value);
      });
    }
  }
}
function createScheduleRow(type, event, index) {
  const row = document.createElement('tr');
  row.dataset.eventId = event.id;
  row.dataset.index = String(index);
  scheduleFields(type).forEach((field) => {
    const cell = row.insertCell(),
      input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.step = 'any';
    input.className = 'form-control form-control-sm';
    input.dataset.field = field;
    input.value = event[field];
    input.setAttribute(
      'aria-label',
      `${type === 'bolus' ? 'Bolus' : 'Infusion'} ${index + 1} ${field}`,
    );
    cell.appendChild(input);
  });
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.action = 'remove';
  button.className = 'btn btn-sm btn-outline-danger';
  button.textContent = '×';
  button.setAttribute('aria-label', `Remove ${type} ${index + 1}`);
  row.insertCell().appendChild(button);
  return row;
}
function renderScheduleTables(force = false) {
  const total = Math.max(scheduleState.boluses.length, scheduleState.infusions.length, 1);
  const pages = Math.ceil(total / SCHEDULE_PAGE_SIZE);
  schedulePage = clamp(schedulePage, 0, pages - 1);
  const views = ['bolus', 'infusion'].map((type) => {
    const list = scheduleList(type),
      page = Math.min(schedulePage, Math.max(0, Math.ceil(list.length / SCHEDULE_PAGE_SIZE) - 1));
    const start = page * SCHEDULE_PAGE_SIZE;
    return { type, start, list, events: list.slice(start, start + SCHEDULE_PAGE_SIZE) };
  });
  const signature = views.map((view) => view.events.map((e) => e.id).join(',')).join('|');
  if (force || signature !== scheduleRenderSignature) {
    for (const view of views) {
      const fragment = document.createDocumentFragment();
      view.events.forEach((event, offset) =>
        fragment.appendChild(createScheduleRow(view.type, event, view.start + offset)),
      );
      scheduleTable(view.type).tBodies[0].replaceChildren(fragment);
    }
    scheduleRenderSignature = signature;
  } else {
    for (const view of views)
      for (const row of scheduleTable(view.type).tBodies[0].rows) {
        const event = view.events.find((e) => e.id === row.dataset.eventId);
        row.querySelectorAll('input[data-field]').forEach((input) => {
          if (input.value !== String(event[input.dataset.field]))
            input.value = event[input.dataset.field];
        });
      }
  }
  const counts = views
    .map(
      (view) =>
        `${view.type === 'bolus' ? 'Boluses' : 'Infusions'} ${view.events.length ? view.start + 1 : 0}–${view.start + view.events.length} of ${view.list.length}`,
    )
    .join(' · ');
  document.getElementById('schedulePageStatus').textContent =
    `Page ${schedulePage + 1}/${pages} · ${counts}`;
  document.getElementById('scheduleInlineStatus').textContent =
    `Page ${schedulePage + 1} of ${pages}`;
  document.getElementById('schedulePreviousBtn').disabled = schedulePage === 0;
  document.getElementById('scheduleNextBtn').disabled = schedulePage === pages - 1;
  document.querySelectorAll('[data-schedule-page]').forEach((button) => {
    button.disabled =
      Number(button.dataset.schedulePage) < 0 ? schedulePage === 0 : schedulePage === pages - 1;
  });
}
function updateSchedulePage() {
  flushVisibleScheduleInputs();
  renderScheduleTables();
}
function clearTable(table) {
  flushVisibleScheduleInputs();
  scheduleState[table.id === 'bolusEventsTable' ? 'boluses' : 'infusions'] = [];
  renderScheduleTables(true);
}
function addBolusRow(values = {}) {
  addScheduleEntry('bolus', values);
}
function addInfusionRow(values = {}) {
  addScheduleEntry('infusion', values);
}
function addScheduleEntry(type, values) {
  flushVisibleScheduleInputs();
  scheduleList(type).push(scheduleEntry(type, values));
  schedulePage = Math.floor((scheduleList(type).length - 1) / SCHEDULE_PAGE_SIZE);
  renderScheduleTables(true);
}
function removeScheduleEntry(type, id) {
  flushVisibleScheduleInputs();
  const list = scheduleList(type),
    index = list.findIndex((event) => event.id === id);
  if (index >= 0) list.splice(index, 1);
  renderScheduleTables(true);
}
function getScheduleFromDOM({ includeInactive = false } = {}) {
  flushVisibleScheduleInputs();
  const enabled = document.getElementById('useSchedule').checked;
  if (!enabled && !includeInactive) return { enabled, boluses: [], infusions: [] };
  const result = { enabled };
  for (const type of ['bolus', 'infusion']) {
    const amount = type === 'bolus' ? 'dose' : 'rate',
      time = type === 'bolus' ? 'time' : 'start';
    result[type === 'bolus' ? 'boluses' : 'infusions'] = scheduleList(type)
      .filter((e) => Number(e[amount]) !== 0)
      .map((event) =>
        Object.fromEntries(scheduleFields(type).map((field) => [field, Number(event[field])])),
      )
      .sort((a, b) => a[time] - b[time]);
  }
  return result;
}
function setScheduleToDOM(schedule) {
  document.getElementById('useSchedule').checked = Boolean(schedule?.enabled);
  scheduleState = {
    boluses: (schedule?.boluses?.length ? schedule.boluses : [{}]).map((e) =>
      scheduleEntry('bolus', e),
    ),
    infusions: (schedule?.infusions?.length ? schedule.infusions : [{}]).map((e) =>
      scheduleEntry('infusion', e),
    ),
  };
  schedulePage = 0;
  renderScheduleTables(true);
}
function getQuickScheduleEntry(type) {
  const amount = type === 'bolus' ? 'dose' : 'rate',
    time = type === 'bolus' ? 'time' : 'start';
  return scheduleList(type)
    .filter((e) => e[amount] === '' || Number(e[amount]) !== 0)
    .reduce((first, e) => (!first || Number(e[time]) < Number(first[time]) ? e : first), null);
}
function rescaleScheduleState(type, field, convert) {
  flushVisibleScheduleInputs();
  scheduleList(type).forEach((event) => {
    if (event[field] !== '' && Number.isFinite(Number(event[field])))
      event[field] = Number(formatInputValue(convert(Number(event[field]))));
  });
  renderScheduleTables();
}
function validateScheduleState(addError) {
  flushVisibleScheduleInputs();
  for (const type of ['bolus', 'infusion'])
    scheduleList(type).forEach((event, index) => {
      const fields = scheduleFields(type);
      const invalid = fields.filter(
        (field) =>
          event[field] === '' || !Number.isFinite(Number(event[field])) || Number(event[field]) < 0,
      );
      if (type === 'infusion' && Number(event.end) < Number(event.start)) invalid.push('end');
      if (!invalid.length) return;
      addError(
        null,
        `${type === 'bolus' ? 'Bolus' : 'Infusion'} ${index + 1}: enter non-negative numbers${type === 'infusion' ? ' with end at or after start' : ''}.`,
      );
      const row = scheduleTable(type).querySelector(`[data-event-id="${event.id}"]`);
      row?.querySelectorAll('input').forEach((input) => {
        if (invalid.includes(input.dataset.field)) input.classList.add('is-invalid');
      });
      const amount = type === 'bolus' ? 'dose' : 'rate';
      if (event === getQuickScheduleEntry(type) && invalid.includes(amount))
        addError(
          type === 'bolus' ? 'mainBolusAmount' : 'mainInfusionRate',
          `${type === 'bolus' ? 'Bolus amount' : 'Infusion rate'} must be a number at least 0.`,
        );
    });
}
