<!--
Copyright (c) 2026 Julian W. Landaw
SPDX-License-Identifier: MIT
-->

# Physio

Physio is a static educational website containing interactive physiology and pharmacology simulations. It is designed for exploration and teaching; it is not a clinical decision-support system and does not provide patient-specific dosing advice.

## Included tools

- **Three-compartment pharmacokinetic model** — `docs/Pharmacology/threecompartmentmodel.html`
  - Selectable drug presets, custom PK parameters, and clearance or microconstant input modes.
  - Bolus, infusion, and multi-event dosing schedules.
  - Central plasma (Cp), effect-site (Ce), distribution-compartment, half-life, and comparison views.
  - Direct timeline editing: click to add a bolus, drag to add an infusion, and click an event to remove it.
  - Printable simulation report and dark/log-scale display controls.
- **Respiratory simulations** — pressure-control and volume-control tools in `docs/Respiratory/`.
- **Supporting educational material** — pages, notebooks, source PDFs, and parameter tables under `docs/`.

## Run locally

The site is static. Serve the `docs/` directory from a local web server so browser loading behavior matches deployment:

```bash
python3 -m http.server 8000 --directory docs
```

Then open [http://localhost:8000/Pharmacology/threecompartmentmodel.html](http://localhost:8000/Pharmacology/threecompartmentmodel.html).

## Using the three-compartment model

1. Choose a preset from the grouped drug picker, or choose **Custom model** to retain and edit the current values.
2. Use the **Quick setup: patient & dosing** panel for patient weight, units, bolus amount, and infusion rate/duration.
3. Review the graph and the Current Regimen panel. The main panel also has quick bolus and infusion amount controls.
4. For multiple dosing events, enable **Dosing Schedule**, use the schedule tables, or edit directly on the dosing timeline:
   - Click empty timeline space to add a bolus.
   - Drag across empty timeline space to add an infusion segment.
   - Click a dose marker/bar to remove it.
5. Use **Compare Strategies** to save and overlay alternative regimens.

When a timeline edit is made, the model converts the simple regimen into an editable schedule. The schedule table remains the precise, keyboard-accessible way to refine event times, doses, and rates.

## Project layout

```text
docs/
├── Pharmacology/
│   ├── threecompartmentmodel.html   # Application markup
│   ├── anesthetic_drug_pk_parameters.csv
│   ├── anesthetic_drug_pk_microconstants.csv
│   ├── DrugModels/                  # Reference material and source PDFs
│   └── CoPilotHelp/                 # Supporting data and working material
├── Respiratory/                     # Respiratory simulations
└── assets/
    ├── js/threecompartmentmodel.js  # Model, UI state, and interactions
    └── css/threecompartmentmodel.css # Model-specific styling
```

The pharmacology page loads its model code and styles from:

- `docs/assets/js/threecompartmentmodel.js`
- `docs/assets/css/threecompartmentmodel.css`

It also uses locally vendored Math.js, Plotly, Bootstrap, and jQuery assets.

## Development notes

- The model uses minutes for time. Units displayed in the UI are converted internally as needed.
- Drug presets and model notes are listed in the application and in `docs/Pharmacology/anesthetic_drug_pk_parameters.csv`.
- Keep solver/model changes separate from UI-only changes whenever possible.
- For a basic static check after editing, verify the HTML and inspect the page in a browser. `git diff --check` is useful for detecting whitespace errors.

## Clinical and model limitations

The simulations are educational visualizations. They do not replace current prescribing information, local policy, validated clinical dosing tools, clinician judgment, or patient-specific assessment. Preset assumptions may not apply to every population or clinical scenario. Review source material in `docs/Pharmacology/DrugModels/` and verify parameters before using them for teaching or research.

## Copyright and licensing

Copyright © 2026 Julian W. Landaw. This repository's original code is available under the [MIT License](LICENSE).

For clear ownership and reuse terms, the recommended approach is:

1. The repository-level `LICENSE` file contains the reuse terms for the original project code.
2. Original maintained HTML, JavaScript, and CSS files carry a short copyright/SPDX header; vendored third-party libraries and generated outputs are left unchanged.
3. Retain existing third-party notices and licenses for Math.js, Plotly, Bootstrap, jQuery, and any other external material.

The project header used for original JavaScript, CSS, HTML, and source files is:

```text
Copyright (c) 2026 Julian W. Landaw
SPDX-License-Identifier: MIT
```

Third-party code and assets retain their own notices and licenses.
