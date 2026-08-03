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

| Item | Purpose |
| --- | --- |
| `pharmacology.html` | Landing page for the pharmacology section. |
| `threecompartmentmodel.html` | Main interactive three-compartment pharmacokinetic model. |
| `inhalational_anesthesia.html` | Interactive educational simulator of volatile-anesthetic wash-in, uptake, distribution, and washout. |
| `inhalational_anesthesia.tex` | Detailed physiology and mathematical derivation for the inhalational-anesthesia simulator. |
| `csht_three_compartment_web_simulator.html` | Compact context-sensitive half-time simulator. |
| `anesthetic_drug_pk_parameters.csv` | Preset clearance/volume parameters and notes. |
| `anesthetic_drug_pk_microconstants.csv` | Derived microconstant parameter table. |
| `druginfo.txt` | Supporting drug information. |
| `DrugModels/` | Drug-specific source PDFs/text and related PK reference material. |
| `CoPilotHelp/` | Working data, preset exports, therapeutic-range data, and reference plots used during model development. |

#### Three-compartment model

The main model is implemented by:

- `docs/Pharmacology/threecompartmentmodel.html` — application markup and local library references.
- `docs/assets/js/threecompartmentmodel.js` — PK/PD solver, drug presets, schedule handling, graph creation, comparison workflow, validation, export, and UI logic.
- `docs/assets/css/threecompartmentmodel.css` — responsive dashboard layout, drawer, graph/timeline, dark mode, and print styling.

Key capabilities include:

- Grouped drug-preset selection or custom PK input.
- Clearance/volume or microconstant model entry.
- Weight-aware unit conversion for bolus and infusion dosing.
- Basic bolus/infusion regimen plus multi-event schedules.
- Editable dosing timeline: click to add a bolus, drag to add an infusion, and click an event to remove it.
- Direct main-screen bolus and infusion-rate controls.
- Cp/Ce concentration plots, distribution-compartment plots, half-life metrics, comparisons, therapeutic-range overlays where available, dark mode, log Y-axis, and PDF export.

The parameter tables and `DrugModels/` are reference resources. Preset/model assumptions must be reviewed before teaching or research use.

### `docs/Respiratory/`

This directory contains self-contained respiratory physiology pages:

| File | Purpose |
| --- | --- |
| `respiratory.html` | Respiratory ventilator physiology overview. |
| `pressure_control_simulator.html` | Interactive pressure-control ventilator simulator. |
| `volume_control_simulator.html` | Interactive volume-control ventilator simulator. |

Their supporting JavaScript is in `docs/assets/js/pressurecontrol.js` and `docs/assets/js/volumecontrol.js`. Related diagrams are in `docs/assets/imgs/`.

### `docs/PhysiologyDiscussion/`

This directory contains longer-form teaching material:

- `Physiology.tex` — LaTeX source document.
- `RespiratoryPhysiology.ipynb` — Jupyter notebook.
- `Physiology.log`, `Physiology.tex.bbl`, and `Physiology.tex.blg` — generated LaTeX build artifacts.

Edit the `.tex` or `.ipynb` sources rather than generated LaTeX outputs.

### `docs/assets/`

Shared website resources are organized as follows:

| Directory/file | Purpose |
| --- | --- |
| `assets/css/` | Compiled styles. `threecompartmentmodel.css` is model-specific; `threecompartmentmodel_old.css` is the prior model stylesheet. `steller.css` is the shared site theme. |
| `assets/js/` | Original simulation scripts plus local Math.js, Plotly, and Steller theme scripts. |
| `assets/scss/` | Source SCSS for the shared Steller theme and its Bootstrap dependency. |
| `assets/imgs/` | Site images, diagrams, SVGs, GIFs, and video media. |
| `assets/pdfs/` | Site PDF material, including the CV. |
| `assets/vendors/` | Vendored Bootstrap, jQuery, and Themify Icons assets. |

Do not edit minified or vendored files unless deliberately upgrading a dependency. Prefer changing the original page, its dedicated script, or its dedicated stylesheet.

## Development workflow

- Use the page-specific HTML, CSS, and JavaScript for interface/model work.
- Keep solver or parameter changes separate from presentation-only changes when possible.
- Preserve vendor files and third-party license notices.
- Preserve source PDFs and generated artifacts unless the task explicitly calls for changing them.
- Open affected pages in a browser after changes; run `git diff --check` to catch whitespace errors.

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
