/* Copyright (c) 2026 Julian W. Landaw | SPDX-License-Identifier: MIT */
// Cache only physical simulation inputs. Names, units, provenance, and display
// settings are presentation data; no result is cached for an invalid UI form.
const simulationResultsCache = new Map();
const SIMULATION_CACHE_LIMIT = 12;
const SIMULATION_CACHE_SAMPLE_LIMIT = 200000;
const SIMULATION_CACHE_KEY_LIMIT = 4 * 1024 * 1024;
let latestSimulationContext = null;

function getSimulationResult(state) {
  const input = prepareSimulationInput(state);
  const key = JSON.stringify(input);
  if (simulationResultsCache.has(key)) {
    const result = simulationResultsCache.get(key);
    simulationResultsCache.delete(key);
    simulationResultsCache.set(key, result);
    return result;
  }
  const simulation = simulatePkModel(input);
  const result = {
    input,
    simulation,
    modelRates: computeModelRates(input.pk),
    contextHalfTime: contextSensitiveHalfTime(simulation, input.pk),
  };
  simulationResultsCache.set(key, result);
  let samples = 0,
    characters = 0;
  for (const [storedKey, value] of simulationResultsCache) {
    samples += value.simulation.ts.length;
    characters += storedKey.length;
  }
  while (
    simulationResultsCache.size > 1 &&
    (simulationResultsCache.size > SIMULATION_CACHE_LIMIT ||
      samples > SIMULATION_CACHE_SAMPLE_LIMIT ||
      characters > SIMULATION_CACHE_KEY_LIMIT)
  ) {
    const oldestKey = simulationResultsCache.keys().next().value;
    samples -= simulationResultsCache.get(oldestKey).simulation.ts.length;
    characters -= oldestKey.length;
    simulationResultsCache.delete(oldestKey);
  }
  return result;
}

function setResultsValidity(valid) {
  document.getElementById('exportResultsCsvBtn').disabled = !valid;
  document.getElementById('inspectorNotice').textContent = valid
    ? 'Predicted values for the current regimen. Select a time here or click either chart.'
    : 'Values reflect the last valid regimen. Correct the highlighted inputs to update them.';
}
