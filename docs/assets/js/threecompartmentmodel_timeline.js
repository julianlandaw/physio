/* Copyright (c) 2026 Julian W. Landaw | SPDX-License-Identifier: MIT */

let selectedTimelineEvent = null;

function getTimelineEventDetails(segment, schedule) {
  if (segment.type === 'bolus') {
    const event = schedule?.enabled
      ? schedule.boluses?.[segment.index]
      : { dose: parseFloatSafe(bnum?.value, 0), duration: parseFloatSafe(tbolusnum?.value, 0) };
    return `${segment.label}: ${formatInputValue(event?.dose || 0)} ${currentBolusUnit.name} at ${formatInputValue(segment.start)} min${event?.duration > 0 ? ` over ${formatInputValue(event.duration)} min` : ''}`;
  }
  const event = schedule?.enabled
    ? schedule.infusions?.[segment.index]
    : { rate: parseFloatSafe(infusionnum?.value, 0) };
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
  document.getElementById('timelineEventErrors').hidden = true;
  editor.hidden = !selected;
  if (!selected) return;

  const isBolus = selected.type === 'bolus';
  const toggleField = (id, visible) => {
    const field = document.getElementById(id);
    if (field) field.hidden = !visible;
  };
  toggleField('timelineBolusTimeField', isBolus);
  toggleField('timelineBolusDoseField', isBolus);
  toggleField('timelineBolusDurationField', isBolus);
  toggleField('timelineInfusionStartField', !isBolus);
  toggleField('timelineInfusionEndField', !isBolus);
  toggleField('timelineInfusionRateField', !isBolus);
  document.getElementById('timelineEventEditorHeading').textContent =
    `${isBolus ? 'Bolus' : 'Infusion'} ${selected.index + 1}`;
  document.getElementById('timelineEventDoseUnit').textContent = currentBolusUnit.name;
  document.getElementById('timelineEventRateUnit').textContent = currentInfusionUnit.name;
  if (isBolus) {
    document.getElementById('timelineEventTime').value = formatInputValue(selected.event.time);
    document.getElementById('timelineEventDose').value = formatInputValue(selected.event.dose);
    document.getElementById('timelineEventDuration').value = formatInputValue(
      selected.event.duration,
    );
  } else {
    document.getElementById('timelineEventStart').value = formatInputValue(selected.event.start);
    document.getElementById('timelineEventEnd').value = formatInputValue(selected.event.end);
    document.getElementById('timelineEventRate').value = formatInputValue(selected.event.rate);
  }
}

function selectTimelineEvent(type, index) {
  if (!getScheduleFromDOM().enabled && !validateSimulationInputs()) return;
  const schedule = getEditableTimelineSchedule();
  const events = type === 'bolus' ? schedule.boluses : schedule.infusions;
  if (!Number.isInteger(index) || index < 0 || index >= events.length) return;
  selectedTimelineEvent = { type, index };
  if (!getScheduleFromDOM().enabled) {
    setScheduleToDOM(schedule);
    disableLegacyBolusInfusionInputs(true);
  }
  dfsolve();
  setSimulationStatus(
    `${type === 'bolus' ? 'Bolus' : 'Infusion'} selected. Edit its details below the timeline.`,
    'ok',
  );
}

function saveSelectedTimelineEvent() {
  const schedule = getEditableTimelineSchedule();
  const selected = getSelectedTimelineEvent(schedule);
  if (!selected) return;
  const { event } = selected;
  const ids =
    selected.type === 'bolus'
      ? { time: 'timelineEventTime', dose: 'timelineEventDose', duration: 'timelineEventDuration' }
      : { start: 'timelineEventStart', end: 'timelineEventEnd', rate: 'timelineEventRate' };
  Object.entries(ids).forEach(([field, id]) => {
    clearInvalidInput(document.getElementById(id));
    event[field] = readNumericInput(document.getElementById(id).value);
  });
  const invalid = doseEventErrors(selected.type, event);
  const errors = document.getElementById('timelineEventErrors');
  errors.hidden = !invalid.length;
  errors.textContent = invalid.map((error) => error.message).join(' ');
  if (invalid.length) {
    invalid.forEach((error) =>
      markInvalidInput(document.getElementById(ids[error.field]), error.message),
    );
    document.getElementById(ids[invalid[0].field]).focus();
    setSimulationStatus(
      'Timeline event was not changed. Correct the highlighted entries.',
      'error',
    );
    return;
  }
  const list = selected.type === 'bolus' ? schedule.boluses : schedule.infusions;
  const timeField = selected.type === 'bolus' ? 'time' : 'start';
  list.sort((a, b) => a[timeField] - b[timeField]);
  selectedTimelineEvent.index = list.indexOf(event);
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
  commitTimelineSchedule(
    schedule,
    `${selected.type === 'bolus' ? 'Bolus' : 'Infusion'} duplicated.`,
  );
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
  const bolusDose = Math.max(0, parseFloatSafe(bnum?.value, 0));
  const infusionRate = Math.max(0, parseFloatSafe(infusionnum?.value, 0));
  return {
    enabled: true,
    boluses: bolusDose > 0 ? [{ time: 0, dose: bolusDose, duration: bolusDuration }] : [],
    infusions:
      infusionRate > 0
        ? [
            {
              start: bolusDuration,
              end: bolusDuration + Math.max(0, parseFloatSafe(tinfusionnum?.value, 0)),
              rate: infusionRate,
            },
          ]
        : [],
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

function commitTimelineSchedule(schedule, message) {
  document.getElementById('tciEnabled').checked = false;
  setScheduleToDOM(schedule);
  disableLegacyBolusInfusionInputs(true);
  expandDrawerCard('scheduleCard');
  dfsolve();
  setSimulationStatus(message, 'ok');
}

function removeTimelineEvent(type, index) {
  const schedule = getEditableTimelineSchedule();
  const events = type === 'bolus' ? schedule.boluses : schedule.infusions;
  if (!Number.isInteger(index) || index < 0 || index >= events.length) return;
  events.splice(index, 1);
  selectedTimelineEvent = null;
  commitTimelineSchedule(
    schedule,
    `${type === 'bolus' ? 'Bolus' : 'Infusion'} removed from the schedule.`,
  );
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
      track.querySelector('[data-timeline-lane="infusion"]').appendChild(draft);
    }
    const tfinal = Math.max(0.1, parseFloatSafe(tfinalnum?.value, 0.1));
    const left = Math.min(start, end);
    const width = Math.max(0.5, (Math.abs(end - start) / tfinal) * 100);
    draft.style.left = `${(left / tfinal) * 100}%`;
    draft.style.width = `${width}%`;
  };

  track.addEventListener('pointerdown', (event) => {
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

  track.addEventListener('pointermove', (event) => {
    if (!pointerStart || pointerStart.segment) return;
    const currentTime = getTimelineTimeFromPointer(event, track);
    if (Math.abs(event.clientX - pointerStart.x) > 6) dragging = true;
    if (dragging) {
      track.classList.add('is-dragging');
      renderDraft(pointerStart.time, currentTime);
    }
  });

  track.addEventListener('pointerup', (event) => {
    if (!pointerStart) return;
    const start = pointerStart;
    const endTime = getTimelineTimeFromPointer(event, track);
    pointerStart = null;
    clearDraft();

    if (start.segment) {
      if (Math.abs(event.clientX - start.x) <= 6) {
        selectTimelineEvent(
          start.segment.dataset.eventType,
          Number(start.segment.dataset.eventIndex),
        );
      }
      return;
    }

    const schedule = getEditableTimelineSchedule();
    if (dragging) {
      const infusionStart = Math.min(start.time, endTime);
      const infusionEnd = Math.max(infusionStart + 0.1, Math.max(start.time, endTime));
      schedule.infusions.push({
        start: infusionStart,
        end: infusionEnd,
        rate: timelineDefaultInfusionRate(schedule),
      });
      schedule.infusions.sort((a, b) => a.start - b.start);
      const eventIndex = schedule.infusions.findIndex(
        (event) => event.start === infusionStart && event.end === infusionEnd,
      );
      selectedTimelineEvent = { type: 'infusion', index: eventIndex };
      commitTimelineSchedule(
        schedule,
        `Infusion added from ${formatInputValue(infusionStart)} to ${formatInputValue(infusionEnd)} min. Edit its rate below the timeline.`,
      );
    } else {
      schedule.boluses.push({
        time: start.time,
        dose: timelineDefaultBolusDose(schedule),
        duration: 0,
      });
      schedule.boluses.sort((a, b) => a.time - b.time);
      selectedTimelineEvent = {
        type: 'bolus',
        index: schedule.boluses.findIndex(
          (event) => event.time === start.time && event.duration === 0,
        ),
      };
      commitTimelineSchedule(
        schedule,
        `Bolus added at ${formatInputValue(start.time)} min. Edit its dose below the timeline.`,
      );
    }
    dragging = false;
  });

  track.addEventListener('pointercancel', () => {
    pointerStart = null;
    dragging = false;
    clearDraft();
  });

  track.addEventListener('keydown', (event) => {
    if (getTciConfig().enabled) return;
    const segment = event.target.closest('.dose-timeline__segment');
    if (!segment || !['Enter', ' ', 'Delete', 'Backspace'].includes(event.key)) return;
    event.preventDefault();
    if (['Delete', 'Backspace'].includes(event.key))
      removeTimelineEvent(segment.dataset.eventType, Number(segment.dataset.eventIndex));
    else selectTimelineEvent(segment.dataset.eventType, Number(segment.dataset.eventIndex));
  });
}
