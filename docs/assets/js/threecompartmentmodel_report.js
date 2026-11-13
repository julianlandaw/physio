/* Copyright (c) 2026 Julian W. Landaw | SPDX-License-Identifier: MIT */

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
    headers.forEach((header) => {
      const cell = document.createElement('th');
      cell.textContent = header;
      headerRow.appendChild(cell);
    });
    thead.appendChild(headerRow);
    const tbody = document.createElement('tbody');
    rows.forEach((row) => {
      const tr = document.createElement('tr');
      row.forEach((value) => {
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

  const formatTime = (value) => `${formatInputValue(parseFloatSafe(value, 0))} min`;
  const protocol = document.createElement('p');
  protocol.className = 'pdf-dose-note';
  protocol.textContent = `Simulation duration: ${formatTime(params.tfinal)}.`;
  container.appendChild(protocol);

  const tci = getTciConfig();
  if (tci.enabled) {
    addTable(
      'Educational target-controlled infusion settings',
      [
        'Target compartment',
        `Initial target (${currentUnit.name})`,
        `Maximum rate (${currentInfusionUnit.name})`,
        'Infusion stop',
      ],
      [
        [
          tci.targetType === 'ce' ? 'Effect site (Ce)' : 'Plasma (Cp)',
          formatInputValue(tci.target),
          formatInputValue(Number(document.getElementById('tciMaxRate')?.value)),
          formatTime(Math.min(tci.stopTime, params.tfinal)),
        ],
      ],
    );
    if (tci.targetChanges.length) {
      addTable(
        'TCI target changes',
        ['Time', `New target (${currentUnit.name})`],
        getTciTargetChanges().map((change) => [
          formatTime(change.time),
          formatInputValue(change.target),
        ]),
      );
    }
    const note = document.createElement('p');
    note.className = 'pdf-dose-note';
    note.textContent =
      'The calculated variable infusion rate is shown in the TCI rate graph above.';
    container.appendChild(note);
    return;
  }

  if (schedule?.enabled) {
    addTable(
      'Bolus events',
      ['Time', `Dose (${currentBolusUnit.name})`, 'Duration'],
      (schedule.boluses || []).map((event) => [
        formatTime(event.time),
        formatInputValue(event.dose),
        formatTime(event.duration),
      ]),
    );
    addTable(
      'Infusion segments',
      ['Start', 'End', `Rate (${currentInfusionUnit.name})`],
      (schedule.infusions || []).map((event) => [
        formatTime(event.start),
        formatTime(event.end),
        formatInputValue(event.rate),
      ]),
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
    [[formatTime(0), formatInputValue(parseFloatSafe(bnum.value, 0)), formatTime(params.tbolus)]],
  );
  addTable(
    'Infusion',
    ['Start', 'End', `Rate (${currentInfusionUnit.name})`],
    [
      [
        formatTime(params.tbolus),
        formatTime(params.tbolus + params.tinfusion),
        formatInputValue(parseFloatSafe(infusionnum.value, 0)),
      ],
    ],
  );
}

function updatePdfReportSummary(params, schedule) {
  const container = document.getElementById('pdfReportMeta');
  if (!container) return;
  container.textContent = '';
  const drug = DRUGS.find((item) => item.id === currentDrug);
  const tci = getTciConfig();
  const items = [
    [
      'Drug/model',
      drug ? `${drug.label}${presetIsModified ? ' — modified parameters' : ''}` : 'Custom model',
    ],
    ['Patient weight', `${formatInputValue(params.weightKg)} kg`],
    ['Simulation duration', `${formatInputValue(params.tfinal)} min`],
    ['PK inputs', getPkInputMode() === 'microconstants' ? 'Microconstants' : 'Clearance & volumes'],
    [
      'Model revision',
      `${currentProvenance().modelId} · ${currentProvenance().modelRevision || 'not recorded'}`,
    ],
    ['Source review', currentProvenance().reviewStatus],
    [
      'Delivery strategy',
      tci.enabled
        ? `Educational TCI (${tci.targetType === 'ce' ? 'Ce' : 'Cp'} target)`
        : schedule?.enabled
          ? 'Custom dose schedule'
          : 'Bolus + infusion',
    ],
  ];
  items.forEach(([label, value]) => {
    const item = document.createElement('div');
    const term = document.createElement('strong');
    term.textContent = `${label}: `;
    item.append(term, document.createTextNode(value));
    container.appendChild(item);
  });
}

function exportSimulationPdf() {
  if (latestPdfContext) updatePdfDoseProtocol(latestPdfContext.params, latestPdfContext.schedule);
  const expandableSections = $$(
    '.distribution-details, .model-details, .regimen-more, .regimen-model-details',
  );
  const priorStates = expandableSections.map((section) => section.open);
  const generatedAt = document.getElementById('pdfGeneratedAt');
  if (generatedAt) {
    generatedAt.textContent = `Generated ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date())}`;
  }

  document.body.classList.add('print-report');
  expandableSections.forEach((section) => {
    section.open = true;
  });

  // Plotly needs a layout pass once hidden detail panels become printable.
  setTimeout(() => {
    ['myDiv1', 'myDiv2', 'myDiv3', 'tciRatePlot'].forEach((id) => {
      const el = document.getElementById(id);
      if (el && window.Plotly) Plotly.Plots.resize(el);
    });
    window.print();
  }, 120);

  window.addEventListener(
    'afterprint',
    () => {
      document.body.classList.remove('print-report');
      expandableSections.forEach((section, index) => {
        section.open = priorStates[index];
      });
      setTimeout(
        () =>
          ['myDiv1', 'myDiv2', 'myDiv3', 'tciRatePlot'].forEach((id) => {
            const el = document.getElementById(id);
            if (el && window.Plotly) Plotly.Plots.resize(el);
          }),
        0,
      );
    },
    { once: true },
  );
}
