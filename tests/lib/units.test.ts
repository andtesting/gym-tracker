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

  it('converts entered lb back to kg, rounded to 3dp', () => {
    expect(displayToKg(135, 'lb')).toBe(61.235);
    expect(displayToKg(220.46, 'lb')).toBe(99.999);
  });

  it('round-trips kg -> lb -> kg within a rounding tolerance', () => {
    for (const kg of [20, 62.5, 100, 142.5]) {
      const back = displayToKg(kgToDisplay(kg, 'lb'), 'lb');
      expect(Math.abs(back - kg)).toBeLessThan(0.01);
    }
  });

  it('provides header labels', () => {
    expect(unitHeader('kg')).toBe('Kg');
    expect(unitHeader('lb')).toBe('Lb');
  });
});
