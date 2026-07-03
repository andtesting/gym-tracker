import { describe, it, expect } from 'vitest';
import { kgToDisplay, displayToKg, formatWeight, unitHeader } from '../../src/lib/units';

describe('units', () => {
  it('kg display is identity', () => {
    expect(kgToDisplay(62.5, 'kg')).toBe(62.5);
    expect(displayToKg(62.5, 'kg')).toBe(62.5);
    expect(formatWeight(62.5, 'kg')).toBe('62.5');
  });

  it('converts kg to lb for display, rounded to 2dp', () => {
    expect(kgToDisplay(60, 'lb')).toBe(132.28);
    expect(kgToDisplay(100, 'lb')).toBe(220.46);
  });

  it('converts entered lb back to kg, rounded to 2dp', () => {
    expect(displayToKg(135, 'lb')).toBe(61.23);
    expect(displayToKg(220.46, 'lb')).toBe(100);
  });

  it('round-trips a stored 2dp kg value exactly (no false PR drift)', () => {
    for (const kg of [20, 25, 30, 45, 60, 62.5, 75, 90, 105, 125, 140, 73.64]) {
      expect(displayToKg(kgToDisplay(kg, 'lb'), 'lb')).toBe(kg);
    }
  });



  it('provides header labels', () => {
    expect(unitHeader('kg')).toBe('Kg');
    expect(unitHeader('lb')).toBe('Lb');
  });
});
