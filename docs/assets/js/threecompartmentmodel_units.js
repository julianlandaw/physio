/* Copyright (c) 2026 Julian W. Landaw | SPDX-License-Identifier: MIT */

function parseFloatSafe(v, defVal = 0) {
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : defVal;
}

function clamp(x, lo, hi) {
  return Math.min(Math.max(x, lo), hi);
}

function roundToSignificantFigures(num, sigFigs) {
  if (num === 0) return 0;
  const magnitude = math.floor(math.log10(Math.abs(num)));
  const factor = 10 ** (sigFigs - magnitude - 1);
  return math.round(num * factor) / factor;
}

const UNITS = {
  'mg/mL': { name: 'mg/mL', factor: 1 },
  'µg/mL': { name: 'µg/mL', factor: 1e3 },
  'ng/mL': { name: 'ng/mL', factor: 1e6 },
};

function formatInputValue(value) {
  return Number.isFinite(value) ? String(roundToSignificantFigures(value, 10)) : '';
}

const BOLUSUNITS = {
  'mg/kg': { name: 'mg/kg', factor: 1, perKg: true },
  'µg/kg': { name: 'µg/kg', factor: 1e3, perKg: true },
  'ng/kg': { name: 'ng/kg', factor: 1e6, perKg: true },
  mg: { name: 'mg', factor: 1, perKg: false },
  µg: { name: 'µg', factor: 1e3, perKg: false },
  ng: { name: 'ng', factor: 1e6, perKg: false },
};

const INFUSIONUNITS = {
  'mg/kg/min': { name: 'mg/kg/min', factor: 1, perKg: true },
  'µg/kg/min': { name: 'µg/kg/min', factor: 1e3, perKg: true },
  'ng/kg/min': { name: 'ng/kg/min', factor: 1e6, perKg: true },
  'mg/kg/hr': { name: 'mg/kg/hr', factor: 60.0, perKg: true },
  'µg/kg/hr': { name: 'µg/kg/hr', factor: 1e3 * 60.0, perKg: true },
  'ng/kg/hr': { name: 'ng/kg/hr', factor: 1e6 * 60.0, perKg: true },
  'mg/min': { name: 'mg/min', factor: 1, perKg: false },
  'µg/min': { name: 'µg/min', factor: 1e3, perKg: false },
  'ng/min': { name: 'ng/min', factor: 1e6, perKg: false },
  'mg/hr': { name: 'mg/hr', factor: 60.0, perKg: false },
  'µg/hr': { name: 'µg/hr', factor: 1e3 * 60.0, perKg: false },
  'ng/hr': { name: 'ng/hr', factor: 1e6 * 60.0, perKg: false },
};

function convertBolusValueToMgKg(value, unitObj, weightKg) {
  const normalized = parseFloatSafe(value, 0) / (unitObj?.factor ?? 1);
  if (unitObj?.perKg) return normalized;
  return normalized / Math.max(weightKg, 1e-9);
}

function convertInfusionValueToMgKgMin(value, unitObj, weightKg) {
  const normalized = parseFloatSafe(value, 0) / (unitObj?.factor ?? 1);
  if (unitObj?.perKg) return normalized;
  return normalized / Math.max(weightKg, 1e-9);
}

function convertMgKgToBolusValue(valueMgKg, unitObj, weightKg) {
  const perKgValue = unitObj?.perKg ? valueMgKg : valueMgKg * weightKg;
  return perKgValue * (unitObj?.factor ?? 1);
}

function convertMgKgMinToInfusionValue(valueMgKgMin, unitObj, weightKg) {
  const perKgValue = unitObj?.perKg ? valueMgKgMin : valueMgKgMin * weightKg;
  return perKgValue * (unitObj?.factor ?? 1);
}
