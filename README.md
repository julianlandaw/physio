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

| File                                                               | Purpose                                                                    |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `respiratory.html`                                                 | Respiratory ventilator physiology overview.                                |
| `ventilator_simulator.html`                                        | One interactive simulator with volume and pressure modes.                  |
| `pressure_control_simulator.html`, `volume_control_simulator.html` | Compatibility redirects preserving old mode bookmarks and shared settings. |

The ventilator simulator uses `ventilation_engine.js` (simulation and sampling), `ventilation_regions.js` (exact coupled two-region mechanics), `ventilation_co2.js` (lung/tissue CO₂ stores and airway transport), `ventilation_scenarios.js` (acute events and pressure-limited mechanics), `ventilation_event_ui.js` (event controls), `ventilation_extras.js` (timing, playback, loops and comparisons), `ventilation_cases.js` (teaching mechanics and references), `ventilation.js` (controls and measurements), `ventilation_charts.js` (SVG waveforms), and `ventilation.css` in `docs/assets/`. The unified page and compatibility redirects work directly from disk. Related diagrams are in `docs/assets/imgs/`.

Controls expose inspiratory/expiratory resistance, compliance, breath timing, and startup or periodic steady-state initialization. Selecting a lung-mechanics example preserves ventilator settings. The header switches modes in place, retaining each mode’s target and the shared lung, timing, CO₂ and event settings. Switching modes recalculates the run; it is not a within-run ventilator intervention. Frozen comparisons remain available across modes. The address bar records the current mode and valid settings, so copied links and reloads reproduce the setup. Invalid edits retain the last valid results with an explicit message and block a mode change until corrected. Measurements belong to the selected complete breath; partial breaths do not produce full-breath measurements. Expired tidal volume is calculated from the actual volume change, and plateau/driving pressures require a VCV hold. Volume is measured above equilibrium at set PEEP.

The initial view shows five essential controls (VT or pressure, rate, PEEP, resistance and compliance), four readings (delivered VT, EtCO₂, peak pressure and intrinsic PEEP), and the waveforms. Timing, advanced mechanics and CO₂ settings are expandable. Display options, time inspection, acute events, detailed measurements, loops, comparisons and model sources are closed initially. Clicking or keyboard-inspecting a waveform/loop opens the inspection readout. Invalid advanced fields open their containing sections for correction; mobile settings start collapsed with a compact values summary.

The waveform view has four synchronized panels: pressure, volume, flow and a CO₂ capnogram. It supports one or three breaths or the full run, phase shading, optional alveolar pressure, locked scales, a shared inspection cursor, and a frozen baseline with its own breath measurements and dashed CO₂ trace. Viewing and resizing charts do not rerun the solver.

Timing may be entered as inspiratory fraction, Ti in seconds, or I:E (enter E for 1:E). “Keep Ti fixed” preserves Ti across rate changes in every entry mode. Invalid timing retains the previous predictions. Playback uses the existing simulation, with pause, rewind, adjustable speed and a moving three-breath monitor window. It stops when the tab is hidden or settings change and never starts automatically. Teaching annotations identify peak/plateau/resistive pressure, total alveolar PEEP, residual expiratory flow and capnogram phases. Pressure–volume and flow–volume loops distinguish inspiration/expiration, show direction and baseline traces, and share pointer/keyboard inspection with the scalars. Loop volumes are above set-PEEP equilibrium; transient loops may be open.

Frozen comparisons can use absolute time or align the selected breaths at inspiration start, without stretching either time axis. Aligned views span the longer breath; the shorter trace ends sooner. Metric deltas are current minus baseline, and changed settings are listed explicitly.

**Dynamic CO₂** is the default. Two lung gas stores (each half the resting volume, plus its own tidal volume) exchange CO₂ with a shared tissue-equivalent store. Production enters the tissue store; an unmixed airway plus a well-mixed compartment near the mouth carry gas in both directions, carrying expired CO₂ out and residual airway CO₂ back on inspiration. All transfers conserve CO₂. A 40 ms sensor response smooths the measured trace separately. Each complete breath has its own end-expiratory EtCO₂ value; the assumed Pa–Et gradient adds to it for an arterial display estimate and does not change the transported CO₂. Initial pressure, storage and ventilation determine the transient response rather than repeating a steady-state amplitude.

Two equal-size parallel RC regions share the airway. Set **Slow / fast time-constant ratio** to 1 for uniform mechanics, or increase it to explore uneven filling and emptying. Each region has C/2, FRC/2 and half the gas-exchange conductance. For ratio k, regional resistances are `Rfast = R(1 + 1/k)` and `Rslow = R(1 + k)`; their parallel equivalent stays R. Expiratory resistance uses the same split. PCV and expiration use each region's exponential solution; VCV distributes the selected total flow through the two branches. Holds conserve total volume but can redistribute gas internally. Periodic initial volumes solve the two-region cycle map exactly.

Under **CO₂ & capnogram options**, **Airway mixing fraction** splits total VD into a stirred mixing compartment and unmixed transit volume. Its default 0.2 gives 30 mL mixed plus 120 mL unmixed at VD 150 mL. The mixed compartment uses the exact dilution solution for each gas parcel and conserves CO₂ on inspiration and expiration. At 0, transport reduces to the previous unmixed airway; at 1, all conducting-airway dead space is mixed. VD 0 safely bypasses both. Mixing broadens the upstroke through flow/volume effects rather than extra sensor smoothing. [Mechanistic capnography study](https://pubmed.ncbi.nlm.nih.gov/37030832/) provides background, not calibration of the chosen mixing fraction.

Regional CO₂ evolves separately with equal baseline exchange weights. Slower emptying and unequal ventilation can produce higher CO₂ in the slow region and an upward plateau through changing regional contributions. Both regions start at the same CO₂ unless a baseline state is resumed; the plateau difference therefore develops over time. A prescribed shark-fin shape is not forced onto the dynamic signal. [Sequential ventilation-inhomogeneity study](https://publications.ersnet.org/content/erjor/8/1/00440-2021) supports the concept. Added regional ratios (4:1 in COPD-like/high-compliance examples, 6:1 in bronchospasm-like) are illustrative, not disease-fitted parameters.

With unequal regions, the displayed alveolar-pressure curve and intrinsic PEEP are compliance-weighted elastic means. Individual end-expiratory pressures and regional CO₂ are reported separately. A VCV end-hold airway pressure can differ from its eventual equilibrated plateau while internal redistribution continues; the UI labels this as end-hold pressure. Equilibrated elastic driving pressure is VT/total C; instantaneous resistive drop is R×flow at hold onset. Waveforms, loop plots, mean pressures, expiration fractions and steady initialization all use the regional mechanics.

Teaching defaults are resting alveolar volume 2.5 L, tissue-equivalent storage 20 L, initial alveolar CO₂ 40 mmHg, airway dead space 150 mL and production 200 mL/min STPD. Baseline equivalent lung/tissue exchange conductance is 0.5 L/s (not blood flow). Gas amounts use L BTPS; the sea-level STPD conversion is 863/713. Tissue-equivalent storage is buffering expressed in gas-volume units, not anatomical tissue volume. **VD now means transported airway dead space**, replacing the old steady estimator's physiologic-dead-space interpretation. Regional ventilation differences can create unequal CO₂ concentrations, but there is no separate alveolar-dead-space compartment, blood-perfusion network, shunt, circulatory delay or acid–base chemistry. Low ventilation may retain CO₂ while producing a small expired tracing. These values and kinetics are illustrative, not clinically validated.

Each settings edit reruns from the initial conditions. To study a ventilation change from an existing CO₂ state, freeze a baseline, change ventilation and choose **Start CO₂ from baseline end** under **CO₂ & capnogram options**. The new run starts with the frozen selected breath's end lung/tissue concentrations, sensor value and airway parcels (mixed to the previous mean if airway volume changes); mechanics restart separately. Reset restores the initial-pressure start. This state is local to the page; shared URLs retain parameter values but do not transfer gas history.

Optional legacy reference/obstructive capnogram shapes remain illustrative overlays with the evolving breath amplitudes. Their prescribed time fractions and resistance mapping are not validated physiology. Dynamic airway transport is the mass-audited default. Background: [lung/tissue CO₂ mass-balance modeling](https://pmc.ncbi.nlm.nih.gov/articles/PMC4737892/), [body gas-store modeling](https://pmc.ncbi.nlm.nih.gov/articles/PMC8354828/) and [bronchospasm capnogram case study](https://pmc.ncbi.nlm.nih.gov/articles/PMC10115549/). These papers do not validate this implementation or its defaults.

**Acute events** demonstrate a baseline, sudden change and recovery on the same timeline. Open **Practice an acute event**, choose an event, then **Load settled reference** for a 120 s run with onset at 30 s and recovery at 90 s. Reference severity is scenario-specific (table below). The reference uses VT 500 mL / PC 10.4 cm H₂O, rate 12/min and a VC pressure ceiling of 40 cm H₂O. Press Play, or inspect a time before onset and use **Trigger now**; **Resolve event** moves recovery to the active inspected/playback time. These actions recompute the trajectory from the same cached baseline, preserving the preceding history. Onset/recovery split mechanical segments exactly, including within a breath. Regional volumes, lung/tissue CO₂, airway gas and sensor state carry through both boundaries. Recovery restores baseline mechanics; retained CO₂ can cause a rebound, and insufflation uptake has a separate decay tail.

Event baselines warm off-screen in whole breaths until tissue/sensor endpoint changes are below 0.05 mmHg per batch, with at least three batches and at most 24 batches of up to six breaths (each batch no longer than 120 s). The status reports whether settling completed; cycles longer than 120 s cannot be warmed this way. A four-entry cache avoids repeating warmup when changing event timing/severity. Event mode requires dynamic transport and supersedes the ordinary initial-state and frozen-baseline continuation controls. Ordinary simulator behavior is retained with **No event** and a VC ceiling of 0 (ideal delivery). Switching a PC event into VC supplies a 40 cm H₂O ceiling if none was set; complete common-airway closure requires a finite VC ceiling.

Severity is a teaching scale, not an anatomical percentage or fitted clinical dose. Bronchospasm multiplies the two regions' inspiratory resistance by `1 + [18, 80] × s²` and expiratory resistance by `1 + [35, 160] × s²`. A kink or common mucus plug adds series resistance `R × (1001^s − 1)`; severity 1 closes the common airway. A regional mucus plug multiplies the second region's resistance by `1 + 999s⁴`, with that branch closed at 1. Pulmonary CO₂ delivery in the venous-air-embolism scenario scales equivalent lung/tissue exchange by `(1 − s)²` while metabolic production continues and airway mechanics remain unchanged. This is a delivery/perfusion surrogate, not a bubble, blood-flow or circulation model. Bronchospasm and plugging need not always lower EtCO₂; the resulting signal depends on actual expired gas reaching the sensor. Pressure, delivered/expired volume and flow help distinguish mechanisms, but patterns overlap. [Bronchospasm case observations](https://pmc.ncbi.nlm.nih.gov/articles/PMC12340691/) and [venous-air-embolism observations](https://pubmed.ncbi.nlm.nih.gov/22383084/) support qualitative teaching patterns, not these numerical mappings.

The event catalog in `ventilation_scenarios.js` is the single source for names, menu groups, concise expected patterns, detailed limitations, references and reference severities. The grouped menu adds no extra controls to the main view. Sources appear inside each event's **How this event works** section. Short event labels keep waveform markers readable on phones.

| Added event                         | Implemented teaching mechanism (`s` = severity)                                                                                                                                        | Reference severity | Background sources                                                                                                                           |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Malignant hyperthermia              | Metabolic CO₂ production ramps from baseline toward `1 + 4s` times baseline with a 15 s time constant; recovery restores baseline production.                                          | 0.75               | [EMHG recognition guidance](https://www.emhg.org/recommendations-1/2024/11/4/recognising-and-managing-a-malignant-hyperthermia-crisis-v2024) |
| Hypotension with low cardiac output | Both regions' exchange conductances scale by `(1 − 0.9s)²`; metabolism and airway mechanics remain unchanged. Represents low output, not hypotension from isolated vasodilation.       | 0.7                | [Clinical exhaled CO₂ / cardiac-output study](https://pubmed.ncbi.nlm.nih.gov/31281675/)                                                     |
| Pulmonary embolism                  | Regional exchange conductances scale by `[(1 − 0.65s)², (1 − s)²]`: unequal underperfusion with continued ventilation and reduced overall delivery.                                    | 0.85               | [Intraoperative PE observations](https://pmc.ncbi.nlm.nih.gov/articles/PMC10333629/)                                                         |
| Abdominal CO₂ insufflation          | Each regional compliance scales by `1 − 0.4s`; absorbed CO₂ approaches `100s` mL/min STPD over a 30 s time constant and decays over 30 s after release.                                | 0.8                | [Pneumoperitoneum mechanics](https://pubmed.ncbi.nlm.nih.gov/27324326/), [CO₂ absorption](https://pubmed.ncbi.nlm.nih.gov/1394755/)          |
| Mainstem ETT                        | Access to the second region decreases with conductance factor `1 − s`; at 1 that branch is isolated while the other remains ventilated. Gas exchange continues in the isolated region. | 1                  | [Endobronchial intubation trial](https://www.bmj.com/content/341/bmj.c5943)                                                                  |
| CO₂ rebreathing / circuit fault     | Inspired CO₂ is `12s` mmHg at the airway inlet, raising the inspired tracing baseline through transported gas.                                                                         | 0.7                | [Circle-system rebreathing case](https://pubmed.ncbi.nlm.nih.gov/16491902/)                                                                  |
| Acute compliance loss / edema-like  | Both regional compliances scale by `1 − 0.7s`, without an additional gas source.                                                                                                       | 0.75               | [Experimental edema/compliance study](https://pmc.ncbi.nlm.nih.gov/articles/PMC3028256/)                                                     |

These references support qualitative mechanisms; none calibrates the severity mappings or the compressed 120 s demonstration. Other existing events retain reference severity 0.85. Mainstem and regional plugging can have overlapping waveforms and a persistent EtCO₂ signal. All regions retain their fixed reference resting gas volume; compliance changes alter elastic pressure immediately while volume and CO₂ remain continuous. Displayed intrinsic and end-inspiratory pressures use event compliance, rather than the baseline value. No temperature, rigidity, blood pressure, cardiac output, clot, pulmonary vascular pressure, oxygenation, recruitment, fluid, pleural-pressure or disease-specific treatment model is present. A capnogram alone cannot establish the cause.

The CO₂ audit now separates metabolic `produced`, peritoneal `absorbed`, and external-circuit `inspired` input. The balance is `stored + exhaled + circuitLoss − initialMass − produced − absorbed − inspired`. Rebreathing prescribes inlet gas composition rather than modeling a closed breathing circuit or absorber chemistry; the inspired input is external to the modeled gas stores. Low pulmonary delivery does not reduce metabolic production, and added CO₂ affects the transported gas rather than applying a display offset. Resolving an event restores its baseline coefficients but does not erase retained gas.

The VC ceiling is an absolute airway pressure above atmosphere, must exceed set PEEP and requires dynamic CO₂ transport. During inspiration, delivery follows commanded flow until the ceiling is reached, then follows pressure-limited filling; delivered volume can fall below set VT. The two-state affine mechanical solution is exact within each phase/event/cap segment. Gas transport uses adaptive substeps. During complete common-airway closure, lung and distal airway gas stay trapped; fresh circuit gas washes the proximal mixing/sampling compartment at an illustrative 0.1 L/s. This is an explicit circuit/sensor assumption, not a full breathing-circuit simulation. Its CO₂ loss is separately audited as `circuitLoss`. Event scenarios suppress the fixed Pa–Et arterial estimate and instead show tissue-equivalent store pressure, explicitly **not PaCO₂**. All event kinetics, severity mappings and the reference ceiling are educational assumptions, not clinically calibrated predictions or recommended settings.

Example mechanics use resistance in cm H₂O/(L/s) and compliance in mL/cm H₂O:

| Example                               | Inspiratory / expiratory resistance | Compliance | Fast / slow expiratory constants |
| ------------------------------------- | ----------------------------------- | ---------- | -------------------------------- |
| Reference                             | 10 / 10                             | 50         | 0.5 / 0.5 s                      |
| COPD-like obstruction                 | 20 / 20                             | 60         | 0.75 / 3 s                       |
| Bronchospasm-like resistance increase | 30 / 30                             | 50         | 0.875 / 5.25 s                   |
| Low compliance                        | 10 / 10                             | 25         | 0.25 / 0.25 s                    |
| High compliance with obstruction      | 20 / 20                             | 100        | 1.25 / 5 s                       |

The COPD-like combination is supported by a [2024 PCV bench study](https://pmc.ncbi.nlm.nih.gov/articles/PMC11107031/). The low-compliance combination comes from a [2021 respiratory mechanics bench study](https://pmc.ncbi.nlm.nih.gov/articles/PMC7925949/). Bronchospasm-like and high-compliance examples are illustrative choices, not validated disease models. Shortening expiration relative to its time constant demonstrates incomplete emptying and intrinsic PEEP. The model assumes two passive linear regions and does not reproduce dynamic airway collapse, expiratory flow limitation, anatomical lung complexity, full clinical gas exchange, or patient effort. These are teaching mechanics, not recommended ventilator settings.

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
- `tests/site.browser.html` checks landing-page navigation, both legacy ventilator redirects into the unified simulator, and the inhalational simulator.
- `tests/recovery.browser.html` checks timed targets, exact TCI replay, file compatibility, and local recovery across reloads, including invalid edits and unavailable storage.
- `tests/editing.browser.html` checks shared validation, timeline editing, offscreen error navigation, Undo/Redo, history limits, and recovery at the current history position. It also runs `tests/engine.worker.js` to verify analytical solutions and TCI replay with no document or application UI loaded.
- `tests/results.browser.html` checks cache reuse, chart-only updates, cursor values, results CSV data and metadata, TCI status, physical replay comparison, and provenance round-trips. Standalone engine checks also verify cumulative dose and sampling around bolus discontinuities.
- `tests/ventilation.browser.html` checks the unified interface, validation, mode switching without navigation, target retention, shared-URL restoration, baselines, chart-only updates, presets, and mobile layout. Its standalone worker checks analytical phase solutions, boundary handling, volume conservation, pressure measurements, short time constants, partial breaths, and air trapping.
- `tests/ventilation_features.browser.html` checks timing entry, playback, loop inspection, annotations, aligned comparisons and continued CO₂ starts. The ventilation worker also audits CO₂ mass balance, washout, production changes, zero/tiny dead space, high-flow steps and sensor continuity.
- `tests/ventilation_events.browser.html` checks event controls in both modes, all added clinical references and sources, immediate onset/recovery, playback history, validation, mode switching, shared URLs and mobile layout. Its independent worker checks analytical pressure-limited delivery, event-boundary continuity, regional/common obstruction, reduced pulmonary delivery, metabolic/absorbed/inspired CO₂ sources, compliance changes, zero severity, CO₂ mass balance and sampling convergence.

Install Node.js 22 or later, Python 3, and Chromium or Google Chrome. From the repository root, run:

```bash
npm ci
npm run check
```

This checks formatting, generated presets, local links and anchors, duplicate IDs, and all nine browser suites, including the full-length TCI tests. It serves the repository temporarily on localhost and uses a separate browser profile for each suite. `npm run format` formats maintained source files. GitHub Actions runs the same checks for pushes and pull requests using `.github/workflows/checks.yml`.

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
