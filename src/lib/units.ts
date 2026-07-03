import type { WeightUnit } from './settings';

const KG_PER_LB = 0.45359237;

function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

export function round2(n: number): number {
  return round(n, 2);
}

// Storage is ALWAYS kg; the unit converts at the render/entry boundary only.
export function kgToDisplay(kg: number, unit: WeightUnit): number {
  return unit === 'kg' ? kg : round(kg / KG_PER_LB, 2);
}

// Rounded to 2dp: a 2dp lb display value is within 0.0023 kg of the original,
// so rounding back to 2dp recovers the stored kg EXACTLY. 3dp here would make
// the round-trip drift upward (60 kg -> 132.28 lb -> 60.001 kg) and fire
// false PR badges on unchanged prefills.
export function displayToKg(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? value : round(value * KG_PER_LB, 2);
}

export function formatWeight(kg: number, unit: WeightUnit): string {
  return String(kgToDisplay(kg, unit));
}

// Column-header / label form ("Kg" | "Lb"): the unit lives in the header so
// rows can show bare numbers without overlapping on narrow screens.
export function unitHeader(unit: WeightUnit): string {
  return unit === 'kg' ? 'Kg' : 'Lb';
}

export function unitLabel(unit: WeightUnit): string {
  return unit;
}
