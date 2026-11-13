/* Copyright (c) 2026 Julian W. Landaw | SPDX-License-Identifier: MIT */
const VENTILATION_CASES = [
  {
    id: 'reference',
    label: 'Reference mechanics',
    R: 10,
    C: 50,
    note: 'Original site reference: R 10 cm H₂O/(L/s), C 50 mL/cm H₂O. This is a comparison baseline, not a universal normal patient.',
  },
  {
    id: 'copd',
    label: 'COPD-like obstruction',
    R: 20,
    C: 60,
    note: 'R 20, C 60: a published COPD bench-model combination. Look for slower expiratory flow decay and more retained volume as expiration is shortened. This passive compartment does not reproduce dynamic airway collapse or flow limitation.',
    source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11107031/',
    sourceLabel: '2024 PCV mechanics bench study',
  },
  {
    id: 'bronchospasm',
    label: 'Bronchospasm-like resistance increase',
    R: 30,
    C: 50,
    note: 'Illustrative choice: increase R to 30 while retaining C 50. Look for a larger resistive pressure contribution in VCV and lower delivered volume in PCV. This is an isolated resistance demonstration, not a validated bronchospasm parameter set.',
    source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7925949/',
    sourceLabel: 'Background: obstructive bench-model mechanics (R 20, C 50)',
  },
  {
    id: 'low-compliance',
    label: 'Low compliance / restrictive-like',
    R: 10,
    C: 25,
    note: 'R 10, C 25: a restrictive bench-model combination. For the same volume, the elastic pressure contribution increases; for the same pressure, delivered volume falls. It does not represent a complete ARDS model.',
    source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7925949/',
    sourceLabel: '2021 respiratory mechanics bench study',
  },
  {
    id: 'high-compliance',
    label: 'High compliance with obstruction',
    R: 20,
    C: 100,
    note: 'Illustrative R 20, C 100: the expiratory time constant is 2 s. Use it to explore how slower emptying changes retained volume. This is not a validated emphysema model.',
  },
];
