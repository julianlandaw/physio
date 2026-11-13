/* Copyright (c) 2026 Julian W. Landaw | SPDX-License-Identifier: MIT */
let modelProvenance = null;

function registryModelProvenance(drugId) {
  const drug = PHYSIO_DRUG_REGISTRY.drugs.find((item) => item.id === drugId);
  if (!drug) return unknownModelProvenance(null);
  return {
    ...structuredClone(drug.provenance),
    origin: 'registry',
    registryId: PHYSIO_DRUG_REGISTRY.id,
    registryRevision: PHYSIO_DRUG_REGISTRY.revision,
    modelRevision: drug.revision,
  };
}

function unknownModelProvenance(drugId, origin = 'custom') {
  const label = PHYSIO_DRUG_REGISTRY.drugs.find((drug) => drug.id === drugId)?.label;
  return {
    origin,
    registryId: '',
    registryRevision: '',
    modelId: drugId ? `physio-${drugId}` : 'custom',
    modelName: label ? `${label} — saved parameters` : 'Custom parameters',
    modelRevision: '',
    populationAssumptions:
      'Population assumptions were not recorded. Review the supplied numerical parameters.',
    reviewStatus:
      origin === 'legacy'
        ? 'Older regimen: model revision and references were not recorded'
        : 'User-supplied model; source applicability has not been verified',
    references: [],
    notes: '',
  };
}

function currentProvenance() {
  return {
    ...structuredClone(modelProvenance || unknownModelProvenance(currentDrug)),
    parametersModified: Boolean(presetIsModified),
  };
}

function provenanceReferenceHref(href) {
  if (['drug_registry.json', 'druginfo.txt'].includes(href)) return href;
  try {
    const url = new URL(href);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch (error) {
    return null;
  }
}

function validateModelProvenance(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Model provenance must be an object.');
  const string = (key, limit = 2000) => {
    if (typeof value[key] !== 'string' || value[key].length > limit)
      throw Error(`Invalid model provenance ${key}.`);
    return value[key];
  };
  const result = Object.fromEntries(
    [
      'origin',
      'registryId',
      'registryRevision',
      'modelId',
      'modelName',
      'modelRevision',
      'populationAssumptions',
      'reviewStatus',
      'notes',
    ].map((key) => [key, string(key)]),
  );
  if (!['registry', 'legacy', 'custom'].includes(result.origin))
    throw Error('Unknown model provenance origin.');
  if (!Array.isArray(value.references) || value.references.length > 20)
    throw Error('Use at most 20 model references.');
  result.references = value.references.map((reference) => {
    if (
      !reference ||
      ['title', 'href', 'role'].some(
        (key) => typeof reference[key] !== 'string' || reference[key].length > 2000,
      ) ||
      !provenanceReferenceHref(reference.href)
    )
      throw Error('Invalid model source reference.');
    return { title: reference.title, href: reference.href, role: reference.role };
  });
  return result;
}

function renderModelProvenance() {
  const source = currentProvenance();
  const container = document.getElementById('modelProvenance');
  container.replaceChildren();
  const list = document.createElement('dl');
  const items = [
    ['Model', source.modelName],
    ['Model identifier', source.modelId],
    ['Parameter revision', source.modelRevision || 'Not recorded'],
    ['Registry revision', source.registryRevision || 'Not recorded'],
    [
      'Parameter status',
      source.parametersModified
        ? 'Modified after selecting or loading this model'
        : 'Parameters as selected or loaded',
    ],
    ['Simulation population assumptions', source.populationAssumptions],
    ['Source review', source.reviewStatus],
  ];
  items.forEach(([label, value]) => {
    const term = document.createElement('dt'),
      description = document.createElement('dd');
    term.textContent = label;
    description.textContent = value;
    list.append(term, description);
  });
  container.append(list);
  const references = document.createElement('ul');
  source.references.forEach((reference) => {
    const item = document.createElement('li'),
      link = document.createElement('a'),
      role = document.createElement('small');
    link.textContent = reference.title;
    link.href = provenanceReferenceHref(reference.href);
    role.textContent = reference.role;
    item.append(link, role);
    references.append(item);
  });
  container.append(references);
}
