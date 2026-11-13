<!--
Copyright (c) 2026 Julian W. Landaw
SPDX-License-Identifier: MIT
-->

# Physio

Physio is a static educational website for physiology and pharmacology. Its `docs/` directory contains the published site, interactive respiratory and pharmacokinetic simulations, supporting teaching material, visual assets, parameter data, and local copies of browser libraries.

The project is intended for teaching and exploration. It is not clinical decision-support software and does not provide patient-specific treatment or dosing advice.

## Run the website locally

Serve `docs/` from a local web server:

```bash
python3 -m http.server 8000 --directory docs
```

Then browse to:

- [Home page](http://localhost:8000/)
- [Pharmacology landing page](http://localhost:8000/Pharmacology/pharmacology.html)
- [Three-compartment PK model](http://localhost:8000/Pharmacology/threecompartmentmodel.html)
- [Respiratory physiology page](http://localhost:8000/Respiratory/respiratory.html)

Using a server rather than opening files directly helps browser loading behavior match deployment.

## Repository map

```text
.
├── README.md                         # This repository guide
├── LICENSE                           # MIT license for original project code
└── docs/                             # Static website root
    ├── index.html                    # Site home page
    ├── Pharmacology/                 # PK tools, data, and references
    ├── Respiratory/                  # Ventilator/respiratory teaching tools
    ├── PhysiologyDiscussion/         # TeX and notebook teaching material
    └── assets/                       # Shared CSS, JS, media, PDFs, and vendors
```

## `docs/`: website root

`docs/index.html` is the main landing page. It links the site’s physiology and pharmacology content and loads the shared Steller/Bootstrap presentation assets.

### `docs/Pharmacology/`

This directory contains the pharmacology teaching tools and the data used to support them.

| Item                                        | Purpose                                                                                              |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `pharmacology.html`                         | Landing page for the pharmacology section.                                                           |
| `threecompartmentmodel.html`                | Main interactive three-compartment pharmacokinetic model.                                            |
| `inhalational_anesthesia.html`              | Interactive educational simulator of volatile-anesthetic wash-in, uptake, distribution, and washout. |
| `inhalational_anesthesia.tex`               | Detailed physiology and mathematical derivation for the inhalational-anesthesia simulator.           |
| `csht_three_compartment_web_simulator.html` | Compact context-sensitive half-time simulator.                                                       |
| `drug_registry.json`                        | Authoritative live presets, example regimens, TCI profiles, and reference ranges for both PK tools.  |
| `anesthetic_drug_pk_parameters.csv`         | Preset clearance/volume parameters and notes.                                                        |
| `anesthetic_drug_pk_microconstants.csv`     | Derived microconstant parameter table.                                                               |
| `druginfo.txt`                              | Supporting drug information.                                                                         |
| `DrugModels/`                               | Drug-specific source PDFs/text and related PK reference material.                                    |
| `CoPilotHelp/`                              | Historical development exports and reference plots; these are not loaded by the website.             |

#### Three-compartment model

The main model is implemented by:

- `docs/Pharmacology/threecompartmentmodel.html` — application markup and local library references.
- `docs/assets/js/drug_registry.js` — generated shared drug data; edit `drug_registry.json` and regenerate rather than editing this output.
- `docs/assets/js/threecompartmentmodel.js` — form bindings, presets, comparison strategies, and application coordination.
- `docs/assets/js/threecompartmentmodel_engine.js` — numerical PK/TCI simulation, PK normalization, dose integration, schedule simplification, replay calculations, and half-life metrics. It accepts data and has no page or chart dependencies.
- `docs/assets/js/threecompartmentmodel_results.js` — bounded cache of physical simulation inputs, predictions, and half-life results; current validated result context.
- `docs/assets/js/threecompartmentmodel_inspection.js` — time-point inspection, TCI delivery summaries, chart cursors, and full results CSV export.
- `docs/assets/js/threecompartmentmodel_provenance.js` — recorded model identity, source references, revision handling, and safe display of source metadata.
- `docs/assets/js/threecompartmentmodel_units.js` — unit metadata, numeric formatting, and pure conversions with explicit unit and weight arguments.
- `docs/assets/js/threecompartmentmodel_validation.js` — shared numeric, dose-event, and target-change rules, plus the form-validation adapter. Blank required entries remain invalid; explicit zero is accepted where allowed.
- `docs/assets/js/threecompartmentmodel_charts.js` — charts, reference ranges, comparisons, and result presentation.
- `docs/assets/js/threecompartmentmodel_timeline.js` — timeline interactions and event editing.
- `docs/assets/js/threecompartmentmodel_report.js` — report tables and print/PDF preparation.
- `docs/assets/js/threecompartmentmodel_history.js` — bounded Undo/Redo snapshots, controls, and keyboard shortcuts.
- `docs/assets/js/threecompartmentmodel_schedule.js` — complete schedule state and tables that render at most 50 events of each type, both in the drawer and larger editor.
- `docs/assets/js/threecompartmentmodel_tci.js` — timed target editing and validation.
- `docs/assets/js/threecompartmentmodel_files.js` — validated, versioned regimen JSON save/load, including comparison strategies and original TCI snapshots.
- `docs/assets/js/threecompartmentmodel_draft.js` — browser recovery of the last valid regimen, with pause and forget controls.
- `docs/assets/css/threecompartmentmodel.css` — responsive dashboard layout, drawer, graph/timeline, dark mode, and print styling.

Key capabilities include:

- Grouped drug-preset selection or custom PK input.
- Clearance/volume or microconstant model entry.
- Weight-aware unit conversion for bolus and infusion dosing.
- Basic bolus/infusion regimen plus multi-event schedules.
- Larger schedule editor with bolus and infusion rows in pages of 50, jump-to-time navigation, and complete schedule CSV export. Offscreen events remain available to validation, simulation, unit conversion, and file export.
- Educational Cp/Ce TCI with up to 100 timed target changes. Changes must be in increasing time order, greater than zero, and before infusion stop; a target of zero pauses delivery. The maximum infusion rate applies throughout. Convert the calculated rates to an editable schedule to replay or adjust the regimen.
- Regimen JSON save/load to retain model inputs, units, schedules, comparison strategies, and TCI import references across visits. Use **Save regimen** and **Load regimen** under **Summary, settings & export**; loading a file replaces the current regimen and comparison list.
- Automatic local recovery of the last valid regimen, including timed targets, comparison strategies, and imported TCI references. Incomplete edits retain the previous valid draft. Recovery uses this browser's local storage; **Forget saved draft** removes it and disables saving until recovery is enabled again. Regimen files remain useful for a separate, portable copy.
- Editable dosing timeline with separate bolus and infusion lanes: click the bolus lane to add a dose during an ongoing infusion, drag to add an infusion, and click an existing event to edit, duplicate, or delete it. Adding a bolus preserves the infusion regimen.
- Undo/Redo for committed regimen edits, including incomplete numeric entries, schedule changes, target changes, TCI imports, simplification, drug switches, resets, and file loads. Controls appear beside the regimen heading and in the schedule dialog. Outside form controls, use Ctrl/Cmd+Z to undo and Ctrl/Cmd+Shift+Z to redo; Ctrl+Y also redoes. Form controls retain their native editing shortcuts. History lasts for this visit and retains up to 30 snapshots, with a combined text budget of roughly 12 MiB; an oversized current snapshot is retained alone.
- Schedule validation links open the larger editor at the correct page and focus the invalid field, including errors in offscreen events.
- Direct main-screen bolus and infusion-rate controls.
- Cp/Ce concentration plots, distribution-compartment plots, half-life metrics, comparisons, therapeutic-range overlays where available, dark mode, log Y-axis, and PDF export.
- Chart time-window controls and retained zoom during routine edits; reference ranges appear in a separate key below the graph.
- Time-point inspection beneath the primary chart: enter a time, move the slider, or click a concentration/rate data point to see Cp, Ce, active TCI target, predicted-minus-target difference, delivery rate, and cumulative dose together. Slider movement snaps to the simulation timestep (0.1 min), displaying values such as 6.0 and 6.1; arrow keys move one timestep. Manual entry and chart selection retain exact fractional event times. Both charts show the cursor. Values between samples use the model transition, so they do not interpolate across instantaneous bolus jumps. At an event boundary, concentrations and cumulative dose include the bolus and the displayed rate applies to the following interval; at simulation end the displayed rate is zero.
- TCI feedback identifies maximum-rate delivery, zero-target pauses, pauses when no additional drug is required, and infusion stop. The rate-panel summary gives the duration of each state; it does not define a concentration tolerance or claim a target has been clinically attained. Imported TCI summaries retain every timed target change.
- **Export results CSV** under **Summary, settings & export** downloads every sample, including fractional event times and the final sample. Columns include Cp/Ce and units, the right-continuous rate-based delivery rate and units, cumulative delivered dose in mg/kg and mg, active target and compartment, delivery status, weight, numerical PK parameters, and recorded model provenance. Initial concentration is not counted as delivered dose. Unavailable Ce and inactive targets are blank. **Export schedule CSV** in the schedule editor remains the dosing-event table.
- Repeated calculations with identical physical inputs reuse predictions and half-life results, including saved strategies in comparison mode. The cache retains at most 12 results, 200,000 sample times in total, and roughly 8 MiB of key text; a single oversized result may be retained alone. Theme changes update styling, reference toggles update their overlay, and cursor movement updates the inspector and cursor overlays. Physical input edits trigger new calculations. Display-unit conversions and equivalent clearance/microconstant representations do not by themselves trigger a replay-assumptions warning.

`drug_registry.json` is the sole live source for both simulators and the two CSV parameter tables. After changing it, run:

```bash
python3 scripts/generate_presets.py
```

The generator derives microconstants from clearance and volume values and updates the browser data and both CSVs together. `python3 scripts/generate_presets.py --check` detects stale generated outputs. Historical `CoPilotHelp/` exports and `DrugModels/` remain reference resources. Preset/model assumptions must be reviewed before teaching or research use.

Each preset has a stable model identifier, a model name, simulation population assumptions, a source-review status, and structured references. Generated parameter revisions hash the PK values and default units; the registry revision also covers documentation and metadata. A parameter revision identifies the base preset. Modified parameters are flagged separately, and saved numerical inputs describe the actual run. Regimen files, comparison strategies, TCI source snapshots, recovery, reports, and results CSVs retain recorded provenance. Older files without provenance still load and display the revision as **Not recorded**; loading a saved revision does not substitute the current registry revision.

References distinguish the live registry from background literature. Repository citations are transcribed as background, and parameter-to-publication mappings remain explicitly **unverified**, including for named-model approximations. No study population is inferred from a model label. Source entries describe the implemented weight-normalized simulation and omitted covariates; this metadata does not establish validation or patient applicability. PDF references were not inspected or changed for this work.

### `docs/Respiratory/`

This directory contains respiratory physiology pages:

| File                              | Purpose                                            |
| --------------------------------- | -------------------------------------------------- |
| `respiratory.html`                | Respiratory ventilator physiology overview.        |
| `pressure_control_simulator.html` | Interactive pressure-control ventilator simulator. |
| `volume_control_simulator.html`   | Interactive volume-control ventilator simulator.   |

The ventilator pages share `ventilation_engine.js` (DOM-independent exact phase solutions), `ventilation_cases.js` (teaching mechanics and references), `ventilation.js` (controls and measurements), `ventilation_charts.js` (SVG waveforms), and `ventilation.css` in `docs/assets/`. Both pages work directly from disk. Related diagrams are in `docs/assets/imgs/`.

Controls expose inspiratory/expiratory resistance, compliance, breath timing, and startup or periodic steady-state initialization. Selecting a lung-mechanics example preserves ventilator settings. Mode links carry the current settings in the URL. Invalid edits retain the last valid results with an explicit message. Measurements belong to the selected complete breath; partial breaths do not produce full-breath measurements. Expired tidal volume is calculated from the actual volume change, and plateau/driving pressures require a VCV hold. Volume is measured above equilibrium at set PEEP.

The waveform view has four synchronized panels: pressure, volume, flow and a CO₂ capnogram. It supports one or three breaths or the full run, phase shading, optional alveolar pressure, locked scales, a shared inspection cursor, and a frozen baseline with its own breath measurements and dashed CO₂ trace. Viewing and resizing charts do not rerun the solver.

Both ventilator pages also show a **steady-state EtCO₂ estimate**, estimated PaCO₂ and alveolar ventilation. Under **CO₂ & capnogram options**, adjust CO₂ production (default 200 mL/min STPD), physiologic dead space (150 mL/breath BTPS) and the assumed PaCO₂–EtCO₂ gradient (5 mmHg). The calculation uses periodic steady-state tidal volume, including PCV air trapping: `VA = max(VTsteady − VD, 0) × RR / 1000` L/min; `PaCO2 ≈ 0.863 × VCO2 / VA`; `EtCO2 ≈ PaCO2 − gradient`. It is separate from the selected breath and is unchanged by startup state or run duration. Baselines and mode links retain the CO₂ assumptions and shape selection. Mechanics presets do not infer disease-specific dead space or gradients.

This is a ventilation-based teaching estimate. It assumes zero inspired CO₂ and omits CO₂ stores, perfusion and V/Q heterogeneity. Zero alveolar ventilation has no finite steady solution; impossible sea-level pressures and gradients yielding nonpositive EtCO₂ are marked unavailable, with a gap in the CO₂ trace. Background: [CO₂ mass-balance modeling](https://pmc.ncbi.nlm.nih.gov/articles/PMC4737892/) and [arterial-to-end-tidal gradient modeling](https://pubmed.ncbi.nlm.nih.gov/14633572/). These papers do not validate this estimator.

The capnogram illustrates an inspiratory baseline, phase I baseline, phase II upstroke, rising phase III plateau and inspiratory reset. Each breath ends at the steady-state EtCO₂ estimate, marked by a dot; the cursor reports CO₂ at the inspected time. Shape can be reference, obstructive (shark fin), or automatic. Auto interpolates from reference at expiratory R ≤10 to obstructive at R ≥40; COPD-like and bronchospasm-like presets therefore show more sloping shapes. This resistance-to-shape mapping is an illustrative choice, not a validated physiological prediction. With severity `s` between 0 and 1, phase I lasts `0.04 × Te`, phase II ends at `(0.12 + 0.26 × s) × Te` at `(0.95 − 0.35 × s) × EtCO2`, then phase III rises linearly to EtCO₂. Phase fractions use time, not dead-space transit. The waveform repeats the estimated amplitude from the first breath and does not simulate mass-conserving gas transport or transient washout. [Bronchospasm capnogram case study](https://pmc.ncbi.nlm.nih.gov/articles/PMC10115549/) provides background on obstructive shape, not validation of these chosen fractions.

Example mechanics use resistance in cm H₂O/(L/s) and compliance in mL/cm H₂O:

| Example                               | Inspiratory / expiratory resistance | Compliance | Expiratory time constant |
| ------------------------------------- | ----------------------------------- | ---------- | ------------------------ |
| Reference                             | 10 / 10                             | 50         | 0.5 s                    |
| COPD-like obstruction                 | 20 / 20                             | 60         | 1.2 s                    |
| Bronchospasm-like resistance increase | 30 / 30                             | 50         | 1.5 s                    |
| Low compliance                        | 10 / 10                             | 25         | 0.25 s                   |
| High compliance with obstruction      | 20 / 20                             | 100        | 2 s                      |

The COPD-like combination is supported by a [2024 PCV bench study](https://pmc.ncbi.nlm.nih.gov/articles/PMC11107031/). The low-compliance combination comes from a [2021 respiratory mechanics bench study](https://pmc.ncbi.nlm.nih.gov/articles/PMC7925949/). Bronchospasm-like and high-compliance examples are illustrative choices, not validated disease models. Shortening expiration relative to its time constant demonstrates incomplete emptying and intrinsic PEEP. The model assumes a passive linear compartment and does not reproduce dynamic airway collapse, expiratory flow limitation, heterogeneous lungs, gas exchange, or patient effort. These are teaching mechanics, not recommended ventilator settings.

### `docs/PhysiologyDiscussion/`

This directory contains longer-form teaching material:

- `Physiology.tex` — LaTeX source document.
- `RespiratoryPhysiology.ipynb` — Jupyter notebook.
  Edit the `.tex` or `.ipynb` sources. Generated LaTeX logs and auxiliary files are ignored by Git.

### `docs/assets/`

Shared website resources are organized as follows:

| Directory/file    | Purpose                                                                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `assets/css/`     | Page styles plus a pruned Steller base theme. `site.css` holds the shared landing-page styles; `threecompartmentmodel.css` is model-specific. |
| `assets/js/`      | Maintained simulation scripts plus local Math.js and Plotly dependencies.                                                                     |
| `assets/scss/`    | Source SCSS for the shared Steller theme and its Bootstrap dependency.                                                                        |
| `assets/imgs/`    | Site images, diagrams, SVGs, GIFs, and video media.                                                                                           |
| `assets/pdfs/`    | Site PDF material, including the CV.                                                                                                          |
| `assets/vendors/` | Runtime Bootstrap and jQuery dependencies, with their upstream notices.                                                                       |

Do not edit minified or vendored files unless deliberately upgrading a dependency. Prefer changing the original page, its dedicated script, or its dedicated stylesheet.

## Development workflow

- Use the page-specific HTML, CSS, and JavaScript for interface/model work.
- Keep solver or parameter changes separate from presentation-only changes when possible.
- Preserve vendor files and third-party license notices.
- Preserve source PDFs and generated artifacts unless the task explicitly calls for changing them.
- Open affected pages in a browser after changes; run `git diff --check` to catch whitespace errors.
- Formatting follows `.prettierrc.json`; `.prettierignore` excludes vendor libraries and reference material. Use Prettier 3 to format maintained HTML, CSS, JavaScript, tests, and this guide. The shipped theme stylesheets contain only selectors relevant to the current pages; upstream SCSS is retained for reference.
- Browser checks are in `tests/threecompartmentmodel.browser.html` (add `?long=1` for full TCI import, paging, and file round-trips) and `tests/csht.browser.html` (responsive charts and calculation checks). Serve the repository root to open these test pages; each reports PASS/FAIL results.
- `tests/site.browser.html` checks landing-page navigation, both ventilator simulators, and the inhalational simulator.
- `tests/recovery.browser.html` checks timed targets, exact TCI replay, file compatibility, and local recovery across reloads, including invalid edits and unavailable storage.
- `tests/editing.browser.html` checks shared validation, timeline editing, offscreen error navigation, Undo/Redo, history limits, and recovery at the current history position. It also runs `tests/engine.worker.js` to verify analytical solutions and TCI replay with no document or application UI loaded.
- `tests/results.browser.html` checks cache reuse, chart-only updates, cursor values, results CSV data and metadata, TCI status, physical replay comparison, and provenance round-trips. Standalone engine checks also verify cumulative dose and sampling around bolus discontinuities.
- `tests/ventilation.browser.html` checks both ventilator interfaces, validation, mode switching, baselines, chart-only updates, presets, and mobile layout. Its standalone worker checks analytical phase solutions, boundary handling, volume conservation, pressure measurements, short time constants, partial breaths, and air trapping.

Install Node.js 22 or later, Python 3, and Chromium or Google Chrome. From the repository root, run:

```bash
npm ci
npm run check
```

This checks formatting, generated presets, local links and anchors, duplicate IDs, and all seven browser suites, including the full-length TCI tests. It serves the repository temporarily on localhost and uses a separate browser profile for each suite. `npm run format` formats maintained source files. GitHub Actions runs the same checks for pushes and pull requests using `.github/workflows/checks.yml`.

The simulator uses classic script modules so it also works when opened directly from disk. Numerical tests can load Math.js, the unit module, and the engine independently; UI modules access their shared declarations after application initialization. Keep numerical functions independent of form fields and pass units and patient weight explicitly. Run the browser suites through HTTP because the test harnesses use fetch and workers.

## Clinical and scientific limitations

All simulations are educational visualizations. They do not replace prescribing information, local policy, validated clinical dosing tools, clinician judgment, or patient-specific assessment. Drug-preset parameters and therapeutic ranges can have population- and context-specific limitations. Verify the relevant source material before relying on a model for teaching, research, or clinical discussion.

## License and copyright

Copyright © 2026 Julian W. Landaw. Original project code is available under the [MIT License](LICENSE).

Original maintained source files use short SPDX headers:

```text
Copyright (c) 2026 Julian W. Landaw
SPDX-License-Identifier: MIT
```

Third-party libraries, themes, fonts, reference PDFs, and other external material retain their own notices and licenses. The MIT license does not remove those obligations.
