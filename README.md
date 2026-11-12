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
- `docs/assets/js/threecompartmentmodel.js` — PK/PD solver, graph creation, comparison workflow, validation, export, and UI coordination.
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
- Editable dosing timeline: click to add a bolus, drag to add an infusion, and select an event to edit, duplicate, or delete it.
- Direct main-screen bolus and infusion-rate controls.
- Cp/Ce concentration plots, distribution-compartment plots, half-life metrics, comparisons, therapeutic-range overlays where available, dark mode, log Y-axis, and PDF export.
- Chart time-window controls and retained zoom during routine edits; reference ranges appear in a separate key below the graph.

`drug_registry.json` is the sole live source for both simulators and the two CSV parameter tables. After changing it, run:

```bash
python3 scripts/generate_presets.py
```

The generator derives microconstants from clearance and volume values and updates the browser data and both CSVs together. `python3 scripts/generate_presets.py --check` detects stale generated outputs. Historical `CoPilotHelp/` exports and `DrugModels/` remain reference resources. Preset/model assumptions must be reviewed before teaching or research use.

### `docs/Respiratory/`

This directory contains self-contained respiratory physiology pages:

| File                              | Purpose                                            |
| --------------------------------- | -------------------------------------------------- |
| `respiratory.html`                | Respiratory ventilator physiology overview.        |
| `pressure_control_simulator.html` | Interactive pressure-control ventilator simulator. |
| `volume_control_simulator.html`   | Interactive volume-control ventilator simulator.   |

Each ventilator simulator contains its controls, solver, and SVG chart code in its HTML page. Related diagrams are in `docs/assets/imgs/`.

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

Install Node.js 22 or later, Python 3, and Chromium or Google Chrome. From the repository root, run:

```bash
npm ci
npm run check
```

This checks formatting, generated presets, local links and anchors, duplicate IDs, and all four browser suites, including the full-length TCI tests. It serves the repository temporarily on localhost and uses a separate browser profile for each suite. `npm run format` formats maintained source files. GitHub Actions runs the same checks for pushes and pull requests using `.github/workflows/checks.yml`.

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
